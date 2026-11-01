-- The last line of defense between users. forUser (src/lib/db.ts) runs its queries as gigdash_user,
-- which can only reach rows whose userId is the one that transaction set in app.user_id. With none
-- set, it reaches nothing. The role the app connects as owns these tables, so RLS doesn't apply to it:
-- Better Auth, the cron's list of users and deleting an account keep working as before.

-- Roles belong to the whole database server, so a copy of the database may already have this one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gigdash_user') THEN
    CREATE ROLE gigdash_user NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- Lets the app's own role switch to it.
GRANT gigdash_user TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO gigdash_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Gig", "SyncRun", "SavedName", "PinnedSpelling", "MatchRule", "CalendarAccount" TO gigdash_user;

-- Their own row only, and only what Settings → Calendar changes, so isOwner and email are out of reach.
GRANT SELECT ON "User" TO gigdash_user;
GRANT UPDATE ("name", "timeZone", "trackFrom", "updatedAt") ON "User" TO gigdash_user;

ALTER TABLE "Gig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedName" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PinnedSpelling" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatchRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_rows ON "Gig" TO gigdash_user
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY own_rows ON "SyncRun" TO gigdash_user
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY own_rows ON "SavedName" TO gigdash_user
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY own_rows ON "PinnedSpelling" TO gigdash_user
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY own_rows ON "MatchRule" TO gigdash_user
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY own_rows ON "CalendarAccount" TO gigdash_user
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY own_row ON "User" TO gigdash_user
  USING ("id" = current_setting('app.user_id', true))
  WITH CHECK ("id" = current_setting('app.user_id', true));
