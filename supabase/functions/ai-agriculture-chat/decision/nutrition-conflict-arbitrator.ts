/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NUTRITION CONFLICT ARBITRATION LAYER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Prevents false micronutrient dominance and improper observation collapse.
 * Enforces diagnostic specificity hierarchy before PRIMARY_DECISION selection.
 * 
 * RULES:
 * 1. WATER_STRESS_CONFIRMED blocks ALL nutrient urgent treatments
 * 2. NITROGEN_DEFICIENCY_CONFIRMED blocks micronutrient urgent treatments
 *    (unless soil micronutrient deficiency explicitly confirmed)
 * 3. Multiple nutrition rules → select highest diagnostic specificity
 * 4. Equal specificity → prefer macronutrient over micronutrient
 * 5. Only generic symptoms → downgrade ALL to MONITOR + trigger clarification
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const NUTRITION_ARBITRATOR_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC SYMPTOMS - Non-diagnostic, shared across many causes
// ═══════════════════════════════════════════════════════════════════════════

export const GENERIC_SYMPTOM_KEYS = new Set([
  'LEAF_YELLOWING',
  'STUNTED_GROWTH',
  'POOR_TILLERING',
  'SLOW_GROWTH',
  'LEAF_DRYING',
  'LEAF_WILTING',
  'SYMPTOM_YELLOWING',
  'SYMPTOM_STUNTING',
  'POOR_VIGOR',
  'GENERAL_YELLOWING',
]);

// ═══════════════════════════════════════════════════════════════════════════
// ZINC-SPECIFIC SYMPTOMS - Required for zinc deficiency diagnosis
// ═══════════════════════════════════════════════════════════════════════════

export const ZINC_SPECIFIC_MARKERS = new Set([
  'INTERVEINAL_CHLOROSIS',
  'KHAIRA_DISEASE',       // Rice-specific zinc marker
  'SMALL_LEAVES',
  'BRONZING',
  'WHITE_PATCHES_YOUNG_LEAVES',
  'ROSETTING',
  'SHORT_INTERNODES',
  'ZINC_DEFICIENCY_CONFIRMED',
]);

// ═══════════════════════════════════════════════════════════════════════════
// MACRONUTRIENT vs MICRONUTRIENT CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

const MACRONUTRIENT_PATTERNS = [
  'NITROGEN', 'PHOSPHORUS', 'POTASSIUM', 'NPK',
  'UREA', 'DAP', 'MOP', 'SULFUR',
];

const MICRONUTRIENT_PATTERNS = [
  'ZINC', 'IRON', 'MANGANESE', 'BORON', 'COPPER',
  'MOLYBDENUM', 'MICRO',
];

export function isMacronutrientRule(ruleId: string, cause: string): boolean {
  const combined = `${ruleId} ${cause}`.toUpperCase();
  return MACRONUTRIENT_PATTERNS.some(p => combined.includes(p));
}

export function isMicronutrientRule(ruleId: string, cause: string): boolean {
  const combined = `${ruleId} ${cause}`.toUpperCase();
  return MICRONUTRIENT_PATTERNS.some(p => combined.includes(p));
}

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC SPECIFICITY SCORING
// ═══════════════════════════════════════════════════════════════════════════

export interface SpecificityScore {
  rule_id: string;
  score: number;       // 0-100
  has_specific_marker: boolean;
  generic_only: boolean;
  reason: string;
}

/**
 * Calculate diagnostic specificity score for a nutrition rule.
 * 
 * Rules with ONLY generic symptoms (LEAF_YELLOWING, STUNTED_GROWTH, POOR_TILLERING)
 * get a LOW specificity score, meaning they should NOT dominate.
 * 
 * Rules with nutrient-specific markers (INTERVEINAL_CHLOROSIS, soil Zn deficiency)
 * get a HIGH specificity score.
 */
