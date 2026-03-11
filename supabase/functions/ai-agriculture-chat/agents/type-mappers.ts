/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TYPE MAPPERS - Unified type conversions between agent and decision graph systems
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Handles all type mismatches between:
 * - Agent system (string priorities)
 * - Decision graph system (numeric priorities)
 * - NLU output entities
 * - Rule evaluation context
 */

import type { RulePriority, CropStageCode, SeverityLevel } from './rule-module-types.ts';
import { normalizeCropCode as unifiedNormalizeCropCode, getFullCropName } from '../utils/crop-code-normalizer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PRIORITY MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert numeric priority (from decision-graph) to agent string priority
 */
export function mapNumericPriorityToAgent(numericPriority: number): RulePriority {
  if (numericPriority >= 10) return 'P0_EMERGENCY';
  if (numericPriority >= 9) return 'P1_REGULATORY';
  if (numericPriority >= 8) return 'P2_WEATHER_SAFETY';
  if (numericPriority >= 7) return 'P3_CROP_STAGE';
  if (numericPriority >= 6) return 'P4_ECONOMIC';
  if (numericPriority >= 5) return 'P5_IPM';
  return 'P6_OPTIMIZATION';
}

/**
 * Convert agent string priority to numeric (for sorting)
 */
export function mapAgentPriorityToNumeric(agentPriority: RulePriority): number {
  const priorityMap: Record<RulePriority, number> = {
    'P0_EMERGENCY': 10,
    'P1_REGULATORY': 9,
    'P2_WEATHER_SAFETY': 8,
    'P3_CROP_STAGE': 7,
    'P4_ECONOMIC': 6,
    'P5_IPM': 5,
    'P6_OPTIMIZATION': 4
  };
  return priorityMap[agentPriority] || 5;
}

/**
 * Normalize any priority value to string format
 */
