// CANONICAL SYMBOL ENUMS — English-only symbolic core

export enum CanonicalSymptomSymbol {
  LEAF_YELLOWING = 'LEAF_YELLOWING',
  LEAF_BROWNING = 'LEAF_BROWNING',
  LEAF_CURLING = 'LEAF_CURLING',
  LEAF_WILTING = 'LEAF_WILTING',
  LEAF_SPOTS = 'LEAF_SPOTS',
  LEAF_HOLES = 'LEAF_HOLES',
  LEAF_DRYING = 'LEAF_DRYING',
  LEAF_DROP = 'LEAF_DROP',
  STEM_BORER_DAMAGE = 'STEM_BORER_DAMAGE',
  STEM_BREAKAGE = 'STEM_BREAKAGE',
  STEM_DISCOLORATION = 'STEM_DISCOLORATION',
  DEAD_HEART = 'DEAD_HEART',
  ROOT_ROT = 'ROOT_ROT',
  ROOT_DAMAGE = 'ROOT_DAMAGE',
  SMALL_INSECTS_VISIBLE = 'SMALL_INSECTS_VISIBLE',
  FLYING_INSECTS_VISIBLE = 'FLYING_INSECTS_VISIBLE',
  CRAWLING_INSECTS_VISIBLE = 'CRAWLING_INSECTS_VISIBLE',
  JUMPING_INSECTS_VISIBLE = 'JUMPING_INSECTS_VISIBLE',
  CATERPILLAR_VISIBLE = 'CATERPILLAR_VISIBLE',
  BORER_VISIBLE = 'BORER_VISIBLE',
  EGGS_VISIBLE = 'EGGS_VISIBLE',
  FUNGAL_GROWTH = 'FUNGAL_GROWTH',
  POWDERY_COATING = 'POWDERY_COATING',
  STICKY_SUBSTANCE = 'STICKY_SUBSTANCE',
  HONEYDEW = 'HONEYDEW',
  SOOTY_MOLD = 'SOOTY_MOLD',
  STUNTED_GROWTH = 'STUNTED_GROWTH',
  PLANT_DEATH = 'PLANT_DEATH',
  PATCHY_DEATH = 'PATCHY_DEATH',
  POOR_GERMINATION = 'POOR_GERMINATION',
  WATER_STRESS = 'WATER_STRESS',
  NUTRIENT_DEFICIENCY = 'NUTRIENT_DEFICIENCY',
  HEAT_STRESS = 'HEAT_STRESS',
  FRUIT_DAMAGE = 'FRUIT_DAMAGE',
  POOR_YIELD = 'POOR_YIELD',
  UNKNOWN_SYMPTOM = 'UNKNOWN_SYMPTOM'
}

export enum CanonicalCropSymbol {
  SUGARCANE = 'SUGARCANE',
  COTTON = 'COTTON',
  SOYBEAN = 'SOYBEAN',
  RICE = 'RICE',
  WHEAT = 'WHEAT',
  MAIZE = 'MAIZE',
  TOMATO = 'TOMATO',
  ONION = 'ONION',
  GRAPE = 'GRAPE',
  POMEGRANATE = 'POMEGRANATE',
  BANANA = 'BANANA',
  CHILI = 'CHILI',
  TURMERIC = 'TURMERIC',
  GROUNDNUT = 'GROUNDNUT',
  UNKNOWN_CROP = 'UNKNOWN_CROP'
}

export enum CanonicalAffectedPartSymbol {
  LEAF = 'LEAF',
  STEM = 'STEM',
  ROOT = 'ROOT',
  FRUIT = 'FRUIT',
  FLOWER = 'FLOWER',
  WHOLE_PLANT = 'WHOLE_PLANT',
  UNKNOWN_PART = 'UNKNOWN_PART'
}

export enum CanonicalSeveritySymbol {
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  CRITICAL = 'CRITICAL',
  UNKNOWN_SEVERITY = 'UNKNOWN_SEVERITY'
}

export enum CanonicalDistributionSymbol {
  LOCALIZED = 'LOCALIZED',
  SCATTERED = 'SCATTERED',
  WIDESPREAD = 'WIDESPREAD',
  UNKNOWN_DISTRIBUTION = 'UNKNOWN_DISTRIBUTION'
}

export interface InducedSymbol {
  symbol: string;
  category: 'SYMPTOM' | 'CROP' | 'AFFECTED_PART' | 'SEVERITY' | 'DISTRIBUTION';
  confidence: number;
  source_text: string;
  source_language: string;
}

export interface LanguageInductionResult {
  version: string;
  symptoms: InducedSymbol[];
  crop: InducedSymbol | null;
  affected_parts: InducedSymbol[];
  severity: InducedSymbol | null;
  distribution: InducedSymbol | null;
  symbol_coverage: number;
  total_symbols_extracted: number;
  unmapped_tokens: string[];
  aggregated_confidence: number;
  min_confidence: number;
  max_confidence: number;
  detected_language: string;
  original_text: string;
  processing_time_ms: number;
}
