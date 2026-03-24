/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYMPTOM PATTERN RECOGNIZER - Multi-Cause Analysis Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL: This module recognizes farmer-described symptoms and maps them
 * to MULTIPLE possible causes with differentiation logic.
 * 
 * Example: "ऊसाची मधली सुरळी वाळली आहे" (central whorl dried in sugarcane)
 * Could be:
 * 1. Early Shoot Borer (ESB) - if crop < 120 days, dead heart pulls out easily
 * 2. Top Borer - if crop 90-180 days, bunchy top visible
 * 3. Water Stress - if soil moisture low, affects whole plant
 * 
 * This module:
 * 1. Detects symptoms in farmer's natural language (multilingual)
 * 2. Maps to MULTIPLE possible causes with confidence scores
 * 3. Uses contextual factors (crop stage, weather, soil) to prioritize
 * 4. Generates follow-up questions when disambiguation needed
 * 
 * NON-NEGOTIABLE: All mappings based on ICAR scientific literature
 */

import { Cause, CropStage } from '@/decision-graph/types-only';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface SymptomMatch {
  symptom_id: string;
  symptom_name: string;
  matched_text: string;
  language: string;
}

export interface PossibleCause {
  cause: Cause;
  cause_name: string;
  probability: number; // 0-1 based on symptom match + context
  scientific_basis: string;
  rule_id?: string; // Links to sugarcane.ts rule
  differentiating_factors: string[];
  additional_symptoms_to_check: string[];
}

export interface SymptomContext {
  cropCode?: string;
  cropStage?: CropStage;
  daysAfterSowing?: number;
  soilMoisture?: number;
  hasVisualConfirmation?: boolean;
}

