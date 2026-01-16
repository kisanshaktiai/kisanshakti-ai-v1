/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHOTO OBSERVATION MAPPER - Vision AI to ObservationKey Normalization
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Convert Vision API output (PhotoAnalysisOutput) to canonical ObservationKey
 * codes using 100% deterministic pattern matching. This ensures photo data
 * flows through the rule engine exactly like farmer text selections.
 * 
 * INTEGRATION:
 * - Called after photo-analyzer.ts extracts raw observations
 * - Output injected into allObservationsForPreAuth, inductionResult.symptoms
 * - Rule engine evaluates photo observations identically to text observations
 * 
 * @version 1.0.0
 * @phase Photo-to-Rule-Engine Pipeline
 */

import { ObservationKey } from '../decision/observation-ontology.ts';
import type { PhotoAnalysisOutput, PhotoObservation, DetectedIssue } from './photo-analyzer.ts';

export const PHOTO_OBSERVATION_MAPPER_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface MappedPhotoObservations {
  observation_codes: ObservationKey[];    // All canonical observation codes
  severity_code: ObservationKey;          // Severity from photo analysis
  affected_part_code: ObservationKey;     // Primary affected plant part
  distribution_code: ObservationKey | null; // Distribution if detectable
  issue_codes: ObservationKey[];          // From detected_issues
  confidence: number;                     // Average confidence
  source: 'PHOTO_VISION_AI';             // Always this value
  mapping_timestamp: string;
  patterns_matched: string[];             // Audit trail
}

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO OBSERVATION KEY → CANONICAL OBSERVATION KEY MAPPING
// Maps Vision AI observation.key to ObservationKey enum values
// ═══════════════════════════════════════════════════════════════════════════

