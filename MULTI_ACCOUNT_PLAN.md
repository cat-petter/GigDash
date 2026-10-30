# Multiple accounts — Plan

## Goal

Let one deployment serve several people, each with their own login, iCloud calendars, gigs, names and settings, and none able to see another's. The live app keeps running on `main` the whole time. All of this work happens on the `multi-account` branch and only reaches `main` at the cutover (phase 8).

## Keeping the live app safe

- **Work only on `multi-account`.** It lives in its own worktree (`.claude/worktrees/multi-account`), so the main checkout stays on `main`.
- **Don't push the branch until preview deploys have their own database.** `scripts/vercel-build.sh` runs `prisma migrate deploy` on every build, and README says "Preview deployments migrate whichever database their environment points at". If the Vercel project's Preview `DATABASE_URL` is the production database, the branch's first push would run the new migrations against the live data. Before pushing, do one of these:
  1. Turn on Neon's preview branching in the Vercel Neon integration, so each preview gets a copy of the database (recommended), or
  2. Point Preview's `DATABASE_URL` and `DATABASE_URL_UNPOOLED` at a separate Neon database, or
  3. Stop the branch from deploying: add `"git": { "deploymentEnabled": { "multi-account": false } }` to the branch's `vercel.json`, and remove it before merging.
- If the live app is his own copy made with the Deploy button (a separate repository in his GitHub account), pushes to `cat-petter/GigDash` don't deploy it at all. Check which repository the live Vercel project tracks.
- **The migration must keep his data and his login.** It assigns every existing row to an "owner" account, and his current `DASHBOARD_PASSWORD` keeps working, signing in as that owner, until he sets an email and password (phase 2).

## Decisions (defaults, unless you say otherwise)

- **Who can sign up: by invite only.** The owner creates invite links in Settings. There's no open sign-up page, since every account stores someone's Apple app password. Open sign-up would need email verification and abuse limits; skip it for now.
- **How people log in: email and password.** Passwords are hashed with `scrypt` from `node:crypto`, the same module `auth.ts` uses already, so nothing new to install and no email service to set up. Magic links or "Sign in with Apple/Google" can come later through an auth library.
- **Sessions stay stateless signed cookies,** as now, but the cookie also carries the user's id: `<userId>.<expires>.<signature>`. Changing a user's password changes their signing key, which signs them out everywhere, as changing `DASHBOARD_PASSWORD` does today.
- **iCloud app passwords are stored encrypted** in the database (AES-256-GCM, key from a new `CREDENTIALS_KEY` env var). They're only decrypted inside the sync. The UI never shows one back; it only says "connected" and lets you replace or remove it.
- **This changes who holds the Apple passwords.** Today each person pastes theirs into their own Vercel project and nobody else sees it (README: "stored only in Vercel's encrypted settings"). With shared hosting, whoever runs the deployment holds everyone's app passwords, encrypted. Users should be told this when they connect, and README's security notes need rewriting.

## Phases

Each phase is one or more commits on `multi-account`, and `npm test` and `npm run build` pass after each.

### 1. Schema and migration

New models:

```
User
  id, email (unique, lowercase), passwordHash?   // null for the owner until he sets one
  isOwner        Boolean                          // can create invites
  name?          // replaces YOUR_NAME
  timeZone       // replaces APP_TIMEZONE, default "America/New_York"
  trackFrom?     // replaces TRACK_FROM / TRACKING_STARTED; null = everything
  createdAt, updatedAt

CalendarAccount   // one per user
  userId (unique), icloudEmail, icloudPasswordEnc   // AES-GCM: iv + tag + ciphertext
  gigsCalendar, holdsCalendar?, wantedCalendar
  updatedAt

Invite
  id, tokenHash (unique), createdById, usedById?, expiresAt, createdAt
```

Every existing model gets a `userId` with `onDelete: Cascade`, and its keys change to match:

