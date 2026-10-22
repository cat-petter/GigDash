-- People and places: names saved by hand, the spellings pinned to them, and the matching rules.
-- CreateEnum
CREATE TYPE "NameKind" AS ENUM ('person', 'place');

-- CreateTable
CREATE TABLE "SavedName" (
    "id" TEXT NOT NULL,
    "kind" "NameKind" NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedName_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinnedSpelling" (
    "kind" "NameKind" NOT NULL,
    "key" TEXT NOT NULL,
    "savedNameId" TEXT NOT NULL,

    CONSTRAINT "PinnedSpelling_pkey" PRIMARY KEY ("kind","key")
);

-- CreateTable
CREATE TABLE "MatchRule" (
    "kind" "NameKind" NOT NULL,
    "punctuation" BOOLEAN NOT NULL,
    "wordOrder" BOOLEAN NOT NULL,
    "doubleLetters" BOOLEAN NOT NULL,
    "soundAlike" BOOLEAN NOT NULL,
    "oneLetterOff" BOOLEAN NOT NULL,
    "ignoreWords" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchRule_pkey" PRIMARY KEY ("kind")
);

-- CreateIndex
CREATE INDEX "PinnedSpelling_savedNameId_idx" ON "PinnedSpelling"("savedNameId");

-- AddForeignKey
ALTER TABLE "PinnedSpelling" ADD CONSTRAINT "PinnedSpelling_savedNameId_fkey" FOREIGN KEY ("savedNameId") REFERENCES "SavedName"("id") ON DELETE CASCADE ON UPDATE CASCADE;

