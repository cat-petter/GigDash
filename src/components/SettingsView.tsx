import type { SessionUser } from "@/lib/auth";
import type { CalendarSettings } from "@/lib/credentials";
import { type Filters, sectionsFor, withFilter } from "@/lib/filters";
import { plural } from "@/lib/format";
import type { MatchRules, NameKind, Names } from "@/lib/names";
import { AccountSettings } from "./AccountSettings";
import { CalendarForm } from "./CalendarForm";
import { Card } from "./Card";
import { NamesManager } from "./NamesManager";
import { RulesForm } from "./RulesForm";
import { Segmented } from "./Segmented";
import { UsersSettings } from "./UsersSettings";

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
  settings,
}: {
  filters: Filters;
  people: Names;
  places: Names;
  rules: Record<NameKind, MatchRules>;
  user: SessionUser;
  settings: CalendarSettings;
}) {
  const sections = sectionsFor(user.isOwner);
  return (
    <>
      <Segmented
        label="Settings"
        options={sections}
        current={filters.section}
        hrefOf={(section) => withFilter(filters, { section })}
        columns={sections.length > 5 ? 3 : undefined}
      />
      {filters.section === "people" && <NamesManager kind="person" groups={people.groups} />}
      {filters.section === "places" && <NamesManager kind="place" groups={places.groups} />}
      {filters.section === "account" && <AccountSettings user={user} timeZone={settings.timeZone} />}
      {filters.section === "users" && user.isOwner && <UsersSettings user={user} timeZone={settings.timeZone} />}
      {filters.section === "calendar" && (
        <Card title="iCloud calendar" note="This app only ever reads your calendars. It never changes anything in them.">
          <CalendarForm settings={settings} zones={Intl.supportedValuesOf("timeZone")} />
        </Card>
      )}
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
