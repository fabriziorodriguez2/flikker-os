-- Simplify reviews to MVP-oriented state machine and operational fields.

-- 1. Add explicit responded tracking.
ALTER TABLE "Review"
  ADD COLUMN "respondedAt" TIMESTAMP(3),
  ADD COLUMN "respondedByUserId" TEXT;

-- 2. Create new enum with simplified statuses.
CREATE TYPE "ReviewStatus_new" AS ENUM ('NEW', 'REVIEWED', 'RESPONDED', 'ARCHIVED');

-- 3. Migrate Review.status values.
ALTER TABLE "Review"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Review"
  ALTER COLUMN "status" TYPE "ReviewStatus_new"
  USING (
    CASE
      WHEN "status"::text = 'NEW' THEN 'NEW'::"ReviewStatus_new"
      WHEN "status"::text = 'TRIAGED' THEN 'REVIEWED'::"ReviewStatus_new"
      WHEN "status"::text = 'PENDING_RESPONSE' THEN 'REVIEWED'::"ReviewStatus_new"
      WHEN "status"::text = 'RESPONDED' THEN 'RESPONDED'::"ReviewStatus_new"
      WHEN "status"::text = 'RESOLVED' THEN 'REVIEWED'::"ReviewStatus_new"
      WHEN "status"::text = 'ARCHIVED' THEN 'ARCHIVED'::"ReviewStatus_new"
    END
  );

-- 4. Migrate ReviewStatusHistory enum columns.
ALTER TABLE "ReviewStatusHistory"
  ALTER COLUMN "fromStatus" TYPE "ReviewStatus_new"
  USING (
    CASE
      WHEN "fromStatus" IS NULL THEN NULL
      WHEN "fromStatus"::text = 'NEW' THEN 'NEW'::"ReviewStatus_new"
      WHEN "fromStatus"::text = 'TRIAGED' THEN 'REVIEWED'::"ReviewStatus_new"
      WHEN "fromStatus"::text = 'PENDING_RESPONSE' THEN 'REVIEWED'::"ReviewStatus_new"
      WHEN "fromStatus"::text = 'RESPONDED' THEN 'RESPONDED'::"ReviewStatus_new"
      WHEN "fromStatus"::text = 'RESOLVED' THEN 'REVIEWED'::"ReviewStatus_new"
      WHEN "fromStatus"::text = 'ARCHIVED' THEN 'ARCHIVED'::"ReviewStatus_new"
    END
  );

ALTER TABLE "ReviewStatusHistory"
  ALTER COLUMN "toStatus" TYPE "ReviewStatus_new"
  USING (
    CASE
      WHEN "toStatus"::text = 'NEW' THEN 'NEW'::"ReviewStatus_new"
      WHEN "toStatus"::text = 'TRIAGED' THEN 'REVIEWED'::"ReviewStatus_new"
      WHEN "toStatus"::text = 'PENDING_RESPONSE' THEN 'REVIEWED'::"ReviewStatus_new"
      WHEN "toStatus"::text = 'RESPONDED' THEN 'RESPONDED'::"ReviewStatus_new"
      WHEN "toStatus"::text = 'RESOLVED' THEN 'REVIEWED'::"ReviewStatus_new"
      WHEN "toStatus"::text = 'ARCHIVED' THEN 'ARCHIVED'::"ReviewStatus_new"
    END
  );

-- 5. Replace old enum.
DROP TYPE "ReviewStatus";
ALTER TYPE "ReviewStatus_new" RENAME TO "ReviewStatus";

ALTER TABLE "Review"
  ALTER COLUMN "status" SET DEFAULT 'NEW';

-- 6. Backfill responded tracking from old data.
UPDATE "Review"
SET "respondedAt" = COALESCE("respondedAt", "updatedAt")
WHERE "status" = 'RESPONDED' AND "respondedAt" IS NULL;

UPDATE "Review"
SET "respondedByUserId" = COALESCE("respondedByUserId", "createdByUserId")
WHERE "status" = 'RESPONDED' AND "respondedByUserId" IS NULL;

-- 7. Drop full-product columns from Review.
ALTER TABLE "Review"
  DROP COLUMN "responseStatus",
  DROP COLUMN "sentimentLabel",
  DROP COLUMN "isHidden",
  DROP COLUMN "requiresAttention";

DROP TYPE "ReviewResponseStatus";

-- 8. Add responder FK.
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_respondedByUserId_fkey"
  FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Review_respondedByUserId_idx" ON "Review"("respondedByUserId");