export interface SymptomAnalysis {
  detected_symptoms: SymptomMatch[];
  possible_causes: PossibleCause[];
  primary_cause: PossibleCause | null;
  needs_disambiguation: boolean;
  disambiguation_questions: string[];
  context_used: SymptomContext;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYMPTOM PATTERNS DATABASE (Multi-language)
// ═══════════════════════════════════════════════════════════════════════════

interface SymptomPattern {
  id: string;
  name: {
    en: string;
    hi: string;
    mr: string;
  };
  patterns: {
    en: string[];
    hi: string[];
    mr: string[];
  };
  possible_causes: {
    cause: Cause;
    cause_name: string;
    base_probability: number;
    scientific_source: string;
    stage_applicable?: CropStage[];
    days_range?: { min: number; max: number };
    soil_moisture_condition?: 'dry' | 'wet' | 'any';
    differentiating_signs: string[];
    follow_up_check: string[];
  }[];
  crop_codes: string[];
}

/**
 * Master symptom patterns database
 * Each symptom can map to MULTIPLE causes with scientific differentiation
 */
const SYMPTOM_PATTERNS: SymptomPattern[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // SUGARCANE DEAD HEART / WHORL DRYING SYMPTOMS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'SC_DEAD_HEART',
    name: {
      en: 'Dead Heart / Central Whorl Drying',
      hi: 'गभ सुख / मध्य पत्ती सूखना',
      mr: 'मधली सुरळी वाळणे / गाभा मरणे'
    },
    patterns: {
      en: [
        'dead heart', 'central whorl', 'whorl drying', 'heart drying',
        'middle leaves drying', 'center dying', 'spindle drying',
        'dried spindle', 'dead center'
      ],
      hi: [
        'गभ सुख', 'बीच की पत्ती सूख', 'मध्य पत्ती सूख', 'गोभ सुख',
        'बीच वाला पत्ता', 'गाभा सुख', 'मधला पत्ता सुख', 'पत्ते सुख'
      ],
      mr: [
        'मधली सुरळी', 'सुरळी वाळ', 'गाभा मेला', 'मधले पान वाळ',
        'सुरळी सुक', 'गाभा वाळ', 'मधला भाग वाळ', 'मधले पान सुक',
        'मधली पाने वाळ', 'गाभा सुकल', 'सुरळी मेली'
      ]
    },
    possible_causes: [
      {
        cause: Cause.SHOOT_BORER_RISK,
        cause_name: 'Early Shoot Borer (Chilo infuscatellus)',
        base_probability: 0.45,
        scientific_source: 'ICAR-SBI Coimbatore - Sugarcane PoP 2024',
        stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
        days_range: { min: 30, max: 120 },
        soil_moisture_condition: 'any',
        differentiating_signs: [
          'Dead heart easily pulls out when tugged',
          'Rotten smell from pulled dead heart',
          'Bore hole visible at base of shoot near soil level',
          'Affects young shoots (1-3 months old)',
          'Scattered pattern in field (not in patches)'
        ],
        follow_up_check: [
          'मधली सुरळी ओढल्यावर सहज निघते का?',
          'बुंध्याजवळ छिद्र दिसते का?',
          'कुजलेला वास येतो का?'
        ]
      },
      {
        cause: Cause.STEM_BORER_RISK,
        cause_name: 'Top Borer (Scirpophaga excerptalis)',
        base_probability: 0.35,
        scientific_source: 'ICAR-SBI - Sugarcane PoP 2024',
        stage_applicable: [CropStage.VEGETATIVE],
        days_range: { min: 90, max: 200 },
        soil_moisture_condition: 'any',
        differentiating_signs: [
          'Bunchy top appearance - many side shoots',
          'Dead heart in older/taller canes (3-6 months)',
          'Bore hole higher up on the stem',
          'Multiple tillers become bushy',
          'Peak during monsoon season (July-September)'
        ],
        follow_up_check: [
          'ऊसाला खूप फुटवे आले आहेत का?',
          'ऊस 3-6 महिन्याचा आहे का?',
          'पावसाळ्यात समस्या आली का?'
        ]
      },
      {
        cause: Cause.WATER_STRESS_CRITICAL,
        cause_name: 'Water Stress / Drought',
        base_probability: 0.20,
        scientific_source: 'ICAR-SBI - Water Management Guidelines',
        stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
        days_range: { min: 0, max: 365 },
        soil_moisture_condition: 'dry',
        differentiating_signs: [
          'Whole plant affected, not just central whorl',
          'Outer leaves also wilting/rolling',
          'Soil is visibly dry and cracked',
          'Affects plants in patches where drainage is poor',
          'No bore holes visible',
          'Dead heart does NOT pull out easily'
        ],
        follow_up_check: [
          'सगळी पाने वाळली आहेत का फक्त मधलीच?',
          'जमीन कोरडी आहे का?',
          'किती दिवसांपूर्वी पाणी दिले?'
        ]
      }
    ],
    crop_codes: ['sugarcane', 'ऊस', 'गन्ना']
  },

