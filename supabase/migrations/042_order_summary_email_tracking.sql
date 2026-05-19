-- Track the total amount and timestamp of the last order summary email sent to
-- the customer. NULL on both columns = no summary ever sent.
-- Used by the order detail page to show a "total changed since last email" notice.
-- Does not affect order status, payments, or any other business logic.
ALTER TABLE הזמנות
  ADD COLUMN IF NOT EXISTS summary_email_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS summary_email_sent_total NUMERIC;
