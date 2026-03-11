/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PRE-HARVEST INTERVAL (PHI) ENFORCEMENT GUARDIAN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL SAFETY SYSTEM: Blocks chemical recommendations when days to
 * harvest violates Pre-Harvest Interval safety limits.
 * 
 * Compliance Standards:
 * - CIB&RC (Central Insecticide Board & Registration Committee)
 * - FSSAI MRL Standards
 * - APEDA Export Guidelines
 * - EU/Codex MRL Database
 * 
 * Version: 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PHICheckResult {
  chemical_name: string;
  is_safe: boolean;
  days_to_harvest: number;
  required_phi_days: number;
  violation_type?: 'DOMESTIC_PHI' | 'EXPORT_PHI' | 'ORGANIC_VIOLATION' | 'MRL_EXCEEDANCE';
  block_reason?: string;
  block_reason_mr?: string;
  block_reason_hi?: string;
  alternative_suggestions: string[];
  safe_spray_date?: string; // Date before which spraying was safe
}

export interface PHIEnforcementResult {
  blocked_chemicals: PHICheckResult[];
  allowed_chemicals: PHICheckResult[];
  safe_alternatives: string[];
  days_to_harvest: number;
  is_near_harvest: boolean;
  harvest_date?: string;
  general_advice: string;
  general_advice_mr: string;
  general_advice_hi: string;
}

