CREATE OR REPLACE FUNCTION public.run_env_verification()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_date date := (now() AT TIME ZONE 'UTC')::date - 1;
  v_pairs integer := 0;
BEGIN
  WITH fc AS (
    SELECT cell_key, property_code, source_id, valid_time, avg(value) AS fval
    FROM public.env_observations
    WHERE cell_key IS NOT NULL
      AND horizon_hours BETWEEN 18 AND 30
      AND valid_time >= v_target_date::timestamptz
      AND valid_time < (v_target_date + 1)::timestamptz
    GROUP BY 1,2,3,4
  ),
  ob AS (
    SELECT cell_key, property_code, valid_time, avg(value) AS oval
    FROM public.env_observations
    WHERE cell_key IS NOT NULL
      AND coalesce(horizon_hours, 0) <= 0
      AND valid_time >= v_target_date::timestamptz
      AND valid_time < (v_target_date + 1)::timestamptz
    GROUP BY 1,2,3
  ),
  paired AS (
    SELECT fc.cell_key, fc.property_code, fc.source_id,
           avg(fc.fval - ob.oval) AS err,
           avg(abs(fc.fval - ob.oval)) AS abs_err,
           count(*)::int AS n
    FROM fc
    JOIN ob ON ob.cell_key = fc.cell_key
           AND ob.property_code = fc.property_code
           AND ob.valid_time = fc.valid_time
    GROUP BY 1,2,3
  ),
  upserted AS (
    INSERT INTO public.weather_cell_bias AS b
      (cell_key, source_id, property_code, rolling_bias, rolling_mae, sample_n, updated_at)
    SELECT p.cell_key, p.source_id, p.property_code, p.err, p.abs_err, p.n, now()
    FROM paired p
    ON CONFLICT (cell_key, source_id, property_code) DO UPDATE
      SET rolling_bias = CASE
            WHEN b.sample_n IS NULL OR b.sample_n = 0 OR b.rolling_bias IS NULL THEN EXCLUDED.rolling_bias
            ELSE 0.95 * b.rolling_bias + 0.05 * EXCLUDED.rolling_bias END,
          rolling_mae = CASE
            WHEN b.sample_n IS NULL OR b.sample_n = 0 OR b.rolling_mae IS NULL THEN EXCLUDED.rolling_mae
            ELSE 0.95 * b.rolling_mae + 0.05 * EXCLUDED.rolling_mae END,
          sample_n = coalesce(b.sample_n, 0) + EXCLUDED.sample_n,
          updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_pairs FROM upserted;

  RETURN jsonb_build_object('target_date', v_target_date, 'cells_updated', v_pairs, 'ran_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.run_env_verification() FROM public;
GRANT EXECUTE ON FUNCTION public.run_env_verification() TO service_role;

SELECT cron.unschedule('env-verification-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'env-verification-daily');

SELECT cron.schedule('env-verification-daily', '0 17 * * *', $cron$SELECT public.run_env_verification();$cron$);