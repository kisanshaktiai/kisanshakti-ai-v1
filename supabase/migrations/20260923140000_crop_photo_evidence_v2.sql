-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- PATH : supabase/migrations/20260923140000_crop_photo_evidence_v2.sql
-- STATUS: FOR REVIEW ONLY — NOT APPLIED.
-- SUPERSEDES (never apply these): 20260923_photo_evidence_store.sql (v1, this
--   chat) and 20260923121000_crop_photo_evidence.sql (parallel package).
--
-- PURPOSE — KisanShakti Agricultural AI Dataset, Phase 1 ("capture once →
-- preserve forever → annotate progressively → verify independently → export
-- into any future training format"). Phase 1 = PHOTO + IDENTITY + AGRICULTURAL
-- CONTEXT + OBJECT + OBSERVATION + PROVENANCE + CONSENT. Dataset versions and
-- exports (Phase 4) are deliberately NOT built here.
--
--   LAYER 1  RAW          crop_growth_uploads (existing table, extended)
--                          one row per photo; asset fields immutable after insert;
--                          full context snapshot taken server-side at insert.
--   LAYER 2  ANNOTATION   crop_photo_annotation (new, append-only)
--                          every label ever asserted — model, farmer, expert,
--                          lab, outcome — with tier, labeller and supersession.
--            TEMPORAL     crop_photo_link (new) — follow-up / treatment /
--                          same-plant chains (E001 → E002 → E003 …).
--            ENGINE RUN   crop_photo_diagnosis (+ crop_photo_diagnosis_photo) —
--                          one row per perception run: model, tokens, cost,
--                          Decision Brain trace.
--   LAYER 3  TRAINING     not stored; generated later from the contract
--                          function photo_evidence_record(upload_id).
--
-- RULES ENFORCED IN THE DATABASE (not left to application code):
--   * identity, crop cycle, stage, DAS/DAT/GDD, weather, NDVI, soil and farm-
--     state references are derived from the land at insert — client values
--     for these are ignored;
--   * raw asset fields (path, hash, capture time, land) can never be changed;
--   * annotations are append-only; a correction is a new row that supersedes;
--   * every coded label must exist in its master table (no invented codes);
--   * a severity label can only come from expert, lab or outcome — never from
--     the model (the Decision Brain decides severity);
--   * no row in these tables can be deleted; land/tenant/schedule deletes are
--     RESTRICTed instead of cascading;
--   * farmers read only their own rows through the verified session; only the
--     service role (the engine) writes.
--
-- Live facts this file relies on (read 2026-09-23): crop_growth_uploads has
-- 0 rows; its FKs are land/tenant ON DELETE CASCADE and schedule/task ON DELETE
-- SET NULL; its four policies use auth.uid() (inert under PIN auth);
-- resolve_crop_phenology_for_land(uuid,date) returns stage_uuid, stage_code,
-- crop_code, cultivation_method, current_das, current_dat, current_gdd, …;
-- farmers.timezone exists; crops has value/label/label_local/local_name and
-- label_{hi,mr,pa,ta,te,bn,gu,kn,ml,or,as,ur,sa}; hypothesis_master key is
-- hypothesis_id (text); observation_master key is observation_code (text);
-- land_weather_state(land_id, metric_date), ndvi_data(land_id, acquisition_date,
-- date, ndvi_value, mean_ndvi), soil_health(land_id, test_date),
-- land_farm_state(land_id, state_date); farmer_consent_log exists (0 rows).
--
-- Runner rules: no TEMP tables, no SET, each statement independent, re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════


-- §0 PREFLIGHT ──────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY['lands','farmers','crops','crop_schedules','schedule_tasks','crop_stage_master',
                               'observation_master','hypothesis_master','land_observation','land_weather_state',
                               'ndvi_data','soil_health','land_farm_state','farmer_consent_log','system_config',
                               'crop_growth_uploads']) AS t
  LOOP
    IF to_regclass('public.' || r.t) IS NULL THEN v_missing := v_missing || ('table ' || r.t); END IF;
  END LOOP;
  FOR r IN SELECT unnest(ARRAY['has_tenant_access','get_current_farmer_id','is_tenant_admin',
                               'resolve_crop_phenology_for_land']) AS f
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = r.f) THEN
      v_missing := v_missing || ('function ' || r.f);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'farmers' AND column_name = 'timezone') THEN
    v_missing := v_missing || 'column farmers.timezone'; END IF;
  IF (SELECT count(*) FROM public.crop_growth_uploads) <> 0 THEN
    v_missing := v_missing || 'crop_growth_uploads is not empty — review the FK and NOT NULL changes against existing rows first';
  END IF;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'crop_photo_evidence_v2 preflight failed: %', array_to_string(v_missing, '; ');
  END IF;
END
$preflight$;


-- §1 LAYER 1 — RAW EVIDENCE: extend crop_growth_uploads ─────────────────────

-- 1a. Never cascade-delete evidence.
ALTER TABLE public.crop_growth_uploads
  DROP CONSTRAINT IF EXISTS crop_growth_uploads_land_id_fkey,
  ADD  CONSTRAINT crop_growth_uploads_land_id_fkey
       FOREIGN KEY (land_id) REFERENCES public.lands(id) ON DELETE RESTRICT;
ALTER TABLE public.crop_growth_uploads
  DROP CONSTRAINT IF EXISTS crop_growth_uploads_tenant_id_fkey,
  ADD  CONSTRAINT crop_growth_uploads_tenant_id_fkey
       FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.crop_growth_uploads
  DROP CONSTRAINT IF EXISTS crop_growth_uploads_schedule_id_fkey,
  ADD  CONSTRAINT crop_growth_uploads_schedule_id_fkey
       FOREIGN KEY (schedule_id) REFERENCES public.crop_schedules(id) ON DELETE RESTRICT;
ALTER TABLE public.crop_growth_uploads
  DROP CONSTRAINT IF EXISTS crop_growth_uploads_task_id_fkey,
  ADD  CONSTRAINT crop_growth_uploads_task_id_fkey
       FOREIGN KEY (task_id) REFERENCES public.schedule_tasks(id) ON DELETE RESTRICT;

