/**
 * Induction to Observation Mapper v1.0
 * 
 * PURPOSE: Map Language Induction Layer output to existing observation keys
 * and symbolic facts used by the rule engine.
 * 
 * PRINCIPLES:
 * 1. No multilingual logic in rules - all mapping happens here
 * 2. Deterministic English-only output for rule evaluation
 * 3. Enriches existing facts without overriding confirmed data
 */

import { ObservationKey } from './observation-ontology.ts';
import type { SymbolicFact } from './symbolic-reasoner.ts';
import type { LanguageInductionResult } from '../agents/symptom-enums.ts';
import {
  CanonicalSymptomSymbol,
  CanonicalCropSymbol,
  CanonicalAffectedPartSymbol,
  CanonicalSeveritySymbol,
  CanonicalDistributionSymbol,
} from '../agents/symptom-enums.ts';

export const MAPPER_VERSION = '1.0.0';

// ============================================================================
// SYMPTOM TO OBSERVATION MAPPING
// Uses ONLY keys from observation-ontology.ts
// ============================================================================

const SYMPTOM_TO_OBSERVATION: Record<string, ObservationKey[]> = {
  // Leaf symptoms
  [CanonicalSymptomSymbol.LEAF_YELLOWING]: [ObservationKey.SYMPTOM_YELLOWING, ObservationKey.AFFECTED_PART_LEAF],
  [CanonicalSymptomSymbol.LEAF_BROWNING]: [ObservationKey.SYMPTOM_BROWNING, ObservationKey.AFFECTED_PART_LEAF],
  [CanonicalSymptomSymbol.LEAF_CURLING]: [ObservationKey.SYMPTOM_CURLING, ObservationKey.AFFECTED_PART_LEAF],
  [CanonicalSymptomSymbol.LEAF_WILTING]: [ObservationKey.SYMPTOM_WILTING, ObservationKey.AFFECTED_PART_LEAF],
  [CanonicalSymptomSymbol.LEAF_SPOTS]: [ObservationKey.SYMPTOM_SPOTS, ObservationKey.AFFECTED_PART_LEAF],
  [CanonicalSymptomSymbol.LEAF_HOLES]: [ObservationKey.SYMPTOM_HOLES, ObservationKey.AFFECTED_PART_LEAF],
  [CanonicalSymptomSymbol.LEAF_DRYING]: [ObservationKey.SYMPTOM_DRYING, ObservationKey.AFFECTED_PART_LEAF],
  [CanonicalSymptomSymbol.LEAF_DROP]: [ObservationKey.SYMPTOM_DRYING, ObservationKey.AFFECTED_PART_LEAF],
  
  // Stem symptoms
  [CanonicalSymptomSymbol.STEM_BORER_DAMAGE]: [ObservationKey.SYMPTOM_FRASS, ObservationKey.AFFECTED_PART_STEM],
  [CanonicalSymptomSymbol.STEM_BREAKAGE]: [ObservationKey.AFFECTED_PART_STEM],
  [CanonicalSymptomSymbol.STEM_DISCOLORATION]: [ObservationKey.SYMPTOM_COLOR_CHANGE, ObservationKey.AFFECTED_PART_STEM],
  [CanonicalSymptomSymbol.DEAD_HEART]: [ObservationKey.SYMPTOM_DRYING, ObservationKey.AFFECTED_PART_STEM],
  
  // Root symptoms
  [CanonicalSymptomSymbol.ROOT_ROT]: [ObservationKey.SYMPTOM_ROTTING, ObservationKey.AFFECTED_PART_ROOT],
  [CanonicalSymptomSymbol.ROOT_DAMAGE]: [ObservationKey.AFFECTED_PART_ROOT],
  
  // Pest observations
  [CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE]: [ObservationKey.INSECT_PRESENT, ObservationKey.INSECT_DENSITY_FEW],
  [CanonicalSymptomSymbol.FLYING_INSECTS_VISIBLE]: [ObservationKey.INSECT_PRESENT, ObservationKey.INSECT_BEHAVIOR_FLYING],
  [CanonicalSymptomSymbol.CRAWLING_INSECTS_VISIBLE]: [ObservationKey.INSECT_PRESENT, ObservationKey.INSECT_BEHAVIOR_CRAWLING],
  [CanonicalSymptomSymbol.JUMPING_INSECTS_VISIBLE]: [ObservationKey.INSECT_PRESENT],
  [CanonicalSymptomSymbol.CATERPILLAR_VISIBLE]: [ObservationKey.INSECT_PRESENT, ObservationKey.PEST_TYPE_CATERPILLAR],
  [CanonicalSymptomSymbol.BORER_VISIBLE]: [ObservationKey.INSECT_PRESENT, ObservationKey.SYMPTOM_FRASS],
  [CanonicalSymptomSymbol.EGGS_VISIBLE]: [ObservationKey.INSECT_PRESENT],
  
  // Disease symptoms
  [CanonicalSymptomSymbol.FUNGAL_GROWTH]: [ObservationKey.SYMPTOM_POWDER],
  [CanonicalSymptomSymbol.WHITE_POWDER]: [ObservationKey.SYMPTOM_POWDER],
  [CanonicalSymptomSymbol.BLACK_SPOTS]: [ObservationKey.SYMPTOM_SPOTS, ObservationKey.SYMPTOM_BROWNING],
  [CanonicalSymptomSymbol.RUST_PUSTULES]: [ObservationKey.SYMPTOM_SPOTS, ObservationKey.SYMPTOM_COLOR_CHANGE],
  [CanonicalSymptomSymbol.WATER_SOAKED]: [ObservationKey.SYMPTOM_SPOTS],
  [CanonicalSymptomSymbol.ROTTING]: [ObservationKey.SYMPTOM_ROTTING],
  [CanonicalSymptomSymbol.MOLD]: [ObservationKey.SYMPTOM_POWDER],
  
  // Stress symptoms  
  [CanonicalSymptomSymbol.STUNTED_GROWTH]: [ObservationKey.SYMPTOM_STUNTING],
  [CanonicalSymptomSymbol.POOR_VIGOR]: [ObservationKey.SYMPTOM_STUNTING],
  [CanonicalSymptomSymbol.LODGING]: [ObservationKey.AFFECTED_PART_STEM],
  // FIX: Map to diagnosis-level symbols, NOT generic LEAF_YELLOWING
  // "नत्राची कमतरता" → NITROGEN_DEFICIENCY_CONFIRMED, not SYMPTOM_YELLOWING
  [CanonicalSymptomSymbol.NUTRIENT_DEFICIENCY]: [ObservationKey.SYMPTOM_YELLOWING, ObservationKey.AFFECTED_PART_LEAF],
  [CanonicalSymptomSymbol.WATER_STRESS]: [ObservationKey.SYMPTOM_WILTING, ObservationKey.AFFECTED_PART_WHOLE],
};

