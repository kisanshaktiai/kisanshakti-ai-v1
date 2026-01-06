/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUNDLED RULES - SECURE INDEX
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Central export for bundled rules functionality.
 * 
 * SECURITY NOTES:
 * - All rule loading happens server-side only
 * - Condition functions are reconstructed securely using new Function()
 * - Never expose raw conditionCode in API responses
 * - All evaluations are logged for audit purposes
 * 
 * See RULES_README.md for complete security documentation.
 */

// ═══════════════════════════════════════════════════════════════════════════
// PRIMARY EXPORTS - Use these in edge function
// ═══════════════════════════════════════════════════════════════════════════

// Rule loading functions
export {
  loadCropGroupRules,
  loadSafetyRules,
  loadAdvancedRules,
  loadIntelligenceRules,
  loadAllRules,
  loadRulesForCrop,
  loadRulesByCategory,
} from './loader.ts';

// Rule evaluation functions
export {
  evaluateRules,
  findRulesForCause,
  getRuleIdsForInput,
} from './loader.ts';

// Metadata functions (safe to expose)
export {
  getRuleCount,
  getRuleCountByCategory,
  getRuleCountByCropGroup,
  getBundleMetadata,
  getBundleVersion,
} from './loader.ts';

// Utility functions
export {
  clearCaches,
} from './loader.ts';

// Types
export type {
  ExecutableRule,
  DecisionInput,
  BundledRule,
} from './loader.ts';

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL EXPORTS - Only for advanced use cases within edge function
// ═══════════════════════════════════════════════════════════════════════════

// Raw bundled data (use with caution - prefer loader functions)
export {
  CROP_GROUP_RULES,
  SAFETY_RULES,
  ADVANCED_RULES,
  INTELLIGENCE_RULES,
  BUNDLE_METADATA,
  type BundleMetadata,
} from './all-rules.ts';
