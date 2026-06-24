/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION MAPPER - Causes → Actions
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Maps inferred causes to prioritized actions using deterministic rules.
 * Each cause maps to one or more actions with priority and justification.
 * 
 * CRITICAL: No AI calls, no calculations, deterministic only
 * 
 * Version: 1.0.0
 */

import {
  Cause,
  Action,
  ActionUrgency,
  ActionMapping,
  PrioritizedAction,
  FarmingMode
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// ACTION MAPPINGS - Cause to Action relationships
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete mapping of causes to actions
 * Each cause can trigger one or more actions
 */
export const ACTION_MAPPINGS: ActionMapping[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // NUTRIENT DEFICIENCY → ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.NITROGEN_DEFICIENCY,
    action: Action.APPLY_NITROGEN,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.apply_nitrogen.deficiency',
    rule_id: 'A_NPK_N_001',
    scientific_source: 'ICAR-IARI Fertilizer Guide',
    organic_alternative: Action.APPLY_ORGANIC_MANURE
  },
  {
    cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
    action: Action.APPLY_NITROGEN,
    base_priority: 9,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.apply_nitrogen.critical',
    rule_id: 'A_NPK_N_002',
    scientific_source: 'ICAR Critical Stages',
    organic_alternative: Action.FOLIAR_SPRAY
  },
  {
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    action: Action.APPLY_PHOSPHORUS,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.apply_phosphorus.deficiency',
    rule_id: 'A_NPK_P_001',
    scientific_source: 'ICAR-IISS'
  },
  {
    cause: Cause.PHOSPHORUS_DEFICIENCY_CRITICAL,
    action: Action.APPLY_PHOSPHORUS,
    base_priority: 9,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.apply_phosphorus.critical',
    rule_id: 'A_NPK_P_002',
    scientific_source: 'ICAR Critical Stages'
  },
  {
    cause: Cause.POTASSIUM_DEFICIENCY,
    action: Action.APPLY_POTASSIUM,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.apply_potassium.deficiency',
    rule_id: 'A_NPK_K_001',
    scientific_source: 'ICAR General'
  },
  {
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    action: Action.APPLY_POTASSIUM,
    base_priority: 9,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.apply_potassium.critical',
    rule_id: 'A_NPK_K_002',
    scientific_source: 'ICAR Critical Stages'
  },
  {
    cause: Cause.ZINC_DEFICIENCY,
    action: Action.APPLY_ZINC,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.apply_zinc.deficiency',
    rule_id: 'A_MICRO_ZN_001',
    scientific_source: 'ICAR-CRRI Rice Package'
  },
  {
    cause: Cause.SEVERE_NUTRIENT_DEPLETION,
    action: Action.SOIL_TEST,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.soil_test.severe_depletion',
    rule_id: 'A_TEST_001',
    scientific_source: 'ICAR Soil Testing'
  },
  {
    cause: Cause.NUTRIENT_LOCKOUT_ACIDIC,
    action: Action.APPLY_LIME,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_WEEK,
    justification_key: 'action.apply_lime.acidic',
    rule_id: 'A_AMEND_001',
    scientific_source: 'FAO Soil Amendment'
  },
  {
    cause: Cause.NUTRIENT_LOCKOUT_ALKALINE,
    action: Action.APPLY_GYPSUM,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_WEEK,
    justification_key: 'action.apply_gypsum.alkaline',
    rule_id: 'A_AMEND_002',
    scientific_source: 'FAO Soil Amendment'
  },
  {
    cause: Cause.EXCESS_NITROGEN_LODGING,
    action: Action.SKIP_NITROGEN,
    base_priority: 7,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.skip_nitrogen.excess',
    rule_id: 'A_NPK_SKIP_001',
    scientific_source: 'ICAR Lodging Prevention'
  },
  {
    cause: Cause.EXCESS_NITROGEN_DISEASE,
    action: Action.SKIP_NITROGEN,
    base_priority: 7,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.skip_nitrogen.disease_risk',
    rule_id: 'A_NPK_SKIP_002',
    scientific_source: 'ICAR Disease Management'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WATER STRESS → ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.WATER_STRESS_MILD,
    action: Action.IRRIGATE_LIGHT,
    base_priority: 6,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.irrigate_light.mild_stress',
    rule_id: 'A_WATER_001',
    scientific_source: 'FAO Irrigation Guide'
  },
  {
    cause: Cause.WATER_STRESS_MODERATE,
    action: Action.IRRIGATE_IMMEDIATELY,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.irrigate.moderate_stress',
    rule_id: 'A_WATER_002',
    scientific_source: 'FAO Irrigation Guide'
  },
  {
    cause: Cause.WATER_STRESS_CRITICAL,
    action: Action.EMERGENCY_IRRIGATION,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency_irrigation.critical',
    rule_id: 'A_WATER_003',
    scientific_source: 'ICAR Critical Irrigation'
  },
  {
    cause: Cause.WATER_STRESS_WHEAT_CRI,
    action: Action.EMERGENCY_IRRIGATION,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency_irrigation.wheat_cri',
    rule_id: 'A_WATER_WHEAT_001',
    scientific_source: 'ICAR-IARI Wheat Package'
  },
  {
    cause: Cause.WATER_STRESS_RICE_TRANSPLANTING,
    action: Action.EMERGENCY_IRRIGATION,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency_irrigation.rice_transplanting',
    rule_id: 'A_WATER_RICE_001',
    scientific_source: 'ICAR-CRRI Rice Package'
  },
  {
    cause: Cause.WATER_STRESS_COTTON_BOLL,
    action: Action.IRRIGATE_IMMEDIATELY,
    base_priority: 9,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.irrigate.cotton_boll',
    rule_id: 'A_WATER_COTTON_001',
    scientific_source: 'ICAR-CICR Cotton Package'
  },
  {
    cause: Cause.DROUGHT_STRESS,
    action: Action.EMERGENCY_IRRIGATION,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency_irrigation.drought',
    rule_id: 'A_WATER_004',
    scientific_source: 'ICAR-CRIDA Drought Management'
  },
  {
    cause: Cause.WATERLOGGING,
    action: Action.DRAIN_FIELD,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.drain.waterlogging',
    rule_id: 'A_DRAIN_001',
    scientific_source: 'FAO Drainage Guide'
  },
  {
    cause: Cause.WATERLOGGING_SEVERE,
    action: Action.DRAIN_EXCESS_WATER,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.drain.severe',
    rule_id: 'A_DRAIN_002',
    scientific_source: 'FAO Emergency Drainage'
  },
  {
    cause: Cause.FLOOD_STRESS,
    action: Action.DRAIN_EXCESS_WATER,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.drain.flood',
    rule_id: 'A_DRAIN_003',
    scientific_source: 'FAO Flood Response'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPERATURE STRESS → ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.HEAT_STRESS,
    action: Action.LIGHT_IRRIGATION_COOLING,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.cooling_irrigation.heat',
    rule_id: 'A_TEMP_001',
    scientific_source: 'FAO Heat Stress Management'
  },
  {
    cause: Cause.HEAT_STRESS_SEVERE,
    action: Action.SHADE_COVER,
    base_priority: 8,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.shade.severe_heat',
    rule_id: 'A_TEMP_002',
    scientific_source: 'ICAR Heat Stress Management'
  },
  {
    cause: Cause.COLD_STRESS,
    action: Action.APPLY_MULCH,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.mulch.cold',
    rule_id: 'A_TEMP_003',
    scientific_source: 'FAO Cold Protection'
  },
  {
    cause: Cause.FROST_DAMAGE_RISK,
    action: Action.FROST_PROTECTION,
    base_priority: 9,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.frost_protection',
    rule_id: 'A_TEMP_004',
    scientific_source: 'ICAR Frost Protection'
  },
  {
    cause: Cause.TERMINAL_HEAT_WHEAT,
    action: Action.LIGHT_IRRIGATION_COOLING,
    base_priority: 8,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.cooling_irrigation.terminal_heat',
    rule_id: 'A_TEMP_WHEAT_001',
    scientific_source: 'ICAR-IARI Wheat Heat Management'
  },
  {
    cause: Cause.SPIKELET_STERILITY_RICE,
    action: Action.DELAY_SPRAY,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.delay_spray.spikelet',
    rule_id: 'A_TEMP_RICE_001',
    scientific_source: 'ICAR-CRRI Rice Management'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE RISK → ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.RICE_BLAST_RISK,
    action: Action.APPLY_FUNGICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.fungicide.blast',
    rule_id: 'A_DIS_RICE_001',
    scientific_source: 'ICAR-CRRI Disease Management',
    organic_alternative: Action.APPLY_TRICHODERMA
  },
  {
    cause: Cause.RICE_BACTERIAL_BLIGHT_RISK,
    action: Action.SKIP_NITROGEN,
    base_priority: 7,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.skip_nitrogen.blight',
    rule_id: 'A_DIS_RICE_002',
    scientific_source: 'ICAR-CRRI Disease Management'
  },
  {
    cause: Cause.WHEAT_RUST_RISK,
    action: Action.APPLY_FUNGICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.fungicide.rust',
    rule_id: 'A_DIS_WHEAT_001',
    scientific_source: 'ICAR-IARI Wheat Disease Management',
    organic_alternative: Action.APPLY_NEEM_OIL
  },
  {
    cause: Cause.LATE_BLIGHT_RISK,
    action: Action.APPLY_FUNGICIDE,
    base_priority: 9,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.fungicide.late_blight',
    rule_id: 'A_DIS_VEG_001',
    scientific_source: 'ICAR-IIHR Vegetable Disease',
    organic_alternative: Action.APPLY_TRICHODERMA
  },
  {
    cause: Cause.EARLY_BLIGHT_RISK,
    action: Action.APPLY_FUNGICIDE,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.fungicide.early_blight',
    rule_id: 'A_DIS_VEG_002',
    scientific_source: 'ICAR-IIHR Vegetable Disease',
    organic_alternative: Action.APPLY_NEEM_OIL
  },
  {
    cause: Cause.POWDERY_MILDEW_RISK,
    action: Action.APPLY_FUNGICIDE,
    base_priority: 6,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.fungicide.powdery_mildew',
    rule_id: 'A_DIS_GEN_001',
    scientific_source: 'ICAR IPM',
    organic_alternative: Action.APPLY_NEEM_OIL
  },
  {
    cause: Cause.ROOT_ROT_RISK,
    action: Action.DRAIN_FIELD,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.drain.root_rot',
    rule_id: 'A_DIS_GEN_002',
    scientific_source: 'ICAR Disease Management'
  },
  {
    cause: Cause.DAMPING_OFF_RISK,
    action: Action.APPLY_TRICHODERMA,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.trichoderma.damping_off',
    rule_id: 'A_DIS_GEN_003',
    scientific_source: 'ICAR Seed Treatment'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PEST RISK → ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.BOLLWORM_RISK,
    action: Action.APPLY_BT_SPRAY,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.bt_spray.bollworm',
    rule_id: 'A_PEST_COTTON_001',
    scientific_source: 'ICAR-CICR IPM',
    organic_alternative: Action.RELEASE_BIOAGENT
  },
  {
    cause: Cause.APHID_RISK,
    action: Action.APPLY_NEEM_OIL,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.neem.aphid',
    rule_id: 'A_PEST_GEN_001',
    scientific_source: 'ICAR IPM'
  },
  {
    cause: Cause.STEM_BORER_RISK,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.insecticide.stem_borer',
    rule_id: 'A_PEST_RICE_001',
    scientific_source: 'ICAR-CRRI IPM',
    organic_alternative: Action.RELEASE_BIOAGENT
  },
  {
    cause: Cause.WHITEFLY_RISK,
    action: Action.INSTALL_TRAPS,
    base_priority: 6,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.traps.whitefly',
    rule_id: 'A_PEST_GEN_002',
    scientific_source: 'ICAR-CICR Whitefly Management'
  },
  {
    cause: Cause.THRIPS_RISK,
    action: Action.APPLY_NEEM_OIL,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.neem.thrips',
    rule_id: 'A_PEST_VEG_001',
    scientific_source: 'ICAR-DOGR Onion IPM'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SUGARCANE SHOOT BORER & IPM LADDER → ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.SHOOT_BORER_RISK,
    action: Action.RELEASE_BIOAGENT,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.bioagent.shoot_borer',
    rule_id: 'A_PEST_SUGAR_001',
    scientific_source: 'ICAR-SBI Coimbatore',
    organic_alternative: Action.INSTALL_PHEROMONE_TRAPS
  },
  {
    cause: Cause.FRUIT_BORER_RISK,
    action: Action.APPLY_BT_SPRAY,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.bt_spray.fruit_borer',
    rule_id: 'A_PEST_VEG_002',
    scientific_source: 'ICAR-IIHR',
    organic_alternative: Action.RELEASE_BIOAGENT
  },

  // ─────────────────────────────────────────────────────────────────────────
  // IPM LADDER ACTIONS - SUGARCANE SHOOT BORER (L1-L4)
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.IPM_SUGARCANE_SHOOT_BORER_L1,
    action: Action.CULTURAL_CONTROL,
    base_priority: 5,
    urgency: ActionUrgency.WITHIN_WEEK,
    justification_key: 'action.cultural.shoot_borer_l1',
    rule_id: 'A_IPM_SUGAR_SB_L1',
    scientific_source: 'ICAR-SBI Coimbatore'
  },
  {
    cause: Cause.IPM_SUGARCANE_SHOOT_BORER_L2,
    action: Action.INSTALL_PHEROMONE_TRAPS,
    base_priority: 6,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.traps.shoot_borer_l2',
    rule_id: 'A_IPM_SUGAR_SB_L2',
    scientific_source: 'SBI Monitoring Protocol'
  },
  {
    cause: Cause.IPM_SUGARCANE_SHOOT_BORER_L3,
    action: Action.RELEASE_BIOAGENT,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.bioagent.shoot_borer_l3',
    rule_id: 'A_IPM_SUGAR_SB_L3',
    scientific_source: 'ICAR-NBAII Sugarcane Biocontrol'
  },
  {
    cause: Cause.IPM_SUGARCANE_SHOOT_BORER_L4,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.insecticide.shoot_borer_l4',
    rule_id: 'A_IPM_SUGAR_SB_L4',
    scientific_source: 'IRAC + SBI'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // IPM LADDER ACTIONS - COTTON BOLLWORM (L1-L4)
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.IPM_COTTON_BOLLWORM_L1,
    action: Action.CULTURAL_CONTROL,
    base_priority: 5,
    urgency: ActionUrgency.WITHIN_WEEK,
    justification_key: 'action.cultural.bollworm_l1',
    rule_id: 'A_IPM_COTTON_BW_L1',
    scientific_source: 'CICR Nagpur'
  },
  {
    cause: Cause.IPM_COTTON_BOLLWORM_L2,
    action: Action.INSTALL_PHEROMONE_TRAPS,
    base_priority: 6,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.traps.bollworm_l2',
    rule_id: 'A_IPM_COTTON_BW_L2',
    scientific_source: 'CICR IPM Protocol'
  },
  {
    cause: Cause.IPM_COTTON_BOLLWORM_L3,
    action: Action.APPLY_BT_SPRAY,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.bt.bollworm_l3',
    rule_id: 'A_IPM_COTTON_BW_L3',
    scientific_source: 'ICAR-NBAII'
  },
  {
    cause: Cause.IPM_COTTON_BOLLWORM_L4,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.insecticide.bollworm_l4',
    rule_id: 'A_IPM_COTTON_BW_L4',
    scientific_source: 'IRAC + CICR'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // IPM LADDER ACTIONS - RICE STEM BORER (L1-L4)
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.IPM_RICE_STEM_BORER_L1,
    action: Action.CULTURAL_CONTROL,
    base_priority: 5,
    urgency: ActionUrgency.WITHIN_WEEK,
    justification_key: 'action.cultural.stem_borer_l1',
    rule_id: 'A_IPM_RICE_SB_L1',
    scientific_source: 'ICAR-NRRI Cuttack'
  },
  {
    cause: Cause.IPM_RICE_STEM_BORER_L2,
    action: Action.INSTALL_PHEROMONE_TRAPS,
    base_priority: 6,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.traps.stem_borer_l2',
    rule_id: 'A_IPM_RICE_SB_L2',
    scientific_source: 'NRRI Monitoring'
  },
  {
    cause: Cause.IPM_RICE_STEM_BORER_L3,
    action: Action.RELEASE_BIOAGENT,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.bioagent.stem_borer_l3',
    rule_id: 'A_IPM_RICE_SB_L3',
    scientific_source: 'ICAR-NBAII'
  },
  {
    cause: Cause.IPM_RICE_STEM_BORER_L4,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.insecticide.stem_borer_l4',
    rule_id: 'A_IPM_RICE_SB_L4',
    scientific_source: 'IRAC + NRRI'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // IPM LADDER ACTIONS - TOMATO FRUIT BORER (L1-L4)
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L1,
    action: Action.CULTURAL_CONTROL,
    base_priority: 5,
    urgency: ActionUrgency.WITHIN_WEEK,
    justification_key: 'action.cultural.fruit_borer_l1',
    rule_id: 'A_IPM_TOMATO_FB_L1',
    scientific_source: 'ICAR-IIHR Bangalore'
  },
  {
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L2,
    action: Action.INSTALL_PHEROMONE_TRAPS,
    base_priority: 6,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.traps.fruit_borer_l2',
    rule_id: 'A_IPM_TOMATO_FB_L2',
    scientific_source: 'IIHR IPM'
  },
  {
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L3,
    action: Action.APPLY_BT_SPRAY,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.bt.fruit_borer_l3',
    rule_id: 'A_IPM_TOMATO_FB_L3',
    scientific_source: 'IIHR Biocontrol'
  },
  {
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L4,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.insecticide.fruit_borer_l4',
    rule_id: 'A_IPM_TOMATO_FB_L4',
    scientific_source: 'ICAR-IIHR'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // IPM LADDER ACTIONS - MUSTARD APHID (L1-L4)
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.IPM_MUSTARD_APHID_L1,
    action: Action.CULTURAL_CONTROL,
    base_priority: 5,
    urgency: ActionUrgency.WITHIN_WEEK,
    justification_key: 'action.cultural.aphid_l1',
    rule_id: 'A_IPM_MUSTARD_APH_L1',
    scientific_source: 'DRMR Bharatpur'
  },
  {
    cause: Cause.IPM_MUSTARD_APHID_L2,
    action: Action.APPLY_NEEM_OIL,
    base_priority: 6,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.neem.aphid_l2',
    rule_id: 'A_IPM_MUSTARD_APH_L2',
    scientific_source: 'DRMR IPM'
  },
  {
    cause: Cause.IPM_MUSTARD_APHID_L3,
    action: Action.RELEASE_BIOAGENT,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.bioagent.aphid_l3',
    rule_id: 'A_IPM_MUSTARD_APH_L3',
    scientific_source: 'ICAR-NBAII'
  },
  {
    cause: Cause.IPM_MUSTARD_APHID_L4,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.insecticide.aphid_l4',
    rule_id: 'A_IPM_MUSTARD_APH_L4',
    scientific_source: 'DRMR'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // IPM LADDER ACTIONS - ONION THRIPS (L1-L4)
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.IPM_ONION_THRIPS_L1,
    action: Action.CULTURAL_CONTROL,
    base_priority: 5,
    urgency: ActionUrgency.WITHIN_WEEK,
    justification_key: 'action.cultural.thrips_l1',
    rule_id: 'A_IPM_ONION_THR_L1',
    scientific_source: 'ICAR-DOGR Pune'
  },
  {
    cause: Cause.IPM_ONION_THRIPS_L2,
    action: Action.APPLY_NEEM_OIL,
    base_priority: 6,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.neem.thrips_l2',
    rule_id: 'A_IPM_ONION_THR_L2',
    scientific_source: 'DOGR IPM'
  },
  {
    cause: Cause.IPM_ONION_THRIPS_L3,
    action: Action.APPLY_BT_SPRAY,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.bt.thrips_l3',
    rule_id: 'A_IPM_ONION_THR_L3',
    scientific_source: 'DOGR Biocontrol'
  },
  {
    cause: Cause.IPM_ONION_THRIPS_L4,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.insecticide.thrips_l4',
    rule_id: 'A_IPM_ONION_THR_L4',
    scientific_source: 'ICAR-DOGR'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WEED → ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.WEED_EMERGENCE_WINDOW,
    action: Action.MECHANICAL_WEEDING,
    base_priority: 6,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.weeding.emergence_window',
    rule_id: 'A_WEED_001',
    scientific_source: 'ICAR Weed Management',
    lower_cost_alternative: Action.HAND_WEEDING
  },
  {
    cause: Cause.WEED_COMPETITION_CRITICAL,
    action: Action.MECHANICAL_WEEDING,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.weeding.critical',
    rule_id: 'A_WEED_002',
    scientific_source: 'ICAR Weed Management'
  },
  {
    cause: Cause.HERBICIDE_WINDOW_CLOSING,
    action: Action.HERBICIDE_POST_EMERGENCE,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.herbicide.window_closing',
    rule_id: 'A_WEED_003',
    scientific_source: 'ICAR Herbicide Application',
    organic_alternative: Action.MECHANICAL_WEEDING
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTHY → ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.OPTIMAL_GROWTH,
    action: Action.CONTINUE_CURRENT,
    base_priority: 3,
    urgency: ActionUrgency.FLEXIBLE,
    justification_key: 'action.continue.optimal',
    rule_id: 'A_HEALTHY_001',
    scientific_source: 'NASA/ICAR'
  },
  {
    cause: Cause.RECOVERY_TREND,
    action: Action.MONITOR_CLOSELY,
    base_priority: 4,
    urgency: ActionUrgency.WITHIN_WEEK,
    justification_key: 'action.monitor.recovery',
    rule_id: 'A_HEALTHY_002',
    scientific_source: 'ICAR Recovery Monitoring'
  },
  {
    cause: Cause.YIELD_POTENTIAL_HIGH,
    action: Action.CONTINUE_CURRENT,
    base_priority: 3,
    urgency: ActionUrgency.FLEXIBLE,
    justification_key: 'action.continue.high_yield',
    rule_id: 'A_HEALTHY_003',
    scientific_source: 'ICAR Yield Optimization'
  },
  {
    cause: Cause.HARVEST_READY,
    action: Action.EARLY_HARVEST,
    base_priority: 6,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.harvest.ready',
    rule_id: 'A_HARVEST_001',
    scientific_source: 'ICAR Harvest Management'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL → ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.CROP_FAILURE_IMMINENT,
    action: Action.CONSULT_EXPERT,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.consult.failure_imminent',
    rule_id: 'A_CRIT_001',
    scientific_source: 'FAO Emergency Response'
  },
  {
    cause: Cause.COMPOUND_STRESS,
    action: Action.EMERGENCY_IRRIGATION,
    base_priority: 9,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency.compound_stress',
    rule_id: 'A_CRIT_002',
    scientific_source: 'ICAR Stress Management'
  },
  {
    cause: Cause.UNCERTAIN_CRITICAL,
    action: Action.CONSULT_EXPERT,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.consult.uncertain',
    rule_id: 'A_CRIT_003',
    scientific_source: 'System'
  },
  {
    cause: Cause.SALVAGE_HARVEST_NEEDED,
    action: Action.SALVAGE_HARVEST,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.salvage.harvest',
    rule_id: 'A_CRIT_004',
    scientific_source: 'FAO Salvage Guidelines'
  },
  {
    cause: Cause.TOTAL_CROP_LOSS_RISK,
    action: Action.INSURANCE_CLAIM,
    base_priority: 9,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.insurance.total_loss',
    rule_id: 'A_CRIT_005',
    scientific_source: 'PMFBY Guidelines'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // IPM LADDER L5/L6 ACTIONS - SELECTIVE & EMERGENCY CHEMICAL (Phase 3)
  // ─────────────────────────────────────────────────────────────────────────
  // TOMATO FRUIT BORER L5/L6
  {
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L5,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.fruit_borer_l5',
    rule_id: 'A_IPM_TOMATO_FB_L5',
    scientific_source: 'IRAC + ICAR-IIHR',
    organic_alternative: Action.APPLY_BT_SPRAY
  },
  {
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L6,
    action: Action.EMERGENCY_SPRAY,
    base_priority: 9,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency_insecticide.fruit_borer_l6',
    rule_id: 'A_IPM_TOMATO_FB_L6',
    scientific_source: 'ICAR Emergency Protocol'
  },

  // COTTON BOLLWORM L5/L6
  {
    cause: Cause.IPM_COTTON_BOLLWORM_L5,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.bollworm_l5',
    rule_id: 'A_IPM_COTTON_BW_L5',
    scientific_source: 'IRAC + ICAR-CICR',
    organic_alternative: Action.APPLY_BT_SPRAY
  },
  {
    cause: Cause.IPM_COTTON_BOLLWORM_L6,
    action: Action.EMERGENCY_SPRAY,
    base_priority: 9,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency_insecticide.bollworm_l6',
    rule_id: 'A_IPM_COTTON_BW_L6',
    scientific_source: 'CICR Emergency Protocol'
  },

  // COTTON WHITEFLY L5
  {
    cause: Cause.IPM_COTTON_WHITEFLY_L5,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.whitefly_l5',
    rule_id: 'A_IPM_COTTON_WF_L5',
    scientific_source: 'IRAC + CICR',
    organic_alternative: Action.APPLY_NEEM_OIL
  },

  // RICE STEM BORER L5
  {
    cause: Cause.IPM_RICE_STEM_BORER_L5,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.stem_borer_l5',
    rule_id: 'A_IPM_RICE_SB_L5',
    scientific_source: 'IRAC + ICAR-NRRI',
    organic_alternative: Action.RELEASE_BIOAGENT
  },

  // WHEAT APHID L5
  {
    cause: Cause.IPM_WHEAT_APHID_L5,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.aphid_l5',
    rule_id: 'A_IPM_WHEAT_APH_L5',
    scientific_source: 'IRAC + ICAR-IARI',
    organic_alternative: Action.APPLY_NEEM_OIL
  },

  // BRINJAL SHOOT FRUIT BORER L5
  {
    cause: Cause.IPM_BRINJAL_SHOOT_FRUIT_BORER_L5,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.brinjal_borer_l5',
    rule_id: 'A_IPM_BRINJAL_SFB_L5',
    scientific_source: 'ICAR-IIHR',
    organic_alternative: Action.APPLY_BT_SPRAY
  },

  // CABBAGE DIAMONDBACK MOTH L5
  {
    cause: Cause.IPM_CABBAGE_DIAMONDBACK_MOTH_L5,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.dbm_l5',
    rule_id: 'A_IPM_CABBAGE_DBM_L5',
    scientific_source: 'ICAR-IIHR',
    organic_alternative: Action.APPLY_BT_SPRAY
  },

  // OKRA SHOOT FRUIT BORER L4
  {
    cause: Cause.IPM_OKRA_SHOOT_FRUIT_BORER_L4,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.okra_borer_l4',
    rule_id: 'A_IPM_OKRA_SFB_L4',
    scientific_source: 'ICAR-IIHR',
    organic_alternative: Action.APPLY_BT_SPRAY
  },

  // CHILLI THRIPS L5
  {
    cause: Cause.IPM_CHILLI_THRIPS_L5,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.chilli_thrips_l5',
    rule_id: 'A_IPM_CHILLI_THR_L5',
    scientific_source: 'ICAR-IISR',
    organic_alternative: Action.APPLY_NEEM_OIL
  },

  // MANGO HOPPER L4
  {
    cause: Cause.IPM_MANGO_HOPPER_L4,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.mango_hopper_l4',
    rule_id: 'A_IPM_MANGO_HOP_L4',
    scientific_source: 'ICAR-CISH',
    organic_alternative: Action.APPLY_NEEM_OIL
  },

  // SOYBEAN GIRDLE BEETLE L4
  {
    cause: Cause.IPM_SOYBEAN_GIRDLE_BEETLE_L4,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.girdle_beetle_l4',
    rule_id: 'A_IPM_SOYBEAN_GB_L4',
    scientific_source: 'ICAR-IISR',
    organic_alternative: Action.APPLY_NEEM_OIL
  },

  // GROUNDNUT LEAF MINER L3
  {
    cause: Cause.IPM_GROUNDNUT_LEAF_MINER_L3,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.selective_insecticide.leaf_miner_l3',
    rule_id: 'A_IPM_GROUNDNUT_LM_L3',
    scientific_source: 'ICAR-DGR',
    organic_alternative: Action.APPLY_NEEM_OIL
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EMERGENCY ACTIONS - Weather Events & Pest Outbreaks (Phase 9)
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.LOCUST_SWARM_EMERGENCY,
    action: Action.EMERGENCY_SPRAY,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency.locust',
    rule_id: 'A_EMERG_LOCUST_001',
    scientific_source: 'FAO Desert Locust Guidelines'
  },
  {
    cause: Cause.ARMYWORM_INVASION,
    action: Action.APPLY_INSECTICIDE,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency.armyworm',
    rule_id: 'A_EMERG_FAW_001',
    scientific_source: 'FAO Fall Armyworm Protocol',
    organic_alternative: Action.APPLY_BT_SPRAY
  },
  {
    cause: Cause.HAILSTORM_EMERGENCY,
    action: Action.APPLY_FUNGICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.post_hail.fungicide',
    rule_id: 'A_EMERG_HAIL_001',
    scientific_source: 'ICAR Post-Hail Management',
    organic_alternative: Action.APPLY_TRICHODERMA
  },
  {
    cause: Cause.CYCLONE_EMERGENCY,
    action: Action.DRAIN_EXCESS_WATER,
    base_priority: 9,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.post_cyclone.drain',
    rule_id: 'A_EMERG_CYCLONE_001',
    scientific_source: 'ICAR Cyclone Recovery'
  },
  {
    cause: Cause.DROUGHT_EMERGENCY,
    action: Action.EMERGENCY_IRRIGATION,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency.drought',
    rule_id: 'A_EMERG_DROUGHT_001',
    scientific_source: 'ICAR-CRIDA Drought Protocol'
  },
  {
    cause: Cause.FLOOD_EMERGENCY,
    action: Action.DRAIN_EXCESS_WATER,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency.flood',
    rule_id: 'A_EMERG_FLOOD_001',
    scientific_source: 'ICAR Flood Recovery'
  },
  {
    cause: Cause.FROST_EMERGENCY,
    action: Action.FROST_PROTECTION,
    base_priority: 9,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency.frost',
    rule_id: 'A_EMERG_FROST_001',
    scientific_source: 'ICAR Frost Protection'
  },
  {
    cause: Cause.HEAT_WAVE_EMERGENCY,
    action: Action.LIGHT_IRRIGATION_COOLING,
    base_priority: 9,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency.heat_wave',
    rule_id: 'A_EMERG_HEAT_001',
    scientific_source: 'ICAR Heat Wave Protocol'
  },
  {
    cause: Cause.EMERGENCY_CHEMICAL_AUTHORIZED,
    action: Action.EMERGENCY_SPRAY,
    base_priority: 10,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.emergency.chemical_authorized',
    rule_id: 'A_EMERG_CHEM_001',
    scientific_source: 'State Agriculture Emergency Protocol'
  },
  {
    cause: Cause.SALVAGE_HARVEST_RECOMMENDED,
    action: Action.SALVAGE_HARVEST,
    base_priority: 9,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.salvage.recommended',
    rule_id: 'A_HARVEST_SALVAGE_001',
    scientific_source: 'ICAR Salvage Harvest'
  },
  {
    cause: Cause.INSURANCE_CLAIM_ELIGIBLE,
    action: Action.INSURANCE_CLAIM,
    base_priority: 7,
    urgency: ActionUrgency.WITHIN_3DAYS,
    justification_key: 'action.insurance.eligible',
    rule_id: 'A_INSURE_001',
    scientific_source: 'PMFBY Guidelines'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SUGARCANE-SPECIFIC DISEASE ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.RED_ROT_SUGARCANE_RISK,
    action: Action.APPLY_FUNGICIDE,
    base_priority: 9,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.fungicide.red_rot',
    rule_id: 'A_DIS_SUGAR_001',
    scientific_source: 'ICAR-SBI Coimbatore',
    organic_alternative: Action.APPLY_TRICHODERMA
  },
  {
    cause: Cause.RED_ROT_SUGARCANE,
    action: Action.APPLY_FUNGICIDE,
    base_priority: 9,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.fungicide.red_rot',
    rule_id: 'A_DIS_SUGAR_001B',
    scientific_source: 'ICAR-SBI Coimbatore',
    organic_alternative: Action.APPLY_TRICHODERMA
  },
  {
    cause: Cause.SMUT_SUGARCANE,
    action: Action.REMOVE_AFFECTED_PLANTS,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.remove.smut',
    rule_id: 'A_DIS_SUGAR_002',
    scientific_source: 'ICAR-SBI Coimbatore'
  },
  {
    cause: Cause.WILT_SUGARCANE,
    action: Action.DRAIN_FIELD,
    base_priority: 9,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.drain.wilt',
    rule_id: 'A_DIS_SUGAR_003',
    scientific_source: 'ICAR-SBI Coimbatore'
  },
  {
    cause: Cause.GSD_SUGARCANE,
    action: Action.REMOVE_AFFECTED_PLANTS,
    base_priority: 9,
    urgency: ActionUrgency.IMMEDIATE,
    justification_key: 'action.remove.grassy_shoot',
    rule_id: 'A_DIS_SUGAR_004',
    scientific_source: 'ICAR-SBI Coimbatore'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ONION/VEGETABLE DISEASE ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    cause: Cause.PURPLE_BLOTCH_RISK,
    action: Action.APPLY_FUNGICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.fungicide.purple_blotch',
    rule_id: 'A_DIS_ONION_001',
    scientific_source: 'ICAR-DOGR Pune',
    organic_alternative: Action.APPLY_TRICHODERMA
  },
  {
    cause: Cause.DOWNY_MILDEW_RISK,
    action: Action.APPLY_FUNGICIDE,
    base_priority: 8,
    urgency: ActionUrgency.WITHIN_24H,
    justification_key: 'action.fungicide.downy_mildew',
    rule_id: 'A_DIS_VEG_003',
    scientific_source: 'ICAR-IIHR',
    organic_alternative: Action.APPLY_TRICHODERMA
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIC COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Actions that are compatible with organic farming
 */
const ORGANIC_COMPATIBLE_ACTIONS: Action[] = [
  Action.APPLY_ORGANIC_MANURE,
  Action.APPLY_NEEM_OIL,
  Action.APPLY_BIO_CONTROL,
  Action.APPLY_BT_SPRAY,
  Action.APPLY_TRICHODERMA,
  Action.RELEASE_BIOAGENT,
  Action.MECHANICAL_WEEDING,
  Action.HAND_WEEDING,
  Action.APPLY_MULCH,
  Action.STALE_SEEDBED,
  Action.INSTALL_TRAPS,
  Action.INSTALL_PHEROMONE_TRAPS,
  Action.SHADE_COVER,
  Action.FROST_PROTECTION,
  Action.WINDBREAK,
  Action.DRAIN_FIELD,
  Action.DRAIN_EXCESS_WATER,
  Action.IRRIGATE_IMMEDIATELY,
  Action.IRRIGATE_LIGHT,
  Action.IRRIGATE_HEAVY,
  Action.EMERGENCY_IRRIGATION,
  Action.LIGHT_IRRIGATION_COOLING,
  Action.MONITOR_CLOSELY,
  Action.WAIT_AND_WATCH,
  Action.CONSULT_EXPERT,
  Action.SOIL_TEST,
  Action.TISSUE_TEST,
  Action.SCOUT_FIELD,
  Action.CONTINUE_CURRENT,
  Action.EARLY_HARVEST,
  Action.SALVAGE_HARVEST,
  Action.FOLIAR_SPRAY, // Organic-allowed foliar sprays
  Action.APPLY_LIME,
  Action.APPLY_GYPSUM
];

/**
 * Check if an action is compatible with organic farming
 */
export function isOrganicCompatible(action: Action): boolean {
  return ORGANIC_COMPATIBLE_ACTIONS.includes(action);
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE TO ACTION MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map inferred causes to prioritized actions
 * 
 * @param causes - Array of inferred causes
 * @param farmingMode - Farming mode for filtering
 * @returns Array of prioritized actions
 */
export function mapCausesToActions(
  causes: Cause[],
  farmingMode: FarmingMode
): PrioritizedAction[] {
  const actions: PrioritizedAction[] = [];

  for (const cause of causes) {
    // Find all mappings for this cause
    const mappings = ACTION_MAPPINGS.filter(m => m.cause === cause);

    for (const mapping of mappings) {
      let selectedAction = mapping.action;
      let justificationKey = mapping.justification_key;

      // For organic farming, substitute with organic alternative if available
      if (farmingMode === FarmingMode.ORGANIC_ONLY) {
        if (!isOrganicCompatible(mapping.action)) {
          if (mapping.organic_alternative) {
            selectedAction = mapping.organic_alternative;
            justificationKey = `${mapping.justification_key}.organic`;
          } else {
            // Skip this action for organic farming
            continue;
          }
        }
      }

      actions.push({
        action: selectedAction,
        priority: mapping.base_priority,
        reason: cause,
        rule_id: mapping.rule_id,
        justification_key: justificationKey,
        scientific_source: mapping.scientific_source,
        urgency: mapping.urgency,
        organic_alternative: mapping.organic_alternative,
        lower_cost_alternative: mapping.lower_cost_alternative
      });
    }
  }

  // Sort by priority (highest first)
  return actions.sort((a, b) => b.priority - a.priority);
}

/**
 * Get action description for UI
 */
export function getActionDescription(action: Action): {
  label: string;
  labelKey: string;
  category: string;
} {
  const descriptions: Record<Action, { label: string; labelKey: string; category: string }> = {
    [Action.APPLY_NITROGEN]: { label: 'Apply Nitrogen Fertilizer', labelKey: 'action.apply_nitrogen', category: 'nutrient' },
    [Action.APPLY_PHOSPHORUS]: { label: 'Apply Phosphorus', labelKey: 'action.apply_phosphorus', category: 'nutrient' },
    [Action.APPLY_POTASSIUM]: { label: 'Apply Potassium', labelKey: 'action.apply_potassium', category: 'nutrient' },
    [Action.APPLY_ZINC]: { label: 'Apply Zinc', labelKey: 'action.apply_zinc', category: 'nutrient' },
    [Action.APPLY_GYPSUM]: { label: 'Apply Gypsum', labelKey: 'action.apply_gypsum', category: 'nutrient' },
    [Action.APPLY_LIME]: { label: 'Apply Lime', labelKey: 'action.apply_lime', category: 'nutrient' },
    [Action.APPLY_MICRONUTRIENTS]: { label: 'Apply Micronutrients', labelKey: 'action.apply_micronutrients', category: 'nutrient' },
    [Action.APPLY_ORGANIC_MANURE]: { label: 'Apply Organic Manure', labelKey: 'action.apply_organic_manure', category: 'nutrient' },
    [Action.SKIP_NITROGEN]: { label: 'Skip Nitrogen Application', labelKey: 'action.skip_nitrogen', category: 'nutrient' },
    [Action.FOLIAR_SPRAY]: { label: 'Apply Foliar Spray', labelKey: 'action.foliar_spray', category: 'nutrient' },
    [Action.IRRIGATE_IMMEDIATELY]: { label: 'Irrigate Immediately', labelKey: 'action.irrigate_immediately', category: 'water' },
    [Action.IRRIGATE_LIGHT]: { label: 'Apply Light Irrigation', labelKey: 'action.irrigate_light', category: 'water' },
    [Action.IRRIGATE_HEAVY]: { label: 'Apply Heavy Irrigation', labelKey: 'action.irrigate_heavy', category: 'water' },
    [Action.DELAY_IRRIGATION]: { label: 'Delay Irrigation', labelKey: 'action.delay_irrigation', category: 'water' },
    [Action.SKIP_IRRIGATION]: { label: 'Skip Irrigation', labelKey: 'action.skip_irrigation', category: 'water' },
    [Action.DRAIN_FIELD]: { label: 'Drain Field', labelKey: 'action.drain_field', category: 'water' },
    [Action.DRAIN_EXCESS_WATER]: { label: 'Drain Excess Water', labelKey: 'action.drain_excess_water', category: 'water' },
    [Action.APPLY_FUNGICIDE]: { label: 'Apply Fungicide', labelKey: 'action.apply_fungicide', category: 'protection' },
    [Action.APPLY_INSECTICIDE]: { label: 'Apply Insecticide', labelKey: 'action.apply_insecticide', category: 'protection' },
    [Action.APPLY_NEEM_OIL]: { label: 'Apply Neem Oil', labelKey: 'action.apply_neem_oil', category: 'protection' },
    [Action.APPLY_BIO_CONTROL]: { label: 'Apply Bio-Control', labelKey: 'action.apply_bio_control', category: 'protection' },
    [Action.APPLY_BT_SPRAY]: { label: 'Apply Bt Spray', labelKey: 'action.apply_bt_spray', category: 'protection' },
    [Action.APPLY_TRICHODERMA]: { label: 'Apply Trichoderma', labelKey: 'action.apply_trichoderma', category: 'protection' },
    [Action.DELAY_SPRAY]: { label: 'Delay Spray', labelKey: 'action.delay_spray', category: 'protection' },
    [Action.INSTALL_TRAPS]: { label: 'Install Traps', labelKey: 'action.install_traps', category: 'protection' },
    [Action.INSTALL_PHEROMONE_TRAPS]: { label: 'Install Pheromone Traps', labelKey: 'action.install_pheromone_traps', category: 'protection' },
    [Action.RELEASE_BIOAGENT]: { label: 'Release Bioagent', labelKey: 'action.release_bioagent', category: 'protection' },
    [Action.MECHANICAL_WEEDING]: { label: 'Mechanical Weeding', labelKey: 'action.mechanical_weeding', category: 'weed' },
    [Action.HAND_WEEDING]: { label: 'Hand Weeding', labelKey: 'action.hand_weeding', category: 'weed' },
    [Action.HERBICIDE_PRE_EMERGENCE]: { label: 'Apply Pre-emergence Herbicide', labelKey: 'action.herbicide_pre', category: 'weed' },
    [Action.HERBICIDE_POST_EMERGENCE]: { label: 'Apply Post-emergence Herbicide', labelKey: 'action.herbicide_post', category: 'weed' },
    [Action.APPLY_MULCH]: { label: 'Apply Mulch', labelKey: 'action.apply_mulch', category: 'weed' },
    [Action.STALE_SEEDBED]: { label: 'Use Stale Seedbed', labelKey: 'action.stale_seedbed', category: 'weed' },
    [Action.SHADE_COVER]: { label: 'Install Shade Cover', labelKey: 'action.shade_cover', category: 'climate' },
    [Action.FROST_PROTECTION]: { label: 'Apply Frost Protection', labelKey: 'action.frost_protection', category: 'climate' },
    [Action.WINDBREAK]: { label: 'Install Windbreak', labelKey: 'action.windbreak', category: 'climate' },
    [Action.LIGHT_IRRIGATION_COOLING]: { label: 'Light Irrigation for Cooling', labelKey: 'action.cooling_irrigation', category: 'climate' },
    [Action.DELAYED_SOWING]: { label: 'Delay Sowing', labelKey: 'action.delayed_sowing', category: 'climate' },
    [Action.EARLY_HARVEST]: { label: 'Early Harvest', labelKey: 'action.early_harvest', category: 'climate' },
    [Action.MONITOR_CLOSELY]: { label: 'Monitor Closely', labelKey: 'action.monitor_closely', category: 'advisory' },
    [Action.WAIT_AND_WATCH]: { label: 'Wait and Watch', labelKey: 'action.wait_and_watch', category: 'advisory' },
    [Action.CONSULT_EXPERT]: { label: 'Consult Expert', labelKey: 'action.consult_expert', category: 'advisory' },
    [Action.SOIL_TEST]: { label: 'Get Soil Test', labelKey: 'action.soil_test', category: 'advisory' },
    [Action.TISSUE_TEST]: { label: 'Get Tissue Test', labelKey: 'action.tissue_test', category: 'advisory' },
    [Action.CONTINUE_CURRENT]: { label: 'Continue Current Practices', labelKey: 'action.continue_current', category: 'advisory' },
    [Action.SCOUT_FIELD]: { label: 'Scout Field', labelKey: 'action.scout_field', category: 'advisory' },
    [Action.EMERGENCY_IRRIGATION]: { label: 'Emergency Irrigation', labelKey: 'action.emergency_irrigation', category: 'emergency' },
    [Action.EMERGENCY_SPRAY]: { label: 'Emergency Spray', labelKey: 'action.emergency_spray', category: 'emergency' },
    [Action.SALVAGE_HARVEST]: { label: 'Salvage Harvest', labelKey: 'action.salvage_harvest', category: 'emergency' },
    [Action.INSURANCE_CLAIM]: { label: 'File Insurance Claim', labelKey: 'action.insurance_claim', category: 'emergency' },
    [Action.CROP_DESTRUCTION]: { label: 'Crop Destruction', labelKey: 'action.crop_destruction', category: 'emergency' },
    // Safety & Regulatory
    [Action.BLOCK_BANNED_CHEMICAL]: { label: 'Block Banned Chemical', labelKey: 'action.block_banned', category: 'safety' },
    [Action.REQUIRE_PPE]: { label: 'Require PPE', labelKey: 'action.require_ppe', category: 'safety' },
    [Action.REQUIRE_LICENSED_APPLICATOR]: { label: 'Require Licensed Applicator', labelKey: 'action.require_license', category: 'safety' },
    [Action.NOTIFY_BEEKEEPERS]: { label: 'Notify Beekeepers', labelKey: 'action.notify_beekeepers', category: 'safety' },
    [Action.EVENING_APPLICATION_ONLY]: { label: 'Evening Application Only', labelKey: 'action.evening_only', category: 'safety' },
    // IPM & Resistance
    [Action.ROTATE_INSECTICIDE_MOA]: { label: 'Rotate Insecticide MOA', labelKey: 'action.rotate_insecticide', category: 'ipm' },
    [Action.ROTATE_FUNGICIDE_MOA]: { label: 'Rotate Fungicide MOA', labelKey: 'action.rotate_fungicide', category: 'ipm' },
    [Action.ESTABLISH_BT_REFUGE]: { label: 'Establish Bt Refuge', labelKey: 'action.bt_refuge', category: 'ipm' },
    [Action.RELEASE_TRICHOGRAMMA]: { label: 'Release Trichogramma', labelKey: 'action.release_trichogramma', category: 'ipm' },
    [Action.RELEASE_NPV]: { label: 'Release NPV', labelKey: 'action.release_npv', category: 'ipm' },
    [Action.RELEASE_LADYBIRD]: { label: 'Release Ladybird Beetles', labelKey: 'action.release_ladybird', category: 'ipm' },
    [Action.APPLY_BEAUVERIA]: { label: 'Apply Beauveria', labelKey: 'action.apply_beauveria', category: 'ipm' },
    // Harvest & Post-Harvest
    [Action.HARVEST_IMMEDIATELY]: { label: 'Harvest Immediately', labelKey: 'action.harvest_now', category: 'harvest' },
    [Action.DELAY_HARVEST]: { label: 'Delay Harvest', labelKey: 'action.delay_harvest', category: 'harvest' },
    [Action.RAPID_COOLING]: { label: 'Rapid Cooling', labelKey: 'action.rapid_cooling', category: 'harvest' },
    [Action.PROPER_DRYING]: { label: 'Proper Drying', labelKey: 'action.proper_drying', category: 'harvest' },
    [Action.GRADING_FOR_EXPORT]: { label: 'Grade for Export', labelKey: 'action.grade_export', category: 'harvest' },
    // Soil Health
    [Action.APPLY_LIME_ACIDIC_SOIL]: { label: 'Apply Lime for Acidic Soil', labelKey: 'action.apply_lime_acidic', category: 'soil' },
    [Action.APPLY_SULFUR_ALKALINE]: { label: 'Apply Sulfur for Alkaline Soil', labelKey: 'action.apply_sulfur', category: 'soil' },
    [Action.GREEN_MANURING]: { label: 'Green Manuring', labelKey: 'action.green_manure', category: 'soil' },
    [Action.ADD_VERMICOMPOST]: { label: 'Add Vermicompost', labelKey: 'action.add_vermicompost', category: 'soil' },
    // Cultural Control Actions
    [Action.CULTURAL_CONTROL]: { label: 'Cultural Control', labelKey: 'action.cultural_control', category: 'ipm' },
    [Action.REMOVE_AFFECTED_PLANTS]: { label: 'Remove Affected Plants', labelKey: 'action.remove_affected', category: 'ipm' },
    [Action.CROP_ROTATION]: { label: 'Crop Rotation', labelKey: 'action.crop_rotation', category: 'ipm' },
    [Action.INTERCROPPING]: { label: 'Intercropping', labelKey: 'action.intercropping', category: 'ipm' }
  };

  return descriptions[action] || { label: action, labelKey: `action.${action.toLowerCase()}`, category: 'unknown' };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  ORGANIC_COMPATIBLE_ACTIONS
};
