/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURE RULE LOADER - Database-First Strategy (v1.0.0-stub)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Loads rules from database at runtime to prevent bundle timeout.
 * Uses in-memory caching for performance.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { type BundledRule, type BundleMetadata, BUNDLE_METADATA } from './all-rules.ts';
import { getCropCodeVariants } from '../utils/crop-code-normalizer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionInput {
  crop_code?: string;
  crop_stage?: string;
  user_query?: string;
  observations?: string[];
  weather?: { temp?: number; humidity?: number; rain_mm?: number; temp_min?: number; temp_max?: number; humidity_min?: number };
  soil?: { ph?: number; organic_carbon?: number; ec?: number };
  // CanonicalState properties for observation-based rules
  visual_symptoms?: string[];
  soil_nitrogen?: string;
  soil_phosphorus?: string;
  soil_potassium?: string;
  ndvi_level?: string;
  ndvi_trend?: string;
  water_stress?: string;
  severity?: string;
  // Extended context fields for strict constraint evaluation
  days_since_sowing?: number;
  ratoon_number?: number;
  soil_ph?: number;
  soil_organic_carbon?: number;
  soil_ec?: number;
  soil_moisture_status?: string;
  ndvi_pattern?: string;
  pest_count?: number;
  disease_confirmed?: boolean;
  irrigation_method?: string;
  region?: string;
  crop_cycle?: string;
  soil_type_name?: string;
  farming_mode?: string;
  [key: string]: unknown;
}

