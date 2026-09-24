-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GigCalendar" AS ENUM ('gigs', 'holds');

-- CreateEnum
CREATE TYPE "GigStatus" AS ENUM ('job', 'hold');

-- CreateTable
CREATE TABLE "Gig" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "calendar" "GigCalendar" NOT NULL,
    "status" "GigStatus" NOT NULL,
    "titleKeyword" "GigStatus",
    "person" TEXT,
    "personKey" TEXT,
    "price" INTEGER,
    "location" TEXT,
    "locationKey" TEXT,
    "gigDate" DATE NOT NULL,
    "bookedAt" TIMESTAMP(3),
    "leadDays" INTEGER,
    "heldAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "parseError" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "deleted" INTEGER NOT NULL DEFAULT 0,
    "missingCreated" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gig_uid_key" ON "Gig"("uid");

