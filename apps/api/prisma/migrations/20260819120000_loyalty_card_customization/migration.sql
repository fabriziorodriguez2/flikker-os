-- Full visual customization for the customer-facing loyalty card.
ALTER TABLE "Business"
  ADD COLUMN "loyalty_card_text_color" TEXT,
  ADD COLUMN "loyalty_card_background_image" TEXT,
  ADD COLUMN "loyalty_stamp_area_color" TEXT,
  ADD COLUMN "loyalty_show_business_name" BOOLEAN NOT NULL DEFAULT true;