export function normalizePriority(priority: string | number | undefined): RulePriority {
  if (typeof priority === 'number') {
    return mapNumericPriorityToAgent(priority);
  }
  if (typeof priority === 'string') {
    // Already a string priority
    if (priority.startsWith('P')) {
      return priority as RulePriority;
    }
    // Try parsing as number
    const num = parseInt(priority, 10);
    if (!isNaN(num)) {
      return mapNumericPriorityToAgent(num);
    }
  }
  return 'P6_OPTIMIZATION'; // Default
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP STAGE MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize crop stage strings to canonical codes
 */
export function normalizeCropStage(stage: string | undefined): CropStageCode | undefined {
  if (!stage) return undefined;
  
  const stageUpper = stage.toUpperCase().trim();
  
  // Direct matches
  const stageMap: Record<string, CropStageCode> = {
    'GERMINATION': 'GERMINATION',
    'SEEDLING': 'SEEDLING',
    'VEGETATIVE': 'VEGETATIVE',
    'FLOWERING': 'FLOWERING',
    'REPRODUCTIVE': 'REPRODUCTIVE',
    'MATURITY': 'MATURITY',
    'HARVEST': 'HARVEST',
    // Common aliases
    'GROWTH': 'VEGETATIVE',
    'GROWING': 'VEGETATIVE',
    'BOLL_FORMATION': 'REPRODUCTIVE',
    'FRUITING': 'REPRODUCTIVE',
    'TILLERING': 'VEGETATIVE',
    'GRAND_GROWTH': 'VEGETATIVE',
    'RIPENING': 'MATURITY',
    'MATURING': 'MATURITY',
    // Hindi/Marathi aliases
    'वाढ': 'VEGETATIVE',
    'फुलोरा': 'FLOWERING',
    'पक्व': 'MATURITY'
  };
  
  return stageMap[stageUpper] || 'VEGETATIVE';
}

// ═══════════════════════════════════════════════════════════════════════════
// SEVERITY MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize severity strings or percentages to canonical levels
 */
export function normalizeSeverity(
  severity: string | number | undefined,
  infestationPercent?: number
): SeverityLevel {
  // If we have infestation percent, use it directly
  if (infestationPercent !== undefined) {
    if (infestationPercent < 10) return 'LOW';
    if (infestationPercent < 25) return 'MODERATE';
    if (infestationPercent < 50) return 'HIGH';
    return 'CRITICAL';
  }
  
  if (typeof severity === 'number') {
    if (severity < 10) return 'LOW';
    if (severity < 25) return 'MODERATE';
    if (severity < 50) return 'HIGH';
    return 'CRITICAL';
  }
  
  if (typeof severity === 'string') {
    const severityUpper = severity.toUpperCase().trim();
    
    const severityMap: Record<string, SeverityLevel> = {
      'LOW': 'LOW',
      'MILD': 'LOW',
      'MINOR': 'LOW',
      'MODERATE': 'MODERATE',
      'MEDIUM': 'MODERATE',
      'HIGH': 'HIGH',
      'SEVERE': 'HIGH',
      'CRITICAL': 'CRITICAL',
      'EXTREME': 'CRITICAL',
      'EMERGENCY': 'CRITICAL',
      // Hindi/Marathi
      'कम': 'LOW',
      'मध्यम': 'MODERATE',
      'जास्त': 'HIGH',
      'गंभीर': 'CRITICAL'
    };
    
    return severityMap[severityUpper] || 'MODERATE';
  }
  
  return 'MODERATE'; // Default
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP CODE MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize crop names to canonical codes
 */
export function normalizeCropCode(cropName: string | undefined): string {
  if (!cropName) return 'UNKNOWN';
  // Delegate to single source of truth: crop-code-normalizer.ts
  const shortCode = unifiedNormalizeCropCode(cropName);
  if (shortCode === 'ALL') return cropName.toUpperCase().trim();
  return getFullCropName(shortCode);
}

// ═══════════════════════════════════════════════════════════════════════════
// DB-COMPATIBLE CROP CODE MAPPER
// UNIFIED: Now delegates to crop-code-normalizer.ts (single source of truth)
// ═══════════════════════════════════════════════════════════════════════════

import {
  normalizeCropCode as _unifiedNormalizeCropCode,
  getFullCropName as _unifiedGetFullCropName,
  getCropCodeVariants as _unifiedGetCropCodeVariants
} from '../utils/crop-code-normalizer.ts';

/**
 * Maps full crop names to DB-compatible short codes used in decision_rules table
 * @deprecated Use normalizeCropCode from utils/crop-code-normalizer.ts directly
 */
export function normalizeCropCodeForDB(cropCode: string | undefined): string {
  return _unifiedNormalizeCropCode(cropCode);
}

/**
 * Get both DB and full crop codes for flexible matching
 * @deprecated Use getCropCodeVariants from utils/crop-code-normalizer.ts directly
 */
export function getCropCodeVariants(cropCode: string | undefined): string[] {
  return _unifiedGetCropCodeVariants(cropCode);
}

// ═══════════════════════════════════════════════════════════════════════════
// PEST CODE MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize pest names to canonical codes
 */
export function normalizePestCode(pestName: string | undefined): string {
  if (!pestName) return 'UNKNOWN';
  
  // CRITICAL FIX: First normalize format - convert all to uppercase with underscores
  let pestNormalized = pestName.toUpperCase().trim().replace(/[\s-]+/g, '_');
  
  // CRITICAL FIX: Handle common NO-underscore variants to WITH-underscore
  const noUnderscoreMap: Record<string, string> = {
    'SHOOTBORER': 'SHOOT_BORER',
    'STEMBORER': 'STEM_BORER',
    'TOPBORER': 'TOP_BORER',
    'ROOTBORER': 'ROOT_BORER',
    'FRUITBORER': 'FRUIT_BORER',
    'INTERNODEBORER': 'INTERNODE_BORER',
    'PINKBOLLWORM': 'PINK_BOLLWORM',
    'FALLARMYWORM': 'FALL_ARMYWORM',
    'REDSPIDERMITE': 'RED_SPIDER_MITE',
    'GIRDLEBEETLE': 'GIRDLE_BEETLE',
    'STEMFLY': 'STEM_FLY',
    'DEADHEART': 'SHOOT_BORER',  // Symptom → pest mapping
  };
  
  if (noUnderscoreMap[pestNormalized]) {
    return noUnderscoreMap[pestNormalized];
  }
  
  const pestLower = pestName.toLowerCase().trim();
  
  const pestMap: Record<string, string> = {
    // English
    'whitefly': 'WHITEFLY',
    'white fly': 'WHITEFLY',
    'bemisia': 'WHITEFLY',
    'aphid': 'APHID',
    'aphids': 'APHID',
    'jassid': 'JASSID',
    'leafhopper': 'JASSID',
    'thrips': 'THRIPS',
    'thrip': 'THRIPS',
    'bollworm': 'BOLLWORM',
    'boll worm': 'BOLLWORM',
    'helicoverpa': 'BOLLWORM',
    'american bollworm': 'BOLLWORM',
    'pink bollworm': 'PINK_BOLLWORM',
    'pbw': 'PINK_BOLLWORM',
    'pectinophora': 'PINK_BOLLWORM',
    'mealybug': 'MEALYBUG',
    'mealy bug': 'MEALYBUG',
    'red spider mite': 'RED_SPIDER_MITE',
    'mite': 'RED_SPIDER_MITE',
    'spider mite': 'RED_SPIDER_MITE',
    'fruit borer': 'FRUIT_BORER',
    'stem borer': 'STEM_BORER',
    'shoot borer': 'SHOOT_BORER',
    'top borer': 'TOP_BORER',
    'internode borer': 'INTERNODE_BORER',
    'girdle beetle': 'GIRDLE_BEETLE',
    'stem fly': 'STEM_FLY',
    'brown planthopper': 'BPH',
    'bph': 'BPH',
    'planthopper': 'BPH',
    'armyworm': 'ARMYWORM',
    'fall armyworm': 'FALL_ARMYWORM',
    'locust': 'LOCUST',
    // Dead heart symptom → pest mapping
    'dead heart': 'SHOOT_BORER',
    'deadheart': 'SHOOT_BORER',
    // Marathi
    'पांढरी माशी': 'WHITEFLY',
    'मावा': 'APHID',
    'तुडतुडे': 'JASSID',
    'फुलकिडे': 'THRIPS',
    'बोंडअळी': 'BOLLWORM',
    'गुलाबी बोंडअळी': 'PINK_BOLLWORM',
    'ढेकूण': 'MEALYBUG',
    'कोळी': 'RED_SPIDER_MITE',
    'खोड किडा': 'STEM_BORER',
    'शेंडा पोखरणारी अळी': 'SHOOT_BORER',
    'मधली सुरळी': 'SHOOT_BORER',
    'सुरळी वाळणे': 'SHOOT_BORER',
    'गाभा सुकणे': 'SHOOT_BORER',
    // Hindi
    'सफ़ेद मक्खी': 'WHITEFLY',
    'मोयला': 'APHID',
    'हरा तेला': 'JASSID',
    'थ्रिप्स': 'THRIPS',
    'डेंडू': 'BOLLWORM',
    'गुलाबी इल्ली': 'PINK_BOLLWORM',
    'चिपचिपा कीट': 'MEALYBUG',
    'मकड़ी': 'RED_SPIDER_MITE',
    'तना छेदक': 'STEM_BORER'
  };
  
  // Check for direct match
  if (pestMap[pestLower]) {
    return pestMap[pestLower];
  }
  
  // Check for partial matches
  for (const [key, value] of Object.entries(pestMap)) {
    if (pestLower.includes(key) || key.includes(pestLower)) {
      return value;
    }
  }
  
  // Return normalized uppercase with underscores
  return pestNormalized;
}

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE CODE MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize disease names to canonical codes
 */
export function normalizeDiseaseCode(diseaseName: string | undefined): string {
  if (!diseaseName) return 'UNKNOWN';
  
  const diseaseLower = diseaseName.toLowerCase().trim();
  
  const diseaseMap: Record<string, string> = {
    // English
    'wilt': 'WILT',
    'fusarium wilt': 'FUSARIUM_WILT',
    'bacterial wilt': 'BACTERIAL_WILT',
    'blight': 'BLIGHT',
    'early blight': 'EARLY_BLIGHT',
    'late blight': 'LATE_BLIGHT',
    'bacterial blight': 'BACTERIAL_BLIGHT',
    'alternaria': 'EARLY_BLIGHT',
    'powdery mildew': 'POWDERY_MILDEW',
    'downy mildew': 'DOWNY_MILDEW',
    'rust': 'RUST',
    'leaf rust': 'RUST',
    'stem rust': 'RUST',
    'leaf curl': 'LEAF_CURL',
    'clcv': 'LEAF_CURL',
    'root rot': 'ROOT_ROT',
    'collar rot': 'ROOT_ROT',
    'anthracnose': 'ANTHRACNOSE',
    'blast': 'BLAST',
    'rice blast': 'BLAST',
    'red rot': 'RED_ROT',
    'smut': 'SMUT',
    'whip smut': 'SMUT',
    'mosaic': 'MOSAIC',
    'yellow vein mosaic': 'MOSAIC',
    // Marathi
    'मर रोग': 'WILT',
    'करपा': 'BLIGHT',
    'भुरी': 'POWDERY_MILDEW',
    'तांबेरा': 'RUST',
    'पाने मुडणे': 'LEAF_CURL',
    'मूळ कुज': 'ROOT_ROT',
    'लाल कुज': 'RED_ROT',
    // Hindi
    'उकठा': 'WILT',
    'झुलसा': 'BLIGHT',
    'छाछ्या': 'POWDERY_MILDEW',
    'रतुआ': 'RUST',
    'पत्ता मोड़': 'LEAF_CURL',
    'जड़ सड़न': 'ROOT_ROT',
    'लाल सड़न': 'RED_ROT'
  };
  
  if (diseaseMap[diseaseLower]) {
    return diseaseMap[diseaseLower];
  }
  
  for (const [key, value] of Object.entries(diseaseMap)) {
    if (diseaseLower.includes(key) || key.includes(diseaseLower)) {
      return value;
    }
  }
  
  return diseaseName.toUpperCase().replace(/\s+/g, '_');
}

// ═══════════════════════════════════════════════════════════════════════════
// TRACE ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique trace ID for request tracking
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `trace_${timestamp}_${random}`;
}

export const TYPE_MAPPERS_VERSION = '1.0.0';
