# Multiple accounts — Plan

## Goal

Let one deployment serve anyone who signs up. Each person has their own login, iCloud calendars, gigs, names and settings, and no one can see anyone else's. The live app keeps running on `main` the whole time. All of this work happens on the `multi-account` branch and only reaches `main` at the cutover (phase 9).

## Keeping the live app safe

- **Work only on `multi-account`.** It lives in its own worktree (`.claude/worktrees/multi-account`), so the main checkout stays on `main`.
- **Don't push the branch until preview deploys have their own database.** `scripts/vercel-build.sh` runs `prisma migrate deploy` on every build, and README says "Preview deployments migrate whichever database their environment points at". If the Vercel project's Preview `DATABASE_URL` is the production database, the branch's first push would run the new migrations against the live data. Before pushing, do one of these:
  1. Turn on Neon's preview branching in the Vercel Neon integration, so each preview gets a copy of the database (recommended), or
  2. Point Preview's `DATABASE_URL` and `DATABASE_URL_UNPOOLED` at a separate Neon database, or
  3. Stop the branch from deploying: add `"git": { "deploymentEnabled": { "multi-account": false } }` to the branch's `vercel.json`, and remove it before merging.
- If the live app is his own copy made with the Deploy button (a separate repository in his GitHub account), pushes to `cat-petter/GigDash` don't deploy it at all. Check which repository the live Vercel project tracks.
- **The migration must keep his data and his login.** It assigns every existing row to an "owner" account, and his current `DASHBOARD_PASSWORD` keeps working, signing in as that owner, until he adds his email (phase 2).

## Decisions

- **Open sign-up.** Anyone with the address can make an account by entering their email.
- **Magic-link login, no passwords.** Signing in sends a one-time link by email. There's no password to guess, reuse or leak, and nothing to reset. The account is only as safe as the person's email inbox, which is the same as any site with "forgot password".
- **Better Auth** (`better-auth`, with its magic-link plugin and Prisma adapter) instead of hand-written auth. Open sign-up exposes the login to strangers, so it should run on well-reviewed code. It brings database sessions (each can be revoked), rate limiting, and origin checks. Before starting phase 2, check that its current release supports Next 16 and Prisma 7.
- **Email through Resend.** See "Costs" below.
- **iCloud app passwords are stored encrypted** in the database (AES-256-GCM, key from a new `CREDENTIALS_KEY` env var). They're only decrypted inside the sync. The UI never shows one back.

## Costs

- **Resend:** the free plan sends 3,000 emails a month, at most 100 a day, from one domain. Pro is $20/month for 50,000. One login is one email, and a session lasts 90 days, so a few dozen users use a few dozen emails a month. The 100-a-day cap is the real limit: someone spamming the sign-in form could use it up and block everyone's logins, so the rate limits and bot check in phase 3 matter.
- **A domain, about $10–15 a year.** Resend only sends to other people's addresses from a domain you've verified (SPF and DKIM DNS records), and a `*.vercel.app` address can't be verified. The app can then live on that domain too.
- **Vercel and Neon stay on the free plans** for a few dozen users. Each user's gigs take a few hundred rows, so Neon's free storage holds a lot of users. Check Neon's current paid plans if it ever outgrows that.
- **Cloudflare Turnstile** (bot check on the sign-in form) is free.

## Security

Nothing is bulletproof. The aim is several layers, so no single mistake exposes anyone's data.

**What's at stake.** An Apple app-specific password isn't limited to the gig calendars. It also opens that person's iCloud Mail, Contacts and other calendars over the standard protocols. That makes the stored app passwords the most valuable thing in the database, and the app's main obligation to its users. The sign-up flow should say so plainly, and tell people they can revoke it at any time on account.apple.com.