-- 1b. file_url is the legacy public-URL column; new rows use bucket + path.
ALTER TABLE public.crop_growth_uploads ALTER COLUMN file_url  DROP NOT NULL;
ALTER TABLE public.crop_growth_uploads ALTER COLUMN file_type SET DEFAULT 'image';

-- 1c. Asset, capture, agricultural context, consent.
ALTER TABLE public.crop_growth_uploads
  ADD COLUMN IF NOT EXISTS contract_version   text NOT NULL DEFAULT 'photo-evidence@1',
  ADD COLUMN IF NOT EXISTS storage_bucket     text NOT NULL DEFAULT 'crop-growth-media',
  ADD COLUMN IF NOT EXISTS storage_path       text,          -- {tenant}/{farmer}/{land}/{yyyy}/{mm}/{id}/raw.jpg
  ADD COLUMN IF NOT EXISTS object_confirmed   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_sha256     text,
  ADD COLUMN IF NOT EXISTS mime_type          text NOT NULL DEFAULT 'image/jpeg',
  ADD COLUMN IF NOT EXISTS width_px           integer,
  ADD COLUMN IF NOT EXISTS height_px          integer,
  ADD COLUMN IF NOT EXISTS bytes              integer,
  ADD COLUMN IF NOT EXISTS client_quality     jsonb,         -- sharpness / brightness / contrast measured on device
  ADD COLUMN IF NOT EXISTS original_width_px  integer,       -- camera output before the one resize
  ADD COLUMN IF NOT EXISTS original_height_px integer,
  ADD COLUMN IF NOT EXISTS processing         jsonb,         -- provenance: {pipeline_version, source, resize, jpeg_quality, encoded_once}
  ADD COLUMN IF NOT EXISTS captured_at        timestamptz,   -- device time at shutter
  ADD COLUMN IF NOT EXISTS client_capture_id  uuid,          -- idempotency key from the offline queue
  ADD COLUMN IF NOT EXISTS created_offline    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS device             jsonb,         -- { platform, os_version, app_version, camera: {…} }
  ADD COLUMN IF NOT EXISTS capture_purpose    text,
  ADD COLUMN IF NOT EXISTS location_level     text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS crop_id            uuid REFERENCES public.crops(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS crop_value         text,          -- crops.value; NULL = crop not resolvable (fail closed)
  ADD COLUMN IF NOT EXISTS stage_uuid         uuid,          -- ESTIMATE from the phenology resolver, not what the photo shows
  ADD COLUMN IF NOT EXISTS stage_code         text,
  ADD COLUMN IF NOT EXISTS das                integer,
  ADD COLUMN IF NOT EXISTS dat                integer,
  ADD COLUMN IF NOT EXISTS gdd                numeric,
  ADD COLUMN IF NOT EXISTS cultivation_method text,
  ADD COLUMN IF NOT EXISTS context_snapshot   jsonb,         -- resolver row, variety, env refs, NDVI, tz — frozen at capture
  ADD COLUMN IF NOT EXISTS training_consent   boolean NOT NULL DEFAULT false,  -- consent state AT CAPTURE
  ADD COLUMN IF NOT EXISTS consent_log_id     uuid REFERENCES public.farmer_consent_log(id) ON DELETE RESTRICT;

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crop_growth_uploads_capture_purpose_chk') THEN
    ALTER TABLE public.crop_growth_uploads ADD CONSTRAINT crop_growth_uploads_capture_purpose_chk
      CHECK (capture_purpose IS NULL OR capture_purpose IN
             ('chat_question','instascan','schedule_task','growth_tracking','land_card'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crop_growth_uploads_location_level_chk') THEN
    ALTER TABLE public.crop_growth_uploads ADD CONSTRAINT crop_growth_uploads_location_level_chk
      CHECK (location_level IN ('at_land','nearby','far','unknown'));
  END IF;
  -- Private-bucket paths must sit under the row's own tenant/farmer/land.
  -- (Checked after BEFORE INSERT triggers have filled tenant_id/farmer_id.)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crop_growth_uploads_path_owner_chk') THEN
    ALTER TABLE public.crop_growth_uploads ADD CONSTRAINT crop_growth_uploads_path_owner_chk
      CHECK (storage_path IS NULL
             OR storage_path LIKE tenant_id::text || '/' || farmer_id::text || '/' || land_id::text || '/%');
  END IF;
END
$chk$;

CREATE UNIQUE INDEX IF NOT EXISTS crop_growth_uploads_object_uq
  ON public.crop_growth_uploads (storage_bucket, storage_path) WHERE storage_path IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crop_growth_uploads_capture_uq
  ON public.crop_growth_uploads (farmer_id, client_capture_id) WHERE client_capture_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crop_growth_uploads_sha_uq
  ON public.crop_growth_uploads (land_id, content_sha256) WHERE content_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS crop_growth_uploads_land_captured_idx
  ON public.crop_growth_uploads (land_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS crop_growth_uploads_crop_stage_idx
  ON public.crop_growth_uploads (crop_value, stage_code);
CREATE INDEX IF NOT EXISTS crop_growth_uploads_schedule_idx
  ON public.crop_growth_uploads (schedule_id) WHERE schedule_id IS NOT NULL;


-- §2 CONSENT HELPER ─────────────────────────────────────────────────────────
-- Latest decision for consent_type 'photo_ai_training' in the existing
-- farmer_consent_log. No row = no consent.
CREATE OR REPLACE FUNCTION public.photo_training_consent(p_farmer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT coalesce((
    SELECT c.consent_given
      FROM public.farmer_consent_log c
     WHERE c.farmer_id = p_farmer_id AND c.consent_type = 'photo_ai_training'
     ORDER BY c.created_at DESC
     LIMIT 1), false);
$fn$;


-- §3 CONTEXT TRIGGER — identity + agricultural context, server-side ─────────
CREATE OR REPLACE FUNCTION public.crop_photo_fill_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_land       record;
  v_tz         text;
  v_tz_source  text;
  v_local      date;
  v_ph         record;
  v_crop_id    uuid;
  v_match_id   uuid;
  v_match_n    integer;
  v_sched      record;
  v_ws         record;
  v_ndvi       record;
  v_soil_id    uuid;
  v_fs_id      uuid;
  v_consent    record;
  -- jsonb copies so an absent row never leaves an unassigned record behind
  j_ph         jsonb;
  j_sched      jsonb;
  j_ws         jsonb;
  j_ndvi       jsonb;
BEGIN
  -- Identity comes from the land row only.
  SELECT l.tenant_id, l.farmer_id, l.current_crop_id, l.current_crop
    INTO v_land
    FROM public.lands l
   WHERE l.id = NEW.land_id;
  IF NOT FOUND OR v_land.tenant_id IS NULL OR v_land.farmer_id IS NULL THEN
    RAISE EXCEPTION 'land % not found or has no owner', NEW.land_id USING errcode = '23503';
  END IF;
  NEW.tenant_id := v_land.tenant_id;
  NEW.farmer_id := v_land.farmer_id;

  -- Crop cycle = the land's active crop_schedules row (at most one, enforced elsewhere).
  IF NEW.schedule_id IS NULL THEN
    SELECT s.id INTO NEW.schedule_id
      FROM public.crop_schedules s
     WHERE s.land_id = NEW.land_id AND s.is_active
     LIMIT 1;
  ELSIF NOT EXISTS (SELECT 1 FROM public.crop_schedules s
                     WHERE s.id = NEW.schedule_id AND s.land_id = NEW.land_id) THEN
    RAISE EXCEPTION 'schedule % does not belong to land %', NEW.schedule_id, NEW.land_id USING errcode = '23514';
  END IF;

  NEW.captured_at := coalesce(NEW.captured_at, NEW.upload_timestamp, now());

  -- Capture-local date in the farmer's own time zone.
  SELECT f.timezone INTO v_tz FROM public.farmers f WHERE f.id = NEW.farmer_id;
  IF v_tz IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = v_tz) THEN
    v_tz_source := 'farmer';
  ELSE
    v_tz := 'UTC';
    v_tz_source := 'utc_fallback';
  END IF;
  v_local := (NEW.captured_at AT TIME ZONE v_tz)::date;

  -- Phenology estimate for that date.
  SELECT r.* INTO v_ph
    FROM public.resolve_crop_phenology_for_land(NEW.land_id, v_local) r
   LIMIT 1;
  IF FOUND THEN
    j_ph := to_jsonb(v_ph);
    NEW.stage_uuid         := v_ph.stage_uuid;
    NEW.stage_code         := v_ph.stage_code;
    NEW.das                := v_ph.current_das;
    NEW.dat                := v_ph.current_dat;
    NEW.gdd                := v_ph.current_gdd;
    NEW.cultivation_method := v_ph.cultivation_method;
  END IF;

  -- Canonical crop: land FK first, then resolver crop code, then the land's crop
  -- text against every crop name column. Ambiguous or no match = NULL (fail closed).
  v_crop_id := v_land.current_crop_id;
  IF v_crop_id IS NULL AND (j_ph ->> 'crop_code') IS NOT NULL THEN
    SELECT c.id INTO v_crop_id FROM public.crops c WHERE lower(c.value) = lower(j_ph ->> 'crop_code') LIMIT 1;
  END IF;
  IF v_crop_id IS NULL AND nullif(btrim(v_land.current_crop), '') IS NOT NULL THEN
    SELECT (array_agg(c.id))[1], count(*)
      INTO v_match_id, v_match_n
      FROM public.crops c
     WHERE lower(btrim(v_land.current_crop)) IN (
             lower(c.value), lower(c.label), lower(c.label_local), lower(c.local_name),
             lower(c.label_hi), lower(c.label_mr), lower(c.label_pa), lower(c.label_ta),
             lower(c.label_te), lower(c.label_bn), lower(c.label_gu), lower(c.label_kn),
             lower(c.label_ml), lower(c.label_or), lower(c.label_as), lower(c.label_ur),
             lower(c.label_sa));
    IF v_match_n = 1 THEN v_crop_id := v_match_id; END IF;
  END IF;
  NEW.crop_id := v_crop_id;
  NEW.crop_value := (SELECT c.value FROM public.crops c WHERE c.id = v_crop_id);

  -- Variety, from the crop cycle row.
  IF NEW.schedule_id IS NOT NULL THEN
    SELECT s.variety_id, s.crop_variety INTO v_sched
      FROM public.crop_schedules s WHERE s.id = NEW.schedule_id;
    IF FOUND THEN j_sched := to_jsonb(v_sched); END IF;
  END IF;

  -- Environment at capture: nearest earlier-or-same-day row of each source.
  SELECT w.* INTO v_ws
    FROM public.land_weather_state w
   WHERE w.land_id = NEW.land_id AND w.metric_date <= v_local
   ORDER BY w.metric_date DESC, w.computed_at DESC NULLS LAST
   LIMIT 1;
  IF FOUND THEN
    j_ws := to_jsonb(v_ws);
    NEW.weather_at_capture := j_ws;
  END IF;

  SELECT n.id, n.acquisition_date, n.date, n.ndvi_value, n.mean_ndvi INTO v_ndvi
    FROM public.ndvi_data n
   WHERE n.land_id = NEW.land_id
     AND ((n.acquisition_date IS NOT NULL AND n.acquisition_date <= v_local)
          OR (n.acquisition_date IS NULL AND n.date <= v_local))
   ORDER BY n.acquisition_date DESC NULLS LAST, n.date DESC NULLS LAST
   LIMIT 1;
  IF FOUND THEN j_ndvi := to_jsonb(v_ndvi); END IF;

  SELECT s.id INTO v_soil_id
    FROM public.soil_health s
   WHERE s.land_id = NEW.land_id
   ORDER BY s.test_date DESC NULLS LAST, s.created_at DESC
   LIMIT 1;

  SELECT fs.id INTO v_fs_id
    FROM public.land_farm_state fs
   WHERE fs.land_id = NEW.land_id AND fs.state_date <= v_local
   ORDER BY fs.state_date DESC, fs.computed_at DESC NULLS LAST
   LIMIT 1;

  -- Consent state at capture.
  SELECT c.id, c.consent_given INTO v_consent
    FROM public.farmer_consent_log c
   WHERE c.farmer_id = NEW.farmer_id AND c.consent_type = 'photo_ai_training'
   ORDER BY c.created_at DESC
   LIMIT 1;
  IF FOUND THEN
    NEW.consent_log_id   := v_consent.id;
    NEW.training_consent := coalesce(v_consent.consent_given, false);
  ELSE
    NEW.consent_log_id   := NULL;
    NEW.training_consent := false;
  END IF;

  NEW.context_snapshot := jsonb_build_object(
    'contract',           NEW.contract_version,
    'capture_local_date', v_local,
    'timezone',           v_tz,
    'timezone_source',    v_tz_source,
    'phenology',          j_ph,
    'crop_resolution',    CASE WHEN v_land.current_crop_id IS NOT NULL THEN 'land_crop_id'
                               WHEN v_crop_id IS NOT NULL THEN 'matched'
                               ELSE 'unresolved' END,
    'variety',            j_sched,
    'ndvi',               j_ndvi,
    'refs', jsonb_build_object(
       'weather_state_id', j_ws ->> 'id',
       'ndvi_data_id',     j_ndvi ->> 'id',
       'soil_health_id',   v_soil_id,
       'farm_state_id',    v_fs_id)
  );

  RETURN NEW;
END
$fn$;

-- Raw asset fields never change after insert (a missing value may be filled once).
CREATE OR REPLACE FUNCTION public.crop_photo_guard_raw()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.land_id   IS DISTINCT FROM OLD.land_id
  OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
  OR NEW.farmer_id IS DISTINCT FROM OLD.farmer_id
  OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
  OR (OLD.storage_path      IS NOT NULL AND NEW.storage_path      IS DISTINCT FROM OLD.storage_path)
  OR (OLD.content_sha256    IS NOT NULL AND NEW.content_sha256    IS DISTINCT FROM OLD.content_sha256)
  OR (OLD.captured_at       IS NOT NULL AND NEW.captured_at       IS DISTINCT FROM OLD.captured_at)
  OR (OLD.client_capture_id IS NOT NULL AND NEW.client_capture_id IS DISTINCT FROM OLD.client_capture_id)
  OR NEW.context_snapshot IS DISTINCT FROM OLD.context_snapshot
  OR (OLD.processing         IS NOT NULL AND NEW.processing         IS DISTINCT FROM OLD.processing)
  OR (OLD.original_width_px  IS NOT NULL AND NEW.original_width_px  IS DISTINCT FROM OLD.original_width_px)
  OR (OLD.original_height_px IS NOT NULL AND NEW.original_height_px IS DISTINCT FROM OLD.original_height_px)
  THEN
    RAISE EXCEPTION 'raw evidence fields of crop_growth_uploads % are immutable', OLD.id USING errcode = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.crop_photo_prevent_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION '% rows are evidence and are never deleted', TG_TABLE_NAME USING errcode = '42501';
END
$fn$;


-- §4 ENGINE RUN — crop_photo_diagnosis ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crop_photo_diagnosis (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  farmer_id           uuid NOT NULL,
  land_id             uuid NOT NULL REFERENCES public.lands(id) ON DELETE RESTRICT,
  schedule_id         uuid REFERENCES public.crop_schedules(id) ON DELETE RESTRICT,
  task_id             uuid REFERENCES public.schedule_tasks(id) ON DELETE RESTRICT,
  purpose             text NOT NULL CHECK (purpose IN ('chat_question','instascan','schedule_task','growth_tracking','land_card')),
  chat_session_id     uuid,
  language            text NOT NULL DEFAULT 'und',
  farmer_text         text,                -- the farmer's own words, verbatim
  status              text NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','processing','completed','needs_follow_up',
                                          'retake_requested','crop_mismatch','crop_unresolved','failed')),
  engine_version      text NOT NULL,
  prompt_version      text,
  model_requested     text,
  model_used          text,
  fallback_used       boolean NOT NULL DEFAULT false,
  input_tokens        integer,
  cached_input_tokens integer,
  output_tokens       integer,
  cost_usd            numeric(12,6),       -- NULL when no price is configured; never estimated
  price_snapshot      jsonb,
  latency_ms          integer,
  perception          jsonb,               -- validated engine output (diagnosis-contract.ts)
  follow_up           jsonb,
  decision_log_id     uuid REFERENCES public.ai_decision_log(id) ON DELETE RESTRICT,
  decision_trace_id   text,
  decision_summary    jsonb,
  error_code          text,
  error_detail        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);
CREATE INDEX IF NOT EXISTS crop_photo_diagnosis_land_created_idx ON public.crop_photo_diagnosis (land_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crop_photo_diagnosis_farmer_created_idx ON public.crop_photo_diagnosis (farmer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crop_photo_diagnosis_photo (
  diagnosis_id  uuid NOT NULL REFERENCES public.crop_photo_diagnosis(id) ON DELETE RESTRICT,
  upload_id     uuid NOT NULL REFERENCES public.crop_growth_uploads(id)  ON DELETE RESTRICT,
  photo_index   integer NOT NULL CHECK (photo_index >= 0),
  shot_role     text NOT NULL DEFAULT 'other'
                  CHECK (shot_role IN ('symptom_closeup','whole_plant','field_view','other')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (diagnosis_id, upload_id),
  CONSTRAINT crop_photo_diagnosis_photo_index_uq UNIQUE (diagnosis_id, photo_index)
);
CREATE INDEX IF NOT EXISTS crop_photo_diagnosis_photo_upload_idx ON public.crop_photo_diagnosis_photo (upload_id);

CREATE OR REPLACE FUNCTION public.crop_photo_diagnosis_fill_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  SELECT l.tenant_id, l.farmer_id INTO NEW.tenant_id, NEW.farmer_id
    FROM public.lands l WHERE l.id = NEW.land_id;
  IF NEW.tenant_id IS NULL OR NEW.farmer_id IS NULL THEN
    RAISE EXCEPTION 'land % not found or has no owner', NEW.land_id USING errcode = '23503';
  END IF;
  IF NEW.schedule_id IS NULL THEN
    SELECT s.id INTO NEW.schedule_id FROM public.crop_schedules s
     WHERE s.land_id = NEW.land_id AND s.is_active LIMIT 1;
  ELSIF NOT EXISTS (SELECT 1 FROM public.crop_schedules s WHERE s.id = NEW.schedule_id AND s.land_id = NEW.land_id) THEN
    RAISE EXCEPTION 'schedule % does not belong to land %', NEW.schedule_id, NEW.land_id USING errcode = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.crop_photo_diagnosis_photo_same_land()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crop_photo_diagnosis d
                   JOIN public.crop_growth_uploads u ON u.id = NEW.upload_id
                  WHERE d.id = NEW.diagnosis_id AND d.land_id = u.land_id) THEN
    RAISE EXCEPTION 'photo % and diagnosis % are not on the same land', NEW.upload_id, NEW.diagnosis_id
      USING errcode = '23514';
  END IF;
  RETURN NEW;
END
$fn$;


-- §5 LAYER 2 — ANNOTATIONS (append-only label history) ──────────────────────
CREATE TABLE IF NOT EXISTS public.crop_photo_annotation (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  farmer_id        uuid NOT NULL,
  land_id          uuid NOT NULL,
  upload_id        uuid NOT NULL REFERENCES public.crop_growth_uploads(id) ON DELETE RESTRICT,
  diagnosis_id     uuid REFERENCES public.crop_photo_diagnosis(id) ON DELETE RESTRICT,
  annotation_type  text NOT NULL CHECK (annotation_type IN (
                     'image_quality',    -- usable | retake reason code
                     'lifecycle_phase',  -- pre_sowing | nursery | crop_growth | harvest | post_harvest
                     'subject_class',    -- what the photo is of
                     'crop',             -- crops.value
                     'growth_stage',     -- crop_stage_master.stage_code (what the photo SHOWS)
                     'plant_part',       -- observation_master.affected_plant_part value
                     'observation',      -- observation_master.observation_code
                     'cause',            -- hypothesis_master.hypothesis_id
                     'taxon',            -- scientific name in value_text (no species register yet)
                     'severity',         -- value_numeric = % of tissue/area affected; expert tiers only
                     'unmapped_sign')),  -- visible sign with no code yet; value_text describes it
  value_code       text,
  value_text       text,              -- English description / scientific name / note
  value_numeric    numeric,
  assertion        text NOT NULL DEFAULT 'present' CHECK (assertion IN ('present','absent','uncertain')),
  confidence       numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  region           jsonb,             -- NULL = whole image; else {type: bbox|polygon|mask, coords normalised 0..1, mask_path?}
  source_tier      text NOT NULL CHECK (source_tier IN
                     ('model_proposed','farmer_reported','expert_verified','lab_confirmed','outcome_confirmed')),
  labeller_type    text NOT NULL CHECK (labeller_type IN ('model','farmer','expert','lab','system')),
  labeller_ref     text NOT NULL,     -- model name@version, or a user id — never a person's name
  model_name       text,
  model_version    text,
  prompt_version   text,
  supersedes_id    uuid REFERENCES public.crop_photo_annotation(id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crop_photo_annotation_severity_tier_chk
    CHECK (annotation_type <> 'severity'
           OR (source_tier IN ('expert_verified','lab_confirmed','outcome_confirmed')
               AND value_numeric IS NOT NULL AND value_numeric >= 0 AND value_numeric <= 100)),
  CONSTRAINT crop_photo_annotation_model_tier_chk
    CHECK ((labeller_type = 'model') = (source_tier = 'model_proposed')),
  CONSTRAINT crop_photo_annotation_region_chk
    CHECK (region IS NULL OR (region ->> 'type') IN ('bbox','polygon','mask')),
  CONSTRAINT crop_photo_annotation_value_chk
    CHECK (CASE annotation_type
             WHEN 'unmapped_sign' THEN value_code IS NULL AND nullif(btrim(value_text), '') IS NOT NULL
             WHEN 'taxon'         THEN value_code IS NULL AND nullif(btrim(value_text), '') IS NOT NULL
             WHEN 'severity'      THEN value_code IS NULL
             ELSE value_code IS NOT NULL
           END)
);
CREATE INDEX IF NOT EXISTS crop_photo_annotation_upload_idx ON public.crop_photo_annotation (upload_id, annotation_type);
CREATE INDEX IF NOT EXISTS crop_photo_annotation_code_idx   ON public.crop_photo_annotation (annotation_type, value_code);
CREATE INDEX IF NOT EXISTS crop_photo_annotation_tier_idx   ON public.crop_photo_annotation (source_tier, created_at DESC);

CREATE OR REPLACE FUNCTION public.crop_photo_annotation_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ok boolean;
BEGIN
  SELECT u.tenant_id, u.farmer_id, u.land_id INTO NEW.tenant_id, NEW.farmer_id, NEW.land_id
    FROM public.crop_growth_uploads u WHERE u.id = NEW.upload_id;
  IF NEW.land_id IS NULL THEN
    RAISE EXCEPTION 'upload % not found', NEW.upload_id USING errcode = '23503';
  END IF;

  v_ok := CASE NEW.annotation_type
    WHEN 'image_quality'   THEN NEW.value_code IN ('usable','blurred','too_dark','overexposed','not_a_plant',
                                                    'wrong_plant_part','too_far','obstructed')
    WHEN 'lifecycle_phase' THEN NEW.value_code IN ('pre_sowing','nursery','crop_growth','harvest','post_harvest')
    WHEN 'subject_class'   THEN NEW.value_code IN ('crop_plant','weed','insect_pest','pest_damage','disease_symptom',
                                                    'nutrient_symptom','abiotic_damage','beneficial_insect','animal_damage',
                                                    'soil','seed','irrigation','field_view','harvested_produce',
                                                    'stored_produce','not_agri')
    WHEN 'crop'            THEN EXISTS (SELECT 1 FROM public.crops c WHERE c.value = NEW.value_code)
    WHEN 'growth_stage'    THEN EXISTS (SELECT 1 FROM public.crop_stage_master s WHERE s.stage_code = NEW.value_code)
    WHEN 'plant_part'      THEN EXISTS (SELECT 1 FROM public.observation_master o WHERE o.affected_plant_part = NEW.value_code)
    WHEN 'observation'     THEN EXISTS (SELECT 1 FROM public.observation_master o WHERE o.observation_code = NEW.value_code)
    WHEN 'cause'           THEN EXISTS (SELECT 1 FROM public.hypothesis_master h WHERE h.hypothesis_id = NEW.value_code)
    ELSE true   -- taxon / severity / unmapped_sign are checked by table constraints
  END;
  IF NOT coalesce(v_ok, false) THEN
    RAISE EXCEPTION 'annotation % value % is not in its master vocabulary', NEW.annotation_type, NEW.value_code
      USING errcode = '23514';
  END IF;

  IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.crop_photo_annotation a
        WHERE a.id = NEW.supersedes_id AND a.upload_id = NEW.upload_id) THEN
    RAISE EXCEPTION 'annotation % can only supersede an annotation on the same photo', NEW.supersedes_id
      USING errcode = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.crop_photo_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only: add a new row with supersedes_id instead', TG_TABLE_NAME USING errcode = '42501';
END
$fn$;


-- §6 TEMPORAL LINKS — evidence chains ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crop_photo_link (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  farmer_id         uuid NOT NULL,
  land_id           uuid NOT NULL,
  from_upload_id    uuid NOT NULL REFERENCES public.crop_growth_uploads(id) ON DELETE RESTRICT,
  relation          text NOT NULL CHECK (relation IN (
                      'follow_up_of',        -- later photo of the same problem
                      'same_plant_as',
                      'same_spot_as',
                      'after_treatment_of',  -- taken after the linked treatment task
                      'duplicate_of')),
  to_upload_id      uuid REFERENCES public.crop_growth_uploads(id) ON DELETE RESTRICT,
  treatment_task_id uuid REFERENCES public.schedule_tasks(id) ON DELETE RESTRICT,
  decision_trace_id text,
  source_tier       text NOT NULL CHECK (source_tier IN
                      ('model_proposed','farmer_reported','expert_verified','lab_confirmed','outcome_confirmed')),
  labeller_ref      text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crop_photo_link_target_chk CHECK (to_upload_id IS NOT NULL OR treatment_task_id IS NOT NULL),
  CONSTRAINT crop_photo_link_not_self_chk CHECK (to_upload_id IS NULL OR to_upload_id <> from_upload_id)
);
CREATE INDEX IF NOT EXISTS crop_photo_link_from_idx ON public.crop_photo_link (from_upload_id);
CREATE INDEX IF NOT EXISTS crop_photo_link_to_idx   ON public.crop_photo_link (to_upload_id) WHERE to_upload_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crop_photo_link_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  SELECT u.tenant_id, u.farmer_id, u.land_id INTO NEW.tenant_id, NEW.farmer_id, NEW.land_id
    FROM public.crop_growth_uploads u WHERE u.id = NEW.from_upload_id;
  IF NEW.land_id IS NULL THEN
    RAISE EXCEPTION 'upload % not found', NEW.from_upload_id USING errcode = '23503';
  END IF;
  IF NEW.to_upload_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.crop_growth_uploads u WHERE u.id = NEW.to_upload_id AND u.land_id = NEW.land_id) THEN
    RAISE EXCEPTION 'linked photos must be on the same land' USING errcode = '23514';
  END IF;
  IF NEW.treatment_task_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.schedule_tasks t
         JOIN public.crop_schedules s ON s.id = t.schedule_id
        WHERE t.id = NEW.treatment_task_id AND s.land_id = NEW.land_id) THEN
    RAISE EXCEPTION 'treatment task % is not on land %', NEW.treatment_task_id, NEW.land_id USING errcode = '23514';
  END IF;
  RETURN NEW;
END
$fn$;


-- §7 land_observation — per-code photo observations feed farm state ────────
-- Engine rule (code, not SQL): one land_observation row per confirmed code with
-- measurement_type = observation_code (build_land_farm_state keeps one row per
-- measurement_type via DISTINCT ON), observation_category from
-- observation_master (derive_farm_decisions reads it), source = 'scan'.
ALTER TABLE public.land_observation
  ADD COLUMN IF NOT EXISTS photo_upload_id    uuid REFERENCES public.crop_growth_uploads(id)  ON DELETE RESTRICT;
ALTER TABLE public.land_observation
  ADD COLUMN IF NOT EXISTS photo_diagnosis_id uuid REFERENCES public.crop_photo_diagnosis(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS land_observation_photo_upload_idx
  ON public.land_observation (photo_upload_id) WHERE photo_upload_id IS NOT NULL;


-- §8 TRIGGERS ───────────────────────────────────────────────────────────────
DO $trg$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('trg_crop_photo_fill_context',        'crop_growth_uploads',        'BEFORE INSERT',           'crop_photo_fill_context'),
    ('trg_crop_photo_guard_raw',           'crop_growth_uploads',        'BEFORE UPDATE',           'crop_photo_guard_raw'),
    ('trg_crop_photo_upload_no_delete',    'crop_growth_uploads',        'BEFORE DELETE',           'crop_photo_prevent_delete'),
    ('trg_crop_photo_diagnosis_identity',  'crop_photo_diagnosis',       'BEFORE INSERT',           'crop_photo_diagnosis_fill_identity'),
    ('trg_crop_photo_diagnosis_no_delete', 'crop_photo_diagnosis',       'BEFORE DELETE',           'crop_photo_prevent_delete'),
    ('trg_crop_photo_diag_photo_land',     'crop_photo_diagnosis_photo', 'BEFORE INSERT',           'crop_photo_diagnosis_photo_same_land'),
    ('trg_crop_photo_diag_photo_no_delete','crop_photo_diagnosis_photo', 'BEFORE DELETE',           'crop_photo_prevent_delete'),
    ('trg_crop_photo_annotation_validate', 'crop_photo_annotation',      'BEFORE INSERT',           'crop_photo_annotation_validate'),
    ('trg_crop_photo_annotation_frozen',   'crop_photo_annotation',      'BEFORE UPDATE OR DELETE', 'crop_photo_append_only'),
    ('trg_crop_photo_link_validate',       'crop_photo_link',            'BEFORE INSERT',           'crop_photo_link_validate'),
    ('trg_crop_photo_link_frozen',         'crop_photo_link',            'BEFORE UPDATE OR DELETE', 'crop_photo_append_only')
  ) AS v(tg, tbl, timing, fn)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname = t.tg AND tgrelid = ('public.' || t.tbl)::regclass) THEN
      EXECUTE format('CREATE TRIGGER %I %s ON public.%I FOR EACH ROW EXECUTE FUNCTION public.%I()',
                     t.tg, t.timing, t.tbl, t.fn);
    END IF;
  END LOOP;
END
$trg$;


-- §9 RLS — farmers read their own rows via the verified session; engine writes
-- The four existing crop_growth_uploads policies use auth.uid() (always NULL
-- under PIN auth) and one of them allowed DELETE; they are replaced.
DROP POLICY IF EXISTS "Users can create uploads"          ON public.crop_growth_uploads;
DROP POLICY IF EXISTS "Users can delete their own uploads" ON public.crop_growth_uploads;
DROP POLICY IF EXISTS "Users can update their own uploads" ON public.crop_growth_uploads;
DROP POLICY IF EXISTS "Users can view their own uploads"   ON public.crop_growth_uploads;

ALTER TABLE public.crop_growth_uploads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_photo_diagnosis       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_photo_diagnosis_photo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_photo_annotation      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_photo_link            ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.crop_growth_uploads        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.crop_photo_diagnosis       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.crop_photo_diagnosis_photo FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.crop_photo_annotation      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.crop_photo_link            FROM anon, authenticated;

DO $rls$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crop_growth_uploads','crop_photo_diagnosis','crop_photo_annotation','crop_photo_link']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t
                    AND policyname = t || '_select_own') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING ((auth.role() = ''service_role'') '
        'OR (has_tenant_access(tenant_id) AND farmer_id = get_current_farmer_id()) OR is_tenant_admin())',
        t || '_select_own', t);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                  AND tablename = 'crop_photo_diagnosis_photo' AND policyname = 'crop_photo_diagnosis_photo_select_own') THEN
    CREATE POLICY crop_photo_diagnosis_photo_select_own ON public.crop_photo_diagnosis_photo FOR SELECT
      USING ((auth.role() = 'service_role')
          OR EXISTS (SELECT 1 FROM public.crop_photo_diagnosis d
                      WHERE d.id = diagnosis_id
                        AND ((has_tenant_access(d.tenant_id) AND d.farmer_id = get_current_farmer_id())
                             OR is_tenant_admin())));
  END IF;
