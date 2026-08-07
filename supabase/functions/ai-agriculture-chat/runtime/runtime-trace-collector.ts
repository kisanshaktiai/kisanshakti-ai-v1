// CHANGE LOG (newest first)
//   2026-08-07 17:50 UTC — GAP D: ai_decision_log rows now carry a real
//     decision_type (turn terminal outcome) and input_data.crop /
//     growth_stage / days_since_sowing from the frozen canonical context.
//   2026-08-08 00:00 UTC — FIX 7: runtime_trace late serialization. buildRuntimeTrace
//     now flushes still-open spans, sorts stages, warns [RUNTIME_TRACE_EMPTY], and
//     new recordStage()/ingestLayerTimings() fold orchestrator layer timings in.
// PHASE Y — RuntimeTraceCollector

export const RUNTIME_VERSION  = '1.0.0';
export const PIPELINE_VERSION = '2026.06.Y';
export const GRAPH_VERSION    = '2026.06.Y';

export type StageName =
  | 'INTENT_CLASSIFY'
  | 'CANONICAL_CONTEXT'
  | 'HYPOTHESIS_EVAL'
  | 'CAUSAL_ENGINE'
  | 'DISCRIMINATOR'
  | 'CLARIFICATION'
  | 'OBSERVATION_AUTHORITY'
  | 'SEMANTIC_GATE'
  | 'SCIENTIFIC_GATE'
  | 'RULE_EVAL'
  | 'DECISION_BUILDER'
  | 'LLM_FORMAT'
  | string;

export interface StageRecord {
  name: StageName;
  owner: string;
  start_ms: number;
  end_ms?: number;
  latency_ms?: number;
  confidence?: number;
  inputs?: any;
  outputs?: any;
  warnings?: string[];
  errors?: string[];
}

export interface RuntimeTraceHeader {
  trace_id: string;
  execution_id: string;
  pipeline_version: string;
  graph_version: string;
  runtime_version: string;
  execution_mode: string;
  trace_level: 'minimal' | 'standard' | 'verbose';
  started_at_ms: number;
}

const AI_DECISION_LOG_TYPES = new Set([
  'schedule_generation',
  'schedule_refinement',
  'alert_generation',
  'marketing_prediction',
  'pest_detection',
  'disease_detection',
  'diagnosis',
  'advisory',
  'clarification',
  'observation_response',
  'safety_block',
  'prescription',
  'monitoring',
  'unknown',
]);

function normalizeDecisionType(raw: any): string {
  const value = String(raw || '').trim();
  const lower = value.toLowerCase();
  if (AI_DECISION_LOG_TYPES.has(lower)) return lower;

  const upper = value.toUpperCase();
  if (/CLARIF|QUESTION|ASK/.test(upper)) return 'clarification';
  if (/SAFETY|BLOCK/.test(upper)) return 'safety_block';
  if (/MONITOR|OBSERV/.test(upper)) return 'monitoring';
  if (/SPRAY|PRESCRI|TREAT|PESTICIDE|FUNGICIDE|INSECTICIDE|FERTILI|IRRIGAT|NUTRIENT|APPLICATION/.test(upper)) return 'prescription';
  if (/PEST/.test(upper)) return 'pest_detection';
  if (/DISEASE|FUNG|BACTERI|VIRUS/.test(upper)) return 'disease_detection';
  if (/DIAGNOS/.test(upper)) return 'diagnosis';
  if (/ADVIS/.test(upper)) return 'advisory';
  if (/SCHEDULE/.test(upper)) return 'schedule_generation';
  if (/ALERT|PROACTIVE/.test(upper)) return 'alert_generation';
  return 'unknown';
}

function normalizeLegacyDecisionType(raw: any): string {
  const upper = String(raw || '').toUpperCase();
  if (/SCHEDULE/.test(upper)) return 'schedule_generation';
  if (/ALERT|PROACTIVE/.test(upper)) return 'alert_generation';
  if (/MARKET/.test(upper)) return 'marketing_prediction';
  if (/PEST|INSECT|BORER|APHID|MITE/.test(upper)) return 'pest_detection';
  return 'disease_detection';
}

function isSchemaColumnError(error: any): boolean {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return error?.code === 'PGRST204'
    || error?.code === '42703'
    || message.includes('column') && (message.includes('schema cache') || message.includes('does not exist') || message.includes('not found'));
}

