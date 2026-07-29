// DIFFERENTIAL DIAGNOSIS CLARIFIER - LAYER 4: Scientific Clarification

// TYPE DEFINITIONS

export interface CompetingHypothesis {
  cause_code: string;
  cause_name: string;
  category: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'WEATHER' | 'OTHER';
  probability: number;
  supporting_symptoms: string[];
  ruling_out_symptoms: string[];
  key_differentiator: string;
}

export interface DifferentialQuestion {
  question_id: string;
  question_en: string;
  
  yes_indicates: {
    cause: string;
    confidence_boost: number;
  };
  no_indicates: {
    cause: string;
    confidence_boost: number;
  };
  
  visual_aid?: {
    image_url?: string;
    icon?: string;
    description: string;
  };
  
  information_gain: number;
}

export interface DifferentialClarificationResult {
  hypotheses: CompetingHypothesis[];
  best_question: DifferentialQuestion | null;
  alternative_questions: DifferentialQuestion[];
  photo_needed: boolean;
  photo_guidance?: {
    what_to_capture: string;
    angle: string;
    lighting: string;
  };
  max_questions_remaining: number;
}

export interface DifferentialClarificationInput {
  crop_code: string;
  growth_stage: string;
  symptoms: string[];
  ndvi_status?: 'HEALTHY' | 'STRESSED' | 'CRITICAL' | 'UNKNOWN';
  soil_status?: {
    n_status: 'LOW' | 'ADEQUATE' | 'HIGH';
    p_status: 'LOW' | 'ADEQUATE' | 'HIGH';
    k_status: 'LOW' | 'ADEQUATE' | 'HIGH';
  };
  recent_weather?: {
    recent_rain: boolean;
    humidity_high: boolean;
    temperature_extreme: boolean;
  };
  questions_asked: number;
  language: string;
}

// DIFFERENTIAL DIAGNOSIS PATTERNS

interface DifferentialPattern {
  primary_symptom: string;
  competing_causes: {
    cause_code: string;
    cause_name_en: string;
    category: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'WEATHER' | 'OTHER';
    base_probability: number;
    confirming_factors: string[];
    ruling_out_factors: string[];
  }[];
  differentiating_questions: {
    question_en: string;
    yes_supports: string;
    no_supports: string;
    information_gain: number;
  }[];
}

