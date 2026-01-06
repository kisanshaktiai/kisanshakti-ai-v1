/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADVANCED REMOTE SENSING INDICES (GAP 4.2)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Multi-spectral vegetation indices beyond NDVI:
 * - Water stress: NDWI, NDMI, CWSI
 * - Nitrogen stress: GNDVI, REIP
 * - Disease/senescence: PSRI, NPCI
 * - Enhanced vegetation: EVI, SAVI
 * 
 * Reference: ESA Sentinel-2 Applications, NASA ARSET
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SpectralBands {
  blue?: number;        // B2 (490nm)
  green?: number;       // B3 (560nm)
  red?: number;         // B4 (665nm)
  red_edge_1?: number;  // B5 (705nm)
  red_edge_2?: number;  // B6 (740nm)
  red_edge_3?: number;  // B7 (783nm)
  nir?: number;         // B8 (842nm)
  nir_narrow?: number;  // B8A (865nm)
  swir_1?: number;      // B11 (1610nm)
  swir_2?: number;      // B12 (2190nm)
  thermal?: number;     // Land Surface Temperature
}

export interface VegetationIndices {
  // Basic
  ndvi: number;           // Normalized Difference VI
  evi: number;            // Enhanced VI
  savi: number;           // Soil-Adjusted VI
  
  // Water Stress
  ndwi: number;           // Normalized Difference Water Index
  ndmi: number;           // Normalized Difference Moisture Index
  cwsi?: number;          // Crop Water Stress Index (needs thermal)
  
  // Nitrogen Stress
  gndvi: number;          // Green NDVI
  reip?: number;          // Red Edge Inflection Point
  
  // Disease/Senescence
  psri: number;           // Plant Senescence Reflectance Index
  npci: number;           // Normalized Pigment Chlorophyll Index
  
  // Quality
  calculation_date: Date;
  cloud_cover_percent: number;
  reliability_score: number;
}

export interface StressAssessment {
  stress_type: 'NONE' | 'WATER' | 'NITROGEN' | 'DISEASE' | 'SENESCENCE' | 'MULTIPLE';
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  confidence: number;
  primary_indicators: string[];
  recommended_action: string;
  days_before_visible?: number;  // Early warning
}

