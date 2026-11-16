-- 2026-11-13 — STAGING ONLY — rice direct-seeded (DSR) agronomy data corrections for agronomist review.
-- Do NOT apply to production before an agronomist signs each block. No row is deleted. No session state.
-- Evidence: live schedule e7c27133-62e5-4000-a916-9869350535eb (PKV HMT, direct-seeded, Kolhapur).

-- 1. A transplanted-clock weeding rule was served to direct-seeded rice.
--    Its own text: "Run the rotary or cono weeder from 15 days after transplanting ...".
--    (The generator now also refuses transplant-clock wording on a method without transplanting.)
update public.decision_rules
   set cultivation_method_applicable = array['transplanted'], updated_at = now()
 where rule_id = 'RICE_WEED_CRITICAL_PERIOD_MH_DRAFT_001'
   and cultivation_method_applicable @> array['any'];

-- 2. Copper and manganese deficiency treatments were CONTEXT_SCHEDULE rules, so they reached the
--    calendar as sprays. Their own text requires a confirmed deficiency ("confirm with a soil or leaf
--    test"). They are observation-triggered treatments.
update public.decision_rules
   set trigger_class = 'OBSERVATION', updated_at = now()
 where rule_id in ('RICE_NUTR_CU_DEFICIT_TNAU_DRAFT_002', 'RICE_NUTR_MN_DEFICIT_TNAU_DRAFT_002')
   and trigger_class = 'CONTEXT_SCHEDULE';

-- 3. PI foliar booster formulation. The rule says "urea 1% + MAP 2% + KCl 1%" and cites the TNAU
--    transplanted main-field page; that MAP wording could not be confirmed on 2026-11-13. The TNAU
--    dry-seeded irrigated rice page states: "Foliar spray of 1% urea + 2% DAP + 1% KCl at PI and
--    10 days later" (https://agritech.tnau.ac.in/agriculture/agri_cropproduction_cereal_rice_dryseededirrigated_fertilizer.html).
--    Until the MAP source is verified, the MAP rule is limited to the method its source covers.
--    A direct-seeded DAP rule must be authored and approved by an agronomist (not inserted here).
update public.decision_rules
   set cultivation_method_applicable = array['transplanted'],
       verification_status = 'pending_review',
       updated_at = now()
 where rule_id = 'RICE_NUTR_FOLIAR_PI_BOOSTER_TNAU_DRAFT_002'
   and cultivation_method_applicable @> array['any'];

-- 4. No approved fertilizer programme exists for direct-seeded rice in Maharashtra, so the DSR plan had
--    no basal NPK and no top-dressing. Evidence (reviewable, NOT approved):
--    MPKV Rahuri research recommendations, Paddy, item 17 (2013-14), Sub-montane Zone of Maharashtra
--    (Kolhapur is in this zone): drilled paddy, recommended dose 75 : 37.5 : 37.5 kg N : P2O5 : K2O per ha,
--    applied as urea-DAP-MOP briquettes placed at drilling (16 cm apart in alternate rows, 5-7 cm deep,
--    rows 30 cm apart). https://mpkv.ac.in/Uploads/Research/1.%20Paddy_20200110043402.pdf
--    The briquette placement is a single basal application; it is recorded as such. review_status stays
--    'pending_agronomist' so the generator does not use it until an agronomist approves it.
insert into public.fertilizer_recommendation_master
  (crop_code, region_code, soil_fertility_class, n_kg_ha, p2o5_kg_ha, k2o_kg_ha, split_schedule,
   cultivation_context, source, authority, publication_year, derivation, confidence, review_status)
select 'rice', 'IN-MH', 'medium', 75, 37.5, 37.5,
       '[{"stage": "germination", "percent": 100, "nutrient": "N"}, {"stage": "germination", "percent": 100, "nutrient": "P2O5"}, {"stage": "germination", "percent": 100, "nutrient": "K2O"}]',
       'direct_seeded drilled sub-montane zone (urea-DAP-MOP briquettes at drilling)',
       'MPKV Rahuri research recommendation, Paddy item 17 (2013-14): drilled paddy, Sub-montane Zone, 75:37.5:37.5 NPK kg/ha as UDP briquettes',
       'MPKV Rahuri', 2014, 'sau_research_recommendation_pending_review', 0.7, 'pending_agronomist'
 where not exists (
   select 1 from public.fertilizer_recommendation_master
    where crop_code = 'rice' and region_code = 'IN-MH' and cultivation_context ilike 'direct_seeded%');