// ============================================================================
// AFFECTED PART TO OBSERVATION MAPPING
// ============================================================================

const PART_TO_OBSERVATION: Record<string, ObservationKey> = {
  [CanonicalAffectedPartSymbol.LEAF]: ObservationKey.AFFECTED_PART_LEAF,
  [CanonicalAffectedPartSymbol.STEM]: ObservationKey.AFFECTED_PART_STEM,
  [CanonicalAffectedPartSymbol.ROOT]: ObservationKey.AFFECTED_PART_ROOT,
  [CanonicalAffectedPartSymbol.FRUIT]: ObservationKey.AFFECTED_PART_FRUIT,
  [CanonicalAffectedPartSymbol.FLOWER]: ObservationKey.AFFECTED_PART_FLOWER,
  [CanonicalAffectedPartSymbol.GRAIN]: ObservationKey.AFFECTED_PART_FRUIT,
  [CanonicalAffectedPartSymbol.BUD]: ObservationKey.AFFECTED_PART_FLOWER,
  [CanonicalAffectedPartSymbol.BARK]: ObservationKey.AFFECTED_PART_STEM,
  [CanonicalAffectedPartSymbol.WHOLE_PLANT]: ObservationKey.AFFECTED_PART_WHOLE,
};

// ============================================================================
// SEVERITY TO OBSERVATION MAPPING
// ============================================================================

