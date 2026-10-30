-- Counters for the limits on sign-in links, emails per day and manual syncs.

-- CreateTable
CREATE TABLE "LimitCounter" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LimitCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "LimitCounter_resetAt_idx" ON "LimitCounter"("resetAt");
