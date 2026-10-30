import type { SessionUser } from "@/lib/auth";
import { type Filters, SECTIONS, withFilter } from "@/lib/filters";
import { plural } from "@/lib/format";
import type { MatchRules, NameKind, Names } from "@/lib/names";
import { AccountSettings } from "./AccountSettings";
import { Card } from "./Card";
import { NamesManager } from "./NamesManager";
import { RulesForm } from "./RulesForm";
import { Segmented } from "./Segmented";

/** "14 people from 22 spellings" */
function summary(names: Names, one: string, many: string): string {
  const groups = names.groups.filter((group) => group.count > 0);
  const spellings = groups.reduce((total, group) => total + group.spellings.filter((s) => s.count > 0).length, 0);
  return `${plural(groups.length, one, many)} from ${plural(spellings, "spelling")}`;
}

/** The Settings tab: who's who, where's where, and the rules that work it out. */
export function SettingsView({
  filters,
  people,
  places,
  rules,
  user,
}: {
  filters: Filters;
  people: Names;
  places: Names;
  rules: Record<NameKind, MatchRules>;
  user: SessionUser;
}) {
  return (
    <>
      <Segmented
        label="Settings"
        options={SECTIONS}
        current={filters.section}
        hrefOf={(section) => withFilter(filters, { section })}
      />
      {filters.section === "people" && <NamesManager kind="person" groups={people.groups} />}
      {filters.section === "places" && <NamesManager kind="place" groups={places.groups} />}
      {filters.section === "account" && <AccountSettings user={user} />}
      {filters.section === "rules" && (
        <>
          <p className="px-1 text-sm text-muted">
            Names are often written a few ways. These rules decide which spellings are the same musician or place,
            and the one written most is how it shows. Anything you set by hand under Musicians or Places stays as you
            set it. Changes show everywhere right away; the calendar isn&apos;t changed.
          </p>
          <Card title="Musicians" note={summary(people, "musician", "musicians")}>
            <RulesForm kind="person" rules={rules.person} />
          </Card>
          <Card title="Places" note={summary(places, "place", "places")}>
            <RulesForm kind="place" rules={rules.place} />
          </Card>
        </>
      )}
    </>
  );
}
