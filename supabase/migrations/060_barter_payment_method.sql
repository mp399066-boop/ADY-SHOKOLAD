-- 060_barter_payment_method.sql
-- ---------------------------------------------------------------------------
-- Adds "בארטר" to the managed payment-methods list (אמצעי תשלום), right
-- before "אחר". The finance page treats an order whose payment method is
-- בארטר as barter (no money) — see isBarterOrder in src/lib/finance.ts.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Requires migration 049 (system_option_lists). Safe to run more than once.
-- ---------------------------------------------------------------------------

INSERT INTO public.system_option_lists (list_key, value, label, sort_order, is_system)
VALUES ('payment_methods', 'בארטר', 'בארטר', 7, true)
ON CONFLICT (list_key, value) DO UPDATE SET is_active = true;

UPDATE public.system_option_lists
   SET sort_order = 8
 WHERE list_key = 'payment_methods' AND value = 'אחר' AND sort_order = 7;
