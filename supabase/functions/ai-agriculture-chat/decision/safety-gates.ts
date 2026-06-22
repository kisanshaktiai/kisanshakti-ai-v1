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

import { shouldEnforceClarificationFailClosed } from '../runtime/feature-flags.ts';

export const SAFETY_GATES_VERSION = '1.3.0'; // Wave A.5b: fail-closed CLARIFICATION_GATE behind feature flag

// Symptoms specific enough to NOT require clarification.
// LEAF_TIP_BURN_YOUNG, WILTING, LEAF_YELLOWING are deliberately low-specificity.
export const LOW_SPECIFICITY_THRESHOLD = 50;

const UNSAFE_FOLIAR_INGREDIENTS = [
  'muriate of potash', 'mop', 'kcl', 'potassium chloride'
];

const DEFICIENCY_CATEGORIES = new Set(['nutrition', 'deficiency', '05_soil', '05_nutrition']);

// WAVE 2 FIX (P0/P1-5): Only treatment-class actions are subject to the
// foliar safety gate. Monitor / advisory / block rules are not prescriptions
// and must not be silently rejected for missing product metadata.
const FOLIAR_GATE_ACTION_TYPES = new Set([
  'RECOMMEND',
  'APPLY_TREATMENT',
  'URGENT_ACTION',
  'IMMEDIATE_ACTION',
  'RELEASE_BIOCONTROL',
]);

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
    category?: string | null;
    canonical_group?: string | null;
    crop_age_days_max?: number | null;
    crop_age_days_min?: number | null;
    application_method?: string | null;
    active_ingredient?: string | null;
    water_volume_per_acre?: string | null;
    dosage_per_acre?: string | number | null;
    action_type?: string | null;
  }>;
  current_confidence: number; // 0..1

  // WAVE 2 FIX (P1-5): DB-driven differential questions, keyed by
  // observation_code. Caller loads this once per request from
  // public.observation_differential_questions for (language, crop_code) and
  // hands it to the gate.
  differential_questions?: Record<string, string>;

  // BYPASS SIGNAL (2026-06-21): when the unified decision gate has already
  // confirmed a SAFE OBSERVATION rule (e.g. young-crop monitoring/resow
  // decision), safety-gates must NOT downgrade to CLARIFY purely on
  // low-confidence caps. Hard safety triggers (foliar, contradiction,
  // NDVI-vs-nutrient, low discriminator) still apply.
  confirmed_safe_rule_bypass?: boolean;
  response_mode?: string;
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

/**
 * Returns the localized differential question for a symptom from the DB.
 *
 * CRITICAL (v1.2.0, 2026-06-07 RCA #18): returns `null` when the DB has no
 * row for (symptom × language × crop). The caller MUST treat null as
 * "do NOT force CLARIFY" and let the orchestrator fall through to the
 * stage-aware deterministic advisory. The previous English fallback
 *   `The symptom "${symptom}" you reported on …`
 * leaked the literal variable name `symptom` (translated by the LLM as
 * the Marathi word `लक्षण`) into farmer-facing replies whenever an
 * observation was not yet seeded in observation_differential_questions.
 *
 * SSOT: public.observation_differential_questions
 *   (observation_code, language, crop_code, question_text)
 */