| Model | Now | After |
|---|---|---|
| `Gig` | `uid @unique` | `@@unique([userId, uid])`, `@@index([userId, gigDate])` |
| `SyncRun` | — | `@@index([userId, startedAt])` |
| `SavedName` | — | `@@index([userId, kind])` |
| `PinnedSpelling` | `@@id([kind, key])` | `@@id([userId, kind, key])` |
| `MatchRule` | `kind @id` | `@@id([userId, kind])` |

The migration (`4_accounts`), written by hand so it's safe on the live data:
1. Create `User`, `CalendarAccount`, `Invite`.
2. Insert the owner: fixed id `owner`, `isOwner = true`, no email or password yet, `trackFrom = 2026-10-20` (today's `TRACKING_STARTED`).
3. Add `userId` to each table as nullable, set it to `owner` on every row, then make it `NOT NULL` and add the foreign keys.
4. Swap the old primary keys and unique indexes for the new ones.

Test it on a copy of the production database (a Neon branch) before merging: row counts match, and the dashboard shows the same numbers.

### 2. Logins

- `src/lib/auth.ts`: add `hashPassword` / `verifyPassword` (scrypt, random salt, `safeEqual`). Sessions sign `userId` and expiry, with a key made from `CRON_SECRET` plus the user's `passwordHash`.
- New `src/lib/dal.ts` (Next's "Data Access Layer" pattern, `node_modules/next/dist/docs/01-app/02-guides/authentication.md`): `currentUser = cache(async () => …)` reads the cookie, checks it, loads the user, and redirects to `/login` if any of that fails. `requireLogin` in `session.ts` becomes a wrapper around it.
- `src/proxy.ts` only does the cheap check (cookie present and signature valid). The real check is in the DAL, close to the data, as Next's guide recommends.
- `/login`: email and password fields. **Transition rule:** while the owner has no email, an empty email plus the correct `DASHBOARD_PASSWORD` signs in as the owner, and the dashboard asks him to set an email and password. Once he has, `DASHBOARD_PASSWORD` stops working.
- `/invite/[token]`: set email and password, then sign in. The token is single-use and expires after 7 days. Only its hash is stored.
- A log-out button in Settings.
- Rate-limit wrong passwords per email (keep the 1-second delay, add a lockout after repeated failures, stored on the user row).

### 3. Scope every query to the logged-in user

Every database call takes a `userId` and filters on it. Callers get it from `currentUser()`, never from the request body.

- `src/lib/gigs.ts`: `loadGigs(userId)`.
- `src/lib/names-store.ts`: every function takes `userId`. Watch out for the lookups by id (`savedName.update({ where: { id } })` and `delete`): check the row belongs to the user (`where: { id, userId }`, or `updateMany`/`deleteMany` with both) so a guessed id can't change someone else's names. Same for `pinnedSpelling` keys.
- `src/app/names-actions.ts`: pass `(await currentUser()).id` down.
- `src/app/status/page.tsx`: the counts and the last 10 runs, per user.
- `src/app/page.tsx`: per-user greeting, time zone and calendar names.
- Backstop: a Prisma client extension (`db.forUser(userId)`) that adds `userId` to every `where` and `data` for the scoped models, so a missed filter fails safe. Postgres row-level security is the stronger option. It needs a `SET LOCAL app.user_id` in each transaction, which doesn't fit Prisma's pooled connections as easily; leave it for later.

### 4. Settings that move from env vars to the database

| Env var now | Moves to | Fallback during the transition |
|---|---|---|
| `ICLOUD_EMAIL`, `ICLOUD_APP_PASSWORD` | `CalendarAccount` | The owner uses the env vars if he has no `CalendarAccount` yet |
| `GIGS_CALENDAR`, `HOLDS_CALENDAR`, `WANTED_CALENDAR` | `CalendarAccount` | Same |
| `APP_TIMEZONE` | `User.timeZone` | Same |
| `TRACK_FROM` | `User.trackFrom` | — (set by the migration) |
| `YOUR_NAME` | `User.name` | Same |
| `DASHBOARD_PASSWORD` | `User.passwordHash` | Until the owner sets one (phase 2) |

These stay as env vars: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `CRON_SECRET`, and the new `CREDENTIALS_KEY`.

Code changes:
- `src/lib/caldav.ts`: `connect(credentials)`, `fetchGigCalendars(credentials, names)` and `listCalendarNames(credentials)` take their inputs instead of reading `process.env`. The read-only fetch guard stays as is.
- `src/lib/dates.ts`: `appTimeZone()` and `trackFrom()` give way to the user's values. The pure date helpers don't change.
- New `src/lib/credentials.ts`: `encrypt` / `decrypt` with `CREDENTIALS_KEY`, and `calendarSettings(user)` that applies the owner's fallbacks.
- Settings gets a **Calendar** section: iCloud email, app password (write-only), calendar names, time zone, track-from date, and a "Test connection" button that lists the calendars found, as `/status` does now.

### 5. Sync per user

- `runSync(userId)` in `src/lib/run-sync.ts`. Everything in its transaction filters by `userId`: the `trackFrom` delete, `findMany`, the creates (with `userId` set), updates (`where: { userId_uid: … }`), `seen` and `delete`. This is the fix for the problem where one user's sync would mark everyone else's gigs deleted.
- The lock becomes per user: `` tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))` `` (a parameterized query, replacing the `$executeRawUnsafe` call). Two users can sync at once; one user's syncs still take turns.
- `backfill` (the "first sync" rule for missing `CREATED`) is counted per user, so each new account gets its own first sync.
- `latestRun`, `lastGoodRun`, `syncStatus`, `startSync` and `autoSync` take `userId`.
- `/api/sync` POST uses the logged-in user. The GET cron syncs every user with calendar settings, one after another, and returns a summary per user. `planSync` and the other pure functions in `sync.ts` don't change.
- Scale note: each sync takes a few seconds, and the cron route has `maxDuration = 60`. That's fine for a handful of users. Past roughly 10, the cron should only queue work (one job per user, through a queue service or one request per user), so it doesn't hit the time limit. Auto-sync on open and Sync now already keep each user fresh, so the daily cron is only a fallback.

### 6. Accounts UI

- Settings → **Account**: email, change password, log out.
- Settings → **People** (owner only): list of users and when each last synced, "Create invite link" (copy to clipboard), remove a user (deletes all their data through the cascade, after a confirmation).
- First-run screen for a new user with no calendar settings: a short "Connect your iCloud calendar" step with the app-password instructions from README, before the empty dashboard.

### 7. Tests, demo data, docs

- Unit tests: password hashing, session sign/verify with the user id (including a cookie from one user not working as another's), encrypt/decrypt round trip and tampering, invite token expiry and reuse, and the owner fallbacks in `calendarSettings`.
- An isolation test against a real Postgres (local or a Neon branch), run with `npm run test:db`: two users, sync user A with fixture events, and check user B's gigs, names and rules are untouched. Same for each `names-store` function with the other user's ids.
- `scripts/seed-demo.ts`: create a demo user and seed only that user's rows (today it wipes every table).
- README: new setup (invite-based), the env var table, the security notes about who holds the app passwords. PLAN.md: the data model.

### 8. Cutover

1. On a Neon branch made from production: run the migration, deploy the branch as a preview pointed at it, log in with `DASHBOARD_PASSWORD`, and check the numbers match production.
2. Add `CREDENTIALS_KEY` to Production in Vercel.
3. Merge `multi-account` into `main`. The production build runs the migration and the app keeps working: same data, same password, same iCloud env vars.
4. Owner sets an email and password, then fills in the Calendar section. After that, delete `DASHBOARD_PASSWORD`, `ICLOUD_*`, `*_CALENDAR`, `APP_TIMEZONE`, `TRACK_FROM` and `YOUR_NAME` from Vercel.
5. A later small change removes the env fallbacks from the code.

Rollback: before step 3, take a Neon backup (or branch) of production. If the merge goes wrong, revert the merge on `main` and restore that branch, because the old code can't read the new key layout.

## Not in scope for now

- Open sign-up, email verification, password-reset emails (the owner can issue a new invite instead).
- Sharing one calendar between several users, or teams.
- Billing and usage limits.
- Postgres row-level security (see phase 3).
