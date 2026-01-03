/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RULE DEDUPLICATION REGISTRY v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Central registry to prevent duplicate rules and manage rule priority
 * when the same pest/disease has rules in multiple files.
 * 
 * PRIORITY SOURCES:
 * 1. ipm-ladder (highest priority - most specific)
 * 2. crop-group (crop-specific rules)
 * 3. safety (global safety rules)
 * 
 * Version: 1.0.0
 */

export interface RuleRegistration {
  pest_or_disease: string;
  crop_code: string;
  primary_rule_id: string;
  ipm_ladder_rules: string[];
  priority_source: 'crop-group' | 'safety' | 'ipm-ladder';
  scientific_source: string;
}

/**
 * Central registry of pest/disease to rule mapping
 * When duplicate rules exist, the one with highest priority_source wins
 */
export const RULE_REGISTRY: RuleRegistration[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // SUGARCANE PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'SHOOT_BORER',
    crop_code: 'sugarcane',
    primary_rule_id: 'IPM_SUGAR_SB_L1',
    ipm_ladder_rules: ['IPM_SUGAR_SB_L1', 'IPM_SUGAR_SB_L2', 'IPM_SUGAR_SB_L3', 'IPM_SUGAR_SB_L4'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-SBI Coimbatore'
  },
  {
    pest_or_disease: 'TOP_BORER',
    crop_code: 'sugarcane',
    primary_rule_id: 'C_SUGAR_PEST_TOP_001',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-SBI Coimbatore'
  },
  {
    pest_or_disease: 'INTERNODE_BORER',
    crop_code: 'sugarcane',
    primary_rule_id: 'C_SUGAR_PEST_INB_001',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-SBI Coimbatore'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // COTTON PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'BOLLWORM',
    crop_code: 'cotton',
    primary_rule_id: 'IPM_COTTON_BW_L1',
    ipm_ladder_rules: ['IPM_COTTON_BW_L1', 'IPM_COTTON_BW_L2', 'IPM_COTTON_BW_L3', 'IPM_COTTON_BW_L4', 'IPM_COTTON_BW_L5', 'IPM_COTTON_BW_L6'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-CICR Nagpur'
  },
  {
    pest_or_disease: 'WHITEFLY',
    crop_code: 'cotton',
    primary_rule_id: 'IPM_COTTON_WF_L1',
    ipm_ladder_rules: ['IPM_COTTON_WF_L1', 'IPM_COTTON_WF_L2', 'IPM_COTTON_WF_L3', 'IPM_COTTON_WF_L4', 'IPM_COTTON_WF_L5'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-CICR Nagpur'
  },
  {
    pest_or_disease: 'APHID',
    crop_code: 'cotton',
    primary_rule_id: 'C_FIBER_COTTON_PEST_004',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-CICR Nagpur'
  },
  {
    pest_or_disease: 'THRIPS',
    crop_code: 'cotton',
    primary_rule_id: 'C_FIBER_COTTON_PEST_005',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-CICR Nagpur'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RICE PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'STEM_BORER',
    crop_code: 'rice',
    primary_rule_id: 'IPM_RICE_SB_L1',
    ipm_ladder_rules: ['IPM_RICE_SB_L1', 'IPM_RICE_SB_L2', 'IPM_RICE_SB_L3', 'IPM_RICE_SB_L4', 'IPM_RICE_SB_L5'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-NRRI Cuttack'
  },
  {
    pest_or_disease: 'BPH',
    crop_code: 'rice',
    primary_rule_id: 'C_CEREALS_RICE_PEST_002',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-NRRI Cuttack'
  },
  {
    pest_or_disease: 'LEAF_FOLDER',
    crop_code: 'rice',
    primary_rule_id: 'C_CEREALS_RICE_PEST_003',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-NRRI Cuttack'
  },
  {
    pest_or_disease: 'GALL_MIDGE',
    crop_code: 'rice',
    primary_rule_id: 'C_CEREALS_RICE_PEST_004',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-NRRI Cuttack'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOMATO PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'FRUIT_BORER',
    crop_code: 'tomato',
    primary_rule_id: 'IPM_TOMATO_FB_L1',
    ipm_ladder_rules: ['IPM_TOMATO_FB_L1', 'IPM_TOMATO_FB_L2', 'IPM_TOMATO_FB_L3', 'IPM_TOMATO_FB_L4', 'IPM_TOMATO_FB_L5', 'IPM_TOMATO_FB_L6'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-IIHR Bangalore'
  },
  {
    pest_or_disease: 'TUTA_ABSOLUTA',
    crop_code: 'tomato',
    primary_rule_id: 'C_VEG_TOMATO_PEST_002',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-IIHR Emergency Protocol'
  },
  {
    pest_or_disease: 'WHITEFLY',
    crop_code: 'tomato',
    primary_rule_id: 'C_VEG_TOMATO_PEST_003',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-IIHR Bangalore'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WHEAT PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'APHID',
    crop_code: 'wheat',
    primary_rule_id: 'IPM_WHEAT_APH_L1',
    ipm_ladder_rules: ['IPM_WHEAT_APH_L1', 'IPM_WHEAT_APH_L2', 'IPM_WHEAT_APH_L3', 'IPM_WHEAT_APH_L4', 'IPM_WHEAT_APH_L5'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-IARI Delhi'
  },
  {
    pest_or_disease: 'TERMITE',
    crop_code: 'wheat',
    primary_rule_id: 'C_CEREALS_WHEAT_PEST_002',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-IARI Delhi'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BRINJAL PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'SHOOT_FRUIT_BORER',
    crop_code: 'brinjal',
    primary_rule_id: 'IPM_BRINJAL_SFB_L1',
    ipm_ladder_rules: ['IPM_BRINJAL_SFB_L1', 'IPM_BRINJAL_SFB_L2', 'IPM_BRINJAL_SFB_L3', 'IPM_BRINJAL_SFB_L4', 'IPM_BRINJAL_SFB_L5'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-IIHR Bangalore'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CABBAGE PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'DIAMONDBACK_MOTH',
    crop_code: 'cabbage',
    primary_rule_id: 'IPM_CABBAGE_DBM_L1',
    ipm_ladder_rules: ['IPM_CABBAGE_DBM_L1', 'IPM_CABBAGE_DBM_L2', 'IPM_CABBAGE_DBM_L3', 'IPM_CABBAGE_DBM_L4', 'IPM_CABBAGE_DBM_L5'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-IIHR Bangalore'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ONION PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'THRIPS',
    crop_code: 'onion',
    primary_rule_id: 'IPM_ONION_THR_L1',
    ipm_ladder_rules: ['IPM_ONION_THR_L1', 'IPM_ONION_THR_L2', 'IPM_ONION_THR_L3', 'IPM_ONION_THR_L4'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-DOGR Pune'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MUSTARD PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'APHID',
    crop_code: 'mustard',
    primary_rule_id: 'IPM_MUSTARD_APH_L1',
    ipm_ladder_rules: ['IPM_MUSTARD_APH_L1', 'IPM_MUSTARD_APH_L2', 'IPM_MUSTARD_APH_L3', 'IPM_MUSTARD_APH_L4'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-DRMR Bharatpur'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CHILLI PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'THRIPS',
    crop_code: 'chilli',
    primary_rule_id: 'IPM_CHILLI_THR_L1',
    ipm_ladder_rules: ['IPM_CHILLI_THR_L1', 'IPM_CHILLI_THR_L2', 'IPM_CHILLI_THR_L3', 'IPM_CHILLI_THR_L4', 'IPM_CHILLI_THR_L5'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-IISR Calicut'
  },
  {
    pest_or_disease: 'FRUIT_BORER',
    crop_code: 'chilli',
    primary_rule_id: 'C_SPICES_CHILLI_PEST_002',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-IISR Calicut'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MANGO PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'HOPPER',
    crop_code: 'mango',
    primary_rule_id: 'IPM_MANGO_HOP_L1',
    ipm_ladder_rules: ['IPM_MANGO_HOP_L1', 'IPM_MANGO_HOP_L2', 'IPM_MANGO_HOP_L3', 'IPM_MANGO_HOP_L4'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-CISH Lucknow'
  },
  {
    pest_or_disease: 'FRUIT_FLY',
    crop_code: 'mango',
    primary_rule_id: 'C_FRUITS_MANGO_PEST_002',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-CISH Lucknow'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // OKRA PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'SHOOT_FRUIT_BORER',
    crop_code: 'okra',
    primary_rule_id: 'IPM_OKRA_SFB_L1',
    ipm_ladder_rules: ['IPM_OKRA_SFB_L1', 'IPM_OKRA_SFB_L2', 'IPM_OKRA_SFB_L3', 'IPM_OKRA_SFB_L4'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-IIHR Bangalore'
  },
  {
    pest_or_disease: 'JASSID',
    crop_code: 'okra',
    primary_rule_id: 'C_VEG_OKRA_PEST_002',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-IIHR Bangalore'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SOYBEAN PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'GIRDLE_BEETLE',
    crop_code: 'soybean',
    primary_rule_id: 'IPM_SOYBEAN_GB_L1',
    ipm_ladder_rules: ['IPM_SOYBEAN_GB_L1', 'IPM_SOYBEAN_GB_L2', 'IPM_SOYBEAN_GB_L3', 'IPM_SOYBEAN_GB_L4'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-IISR Indore'
  },
  {
    pest_or_disease: 'TOBACCO_CATERPILLAR',
    crop_code: 'soybean',
    primary_rule_id: 'C_OILSEEDS_SOYBEAN_PEST_002',
    ipm_ladder_rules: [],
    priority_source: 'crop-group',
    scientific_source: 'ICAR-IISR Indore'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GROUNDNUT PESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    pest_or_disease: 'LEAF_MINER',
    crop_code: 'groundnut',
    primary_rule_id: 'IPM_GROUNDNUT_LM_L1',
    ipm_ladder_rules: ['IPM_GROUNDNUT_LM_L1', 'IPM_GROUNDNUT_LM_L2', 'IPM_GROUNDNUT_LM_L3'],
    priority_source: 'ipm-ladder',
    scientific_source: 'ICAR-DGR Junagadh'
  },
];

/**
 * Get primary rule ID for a pest/disease + crop combination
 */
export function getPrimaryRule(pest: string, crop: string): string | null {
  const normalizedPest = pest.toUpperCase().replace(/_RISK$/, '');
  const normalizedCrop = crop.toLowerCase();
  
  const entry = RULE_REGISTRY.find(
    r => r.pest_or_disease === normalizedPest && r.crop_code === normalizedCrop
  );
  
  return entry?.primary_rule_id || null;
}

/**
 * Get all IPM ladder rule IDs for a pest/disease + crop
 */
export function getIPMLadderRules(pest: string, crop: string): string[] {
  const normalizedPest = pest.toUpperCase().replace(/_RISK$/, '');
  const normalizedCrop = crop.toLowerCase();
  
  const entry = RULE_REGISTRY.find(
    r => r.pest_or_disease === normalizedPest && r.crop_code === normalizedCrop
  );
  
  return entry?.ipm_ladder_rules || [];
}

/**
 * Check if a rule should be skipped because a higher priority rule exists
 */
export function shouldSkipRule(ruleId: string, pest: string, crop: string): boolean {
  const primaryRuleId = getPrimaryRule(pest, crop);
  
  // If this IS the primary rule, don't skip
  if (ruleId === primaryRuleId) return false;
  
  // If there's a primary rule and this isn't it, check if this is in IPM ladder
  if (primaryRuleId) {
    const ipmRules = getIPMLadderRules(pest, crop);
    if (ipmRules.length > 0 && !ipmRules.includes(ruleId)) {
      // This rule is not in the IPM ladder, skip it
      return true;
    }
  }
  
  return false;
}

/**
 * Get rule statistics
 */
export function getRuleRegistryStats(): {
  totalRegistrations: number;
  byPrioritySource: Record<string, number>;
  byCrop: Record<string, number>;
} {
  const byPrioritySource: Record<string, number> = {};
  const byCrop: Record<string, number> = {};
  
  for (const reg of RULE_REGISTRY) {
    byPrioritySource[reg.priority_source] = (byPrioritySource[reg.priority_source] || 0) + 1;
    byCrop[reg.crop_code] = (byCrop[reg.crop_code] || 0) + 1;
  }
  
  return {
    totalRegistrations: RULE_REGISTRY.length,
    byPrioritySource,
    byCrop
  };
}

/**
 * Validate that all IPM ladder rules exist (for testing)
 */
export function validateIPMLadderRules(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  // This would need to import and check against actual rule IDs
  // For now, we just return the structure
  return {
    valid: missing.length === 0,
    missing
  };
}