function diffQuestionForSymptom(
  symptom: string,
  _crop: string,
  _language: string,
  lookup?: Record<string, string>
): string | null {
  if (lookup && lookup[symptom] && lookup[symptom].trim().length > 0) {
    return lookup[symptom];
  }
  return null;
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
  // WAVE 2 FIX (P1-4): Only run for treatment-class action types AND only
  // when the candidate has dosage_per_acre. Otherwise the gate spuriously
  // rejects monitor/advisory/clarification rules across non-sugarcane crops
  // (which today lack product metadata) and degrades them to clarifications.
  const foliarRejects: string[] = [];
  const foliarSkippedAdvisory: string[] = [];
  for (const r of input.candidate_rules) {
    const actionUpper = (r.action_type || '').toUpperCase();
    const isTreatment = FOLIAR_GATE_ACTION_TYPES.has(actionUpper);
    if (!isTreatment) {
      foliarSkippedAdvisory.push(r.rule_id);
      continue;
    }
    const hasDosage = r.dosage_per_acre !== null
      && r.dosage_per_acre !== undefined
      && String(r.dosage_per_acre).trim() !== '';
    if (!hasDosage) {
      // No prescription payload → not a foliar prescription; skip safely.
      foliarSkippedAdvisory.push(r.rule_id);
      continue;
    }
    const method = (r.application_method || '').toUpperCase();
    const ingredient = (r.active_ingredient || '').toLowerCase();
    const isFoliar = method.includes('FOLIAR') || method.includes('SPRAY');
    if (!isFoliar) continue;
    const missingWater = !r.water_volume_per_acre;
    const isUnsafeMop = UNSAFE_FOLIAR_INGREDIENTS.some(s => ingredient.includes(s));
    if (missingWater || isUnsafeMop) {
      foliarRejects.push(r.rule_id);
    }
  }
  if (foliarRejects.length > 0) {
    result.rejected_rule_ids.push(...foliarRejects);
    result.gate_decisions.FOLIAR_SAFETY_GATE = {
      passed: false,
      reason: `FOLIAR_UNSAFE: ${foliarRejects.length} treatment rule(s) rejected (missing water volume or unsafe MOP/KCl foliar)`,
      data: { rejected: foliarRejects, skipped_advisory: foliarSkippedAdvisory.length }
    };
  } else {
    result.gate_decisions.FOLIAR_SAFETY_GATE = {
      passed: true,
      reason: `All eligible foliar treatments safe (advisory/monitor skipped: ${foliarSkippedAdvisory.length})`
    };
  }

  // ── NDVI_SANITY_GATE ──────────────────────────────────────────────────────
  const ndvi = input.ndvi;
  const ndviAnomalous = ndvi !== null && ndvi !== undefined && (ndvi < 0.2 || ndvi > 0.95);
  const isNutrientDecision = input.candidate_rules.some(r => {
    const category = String(r.category || '').toLowerCase();
    const group = String(r.canonical_group || '').toLowerCase();
    return DEFICIENCY_CATEGORIES.has(category) || DEFICIENCY_CATEGORIES.has(group) || group.includes('nutri');
  }) || /NUTRI|DEFIC|POTASSIUM|NITROGEN|PHOSPHORUS|ZINC|IRON|BORON|MAGNESIUM/i.test(input.primary_hypothesis_id || '');
  if (ndviAnomalous && isNutrientDecision) {
    result.gate_decisions.NDVI_SANITY_GATE = {
      passed: false,
      reason: `NDVI_ANOMALOUS: value=${ndvi} outside [0.2, 0.95] — blocking nutrient-deficiency rules; photo required`,
      data: { ndvi, nutrient_decision: true }
    };
  } else {
    result.gate_decisions.NDVI_SANITY_GATE = {
      passed: true,
      reason: ndvi === null || ndvi === undefined
        ? 'NDVI unavailable'
        : ndviAnomalous
          ? `NDVI=${ndvi} anomalous but current decision is not nutrient-deficiency scoped`
          : `NDVI=${ndvi} within sanity range`
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
  if (ndviAnomalous && isNutrientDecision) {
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

  // CRITICAL FIX (2026-06-07 RCA #17): never invent a fake "symptom" clarification.
  // If the farmer reported ZERO symptoms (e.g. status/health-check questions like
  // "what is my crop's current condition?"), do NOT emit a clarification built
  // from the literal string 'symptom' — that template gets force-translated and
  // surfaces as the nonsensical quoted token `"symptom"` / `"लक्षण"` to farmers.
  // In that case leave override_mode = NONE so the upstream orchestrator's
  // STAGE_ADVISORY_FALLBACK lane handles the response with crop + stage + DAS.
  const hasAnyReportedSymptom = (input.symptom_keys?.length ?? 0) > 0;

  // BYPASS: unified gate already confirmed a SAFE rule (OBSERVATION mode).
  // Suppress the low-confidence clarify trigger; keep hard safety triggers.
  const isSafeBypass = input.confirmed_safe_rule_bypass === true
    || input.response_mode === 'OBSERVATION';

  const mustClarify =
    hasAnyReportedSymptom && (
      contradicted ||
      (ndviAnomalous && isNutrientDecision) ||
      !!lowSpecSymptom ||
      (!isSafeBypass && cappedConf < 0.45)
    );


  if (mustClarify) {
    const sym = lowSpecSymptom || input.symptom_keys[0]; // guaranteed non-empty by hasAnyReportedSymptom
    const diffText = diffQuestionForSymptom(sym, input.crop_name || '', language, input.differential_questions);

    // RCA #18 (original): if the DB has no localized differential question for
    // this (symptom, language), we used to silently SKIP clarify so the literal
    // English `"symptom"` template wouldn't surface. That silent-pass turned
    // out to bypass CLARIFY for 99% of cases in production (forensic audit
    // WS16, RC-22).
    //
    // WAVE A.5b FIX:
    //   - ALWAYS emit a structured `MISSING_DIFFERENTIAL_QUESTION` log so
    //     ops can populate the DB row.
    //   - In `enforce` mode → fail-closed (force CLARIFY with a generic
    //     non-template question), instead of silently passing.
    //   - In `shadow` mode → preserve current behaviour (skip) but with
    //     the loud log so dashboards can size the impact.
    if (!diffText) {
      // Lazy-import to avoid circular deps
      const { shouldEnforceClarificationFailClosed } = await import('../runtime/feature-flags.ts');
      const enforce = shouldEnforceClarificationFailClosed();

      console.warn(
        `🚨 [SafetyGates:MISSING_DIFFERENTIAL_QUESTION] trace=${input.trace_id ?? 'n/a'} ` +
        `symptom=${sym} crop=${input.crop_name ?? 'n/a'} lang=${language} ` +
        `mode=${enforce ? 'enforce(fail-closed)' : 'shadow(legacy-skip)'} ` +
        `→ populate observation_differential_questions.`
      );

      if (enforce) {
        result.clarification_text = ''; // orchestrator generates a generic stage-aware question
        result.override_mode = 'CLARIFY';
        result.gate_decisions.CLARIFICATION_GATE = {
          passed: false,
          reason: `Fail-closed: no DB differential question for (symptom='${sym}', lang='${language}'). Forcing CLARIFY via stage-aware fallback.`,
          data: { trigger_symptom: sym, missing_db_question: true, language, enforce: true }
        };
      } else {
        result.gate_decisions.CLARIFICATION_GATE = {
          passed: true,
          reason: `[SHADOW] Would have clarified on '${sym}' but observation_differential_questions has no DB row for language='${language}'. Falling through to stage advisory.`,
          data: { skipped_clarify: true, symptom: sym, language, shadow: true }
        };
      }
    } else {
      result.clarification_text = diffText;
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
    }
  } else {
    result.gate_decisions.CLARIFICATION_GATE = {
      passed: true,
      reason: isSafeBypass && hasAnyReportedSymptom && cappedConf < 0.45
        ? `Bypassed: unified gate confirmed SAFE rule (OBSERVATION mode), conf=${cappedConf.toFixed(2)} cap ignored`
        : 'Specificity, NDVI, contradiction and confidence all OK',
      data: { safe_bypass: isSafeBypass }
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
