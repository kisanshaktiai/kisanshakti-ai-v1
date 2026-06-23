/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC DIFFERENTIAL ENRICHER (Wave P, Stage 1+2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Purpose
 * -------
 * When the Unified Decision Gate returns DIAGNOSTIC_ESCALATION because the
 * symbolic brain's confidence is below the treatment threshold, the response
 * we send to the farmer MUST include:
 *
 *   1. A ranked list of possible causes ("hypotheses") — never an empty list.
 *   2. A set of selectable observation chips ("clarification_chips") that
 *      the farmer can tap to assert one of the differentiating signs.
 *
 * This module derives both from `evaluateCandidateHypotheses` (the existing
 * symbolic hypothesis evaluator) using crop / stage / DAS / NDVI / observations
 * already present in the request context. No new database tables are required.
 *
 * Pre-Wave-P bug: `unified-decision-gate.ts` passed `matched_rules: []` into
 * the diagnostic escalation generator, and `index.ts` read the (empty)
 * `metadata.matchedRules` field. The farmer-facing response collapsed to a
 * single tautological yes/no question. This enricher closes that gap.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  evaluateCandidateHypotheses,
  type CandidateHypothesis,
} from "./hypothesis-evaluator.ts";

export const DIAGNOSTIC_DIFFERENTIAL_ENRICHER_VERSION = "1.0.0";

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

export interface DifferentialEnrichmentInput {
  supabase: any;
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  observations: string[];
  ndvi_level?: any;
  ndvi_trend?: any;
  user_query: string;
  language: "mr" | "hi" | "en" | string;
  trace_id: string;
  variety_id?: string | null;
  variety_resistance?: any;
}

export interface DifferentialMatchedRule {
  rule_id: string;
  cause_code: string;
  cause_name?: string;
  category?: string;
  confidence: number;
  matching_conditions: string[];
  missing_conditions: string[];
  potential_treatments?: string[];
}

export interface DifferentialChip {
  /** Localized text shown on the chip */
  label: string;
  /** Value posted back when the farmer taps (the observation_code) */
  value: string;
  /** Short cause label rendered as helper text */
  description?: string;
  /** observation_master.code asserted on selection */
  observation_key: string;
  /** Cause this chip points to */
  cause_code: string;
  /** Confidence lift applied when the farmer confirms this chip */
  confidence_lift: number;
}

export interface DifferentialEnrichmentResult {
  matched_rules: DifferentialMatchedRule[];
  clarification_chips: DifferentialChip[];
  clarification_question: string;
  top_confidence: number;
  candidate_count: number;
  enricher_version: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Localized clarification prompt
// ───────────────────────────────────────────────────────────────────────────

const CHIP_QUESTION: Record<string, string> = {
  mr: "तुमच्या शेतात यापैकी कोणतं लक्षण दिसतं? सर्वात जवळचा पर्याय निवडा",
  hi: "क्या आप इनमें से कोई लक्षण देख रहे हैं? सबसे निकट विकल्प चुनें",
  en: "Which of these signs match what you see? Tap the closest match",
};

function pickLabel(
  oc: { label_en?: string; label_hi?: string; label_mr?: string; observation_key: string },
  language: string,
): string {
  if (language === "mr" && oc.label_mr) return oc.label_mr;
  if (language === "hi" && oc.label_hi) return oc.label_hi;
  return oc.label_en || oc.observation_key;
}

// ───────────────────────────────────────────────────────────────────────────
// Main entry
// ───────────────────────────────────────────────────────────────────────────

export async function enrichDiagnosticDifferential(
  input: DifferentialEnrichmentInput,
): Promise<DifferentialEnrichmentResult> {
  const evalOut = await evaluateCandidateHypotheses({
    crop_code: input.crop_code,
    growth_stage: input.growth_stage,
    days_since_sowing: input.days_since_sowing,
    ndvi_level: input.ndvi_level,
    ndvi_trend: input.ndvi_trend,
    known_observations: input.observations,
    user_query: input.user_query,
    supabaseClient: input.supabase,
    trace_id: input.trace_id,
    variety_id: input.variety_id ?? null,
    variety_resistance: input.variety_resistance,
  });

  const top = (evalOut.candidates || []).slice(0, 5);

  const matched_rules: DifferentialMatchedRule[] = top.map((c: CandidateHypothesis) => ({
    rule_id: c.rule_id,
    cause_code: c.cause,
    cause_name: c.cause,
    category: c.canonical_group,
    confidence: Math.max(0, Math.min(1, c.total_score ?? c.partial_match_score ?? 0)),
    matching_conditions: c.matched_conditions || [],
    missing_conditions: [],
  }));

  // Chips: pick the strongest observable_characteristics across the top causes,
  // deduplicating by observation_key so the farmer never sees the same sign
  // twice. Max 6 chips for mobile-friendly UX.
  const chips: DifferentialChip[] = [];
  const seen = new Set<string>();
  for (const c of top) {
    const chars = (c.observable_characteristics || []).slice(0, 3);
    for (const oc of chars) {
      const key = (oc.observation_key || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      chips.push({
        label: pickLabel(oc, input.language),
        value: key,
        observation_key: key,
        cause_code: c.cause,
        description: c.cause,
        confidence_lift: typeof oc.confidence_boost === "number"
          ? oc.confidence_boost
          : 0.15,
      });
      if (chips.length >= 6) break;
    }
    if (chips.length >= 6) break;
  }

  return {
    matched_rules,
    clarification_chips: chips,
    clarification_question: CHIP_QUESTION[input.language] || CHIP_QUESTION.en,
    top_confidence: top[0]?.total_score ?? 0,
    candidate_count: top.length,
    enricher_version: DIAGNOSTIC_DIFFERENTIAL_ENRICHER_VERSION,
  };
}
