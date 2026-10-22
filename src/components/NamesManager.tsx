"use client";

import { type FormEvent, type ReactNode, useState, useTransition } from "react";
import { mergeAction, moveAction, type NameResult, renameAction, resetNameAction } from "@/app/names-actions";
import { type Filters, withFilter } from "@/lib/filters";
import { plural } from "@/lib/format";
import { displayText, type NameGroup, type NameKind, NEW_NAME } from "@/lib/names";
import { FilterLink } from "./Pending";

const WORDS: Record<NameKind, { one: string; many: string; gigs: string }> = {
  person: { one: "person", many: "people", gigs: "See their gigs" },
  place: { one: "place", many: "places", gigs: "See gigs there" },
};

const chevron = (
  <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0 text-muted">
    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/** A native select that runs an action when something is picked, then goes back to its prompt. */
function PickSelect({
  label,
  prompt,
  disabled,
  onPick,
  children,
}: {
  label: string;
  prompt: string;
  disabled: boolean;
  onPick: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <span className="relative flex min-w-0 items-center">
      <select
        aria-label={label}
        value=""
        disabled={disabled}
        onChange={(event) => event.target.value && onPick(event.target.value)}
        className="w-full appearance-none truncate rounded-lg border border-line bg-bg py-1.5 pr-8 pl-3 text-sm disabled:opacity-60"
      >
        <option value="" disabled>
          {prompt}
        </option>
        {children}
      </select>
      <span className="pointer-events-none absolute right-3">{chevron}</span>
    </span>
  );
}

/** Spellings with gigs still in the calendar; ones only on deleted gigs would just say "0 gigs". */
const live = (group: NameGroup) => group.spellings.filter((spelling) => spelling.count > 0);

/** "also written Kaler, R' Kaller". Spellings that only differ in capitals aren't worth listing. */
function alsoWritten(group: NameGroup): string | null {
  const seen = new Set([group.label.toLowerCase()]);
  const others: string[] = [];
  for (const { text } of live(group)) {
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    others.push(text);
  }
  return others.length > 0 ? `also written ${others.join(", ")}` : null;
}

/** Settings → People (or Places): each one with its spellings, to rename, split up or merge. */
export function NamesManager({ kind, groups, filters }: { kind: NameKind; groups: NameGroup[]; filters: Filters }) {
  const words = WORDS[kind];
  const shown = groups.filter((group) => group.count > 0);
  const [query, setQuery] = useState("");
  // The open one is remembered by a spelling in it, since saving can give it a new id.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = openKey === null ? undefined : shown.find((group) => group.spellings.some((s) => s.key === openKey));
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? shown.filter(
        (group) =>
          group.label.toLowerCase().includes(needle) ||
          group.spellings.some((spelling) => spelling.text.toLowerCase().includes(needle)),
      )
    : shown;
  const byName = [...shown].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  const spellingCount = shown.reduce((total, group) => total + live(group).length, 0);
  const edited = shown.filter((group) => group.savedId).length;

  function run(change: () => Promise<NameResult>, then?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await change();
      if (result.error) setError(result.error);
      else then?.();
    });
  }

  function rename(group: NameGroup, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = String(new FormData(event.currentTarget).get("label") ?? "");
    run(() => renameAction(kind, group.id, label));
  }

  function move(group: NameGroup, key: string, to: string) {
    // Stay on what's left of this one; it's the one being worked on.
    const rest = live(group).find((spelling) => spelling.key !== key);
    run(() => moveAction(kind, key, to), () => setOpenKey(rest?.key ?? key));
  }

  function merge(group: NameGroup, intoId: string) {
    const into = shown.find((other) => other.id === intoId);
    run(() => mergeAction(kind, group.id, intoId), () => setOpenKey(into?.spellings[0]?.key ?? null));
  }

  function editor(group: NameGroup) {
    const spellings = live(group);
    const others = byName.filter((other) => other.id !== group.id);
    return (
      <div className="space-y-4 border-t border-line px-4 pt-3 pb-4">
        <form key={`${group.id}-${group.label}`} onSubmit={(event) => rename(group, event)} className="space-y-1">
          <label htmlFor={`label-${group.id}`} className="text-xs font-medium text-muted">
            Show as
          </label>
          <div className="flex gap-2">
            <input
              id={`label-${group.id}`}
              name="label"
              defaultValue={group.named ? group.label : ""}
              placeholder={displayText(group.spellings[0].text)}
              maxLength={80}
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-base"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-fg px-4 py-1.5 text-sm font-medium text-bg disabled:opacity-60"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-muted">Leave empty to use the spelling used most.</p>
        </form>

        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted">
            {spellings.length === 1 ? "Written as" : `Written ${spellings.length} ways`}
          </h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {spellings.map((spelling) => (
              <li key={spelling.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{spelling.text}</p>
                  <p className="text-xs text-muted">
                    {plural(spelling.count, "gig")} · {spelling.pinned ? "set by hand" : "matched by the rules"}
                  </p>
                </div>
                <div className="w-32">
                  <PickSelect
                    label={`Move “${spelling.text}” to`}
                    prompt="Move to…"
                    disabled={pending}
                    onPick={(to) => move(group, spelling.key, to)}
                  >
                    {spellings.length > 1 && <option value={NEW_NAME}>A new {words.one}</option>}
                    {others.map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.label}
                      </option>
                    ))}
                  </PickSelect>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {others.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted">Same {words.one} as another?</p>
            <PickSelect
              label={`Merge ${group.label} into`}
              prompt="Merge into…"
              disabled={pending}
              onPick={(intoId) => merge(group, intoId)}
            >
              {others.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.label} ({plural(other.count, "gig")})
                </option>
              ))}
            </PickSelect>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
          <FilterLink
            href={withFilter(filters, kind === "person" ? { tab: "overview", person: group.id } : { tab: "overview", location: group.id })}
            className="text-accent"
          >
            {words.gigs}
          </FilterLink>
          {group.savedId && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => resetNameAction(kind, group.id))}
              className="text-muted underline disabled:opacity-60"
            >
              Let the rules decide again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${words.many}`}
        aria-label={`Search ${words.many}`}
        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-base"
      />
      <p className="px-1 text-sm text-muted">
        <span className="font-semibold text-fg">{plural(shown.length, words.one, words.many)}</span> from{" "}
        {plural(spellingCount, "spelling")}
        {edited > 0 && ` · ${edited} edited`}
      </p>
      {error && (
        <p role="alert" className="rounded-xl border border-bad/40 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      {matches.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
          No {words.one} matches “{query.trim()}”.
        </p>
      ) : (
        <ul aria-busy={pending} className={`space-y-2 transition-opacity ${pending ? "opacity-60" : ""}`}>
          {matches.map((group) => {
            const isOpen = open?.id === group.id;
            const also = alsoWritten(group);
            return (
              <li key={group.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenKey(isOpen ? null : group.spellings[0].key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{group.label}</span>
                      {group.savedId && (
                        <span className="shrink-0 rounded-full bg-accent/12 px-2 text-xs leading-5 text-accent">
                          Edited
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {plural(group.count, "gig")}
                      {also && ` · ${also}`}
                    </span>
                  </span>
                  <span className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>{chevron}</span>
                </button>
                {isOpen && editor(group)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
