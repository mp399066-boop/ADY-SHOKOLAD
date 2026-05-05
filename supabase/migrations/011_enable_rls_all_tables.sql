-- =============================================================================
-- Migration 011: Enable Row Level Security on all business tables
-- =============================================================================
-- WHAT THIS DOES:
--   Enables RLS on every business table. No policies are added.
--   "RLS enabled + no policies" = deny all for anon and authenticated roles.
--   The service_role key (used by createAdminClient on the server) bypasses
--   RLS automatically — all existing server-side operations continue unchanged.
--
-- WHAT THIS DOES NOT DO:
--   Does not add any policies.
--   Does not touch authorized_users (already has RLS + its own policy).
--   Does not change any application code or API routes.
-- =============================================================================

alter table "לקוחות"                        enable row level security;
alter table "הזמנות"                         enable row level security;
alter table "מוצרים_למכירה"                  enable row level security;
alter table "מוצרים_בהזמנה"                  enable row level security;
alter table "מארזים"                         enable row level security;
alter table "סוגי_פטיפורים"                  enable row level security;
alter table "בחירת_פטיפורים_בהזמנה"         enable row level security;
alter table "מלאי_חומרי_גלם"                 enable row level security;
alter table "מתכונים"                        enable row level security;
alter table "רכיבי_מתכון"                    enable row level security;
alter table "ייצור"                          enable row level security;
alter table "משלוחים"                        enable row level security;
alter table "תשלומים"                        enable row level security;
alter table "חשבוניות"                       enable row level security;
alter table "uploaded_files"                 enable row level security;
alter table "business_settings"              enable row level security;
