-- Add כמות_במלאי column to סוגי_פטיפורים
-- Run in: Supabase Dashboard > SQL Editor
ALTER TABLE סוגי_פטיפורים
  ADD COLUMN IF NOT EXISTS כמות_במלאי NUMERIC(10,2) NOT NULL DEFAULT 0;
