-- Migration 019: Add 'בארטר' as customer type and payment status
-- Run manually in Supabase SQL Editor.

-- 1. Customers: add בארטר to סוג_לקוח CHECK
ALTER TABLE לקוחות DROP CONSTRAINT IF EXISTS לקוחות_סוג_לקוח_check;
ALTER TABLE לקוחות
  ADD CONSTRAINT לקוחות_סוג_לקוח_check
  CHECK ("סוג_לקוח" IN ('פרטי', 'חוזר', 'עסקי', 'עסקי - קבוע', 'עסקי - כמות', 'בארטר'));

-- 2. Orders: add בארטר to סטטוס_תשלום CHECK
ALTER TABLE הזמנות DROP CONSTRAINT IF EXISTS הזמנות_סטטוס_תשלום_check;
ALTER TABLE הזמנות
  ADD CONSTRAINT הזמנות_סטטוס_תשלום_check
  CHECK ("סטטוס_תשלום" IN ('ממתין', 'שולם', 'חלקי', 'בוטל', 'בארטר'));
