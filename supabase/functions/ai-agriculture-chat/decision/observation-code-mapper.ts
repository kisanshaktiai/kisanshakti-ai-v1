/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OBSERVATION CODE MAPPER (100% Deterministic)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Convert plain English semantic extractions to stable ObservationKey codes
 * using pure pattern matching. This is the ONLY layer that produces codes.
 * 
 * RULES:
 * - 100% deterministic: same input ALWAYS produces same output
 * - Uses simple .includes() pattern matching on English text
 * - Maps to ObservationKey enum values from observation-ontology.ts
 * - NO LLM calls, NO randomness, NO external dependencies
 * 
 * @version 1.0.0
 * @phase Universal NLU Refactoring
 */

import { ObservationKey } from './observation-ontology.ts';
import type { SemanticExtraction } from '../agents/semantic-extractor.ts';

export const OBSERVATION_CODE_MAPPER_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface MappedObservationCodes {
  observation_codes: ObservationKey[];         // All matched observation codes
  affected_part_code: ObservationKey;          // Primary affected part
  distribution_code: ObservationKey | null;    // Distribution pattern if detected
  severity_code: ObservationKey;               // Severity level
  mapping_method: 'DETERMINISTIC';             // Always this value
  mapping_confidence: number;                  // 1.0 for deterministic
  mapping_timestamp: string;
  patterns_matched: string[];                  // For audit trail
}

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL CHANGES → OBSERVATION CODES MAPPING
// ═══════════════════════════════════════════════════════════════════════════

interface PatternMapping {
  patterns: string[];
  code: ObservationKey;
}

const VISUAL_CHANGE_MAPPINGS: PatternMapping[] = [
  // Leaf color changes
  { patterns: ['yellow', 'yellowing', 'turning yellow', 'turned yellow'], code: ObservationKey.LEAF_YELLOWING },
  { patterns: ['brown', 'browning', 'turning brown'], code: ObservationKey.LEAF_BROWN_TIPS },
  { patterns: ['red', 'reddish', 'turning red', 'reddening'], code: ObservationKey.LEAF_REDDENING },
  { patterns: ['pale', 'pale green', 'light green'], code: ObservationKey.LEAF_PALE_GREEN },
  
  // Leaf texture/shape changes
  { patterns: ['curling', 'curled', 'curl'], code: ObservationKey.LEAF_CURLING },
  { patterns: ['wilting', 'wilted', 'wilt', 'drooping'], code: ObservationKey.LEAF_WILTING },
  { patterns: ['drying', 'dried', 'drying out', 'dry'], code: ObservationKey.LEAF_DRYING },
  { patterns: ['rolling', 'rolled'], code: ObservationKey.LEAF_ROLLING },
  { patterns: ['twisting', 'twisted'], code: ObservationKey.LEAF_TWISTING },
  { patterns: ['scorching', 'scorched', 'burnt'], code: ObservationKey.LEAF_SCORCHING },
  
  // Leaf markings
  { patterns: ['spots', 'spotted', 'spots appearing', 'lesions'], code: ObservationKey.LEAF_SPOTS_PRESENT },
  { patterns: ['holes', 'chewed', 'eaten', 'bite marks'], code: ObservationKey.LEAF_CHEWING },
  { patterns: ['stripes', 'striped', 'streaks'], code: ObservationKey.LEAF_STRIPES_PRESENT },
  { patterns: ['white patches', 'white powder', 'powdery'], code: ObservationKey.LEAF_WHITE_PATCHES },
  { patterns: ['black patches', 'black spots'], code: ObservationKey.LEAF_BLACK_PATCHES },
  { patterns: ['mosaic', 'mottled'], code: ObservationKey.LEAF_MOSAIC_PATTERN },
  
  // Stem/shoot symptoms
  { patterns: ['dead heart', 'central shoot dried', 'central shoot dead'], code: ObservationKey.DEAD_HEART_PRESENT },
  { patterns: ['stem boring', 'borer holes', 'holes in stem'], code: ObservationKey.STEM_BORING_MARKS },
  { patterns: ['stem rot', 'rotting stem'], code: ObservationKey.STEM_ROT_PRESENT },
  { patterns: ['stem soft', 'softening'], code: ObservationKey.STEM_SOFTENING },
  { patterns: ['stem split', 'splitting'], code: ObservationKey.STEM_SPLITTING },
  
  // Plant-level symptoms
  { patterns: ['plant death', 'died', 'dead plants', 'plants dying'], code: ObservationKey.SEEDLING_DIED },
  { patterns: ['stunted', 'not growing', 'poor growth', 'slow growth'], code: ObservationKey.STUNTED_PLANTS },
  { patterns: ['lodging', 'fallen', 'bent over'], code: ObservationKey.PLANTS_LODGING },
  { patterns: ['pulled out easily', 'easily pulled', 'loose roots'], code: ObservationKey.SETT_EASILY_PULLED_OUT },
  
  // Root symptoms
  { patterns: ['root rot', 'rotting roots', 'roots rotted'], code: ObservationKey.ROOTS_ROTTED },
  { patterns: ['black roots', 'roots black'], code: ObservationKey.ROOT_BLACKENING },
  { patterns: ['soft roots', 'roots soft'], code: ObservationKey.ROOT_SOFT },
  
  // Disease signs
  { patterns: ['fungal growth', 'fungus'], code: ObservationKey.FUNGAL_GROWTH_VISIBLE },
  { patterns: ['white powdery', 'powdery mildew'], code: ObservationKey.WHITE_POWDERY_GROWTH },
  { patterns: ['mold', 'mould', 'grey mold'], code: ObservationKey.GREY_MOLD_PRESENT },
  { patterns: ['sooty mold', 'black sooty'], code: ObservationKey.BLACK_SOOTY_MOLD },
  { patterns: ['rust', 'pustules'], code: ObservationKey.RUST_PUSTULES },
  { patterns: ['ooze', 'bacterial ooze'], code: ObservationKey.BACTERIAL_OOZE },
  { patterns: ['foul smell', 'bad smell', 'rotting smell'], code: ObservationKey.FOUL_SMELL_PRESENT },
  
  // Fruit/flower symptoms
  { patterns: ['flower drop', 'flowers falling'], code: ObservationKey.FLOWER_DROP },
  { patterns: ['fruit drop', 'fruits falling'], code: ObservationKey.FRUIT_DROP },
  { patterns: ['fruit rot', 'rotting fruit'], code: ObservationKey.FRUIT_ROT },
  { patterns: ['poor flowering', 'no flowers'], code: ObservationKey.POOR_FLOWERING },
  
  // Germination issues
  { patterns: ['not germinated', 'no germination', 'failed to germinate'], code: ObservationKey.SEED_NOT_GERMINATED },
  { patterns: ['poor germination', 'low germination'], code: ObservationKey.POOR_GERMINATION_PERCENT },
  { patterns: ['gaps in field', 'missing plants'], code: ObservationKey.GAPS_IN_FIELD },
  { patterns: ['patchy emergence', 'uneven emergence'], code: ObservationKey.PATCHY_EMERGENCE },
  
  // Soil/water related
  { patterns: ['waterlogged', 'water logging', 'standing water'], code: ObservationKey.FIELD_WATERLOGGED },
  { patterns: ['dry soil', 'soil too dry', 'cracked soil'], code: ObservationKey.SOIL_TOO_DRY },
];

