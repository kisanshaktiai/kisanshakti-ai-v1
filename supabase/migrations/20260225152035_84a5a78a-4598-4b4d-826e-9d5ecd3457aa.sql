
-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1: Fix critical alias gaps (SMALL_INSECTS_VISIBLE → canonical codes)
-- Root cause of 0-code alias expansion in the pipeline
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO observation_aliases (alias_code, canonical_code) VALUES
  ('SMALL_INSECTS_VISIBLE', 'VISIBLE_INSECTS'),
  ('SMALL_INSECTS_VISIBLE', 'INSECT_PRESENCE_CONFIRMED'),
  ('SMALL_INSECTS_VISIBLE', 'TINY_INSECTS'),
  ('SMALL_INSECTS_VISIBLE', 'APHID_COLONIES_ON_UNDERSIDE'),
  ('SMALL_INSECTS_VISIBLE', 'SMALL_JUMPING_INSECTS'),
  ('SMALL_INSECTS_VISIBLE', 'TINY_INSECTS_IN_LEAF_WHORL'),
  ('SMALL_INSECTS_VISIBLE', 'WHITE_INSECTS'),
  ('INSECTS_VISIBLE', 'VISIBLE_INSECTS'),
  ('INSECTS_VISIBLE', 'INSECT_PRESENCE_CONFIRMED'),
  ('PEST_VISIBLE', 'VISIBLE_INSECTS'),
  ('PEST_VISIBLE', 'INSECT_PRESENCE_CONFIRMED'),
  ('BUGS_ON_PLANT', 'VISIBLE_INSECTS'),
  ('BUGS_ON_PLANT', 'INSECT_PRESENCE_CONFIRMED'),
  ('FLYING_INSECTS', 'FLYING_INSECTS_VISIBLE'),
  ('FLYING_INSECTS', 'VISIBLE_INSECTS')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 5: Fix orphan hypotheses by adding rule mappings
-- 31 hypotheses have no rule mappings → dead reasoning paths
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO hypothesis_rule_mapping (hypothesis_id, rule_id, priority, context_notes)
SELECT 
  h.hypothesis_id,
  dr.rule_id,
  1,
  'Auto-mapped: orphan hypothesis fix'
FROM hypothesis_master h
CROSS JOIN LATERAL (
  SELECT rule_id FROM decision_rules 
  WHERE is_active = true 
    AND crop_code IN ('SC', 'SUGARCANE')
    AND (
      (h.hypothesis_id = 'SC_TOP_BORER' AND condition_code ILIKE '%TOP_BORER%') OR
      (h.hypothesis_id = 'SC_WHITEFLY' AND condition_code ILIKE '%WHITEFLY%') OR
      (h.hypothesis_id = 'SC_NITROGEN_DEFICIENCY' AND condition_code ILIKE '%NITROGEN%') OR
      (h.hypothesis_id = 'SC_EARLY_SHOOT_BORER' AND condition_code ILIKE '%SHOOT_BORER%') OR
      (h.hypothesis_id = 'SC_TOP_SHOOT_BORER' AND condition_code ILIKE '%TOP%BORER%') OR
      (h.hypothesis_id = 'SC_INTERNODE_BORER' AND condition_code ILIKE '%INTERNODE%') OR
      (h.hypothesis_id = 'SC_WHITE_GRUB' AND condition_code ILIKE '%WHITE_GRUB%') OR
      (h.hypothesis_id = 'SC_TERMITES' AND condition_code ILIKE '%TERMITE%') OR
      (h.hypothesis_id = 'SC_RED_ROT' AND condition_code ILIKE '%RED_ROT%') OR
      (h.hypothesis_id = 'SC_SMUT' AND condition_code ILIKE '%SMUT%') OR
      (h.hypothesis_id = 'SC_WILT' AND condition_code ILIKE '%WILT%') OR
      (h.hypothesis_id = 'SC_GRASSY_SHOOT' AND condition_code ILIKE '%GRASSY%') OR
      (h.hypothesis_id = 'SC_N_DEFICIENCY' AND condition_code ILIKE '%NITROGEN%') OR
      (h.hypothesis_id = 'SC_P_DEFICIENCY' AND condition_code ILIKE '%PHOSPHOR%') OR
      (h.hypothesis_id = 'SC_K_DEFICIENCY' AND condition_code ILIKE '%POTASSIUM%') OR
      (h.hypothesis_id = 'SC_ZN_DEFICIENCY' AND condition_code ILIKE '%ZINC%') OR
      (h.hypothesis_id = 'SC_DROUGHT_STRESS' AND condition_code ILIKE '%DROUGHT%') OR
      (h.hypothesis_id = 'SC_WATERLOGGING' AND condition_code ILIKE '%WATERLOG%')
    )
  LIMIT 3
) dr
WHERE h.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM hypothesis_rule_mapping hrm WHERE hrm.hypothesis_id = h.hypothesis_id
  )
ON CONFLICT DO NOTHING;

-- Map orphan rice hypotheses
INSERT INTO hypothesis_rule_mapping (hypothesis_id, rule_id, priority, context_notes)
SELECT 
  h.hypothesis_id,
  dr.rule_id,
  1,
  'Auto-mapped: orphan hypothesis fix'
FROM hypothesis_master h
CROSS JOIN LATERAL (
  SELECT rule_id FROM decision_rules 
  WHERE is_active = true 
    AND crop_code IN ('RC', 'RICE')
    AND (
      (h.hypothesis_id = 'RC_BLAST' AND condition_code ILIKE '%BLAST%') OR
      (h.hypothesis_id = 'RC_BPH' AND condition_code ILIKE '%PLANTHOPPER%')
    )
  LIMIT 3
) dr
WHERE h.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM hypothesis_rule_mapping hrm WHERE hrm.hypothesis_id = h.hypothesis_id
  )
ON CONFLICT DO NOTHING;
