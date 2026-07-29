// ENTITY CODE MAPPER - Unified Pest/Disease Code Normalization

export const ENTITY_CODE_MAPPER_VERSION = '1.0.0';

// PEST CODE MAPPINGS: Raw Entity Code → Decision Graph Code

const PEST_TO_DECISION_GRAPH: Record<string, string> = {
  // Sugarcane pests → Generic codes for rule matching
  'SUGARCANE_SHOOT_BORER': 'SHOOT_BORER',
  'SUGARCANE_TOP_BORER': 'TOP_BORER',
  'SUGARCANE_INTERNODE_BORER': 'INTERNODE_BORER',
  'SUGARCANE_PYRILLA': 'PYRILLA',
  'SUGARCANE_WOOLLY_APHID': 'WOOLLY_APHID',
  'SUGARCANE_TERMITE': 'TERMITE',
  'SUGARCANE_WHITEFLY': 'WHITEFLY',
  'SUGARCANE_SCALE_INSECT': 'SCALE_INSECT',
  'SUGARCANE_ROOT_BORER': 'ROOT_BORER',
  'SUGARCANE_EARLY_SHOOT_BORER': 'SHOOT_BORER',
  
  // Cotton pests → Generic codes
  'COTTON_SPOTTED_BOLLWORM': 'BOLLWORM',
  'COTTON_AMERICAN_BOLLWORM': 'BOLLWORM',
  'COTTON_PINK_BOLLWORM': 'PINK_BOLLWORM',
  'COTTON_GREEN_BOLLWORM': 'BOLLWORM',
  'COTTON_JASSID': 'JASSID',
  'COTTON_WHITEFLY': 'WHITEFLY',
  'COTTON_MEALYBUG': 'MEALYBUG',
  'COTTON_APHID': 'APHID',
  'COTTON_THRIPS': 'THRIPS',
  'COTTON_RED_MITE': 'MITE',
  
  // Soybean pests
  'SOYBEAN_STEM_FLY': 'STEM_FLY',
  'SOYBEAN_APHID': 'APHID',
  'SOYBEAN_SEMILOOPER': 'SEMILOOPER',
  'SOYBEAN_GREEN_SEMILOOPER': 'SEMILOOPER',
  'SOYBEAN_GIRDLE_BEETLE': 'GIRDLE_BEETLE',
  'SOYBEAN_HAIRY_CATERPILLAR': 'HAIRY_CATERPILLAR',
  'SOYBEAN_SPODOPTERA': 'SPODOPTERA',
  
  // Rice pests
  'RICE_STEM_BORER': 'STEM_BORER',
  'RICE_BROWN_PLANTHOPPER': 'BROWN_PLANTHOPPER',
  'RICE_WHITE_BACKED_PLANTHOPPER': 'PLANTHOPPER',
  'RICE_LEAF_FOLDER': 'LEAF_FOLDER',
  'RICE_GALL_MIDGE': 'GALL_MIDGE',
  'RICE_CASE_WORM': 'CASE_WORM',
  'RICE_HISPA': 'HISPA',
  'RICE_THRIPS': 'THRIPS',
  'RICE_GREEN_LEAFHOPPER': 'LEAFHOPPER',
  
  // Tomato pests
  'TOMATO_FRUIT_BORER': 'FRUIT_BORER',
  'TOMATO_WHITEFLY': 'WHITEFLY',
  'TOMATO_APHID': 'APHID',
  'TOMATO_LEAF_MINER': 'LEAF_MINER',
  'TOMATO_TUTA_ABSOLUTA': 'TUTA_ABSOLUTA',
  'TOMATO_SPIDER_MITE': 'MITE',
  
  // Generic mappings (already in decision graph format)
  'SHOOT_BORER': 'SHOOT_BORER',
  'TOP_BORER': 'TOP_BORER',
  'STEM_BORER': 'STEM_BORER',
  'BOLLWORM': 'BOLLWORM',
  'WHITEFLY': 'WHITEFLY',
  'APHID': 'APHID',
  'THRIPS': 'THRIPS',
  'MITE': 'MITE',
  'MEALYBUG': 'MEALYBUG',
  'JASSID': 'JASSID',
  'TERMITE': 'TERMITE',
  'PYRILLA': 'PYRILLA',
  'FRUIT_BORER': 'FRUIT_BORER',
  'LEAF_MINER': 'LEAF_MINER',
  
  // Fall Armyworm
  'FALL_ARMYWORM': 'FALL_ARMYWORM',
  'FAW': 'FALL_ARMYWORM',
  'MAIZE_FALL_ARMYWORM': 'FALL_ARMYWORM',
  'SPODOPTERA_FRUGIPERDA': 'FALL_ARMYWORM',
  
  // Symptom-based pest detection
  'DEAD_HEART': 'SHOOT_BORER',
  'DEAD_HEART_SUGARCANE': 'SHOOT_BORER',
  'SUGARCANE_DEAD_HEART': 'SHOOT_BORER',
};

