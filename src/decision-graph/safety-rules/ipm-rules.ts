/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTEGRATED PEST MANAGEMENT (IPM) RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P5 (IPM Preference)
 * Based on: FAO IPM Principles 2020, ICAR-NCIPM IPM Package 2023, NPOP Standards
 * 
 * IPM Ladder: Prevention → Cultural → Mechanical → Biological → Botanical → Selective Chemical → Emergency
 */

import { 
  CauseRule, 
  Cause, 
  PriorityLevel,
  IPMLevel,
  DecisionInput 
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// IPM LADDER LEVELS
// ═══════════════════════════════════════════════════════════════════════════

export interface IPMLevelConfig {
  level: IPMLevel;
  infestationRange: { min: number; max: number };
  methods: string[];
  cost: string;
  efficacy: string;
  resistanceRisk: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  requirements?: string[];
}

export const IPM_LADDER: IPMLevelConfig[] = [
  {
    level: IPMLevel.LEVEL_0_PREVENTION,
    infestationRange: { min: 0, max: 10 },
    methods: [
      'Crop rotation (non-host 2/3 seasons)',
      'Resistant varieties',
      'Field sanitation (remove residues within 7 days)',
      'Trap crops (border planting)',
      'Planting date adjustment',
    ],
    cost: '₹0-500/acre',
    efficacy: '50-70%',
    resistanceRisk: 'VERY_LOW',
  },
  {
    level: IPMLevel.LEVEL_1_CULTURAL,
    infestationRange: { min: 0, max: 20 },
    methods: [
      'Hand picking (large visible pests)',
      'Removal of infested parts (destroy, don\'t compost)',
      'Water management (avoid excess moisture)',
      'Nutrient balance (avoid excess nitrogen)',
    ],
    cost: '₹0-500/acre',
    efficacy: '50-70%',
    resistanceRisk: 'VERY_LOW',
  },
  {
    level: IPMLevel.LEVEL_2_MECHANICAL,
    infestationRange: { min: 10, max: 30 },
    methods: [
      'Yellow sticky traps (whitefly, aphids)',
      'Blue sticky traps (thrips)',
      'Pheromone traps (mass trapping)',
      'Light traps (nocturnal pests)',
      'Mulches and physical barriers',
    ],
    cost: '₹500-2000/acre',
    efficacy: '60-80%',
    resistanceRisk: 'VERY_LOW',
  },
  {
    level: IPMLevel.LEVEL_3_BIOLOGICAL,
    infestationRange: { min: 20, max: 50 },
    methods: [
      'Ladybird beetles (10,000/ha) - aphids, mealybugs',
      'Lacewings (5,000/ha) - aphids, mites',
      'Trichogramma (50,000/ha/week x 6) - egg parasitoid',
      'Bt kurstaki (1 kg/ha) - caterpillars',
      'NPV (250 LE/ha) - species-specific virus',
      'Metarhizium/Beauveria - fungal pathogens',
    ],
    cost: '₹1000-3000/acre',
    efficacy: '70-85%',
    resistanceRisk: 'VERY_LOW',
    requirements: ['Timing critical', 'No broad-spectrum chemicals within 14 days'],
  },
  {
    level: IPMLevel.LEVEL_4_BOTANICAL,
    infestationRange: { min: 30, max: 60 },
    methods: [
      'Neem oil (0.5-1% solution)',
      'Neem seed kernel extract (5% solution)',
      'Pongamia oil (2% solution)',
      'Garlic extract (5% solution)',
    ],
    cost: '₹800-2000/acre',
    efficacy: '65-80%',
    resistanceRisk: 'VERY_LOW',
  },
  {
    level: IPMLevel.LEVEL_5_SELECTIVE_CHEMICAL,
    infestationRange: { min: 40, max: 80 },
    methods: [
      'Imidacloprid - sucking pests (NOT during flowering)',
      'Emamectin benzoate - lepidopteran larvae',
      'Spinosad - thrips, fruit flies (organic-approved)',
      'Abamectin - mites, leaf miners',
    ],
    cost: '₹1500-3000/acre',
    efficacy: '85-95%',
    resistanceRisk: 'MEDIUM',
    requirements: ['ETL exceeded', 'Biological insufficient', 'Max 2 applications/season', 'Rotation mandatory'],
  },
  {
    level: IPMLevel.LEVEL_6_BROAD_SPECTRUM,
    infestationRange: { min: 60, max: 100 },
    methods: [
      'Chlorpyrifos (if not banned)',
      'Cypermethrin',
      'Profenofos',
    ],
    cost: '₹2000-5000/acre',
    efficacy: '90-98%',
    resistanceRisk: 'VERY_HIGH',
    requirements: ['EMERGENCY ONLY', 'All other methods failed', 'Expert approval MANDATORY', '>60% crop at risk', 'Single application only', 'Withdrawal period 30+ days'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// BIOLOGICAL CONTROL AGENTS
// ═══════════════════════════════════════════════════════════════════════════

export const BIOLOGICAL_AGENTS = {
  predators: {
    ladybird: { targets: ['aphids', 'mealybugs', 'scale'], releaseRate: '10,000/ha', effectiveness: '70-80%' },
    lacewing: { targets: ['aphids', 'whiteflies', 'mites', 'eggs'], releaseRate: '5,000-7,500/ha', effectiveness: '65-75%' },
    spider: { targets: ['various insects'], releaseRate: 'natural occurrence - conserve', effectiveness: '50-60%' },
  },
  parasitoids: {
    trichogramma: { targets: ['lepidopteran eggs'], releaseRate: '50,000/ha/week', frequency: '6-8 releases', effectiveness: '60-70%', cost: '₹800-1200/ha/season' },
    bracon: { targets: ['stem borers'], releaseRate: 'field release', effectiveness: '40-50%' },
  },
  entomopathogens: {
    bt_kurstaki: { targets: ['caterpillars'], dose: '1-2 kg/ha', timing: 'early larval stage (L1-L2)', effectiveness: '70-85%', safety: 'Safe to humans and beneficials', limitation: 'UV sensitive' },
    npv_helicoverpa: { targets: ['Helicoverpa armigera'], dose: '250-500 LE/ha', timing: 'early evening', additive: 'Jaggery 0.5% + Teepol 0.1%', effectiveness: '65-80%', advantage: 'No resistance' },
    beauveria: { targets: ['beetles', 'whiteflies', 'aphids'], dose: '2-5 kg/ha', timing: 'high humidity', effectiveness: '60-75%' },
    metarhizium: { targets: ['beetles', 'termites'], dose: '2-5 kg/ha', effectiveness: '60-75%' },
  },
  botanicals: {
    neem: { targets: 'broad spectrum soft-bodied', mode: 'anti-feedant, growth disruptor', concentration: '0.5-1% oil, 1500-3000 ppm azadirachtin', advantages: ['Low toxicity', 'No resistance', 'Some systemic action'], limitations: ['Slow acting 3-5 days', 'UV degradation', 'Repeat applications'] },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CONSERVATION BIOLOGICAL CONTROL
// ═══════════════════════════════════════════════════════════════════════════

export const CONSERVATION_PRACTICES = {
  nectarPlants: ['Alyssum', 'Marigold', 'Coriander', 'Sunflower borders'],
  practices: [
    'Provide nectar sources (flowering plants)',
    'Avoid broad-spectrum insecticides',
    'Maintain field margins with vegetation',
    'Reduce tillage (beneficial insect habitat)',
  ],
  compatibleChemicals: ['Spinosad (selective)', 'Bt products', 'Growth regulators', 'Selective timing after beneficial release'],
  incompatibleChemicals: ['Pyrethroids (kill beneficials)', 'Organophosphates (highly toxic to beneficials)'],
  waitPeriod: '14 days after broad spectrum before beneficial release',
};

// ═══════════════════════════════════════════════════════════════════════════
// IPM RULES
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // LEVEL 0: PREVENTION PRACTICES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'IPM_001',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const hasCropRotation = input.metadata?.cropRotationPracticed;
      const hasResistantVariety = input.metadata?.resistantVarietyUsed;
      return !hasCropRotation && !hasResistantVariety;
    },
    cause: Cause.IPM_PREVENTION_NEEDED,
    priority: PriorityLevel.P5,
    scientific_source: 'FAO IPM Farmer Field School curriculum',
    scientific_basis: 'Prevention is the foundation of IPM. Crop rotation breaks pest cycles, resistant varieties reduce pest pressure.',
    icar_package: 'ICAR-NCIPM IPM Packages',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LEVEL 1: CULTURAL CONTROL PREFERRED
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'IPM_002',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const infestation = input.metadata?.infestationPercent || 0;
      return infestation > 0 && infestation <= 10;
    },
    cause: Cause.IPM_CULTURAL_CONTROL_PREFERRED,
    priority: PriorityLevel.P5,
    scientific_source: 'ICAR-NCIPM IPM Package 2023',
    scientific_basis: 'At 0-10% infestation, cultural control (hand picking, infested part removal, water/nutrient management) is most appropriate and cost-effective.',
    icar_package: 'Bullock 1992 - Crop rotation benefits',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LEVEL 2: MECHANICAL CONTROL
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'IPM_003',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const infestation = input.metadata?.infestationPercent || 0;
      return infestation > 10 && infestation <= 20;
    },
    cause: Cause.IPM_MECHANICAL_CONTROL_PREFERRED,
    priority: PriorityLevel.P5,
    scientific_source: 'IPM Principles',
    scientific_basis: 'At 10-20% infestation, mechanical control (traps, barriers) provides 60-80% efficacy with zero resistance risk.',
    icar_package: 'ICAR-NCIPM Trap Deployment Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LEVEL 3: BIOLOGICAL CONTROL
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'IPM_004',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const infestation = input.metadata?.infestationPercent || 0;
      return infestation > 20 && infestation <= 40;
    },
    cause: Cause.IPM_BIOLOGICAL_CONTROL_PREFERRED,
    priority: PriorityLevel.P5,
    scientific_source: 'Van Driesche & Bellows 1996 - Biological Control',
    scientific_basis: 'At 20-40% infestation, biological control (predators, parasitoids, pathogens) provides 70-85% efficacy with very low resistance risk.',
    icar_package: 'ICAR-NBAIR recommendations',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TRICHOGRAMMA RELEASE TIMING
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'IPM_005',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: ['flowering', 'fruiting', 'boll_formation'],
    conditions: (input: DecisionInput) => {
      const pest = input.metadata?.pestType?.toLowerCase() || '';
      const isLepidopteran = ['bollworm', 'fruit_borer', 'stem_borer', 'pod_borer'].includes(pest);
      const trapCount = input.metadata?.pheromoneTrappedMoths || 0;
      return isLepidopteran && trapCount > 5;
    },
    cause: Cause.TRICHOGRAMMA_RELEASE_RECOMMENDED,
    priority: PriorityLevel.P5,
    scientific_source: 'ICAR-NBAIR Trichogramma Guidelines',
    scientific_basis: 'Trichogramma parasitizes eggs before larvae hatch. Start at first egg laying (pheromone trap indicates moth activity). 60-70% egg destruction achievable.',
    icar_package: 'Trichogramma success stories - NCIPM',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LEVEL 4: BOTANICAL CONTROL
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'IPM_006',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const infestation = input.metadata?.infestationPercent || 0;
      const biologicalTried = input.metadata?.biologicalControlTried;
      return infestation > 30 && infestation <= 50 && biologicalTried;
    },
    cause: Cause.IPM_BOTANICAL_CONTROL_PREFERRED,
    priority: PriorityLevel.P5,
    scientific_source: 'NPOP Standards',
    scientific_basis: 'At 30-50% infestation after biological tried, botanical pesticides (neem, pongamia) provide 65-80% efficacy with very low resistance risk.',
    icar_package: 'Organic Pest Management - ICAR',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LEVEL 5: SELECTIVE CHEMICAL - ONLY IF LOWER LEVELS FAILED
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'IPM_007',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const infestation = input.metadata?.infestationPercent || 0;
      const lowerLevelsTried = input.metadata?.biologicalControlTried && input.metadata?.botanicalControlTried;
      const lowerLevelsInsufficient = input.metadata?.lowerLevelsInsufficient;
      return infestation > 40 && lowerLevelsTried && lowerLevelsInsufficient;
    },
    cause: Cause.IPM_SELECTIVE_CHEMICAL_ALLOWED,
    priority: PriorityLevel.P5,
    scientific_source: 'FAO IPM Principles 2020',
    scientific_basis: 'Selective chemicals allowed only when: ETL exceeded, biological methods insufficient, max 2 applications/season, rotation mandatory.',
    icar_package: 'ICAR-NCIPM IPM Package 2023',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BIOLOGICAL CONTROL INCOMPATIBILITY WARNING
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'IPM_008',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const daysSinceChemical = input.metadata?.daysSinceBroadSpectrumChemical || 0;
      const planningBiological = input.metadata?.planningBiologicalRelease;
      return planningBiological && daysSinceChemical < 14;
    },
    cause: Cause.BIOLOGICAL_CHEMICAL_INCOMPATIBILITY,
    priority: PriorityLevel.P5,
    scientific_source: 'Biological Control Guidelines',
    scientific_basis: 'Broad-spectrum chemicals kill beneficial insects. Wait 14 days after chemical application before beneficial release.',
    icar_package: 'ICAR-NBAIR Integration Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LEVEL 6: EMERGENCY CHEMICAL - EXPERT APPROVAL REQUIRED
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'IPM_009',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const infestation = input.metadata?.infestationPercent || 0;
      const allMethodsFailed = input.metadata?.allLowerMethodsFailed;
      const cropAtRisk = infestation > 60;
      return allMethodsFailed && cropAtRisk && !input.metadata?.expertApproval;
    },
    cause: Cause.EMERGENCY_CHEMICAL_NEEDS_EXPERT,
    priority: PriorityLevel.P0,
    scientific_source: 'FAO IPM Emergency Protocol',
    scientific_basis: 'Level 6 broad-spectrum chemicals only for EMERGENCY when >60% crop at risk. Expert approval MANDATORY. Single application only. Very high resistance risk.',
    icar_package: 'ICAR Emergency Pest Management',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CONSERVATION BIOLOGICAL CONTROL RECOMMENDATION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'IPM_010',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const hasNectarPlants = input.metadata?.hasNectarPlants;
      const hasFieldMargins = input.metadata?.hasFieldMargins;
      return !hasNectarPlants || !hasFieldMargins;
    },
    cause: Cause.CONSERVATION_BIOCONTROL_NEEDED,
    priority: PriorityLevel.P6,
    scientific_source: 'Conservation Biological Control',
    scientific_basis: 'Enhance natural enemy populations by providing nectar sources, maintaining field margins, avoiding broad-spectrum insecticides.',
    icar_package: 'ICAR-NBAIR Conservation Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TRAP CROP RECOMMENDATION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'IPM_011',
    category: 'ipm',
    crop_code: 'all',
    stage_applicable: ['sowing', 'seedling'],
    conditions: (input: DecisionInput) => {
      const hasHistoryOfPest = input.metadata?.fieldPestHistory;
      const hasTrapCrop = input.metadata?.hasTrapCropBorder;
      return hasHistoryOfPest && !hasTrapCrop;
    },
    cause: Cause.TRAP_CROP_RECOMMENDED,
    priority: PriorityLevel.P5,
    scientific_source: 'ICAR Trap Crop Guidelines',
    scientific_basis: 'Trap crops attract pests away from main crop. Marigold border for nematodes, Maize rows around cotton for Helicoverpa, Mustard around cabbage for aphids.',
    icar_package: 'FAO IPM Farmer Field School',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get recommended IPM level based on infestation
 */
