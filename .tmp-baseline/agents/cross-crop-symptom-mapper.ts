// PHASE-9: CROSS-CROP SYMPTOM MAPPER

import { CrossCropSymptomKey, serializeCrossCropSymptoms } from '../decision/cross-crop-symptom-ontology.ts';

// Re-export for convenience
export { serializeCrossCropSymptoms };

export const CROSS_CROP_SYMPTOM_MAPPER_VERSION = '1.0.0';

// SYMPTOM PATTERNS (Multi-language, Observation-Only)

interface SymptomPattern {
  key: CrossCropSymptomKey;
  patterns: RegExp[];
}

const SYMPTOM_PATTERNS: SymptomPattern[] = [
  // LEAF SYMPTOMS
  {
    key: CrossCropSymptomKey.LEAF_YELLOWING,
    patterns: [
      /पिवळ/i, /पीला/i, /पीली/i, /yellow/i,
      /पाने?\s*पिवळ/i, /पत्ते?\s*पीले/i, /पत्ती?\s*पीली/i
    ]
  },
  {
    key: CrossCropSymptomKey.LEAF_DRYING,
    patterns: [
      /वाळ/i, /सुक/i, /सूख/i, /dry/i, /dried/i,
      /करपल/i, /जळ/i, /झुलस/i
    ]
  },
  {
    key: CrossCropSymptomKey.LEAF_SPOTS,
    patterns: [
      /ठिपके/i, /डाग/i, /धब्ब/i, /spot/i, /spots/i,
      /चट्टे/i, /दाग/i
    ]
  },
  {
    key: CrossCropSymptomKey.LEAF_HOLES,
    patterns: [
      /छिद्र/i, /भोक/i, /छेद/i, /hole/i, /holes/i,
      /खाल्ले/i, /खाए/i, /eaten/i
    ]
  },
  {
    key: CrossCropSymptomKey.LEAF_CURLING,
    patterns: [
      /गुंड/i, /मुड/i, /वळ/i, /curl/i, /curling/i, /curled/i,
      /गोल/i, /twisted/i
    ]
  },
  {
    key: CrossCropSymptomKey.LEAF_WILTING,
    patterns: [
      /लोंब/i, /मुरझ/i, /wilt/i, /wilting/i, /drooping/i,
      /झुक/i, /लटक/i
    ]
  },
  {
    key: CrossCropSymptomKey.LEAF_BROWNING,
    patterns: [
      /तपकिर/i, /भूर/i, /brown/i, /browning/i,
      /काळ/i, /काला/i, /black/i
    ]
  },
  {
    key: CrossCropSymptomKey.LEAF_EDGES_BURN,
    patterns: [
      /कडा?\s*(जळ|करप|वाळ)/i, /किनार/i, /edge.*burn/i,
      /margin.*brown/i, /tip.*burn/i
    ]
  },
  {
    key: CrossCropSymptomKey.LEAF_DROPPING,
    patterns: [
      /गळ/i, /गिर/i, /dropping/i, /falling/i,
      /पान.*गळ/i, /पत्त.*गिर/i
    ]
  },
  {
    key: CrossCropSymptomKey.LEAF_STICKY,
    patterns: [
      /चिकट/i, /चिपचिप/i, /sticky/i,
      /चिपक/i, /चिकन/i
    ]
  },
  {
    key: CrossCropSymptomKey.LEAF_POWDER_COATING,
    patterns: [
      /पावडर/i, /भुसा/i, /powder/i, /dusty/i,
      /सफेद\s*पाउडर/i, /white.*powder/i
    ]
  },
  
  // STEM SYMPTOMS
  {
    key: CrossCropSymptomKey.STEM_WEAKENING,
    patterns: [
      /खोड.*कमजोर/i, /देठ.*कमजोर/i, /तना.*कमजोर/i,
      /stem.*weak/i, /stalk.*weak/i
    ]
  },
  {
    key: CrossCropSymptomKey.STEM_BREAKAGE,
    patterns: [
      /खोड.*तुट/i, /देठ.*तुट/i, /तना.*टूट/i,
      /stem.*break/i, /stem.*broken/i, /lodging/i
    ]
  },
  {
    key: CrossCropSymptomKey.STEM_DISCOLORATION,
    patterns: [
      /खोड.*रंग/i, /देठ.*रंग/i, /तना.*रंग/i,
      /stem.*color/i, /stalk.*brown/i
    ]
  },
  {
    key: CrossCropSymptomKey.STEM_HOLES,
    patterns: [
      /खोड.*छिद्र/i, /खोड.*भोक/i, /देठ.*छेद/i, /तना.*छेद/i,
      /stem.*hole/i, /bored/i, /boring/i
    ]
  },
  {
    key: CrossCropSymptomKey.STEM_FRASS_VISIBLE,
    patterns: [
      /भुसा/i, /frass/i, /sawdust/i,
      /खोड.*भुसा/i, /तना.*भुसा/i
    ]
  },
  
  // ROOT SYMPTOMS
  {
    key: CrossCropSymptomKey.ROOT_DAMAGE_VISIBLE,
    patterns: [
      /मूळ.*खराब/i, /जड.*खराब/i, /root.*damage/i,
      /मूळ.*कापल/i, /जड.*कट/i
    ]
  },
  {
    key: CrossCropSymptomKey.ROOT_ROTTING,
    patterns: [
      /मूळ.*कुज/i, /जड.*सड/i, /root.*rot/i,
      /मूळ.*सड/i
    ]
  },
  
  // INSECT OBSERVATIONS
  {
    key: CrossCropSymptomKey.SMALL_INSECTS_VISIBLE,
    patterns: [
      /छोट.*किड/i, /छोटे.*कीड/i, /small.*insect/i,
      /लहान.*किड/i, /tiny.*bug/i
    ]
  },
  {
    key: CrossCropSymptomKey.LARGE_INSECTS_VISIBLE,
    patterns: [
      /मोठ.*किड/i, /बड.*कीड/i, /large.*insect/i,
      /big.*bug/i
    ]
  },
  {
    key: CrossCropSymptomKey.FLYING_INSECTS_VISIBLE,
    patterns: [
      /उडणार/i, /उड.*किड/i, /उड.*कीड/i, /flying/i,
      /माश/i, /मक्खी/i, /fly/i, /flies/i
    ]
  },
  {
    key: CrossCropSymptomKey.CRAWLING_INSECTS_VISIBLE,
    patterns: [
      /रांगणार/i, /रेंगन/i, /crawling/i,
      /चालणार/i, /चलन/i
    ]
  },
  {
    key: CrossCropSymptomKey.LARVAE_VISIBLE,
    patterns: [
      /अळी/i, /अल्या/i, /इल्ली/i, /larvae/i, /larva/i,
      /सुरवंट/i, /caterpillar/i, /worm/i
    ]
  },
  {
    key: CrossCropSymptomKey.WEBBING_VISIBLE,
    patterns: [
      /जाळ/i, /जाला/i, /web/i, /webbing/i,
      /कोळ.*जाळ/i, /spider.*web/i
    ]
  },
  
  // GROWTH ABNORMALITIES
  {
    key: CrossCropSymptomKey.STUNTED_GROWTH,
    patterns: [
      /खुंट/i, /बौन/i, /stunted/i, /dwarf/i,
      /वाढ.*थांब/i, /बढ़.*रुक/i, /growth.*stop/i
    ]
  },
  {
    key: CrossCropSymptomKey.PATCHY_GROWTH,
    patterns: [
      /ठिकठिकाण/i, /जगह.*जगह/i, /patchy/i,
      /असमान/i, /uneven/i, /gaps?/i, /गॅप/i, /गैप/i,
      // PHASE-14: Add germination/stand failure patterns
      /काही.*ठिकाणी.*मेल/i, /कहीं.*मर/i, /some.*died/i,
      /उगवण.*कमी/i, /अंकुरण.*कम/i, /poor.*germination/i,
      /काही.*मेले/i, /कुछ.*मर.*गए/i
    ]
  },
  {
    key: CrossCropSymptomKey.UNEVEN_HEIGHT,
    patterns: [
      /उंची.*असमान/i, /ऊंचाई.*अलग/i, /uneven.*height/i,
      /विषम.*वाढ/i
    ]
  },
  
  // PHASE-14: PLANT DEATH / STAND FAILURE SYMPTOMS
  {
    key: CrossCropSymptomKey.PLANT_DEATH,
    patterns: [
      /मेल/i, /मर/i, /died/i, /dead/i, /death/i,
      /मरण/i, /मर.*गय/i, /मर.*गेल/i,
      /नाही.*उगवल/i, /उगवला.*नाही/i, /not.*germinating/i,
      /वाळून.*गेल/i, /सूख.*गय/i, /completely.*dried/i
    ]
  },
  {
    key: CrossCropSymptomKey.SEEDLING_DEATH,
    patterns: [
      /नवीन.*मेल/i, /नवी.*रोप.*मेल/i, /new.*seedling.*died/i,
      /रोप.*मेल/i, /पौध.*मर.*गय/i, /seedling.*died/i,
      /लहान.*मेल/i, /छोट.*मर.*गय/i
    ]
  },
  {
    key: CrossCropSymptomKey.GERMINATION_FAILURE,
    patterns: [
      /उगव.*नाही/i, /उगला.*नहीं/i, /not.*germinated/i,
      /उगलाच.*नाही/i, /बिल्कुल.*उगा.*नहीं/i, /no.*germination/i
    ]
  },
  {
    key: CrossCropSymptomKey.OVERALL_WEAK,
    patterns: [
      /कमजोर/i, /कमज़ोर/i, /weak/i,
      /अशक्त/i, /थक/i
    ]
  },
  
  // DISTRIBUTION PATTERNS
  {
    key: CrossCropSymptomKey.AFFECTED_PATCHES,
    patterns: [
      /ठिकठिकाण/i, /जगह.*जगह/i, /patches/i, /patchy/i,
      /काही.*ठिकाणी/i, /कहीं.*कहीं/i,
      // PHASE-14: More patterns for patchy distribution
      /जागोजागी/i, /इधर.*उधर/i, /scattered/i,
      /काही.*झाड/i, /कुछ.*पौध/i, /some.*plants/i
    ]
  },
  {
    key: CrossCropSymptomKey.AFFECTED_EDGES,
    patterns: [
      /कडे/i, /किनार/i, /edge/i, /border/i,
      /बाजू/i, /side/i
    ]
  },
  {
    key: CrossCropSymptomKey.UNIFORM_DAMAGE,
    patterns: [
      /सगळीकडे/i, /हर.*जगह/i, /everywhere/i, /uniform/i,
      /सर्वत्र/i, /all.*over/i
    ]
  },
  {
    key: CrossCropSymptomKey.SPREADING_PATTERN,
    patterns: [
      /पसर/i, /फैल/i, /spreading/i, /spread/i,
      /वाढत/i, /बढ़त/i
    ]
  },
  
  // GENERAL CONDITIONS (Note: OVERALL_WEAK is defined in PHASE-14 section above)
  {
    key: CrossCropSymptomKey.HONEYDEW_PRESENT,
    patterns: [
      /चिकट.*द्रव/i, /चिपचिप/i, /honeydew/i,
      /मध.*सारख/i, /मीठा.*पानी/i
    ]
  },
  {
    key: CrossCropSymptomKey.FRUIT_DAMAGE,
    patterns: [
      /फळ.*खराब/i, /फल.*खराब/i, /fruit.*damage/i,
      /बोंड.*खराब/i, /बॉल.*खराब/i
    ]
  },
  {
    key: CrossCropSymptomKey.FLOWER_DAMAGE,
    patterns: [
      /फूल.*खराब/i, /फुल.*खराब/i, /flower.*damage/i,
      /फुलोरा.*खराब/i
    ]
  }
];

