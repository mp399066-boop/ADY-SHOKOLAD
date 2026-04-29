-- Migration 007: Couriers table and delivery enhancements

-- 1. Couriers table
CREATE TABLE IF NOT EXISTS שליחים (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  שם_שליח TEXT NOT NULL,
  טלפון_שליח TEXT NOT NULL,
  הערות TEXT,
  פעיל BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. New columns on deliveries
ALTER TABLE משלוחים
  ADD COLUMN IF NOT EXISTS courier_id UUID REFERENCES שליחים(id),
  ADD COLUMN IF NOT EXISTS delivery_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;

-- 3. Extend status constraint to include 'ממתין'
ALTER TABLE משלוחים DROP CONSTRAINT IF EXISTS משלוחים_סטטוס_משלוח_check;
ALTER TABLE משלוחים ADD CONSTRAINT משלוחים_סטטוס_משלוח_check
  CHECK (סטטוס_משלוח IN ('ממתין', 'נאסף', 'נמסר'));

ALTER TABLE משלוחים ALTER COLUMN סטטוס_משלוח SET DEFAULT 'ממתין';
