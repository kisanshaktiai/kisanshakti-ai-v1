/**
 * CHANGE LOG (audit trail — newest first, keep entries short)
 * 2026-07-26 00:00 UTC — Q1/Q2: SSOT-lock invariant on the degrade path plus a
 *   two-stage DB rescue (hypothesis-graph options → clarification_fallback_questions)
 *   before any DIAGNOSTIC_ESCALATION degrade. Escalation is now last resort only.
 * 2026-07-09 13:58 UTC — Derive confirmed observations from response metadata
 *   before enforcing empty DECISION_PROVIDED/CLARIFICATION contracts, and pass
 *   those confirmed codes into the hypothesis clarification builder.
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OBSERVATION SELECTOR CONTRACT
 * ═══════════════════════════════════════════════════════════════════════════
 * Single boundary enforcer for the "OBSERVATION_REQUIRED → UI symptom picker"
 * response contract.
 *
 * Frontend requires:
 *   metadata.orchestrator_type === 'CLARIFICATION_QUESTION'
 *   metadata.options.length > 0
 *   each option: { label, value, observation_key }
 *
 * This module never invents symptoms. Options are loaded from the SSOT:
 *   decision_rules.observable_characteristics × observation_translations
 *
 * Invariants:
 *   1. Any CLARIFICATION_QUESTION response with empty options is hydrated
 *      from the SSOT before it can reach the transform boundary.
 *   2. Any DECISION_PROVIDED response that ships no primary_decision AND no
 *      farmer communication (the classic "I need more information" leak) is
 *      promoted to CLARIFICATION_QUESTION with SSOT-loaded options.
 *   3. If SSOT loading yields zero options, we throw
 *      OBSERVATION_CONTRACT_VIOLATION so the leak is greppable in logs
 *      instead of shipping silently as text.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { buildHypothesisClarificationOptions } from '../decision/hypothesis-clarification-builder.ts';
import { getSessionSSOT, type SessionSSOT } from './session-ssot.ts';


export interface ObservationOption {
  value: string;
  label: string;
  observation_key: string;
  i18n_key: string;
  observation_id?: string;
  observation_code?: string;
  hypothesis_id?: string;
  hypothesis_condition_id?: string;
  graph_version?: string;
  source?: 'hypothesis_graph';
}

export interface ObservationContractContext {
  supabase: any;
  cropCode: string | null;
  growthStage: string | null;
  language: string;
  traceId?: string;
  /** Intent code used to load IOM-scoped observation options (SSOT). */
  intentCode?: string | null;
  /** Days since sowing — narrows the IOM cell. */
  daysSinceSowing?: number | null;
  /** Real farmer-visible symptoms already confirmed for this turn. */
  realObservationCount?: number | null;
  /** Confirmed farmer-visible observation codes already selected/extracted. */
  confirmedObservationCodes?: ReadonlyArray<string> | null;
  /**
   * Reason surfaced with the clarification so operators can debug graph
   * exhaustion vs empty-decision promotion vs plain hydration.
   */
  graphReason?: string | null;
  /**
   * R3a — canonical SessionSSOT built at Layer 3. When present it is the
   * authoritative source of crop/stage/DAS/intent/language.
   */
  session_ssot?: SessionSSOT | null;
  /** Optional orchestrator instance/state used to resolve the SSOT lazily. */
  orchestratorState?: any;

}

/**
 * SSOT loader — farmer-visible clarification options come from the hypothesis
 * graph. `intent_observation_mapping` may be used inside the builder only as a
 * discovery seed; it must never directly emit UI options.
 */
export async function loadObservationSelectorOptions(
  ctx: ObservationContractContext,
): Promise<ObservationOption[]> {
  const lang = ctx.language || 'mr';

  try {
    const graph = await buildHypothesisClarificationOptions({
      supabase: ctx.supabase,
      intent_code: ctx.intentCode,
      crop_code: ctx.cropCode,
      crop_stage: ctx.growthStage,
      DAS: ctx.daysSinceSowing ?? null,
      language: lang,
      max: 6,
      confirmed_observations: ctx.confirmedObservationCodes ?? [],
      trace_id: ctx.traceId,
      session_ssot: ctx.session_ssot ?? null,

    });
    return graph.options.map((o) => ({
      value: o.value,
      label: o.label,
      observation_key: o.observation_key,
      i18n_key: `observation.${o.observation_code.toLowerCase()}`,
      observation_id: o.observation_id,
      observation_code: o.observation_code,
      hypothesis_id: o.hypothesis_id,
      hypothesis_condition_id: o.hypothesis_condition_id,
      graph_version: 'hypothesis_graph_v1',
      source: 'hypothesis_graph',
    }));
  } catch (err) {
    console.warn(
      `[OBS_SELECTOR_LOADER] trace=${ctx.traceId ?? 'n/a'} failed: ${(err as Error).message}`,
    );
    return [];
  }
}

