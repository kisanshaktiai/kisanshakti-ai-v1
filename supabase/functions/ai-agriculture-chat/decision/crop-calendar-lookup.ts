/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP CALENDAR LOOKUP - ICAR-Aligned Growth Stage Determination
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Provides deterministic growth stage calculation based on:
 * - Days since sowing
 * - Crop type
 * - GDD (Growing Degree Days) where available
 * 
 * CRITICAL: Replaces guessing with ICAR-validated crop calendars
 * 
 * VERSION: 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface GrowthStageInfo {
  stage: string;
  stage_mr: string;
  stage_hi: string;
  stage_en: string;
  min_days: number;
  max_days: number;
  critical_actions: string[];
  pest_watch: string[];
  disease_watch: string[];
  nutrient_focus: string[];
}

export interface CropCalendar {
  crop_code: string;
  crop_name_mr: string;
  crop_name_hi: string;
  crop_name_en: string;
  total_duration_days: number;
  stages: GrowthStageInfo[];
}

export interface StageCalculationResult {
  stage: string;
  stage_name: {
    mr: string;
    hi: string;
    en: string;
  };
  days_since_sowing: number;
  days_in_stage: number;
  days_remaining_in_stage: number;
  percent_complete_stage: number;
  source: 'ICAR_CALENDAR' | 'GENERIC' | 'GDD_CALCULATED';
  confidence: number;
  stage_info: GrowthStageInfo | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICAR CROP CALENDARS - COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════════════════

export const ICAR_CALENDARS: Record<string, CropCalendar> = {
  'sugarcane': {
    crop_code: 'sugarcane',
    crop_name_mr: 'ऊस',
    crop_name_hi: 'गन्ना',
    crop_name_en: 'Sugarcane',
    total_duration_days: 365,
    stages: [
      {
        stage: 'GERMINATION',
        stage_mr: 'उगवण',
        stage_hi: 'अंकुरण',
        stage_en: 'Germination',
        min_days: 0,
        max_days: 35,
        critical_actions: ['Ensure adequate soil moisture', 'Gap filling if needed', 'Light irrigation'],
        pest_watch: ['Termites', 'Early Shoot Borer'],
        disease_watch: ['Sett Rot', 'Pineapple Disease'],
        nutrient_focus: ['Starter fertilizer', 'Phosphorus']
      },
      {
        stage: 'TILLERING',
        stage_mr: 'फुटवा',
        stage_hi: 'कल्ले निकलना',
        stage_en: 'Tillering',
        min_days: 36,
        max_days: 120,
        critical_actions: ['Earthing up', 'Nitrogen top dressing', 'Weed control'],
        pest_watch: ['Early Shoot Borer', 'Root Grub', 'Pyrilla'],
        disease_watch: ['Red Rot', 'Wilt'],
        nutrient_focus: ['Nitrogen', 'Potassium']
      },
      {
        stage: 'GRAND_GROWTH',
        stage_mr: 'जोमदार वाढ',
        stage_hi: 'तेज बढ़वार',
        stage_en: 'Grand Growth',
        min_days: 121,
        max_days: 270,
        critical_actions: ['Propping if needed', 'Irrigation management', 'Detrashing'],
        pest_watch: ['Internode Borer', 'Top Borer', 'Woolly Aphid', 'Whitefly'],
        disease_watch: ['Smut', 'Red Rot', 'Rust'],
        nutrient_focus: ['Potassium', 'Micronutrients']
      },
      {
        stage: 'MATURITY',
        stage_mr: 'परिपक्वता',
        stage_hi: 'परिपक्वता',
        stage_en: 'Maturity',
        min_days: 271,
        max_days: 365,
        critical_actions: ['Withhold irrigation', 'Monitor ripening', 'Plan harvest'],
        pest_watch: ['Scale Insects', 'Mealybug'],
        disease_watch: ['Post-harvest rot'],
        nutrient_focus: ['No nitrogen', 'Monitor sugar accumulation']
      }
    ]
  },
  
  'wheat': {
    crop_code: 'wheat',
    crop_name_mr: 'गहू',
    crop_name_hi: 'गेहूं',
    crop_name_en: 'Wheat',
    total_duration_days: 120,
    stages: [
      {
        stage: 'GERMINATION',
        stage_mr: 'उगवण',
        stage_hi: 'अंकुरण',
        stage_en: 'Germination',
        min_days: 0,
        max_days: 10,
        critical_actions: ['Ensure uniform moisture', 'Monitor emergence'],
        pest_watch: ['Termites', 'Cut Worms'],
        disease_watch: ['Seedling blight'],
        nutrient_focus: ['Starter phosphorus']
      },
      {
        stage: 'SEEDLING',
        stage_mr: 'रोप अवस्था',
        stage_hi: 'बीजावस्था',
        stage_en: 'Seedling',
        min_days: 11,
        max_days: 25,
        critical_actions: ['Light irrigation', 'Weed control'],
        pest_watch: ['Aphids', 'Cutworms'],
        disease_watch: ['Loose smut'],
        nutrient_focus: ['Nitrogen basal']
      },
      {
        stage: 'TILLERING',
        stage_mr: 'फुटवा',
        stage_hi: 'कल्ले निकलना',
        stage_en: 'Tillering',
        min_days: 26,
        max_days: 55,
        critical_actions: ['First irrigation (CRI stage)', 'Nitrogen top dressing', 'Weed management'],
        pest_watch: ['Aphids', 'Brown Wheat Mite', 'Termites'],
        disease_watch: ['Yellow Rust', 'Brown Rust', 'Powdery Mildew'],
        nutrient_focus: ['Nitrogen', 'Zinc']
      },
      {
        stage: 'JOINTING',
        stage_mr: 'गाठ बनणे',
        stage_hi: 'गांठ बनना',
        stage_en: 'Jointing/Stem Elongation',
        min_days: 56,
        max_days: 70,
        critical_actions: ['Second irrigation', 'Monitor for lodging risk'],
        pest_watch: ['Aphids', 'Armyworm'],
        disease_watch: ['Yellow Rust', 'Leaf Blight'],
        nutrient_focus: ['Complete nitrogen']
      },
      {
        stage: 'HEADING',
        stage_mr: 'कण निघणे',
        stage_hi: 'बाली निकलना',
        stage_en: 'Heading/Flowering',
        min_days: 71,
        max_days: 90,
        critical_actions: ['Critical irrigation', 'No foliar sprays during flowering'],
        pest_watch: ['Aphids', 'Armyworm'],
        disease_watch: ['Yellow Rust', 'Black Rust', 'Head Blight'],
        nutrient_focus: ['Micronutrients', 'Foliar spray if needed']
      },
      {
        stage: 'MATURITY',
        stage_mr: 'परिपक्वता',
        stage_hi: 'परिपक्वता',
        stage_en: 'Maturity',
        min_days: 91,
        max_days: 120,
        critical_actions: ['Withhold irrigation', 'Monitor grain filling', 'Plan harvest'],
        pest_watch: ['Storage pests preparation'],
        disease_watch: ['Karnal bunt'],
        nutrient_focus: ['No inputs']
      }
    ]
  },
  
  'rice': {
    crop_code: 'rice',
    crop_name_mr: 'भात',
    crop_name_hi: 'धान',
    crop_name_en: 'Rice',
    total_duration_days: 135,
    stages: [
      {
        stage: 'NURSERY',
        stage_mr: 'रोपवाटिका',
        stage_hi: 'नर्सरी',
        stage_en: 'Nursery',
        min_days: 0,
        max_days: 25,
        critical_actions: ['Seed treatment', 'Maintain water level', 'Weed control'],
        pest_watch: ['Stem borer eggs', 'Thrips'],
        disease_watch: ['Seedling blight', 'Bacterial leaf blight'],
        nutrient_focus: ['NPK nursery dose']
      },
      {
        stage: 'TRANSPLANTING',
        stage_mr: 'लावणी',
        stage_hi: 'रोपाई',
        stage_en: 'Transplanting',
        min_days: 26,
        max_days: 35,
        critical_actions: ['Transplant 20-25 day old seedlings', 'Maintain 5cm water'],
        pest_watch: ['Stem borer', 'Leaf folder'],
        disease_watch: ['Bacterial blight'],
        nutrient_focus: ['Basal fertilizer']
      },
      {
        stage: 'TILLERING',
        stage_mr: 'फुटवा',
        stage_hi: 'कल्ले निकलना',
        stage_en: 'Tillering',
        min_days: 36,
        max_days: 60,
        critical_actions: ['First top dressing', 'Weed control', 'Maintain water level'],
        pest_watch: ['Stem borer', 'BPH', 'Gall Midge', 'Leaf folder'],
        disease_watch: ['Blast', 'Bacterial blight', 'Sheath blight'],
        nutrient_focus: ['Nitrogen top dressing', 'Zinc']
      },
      {
        stage: 'PANICLE_INITIATION',
        stage_mr: 'कण निघणे',
        stage_hi: 'गभोट अवस्था',
        stage_en: 'Panicle Initiation',
        min_days: 61,
        max_days: 80,
        critical_actions: ['Second top dressing', 'Critical water management'],
        pest_watch: ['BPH', 'WBPH', 'Gall midge'],
        disease_watch: ['Blast (neck)', 'Sheath blight', 'False smut'],
        nutrient_focus: ['Potassium', 'Nitrogen split']
      },
      {
        stage: 'FLOWERING',
        stage_mr: 'फुलोरा',
        stage_hi: 'फूलने का समय',
        stage_en: 'Flowering',
        min_days: 81,
        max_days: 100,
        critical_actions: ['Critical irrigation', 'Avoid pesticides on flowers'],
        pest_watch: ['Rice bug', 'Ear head bug'],
        disease_watch: ['Neck blast', 'False smut'],
        nutrient_focus: ['Complete fertilizer by now']
      },
      {
        stage: 'GRAIN_FILLING',
        stage_mr: 'दाना भरणे',
        stage_hi: 'दाना भरना',
        stage_en: 'Grain Filling',
        min_days: 101,
        max_days: 120,
        critical_actions: ['Maintain water till milky stage', 'Monitor grain development'],
        pest_watch: ['Rice bug', 'Grain discoloration pests'],
        disease_watch: ['Grain discoloration'],
        nutrient_focus: ['No inputs']
      },
      {
        stage: 'MATURITY',
        stage_mr: 'परिपक्वता',
        stage_hi: 'परिपक्वता',
        stage_en: 'Maturity',
        min_days: 121,
        max_days: 135,
        critical_actions: ['Drain water 10-15 days before harvest', 'Plan harvest at 20-22% moisture'],
        pest_watch: ['Storage pest preparation'],
        disease_watch: ['Post-harvest issues'],
        nutrient_focus: ['No inputs']
      }
    ]
  },
  
  'cotton': {
    crop_code: 'cotton',
    crop_name_mr: 'कापूस',
    crop_name_hi: 'कपास',
    crop_name_en: 'Cotton',
    total_duration_days: 180,
    stages: [
      {
        stage: 'GERMINATION',
        stage_mr: 'उगवण',
        stage_hi: 'अंकुरण',
        stage_en: 'Germination',
        min_days: 0,
        max_days: 15,
        critical_actions: ['Ensure uniform moisture', 'Gap filling', 'Seed treatment effect'],
        pest_watch: ['Cutworms', 'Thrips'],
        disease_watch: ['Seedling disease complex'],
        nutrient_focus: ['Starter fertilizer']
      },
      {
        stage: 'SEEDLING',
        stage_mr: 'रोप अवस्था',
        stage_hi: 'बीजावस्था',
        stage_en: 'Seedling',
        min_days: 16,
        max_days: 35,
        critical_actions: ['Thinning', 'First weeding', 'Light irrigation'],
        pest_watch: ['Jassids', 'Thrips', 'Whitefly'],
        disease_watch: ['Root rot', 'Wilt'],
        nutrient_focus: ['Nitrogen basal']
      },
      {
        stage: 'VEGETATIVE',
        stage_mr: 'वाढीचा काळ',
        stage_hi: 'वनस्पति काल',
        stage_en: 'Vegetative Growth',
        min_days: 36,
        max_days: 60,
        critical_actions: ['Inter-cultivation', 'Earthing up', 'Nitrogen top dressing'],
        pest_watch: ['Jassids', 'Aphids', 'Whitefly', 'Thrips'],
        disease_watch: ['Wilt', 'Alternaria leaf spot'],
        nutrient_focus: ['Nitrogen', 'Potassium']
      },
      {
        stage: 'SQUARING',
        stage_mr: 'कळी अवस्था',
        stage_hi: 'कली अवस्था',
        stage_en: 'Squaring',
        min_days: 61,
        max_days: 80,
        critical_actions: ['Monitor bud formation', 'IPM scouting starts'],
        pest_watch: ['Spotted Bollworm', 'Pink Bollworm', 'American Bollworm'],
        disease_watch: ['Grey mildew', 'Boll rot'],
        nutrient_focus: ['Complete NPK']
      },
      {
        stage: 'FLOWERING',
        stage_mr: 'फुलोरा',
        stage_hi: 'फूलने का समय',
        stage_en: 'Flowering',
        min_days: 81,
        max_days: 110,
        critical_actions: ['Critical irrigation', 'Peak bollworm monitoring', 'Avoid broad-spectrum pesticides'],
        pest_watch: ['Bollworms (all)', 'Whitefly', 'Mealybug'],
        disease_watch: ['Boll rot', 'Bacterial blight'],
        nutrient_focus: ['Potassium', 'Micronutrients']
      },
      {
        stage: 'BOLL_DEVELOPMENT',
        stage_mr: 'बोंड विकास',
        stage_hi: 'बॉल विकास',
        stage_en: 'Boll Development',
        min_days: 111,
        max_days: 150,
        critical_actions: ['Manage last irrigation', 'Monitor boll opening'],
        pest_watch: ['Pink Bollworm', 'Mealybug'],
        disease_watch: ['Boll rot'],
        nutrient_focus: ['No nitrogen', 'Defoliation chemicals if needed']
      },
      {
        stage: 'MATURITY',
        stage_mr: 'परिपक्वता',
        stage_hi: 'परिपक्वता',
        stage_en: 'Maturity/Picking',
        min_days: 151,
        max_days: 180,
        critical_actions: ['Multiple pickings', 'Quality maintenance', 'Stalk destruction after final pick'],
        pest_watch: ['Pink bollworm in bolls'],
        disease_watch: ['Boll rot'],
        nutrient_focus: ['No inputs']
      }
    ]
  },
  
  'soybean': {
    crop_code: 'soybean',
    crop_name_mr: 'सोयाबीन',
    crop_name_hi: 'सोयाबीन',
    crop_name_en: 'Soybean',
    total_duration_days: 110,
    stages: [
      {
        stage: 'GERMINATION',
        stage_mr: 'उगवण',
        stage_hi: 'अंकुरण',
        stage_en: 'Germination',
        min_days: 0,
        max_days: 10,
        critical_actions: ['Seed treatment', 'Ensure rhizobium inoculation'],
        pest_watch: ['Cutworms', 'White grubs'],
        disease_watch: ['Collar rot'],
        nutrient_focus: ['Rhizobium', 'Phosphorus']
      },
      {
        stage: 'VEGETATIVE',
        stage_mr: 'वाढीचा काळ',
        stage_hi: 'वनस्पति काल',
        stage_en: 'Vegetative',
        min_days: 11,
        max_days: 40,
        critical_actions: ['Weed control critical', 'Inter-cultivation'],
        pest_watch: ['Stem fly', 'Girdle beetle', 'Tobacco caterpillar'],
        disease_watch: ['Yellow Mosaic Virus', 'Rhizoctonia'],
        nutrient_focus: ['DAP', 'Micronutrients']
      },
      {
        stage: 'FLOWERING',
        stage_mr: 'फुलोरा',
        stage_hi: 'फूलने का समय',
        stage_en: 'Flowering',
        min_days: 41,
        max_days: 60,
        critical_actions: ['Critical water requirement', 'Pest scouting peaks'],
        pest_watch: ['Spodoptera', 'Pod borer', 'Leaf eating caterpillars'],
        disease_watch: ['Charcoal rot', 'Anthracnose'],
        nutrient_focus: ['Potash', 'Boron']
      },
      {
        stage: 'POD_DEVELOPMENT',
        stage_mr: 'शेंग विकास',
        stage_hi: 'फली विकास',
        stage_en: 'Pod Development',
        min_days: 61,
        max_days: 85,
        critical_actions: ['Monitor pod fill', 'Last irrigation if needed'],
        pest_watch: ['Pod fly', 'Pod borer'],
        disease_watch: ['Pod blight', 'Purple seed stain'],
        nutrient_focus: ['No nitrogen']
      },
      {
        stage: 'MATURITY',
        stage_mr: 'परिपक्वता',
        stage_hi: 'परिपक्वता',
        stage_en: 'Maturity',
        min_days: 86,
        max_days: 110,
        critical_actions: ['Monitor leaf drop', 'Harvest at 14% moisture', 'Avoid shattering'],
        pest_watch: ['Storage pests'],
        disease_watch: ['Post-harvest molds'],
        nutrient_focus: ['No inputs']
      }
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LOOKUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate growth stage from days since sowing
 */
export function calculateGrowthStageFromDAS(
  cropCode: string,
  daysSinceSowing: number
): StageCalculationResult {
  const normalizedCrop = cropCode.toLowerCase().trim();
  const calendar = ICAR_CALENDARS[normalizedCrop];
  
  if (!calendar) {
    // Use generic stages
    return calculateGenericStage(cropCode, daysSinceSowing);
  }
  
  // Find matching stage
  for (const stage of calendar.stages) {
    if (daysSinceSowing >= stage.min_days && daysSinceSowing <= stage.max_days) {
      const daysInStage = daysSinceSowing - stage.min_days;
      const stageDuration = stage.max_days - stage.min_days;
      const daysRemaining = stage.max_days - daysSinceSowing;
      const percentComplete = (daysInStage / stageDuration) * 100;
      
      return {
        stage: stage.stage,
        stage_name: {
          mr: stage.stage_mr,
          hi: stage.stage_hi,
          en: stage.stage_en
        },
        days_since_sowing: daysSinceSowing,
        days_in_stage: daysInStage,
        days_remaining_in_stage: daysRemaining,
        percent_complete_stage: Math.round(percentComplete),
        source: 'ICAR_CALENDAR',
        confidence: 0.95,
        stage_info: stage
      };
    }
  }
  
  // Past all stages - return last stage
  const lastStage = calendar.stages[calendar.stages.length - 1];
  return {
    stage: lastStage.stage,
    stage_name: {
      mr: lastStage.stage_mr,
      hi: lastStage.stage_hi,
      en: lastStage.stage_en
    },
    days_since_sowing: daysSinceSowing,
    days_in_stage: daysSinceSowing - lastStage.min_days,
    days_remaining_in_stage: 0,
    percent_complete_stage: 100,
    source: 'ICAR_CALENDAR',
    confidence: 0.85,
    stage_info: lastStage
  };
}

/**
 * Generic stage calculation when no ICAR calendar available
 */
function calculateGenericStage(
  cropCode: string,
  daysSinceSowing: number
): StageCalculationResult {
  let stage: string;
  let stageNames: { mr: string; hi: string; en: string };
  
  if (daysSinceSowing <= 15) {
    stage = 'GERMINATION';
    stageNames = { mr: 'उगवण', hi: 'अंकुरण', en: 'Germination' };
  } else if (daysSinceSowing <= 35) {
    stage = 'SEEDLING';
    stageNames = { mr: 'रोप अवस्था', hi: 'बीजावस्था', en: 'Seedling' };
  } else if (daysSinceSowing <= 70) {
    stage = 'VEGETATIVE';
    stageNames = { mr: 'वाढीचा काळ', hi: 'वनस्पति काल', en: 'Vegetative' };
  } else if (daysSinceSowing <= 100) {
    stage = 'FLOWERING';
    stageNames = { mr: 'फुलोरा', hi: 'फूलने का समय', en: 'Flowering' };
  } else {
    stage = 'MATURITY';
    stageNames = { mr: 'परिपक्वता', hi: 'परिपक्वता', en: 'Maturity' };
  }
  
  return {
    stage,
    stage_name: stageNames,
    days_since_sowing: daysSinceSowing,
    days_in_stage: 0,
    days_remaining_in_stage: 0,
    percent_complete_stage: 50,
    source: 'GENERIC',
    confidence: 0.60,
    stage_info: null
  };
}

/**
 * Get stage-specific watch lists
 */
export function getStageWatchLists(
  cropCode: string,
  stage: string
): { pests: string[]; diseases: string[]; nutrients: string[] } | null {
  const calendar = ICAR_CALENDARS[cropCode.toLowerCase()];
  if (!calendar) return null;
  
  const stageInfo = calendar.stages.find(s => s.stage === stage);
  if (!stageInfo) return null;
  
  return {
    pests: stageInfo.pest_watch,
    diseases: stageInfo.disease_watch,
    nutrients: stageInfo.nutrient_focus
  };
}

/**
 * Get all stages for a crop
 */
export function getCropStages(cropCode: string): GrowthStageInfo[] {
  const calendar = ICAR_CALENDARS[cropCode.toLowerCase()];
  return calendar?.stages || [];
}

/**
 * Check if crop calendar exists
 */
export function hasICARCalendar(cropCode: string): boolean {
  return !!ICAR_CALENDARS[cropCode.toLowerCase()];
}
