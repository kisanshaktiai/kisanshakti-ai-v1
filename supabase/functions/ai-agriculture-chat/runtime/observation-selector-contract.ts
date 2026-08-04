/**
 * CHANGE LOG (audit trail — newest first, keep entries short)
 * 2026-07-27 — Track A: retired clarification_fallback_questions; rescue path
 *   now reads observation_intent_master.allowed_observation_groups →
 *   observation_master → observation_translations, with a label-collision guard.
 * 2026-07-26 18:20 UTC — Fallback questions never fall back to the raw code as
 *   a farmer label (dropped + [OBS_LABEL_MISSING]); DB-sourced photo option is
 *   appended to rescued option lists.
 * 2026-07-26 12:00 UTC — R3a: hydrate crop/stage/DAS/intent/language from the
 *   canonical SessionSSOT (response.metadata.session_ssot or orchestrator
 *   state) before any contract check; SSOT_LOCK_LOST now only fires on a real
 *   upstream lock loss. SessionSSOT is forwarded to the clarification builder.
 * 2026-07-26 00:00 UTC — Q1/Q2: SSOT-lock invariant on the degrade path plus a
 *   two-stage DB rescue (hypothesis-graph options → intent-group observations)
 *   before any DIAGNOSTIC_ESCALATION degrade. Escalation is now last resort only.
 * 2026-07-09 13:58 UTC — Derive confirmed observations from response metadata
 *   before enforcing empty DECISION_PROVIDED/CLARIFICATION contracts, and pass
 *   those confirmed codes into the hypothesis clarification builder.
 */

// OBSERVATION SELECTOR CONTRACT

import { buildHypothesisClarificationOptions, withPhotoOption } from '../decision/hypothesis-clarification-builder.ts';
import { getSessionSSOT, type SessionSSOT } from './session-ssot.ts';
import { canonicalObsCode } from '../utils/canonical-code.ts';


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
  // RC-1 (2026-07-26) — codes the perception layer grounded this turn but the
  perceivedObservationCodes?: ReadonlyArray<string> | null;
  // Reason surfaced with the clarification so operators can debug graph
  graphReason?: string | null;
  // R3a — canonical SessionSSOT built at Layer 3. When present it is the
  session_ssot?: SessionSSOT | null;
  /** Optional orchestrator instance/state used to resolve the SSOT lazily. */
  orchestratorState?: any;
  // 2026-08-04 — lane/context threading for the applicability gate.
  cultivation_method?: string | null;
  canonical_context?: any;
  biological_state?: any;

}

// SSOT loader — farmer-visible clarification options come from the hypothesis
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
      perceived_observations: ctx.perceivedObservationCodes ?? [],
      trace_id: ctx.traceId,
      session_ssot: ctx.session_ssot ?? null,
      cultivation_method: ctx.cultivation_method ?? null,
      canonical_context: ctx.canonical_context ?? null,
      biological_state: ctx.biological_state ?? null,

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

// SSOT lock invariant. crop_code + growth_stage + DAS + intent_code are
function missingSsotField(ctx: ObservationContractContext): string | null {
  if (!ctx.cropCode) return 'crop_code';
  if (!ctx.growthStage) return 'growth_stage';
  if (typeof ctx.daysSinceSowing !== 'number') return 'days_since_sowing';
  if (!ctx.intentCode) return 'intent_code';
  return null;
}

// Track A (2026-07-27) — `clarification_fallback_questions` retired.
async function loadIntentGroups(
  supabase: any,
  intentCode: string | null | undefined,
): Promise<string[]> {
  const code = String(intentCode ?? '').trim();
  if (!supabase || !code) return [];
  try {
    const { data: intentRow } = await supabase
      .from('observation_intent_master')
      .select('intent_code, intent_category, is_biological, clarification_mode, allowed_observation_groups')
      .eq('intent_code', code)
      .eq('is_active', true)
      .maybeSingle();

    const groups = Array.isArray(intentRow?.allowed_observation_groups)
      ? intentRow!.allowed_observation_groups.map((g: any) => String(g ?? '').trim().toLowerCase()).filter(Boolean)
      : [];
    if (groups.length > 0) return groups;

    console.warn(
      `[CONTRACT_FALLBACK_NO_MAP] intent=${code} category=${intentRow?.intent_category ?? 'n/a'} ` +
      `reason=no_allowed_observation_groups`,
    );
    return [];
  } catch (err) {
    console.warn(`[CONTRACT_FALLBACK_NO_MAP] intent=${code} error=${(err as Error).message}`);
    return [];
  }
}

/** `01_physiology` → `physiology`; `physiology` → `physiology`. */
function groupSuffix(canonicalGroup: unknown): string {
  return String(canonicalGroup ?? '').trim().toLowerCase().replace(/^\d+_/, '');
}

