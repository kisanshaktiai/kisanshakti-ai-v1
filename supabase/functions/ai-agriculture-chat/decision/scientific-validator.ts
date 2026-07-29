// SCIENTIFIC VALIDATOR — Phase C, gate #3

import {
  loadBaselineGuidelines,
  getBaselineForCrop,
  type BaselineGuideline,
} from '../utils/baseline-guidelines-cache.ts';
import type { EvidenceLedger } from './evidence-ledger.ts';
import type { ConfidenceChain } from './confidence-chain.ts';

export interface CandidateRecommendation {
  rule_id: string;
  crop_code: string;
  growth_stage?: string | null;
  das?: number | null;
  // Quantitative payload that may be range-checked:
  water_litres_per_acre?: number | null;
  nitrogen_kg_per_acre?: number | null;
  phosphorus_kg_per_acre?: number | null;
  potassium_kg_per_acre?: number | null;
  pre_harvest_interval_days?: number | null;
  max_applications?: number | null;
  // Pass-through:
  [k: string]: unknown;
}

export interface ScientificGateInput {
  candidates: CandidateRecommendation[];
  supabase: any;
  ledger?: EvidenceLedger;
  chain?: ConfidenceChain;
}

export interface ValidatedRecommendation {
  candidate: CandidateRecommendation;
  approved: boolean;
  violations: string[];
  baselineUsed?: BaselineGuideline | null;
}

export interface ScientificGateResult {
  approved: CandidateRecommendation[];
  rejected: Array<{ candidate: CandidateRecommendation; reasons: string[] }>;
  scientificConfidence: number;
  /** Diagnosis is emitted regardless of missing product/baseline. */
  allow_diagnosis: boolean;
  /** Treatment requires an approved candidate AND baseline reference. */
  allow_treatment: boolean;
  block_reasons: string[];
}

// Tolerance band — production-grade default; tunable later via system_config.
const TOLERANCE = 0.5; // ±50% of baseline before rejection

function pickBaseline(
  cache: BaselineGuideline[] | undefined,
  stage: string | null | undefined,
  das: number | null | undefined,
  ruleIdForLog?: string
): { row: BaselineGuideline | null; reason: 'EXACT_STAGE' | 'DAS_WINDOW' | 'FIRST_AVAILABLE' | 'NO_CACHE' } {
  if (!cache || cache.length === 0) {
    console.log(`[SCIENTIFIC_GATE][BASELINE_PICK] rule=${ruleIdForLog ?? '?'} reason=NO_CACHE`);
    return { row: null, reason: 'NO_CACHE' };
  }
  const stageKey = (stage || '').toLowerCase();
  // 1) exact stage match
  let match = cache.find((g) => g.growth_stage?.toLowerCase() === stageKey);
  if (match) {
    console.log(`[SCIENTIFIC_GATE][BASELINE_PICK] rule=${ruleIdForLog ?? '?'} reason=EXACT_STAGE stage=${stageKey}`);
    return { row: match, reason: 'EXACT_STAGE' };
  }
  // 2) DAS window match
  if (typeof das === 'number') {
    match = cache.find(
      (g) =>
        (g.das_start ?? -Infinity) <= das &&
        (g.das_end ?? Infinity) >= das
    );
    if (match) {
      console.log(`[SCIENTIFIC_GATE][BASELINE_PICK] rule=${ruleIdForLog ?? '?'} reason=DAS_WINDOW das=${das}`);
      return { row: match, reason: 'DAS_WINDOW' };
    }
  }
  console.log(`[SCIENTIFIC_GATE][BASELINE_PICK] rule=${ruleIdForLog ?? '?'} reason=FIRST_AVAILABLE (stage_miss=${stageKey}, das_miss=${das ?? 'null'})`);
  return { row: cache[0] ?? null, reason: 'FIRST_AVAILABLE' };
}

function violatesRange(
  actual: number | null | undefined,
  optimal: number | null | undefined,
  label: string,
  tol = TOLERANCE
): string | null {
  if (actual == null || optimal == null || optimal <= 0) return null;
  const lo = optimal * (1 - tol);
  const hi = optimal * (1 + tol);
  if (actual < lo || actual > hi) {
    return `${label}=${actual} outside baseline [${lo.toFixed(1)}, ${hi.toFixed(1)}] (optimal=${optimal})`;
  }
  return null;
}

