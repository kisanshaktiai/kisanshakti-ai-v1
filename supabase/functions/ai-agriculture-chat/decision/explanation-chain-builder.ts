/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPLANATION CHAIN BUILDER - RULE TRACEABILITY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Generates human-readable explanation chains for every decision.
 * This ensures EVERY recommendation can be traced back to specific rules.
 * 
 * CRITICAL PRINCIPLE: No advice without rule citation
 */

import type { AuthoritativeLandState } from './authoritative-state-loader.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ExplanationStep {
  step: number;
  rule_id: string;
  rule_name: string;
  category: 'OBSERVATION' | 'DIAGNOSIS' | 'PRESCRIPTION' | 'SAFETY' | 'CONFLICT_RESOLUTION';
  condition_matched: string;
  action_taken: string;
  why_mr: string;  // Marathi explanation
  why_hi: string;  // Hindi explanation
  why_en: string;  // English explanation
  confidence: number;
  data_used: string[];
}

export interface ExplanationChain {
  decision_id: string;
  total_steps: number;
  primary_rule: string;
  conflict_resolved: boolean;
  conflict_resolution_method?: 'priority' | 'consensus' | 'safety_override';
  steps: ExplanationStep[];
  
  // Summary for farmer
  summary_mr: string;
  summary_hi: string;
  summary_en: string;
  
  // Data sources cited
  data_sources_used: {
    source: string;
    field: string;
    value: string | number | null;
    age?: string;
  }[];
  
  // Rule IDs for audit
  all_rules_fired: string[];
  all_rules_blocked: string[];
  
  // Timestamps
  generated_at: string;
}

