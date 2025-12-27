/**
 * PRE-HARVEST INTERVAL (PHI) & WITHDRAWAL RULES - PRODUCTION GRADE
 * Priority Level: P1 (Regulatory Compliance)
 */

import { 
  CauseRule, 
  Cause, 
  CropStage,
  FarmingMode,
  PRIORITY_LEVEL_TO_NUMERIC,
  PriorityLevel,
  DecisionInput 
} from '../types';

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

export interface WithdrawalPeriod {
  chemical: string;
  cropCategory: 'vegetables' | 'fruits' | 'field_crops' | 'all';
  phiDays: number;
  exportPhiDays?: number;
  organicAllowed: boolean;
  mrlStandard: 'FSSAI' | 'CODEX' | 'EU';
}

export const WITHDRAWAL_PERIODS: WithdrawalPeriod[] = [
  { chemical: 'Imidacloprid', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Cypermethrin', cropCategory: 'vegetables', phiDays: 5, exportPhiDays: 10, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Chlorpyrifos', cropCategory: 'vegetables', phiDays: 15, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Chlorantraniliprole', cropCategory: 'vegetables', phiDays: 3, exportPhiDays: 7, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Spinosad', cropCategory: 'vegetables', phiDays: 3, exportPhiDays: 5, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Mancozeb', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Neem oil', cropCategory: 'all', phiDays: 0, exportPhiDays: 1, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Bt kurstaki', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'FSSAI' },
];

export const PHI_WITHDRAWAL_RULES: CauseRule[] = [
  // PHI VIOLATION RISK
  {
    rule_id: 'PHI_001',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const daysToHarvest = num(input.metadata?.daysToHarvest);
      const chemicalPHI = num(input.metadata?.requestedChemicalPHI);
      return daysToHarvest < chemicalPHI;
    },
    cause: Cause.PHI_VIOLATION_RISK,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P1_REGULATORY],
    scientific_source: 'CIB&RC (Central Insecticide Board & Registration Committee)',
    scientific_basis: 'PHI ensures pesticide residues degrade to safe levels. Application within PHI = MRL violation.',
    icar_package: 'Pesticide Use Guidelines',
  },

  // EXPORT PHI STRICTER
  {
    rule_id: 'PHI_002',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const targetMarket = str(input.metadata?.targetMarket);
      const daysToHarvest = num(input.metadata?.daysToHarvest);
      const exportPHI = num(input.metadata?.requestedChemicalExportPHI);
      return targetMarket === 'export' && daysToHarvest < exportPHI;
    },
    cause: Cause.EXPORT_PHI_VIOLATION_RISK,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P1_REGULATORY],
    scientific_source: 'APEDA Export Guidelines',
    scientific_basis: 'Export markets have stricter MRLs than domestic. Add 7 days beyond label PHI for export produce.',
    icar_package: 'Export Quality Guidelines',
  },

  // ORGANIC CERTIFICATION VIOLATION
  {
    rule_id: 'PHI_003',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const isOrganic = input.farming_mode === FarmingMode.ORGANIC_ONLY;
      const syntheticRequested = bool(input.metadata?.syntheticChemicalRequested);
      return isOrganic && syntheticRequested;
    },
    cause: Cause.ORGANIC_CERTIFICATION_VIOLATION,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P1_REGULATORY],
    scientific_source: 'NPOP (National Programme for Organic Production)',
    scientific_basis: 'Organic certification prohibits synthetic chemicals. Using non-approved input = loss of organic status.',
    icar_package: 'NPOP Standards',
  },

  // MRL EXCEEDANCE RISK
  {
    rule_id: 'PHI_004',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const applicationRate = num(input.metadata?.proposedApplicationRate);
      const recommendedRate = num(input.metadata?.recommendedRate, 1);
      return applicationRate > recommendedRate * 1.5;
    },
    cause: Cause.MRL_EXCEEDANCE_RISK,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P1_REGULATORY],
    scientific_source: 'Pesticide Residue Guidelines',
    scientific_basis: 'Application rate >150% of recommended increases MRL exceedance risk.',
    icar_package: 'Label Rate Compliance',
  },

  // NON-CHEMICAL ONLY NEAR HARVEST
  {
    rule_id: 'PHI_005',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const daysToHarvest = num(input.metadata?.daysToHarvest);
      return daysToHarvest <= 3;
    },
    cause: Cause.NON_CHEMICAL_ONLY_NEAR_HARVEST,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P2_WEATHER_SAFETY],
    scientific_source: 'Pre-Harvest Pest Management',
    scientific_basis: 'With ≤3 days to harvest, no chemical options safe. Use physical removal or accept minor damage.',
    icar_package: 'Near-Harvest IPM',
  },

  // BIOPESTICIDE RECOMMENDED NEAR HARVEST
  {
    rule_id: 'PHI_006',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const daysToHarvest = num(input.metadata?.daysToHarvest);
      const pestPresent = bool(input.metadata?.pestPresent);
      return daysToHarvest > 3 && daysToHarvest <= 7 && pestPresent;
    },
    cause: Cause.BIOPESTICIDE_RECOMMENDED_NEAR_HARVEST,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P4_ECONOMIC],
    scientific_source: 'Near-Harvest Pest Control Options',
    scientific_basis: 'With 3-7 days to harvest, use biopesticides (Bt, NPV, neem) with 0-3 day PHI.',
    icar_package: 'Biopesticide Application Guide',
  },
];

export function getWithdrawalPeriod(chemical: string, cropCategory: string): WithdrawalPeriod | undefined {
  return WITHDRAWAL_PERIODS.find(wp => 
    wp.chemical.toLowerCase() === chemical.toLowerCase() &&
    (wp.cropCategory === cropCategory || wp.cropCategory === 'all')
  );
}

export function isPHISafe(chemical: string, daysToHarvest: number, isExport: boolean = false): boolean {
  const wp = WITHDRAWAL_PERIODS.find(p => p.chemical.toLowerCase() === chemical.toLowerCase());
  if (!wp) return false;
  const requiredDays = isExport ? (wp.exportPhiDays ?? wp.phiDays) : wp.phiDays;
  return daysToHarvest >= requiredDays;
}

export default PHI_WITHDRAWAL_RULES;