const PHOTO_KEY_TO_OBSERVATION_KEY: Record<string, ObservationKey> = {
  // Leaf symptoms
  'LEAF_YELLOWING': ObservationKey.LEAF_YELLOWING,
  'YELLOW_LEAVES': ObservationKey.LEAF_YELLOWING,
  'YELLOWING': ObservationKey.LEAF_YELLOWING,
  'LEAF_BROWNING': ObservationKey.LEAF_BROWN_TIPS,
  'BROWN_LEAVES': ObservationKey.LEAF_BROWN_TIPS,
  'LEAF_SPOTS': ObservationKey.LEAF_SPOTS_PRESENT,
  'SPOTS_ON_LEAVES': ObservationKey.LEAF_SPOTS_PRESENT,
  'LESIONS': ObservationKey.LEAF_SPOTS_PRESENT,
  'LEAF_CURLING': ObservationKey.LEAF_CURLING,
  'CURLED_LEAVES': ObservationKey.LEAF_CURLING,
  'LEAF_WILTING': ObservationKey.LEAF_WILTING,
  'WILTING': ObservationKey.LEAF_WILTING,
  'WILTED_LEAVES': ObservationKey.LEAF_WILTING,
  'DROOPING': ObservationKey.LEAF_WILTING,
  'LEAF_DRYING': ObservationKey.LEAF_DRYING,
  'DRY_LEAVES': ObservationKey.LEAF_DRYING,
  'LEAF_ROLLING': ObservationKey.LEAF_ROLLING,
  'ROLLED_LEAVES': ObservationKey.LEAF_ROLLING,
  'LEAF_HOLES': ObservationKey.LEAF_CHEWING,
  'HOLES_IN_LEAVES': ObservationKey.LEAF_CHEWING,
  'CHEWED_LEAVES': ObservationKey.LEAF_CHEWING,
  'LEAF_REDDENING': ObservationKey.LEAF_REDDENING,
  'RED_LEAVES': ObservationKey.LEAF_REDDENING,
  'PURPLE_LEAVES': ObservationKey.LEAF_REDDENING,
  'LEAF_PALE': ObservationKey.LEAF_PALE_GREEN,
  'PALE_GREEN': ObservationKey.LEAF_PALE_GREEN,
  'CHLOROSIS': ObservationKey.LEAF_YELLOWING,
  'NECROSIS': ObservationKey.LEAF_DRYING,
  'LEAF_SCORCHING': ObservationKey.LEAF_SCORCHING,
  'BURNT_LEAVES': ObservationKey.LEAF_SCORCHING,
  'WHITE_PATCHES': ObservationKey.LEAF_WHITE_PATCHES,
  'POWDERY_COATING': ObservationKey.WHITE_POWDERY_GROWTH,
  'BLACK_SPOTS': ObservationKey.LEAF_BLACK_PATCHES,
  'MOSAIC_PATTERN': ObservationKey.LEAF_MOSAIC_PATTERN,
  'MOTTLING': ObservationKey.LEAF_MOSAIC_PATTERN,
  
  // Stem symptoms
  'DEAD_HEART': ObservationKey.DEAD_HEART_PRESENT,
  'DEAD_HEART_PRESENT': ObservationKey.DEAD_HEART_PRESENT,
  'CENTRAL_SHOOT_DRIED': ObservationKey.DEAD_HEART_PRESENT,
  'STEM_BORING': ObservationKey.STEM_BORING_MARKS,
  'BORER_HOLES': ObservationKey.STEM_BORING_MARKS,
  'STEM_BORER_DAMAGE': ObservationKey.STEM_BORING_MARKS,
  'STEM_ROT': ObservationKey.STEM_ROT_PRESENT,
  'ROTTING_STEM': ObservationKey.STEM_ROT_PRESENT,
  'STEM_SOFTENING': ObservationKey.STEM_SOFTENING,
  'SOFT_STEM': ObservationKey.STEM_SOFTENING,
  'STEM_SPLITTING': ObservationKey.STEM_SPLITTING,
  'SPLIT_STEM': ObservationKey.STEM_SPLITTING,
  
  // Plant-level symptoms
  'PLANT_DEATH': ObservationKey.SEEDLING_DIED,
  'DEAD_PLANTS': ObservationKey.SEEDLING_DIED,
  'DYING_PLANTS': ObservationKey.SEEDLING_DIED,
  'SEEDLING_DEATH': ObservationKey.SEEDLING_DIED,
  'STUNTED_GROWTH': ObservationKey.STUNTED_PLANTS,
  'POOR_GROWTH': ObservationKey.STUNTED_PLANTS,
  'STUNTED_PLANTS': ObservationKey.STUNTED_PLANTS,
  'LODGING': ObservationKey.PLANTS_LODGING,
  'FALLEN_PLANTS': ObservationKey.PLANTS_LODGING,
  'PLANT_EASILY_PULLED': ObservationKey.SETT_EASILY_PULLED_OUT,
  
  // Root symptoms
  'ROOT_ROT': ObservationKey.ROOTS_ROTTED,
  'ROTTING_ROOTS': ObservationKey.ROOTS_ROTTED,
  'BLACK_ROOTS': ObservationKey.ROOT_BLACKENING,
  'ROOT_BLACKENING': ObservationKey.ROOT_BLACKENING,
  'SOFT_ROOTS': ObservationKey.ROOT_SOFT,
  
  // Pest presence
  'INSECTS_VISIBLE': ObservationKey.INSECTS_VISIBLE,
  'PEST_VISIBLE': ObservationKey.INSECTS_VISIBLE,
  'BUGS_VISIBLE': ObservationKey.INSECTS_VISIBLE,
  'LARVAE_PRESENT': ObservationKey.LARVAE_PRESENT,
  'CATERPILLAR': ObservationKey.LARVAE_PRESENT,
  'CATERPILLARS': ObservationKey.LARVAE_PRESENT,
  'WORMS': ObservationKey.LARVAE_PRESENT,
  'GRUBS': ObservationKey.LARVAE_PRESENT,
  'EGGS_VISIBLE': ObservationKey.EGGS_PRESENT,
  'EGG_MASS': ObservationKey.EGGS_PRESENT,
  'HONEYDEW': ObservationKey.HONEYDEW_PRESENT,
  'STICKY_SUBSTANCE': ObservationKey.HONEYDEW_PRESENT,
  'WEBBING': ObservationKey.SILK_WEBBING_VISIBLE,
  'SILK_WEB': ObservationKey.SILK_WEBBING_VISIBLE,
  'FRASS': ObservationKey.FRASS_VISIBLE,
  'INSECT_DROPPINGS': ObservationKey.FRASS_VISIBLE,
  'ANTS': ObservationKey.ANTS_PRESENT,
  'WHITEFLY': ObservationKey.WHITE_INSECTS,
  'WHITE_FLIES': ObservationKey.WHITE_INSECTS,
  'APHIDS': ObservationKey.GREEN_INSECTS,
  'MEALYBUG': ObservationKey.WHITE_INSECTS,
  'TERMITE_DAMAGE': ObservationKey.TERMITE_MUD_TUBES,
  'MUD_TUBES': ObservationKey.TERMITE_MUD_TUBES,
  
  // Disease signs
  'FUNGAL_GROWTH': ObservationKey.FUNGAL_GROWTH_VISIBLE,
  'FUNGUS': ObservationKey.FUNGAL_GROWTH_VISIBLE,
  'POWDERY_MILDEW': ObservationKey.WHITE_POWDERY_GROWTH,
  'WHITE_POWDERY_GROWTH': ObservationKey.WHITE_POWDERY_GROWTH,
  'RUST': ObservationKey.RUST_PUSTULES,
  'RUST_SPOTS': ObservationKey.RUST_PUSTULES,
  'PUSTULES': ObservationKey.RUST_PUSTULES,
  'BACTERIAL_OOZE': ObservationKey.BACTERIAL_OOZE,
  'OOZE': ObservationKey.BACTERIAL_OOZE,
  'MOLD': ObservationKey.GREY_MOLD_PRESENT,
  'GREY_MOLD': ObservationKey.GREY_MOLD_PRESENT,
  'SOOTY_MOLD': ObservationKey.BLACK_SOOTY_MOLD,
  'BLACK_COATING': ObservationKey.BLACK_SOOTY_MOLD,
  'FOUL_SMELL': ObservationKey.FOUL_SMELL_PRESENT,
  'BAD_ODOR': ObservationKey.FOUL_SMELL_PRESENT,
  
  // Fruit/flower symptoms
  'FLOWER_DROP': ObservationKey.FLOWER_DROP,
  'FLOWERS_FALLING': ObservationKey.FLOWER_DROP,
  'FRUIT_DROP': ObservationKey.FRUIT_DROP,
  'FRUITS_FALLING': ObservationKey.FRUIT_DROP,
  'FRUIT_ROT': ObservationKey.FRUIT_ROT,
  'ROTTING_FRUITS': ObservationKey.FRUIT_ROT,
  'POOR_FLOWERING': ObservationKey.POOR_FLOWERING,
  'NO_FLOWERS': ObservationKey.POOR_FLOWERING,
  
  // Germination issues
  'GERMINATION_FAILURE': ObservationKey.SEED_NOT_GERMINATED,
  'NO_GERMINATION': ObservationKey.SEED_NOT_GERMINATED,
  'NOT_GERMINATED': ObservationKey.SEED_NOT_GERMINATED,
  'POOR_GERMINATION': ObservationKey.POOR_GERMINATION_PERCENT,
  'LOW_GERMINATION': ObservationKey.POOR_GERMINATION_PERCENT,
  'GAPS_IN_FIELD': ObservationKey.GAPS_IN_FIELD,
  'MISSING_PLANTS': ObservationKey.GAPS_IN_FIELD,
  'PATCHY_EMERGENCE': ObservationKey.PATCHY_EMERGENCE,
  'UNEVEN_EMERGENCE': ObservationKey.PATCHY_EMERGENCE,
  
  // Field conditions
  'WATERLOGGED': ObservationKey.FIELD_WATERLOGGED,
  'WATER_LOGGING': ObservationKey.FIELD_WATERLOGGED,
  'STANDING_WATER': ObservationKey.FIELD_WATERLOGGED,
  'DRY_SOIL': ObservationKey.SOIL_TOO_DRY,
  'CRACKED_SOIL': ObservationKey.SOIL_TOO_DRY,
};