export interface ChemicalPHIProfile {
  chemical: string;
  active_ingredient: string;
  phi_days_domestic: number;
  phi_days_export_eu?: number;
  phi_days_export_us?: number;
  phi_days_export_me?: number; // Middle East
  who_toxicity_class: 'IA' | 'IB' | 'II' | 'III' | 'U';
  organic_allowed: boolean;
  crop_specific_phi?: Record<string, number>;
  mrl_fssai_ppm?: number;
  mrl_eu_ppm?: number;
  pollinator_safe: boolean;
  flowering_restricted: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE PHI DATABASE (CIB&RC + FSSAI + EU Standards)
// ═══════════════════════════════════════════════════════════════════════════

export const PHI_DATABASE: ChemicalPHIProfile[] = [
  // NEONICOTINOIDS
  {
    chemical: 'Imidacloprid',
    active_ingredient: 'Imidacloprid',
    phi_days_domestic: 7,
    phi_days_export_eu: 14,
    phi_days_export_us: 10,
    who_toxicity_class: 'II',
    organic_allowed: false,
    mrl_fssai_ppm: 0.5,
    mrl_eu_ppm: 0.05,
    pollinator_safe: false,
    flowering_restricted: true,
    crop_specific_phi: {
      'COTTON': 10,
      'VEGETABLES': 7,
      'RICE': 14,
    },
  },
  {
    chemical: 'Thiamethoxam',
    active_ingredient: 'Thiamethoxam',
    phi_days_domestic: 7,
    phi_days_export_eu: 21,
    who_toxicity_class: 'III',
    organic_allowed: false,
    mrl_fssai_ppm: 0.3,
    mrl_eu_ppm: 0.02,
    pollinator_safe: false,
    flowering_restricted: true,
  },
  {
    chemical: 'Acetamiprid',
    active_ingredient: 'Acetamiprid',
    phi_days_domestic: 3,
    phi_days_export_eu: 7,
    who_toxicity_class: 'III',
    organic_allowed: false,
    mrl_fssai_ppm: 0.5,
    mrl_eu_ppm: 0.1,
    pollinator_safe: false,
    flowering_restricted: true,
  },
  
  // PYRETHROIDS
  {
    chemical: 'Cypermethrin',
    active_ingredient: 'Cypermethrin',
    phi_days_domestic: 5,
    phi_days_export_eu: 10,
    who_toxicity_class: 'II',
    organic_allowed: false,
    mrl_fssai_ppm: 0.5,
    mrl_eu_ppm: 0.05,
    pollinator_safe: false,
    flowering_restricted: false,
  },
  {
    chemical: 'Deltamethrin',
    active_ingredient: 'Deltamethrin',
    phi_days_domestic: 5,
    phi_days_export_eu: 7,
    who_toxicity_class: 'II',
    organic_allowed: false,
    mrl_fssai_ppm: 0.3,
    mrl_eu_ppm: 0.02,
    pollinator_safe: false,
    flowering_restricted: false,
  },
  {
    chemical: 'Lambda-cyhalothrin',
    active_ingredient: 'Lambda-cyhalothrin',
    phi_days_domestic: 5,
    phi_days_export_eu: 7,
    who_toxicity_class: 'II',
    organic_allowed: false,
    mrl_fssai_ppm: 0.2,
    mrl_eu_ppm: 0.02,
    pollinator_safe: false,
    flowering_restricted: false,
  },
  
  // ORGANOPHOSPHATES
  {
    chemical: 'Chlorpyrifos',
    active_ingredient: 'Chlorpyrifos',
    phi_days_domestic: 15,
    phi_days_export_eu: 30, // Effectively banned in EU
    who_toxicity_class: 'II',
    organic_allowed: false,
    mrl_fssai_ppm: 0.5,
    mrl_eu_ppm: 0.01, // Very strict
    pollinator_safe: false,
    flowering_restricted: false,
  },
  {
    chemical: 'Profenofos',
    active_ingredient: 'Profenofos',
    phi_days_domestic: 14,
    phi_days_export_eu: 21,
    who_toxicity_class: 'II',
    organic_allowed: false,
    mrl_fssai_ppm: 2.0,
    mrl_eu_ppm: 0.01,
    pollinator_safe: false,
    flowering_restricted: false,
  },
  {
    chemical: 'Quinalphos',
    active_ingredient: 'Quinalphos',
    phi_days_domestic: 10,
    phi_days_export_eu: 21,
    who_toxicity_class: 'II',
    organic_allowed: false,
    mrl_fssai_ppm: 0.5,
    mrl_eu_ppm: 0.01,
    pollinator_safe: false,
    flowering_restricted: false,
  },
  
  // DIAMIDES (Safer, shorter PHI)
  {
    chemical: 'Chlorantraniliprole',
    active_ingredient: 'Chlorantraniliprole',
    phi_days_domestic: 3,
    phi_days_export_eu: 5,
    who_toxicity_class: 'U',
    organic_allowed: false,
    mrl_fssai_ppm: 2.0,
    mrl_eu_ppm: 0.5,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'Flubendiamide',
    active_ingredient: 'Flubendiamide',
    phi_days_domestic: 5,
    phi_days_export_eu: 7,
    who_toxicity_class: 'U',
    organic_allowed: false,
    mrl_fssai_ppm: 1.0,
    mrl_eu_ppm: 0.3,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  
  // FUNGICIDES
  {
    chemical: 'Mancozeb',
    active_ingredient: 'Mancozeb',
    phi_days_domestic: 7,
    phi_days_export_eu: 14,
    who_toxicity_class: 'III',
    organic_allowed: false,
    mrl_fssai_ppm: 3.0,
    mrl_eu_ppm: 0.05,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'Carbendazim',
    active_ingredient: 'Carbendazim',
    phi_days_domestic: 7,
    phi_days_export_eu: 21, // Strict in EU
    who_toxicity_class: 'III',
    organic_allowed: false,
    mrl_fssai_ppm: 2.0,
    mrl_eu_ppm: 0.1,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'Tebuconazole',
    active_ingredient: 'Tebuconazole',
    phi_days_domestic: 7,
    phi_days_export_eu: 14,
    who_toxicity_class: 'III',
    organic_allowed: false,
    mrl_fssai_ppm: 0.5,
    mrl_eu_ppm: 0.1,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'Propiconazole',
    active_ingredient: 'Propiconazole',
    phi_days_domestic: 14,
    phi_days_export_eu: 21,
    who_toxicity_class: 'III',
    organic_allowed: false,
    mrl_fssai_ppm: 0.5,
    mrl_eu_ppm: 0.1,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'Copper Oxychloride',
    active_ingredient: 'Copper',
    phi_days_domestic: 5,
    phi_days_export_eu: 7,
    who_toxicity_class: 'III',
    organic_allowed: true,
    mrl_fssai_ppm: 30.0,
    mrl_eu_ppm: 20.0,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'Sulphur',
    active_ingredient: 'Sulphur',
    phi_days_domestic: 1,
    phi_days_export_eu: 1,
    who_toxicity_class: 'U',
    organic_allowed: true,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  
  // BIOPESTICIDES (Zero/minimal PHI)
  {
    chemical: 'Neem Oil',
    active_ingredient: 'Azadirachtin',
    phi_days_domestic: 0,
    phi_days_export_eu: 1,
    who_toxicity_class: 'U',
    organic_allowed: true,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'Neem Seed Kernel Extract',
    active_ingredient: 'Azadirachtin',
    phi_days_domestic: 0,
    phi_days_export_eu: 1,
    who_toxicity_class: 'U',
    organic_allowed: true,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'Bacillus thuringiensis (Bt)',
    active_ingredient: 'Bt kurstaki',
    phi_days_domestic: 0,
    phi_days_export_eu: 0,
    who_toxicity_class: 'U',
    organic_allowed: true,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'NPV (Nuclear Polyhedrosis Virus)',
    active_ingredient: 'NPV HaNPV/SlNPV',
    phi_days_domestic: 0,
    phi_days_export_eu: 0,
    who_toxicity_class: 'U',
    organic_allowed: true,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'Beauveria bassiana',
    active_ingredient: 'Beauveria bassiana',
    phi_days_domestic: 0,
    phi_days_export_eu: 0,
    who_toxicity_class: 'U',
    organic_allowed: true,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'Trichoderma viride',
    active_ingredient: 'Trichoderma viride',
    phi_days_domestic: 0,
    phi_days_export_eu: 0,
    who_toxicity_class: 'U',
    organic_allowed: true,
    pollinator_safe: true,
    flowering_restricted: false,
  },
  {
    chemical: 'Spinosad',
    active_ingredient: 'Spinosad',
    phi_days_domestic: 3,
    phi_days_export_eu: 5,
    who_toxicity_class: 'III',
    organic_allowed: true,
    mrl_fssai_ppm: 1.0,
    mrl_eu_ppm: 0.5,
    pollinator_safe: false, // Toxic to bees when wet
    flowering_restricted: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SAFE ALTERNATIVES FOR NEAR-HARVEST
// ═══════════════════════════════════════════════════════════════════════════

export const NEAR_HARVEST_ALTERNATIVES = [
  {
    name: 'Neem Oil 1500 ppm',
    phi_days: 0,
    target: ['APHID', 'WHITEFLY', 'JASSID', 'MITES', 'THRIPS'],
    method: 'Foliar spray @ 5 ml/L',
    organic_safe: true,
    name_mr: 'कडुनिंब तेल',
    name_hi: 'नीम तेल',
  },
  {
    name: 'Bt (Bacillus thuringiensis)',
    phi_days: 0,
    target: ['CATERPILLAR', 'BOLLWORM', 'ARMYWORM', 'FRUIT_BORER'],
    method: 'Foliar spray @ 1 g/L',
    organic_safe: true,
    name_mr: 'बीटी पावडर',
    name_hi: 'बीटी पाउडर',
  },
  {
    name: 'NPV (Nuclear Polyhedrosis Virus)',
    phi_days: 0,
    target: ['BOLLWORM', 'SPODOPTERA', 'HELICOVERPA'],
    method: 'Foliar spray in evening @ 250 LE/acre',
    organic_safe: true,
    name_mr: 'एनपीव्ही',
    name_hi: 'एनपीवी',
  },
  {
    name: 'Beauveria bassiana',
    phi_days: 0,
    target: ['WHITEFLY', 'APHID', 'THRIPS', 'MEALYBUG'],
    method: 'Foliar spray @ 5 g/L in evening',
    organic_safe: true,
    name_mr: 'ब्यूव्हेरिया',
    name_hi: 'ब्यूवेरिया',
  },
  {
    name: 'Pongamia Oil',
    phi_days: 0,
    target: ['MITES', 'APHID', 'THRIPS'],
    method: 'Foliar spray @ 10 ml/L',
    organic_safe: true,
    name_mr: 'करंज तेल',
    name_hi: 'करंजा तेल',
  },
  {
    name: 'Yellow Sticky Traps',
    phi_days: 0,
    target: ['WHITEFLY', 'APHID', 'JASSID', 'THRIPS'],
    method: '10-15 traps per acre',
    organic_safe: true,
    name_mr: 'पिवळे चिकट सापळे',
    name_hi: 'पीले चिपचिपे जाल',
  },
  {
    name: 'Physical Removal',
    phi_days: 0,
    target: ['CATERPILLAR', 'MEALYBUG', 'LEAF_MINER'],
    method: 'Hand picking of affected leaves/insects',
    organic_safe: true,
    name_mr: 'हाताने किडे/पानं काढणे',
    name_hi: 'हाथ से कीड़े/पत्ते निकालना',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PHI ENFORCEMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get PHI profile for a chemical
 */
export function getChemicalPHI(chemicalName: string): ChemicalPHIProfile | undefined {
  return PHI_DATABASE.find(
    c => c.chemical.toLowerCase() === chemicalName.toLowerCase() ||
         c.active_ingredient.toLowerCase() === chemicalName.toLowerCase()
  );
}

/**
 * Check if a chemical is safe to apply given days to harvest
 */
export function checkPHISafety(
  chemicalName: string,
  daysToHarvest: number,
  cropCode?: string,
  targetMarket: 'DOMESTIC' | 'EU' | 'USA' | 'MIDDLE_EAST' = 'DOMESTIC',
  isOrganicFarm: boolean = false
): PHICheckResult {
  const profile = getChemicalPHI(chemicalName);
  
  const result: PHICheckResult = {
    chemical_name: chemicalName,
    is_safe: false,
    days_to_harvest: daysToHarvest,
    required_phi_days: 999,
    alternative_suggestions: [],
  };
  
  // If chemical not found in database, block with warning
  if (!profile) {
    result.is_safe = false;
    result.block_reason = `Unknown chemical - cannot verify PHI safety. Consult agricultural officer.`;
    return result;
    return result;
  }
  
  // Check organic violation
  if (isOrganicFarm && !profile.organic_allowed) {
    result.is_safe = false;
    result.violation_type = 'ORGANIC_VIOLATION';
    result.block_reason = `${chemicalName} is not allowed in organic farming. Using synthetic chemicals will void organic certification.`;
    result.alternative_suggestions = NEAR_HARVEST_ALTERNATIVES
      .filter(a => a.organic_safe)
      .map(a => a.name);
    return result;
  }
  
  // Determine required PHI based on market
  let requiredPHI = profile.phi_days_domestic;
  
  switch (targetMarket) {
    case 'EU':
      requiredPHI = profile.phi_days_export_eu || profile.phi_days_domestic + 7;
      break;
    case 'USA':
      requiredPHI = profile.phi_days_export_us || profile.phi_days_domestic + 5;
      break;
    case 'MIDDLE_EAST':
      requiredPHI = profile.phi_days_export_me || profile.phi_days_domestic;
      break;
  }
  
  // Check crop-specific PHI if available
  if (cropCode && profile.crop_specific_phi?.[cropCode.toUpperCase()]) {
    requiredPHI = Math.max(requiredPHI, profile.crop_specific_phi[cropCode.toUpperCase()]);
  }
  
  result.required_phi_days = requiredPHI;
  
  // Check if safe
  if (daysToHarvest >= requiredPHI) {
    result.is_safe = true;
    return result;
  }
  
  // PHI VIOLATION - Block the chemical
  result.is_safe = false;
  result.violation_type = targetMarket !== 'DOMESTIC' ? 'EXPORT_PHI' : 'DOMESTIC_PHI';
  
  const shortfall = requiredPHI - daysToHarvest;
  
  result.block_reason = `BLOCKED: ${chemicalName} requires ${requiredPHI} days before harvest, but only ${daysToHarvest} days remain. Spraying now will result in residue above safe limits (MRL violation).`;
  
  // Calculate when it would have been safe
  const safeSprayDaysAgo = shortfall;
  result.safe_spray_date = `${safeSprayDaysAgo} days ago`;
  
  // Suggest alternatives based on pest target
  result.alternative_suggestions = NEAR_HARVEST_ALTERNATIVES
    .filter(a => a.phi_days <= daysToHarvest)
    .map(a => `${a.name} (PHI: ${a.phi_days} days)`);
  
  return result;
}

/**
 * Main PHI Enforcement function - checks multiple chemicals
 */
export function enforcePHI(
  chemicals: string[],
  daysToHarvest: number,
  cropCode?: string,
  targetMarket: 'DOMESTIC' | 'EU' | 'USA' | 'MIDDLE_EAST' = 'DOMESTIC',
  isOrganicFarm: boolean = false,
  harvestDate?: string
): PHIEnforcementResult {
  const blocked: PHICheckResult[] = [];
  const allowed: PHICheckResult[] = [];
  
  for (const chemical of chemicals) {
    const result = checkPHISafety(
      chemical, 
      daysToHarvest, 
      cropCode, 
      targetMarket, 
      isOrganicFarm
    );
    
    if (result.is_safe) {
      allowed.push(result);
    } else {
      blocked.push(result);
    }
  }
  
  // Determine near-harvest status
  const isNearHarvest = daysToHarvest <= 14;
  
  // Get safe alternatives for the pest problems
  const safeAlternatives = NEAR_HARVEST_ALTERNATIVES
    .filter(a => a.phi_days <= daysToHarvest)
    .map(a => a.name);
  
  // Generate general advice
  let generalAdvice = '';
  let generalAdvice_mr = '';
  let generalAdvice_hi = '';
  
  if (daysToHarvest <= 3) {
    generalAdvice = 'CRITICAL: With ≤3 days to harvest, no synthetic chemicals are safe. Use only physical removal, trapping, or accept minor damage. Do NOT spray any chemicals.';
    generalAdvice_mr = 'महत्त्वाचे: कापणीला ३ दिवस किंवा कमी असल्यास कोणतेही रासायनिक औषध वापरू नका. फक्त हाताने किडे काढणे किंवा सापळे वापरा.';
    generalAdvice_hi = 'महत्वपूर्ण: कटाई में 3 दिन या कम बचे हैं, कोई भी रासायनिक दवाई न लगाएं। केवल हाथ से कीड़े निकालें या जाल का उपयोग करें।';
  } else if (daysToHarvest <= 7) {
    generalAdvice = 'Near harvest (3-7 days): Use only biopesticides with 0-3 day PHI (Neem oil, Bt, NPV). Avoid all synthetic chemicals.';
    generalAdvice_mr = 'कापणी जवळ (३-७ दिवस): फक्त जैविक औषधे वापरा (निंब तेल, बीटी, एनपीव्ही). सर्व रासायनिक औषधे टाळा.';
    generalAdvice_hi = 'कटाई निकट (3-7 दिन): केवल जैविक दवाइयाँ लगाएं (नीम तेल, बीटी, एनपीवी)। सभी रासायनिक दवाइयों से बचें।';
  } else if (daysToHarvest <= 14) {
    generalAdvice = 'Approaching harvest (7-14 days): Use short PHI chemicals only. Verify PHI before spraying. Prefer biopesticides.';
    generalAdvice_mr = 'कापणी जवळ (७-१४ दिवस): फक्त कमी PHI असलेली औषधे वापरा. फवारणीपूर्वी PHI तपासा. जैविक औषधे प्राधान्य द्या.';
    generalAdvice_hi = 'कटाई निकट (7-14 दिन): केवल कम PHI वाली दवाइयाँ लगाएं। छिड़काव से पहले PHI जाँचें। जैविक दवाइयाँ प्राथमिकता दें।';
  } else {
    generalAdvice = 'Normal spray window. Ensure PHI is respected before harvest. Keep records of spray dates.';
    generalAdvice_mr = 'सामान्य फवारणी कालावधी. कापणीपूर्वी PHI पाळा. फवारणी तारखांची नोंद ठेवा.';
    generalAdvice_hi = 'सामान्य छिड़काव अवधि। कटाई से पहले PHI का पालन करें। छिड़काव की तारीखों का रिकॉर्ड रखें।';
  }
  
  return {
    blocked_chemicals: blocked,
    allowed_chemicals: allowed,
    safe_alternatives: safeAlternatives,
    days_to_harvest: daysToHarvest,
    is_near_harvest: isNearHarvest,
    harvest_date: harvestDate,
    general_advice: generalAdvice,
    general_advice_mr: generalAdvice_mr,
    general_advice_hi: generalAdvice_hi,
  };
}

/**
 * Get alternative suggestions for a blocked chemical
 */
export function getSafeAlternativesForPest(
  pestCode: string,
  daysToHarvest: number
): Array<{
  name: string;
  name_mr: string;
  name_hi: string;
  method: string;
  phi_days: number;
}> {
  return NEAR_HARVEST_ALTERNATIVES
    .filter(a => a.target.includes(pestCode.toUpperCase()) && a.phi_days <= daysToHarvest)
    .map(a => ({
      name: a.name,
      name_mr: a.name_mr,
      name_hi: a.name_hi,
      method: a.method,
      phi_days: a.phi_days,
    }));
}

// Export version
export const PHI_GUARDIAN_VERSION = '1.0.0';
