"use server";

import { refresh } from "next/cache";
import { type MatchRules, type NameKind, parseWordList } from "@/lib/names";
import {
  mergeNames,
  moveSpelling,
  NAME_KINDS,
  NameError,
  renameName,
  resetName,
  resetRules,
  saveRules,
} from "@/lib/names-store";
import { requireLogin } from "@/lib/session";

export type NameResult = { error: string | null };

/** Every change checks the login itself: server actions can be posted to directly. */
async function run(
  kind: unknown,
  change: (userId: string, kind: NameKind) => Promise<void>,
): Promise<NameResult> {
  const userId = await requireLogin("/");
  if (!NAME_KINDS.includes(kind as NameKind)) return { error: "Unknown kind." };
  try {
    await change(userId, kind as NameKind);
    return { error: null };
  } catch (error) {
    if (error instanceof NameError) return { error: error.message };
    console.error(error);
    return { error: "That didn't save. Try again." };
  } finally {
    refresh();
  }
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

export async function renameAction(kind: NameKind, id: string, label: string) {
  return run(kind, (userId, kind) => renameName(userId, kind, text(id), text(label)));
}

export async function moveAction(kind: NameKind, key: string, to: string) {
  return run(kind, (userId, kind) => moveSpelling(userId, kind, text(key), text(to)));
}

export async function mergeAction(kind: NameKind, id: string, intoId: string) {
  return run(kind, (userId, kind) => mergeNames(userId, kind, text(id), text(intoId)));
}

export async function resetNameAction(kind: NameKind, id: string) {
  return run(kind, (userId, kind) => resetName(userId, kind, text(id)));
}

export async function saveRulesAction(kind: NameKind, _state: NameResult, form: FormData): Promise<NameResult> {
  if (form.get("reset") !== null) return run(kind, resetRules);
  const on = (name: keyof MatchRules) => form.get(name) === "on";
  const rules: MatchRules = {
    punctuation: on("punctuation"),
    wordOrder: on("wordOrder"),
    doubleLetters: on("doubleLetters"),
    soundAlike: on("soundAlike"),
    oneLetterOff: on("oneLetterOff"),
    ignoreWords: parseWordList(text(form.get("ignoreWords"))).slice(0, 100),
  };
  return run(kind, (userId, kind) => saveRules(userId, kind, rules));
}
