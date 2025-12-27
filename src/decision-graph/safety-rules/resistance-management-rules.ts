/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESISTANCE MANAGEMENT RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P5 (IPM/Resistance)
 * Based on: IRAC Guidelines 2023, FRAC Code List, Tabashnik et al. 2021
 * 
 * Mode of Action rotation rules for insecticides and fungicides
 * to prevent resistance development.
 */

import { 
  CauseRule, 
  Cause, 
  PriorityLevel,
  InsecticideGroup,
  FungicideGroup,
  DecisionInput 
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// INSECTICIDE MODE OF ACTION GROUPS (IRAC Classification)
// ═══════════════════════════════════════════════════════════════════════════

export interface InsecticideMOA {
  group: InsecticideGroup;
  iracCode: string;
  mode: string;
  examples: string[];
  resistanceRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  maxApplicationsPerSeason: number;
  crossResistanceGroups: InsecticideGroup[];
}

export const INSECTICIDE_MOA_GROUPS: InsecticideMOA[] = [
  {
    group: InsecticideGroup.CARBAMATES,
    iracCode: '1A',
    mode: 'Acetylcholinesterase inhibitor',
    examples: ['Carbaryl', 'Carbofuran (banned)', 'Carbosulfan'],
    resistanceRisk: 'HIGH',
    maxApplicationsPerSeason: 2,
    crossResistanceGroups: [InsecticideGroup.ORGANOPHOSPHATES],
  },
  {
    group: InsecticideGroup.ORGANOPHOSPHATES,
    iracCode: '1B',
    mode: 'Acetylcholinesterase inhibitor',
    examples: ['Chlorpyrifos', 'Malathion', 'Profenofos', 'Acephate'],
    resistanceRisk: 'HIGH',
    maxApplicationsPerSeason: 2,
    crossResistanceGroups: [InsecticideGroup.CARBAMATES],
  },
  {
    group: InsecticideGroup.PYRETHROIDS,
    iracCode: '3A',
    mode: 'Sodium channel modulator',
    examples: ['Cypermethrin', 'Deltamethrin', 'Lambda-cyhalothrin', 'Bifenthrin'],
    resistanceRisk: 'VERY_HIGH',
    maxApplicationsPerSeason: 2,
    crossResistanceGroups: [],
  },
  {
    group: InsecticideGroup.NEONICOTINOIDS,
    iracCode: '4A',
    mode: 'Nicotinic acetylcholine receptor agonist',
    examples: ['Imidacloprid', 'Thiamethoxam', 'Clothianidin', 'Acetamiprid'],
    resistanceRisk: 'HIGH',
    maxApplicationsPerSeason: 2,
    crossResistanceGroups: [],
  },
  {
    group: InsecticideGroup.SPINOSYNS,
    iracCode: '5',
    mode: 'Nicotinic acetylcholine receptor allosteric modulator',
    examples: ['Spinosad', 'Spinetoram'],
    resistanceRisk: 'MEDIUM',
    maxApplicationsPerSeason: 3,
    crossResistanceGroups: [],
  },
  {
    group: InsecticideGroup.AVERMECTINS,
    iracCode: '6',
    mode: 'Glutamate-gated chloride channel agonist',
    examples: ['Abamectin', 'Emamectin benzoate'],
    resistanceRisk: 'MEDIUM',
    maxApplicationsPerSeason: 3,
    crossResistanceGroups: [],
  },
  {
    group: InsecticideGroup.DIAMIDES,
    iracCode: '28',
    mode: 'Ryanodine receptor modulator',
    examples: ['Chlorantraniliprole', 'Flubendiamide', 'Cyantraniliprole'],
    resistanceRisk: 'MEDIUM',
    maxApplicationsPerSeason: 2,
    crossResistanceGroups: [],
  },
  {
    group: InsecticideGroup.IGR,
    iracCode: '7',
    mode: 'Insect growth regulator',
    examples: ['Lufenuron', 'Novaluron', 'Diflubenzuron'],
    resistanceRisk: 'LOW',
    maxApplicationsPerSeason: 3,
    crossResistanceGroups: [],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// FUNGICIDE MODE OF ACTION GROUPS (FRAC Classification)
// ═══════════════════════════════════════════════════════════════════════════

export interface FungicideMOA {
  group: FungicideGroup;
  fracCode: string;
  mode: string;
  examples: string[];
  resistanceRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  maxApplicationsPerSeason: number;
  usePattern: 'PREVENTIVE' | 'CURATIVE' | 'BOTH';
}

export const FUNGICIDE_MOA_GROUPS: FungicideMOA[] = [
  {
    group: FungicideGroup.MULTI_SITE,
    fracCode: 'M',
    mode: 'Multi-site contact',
    examples: ['Mancozeb', 'Chlorothalonil', 'Copper oxychloride', 'Captan'],
    resistanceRisk: 'LOW',
    maxApplicationsPerSeason: 6,
    usePattern: 'PREVENTIVE',
  },
  {
    group: FungicideGroup.STROBILURINS,
    fracCode: '11',
    mode: 'Respiration inhibitor (Complex III - QoI)',
    examples: ['Azoxystrobin', 'Pyraclostrobin', 'Trifloxystrobin', 'Kresoxim-methyl'],
    resistanceRisk: 'HIGH',
    maxApplicationsPerSeason: 2,
    usePattern: 'CURATIVE',
  },
  {
    group: FungicideGroup.TRIAZOLES,
    fracCode: '3',
    mode: 'Sterol biosynthesis inhibitor (DMI)',
    examples: ['Propiconazole', 'Tebuconazole', 'Hexaconazole', 'Difenoconazole'],
    resistanceRisk: 'MEDIUM',
    maxApplicationsPerSeason: 3,
    usePattern: 'CURATIVE',
  },
  {
    group: FungicideGroup.SDHI,
    fracCode: '7',
    mode: 'Respiration inhibitor (Complex II - SDHI)',
    examples: ['Boscalid', 'Fluxapyroxad', 'Fluopyram'],
    resistanceRisk: 'HIGH',
    maxApplicationsPerSeason: 2,
    usePattern: 'BOTH',
  },
  {
    group: FungicideGroup.PHENYLAMIDES,
    fracCode: '4',
    mode: 'RNA polymerase inhibitor',
    examples: ['Metalaxyl', 'Metalaxyl-M'],
    resistanceRisk: 'HIGH',
    maxApplicationsPerSeason: 2,
    usePattern: 'CURATIVE',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// RESISTANCE MANAGEMENT RULES
// ═══════════════════════════════════════════════════════════════════════════

export const RESISTANCE_MANAGEMENT_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // INSECTICIDE ROTATION - SAME MOA CONSECUTIVE USE
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'RESISTANCE_001',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const lastGroup = input.metadata?.lastInsecticideGroup;
      const proposedGroup = input.metadata?.proposedInsecticideGroup;
      return lastGroup && proposedGroup && lastGroup === proposedGroup;
    },
    cause: Cause.SAME_MOA_CONSECUTIVE_USE,
    priority: PriorityLevel.P5,
    scientific_source: 'IRAC (Insecticide Resistance Action Committee) Guidelines 2023',
    scientific_basis: 'Never use same mode of action consecutively. Cross-resistance develops rapidly with repeated exposure to same MOA.',
    icar_package: 'Tabashnik et al. 2021 - Resistance evolution patterns',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CROSS-RESISTANCE WARNING (OP/CARBAMATE)
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'RESISTANCE_002',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const lastGroup = input.metadata?.lastInsecticideGroup;
      const proposedGroup = input.metadata?.proposedInsecticideGroup;
      const crossResistanceGroups = [InsecticideGroup.CARBAMATES, InsecticideGroup.ORGANOPHOSPHATES];
      return crossResistanceGroups.includes(lastGroup) && crossResistanceGroups.includes(proposedGroup);
    },
    cause: Cause.CROSS_RESISTANCE_RISK,
    priority: PriorityLevel.P5,
    scientific_source: 'IRAC Cross-Resistance Guidelines',
    scientific_basis: 'Organophosphates and Carbamates share same target site (AChE). Cross-resistance documented. Rotate to different MOA (Groups 4, 5, 6).',
    icar_package: 'IRAC Mode of Action Classification',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MAX APPLICATIONS PER SEASON EXCEEDED
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'RESISTANCE_003',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const proposedGroup = input.metadata?.proposedInsecticideGroup;
      const applicationCount = input.metadata?.seasonApplicationCount?.[proposedGroup] || 0;
      const groupInfo = INSECTICIDE_MOA_GROUPS.find(g => g.group === proposedGroup);
      return groupInfo && applicationCount >= groupInfo.maxApplicationsPerSeason;
    },
    cause: Cause.MAX_APPLICATIONS_EXCEEDED,
    priority: PriorityLevel.P5,
    scientific_source: 'IRAC Resistance Management Guidelines',
    scientific_basis: 'Maximum applications per season limit prevents selection pressure buildup. Exceeding limit accelerates resistance development.',
    icar_package: 'ICAR Pesticide Resistance Management',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MINIMUM ROTATION INTERVAL
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'RESISTANCE_004',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const lastGroup = input.metadata?.lastInsecticideGroup;
      const proposedGroup = input.metadata?.proposedInsecticideGroup;
      const daysSinceLastSameMOA = input.metadata?.daysSinceLastSameMOA || 0;
      return lastGroup === proposedGroup && daysSinceLastSameMOA < 60;
    },
    cause: Cause.ROTATION_INTERVAL_TOO_SHORT,
    priority: PriorityLevel.P5,
    scientific_source: 'IRAC Rotation Guidelines',
    scientific_basis: 'Return to same MOA only after 60 days minimum. This allows susceptible population recovery and dilutes resistant alleles.',
    icar_package: 'Resistance Management Principles',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BT COTTON REFUGE REQUIREMENT
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'RESISTANCE_005',
    category: 'resistance',
    crop_code: 'cotton',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const isBtCotton = input.metadata?.isBtVariety;
      const refugePercent = input.metadata?.refugeAreaPercent || 0;
      return isBtCotton && refugePercent < 20;
    },
    cause: Cause.BT_REFUGE_INSUFFICIENT,
    priority: PriorityLevel.P3,
    scientific_source: 'GOI Bt Cotton Mandatory Guidelines',
    scientific_basis: 'High Dose + Refuge (HDR) Strategy: 20% non-Bt refuge within 500m maintains susceptible pest population, dilutes resistant alleles, delays Bt resistance.',
    icar_package: 'Tabashnik & Carrière 2017 - Field-evolved resistance',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FUNGICIDE ROTATION - STROBILURIN CONSECUTIVE USE
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'RESISTANCE_006',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const lastGroup = input.metadata?.lastFungicideGroup;
      const proposedGroup = input.metadata?.proposedFungicideGroup;
      return lastGroup === FungicideGroup.STROBILURINS && proposedGroup === FungicideGroup.STROBILURINS;
    },
    cause: Cause.FUNGICIDE_SAME_MOA_CONSECUTIVE,
    priority: PriorityLevel.P5,
    scientific_source: 'FRAC (Fungicide Resistance Action Committee) Code List 2023',
    scientific_basis: 'Strobilurins (Group 11) have HIGH resistance risk. Rapid resistance development with consecutive use. Rotate to Group M or Group 3.',
    icar_package: 'Brent & Hollomon 2007 - Fungicide resistance management',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // OPTIMAL FUNGICIDE ROTATION SEQUENCE
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'RESISTANCE_007',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const sprayNumber = input.metadata?.fungicideSprayNumber || 1;
      const proposedGroup = input.metadata?.proposedFungicideGroup;
      
      // Optimal sequence: Spray 1: Multi-site, Spray 2: Triazole, Spray 3: Multi-site, Spray 4: Strobilurin
      const optimalSequence: Record<number, FungicideGroup> = {
        1: FungicideGroup.MULTI_SITE,
        2: FungicideGroup.TRIAZOLES,
        3: FungicideGroup.MULTI_SITE,
        4: FungicideGroup.STROBILURINS,
      };
      
      return sprayNumber <= 4 && proposedGroup !== optimalSequence[sprayNumber];
    },
    cause: Cause.FUNGICIDE_ROTATION_SUBOPTIMAL,
    priority: PriorityLevel.P6,
    scientific_source: 'FRAC Fungicide Rotation Strategy',
    scientific_basis: 'Optimal sequence: Multi-site (preventive) → Triazole (curative) → Multi-site (protectant) → Strobilurin (if disease persists). Maximizes efficacy, minimizes resistance.',
    icar_package: 'ICAR Disease Management Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PYRETHROID RESISTANCE WARNING
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'RESISTANCE_008',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const pest = input.metadata?.pestType?.toLowerCase() || '';
      const proposedGroup = input.metadata?.proposedInsecticideGroup;
      const helicoverpaRelated = ['bollworm', 'fruit_borer', 'pod_borer'].includes(pest);
      return helicoverpaRelated && proposedGroup === InsecticideGroup.PYRETHROIDS;
    },
    cause: Cause.DOCUMENTED_RESISTANCE_POPULATION,
    priority: PriorityLevel.P5,
    scientific_source: 'Documented Helicoverpa Resistance 2015-2023',
    scientific_basis: 'Helicoverpa armigera has documented pyrethroid resistance across India. Use alternative MOA (Diamides, Spinosyns, Avermectins) for effective control.',
    icar_package: 'ICAR-CICR Resistance Monitoring Data',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MINIMUM 3 MOA PER SEASON
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'RESISTANCE_009',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const moaUsedThisSeason = input.metadata?.moaGroupsUsedThisSeason || [];
      const totalApplications = input.metadata?.totalInsecticideApplications || 0;
      return totalApplications >= 3 && moaUsedThisSeason.length < 3;
    },
    cause: Cause.INSUFFICIENT_MOA_DIVERSITY,
    priority: PriorityLevel.P5,
    scientific_source: 'IRAC Rotation Best Practices',
    scientific_basis: 'Minimum 3 different MOA per season recommended. Mix modes within season for multiple pests. Track MOA usage across seasons.',
    icar_package: 'Resistance Prevention Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FUNGICIDE MIXING STRATEGY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'RESISTANCE_010',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const diseaseStage = input.metadata?.diseaseStage || '';
      const proposedGroup = input.metadata?.proposedFungicideGroup;
      const isAdvancedDisease = diseaseStage === 'ADVANCED' || (input.metadata?.diseaseSeverityIndex || 0) > 20;
      const isSingleSiteOnly = proposedGroup === FungicideGroup.STROBILURINS || proposedGroup === FungicideGroup.TRIAZOLES;
      return isAdvancedDisease && isSingleSiteOnly && !input.metadata?.mixingWithMultisite;
    },
    cause: Cause.SINGLE_SITE_WITHOUT_MULTI_SITE,
    priority: PriorityLevel.P5,
    scientific_source: 'FRAC Mixing Strategy',
    scientific_basis: 'For advanced disease, mix systemic (single-site) with contact (multi-site) fungicide. Broader spectrum + resistance management benefit.',
    icar_package: 'Effective Fungicide Combinations',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get recommended alternative MOA groups for insecticide rotation
 */
