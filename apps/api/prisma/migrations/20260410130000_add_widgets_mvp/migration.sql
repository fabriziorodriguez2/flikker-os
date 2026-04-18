-- Add minimal widgets for MVP public social proof.

CREATE TYPE "WidgetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "WidgetType" AS ENUM ('BADGE', 'REVIEW_LIST', 'REVIEW_GRID');

CREATE TABLE "Widget" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WidgetStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "WidgetType" NOT NULL,
    "publicToken" TEXT NOT NULL,
    "title" TEXT,
    "maxItems" INTEGER NOT NULL DEFAULT 6,
    "showAuthorName" BOOLEAN NOT NULL DEFAULT true,
    "showDate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Widget_publicToken_key" ON "Widget"("publicToken");
CREATE INDEX "Widget_businessId_idx" ON "Widget"("businessId");
CREATE INDEX "Widget_businessId_status_idx" ON "Widget"("businessId", "status");

ALTER TABLE "Widget"
ADD CONSTRAINT "Widget_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
