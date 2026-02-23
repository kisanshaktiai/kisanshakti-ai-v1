/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORLD-CLASS DELIVERY VALIDATOR
 * Ensures ALL Rule Engine Recommendations Reach Farmers
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Transform LLM from EDITOR to PRESENTER.
 * Validate that ALL recommendations from Rule Engine appear in final response.
 * 
 * PROBLEM SOLVED:
 * LLM was making EDITORIAL decisions - dropping chemical recommendations
 * to maintain "gentle, caring" tone. This causes ₹45,100/acre loss per farmer.
 * 
 * SOLUTION:
 * 1. Track all recommendations from Rule Engine
 * 2. Verify ALL appear in final response text
 * 3. Block delivery if critical recommendations missing
 * 4. Log violations for audit
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const DELIVERY_VALIDATOR_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface RecommendationItem {
  product_name: string;
  dosage?: string;
  ipm_level?: number;
  action_type?: string;
  priority?: string;
  is_chemical?: boolean;
  is_biological?: boolean;
  is_cultural?: boolean;
}

export interface DeliveryValidationResult {
  valid: boolean;
  all_delivered: boolean;
  chemical_delivered: boolean;
  biological_delivered: boolean;
  cultural_delivered: boolean;
  missing_products: string[];
  missing_critical: string[];
  violations: string[];
  delivery_score: number; // 0-100%
  can_send: boolean;
  fallback_required: boolean;
  audit_log: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SEVERITY-BASED PRESENTATION ORDER
// ═══════════════════════════════════════════════════════════════════════════

export const SEVERITY_BASED_ORDER: Record<string, string[]> = {
  'CRITICAL': ['CHEMICAL', 'BIOLOGICAL', 'CULTURAL'], // Most effective first
  'HIGH': ['CHEMICAL', 'BIOLOGICAL', 'CULTURAL'],
  'MEDIUM': ['BIOLOGICAL', 'CULTURAL', 'CHEMICAL'],
  'LOW': ['CULTURAL', 'BIOLOGICAL']
};

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT NAME ALIASES
// Same product may appear with different names
// ═══════════════════════════════════════════════════════════════════════════

const PRODUCT_ALIASES: Record<string, string[]> = {
  'chlorantraniliprole': ['coragen', 'क्लोरांट्रानिलिप्रोल', 'कोराजेन', 'rynaxypyr'],
  'fipronil': ['रीजेंट', 'regent', 'फिप्रोनिल'],
  'imidacloprid': ['confidor', 'कॉन्फिडोर', 'इमिडाक्लोप्रिड'],
  'thiamethoxam': ['actara', 'अक्टारा', 'थायोमेथोक्साम'],
  'cartap hydrochloride': ['padan', 'पदन', 'कार्टप'],
  'carbofuran': ['furadan', 'फुराडान', 'कार्बोफुरान'],
  'trichogramma': ['ट्रायकोग्रामा', 'trichogramma chilonis', 'अंडे परजीवी'],
  'cotesia': ['कोटेशिया', 'cotesia flavipes', 'लार्वा परजीवी'],
  'chrysoperla': ['क्रायसोपर्ला', 'green lacewing', 'हिरवी अळी'],
  'metarhizium': ['मेटारायझियम', 'green muscardine'],
  'beauveria': ['बीव्हेरिया', 'white muscardine'],
  'neem': ['निंब', 'नीम', 'azadirachtin', 'अॅझाडिरॅक्टिन']
};

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACT RECOMMENDATIONS FROM RULE ENGINE OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

export function extractRecommendations(decisionOutput: any): RecommendationItem[] {
  const recommendations: RecommendationItem[] = [];
  
  // Primary decision
  const primary = decisionOutput?.primary_decision;
  if (primary) {
    const appDetails = primary.application_details || {};
    const productName = appDetails.product_name || primary.product_name;
    const ipmLevel = primary.ipm_level || appDetails.ipm_level;
    
    if (productName) {
      recommendations.push({
        product_name: productName,
        dosage: appDetails.dosage || appDetails.concentration || appDetails.dosage_per_acre,
        ipm_level: typeof ipmLevel === 'string' ? parseInt(ipmLevel.replace(/\D/g, '')) : ipmLevel,
        action_type: primary.action_type,
        priority: primary.priority || 'HIGH',
        is_chemical: ipmLevel === 5 || ipmLevel === 'LEVEL_5' || appDetails.type === 'CHEMICAL',
        is_biological: ipmLevel === 4 || ipmLevel === 'LEVEL_4' || appDetails.type === 'BIOLOGICAL',
        is_cultural: ipmLevel <= 2 || appDetails.type === 'CULTURAL'
      });
    }
  }
  
  // Secondary actions
  const secondary = decisionOutput?.secondary_actions || decisionOutput?.secondary_recommendations || [];
  for (const action of secondary) {
    const productName = action.product_name || action.application_details?.product_name;
    const ipmLevel = action.ipm_level;
    
    if (productName) {
      recommendations.push({
        product_name: productName,
        dosage: action.dosage || action.application_details?.dosage,
        ipm_level: typeof ipmLevel === 'string' ? parseInt(ipmLevel.replace(/\D/g, '')) : ipmLevel,
        action_type: action.action_type || action.action,
        priority: action.priority || 'MEDIUM',
        is_chemical: ipmLevel === 5 || ipmLevel === 'LEVEL_5',
        is_biological: ipmLevel === 4 || ipmLevel === 'LEVEL_4',
        is_cultural: ipmLevel <= 2
      });
    }
  }
  
  // Actions returned array
  const actionsReturned = decisionOutput?.actions_returned || [];
  for (const action of actionsReturned) {
    const productName = action.product_name || action.application_details?.product_name;
    
    // Avoid duplicates
    if (productName && !recommendations.find(r => r.product_name?.toLowerCase() === productName?.toLowerCase())) {
      const ipmLevel = action.ipm_level;
      recommendations.push({
        product_name: productName,
        dosage: action.dosage || action.application_details?.dosage,
        ipm_level: typeof ipmLevel === 'string' ? parseInt(ipmLevel.replace(/\D/g, '')) : ipmLevel,
        action_type: action.action_type,
        priority: action.priority || 'MEDIUM',
        is_chemical: ipmLevel === 5 || ipmLevel === 'LEVEL_5',
        is_biological: ipmLevel === 4 || ipmLevel === 'LEVEL_4',
        is_cultural: ipmLevel <= 2
      });
    }
  }
  
  return recommendations;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK IF PRODUCT APPEARS IN RESPONSE TEXT
// ═══════════════════════════════════════════════════════════════════════════

function productAppearsInResponse(productName: string, responseText: string): boolean {
  const lowerResponse = responseText.toLowerCase();
  const lowerProduct = productName.toLowerCase();
  
  // Direct match
  if (lowerResponse.includes(lowerProduct)) {
    return true;
  }
  
  // Check aliases
  for (const [canonical, aliases] of Object.entries(PRODUCT_ALIASES)) {
    if (lowerProduct.includes(canonical) || canonical.includes(lowerProduct)) {
      for (const alias of aliases) {
        if (lowerResponse.includes(alias.toLowerCase())) {
          return true;
        }
      }
    }
    // Also check if product name is an alias
    for (const alias of aliases) {
      if (lowerProduct.includes(alias.toLowerCase()) || alias.toLowerCase().includes(lowerProduct)) {
        if (lowerResponse.includes(canonical) || aliases.some(a => lowerResponse.includes(a.toLowerCase()))) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function validateDelivery(
  decisionOutput: any,
  responseText: string,
  severity: string = 'MEDIUM'
): DeliveryValidationResult {
  const auditLog: string[] = [];
  const violations: string[] = [];
  const missingProducts: string[] = [];
  const missingCritical: string[] = [];
  
  auditLog.push(`[DeliveryValidator] Starting validation for severity: ${severity}`);
  
  // Extract all recommendations
  const recommendations = extractRecommendations(decisionOutput);
  auditLog.push(`[DeliveryValidator] Found ${recommendations.length} recommendations to validate`);
  
  if (recommendations.length === 0) {
    return {
      valid: true,
      all_delivered: true,
      chemical_delivered: true,
      biological_delivered: true,
      cultural_delivered: true,
      missing_products: [],
      missing_critical: [],
      violations: [],
      delivery_score: 100,
      can_send: true,
      fallback_required: false,
      audit_log: ['[DeliveryValidator] No recommendations to validate']
    };
  }
  
  // Track delivery by category
  let chemicalFound = false;
  let chemicalDelivered = false;
  let biologicalFound = false;
  let biologicalDelivered = false;
  let culturalFound = false;
  let culturalDelivered = false;
  let deliveredCount = 0;
  
  for (const rec of recommendations) {
    const productName = rec.product_name;
    const isDelivered = productAppearsInResponse(productName, responseText);
    
    auditLog.push(`[DeliveryValidator] ${productName}: ${isDelivered ? '✅ DELIVERED' : '❌ MISSING'}`);
    
    if (isDelivered) {
      deliveredCount++;
      if (rec.is_chemical) chemicalDelivered = true;
      if (rec.is_biological) biologicalDelivered = true;
      if (rec.is_cultural) culturalDelivered = true;
    } else {
      missingProducts.push(productName);
      
      // Critical if it's a chemical for HIGH/CRITICAL severity
      if (rec.is_chemical && (severity === 'HIGH' || severity === 'CRITICAL')) {
        missingCritical.push(productName);
        violations.push(`CRITICAL: Chemical ${productName} missing for ${severity} severity`);
      }
      
      // Critical if it's primary
      if (rec.priority === 'HIGH' || rec.priority === 'PRIMARY') {
        if (!missingCritical.includes(productName)) {
          missingCritical.push(productName);
        }
        violations.push(`PRIMARY recommendation ${productName} not delivered`);
      }
    }
    
    // Track what was recommended
    if (rec.is_chemical) chemicalFound = true;
    if (rec.is_biological) biologicalFound = true;
    if (rec.is_cultural) culturalFound = true;
  }
  
  // Calculate delivery score
  const deliveryScore = recommendations.length > 0 
    ? Math.round((deliveredCount / recommendations.length) * 100)
    : 100;
  
  // Determine if we can send
  const hasCriticalMissing = missingCritical.length > 0;
  const chemicalMissingForHighSeverity = chemicalFound && !chemicalDelivered && 
    (severity === 'HIGH' || severity === 'CRITICAL');
  
  const canSend = !hasCriticalMissing && !chemicalMissingForHighSeverity && deliveryScore >= 70;
  const fallbackRequired = !canSend && deliveryScore < 50;
  
  if (chemicalMissingForHighSeverity) {
    violations.push(`BLOCKING: Chemical treatment required for ${severity} severity but not in response`);
  }
  
  auditLog.push(`[DeliveryValidator] Score: ${deliveryScore}%, Can Send: ${canSend}`);
  
  return {
    valid: violations.length === 0,
    all_delivered: missingProducts.length === 0,
    chemical_delivered: !chemicalFound || chemicalDelivered,
    biological_delivered: !biologicalFound || biologicalDelivered,
    cultural_delivered: !culturalFound || culturalDelivered,
    missing_products: missingProducts,
    missing_critical: missingCritical,
    violations,
    delivery_score: deliveryScore,
    can_send: canSend,
    fallback_required: fallbackRequired,
    audit_log: auditLog
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE MUST-INCLUDE CONSTRAINT FOR LLM PROMPT
// ═══════════════════════════════════════════════════════════════════════════

export function generateMustIncludeConstraint(
  decisionOutput: any,
  severity: string,
  language: string
): string {
  const recommendations = extractRecommendations(decisionOutput);
  
  if (recommendations.length === 0) {
    return '';
  }
  
  const productList = recommendations.map(r => {
    let info = `- ${r.product_name}`;
    if (r.dosage) info += ` (${r.dosage})`;
    if (r.is_chemical) info += ' [CHEMICAL - MUST INCLUDE]';
    if (r.is_biological) info += ' [BIOLOGICAL]';
    return info;
  }).join('\n');
  
  const order = SEVERITY_BASED_ORDER[severity] || SEVERITY_BASED_ORDER['MEDIUM'];
  
  return `
═══════════════════════════════════════════════════════════════════════════
⚠️ MANDATORY DELIVERY CONSTRAINT - READ CAREFULLY
═══════════════════════════════════════════════════════════════════════════

YOU MUST INCLUDE ALL OF THESE PRODUCTS IN YOUR RESPONSE:

${productList}

PRESENTATION ORDER FOR ${severity} SEVERITY:
${order.map((t, i) => `${i + 1}. ${t} recommendations first`).join('\n')}

${severity === 'HIGH' || severity === 'CRITICAL' ? `
🚨 FOR ${severity} SEVERITY:
- Chemical treatment MUST be presented FIRST with efficacy percentage
- Do NOT soften, hide, or minimize chemical recommendations
- Farmer's crop is at HIGH RISK - they need the most effective treatment FIRST
` : ''}

FORBIDDEN:
❌ Do NOT drop any product from the list above
❌ Do NOT hide chemical recommendations for "gentle tone"
❌ Do NOT say "optional" for critical treatments
❌ Do NOT prioritize biological over chemical for HIGH/CRITICAL severity

VERIFICATION:
After generating, mentally check: Does my response contain EVERY product listed above?
If ANY product is missing, you are BLOCKING the farmer from getting complete advice.
═══════════════════════════════════════════════════════════════════════════`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export default {
  validateDelivery,
  extractRecommendations,
  generateMustIncludeConstraint,
  SEVERITY_BASED_ORDER,
  DELIVERY_VALIDATOR_VERSION
};
