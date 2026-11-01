# Gigs

A private dashboard of stats about the gigs in your Apple Calendar: how far ahead you get booked, money and job counts by person and by location, and how many holds turn into jobs.

You keep putting gigs in Calendar the way you do now. The app only reads the calendar and never changes it.

## Using it

1. Open the app's address and enter your email. You'll get a link to sign in; it works once, for 15 minutes.
2. Make an Apple app password: go to [account.apple.com](https://account.apple.com), open **Sign-In and Security**, then **App-Specific Passwords**, and make one called `Gigs app`. It looks like `abcd-efgh-ijkl-mnop`.
3. Fill in the form the app shows: your iCloud email, that password, and the exact names of your calendars. It checks them with iCloud before saving.
4. Put it on your Home Screen: open the address in Safari on your iPhone, tap **Share**, then **Add to Home Screen**. A login lasts 90 days from when you last used it.

**Never enter your Apple ID password.** Only the app password goes in the form. You can delete it at account.apple.com at any time, and the app stops being able to read your calendar straight away.

## Hosting it

One deployment serves anyone who signs up, and the first account is its owner. It takes about 30 minutes on a computer. Vercel, Neon, Resend and Turnstile are free at this size; the domain costs about $10–15 a year.

#### 1. Get a domain and the sending accounts

- **Domain:** Resend only sends to other people from a domain you've verified.
- **Resend:** make an account at [resend.com](https://resend.com), add the domain, and add the DNS records it shows. Make an API key. The free plan sends 100 emails a day.
- **Cloudflare Turnstile:** in the [Cloudflare dashboard](https://dash.cloudflare.com), add a Turnstile widget for your domain and any `vercel.app` address you'll use, and copy its two keys.

#### 2. Copy the app and add the database

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcat-petter%2FGigDash&project-name=gigs&repository-name=gigs&env=DASHBOARD_PASSWORD%2CCRON_SECRET%2CCREDENTIALS_KEY%2CBETTER_AUTH_SECRET%2CRESEND_API_KEY%2CEMAIL_FROM%2CTURNSTILE_SITE_KEY%2CTURNSTILE_SECRET_KEY&envDescription=The%20keys%20and%20passwords%20the%20app%20needs.%20Each%20one%20is%20explained%20in%20the%20README.&envLink=https%3A%2F%2Fgithub.com%2Fcat-petter%2FGigDash%233-fill-in-the-settings&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

Keep the copy **private**. Vercel makes a repository in your GitHub account, then walks you through the database and the settings. The button can only copy a public repository, so while `cat-petter/GigDash` is private, make it public, deploy, and make it private again.

Accept Neon when Vercel offers it, on the **Free** plan. If it didn't offer it, go to **Storage** → **Create Database** → **Neon**, connect it to the project, and redeploy. Turn on Neon's preview branching, so previews never run migrations on your real data.

#### 3. Fill in the settings

Type each value exactly, with no quotes.

| Setting | What to put |
|---|---|
| `DASHBOARD_PASSWORD` | A new password for your first login. Don't reuse another one. |
| `CRON_SECRET`, `BETTER_AUTH_SECRET` | Each a different long random value: `openssl rand -hex 32`. Nobody types them again. |
| `CREDENTIALS_KEY` | `openssl rand -base64 32`. Keep a copy somewhere safe: without it, saved app passwords can't be read and everyone has to enter theirs again. Set a different one for Preview. |
| `RESEND_API_KEY` | The key from step 1. |
| `EMAIL_FROM` | Like `Gigs <login@yourdomain.com>`. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | The two keys from step 1. |

To change a setting later, edit it under **Settings** → **Environment Variables**, then open **Deployments**, tap **⋯** next to the top one, and choose **Redeploy**. Changes only apply after a redeploy. Add your domain under **Settings** → **Domains**, and password-protect previews under **Settings** → **Deployment Protection**.

#### 4. Become the owner and check it

1. Open the app and log in with `DASHBOARD_PASSWORD`. Don't enter your email on the login page first: that makes a separate empty account and uses up the address.
2. Add your email from the dashboard and confirm it. The password stops working, and you sign in by link from then on.
3. Fill in Settings → Calendar, then open `/status` and tap **Sync now**. The newest of **Last 10 syncs** should say **OK** and how many events it read.
4. Do one test move: make an all-day event called `Test hold` in your holds calendar and sync, move it to Gigs and sync. **Holds moved into Gigs** should go up by one. If it stays at 0, the move isn't being recognised, and converted holds would count as new jobs. Delete the event and sync once more.

Settings → Users shows you everyone's email and last sync, and lets you remove someone. You can't see their gigs there.
## How the app reads your gigs

- **Titles** can have the name, price and place in any order, like `Kaller job 600 neemas hachaim`, `neemas hachaim 600 Kaller` or `Kaller $600 at boro park`. The price is optional and can be written `600`, `$600`, `1,200` or `1.5k`. Writing `job` or `hold` is optional too.
- **Names and places are learned** from all your titles. Once `neemas hachaim` has been a place in one title, it's read as the place wherever it shows up. For a name or place the app hasn't seen yet, put `at` before the place (`Shmuli 500 at Ateres Chynka`) or a comma between them, or keep the old order with the name first. Every sync re-reads all the titles, so old entries pick up what it learns. If your calendar was an everyday one before a certain date, set **Track from** under Settings → Calendar, so old titles don't teach it wrong names and places.
- **The calendar decides** whether something is a job or a hold. If the title says `job` or `hold` and disagrees, the event shows up under **Needs attention** at the bottom of the dashboard.
- **The dashboard** has three tabs at the bottom. The filters at the top (dates, person, place, lead time) apply to Overview and Gigs, and stay set when you switch. The date range starts on **All time**; **This month** shows where you need to be this month.
  - **Overview** has the numbers. The tiles count jobs, holds and wanted dates; the charts and the lead-time numbers (shortest, typical, average, longest) count booked jobs only. Tap a tile to see the gigs it counts: **Upcoming jobs**, **Holds**, **Earned** (jobs played, latest first), **Lead time** (longest first) and **Asked, but not free**. Tap a bar in **Lead time** to see those jobs, shortest lead time first, or a month in **Jobs by month** to see that month's jobs, soonest first.
  - **Gigs** has a card for each gig: the date, person, place, price, whether it's booked or on hold, its lead time and how soon it is. Choose **Upcoming**, **Completed** or **All**, which calendar to show, and how to sort (date, lead time or price, either way).
  - **Settings** has **People**, **Places** and **Rules**. See Names and places below.
- **Lead time** is how far ahead a gig was booked: from the day the event was made to the day of the gig. For a hold that became a job, it counts from when the hold was made, as long as the event was moved into Gigs rather than made again; the card also shows how far ahead it was confirmed.
- **Each person's numbers:** pick someone under **Filter → Person** to see their card: what they usually pay (the typical price, with their lowest, highest and average), jobs played and coming up, money earned, how far ahead they book, their last and next gig, how often their holds became jobs, and where they usually book him.
- **Wanted dates** are for when someone asks and he isn't free. Put them in a calendar named `Wanted`, written like any other title (`Kaller 800 boro park`). They're left out of jobs, holds and money, and shown on their own as a count on the dashboard and on each person's card. The calendar is optional; nothing changes until it exists.
- **When a hold is confirmed**, move the event into Gigs rather than making a new one. That's how the app knows the hold became a job, and when.
- **Names and places** are often written a few ways (`Kaller`, `Kaler`, `R' Kaller`). The app puts spellings that match into one person or place, shown as the spelling he writes most. Nothing in the calendar changes.
  - **Settings → Rules** decides what counts as a match, separately for people and places: ignore spaces and punctuation, word order, double letters, letters that sound the same (`Friedman` = `Fridman`, `Schwartz` = `Shvartz`), one typo in a name of 5 or more letters, and a list of words to leave out (`mr`, `rabbi`, `the`). **Back to defaults** undoes changes.
  - **Settings → People** (and **Places**) lists each one with the ways it's written. Tap one to change how it shows (**Show as**), move a spelling to someone else or to a new person of its own, or merge it into another person. Whatever you set by hand stays that way even if the rules change; new spellings that match still join it. **Let the rules decide again** forgets what was set by hand for that one.
  - Changes show on every tab right away, with no sync needed.
- **Titles it can't read** show up under **Needs attention**. Fix the title in Calendar and the next sync picks it up.
- **Syncing** happens once a day early in the morning (New York time), whenever you open the dashboard (if the last sync was more than 10 minutes ago), and when you tap **Sync now**.

## What the app can and can't see

- It reads events from only the calendars named in your settings. It sees the names of your other calendars, so the status page can list them, but never opens their events.
- It never adds, changes or deletes anything in your calendar.
- It keeps a copy of those gigs' titles and dates in the app's database, to work out the stats. Other users can't see them.
- Your app password is stored encrypted in that database and never shown again. It can open more of your iCloud than the app uses (Mail, Contacts, other calendars), so delete it at account.apple.com if you stop using the app.
- Whoever runs the deployment controls the database and the key. `/privacy` says this plainly.
- Delete account in Settings → Account removes everything about you. Deleting the app password at Apple is a separate step only you can do.

## Settings reference

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. The Neon integration sets it on Vercel. |
| `DATABASE_URL_UNPOOLED` | no | Direct (non-pooled) connection, used for migrations when set. Neon sets it on Vercel. |
| `CRON_SECRET` | yes | Vercel sends it with the daily cron request. |
| `CREDENTIALS_KEY` | yes | Encrypts saved app passwords. 32 bytes in base64: `openssl rand -base64 32`. To replace it, add `CREDENTIALS_KEY_2`; old values still read. Use a different one on previews. |
| `BETTER_AUTH_SECRET` | yes | Signs session cookies. Any long random text. Changing it logs everyone out. |
| `BETTER_AUTH_URL` | no | The app's address, if the Vercel one isn't right, such as your own domain. |
| `RESEND_API_KEY`, `EMAIL_FROM` | yes | Sends sign-in links. `EMAIL_FROM` looks like `Gigs <login@yourdomain.com>`, on a domain verified in Resend. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | yes | The bot check on the sign-in form. Without both, a deployment won't send links. |
| `DASHBOARD_PASSWORD` | until the owner adds his email | The owner's first login. It stops working once his email is confirmed. |
| `ICLOUD_EMAIL`, `ICLOUD_APP_PASSWORD`, `GIGS_CALENDAR`, `HOLDS_CALENDAR`, `WANTED_CALENDAR`, `APP_TIMEZONE`, `YOUR_NAME` | no | Only for an owner who set the app up before accounts, until he saves Settings → Calendar. Nobody else's account reads them. |
## For developers

Next.js 16 (App Router), Tailwind 4, Prisma 7 on Postgres, Better Auth, `tsdav` for CalDAV, `node-ical`, `recharts` and Vitest. `PLAN.md` has the design and `MULTI_ACCOUNT_PLAN.md` the move to accounts.

### Running it locally

You need Node 20+ and a local Postgres.

```sh
npm install
cp .env.example .env.local   # point DATABASE_URL at local Postgres; set CRON_SECRET and CREDENTIALS_KEY
npx prisma migrate deploy    # creates the tables; this command reads DATABASE_URL from .env or the shell
npm run seed:demo            # a demo user with ~150 made-up gigs (see below)
npm run dev
```

To sign in, enter any email. Without `RESEND_API_KEY`, `next dev` prints the sign-in link to its log instead of sending it.

`seed:demo` makes a user `demo@gigdash.invalid` and replaces only that user's rows. It refuses a database that isn't on this computer unless you pass `--force`: `npm run seed:demo -- --force`.

### Checks

```sh
npm test          # the logic, with no database
npm run test:db   # keeping users apart, against a real Postgres on this computer
npm run lint
npm run build
```

`test:db` uses `DATABASE_URL` from the shell or `.env.local` (never `.env`), makes its own users, and removes them afterwards.

### Layout

- `src/lib/`
  - `db.ts`, `user-scope.ts`: the database client, and `forUser`, the only way to reach a user's tables.
  - `auth.ts`, `dal.ts`, `owner-login.ts`, `login.ts`: Better Auth, the current user, and the owner's password until he adds his email.
  - `limits.ts`, `counters.ts`: rate limits and the daily email cap.
  - `credentials.ts`, `settings-store.ts`: encrypted app passwords and each user's calendar settings.
  - `accounts.ts`, `accounts-store.ts`: devices, the owner's user list, deleting an account.
  - `parse-title.ts`, `ics.ts`: pure parsing.
  - `caldav.ts`: iCloud fetch, read-only.
  - `sync.ts`: the pure sync planner. `run-sync.ts` applies it and records a `SyncRun`; `sync-all.ts` is the cron's loop over users.
  - `stats.ts`, `filters.ts`: dashboard numbers and URL filters.
  - `names.ts`: pure spelling matching; `names-store.ts`: saved names and rules; `gigs.ts`: loads the gigs with each spelling swapped for its person or place.
- `src/proxy.ts`: sends anyone without a session cookie to `/login`. It lets `/privacy` through and skips `/api/`, because `/api/sync` checks the cron secret or the session itself.
- `src/app/`: the dashboard (`page.tsx`), its server actions (each takes the user from the session), `/status`, `/login`, `/privacy`, `/api/auth`, `/api/sync`, the manifest and the icons.
- `scripts/seed-demo.ts`, `scripts/vercel-build.sh`.

### Security

- **Logins** are one-time links, stored hashed, valid for 15 minutes. Sessions are database rows, so each can be ended.
- **Abuse:** Turnstile on the sign-in form, limits per IP and per mailbox, and a daily email cap.
- **App passwords** are AES-256-GCM encrypted with the user's id as additional data, and only decrypted inside the sync and the connection checks. `CREDENTIALS_KEY` must be different on previews.
- **Users are kept apart in two layers.** `forUser` adds the user to every query, and lint refuses their tables on plain `db`. It also runs each query in a transaction as the `gigdash_user` role, with `app.user_id` set, where row-level security holds even for a nested write or raw SQL.
- **What row-level security doesn't cover:** plain `db` connects as the role that owns the tables, which it doesn't apply to. Better Auth, the cron's list of users, the owner's list and deleting an account need that. A nested read such as `db.user.findMany({ select: { gigs: true } })` gets past both layers, so keep plain `db` to those few uses. It's protection against mistakes in this code, not against someone who can run any SQL: they could leave the role.

### Database changes

Edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>`, and commit the new folder in `prisma/migrations/`. On Vercel, `scripts/vercel-build.sh` (the `buildCommand` in `vercel.json`) runs `prisma migrate deploy` before `next build`. It uses `DATABASE_URL_UNPOOLED` when set, because Neon's `DATABASE_URL` goes through a connection pooler. It skips migrating when no database is connected yet. Preview deployments migrate whichever database their environment points at.

A new table with a `userId` needs, in its migration, `ENABLE ROW LEVEL SECURITY`, a policy and a grant to `gigdash_user` (see `6_row_level_security`), and its name added to `user-scope.ts` and the lint rule. `npm run test:db` fails until then.

### Icons

`src/app/icon.svg` is the master. `src/app/apple-icon.png` (180px), `public/icon-192.png` and `public/icon-512.png` are renders of it without the rounded corners, since iOS and Android round them. Re-render them if the SVG changes.

### Deploying

- The Deploy button clones the repo's default branch, and it only works for other people while the repo is **public**. Nothing secret is in the repo; all secrets live in Vercel's settings.
- The daily cron is in `vercel.json` (10:00 UTC). Vercel's free Hobby plan allows one cron run a day, at some point within that hour, and Vercel only runs crons on production. To try it on a preview, send the same request yourself: `curl -H "Authorization: Bearer <CRON_SECRET>" <address>/api/sync`.