**Logging in**
- Magic links are single-use, expire after 15 minutes, and only a hash of the token is stored.
- The link opens a "Sign in" button page instead of signing in immediately. Some email security scanners open every link in a message, which would use up a single-use link before the person taps it. The confirm page sends `Referrer-Policy: no-referrer`, so the token can't leak through the address bar.
- The sign-in form says "check your email" whether or not the address has an account, so it can't be used to find out who uses the app.
- Rate limits: per IP address and per email address for sending links (for example, 3 per email per 15 minutes and 10 per IP per hour), plus Better Auth's own limits on verifying. They're stored in Postgres so they hold across Vercel's instances.
- Cloudflare Turnstile on the sign-in form, so bots can't spend the email quota.
- Sessions are rows in the database, sent as an `httpOnly`, `Secure`, `SameSite=Lax` cookie, lasting 90 days. Log out removes the row. Settings shows the signed-in devices, with "log out everywhere".
- No "new device" email: every sign-in is already a link sent to the person's inbox, so it would only double the email.

**Keeping users' data apart**
- Every database read and write goes through one place (`src/lib/dal.ts`) that gets the user from the session. The user id never comes from the request body or URL.
- A Prisma client extension adds `userId` to every query on the user's tables, so a forgotten filter returns nothing instead of someone else's data.
- Postgres row-level security as a final backstop: every user table has a policy `userId = current_setting('app.user_id')`, and each request's queries run in a transaction that sets it. The sync and cron run as a separate database role. This is the most work in the security list; do it after the rest works (phase 8).
- Isolation tests (phase 8) for every query path, run against a real database.

**Stored app passwords**
- AES-256-GCM with the user's id as additional data, so an encrypted value copied onto another user's row won't decrypt.
- Each value is stored with a key version, so `CREDENTIALS_KEY` can be replaced without breaking stored values.
- `CREDENTIALS_KEY` is set only in Vercel's Production environment. Preview deployments get a different key, so a preview can't decrypt production data even if it reaches a copy of it.
- They're never logged, never sent to the browser, and erased when the user disconnects or deletes their account.
- The calendar connection stays read-only (`readOnlyFetch` in `caldav.ts` blocks anything but reads).

