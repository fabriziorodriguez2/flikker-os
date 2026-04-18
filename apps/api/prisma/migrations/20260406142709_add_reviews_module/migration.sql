-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NEW', 'TRIAGED', 'PENDING_RESPONSE', 'RESPONDED', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReviewResponseStatus" AS ENUM ('NOT_NEEDED', 'NOT_STARTED', 'DRAFT_EXISTS', 'PENDING_APPROVAL', 'PUBLISHED', 'MANUALLY_HANDLED');

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('GOOGLE', 'MANUAL', 'IMPORT_CSV', 'WHATSAPP_FEEDBACK', 'EMAIL_FEEDBACK', 'INTERNAL_FORM', 'OTHER');

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "campaignId" TEXT,
    "source" "ReviewSource" NOT NULL,
    "externalReviewId" TEXT,
    "authorDisplayName" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReviewStatus" NOT NULL DEFAULT 'NEW',
    "responseStatus" "ReviewResponseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sentimentLabel" TEXT,
    "language" TEXT,
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "requiresAttention" BOOLEAN NOT NULL DEFAULT false,
    "metadataJson" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTag" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTagRelation" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewTagRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewStatusHistory" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "fromStatus" "ReviewStatus",
    "toStatus" "ReviewStatus" NOT NULL,
    "changedByUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_businessId_idx" ON "Review"("businessId");

-- CreateIndex
CREATE INDEX "Review_businessId_status_idx" ON "Review"("businessId", "status");

-- CreateIndex
CREATE INDEX "Review_businessId_source_idx" ON "Review"("businessId", "source");

-- CreateIndex
CREATE INDEX "Review_businessId_rating_idx" ON "Review"("businessId", "rating");

-- CreateIndex
CREATE INDEX "Review_businessId_reviewedAt_idx" ON "Review"("businessId", "reviewedAt");

-- CreateIndex
CREATE INDEX "Review_branchId_idx" ON "Review"("branchId");

-- CreateIndex
CREATE INDEX "Review_campaignId_idx" ON "Review"("campaignId");

-- CreateIndex
CREATE INDEX "ReviewTag_businessId_idx" ON "ReviewTag"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTag_businessId_slug_key" ON "ReviewTag"("businessId", "slug");

-- CreateIndex
CREATE INDEX "ReviewTagRelation_reviewId_idx" ON "ReviewTagRelation"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewTagRelation_tagId_idx" ON "ReviewTagRelation"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTagRelation_reviewId_tagId_key" ON "ReviewTagRelation"("reviewId", "tagId");

-- CreateIndex
CREATE INDEX "ReviewStatusHistory_reviewId_idx" ON "ReviewStatusHistory"("reviewId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTag" ADD CONSTRAINT "ReviewTag_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTagRelation" ADD CONSTRAINT "ReviewTagRelation_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTagRelation" ADD CONSTRAINT "ReviewTagRelation_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ReviewTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewStatusHistory" ADD CONSTRAINT "ReviewStatusHistory_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewStatusHistory" ADD CONSTRAINT "ReviewStatusHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