  // ═══════════════════════════════════════════════════════════════════════
  // YELLOWING LEAVES - Multiple crops
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'LEAF_YELLOWING',
    name: {
      en: 'Leaf Yellowing',
      hi: 'पत्ते पीले पड़ना',
      mr: 'पाने पिवळी होणे'
    },
    patterns: {
      en: [
        'yellow leaves', 'yellowing', 'leaves turning yellow',
        'pale leaves', 'chlorosis', 'yellow tips', 'fading green'
      ],
      hi: [
        'पत्ते पीले', 'पत्ता पीला', 'पीला पड़', 'पत्ते पीले हो',
        'हरा रंग जा', 'पीलापन', 'निचले पत्ते पीले'
      ],
      mr: [
        'पाने पिवळी', 'पान पिवळे', 'पिवळी पडत', 'हिरवा रंग जात',
        'खालची पाने पिवळी', 'पिवळेपणा', 'पाने पिवळसर'
      ]
    },
    possible_causes: [
      {
        cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
        cause_name: 'Nitrogen Deficiency',
        base_probability: 0.50,
        scientific_source: 'ICAR Soil Testing Standards',
        stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
        differentiating_signs: [
          'Lower/older leaves yellow first',
          'Yellowing moves upward over time',
          'Stunted plant growth',
          'Uniform yellowing across leaves'
        ],
        follow_up_check: [
          'खालची पाने आधी पिवळी झाली का?',
          'झाड लहान राहिले आहे का?'
        ]
      },
      {
        cause: Cause.MICRONUTRIENT_DEFICIENCY,
        cause_name: 'Iron Deficiency (Lime-induced chlorosis)',
        base_probability: 0.25,
        scientific_source: 'ICAR Micronutrient Guidelines',
        stage_applicable: [CropStage.VEGETATIVE],
        differentiating_signs: [
          'Young/new leaves yellow first',
          'Veins remain green (interveinal chlorosis)',
          'Common in alkaline/calcareous soils',
          'pH > 7.5'
        ],
        follow_up_check: [
          'नवीन पाने आधी पिवळी झाली का?',
          'शिरा हिरव्या आहेत पण बाकी भाग पिवळा आहे का?'
        ]
      },
      {
        cause: Cause.WATERLOGGING,
        cause_name: 'Waterlogging / Root Damage',
        base_probability: 0.15,
        scientific_source: 'ICAR Drainage Guidelines',
        soil_moisture_condition: 'wet',
        differentiating_signs: [
          'Happens after heavy rain or over-irrigation',
          'Soil is waterlogged/muddy',
          'Roots may be rotting',
          'Whole plant looks sick'
        ],
        follow_up_check: [
          'जास्त पाऊस पडला का?',
          'जमिनीत पाणी साचले आहे का?'
        ]
      },
      {
        cause: Cause.VIRAL_DISEASE_RISK,
        cause_name: 'Yellow Leaf Disease (Sugarcane)',
        base_probability: 0.10,
        scientific_source: 'ICAR-SBI Disease Management',
        stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
        differentiating_signs: [
          'Midrib yellowing characteristic',
          'Yellowing starts from midrib outward',
          'Transmitted by aphids',
          'Specific to sugarcane'
        ],
        follow_up_check: [
          'मधली शीर आधी पिवळी झाली का?',
          'माव किडे दिसले का?'
        ]
      }
    ],
    crop_codes: ['sugarcane', 'wheat', 'rice', 'maize', 'cotton', 'soybean']
  },

  // ═══════════════════════════════════════════════════════════════════════
  // LEAF ROLLING / WILTING
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'LEAF_ROLLING',
    name: {
      en: 'Leaf Rolling / Wilting',
      hi: 'पत्ते मुड़ना / मुरझाना',
      mr: 'पाने गुंडाळणे / कोमेजणे'
    },
    patterns: {
      en: [
        'leaves rolling', 'leaf roll', 'wilting', 'leaves drooping',
        'curling leaves', 'leaves fold', 'plant wilting', 'droopy'
      ],
      hi: [
        'पत्ते मुड़', 'पत्ता मुरझा', 'पौधा मुरझा', 'पत्ते लटक',
        'पत्ते गोल हो', 'कोमेज', 'सूख', 'मुरझा'
      ],
      mr: [
        'पाने गुंडाळ', 'पान गुंडाळ', 'कोमेज', 'पाने लोंबत',
        'पाने वळ', 'मर रोग', 'सुक', 'कोमेजत'
      ]
    },
    possible_causes: [
      {
        cause: Cause.WATER_STRESS_CRITICAL,
        cause_name: 'Water Stress',
        base_probability: 0.55,
        scientific_source: 'ICAR Water Management',
        soil_moisture_condition: 'dry',
        differentiating_signs: [
          'Soil is dry',
          'Happens during hot afternoon',
          'Recovers by morning if stress is mild',
          'All plants affected uniformly'
        ],
        follow_up_check: [
          'जमीन कोरडी आहे का?',
          'सकाळी झाड बरे दिसते का?'
        ]
      },
      {
        cause: Cause.ROOT_ROT_RISK,
        cause_name: 'Wilt Disease (Fusarium)',
        base_probability: 0.25,
        scientific_source: 'ICAR Plant Pathology',
        stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
        differentiating_signs: [
          'Wilting is permanent (doesn\'t recover)',
          'Starts from one side/branch',
          'Vascular browning visible in stem cross-section',
          'Scattered plants affected (not uniform)'
        ],
        follow_up_check: [
          'फांदी कापून बघितली तर आतून तपकिरी दिसते का?',
          'काही झाडे ठीक आहेत का?'
        ]
      },
      {
        cause: Cause.STEM_BORER_RISK,
        cause_name: 'Borer Attack (Internal damage)',
        base_probability: 0.20,
        scientific_source: 'ICAR Entomology',
        differentiating_signs: [
          'Bore holes visible on stem',
          'Frass (sawdust-like material) near holes',
          'Wilting sudden in some tillers',
          'Dead heart symptom may accompany'
        ],
        follow_up_check: [
          'खोडावर छिद्रे दिसतात का?',
          'भुसा बाहेर आला आहे का?'
        ]
      }
    ],
    crop_codes: ['sugarcane', 'cotton', 'tomato', 'chilli', 'brinjal']
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SPOTS ON LEAVES
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'LEAF_SPOTS',
    name: {
      en: 'Spots on Leaves',
      hi: 'पत्तों पर धब्बे',
      mr: 'पानांवर डाग'
    },
    patterns: {
      en: [
        'spots', 'leaf spots', 'brown spots', 'black spots',
        'patches', 'lesions', 'blight', 'rust spots'
      ],
      hi: [
        'धब्बे', 'पत्तों पर धब्बे', 'काले धब्बे', 'भूरे धब्बे',
        'दाग', 'करपा', 'तांबेरा'
      ],
      mr: [
        'डाग', 'पानांवर डाग', 'काळे डाग', 'तपकिरी डाग',
        'करपा', 'तांबेरा', 'बुरशी'
      ]
    },
    possible_causes: [
      {
        cause: Cause.FUNGAL_DISEASE_RISK,
        cause_name: 'Fungal Leaf Spot',
        base_probability: 0.50,
        scientific_source: 'ICAR Plant Pathology',
        differentiating_signs: [
          'Circular spots with defined margins',
          'May have concentric rings',
          'Spreads during humid weather',
          'May have fungal growth visible'
        ],
        follow_up_check: [
          'डाग गोल आहेत का?',
          'आर्द्रतेत जास्त पसरले का?'
        ]
      },
      {
        cause: Cause.BACTERIAL_WILT_RISK,
        cause_name: 'Bacterial Leaf Spot',
        base_probability: 0.25,
        scientific_source: 'ICAR Bacteriology',
        differentiating_signs: [
          'Water-soaked appearance initially',
          'Angular spots (follow veins)',
          'Yellow halo around spots',
          'Oily appearance when wet'
        ],
        follow_up_check: [
          'डागाभोवती पिवळा भाग दिसतो का?',
          'भिजल्यावर तेलकट दिसते का?'
        ]
      },
      {
        cause: Cause.RUST_RISK,
        cause_name: 'Rust Disease',
        base_probability: 0.25,
        scientific_source: 'ICAR Rust Management',
        differentiating_signs: [
          'Orange/rust colored pustules',
          'Powdery spores visible',
          'Underside of leaf affected',
          'Spreads rapidly in humid conditions'
        ],
        follow_up_check: [
          'डाग तांबूस/नारंगी रंगाचे आहेत का?',
          'पानाच्या खालच्या बाजूला पावडर दिसते का?'
        ]
      }
    ],
    crop_codes: ['wheat', 'rice', 'sugarcane', 'groundnut', 'soybean', 'cotton', 'maize', 'tomato', 'onion', 'potato', 'gram', 'mustard', 'chilli', 'brinjal']
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STUNTED GROWTH / NOT GROWING
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'STUNTED_GROWTH',
    name: {
      en: 'Stunted Growth / Not Growing',
      hi: 'विकास रुक गया / बढ़ नहीं रहा',
      mr: 'वाढ थांबली / वाढत नाही'
    },
    patterns: {
      en: [
        'not growing', 'stunted', 'slow growth', 'poor growth', 'no growth',
        'not developing', 'small plants', 'dwarf', 'weak plants'
      ],
      hi: [
        'बढ़ नहीं', 'वाढ नहीं', 'विकास नहीं', 'छोटा रह गया', 'कमजोर',
        'धीमा विकास', 'नहीं हो रहा', 'रुक गया', 'पौधे छोटे'
      ],
      mr: [
        'वाढत नाही', 'वाढ नाही', 'वाढ थांबली', 'होत नाही', 'लहान राहिले',
        'कमकुवत', 'मंद वाढ', 'थांबले', 'झाडे लहान'
      ]
    },
    possible_causes: [
      {
        cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
        cause_name: 'Nitrogen Deficiency',
        base_probability: 0.40,
        scientific_source: 'ICAR Soil Fertility Guidelines',
        stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
        differentiating_signs: [
          'Lower leaves yellow first',
          'Overall pale green color',
          'Thin and weak stems',
          'Reduced tillering in cereals'
        ],
        follow_up_check: [
          'खालची पाने पिवळी आहेत का?',
          'संपूर्ण झाड फिके हिरवे दिसते का?'
        ]
      },
      {
        cause: Cause.PHOSPHORUS_DEFICIENCY,
        cause_name: 'Phosphorus Deficiency',
        base_probability: 0.30,
        scientific_source: 'ICAR Phosphorus Management',
        stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
        differentiating_signs: [
          'Purple/red discoloration on leaves',
          'Dark green older leaves',
          'Poor root development',
          'Delayed maturity'
        ],
        follow_up_check: [
          'पानांवर जांभळा/लाल रंग दिसतो का?',
          'मुळे कमकुवत आहेत का?'
        ]
      },
      {
        cause: Cause.ROOT_ROT_RISK,
        cause_name: 'Root Damage / Rot',
        base_probability: 0.20,
        scientific_source: 'ICAR Plant Pathology',
        soil_moisture_condition: 'wet',
        differentiating_signs: [
          'Plant pulls out easily',
          'Roots brown/black and rotten',
          'Waterlogged soil conditions',
          'Foul smell from roots'
        ],
        follow_up_check: [
          'झाड सहज उपटते का?',
          'मुळे काळी/तपकिरी आहेत का?'
        ]
      },
      {
        cause: Cause.PEST_GENERAL_RISK,
        cause_name: 'Nematode Damage',
        base_probability: 0.10,
        scientific_source: 'ICAR Nematology',
        differentiating_signs: [
          'Galls/knots on roots',
          'Patchy stunting in field',
          'Root system looks knotty',
          'Problem recurs yearly'
        ],
        follow_up_check: [
          'मुळांवर गाठी दिसतात का?',
          'ही समस्या दर वर्षी येते का?'
        ]
      }
    ],
    crop_codes: ['wheat', 'rice', 'maize', 'sugarcane', 'cotton', 'soybean', 'gram', 'groundnut', 'tomato', 'onion', 'potato', 'chilli', 'brinjal']
  },

  // ═══════════════════════════════════════════════════════════════════════
  // HOLES IN LEAVES / INSECT DAMAGE
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'LEAF_HOLES',
    name: {
      en: 'Holes in Leaves / Eaten Leaves',
      hi: 'पत्तों में छेद / पत्ते खाए',
      mr: 'पानांना भोके / पाने खाल्ली'
    },
    patterns: {
      en: [
        'holes', 'eaten leaves', 'caterpillar', 'worm eating',
        'insects eating', 'leaf damage', 'bites', 'chewed leaves'
      ],
      hi: [
        'छेद', 'पत्ते खा', 'इल्ली', 'कीड़े खा', 'सुंडी',
        'पत्ते कट', 'कीड़ा लगा'
      ],
      mr: [
        'भोके', 'पाने खात', 'अळी', 'किडे खात', 'सुंडी',
        'पाने कट', 'किडा लाग'
      ]
    },
    possible_causes: [
      {
        cause: Cause.POD_BORER_RISK,
        cause_name: 'Caterpillar / Larvae Attack',
        base_probability: 0.50,
        scientific_source: 'ICAR Entomology',
        differentiating_signs: [
          'Irregular holes in leaves',
          'Caterpillars/larvae visible',
          'Frass (droppings) present',
          'Active feeding at night'
        ],
        follow_up_check: [
          'अळी दिसली का?',
          'रात्री जास्त नुकसान होते का?'
        ]
      },
      {
        cause: Cause.PEST_GENERAL_RISK,
        cause_name: 'Grasshopper / Locust',
        base_probability: 0.25,
        scientific_source: 'ICAR Locust Management',
        differentiating_signs: [
          'Large irregular bites',
          'Grasshoppers visible during day',
          'Severe during dry periods',
          'Defoliation can be rapid'
        ],
        follow_up_check: [
          'टोळ दिसले का?',
          'दिवसा नुकसान होते का?'
        ]
      },
      {
        cause: Cause.PEST_GENERAL_RISK,
        cause_name: 'Beetle Attack',
        base_probability: 0.25,
        scientific_source: 'ICAR Entomology',
        differentiating_signs: [
          'Beetles visible on leaves',
          'Shot-hole pattern (small round holes)',
          'May skeletonize leaves',
          'Adult beetles and grubs both damage'
        ],
        follow_up_check: [
          'गोल भोके पडली आहेत का?',
          'भुंगे दिसतात का?'
        ]
      }
    ],
    crop_codes: ['cotton', 'soybean', 'gram', 'vegetables']
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// SYMPTOM DETECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect symptoms in farmer's query
 */
