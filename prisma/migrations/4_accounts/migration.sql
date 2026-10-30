-- Accounts: Better Auth's tables, each user's calendar login, and a userId on every table.
-- Everything already here belongs to the "owner" account this makes, so no data is lost.
-- Written by hand: `prisma migrate diff` would add NOT NULL userId columns with no value.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "trackFrom" DATE,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarAccount" (
    "userId" TEXT NOT NULL,
    "icloudEmail" TEXT NOT NULL,
    "icloudPasswordEnc" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "gigsCalendar" TEXT NOT NULL DEFAULT 'Gigs',
    "holdsCalendar" TEXT,
    "wantedCalendar" TEXT NOT NULL DEFAULT 'Wanted',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarAccount_pkey" PRIMARY KEY ("userId")
);

-- The owner. ".invalid" can never be a real address; he swaps in his own when he first logs in.
-- trackFrom is TRACKING_STARTED from src/lib/dates.ts.
INSERT INTO "User" ("id", "name", "email", "isOwner", "trackFrom")
VALUES ('owner', '', 'owner@gigdash.invalid', true, '2026-10-20');

-- Every existing row goes to the owner. The default fills the rows, then comes off so new rows must say whose they are.
ALTER TABLE "Gig" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE "Gig" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "SyncRun" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE "SyncRun" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "SavedName" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE "SavedName" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "PinnedSpelling" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE "PinnedSpelling" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "MatchRule" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE "MatchRule" ALTER COLUMN "userId" DROP DEFAULT;

-- Keys that were unique across the whole table become unique per user.
DROP INDEX "Gig_uid_key";
ALTER TABLE "PinnedSpelling" DROP CONSTRAINT "PinnedSpelling_savedNameId_fkey";
ALTER TABLE "PinnedSpelling" DROP CONSTRAINT "PinnedSpelling_pkey",
ADD CONSTRAINT "PinnedSpelling_pkey" PRIMARY KEY ("userId", "kind", "key");
ALTER TABLE "MatchRule" DROP CONSTRAINT "MatchRule_pkey",
ADD CONSTRAINT "MatchRule_pkey" PRIMARY KEY ("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE INDEX "Gig_userId_gigDate_idx" ON "Gig"("userId", "gigDate");

-- CreateIndex
CREATE UNIQUE INDEX "Gig_userId_uid_key" ON "Gig"("userId", "uid");

-- CreateIndex
CREATE INDEX "SyncRun_userId_startedAt_idx" ON "SyncRun"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "SavedName_userId_kind_idx" ON "SavedName"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SavedName_id_userId_key" ON "SavedName"("id", "userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarAccount" ADD CONSTRAINT "CalendarAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gig" ADD CONSTRAINT "Gig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedName" ADD CONSTRAINT "SavedName_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedSpelling" ADD CONSTRAINT "PinnedSpelling_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: the user is part of the key, so a spelling can only be pinned to its own user's name.
ALTER TABLE "PinnedSpelling" ADD CONSTRAINT "PinnedSpelling_savedNameId_userId_fkey" FOREIGN KEY ("savedNameId", "userId") REFERENCES "SavedName"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRule" ADD CONSTRAINT "MatchRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
