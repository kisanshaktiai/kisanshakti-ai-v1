/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMMUNICATION DATA EXTRACTORS v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Utility functions to extract structured data from DecisionOutput
 * for populating farmer-friendly communication templates
 */

import type { 
  DecisionOutput, 
  PrimaryDecision, 
  EconomicAssessment, 
  AppliedRule,
  SecondaryAction,
  BlockedAction,
  FollowUpSchedule,
  ApplicationDetails
} from './rule-engine-types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT DETAILS EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

export interface ExtractedProductDetails {
  name: string;
  localName?: string;
  dosage: string;
  method: string;
  timing: string;
  phiDays: number;
  waterVolume: string;
  safetyClass: string;
  concentration?: string;
  activeIngredient?: string;
  productType: string;
}

/**
 * Extract product details from DecisionOutput
 */
export function extractProductDetails(decision: DecisionOutput): ExtractedProductDetails | null {
  const appDetails = decision.primary_decision?.application_details;
  
  if (!appDetails) {
    console.log('[DataExtractor] No application details found in decision');
    return null;
  }
  
  // Validate product name
  const productName = sanitizeProductName(appDetails.product_name);
  if (!productName) {
    console.log('[DataExtractor] No valid product name found');
    return null;
  }
  
  return {
    name: productName,
    localName: appDetails.product_name_local,
    dosage: appDetails.quantity_per_acre || appDetails.concentration || 'As per label',
    method: appDetails.application_method || 'FOLIAR_SPRAY',
    timing: decision.primary_decision?.timing?.best_time_of_day || 'MORNING',
    phiDays: appDetails.phi_days || appDetails.waiting_period_days || 0,
    waterVolume: appDetails.water_requirement || '200 liters/acre',
    safetyClass: getPPELevel(appDetails.ppe_required || []),
    concentration: appDetails.concentration,
    activeIngredient: appDetails.active_ingredient,
    productType: appDetails.product_type || 'CHEMICAL'
  };
}

function sanitizeProductName(name: any): string | null {
  if (!name) return null;
  const strName = String(name).trim();
  const lower = strName.toLowerCase();

  if (
    strName === '' ||
    lower === 'none' ||
    lower === 'undefined' ||
    lower === 'null' ||
    lower.includes('blocking rule is active') ||
    lower.includes('see structured response') ||
    lower.includes('see matched response') ||
    lower.includes('recommended treatment') ||
    lower.includes('monitor and reassess') ||
    lower.includes('continue monitoring')
  ) {
    return null;
  }

  return strName;
}

