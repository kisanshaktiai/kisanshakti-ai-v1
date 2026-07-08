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

import { loadObservationLabels } from '../i18n/observation-label-loader.ts';
import { loadIOMAllowed } from '../decision/iom-gate.ts';
import { SymbolContract } from './symbol-contract.ts';

export interface ObservationOption {
  value: string;
  label: string;
  observation_key: string;
  i18n_key: string;
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
  /**
   * Reason surfaced with the clarification so operators can debug graph
   * exhaustion vs empty-decision promotion vs plain hydration.
   */
  graphReason?: string | null;
}

/**
 * SSOT loader — prefer `intent_observation_mapping` (DB observation discovery
 * layer) when an intent is known; fall back to `decision_rules`
 * observable_characteristics only when no intent is available. Adds
 * PHOTO_REQUEST as the final option. All symbols pass through SymbolContract
 * so lowercase / snake_case DB codes are treated as first-class graph nodes.
 */
export async function loadObservationSelectorOptions(
  ctx: ObservationContractContext,
): Promise<ObservationOption[]> {
  const cropUpper = (ctx.cropCode || 'ALL').toUpperCase();
  const lang = ctx.language || 'mr';

  try {
    let obsCodes: string[] = [];

    // Preferred SSOT: intent_observation_mapping — same source the graph uses
    // to decide which observations to collect for this intent/crop/stage/DAS.
    if (ctx.intentCode) {
      try {
        const iom = await loadIOMAllowed(
          ctx.supabase,
          ctx.intentCode,
          ctx.cropCode || 'all',
          ctx.growthStage,
          ctx.daysSinceSowing ?? null,
        );
        obsCodes = iom.allowedRanked.slice(0, 6).map((r) => SymbolContract.normalizeOrEmpty(r.observation_code)).filter(Boolean);
      } catch (iomErr) {
        console.warn(`[OBS_SELECTOR_LOADER] IOM load failed, will try decision_rules: ${(iomErr as Error).message}`);
      }
    }

    // Fallback: decision_rules observable_characteristics (legacy path).
    if (obsCodes.length === 0) {
      const { data: topRules } = await ctx.supabase
        .from('decision_rules')
        .select('observable_characteristics')
        .eq('is_active', true)
        .or(`crop_code.eq.${cropUpper},crop_code.eq.all,crop_code.eq.ALL`)
        .not('observable_characteristics', 'is', null)
        .limit(20);

      const obsCodesSet = new Set<string>();
      for (const rule of topRules || []) {
        const chars = rule.observable_characteristics;
        if (Array.isArray(chars)) {
          chars.slice(0, 3).forEach((c: string) => {
            const n = SymbolContract.normalize(c);
            if (n) obsCodesSet.add(n);
          });
        }
      }
      obsCodes = Array.from(obsCodesSet).slice(0, 4);
    }

    if (obsCodes.length === 0) return [];

    obsCodes.push('PHOTO_REQUEST');

    const labelMap = await loadObservationLabels(ctx.supabase, obsCodes, lang);

    return obsCodes.map((code) => {
      const label = labelMap.get(code.toUpperCase());
      return {
        value: code,
        label: label ? `${label.icon || ''} ${label.display_text}`.trim() : code,
        observation_key: code,
        i18n_key: `observation.${code.toLowerCase()}`,
      };
    });
  } catch (err) {
    console.warn(
      `[OBS_SELECTOR_LOADER] trace=${ctx.traceId ?? 'n/a'} failed: ${(err as Error).message}`,
    );
    return [];
  }
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
    const options = await loadObservationSelectorOptions(ctx);
    if (options.length === 0) {
      throw new Error(
        `OBSERVATION_CONTRACT_VIOLATION: empty_options type=CLARIFICATION_QUESTION crop=${ctx.cropCode ?? '?'} trace_id=${ctx.traceId ?? 'n/a'}`,
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
      const options = await loadObservationSelectorOptions(ctx);
      if (options.length === 0) {
        throw new Error(
          `OBSERVATION_CONTRACT_VIOLATION: empty_options type=DECISION_PROVIDED reason=no_recommendations crop=${ctx.cropCode ?? '?'} trace_id=${ctx.traceId ?? 'n/a'}`,
        );
      }
      promoteToClarification(response, options, ctx);
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
    const options = await loadObservationSelectorOptions(ctx);
    if (options.length === 0) {
      // No DB evidence surface at all — leave escalation as-is (better than
      // synthesising options in TypeScript). Log for curator triage.
      console.warn(
        `[OBSERVATION_REQUIRED_PROMOTE_SKIPPED] trace=${ctx.traceId ?? 'n/a'} reason=diagnostic_escalation_no_iom_or_rules crop=${ctx.cropCode ?? '?'} intent=${ctx.intentCode ?? '?'}`,
      );
      return { promoted: false, hydrated: false, option_count: 0, observation_required: false, reason: 'diagnostic_escalation_no_options_available' };
    }
    promoteToClarification(response, options, ctx);
    stampMetadata(response, options.length);
    response.metadata.graph_reason = ctx.graphReason || 'INSUFFICIENT_EVIDENCE';
    console.log(
      `[OBSERVATION_REQUIRED_PROMOTED] trace=${ctx.traceId ?? 'n/a'} reason=diagnostic_escalation_empty crop=${ctx.cropCode ?? '?'} intent=${ctx.intentCode ?? '?'} stage=${ctx.growthStage ?? '?'} options=${options.length} graph_reason=${response.metadata.graph_reason}`,
    );
    return { promoted: true, hydrated: true, option_count: options.length, observation_required: true, reason: 'promoted_diagnostic_escalation' };
  }

  return { promoted: false, hydrated: false, option_count: 0, observation_required: false, reason: null };
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
    source: ctx.intentCode ? 'INTENT_OBSERVATION_MAPPING_SSOT' : 'DECISION_RULES_SSOT',
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
  response.metadata.observation_source = response.metadata.observation_source || 'INTENT_OBSERVATION_MAPPING_SSOT';
  response.metadata.observation_required = true;
  response.metadata.observation_option_count = optionCount;
}