// ═══════════════════════════════════════════════════════════════════════════
// PEST BEHAVIOR → OBSERVATION CODES MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const PEST_BEHAVIOR_MAPPINGS: PatternMapping[] = [
  // Presence
  { patterns: ['insects visible', 'bugs visible', 'insects seen', 'pests visible'], code: ObservationKey.INSECTS_VISIBLE },
  { patterns: ['larvae', 'caterpillar', 'caterpillars', 'worm', 'worms', 'grub'], code: ObservationKey.LARVAE_PRESENT },
  { patterns: ['eggs', 'egg mass'], code: ObservationKey.EGGS_PRESENT },
  
  // Behavior
  { patterns: ['flying', 'fly when disturbed', 'flies away'], code: ObservationKey.INSECTS_FLYING },
  { patterns: ['crawling', 'moving slowly', 'creeping'], code: ObservationKey.INSECTS_CRAWLING },
  { patterns: ['jumping', 'hop', 'hopping', 'leaping'], code: ObservationKey.INSECTS_JUMPING },
  
  // Size
  { patterns: ['small insects', 'tiny insects', 'small bugs'], code: ObservationKey.SMALL_INSECTS },
  { patterns: ['large insects', 'big insects', 'large bugs'], code: ObservationKey.LARGE_INSECTS },
  
  // Color
  { patterns: ['green insects', 'green bugs', 'green colored'], code: ObservationKey.GREEN_INSECTS },
  { patterns: ['black insects', 'black bugs', 'black colored'], code: ObservationKey.BLACK_INSECTS },
  { patterns: ['brown insects', 'brown bugs', 'brown colored'], code: ObservationKey.BROWN_INSECTS },
  { patterns: ['white insects', 'white bugs', 'white colored', 'whitefly', 'white fly'], code: ObservationKey.WHITE_INSECTS },
  
  // Secondary signs
  { patterns: ['honeydew', 'sticky substance', 'sticky leaves'], code: ObservationKey.HONEYDEW_PRESENT },
  { patterns: ['sooty mold', 'black coating'], code: ObservationKey.SOOTY_MOLD_ON_HONEYDEW },
  { patterns: ['webbing', 'silk web', 'web'], code: ObservationKey.SILK_WEBBING_VISIBLE },
  { patterns: ['frass', 'insect droppings', 'excrement'], code: ObservationKey.FRASS_VISIBLE },
  { patterns: ['ants', 'ant present'], code: ObservationKey.ANTS_PRESENT },
];

