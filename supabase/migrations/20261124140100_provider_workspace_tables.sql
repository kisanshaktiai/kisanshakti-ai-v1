-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124140100_provider_workspace_tables.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Provider Workspace, part A, file 2 of 4 — the provider's own data.
--
--   service_provider_profiles   one row per provider account
--   provider_services           one row per service offered (D10)
--   provider_working_hours      one row per weekday
--   provider_blackouts          periods the provider is not available (D13)
--   provider_equipment          machines and vehicles
--   nursery_products            what a nursery sells
--   nursery_batches             stock of a product, with a ready date
--   provider_workspace_policy   limits, in system_config (D7)
--
-- Access rule for all seven tables: NO privilege for anon or authenticated, and
-- no policy for them. The browser reads and writes only through the functions in
-- file 3, which take the caller from the verified session. That is how a provider
-- is kept from setting verification, rating, jobs completed or listing status.
--
-- Every reference to accounts is ON UPDATE CASCADE, so a provider's rows follow
-- the account when a portal later adds the same person as a farmer (the account
-- adoption in 20261124110000). Nothing here is ever deleted: rows are switched
-- to REMOVED, CLOSED or cancelled.
--
-- Adds tables and one config row only. No existing table, column, policy,
-- function or grant is changed.  Safe to run twice.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- already installed on the project (1.7)

