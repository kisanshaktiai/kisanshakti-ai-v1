/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUNDLED RULES - SECURE INDEX
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Central export for bundled rules functionality.
 * Uses database-first loading strategy for production.
 */

// ═══════════════════════════════════════════════════════════════════════════
// PRIMARY EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  loadAllRules,
  loadCropGroupRules,
  loadSafetyRules,
  loadAdvancedRules,
  loadIntelligenceRules,
  loadRulesForCrop,
  loadRulesByCategory,
  evaluateRules,
  findRulesForCause,
  getRuleIdsForInput,
  getRuleCount,
  getRuleCountByCategory,
  getRuleCountByCropGroup,
  getBundleMetadata,
  getBundleVersion,
  clearCaches,
} from './loader.ts';

export type {
  ExecutableRule,
  DecisionInput,
  BundledRule,
} from './loader.ts';

// Types from all-rules
export type { BundleMetadata } from './all-rules.ts';

// Stub exports for backward compatibility
export {
  CROP_GROUP_RULES,
  SAFETY_RULES,
  ADVANCED_RULES,
  INTELLIGENCE_RULES,
  BUNDLE_METADATA,
} from './all-rules.ts';