// ─── Q1/Q2 — SSOT lock + DB rescue before any escalation degrade ───────────

/**
 * SSOT lock invariant. crop_code + growth_stage + DAS + intent_code are
 * established at Land Context SSOT (step 3) and MUST be present on every
 * downstream clarification call. Returns the missing field name, or null.
 */
function missingSsotField(ctx: ObservationContractContext): string | null {
  if (!ctx.cropCode) return 'crop_code';
  if (!ctx.growthStage) return 'growth_stage';
  if (typeof ctx.daysSinceSowing !== 'number') return 'days_since_sowing';
  if (!ctx.intentCode) return 'intent_code';
  return null;
}

/**
 * DB-driven intent → fallback family resolution. NO hardcoded intent lists:
 *  1. exact `clarification_fallback_questions.intent_family = intent_code`
 *  2. else, if `observation_intent_master.is_biological` (diagnostic family)
 *     → 'DIAGNOSIS_GENERIC'
 *  3. else null (logged as [CONTRACT_FALLBACK_NO_MAP])
 */
async function mapIntentToFamily(
  supabase: any,
  intentCode: string | null | undefined,
): Promise<string | null> {
  const code = String(intentCode ?? '').trim();
  if (!supabase || !code) return null;

  try {
    const { data: exact } = await supabase
      .from('clarification_fallback_questions')
      .select('intent_family')
      .eq('is_active', true)
      .eq('intent_family', code)
      .limit(1);
    if (Array.isArray(exact) && exact.length > 0) return code;

    const { data: intentRow } = await supabase
      .from('observation_intent_master')
      .select('intent_code, intent_category, is_biological, clarification_mode')
      .eq('intent_code', code)
      .eq('is_active', true)
      .maybeSingle();

    const isDiagnostic = !!(intentRow?.is_biological)
      || !!(intentRow?.clarification_mode && String(intentRow.clarification_mode).trim());
    if (isDiagnostic) return 'DIAGNOSIS_GENERIC';

    console.warn(
      `[CONTRACT_FALLBACK_NO_MAP] intent=${code} category=${intentRow?.intent_category ?? 'n/a'}`,
    );
    return null;
  } catch (err) {
    console.warn(`[CONTRACT_FALLBACK_NO_MAP] intent=${code} error=${(err as Error).message}`);
    return null;
  }
}

/**
 * DB fallback clarification questions. Labels are pre-translated in the DB;
 * no TS constants, no LLM generation.
 */
async function loadFallbackQuestionOptions(
  ctx: ObservationContractContext,
): Promise<ObservationOption[]> {
  const family = await mapIntentToFamily(ctx.supabase, ctx.intentCode);
  if (!family) return [];
  const lang = String(ctx.language || 'mr').trim().toLowerCase();

  try {
    const { data: rows, error } = await ctx.supabase
      .from('clarification_fallback_questions')
      .select('question_code, label_en, label_hi, label_mr, priority')
      .eq('is_active', true)
      .eq('intent_family', family)
      .order('priority', { ascending: true })
      .limit(4);
    if (error) {
      console.warn(`[CONTRACT_FALLBACK_DB] family=${family} error=${error.message}`);
      return [];
    }
    const out: ObservationOption[] = [];
    for (const r of rows || []) {
      const key = String(r?.question_code ?? '').trim();
      if (!key) continue;
      const label = String(
        (lang === 'hi' && r.label_hi) || (lang === 'mr' && r.label_mr) || r.label_en || key,
      );
      out.push({
        value: key,
        label,
        observation_key: key,
        i18n_key: `observation.${key.toLowerCase()}`,
        observation_code: key,
      });
    }
    return out;
  } catch (err) {
    console.warn(`[CONTRACT_FALLBACK_DB] family=${family} exception=${(err as Error).message}`);
    return [];
  }
}

export interface RescueResult {
  rescued: boolean;
  site: 'hyp_graph_options' | 'fallback_questions' | null;
  option_count: number;
}

