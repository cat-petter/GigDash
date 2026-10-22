import type { Prisma } from "@/generated/prisma/client";
import { dateToDay } from "./dates";
import { db } from "./db";
import {
  countSpellings,
  DEFAULT_RULES,
  groupNames,
  type MatchRules,
  type NameGroup,
  type NameKind,
  type Names,
  NEW_NAME,
  type SavedName,
} from "./names";

export const NAME_KINDS: NameKind[] = ["person", "place"];

export async function loadRules(): Promise<Record<NameKind, MatchRules>> {
  const rows = await db.matchRule.findMany({ omit: { updatedAt: true } });
  const rules = { ...DEFAULT_RULES };
  for (const { kind, ...row } of rows) rules[kind] = row;
  return rules;
}

export async function loadSavedNames(): Promise<Record<NameKind, SavedName[]>> {
  const rows = await db.savedName.findMany({
    select: { id: true, kind: true, label: true, spellings: { select: { key: true } } },
    orderBy: { createdAt: "asc" },
  });
  const saved: Record<NameKind, SavedName[]> = { person: [], place: [] };
  for (const row of rows) {
    saved[row.kind].push({ id: row.id, label: row.label, keys: row.spellings.map((spelling) => spelling.key) });
  }
  return saved;
}

/** The people or places as they are now, worked out the same way the dashboard does. */
async function currentNames(kind: NameKind): Promise<Names> {
  const [gigs, saved, rules] = await Promise.all([
    db.gig.findMany({
      select: { person: true, personKey: true, location: true, locationKey: true, gigDate: true, deletedAt: true },
    }),
    loadSavedNames(),
    loadRules(),
  ]);
  const spellings = countSpellings(
    gigs.map((gig) => ({
      key: kind === "person" ? gig.personKey : gig.locationKey,
      text: kind === "person" ? gig.person : gig.location,
      gigDate: dateToDay(gig.gigDate),
      deleted: gig.deletedAt !== null,
    })),
  );
  return groupNames(spellings, saved[kind], rules[kind]);
}

type Tx = Prisma.TransactionClient;

export class NameError extends Error {}

function findGroup(names: Names, id: string): NameGroup {
  const group = names.groups.find((entry) => entry.id === id);
  if (!group) throw new NameError("That one isn't there anymore. The page has been refreshed.");
  return group;
}

/** Saves a group as it is now, pinning every spelling in it, so the rules no longer move them. */
async function keep(tx: Tx, kind: NameKind, group: NameGroup): Promise<string> {
  const id = group.savedId ?? (await tx.savedName.create({ data: { kind }, select: { id: true } })).id;
  const loose = group.spellings.filter((spelling) => !spelling.pinned);
  if (loose.length > 0) {
    await tx.pinnedSpelling.createMany({
      data: loose.map((spelling) => ({ kind, key: spelling.key, savedNameId: id })),
      skipDuplicates: true,
    });
  }
  return id;
}

/** Saved names left with no spellings and no name of their own do nothing, so they go. */
async function tidy(tx: Tx, kind: NameKind) {
  await tx.savedName.deleteMany({ where: { kind, label: null, spellings: { none: {} } } });
}

/** Sets how a person or place shows in the app. An empty label goes back to the most-used spelling. */
export async function renameName(kind: NameKind, id: string, label: string) {
  const group = findGroup(await currentNames(kind), id);
  const text = label.trim().replace(/\s+/g, " ").slice(0, 80);
  await db.$transaction(async (tx) => {
    const savedId = await keep(tx, kind, group);
    await tx.savedName.update({ where: { id: savedId }, data: { label: text || null } });
  });
}

/** Moves one spelling to another person or place, or to a new one of its own. */
export async function moveSpelling(kind: NameKind, key: string, to: string) {
  const names = await currentNames(kind);
  const from = names.byKey.get(key);
  if (!from) throw new NameError("That spelling isn't in the calendar anymore. The page has been refreshed.");
  const target = to === NEW_NAME ? null : findGroup(names, to);
  if (target?.id === from.id) return;
  await db.$transaction(async (tx) => {
    // The rest of its group stays together, as it was.
    await keep(tx, kind, from);
    const targetId = target
      ? await keep(tx, kind, target)
      : (await tx.savedName.create({ data: { kind }, select: { id: true } })).id;
    await tx.pinnedSpelling.update({ where: { kind_key: { kind, key } }, data: { savedNameId: targetId } });
    await tidy(tx, kind);
  });
}

/** Puts every spelling of one person or place into another. The other keeps its name. */
export async function mergeNames(kind: NameKind, id: string, intoId: string) {
  const names = await currentNames(kind);
  const group = findGroup(names, id);
  const into = findGroup(names, intoId);
  if (group.id === into.id) return;
  await db.$transaction(async (tx) => {
    const fromId = await keep(tx, kind, group);
    const toId = await keep(tx, kind, into);
    await tx.pinnedSpelling.updateMany({ where: { savedNameId: fromId }, data: { savedNameId: toId } });
    if (!into.named && group.named) await tx.savedName.update({ where: { id: toId }, data: { label: group.label } });
    await tx.savedName.delete({ where: { id: fromId } });
  });
}

/** Forgets what was set by hand for one person or place, so the rules decide again. */
export async function resetName(kind: NameKind, id: string) {
  const group = findGroup(await currentNames(kind), id);
  if (group.savedId) await db.savedName.delete({ where: { id: group.savedId } });
}

export async function saveRules(kind: NameKind, rules: MatchRules) {
  await db.matchRule.upsert({ where: { kind }, create: { kind, ...rules }, update: rules });
}

export async function resetRules(kind: NameKind) {
  await db.matchRule.deleteMany({ where: { kind } });
}
