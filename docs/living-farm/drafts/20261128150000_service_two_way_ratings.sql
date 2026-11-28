-- ═══════════════════════════════════════════════════════════════════════════
-- 20261128150000_service_two_way_ratings.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
-- STATUS: DRAFT FOR REVIEW. Not applied to the shared database.
-- Kept under docs/living-farm/drafts/ so that no tool picks it up as a migration.
-- When approved it moves to supabase/migrations/ under the same file name.
-- The SQL has not been run anywhere, not even in a rolled-back transaction.
--
-- Services near me: two-way ratings. Today only the farmer rates the provider
-- (1 to 5 stars). This file adds, for a job that is DONE:
--   * the provider's stars for the farmer;
--   * picture words with the stars on both sides (codes from a small
--     catalogue table, no typed text);
--   * the blind rule: one side sees the other side's stars only after both
--     have rated, or after rating_blind_days;
--   * the "New" rule: an average is shown only from rating_min_count ratings.
-- The two numbers live in the farm_services_policy config row (7 and 3), so
-- they can be changed without a migration.
--
-- What changes for code that already runs:
--   * farm_service_request_rate(uuid, integer) keeps its name, arguments and
--     answer. It now passes through the same code as the new function.
--   * service_provider_profiles.rating_count counts only ratings that are
--     shown; rating_average is NULL below rating_min_count. The stored numbers
--     are refreshed on every rating and every job marked done for that
--     provider. A rating that becomes shown only because the blind days ran
--     out joins the stored average at that provider's next such event.
--   * provider_request_card: farmer_rating is NULL until it is shown. New
--     keys: farmer_rating_tags, my_rating, my_rating_tags, rating_due,
--     farmer_score.
--   * farm_service_requests_mine: new keys farmer_rating_tags,
--     provider_rating, provider_rating_tags (the last two NULL until shown).
--
-- Not in this file: customer and produce ratings. The customer workspace has
-- no tables yet; those ratings are built with it.
--
-- Adds 1 table, 4 columns on service_requests, 2 config keys, 6 functions;
-- replaces 4 functions (bodies taken from the live database on 2026-11-28).
-- No row, table or function is removed. farmers, user_profiles, user_tenants,
-- user_roles, admin_users and active_sessions are not touched.
-- No session state between statements. Safe to run twice.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. the two numbers ──────────────────────────────────────────────────────
UPDATE public.system_config
   SET config_value = '{"rating_blind_days": 7, "rating_min_count": 3}'::jsonb || config_value
 WHERE config_key = 'farm_services_policy'
   AND jsonb_typeof(config_value) = 'object'
   AND NOT (config_value ? 'rating_blind_days' AND config_value ? 'rating_min_count');

