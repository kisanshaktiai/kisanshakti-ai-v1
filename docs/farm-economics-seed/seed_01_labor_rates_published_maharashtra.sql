-- Reviewable seed — run AFTER 20260918090000_farm_economics_ssot.sql is applied.
-- Loads only figures with an official, fetched source. Nothing is typed from memory.
--
-- Source fetched 2026-09-19: Divisional Commissioner Office Pune (Government of
-- Maharashtra), "Rates of unskilled wages to be paid to labourers under MGNREGA",
-- citing the Central notification dated 27 March 2025: Maharashtra rate ₹312/day.
-- https://divcompune.maharashtra.gov.in/en/rates-of-unskilled-wages-to-be-paid-to-labourers-under-the-mahatma-gandhi-national-rural-employment-guarantee-scheme-mgnrega/
--
-- What this row IS: the statutory unskilled public-works wage for the state,
-- usable by the resolver only as a last-resort floor (with a gap recorded).
-- What it is NOT: an agricultural operation wage (ploughing, weeding, harvesting).
-- Those come from Labour Bureau "Wage Rates in Rural India" via the ingestion job.
--
-- BEFORE RUNNING: check the authority_tier convention with
--   select authority_tier, source_type, count(*), min(source_code), min(publisher)
--   from knowledge_sources group by 1,2 order by 1,2;
-- and replace <TIER> below with the tier used for state-government notifications.

INSERT INTO public.knowledge_sources
  (source_code, title, publisher, authority_tier, source_type, url, document_ref, publication_year, accessed_on, notes, is_active)
VALUES
  ('GOM_DIVCOM_PUNE_MGNREGA_WAGE_2025',
   'Rates of unskilled wages under MGNREGA, Maharashtra (Central notification 27-03-2025)',
   'Divisional Commissioner Office Pune, Government of Maharashtra',
   <TIER>,
   'government_notification',
   'https://divcompune.maharashtra.gov.in/en/rates-of-unskilled-wages-to-be-paid-to-labourers-under-the-mahatma-gandhi-national-rural-employment-guarantee-scheme-mgnrega/',
   'Central notification dated 27 March 2025',
   2025,
   DATE '2026-09-19',
   'Statutory unskilled public-works wage; reference floor only, not an agricultural operation wage.',
   true)
ON CONFLICT DO NOTHING;

INSERT INTO public.labor_rates
  (state, operation_type, skill_tier, season, daily_wage, currency, source, effective_date, is_active,
   scope_level, state_id, effective_to, origin, knowledge_source_id)
SELECT
  'Maharashtra', 'unskilled_public_works_reference', 'unskilled', NULL, 312, 'INR',
  'GOM_DIVCOM_PUNE_MGNREGA_WAGE_2025', DATE '2025-04-01', true,
  'state', '46de3a3f-2d76-4d53-bf57-34085d2d7dda', NULL, 'knowledge_source', ks.id
FROM public.knowledge_sources ks
WHERE ks.source_code = 'GOM_DIVCOM_PUNE_MGNREGA_WAGE_2025'
  AND NOT EXISTS (
    SELECT 1 FROM public.labor_rates lr
     WHERE lr.state_id = '46de3a3f-2d76-4d53-bf57-34085d2d7dda'
       AND lr.operation_type = 'unskilled_public_works_reference'
       AND lr.effective_date = DATE '2025-04-01');

-- Verify: expect 1 row
SELECT id, state, operation_type, daily_wage, effective_date, origin, knowledge_source_id
FROM public.labor_rates WHERE operation_type = 'unskilled_public_works_reference';
