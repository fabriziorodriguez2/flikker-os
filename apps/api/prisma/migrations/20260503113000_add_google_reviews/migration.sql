CREATE TABLE "GoogleReview" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "google_review_id" TEXT NOT NULL,
    "reviewer_name" TEXT,
    "stars" INTEGER NOT NULL,
    "text" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attributed_message_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleReview_businessId_google_review_id_key" ON "GoogleReview"("businessId", "google_review_id");
CREATE INDEX "GoogleReview_businessId_idx" ON "GoogleReview"("businessId");
CREATE INDEX "GoogleReview_businessId_posted_at_idx" ON "GoogleReview"("businessId", "posted_at");
CREATE INDEX "GoogleReview_attributed_message_id_idx" ON "GoogleReview"("attributed_message_id");

ALTER TABLE "GoogleReview" ADD CONSTRAINT "GoogleReview_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoogleReview" ADD CONSTRAINT "GoogleReview_attributed_message_id_fkey" FOREIGN KEY ("attributed_message_id") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
