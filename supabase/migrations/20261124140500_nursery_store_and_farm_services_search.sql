-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124140500_nursery_store_and_farm_services_search.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Provider Workspace, part A, file 6 — the nursery store and the farmer's
-- "services near me".
--
-- Nursery store (provider side)
--   • nursery_products gains the variety (from the seed variety master, or a
--     local name when it is not there), a short description and up to three
--     photos. nursery_save_product() takes the new fields.
--   • Photos live in a new public bucket nursery-photos under
--     <tenant>/<account>/<product>/<file>.jpg. The browser never writes the
--     bucket: an existing edge router signs the upload (service role), checks
--     the object exists, then calls nursery_attach_photo() (service role only).
--     The provider removes a photo with nursery_remove_photo(); the object stays
--     in the bucket (never delete data).
--
-- Services near me (farmer side)
--   The farmer opens "services near me", picks a kind of work, and sees only
--   providers of that kind. A provider is near when one of the farmer's lands
--   lies inside the provider's own reach (base village + radius). Providers of
--   any tenant count (cross-tenant discovery by radius, decided 2026-11-24).
--   Only LISTED providers show. What the farmer sees of a provider is public:
--   name, type, rating, distance, availability, services and rates, store.
--   No mobile number, no address, no session, no farmer data ever leaves.
--   The nursery is the one kind that opens as a store: nursery_store().
--   Everything is behind the flag farm_services_search (default OFF), checked
--   by farm_services_enabled() and inside every farmer function.
--
-- Caller always from the session token. Adds columns, one bucket, one policy,
-- one flag and seven functions; changes one function. Safe to run twice.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. nursery_products: variety, description, photos ───────────────────────
ALTER TABLE public.nursery_products
  ADD COLUMN IF NOT EXISTS variety_id           uuid REFERENCES public.master_products(id),
  ADD COLUMN IF NOT EXISTS variety_name_local   text,
  ADD COLUMN IF NOT EXISTS description          text,
  ADD COLUMN IF NOT EXISTS description_language text,
  ADD COLUMN IF NOT EXISTS photo_paths          text[] NOT NULL DEFAULT '{}'::text[];

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nursery_products_variety_name_len') THEN
    ALTER TABLE public.nursery_products ADD CONSTRAINT nursery_products_variety_name_len
      CHECK (variety_name_local IS NULL OR (length(variety_name_local) BETWEEN 1 AND 80));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nursery_products_description_len') THEN
    ALTER TABLE public.nursery_products ADD CONSTRAINT nursery_products_description_len
      CHECK (description IS NULL OR length(description) <= 600);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nursery_products_description_lang') THEN
    ALTER TABLE public.nursery_products ADD CONSTRAINT nursery_products_description_lang
      CHECK (description_language IS NULL OR description_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nursery_products_photo_count') THEN
    ALTER TABLE public.nursery_products ADD CONSTRAINT nursery_products_photo_count
      CHECK (cardinality(photo_paths) <= 3);
  END IF;
END
$do$;
COMMENT ON COLUMN public.nursery_products.variety_id IS 'Variety from the seed variety master (master_products, product_type seed) when it is there.';
COMMENT ON COLUMN public.nursery_products.variety_name_local IS 'Variety as the nursery calls it, when it is not in the master.';
COMMENT ON COLUMN public.nursery_products.photo_paths IS 'Up to three objects in bucket nursery-photos, each <tenant>/<account>/<product>/<file>.jpg.';

-- ── 2. the photo bucket: public to read, written only through the edge router ─
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('nursery-photos', 'nursery-photos', true, 2097152, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND policyname = 'Public can view nursery photos') THEN
    CREATE POLICY "Public can view nursery photos" ON storage.objects
      FOR SELECT TO public USING (bucket_id = 'nursery-photos');
  END IF;
END
$do$;
-- No INSERT, UPDATE or DELETE policy: anon and authenticated cannot write the bucket.
-- The edge router signs uploads with the service role, which is not bound by RLS.

-- ── 3. nursery_save_product: the new fields ────────────────────────────────
CREATE OR REPLACE FUNCTION public.nursery_save_product(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid  := public.provider_session_profile_locked();
  v_pol     jsonb := public.provider_workspace_policy();
  v_unit    record;
  v_id      uuid;
  v_crop    uuid;
  v_variety uuid;
  v_price   numeric;
  v_vname   text;
  v_desc    text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'PROVIDER_INPUT_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nursery_item_kinds k WHERE k.code = p ->> 'item_kind' AND k.is_active) THEN
    RAISE EXCEPTION 'NURSERY_KIND_INVALID';
  END IF;
  SELECT u.code, u.is_negotiable INTO v_unit FROM public.pricing_units u
   WHERE u.code = p ->> 'pricing_unit' AND u.is_active AND NOT u.is_per_area;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVIDER_UNIT_INVALID'; END IF;

  BEGIN
    v_id      := nullif(p ->> 'id', '')::uuid;
    v_crop    := nullif(p ->> 'crop_id', '')::uuid;
    v_variety := nullif(p ->> 'variety_id', '')::uuid;
    v_price   := CASE WHEN v_unit.is_negotiable THEN NULL ELSE (p ->> 'price')::numeric END;
    v_vname   := nullif(btrim(coalesce(p ->> 'variety_name_local', '')), '');
    v_desc    := nullif(btrim(coalesce(p ->> 'description', '')), '');
    IF v_crop IS NULL OR NOT EXISTS (SELECT 1 FROM public.crops c WHERE c.id = v_crop) THEN
      RAISE EXCEPTION 'NURSERY_CROP_INVALID';
    END IF;
    -- A variety from the master must be a seed variety of this very crop.
    IF v_variety IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.master_products mp
         JOIN public.master_product_variety_crops mvc ON mvc.product_id = mp.id
        WHERE mp.id = v_variety AND mp.product_type = 'seed' AND mvc.crop_id = v_crop) THEN
      RAISE EXCEPTION 'NURSERY_VARIETY_INVALID';
    END IF;
    IF v_variety IS NOT NULL THEN v_vname := NULL; END IF;
    IF NOT v_unit.is_negotiable AND v_price IS NULL THEN RAISE EXCEPTION 'NURSERY_PRICE_REQUIRED'; END IF;

    IF v_id IS NULL THEN
      IF (SELECT count(*) FROM public.nursery_products n WHERE n.account_id = v_account AND n.status <> 'REMOVED')
         >= (v_pol ->> 'max_nursery_products')::integer THEN
        RAISE EXCEPTION 'PROVIDER_LIMIT_REACHED';
      END IF;
      INSERT INTO public.nursery_products (account_id, crop_id, item_kind, pricing_unit)
      VALUES (v_account, v_crop, p ->> 'item_kind', v_unit.code) RETURNING id INTO v_id;
    ELSIF NOT EXISTS (SELECT 1 FROM public.nursery_products n
                       WHERE n.id = v_id AND n.account_id = v_account AND n.status <> 'REMOVED') THEN
      RAISE EXCEPTION 'NURSERY_PRODUCT_NOT_FOUND';
    END IF;

    UPDATE public.nursery_products SET
      crop_id = v_crop, item_kind = p ->> 'item_kind', pricing_unit = v_unit.code, price = v_price,
      min_order_qty = (p ->> 'min_order_qty')::integer,
      variety_id = v_variety, variety_name_local = v_vname,
      description = v_desc,
      description_language = CASE WHEN v_desc IS NULL THEN NULL ELSE nullif(p ->> 'description_language', '') END,
      status = CASE WHEN p ->> 'status' IN ('ACTIVE', 'PAUSED', 'REMOVED') THEN p ->> 'status' ELSE status END,
      updated_at = now()
    WHERE id = v_id;
  EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'PROVIDER_INPUT_INVALID';
  END;
  RETURN public.provider_workspace_get();
END
$fn$;

-- ── 4. photos ──────────────────────────────────────────────────────────────
-- Called by the edge router (service role) once the object is in the bucket.
-- The path must sit under this provider's own product folder.
CREATE OR REPLACE FUNCTION public.nursery_attach_photo(p_account_id uuid, p_product_id uuid, p_path text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid;
  v_paths  text[];
BEGIN
  SELECT sp.tenant_id INTO v_tenant
    FROM public.service_provider_profiles sp
    JOIN public.nursery_products n ON n.account_id = sp.account_id
   WHERE sp.account_id = p_account_id AND n.id = p_product_id AND n.status <> 'REMOVED'
   FOR UPDATE OF n;
  IF NOT FOUND THEN RAISE EXCEPTION 'NURSERY_PRODUCT_NOT_FOUND'; END IF;
  IF p_path IS NULL OR p_path !~ ('^' || v_tenant || '/' || p_account_id || '/' || p_product_id || '/[A-Za-z0-9_-]{8,64}\.jpg$') THEN
    RAISE EXCEPTION 'NURSERY_PHOTO_PATH_INVALID';
  END IF;
  SELECT n.photo_paths INTO v_paths FROM public.nursery_products n WHERE n.id = p_product_id;
  IF p_path = ANY (v_paths) THEN RETURN to_jsonb(v_paths); END IF;
  IF cardinality(v_paths) >= 3 THEN RAISE EXCEPTION 'NURSERY_PHOTO_LIMIT'; END IF;
  UPDATE public.nursery_products SET photo_paths = v_paths || p_path, updated_at = now()
   WHERE id = p_product_id RETURNING photo_paths INTO v_paths;
  RETURN to_jsonb(v_paths);
END
$fn$;

-- The provider takes a photo off the product. The object stays in the bucket.
CREATE OR REPLACE FUNCTION public.nursery_remove_photo(p_product_id uuid, p_path text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid := public.provider_session_profile_locked();
BEGIN
  UPDATE public.nursery_products n
     SET photo_paths = array_remove(n.photo_paths, p_path), updated_at = now()
   WHERE n.id = p_product_id AND n.account_id = v_account AND n.status <> 'REMOVED';
  IF NOT FOUND THEN RAISE EXCEPTION 'NURSERY_PRODUCT_NOT_FOUND'; END IF;
  RETURN public.provider_workspace_get();
END
$fn$;

-- ── 5. the farmer's side ───────────────────────────────────────────────────
INSERT INTO public.feature_flags
  (flag_name, description, is_enabled, rollout_percentage, flag_type, flag_status, default_value)
SELECT 'farm_services_search',
       'Services near me in the farmer app: the farmer picks a kind of work and sees listed providers whose reach covers one of his lands, and opens a nursery as a store. Default OFF. Turn on per tenant with target_tenants.',
       false, 0, 'release', 'active', 'false'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE flag_name = 'farm_services_search');

-- Is the flag on for the tenant of this farmer session? Same tenant rules as
-- provider_workspace_enabled(). False without a session; never raises.
CREATE OR REPLACE FUNCTION public.farm_services_enabled()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid;
  f        record;
BEGIN
  SELECT c.tenant_id INTO v_tenant FROM public.verified_session_context() c;
  IF NOT FOUND OR v_tenant IS NULL THEN RETURN false; END IF;
  SELECT ff.is_enabled, ff.rollout_percentage, ff.target_tenants, ff.flag_status, ff.expires_at INTO f
    FROM public.feature_flags ff WHERE ff.flag_name = 'farm_services_search';
  IF NOT FOUND OR NOT coalesce(f.is_enabled, false) THEN RETURN false; END IF;
  IF f.flag_status IS NOT NULL AND f.flag_status <> 'active' THEN RETURN false; END IF;
  IF f.expires_at IS NOT NULL AND f.expires_at < now() THEN RETURN false; END IF;
  RETURN v_tenant = ANY (coalesce(f.target_tenants, '{}'::uuid[])) OR coalesce(f.rollout_percentage, 0) >= 100;
END
$fn$;

-- Great-circle distance in km (no PostGIS needed for a village-to-land check).
CREATE OR REPLACE FUNCTION public.geo_distance_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE STRICT
AS $fn$
  SELECT round((6371.0088 * 2 * asin(least(1.0, sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2)
           + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))))::numeric, 1)
