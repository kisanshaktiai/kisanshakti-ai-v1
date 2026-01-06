/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P1: SOIL TEST REPORT INTEGRATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Parser for government soil test reports with:
 * - Nutrient extraction (N/P/K, micronutrients)
 * - Soil property analysis (pH, EC, organic carbon)
 * - Auto-generated fertilizer recommendations
 * - Report validity tracking
 * 
 * Reference: ICAR Soil Health Card Scheme Standards
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface SoilTestReport {
  lab_name: string;
  test_date: Date;
  report_id: string;
  farmer_id?: string;
  land_id?: string;
  
  // Primary nutrients (kg/ha)
  nutrients_kg_ha: {
    nitrogen_available: number;
    phosphorus_available: number;
    potassium_available: number;
  };
  
  // Secondary nutrients (kg/ha)
  secondary_nutrients_kg_ha?: {
    calcium: number;
    magnesium: number;
    sulphur: number;
  };
  
  // Micronutrients (ppm)
  micronutrients_ppm: {
    zinc: number;
    iron: number;
    manganese: number;
    copper: number;
    boron: number;
  };
  
  // Soil properties
  soil_properties: {
    ph: number;
    ec_ds_m: number;
    organic_carbon_percent: number;
    cec_meq_100g?: number;  // Cation exchange capacity
    texture?: 'SANDY' | 'LOAMY' | 'CLAYEY' | 'SANDY_LOAM' | 'CLAY_LOAM';
  };
}

export interface NutrientStatus {
  nutrient: string;
  value: number;
  unit: string;
  status: 'DEFICIENT' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EXCESS';
  critical_level: number;
  optimum_range: [number, number];
}

