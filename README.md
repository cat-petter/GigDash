# GigDash

A private dashboard of stats about the gigs in your Apple Calendar: how far ahead you get booked, money and job counts by person and by location, and how many holds turn into jobs.

You keep putting gigs in Calendar the way you do now. GigDash only reads the calendar and never changes it.

## Setting it up

This takes about 15 minutes, and a computer is easier than a phone for it. Everything it uses is free.

### 1. Make an app password for GigDash

1. Go to [account.apple.com](https://account.apple.com) and sign in.
2. Open **Sign-In and Security**, then **App-Specific Passwords**.
3. Make a new one called `GigDash` and copy it. It looks like `abcd-efgh-ijkl-mnop`.

This is a separate password for apps that connect to iCloud's calendars, contacts and mail. It can't sign in to your Apple account or change its settings, and GigDash only uses it to read the two gig calendars. You can delete it on that same page at any time, and GigDash stops being able to read your calendar straight away.

### 2. Copy GigDash to your own accounts

1. If you don't have a GitHub account, make one at [github.com/signup](https://github.com/signup).
2. Click this button:

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcat-petter%2FGigDash&project-name=gigdash&repository-name=gigdash&env=ICLOUD_EMAIL%2CICLOUD_APP_PASSWORD%2CHOLDS_CALENDAR%2CDASHBOARD_PASSWORD%2CCRON_SECRET&envDescription=Your%20iCloud%20email%2C%20an%20Apple%20app-specific%20password%2C%20your%20holds%20calendar%20name%2C%20a%20password%20for%20the%20dashboard%20and%20a%20long%20random%20string.&envLink=https%3A%2F%2Fgithub.com%2Fcat-petter%2FGigDash%234-fill-in-the-settings&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

3. Vercel asks you to sign up or log in. Choose **Continue with GitHub**.
4. Keep the name `gigdash`, and leave the copy **private**. Vercel makes your own copy of GigDash in your GitHub account.

Vercel then walks you through the database (step 3) and the settings (step 4) before it finishes.

### 3. Add the database

GigDash keeps its numbers in a small Postgres database from Neon.

- Vercel offers Neon while you set up. Accept it, choose the **Free** plan, and pick the region in **Washington, D.C.** (US East) if it asks.
- If it didn't offer Neon, open your project in Vercel and go to **Storage** → **Create Database** → **Neon**. Connect it to the `gigdash` project, then redeploy (see the end of step 4).

### 4. Fill in the settings

Vercel asks for these while you set up. Type each value exactly, with no quotes.

| Setting | What to put |
|---|---|
| `ICLOUD_EMAIL` | The email you sign in to iCloud with. |
| `ICLOUD_APP_PASSWORD` | The app password from step 1, with its dashes. |
| `HOLDS_CALENDAR` | The exact name of your holds calendar (the red one), as it shows in the Calendar app. |
| `DASHBOARD_PASSWORD` | A new password you'll type to open GigDash. Don't reuse your Apple password. |
| `CRON_SECRET` | Any long random mix of letters and numbers, 30 or more. You never type it again; it just stops strangers from starting a sync. |

Your gigs calendar is expected to be called `Gigs`. If it's called something else, also add `GIGS_CALENDAR` with its name.

To change a setting later, open the project in Vercel, go to **Settings** → **Environment Variables**, and edit it. Then open **Deployments**, tap **⋯** next to the top one, and choose **Redeploy**. Changes only apply after a redeploy. Changing `DASHBOARD_PASSWORD` or `CRON_SECRET` logs you out everywhere.

### 5. Check that it can read your calendars

1. When Vercel finishes, it shows your site's address, like `https://gigdash-abc123.vercel.app`. Open it and log in with your `DASHBOARD_PASSWORD`.
2. Add `/status` to the end of the address and open that.
3. Under **Calendars** you should see "Signed in to iCloud", with **Read as jobs** next to Gigs and **Read as holds** next to your holds calendar. If something is red, it says what's wrong, which is usually a typo in a setting.
4. Tap **Sync now**. Under **Last 10 syncs**, the newest one should say **OK** and how many events it read.
5. Do one test move:
   1. In Calendar, make an all-day event called `Test hold` in your holds calendar.
   2. Tap **Sync now** on the status page.
   3. In Calendar, edit the event and change its calendar to Gigs.
   4. Tap **Sync now** again. **Holds moved into Gigs** should go up by one.
   5. Delete the test event and sync once more.

If **Holds moved into Gigs** stays at 0 after the move, tell whoever set GigDash up for you. It means the move isn't being recognised.

### 6. Put it on your Home Screen

On your iPhone, open your GigDash address in Safari, tap the **Share** button, then **Add to Home Screen**. It opens full-screen with its own icon, and stays logged in for 180 days.

## How GigDash reads your gigs

- **Titles** follow `<who> job|hold [price] [location]`, like `Kaller job 600 neemas hachaim`, `Kaller hold` or `Yitsy korblue job brooklyn`. The price is optional and can be written `600`, `$600`, `1,200` or `1.5k`.
- **The calendar decides** whether something is a job or a hold. If the title disagrees, the event shows up under **Needs attention** on the dashboard's **Gigs** tab.
- **When a hold is confirmed**, move the event into Gigs rather than making a new one. That's how GigDash knows the hold became a job, and when.
- **Names** are grouped without caring about capitals, so `Kaller` and `kaller` count as one person. Typos like `Kallr` count as a different person.
- **Titles it can't read** show up under **Needs attention**. Fix the title in Calendar and the next sync picks it up.
- **Syncing** happens once a day early in the morning (New York time), whenever you open the dashboard (if the last sync was more than 10 minutes ago), and when you tap **Sync now**.

## What GigDash can and can't see

- It reads events from only the two calendars named in the settings. It sees the names of your other calendars, so the status page can list them, but never opens their events.
- It never adds, changes or deletes anything in your calendar.
- It keeps a copy of those gigs' titles and dates in your own database, to work out the stats.
- Your app password is stored only in Vercel's encrypted settings. It isn't in the code or the database.
- The dashboard is behind your `DASHBOARD_PASSWORD`. A login lasts 180 days on each device.

## If someone else hosts it

If you'd rather not run it on your own accounts, someone else can host it for you. The steps are the same, except that they do steps 2 to 6 and enter the settings. That means giving them your app password from step 1. You can still delete it at account.apple.com at any time.

## Settings reference

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. The Neon integration sets it on Vercel. |
| `DATABASE_URL_UNPOOLED` | no | Direct (non-pooled) connection, used for migrations when set. Neon sets it on Vercel. |
| `ICLOUD_EMAIL` | yes | Apple ID email. |
| `ICLOUD_APP_PASSWORD` | yes | App-specific password from account.apple.com. |
| `GIGS_CALENDAR` | no | Name of the confirmed-gigs calendar. Default `Gigs`. |
| `HOLDS_CALENDAR` | no | Name of the holds calendar. If empty, holds aren't tracked. |
| `DASHBOARD_PASSWORD` | yes | Login password for the dashboard. |
| `CRON_SECRET` | yes | Vercel sends it with the daily cron request; also part of the login cookie's signing key. |
| `APP_TIMEZONE` | no | Time zone for dates and lead times. Default `America/New_York`. |

## For developers

Next.js 16 (App Router), Tailwind 4, Prisma 7 on Postgres, `tsdav` for CalDAV, `node-ical`, `recharts` and Vitest. `PLAN.md` has the design and the reasoning behind it.

### Running it locally

You need Node 20+ and a local Postgres.

```sh
npm install
cp .env.example .env   # point DATABASE_URL at local Postgres; set DASHBOARD_PASSWORD and CRON_SECRET to anything
npm run db:migrate     # creates the tables
npm run seed:demo      # ~150 made-up gigs (see below)
npm run dev
```

`seed:demo` deletes every gig and sync run first. It refuses to run against a database that isn't on this computer unless you pass `--force`: `npm run seed:demo -- --force`.

Without `ICLOUD_EMAIL` and `ICLOUD_APP_PASSWORD`, the dashboard shows whatever is in the database and doesn't try to sync.

### Checks

```sh
npm test         # title parser, iCalendar parsing, sync planner, stats, filters, auth, proxy
npm run lint
npm run build
```

### Layout

- `src/lib/`
  - `parse-title.ts`, `ics.ts`: pure parsing.
  - `caldav.ts`: iCloud fetch; only the two named calendars.
  - `sync.ts`: the pure sync planner.
  - `run-sync.ts`: applies the plan and records a `SyncRun`.
  - `stats.ts`, `filters.ts`: dashboard numbers and URL filters.
  - `auth.ts`, `session.ts`: the signed login cookie.
- `src/proxy.ts`: sends anyone without a valid cookie to `/login`. It skips `/api/`, because `/api/sync` checks the cron secret or the cookie itself.
- `src/app/`: the dashboard (`page.tsx`), `/status`, `/login`, `/api/sync`, the manifest and the icons.
- `scripts/seed-demo.ts`, `scripts/vercel-build.sh`.

### Database changes

Edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>`, and commit the new folder in `prisma/migrations/`. On Vercel, `scripts/vercel-build.sh` (the `buildCommand` in `vercel.json`) runs `prisma migrate deploy` before `next build`. It uses `DATABASE_URL_UNPOOLED` when set, because Neon's `DATABASE_URL` goes through a connection pooler. It skips migrating when no database is connected yet. Preview deployments migrate whichever database their environment points at.

### Icons

`src/app/icon.svg` is the master. `src/app/apple-icon.png` (180px), `public/icon-192.png` and `public/icon-512.png` are renders of it without the rounded corners, since iOS and Android round them. Re-render them if the SVG changes.

### Deploying

- The Deploy button clones the repo's default branch, and it only works for other people while the repo is **public**. Nothing secret is in the repo; all secrets live in Vercel's settings.
- The daily cron is in `vercel.json` (10:00 UTC). Vercel's free Hobby plan allows one cron run a day, at some point within that hour.
