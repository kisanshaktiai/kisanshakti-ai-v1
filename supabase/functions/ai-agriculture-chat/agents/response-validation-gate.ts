/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESPONSE VALIDATION GATE - Pre-Send Quality Checks
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PART 9 of KisanShakti comprehensive fix:
 * - Intent-response match validation
 * - Entity consistency checks
 * - Agronomic validity confirmation
 * - Language quality verification
 * - Safety checks
 * 
 * VERSION: 1.0.0
 */

import { validateAgronomicAccuracy } from './agronomic-validator.ts';
import { validateLanguageQuality, getSafeAskMoreInfoMessage } from './language-quality-validator.ts';
import type { EnhancedIntent, ResponseType } from './intent-router.ts';

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationGateResult {
  passed: boolean;
  checks: ValidationCheck[];
  overall_confidence: number;
  should_block: boolean;
  block_reason?: string;
  corrected_response?: string;
  log_summary: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  details: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// BANNED CHEMICALS (for safety check)
// ═══════════════════════════════════════════════════════════════════════════

const BANNED_CHEMICALS = [
  'monocrotophos', 'endosulfan', 'phorate', 'triazophos',
  'methomyl', 'methyl parathion', 'phosphamidon', 'dieldrin',
  'aldrin', 'chlordane', 'heptachlor', 'bhc', 'ddt', 'lindane'
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function validateResponseBeforeSend(
  response: string,
  context: {
    farmer_message: string;
    detected_intent: EnhancedIntent;
    response_type: ResponseType;
    language: string;
    land_context?: {
      current_crop?: string;
      growth_stage?: string;
    };
    recommendation?: {
      pest_code?: string;
      disease_code?: string;
      product_name?: string;
      application_method?: string;
    };
  }
): ValidationGateResult {
  const checks: ValidationCheck[] = [];
  let overallConfidence = 1.0;
  let shouldBlock = false;
  let blockReason: string | undefined;
  
  console.log(`\n🛡️ [ValidationGate] Running pre-send checks...`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 1: Intent-Response Match
  // ═══════════════════════════════════════════════════════════════════════════
  
  const intentResponseCheck = validateIntentResponseMatch(
    context.detected_intent,
    context.response_type,
    response
  );
  checks.push(intentResponseCheck);
  if (!intentResponseCheck.passed) {
    overallConfidence -= 0.2;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 2: Entity Consistency
  // ═══════════════════════════════════════════════════════════════════════════
  
  const entityCheck = validateEntityConsistency(
    response,
    context.farmer_message,
    context.land_context?.current_crop,
    context.recommendation?.pest_code
  );
  checks.push(entityCheck);
  if (!entityCheck.passed && entityCheck.severity === 'CRITICAL') {
    overallConfidence -= 0.3;
    shouldBlock = true;
    blockReason = entityCheck.details;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 3: Agronomic Validity (if treatment recommendation)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (context.recommendation && context.recommendation.pest_code) {
    const agronomicValidation = validateAgronomicAccuracy({
      pest_code: context.recommendation.pest_code,
      disease_code: context.recommendation.disease_code,
      product_name: context.recommendation.product_name,
      application_method: context.recommendation.application_method,
      crop_stage: context.land_context?.growth_stage
    });
    
    const agronomicCheck: ValidationCheck = {
      name: 'AGRONOMIC_VALIDITY',
      passed: agronomicValidation.is_valid,
      severity: agronomicValidation.errors.some(e => e.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH',
      details: agronomicValidation.errors.length > 0 
        ? agronomicValidation.errors.map(e => e.message_en).join('; ')
        : 'Agronomic recommendations are scientifically valid'
    };
    checks.push(agronomicCheck);
    
    if (!agronomicCheck.passed) {
      overallConfidence += agronomicValidation.confidence_adjustment;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 4: Language Quality
  // ═══════════════════════════════════════════════════════════════════════════
  
  const languageValidation = validateLanguageQuality(response, context.language);
  const languageCheck: ValidationCheck = {
    name: 'LANGUAGE_QUALITY',
    passed: languageValidation.is_valid,
    severity: languageValidation.should_regenerate ? 'HIGH' : 'MEDIUM',
    details: languageValidation.issues.length > 0
      ? languageValidation.issues.map(i => i.description).join('; ')
      : 'Language quality is acceptable'
  };
  checks.push(languageCheck);
  
  if (languageValidation.should_regenerate) {
    overallConfidence -= 0.2;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 5: Safety - No Banned Chemicals
  // ═══════════════════════════════════════════════════════════════════════════
  
  const safetyCheck = validateSafety(response);
  checks.push(safetyCheck);
  if (!safetyCheck.passed) {
    shouldBlock = true;
    blockReason = safetyCheck.details;
    overallConfidence = 0;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 6: Response Not Empty/Placeholder
  // ═══════════════════════════════════════════════════════════════════════════
  
  const contentCheck = validateResponseContent(response);
  checks.push(contentCheck);
  if (!contentCheck.passed) {
    overallConfidence -= 0.3;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DETERMINE FINAL RESULT
  // ═══════════════════════════════════════════════════════════════════════════
  
  const criticalFailures = checks.filter(c => !c.passed && c.severity === 'CRITICAL').length;
  const highFailures = checks.filter(c => !c.passed && c.severity === 'HIGH').length;
  
  const passed = criticalFailures === 0 && highFailures <= 1 && overallConfidence >= 0.5;
  
  const logSummary = [
    `Checks: ${checks.filter(c => c.passed).length}/${checks.length} passed`,
    `Confidence: ${(Math.max(0, overallConfidence) * 100).toFixed(0)}%`,
    criticalFailures > 0 ? `CRITICAL: ${criticalFailures}` : '',
    highFailures > 0 ? `HIGH: ${highFailures}` : ''
  ].filter(Boolean).join(' | ');
  
  console.log(`   ${passed ? '✅' : '❌'} ${logSummary}`);
  
  return {
    passed,
    checks,
    overall_confidence: Math.max(0, overallConfidence),
    should_block: shouldBlock,
    block_reason: blockReason,
    corrected_response: shouldBlock ? getSafeAskMoreInfoMessage(context.language) : undefined,
    log_summary: logSummary
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INDIVIDUAL CHECK FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function validateIntentResponseMatch(
  intent: EnhancedIntent,
  responseType: ResponseType,
  response: string
): ValidationCheck {
  // For information sharing/progress update, should NOT contain treatment recommendations
  if ((intent === 'INFORMATION_SHARING' || intent === 'PROGRESS_UPDATE') && 
      responseType === 'ACKNOWLEDGMENT_WITH_GUIDANCE') {
    
    // Check if response contains treatment keywords (it shouldn't)
    const hasTreatmentWords = /फवारणी|स्प्रे|औषध|pesticide|spray|treatment|किडीनाशक/i.test(response);
    
    if (hasTreatmentWords) {
      return {
        name: 'INTENT_RESPONSE_MATCH',
        passed: false,
        severity: 'HIGH',
        details: 'Response contains treatment recommendations for a status update message'
      };
    }
  }
  
  // For pest/disease problems, SHOULD contain treatment info
  if ((intent === 'PEST_PROBLEM' || intent === 'DISEASE_PROBLEM') &&
      responseType === 'RULE_ENGINE_REQUIRED') {
    
    const hasRecommendation = /शिफारस|सिफारिश|recommend|करा|करें|apply/i.test(response);
    
    if (!hasRecommendation) {
      return {
        name: 'INTENT_RESPONSE_MATCH',
        passed: false,
        severity: 'MEDIUM',
        details: 'Treatment query but response lacks specific recommendations'
      };
    }
  }
  
  return {
    name: 'INTENT_RESPONSE_MATCH',
    passed: true,
    severity: 'LOW',
    details: 'Intent and response type are aligned'
  };
}

function validateEntityConsistency(
  response: string,
  farmerMessage: string,
  landCrop?: string,
  pestCode?: string
): ValidationCheck {
  // Extract crop mentioned in response
  const cropPatterns = [
    /ऊस|sugarcane|ganna/i,
    /कापूस|cotton|kapas/i,
    /सोयाबीन|soybean|soya/i,
    /टोमॅटो|tomato/i,
    /कांदा|onion/i,
    /मिरची|chilli/i,
    /गहू|wheat/i,
    /भात|rice|paddy/i,
    /मका|maize|corn/i
  ];
  
  // If land crop is known, check if response mentions a DIFFERENT crop
  if (landCrop) {
    const normalizedLandCrop = landCrop.toLowerCase();
    let responseContainsDifferentCrop = false;
    
    for (const pattern of cropPatterns) {
      if (pattern.test(response)) {
        // Check if this pattern matches the land crop
        if (!pattern.test(normalizedLandCrop) && !pattern.test(landCrop)) {
          // Response mentions a crop that doesn't match land crop
          responseContainsDifferentCrop = true;
          break;
        }
      }
    }
    
    // This is only a problem if the response is giving crop-specific advice for wrong crop
    if (responseContainsDifferentCrop) {
      return {
        name: 'ENTITY_CONSISTENCY',
        passed: false,
        severity: 'CRITICAL',
        details: `Response mentions different crop than farmer's land (${landCrop})`
      };
    }
  }
  
  return {
    name: 'ENTITY_CONSISTENCY',
    passed: true,
    severity: 'LOW',
    details: 'Entity references are consistent'
  };
}

function validateSafety(response: string): ValidationCheck {
  const lowerResponse = response.toLowerCase();
  
  for (const banned of BANNED_CHEMICALS) {
    if (lowerResponse.includes(banned)) {
      return {
        name: 'SAFETY_CHECK',
        passed: false,
        severity: 'CRITICAL',
        details: `Banned chemical "${banned}" mentioned in response - BLOCKED`
      };
    }
  }
  
  // Check for safety gear mention when toxic products are recommended
  const toxicProducts = /chlorpyrifos|profenofos|aluminum phosphide|paraquat/i;
  const safetyMention = /mask|gloves|safety|सुरक्षा|दस्ताने|मास्क/i;
  
  if (toxicProducts.test(response) && !safetyMention.test(response)) {
    return {
      name: 'SAFETY_CHECK',
      passed: false,
      severity: 'HIGH',
      details: 'Toxic product recommended without safety equipment mention'
    };
  }
  
  return {
    name: 'SAFETY_CHECK',
    passed: true,
    severity: 'LOW',
    details: 'No safety violations detected'
  };
}

function validateResponseContent(response: string): ValidationCheck {
  // Check for placeholder patterns
  const placeholderPatterns = [
    /recommended treatment|as per label|none|n\/a/i,
    /\[.*\]/,  // Brackets indicating placeholders
    /TODO|FIXME|undefined|null/i
  ];
  
  for (const pattern of placeholderPatterns) {
    if (pattern.test(response) && response.length < 200) {
      return {
        name: 'CONTENT_QUALITY',
        passed: false,
        severity: 'HIGH',
        details: 'Response contains placeholder text instead of actual advice'
      };
    }
  }
  
  // Check minimum length
  if (response.trim().length < 50) {
    return {
      name: 'CONTENT_QUALITY',
      passed: false,
      severity: 'HIGH',
      details: 'Response is too short to be helpful'
    };
  }
  
  return {
    name: 'CONTENT_QUALITY',
    passed: true,
    severity: 'LOW',
    details: 'Response content is substantive'
  };
}

export default validateResponseBeforeSend;
