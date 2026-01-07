/**
 * @deprecated Migrated to backend Safety Guardian + Rule Engine
 * See: supabase/functions/ai-agriculture-chat/source-rules/safety-rules/absolute-rules.ts
 */

export const DEPRECATED_MESSAGE = 'This module has been deprecated. Safety rules are now enforced by the backend Safety Guardian.';

// Types only - no logic
export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  description: string;
  correctionApplied: string;
}

export interface GuardedAdvisory {
  violations: RuleViolation[];
  wasModified: boolean;
  finalConfidence: number;
  safetyLog: string[];
}

console.warn('[DEPRECATED] absoluteRulesGuard.ts - Logic migrated to backend');
