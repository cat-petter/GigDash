# Gigs

A private dashboard of stats about the gigs in your Apple Calendar: how far ahead you get booked, money and job counts by person and by location, and how many holds turn into jobs.

You keep putting gigs in Calendar the way you do now. The app only reads the calendar and never changes it.

## Setting it up

There are two parts. You make the accounts, which takes about 10 minutes and works fine on a phone. Whoever is setting it up for you does the rest.

### Your part

1. **GitHub:** make an account at [github.com/signup](https://github.com/signup). Pick a password you don't use anywhere else, since you'll be sending it.
2. **Vercel:** go to [vercel.com/signup](https://vercel.com/signup), choose **Hobby**, and tap **Continue with GitHub**. There's no second password, because it signs in with your GitHub account.
3. **Apple app password:**
   1. Go to [account.apple.com](https://account.apple.com) and sign in.
   2. Open **Sign-In and Security**, then **App-Specific Passwords**.
   3. Make a new one called `Gigs app`. It looks like `abcd-efgh-ijkl-mnop`.
4. **Send these** to whoever is setting it up:
   - your GitHub email and password
   - the app password from step 3
   - the email you sign in to iCloud with
   - the exact name of your holds calendar, as it shows in the Calendar app (and your gigs calendar's name, if it isn't `Gigs`)

**Never send your Apple ID password.** The app password is all that's needed. It can't sign in to your Apple account or change its settings, and the app only uses it to read the two gig calendars. You can delete it at account.apple.com at any time, and the app stops being able to read your calendar straight away.

Keep your phone nearby while they set it up, because GitHub may email you a code to confirm the new sign-in. Once it's done you can change your GitHub password, and the app keeps working.

When it's ready you'll get the app's address and a password to open it. Then put it on your Home Screen: open the address in Safari on your iPhone, tap **Share**, then **Add to Home Screen**. It shows up as **Gigs**, opens full-screen with its own icon, and stays logged in for 180 days.

### Setting it up for him

Sign in to GitHub as him, then to Vercel with **Continue with GitHub**. A computer is easiest. It takes about 15 minutes, and everything it uses is free.

#### 1. Copy the app to his accounts

Click this button:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcat-petter%2FGigDash&project-name=gigs&repository-name=gigs&env=ICLOUD_EMAIL%2CICLOUD_APP_PASSWORD%2CHOLDS_CALENDAR%2CDASHBOARD_PASSWORD%2CCRON_SECRET&envDescription=Your%20iCloud%20email%2C%20an%20Apple%20app-specific%20password%2C%20your%20holds%20calendar%20name%2C%20a%20password%20for%20the%20dashboard%20and%20a%20long%20random%20string.&envLink=https%3A%2F%2Fgithub.com%2Fcat-petter%2FGigDash%233-fill-in-the-settings&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

Keep the name `gigs` and leave the copy **private**. Vercel makes a new repository in his GitHub account with a copy of the code, then walks you through the database (step 2) and the settings (step 3).

The button can only copy a public repository. While `cat-petter/GigDash` is private, make it public on GitHub (**Settings** → **General** → **Danger Zone** → **Change visibility**), deploy, then make it private again. His copy is a separate repository, so it stays private and keeps working.

#### 2. Add the database

The app keeps its numbers in a small Postgres database from Neon. There's no separate Neon account to make, because Vercel creates it inside the project.

- Vercel offers Neon while you set up. Accept it, choose the **Free** plan, and pick the region in **Washington, D.C.** (US East) if it asks.
- If it didn't offer Neon, open the project in Vercel and go to **Storage** → **Create Database** → **Neon**. Connect it to the `gigs` project, then redeploy (see the end of step 3).

#### 3. Fill in the settings

Vercel asks for these while you set up. Type each value exactly, with no quotes.

| Setting | What to put |
|---|---|
| `ICLOUD_EMAIL` | The email he signs in to iCloud with. |
| `ICLOUD_APP_PASSWORD` | His `Gigs app` password, with its dashes. |
| `HOLDS_CALENDAR` | The exact name of his holds calendar (the red one), as it shows in the Calendar app. |
| `DASHBOARD_PASSWORD` | A new password he'll type to open the app. Don't reuse his Apple or GitHub password. |
| `CRON_SECRET` | Any long random mix of letters and numbers, 30 or more. Nobody types it again; it just stops strangers from starting a sync. |

His gigs calendar is expected to be called `Gigs`. If it's called something else, also add `GIGS_CALENDAR` with its name.

To change a setting later, open the project in Vercel, go to **Settings** → **Environment Variables**, and edit it. Then open **Deployments**, tap **⋯** next to the top one, and choose **Redeploy**. Changes only apply after a redeploy. Changing `DASHBOARD_PASSWORD` or `CRON_SECRET` logs him out everywhere.

#### 4. Check that it can read his calendars

1. When Vercel finishes, it shows the site's address, like `https://gigs-abc123.vercel.app`. Open it and log in with the `DASHBOARD_PASSWORD`.
2. Add `/status` to the end of the address and open that.
3. Under **Calendars** you should see "Signed in to iCloud", with **Read as jobs** next to Gigs and **Read as holds** next to his holds calendar. If something is red, it says what's wrong, which is usually a typo in a setting.
4. Tap **Sync now**. Under **Last 10 syncs**, the newest one should say **OK** and how many events it read.
5. Do one test move with him:
   1. He makes an all-day event called `Test hold` in his holds calendar.
   2. Tap **Sync now** on the status page.
   3. He edits the event and changes its calendar to Gigs.
   4. Tap **Sync now** again. **Holds moved into Gigs** should go up by one.
   5. He deletes the test event, and you sync once more.

   If **Holds moved into Gigs** stays at 0 after the move, the move isn't being recognised, and the app will count converted holds as new jobs.
6. Send him the address and the `DASHBOARD_PASSWORD`.

## How the app reads your gigs

- **Titles** can have the name, price and place in any order, like `Kaller job 600 neemas hachaim`, `neemas hachaim 600 Kaller` or `Kaller $600 at boro park`. The price is optional and can be written `600`, `$600`, `1,200` or `1.5k`. Writing `job` or `hold` is optional too.
- **Names and places are learned** from all his titles. Once `neemas hachaim` has been a place in one title, it's read as the place wherever it shows up. For a name or place the app hasn't seen yet, put `at` before the place (`Shmuli 500 at Ateres Chynka`) or a comma between them, or keep the old order with the name first. Every sync re-reads all the titles, so old entries pick up what it learns. Only events from October 20, 2026 on are read, because the calendar was an everyday one before that and those old titles would teach it wrong names and places. `TRACK_FROM` (see below) changes the date.
- **The calendar decides** whether something is a job or a hold. If the title says `job` or `hold` and disagrees, the event shows up under **Needs attention** at the bottom of the dashboard.
- **The dashboard** has two tabs at the bottom. The filters at the top (dates, person, place, lead time) apply to both, and stay set when you switch. The date range starts on **All time**; **This month** shows where you need to be this month.
  - **Overview** has the numbers. The tiles count jobs, holds and wanted dates; the charts and the lead-time numbers (shortest, typical, average, longest) count booked jobs only. Tap a tile to see the gigs it counts: **Upcoming jobs**, **Holds**, **Earned** (jobs played, latest first), **Lead time** (longest first) and **Asked, but not free**. Tap a bar in **Lead time** to see those jobs, shortest lead time first, or a month in **Jobs by month** to see that month's jobs, soonest first.
  - **Gigs** has a card for each gig: the date, person, place, price, whether it's booked or on hold, its lead time and how soon it is. Choose **Upcoming**, **Completed** or **All**, which calendar to show, and how to sort (date, lead time or price, either way).
- **Lead time** is how far ahead a gig was booked: from the day the event was made to the day of the gig. For a hold that became a job, it counts from when the hold was made, as long as the event was moved into Gigs rather than made again; the card also shows how far ahead it was confirmed.
- **Each person's numbers:** pick someone under **Filter → Person** to see their card: what they usually pay (the typical price, with their lowest, highest and average), jobs played and coming up, money earned, how far ahead they book, their last and next gig, how often their holds became jobs, and where they usually book him.
- **Wanted dates** are for when someone asks and he isn't free. Put them in a calendar named `Wanted`, written like any other title (`Kaller 800 boro park`). They're left out of jobs, holds and money, and shown on their own as a count on the dashboard and on each person's card. The calendar is optional; nothing changes until it exists.
- **When a hold is confirmed**, move the event into Gigs rather than making a new one. That's how the app knows the hold became a job, and when.
- **Names** are grouped without caring about capitals, so `Kaller` and `kaller` count as one person. Typos like `Kallr` count as a different person.
- **Titles it can't read** show up under **Needs attention**. Fix the title in Calendar and the next sync picks it up.
- **Syncing** happens once a day early in the morning (New York time), whenever you open the dashboard (if the last sync was more than 10 minutes ago), and when you tap **Sync now**.

## What the app can and can't see

- It reads events from only the two calendars named in the settings. It sees the names of your other calendars, so the status page can list them, but never opens their events.
- It never adds, changes or deletes anything in your calendar.
- It keeps a copy of those gigs' titles and dates in your own database, to work out the stats.
- Your app password is stored only in Vercel's encrypted settings. It isn't in the code or the database.
- The dashboard is behind your `DASHBOARD_PASSWORD`. A login lasts 180 days on each device.

## Settings reference

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. The Neon integration sets it on Vercel. |
| `DATABASE_URL_UNPOOLED` | no | Direct (non-pooled) connection, used for migrations when set. Neon sets it on Vercel. |
| `ICLOUD_EMAIL` | yes | Apple ID email. |
| `ICLOUD_APP_PASSWORD` | yes | App-specific password from account.apple.com. |
| `GIGS_CALENDAR` | no | Name of the confirmed-gigs calendar. Default `Gigs`. |
| `HOLDS_CALENDAR` | no | Name of the holds calendar. If empty, holds aren't tracked. |
| `WANTED_CALENDAR` | no | Name of the calendar for dates he was asked for but wasn't free. Defaults to `Wanted`, and is only read if it exists. |
| `DASHBOARD_PASSWORD` | yes | Login password for the dashboard. |
| `CRON_SECRET` | yes | Vercel sends it with the daily cron request; also part of the login cookie's signing key. |
| `APP_TIMEZONE` | no | Time zone for dates and lead times. Default `America/New_York`. |
| `TRACK_FROM` | no | The first date read, like `2025-01-01`. Events before it are ignored and removed from the dashboard (never from the calendar). Default `2026-10-20`, when he started fresh. `all` reads everything. |

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