export function getRecommendedIPMLevel(infestationPercent: number): IPMLevelConfig {
  return IPM_LADDER.find(l => 
    infestationPercent >= l.infestationRange.min && 
    infestationPercent <= l.infestationRange.max
  ) || IPM_LADDER[0];
}

/**
 * Get biological agent for specific pest
 */
export function getBiologicalAgentForPest(pestType: string): string[] {
  const agents: string[] = [];
  
  if (['aphid', 'mealybug', 'scale'].includes(pestType.toLowerCase())) {
    agents.push('Ladybird beetles (10,000/ha)');
  }
  if (['aphid', 'whitefly', 'mite'].includes(pestType.toLowerCase())) {
    agents.push('Lacewings (5,000/ha)');
  }
  if (['bollworm', 'fruit_borer', 'pod_borer', 'stem_borer'].includes(pestType.toLowerCase())) {
    agents.push('Trichogramma (50,000/ha/week x 6)');
    agents.push('Bt kurstaki (1-2 kg/ha)');
    agents.push('NPV (250 LE/ha)');
  }
  if (['beetle', 'termite'].includes(pestType.toLowerCase())) {
    agents.push('Metarhizium anisopliae (2-5 kg/ha)');
  }
  
  return agents.length > 0 ? agents : ['Neem oil (0.5-1%)', 'Consult local extension for specific bioagent'];
}

/**
 * Check if chemical is compatible with biological control
 */
export function isChemicalBiocompatible(chemicalName: string): boolean {
  const compatible = ['spinosad', 'bt', 'bacillus', 'neem', 'azadirachtin'];
  const incompatible = ['pyrethroid', 'cypermethrin', 'deltamethrin', 'chlorpyrifos', 'profenofos', 'organophosphate'];
  
  const lowerName = chemicalName.toLowerCase();
  if (compatible.some(c => lowerName.includes(c))) return true;
  if (incompatible.some(c => lowerName.includes(c))) return false;
  return false; // Default to incompatible for safety
}

export default IPM_RULES;
