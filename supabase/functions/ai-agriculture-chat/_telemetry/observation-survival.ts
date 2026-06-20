/**
 * ObservationSurvivalMatrix
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-request, per-stage observation counter. Emits ONE structured log line
 * per request (`[OBS_SURVIVAL_MATRIX] {...}`) so the journey of observation
 * codes from raw farmer message → final farmer response can be reconstructed
 * from edge logs alone, without code changes.
 *
 * Stages tracked (in pipeline order):
 *   raw_text          - char length of farmer message
 *   photo_observations- observations extracted from image vision
 *   nlu_extracted     - symptoms extracted by NLU
 *   semantic_mapped   - observation codes from semantic→ontology mapping
 *   alias_resolved    - codes after alias/translation resolution
 *   expanded          - codes after observation-expansion (rule-confirmed)
 *   pre_auth          - allObservationsForPreAuth (union pre-authority)
 *   confirmed         - confirmed observations (post-authority)
 *   synthetic         - synthetic/inferred observations
 *   canonical_visual  - canonicalState.visual_symptoms
 *   rules_evaluated   - rules considered by LayeredRuleEvaluator
 *   rules_matched     - rules whose conditions matched
 *   matched_responses - response candidates produced
 *   primary_decision  - 1 if a primary decision was selected, else 0
 *   response_obs      - observations carried into farmer-facing response
 *
 * Any stage left unrecorded is reported as `null` — that itself is the
 * survival signal: it identifies the stage where observations died.
 */

export type SurvivalStage =
  | 'raw_text'
  | 'photo_observations'
  | 'nlu_extracted'
  | 'semantic_mapped'
  | 'alias_resolved'
  | 'expanded'
  | 'pre_auth'
  | 'confirmed'
  | 'synthetic'
  | 'canonical_visual'
  | 'rules_evaluated'
  | 'rules_matched'
  | 'matched_responses'
  | 'primary_decision'
  | 'response_obs';

const STAGE_ORDER: SurvivalStage[] = [
  'raw_text',
  'photo_observations',
  'nlu_extracted',
  'semantic_mapped',
  'alias_resolved',
  'expanded',
  'pre_auth',
  'confirmed',
  'synthetic',
  'canonical_visual',
  'rules_evaluated',
  'rules_matched',
  'matched_responses',
  'primary_decision',
  'response_obs',
];

export class ObservationSurvivalMatrix {
  private readonly traceId: string;
  private readonly startedAt: number;
  private readonly counts: Partial<Record<SurvivalStage, number>> = {};
  private readonly meta: Record<string, unknown> = {};
  private emitted = false;

  constructor(traceId: string) {
    this.traceId = traceId;
    this.startedAt = Date.now();
  }

  /** Record an integer count for a pipeline stage. Safe to call repeatedly; last write wins. */
  record(stage: SurvivalStage, value: number | null | undefined): void {
    if (value == null || !Number.isFinite(value as number)) return;
    this.counts[stage] = Math.max(0, Math.floor(value as number));
  }

  /** Attach arbitrary scalar metadata (intent, crop, stage, DAS, etc.). */
  setMeta(key: string, value: unknown): void {
    if (value === undefined) return;
    this.meta[key] = value;
  }

  /** Emit the single survival line. Idempotent — only the first call logs. */
  emit(extra?: Record<string, unknown>): void {
    if (this.emitted) return;
    this.emitted = true;
    try {
      const matrix: Record<string, number | null> = {};
      let lastNonZero: SurvivalStage | null = null;
      for (const stage of STAGE_ORDER) {
        const v = this.counts[stage];
        matrix[stage] = v == null ? null : v;
        if (v != null && v > 0) lastNonZero = stage;
      }
      const payload = {
        trace_id: this.traceId,
        duration_ms: Date.now() - this.startedAt,
        last_nonzero_stage: lastNonZero,
        died_at: this.computeDiedAt(),
        meta: this.meta,
        matrix,
        ...(extra || {}),
      };
      console.log(`📊 [OBS_SURVIVAL_MATRIX] ${JSON.stringify(payload)}`);
    } catch (_e) {
      /* trace must never throw */
    }
  }

  /**
   * Identify the first stage where observation count dropped to 0 after
   * being non-zero upstream. Returns null if no drop, or if pipeline never
   * produced observations at all.
   */
  private computeDiedAt(): SurvivalStage | null {
    let sawNonZero = false;
    for (const stage of STAGE_ORDER) {
      const v = this.counts[stage];
      if (v == null) continue;
      if (v > 0) {
        sawNonZero = true;
      } else if (sawNonZero && v === 0) {
        return stage;
      }
    }
    return null;
  }
}
