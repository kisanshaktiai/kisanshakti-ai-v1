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
  // INSECTICIDES - Neonicotinoids
  { chemical: 'Imidacloprid', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Thiamethoxam', cropCategory: 'vegetables', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Acetamiprid', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Clothianidin', cropCategory: 'field_crops', phiDays: 21, exportPhiDays: 30, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // INSECTICIDES - Pyrethroids
  { chemical: 'Cypermethrin', cropCategory: 'vegetables', phiDays: 5, exportPhiDays: 10, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Deltamethrin', cropCategory: 'vegetables', phiDays: 5, exportPhiDays: 10, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Lambda-cyhalothrin', cropCategory: 'vegetables', phiDays: 5, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Fenvalerate', cropCategory: 'field_crops', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Permethrin', cropCategory: 'vegetables', phiDays: 3, exportPhiDays: 7, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // INSECTICIDES - Organophosphates
  { chemical: 'Chlorpyrifos', cropCategory: 'vegetables', phiDays: 15, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Malathion', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Dimethoate', cropCategory: 'vegetables', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Profenofos', cropCategory: 'vegetables', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Quinalphos', cropCategory: 'field_crops', phiDays: 21, exportPhiDays: 30, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Monocrotophos', cropCategory: 'field_crops', phiDays: 21, exportPhiDays: 30, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Acephate', cropCategory: 'vegetables', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // INSECTICIDES - Diamides
  { chemical: 'Chlorantraniliprole', cropCategory: 'vegetables', phiDays: 3, exportPhiDays: 7, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Flubendiamide', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Cyantraniliprole', cropCategory: 'vegetables', phiDays: 3, exportPhiDays: 7, organicAllowed: false, mrlStandard: 'CODEX' },
  
  // INSECTICIDES - Spinosyns (Organic-compatible)
  { chemical: 'Spinosad', cropCategory: 'vegetables', phiDays: 3, exportPhiDays: 5, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Spinetoram', cropCategory: 'vegetables', phiDays: 3, exportPhiDays: 5, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // INSECTICIDES - Avermectins
  { chemical: 'Emamectin benzoate', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Abamectin', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'CODEX' },
  
  // INSECTICIDES - IGRs & Others
  { chemical: 'Novaluron', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Buprofezin', cropCategory: 'vegetables', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Fipronil', cropCategory: 'field_crops', phiDays: 30, exportPhiDays: 45, organicAllowed: false, mrlStandard: 'EU' },
  { chemical: 'Indoxacarb', cropCategory: 'vegetables', phiDays: 5, exportPhiDays: 10, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Cartap hydrochloride', cropCategory: 'field_crops', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // FUNGICIDES - Triazoles
  { chemical: 'Propiconazole', cropCategory: 'field_crops', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Tebuconazole', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Hexaconazole', cropCategory: 'field_crops', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Difenoconazole', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'CODEX' },
  { chemical: 'Tricyclazole', cropCategory: 'field_crops', phiDays: 21, exportPhiDays: 30, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // FUNGICIDES - Strobilurins
  { chemical: 'Azoxystrobin', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Pyraclostrobin', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'CODEX' },
  { chemical: 'Trifloxystrobin', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // FUNGICIDES - Contact
  { chemical: 'Mancozeb', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Chlorothalonil', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Copper oxychloride', cropCategory: 'all', phiDays: 7, exportPhiDays: 14, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Copper hydroxide', cropCategory: 'all', phiDays: 7, exportPhiDays: 14, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Carbendazim', cropCategory: 'vegetables', phiDays: 10, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Thiophanate-methyl', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Metalaxyl', cropCategory: 'vegetables', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Cymoxanil', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'CODEX' },
  { chemical: 'Iprodione', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'EU' },
  { chemical: 'Thiram', cropCategory: 'field_crops', phiDays: 0, exportPhiDays: 0, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Captan', cropCategory: 'fruits', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'CODEX' },
  { chemical: 'Kasugamycin', cropCategory: 'field_crops', phiDays: 21, exportPhiDays: 30, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Validamycin', cropCategory: 'field_crops', phiDays: 21, exportPhiDays: 30, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // HERBICIDES
  { chemical: 'Glyphosate', cropCategory: 'field_crops', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Paraquat', cropCategory: 'field_crops', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: '2,4-D', cropCategory: 'field_crops', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Pendimethalin', cropCategory: 'field_crops', phiDays: 0, exportPhiDays: 0, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Butachlor', cropCategory: 'field_crops', phiDays: 0, exportPhiDays: 0, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Pretilachlor', cropCategory: 'field_crops', phiDays: 0, exportPhiDays: 0, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Bispyribac sodium', cropCategory: 'field_crops', phiDays: 30, exportPhiDays: 45, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Oxyfluorfen', cropCategory: 'vegetables', phiDays: 0, exportPhiDays: 0, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // BIOPESTICIDES - Zero/Minimal PHI
  { chemical: 'Neem oil', cropCategory: 'all', phiDays: 0, exportPhiDays: 1, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Neem extract', cropCategory: 'all', phiDays: 0, exportPhiDays: 1, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Azadirachtin', cropCategory: 'all', phiDays: 0, exportPhiDays: 1, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Bt kurstaki', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Bt aizawai', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Beauveria bassiana', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Metarhizium anisopliae', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Trichoderma viride', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Trichoderma harzianum', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Pseudomonas fluorescens', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'NPV (Nuclear Polyhedrosis Virus)', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Pongamia oil', cropCategory: 'all', phiDays: 0, exportPhiDays: 1, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Karanja oil', cropCategory: 'all', phiDays: 0, exportPhiDays: 1, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Garlic extract', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Sulphur', cropCategory: 'all', phiDays: 1, exportPhiDays: 3, organicAllowed: true, mrlStandard: 'FSSAI' },
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
