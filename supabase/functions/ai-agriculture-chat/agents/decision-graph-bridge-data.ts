// ============= Lines 1-350 of 713 total lines (Truncated) =============

// ═══════════════════════════════════════════════════════════════════════════
// IPM RECOMMENDATIONS DATABASE
// ═══════════════════════════════════════════════════════════════════════════

interface IPMRecommendation {
  crop_codes: string[];
  pest_codes: string[];
  disease_codes?: string[];
  stages?: CropStageCode[];
  severity_threshold: SeverityLevel;
  ipm_level: number;
  recommendations: {
    cultural?: string[];
    biological?: string[];
    botanical?: string[];
    chemical?: Array<{ name: string; dosage: string; phi_days: number }>;
  };
  scientific_basis: string;
  icar_reference?: string;
}

// Minimal IPM database for fallback strategies
// Product recommendations are now dynamic from DB
const IPM_DATABASE: IPMRecommendation[] = [
  // SUGARCANE PESTS
  {
    crop_codes: ['SUGARCANE', 'US', 'GANNA', 'OOS'],
    pest_codes: ['SHOOT_BORER', 'INTERNODE_BORER', 'TOP_BORER', 'DEAD_HEART', 'SUGARCANESHOOTBORER'],
    severity_threshold: 'LOW',
    ipm_level: 2,
    recommendations: {
      cultural: [
        'Remove and destroy ALL dead hearts immediately',
        'Do NOT harvest young crop for pest control',
        'Earthing up to cover root zone'
      ]
    },
    scientific_basis: 'Dead heart removal breaks pest cycle. Cultural control is primary IPM.'
  },
  
  // COTTON PESTS
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['WHITEFLY', 'BEMISIA', 'PANDHARI_MASHI'],
    severity_threshold: 'LOW',
    ipm_level: 1,
    recommendations: {
      cultural: ['Install yellow sticky traps @ 12/acre', 'Remove alternate hosts']
    },
    scientific_basis: 'Early detection with sticky traps.'
  },
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['PINK_BOLLWORM', 'GULABI_BONDI_ALI', 'PBW'],
    severity_threshold: 'LOW',
    ipm_level: 2,
    recommendations: {
      cultural: ['Install pheromone traps @ 5/acre', 'Destroy crop residue']
    },
    scientific_basis: 'Pheromone mass trapping effective for PBW.'
  },
  
  // RICE PESTS
  {
    crop_codes: ['RICE', 'PADDY', 'DHAN'],
    pest_codes: ['BPH', 'BROWN_PLANTHOPPER'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      cultural: ['Alternate wetting and drying irrigation', 'Avoid excess nitrogen']
    },
    scientific_basis: 'Water management critical for BPH control.'
  },
  
  // VEGETABLE PESTS
  {
    crop_codes: ['TOMATO', 'CHILLI', 'BRINJAL'],
    pest_codes: ['FRUIT_BORER', 'HELICOVERPA', 'SHOOT_BORER'],
    severity_threshold: 'LOW',
    ipm_level: 2,
    recommendations: {
      cultural: ['Pheromone traps @ 5/acre', 'Bird perches @ 20/acre', 'Clip affected shoots']
    },
    scientific_basis: 'Mechanical control effective in early stages.'
  }
];

// Minimal Disease Database for metadata only
// Actual recommendations come from master_products DB
interface DiseaseRecommendation {
  crop_codes: string[];
  disease_codes: string[];
  dsi_threshold: number;
  scientific_basis: string;
  recommendations: {
    preventive?: string[];
    curative?: Array<{ name: string; dosage: string; phi_days: number }>;
  };
}

const DISEASE_DATABASE: DiseaseRecommendation[] = [
  {
    crop_codes: ['COTTON'],
    disease_codes: ['BACTERIAL_LEAF_BLIGHT', 'BLB'],
    dsi_threshold: 20,
    scientific_basis: 'Copper-based bactericides prevent spread.',
    recommendations: { preventive: ['Streptocycline 0.01% + Copper oxychloride 0.3%'] }
  },
  {
    crop_codes: ['RICE', 'PADDY'],
    disease_codes: ['BLAST', 'RICE_BLAST'],
    dsi_threshold: 10,
    scientific_basis: 'Preventive sprays at tillering essential.',
    recommendations: { preventive: ['Tricyclazole 75% WP @ 0.6 g/L'] }
  },
  {
    crop_codes: ['TOMATO', 'POTATO'],
    disease_codes: ['LATE_BLIGHT', 'EARLY_BLIGHT'],
    dsi_threshold: 15,
    scientific_basis: 'Preventive contact fungicides recommended.',
    recommendations: { preventive: ['Mancozeb 75% WP @ 2.5 g/L'] }
  }
];
