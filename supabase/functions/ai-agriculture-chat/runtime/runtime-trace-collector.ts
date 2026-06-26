/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE Y — RuntimeTraceCollector
 * ───────────────────────────────────────────────────────────────────────────
 * Single per-request forensic collector. Captures pipeline stages, snapshots,
 * and metrics. Persisted to ai_decision_log via audit-logger.completeTurn().
 *
 * No agronomic logic. No DB writes from this module — it only buffers state.
 * Failures are swallowed so instrumentation never blocks a farmer response.
 * ═══════════════════════════════════════════════════════════════════════════
 */

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

  buildRuntimeTrace(totalLatencyMs: number) {
    return {
      header:  this.header,
      stages:  this.stages,
      totals:  { total_latency_ms: totalLatencyMs, stage_count: this.stages.length },
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

  /**
   * Persist a single row into ai_decision_log. Idempotent — sets `persisted=true`
   * on success and returns the inserted id. Never throws (swallow + warn).
   *
   * Called from:
   *   - audit-logger.completeTurn() (primary, with full TurnAuditLog ctx), and
   *   - index.ts safety-net after orch.orchestrate() returns, so OPTION_SELECTED
   *     and other early-return paths that skip completeTurn still produce a row.
   */
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
      const tenantId = extra.tenant_id ?? ctx.tenant_id ?? null;
      if (!tenantId) {
        // tenant_id is NOT NULL in ai_decision_log — without it we cannot insert.
        return null;
      }

      const decisionRow: Record<string, any> = {
        tenant_id:       tenantId,
        farmer_id:       extra.farmer_id ?? ctx.farmer_id ?? null,
        land_id:         extra.land_id ?? ctx.land_id ?? null,
        schedule_id:     ctx.schedule_id ?? null,
        decision_type:   this.decision?.decision_type
                          || this.decision?.primary_decision?.action_type
                          || 'AI_CHAT',
        model_version:   this.header.runtime_version,
        input_data:      { farmer_message: extra.farmer_message ?? null, observations: extra.observations ?? [] },
        output_data:     this.decision ?? this.builderOutput ?? {},
        reasoning:       this.decision?.reasoning ?? null,
        confidence_score: this.decision?.confidence ?? this.decision?.confidence_score ?? null,
        execution_time_ms: totalLatency,
        weather_data:    ctx.weather ?? null,
        ndvi_data:       ctx.ndvi ?? null,
        soil_data:       ctx.soil ?? null,
        success:         (extra.validation_passed ?? true) && !(this.decision?.failed),
        error_message:   this.decision?.error ?? null,
        hypothesis_id:            hyp?.hypothesis_id ?? hyp?.id ?? null,
        hypothesis_score:         hyp?.score ?? hyp?.confidence ?? null,
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

      const { data, error } = await supabase
        .from('ai_decision_log')
        .insert(decisionRow)
        .select('id')
        .single();

      if (error) {
        if (error.code !== '42P01') {
          console.warn(`⚠️ [RuntimeTrace] ai_decision_log insert failed (${error.code}): ${error.message}`);
        }
        return null;
      }
      this.persisted = true;
      this.persistedDecisionId = data?.id ? String(data.id) : null;
      this.finishLogLine(totalLatency);
      return this.persistedDecisionId;
    } catch (e: any) {
      console.warn(`⚠️ [RuntimeTrace] persistDecisionLog crashed: ${e?.message || e}`);
      return null;
    }
  }
}


// ─── request-scoped singleton ──────────────────────────────────────────────
// Edge functions handle one request per isolate slot; this matches the
// existing AuditLogger singleton pattern.
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
