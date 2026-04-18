-- Add minimal manual responses for MVP and keep review responded state in sync.

CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "respondedByUserId" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Response_reviewId_key" ON "Response"("reviewId");
CREATE INDEX "Response_businessId_idx" ON "Response"("businessId");
CREATE INDEX "Response_reviewId_idx" ON "Response"("reviewId");
CREATE INDEX "Response_respondedByUserId_idx" ON "Response"("respondedByUserId");

ALTER TABLE "Response"
ADD CONSTRAINT "Response_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Response"
ADD CONSTRAINT "Response_reviewId_fkey"
FOREIGN KEY ("reviewId") REFERENCES "Review"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Response"
ADD CONSTRAINT "Response_respondedByUserId_fkey"
FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