CREATE OR REPLACE FUNCTION public.farm_service_rating_rule()
RETURNS TABLE(blind_days integer, min_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v jsonb := public.farm_services_policy();
BEGIN
  IF NOT (v ? 'rating_blind_days' AND v ? 'rating_min_count') THEN
    RAISE EXCEPTION 'FARM_SERVICES_POLICY_MISSING';
  END IF;
  blind_days := (v->>'rating_blind_days')::integer;
  min_count  := (v->>'rating_min_count')::integer;
  RETURN NEXT;
END
$fn$;

-- One side's rating is shown to the other side once both have rated, or once
-- the blind days have passed since it was given.
CREATE OR REPLACE FUNCTION public.farm_service_rating_shown(p_given_at timestamptz, p_other_given_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT p_given_at IS NOT NULL
     AND (p_other_given_at IS NOT NULL
          OR p_given_at + make_interval(days => (SELECT blind_days FROM public.farm_service_rating_rule())) <= now())
$fn$;

-- ── 2. the picture words ────────────────────────────────────────────────────
-- The app names each code in the farmer's language (provider.ratingTag.<code>);
-- label_en is the fallback, as for the service catalogue.
CREATE TABLE IF NOT EXISTS public.service_rating_tags (
  direction   text NOT NULL CHECK (direction IN ('FARMER_TO_PROVIDER', 'PROVIDER_TO_FARMER')),
  code        text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  label_en    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (direction, code)
);
ALTER TABLE public.service_rating_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_rating_tags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_rating_tags TO anon, authenticated, service_role;
DROP POLICY IF EXISTS service_rating_tags_read_active ON public.service_rating_tags;
CREATE POLICY service_rating_tags_read_active ON public.service_rating_tags
  FOR SELECT TO anon, authenticated USING (is_active);

INSERT INTO public.service_rating_tags (direction, code, label_en, sort_order)
VALUES
  ('FARMER_TO_PROVIDER', 'ON_TIME',       'On time',        1),
  ('FARMER_TO_PROVIDER', 'GOOD_WORK',     'Good work',      2),
  ('FARMER_TO_PROVIDER', 'FAIR_RATE',     'Fair rate',      3),
  ('FARMER_TO_PROVIDER', 'POLITE',        'Polite',         4),
  ('PROVIDER_TO_FARMER', 'PAID_ON_TIME',  'Paid on time',   1),
  ('PROVIDER_TO_FARMER', 'LAND_READY',    'Land was ready', 2),
  ('PROVIDER_TO_FARMER', 'EASY_TO_FIND',  'Easy to find',   3),
  ('PROVIDER_TO_FARMER', 'POLITE',        'Polite',         4)
ON CONFLICT (direction, code) DO NOTHING;

-- ── 3. the columns ──────────────────────────────────────────────────────────
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS farmer_rating_tags   text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS provider_rating      smallint;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS provider_rated_at    timestamptz;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS provider_rating_tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_provider_rating_chk;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_provider_rating_chk
  CHECK (provider_rating IS NULL OR provider_rating BETWEEN 1 AND 5);
COMMENT ON COLUMN public.service_requests.provider_rating IS
  'The provider''s 1 to 5 stars for the farmer on this job. Given once, after DONE; shown to the farmer by the blind rule.';

-- Stars and words from a caller's JSON, checked: {"stars": 1-5, "tags": [codes of that direction]}.
CREATE OR REPLACE FUNCTION public.farm_service_rating_input(p jsonb, p_direction text)
RETURNS TABLE(stars smallint, tags text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' OR jsonb_typeof(p->'stars') <> 'number'
     OR (p->>'stars')::numeric NOT IN (1, 2, 3, 4, 5) THEN
    RAISE EXCEPTION 'RATING_INVALID';
  END IF;
  IF p ? 'tags' AND jsonb_typeof(p->'tags') <> 'array' THEN RAISE EXCEPTION 'RATING_INVALID'; END IF;
  stars := (p->>'stars')::smallint;
  SELECT coalesce(array_agg(DISTINCT t.code ORDER BY t.code), '{}') INTO tags
    FROM jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) AS x(code)
    JOIN public.service_rating_tags t ON t.direction = p_direction AND t.code = x.code AND t.is_active;
  IF cardinality(tags) <> (SELECT count(DISTINCT x.code) FROM jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) AS x(code)) THEN
    RAISE EXCEPTION 'RATING_TAG_UNKNOWN';
  END IF;
  RETURN NEXT;
END
$fn$;

-- ── 4. the provider's stored numbers: shown ratings only, average from min_count ──
CREATE OR REPLACE FUNCTION public.farm_service_refresh_provider_stats(p_account_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  UPDATE public.service_provider_profiles sp SET
    rating_count   = s.rated,
    rating_average = CASE WHEN s.rated >= (SELECT min_count FROM public.farm_service_rating_rule()) THEN s.average END,
    jobs_completed = s.done,
    updated_at     = now()
  FROM (SELECT count(*) FILTER (WHERE public.farm_service_rating_shown(r.rated_at, r.provider_rated_at))::integer AS rated,
               round(avg(r.farmer_rating) FILTER (WHERE public.farm_service_rating_shown(r.rated_at, r.provider_rated_at)), 2) AS average,
               count(*)::integer AS done
          FROM public.service_requests r
         WHERE r.provider_account_id = p_account_id AND r.status = 'DONE') s
  WHERE sp.account_id = p_account_id
$fn$;

-- The farmer as a customer of services, from providers' shown ratings. Counted on read.
CREATE OR REPLACE FUNCTION public.farm_service_farmer_score(p_farmer_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT jsonb_build_object(
           'rating_count', s.rated,
           'rating_average', CASE WHEN s.rated >= (SELECT min_count FROM public.farm_service_rating_rule()) THEN s.average END,
           'jobs_completed', s.done)
    FROM (SELECT count(*) FILTER (WHERE public.farm_service_rating_shown(r.provider_rated_at, r.rated_at))::integer AS rated,
                 round(avg(r.provider_rating) FILTER (WHERE public.farm_service_rating_shown(r.provider_rated_at, r.rated_at)), 2) AS average,
                 count(*)::integer AS done
            FROM public.service_requests r
           WHERE r.farmer_id = p_farmer_id AND r.status = 'DONE') s
$fn$;

-- ── 5. the farmer's list: his own words, and the provider's stars once shown ──
CREATE OR REPLACE FUNCTION public.farm_service_requests_mine()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_farmer uuid := public.farm_services_farmer();
  v_today  date := public.farm_services_today();
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(x.item ORDER BY x.rank, x.created_at DESC)
      FROM (
        SELECT r.created_at,
               CASE WHEN r.status = 'OPEN' AND r.needed_date >= v_today THEN 0
                    WHEN r.status = 'CONFIRMED' THEN 1
                    WHEN r.status = 'DONE' AND r.farmer_rating IS NULL THEN 2 ELSE 3 END AS rank,
               jsonb_build_object(
                 'id', r.id, 'kind', r.kind, 'family_code', r.family_code, 'category_code', r.category_code,
                 'status', CASE WHEN r.status = 'OPEN' AND r.needed_date < v_today THEN 'EXPIRED' ELSE r.status END,
                 'is_direct', r.target_account_id IS NOT NULL,
                 'service_title', (SELECT s.title FROM public.provider_services s WHERE s.id = r.provider_service_id),
                 'plant', (SELECT jsonb_build_object('crop_id', np.crop_id, 'item_kind', np.item_kind, 'variety_name_local', np.variety_name_local,
                                    'variety_names', (SELECT jsonb_build_object('en', mp.name, 'hi', mp.label_hi, 'mr', mp.label_mr)
                                                        FROM public.master_products mp WHERE mp.id = np.variety_id),
                                    'photo_path', np.photo_paths[1])
                             FROM public.nursery_products np WHERE np.id = r.nursery_product_id),
                 'land', (SELECT jsonb_build_object('id', l.id, 'name', l.name) FROM public.lands l WHERE l.id = r.land_id),
                 'quantity', r.quantity, 'quantity_unit', r.quantity_unit, 'needed_date', r.needed_date,
                 'quoted_rate', r.quoted_rate, 'currency', r.currency,
                 'agreed_rate', r.agreed_rate, 'agreed_unit', r.agreed_unit, 'agreed_date', r.agreed_date,
                 'cancelled_by', r.cancelled_by, 'farmer_rating', r.farmer_rating, 'created_at', r.created_at,
                 'farmer_rating_tags', to_jsonb(r.farmer_rating_tags),
                 'provider_rating', CASE WHEN public.farm_service_rating_shown(r.provider_rated_at, r.rated_at) THEN r.provider_rating END,
                 'provider_rating_tags', CASE WHEN public.farm_service_rating_shown(r.provider_rated_at, r.rated_at) THEN to_jsonb(r.provider_rating_tags) END,
                 'provider', (SELECT jsonb_build_object('account_id', sp.account_id, 'public_name', sp.public_name,
                                       'mobile', CASE WHEN r.status IN ('CONFIRMED', 'DONE') THEN a.mobile_number END)
                                FROM public.service_provider_profiles sp
                                LEFT JOIN public.accounts a ON a.id = sp.account_id
                               WHERE sp.account_id = coalesce(r.provider_account_id, r.target_account_id)),
                 'offers', coalesce((
                   SELECT jsonb_agg(jsonb_build_object(
                            'id', o.id, 'public_name', sp.public_name, 'rating_average', sp.rating_average,
                            'rating_count', sp.rating_count, 'distance_km', public.farm_service_land_distance(r.land_id, o.account_id),
                            'rate', o.rate, 'pricing_unit', o.pricing_unit, 'offer_date', o.offer_date) ORDER BY o.created_at)
                     FROM public.service_request_offers o
                     JOIN public.service_provider_profiles sp ON sp.account_id = o.account_id
                    WHERE o.request_id = r.id AND o.status = 'PENDING' AND r.status = 'OPEN' AND r.needed_date >= v_today), '[]'::jsonb)
               ) AS item
          FROM public.service_requests r
         WHERE r.farmer_id = v_farmer
         ORDER BY r.created_at DESC
         LIMIT 40) x), '[]'::jsonb);
END
$fn$;

-- ── 6. the farmer rates the provider: stars and words ───────────────────────
CREATE OR REPLACE FUNCTION public.farm_service_request_rate_with(p_request_id uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_farmer   uuid := public.farm_services_farmer();
  v_provider uuid;
  v_stars    smallint;
  v_tags     text[];
BEGIN
  SELECT i.stars, i.tags INTO v_stars, v_tags FROM public.farm_service_rating_input(p, 'FARMER_TO_PROVIDER') i;
  UPDATE public.service_requests r
     SET farmer_rating = v_stars, farmer_rating_tags = v_tags, rated_at = now(), updated_at = now()
   WHERE r.id = p_request_id AND r.farmer_id = v_farmer AND r.status = 'DONE' AND r.farmer_rating IS NULL
   RETURNING r.provider_account_id INTO v_provider;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_AVAILABLE'; END IF;
  PERFORM public.farm_service_refresh_provider_stats(v_provider);
  PERFORM public.farm_service_log(p_request_id, 'FARMER', v_farmer, 'RATED', jsonb_build_object('stars', v_stars, 'tags', to_jsonb(v_tags)));
  RETURN public.farm_service_requests_mine();
END
$fn$;

-- The function the app calls today: same name, arguments and answer.
CREATE OR REPLACE FUNCTION public.farm_service_request_rate(p_request_id uuid, p_stars integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF p_stars IS NULL OR p_stars NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'RATING_INVALID'; END IF;
  RETURN public.farm_service_request_rate_with(p_request_id, jsonb_build_object('stars', p_stars));
END
$fn$;

-- The farmer's own score as a customer of services.
CREATE OR REPLACE FUNCTION public.farm_service_my_score()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT public.farm_service_farmer_score(public.farm_services_farmer())
$fn$;

-- ── 7. the provider's card: the farmer's score, and stars by the blind rule ──
CREATE OR REPLACE FUNCTION public.provider_request_card(p_request_id uuid, p_account_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'family_code', r.family_code, 'category_code', r.category_code,
    'status', r.status, 'is_direct', r.target_account_id IS NOT NULL,
    'quantity', r.quantity, 'quantity_unit', r.quantity_unit, 'needed_date', r.needed_date,
    'quoted_rate', r.quoted_rate, 'currency', r.currency,
    'distance_km', round(public.farm_service_land_distance(r.land_id, p_account_id)),
    'my_service', (SELECT jsonb_build_object('id', s.id, 'title', s.title, 'base_rate', s.base_rate, 'pricing_unit', s.pricing_unit)
                     FROM public.provider_services s
                    WHERE s.account_id = p_account_id AND s.status = 'ACTIVE'
                      AND (s.id = r.provider_service_id OR (r.provider_service_id IS NULL AND s.category_code = r.category_code))
                    ORDER BY (s.id = r.provider_service_id) DESC, s.created_at LIMIT 1),
    'plant', (SELECT jsonb_build_object('crop_id', np.crop_id, 'item_kind', np.item_kind, 'variety_name_local', np.variety_name_local,
                       'variety_names', (SELECT jsonb_build_object('en', mp.name, 'hi', mp.label_hi, 'mr', mp.label_mr)
                                           FROM public.master_products mp WHERE mp.id = np.variety_id),
                       'photo_path', np.photo_paths[1])
                FROM public.nursery_products np WHERE np.id = r.nursery_product_id),
    'my_offer', (SELECT jsonb_build_object('rate', o.rate, 'pricing_unit', o.pricing_unit, 'offer_date', o.offer_date, 'status', o.status)
                   FROM public.service_request_offers o WHERE o.request_id = r.id AND o.account_id = p_account_id),
    'agreed_rate', r.agreed_rate, 'agreed_unit', r.agreed_unit, 'agreed_date', r.agreed_date,
    'cancelled_by', r.cancelled_by, 'created_at', r.created_at,
    'farmer_rating', CASE WHEN public.farm_service_rating_shown(r.rated_at, r.provider_rated_at) THEN r.farmer_rating END,
    'farmer_rating_tags', CASE WHEN public.farm_service_rating_shown(r.rated_at, r.provider_rated_at) THEN to_jsonb(r.farmer_rating_tags) END,
    'my_rating', CASE WHEN r.provider_account_id = p_account_id THEN r.provider_rating END,
    'my_rating_tags', CASE WHEN r.provider_account_id = p_account_id THEN to_jsonb(r.provider_rating_tags) END,
    'rating_due', r.provider_account_id = p_account_id AND r.status = 'DONE' AND r.provider_rating IS NULL,
    'farmer_score', public.farm_service_farmer_score(r.farmer_id),
    'farmer', CASE WHEN r.provider_account_id = p_account_id AND r.status IN ('CONFIRMED', 'DONE') THEN (
                SELECT jsonb_build_object('name', a.display_name, 'mobile', a.mobile_number,
                         'land_name', l.name, 'village', coalesce(v.name, l.village::text),
                         'lat', l.center_lat, 'lon', l.center_lon)
                  FROM public.lands l
                  LEFT JOIN public.accounts a ON a.id = r.farmer_id
                  LEFT JOIN public.villages v ON v.id = l.village_id
                 WHERE l.id = r.land_id) END)
    FROM public.service_requests r WHERE r.id = p_request_id
$fn$;

-- ── 8. the provider rates the farmer ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provider_request_rate(p_request_id uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid;
  v_stars   smallint;
  v_tags    text[];
BEGIN
  SELECT s.account_id INTO v_account FROM public.provider_session_account() s;
  SELECT i.stars, i.tags INTO v_stars, v_tags FROM public.farm_service_rating_input(p, 'PROVIDER_TO_FARMER') i;
  UPDATE public.service_requests r
     SET provider_rating = v_stars, provider_rating_tags = v_tags, provider_rated_at = now(), updated_at = now()
   WHERE r.id = p_request_id AND r.provider_account_id = v_account AND r.status = 'DONE' AND r.provider_rating IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_AVAILABLE'; END IF;
  -- his rating can make the farmer's rating of him shown, so his stored numbers are counted again
  PERFORM public.farm_service_refresh_provider_stats(v_account);
  PERFORM public.farm_service_log(p_request_id, 'PROVIDER', v_account, 'RATED', jsonb_build_object('stars', v_stars, 'tags', to_jsonb(v_tags)));
  RETURN public.provider_requests_inbox();
END
$fn$;

-- ── 9. who may call what (same pattern as 20261124140600) ───────────────────
REVOKE ALL ON FUNCTION public.farm_service_request_rate_with(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_service_request_rate_with(uuid, jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_service_request_rate(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_service_request_rate(uuid, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_service_requests_mine() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_service_requests_mine() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_service_my_score() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_service_my_score() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.provider_request_rate(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_request_rate(uuid, jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.farm_service_rating_rule() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_service_rating_rule() TO service_role;
REVOKE ALL ON FUNCTION public.farm_service_rating_shown(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_service_rating_shown(timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.farm_service_rating_input(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_service_rating_input(jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.farm_service_farmer_score(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_service_farmer_score(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.farm_service_refresh_provider_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_service_refresh_provider_stats(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.provider_request_card(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_request_card(uuid, uuid) TO service_role;

-- Verification (read-only) ────────────────────────────────────────────────────
SELECT 'policy has the two rating numbers' AS check_name,
       (config_value ? 'rating_blind_days' AND config_value ? 'rating_min_count')::text AS actual, 'true' AS expected
  FROM public.system_config WHERE config_key = 'farm_services_policy';
SELECT 'picture words, each direction' AS check_name, string_agg(direction || '=' || n, ', ' ORDER BY direction) AS actual,
       'FARMER_TO_PROVIDER=4, PROVIDER_TO_FARMER=4' AS expected
  FROM (SELECT direction, count(*)::text AS n FROM public.service_rating_tags WHERE is_active GROUP BY direction) t;
SELECT 'new columns on service_requests' AS check_name, count(*)::text AS actual, '4' AS expected
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'service_requests'
   AND column_name IN ('farmer_rating_tags', 'provider_rating', 'provider_rated_at', 'provider_rating_tags');
SELECT 'internal rating helpers closed to the app roles' AS check_name,
       bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))::text AS actual, 'false' AS expected
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('farm_service_rating_rule', 'farm_service_rating_shown', 'farm_service_rating_input', 'farm_service_farmer_score');
SELECT 'requests in the table (unchanged by this file)' AS check_name, count(*)::text AS actual, 'same as before' AS expected
  FROM public.service_requests;