$fn$;

-- Listed providers whose reach covers one of the calling farmer's lands, with
-- the distance to the nearest of those lands. Internal: the farmer functions
-- below build on it. Empty when the farmer has no land with coordinates.
CREATE OR REPLACE FUNCTION public.farm_services_reachable()
RETURNS TABLE(account_id uuid, distance_km numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH origin AS (
    SELECT l.center_lat AS lat, l.center_lon AS lon
      FROM public.lands l
     WHERE l.farmer_id = public.get_current_farmer_id()
       AND coalesce(l.is_active, true)
       AND l.center_lat IS NOT NULL AND l.center_lon IS NOT NULL
  ),
  base AS (
    SELECT sp.account_id, r.radius_km, v.center_lat AS lat, v.center_lon AS lon
      FROM public.service_provider_profiles sp
      JOIN public.account_reach_settings r ON r.account_id = sp.account_id AND r.role = 'SERVICE_PROVIDER'
      JOIN public.villages v ON v.id = r.base_village_id
     WHERE sp.listing_status = 'LISTED'
       AND v.center_lat IS NOT NULL AND v.center_lon IS NOT NULL
  )
  SELECT b.account_id, min(public.geo_distance_km(o.lat, o.lon, b.lat, b.lon)) AS distance_km
    FROM base b
    JOIN origin o ON public.geo_distance_km(o.lat, o.lon, b.lat, b.lon) <= b.radius_km
   GROUP BY b.account_id
$fn$;

-- The kinds of work, each with how many providers near the farmer offer it.
-- located = false when no land of the farmer has coordinates yet.
CREATE OR REPLACE FUNCTION public.farm_services_nearby()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_farmer  uuid := public.get_current_farmer_id();
  v_located boolean;
BEGIN
  IF v_farmer IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.farm_services_enabled() THEN RAISE EXCEPTION 'FEATURE_DISABLED'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.lands l WHERE l.farmer_id = v_farmer AND coalesce(l.is_active, true)
                   AND l.center_lat IS NOT NULL AND l.center_lon IS NOT NULL) INTO v_located;
  RETURN jsonb_build_object(
    'located', v_located,
    'families', coalesce((
      SELECT jsonb_agg(jsonb_build_object('code', fam.code, 'count', (
               SELECT count(DISTINCT n.account_id)
                 FROM public.farm_services_reachable() n
                WHERE EXISTS (SELECT 1 FROM public.provider_services s
                               JOIN public.service_categories c ON c.code = s.category_code
                              WHERE s.account_id = n.account_id AND s.status = 'ACTIVE' AND c.parent_code = fam.code)
                   OR (fam.code = 'NURSERY' AND EXISTS (SELECT 1 FROM public.nursery_products np
                                                         WHERE np.account_id = n.account_id AND np.status = 'ACTIVE'))))
                        ORDER BY fam.sort_order, fam.code)
        FROM public.service_categories fam WHERE fam.parent_code IS NULL AND fam.is_active), '[]'::jsonb));
