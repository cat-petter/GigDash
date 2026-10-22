"use client";

import { useActionState } from "react";
import { type NameResult, saveRulesAction } from "@/app/names-actions";
import type { MatchRules, NameKind } from "@/lib/names";

type Check = Exclude<keyof MatchRules, "ignoreWords">;

const CHECKS: { name: Check; label: string }[] = [
  { name: "punctuation", label: "Ignore spaces and punctuation" },
  { name: "wordOrder", label: "Ignore word order" },
  { name: "doubleLetters", label: "Ignore double letters" },
  { name: "soundAlike", label: "Same sound, different spelling" },
  { name: "oneLetterOff", label: "Allow one typo" },
];

const EXAMPLES: Record<NameKind, Record<Check | "ignoreWords", string>> = {
  person: {
    punctuation: "R' Kaller = R Kaller · Yitsy-Korblue = Yitsy Korblue",
    wordOrder: "Chaim Kaller = Kaller Chaim",
    doubleLetters: "Kaller = Kaler",
    soundAlike: "Friedman = Fridman = Freedman · Schwartz = Shvartz",
    oneLetterOff: "Halpern = Halpren, in names of 5 or more letters",
    ignoreWords: "“Mr. Kaller” = “Kaller”",
  },
  place: {
    punctuation: "Boro Park = Boropark",
    wordOrder: "Palace Eden = Eden Palace",
    doubleLetters: "Williamsburg = Wiliamsburg",
    soundAlike: "Neemas Hachaim = Neimas Hachaim",
    oneLetterOff: "Lakewood = Lakewod, in names of 5 or more letters",
    ignoreWords: "“The Terrace” = “Terrace”",
  },
};

/** The rules that decide which spellings are the same person (or place). */
export function RulesForm({ kind, rules }: { kind: NameKind; rules: MatchRules }) {
  const [state, action, pending] = useActionState<NameResult, FormData>(saveRulesAction.bind(null, kind), {
    error: null,
  });

  return (
    // Keyed by the saved rules, so the form shows them again after saving or going back to defaults.
    <form key={JSON.stringify(rules)} action={action} className="space-y-3">
      <ul className="space-y-1">
        {CHECKS.map((check) => (
          <li key={check.name}>
            <label className="flex items-start gap-3 rounded-lg py-1.5">
              <input
                type="checkbox"
                name={check.name}
                defaultChecked={rules[check.name]}
                className="mt-0.5 size-5 shrink-0 accent-accent"
              />
              <span>
                <span className="block text-sm font-medium">{check.label}</span>
                <span className="block text-xs text-muted">{EXAMPLES[kind][check.name]}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Words to ignore</span>
        <span className="block text-xs text-muted">Separated by commas. Left out when comparing, so {EXAMPLES[kind].ignoreWords}.</span>
        <textarea
          name="ignoreWords"
          rows={2}
          defaultValue={rules.ignoreWords.join(", ")}
          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-base"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-fg px-4 py-1.5 text-sm font-medium text-bg disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="submit" name="reset" disabled={pending} className="text-sm text-accent disabled:opacity-60">
          Back to defaults
        </button>
      </div>
    </form>
  );
}
