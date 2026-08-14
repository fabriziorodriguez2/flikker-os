-- Retention V2 message dispatcher (closes the loop: queued Message -> WhatsApp).
--
-- 1) `sending` is the atomic-claim status the new dispatcher uses so two
--    concurrent workers racing the same Message can never both call the
--    WhatsApp provider for it.
-- 2) `body` captures the exact composed text at creation time. Every other
--    message type here reconstructs its text from a static template it
--    fully owns; Retention V2's copy can be AI-generated per customer, so it
--    is not reproducible later and must be persisted once, up front.
ALTER TYPE "MessageStatus" ADD VALUE 'sending';

ALTER TABLE "Message" ADD COLUMN "body" TEXT;