// ═══════════════════════════════════════════════════════════════════════════
// AFFECTED PART → OBSERVATION CODES MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const AFFECTED_PART_MAPPINGS: Record<string, ObservationKey> = {
  'leaves': ObservationKey.AFFECTED_PART_LEAF,
  'leaf': ObservationKey.AFFECTED_PART_LEAF,
  'stem': ObservationKey.AFFECTED_PART_STEM,
  'stalk': ObservationKey.AFFECTED_PART_STEM,
  'shoot': ObservationKey.AFFECTED_PART_STEM,
  'roots': ObservationKey.AFFECTED_PART_ROOT,
  'root': ObservationKey.AFFECTED_PART_ROOT,
  'whole plant': ObservationKey.AFFECTED_PART_WHOLE,
  'entire plant': ObservationKey.AFFECTED_PART_WHOLE,
  'plant': ObservationKey.AFFECTED_PART_WHOLE,
  'fruit': ObservationKey.AFFECTED_PART_FRUIT,
  'fruits': ObservationKey.AFFECTED_PART_FRUIT,
  'flower': ObservationKey.AFFECTED_PART_FLOWER,
  'flowers': ObservationKey.AFFECTED_PART_FLOWER,
  'boll': ObservationKey.AFFECTED_PART_BOLL,
  'bolls': ObservationKey.AFFECTED_PART_BOLL,
  'grain': ObservationKey.AFFECTED_PART_FRUIT,
  'grains': ObservationKey.AFFECTED_PART_FRUIT,
};

// ═══════════════════════════════════════════════════════════════════════════
// DISTRIBUTION PATTERN → OBSERVATION CODES MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const DISTRIBUTION_MAPPINGS: Record<string, ObservationKey> = {
  'entire field': ObservationKey.ENTIRE_FIELD_AFFECTED,
  'whole field': ObservationKey.ENTIRE_FIELD_AFFECTED,
  'all plants': ObservationKey.ENTIRE_FIELD_AFFECTED,
  'everywhere': ObservationKey.ENTIRE_FIELD_AFFECTED,
  'uniform': ObservationKey.DISTRIBUTION_UNIFORM,
  'patches': ObservationKey.PATCHY_DAMAGE,
  'patchy': ObservationKey.PATCHY_DAMAGE,
  'some areas': ObservationKey.PATCHY_DAMAGE,
  'specific area': ObservationKey.LOCALIZED_SPOTS,
  'localized': ObservationKey.LOCALIZED_SPOTS,
  'edges': ObservationKey.EDGE_DAMAGE_ONLY,
  'field edges': ObservationKey.EDGE_DAMAGE_ONLY,
  'borders': ObservationKey.EDGE_DAMAGE_ONLY,
  'scattered': ObservationKey.DISTRIBUTION_PATCHY,
  'random': ObservationKey.DISTRIBUTION_PATCHY,
  'spreading': ObservationKey.DISTRIBUTION_SPREADING,
  'directional': ObservationKey.DIRECTIONAL_SPREAD,
  'low lying': ObservationKey.LOW_LYING_AREA_AFFECTED,
};

// ═══════════════════════════════════════════════════════════════════════════
// SEVERITY → OBSERVATION CODES MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const SEVERITY_MAPPINGS: Record<string, ObservationKey> = {
  'mild': ObservationKey.SEVERITY_LOW,
  'moderate': ObservationKey.SEVERITY_MEDIUM,
  'severe': ObservationKey.SEVERITY_HIGH,
  'critical': ObservationKey.SEVERITY_CRITICAL,
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN MAPPING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map semantic extraction to canonical ObservationKey codes
 * 100% DETERMINISTIC - same input always produces same output
 * 
 * @param semantic - SemanticExtraction from LLM layer
 * @returns MappedObservationCodes - Canonical codes for rule engine
 */
