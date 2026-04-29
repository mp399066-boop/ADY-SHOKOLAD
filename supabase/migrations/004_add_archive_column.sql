-- Add archive flag to הזמנות
-- Run in: Supabase Dashboard > SQL Editor
ALTER TABLE הזמנות
  ADD COLUMN IF NOT EXISTS ארכיון BOOLEAN NOT NULL DEFAULT false;
