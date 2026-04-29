-- Migration 008: Add email fields for courier messaging

ALTER TABLE שליחים
  ADD COLUMN IF NOT EXISTS אימייל_שליח TEXT;

ALTER TABLE משלוחים
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