END
$fn$;

-- One row per provider near the farmer, in jsonb; only what a farmer may see.
CREATE OR REPLACE FUNCTION public.farm_services_provider_card(p_account_id uuid, p_distance_km numeric, p_family_code text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT jsonb_build_object(
    'account_id',         sp.account_id,
    'public_name',        sp.public_name,
    'provider_type',      sp.provider_type,
    'verification_level', sp.verification_level,
    'rating_average',     sp.rating_average,
    'rating_count',       sp.rating_count,
    'jobs_completed',     sp.jobs_completed,
    'distance_km',        p_distance_km,
    'accepts_requests',   sp.accepts_requests,
    'availability',       (SELECT jsonb_build_object('state', a.state, 'next_free_date', a.next_free_date)
                             FROM public.provider_availability(sp.account_id) a),
    'services', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'category_code', s.category_code,
               'base_rate', s.base_rate, 'currency', s.currency, 'pricing_unit', s.pricing_unit,
               'includes_operator', s.includes_operator, 'includes_fuel', s.includes_fuel,
               'includes_material', s.includes_material, 'min_charge', s.min_charge,
               'payment_methods', s.payment_methods) ORDER BY s.created_at)
        FROM public.provider_services s
        JOIN public.service_categories c ON c.code = s.category_code
       WHERE s.account_id = sp.account_id AND s.status = 'ACTIVE' AND c.parent_code = p_family_code), '[]'::jsonb),
    'store', CASE WHEN p_family_code = 'NURSERY' THEN (
      SELECT jsonb_build_object(
               'product_count', count(*),
               'crop_ids',      coalesce(jsonb_agg(DISTINCT np.crop_id), '[]'::jsonb),
               'photo_paths',   coalesce((SELECT jsonb_agg(ph) FROM (
                                   SELECT unnest(np2.photo_paths) AS ph FROM public.nursery_products np2
                                    WHERE np2.account_id = sp.account_id AND np2.status = 'ACTIVE'
                                    ORDER BY np2.created_at LIMIT 3) x), '[]'::jsonb))
        FROM public.nursery_products np WHERE np.account_id = sp.account_id AND np.status = 'ACTIVE') END)
    FROM public.service_provider_profiles sp WHERE sp.account_id = p_account_id