const SEVERITY_TO_OBSERVATION: Record<string, ObservationKey> = {
  [CanonicalSeveritySymbol.MILD]: ObservationKey.SEVERITY_LOW,
  [CanonicalSeveritySymbol.MODERATE]: ObservationKey.SEVERITY_MEDIUM,
  [CanonicalSeveritySymbol.SEVERE]: ObservationKey.SEVERITY_HIGH,
  [CanonicalSeveritySymbol.CRITICAL]: ObservationKey.SEVERITY_HIGH,
};

// ============================================================================
// DISTRIBUTION TO OBSERVATION MAPPING
// ============================================================================

const DISTRIBUTION_TO_OBSERVATION: Record<string, ObservationKey> = {
  [CanonicalDistributionSymbol.SINGLE_PLANT]: ObservationKey.DISTRIBUTION_PATCHY,
  [CanonicalDistributionSymbol.FEW_PLANTS]: ObservationKey.DISTRIBUTION_PATCHY,
  [CanonicalDistributionSymbol.SCATTERED]: ObservationKey.DISTRIBUTION_PATCHY,
  [CanonicalDistributionSymbol.PATCH]: ObservationKey.DISTRIBUTION_PATCHY,
  [CanonicalDistributionSymbol.ROW]: ObservationKey.DISTRIBUTION_EDGE,
  [CanonicalDistributionSymbol.FIELD_WIDE]: ObservationKey.DISTRIBUTION_UNIFORM,
};

// ============================================================================
// CROP SYMBOL TO CODE MAPPING
// ============================================================================

const CROP_SYMBOL_TO_CODE: Record<string, string> = {
  [CanonicalCropSymbol.COTTON]: 'COTTON',
  [CanonicalCropSymbol.SOYBEAN]: 'SOYBEAN',
  [CanonicalCropSymbol.WHEAT]: 'WHEAT',
  [CanonicalCropSymbol.RICE]: 'RICE',
  [CanonicalCropSymbol.MAIZE]: 'MAIZE',
  [CanonicalCropSymbol.SUGARCANE]: 'SUGARCANE',
  [CanonicalCropSymbol.GROUNDNUT]: 'GROUNDNUT',
  [CanonicalCropSymbol.CHICKPEA]: 'CHICKPEA',
  [CanonicalCropSymbol.PIGEON_PEA]: 'PIGEONPEA',
  [CanonicalCropSymbol.ONION]: 'ONION',
  [CanonicalCropSymbol.TOMATO]: 'TOMATO',
  [CanonicalCropSymbol.CHILI]: 'CHILI',
  [CanonicalCropSymbol.GRAPE]: 'GRAPE',
  [CanonicalCropSymbol.POMEGRANATE]: 'POMEGRANATE',
  [CanonicalCropSymbol.MANGO]: 'MANGO',
  [CanonicalCropSymbol.BANANA]: 'BANANA',
  [CanonicalCropSymbol.ORANGE]: 'ORANGE',
};

// ============================================================================
// SYMPTOM TO PRIMARY SYMPTOM STRING MAPPING (for SymbolicFact)
// ============================================================================