/**
 * Q2 — DB rescue: hypothesis-graph options first, then the DB fallback
 * question table. Mutates the response into a CLARIFICATION_QUESTION when any
 * DB-sourced options exist. Never synthesises options in TypeScript.
 */
export async function attemptDbClarificationRescue(
  response: any,
  ctx: ObservationContractContext,
): Promise<RescueResult> {
  if (!response || typeof response !== 'object') {
    return { rescued: false, site: null, option_count: 0 };
  }

  // R3a — SSOT hydration (see ensureObservationSelectorContract for rationale).
  {
    const _ssot = (ctx as any).session_ssot ?? getSessionSSOT(response, (ctx as any).orchestratorState ?? null);
    if (_ssot) {
      ctx = {
        ...ctx,
        cropCode: ctx.cropCode || _ssot.crop_code,
        growthStage: ctx.growthStage || _ssot.growth_stage,
        daysSinceSowing: typeof ctx.daysSinceSowing === 'number' ? ctx.daysSinceSowing : _ssot.days_since_sowing,
        intentCode: ctx.intentCode || _ssot.intent_code,
        language: ctx.language || _ssot.language,
        traceId: ctx.traceId || _ssot.trace_id,
      };
    }
  }



  const graphOptions = await loadObservationSelectorOptions(ctx);
  if (graphOptions.length > 0) {
    promoteToClarification(response, graphOptions, ctx);
    stampMetadata(response, graphOptions.length);
    response.metadata.graph_reason = ctx.graphReason || 'INSUFFICIENT_EVIDENCE';
    console.log(
      `[OBSERVATION_CONTRACT_RESCUE] site=hyp_graph_options options=${graphOptions.length} trace=${ctx.traceId ?? 'n/a'}`,
    );
    return { rescued: true, site: 'hyp_graph_options', option_count: graphOptions.length };
  }

  const fallbackOptions = await loadFallbackQuestionOptions(ctx);
  if (fallbackOptions.length > 0) {
    promoteToClarification(response, fallbackOptions, ctx);
    stampMetadata(response, fallbackOptions.length);
    response.metadata.observation_source = 'clarification_fallback_questions';
    response.metadata.graph_reason = ctx.graphReason || 'NO_STAGE_VALID_HYPOTHESES';
    console.log(
      `[OBSERVATION_CONTRACT_RESCUE] site=fallback_questions options=${fallbackOptions.length} trace=${ctx.traceId ?? 'n/a'}`,
    );
    return { rescued: true, site: 'fallback_questions', option_count: fallbackOptions.length };
  }

  return { rescued: false, site: null, option_count: 0 };
}

/**
 * Absolute last-resort escalation. Only reachable when BOTH DB rescue paths
 * returned zero options.
 */
function applyTrueEscalation(
  response: any,
  ctx: ObservationContractContext,
  graphReasonFallback: string,
): void {
  console.warn(
    `[OBSERVATION_CONTRACT_TRUE_ESCALATION] trace=${ctx.traceId ?? 'n/a'} reason=no_db_clarification_available intent=${ctx.intentCode} crop=${ctx.cropCode} stage=${ctx.growthStage}`,
  );
  response.type = 'DIAGNOSTIC_ESCALATION';
  response.metadata = response.metadata && typeof response.metadata === 'object' ? response.metadata : {};
  response.metadata.orchestrator_type = 'DIAGNOSTIC_ESCALATION';
  response.metadata.graph_reason = ctx.graphReason || graphReasonFallback;
  response.metadata.observation_required = false;
  response.metadata.confirmed_observation_count = ctx.realObservationCount ?? 0;
  response.metadata.escalation_payload = {
    confirmed: ctx.confirmedObservationCodes ?? [],
    graph_gap: ctx.graphReason || graphReasonFallback,
    trace_id: ctx.traceId ?? null,
  };
}


/**
 * Single enforcement point invoked immediately after the orchestrator returns.
 * Mutates the response in place to guarantee the OBSERVATION_REQUIRED contract.
 *
 * Returns metadata about what happened for the [BRAIN_TRACE] emitter.
 */
export interface ContractResult {
  promoted: boolean;
  hydrated: boolean;
  option_count: number;
  observation_required: boolean;
  reason: string | null;
}

