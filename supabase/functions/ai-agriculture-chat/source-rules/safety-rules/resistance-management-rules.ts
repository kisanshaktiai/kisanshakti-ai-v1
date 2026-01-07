/**
 * RESISTANCE MANAGEMENT RULES - PRODUCTION GRADE
 * Priority Level: P5 (IPM/Resistance)
 */

import { 
  CauseRule, 
  Cause, 
  InsecticideGroup,
  FungicideGroup,
  PRIORITY_LEVEL_TO_NUMERIC,
  PriorityLevel,
  DecisionInput 
} from '../types.ts';

// Type-safe helpers
function num(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  return defaultValue;
}
function str(value: unknown, defaultValue: string = ''): string {
  if (typeof value === 'string') return value;
  return defaultValue;
}
function bool(value: unknown): boolean {
  return value === true || value === 'true';
}

export interface InsecticideMOA {
  group: InsecticideGroup;
  iracCode: string;
  mode: string;
  examples: string[];
  resistanceRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  maxApplicationsPerSeason: number;
}

export const INSECTICIDE_MOA_GROUPS: InsecticideMOA[] = [
  { group: InsecticideGroup.GROUP_1_CARBAMATES, iracCode: '1A', mode: 'Acetylcholinesterase inhibitor', examples: ['Carbaryl'], resistanceRisk: 'HIGH', maxApplicationsPerSeason: 2 },
  { group: InsecticideGroup.GROUP_2_ORGANOPHOSPHATES, iracCode: '1B', mode: 'Acetylcholinesterase inhibitor', examples: ['Chlorpyrifos', 'Malathion'], resistanceRisk: 'HIGH', maxApplicationsPerSeason: 2 },
  { group: InsecticideGroup.GROUP_3_PYRETHROIDS, iracCode: '3A', mode: 'Sodium channel modulator', examples: ['Cypermethrin', 'Deltamethrin'], resistanceRisk: 'VERY_HIGH', maxApplicationsPerSeason: 2 },
  { group: InsecticideGroup.GROUP_4_NEONICOTINOIDS, iracCode: '4A', mode: 'Nicotinic acetylcholine receptor agonist', examples: ['Imidacloprid', 'Thiamethoxam'], resistanceRisk: 'HIGH', maxApplicationsPerSeason: 2 },
  { group: InsecticideGroup.GROUP_5_SPINOSYNS, iracCode: '5', mode: 'Nicotinic acetylcholine receptor allosteric modulator', examples: ['Spinosad'], resistanceRisk: 'MEDIUM', maxApplicationsPerSeason: 3 },
  { group: InsecticideGroup.GROUP_28_DIAMIDES, iracCode: '28', mode: 'Ryanodine receptor modulator', examples: ['Chlorantraniliprole'], resistanceRisk: 'MEDIUM', maxApplicationsPerSeason: 2 },
];

export const RESISTANCE_MANAGEMENT_RULES: CauseRule[] = [
  // CONSECUTIVE MOA DETECTED
  {
    rule_id: 'RESISTANCE_001',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const consecutiveSameMOA = num(input.metadata?.consecutiveSameMOA);
      return consecutiveSameMOA >= 2;
    },
    cause: Cause.MOA_ROTATION_NEEDED,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P5_IPM],
    scientific_source: 'IRAC Guidelines 2023',
    scientific_basis: 'Using same MOA consecutively increases resistance risk. Rotate to different group after 2 applications.',
    icar_package: 'Resistance Management Protocol',
  },

  // RESISTANCE RISK HIGH
  {
    rule_id: 'RESISTANCE_002',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const lastMOA = str(input.metadata?.lastChemicalMOA);
      const proposedMOA = str(input.metadata?.proposedChemicalMOA);
      return lastMOA === proposedMOA && lastMOA !== '';
    },
    cause: Cause.RESISTANCE_RISK_HIGH,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P5_IPM],
    scientific_source: 'IRAC Resistance Management',
    scientific_basis: 'Consecutive same MOA dramatically increases resistance selection pressure.',
    icar_package: 'IRAC Guidelines',
  },

  // FUNGICIDE ROTATION NEEDED
  {
    rule_id: 'RESISTANCE_003',
    category: 'resistance',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const consecutiveFungicide = num(input.metadata?.consecutiveSameFungicideGroup);
      return consecutiveFungicide >= 2;
    },
    cause: Cause.FUNGICIDE_ROTATION_NEEDED,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P5_IPM],
    scientific_source: 'FRAC Code List',
    scientific_basis: 'Fungicide resistance develops rapidly. Rotate MOA groups after 2 applications.',
    icar_package: 'FRAC Resistance Management',
  },

  // BT REFUGE MISSING
  {
    rule_id: 'RESISTANCE_004',
    category: 'resistance',
    crop_code: 'cotton',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const isBtCrop = bool(input.metadata?.isBtCrop);
      const refugePercent = num(input.metadata?.refugeAreaPercent);
      return isBtCrop && refugePercent < 20;
    },
    cause: Cause.BT_REFUGE_MISSING,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P5_IPM],
    scientific_source: 'Bt Cotton Refuge Requirements',
    scientific_basis: 'Bt cotton requires 20% non-Bt refuge to delay resistance. Without refuge, bollworm resistance accelerates.',
    icar_package: 'ICAR-CICR Bt Refuge Guidelines',
  },
];

export function getMOARotationSuggestion(currentGroup: InsecticideGroup): InsecticideGroup[] {
  const groups = Object.values(InsecticideGroup);
  return groups.filter(g => g !== currentGroup);
}

export function checkMaxApplications(group: InsecticideGroup, applicationCount: number): boolean {
  const moa = INSECTICIDE_MOA_GROUPS.find(m => m.group === group);
  if (!moa) return true;
  return applicationCount <= moa.maxApplicationsPerSeason;
}

export default RESISTANCE_MANAGEMENT_RULES;
