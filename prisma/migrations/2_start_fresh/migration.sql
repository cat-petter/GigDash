-- Start fresh: the calendar used to be an everyday one, so drop everything synced so far.
-- The next sync reads the calendar again from TRACKING_STARTED on (see src/lib/dates.ts).
DELETE FROM "Gig";
DELETE FROM "SyncRun";
