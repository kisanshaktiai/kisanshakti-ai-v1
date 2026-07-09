/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC FLOW CONTROLLER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Uses NLU output to orchestrate the decision-making process:
 * 1. Loads required TypeScript rule modules
 * 2. Gathers necessary context (weather, soil, NDVI)
 * 3. Evaluates rules in priority order
 * 4. Generates farmer-friendly recommendations
 * 
 * This runs on the edge function and coordinates between:
 * - NLU Agent output
 * - Decision Graph rule modules
 * - Supabase context data
 */

import {
  NLUOutputWithRuleMapping,
  RuleModuleReference,
  RuleEvaluationContext,
  RuleEvaluationResult,
  RulePriority,
  BlockingRuleInfo,
  RuleRecommendation,
  RuleWarning,
  SafetyComplianceStatus,
} from './rule-module-types.ts';

import {
  resolveDecisionAuthority,
  shouldSkipCropRules,
  buildAuthorityAuditEntry,
  DecisionAuthority,
  AuthorityInput,
  AuthorityDecision,
  AuthorityAuditEntry
} from '../decision/authority-resolver.ts';

// v3.0: Import terminal damage detection for observation-based authority
import {
  detectTerminalDamageForAuthority,
  resolveDiagnosticAuthorityFromObservations,
  assertTerminalDamageAuthority
} from '../decision/diagnosis-only-mode.ts';

// Static import for decision graph bridge (CRITICAL: No dynamic imports allowed in edge functions)
import { evaluateDecisionGraph } from './decision-graph-bridge.ts';

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC SESSION STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticSession {
  session_id: string;
  farmer_id: string;
  land_id?: string;
  started_at: string;
  nlu_output: NLUOutputWithRuleMapping;
  context: RuleEvaluationContext;
  loaded_modules: LoadedModule[];
  evaluation_result?: RuleEvaluationResult;
  status: DiagnosticStatus;
  pending_questions: string[];
  /** Authority decision audit trail */
  authority_audit?: AuthorityAuditEntry;
}

export type DiagnosticStatus = 
  | 'AWAITING_NLU'
  | 'GATHERING_CONTEXT'
  | 'AWAITING_PHOTO'
  | 'AWAITING_CLARIFICATION'
  | 'RESOLVING_AUTHORITY'
  | 'EVALUATING_RULES'
  | 'READY_TO_RECOMMEND'
  | 'COMPLETE'
  | 'ESCALATED'
  | 'AUTHORITY_BLOCKED';

export interface LoadedModule {
  reference: RuleModuleReference;
  loaded: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC FLOW CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

export class DiagnosticFlowController {
  private session: DiagnosticSession;
  private supabaseClient: any;
  