$fn$;

-- The providers of one kind of work near the farmer: free ones first, then by distance.
CREATE OR REPLACE FUNCTION public.farm_services_providers(p_family_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF public.get_current_farmer_id() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.farm_services_enabled() THEN RAISE EXCEPTION 'FEATURE_DISABLED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_categories c WHERE c.code = p_family_code AND c.parent_code IS NULL AND c.is_active) THEN
    RAISE EXCEPTION 'SERVICE_FAMILY_INVALID';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(card ORDER BY (card #>> '{availability,state}') = 'AVAILABLE' DESC, (card ->> 'distance_km')::numeric, card ->> 'public_name')
      FROM (
        SELECT public.farm_services_provider_card(n.account_id, n.distance_km, p_family_code) AS card
          FROM public.farm_services_reachable() n
         WHERE EXISTS (SELECT 1 FROM public.provider_services s
                         JOIN public.service_categories c ON c.code = s.category_code
                        WHERE s.account_id = n.account_id AND s.status = 'ACTIVE' AND c.parent_code = p_family_code)
            OR (p_family_code = 'NURSERY' AND EXISTS (SELECT 1 FROM public.nursery_products np
                                                       WHERE np.account_id = n.account_id AND np.status = 'ACTIVE'))
      ) cards), '[]'::jsonb);
END
$fn$;

-- One nursery as a store: the provider card and every plant on sale with
-- photos, variety, price and the stock free now and by ready date.
CREATE OR REPLACE FUNCTION public.nursery_store(p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_distance numeric;
BEGIN
  IF public.get_current_farmer_id() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.farm_services_enabled() THEN RAISE EXCEPTION 'FEATURE_DISABLED'; END IF;
  SELECT n.distance_km INTO v_distance FROM public.farm_services_reachable() n WHERE n.account_id = p_account_id;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.nursery_products np WHERE np.account_id = p_account_id AND np.status = 'ACTIVE') THEN
    RAISE EXCEPTION 'NURSERY_STORE_NOT_FOUND';
  END IF;
  RETURN jsonb_build_object(
    'provider', public.farm_services_provider_card(p_account_id, v_distance, 'NURSERY')
                || (SELECT jsonb_build_object('about_text', sp.about_text, 'about_language', sp.about_language)
                      FROM public.service_provider_profiles sp WHERE sp.account_id = p_account_id),
    'products', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', np.id, 'crop_id', np.crop_id, 'variety_id', np.variety_id,
               'variety_names', (SELECT jsonb_build_object('en', mp.name, 'hi', mp.label_hi, 'mr', mp.label_mr)
                                   FROM public.master_products mp WHERE mp.id = np.variety_id),
               'variety_name_local', np.variety_name_local,
               'item_kind', np.item_kind, 'price', np.price, 'currency', np.currency,
               'pricing_unit', np.pricing_unit, 'min_order_qty', np.min_order_qty,
               'description', np.description, 'description_language', np.description_language,
               'photo_paths', to_jsonb(np.photo_paths),
               'available_qty', coalesce((SELECT sum(b.total_qty - b.reserved_qty) FROM public.nursery_batches b
                                           WHERE b.product_id = np.id AND b.status = 'ACTIVE' AND b.ready_date <= current_date), 0),
               'batches', coalesce((SELECT jsonb_agg(jsonb_build_object('ready_date', b.ready_date, 'available_qty', b.total_qty - b.reserved_qty)
                                                     ORDER BY b.ready_date)
                                      FROM public.nursery_batches b
                                     WHERE b.product_id = np.id AND b.status = 'ACTIVE' AND b.total_qty > b.reserved_qty), '[]'::jsonb))
             ORDER BY np.created_at)
        FROM public.nursery_products np WHERE np.account_id = p_account_id AND np.status = 'ACTIVE'), '[]'::jsonb));
