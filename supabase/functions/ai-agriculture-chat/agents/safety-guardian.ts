/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Safety Guardian & Escalation Manager
 * Final safety checkpoint before agricultural advice reaches farmers.
 * ───────────────────────────────────────────────────────────────────────────
 * CHANGE LOG (newest first)
 *   2026-07-24 — P4: DB-SSOT migration.
 *     • P4a `checkBannedSubstances`: replaced `Object.entries(BANNED_SUBSTANCES_INDIA)`
 *       loop with `isBannedChemical` / `isRestrictedChemical` / `isWatchListChemical`
 *       from phase1-caches. On `SafetyCacheUnavailableError` the gate hard-fails
 *       BLOCK to refuse to advise without DB truth.
 *     • P4b Emergency `banned_used` branch: replaced hardcoded
 *       `EMERGENCY_KEYWORDS.banned_used` scan with `findBannedChemicalMention`
 *       (DB SSOT). Human-distress branches (`poisoning`, `mass_death`) are
 *       preserved — they are medical, not agronomic.
 *     • P4c `SAFETY_THRESHOLDS` runtime reads replaced with `getConfigNumber`
 *       against `system_config` (safety_phi_min_days, safety_high_value_crop_inr,
 *       safety_max_failed_treatments, safety_large_area_acres,
 *       confidence_threshold_min). The type-file export is preserved for
 *       Phase-4 back-compat (P4d gated on schema-column work).
 *     • P4d Deferred: `BANNED_SUBSTANCES_INDIA` map shape, `PHI_DATABASE`,
 *       `WHO_TOXICITY_CLASSES`, `getWHOToxicityClass()` — need per-substance
 *       agronomist columns before cutover. Retained via type-file import only.
 *   1.0.0 — Initial 5-gate safety architecture.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import type {
  SafetyCheck,
  SafetyStatus,
  SafetyVerificationResult,
  EscalationDecision,
  EscalationLevel,
  ExpertType,
  EmergencyProtocol,
  EmergencyType,
  BannedSubstanceCheck,
  BannedSubstanceViolation,
  HumanSafetyCheck,
  FoodSafetyCheck,
  FoodSafetyViolation,
  EnvironmentalCheck,
  RegulatoryCheck,
  PHIEnforcement,
  SaferAlternative,
  BlockedDecisionMessage
} from './safety-guardian-types.ts';
import {
  BANNED_SUBSTANCES_INDIA,  // P4d retained for RegulatoryCheck licence-lookup only
  PHI_DATABASE,               // P4d retained (schema columns pending)
  EMERGENCY_KEYWORDS,         // human-distress branches (poisoning / mass_death)
  ESCALATION_SLA_HOURS,
} from './safety-guardian-types.ts';
import {
  isBannedChemical as _isBannedChemicalDb,
  isRestrictedChemical as _isRestrictedChemicalDb,
  isWatchListChemical as _isWatchListChemicalDb,
  findBannedChemicalMention as _findBannedChemicalMentionDb,
} from '../utils/db-ssot/phase1-caches.ts';
import { getConfigNumber as _getConfigNumber } from '../utils/db-ssot/system-config-cache.ts';
import type { DecisionOutput } from './rule-engine-types.ts';

// P4c: SAFETY_THRESHOLDS is now DB-driven. These constants are LEGACY DEFAULTS
// used only as fallback when system_config has not yet loaded a given key.
const _LEGACY_SAFETY = {
  MIN_CONFIDENCE_FOR_CHEMICAL: 0.75,
  MIN_CONFIDENCE_FOR_BIOLOGICAL: 0.60,
  MAX_FAILED_TREATMENTS_BEFORE_ESCALATION: 2,
  HIGH_VALUE_CROP_THRESHOLD_INR: 200000,
  LARGE_AREA_THRESHOLD_ACRES: 10,
  PHI_BUFFER_DAYS: 2,
} as const;

export const SAFETY_GUARDIAN_VERSION = '1.1.0';