export function calculateDiagnosticSpecificity(
  ruleId: string,
  cause: string,
  conditionsJson: Record<string, unknown> | null,
  observableCharacteristics: unknown,
  matchedObservations: string[]
): SpecificityScore {
  let score = 0;
  let hasSpecificMarker = false;
  const reasons: string[] = [];

  // 1. Check conditions_json for nutrient-specific keys
  if (conditionsJson) {
    const condKeys = Object.keys(conditionsJson);
    
    // Soil test evidence is highly specific
    const soilKeys = condKeys.filter(k => 
      k.includes('soil_') || k.includes('zn_') || k.includes('fe_') || 
      k.includes('deficiency') || k.includes('nutrient')
    );
    if (soilKeys.length > 0) {
      score += 40;
      hasSpecificMarker = true;
      reasons.push(`soil_evidence:${soilKeys.join(',')}`);
    }

    // Check observations array inside conditions_json
    const condObs = conditionsJson.observations;
    if (Array.isArray(condObs)) {
      const specificObs = condObs.filter((o: unknown) => {
        const obsStr = String(o).toUpperCase();
        return !GENERIC_SYMPTOM_KEYS.has(obsStr);
      });
      if (specificObs.length > 0) {
        score += 25;
        hasSpecificMarker = true;
        reasons.push(`specific_obs:${specificObs.slice(0, 3).join(',')}`);
      }
    }
  }

  // 2. Check observable_characteristics for specificity
  if (observableCharacteristics) {
    const chars = normalizeObservableChars(observableCharacteristics);
    const specificChars = chars.filter(c => !GENERIC_SYMPTOM_KEYS.has(c.toUpperCase()));
    if (specificChars.length > 0) {
      score += 20;
      hasSpecificMarker = true;
      reasons.push(`specific_chars:${specificChars.slice(0, 3).join(',')}`);
    }
  }

  // 3. Check matched observations for specificity
  const specificMatches = matchedObservations.filter(o => 
    !GENERIC_SYMPTOM_KEYS.has(o.toUpperCase())
  );
  if (specificMatches.length > 0) {
    score += 15;
    hasSpecificMarker = true;
    reasons.push(`specific_matches:${specificMatches.join(',')}`);
  }

  // 4. Penalty if ONLY generic symptoms
  const allObservations = [
    ...matchedObservations,
    ...(conditionsJson?.observations as string[] || []),
  ].map(o => String(o).toUpperCase());
  
  const nonGeneric = allObservations.filter(o => !GENERIC_SYMPTOM_KEYS.has(o));
  const genericOnly = allObservations.length > 0 && nonGeneric.length === 0;

  if (genericOnly) {
    score = Math.min(score, 10); // Cap at 10 if only generic
    reasons.push('GENERIC_ONLY');
  }

  return {
    rule_id: ruleId,
    score,
    has_specific_marker: hasSpecificMarker,
    generic_only: genericOnly,
    reason: reasons.join('; ') || 'no_specificity_signals',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ZINC RULE SPECIFICITY GATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Zinc Rule Restriction: SC_MICRO_ZN_DEFICIENCY_URGENT_001
 * 
 * MUST NOT fire on LEAF_YELLOWING alone.
 * Requires at least ONE of:
 *   - Zinc-specific symptom (INTERVEINAL_CHLOROSIS, KHAIRA, SMALL_LEAVES, etc.)
 *   - Soil Zn deficiency evidence (soil_zn < threshold)
 *   - Specificity score >= 30
 */
export function passesZincSpecificityGate(
  ruleId: string,
  matchedObservations: string[],
  facts: { soil_zn_deficient?: boolean; all_observations?: string[] }
): { passes: boolean; reason: string } {
  // Only applies to zinc deficiency rules
  if (!ruleId.toUpperCase().includes('ZN') && !ruleId.toUpperCase().includes('ZINC')) {
    return { passes: true, reason: 'not_zinc_rule' };
  }

  const allObs = [
    ...matchedObservations,
    ...(facts.all_observations || []),
  ].map(o => o.toUpperCase().replace(/[\s-]/g, '_'));

  // Check for zinc-specific markers
  const hasZincMarker = allObs.some(o => ZINC_SPECIFIC_MARKERS.has(o));
  if (hasZincMarker) {
    return { passes: true, reason: `zinc_marker_found:${allObs.filter(o => ZINC_SPECIFIC_MARKERS.has(o)).join(',')}` };
  }

  // Check for soil evidence
  if (facts.soil_zn_deficient === true) {
    return { passes: true, reason: 'soil_zn_deficiency_confirmed' };
  }

  // Only generic symptoms → BLOCK
  return { 
    passes: false, 
    reason: 'zinc_rule_blocked:no_zinc_specific_marker_or_soil_evidence' 
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MICRONUTRIENT SPECIFICITY GATE (Fe, Mn, S, and generic MICRO rules)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Symptoms that are specific to micronutrient deficiency.
 * A micronutrient rule MUST have at least one of these OR soil evidence to fire.
 */
export const MICRONUTRIENT_SPECIFIC_MARKERS = new Set([
  'INTERVEINAL_CHLOROSIS',
  'YOUNG_LEAF_YELLOWING',
  'YOUNG_LEAF_CHLOROSIS',
  'BRONZING',
  'WHITE_PATCHES_YOUNG_LEAVES',
  'ROSETTING',
  'SHORT_INTERNODES',
  'KHAIRA_DISEASE',
  'SMALL_LEAVES',
  'IRON_DEFICIENCY_CONFIRMED',
  'FE_DEFICIENCY_CONFIRMED',
  'MANGANESE_DEFICIENCY_CONFIRMED',
  'MN_DEFICIENCY_CONFIRMED',
  'SULPHUR_DEFICIENCY_CONFIRMED',
  'S_DEFICIENCY_CONFIRMED',
  'ZINC_DEFICIENCY_CONFIRMED',
  'MICRONUTRIENT_DEFICIENCY_CONFIRMED',
  'NUTRIENT_STRESS_SIGNAL',
]);

/**
 * Observations that have NO biological relationship to micronutrient deficiency.
 * If ONLY these are present, micronutrient rules MUST NOT fire.
 */
const NON_NUTRIENT_OBSERVATIONS = new Set([
  'GAPS_IN_FIELD',
  'HOLES_VISIBLE',
  'BORE_HOLES',
  'DEAD_HEART',
  'FRASS',
  'DRYING_WILTING',
  'PLANT_DEATH',
  'RED_ROT',
  'SMUT',
  'WILT',
  'ROOT_DAMAGE',
  'TERMITE_DAMAGE',
  'STEM_DAMAGE',
  'CHEWED_LEAVES',
  'WEBBING',
  'INSECT_PRESENT',
]);

/**
 * Micronutrient Specificity Gate: Blocks Fe/Mn/S/generic MICRO deficiency rules
 * when there is no specific nutrient-deficiency evidence.
 * 
 * PRINCIPLE: Absence of soil test data is NOT evidence of deficiency.
 * Micronutrient rules MUST require positive evidence before firing as URGENT treatments.
 */
export function passesMicronutrientSpecificityGate(
  ruleId: string,
  matchedObservations: string[],
  facts: { 
    soil_zn_deficient?: boolean; 
    soil_fe_deficient?: boolean;
    soil_mn_deficient?: boolean;
    soil_s_deficient?: boolean;
    all_observations?: string[];
  }
): { passes: boolean; reason: string } {
  const ruleIdUpper = ruleId.toUpperCase();
  
  // Only applies to micronutrient deficiency rules (Fe, Mn, S, generic MICRO)
  // Zinc is handled separately by passesZincSpecificityGate
  const isMicroRule = (
    ruleIdUpper.includes('FE_DEFICIENCY') ||
    ruleIdUpper.includes('MN_DEFICIENCY') ||
    ruleIdUpper.includes('S_DEFICIENCY') ||
    (ruleIdUpper.includes('MICRO') && ruleIdUpper.includes('DEFICIENCY'))
  );
  
  if (!isMicroRule) {
    return { passes: true, reason: 'not_micronutrient_deficiency_rule' };
  }

  const allObs = [
    ...matchedObservations,
    ...(facts.all_observations || []),
  ].map(o => o.toUpperCase().replace(/[\s-]/g, '_'));

  // Gate 1: If farmer reports pest/disease-specific observations, BLOCK nutrient rule
  const hasNonNutrientEvidence = allObs.some(o => NON_NUTRIENT_OBSERVATIONS.has(o));
  if (hasNonNutrientEvidence && !allObs.some(o => MICRONUTRIENT_SPECIFIC_MARKERS.has(o))) {
    return {
      passes: false,
      reason: `micronutrient_blocked:non_nutrient_observations_present(${allObs.filter(o => NON_NUTRIENT_OBSERVATIONS.has(o)).join(',')})`
    };
  }

  // Gate 2: Check for micronutrient-specific symptom markers
  const hasMicroMarker = allObs.some(o => MICRONUTRIENT_SPECIFIC_MARKERS.has(o));
  if (hasMicroMarker) {
    return { passes: true, reason: `micronutrient_marker_found:${allObs.filter(o => MICRONUTRIENT_SPECIFIC_MARKERS.has(o)).join(',')}` };
  }

  // Gate 3: Check for soil evidence
  if (ruleIdUpper.includes('FE') && facts.soil_fe_deficient === true) {
    return { passes: true, reason: 'soil_fe_deficiency_confirmed' };
  }
  if (ruleIdUpper.includes('MN') && facts.soil_mn_deficient === true) {
    return { passes: true, reason: 'soil_mn_deficiency_confirmed' };
  }
  if (ruleIdUpper.includes('S_DEF') && facts.soil_s_deficient === true) {
    return { passes: true, reason: 'soil_s_deficiency_confirmed' };
  }
  // Generic MICRO rule - any soil micronutrient deficiency
  if (facts.soil_fe_deficient === true || facts.soil_mn_deficient === true || 
      facts.soil_s_deficient === true || facts.soil_zn_deficient === true) {
    return { passes: true, reason: 'soil_micronutrient_deficiency_confirmed' };
  }

  // No specific evidence → BLOCK
  return { 
    passes: false, 
    reason: 'micronutrient_rule_blocked:no_specific_marker_or_soil_evidence' 
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DOMINANCE BLOCKING RULES
// ═══════════════════════════════════════════════════════════════════════════

export interface DominanceBlockResult {
  blocked: boolean;
  blocker: string;
  reason: string;
}

/**
 * Water Stress Dominance:
 * If WATER_STRESS_CONFIRMED exists → block ALL nutrient urgent treatments
 * until irrigation is normalized.
 */
export function checkWaterStressDominance(
  observations: string[],
  ruleActionType: string,
  ruleCategory: string
): DominanceBlockResult {
  const obsUpper = observations.map(o => o.toUpperCase());
  const isWaterStressConfirmed = obsUpper.includes('WATER_STRESS_CONFIRMED') ||
    obsUpper.includes('SOIL_TOO_DRY') ||
    obsUpper.includes('DROUGHT_STRESS');

  if (!isWaterStressConfirmed) {
    return { blocked: false, blocker: '', reason: 'no_water_stress' };
  }

  const isNutrientRule = ruleCategory?.toLowerCase().includes('nutrition') ||
    ruleCategory?.toLowerCase().includes('deficiency');
  const isUrgent = ruleActionType?.toUpperCase().includes('URGENT') ||
    ruleActionType?.toUpperCase().includes('IMMEDIATE');

  if (isNutrientRule && isUrgent) {
    return {
      blocked: true,
      blocker: 'WATER_STRESS_CONFIRMED',
      reason: 'Water stress blocks urgent nutrient treatments until irrigation normalized',
    };
  }

  return { blocked: false, blocker: '', reason: 'nutrient_rule_not_urgent' };
}

/**
 * Macronutrient Dominance:
 * If NITROGEN_DEFICIENCY_CONFIRMED exists → block micronutrient urgent treatments
 * UNLESS soil micronutrient deficiency is explicitly confirmed.
 */
export function checkMacronutrientDominance(
  observations: string[],
  ruleId: string,
  ruleCause: string,
  facts: { soil_zn_deficient?: boolean; soil_fe_deficient?: boolean }
): DominanceBlockResult {
  const obsUpper = observations.map(o => o.toUpperCase());
  const hasNitrogenConfirmed = obsUpper.includes('NITROGEN_DEFICIENCY_CONFIRMED');

  if (!hasNitrogenConfirmed) {
    return { blocked: false, blocker: '', reason: 'no_nitrogen_confirmed' };
  }

  if (!isMicronutrientRule(ruleId, ruleCause)) {
    return { blocked: false, blocker: '', reason: 'not_micronutrient_rule' };
  }

  // Exception: if soil micronutrient deficiency is explicitly confirmed, allow
  if (facts.soil_zn_deficient === true || facts.soil_fe_deficient === true) {
    return { 
      blocked: false, 
      blocker: '', 
      reason: 'soil_micronutrient_deficiency_confirmed_overrides_block' 
    };
  }

  return {
    blocked: true,
    blocker: 'NITROGEN_DEFICIENCY_CONFIRMED',
    reason: 'Nitrogen deficiency confirmed → micronutrient urgent treatments blocked without soil evidence',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NUTRITION CONFLICT ARBITRATION (Main Entry Point)
// ═══════════════════════════════════════════════════════════════════════════

export interface NutritionCandidate {
  rule_id: string;
  cause: string;
  action_type: string;
  category: string;
  priority: number;
  confidence_score: number;
  conditions_json: Record<string, unknown> | null;
  observable_characteristics: unknown;
  matched_conditions: string[];
}

export interface ArbitrationResult {
  selected: NutritionCandidate | null;
  blocked: NutritionCandidate[];
  downgraded_to_monitor: NutritionCandidate[];
  needs_clarification: boolean;
  reason: string;
}

/**
 * Arbitrate between multiple nutrition rule candidates.
 * 
 * Pipeline:
 * 1. Apply water stress dominance block
 * 2. Apply macronutrient dominance block
 * 3. Apply zinc specificity gate
 * 4. Score remaining by diagnostic specificity
 * 5. If equal specificity → prefer macro over micro
 * 6. If only generic symptoms → downgrade ALL to MONITOR
 */
export function arbitrateNutritionRules(
  candidates: NutritionCandidate[],
  allObservations: string[],
  facts: {
    soil_zn_deficient?: boolean;
    soil_fe_deficient?: boolean;
    all_observations?: string[];
  }
): ArbitrationResult {
  if (candidates.length === 0) {
    return { selected: null, blocked: [], downgraded_to_monitor: [], needs_clarification: false, reason: 'no_candidates' };
  }

  if (candidates.length === 1) {
    // Still check zinc gate for single candidate
    const c = candidates[0];
    const zincGate = passesZincSpecificityGate(c.rule_id, c.matched_conditions, facts);
    if (!zincGate.passes) {
      return {
        selected: null,
        blocked: [c],
        downgraded_to_monitor: [],
        needs_clarification: true,
        reason: `single_candidate_blocked:${zincGate.reason}`,
      };
    }
    return { selected: c, blocked: [], downgraded_to_monitor: [], needs_clarification: false, reason: 'single_candidate' };
  }

  const blocked: NutritionCandidate[] = [];
  const remaining: NutritionCandidate[] = [];

  for (const c of candidates) {
    // Water stress dominance
    const waterBlock = checkWaterStressDominance(allObservations, c.action_type, c.category);
    if (waterBlock.blocked) {
      console.log(`🚫 [NutritionArbitrator] ${c.rule_id} blocked by ${waterBlock.blocker}: ${waterBlock.reason}`);
      blocked.push(c);
      continue;
    }

    // Macronutrient dominance
    const macroBlock = checkMacronutrientDominance(allObservations, c.rule_id, c.cause, facts);
    if (macroBlock.blocked) {
      console.log(`🚫 [NutritionArbitrator] ${c.rule_id} blocked by ${macroBlock.blocker}: ${macroBlock.reason}`);
      blocked.push(c);
      continue;
    }

    // Zinc specificity gate
    const zincGate = passesZincSpecificityGate(c.rule_id, c.matched_conditions, facts);
    if (!zincGate.passes) {
      console.log(`🚫 [NutritionArbitrator] ${c.rule_id} zinc gate failed: ${zincGate.reason}`);
      blocked.push(c);
      continue;
    }

    remaining.push(c);
  }

  if (remaining.length === 0) {
    return {
      selected: null,
      blocked,
      downgraded_to_monitor: [],
      needs_clarification: true,
      reason: 'all_candidates_blocked',
    };
  }

  // Score by diagnostic specificity
  const scored = remaining.map(c => ({
    candidate: c,
    specificity: calculateDiagnosticSpecificity(
      c.rule_id, c.cause, c.conditions_json,
      c.observable_characteristics, c.matched_conditions
    ),
  }));

  // Check if ALL remaining have only generic symptoms → downgrade to MONITOR
  const allGenericOnly = scored.every(s => s.specificity.generic_only);
  if (allGenericOnly) {
    console.log(`⚠️ [NutritionArbitrator] All ${scored.length} candidates are GENERIC_ONLY → downgrade to MONITOR`);
    return {
      selected: null,
      blocked,
      downgraded_to_monitor: remaining,
      needs_clarification: true,
      reason: 'all_generic_only:downgrade_to_monitor',
    };
  }

  // Sort by specificity score DESC, then macro > micro, then priority
  scored.sort((a, b) => {
    // Specificity first
    if (a.specificity.score !== b.specificity.score) {
      return b.specificity.score - a.specificity.score;
    }
    // Macro > micro
    const aMacro = isMacronutrientRule(a.candidate.rule_id, a.candidate.cause);
    const bMacro = isMacronutrientRule(b.candidate.rule_id, b.candidate.cause);
    if (aMacro !== bMacro) return aMacro ? -1 : 1;
    // Priority
    return b.candidate.priority - a.candidate.priority;
  });

  const selected = scored[0].candidate;
  console.log(`✅ [NutritionArbitrator] Selected ${selected.rule_id} (specificity=${scored[0].specificity.score}, reason=${scored[0].specificity.reason})`);

  return {
    selected,
    blocked,
    downgraded_to_monitor: [],
    needs_clarification: false,
    reason: `selected_by_specificity:${scored[0].specificity.reason}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE AUDIT: Flag nutrition rules with only generic symptoms
// ═══════════════════════════════════════════════════════════════════════════

export interface GenericRuleAuditResult {
  rule_id: string;
  cause: string;
  category: string;
  all_condition_observations: string[];
  specific_observations: string[];
  generic_observations: string[];
  flagged: boolean;
  recommendation: string;
}

/**
 * Audit a nutrition rule for generic-only symptom conditions.
 * Flags rules where conditions_json contains ONLY generic symptoms
 * (LEAF_YELLOWING, STUNTED_GROWTH, POOR_TILLERING) without
 * nutrient-specific markers.
 */
export function auditNutritionRuleSpecificity(
  ruleId: string,
  cause: string,
  category: string,
  conditionsJson: Record<string, unknown> | null,
  observableCharacteristics: unknown
): GenericRuleAuditResult {
  const allObs: string[] = [];

  // Extract observations from conditions_json
  if (conditionsJson) {
    if (Array.isArray(conditionsJson.observations)) {
      allObs.push(...(conditionsJson.observations as string[]).map(o => String(o).toUpperCase()));
    }
    // Also check boolean flags that are observation keys
    for (const [key, val] of Object.entries(conditionsJson)) {
      if (val === true && key !== 'is_active') {
        allObs.push(key.toUpperCase());
      }
    }
  }

  // Extract from observable_characteristics
  const chars = normalizeObservableChars(observableCharacteristics);
  allObs.push(...chars.map(c => c.toUpperCase()));

  const genericObs = allObs.filter(o => GENERIC_SYMPTOM_KEYS.has(o));
  const specificObs = allObs.filter(o => !GENERIC_SYMPTOM_KEYS.has(o));

  const flagged = allObs.length > 0 && specificObs.length === 0;

  return {
    rule_id: ruleId,
    cause,
    category,
    all_condition_observations: allObs,
    specific_observations: specificObs,
    generic_observations: genericObs,
    flagged,
    recommendation: flagged
      ? `REWRITE_REQUIRED: Rule ${ruleId} has ONLY generic symptoms (${genericObs.join(', ')}). Add nutrient-specific markers or soil evidence conditions.`
      : `OK: Rule ${ruleId} has ${specificObs.length} specific markers.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function normalizeObservableChars(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((r: unknown) => {
      if (typeof r === 'string') return r;
      if (r && typeof r === 'object' && 'observation_key' in (r as Record<string, unknown>)) {
        return String((r as Record<string, unknown>).observation_key);
      }
      return '';
    }).filter(Boolean);
  }
  if (typeof raw === 'object') {
    const keys = Object.keys(raw as Record<string, unknown>);
    return keys.filter(k => (raw as Record<string, boolean>)[k] === true);
  }
  return [];
}

export default {
  NUTRITION_ARBITRATOR_VERSION,
  GENERIC_SYMPTOM_KEYS,
  ZINC_SPECIFIC_MARKERS,
  MICRONUTRIENT_SPECIFIC_MARKERS,
  calculateDiagnosticSpecificity,
  passesZincSpecificityGate,
  passesMicronutrientSpecificityGate,
  checkWaterStressDominance,
  checkMacronutrientDominance,
  arbitrateNutritionRules,
  auditNutritionRuleSpecificity,
  isMacronutrientRule,
  isMicronutrientRule,
};
