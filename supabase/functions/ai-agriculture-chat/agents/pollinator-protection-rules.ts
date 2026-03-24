/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POLLINATOR PROTECTION RULES - SAFETY ENFORCEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL SAFETY SYSTEM: Protects pollinators (bees, butterflies, beetles)
 * by blocking harmful chemicals during flowering and enforcing spray timing.
 * 
 * Standards:
 * - EU Bee Guidance Document
 * - EPA Pollinator Protection Guidelines
 * - ICAR Pollinator Conservation Guidelines
 * 
 * Version: 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PollinatorCheckResult {
  is_safe: boolean;
  chemical_name: string;
  risk_level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  block_reason?: string;
  /** @deprecated Use block_reason — LLM translates at runtime */
  block_reason_mr?: string;
  /** @deprecated Use block_reason — LLM translates at runtime */
  block_reason_hi?: string;
  time_restriction?: {
    allowed_hours: string;
    reason: string;
  };
  alternative_suggestions: string[];
  scientific_basis: string;
}

export interface PollinatorEnforcementResult {
  is_flowering_stage: boolean;
  crop_code: string;
  blocked_chemicals: PollinatorCheckResult[];
  allowed_chemicals: PollinatorCheckResult[];
  time_restricted_chemicals: PollinatorCheckResult[];
  safe_alternatives: string[];
  general_advice: string;
  /** @deprecated Use general_advice — LLM translates at runtime */
  general_advice_mr?: string;
  /** @deprecated Use general_advice — LLM translates at runtime */
  general_advice_hi?: string;
}