// ═══════════════════════════════════════════════════════════════════════════
// DETECTED ISSUE TYPE → OBSERVATION KEY MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const ISSUE_TYPE_TO_OBSERVATION_KEY: Record<string, ObservationKey[]> = {
  'PEST': [ObservationKey.INSECTS_VISIBLE],
  'DISEASE': [ObservationKey.FUNGAL_GROWTH_VISIBLE],
  'NUTRIENT_DEFICIENCY': [ObservationKey.LEAF_YELLOWING, ObservationKey.STUNTED_PLANTS],
  'WATER_STRESS': [ObservationKey.LEAF_WILTING, ObservationKey.LEAF_DRYING],
};

// ═══════════════════════════════════════════════════════════════════════════
// SEVERITY MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const SEVERITY_TO_OBSERVATION_KEY: Record<string, ObservationKey> = {
  'LOW': ObservationKey.SEVERITY_LOW,
  'MEDIUM': ObservationKey.SEVERITY_MEDIUM,
  'HIGH': ObservationKey.SEVERITY_HIGH,
  'CRITICAL': ObservationKey.SEVERITY_CRITICAL,
};

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY → AFFECTED PART MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_TO_AFFECTED_PART: Record<string, ObservationKey> = {
  'SYMPTOM': ObservationKey.AFFECTED_PART_LEAF,
  'PEST': ObservationKey.AFFECTED_PART_WHOLE,
  'DISEASE': ObservationKey.AFFECTED_PART_LEAF,
  'NUTRIENT': ObservationKey.AFFECTED_PART_LEAF,
  'DAMAGE': ObservationKey.AFFECTED_PART_WHOLE,
  'BENEFICIAL': ObservationKey.AFFECTED_PART_UNKNOWN,
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN MAPPING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map PhotoAnalysisOutput to canonical ObservationKey codes
 * 100% DETERMINISTIC - same input always produces same output
 * 
 * @param photoResult - PhotoAnalysisOutput from Vision AI
 * @returns MappedPhotoObservations - Canonical codes for rule engine
 */
export function mapPhotoToObservationKeys(
  photoResult: PhotoAnalysisOutput
): MappedPhotoObservations {
  console.log(`\n📸 [PhotoObservationMapper v${PHOTO_OBSERVATION_MAPPER_VERSION}] Mapping photo to ObservationKeys...`);
  
  const startTime = Date.now();
  const observationCodes: ObservationKey[] = [];
  const issuesCodes: ObservationKey[] = [];
  const patternsMatched: string[] = [];
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Map photo observations to ObservationKeys
  // ═══════════════════════════════════════════════════════════════════════════
  if (photoResult.observations && photoResult.observations.length > 0) {
    for (const obs of photoResult.observations) {
      const normalizedKey = normalizePhotoKey(obs.key);
      
      // Direct mapping lookup
      if (PHOTO_KEY_TO_OBSERVATION_KEY[normalizedKey]) {
        const code = PHOTO_KEY_TO_OBSERVATION_KEY[normalizedKey];
        if (!observationCodes.includes(code)) {
          observationCodes.push(code);
          patternsMatched.push(`obs:"${obs.key}"→${code}`);
        }
      } else {
        // Fallback: pattern match in description
        const descriptionMatch = matchDescriptionToCode(obs.description);
        if (descriptionMatch && !observationCodes.includes(descriptionMatch)) {
          observationCodes.push(descriptionMatch);
          patternsMatched.push(`desc:"${obs.description.substring(0, 30)}"→${descriptionMatch}`);
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Map detected issues to ObservationKeys
  // ═══════════════════════════════════════════════════════════════════════════
  if (photoResult.detected_issues && photoResult.detected_issues.length > 0) {
    for (const issue of photoResult.detected_issues) {
      // Map issue type to base observation
      const typeMapping = ISSUE_TYPE_TO_OBSERVATION_KEY[issue.type];
      if (typeMapping) {
        for (const code of typeMapping) {
          if (!issuesCodes.includes(code)) {
            issuesCodes.push(code);
            patternsMatched.push(`issue_type:"${issue.type}"→${code}`);
          }
        }
      }
      
      // Map visual indicators to observation codes
      for (const indicator of issue.visual_indicators) {
        const indicatorCode = matchDescriptionToCode(indicator);
        if (indicatorCode && !observationCodes.includes(indicatorCode)) {
          observationCodes.push(indicatorCode);
          patternsMatched.push(`indicator:"${indicator.substring(0, 20)}"→${indicatorCode}`);
        }
      }
      
      // Map issue name to observation code (e.g., "Stem Borer" → STEM_BORING_MARKS)
      const issueNameCode = mapIssueNameToCode(issue.name);
      if (issueNameCode && !observationCodes.includes(issueNameCode)) {
        observationCodes.push(issueNameCode);
        patternsMatched.push(`issue_name:"${issue.name}"→${issueNameCode}`);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Map severity
  // ═══════════════════════════════════════════════════════════════════════════
  const severityCode = SEVERITY_TO_OBSERVATION_KEY[photoResult.severity_assessment.overall_severity] 
    || ObservationKey.SEVERITY_MEDIUM;
  
  if (!observationCodes.includes(severityCode)) {
    observationCodes.push(severityCode);
    patternsMatched.push(`severity:"${photoResult.severity_assessment.overall_severity}"→${severityCode}`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Determine affected part from observations
  // ═══════════════════════════════════════════════════════════════════════════
  let affectedPartCode = ObservationKey.AFFECTED_PART_UNKNOWN;
  
  if (photoResult.observations.length > 0) {
    const primaryCategory = photoResult.observations[0].category;
    affectedPartCode = CATEGORY_TO_AFFECTED_PART[primaryCategory] || ObservationKey.AFFECTED_PART_UNKNOWN;
    
    // Check for specific part indicators in observation keys
    for (const obs of photoResult.observations) {
      const keyLower = obs.key.toLowerCase();
      if (keyLower.includes('leaf') || keyLower.includes('foliage')) {
        affectedPartCode = ObservationKey.AFFECTED_PART_LEAF;
        break;
      } else if (keyLower.includes('stem') || keyLower.includes('stalk') || keyLower.includes('shoot')) {
        affectedPartCode = ObservationKey.AFFECTED_PART_STEM;
        break;
      } else if (keyLower.includes('root')) {
        affectedPartCode = ObservationKey.AFFECTED_PART_ROOT;
        break;
      } else if (keyLower.includes('fruit') || keyLower.includes('boll') || keyLower.includes('grain')) {
        affectedPartCode = ObservationKey.AFFECTED_PART_FRUIT;
        break;
      } else if (keyLower.includes('flower')) {
        affectedPartCode = ObservationKey.AFFECTED_PART_FLOWER;
        break;
      } else if (keyLower.includes('plant') || keyLower.includes('whole') || keyLower.includes('entire')) {
        affectedPartCode = ObservationKey.AFFECTED_PART_WHOLE;
        break;
      }
    }
  }
  
  // Add affected part to observation codes
  if (!observationCodes.includes(affectedPartCode)) {
    observationCodes.push(affectedPartCode);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Determine distribution from severity assessment
  // ═══════════════════════════════════════════════════════════════════════════
  let distributionCode: ObservationKey | null = null;
  
  const affectedPercent = photoResult.severity_assessment.affected_area_percent;
  if (affectedPercent >= 80) {
    distributionCode = ObservationKey.ENTIRE_FIELD_AFFECTED;
  } else if (affectedPercent >= 40) {
    distributionCode = ObservationKey.PATCHY_DAMAGE;
  } else if (affectedPercent > 0) {
    distributionCode = ObservationKey.LOCALIZED_SPOTS;
  }
  
  if (distributionCode && !observationCodes.includes(distributionCode)) {
    observationCodes.push(distributionCode);
    patternsMatched.push(`distribution:${affectedPercent}%→${distributionCode}`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: Merge issue codes into observation codes
  // ═══════════════════════════════════════════════════════════════════════════
  for (const code of issuesCodes) {
    if (!observationCodes.includes(code)) {
      observationCodes.push(code);
    }
  }
  
  const processingTime = Date.now() - startTime;
  
  console.log(`   ✅ Mapped ${observationCodes.length} ObservationKeys from photo`);
  console.log(`   Keys: ${observationCodes.slice(0, 5).join(', ')}${observationCodes.length > 5 ? '...' : ''}`);
  console.log(`   Processing time: ${processingTime}ms`);
  
  return {
    observation_codes: observationCodes,
    severity_code: severityCode,
    affected_part_code: affectedPartCode,
    distribution_code: distributionCode,
    issue_codes: issuesCodes,
    confidence: photoResult.confidence,
    source: 'PHOTO_VISION_AI',
    mapping_timestamp: new Date().toISOString(),
    patterns_matched: patternsMatched,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize photo observation key to standard format
 */
function normalizePhotoKey(key: string): string {
  return key
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}

/**
 * Match description text to ObservationKey using pattern matching
 */
function matchDescriptionToCode(description: string): ObservationKey | null {
  const descLower = description.toLowerCase();
  
  // Pattern matching - check for common symptom patterns
  const patterns: Array<{ match: string[], code: ObservationKey }> = [
    { match: ['yellow', 'yellowing', 'chlorosis'], code: ObservationKey.LEAF_YELLOWING },
    { match: ['brown', 'browning', 'necrosis'], code: ObservationKey.LEAF_BROWN_TIPS },
    { match: ['wilting', 'wilted', 'drooping'], code: ObservationKey.LEAF_WILTING },
    { match: ['curl', 'curling', 'curled'], code: ObservationKey.LEAF_CURLING },
    { match: ['spot', 'spots', 'lesion', 'lesions'], code: ObservationKey.LEAF_SPOTS_PRESENT },
    { match: ['hole', 'holes', 'chewed', 'eating'], code: ObservationKey.LEAF_CHEWING },
    { match: ['dead heart', 'central shoot'], code: ObservationKey.DEAD_HEART_PRESENT },
    { match: ['borer', 'boring', 'tunnel'], code: ObservationKey.STEM_BORING_MARKS },
    { match: ['stunted', 'poor growth', 'slow growth'], code: ObservationKey.STUNTED_PLANTS },
    { match: ['dying', 'dead plant', 'plant death'], code: ObservationKey.SEEDLING_DIED },
    { match: ['insect', 'bug', 'pest'], code: ObservationKey.INSECTS_VISIBLE },
    { match: ['larva', 'caterpillar', 'worm', 'grub'], code: ObservationKey.LARVAE_PRESENT },
    { match: ['fungus', 'fungal', 'mold', 'mould'], code: ObservationKey.FUNGAL_GROWTH_VISIBLE },
    { match: ['rust', 'pustule'], code: ObservationKey.RUST_PUSTULES },
    { match: ['powder', 'powdery', 'white coating'], code: ObservationKey.WHITE_POWDERY_GROWTH },
    { match: ['rot', 'rotting', 'decay'], code: ObservationKey.STEM_ROT_PRESENT },
    { match: ['dry', 'drying', 'dried'], code: ObservationKey.LEAF_DRYING },
  ];
  
  for (const { match, code } of patterns) {
    for (const pattern of match) {
      if (descLower.includes(pattern)) {
        return code;
      }
    }
  }
  
  return null;
}

/**
 * Map detected issue name to ObservationKey
 */
function mapIssueNameToCode(issueName: string): ObservationKey | null {
  const nameLower = issueName.toLowerCase();
  
  const issueNamePatterns: Array<{ match: string[], code: ObservationKey }> = [
    // Borers
    { match: ['stem borer', 'shoot borer', 'internode borer', 'top borer'], code: ObservationKey.STEM_BORING_MARKS },
    { match: ['early shoot borer'], code: ObservationKey.DEAD_HEART_PRESENT },
    
    // Sucking pests
    { match: ['aphid', 'jassid', 'leafhopper'], code: ObservationKey.GREEN_INSECTS },
    { match: ['whitefly', 'white fly'], code: ObservationKey.WHITE_INSECTS },
    { match: ['mealybug', 'mealy bug'], code: ObservationKey.WHITE_INSECTS },
    { match: ['thrip'], code: ObservationKey.SMALL_INSECTS },
    
    // Diseases
    { match: ['rust'], code: ObservationKey.RUST_PUSTULES },
    { match: ['smut'], code: ObservationKey.FUNGAL_GROWTH_VISIBLE },
    { match: ['wilt'], code: ObservationKey.LEAF_WILTING },
    { match: ['blight', 'leaf spot'], code: ObservationKey.LEAF_SPOTS_PRESENT },
    { match: ['powdery mildew'], code: ObservationKey.WHITE_POWDERY_GROWTH },
    { match: ['downy mildew'], code: ObservationKey.FUNGAL_GROWTH_VISIBLE },
    { match: ['rot', 'red rot'], code: ObservationKey.STEM_ROT_PRESENT },
    
    // Nutrient deficiencies
    { match: ['nitrogen deficiency', 'n deficiency'], code: ObservationKey.LEAF_YELLOWING },
    { match: ['phosphorus deficiency', 'p deficiency'], code: ObservationKey.LEAF_REDDENING },
    { match: ['potassium deficiency', 'k deficiency'], code: ObservationKey.LEAF_BROWN_TIPS },
    { match: ['iron deficiency', 'fe deficiency'], code: ObservationKey.LEAF_PALE_GREEN },
    
    // Water stress
    { match: ['water stress', 'drought stress'], code: ObservationKey.LEAF_WILTING },
    { match: ['waterlogging', 'water logging'], code: ObservationKey.FIELD_WATERLOGGED },
  ];
  
  for (const { match, code } of issueNamePatterns) {
    for (const pattern of match) {
      if (nameLower.includes(pattern)) {
        return code;
      }
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: Check if photo analysis provides sufficient data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if photo analysis provides sufficient observation codes
 * to skip clarification and proceed directly to rule evaluation
 */
export function photoProvidesSufficientData(
  mappedCodes: MappedPhotoObservations
): boolean {
  // Sufficient if:
  // 1. At least 2 observation codes mapped
  // 2. Confidence > 0.6
  // 3. Has either symptom/damage code or pest/disease code
  
  const hasSufficientCodes = mappedCodes.observation_codes.length >= 2;
  const hasGoodConfidence = mappedCodes.confidence > 0.6;
  
  // Check for meaningful symptom codes (exclude generic ones)
  const genericCodes = [
    ObservationKey.SEVERITY_LOW,
    ObservationKey.SEVERITY_MEDIUM,
    ObservationKey.SEVERITY_HIGH,
    ObservationKey.SEVERITY_CRITICAL,
    ObservationKey.AFFECTED_PART_UNKNOWN,
  ];
  
  const meaningfulCodes = mappedCodes.observation_codes.filter(
    code => !genericCodes.includes(code)
  );
  
  const hasMeaningfulSymptoms = meaningfulCodes.length >= 1;
  
  return hasSufficientCodes && hasGoodConfidence && hasMeaningfulSymptoms;
}
