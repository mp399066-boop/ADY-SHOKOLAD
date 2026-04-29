-- Add discount type and value columns to הזמנות
ALTER TABLE הזמנות
  ADD COLUMN IF NOT EXISTS סוג_הנחה TEXT DEFAULT 'ללא' CHECK (סוג_הנחה IN ('ללא', 'אחוז', 'סכום')),
  ADD COLUMN IF NOT EXISTS ערך_הנחה NUMERIC(10,2) DEFAULT 0;