// DISEASE CODE MAPPINGS: Raw Entity Code → Decision Graph Code

const DISEASE_TO_DECISION_GRAPH: Record<string, string> = {
  // Sugarcane diseases
  'SUGARCANE_RED_ROT': 'RED_ROT',
  'SUGARCANE_SMUT': 'SMUT',
  'SUGARCANE_WILT': 'WILT',
  'SUGARCANE_RUST': 'RUST',
  'SUGARCANE_LEAF_SCALD': 'LEAF_SCALD',
  'SUGARCANE_POKKAH_BOENG': 'POKKAH_BOENG',
  
  // Cotton diseases
  'COTTON_BACTERIAL_BLIGHT': 'BACTERIAL_BLIGHT',
  'COTTON_FUSARIUM_WILT': 'FUSARIUM_WILT',
  'COTTON_VERTICILLIUM_WILT': 'VERTICILLIUM_WILT',
  'COTTON_LEAF_CURL': 'LEAF_CURL',
  'COTTON_GREY_MILDEW': 'GREY_MILDEW',
  'COTTON_ALTERNARIA_BLIGHT': 'ALTERNARIA_BLIGHT',
  
  // Soybean diseases
  'SOYBEAN_YELLOW_MOSAIC': 'YELLOW_MOSAIC',
  'SOYBEAN_RUST': 'RUST',
  'SOYBEAN_CHARCOAL_ROT': 'CHARCOAL_ROT',
  'SOYBEAN_RHIZOCTONIA_ROOT_ROT': 'ROOT_ROT',
  'SOYBEAN_POD_BLIGHT': 'POD_BLIGHT',
  
  // Rice diseases
  'RICE_BLAST': 'BLAST',
  'RICE_SHEATH_BLIGHT': 'SHEATH_BLIGHT',
  'RICE_BROWN_SPOT': 'BROWN_SPOT',
  'RICE_BACTERIAL_LEAF_BLIGHT': 'BACTERIAL_LEAF_BLIGHT',
  'RICE_TUNGRO': 'TUNGRO',
  'RICE_FALSE_SMUT': 'FALSE_SMUT',
  
  // Tomato diseases
  'TOMATO_EARLY_BLIGHT': 'EARLY_BLIGHT',
  'TOMATO_LATE_BLIGHT': 'LATE_BLIGHT',
  'TOMATO_LEAF_CURL': 'LEAF_CURL',
  'TOMATO_FUSARIUM_WILT': 'FUSARIUM_WILT',
  'TOMATO_BACTERIAL_WILT': 'BACTERIAL_WILT',
  'TOMATO_SEPTORIA_LEAF_SPOT': 'SEPTORIA_LEAF_SPOT',
  'TOMATO_POWDERY_MILDEW': 'POWDERY_MILDEW',
  
  // Generic mappings
  'RED_ROT': 'RED_ROT',
  'SMUT': 'SMUT',
  'WILT': 'WILT',
  'RUST': 'RUST',
  'BLAST': 'BLAST',
  'BLIGHT': 'BLIGHT',
  'LEAF_CURL': 'LEAF_CURL',
  'POWDERY_MILDEW': 'POWDERY_MILDEW',
  'DOWNY_MILDEW': 'DOWNY_MILDEW',
  'ROOT_ROT': 'ROOT_ROT',
  'LEAF_SPOT': 'LEAF_SPOT',
  'BACTERIAL_BLIGHT': 'BACTERIAL_BLIGHT',
  'EARLY_BLIGHT': 'EARLY_BLIGHT',
  'LATE_BLIGHT': 'LATE_BLIGHT',
  'ANTHRACNOSE': 'ANTHRACNOSE',
};

