-- Adds an explicit flexible delivery-time flag.
-- This does not change or derive שעת_אספקה; it only stores true/false.

alter table הזמנות
  add column if not exists delivery_time_flexible boolean not null default false;