export function getAlternativeInsecticideGroups(currentGroup: InsecticideGroup): InsecticideGroup[] {
  const currentInfo = INSECTICIDE_MOA_GROUPS.find(g => g.group === currentGroup);
  const blockedGroups = [currentGroup, ...(currentInfo?.crossResistanceGroups || [])];
  
  return INSECTICIDE_MOA_GROUPS
    .filter(g => !blockedGroups.includes(g.group))
    .sort((a, b) => {
      const riskOrder = { LOW: 0, MEDIUM: 1, HIGH: 2, VERY_HIGH: 3 };
      return riskOrder[a.resistanceRisk] - riskOrder[b.resistanceRisk];
    })
    .map(g => g.group);
}

/**
 * Get recommended alternative MOA groups for fungicide rotation
 */
export function getAlternativeFungicideGroups(currentGroup: FungicideGroup, diseaseStage: 'PREVENTIVE' | 'CURATIVE' | 'ADVANCED'): FungicideGroup[] {
  return FUNGICIDE_MOA_GROUPS
    .filter(g => g.group !== currentGroup)
    .filter(g => {
      if (diseaseStage === 'PREVENTIVE') return g.usePattern === 'PREVENTIVE' || g.usePattern === 'BOTH';
      if (diseaseStage === 'CURATIVE') return g.usePattern === 'CURATIVE' || g.usePattern === 'BOTH';
      return true; // ADVANCED - all allowed
    })
    .sort((a, b) => {
      const riskOrder = { LOW: 0, MEDIUM: 1, HIGH: 2, VERY_HIGH: 3 };
      return riskOrder[a.resistanceRisk] - riskOrder[b.resistanceRisk];
    })
    .map(g => g.group);
}

