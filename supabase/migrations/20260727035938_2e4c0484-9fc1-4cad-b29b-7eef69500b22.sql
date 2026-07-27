CREATE OR REPLACE VIEW public.observation_label_integrity
WITH (security_invoker = true) AS
WITH ui AS (
  SELECT observation_code
  FROM public.observation_master
  WHERE is_active AND is_farmer_observable AND can_generate_question
),
missing AS (
  SELECT 'MISSING_LABEL'::text AS issue,
         l.lang AS language_code,
         NULL::text AS display_text,
         ARRAY[u.observation_code] AS observation_codes
  FROM ui u
  CROSS JOIN (VALUES ('en'),('hi'),('mr')) AS l(lang)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.observation_translations t
    WHERE t.observation_code = u.observation_code AND t.language_code = l.lang
  )
),
dupes AS (
  SELECT 'DUPLICATE_LABEL'::text AS issue,
         t.language_code,
         btrim(coalesce(nullif(btrim(t.display_text),''), t.description_text)) AS display_text,
         array_agg(t.observation_code ORDER BY t.observation_code) AS observation_codes
  FROM public.observation_translations t
  JOIN ui u ON u.observation_code = t.observation_code
  WHERE t.language_code IN ('en','hi','mr')
    AND coalesce(nullif(btrim(t.display_text),''), t.description_text) IS NOT NULL
  GROUP BY 1,2,3
  HAVING count(*) > 1
)
SELECT * FROM missing
UNION ALL
SELECT * FROM dupes;

GRANT SELECT ON public.observation_label_integrity TO authenticated;
GRANT SELECT ON public.observation_label_integrity TO service_role;