export function mapToObservationCodes(semantic: SemanticExtraction): MappedObservationCodes {
  console.log(`\n🔗 [ObservationCodeMapper v${OBSERVATION_CODE_MAPPER_VERSION}] Mapping to codes...`);
  
  const startTime = Date.now();
  const observationCodes: ObservationKey[] = [];
  const patternsMatched: string[] = [];
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Map visual changes
  // ═══════════════════════════════════════════════════════════════════════════
  if (semantic.visual_changes && semantic.visual_changes.length > 0) {
    for (const change of semantic.visual_changes) {
      const changeLower = change.toLowerCase();
      
      for (const mapping of VISUAL_CHANGE_MAPPINGS) {
        for (const pattern of mapping.patterns) {
          if (changeLower.includes(pattern)) {
            if (!observationCodes.includes(mapping.code)) {
              observationCodes.push(mapping.code);
              patternsMatched.push(`visual:"${pattern}"→${mapping.code}`);
            }
            break; // Only add code once per mapping
          }
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Map pest behavior
  // ═══════════════════════════════════════════════════════════════════════════
  if (semantic.pest_behavior && semantic.pest_behavior.length > 0) {
    for (const behavior of semantic.pest_behavior) {
      const behaviorLower = behavior.toLowerCase();
      
      for (const mapping of PEST_BEHAVIOR_MAPPINGS) {
        for (const pattern of mapping.patterns) {
          if (behaviorLower.includes(pattern)) {
            if (!observationCodes.includes(mapping.code)) {
              observationCodes.push(mapping.code);
              patternsMatched.push(`pest:"${pattern}"→${mapping.code}`);
            }
            break;
          }
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Map affected parts
  // ═══════════════════════════════════════════════════════════════════════════
  let affectedPartCode = ObservationKey.AFFECTED_PART_UNKNOWN;
  
  if (semantic.affected_plant_parts && semantic.affected_plant_parts.length > 0) {
    const primaryPart = semantic.affected_plant_parts[0].toLowerCase();
    
    for (const [partPattern, code] of Object.entries(AFFECTED_PART_MAPPINGS)) {
      if (primaryPart.includes(partPattern)) {
        affectedPartCode = code;
        patternsMatched.push(`part:"${partPattern}"→${code}`);
        break;
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Map distribution pattern
  // ═══════════════════════════════════════════════════════════════════════════
  let distributionCode: ObservationKey | null = null;
  
  if (semantic.distribution_pattern && semantic.distribution_pattern !== 'not specified') {
    const distLower = semantic.distribution_pattern.toLowerCase();
    
    for (const [distPattern, code] of Object.entries(DISTRIBUTION_MAPPINGS)) {
      if (distLower.includes(distPattern)) {
        distributionCode = code;
        patternsMatched.push(`dist:"${distPattern}"→${code}`);
        break;
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Map severity
  // ═══════════════════════════════════════════════════════════════════════════
  const severityCode = SEVERITY_MAPPINGS[semantic.severity_indicator] || ObservationKey.SEVERITY_MEDIUM;
  patternsMatched.push(`severity:${semantic.severity_indicator}→${severityCode}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD RESULT
  // ═══════════════════════════════════════════════════════════════════════════
  const result: MappedObservationCodes = {
    observation_codes: observationCodes,
    affected_part_code: affectedPartCode,
    distribution_code: distributionCode,
    severity_code: severityCode,
    mapping_method: 'DETERMINISTIC',
    mapping_confidence: 1.0, // Deterministic = 100% confident
    mapping_timestamp: new Date().toISOString(),
    patterns_matched: patternsMatched
  };
  
  const elapsed = Date.now() - startTime;
  console.log(`   ✅ Mapping complete in ${elapsed}ms`);
  console.log(`      Codes: [${observationCodes.join(', ')}]`);
  console.log(`      Part: ${affectedPartCode}, Dist: ${distributionCode || 'none'}, Severity: ${severityCode}`);
  console.log(`      Patterns matched: ${patternsMatched.length}`);
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert MappedObservationCodes to Set<ObservationKey> for rule engine
 */
export function toObservationKeySet(mapped: MappedObservationCodes): Set<ObservationKey> {
  const keys = new Set<ObservationKey>(mapped.observation_codes);
  keys.add(mapped.affected_part_code);
  keys.add(mapped.severity_code);
  if (mapped.distribution_code) {
    keys.add(mapped.distribution_code);
  }
  return keys;
}

/**
 * Check if mapping produced any meaningful codes
 */
export function hasMeaningfulCodes(mapped: MappedObservationCodes): boolean {
  return mapped.observation_codes.length > 0 || 
         mapped.affected_part_code !== ObservationKey.AFFECTED_PART_UNKNOWN;
}

/**
 * Get observation codes as string array (for logging/storage)
 */
export function serializeMappedCodes(mapped: MappedObservationCodes): string[] {
  const codes = [...mapped.observation_codes];
  codes.push(mapped.affected_part_code);
  codes.push(mapped.severity_code);
  if (mapped.distribution_code) {
    codes.push(mapped.distribution_code);
  }
  return codes;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  mapToObservationCodes,
  toObservationKeySet,
  hasMeaningfulCodes,
  serializeMappedCodes,
  OBSERVATION_CODE_MAPPER_VERSION
};
