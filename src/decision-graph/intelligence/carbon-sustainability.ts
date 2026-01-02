/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P2: CARBON & SUSTAINABILITY TRACKING
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Carbon footprint calculator and sustainability metrics:
 * - Carbon sequestration from farming practices
 * - Carbon credit potential estimation
 * - Certification eligibility (NPOP, GlobalGAP, FairTrade)
 * - Sustainability scoring
 * 
 * Reference: ICAR Climate-Smart Agriculture, IPCC Guidelines
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface FarmPractices {
  // Tillage
  tillage_type: 'CONVENTIONAL' | 'REDUCED' | 'ZERO_TILL' | 'MINIMUM_TILL';
  
  // Crop residue management
  residue_management: 'BURNED' | 'REMOVED' | 'INCORPORATED' | 'MULCHED';
  
  // Cover crops
  cover_crops_used: boolean;
  cover_crop_species?: string[];
  
  // Organic inputs
  organic_manure_applied: boolean;
  fym_ton_per_ha?: number;
  compost_ton_per_ha?: number;
  vermicompost_ton_per_ha?: number;
  green_manure_incorporated?: boolean;
  
  // Chemical inputs
  synthetic_fertilizer_kg_n_per_ha: number;
  synthetic_pesticide_applications: number;
  
  // Water management
  irrigation_type: 'FLOOD' | 'FURROW' | 'SPRINKLER' | 'DRIP' | 'RAINFED';
  
  // Agroforestry
  trees_per_ha?: number;
  
  // Other practices
  integrated_pest_management: boolean;
  crop_rotation_practiced: boolean;
  intercropping_practiced: boolean;
}

export interface CarbonFootprint {
  // Emissions (kg CO2e/ha/year)
  emissions: {
    fertilizer_manufacturing: number;
    fertilizer_application: number;  // N2O emissions
    pesticide_manufacturing: number;
    tillage_operations: number;
    irrigation_pumping: number;
    residue_burning?: number;
    total_emissions: number;
  };
  
  // Sequestration (kg CO2e/ha/year)
  sequestration: {
    soil_organic_carbon: number;
    cover_crops: number;
    reduced_tillage: number;
    agroforestry: number;
    organic_inputs: number;
    total_sequestration: number;
  };
  
  // Net balance
  net_carbon_balance: number;  // Negative = carbon sink, Positive = source
  carbon_intensity_per_ton_produce?: number;
}

export interface CarbonCredits {
  eligible: boolean;
  estimated_credits_ton_co2_per_ha: number;
  estimated_value_inr_per_ha: number;
  credit_type: 'VOLUNTARY' | 'COMPLIANCE' | 'NONE';
  certification_pathway: string[];
  verification_requirements: string[];
}

export interface CertificationEligibility {
  npop_organic: {
    eligible: boolean;
    gaps: string[];
    time_to_certification_years: number;
  };
  
  globalgap: {
    eligible: boolean;
    gaps: string[];
    priority_actions: string[];
  };
  
  fairtrade: {
    eligible: boolean;
    requirements_met: string[];
    requirements_missing: string[];
  };
  
  rainforest_alliance: {
    eligible: boolean;
    score: number;
    improvement_areas: string[];
  };
}

export interface SustainabilityScore {
  overall_score: number;  // 0-100
  rating: 'POOR' | 'FAIR' | 'GOOD' | 'VERY_GOOD' | 'EXCELLENT';
  
  dimension_scores: {
    carbon_management: number;
    water_efficiency: number;
    soil_health: number;
    biodiversity: number;
    input_efficiency: number;
  };
  
