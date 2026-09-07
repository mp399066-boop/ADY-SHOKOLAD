-- Migration 052: register the "order_stock_guard" control-center service.
--
-- Backs the new hard stock-availability check (Sep 2026): creating a real
-- order, finalizing a draft, or editing an order's items is blocked when
-- the requested quantity of a product/petit-four exceeds what's on hand.
-- This row is the kill switch — turning it off in הגדרות → מרכז בקרה lets
-- orders through regardless of stock (e.g. if the guard misfires before
-- stock counts are fully entered).
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).

insert into system_services (service_key, display_name, description, category, is_enabled) values
  ('order_stock_guard', 'חסימת הזמנה במלאי חסר', 'חוסם יצירת/עדכון הזמנה כשהכמות המבוקשת עולה על מה שקיים במלאי (מוצרים ופטיפורים). לא חל על הזמנות מסוג סאטמר, טיוטות שלא סגורות, או הזמנות שבוטלו.', 'inventory', true)
on conflict (service_key) do update set
  display_name = excluded.display_name,
  description  = excluded.description,
  category     = excluded.category;