END
$rls$;


-- §10 DATA CONTRACT — photo_evidence_record(upload_id) → jsonb ──────────────
-- The canonical record every future export is generated from. SECURITY INVOKER:
-- callers see only what RLS lets them see. "labels" = for each label, the
-- strongest non-superseded assertion (tier rank, then newest); "history" keeps
-- every assertion, including disagreements.
CREATE OR REPLACE FUNCTION public.photo_evidence_record(p_upload_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  WITH u AS (
    SELECT * FROM public.crop_growth_uploads WHERE id = p_upload_id
  ),
  a AS (
    SELECT an.*,
           CASE an.source_tier WHEN 'model_proposed' THEN 1 WHEN 'farmer_reported' THEN 2
                               WHEN 'expert_verified' THEN 3 WHEN 'lab_confirmed' THEN 4
                               WHEN 'outcome_confirmed' THEN 5 END AS tier_rank,
           EXISTS (SELECT 1 FROM public.crop_photo_annotation s WHERE s.supersedes_id = an.id) AS superseded
      FROM public.crop_photo_annotation an
     WHERE an.upload_id = p_upload_id
  ),
  best AS (
    SELECT DISTINCT ON (annotation_type, coalesce(value_code, value_text)) *
      FROM a
     WHERE NOT superseded
     ORDER BY annotation_type, coalesce(value_code, value_text), tier_rank DESC, created_at DESC
  )
  SELECT jsonb_build_object(
    'contract',    u.contract_version,
    'evidence_id', u.id,
    'asset', jsonb_build_object(
       'bucket', u.storage_bucket, 'path', u.storage_path, 'sha256', u.content_sha256,
       'mime_type', u.mime_type, 'width', u.width_px, 'height', u.height_px, 'bytes', u.bytes,
       'original_width', u.original_width_px, 'original_height', u.original_height_px,
       'processing', u.processing, 'client_quality', u.client_quality),
    'capture', jsonb_build_object(
       'captured_at', u.captured_at, 'local_date', u.context_snapshot ->> 'capture_local_date',
       'purpose', u.capture_purpose, 'subject_type', u.upload_type, 'offline', u.created_offline,
       'device', u.device),
    'agriculture', jsonb_build_object(
       'crop', u.crop_value, 'crop_resolution', u.context_snapshot ->> 'crop_resolution',
       'variety', u.context_snapshot -> 'variety', 'schedule_id', u.schedule_id, 'task_id', u.task_id,
       'stage_code_estimated', u.stage_code, 'stage_uuid_estimated', u.stage_uuid,
       'das', u.das, 'dat', u.dat, 'gdd', u.gdd, 'cultivation_method', u.cultivation_method),
    'location', jsonb_build_object(
       'land_id', u.land_id, 'gps', u.capture_location,
       'distance_from_land_m', u.distance_from_land_meters, 'location_level', u.location_level),
    'environment', jsonb_build_object(
       'refs', u.context_snapshot -> 'refs', 'weather', u.weather_at_capture,
       'ndvi', u.context_snapshot -> 'ndvi'),
    'labels', coalesce((
       SELECT jsonb_agg(jsonb_build_object(
                'type', b.annotation_type, 'code', b.value_code, 'text', b.value_text,
                'numeric', b.value_numeric, 'assertion', b.assertion, 'confidence', b.confidence,
                'region', b.region, 'tier', b.source_tier, 'training_truth', b.tier_rank >= 3,
                'annotation_id', b.id)
              ORDER BY b.annotation_type, b.value_code)
         FROM best b), '[]'::jsonb),
    'history', coalesce((
       SELECT jsonb_agg(jsonb_build_object(
                'annotation_id', h.id, 'type', h.annotation_type, 'code', h.value_code,
                'text', h.value_text, 'numeric', h.value_numeric, 'assertion', h.assertion,
                'confidence', h.confidence, 'tier', h.source_tier, 'labeller_type', h.labeller_type,
                'labeller_ref', h.labeller_ref, 'model', h.model_name, 'model_version', h.model_version,
                'prompt_version', h.prompt_version, 'diagnosis_id', h.diagnosis_id,
                'supersedes_id', h.supersedes_id, 'created_at', h.created_at)
              ORDER BY h.created_at)
         FROM a h), '[]'::jsonb),
    'links', coalesce((
       SELECT jsonb_agg(jsonb_build_object(
                'relation', l.relation, 'from', l.from_upload_id, 'to', l.to_upload_id,
                'treatment_task_id', l.treatment_task_id, 'decision_trace_id', l.decision_trace_id,
                'tier', l.source_tier, 'created_at', l.created_at)
              ORDER BY l.created_at)
         FROM public.crop_photo_link l
        WHERE l.from_upload_id = u.id OR l.to_upload_id = u.id), '[]'::jsonb),
    'diagnoses', coalesce((
       SELECT jsonb_agg(jsonb_build_object(
                'diagnosis_id', d.id, 'shot_role', dp.shot_role, 'status', d.status,
                'engine_version', d.engine_version, 'model', d.model_used,
                'decision_trace_id', d.decision_trace_id, 'created_at', d.created_at)
              ORDER BY d.created_at)
         FROM public.crop_photo_diagnosis_photo dp
         JOIN public.crop_photo_diagnosis d ON d.id = dp.diagnosis_id
        WHERE dp.upload_id = u.id), '[]'::jsonb),
    'consent', jsonb_build_object(
       'at_capture', u.training_consent, 'consent_log_id', u.consent_log_id,
       'current', public.photo_training_consent(u.farmer_id))
  )
  FROM u;
$fn$;


-- §11 POLICY ROWS (system_config) ───────────────────────────────────────────
INSERT INTO public.system_config (id, config_key, config_value, description, created_at, updated_at)
SELECT gen_random_uuid(), 'vision_diagnosis_policy',
       jsonb_build_object('enabled', false, 'primary_model', NULL, 'fallback_model', NULL,
                          'image_detail', NULL, 'max_output_tokens', NULL, 'timeout_ms', NULL,
                          'price_usd_per_1m', '{}'::jsonb, 'prompt_version', 'perception@1'),
       'Photo perception engine: model, fallback and per-token prices. Filled only after the field-photo model test; engine refuses to run while disabled.',
       now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.system_config WHERE config_key = 'vision_diagnosis_policy');

