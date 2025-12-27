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
}

export type DiagnosticStatus = 
  | 'AWAITING_NLU'
  | 'GATHERING_CONTEXT'
  | 'AWAITING_PHOTO'
  | 'AWAITING_CLARIFICATION'
  | 'EVALUATING_RULES'
  | 'READY_TO_RECOMMEND'
  | 'COMPLETE'
  | 'ESCALATED';

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
  
  constructor(
    sessionId: string,
    farmerId: string,
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
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: RECEIVE NLU OUTPUT
  // ═══════════════════════════════════════════════════════════════════════
  
  async processNLUOutput(nluOutput: NLUOutputWithRuleMapping): Promise<DiagnosticFlowResponse> {
    this.session.nlu_output = nluOutput;
    this.session.status = 'GATHERING_CONTEXT';
    
    // Check for immediate safety concerns
    if (nluOutput.safety_alerts.emergency_detected) {
      return this.handleEmergency(nluOutput);
    }
    
    if (nluOutput.safety_alerts.banned_substance_mentioned) {
      return this.handleBannedSubstance(nluOutput);
    }
    
    // Check if clarification is needed before proceeding
    if (nluOutput.clarification_needed && nluOutput.questions.length > 0) {
      const highPriorityQuestions = nluOutput.questions.filter(q => q.priority === 'HIGH');
      
      if (highPriorityQuestions.length > 0) {
        this.session.status = 'AWAITING_CLARIFICATION';
        this.session.pending_questions = highPriorityQuestions.map(q => q.question_id);
        
        return {
          action: 'ASK_CLARIFICATION',
          questions: highPriorityQuestions,
          message_mr: 'कृपया खालील माहिती द्या:',
          message_hi: 'कृपया निम्नलिखित जानकारी दें:',
          message_en: 'Please provide the following information:',
          session_state: this.session
        };
      }
    }
    
    // Check if photo is needed
    if (nluOutput.contextNeeded.photo_required) {
      this.session.status = 'AWAITING_PHOTO';
      
      return {
        action: 'REQUEST_PHOTO',
        photo_instructions: this.getPhotoInstructions(nluOutput.intent),
        message_mr: 'कृपया प्रभावित भागाचा फोटो पाठवा',
        message_hi: 'कृपया प्रभावित भाग का फोटो भेजें',
        message_en: 'Please send a photo of the affected area',
        session_state: this.session
      };
    }
    
    // Proceed to rule evaluation
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
    this.session.status = 'EVALUATING_RULES';
    
    const nlu = this.session.nlu_output;
    const context = this.session.context;
    
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
    
    // Process rules by priority order
    for (const moduleRef of nlu.requiredRuleModules) {
      const moduleResult = await this.evaluateRuleModule(moduleRef, context);
      
      // Merge results
      if (moduleResult.blocked) {
        result.blocked = true;
        result.blockingRule = moduleResult.blockingRule;
        break; // Stop processing on P0/P1 block
      }
      
      result.recommendations.push(...moduleResult.recommendations);
      result.warnings.push(...moduleResult.warnings);
      result.requirements.push(...moduleResult.requirements);
      
      // Update safety compliance
      if (moduleRef.moduleFile === 'chemical-safety-rules') {
        result.safety_compliance.chemical_safety_passed = !moduleResult.blocked;
      }
      if (moduleRef.moduleFile === 'weather-action-rules') {
        result.safety_compliance.weather_safety_passed = !moduleResult.blocked;
      }
      if (moduleRef.moduleFile === 'ipm-rules') {
        result.ipm_level_suggested = moduleResult.ipm_level_suggested;
      }
      if (moduleRef.moduleFile === 'economic-threshold-rules') {
        result.economic_threshold_exceeded = moduleResult.economic_threshold_exceeded;
      }
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
      message_mr: result.blocked ? this.getBlockMessageMr(result.blockingRule!) : this.getRecommendationMessageMr(result),
      message_hi: result.blocked ? this.getBlockMessageHi(result.blockingRule!) : this.getRecommendationMessageHi(result),
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
    // In the actual implementation, this would dynamically load
    // and evaluate TypeScript rule modules
    
    // For now, we return a placeholder that will be filled
    // by the frontend DiagnosticController component
    
    this.session.loaded_modules.push({
      reference: moduleRef,
      loaded: true
    });
    
    return {
      blocked: false,
      recommendations: [],
      warnings: [],
      requirements: [],
      ipm_level_suggested: undefined,
      economic_threshold_exceeded: undefined
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // EMERGENCY HANDLERS
  // ═══════════════════════════════════════════════════════════════════════
  
  private handleEmergency(nlu: NLUOutputWithRuleMapping): DiagnosticFlowResponse {
    this.session.status = 'ESCALATED';
    
    return {
      action: 'ESCALATE',
      emergency_type: nlu.safety_alerts.emergency_type,
      message_mr: '⚠️ ही गंभीर परिस्थिती आहे. कृपया जवळच्या कृषी अधिकाऱ्याशी संपर्क साधा.',
      message_hi: '⚠️ यह गंभीर स्थिति है। कृपया नज़दीकी कृषि अधिकारी से संपर्क करें।',
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
      message_mr: `⛔ ${nlu.safety_alerts.banned_substance_code} हे रसायन बंदी आहे आणि वापरता कामा नये. कृपया सुरक्षित पर्याय वापरा.`,
      message_hi: `⛔ ${nlu.safety_alerts.banned_substance_code} यह रसायन प्रतिबंधित है और इसका उपयोग नहीं करना चाहिए। कृपया सुरक्षित विकल्प का उपयोग करें।`,
      message_en: `⛔ ${nlu.safety_alerts.banned_substance_code} is banned and must not be used. Please use safe alternatives.`,
      alternatives: this.getSafeAlternatives(nlu.entities.pest_code || nlu.entities.disease_code || ''),
      session_state: this.session
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // MESSAGE GENERATORS
  // ═══════════════════════════════════════════════════════════════════════
  
  private getBlockMessageMr(rule: BlockingRuleInfo): string {
    return `⛔ ${rule.reason}\n\nपर्यायी उपाय: ${rule.alternatives?.join(', ') || 'कृषी तज्ञाशी संपर्क साधा'}`;
  }
  
  private getBlockMessageHi(rule: BlockingRuleInfo): string {
    return `⛔ ${rule.reason}\n\nवैकल्पिक उपाय: ${rule.alternatives?.join(', ') || 'कृषि विशेषज्ञ से संपर्क करें'}`;
  }
  
  private getBlockMessageEn(rule: BlockingRuleInfo): string {
    return `⛔ ${rule.reason}\n\nAlternatives: ${rule.alternatives?.join(', ') || 'Contact agriculture expert'}`;
  }
  
  private getRecommendationMessageMr(result: RuleEvaluationResult): string {
    if (result.recommendations.length === 0) {
      return 'सध्या कोणताही उपाय आवश्यक नाही. पिकाचे निरीक्षण चालू ठेवा.';
    }
    
    const primary = result.recommendations[0];
    return primary.recommendation_text_mr;
  }
  
  private getRecommendationMessageHi(result: RuleEvaluationResult): string {
    if (result.recommendations.length === 0) {
      return 'अभी कोई उपाय आवश्यक नहीं है। फसल की निगरानी जारी रखें।';
    }
    
    const primary = result.recommendations[0];
    return primary.recommendation_text_hi;
  }
  
  private getRecommendationMessageEn(result: RuleEvaluationResult): string {
    if (result.recommendations.length === 0) {
      return 'No action needed at this time. Continue monitoring the crop.';
    }
    
    const primary = result.recommendations[0];
    return primary.recommendation_text_en;
  }
  
  private getPhotoInstructions(intent: string): PhotoInstructions {
    if (intent === 'PEST_PROBLEM') {
      return {
        what_to_capture_mr: 'किडी दिसत असलेल्या पानाच्या खालच्या भागाचा जवळून फोटो',
        what_to_capture_hi: 'जहां कीड़े दिख रहे हैं उस पत्ते के नीचे का नज़दीकी फोटो',
        what_to_capture_en: 'Close-up photo of leaf underside where pests are visible',
        distance: '15-20 cm',
        lighting: 'Natural daylight'
      };
    }
    
    if (intent === 'DISEASE_PROBLEM') {
      return {
        what_to_capture_mr: 'डाग किंवा रोगाची लक्षणे दिसत असलेल्या पानांचा फोटो',
        what_to_capture_hi: 'दाग या रोग के लक्षण दिखने वाले पत्तों का फोटो',
        what_to_capture_en: 'Photo of leaves showing spots or disease symptoms',
        distance: '20-30 cm',
        lighting: 'Natural daylight, avoid direct sunlight'
      };
    }
    
    return {
      what_to_capture_mr: 'प्रभावित भागाचा स्पष्ट फोटो',
      what_to_capture_hi: 'प्रभावित भाग का स्पष्ट फोटो',
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
  action: 'ASK_CLARIFICATION' | 'REQUEST_PHOTO' | 'RECOMMEND' | 'BLOCK' | 'ESCALATE';
  questions?: NLUOutputWithRuleMapping['questions'];
  photo_instructions?: PhotoInstructions;
  evaluation_result?: RuleEvaluationResult;
  emergency_type?: string;
  blocked_reason?: string;
  alternatives?: string[];
  emergency_contacts?: EmergencyContact[];
  message_mr: string;
  message_hi: string;
  message_en: string;
  session_state: DiagnosticSession;
}

export interface PhotoInstructions {
  what_to_capture_mr: string;
  what_to_capture_hi: string;
  what_to_capture_en: string;
  distance: string;
  lighting: string;
}

export interface EmergencyContact {
  name: string;
  number: string;
  available: string;
}
