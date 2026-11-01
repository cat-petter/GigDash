import Link from "next/link";
import type { CalendarSettings } from "@/lib/credentials";
import { linkTo } from "@/lib/filters";
import { LogOutButton } from "./AccountSettings";
import { CalendarForm } from "./CalendarForm";
import { Card } from "./Card";

const APPLE = (
  <a href="https://account.apple.com" target="_blank" rel="noreferrer" className="text-accent">
    account.apple.com
  </a>
);

/** What a new user sees until they've connected a calendar, in place of an empty dashboard. */
export function FirstRun({
  email,
  settings,
  notices,
}: {
  email: string;
  settings: CalendarSettings;
  notices: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Welcome to Gigs</h1>
      {notices}

      <Card title="What this app does">
        <p className="text-sm">
          You keep putting gigs in Apple Calendar the way you do now. Gigs reads them and shows how far ahead you get
          booked, money and job counts by person and by place, and how many holds turn into jobs. It only reads your
          calendars and never changes them.
        </p>
      </Card>

      <Card title="What an app-specific password can access">
        <div className="space-y-2 text-sm">
          <p>
            To read your calendars, Gigs needs an app-specific password from Apple.{" "}
            <strong>Apple can&apos;t limit one to your gig calendars.</strong> It also opens your iCloud Mail, Contacts
            and other calendars. It can&apos;t sign in to your Apple account or change its settings.
          </p>
          <p>
            Gigs only uses it to read the calendars you name below. It&apos;s stored encrypted and is never shown again.
            Never enter your regular Apple password here.
          </p>
          <p>
            <strong>To revoke it</strong> at any time, go to {APPLE}, open Sign-In and Security, then App-Specific
            Passwords, and delete it. Gigs stops being able to read your calendars straight away.
          </p>
          <p>
            <Link href="/privacy" className="text-accent">
              What&apos;s stored and why
            </Link>
          </p>
        </div>
      </Card>

      <Card title="Connect your iCloud calendar">
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm">
          <li>Go to {APPLE} and sign in.</li>
          <li>Open Sign-In and Security, then App-Specific Passwords.</li>
          <li>
            Make a new one called <strong>Gigs app</strong>. It looks like <code>abcd-efgh-ijkl-mnop</code>.
          </li>
          <li>Enter it below with the email you sign in to iCloud with, and your calendars&apos; exact names as they show in the Calendar app.</li>
        </ol>
        <CalendarForm settings={settings} zones={Intl.supportedValuesOf("timeZone")} />
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted">
        <span className="min-w-0 break-words">
          Signed in as {email}.{" "}
          <Link href={linkTo({ tab: "settings", section: "account" })} className="text-accent">
            Account
          </Link>
        </span>
        <LogOutButton />
      </div>
    </main>
  );
}
