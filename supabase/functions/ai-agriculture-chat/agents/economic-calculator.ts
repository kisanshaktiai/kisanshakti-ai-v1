/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ECONOMIC CALCULATOR - Treatment Viability Assessment
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Calculates cost-benefit analysis, ROI, and affordability for treatment options.
 * Ensures farmers receive economically viable recommendations.
 */

import type {
  RuleExecutionInput,
  EconomicAssessment,
  RecommendationDetails,
  CropEconomicsData
} from './rule-engine-types.ts';
import {
  CROP_ECONOMICS,
  SEVERITY_LOSS_PERCENTAGE,
  ECONOMIC_THRESHOLDS
} from './rule-engine-types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ECONOMIC CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

export function calculateEconomicViability(
  recommendation: RecommendationDetails,
  input: RuleExecutionInput
): EconomicAssessment {
  // Get crop economics data
  const cropData = getCropEconomics(input.farmer_context.crop_code);
  
  // Calculate expected yield value
  const expectedYieldValue = calculateExpectedYieldValue(cropData, input.farmer_context.land_size_acres);
  
  // Calculate yield at risk based on affected area
  const yieldAtRiskPercent = input.pest_disease_state.affected_area_percent / 100;
  const valueAtRisk = expectedYieldValue * yieldAtRiskPercent;
  
  // Calculate expected loss without treatment (based on severity)
  const lossPercentage = SEVERITY_LOSS_PERCENTAGE[input.pest_disease_state.severity];
  const expectedLossWithoutTreatment = valueAtRisk * lossPercentage;
  
  // Calculate treatment cost
  const costPerAcre = recommendation.cost_per_acre_inr || estimateCostPerAcre(recommendation);
  const totalTreatmentCost = costPerAcre * input.farmer_context.land_size_acres;
  
  // Calculate expected loss prevented (based on treatment efficacy)
  const efficacy = (recommendation.efficacy_percent || 75) / 100;
  const expectedLossPrevented = expectedLossWithoutTreatment * efficacy;
  
  // Calculate net benefit and ratios
  const netBenefit = expectedLossPrevented - totalTreatmentCost;
  const benefitCostRatio = totalTreatmentCost > 0 
    ? expectedLossPrevented / totalTreatmentCost 
    : Infinity;
  const roi = totalTreatmentCost > 0 
    ? (netBenefit / totalTreatmentCost) * 100 
    : 100;
  
  // Affordability assessment
  const affordabilityRatio = input.farmer_constraints.budget_available_inr > 0
    ? totalTreatmentCost / input.farmer_constraints.budget_available_inr
    : 1;
  
  const affordability = assessAffordability(
    affordabilityRatio,
    totalTreatmentCost,
    input.farmer_constraints.budget_available_inr
  );
  
  // Viability decision
  const viabilityDecision = determineViability(benefitCostRatio);
  const recommendation_type = determineRecommendation(benefitCostRatio, affordabilityRatio);
  
  return {
    treatment_cost_inr: Math.round(totalTreatmentCost),
    treatment_cost_per_acre_inr: Math.round(costPerAcre),
    expected_loss_without_treatment_inr: Math.round(expectedLossWithoutTreatment),
    expected_loss_prevented_inr: Math.round(expectedLossPrevented),
    net_benefit_inr: Math.round(netBenefit),
    benefit_cost_ratio: Math.round(benefitCostRatio * 100) / 100,
    roi_percent: Math.round(roi),
    affordability,
    viability_decision: viabilityDecision,
    recommendation: recommendation_type,
    breakdown: {
      product_cost_inr: Math.round(costPerAcre * input.farmer_context.land_size_acres * 0.6),
      labor_cost_inr: Math.round(costPerAcre * input.farmer_context.land_size_acres * 0.3),
      equipment_cost_inr: Math.round(costPerAcre * input.farmer_context.land_size_acres * 0.1)
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getCropEconomics(cropCode: string): CropEconomicsData {
  const upperCropCode = cropCode.toUpperCase();
  return CROP_ECONOMICS[upperCropCode] || {
    crop_code: upperCropCode,
    expected_yield_quintals_per_acre: 10,
    msp_per_quintal_inr: 3000,
    market_price_per_quintal_inr: 3500,
    production_cost_per_acre_inr: 20000
  };
}

function calculateExpectedYieldValue(cropData: CropEconomicsData, landSizeAcres: number): number {
  const totalYield = cropData.expected_yield_quintals_per_acre * landSizeAcres;
  return totalYield * cropData.market_price_per_quintal_inr;
}

function estimateCostPerAcre(recommendation: RecommendationDetails): number {
  // Default cost estimates by product type and IPM level
  const costByType: Record<string, number> = {
    'BIOLOGICAL': 1500,
    'BOTANICAL': 1200,
    'CHEMICAL': 2000,
    'ORGANIC': 1000,
    'FERTILIZER': 2500,
    'GROWTH_REGULATOR': 1800
  };
  
  const costByIPMLevel: Record<number, number> = {
    0: 500,   // Prevention
    1: 800,   // Cultural
    2: 1500,  // Mechanical
    3: 2000,  // Biological
    4: 1500,  // Botanical
    5: 2500,  // Selective chemical
    6: 3000   // Broad spectrum
  };
  
  if (recommendation.ipm_level !== undefined) {
    return costByIPMLevel[recommendation.ipm_level] || 1500;
  }
  
  return costByType[recommendation.product_type] || 1500;
}

function assessAffordability(
  ratio: number,
  treatmentCost: number,
  budget: number
): EconomicAssessment['affordability'] {
  let assessment: 'AFFORDABLE' | 'MODERATE' | 'HIGH_COST' | 'UNAFFORDABLE';
  let canAfford: boolean;
  
  if (ratio <= ECONOMIC_THRESHOLDS.MODERATE_AFFORDABLE_RATIO) {
    assessment = 'AFFORDABLE';
    canAfford = true;
  } else if (ratio <= ECONOMIC_THRESHOLDS.MAX_AFFORDABLE_RATIO) {
    assessment = 'MODERATE';
    canAfford = true;
  } else if (ratio <= 0.50) {
    assessment = 'HIGH_COST';
    canAfford = budget >= treatmentCost;
  } else {
    assessment = 'UNAFFORDABLE';
    canAfford = false;
  }
  
  return {
    ratio: Math.round(ratio * 100) / 100,
    assessment,
    farmer_can_afford: canAfford,
    budget_remaining_after_treatment_inr: canAfford ? Math.round(budget - treatmentCost) : 0
  };
}

function determineViability(benefitCostRatio: number): 'VIABLE' | 'MARGINAL' | 'NOT_VIABLE' {
  if (benefitCostRatio >= ECONOMIC_THRESHOLDS.MIN_BENEFIT_COST_RATIO_VIABLE) {
    return 'VIABLE';
  } else if (benefitCostRatio >= ECONOMIC_THRESHOLDS.MIN_BENEFIT_COST_RATIO_MARGINAL) {
    return 'MARGINAL';
  }
  return 'NOT_VIABLE';
}

function determineRecommendation(
  benefitCostRatio: number,
  affordabilityRatio: number
): EconomicAssessment['recommendation'] {
  if (benefitCostRatio >= ECONOMIC_THRESHOLDS.STRONGLY_RECOMMENDED_BCR && 
      affordabilityRatio <= ECONOMIC_THRESHOLDS.MAX_AFFORDABLE_RATIO) {
    return 'STRONGLY_RECOMMENDED';
  }
  
  if (benefitCostRatio >= ECONOMIC_THRESHOLDS.MIN_BENEFIT_COST_RATIO_VIABLE) {
    return 'RECOMMENDED';
  }
  
  if (benefitCostRatio >= ECONOMIC_THRESHOLDS.MIN_BENEFIT_COST_RATIO_MARGINAL) {
    return 'CONDITIONAL';
  }
  
  if (benefitCostRatio >= 0.5) {
    return 'EXPLORE_ALTERNATIVES';
  }
  
  return 'NOT_RECOMMENDED';
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-OPTION COMPARISON
// ═══════════════════════════════════════════════════════════════════════════

export function compareEconomicOptions(
  recommendations: RecommendationDetails[],
  input: RuleExecutionInput
): Array<{
  recommendation: RecommendationDetails;
  assessment: EconomicAssessment;
  rank: number;
}> {
  const assessments = recommendations.map(rec => ({
    recommendation: rec,
    assessment: calculateEconomicViability(rec, input)
  }));
  
  // Rank by composite score: BCR * affordability weight
  const ranked = assessments
    .map((item, index) => ({
      ...item,
      score: item.assessment.benefit_cost_ratio * (item.assessment.affordability.farmer_can_afford ? 1.2 : 0.5),
      originalIndex: index
    }))
    .sort((a, b) => b.score - a.score)
    .map((item, rank) => ({
      recommendation: item.recommendation,
      assessment: item.assessment,
      rank: rank + 1
    }));
  
  return ranked;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUDGET ALLOCATION HELPER
// ═══════════════════════════════════════════════════════════════════════════

export function suggestBudgetAllocation(
  totalBudget: number,
  treatmentCost: number,
  followUpNeeded: boolean
): {
  treatment_allocation_inr: number;
  reserve_for_follow_up_inr: number;
  remaining_inr: number;
  can_proceed: boolean;
  suggestion: string;
  suggestion_mr: string;
  suggestion_hi: string;
} {
  const followUpReserve = followUpNeeded ? treatmentCost * 0.5 : 0;
  const totalNeeded = treatmentCost + followUpReserve;
  const canProceed = totalBudget >= treatmentCost;
  const hasFollowUpBuffer = totalBudget >= totalNeeded;
  
  let suggestion: string;
  let suggestion_mr: string;
  let suggestion_hi: string;
  
  if (!canProceed) {
    suggestion = 'Budget insufficient for treatment. Consider lower-cost IPM options.';
    suggestion_mr = 'बजेट उपचारासाठी अपुरे आहे. कमी खर्चाचे IPM पर्याय विचारात घ्या.';
    suggestion_hi = 'उपचार के लिए बजट अपर्याप्त। कम लागत के IPM विकल्पों पर विचार करें।';
  } else if (!hasFollowUpBuffer) {
    suggestion = 'Budget covers treatment but no follow-up reserve. Monitor carefully.';
    suggestion_mr = 'बजेट उपचारासाठी पुरेसे पण फॉलो-अपसाठी राखीव नाही. काळजीपूर्वक निरीक्षण करा.';
    suggestion_hi = 'बजट उपचार के लिए पर्याप्त लेकिन फॉलो-अप के लिए रिजर्व नहीं। सावधानी से निगरानी करें।';
  } else {
    suggestion = 'Budget sufficient for treatment and follow-up if needed.';
    suggestion_mr = 'उपचार आणि आवश्यक असल्यास फॉलो-अपसाठी बजेट पुरेसे आहे.';
    suggestion_hi = 'उपचार और जरूरत पड़ने पर फॉलो-अप के लिए बजट पर्याप्त है।';
  }
  
  return {
    treatment_allocation_inr: canProceed ? treatmentCost : 0,
    reserve_for_follow_up_inr: hasFollowUpBuffer ? followUpReserve : 0,
    remaining_inr: Math.max(0, totalBudget - treatmentCost - followUpReserve),
    can_proceed: canProceed,
    suggestion,
    suggestion_mr,
    suggestion_hi
  };
}
