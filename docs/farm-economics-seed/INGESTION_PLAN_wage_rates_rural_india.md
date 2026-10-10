# Automated wage ingestion — Labour Bureau "Wage Rates in Rural India" (WRRI)

Why: the operation-wise agricultural wages (ploughing, sowing/transplanting/weeding,
harvesting/threshing, plant protection, general agricultural labour, by gender) are
published monthly per state by the Labour Bureau. The tables are on Indiastat
(paywalled) and on labourbureau.gov.in (blocks automated fetch). The machine-readable
copy is the Open Government Data platform catalog "Average Daily Wage Rate in Rural
India" (data.gov.in), which requires a free account + API key to list and download
resources — a one-time registration, after which ingestion is fully automatic.

Job (fits the existing agri-data-agent pattern: scheduled, runs outside Supabase,
writes with service role):
1. Monthly, call the data.gov.in resource API with the API key; fetch the latest
   WRRI release rows for every state in `states`.
2. Upsert one knowledge_sources row per release (source_code
   'LB_WRRI_<YYYY>_<MM>', publisher 'Labour Bureau, Ministry of Labour and
   Employment', url = resource url, publication_year, accessed_on = run date).
3. Insert labor_rates rows: state_id (join states.name), operation_type = WRRI
   occupation code as published, skill_tier = gender column as published
   ('male' / 'female'), daily_wage, currency 'INR', effective_date = first day of
   the WRRI month, scope_level 'state', origin 'knowledge_source',
   knowledge_source_id. Never overwrite: a new month is a new row.
4. Set effective_to on the previous month's rows for the same state+occupation+tier.
5. Log rows inserted / states missing (WRRI publishes a state only with ≥5 quotations).

Resolver contract (engine step): for a labour task the wage is resolved village →
taluka → district (admin_entered / farmer_confirmed_aggregate rows) → state
(WRRI row for the matching operation) → state unskilled_public_works_reference
(floor, gap 'labor_rate_state_reference_only') → NULL (gap 'labor_rate_no_row').

Same pattern, second job: CACP "Cost of Cultivation of Principal Crops" state
tables (desagri.gov.in / cacp.dacnet.nic.in, Excel) → cost_component_standard
rows with cost_basis = CACP concept (A2, A2+FL, C2) per crop × state × season.
