-- Track when an order was last included in a sent report.
-- NULL = never sent. Set by the send-report API after a successful email send.
-- Does not affect order status, payments, or any other business logic.
ALTER TABLE הזמנות
  ADD COLUMN IF NOT EXISTS report_sent_at TIMESTAMPTZ;