export interface ExecutableRule extends BundledRule {
  conditions: (input: DecisionInput) => boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════════════════

let cachedRules: ExecutableRule[] | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL = 3600000; // 1 hour

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION ALIAS CACHE - Loaded from observation_aliases table
// Replaces hardcoded alias dictionaries with DB-sourced SSOT
// ═══════════════════════════════════════════════════════════════════════════
let cachedObservationAliases: Record<string, string[]> | null = null;
let aliasesCacheExpiry: number = 0;

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: Observation validation cache - loaded from observation_master
// Used to validate that condition keys are valid observation codes
// ═══════════════════════════════════════════════════════════════════════════
let cachedObservationCodes: Set<string> | null = null;
let obsCacheExpiry: number = 0;

// ═══════════════════════════════════════════════════════════════════════════
// META/RUNTIME KEYS - Require explicit runtime context, NOT observation matching
// These keys control rule flow (e.g., fallback rules) and must be set by orchestrator
// ═══════════════════════════════════════════════════════════════════════════
const META_RUNTIME_KEYS = new Set([
  'no_matching_diagnosis', 'no_confirmed_pest', 'block_rule_triggered',
  'fallback', 'chemical_attempt', 'diagnosis_method', 'bio_control_failed',
  'organic_failed', 'recovery_absent', 'salesman_recommendation'
]);

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE LOADING
// ═══════════════════════════════════════════════════════════════════════════

async function loadRulesFromDatabase(): Promise<BundledRule[]> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.warn('⚠️ [RuleLoader] Missing Supabase credentials - returning empty rules');
      return [];
    }
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    // PostgREST caps a single response at ~1000 rows regardless of `.limit()`.
    // decision_rules has >1800 active rows — a non-paginated read silently
    // dropped rules like RICE_GERMINATION_DIAGNOSTIC_001, causing
    // RULE_DATA_INTEGRITY_ERROR (matched_responses=0) for valid observations.
    // Paginate explicitly and stop only when a page returns < PAGE rows.
    const PAGE = 1000;
    const MAX_PAGES = 20; // hard ceiling = 20k rules
    let allRows: any[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE;
      const to = from + PAGE - 1;
      const { data: pageData, error } = await supabase
        .from('decision_rules')
        .select('*')
        .eq('is_active', true)
        .order('rule_id', { ascending: true })
        .range(from, to);
      if (error) {
        console.error('❌ [RuleLoader] Database error:', error.message);
        return [];
      }
      const rows = pageData || [];
      allRows = allRows.concat(rows);
      if (rows.length < PAGE) break;
    }
    const data = allRows;

    console.log(`✅ [RuleLoader] Loaded ${data?.length || 0} rules from database (paginated)`);
    return (data || []).map(row => {
      // SSOT: trigger_keywords column was DROPPED - conditions_json is sole source
      const conditionsJson = row.conditions_json || {};
      
      // ═══════════════════════════════════════════════════════════════════════
      // ON-THE-FLY NORMALIZATION (Alternative to migrations)
      // ═══════════════════════════════════════════════════════════════════════
      
      // Normalize action_type to standard enums
      // ═══════════════════════════════════════════════════════════════════════
      // WAVE 1 FIX (P0-2): Preserve all 8 canonical DB action_type values as
      // first-class. Prior implementation silently collapsed APPLY_TREATMENT,
      // IMMEDIATE_ACTION and RELEASE_BIOCONTROL into 'RECOMMEND', erasing
      // urgency and biocontrol routing for every non-sugarcane crop.
      // DB enum (decision_rules.action_type):
      //   RECOMMEND, MONITOR, BLOCK, NO_ACTION_REQUIRED, URGENT_ACTION,
      //   APPLY_TREATMENT, IMMEDIATE_ACTION, RELEASE_BIOCONTROL
      // ═══════════════════════════════════════════════════════════════════════
      const normalizeActionType = (action: string | null): string => {
        if (!action) return 'RECOMMEND';
        const upper = action.toUpperCase().trim();
        const VALID_DB_TYPES = [
          'RECOMMEND', 'MONITOR', 'BLOCK', 'NO_ACTION_REQUIRED',
          'URGENT_ACTION', 'APPLY_TREATMENT', 'IMMEDIATE_ACTION', 'RELEASE_BIOCONTROL',
        ];
        if (VALID_DB_TYPES.includes(upper)) return upper;
        // Legacy reverse mapping for any old data still using lowercase / non-canonical types.
        // NOTE: APPLY_TREATMENT / IMMEDIATE_ACTION / RELEASE_BIOCONTROL are intentionally
        // NOT collapsed here — they pass through above as first-class enums.
        const legacyMapping: Record<string, string> = {
          'treatment': 'APPLY_TREATMENT',
          'monitoring': 'MONITOR',
          'safety_gate': 'BLOCK',
          'advisory': 'NO_ACTION_REQUIRED',
          'urgent_treatment': 'URGENT_ACTION',
          'prevention': 'RECOMMEND',
          'diagnosis': 'MONITOR',
          'clarification': 'MONITOR',
        };
        return legacyMapping[action] || legacyMapping[upper.toLowerCase()] || 'RECOMMEND';
      };
      
      // Normalize canonical_group to 13-group system
      // WAVE 3 FIX (P3): Extend per-crop prefix coverage beyond sc_/ct_ so RICE,
      // WHEAT, TOMATO, MAIZE, ONION, POTATO, SOYBEAN, BRINJAL, CHILI rules
      // surface their real category in analytics instead of collapsing to
      // '12_monitoring'.
      const normalizeCanonicalGroup = (group: string | null): string => {
        if (!group) return '12_monitoring';
        const g = group.toLowerCase();

        // Per-crop prefixes seen in DB rule_ids / canonical_group strings.
        // SC=sugarcane CT=cotton RC/RICE WH/WHEAT TM/TOMATO MZ/MAIZE
        // ON/ONION PT/POTATO SY/SOY/SOYBEAN BR/BRINJAL CH/CHILI/CHILLI
        const CROP_PREFIX = '(?:sc|ct|rc|rice|wh|wheat|tm|tomato|mz|maize|on|onion|pt|potato|sy|soy|soybean|br|brinjal|ch|chili|chilli)';
        const cropTopic = (topic: string) => new RegExp(`^${CROP_PREFIX}_${topic}_`);
        if (cropTopic('pest').test(g)) return '03_pest';
        if (cropTopic('disease').test(g)) return '04_disease';
        if (cropTopic('nutrient').test(g) || cropTopic('nutrition').test(g)) return '05_nutrition';
        if (cropTopic('stress').test(g)) return '08_stress';
        if (cropTopic('irrigation').test(g)) return '10_irrigation';
        if (cropTopic('safety').test(g)) return '11_safety';
        if (cropTopic('weather').test(g)) return '09_weather';
        if (cropTopic('weed').test(g)) return '06_weed';

        // Direct mapping for short names
        const mapping: Record<string, string> = {
          'pest': '03_pest',
          'disease': '04_disease',
          'nutrition': '05_nutrition',
          'nutrient': '05_nutrition',
          'weed': '06_weed',
          'clarification': '07_clarification',
          'stress': '08_stress',
          'weather': '09_weather',
          'weather_alert': '09_weather',
          'irrigation': '10_irrigation',
          'safety': '11_safety',
          'compliance': '11_safety',
          'advisory': '12_management',
          'management': '12_management',
          'planning': '12_management',
          'monitoring': '12_monitoring',
          'treatment': '13_treatment',
          'identity': '01_crop_identity',
          'crop_identity': '01_crop_identity',
          'growth_stage': '02_growth_stage',
        };

        return mapping[g] || (g.match(/^\d{2}_/) ? g : '12_monitoring');
      };

      
      // WAVE 1 FIX (P0-4): Sugarcane-specific stage synonyms must NOT be
      // applied to transplanted crops (RICE, TOMATO, BRINJAL, CHILI, ONION)
      // where PLANTING != GERMINATION. Scope remap to SUGARCANE only.
      const cropCodeUpper = (row.crop_code || '').toUpperCase();
      const SUGARCANE_STAGE_SYNONYMS: Record<string, string> = {
        'PLANTING': 'GERMINATION',
        'RATOON': 'POST_HARVEST',
        'CANE_FORMATION': 'GRAND_GROWTH',
        'EARLY_GROWTH': 'SEEDLING',
        'RATOON_INIT': 'POST_HARVEST',
      };
      const normalizeStages = (stages: string[] | null): string[] => {
        if (!stages || !Array.isArray(stages)) return ['ALL'];
        const isSugarcane = cropCodeUpper === 'SUGARCANE' || cropCodeUpper === 'SC';
        return stages.map(s => {
          const upper = s.toUpperCase();
          if (isSugarcane && SUGARCANE_STAGE_SYNONYMS[upper]) {
            return SUGARCANE_STAGE_SYNONYMS[upper];
          }
          return upper;
        });
      };
      
      // Normalize observable_characteristics to canonical lower_snake_case array
      const normalizeObservableChars = (chars: unknown): string[] | null => {
        if (!chars) return null;
        const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (Array.isArray(chars)) return chars.map(c => norm(c));
        if (typeof chars === 'object') {
          return Object.keys(chars).map(k => norm(k));
        }
        return null;
      };
      
      // Normalize bee_toxicity
      const normalizeBeeToxicity = (val: string | null): string | null => {
        if (!val) return null;
        const upper = val.toUpperCase();
        if (['HIGH', 'MODERATE', 'LOW', 'SAFE'].includes(upper)) return upper;
        if (upper === 'NONE') return 'SAFE';
        return null;
      };
      
      return {
        rule_id: row.rule_id,
        // Stage-1 migration sidecars — surface so callers / cache layers can
        // key on the canonical lowercase form and on version_hash for drift
        // detection without re-querying the DB.
        rule_id_lc: row.rule_id_lc,
        version_hash: row.version_hash,
        updated_at: row.updated_at,
        category: row.category?.toLowerCase() || 'advisory',
        crop_code: row.crop_code?.toLowerCase() || 'universal',
        crop_group: row.crop_group?.toLowerCase() || 'universal',
        canonical_group: normalizeCanonicalGroup(row.canonical_group),
        stage_applicable: normalizeStages(row.stage_applicable),
        conditionCode: row.condition_code || '() => true',
        conditions_json: conditionsJson,
        cause: row.cause,
        priority: row.priority || 50,
        confidence_score: row.confidence_score,
        scientific_source: row.scientific_source || '',
        scientific_basis: row.scientific_basis || '',
        icar_package_ref: row.icar_package_ref,
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 5: New Response Contract Fields (language-independent)
        // ═══════════════════════════════════════════════════════════════════════
        action_text: row.action_text || null, // May be null, handle in UI
        reason_text: row.reason_text || null,
        knowledge_text: row.knowledge_text || null,
        i18n_key: row.i18n_key,
        decision_trace_template: row.decision_trace_template,
        
        // Normalized observable_characteristics (array only)
        observable_characteristics: normalizeObservableChars(row.observable_characteristics),
        
        alternatives: row.alternatives || [],
        action_type: normalizeActionType(row.action_type),
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 1: Graph Control Fields
        // ═══════════════════════════════════════════════════════════════════════
        blocks_rule_ids: row.blocks_rule_ids || [],
        prerequisite_rule_ids: row.prerequisite_rule_ids || [],
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 2: Temporal Constraint Fields
        // ═══════════════════════════════════════════════════════════════════════
        crop_age_days_min: row.crop_age_days_min,
        crop_age_days_max: row.crop_age_days_max,
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 3: ETL Safety Gate Fields
        // ═══════════════════════════════════════════════════════════════════════
        etl_applicable: row.etl_applicable,
        etl_value_min: row.etl_value_min,
        etl_value_max: row.etl_value_max,
        
        // Safety fields (normalized)
        phi_days: row.phi_days,
        bee_toxicity: normalizeBeeToxicity(row.bee_toxicity),
        ipm_level: row.ipm_level,
        etl_threshold: row.etl_threshold,
        active_ingredient: row.active_ingredient,
        organic_alternative: row.organic_alternative,
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 6: Safety Enhancement Fields
        // ═══════════════════════════════════════════════════════════════════════
        farmer_safety_level: row.farmer_safety_level,
        resistance_group: row.resistance_group,
        mode_of_action: row.mode_of_action,
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 8: RICH AGRONOMIC RESPONSE FIELDS (v1.0 Deterministic Builder)
        // These columns are used by deterministic-response-builder.ts
        // to construct fully rule-sourced farmer advisory responses
        // ═══════════════════════════════════════════════════════════════════════
        // Dosage & Application
        dosage_per_acre: row.dosage_per_acre || null,
        water_volume_per_acre: row.water_volume_per_acre || null,
        application_method: row.application_method || null,
        target_pest_stage: row.target_pest_stage || null,
        chemical_class: row.chemical_class || null,
        treatment_type: row.treatment_type || null,
        biological_group: row.biological_group || null,
        
        // Safety & Regulatory
        reentry_interval_hours: row.reentry_interval_hours || null,
        aquatic_toxicity: row.aquatic_toxicity || null,
        regulatory_status: row.regulatory_status || null,
        
        // Cost Model
        material_cost_per_acre_min: row.material_cost_per_acre_min || null,
        material_cost_per_acre_max: row.material_cost_per_acre_max || null,
        labor_cost_per_acre_min: row.labor_cost_per_acre_min || null,
        labor_cost_per_acre_max: row.labor_cost_per_acre_max || null,
        labor_hours_per_acre: row.labor_hours_per_acre || null,
        equipment_required: row.equipment_required || null,
        equipment_cost_per_acre: row.equipment_cost_per_acre || null,
        total_cost_estimated: row.total_cost_estimated || null,
        
        // ROI & Economics
        roi_yield_gain_pct: row.roi_yield_gain_pct || null,
        roi_cost_saved_min: row.roi_cost_saved_min || null,
        roi_cost_saved_max: row.roi_cost_saved_max || null,
        roi_net_score: row.roi_net_score || null,
        roi_confidence: row.roi_confidence || null,
        
        // Monitoring
        success_indicators: row.success_indicators || null,
        failure_indicators: row.failure_indicators || null,
        
        // Environmental Thresholds
        min_temperature: row.min_temperature || null,
        max_temperature: row.max_temperature || null,
        max_wind_speed: row.max_wind_speed || null,
        rain_delay_hours: row.rain_delay_hours || null,
        weather_dependency: row.weather_dependency || null,
        
        // Scientific References
        university_source: row.university_source || null,
        
        // Confidence & Risk
        risk_level: row.risk_level || null,
        response_severity: row.response_severity || null,
        data_authority_rank: row.data_authority_rank || null,
        
        // Diagnostic
        differentiating_questions: row.differentiating_questions || null,
        visual_markers: row.visual_markers || null,
        
        // ═══════════════════════════════════════════════════════════════════════
        // OBSERVATION LAYER: Pre-filter columns
        // ═══════════════════════════════════════════════════════════════════════
        required_observation_category: row.required_observation_category || null,
        required_plant_part: row.required_plant_part || null,
        
        // P1 SYSTEM-WIDE FIX (2026-06-22): cross-crop context-completeness gate
        min_data_completeness: typeof row.min_data_completeness === 'number'
          ? row.min_data_completeness
          : 0.0,

        is_active: row.is_active
      };
    });
  } catch (e) {
    console.error('❌ [RuleLoader] Failed to load rules:', e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONDITION RECONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

const BLOCKED_PATTERNS = [
  /eval\s*\(/i, /Function\s*\(/i, /import\s*\(/i, /require\s*\(/i,
  /fetch\s*\(/i, /XMLHttpRequest/i, /WebSocket/i, /process\./i,
  /Deno\./i, /globalThis/i, /__proto__/i, /constructor\s*\[/i
];

function reconstructCondition(code: string): ((input: DecisionInput) => boolean) {
  if (!code || typeof code !== 'string') {
    return () => false;
  }
  
  // Security check
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      console.warn(`⚠️ Blocked unsafe condition pattern: ${pattern}`);
      return () => false;
    }
  }
  
  try {
    const fn = new Function('input', `
      "use strict";
      try {
        const condition = ${code};
        return typeof condition === 'function' ? condition(input) : Boolean(condition);
      } catch { return false; }
    `);
    return fn as (input: DecisionInput) => boolean;
  } catch {
    return () => false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONDITION LEDGER - Strict Constraint-Based Evaluation
// ═══════════════════════════════════════════════════════════════════════════

export enum ConditionStatus {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  SKIPPED_NO_DATA = 'SKIPPED_NO_DATA',
  UNEVALUABLE = 'UNEVALUABLE'
}

export interface ConditionEntry {
  key: string;
  status: ConditionStatus;
  required: boolean;
  inputValue?: unknown;
  ruleValue?: unknown;
}

// Module-level ledger cache for downstream scoring
const conditionLedgerCache = new Map<string, ConditionEntry[]>();

export function getConditionLedger(ruleId: string): ConditionEntry[] | undefined {
  return conditionLedgerCache.get(ruleId);
}

export function clearLedgerCache(): void {
  conditionLedgerCache.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY CATEGORY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

const STRUCTURAL_KEYS = new Set(['all', 'any', 'fact', 'operator', 'value']);

// Category C: Numeric threshold (required)
const CATEGORY_C_KEYS = new Set([
  'duration_days', 'days_after_planting_min', 'days_after_planting_max',
  'days_after_sowing', 'days_after_harvest',
  'temp_max_celsius', 'temp_min_celsius', 'temperature_c',
  'soil_ph', 'max_ratoon', 'ratoon_number',
  'soil_fe_ppm', 'soil_zn_ppm', 'soil_mn_ppm', 'soil_s_ppm',
  'soil_b_ppm', 'soil_cu_ppm', 'soil_oc', 'soil_ec',
  'ec_dsm', 'soc_pct', 'applied_n_kg_ha'
]);

// Category E: Weather objects (required)
const CATEGORY_E_KEYS = new Set(['weather', 'rain_forecast']);

// Category F: ETL objects (required)
const CATEGORY_F_KEYS = new Set(['etl', 'etl_range']);

// Category G: Informational/context (NOT required - don't block matching)
// FORENSIC FIX 1B: Added all orphan keys that are informational/economic context
// v7.6 FORENSIC FIX: Added domain-specific boolean keys that duplicate observations array
// These are metadata annotations (e.g., egg_masses_visible: true) that redundantly
// describe what the `observations` array already captures. They must NEVER block rules.
const CATEGORY_G_KEYS = new Set([
  'context', 'roi_basis', 'roi_modifier', 'roi_by_region',
  'timing', 'method', 'operation', 'action', 'assessment_timing',
  'soil_test', 'irrigation_system',
  // FORENSIC AUDIT: These keys provide context but must NEVER block rule firing
  'ipm_priority', 'duration_days_info', 'diagnosis_method',
  'requires_identification', 'soil_type', 'soil_type_name',
  'variety', 'trait', 'region', 'farming_mode', 'monsoon_timing',
  'yield_potential', 'crop_cycle',
  // ═══════════════════════════════════════════════════════════════════════════
  // v7.6 BUG 1 FIX: Domain-specific boolean keys from conditions_json
  // These are observation metadata that duplicate the `observations` array.
  // Previously fell through to unrecognized-key handler (line 927) as required:true
  // which blocked ALL pest treatment rules from firing.
  // ═══════════════════════════════════════════════════════════════════════════
  // Pest observation booleans
  'egg_masses_visible', 'pink_larvae_inside', 'bore_holes_at_nodes',
  'larvae_visible', 'larvae_present', 'larvae_in_stem', 'larvae_in_whorl',
  'frass_visible', 'frass_present', 'webbing_visible', 'webbing_present',
  'honeydew_visible', 'honeydew_present', 'sooty_mold_visible',
  'tunneling_visible', 'tunneling_present', 'exit_holes_visible',
  'pupal_cases_visible', 'cocoon_visible', 'mines_visible',
  'galls_visible', 'galls_present', 'leaf_rolling_visible',
  'stem_boring_visible', 'dead_heart_visible', 'dead_heart_present',
  'wilting_visible', 'wilting_present', 'drying_visible',
  'discoloration_visible', 'discoloration_present',
  'yellowing_visible', 'yellowing_present',
  'spots_visible', 'lesions_visible', 'lesions_present',
  'fungal_growth_visible', 'mold_visible', 'mold_present',
  'rot_visible', 'rot_present', 'canker_visible',
  'white_grub_visible', 'termite_visible', 'aphid_visible',
  'whitefly_visible', 'mealybug_visible', 'scale_insect_visible',
  'mite_visible', 'thrips_visible', 'jassid_visible',
  // Cultural/environmental booleans
  'trash_mulch', 'soil_moisture', 'population_trend',
  'pest', 'pest_type', 'disease_type', 'damage_type',
  'intercrop_present', 'ratoon_crop', 'irrigated',
  'rainfed', 'waterlogged', 'drought_stress',
  // Threshold strings that cannot be evaluated as booleans
  'larvae_count_per_plant', 'damage_percentage', 'incidence_percentage',
  'infestation_level', 'severity_level', 'attack_intensity',
  // Confidence/diagnostic metadata
  'requires_diagnosis_confidence', 'requires_confirmation',
  'confidence_threshold', 'min_confidence',
]);

// ═══════════════════════════════════════════════════════════════════════════
// NUMERIC CONDITION EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════

function evaluateNumericCondition(key: string, condValue: any, input: DecisionInput): ConditionEntry {
  const keyToInput: Record<string, () => number | undefined | null> = {
    'duration_days': () => input.days_since_sowing,
    'days_after_planting_min': () => input.days_since_sowing,
    'days_after_planting_max': () => input.days_since_sowing,
    'days_after_sowing': () => input.days_since_sowing,
    'days_after_harvest': () => input.days_since_sowing,
    'temp_max_celsius': () => input.weather?.temp,
    'temp_min_celsius': () => input.weather?.temp,
    'temperature_c': () => input.weather?.temp,
    'soil_ph': () => input.soil_ph ?? input.soil?.ph,
    'max_ratoon': () => input.ratoon_number,
    'ratoon_number': () => input.ratoon_number,
    'ec_dsm': () => input.soil_ec ?? input.soil?.ec,
    'soc_pct': () => input.soil_organic_carbon ?? input.soil?.organic_carbon,
    'applied_n_kg_ha': () => (input as any).applied_n_kg_ha,
  };

  let inputValue: number | undefined | null;
  if (keyToInput[key]) {
    inputValue = keyToInput[key]();
  } else {
    inputValue = (input as any)[key];
  }

  if (inputValue === undefined || inputValue === null || isNaN(Number(inputValue))) {
    return { key, status: ConditionStatus.SKIPPED_NO_DATA, required: true, ruleValue: condValue };
  }

  const numInput = Number(inputValue);

  if (typeof condValue === 'string') {
    const match = condValue.match(/^([<>]=?)\s*(-?\d+\.?\d*)$/);
    if (match) {
      const op = match[1];
      const threshold = parseFloat(match[2]);
      let passes = false;
      if (op === '<') passes = numInput < threshold;
      else if (op === '<=') passes = numInput <= threshold;
      else if (op === '>') passes = numInput > threshold;
      else if (op === '>=') passes = numInput >= threshold;
      return { key, status: passes ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: true, inputValue: numInput, ruleValue: condValue };
    }
  }

  if (typeof condValue === 'number') {
    let passes = false;
    if (key === 'days_after_planting_min') passes = numInput >= condValue;
    else if (key === 'days_after_planting_max') passes = numInput <= condValue;
    else if (key === 'temp_max_celsius') passes = numInput <= condValue;
    else if (key === 'temp_min_celsius') passes = numInput >= condValue;
    else if (key === 'max_ratoon') passes = numInput <= condValue;
    else passes = Math.abs(numInput - condValue) < (condValue * 0.1 + 1);
    return { key, status: passes ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: true, inputValue: numInput, ruleValue: condValue };
  }

  return { key, status: ConditionStatus.UNEVALUABLE, required: true, ruleValue: condValue };
}

// ═══════════════════════════════════════════════════════════════════════════
// WEATHER CONDITION EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════

function evaluateWeatherCondition(condWeather: any, inputWeather: DecisionInput['weather']): boolean {
  if (!inputWeather) return false;
  if (condWeather.temp_min !== undefined && inputWeather.temp !== undefined && inputWeather.temp < condWeather.temp_min) return false;
  if (condWeather.temp_max !== undefined && inputWeather.temp !== undefined && inputWeather.temp > condWeather.temp_max) return false;
  if (condWeather.humidity_min !== undefined && inputWeather.humidity !== undefined && inputWeather.humidity < condWeather.humidity_min) return false;
  if (condWeather.rain_mm !== undefined && inputWeather.rain_mm !== undefined && inputWeather.rain_mm < condWeather.rain_mm) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// ETL CONDITION EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════

function evaluateETLCondition(condETL: any, pestCount: number): boolean {
  const min = condETL.min ?? condETL.threshold_min ?? 0;
  const max = condETL.max ?? condETL.threshold_max ?? Infinity;
  return pestCount >= min && pestCount <= max;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOLEAN GATE EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════

function evaluateBooleanGate(key: string, condValue: any, input: DecisionInput, expandedObs: Set<string>, inputQuery: string): ConditionEntry {
  const expected = condValue === true || condValue === 'true';

  // Severity as string value
  if (key === 'severity' && typeof condValue === 'string') {
    if (!input.severity) return { key, status: ConditionStatus.SKIPPED_NO_DATA, required: true, ruleValue: condValue };
    const match = condValue.toUpperCase() === (input.severity || '').toUpperCase();
    return { key, status: match ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: true, inputValue: input.severity, ruleValue: condValue };
  }

  // Stress as string value
  if (key === 'stress' && typeof condValue === 'string') {
    if (!input.water_stress) return { key, status: ConditionStatus.SKIPPED_NO_DATA, required: true, ruleValue: condValue };
    const match = condValue.toUpperCase() === (input.water_stress || '').toUpperCase();
    return { key, status: match ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: true, inputValue: input.water_stress, ruleValue: condValue };
  }

  // leaf_n_status as string value
  if (key === 'leaf_n_status' && typeof condValue === 'string') {
    if (!input.soil_nitrogen) return { key, status: ConditionStatus.SKIPPED_NO_DATA, required: true, ruleValue: condValue };
    const match = condValue.toUpperCase() === (input.soil_nitrogen || '').toUpperCase();
    return { key, status: match ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: true, inputValue: input.soil_nitrogen, ruleValue: condValue };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1 FIX: REMOVED no_/normal_ prefix auto-pass shortcut
  // Every key must now be evaluated explicitly. Meta/runtime keys that lack
  // runtime context will return SKIPPED_NO_DATA (required=true) → rule fails.
  // ═══════════════════════════════════════════════════════════════════════════

  // Mapped boolean evaluators (includes negative assertion keys)
  const booleanEvaluators: Record<string, () => boolean | null> = {
    'disease_confirmed': () => input.disease_confirmed ?? null,
    'pest_present': () => {
      const pestObs = ['INSECT_PRESENCE', 'PEST_DAMAGE', 'BORE_HOLES', 'FRASS', 'WEBBING'];
      return pestObs.some(p => expandedObs.has(p)) ? true : null;
    },
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Explicit negative assertion evaluators (were auto-pass before)
    // These now have proper runtime evaluation logic with required=true
    // ═══════════════════════════════════════════════════════════════════════
    'no_matching_diagnosis': () => {
      // Runtime flag set by orchestrator when no specific rule matched
      // Without explicit flag, returns null → SKIPPED_NO_DATA → rule fails
      return (input as any).no_matching_diagnosis ?? null;
    },
    'no_confirmed_pest': () => {
      const pestObs = ['INSECT_PRESENCE', 'PEST_DAMAGE', 'BORE_HOLES', 'FRASS', 'WEBBING'];
      const hasPest = pestObs.some(p => expandedObs.has(p));
      if (hasPest) return false; // Pest IS confirmed → no_confirmed_pest = false
      return expandedObs.size > 0 ? true : null; // Has other obs but no pest → true
    },
    'no_pest_visible': () => {
      const pestObs = ['INSECT_PRESENCE', 'PEST_DAMAGE', 'BORE_HOLES', 'FRASS', 'WEBBING',
                       'CRAWLING_INSECTS', 'FLYING_INSECTS', 'HONEYDEW', 'EGG_MASS'];
      const hasPest = pestObs.some(p => expandedObs.has(p));
      if (hasPest) return false; // Pest IS visible → no_pest_visible = false
      return expandedObs.size > 0 ? true : null;
    },
    'no_visible_deficiency': () => {
      const defObs = ['NUTRIENT_DEFICIENCY', 'CHLOROSIS', 'INTERVEINAL_CHLOROSIS',
                      'PURPLE_LEAVES', 'LEAF_EDGE_BURN', 'WHITE_BUD'];
      const hasDef = defObs.some(d => expandedObs.has(d));
      if (hasDef) return false; // Deficiency IS visible → false
      return expandedObs.size > 0 ? true : null;
    },
    'normal_growth': () => {
      const abnormalObs = ['STUNTED_GROWTH', 'WILTING', 'LODGING', 'POOR_GROWTH',
                           'UNEVEN_GROWTH', 'DRYING', 'DEAD_HEART'];
      const hasAbnormal = abnormalObs.some(a => expandedObs.has(a));
      if (hasAbnormal) return false; // Growth is NOT normal → false
      return expandedObs.size > 0 ? true : null;
    },
    'soil_moisture_low': () => input.soil_moisture_status === 'LOW' || input.soil_moisture_status === 'DRY' ? true : (input.soil_moisture_status ? false : null),
    'soil_moisture_high': () => input.soil_moisture_status === 'HIGH' || input.soil_moisture_status === 'WET' ? true : (input.soil_moisture_status ? false : null),
    'recent_rain': () => input.weather?.rain_mm !== undefined ? (input.weather.rain_mm > 0) : null,
    'high_humidity': () => input.weather?.humidity !== undefined ? (input.weather.humidity > 80) : null,
    'high_temperature': () => input.weather?.temp !== undefined ? (input.weather.temp > 38) : null,
    'low_temperature': () => input.weather?.temp !== undefined ? (input.weather.temp < 15) : null,
    'critical_stage': () => {
      const criticalStages = ['FLOWERING', 'FRUITING', 'GRAND_GROWTH', 'MATURITY'];
      return criticalStages.some(s => (input.crop_stage || '').toUpperCase().includes(s));
    },
    'ndvi_decline': () => input.ndvi_trend === 'DECLINING' ? true : (input.ndvi_trend ? false : null),
    'ndvi_improving': () => input.ndvi_trend === 'IMPROVING' ? true : (input.ndvi_trend ? false : null),
    'ndvi_triggered': () => input.ndvi_level ? true : null,
    'lodging_risk': () => expandedObs.has('LODGING') || expandedObs.has('LODGING_RISK') ? true : null,
    'etl_exceeded': () => input.pest_count !== undefined ? true : null,
    'etl_below': () => input.pest_count !== undefined ? false : null,
  };

  const evaluator = booleanEvaluators[key];
  if (evaluator) {
    const actual = evaluator();
    if (actual === null) return { key, status: ConditionStatus.SKIPPED_NO_DATA, required: true, ruleValue: condValue };
    const passes = expected === actual;
    return { key, status: passes ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: true, inputValue: actual, ruleValue: condValue };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Meta/runtime keys that lack evaluators FAIL (not SKIPPED)
  // This prevents rules with meta-conditions from firing without orchestrator context
  // ═══════════════════════════════════════════════════════════════════════════
  if (META_RUNTIME_KEYS.has(key)) {
    // Check if orchestrator explicitly set this flag on the input
    const runtimeValue = (input as any)[key];
    if (runtimeValue === undefined || runtimeValue === null) {
      return { key, status: ConditionStatus.SKIPPED_NO_DATA, required: true, ruleValue: condValue };
    }
    const passes = expected === (runtimeValue === true);
    return { key, status: passes ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: true, inputValue: runtimeValue, ruleValue: condValue };
  }

  // Generic observation-based boolean flags
  const keySymbol = key.toLowerCase().replace(/[\s-]+/g, "_");
  if (expected) {
    const obsMatch = expandedObs.has(keySymbol) ||
      [...expandedObs].some(o => o.includes(keySymbol) || keySymbol.includes(o)) ||
      inputQuery.includes(keySymbol);
    // PHASE 2 FIX: Return FAILED (not SKIPPED_NO_DATA) for unmatched observation flags
    // This prevents rules with unrecognized condition keys from silently passing
    return { key, status: obsMatch ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: true, ruleValue: condValue };
  }
  return { key, status: ConditionStatus.PASSED, required: false, ruleValue: condValue };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EVALUATOR: Strict fail-closed with condition ledger
// ═══════════════════════════════════════════════════════════════════════════

/**
 * STRICT CONSTRAINT-BASED EVALUATOR
 * 
 * Decision rule: A rule matches ONLY if:
 * 1. Zero entries have status FAILED
 * 2. Zero REQUIRED entries have status SKIPPED_NO_DATA or UNEVALUABLE
 * 3. At least one entry has status PASSED
 */
export function evaluateConditionsJson(
  conditions: any,
  input: DecisionInput,
  ruleId?: string
): boolean {
  if (!conditions || Object.keys(conditions).length === 0) {
    // CRITICAL FIX: Empty conditions rules should NOT match by default
    // They are catch-all rules that win over specific rules with real conditions
    // Only match if there are observations present (prevents SC_DIAG_GENERAL_015 from always winning)
    if (ruleId) {
      conditionLedgerCache.set(ruleId, [{ key: 'EMPTY_CONDITIONS', status: ConditionStatus.PASSED, required: false }]);
    }
    return false;
  }

  // Handle compound conditions (recursive)
  if (conditions.all && Array.isArray(conditions.all)) {
    return conditions.all.every((c: any) => evaluateConditionsJson(c, input, ruleId));
  }
  if (conditions.any && Array.isArray(conditions.any)) {
    return conditions.any.some((c: any) => evaluateConditionsJson(c, input, ruleId));
  }

  // Handle atomic condition (fact/operator/value)
  if (conditions.fact && conditions.operator) {
    const factValue = input[conditions.fact as keyof DecisionInput];
    if (factValue === undefined || factValue === null) return false;
    const op = conditions.operator.toLowerCase();
    const val = conditions.value;
    switch (op) {
      case 'equal': case 'equals':
        return String(factValue).toLowerCase() === String(val).toLowerCase();
      case 'contains':
        return String(factValue).toLowerCase().includes(String(val).toLowerCase());
      case 'in':
        return Array.isArray(val) && val.some((v: any) => String(v).toLowerCase() === String(factValue).toLowerCase());
      case 'between':
        return Array.isArray(val) && val.length === 2 && Number(factValue) >= val[0] && Number(factValue) <= val[1];
      case 'lessthan':
        return Number(factValue) < Number(val);
      case 'greaterthan':
        return Number(factValue) > Number(val);
      default:
        return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLAT DB FORMAT: Ledger-based strict evaluation
  // ═══════════════════════════════════════════════════════════════════════════
  const ledger: ConditionEntry[] = [];
  const conditionKeys = Object.keys(conditions);

  // Precompute input values
  // CANONICAL CASE (post-2026-06-21 migration): observation/condition codes
  // are lower_snake_case in DB (observation_master, observation_aliases,
  // hypothesis_conditions, decision_rules). Stages stay UPPER.
  const inputStage = (input.crop_stage || '').toUpperCase();
  const inputSymptoms = (input.visual_symptoms || []).map(s => String(s).toLowerCase().replace(/[\s-]+/g, '_'));
  const inputSymptom = String((input as any).primary_symptom || '').toLowerCase().replace(/[\s-]+/g, '_');
  const inputQuery = String((input as any).user_query || '').toLowerCase();
  const inputObservations = (input.observations || []).map(s => String(s).toLowerCase().replace(/[\s-]+/g, '_'));

  // Combined observation set (all lower_snake_case)
  const allInputObs = new Set([...inputSymptoms, ...inputObservations]);
  if (inputSymptom) allInputObs.add(inputSymptom);

  // Observation aliases (canonical lower SSOT — see loader cache build).
  const observationAliases: Record<string, string[]> = cachedObservationAliases || {};

  // Expand with aliases (lower → lower)
  const expandedObs = new Set(allInputObs);
  for (const obs of allInputObs) {
    if (observationAliases[obs]) {
      observationAliases[obs].forEach(a => expandedObs.add(a));
    }
  }

  for (const key of conditionKeys) {
    if (STRUCTURAL_KEYS.has(key)) continue;

    const condValue = conditions[key];

    // ─── DAS range gate (SSOT: input.days_since_sowing) ───
    if (key === 'das_range') {
      const das = Number(input.days_since_sowing ?? (input as any).days_after_sowing_exact);
      if (!Number.isFinite(das)) {
        ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: true, ruleValue: condValue });
        continue;
      }
      const cv: any = condValue || {};
      const min = Number(cv.min ?? cv.from ?? Number.NEGATIVE_INFINITY);
      const max = Number(cv.max ?? cv.to ?? Number.POSITIVE_INFINITY);
      const passes = das >= min && das <= max;
      ledger.push({
        key, status: passes ? ConditionStatus.PASSED : ConditionStatus.FAILED,
        required: true, inputValue: das, ruleValue: condValue,
      });
      continue;
    }

    // ─── Category H: Deprecated/Ignored ───
    if (key === 'trigger_keywords') continue;
    if (key === 'always_applicable') {
      if (condValue === true || condValue === 'true') {
        ledger.push({ key, status: ConditionStatus.PASSED, required: false, ruleValue: condValue });
      }
      continue;
    }

    // ─── Category A: Stage Keys ───
    if (key === 'crop_stage' || key === 'stage' || key === 'growth_stage') {
      const stages = Array.isArray(condValue) ? condValue : [condValue];
      if (stages.length > 0) {
        // v7.8 FIX: Default/generic stages should not block rules
        const DEFAULT_STAGES = new Set(['VEGETATIVE', 'UNKNOWN', 'DEFAULT', '']);
        const isDefault = !inputStage || DEFAULT_STAGES.has(inputStage);
        // ESTABLISHMENT_STAGE_EQUIVALENCE (2026-06-20): rules authored against
        // 'germination' must also match when the live crop_stage_master returns
        // 'nursery', 'seedling', 'emergence', or 'establishment' for the same
        // DAS window. Without this, every rice DAS≤25 emergence/germination
        // rule was being stage-gated out.
        const ESTABLISHMENT_FAMILY = new Set(['GERMINATION', 'NURSERY', 'SEEDLING', 'EMERGENCE', 'ESTABLISHMENT']);
        const inputIsEstablishment = ESTABLISHMENT_FAMILY.has(inputStage);
        const stageMatch = stages.some((s: any) => {
          const upper = String(s).toUpperCase();
          if (upper === inputStage || upper === '*' || upper === 'ALL' || upper === 'ANY') return true;
          if (inputStage.includes(upper)) return true;
          if (inputIsEstablishment && ESTABLISHMENT_FAMILY.has(upper)) return true;
          return false;
        });
        ledger.push({
          key, status: stageMatch || isDefault ? ConditionStatus.PASSED : ConditionStatus.FAILED,
          // v7.8: When stage is default/missing, treat as non-blocking
          required: !isDefault,
          inputValue: inputStage, ruleValue: stages
        });
      }
      continue;
    }

    // ─── Category A: Observation Keys ───
    // FORENSIC FIX 1A: `required_symptoms` is treated as a soft observation match
    // These are confirmation-level symptoms that farmers may describe in lay terms
    if (key === 'observations' || key === 'symptom' || key === 'primary_symptom' || key === 'required_symptoms') {
      const isRequiredSymptoms = key === 'required_symptoms';
      const obsList = Array.isArray(condValue) ? condValue : [condValue];
      if (obsList.length > 0) {
        // ═══════════════════════════════════════════════════════════════════
        // PHASE 7: Validate observation codes against observation_master cache
        // Log warnings for invalid codes that may indicate stale rule data
        // ═══════════════════════════════════════════════════════════════════
        if (cachedObservationCodes && ruleId) {
          // FORENSIC AUDIT v9.0: dedup per-(rule, obs) so each unknown code
          // logs at most once per process. The loader previously warned twice
          // per rule (once for `observations` and once for `required_symptoms`).
          for (const obs of obsList) {
            const obsNorm = String(obs).toLowerCase().replace(/[\s-]+/g, '_');
            if (!cachedObservationCodes.has(obsNorm)) {
              const dedupKey = `${ruleId}|${obsNorm}`;
              if (!(globalThis as any).__obsValidationLogged) (globalThis as any).__obsValidationLogged = new Set<string>();
              const seen = (globalThis as any).__obsValidationLogged as Set<string>;
              if (!seen.has(dedupKey)) {
                seen.add(dedupKey);
                console.warn(`⚠️ [ObsValidation] Rule ${ruleId} references unknown observation: ${obsNorm}`);
              }
            }
          }
        }
        
        if (expandedObs.size > 0) {
          const obsMatch = obsList.some((obs: string) => {
            const obsNorm = String(obs).toLowerCase().replace(/[\s-]+/g, '_');
            for (const inputObs of expandedObs) {
              if (inputObs === obsNorm || inputObs.includes(obsNorm) || obsNorm.includes(inputObs)) return true;
              // Root-word matching for related codes
              // stunted_plants ↔ stunted_growth (share 'stunted')
              const obsWords = obsNorm.split('_');
              const inputWords = inputObs.split('_');
              const sharedWords = obsWords.filter(w => inputWords.includes(w) && w.length > 3);
              if (sharedWords.length > 0) return true;
            }
            return false;
          });
          ledger.push({
            key, status: obsMatch ? ConditionStatus.PASSED : ConditionStatus.FAILED,
            // FORENSIC FIX 1A: required_symptoms is soft (required: false) since farmers
            // describe symptoms in lay terms, not clinical confirmation codes
            required: isRequiredSymptoms ? false : true,
            inputValue: [...expandedObs].slice(0, 5), ruleValue: obsList
          });
        } else {
          ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: isRequiredSymptoms ? false : true, ruleValue: obsList });
        }
      }
      continue;
    }

    // ─── Category B: Identity Keys ───
    if (key === 'crop_code' || key === 'crop_type' || key === 'variety') {
      const inputCrop = (input.crop_code || '').toLowerCase();
      const ruleVal = String(condValue).toLowerCase();
      if (!inputCrop) {
        ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: true, ruleValue: condValue });
      } else {
        const match = ruleVal === inputCrop || ruleVal === '*' || ruleVal === 'all' || ruleVal === 'universal';
        ledger.push({
          key, status: match ? ConditionStatus.PASSED : ConditionStatus.FAILED,
          required: true, inputValue: inputCrop, ruleValue: condValue
        });
      }
      continue;
    }

    // ─── Category C: Numeric Threshold Keys ───
    if (CATEGORY_C_KEYS.has(key)) {
      ledger.push(evaluateNumericCondition(key, condValue, input));
      continue;
    }

    // ─── Category G: Informational/Context Keys (NOT required) ───
    if (CATEGORY_G_KEYS.has(key)) {
      if (typeof condValue === 'string') {
        const valUpper = condValue.toLowerCase().replace(/[\s-]+/g, "_");
        const matches = inputQuery.includes(valUpper) || [...expandedObs].some(o => o.includes(valUpper));
        ledger.push({
          key, status: matches ? ConditionStatus.PASSED : ConditionStatus.SKIPPED_NO_DATA,
          required: false, ruleValue: condValue
        });
      } else {
        ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: condValue });
      }
      continue;
    }

    // ─── Category E: Weather Objects ───
    if (CATEGORY_E_KEYS.has(key)) {
      if (!input.weather || (!input.weather.temp && !input.weather.humidity && !input.weather.rain_mm)) {
        ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: true, ruleValue: condValue });
      } else if (typeof condValue === 'object' && condValue !== null) {
        const weatherResult = evaluateWeatherCondition(condValue, input.weather);
        ledger.push({ key, status: weatherResult ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: true, inputValue: input.weather, ruleValue: condValue });
      } else {
        ledger.push({ key, status: ConditionStatus.UNEVALUABLE, required: true, ruleValue: condValue });
      }
      continue;
    }

    // ─── Category F: ETL Objects ───
    if (CATEGORY_F_KEYS.has(key)) {
      if (typeof condValue === 'string') {
        // v7.6 BUG 4 FIX: etl_range as string (e.g., "8-10") is informational metadata
        // Cannot be evaluated without pest_count — treat as non-blocking context
        ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: condValue });
      } else if (input.pest_count === undefined || input.pest_count === null) {
        ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: condValue });
      } else if (typeof condValue === 'object' && condValue !== null) {
        const etlResult = evaluateETLCondition(condValue, input.pest_count);
        ledger.push({ key, status: etlResult ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: true, inputValue: input.pest_count, ruleValue: condValue });
      } else {
        // v7.6: Unknown ETL format — don't block the rule
        ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: condValue });
      }
      continue;
    }

    // ─── Category D: Boolean Gate Keys (severity, stress, leaf_n_status, etc.) ───
    if ((typeof condValue === 'boolean' || condValue === 'true' || condValue === 'false') && CATEGORY_G_KEYS.has(key)) {
      const keySymbol = key.toLowerCase().replace(/[\s-]+/g, "_");
      const matched = expandedObs.has(keySymbol) || [...expandedObs].some(o => o.includes(keySymbol) || keySymbol.includes(o)) || inputQuery.includes(keySymbol);
      ledger.push({ key, status: matched ? ConditionStatus.PASSED : ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: condValue });
      continue;
    }

    if ((typeof condValue === 'boolean' || condValue === 'true' || condValue === 'false') ||
        key === 'severity' || key === 'stress' || key === 'leaf_n_status' ||
        key === 'disease_confirmed' || key === 'pest_present' || key === 'etl_exceeded' || key === 'etl_below' ||
        key === 'lodging_risk' || key === 'soil_moisture_low' || key === 'soil_moisture_high' ||
        key === 'ndvi_decline' || key === 'ndvi_triggered' || key === 'ndvi_improving' ||
        key === 'recovery_absent' || key === 'organic_failed' || key === 'bio_control_failed' ||
        key === 'recent_rain' || key === 'critical_stage' || key === 'high_humidity' ||
        key === 'high_temperature' || key === 'low_temperature' ||
        key === 'water_deficit_visible' || key === 'high_water_bills' ||
        key === 'no_pest_visible' || key === 'no_visible_deficiency' || key === 'normal_growth' ||
        key === 'uneven_growth' || key === 'symptoms_mild' || key === 'salesman_recommendation') {
      ledger.push(evaluateBooleanGate(key, condValue, input, expandedObs, inputQuery));
      continue;
    }

    // ─── Unrecognized keys: Domain-specific observation flags ───
    // v7.6 BUG 1 FIX: Changed from required:true → required:false
    // Unknown boolean keys are treated as SOFT observation hints, not hard gates.
    // This prevents orphan/new DB keys from blocking entire rules.
    if (condValue === true || condValue === 'true') {
      const keySymbol = key.toLowerCase().replace(/[\s-]+/g, "_");
      const match = expandedObs.has(keySymbol) ||
        [...expandedObs].some(o => o.includes(keySymbol) || keySymbol.includes(o)) ||
        inputQuery.includes(keySymbol);
      ledger.push({
        key, status: match ? ConditionStatus.PASSED : ConditionStatus.SKIPPED_NO_DATA,
        required: false, ruleValue: condValue
      });
      continue;
    }

    if (typeof condValue === 'string') {
      // Try numeric threshold
      const inputValue = (input as any)[key];
      const numericInput = typeof inputValue === 'number' ? inputValue : parseFloat(String(inputValue));

      if (!isNaN(numericInput) && inputValue !== undefined) {
        const ltMatch = condValue.match(/^<\s*(\d+\.?\d*)$/);
        const gteMatch = condValue.match(/^>=\s*(\d+\.?\d*)$/);
        const gtMatch = condValue.match(/^>\s*(\d+\.?\d*)$/);
        const lteMatch = condValue.match(/^<=\s*(\d+\.?\d*)$/);
        let passes = true;
        if (ltMatch) passes = numericInput < parseFloat(ltMatch[1]);
        else if (gteMatch) passes = numericInput >= parseFloat(gteMatch[1]);
        else if (gtMatch) passes = numericInput > parseFloat(gtMatch[1]);
        else if (lteMatch) passes = numericInput <= parseFloat(lteMatch[1]);
        ledger.push({ key, status: passes ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: true, inputValue: numericInput, ruleValue: condValue });
        continue;
      }

      // String match against observations/query
      // v7.6: Unknown string keys are soft — don't block rules
      const valUpper = condValue.toLowerCase().replace(/[\s-]+/g, "_");
      const match = [...expandedObs].some(o => o.includes(valUpper) || valUpper.includes(o)) || inputQuery.includes(valUpper);
      ledger.push({ key, status: match ? ConditionStatus.PASSED : ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: condValue });
      continue;
    }

    if (condValue === false || condValue === 'false') {
      // Negative assertion - passes unless contradicted
      const keySymbol = key.toLowerCase().replace(/[\s-]+/g, "_");
      const present = expandedObs.has(keySymbol) || [...expandedObs].some(o => o.includes(keySymbol));
      ledger.push({ key, status: present ? ConditionStatus.FAILED : ConditionStatus.PASSED, required: false, ruleValue: condValue });
      continue;
    }

    if (typeof condValue === 'number') {
      const inputValue = (input as any)[key];
      if (inputValue === undefined || inputValue === null) {
        // v7.6: Unknown numeric keys without runtime data are non-blocking
        ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: condValue });
      } else {
        const passes = Math.abs(Number(inputValue) - condValue) < 0.01;
        ledger.push({ key, status: passes ? ConditionStatus.PASSED : ConditionStatus.FAILED, required: false, inputValue, ruleValue: condValue });
      }
      continue;
    }

    // ─── FORENSIC FIX 1C: Handle `requires_diagnosis_confidence` as threshold ───
    // v7.6: Moved to CATEGORY_G_KEYS but keep explicit handler as safety net
    if (key === 'requires_diagnosis_confidence') {
      const confVal = typeof condValue === 'number' ? condValue : parseFloat(String(condValue));
      // This is a soft gate — if we don't have confidence data, skip gracefully
      ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: condValue });
      continue;
    }

    // ─── FORENSIC FIX 1D: Handle `requires_confirmation` as prerequisite ref ───
    if (key === 'requires_confirmation') {
      // String rule_id reference — treat as soft prerequisite, not boolean
      ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: condValue });
      continue;
    }

    if (condValue !== null && typeof condValue === 'object') {
      // FORENSIC FIX: Check if this is an array (like required_symptoms missed above)
      if (Array.isArray(condValue)) {
        // Treat unknown array keys as soft observation lists
        const arrMatch = condValue.some((v: any) => {
          const vUpper = String(v).toLowerCase().replace(/[\s-]+/g, "_");
          return expandedObs.has(vUpper) || [...expandedObs].some(o => o.includes(vUpper) || vUpper.includes(o));
        });
        ledger.push({ key, status: arrMatch ? ConditionStatus.PASSED : ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: condValue });
        continue;
      }
      // Unknown object condition — mark as informational, not blocking
      ledger.push({ key, status: ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: '[object]' });
      continue;
    }

    // Anything else — v7.6: non-blocking to prevent orphan keys from killing rules
    ledger.push({ key, status: ConditionStatus.UNEVALUABLE, required: false, ruleValue: condValue });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECISION RULE: Strict fail-closed
  // 1. Zero FAILED entries
  // 2. Zero REQUIRED entries with SKIPPED_NO_DATA or UNEVALUABLE
  // 3. At least one PASSED entry
  // ═══════════════════════════════════════════════════════════════════════════
  const requiredFailed = ledger.filter(e => e.required &&
    (e.status === ConditionStatus.FAILED || e.status === ConditionStatus.SKIPPED_NO_DATA || e.status === ConditionStatus.UNEVALUABLE));
  const anyPassed = ledger.some(e => e.status === ConditionStatus.PASSED);
  const matches = requiredFailed.length === 0 && anyPassed;

  // Cache ledger for downstream scoring
  if (ruleId) {
    conditionLedgerCache.set(ruleId, ledger);
  }

  return matches;
}