export async function ensureObservationSelectorContract(
  response: any,
  ctx: ObservationContractContext,
): Promise<ContractResult> {
  if (!response || typeof response !== 'object') {
    return { promoted: false, hydrated: false, option_count: 0, observation_required: false, reason: null };
  }

  // ── R3a — SSOT hydration: if the caller supplied session_ssot OR the
  // response metadata carries it, it is the authoritative source of
  // crop/stage/DAS/intent/language before the individually-passed fields.
  // The existing SSOT_LOCK_LOST invariant then acts as a REAL safety net —
  // it only fires if SSOT hydration itself failed (upstream bug).
  {
    const _ssot = (ctx as any).session_ssot ?? getSessionSSOT(response, (ctx as any).orchestratorState ?? null);
    if (_ssot) {
      ctx = {
        ...ctx,
        cropCode: ctx.cropCode || _ssot.crop_code,
        growthStage: ctx.growthStage || _ssot.growth_stage,
        daysSinceSowing: typeof ctx.daysSinceSowing === 'number' ? ctx.daysSinceSowing : _ssot.days_since_sowing,
        intentCode: ctx.intentCode || _ssot.intent_code,
        language: ctx.language || _ssot.language,
        traceId: ctx.traceId || _ssot.trace_id,
      };
    }
  }



  const responseObservationCodes = extractConfirmedObservationCodes(response);
  const explicitObservationCodes = (ctx.confirmedObservationCodes ?? [])
    .map((code) => String(code ?? '').trim())
    .filter(Boolean);
  const confirmedObservationCodes = Array.from(new Set([...explicitObservationCodes, ...responseObservationCodes]));
  const realObservationCount = Math.max(ctx.realObservationCount ?? 0, confirmedObservationCodes.length);
  const effectiveCtx: ObservationContractContext = {
    ...ctx,
    realObservationCount,
    confirmedObservationCodes,
  };

  const type = String(response.type || '');
  const existingOptions: any[] = Array.isArray(response?.question?.options)
    ? response.question.options
    : (Array.isArray(response?.communication?.options) ? response.communication.options : []);

  // ── Case A: CLARIFICATION_QUESTION with populated options → no-op.
  if (type === 'CLARIFICATION_QUESTION' && existingOptions.length > 0) {
    stampMetadata(response, existingOptions.length);
    return {
      promoted: false,
      hydrated: false,
      option_count: existingOptions.length,
      observation_required: true,
      reason: 'already_populated',
    };
  }

  // ── Case B: CLARIFICATION_QUESTION with empty options → hydrate.
  if (type === 'CLARIFICATION_QUESTION' && existingOptions.length === 0) {
    const options = await loadObservationSelectorOptions(effectiveCtx);
    if (options.length === 0) {
      // Q1/Q2 — never degrade before the DB rescue. SSOT lock must be intact.
      if (realObservationCount > 0) {
        const missing = missingSsotField(effectiveCtx);
        if (missing) {
          console.error(
            `[INVARIANT_VIOLATION] site=OBSERVATION_CONTRACT_DEGRADE reason=SSOT_LOCK_LOST field=${missing} trace=${effectiveCtx.traceId ?? 'n/a'}`,
          );
          return { promoted: false, hydrated: false, option_count: 0, observation_required: false, reason: 'ssot_lock_lost_degrade_skipped' };
        }
        console.warn(
          `[OBSERVATION_CONTRACT_DEGRADE] trace=${effectiveCtx.traceId ?? 'n/a'} from=CLARIFICATION_QUESTION reason=graph_exhausted_after_confirmed_observations crop=${effectiveCtx.cropCode} stage=${effectiveCtx.growthStage} das=${effectiveCtx.daysSinceSowing} intent=${effectiveCtx.intentCode} real_observations=${realObservationCount}`,
        );
        const rescue = await attemptDbClarificationRescue(response, effectiveCtx);
        if (rescue.rescued) {
          return {
            promoted: true,
            hydrated: true,
            option_count: rescue.option_count,
            observation_required: true,
            reason: `rescued_${rescue.site}`,
          };
        }
        applyTrueEscalation(response, effectiveCtx, 'NO_HYPOTHESIS_EDGE_FOR_CONFIRMED_OBSERVATIONS');
        return { promoted: false, hydrated: false, option_count: 0, observation_required: false, reason: 'true_escalation_no_db_clarification' };
      }

      // No confirmed observations AND no options loadable — fatal contract leak.
      throw new Error(
        `OBSERVATION_CONTRACT_VIOLATION: empty_options type=CLARIFICATION_QUESTION crop=${effectiveCtx.cropCode ?? '?'} trace_id=${effectiveCtx.traceId ?? 'n/a'}`,
      );
    }
    injectOptions(response, options);
    stampMetadata(response, options.length);
    console.log(
      `[OBSERVATION_REQUIRED_HYDRATED] trace=${ctx.traceId ?? 'n/a'} reason=empty_clarification_options crop=${ctx.cropCode ?? '?'} stage=${ctx.growthStage ?? '?'} options=${options.length}`,
    );
    return { promoted: false, hydrated: true, option_count: options.length, observation_required: true, reason: 'hydrated_empty_options' };
  }

  // ── Case C: DECISION_PROVIDED with no actionable content → promote.
  if (type === 'DECISION_PROVIDED') {
    const hasPrimary = !!response?.decision_output?.primary_decision;
    const hasSecondary = Array.isArray(response?.decision_output?.secondary_actions)
      && response.decision_output.secondary_actions.length > 0;
    const commFullText = response?.communication?.main_message?.full_text;
    const hasCommText = commFullText && Object.values(commFullText).some(
      (v: any) => typeof v === 'string' && v.trim().length > 40,
    );

    if (!hasPrimary && !hasSecondary && !hasCommText) {
      const options = await loadObservationSelectorOptions(effectiveCtx);
      if (options.length === 0) {
        // Q1/Q2 — DB rescue first, escalation only as absolute last resort.
        if (realObservationCount > 0) {
          const missing = missingSsotField(effectiveCtx);
          if (missing) {
            console.error(
              `[INVARIANT_VIOLATION] site=OBSERVATION_CONTRACT_DEGRADE reason=SSOT_LOCK_LOST field=${missing} trace=${effectiveCtx.traceId ?? 'n/a'}`,
            );
            return { promoted: false, hydrated: false, option_count: 0, observation_required: false, reason: 'ssot_lock_lost_degrade_skipped' };
          }
          console.warn(
            `[OBSERVATION_CONTRACT_DEGRADE] trace=${effectiveCtx.traceId ?? 'n/a'} from=DECISION_PROVIDED reason=stage_fallback_no_rules_after_confirmed_observations crop=${effectiveCtx.cropCode} stage=${effectiveCtx.growthStage} das=${effectiveCtx.daysSinceSowing} intent=${effectiveCtx.intentCode} real_observations=${realObservationCount}`,
          );
          const rescue = await attemptDbClarificationRescue(response, effectiveCtx);
          if (rescue.rescued) {
            return {
              promoted: true,
              hydrated: true,
              option_count: rescue.option_count,
              observation_required: true,
              reason: `rescued_${rescue.site}`,
            };
          }
          applyTrueEscalation(response, effectiveCtx, 'NO_RULES_MATCHED_AFTER_OBSERVATION');
          return { promoted: false, hydrated: false, option_count: 0, observation_required: false, reason: 'true_escalation_no_db_clarification' };
        }

        throw new Error(
          `OBSERVATION_CONTRACT_VIOLATION: empty_options type=DECISION_PROVIDED reason=no_recommendations crop=${effectiveCtx.cropCode ?? '?'} trace_id=${effectiveCtx.traceId ?? 'n/a'}`,
        );
      }
      promoteToClarification(response, options, effectiveCtx);
      stampMetadata(response, options.length);
      console.log(
        `[OBSERVATION_REQUIRED_PROMOTED] trace=${ctx.traceId ?? 'n/a'} reason=decision_provided_empty crop=${ctx.cropCode ?? '?'} stage=${ctx.growthStage ?? '?'} options=${options.length}`,
      );
      return { promoted: true, hydrated: true, option_count: options.length, observation_required: true, reason: 'promoted_empty_decision' };
    }
  }

  // ── Case D: DIAGNOSTIC_ESCALATION with no options → promote to
  // CLARIFICATION_QUESTION with DB-sourced (IOM/decision_rules) options.
  // This is the graph-exhaustion path (hypothesis=0, rules=0). The farmer
  // must be asked a scoped observation question instead of receiving an
  // empty escalation card.
  if (type === 'DIAGNOSTIC_ESCALATION' && existingOptions.length === 0) {
    const options = await loadObservationSelectorOptions(effectiveCtx);
    if (options.length === 0) {
      // Q2 — DB fallback questions before conceding an empty escalation card.
      const fallbackRescue = await attemptDbClarificationRescue(response, effectiveCtx);
      if (fallbackRescue.rescued) {
        return {
          promoted: true,
          hydrated: true,
          option_count: fallbackRescue.option_count,
          observation_required: true,
          reason: `rescued_${fallbackRescue.site}`,
        };
      }
      if (realObservationCount > 0) {
        console.warn(
          `[OBSERVATION_CONTRACT_TRUE_ESCALATION] trace=${effectiveCtx.traceId ?? 'n/a'} reason=no_db_clarification_available intent=${effectiveCtx.intentCode} crop=${effectiveCtx.cropCode} stage=${effectiveCtx.growthStage}`,
        );
      }
      // No DB evidence surface at all — leave escalation as-is (better than
      // synthesising options in TypeScript). Log for curator triage.
      console.warn(
        `[OBSERVATION_REQUIRED_PROMOTE_SKIPPED] trace=${ctx.traceId ?? 'n/a'} reason=diagnostic_escalation_no_iom_or_rules crop=${ctx.cropCode ?? '?'} intent=${ctx.intentCode ?? '?'}`,
      );
      return { promoted: false, hydrated: false, option_count: 0, observation_required: false, reason: 'diagnostic_escalation_no_options_available' };
    }

    promoteToClarification(response, options, effectiveCtx);
    stampMetadata(response, options.length);
    response.metadata.graph_reason = ctx.graphReason || 'INSUFFICIENT_EVIDENCE';
    console.log(
      `[OBSERVATION_REQUIRED_PROMOTED] trace=${ctx.traceId ?? 'n/a'} reason=diagnostic_escalation_empty crop=${ctx.cropCode ?? '?'} intent=${ctx.intentCode ?? '?'} stage=${ctx.growthStage ?? '?'} options=${options.length} graph_reason=${response.metadata.graph_reason}`,
    );
    return { promoted: true, hydrated: true, option_count: options.length, observation_required: true, reason: 'promoted_diagnostic_escalation' };
  }

  return { promoted: false, hydrated: false, option_count: 0, observation_required: false, reason: null };
}