INSERT INTO public.system_config (id, config_key, config_value, description, created_at, updated_at)
SELECT gen_random_uuid(), 'photo_diagnosis_policy',
       jsonb_build_object('max_photos_per_diagnosis', 3,
                          -- EXPERIMENTAL image policy (2026-09-23): starting points only, to be
                          -- replaced by the field benchmark (100–500 real photos across crop,
                          -- pest, disease, weed, nutrient and whole-field shots).
                          'image_policy', jsonb_build_object(
                             'status', 'experimental',
                             'shot_role_max_px', jsonb_build_object('symptom_closeup', 3072, 'whole_plant', 2048,
                                                                    'field_view', 2048, 'other', 2048, 'rejected', 1024),
                             'jpeg_quality', 0.90,
                             'single_encode', true),
                          'location_levels_m', jsonb_build_object('at_land', 100, 'nearby', 500),
                          'observation_min_confidence', 0.75,
                          'vocabulary', jsonb_build_object('universal_observation_types', jsonb_build_array('PRIMARY','SECONDARY'),
                                                           'require_farmer_observable', true)),
       'Photo capture and perception gates. image_policy is experimental until the field benchmark; one JPEG encode at fixed quality, no size target; originals are never deleted. Confidence gate to be calibrated on the field test set.',
       now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.system_config WHERE config_key = 'photo_diagnosis_policy');


