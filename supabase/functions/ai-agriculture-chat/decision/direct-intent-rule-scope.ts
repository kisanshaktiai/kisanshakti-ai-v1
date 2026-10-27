// CHANGE LOG (newest first)
// 2026-10-27 17:50 UTC — Add read-only positive direct-intent category authorization from the existing DB scope table.
// DIRECT INTENT SCOPE: action eligibility only; not diagnostic graph or safety authority.

import { canonicalIntentCode } from '../utils/canonical-code.ts';

export type DirectIntentScopeState = 'NOT_DIRECT' | 'READY' | 'NO_SCOPE' | 'UNAVAILABLE';
export interface DirectIntentScope {
  readonly state: DirectIntentScopeState;
  readonly categories: ReadonlySet<string>;
}
const categoryKey = (value: unknown) => String(value ?? '').trim().toLowerCase();

export async function loadDirectIntentScope(
  supabase: any, intentCode: string | null | undefined,
  directMode: boolean, traceId = 'n/a',
): Promise<DirectIntentScope> {
  if (!directMode) return { state: 'NOT_DIRECT', categories: new Set<string>() };
  const intent = canonicalIntentCode(intentCode ?? '');
  if (!intent) return { state: 'NO_SCOPE', categories: new Set<string>() };
  try {
    const { data, error } = await supabase
      .from('direct_intent_rule_scope')
      .select('rule_category')
      .eq('intent_code', intent)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .limit(100);
    if (error) throw new Error(String(error.message));
    const categories = new Set<string>(
      (Array.isArray(data) ? data : [])
        .map((row: any) => categoryKey(row.rule_category)).filter(Boolean),
    );
    if (!categories.size) {
      console.warn('[DIRECT_SCOPE_NO_MAPPING] trace=' + traceId + ' intent=' + intent);
      return { state: 'NO_SCOPE', categories };
    }
    return { state: 'READY', categories };
  } catch (error) {
    console.error('[DIRECT_SCOPE_UNAVAILABLE] trace=' + traceId + ' intent=' + intent
      + ' reason=' + (error instanceof Error ? error.message : String(error)));
    return { state: 'UNAVAILABLE', categories: new Set<string>() };
  }
}

export function filterDirectIntentCandidates<T extends Record<string, any>>(
  candidates: T[], scope: DirectIntentScope,
): T[] {
  if (scope.state === 'NOT_DIRECT') return candidates;
  return candidates.filter((rule) => {
    // Independent safety/context block gates remain authoritative.
    if (rule?.is_safety_block === true ||
        String(rule?.trigger_class ?? '').toUpperCase() === 'CONTEXT_BLOCK') return true;
    if (scope.state !== 'READY') return false;
    const category = categoryKey(
      rule?.category ?? rule?.rule_category ?? rule?.then?.action_details?.category,
    );
    return !!category && scope.categories.has(category);
  });
}
