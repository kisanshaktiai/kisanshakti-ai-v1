/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHEMICAL SAFETY RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P0 (Emergency Override) & P1 (Regulatory Compliance)
 * Based on: GOI CIB&RC, WHO Pesticide Hazard Classification, ICAR Guidelines
 * 
 * These rules OVERRIDE all other decision layers for safety.
 */

import { 
  CauseRule, 
  Cause, 
  PriorityLevel,
  WHOToxicityClass,
  DecisionInput 
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// BANNED PESTICIDES IN INDIA (COMPLETELY BANNED)
// ═══════════════════════════════════════════════════════════════════════════

export const BANNED_CHEMICALS: { name: string; banYear: number; reason: string }[] = [
  { name: 'Monocrotophos', banYear: 2020, reason: 'High human toxicity, bird kills' },
  { name: 'Endosulfan', banYear: 2011, reason: 'Environmental persistence, health issues' },
  { name: 'Carbofuran', banYear: 2020, reason: 'High toxicity, bird mortality' },
  { name: 'Phorate', banYear: 2020, reason: 'Severe human toxicity' },
  { name: 'Triazophos', banYear: 2020, reason: 'Safety concerns' },
  { name: 'Methomyl', banYear: 2020, reason: 'High acute toxicity' },
  { name: 'Methyl Parathion', banYear: 2018, reason: 'Extreme toxicity' },
  { name: 'Phosphamidon', banYear: 2018, reason: 'High mammalian toxicity' },
  { name: 'Ethyl Parathion', banYear: 2018, reason: 'Extreme toxicity' },
  { name: 'Dieldrin', banYear: 2003, reason: 'Persistent organic pollutant' },
  { name: 'Aldrin', banYear: 2003, reason: 'Persistent organic pollutant' },
  { name: 'Chlordane', banYear: 2003, reason: 'Persistent organic pollutant' },
  { name: 'Heptachlor', banYear: 2003, reason: 'Persistent organic pollutant' },
  { name: 'BHC', banYear: 1997, reason: 'Carcinogenic potential' },
  { name: 'DDT', banYear: 1989, reason: 'Environmental persistence (except malaria)' },
  { name: 'Aldicarb', banYear: 2018, reason: 'Extreme toxicity' },
  { name: 'Captafol', banYear: 2018, reason: 'Carcinogenic' },
  { name: 'Nicotine Sulfate', banYear: 2018, reason: 'High toxicity' },
  { name: 'Sodium Cyanide', banYear: 2018, reason: 'Extreme toxicity' },
  { name: 'Ethylene Dibromide', banYear: 2001, reason: 'Carcinogenic' },
  { name: 'Maleic Hydrazide', banYear: 2018, reason: 'Residue concerns' },
  { name: 'Pentachlorophenol', banYear: 2018, reason: 'Carcinogenic' },
  { name: 'Tetradifon', banYear: 2018, reason: 'Safety concerns' },
  { name: 'Phenyl Mercury Acetate', banYear: 2018, reason: 'Mercury toxicity' },
  { name: 'Chlorobenzilate', banYear: 2018, reason: 'Safety concerns' },
  { name: 'TCA', banYear: 2018, reason: 'Residue concerns' },
  { name: 'Lindane', banYear: 2013, reason: 'POP, neurotoxicity' },
  { name: 'Alachlor', banYear: 2018, reason: 'Carcinogenic potential' },
];

// ═══════════════════════════════════════════════════════════════════════════
// RESTRICTED CHEMICALS (REQUIRES LICENSE/SPECIAL HANDLING)
// ═══════════════════════════════════════════════════════════════════════════

export const RESTRICTED_CHEMICALS: { name: string; restriction: string; reason: string }[] = [
  { name: 'Chlorpyrifos', restriction: 'Banned for household, restricted agriculture', reason: 'Neurotoxicity concerns' },
  { name: 'Profenofos', restriction: 'Requires applicator training', reason: 'Moderate toxicity' },
  { name: 'Aluminum Phosphide', restriction: 'Licensed applicators only', reason: 'Phosphine gas toxicity' },
  { name: 'Ethion', restriction: 'Restricted use', reason: 'Residue concerns' },
  { name: 'Dicofol', restriction: 'Restricted use', reason: 'DDT impurities' },
  { name: '2,4-D', restriction: 'Restricted near sensitive crops', reason: 'Volatility, drift risk' },
  { name: 'Paraquat', restriction: 'Restricted sale', reason: 'No antidote, fatal if ingested' },
];

// ═══════════════════════════════════════════════════════════════════════════
// WHO TOXICITY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

export const WHO_CLASSIFICATION_RULES: {
  class: WHOToxicityClass;
  ld50Range: string;
  examples: string[];
  status: string;
  ppeRequired: string[];
}[] = [
  {
    class: WHOToxicityClass.CLASS_IA,
    ld50Range: '<5 mg/kg',
    examples: ['Parathion', 'Aldicarb'],
    status: 'DO NOT RECOMMEND - Mostly banned',
    ppeRequired: ['Full protective suit', 'Full face respirator', 'Chemical boots', 'Double gloves'],
  },
  {
    class: WHOToxicityClass.CLASS_IB,
    ld50Range: '5-50 mg/kg',
    examples: ['Carbofuran (banned)', 'Methamidophos'],
    status: 'AVOID - Use only if no alternative',
    ppeRequired: ['Full protective suit', 'Respirator', 'Chemical boots', 'Gloves'],
  },
  {
    class: WHOToxicityClass.CLASS_II,
    ld50Range: '50-500 mg/kg',
    examples: ['Chlorpyrifos', 'Cypermethrin', 'Malathion'],
    status: 'CAUTION REQUIRED',
    ppeRequired: ['Gloves', 'Mask', 'Long sleeves', 'Eye protection'],
  },
  {
    class: WHOToxicityClass.CLASS_III,
    ld50Range: '500-2000 mg/kg',
    examples: ['Malathion', 'Many pyrethroids'],
    status: 'STANDARD PRECAUTIONS',
    ppeRequired: ['Gloves', 'Mask'],
  },
  {
    class: WHOToxicityClass.CLASS_U,
    ld50Range: '>2000 mg/kg',
    examples: ['Bacillus thuringiensis', 'Some biorationals'],
    status: 'MINIMAL RISK',
    ppeRequired: ['Basic protection recommended'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CHEMICAL SAFETY RULES
// ═══════════════════════════════════════════════════════════════════════════

export const CHEMICAL_SAFETY_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // P0: BANNED CHEMICAL RULES (ABSOLUTE OVERRIDE)
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SAFETY_001',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const requestedChemical = input.metadata?.requestedChemical?.toLowerCase() || '';
      return BANNED_CHEMICALS.some(c => 
        requestedChemical.includes(c.name.toLowerCase())
      );
    },
    cause: Cause.BANNED_CHEMICAL_ATTEMPTED,
    priority: PriorityLevel.P0,
    scientific_source: 'GOI CIB&RC (Central Insecticide Board & Registration Committee)',
    scientific_basis: 'Banned pesticides pose severe risks to human health, beneficial organisms, and environment. Legal penalties for use.',
    icar_package: 'Gazette notifications 2018-2023',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // P1: RESTRICTED CHEMICAL RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SAFETY_002',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const requestedChemical = input.metadata?.requestedChemical?.toLowerCase() || '';
      return RESTRICTED_CHEMICALS.some(c => 
        requestedChemical.includes(c.name.toLowerCase())
      ) && !input.metadata?.hasApplicatorLicense;
    },
    cause: Cause.RESTRICTED_CHEMICAL_NO_LICENSE,
    priority: PriorityLevel.P1,
    scientific_source: 'CIB&RC Regulations',
    scientific_basis: 'Restricted chemicals require trained/licensed applicators to minimize poisoning risk and ensure proper handling.',
    icar_package: 'Pesticide Applicator Certification Programme',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WHO CLASS IA/IB AVOIDANCE
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SAFETY_003',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const toxicityClass = input.metadata?.chemicalToxicityClass;
      return toxicityClass === WHOToxicityClass.CLASS_IA || 
             toxicityClass === WHOToxicityClass.CLASS_IB;
    },
    cause: Cause.HIGH_TOXICITY_CHEMICAL_RISK,
    priority: PriorityLevel.P1,
    scientific_source: 'WHO Pesticide Hazard Classification 2019',
    scientific_basis: 'Class IA/IB pesticides have extreme acute toxicity. Should only be used when no alternatives exist, with full PPE and expert supervision.',
    icar_package: 'ICAR Safe Pesticide Usage Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PPE MANDATE FOR MODERATE TOXICITY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SAFETY_004',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const toxicityClass = input.metadata?.chemicalToxicityClass;
      const hasPPE = input.metadata?.applicatorHasPPE;
      return toxicityClass === WHOToxicityClass.CLASS_II && !hasPPE;
    },
    cause: Cause.PPE_REQUIRED_NOT_AVAILABLE,
    priority: PriorityLevel.P1,
    scientific_source: 'ILO Safety Guidelines, EPA WPS',
    scientific_basis: 'Class II chemicals require PPE to prevent dermal and inhalation exposure. Application without PPE leads to acute and chronic health effects.',
    icar_package: 'ICAR Safe Pesticide Usage Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // POISONING SYMPTOMS DETECTION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SAFETY_005',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      return input.metadata?.applicatorSymptoms?.includes('nausea') ||
             input.metadata?.applicatorSymptoms?.includes('dizziness') ||
             input.metadata?.applicatorSymptoms?.includes('sweating') ||
             input.metadata?.applicatorSymptoms?.includes('pupil_constriction');
    },
    cause: Cause.POISONING_SYMPTOMS_DETECTED,
    priority: PriorityLevel.P0,
    scientific_source: 'WHO Pesticide Poisoning First Aid',
    scientific_basis: 'Organophosphate/carbamate poisoning symptoms require immediate medical attention. Atropine is the antidote for OP/carbamate poisoning.',
    icar_package: 'National Poison Control Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NEONICOTINOID POLLINATOR PROTECTION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SAFETY_006',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: ['flowering'],
    conditions: (input: DecisionInput) => {
      const isFlowering = input.crop_stage === 'flowering';
      const chemical = input.metadata?.requestedChemical?.toLowerCase() || '';
      const isNeonicotinoid = ['imidacloprid', 'thiamethoxam', 'clothianidin', 'acetamiprid']
        .some(n => chemical.includes(n));
      return isFlowering && isNeonicotinoid;
    },
    cause: Cause.POLLINATOR_RISK_FLOWERING,
    priority: PriorityLevel.P1,
    scientific_source: 'EU Pollinator Protection Directive, ICAR-NBAIR',
    scientific_basis: 'Neonicotinoids are highly toxic to bees. Application during flowering causes direct bee mortality and colony collapse.',
    icar_package: 'ICAR-NBAIR Bee Protection Guidelines 2022',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CHEMICAL MIXING INCOMPATIBILITY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SAFETY_007',
    category: 'safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const chemicals = input.metadata?.chemicalsToMix || [];
      const hasCopper = chemicals.some((c: string) => c.toLowerCase().includes('copper'));
      const hasOil = chemicals.some((c: string) => 
        c.toLowerCase().includes('oil') || c.toLowerCase().includes('neem oil')
      );
      const hasSulfur = chemicals.some((c: string) => c.toLowerCase().includes('sulfur'));
      const hasCaptan = chemicals.some((c: string) => c.toLowerCase().includes('captan'));
      
      return (hasCopper && hasOil) || (hasSulfur && hasCaptan);
    },
    cause: Cause.CHEMICAL_INCOMPATIBILITY,
    priority: PriorityLevel.P2,
    scientific_source: 'Pesticide Compatibility Guidelines',
    scientific_basis: 'Copper + Oil causes phytotoxicity. Sulfur + Captan causes severe phytotoxicity. Never mix incompatible chemicals.',
    icar_package: 'ICAR Pesticide Application Manual',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SULFUR HIGH TEMPERATURE RESTRICTION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SAFETY_008',
    category: 'safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const chemical = input.metadata?.requestedChemical?.toLowerCase() || '';
      const temp = input.weather?.temperature || 25;
      return chemical.includes('sulfur') && temp > 32;
    },
    cause: Cause.TEMPERATURE_PHYTOTOXICITY_RISK,
    priority: PriorityLevel.P2,
    scientific_source: 'Phytotoxicity Guidelines',
    scientific_basis: 'Sulfur causes severe phytotoxicity above 32°C. Leaf burn and crop damage result from high-temperature application.',
    icar_package: 'ICAR Package of Practices',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SPRAY DURING BEE ACTIVITY HOURS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SAFETY_009',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: ['flowering'],
    conditions: (input: DecisionInput) => {
      const isFlowering = input.crop_stage === 'flowering';
      const currentHour = new Date().getHours();
      const isDayTime = currentHour >= 6 && currentHour <= 18;
      const isInsecticide = input.metadata?.chemicalType === 'insecticide';
      
      return isFlowering && isDayTime && isInsecticide;
    },
    cause: Cause.BEE_ACTIVITY_HOURS_SPRAY,
    priority: PriorityLevel.P3,
    scientific_source: 'ICAR-NBAIR Pollinator Guidelines',
    scientific_basis: 'Bee activity concentrated 6 AM - 6 PM. Evening application (after 6 PM) protects pollinators while maintaining pest control efficacy.',
    icar_package: 'ICAR-NBAIR Bee Protection Guidelines 2022',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FUMIGANT SAFETY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SAFETY_010',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const chemical = input.metadata?.requestedChemical?.toLowerCase() || '';
      const isFumigant = chemical.includes('aluminum phosphide') || 
                         chemical.includes('methyl bromide');
      const hasTraining = input.metadata?.hasFumigantTraining;
      
      return isFumigant && !hasTraining;
    },
    cause: Cause.FUMIGANT_SAFETY_VIOLATION,
    priority: PriorityLevel.P0,
    scientific_source: 'Fumigant Safety Regulations',
    scientific_basis: 'Fumigants release toxic gases (phosphine, methyl bromide). Improper use has caused multiple farmer deaths. Licensed applicators only.',
    icar_package: 'Central Insecticide Rules - Fumigant Provisions',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a chemical is banned in India
 */
