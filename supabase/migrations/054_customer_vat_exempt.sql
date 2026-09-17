-- ============================================================================
-- Migration 054: VAT-exempt customers (לקוח חו"ל).
--
-- Export customers are zero-rated: the document must carry no VAT at all —
-- neither added on top (business pricing) nor extracted from the price
-- (private pricing). Until now there was no way to mark one, so 14+ such
-- invoices since May 2026 were issued by hand inside Morning and only
-- recorded here with a "לקוח חו״ל" note.
--
-- The existing signal was free-text עיר ("חו״ל", "ארה״ב", "לונדון",
-- "אנטוורפן"…) which is far too loose to drive a tax decision, hence an
-- explicit boolean.
--
-- NOT NULL DEFAULT FALSE — every existing row keeps today's behaviour.
-- ============================================================================

ALTER TABLE "לקוחות"
  ADD COLUMN IF NOT EXISTS "פטור_ממעמ" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "לקוחות"."פטור_ממעמ" IS
  'לקוח פטור ממע"מ (לקוח חו"ל / יצוא). כשמסומן — המסמך ב-Morning מופק ללא מע"מ כלל, והסכום נשאר כפי שנרשם בהזמנה.';

-- Verify (read-only). Should list the new column as boolean / NO / false.
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'לקוחות'
   AND column_name = 'פטור_ממעמ';
