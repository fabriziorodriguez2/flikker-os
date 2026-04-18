-- Partial unique index for review deduplication.
-- Prevents duplicate reviews from the same source when externalReviewId is known.
-- Prisma does not support partial unique indexes natively, so this is a raw SQL migration.
CREATE UNIQUE INDEX "Review_businessId_source_externalReviewId_key"
  ON "Review" ("businessId", "source", "externalReviewId")
  WHERE "externalReviewId" IS NOT NULL;
