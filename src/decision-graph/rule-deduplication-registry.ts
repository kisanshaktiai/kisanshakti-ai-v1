/**
 * @deprecated MIGRATED TO BACKEND
 * See: supabase/functions/ai-agriculture-chat/source-rules/rule-deduplication-registry.ts
 */

export interface RuleRegistration {
  pest_or_disease: string;
  crop_code: string;
  primary_rule_id: string;
  ipm_ladder_rules: string[];
  priority_source: 'crop-group' | 'safety' | 'ipm-ladder';
  scientific_source: string;
}

export const RULE_REGISTRY: RuleRegistration[] = [];

export function getPrimaryRule(_pest: string, _crop: string): string | null { return null; }
export function getIPMLadderRules(_pest: string, _crop: string): string[] { return []; }
export function shouldSkipRule(_ruleId: string, _pest: string, _crop: string): boolean { return false; }
export function getRuleRegistryStats() { return { totalRegistrations: 0, byPrioritySource: {}, byCrop: {} }; }
export function validateIPMLadderRules() { return { valid: true, missing: [] }; }

console.warn('[DEPRECATED] rule-deduplication-registry.ts - Logic migrated to backend');
