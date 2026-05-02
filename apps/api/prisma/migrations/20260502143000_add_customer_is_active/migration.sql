ALTER TABLE "Customer"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Customer_businessId_isActive_idx"
ON "Customer"("businessId", "isActive");