function detectSymptoms(
  query: string,
  cropCode?: string
): SymptomMatch[] {
  const normalizedQuery = query.toLowerCase();
  const matches: SymptomMatch[] = [];
  
  for (const symptom of SYMPTOM_PATTERNS) {
    // Filter by crop if provided
    if (cropCode && !symptom.crop_codes.some(c => 
      c.toLowerCase() === cropCode.toLowerCase() || 
      normalizedQuery.includes(c.toLowerCase())
    )) {
      continue;
    }
    
    // Check patterns in all languages
    for (const [lang, patterns] of Object.entries(symptom.patterns)) {
      for (const pattern of patterns) {
        if (normalizedQuery.includes(pattern.toLowerCase())) {
          matches.push({
            symptom_id: symptom.id,
            symptom_name: symptom.name.en,
            matched_text: pattern,
            language: lang
          });
          break; // One match per language is enough
        }
      }
    }
  }
  
  return matches;
}

/**
 * Calculate cause probability based on context
 */
function calculateCauseProbability(
  baseProbability: number,
  causeConfig: SymptomPattern['possible_causes'][0],
  context: SymptomContext
): number {
  let adjustedProbability = baseProbability;
  
  // Stage match bonus
  if (causeConfig.stage_applicable && context.cropStage) {
    if (causeConfig.stage_applicable.includes(context.cropStage)) {
      adjustedProbability += 0.15; // +15% for stage match
    } else {
      adjustedProbability -= 0.10; // -10% for stage mismatch
    }
  }
  
  // Days after sowing match
  if (causeConfig.days_range && context.daysAfterSowing !== undefined) {
    const { min, max } = causeConfig.days_range;
    if (context.daysAfterSowing >= min && context.daysAfterSowing <= max) {
      adjustedProbability += 0.20; // +20% for perfect stage match
    } else if (context.daysAfterSowing < min - 15 || context.daysAfterSowing > max + 30) {
      adjustedProbability -= 0.25; // -25% for clear mismatch
    }
  }
  
  // Soil moisture condition match
  if (causeConfig.soil_moisture_condition && context.soilMoisture !== undefined) {
    const isDry = context.soilMoisture < 30;
    const isWet = context.soilMoisture > 80;
    
    if (causeConfig.soil_moisture_condition === 'dry' && isDry) {
      adjustedProbability += 0.20; // Water stress more likely when dry
    } else if (causeConfig.soil_moisture_condition === 'dry' && !isDry) {
      adjustedProbability -= 0.15; // Water stress less likely when not dry
    } else if (causeConfig.soil_moisture_condition === 'wet' && isWet) {
      adjustedProbability += 0.15;
    }
  }
  
  // Visual confirmation bonus
  if (context.hasVisualConfirmation) {
    adjustedProbability += 0.10; // +10% if we have image analysis
  }
  
  // Clamp to 0-1 range
  return Math.max(0.05, Math.min(0.95, adjustedProbability));
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SYMPTOM ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze farmer query for symptoms and determine possible causes
 * 
 * @param query - Farmer's question in any language
 * @param context - Land/crop context for better accuracy
 * @returns SymptomAnalysis with ranked causes and disambiguation questions
 */
export function analyzeSymptoms(
  query: string,
  context: SymptomContext = {}
): SymptomAnalysis {
  // Step 1: Detect symptoms in query
  const detectedSymptoms = detectSymptoms(query, context.cropCode);
  
  if (detectedSymptoms.length === 0) {
    return {
      detected_symptoms: [],
      possible_causes: [],
      primary_cause: null,
      needs_disambiguation: false,
      disambiguation_questions: [],
      context_used: context,
      confidence: 0
    };
  }
  
  // Step 2: Get all possible causes from matched symptoms
  const possibleCauses: PossibleCause[] = [];
  const processedSymptoms = new Set<string>();
  
  for (const match of detectedSymptoms) {
    if (processedSymptoms.has(match.symptom_id)) continue;
    processedSymptoms.add(match.symptom_id);
    
    const symptomPattern = SYMPTOM_PATTERNS.find(s => s.id === match.symptom_id);
    if (!symptomPattern) continue;
    
    for (const causeConfig of symptomPattern.possible_causes) {
      const probability = calculateCauseProbability(
        causeConfig.base_probability,
        causeConfig,
        context
      );
      
      possibleCauses.push({
        cause: causeConfig.cause,
        cause_name: causeConfig.cause_name,
        probability,
        scientific_basis: causeConfig.scientific_source,
        differentiating_factors: causeConfig.differentiating_signs,
        additional_symptoms_to_check: causeConfig.follow_up_check
      });
    }
  }
  
  // Step 3: Sort by probability
  possibleCauses.sort((a, b) => b.probability - a.probability);
  
  // Step 4: Determine if disambiguation is needed
  const topCause = possibleCauses[0];
  const secondCause = possibleCauses[1];
  
  const needsDisambiguation = topCause && secondCause && 
    (topCause.probability - secondCause.probability) < 0.20; // Within 20%
  
  // Step 5: Generate disambiguation questions
  const disambiguationQuestions: string[] = [];
  if (needsDisambiguation && possibleCauses.length >= 2) {
    // Collect unique follow-up questions from top 2 causes
    for (const cause of possibleCauses.slice(0, 2)) {
      for (const question of cause.additional_symptoms_to_check.slice(0, 2)) {
        if (!disambiguationQuestions.includes(question)) {
          disambiguationQuestions.push(question);
        }
      }
    }
  }
  
  // Step 6: Calculate overall confidence
  const confidence = topCause ? 
    Math.min(0.95, topCause.probability + 0.10) : // Boost slightly for having a match
    0;
  
  return {
    detected_symptoms: detectedSymptoms,
    possible_causes: possibleCauses,
    primary_cause: topCause || null,
    needs_disambiguation: needsDisambiguation,
    disambiguation_questions: disambiguationQuestions.slice(0, 3), // Max 3 questions
    context_used: context,
    confidence
  };
}

/**
 * Get symptom pattern by ID for detailed information
 */
export function getSymptomPatternById(symptomId: string): SymptomPattern | undefined {
  return SYMPTOM_PATTERNS.find(s => s.id === symptomId);
}

/**
 * Extract causes from symptom analysis for injection into Decision Brain
 */
export function extractCausesFromSymptoms(analysis: SymptomAnalysis): Cause[] {
  if (!analysis.possible_causes.length) return [];
  
  // Return causes with probability > 0.30
  return analysis.possible_causes
    .filter(c => c.probability > 0.30)
    .map(c => c.cause);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  SYMPTOM_PATTERNS,
  detectSymptoms,
  calculateCauseProbability
};
