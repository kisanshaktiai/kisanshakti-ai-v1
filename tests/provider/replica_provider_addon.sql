-- tests/provider/replica_provider_addon.sql — REPO: kisanshaktiai/kisanshakti-ai-v1 (farmer app)
-- Tables the provider migrations reference that the identity replica does not have. Local replica only.
CREATE TABLE IF NOT EXISTS public.crops (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), value text, label text);
INSERT INTO public.crops (id, value, label) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'test_crop_one', 'Test Crop One'),
  ('c0000000-0000-0000-0000-000000000002', 'test_crop_two', 'Test Crop Two') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.schedule_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_type text NOT NULL,
  CONSTRAINT schedule_tasks_task_type_check CHECK ((task_type = ANY (ARRAY['land_preparation'::text, 'seed_treatment'::text, 'nursery'::text, 'sowing'::text, 'gap_filling'::text, 'nutrition'::text, 'micronutrient'::text, 'irrigation'::text, 'weed_management'::text, 'intercultural'::text, 'pest_management'::text, 'disease_management'::text, 'growth_regulation'::text, 'monitoring'::text, 'harvest'::text, 'post_harvest'::text, 'residue_management'::text, 'planning'::text, 'advisory'::text]))));
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), flag_name text NOT NULL UNIQUE, description text,
  is_enabled boolean NOT NULL DEFAULT false, rollout_percentage integer NOT NULL DEFAULT 0,
  target_tenants uuid[] DEFAULT '{}'::uuid[], target_users uuid[] DEFAULT '{}'::uuid[], expires_at timestamptz, flag_type text DEFAULT 'release', flag_status text DEFAULT 'active',
  default_value jsonb DEFAULT 'false'::jsonb);

-- ── for 20261124140500 (nursery store + services near me) ──────────────────
-- Seed variety master: live v_crop_varieties = master_products (product_type seed) joined to crops.
CREATE TABLE IF NOT EXISTS public.master_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, label_hi text, label_mr text,
  product_type text NOT NULL, status text DEFAULT 'active');
CREATE TABLE IF NOT EXISTS public.master_product_variety_crops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.master_products(id),
  crop_id uuid NOT NULL REFERENCES public.crops(id), is_primary boolean DEFAULT true);
INSERT INTO public.master_products (id, name, product_type) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Test Variety One', 'seed'),
  ('d0000000-0000-0000-0000-000000000002', 'Test Variety Two', 'seed'),
  ('d0000000-0000-0000-0000-000000000009', 'Not A Seed', 'fertilizer') ON CONFLICT DO NOTHING;
INSERT INTO public.master_product_variety_crops (product_id, crop_id) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;
-- Farmer lands: only the columns the search reads (live has many more).
CREATE TABLE IF NOT EXISTS public.lands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farmer_id uuid NOT NULL, tenant_id uuid, name text,
  is_active boolean DEFAULT true, village_id uuid, center_lat numeric, center_lon numeric);
-- Storage: just enough of the live schema for the bucket insert and the policy.
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text, owner_id text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
