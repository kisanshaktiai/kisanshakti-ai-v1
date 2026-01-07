/**
 * @deprecated Migrated to backend rule engine
 * See: supabase/functions/ai-agriculture-chat/source-rules/
 */

export const DEPRECATED_MESSAGE = 'Cause inference has been migrated to the backend rule engine.';

// Empty exports to prevent import errors
export const GLOBAL_RULES: never[] = [];
export function inferCauses() { throw new Error(DEPRECATED_MESSAGE); }
export function loadCropGroupRules() { throw new Error(DEPRECATED_MESSAGE); }
export function registerCropGroupRules() { throw new Error(DEPRECATED_MESSAGE); }
export function filterRulesForCrop() { throw new Error(DEPRECATED_MESSAGE); }
