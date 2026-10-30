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

export async function loadRules(userId: string): Promise<Record<NameKind, MatchRules>> {
  const rows = await db.matchRule.findMany({ where: { userId }, omit: { userId: true, updatedAt: true } });
  const rules = { ...DEFAULT_RULES };
  for (const { kind, ...row } of rows) rules[kind] = row;
  return rules;
}

export async function loadSavedNames(userId: string): Promise<Record<NameKind, SavedName[]>> {
  const rows = await db.savedName.findMany({
    where: { userId },
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
async function currentNames(userId: string, kind: NameKind): Promise<Names> {
  const [gigs, saved, rules] = await Promise.all([
    db.gig.findMany({
      where: { userId },
      select: { person: true, personKey: true, location: true, locationKey: true, gigDate: true, deletedAt: true },
    }),
    loadSavedNames(userId),
    loadRules(userId),
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
async function keep(tx: Tx, userId: string, kind: NameKind, group: NameGroup): Promise<string> {
  const id = group.savedId ?? (await tx.savedName.create({ data: { userId, kind }, select: { id: true } })).id;
  const loose = group.spellings.filter((spelling) => !spelling.pinned);
  if (loose.length > 0) {
    await tx.pinnedSpelling.createMany({
      data: loose.map((spelling) => ({ userId, kind, key: spelling.key, savedNameId: id })),
      skipDuplicates: true,
    });
  }
  return id;
}

/** Saved names left with no spellings and no name of their own do nothing, so they go. */
async function tidy(tx: Tx, userId: string, kind: NameKind) {
  await tx.savedName.deleteMany({ where: { userId, kind, label: null, spellings: { none: {} } } });
}

/** Sets how a person or place shows in the app. An empty label goes back to the most-used spelling. */
export async function renameName(userId: string, kind: NameKind, id: string, label: string) {
  const group = findGroup(await currentNames(userId, kind), id);
  const text = label.trim().replace(/\s+/g, " ").slice(0, 80);
  await db.$transaction(async (tx) => {
    const savedId = await keep(tx, userId, kind, group);
    await tx.savedName.update({ where: { id_userId: { id: savedId, userId } }, data: { label: text || null } });
  });
}

/** Moves one spelling to another person or place, or to a new one of its own. */
export async function moveSpelling(userId: string, kind: NameKind, key: string, to: string) {
  const names = await currentNames(userId, kind);
  const from = names.byKey.get(key);
  if (!from) throw new NameError("That spelling isn't in the calendar anymore. The page has been refreshed.");
  const target = to === NEW_NAME ? null : findGroup(names, to);
  if (target?.id === from.id) return;
  await db.$transaction(async (tx) => {
    // The rest of its group stays together, as it was.
    await keep(tx, userId, kind, from);
    const targetId = target
      ? await keep(tx, userId, kind, target)
      : (await tx.savedName.create({ data: { userId, kind }, select: { id: true } })).id;
    await tx.pinnedSpelling.update({
      where: { userId_kind_key: { userId, kind, key } },
      data: { savedNameId: targetId },
    });
    await tidy(tx, userId, kind);
  });
}

/** Puts every spelling of one person or place into another. The other keeps its name. */
export async function mergeNames(userId: string, kind: NameKind, id: string, intoId: string) {
  const names = await currentNames(userId, kind);
  const group = findGroup(names, id);
  const into = findGroup(names, intoId);
  if (group.id === into.id) return;
  await db.$transaction(async (tx) => {
    const fromId = await keep(tx, userId, kind, group);
    const toId = await keep(tx, userId, kind, into);
    await tx.pinnedSpelling.updateMany({ where: { userId, savedNameId: fromId }, data: { savedNameId: toId } });
    if (!into.named && group.named) {
      await tx.savedName.update({ where: { id_userId: { id: toId, userId } }, data: { label: group.label } });
    }
    await tx.savedName.delete({ where: { id_userId: { id: fromId, userId } } });
  });
}

/** Forgets what was set by hand for one person or place, so the rules decide again. */
export async function resetName(userId: string, kind: NameKind, id: string) {
  const group = findGroup(await currentNames(userId, kind), id);
  if (group.savedId) await db.savedName.delete({ where: { id_userId: { id: group.savedId, userId } } });
}

export async function saveRules(userId: string, kind: NameKind, rules: MatchRules) {
  await db.matchRule.upsert({
    where: { userId_kind: { userId, kind } },
    create: { userId, kind, ...rules },
    update: rules,
  });
}

export async function resetRules(userId: string, kind: NameKind) {
  await db.matchRule.deleteMany({ where: { userId, kind } });
}