// MAIN MAPPING FUNCTION

export interface CrossCropMappingResult {
  symptoms: Set<CrossCropSymptomKey>;
  symptom_count: number;
  patterns_matched: string[];
  mapping_source: 'CROSS_CROP_SYMPTOM_MAPPER';
}

// Map raw symptom text to CrossCropSymptomKeys.
export function mapToCrossCropSymptoms(
  rawSymptoms: string[]
): CrossCropMappingResult {
  const symptoms = new Set<CrossCropSymptomKey>();
  const patternsMatched: string[] = [];
  
  // Combine all symptoms into one searchable string
  const combinedText = rawSymptoms.join(' ').toLowerCase();
  
  // Check each symptom pattern
  for (const symptomPattern of SYMPTOM_PATTERNS) {
    for (const pattern of symptomPattern.patterns) {
      if (pattern.test(combinedText)) {
        symptoms.add(symptomPattern.key);
        patternsMatched.push(`${symptomPattern.key}:${pattern.source}`);
        break; // Move to next symptom type once matched
      }
    }
  }
  
  // Also check individual symptom strings
  for (const rawSymptom of rawSymptoms) {
    const symptomLower = rawSymptom.toLowerCase();
    
    for (const symptomPattern of SYMPTOM_PATTERNS) {
      if (symptoms.has(symptomPattern.key)) continue; // Already matched
      
      for (const pattern of symptomPattern.patterns) {
        if (pattern.test(symptomLower)) {
          symptoms.add(symptomPattern.key);
          patternsMatched.push(`${symptomPattern.key}:${pattern.source}`);
          break;
        }
      }
    }
  }
  
  return {
    symptoms,
    symptom_count: symptoms.size,
    patterns_matched: patternsMatched,
    mapping_source: 'CROSS_CROP_SYMPTOM_MAPPER'
  };
}

