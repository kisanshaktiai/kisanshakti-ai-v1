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
  target_tenants uuid[] DEFAULT '{}'::uuid[], flag_type text DEFAULT 'release', flag_status text DEFAULT 'active',
  default_value jsonb DEFAULT 'false'::jsonb);
