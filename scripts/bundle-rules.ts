#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RULE BUNDLER - Bundle 2000+ Rules for Edge Function
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This script reads all rules from supabase/functions/ai-agriculture-chat/source-rules/
 * and bundles them into a format that can be loaded by the Supabase Edge Function.
 * 
 * Key transformations:
 * 1. Serialize condition functions to strings
 * 2. Convert TypeScript enums to string literals
 * 3. Generate metadata about rule counts
 * 
 * Usage: npm run bundle-rules
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Backend source rules directory
const SOURCE_RULES_DIR = path.join(ROOT_DIR, 'supabase/functions/ai-agriculture-chat/source-rules');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface BundledRule {
  rule_id: string;
  category: string;
  crop_code: string;
  stage_applicable: string[];
  conditionCode: string;  // Serialized function
  cause: string;
  priority: number;
  scientific_source: string;
  scientific_basis: string;
  icar_package?: string;
  cause_confidence?: number;
  economic_tier?: string;
  estimated_cost_inr?: number;
  metadata?: {
    version?: string;
    author?: string;
    knowledge_layer?: string;
  };
  variety_filter?: {
    include?: string[];
    exclude?: string[];
  };
}

interface BundleMetadata {
  totalRules: number;
  generatedAt: string;
  version: string;
  rulesByCategory: Record<string, number>;
  rulesByCropGroup: Record<string, number>;
}