// Quick check if any symptoms were detected
export function hasCrossCropSymptoms(result: CrossCropMappingResult): boolean {
  return result.symptom_count > 0;
}

// Get symptoms by category
export function getSymptomsByCategory(
  symptoms: Set<CrossCropSymptomKey>
): Record<string, CrossCropSymptomKey[]> {
  const categories: Record<string, CrossCropSymptomKey[]> = {
    LEAF: [],
    STEM: [],
    ROOT: [],
    INSECT: [],
    GROWTH: [],
    DISTRIBUTION: [],
    GENERAL: []
  };
  
  for (const symptom of symptoms) {
    if (symptom.startsWith('LEAF_')) categories.LEAF.push(symptom);
    else if (symptom.startsWith('STEM_')) categories.STEM.push(symptom);
    else if (symptom.startsWith('ROOT_')) categories.ROOT.push(symptom);
    else if (symptom.includes('INSECTS') || symptom.includes('LARVAE') || 
             symptom.includes('WEBBING')) categories.INSECT.push(symptom);
    else if (symptom.includes('GROWTH') || symptom.includes('HEIGHT')) categories.GROWTH.push(symptom);
    else if (symptom.includes('AFFECTED') || symptom.includes('UNIFORM') || 
             symptom.includes('SPREADING')) categories.DISTRIBUTION.push(symptom);
    else categories.GENERAL.push(symptom);
  }
  
  return categories;
}

export default {
  mapToCrossCropSymptoms,
  hasCrossCropSymptoms,
  getSymptomsByCategory,
  CROSS_CROP_SYMPTOM_MAPPER_VERSION
};