  constructor(
    sessionId: string,
    farmerId: string,
    supabaseClient: any,
    landId?: string
  ) {
    this.session = {
      session_id: sessionId,
      farmer_id: farmerId,
      land_id: landId,
      started_at: new Date().toISOString(),
      nlu_output: {} as NLUOutputWithRuleMapping,
      context: {} as RuleEvaluationContext,
      loaded_modules: [],
      status: 'AWAITING_NLU',
      pending_questions: []
    };
    this.supabaseClient = supabaseClient;
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: RECEIVE NLU OUTPUT
  // ═══════════════════════════════════════════════════════════════════════
  
  async processNLUOutput(nluOutput: NLUOutputWithRuleMapping): Promise<DiagnosticFlowResponse> {
    this.session.nlu_output = nluOutput;
    this.session.status = 'GATHERING_CONTEXT';
    
    // CRITICAL FIX: Handle undefined confidence - default to medium (0.5) not undefined
    const overallConfidence = nluOutput.overall_confidence ?? 
                              nluOutput.understanding_confidence ?? 
                              (nluOutput.entities?.crop_code ? 0.6 : 0.4);
    
    console.log('🔍 [DiagnosticFlow] Processing NLU output:', {
      intent: nluOutput.intent,
      confidence: overallConfidence,
      hasCrop: !!nluOutput.entities?.crop_code,
      hasPestOrDisease: !!(nluOutput.entities?.pest_code || nluOutput.entities?.disease_code)
    });
    
    // Check for immediate safety concerns
    if (nluOutput.safety_alerts?.emergency_detected) {
      console.log('🚨 [DiagnosticFlow] Emergency detected!');
      return this.handleEmergency(nluOutput);
    }
    
    if (nluOutput.safety_alerts?.banned_substance_mentioned) {
      console.log('⛔ [DiagnosticFlow] Banned substance detected!');
      return this.handleBannedSubstance(nluOutput);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // v3.0: OBSERVATION-BASED AUTHORITY RESOLUTION (NLU GATING REMOVED)
    // 
    // Authority is derived from ObservationKeys, NOT from NLU intent/confidence.
    // hasProblem and hasPestOrDisease are NO LONGER used for diagnosis eligibility.
    // Terminal damage observations automatically grant CROP authority.
    // ═══════════════════════════════════════════════════════════════════════════
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BUG FIX #5: Collect observation keys from ALL sources, not just symptom_codes
    // ═══════════════════════════════════════════════════════════════════════════
    const observationKeys = new Set<string>([
      ...(nluOutput.entities?.symptom_codes || []),
      ...(nluOutput.symptom_extraction?.cross_crop_symptoms || []),
      ...(nluOutput.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [])
    ]);
    
    // Also check observation extraction from semantic layer
    if (this.session.context?.observationExtraction?.observation_keys) {
      for (const key of this.session.context.observationExtraction.observation_keys) {
        observationKeys.add(key);
      }
    }
    
    console.log(`📋 [DiagnosticFlow] Observation keys collected: ${observationKeys.size}`, 
      observationKeys.size > 0 ? Array.from(observationKeys).slice(0, 5) : 'none');
    
    // Check for terminal damage from observations (NOT NLU intent)
    const terminalDamageResult = detectTerminalDamageForAuthority(observationKeys);
    
    // v3.0: If terminal damage detected, proceed DIRECTLY to rule evaluation
    // NLU confidence is COMPLETELY IGNORED - authority comes from observations
    if (terminalDamageResult.detected) {
      console.log('🚨 [DiagnosticFlow] Terminal damage detected - proceeding directly to rule evaluation');
      console.log('   Mode=DIAGNOSIS_ONLY');
      console.log('   Authority=CROP (ENFORCED)');
      console.log('   Trigger=TERMINAL_DAMAGE_OBSERVATION');
      console.log('   NLU_ROLE=OBSERVATION_ONLY');
      console.log(`   Terminal indicators: ${terminalDamageResult.terminal_damage.join(', ')}`);
      
      // Proceed directly to rule evaluation - skip all clarification
      return await this.evaluateRules();
    }
    
    // v4.0 (GRAPH_GATE): CONTEXT vs EVIDENCE separation
    //   CONTEXT  = crop, variety, stage, DAS, soil, NDVI, weather, GPS
    //   EVIDENCE = confirmed farmer observations, sensor observations, validated symptoms
    // A diagnostic turn MUST have EVIDENCE (>=1 confirmed observation) before
    // rule/hypothesis evaluation. Crop alone is CONTEXT and MUST NOT unlock
    // decision_rules — otherwise the observation graph is skipped and the
    // hypothesis pool is empty. Non-diagnostic (proactive) modules keep the
    // context-only path via a separate scheduler and never reach here.
    const hasCrop = !!nluOutput.entities?.crop_code;
    const hasObservations = observationKeys.size > 0;
    const hasDiagnosticEvidence = hasObservations;
    const isDiagnosticIntent = !!nluOutput.intent && nluOutput.intent !== 'UNKNOWN';

    // canProceedDirectly requires EVIDENCE, not just CONTEXT.
    const canProceedDirectly = hasDiagnosticEvidence;

    console.log(
      `[GRAPH_GATE] intent=${nluOutput.intent ?? 'null'} ` +
      `crop=${nluOutput.entities?.crop_code ?? 'null'} ` +
      `context_available=${hasCrop} ` +
      `confirmed_observation_count=${observationKeys.size} ` +
      `decision=${canProceedDirectly ? 'RUN_GRAPH' : (isDiagnosticIntent ? 'ASK_OBSERVATION' : 'ASK_CLARIFICATION')}`
    );

    // EVIDENCE present → run rule/hypothesis graph
    if (canProceedDirectly) {
      console.log('✅ [DiagnosticFlow] Diagnostic evidence present — proceeding to rule evaluation');
      return await this.evaluateRules();
    }

    // Diagnostic intent + context but ZERO evidence → route to observation navigator.
    // This is the neuro-symbolic invariant: intent → intent_observation_mapping →
    // observation_master → farmer confirms → hypothesis graph → decision_rules.
    // We MUST NOT call evaluateRules() here.
    if (isDiagnosticIntent) {
      console.log(
        '❓ [DiagnosticFlow] Diagnostic intent without evidence — routing to observation navigator ' +
        '(intent_observation_mapping → observation_master)'
      );
      this.session.status = 'AWAITING_CLARIFICATION';
      return {
        action: 'ASK_CLARIFICATION',
        questions: [],
        message_en: 'OBSERVATION_REQUIRED',
        session_state: this.session,
      };
    }
    
    // Only ask for clarification if we genuinely need it AND have high-priority questions
    if (nluOutput.clarification_needed && nluOutput.questions.length > 0) {
      const highPriorityQuestions = nluOutput.questions.filter(q => q.priority === 'HIGH');
      
      // Only block for critical missing info (not crop since we may have from context)
      const criticalMissingQuestions = highPriorityQuestions.filter(q => 
        !nluOutput.entities?.crop_code && q.question_id?.includes('CROP') ||
        q.priority === 'CRITICAL'
      );
      
      if (criticalMissingQuestions.length > 0 && !hasEssentialEntities) {
        this.session.status = 'AWAITING_CLARIFICATION';
        this.session.pending_questions = criticalMissingQuestions.map(q => q.question_id);
        
        console.log('❓ [DiagnosticFlow] Asking clarification:', criticalMissingQuestions.length, 'questions');
        
        return {
          action: 'ASK_CLARIFICATION',
          questions: criticalMissingQuestions,
          message_en: 'Please provide the following information:',
          session_state: this.session
        };
      }
    }
    
    // Check if photo is needed - only if severity is high or unknown
    if (nluOutput.contextNeeded.photo_required && !hasEssentialEntities) {
      this.session.status = 'AWAITING_PHOTO';
      
      console.log('📷 [DiagnosticFlow] Requesting photo');
      
      return {
        action: 'REQUEST_PHOTO',
        photo_instructions: this.getPhotoInstructions(nluOutput.intent),
        message_en: 'Please send a photo of the affected area',
        session_state: this.session
      };
    }
    
    // Proceed to rule evaluation
    console.log('➡️ [DiagnosticFlow] Proceeding to rule evaluation');
    return await this.evaluateRules();
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: BUILD EVALUATION CONTEXT
  // ═══════════════════════════════════════════════════════════════════════
  
  async buildEvaluationContext(
    additionalContext: Partial<RuleEvaluationContext>
  ): Promise<RuleEvaluationContext> {
    const nlu = this.session.nlu_output;
    
    // Start with NLU-extracted entities
    const context: RuleEvaluationContext = {
      crop_code: nlu.entities.crop_code || '',
      crop_stage: nlu.entities.crop_stage,
      pest_code: nlu.entities.pest_code,
      disease_code: nlu.entities.disease_code,
      infestation_level: nlu.entities.affected_area_percent,
      severity: nlu.entities.severity,
      land_id: this.session.land_id,
      farmer_id: this.session.farmer_id,
      ...additionalContext,
      metadata: {
        session_id: this.session.session_id,
        intent: nlu.intent,
        language: nlu.language
      }
    };
    
    this.session.context = context;
    return context;
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: EVALUATE RULES
  // ═══════════════════════════════════════════════════════════════════════
  
  async evaluateRules(): Promise<DiagnosticFlowResponse> {
    this.session.status = 'RESOLVING_AUTHORITY';
    
    const nlu = this.session.nlu_output;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Build evaluation context from NLU BEFORE rule evaluation
    // This was missing - causing context to be empty and all rules to fail
    // ═══════════════════════════════════════════════════════════════════════════
    const context = await this.buildEvaluationContext({});
    
    console.log('📋 [DiagnosticFlow] Built evaluation context:', {
      crop_code: context.crop_code,
      pest_code: context.pest_code,
      disease_code: context.disease_code,
      severity: context.severity,
      crop_stage: context.crop_stage
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // v3.0: DECISION AUTHORITY RESOLUTION (WITH OBSERVATIONS)
    // Pass observations to resolver for terminal damage pre-check
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Collect all observations for authority check
    const allObservations = new Set<string>([
      ...(nlu.entities?.symptom_codes || []),
      ...(context.observations || [])
    ]);
    
    // v3.0: First check terminal damage via pre-authority gate
    const preAuthorityResult = resolveDiagnosticAuthorityFromObservations(allObservations);
    
    let authorityDecision: AuthorityDecision;
    
    if (preAuthorityResult.nlu_bypassed && preAuthorityResult.enforced_decision) {
      // Terminal damage detected - use enforced authority
      authorityDecision = preAuthorityResult.enforced_decision;
      
      console.log('🚨 [DiagnosticFlow] Authority ENFORCED by terminal damage:', {
        authority: authorityDecision.authority,
        trigger: preAuthorityResult.trigger,
        terminal_indicators: preAuthorityResult.terminal_indicators,
        nlu_bypassed: true
      });
    } else {
      // Standard authority resolution (with observations for invariant check)
      const authorityInput: AuthorityInput = {
        detected_causes: this.extractDetectedCauses(nlu, context),
        cross_crop_symptoms: nlu.entities?.symptom_codes || [],
        land_context: context.land_id ? {
          has_soil_health: !!(context as any).soil_health,
          soil_ec: (context as any).soil_ec,
          waterlogging: (context as any).waterlogging
        } : undefined
      };
      
      // v3.0: Pass observations to resolver for terminal damage check
      authorityDecision = resolveDecisionAuthority(authorityInput, allObservations);
      
      console.log('⚖️ [DiagnosticFlow] Authority resolved (standard path):', {
        authority: authorityDecision.authority,
        blocked_domains: authorityDecision.blocked_domains,
        reason: authorityDecision.reason
      });
    }
    
    // v3.0: Assert invariant - terminal damage MUST have CROP authority
    if (preAuthorityResult.nlu_bypassed) {
      assertTerminalDamageAuthority(true, authorityDecision.authority);
    }
    
    // v5.1 BUG 5 FIX: Check for crop damage enforcement BEFORE shouldSkipCropRules
    // If preAuthorityResult has an enforced_decision (from terminal/crop damage), use it
    // to prevent the standard authority resolver from incorrectly blocking CROP domain
    if (preAuthorityResult.enforced_decision && !authorityDecision.authority) {
      console.log('🔄 [DiagnosticFlow v5.1] Overriding authority with enforced crop damage decision');
      authorityDecision = preAuthorityResult.enforced_decision;
    }
    
    // Check if crop rules should be skipped
    const skipCropRules = shouldSkipCropRules(authorityDecision);
    
    if (skipCropRules && !preAuthorityResult.enforced_decision) {
      // v5.1: Only block if there's NO enforced crop damage override
      console.log('🚫 [DiagnosticFlow] Crop rules BLOCKED by higher authority:', authorityDecision.authority);
      this.session.status = 'AUTHORITY_BLOCKED';
      
      return this.handleAuthorityBlock(authorityDecision, context);
    } else if (skipCropRules && preAuthorityResult.enforced_decision) {
      console.log('✅ [DiagnosticFlow v5.1] Crop rules ALLOWED despite authority block — enforced crop damage override active');
    }
    
    this.session.status = 'EVALUATING_RULES';
    
    const result: RuleEvaluationResult = {
      blocked: false,
      recommendations: [],
      warnings: [],
      requirements: [],
      safety_compliance: {
        chemical_safety_passed: true,
        phi_compliance_checked: false,
        weather_safety_passed: true,
        overall_safe_to_proceed: true,
        pending_checks: []
      }
    };
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Evaluate decision graph ONCE, not per module (major latency fix)
    // ═══════════════════════════════════════════════════════════════════════════
    
    console.log('🔬 [DiagnosticFlow] Evaluating decision graph ONCE for all modules');
    
    try {
      const graphResult = await evaluateDecisionGraph(this.supabaseClient, context, this.session.session_id);
      
      // Record which modules were referenced (for traceability)
      for (const moduleRef of nlu.requiredRuleModules) {
        this.session.loaded_modules.push({
          reference: moduleRef,
          loaded: true
        });
      }
      
      // Merge graph results directly
      result.blocked = graphResult.blocked;
      result.blockingRule = graphResult.blockingRule;
      result.recommendations = graphResult.recommendations || [];
      result.warnings = graphResult.warnings || [];
      result.requirements = graphResult.requirements || [];
      result.ipm_level_suggested = graphResult.ipm_level_suggested;
      result.economic_threshold_exceeded = graphResult.economic_threshold_exceeded;
      
      // Update safety compliance from graph result
      result.safety_compliance.chemical_safety_passed = !graphResult.blocked;
      result.safety_compliance.weather_safety_passed = true; // Assume passed unless blocked
      
      console.log(`   ✅ Graph evaluation complete: ${result.recommendations.length} recommendations, blocked: ${result.blocked}`);
    } catch (error) {
      console.error('   ❌ Decision graph evaluation failed:', error);
      // Continue with empty results rather than failing completely
    }
    
    // Update overall safety status
    result.safety_compliance.overall_safe_to_proceed = 
      result.safety_compliance.chemical_safety_passed &&
      result.safety_compliance.weather_safety_passed &&
      !result.blocked;
    
    this.session.evaluation_result = result;
    this.session.status = 'READY_TO_RECOMMEND';
    
    return {
      action: result.blocked ? 'BLOCK' : 'RECOMMEND',
      evaluation_result: result,
      message_en: result.blocked ? this.getBlockMessageEn(result.blockingRule!) : this.getRecommendationMessageEn(result),
      session_state: this.session
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // RULE MODULE EVALUATION (Simulated - actual import happens in React)
  // ═══════════════════════════════════════════════════════════════════════
  
  private async evaluateRuleModule(
    moduleRef: RuleModuleReference,
    context: RuleEvaluationContext
  ): Promise<Partial<RuleEvaluationResult>> {
    // CRITICAL FIX: Use the decision-graph-bridge for actual rule evaluation (static import at top)
    
    console.log(`🔬 [DiagnosticFlow] Evaluating module: ${moduleRef.moduleFile}`);
    
    try {
      const result = await evaluateDecisionGraph(this.supabaseClient, context, this.session.session_id);
      
      this.session.loaded_modules.push({
        reference: moduleRef,
        loaded: true
      });
      
      console.log(`   ✅ Module ${moduleRef.moduleFile}: ${result.recommendations.length} recommendations`);
      
      return {
        blocked: result.blocked,
        blockingRule: result.blockingRule,
        recommendations: result.recommendations,
        warnings: result.warnings,
        requirements: result.requirements,
        ipm_level_suggested: result.ipm_level_suggested,
        economic_threshold_exceeded: result.economic_threshold_exceeded
      };
    } catch (error) {
      console.error(`   ❌ Module ${moduleRef.moduleFile} evaluation failed:`, error);
      this.session.loaded_modules.push({
        reference: moduleRef,
        loaded: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        blocked: false,
        recommendations: [],
        warnings: [],
        requirements: []
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // EMERGENCY HANDLERS
  // ═══════════════════════════════════════════════════════════════════════
  
  private handleEmergency(nlu: NLUOutputWithRuleMapping): DiagnosticFlowResponse {
    this.session.status = 'ESCALATED';
    
    return {
      action: 'ESCALATE',
      emergency_type: nlu.safety_alerts.emergency_type,
      message_en: '⚠️ This is a serious situation. Please contact your nearest agriculture officer.',
      emergency_contacts: this.getEmergencyContacts(),
      session_state: this.session
    };
  }
  
  private handleBannedSubstance(nlu: NLUOutputWithRuleMapping): DiagnosticFlowResponse {
    this.session.status = 'ESCALATED';
    
    return {
      action: 'BLOCK',
      blocked_reason: 'BANNED_SUBSTANCE',
      message_en: `⛔ ${nlu.safety_alerts.banned_substance_code} is banned and must not be used. Please use safe alternatives.`,
      alternatives: this.getSafeAlternatives(nlu.entities.pest_code || nlu.entities.disease_code || ''),
      session_state: this.session
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // MESSAGE GENERATORS
  // ═══════════════════════════════════════════════════════════════════════
  
  // English-only — LLM narration layer translates at runtime
  private getBlockMessageEn(rule: BlockingRuleInfo): string {
    return `⛔ ${rule.reason}\n\nAlternatives: ${rule.alternatives?.join(', ') || 'Contact agriculture expert'}`;
  }
  
  private getRecommendationMessageEn(result: RuleEvaluationResult): string {
    if (result.recommendations.length === 0) {
      return 'No action needed at this time. Continue monitoring the crop.';
    }
    const primary = result.recommendations[0];
    return primary.recommendation_text_en;
  }
  
  // English-only photo instructions — LLM narration layer translates at runtime
  private getPhotoInstructions(intent: string): PhotoInstructions {
    if (intent === 'PEST_PROBLEM') {
      return {
        what_to_capture_en: 'Close-up photo of leaf underside where pests are visible',
        distance: '15-20 cm',
        lighting: 'Natural daylight'
      };
    }
    
    if (intent === 'DISEASE_PROBLEM') {
      return {
        what_to_capture_en: 'Photo of leaves showing spots or disease symptoms',
        distance: '20-30 cm',
        lighting: 'Natural daylight, avoid direct sunlight'
      };
    }
    
    return {
      what_to_capture_en: 'Clear photo of affected area',
      distance: '20-30 cm',
      lighting: 'Natural daylight'
    };
  }
  
  private getEmergencyContacts(): EmergencyContact[] {
    return [
      {
        name: 'Kisan Call Center',
        number: '1800-180-1551',
        available: '24/7'
      },
      {
        name: 'District Agriculture Office',
        number: 'Contact local office',
        available: 'Working hours'
      }
    ];
  }
  
  private getSafeAlternatives(issueCode: string): string[] {
    // This would be populated based on the specific pest/disease
    // and available safe alternatives from the rule modules
    return [
      'Neem oil spray (5ml/L)',
      'Biological control agents',
      'Cultural practices'
    ];
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // AUTHORITY RESOLUTION HELPERS
  // ═══════════════════════════════════════════════════════════════════════
  
  /**
   * Extract detected causes from NLU output and context.
   * Maps to cause codes used by the authority resolver.
   */
  /**
   * Extract detected causes from NLU output and context.
   * Maps to cause codes used by the authority resolver.
   * 
   * BUG FIX #4: Add mappings for terminal damage symptoms to causes
   */
  private extractDetectedCauses(
    nlu: NLUOutputWithRuleMapping,
    context: RuleEvaluationContext
  ): string[] {
    const causes: string[] = [];
    
    // From NLU entities
    if (nlu.entities?.pest_code) causes.push(nlu.entities.pest_code);
    if (nlu.entities?.disease_code) causes.push(nlu.entities.disease_code);
    
    // From safety alerts
    if (nlu.safety_alerts?.banned_substance_mentioned) {
      causes.push('BANNED_SUBSTANCE');
    }
    if (nlu.safety_alerts?.emergency_detected) {
      causes.push('EMERGENCY_ESCALATION');
    }
    
    // Collect ALL symptom codes from multiple sources
    const symptomCodes = new Set<string>([
      ...(nlu.entities?.symptom_codes || []),
      ...(nlu.symptom_extraction?.cross_crop_symptoms || []),
      ...(nlu.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [])
    ]);
    
    for (const symptom of symptomCodes) {
      const upperSymptom = symptom.toUpperCase();
      
      // ═══════════════════════════════════════════════════════════════════════════
      // BUG FIX #4: Map terminal damage symptoms to causes for authority resolution
      // ═══════════════════════════════════════════════════════════════════════════
      
      // Terminal damage symptoms -> CROP authority causes
      if (upperSymptom.includes('PLANT_DEATH') || upperSymptom.includes('DIED') || upperSymptom.includes('DEAD')) {
        causes.push('PLANT_MORTALITY');
      }
      if (upperSymptom.includes('SEEDLING_DEATH') || upperSymptom.includes('SEEDLING_DIED')) {
        causes.push('SEEDLING_MORTALITY');
      }
      if (upperSymptom.includes('GERMINATION_FAIL') || upperSymptom.includes('GERMINATION_FAILURE')) {
        causes.push('GERMINATION_FAILURE');
      }
      if (upperSymptom.includes('DEAD_HEART')) {
        causes.push('BORER_SUSPECTED');
      }
      if (upperSymptom.includes('WILTING') || upperSymptom.includes('WILT')) {
        causes.push('WILTING_SYNDROME');
      }
      if (upperSymptom.includes('PATCHY') || upperSymptom.includes('GAP')) {
        causes.push('PATCHY_STAND');
      }
      
      // Environmental stress symptoms
      if (upperSymptom.includes('WATERLOG')) causes.push('WATERLOGGING');
      if (upperSymptom.includes('SALIN') || upperSymptom.includes('SALT')) causes.push('SALINITY');
      if (upperSymptom.includes('FROST')) causes.push('FROST');
      if (upperSymptom.includes('HEAT') || upperSymptom.includes('SCORCH')) causes.push('HEAT_STRESS');
      if (upperSymptom.includes('FLOOD')) causes.push('FLOOD_DAMAGE');
      if (upperSymptom.includes('IRRIGATION')) causes.push('IRRIGATION_FAILURE');
      if (upperSymptom.includes('DROUGHT') || upperSymptom.includes('WATER_STRESS')) causes.push('DROUGHT_STRESS');
      
      // Pest/disease indicators
      if (upperSymptom.includes('BORER') || upperSymptom.includes('HOLES')) causes.push('PEST_DAMAGE');
      if (upperSymptom.includes('TERMITE')) causes.push('TERMITE_INFESTATION');
      if (upperSymptom.includes('YELLOWING') || upperSymptom.includes('YELLOW')) causes.push('NUTRIENT_OR_DISEASE');
      if (upperSymptom.includes('SPOTS') || upperSymptom.includes('LESION')) causes.push('DISEASE_SUSPECTED');
    }
    
    console.log(`🔍 [DiagnosticFlow] Extracted causes from ${symptomCodes.size} symptoms:`, 
      causes.length > 0 ? causes.slice(0, 5) : 'none');
    
    return [...new Set(causes)]; // Deduplicate
  }
  
  /**
   * Handle cases where crop rules are blocked by higher authority.
   * Returns appropriate response for LAND, CLIMATE, or SYSTEM authority.
   */
  private handleAuthorityBlock(
    decision: AuthorityDecision,
    context: RuleEvaluationContext
  ): DiagnosticFlowResponse {
    const message = this.getAuthorityBlockMessageEn(decision);
    
    return {
      action: 'BLOCK',
      blocked_reason: `AUTHORITY_${decision.authority}`,
      message_en: message,
      alternatives: this.getAuthorityAlternatives(decision),
      session_state: this.session
    };
  }
  
  /**
   * Get localized messages for authority blocks.
   */
  // English-only authority block messages — LLM narration layer translates at runtime
  private getAuthorityBlockMessageEn(decision: AuthorityDecision): string {
    switch (decision.authority) {
      case DecisionAuthority.LAND:
        return '🌱 Soil issue must be addressed first. Resolve salinity or waterlogging before pest/disease treatment can be effective.';
      case DecisionAuthority.CLIMATE:
        return '🌦️ Crop is affected by climate stress. Address weather-related measures first.';
      case DecisionAuthority.SYSTEM:
        return '⚙️ Fix irrigation or equipment failure first.';
      case DecisionAuthority.SAFETY:
        return '⚠️ Safety priority! Please follow safety guidelines first.';
      default:
        return 'Please address root cause first.';
    }
  }
  
  /**
   * Get alternatives based on authority domain.
   */
  // English-only alternatives — LLM narration layer translates at runtime
  private getAuthorityAlternatives(decision: AuthorityDecision): string[] {
    switch (decision.authority) {
      case DecisionAuthority.LAND:
        return [
          'Soil testing',
          'Gypsum application for salinity',
          'Drainage improvement',
          'Consult KVK soil specialist'
        ];
      case DecisionAuthority.CLIMATE:
        return [
          'Protective irrigation',
          'Mulching for temperature control',
          'Wait for weather improvement'
        ];
      case DecisionAuthority.SYSTEM:
        return [
          'Repair irrigation system',
          'Check pump and motor',
          'Manual watering if critical'
        ];
      default:
        return ['Contact agriculture officer'];
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════
  
  getSessionState(): DiagnosticSession {
    return this.session;
  }
  
  updateContext(updates: Partial<RuleEvaluationContext>): void {
    this.session.context = { ...this.session.context, ...updates };
  }
  
  markQuestionAnswered(questionId: string): void {
    this.session.pending_questions = this.session.pending_questions.filter(
      id => id !== questionId
    );
    
    if (this.session.pending_questions.length === 0 && 
        this.session.status === 'AWAITING_CLARIFICATION') {
      this.session.status = 'GATHERING_CONTEXT';
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticFlowResponse {
  action: 'ASK_CLARIFICATION' | 'REQUEST_PHOTO' | 'RECOMMEND' | 'BLOCK' | 'ESCALATE' | 'AUTHORITY_BLOCK';
  questions?: NLUOutputWithRuleMapping['questions'];
  photo_instructions?: PhotoInstructions;
  evaluation_result?: RuleEvaluationResult;
  emergency_type?: string;
  blocked_reason?: string;
  alternatives?: string[];
  emergency_contacts?: EmergencyContact[];
  /** @deprecated Use message_en — LLM translates at runtime */
  message_mr?: string;
  /** @deprecated Use message_en — LLM translates at runtime */
  message_hi?: string;
  message_en: string;
  session_state: DiagnosticSession;
}

export interface PhotoInstructions {
  /** @deprecated Use what_to_capture_en — LLM translates at runtime */
  what_to_capture_mr?: string;
  /** @deprecated Use what_to_capture_en — LLM translates at runtime */
  what_to_capture_hi?: string;
  what_to_capture_en: string;
  distance: string;
  lighting: string;
}

export interface EmergencyContact {
  name: string;
  number: string;
  available: string;
}
