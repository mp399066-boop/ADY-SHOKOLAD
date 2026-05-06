-- Add order type field: 'רגיל' (default) or 'סאטמר'
-- Satmar orders skip Morning/חשבונית ירוקה and receive only a summary email instead.
-- satmar_summary_sent_at tracks whether the automatic summary email was already sent,
-- preventing duplicate sends when both order-status and payment-status triggers fire.
ALTER TABLE "הזמנות"
  ADD COLUMN IF NOT EXISTS "סוג_הזמנה" TEXT NOT NULL DEFAULT 'רגיל',
  ADD COLUMN IF NOT EXISTS "satmar_summary_sent_at" TIMESTAMPTZ;
