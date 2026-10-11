-- חסימת merge_raw_material לגישה מהדפדפן.
-- הפונקציה היא security definer (עוקפת RLS), וכברירת מחדל anon/authenticated
-- יכלו להריץ אותה דרך RPC עם המפתח הציבורי. היא נקראת רק מהשרת
-- (/api/inventory/duplicates/[id]) עם service_role — אז רק לו נשאיר הרשאה.

revoke execute on function merge_raw_material(uuid, uuid) from public, anon, authenticated;
grant  execute on function merge_raw_material(uuid, uuid) to service_role;
