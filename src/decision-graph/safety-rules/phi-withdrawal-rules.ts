/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PRE-HARVEST INTERVAL (PHI) & WITHDRAWAL RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P1 (Regulatory Compliance)
 * Based on: CIB&RC Registration, FSSAI Standards, Codex Alimentarius, EU MRL
 * 
 * Withdrawal periods between last pesticide application and harvest
 * to ensure Maximum Residue Limit (MRL) compliance.
 */

import { 
  CauseRule, 
  Cause, 
  PriorityLevel,
  DecisionInput 
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// PRE-HARVEST INTERVAL DATA
// ═══════════════════════════════════════════════════════════════════════════

export interface WithdrawalPeriod {
  chemical: string;
  cropCategory: 'vegetables' | 'fruits' | 'field_crops' | 'all';
  phiDays: number;
  exportPhiDays?: number; // Stricter for export
  organicAllowed: boolean;
  mrlStandard: 'FSSAI' | 'CODEX' | 'EU';
}

export const WITHDRAWAL_PERIODS: WithdrawalPeriod[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // INSECTICIDES
  // ─────────────────────────────────────────────────────────────────────────
  // Neonicotinoids
  { chemical: 'Imidacloprid', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Imidacloprid', cropCategory: 'fruits', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Imidacloprid', cropCategory: 'field_crops', phiDays: 21, exportPhiDays: 30, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Thiamethoxam', cropCategory: 'vegetables', phiDays: 5, exportPhiDays: 10, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Acetamiprid', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // Pyrethroids
  { chemical: 'Cypermethrin', cropCategory: 'vegetables', phiDays: 5, exportPhiDays: 10, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Deltamethrin', cropCategory: 'vegetables', phiDays: 3, exportPhiDays: 7, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Lambda-cyhalothrin', cropCategory: 'vegetables', phiDays: 5, exportPhiDays: 10, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // Organophosphates
  { chemical: 'Chlorpyrifos', cropCategory: 'vegetables', phiDays: 15, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Chlorpyrifos', cropCategory: 'field_crops', phiDays: 30, exportPhiDays: 45, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Profenofos', cropCategory: 'vegetables', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Acephate', cropCategory: 'vegetables', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Malathion', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // Diamides
  { chemical: 'Chlorantraniliprole', cropCategory: 'vegetables', phiDays: 3, exportPhiDays: 7, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Flubendiamide', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // Spinosyns
  { chemical: 'Spinosad', cropCategory: 'vegetables', phiDays: 3, exportPhiDays: 5, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Spinetoram', cropCategory: 'vegetables', phiDays: 3, exportPhiDays: 7, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // Avermectins
  { chemical: 'Abamectin', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Emamectin benzoate', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },

  // ─────────────────────────────────────────────────────────────────────────
  // FUNGICIDES
  // ─────────────────────────────────────────────────────────────────────────
  // Multi-site contact
  { chemical: 'Mancozeb', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Mancozeb', cropCategory: 'fruits', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Chlorothalonil', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Copper oxychloride', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 10, organicAllowed: true, mrlStandard: 'FSSAI' },
  { chemical: 'Copper hydroxide', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 10, organicAllowed: true, mrlStandard: 'FSSAI' },
  
  // Triazoles
  { chemical: 'Propiconazole', cropCategory: 'vegetables', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Tebuconazole', cropCategory: 'vegetables', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Hexaconazole', cropCategory: 'vegetables', phiDays: 15, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Difenoconazole', cropCategory: 'vegetables', phiDays: 10, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // Strobilurins
  { chemical: 'Azoxystrobin', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Pyraclostrobin', cropCategory: 'vegetables', phiDays: 7, exportPhiDays: 14, organicAllowed: false, mrlStandard: 'FSSAI' },
  
  // Phenylamides
  { chemical: 'Metalaxyl', cropCategory: 'vegetables', phiDays: 14, exportPhiDays: 21, organicAllowed: false, mrlStandard: 'FSSAI' },

  // ─────────────────────────────────────────────────────────────────────────
  // HERBICIDES
  // ─────────────────────────────────────────────────────────────────────────
  { chemical: 'Glyphosate', cropCategory: 'field_crops', phiDays: 30, exportPhiDays: 45, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Paraquat', cropCategory: 'field_crops', phiDays: 30, exportPhiDays: 45, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: '2,4-D', cropCategory: 'field_crops', phiDays: 21, exportPhiDays: 30, organicAllowed: false, mrlStandard: 'FSSAI' },
  { chemical: 'Pendimethalin', cropCategory: 'vegetables', phiDays: 60, exportPhiDays: 90, organicAllowed: false, mrlStandard: 'FSSAI' },

  // ─────────────────────────────────────────────────────────────────────────
  // BIOPESTICIDES (Generally shorter PHI)
  // ─────────────────────────────────────────────────────────────────────────
  { chemical: 'Bacillus thuringiensis', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'CODEX' },
  { chemical: 'NPV', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'CODEX' },
  { chemical: 'Beauveria bassiana', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'CODEX' },
  { chemical: 'Trichoderma viride', cropCategory: 'all', phiDays: 0, exportPhiDays: 0, organicAllowed: true, mrlStandard: 'CODEX' },
  { chemical: 'Neem (Azadirachtin)', cropCategory: 'all', phiDays: 3, exportPhiDays: 5, organicAllowed: true, mrlStandard: 'CODEX' },
];

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIC CERTIFICATION RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ORGANIC_CERTIFICATION = {
  conversionPeriod: '3 years (36 months)',
  syntheticChemicals: 'BANNED',
  approvedInputsOnly: ['NPOP approved', 'NOP approved', 'EU Organic approved'],
  bufferZone: '25 meters from conventional fields',
  recordKeeping: 'Complete traceability required',
  annualInspection: 'Mandatory third-party certification',
};

export const ORGANIC_APPROVED_INPUTS = [
  'Neem-based products',
  'Bacillus thuringiensis (Bt)',
  'NPV (Nuclear Polyhedrosis Virus)',
  'Trichoderma',
  'Pseudomonas',
  'Beauveria bassiana',
  'Metarhizium anisopliae',
  'Copper compounds (limited use)',
  'Sulfur (elemental)',
  'Bordeaux mixture',
  'Lime sulfur',
  'Spinosad',
  'Pyrethrin (natural)',
  'Rotenone (restricted)',
];

// ═══════════════════════════════════════════════════════════════════════════
// PHI WITHDRAWAL RULES
// ═══════════════════════════════════════════════════════════════════════════

export const PHI_WITHDRAWAL_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // PHI VIOLATION - HARVEST TOO SOON
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'PHI_001',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: ['maturity', 'late_maturity'],
    conditions: (input: DecisionInput) => {
      const daysToHarvest = input.metadata?.daysToHarvest || 30;
      const chemicalPHI = input.metadata?.chemicalPHI || 0;
      const proposedChemical = input.metadata?.proposedChemical;
      return proposedChemical && daysToHarvest < chemicalPHI;
    },
    cause: Cause.PHI_VIOLATION_RISK,
    priority: PriorityLevel.P1,
    scientific_source: 'CIB&RC (Central Insecticide Board & Registration Committee)',
    scientific_basis: 'PHI ensures pesticide residues degrade to safe levels. Application within PHI = MRL violation, legal liability, export rejection.',
    icar_package: 'FSSAI Food Safety Standards 2011',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORT PHI STRICTER REQUIREMENT
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'PHI_002',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const isExport = input.metadata?.targetMarket === 'export';
      const daysToHarvest = input.metadata?.daysToHarvest || 30;
      const chemicalPHI = input.metadata?.chemicalPHI || 0;
      const exportBuffer = 7; // Additional 7 days for export
      return isExport && daysToHarvest < (chemicalPHI + exportBuffer);
    },
    cause: Cause.EXPORT_PHI_VIOLATION_RISK,
    priority: PriorityLevel.P1,
    scientific_source: 'APEDA Export Guidelines',
    scientific_basis: 'Export markets (EU, USA) have stricter MRLs than domestic. Add 7 days beyond label PHI for export produce.',
    icar_package: 'Codex Alimentarius, EU MRL Regulations',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SUGGEST SHORTER PHI ALTERNATIVE
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'PHI_003',
    category: 'advisory',
    crop_code: 'all',
    stage_applicable: ['maturity'],
    conditions: (input: DecisionInput) => {
      const daysToHarvest = input.metadata?.daysToHarvest || 30;
      const chemicalPHI = input.metadata?.chemicalPHI || 0;
      const hasAlternatives = input.metadata?.shorterPHIAlternatives?.length > 0;
      return daysToHarvest < chemicalPHI && hasAlternatives;
    },
    cause: Cause.SHORTER_PHI_ALTERNATIVE_AVAILABLE,
    priority: PriorityLevel.P4,
    scientific_source: 'PHI-Based Chemical Selection',
    scientific_basis: 'When days to harvest < chemical PHI, select alternative with shorter PHI. Biopesticides often have 0-3 day PHI.',
    icar_package: 'ICAR Pesticide Selection Guide',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ORGANIC CERTIFICATION VIOLATION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'PHI_004',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const isOrganic = input.metadata?.organicCertified;
      const proposedChemical = input.metadata?.proposedChemical?.toLowerCase() || '';
      const isApproved = ORGANIC_APPROVED_INPUTS.some(i => 
        proposedChemical.includes(i.toLowerCase())
      );
      return isOrganic && proposedChemical && !isApproved;
    },
    cause: Cause.ORGANIC_CERTIFICATION_VIOLATION,
    priority: PriorityLevel.P1,
    scientific_source: 'NPOP (National Programme for Organic Production)',
    scientific_basis: 'Organic certification prohibits synthetic chemicals. Using non-approved input = loss of organic status, 3-year re-conversion required.',
    icar_package: 'NOP Standards, EU Organic Regulations',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MRL EXCEEDANCE RISK
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'PHI_005',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const applicationRate = input.metadata?.applicationRate || 0;
      const recommendedRate = input.metadata?.recommendedRate || 0;
      return applicationRate > recommendedRate * 1.5;
    },
    cause: Cause.MRL_EXCEEDANCE_RISK,
    priority: PriorityLevel.P1,
    scientific_source: 'Pesticide Residue Guidelines',
    scientific_basis: 'Application rate >150% of recommended increases MRL exceedance risk even with PHI compliance. Follow label rates strictly.',
    icar_package: 'FSSAI MRL Regulations',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MULTIPLE APPLICATIONS CUMULATIVE RESIDUE
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'PHI_006',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const applicationsThisSeason = input.metadata?.sameChemicalApplications || 0;
      const maxApplications = input.metadata?.maxAllowedApplications || 3;
      return applicationsThisSeason >= maxApplications;
    },
    cause: Cause.CUMULATIVE_RESIDUE_RISK,
    priority: PriorityLevel.P1,
    scientific_source: 'Residue Accumulation Studies',
    scientific_basis: 'Multiple applications of same chemical accumulate residues. Exceeding max applications increases MRL violation risk.',
    icar_package: 'Pesticide Registration Conditions',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NEAR HARVEST - NON-CHEMICAL ONLY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'PHI_007',
    category: 'advisory',
    crop_code: 'all',
    stage_applicable: ['maturity', 'late_maturity'],
    conditions: (input: DecisionInput) => {
      const daysToHarvest = input.metadata?.daysToHarvest || 30;
      const pestProblem = input.metadata?.pestProblem;
      return pestProblem && daysToHarvest <= 3;
    },
    cause: Cause.NON_CHEMICAL_ONLY_NEAR_HARVEST,
    priority: PriorityLevel.P2,
    scientific_source: 'Pre-Harvest Pest Management',
    scientific_basis: 'With ≤3 days to harvest, no chemical options safe. Use physical removal, early harvest, or accept minor damage.',
    icar_package: 'ICAR Pre-Harvest Advisory',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BIOPESTICIDE RECOMMENDED NEAR HARVEST
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'PHI_008',
    category: 'advisory',
    crop_code: 'all',
    stage_applicable: ['maturity'],
    conditions: (input: DecisionInput) => {
      const daysToHarvest = input.metadata?.daysToHarvest || 30;
      const pestProblem = input.metadata?.pestProblem;
      return pestProblem && daysToHarvest <= 7 && daysToHarvest > 3;
    },
    cause: Cause.BIOPESTICIDE_RECOMMENDED_NEAR_HARVEST,
    priority: PriorityLevel.P4,
    scientific_source: 'Near-Harvest Pest Control Options',
    scientific_basis: 'With 3-7 days to harvest, use biopesticides (Bt, NPV, neem) with 0-3 day PHI. Safe and effective for lepidopteran pests.',
    icar_package: 'ICAR Biopesticide Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RESIDUE TESTING RECOMMENDED
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'PHI_009',
    category: 'advisory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const isExport = input.metadata?.targetMarket === 'export';
      const multipleApplications = (input.metadata?.totalPesticideApplications || 0) >= 4;
      const highValueCrop = input.metadata?.cropValuePerHa >= 100000;
      return isExport || multipleApplications || highValueCrop;
    },
    cause: Cause.RESIDUE_TESTING_RECOMMENDED,
    priority: PriorityLevel.P4,
    scientific_source: 'Quality Assurance Guidelines',
    scientific_basis: 'For export, multiple-spray crops, or high-value produce, pre-harvest residue testing ensures MRL compliance and prevents rejection.',
    icar_package: 'APEDA Quality Standards',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EU MRL STRICTER THAN INDIA
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'PHI_010',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const isEUExport = input.metadata?.exportDestination === 'EU';
      const chemical = input.metadata?.proposedChemical?.toLowerCase() || '';
      // These chemicals have significantly stricter EU MRLs
      const stricterEU = ['chlorpyrifos', 'profenofos', 'acephate', 'dimethoate'];
      return isEUExport && stricterEU.some(c => chemical.includes(c));
    },
    cause: Cause.EU_MRL_STRICTER,
    priority: PriorityLevel.P1,
    scientific_source: 'EU Pesticide Database',
    scientific_basis: 'EU has near-zero MRLs for several pesticides banned/restricted there. Using these chemicals makes EU export impossible.',
    icar_package: 'EU MRL Regulation (EC) 396/2005',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get PHI for a chemical and crop category
 */
export function getPHI(
  chemical: string,
  cropCategory: 'vegetables' | 'fruits' | 'field_crops',
  isExport: boolean = false
): number | undefined {
  const record = WITHDRAWAL_PERIODS.find(w => 
    w.chemical.toLowerCase() === chemical.toLowerCase() &&
    (w.cropCategory === cropCategory || w.cropCategory === 'all')
  );
  
  if (!record) return undefined;
  return isExport ? (record.exportPhiDays || record.phiDays + 7) : record.phiDays;
}

/**
 * Get chemicals with PHI less than or equal to days to harvest
 */
export function getChemicalsWithShorterPHI(
  daysToHarvest: number,
  cropCategory: 'vegetables' | 'fruits' | 'field_crops',
  isExport: boolean = false
): WithdrawalPeriod[] {
  return WITHDRAWAL_PERIODS.filter(w => {
    const phi = isExport ? (w.exportPhiDays || w.phiDays + 7) : w.phiDays;
    return phi <= daysToHarvest && 
           (w.cropCategory === cropCategory || w.cropCategory === 'all');
  });
}

/**
 * Check if chemical is organic approved
 */
export function isOrganicApproved(chemical: string): boolean {
  const record = WITHDRAWAL_PERIODS.find(w => 
    w.chemical.toLowerCase() === chemical.toLowerCase()
  );
  return record?.organicAllowed || false;
}

/**
 * Get biopesticide options for near-harvest use
 */
export function getNearHarvestOptions(): WithdrawalPeriod[] {
  return WITHDRAWAL_PERIODS.filter(w => w.phiDays <= 3 && w.organicAllowed);
}

/**
 * Calculate safe application date before harvest
 */
export function calculateLastSafeApplicationDate(
  harvestDate: Date,
  chemical: string,
  cropCategory: 'vegetables' | 'fruits' | 'field_crops',
  isExport: boolean = false
): Date | undefined {
  const phi = getPHI(chemical, cropCategory, isExport);
  if (phi === undefined) return undefined;
  
  const lastSafeDate = new Date(harvestDate);
  lastSafeDate.setDate(lastSafeDate.getDate() - phi);
  return lastSafeDate;
}

export default PHI_WITHDRAWAL_RULES;