// CROP CODE MAPPINGS

const CROP_TO_DECISION_GRAPH: Record<string, string> = {
  // Normalize variants
  'SUGARCANE': 'SUGARCANE',
  'SUGAR_CANE': 'SUGARCANE',
  'GANNA': 'SUGARCANE',
  'US': 'SUGARCANE',
  
  'COTTON': 'COTTON',
  'KAPAS': 'COTTON',
  'KAPUS': 'COTTON',
  
  'SOYBEAN': 'SOYBEAN',
  'SOYA': 'SOYBEAN',
  'SOYABEAN': 'SOYBEAN',
  
  'RICE': 'RICE',
  'PADDY': 'RICE',
  'DHAN': 'RICE',
  'CHAWAL': 'RICE',
  'BHAT': 'RICE',
  
  'WHEAT': 'WHEAT',
  'GEHUN': 'WHEAT',
  
  'MAIZE': 'MAIZE',
  'CORN': 'MAIZE',
  'MAKKA': 'MAIZE',
  
  'TOMATO': 'TOMATO',
  'TAMATAR': 'TOMATO',
  
  'ONION': 'ONION',
  'KANDA': 'ONION',
  'PYAZ': 'ONION',
  
  'CHILLI': 'CHILLI',
  'CHILI': 'CHILLI',
  'MIRCHI': 'CHILLI',
  
  'GROUNDNUT': 'GROUNDNUT',
  'PEANUT': 'GROUNDNUT',
  'MOONGFALI': 'GROUNDNUT',
  
  'TUR': 'TUR',
  'ARHAR': 'TUR',
  'PIGEONPEA': 'TUR',
  'PIGEON_PEA': 'TUR',
  
  'GRAM': 'GRAM',
  'CHICKPEA': 'GRAM',
  'CHANA': 'GRAM',
};

// PUBLIC FUNCTIONS

// Convert raw pest code to decision graph pest code
export function toDecisionGraphPestCode(rawCode: string, cropCode?: string): string {
  if (!rawCode) return '';
  
  const normalized = rawCode.toUpperCase().replace(/[\s-]+/g, '_');
  
  // Direct lookup first
  if (PEST_TO_DECISION_GRAPH[normalized]) {
    return PEST_TO_DECISION_GRAPH[normalized];
  }
  
  // Try with crop prefix if provided
  if (cropCode) {
    const cropNormalized = cropCode.toUpperCase().replace(/[\s-]+/g, '_');
    const withCrop = `${cropNormalized}_${normalized}`;
    if (PEST_TO_DECISION_GRAPH[withCrop]) {
      return PEST_TO_DECISION_GRAPH[withCrop];
    }
  }
  
  // Strip crop prefix if present (SUGARCANE_SHOOT_BORER → SHOOT_BORER)
  const parts = normalized.split('_');
  if (parts.length > 1) {
    const withoutFirstPart = parts.slice(1).join('_');
    if (PEST_TO_DECISION_GRAPH[withoutFirstPart]) {
      return PEST_TO_DECISION_GRAPH[withoutFirstPart];
    }
    // Try the stripped version directly as decision graph code
    return withoutFirstPart;
  }
  
  // Return as-is if no mapping found
  console.warn(`[EntityCodeMapper] No pest mapping found for: ${rawCode}, returning as-is`);
  return normalized;
}