export async function evaluateScientificGate(
  input: ScientificGateInput
): Promise<ScientificGateResult> {
  const { candidates, supabase, ledger, chain } = input;

  // Ensure baselines are loaded (idempotent, cached 10min).
  await loadBaselineGuidelines(supabase);

  const approved: CandidateRecommendation[] = [];
  const rejected: Array<{ candidate: CandidateRecommendation; reasons: string[] }> = [];
  // FIX 5: track candidates that were APPROVED without a real baseline check.
  let approvedWithBaseline = 0;
  let approvedWithoutBaseline = 0;

  for (const cand of candidates) {
    const baselines: BaselineGuideline[] = getBaselineForCrop(cand.crop_code);
    const { row: baseline } = pickBaseline(baselines, cand.growth_stage, cand.das ?? null, cand.rule_id);

    const violations: string[] = [];
    if (baseline) {
      const vN = violatesRange(cand.nitrogen_kg_per_acre, baseline.nitrogen_optimal, 'nitrogen');
      const vP = violatesRange(cand.phosphorus_kg_per_acre, baseline.phosphorus_optimal, 'phosphorus');
      const vK = violatesRange(cand.potassium_kg_per_acre, baseline.potassium_optimal, 'potassium');
      // water: actual is litres/acre, baseline is mm — only sanity-check
      // when both are present and obviously off (>10× off after rough convert).
      if (cand.water_litres_per_acre != null && baseline.water_requirement_mm != null) {
        const mmEquivalent = cand.water_litres_per_acre / 4046.86; // L / m² → mm
        const v = violatesRange(mmEquivalent, baseline.water_requirement_mm, 'water_mm', 1.0);
        if (v) violations.push(v);
      }
      for (const v of [vN, vP, vK]) if (v) violations.push(v);

      // Stage suitability
      if (cand.das != null && baseline.das_start != null && baseline.das_end != null) {
        if (cand.das < baseline.das_start - 7 || cand.das > baseline.das_end + 7) {
          violations.push(
            `das=${cand.das} outside baseline stage window [${baseline.das_start}, ${baseline.das_end}]`
          );
        }
      }
    } else {
      // FIX 5: no baseline available → INSUFFICIENT_REFERENCE. Do NOT block
      // execution, but do NOT count as PASS for confidence calculation.
      ledger?.ignore('SCIENTIFIC_GATE', `rule:${cand.rule_id}`, 'no baseline for crop/stage — INSUFFICIENT_REFERENCE (no confidence boost)');
      console.log(
        `[SCIENTIFIC_GATE][INSUFFICIENT_REFERENCE] rule=${cand.rule_id} crop=${cand.crop_code} ` +
        `stage=${cand.growth_stage ?? 'null'} → passing through without confidence boost`
      );
    }

    if (violations.length === 0) {
      approved.push(cand);
      if (baseline) approvedWithBaseline++;
      else approvedWithoutBaseline++;
      ledger?.record({
        stage: 'SCIENTIFIC_GATE',
        action: 'CREATE',
        key: `approved:${cand.rule_id}`,
        after: { rule_id: cand.rule_id, baseline_present: !!baseline },
        source: 'crop_baseline_guidelines_v2',
      });
    } else {
      rejected.push({ candidate: cand, reasons: violations });
      ledger?.lose(
        'SCIENTIFIC_GATE',
        `rule:${cand.rule_id}`,
        cand,
        `BASELINE_VIOLATION: ${violations.join('; ')}`
      );
      // Audit-log to advisory_audit_log when supabase client is available.
      try {
        await supabase.from('advisory_audit_log').insert({
          rule_id: cand.rule_id,
          crop_code: cand.crop_code,
          rejection_reason: 'BASELINE_VIOLATION',
          violations,
          payload: cand,
        });
      } catch {/* non-fatal */}
    }
  }

  // FIX 5: confidence = (approved-with-baseline) / (candidates that had a
  const evaluated = approvedWithBaseline + rejected.length;
  const scientificConfidence = candidates.length === 0
    ? 1
    : (evaluated === 0
        ? 0        // every candidate lacked a baseline → NO confidence signal
        : approvedWithBaseline / evaluated);
  chain?.set('scientific', scientificConfidence);

  // ─── GATE SPLIT — diagnosis vs treatment ───────────────────────────────
  const allow_diagnosis = candidates.length > 0;
  const allow_treatment = approvedWithBaseline > 0;
  const block_reasons: string[] = [];
  if (!allow_treatment) {
    if (approvedWithoutBaseline > 0) block_reasons.push('INSUFFICIENT_REFERENCE');
    if (rejected.length > 0)         block_reasons.push('BASELINE_VIOLATION');
    if (candidates.length === 0)     block_reasons.push('NO_CANDIDATES');
  }

  console.log(
    `[BRAIN_TRACE][SCIENTIFIC_GATE] approved=${approved.length} ` +
      `(with_baseline=${approvedWithBaseline}, insufficient_reference=${approvedWithoutBaseline}) ` +
      `rejected=${rejected.length} conf=${scientificConfidence.toFixed(3)} ` +
      `diagnosis=${allow_diagnosis} treatment=${allow_treatment}`
  );

  // GRAPH_NODE_TRACE — SCIENTIFIC_GATE (uniform pipeline line)
  try {
    // eslint-disable-next-line no-console
    console.log(
      `[GRAPH_NODE_TRACE][scientific-gate] node=SCIENTIFIC_GATE ` +
        JSON.stringify({
          allow_diagnosis,
          allow_treatment,
          approved: approved.length,
          rejected: rejected.length,
          with_baseline: approvedWithBaseline,
          insufficient_reference: approvedWithoutBaseline,
          confidence: Number(scientificConfidence.toFixed(3)),
          block_reasons,
        }),
    );
  } catch {/* trace must not throw */}

  return {
    approved,
    rejected,
    scientificConfidence,
    allow_diagnosis,
    allow_treatment,
    block_reasons,
  };
}