export interface ZonalAnalysis {
  zone_id: string;
  area_percent: number;
  avg_ndvi: number;
  stress_type: StressAssessment['stress_type'];
  recommendation: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// INDEX THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

export const INDEX_THRESHOLDS = {
  // NDVI interpretation
  ndvi: {
    bare_soil: [0, 0.15],
    sparse_vegetation: [0.15, 0.3],
    moderate_vegetation: [0.3, 0.5],
    healthy_vegetation: [0.5, 0.7],
    very_healthy: [0.7, 1.0]
  },
  
  // NDWI - Water content
  ndwi: {
    severe_water_stress: [-1, 0.0],
    moderate_stress: [0.0, 0.2],
    adequate: [0.2, 0.4],
    optimal: [0.4, 0.6],
    excess_moisture: [0.6, 1.0]
  },
  
  // GNDVI - Nitrogen sensitivity
  gndvi: {
    severe_n_deficiency: [0, 0.35],
    moderate_n_deficiency: [0.35, 0.45],
    adequate_n: [0.45, 0.55],
    optimal_n: [0.55, 0.70],
    luxury_n: [0.70, 1.0]
  },
  
  // PSRI - Senescence
  psri: {
    healthy: [-0.2, 0.0],
    early_senescence: [0.0, 0.1],
    moderate_senescence: [0.1, 0.2],
    advanced_senescence: [0.2, 0.5]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// INDEX CALCULATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate NDVI (Normalized Difference Vegetation Index)
 * Formula: (NIR - Red) / (NIR + Red)
 */
export function calculateNDVI(nir: number, red: number): number {
  if (nir + red === 0) return 0;
  return (nir - red) / (nir + red);
}

/**
 * Calculate EVI (Enhanced Vegetation Index)
 * Better for high biomass areas, reduces soil and atmospheric effects
 * Formula: G * (NIR - Red) / (NIR + C1*Red - C2*Blue + L)
 */
export function calculateEVI(nir: number, red: number, blue: number): number {
  const G = 2.5;
  const C1 = 6;
  const C2 = 7.5;
  const L = 1;
  
  const denominator = nir + C1 * red - C2 * blue + L;
  if (denominator === 0) return 0;
  
  return G * (nir - red) / denominator;
}

/**
 * Calculate SAVI (Soil-Adjusted Vegetation Index)
 * Better for sparse vegetation with visible soil
 * Formula: (NIR - Red) * (1 + L) / (NIR + Red + L)
 */
export function calculateSAVI(nir: number, red: number, L: number = 0.5): number {
  const denominator = nir + red + L;
  if (denominator === 0) return 0;
  
  return (nir - red) * (1 + L) / denominator;
}

/**
 * Calculate NDWI (Normalized Difference Water Index)
 * Detects water content in vegetation
 * Formula: (Green - NIR) / (Green + NIR) OR (NIR - SWIR) / (NIR + SWIR)
 */
export function calculateNDWI(nir: number, swir: number): number {
  if (nir + swir === 0) return 0;
  return (nir - swir) / (nir + swir);
}

/**
 * Calculate NDMI (Normalized Difference Moisture Index)
 * Sensitive to leaf water content
 * Formula: (NIR - SWIR1) / (NIR + SWIR1)
 */
export function calculateNDMI(nir: number, swir1: number): number {
  if (nir + swir1 === 0) return 0;
  return (nir - swir1) / (nir + swir1);
}

/**
 * Calculate GNDVI (Green NDVI)
 * More sensitive to chlorophyll/nitrogen content
 * Formula: (NIR - Green) / (NIR + Green)
 */
export function calculateGNDVI(nir: number, green: number): number {
  if (nir + green === 0) return 0;
  return (nir - green) / (nir + green);
}

/**
 * Calculate REIP (Red Edge Inflection Point)
 * Highly sensitive to chlorophyll content (nitrogen status)
 * Simplified formula using linear interpolation
 */
export function calculateREIP(
  redEdge1: number, 
  redEdge2: number, 
  redEdge3: number, 
  red: number
): number {
  // Linear interpolation method
  const rRE = (red + redEdge3) / 2;
  if (redEdge2 - redEdge1 === 0) return 720;  // Default
  
  return 700 + 40 * ((rRE - redEdge1) / (redEdge2 - redEdge1));
}

/**
 * Calculate PSRI (Plant Senescence Reflectance Index)
 * Detects carotenoid/chlorophyll ratio (stress/senescence)
 * Formula: (Red - Green) / Red Edge
 */
export function calculatePSRI(red: number, green: number, redEdge: number): number {
  if (redEdge === 0) return 0;
  return (red - green) / redEdge;
}

/**
 * Calculate NPCI (Normalized Pigment Chlorophyll Index)
 * Ratio of total pigments to chlorophyll
 * Formula: (Red - Blue) / (Red + Blue)
 */
export function calculateNPCI(red: number, blue: number): number {
  if (red + blue === 0) return 0;
  return (red - blue) / (red + blue);
}

/**
 * Calculate CWSI (Crop Water Stress Index)
 * Requires thermal data
 * Simplified: (Tc - Ta) / (Tc_max - Ta)
 */
export function calculateCWSI(
  canopyTemp: number,
  airTemp: number,
  maxCanopyTemp: number
): number {
  if (maxCanopyTemp - airTemp === 0) return 0;
  return (canopyTemp - airTemp) / (maxCanopyTemp - airTemp);
}

// ═══════════════════════════════════════════════════════════════════════════
// HIGH-LEVEL ANALYSIS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate all vegetation indices from spectral bands
 */
export function calculateAllIndices(
  bands: SpectralBands,
  cloudCover: number = 0
): VegetationIndices | null {
  if (!bands.nir || !bands.red) {
    return null;
  }
  
  const ndvi = calculateNDVI(bands.nir, bands.red);
  
  return {
    // Basic
    ndvi,
    evi: bands.blue ? calculateEVI(bands.nir, bands.red, bands.blue) : ndvi * 0.9,
    savi: calculateSAVI(bands.nir, bands.red),
    
    // Water stress
    ndwi: bands.swir_1 ? calculateNDWI(bands.nir, bands.swir_1) : 0,
    ndmi: bands.swir_1 ? calculateNDMI(bands.nir, bands.swir_1) : 0,
    cwsi: bands.thermal ? calculateCWSI(bands.thermal, 30, 45) : undefined,
    
    // Nitrogen stress
    gndvi: bands.green ? calculateGNDVI(bands.nir, bands.green) : ndvi * 0.85,
    reip: (bands.red_edge_1 && bands.red_edge_2 && bands.red_edge_3) ?
      calculateREIP(bands.red_edge_1, bands.red_edge_2, bands.red_edge_3, bands.red) : undefined,
    
    // Disease/senescence
    psri: (bands.green && bands.red_edge_1) ?
      calculatePSRI(bands.red, bands.green, bands.red_edge_1) : 0,
    npci: bands.blue ? calculateNPCI(bands.red, bands.blue) : 0,
    
    // Quality
    calculation_date: new Date(),
    cloud_cover_percent: cloudCover,
    reliability_score: cloudCover < 10 ? 0.95 : cloudCover < 30 ? 0.80 : 0.60
  };
}

/**
 * Assess stress from vegetation indices
 */
export function assessStress(indices: VegetationIndices): StressAssessment {
  const indicators: string[] = [];
  let stressType: StressAssessment['stress_type'] = 'NONE';
  let severity: StressAssessment['severity'] = 'LOW';
  let confidence = 0.7;
  
  // Check water stress
  if (indices.ndwi < 0.0 || indices.ndmi < 0.1) {
    indicators.push(`Low water content (NDWI: ${indices.ndwi.toFixed(2)}, NDMI: ${indices.ndmi.toFixed(2)})`);
    stressType = 'WATER';
    severity = indices.ndwi < -0.2 ? 'SEVERE' : indices.ndwi < 0 ? 'HIGH' : 'MODERATE';
    confidence = 0.85;
  }
  
  // Check nitrogen stress
  if (indices.gndvi < 0.45) {
    indicators.push(`Low chlorophyll/nitrogen (GNDVI: ${indices.gndvi.toFixed(2)})`);
    if (stressType !== 'NONE') {
      stressType = 'MULTIPLE';
    } else {
      stressType = 'NITROGEN';
      severity = indices.gndvi < 0.35 ? 'SEVERE' : indices.gndvi < 0.4 ? 'HIGH' : 'MODERATE';
    }
    confidence = Math.max(confidence, 0.82);
  }
  
  // Check senescence/disease
  if (indices.psri > 0.1) {
    indicators.push(`Senescence/stress detected (PSRI: ${indices.psri.toFixed(2)})`);
    if (stressType !== 'NONE') {
      stressType = 'MULTIPLE';
    } else {
      stressType = indices.psri > 0.2 ? 'SENESCENCE' : 'DISEASE';
      severity = indices.psri > 0.25 ? 'SEVERE' : indices.psri > 0.15 ? 'HIGH' : 'MODERATE';
    }
    confidence = Math.max(confidence, 0.78);
  }
  
  // Generate recommendation
  let recommendation = '';
  let daysBeforeVisible: number | undefined;
  
  switch (stressType) {
    case 'WATER':
      recommendation = 'Irrigate immediately. Consider deficit irrigation strategy.';
      daysBeforeVisible = 5;
      break;
    case 'NITROGEN':
      recommendation = 'Apply nitrogen top-dressing. Consider foliar urea (2%) for quick recovery.';
      daysBeforeVisible = 7;
      break;
    case 'DISEASE':
      recommendation = 'Scout for disease symptoms. Consider preventive fungicide spray.';
      daysBeforeVisible = 10;
      break;
    case 'SENESCENCE':
      recommendation = 'Normal maturity if at harvest stage. Check for premature senescence if early.';
      break;
    case 'MULTIPLE':
      recommendation = 'Multiple stress detected. Prioritize irrigation, then nutrition.';
      daysBeforeVisible = 5;
      break;
    default:
      recommendation = 'Crop appears healthy. Continue monitoring.';
  }
  
  return {
    stress_type: stressType,
    severity,
    confidence,
    primary_indicators: indicators.length > 0 ? indicators : ['All indices within normal range'],
    recommended_action: recommendation,
    days_before_visible: daysBeforeVisible
  };
}

/**
 * Compare current indices with previous period
 */
export function analyzeTrend(
  current: VegetationIndices,
  previous: VegetationIndices
): {
  ndvi_trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  water_trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  nitrogen_trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  alert?: string;
} {
  const ndviChange = current.ndvi - previous.ndvi;
  const ndwiChange = current.ndwi - previous.ndwi;
  const gndviChange = current.gndvi - previous.gndvi;
  
  const getTrend = (change: number, threshold: number = 0.05): 'IMPROVING' | 'STABLE' | 'DECLINING' => {
    if (change > threshold) return 'IMPROVING';
    if (change < -threshold) return 'DECLINING';
    return 'STABLE';
  };
  
  const result = {
    ndvi_trend: getTrend(ndviChange),
    water_trend: getTrend(ndwiChange),
    nitrogen_trend: getTrend(gndviChange),
    alert: undefined as string | undefined
  };
  
  // Generate alert for rapid decline
  if (ndviChange < -0.15) {
    result.alert = `⚠️ Rapid NDVI decline (${(ndviChange * 100).toFixed(0)}%) - investigate immediately`;
  } else if (ndwiChange < -0.2) {
    result.alert = `⚠️ Significant water stress increase - irrigation needed`;
  }
  
  return result;
}

/**
 * Get index interpretation for farmers
 */
export function getIndexInterpretation(
  indices: VegetationIndices,
  language: 'mr' | 'hi' | 'en' = 'en'
): string {
  const assessment = assessStress(indices);
  
  const interpretations: Record<string, Record<string, string>> = {
    healthy: {
      en: `✅ Crop appears healthy (NDVI: ${indices.ndvi.toFixed(2)}). Continue regular monitoring.`,
      mr: `✅ पीक निरोगी दिसते (NDVI: ${indices.ndvi.toFixed(2)}). नियमित निरीक्षण सुरू ठेवा.`,
      hi: `✅ फसल स्वस्थ दिख रही है (NDVI: ${indices.ndvi.toFixed(2)}). नियमित निगरानी जारी रखें.`
    },
    water_stress: {
      en: `💧 Water stress detected. NDWI: ${indices.ndwi.toFixed(2)} indicates low moisture. Irrigate soon.`,
      mr: `💧 पाण्याचा ताण आढळला. NDWI: ${indices.ndwi.toFixed(2)} कमी ओलावा दर्शवतो. लवकर पाणी द्या.`,
      hi: `💧 पानी का तनाव पाया गया. NDWI: ${indices.ndwi.toFixed(2)} कम नमी दर्शाता है. जल्दी सिंचाई करें.`
    },
    nitrogen_stress: {
      en: `🌿 Nitrogen deficiency detected. GNDVI: ${indices.gndvi.toFixed(2)}. Apply nitrogen fertilizer.`,
      mr: `🌿 नायट्रोजनची कमतरता आढळली. GNDVI: ${indices.gndvi.toFixed(2)}. नायट्रोजन खत द्या.`,
      hi: `🌿 नाइट्रोजन की कमी पाई गई. GNDVI: ${indices.gndvi.toFixed(2)}. नाइट्रोजन उर्वरक डालें.`
    }
  };
  
  if (assessment.stress_type === 'NONE') {
    return interpretations.healthy[language];
  } else if (assessment.stress_type === 'WATER') {
    return interpretations.water_stress[language];
  } else if (assessment.stress_type === 'NITROGEN') {
    return interpretations.nitrogen_stress[language];
  }
  
  return assessment.recommended_action;
}
