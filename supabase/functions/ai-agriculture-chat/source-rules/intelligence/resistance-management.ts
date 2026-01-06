/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESISTANCE MANAGEMENT SYSTEM - Regional Resistance Tracking
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tracks pesticide/fungicide resistance development by region and provides
 * Mode of Action (MOA) rotation recommendations.
 * 
 * Standards:
 * - IRAC (Insecticide Resistance Action Committee)
 * - FRAC (Fungicide Resistance Action Committee)
 * 
 * Version: 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ResistanceRecord {
  pest_code: string;
  pest_name: string;
  region: string;
  state: string;
  
  resistant_to: Array<{
    chemical: string;
    active_ingredient: string;
    moa_group: string;
    resistance_level: 'HIGH' | 'MEDIUM' | 'EMERGING' | 'SUSPECTED';
    first_reported_year?: number;
    efficacy_percent: number;  // Current efficacy (0-100, lower = more resistant)
    source: string;
  }>;
  
  still_effective: string[];
  
  recommended_rotation: Array<{
    moa_group: string;
    examples: string[];
    efficacy_percent: number;
  }>;
  
  management_strategy: string;
  last_updated: string;
}

export interface MOARotationAdvice {
  current_moa: string;
  current_chemical: string;
  next_recommended_moa: string[];
  avoid_moa: string[];
  rotation_cycle_days: number;
  explanation: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// IRAC MODE OF ACTION GROUPS
// ═══════════════════════════════════════════════════════════════════════════

export const IRAC_MOA_GROUPS: Record<string, {
  name: string;
  examples: string[];
  resistance_risk: 'HIGH' | 'MEDIUM' | 'LOW';
  max_applications_per_season: number;
}> = {
  '1A': {
    name: 'Carbamates (AChE inhibitors)',
    examples: ['Carbaryl', 'Carbofuran', 'Carbosulfan'],
    resistance_risk: 'MEDIUM',
    max_applications_per_season: 2,
  },
  '1B': {
    name: 'Organophosphates (AChE inhibitors)',
    examples: ['Chlorpyrifos', 'Profenofos', 'Quinalphos', 'Monocrotophos'],
    resistance_risk: 'MEDIUM',
    max_applications_per_season: 2,
  },
  '3A': {
    name: 'Pyrethroids (Sodium channel modulators)',
    examples: ['Cypermethrin', 'Deltamethrin', 'Lambda-cyhalothrin', 'Fenvalerate'],
    resistance_risk: 'HIGH',
    max_applications_per_season: 2,
  },
  '4A': {
    name: 'Neonicotinoids (nAChR agonists)',
    examples: ['Imidacloprid', 'Thiamethoxam', 'Acetamiprid', 'Clothianidin'],
    resistance_risk: 'HIGH',
    max_applications_per_season: 2,
  },
  '5': {
    name: 'Spinosyns',
    examples: ['Spinosad', 'Spinetoram'],
    resistance_risk: 'MEDIUM',
    max_applications_per_season: 3,
  },
  '6': {
    name: 'Avermectins',
    examples: ['Abamectin', 'Emamectin benzoate'],
    resistance_risk: 'MEDIUM',
    max_applications_per_season: 2,
  },
  '9B/9C': {
    name: 'Pymetrozine/Flonicamid',
    examples: ['Pymetrozine', 'Flonicamid'],
    resistance_risk: 'LOW',
    max_applications_per_season: 3,
  },
  '11A': {
    name: 'Bt (Microbial disruptors)',
    examples: ['Bt kurstaki', 'Bt aizawai'],
    resistance_risk: 'LOW',
    max_applications_per_season: 6,
  },
  '22A': {
    name: 'Oxadiazines',
    examples: ['Indoxacarb'],
    resistance_risk: 'MEDIUM',
    max_applications_per_season: 3,
  },
  '28': {
    name: 'Diamides (RyR modulators)',
    examples: ['Chlorantraniliprole', 'Flubendiamide', 'Cyantraniliprole'],
    resistance_risk: 'MEDIUM',
    max_applications_per_season: 3,
  },
  '29': {
    name: 'Flonicamid',
    examples: ['Flonicamid'],
    resistance_risk: 'LOW',
    max_applications_per_season: 3,
  },
  'UN': {
    name: 'Botanicals/Unknown MOA',
    examples: ['Neem oil', 'Azadirachtin', 'Pongamia'],
    resistance_risk: 'LOW',
    max_applications_per_season: 8,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// REGIONAL RESISTANCE DATABASE (Field survey data)
// ═══════════════════════════════════════════════════════════════════════════

export const RESISTANCE_DATABASE: ResistanceRecord[] = [
  // WHITEFLY - Punjab (Critical case)
  {
    pest_code: 'WHITEFLY',
    pest_name: 'Cotton Whitefly (Bemisia tabaci)',
    region: 'PUNJAB',
    state: 'Punjab',
    resistant_to: [
      {
        chemical: 'Imidacloprid',
        active_ingredient: 'Imidacloprid',
        moa_group: '4A',
        resistance_level: 'HIGH',
        first_reported_year: 2015,
        efficacy_percent: 25,
        source: 'PAU Ludhiana Research Station',
      },
      {
        chemical: 'Thiamethoxam',
        active_ingredient: 'Thiamethoxam',
        moa_group: '4A',
        resistance_level: 'HIGH',
        first_reported_year: 2016,
        efficacy_percent: 30,
        source: 'CICR Nagpur',
      },
      {
        chemical: 'Acetamiprid',
        active_ingredient: 'Acetamiprid',
        moa_group: '4A',
        resistance_level: 'MEDIUM',
        first_reported_year: 2018,
        efficacy_percent: 55,
        source: 'PAU Ludhiana',
      },
    ],
    still_effective: ['Pymetrozine', 'Flonicamid', 'Spiromesifen', 'Diafenthiuron'],
    recommended_rotation: [
      { moa_group: '9B', examples: ['Pymetrozine'], efficacy_percent: 85 },
      { moa_group: '29', examples: ['Flonicamid'], efficacy_percent: 80 },
      { moa_group: '23', examples: ['Spiromesifen'], efficacy_percent: 75 },
    ],
    management_strategy: 'STOP using all neonicotinoids (Group 4A). Rotate between Groups 9, 23, 29. Use neem oil between sprays.',
    last_updated: '2024-06-15',
  },
  
  // WHITEFLY - Maharashtra (Moderate)
  {
    pest_code: 'WHITEFLY',
    pest_name: 'Cotton Whitefly (Bemisia tabaci)',
    region: 'MAHARASHTRA',
    state: 'Maharashtra',
    resistant_to: [
      {
        chemical: 'Imidacloprid',
        active_ingredient: 'Imidacloprid',
        moa_group: '4A',
        resistance_level: 'MEDIUM',
        first_reported_year: 2018,
        efficacy_percent: 50,
        source: 'CICR Nagpur',
      },
    ],
    still_effective: ['Thiamethoxam', 'Flonicamid', 'Pymetrozine', 'Diafenthiuron'],
    recommended_rotation: [
      { moa_group: '4A', examples: ['Thiamethoxam (still works)'], efficacy_percent: 70 },
      { moa_group: '9B', examples: ['Pymetrozine'], efficacy_percent: 85 },
      { moa_group: '29', examples: ['Flonicamid'], efficacy_percent: 85 },
    ],
    management_strategy: 'Reduce imidacloprid use. Alternate with different MOA groups. Limit neonicotinoids to 2 sprays/season.',
    last_updated: '2024-06-15',
  },
  
  // PINK BOLLWORM - BT Resistance
  {
    pest_code: 'PINK_BOLLWORM',
    pest_name: 'Pink Bollworm (Pectinophora gossypiella)',
    region: 'GUJARAT',
    state: 'Gujarat',
    resistant_to: [
      {
        chemical: 'BT Cry1Ac',
        active_ingredient: 'Cry1Ac protein',
        moa_group: '11A',
        resistance_level: 'HIGH',
        first_reported_year: 2017,
        efficacy_percent: 40,
        source: 'CICR Nagpur + ICAR Survey',
      },
      {
        chemical: 'BT Cry2Ab',
        active_ingredient: 'Cry2Ab protein',
        moa_group: '11A',
        resistance_level: 'EMERGING',
        first_reported_year: 2020,
        efficacy_percent: 70,
        source: 'CICR Nagpur',
      },
    ],
    still_effective: ['Pheromone mating disruption', 'Mass trapping', 'Chlorantraniliprole'],
    recommended_rotation: [],
    management_strategy: 'BT resistance confirmed! Use pheromone traps (5/acre). Timely picking of bolls. Destroy crop residue. Spray chlorantraniliprole if needed.',
    last_updated: '2024-01-20',
  },
  
  // PHALARIS MINOR - Wheat weed (Herbicide resistance)
  {
    pest_code: 'PHALARIS_MINOR',
    pest_name: 'Little Seed Canary Grass (Phalaris minor)',
    region: 'HARYANA',
    state: 'Haryana',
    resistant_to: [
      {
        chemical: 'Isoproturon',
        active_ingredient: 'Isoproturon',
        moa_group: 'C2',
        resistance_level: 'HIGH',
        first_reported_year: 1998,
        efficacy_percent: 10,
        source: 'CCS HAU Hisar',
      },
      {
        chemical: 'Clodinafop',
        active_ingredient: 'Clodinafop-propargyl',
        moa_group: 'A',
        resistance_level: 'MEDIUM',
        first_reported_year: 2010,
        efficacy_percent: 50,
        source: 'ICAR-IARI',
      },
    ],
    still_effective: ['Pinoxaden', 'Sulfosulfuron', 'Mesosulfuron'],
    recommended_rotation: [
      { moa_group: 'A (different)', examples: ['Pinoxaden'], efficacy_percent: 85 },
      { moa_group: 'B', examples: ['Sulfosulfuron'], efficacy_percent: 80 },
    ],
    management_strategy: 'STOP using isoproturon. Rotate herbicide groups. Stale seedbed technique. Use zero-till with herbicide rotation.',
    last_updated: '2023-11-10',
  },
  
  // APHID - Mustard (Moderate resistance)
  {
    pest_code: 'APHID',
    pest_name: 'Mustard Aphid (Lipaphis erysimi)',
    region: 'RAJASTHAN',
    state: 'Rajasthan',
    resistant_to: [
      {
        chemical: 'Dimethoate',
        active_ingredient: 'Dimethoate',
        moa_group: '1B',
        resistance_level: 'MEDIUM',
        first_reported_year: 2015,
        efficacy_percent: 55,
        source: 'RAU Bikaner',
      },
    ],
    still_effective: ['Thiamethoxam', 'Imidacloprid', 'Acetamiprid', 'Flonicamid'],
    recommended_rotation: [
      { moa_group: '4A', examples: ['Thiamethoxam', 'Imidacloprid'], efficacy_percent: 85 },
      { moa_group: '29', examples: ['Flonicamid'], efficacy_percent: 90 },
    ],
    management_strategy: 'Reduce dimethoate. Use neonicotinoids early. Spray when aphid count >10/plant. Yellow sticky traps for monitoring.',
    last_updated: '2024-02-28',
  },
  
  // THRIPS - Chilli (Karnataka)
  {
    pest_code: 'THRIPS',
    pest_name: 'Chilli Thrips (Scirtothrips dorsalis)',
    region: 'KARNATAKA',
    state: 'Karnataka',
    resistant_to: [
      {
        chemical: 'Fipronil',
        active_ingredient: 'Fipronil',
        moa_group: '2B',
        resistance_level: 'MEDIUM',
        first_reported_year: 2019,
        efficacy_percent: 55,
        source: 'UAS Raichur',
      },
    ],
    still_effective: ['Spinetoram', 'Emamectin benzoate', 'Cyantraniliprole'],
    recommended_rotation: [
      { moa_group: '5', examples: ['Spinetoram', 'Spinosad'], efficacy_percent: 85 },
      { moa_group: '6', examples: ['Emamectin benzoate'], efficacy_percent: 80 },
      { moa_group: '28', examples: ['Cyantraniliprole'], efficacy_percent: 90 },
    ],
    management_strategy: 'Reduce fipronil use. Blue sticky traps. Spray in evening when thrips active. Neem oil between sprays.',
    last_updated: '2024-04-10',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// RESISTANCE CHECK FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a pest has resistance to a chemical in a region
 */
export function checkResistance(
  pestCode: string,
  chemicalName: string,
  region: string
): {
  hasResistance: boolean;
  level?: 'HIGH' | 'MEDIUM' | 'EMERGING' | 'SUSPECTED';
  efficacy_percent?: number;
  recommendation?: string;
  alternatives?: string[];
} {
  const regionUpper = region.toUpperCase();
  
  const record = RESISTANCE_DATABASE.find(
    r => r.pest_code === pestCode.toUpperCase() && 
         (r.region === regionUpper || r.state.toUpperCase() === regionUpper)
  );
  
  if (!record) {
    return { hasResistance: false };
  }
  
  const resistanceInfo = record.resistant_to.find(
    r => r.chemical.toLowerCase().includes(chemicalName.toLowerCase()) ||
         r.active_ingredient.toLowerCase().includes(chemicalName.toLowerCase())
  );
  
  if (!resistanceInfo) {
    return { hasResistance: false };
  }
  
  return {
    hasResistance: true,
    level: resistanceInfo.resistance_level,
    efficacy_percent: resistanceInfo.efficacy_percent,
    recommendation: record.management_strategy,
    alternatives: record.still_effective,
  };
}

/**
 * Get MOA rotation recommendation
 */
export function getMOARotation(
  currentChemical: string,
  pestCode: string,
  region: string
): MOARotationAdvice | null {
  // Find current MOA group
  let currentMOA = '';
  for (const [group, info] of Object.entries(IRAC_MOA_GROUPS)) {
    if (info.examples.some(e => e.toLowerCase().includes(currentChemical.toLowerCase()))) {
      currentMOA = group;
      break;
    }
  }
  
  if (!currentMOA) {
    return null;
  }
  
  // Get regional resistance data
  const resistanceRecord = RESISTANCE_DATABASE.find(
    r => r.pest_code === pestCode.toUpperCase() && 
         r.region === region.toUpperCase()
  );
  
  // Build rotation advice
  const resistantMOAs = resistanceRecord?.resistant_to.map(r => r.moa_group) || [];
  
  // Recommend different MOA groups
  const nextMOAs: string[] = [];
  const avoidMOAs = [currentMOA, ...resistantMOAs];
  
  // Prioritize low resistance risk groups
  const priorityGroups = ['UN', '11A', '28', '9B', '29', '5', '6'];
  
  for (const group of priorityGroups) {
    if (!avoidMOAs.includes(group)) {
      nextMOAs.push(group);
      if (nextMOAs.length >= 3) break;
    }
  }
  
  return {
    current_moa: currentMOA,
    current_chemical: currentChemical,
    next_recommended_moa: nextMOAs,
    avoid_moa: avoidMOAs,
    rotation_cycle_days: 14,
    explanation: `Rotate from Group ${currentMOA} to Groups ${nextMOAs.join(', ')} to prevent resistance. Avoid Groups ${resistantMOAs.join(', ')} due to confirmed resistance.`,
  };
}

/**
 * Generate resistance alert for a region
 */
export function getResistanceAlert(
  pestCode: string,
  region: string
): {
  hasAlert: boolean;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  message_mr: string;
  message_hi: string;
} | null {
  const record = RESISTANCE_DATABASE.find(
    r => r.pest_code === pestCode.toUpperCase() && 
         r.region === region.toUpperCase()
  );
  
  if (!record) {
    return null;
  }
  
  const highResistance = record.resistant_to.filter(r => r.resistance_level === 'HIGH');
  
  if (highResistance.length > 0) {
    const chemicals = highResistance.map(r => r.chemical).join(', ');
    return {
      hasAlert: true,
      severity: 'CRITICAL',
      message: `⚠️ RESISTANCE ALERT: ${record.pest_name} in ${record.state} shows HIGH resistance to ${chemicals}. These chemicals have <40% efficacy. Use alternatives: ${record.still_effective.slice(0, 3).join(', ')}.`,
      message_mr: `⚠️ प्रतिकार सावधान: ${record.state} मध्ये ${chemicals} ची प्रभावीता ४०% पेक्षा कमी आहे. पर्यायी वापरा: ${record.still_effective.slice(0, 3).join(', ')}.`,
      message_hi: `⚠️ प्रतिरोध चेतावनी: ${record.state} में ${chemicals} की प्रभावशीलता 40% से कम है। विकल्प उपयोग करें: ${record.still_effective.slice(0, 3).join(', ')}.`,
    };
  }
  
  const mediumResistance = record.resistant_to.filter(r => r.resistance_level === 'MEDIUM');
  if (mediumResistance.length > 0) {
    const chemicals = mediumResistance.map(r => r.chemical).join(', ');
    return {
      hasAlert: true,
      severity: 'WARNING',
      message: `⚠️ RESISTANCE WARNING: ${record.pest_name} in ${record.state} shows developing resistance to ${chemicals}. Reduce use and rotate MOA groups.`,
      message_mr: `⚠️ प्रतिकार इशारा: ${record.state} मध्ये ${chemicals} ला प्रतिकार विकसित होत आहे. वापर कमी करा आणि औषध बदला.`,
      message_hi: `⚠️ प्रतिरोध चेतावनी: ${record.state} में ${chemicals} के प्रति प्रतिरोध विकसित हो रहा है। उपयोग कम करें और दवाई बदलें।`,
    };
  }
  
  return null;
}

// Export version
export const RESISTANCE_MANAGEMENT_VERSION = '1.0.0';
