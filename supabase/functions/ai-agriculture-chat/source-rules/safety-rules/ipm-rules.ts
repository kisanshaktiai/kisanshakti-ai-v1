/**
 * INTEGRATED PEST MANAGEMENT (IPM) RULES - PRODUCTION GRADE
 * Priority Level: P5 (IPM Preference)
 */

import { 
  CauseRule, 
  Cause, 
  CropStage,
  IPMLevel,
  PRIORITY_LEVEL_TO_NUMERIC,
  PriorityLevel,
  DecisionInput 
} from '../types.ts';

// Type-safe helpers
function num(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  return defaultValue;
}
function bool(value: unknown): boolean {
  return value === true || value === 'true';
}

export interface IPMLevelConfig {
  level: IPMLevel;
  infestationRange: { min: number; max: number };
  methods: string[];
  cost: string;
  efficacy: string;
  resistanceRisk: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
}

export const IPM_LADDER: IPMLevelConfig[] = [
  { level: IPMLevel.LEVEL_0_PREVENTION, infestationRange: { min: 0, max: 10 }, methods: ['Crop rotation', 'Resistant varieties'], cost: '₹0-500/acre', efficacy: '50-70%', resistanceRisk: 'VERY_LOW' },
  { level: IPMLevel.LEVEL_1_CULTURAL, infestationRange: { min: 0, max: 20 }, methods: ['Hand picking', 'Water management'], cost: '₹0-500/acre', efficacy: '50-70%', resistanceRisk: 'VERY_LOW' },
  { level: IPMLevel.LEVEL_2_MECHANICAL, infestationRange: { min: 10, max: 30 }, methods: ['Sticky traps', 'Pheromone traps'], cost: '₹500-2000/acre', efficacy: '60-80%', resistanceRisk: 'VERY_LOW' },
  { level: IPMLevel.LEVEL_3_BIOLOGICAL, infestationRange: { min: 20, max: 50 }, methods: ['Trichogramma', 'Bt spray', 'NPV'], cost: '₹1000-3000/acre', efficacy: '70-85%', resistanceRisk: 'VERY_LOW' },
  { level: IPMLevel.LEVEL_4_BOTANICAL, infestationRange: { min: 30, max: 60 }, methods: ['Neem oil', 'Pongamia oil'], cost: '₹800-2000/acre', efficacy: '60-75%', resistanceRisk: 'LOW' },
  { level: IPMLevel.LEVEL_5_SELECTIVE_CHEMICAL, infestationRange: { min: 50, max: 80 }, methods: ['Target-specific chemicals'], cost: '₹1500-3000/acre', efficacy: '80-95%', resistanceRisk: 'MEDIUM' },
  { level: IPMLevel.LEVEL_6_BROAD_SPECTRUM, infestationRange: { min: 70, max: 100 }, methods: ['Emergency broad spectrum'], cost: '₹2000-5000/acre', efficacy: '85-95%', resistanceRisk: 'VERY_HIGH' },
];

export const IPM_RULES: CauseRule[] = [
  {
    rule_id: 'IPM_001',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const infestation = num(input.metadata?.pestDensity);
      return infestation > 0 && infestation <= 20;
    },
    cause: Cause.IPM_CULTURAL_SUFFICIENT,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P5_IPM],
    scientific_source: 'FAO IPM Principles 2020',
    scientific_basis: 'Low infestation levels (0-20%) can be managed through cultural practices.',
    icar_package: 'ICAR-NCIPM IPM Package',
  },
  {
    rule_id: 'IPM_002',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const infestation = num(input.metadata?.pestDensity);
      return infestation > 20 && infestation <= 50;
    },
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P5_IPM],
    scientific_source: 'FAO IPM Principles 2020',
    scientific_basis: 'Moderate infestation (20-50%) should prioritize biological control before chemicals.',
    icar_package: 'ICAR Biological Control Manual',
  },
  {
    rule_id: 'IPM_003',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const hasEggMass = bool(input.metadata?.eggMassObserved);
      return hasEggMass && input.crop_stage === CropStage.REPRODUCTIVE;
    },
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P5_IPM],
    scientific_source: 'Trichogramma Release Guidelines',
    scientific_basis: 'Egg parasitoids most effective at reproductive stage when egg masses present.',
    icar_package: 'ICAR Biocontrol Package',
  },
  {
    rule_id: 'IPM_004',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const recentChemical = bool(input.metadata?.chemicalUsedLast14Days);
      const bioagentPlanned = bool(input.metadata?.bioagentReleasePlanned);
      return recentChemical && bioagentPlanned;
    },
    cause: Cause.CHEMICAL_INCOMPATIBILITY,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P5_IPM],
    scientific_source: 'Biocontrol Compatibility Studies',
    scientific_basis: 'Bioagents killed by chemical residues. Wait 14 days after broad-spectrum chemicals.',
    icar_package: 'IPM Compatibility Guidelines',
  },
  {
    rule_id: 'IPM_005',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const infestation = num(input.metadata?.pestDensity);
      const allLevelsFailed = bool(input.metadata?.allIPMLevelsFailed);
      return infestation > 80 && allLevelsFailed;
    },
    cause: Cause.MULTIPLE_STRESSOR_EMERGENCY,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'Emergency Pest Management',
    scientific_basis: 'When all IPM levels fail and infestation >80%, emergency measures needed with expert approval.',
    icar_package: 'FAO Emergency Protocol',
  },
];

export function getIPMRecommendation(infestationPercent: number): IPMLevelConfig | undefined {
  return IPM_LADDER.find(level => 
    infestationPercent >= level.infestationRange.min && 
    infestationPercent <= level.infestationRange.max
  );
}

export default IPM_RULES;