function makeExecutable(rule: BundledRule): ExecutableRule {
  return {
    ...rule,
    conditions: (input: DecisionInput) => {
      // Primary path: evaluate conditions_json
      if (rule.conditions_json && Object.keys(rule.conditions_json).length > 0) {
        const result = evaluateConditionsJson(rule.conditions_json, input, rule.rule_id);
        if (result) return true;
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // AUDIT FIX: Secondary path - observable_characteristics matching
      // When condition_code is STAGE_GENERAL and conditions_json fails (due to 
      // diagnostic-level codes like ORANGE_RED_DOTS_AT_NODES not matching farmer-
      // facing codes like POOR_TILLERING), check observable_characteristics which
      // contains farmer-facing symptom codes that match NLU extraction output.
      // ═══════════════════════════════════════════════════════════════════════════
      // FORENSIC FIX 1F: Handle both array AND boolean-object format for observable_characteristics
      // Array format: ["DEAD_HEART", "FRASS"] — already normalized by normalizeObservableChars
      // Boolean-object format: {dead_heart: true, bore_holes: true} — normalized to array of uppercase keys
      const obsChars = (rule as any).observable_characteristics;
      if (obsChars && Array.isArray(obsChars) && obsChars.length > 0) {
        const inputSymptoms = (input.visual_symptoms || []).map(s =>
          s.toLowerCase().replace(/[\s-]+/g, "_")
        );
        if (inputSymptoms.length > 0) {
          const obsSet = new Set(obsChars.map((o: any) => String(o).toLowerCase().replace(/[\s-]+/g, "_")));
          const matched: string[] = [];
          for (const sym of inputSymptoms) {
            for (const obs of obsSet) {
              // Exact match or root-word containment (STUNTED_PLANTS ↔ STUNTED_GROWTH)
              if (sym === obs || sym.includes(obs) || obs.includes(sym)) {
                matched.push(obs);
                break;
              }
              // Root word matching: share significant words (>3 chars)
              const symWords = sym.split('_');
              const obsWords = obs.split('_');
              const sharedWords = symWords.filter(w => obsWords.includes(w) && w.length > 3);
              if (sharedWords.length > 0) {
                matched.push(obs);
                break;
              }
            }
          }
          if (matched.length > 0) {
            // Populate condition ledger for downstream scoring
            const ledger: ConditionEntry[] = matched.map(m => ({
              key: m, status: ConditionStatus.PASSED, required: false, ruleValue: m
            }));
            // Add unmatched observations as non-required context
            for (const obs of obsSet) {
              if (!matched.includes(obs)) {
                ledger.push({ key: obs, status: ConditionStatus.SKIPPED_NO_DATA, required: false, ruleValue: obs });
              }
            }
            conditionLedgerCache.set(rule.rule_id, ledger);
            console.log(`✅ [ObsChars] Rule ${rule.rule_id} matched ${matched.length}/${obsChars.length} via observable_characteristics: [${matched.join(', ')}]`);
            return true;
          }
        }
      }

      // Rules with NO conditions_json AND NO observable_characteristics should NOT auto-match
      return false;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export async function loadAllRules(): Promise<ExecutableRule[]> {
  const now = Date.now();
  
  if (cachedRules && now < cacheExpiry) {
    return cachedRules;
  }
  
  const bundled = await loadRulesFromDatabase();
  cachedRules = bundled.map(makeExecutable);
  cacheExpiry = now + CACHE_TTL;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: Load observation aliases from DB (same TTL as rules)
  // ═══════════════════════════════════════════════════════════════════════════
  if (!cachedObservationAliases || now >= aliasesCacheExpiry) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceRoleKey) {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        
        // Load observation aliases
        // AUDIT FIX: observation_aliases table has NO is_active column
        // Removed .eq('is_active', true) which silently returned 0 rows
        const { data: aliases } = await supabase
          .from('observation_aliases')
          .select('alias_code, canonical_code');
        
        if (aliases && aliases.length > 0) {
          // P0 HOTFIX (Layer 2): reject cause-named aliases at runtime.
          // Aliases are for SYNONYMS of observable signs only — never for
          // hard-coding a CAUSE (e.g. *_DEFICIENCY_*, *_TOXICITY_*).
          const CAUSE_ENCODED = /(_DEFICIENCY_|_TOXICITY_|_POISONING_|^K_DEFICIENCY|^POTASH_DEFICIENCY|^N_DEFICIENCY|^P_DEFICIENCY)/i;
          const aliasMap: Record<string, string[]> = {};
          let skipped = 0;
          const norm = (s: string) => String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
          for (const row of aliases) {
            if (CAUSE_ENCODED.test(row.alias_code)) {
              skipped++;
              console.warn(`🚫 [RuleLoader] Rejecting cause-named alias '${row.alias_code}' → '${row.canonical_code}' (use observable-sign aliases only)`);
              continue;
            }
            // CANONICAL LOWER SSOT: keys + values are lower_snake_case so
            // alias expansion always returns codes that match
            // decision_rules / hypothesis_conditions / observation_master.
            const aliasLower = norm(row.alias_code);
            const canonLower = norm(row.canonical_code);
            if (!aliasMap[aliasLower]) aliasMap[aliasLower] = [];
            if (!aliasMap[aliasLower].includes(canonLower)) aliasMap[aliasLower].push(canonLower);
            if (!aliasMap[canonLower]) aliasMap[canonLower] = [];
            if (!aliasMap[canonLower].includes(aliasLower)) aliasMap[canonLower].push(aliasLower);
          }
          cachedObservationAliases = aliasMap;
          aliasesCacheExpiry = now + CACHE_TTL;
          console.log(`✅ [RuleLoader] Cached ${aliases.length - skipped} observation aliases from DB (${skipped} cause-named aliases rejected)`);
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // PHASE 7: Load observation_master codes for validation
        // ═══════════════════════════════════════════════════════════════════
        // FORENSIC AUDIT FIX v9.0 (2026-06-04):
        // PostgREST default cap is 1000 rows. observation_master has ~1982
        // active rows, so the previous unpaginated read silently truncated
        // ~982 valid codes, producing a flood of false "unknown observation"
        // warnings. Paginate explicitly and log a smell if we hit exactly 1000.
        // ═══════════════════════════════════════════════════════════════════
        if (!cachedObservationCodes || now >= obsCacheExpiry) {
          const allCodes: string[] = [];
          const PAGE = 1000;
          let fromIdx = 0;
          while (true) {
            const { data: page, error: pageErr } = await supabase
              .from('observation_master')
              .select('observation_code')
              .eq('is_active', true)
              .range(fromIdx, fromIdx + PAGE - 1);
            if (pageErr) {
              console.warn(`⚠️ [RuleLoader] observation_master page ${fromIdx} failed: ${pageErr.message}`);
              break;
            }
            const rows = page || [];
            for (const r of rows) {
              if (r?.observation_code) allCodes.push(String(r.observation_code).toLowerCase().replace(/[\s-]+/g, '_'));
            }
            if (rows.length < PAGE) break;
            fromIdx += PAGE;
            if (fromIdx > 50_000) {
              console.warn(`⚠️ [RuleLoader] observation_master pagination guard tripped at ${fromIdx}`);
              break;
            }
          }
          if (allCodes.length > 0) {
            cachedObservationCodes = new Set(allCodes);
            obsCacheExpiry = now + CACHE_TTL;
            console.log(`✅ [RuleLoader] Cached ${allCodes.length} observation_master codes for validation (paginated)`);
            if (allCodes.length === 1000) {
              console.warn(`⚠️ [RuleLoader] observation_master count==1000 exactly — possible pagination smell`);
            }
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ [RuleLoader] Failed to load observation aliases:', e);
    }
  }
  
  console.log(`✅ [RuleLoader] Cached ${cachedRules.length} executable rules`);
  return cachedRules;
}

export function loadCropGroupRules(cropGroup: string): ExecutableRule[] {
  const normalizedGroup = cropGroup?.toLowerCase() || '';
  return cachedRules?.filter(r => r.crop_code?.toLowerCase() === normalizedGroup) || [];
}

export function loadSafetyRules(): ExecutableRule[] {
  return cachedRules?.filter(r => r.category === 'risk_safety') || [];
}

export function loadAdvancedRules(): ExecutableRule[] {
  return cachedRules?.filter(r => ['fertilizer', 'irrigation'].includes(r.category)) || [];
}

export function loadIntelligenceRules(): ExecutableRule[] {
  return cachedRules?.filter(r => r.category === 'crop_identity') || [];
}

export function loadRulesForCrop(cropCode: string): ExecutableRule[] {
  const variants = getCropCodeVariants(cropCode).map(v => v.toLowerCase());
  return cachedRules?.filter(r => {
    const ruleCrop = r.crop_code?.toLowerCase() || '';
    return variants.includes(ruleCrop) || ruleCrop === 'all' || ruleCrop === '*' || ruleCrop === 'universal';
  }) || [];
}

export function loadRulesByCategory(category: string): ExecutableRule[] {
  return cachedRules?.filter(r => r.category === category) || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

export function evaluateRules(rules: ExecutableRule[], input: DecisionInput): ExecutableRule[] {
  const matched: ExecutableRule[] = [];
  
  for (const rule of rules) {
    try {
      if (rule.conditions(input)) {
        matched.push(rule);
      }
    } catch {
      // Skip rule on error
    }
  }
  
  return matched.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

export function findRulesForCause(cause: string): ExecutableRule[] {
  return cachedRules?.filter(r => r.cause === cause) || [];
}

export function getRuleIdsForInput(input: DecisionInput): string[] {
  const matched = evaluateRules(cachedRules || [], input);
  return matched.map(r => r.rule_id);
}

// ═══════════════════════════════════════════════════════════════════════════
// METADATA
// ═══════════════════════════════════════════════════════════════════════════

export function getRuleCount(): number {
  return cachedRules?.length || 0;
}

export function getRuleCountByCategory(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rule of cachedRules || []) {
    counts[rule.category] = (counts[rule.category] || 0) + 1;
  }
  return counts;
}

export function getRuleCountByCropGroup(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rule of cachedRules || []) {
    counts[rule.crop_code] = (counts[rule.crop_code] || 0) + 1;
  }
  return counts;
}

export function getBundleMetadata(): BundleMetadata {
  return {
    ...BUNDLE_METADATA,
    totalRules: getRuleCount(),
    rulesByCategory: getRuleCountByCategory(),
    rulesByCropGroup: getRuleCountByCropGroup()
  };
}

export function getBundleVersion(): string {
  return '1.0.0-db';
}

export function clearCaches(): void {
  cachedRules = null;
  cacheExpiry = 0;
  conditionLedgerCache.clear();
  console.log('🧹 [RuleLoader] Caches cleared');
}

// Re-export types
export type { BundledRule, ExecutableRule };