/**
 * Get insecticide MOA info
 */
export function getInsecticideMOAInfo(groupOrExample: string): InsecticideMOA | undefined {
  const byGroup = INSECTICIDE_MOA_GROUPS.find(g => g.group === groupOrExample);
  if (byGroup) return byGroup;
  
  return INSECTICIDE_MOA_GROUPS.find(g => 
    g.examples.some(e => e.toLowerCase().includes(groupOrExample.toLowerCase()))
  );
}

/**
 * Get fungicide MOA info
 */
export function getFungicideMOAInfo(groupOrExample: string): FungicideMOA | undefined {
  const byGroup = FUNGICIDE_MOA_GROUPS.find(g => g.group === groupOrExample);
  if (byGroup) return byGroup;
  
  return FUNGICIDE_MOA_GROUPS.find(g => 
    g.examples.some(e => e.toLowerCase().includes(groupOrExample.toLowerCase()))
  );
}

/**
 * Check if rotation is valid
 */
export function isValidRotation(
  lastGroup: InsecticideGroup | FungicideGroup,
  proposedGroup: InsecticideGroup | FungicideGroup,
  daysSinceLast: number,
  isInsecticide: boolean
): { valid: boolean; reason?: string } {
  if (lastGroup === proposedGroup && daysSinceLast < 60) {
    return { valid: false, reason: 'Same MOA used too recently (< 60 days)' };
  }
  
  if (isInsecticide) {
    const lastInfo = INSECTICIDE_MOA_GROUPS.find(g => g.group === lastGroup);
    if (lastInfo?.crossResistanceGroups.includes(proposedGroup as InsecticideGroup)) {
      return { valid: false, reason: 'Cross-resistance between these MOA groups' };
    }
  }
  
  return { valid: true };
}

export default RESISTANCE_MANAGEMENT_RULES;
