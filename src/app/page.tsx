import Link from "next/link";
import { connection } from "next/server";
import { AddEmailCard, LogOutButton } from "@/components/AccountSettings";
import { Card } from "@/components/Card";
import { GigsView } from "@/components/GigsView";
import { OverviewView } from "@/components/OverviewView";
import { PendingFrame, PendingProvider } from "@/components/Pending";
import { SettingsView } from "@/components/SettingsView";
import { StatsView } from "@/components/StatsView";
import { SyncButton } from "@/components/SyncButton";
import { TabBar } from "@/components/TabBar";
import { requireUser } from "@/lib/dal";
import { dayInZone } from "@/lib/dates";
import { DEFAULT_FILTERS, type Filters, parseFilters, TABS, withFilter } from "@/lib/filters";
import { greeting } from "@/lib/format";
import { loadGigs } from "@/lib/gigs";
import type { Names } from "@/lib/names";
import { OWNER_PLACEHOLDER_EMAIL } from "@/lib/owner";
import { autoSync, syncStatus } from "@/lib/run-sync";
import { loadSettings } from "@/lib/settings-store";
import { filterOptions, gigList, needsAttention } from "@/lib/stats";

/** An old link may name one spelling ("kaler"); it now means whoever that spelling belongs to. */
function groupId(names: Names, key: string | null): string | null {
  if (key === null || names.groups.some((group) => group.id === key)) return key;
  return names.byKey.get(key)?.id ?? key;
}

const CALENDAR_SETTINGS = withFilter(DEFAULT_FILTERS, { tab: "settings", section: "calendar" });

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-warn/40 px-3 py-2 text-sm text-warn">{children}</p>;
}

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const user = await requireUser("/");
  const userId = user.id;
  await connection();
  const asked = parseFilters(await searchParams);

  const settings = await loadSettings(userId);
  const { timeZone, zoneProblem, connected } = settings;
  if (connected) await autoSync(userId, 2000);

  const now = new Date();
  const [{ rows, people, places, rules }, sync] = await Promise.all([loadGigs(userId), syncStatus(userId, now)]);
  const today = dayInZone(now, timeZone);
  const filters: Filters = {
    ...asked,
    person: groupId(people, asked.person),
    location: groupId(places, asked.location),
  };

  // The Overview greets them by name; the other tabs are titled by name.
  const title =
    filters.tab === "overview"
      ? greeting(now, timeZone, settings.name || undefined)
      : TABS.find((tab) => tab.key === filters.tab)!.label;

  const onCalendarSettings = filters.tab === "settings" && filters.section === "calendar";

  const header = (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Link href="/status" className="text-sm text-accent">
          Status
        </Link>
      </div>
      {connected && <SyncButton {...sync} />}
    </header>
  );

  const notices = (
    <>
      {user.email === OWNER_PLACEHOLDER_EMAIL && <AddEmailCard />}
      {!connected && !onCalendarSettings && rows.some((row) => !row.deleted) && (
        <Notice>
          iCloud isn&apos;t connected, so this only shows gigs that are already saved.{" "}
          <Link href={CALENDAR_SETTINGS} className="underline">
            Connect it
          </Link>
        </Notice>
      )}
      {zoneProblem && (
        <Notice>
          {zoneProblem}, so dates are counted in New York time.{" "}
          <Link href="/status" className="underline">
            See Status
          </Link>
        </Notice>
      )}
    </>
  );

  if (rows.every((row) => row.deleted) && filters.tab !== "settings") {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
        {header}
        {notices}
        <Card title="No gigs yet">
          {connected ? (
            <p className="text-sm text-muted">
              Once the app reads your calendars, your gigs show up here. Tap Sync now, or open{" "}
              <Link href="/status" className="text-accent">
                Status
              </Link>{" "}
              if nothing arrives.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Your gigs show up here once your iCloud calendar is connected.{" "}
              <Link href={CALENDAR_SETTINGS} className="text-accent">
                Connect it
              </Link>
            </p>
          )}
        </Card>
        <div className="flex items-center justify-between gap-3 px-1 text-sm text-muted">
          <span className="min-w-0 truncate">Signed in as {user.email}</span>
          <LogOutButton />
        </div>
      </main>
    );
  }

  const options = filterOptions(rows);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 pt-6 pb-28">
      {header}
      {notices}
      <PendingProvider>
        <PendingFrame>
          {filters.tab === "settings" ? (
            <SettingsView filters={filters} people={people} places={places} rules={rules} user={user} settings={settings} />
          ) : filters.tab === "gigs" ? (
            <GigsView
              gigs={gigList(rows, filters, today)}
              filters={filters}
              today={today}
              timeZone={timeZone}
              people={options.people}
              places={options.locations}
            />
          ) : filters.tab === "stats" ? (
            <StatsView rows={rows} filters={filters} today={today} people={options.people} places={options.locations} />
          ) : (
            <OverviewView rows={rows} today={today} attention={needsAttention(rows)} calendars={settings.names} />
          )}
        </PendingFrame>
        <TabBar filters={filters} />
      </PendingProvider>
    </main>
  );
}