// Convert raw disease code to decision graph disease code
export function toDecisionGraphDiseaseCode(rawCode: string, cropCode?: string): string {
  if (!rawCode) return '';
  
  const normalized = rawCode.toUpperCase().replace(/[\s-]+/g, '_');
  
  // Direct lookup first
  if (DISEASE_TO_DECISION_GRAPH[normalized]) {
    return DISEASE_TO_DECISION_GRAPH[normalized];
  }
  
  // Try with crop prefix if provided
  if (cropCode) {
    const cropNormalized = cropCode.toUpperCase().replace(/[\s-]+/g, '_');
    const withCrop = `${cropNormalized}_${normalized}`;
    if (DISEASE_TO_DECISION_GRAPH[withCrop]) {
      return DISEASE_TO_DECISION_GRAPH[withCrop];
    }
  }
  
  // Strip crop prefix if present
  const parts = normalized.split('_');
  if (parts.length > 1) {
    const withoutFirstPart = parts.slice(1).join('_');
    if (DISEASE_TO_DECISION_GRAPH[withoutFirstPart]) {
      return DISEASE_TO_DECISION_GRAPH[withoutFirstPart];
    }
    return withoutFirstPart;
  }
  
  console.warn(`[EntityCodeMapper] No disease mapping found for: ${rawCode}, returning as-is`);
  return normalized;
}

// Convert raw crop code to decision graph crop code
export function toDecisionGraphCropCode(rawCode: string): string {
  if (!rawCode) return '';
  
  const normalized = rawCode.toUpperCase().replace(/[\s-]+/g, '_');
  
  if (CROP_TO_DECISION_GRAPH[normalized]) {
    return CROP_TO_DECISION_GRAPH[normalized];
  }
  
  return normalized;
}

// Apply all code normalizations to a rule engine input object
export function normalizeCodesForRuleEngine(input: {
  pest_code?: string;
  disease_code?: string;
  crop_code?: string;
  [key: string]: any;
}): {
  pest_code?: string;
  disease_code?: string;
  crop_code?: string;
  [key: string]: any;
} {
  const normalizedCrop = input.crop_code ? toDecisionGraphCropCode(input.crop_code) : undefined;
  
  return {
    ...input,
    crop_code: normalizedCrop,
    pest_code: input.pest_code ? toDecisionGraphPestCode(input.pest_code, normalizedCrop) : undefined,
    disease_code: input.disease_code ? toDecisionGraphDiseaseCode(input.disease_code, normalizedCrop) : undefined,
  };
}

// Get the original crop-specific code from decision graph code
export function getOriginalPestCode(decisionGraphCode: string, cropCode: string): string {
  const normalizedCrop = cropCode.toUpperCase().replace(/[\s-]+/g, '_');
  return `${normalizedCrop}_${decisionGraphCode}`;
}

// Check if a pest code is symptom-based (e.g., DEAD_HEART)
export function isSymptomBasedPestCode(code: string): boolean {
  const symptomCodes = ['DEAD_HEART', 'YELLOWING', 'WILTING', 'HOLES', 'SPOTS', 'POWDER'];
  const normalized = code.toUpperCase();
  return symptomCodes.some(s => normalized.includes(s));
}

// Log code mapping for debugging
export function logCodeMapping(
  rawPest?: string,
  rawDisease?: string,
  rawCrop?: string,
  traceId?: string
): void {
  const prefix = traceId ? `[${traceId}]` : '';
  console.log(`🔄 ${prefix} [EntityCodeMapper] Code Normalization:`);
  
  if (rawCrop) {
    console.log(`   Crop: ${rawCrop} → ${toDecisionGraphCropCode(rawCrop)}`);
  }
  if (rawPest) {
    console.log(`   Pest: ${rawPest} → ${toDecisionGraphPestCode(rawPest, rawCrop)}`);
  }
  if (rawDisease) {
    console.log(`   Disease: ${rawDisease} → ${toDecisionGraphDiseaseCode(rawDisease, rawCrop)}`);
  }
}
