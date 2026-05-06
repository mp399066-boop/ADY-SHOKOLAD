-- Add delivery_recipient_type to distinguish sending to the ordering customer vs. someone else.
-- Values: 'customer' (default) | 'other'
-- All existing orders will get 'customer' as default.
ALTER TABLE "הזמנות"
  ADD COLUMN IF NOT EXISTS "delivery_recipient_type" TEXT DEFAULT 'customer';