const DIFFERENTIAL_PATTERNS: Record<string, DifferentialPattern> = {
  'LEAF_YELLOWING': {
    primary_symptom: 'LEAF_YELLOWING',
    competing_causes: [
      {
        cause_code: 'NITROGEN_DEFICIENCY',
        cause_name_en: 'Nitrogen Deficiency',
        category: 'NUTRIENT',
        base_probability: 0.35,
        confirming_factors: ['lower_leaves_first', 'uniform_pattern', 'soil_n_low'],
        ruling_out_factors: ['upper_leaves_first', 'patchy_pattern', 'soil_n_adequate']
      },
      {
        cause_code: 'IRON_DEFICIENCY',
        cause_name_en: 'Iron Deficiency',
        category: 'NUTRIENT',
        base_probability: 0.25,
        confirming_factors: ['upper_leaves_first', 'interveinal_pattern', 'high_ph_soil'],
        ruling_out_factors: ['lower_leaves_first', 'uniform_yellowing', 'low_ph_soil']
      },
      {
        cause_code: 'WATER_STRESS',
        cause_name_en: 'Water Stress',
        category: 'WATER',
        base_probability: 0.25,
        confirming_factors: ['leaf_rolling', 'wilting_afternoon', 'no_recent_rain', 'ndvi_declining'],
        ruling_out_factors: ['recent_irrigation', 'high_humidity', 'waterlogging']
      },
      {
        cause_code: 'APHID_INFESTATION',
        cause_name_en: 'Aphid Infestation',
        category: 'PEST',
        base_probability: 0.15,
        confirming_factors: ['curled_leaves', 'sticky_residue', 'small_insects_visible'],
        ruling_out_factors: ['no_insects', 'uniform_pattern', 'dry_leaves']
      }
    ],
    differentiating_questions: [
      {
        question_en: 'Which leaves turned yellow first - lower (older) or upper (newer)?',
        yes_supports: 'NITROGEN_DEFICIENCY',
        no_supports: 'IRON_DEFICIENCY',
        information_gain: 0.85
      },
      {
        question_en: 'Are the leaf veins still green?',
        yes_supports: 'IRON_DEFICIENCY',
        no_supports: 'NITROGEN_DEFICIENCY',
        information_gain: 0.80
      },
      {
        question_en: 'Do you see sticky substance or small insects on leaves?',
        yes_supports: 'APHID_INFESTATION',
        no_supports: 'NITROGEN_DEFICIENCY',
        information_gain: 0.75
      },
      {
        question_en: 'Do leaves wilt in afternoon and recover in evening?',
        yes_supports: 'WATER_STRESS',
        no_supports: 'NITROGEN_DEFICIENCY',
        information_gain: 0.70
      }
    ]
  },
  
  'DEAD_HEART': {
    primary_symptom: 'DEAD_HEART',
    competing_causes: [
      {
        cause_code: 'STEM_BORER',
        cause_name_en: 'Stem Borer',
        category: 'PEST',
        base_probability: 0.50,
        confirming_factors: ['entry_hole_visible', 'frass_present', 'hollow_stem'],
        ruling_out_factors: ['no_hole', 'stem_solid']
      },
      {
        cause_code: 'TERMITE_DAMAGE',
        cause_name_en: 'Termite Damage',
        category: 'PEST',
        base_probability: 0.30,
        confirming_factors: ['soil_mud_tunnels', 'root_damage', 'multiple_plants'],
        ruling_out_factors: ['no_soil_disturbance', 'single_plant']
      },
      {
        cause_code: 'WATERLOGGING',
        cause_name_en: 'Waterlogging',
        category: 'WATER',
        base_probability: 0.20,
        confirming_factors: ['standing_water', 'root_rot_smell', 'low_lying_area'],
        ruling_out_factors: ['well_drained', 'no_water_accumulation']
      }
    ],
    differentiating_questions: [
      {
        question_en: 'Is there a hole in the stem? Is frass (sawdust-like material) coming out?',
        yes_supports: 'STEM_BORER',
        no_supports: 'TERMITE_DAMAGE',
        information_gain: 0.90
      },
      {
        question_en: 'Do you see white/brown mud tunnels in the soil?',
        yes_supports: 'TERMITE_DAMAGE',
        no_supports: 'STEM_BORER',
        information_gain: 0.85
      },
      {
        question_en: 'Is water standing in the field? Do roots smell rotten?',
        yes_supports: 'WATERLOGGING',
        no_supports: 'STEM_BORER',
        information_gain: 0.80
      }
    ]
  },
  
  'LEAF_SPOTS': {
    primary_symptom: 'LEAF_SPOTS',
    competing_causes: [
      {
        cause_code: 'FUNGAL_LEAF_SPOT',
        cause_name_en: 'Fungal Leaf Spot',
        category: 'DISEASE',
        base_probability: 0.45,
        confirming_factors: ['circular_spots', 'concentric_rings', 'high_humidity', 'recent_rain'],
        ruling_out_factors: ['dry_weather', 'irregular_shape']
      },
      {
        cause_code: 'BACTERIAL_LEAF_SPOT',
        cause_name_en: 'Bacterial Leaf Spot',
        category: 'DISEASE',
        base_probability: 0.30,
        confirming_factors: ['water_soaked_margins', 'angular_spots', 'yellowing_halo'],
        ruling_out_factors: ['dry_margins', 'circular_spots']
      },
      {
        cause_code: 'INSECT_FEEDING',
        cause_name_en: 'Insect Feeding Damage',
        category: 'PEST',
        base_probability: 0.25,
        confirming_factors: ['holes_in_spots', 'insects_visible', 'irregular_edges'],
        ruling_out_factors: ['no_holes', 'no_insects', 'smooth_edges']
      }
    ],
    differentiating_questions: [
      {
        question_en: 'Do the spots have a yellow halo around them?',
        yes_supports: 'BACTERIAL_LEAF_SPOT',
        no_supports: 'FUNGAL_LEAF_SPOT',
        information_gain: 0.80
      },
      {
        question_en: 'Do you see concentric rings (target pattern) in the spots?',
        yes_supports: 'FUNGAL_LEAF_SPOT',
        no_supports: 'BACTERIAL_LEAF_SPOT',
        information_gain: 0.75
      },
      {
        question_en: 'Are there holes in the spots? Do you see insects on leaves?',
        yes_supports: 'INSECT_FEEDING',
        no_supports: 'FUNGAL_LEAF_SPOT',
        information_gain: 0.70
      }
    ]
  },
  
  // SMALL_INSECTS - Generic insect detection (aphids, whiteflies, thrips, jassids)
  'SMALL_INSECTS': {
    primary_symptom: 'SMALL_INSECTS',
    competing_causes: [
      {
        cause_code: 'APHID',
        cause_name_en: 'Aphids',
        category: 'PEST',
        base_probability: 0.30,
        confirming_factors: ['green_black_color', 'sticky_honeydew', 'clustered', 'under_leaves'],
        ruling_out_factors: ['flying', 'jumping', 'white_color']
      },
      {
        cause_code: 'WHITEFLY',
        cause_name_en: 'Whitefly',
        category: 'PEST',
        base_probability: 0.25,
        confirming_factors: ['white_color', 'flying_when_disturbed', 'under_leaves'],
        ruling_out_factors: ['green_color', 'not_flying', 'sticky_substance']
      },
      {
        cause_code: 'JASSID',
        cause_name_en: 'Jassids/Leafhoppers',
        category: 'PEST',
        base_probability: 0.25,
        confirming_factors: ['green_wedge_shape', 'jumping', 'sideways_movement', 'leaf_curling'],
        ruling_out_factors: ['black_color', 'not_jumping', 'clustered']
      },
      {
        cause_code: 'THRIPS',
        cause_name_en: 'Thrips',
        category: 'PEST',
        base_probability: 0.20,
        confirming_factors: ['black_brown_color', 'elongated_tiny', 'silvery_damage', 'flower_damage'],
        ruling_out_factors: ['green_color', 'flying', 'round_body']
      }
    ],
    differentiating_questions: [
      {
        question_en: '🔍 What color are these insects?',
        yes_supports: 'APHID',
        no_supports: 'WHITEFLY',
        information_gain: 0.90
      },
      {
        question_en: 'Do they fly away when you touch the leaf?',
        yes_supports: 'WHITEFLY',
        no_supports: 'APHID',
        information_gain: 0.85
      },
      {
        question_en: 'Do you see sticky substance on leaves?',
        yes_supports: 'APHID',
        no_supports: 'THRIPS',
        information_gain: 0.80
      }
    ]
  },
  
  'PEST_PROBLEM': {
    primary_symptom: 'PEST_PROBLEM',
    competing_causes: [
      {
        cause_code: 'APHID',
        cause_name_en: 'Aphids',
        category: 'PEST',
        base_probability: 0.30,
        confirming_factors: ['green_black_color', 'sticky_honeydew', 'clustered'],
        ruling_out_factors: ['flying', 'jumping', 'white_color']
      },
      {
        cause_code: 'WHITEFLY',
        cause_name_en: 'Whitefly',
        category: 'PEST',
        base_probability: 0.25,
        confirming_factors: ['white_color', 'flying_when_disturbed'],
        ruling_out_factors: ['green_color', 'not_flying']
      },
      {
        cause_code: 'JASSID',
        cause_name_en: 'Jassids',
        category: 'PEST',
        base_probability: 0.25,
        confirming_factors: ['green_wedge_shape', 'jumping'],
        ruling_out_factors: ['black_color', 'not_jumping']
      },
      {
        cause_code: 'THRIPS',
        cause_name_en: 'Thrips',
        category: 'PEST',
        base_probability: 0.20,
        confirming_factors: ['black_brown_color', 'silvery_damage'],
        ruling_out_factors: ['green_color', 'flying']
      }
    ],
    differentiating_questions: [
      {
        question_en: '🔍 What color are these insects?',
        yes_supports: 'APHID',
        no_supports: 'WHITEFLY',
        information_gain: 0.90
      },
      {
        question_en: 'Do insects jump when disturbed?',
        yes_supports: 'JASSID',
        no_supports: 'APHID',
        information_gain: 0.85
      }
    ]
  }
};

