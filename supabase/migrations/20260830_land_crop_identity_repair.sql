-- ============================================================================
-- 20260830_land_crop_identity_repair.sql            *** APPROVAL-GATED — DO NOT AUTO-APPLY ***
-- Repo: kisanshaktiai/kisanshakti-ai-v1  (branch kisanshakti-ai-update)
-- Crop Biological Growth Stage Engine — 2nd forensic audit reconciliation (R2), data repair
-- ----------------------------------------------------------------------------
-- FINDING (live 2026-08-30 05:20 UTC): 16 of 42 lands hold display / localized text in
-- lands.current_crop and have no current_crop_id. resolve_crop_phenology matches
-- lower(current_crop) = crop_stage_master.crop_code, so these lands can NEVER resolve a
-- stage, whatever their dates. This is the largest single contributor to "34/42 unresolved".
--
-- Evidence used for every mapping below (no assumption):
--   crop_synonyms.variant_name (exact, is_active) and/or crops.label / label_mr / label_hi,
--   AND the target crop_code must exist in crop_stage_master (else the land is queued, not
--   re-coded). Query that produced this list is in the validation block.
--
--   current_crop (as stored)   -> crop_code   evidence
--   ऊस  (3 lands)              -> sugarcane   crop_synonyms exact + crops.label_mr
--   गहू  (3 lands)              -> wheat       crop_synonyms exact + crops.label_mr
--   तांदूळ (1 land)             -> rice        crop_synonyms exact
--   Brinjal (Eggplant)         -> brinjal     crop_synonyms base + crops.label
--   Chickpea (Chana)           -> chickpea    crop_synonyms base + crops.label
--   Jowar (Sorghum)            -> jowar       crops.label
--   Carrot (2), राजमा (2), pulses (1), Cluster Beans (Vegetable) (1)
--                              -> NOT re-coded: no crop_stage_master ontology exists
--                                 (carrot / kidney_bean have crops rows; pulses and cluster
--                                 beans have none). Queued for content work.
--
-- Guards: each UPDATE matches the land by id prefix AND the exact stored text, so a land
-- edited by the farmer in the meantime is left alone. current_crop_id is set only when
-- exactly one active crops row carries that value. Old values are preserved in
-- stage_review_queue rows (issue_type=crop_identity_normalized) for reversibility.
-- Session-less runner safe. No DDL.
-- ============================================================================

-- ── 1. Sugarcane (ऊस) ───────────────────────────────────────────────────────
UPDATE public.lands l
   SET current_crop    = 'sugarcane',
       current_crop_id = coalesce(l.current_crop_id,
                                  (SELECT (array_agg(c.id))[1] FROM public.crops c WHERE c.is_active AND lower(c.value) = 'sugarcane'
                                    HAVING count(*) = 1)),
       updated_at      = now()
 WHERE l.current_crop = 'ऊस'
   AND (l.id::text LIKE '7329d635%' OR l.id::text LIKE '879e229f%' OR l.id::text LIKE '358adbb0%')
   AND EXISTS (SELECT 1 FROM public.crop_stage_master m WHERE m.crop_code = 'sugarcane' AND m.is_active);

-- ── 2. Wheat (गहू) ──────────────────────────────────────────────────────────
UPDATE public.lands l
   SET current_crop    = 'wheat',
       current_crop_id = coalesce(l.current_crop_id,
                                  (SELECT (array_agg(c.id))[1] FROM public.crops c WHERE c.is_active AND lower(c.value) = 'wheat'
                                    HAVING count(*) = 1)),
       updated_at      = now()
 WHERE l.current_crop = 'गहू'
   AND (l.id::text LIKE '033c81da%' OR l.id::text LIKE '714f7464%' OR l.id::text LIKE 'd094ed13%')
   AND EXISTS (SELECT 1 FROM public.crop_stage_master m WHERE m.crop_code = 'wheat' AND m.is_active);

-- ── 3. Rice (तांदूळ) ────────────────────────────────────────────────────────
UPDATE public.lands l
   SET current_crop    = 'rice',
       current_crop_id = coalesce(l.current_crop_id,
                                  (SELECT (array_agg(c.id))[1] FROM public.crops c WHERE c.is_active AND lower(c.value) = 'rice'
                                    HAVING count(*) = 1)),
       updated_at      = now()
 WHERE l.current_crop = 'तांदूळ'
   AND l.id::text LIKE '06c8de52%'
   AND EXISTS (SELECT 1 FROM public.crop_stage_master m WHERE m.crop_code = 'rice' AND m.is_active);

-- ── 4. Brinjal / Chickpea / Jowar (English display labels) ──────────────────
UPDATE public.lands l
   SET current_crop    = 'brinjal',
       current_crop_id = coalesce(l.current_crop_id,
                                  (SELECT (array_agg(c.id))[1] FROM public.crops c WHERE c.is_active AND lower(c.value) = 'brinjal'
                                    HAVING count(*) = 1)),
       updated_at      = now()
 WHERE l.current_crop = 'Brinjal (Eggplant)' AND l.id::text LIKE 'f1a0a6ed%'
   AND EXISTS (SELECT 1 FROM public.crop_stage_master m WHERE m.crop_code = 'brinjal' AND m.is_active);

