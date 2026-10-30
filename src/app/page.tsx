import Link from "next/link";
import { connection } from "next/server";
import { Card } from "@/components/Card";
import { GigsView } from "@/components/GigsView";
import { OverviewView } from "@/components/OverviewView";
import { PendingFrame, PendingProvider } from "@/components/Pending";
import { SettingsView } from "@/components/SettingsView";
import { StatsView } from "@/components/StatsView";
import { SyncButton } from "@/components/SyncButton";
import { TabBar } from "@/components/TabBar";
import { calendarNames, icloudConfigured } from "@/lib/caldav";
import { appTimeZone, dayInZone } from "@/lib/dates";
import { type Filters, parseFilters, TABS } from "@/lib/filters";
import { greeting } from "@/lib/format";
import { loadGigs } from "@/lib/gigs";
import type { Names } from "@/lib/names";
import { autoSync, syncStatus } from "@/lib/run-sync";
import { requireLogin } from "@/lib/session";
import { filterOptions, gigList, needsAttention } from "@/lib/stats";

/** An old link may name one spelling ("kaler"); it now means whoever that spelling belongs to. */
function groupId(names: Names, key: string | null): string | null {
  if (key === null || names.groups.some((group) => group.id === key)) return key;
  return names.byKey.get(key)?.id ?? key;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-warn/40 px-3 py-2 text-sm text-warn">{children}</p>;
}

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  await requireLogin("/");
  await connection();
  const asked = parseFilters(await searchParams);

  let timeZone = "America/New_York";
  let zoneProblem = false;
  try {
    timeZone = appTimeZone();
  } catch {
    zoneProblem = true;
  }

  const connected = icloudConfigured();
  if (connected) await autoSync(2000);

  const now = new Date();
  const [{ rows, people, places, rules }, sync] = await Promise.all([loadGigs(), syncStatus(now)]);
  const today = dayInZone(now, timeZone);
  const filters: Filters = {
    ...asked,
    person: groupId(people, asked.person),
    location: groupId(places, asked.location),
  };

  // The Overview greets him by name (YOUR_NAME); the other tabs are titled by name.
  const title =
    filters.tab === "overview"
      ? greeting(now, timeZone, process.env.YOUR_NAME?.trim() || undefined)
      : TABS.find((tab) => tab.key === filters.tab)!.label;

  const header = (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Link href="/status" className="text-sm text-accent">
          Status
        </Link>
      </div>
      <SyncButton {...sync} />
    </header>
  );

  const notices = (
    <>
      {!connected && (
        <Notice>
          iCloud isn&apos;t connected yet, so this only shows gigs that are already saved.{" "}
          <Link href="/status" className="underline">
            See Status
          </Link>
        </Notice>
      )}
      {zoneProblem && (
        <Notice>
          APP_TIMEZONE isn&apos;t a time zone this app knows, so dates are counted in New York time.{" "}
          <Link href="/status" className="underline">
            See Status
          </Link>
        </Notice>
      )}
    </>
  );

  if (rows.every((row) => row.deleted)) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
        {header}
        {notices}
        <Card title="No gigs yet">
          <p className="text-sm text-muted">
            Once the app reads your calendars, your gigs show up here. Tap Sync now, or open{" "}
            <Link href="/status" className="text-accent">
              Status
            </Link>{" "}
            if nothing arrives.
          </p>
        </Card>
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
            <SettingsView filters={filters} people={people} places={places} rules={rules} />
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
            <OverviewView rows={rows} today={today} attention={needsAttention(rows)} calendars={calendarNames()} />
          )}
        </PendingFrame>
        <TabBar filters={filters} />
      </PendingProvider>
    </main>
  );
}