// MAIN CLARIFICATION GENERATOR

export function generateDifferentialClarification(
  input: DifferentialClarificationInput
): DifferentialClarificationResult {
  console.log('🔬 [DifferentialClarifier] Generating hypothesis-testing questions...');
  console.log(`   Symptoms: ${input.symptoms.join(', ')}`);
  console.log(`   Questions asked so far: ${input.questions_asked}/3`);
  
  const maxQuestions = 3;
  const remainingQuestions = maxQuestions - input.questions_asked;
  
  if (remainingQuestions <= 0) {
    console.log('   ⚠️ Max questions reached - requesting photo');
    return {
      hypotheses: [],
      best_question: null,
      alternative_questions: [],
      photo_needed: true,
      photo_guidance: {
        what_to_capture: 'Affected leaves and stem clearly visible',
        angle: 'Close-up from 20-30cm distance',
        lighting: 'Natural daylight, avoid shadows'
      },
      max_questions_remaining: 0
    };
  }
  
  // Find matching differential pattern
  let matchedPattern: DifferentialPattern | null = null;
  
  for (const symptom of input.symptoms) {
    const pattern = DIFFERENTIAL_PATTERNS[symptom.toUpperCase()];
    if (pattern) {
      matchedPattern = pattern;
      break;
    }
  }
  
  if (!matchedPattern) {
    // No specific pattern - request photo
    console.log('   ⚠️ No differential pattern found - requesting photo');
    return {
      hypotheses: [],
      best_question: null,
      alternative_questions: [],
      photo_needed: true,
      photo_guidance: {
        what_to_capture: 'Affected area with symptoms clearly visible',
        angle: 'Multiple angles if possible',
        lighting: 'Natural daylight'
      },
      max_questions_remaining: remainingQuestions
    };
  }
  
  // Build hypotheses with adjusted probabilities
  const hypotheses: CompetingHypothesis[] = matchedPattern.competing_causes.map(cause => {
    let probability = cause.base_probability;
    
    // Adjust based on NDVI
    if (input.ndvi_status === 'STRESSED' && cause.category === 'WATER') {
      probability += 0.15;
    }
    if (input.ndvi_status === 'HEALTHY' && cause.category === 'NUTRIENT') {
      probability -= 0.10;
    }
    
    // Adjust based on soil
    if (input.soil_status?.n_status === 'LOW' && cause.cause_code === 'NITROGEN_DEFICIENCY') {
      probability += 0.20;
    }
    
    // Adjust based on weather
    if (input.recent_weather?.recent_rain && cause.category === 'DISEASE') {
      probability += 0.15;
    }
    if (input.recent_weather?.humidity_high && cause.category === 'DISEASE') {
      probability += 0.10;
    }
    
    return {
      cause_code: cause.cause_code,
      cause_name: cause.cause_name_en,
      category: cause.category,
      probability: Math.min(0.95, probability),
      supporting_symptoms: cause.confirming_factors,
      ruling_out_symptoms: cause.ruling_out_factors,
      key_differentiator: cause.confirming_factors[0] || 'visual_inspection'
    };
  }).sort((a, b) => b.probability - a.probability);
  
  // Generate questions sorted by information gain (English-only; LLM translates)
  const questions: DifferentialQuestion[] = matchedPattern.differentiating_questions.map((q, idx) => ({
    question_id: `diff_q_${idx}`,
    question_en: q.question_en,
    yes_indicates: {
      cause: q.yes_supports,
      confidence_boost: 0.25
    },
    no_indicates: {
      cause: q.no_supports,
      confidence_boost: 0.20
    },
    information_gain: q.information_gain
  })).sort((a, b) => b.information_gain - a.information_gain);
  
  console.log(`   Found ${hypotheses.length} hypotheses, ${questions.length} questions`);
  console.log(`   Top hypothesis: ${hypotheses[0]?.cause_name} (${(hypotheses[0]?.probability * 100).toFixed(0)}%)`);
  
  return {
    hypotheses,
    best_question: questions[0] || null,
    alternative_questions: questions.slice(1, 3),
    photo_needed: hypotheses[0]?.probability < 0.60, // Need photo if uncertain
    photo_guidance: hypotheses[0]?.probability < 0.60 ? {
      what_to_capture: `${hypotheses[0]?.cause_name} - show affected part clearly`,
      angle: 'Close-up with good lighting',
      lighting: 'Natural daylight preferred'
    } : undefined,
    max_questions_remaining: remainingQuestions
  };
}

// CONVENIENCE FUNCTIONS

// Get the best differentiating question for current context
export function getBestDifferentialQuestion(
  symptoms: string[],
  questionsAsked: number,
  language: string
): DifferentialQuestion | null {
  const result = generateDifferentialClarification({
    crop_code: 'unknown',
    growth_stage: 'unknown',
    symptoms,
    questions_asked: questionsAsked,
    language
  });
  
  return result.best_question;
}

// Check if more clarification needed or photo required
export function needsMoreClarification(
  symptoms: string[],
  questionsAsked: number,
  topHypothesisConfidence: number
): { needsQuestion: boolean; needsPhoto: boolean } {
  const maxQuestions = 3;
  const confidenceThreshold = 0.70;
  
  if (topHypothesisConfidence >= confidenceThreshold) {
    return { needsQuestion: false, needsPhoto: false };
  }
  
  if (questionsAsked >= maxQuestions) {
    return { needsQuestion: false, needsPhoto: true };
  }
  
  return { needsQuestion: true, needsPhoto: false };
}
