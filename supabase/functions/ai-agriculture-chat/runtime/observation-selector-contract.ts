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
}

/**
 * SSOT loader — top observable_characteristics for the crop, hydrated with
 * translated labels. Adds PHOTO_REQUEST as the final option.
 */
export async function loadObservationSelectorOptions(
  ctx: ObservationContractContext,
): Promise<ObservationOption[]> {
  const cropUpper = (ctx.cropCode || 'ALL').toUpperCase();
  const lang = ctx.language || 'mr';

  try {
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
          if (typeof c === 'string' && c.trim()) obsCodesSet.add(c.toUpperCase().trim());
        });
      }
    }

    const obsCodes = Array.from(obsCodesSet).slice(0, 4);
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
    source: 'DECISION_RULES_SSOT',
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
  response.metadata.observation_source = 'DECISION_RULES_SSOT';
  response.metadata.observation_required = true;
  response.metadata.observation_option_count = optionCount;
}