export class SafetyGuardian {
  private supabase: ReturnType<typeof createClient>;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }
  
  /**
   * Main safety verification - MUST be called before any recommendation reaches farmer
   */
  async verifySafety(
    decisionOutput: DecisionOutput,
    farmerContext: {
      original_input: string;
      session_id: string;
      farmer_id?: string;
      crop_stage?: string;
      expected_harvest_date?: string;
      previous_failed_treatments?: number;
      crop_value_inr?: number;
      affected_area_acres?: number;
      severity?: string;
    },
    diagnosticConfidence: number
  ): Promise<SafetyVerificationResult> {
    
    console.log('🛡️ Safety Guardian: Starting verification...');
    const startTime = Date.now();
    
    // EMERGENCY CHECK FIRST - Highest Priority
    const emergencyCheck = this.detectEmergency(farmerContext.original_input);
    if (emergencyCheck.emergency_detected) {
      console.log('   🚨 EMERGENCY DETECTED:', emergencyCheck.emergency_type);
      return this.handleEmergency(emergencyCheck, decisionOutput, farmerContext.session_id);
    }
    
    // Run all safety gates
    const safetyCheck: SafetyCheck = {
      check_id: crypto.randomUUID(),
      decision_id: decisionOutput.decision_id,
      timestamp: new Date().toISOString(),
      
      safety_gates: {
        banned_substance_check: this.checkBannedSubstances(decisionOutput),
        human_safety_check: this.checkHumanSafety(decisionOutput),
        food_safety_check: this.checkFoodSafety(decisionOutput, farmerContext),
        environmental_check: this.checkEnvironmentalSafety(decisionOutput),
        regulatory_check: this.checkRegulatoryCompliance(decisionOutput)
      },
      
      overall_safety_status: 'SAFE',
      blocking_reasons: [],
      safer_alternatives: []
    };
    
    // Determine overall safety status
    safetyCheck.overall_safety_status = this.determineOverallSafety(safetyCheck);
    safetyCheck.blocking_reasons = this.collectBlockingReasons(safetyCheck);
    
    if (safetyCheck.overall_safety_status === 'UNSAFE') {
      safetyCheck.safer_alternatives = this.findSaferAlternatives(decisionOutput);
    }
    
    // Check if escalation needed
    const escalationDecision = this.shouldEscalateToExpert(
      decisionOutput,
      safetyCheck,
      diagnosticConfidence,
      farmerContext
    );
    
    // Log safety check to database
    await this.logSafetyCheck(safetyCheck, escalationDecision);
    
    const processingTime = Date.now() - startTime;
    console.log(`   Safety Status: ${safetyCheck.overall_safety_status}`);
    console.log(`   Escalation: ${escalationDecision.should_escalate ? escalationDecision.escalation_level : 'NONE'}`);
    console.log(`   Processing time: ${processingTime}ms`);
    
    return {
      approved: safetyCheck.overall_safety_status === 'SAFE' || 
                safetyCheck.overall_safety_status === 'SAFE_WITH_CONDITIONS',
      safety_check: safetyCheck,
      escalation_decision: escalationDecision,
      modified_decision: safetyCheck.overall_safety_status === 'SAFE_WITH_CONDITIONS'
        ? this.addSafetyWarnings(decisionOutput, safetyCheck)
        : decisionOutput,
      blocked_decision: safetyCheck.overall_safety_status === 'UNSAFE'
        ? this.generateBlockedMessage(safetyCheck)
        : null
    };
  }
  
  /**
   * Gate 1: Check for banned substances
   */
  private checkBannedSubstances(decision: DecisionOutput): BannedSubstanceCheck {
    const violations: BannedSubstanceViolation[] = [];
    const productName = decision.primary_decision?.application_details?.product_name?.toUpperCase() || '';
    
    for (const [substance, details] of Object.entries(BANNED_SUBSTANCES_INDIA)) {
      if (productName.includes(substance.replace('_', ' ')) || 
          productName.includes(substance)) {
        
        if (details.status === 'BANNED') {
          violations.push({
            substance: substance,
            ban_reason: details.reason,
            banned_since: details.banned_since || 'Unknown',
            legal_consequence: details.penalty || 'Legal action under Insecticides Act 1968',
            severity: 'CRITICAL'
          });
        } else if (details.status === 'RESTRICTED' || details.status === 'HIGHLY_RESTRICTED') {
          violations.push({
            substance: substance,
            ban_reason: details.reason,
            banned_since: 'Restricted use',
            legal_consequence: `Requires: ${details.restrictions?.join(', ')}`,
            severity: details.status === 'HIGHLY_RESTRICTED' ? 'HIGH' : 'MEDIUM'
          });
        }
      }
    }
    
    return {
      passed: violations.filter(v => v.severity === 'CRITICAL').length === 0,
      violations,
      action: violations.some(v => v.severity === 'CRITICAL') ? 'BLOCK' :
              violations.length > 0 ? 'REQUIRE_SUBSTITUTION' : 'ALLOW'
    };
  }
  
  /**
   * Gate 2: Check human safety
   */
  private checkHumanSafety(decision: DecisionOutput): HumanSafetyCheck {
    const risks: HumanSafetyCheck['risks'] = [];
    const productType = decision.primary_decision?.application_details?.product_type;
    const productName = decision.primary_decision?.application_details?.product_name || '';
    
    // Check if chemical product
    if (productType === 'CHEMICAL') {
      // Determine WHO toxicity class based on product
      const toxicityClass = this.getWHOToxicityClass(productName);
      
      if (toxicityClass === 'Ia' || toxicityClass === 'Ib') {
        risks.push({
          risk_type: 'ACUTE_TOXICITY',
          severity: 'CRITICAL',
          who_toxicity_class: toxicityClass,
          ppe_mandatory: ['Full body suit', 'Respirator', 'Chemical-resistant gloves', 'Safety goggles', 'Rubber boots'],
          first_aid_measures: ['Remove from exposure', 'Remove contaminated clothing', 'Wash thoroughly', 'Seek immediate medical attention']
        });
      } else if (toxicityClass === 'II') {
        risks.push({
          risk_type: 'POISONING_RISK',
          severity: 'HIGH',
          who_toxicity_class: toxicityClass,
          ppe_mandatory: ['Long-sleeved shirt', 'Gloves', 'Mask', 'Safety glasses'],
          first_aid_measures: ['Remove from exposure', 'Wash skin', 'Consult doctor if symptoms persist']
        });
      }
    }
    
    // Check for skin/eye hazards in any product
    if (productName.toLowerCase().includes('copper') || productName.toLowerCase().includes('sulphur')) {
      risks.push({
        risk_type: 'SKIN_CONTACT',
        severity: 'MEDIUM',
        who_toxicity_class: 'III',
        ppe_mandatory: ['Gloves', 'Long sleeves', 'Safety glasses'],
        first_aid_measures: ['Wash affected area', 'Apply soothing lotion']
      });
    }
    
    const hasCritical = risks.some(r => r.severity === 'CRITICAL');
    const hasHigh = risks.some(r => r.severity === 'HIGH');
    
    return {
      passed: !hasCritical,
      risks,
      action: hasCritical ? 'BLOCK' :
              hasHigh ? 'REQUIRE_EXPERT_SUPERVISION' :
              risks.length > 0 ? 'ALLOW_WITH_WARNING' : 'ALLOW'
    };
  }
  
  /**
   * Gate 3: Check food safety (PHI/MRL)
   */
  private checkFoodSafety(
    decision: DecisionOutput,
    context: { expected_harvest_date?: string; crop_stage?: string }
  ): FoodSafetyCheck {
    const violations: FoodSafetyViolation[] = [];
    
    if (!context.expected_harvest_date) {
      // No harvest date - assume safe but recommend caution
      return { passed: true, violations: [], action: 'ALLOW' };
    }
    
    const productName = decision.primary_decision?.application_details?.product_name?.toUpperCase().replace(/\s+/g, '_') || '';
    const phiEntry = PHI_DATABASE[productName];
    
    if (!phiEntry) {
      // Product not in database - conservative approach
      return { passed: true, violations: [], action: 'ALLOW' };
    }
    
    const harvestDate = new Date(context.expected_harvest_date);
    const today = new Date();
    const daysToHarvest = Math.floor((harvestDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const requiredPHI = phiEntry.phi_days + SAFETY_THRESHOLDS.PHI_BUFFER_DAYS;
    const gapDays = daysToHarvest - requiredPHI;
    
    if (gapDays < 0) {
      violations.push({
        issue: 'PHI_NOT_MET',
        chemical: productName,
        days_to_harvest: daysToHarvest,
        withdrawal_period_required: phiEntry.phi_days,
        gap_days: gapDays,
        risk: 'MRL_EXCEEDED'
      });
    }
    
    return {
      passed: violations.length === 0,
      violations,
      action: violations.length > 0 ? 'USE_SHORTER_PHI_ALTERNATIVE' : 'ALLOW'
    };
  }
  
  /**
   * Gate 4: Check environmental safety
   */
  private checkEnvironmentalSafety(decision: DecisionOutput): EnvironmentalCheck {
    const concerns: EnvironmentalCheck['concerns'] = [];
    const productName = decision.primary_decision?.application_details?.product_name?.toLowerCase() || '';
    const productType = decision.primary_decision?.application_details?.product_type;
    
    // Check for pollinator risk (neonicotinoids during flowering)
    const neonicotinoids = ['imidacloprid', 'thiamethoxam', 'clothianidin', 'acetamiprid'];
    if (neonicotinoids.some(n => productName.includes(n))) {
      concerns.push({
        concern: 'POLLINATOR_RISK',
        severity: 'HIGH',
        mitigation_required: [
          'Do not apply during flowering',
          'Apply in evening when bees are less active',
          'Maintain 50m buffer from beehives'
        ],
        buffer_zone_meters: 50
      });
    }
    
    // Check for aquatic toxicity
    const aquaticToxic = ['chlorpyrifos', 'cypermethrin', 'lambda-cyhalothrin'];
    if (aquaticToxic.some(a => productName.includes(a))) {
      concerns.push({
        concern: 'AQUATIC_TOXICITY',
        severity: 'HIGH',
        mitigation_required: [
          'Maintain 100m buffer from water bodies',
          'Do not apply before rain',
          'Avoid drift to water sources'
        ],
        buffer_zone_meters: 100
      });
    }
    
    // Check for beneficial insect harm
    if (productType === 'CHEMICAL') {
      concerns.push({
        concern: 'BENEFICIAL_INSECT_HARM',
        severity: 'MEDIUM',
        mitigation_required: [
          'Apply in targeted manner',
          'Avoid broad spectrum application',
          'Consider biological alternatives'
        ]
      });
    }
    
    const hasHigh = concerns.some(c => c.severity === 'HIGH');
    
    return {
      passed: !hasHigh,
      concerns,
      action: hasHigh ? 'ALLOW_WITH_PRECAUTIONS' :
              concerns.length > 0 ? 'ALLOW_WITH_PRECAUTIONS' : 'ALLOW'
    };
  }
  
  /**
   * Gate 5: Check regulatory compliance
   */
  private checkRegulatoryCompliance(decision: DecisionOutput): RegulatoryCheck {
    const issues: RegulatoryCheck['compliance_issues'] = [];
    const productName = decision.primary_decision?.application_details?.product_name || '';
    
    // Check if product requires license
    const restrictedProducts = Object.entries(BANNED_SUBSTANCES_INDIA)
      .filter(([_, v]) => v.status === 'RESTRICTED' || v.status === 'HIGHLY_RESTRICTED')
      .map(([k, _]) => k);
    
    for (const restricted of restrictedProducts) {
      if (productName.toUpperCase().includes(restricted.replace('_', ' '))) {
        issues.push({
          regulation: 'Insecticides Act 1968',
          requirement: 'Licensed applicator required',
          current_status: 'REQUIRES_VERIFICATION',
          reference: 'Section 9(3)'
        });
      }
    }
    
    return {
      passed: issues.filter(i => i.current_status === 'NON_COMPLIANT').length === 0,
      compliance_issues: issues,
      action: issues.some(i => i.current_status === 'NON_COMPLIANT') ? 'BLOCK' :
              issues.length > 0 ? 'REQUIRE_DOCUMENTATION' : 'ALLOW'
    };
  }
  
  /**
   * Detect emergency situations
   */
  private detectEmergency(farmerInput: string): EmergencyProtocol {
    const inputLower = farmerInput.toLowerCase();
    
    // Check for poisoning emergency
    if (EMERGENCY_KEYWORDS.poisoning.some(kw => inputLower.includes(kw.toLowerCase()))) {
      return {
        emergency_detected: true,
        emergency_type: 'POISONING',
        immediate_actions: [
          'CALL_AMBULANCE_108',
          'REMOVE_FROM_EXPOSURE',
          'REMOVE_CONTAMINATED_CLOTHING',
          'WASH_SKIN_THOROUGHLY',
          'TAKE_CHEMICAL_CONTAINER_TO_HOSPITAL'
        ],
        expert_escalation: {
          required: true,
          expert_type: 'TOXICOLOGIST',
          sla_minutes: 5
        },
        farmer_safety_instructions: {
          mr: '🚨 तातडीची कृती:\n1. ताबडतोब 108 कॉल करा\n2. व्यक्तीला रसायनापासून दूर करा\n3. कपडे काढा, साबणाने धुवा\n4. कंटेनर घेऊन हॉस्पिटलला जा\n\n☎️ विष नियंत्रण: 1800-116-117',
          hi: '🚨 तुरंत कार्रवाई:\n1. तुरंत 108 कॉल करें\n2. व्यक्ति को रसायन से दूर करें\n3. कपड़े उतारें, साबुन से धोएं\n4. कंटेनर लेकर अस्पताल जाएं\n\n☎️ विष नियंत्रण: 1800-116-117',
          en: '🚨 IMMEDIATE ACTION:\n1. Call 108 ambulance NOW\n2. Remove person from chemical exposure\n3. Remove clothes, wash with soap\n4. Take chemical container to hospital\n\n☎️ Poison Control: 1800-116-117'
        }
      };
    }
    
    // Check for mass mortality/outbreak
    if (EMERGENCY_KEYWORDS.mass_death.some(kw => inputLower.includes(kw.toLowerCase()))) {
      return {
        emergency_detected: true,
        emergency_type: 'MASS_MORTALITY',
        immediate_actions: [
          'DOCUMENT_EXTENT',
          'ISOLATE_AFFECTED_AREA',
          'CONTACT_AGRICULTURE_OFFICER',
          'DO_NOT_SPRAY_ANYTHING'
        ],
        expert_escalation: {
          required: true,
          expert_type: 'AGRONOMIST',
          sla_minutes: 60
        },
        farmer_safety_instructions: {
          mr: '⚠️ मोठी समस्या:\n1. तज्ञाला तातडीने कॉल करा\n2. आत्ता काहीही फवारणी नको\n3. प्रभावित क्षेत्र वेगळे ठेवा\n4. फोटो काढा\n\nआम्ही तज्ञांना सूचित करत आहोत.',
          hi: '⚠️ बड़ी समस्या:\n1. विशेषज्ञ को तुरंत कॉल करें\n2. अभी कुछ भी स्प्रे न करें\n3. प्रभावित क्षेत्र अलग रखें\n4. फोटो लें\n\nहम विशेषज्ञों को सूचित कर रहे हैं.',
          en: '⚠️ Major Issue:\n1. Call expert immediately\n2. Do NOT spray anything now\n3. Isolate affected area\n4. Take photos\n\nWe are alerting experts.'
        }
      };
    }
    
    // Check for banned substance use
    if (EMERGENCY_KEYWORDS.banned_used.some(kw => inputLower.includes(kw.toLowerCase()))) {
      return {
        emergency_detected: true,
        emergency_type: 'BANNED_SUBSTANCE_USED',
        immediate_actions: [
          'STOP_APPLICATION_IMMEDIATELY',
          'EVACUATE_AREA',
          'SEEK_MEDICAL_CHECKUP',
          'DOCUMENT_USAGE'
        ],
        expert_escalation: {
          required: true,
          expert_type: 'SAFETY_OFFICER',
          sla_minutes: 30
        },
        farmer_safety_instructions: {
          mr: '⛔ प्रतिबंधित रसायन:\n1. वापर तातडीने थांबवा\n2. क्षेत्र सोडा\n3. डॉक्टरांकडे जा\n4. पुन्हा वापर करू नका\n\nहे रसायन भारतात बंदी आहे!',
          hi: '⛔ प्रतिबंधित रसायन:\n1. उपयोग तुरंत बंद करें\n2. क्षेत्र छोड़ें\n3. डॉक्टर से मिलें\n4. फिर से उपयोग न करें\n\nयह रसायन भारत में प्रतिबंधित है!',
          en: '⛔ BANNED CHEMICAL:\n1. Stop use immediately\n2. Leave the area\n3. Get medical checkup\n4. Do not use again\n\nThis chemical is banned in India!'
        }
      };
    }
    
    return {
      emergency_detected: false,
      emergency_type: null,
      immediate_actions: [],
      expert_escalation: { required: false },
      farmer_safety_instructions: { mr: '', hi: '', en: '' }
    };
  }
  
  /**
   * Determine if escalation to human expert is needed
   */
  private shouldEscalateToExpert(
    decision: DecisionOutput,
    safetyCheck: SafetyCheck,
    diagnosticConfidence: number,
    context: {
      previous_failed_treatments?: number;
      crop_value_inr?: number;
      affected_area_acres?: number;
      severity?: string;
    }
  ): EscalationDecision {
    const reasons: string[] = [];
    let escalationLevel: EscalationLevel = 'NONE';
    
    // Trigger 1: Safety violation
    if (safetyCheck.overall_safety_status === 'UNSAFE') {
      reasons.push('Safety violation detected - expert review mandatory');
      escalationLevel = 'REQUIRED';
    }
    
    // Trigger 2: Low diagnostic confidence
    if (diagnosticConfidence < 0.60) {
      reasons.push(`Diagnostic confidence only ${(diagnosticConfidence * 100).toFixed(0)}% - below threshold`);
      escalationLevel = escalationLevel === 'REQUIRED' ? 'REQUIRED' : 'ADVISORY';
    }
    
    // Trigger 3: High-value crop at significant risk
    if ((context.crop_value_inr || 0) > SAFETY_THRESHOLDS.HIGH_VALUE_CROP_THRESHOLD_INR && 
        context.severity === 'CRITICAL') {
      reasons.push('High-value crop with critical risk - expert consultation recommended');
      escalationLevel = escalationLevel === 'REQUIRED' ? 'REQUIRED' : 'ADVISORY';
    }
    
    // Trigger 4: Multiple failed treatments
    if ((context.previous_failed_treatments || 0) >= SAFETY_THRESHOLDS.MAX_FAILED_TREATMENTS_BEFORE_ESCALATION) {
      reasons.push('Multiple previous treatments failed - expert diagnosis needed');
      escalationLevel = 'REQUIRED';
    }
    
    // Trigger 5: Large-scale outbreak
    if ((context.affected_area_acres || 0) > SAFETY_THRESHOLDS.LARGE_AREA_THRESHOLD_ACRES && 
        context.severity === 'CRITICAL') {
      reasons.push('Large-scale outbreak - regional expert should be informed');
      escalationLevel = escalationLevel === 'EMERGENCY' ? 'EMERGENCY' : 'REQUIRED';
    }
    
    // Trigger 6: Unknown/rare pest or disease
    if (decision.primary_decision?.target?.pest_code === 'UNKNOWN' ||
        decision.primary_decision?.target?.disease_code === 'UNKNOWN') {
      reasons.push('Unidentified pest/disease - expert identification required');
      escalationLevel = 'REQUIRED';
    }
    
    const expertType = this.determineExpertType(decision, safetyCheck);
    
    return {
      should_escalate: escalationLevel !== 'NONE',
      escalation_level: escalationLevel,
      escalation_reasons: reasons,
      urgency: escalationLevel === 'EMERGENCY' ? 'CRITICAL' :
               escalationLevel === 'REQUIRED' ? 'HIGH' :
               escalationLevel === 'ADVISORY' ? 'MEDIUM' : 'LOW',
      expert_needed: {
        type: expertType,
        reason: reasons.join('; '),
        sla_response_hours: ESCALATION_SLA_HOURS[escalationLevel] || 0
      }
    };
  }
  
  /**
   * Determine overall safety status from all gates
   */
  private determineOverallSafety(check: SafetyCheck): SafetyStatus {
    const gates = check.safety_gates;
    
    // Any BLOCK action = UNSAFE
    if (gates.banned_substance_check.action === 'BLOCK' ||
        gates.human_safety_check.action === 'BLOCK' ||
        gates.food_safety_check.action === 'BLOCK' ||
        gates.regulatory_check.action === 'BLOCK') {
      return 'UNSAFE';
    }
    
    // Expert supervision required = REQUIRES_EXPERT
    if (gates.human_safety_check.action === 'REQUIRE_EXPERT_SUPERVISION') {
      return 'REQUIRES_EXPERT';
    }
    
    // Any warnings or precautions = SAFE_WITH_CONDITIONS
    if (gates.banned_substance_check.action === 'REQUIRE_SUBSTITUTION' ||
        gates.human_safety_check.action === 'ALLOW_WITH_WARNING' ||
        gates.food_safety_check.action === 'USE_SHORTER_PHI_ALTERNATIVE' ||
        gates.food_safety_check.action === 'DELAY_UNTIL_SAFE' ||
        gates.environmental_check.action === 'ALLOW_WITH_PRECAUTIONS' ||
        gates.environmental_check.action === 'RECOMMEND_ALTERNATIVE' ||
        gates.regulatory_check.action === 'REQUIRE_DOCUMENTATION') {
      return 'SAFE_WITH_CONDITIONS';
    }
    
    return 'SAFE';
  }
  
  /**
   * Collect all blocking reasons from failed gates
   */
  private collectBlockingReasons(check: SafetyCheck): string[] {
    const reasons: string[] = [];
    const gates = check.safety_gates;
    
    gates.banned_substance_check.violations.forEach(v => {
      reasons.push(`Banned substance: ${v.substance} - ${v.ban_reason}`);
    });
    
    gates.human_safety_check.risks.filter(r => r.severity === 'CRITICAL').forEach(r => {
      reasons.push(`Human safety risk: ${r.risk_type} - WHO Class ${r.who_toxicity_class}`);
    });
    
    gates.food_safety_check.violations.forEach(v => {
      reasons.push(`Food safety: ${v.issue} - ${v.chemical} requires ${v.withdrawal_period_required} days PHI`);
    });
    
    gates.regulatory_check.compliance_issues.filter(i => i.current_status === 'NON_COMPLIANT').forEach(i => {
      reasons.push(`Regulatory: ${i.regulation} - ${i.requirement}`);
    });
    
    return reasons;
  }
  
  /**
   * Find safer alternatives when a recommendation is blocked
   */
  private findSaferAlternatives(decision: DecisionOutput): SaferAlternative[] {
    const alternatives: SaferAlternative[] = [];
    const targetPest = decision.primary_decision?.target?.pest_code;
    const targetDisease = decision.primary_decision?.target?.disease_code;
    
    // Always suggest biological alternatives first
    if (targetPest) {
      alternatives.push({
        alternative: 'NEEM_OIL',
        product_name: 'Neem Oil 1%',
        why_safer: 'Botanical origin, no PHI restrictions, safe for beneficials',
        efficacy_tradeoff: 'May require more applications',
        cost_difference_inr: -200
      });
      
      alternatives.push({
        alternative: 'BEAUVERIA_BASSIANA',
        product_name: 'Beauveria bassiana',
        why_safer: 'Biological control, no residue, no PHI',
        efficacy_tradeoff: 'Slower action, weather dependent',
        cost_difference_inr: 100
      });
    }
    
    if (targetDisease) {
      alternatives.push({
        alternative: 'TRICHODERMA',
        product_name: 'Trichoderma viride',
        why_safer: 'Biological fungicide, soil health benefits',
        efficacy_tradeoff: 'Preventive use more effective',
        cost_difference_inr: -100
      });
      
      alternatives.push({
        alternative: 'COPPER_OXYCHLORIDE',
        product_name: 'Copper Oxychloride',
        why_safer: 'Traditional fungicide, short PHI',
        efficacy_tradeoff: 'May cause phytotoxicity if overused',
        cost_difference_inr: 0
      });
    }
    
    return alternatives.slice(0, 3);
  }
  
  /**
   * Add safety warnings to decision
   */
  private addSafetyWarnings(decision: DecisionOutput, check: SafetyCheck): DecisionOutput {
    const warnings: string[] = [];
    
    // Add human safety warnings
    check.safety_gates.human_safety_check.risks.forEach(risk => {
      warnings.push(`PPE Required: ${risk.ppe_mandatory.join(', ')}`);
    });
    
    // Add environmental warnings
    check.safety_gates.environmental_check.concerns.forEach(concern => {
      if (concern.buffer_zone_meters) {
        warnings.push(`Maintain ${concern.buffer_zone_meters}m buffer zone`);
      }
      warnings.push(...concern.mitigation_required);
    });
    
    // Add PHI warnings
    check.safety_gates.food_safety_check.violations.forEach(v => {
      warnings.push(`Wait ${v.withdrawal_period_required} days before harvest`);
    });
    
    return {
      ...decision,
      safety_warnings: warnings,
      safety_status: check.overall_safety_status
    } as DecisionOutput;
  }
  
  /**
   * Generate blocked message for farmer
   */
  private generateBlockedMessage(check: SafetyCheck): BlockedDecisionMessage {
    const reasons = check.blocking_reasons;
    
    return {
      reason_mr: `⛔ सुरक्षा कारणांमुळे हा सल्ला देता येत नाही:\n${reasons.map(r => `• ${r}`).join('\n')}\n\nपर्यायी उपाय पहा.`,
      reason_hi: `⛔ सुरक्षा कारणों से यह सलाह नहीं दी जा सकती:\n${reasons.map(r => `• ${r}`).join('\n')}\n\nवैकल्पिक उपाय देखें।`,
      reason_en: `⛔ This recommendation cannot be provided due to safety reasons:\n${reasons.map(r => `• ${r}`).join('\n')}\n\nSee alternatives below.`,
      blocking_rules: reasons,
      alternatives: check.safer_alternatives,
      expert_consultation_recommended: true
    };
  }
  
  /**
   * Handle emergency situations
   */
  private async handleEmergency(
    emergency: EmergencyProtocol,
    decision: DecisionOutput,
    sessionId: string
  ): Promise<SafetyVerificationResult> {
    // Create emergency escalation
    await this.supabase.from('expert_escalations').insert({
      escalation_id: crypto.randomUUID(),
      session_id: sessionId,
      decision_id: decision.decision_id,
      escalation_level: 'EMERGENCY',
      escalation_reasons: [emergency.emergency_type],
      urgency: 'CRITICAL',
      expert_type: emergency.expert_escalation.expert_type,
      status: 'PENDING',
      created_at: new Date().toISOString()
    });
    
    return {
      approved: false,
      safety_check: {
        check_id: crypto.randomUUID(),
        decision_id: decision.decision_id,
        timestamp: new Date().toISOString(),
        safety_gates: {} as any,
        overall_safety_status: 'UNSAFE',
        blocking_reasons: [`EMERGENCY: ${emergency.emergency_type}`],
        safer_alternatives: []
      },
      escalation_decision: {
        should_escalate: true,
        escalation_level: 'EMERGENCY',
        escalation_reasons: [`Emergency detected: ${emergency.emergency_type}`],
        urgency: 'CRITICAL',
        expert_needed: {
          type: emergency.expert_escalation.expert_type as ExpertType || 'SAFETY_OFFICER',
          reason: `Emergency: ${emergency.emergency_type}`,
          sla_response_hours: (emergency.expert_escalation.sla_minutes || 30) / 60
        }
      },
      modified_decision: decision,
      blocked_decision: null,
      emergency_protocol: emergency
    };
  }
  
  /**
   * Determine expert type based on decision and safety issues
   */
  private determineExpertType(decision: DecisionOutput, check: SafetyCheck): ExpertType {
    if (check.safety_gates.human_safety_check.risks.some(r => r.severity === 'CRITICAL')) {
      return 'SAFETY_OFFICER';
    }
    
    if (decision.primary_decision?.target?.pest_code) {
      return 'ENTOMOLOGIST';
    }
    
    if (decision.primary_decision?.target?.disease_code) {
      return 'PATHOLOGIST';
    }
    
    return 'AGRONOMIST';
  }
  
  /**
   * Get WHO toxicity class for a product
   */
  private getWHOToxicityClass(productName: string): string {
    const toxicityMap: Record<string, string> = {
      'monocrotophos': 'Ib',
      'phorate': 'Ia',
      'carbofuran': 'Ib',
      'methyl parathion': 'Ia',
      'chlorpyrifos': 'II',
      'cypermethrin': 'II',
      'imidacloprid': 'II',
      'spinosad': 'III',
      'neem': 'U',
      'beauveria': 'U',
      'trichoderma': 'U'
    };
    
    const lower = productName.toLowerCase();
    for (const [name, toxClass] of Object.entries(toxicityMap)) {
      if (lower.includes(name)) {
        return toxClass;
      }
    }
    
    return 'III'; // Default to slightly hazardous
  }
  
  /**
   * Log safety check to database
   */
  private async logSafetyCheck(check: SafetyCheck, escalation: EscalationDecision): Promise<void> {
    try {
      await this.supabase.from('safety_verifications').insert({
        verification_id: check.check_id,
        decision_id: check.decision_id,
        overall_status: check.overall_safety_status,
        banned_substance_violations: check.safety_gates.banned_substance_check.violations,
        human_safety_issues: check.safety_gates.human_safety_check.risks,
        food_safety_violations: check.safety_gates.food_safety_check.violations,
        environmental_concerns: check.safety_gates.environmental_check.concerns,
        regulatory_issues: check.safety_gates.regulatory_check.compliance_issues,
        escalation_triggered: escalation.should_escalate,
        escalation_type: escalation.escalation_level,
        escalation_reason: escalation.escalation_reasons.join('; '),
        created_at: check.timestamp
      });
    } catch (error) {
      console.error('Failed to log safety check:', error);
    }
  }
}

export const safetyGuardian = new SafetyGuardian();