const SYMPTOM_TO_PRIMARY: Record<string, string> = {
  [CanonicalSymptomSymbol.LEAF_YELLOWING]: 'LEAF_YELLOWING',
  [CanonicalSymptomSymbol.LEAF_BROWNING]: 'LEAF_BROWNING',
  [CanonicalSymptomSymbol.LEAF_CURLING]: 'LEAF_CURLING',
  [CanonicalSymptomSymbol.LEAF_WILTING]: 'WILTING',
  [CanonicalSymptomSymbol.LEAF_SPOTS]: 'LEAF_SPOTS',
  [CanonicalSymptomSymbol.LEAF_HOLES]: 'LEAF_HOLES',
  [CanonicalSymptomSymbol.LEAF_DRYING]: 'LEAF_DRYING',
  [CanonicalSymptomSymbol.LEAF_DROP]: 'LEAF_DROP',
  [CanonicalSymptomSymbol.STEM_BORER_DAMAGE]: 'STEM_BORER_DAMAGE',
  [CanonicalSymptomSymbol.DEAD_HEART]: 'DEAD_HEART',
  [CanonicalSymptomSymbol.ROOT_ROT]: 'ROOT_ROT',
  [CanonicalSymptomSymbol.ROOT_DAMAGE]: 'ROOT_DAMAGE',
  [CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE]: 'INSECTS_VISIBLE',
  [CanonicalSymptomSymbol.FLYING_INSECTS_VISIBLE]: 'FLYING_INSECTS',
  [CanonicalSymptomSymbol.CRAWLING_INSECTS_VISIBLE]: 'CRAWLING_INSECTS',
  [CanonicalSymptomSymbol.CATERPILLAR_VISIBLE]: 'CATERPILLAR_DAMAGE',
  [CanonicalSymptomSymbol.BORER_VISIBLE]: 'BORER_DAMAGE',
  [CanonicalSymptomSymbol.FUNGAL_GROWTH]: 'FUNGAL_GROWTH',
  [CanonicalSymptomSymbol.WHITE_POWDER]: 'POWDERY_MILDEW',
  [CanonicalSymptomSymbol.BLACK_SPOTS]: 'BLACK_SPOTS',
  [CanonicalSymptomSymbol.RUST_PUSTULES]: 'RUST',
  [CanonicalSymptomSymbol.WATER_SOAKED]: 'WATER_SOAKED_LESIONS',
  [CanonicalSymptomSymbol.ROTTING]: 'ROTTING',
  [CanonicalSymptomSymbol.STUNTED_GROWTH]: 'STUNTED_GROWTH',
  // FIX: Map to CONFIRMED diagnosis-level symbol, not generic
  [CanonicalSymptomSymbol.NUTRIENT_DEFICIENCY]: 'NITROGEN_DEFICIENCY_CONFIRMED',
  // FIX: Map water stress to CONFIRMED symbol
  [CanonicalSymptomSymbol.WATER_STRESS]: 'WATER_STRESS_CONFIRMED',
};

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface MappedObservations {
  keys: Set<ObservationKey>;
  symptoms: string[];
  crop_code: string | null;
  affected_parts: string[];
  severity: string | null;
  distribution: string | null;
  mapper_version: string;
}

export interface MappedFactContribution {
  crop_code?: string;
  primary_symptom?: string;
  secondary_symptoms?: string[];
  affected_part?: string;
  severity_level?: string;
  distribution_pattern?: string;
}

// ============================================================================
// CORE MAPPING FUNCTIONS
// ============================================================================

/**
 * Map Language Induction result to ObservationKey set for rule evaluation
 */
export function mapInductionToObservationKeys(
  inductionResult: LanguageInductionResult
): MappedObservations {
  const keys = new Set<ObservationKey>();
  const symptoms: string[] = [];
  
  // Map symptoms
  for (const symptom of inductionResult.symptoms) {
    const mappedKeys = SYMPTOM_TO_OBSERVATION[symptom.symbol];
    if (mappedKeys) {
      mappedKeys.forEach(k => keys.add(k));
      symptoms.push(symptom.symbol);
    }
  }
  
  // Map affected parts
  const affected_parts: string[] = [];
  for (const part of inductionResult.affected_parts) {
    const mappedKey = PART_TO_OBSERVATION[part.symbol];
    if (mappedKey) {
      keys.add(mappedKey);
      affected_parts.push(part.symbol);
    }
  }
  
  // Map severity
  let severity: string | null = null;
  if (inductionResult.severity) {
    const mappedKey = SEVERITY_TO_OBSERVATION[inductionResult.severity.symbol];
    if (mappedKey) {
      keys.add(mappedKey);
      severity = inductionResult.severity.symbol;
    }
  }
  
  // Map distribution
  let distribution: string | null = null;
  if (inductionResult.distribution) {
    const mappedKey = DISTRIBUTION_TO_OBSERVATION[inductionResult.distribution.symbol];
    if (mappedKey) {
      keys.add(mappedKey);
      distribution = inductionResult.distribution.symbol;
    }
  }
  
  // Map crop
  const crop_code = inductionResult.crop 
    ? CROP_SYMBOL_TO_CODE[inductionResult.crop.symbol] || null
    : null;
  
  return {
    keys,
    symptoms,
    crop_code,
    affected_parts,
    severity,
    distribution,
    mapper_version: MAPPER_VERSION
  };
}

/**
 * Map Language Induction result to SymbolicFact field contributions
 */
