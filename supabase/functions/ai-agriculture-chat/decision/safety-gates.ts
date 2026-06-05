/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAFETY GATES (P0 Hotfix v1.0.0) — post-unified-gate safety harness
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Five layered gates enforced AFTER the symbolic engine but BEFORE any
 * RECOMMEND action reaches the LLM narration layer:
 *
 *   1. CONFIDENCE_GATE     — cap confidence on weak evidence
 *   2. CLARIFICATION_GATE  — force differential turn on low-specificity symptoms
 *   3. NDVI_SANITY_GATE    — block nutrient diagnoses when NDVI is out-of-range
 *   4. STAGE_GATE          — hard-reject rules past their crop_age_days_max
 *   5. FOLIAR_SAFETY_GATE  — block unsafe MOP foliar sprays / missing water volume
 *
 * The gate produces a single SafetyGateResult, which the orchestrator MUST
 * persist into ai_chat_audit_logs.gate_decisions and use to override the
 * unified-gate response mode when a violation is detected.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const SAFETY_GATES_VERSION = '1.0.0';

// Symptoms specific enough to NOT require clarification.
// LEAF_TIP_BURN_YOUNG, WILTING, LEAF_YELLOWING are deliberately low-specificity.
export const LOW_SPECIFICITY_THRESHOLD = 50;

const UNSAFE_FOLIAR_INGREDIENTS = [
  'muriate of potash', 'mop', 'kcl', 'potassium chloride'
];

const DEFICIENCY_CATEGORIES = new Set(['nutrition', 'deficiency', '05_soil', '05_nutrition']);

export interface SafetyGateInput {
  trace_id?: string;
  crop_name?: string;
  growth_stage?: string;
  days_since_sowing?: number | null;

  // canonical inputs
  symptom_keys: string[];
  symptom_discriminator_scores?: Record<string, number>;
  number_of_distinct_observations: number;
  photo_present: boolean;

  // soil + sensor canonical state
  soil_potassium_kg_ha?: number | null;
  soil_potassium_band?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  soil_nitrogen_band?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  ndvi?: number | null;

  // symbolic engine output
  primary_hypothesis_id?: string | null;
  primary_decision_rule_id?: string | null;
  candidate_rules: Array<{
    rule_id: string;
    crop_age_days_max?: number | null;
    crop_age_days_min?: number | null;
    application_method?: string | null;
    active_ingredient?: string | null;
    water_volume_per_acre?: string | null;
    action_type?: string | null;
  }>;
  current_confidence: number; // 0..1
}

export interface GateDecisionEntry {
  passed: boolean;
  reason: string;
  data?: Record<string, any>;
}

export interface SafetyGateResult {
  version: string;
  override_mode: 'NONE' | 'CLARIFY' | 'BLOCK';
  effective_confidence: number;
  rejected_rule_ids: string[];
  clarification_text?: string;
  gate_decisions: {
    CONFIDENCE_GATE: GateDecisionEntry;
    CLARIFICATION_GATE: GateDecisionEntry;
    NDVI_SANITY_GATE: GateDecisionEntry;
    STAGE_GATE: GateDecisionEntry;
    FOLIAR_SAFETY_GATE: GateDecisionEntry;
  };
}

function diffQuestionForSymptom(symptom: string, crop: string, language: string): string {
  // English first (LLM narrator translates); native fallback for hi/mr.
  const en = (s: string) => s;
  if (symptom === 'LEAF_TIP_BURN_YOUNG') {
    if (language === 'hi') {
      return 'युवा ऊपरी पत्तियों के सिरों का जलना कई कारणों से हो सकता है — कैल्शियम/बोरॉन की कमी, खारापन, या उर्वरक की चोट। पोटाश की कमी आमतौर पर पुरानी निचली पत्तियों पर पहले दिखती है। कृपया बताएं: (1) क्या निचली पुरानी पत्तियाँ भी प्रभावित हैं? (2) मिट्टी पर सफेद नमक की परत है? (3) पिछले 15 दिनों में कोई उर्वरक डाला? और प्रभावित पत्तियों की एक फोटो भेजें।';
    }
    if (language === 'mr') {
      return 'तरुण वरच्या पानांच्या टोकाचे जळणे अनेक कारणांमुळे होऊ शकते — कॅल्शियम/बोरॉनची कमतरता, क्षारता किंवा खताची इजा. पोटॅशियमची कमतरता सहसा जुन्या खालच्या पानांवर प्रथम दिसते. कृपया सांगा: (1) खालची जुनी पाने पण प्रभावित आहेत का? (2) मातीवर पांढरा क्षाराचा थर आहे का? (3) मागील 15 दिवसांत कोणते खत दिले? आणि प्रभावित पानांचा फोटो पाठवा.';
    }
    return en(`Tip burn on young upper leaves can have several causes: calcium deficiency, boron deficiency, salinity, or salt injury. Potassium deficiency usually shows on older lower leaves first, so we need to rule it out. Please send a photo of the affected leaves and tell me: (1) are the lower older leaves also affected? (2) is there any white salt deposit on the soil? (3) was any fertilizer applied in the last 15 days?`);
  }
  // generic differential
  return `The symptom "${symptom}" you reported on ${crop || 'the crop'} can have several causes. Please share a clear photo and tell me which leaves are affected (young upper, or older lower) so I can give a safe, targeted recommendation.`;
}