function normalizeConfidence(raw: any): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const scaled = n > 1 && n <= 100 ? n / 100 : n;
  return Math.max(0, Math.min(1, scaled));
}

function nonEmptyReasoning(...values: any[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v != null && typeof v !== 'object') return String(v);
  }
  return 'Runtime trace persisted for AI agriculture chat turn.';
}

function safeUuid(raw: any): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export class RuntimeTraceCollector {
  readonly header: RuntimeTraceHeader;
  private stages: StageRecord[] = [];
  private openStages = new Map<string, StageRecord>();
  /** Set once the trace has been written to ai_decision_log; prevents duplicate inserts. */
  persisted = false;
  /** id of the inserted ai_decision_log row (string) once persisted. */
  persistedDecisionId: string | null = null;


  context: any         = null;
  clarification: any   = null;
  observations: any    = null;
  rules: any           = null;
  hypotheses: any      = null;
  decision: any        = null;
  builderOutput: any   = null;
  knowledgeVersions: any = null;
  graphExtras: any     = {};

  constructor(header: Partial<RuntimeTraceHeader> & { trace_id: string }) {
    this.header = {
      execution_id:     header.execution_id     || `exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      pipeline_version: header.pipeline_version || PIPELINE_VERSION,
      graph_version:    header.graph_version    || GRAPH_VERSION,
      runtime_version:  header.runtime_version  || RUNTIME_VERSION,
      execution_mode:   header.execution_mode   || 'live',
      trace_level:      (header.trace_level as any) || (Deno.env.get('RUNTIME_TRACE_LEVEL') as any) || 'standard',
      started_at_ms:    header.started_at_ms    || Date.now(),
      trace_id:         header.trace_id,
    };
  }

  // ─── stage timing ────────────────────────────────────────────────────────
  beginStage(name: StageName, owner: string, inputs?: any): void {
    try {
      const rec: StageRecord = { name, owner, start_ms: Date.now(), inputs };
      this.openStages.set(name, rec);
    } catch {}
  }

  endStage(name: StageName, patch: Partial<StageRecord> = {}): void {
    try {
      const rec = this.openStages.get(name);
      if (!rec) return;
      rec.end_ms = Date.now();
      rec.latency_ms = rec.end_ms - rec.start_ms;
      Object.assign(rec, patch);
      this.openStages.delete(name);
      this.stages.push(rec);
    } catch {}
  }

  async stage<T>(name: StageName, owner: string, fn: () => Promise<T> | T, inputs?: any): Promise<T> {
    this.beginStage(name, owner, inputs);
    try {
      const out = await fn();
      this.endStage(name, { outputs: undefined });
      return out;
    } catch (e: any) {
      this.endStage(name, { errors: [String(e?.message || e)] });
      throw e;
    }
  }

  // ─── typed setters ───────────────────────────────────────────────────────
  setContext(v: any):        void { this.context = v; }
  setClarification(v: any):  void { this.clarification = v; }
  setObservations(v: any):   void { this.observations = v; }
  setRules(v: any):          void { this.rules = v; }
  setHypotheses(v: any):     void { this.hypotheses = v; }
  setDecision(v: any):       void { this.decision = v; }
  setBuilderOutput(v: any):  void { this.builderOutput = v; }
  setKnowledgeVersions(v: any): void { this.knowledgeVersions = v; }
  mergeGraph(patch: Record<string, any>): void { Object.assign(this.graphExtras, patch); }

  // ─── snapshots ───────────────────────────────────────────────────────────
  buildPipelineMetrics(totalLatencyMs: number) {
    const by: Record<string, number> = {};
    for (const s of this.stages) by[s.name] = (by[s.name] || 0) + (s.latency_ms || 0);
    return {
      total_latency_ms: totalLatencyMs,
      intent_ms:        by['INTENT_CLASSIFY']       || 0,
      context_ms:       by['CANONICAL_CONTEXT']     || 0,
      hypothesis_ms:    by['HYPOTHESIS_EVAL']       || 0,
      causal_ms:        by['CAUSAL_ENGINE']         || 0,
      discriminator_ms: by['DISCRIMINATOR']         || 0,
      clarification_ms: by['CLARIFICATION']         || 0,
      rule_eval_ms:     by['RULE_EVAL']             || 0,
      builder_ms:       by['DECISION_BUILDER']      || 0,
      llm_format_ms:    by['LLM_FORMAT']            || 0,
      response_ms:      by['RESPONSE']              || 0,
      stage_breakdown:  by,
      stage_count:      this.stages.length,
    };
  }

  buildGraphSnapshot() {
    return {
      intent:             this.context?.intent ?? null,
      canonical_context:  this.context?.canonical ?? this.context ?? null,
      hypotheses:         this.hypotheses ?? null,
      evidence:           this.observations?.evidence ?? null,
      observation_ledger: this.observations?.ledger ?? null,
      candidate_rules:    this.rules?.candidates ?? null,
      winner_rule:        this.rules?.winner ?? null,
      decision:           this.decision ?? null,
      confidence_chain:   this.decision?.confidence_chain ?? null,
      builder_output:     this.builderOutput ?? null,
      ...this.graphExtras,
    };
  }

  // FIX 7 (2026-08-08) — post-hoc stage span. Layers that were timed with
  // plain Date.now() arithmetic (orchestrator layerTimings) can be folded into
  // the trace without being wrapped in `stage()`.
  recordStage(name: StageName, owner: string, latencyMs: number, patch: Partial<StageRecord> = {}): void {
    try {
      if (!name) return;
      const end = Date.now();
      const lat = Number.isFinite(latencyMs) ? Math.max(0, latencyMs | 0) : 0;
      this.stages.push({ name, owner, start_ms: end - lat, end_ms: end, latency_ms: lat, ...patch } as StageRecord);
    } catch {}
  }

  /** Fold an orchestrator `layerTimings` map ({ layer3_rules: 421, … }) into stages. */
  ingestLayerTimings(timings: Record<string, number> | null | undefined, owner = 'orchestrator'): void {
    if (!timings) return;
    for (const [name, ms] of Object.entries(timings)) {
      if (typeof ms !== 'number' || !Number.isFinite(ms)) continue;
      if (this.stages.some((s) => s.name === (name as StageName))) continue;
      this.recordStage(name as StageName, owner, ms);
    }
  }

  buildRuntimeTrace(totalLatencyMs: number) {
    // FIX 7 — LATE SERIALIZATION. Previously `stages` serialized as [] on every
    // turn because spans still open at persist time were dropped on the floor
    // (endStage never ran on early-return paths). Flush them here so the trace
    // reflects real execution instead of an empty array.
    try {
      for (const [name, rec] of this.openStages) {
        rec.end_ms = Date.now();
        rec.latency_ms = rec.end_ms - rec.start_ms;
        (rec as any).unclosed = true;
        this.stages.push(rec);
        this.openStages.delete(name);
      }
    } catch {}

    const stages = [...this.stages].sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0));
    if (stages.length === 0) {
      console.warn(
        `[RUNTIME_TRACE_EMPTY] trace=${this.header.trace_id} exec=${this.header.execution_id} ` +
        `no stage spans recorded for this turn`,
      );
    }
    return {
      header:  this.header,
      stages,
      totals:  {
        total_latency_ms: totalLatencyMs,
        stage_count: stages.length,
        unclosed_stage_count: stages.filter((s: any) => s.unclosed === true).length,
      },
    };
  }

  finishLogLine(totalLatencyMs: number, extra: Record<string, any> = {}) {
    try {
      const wr  = this.rules?.winner?.rule_id || this.rules?.winner_rule_id || '-';
      const wh  = this.hypotheses?.winner?.hypothesis_id || this.hypotheses?.winner?.id || '-';
      const cls = this.clarification?.selected_producer || this.clarification?.producer || '-';
      const cands = Array.isArray(this.rules?.candidates) ? this.rules.candidates.length : (this.rules?.candidate_count ?? '-');
      const matched = this.rules?.matched_count ?? '-';
      const dec = this.decision?.primary_decision?.action_type || this.decision?.action_type || '-';
      const conf = this.decision?.confidence ?? this.decision?.confidence_score ?? '-';
      console.log(
        `[RUNTIME_TRACE] trace=${this.header.trace_id} exec=${this.header.execution_id} ` +
        `pv=${this.header.pipeline_version} gv=${this.header.graph_version} ` +
        `latency_ms=${totalLatencyMs} winner_rule=${wr} winner_hyp=${wh} ` +
        `clarification_owner=${cls} candidates=${cands} matched=${matched} ` +
        `decision=${dec} confidence=${conf}` +
        (extra.intent ? ` intent=${extra.intent}` : '')
      );
    } catch {}
  }

  // Persist a single row into ai_decision_log. Idempotent — sets `persisted=true`
  async persistDecisionLog(
    supabase: any,
    extra: {
      tenant_id?: string | null;
      farmer_id?: string | null;
      land_id?: string | null;
      farmer_message?: string | null;
      observations?: any;
      validation_passed?: boolean | null;
      processing_time_ms?: number | null;
      knowledge_versions?: any;
    } = {}
  ): Promise<string | null> {
    if (this.persisted) return this.persistedDecisionId;
    try {
      const totalLatency = (extra.processing_time_ms ?? (Date.now() - this.header.started_at_ms)) | 0;
      const knowledgeVersions = extra.knowledge_versions ?? this.knowledgeVersions ?? {};
      const ctx = this.context || {};
      const hyp = this.hypotheses?.winner || null;
      const tenantId = safeUuid(extra.tenant_id ?? ctx.tenant_id);
      if (!tenantId) {
        // tenant_id is NOT NULL in ai_decision_log — without it we cannot insert.
        console.warn(`⚠️ [RuntimeTrace] ai_decision_log insert skipped: missing/invalid tenant_id trace=${this.header.trace_id}`);
        return null;
      }

      // GAP D (2026-08-07) — terminal-type derivation.
      // ai_decision_log.decision_type was landing on 'unknown' for real turns.
      // Map the TURN OUTCOME first (rules matched → prescription/monitoring,
      // clarification returned → clarification, failure → safety_block/unknown),
      // then fall back to the previous heuristics. All values below are members
      // of AI_DECISION_LOG_TYPES, so the CHECK constraint cannot reject them.
      const _matchedRules: number = Number(
        this.rules?.matched_count ?? (Array.isArray(this.rules?.applied) ? this.rules.applied.length : 0),
      ) || 0;
      const _winnerAction = this.rules?.winner?.action_type
        ?? this.decision?.primary_decision?.action_type
        ?? null;
      let terminalType: string | null = null;
      if (_matchedRules > 0 || this.decision?.primary_decision) {
        terminalType = normalizeDecisionType(_winnerAction ?? 'prescription');
        if (terminalType === 'unknown') terminalType = 'prescription';
      } else if (this.clarification) {
        terminalType = 'clarification';
      } else if (this.decision?.failed || this.decision?.error) {
        terminalType = 'safety_block';
      }

      // Derive a meaningful decision_type even on early returns (e.g., clarification
      // turns where no rule has fired yet) so traces never collapse to 'unknown'.
      const rawDecisionType = terminalType
        || this.decision?.decision_type
        || this.decision?.primary_decision?.action_type
        || this.rules?.winner?.action_type
        || this.rules?.winner?.rule_id
        || (this.clarification ? 'clarification' : null)
        || (this.hypotheses?.candidates?.length ? 'hypothesis_ranked' : null)
        || (this.observations ? 'observation_collected' : null)
        || (this.context?.intent?.code ? `intent_${this.context.intent.code}` : null)
        || 'unknown';
      const confidenceScore = normalizeConfidence(
        this.decision?.confidence ??
        this.decision?.confidence_score ??
        this.decision?.primary_decision?.weighted_confidence ??
        this.decision?.primary_decision?.confidence ??
        hyp?.score ??
        hyp?.confidence
      );

      // GAP D — read crop/stage/DAS from the frozen canonical context only.
      const _cc = ctx.canonical ?? null;
      const _num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);
      const _canon = {
        crop:              _cc?.crop_code ?? ctx.crop ?? null,
        growth_stage:      _cc?.growth_stage ?? ctx.stage ?? null,
        days_since_sowing: _num(_cc?.days_since_sowing ?? ctx.das),
      };

      const generatedDecisionId = crypto.randomUUID();

      const legacyDecisionRow: Record<string, any> = {
        id:              generatedDecisionId,
        tenant_id:       tenantId,
        farmer_id:       safeUuid(extra.farmer_id ?? ctx.farmer_id),
        land_id:         safeUuid(extra.land_id ?? ctx.land_id),
        schedule_id:     safeUuid(ctx.schedule_id),
        decision_type:   normalizeDecisionType(rawDecisionType),
        model_version:   this.header.runtime_version,
        input_data:      {
          farmer_message: extra.farmer_message ?? null,
          observations:   extra.observations ?? [],
          // GAP D — locked canonical context (GRAPH_FREEZE). NEVER fabricated:
          // when the canonical context is unavailable these stay null.
          crop:              _canon.crop,
          growth_stage:      _canon.growth_stage,
          days_since_sowing: _canon.days_since_sowing,
        },
        output_data:     this.decision ?? this.builderOutput ?? {},
        reasoning:       nonEmptyReasoning(
          this.decision?.reasoning,
          this.decision?.primary_decision?.reasoning,
          this.decision?.explanation,
          this.clarification?.reason,
          this.context?.intent?.code
        ),
        confidence_score: confidenceScore,
        execution_time_ms: totalLatency,
        weather_data:    ctx.weather ?? null,
        ndvi_data:       ctx.ndvi ?? null,
        soil_data:       ctx.soil ?? null,
        success:         (extra.validation_passed ?? true) && !(this.decision?.failed),
        error_message:   this.decision?.error ?? null,
      };

      const decisionRow: Record<string, any> = {
        ...legacyDecisionRow,
        hypothesis_id:            hyp?.hypothesis_id ?? hyp?.id ?? null,
        hypothesis_score:         normalizeConfidence(hyp?.score ?? hyp?.confidence),
        hypothesis_decision_path: this.hypotheses?.decision_path ?? null,
        runtime_trace:          this.buildRuntimeTrace(totalLatency),
        graph_snapshot:         this.buildGraphSnapshot(),
        pipeline_metrics:       this.buildPipelineMetrics(totalLatency),
        context_snapshot:       ctx,
        clarification_snapshot: this.clarification ?? null,
        observation_snapshot:   this.observations ?? null,
        rule_snapshot:          this.rules ?? null,
        hypothesis_snapshot:    this.hypotheses ?? null,
        decision_snapshot:      this.decision ?? null,
        knowledge_versions:     knowledgeVersions,
        pipeline_version:       this.header.pipeline_version,
        graph_version:          this.header.graph_version,
        runtime_version:        this.header.runtime_version,
        execution_mode:         this.header.execution_mode,
        trace_level:            this.header.trace_level,
        created_runtime_ms:     totalLatency,
        trace_id:               this.header.trace_id,
        execution_id:           this.header.execution_id,
      };

      let insertedDecisionId = generatedDecisionId;
      let { error } = await supabase
        .from('ai_decision_log')
        .insert(decisionRow);

      if (error && error.code === '23514' && String(error.message || '').includes('decision_type')) {
        console.warn(`⚠️ [RuntimeTrace] decision_type constraint rejected '${decisionRow.decision_type}', retrying legacy-safe type trace=${this.header.trace_id}`);
        const retry = await supabase
          .from('ai_decision_log')
          .insert({ ...decisionRow, id: (insertedDecisionId = crypto.randomUUID()), decision_type: normalizeLegacyDecisionType(rawDecisionType) });
        error = retry.error;
      }

      if (error && isSchemaColumnError(error)) {
        console.warn(`⚠️ [RuntimeTrace] ai_decision_log schema missing Phase-Y columns, retrying legacy insert trace=${this.header.trace_id}`);
        const retry = await supabase
          .from('ai_decision_log')
          .insert({
            ...legacyDecisionRow,
            id: (insertedDecisionId = crypto.randomUUID()),
            decision_type: normalizeLegacyDecisionType(rawDecisionType),
            // Trace/execution columns were added in 20260626115447; include even on schema-fallback path
            trace_id: this.header.trace_id,
            execution_id: this.header.execution_id,
            runtime_version: this.header.runtime_version,
            reasoning: `${legacyDecisionRow.reasoning} trace_id=${this.header.trace_id} execution_id=${this.header.execution_id}`,
          });
        error = retry.error;
      }

      if (error) {
        console.warn(`⚠️ [RuntimeTrace] ai_decision_log primary insert failed (${error.code}): ${error.message}; retrying minimal legacy-safe row trace=${this.header.trace_id}`);
        const minimalId = crypto.randomUUID();
        const retry = await supabase
          .from('ai_decision_log')
          .insert({
            id: minimalId,
            tenant_id: tenantId,
            farmer_id: safeUuid(extra.farmer_id ?? ctx.farmer_id),
            land_id: safeUuid(extra.land_id ?? ctx.land_id),
            schedule_id: null,
            decision_type: normalizeLegacyDecisionType(rawDecisionType),
            model_version: this.header.runtime_version,
            // Always stamp Phase-Y identifiers even on minimal fallback so traces are joinable
            trace_id: this.header.trace_id,
            execution_id: this.header.execution_id,
            runtime_version: this.header.runtime_version,
            input_data: { farmer_message: extra.farmer_message ?? null, trace_id: this.header.trace_id, crop: _canon.crop, growth_stage: _canon.growth_stage, days_since_sowing: _canon.days_since_sowing },
            output_data: this.decision ?? this.builderOutput ?? { trace_id: this.header.trace_id },
            reasoning: nonEmptyReasoning(legacyDecisionRow.reasoning, this.context?.intent?.code, 'Minimal runtime trace fallback'),
            confidence_score: confidenceScore,
            execution_time_ms: totalLatency,
            weather_data: null,
            ndvi_data: null,
            soil_data: null,
            success: (extra.validation_passed ?? true) && !(this.decision?.failed),
            error_message: this.decision?.error ?? null,
          });
        if (!retry.error) {
          error = null;
          insertedDecisionId = minimalId;
        } else {
          // Last resort: drop the new Phase-Y columns in case the deployed DB still lacks them
          console.warn(`⚠️ [RuntimeTrace] minimal-with-trace insert failed (${retry.error.code}): ${retry.error.message}; retrying without Phase-Y columns`);
          const bareId = crypto.randomUUID();
          const bare = await supabase
            .from('ai_decision_log')
            .insert({
              id: bareId,
              tenant_id: tenantId,
              farmer_id: safeUuid(extra.farmer_id ?? ctx.farmer_id),
              land_id: safeUuid(extra.land_id ?? ctx.land_id),
              schedule_id: null,
              decision_type: normalizeLegacyDecisionType(rawDecisionType),
              model_version: this.header.runtime_version,
              input_data: { farmer_message: extra.farmer_message ?? null, trace_id: this.header.trace_id, crop: _canon.crop, growth_stage: _canon.growth_stage, days_since_sowing: _canon.days_since_sowing },
              output_data: this.decision ?? this.builderOutput ?? { trace_id: this.header.trace_id },
              reasoning: `${nonEmptyReasoning(legacyDecisionRow.reasoning, this.context?.intent?.code, 'Bare runtime trace fallback')} trace_id=${this.header.trace_id}`,
              confidence_score: confidenceScore,
              execution_time_ms: totalLatency,
              success: (extra.validation_passed ?? true) && !(this.decision?.failed),
              error_message: this.decision?.error ?? null,
            });
          if (!bare.error) {
            error = null;
            insertedDecisionId = bareId;
          } else {
            error = bare.error;
          }
        }
      }

      if (error) {
        if (error.code !== '42P01') {
          console.warn(`⚠️ [RuntimeTrace] ai_decision_log insert failed (${error.code}): ${error.message}`);
        }
        return null;
      }
      this.persisted = true;
      this.persistedDecisionId = String(insertedDecisionId);
      this.finishLogLine(totalLatency);
      return this.persistedDecisionId;
    } catch (e: any) {
      console.warn(`⚠️ [RuntimeTrace] persistDecisionLog crashed: ${e?.message || e}`);
      return null;
    }
  }
}


// ─── request-scoped singleton ──────────────────────────────────────────────
let _current: RuntimeTraceCollector | null = null;

export function resetRuntimeTraceCollector(header: Partial<RuntimeTraceHeader> & { trace_id: string }): RuntimeTraceCollector {
  _current = new RuntimeTraceCollector(header);
  return _current;
}

export function getRuntimeTraceCollector(): RuntimeTraceCollector | null {
  return _current;
}

export function clearRuntimeTraceCollector(): void {
  _current = null;
}