interface RuleBundle {
  cropGroupRules: Record<string, BundledRule[]>;
  safetyRules: Record<string, BundledRule[]>;
  advancedRules: BundledRule[];
  intelligenceRules: BundledRule[];
  metadata: BundleMetadata;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCTION SERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Serialize a function to a string that can be reconstructed in Deno
 * Handles enum values by converting them to string literals
 */
function serializeCondition(fn: Function): string {
  let fnString = fn.toString();
  
  // Extract just the function body for arrow functions
  // Pattern: (input) => condition OR (input) => { ... }
  const arrowMatch = fnString.match(/^\s*(?:\s*(\w+)\s*)?=>\s*(.+)$/s);
  if (arrowMatch) {
    const [, param, body] = arrowMatch;
    // If body is wrapped in braces, keep it; otherwise add return
    const cleanBody = body.trim();
    if (cleanBody.startsWith('{')) {
      fnString = `(${param}) => ${cleanBody}`;
    } else {
      fnString = `(${param}) => ${cleanBody}`;
    }
  }
  
  // Replace enum values with string literals
  const enumReplacements: [RegExp, string][] = [
    // Soil states
    [/SoilNState\.(\w+)/g, "'$1'"],
    [/SoilPState\.(\w+)/g, "'$1'"],
    [/SoilKState\.(\w+)/g, "'$1'"],
    [/SoilPHState\.(\w+)/g, "'$1'"],
    [/SoilMoistureState\.(\w+)/g, "'$1'"],
    [/SoilZincState\.(\w+)/g, "'$1'"],
    [/SoilOCState\.(\w+)/g, "'$1'"],
    [/SoilTexture\.(\w+)/g, "'$1'"],
    
    // NDVI states
    [/NDVIState\.(\w+)/g, "'$1'"],
    [/NDVITrend\.(\w+)/g, "'$1'"],
    
    // Weather states
    [/WeatherState\.(\w+)/g, "'$1'"],
    
    // Crop stages
    [/CropStage\.(\w+)/g, "'$1'"],
    [/WheatSubStage\.(\w+)/g, "'$1'"],
    [/RiceSubStage\.(\w+)/g, "'$1'"],
    [/CottonSubStage\.(\w+)/g, "'$1'"],
    [/SugarcaneSubStage\.(\w+)/g, "'$1'"],
    
    // Cause enum
    [/Cause\.(\w+)/g, "'$1'"],
    
    // Action enum
    [/Action\.(\w+)/g, "'$1'"],
    
    // Priority levels
    [/PriorityLevel\.(\w+)/g, "'$1'"],
    
    // IPM levels
    [/IPMLevel\.(\w+)/g, "'$1'"],
    
    // Pest life stages
    [/PestLifeStage\.(\w+)/g, "'$1'"],
    
    // Disease severity
    [/DiseaseSeverityIndex\.(\w+)/g, "'$1'"],
    
    // WHO toxicity
    [/WHOToxicityClass\.(\w+)/g, "'$1'"],
    
    // Insecticide/Fungicide groups
    [/InsecticideGroup\.(\w+)/g, "'$1'"],
    [/FungicideGroup\.(\w+)/g, "'$1'"],
    
    // Other enums
    [/CropGroup\.(\w+)/g, "'$1'"],
    [/AgroClimaticZone\.(\w+)/g, "'$1'"],
    [/Season\.(\w+)/g, "'$1'"],
    [/EconomicTier\.(\w+)/g, "'$1'"],
    [/KnowledgeLayer\.(\w+)/g, "'$1'"],
    [/ActionUrgency\.(\w+)/g, "'$1'"],
    [/ResistanceLevel\.(\w+)/g, "'$1'"],
    [/MaturityDuration\.(\w+)/g, "'$1'"],
    [/QualityTrait\.(\w+)/g, "'$1'"],
  ];
  
  for (const [pattern, replacement] of enumReplacements) {
    fnString = fnString.replace(pattern, replacement);
  }
  
  // Handle soil_states.n, soil_states.p, etc. -> soil_states?.n
  fnString = fnString.replace(/input\.soil_states\./g, 'input.soil_states?.');
  
  // Handle optional chaining for other nested properties
  fnString = fnString.replace(/input\.weather_forecast\./g, 'input.weather_forecast?.');
  fnString = fnString.replace(/input\.ndvi_analytics\./g, 'input.ndvi_analytics?.');
  
  return fnString;
}

/**
 * Extract enum value from CropStage[] array
 */
function serializeStageArray(stages: any[]): string[] {
  return stages.map(stage => {
    if (typeof stage === 'string') return stage;
    // Handle enum values - extract the key
    const stageStr = String(stage);
    return stageStr;
  });
}

/**
 * Convert a CauseRule to a BundledRule
 */
function bundleRule(rule: any): BundledRule {
  return {
    rule_id: rule.rule_id,
    category: rule.category,
    crop_code: rule.crop_code,
    stage_applicable: serializeStageArray(rule.stage_applicable || []),
    conditionCode: serializeCondition(rule.conditions),
    cause: typeof rule.cause === 'string' ? rule.cause : String(rule.cause),
    priority: rule.priority,
    scientific_source: rule.scientific_source,
    scientific_basis: rule.scientific_basis,
    icar_package: rule.icar_package,
    cause_confidence: rule.cause_confidence,
    economic_tier: rule.economic_tier ? String(rule.economic_tier) : undefined,
    estimated_cost_inr: rule.estimated_cost_inr,
    metadata: rule.metadata ? {
      version: rule.metadata.version,
      author: rule.metadata.author,
      knowledge_layer: rule.metadata.knowledge_layer ? String(rule.metadata.knowledge_layer) : undefined,
    } : undefined,
    variety_filter: rule.variety_filter,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE LOADING - FROM BACKEND SOURCE-RULES
// ═══════════════════════════════════════════════════════════════════════════

async function loadCropGroupRules(): Promise<Record<string, BundledRule[]>> {
  const result: Record<string, BundledRule[]> = {};
  
  try {
    // Import the crop group index from backend source-rules
    const importPath = pathToFileURL(path.join(SOURCE_RULES_DIR, 'crop-group-rules/index.ts')).href;
    const cropGroupIndex = await import(importPath);
    
    // Process each crop group
    const cropGroups = ['CEREALS', 'PULSES', 'VEGETABLES', 'FIBER', 'OILSEEDS', 'FRUITS', 'SPICES', 'FODDER', 'PLANTATION'];
    
    for (const group of cropGroups) {
      const rulesKey = `${group}_RULES`;
      const rules = cropGroupIndex[rulesKey];
      if (rules && Array.isArray(rules)) {
        result[group.toLowerCase()] = rules.map(bundleRule);
        console.log(`  ✓ ${group}: ${rules.length} rules`);
      }
    }
    
    // Add sugarcane (default export)
    if (cropGroupIndex.SUGARCANE_RULES) {
      result['sugarcane'] = cropGroupIndex.SUGARCANE_RULES.map(bundleRule);
      console.log(`  ✓ SUGARCANE: ${cropGroupIndex.SUGARCANE_RULES.length} rules`);
    }
    
    // Add universal rules (micronutrients + post-harvest)
    if (cropGroupIndex.MICRONUTRIENT_RULES) {
      result['micronutrients'] = cropGroupIndex.MICRONUTRIENT_RULES.map(bundleRule);
      console.log(`  ✓ MICRONUTRIENTS: ${cropGroupIndex.MICRONUTRIENT_RULES.length} rules`);
    }
    
    if (cropGroupIndex.POST_HARVEST_RULES) {
      result['post_harvest'] = cropGroupIndex.POST_HARVEST_RULES.map(bundleRule);
      console.log(`  ✓ POST_HARVEST: ${cropGroupIndex.POST_HARVEST_RULES.length} rules`);
    }
    
    // Add organic farming rules (60 rules)
    if (cropGroupIndex.ORGANIC_FARMING_RULES) {
      result['organic_farming'] = cropGroupIndex.ORGANIC_FARMING_RULES.map(bundleRule);
      console.log(`  ✓ ORGANIC_FARMING: ${cropGroupIndex.ORGANIC_FARMING_RULES.length} rules`);
    }
    
    // Add soil management rules (130 rules: pH, nutrient, physical, biological)
    if (cropGroupIndex.ALL_SOIL_RULES) {
      result['soil_management'] = cropGroupIndex.ALL_SOIL_RULES.map(bundleRule);
      console.log(`  ✓ SOIL_MANAGEMENT: ${cropGroupIndex.ALL_SOIL_RULES.length} rules`);
    }
    
  } catch (error) {
    console.error('Error loading crop group rules:', error);
  }
  
  return result;
}

async function loadSafetyRules(): Promise<Record<string, BundledRule[]>> {
  const result: Record<string, BundledRule[]> = {};
  
  try {
    // Import the safety rules index from backend source-rules
    const importPath = pathToFileURL(path.join(SOURCE_RULES_DIR, 'safety-rules/index.ts')).href;
    const safetyIndex = await import(importPath);
    
    const safetyCategories = [
      { key: 'CHEMICAL_SAFETY_RULES', name: 'chemical_safety' },
      { key: 'EMERGENCY_RULES', name: 'emergency' },
      { key: 'PHI_WITHDRAWAL_RULES', name: 'phi_withdrawal' },
      { key: 'ECONOMIC_THRESHOLD_RULES', name: 'economic_threshold' },
      { key: 'IPM_RULES', name: 'ipm' },
      { key: 'CROP_SPECIFIC_IPM_RULES', name: 'crop_specific_ipm' },
      { key: 'RESISTANCE_MANAGEMENT_RULES', name: 'resistance_management' },
      { key: 'HARVEST_QUALITY_RULES', name: 'harvest_quality' },
      { key: 'NUTRIENT_RULES', name: 'nutrient' },
      { key: 'WATER_RULES', name: 'water' },
      { key: 'WEATHER_ACTION_RULES', name: 'weather_action' },
      { key: 'REGIONAL_SEASONAL_RULES', name: 'regional_seasonal' },
      { key: 'DISEASE_MANAGEMENT_RULES', name: 'disease_management' },
      { key: 'SOIL_PH_INTERACTION_RULES', name: 'soil_ph_interaction' },
    ];
    
    for (const { key, name } of safetyCategories) {
      const rules = safetyIndex[key];
      if (rules && Array.isArray(rules)) {
        result[name] = rules.map(bundleRule);
        console.log(`  ✓ ${name}: ${rules.length} rules`);
      }
    }
    
  } catch (error) {
    console.error('Error loading safety rules:', error);
  }
  
  return result;
}

async function loadAdvancedRules(): Promise<BundledRule[]> {
  const result: BundledRule[] = [];
  
  try {
    const importPath = pathToFileURL(path.join(SOURCE_RULES_DIR, 'advanced-rules/index.ts')).href;
    const advancedIndex = await import(importPath);
    
    if (advancedIndex.ALL_ADVANCED_RULES) {
      const rules = advancedIndex.ALL_ADVANCED_RULES;
      for (const rule of rules) {
        result.push(bundleRule(rule));
      }
      console.log(`  ✓ Advanced Rules: ${rules.length} rules`);
    }
    
  } catch (error) {
    console.error('Error loading advanced rules:', error);
  }
  
  return result;
}

async function loadIntelligenceRules(): Promise<BundledRule[]> {
  const result: BundledRule[] = [];
  
  try {
    const importPath = pathToFileURL(path.join(SOURCE_RULES_DIR, 'intelligence/index.ts')).href;
    const intelligenceIndex = await import(importPath);
    
    if (intelligenceIndex.ALL_INTELLIGENCE_RULES) {
      const rules = intelligenceIndex.ALL_INTELLIGENCE_RULES;
      for (const rule of rules) {
        result.push(bundleRule(rule));
      }
      console.log(`  ✓ Intelligence Rules: ${rules.length} rules`);
    }
    
  } catch (error) {
    console.error('Error loading intelligence rules:', error);
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUNDLE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

async function generateBundle(): Promise<RuleBundle> {
  console.log('\n📦 Bundling Agricultural Decision Rules...\n');
  console.log(`📂 Source: ${SOURCE_RULES_DIR}\n`);
  
  console.log('Loading Crop Group Rules:');
  const cropGroupRules = await loadCropGroupRules();
  
  console.log('\nLoading Safety Rules:');
  const safetyRules = await loadSafetyRules();
  
  console.log('\nLoading Advanced Rules:');
  const advancedRules = await loadAdvancedRules();
  
  console.log('\nLoading Intelligence Rules:');
  const intelligenceRules = await loadIntelligenceRules();
  
  // Calculate totals
  let totalRules = 0;
  const rulesByCategory: Record<string, number> = {};
  const rulesByCropGroup: Record<string, number> = {};
  
  for (const [group, rules] of Object.entries(cropGroupRules)) {
    totalRules += rules.length;
    rulesByCropGroup[group] = rules.length;
    for (const rule of rules) {
      rulesByCategory[rule.category] = (rulesByCategory[rule.category] || 0) + 1;
    }
  }
  
  for (const [category, rules] of Object.entries(safetyRules)) {
    totalRules += rules.length;
    for (const rule of rules) {
      rulesByCategory[rule.category] = (rulesByCategory[rule.category] || 0) + 1;
    }
  }
  
  totalRules += advancedRules.length;
  totalRules += intelligenceRules.length;
  
  const metadata: BundleMetadata = {
    totalRules,
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    rulesByCategory,
    rulesByCropGroup,
  };
  
  console.log(`\n✅ Total Rules Bundled: ${totalRules}`);
  
  return {
    cropGroupRules,
    safetyRules,
    advancedRules,
    intelligenceRules,
    metadata,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECKSUM GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function generateChecksum(bundle: RuleBundle): string {
  // Create a deterministic string from rule IDs
  const allRuleIds = [
    ...Object.values(bundle.cropGroupRules).flat().map(r => r.rule_id),
    ...Object.values(bundle.safetyRules).flat().map(r => r.rule_id),
    ...bundle.advancedRules.map(r => r.rule_id),
    ...bundle.intelligenceRules.map(r => r.rule_id),
  ].sort().join('|');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < allRuleIds.length; i++) {
    const char = allRuleIds.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(16);
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE WRITING
// ═══════════════════════════════════════════════════════════════════════════

function writeBundle(bundle: RuleBundle): void {
  const OUTPUT_DIR = path.join(ROOT_DIR, 'supabase/functions/ai-agriculture-chat/bundled-rules');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Generate checksum
  const checksum = generateChecksum(bundle);
  console.log(`\n🔒 Bundle checksum: ${checksum}`);
  
  // Write JSON file (for reference/debugging - GITIGNORED)
  const jsonPath = path.join(OUTPUT_DIR, 'all-rules.json');
  fs.writeFileSync(jsonPath, JSON.stringify(bundle, null, 2));
  console.log(`📄 Written: ${jsonPath} (GITIGNORED - do not commit)`);
  
  // Write TypeScript file
  const tsContent = generateTypeScriptBundle(bundle);
  const tsPath = path.join(OUTPUT_DIR, 'all-rules.ts');
  fs.writeFileSync(tsPath, tsContent);
  console.log(`📄 Written: ${tsPath}`);
  
  // Write metadata file (GITIGNORED)
  const metadataPath = path.join(OUTPUT_DIR, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify({
    ...bundle.metadata,
    checksum,
  }, null, 2));
  console.log(`📄 Written: ${metadataPath} (GITIGNORED - do not commit)`);
  
  // Write checksum file (GITIGNORED)
  const checksumPath = path.join(OUTPUT_DIR, '.checksum');
  fs.writeFileSync(checksumPath, checksum);
  console.log(`🔐 Written: ${checksumPath} (GITIGNORED - do not commit)`);
  
  console.log('\n🎉 Rule bundling complete!');
  console.log(`   Total rules: ${bundle.metadata.totalRules}`);
  console.log(`   Version: ${bundle.metadata.version}`);
  console.log(`   Checksum: ${checksum}`);
  console.log('\n⚠️  SECURITY REMINDER:');
  console.log('   - all-rules.json, metadata.json, and .checksum are GITIGNORED');
  console.log('   - Never commit generated rule files to version control');
  console.log('   - Rules are regenerated at deploy time\n');
}

function generateTypeScriptBundle(bundle: RuleBundle): string {
  return `/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUNDLED AGRICULTURAL RULES - AUTO-GENERATED
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * DO NOT EDIT THIS FILE DIRECTLY!
 * Generated by: scripts/bundle-rules.ts
 * Generated at: ${bundle.metadata.generatedAt}
 * Total rules: ${bundle.metadata.totalRules}
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface BundledRule {
  rule_id: string;
  category: string;
  crop_code: string;
  stage_applicable: string[];
  conditionCode: string;
  cause: string;
  priority: number;
  scientific_source: string;
  scientific_basis: string;
  icar_package?: string;
  cause_confidence?: number;
  economic_tier?: string;
  estimated_cost_inr?: number;
  metadata?: {
    version?: string;
    author?: string;
    knowledge_layer?: string;
  };
  variety_filter?: {
    include?: string[];
    exclude?: string[];
  };
}

export interface BundleMetadata {
  totalRules: number;
  generatedAt: string;
  version: string;
  rulesByCategory: Record<string, number>;
  rulesByCropGroup: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUNDLED RULES DATA
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_GROUP_RULES: Record<string, BundledRule[]> = ${JSON.stringify(bundle.cropGroupRules, null, 2)};

export const SAFETY_RULES: Record<string, BundledRule[]> = ${JSON.stringify(bundle.safetyRules, null, 2)};

export const ADVANCED_RULES: BundledRule[] = ${JSON.stringify(bundle.advancedRules, null, 2)};

export const INTELLIGENCE_RULES: BundledRule[] = ${JSON.stringify(bundle.intelligenceRules, null, 2)};

export const BUNDLE_METADATA: BundleMetadata = ${JSON.stringify(bundle.metadata, null, 2)};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getAllCropGroupRules(): BundledRule[] {
  return Object.values(CROP_GROUP_RULES).flat();
}

export function getAllSafetyRules(): BundledRule[] {
  return Object.values(SAFETY_RULES).flat();
}

export function getAllRules(): BundledRule[] {
  return [
    ...getAllCropGroupRules(),
    ...getAllSafetyRules(),
    ...ADVANCED_RULES,
    ...INTELLIGENCE_RULES,
  ];
}

export function getRuleCount(): number {
  return BUNDLE_METADATA.totalRules;
}
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    const bundle = await generateBundle();
    writeBundle(bundle);
  } catch (error) {
    console.error('❌ Error bundling rules:', error);
    process.exit(1);
  }
}

main();