function getPPELevel(ppeList: string[]): string {
  if (ppeList.includes('FULL_PPE') || ppeList.length >= 4) return 'HIGH';
  if (ppeList.length >= 2) return 'MODERATE';
  return 'LOW';
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE INFORMATION EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

export interface ExtractedCauseInfo {
  cause: string;
  causeCode: string;
  severity: string;
  confidence: number;
  affectedAreaPercent: number;
  isPest: boolean;
  isDisease: boolean;
  isNutrient: boolean;
}

/**
 * Extract cause information from DecisionOutput
 */
export function extractCauseInfo(decision: DecisionOutput): ExtractedCauseInfo {
  const primary = decision.primary_decision;
  const target = primary?.target || {};
  
  // Determine cause code
  let causeCode = target.pest_code || target.disease_code || target.nutrient_deficiency || 'UNKNOWN';
  
  // Try to get from rules applied
  if (causeCode === 'UNKNOWN' && decision.rules_applied?.length > 0) {
    const firstRule = decision.rules_applied[0];
    if (firstRule.rule_id) {
      // Extract cause from rule_id (e.g., "PM_WHITEFLY_001" -> "WHITEFLY")
      const parts = firstRule.rule_id.split('_');
      if (parts.length >= 2) {
        causeCode = parts.slice(1, -1).join('_');
      }
    }
  }
  
  return {
    cause: formatCauseName(causeCode),
    causeCode: causeCode,
    severity: decision.primary_decision?.urgency || 'MEDIUM',
    confidence: decision.confidence_metrics?.overall_decision_confidence || 0.7,
    affectedAreaPercent: 0, // Would come from field conditions
    isPest: !!target.pest_code,
    isDisease: !!target.disease_code,
    isNutrient: !!target.nutrient_deficiency
  };
}

function formatCauseName(code: string): string {
  return code.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════════════════
// ECONOMIC INFORMATION EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

export interface ExtractedEconomicInfo {
  costInr: number;
  costPerAcreInr: number;
  benefitInr: number;
  netBenefitInr: number;
  roiPercent: number;
  bcr: number;
  isViable: boolean;
  affordability: string;
  recommendation: string;
}

/**
 * Extract economic assessment information
 */
export function extractEconomicInfo(decision: DecisionOutput): ExtractedEconomicInfo | null {
  const econ = decision.economic_assessment;
  
  if (!econ) {
    console.log('[DataExtractor] No economic assessment found');
    return null;
  }
  
  return {
    costInr: econ.treatment_cost_inr || 0,
    costPerAcreInr: econ.treatment_cost_per_acre_inr || 0,
    benefitInr: econ.expected_loss_prevented_inr || 0,
    netBenefitInr: econ.net_benefit_inr || 0,
    roiPercent: econ.roi_percent || 0,
    bcr: econ.benefit_cost_ratio || 0,
    isViable: econ.viability_decision === 'VIABLE' || econ.viability_decision === 'MARGINAL',
    affordability: econ.affordability?.assessment || 'MODERATE',
    recommendation: econ.recommendation || 'RECOMMENDED'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY INFORMATION EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

export interface ExtractedSafetyInfo {
  ppeRequired: string[];
  warnings: string[];
  emergencyContact: string;
  phiWarning?: string;
  weatherRestrictions?: string;
  precautions: string[];
}

/**
 * Extract safety information
 */
export function extractSafetyInfo(decision: DecisionOutput): ExtractedSafetyInfo {
  const appDetails = decision.primary_decision?.application_details;
  const blockedActions = decision.blocked_actions || [];
  
  // Extract warnings from blocked actions
  const warnings = blockedActions.map(b => b.reason);
  
  // Get PPE requirements
  const ppeRequired = appDetails?.ppe_required || ['GLOVES', 'MASK'];
  
  // Get precautions
  const precautions = appDetails?.precautions || [];
  
  // Check for PHI warning
  let phiWarning: string | undefined;
  if (appDetails?.phi_days && appDetails.phi_days > 0) {
    phiWarning = `Wait ${appDetails.phi_days} days before harvest`;
  }
  
  // Weather restrictions
  let weatherRestrictions: string | undefined;
  if (decision.status === 'WEATHER_DELAYED') {
    weatherRestrictions = decision.primary_decision?.timing?.weather_requirements;
  }
  
  return {
    ppeRequired,
    warnings,
    emergencyContact: '1800-180-1551', // Kisan Call Center
    phiWarning,
    weatherRestrictions,
    precautions
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MIXING INSTRUCTIONS EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

export interface MixingInstructions {
  steps: string[];
  caution?: string;
  waterRequired: string;
}

/**
 * Extract mixing instructions from rules and product details
 */
export function extractMixingInstructions(
  rules: AppliedRule[] = [],
  product: ExtractedProductDetails | null
): MixingInstructions {
  const steps: string[] = [];
  
  // Standard mixing steps
  steps.push('Take clean water in spray tank');
  
  if (product) {
    steps.push(`Measure ${product.dosage} of ${product.name}`);
    steps.push('Add product to half-filled tank');
    steps.push('Mix well for 2-3 minutes');
    
    if (product.productType === 'BOTANICAL' || product.productType === 'BIOLOGICAL') {
      steps.push('Add sticker/spreader (50ml per 15L)');
    }
    
    steps.push('Fill remaining water');
    steps.push('Stir again before spraying');
  }
  
  // Extract any specific mixing instructions from rules
  rules.forEach(rule => {
    if (rule.rule_id && rule.rule_id.includes('MIX')) {
      // Could add rule-specific mixing notes
    }
  });
  
  return {
    steps,
    caution: 'Use mixture within 2 hours of preparation',
    waterRequired: product?.waterVolume || '200 liters/acre'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// APPLICATION STEPS EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

export interface ApplicationSteps {
  steps: string[];
  bestTime: string;
  coverage: string[];
  avoidTimes: string[];
}

/**
 * Extract application steps based on method
 */
export function extractApplicationSteps(
  primary: PrimaryDecision | undefined,
  product: ExtractedProductDetails | null
): ApplicationSteps {
  if (!primary || !product) {
    return {
      steps: ['Monitor the crop daily', 'Note any changes', 'Take photos if symptoms worsen'],
      bestTime: 'Morning (6-10 AM)',
      coverage: [],
      avoidTimes: []
    };
  }
  
  const method = product.method || 'FOLIAR_SPRAY';
  
  const methodSteps: Record<string, string[]> = {
    'FOLIAR_SPRAY': [
      'Fill spray tank with prepared solution',
      'Calibrate sprayer for uniform coverage',
      'Start from one end of field, move systematically',
      'Spray on both upper and lower leaf surfaces',
      'Ensure uniform coverage - avoid over-spraying',
      'Focus more on new growth and affected areas',
      'Do not spray when wind is strong (>15 km/h)'
    ],
    'SOIL_APPLICATION': [
      'Mark rows for even application',
      'Apply near the plant base (5-10 cm)',
      'Do not let product touch leaves',
      'Mix lightly with topsoil',
      'Irrigate immediately after application',
      'Avoid waterlogging'
    ],
    'SOIL_DRENCH': [
      'Prepare solution as per dosage',
      'Remove weeds around plant base',
      'Pour 200-500ml solution per plant',
      'Ensure solution reaches root zone',
      'Do not irrigate for 24 hours'
    ],
    'DRIP_IRRIGATION': [
      'Dissolve product in fertigation tank',
      'Check drip system for clogs',
      'Start irrigation for 10 minutes',
      'Introduce product through venturi',
      'Continue irrigation for 30-45 minutes',
      'Flush system with clean water'
    ]
  };
  
  return {
    steps: methodSteps[method] || methodSteps['FOLIAR_SPRAY'],
    bestTime: formatBestTime(product.timing),
    coverage: [
      'Cover all plant surfaces',
      'Focus on affected areas',
      'Do not over-wet'
    ],
    avoidTimes: [
      'Hot afternoon (11 AM - 4 PM)',
      'During rain',
      'Strong winds'
    ]
  };
}

function formatBestTime(timing: string): string {
  const timeMap: Record<string, string> = {
    'EARLY_MORNING': 'Early morning (6-9 AM)',
    'MORNING': 'Morning (6-10 AM)',
    'EVENING': 'Evening (4-6 PM)',
    'ANY': 'Any time (cool weather)'
  };
  return timeMap[timing] || 'Morning (6-10 AM)';
}

// ═══════════════════════════════════════════════════════════════════════════
// WEATHER CONSIDERATIONS EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract weather considerations
 */
export function extractWeatherConsiderations(decision: DecisionOutput): string | null {
  if (decision.status === 'WEATHER_DELAYED') {
    const timing = decision.primary_decision?.timing;
    if (timing?.weather_requirements) {
      return timing.weather_requirements;
    }
    return 'Wait for favorable weather conditions before application';
  }
  
  // Check for weather-related blocked actions
  const weatherBlocked = decision.blocked_actions?.find(
    b => b.blocked_by_rule?.includes('WEATHER')
  );
  
  if (weatherBlocked) {
    return weatherBlocked.reason;
  }
  
  // Check contingency for weather delays
  if (decision.contingency_planning?.if_weather_delays) {
    const weatherPlan = decision.contingency_planning.if_weather_delays;
    return `If weather delays: ${weatherPlan.alternative}`;
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP SCHEDULE EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

export interface ExtractedFollowUpSchedule {
  day3: string;
  day7: string;
  day14: string;
  alertConditions: string[];
  contactExpertIf: string[];
}

/**
 * Extract follow-up schedule
 */
export function extractFollowUpSchedule(decision: DecisionOutput): ExtractedFollowUpSchedule {
  const schedule = decision.follow_up_schedule || {};
  const outcomes = decision.primary_decision?.expected_outcomes;
  
  // Default schedule if not provided
  const day3 = schedule.day_3?.check || 
    'Check if pest/disease population is reducing';
  
  const day7 = schedule.day_7?.check || 
    'Assess overall treatment effectiveness';
  
  const day14 = schedule.day_14?.check ||
    'Final evaluation - take photos and compare with before';
  
  // Success indicators as alert conditions
  const alertConditions = outcomes?.success_indicators?.slice(0, 3) || [
    'Problem not reducing',
    'New symptoms appearing',
    'Crop damage increasing'
  ];
  
  // When to contact expert
  const contactExpertIf = [
    'Problem worsens after 7 days of treatment',
    'Multiple new symptoms appear',
    'More than 50% of crop affected',
    'Unsure about the problem'
  ];
  
  return {
    day3,
    day7,
    day14,
    alertConditions,
    contactExpertIf
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCIENTIFIC BASIS EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract scientific basis from rules applied
 */
export function extractScientificBasis(rules: AppliedRule[] = []): string {
  if (!rules || rules.length === 0) {
    return 'Based on ICAR recommendations';
  }
  
  // Get unique rule sources
  const sources: string[] = [];
  
  rules.forEach(rule => {
    if (rule.rule_file) {
      // Extract meaningful name from file path
      const fileName = rule.rule_file.split('/').pop()?.replace('.ts', '');
      if (fileName && !sources.includes(fileName)) {
        sources.push(fileName);
      }
    }
  });
  
  if (sources.length > 0) {
    return `Based on ${sources.slice(0, 2).join(', ')} guidelines`;
  }
  
  return 'Based on ICAR-IARI recommendations';
}

// ═══════════════════════════════════════════════════════════════════════════
// ALTERNATIVES EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

export interface ExtractedAlternative {
  action: string;
  reason: string;
  cost?: number;
}

/**
 * Extract alternative recommendations
 */
export function extractAlternatives(decision: DecisionOutput): ExtractedAlternative[] {
  const alternatives: ExtractedAlternative[] = [];
  
  // From secondary actions
  decision.secondary_actions?.forEach(action => {
    alternatives.push({
      action: action.action,
      reason: action.reason
    });
  });
  
  // From contingency planning
  if (decision.contingency_planning?.if_no_improvement) {
    alternatives.push({
      action: decision.contingency_planning.if_no_improvement.next_action,
      reason: 'If first treatment not effective'
    });
  }
  
  // From blocked actions alternatives
  decision.blocked_actions?.forEach(blocked => {
    blocked.alternatives?.forEach(alt => {
      alternatives.push({
        action: alt,
        reason: `Alternative to: ${blocked.action}`
      });
    });
  });
  
  return alternatives;
}

// ═══════════════════════════════════════════════════════════════════════════
// REPEAT APPLICATION EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

export interface RepeatApplicationInfo {
  needed: boolean;
  intervalDays: number;
  maxApplications: number;
  currentApplication: number;
}

/**
 * Extract repeat application information
 */
export function extractRepeatApplicationInfo(decision: DecisionOutput): RepeatApplicationInfo | null {
  const repeat = decision.primary_decision?.application_details?.repeat_application;
  
  if (!repeat || !repeat.needed) {
    return null;
  }
  
  return {
    needed: repeat.needed,
    intervalDays: repeat.interval_days || 7,
    maxApplications: repeat.max_applications_season || 3,
    currentApplication: repeat.current_application_number || 1
  };
}
