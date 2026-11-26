-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124140600_farm_service_requests.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Services near me, part 2 — the farmer asks for work, the provider answers,
-- the job is booked, done and rated. Also: saved providers.
--
-- The whole flow, in the fewest steps for both sides:
--   1. Farmer: land + day + how much → one request. Sent to ONE provider (from
--      his card or a nursery plant), or to EVERY listed provider of that
--      service whose area covers the land (cross-tenant by radius, decided
--      2026-11-24).
--   2. Provider: Accept, change the rate or day (an offer), or say no.
--      Accepting a request that was sent to him alone, unchanged, books it at
--      once. Anything else is an offer the farmer answers with yes or no.
--   3. Booked: only now do the two sides see each other's name and number, and
--      the provider the land's village and place. Every such sharing is
--      written to service_request_events, which is never changed or deleted.
--   4. Provider marks the work done (not before the agreed day); the farmer
--      gives 1–5 stars, which make up the provider's rating.
--   Nursery plants: stock is reserved when booked, given back when cancelled,
--   and taken off the batch when done. It can never be oversold.
--
-- Before a booking a provider sees a request only as: the service, how much,
-- the day, and the distance in whole km. Never a name, number, village or
-- tenant. A request past its day with no booking counts as EXPIRED when read;
-- no job changes it. New requests and offers are counted on read — there is no
-- separate notification row to fall out of step.
--
-- Farmer functions need a farmer session and the farm_services_search flag.
-- Provider functions need a provider session. Callers always come from the
-- session token. Adds 4 tables, 1 config row and 21 functions; replaces 4
-- functions of file 6 (saved flag, request counts, deleted lands left out,
-- the store's "ready now" in the policy timezone).
-- Safe to run twice.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. limits: one config row, edited without a migration ───────────────────
INSERT INTO public.system_config (config_key, config_value, description)
SELECT 'farm_services_policy',
       '{"max_open_requests": 10, "max_offers_per_request": 5, "request_horizon_days": 60, "timezone": "Asia/Kolkata"}'::jsonb,
       'Services near me: how many open requests one farmer may have, how many offers one request may collect, how far ahead a request may be dated, and the timezone a day is counted in.'
 WHERE NOT EXISTS (SELECT 1 FROM public.system_config WHERE config_key = 'farm_services_policy');

CREATE OR REPLACE FUNCTION public.farm_services_policy()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v jsonb;
BEGIN
  SELECT c.config_value INTO v FROM public.system_config c
   WHERE c.config_key = 'farm_services_policy' AND jsonb_typeof(c.config_value) = 'object';
  IF v IS NULL OR NOT (v ? 'max_open_requests' AND v ? 'max_offers_per_request'
                       AND v ? 'request_horizon_days' AND v ? 'timezone') THEN
    RAISE EXCEPTION 'FARM_SERVICES_POLICY_MISSING';
  END IF;
  RETURN v;
END
$fn$;

-- ── 2. tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.farmer_saved_providers (
  farmer_id   uuid NOT NULL REFERENCES public.farmers(id),
  account_id  uuid NOT NULL REFERENCES public.service_provider_profiles(account_id) ON UPDATE CASCADE,
  is_saved    boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (farmer_id, account_id)
);
COMMENT ON TABLE public.farmer_saved_providers IS 'Providers a farmer saved. Unsaving sets is_saved false; rows are never deleted.';

CREATE TABLE IF NOT EXISTS public.service_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                text NOT NULL CHECK (kind IN ('SERVICE', 'NURSERY')),
  farmer_id           uuid NOT NULL REFERENCES public.farmers(id),
  farmer_tenant_id    uuid NOT NULL,
  land_id             uuid NOT NULL REFERENCES public.lands(id),
  family_code         text NOT NULL REFERENCES public.service_categories(code) ON UPDATE CASCADE,
  category_code       text REFERENCES public.service_categories(code) ON UPDATE CASCADE,
  -- NULL = sent to every listed provider of the service whose area covers the land
  target_account_id   uuid REFERENCES public.service_provider_profiles(account_id) ON UPDATE CASCADE,
  provider_service_id uuid REFERENCES public.provider_services(id),
  nursery_product_id  uuid REFERENCES public.nursery_products(id),
  quantity            numeric(12,2) NOT NULL CHECK (quantity > 0),
  quantity_unit       text NOT NULL REFERENCES public.pricing_units(code) ON UPDATE CASCADE,
  needed_date         date NOT NULL,
  -- the rate the farmer saw when asking (NULL when open to discussion or sent to everyone)
  quoted_rate         numeric(12,2) CHECK (quoted_rate IS NULL OR quoted_rate >= 0),
  currency            text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  status              text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CONFIRMED', 'DONE', 'CANCELLED', 'DECLINED')),
  -- set when booked
  provider_account_id uuid REFERENCES public.service_provider_profiles(account_id) ON UPDATE CASCADE,
  accepted_offer_id   uuid,
  agreed_rate         numeric(12,2),
  agreed_unit         text REFERENCES public.pricing_units(code) ON UPDATE CASCADE,
  agreed_date         date,
  nursery_batch_id    uuid REFERENCES public.nursery_batches(id),
  confirmed_at        timestamptz,
  done_at             timestamptz,
  cancelled_at        timestamptz,
  cancelled_by        text CHECK (cancelled_by IS NULL OR cancelled_by IN ('FARMER', 'PROVIDER')),
  farmer_rating       smallint CHECK (farmer_rating IS NULL OR farmer_rating BETWEEN 1 AND 5),
  rated_at            timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_requests_kind_shape CHECK (
    (kind = 'SERVICE' AND category_code IS NOT NULL AND nursery_product_id IS NULL)
    OR (kind = 'NURSERY' AND nursery_product_id IS NOT NULL AND target_account_id IS NOT NULL)),
  CONSTRAINT service_requests_booked_shape CHECK (
    status NOT IN ('CONFIRMED', 'DONE') OR (provider_account_id IS NOT NULL AND agreed_date IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS service_requests_farmer_idx   ON public.service_requests (farmer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_target_idx   ON public.service_requests (target_account_id) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS service_requests_open_idx     ON public.service_requests (category_code, needed_date) WHERE status = 'OPEN' AND target_account_id IS NULL;
CREATE INDEX IF NOT EXISTS service_requests_provider_idx ON public.service_requests (provider_account_id, agreed_date) WHERE status IN ('CONFIRMED', 'DONE');
COMMENT ON TABLE public.service_requests IS 'A farmer''s request for a service or for nursery plants, from asking to done. Rows are never deleted.';

CREATE TABLE IF NOT EXISTS public.service_request_offers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.service_requests(id),
  account_id   uuid NOT NULL REFERENCES public.service_provider_profiles(account_id) ON UPDATE CASCADE,
  rate         numeric(12,2) CHECK (rate IS NULL OR rate >= 0),
  pricing_unit text REFERENCES public.pricing_units(code) ON UPDATE CASCADE,
  offer_date   date NOT NULL,
  -- PENDING waits for the farmer; ACCEPTED booked; DECLINED farmer said no;
  -- REFUSED provider said no to the request; WITHDRAWN provider took it back;
  -- CLOSED another offer was booked or the request ended
  status       text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'REFUSED', 'WITHDRAWN', 'CLOSED')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_request_offers_one_per_provider UNIQUE (request_id, account_id)
);
CREATE INDEX IF NOT EXISTS service_request_offers_account_idx ON public.service_request_offers (account_id, status);
COMMENT ON TABLE public.service_request_offers IS 'One answer per provider per request: an offer, or a refusal. Rows are never deleted.';

CREATE TABLE IF NOT EXISTS public.service_request_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id  uuid NOT NULL REFERENCES public.service_requests(id),
  actor       text NOT NULL CHECK (actor IN ('FARMER', 'PROVIDER')),
  actor_id    uuid NOT NULL,
  event       text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_request_events_request_idx ON public.service_request_events (request_id, id);
COMMENT ON TABLE public.service_request_events IS 'What happened to a request, in order, including every sharing of contact details. Insert only.';

ALTER TABLE public.farmer_saved_providers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_offers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_events  ENABLE ROW LEVEL SECURITY;
-- No privilege and no policy for the browser: it reads and writes only through
-- the functions below. The service role may read, add and change, never delete;
-- the event log it may only read and add to.
REVOKE ALL ON public.farmer_saved_providers, public.service_requests, public.service_request_offers, public.service_request_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.farmer_saved_providers, public.service_requests, public.service_request_offers TO service_role;
GRANT SELECT, INSERT ON public.service_request_events TO service_role;

-- ── 3. internal helpers ────────────────────────────────────────────────────
-- Today in the policy's timezone.
CREATE OR REPLACE FUNCTION public.farm_services_today()
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT (now() AT TIME ZONE (public.farm_services_policy() ->> 'timezone'))::date
$fn$;

-- Distance in km from a provider's base village to a land, or NULL when the
-- land lies outside the provider's reach (or either place is not located).
CREATE OR REPLACE FUNCTION public.farm_service_land_distance(p_land_id uuid, p_account_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT x.d FROM (
    SELECT public.geo_distance_km(l.center_lat, l.center_lon, v.center_lat, v.center_lon) AS d, r.radius_km
      FROM public.lands l
      JOIN public.account_reach_settings r ON r.account_id = p_account_id AND r.role = 'SERVICE_PROVIDER'
      JOIN public.villages v ON v.id = r.base_village_id
     WHERE l.id = p_land_id) x
   WHERE x.d IS NOT NULL AND x.d <= x.radius_km
$fn$;

CREATE OR REPLACE FUNCTION public.farm_service_log(p_request_id uuid, p_actor text, p_actor_id uuid, p_event text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  INSERT INTO public.service_request_events (request_id, actor, actor_id, event, details)
  VALUES (p_request_id, p_actor, p_actor_id, p_event, coalesce(p_details, '{}'::jsonb))
$fn$;

-- The farmer of this session, with the flag on. Raises otherwise.
CREATE OR REPLACE FUNCTION public.farm_services_farmer()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_farmer uuid := public.get_current_farmer_id();
BEGIN
  IF v_farmer IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.farm_services_enabled() THEN RAISE EXCEPTION 'FEATURE_DISABLED'; END IF;
  RETURN v_farmer;
END
$fn$;

-- The provider's rating and finished jobs, counted from the requests.
CREATE OR REPLACE FUNCTION public.farm_service_refresh_provider_stats(p_account_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  UPDATE public.service_provider_profiles sp SET
    rating_count   = s.rated,
    rating_average = s.average,
    jobs_completed = s.done,
    updated_at     = now()
  FROM (SELECT count(*) FILTER (WHERE r.farmer_rating IS NOT NULL)::integer AS rated,
               round(avg(r.farmer_rating) FILTER (WHERE r.farmer_rating IS NOT NULL), 2) AS average,
               count(*)::integer AS done
          FROM public.service_requests r
         WHERE r.provider_account_id = p_account_id AND r.status = 'DONE') s
  WHERE sp.account_id = p_account_id
$fn$;

-- Books a request on one offer. The caller holds the request row locked and
-- has checked that it is OPEN. Reserves nursery stock; raises when short.
CREATE OR REPLACE FUNCTION public.farm_service_confirm(p_request_id uuid, p_offer_id uuid, p_actor text, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r       public.service_requests%ROWTYPE;
  o       public.service_request_offers%ROWTYPE;
  v_batch uuid;
BEGIN
  SELECT * INTO r FROM public.service_requests WHERE id = p_request_id;
  SELECT * INTO o FROM public.service_request_offers WHERE id = p_offer_id AND request_id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFFER_NOT_FOUND'; END IF;

  IF r.kind = 'NURSERY' THEN
    SELECT b.id INTO v_batch
      FROM public.nursery_batches b
     WHERE b.product_id = r.nursery_product_id AND b.status = 'ACTIVE'
       AND b.ready_date <= o.offer_date AND b.total_qty - b.reserved_qty >= r.quantity
     ORDER BY b.ready_date, b.id
     LIMIT 1
     FOR UPDATE;
    IF v_batch IS NULL THEN RAISE EXCEPTION 'NURSERY_STOCK_SHORT'; END IF;
    UPDATE public.nursery_batches SET reserved_qty = reserved_qty + r.quantity::integer, updated_at = now() WHERE id = v_batch;
  END IF;

  UPDATE public.service_request_offers SET status = 'ACCEPTED', updated_at = now() WHERE id = p_offer_id;
  UPDATE public.service_request_offers SET status = 'CLOSED', updated_at = now()
   WHERE request_id = p_request_id AND id <> p_offer_id AND status = 'PENDING';
  UPDATE public.service_requests SET
    status = 'CONFIRMED', provider_account_id = o.account_id, accepted_offer_id = o.id,
    agreed_rate = o.rate, agreed_unit = o.pricing_unit, agreed_date = o.offer_date,
    nursery_batch_id = v_batch, confirmed_at = now(), updated_at = now()
  WHERE id = p_request_id;
  PERFORM public.farm_service_log(p_request_id, p_actor, p_actor_id, 'CONFIRMED',
            jsonb_build_object('offer_id', o.id, 'rate', o.rate, 'unit', o.pricing_unit, 'date', o.offer_date));
  PERFORM public.farm_service_log(p_request_id, p_actor, p_actor_id, 'CONTACT_SHARED',
            jsonb_build_object('farmer_id', r.farmer_id, 'provider_account_id', o.account_id));
END
$fn$;

-- Gives reserved nursery stock back. The caller holds the request row locked.
CREATE OR REPLACE FUNCTION public.farm_service_release_stock(p_request_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  UPDATE public.nursery_batches b
     SET reserved_qty = b.reserved_qty - r.quantity::integer, updated_at = now()
    FROM public.service_requests r
   WHERE r.id = p_request_id AND r.kind = 'NURSERY' AND b.id = r.nursery_batch_id
$fn$;

-- ── 4. the farmer's side ───────────────────────────────────────────────────
-- Everything the farmer asked for, newest first, with the offers to answer.
-- The other side's name and number appear only once booked.
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

-- One request. p: kind, land_id, needed_date, quantity, and one of
-- provider_service_id (one provider), nursery_product_id (a nursery plant), or
-- category_code + quantity_unit (every provider of that service near the land).
CREATE OR REPLACE FUNCTION public.farm_service_request_create(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_farmer  uuid  := public.farm_services_farmer();
  v_pol     jsonb := public.farm_services_policy();
  v_today   date  := public.farm_services_today();
  v_tenant  uuid;
  v_land    uuid;
  v_date    date;
  v_qty     numeric;
  v_kind    text := p ->> 'kind';
  s         record;
  n         record;
  c         record;
  v_id      uuid;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' OR v_kind IS NULL OR v_kind NOT IN ('SERVICE', 'NURSERY') THEN
    RAISE EXCEPTION 'REQUEST_INPUT_INVALID';
  END IF;
  BEGIN
    v_land := nullif(p ->> 'land_id', '')::uuid;
    v_date := (p ->> 'needed_date')::date;
    v_qty  := (p ->> 'quantity')::numeric;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'REQUEST_INPUT_INVALID';
  END;
  IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 9999999 THEN RAISE EXCEPTION 'REQUEST_QUANTITY_INVALID'; END IF;
  IF v_date IS NULL OR v_date < v_today OR v_date > v_today + (v_pol ->> 'request_horizon_days')::integer THEN
    RAISE EXCEPTION 'REQUEST_DATE_INVALID';
  END IF;
  PERFORM 1 FROM public.lands l
   WHERE l.id = v_land AND l.farmer_id = v_farmer AND coalesce(l.is_active, true) AND l.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_LAND_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lands l WHERE l.id = v_land AND l.center_lat IS NOT NULL AND l.center_lon IS NOT NULL) THEN
    RAISE EXCEPTION 'REQUEST_LAND_NOT_LOCATED';
  END IF;
  SELECT c2.tenant_id INTO v_tenant FROM public.verified_session_context() c2;

  -- one farmer's requests are created one after the other, so the limit holds
  PERFORM pg_advisory_xact_lock(hashtextextended('farm_service_request:' || v_farmer::text, 0));
  IF (SELECT count(*) FROM public.service_requests r
       WHERE r.farmer_id = v_farmer AND r.status = 'OPEN' AND r.needed_date >= v_today)
     >= (v_pol ->> 'max_open_requests')::integer THEN
    RAISE EXCEPTION 'REQUEST_LIMIT_REACHED';
  END IF;

  IF v_kind = 'NURSERY' THEN
    SELECT np.id, np.account_id, np.pricing_unit, np.price, np.currency, np.min_order_qty INTO n
      FROM public.nursery_products np
      JOIN public.service_provider_profiles sp ON sp.account_id = np.account_id AND sp.listing_status = 'LISTED'
     WHERE np.id = nullif(p ->> 'nursery_product_id', '')::uuid AND np.status = 'ACTIVE';
    IF NOT FOUND OR public.farm_service_land_distance(v_land, n.account_id) IS NULL THEN
      RAISE EXCEPTION 'NURSERY_STORE_NOT_FOUND';
    END IF;
    IF v_qty <> trunc(v_qty) OR v_qty < coalesce(n.min_order_qty, 1) THEN RAISE EXCEPTION 'REQUEST_QUANTITY_INVALID'; END IF;
    IF coalesce((SELECT max(b.total_qty - b.reserved_qty) FROM public.nursery_batches b
                  WHERE b.product_id = n.id AND b.status = 'ACTIVE' AND b.ready_date <= v_date), 0) < v_qty THEN
      RAISE EXCEPTION 'NURSERY_STOCK_SHORT';
    END IF;
    INSERT INTO public.service_requests (kind, farmer_id, farmer_tenant_id, land_id, family_code, target_account_id,
                                         nursery_product_id, quantity, quantity_unit, needed_date, quoted_rate, currency)
    VALUES ('NURSERY', v_farmer, v_tenant, v_land, 'NURSERY', n.account_id, n.id, v_qty, n.pricing_unit, v_date, n.price, n.currency)
    RETURNING id INTO v_id;

  ELSIF nullif(p ->> 'provider_service_id', '') IS NOT NULL THEN
    SELECT ps.id, ps.account_id, ps.category_code, ps.pricing_unit, ps.base_rate, ps.currency, sc.parent_code, sp.accepts_requests INTO s
      FROM public.provider_services ps
      JOIN public.service_categories sc ON sc.code = ps.category_code
      JOIN public.service_provider_profiles sp ON sp.account_id = ps.account_id AND sp.listing_status = 'LISTED'
     WHERE ps.id = (p ->> 'provider_service_id')::uuid AND ps.status = 'ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_SERVICE_NOT_FOUND'; END IF;
    IF NOT s.accepts_requests THEN RAISE EXCEPTION 'PROVIDER_NOT_ACCEPTING'; END IF;
    IF public.farm_service_land_distance(v_land, s.account_id) IS NULL THEN RAISE EXCEPTION 'PROVIDER_OUT_OF_REACH'; END IF;
    INSERT INTO public.service_requests (kind, farmer_id, farmer_tenant_id, land_id, family_code, category_code, target_account_id,
                                         provider_service_id, quantity, quantity_unit, needed_date, quoted_rate, currency)
    VALUES ('SERVICE', v_farmer, v_tenant, v_land, s.parent_code, s.category_code, s.account_id, s.id, v_qty, s.pricing_unit, v_date, s.base_rate, s.currency)
    RETURNING id INTO v_id;

  ELSE
    SELECT sc.code, sc.parent_code INTO c FROM public.service_categories sc
     WHERE sc.code = p ->> 'category_code' AND sc.parent_code IS NOT NULL AND sc.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_SERVICE_NOT_FOUND'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pricing_units u WHERE u.code = p ->> 'quantity_unit' AND u.is_active AND NOT u.is_negotiable) THEN
      RAISE EXCEPTION 'REQUEST_UNIT_INVALID';
    END IF;
    INSERT INTO public.service_requests (kind, farmer_id, farmer_tenant_id, land_id, family_code, category_code,
                                         quantity, quantity_unit, needed_date)
    VALUES ('SERVICE', v_farmer, v_tenant, v_land, c.parent_code, c.code, v_qty, p ->> 'quantity_unit', v_date)
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.farm_service_log(v_id, 'FARMER', v_farmer, 'CREATED');
  RETURN public.farm_service_requests_mine();
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'REQUEST_INPUT_INVALID';
END
$fn$;

-- The farmer says yes to one offer: the request is booked.
CREATE OR REPLACE FUNCTION public.farm_service_offer_accept(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_farmer  uuid := public.farm_services_farmer();
  v_request uuid;
  v_status  text;
  v_date    date;
BEGIN
  SELECT r.id, r.status, r.needed_date INTO v_request, v_status, v_date
    FROM public.service_request_offers o
    JOIN public.service_requests r ON r.id = o.request_id
   WHERE o.id = p_offer_id AND r.farmer_id = v_farmer
   FOR UPDATE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFFER_NOT_FOUND'; END IF;
  IF v_status <> 'OPEN' OR v_date < public.farm_services_today()
     OR NOT EXISTS (SELECT 1 FROM public.service_request_offers o WHERE o.id = p_offer_id AND o.status = 'PENDING') THEN
    RAISE EXCEPTION 'OFFER_NOT_AVAILABLE';
  END IF;
  PERFORM public.farm_service_confirm(v_request, p_offer_id, 'FARMER', v_farmer);
  RETURN public.farm_service_requests_mine();
END
$fn$;

-- The farmer says no to one offer. A request sent to that one provider ends with it.
CREATE OR REPLACE FUNCTION public.farm_service_offer_decline(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_farmer uuid := public.farm_services_farmer();
  r        record;
BEGIN
  SELECT r2.id, r2.status, r2.target_account_id INTO r
    FROM public.service_request_offers o
    JOIN public.service_requests r2 ON r2.id = o.request_id
   WHERE o.id = p_offer_id AND r2.farmer_id = v_farmer
   FOR UPDATE OF r2;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFFER_NOT_FOUND'; END IF;
  UPDATE public.service_request_offers SET status = 'DECLINED', updated_at = now() WHERE id = p_offer_id AND status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'OFFER_NOT_AVAILABLE'; END IF;
  PERFORM public.farm_service_log(r.id, 'FARMER', v_farmer, 'OFFER_DECLINED', jsonb_build_object('offer_id', p_offer_id));
  IF r.status = 'OPEN' AND r.target_account_id IS NOT NULL THEN
    UPDATE public.service_requests SET status = 'CANCELLED', cancelled_by = 'FARMER', cancelled_at = now(), updated_at = now() WHERE id = r.id;
  END IF;
  RETURN public.farm_service_requests_mine();
END
$fn$;

-- The farmer cancels a request, open or booked. Reserved plants go back to stock.
CREATE OR REPLACE FUNCTION public.farm_service_request_cancel(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_farmer uuid := public.farm_services_farmer();
  v_status text;
BEGIN
  SELECT r.status INTO v_status FROM public.service_requests r
   WHERE r.id = p_request_id AND r.farmer_id = v_farmer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_status NOT IN ('OPEN', 'CONFIRMED') THEN RAISE EXCEPTION 'REQUEST_NOT_AVAILABLE'; END IF;
  IF v_status = 'CONFIRMED' THEN PERFORM public.farm_service_release_stock(p_request_id); END IF;
  UPDATE public.service_request_offers SET status = 'CLOSED', updated_at = now() WHERE request_id = p_request_id AND status = 'PENDING';
  UPDATE public.service_requests SET status = 'CANCELLED', cancelled_by = 'FARMER', cancelled_at = now(), updated_at = now() WHERE id = p_request_id;
  PERFORM public.farm_service_log(p_request_id, 'FARMER', v_farmer, 'CANCELLED', jsonb_build_object('was', v_status));
  RETURN public.farm_service_requests_mine();
END
$fn$;

-- 1–5 stars for a finished job, once.
CREATE OR REPLACE FUNCTION public.farm_service_request_rate(p_request_id uuid, p_stars integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_farmer   uuid := public.farm_services_farmer();
  v_provider uuid;
BEGIN
  IF p_stars IS NULL OR p_stars NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'RATING_INVALID'; END IF;
  UPDATE public.service_requests r SET farmer_rating = p_stars, rated_at = now(), updated_at = now()
   WHERE r.id = p_request_id AND r.farmer_id = v_farmer AND r.status = 'DONE' AND r.farmer_rating IS NULL
   RETURNING r.provider_account_id INTO v_provider;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_AVAILABLE'; END IF;
  PERFORM public.farm_service_refresh_provider_stats(v_provider);
  PERFORM public.farm_service_log(p_request_id, 'FARMER', v_farmer, 'RATED', jsonb_build_object('stars', p_stars));
  RETURN public.farm_service_requests_mine();
END
$fn$;

-- Save or unsave a provider. Returns the new state.
CREATE OR REPLACE FUNCTION public.farm_services_save_provider(p_account_id uuid, p_saved boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_farmer uuid := public.farm_services_farmer();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.service_provider_profiles sp WHERE sp.account_id = p_account_id AND sp.listing_status = 'LISTED') THEN
    RAISE EXCEPTION 'PROVIDER_NOT_FOUND';
  END IF;
  INSERT INTO public.farmer_saved_providers (farmer_id, account_id, is_saved)
  VALUES (v_farmer, p_account_id, coalesce(p_saved, true))
  ON CONFLICT (farmer_id, account_id) DO UPDATE SET is_saved = EXCLUDED.is_saved, updated_at = now();
  RETURN coalesce(p_saved, true);
END
$fn$;

-- ── 5. file 6 functions, replaced ──────────────────────────────────────────
-- Deleted lands are left out.
CREATE OR REPLACE FUNCTION public.farm_services_reachable()
RETURNS TABLE(account_id uuid, distance_km numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH origin AS (
    SELECT l.center_lat AS lat, l.center_lon AS lon
      FROM public.lands l
     WHERE l.farmer_id = public.get_current_farmer_id()
       AND coalesce(l.is_active, true) AND l.deleted_at IS NULL
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

-- Adds: each kind's stored label, and what is waiting for the farmer.
CREATE OR REPLACE FUNCTION public.farm_services_nearby()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_farmer  uuid := public.farm_services_farmer();
  v_today   date := public.farm_services_today();
  v_located boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.lands l WHERE l.farmer_id = v_farmer AND coalesce(l.is_active, true) AND l.deleted_at IS NULL
                   AND l.center_lat IS NOT NULL AND l.center_lon IS NOT NULL) INTO v_located;
  RETURN jsonb_build_object(
    'located', v_located,
    'requests', (SELECT jsonb_build_object(
                   'offers_waiting', count(*) FILTER (WHERE r.status = 'OPEN' AND r.needed_date >= v_today
                                                        AND EXISTS (SELECT 1 FROM public.service_request_offers o
                                                                     WHERE o.request_id = r.id AND o.status = 'PENDING')),
                   'open',           count(*) FILTER (WHERE r.status = 'OPEN' AND r.needed_date >= v_today),
                   'booked',         count(*) FILTER (WHERE r.status = 'CONFIRMED'),
                   'to_rate',        count(*) FILTER (WHERE r.status = 'DONE' AND r.farmer_rating IS NULL))
                   FROM public.service_requests r WHERE r.farmer_id = v_farmer),
    'families', coalesce((
      SELECT jsonb_agg(jsonb_build_object('code', fam.code, 'label_en', fam.label_en, 'count', (
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

-- Adds: saved (by the calling farmer).
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
    'saved',              EXISTS (SELECT 1 FROM public.farmer_saved_providers f
                                   WHERE f.farmer_id = public.get_current_farmer_id() AND f.account_id = sp.account_id AND f.is_saved),
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

-- "Ready now" counts the day in the policy's timezone, like every request function.
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
                                           WHERE b.product_id = np.id AND b.status = 'ACTIVE' AND b.ready_date <= public.farm_services_today()), 0),
               'batches', coalesce((SELECT jsonb_agg(jsonb_build_object('ready_date', b.ready_date, 'available_qty', b.total_qty - b.reserved_qty)
                                                     ORDER BY b.ready_date)
                                      FROM public.nursery_batches b
                                     WHERE b.product_id = np.id AND b.status = 'ACTIVE' AND b.total_qty > b.reserved_qty), '[]'::jsonb))
             ORDER BY np.created_at)
        FROM public.nursery_products np WHERE np.account_id = p_account_id AND np.status = 'ACTIVE'), '[]'::jsonb));
END
$fn$;

-- ── 6. the provider's side ─────────────────────────────────────────────────
-- May this provider answer this request? Open, not past its day, not answered
-- by him yet, and either sent to him or sent to everyone while he is listed,
-- takes requests, offers that service and his area covers the land.
CREATE OR REPLACE FUNCTION public.provider_request_visible(p_request_id uuid, p_account_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.service_requests r
     WHERE r.id = p_request_id AND r.status = 'OPEN' AND r.needed_date >= public.farm_services_today()
       AND NOT EXISTS (SELECT 1 FROM public.service_request_offers o WHERE o.request_id = r.id AND o.account_id = p_account_id)
       AND (r.target_account_id = p_account_id
            OR (r.target_account_id IS NULL
                AND EXISTS (SELECT 1 FROM public.service_provider_profiles sp
                             WHERE sp.account_id = p_account_id AND sp.listing_status = 'LISTED' AND sp.accepts_requests)
                AND EXISTS (SELECT 1 FROM public.provider_services s
                             WHERE s.account_id = p_account_id AND s.status = 'ACTIVE' AND s.category_code = r.category_code)
                AND public.farm_service_land_distance(r.land_id, p_account_id) IS NOT NULL)))
$fn$;

-- One request as the provider may see it. The farmer's name and number, and
-- the land's name, village and place, are added only once it is booked with him.
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
    'cancelled_by', r.cancelled_by, 'farmer_rating', r.farmer_rating, 'created_at', r.created_at,
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

-- The provider's work: new requests to answer, offers waiting for the farmer,
-- booked jobs, and the last finished or cancelled ones.
CREATE OR REPLACE FUNCTION public.provider_requests_inbox()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid;
  v_today   date := public.farm_services_today();
  v_new     jsonb;
  v_waiting jsonb;
  v_jobs    jsonb;
  v_past    jsonb;
BEGIN
  SELECT s.account_id INTO v_account FROM public.provider_session_account() s;

  SELECT coalesce(jsonb_agg(public.provider_request_card(x.id, v_account) ORDER BY x.needed_date, x.created_at), '[]'::jsonb) INTO v_new
    FROM (SELECT r.id, r.needed_date, r.created_at FROM public.service_requests r
           WHERE r.status = 'OPEN' AND r.needed_date >= v_today
             AND (r.target_account_id = v_account
                  OR (r.target_account_id IS NULL AND r.category_code IN (
                        SELECT s.category_code FROM public.provider_services s
                         WHERE s.account_id = v_account AND s.status = 'ACTIVE')))
             AND public.provider_request_visible(r.id, v_account)
           ORDER BY r.needed_date, r.created_at LIMIT 50) x;

  SELECT coalesce(jsonb_agg(public.provider_request_card(r.id, v_account) ORDER BY r.needed_date), '[]'::jsonb) INTO v_waiting
    FROM public.service_requests r
    JOIN public.service_request_offers o ON o.request_id = r.id AND o.account_id = v_account AND o.status = 'PENDING'
   WHERE r.status = 'OPEN' AND r.needed_date >= v_today;

  SELECT coalesce(jsonb_agg(public.provider_request_card(r.id, v_account) ORDER BY r.agreed_date), '[]'::jsonb) INTO v_jobs
    FROM public.service_requests r WHERE r.provider_account_id = v_account AND r.status = 'CONFIRMED';

  SELECT coalesce(jsonb_agg(public.provider_request_card(x.id, v_account) ORDER BY x.updated_at DESC), '[]'::jsonb) INTO v_past
    FROM (SELECT r.id, r.updated_at FROM public.service_requests r
           WHERE r.provider_account_id = v_account AND r.status IN ('DONE', 'CANCELLED')
           ORDER BY r.updated_at DESC LIMIT 15) x;

  RETURN jsonb_build_object('new', v_new, 'waiting', v_waiting, 'jobs', v_jobs, 'past', v_past);
END
$fn$;

-- The provider answers a request. p.action:
--   ACCEPT  the request as asked (his rate, the farmer's day)
--   OFFER   another rate and/or day: p.rate, p.offer_date
--   REFUSE  not for him
CREATE OR REPLACE FUNCTION public.provider_request_respond(p_request_id uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid;
  v_pol     jsonb := public.farm_services_policy();
  v_today   date  := public.farm_services_today();
  v_action  text  := p ->> 'action';
  r         public.service_requests%ROWTYPE;
  v_direct  boolean;
  v_rate    numeric;
  v_unit    text;
  v_date    date;
  v_offer   uuid;
BEGIN
  SELECT s.account_id INTO v_account FROM public.provider_session_account() s;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' OR v_action IS NULL OR v_action NOT IN ('ACCEPT', 'OFFER', 'REFUSE') THEN
    RAISE EXCEPTION 'REQUEST_INPUT_INVALID';
  END IF;
  SELECT * INTO r FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR NOT public.provider_request_visible(p_request_id, v_account) THEN
    RAISE EXCEPTION 'REQUEST_NOT_AVAILABLE';
  END IF;
  v_direct := r.target_account_id IS NOT NULL;

  IF v_action = 'REFUSE' THEN
    INSERT INTO public.service_request_offers (request_id, account_id, offer_date, status)
    VALUES (r.id, v_account, r.needed_date, 'REFUSED');
    IF v_direct THEN
      UPDATE public.service_requests SET status = 'DECLINED', updated_at = now() WHERE id = r.id;
    END IF;
    PERFORM public.farm_service_log(r.id, 'PROVIDER', v_account, 'REFUSED');
    RETURN public.provider_requests_inbox();
  END IF;

  -- his own rate and unit for this request
  IF v_direct THEN
    v_rate := r.quoted_rate; v_unit := r.quantity_unit;
  ELSE
    SELECT s.base_rate, s.pricing_unit INTO v_rate, v_unit FROM public.provider_services s
     WHERE s.account_id = v_account AND s.status = 'ACTIVE' AND s.category_code = r.category_code
     ORDER BY s.created_at LIMIT 1;
  END IF;
  v_date := r.needed_date;

  IF v_action = 'OFFER' THEN
    BEGIN
      v_rate := (p ->> 'rate')::numeric;
      v_date := coalesce((p ->> 'offer_date')::date, r.needed_date);
    EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'REQUEST_INPUT_INVALID';
    END;
    IF v_date < v_today OR v_date > v_today + (v_pol ->> 'request_horizon_days')::integer THEN
      RAISE EXCEPTION 'REQUEST_DATE_INVALID';
    END IF;
  END IF;
  IF v_rate IS NULL OR v_rate < 0 OR v_rate > 99999999 THEN RAISE EXCEPTION 'OFFER_RATE_REQUIRED'; END IF;

  IF (SELECT count(*) FROM public.service_request_offers o WHERE o.request_id = r.id AND o.status = 'PENDING')
     >= (v_pol ->> 'max_offers_per_request')::integer THEN
    RAISE EXCEPTION 'REQUEST_OFFERS_FULL';
  END IF;

  INSERT INTO public.service_request_offers (request_id, account_id, rate, pricing_unit, offer_date)
  VALUES (r.id, v_account, v_rate, v_unit, v_date) RETURNING id INTO v_offer;
  PERFORM public.farm_service_log(r.id, 'PROVIDER', v_account, 'OFFERED',
            jsonb_build_object('offer_id', v_offer, 'rate', v_rate, 'unit', v_unit, 'date', v_date, 'action', v_action));

  -- Asked of him alone and accepted as asked: booked now, no second step for the farmer.
  IF v_direct AND v_action = 'ACCEPT' THEN
    PERFORM public.farm_service_confirm(r.id, v_offer, 'PROVIDER', v_account);
  END IF;
  RETURN public.provider_requests_inbox();
END
$fn$;

-- The provider takes back a waiting offer, or cancels a booked job.
CREATE OR REPLACE FUNCTION public.provider_request_cancel(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid;
  r         public.service_requests%ROWTYPE;
BEGIN
  SELECT s.account_id INTO v_account FROM public.provider_session_account() s;
  SELECT * INTO r FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_AVAILABLE'; END IF;

  IF r.status = 'CONFIRMED' AND r.provider_account_id = v_account THEN
    PERFORM public.farm_service_release_stock(r.id);
    UPDATE public.service_requests SET status = 'CANCELLED', cancelled_by = 'PROVIDER', cancelled_at = now(), updated_at = now() WHERE id = r.id;
    PERFORM public.farm_service_log(r.id, 'PROVIDER', v_account, 'CANCELLED', jsonb_build_object('was', 'CONFIRMED'));
  ELSIF r.status = 'OPEN' THEN
    UPDATE public.service_request_offers SET status = 'WITHDRAWN', updated_at = now()
     WHERE request_id = r.id AND account_id = v_account AND status = 'PENDING';
    IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_AVAILABLE'; END IF;
    IF r.target_account_id = v_account THEN
      UPDATE public.service_requests SET status = 'DECLINED', updated_at = now() WHERE id = r.id;
    END IF;
    PERFORM public.farm_service_log(r.id, 'PROVIDER', v_account, 'OFFER_WITHDRAWN');
  ELSE
    RAISE EXCEPTION 'REQUEST_NOT_AVAILABLE';
  END IF;
  RETURN public.provider_requests_inbox();
END
$fn$;

-- The provider marks a booked job done, on or after the agreed day. Plants
-- that were reserved leave the stock.
CREATE OR REPLACE FUNCTION public.provider_job_done(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid;
  r         public.service_requests%ROWTYPE;
BEGIN
  SELECT s.account_id INTO v_account FROM public.provider_session_account() s;
  SELECT * INTO r FROM public.service_requests WHERE id = p_request_id AND provider_account_id = v_account FOR UPDATE;
  IF NOT FOUND OR r.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'REQUEST_NOT_AVAILABLE'; END IF;
  IF r.agreed_date > public.farm_services_today() THEN RAISE EXCEPTION 'JOB_NOT_STARTED'; END IF;
  IF r.kind = 'NURSERY' AND r.nursery_batch_id IS NOT NULL THEN
    UPDATE public.nursery_batches SET
      total_qty = total_qty - r.quantity::integer, reserved_qty = reserved_qty - r.quantity::integer, updated_at = now()
    WHERE id = r.nursery_batch_id;
  END IF;
  UPDATE public.service_requests SET status = 'DONE', done_at = now(), updated_at = now() WHERE id = r.id;
  PERFORM public.farm_service_refresh_provider_stats(v_account);
  PERFORM public.farm_service_log(r.id, 'PROVIDER', v_account, 'DONE');
  RETURN public.provider_requests_inbox();
END
$fn$;

-- ── 7. rights ──────────────────────────────────────────────────────────────
-- the browser may call these
REVOKE ALL ON FUNCTION public.farm_service_requests_mine() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_service_requests_mine() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_service_request_create(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_service_request_create(jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_service_offer_accept(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_service_offer_accept(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_service_offer_decline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_service_offer_decline(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_service_request_cancel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_service_request_cancel(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_service_request_rate(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_service_request_rate(uuid, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_services_save_provider(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_services_save_provider(uuid, boolean) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.farm_services_nearby() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_services_nearby() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.provider_requests_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_requests_inbox() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.provider_request_respond(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_request_respond(uuid, jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.provider_request_cancel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_request_cancel(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.provider_job_done(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_job_done(uuid) TO anon, authenticated, service_role;
-- internal only
REVOKE ALL ON FUNCTION public.farm_services_policy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_services_policy() TO service_role;
REVOKE ALL ON FUNCTION public.farm_services_today() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_services_today() TO service_role;
REVOKE ALL ON FUNCTION public.farm_services_farmer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_services_farmer() TO service_role;
REVOKE ALL ON FUNCTION public.farm_service_land_distance(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_service_land_distance(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.farm_service_log(uuid, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_service_log(uuid, text, uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.farm_service_refresh_provider_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_service_refresh_provider_stats(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.farm_service_confirm(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_service_confirm(uuid, uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.farm_service_release_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_service_release_stock(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.provider_request_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_request_visible(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.provider_request_card(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_request_card(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.farm_services_reachable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_services_reachable() TO service_role;
REVOKE ALL ON FUNCTION public.farm_services_provider_card(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_services_provider_card(uuid, numeric, text) TO service_role;

-- Verification (read-only) ────────────────────────────────────────────────────
SELECT 'request tables with row security on' AS check_name, count(*)::text AS actual, '4' AS expected
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relrowsecurity
   AND c.relname IN ('farmer_saved_providers', 'service_requests', 'service_request_offers', 'service_request_events');
SELECT 'browser privileges on the request tables' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM information_schema.table_privileges
 WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
   AND table_name IN ('farmer_saved_providers', 'service_requests', 'service_request_offers', 'service_request_events');
SELECT 'internal request functions callable by the browser' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM information_schema.routine_privileges
 WHERE specific_schema = 'public' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
   AND routine_name IN ('farm_services_policy', 'farm_services_today', 'farm_services_farmer', 'farm_service_land_distance',
                        'farm_service_log', 'farm_service_refresh_provider_stats', 'farm_service_confirm',
                        'farm_service_release_stock', 'provider_request_visible', 'provider_request_card',
                        'farm_services_reachable', 'farm_services_provider_card');
