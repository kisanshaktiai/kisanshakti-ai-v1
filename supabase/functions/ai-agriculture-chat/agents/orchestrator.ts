/**
 * Master AI Agent Orchestrator
 * Coordinates all 9 specialized agents for comprehensive agricultural advisory
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Import all agents
import { processNLUAgent } from './nlu-agent.ts';
import { processVisualAgent } from './visual-agent.ts';
import { processContextManager, createNewSession } from './context-manager.ts';
import { DiagnosticFlowController } from './diagnostic-flow-controller.ts';
import { MultiModalFusionEngine } from './multimodal-fusion.ts';
import { RuleEngineExecutor } from './rule-engine-executor.ts';
import { CommunicationGenerator } from './communication-generator.ts';
import { FeedbackLearningEngine } from './feedback-learning.ts';
import { SafetyGuardian } from './safety-guardian.ts';

// Import types
import type { NLUOutput } from './types.ts';
import type { VisualAnalysisOutput } from './visual-agent-types.ts';
import type { ContextState } from './context-manager-types.ts';
import type { DiagnosticState } from './hypothesis-types.ts';
import type { FusedIntelligence } from './multimodal-fusion-types.ts';
import type { DecisionOutput, RuleExecutionInput } from './rule-engine-types.ts';
import type { FarmerCommunication, FarmerProfile } from './communication-types.ts';
import type { SafetyVerificationResult } from './safety-guardian-types.ts';
import type { NLUIntent, ExtractedEntities, SafetyAlerts } from './rule-module-types.ts';

// Import rule resolver for NLU-to-Rules mapping (CRITICAL GAP 1 FIX)
import { resolveRuleModules, determineContextRequirements, generateRuleRequiredQuestions } from './rule-module-resolver.ts';

export const ORCHESTRATOR_VERSION = '1.0.0';

// Response types
export type OrchestratorResponseType = 
  | 'DECISION_PROVIDED'
  | 'CLARIFICATION_QUESTION'
  | 'PHOTO_REQUEST'
  | 'SAFETY_BLOCKED'
  | 'ESCALATION_REQUIRED'
  | 'SYSTEM_ERROR';

export interface OrchestratorResponse {
  type: OrchestratorResponseType;
  session_id: string;
  decision_id?: string;
  
  // For DECISION_PROVIDED
  communication?: FarmerCommunication;
  
  // For CLARIFICATION_QUESTION
  question?: {
    question_id: string;
    text_mr: string;
    text_hi: string;
    text_en: string;
    options?: Array<{ value: string; label: string }>;
  };
  
  // For PHOTO_REQUEST
  photo_instructions?: {
    text_mr: string;
    text_hi: string;
    text_en: string;
    tips: string[];
  };
  
  // For SAFETY_BLOCKED
  blocked_reason?: {
    reason_mr: string;
    reason_hi: string;
    reason_en: string;
  };
  alternatives?: Array<{
    alternative: string;
    product_name: string;
    why_safer: string;
  }>;
  
  // For ESCALATION_REQUIRED
  escalation?: {
    level: string;
    expert_type: string;
    sla_hours: number;
    message_mr: string;
    message_hi: string;
    message_en: string;
  };
  
  // For SYSTEM_ERROR
  error?: {
    message: string;
    fallback_advice?: string;
  };
  
  // Metadata
  metadata?: {
    confidence: number;
    safety_status: string;
    rules_applied: number;
    processing_time_ms: number;
    agents_used: string[];
  };
}

export class AIAgentOrchestrator {
  private supabase: ReturnType<typeof createClient>;
  
  // Agent instances (stateless - created per-request for DiagnosticController)
  private fusionEngine: MultiModalFusionEngine;
  private ruleEngine: RuleEngineExecutor;
  private communicationGenerator: CommunicationGenerator;
  private feedbackEngine: FeedbackLearningEngine;
  private safetyGuardian: SafetyGuardian;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Initialize stateless agents
    this.fusionEngine = new MultiModalFusionEngine();
    this.ruleEngine = new RuleEngineExecutor();
    this.communicationGenerator = new CommunicationGenerator();
    this.feedbackEngine = new FeedbackLearningEngine();
    this.safetyGuardian = new SafetyGuardian();
  }
  
  /**
   * Create a per-request DiagnosticFlowController
   */
  private createDiagnosticController(sessionId: string, farmerId: string, landId?: string): DiagnosticFlowController {
    return new DiagnosticFlowController(sessionId, farmerId, landId);
  }
  
  /**
   * Main orchestration function - coordinates all agents
   */
  async orchestrate(
    farmerMessage: string,
    sessionId: string,
    farmerId: string,
    tenantId: string,
    options: {
      photoUrl?: string;
      language?: 'mr' | 'hi' | 'en';
      landId?: string;
    } = {}
  ): Promise<OrchestratorResponse> {
    
    const startTime = Date.now();
    const agentsUsed: string[] = [];
    
    console.log('🚀 Orchestrator: Starting full diagnostic flow...');
    console.log(`   Session: ${sessionId}`);
    console.log(`   Message: ${farmerMessage.substring(0, 50)}...`);
    
    try {
      // ========================================
      // PHASE 1A: NLU + VISUAL PROCESSING (Parallel)
      // GAP 6 FIX: Added error boundaries around each agent
      // ========================================
      console.log('\n📥 PHASE 1: Processing Inputs...');
      
      // Agent 1: Process farmer's text message - with error boundary
      let nluOutput: NLUOutput | null = null;
      try {
        nluOutput = await this.processNLU(farmerMessage, sessionId, options.language);
        agentsUsed.push('NLU');
        console.log('   ✅ NLU processed:', nluOutput?.intent_classification?.primary_intent || 'GENERAL_QUERY');
      } catch (nluError) {
        console.error('   ❌ NLU Agent failed, using fallback:', nluError);
        nluOutput = this.createFallbackNLUOutput(farmerMessage, options.language);
        agentsUsed.push('NLU_FALLBACK');
      }
      
      // Agent 1B: Analyze photo (if provided) - with error boundary
      let visualOutput: VisualAnalysisOutput | null = null;
      if (options.photoUrl) {
        try {
          visualOutput = await this.processVisual(options.photoUrl, farmerMessage);
          agentsUsed.push('Visual');
          console.log('   ✅ Photo analyzed:', visualOutput?.detections?.pests?.length || 0, 'detections');
        } catch (visualError) {
          console.error('   ❌ Visual Agent failed, continuing without image analysis:', visualError);
          agentsUsed.push('Visual_FALLBACK');
          // Continue without visual - not critical
        }
      }
      
      console.log('   ✅ NLU processed:', nluOutput?.intent_classification?.primary_intent || 'GENERAL_QUERY');
      if (visualOutput) {
        console.log('   ✅ Photo analyzed:', visualOutput.detections?.pests?.length || 0, 'detections');
      }
      
      // ========================================
      // PHASE 1B: CONTEXT LOADING (with NLU output) - with error boundary
      // ========================================
      let contextState: ContextState | null = null;
      try {
        contextState = await this.loadContext(sessionId, farmerId, tenantId, farmerMessage, nluOutput!);
        agentsUsed.push('Context');
        console.log('   ✅ Context loaded:', contextState?.current_state || 'INITIAL_QUERY');
      } catch (contextError) {
        console.error('   ❌ Context Manager failed, using default context:', contextError);
        contextState = this.createFallbackContext(sessionId, farmerId);
        agentsUsed.push('Context_FALLBACK');
      }
      
      // ========================================
      // PHASE 2: MULTI-MODAL FUSION - with error boundary
      // ========================================
      console.log('\n🔗 PHASE 2: Fusing Multi-Modal Data...');
      
      let fusedIntelligence: FusedIntelligence;
      try {
        fusedIntelligence = await this.fusionEngine.fuse({
          session_id: sessionId,
          timestamp: new Date().toISOString(),
          text_understanding: {
            farmer_message: farmerMessage,
            language: nluOutput!.language_analysis?.detected_language || 'en',
            intent: nluOutput!.intent_classification?.primary_intent || 'GENERAL_QUERY',
            entities: {
              crop_code: nluOutput!.crop_identification?.crop_code,
              pest_code: nluOutput!.entities_extracted?.pest_mentioned?.canonical,
              disease_code: nluOutput!.entities_extracted?.disease_mentioned?.canonical,
              symptom_codes: nluOutput!.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || []
            },
            confidence: nluOutput!.understanding_quality?.overall_confidence || 0.5,
            ambiguities: nluOutput!.clarification_strategy?.questions_to_ask?.map((q: any) => q.question_text_en) || []
          },
          visual_analysis: visualOutput ? {
            image_id: options.photoUrl || '',
            quality_score: visualOutput.quality_assessment?.overall_quality || 0.7,
            detections: {
              pests: visualOutput.detections?.pests,
              diseases: visualOutput.detections?.diseases,
              symptoms: visualOutput.detections?.symptoms,
              beneficial_insects: visualOutput.detections?.beneficial_insects
            },
            severity_quantification: {
              pest_density: visualOutput.severity_quantification?.pest_density,
              disease_severity_index: visualOutput.severity_quantification?.disease_severity_index,
              affected_area_percent: visualOutput.severity_quantification?.affected_area_percent
            }
          } : undefined,
          weather_data: await this.fetchWeatherData(sessionId, options.landId),
          historical_data: await this.fetchHistoricalData(farmerId, options.landId)
        });
        agentsUsed.push('Fusion');
        console.log('   ✅ Data fused, confidence:', 
          (fusedIntelligence.fusion_summary.overall_confidence * 100).toFixed(1) + '%');
      } catch (fusionError) {
        console.error('   ❌ Fusion Engine failed, using fallback:', fusionError);
        fusedIntelligence = this.createFallbackFusedIntelligence(sessionId, farmerMessage, nluOutput!);
        agentsUsed.push('Fusion_FALLBACK');
      }
      
      // ========================================
      // PHASE 3: DIAGNOSTIC FLOW MANAGEMENT
      // ========================================
      console.log('\n🧠 PHASE 3: Managing Diagnostic Flow...');
      
      // Create per-request diagnostic controller with required parameters
      const diagnosticController = this.createDiagnosticController(sessionId, farmerId, options.landId);
      
      // Build NLU output with rule mapping for diagnostic controller
      const nluWithRuleMapping = this.buildNLUOutputWithRuleMapping(nluOutput, fusedIntelligence);
      
      // Process through diagnostic flow
      const diagnosticResponse = await diagnosticController.processNLUOutput(nluWithRuleMapping);
      const diagnosticState = {
        mode: this.mapDiagnosticAction(diagnosticResponse.action),
        next_question: diagnosticResponse.questions?.[0]?.question_id,
        hypotheses: diagnosticResponse.evaluation_result ? [{ confidence: 0.7 }] : [],
        session_state: diagnosticResponse.session_state
      };
      
      agentsUsed.push('Diagnostic');
      console.log('   ✅ Diagnostic mode:', diagnosticState.mode);
      
      // Check if we need more information
      if (diagnosticState.mode === 'GATHERING_INFO' && diagnosticState.next_question) {
        return {
          type: 'CLARIFICATION_QUESTION',
          session_id: sessionId,
          question: diagnosticState.next_question,
          metadata: {
            confidence: diagnosticState.hypotheses?.[0]?.confidence || 0,
            safety_status: 'PENDING',
            rules_applied: 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed
          }
        };
      }
      
      if (diagnosticState.mode === 'WAITING_FOR_PHOTO') {
        return {
          type: 'PHOTO_REQUEST',
          session_id: sessionId,
          photo_instructions: {
            text_mr: '📷 कृपया प्रभावित पानाचा/पिकाचा स्पष्ट फोटो पाठवा',
            text_hi: '📷 कृपया प्रभावित पत्ती/फसल का स्पष्ट फोटो भेजें',
            text_en: '📷 Please send a clear photo of the affected leaf/crop',
            tips: [
              'Good lighting',
              'Close-up of affected area',
              'Include healthy part for comparison'
            ]
          },
          metadata: {
            confidence: 0,
            safety_status: 'PENDING',
            rules_applied: 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed
          }
        };
      }
      
      // ========================================
      // PHASE 4: RULE ENGINE EXECUTION
      // ========================================
      console.log('\n⚙️ PHASE 4: Executing Rule Engine...');
      
      const ruleEngineInput = this.buildRuleEngineInput(
        fusedIntelligence,
        diagnosticState,
        contextState,
        { farmerId, landId: options.landId }
      );
      
      const decisionOutput = await this.ruleEngine.execute(ruleEngineInput);
      agentsUsed.push('RuleEngine');
      
      console.log('   ✅ Decision generated:', decisionOutput.status);
      console.log('   ✅ Rules applied:', decisionOutput.rules_applied?.length || 0);
      
      // ========================================
      // PHASE 5: SAFETY VERIFICATION
      // ========================================
      console.log('\n🛡️ PHASE 5: Safety Verification...');
      
      const safetyVerification = await this.safetyGuardian.verifySafety(
        decisionOutput,
        {
          original_input: farmerMessage,
          session_id: sessionId,
          farmer_id: farmerId,
          crop_stage: contextState.crop_context?.stage,
          expected_harvest_date: contextState.crop_context?.expected_harvest_date,
          previous_failed_treatments: contextState.treatment_history?.filter(t => !t.successful).length,
          severity: fusedIntelligence.unified_context?.problem?.severity
        },
        diagnosticState.hypotheses?.[0]?.confidence || 0.7
      );
      
      agentsUsed.push('Safety');
      console.log('   ✅ Safety status:', safetyVerification.safety_check.overall_safety_status);
      
      // Handle emergency
      if (safetyVerification.emergency_protocol?.emergency_detected) {
        return {
          type: 'ESCALATION_REQUIRED',
          session_id: sessionId,
          escalation: {
            level: 'EMERGENCY',
            expert_type: safetyVerification.emergency_protocol.expert_escalation.expert_type || 'SAFETY_OFFICER',
            sla_hours: (safetyVerification.emergency_protocol.expert_escalation.sla_minutes || 30) / 60,
            ...safetyVerification.emergency_protocol.farmer_safety_instructions
          },
          metadata: {
            confidence: 0,
            safety_status: 'EMERGENCY',
            rules_applied: 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed
          }
        };
      }
      
      // Handle safety block
      if (!safetyVerification.approved) {
        return {
          type: 'SAFETY_BLOCKED',
          session_id: sessionId,
          blocked_reason: safetyVerification.blocked_decision ? {
            reason_mr: safetyVerification.blocked_decision.reason_mr,
            reason_hi: safetyVerification.blocked_decision.reason_hi,
            reason_en: safetyVerification.blocked_decision.reason_en
          } : undefined,
          alternatives: safetyVerification.safety_check.safer_alternatives,
          metadata: {
            confidence: diagnosticState.hypotheses?.[0]?.confidence || 0,
            safety_status: 'BLOCKED',
            rules_applied: decisionOutput.rules_applied?.length || 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed
          }
        };
      }
      
      // Handle escalation
      if (safetyVerification.escalation_decision.should_escalate) {
        const escalation = safetyVerification.escalation_decision;
        return {
          type: 'ESCALATION_REQUIRED',
          session_id: sessionId,
          escalation: {
            level: escalation.escalation_level,
            expert_type: escalation.expert_needed.type,
            sla_hours: escalation.expert_needed.sla_response_hours,
            message_mr: `तज्ञांशी संपर्क साधत आहोत. ${escalation.expert_needed.sla_response_hours} तासांत उत्तर मिळेल.`,
            message_hi: `विशेषज्ञ से संपर्क कर रहे हैं। ${escalation.expert_needed.sla_response_hours} घंटे में जवाब मिलेगा।`,
            message_en: `Contacting expert. Response within ${escalation.expert_needed.sla_response_hours} hours.`
          },
          metadata: {
            confidence: diagnosticState.hypotheses?.[0]?.confidence || 0,
            safety_status: 'ESCALATED',
            rules_applied: decisionOutput.rules_applied?.length || 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed
          }
        };
      }
      
      // ========================================
      // PHASE 6: FARMER COMMUNICATION GENERATION
      // ========================================
      console.log('\n💬 PHASE 6: Generating Farmer Communication...');
      
      const farmerProfile = await this.getFarmerProfile(farmerId, options.language);
      
      const farmerCommunication = await this.communicationGenerator.generate(
        safetyVerification.modified_decision,
        farmerProfile,
        {
          issue_urgency: fusedIntelligence.unified_context?.problem?.severity === 'CRITICAL' ? 'CRITICAL' :
                         fusedIntelligence.unified_context?.problem?.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
          previous_failed_treatments: contextState.treatment_history?.filter(t => !t.successful).length || 0,
          questions_asked: contextState.questions_asked || 0
        }
      );
      
      agentsUsed.push('Communication');
      console.log('   ✅ Message generated in', farmerCommunication.language);
      
      // ========================================
      // PHASE 7: SAVE & SCHEDULE FOLLOW-UPS
      // ========================================
      console.log('\n💾 PHASE 7: Saving Decision & Scheduling Follow-ups...');
      
      await this.saveDecisionFlow({
        session_id: sessionId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        land_id: options.landId,
        nlu_output: nluOutput,
        fused_intelligence: fusedIntelligence,
        diagnostic_state: diagnosticState,
        decision_output: decisionOutput,
        safety_verification: safetyVerification,
        farmer_communication: farmerCommunication
      });
      
      console.log('   ✅ Decision saved');
      
      // ========================================
      // PHASE 8: RETURN TO FARMER
      // ========================================
      const processingTime = Date.now() - startTime;
      console.log('\n✅ Orchestrator: Flow complete!');
      console.log(`   Total processing time: ${processingTime}ms\n`);
      
      return {
        type: 'DECISION_PROVIDED',
        session_id: sessionId,
        decision_id: decisionOutput.decision_id,
        communication: farmerCommunication,
        metadata: {
          confidence: diagnosticState.hypotheses?.[0]?.confidence || 0.7,
          safety_status: safetyVerification.safety_check.overall_safety_status,
          rules_applied: decisionOutput.rules_applied?.length || 0,
          processing_time_ms: processingTime,
          agents_used: agentsUsed
        }
      };
      
    } catch (error) {
      console.error('❌ Orchestrator: Error in flow:', error);
      return this.handleOrchestrationError(error as Error, sessionId, farmerMessage, agentsUsed, startTime);
    }
  }
  
  /**
   * Process NLU (now async for AI-powered understanding)
   */
  private async processNLU(
    message: string,
    sessionId: string,
    language?: string
  ): Promise<NLUOutput> {
    return await processNLUAgent({
      raw_input: message,
      conversation_context: {
        previous_turns: [],
        session_state: 'NEW'
      },
      input_metadata: {
        language_detected: (language as 'mr' | 'hi' | 'en') || 'en',
        input_method: 'TEXT',
        timestamp: new Date().toISOString(),
        session_id: sessionId
      }
    });
  }
  
  /**
   * Process Visual Analysis
   */
  private async processVisual(
    photoUrl: string,
    textContext: string
  ): Promise<VisualAnalysisOutput | null> {
    try {
      return await processVisualAgent({
        image_url: photoUrl,
        text_context: textContext
      });
    } catch (error) {
      console.error('Visual analysis failed:', error);
      return null;
    }
  }
  
  /**
   * Load conversation context
   */
  private async loadContext(
    sessionId: string,
    farmerId: string,
    tenantId: string,
    message: string,
    nluOutput?: NLUOutput
  ): Promise<ContextState> {
    try {
      return await processContextManager({
        farmer_id: farmerId,
        land_id: undefined,
        current_input: message,
        input_type: 'TEXT',
        timestamp: new Date().toISOString(),
        nlu_output: nluOutput ? {
          primary_intent: nluOutput.intent_classification?.primary_intent || 'GENERAL_QUERY',
          crop_code: nluOutput.crop_identification?.crop_code,
          symptoms: nluOutput.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [],
          pest_hypothesis: nluOutput.entities_extracted?.pest_mentioned?.canonical,
          disease_hypothesis: nluOutput.entities_extracted?.disease_mentioned?.canonical,
          urgency_level: (nluOutput.intent_classification?.urgency_level as 'HIGH' | 'MEDIUM' | 'LOW') || 'MEDIUM',
          emotional_state: (nluOutput.intent_classification?.emotional_state as any) || 'NEUTRAL',
          confidence: nluOutput.understanding_quality?.overall_confidence || 0.5
        } : {
          primary_intent: 'GENERAL_QUERY',
          symptoms: [],
          urgency_level: 'MEDIUM',
          emotional_state: 'NEUTRAL',
          confidence: 0.5
        }
      }, null, []);
    } catch (error) {
      console.error('Context loading failed:', error);
      // Return minimal context
      return {
        session_id: sessionId,
        current_state: 'INITIAL_QUERY',
        conversation_turn: 1,
        questions_asked: 0
      } as ContextState;
    }
  }
  
  /**
   * Fetch weather data - NOW CONNECTED TO REAL DATA
   */
  private async fetchWeatherData(sessionId: string, landId?: string): Promise<any> {
    try {
      // Try to get land coordinates for weather lookup
      if (landId) {
        const { data: land } = await this.supabase
          .from('lands')
          .select('center_lat, center_lon, district, state')
          .eq('id', landId)
          .single();
        
        if (land?.center_lat && land?.center_lon) {
          // Fetch real weather from weather cache or API
          const { data: weatherCache } = await this.supabase
            .from('weather_cache')
            .select('weather_data')
            .eq('location_key', `${land.center_lat.toFixed(2)}_${land.center_lon.toFixed(2)}`)
            .gte('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (weatherCache?.weather_data) {
            console.log('🌤️ [Orchestrator] Using cached weather data');
            return weatherCache.weather_data;
          }
        }
      }
      
      // Fallback: Return reasonable defaults for Indian agriculture
      console.log('🌤️ [Orchestrator] Using default weather data');
      return {
        current: {
          temperature_c: 28,
          humidity_percent: 65,
          wind_speed_kmh: 12,
          rainfall_last_24h_mm: 0
        },
        forecast_24h: {
          rain_probability_percent: 20,
          temperature_max_c: 32,
          wind_max_kmh: 18
        },
        forecast_72h: []
      };
    } catch (error) {
      console.warn('⚠️ Weather fetch failed:', error);
      return {
        current: { temperature_c: 28, humidity_percent: 65, wind_speed_kmh: 12, rainfall_last_24h_mm: 0 },
        forecast_24h: { rain_probability_percent: 20, temperature_max_c: 32, wind_max_kmh: 18 },
        forecast_72h: []
      };
    }
  }
  
  /**
   * Fetch historical data - NOW CONNECTED TO REAL DATABASE
   */
  private async fetchHistoricalData(farmerId: string, landId?: string): Promise<any> {
    try {
      const result: any = {
        previous_issues: [],
        soil_test_results: null,
        recent_advisories: []
      };
      
      // Fetch soil data from lands table
      if (landId) {
        const { data: land } = await this.supabase
          .from('lands')
          .select('soil_data, ndvi_data, previous_crop, last_harvest_date')
          .eq('id', landId)
          .single();
        
        if (land?.soil_data) {
          result.soil_test_results = land.soil_data;
        }
        if (land?.ndvi_data) {
          result.ndvi_data = land.ndvi_data;
        }
        if (land?.previous_crop) {
          result.previous_crop = land.previous_crop;
          result.last_harvest_date = land.last_harvest_date;
        }
      }
      
      // Fetch recent advisory history
      const { data: recentAdvisories } = await this.supabase
        .from('advisory_audit_log')
        .select('advisory_id, causes, actions, risk_level, generated_at')
        .eq('farmer_id', farmerId)
        .order('generated_at', { ascending: false })
        .limit(5);
      
      if (recentAdvisories?.length) {
        result.recent_advisories = recentAdvisories;
        result.previous_issues = recentAdvisories.map(a => ({
          issue: a.causes?.[0],
          date: a.generated_at,
          severity: a.risk_level
        }));
      }
      
      return result;
    } catch (error) {
      console.warn('⚠️ Historical data fetch failed:', error);
      return { previous_issues: [], soil_test_results: null };
    }
  }
  
  /**
   * Build rule engine input from fused data
   */
  private buildRuleEngineInput(
    fused: FusedIntelligence,
    diagnostic: DiagnosticState,
    context: ContextState,
    ids: { farmerId: string; landId?: string }
  ): RuleExecutionInput {
    return {
      session_id: fused.session_id,
      confirmed_hypotheses: diagnostic.hypotheses || [],
      rule_modules_required: diagnostic.rule_modules_required || [],
      
      farmer_context: {
        crop_code: fused.unified_context?.crop?.code || context.crop_context?.code || 'UNKNOWN',
        crop_variety: context.crop_context?.variety,
        crop_stage: (fused.unified_context?.crop?.stage || context.crop_context?.stage || 'VEGETATIVE') as any,
        days_after_sowing: fused.unified_context?.crop?.days_after_sowing || 45,
        land_size_acres: context.land_context?.size_acres || 1,
        farming_mode: 'CONVENTIONAL'
      },
      
      field_conditions: {
        soil_type: (context.land_context?.soil_type || 'BLACK') as any,
        soil_moisture_percent: fused.unified_context?.field_conditions?.soil_moisture?.value as number,
        ndvi: context.land_context?.ndvi
      },
      
      environmental_context: {
        current_weather: fused.unified_context?.environmental?.current_weather || {
          temperature_c: 28,
          humidity_percent: 65,
          wind_speed_kmh: 12
        },
        weather_forecast_24h: fused.unified_context?.environmental?.weather_forecast_24h || {
          rain_probability_percent: 20,
          temperature_max_c: 32
        },
        season: (fused.unified_context?.environmental?.season || 'KHARIF') as any,
        region_code: context.land_context?.region_code || 'MH'
      },
      
      pest_disease_state: {
        pest_code: fused.unified_context?.problem?.primary_cause,
        affected_area_percent: fused.unified_context?.problem?.affected_area_percent || 20,
        severity: (fused.unified_context?.problem?.severity || 'MODERATE') as any
      },
      
      farmer_constraints: {
        budget_available_inr: 5000,
        previous_treatments: context.treatment_history || [],
        urgency_level: fused.unified_context?.problem?.severity === 'CRITICAL' ? 'CRITICAL' : 'MEDIUM'
      }
    };
  }
  
  /**
   * Get farmer profile
   */
  private async getFarmerProfile(
    farmerId: string,
    preferredLanguage?: string
  ): Promise<FarmerProfile> {
    try {
      const { data } = await this.supabase
        .from('farmers')
        .select('full_name, language_preference, education_level')
        .eq('id', farmerId)
        .single();
      
      return {
        preferred_language: (preferredLanguage || data?.language_preference || 'mr') as 'mr' | 'hi' | 'en',
        name: data?.full_name || 'शेतकरी',
        literacy_level: (data?.education_level || 'MODERATE') as any,
        technical_knowledge: 'MODERATE',
        emotional_state: 'NEUTRAL'
      };
    } catch {
      return {
        preferred_language: (preferredLanguage || 'mr') as 'mr' | 'hi' | 'en',
        name: 'शेतकरी',
        literacy_level: 'MODERATE',
        technical_knowledge: 'MODERATE',
        emotional_state: 'NEUTRAL'
      };
    }
  }
  
  /**
   * Save complete decision flow
   */
  private async saveDecisionFlow(data: {
    session_id: string;
    farmer_id: string;
    tenant_id: string;
    land_id?: string;
    nlu_output: NLUOutput;
    fused_intelligence: FusedIntelligence;
    diagnostic_state: DiagnosticState;
    decision_output: DecisionOutput;
    safety_verification: SafetyVerificationResult;
    farmer_communication: FarmerCommunication;
  }): Promise<void> {
    try {
      await this.supabase.from('agricultural_decisions').insert({
        decision_id: data.decision_output.decision_id,
        session_id: data.session_id,
        farmer_id: data.farmer_id,
        tenant_id: data.tenant_id,
        land_id: data.land_id,
        
        // Store complete flow data
        nlu_output: data.nlu_output,
        fused_intelligence: data.fused_intelligence,
        diagnostic_state: data.diagnostic_state,
        decision_output: data.decision_output,
        safety_verification: {
          status: data.safety_verification.safety_check.overall_safety_status,
          approved: data.safety_verification.approved
        },
        
        // Indexed fields
        status: data.decision_output.status,
        action_type: data.decision_output.primary_decision?.action_type,
        confidence: data.diagnostic_state.hypotheses?.[0]?.confidence,
        
        created_at: new Date().toISOString()
      });
      
      // Schedule follow-ups
      if (data.decision_output.follow_up_schedule) {
        await this.scheduleFollowUps(
          data.session_id,
          data.decision_output.decision_id,
          data.farmer_id,
          data.decision_output.follow_up_schedule
        );
      }
    } catch (error) {
      console.error('Failed to save decision flow:', error);
    }
  }
  
  /**
   * Schedule follow-up reminders
   */
  private async scheduleFollowUps(
    sessionId: string,
    decisionId: string,
    farmerId: string,
    schedule: any
  ): Promise<void> {
    const now = new Date();
    const followUps = [];
    
    if (schedule.day_3) {
      followUps.push({
        session_id: sessionId,
        decision_id: decisionId,
        farmer_id: farmerId,
        day: 3,
        scheduled_for: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING'
      });
    }
    
    if (schedule.day_7) {
      followUps.push({
        session_id: sessionId,
        decision_id: decisionId,
        farmer_id: farmerId,
        day: 7,
        scheduled_for: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING'
      });
    }
    
    if (followUps.length > 0) {
      await this.supabase.from('scheduled_followups').insert(followUps);
    }
  }
  
  /**
   * Build NLU output with rule mapping for diagnostic controller
   * CRITICAL GAP 1 FIX: Now properly calls resolveRuleModules() to populate requiredRuleModules
   */
  private buildNLUOutputWithRuleMapping(nluOutput: NLUOutput, fused: FusedIntelligence): any {
    // Extract intent for rule resolution
    const intent = (nluOutput.intent_classification?.primary_intent || 'GENERAL_QUERY') as NLUIntent;
    
    // Build extracted entities from NLU output + fused intelligence
    const entities: ExtractedEntities = {
      crop_code: fused.unified_context?.crop?.name || nluOutput.crop_identification?.crop_code,
      crop_stage: fused.unified_context?.crop?.growth_stage as any,
      pest_code: nluOutput.entities_extracted?.pest_mentioned?.canonical,
      disease_code: nluOutput.entities_extracted?.disease_mentioned?.canonical,
      affected_area_percent: fused.visual_analysis?.severity_quantification?.affected_area_percent || 20,
      product_mentioned: nluOutput.entities_extracted?.product_mentioned?.raw_text,
      symptom_codes: nluOutput.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [],
      region_code: fused.historical_data?.region_code,
      severity: (nluOutput.intent_classification?.urgency_level || 'MODERATE') as any,
      treatment_history: undefined // Could be populated from context
    };
    
    // Build safety alerts from NLU output
    const safetyAlerts: SafetyAlerts = {
      emergency_detected: nluOutput.safety_signals?.emergency_indicators?.length > 0 || false,
      banned_substance_mentioned: nluOutput.safety_signals?.banned_chemicals_mentioned?.length > 0 || false,
      high_toxicity_product: nluOutput.safety_signals?.high_toxicity_warning || false,
      phi_concern: nluOutput.safety_signals?.harvest_imminent || false,
      pollinator_risk: false,
      weather_spray_block: false
    };
    
    // CRITICAL FIX: Call resolveRuleModules to get required rule modules
    const requiredRuleModules = resolveRuleModules(intent, entities, safetyAlerts);
    console.log(`📋 Resolved ${requiredRuleModules.length} rule modules for intent: ${intent}`);
    
    // Determine what additional context is needed
    const contextNeeded = determineContextRequirements(intent, entities, requiredRuleModules);
    
    // Generate clarification questions if needed
    const ruleQuestions = generateRuleRequiredQuestions(intent, entities, requiredRuleModules);
    
    // Calculate understanding confidence
    const understanding_confidence = nluOutput.understanding_quality?.overall_confidence || 0.5;
    const clarity_score = nluOutput.understanding_quality?.entity_coverage || 0.5;
    
    return {
      intent,
      language: nluOutput.language_analysis?.detected_language || 'mr',
      entities,
      clarification_needed: nluOutput.clarification_strategy?.needs_clarification || 
                           ruleQuestions.length > 0,
      questions: ruleQuestions.length > 0 ? ruleQuestions : 
        (nluOutput.clarification_strategy?.questions_to_ask || []).map((q: any, i: number) => ({
          question_id: `q_${i}`,
          question_text_mr: q.question_text_mr || q,
          question_text_hi: q.question_text_hi || q,
          question_text_en: q.question_text_en || q,
          priority: 'MEDIUM' as const
        })),
      contextNeeded: {
        photo_required: contextNeeded.photo_required,
        weather_data_required: contextNeeded.weather_data_required,
        soil_data_required: contextNeeded.soil_data_required,
        crop_stage_required: contextNeeded.crop_stage_required
      },
      safety_alerts: safetyAlerts,
      // CRITICAL: This was always empty - now properly populated
      requiredRuleModules,
      // Additional fields for diagnostic flow
      understanding_confidence,
      clarity_score
    };
  }
  
  /**
   * Create fallback NLU output when NLU agent fails (Gap 6 fix)
   */
  private createFallbackNLUOutput(message: string, language?: 'mr' | 'hi' | 'en'): NLUOutput {
    console.log('   📋 Creating fallback NLU output for message:', message.substring(0, 30));
    return {
      language_analysis: {
        detected_language: language || 'mr',
        confidence: 0.5,
        script: 'DEVANAGARI',
        has_code_mixing: false
      },
      intent_classification: {
        primary_intent: 'GENERAL_QUERY',
        secondary_intent: undefined,
        urgency_level: 'MEDIUM',
        confidence: 0.3
      },
      crop_identification: undefined,
      entities_extracted: {
        pest_mentioned: undefined,
        disease_mentioned: undefined,
        product_mentioned: undefined,
        quantity_mentioned: undefined,
        time_mentioned: undefined
      },
      symptom_extraction: {
        visual_symptoms: [],
        non_visual_symptoms: [],
        symptom_confidence: 0.3
      },
      safety_signals: {
        emergency_indicators: [],
        banned_chemicals_mentioned: [],
        high_toxicity_warning: false,
        harvest_imminent: false
      },
      understanding_quality: {
        overall_confidence: 0.3,
        entity_coverage: 0.2,
        needs_clarification: true,
        clarity_issues: ['NLU processing failed - using fallback']
      },
      clarification_strategy: {
        needs_clarification: true,
        questions_to_ask: [{
          question_text_mr: 'कृपया तुमची समस्या पुन्हा सांगा',
          question_text_hi: 'कृपया अपनी समस्या फिर से बताएं',
          question_text_en: 'Please describe your problem again'
        }]
      }
    } as NLUOutput;
  }
  
  /**
   * Map diagnostic action to mode
   */
  private mapDiagnosticAction(action: string): string {
    switch (action) {
      case 'ASK_CLARIFICATION': return 'GATHERING_INFO';
      case 'REQUEST_PHOTO': return 'WAITING_FOR_PHOTO';
      case 'RECOMMEND': return 'READY_TO_RECOMMEND';
      case 'BLOCK': return 'BLOCKED';
      case 'ESCALATE': return 'ESCALATED';
      default: return 'READY_TO_RECOMMEND';
    }
  }
  
  /**
   * Create fallback context when Context Manager fails (Gap 6 fix)
   */
  private createFallbackContext(sessionId: string, farmerId: string): ContextState {
    console.log('   📋 Creating fallback context');
    return {
      session_id: sessionId,
      farmer_id: farmerId,
      current_state: 'INITIAL_QUERY',
      conversation_turns: 0,
      crop_context: undefined,
      questions_asked: 0,
      treatment_history: [],
      last_updated: new Date().toISOString()
    } as ContextState;
  }
  
  /**
   * Create fallback fused intelligence when Fusion Engine fails (Gap 6 fix)
   */
  private createFallbackFusedIntelligence(sessionId: string, message: string, nluOutput: NLUOutput): FusedIntelligence {
    console.log('   📋 Creating fallback fused intelligence');
    return {
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      text_understanding: {
        farmer_message: message,
        language: nluOutput.language_analysis?.detected_language || 'mr',
        intent: nluOutput.intent_classification?.primary_intent || 'GENERAL_QUERY',
        entities: {},
        confidence: 0.3,
        ambiguities: ['Fusion failed - using fallback']
      },
      unified_context: {
        crop: undefined,
        problem: undefined,
        environment: undefined
      },
      fusion_summary: {
        overall_confidence: 0.3,
        data_sources_used: ['text_fallback'],
        gaps_identified: ['visual', 'weather', 'historical'],
        recommendations_for_improvement: ['Please provide more details']
      }
    } as FusedIntelligence;
  }

  /**
   * Handle orchestration errors
   */
  private handleOrchestrationError(
    error: Error,
    sessionId: string,
    farmerMessage: string,
    agentsUsed: string[],
    startTime: number
  ): OrchestratorResponse {
    // Log error
    this.supabase.from('system_errors').insert({
      session_id: sessionId,
      error_type: error.name,
      error_message: error.message,
      farmer_input: farmerMessage,
      stack_trace: error.stack,
      created_at: new Date().toISOString()
    }).then(() => {});
    
    return {
      type: 'SYSTEM_ERROR',
      session_id: sessionId,
      error: {
        message: 'तांत्रिक समस्या आली आहे. कृपया पुन्हा प्रयत्न करा.',
        fallback_advice: 'तज्ञांशी संपर्क साधा किंवा काही वेळाने पुन्हा प्रयत्न करा.'
      },
      metadata: {
        confidence: 0,
        safety_status: 'ERROR',
        rules_applied: 0,
        processing_time_ms: Date.now() - startTime,
        agents_used: agentsUsed
      }
    };
  }
}

export const orchestrator = new AIAgentOrchestrator();