/**
 * Run the full safety-gate harness. Pure function — no side effects.
 */
export function runSafetyGates(input: SafetyGateInput, language: string = 'en'): SafetyGateResult {
  const result: SafetyGateResult = {
    version: SAFETY_GATES_VERSION,
    override_mode: 'NONE',
    effective_confidence: input.current_confidence,
    rejected_rule_ids: [],
    gate_decisions: {
      CONFIDENCE_GATE: { passed: true, reason: 'not-evaluated' },
      CLARIFICATION_GATE: { passed: true, reason: 'not-evaluated' },
      NDVI_SANITY_GATE: { passed: true, reason: 'not-evaluated' },
      STAGE_GATE: { passed: true, reason: 'not-evaluated' },
      FOLIAR_SAFETY_GATE: { passed: true, reason: 'not-evaluated' },
    }
  };

  // ── STAGE_GATE ────────────────────────────────────────────────────────────
  const das = input.days_since_sowing ?? null;
  const stageRejects: string[] = [];
  if (das !== null) {
    for (const r of input.candidate_rules) {
      if (r.crop_age_days_max !== null && r.crop_age_days_max !== undefined && das > r.crop_age_days_max) {
        stageRejects.push(r.rule_id);
      }
    }
  }
  if (stageRejects.length > 0) {
    result.rejected_rule_ids.push(...stageRejects);
    result.gate_decisions.STAGE_GATE = {
      passed: false,
      reason: `STAGE_LIMIT_EXCEEDED: ${stageRejects.length} rule(s) rejected for DAS=${das}`,
      data: { rejected: stageRejects, das }
    };
  } else {
    result.gate_decisions.STAGE_GATE = {
      passed: true,
      reason: `DAS=${das ?? 'unknown'} within all candidate rule windows`
    };
  }

  // ── FOLIAR_SAFETY_GATE ────────────────────────────────────────────────────
  const foliarRejects: string[] = [];
  for (const r of input.candidate_rules) {
    const method = (r.application_method || '').toUpperCase();
    const ingredient = (r.active_ingredient || '').toLowerCase();
    const isFoliar = method.includes('FOLIAR') || method.includes('SPRAY');
    const missingWater = !r.water_volume_per_acre;
    const isUnsafeMop = UNSAFE_FOLIAR_INGREDIENTS.some(s => ingredient.includes(s));
    if ((isFoliar && missingWater) || (isFoliar && isUnsafeMop)) {
      foliarRejects.push(r.rule_id);
    }
  }
  if (foliarRejects.length > 0) {
    result.rejected_rule_ids.push(...foliarRejects);
    result.gate_decisions.FOLIAR_SAFETY_GATE = {
      passed: false,
      reason: `FOLIAR_UNSAFE: ${foliarRejects.length} rule(s) rejected (missing water volume or unsafe MOP/KCl foliar)`,
      data: { rejected: foliarRejects }
    };
  } else {
    result.gate_decisions.FOLIAR_SAFETY_GATE = {
      passed: true,
      reason: 'All foliar rules have safe ingredient + water volume'
    };
  }

  // ── NDVI_SANITY_GATE ──────────────────────────────────────────────────────
  const ndvi = input.ndvi;
  const ndviAnomalous = ndvi !== null && ndvi !== undefined && (ndvi < 0.2 || ndvi > 0.95);
  if (ndviAnomalous) {
    result.gate_decisions.NDVI_SANITY_GATE = {
      passed: false,
      reason: `NDVI_ANOMALOUS: value=${ndvi} outside [0.2, 0.95] — blocking nutrient-deficiency rules; photo required`,
      data: { ndvi }
    };
  } else {
    result.gate_decisions.NDVI_SANITY_GATE = {
      passed: true,
      reason: ndvi === null || ndvi === undefined ? 'NDVI unavailable' : `NDVI=${ndvi} within sanity range`
    };
  }

  // ── CONTRADICTION CHECK: K_DEFICIENCY vs HIGH soil K  ────────────────────
  const primary = (input.primary_hypothesis_id || '').toUpperCase();
  const isKDeficiencyDiag = primary.includes('K_DEFIC') || primary.includes('POTASSIUM');
  const soilKHigh = input.soil_potassium_band === 'HIGH'
    || (input.soil_potassium_kg_ha !== null && input.soil_potassium_kg_ha !== undefined && input.soil_potassium_kg_ha > 200);
  const contradicted = isKDeficiencyDiag && soilKHigh;

  // ── CONFIDENCE_GATE (apply caps) ──────────────────────────────────────────
  let cappedConf = input.current_confidence;
  const caps: string[] = [];

  if (input.number_of_distinct_observations < 2) {
    cappedConf = Math.min(cappedConf, 0.40);
    caps.push('obs<2→0.40');
  }
  if (!input.photo_present) {
    cappedConf = Math.min(cappedConf, 0.55);
    caps.push('no_photo→0.55');
  }
  const minDiscriminator = Math.min(
    ...input.symptom_keys.map(k => input.symptom_discriminator_scores?.[k] ?? 100)
  );
  if (Number.isFinite(minDiscriminator) && minDiscriminator < LOW_SPECIFICITY_THRESHOLD) {
    cappedConf = Math.min(cappedConf, 0.50);
    caps.push(`discriminator<50(${minDiscriminator})→0.50`);
  }
  if (contradicted) {
    cappedConf = 0;
    caps.push('contradiction(K_HIGH)→0.00');
  }
  if (ndviAnomalous && DEFICIENCY_CATEGORIES.size > 0) {
    cappedConf = Math.min(cappedConf, 0.40);
    caps.push('ndvi_anomaly→0.40');
  }

  result.effective_confidence = cappedConf;
  result.gate_decisions.CONFIDENCE_GATE = {
    passed: caps.length === 0,
    reason: caps.length === 0
      ? `No confidence caps applied (conf=${cappedConf.toFixed(2)})`
      : `Confidence capped ${input.current_confidence.toFixed(2)} → ${cappedConf.toFixed(2)} [${caps.join('; ')}]`,
    data: { caps, before: input.current_confidence, after: cappedConf }
  };

  // ── CLARIFICATION_GATE ────────────────────────────────────────────────────
  const lowSpecSymptom = input.symptom_keys.find(k =>
    (input.symptom_discriminator_scores?.[k] ?? 100) < LOW_SPECIFICITY_THRESHOLD
  );

  const mustClarify =
    contradicted ||
    ndviAnomalous ||
    !!lowSpecSymptom ||
    cappedConf < 0.45;

  if (mustClarify) {
    const sym = lowSpecSymptom || input.symptom_keys[0] || 'symptom';
    result.clarification_text = diffQuestionForSymptom(sym, input.crop_name || '', language);
    result.override_mode = 'CLARIFY';
    result.gate_decisions.CLARIFICATION_GATE = {
      passed: false,
      reason: contradicted
        ? 'Forcing CLARIFY: primary hypothesis contradicted by soil-K'
        : ndviAnomalous
          ? 'Forcing CLARIFY: NDVI anomaly blocks nutrient diagnosis'
          : lowSpecSymptom
            ? `Forcing CLARIFY: low-specificity symptom ${lowSpecSymptom} (score=${input.symptom_discriminator_scores?.[lowSpecSymptom]})`
            : `Forcing CLARIFY: effective confidence ${cappedConf.toFixed(2)} below 0.45`,
      data: { trigger_symptom: lowSpecSymptom, contradicted, ndvi_anomalous: ndviAnomalous }
    };
  } else {
    result.gate_decisions.CLARIFICATION_GATE = {
      passed: true,
      reason: 'Specificity, NDVI, contradiction and confidence all OK'
    };
  }

  // Final override: if foliar safety failed AND no surviving rule, force CLARIFY
  if (foliarRejects.length > 0 && result.override_mode === 'NONE') {
    result.override_mode = 'BLOCK';
  }

  if (input.trace_id) {
    console.log(`🛡️ [SafetyGates ${input.trace_id}] mode=${result.override_mode} conf=${cappedConf.toFixed(2)} stageRej=${stageRejects.length} foliarRej=${foliarRejects.length} ndviOK=${result.gate_decisions.NDVI_SANITY_GATE.passed}`);
  }

  return result;
}