  improvement_recommendations: Array<{
    practice: string;
    expected_improvement: number;
    implementation_cost: 'LOW' | 'MEDIUM' | 'HIGH';
    payback_years: number;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMISSION FACTORS (kg CO2e per unit)
// ═══════════════════════════════════════════════════════════════════════════

const EMISSION_FACTORS = {
  // Fertilizer manufacturing (kg CO2e per kg nutrient)
  nitrogen_manufacturing: 6.5,  // Includes Haber-Bosch process
  phosphorus_manufacturing: 1.0,
  potassium_manufacturing: 0.5,
  
  // N2O emissions from nitrogen application
  n2o_emission_factor: 0.01,  // 1% of applied N converts to N2O
  n2o_gwp: 298,  // Global Warming Potential of N2O
  
  // Pesticide manufacturing (kg CO2e per kg a.i.)
  insecticide_manufacturing: 25,
  fungicide_manufacturing: 15,
  herbicide_manufacturing: 20,
  avg_pesticide_manufacturing: 20,
  
  // Tillage operations (kg CO2e per ha)
  conventional_tillage: 80,
  reduced_tillage: 40,
  zero_tillage: 15,
  minimum_tillage: 25,
  
  // Irrigation pumping (kg CO2e per ha per irrigation)
  flood_irrigation: 50,
  furrow_irrigation: 40,
  sprinkler_irrigation: 35,
  drip_irrigation: 20,
  
  // Residue burning (kg CO2e per ton residue)
  residue_burning: 1500
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SEQUESTRATION RATES (kg CO2e per ha per year)
// ═══════════════════════════════════════════════════════════════════════════

const SEQUESTRATION_RATES = {
  // Soil organic carbon
  zero_till_sequestration: 500,
  minimum_till_sequestration: 300,
  reduced_till_sequestration: 200,
  
  // Cover crops
  cover_crop_sequestration: 400,
  legume_cover_crop_sequestration: 600,  // N-fixation bonus
  
  // Organic inputs
  fym_per_ton: 150,  // per ton applied
  compost_per_ton: 200,
  vermicompost_per_ton: 250,
  green_manure_incorporation: 350,
  
  // Agroforestry
  tree_sequestration_per_tree: 25,  // per tree per year
  
  // Residue retention
  residue_incorporated: 300,
  residue_mulched: 400
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// CORE CALCULATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate carbon footprint from farm practices
 */
export function calculateCarbonFootprint(
  practices: FarmPractices,
  area_ha: number = 1,
  irrigations_per_year: number = 10
): CarbonFootprint {
  // Calculate emissions
  const fertilizer_manufacturing = 
    practices.synthetic_fertilizer_kg_n_per_ha * EMISSION_FACTORS.nitrogen_manufacturing;
  
  const n2o_emissions = 
    practices.synthetic_fertilizer_kg_n_per_ha * 
    EMISSION_FACTORS.n2o_emission_factor * 
    (44/28) * // Convert N to N2O
    EMISSION_FACTORS.n2o_gwp;
  
  const pesticide_emissions = 
    practices.synthetic_pesticide_applications * 0.5 * // Assume 0.5 kg a.i. per application
    EMISSION_FACTORS.avg_pesticide_manufacturing;
  
  let tillage_emissions = 0;
  switch (practices.tillage_type) {
    case 'CONVENTIONAL': tillage_emissions = EMISSION_FACTORS.conventional_tillage; break;
    case 'REDUCED': tillage_emissions = EMISSION_FACTORS.reduced_tillage; break;
    case 'ZERO_TILL': tillage_emissions = EMISSION_FACTORS.zero_tillage; break;
    case 'MINIMUM_TILL': tillage_emissions = EMISSION_FACTORS.minimum_tillage; break;
  }
  
  let irrigation_emissions = 0;
  switch (practices.irrigation_type) {
    case 'FLOOD': irrigation_emissions = EMISSION_FACTORS.flood_irrigation * irrigations_per_year; break;
    case 'FURROW': irrigation_emissions = EMISSION_FACTORS.furrow_irrigation * irrigations_per_year; break;
    case 'SPRINKLER': irrigation_emissions = EMISSION_FACTORS.sprinkler_irrigation * irrigations_per_year; break;
    case 'DRIP': irrigation_emissions = EMISSION_FACTORS.drip_irrigation * irrigations_per_year; break;
    case 'RAINFED': irrigation_emissions = 0; break;
  }
  
  const residue_burning_emissions = 
    practices.residue_management === 'BURNED' ? EMISSION_FACTORS.residue_burning * 2 : 0;  // Assume 2 ton residue
  
  const total_emissions = 
    fertilizer_manufacturing + n2o_emissions + pesticide_emissions + 
    tillage_emissions + irrigation_emissions + residue_burning_emissions;
  
  // Calculate sequestration
  let tillage_sequestration = 0;
  switch (practices.tillage_type) {
    case 'ZERO_TILL': tillage_sequestration = SEQUESTRATION_RATES.zero_till_sequestration; break;
    case 'MINIMUM_TILL': tillage_sequestration = SEQUESTRATION_RATES.minimum_till_sequestration; break;
    case 'REDUCED': tillage_sequestration = SEQUESTRATION_RATES.reduced_till_sequestration; break;
  }
  
  const cover_crop_sequestration = practices.cover_crops_used 
    ? SEQUESTRATION_RATES.cover_crop_sequestration 
    : 0;
  
  const organic_sequestration = 
    (practices.fym_ton_per_ha || 0) * SEQUESTRATION_RATES.fym_per_ton +
    (practices.compost_ton_per_ha || 0) * SEQUESTRATION_RATES.compost_per_ton +
    (practices.vermicompost_ton_per_ha || 0) * SEQUESTRATION_RATES.vermicompost_per_ton +
    (practices.green_manure_incorporated ? SEQUESTRATION_RATES.green_manure_incorporation : 0);
  
  const agroforestry_sequestration = 
    (practices.trees_per_ha || 0) * SEQUESTRATION_RATES.tree_sequestration_per_tree;
  
  let residue_sequestration = 0;
  if (practices.residue_management === 'INCORPORATED') {
    residue_sequestration = SEQUESTRATION_RATES.residue_incorporated;
  } else if (practices.residue_management === 'MULCHED') {
    residue_sequestration = SEQUESTRATION_RATES.residue_mulched;
  }
  
  const soil_organic_carbon_sequestration = 
    tillage_sequestration + organic_sequestration + residue_sequestration;
  
  const total_sequestration = 
    soil_organic_carbon_sequestration + cover_crop_sequestration + agroforestry_sequestration;
  
  return {
    emissions: {
      fertilizer_manufacturing,
      fertilizer_application: n2o_emissions,
      pesticide_manufacturing: pesticide_emissions,
      tillage_operations: tillage_emissions,
      irrigation_pumping: irrigation_emissions,
      residue_burning: residue_burning_emissions > 0 ? residue_burning_emissions : undefined,
      total_emissions
    },
    sequestration: {
      soil_organic_carbon: soil_organic_carbon_sequestration,
      cover_crops: cover_crop_sequestration,
      reduced_tillage: tillage_sequestration,
      agroforestry: agroforestry_sequestration,
      organic_inputs: organic_sequestration,
      total_sequestration
    },
    net_carbon_balance: total_emissions - total_sequestration
  };
}

/**
 * Estimate carbon credit potential
 */
export function estimateCarbonCredits(
  footprint: CarbonFootprint,
  area_ha: number
): CarbonCredits {
  // Only eligible if net carbon sink (negative balance)
  if (footprint.net_carbon_balance >= 0) {
    return {
      eligible: false,
      estimated_credits_ton_co2_per_ha: 0,
      estimated_value_inr_per_ha: 0,
      credit_type: 'NONE',
      certification_pathway: ['Reduce emissions first', 'Increase sequestration practices'],
      verification_requirements: []
    };
  }
  
  // Calculate credits (only count 70% due to permanence discount)
  const net_sequestration = Math.abs(footprint.net_carbon_balance);
  const credits_per_ha = (net_sequestration / 1000) * 0.7;  // Convert kg to tons, 70% permanence
  
  // Carbon credit price ~₹1500-2500 per ton CO2e in India
  const price_per_ton = 2000;
  const value_per_ha = credits_per_ha * price_per_ton;
  
  return {
    eligible: true,
    estimated_credits_ton_co2_per_ha: Math.round(credits_per_ha * 100) / 100,
    estimated_value_inr_per_ha: Math.round(value_per_ha),
    credit_type: credits_per_ha > 1 ? 'VOLUNTARY' : 'VOLUNTARY',
    certification_pathway: [
      'Register with VERRA or Gold Standard',
      'Baseline measurement (soil carbon, practices)',
      'Annual monitoring and verification',
      'Third-party audit every 5 years'
    ],
    verification_requirements: [
      'GPS coordinates of all fields',
      'Soil carbon baseline test',
      'Practice adoption records',
      'Input purchase receipts',
      'Yield records for 3+ years'
    ]
  };
}

/**
 * Check certification eligibility
 */
export function checkCertificationEligibility(
  practices: FarmPractices
): CertificationEligibility {
  // NPOP Organic
  const npop_gaps: string[] = [];
  if (practices.synthetic_fertilizer_kg_n_per_ha > 0) {
    npop_gaps.push('Eliminate synthetic fertilizers');
  }
  if (practices.synthetic_pesticide_applications > 0) {
    npop_gaps.push('Eliminate synthetic pesticides');
  }
  if (!practices.organic_manure_applied) {
    npop_gaps.push('Use organic manure for nutrition');
  }
  const npop_eligible = npop_gaps.length === 0;
  
  // GlobalGAP
  const globalgap_gaps: string[] = [];
  const globalgap_priority: string[] = [];
  if (!practices.integrated_pest_management) {
    globalgap_gaps.push('Implement IPM practices');
    globalgap_priority.push('Start with monitoring and thresholds');
  }
  if (practices.residue_management === 'BURNED') {
    globalgap_gaps.push('Stop residue burning');
    globalgap_priority.push('Implement mulching or incorporation');
  }
  if (!practices.crop_rotation_practiced) {
    globalgap_gaps.push('Practice crop rotation');
  }
  
  // FairTrade
  const fairtrade_met: string[] = [];
  const fairtrade_missing: string[] = [];
  if (practices.integrated_pest_management) fairtrade_met.push('IPM practiced');
  else fairtrade_missing.push('IPM required');
  if (practices.organic_manure_applied) fairtrade_met.push('Organic inputs used');
  if (practices.residue_management !== 'BURNED') fairtrade_met.push('No residue burning');
  else fairtrade_missing.push('No burning allowed');
  
  // Rainforest Alliance
  let ra_score = 50;  // Base score
  if (practices.tillage_type === 'ZERO_TILL' || practices.tillage_type === 'MINIMUM_TILL') ra_score += 10;
  if (practices.cover_crops_used) ra_score += 10;
  if (practices.crop_rotation_practiced) ra_score += 10;
  if (practices.integrated_pest_management) ra_score += 10;
  if ((practices.trees_per_ha || 0) > 10) ra_score += 10;
  if (practices.residue_management === 'MULCHED' || practices.residue_management === 'INCORPORATED') ra_score += 5;
  if (practices.irrigation_type === 'DRIP') ra_score += 5;
  
  return {
    npop_organic: {
      eligible: npop_eligible,
      gaps: npop_gaps,
      time_to_certification_years: npop_eligible ? 0 : (npop_gaps.length <= 2 ? 2 : 3)
    },
    globalgap: {
      eligible: globalgap_gaps.length === 0,
      gaps: globalgap_gaps,
      priority_actions: globalgap_priority
    },
    fairtrade: {
      eligible: fairtrade_missing.length === 0,
      requirements_met: fairtrade_met,
      requirements_missing: fairtrade_missing
    },
    rainforest_alliance: {
      eligible: ra_score >= 70,
      score: Math.min(100, ra_score),
      improvement_areas: ra_score < 70 ? [
        'Increase tree cover',
        'Implement IPM',
        'Adopt conservation tillage'
      ] : []
    }
  };
}

/**
 * Calculate overall sustainability score
 */
export function calculateSustainabilityScore(
  practices: FarmPractices,
  footprint: CarbonFootprint
): SustainabilityScore {
  // Carbon management score
  let carbon_score = 50;
  if (footprint.net_carbon_balance < 0) carbon_score = 90;  // Carbon sink
  else if (footprint.net_carbon_balance < 500) carbon_score = 70;
  else if (footprint.net_carbon_balance < 1000) carbon_score = 50;
  else carbon_score = 30;
  
  // Water efficiency score
  let water_score = 50;
  switch (practices.irrigation_type) {
    case 'DRIP': water_score = 95; break;
    case 'SPRINKLER': water_score = 80; break;
    case 'RAINFED': water_score = 85; break;  // Natural is sustainable
    case 'FURROW': water_score = 60; break;
    case 'FLOOD': water_score = 40; break;
  }
  
  // Soil health score
  let soil_score = 50;
  if (practices.tillage_type === 'ZERO_TILL') soil_score += 25;
  else if (practices.tillage_type === 'MINIMUM_TILL') soil_score += 15;
  if (practices.cover_crops_used) soil_score += 15;
  if (practices.organic_manure_applied) soil_score += 15;
  if (practices.residue_management === 'MULCHED' || practices.residue_management === 'INCORPORATED') soil_score += 10;
  if (practices.residue_management === 'BURNED') soil_score -= 20;
  soil_score = Math.min(100, Math.max(0, soil_score));
  
  // Biodiversity score
  let biodiversity_score = 40;
  if (practices.crop_rotation_practiced) biodiversity_score += 15;
  if (practices.intercropping_practiced) biodiversity_score += 15;
  if ((practices.trees_per_ha || 0) > 0) biodiversity_score += 10;
  if (practices.cover_crops_used) biodiversity_score += 10;
  if (practices.integrated_pest_management) biodiversity_score += 10;
  biodiversity_score = Math.min(100, biodiversity_score);
  
  // Input efficiency score
  let input_score = 50;
  if (practices.synthetic_fertilizer_kg_n_per_ha < 50) input_score = 90;
  else if (practices.synthetic_fertilizer_kg_n_per_ha < 100) input_score = 70;
  else if (practices.synthetic_fertilizer_kg_n_per_ha < 150) input_score = 50;
  else input_score = 30;
  if (practices.integrated_pest_management) input_score += 10;
  if (practices.organic_manure_applied) input_score += 10;
  input_score = Math.min(100, input_score);
  
  // Overall score (weighted average)
  const overall_score = Math.round(
    carbon_score * 0.25 +
    water_score * 0.2 +
    soil_score * 0.25 +
    biodiversity_score * 0.15 +
    input_score * 0.15
  );
  
  let rating: SustainabilityScore['rating'];
  if (overall_score >= 85) rating = 'EXCELLENT';
  else if (overall_score >= 70) rating = 'VERY_GOOD';
  else if (overall_score >= 55) rating = 'GOOD';
  else if (overall_score >= 40) rating = 'FAIR';
  else rating = 'POOR';
  
  // Generate recommendations
  const recommendations: SustainabilityScore['improvement_recommendations'] = [];
  
  if (practices.tillage_type === 'CONVENTIONAL') {
    recommendations.push({
      practice: 'Adopt Zero Tillage',
      expected_improvement: 15,
      implementation_cost: 'MEDIUM',
      payback_years: 2
    });
  }
  
  if (!practices.cover_crops_used) {
    recommendations.push({
      practice: 'Plant Cover Crops',
      expected_improvement: 10,
      implementation_cost: 'LOW',
      payback_years: 1
    });
  }
  
  if (practices.irrigation_type === 'FLOOD') {
    recommendations.push({
      practice: 'Convert to Drip Irrigation',
      expected_improvement: 20,
      implementation_cost: 'HIGH',
      payback_years: 3
    });
  }
  
  if (practices.residue_management === 'BURNED') {
    recommendations.push({
      practice: 'Stop Burning, Incorporate Residue',
      expected_improvement: 12,
      implementation_cost: 'LOW',
      payback_years: 1
    });
  }
  
  if (!practices.organic_manure_applied) {
    recommendations.push({
      practice: 'Apply FYM/Compost 5-10 ton/ha',
      expected_improvement: 10,
      implementation_cost: 'MEDIUM',
      payback_years: 2
    });
  }
  
  return {
    overall_score,
    rating,
    dimension_scores: {
      carbon_management: carbon_score,
      water_efficiency: water_score,
      soil_health: soil_score,
      biodiversity: biodiversity_score,
      input_efficiency: input_score
    },
    improvement_recommendations: recommendations.slice(0, 5)  // Top 5
  };
}
