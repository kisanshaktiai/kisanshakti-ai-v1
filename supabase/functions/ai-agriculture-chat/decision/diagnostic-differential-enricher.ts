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
  const NON_OBSERVABLE_RE = /(^|_)(check|gate|authority|threshold|verify|verification)(_|$)|^etl_|^phi_|^safety_|_check$/i;
  for (const c of top) {
    const chars = (c.observable_characteristics || []).slice(0, 3);
    for (const oc of chars) {
      const key = (oc.observation_key || "").trim();
      if (!key || seen.has(key)) continue;
      if (NON_OBSERVABLE_RE.test(key)) continue; // skip action/gate codes
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

  // ─────────────────────────────────────────────────────────────────────────
  // FARMER-FRIENDLY LABEL OVERLAY
  // The hypothesis evaluator produces chip keys (e.g. WATER_STRESS, WILTING)
  // but its in-memory label_* fields are either undefined or a humanized
  // version of the code ("water stress"). Real Marathi/Hindi symptom text
  // lives in `observation_translations.display_text` and full confirmation
  // questions live in `observation_differential_questions.question_text`.
  // Overlay both so the farmer sees "पाने कोमेजलेली किंवा लटकलेली दिसत आहेत"
  // instead of "water stress check".
  // ─────────────────────────────────────────────────────────────────────────
  if (chips.length > 0) {
    try {
      const lowerKeys = chips.map((ch) => ch.observation_key.toLowerCase());
      const lang = (input.language || "en").toLowerCase();
      const fallbackLangs = lang === "mr"
        ? ["mr", "hi", "en"]
        : lang === "hi" ? ["hi", "mr", "en"] : ["en", "hi", "mr"];

      // Parallel: translations, differential questions, observability gate
      const [trRes, dqRes, omRes] = await Promise.all([
        input.supabase
          .from("observation_translations")
          .select("observation_code, language_code, display_text")
          .in("observation_code", lowerKeys)
          .in("language_code", fallbackLangs),
        input.supabase
          .from("observation_differential_questions")
          .select("observation_code, language, question_text, crop_code")
          .in("observation_code", lowerKeys)
          .eq("language", lang),
        input.supabase
          .from("observation_master")
          .select("observation_code, is_farmer_observable, description")
          .in("observation_code", lowerKeys),
      ]);

      // Build best-language translation map (prefer requested lang)
      const trMap: Record<string, Record<string, string>> = {};
      for (const r of (trRes?.data || []) as any[]) {
        const k = (r.observation_code || "").toLowerCase();
        if (!trMap[k]) trMap[k] = {};
        if (r.display_text) trMap[k][r.language_code] = r.display_text;
      }

      // Differential question map (crop-specific wins over generic)
      const dqMap: Record<string, string> = {};
      for (const r of (dqRes?.data || []) as any[]) {
        const k = (r.observation_code || "").toLowerCase();
        const isCropMatch = r.crop_code && input.crop_code &&
          String(r.crop_code).toLowerCase() === String(input.crop_code).toLowerCase();
        if (isCropMatch || !dqMap[k]) {
          if (r.question_text) dqMap[k] = r.question_text;
        }
      }

      // Farmer-observable gate
      const observableMap: Record<string, boolean> = {};
      const descMap: Record<string, string> = {};
      for (const r of (omRes?.data || []) as any[]) {
        const k = (r.observation_code || "").toLowerCase();
        // Default to true when the field is null — be permissive, only
        // exclude when the master explicitly marks the code as non-observable.
        observableMap[k] = r.is_farmer_observable !== false;
        if (r.description) descMap[k] = r.description;
      }

      const enriched: DifferentialChip[] = [];
      for (const ch of chips) {
        const k = ch.observation_key.toLowerCase();
        if (observableMap[k] === false) continue; // hard-gate workflow codes
        let label = ch.label;
        const tr = trMap[k];
        if (tr) {
          for (const l of fallbackLangs) {
            if (tr[l]) { label = tr[l]; break; }
          }
        }
        // Last-resort: if label is still a raw code (contains underscores or
        // matches observation_key), prefer master description, else humanize.
        if (!label || label === ch.observation_key || /_/.test(label)) {
          label = descMap[k] || ch.observation_key.replace(/_/g, " ").toLowerCase();
        }
        enriched.push({ ...ch, label, description: dqMap[k] || ch.description });
      }
      // Replace only when we actually got data; never empty out the chips.
      if (enriched.length > 0) {
        chips.length = 0;
        chips.push(...enriched);
      }
    } catch (err) {
      console.warn(`[DifferentialEnricher] Translation overlay failed (non-fatal):`, err);
    }
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