END
$fn$;

-- ── 6. rights ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.nursery_save_product(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nursery_save_product(jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.nursery_remove_photo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nursery_remove_photo(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_services_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_services_enabled() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_services_nearby() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_services_nearby() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_services_providers(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_services_providers(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.nursery_store(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nursery_store(uuid) TO anon, authenticated, service_role;
-- internal only
REVOKE ALL ON FUNCTION public.nursery_attach_photo(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nursery_attach_photo(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.farm_services_reachable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_services_reachable() TO service_role;
REVOKE ALL ON FUNCTION public.farm_services_provider_card(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_services_provider_card(uuid, numeric, text) TO service_role;
REVOKE ALL ON FUNCTION public.geo_distance_km(numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.geo_distance_km(numeric, numeric, numeric, numeric) TO service_role;

-- Verification (read-only) ────────────────────────────────────────────────────
SELECT 'nursery_products new columns' AS check_name,
       count(*)::text AS actual, '5' AS expected
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'nursery_products'
   AND column_name IN ('variety_id', 'variety_name_local', 'description', 'description_language', 'photo_paths');
SELECT 'internal farm-services functions callable by the browser' AS check_name,
       count(*)::text AS actual, '0' AS expected
  FROM information_schema.routine_privileges
 WHERE specific_schema = 'public'
   AND routine_name IN ('nursery_attach_photo', 'farm_services_reachable', 'farm_services_provider_card', 'geo_distance_km')
   AND grantee IN ('anon', 'authenticated', 'PUBLIC');
SELECT 'farm_services_search flag' AS check_name,
       'enabled=' || is_enabled || ' rollout=' || rollout_percentage AS actual, 'enabled=false rollout=0' AS expected
  FROM public.feature_flags WHERE flag_name = 'farm_services_search';
