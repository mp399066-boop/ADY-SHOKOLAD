-- Migration 020: Add stock quantity column to finished products (מוצרים_למכירה).
-- Required so the inventory page's "מוצרים מוגמרים" tab can update stock,
-- and so the import page can target finished-product stock.
-- Run manually in Supabase SQL Editor.

ALTER TABLE מוצרים_למכירה
  ADD COLUMN IF NOT EXISTS כמות_במלאי NUMERIC(10,2) NOT NULL DEFAULT 0;