-- §12 VERIFY (read-only) ────────────────────────────────────────────────────
SELECT 'new tables' AS check_name, count(*)::text AS got, '4' AS expected
  FROM information_schema.tables WHERE table_schema = 'public'
   AND table_name IN ('crop_photo_diagnosis','crop_photo_diagnosis_photo','crop_photo_annotation','crop_photo_link')
UNION ALL
SELECT 'crop_growth_uploads FKs now RESTRICT',
       count(*) FILTER (WHERE confdeltype = 'r')::text || ' of ' || count(*)::text, '4 of 4'
  FROM pg_constraint WHERE conrelid = 'public.crop_growth_uploads'::regclass AND contype = 'f'
   AND conname IN ('crop_growth_uploads_land_id_fkey','crop_growth_uploads_tenant_id_fkey',
                   'crop_growth_uploads_schedule_id_fkey','crop_growth_uploads_task_id_fkey')
UNION ALL
SELECT 'triggers', count(*)::text, '11'
  FROM pg_trigger WHERE tgname LIKE 'trg_crop_photo_%'
UNION ALL
SELECT 'old auth.uid() upload policies left', count(*)::text, '0'
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crop_growth_uploads' AND policyname LIKE 'Users can %'
UNION ALL
SELECT 'select policies', count(*)::text, '5'
  FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE '%_select_own'
   AND tablename IN ('crop_growth_uploads','crop_photo_diagnosis','crop_photo_diagnosis_photo','crop_photo_annotation','crop_photo_link')
UNION ALL
SELECT 'contract + consent functions', count(*)::text, '2'
  FROM pg_proc WHERE proname IN ('photo_evidence_record','photo_training_consent')
UNION ALL
SELECT 'policy rows', count(*)::text, '2'
  FROM public.system_config WHERE config_key IN ('vision_diagnosis_policy','photo_diagnosis_policy');