export interface ChemicalPollinatorProfile {
  chemical: string;
  active_ingredient: string;
  bee_toxicity: 'HIGHLY_TOXIC' | 'MODERATELY_TOXIC' | 'RELATIVELY_NONTOXIC';
  contact_ld50_ug_bee?: number;  // Lethal dose
  oral_ld50_ug_bee?: number;
  residual_toxicity_days: number;  // Days chemical remains toxic on plants
  flowering_banned: boolean;
  evening_spray_allowed: boolean;  // If can spray after bees return to hive
  pollinator_safe_alternatives: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// POLLINATOR TOXICITY DATABASE (EPA/EU Data)
// ═══════════════════════════════════════════════════════════════════════════

export const POLLINATOR_TOXICITY_DB: ChemicalPollinatorProfile[] = [
  // NEONICOTINOIDS - HIGHLY TOXIC (Primary cause of bee colony collapse)
  {
    chemical: 'Imidacloprid',
    active_ingredient: 'Imidacloprid',
    bee_toxicity: 'HIGHLY_TOXIC',
    contact_ld50_ug_bee: 0.081,
    oral_ld50_ug_bee: 0.0037,
    residual_toxicity_days: 14,
    flowering_banned: true,
    evening_spray_allowed: false,
    pollinator_safe_alternatives: ['Neem Oil', 'Beauveria bassiana', 'Spinosad (evening only)'],
  },
  {
    chemical: 'Thiamethoxam',
    active_ingredient: 'Thiamethoxam',
    bee_toxicity: 'HIGHLY_TOXIC',
    contact_ld50_ug_bee: 0.024,
    oral_ld50_ug_bee: 0.005,
    residual_toxicity_days: 14,
    flowering_banned: true,
    evening_spray_allowed: false,
    pollinator_safe_alternatives: ['Neem Oil', 'Beauveria bassiana'],
  },
  {
    chemical: 'Clothianidin',
    active_ingredient: 'Clothianidin',
    bee_toxicity: 'HIGHLY_TOXIC',
    contact_ld50_ug_bee: 0.022,
    oral_ld50_ug_bee: 0.0037,
    residual_toxicity_days: 21,
    flowering_banned: true,
    evening_spray_allowed: false,
    pollinator_safe_alternatives: ['Neem Oil', 'NPV'],
  },
  {
    chemical: 'Acetamiprid',
    active_ingredient: 'Acetamiprid',
    bee_toxicity: 'MODERATELY_TOXIC',
    contact_ld50_ug_bee: 8.09,
    oral_ld50_ug_bee: 14.5,
    residual_toxicity_days: 3,
    flowering_banned: true,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: ['Neem Oil', 'Beauveria bassiana'],
  },
  
  // PYRETHROIDS - HIGHLY TOXIC TO BEES
  {
    chemical: 'Cypermethrin',
    active_ingredient: 'Cypermethrin',
    bee_toxicity: 'HIGHLY_TOXIC',
    contact_ld50_ug_bee: 0.02,
    residual_toxicity_days: 3,
    flowering_banned: true,
    evening_spray_allowed: true,  // Breaks down faster, evening possible
    pollinator_safe_alternatives: ['Bt', 'NPV', 'Neem Oil'],
  },
  {
    chemical: 'Deltamethrin',
    active_ingredient: 'Deltamethrin',
    bee_toxicity: 'HIGHLY_TOXIC',
    contact_ld50_ug_bee: 0.0015,
    residual_toxicity_days: 3,
    flowering_banned: true,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: ['Bt', 'NPV'],
  },
  {
    chemical: 'Lambda-cyhalothrin',
    active_ingredient: 'Lambda-cyhalothrin',
    bee_toxicity: 'HIGHLY_TOXIC',
    contact_ld50_ug_bee: 0.038,
    residual_toxicity_days: 3,
    flowering_banned: true,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: ['Bt', 'NPV', 'Beauveria'],
  },
  
  // ORGANOPHOSPHATES - VARIABLE TOXICITY
  {
    chemical: 'Chlorpyrifos',
    active_ingredient: 'Chlorpyrifos',
    bee_toxicity: 'HIGHLY_TOXIC',
    contact_ld50_ug_bee: 0.059,
    residual_toxicity_days: 7,
    flowering_banned: true,
    evening_spray_allowed: false,
    pollinator_safe_alternatives: ['Neem Oil', 'Bt'],
  },
  {
    chemical: 'Profenofos',
    active_ingredient: 'Profenofos',
    bee_toxicity: 'HIGHLY_TOXIC',
    contact_ld50_ug_bee: 0.13,
    residual_toxicity_days: 5,
    flowering_banned: true,
    evening_spray_allowed: false,
    pollinator_safe_alternatives: ['Chlorantraniliprole', 'Neem'],
  },
  
  // DIAMIDES - POLLINATOR SAFE
  {
    chemical: 'Chlorantraniliprole',
    active_ingredient: 'Chlorantraniliprole',
    bee_toxicity: 'RELATIVELY_NONTOXIC',
    contact_ld50_ug_bee: 104,
    oral_ld50_ug_bee: 4,
    residual_toxicity_days: 0,
    flowering_banned: false,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: [],
  },
  {
    chemical: 'Flubendiamide',
    active_ingredient: 'Flubendiamide',
    bee_toxicity: 'RELATIVELY_NONTOXIC',
    contact_ld50_ug_bee: 200,
    residual_toxicity_days: 0,
    flowering_banned: false,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: [],
  },
  
  // BIOPESTICIDES - MOSTLY SAFE
  {
    chemical: 'Neem Oil',
    active_ingredient: 'Azadirachtin',
    bee_toxicity: 'RELATIVELY_NONTOXIC',
    residual_toxicity_days: 0,
    flowering_banned: false,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: [],
  },
  {
    chemical: 'Bt (Bacillus thuringiensis)',
    active_ingredient: 'Bt kurstaki',
    bee_toxicity: 'RELATIVELY_NONTOXIC',
    residual_toxicity_days: 0,
    flowering_banned: false,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: [],
  },
  {
    chemical: 'NPV',
    active_ingredient: 'Nuclear Polyhedrosis Virus',
    bee_toxicity: 'RELATIVELY_NONTOXIC',
    residual_toxicity_days: 0,
    flowering_banned: false,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: [],
  },
  {
    chemical: 'Beauveria bassiana',
    active_ingredient: 'Beauveria bassiana',
    bee_toxicity: 'RELATIVELY_NONTOXIC',
    residual_toxicity_days: 0,
    flowering_banned: false,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: [],
  },
  {
    chemical: 'Spinosad',
    active_ingredient: 'Spinosad',
    bee_toxicity: 'HIGHLY_TOXIC',  // Toxic when wet
    contact_ld50_ug_bee: 0.0025,
    residual_toxicity_days: 0,  // Safe once dry
    flowering_banned: false,  // Allowed with time restriction
    evening_spray_allowed: true,  // MUST spray after bees gone
    pollinator_safe_alternatives: [],
  },
  
  // FUNGICIDES - GENERALLY SAFE
  {
    chemical: 'Mancozeb',
    active_ingredient: 'Mancozeb',
    bee_toxicity: 'RELATIVELY_NONTOXIC',
    residual_toxicity_days: 0,
    flowering_banned: false,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: [],
  },
  {
    chemical: 'Sulphur',
    active_ingredient: 'Sulphur',
    bee_toxicity: 'RELATIVELY_NONTOXIC',
    residual_toxicity_days: 0,
    flowering_banned: false,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: [],
  },
  {
    chemical: 'Copper Oxychloride',
    active_ingredient: 'Copper',
    bee_toxicity: 'RELATIVELY_NONTOXIC',
    residual_toxicity_days: 0,
    flowering_banned: false,
    evening_spray_allowed: true,
    pollinator_safe_alternatives: [],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CROPS WITH HIGH POLLINATOR DEPENDENCY
// ═══════════════════════════════════════════════════════════════════════════

export const POLLINATOR_DEPENDENT_CROPS: Record<string, {
  dependency_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  flowering_days_after_sowing?: { start: number; end: number };
  key_pollinators: string[];
}> = {
  'COTTON': {
    dependency_level: 'MEDIUM',
    flowering_days_after_sowing: { start: 50, end: 100 },
    key_pollinators: ['Honeybee', 'Bumblebee', 'Wild bees'],
  },
  'SUNFLOWER': {
    dependency_level: 'HIGH',
    flowering_days_after_sowing: { start: 55, end: 75 },
    key_pollinators: ['Honeybee', 'Bumblebee'],
  },
  'MUSTARD': {
    dependency_level: 'HIGH',
    flowering_days_after_sowing: { start: 40, end: 70 },
    key_pollinators: ['Honeybee', 'Syrphid flies'],
  },
  'ONION': {
    dependency_level: 'HIGH',
    flowering_days_after_sowing: { start: 90, end: 120 },
    key_pollinators: ['Honeybee', 'Flies'],
  },
  'GROUNDNUT': {
    dependency_level: 'MEDIUM',
    flowering_days_after_sowing: { start: 35, end: 75 },
    key_pollinators: ['Bees'],
  },
  'TOMATO': {
    dependency_level: 'MEDIUM',
    flowering_days_after_sowing: { start: 40, end: 90 },
    key_pollinators: ['Bumblebee', 'Sweat bees'],
  },
  'CHILLI': {
    dependency_level: 'HIGH',
    flowering_days_after_sowing: { start: 45, end: 120 },
    key_pollinators: ['Honeybee', 'Wild bees'],
  },
  'BRINJAL': {
    dependency_level: 'HIGH',
    flowering_days_after_sowing: { start: 50, end: 120 },
    key_pollinators: ['Bumblebee', 'Carpenter bee'],
  },
  'CUCUMBER': {
    dependency_level: 'HIGH',
    flowering_days_after_sowing: { start: 35, end: 70 },
    key_pollinators: ['Honeybee', 'Squash bee'],
  },
  'POMEGRANATE': {
    dependency_level: 'HIGH',
    key_pollinators: ['Honeybee', 'Carpenter bee'],
  },
  'MANGO': {
    dependency_level: 'HIGH',
    key_pollinators: ['Honeybee', 'Flies', 'Wasps'],
  },
  'CITRUS': {
    dependency_level: 'HIGH',
    key_pollinators: ['Honeybee'],
  },
  'GRAPES': {
    dependency_level: 'LOW',
    key_pollinators: [],  // Self-pollinating
  },
  'BANANA': {
    dependency_level: 'NONE',
    key_pollinators: [],  // Parthenocarpic
  },
  'WHEAT': {
    dependency_level: 'NONE',
    key_pollinators: [],  // Wind-pollinated
  },
  'RICE': {
    dependency_level: 'NONE',
    key_pollinators: [],  // Self-pollinated
  },
  'MAIZE': {
    dependency_level: 'LOW',
    key_pollinators: [],  // Wind-pollinated (bees visit for pollen)
  },
  'SUGARCANE': {
    dependency_level: 'NONE',
    key_pollinators: [],  // Vegetatively propagated
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// POLLINATOR PROTECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get pollinator toxicity profile for a chemical
 */
export function getPollinatorProfile(chemicalName: string): ChemicalPollinatorProfile | undefined {
  return POLLINATOR_TOXICITY_DB.find(
    c => c.chemical.toLowerCase() === chemicalName.toLowerCase() ||
         c.active_ingredient.toLowerCase() === chemicalName.toLowerCase()
  );
}

/**
 * Check if crop is in flowering stage based on days after sowing
 */
export function isFloweringStage(
  cropCode: string,
  daysAfterSowing: number
): boolean {
  const cropInfo = POLLINATOR_DEPENDENT_CROPS[cropCode.toUpperCase()];
  
  if (!cropInfo || !cropInfo.flowering_days_after_sowing) {
    // Default flowering window for unknown crops
    return daysAfterSowing >= 50 && daysAfterSowing <= 90;
  }
  
  return daysAfterSowing >= cropInfo.flowering_days_after_sowing.start &&
         daysAfterSowing <= cropInfo.flowering_days_after_sowing.end;
}

/**
 * Check if a chemical is safe for pollinators
 */
export function checkPollinatorSafety(
  chemicalName: string,
  isFlowering: boolean,
  currentHour?: number  // 0-23
): PollinatorCheckResult {
  const profile = getPollinatorProfile(chemicalName);
  
  const result: PollinatorCheckResult = {
    is_safe: true,
    chemical_name: chemicalName,
    risk_level: 'NONE',
    alternative_suggestions: [],
    scientific_basis: '',
  };
  
  // If chemical not found, assume moderate risk
  if (!profile) {
    result.is_safe = false;
    result.risk_level = 'MEDIUM';
    result.block_reason = `Unknown chemical toxicity to pollinators. Avoid spraying during flowering.`;
    result.scientific_basis = 'Precautionary principle - unknown toxicity';
    result.scientific_basis = 'Precautionary principle - unknown toxicity';
    return result;
  }
  
  // Map toxicity to risk level
  switch (profile.bee_toxicity) {
    case 'HIGHLY_TOXIC':
      result.risk_level = 'EXTREME';
      break;
    case 'MODERATELY_TOXIC':
      result.risk_level = 'HIGH';
      break;
    case 'RELATIVELY_NONTOXIC':
      result.risk_level = 'LOW';
      break;
  }
  
  result.alternative_suggestions = profile.pollinator_safe_alternatives;
  
  // If not flowering, most chemicals are acceptable
  if (!isFlowering) {
    result.is_safe = true;
    if (profile.bee_toxicity === 'HIGHLY_TOXIC') {
      result.scientific_basis = `${chemicalName} is highly toxic to bees but crop is not flowering. Use with caution if bees are foraging nearby on other plants.`;
    }
    return result;
  }
  
  // FLOWERING STAGE - Apply strict rules
  
  // Completely banned during flowering
  if (profile.flowering_banned && profile.bee_toxicity === 'HIGHLY_TOXIC') {
    result.is_safe = false;
    result.block_reason = `BLOCKED: ${chemicalName} is HIGHLY TOXIC to bees (LD50: ${profile.contact_ld50_ug_bee || 'very low'} µg/bee). DO NOT spray during flowering. Bees visiting flowers will be killed, destroying pollination and honey production.`;
    result.scientific_basis = `Neonicotinoids and pyrethroids cause acute bee mortality. LD50 values indicate lethal dose for 50% of bee population. Values below 2 µg/bee are highly toxic.`;
    return result;
  }
  
  // Evening spray allowed for some chemicals
  if (profile.evening_spray_allowed && profile.flowering_banned) {
    const isEvening = currentHour !== undefined && (currentHour >= 19 || currentHour <= 6);
    
    if (isEvening) {
      result.is_safe = true;
      result.time_restriction = {
        allowed_hours: 'After 7 PM to before 6 AM',
        reason: 'Bees have returned to hive, chemical will dry before morning',
      };
      result.scientific_basis = `${chemicalName} is toxic to bees on contact but breaks down quickly. Spraying after sunset allows chemical to dry before bees emerge, reducing risk.`;
    } else {
      result.is_safe = false;
      result.risk_level = 'HIGH';
      result.block_reason = `${chemicalName} is toxic to bees during flowering. ONLY spray after 7 PM when bees have returned to their hive. Chemical will dry overnight and be safer by morning.`;
      result.time_restriction = {
        allowed_hours: 'After 7 PM only',
        reason: 'Spray after bees return to hive',
      };
      result.scientific_basis = 'Pyrethroids are toxic on contact but degrade with UV light. Evening application allows drying before bees emerge.';
    }
    return result;
  }
  
  // Safe chemicals during flowering
  if (!profile.flowering_banned && profile.bee_toxicity === 'RELATIVELY_NONTOXIC') {
    result.is_safe = true;
    result.scientific_basis = `${chemicalName} is relatively non-toxic to bees and can be safely applied during flowering.`;
  }
  
  return result;
}

/**
 * Main pollinator protection enforcement function
 */
export function enforcePollinatorProtection(
  chemicals: string[],
  cropCode: string,
  daysAfterSowing: number,
  currentHour?: number
): PollinatorEnforcementResult {
  const isFlowering = isFloweringStage(cropCode, daysAfterSowing);
  const cropInfo = POLLINATOR_DEPENDENT_CROPS[cropCode.toUpperCase()];
  
  const blocked: PollinatorCheckResult[] = [];
  const allowed: PollinatorCheckResult[] = [];
  const timeRestricted: PollinatorCheckResult[] = [];
  
  for (const chemical of chemicals) {
    const result = checkPollinatorSafety(chemical, isFlowering, currentHour);
    
    if (!result.is_safe && !result.time_restriction) {
      blocked.push(result);
    } else if (result.time_restriction) {
      timeRestricted.push(result);
    } else {
      allowed.push(result);
    }
  }
  
  // Get safe alternatives
  const safeAlternatives = POLLINATOR_TOXICITY_DB
    .filter(c => c.bee_toxicity === 'RELATIVELY_NONTOXIC')
    .map(c => c.chemical);
  
  // English-only advice — LLM narration layer translates at runtime
  let generalAdvice = '';
  
  if (isFlowering) {
    if (cropInfo?.dependency_level === 'HIGH') {
      generalAdvice = `CRITICAL: ${cropCode} is flowering and highly dependent on pollinators. Use ONLY pollinator-safe products (Neem, Bt, NPV). Avoid all neonicotinoids and pyrethroids.`;
    } else {
      generalAdvice = `Crop is flowering. Prefer pollinator-friendly options. If chemical spray essential, spray after 7 PM when bees have returned to hive.`;
    }
  } else {
    generalAdvice = 'Crop is not in flowering stage. Standard spray guidelines apply. Still avoid spraying if bees are foraging on nearby flowering plants.';
  }
  
  return {
    is_flowering_stage: isFlowering,
    crop_code: cropCode,
    blocked_chemicals: blocked,
    allowed_chemicals: allowed,
    time_restricted_chemicals: timeRestricted,
    safe_alternatives: safeAlternatives,
    general_advice: generalAdvice,
  };
}

// Export version
export const POLLINATOR_PROTECTION_VERSION = '1.0.0';