**Everywhere**
- Security headers in `next.config.ts`: a Content Security Policy, HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options`, and `Referrer-Policy`.
- Server actions and API routes check the request's origin (Better Auth does this for its own routes; Next does it for server actions).
- Password-protect preview deployments in Vercel (Deployment Protection).
- `npm audit` in the build, and Dependabot or Renovate on the repository.
- Account deletion in Settings removes every row for that user.
- A short privacy page saying what's stored and why. Strangers are trusting the app with an Apple password.

## Phases

Each phase is one or more commits on `multi-account`, and `npm test` and `npm run build` pass after each.

### 1. Schema and migration — done

Also pulled forward, so the app builds and behaves as before: every query and the sync take a `userId`, and for now every request acts as the owner (`OWNER_ID` in `src/lib/owner.ts`, returned by `requireLogin`). That covers most of phase 4's scoping and phase 6's per-user lock and sync queries. Checked on a local copy built from `main` with demo data: every row kept and assigned to the owner, the schema matching `schema.prisma`, a second user's sync leaving the owner's gigs and rules alone, a spelling unable to be pinned to another user's name, and deleting a user removing all their rows.

Better Auth's tables, generated with its CLI into `prisma/schema.prisma`: `User`, `Session`, `Account`, `Verification`, plus a `RateLimit` table. Added to `User`:

```
isOwner    Boolean   // sees the list of users; the existing data's owner
name?      // replaces YOUR_NAME
timeZone   // replaces APP_TIMEZONE, default "America/New_York"
trackFrom? // replaces TRACK_FROM / TRACKING_STARTED; null = everything
```

New:

```
CalendarAccount   // one per user
  userId (unique), icloudEmail, icloudPasswordEnc, keyVersion
  gigsCalendar, holdsCalendar?, wantedCalendar
  updatedAt
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
1. Create the new tables.
2. Insert the owner: fixed id `owner`, `isOwner = true`, email `owner@gigdash.invalid` (a placeholder; `.invalid` can never be a real address), `trackFrom = 2026-10-20` (today's `TRACKING_STARTED`).
3. Add `userId` to each table as nullable, set it to `owner` on every row, then make it `NOT NULL` and add the foreign keys.
4. Swap the old primary keys and unique indexes for the new ones.

Test it on a copy of the production database (a Neon branch) before merging: row counts match, and the dashboard shows the same numbers.

### 2. Logins — done

- `src/lib/auth.ts` is the Better Auth setup: Prisma adapter, magic-link plugin (15-minute links, only a hash stored), database sessions (90 days, cookie `gigdash.session_token`), rate limits stored in Postgres, `trustedOrigins` from the Vercel addresses. Endpoints the app doesn't use are turned off (`disabledPaths`).
- `src/app/api/auth/[...all]/route.ts` mounts Better Auth's handler.
- `src/lib/dal.ts`: `currentUser` (cached per request) and `requireUser`, which replace `session.ts`. `usesEnvCalendar(user)` keeps the iCloud env vars to the owner: anyone else would sync the owner's calendar into their own account. Other users see "coming soon" until phase 5.
- `src/proxy.ts` only checks that a session cookie is there. The login pages are always shown; `/login` itself sends signed-in visitors on (doing that in the proxy would loop on a stale cookie).
- `/login`: one email field (Turnstile comes in phase 3). The forms post to `/api/auth/…` from the browser, so Better Auth's rate limits apply; they don't apply to `auth.api` calls from server code.
- `/login/confirm`: the button page links land on, for sign-in links and the email confirmation.
- `src/lib/email.ts` sends with Resend (`RESEND_API_KEY`, `EMAIL_FROM`). Under `next dev` without a key it prints the email to the terminal.
- New pure helpers in `src/lib/login.ts` (`safeEqual`, `safeNext`, base URL and secret), tested without the database.
- **Owner transition:** while the owner has the placeholder email, the login page also offers `DASHBOARD_PASSWORD` (a small Better Auth plugin, `src/lib/owner-login.ts`, 5 tries a minute, 1 s delay when wrong). The dashboard shows "Add your email" until he does; confirming it uses Better Auth's change-email flow, and the password stops working.
- Settings → Account shows the email and Log out. The rest of that section is phase 7.
- New env vars: `BETTER_AUTH_SECRET` (falls back to a key made from `CRON_SECRET`), `BETTER_AUTH_URL` (optional; set to `http://localhost:3100` locally), `RESEND_API_KEY`, `EMAIL_FROM`. Without the Resend ones, deployed sign-in emails fail with a message; the owner's password still works.
- Vercel preview (2026-10-30): `RESEND_API_KEY` and `EMAIL_FROM` = `Gigs <onboarding@resend.dev>` are set for Preview, branch `multi-account` only. That test sender only delivers to the Resend account's own email; a verified domain is needed before anyone else can sign in (cutover step 1). DuckDNS can't be used: it has no MX records and only one TXT value. Sign-in by link was tested on the preview and works.
- Verified locally: sign-up by link, a new account sees none of the owner's data and can't sync (409), a used link is refused, log out deletes the session, the owner's password works then stops once his email is confirmed, the owner signs in by link, disabled endpoints return 404, tokens are stored hashed with a 900-second expiry.

### 3. Abuse protection — done

- Turnstile on the server for every "send me a link" request, with Better Auth's captcha plugin (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`). The widget is `src/app/login/turnstile.tsx`, hidden unless it needs a tap. A deployment missing either key refuses to send links and says so on the login page; the owner's password still works. `next dev` skips the check if neither is set. Any Content Security Policy added later must allow `challenges.cloudflare.com`.
- A request goes through, in order: Better Auth's limit (5 a minute per IP), Turnstile, 10 links an hour per IP, 3 links per 15 minutes per mailbox, 80 emails a UTC day. A later step never spends an earlier one's budget in reverse: a request with no valid token counts for nothing, so a script can't lock someone out by sending their email, and a blocked IP doesn't use up a mailbox's limit.
- `src/lib/limits.ts` has the numbers and rules; `src/lib/counters.ts` keeps the counts in the new `LimitCounter` table (migration `5_limits`), with one atomic statement per count. Addresses and IPs are hashed in the counter names. The daily cron removes ended counters.
- A mailbox ignores case and `+tags`, so `a+1@x.com` and `A+2@x.com` share a limit.
- The cap counts every email sent, including the owner's email confirmation, and an email that Resend then refuses. When it's reached, sign-in says to try again tomorrow, and `/status` shows the owner "80 of 80".
- Sync now: once a minute per user (429 with `Retry-After`, and the button says so). Syncing on open and the cron aren't counted.
- Verified locally against the dev server and the throwaway Postgres, with Cloudflare's published test keys: no token and a rejected token both refused with no counters spent; mailbox limit, including `+tag` and case spellings; IP limit; 8 parallel requests sending exactly 3 links; the cap at 79 → 80 → refused, shown on `/status`; a window ending starts over; Sync now 200 → 429 → 200; a production server with no keys refusing links.
- Verified on the preview (2026-10-30) with real Turnstile keys: no token and a forged token refused, and a full sign-in by link. Better Auth only trusts `x-forwarded-for` when it holds one address, and Vercel's requests pass that: the preview's `RateLimit` rows are keyed by IP, not `no-trusted-ip`.

### 4. Scope every query to the logged-in user — done

Done: `forUser(userId)` in `src/lib/db.ts` (the rules are in `src/lib/user-scope.ts`, with tests) puts the user's id on every `where` and new row for the users' tables, and refuses any operation it doesn't know. Lint refuses those tables on plain `db` in `src/`. It covers the top level of a query, so no nested writes on these tables, and raw SQL isn't scoped. The greeting's `YOUR_NAME` and the time zone and tracking date on `/status` show for the owner only until phase 5 moves them. Checked with two users on the throwaway Postgres: reads, guessed ids, handing a row over, names, rules, a rolled-back transaction, and a sync that left the other user's gigs alone. That check isn't committed, since it needs a database; phase 8 adds the lasting one.

Every database call takes a `userId` and filters on it. Callers get it from `currentUser()`.

- `src/lib/gigs.ts`: `loadGigs(userId)`.
- `src/lib/names-store.ts`: every function takes `userId`. Watch out for the lookups by id (`savedName.update({ where: { id } })` and `delete`): check the row belongs to the user (`where: { id, userId }`, or `updateMany`/`deleteMany` with both) so a guessed id can't change someone else's names. Same for `pinnedSpelling` keys.
- `src/app/names-actions.ts`: pass `(await currentUser()).id` down.
- `src/app/status/page.tsx`: the counts and the last 10 runs, per user.
- `src/app/page.tsx`: per-user greeting, time zone and calendar names.
- The Prisma extension (`forUser(userId)`) that adds `userId` to every `where` and `data` for those models.

### 5. Settings that move from env vars to the database — done

Done, with these choices:
- `src/lib/credentials.ts` has `encrypt`/`decrypt`, `calendarSettings` (no password in it, so pages never decrypt), `icloudCredentials` (only the sync and the connection checks call it) and the form's checks. `src/lib/settings-store.ts` reads and writes them. `CREDENTIALS_KEY` is 32 bytes in base64 and is key version 1; to replace it, add `CREDENTIALS_KEY_2`. Old values still read until they're saved again.
- Settings → Calendar is one form: name, iCloud email, app password, calendar names, time zone, track-from date. Saving signs in to iCloud first and refuses a wrong password or a calendar that isn't there, so nothing bad gets stored. An empty password keeps the saved one, unless the email changed: a saved password is only tried on the account it came with. Test connection and Disconnect are beside it.
- 10 iCloud sign-ins per 15 minutes per user from this form, so wrong passwords can't get an Apple account locked and the form can't be used to try stolen logins.
- The owner's fallback is all or nothing: until he saves the form, his name, time zone, calendar names and iCloud login come from the env vars, and the form starts filled in with them, so saving with the password empty moves them over. `TRACK_FROM` has no fallback, as planned: it's no longer read.
- Pulled forward from phase 6, so a connected account can use its calendar: Sync now and syncing on open work for any connected user. The cron still syncs only the owner until phase 6.
- A new user's empty dashboard links to Settings → Calendar, and the Settings tab now opens with no gigs.
- Verified locally against the throwaway Postgres, with `listCalendarNames` and `fetchGigCalendars` temporarily faked for one address: a wrong password and a missing calendar save nothing and keep what was typed except the password; a good save stores only ciphertext and the first sync uses the decrypted password; keeping the password; a changed email needing one; Test connection; the 11th sign-in refused; Sync now 200 → 429; Disconnect removes the row and keeps the gigs; the password never appears in the page; the owner moving from env vars to a saved account with the password empty; 375px wide. Then checked on the preview against real iCloud with `CREDENTIALS_KEY` set: the user confirmed it works (2026-10-31).

| Env var now | Moves to | Fallback during the transition |
|---|---|---|
| `ICLOUD_EMAIL`, `ICLOUD_APP_PASSWORD` | `CalendarAccount` | The owner uses the env vars if he has no `CalendarAccount` yet |
| `GIGS_CALENDAR`, `HOLDS_CALENDAR`, `WANTED_CALENDAR` | `CalendarAccount` | Same |
| `APP_TIMEZONE` | `User.timeZone` | Same |
| `TRACK_FROM` | `User.trackFrom` | — (set by the migration) |
| `YOUR_NAME` | `User.name` | Same |
| `DASHBOARD_PASSWORD` | Magic links | Until the owner confirms his email (phase 2) |

Env vars after the change: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `CRON_SECRET` (now only for the cron), `CREDENTIALS_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.

Code changes:
- `src/lib/caldav.ts`: `connect(credentials)`, `fetchGigCalendars(credentials, names)` and `listCalendarNames(credentials)` take their inputs instead of reading `process.env`. The read-only fetch guard stays as is.
- `src/lib/dates.ts`: `appTimeZone()` and `trackFrom()` give way to the user's values. The pure date helpers don't change.
- New `src/lib/credentials.ts`: `encrypt` / `decrypt` (AES-GCM, user id as additional data, key versions), and `calendarSettings(user)` that applies the owner's fallbacks.
- Settings gets a **Calendar** section: iCloud email, app password (write-only), calendar names, time zone, track-from date, a "Test connection" button that lists the calendars found (as `/status` does now), and "Disconnect", which erases the stored password.

### 6. Sync per user — done

Done: the GET cron syncs everyone `connectedUserIds` finds (a saved calendar, or the owner on the env vars), oldest account first, and returns `{ users, failed, results }` with one entry per user. The rest of this list came with phases 1 and 5. These choices were added:
- `syncOneByOne` in `src/lib/sync-all.ts` runs the loop, with tests and no database. A failed run or a thrown error is reported and the next user goes ahead.
- One stuck iCloud request can take 45 s, which would use up `maxDuration` and stop everyone after that user. So each user gets 20 s or their even share of what's left, whichever is more, and nothing new starts after 50 s. Anyone not reached is reported "Not started". The order is fixed, so repeated hangs could keep leaving out the same newest accounts; syncing on open still covers them, and the queue in the scale note is the real fix.
- A user who runs out of time keeps syncing in the background (`after`) and their SyncRun records the end, unless the 60 s limit ends it first. Then it counts as crashed after 2 minutes, as any crashed run does.
- The cron answers 500 only when no one synced (with one user, that's the old behavior), so one person's revoked password doesn't mark the job failed every day. Each person's failure still shows on their `/status` and in the summary.
- An owner with neither a saved calendar nor the env vars is left out, instead of recording a failed run.
- Verified locally against the throwaway Postgres, with `fetchGigCalendars` temporarily faked for test addresses: no secret and a wrong secret 401; a fake iCloud refusal, an undecryptable password and a 30-second hang each reported while the next users synced (200, 20 s); the hung user's run finishing `ok` after the response; a user with no calendar left out; the owner in on the env vars and out without them; three hangs, so four users "Not started" and a 500 at 50 s; five users with the same event UID each keeping their own gig. The real iCloud path through the cron wasn't run here, since it needs real credentials on the preview.

- `runSync(userId)` in `src/lib/run-sync.ts`. Everything in its transaction filters by `userId`: the `trackFrom` delete, `findMany`, the creates (with `userId` set), updates (`where: { userId_uid: … }`), `seen` and `delete`. This is the fix for the problem where one user's sync would mark everyone else's gigs deleted.
- The lock becomes per user: `` tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))` `` (a parameterized query, replacing the `$executeRawUnsafe` call). Two users can sync at once; one user's syncs still take turns.
- `backfill` (the "first sync" rule for missing `CREATED`) is counted per user, so each new account gets its own first sync.
- `latestRun`, `lastGoodRun`, `syncStatus`, `startSync` and `autoSync` take `userId`.
- `/api/sync` POST uses the logged-in user. The GET cron syncs every user with calendar settings, one after another, and returns a summary per user. `planSync` and the other pure functions in `sync.ts` don't change.
- Scale: each sync takes a few seconds, and the cron route has `maxDuration = 60`. That's fine for about 10 users. Past that, the cron should only queue work (one job per user, through a queue service or one request per user), so it doesn't hit the time limit. Auto-sync on open and Sync now already keep each user fresh, so the daily cron is only a fallback.

### 7. Accounts UI — done

Done, with these choices:
- `src/lib/accounts.ts` has the rules, tested without the database; `src/lib/accounts-store.ts` has the queries. `src/proxy.ts` lets exactly `/privacy` through without a session.
- **First run** (`FirstRun.tsx`): shown when nothing is connected and there are no gigs at all, outside the Settings tab, so a new user can still reach Settings → Account to delete an account they never connected. The calendar form is on the screen itself, and saving goes straight to the dashboard. Someone who disconnects but has gigs keeps the old notice.
- **Delete account:** typing the account's email is the confirmation, checked on the server. `deleteAccount` runs in one transaction. The foreign keys cascade to sessions, gigs, sync runs, names, rules and `CalendarAccount`, which holds the app password. By hand, because they have no foreign key: pending sign-in links (their JSON holds the address, and an unused one would make the account again) and the user's limit counters. The page says the app can't revoke the password on Apple's side.
- **The owner's account can't be deleted** from Settings → Account either, not just from the Users list, and `deleteAccount` refuses any `isOwner` row. Without the owner nobody could manage users. This goes further than the plan's wording; the owner can still remove the row in the database.
- **Log out everywhere** ends every session of that user, this device's too. `/list-sessions` and the `/revoke-*` endpoints are turned off for browsers, since the first hands out session tokens and the page works from the server. The device list selects its fields one by one, so a token can't reach a page.
- **Users, cross-user reads:** lint only refuses user tables on `db.<table>`, and `forUser` only limits to one user. A nested `db.user.findMany({ select: { syncRuns } })` would pass lint and skip both, and the same goes for `tx.syncRun` in a plain `db.$transaction`. So `listUsers` reads `User` (emails only) and then asks `forUser(id).syncRun` per person for `finishedAt` alone, with no lint exception. It never reads a run's `message`, which can quote someone's calendars. That's one query per user, fine for an owner-only list of a few dozen.
- **Owner-only on the server:** `listUsers` checks the asker itself, `removeUser` takes the asker from the session and only the target from the request, and `?section=users` falls back to the default for anyone else. "Sign-in emails today" is the total across users, because per-address counts are hashed and last 15 minutes. Removed users can sign up again, since sign-up is open; the list says so.
- The daily cron also removes expired sign-in links and sessions, so an address someone typed, or an old IP, doesn't stay, as the privacy page says.
- The privacy page says plainly that whoever runs the deployment controls the database and the key, and that the host's short-term backups can outlast a deletion.
- Verified locally against the throwaway Postgres at 375px, with `listCalendarNames` and `fetchGigCalendars` temporarily faked for test addresses: `/privacy` with no session and a stale cookie; first run → connect → dashboard, with only ciphertext stored; two devices listed and log out everywhere ending both but no one else's; a wrong email refused, then a delete with a row in every table and a pending link, after which other users' counts were unchanged and a full `pg_dump` had no trace of the address or id; `removeUser` posted directly as a non-owner (for another user, the owner and themself), with no session, and cross-origin as the owner, all refused with nothing removed; the owner refused for himself by both actions; a row with `isOwner` refused; two-tap remove ending that user's session; a long address and the six-section tabs fitting; no secrets in the pages or logs. The real iCloud path wasn't run here, and the phase 6 cron still needs its run on the preview.

### 8. Row-level security, tests, demo data, docs

- Row-level security policies on every user table, and a request wrapper that runs each user's queries in a transaction with `SET LOCAL app.user_id`. Better Auth's tables and the cron keep their own access. Check two things from phase 7: `listUsers` needs each `forUser(id)` query to set that user's id, not the asker's, and `deleteAccount`'s cascades must still reach another user's rows when the owner removes them.
- Unit tests: encrypt/decrypt round trip, tampering, another user's id as additional data, key versions, and the owner fallbacks in `calendarSettings`. The rate-limit and daily-cap logic.
- Isolation tests against a real Postgres (local or a Neon branch), run with `npm run test:db`: two users; sync user A with fixture events and check user B's gigs, names and rules are untouched; call each `names-store` function with the other user's ids and check nothing changes; check row-level security blocks a raw query without `app.user_id`.
- `scripts/seed-demo.ts`: create a demo user and seed only that user's rows (today it wipes every table).
- README: setup (domain, Resend, Turnstile, env vars), the security notes. PLAN.md: the data model.

### 9. Cutover

1. Buy the domain, verify it in Resend, and add it to the Vercel project and to the Turnstile widget's hostnames.
2. On a Neon branch made from production: run the migration, deploy the branch as a preview pointed at it, log in with `DASHBOARD_PASSWORD`, and check the numbers match production.
3. Add the new env vars to Production in Vercel. Check Production's `TRACK_FROM` first: the app stops reading it, and uses the owner's `trackFrom` (2026-10-20 from the migration). If it's set to anything else, change that date in Settings → Calendar right after the merge, because the first sync removes gigs before it.
4. Take a Neon backup (or branch) of production, then merge `multi-account` into `main`. The production build runs the migration and the app keeps working: same data, same password, same iCloud env vars.
5. Owner logs in with `DASHBOARD_PASSWORD` and adds his email from the dashboard, then confirms it. He must not sign up with that email on the login page first: that makes a separate empty account, and the email is then taken, so adding it to the owner silently does nothing. Then he fills in the Calendar section. After that, delete `DASHBOARD_PASSWORD`, `ICLOUD_*`, `*_CALENDAR`, `APP_TIMEZONE`, `TRACK_FROM` and `YOUR_NAME` from Vercel.
6. A later small change removes the env fallbacks from the code.

Rollback: if the merge goes wrong, revert it on `main` and restore the backup from step 4, because the old code can't use the new tables.

## Not in scope for now

- Sharing one calendar between several users, or teams.
- Billing and usage limits beyond the abuse protection above.
- Sign in with Google or Apple (Better Auth can add it later).