UPDATE public.lands l
   SET current_crop    = 'chickpea',
       current_crop_id = coalesce(l.current_crop_id,
                                  (SELECT (array_agg(c.id))[1] FROM public.crops c WHERE c.is_active AND lower(c.value) = 'chickpea'
                                    HAVING count(*) = 1)),
       updated_at      = now()
 WHERE l.current_crop = 'Chickpea (Chana)' AND l.id::text LIKE '6e06302e%'
   AND EXISTS (SELECT 1 FROM public.crop_stage_master m WHERE m.crop_code = 'chickpea' AND m.is_active);

UPDATE public.lands l
   SET current_crop    = 'jowar',
       current_crop_id = coalesce(l.current_crop_id,
                                  (SELECT (array_agg(c.id))[1] FROM public.crops c WHERE c.is_active AND lower(c.value) = 'jowar'
                                    HAVING count(*) = 1)),
       updated_at      = now()
 WHERE l.current_crop = 'Jowar (Sorghum)' AND l.id::text LIKE '555785e5%'
   AND EXISTS (SELECT 1 FROM public.crop_stage_master m WHERE m.crop_code = 'jowar' AND m.is_active);

-- ── 5. Audit trail of what was re-coded (reversible: old text is here) ──────
INSERT INTO public.stage_review_queue (crop_code, issue_type, detail, proposed_resolution, severity, status)
SELECT 'all', 'crop_identity_normalized',
       'lands.current_crop normalized 2026-08-30 from display/localized text to canonical crop_code: '
       || 'ऊस->sugarcane (7329d635,879e229f,358adbb0); गहू->wheat (033c81da,714f7464,d094ed13); '
       || 'तांदूळ->rice (06c8de52); Brinjal (Eggplant)->brinjal (f1a0a6ed); Chickpea (Chana)->chickpea (6e06302e); Jowar (Sorghum)->jowar (555785e5)',
       'Root cause: the land wizard stores the display label in lands.current_crop and leaves current_crop_id NULL. Fix the writer (save-land / lands-api) to store crops.value + crops.id; UI must render crops.label_* from the id.',
       'high', 'resolved'
 WHERE NOT EXISTS (SELECT 1 FROM public.stage_review_queue q WHERE q.issue_type = 'crop_identity_normalized');

-- ── 6. Lands whose crop has NO stage ontology — content gap, not a code defect ──
INSERT INTO public.stage_review_queue (crop_code, issue_type, detail, proposed_resolution, severity, status)
SELECT lower(l.current_crop), 'crop_without_stage_ontology',
       'land=' || l.id::text || ' current_crop="' || l.current_crop || '" has no crop_stage_master rows; the phenology engine cannot serve this land.',
       'Author the crop stage ontology (crop_stage_master + stage_transition_conditions) with a source, or mark the land out of scope for stage-based advisories.',
       'medium', 'open'
  FROM public.lands l
 WHERE l.current_crop IN ('Carrot', 'राजमा', 'pulses', 'Cluster Beans (Vegetable)')
   AND NOT EXISTS (SELECT 1 FROM public.stage_review_queue q
                    WHERE q.issue_type = 'crop_without_stage_ontology' AND q.status = 'open'
                      AND q.detail LIKE 'land=' || l.id::text || '%');

-- ============================================================================
-- VALIDATION (run after apply)
-- ----------------------------------------------------------------------------
-- select left(id::text,8), current_crop, current_crop_id is not null as has_id from lands
--  where id::text similar to '(7329d635|879e229f|358adbb0|033c81da|714f7464|d094ed13|06c8de52|f1a0a6ed|6e06302e|555785e5)%';
--   -> 10 rows with canonical codes
-- select count(*) from lands l where l.current_crop is not null
--    and lower(l.current_crop) not in (select crop_code from crop_stage_master);        -> 6 (carrot x2, राजमा x2, pulses, cluster beans)
-- Expect NO immediate change in resolved-stage count: these 10 lands still lack a sowing
-- date (verified live) — resolution needs the farmer's crop cycle to be recorded.
-- The query that produced the mapping (evidence):
-- with off as (select l.id, l.current_crop from lands l where l.current_crop is not null
--   and lower(l.current_crop) not in (select crop_code from crop_stage_master))
-- select o.current_crop,
--   (select array_agg(distinct cs.canonical_crop) from crop_synonyms cs where cs.is_active and lower(cs.variant_name)=lower(o.current_crop)) synonym_exact,
--   (select array_agg(distinct cs.canonical_crop) from crop_synonyms cs where cs.is_active and lower(cs.variant_name)=lower(split_part(o.current_crop,' (',1))) synonym_base,
--   (select array_agg(distinct c.value) from crops c where c.is_active and (lower(c.label)=lower(o.current_crop) or c.label_mr=o.current_crop or c.label_hi=o.current_crop or lower(c.label)=lower(split_part(o.current_crop,' (',1)))) crops_match
-- from off o;
-- ============================================================================
