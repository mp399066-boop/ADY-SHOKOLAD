-- Snapshot of the items included in the LAST customer summary email.
-- Used by the send-email route to diff against current items so the next
-- "updated summary" can mark added rows with a "חדש" badge and list rows
-- that were removed since the last summary. NULL = no summary ever sent.
-- Shape: jsonb array of { id, name, quantity, unit_price } objects.
ALTER TABLE הזמנות
  ADD COLUMN IF NOT EXISTS summary_email_sent_items_snapshot JSONB;
