/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUNDLED RULES - INDEX
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Central export for bundled rules functionality.
 */

// Export loader functions
export {
  loadCropGroupRules,
  loadSafetyRules,
  loadAdvancedRules,
  loadIntelligenceRules,
  loadAllRules,
  loadRulesForCrop,
  loadRulesByCategory,
  getRuleCount,
  getRuleCountByCategory,
  getRuleCountByCropGroup,
  getBundleMetadata,
  clearCaches,
  evaluateRules,
  findRulesForCause,
  type ExecutableRule,
  type DecisionInput,
} from './loader.ts';

// Export raw bundled data (for advanced use cases)
export {
  CROP_GROUP_RULES,
  SAFETY_RULES,
  ADVANCED_RULES,
  INTELLIGENCE_RULES,
  BUNDLE_METADATA,
  type BundledRule,
  type BundleMetadata,
} from './all-rules.ts';
