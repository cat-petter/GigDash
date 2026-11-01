import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/Card";

export const metadata: Metadata = { title: "Privacy · Gigs" };

const STORED: { what: string; why: string }[] = [
  {
    what: "Your email",
    why: "To send sign-in links and tell accounts apart. A link waiting to be used keeps the address it was sent to, with only a hash of its secret part, and expired ones are removed daily.",
  },
  {
    what: "Your signed-in devices",
    why: "The browser's description of itself, its IP address, and when it signed in and was last used, so you can see them and log them out. Each lasts until you log out, or until that device goes 90 days without opening the app.",
  },
  {
    what: "Your iCloud email and app-specific password",
    why: "To read your calendars. The password is encrypted (AES-256-GCM), only decrypted to talk to iCloud, and never shown again. Disconnecting or deleting your account erases it.",
  },
  {
    what: "Your calendar names, name, time zone and tracking date",
    why: "To know which calendars to read, greet you, and count dates in your zone.",
  },
  {
    what: "A copy of your gigs",
    why: "The title, date, calendar, when each event was made and changed, and the person, price and place read from its title, to work out your stats. Only events from the calendars you name are read and copied.",
  },
  {
    what: "Your sync history, names and rules",
    why: "When each sync ran and any problem it had, plus names you've merged or renamed and your matching rules.",
  },
  {
    what: "Counts of requests",
    why: "To stop abuse of sign-in and sync. The counts of sign-in links keep only hashes of email addresses and IP addresses. The login rate limiter's counts keep the IP address.",
  },
];

const SERVICES: { name: string; why: string }[] = [
  { name: "Vercel", why: "runs the app" },
  { name: "Neon", why: "hosts the database" },
  { name: "Resend", why: "delivers sign-in emails, so it sees your email address" },
  { name: "Cloudflare Turnstile", why: "checks the sign-in form for bots, so it sees your browser and IP address" },
  { name: "Apple", why: "the app signs in to iCloud to read your calendars" },
];

/** What's stored and why. Open to anyone, with no session: people should be able to read it before signing up. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
      <header>
        <Link href="/login" className="text-sm text-accent">
          ← Gigs
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Privacy</h1>
        <p className="mt-1 text-sm text-muted">What Gigs stores about you, and why.</p>
      </header>

      <Card title="The app-specific password">
        <div className="space-y-2 text-sm">
          <p>
            This is the most sensitive thing you give the app. Apple can&apos;t limit an app-specific password to your gig
            calendars: it also opens your iCloud Mail, Contacts and other calendars. It can&apos;t sign in to your Apple
            account or change its settings.
          </p>
          <p>
            The app only uses it to read the calendars you name, and to list your calendars&apos; names so you can check
            them. It never reads your mail or contacts, never opens events in other calendars, and never changes anything
            in iCloud.
          </p>
          <p>
            You can revoke it at any time at{" "}
            <a href="https://account.apple.com" target="_blank" rel="noreferrer" className="text-accent">
              account.apple.com
            </a>
            , under Sign-In and Security, then App-Specific Passwords. The app stops being able to read your calendars
            straight away.
          </p>
        </div>
      </Card>

      <Card title="What's stored">
        <dl className="divide-y divide-line">
          {STORED.map(({ what, why }) => (
            <div key={what} className="py-2 text-sm">
              <dt className="font-medium">{what}</dt>
              <dd className="mt-0.5 text-muted">{why}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Who can see it">
        <div className="space-y-2 text-sm">
          <p>Other users can&apos;t see anything of yours.</p>
          <p>
            The person who runs this copy of the app sees a list of users in the app: each email, when each last synced,
            and how many sign-in emails went out today. The app doesn&apos;t show them your gigs or your password.
          </p>
          <p>
            They do control the server, its database and its encryption key, so they could technically reach your data
            outside the app. Only use the app if you trust whoever runs it.
          </p>
        </div>
      </Card>

      <Card title="Services it uses">
        <ul className="space-y-1 text-sm">
          {SERVICES.map(({ name, why }) => (
            <li key={name}>
              <strong>{name}</strong> {why}.
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          The app sets one cookie of its own, to keep you signed in. It has no ads or analytics, and your data isn&apos;t
          sold or shared with anyone else.
        </p>
      </Card>

      <Card title="Deleting it">
        <div className="space-y-2 text-sm">
          <p>
            Settings → Account → Delete account removes your account and everything above that belongs to it, straight
            away, including your saved password. Your calendars aren&apos;t touched. Copies in the database host&apos;s
            short-term backups last until those expire.
          </p>
          <p>
            Deleting your account can&apos;t revoke the password on Apple&apos;s side, so delete it at account.apple.com too.
          </p>
          <p>Disconnecting in Settings → Calendar erases only the password. Your gigs stay until you delete the account.</p>
        </div>
      </Card>
    </main>
  );
}