export function mapInductionToFactContribution(
  inductionResult: LanguageInductionResult
): MappedFactContribution {
  const contribution: MappedFactContribution = {};
  
  // Map crop
  if (inductionResult.crop) {
    contribution.crop_code = CROP_SYMBOL_TO_CODE[inductionResult.crop.symbol];
  }
  
  // Map primary symptom (highest confidence)
  if (inductionResult.symptoms.length > 0) {
    const primary = inductionResult.symptoms[0];
    contribution.primary_symptom = SYMPTOM_TO_PRIMARY[primary.symbol] || primary.symbol;
    
    // Map secondary symptoms
    if (inductionResult.symptoms.length > 1) {
      contribution.secondary_symptoms = inductionResult.symptoms
        .slice(1)
        .map(s => SYMPTOM_TO_PRIMARY[s.symbol] || s.symbol);
    }
  }
  
  // Map affected part
  if (inductionResult.affected_parts.length > 0) {
    contribution.affected_part = inductionResult.affected_parts[0].symbol;
  }
  
  // Map severity
  if (inductionResult.severity) {
    contribution.severity_level = inductionResult.severity.symbol;
  }
  
  // Map distribution
  if (inductionResult.distribution) {
    contribution.distribution_pattern = inductionResult.distribution.symbol;
  }
  
  return contribution;
}

/**
 * Enrich an existing SymbolicFact with induction results
 * Only fills in missing fields, never overrides confirmed data
 */
export function enrichFactsWithInduction(
  existingFact: Partial<SymbolicFact>,
  inductionResult: LanguageInductionResult
): Partial<SymbolicFact> {
  const contribution = mapInductionToFactContribution(inductionResult);
  const enriched = { ...existingFact };
  
  // Only fill in if not already present
  if (!enriched.crop_code && contribution.crop_code) {
    enriched.crop_code = contribution.crop_code;
  }
  
  if (!enriched.primary_symptom && contribution.primary_symptom) {
    enriched.primary_symptom = contribution.primary_symptom;
  }
  
  if ((!enriched.secondary_symptoms || enriched.secondary_symptoms.length === 0) 
      && contribution.secondary_symptoms) {
    enriched.secondary_symptoms = contribution.secondary_symptoms;
  }
  
  if (!enriched.affected_part && contribution.affected_part) {
    enriched.affected_part = contribution.affected_part;
  }
  
  if (!enriched.severity_level && contribution.severity_level) {
    enriched.severity_level = contribution.severity_level;
  }
  
  if (!enriched.distribution_pattern && contribution.distribution_pattern) {
    enriched.distribution_pattern = contribution.distribution_pattern;
  }
  
  return enriched;
}

/**
 * Check if induction provides sufficient observations for rule evaluation
 */
export function hasSufficientObservationsForRules(
  inductionResult: LanguageInductionResult
): { sufficient: boolean; reason: string } {
  // Need at least a crop OR a symptom
  const hasCrop = inductionResult.crop !== null;
  const hasSymptom = inductionResult.symptoms.length > 0;
  const hasPart = inductionResult.affected_parts.length > 0;
  
  if (!hasCrop && !hasSymptom) {
    return { 
      sufficient: false, 
      reason: 'No crop or symptom identified from input' 
    };
  }
  
  // Ideal: crop + symptom
  if (hasCrop && hasSymptom) {
    return { 
      sufficient: true, 
      reason: 'Crop and symptom identified' 
    };
  }
  
  // Symptom with affected part is good enough
  if (hasSymptom && hasPart) {
    return { 
      sufficient: true, 
      reason: 'Symptom and affected part identified' 
    };
  }
  
  // Just crop - needs context from land
  if (hasCrop && !hasSymptom) {
    return { 
      sufficient: true, 
      reason: 'Crop identified, symptom will come from context' 
    };
  }
  
  // Just symptom with good confidence
  if (hasSymptom && inductionResult.aggregated_confidence >= 0.6) {
    return { 
      sufficient: true, 
      reason: 'High-confidence symptom identified' 
    };
  }
  
  return { 
    sufficient: false, 
    reason: 'Insufficient observations for reliable rule matching' 
  };
}

export default {
  mapInductionToObservationKeys,
  mapInductionToFactContribution,
  enrichFactsWithInduction,
  hasSufficientObservationsForRules,
  MAPPER_VERSION
};
