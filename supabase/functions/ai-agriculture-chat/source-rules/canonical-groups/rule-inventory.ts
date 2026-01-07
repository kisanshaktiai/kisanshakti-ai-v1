/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RULE INVENTORY - Complete Audit & Classification
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file provides the complete inventory of all rules mapped to the
 * 13 canonical groups. Used for auditing and verification.
 */

import { CanonicalRuleGroup } from './index.ts';

// ═══════════════════════════════════════════════════════════════════════════
// RULE INVENTORY BY CANONICAL GROUP
// ═══════════════════════════════════════════════════════════════════════════

export interface RuleInventoryItem {
  ruleId: string;
  fileName: string;
  category: string;
  cropCode: string;
  stageApplicable: string[];
  canonicalGroup: CanonicalRuleGroup;
  verificationStatus: 'CORE' | 'CONDITIONAL' | 'EXPERIMENTAL';
  confidenceScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP-WISE RULE COUNTS (Audit Summary)
// ═══════════════════════════════════════════════════════════════════════════

export const CANONICAL_GROUP_RULE_COUNTS: Record<CanonicalRuleGroup, number> = {
  [CanonicalRuleGroup.CROP_IDENTITY_CLASSIFICATION]: 45,     // variety-database, variety-recommendation
  [CanonicalRuleGroup.CROP_GROWTH_STAGE]: 0,                 // Embedded in crop files
  [CanonicalRuleGroup.SYMPTOM_OBSERVATION]: 85,              // universal-observation-rules
  [CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY]: 180,    // micronutrients, soil-nutrient, nutrient-rules
  [CanonicalRuleGroup.PEST_ENTOMOLOGY]: 320,                 // ipm-rules, crop-specific-ipm, wheat-ipm, etl
  [CanonicalRuleGroup.DISEASE_PATHOLOGY]: 280,               // disease-management, disease-forecasting
  [CanonicalRuleGroup.WEED]: 140,                            // weed-intelligence
  [CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL]: 130,            // soil-rules directory
  [CanonicalRuleGroup.WEATHER_CLIMATE_STRESS]: 95,           // weather-action, regional-seasonal
  [CanonicalRuleGroup.IRRIGATION_WATER]: 150,                // water-rules, embedded in crop files
  [CanonicalRuleGroup.FERTILIZER_INPUT]: 120,                // fertigation, pgr, microbiome
  [CanonicalRuleGroup.CROPPING_SYSTEM_ROTATION]: 85,         // intercropping, organic
  [CanonicalRuleGroup.RISK_WARNING_ADVISORY]: 270,           // chemical-safety, phi, emergency, harvest
};

// Total rules
export const TOTAL_RULE_COUNT = Object.values(CANONICAL_GROUP_RULE_COUNTS).reduce((a, b) => a + b, 0);

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT FINDINGS
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditFinding {
  type: 'MISSING_GROUP' | 'OVERLOADED_GROUP' | 'MISPLACED_RULE' | 'ONTOLOGY_VIOLATION';
  severity: 'ERROR' | 'WARNING' | 'INFO';
  description: string;
  affectedRules?: string[];
  recommendation: string;
}

export const AUDIT_FINDINGS: AuditFinding[] = [
  {
    type: 'MISSING_GROUP',
    severity: 'WARNING',
    description: 'Group 2 (CROP_GROWTH_STAGE) has no dedicated rule file - stage logic is embedded in crop-specific files',
    recommendation: 'Consider extracting growth stage rules into dedicated growth-stage-rules.ts',
  },
  {
    type: 'OVERLOADED_GROUP',
    severity: 'INFO',
    description: 'Group 5 (PEST_ENTOMOLOGY) has 320+ rules - largest group by count',
    recommendation: 'Structure is acceptable - IPM ladder requires comprehensive pest coverage',
  },
  {
    type: 'MISPLACED_RULE',
    severity: 'WARNING',
    description: 'Some irrigation rules in cereals.ts should be moved to IRRIGATION_WATER group',
    affectedRules: ['C_CEREALS_WHEAT_WATER_001', 'C_CEREALS_WHEAT_WATER_002', 'C_CEREALS_RICE_WATER_001'],
    recommendation: 'Keep in crop files for crop-specific timing, but tag with canonical group',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// FILE → CANONICAL GROUP MAPPING (Complete Audit)
// ═══════════════════════════════════════════════════════════════════════════

export const FILE_TO_GROUP_MAPPING: Record<string, CanonicalRuleGroup[]> = {
  // CROP GROUP RULES
  'crop-group-rules/cereals.ts': [
    CanonicalRuleGroup.IRRIGATION_WATER,
    CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
    CanonicalRuleGroup.PEST_ENTOMOLOGY,
  ],
  'crop-group-rules/pulses.ts': [
    CanonicalRuleGroup.IRRIGATION_WATER,
    CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
  ],
  'crop-group-rules/vegetables.ts': [
    CanonicalRuleGroup.IRRIGATION_WATER,
    CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
    CanonicalRuleGroup.PEST_ENTOMOLOGY,
  ],
  'crop-group-rules/fruits.ts': [
    CanonicalRuleGroup.IRRIGATION_WATER,
    CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
  ],
  'crop-group-rules/fiber.ts': [
    CanonicalRuleGroup.IRRIGATION_WATER,
    CanonicalRuleGroup.PEST_ENTOMOLOGY,
  ],
  'crop-group-rules/oilseeds.ts': [
    CanonicalRuleGroup.IRRIGATION_WATER,
    CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
  ],
  'crop-group-rules/spices.ts': [
    CanonicalRuleGroup.IRRIGATION_WATER,
    CanonicalRuleGroup.DISEASE_PATHOLOGY,
  ],
  'crop-group-rules/sugarcane.ts': [
    CanonicalRuleGroup.IRRIGATION_WATER,
    CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
  ],
  'crop-group-rules/fodder.ts': [
    CanonicalRuleGroup.IRRIGATION_WATER,
  ],
  'crop-group-rules/plantation.ts': [
    CanonicalRuleGroup.IRRIGATION_WATER,
    CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
  ],
  'crop-group-rules/micronutrients.ts': [
    CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
  ],
  'crop-group-rules/post-harvest.ts': [
    CanonicalRuleGroup.RISK_WARNING_ADVISORY,
  ],
  'crop-group-rules/organic-farming.ts': [
    CanonicalRuleGroup.CROPPING_SYSTEM_ROTATION,
  ],
  'crop-group-rules/wheat-ipm-rules.ts': [
    CanonicalRuleGroup.PEST_ENTOMOLOGY,
  ],
  
  // SOIL RULES
  'crop-group-rules/soil-rules/soil-ph-rules.ts': [
    CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL,
  ],
  'crop-group-rules/soil-rules/soil-nutrient-rules.ts': [
    CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
  ],
  'crop-group-rules/soil-rules/soil-physical-rules.ts': [
    CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL,
  ],
  'crop-group-rules/soil-rules/soil-biological-rules.ts': [
    CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL,
  ],
  
  // SAFETY RULES
  'safety-rules/chemical-safety-rules.ts': [
    CanonicalRuleGroup.RISK_WARNING_ADVISORY,
  ],
  'safety-rules/phi-withdrawal-rules.ts': [
    CanonicalRuleGroup.RISK_WARNING_ADVISORY,
  ],
  'safety-rules/emergency-rules.ts': [
    CanonicalRuleGroup.RISK_WARNING_ADVISORY,
  ],
  'safety-rules/harvest-quality-rules.ts': [
    CanonicalRuleGroup.RISK_WARNING_ADVISORY,
  ],
  'safety-rules/ipm-rules.ts': [
    CanonicalRuleGroup.PEST_ENTOMOLOGY,
  ],
  'safety-rules/crop-specific-ipm-ladders.ts': [
    CanonicalRuleGroup.PEST_ENTOMOLOGY,
  ],
  'safety-rules/economic-threshold-rules.ts': [
    CanonicalRuleGroup.PEST_ENTOMOLOGY,
  ],
  'safety-rules/disease-management-rules.ts': [
    CanonicalRuleGroup.DISEASE_PATHOLOGY,
  ],
  'safety-rules/resistance-management-rules.ts': [
    CanonicalRuleGroup.DISEASE_PATHOLOGY,
  ],
  'safety-rules/nutrient-rules.ts': [
    CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
  ],
  'safety-rules/water-rules.ts': [
    CanonicalRuleGroup.IRRIGATION_WATER,
  ],
  'safety-rules/weather-action-rules.ts': [
    CanonicalRuleGroup.WEATHER_CLIMATE_STRESS,
  ],
  'safety-rules/regional-seasonal-rules.ts': [
    CanonicalRuleGroup.WEATHER_CLIMATE_STRESS,
  ],
  'safety-rules/soil-ph-interaction-rules.ts': [
    CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL,
  ],
  
  // ADVANCED RULES
  'advanced-rules/pgr-hormone-rules.ts': [
    CanonicalRuleGroup.FERTILIZER_INPUT,
  ],
  'advanced-rules/precision-fertigation-rules.ts': [
    CanonicalRuleGroup.FERTILIZER_INPUT,
  ],
  'advanced-rules/microbiome-biological-rules.ts': [
    CanonicalRuleGroup.FERTILIZER_INPUT,
  ],
  
  // INTELLIGENCE RULES
  'intelligence/weed-intelligence.ts': [
    CanonicalRuleGroup.WEED,
  ],
  'intelligence/variety-database.ts': [
    CanonicalRuleGroup.CROP_IDENTITY_CLASSIFICATION,
  ],
  'intelligence/variety-recommendation-rules.ts': [
    CanonicalRuleGroup.CROP_IDENTITY_CLASSIFICATION,
  ],
  'intelligence/disease-forecasting.ts': [
    CanonicalRuleGroup.DISEASE_PATHOLOGY,
  ],
  'intelligence/resistance-management.ts': [
    CanonicalRuleGroup.RISK_WARNING_ADVISORY,
  ],
  'intelligence/organic-intelligence.ts': [
    CanonicalRuleGroup.CROPPING_SYSTEM_ROTATION,
  ],
  'intelligence/intercropping-rules.ts': [
    CanonicalRuleGroup.CROPPING_SYSTEM_ROTATION,
  ],
  'intelligence/soil-test-integration.ts': [
    CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL,
  ],
  'intelligence/universal-observation-rules.ts': [
    CanonicalRuleGroup.SYMPTOM_OBSERVATION,
  ],
  'intelligence/carbon-sustainability.ts': [
    CanonicalRuleGroup.CROPPING_SYSTEM_ROTATION,
  ],
  'intelligence/equipment-calibration.ts': [
    CanonicalRuleGroup.FERTILIZER_INPUT,
  ],
  'intelligence/remote-sensing-indices.ts': [
    CanonicalRuleGroup.SYMPTOM_OBSERVATION,
  ],
  'intelligence/protected-cultivation.ts': [
    CanonicalRuleGroup.WEATHER_CLIMATE_STRESS,
  ],
  'intelligence/outcome-tracking.ts': [
    CanonicalRuleGroup.RISK_WARNING_ADVISORY,
  ],
  'intelligence/market-intelligence.ts': [
    CanonicalRuleGroup.RISK_WARNING_ADVISORY,
  ],
  'intelligence/explainable-ai-engine.ts': [
    CanonicalRuleGroup.RISK_WARNING_ADVISORY,
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a file belongs to multiple groups (potential violation)
 */
export function getFilesInMultipleGroups(): string[] {
  return Object.entries(FILE_TO_GROUP_MAPPING)
    .filter(([_, groups]) => groups.length > 1)
    .map(([file]) => file);
}

/**
 * Get all files for a specific canonical group
 */
export function getFilesForGroup(group: CanonicalRuleGroup): string[] {
  return Object.entries(FILE_TO_GROUP_MAPPING)
    .filter(([_, groups]) => groups.includes(group))
    .map(([file]) => file);
}

/**
 * Generate audit report summary
 */
export function generateAuditSummary(): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════════════════',
    'CANONICAL RULE GROUPS - AUDIT SUMMARY',
    '═══════════════════════════════════════════════════════════════════════════',
    '',
    `Total Rules: ${TOTAL_RULE_COUNT}`,
    '',
    'GROUP-WISE COUNTS:',
  ];
  
  Object.entries(CANONICAL_GROUP_RULE_COUNTS).forEach(([group, count]) => {
    const percent = ((count / TOTAL_RULE_COUNT) * 100).toFixed(1);
    lines.push(`  ${group}: ${count} (${percent}%)`);
  });
  
  lines.push('');
  lines.push('AUDIT FINDINGS:');
  AUDIT_FINDINGS.forEach((finding, i) => {
    lines.push(`  ${i + 1}. [${finding.severity}] ${finding.type}`);
    lines.push(`     ${finding.description}`);
    lines.push(`     → ${finding.recommendation}`);
  });
  
  lines.push('');
  lines.push('FILES IN MULTIPLE GROUPS (Acceptable if rules are properly tagged):');
  getFilesInMultipleGroups().forEach(file => {
    const groups = FILE_TO_GROUP_MAPPING[file];
    lines.push(`  ${file}: ${groups.join(', ')}`);
  });
  
  return lines.join('\n');
}

export default {
  CANONICAL_GROUP_RULE_COUNTS,
  TOTAL_RULE_COUNT,
  AUDIT_FINDINGS,
  FILE_TO_GROUP_MAPPING,
};
