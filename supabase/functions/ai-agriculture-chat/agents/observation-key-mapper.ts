// PHASE-8: OBSERVATION KEY MAPPER

import { ObservationKey, type ObservationKeySet } from '../decision/observation-ontology.ts';
import type { ObservationExtraction, AffectedPart, SymptomDistribution } from './observation-extractor.ts';
import type { CropContextAuthority } from '../decision/context-authority.ts';

export const OBSERVATION_KEY_MAPPER_VERSION = '2.0.0'; // Phase-11: Insect-first clarification

// MAPPING TABLES (Deterministic, No Language)

const AFFECTED_PART_MAP: Record<AffectedPart, ObservationKey> = {
  'leaf': ObservationKey.AFFECTED_PART_LEAF,
  'stem': ObservationKey.AFFECTED_PART_STEM,
  'root': ObservationKey.AFFECTED_PART_ROOT,
  'whole': ObservationKey.AFFECTED_PART_WHOLE,
  'fruit': ObservationKey.AFFECTED_PART_FRUIT,
  'boll': ObservationKey.AFFECTED_PART_BOLL,
  'unknown': ObservationKey.AFFECTED_PART_UNKNOWN
};

const DISTRIBUTION_MAP: Record<SymptomDistribution, ObservationKey> = {
  'uniform': ObservationKey.DISTRIBUTION_UNIFORM,
  'patchy': ObservationKey.DISTRIBUTION_PATCHY,
  'border': ObservationKey.DISTRIBUTION_EDGE,
  'spreading': ObservationKey.DISTRIBUTION_SPREADING,
  'unknown': ObservationKey.DISTRIBUTION_UNKNOWN
};

// MAIN MAPPING FUNCTION

export interface ObservationKeyMappingResult {
  keys: Set<ObservationKey>;
  key_count: number;
  unknown_count: number;
  mapping_source: 'OBSERVATION_EXTRACTION';
}

// Map ObservationExtraction to canonical ObservationKeys.
export function mapToObservationKeys(
  observations: ObservationExtraction,
  landContext?: {
    current_crop?: string;
    growth_stage?: string;
  },
  cropContext?: CropContextAuthority | null
): ObservationKeyMappingResult {
  const keys = new Set<ObservationKey>();
  let unknownCount = 0;
  
  // 1. CROP IDENTIFICATION (PHASE-8.1: Crop Context Authority Priority)
  if (observations.crop_mentioned || cropContext?.crop_name || landContext?.current_crop) {
    keys.add(ObservationKey.CROP_IDENTIFIED);
  } else {
    keys.add(ObservationKey.CROP_UNKNOWN);
    unknownCount++;
  }
  
  // 2. AFFECTED PART
  const partKey = AFFECTED_PART_MAP[observations.affected_part] || ObservationKey.AFFECTED_PART_UNKNOWN;
  keys.add(partKey);
  if (partKey === ObservationKey.AFFECTED_PART_UNKNOWN) {
    unknownCount++;
  }
  
  // 3. DISTRIBUTION
  const distKey = DISTRIBUTION_MAP[observations.symptom_distribution] || ObservationKey.DISTRIBUTION_UNKNOWN;
  keys.add(distKey);
  if (distKey === ObservationKey.DISTRIBUTION_UNKNOWN) {
    unknownCount++;
  }
  
  // 4. SEVERITY (from severity_words array)
  if (Array.isArray(observations.severity_words) && observations.severity_words.length > 0) {
    // Map severity words to severity level
    const severityKey = mapSeverityWords(observations.severity_words);
    keys.add(severityKey);
  } else {
    keys.add(ObservationKey.SEVERITY_UNKNOWN);
    unknownCount++;
  }
  
  // 5. TIMING (from time_reference)
  if (observations.time_reference) {
    const timingKey = mapTimeReference(observations.time_reference);
    keys.add(timingKey);
    if (timingKey === ObservationKey.TIMING_UNKNOWN) {
      unknownCount++;
    }
  } else {
    keys.add(ObservationKey.TIMING_UNKNOWN);
    unknownCount++;
  }
  
  // 6. OBSERVED PHENOMENA (from raw_symptom_text)
  const phenomenaKeys = mapSymptomsToPhenomena(observations.raw_symptom_text);
  phenomenaKeys.forEach(k => keys.add(k));
  
  // 7. FARMER ACTIONS
  if (Array.isArray(observations.action_taken) && observations.action_taken.length > 0) {
    const actionKeys = mapActionsToKeys(observations.action_taken);
    actionKeys.forEach(k => keys.add(k));
  } else {
    keys.add(ObservationKey.ACTION_NONE);
  }
  
  // 8. PHOTO STATUS (default: not provided)
  keys.add(ObservationKey.PHOTO_NOT_PROVIDED);
  
  return {
    keys,
    key_count: keys.size,
    unknown_count: unknownCount,
    mapping_source: 'OBSERVATION_EXTRACTION'
  };
}

// HELPER FUNCTIONS (Deterministic, No Language)