-- ── 1. provider profile ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_provider_profiles (
  account_id        uuid PRIMARY KEY REFERENCES public.accounts(id) ON UPDATE CASCADE,
  tenant_id         uuid NOT NULL,
  provider_type     text NOT NULL REFERENCES public.provider_types(code) ON UPDATE CASCADE,
  public_name       text NOT NULL CHECK (char_length(btrim(public_name)) BETWEEN 1 AND 80),
  experience_years  integer CHECK (experience_years BETWEEN 0 AND 80),
  about_text        text CHECK (about_text IS NULL OR char_length(about_text) <= 600),
  about_language    text CHECK (about_language IS NULL OR about_language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  languages_spoken  text[] NOT NULL DEFAULT '{}',
  -- the provider's own switch
  accepts_requests  boolean NOT NULL DEFAULT true,
  -- set only by provider_submit_for_review() and provider_review_listing()
  listing_status    text NOT NULL DEFAULT 'DRAFT'
                    CHECK (listing_status IN ('DRAFT', 'PENDING_REVIEW', 'LISTED', 'SUSPENDED')),
  submitted_at      timestamptz,
  listed_at         timestamptz,
  reviewed_at       timestamptz,
  reviewed_by       uuid,
  review_note_code  text,
  -- derived by the server in later tasks; no provider function writes these
  verification_level      text,
  rating_average          numeric(3,2) CHECK (rating_average IS NULL OR rating_average BETWEEN 1 AND 5),
  rating_count            integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  jobs_completed          integer NOT NULL DEFAULT 0 CHECK (jobs_completed >= 0),
  response_minutes_median integer CHECK (response_minutes_median IS NULL OR response_minutes_median >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_provider_profiles_listing_idx
  ON public.service_provider_profiles (listing_status) WHERE listing_status = 'LISTED';

-- ── 2. equipment (before services: a service may point at one) ──────────────
CREATE TABLE IF NOT EXISTS public.provider_equipment (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES public.service_provider_profiles(account_id) ON UPDATE CASCADE,
  equipment_type     text NOT NULL REFERENCES public.equipment_types(code) ON UPDATE CASCADE,
  make               text CHECK (make IS NULL OR char_length(make) <= 60),
  model              text CHECK (model IS NULL OR char_length(model) <= 60),
  year_made          integer CHECK (year_made IS NULL OR year_made BETWEEN 1950 AND 2100),
  attributes         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  ownership          text NOT NULL DEFAULT 'OWNED' CHECK (ownership IN ('OWNED', 'LEASED', 'RENTED')),
  condition          text CHECK (condition IS NULL OR condition IN ('NEW', 'GOOD', 'FAIR')),
  -- only the last four characters of a registration number are ever stored
  registration_last4 text CHECK (registration_last4 IS NULL OR registration_last4 ~ '^[A-Z0-9]{1,4}$'),
  -- set only by a verifier (a later task)
  verified_at        timestamptz,
  verified_by        uuid,
  status             text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_equipment_account_idx ON public.provider_equipment (account_id) WHERE status = 'ACTIVE';

-- ── 3. services ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_services (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES public.service_provider_profiles(account_id) ON UPDATE CASCADE,
  category_code        text NOT NULL REFERENCES public.service_categories(code) ON UPDATE CASCADE,
  title                text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  -- the provider's own words, kept as typed with the language they were typed in
  description          text CHECK (description IS NULL OR char_length(description) <= 600),
  description_language text CHECK (description_language IS NULL OR description_language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  -- price
  pricing_unit         text NOT NULL REFERENCES public.pricing_units(code) ON UPDATE CASCADE,
  base_rate            numeric(12,2) CHECK (base_rate IS NULL OR base_rate >= 0),
  currency             text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  min_charge           numeric(12,2) CHECK (min_charge IS NULL OR min_charge >= 0),
  min_billable_qty     numeric(10,2) CHECK (min_billable_qty IS NULL OR min_billable_qty > 0),
  advance_percent      integer CHECK (advance_percent IS NULL OR advance_percent BETWEEN 0 AND 100),
  -- what the rate includes
  includes_operator    boolean NOT NULL DEFAULT false,
  includes_fuel        boolean NOT NULL DEFAULT false,
  includes_material    boolean NOT NULL DEFAULT false,
  -- output: "<capacity_value> <capacity_unit> per <capacity_period>", e.g. 8 PER_ACRE per DAY
  capacity_value       numeric(10,2) CHECK (capacity_value IS NULL OR capacity_value > 0),
  capacity_unit        text REFERENCES public.pricing_units(code) ON UPDATE CASCADE,
  capacity_period      text CHECK (capacity_period IS NULL OR capacity_period IN ('HOUR', 'DAY')),
  -- travel
  travel_charge        numeric(12,2) CHECK (travel_charge IS NULL OR travel_charge >= 0),
  free_travel_km       integer CHECK (free_travel_km IS NULL OR free_travel_km BETWEEN 0 AND 500),
  -- booking (NULL = the value in provider_workspace_policy)
  lead_time_days       integer CHECK (lead_time_days IS NULL OR lead_time_days BETWEEN 0 AND 60),
  same_day_cutoff      time,
  cancellation_hours   integer CHECK (cancellation_hours IS NULL OR cancellation_hours BETWEEN 0 AND 720),
  -- season: months 1–12; start > end means the season runs across the new year
  season_start_month   smallint CHECK (season_start_month IS NULL OR season_start_month BETWEEN 1 AND 12),
  season_end_month     smallint CHECK (season_end_month IS NULL OR season_end_month BETWEEN 1 AND 12),
  -- labour (a count and a tier only; never a labourer's personal data)
  crew_size            integer CHECK (crew_size IS NULL OR crew_size BETWEEN 1 AND 500),
  skill_tier           text REFERENCES public.skill_tiers(code) ON UPDATE CASCADE,
  equipment_id         uuid REFERENCES public.provider_equipment(id),
  payment_methods      text[] NOT NULL DEFAULT '{}',
  status               text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'REMOVED')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_services_capacity_whole CHECK (
    (capacity_value IS NULL AND capacity_unit IS NULL AND capacity_period IS NULL)
    OR (capacity_value IS NOT NULL AND capacity_unit IS NOT NULL AND capacity_period IS NOT NULL)),
  CONSTRAINT provider_services_season_whole CHECK ((season_start_month IS NULL) = (season_end_month IS NULL))
);
CREATE INDEX IF NOT EXISTS provider_services_account_idx  ON public.provider_services (account_id) WHERE status <> 'REMOVED';
CREATE INDEX IF NOT EXISTS provider_services_category_idx ON public.provider_services (category_code) WHERE status = 'ACTIVE';

-- ── 4. working hours: one window per weekday (0 = Sunday … 6 = Saturday) ────
CREATE TABLE IF NOT EXISTS public.provider_working_hours (
  account_id  uuid NOT NULL REFERENCES public.service_provider_profiles(account_id) ON UPDATE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_working  boolean NOT NULL DEFAULT true,
  start_time  time,
  end_time    time,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, weekday),
  CONSTRAINT provider_working_hours_window CHECK (
    (NOT is_working) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);

-- ── 5. blackouts: periods the provider cannot be booked ─────────────────────
-- MANUAL rows are the provider's own. JOB rows will be written by the job
-- functions of the later task when a job is confirmed, so a confirmed job and a
-- blackout can never overlap and the busy state needs no other source.
CREATE TABLE IF NOT EXISTS public.provider_blackouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES public.service_provider_profiles(account_id) ON UPDATE CASCADE,
  period        tstzrange NOT NULL CHECK (NOT isempty(period) AND lower(period) IS NOT NULL AND upper(period) IS NOT NULL),
  source        text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'JOB')),
  reason_code   text CHECK (reason_code IS NULL OR reason_code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  cancelled_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_blackouts_no_overlap
    EXCLUDE USING gist (account_id WITH =, period WITH &&) WHERE (cancelled_at IS NULL)
);
CREATE INDEX IF NOT EXISTS provider_blackouts_live_idx
  ON public.provider_blackouts (account_id, upper(period)) WHERE cancelled_at IS NULL;

-- ── 6. nursery store ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nursery_products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES public.service_provider_profiles(account_id) ON UPDATE CASCADE,
  crop_id        uuid NOT NULL REFERENCES public.crops(id),
  item_kind      text NOT NULL REFERENCES public.nursery_item_kinds(code) ON UPDATE CASCADE,
  pricing_unit   text NOT NULL REFERENCES public.pricing_units(code) ON UPDATE CASCADE,
  price          numeric(12,2) CHECK (price IS NULL OR price >= 0),
  currency       text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  min_order_qty  integer CHECK (min_order_qty IS NULL OR min_order_qty > 0),
  status         text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'REMOVED')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nursery_products_account_idx ON public.nursery_products (account_id) WHERE status <> 'REMOVED';
CREATE INDEX IF NOT EXISTS nursery_products_crop_idx    ON public.nursery_products (crop_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.nursery_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.nursery_products(id),
  total_qty     integer NOT NULL CHECK (total_qty >= 0),
  reserved_qty  integer NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  ready_date    date NOT NULL,
  status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nursery_batches_no_oversell CHECK (reserved_qty <= total_qty)
);
CREATE INDEX IF NOT EXISTS nursery_batches_product_idx ON public.nursery_batches (product_id, ready_date) WHERE status = 'ACTIVE';

-- ── 7. access: nothing for the browser roles ────────────────────────────────
ALTER TABLE public.service_provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_equipment        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_services         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_working_hours    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_blackouts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nursery_products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nursery_batches           ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.service_provider_profiles, public.provider_equipment, public.provider_services,
              public.provider_working_hours, public.provider_blackouts,
              public.nursery_products, public.nursery_batches
  FROM PUBLIC, anon, authenticated, service_role;
-- The service role may read, add and change, never delete or truncate: nothing here is ever deleted.
GRANT SELECT, INSERT, UPDATE ON public.service_provider_profiles, public.provider_equipment, public.provider_services,
              public.provider_working_hours, public.provider_blackouts,
              public.nursery_products, public.nursery_batches
  TO service_role;

-- ── 8. limits (D7): one config row, edited without a migration ──────────────
INSERT INTO public.system_config (config_key, config_value, description)
SELECT 'provider_workspace_policy',
       '{"max_services": 50, "max_equipment": 30, "max_nursery_products": 100,
         "max_blackout_days": 90, "max_live_blackouts": 40,
         "lead_time_days_default": 1, "same_day_cutoff": "16:00",
         "availability_horizon_days": 60, "timezone": "Asia/Kolkata"}'::jsonb,
       'Provider Workspace limits and booking defaults. Read by provider_workspace_policy().'
 WHERE NOT EXISTS (SELECT 1 FROM public.system_config WHERE config_key = 'provider_workspace_policy');

COMMENT ON TABLE public.service_provider_profiles IS 'A service provider''s business profile. Written only by the provider_* functions; listing_status only by provider_submit_for_review() and provider_review_listing().';
COMMENT ON TABLE public.provider_services         IS 'One row per service a provider offers: category, rate, unit and the details a farmer needs before hiring.';
COMMENT ON TABLE public.provider_working_hours    IS 'A provider''s weekly working window, one row per weekday (0 = Sunday).';
COMMENT ON TABLE public.provider_blackouts        IS 'Periods a provider cannot be booked. Never shown to anyone else; only the derived availability state is.';
COMMENT ON TABLE public.provider_equipment        IS 'A provider''s machines and vehicles. Stores only the last four characters of a registration number.';
COMMENT ON TABLE public.nursery_products          IS 'Plant stock a nursery sells, by crop and kind.';
COMMENT ON TABLE public.nursery_batches           IS 'Stock of a nursery product. reserved_qty can never exceed total_qty.';

-- Verification (read-only) ────────────────────────────────────────────────────
SELECT 'client privileges on provider tables' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('service_provider_profiles', 'provider_equipment', 'provider_services',
                      'provider_working_hours', 'provider_blackouts', 'nursery_products', 'nursery_batches')
   AND grantee IN ('anon', 'authenticated', 'PUBLIC');
SELECT 'provider tables with row security on' AS check_name, count(*)::text AS actual, '7' AS expected
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relrowsecurity
   AND c.relname IN ('service_provider_profiles', 'provider_equipment', 'provider_services',
                     'provider_working_hours', 'provider_blackouts', 'nursery_products', 'nursery_batches');