export interface RuleMatchInfo {
  rule_id: string;
  rule_name: string;
  category: string;
  priority: number;
  confidence: number;
  conditions_matched: string[];
  action_type: string;
  action_details?: Record<string, unknown>;
  blocked?: boolean;
  blocked_by?: string;
  blocked_reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BUILDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function buildExplanationChain(
  decisionId: string,
  matchedRules: RuleMatchInfo[],
  landState: AuthoritativeLandState | null,
  language: string = 'mr'
): ExplanationChain {
  console.log(`📝 [ExplanationChain] Building chain for decision: ${decisionId}`);
  console.log(`   Rules to process: ${matchedRules.length}`);
  
  const steps: ExplanationStep[] = [];
  const dataSourcesUsed: ExplanationChain['data_sources_used'] = [];
  const allRulesFired: string[] = [];
  const allRulesBlocked: string[] = [];
  
  let stepNumber = 0;
  let conflictResolved = false;
  let conflictMethod: 'priority' | 'consensus' | 'safety_override' | undefined;
  
  // Group rules by category for proper ordering
  const observationRules = matchedRules.filter(r => r.category === 'OBSERVATION' || r.category === 'observation');
  const diagnosisRules = matchedRules.filter(r => r.category === 'DIAGNOSIS' || r.category === 'diagnosis' || r.category === 'pest' || r.category === 'disease');
  const prescriptionRules = matchedRules.filter(r => r.category === 'PRESCRIPTION' || r.category === 'prescription' || r.category === 'treatment' || r.category === 'ipm_treatment');
  const safetyRules = matchedRules.filter(r => r.category === 'SAFETY' || r.category === 'safety');
  
  // Process in order: OBSERVATION → DIAGNOSIS → SAFETY → PRESCRIPTION
  
  // Step 1: Observations
  for (const rule of observationRules) {
    stepNumber++;
    const step = buildStep(stepNumber, rule, 'OBSERVATION', landState);
    steps.push(step);
    allRulesFired.push(rule.rule_id);
    
    // Track data used
    addDataSources(rule, landState, dataSourcesUsed);
  }
  
  // Step 2: Diagnosis
  for (const rule of diagnosisRules) {
    stepNumber++;
    const step = buildStep(stepNumber, rule, 'DIAGNOSIS', landState);
    steps.push(step);
    allRulesFired.push(rule.rule_id);
    
    addDataSources(rule, landState, dataSourcesUsed);
  }
  
  // Check for conflicts in diagnosis
  if (diagnosisRules.length > 1) {
    conflictResolved = true;
    // Sort by priority to determine resolution method
    const sortedDiagnosis = [...diagnosisRules].sort((a, b) => b.priority - a.priority);
    if (sortedDiagnosis[0].priority !== sortedDiagnosis[1].priority) {
      conflictMethod = 'priority';
    } else {
      conflictMethod = 'consensus';
    }
    
    stepNumber++;
    steps.push({
      step: stepNumber,
      rule_id: 'CONFLICT_RESOLVER',
      rule_name: 'Diagnosis Conflict Resolution',
      category: 'CONFLICT_RESOLUTION',
      condition_matched: `${diagnosisRules.length} competing diagnoses`,
      action_taken: `Selected ${sortedDiagnosis[0].rule_name} by ${conflictMethod}`,
      why_mr: `एकाधिक कारणे सापडली - प्राधान्यानुसार ${sortedDiagnosis[0].rule_name} निवडले`,
      why_hi: `एक से अधिक कारण मिले - प्राथमिकता के अनुसार ${sortedDiagnosis[0].rule_name} चुना`,
      why_en: `Multiple causes found - selected ${sortedDiagnosis[0].rule_name} by ${conflictMethod}`,
      confidence: 0.9,
      data_used: ['diagnosis_priorities']
    });
  }
  
  // Step 3: Safety checks
  for (const rule of safetyRules) {
    stepNumber++;
    const step = buildStep(stepNumber, rule, 'SAFETY', landState);
    steps.push(step);
    
    if (rule.blocked) {
      allRulesBlocked.push(rule.blocked_by || 'SAFETY_GATE');
      conflictResolved = true;
      conflictMethod = 'safety_override';
    } else {
      allRulesFired.push(rule.rule_id);
    }
    
    addDataSources(rule, landState, dataSourcesUsed);
  }
  
  // Step 4: Prescriptions
  for (const rule of prescriptionRules) {
    stepNumber++;
    const step = buildStep(stepNumber, rule, 'PRESCRIPTION', landState);
    steps.push(step);
    
    if (rule.blocked) {
      allRulesBlocked.push(rule.rule_id);
    } else {
      allRulesFired.push(rule.rule_id);
    }
    
    addDataSources(rule, landState, dataSourcesUsed);
  }
  
  // Generate summary
  const summary = generateSummary(steps, language, landState);
  
  const chain: ExplanationChain = {
    decision_id: decisionId,
    total_steps: steps.length,
    primary_rule: allRulesFired[0] || 'NONE',
    conflict_resolved: conflictResolved,
    conflict_resolution_method: conflictMethod,
    steps,
    summary_mr: summary.mr,
    summary_hi: summary.hi,
    summary_en: summary.en,
    data_sources_used: dataSourcesUsed,
    all_rules_fired: allRulesFired,
    all_rules_blocked: allRulesBlocked,
    generated_at: new Date().toISOString()
  };
  
  console.log(`✅ [ExplanationChain] Built ${steps.length} steps, ${allRulesFired.length} rules fired, ${allRulesBlocked.length} blocked`);
  
  return chain;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function buildStep(
  stepNumber: number,
  rule: RuleMatchInfo,
  category: ExplanationStep['category'],
  landState: AuthoritativeLandState | null
): ExplanationStep {
  // Generate human-readable explanations
  const whyTexts = generateWhyTexts(rule, landState);
  
  return {
    step: stepNumber,
    rule_id: rule.rule_id,
    rule_name: rule.rule_name || rule.rule_id,
    category,
    condition_matched: rule.conditions_matched?.join(', ') || 'conditions met',
    action_taken: rule.blocked 
      ? `BLOCKED by ${rule.blocked_by}: ${rule.blocked_reason}`
      : `${rule.action_type}: ${JSON.stringify(rule.action_details || {}).substring(0, 100)}`,
    why_mr: whyTexts.mr,
    why_hi: whyTexts.hi,
    why_en: whyTexts.en,
    confidence: rule.confidence || 0.7,
    data_used: extractDataUsed(rule, landState)
  };
}

function generateWhyTexts(
  rule: RuleMatchInfo,
  landState: AuthoritativeLandState | null
): { mr: string; hi: string; en: string } {
  const ruleName = rule.rule_name || rule.rule_id;
  const category = rule.category.toLowerCase();
  
  // Category-specific explanations
  if (category === 'diagnosis' || category === 'pest' || category === 'disease') {
    return {
      mr: `लक्षणांवरून '${ruleName}' हे कारण ओळखले (विश्वास: ${(rule.confidence * 100).toFixed(0)}%)`,
      hi: `लक्षणों से '${ruleName}' कारण पहचाना गया (विश्वास: ${(rule.confidence * 100).toFixed(0)}%)`,
      en: `Identified '${ruleName}' as cause from symptoms (confidence: ${(rule.confidence * 100).toFixed(0)}%)`
    };
  }
  
  if (category === 'prescription' || category === 'treatment' || category === 'ipm_treatment') {
    if (rule.blocked) {
      return {
        mr: `'${ruleName}' उपचार अवरोधित - ${rule.blocked_reason || 'सुरक्षा कारण'}`,
        hi: `'${ruleName}' उपचार रोका गया - ${rule.blocked_reason || 'सुरक्षा कारण'}`,
        en: `'${ruleName}' treatment blocked - ${rule.blocked_reason || 'safety reason'}`
      };
    }
    return {
      mr: `निदानावर आधारित '${ruleName}' उपचार शिफारस`,
      hi: `निदान के आधार पर '${ruleName}' उपचार सिफारिश`,
      en: `Recommended '${ruleName}' treatment based on diagnosis`
    };
  }
  
  if (category === 'safety') {
    return {
      mr: `सुरक्षा नियम '${ruleName}' लागू - ${rule.action_type}`,
      hi: `सुरक्षा नियम '${ruleName}' लागू - ${rule.action_type}`,
      en: `Safety rule '${ruleName}' applied - ${rule.action_type}`
    };
  }
  
  // Default
  return {
    mr: `नियम '${ruleName}' लागू झाला`,
    hi: `नियम '${ruleName}' लागू हुआ`,
    en: `Rule '${ruleName}' applied`
  };
}

function extractDataUsed(
  rule: RuleMatchInfo,
  landState: AuthoritativeLandState | null
): string[] {
  const dataUsed: string[] = [];
  
  // Extract from conditions
  if (rule.conditions_matched) {
    for (const condition of rule.conditions_matched) {
      if (condition.includes('ndvi')) dataUsed.push('ndvi_data');
      if (condition.includes('soil') || condition.includes('ph') || condition.includes('nitrogen')) dataUsed.push('soil_health');
      if (condition.includes('weather') || condition.includes('rain') || condition.includes('temperature')) dataUsed.push('weather_data');
      if (condition.includes('crop') || condition.includes('stage')) dataUsed.push('crop_schedule');
      if (condition.includes('symptom') || condition.includes('visual')) dataUsed.push('farmer_observation');
    }
  }
  
  return [...new Set(dataUsed)]; // Dedupe
}

function addDataSources(
  rule: RuleMatchInfo,
  landState: AuthoritativeLandState | null,
  dataSourcesUsed: ExplanationChain['data_sources_used']
): void {
  if (!landState) return;
  
  // Check what data this rule used and add to sources
  const conditions = rule.conditions_matched || [];
  
  for (const condition of conditions) {
    if (condition.includes('ndvi') && landState.ndvi.latest_value !== null) {
      const exists = dataSourcesUsed.find(d => d.source === 'ndvi' && d.field === 'latest_value');
      if (!exists) {
        dataSourcesUsed.push({
          source: 'ndvi',
          field: 'latest_value',
          value: landState.ndvi.latest_value,
          age: landState.ndvi.age_days !== null ? `${landState.ndvi.age_days} days` : undefined
        });
      }
    }
    
    if (condition.includes('crop') && landState.crop.current_crop) {
      const exists = dataSourcesUsed.find(d => d.source === 'crop_schedule' && d.field === 'current_crop');
      if (!exists) {
        dataSourcesUsed.push({
          source: 'crop_schedule',
          field: 'current_crop',
          value: landState.crop.current_crop
        });
      }
    }
    
    if (condition.includes('stage') && landState.crop.growth_stage) {
      const exists = dataSourcesUsed.find(d => d.source === 'crop_schedule' && d.field === 'growth_stage');
      if (!exists) {
        dataSourcesUsed.push({
          source: 'crop_schedule',
          field: 'growth_stage',
          value: landState.crop.growth_stage
        });
      }
    }
    
    if ((condition.includes('rain') || condition.includes('weather')) && landState.weather.rainfall_last_24h !== null) {
      const exists = dataSourcesUsed.find(d => d.source === 'weather' && d.field === 'rainfall_last_24h');
      if (!exists) {
        dataSourcesUsed.push({
          source: 'weather',
          field: 'rainfall_last_24h',
          value: `${landState.weather.rainfall_last_24h} mm`,
          age: landState.weather.data_age_hours !== null ? `${landState.weather.data_age_hours} hours` : undefined
        });
      }
    }
  }
}

function generateSummary(
  steps: ExplanationStep[],
  language: string,
  landState: AuthoritativeLandState | null
): { mr: string; hi: string; en: string } {
  const diagnosisSteps = steps.filter(s => s.category === 'DIAGNOSIS');
  const prescriptionSteps = steps.filter(s => s.category === 'PRESCRIPTION' && !s.action_taken.startsWith('BLOCKED'));
  const blockedSteps = steps.filter(s => s.action_taken.startsWith('BLOCKED'));
  
  const cropName = landState?.crop.current_crop || 'पीक';
  const stageName = landState?.crop.growth_stage || '';
  
  // Build summary
  let summaryMr = '';
  let summaryHi = '';
  let summaryEn = '';
  
  if (diagnosisSteps.length > 0) {
    const mainDiagnosis = diagnosisSteps[0].rule_name;
    summaryMr += `📋 निदान: ${mainDiagnosis}. `;
    summaryHi += `📋 निदान: ${mainDiagnosis}. `;
    summaryEn += `📋 Diagnosis: ${mainDiagnosis}. `;
  }
  
  if (prescriptionSteps.length > 0) {
    summaryMr += `💊 ${prescriptionSteps.length} उपचार शिफारसी. `;
    summaryHi += `💊 ${prescriptionSteps.length} उपचार सिफारिशें. `;
    summaryEn += `💊 ${prescriptionSteps.length} treatment recommendation(s). `;
  }
  
  if (blockedSteps.length > 0) {
    summaryMr += `⚠️ ${blockedSteps.length} उपचार सुरक्षेसाठी थांबवले.`;
    summaryHi += `⚠️ ${blockedSteps.length} उपचार सुरक्षा के लिए रोके गए.`;
    summaryEn += `⚠️ ${blockedSteps.length} treatment(s) blocked for safety.`;
  }
  
  return {
    mr: summaryMr || 'कोणतीही शिफारस नाही',
    hi: summaryHi || 'कोई सिफारिश नहीं',
    en: summaryEn || 'No recommendations'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT FOR FARMER DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

export function formatExplanationForFarmer(
  chain: ExplanationChain,
  language: string = 'mr'
): string {
  let output = '';
  
  // Summary first
  const summary = (chain as any)[`summary_${language}`] || chain.summary_en;
  output += summary + '\n\n';
  
  // Add "why" section for key steps
  const keySteps = chain.steps.filter(s => s.category === 'DIAGNOSIS' || s.category === 'PRESCRIPTION');
  
  if (keySteps.length > 0) {
    output += '🔍 Reasoning:\n';
    
    for (const step of keySteps.slice(0, 3)) {
      const why = (step as any)[`why_${language}`] || step.why_en;
      output += `• ${why}\n`;
    }
  }
  
  // Add data sources used
  if (chain.data_sources_used.length > 0) {
    output += '\n';
    output += '📊 Data used:\n';
    output += dataLabel + '\n';
    
    for (const source of chain.data_sources_used.slice(0, 4)) {
      output += `• ${source.source}: ${source.value}${source.age ? ` (${source.age})` : ''}\n`;
    }
  }
  
  return output.trim();
}