function mapSeverityWords(severityWords: string[]): ObservationKey {
  // Join all severity words and check against known patterns
  const combined = severityWords.join(' ').toLowerCase();
  
  // High severity indicators (language-agnostic - already extracted in observation-extractor)
  if (combined.includes('severe') || combined.includes('very') || 
      combined.includes('extreme') || combined.includes('worst') ||
      combined.includes('lot') || combined.includes('heavy')) {
    return ObservationKey.SEVERITY_HIGH;
  }
  
  // Low severity indicators
  if (combined.includes('mild') || combined.includes('light') || 
      combined.includes('little') || combined.includes('slight')) {
    return ObservationKey.SEVERITY_LOW;
  }
  
  // Default to medium if words exist but don't match high/low
  if (severityWords.length > 0) {
    return ObservationKey.SEVERITY_MEDIUM;
  }
  
  return ObservationKey.SEVERITY_UNKNOWN;
}

function mapTimeReference(timeRef: string): ObservationKey {
  const lower = timeRef.toLowerCase();
  
  // Recent (1-2 days)
  if (lower.includes('today') || lower.includes('yesterday') || 
      lower.includes('1') || lower.includes('2')) {
    return ObservationKey.TIMING_RECENT;
  }
  
  // Week (3-7 days)
  if (lower.includes('week') || lower.includes('3') || lower.includes('4') ||
      lower.includes('5') || lower.includes('6') || lower.includes('7')) {
    return ObservationKey.TIMING_WEEK;
  }
  
  // Long (2+ weeks)
  if (lower.includes('month') || lower.includes('long') || lower.includes('weeks')) {
    return ObservationKey.TIMING_LONG;
  }
  
  // If we have any time reference but can't classify, default to WEEK
  if (timeRef.trim().length > 0) {
    return ObservationKey.TIMING_WEEK;
  }
  
  return ObservationKey.TIMING_UNKNOWN;
}