function extractConfirmedObservationCodes(response: any): string[] {
  const out: string[] = [];
  const push = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) push(item);
      return;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      push(record.observation_code ?? record.observation_key ?? record.code ?? record.value);
      return;
    }
    const code = String(value ?? '').trim();
    if (code) out.push(code);
  };

  push(response?.metadata?.real_observations);
  push(response?.metadata?.confirmed_observations);
  push(response?.metadata?.confirmedObservationCodes);
  push(response?.metadata?.mapped_observation);
  push(response?.metadata?.selected_graph_node?.observation_code);
  push(response?.decision_output?.metadata?.real_observations);
  push(response?.decision_output?.metadata?.confirmed_observations);
  push(response?.decision_output?.metadata?.confirmedObservationCodes);
  push(response?.decision_output?.metadata?.mapped_observation);
  push(response?.decision_output?.metadata?.selected_graph_node?.observation_code);

  return Array.from(new Set(out));
}

function injectOptions(response: any, options: ObservationOption[]): void {
  response.question = response.question && typeof response.question === 'object' ? response.question : {};
  response.question.options = options;
  if (response.communication && typeof response.communication === 'object') {
    response.communication.options = options;
  }
}

function promoteToClarification(
  response: any,
  options: ObservationOption[],
  ctx: ObservationContractContext,
): void {
  response.type = 'CLARIFICATION_QUESTION';
  response.question = {
    question_id: `obs_required_${Date.now()}`,
    text_en: 'To help diagnose your crop issue, please select what you observe:',
    options,
    scope: 'OBSERVATION_REQUIRED',
    source: 'hypothesis_graph',
  };
  response.communication = response.communication && typeof response.communication === 'object'
    ? response.communication
    : {};
  response.communication.options = options;
}

function stampMetadata(response: any, optionCount: number): void {
  response.metadata = response.metadata && typeof response.metadata === 'object' ? response.metadata : {};
  response.metadata.orchestrator_type = 'CLARIFICATION_QUESTION';
  if (!response.metadata.selectionType) response.metadata.selectionType = 'MULTIPLE_CHOICE';
  response.metadata.observation_source = response.metadata.observation_source || 'hypothesis_graph';
  response.metadata.observation_required = true;
  response.metadata.observation_option_count = optionCount;
}

