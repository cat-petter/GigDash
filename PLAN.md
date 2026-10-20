# Gigs (repo: GigDash) — Build Plan

## Context

Your cousin is a musician who books gigs and puts them in Apple Calendar. He wants a dashboard of stats about those bookings without changing how he works. Apple Calendar stays the one place he enters and views his schedule. The app only **reads** it.

What we know about how he enters gigs (from the screenshots and his answers):
- Two gig calendars, separate from his personal one (green):
  - **"Gigs"** (blue): confirmed jobs.
  - A **holds calendar** (red): name not confirmed yet.
- When a hold is confirmed, he edits the event and moves it into "Gigs".
- Titles were `<person> <job|hold> [price] [location]`; the parser now takes any order (see Title parser). Real examples:
  - `Kaller job 600 neemas hachaim`
  - `Kaller hold`
  - `Yitsy korblue job brooklyn` (a two-word, lowercase name with no price)
- Gigs are **all-day** events.
- He'll start adding a price to new titles. Older events won't have one.

The stats he asked for:
- **Lead time** (how far in advance he's booked), overall and per person, and he wants to filter by it.
- **Money** by location and by person.
- **Job counts** overall, by location and by person.
- **Holds** tracked as well.

Decisions already made in our conversation:
- A web app on Vercel that he adds to his Home Screen. No native app (there's no Mac to build one).
- The app reads his calendar over iCloud's calendar protocol (CalDAV). No Shortcuts.
- No calendar owned by the app, and no merged calendar view inside the app. Without a clean two-way sync, that would just confuse him.
- **Deployed on his own accounts** (tentative, not confirmed yet). He pastes his own Apple app-specific password into Vercel, and you never handle it. The code is the same either way; only the README setup differs.

## Architecture

- **Framework:** Next.js 16 (App Router, TypeScript) and Tailwind 4, hosted on Vercel. (Originally Next 14, but 14.x is out of support and `npm audit` flags unpatched critical and high advisories in its newest release; 16 audits clean.)
- **Database:** Postgres through Vercel's one-click Neon integration, accessed with Prisma 7 through the `@prisma/adapter-pg` driver adapter. The integration sets `DATABASE_URL` automatically, so he doesn't need a separate Neon sign-up.
- **Reading the calendar:** `tsdav` connects to `https://caldav.icloud.com` with his Apple ID email and app-specific password. It fetches **only** the two gig calendars, looked up by name from environment variables. His personal calendar is never fetched.
- **Reading event data:** `node-ical` parses each event's raw iCalendar text.
- **Charts:** `recharts`, using the dataviz skill's reference palette and mark specs. Dark mode gets its own dark steps from that palette; his phone runs in dark mode.
- **When syncing happens:** Vercel's free (Hobby) plan limits cron jobs to about **once a day**, so three triggers are combined:
  1. A daily cron job.
  2. An automatic sync when the dashboard opens, if the last sync is more than 10 minutes old. Page load waits about 2 seconds for it.
  3. A "Sync now" button.
- **Stats computed in memory:** his data is a few hundred rows at most. The app loads the filtered rows and computes stats in plain TypeScript functions. That's simpler than SQL aggregation and easy to unit test.

## Data model (`prisma/schema.prisma`)

```
Gig
  uid           String  @unique   // the event's calendar UID; the key that survives moving Holds→Gigs
  rawTitle      String
  calendar      "gigs" | "holds"
  status        "job" | "hold"     // decided by which calendar the event is in, not by the title word
  person, personKey               // display name + lowercase/trimmed key for grouping
  price         Int?              // whole dollars; null = not entered
  location, locationKey
  gigDate       Date              // all-day DTSTART
  bookedAt      DateTime?         // the event's CREATED timestamp (when he first put it in his calendar)
  leadDays      Int?              // gigDate − bookedAt, in days (America/New_York)
  heldAt        DateTime?         // first seen in holds calendar
  confirmedAt   DateTime?         // first seen in Gigs after being a hold (uses LAST-MODIFIED if present)
  titleKeyword  "job" | "hold"?   // the keyword the title used; ≠ status → keyword/calendar mismatch
  parseError    String?           // title couldn't be parsed → shown in "Needs attention"
  recurring     Boolean           // has an RRULE → only the first date is used, and it's flagged
  deletedAt     DateTime?         // event disappeared from both calendars (hold fell through / cancelled)
  firstSeenAt, lastSeenAt, createdAt, updatedAt

SyncRun
  startedAt, finishedAt, ok, message, fetched/created/updated/deleted counts
```

Rules:
- **Moving calendars.** Rows are keyed by UID. A hold moved into "Gigs" updates the same row: status flips to `job` and `confirmedAt` is set. That gives hold→job conversion and time-to-confirm.
- **Calendar vs. title.** The calendar decides the status. If the title's keyword disagrees (for example, it's in "Gigs" but still says "hold"), the calendar wins and the event is flagged in "Needs attention".
- **Deleted events.** An event that vanishes from both calendars is soft-deleted and left out of stats. A deleted hold counts as "fell through" in the holds stats.
- **Missing booking date.** If `CREATED` is missing, `bookedAt` falls back to `firstSeenAt`, but only for events that first appeared *after* the first sync. Events from the initial backfill without `CREATED` get `leadDays = null` and are left out of lead-time stats instead of getting a fake value.
- **Lead time for converted holds.** It's measured from when the hold was first entered, since that's when the client reached out. The time from hold to confirmation is shown as its own stat.
- **Repeating events** aren't expected for gigs. If one appears, only the first date is used and the event is flagged.

## Title parser (`src/lib/parse-title.ts`)

Any order. `job`/`hold`/`on hold` are optional (only used to flag calendar mismatches) and also split parts.
- **Price:** any price-looking token (`600`, `$600`, `600$`, `1,200`, `1.5k`); one with `$` or `k` beats a bare number.
- **Location:** words after `at`/`@`.
- **Lexicon:** `buildLexicon(titles)` learns people (words before the keyword) and places (words after it, or after `at`) from all titles, plus the unknown half of two-part titles. Known phrases are matched anywhere (longest first). `planSync` builds it from every title each sync, so all old rows get re-read.
- **Fallback:** parts are split by keyword, price, `,`, ` - `, etc. The first unknown part is the person, the rest is the location. A single unsplit unknown run is all person.
- **No person found:** `parseError` "No name in the title", shown in "Needs attention".
- **Grouping:** names are grouped by a normalized key (lowercase, whitespace collapsed), so `Kaller` and `kaller` count as one person. Typos like `Kallr` are not merged in v1.

## Sync (`src/lib/caldav.ts`, `src/lib/ics.ts`, `src/lib/sync.ts`)

1. **`caldav.ts`** logs in, lists calendars, matches `GIGS_CALENDAR` and `HOLDS_CALENDAR` by display name, and fetches every event in each. If a name isn't found, it errors and lists the calendar names that do exist.
2. **`ics.ts`** turns raw iCalendar text into `{ uid, title, gigDate, created, lastModified, hasRRule }`. This is a pure function.
3. **`sync.ts`** combines the fetched events with the existing rows and returns the writes to make. This is also a pure function, so it's tested with sample data. A thin wrapper applies the writes in one transaction and records a `SyncRun`.
4. **`/api/sync`** accepts either:
   - `GET` from the Vercel cron job, checked with `Authorization: Bearer $CRON_SECRET`, or
   - `POST` from the logged-in dashboard ("Sync now").

## Dashboard (`src/app/page.tsx`, mobile-first, single column on phone)

Filters are stored in the URL query string, so the page renders on the server and filtered views can be bookmarked. The filter bar is one row:
- Date range: this year, last 12 months, all time, or custom.
- Person.
- Location.
- Status: jobs, holds or all.
- **Lead-time bucket:** under 1 week, 1–4 weeks, 1–3 months, 3+ months.

Sections, top to bottom:
1. **Header:** "last synced N min ago" and a Sync now button.
2. **Stat tiles:**
   - Jobs.
   - Earned (past jobs) and Upcoming (future jobs). Price is the agreed amount; the app can't know whether he was actually paid.
   - Median and average lead time.
   - Open holds, and the hold→job rate.
3. **Lead time:**
   - A histogram by lead-time bucket.
   - A per-person table: count, average and median lead days. Tapping a row filters to that person.
4. **Money:**
   - Bar charts of dollars by person and by location. The top 8 are shown and the rest are grouped as "Other".
   - A note like "N jobs have no price", so totals aren't misleading while older events lack prices.
5. **Job counts:** bars by month, by person and by location.
6. **Needs attention:** titles that couldn't be parsed, jobs with no price, and keyword/calendar mismatches.
7. **Gig list:** a sortable table of the filtered gigs (date, person, location, price, lead days, status).

Every chart has hover and tap tooltips, and a table sits next to it. Single-series bars use palette slot 1 (blue). Wherever jobs and holds appear together: jobs use slot 1 (blue), holds use slot 2 (orange).

Other pages:
- **`/status`:** the diagnostics page. It shows the calendars found on the account, the last 10 sync runs, and how many events lack `CREATED`. This is where we confirm the live iCloud connection actually works.
- **`/login`:** a single password field, checked against `DASHBOARD_PASSWORD`. `src/proxy.ts` (Next 16's name for middleware) sets and checks a signed cookie that lasts 180 days.
- **Home Screen support:** `public/manifest.webmanifest` and an apple-touch-icon, so "Add to Home Screen" gives him a proper app icon that opens full-screen.

## Files

```
prisma/schema.prisma
src/lib/{parse-title,ics,caldav,sync,stats,filters,auth,db}.ts  (+ *.test.ts for parse-title, ics, sync, stats)
src/proxy.ts
src/app/{layout,page}.tsx, src/app/login/page.tsx, src/app/status/page.tsx, src/app/api/sync/route.ts
src/components/{FilterBar,StatTile,BarCard,LeadTimeHistogram,GigTable,SyncButton}.tsx
scripts/seed-demo.ts        # ~150 realistic fake gigs, so the UI can be built and demoed without iCloud
vercel.json                 # daily cron → /api/sync
.env.example, README.md, public/manifest.webmanifest + icons
```

Environment variables:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Set automatically by the Neon integration. |
| `ICLOUD_EMAIL` | His Apple ID email. |
| `ICLOUD_APP_PASSWORD` | His app-specific password. |
| `GIGS_CALENDAR` | Defaults to `Gigs`. |
| `HOLDS_CALENDAR` | The holds calendar's name (still unknown). |
| `DASHBOARD_PASSWORD` | The password for the dashboard login. |
| `CRON_SECRET` | Lets only the Vercel cron job trigger a sync. |
| `APP_TIMEZONE` | Defaults to `America/New_York`. |

## README

- **Developer section:** local setup, running tests, and seeding demo data.
- **"Setting it up (for [cousin])" section**, in very plain language, one action per step:
  1. Make an app-specific password at account.apple.com → Sign-In and Security → App-Specific Passwords. The README explains in one sentence that it can be revoked there at any time.
  2. Create a GitHub account if needed, then click the "Deploy to Vercel" button. This clones the repo and creates the Vercel project.
  3. In Vercel → Storage, add Neon Postgres (one click).
  4. Paste the environment variables into Vercel's settings. Each one gets a one-line explanation.
  5. Open `/status` and check that both calendars show up.
  6. Open the site on his iPhone → Share → Add to Home Screen.
- A short "What the app can and can't see" note: it reads only the two named calendars and never writes to his calendar. The password is kept only in Vercel's encrypted settings.
- A tentative note: if he'd rather you host it, the steps are the same; you just enter the values instead of him.

## Build order

1. Scaffold the project (Next, Tailwind, Prisma, Vitest), write the schema, and build the title parser with tests using his real titles.
2. Build `ics.ts` and the pure sync logic, with tests: create, update, hold→job move, delete, missing `CREATED`, repeating event.
3. Add the CalDAV fetch, `/api/sync`, `SyncRun` records and the `/status` page.
4. Write `stats.ts` and `filters.ts`, with tests: buckets, median, "Other" grouping, earned vs. upcoming.
5. Build the dashboard UI against the seeded demo data.
6. Add login, the Home Screen manifest and the cron config.
7. Write the README.
8. Commit and push to `claude/modest-cori-l4c5ho`.

## Progress (kept short; read this first after a context reset)

- **Done, one commit each:** steps 1–8. Step 7 also added DB migrations: `prisma/migrations/0_init`, `npm run db:migrate` (`prisma migrate deploy`), `scripts/vercel-build.sh` (vercel.json `buildCommand`: migrate if a DB URL is set, then `next build`), and `prisma.config.ts` prefers `DATABASE_URL_UNPOOLED`.
- **Step 8 done:** everything is pushed to `claude/modest-cori-l4c5ho` (no PR). The repo is private and this branch is its default branch; the README's Deploy button only works for others once it's public. Still unverified: live iCloud (first real check is his `/status`).
- **Step 6 files:** `src/app/login/{page,LoginForm,actions}.tsx|ts` (server action sets the 180-day cookie; 1s pause on a wrong password), `src/proxy.ts` + `src/proxy.test.ts` (matcher skips `/api/`, `_next`, png/svg/ico/webmanifest), `src/lib/session.ts` (`requireLogin` backstop in both pages), `src/app/manifest.ts`, `src/app/icon.svg` (master icon; PNGs `src/app/apple-icon.png`, `public/icon-{192,512}.png` rendered from it with Playwright), `vercel.json` (cron 10:00 UTC daily). Layout: noindex, theme-color, `colorScheme: "light dark"`.
- **Redesign (after step 8, from feedback: too much scrolling, too complicated):** four tabs in the URL (`tab` in `Filters`: overview · people · places · gigs) with a fixed bottom `TabBar`. Overview = 4 tiles + lead histogram + by-month chart. People/Places = `RankList` (sortable by gigs/money/lead, from `stats.people`/`stats.places`). Gigs = collapsible `NeedsAttention` + `GigTable`. `FilterBar` = date pill + Filter panel + removable chips. Dropped: chart/table toggle, money/count charts by person and location, `PersonLeadTable`.
- **Any-order titles (his request):** `parse-title.ts` rewritten with a learned lexicon; `planSync` re-reads every title each sync. See Title parser.
- **Wanted (his request: asked but not free):** optional third calendar (`WANTED_CALENDAR`, default `Wanted`, read only if it exists) → status `wanted` (migration `1_wanted`). Excluded from jobs/holds/money/hold rate and the default "Jobs and holds" view; shown via `tiles.wanted` (Overview line linking to `show=wanted`), the Show filter, and People/Places counts. Color `--series-3` `#1f9e89` / dark `#24a08b` (validated).
- **Person card (his request):** `personProfile(rows, filters, today)` in stats.ts → `PersonProfile` component at the top of Overview when `filters.person` is set (ignores Show/Booked-ahead filters). `Ranked.typicalPrice` (median) feeds a "Usual price" sort in `RankList`.
- **One page (his feedback, Oct 2026):** tabs, `RankList`, `GigTable`, `TabBar` and the Show filter are gone; `Filters` = range/from/to/person/location/lead. Overview = tiles, booked-ahead card (shortest/typical/average/longest, jobs only), lead histogram and by-period chart (jobs only), `NeedsAttention` at the bottom. `TRACK_FROM` (`trackFrom()` in dates.ts) drops events before a date from sync and deletes older rows, so old everyday-calendar titles don't pollute the lexicon; shown on /status. `main` is now the default branch; push there too.
- **Renamed to "Gigs"** in the UI, manifest and README. Kept internal names as they were: repo `cat-petter/GigDash`, npm package, `gigdash_session` cookie, local DB name.
- **Step 5 files:** `scripts/seed-demo.ts` (`npm run seed:demo`), `src/lib/gigs.ts` (`loadGigRows`), `icloudConfigured()` in caldav.ts, components `Pending` (transition + `FilterLink`), `FilterBar` (pill selects), `StatTile`, `BarCard` (recharts, chart/table toggle), `PersonLeadTable`, `NeedsAttention`, `GigTable`. Dev server for screenshots: `next dev -p 3100`; Playwright scripts in the scratchpad.
- **Files beyond the plan:** `src/lib/dates.ts` (`Day` = `"YYYY-MM-DD"` string, zone helpers), `src/lib/format.ts` (`timeAgo`, `formatMoney`, `plural`), `src/lib/run-sync.ts` (`runSync`, `startSync`, `autoSync`, `syncStatus`), `src/components/Card.tsx`. `auth.ts` already exists with tests (step 6 only needs the login page and `src/proxy.ts`).
- **Stats API:** `computeStats(rows: GigRow[], filters, today)` returns `tiles`, `leadHistogram`, `byPeriod`; `personProfile(rows, filters, today)`. Also `filterOptions(rows)` and `needsAttention(rows)`. Filters live in the URL: `parseFilters`, `withFilter`, `toQuery`.
- **Local env:** Postgres 16 is running with the `gigdash` DB, migrated (0_init baselined); `.env` exists (gitignored).
- **Chart colors (checked with the dataviz validator):** jobs `#2a78d6` / dark `#3987e5`, holds `#eb6834` / dark `#d95926`.

## Verification

- `npm test`: parser, iCalendar parsing, sync logic and stats.
- `npm run build`: type-checks and confirms the production build succeeds.
- Local Postgres (installed with apt in the container), then `npm run db:migrate` and `npm run seed:demo`, then `npm run dev`.
- Playwright screenshots at iPhone width (390px) in light and dark mode. Check the filters, drill-down, tooltips and "Needs attention", and look for overflow or overlapping labels.
- **What I can't verify from here:** the live iCloud connection, since it needs his password. The first real test is his `/status` page after he deploys. It shows:
  - which calendars were found,
  - whether events carry `CREATED` (this decides whether the lead time for his older gigs is available), and
  - whether moving a hold into Gigs keeps the same event ID (the README asks him to do one test move).

## Open items (don't block building; they're settings to fill in later)

- The holds calendar's exact name. It goes in `HOLDS_CALENDAR`.
- The price format he'll actually type, such as `600` vs. `$600`. The parser accepts both.
- Hosting: decided. He makes GitHub + Vercel accounts and the Apple app password and sends the sign-ins; the user does the host steps (README "Setting it up for him") while signed in as him. Neon is created inside Vercel, so there's no Neon account.