function mapSymptomsToPhenomena(rawSymptoms: string[]): ObservationKey[] {
  const phenomena: ObservationKey[] = [];
  const combined = rawSymptoms.join(' ').toLowerCase();
  
  // Insect presence
  if (combined.includes('insect') || combined.includes('bug') || 
      combined.includes('worm') || combined.includes('larvae') ||
      combined.includes('किड') || combined.includes('अळी') || combined.includes('कीड')) {
    phenomena.push(ObservationKey.INSECT_PRESENT);
  }
  
  // PHASE-11: Insect Behavior Detection (from clarification answers)
  if (combined.includes('उडत') || combined.includes('उड़') || combined.includes('flying') ||
      combined.includes('fly') || combined.includes('उडण')) {
    phenomena.push(ObservationKey.INSECT_BEHAVIOR_FLYING);
  }
  
  // Crawling insects
  if (combined.includes('चालत') || combined.includes('रांगत') || combined.includes('रेंग') ||
      combined.includes('crawl') || combined.includes('चलत')) {
    phenomena.push(ObservationKey.INSECT_BEHAVIOR_CRAWLING);
  }
  
  // PHASE-11: Insect Density Detection
  if (combined.includes('थोड') || combined.includes('काही') || combined.includes('कुछ') ||
      combined.includes('few') || combined.includes('scattered')) {
    phenomena.push(ObservationKey.INSECT_DENSITY_FEW);
  }
  
  // Many insects
  if (combined.includes('खूप') || combined.includes('भरपूर') || combined.includes('बहुत') ||
      combined.includes('many') || combined.includes('lots') || combined.includes('heavy')) {
    phenomena.push(ObservationKey.INSECT_DENSITY_MANY);
  }
  
  // PHASE-11: Plant Response Detection (from clarification answers)
  if (combined.includes('वळ') || combined.includes('मुड') || combined.includes('curl') ||
      combined.includes('गुंडाळ')) {
    phenomena.push(ObservationKey.PLANT_RESPONSE_CURLING);
    phenomena.push(ObservationKey.SYMPTOM_CURLING);
  }
  
  // Yellowing response
  if (combined.includes('पिवळ') || combined.includes('पीला') || combined.includes('yellow')) {
    phenomena.push(ObservationKey.PLANT_RESPONSE_YELLOWING);
  }
  
  // Sticky response
  if (combined.includes('चिकट') || combined.includes('चिपचिप') || combined.includes('sticky')) {
    phenomena.push(ObservationKey.PLANT_RESPONSE_STICKY);
    phenomena.push(ObservationKey.SYMPTOM_STICKY);
  }
  
  // Holes response
  if (combined.includes('छिद्र') || combined.includes('भोक') || combined.includes('छेद') ||
      combined.includes('hole') || combined.includes('bite')) {
    phenomena.push(ObservationKey.PLANT_RESPONSE_HOLES);
  }
  
  // No visible damage response
  if (combined.includes('काहीही नाही') || combined.includes('कुछ नहीं') || 
      combined.includes('no such') || combined.includes('nothing')) {
    phenomena.push(ObservationKey.PLANT_RESPONSE_NONE);
  }
  
  // Yellowing
  if (combined.includes('yellow') || combined.includes('पिवळ') || combined.includes('पीला')) {
    phenomena.push(ObservationKey.SYMPTOM_YELLOWING);
  }
  
  // Browning
  if (combined.includes('brown') || combined.includes('तपकिर') || combined.includes('भूर')) {
    phenomena.push(ObservationKey.SYMPTOM_BROWNING);
  }
  
  // Drying
  if (combined.includes('dry') || combined.includes('dried') || combined.includes('wilt') ||
      combined.includes('वाळ') || combined.includes('सुक') || combined.includes('सूख')) {
    phenomena.push(ObservationKey.SYMPTOM_DRYING);
  }
  
  // Spots
  if (combined.includes('spot') || combined.includes('डाग') || combined.includes('धब्ब')) {
    phenomena.push(ObservationKey.SYMPTOM_SPOTS);
  }
  
  // Holes
  if (combined.includes('hole') || combined.includes('छेद') || combined.includes('छिद्र') ||
      combined.includes('भोक')) {
    phenomena.push(ObservationKey.SYMPTOM_HOLES);
  }
  
  // Wilting
  if (combined.includes('wilt') || combined.includes('droop') || 
      combined.includes('लोंब') || combined.includes('मुरझ')) {
    phenomena.push(ObservationKey.SYMPTOM_WILTING);
  }
  
  // Curling
  if (combined.includes('curl') || combined.includes('गुंड') || combined.includes('मुड')) {
    phenomena.push(ObservationKey.SYMPTOM_CURLING);
  }
  
  // Stunting
  if (combined.includes('stunt') || combined.includes('dwarf') || combined.includes('खुंट')) {
    phenomena.push(ObservationKey.SYMPTOM_STUNTING);
  }
  
  // Rotting
  if (combined.includes('rot') || combined.includes('decay') || 
      combined.includes('कुज') || combined.includes('सड')) {
    phenomena.push(ObservationKey.SYMPTOM_ROTTING);
  }
  
  // Sticky (honeydew)
  if (combined.includes('sticky') || combined.includes('चिकट') || combined.includes('चिपचिप')) {
    phenomena.push(ObservationKey.SYMPTOM_STICKY);
  }
  
  // Powder (fungal)
  if (combined.includes('powder') || combined.includes('dust') || 
      combined.includes('पावडर') || combined.includes('भुसा')) {
    phenomena.push(ObservationKey.SYMPTOM_POWDER);
    // Also add FRASS if frass-like description
    if (combined.includes('frass') || combined.includes('भुसा')) {
      phenomena.push(ObservationKey.SYMPTOM_FRASS);
    }
  }
  
  // Color change (generic)
  if (combined.includes('color') || combined.includes('रंग')) {
    if (!phenomena.includes(ObservationKey.SYMPTOM_YELLOWING) && 
        !phenomena.includes(ObservationKey.SYMPTOM_BROWNING)) {
      phenomena.push(ObservationKey.SYMPTOM_COLOR_CHANGE);
    }
  }
  
  return phenomena;
}

function mapActionsToKeys(actions: string[]): ObservationKey[] {
  const actionKeys: ObservationKey[] = [];
  const combined = actions.join(' ').toLowerCase();
  
  if (combined.includes('spray') || combined.includes('फवारणी') || combined.includes('स्प्रे')) {
    actionKeys.push(ObservationKey.ACTION_SPRAY_DONE);
  }
  
  if (combined.includes('fertiliz') || combined.includes('खत') || combined.includes('खाद')) {
    actionKeys.push(ObservationKey.ACTION_FERTILIZER_APPLIED);
  }
  
  if (combined.includes('water') || combined.includes('irrigat') || 
      combined.includes('पाणी') || combined.includes('सिंचाई')) {
    actionKeys.push(ObservationKey.ACTION_IRRIGATION_DONE);
  }
  
  return actionKeys;
}

// Add photo key based on whether photo was provided
export function addPhotoKey(keys: Set<ObservationKey>, photoProvided: boolean): void {
  keys.delete(ObservationKey.PHOTO_NOT_PROVIDED);
  keys.delete(ObservationKey.PHOTO_PROVIDED);
  
  if (photoProvided) {
    keys.add(ObservationKey.PHOTO_PROVIDED);
  } else {
    keys.add(ObservationKey.PHOTO_NOT_PROVIDED);
  }
}

// Serialize ObservationKeySet to array for logging/storage
export function serializeKeys(keys: Set<ObservationKey>): string[] {
  return Array.from(keys);
}

// Deserialize array back to ObservationKeySet
export function deserializeKeys(keyArray: string[]): Set<ObservationKey> {
  return new Set(keyArray as ObservationKey[]);
}

export default {
  mapToObservationKeys,
  addPhotoKey,
  serializeKeys,
  deserializeKeys,
  OBSERVATION_KEY_MAPPER_VERSION
};