export interface FertilizerRecommendation {
  crop: string;
  nutrients_required_kg_ha: {
    nitrogen: number;
    phosphorus: number;
    potassium: number;
    zinc?: number;
    boron?: number;
    sulphur?: number;
  };
  fertilizer_products: Array<{
    product: string;
    quantity_kg_ha: number;
    application_timing: string;
    notes?: string;
  }>;
  application_schedule: Array<{
    stage: string;
    das_range: [number, number];
    nutrients_to_apply: string[];
    products: string[];
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// NUTRIENT CRITICAL LEVELS (ICAR Standards)
// ═══════════════════════════════════════════════════════════════════════════

export const NUTRIENT_CRITICAL_LEVELS = {
  // Primary nutrients (kg/ha)
  nitrogen: { 
    deficient: [0, 140], 
    low: [140, 280], 
    medium: [280, 560], 
    high: [560, 800], 
    excess: [800, Infinity] 
  },
  phosphorus: { 
    deficient: [0, 10], 
    low: [10, 25], 
    medium: [25, 50], 
    high: [50, 75], 
    excess: [75, Infinity] 
  },
  potassium: { 
    deficient: [0, 110], 
    low: [110, 280], 
    medium: [280, 560], 
    high: [560, 840], 
    excess: [840, Infinity] 
  },
  
  // Micronutrients (ppm)
  zinc: { 
    deficient: [0, 0.6], 
    low: [0.6, 1.0], 
    medium: [1.0, 3.0], 
    high: [3.0, 10.0], 
    excess: [10.0, Infinity] 
  },
  iron: { 
    deficient: [0, 2.5], 
    low: [2.5, 4.5], 
    medium: [4.5, 10.0], 
    high: [10.0, 20.0], 
    excess: [20.0, Infinity] 
  },
  manganese: { 
    deficient: [0, 2.0], 
    low: [2.0, 4.0], 
    medium: [4.0, 8.0], 
    high: [8.0, 20.0], 
    excess: [20.0, Infinity] 
  },
  copper: { 
    deficient: [0, 0.2], 
    low: [0.2, 0.5], 
    medium: [0.5, 2.0], 
    high: [2.0, 5.0], 
    excess: [5.0, Infinity] 
  },
  boron: { 
    deficient: [0, 0.5], 
    low: [0.5, 1.0], 
    medium: [1.0, 2.0], 
    high: [2.0, 5.0], 
    excess: [5.0, Infinity] 
  },
  
  // Soil properties
  organic_carbon: {
    deficient: [0, 0.25],
    low: [0.25, 0.5],
    medium: [0.5, 0.75],
    high: [0.75, 1.0],
    excess: [1.0, Infinity]  // Not really excess, just high
  }
} as const;

// pH interpretation
export const PH_INTERPRETATION = {
  STRONGLY_ACIDIC: [0, 4.5],
  MODERATELY_ACIDIC: [4.5, 5.5],
  SLIGHTLY_ACIDIC: [5.5, 6.5],
  NEUTRAL: [6.5, 7.5],
  SLIGHTLY_ALKALINE: [7.5, 8.0],
  MODERATELY_ALKALINE: [8.0, 8.5],
  STRONGLY_ALKALINE: [8.5, 14.0]
} as const;

// EC interpretation (dS/m)
export const EC_INTERPRETATION = {
  NON_SALINE: [0, 1.0],
  SLIGHTLY_SALINE: [1.0, 2.0],
  MODERATELY_SALINE: [2.0, 4.0],
  STRONGLY_SALINE: [4.0, 8.0],
  VERY_STRONGLY_SALINE: [8.0, Infinity]
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// CROP-SPECIFIC NUTRIENT REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_NUTRIENT_REQUIREMENTS: Record<string, {
  n_kg_ha: number;
  p_kg_ha: number;
  k_kg_ha: number;
  micronutrients?: Record<string, number>;
}> = {
  wheat: { n_kg_ha: 120, p_kg_ha: 60, k_kg_ha: 40 },
  rice: { n_kg_ha: 120, p_kg_ha: 60, k_kg_ha: 60 },
  maize: { n_kg_ha: 150, p_kg_ha: 75, k_kg_ha: 75 },
  cotton: { n_kg_ha: 150, p_kg_ha: 60, k_kg_ha: 60, micronutrients: { zinc: 25, boron: 1 } },
  sugarcane: { n_kg_ha: 300, p_kg_ha: 100, k_kg_ha: 150 },
  soybean: { n_kg_ha: 30, p_kg_ha: 80, k_kg_ha: 40 },  // N-fixer
  chickpea: { n_kg_ha: 20, p_kg_ha: 60, k_kg_ha: 40 },  // N-fixer
  groundnut: { n_kg_ha: 25, p_kg_ha: 50, k_kg_ha: 30, micronutrients: { sulphur: 40 } },
  potato: { n_kg_ha: 180, p_kg_ha: 80, k_kg_ha: 150 },
  tomato: { n_kg_ha: 200, p_kg_ha: 100, k_kg_ha: 200 },
  onion: { n_kg_ha: 120, p_kg_ha: 80, k_kg_ha: 60, micronutrients: { sulphur: 45 } },
  chilli: { n_kg_ha: 120, p_kg_ha: 60, k_kg_ha: 80 }
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse and validate a soil test report
 */
export function parseSoilTestReport(rawData: Partial<SoilTestReport>): SoilTestReport | null {
  if (!rawData.nutrients_kg_ha || !rawData.soil_properties) {
    return null;
  }
  
  return {
    lab_name: rawData.lab_name || 'Unknown Lab',
    test_date: rawData.test_date ? new Date(rawData.test_date) : new Date(),
    report_id: rawData.report_id || `STR-${Date.now()}`,
    farmer_id: rawData.farmer_id,
    land_id: rawData.land_id,
    nutrients_kg_ha: {
      nitrogen_available: rawData.nutrients_kg_ha.nitrogen_available || 0,
      phosphorus_available: rawData.nutrients_kg_ha.phosphorus_available || 0,
      potassium_available: rawData.nutrients_kg_ha.potassium_available || 0
    },
    micronutrients_ppm: {
      zinc: rawData.micronutrients_ppm?.zinc || 0,
      iron: rawData.micronutrients_ppm?.iron || 0,
      manganese: rawData.micronutrients_ppm?.manganese || 0,
      copper: rawData.micronutrients_ppm?.copper || 0,
      boron: rawData.micronutrients_ppm?.boron || 0
    },
    soil_properties: {
      ph: rawData.soil_properties.ph || 7.0,
      ec_ds_m: rawData.soil_properties.ec_ds_m || 0,
      organic_carbon_percent: rawData.soil_properties.organic_carbon_percent || 0,
      cec_meq_100g: rawData.soil_properties.cec_meq_100g,
      texture: rawData.soil_properties.texture
    }
  };
}

/**
 * Analyze nutrient status from soil test
 */
export function analyzeNutrientStatus(report: SoilTestReport): NutrientStatus[] {
  const results: NutrientStatus[] = [];
  
  // Analyze primary nutrients
  const nutrients = [
    { name: 'nitrogen', value: report.nutrients_kg_ha.nitrogen_available, unit: 'kg/ha' },
    { name: 'phosphorus', value: report.nutrients_kg_ha.phosphorus_available, unit: 'kg/ha' },
    { name: 'potassium', value: report.nutrients_kg_ha.potassium_available, unit: 'kg/ha' }
  ];
  
  for (const nutrient of nutrients) {
    const levels = NUTRIENT_CRITICAL_LEVELS[nutrient.name as keyof typeof NUTRIENT_CRITICAL_LEVELS];
    let status: NutrientStatus['status'] = 'MEDIUM';
    
    if (nutrient.value >= levels.deficient[0] && nutrient.value < levels.deficient[1]) status = 'DEFICIENT';
    else if (nutrient.value >= levels.low[0] && nutrient.value < levels.low[1]) status = 'LOW';
    else if (nutrient.value >= levels.medium[0] && nutrient.value < levels.medium[1]) status = 'MEDIUM';
    else if (nutrient.value >= levels.high[0] && nutrient.value < levels.high[1]) status = 'HIGH';
    else status = 'EXCESS';
    
    results.push({
      nutrient: nutrient.name,
      value: nutrient.value,
      unit: nutrient.unit,
      status,
      critical_level: levels.low[0],
      optimum_range: [levels.medium[0], levels.medium[1]]
    });
  }
  
  // Analyze micronutrients
  const micros = [
    { name: 'zinc', value: report.micronutrients_ppm.zinc },
    { name: 'iron', value: report.micronutrients_ppm.iron },
    { name: 'manganese', value: report.micronutrients_ppm.manganese },
    { name: 'copper', value: report.micronutrients_ppm.copper },
    { name: 'boron', value: report.micronutrients_ppm.boron }
  ];
  
  for (const micro of micros) {
    const levels = NUTRIENT_CRITICAL_LEVELS[micro.name as keyof typeof NUTRIENT_CRITICAL_LEVELS];
    let status: NutrientStatus['status'] = 'MEDIUM';
    
    if (micro.value >= levels.deficient[0] && micro.value < levels.deficient[1]) status = 'DEFICIENT';
    else if (micro.value >= levels.low[0] && micro.value < levels.low[1]) status = 'LOW';
    else if (micro.value >= levels.medium[0] && micro.value < levels.medium[1]) status = 'MEDIUM';
    else if (micro.value >= levels.high[0] && micro.value < levels.high[1]) status = 'HIGH';
    else status = 'EXCESS';
    
    results.push({
      nutrient: micro.name,
      value: micro.value,
      unit: 'ppm',
      status,
      critical_level: levels.low[0],
      optimum_range: [levels.medium[0], levels.medium[1]]
    });
  }
  
  return results;
}

/**
 * Get pH interpretation
 */
export function interpretPH(ph: number): {
  category: string;
  implications: string[];
  corrections: string[];
} {
  let category = 'NEUTRAL';
  const implications: string[] = [];
  const corrections: string[] = [];
  
  if (ph < 4.5) {
    category = 'STRONGLY_ACIDIC';
    implications.push('Aluminum toxicity risk', 'Phosphorus lockup', 'Calcium/Magnesium deficiency');
    corrections.push('Apply lime 2-4 ton/ha', 'Use calcium ammonium nitrate instead of urea');
  } else if (ph < 5.5) {
    category = 'MODERATELY_ACIDIC';
    implications.push('Reduced nutrient availability', 'Phosphorus fixation');
    corrections.push('Apply lime 1-2 ton/ha', 'Add organic matter');
  } else if (ph < 6.5) {
    category = 'SLIGHTLY_ACIDIC';
    implications.push('Good for most crops');
  } else if (ph < 7.5) {
    category = 'NEUTRAL';
    implications.push('Optimal for nutrient availability');
  } else if (ph < 8.0) {
    category = 'SLIGHTLY_ALKALINE';
    implications.push('Iron, Zinc deficiency risk');
    corrections.push('Apply ferrous sulphate', 'Apply zinc sulphate');
  } else if (ph < 8.5) {
    category = 'MODERATELY_ALKALINE';
    implications.push('Micronutrient lockup', 'Phosphorus fixation');
    corrections.push('Apply gypsum', 'Use acidifying fertilizers like ammonium sulphate');
  } else {
    category = 'STRONGLY_ALKALINE';
    implications.push('Severe nutrient lockup', 'Sodium toxicity possible');
    corrections.push('Apply gypsum 3-5 ton/ha', 'Leach salts with irrigation', 'Add organic matter');
  }
  
  return { category, implications, corrections };
}

/**
 * Generate fertilizer recommendations based on soil test and crop
 */
export function generateFertilizerRecommendation(
  report: SoilTestReport,
  crop: string,
  targetYield?: number
): FertilizerRecommendation | null {
  const cropReq = CROP_NUTRIENT_REQUIREMENTS[crop.toLowerCase()];
  if (!cropReq) return null;
  
  const nutrientStatus = analyzeNutrientStatus(report);
  
  // Calculate required nutrients (crop requirement - soil supply)
  const nRequired = Math.max(0, cropReq.n_kg_ha - (report.nutrients_kg_ha.nitrogen_available * 0.3)); // 30% availability
  const pRequired = Math.max(0, cropReq.p_kg_ha - (report.nutrients_kg_ha.phosphorus_available * 0.25)); // 25% availability
  const kRequired = Math.max(0, cropReq.k_kg_ha - (report.nutrients_kg_ha.potassium_available * 0.5)); // 50% availability
  
  // Generate fertilizer products
  const products: FertilizerRecommendation['fertilizer_products'] = [];
  
  // Urea for nitrogen (46% N)
  if (nRequired > 0) {
    products.push({
      product: 'Urea',
      quantity_kg_ha: Math.round(nRequired / 0.46),
      application_timing: 'Split: 50% basal, 25% at tillering, 25% at panicle initiation',
      notes: 'Apply when soil is moist, avoid hot hours'
    });
  }
  
  // DAP for phosphorus (18% N, 46% P2O5)
  if (pRequired > 0) {
    products.push({
      product: 'DAP',
      quantity_kg_ha: Math.round(pRequired / 0.46),
      application_timing: '100% at sowing as basal',
      notes: 'Place near root zone for better uptake'
    });
  }
  
  // MOP for potassium (60% K2O)
  if (kRequired > 0) {
    products.push({
      product: 'MOP (Muriate of Potash)',
      quantity_kg_ha: Math.round(kRequired / 0.60),
      application_timing: '50% basal, 50% at flowering',
      notes: 'Avoid in saline soils, use SOP instead'
    });
  }
  
  // Zinc sulphate if deficient
  const zincStatus = nutrientStatus.find(n => n.nutrient === 'zinc');
  if (zincStatus && (zincStatus.status === 'DEFICIENT' || zincStatus.status === 'LOW')) {
    products.push({
      product: 'Zinc Sulphate (21%)',
      quantity_kg_ha: 25,
      application_timing: 'Basal application',
      notes: 'Mix with FYM before broadcasting'
    });
  }
  
  return {
    crop,
    nutrients_required_kg_ha: {
      nitrogen: nRequired,
      phosphorus: pRequired,
      potassium: kRequired
    },
    fertilizer_products: products,
    application_schedule: [
      {
        stage: 'Sowing/Transplanting',
        das_range: [0, 5],
        nutrients_to_apply: ['P (100%)', 'K (50%)', 'N (50%)'],
        products: ['DAP', 'MOP', 'Urea']
      },
      {
        stage: 'Tillering/Vegetative',
        das_range: [25, 35],
        nutrients_to_apply: ['N (25%)'],
        products: ['Urea']
      },
      {
        stage: 'Flowering/Panicle Initiation',
        das_range: [50, 60],
        nutrients_to_apply: ['N (25%)', 'K (50%)'],
        products: ['Urea', 'MOP']
      }
    ]
  };
}

/**
 * Check if soil test report is still valid (< 2 years old)
 */
export function isReportValid(report: SoilTestReport): boolean {
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  return new Date(report.test_date) > twoYearsAgo;
}

/**
 * Get soil health summary
 */
export function getSoilHealthSummary(report: SoilTestReport): {
  overall_health: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';
  score: number;  // 0-100
  key_issues: string[];
  recommendations: string[];
} {
  let score = 50;  // Base score
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  const nutrientStatus = analyzeNutrientStatus(report);
  const phInfo = interpretPH(report.soil_properties.ph);
  
  // Check primary nutrients
  for (const status of nutrientStatus.filter(n => ['nitrogen', 'phosphorus', 'potassium'].includes(n.nutrient))) {
    if (status.status === 'DEFICIENT') {
      score -= 15;
      issues.push(`${status.nutrient} severely deficient`);
    } else if (status.status === 'LOW') {
      score -= 8;
      issues.push(`${status.nutrient} below optimal`);
    } else if (status.status === 'HIGH') {
      score += 5;
    }
  }
  
  // Check pH
  if (phInfo.category === 'STRONGLY_ACIDIC' || phInfo.category === 'STRONGLY_ALKALINE') {
    score -= 15;
    issues.push(`pH ${report.soil_properties.ph} - ${phInfo.category.replace('_', ' ').toLowerCase()}`);
    recommendations.push(...phInfo.corrections);
  } else if (phInfo.category === 'MODERATELY_ACIDIC' || phInfo.category === 'MODERATELY_ALKALINE') {
    score -= 8;
    issues.push(`pH needs attention: ${report.soil_properties.ph}`);
    recommendations.push(...phInfo.corrections);
  }
  
  // Check organic carbon
  if (report.soil_properties.organic_carbon_percent < 0.5) {
    score -= 10;
    issues.push('Low organic carbon - poor soil health');
    recommendations.push('Add FYM/compost 5-10 ton/ha', 'Practice green manuring', 'Retain crop residues');
  } else if (report.soil_properties.organic_carbon_percent > 0.75) {
    score += 10;
  }
  
  // Check EC (salinity)
  if (report.soil_properties.ec_ds_m > 4) {
    score -= 15;
    issues.push('High salinity - affects crop growth');
    recommendations.push('Apply gypsum', 'Improve drainage', 'Use salt-tolerant varieties');
  } else if (report.soil_properties.ec_ds_m > 2) {
    score -= 8;
    issues.push('Moderate salinity');
  }
  
  // Check micronutrients
  const deficientMicros = nutrientStatus.filter(
    n => !['nitrogen', 'phosphorus', 'potassium'].includes(n.nutrient) && 
    (n.status === 'DEFICIENT' || n.status === 'LOW')
  );
  if (deficientMicros.length > 0) {
    score -= deficientMicros.length * 3;
    issues.push(`Micronutrient deficiency: ${deficientMicros.map(m => m.nutrient).join(', ')}`);
  }
  
  // Normalize score
  score = Math.max(0, Math.min(100, score));
  
  let overall_health: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';
  if (score < 40) overall_health = 'POOR';
  else if (score < 60) overall_health = 'FAIR';
  else if (score < 80) overall_health = 'GOOD';
  else overall_health = 'EXCELLENT';
  
  return {
    overall_health,
    score,
    key_issues: issues,
    recommendations
  };
}