export function isChemicalBanned(chemicalName: string): boolean {
  return BANNED_CHEMICALS.some(c => 
    chemicalName.toLowerCase().includes(c.name.toLowerCase())
  );
}

/**
 * Check if a chemical is restricted
 */
export function isChemicalRestricted(chemicalName: string): boolean {
  return RESTRICTED_CHEMICALS.some(c => 
    chemicalName.toLowerCase().includes(c.name.toLowerCase())
  );
}

/**
 * Get banned chemical info
 */
export function getBannedChemicalInfo(chemicalName: string): typeof BANNED_CHEMICALS[0] | undefined {
  return BANNED_CHEMICALS.find(c => 
    chemicalName.toLowerCase().includes(c.name.toLowerCase())
  );
}

/**
 * Get PPE requirements for WHO class
 */
export function getPPERequirements(toxicityClass: WHOToxicityClass): string[] {
  const rule = WHO_CLASSIFICATION_RULES.find(r => r.class === toxicityClass);
  return rule?.ppeRequired || ['Basic protection recommended'];
}

/**
 * Get legal alternatives for banned chemical
 */
export function getLegalAlternatives(bannedChemical: string): string[] {
  const alternatives: Record<string, string[]> = {
    'monocrotophos': ['Imidacloprid (selective)', 'Spinosad', 'Bt formulations'],
    'endosulfan': ['Cypermethrin (restricted)', 'Neem-based products', 'Chlorantraniliprole'],
    'carbofuran': ['Fipronil (restricted)', 'Chlorpyrifos (restricted)', 'Nematode-resistant varieties'],
    'phorate': ['Imidacloprid seed treatment', 'Thiamethoxam', 'Neem cake'],
    'methyl parathion': ['Cypermethrin', 'Lambda-cyhalothrin', 'Spinosad'],
  };
  
  const key = bannedChemical.toLowerCase();
  return alternatives[key] || ['Consult local agricultural officer for approved alternatives'];
}

export default CHEMICAL_SAFETY_RULES;
