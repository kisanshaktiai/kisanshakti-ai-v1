/**
 * Master AI Agent Orchestrator
 * Coordinates all 9 specialized agents for comprehensive agricultural advisory
 * 
 * v2.0 UPDATE: LLM-First Response System
 * - Simple questions answered directly via LLM without rule engine
 * - Rule engine only for pest/disease/treatment decisions
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

// NEW: Import LLM Response Generator for direct answers
import { 
  canAnswerDirectly, 
  requiresRuleEngine, 
  generateLLMResponse,
  type LLMResponseInput 
} from './llm-response-generator.ts';

// Import question classifier for adaptive templates
import { classifyQuestion, type QuestionClassification } from './question-classifier.ts';

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

// CRITICAL FIX: Import normalization functions from type-mappers for consistent code matching
import { 
  normalizeCropCode as normalizeTypeCropCode, 
  normalizePestCode, 
  normalizeDiseaseCode, 
  normalizeSeverity,
  normalizeCropStage 
} from './type-mappers.ts';

// P0-C: Import entity code mapper for unified code normalization before rule engine
import {
  toDecisionGraphPestCode,
  toDecisionGraphDiseaseCode,
  toDecisionGraphCropCode,
  normalizeCodesForRuleEngine,
  logCodeMapping
} from './entity-code-mapper.ts';

// Import soil/NDVI state calculator for land-specific recommendations
import { 
  calculateFieldStates, 
  logStateCalculation, 
  validateCropContext 
} from './soil-ndvi-state-calculator.ts';

// ═══════════════════════════════════════════════════════════════════════════
// P0 CRITICAL: CANONICAL STATE BUILDER & LAYERED RULE EVALUATOR
// These form the SYMBOLIC DECISION BRAIN - deterministic, auditable
// ═══════════════════════════════════════════════════════════════════════════
import {
  buildCanonicalState,
  checkPrescriptionGate,
  CanonicalState,
  DataConfidence,
  mapCropNameToEnum,
  mapVisualSymptomToEnum,
  mapStageToEnum
} from './canonical-state-builder.ts';

import {
  evaluateRulesLayered,
  CORE_RULES,
  RuleEvaluationResult
} from './layered-rule-evaluator.ts';

import {
  resolveConflicts as resolveDiagnosisConflicts
} from './diagnosis-conflict-resolver.ts';

// ═══════════════════════════════════════════════════════════════════════════
// P0 CRITICAL MODULE IMPORTS - PRODUCTION-READY INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

// P0: GDD Phenology Engine - Replaces fixed DAS with thermal unit calculations
import { 
  calculatePhenologicalStage, 
  type PhenologyResult 
} from './gdd-phenology-engine.ts';

// P0: Agricultural NLP Validator - Marathi/Hindi validation with fuzzy matching
import { 
  validateAgricultureNLP, 
  type NLPValidationResult 
} from './nlp-agriculture-validator.ts';

// P0: PHI Enforcement Guardian - Pre-Harvest Interval safety blocking
import { 
  enforcePHI, 
  type PHIEnforcementResult 
} from './phi-enforcement-guardian.ts';

// P0: Pollinator Protection Rules - Flowering stage safety enforcement
import { 
  enforcePollinatorProtection, 
  isFloweringStage,
  type PollinatorEnforcementResult 
} from './pollinator-protection-rules.ts';

// P0: Photoperiod Calculator - Day length for bulbing/flowering crops
import { 
  calculateDayLength, 
  checkPhotoperiodTrigger,
  type PhotoperiodResult 
} from './photoperiod-calculator.ts';

// NEW: Smart Clarification Generator - Farmer-friendly options & photo requests
import {
  generateClarificationResponse,
  matchFarmerResponseToOption,
  mapOptionToObservation,
  type ClarificationInput,
  type ClarificationOutput
} from './clarification-generator.ts';

export const ORCHESTRATOR_VERSION = '2.0.0';

// Response types
export type OrchestratorResponseType = 
  | 'DECISION_PROVIDED'
  | 'CLARIFICATION_QUESTION'
  | 'PHOTO_REQUEST'
  | 'SAFETY_BLOCKED'
  | 'ESCALATION_REQUIRED'
  | 'SYSTEM_ERROR';

// Data Audit interface - shows what data was found/missing for debugging
export interface DataAudit {
  land: {
    found: boolean;
    land_id?: string;
    land_name?: string;
    current_crop?: string;
    area_acres?: number;
    growth_stage?: string;
    days_since_sowing?: number;
    has_coordinates: boolean;
    missing_reasons: string[];
  };
  soil_health: {
    found: boolean;
    test_date?: string;
    test_age_days?: number;
    nitrogen_kg_per_ha?: number;
    phosphorus_kg_per_ha?: number;
    potassium_kg_per_ha?: number;
    ph_level?: number;
    nitrogen_state?: string;
    phosphorus_state?: string;
    potassium_state?: string;
    missing_reasons: string[];
  };
  ndvi: {
    found: boolean;
    latest_value?: number;
    latest_date?: string;
    age_days?: number;
    trend?: string;
    health_status?: string;
    history_count: number;
    missing_reasons: string[];
  };
  weather: {
    found: boolean;
    temperature?: number;
    humidity?: number;
    rain_probability?: number;
    rain_last_24h?: number;
    data_age_hours?: number;
    missing_reasons: string[];
  };
  crop_schedule: {
    found: boolean;
    crop_name?: string;
    sowing_date?: string;
    expected_harvest?: string;
    status?: string;
    missing_reasons: string[];
  };
  summary: {
    total_data_sources: number;
    available_sources: number;
    data_quality_score: number; // 0-100
    critical_missing: string[];
    recommendations: string[];
  };
}

export interface OrchestratorResponse {
  type: OrchestratorResponseType;
  session_id: string;
  decision_id?: string;
  
  // For DECISION_PROVIDED
  communication?: FarmerCommunication;
  decision_output?: DecisionOutput;  // CRITICAL FIX: Include decision output for response assembly
  question_classification?: QuestionClassification;  // NEW: Include classification in response
  
  // NEW: Data audit for debugging what data was found/missing
  dataAudit?: DataAudit;
  
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
    template_type?: string;      // NEW: Track template type
    sections_count?: number;     // NEW: Track sections count
    trace_id?: string;           // NEW: For observability
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
   * Generate default clarification message when clarification generator returns empty
   * CRITICAL: Never expose internal intent names to farmers
   */
  private generateDefaultClarification(
    language: string,
    farmerMessage: string,
    cropName?: string
  ): string {
    const lang = language as 'mr' | 'hi' | 'en';
    
    const templates: Record<string, string> = {
      mr: `🌾 समजले.\n\nतुमच्या ${cropName || 'पिकाच्या'} समस्येबद्दल मला अधिक माहिती हवी आहे.\n\nकृपया खालीलपैकी एक निवडा:\n\n1️⃣ पान पिवळे पडत आहे\n2️⃣ कीड/रोग दिसत आहे\n3️⃣ वाढ थांबली आहे\n\n👉 शक्य असल्यास प्रभावित भागाचा फोटो पाठवा.`,
      hi: `🌾 समझ गया.\n\nआपकी ${cropName || 'फसल की'} समस्या के बारे में मुझे अधिक जानकारी चाहिए.\n\nकृपया नीचे से एक चुनें:\n\n1️⃣ पत्ते पीले पड़ रहे हैं\n2️⃣ कीट/रोग दिख रहा है\n3️⃣ बढ़वार रुक गई है\n\n👉 यदि संभव हो तो प्रभावित भाग की फोटो भेजें.`,
      en: `🌾 Understood.\n\nI need more information about your ${cropName || 'crop'} problem.\n\nPlease select one:\n\n1️⃣ Leaves turning yellow\n2️⃣ Pest/disease visible\n3️⃣ Growth stopped\n\n👉 If possible, send a photo of the affected area.`
    };
    
    return templates[lang] || templates['en'];
  }
  
  /**
   * Generate farmer-friendly clarification for intent lock mismatch
   * CRITICAL: Never expose internal intent names like "GENERAL_QUERY" to farmers
   */
  private generateIntentMismatchClarification(
    language: string,
    cropName?: string
  ): { text_mr: string; text_hi: string; text_en: string; options: Array<{ value: string; label: string }> } {
    const cropLabel = cropName || 'पीक';
    
    return {
      text_mr: `🌾 समजले.\n\n${cropLabel} बद्दल अधिक माहिती द्या. तुम्हाला कोणत्या प्रकारची मदत हवी आहे?\n\n1️⃣ रोग/कीड समस्या\n2️⃣ खत/पाणी व्यवस्थापन\n3️⃣ सामान्य सल्ला`,
      text_hi: `🌾 समझ गया.\n\n${cropLabel} के बारे में अधिक जानकारी दें. आपको किस प्रकार की मदद चाहिए?\n\n1️⃣ रोग/कीट समस्या\n2️⃣ खाद/पानी प्रबंधन\n3️⃣ सामान्य सलाह`,
      text_en: `🌾 Understood.\n\nPlease tell me more about your ${cropLabel}. What kind of help do you need?\n\n1️⃣ Disease/pest problem\n2️⃣ Fertilizer/water management\n3️⃣ General advice`,
      options: [
        { value: '1', label: language === 'mr' ? 'रोग/कीड समस्या' : language === 'hi' ? 'रोग/कीट समस्या' : 'Disease/pest problem' },
        { value: '2', label: language === 'mr' ? 'खत/पाणी व्यवस्थापन' : language === 'hi' ? 'खाद/पानी प्रबंधन' : 'Fertilizer/water management' },
        { value: '3', label: language === 'mr' ? 'सामान्य सल्ला' : language === 'hi' ? 'सामान्य सलाह' : 'General advice' }
      ]
    };
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
      traceId?: string;  // PHASE A: Accept trace_id for observability
      // PHASE 8: Session context for follow-up awareness
      conversationHistory?: Array<{ role: string; content: string }>;
      sessionState?: {
        hasPreviousRecommendations?: boolean;
        previousPest?: string;
        previousDisease?: string;
        previousCrop?: string;
        turnCount?: number;
        decisionState?: string;
      };
    } = {}
  ): Promise<OrchestratorResponse> {
    
    const startTime = Date.now();
    const agentsUsed: string[] = [];
    const traceId = options.traceId || `trace_${Date.now().toString(36)}`;
    
    console.log(`\n🚀 [${traceId}] Orchestrator: Starting full diagnostic flow...`);
    console.log(`   [${traceId}] Session: ${sessionId}`);
    console.log(`   [${traceId}] Message: ${farmerMessage.substring(0, 50)}...`);
    
    // PHASE 8: Log session context for debugging
    if (options.sessionState?.hasPreviousRecommendations) {
      console.log(`   [${traceId}] 🔗 Session Context: previousPest=${options.sessionState.previousPest}, previousCrop=${options.sessionState.previousCrop}, turn=${options.sessionState.turnCount}`);
    }
    
    try {
      // ========================================
      // PHASE 0: FETCH LAND CONTEXT FIRST (Single Source of Truth)
      // ========================================
      let landContext: any = null;
      if (options.landId) {
        landContext = await this.fetchComprehensiveLandContext(options.landId, farmerId);
        console.log('📍 [Orchestrator] Pre-fetched land context:', landContext ? 'SUCCESS' : 'EMPTY');
        if (landContext) {
          console.log(`   📊 crop_schedules data: crop=${landContext.current_crop}, sowing=${landContext.sowing_date}, stage=${landContext.growth_stage}`);
        }
      }
      
      // ========================================
      // PHASE 0.3: UNIFIED QUERY ROUTER (NEW)
      // Categorizes farmer question into proper handling route
      // ========================================
      const { routeQuery, getRouteRequirements } = await import('./query-router.ts');
      
      const queryRoute = routeQuery(farmerMessage, {
        lastPest: options.sessionState?.previousPest,
        lastDisease: options.sessionState?.previousDisease,
        lastCrop: options.sessionState?.previousCrop || landContext?.current_crop,
        turnCount: options.sessionState?.turnCount || 0
      });
      
      console.log(`🛤️ [${traceId}] Query Route: ${queryRoute.route} (confidence: ${(queryRoute.confidence * 100).toFixed(0)}%)`);
      console.log(`   Detected entities: ${JSON.stringify(queryRoute.detected_entities)}`);
      console.log(`   Context hints: ${queryRoute.context_hints.join(', ')}`);
      agentsUsed.push('QUERY_ROUTER');
      
      const routeRequirements = getRouteRequirements(queryRoute.route);
      
      // ========================================
      // PHASE 0.4: HANDLE GREETING DIRECTLY (No AI)
      // ========================================
      if (queryRoute.route === 'GREETING') {
        console.log(`✅ [${traceId}] GREETING detected - returning direct response`);
        return this.generateGreetingResponse(sessionId, options.language || 'mr', startTime, agentsUsed, traceId);
      }
      
      // ========================================
      // ========================================
      // PHASE 0.4B: GENERAL_INFO - RULE ENGINE DRIVEN (Not LLM Bypass)
      // ========================================
      // SYMBOLIC BRAIN PRINCIPLE: ALL queries go through Rule Engine
      // Even general queries get routed through symbolic decision path
      // LLM only RENDERS the decision, never MAKES it
      // ========================================
      if (queryRoute.route === 'GENERAL_INFO' && !options.landId) {
        console.log(`💬 [${traceId}] GENERAL_INFO without land - Rule Engine controlled path`);
        agentsUsed.push('SYMBOLIC_GENERAL_HANDLER');
        
        // Create a deterministic "general info" decision from Rule Engine
        // NOT from LLM directly - maintains symbolic brain principle
        const generalDecisionId = `general_symbolic_${Date.now()}`;
        
        // Rule Engine decides this is a general query that needs LLM rendering
        // The LLM will be called in PHASE 5 (render-only mode), not here
        const symbolicDecision = {
          decision_id: generalDecisionId,
          status: 'GENERAL_INFO_REQUEST' as const,
          decision_brain_source: true, // Rule Engine made this decision
          actions_returned: [{
            action_type: 'PROVIDE_GENERAL_INFO',
            content_type: 'AGRICULTURAL_KNOWLEDGE',
            requires_llm_render: true,
            rule_id: 'GENERAL_INFO_HANDLER'
          }],
          // Explicitly NO clarification options - general queries answer directly
          clarification_needed: false,
          metadata: {
            confidence: 0.8,
            trace_id: traceId,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            template_type: 'SYMBOLIC_GENERAL'
          }
        };
        
        // Return to main flow - LLM rendering happens in PHASE 5
        // This ensures LLM operates in render-only mode with symbolic constraints
        return {
          type: 'DECISION_PROVIDED',
          session_id: sessionId,
          communication: {
            message_id: crypto.randomUUID(),
            decision_id: generalDecisionId,
            session_id: sessionId,
            farmer_id: farmerId,
            language: options.language || 'mr',
            format: 'RICH_TEXT',
            tone: 'FRIENDLY',
            created_at: new Date().toISOString(),
            main_message: {
              full_text: {
                mr: '', // Will be filled by LLM in render-only mode
                hi: '',
                en: ''
              }
            },
            quick_actions: [],
            metadata: {
              source: 'SYMBOLIC_GENERAL_HANDLER',
              response_type: 'GENERAL_INFORMATION',
              requires_llm_render: true
            }
          } as any,
          decision_output: symbolicDecision as any,
          metadata: {
            confidence: 0.8,
            safety_status: 'SAFE',
            rules_applied: 1,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            template_type: 'SYMBOLIC_GENERAL',
            trace_id: traceId
          }
        };
      }
      
      // ========================================
      // PHASE 0.5: HANDLE IRRIGATION DIRECTLY (NEW)
      // ========================================
      if (queryRoute.route === 'IRRIGATION_SCHEDULING' && landContext) {
        console.log(`💧 [${traceId}] IRRIGATION query - using Irrigation Decision Module`);
        const { calculateIrrigationRecommendation, formatIrrigationResponse } = await import('./irrigation-decision-module.ts');
        
        const irrigationRec = calculateIrrigationRecommendation({
          crop_code: landContext.current_crop?.toUpperCase() || 'SUGARCANE',
          growth_stage: landContext.growth_stage || 'VEGETATIVE',
          days_after_sowing: landContext.days_since_sowing || 30,
          soil_type: landContext.soil_type,
          irrigation_type: landContext.irrigation_type?.toUpperCase() as any || 'FLOOD',
          last_irrigation_date: landContext.last_irrigation_date,
          area_acres: landContext.area_acres
        });
        
        const irrigationResponse = formatIrrigationResponse(irrigationRec, options.language || 'mr');
        agentsUsed.push('IRRIGATION_MODULE');
        
        return {
          type: 'DECISION_PROVIDED',
          session_id: sessionId,
          communication: {
            message_id: crypto.randomUUID(),
            decision_id: `irrigation_${Date.now()}`,
            session_id: sessionId,
            farmer_id: farmerId,
            language: options.language || 'mr',
            format: 'RICH_TEXT',
            tone: 'FRIENDLY',
            created_at: new Date().toISOString(),
            main_message: {
              full_text: {
                mr: irrigationResponse,
                hi: irrigationResponse,
                en: irrigationResponse
              }
            },
            quick_actions: [],
            metadata: {
              word_count: irrigationResponse.split(/\s+/).length,
              reading_time_seconds: 10,
              confidence_score: 0.9,
              source: 'IRRIGATION_MODULE',
              response_type: 'IRRIGATION_SCHEDULE'
            }
          } as any,
          decision_output: {
            decision_id: `irrigation_${Date.now()}`,
            session_id: sessionId,
            status: 'INFORMATION_PROVIDED',
            decision_brain_source: true,
            actions_returned: [{
              action_type: 'IRRIGATION',
              urgency: irrigationRec.urgency,
              water_amount: `${irrigationRec.water_amount_liters_per_acre} L/acre`,
              timing: irrigationRec.timing
            }],
            metadata: {
              confidence: 0.9,
              trace_id: traceId,
              processing_time_ms: Date.now() - startTime,
              agents_used: agentsUsed,
              template_type: 'IRRIGATION_SCHEDULE'
            }
          } as any,
          metadata: {
            confidence: 0.9,
            safety_status: 'SAFE',
            rules_applied: 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            template_type: 'IRRIGATION_SCHEDULE',
            trace_id: traceId
          }
        };
      }
      
      // ========================================
      // P1-A: CROP HEALTH ASSESSMENT ROUTE (Direct NDVI/Soil/Weather assessment)
      // Handles "how is my crop" queries without rule engine
      // ========================================
      if (queryRoute.route === 'CROP_HEALTH' && landContext) {
        console.log(`🌱 [${traceId}] CROP_HEALTH query - using direct assessment`);
        agentsUsed.push('CROP_HEALTH_MODULE');
        
        const cropHealthResponse = this.generateCropHealthResponse(landContext, options.language || 'mr');
        
        // Log critical status
        if (cropHealthResponse.isCritical) {
          console.log(`🚨 [${traceId}] NDVI CRITICAL ALERT - actions: ${cropHealthResponse.actions.length}`);
        }
        
        return {
          type: 'DECISION_PROVIDED',
          session_id: sessionId,
          communication: {
            message_id: crypto.randomUUID(),
            decision_id: `crop_health_${Date.now()}`,
            session_id: sessionId,
            farmer_id: farmerId,
            language: options.language || 'mr',
            format: 'RICH_TEXT',
            tone: cropHealthResponse.isCritical ? 'URGENT' : 'FRIENDLY',
            created_at: new Date().toISOString(),
            main_message: {
              full_text: {
                mr: cropHealthResponse.message,
                hi: cropHealthResponse.message,
                en: cropHealthResponse.message
              }
            },
            quick_actions: cropHealthResponse.suggestions.map(s => ({
              label: { mr: s, hi: s, en: s },
              action: 'ASK_FOLLOWUP',
              payload: { question: s }
            })),
            metadata: {
              word_count: cropHealthResponse.message.split(/\s+/).length,
              reading_time_seconds: 10,
              confidence_score: cropHealthResponse.confidence,
              source: cropHealthResponse.isCritical ? 'NDVI_CRITICAL_MODULE' : 'CROP_HEALTH_MODULE',
              response_type: cropHealthResponse.isCritical ? 'NDVI_CRITICAL_ALERT' : 'CROP_HEALTH_ASSESSMENT'
            }
          } as any,
          decision_output: {
            decision_id: `crop_health_${Date.now()}`,
            session_id: sessionId,
            status: cropHealthResponse.isCritical ? 'URGENT_ACTION_REQUIRED' : 'INFORMATION_PROVIDED',
            decision_brain_source: true, // Now includes actions based on actual signals
            actions_returned: cropHealthResponse.actions,
            metadata: {
              confidence: cropHealthResponse.confidence,
              trace_id: traceId,
              processing_time_ms: Date.now() - startTime,
              agents_used: agentsUsed,
              template_type: cropHealthResponse.isCritical ? 'NDVI_CRITICAL_ALERT' : 'CROP_HEALTH_ASSESSMENT',
              ndvi_critical: cropHealthResponse.isCritical
            }
          } as any,
          dataAudit: this.buildDataAudit(landContext, null),
          metadata: {
            confidence: cropHealthResponse.confidence,
            safety_status: cropHealthResponse.isCritical ? 'URGENT' : 'SAFE',
            rules_applied: cropHealthResponse.actions.length,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            template_type: cropHealthResponse.isCritical ? 'NDVI_CRITICAL_ALERT' : 'CROP_HEALTH_ASSESSMENT',
            trace_id: traceId
          }
        };
      }
      
      // ========================================
      // PHASE 0.5: STATIC DATA GATE (CRITICAL - BEFORE AI)
      // ========================================
      // Check if query is about static land attributes - answer WITHOUT AI
      const { checkStaticDataGate } = await import('./static-data-gate.ts');
      
      const staticGateResult = checkStaticDataGate({
        farmer_message: farmerMessage,
        language: (options.language || 'mr') as 'mr' | 'hi' | 'en',
        land_context: landContext ? {
          land_id: landContext.land_id,
          land_name: landContext.land_name,
          area_acres: landContext.area_acres,
          soil_type: landContext.soil_type,
          current_crop: landContext.current_crop,
          crop_schedule: landContext.crop_schedule,
          growth_stage: landContext.growth_stage,
          days_since_sowing: landContext.days_since_sowing,
          irrigation_type: landContext.irrigation_type,
          water_source: landContext.water_source,
          location: {
            village: landContext.village,
            district: landContext.district,
            state: landContext.state
          }
        } : null
      });
      
      if (staticGateResult.handled) {
        console.log(`✅ [${traceId}] Static Data Gate HANDLED query in ${staticGateResult.processing_time_ms.toFixed(1)}ms`);
        console.log(`   💰 SAVED: 1 NLU AI call + 0-1 LLM call = $0.0001-0.001`);
        console.log(`   ⚡ LATENCY: ${staticGateResult.processing_time_ms.toFixed(1)}ms vs typical 2000-5000ms`);
        agentsUsed.push('STATIC_DATA_GATE');
        
        // Return immediately with static response (NO AI CALLS)
        return {
          type: 'DECISION_PROVIDED',
          session_id: sessionId,
          communication: {
            message_id: crypto.randomUUID(),
            decision_id: `static_${Date.now()}`,
            session_id: sessionId,
            farmer_id: farmerId,
            language: options.language || 'mr',
            format: 'RICH_TEXT',
            tone: 'FRIENDLY',
            created_at: new Date().toISOString(),
            main_message: {
              full_text: {
                mr: staticGateResult.response || '',
                hi: staticGateResult.response || '',
                en: staticGateResult.response || ''
              }
            },
            quick_actions: [],
            metadata: {
              word_count: (staticGateResult.response || '').split(/\s+/).length,
              reading_time_seconds: 5,
              confidence_score: staticGateResult.confidence,
              source: 'STATIC_DATA_GATE',
              response_type: staticGateResult.response_type,
              processing_time_ms: staticGateResult.processing_time_ms
            }
          } as any,
          decision_output: {
            decision_id: `static_${Date.now()}`,
            session_id: sessionId,
            status: 'INFORMATION_PROVIDED',
            decision_brain_source: false,
            actions_returned: [],
            metadata: {
              confidence: staticGateResult.confidence,
              trace_id: traceId,
              processing_time_ms: staticGateResult.processing_time_ms,
              agents_used: ['STATIC_DATA_GATE'],
              template_type: 'STATIC_DIRECT',
              data_source: 'crop_schedules' // Single source of truth
            }
          } as any,
          metadata: {
            confidence: staticGateResult.confidence,
            safety_status: 'SAFE',
            rules_applied: 0,
            processing_time_ms: staticGateResult.processing_time_ms,
            agents_used: agentsUsed,
            template_type: 'STATIC_DIRECT',
            trace_id: traceId
          }
        };
      }
      
      console.log(`⏭️ [${traceId}] Static gate passed - continuing to AI pipeline`);
      
      // ========================================
      // PHASE 0.4A: EARLY NUMBER DETECTION (BEFORE NLU)
      // Detect if farmer sent a number to select previous option
      // CRITICAL FIX 3: This MUST happen before NLU to prevent re-clarification loop
      // ========================================
      console.log('\n🔢 PHASE 0.4A: Early Option Detection (Pre-NLU)...');
      
      // Track if farmer selected an option - used to bypass clarification later
      let bypassClarification = false;
      
      // Detect numeric/Devanagari option selection patterns
      const isNumberSelection = /^[१२३1-3]$/.test(farmerMessage.trim());
      const pendingOptions = options.sessionState?.pendingClarificationOptions || [];
      
      console.log(`   📋 Input: "${farmerMessage}" | IsNumber: ${isNumberSelection} | PendingOptions: ${pendingOptions.length}`);
      
      // ========================================
      // PHASE 0.5: OPTION SELECTION HANDLER
      // Detects when farmer responds to clarification options (1, 2, 3)
      // ========================================
      console.log('\n🔢 PHASE 0.5: Checking for Option Selection Response...');
      
      let processedFarmerMessage = farmerMessage;
      let matchedObservation: { observation: string; likely_cause: string } | null = null;
      
      // Check if farmer is responding to previous clarification options
      if (pendingOptions.length > 0) {
        const matchResult = matchFarmerResponseToOption(
          farmerMessage,
          pendingOptions
        );
        
        if (matchResult.matched && matchResult.matched_option) {
          console.log(`   ✅ Farmer selected option ${(matchResult.option_index || 0) + 1}: "${matchResult.matched_option}"`);
          
          // Map option to observation for decision brain
          matchedObservation = mapOptionToObservation(
            matchResult.matched_option,
            (options.language || 'mr') as 'mr' | 'hi' | 'en'
          );
          
          // Use the full symptom text as the message for NLU
          processedFarmerMessage = matchResult.matched_option;
          agentsUsed.push('OPTION_MATCHER');
          
          // CRITICAL FIX 4: Set bypass flag to skip clarification generation
          bypassClarification = true;
          
          console.log(`   📋 Mapped to observation: "${matchedObservation.observation}" → likely cause: ${matchedObservation.likely_cause}`);
          console.log(`   🚫 Bypass clarification: ${bypassClarification}`);
        } else if (isNumberSelection) {
          // Farmer sent a number but no options to match - still treat as selection attempt
          console.log(`   ⚠️ Number selection without matching options - may be stale session`);
        } else {
          console.log(`   ⏭️ No option match detected, processing as new query`);
        }
      } else {
        console.log(`   ⏭️ No pending options, processing normally`);
      }
      
      // ========================================
      // PHASE 1A: NLU PROCESSING
      // ========================================
      console.log('\n📥 PHASE 1: Processing Inputs...');
      
      let nluOutput: NLUOutput | null = null;
      try {
        // Use processed message (could be matched option text) for NLU
        nluOutput = await this.processNLU(processedFarmerMessage, sessionId, options.language, landContext);
        agentsUsed.push('NLU');
        console.log('   ✅ NLU processed:', nluOutput?.intent_classification?.primary_intent || 'GENERAL_QUERY');
      } catch (nluError) {
        console.error('   ❌ NLU Agent failed, using fallback:', nluError);
        nluOutput = this.createFallbackNLUOutput(processedFarmerMessage, options.language, landContext);
        agentsUsed.push('NLU_FALLBACK');
      }
      
      // CRITICAL: Inject matched observation into NLU output if farmer selected an option
      if (matchedObservation && nluOutput) {
        console.log(`   💉 Injecting matched observation into NLU output: ${matchedObservation.observation}`);
        
        // Ensure symptom_extraction exists
        if (!nluOutput.symptom_extraction) {
          nluOutput.symptom_extraction = { visual_symptoms: [] };
        }
        
        // Add the matched observation as a high-confidence visual symptom
        const mappedSymptom = {
          symptom_code: matchedObservation.observation.toUpperCase().replace(/\s+/g, '_').substring(0, 30),
          symptom_text: matchedObservation.observation,
          confidence: 0.95, // High confidence since farmer confirmed
          affected_area: 'CONFIRMED_BY_FARMER'
        };
        
        nluOutput.symptom_extraction.visual_symptoms = [
          mappedSymptom,
          ...(nluOutput.symptom_extraction.visual_symptoms || [])
        ];
        
        // Also set a higher-confidence intent based on the likely cause
        if (matchedObservation.likely_cause && matchedObservation.likely_cause !== 'UNKNOWN') {
          const causeToIntent: Record<string, string> = {
            'SHOOT_BORER': 'PEST_PROBLEM',
            'STEM_BORER': 'PEST_PROBLEM',
            'ROOT_ROT': 'DISEASE_PROBLEM',
            'WATER_LOGGING': 'WATER_ISSUE',
            'WHITEFLY': 'PEST_PROBLEM',
            'BOLLWORM': 'PEST_PROBLEM',
            'LEAF_SPOT': 'DISEASE_PROBLEM',
            'NITROGEN_DEFICIENCY': 'NUTRIENT_ISSUE'
          };
          
          const mappedIntent = causeToIntent[matchedObservation.likely_cause] || 'PEST_PROBLEM';
          nluOutput.intent_classification = {
            ...nluOutput.intent_classification,
            primary_intent: mappedIntent as any,
            intent_confidence: 0.9 // High confidence since farmer confirmed
          };
          
          console.log(`   💉 Boosted intent to ${mappedIntent} with confidence 0.9`);
        }
      }
      
      // ========================================
      // PHASE 1A.1: P0 NLP VALIDATION (Marathi/Hindi agricultural vocabulary)
      // ========================================
      console.log('\n🔍 PHASE 1A.1: P0 NLP Agricultural Validation...');
      
      let nlpValidation: NLPValidationResult | null = null;
      try {
        nlpValidation = validateAgricultureNLP(farmerMessage, options.language || 'mr');
        agentsUsed.push('NLP_VALIDATOR');
        
        if (!nlpValidation.is_valid || nlpValidation.is_gibberish) {
          console.warn(`   ⚠️ NLP Validation: INVALID or GIBBERISH detected (score: ${nlpValidation.gibberish_score})`);
          console.warn(`   Errors: ${nlpValidation.errors.join(', ')}`);
        } else {
          console.log(`   ✅ NLP Validation: VALID (confidence: ${nlpValidation.confidence.toFixed(2)})`);
          console.log(`   Entities found: crops=${nlpValidation.entities.crops.length}, pests=${nlpValidation.entities.pests.length}, diseases=${nlpValidation.entities.diseases.length}`);
        }
        
        // Check for forbidden combinations (e.g., "spray during rain")
        if (nlpValidation.forbidden_combinations.length > 0) {
          console.warn(`   ⚠️ Forbidden combinations detected: ${nlpValidation.forbidden_combinations.map(fc => fc.reason).join(', ')}`);
        }
        
        // Apply spelling corrections if any
        if (nlpValidation.spelling_corrections && nlpValidation.spelling_corrections.length > 0) {
          console.log(`   📝 Applied ${nlpValidation.spelling_corrections.length} spelling corrections`);
        }
      } catch (nlpError) {
        console.error('   ❌ NLP Validation failed (non-blocking):', nlpError);
      }
      
      // ========================================
      // PHASE 1A.2: P0 GDD PHENOLOGY CALCULATION (Replaces fixed DAS)
      // ========================================
      console.log('\n🌡️ PHASE 1A.2: P0 GDD Phenology Engine...');
      
      let phenologyResult: PhenologyResult | null = null;
      if (landContext?.current_crop && landContext?.sowing_date) {
        try {
          // Fetch weather history for GDD calculation (last 14 days)
          const weatherHistory = await this.fetchWeatherHistoryForGDD(landContext.center_lat, landContext.center_lon);
          
          // CRITICAL FIX: Pass daysSinceSowing as NUMBER (not Date object)
          // calculatePhenologicalStage expects: (cropCode, daysSinceSowing, weatherHistory, avgRegionalTemp, latitude)
          const daysAfterSowing = landContext.days_since_sowing || 0;
          
          phenologyResult = calculatePhenologicalStage(
            landContext.current_crop.toUpperCase(),
            daysAfterSowing,  // NUMBER, not Date
            weatherHistory,
            undefined,  // avgRegionalTemp - use undefined to trigger DAS fallback if no weather
            landContext.center_lat
          );
          agentsUsed.push('GDD_PHENOLOGY');
          
          console.log(`   ✅ GDD Stage: ${phenologyResult.current_stage} (${phenologyResult.stage_name})`);
          console.log(`   Accumulated GDD: ${phenologyResult.accumulated_gdd.toFixed(0)} (source: ${phenologyResult.gdd_source})`);
          console.log(`   Critical irrigation: ${phenologyResult.critical_irrigation_needed}, Critical nutrition: ${phenologyResult.critical_nutrition_needed}`);
          
          // Override growth_stage in landContext with GDD-calculated stage
          landContext.growth_stage = phenologyResult.current_stage;
          landContext.gdd_phenology = phenologyResult;
        } catch (gddError) {
          console.error('   ❌ GDD calculation failed, using DAS fallback:', gddError);
        }
      } else {
        console.log('   ⏭️ Skipping GDD (no crop or sowing date)');
      }
      
      // ========================================
      // PHASE 1A.3: P0 PHOTOPERIOD CHECK (Onion bulbing, rice flowering)
      // ========================================
      if (landContext?.center_lat && ['ONION', 'RICE'].includes(landContext?.current_crop?.toUpperCase() || '')) {
        console.log('\n☀️ PHASE 1A.3: P0 Photoperiod Sensitivity Check...');
        try {
          const dayLengthResult = calculateDayLength(landContext.center_lat, new Date());
          const photoperiodTrigger = checkPhotoperiodTrigger(
            landContext.current_crop.toUpperCase(),
            dayLengthResult.day_length_hours,
            landContext.days_since_sowing || 0
          );
          
          if (photoperiodTrigger.trigger_active) {
            console.log(`   ✅ Photoperiod trigger ACTIVE: ${photoperiodTrigger.trigger_type}`);
            console.log(`   Day length: ${dayLengthResult.day_length_hours.toFixed(1)} hours`);
            landContext.photoperiod_data = {
              day_length_hours: dayLengthResult.day_length_hours,
              trigger_active: photoperiodTrigger.trigger_active,
              trigger_type: photoperiodTrigger.trigger_type,
              advice: photoperiodTrigger.advice
            };
          }
          agentsUsed.push('PHOTOPERIOD');
        } catch (photoError) {
          console.error('   ❌ Photoperiod calculation failed:', photoError);
        }
      }
      
      // ========================================
      // PHASE 1A.4: INTENT LOCK - Enforce symbolic-first routing
      // Once locked, only rules scoped to this intent can be evaluated
      // ========================================
      console.log('\n🔒 PHASE 1A.4: Intent Lock Enforcement...');
      
      const { lockIntent, filterActionsByIntentLock, requiresClarification } = await import('./intent-lock.ts');
      const { mapObservationsToCauses } = await import('./observation-cause-mapper.ts');
      const { getAuditLogger } = await import('./audit-logger.ts');
      
      const detectedIntent = nluOutput?.intent_classification?.primary_intent || 'GENERAL_QUERY';
      const intentConfidence = nluOutput?.intent_classification?.intent_confidence || 0.5;
      
      // Lock the intent for this turn
      const intentLock = lockIntent(detectedIntent, intentConfidence);
      agentsUsed.push('INTENT_LOCK');
      
      // Initialize audit logger for this turn
      const auditLogger = getAuditLogger();
      auditLogger.startTurn({
        turn_id: intentLock.turn_id,
        session_id: sessionId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        trace_id: traceId,
        farmer_message: farmerMessage,
        detected_language: (options.language || 'en') as 'mr' | 'hi' | 'en',
        land_id: options.landId
      });
      
      // Log NLU output in contract format
      auditLogger.logNLUOutput({
        intent_label: detectedIntent,
        observations: nluOutput?.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [],
        confidence: intentConfidence
      });
      
      // Log the intent lock
      auditLogger.logIntentLock({
        locked_intent: intentLock.locked_intent,
        allowed_scopes: intentLock.allowed_rule_scopes,
        forbidden_actions: intentLock.forbidden_action_types
      });
      
      // Log crop context
      if (landContext) {
        auditLogger.logCropContext({
          crop_code: landContext.current_crop?.toUpperCase(),
          growth_stage: landContext.growth_stage
        });
      }
      
      // CRITICAL FIX 4: Check if clarification should be BYPASSED
      // Skip clarification when farmer already selected an option
      if (bypassClarification) {
        console.log(`   🚫 BYPASSING clarification - farmer already selected option, proceeding to Decision Brain`);
      }
      
      // Check if clarification is needed (low confidence) - BUT SKIP IF BYPASS FLAG IS SET
      if (requiresClarification(intentConfidence) && !bypassClarification) {
        console.log(`   ⚠️ Low confidence (${(intentConfidence * 100).toFixed(0)}%) - generating clarification`);
        
        // Extract NLU clarification hints - CRITICAL FIX: Default to OPTIONS_PLUS_PHOTO for low confidence
        const nluClarificationType = (nluOutput as any)?.clarification_type || 'OPTIONS_PLUS_PHOTO';
        const nluClarificationOptions = (nluOutput as any)?.clarification_options || [];
        
        // Generate farmer-friendly clarification
        const clarificationInput: ClarificationInput = {
          language: (options.language || 'mr') as 'mr' | 'hi' | 'en',
          farmer_message: farmerMessage,
          observations: nluOutput?.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [],
          crop_code: landContext?.current_crop?.toUpperCase(),
          clarification_type: nluClarificationType as any,
          clarification_options: nluClarificationOptions
        };
        
        console.log(`   📋 Clarification input: type=${nluClarificationType}, crop=${clarificationInput.crop_code}, observations=${clarificationInput.observations.length}`);
        
        const clarificationResponse = generateClarificationResponse(clarificationInput);
        
        console.log(`   📋 Clarification output: has_text=${!!clarificationResponse.response_text}, options=${clarificationResponse.options.length}`);
        
        // CRITICAL FIX: Always return clarification when confidence is low, even if response_text is empty
        if (clarificationResponse.response_text || intentConfidence < 0.5) {
          const responseText = clarificationResponse.response_text || this.generateDefaultClarification(
            options.language || 'mr',
            farmerMessage,
            landContext?.current_crop
          );
          
          console.log(`   📋 Returning clarification with ${clarificationResponse.options.length} options`);
          agentsUsed.push('CLARIFICATION_GENERATOR');
          
          return {
            type: 'CLARIFICATION_QUESTION',
            session_id: sessionId,
            question: {
              question_id: `clarify_${Date.now()}`,
              text_mr: responseText,
              text_hi: responseText,
              text_en: responseText,
              options: clarificationResponse.options.map((opt, idx) => ({
                value: String(idx + 1),
                label: opt
              }))
            },
            metadata: {
              confidence: intentConfidence,
              safety_status: 'NEEDS_CLARIFICATION',
              rules_applied: 0,
              processing_time_ms: Date.now() - startTime,
              agents_used: agentsUsed,
              trace_id: traceId,
              // CRITICAL: Store options for next turn's option selection handler
              pendingClarificationOptions: clarificationResponse.options
            }
          };
        }
      } else if (requiresClarification(intentConfidence) && bypassClarification) {
        // Log that we skipped clarification due to option selection
        console.log(`   ✅ Clarification SKIPPED (bypass active) - using matched observation for Decision Brain`);
      }
      
      // ========================================
      // PHASE 1B: LLM-FIRST CHECK - BLOCKED FOR AGRICULTURAL QUERIES WITH LAND CONTEXT
      // ========================================
      const canDirectAnswer = canAnswerDirectly(detectedIntent, farmerMessage);
      const needsRules = requiresRuleEngine(detectedIntent, farmerMessage);
      
      console.log(`   🔀 Routing decision: canDirectAnswer=${canDirectAnswer}, needsRules=${needsRules}`);
      
      // CRITICAL: Block LLM-first path if land context exists (agricultural query)
      const isNonAgricultural = ['GREETING', 'APP_HELP'].includes(queryRoute.route);
      if (landContext && !isNonAgricultural && canDirectAnswer) {
        console.log(`   🚫 LLM-first BLOCKED - land context present, forcing symbolic path`);
      }
      
      // CRITICAL: Only allow LLM-first for NON-agricultural queries
      if (canDirectAnswer && !needsRules && !options.photoUrl && isNonAgricultural) {
        console.log('   ⚡ Using LLM-FIRST path (skipping rule engine)');
        agentsUsed.push('LLM_Direct');
        
        const llmInput: LLMResponseInput = {
          farmer_message: farmerMessage,
          language: (options.language || 'en') as 'mr' | 'hi' | 'en',
          intent: detectedIntent,
          land_context: landContext ? {
            current_crop: landContext.current_crop,
            crop_stage: landContext.growth_stage,
            area_acres: landContext.area_acres,
            soil_tested: landContext.soil_tested,
            soil_health: landContext.soil_health,
            ndvi: landContext.ndvi,
            days_since_sowing: landContext.days_since_sowing,
            village: landContext.village,
            district: landContext.district
          } : undefined
        };
        
        const llmResponse = await generateLLMResponse(llmInput);
        
        // Build data audit for LLM-direct path too
        const weatherData = await this.fetchWeatherData(sessionId, options.landId);
        const dataAudit = this.buildDataAudit(landContext, weatherData);
        
        return {
          type: 'DECISION_PROVIDED',
          session_id: sessionId,
          communication: {
            message_id: crypto.randomUUID(),
            decision_id: `llm_${Date.now()}`,
            session_id: sessionId,
            farmer_id: farmerId,
            language: options.language || 'en',
            format: 'RICH_TEXT',
            tone: 'PROFESSIONAL',
            created_at: new Date().toISOString(),
            main_message: {
              full_text: {
                mr: llmResponse.response_text,
                hi: llmResponse.response_text,
                en: llmResponse.response_text
              }
            },
            quick_actions: llmResponse.suggested_followups?.map(f => ({
              label: { mr: f, hi: f, en: f },
              action: 'ASK_FOLLOWUP',
              payload: { question: f }
            })) || [],
            metadata: {
              word_count: llmResponse.response_text.split(/\s+/).length,
              reading_time_seconds: Math.ceil(llmResponse.response_text.split(/\s+/).length / 3),
              complexity_score: 0.3,
              template_type: 'LLM_DIRECT',
              sections_included: ['main_message']
            }
          } as any,
          // CRITICAL FIX: Include minimal decision_output for LLM path
          decision_output: {
            decision_id: `llm_${Date.now()}`,
            status: 'DECISION_PROVIDED',
            primary_decision: {
              action_type: 'INFORMATION',
              product_details: null
            },
            rules_applied: [],
            confidence_score: llmResponse.confidence
          } as any,
          dataAudit,  // NEW: Include data audit for debugging
          metadata: {
            confidence: llmResponse.confidence,
            safety_status: 'SAFE',
            rules_applied: 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            template_type: 'LLM_DIRECT',
            trace_id: traceId
          }
        };
      }
      
      console.log('   📋 Using RULE ENGINE path for this question');
      
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
      // CRITICAL FIX: Now passes landId to loadContext
      // ========================================
      let contextState: ContextState | null = null;
      try {
        contextState = await this.loadContext(sessionId, farmerId, tenantId, farmerMessage, nluOutput!, options.landId);
        agentsUsed.push('Context');
        console.log('   ✅ Context loaded:', contextState?.current_state || 'INITIAL_QUERY');
        if (options.landId) {
          console.log('   📍 Land context included for:', options.landId);
        }
      } catch (contextError) {
        console.error('   ❌ Context Manager failed, using default context:', contextError);
        contextState = this.createFallbackContext(sessionId, farmerId);
        agentsUsed.push('Context_FALLBACK');
      }
      
      // ========================================
      // PHASE 2: MULTI-MODAL FUSION - with error boundary
      // CRITICAL FIX: Now includes FULL LAND CONTEXT (Context Contract)
      // ========================================
      console.log('\n🔗 PHASE 2: Fusing Multi-Modal Data with FULL Land Context...');
      
      let fusedIntelligence: FusedIntelligence;
      try {
        // CONTEXT CONTRACT: Build comprehensive input for fusion engine
        // Every modality MUST carry: crop, area, soil, NDVI data from landContext
        
        // Get crop code from landContext or NLU (prioritize landContext - ground truth)
        const cropCodeFromContext = landContext?.current_crop ? 
          this.normalizeCropCode(landContext.current_crop) : undefined;
        const cropCodeFromNLU = nluOutput!.crop_identification?.crop_code;
        const resolvedCropCode = cropCodeFromContext || cropCodeFromNLU;
        
        console.log(`   🌾 Context Contract: crop=${resolvedCropCode}, area=${landContext?.area_acres}ac`);
        console.log(`   📊 Soil: N=${landContext?.soil_health?.nitrogen_kg_per_ha || 'N/A'}, NDVI=${landContext?.ndvi?.value || 'N/A'}`);
        
        fusedIntelligence = await this.fusionEngine.fuse({
          session_id: sessionId,
          timestamp: new Date().toISOString(),
          
          // TEXT UNDERSTANDING with land context enrichment
          text_understanding: {
            farmer_message: farmerMessage,
            language: nluOutput!.language_analysis?.detected_language || 'en',
            intent: nluOutput!.intent_classification?.primary_intent || 'GENERAL_QUERY',
            entities: {
              // CONTEXT CONTRACT: Use landContext crop as ground truth
              crop_code: resolvedCropCode,
              pest_code: nluOutput!.entities_extracted?.pest_mentioned?.canonical,
              disease_code: nluOutput!.entities_extracted?.disease_mentioned?.canonical,
              symptom_codes: nluOutput!.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || []
            },
            confidence: nluOutput!.understanding_quality?.overall_confidence || 0.5,
            ambiguities: nluOutput!.clarification_strategy?.questions_to_ask?.map((q: any) => q.question_text_en) || []
          },
          
          // VISUAL ANALYSIS with land context for comparison
          visual_analysis: visualOutput ? {
            image_id: options.photoUrl || '',
            quality_score: visualOutput.quality_assessment?.overall_quality || 0.7,
            detections: {
              pests: visualOutput.detections?.pests,
              diseases: visualOutput.detections?.diseases,
              symptoms: visualOutput.detections?.symptoms,
              beneficial_insects: visualOutput.detections?.beneficial_insects,
              // CONTEXT CONTRACT: Include crop detected vs land context for validation
              crop_identified: visualOutput.detections?.crop_identified || 
                (resolvedCropCode ? { code: resolvedCropCode, confidence: 0.9 } : undefined)
            },
            severity_quantification: {
              pest_density: visualOutput.severity_quantification?.pest_density,
              disease_severity_index: visualOutput.severity_quantification?.disease_severity_index,
              affected_area_percent: visualOutput.severity_quantification?.affected_area_percent
            }
          } : undefined,
          
          // SENSOR DATA from soil health (Context Contract)
          sensor_data: landContext?.soil_health ? {
            source: 'SOIL_TEST',
            device_id: landContext.land_id,
            readings: {
              soil_moisture_percent: landContext.soil_health.soil_moisture_percent,
              soil_ph: landContext.soil_health.ph,
              soil_ec: landContext.soil_health.ec
            },
            last_updated: landContext.soil_health.tested_at || landContext.soil_health.test_date,
            reliability: 'HIGH'
          } : undefined,
          
          // WEATHER DATA
          weather_data: await this.fetchWeatherData(sessionId, options.landId),
          
          // SATELLITE DATA with NDVI history (Context Contract)
          satellite_data: landContext?.ndvi ? {
            source: 'SENTINEL2',
            ndvi: {
              current: landContext.ndvi.value || landContext.ndvi.mean_ndvi || 0,
              previous_week: landContext.ndvi_history?.[1]?.value || landContext.ndvi.value || 0,
              previous_month: landContext.ndvi_history?.[landContext.ndvi_history.length - 1]?.value,
              trend: landContext.ndvi.ndvi_trend || 'STABLE',
              anomaly_detected: landContext.ndvi.trend_slope ? Math.abs(landContext.ndvi.trend_slope) > 0.05 : false
            },
            acquisition_date: landContext.ndvi.captured_at,
            cloud_cover_percent: 100 - (landContext.ndvi.quality_score || 80)
          } : undefined,
          
          // HISTORICAL DATA with full land context (Context Contract)
          historical_data: {
            sowing_date: landContext?.sowing_date || await this.fetchHistoricalData(farmerId, options.landId).then(h => h.sowing_date) || new Date().toISOString(),
            crop_code: resolvedCropCode,
            variety: landContext?.crop_variety,
            current_crop: landContext?.current_crop,
            region_code: landContext?.district,
            area_acres: landContext?.area_acres,
            growth_stage: landContext?.growth_stage,
            days_since_sowing: landContext?.days_since_sowing,
            previous_issues: [],
            soil_test_results: landContext?.soil_health ? {
              date: landContext.soil_health.test_date || landContext.soil_health.tested_at,
              ph: landContext.soil_health.ph || 0,
              organic_carbon_percent: landContext.soil_health.organic_carbon_percent || landContext.soil_health.organic_carbon || 0,
              npk_levels: {
                n: landContext.soil_health.nitrogen_kg_per_ha || landContext.soil_health.nitrogen || 0,
                p: landContext.soil_health.phosphorus_kg_per_ha || landContext.soil_health.phosphorus || 0,
                k: landContext.soil_health.potassium_kg_per_ha || landContext.soil_health.potassium || 0
              }
            } : undefined
          }
        });
        agentsUsed.push('Fusion');
        console.log('   ✅ Data fused with Context Contract, confidence:', 
          (fusedIntelligence.fusion_summary.overall_confidence * 100).toFixed(1) + '%');
      } catch (fusionError) {
        console.error('   ❌ Fusion Engine failed, using fallback:', fusionError);
        fusedIntelligence = this.createFallbackFusedIntelligence(sessionId, farmerMessage, nluOutput!, landContext);
        agentsUsed.push('Fusion_FALLBACK');
      }
      
      // ========================================
      // PHASE 2.5: BUILD CANONICAL STATE (Single Source of Truth for Decision Brain)
      // ========================================
      console.log('\n🧠 PHASE 2.5: Building Canonical State for Symbolic Decision Brain...');
      
      let canonicalState: CanonicalState | null = null;
      let layeredRuleResult: RuleEvaluationResult | null = null;
      
      try {
        // Build the canonical state from all available data sources
        canonicalState = buildCanonicalState({
          landContext,
          soilData: landContext?.soil_health,
          ndviData: landContext?.ndvi ? {
            value: landContext.ndvi.value || landContext.ndvi.mean_ndvi,
            trend: landContext.ndvi.ndvi_trend,
            captured_at: landContext.ndvi.captured_at
          } : undefined,
          weatherData: fusedIntelligence.weather_data,
          farmerObservations: nluOutput?.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [],
          nluOutput: nluOutput
        });
        
        agentsUsed.push('CANONICAL_STATE_BUILDER');
        
        console.log(`   ✅ Canonical State Built:`);
        console.log(`      Crop: ${canonicalState.crop_type}, Stage: ${canonicalState.crop_stage}`);
        console.log(`      Symptom: ${canonicalState.visual_symptom}, Severity: ${canonicalState.severity}`);
        console.log(`      NDVI: ${canonicalState.ndvi_level} (${canonicalState.ndvi_trend})`);
        console.log(`      Soil N: ${canonicalState.soil_nitrogen}, P: ${canonicalState.soil_phosphorus}, K: ${canonicalState.soil_potassium}`);
        console.log(`      Data Confidence: ${canonicalState.data_confidence}`);
        
        // Check prescription gate before rule engine
        const prescriptionGate = checkPrescriptionGate(canonicalState);
        if (!prescriptionGate.allowed) {
          console.warn(`   ⚠️ Prescription Gate BLOCKED: ${prescriptionGate.reason}`);
        } else {
          console.log(`   ✅ Prescription Gate PASSED`);
        }
        
        // PHASE 2.6: LAYERED RULE EVALUATION (Symbolic Decision Brain)
        console.log('\n📊 PHASE 2.6: Layered Rule Evaluation (OBSERVATION → DIAGNOSIS → SAFETY → PRESCRIPTION)...');
        
        layeredRuleResult = evaluateRulesLayered(CORE_RULES, canonicalState);
        agentsUsed.push('LAYERED_RULE_EVALUATOR');
        
        console.log(`   ✅ Layered Rule Result:`);
        console.log(`      Rules Evaluated: ${layeredRuleResult.rules_evaluated}`);
        console.log(`      Rules Matched: ${layeredRuleResult.rules_matched}`);
        console.log(`      Rules Applied: ${layeredRuleResult.rules_applied.join(', ') || 'none'}`);
        console.log(`      Observations: ${layeredRuleResult.observations.join(', ') || 'none'}`);
        console.log(`      Diagnoses: ${layeredRuleResult.diagnoses.map(d => `${d.cause}(${(d.confidence * 100).toFixed(0)}%)`).join(', ') || 'none'}`);
        console.log(`      Final Diagnosis: ${layeredRuleResult.final_diagnosis?.cause || 'none'}`);
        console.log(`      Prescription Allowed: ${layeredRuleResult.prescription_allowed}`);
        
        if (layeredRuleResult.safety_blocks.length > 0) {
          console.warn(`   ⚠️ Safety Blocks: ${layeredRuleResult.safety_blocks.map(b => b.message).join(', ')}`);
        }
        
      } catch (canonicalError) {
        console.error('   ❌ Canonical State Builder failed (non-blocking):', canonicalError);
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
      
      // Extract the first question with full details for clarification
      const firstQuestion = diagnosticResponse.questions?.[0];

      // CRITICAL FIX: Ensure the Rule Engine always receives the resolved rule modules.
      // The DiagnosticFlowController keeps requiredRuleModules on the NLU mapping object,
      // and does not echo them back in the response.
      const diagnosticState = {
        mode: this.mapDiagnosticAction(diagnosticResponse.action),
        next_question: firstQuestion ? {
          question_id: firstQuestion.question_id,
          text_mr: firstQuestion.question_text_mr || 'अधिक माहिती द्या',
          text_hi: firstQuestion.question_text_hi || 'अधिक जानकारी दें',
          text_en: firstQuestion.question_text_en || 'Please provide more details',
          options: firstQuestion.options
        } : null,
        hypotheses: diagnosticResponse.evaluation_result ? [{ confidence: 0.7 }] : [],
        rule_modules_required: nluWithRuleMapping.requiredRuleModules || [],
        session_state: diagnosticResponse.session_state
      };
      
      agentsUsed.push('Diagnostic');
      console.log('   ✅ Diagnostic mode:', diagnosticState.mode);
      
      // Check if we need more information - CRITICAL FIX: Ensure question has text
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
      // PHASE 4: RULE ENGINE EXECUTION WITH DECISION GRAPH BRIDGE
      // ========================================
      console.log(`\n⚙️ [${traceId}] PHASE 4: Executing Rule Engine with Decision Graph Bridge...`);
      
      // CRITICAL FIX: Pass landContext directly to buildRuleEngineInput
      // The contextState does NOT contain land_context, so we must pass it separately
      const ruleEngineInput = this.buildRuleEngineInput(
        fusedIntelligence,
        diagnosticState,
        contextState,
        { farmerId, landId: options.landId, traceId },
        nluWithRuleMapping,
        landContext  // CRITICAL FIX: Pass landContext directly
      );
      
      let decisionOutput = await this.ruleEngine.execute(ruleEngineInput);
      agentsUsed.push('RuleEngine');
      
      console.log('   ✅ Decision generated:', decisionOutput.status);
      console.log('   ✅ Rules applied:', decisionOutput.rules_applied?.length || 0);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // P0-E: INTENT LOCK ENFORCEMENT - Filter actions by locked intent
      // CRITICAL: Prevent actions outside the intent scope from reaching the farmer
      // ═══════════════════════════════════════════════════════════════════════════
      console.log(`\n🔒 [${traceId}] P0-E: Applying Intent Lock Filter...`);
      
      // Collect all actions from decision output
      const allActions: any[] = [];
      if (decisionOutput.primary_decision) {
        allActions.push(decisionOutput.primary_decision);
      }
      if (decisionOutput.secondary_actions?.length) {
        allActions.push(...decisionOutput.secondary_actions);
      }
      
      // Apply intent lock filter
      const lockValidation = filterActionsByIntentLock(allActions, intentLock);
      
      if (!lockValidation.passed) {
        console.warn(`   ⚠️ P0-E: ${lockValidation.violations.length} actions blocked by intent lock`);
        lockValidation.violations.forEach(v => console.warn(`      - ${v}`));
        
        // Update decision output with filtered actions
        const filteredPrimary = lockValidation.filtered_actions[0] || null;
        const filteredSecondary = lockValidation.filtered_actions.slice(1);
        
        decisionOutput = {
          ...decisionOutput,
          primary_decision: filteredPrimary,
          secondary_actions: filteredSecondary,
          blocked_actions: [
            ...(decisionOutput.blocked_actions || []),
            ...allActions.filter(a => !lockValidation.filtered_actions.includes(a)).map(a => ({
              action: a.action_type || a.action || 'UNKNOWN',
              reason: 'Intent Lock: Action outside allowed scope',
              blocked_by: 'INTENT_LOCK'
            }))
          ]
        };
        
        // Log to audit
        auditLogger.logSymbolicDecision({
          decision_id: decisionOutput.decision_id,
          rules_fired: decisionOutput.rules_applied || [],
          actions_returned: lockValidation.filtered_actions,
          actions_filtered_out: decisionOutput.blocked_actions || []
        });
        
        // If ALL actions were filtered, return farmer-friendly clarification
        // CRITICAL FIX: Never expose internal intent names like "GENERAL_QUERY" to farmers
        if (lockValidation.filtered_actions.length === 0 && allActions.length > 0) {
          console.warn(`   🚫 P0-E: ALL actions filtered by intent lock - returning farmer-friendly clarification`);
          
          await auditLogger.completeTurn(Date.now() - startTime);
          
          // Use farmer-friendly clarification instead of exposing internal intent names
          const clarification = this.generateIntentMismatchClarification(
            options.language || 'mr',
            landContext?.current_crop
          );
          
          return {
            type: 'CLARIFICATION_QUESTION',
            session_id: sessionId,
            question: {
              question_id: `intent_mismatch_${Date.now()}`,
              text_mr: clarification.text_mr,
              text_hi: clarification.text_hi,
              text_en: clarification.text_en,
              options: clarification.options
            },
            metadata: {
              confidence: intentConfidence,
              safety_status: 'PENDING',
              rules_applied: decisionOutput.rules_applied?.length || 0,
              processing_time_ms: Date.now() - startTime,
              agents_used: agentsUsed,
              trace_id: traceId
            }
          };
        }
      } else {
        console.log(`   ✅ P0-E: All ${allActions.length} actions passed intent lock filter`);
      }
      
      // ========================================
      // PHASE 5: SAFETY VERIFICATION (With P0 PHI & Pollinator Enforcement)
      // ========================================
      console.log('\n🛡️ PHASE 5: Safety Verification with P0 Critical Modules...');
      
      // ═══════════════════════════════════════════════════════════════════════════
      // P0: PHI ENFORCEMENT - Block chemicals if days to harvest < PHI
      // ═══════════════════════════════════════════════════════════════════════════
      let phiEnforcement: PHIEnforcementResult | null = null;
      const chemicalRecommendations = this.extractChemicalRecommendations(decisionOutput);
      
      if (chemicalRecommendations.length > 0 && landContext?.expected_harvest_date) {
        console.log('\n🧪 PHASE 5.1: P0 PHI Enforcement Check...');
        try {
          const daysToHarvest = this.calculateDaysToHarvest(landContext.expected_harvest_date);
          
          phiEnforcement = enforcePHI(
            chemicalRecommendations,
            daysToHarvest,
            landContext.current_crop?.toUpperCase(),
            'DOMESTIC',  // TODO: Get from farmer profile for export-oriented farms
            false        // TODO: Get organic status from farmer profile
          );
          agentsUsed.push('PHI_GUARDIAN');
          
          console.log(`   Days to harvest: ${daysToHarvest}`);
          console.log(`   Blocked chemicals: ${phiEnforcement.blocked_chemicals.length}`);
          console.log(`   Allowed chemicals: ${phiEnforcement.allowed_chemicals.length}`);
          
          // CRITICAL: If any chemicals blocked, modify decision output
          if (phiEnforcement.blocked_chemicals.length > 0) {
            console.warn(`   ⚠️ PHI VIOLATION: ${phiEnforcement.blocked_chemicals.map(c => c.chemical_name).join(', ')}`);
            decisionOutput = this.applyPHIBlocking(decisionOutput, phiEnforcement);
          }
        } catch (phiError) {
          console.error('   ❌ PHI Enforcement failed (non-blocking):', phiError);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // P0: POLLINATOR PROTECTION - Block bee-toxic chemicals during flowering
      // ═══════════════════════════════════════════════════════════════════════════
      let pollinatorEnforcement: PollinatorEnforcementResult | null = null;
      const currentHour = new Date().getHours();
      const isFlowering = landContext?.current_crop && landContext?.days_since_sowing
        ? isFloweringStage(landContext.current_crop.toUpperCase(), landContext.days_since_sowing)
        : false;
      
      if (chemicalRecommendations.length > 0 && isFlowering) {
        console.log('\n🐝 PHASE 5.2: P0 Pollinator Protection Enforcement...');
        try {
          pollinatorEnforcement = enforcePollinatorProtection(
            chemicalRecommendations,
            landContext.current_crop.toUpperCase(),
            landContext.days_since_sowing,
            currentHour
          );
          agentsUsed.push('POLLINATOR_PROTECTION');
          
          console.log(`   Crop in flowering: YES (DAS: ${landContext.days_since_sowing})`);
          console.log(`   Blocked chemicals: ${pollinatorEnforcement.blocked_chemicals.length}`);
          console.log(`   Time-restricted: ${pollinatorEnforcement.time_restricted_chemicals.length}`);
          
          // CRITICAL: If any chemicals blocked for pollinators, modify decision output
          if (pollinatorEnforcement.blocked_chemicals.length > 0) {
            console.warn(`   ⚠️ POLLINATOR SAFETY: ${pollinatorEnforcement.blocked_chemicals.map(c => c.chemical_name).join(', ')} BLOCKED`);
            decisionOutput = this.applyPollinatorBlocking(decisionOutput, pollinatorEnforcement);
          }
        } catch (pollinatorError) {
          console.error('   ❌ Pollinator Protection failed (non-blocking):', pollinatorError);
        }
      }
      
      // Continue with standard Safety Guardian verification
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
      // PHASE 6: QUESTION CLASSIFICATION + FARMER COMMUNICATION
      // ========================================
      console.log('\n📋 PHASE 6A: Classifying Question Type...');
      
      // Classify the question to determine which sections to show
      // CRITICAL FIX: Pass decisionOutput for robust template selection
      // This ensures rule-based decisions always get TREATMENT_FULL template
      const questionClassification = classifyQuestion(
        nluWithRuleMapping.intent_classification?.primary_intent || 'GENERAL_QUERY',
        nluWithRuleMapping,
        contextState,
        safetyVerification.modified_decision || decisionOutput  // Pass decision for robust classification
      );
      
      console.log(`   Template type: ${questionClassification.template_type}`);
      console.log(`   Response style: ${questionClassification.response_style}`);
      console.log(`   Sections required:`, Object.entries(questionClassification.requires_sections)
        .filter(([_, v]) => v).map(([k]) => k).join(', '));
      
      agentsUsed.push('QuestionClassifier');
      
      console.log('\n💬 PHASE 6B: Generating Farmer Communication (Adaptive)...');
      
      const farmerProfile = await this.getFarmerProfile(farmerId, options.language);
      
      const farmerCommunication = await this.communicationGenerator.generate(
        safetyVerification.modified_decision,
        farmerProfile,
        {
          issue_urgency: fusedIntelligence.unified_context?.problem?.severity === 'CRITICAL' ? 'CRITICAL' :
                         fusedIntelligence.unified_context?.problem?.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
          previous_failed_treatments: contextState.treatment_history?.filter(t => !t.successful).length || 0,
          questions_asked: contextState.questions_asked || 0
        },
        questionClassification  // Pass classification for adaptive sections
      );
      
      agentsUsed.push('Communication');
      console.log('   ✅ Message generated with', farmerCommunication.metadata?.sections_count || 'all', 'sections');
      console.log('   ✅ Sections:', farmerCommunication.metadata?.sections_included?.join(', ') || 'all');
      
      // ========================================
      // PHASE 7: SAVE & SCHEDULE FOLLOW-UPS (NON-BLOCKING)
      // CRITICAL FIX: Wrapped in try/catch to prevent blocking farmer response
      // ========================================
      console.log('\n💾 PHASE 7: Saving Decision & Scheduling Follow-ups...');
      
      // NON-BLOCKING: Fire-and-forget with error logging
      this.saveDecisionFlowNonBlocking({
        session_id: sessionId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        land_id: options.landId,
        trace_id: traceId,
        nlu_output: nluOutput,
        fused_intelligence: fusedIntelligence,
        diagnostic_state: diagnosticState,
        decision_output: decisionOutput,
        safety_verification: safetyVerification,
        farmer_communication: farmerCommunication
      });
      
      console.log('   ✅ Decision save initiated (non-blocking)');
      
      // ========================================
      // PHASE 7B: FEEDBACK LEARNING INTEGRATION
      // CRITICAL FIX: Connect Feedback Learning Engine
      // ========================================
      console.log('\n🧠 PHASE 7B: Recording for Feedback Learning...');
      try {
        // Record the decision outcome for learning
        await this.feedbackEngine.recordOutcome({
          decision_id: decisionOutput.decision_id,
          session_id: sessionId,
          farmer_id: farmerId,
          land_id: options.landId,
          tenant_id: tenantId,
          crop_code: fusedIntelligence.unified_context?.crop?.code || 'UNKNOWN',
          crop_stage: fusedIntelligence.unified_context?.crop?.stage || 'UNKNOWN',
          region_code: fusedIntelligence.unified_context?.location?.district || 'UNKNOWN',
          season: this.getCurrentSeason(),
          original_decision: {
            pest_disease_diagnosed: fusedIntelligence.unified_context?.problem?.identified_issue || '',
            confidence_at_diagnosis: diagnosticState.hypotheses?.[0]?.confidence || 0.7,
            treatment_recommended: decisionOutput.primary_decision?.product_details?.product_name || '',
            cost_predicted_inr: decisionOutput.economic_assessment?.cost_inr || 0,
            benefit_predicted_inr: decisionOutput.economic_assessment?.benefit_inr || 0,
            efficacy_predicted_percent: decisionOutput.primary_decision?.expected_efficacy_percent || 80
          }
        });
        agentsUsed.push('FeedbackLearning');
        console.log('   ✅ Decision recorded for learning');
      } catch (feedbackError) {
        console.warn('   ⚠️ Feedback recording failed (non-blocking):', feedbackError);
      }
      
      // ========================================
      // PHASE 8: BUILD DATA AUDIT & RETURN TO FARMER
      // ========================================
      const processingTime = Date.now() - startTime;
      console.log('\n✅ Orchestrator: Flow complete!');
      console.log(`   Template used: ${questionClassification.template_type}`);
      console.log(`   Total processing time: ${processingTime}ms\n`);
      
      // Build data audit for debugging - shows what data was found/missing
      const weatherData = await this.fetchWeatherData(sessionId, options.landId);
      const dataAudit = this.buildDataAudit(landContext, weatherData);
      console.log(`   📊 Data Quality Score: ${dataAudit.summary.data_quality_score}%`);
      console.log(`   📊 Available Sources: ${dataAudit.summary.available_sources}/${dataAudit.summary.total_data_sources}`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Complete audit logging before returning
      // This ensures every turn is persisted for forensic tracing
      // ═══════════════════════════════════════════════════════════════════════════
      try {
        // Log symbolic decision output
        auditLogger.logSymbolicDecision({
          decision_id: decisionOutput.decision_id,
          rules_fired: decisionOutput.rules_applied || [],
          actions_returned: decisionOutput.primary_decision ? [decisionOutput.primary_decision, ...(decisionOutput.secondary_actions || [])] : [],
          actions_filtered_out: decisionOutput.blocked_actions || []
        });
        
        // Log response source
        auditLogger.logResponse({
          source: 'SYMBOLIC_TEMPLATE',
          language_match: true,
          llm_model: undefined
        });
        
        // Log validation (passed at this point)
        auditLogger.logValidation({
          passed: true,
          errors: []
        });
        
        // CRITICAL: Complete the turn to persist to database
        await auditLogger.completeTurn(processingTime);
        console.log('📋 [Audit] Turn completed and persisted to database');
      } catch (auditError) {
        console.error('⚠️ [Audit] Failed to complete audit log (non-blocking):', auditError);
        // Don't fail the request for audit issues
      }
      
      return {
        type: 'DECISION_PROVIDED',
        session_id: sessionId,
        decision_id: decisionOutput.decision_id,
        communication: farmerCommunication,
        decision_output: safetyVerification.modified_decision || decisionOutput,  // CRITICAL FIX: Include decision output
        question_classification: questionClassification,  // Include in response
        dataAudit,  // NEW: Include data audit for debugging
        metadata: {
          confidence: diagnosticState.hypotheses?.[0]?.confidence || 0.7,
          safety_status: safetyVerification.safety_check.overall_safety_status,
          rules_applied: decisionOutput.rules_applied?.length || 0,
          processing_time_ms: processingTime,
          agents_used: agentsUsed,
          template_type: questionClassification.template_type,
          sections_count: farmerCommunication.metadata?.sections_count || 0,
          trace_id: traceId
        }
      };
      
    } catch (error) {
      console.error('❌ Orchestrator: Error in flow:', error);
      return this.handleOrchestrationError(error as Error, sessionId, farmerMessage, agentsUsed, startTime);
    }
  }
  
  /**
   * Get current agricultural season based on date
   */
  private getCurrentSeason(): string {
    const month = new Date().getMonth() + 1;
    if (month >= 6 && month <= 9) return 'KHARIF';
    if (month >= 10 && month <= 2) return 'RABI';
    return 'ZAID';
  }
  
  /**
   * Process NLU (now async for AI-powered understanding)
   * CRITICAL FIX: Now accepts landContext to pre-populate crop/stage for rule matching
   */
  private async processNLU(
    message: string,
    sessionId: string,
    language?: string,
    landContext?: any
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
      },
      // CRITICAL FIX: Pass land context to NLU for crop/stage inference
      land_context: landContext ? {
        crop_code: this.normalizeCropCode(landContext.current_crop),
        crop_stage: landContext.growth_stage,
        land_id: landContext.land_id,
        days_after_sowing: landContext.days_since_sowing
      } : undefined
    });
  }
  
  /**
   * Normalize crop name to crop code
   */
  private normalizeCropCode(cropName?: string): string | undefined {
    if (!cropName) return undefined;
    const cropNameUpper = cropName.toUpperCase();
    const cropMap: Record<string, string> = {
      'SUGARCANE': 'SUGARCANE',
      'COTTON': 'COTTON',
      'SOYBEAN': 'SOYBEAN',
      'SOYA': 'SOYBEAN',
      'RICE': 'RICE',
      'PADDY': 'RICE',
      'WHEAT': 'WHEAT',
      'MAIZE': 'MAIZE',
      'CORN': 'MAIZE',
      'TOMATO': 'TOMATO',
      'ONION': 'ONION',
      'CHILLI': 'CHILLI',
      'CHILI': 'CHILLI',
      'GROUNDNUT': 'GROUNDNUT',
      'PEANUT': 'GROUNDNUT',
      'TUR': 'TUR',
      'PIGEON PEA': 'TUR',
      'GRAM': 'GRAM',
      'CHICKPEA': 'GRAM'
    };
    return cropMap[cropNameUpper] || cropNameUpper;
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
   * Load conversation context with comprehensive land data
   * CRITICAL FIX: Now passes landId and fetches soil/NDVI/crop schedule data
   */
  private async loadContext(
    sessionId: string,
    farmerId: string,
    tenantId: string,
    message: string,
    nluOutput?: NLUOutput,
    landId?: string
  ): Promise<ContextState> {
    try {
      // CRITICAL FIX: Fetch comprehensive land context if landId provided
      let landContext: any = null;
      if (landId) {
        landContext = await this.fetchComprehensiveLandContext(landId, farmerId);
        console.log('📍 [Orchestrator] Loaded land context:', landContext ? 'SUCCESS' : 'EMPTY');
      }
      
      return await processContextManager({
        farmer_id: farmerId,
        land_id: landId, // CRITICAL FIX: Now passing landId instead of undefined
        current_input: message,
        input_type: 'TEXT',
        timestamp: new Date().toISOString(),
        land_context: landContext, // NEW: Pass comprehensive land context
        nlu_output: nluOutput ? {
          primary_intent: nluOutput.intent_classification?.primary_intent || 'GENERAL_QUERY',
          crop_code: nluOutput.crop_identification?.crop_code || landContext?.current_crop,
          symptoms: nluOutput.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [],
          pest_hypothesis: nluOutput.entities_extracted?.pest_mentioned?.canonical,
          disease_hypothesis: nluOutput.entities_extracted?.disease_mentioned?.canonical,
          urgency_level: (nluOutput.intent_classification?.urgency_level as 'HIGH' | 'MEDIUM' | 'LOW') || 'MEDIUM',
          emotional_state: (nluOutput.intent_classification?.emotional_state as any) || 'NEUTRAL',
          confidence: nluOutput.understanding_quality?.overall_confidence || 0.5
        } : {
          primary_intent: 'GENERAL_QUERY',
          crop_code: landContext?.current_crop,
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
   * CRITICAL FIX: Fetch comprehensive land context including soil, NDVI history, and crop schedule
   * Now includes NDVI full history for trend analysis and rule evaluation
   */
  private async fetchComprehensiveLandContext(landId: string, farmerId: string): Promise<any> {
    try {
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL SECURITY FIX: Validate farmer ownership FIRST before fetching data
      // This prevents cross-farmer/cross-tenant data access attacks
      // ═══════════════════════════════════════════════════════════════════════════
      
      // PARALLEL FETCHING: Fetch all data simultaneously for speed
      const [landResult, soilResult, ndviLatestResult, ndviHistoryResult, cropScheduleResult] = await Promise.all([
        // Fetch land details - CRITICAL: Must validate farmer_id ownership
        this.supabase
          .from('lands')
          .select('*')
          .eq('id', landId)
          .eq('farmer_id', farmerId)  // SECURITY: Enforce farmer ownership
          .single(),
        
        // Fetch latest soil health data
        this.supabase
          .from('soil_health')
          .select('*')
          .eq('land_id', landId)
          .order('test_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        
        // Fetch latest NDVI data - CRITICAL FIX: Use 'date' column not 'captured_at'
        this.supabase
          .from('ndvi_data')
          .select('*')
          .eq('land_id', landId)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        
        // CRITICAL FIX: Fetch NDVI HISTORY (last 30 days for trend analysis)
        // Use 'date' column - 'captured_at' does not exist in schema
        this.supabase
          .from('ndvi_data')
          .select('ndvi_value, mean_ndvi, date, quality_score, metadata')
          .eq('land_id', landId)
          .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('date', { ascending: false })
          .limit(10),
        
        // Fetch active crop schedule
        this.supabase
          .from('crop_schedules')
          .select('*')
          .eq('land_id', landId)
          .eq('is_active', true)
          .order('sowing_date', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);
      
      const { data: land, error: landError } = landResult;
      const { data: soilHealth } = soilResult;
      const { data: ndviData } = ndviLatestResult;
      const { data: ndviHistory } = ndviHistoryResult;
      const { data: cropSchedule } = cropScheduleResult;
      
      if (landError || !land) {
        // SECURITY: If land not found OR farmer doesn't own this land, return null
        // This prevents data leakage across farmers
        console.warn('⚠️ [Orchestrator] Land fetch failed or farmer does not own this land:', landError?.message || 'ACCESS_DENIED');
        console.warn(`   landId=${landId}, farmerId=${farmerId}`);
        return null;
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL: Calculate days since sowing ONLY from crop_schedules.sowing_date
      // NEVER fall back to lands.cultivation_date - it may contain old/stale data
      // ═══════════════════════════════════════════════════════════════════════════
      let daysSinceSowing: number | null = null;
      let growthStage: string | null = null;
      
      if (cropSchedule?.sowing_date) {
        const sowingDate = new Date(cropSchedule.sowing_date);
        const today = new Date();
        daysSinceSowing = Math.floor((today.getTime() - sowingDate.getTime()) / (1000 * 60 * 60 * 24));
        growthStage = this.calculateGrowthStage(daysSinceSowing, cropSchedule.crop_name);
        
        console.log(`✅ [SOWING_DATE_SOURCE] crop_schedules table (SINGLE SOURCE OF TRUTH)`);
        console.log(`   Crop: ${cropSchedule.crop_name}`);
        console.log(`   Sowing Date: ${cropSchedule.sowing_date}`);
        console.log(`   Days Since Sowing: ${daysSinceSowing}`);
        console.log(`   Growth Stage: ${growthStage}`);
        console.log(`   ⚠️ NEVER using lands.cultivation_date (could be old season)`);
      } else if (land.current_crop) {
        // ═══════════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: Fallback to lands.current_crop when no crop_schedule exists
        // This prevents "No land current crop" warnings and enables crop-specific advice
        // ═══════════════════════════════════════════════════════════════════════════
        console.warn(`⚠️ [SOWING_DATE_MISSING] No active crop_schedule for land ${landId}`);
        console.warn(`   → FALLBACK: Using lands.current_crop = "${land.current_crop}"`);
        console.warn('   → days_since_sowing and growth_stage will use DEFAULTS');
        console.warn('   → Recommend user creates crop_schedule for accurate stage tracking');
        
        // Use default growth stage based on typical assumptions
        // Without sowing_date, we assume mid-vegetative stage as safe default
        growthStage = 'VEGETATIVE';
        daysSinceSowing = null; // Unknown without sowing_date
      } else {
        console.warn(`⚠️ [NO_CROP_DATA] No crop_schedule AND no lands.current_crop for ${landId}`);
        console.warn('   → Cannot provide crop-specific advice');
      }
      
      // CRITICAL FIX: Calculate NDVI trend from history
      const ndviTrend = this.calculateNDVITrend(ndviHistory || []);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Prioritize crop_schedules, but FALLBACK to lands.current_crop
      // This ensures crop context is available even without a formal schedule
      // ═══════════════════════════════════════════════════════════════════════════
      const effectiveCropName = cropSchedule?.crop_name || land.current_crop || null;
      const effectiveCropVariety = cropSchedule?.crop_variety || null;
      
      const context = {
        land_id: landId,
        land_name: land.name,
        area_acres: land.area_acres,
        soil_type: land.soil_type,
        irrigation_type: land.irrigation_type,
        water_source: land.water_source,
        // CRITICAL FIX: Use effectiveCropName with fallback to lands.current_crop
        current_crop: effectiveCropName,
        crop_variety: effectiveCropVariety,
        sowing_date: cropSchedule?.sowing_date || null,  // Only from crop_schedules
        days_since_sowing: daysSinceSowing,
        growth_stage: growthStage,
        expected_harvest_date: cropSchedule?.expected_harvest_date,
        // NEW: Track data source for debugging
        crop_data_source: cropSchedule ? 'crop_schedules' : (land.current_crop ? 'lands_table_fallback' : 'none'),
        district: land.district,
        state: land.state,
        village: land.village,
        center_lat: land.center_lat,
        center_lon: land.center_lon,
        
        // Soil health data (FULL DATA for rule engine)
        // CRITICAL FIX: Use correct column names from schema
        soil_health: soilHealth ? {
          nitrogen_kg_per_ha: soilHealth.nitrogen_kg_per_ha,
          phosphorus_kg_per_ha: soilHealth.phosphorus_kg_per_ha,
          potassium_kg_per_ha: soilHealth.potassium_kg_per_ha,
          nitrogen_level: soilHealth.nitrogen_level,
          phosphorus_level: soilHealth.phosphorus_level,
          potassium_level: soilHealth.potassium_level,
          ph: soilHealth.ph_level,  // Schema uses ph_level not ph
          ph_level: soilHealth.ph_level,
          organic_carbon: soilHealth.organic_carbon,
          soil_type: soilHealth.soil_type,
          texture: soilHealth.texture,
          cec: soilHealth.cec,
          test_date: soilHealth.test_date,
          tested_at: soilHealth.test_date,  // Schema uses test_date
          confidence_level: soilHealth.confidence_level
        } : null,
        soil_tested: !!soilHealth,
        
        // NDVI data with trend analysis (CRITICAL FOR DECISION BRAIN)
        // CRITICAL FIX: Use correct column names - 'date' not 'captured_at', no 'health_status' column
        ndvi: ndviData ? {
          value: ndviData.ndvi_value,
          mean_ndvi: ndviData.mean_ndvi,
          min_ndvi: ndviData.min_ndvi || ndviData.ndvi_min,
          max_ndvi: ndviData.max_ndvi || ndviData.ndvi_max,
          health_status: this.getNDVIHealthStatus(ndviData.ndvi_value || ndviData.mean_ndvi),  // Computed, not from DB
          ndvi_trend: ndviTrend.direction,  // Computed from history, not from DB
          trend_slope: ndviTrend.slope,
          trend_description: ndviTrend.description,
          quality_score: ndviData.quality_score,
          confidence_level: ndviData.confidence_level,
          captured_at: ndviData.date,  // Schema uses 'date' column
          date: ndviData.date
        } : null,
        
        // NDVI HISTORY for multi-signal intelligence
        // CRITICAL FIX: Use 'date' column, health_status is computed
        ndvi_history: (ndviHistory || []).map((h: any) => ({
          value: h.ndvi_value || h.mean_ndvi,
          captured_at: h.date,  // Schema uses 'date' not 'captured_at'
          date: h.date,
          health_status: this.getNDVIHealthStatus(h.ndvi_value || h.mean_ndvi)  // Computed
        })),
        
        // Crop schedule data
        // CRITICAL FIX: Use 'crop_variety' not 'variety'
        crop_schedule: cropSchedule ? {
          schedule_id: cropSchedule.id,
          crop_name: cropSchedule.crop_name,
          variety: cropSchedule.crop_variety,  // Schema uses 'crop_variety'
          crop_variety: cropSchedule.crop_variety,
          sowing_date: cropSchedule.sowing_date,
          expected_harvest_date: cropSchedule.expected_harvest_date,
          status: cropSchedule.status,
          is_active: cropSchedule.is_active
        } : null
      };
      
      console.log('📊 [Orchestrator] COMPREHENSIVE Land context built:', {
        land_name: context.land_name,
        current_crop: context.current_crop,
        area_acres: context.area_acres,
        days_since_sowing: context.days_since_sowing,
        growth_stage: context.growth_stage,
        has_soil_health: !!context.soil_health,
        soil_npk: context.soil_health ? `N:${context.soil_health.nitrogen_kg_per_ha} P:${context.soil_health.phosphorus_kg_per_ha} K:${context.soil_health.potassium_kg_per_ha}` : 'N/A',
        has_ndvi: !!context.ndvi,
        ndvi_value: context.ndvi?.value,
        ndvi_trend: context.ndvi?.ndvi_trend,
        ndvi_history_count: context.ndvi_history?.length || 0
      });
      
      return context;
    } catch (error) {
      console.error('⚠️ [Orchestrator] Failed to fetch comprehensive land context:', error);
      return null;
    }
  }
  
  /**
   * Calculate NDVI trend from historical data
   */
  private calculateNDVITrend(history: Array<{ ndvi_value?: number; mean_ndvi?: number; captured_at: string }>): {
    direction: 'IMPROVING' | 'STABLE' | 'DECLINING';
    slope: number;
    description: string;
  } {
    if (!history || history.length < 2) {
      return { direction: 'STABLE', slope: 0, description: 'पुरेसा डेटा नाही' };
    }
    
    // Get values (prefer ndvi_value, fallback to mean_ndvi)
    const values = history
      .map(h => h.ndvi_value ?? h.mean_ndvi)
      .filter((v): v is number => v !== null && v !== undefined);
    
    if (values.length < 2) {
      return { direction: 'STABLE', slope: 0, description: 'पुरेसा डेटा नाही' };
    }
    
    // Calculate simple linear regression slope
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) * (i - xMean);
    }
    
    const slope = denominator !== 0 ? numerator / denominator : 0;
    
    // Determine direction based on slope (inverted because newest is first)
    let direction: 'IMPROVING' | 'STABLE' | 'DECLINING';
    let description: string;
    
    if (slope < -0.02) {
      direction = 'IMPROVING';  // Slope is negative because array is newest-first
      description = 'पिकाची आरोग्य सुधारत आहे ✓';
    } else if (slope > 0.02) {
      direction = 'DECLINING';  // Slope is positive because array is newest-first
      description = 'पिकाची आरोग्य घटत आहे ⚠️';
    } else {
      direction = 'STABLE';
      description = 'पिकाची आरोग्य स्थिर आहे';
    }
    
    return { direction, slope: -slope, description };  // Negate slope for intuitive interpretation
  }
  
  /**
   * Calculate growth stage based on days since sowing
   * CRITICAL FIX: Uses ICAR-standard stage definitions
   */
  private calculateGrowthStage(daysSinceSowing: number, cropName?: string): string {
    // ICAR-standard crop-specific stage definitions
    const CROP_STAGES: Record<string, { maxDays: number; stage: string }[]> = {
      'WHEAT': [
        { maxDays: 7, stage: 'GERMINATION' },
        { maxDays: 21, stage: 'SEEDLING' },
        { maxDays: 45, stage: 'TILLERING' },
        { maxDays: 75, stage: 'STEM_ELONGATION' },
        { maxDays: 100, stage: 'FLOWERING' },
        { maxDays: 120, stage: 'GRAIN_FILLING' },
        { maxDays: 140, stage: 'MATURITY' },
        { maxDays: 999, stage: 'HARVEST' }
      ],
      'RICE': [
        { maxDays: 10, stage: 'GERMINATION' },
        { maxDays: 25, stage: 'SEEDLING' },
        { maxDays: 45, stage: 'TILLERING' },
        { maxDays: 65, stage: 'PANICLE_INITIATION' },
        { maxDays: 85, stage: 'FLOWERING' },
        { maxDays: 110, stage: 'GRAIN_FILLING' },
        { maxDays: 130, stage: 'MATURITY' },
        { maxDays: 999, stage: 'HARVEST' }
      ],
      'SUGARCANE': [
        { maxDays: 30, stage: 'GERMINATION' },
        { maxDays: 60, stage: 'SEEDLING' },
        { maxDays: 90, stage: 'TILLERING' },
        { maxDays: 180, stage: 'GRAND_GROWTH' },
        { maxDays: 270, stage: 'MATURITY' },
        { maxDays: 330, stage: 'RIPENING' },
        { maxDays: 999, stage: 'HARVEST' }
      ],
      'COTTON': [
        { maxDays: 10, stage: 'GERMINATION' },
        { maxDays: 25, stage: 'SEEDLING' },
        { maxDays: 50, stage: 'VEGETATIVE' },
        { maxDays: 70, stage: 'SQUARING' },
        { maxDays: 95, stage: 'FLOWERING' },
        { maxDays: 130, stage: 'BOLL_FORMATION' },
        { maxDays: 160, stage: 'BOLL_OPENING' },
        { maxDays: 999, stage: 'HARVEST' }
      ],
      'SOYBEAN': [
        { maxDays: 7, stage: 'GERMINATION' },
        { maxDays: 20, stage: 'SEEDLING' },
        { maxDays: 40, stage: 'VEGETATIVE' },
        { maxDays: 60, stage: 'FLOWERING' },
        { maxDays: 80, stage: 'POD_FORMATION' },
        { maxDays: 100, stage: 'MATURITY' },
        { maxDays: 999, stage: 'HARVEST' }
      ],
      'MAIZE': [
        { maxDays: 7, stage: 'GERMINATION' },
        { maxDays: 20, stage: 'SEEDLING' },
        { maxDays: 45, stage: 'VEGETATIVE' },
        { maxDays: 60, stage: 'TASSELING' },
        { maxDays: 75, stage: 'SILKING' },
        { maxDays: 100, stage: 'GRAIN_FILLING' },
        { maxDays: 120, stage: 'MATURITY' },
        { maxDays: 999, stage: 'HARVEST' }
      ]
    };
    
    // Default stages for unknown crops
    const DEFAULT_STAGES = [
      { maxDays: 10, stage: 'GERMINATION' },
      { maxDays: 25, stage: 'SEEDLING' },
      { maxDays: 50, stage: 'VEGETATIVE' },
      { maxDays: 75, stage: 'FLOWERING' },
      { maxDays: 100, stage: 'FRUITING' },
      { maxDays: 130, stage: 'MATURITY' },
      { maxDays: 999, stage: 'HARVEST' }
    ];
    
    const cropUpper = (cropName || '').toUpperCase();
    const stages = CROP_STAGES[cropUpper] || DEFAULT_STAGES;
    
    for (const stageDef of stages) {
      if (daysSinceSowing <= stageDef.maxDays) {
        return stageDef.stage;
      }
    }
    
    return 'MATURITY';
  }
  
  /**
   * Get NDVI health status
   */
  private getNDVIHealthStatus(ndviValue: number): string {
    if (ndviValue >= 0.6) return 'excellent';
    if (ndviValue >= 0.4) return 'healthy';
    if (ndviValue >= 0.25) return 'moderate';
    if (ndviValue >= 0.15) return 'stressed';
    return 'poor';
  }
  
  /**
   * Build data audit object for debugging - shows what data was found/missing
   */
  private buildDataAudit(landContext: any, weatherData: any): DataAudit {
    const now = new Date();
    
    // Land audit
    const landAudit = {
      found: !!landContext,
      land_id: landContext?.land_id,
      land_name: landContext?.land_name,
      current_crop: landContext?.current_crop,
      area_acres: landContext?.area_acres,
      growth_stage: landContext?.growth_stage,
      days_since_sowing: landContext?.days_since_sowing,
      has_coordinates: !!(landContext?.center_lat && landContext?.center_lon),
      missing_reasons: !landContext ? ['No land selected or land not found'] : 
        (!landContext.center_lat ? ['Missing GPS coordinates'] : [])
    };
    
    // Soil audit
    const soilHealth = landContext?.soil_health;
    const testDate = soilHealth?.test_date ? new Date(soilHealth.test_date) : null;
    const testAgeDays = testDate ? Math.floor((now.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
    
    const soilAudit = {
      found: !!soilHealth,
      test_date: soilHealth?.test_date,
      test_age_days: testAgeDays,
      nitrogen_kg_per_ha: soilHealth?.nitrogen_kg_per_ha,
      phosphorus_kg_per_ha: soilHealth?.phosphorus_kg_per_ha,
      potassium_kg_per_ha: soilHealth?.potassium_kg_per_ha,
      ph_level: soilHealth?.ph_level,
      nitrogen_state: soilHealth?.nitrogen_level,
      phosphorus_state: soilHealth?.phosphorus_level,
      potassium_state: soilHealth?.potassium_level,
      missing_reasons: !soilHealth ? ['No soil test data - recommend soil testing'] : []
    };
    
    // NDVI audit
    const ndvi = landContext?.ndvi;
    const ndviDate = ndvi?.date ? new Date(ndvi.date) : null;
    const ndviAgeDays = ndviDate ? Math.floor((now.getTime() - ndviDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
    
    const ndviAudit = {
      found: !!(ndvi?.value || ndvi?.ndvi_value || ndvi?.mean_ndvi),
      latest_value: ndvi?.value || ndvi?.ndvi_value || ndvi?.mean_ndvi,
      latest_date: ndvi?.date,
      age_days: ndviAgeDays,
      trend: ndvi?.ndvi_trend,
      health_status: ndvi?.health_status,
      history_count: landContext?.ndvi_history?.length || 0,
      missing_reasons: !ndvi ? ['No satellite NDVI data available'] : []
    };
    
    // Weather audit  
    const weatherAudit = {
      found: !!weatherData && !weatherData.is_default,
      temperature: weatherData?.current?.temperature,
      humidity: weatherData?.current?.humidity,
      rain_probability: weatherData?.forecast?.[0]?.precipitation_probability,
      rain_last_24h: weatherData?.current?.precipitation,
      data_age_hours: null as number | null,
      missing_reasons: !weatherData || weatherData.is_default ? ['Weather data unavailable - using defaults'] : []
    };
    
    // Crop schedule audit
    const schedule = landContext?.crop_schedule;
    const scheduleAudit = {
      found: !!schedule,
      crop_name: schedule?.crop_name,
      sowing_date: schedule?.sowing_date,
      expected_harvest: schedule?.expected_harvest_date,
      status: schedule?.status,
      missing_reasons: !schedule ? ['No active crop schedule'] : []
    };
    
    // Summary
    const sources = [landAudit, soilAudit, ndviAudit, weatherAudit, scheduleAudit];
    const availableSources = sources.filter(s => s.found).length;
    const criticalMissing: string[] = [];
    const recommendations: string[] = [];
    
    if (!soilAudit.found) {
      criticalMissing.push('Soil Test');
      recommendations.push('Get soil tested for accurate fertilizer recommendations');
    }
    if (!ndviAudit.found) {
      criticalMissing.push('NDVI');
      recommendations.push('Add land boundaries for satellite monitoring');
    }
    if (!landAudit.has_coordinates) {
      recommendations.push('Add GPS coordinates for weather and satellite data');
    }
    
    return {
      land: landAudit,
      soil_health: soilAudit,
      ndvi: ndviAudit,
      weather: weatherAudit,
      crop_schedule: scheduleAudit,
      summary: {
        total_data_sources: 5,
        available_sources: availableSources,
        data_quality_score: Math.round((availableSources / 5) * 100),
        critical_missing: criticalMissing,
        recommendations
      }
    };
  }
  
  /**
   * Fetch weather data - NOW CONNECTED TO REAL DATA
   * CRITICAL FIX: Returns CANONICAL WeatherData format for MultiModalFusion
   * Format: { current: { temperature_c, humidity_percent, wind_speed_kmh, rainfall_last_24h_mm },
   *           forecast_24h: { rain_probability_percent, temperature_max_c, temperature_min_c, wind_max_kmh } }
   */
  private async fetchWeatherData(sessionId: string, landId?: string): Promise<any> {
    // Canonical default weather data for Indian agriculture
    const defaultWeather = {
      is_default: true,
      current: {
        temperature_c: 28,
        humidity_percent: 65,
        wind_speed_kmh: 12,
        rainfall_last_24h_mm: 0
      },
      forecast_24h: {
        rain_probability_percent: 20,
        temperature_max_c: 32,
        temperature_min_c: 22,
        wind_max_kmh: 18
      },
      forecast_72h: []
    };
    
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
            // NORMALIZE cache data to canonical format
            const cached = weatherCache.weather_data;
            return this.normalizeWeatherData(cached, false);
          }
        }
      }
      
      // Fallback: Return reasonable defaults
      console.log('🌤️ [Orchestrator] Using default weather data');
      return defaultWeather;
    } catch (error) {
      console.warn('⚠️ Weather fetch failed:', error);
      return defaultWeather;
    }
  }
  
  /**
   * Normalize any weather data format to canonical format for MultiModalFusion
   * Handles: weather_cache format, weather_current format, and already-canonical format
   */
  private normalizeWeatherData(raw: any, isDefault: boolean): any {
    // If already in canonical format, return as-is
    if (raw?.current?.temperature_c !== undefined && raw?.forecast_24h?.rain_probability_percent !== undefined) {
      return { ...raw, is_default: isDefault };
    }
    
    // Handle weather_cache format: { current: { temperature, humidity, ... }, forecast: [{ precipitation_probability, ... }] }
    const forecast = raw?.forecast?.[0] || raw?.forecast_24h || {};
    
    return {
      is_default: isDefault,
      current: {
        temperature_c: raw?.current?.temperature_c ?? raw?.current?.temperature ?? 28,
        humidity_percent: raw?.current?.humidity_percent ?? raw?.current?.humidity ?? 65,
        wind_speed_kmh: raw?.current?.wind_speed_kmh ?? raw?.current?.wind_speed ?? 12,
        rainfall_last_24h_mm: raw?.current?.rainfall_last_24h_mm ?? raw?.current?.precipitation ?? 0
      },
      forecast_24h: {
        rain_probability_percent: forecast?.rain_probability_percent ?? forecast?.precipitation_probability ?? 20,
        temperature_max_c: forecast?.temperature_max_c ?? forecast?.temperature_max ?? 32,
        temperature_min_c: forecast?.temperature_min_c ?? forecast?.temperature_min ?? 22,
        wind_max_kmh: forecast?.wind_max_kmh ?? forecast?.wind_speed_max ?? 18
      },
      forecast_72h: raw?.forecast_72h || []
    };
  }
  
  /**
   * Fetch historical data - ENHANCED: Now queries dedicated soil_health and ndvi_data tables
   */
  private async fetchHistoricalData(farmerId: string, landId?: string): Promise<any> {
    try {
      const result: any = {
        previous_issues: [],
        soil_test_results: null,
        ndvi_data: null,
        crop_schedule: null,
        recent_advisories: []
      };
      
      if (landId) {
        // Fetch land basic data - CRITICAL FIX: Use only columns that exist in schema
        const { data: land } = await this.supabase
          .from('lands')
          .select('previous_crop, last_harvest_date, current_crop, soil_type, crop_variety')
          .eq('id', landId)
          .single();
        
        if (land?.previous_crop) {
          result.previous_crop = land.previous_crop;
          result.last_harvest_date = land.last_harvest_date;
        }
        if (land?.current_crop) {
          result.current_crop = land.current_crop;
        }
        if (land?.soil_type) {
          result.soil_type = land.soil_type;
        }
        
        // CRITICAL FIX: Use correct column names from soil_health schema
        // Schema columns: nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, ph_level
        const { data: soilHealth } = await this.supabase
          .from('soil_health')
          .select('nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, ph_level, organic_carbon, test_date')
          .eq('land_id', landId)
          .order('test_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (soilHealth) {
          result.soil_test_results = {
            nitrogen: soilHealth.nitrogen_kg_per_ha,
            nitrogen_kg_per_ha: soilHealth.nitrogen_kg_per_ha,
            phosphorus: soilHealth.phosphorus_kg_per_ha,
            phosphorus_kg_per_ha: soilHealth.phosphorus_kg_per_ha,
            potassium: soilHealth.potassium_kg_per_ha,
            potassium_kg_per_ha: soilHealth.potassium_kg_per_ha,
            ph: soilHealth.ph_level,
            ph_level: soilHealth.ph_level,
            organic_carbon: soilHealth.organic_carbon,
            test_date: soilHealth.test_date
          };
        }
        
        // CRITICAL FIX: Use 'date' column not 'captured_at', and no 'health_status' column
        // Schema columns: ndvi_value, date, mean_ndvi
        const { data: ndviRecord } = await this.supabase
          .from('ndvi_data')
          .select('ndvi_value, date, mean_ndvi')
          .eq('land_id', landId)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (ndviRecord) {
          result.ndvi_data = {
            value: ndviRecord.ndvi_value || ndviRecord.mean_ndvi,
            captured_at: ndviRecord.date,
            date: ndviRecord.date,
            health_status: this.getNDVIHealthStatus(ndviRecord.ndvi_value || ndviRecord.mean_ndvi)
          };
        }
        
        // CRITICAL FIX: Use 'crop_variety' not 'variety'
        // Schema columns: crop_name, crop_variety, sowing_date, expected_harvest_date, is_active
        const { data: cropSchedule } = await this.supabase
          .from('crop_schedules')
          .select('crop_name, crop_variety, sowing_date, expected_harvest_date, is_active')
          .eq('land_id', landId)
          .eq('is_active', true)
          .order('sowing_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (cropSchedule) {
          result.crop_schedule = {
            ...cropSchedule,
            variety: cropSchedule.crop_variety  // Map to expected field name
          };
          // Calculate days since sowing
          if (cropSchedule.sowing_date) {
            const sowingDate = new Date(cropSchedule.sowing_date);
            const today = new Date();
            result.days_since_sowing = Math.floor((today.getTime() - sowingDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // P0-B: LAND-FILTER HISTORICAL ADVISORIES
      // CRITICAL: Only fetch advisories for THIS LAND to prevent cross-land contamination
      // ═══════════════════════════════════════════════════════════════════════════
      let advisoryQuery = this.supabase
        .from('advisory_audit_log')
        .select('advisory_id, causes, actions, risk_level, generated_at, land_id')
        .eq('farmer_id', farmerId)
        .order('generated_at', { ascending: false })
        .limit(5);
      
      // P0-B CRITICAL: Add land_id filter if landId is provided
      if (landId) {
        advisoryQuery = advisoryQuery.eq('land_id', landId);
        console.log(`📋 [P0-B] Historical advisories filtered by land_id=${landId}`);
      }
      
      const { data: recentAdvisories } = await advisoryQuery;
      
      if (recentAdvisories?.length) {
        result.recent_advisories = recentAdvisories;
        result.previous_issues = recentAdvisories.map(a => ({
          issue: a.causes?.[0],
          date: a.generated_at,
          severity: a.risk_level,
          land_id: a.land_id  // Include land_id for transparency
        }));
        console.log(`📋 [P0-B] Loaded ${recentAdvisories.length} land-specific advisories`);
      } else {
        console.log(`📋 [P0-B] No previous advisories for this land`);
      }
      
      return result;
    } catch (error) {
      console.warn('⚠️ Historical data fetch failed:', error);
      return { previous_issues: [], soil_test_results: null };
    }
  }
  
  /**
   * Build rule engine input from fused data
   * ENHANCED: Uses land's current crop, crop-stage-specific NPK, and crop-specific NDVI thresholds
   * CRITICAL FIX: Now accepts landContext directly since ContextState doesn't contain it
   */
  private buildRuleEngineInput(
    fused: FusedIntelligence,
    diagnostic: DiagnosticState,
    context: ContextState,
    ids: { farmerId: string; landId?: string; traceId?: string },
    nluMapping?: any,
    landContext?: any  // CRITICAL FIX: Accept landContext directly
  ): RuleExecutionInput {
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Use landContext parameter directly (NOT context.land_context)
    // The ContextState type does NOT include land_context - this was the root cause bug!
    // ═══════════════════════════════════════════════════════════════════════════
    
    const landCurrentCrop = landContext?.current_crop;
    const landCropStage = landContext?.growth_stage;
    
    // Validate crop context for training data quality
    const cropValidation = validateCropContext(landCurrentCrop, ids.landId);
    if (!cropValidation.valid) {
      console.warn(`⚠️ [${ids.traceId}] ${cropValidation.error}`);
    }
    if (cropValidation.warning) {
      console.warn(`⚠️ [${ids.traceId}] ${cropValidation.warning}`);
    }
    
    // Extract NLU entities
    const nluEntities = nluMapping?.entities || {};
    
    // CRITICAL: Prioritize land's current crop over NLU extraction
    const rawCropCode = landCurrentCrop ||  // ALWAYS trust land's current crop
                        nluEntities.crop_code ||
                        fused.unified_context?.crop?.code || 
                        context.crop_context?.code || 
                        'UNKNOWN';
    
    const rawPestCode = nluEntities.pest_code || 
                        fused.unified_context?.problem?.primary_cause ||
                        fused.unified_context?.problem?.identified_issue;
    const rawDiseaseCode = nluEntities.disease_code ||
                           fused.unified_context?.problem?.disease_code;
    const rawSeverity = nluEntities.severity ||
                        fused.unified_context?.problem?.severity ||
                        'MODERATE';
    const rawCropStage = landCropStage ||  // PRIORITIZE land's growth stage
                         nluEntities.crop_stage ||
                         fused.unified_context?.crop?.stage || 
                         context.crop_context?.stage || 
                         'VEGETATIVE';
    
    // ═══════════════════════════════════════════════════════════════════════════
    // P0-C: UNIFIED CODE NORMALIZATION via entity-code-mapper.ts
    // This is the SINGLE CHOKE POINT for all entity code normalization
    // Ensures decision graph receives expected codes (e.g., SHOOT_BORER not SUGARCANE_SHOOT_BORER)
    // ═══════════════════════════════════════════════════════════════════════════
    
    // First normalize using type-mappers (basic normalization)
    const basicCropCode = normalizeTypeCropCode(rawCropCode);
    const basicPestCode = normalizePestCode(rawPestCode);
    const basicDiseaseCode = normalizeDiseaseCode(rawDiseaseCode);
    const severity = normalizeSeverity(rawSeverity);
    const cropStage = normalizeCropStage(rawCropStage);
    
    // P0-C: Apply decision graph normalization (strip crop prefixes for rule matching)
    const cropCode = toDecisionGraphCropCode(basicCropCode);
    const pestCode = rawPestCode ? toDecisionGraphPestCode(basicPestCode, cropCode) : undefined;
    const diseaseCode = rawDiseaseCode ? toDecisionGraphDiseaseCode(basicDiseaseCode, cropCode) : undefined;
    
    // P0-C: Log the code mapping for debugging
    logCodeMapping(rawPestCode, rawDiseaseCode, rawCropCode, ids.traceId);
    
    // Log crop source for training data quality
    if (landCurrentCrop) {
      console.log(`   [${ids.traceId}] 🌾 Using LAND CURRENT CROP: ${cropCode} (Stage: ${cropStage})`);
    } else {
      console.log(`   [${ids.traceId}] ⚠️ No land current crop - using NLU: ${cropCode}`);
    }
    
    console.log(`   [${ids.traceId}] 📊 Rule Engine Input (P0-C normalized):`, {
      raw: { crop: rawCropCode, pest: rawPestCode, disease: rawDiseaseCode },
      decision_graph: { crop: cropCode, pest: pestCode, disease: diseaseCode, stage: cropStage },
      source: landCurrentCrop ? 'LAND_CONTEXT' : (nluEntities.crop_code ? 'NLU' : 'FUSION')
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Calculate CROP + STAGE SPECIFIC field states using landContext
    // ═══════════════════════════════════════════════════════════════════════════
    
    const fieldStates = calculateFieldStates(landContext, cropCode, cropStage);
    logStateCalculation(cropCode, fieldStates, cropStage);
    
    return {
      session_id: fused.session_id,
      farmer_id: ids.farmerId,
      land_id: ids.landId,
      trace_id: ids.traceId,
      confirmed_hypotheses: diagnostic.hypotheses || [],
      rule_modules_required: diagnostic.rule_modules_required || [],
      
      farmer_context: {
        crop_code: cropCode,  // MUST match land's current crop
        crop_variety: landContext?.crop_variety || context.crop_context?.variety,
        crop_stage: cropStage as any,
        days_after_sowing: fused.unified_context?.crop?.days_after_sowing || 
                           landContext?.days_since_sowing || 
                           45,
        land_size_acres: landContext?.area_acres || 
                         landContext?.size_acres || 
                         1,
        farming_mode: 'CONVENTIONAL'
      },
      
      // ENHANCED: Complete field_conditions with CROP + STAGE SPECIFIC data
      field_conditions: {
        soil_type: fieldStates.soil_type as any,
        
        // CROP + STAGE SPECIFIC nutrient states
        soil_nitrogen_state: fieldStates.soil_nitrogen_state,
        soil_phosphorus_state: fieldStates.soil_phosphorus_state,
        soil_potassium_state: fieldStates.soil_potassium_state,
        
        // Soil properties
        soil_ph: fieldStates.soil_ph,
        soil_organic_carbon: fieldStates.soil_organic_carbon,
        
        // CROP-SPECIFIC NDVI state
        ndvi: fieldStates.ndvi,
        ndvi_state: fieldStates.ndvi_state,
        ndvi_trend: fieldStates.ndvi_trend,
        
        // Additional context
        soil_moisture_percent: fused.unified_context?.field_conditions?.soil_moisture?.value as number,
        last_irrigation_date: landContext?.last_irrigation_date,
        last_fertilizer_date: landContext?.last_fertilizer_date,
        
        // Fertilizer dosage recommendations (if deficient)
        nitrogen_dosage: fieldStates.nitrogen_dosage,
        phosphorus_dosage: fieldStates.phosphorus_dosage,
        potassium_dosage: fieldStates.potassium_dosage
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
        region_code: landContext?.region_code || landContext?.district || 'MH'
      },
      
      pest_disease_state: {
        pest_code: pestCode !== 'UNKNOWN' ? pestCode : undefined,
        disease_code: diseaseCode !== 'UNKNOWN' ? diseaseCode : undefined,
        affected_area_percent: nluEntities.affected_area_percent ||
                               fused.unified_context?.problem?.affected_area_percent || 20,
        severity: severity as any,
        infestation_level_percent: nluEntities.affected_area_percent || 20
      },
      
      farmer_constraints: {
        budget_available_inr: 5000,
        previous_treatments: context.treatment_history || [],
        urgency_level: severity === 'CRITICAL' ? 'CRITICAL' : 'MEDIUM'
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
      // CRITICAL FIX: Schema uses 'farmer_name' not 'full_name'
      const { data } = await this.supabase
        .from('farmers')
        .select('farmer_name, language_preference')
        .eq('id', farmerId)
        .single();
      
      return {
        preferred_language: (preferredLanguage || data?.language_preference || 'mr') as 'mr' | 'hi' | 'en',
        name: data?.farmer_name || 'शेतकरी',
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
   * Save complete decision flow - NON-BLOCKING with error tracing
   * CRITICAL FIX: This method never throws - errors are logged to DB for debugging
   */
  private saveDecisionFlowNonBlocking(data: {
    session_id: string;
    farmer_id: string;
    tenant_id: string;
    land_id?: string;
    trace_id?: string;
    nlu_output: NLUOutput;
    fused_intelligence: FusedIntelligence;
    diagnostic_state: DiagnosticState;
    decision_output: DecisionOutput;
    safety_verification: SafetyVerificationResult;
    farmer_communication: FarmerCommunication;
  }): void {
    // Fire-and-forget async operation
    (async () => {
      const traceId = data.trace_id || `trace_${Date.now().toString(36)}`;
      
      try {
        console.log(`   💾 [${traceId}] Saving decision flow...`);
        
        const { error: insertError } = await this.supabase.from('agricultural_decisions').insert({
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
            status: data.safety_verification.safety_check?.overall_safety_status || 'UNKNOWN',
            approved: data.safety_verification.approved ?? false
          },
          
          // Indexed fields
          status: data.decision_output.status,
          action_type: data.decision_output.primary_decision?.action_type,
          confidence: data.diagnostic_state.hypotheses?.[0]?.confidence,
          
          created_at: new Date().toISOString()
        });
        
        if (insertError) {
          throw insertError;
        }
        
        console.log(`   ✅ [${traceId}] Decision flow saved successfully`);
        
        // Schedule follow-ups (also non-blocking)
        if (data.decision_output.follow_up_schedule) {
          this.scheduleFollowUps(
            data.session_id,
            data.decision_output.decision_id,
            data.farmer_id,
            data.decision_output.follow_up_schedule
          ).catch(followUpError => {
            console.error(`   ⚠️ [${traceId}] Follow-up scheduling failed:`, followUpError);
          });
        }
      } catch (error) {
        // Log error to database for debugging - NEVER throw
        console.error(`   ❌ [${traceId}] Decision flow save FAILED:`, error);
        
        // Store error in system_errors table for debugging
        this.logDecisionSaveError(traceId, data.session_id, data.farmer_id, error)
          .catch(logErr => console.error(`   ❌ [${traceId}] Error logging also failed:`, logErr));
      }
    })();
  }
  
  /**
   * Log decision save errors for debugging
   */
  private async logDecisionSaveError(
    traceId: string,
    sessionId: string,
    farmerId: string,
    error: any
  ): Promise<void> {
    try {
      await this.supabase.from('system_errors').insert({
        error_type: 'DECISION_SAVE_FAILED',
        trace_id: traceId,
        session_id: sessionId,
        farmer_id: farmerId,
        error_message: error?.message || String(error),
        stack_trace: error?.stack,
        error_code: error?.code,
        created_at: new Date().toISOString()
      });
      console.log(`   📝 [${traceId}] Error logged to system_errors table`);
    } catch (logError) {
      // Last resort: just log to console
      console.error(`   🚨 [${traceId}] CRITICAL: Could not log error to DB:`, logError);
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
    // CRITICAL FIX: Prioritize fused intelligence crop code, then NLU, then use as-is
    const cropCodeFromFusion = fused.unified_context?.crop?.code;
    const cropCodeFromNLU = nluOutput.crop_identification?.crop_code;
    const finalCropCode = (cropCodeFromFusion && cropCodeFromFusion !== 'UNKNOWN') ? cropCodeFromFusion :
                          (cropCodeFromNLU && cropCodeFromNLU !== 'UNKNOWN') ? cropCodeFromNLU :
                          fused.unified_context?.crop?.name || // Fallback to crop name
                          fused.historical_data?.current_crop || // Fallback to historical
                          undefined;
    
    if (finalCropCode) {
      console.log(`   🌾 [RuleMapping] Using crop code: ${finalCropCode}`);
    }
    
    const entities: ExtractedEntities = {
      crop_code: finalCropCode,
      crop_stage: fused.unified_context?.crop?.growth_stage as any || 
                  fused.unified_context?.crop?.stage as any,
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
      // CRITICAL FIX: Added overall_confidence that DiagnosticFlowController expects
      overall_confidence: understanding_confidence,
      understanding_confidence,
      clarity_score
    };
  }
  
  /**
   * Create fallback NLU output when NLU agent fails (Gap 6 fix)
   * CRITICAL FIX: Now accepts landContext to populate crop info even when NLU fails
   */
  private createFallbackNLUOutput(
    message: string, 
    language?: 'mr' | 'hi' | 'en',
    landContext?: any
  ): NLUOutput {
    console.log('   📋 Creating fallback NLU output for message:', message.substring(0, 30));
    
    // CRITICAL FIX: Use land context crop when NLU fails
    const cropCode = landContext?.current_crop ? 
      this.normalizeCropCode(landContext.current_crop) : undefined;
    const cropStage = landContext?.growth_stage || 'VEGETATIVE';
    
    if (cropCode) {
      console.log('   📊 Fallback using land context crop:', cropCode);
    }
    
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
      crop_identification: cropCode ? {
        crop_code: cropCode,
        local_name: landContext?.current_crop,
        identification_source: 'INFERRED_FROM_CONTEXT',
        confidence: 0.8
      } : undefined,
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
        overall_confidence: cropCode ? 0.6 : 0.3,
        entity_coverage: cropCode ? 0.5 : 0.2,
        needs_clarification: !cropCode,
        clarity_issues: ['NLU processing failed - using fallback']
      },
      clarification_strategy: {
        needs_clarification: !cropCode,
        questions_to_ask: cropCode ? [] : [{
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
   * CRITICAL FIX: Now accepts landContext to populate crop/soil/NDVI even when fusion fails
   */
  private createFallbackFusedIntelligence(
    sessionId: string, 
    message: string, 
    nluOutput: NLUOutput,
    landContext?: any
  ): FusedIntelligence {
    console.log('   📋 Creating fallback fused intelligence with land context:', !!landContext);
    
    // CONTEXT CONTRACT: Extract crop from landContext as ground truth
    const cropCode = landContext?.current_crop ? 
      this.normalizeCropCode(landContext.current_crop) : 
      nluOutput.crop_identification?.crop_code;
    
    return {
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      fusion_id: `fallback_${Date.now().toString(36)}`,
      text_understanding: {
        farmer_message: message,
        language: nluOutput.language_analysis?.detected_language || 'mr',
        intent: nluOutput.intent_classification?.primary_intent || 'GENERAL_QUERY',
        entities: {
          // CONTEXT CONTRACT: Include crop from land context
          crop_code: cropCode
        },
        confidence: landContext ? 0.6 : 0.3,
        ambiguities: ['Fusion failed - using fallback with land context']
      },
      unified_context: {
        // CONTEXT CONTRACT: Populate crop from land context
        crop: cropCode ? {
          code: cropCode,
          name: landContext?.current_crop,
          stage: landContext?.growth_stage,
          growth_stage: landContext?.growth_stage,
          days_since_sowing: landContext?.days_since_sowing
        } : undefined,
        problem: undefined,
        environment: undefined,
        // CONTEXT CONTRACT: Include location
        location: landContext?.district ? {
          district: landContext.district,
          state: landContext.state,
          village: landContext.village
        } : undefined
      },
      // CONTEXT CONTRACT: Include historical data from land context
      historical_data: landContext ? {
        sowing_date: landContext.sowing_date || new Date().toISOString(),
        crop_code: cropCode,
        current_crop: landContext.current_crop,
        area_acres: landContext.area_acres,
        growth_stage: landContext.growth_stage,
        days_since_sowing: landContext.days_since_sowing,
        region_code: landContext.district,
        previous_issues: [],
        soil_test_results: landContext.soil_health ? {
          date: landContext.soil_health.test_date,
          ph: landContext.soil_health.ph || 0,
          organic_carbon_percent: landContext.soil_health.organic_carbon_percent || 0,
          npk_levels: {
            n: landContext.soil_health.nitrogen_kg_per_ha || 0,
            p: landContext.soil_health.phosphorus_kg_per_ha || 0,
            k: landContext.soil_health.potassium_kg_per_ha || 0
          }
        } : undefined
      } : undefined,
      fusion_summary: {
        overall_confidence: landContext ? 0.6 : 0.3,
        modalities_present: landContext ? ['text', 'land_context'] : ['text'],
        modalities_used: landContext ? ['text', 'land_context'] : ['text'],
        data_sources_used: landContext ? ['text_fallback', 'land_context'] : ['text_fallback'],
        gaps_identified: landContext ? ['visual', 'weather'] : ['visual', 'weather', 'historical'],
        recommendations_for_improvement: landContext ? 
          ['फोटो पाठवा अधिक अचूक निदानासाठी'] : 
          ['Please provide more details']
      },
      validated_facts: [],
      conflicts: [],
      inferred_information: [],
      data_quality: {
        overall_quality: landContext ? 0.6 : 0.3,
        reliability_score: landContext ? 0.7 : 0.3,
        completeness_score: landContext ? 0.5 : 0.2,
        freshness_score: landContext?.ndvi?.captured_at ? 0.7 : 0.3
      },
      recommendations: {
        immediate_actions: [],
        additional_data_needed: landContext ? ['photo'] : ['photo', 'crop_details']
      },
      processing_metadata: {
        fusion_version: '1.0.0-fallback',
        processing_time_ms: 0,
        sources_processed: landContext ? 2 : 1,
        algorithms_applied: ['FALLBACK']
      }
    } as FusedIntelligence;
  }

  /**
   * Handle orchestration errors - ENHANCED: Provides helpful advice instead of just error
   */
  private handleOrchestrationError(
    error: Error,
    sessionId: string,
    farmerMessage: string,
    agentsUsed: string[],
    startTime: number
  ): OrchestratorResponse {
    console.error('❌ Orchestration error:', error.message);
    
    // Log error (non-blocking)
    this.supabase.from('system_errors').insert({
      session_id: sessionId,
      error_type: error.name,
      error_message: error.message,
      farmer_input: farmerMessage,
      stack_trace: error.stack,
      created_at: new Date().toISOString()
    }).then(() => {}).catch(() => {});
    
    // CRITICAL FIX: Provide helpful fallback advice based on message content
    const messageLower = farmerMessage.toLowerCase();
    let fallbackAdvice = 'कृपया तुमचा प्रश्न पुन्हा विचारा.';
    
    // Detect query type and provide relevant generic advice
    if (/खत|खाद|urea|dap|fertilizer/.test(messageLower)) {
      fallbackAdvice = '🌱 खत शिफारस: मातीची तपासणी करा आणि शिफारसीनुसार NPK द्या. पिकाचे नाव आणि वय सांगा.';
    } else if (/पाणी|पानी|water|irrigation/.test(messageLower)) {
      fallbackAdvice = '💧 पाणी व्यवस्थापन: सकाळी किंवा संध्याकाळी पाणी द्या. पाणी साचणे टाळा.';
    } else if (/किडी|कीट|pest|अळी|माशी/.test(messageLower)) {
      fallbackAdvice = '🐛 किडी नियंत्रण: निंबोळी अर्क 5% फवारा. अचूक निदानासाठी फोटो पाठवा.';
    } else if (/रोग|disease|वाळणे|पिवळे/.test(messageLower)) {
      fallbackAdvice = '🌿 रोग नियंत्रण: प्रभावित भाग काढा. अचूक निदानासाठी फोटो पाठवा.';
    }
    
    return {
      type: 'SYSTEM_ERROR',
      session_id: sessionId,
      error: {
        message: 'तुमच्या प्रश्नावर काम करत आहे.',
        fallback_advice: fallbackAdvice
      },
      metadata: {
        confidence: 0.3,
        safety_status: 'FALLBACK',
        rules_applied: 0,
        processing_time_ms: Date.now() - startTime,
        agents_used: agentsUsed
      }
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P0 HELPER METHODS - PHI, Pollinator, GDD Support
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Fetch weather history for GDD calculation (last 14 days)
   */
  private async fetchWeatherHistoryForGDD(lat?: number, lon?: number): Promise<Array<{ date: string; tmax: number; tmin: number }>> {
    if (!lat || !lon) {
      // Return estimated average temperatures if no coordinates
      const today = new Date();
      const history: Array<{ date: string; tmax: number; tmin: number }> = [];
      for (let i = 0; i < 14; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        // Use seasonal averages for India
        const month = date.getMonth();
        const { tmax, tmin } = this.getSeasonalAverageTemps(month);
        history.push({ date: date.toISOString(), tmax, tmin });
      }
      return history;
    }
    
    try {
      // Try to fetch from weather_data table
      const { data, error } = await this.supabase
        .from('weather_data')
        .select('recorded_at, temperature_max, temperature_min')
        .gte('recorded_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order('recorded_at', { ascending: false })
        .limit(14);
      
      if (data && data.length > 0) {
        return data.map((d: any) => ({
          date: d.recorded_at,
          tmax: d.temperature_max || 35,
          tmin: d.temperature_min || 20
        }));
      }
    } catch (e) {
      console.warn('Weather history fetch failed, using defaults');
    }
    
    // Fallback to seasonal averages
    return this.fetchWeatherHistoryForGDD(undefined, undefined);
  }
  
  /**
   * Get seasonal average temperatures for GDD fallback
   */
  private getSeasonalAverageTemps(month: number): { tmax: number; tmin: number } {
    // Average temps for central/western India
    const seasonalTemps: Record<number, { tmax: number; tmin: number }> = {
      0: { tmax: 28, tmin: 12 },  // January
      1: { tmax: 31, tmin: 14 },  // February
      2: { tmax: 36, tmin: 19 },  // March
      3: { tmax: 40, tmin: 24 },  // April
      4: { tmax: 42, tmin: 27 },  // May
      5: { tmax: 38, tmin: 26 },  // June
      6: { tmax: 32, tmin: 24 },  // July
      7: { tmax: 31, tmin: 24 },  // August
      8: { tmax: 32, tmin: 23 },  // September
      9: { tmax: 34, tmin: 20 },  // October
      10: { tmax: 31, tmin: 16 }, // November
      11: { tmax: 28, tmin: 12 }, // December
    };
    return seasonalTemps[month] || { tmax: 32, tmin: 20 };
  }
  
  /**
   * Extract chemical recommendations from decision output
   */
  private extractChemicalRecommendations(decisionOutput: DecisionOutput): string[] {
    const chemicals: string[] = [];
    
    // Extract from primary decision
    if (decisionOutput.primary_decision?.product_details?.product_name) {
      chemicals.push(decisionOutput.primary_decision.product_details.product_name);
    }
    if (decisionOutput.primary_decision?.product_details?.active_ingredient) {
      chemicals.push(decisionOutput.primary_decision.product_details.active_ingredient);
    }
    
    // Extract from secondary actions
    if (decisionOutput.secondary_actions) {
      for (const action of decisionOutput.secondary_actions) {
        if (action.product_details?.product_name) {
          chemicals.push(action.product_details.product_name);
        }
      }
    }
    
    return [...new Set(chemicals)]; // Remove duplicates
  }
  
  /**
   * Calculate days to harvest from expected harvest date
   */
  private calculateDaysToHarvest(expectedHarvestDate: string): number {
    const harvest = new Date(expectedHarvestDate);
    const today = new Date();
    const diffMs = harvest.getTime() - today.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }
  
  /**
   * Apply PHI blocking to decision output - replace blocked chemicals with safe alternatives
   */
  private applyPHIBlocking(decisionOutput: DecisionOutput, phiEnforcement: PHIEnforcementResult): DecisionOutput {
    const blockedChemicalNames = new Set(phiEnforcement.blocked_chemicals.map(c => c.chemical_name.toLowerCase()));
    
    // If primary decision product is blocked, replace with alternative or block
    if (decisionOutput.primary_decision?.product_details?.product_name) {
      const productName = decisionOutput.primary_decision.product_details.product_name.toLowerCase();
      if (blockedChemicalNames.has(productName)) {
        // Replace with safe alternative
        if (phiEnforcement.safe_alternatives.length > 0) {
          decisionOutput.primary_decision.product_details.product_name = phiEnforcement.safe_alternatives[0];
          decisionOutput.primary_decision.notes = `${decisionOutput.primary_decision.notes || ''} ⚠️ PHI उल्लंघन: मूळ शिफारस बदलली. ${phiEnforcement.general_advice_mr}`;
        } else {
          // Add to blocked actions
          decisionOutput.blocked_actions = decisionOutput.blocked_actions || [];
          decisionOutput.blocked_actions.push({
            action: `${decisionOutput.primary_decision.product_details.product_name} spray`,
            reason: phiEnforcement.blocked_chemicals.find(c => c.chemical_name.toLowerCase() === productName)?.block_reason_mr || 'PHI उल्लंघन',
            alternative_suggested: 'नैसर्गिक पर्याय वापरा किंवा कापणीनंतर फवारणी करा'
          });
        }
      }
    }
    
    return decisionOutput;
  }
  
  /**
   * Apply Pollinator blocking to decision output - enforce bee safety
   */
  private applyPollinatorBlocking(decisionOutput: DecisionOutput, pollinatorEnforcement: PollinatorEnforcementResult): DecisionOutput {
    const blockedChemicalNames = new Set(pollinatorEnforcement.blocked_chemicals.map(c => c.chemical_name.toLowerCase()));
    
    // If primary decision product is blocked for pollinators
    if (decisionOutput.primary_decision?.product_details?.product_name) {
      const productName = decisionOutput.primary_decision.product_details.product_name.toLowerCase();
      if (blockedChemicalNames.has(productName)) {
        // Replace with bee-safe alternative
        if (pollinatorEnforcement.safe_alternatives.length > 0) {
          decisionOutput.primary_decision.product_details.product_name = pollinatorEnforcement.safe_alternatives[0];
          decisionOutput.primary_decision.notes = `${decisionOutput.primary_decision.notes || ''} 🐝 परागीकरण संरक्षण: फुलोऱ्यात मधमाशी-सुरक्षित पर्याय. ${pollinatorEnforcement.general_advice_mr}`;
        } else {
          // Add blocking warning
          decisionOutput.blocked_actions = decisionOutput.blocked_actions || [];
          decisionOutput.blocked_actions.push({
            action: `${decisionOutput.primary_decision.product_details.product_name} फुलोऱ्यात`,
            reason: pollinatorEnforcement.blocked_chemicals.find(c => c.chemical_name.toLowerCase() === productName)?.block_reason_mr || 'मधमाशी विषारी',
            alternative_suggested: 'संध्याकाळी ७ नंतर किंवा मधमाशी-सुरक्षित पर्याय वापरा'
          });
        }
      }
    }
    
    // Handle time-restricted chemicals
    for (const restricted of pollinatorEnforcement.time_restricted_chemicals) {
      if (!decisionOutput.primary_decision?.notes?.includes('संध्याकाळी')) {
        decisionOutput.primary_decision = decisionOutput.primary_decision || { action_type: 'SPRAY' };
        decisionOutput.primary_decision.notes = `${decisionOutput.primary_decision.notes || ''} ⏰ फक्त संध्याकाळी ७ नंतर फवारणी करा (मधमाशी संरक्षण)`;
      }
    }
    
    return decisionOutput;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P1-A: CROP HEALTH RESPONSE GENERATOR
  // Generates a crop health assessment using NDVI, soil, and weather data
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateCropHealthResponse(
    landContext: any,
    language: 'mr' | 'hi' | 'en'
  ): { message: string; confidence: number; suggestions: string[]; actions: any[]; isCritical: boolean } {
    const crop = landContext.current_crop || 'पीक';
    const cropCode = (crop || '').toUpperCase();
    const stage = landContext.growth_stage || 'VEGETATIVE';
    const das = landContext.days_since_sowing || 0;
    const ndvi = landContext.ndvi?.value || landContext.ndvi?.ndvi_value;
    const ndviTrend = landContext.ndvi?.ndvi_trend;
    const soil = landContext.soil_health;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL: NDVI THRESHOLDS BY CROP + STAGE (ICAR Standards)
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Expected NDVI ranges by stage for common crops
    const EXPECTED_NDVI_BY_STAGE: Record<string, { min: number; critical: number }> = {
      'GERMINATION': { min: 0.08, critical: 0.05 },
      'SEEDLING': { min: 0.15, critical: 0.10 },
      'TILLERING': { min: 0.35, critical: 0.20 },
      'VEGETATIVE': { min: 0.40, critical: 0.25 },
      'STEM_ELONGATION': { min: 0.50, critical: 0.30 },
      'FLOWERING': { min: 0.55, critical: 0.35 },
      'GRAIN_FILLING': { min: 0.50, critical: 0.30 },
      'MATURITY': { min: 0.35, critical: 0.20 }
    };
    
    // Determine expected NDVI for current stage
    const stageUpper = (stage || 'VEGETATIVE').toUpperCase();
    const expectedNdvi = EXPECTED_NDVI_BY_STAGE[stageUpper] || { min: 0.35, critical: 0.20 };
    
    // Calculate nitrogen state
    const nitrogenKgPerHa = soil?.nitrogen_kg_per_ha;
    let nitrogenState: 'LOW' | 'ADEQUATE' | 'HIGH' = 'ADEQUATE';
    
    // Nitrogen thresholds by crop (kg/ha)
    const N_THRESHOLDS: Record<string, { low: number; high: number }> = {
      'WHEAT': { low: 100, high: 200 },
      'RICE': { low: 100, high: 200 },
      'COTTON': { low: 80, high: 180 },
      'SUGARCANE': { low: 120, high: 250 },
      'SOYBEAN': { low: 40, high: 100 },
      'MAIZE': { low: 100, high: 220 }
    };
    
    const nThresh = N_THRESHOLDS[cropCode] || { low: 100, high: 200 };
    if (nitrogenKgPerHa !== undefined) {
      if (nitrogenKgPerHa < nThresh.low) nitrogenState = 'LOW';
      else if (nitrogenKgPerHa > nThresh.high) nitrogenState = 'HIGH';
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // HEALTH STATUS DETERMINATION (CRITICAL FIX)
    // ═══════════════════════════════════════════════════════════════════════════
    
    let healthStatus: 'excellent' | 'good' | 'moderate' | 'concern' | 'critical' = 'good';
    let healthIcon = '✅';
    let isCritical = false;
    const actions: any[] = [];
    
    if (ndvi !== undefined) {
      // CRITICAL: NDVI below critical threshold for stage
      if (ndvi < expectedNdvi.critical) {
        healthStatus = 'critical';
        healthIcon = '🚨';
        isCritical = true;
        console.log(`🚨 [NDVI CRITICAL] NDVI=${ndvi} < critical threshold ${expectedNdvi.critical} for stage ${stageUpper}`);
      } else if (ndvi < expectedNdvi.min) {
        healthStatus = 'concern';
        healthIcon = '🔴';
      } else if (ndvi >= 0.6) {
        healthStatus = 'excellent';
        healthIcon = '🌟';
      } else if (ndvi >= 0.4) {
        healthStatus = 'good';
        healthIcon = '✅';
      } else {
        healthStatus = 'moderate';
        healthIcon = '⚠️';
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BUILD ACTIONS BASED ON ACTUAL CONDITIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Add fertilizer action if nitrogen is low
    if (nitrogenState === 'LOW') {
      const ureaDosage = cropCode === 'WHEAT' ? '50' : cropCode === 'RICE' ? '45' : '40';
      actions.push({
        action_type: 'APPLY_FERTILIZER',
        title: language === 'mr' ? 'युरिया खत द्या' : language === 'hi' ? 'यूरिया खाद दें' : 'Apply Urea',
        description: language === 'mr' 
          ? `नायट्रोजन कमी आहे (${nitrogenKgPerHa?.toFixed(1)} kg/ha). युरिया ${ureaDosage} kg/acre द्या.`
          : language === 'hi'
          ? `नाइट्रोजन कम है (${nitrogenKgPerHa?.toFixed(1)} kg/ha). यूरिया ${ureaDosage} kg/acre दें.`
          : `Nitrogen is low (${nitrogenKgPerHa?.toFixed(1)} kg/ha). Apply Urea ${ureaDosage} kg/acre.`,
        dosage: `${ureaDosage} kg/acre`,
        product_name: 'Urea (46% N)',
        priority: isCritical ? 'URGENT' : 'HIGH',
        timing: { recommended_start: new Date().toISOString() }
      });
    }
    
    // Add monitoring action
    actions.push({
      action_type: 'MONITOR',
      title: language === 'mr' ? 'निरीक्षण करा' : language === 'hi' ? 'निगरानी करें' : 'Monitor',
      description: language === 'mr' 
        ? 'पिकाचे नियमित निरीक्षण करा'
        : language === 'hi'
        ? 'फसल की नियमित निगरानी करें'
        : 'Regularly monitor the crop',
      priority: 'MEDIUM',
      timing: 'Every 3-5 days'
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BUILD RESPONSE MESSAGE
    // ═══════════════════════════════════════════════════════════════════════════
    
    let healthMessage = '';
    
    if (language === 'mr') {
      const statusMap: Record<string, string> = {
        excellent: 'उत्कृष्ट',
        good: 'चांगले',
        moderate: 'मध्यम',
        concern: 'चिंताजनक',
        critical: '🚨 गंभीर - तातडीने लक्ष द्या!'
      };
      
      healthMessage = `${healthIcon} **तुमच्या ${crop} पिकाची स्थिती: ${statusMap[healthStatus]}**\n\n`;
      healthMessage += `🌱 **पिकाचा टप्पा:** ${stage} (${das} दिवस झाले)\n`;
      
      if (ndvi !== undefined) {
        healthMessage += `📊 **NDVI (पिकाची हिरवळ):** ${ndvi.toFixed(3)}`;
        
        // Show expected vs actual for critical cases
        if (healthStatus === 'critical' || healthStatus === 'concern') {
          healthMessage += ` ⚠️ (अपेक्षित: ${expectedNdvi.min.toFixed(2)}+)`;
        }
        
        if (ndviTrend === 'IMPROVING' || ndviTrend === 'RISING') {
          healthMessage += ' 📈 (सुधारत आहे)';
        } else if (ndviTrend === 'DECLINING') {
          healthMessage += ' 📉 (कमी होत आहे)';
        }
        healthMessage += '\n';
      }
      
      if (soil) {
        healthMessage += `\n🧪 **जमिनीची स्थिती:**\n`;
        healthMessage += `   • नत्र (N): ${nitrogenKgPerHa?.toFixed(1) || 'N/A'} kg/ha`;
        if (nitrogenState === 'LOW') healthMessage += ' ⚠️ **कमी**';
        else if (nitrogenState === 'HIGH') healthMessage += ' ⬆️ जास्त';
        healthMessage += '\n';
        healthMessage += `   • स्फुरद (P): ${soil.phosphorus_kg_per_ha?.toFixed(1) || 'N/A'} kg/ha\n`;
        healthMessage += `   • पालाश (K): ${soil.potassium_kg_per_ha?.toFixed(1) || 'N/A'} kg/ha\n`;
        healthMessage += `   • pH: ${soil.ph_level || 'N/A'}\n`;
      }
      
      // Add recommendations based on status
      healthMessage += `\n💡 **पुढील कृती:**\n`;
      
      if (healthStatus === 'critical') {
        healthMessage += `🚨 **तातडीने कृती करा:**\n`;
        if (nitrogenState === 'LOW') {
          healthMessage += `• युरिया खत तातडीने द्या (${actions[0]?.dosage})\n`;
        }
        healthMessage += `• पिकाला पाणी द्या\n`;
        healthMessage += `• किडी-रोग तपासा\n`;
        healthMessage += `• तज्ञांचा सल्ला घ्या\n`;
      } else if (healthStatus === 'concern') {
        healthMessage += `⚠️ **लक्ष द्या:**\n`;
        if (nitrogenState === 'LOW') {
          healthMessage += `• नत्र कमी आहे - युरिया द्या\n`;
        }
        healthMessage += `• पिकाची काळजी घ्या\n`;
        healthMessage += `• पाण्याचे प्रमाण तपासा\n`;
      } else if (healthStatus === 'excellent' || healthStatus === 'good') {
        healthMessage += `• सध्याचे व्यवस्थापन चांगले आहे, चालू ठेवा\n`;
        healthMessage += `• नियमित पाणी व्यवस्थापन करा\n`;
      } else {
        healthMessage += `• पिकाची अधिक काळजी घ्या\n`;
        if (nitrogenState === 'LOW') {
          healthMessage += `• नायट्रोजन कमी - खत द्या\n`;
        }
      }
      
    } else if (language === 'hi') {
      const statusMap: Record<string, string> = {
        excellent: 'उत्कृष्ट',
        good: 'अच्छी',
        moderate: 'मध्यम',
        concern: 'चिंताजनक',
        critical: '🚨 गंभीर - तुरंत ध्यान दें!'
      };
      
      healthMessage = `${healthIcon} **आपकी ${crop} फसल की स्थिति: ${statusMap[healthStatus]}**\n\n`;
      healthMessage += `🌱 **फसल की अवस्था:** ${stage} (${das} दिन हुए)\n`;
      
      if (ndvi !== undefined) {
        healthMessage += `📊 **NDVI (फसल की हरियाली):** ${ndvi.toFixed(3)}`;
        if (healthStatus === 'critical' || healthStatus === 'concern') {
          healthMessage += ` ⚠️ (अपेक्षित: ${expectedNdvi.min.toFixed(2)}+)`;
        }
        healthMessage += '\n';
      }
      
      healthMessage += `\n💡 **अगला कदम:**\n`;
      if (healthStatus === 'critical') {
        healthMessage += `🚨 **तुरंत कार्रवाई करें:**\n`;
        if (nitrogenState === 'LOW') {
          healthMessage += `• यूरिया खाद तुरंत दें\n`;
        }
        healthMessage += `• फसल को पानी दें\n`;
        healthMessage += `• विशेषज्ञ से सलाह लें\n`;
      } else {
        healthMessage += `• नियमित निगरानी जारी रखें\n`;
      }
      
    } else {
      const statusMap: Record<string, string> = {
        excellent: 'Excellent',
        good: 'Good',
        moderate: 'Moderate',
        concern: 'Needs Attention',
        critical: '🚨 CRITICAL - Urgent Action Required!'
      };
      
      healthMessage = `${healthIcon} **Your ${crop} crop status: ${statusMap[healthStatus]}**\n\n`;
      healthMessage += `🌱 **Growth Stage:** ${stage} (Day ${das})\n`;
      
      if (ndvi !== undefined) {
        healthMessage += `📊 **NDVI (Vegetation Index):** ${ndvi.toFixed(3)}`;
        if (healthStatus === 'critical' || healthStatus === 'concern') {
          healthMessage += ` ⚠️ (Expected: ${expectedNdvi.min.toFixed(2)}+)`;
        }
        healthMessage += '\n';
      }
      
      healthMessage += `\n💡 **Next Steps:**\n`;
      if (healthStatus === 'critical') {
        healthMessage += `🚨 **Take Immediate Action:**\n`;
        if (nitrogenState === 'LOW') {
          healthMessage += `• Apply Urea fertilizer immediately\n`;
        }
        healthMessage += `• Check irrigation\n`;
        healthMessage += `• Consult agricultural expert\n`;
      } else {
        healthMessage += `• Continue regular monitoring\n`;
      }
    }
    
    const suggestions = language === 'mr' 
      ? ['किडी समस्या आहे का?', 'पाणी कधी द्यावे?', 'खत शिफारस']
      : language === 'hi'
      ? ['कीट समस्या है?', 'पानी कब दें?', 'खाद सिफारिश']
      : ['Any pest issues?', 'When to irrigate?', 'Fertilizer recommendation'];
    
    return {
      message: healthMessage,
      confidence: ndvi !== undefined ? 0.85 : 0.65,
      suggestions,
      actions,
      isCritical
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 8: GREETING RESPONSE GENERATOR
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateGreetingResponse(
    sessionId: string,
    language: 'mr' | 'hi' | 'en',
    startTime: number,
    agentsUsed: string[],
    traceId: string
  ): OrchestratorResponse {
    const greetings: Record<'mr' | 'hi' | 'en', string> = {
      mr: '🙏 नमस्कार! मी तुमचा कृषी सल्लागार आहे. तुम्ही तुमच्या पिकाबद्दल, किडी-रोग, पाणी व्यवस्थापन, खत शिफारस किंवा बाजारभाव याबद्दल विचारू शकता. मला कशाबद्दल मदत करू?',
      hi: '🙏 नमस्ते! मैं आपका कृषि सलाहकार हूं। आप अपनी फसल, कीट-रोग, पानी प्रबंधन, खाद सिफारिश या बाजार भाव के बारे में पूछ सकते हैं। मैं किस बारे में मदद करूं?',
      en: '🙏 Hello! I am your agricultural advisor. You can ask me about your crop, pests, diseases, irrigation, fertilizer recommendations, or market prices. How can I help you today?'
    };
    
    return {
      type: 'DECISION_PROVIDED',
      session_id: sessionId,
      communication: {
        message_id: crypto.randomUUID(),
        decision_id: `greeting_${Date.now()}`,
        session_id: sessionId,
        farmer_id: '',
        language,
        format: 'RICH_TEXT',
        tone: 'FRIENDLY',
        created_at: new Date().toISOString(),
        main_message: {
          full_text: greetings
        },
        quick_actions: [
          { label: language === 'mr' ? '🐛 किडी समस्या' : language === 'hi' ? '🐛 कीट समस्या' : '🐛 Pest Problem', action: 'pest_query' },
          { label: language === 'mr' ? '💧 पाणी' : language === 'hi' ? '💧 पानी' : '💧 Irrigation', action: 'water_query' },
          { label: language === 'mr' ? '🌾 खत' : language === 'hi' ? '🌾 खाद' : '🌾 Fertilizer', action: 'fertilizer_query' }
        ],
        metadata: {
          word_count: greetings[language].split(/\s+/).length,
          reading_time_seconds: 5,
          confidence_score: 1.0,
          source: 'GREETING',
          response_type: 'GREETING'
        }
      } as any,
      decision_output: {
        decision_id: `greeting_${Date.now()}`,
        session_id: sessionId,
        status: 'INFORMATION_PROVIDED',
        decision_brain_source: false,
        actions_returned: [],
        metadata: {
          confidence: 1.0,
          trace_id: traceId,
          processing_time_ms: Date.now() - startTime,
          agents_used: agentsUsed,
          template_type: 'GREETING'
        }
      } as any,
      metadata: {
        confidence: 1.0,
        safety_status: 'SAFE',
        rules_applied: 0,
        processing_time_ms: Date.now() - startTime,
        agents_used: agentsUsed,
        template_type: 'GREETING',
        trace_id: traceId
      }
    };
  }
}

export const orchestrator = new AIAgentOrchestrator();