async function loadIntentGroupOptions(
  ctx: ObservationContractContext,
): Promise<ObservationOption[]> {
  const groups = await loadIntentGroups(ctx.supabase, ctx.intentCode);
  if (groups.length === 0) return [];
  const lang = String(ctx.language || 'mr').trim().toLowerCase();
  const confirmed = new Set(
    (ctx.confirmedObservationCodes ?? []).map((c) => canonicalObsCode(String(c ?? ''))).filter(Boolean),
  );

  try {
    const { data: masterRows, error: masterErr } = await ctx.supabase
      .from('observation_master')
      .select('observation_code, canonical_group, can_generate_question, discriminator_score, clarity_score')
      .eq('is_active', true)
      .eq('is_farmer_observable', true)
      .order('discriminator_score', { ascending: false, nullsFirst: false })
      .limit(400);
    if (masterErr) {
      console.warn(`[CONTRACT_FALLBACK_DB] groups=[${groups.join(',')}] error=${masterErr.message}`);
      return [];
    }

    const wanted = new Set(groups);
    const candidates = (masterRows ?? [])
      .filter((r: any) => r?.can_generate_question !== false)
      .filter((r: any) => wanted.has(groupSuffix(r?.canonical_group)))
      .map((r: any) => canonicalObsCode(String(r?.observation_code ?? '')))
      .filter((c: string) => !!c && !confirmed.has(c))
      .slice(0, 12);

    if (candidates.length === 0) {
      console.warn(`[CONTRACT_FALLBACK_DB] groups=[${groups.join(',')}] no farmer-observable candidates`);
      return [];
    }

    const { data: trRows } = await ctx.supabase
      .from('observation_translations')
      .select('observation_code, display_text, description_text, language_code')
      .in('observation_code', candidates)
      .in('language_code', Array.from(new Set([lang, 'en'])));

    const primary = new Map<string, string>();
    const fallback = new Map<string, string>();
    for (const t of trRows ?? []) {
      const k = canonicalObsCode(String(t?.observation_code ?? ''));
      const text = String(t?.display_text || t?.description_text || '').trim();
      if (!k || !text) continue;
      if (String(t?.language_code).toLowerCase() === lang) primary.set(k, text);
      else fallback.set(k, text);
    }

    const out: ObservationOption[] = [];
    const seenLabels = new Set<string>();
    for (const key of candidates) {
      const label = primary.get(key) || fallback.get(key);
      if (!label) {
        console.warn(`[OBS_LABEL_MISSING] source=observation_translations code=${key} lang=${lang} → option dropped`);
        continue;
      }
      // Track D: never render two identical texts on one card.
      if (seenLabels.has(label)) {
        console.warn(`[CLARIFICATION_LABEL_COLLISION] code=${key} lang=${lang} label="${label}" → dropped`);
        continue;
      }
      seenLabels.add(label);
      out.push({
        value: key,
        label,
        observation_key: key,
        i18n_key: `observation.${key}`,
        observation_code: key,
      });
      if (out.length >= 4) break;
    }

    console.log(
      `[CONTRACT_FALLBACK_DB] groups=[${groups.join(',')}] candidates=${candidates.length} ` +
      `returned=${out.length} keys=[${out.map((o) => o.observation_key).join(',')}]`,
    );
    return out.length > 0 ? await withPhotoOption(ctx.supabase, lang, out) : out;
  } catch (err) {
    console.warn(`[CONTRACT_FALLBACK_DB] groups=[${groups.join(',')}] exception=${(err as Error).message}`);
    return [];
  }
}

export interface RescueResult {
  rescued: boolean;
  site: 'hyp_graph_options' | 'intent_group_options' | null;
  option_count: number;
}


// Q2 — DB rescue: hypothesis-graph options first, then the DB fallback
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
    // RC-1 — hydrate perceived (grounded, unconfirmed) observations from the
    // frozen GraphTruth so the builder unions them with the IOM cell.
    if (!ctx.perceivedObservationCodes || ctx.perceivedObservationCodes.length === 0) {
      const gt = ((ctx as any).orchestratorState ?? {})._graphTruth;
      const gtObs = Array.isArray(gt?.canonical_observations) ? gt.canonical_observations : [];
      if (gtObs.length > 0) {
        ctx = { ...ctx, perceivedObservationCodes: gtObs.map((c: unknown) => canonicalObsCode(c)).filter(Boolean) };
        console.log(
          `[OBS_PERCEIVED_HYDRATE] source=graph_truth count=${ctx.perceivedObservationCodes!.length} trace=${ctx.traceId ?? 'n/a'}`,
        );
      }
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

  const fallbackOptions = await loadIntentGroupOptions(ctx);
  if (fallbackOptions.length > 0) {
    promoteToClarification(response, fallbackOptions, ctx);
    stampMetadata(response, fallbackOptions.length);
    response.metadata.observation_source = 'observation_master_intent_group';
    response.metadata.graph_reason = ctx.graphReason || 'NO_STAGE_VALID_HYPOTHESES';
    console.log(
      `[OBSERVATION_CONTRACT_RESCUE] site=intent_group_options options=${fallbackOptions.length} trace=${ctx.traceId ?? 'n/a'}`,
    );
    return { rescued: true, site: 'intent_group_options', option_count: fallbackOptions.length };
  }

  return { rescued: false, site: null, option_count: 0 };
}

// Absolute last-resort escalation. Only reachable when BOTH DB rescue paths
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


// Single enforcement point invoked immediately after the orchestrator returns.
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

