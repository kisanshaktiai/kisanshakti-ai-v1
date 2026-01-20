/**
 * Master AI Agent Orchestrator
 * Coordinates all 9 specialized agents for comprehensive agricultural advisory
 * 
 * v2.0 UPDATE: LLM-First Response System
 * - Simple questions answered directly via LLM without rule engine
 * - Rule engine only for pest/disease/treatment decisions
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

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

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-16: NEW SYMBOLIC DECISION BRAIN IMPORTS
// These provide proper rule evaluation with JSON conditions_json parsing
// ═══════════════════════════════════════════════════════════════════════════
import { 
  SymbolicReasoner,
  type SymbolicFact,
  type InferenceResult 
} from '../decision/symbolic-reasoner.ts';

import { 
  FactExtractor,
  type ExtractedFacts 
} from '../decision/fact-extractor.ts';

import { 
  ConfidenceCalculator,
  type ConfidenceScore 
} from '../decision/confidence-calculator.ts';

import { 
  validateClarificationOptions,
  DIAGNOSIS_KEYWORDS 
} from '../decision/clarification-validator.ts';

import { 
  ResponseGenerator 
} from '../decision/response-generator.ts';

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

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL SEMANTIC EXTRACTOR - LLM-Based Language-Agnostic NLU (Phase 21)
// Replaces hardcoded dictionaries with LLM extraction + deterministic mapping
// ═══════════════════════════════════════════════════════════════════════════
import {
  extractSemanticMeaning,
  SEMANTIC_EXTRACTOR_VERSION,
  type SemanticExtraction
} from './semantic-extractor.ts';

import {
  mapToObservationCodes,
  toObservationKeySet,
  hasMeaningfulCodes,
  OBSERVATION_CODE_MAPPER_VERSION,
  type MappedObservationCodes
} from '../decision/observation-code-mapper.ts';

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY LANGUAGE INDUCTION LAYER (Fallback only - to be deprecated)
// Kept for USE_LLM_NLU=false feature flag during migration
// ═══════════════════════════════════════════════════════════════════════════
import {
  induceCanonicalSymbols,
  getSymptomSymbolsForRules,
  getCropSymbolForRules,
  hasMinimumCoverage,
  getInductionSummary,
  type LanguageInductionResult,
  LANGUAGE_INDUCTION_VERSION
} from './language-induction-layer.ts';

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

// ═══════════════════════════════════════════════════════════════════════════
// STATIC IMPORTS FOR EDGE FUNCTION COMPATIBILITY
// All modules must be statically imported (no await import() allowed)
// ═══════════════════════════════════════════════════════════════════════════
import { routeQuery, getRouteRequirements } from './query-router.ts';
import { resolveDecisionAuthority, DecisionAuthority } from '../decision/authority-resolver.ts';
import { checkStaticDataGate } from './static-data-gate.ts';
import { normalizeLanguage } from './language-normalizer.ts';
import { extractObservations, validateObservationExtraction } from './observation-extractor.ts';
import { checkUnderstandingCompleteness, checkPrescriptionGate as checkUnderstandingPrescriptionGate, UnderstandingConfidence } from './understanding-completeness-checker.ts';
import { getAuditLogger } from './audit-logger.ts';
import { lockIntent, filterActionsByIntentLock, requiresClarification, shouldBypassClarificationForAgriSymptom } from './intent-lock.ts';
import { mapObservationsToCauses } from './observation-cause-mapper.ts';

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
  ALL_RULES,
  getAllRulesWithBundled, // PHASE-13: Use this to include all 2000+ bundled rules
  evaluateBundledKeywordRules, // PHASE-13: Keyword fallback for infinity loop prevention
  RuleEvaluationResult
} from './layered-rule-evaluator.ts';

import {
  resolveConflicts as resolveDiagnosisConflicts
} from './diagnosis-conflict-resolver.ts';

// ═══════════════════════════════════════════════════════════════════════════
// WORLD-CLASS CLARIFICATION: Multi-Match Detector for Competing Diagnoses
// ═══════════════════════════════════════════════════════════════════════════
import {
  performMultiMatchDetection,
  type MultiMatchResult
} from './generic-multi-match-detector.ts';

// ═══════════════════════════════════════════════════════════════════════════
// P0 CRITICAL MODULE IMPORTS - PRODUCTION-READY INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

// AUTHORITATIVE STATE LOADER - Single source of truth from DB tables
import { 
  loadAuthoritativeLandState,
  calculateDecisionConfidence,
  generateMissingDataQuestions,
  type AuthoritativeLandState 
} from '../decision/authoritative-state-loader.ts';

// EXPLANATION CHAIN BUILDER - Rule traceability
import {
  buildExplanationChain,
  formatExplanationForFarmer,
  type ExplanationChain,
  type RuleMatchInfo
} from '../decision/explanation-chain-builder.ts';

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

// PHASE-14: Crop Stage Advisor for stage-aware fallback responses
import {
  getStageSpecificAdvice,
  type StageAdvice
} from './crop-stage-advisor.ts';

// P0: Photoperiod Calculator - Day length for bulbing/flowering crops
import { 
  calculateDayLength, 
  checkPhotoperiodTrigger,
  type PhotoperiodResult 
} from './photoperiod-calculator.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-17: 8 MANDATORY GATES - NEURO-SYMBOLIC VALIDATION MODULES
// These enforce scientific validity before any treatment recommendation
// ═══════════════════════════════════════════════════════════════════════════
import {
  validateContextCompleteness,
  reconcileCropContext,
  performConsistencyChecks,
  type ContextValidationResult
} from '../decision/context-validator.ts';

import {
  checkWeatherSafety,
  type WeatherSafetyResult
} from '../decision/weather-safety-gate.ts';

import {
  generateDifferentialClarification,
  type DifferentialClarificationResult
} from '../decision/differential-diagnosis-clarifier.ts';

import {
  getStageSpecificInfo,
  calculateGrowthStageFromDAS
} from '../decision/crop-calendar-lookup.ts';

// PHASE-8: Smart Clarification Generator - ObservationKey-based
import {
  generateClarificationResponse,
  generateScopedClarification,
  matchFarmerResponseToOption,
  mapOptionToObservation,
  ClarificationScope,
  type ClarificationInput,
  type ClarificationOutput,
  type ScopedClarificationInput,
  type OptionMatchResult // PHASE-9.1: Import null-safe match result type
} from './clarification-generator.ts';

// PHASE-8: ObservationKey-based Clarification Scope Resolver
import {
  resolveClarificationPlan,
  needsClarification,
  hasSufficientInformation,
  MAX_CLARIFICATION_TURNS,
  type ClarificationPlan,
  type ClarificationState
} from './clarification-scope-resolver.ts';

// PHASE-8: Observation Key Mapper
import { mapToObservationKeys, serializeKeys } from './observation-key-mapper.ts';
import { ObservationKey } from '../decision/observation-ontology.ts';

// PHASE-8.1: Crop Context Authority
import { 
  buildCropContextFromLandContext, 
  hasCropContextAuthority,
  type CropContextAuthority 
} from '../decision/context-authority.ts';

// PHASE-9: Cross-Crop Symptom Mapper
import { 
  mapToCrossCropSymptoms,
  serializeCrossCropSymptoms 
} from './cross-crop-symptom-mapper.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-18: Rule Evaluation Layer - Clean wrapper for symbolic reasoning
// ═══════════════════════════════════════════════════════════════════════════
import {
  evaluateRules as evaluateRulesLayer,
  type RuleEvaluationInput,
  type RuleEvaluationOutput
} from '../layers/rule-evaluation-layer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-18: LLM Understanding Layer - Clean wrapper for NLU
// ═══════════════════════════════════════════════════════════════════════════
import {
  type UnderstandingOutput,
  validateUnderstandingOutput
} from '../llm-understanding-layer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-19: Photo Analyzer - Vision API Integration for crop photo analysis
// ═══════════════════════════════════════════════════════════════════════════
import {
  analyzePhoto,
  enhanceUnderstandingWithPhoto,
  type PhotoAnalysisOutput
} from '../photo/photo-analyzer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-20: CLARIFICATION-FIRST CONFIDENCE STRATEGY
// Treats clarification as primary confidence-building, not fallback
// ═══════════════════════════════════════════════════════════════════════════
import {
  lockStageForTurn,
  getLockedStage,
  clearLockedStage,
  isStageLockedForTurn,
  shouldTriggerClarificationFirst,
  fetchRuleDrivenClarificationOptions,
  calculateConfidenceWithTiming,
  mapClarificationSelectionToSymbols,
  checkDecisionGateAlignment,
  logClarificationEvent,
  type LockedStageContext,
  type ClarificationTriggerInput,
  type RuleDrivenClarificationInput,
  type DecisionGateCheckInput,
  CLARIFICATION_STRATEGY_VERSION
} from './clarification-strategy.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-22.5: HYPOTHESIS EVALUATOR FOR DIAGNOSIS-FIRST FLOW
// Pre-evaluate rules to build candidate hypothesis set BEFORE clarification
// ═══════════════════════════════════════════════════════════════════════════
import {
  evaluateCandidateHypotheses,
  type CandidateHypothesis,
  type HypothesisEvaluationOutput
} from '../decision/hypothesis-evaluator.ts';

export const ORCHESTRATOR_VERSION = '4.1.0'; // Phase-22.5: Diagnosis-First mode with hypothesis-driven options

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-21: CANONICAL CONTEXT CONTRACT IMPORTS
// Single immutable context built once and passed by reference
// ═══════════════════════════════════════════════════════════════════════════
import {
  buildCanonicalContext as buildCanonicalContextContract,
  assertCanonicalContextLocked,
  validateContextIntegrity,
  hasDiagnosticContext,
  hasTerminalDamage,
  getDetectedTerminalDamage,
  getContextPresenceFlags,
  type CanonicalContext
} from '../decision/canonical-context-contract.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-22: DIAGNOSIS-ONLY MODE (v3.0 - Rule-Granted Authority)
// Terminal damage grants CROP authority, bypasses NLU gating
// NLU is observation-only, never gates diagnosis
// ═══════════════════════════════════════════════════════════════════════════
import {
  shouldActivateDiagnosisOnlyMode,
  generateDiagnosisOnlyOutput,
  formatDiagnosisForLLM,
  logDiagnosisOnlyActivation,
  detectTerminalDamageForAuthority,
  detectCropDamageForDiagnosis, // v4.0: Enhanced crop damage detection
  createEnforcedCropAuthority,
  assertTerminalDamageAuthority,
  resolveDiagnosticAuthorityFromObservations, // v3.0: Pre-authority gate
  DIAGNOSIS_ONLY_MODE_VERSION,
  CROP_DAMAGE_OBSERVATION_KEYS, // v4.0: Crop damage triggers
  type DiagnosisOnlyOutput,
  type MatchedRule,
  type TerminalDamageDetectionResult,
  type CropDamageDetectionResult, // v4.0: Enhanced result type
  type PreAuthorityGateResult // v3.0: Pre-authority gate result type
} from '../decision/diagnosis-only-mode.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-22.5: DIAGNOSIS-FIRST GENERATOR
// When crop damage detected with land context, show hypothesis-driven options
// ═══════════════════════════════════════════════════════════════════════════
import {
  generateDiagnosisFirstResponse,
  createUnknownDiagnosisResponse,
  formatForClarificationUI,
  DIAGNOSIS_FIRST_VERSION,
  type DiagnosisFirstOutput,
  type DiagnosisOption
} from '../decision/diagnosis-first-generator.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-12: Helper function to map clarification answer to visual symptom
// UPDATED: Now maps to actual VisualSymptom enum values from canonical-state-builder
// ═══════════════════════════════════════════════════════════════════════════
/**
 * WORLD-CLASS FIX: Map clarification answer to visual symptom
 * Uses ENGLISH canonical keywords ONLY - no hardcoded Marathi/Hindi
 * Matching uses standardized English keywords embedded in option IDs
 */
function mapDistributionToSymptom(optionText: string, scope: ClarificationScope): string {
  const optionLower = optionText.toLowerCase();
  
  switch (scope) {
    case ClarificationScope.IDENTIFY_DISTRIBUTION:
      // Distribution → symptom mapping (English canonical keywords)
      if (optionLower.includes('uniform') || optionLower.includes('everywhere') || optionLower.includes('entire field')) {
        return 'GENERAL_YELLOWING'; // Uniform = likely nutrient issue
      }
      if (optionLower.includes('patch') || optionLower.includes('scattered') || optionLower.includes('random')) {
        return 'SPOTS_IRREGULAR'; // Patchy = likely pest/disease
      }
      if (optionLower.includes('edge') || optionLower.includes('border') || optionLower.includes('margin')) {
        return 'LEAF_EDGE_BURN'; // Edge = water/wind/salinity stress
      }
      if (optionLower.includes('center') || optionLower.includes('middle')) {
        return 'SPOTS_CIRCULAR'; // Center = localized damage
      }
      return 'UNKNOWN';
      
    case ClarificationScope.IDENTIFY_SEVERITY:
      // Severity doesn't change symptom type, return based on intensity keywords
      if (optionLower.includes('severe') || optionLower.includes('critical') || optionLower.includes('complete')) {
        return 'WILTING'; // Severe = significant stress response
      }
      return 'UNKNOWN';
      
    case ClarificationScope.IDENTIFY_LOCATION:
      // Plant part → symptom mapping (English canonical keywords)
      if (optionLower.includes('leaf') || optionLower.includes('leaves') || optionLower.includes('foliage')) {
        return 'CURLED_LEAVES';
      }
      if (optionLower.includes('stem') || optionLower.includes('stalk') || optionLower.includes('trunk')) {
        return 'STEM_DISCOLORATION';
      }
      if (optionLower.includes('root') || optionLower.includes('underground')) {
        return 'ROOT_DAMAGE';
      }
      if (optionLower.includes('fruit') || optionLower.includes('pod') || optionLower.includes('grain')) {
        return 'FRUIT_DAMAGE';
      }
      if (optionLower.includes('flower') || optionLower.includes('blossom')) {
        return 'ROSETTE_FLOWER';
      }
      return 'UNKNOWN';
      
    case ClarificationScope.IDENTIFY_INSECT_TYPE:
      // Pest type → symptom mapping (English canonical keywords)
      if (optionLower.includes('aphid') || optionLower.includes('aphis')) {
        return 'CURLED_LEAVES'; // Aphid symptoms
      }
      if (optionLower.includes('borer') || optionLower.includes('stem borer')) {
        return 'DEAD_HEART'; // Borer symptoms
      }
      if (optionLower.includes('caterpillar') || optionLower.includes('worm')) {
        return 'HOLES_IN_LEAVES'; // Caterpillar symptoms
      }
      if (optionLower.includes('mite') || optionLower.includes('spider')) {
        return 'SILVERING'; // Mite symptoms
      }
      if (optionLower.includes('whitefly') || optionLower.includes('white fly')) {
        return 'SOOTY_MOLD'; // Whitefly symptoms
      }
      if (optionLower.includes('hopper') || optionLower.includes('leafhopper')) {
        return 'LEAF_TIP_BURN'; // Hopper symptoms
      }
      return 'SMALL_INSECTS_VISIBLE';
      
    case ClarificationScope.IDENTIFY_INSECT_BEHAVIOR:
      // Behavior → symptom mapping (English canonical keywords)
      if (optionLower.includes('flying') || optionLower.includes('fly')) {
        return 'FLYING_INSECTS_VISIBLE';
      }
      if (optionLower.includes('crawling') || optionLower.includes('crawl')) {
        return 'CRAWLING_INSECTS_VISIBLE';
      }
      if (optionLower.includes('jumping') || optionLower.includes('jump') || optionLower.includes('hopping')) {
        return 'JUMPING_INSECTS_VISIBLE';
      }
      return 'SMALL_INSECTS_VISIBLE';
      
    case ClarificationScope.IDENTIFY_PLANT_RESPONSE:
      // Plant response → symptom mapping (English canonical keywords)
      if (optionLower.includes('wilting') || optionLower.includes('wilt') || optionLower.includes('droop')) {
        return 'WILTING';
      }
      if (optionLower.includes('yellow') || optionLower.includes('chlorosis')) {
        return 'GENERAL_YELLOWING';
      }
      if (optionLower.includes('drying') || optionLower.includes('dry') || optionLower.includes('necrosis')) {
        return 'LEAF_TIP_BURN';
      }
      if (optionLower.includes('stunted') || optionLower.includes('poor growth')) {
        return 'STUNTED_GROWTH';
      }
      return 'UNKNOWN';
      
    default:
      return 'UNKNOWN';
  }
}

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
    template_type?: string;      // Track template type
    sections_count?: number;     // Track sections count
    trace_id?: string;           // For observability
    // PHASE-9.1: Clarification state passthrough
    pendingClarificationOptions?: string[];
    lockedCropContext?: {
      crop_name: string;
      growth_stage: string;
      days_since_sowing: number;
    };
    understanding_confidence?: string;
    clarification_reason?: string;
    clarification_scope?: string;
    scope_validation_passed?: boolean;
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
   * Generate default clarification - returns i18n_key for narration layer
   * @deprecated Use narration layer for text generation
   */
  private generateDefaultClarification(
    language: string,
    farmerMessage: string,
    cropName?: string
  ): string {
    // Return i18n key - narration layer handles actual text
    console.log('[Orchestrator] generateDefaultClarification - delegating to narration layer');
    return `clarification.default.${language}`;
  }
  
  /**
   * Generate clarification structure with i18n keys
   * Text rendering delegated to narration layer
   */
  private generateIntentMismatchClarification(
    language: string,
    cropName?: string
  ): { i18n_key: string; option_codes: string[] } {
    // Return symbolic structure - narration layer handles text
    console.log('[Orchestrator] generateIntentMismatchClarification - using i18n keys');
    return {
      i18n_key: 'clarification.intent_mismatch',
      option_codes: ['DISEASE_PEST_PROBLEM', 'NUTRIENT_WATER_MANAGEMENT', 'GENERAL_ADVICE']
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-14: Stage-Aware Fallback - Returns symbolic structure
  // Text generation delegated to narration layer
  // ═══════════════════════════════════════════════════════════════════════════
  private generateStageAwareFallback(
    cropCode: string,
    stage: string,
    symptomContext: string,
    daysSinceSowing: number,
    language: 'mr' | 'hi' | 'en' = 'mr'
  ): { i18n_key: string; action_codes: string[]; photoRequested: boolean; metadata: Record<string, any> } {
    console.log(`[STAGE_FALLBACK] ${cropCode}/${stage} (${daysSinceSowing} DAS)`);
    
    const stageAdvice = getStageSpecificAdvice(cropCode, stage);
    
    if (!stageAdvice) {
      console.log(`[STAGE_FALLBACK] No advice for ${cropCode}/${stage}, using generic`);
      return {
        i18n_key: 'fallback.generic.monitoring',
        action_codes: ['CONTINUE_MONITORING', 'TAKE_PHOTO'],
        photoRequested: true,
        metadata: { crop_code: cropCode, das: daysSinceSowing }
      };
    }
    
    // Return symbolic structure - narration layer handles i18n
    return {
      i18n_key: `fallback.stage.${cropCode.toLowerCase()}.${stage.toLowerCase()}`,
      action_codes: stageAdvice.action_codes || ['MONITOR', 'OBSERVE'],
      photoRequested: true,
      metadata: {
        crop_code: cropCode,
        stage_code: stage,
        das: daysSinceSowing
      'VEGETATIVE': { mr: 'वाढीचा काळ', hi: 'वनस्पति काल', en: 'vegetative' },
      'FLOWERING': { mr: 'फुलोरा', hi: 'फूलने का समय', en: 'flowering' },
      'SQUARING': { mr: 'कळी अवस्था', hi: 'कली अवस्था', en: 'squaring' }
    };
    
    const cropName = cropNames[cropCode.toUpperCase()]?.[language] || cropCode;
    const stageName = stageNames[stage.toUpperCase()]?.[language] || stage;
    
    // Build pest/disease watch lists for this stage
    const pestList = stageAdvice.pest_watch.slice(0, 3);
    const diseaseList = stageAdvice.disease_watch.slice(0, 2);
    
    // Generate response message based on language
    let message: string;
    
    if (language === 'mr') {
      message = `🌱 **${cropName} (${stageName} अवस्था - ${daysSinceSowing} दिवस)**\n\n`;
      message += `📍 तुमच्या समस्येचे निदान करण्यासाठी अधिक माहिती आवश्यक आहे.\n\n`;
      
      if (pestList.length > 0 || diseaseList.length > 0) {
        message += `⚠️ **या अवस्थेत सामान्य समस्या:**\n`;
        if (pestList.length > 0) message += `🐛 कीड: ${pestList.join(', ')}\n`;
        if (diseaseList.length > 0) message += `🦠 रोग: ${diseaseList.join(', ')}\n\n`;
      }
      
      message += `👉 **तपासण्याच्या गोष्टी:**\n`;
      stageAdvice.critical_actions.slice(0, 3).forEach((action, i) => {
        message += `${i + 1}. ${action}\n`;
      });
      
      message += `\n📸 **प्रभावित भागाचा फोटो पाठवा - त्यामुळे अचूक निदान होईल.**`;
    } else if (language === 'hi') {
      message = `🌱 **${cropName} (${stageName} अवस्था - ${daysSinceSowing} दिन)**\n\n`;
      message += `📍 आपकी समस्या का निदान करने के लिए अधिक जानकारी आवश्यक है.\n\n`;
      
      if (pestList.length > 0 || diseaseList.length > 0) {
        message += `⚠️ **इस अवस्था में सामान्य समस्याएं:**\n`;
        if (pestList.length > 0) message += `🐛 कीट: ${pestList.join(', ')}\n`;
        if (diseaseList.length > 0) message += `🦠 रोग: ${diseaseList.join(', ')}\n\n`;
      }
      
      message += `👉 **जाँच करने वाली बातें:**\n`;
      stageAdvice.critical_actions.slice(0, 3).forEach((action, i) => {
        message += `${i + 1}. ${action}\n`;
      });
      
      message += `\n📸 **प्रभावित भाग की फोटो भेजें - इससे सही निदान होगा.**`;
    } else {
      message = `🌱 **${cropName} (${stageName} stage - ${daysSinceSowing} DAS)**\n\n`;
      message += `📍 Need more information to diagnose your problem.\n\n`;
      
      if (pestList.length > 0 || diseaseList.length > 0) {
        message += `⚠️ **Common issues at this stage:**\n`;
        if (pestList.length > 0) message += `🐛 Pests: ${pestList.join(', ')}\n`;
        if (diseaseList.length > 0) message += `🦠 Diseases: ${diseaseList.join(', ')}\n\n`;
      }
      
      message += `👉 **Things to check:**\n`;
      stageAdvice.critical_actions.slice(0, 3).forEach((action, i) => {
        message += `${i + 1}. ${action}\n`;
      });
      
      message += `\n📸 **Please send a photo of the affected area for accurate diagnosis.**`;
    }
    
    console.log(`✅ [STAGE_FALLBACK] Generated stage-aware response for ${cropCode}/${stage}`);
    
    return {
      message,
      actions: stageAdvice.critical_actions,
      photoRequested: true
    };
  }
  
  /**
   * Generic fallback when no crop-stage advisor data is available
   */
  private generateGenericFallback(
    cropCode: string,
    daysSinceSowing: number,
    language: 'mr' | 'hi' | 'en'
  ): { message: string; actions: string[]; photoRequested: boolean } {
    // ✅ FIX: Translate crop names for proper Marathi/Hindi display
    const translatedCrop = this.translateCropName(cropCode, language);
    
    const messages: Record<string, string> = {
      mr: `🌾 तुमचे ${translatedCrop} पीक ${daysSinceSowing} दिवसांचे आहे.\n\n📍 समस्येचे अचूक निदान करण्यासाठी:\n\n• प्रभावित भागाचा फोटो पाठवा\n• किंवा लक्षणे स्पष्ट सांगा\n\n📷 फोटो पाठवल्यास योग्य उपाय सुचवता येईल.`,
      hi: `🌾 आपकी ${translatedCrop} फसल ${daysSinceSowing} दिन पुरानी है.\n\n📍 समस्या का सही निदान करने के लिए:\n\n• प्रभावित भाग की फोटो भेजें\n• या लक्षण स्पष्ट बताएं\n\n📷 फोटो भेजने पर सही उपाय बताया जा सकेगा.`,
      en: `🌾 Your ${translatedCrop} crop is ${daysSinceSowing} days old.\n\n📍 For accurate diagnosis:\n\n• Send photo of affected area\n• Or describe symptoms clearly\n\n📷 With a photo, I can suggest the right solution.`
    };
    
    return {
      message: messages[language] || messages['en'],
      actions: ['Monitor crop regularly', 'Send photo for diagnosis'],
      photoRequested: true
    };
  }
  
  /**
   * Translate crop code to local language name
   */
  private translateCropName(cropCode: string, language: 'mr' | 'hi' | 'en'): string {
    const CROP_NAMES: Record<string, Record<string, string>> = {
      'SUGARCANE': { mr: 'ऊस', hi: 'गन्ना', en: 'Sugarcane' },
      'COTTON': { mr: 'कापूस', hi: 'कपास', en: 'Cotton' },
      'SOYBEAN': { mr: 'सोयाबीन', hi: 'सोयाबीन', en: 'Soybean' },
      'RICE': { mr: 'भात', hi: 'धान', en: 'Rice' },
      'WHEAT': { mr: 'गहू', hi: 'गेहूं', en: 'Wheat' },
      'MAIZE': { mr: 'मका', hi: 'मक्का', en: 'Maize' },
      'TOMATO': { mr: 'टोमॅटो', hi: 'टमाटर', en: 'Tomato' },
      'ONION': { mr: 'कांदा', hi: 'प्याज', en: 'Onion' },
      'CHILLI': { mr: 'मिरची', hi: 'मिर्च', en: 'Chilli' },
      'GROUNDNUT': { mr: 'भुईमूग', hi: 'मूंगफली', en: 'Groundnut' },
      'TUR': { mr: 'तूर', hi: 'अरहर', en: 'Pigeon Pea' },
      'GRAM': { mr: 'हरभरा', hi: 'चना', en: 'Chickpea' },
      'BANANA': { mr: 'केळी', hi: 'केला', en: 'Banana' },
      'GRAPES': { mr: 'द्राक्षे', hi: 'अंगूर', en: 'Grapes' },
      'POMEGRANATE': { mr: 'डाळिंब', hi: 'अनार', en: 'Pomegranate' },
      'MANGO': { mr: 'आंबा', hi: 'आम', en: 'Mango' }
    };
    
    const normalized = cropCode?.toUpperCase() || '';
    return CROP_NAMES[normalized]?.[language] || cropCode;
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
        // PHASE-9.1: Clarification state fields
        pendingClarificationOptions?: string[];
        lockedCropContext?: {
          crop_name: string;
          growth_stage: string;
          days_since_sowing: number;
        };
      };
    } = {}
  ): Promise<OrchestratorResponse> {
    
    const startTime = Date.now();
    const agentsUsed: string[] = [];
    const traceId = options.traceId || `trace_${Date.now().toString(36)}`;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE-18: Layer timing infrastructure for 3-layer architecture visibility
    // ═══════════════════════════════════════════════════════════════════════════
    const layerTimings = {
      layer1_context: 0,     // Layer 1: Context loading & preprocessing
      layer2_understanding: 0, // Layer 2: LLM Understanding
      layer3_rules: 0,       // Layer 3: Rule Evaluation
      layer4_formatting: 0,  // Layer 4: LLM Response Formatting
      layer5_validation: 0   // Layer 5: Safety & Validation
    };
    
    console.log(`\n🚀 [${traceId}] Orchestrator v${ORCHESTRATOR_VERSION}: Starting full diagnostic flow...`);
    console.log(`   [${traceId}] Session: ${sessionId}`);
    console.log(`   [${traceId}] Message: ${farmerMessage.substring(0, 50)}...`);
    
    // PHASE 8: Log session context for debugging
    if (options.sessionState?.hasPreviousRecommendations) {
      console.log(`   [${traceId}] 🔗 Session Context: previousPest=${options.sessionState.previousPest}, previousCrop=${options.sessionState.previousCrop}, turn=${options.sessionState.turnCount}`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // LAYER 1: CONTEXT LOADING (No LLM)
    // ═══════════════════════════════════════════════════════════════════════════
    const layer1Start = Date.now();
    console.log('\n📦 [LAYER 1] Context Loading...');
    
    // Define landContext outside try block so it's accessible in catch
    let landContext: any = null;
    
    try {
      // ========================================
      // PHASE 0: FETCH LAND CONTEXT FIRST (Single Source of Truth)
      // ========================================
      if (options.landId) {
        landContext = await this.fetchComprehensiveLandContext(options.landId, farmerId);
        console.log('📍 [Orchestrator] Pre-fetched land context:', landContext ? 'SUCCESS' : 'EMPTY');
        if (landContext) {
          console.log(`   📊 crop_schedules data: crop=${landContext.current_crop}, sowing=${landContext.sowing_date}, stage=${landContext.growth_stage}`);
          
          // ═══════════════════════════════════════════════════════════════════════════
          // PHASE-20: STAGE-LOCKED CLARIFICATION
          // Lock the growth stage for the entire turn to ensure consistent clarification
          // ═══════════════════════════════════════════════════════════════════════════
          if (landContext.growth_stage && landContext.current_crop) {
            const stageSource = landContext.sowing_date ? 'CROP_SCHEDULE' : 'LAND_CONTEXT';
            lockStageForTurn(
              landContext.current_crop,
              landContext.growth_stage,
              landContext.days_since_sowing || 0,
              stageSource
            );
            
            logClarificationEvent(
              traceId,
              'STAGE_LOCK',
              landContext.growth_stage,
              0, 0, // No confidence yet
              { crop: landContext.current_crop, dos: landContext.days_since_sowing, source: stageSource }
            );
          }
        }
      }
      
      layerTimings.layer1_context = Date.now() - layer1Start;
      console.log(`   ✅ Layer 1 complete (${layerTimings.layer1_context}ms)`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-21: BUILD CANONICAL CONTEXT EXACTLY ONCE (HARD INVARIANT)
      // This is the SINGLE source of truth for the entire turn.
      // ═══════════════════════════════════════════════════════════════════════════
      const canonicalContext = buildCanonicalContextContract(landContext, !!landContext);
      
      if (canonicalContext) {
        console.log(`✅ [PHASE-21] CanonicalContext built and LOCKED:`);
        console.log(`   Scope=PHASE1_LOCKED`);
        console.log(`   Crop=${canonicalContext.crop_code} (INVARIANT)`);
        console.log(`   Stage=${canonicalContext.growth_stage} (INVARIANT)`);
        console.log(`   DAS=${canonicalContext.days_since_sowing} (INVARIANT)`);
        console.log(`   NDVI=${canonicalContext.ndvi.value} (INVARIANT)`);
        console.log(`   Source=${canonicalContext.source}`);
      } else {
        console.log(`📋 [PHASE-21] No canonical context (general query mode)`);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-19: PHOTO ANALYSIS EARLY PATH
      // If farmer uploaded a photo, analyze it BEFORE other processing
      // This enhances understanding with visual observations for rule evaluation
      // ═══════════════════════════════════════════════════════════════════════════
      let photoAnalysisResult: PhotoAnalysisOutput | null = null;
      if (options.photoUrl) {
        console.log('\n📸 [PHASE-19] Photo Analysis Path...');
        const photoAnalysisStart = Date.now();
        
        try {
          photoAnalysisResult = await analyzePhoto({
            image_url: options.photoUrl,
            farmer_message: farmerMessage,
            crop_context: landContext ? {
              crop_code: landContext.current_crop,
              growth_stage: landContext.growth_stage,
              days_since_sowing: landContext.days_since_sowing
            } : undefined,
            language: options.language || 'mr'
          });
          
          agentsUsed.push('PHOTO_ANALYZER');
          const photoTime = Date.now() - photoAnalysisStart;
          
          console.log(`   ✅ Photo analyzed (${photoTime}ms)`);
          console.log(`   Quality: ${photoAnalysisResult.image_quality.is_usable ? 'USABLE' : 'UNUSABLE'} (${(photoAnalysisResult.image_quality.quality_score * 100).toFixed(0)}%)`);
          console.log(`   Observations: ${photoAnalysisResult?.observations?.length ?? 0}`);
          console.log(`   Detected Issues: ${photoAnalysisResult?.detected_issues?.length ?? 0}`);
          console.log(`   Severity: ${photoAnalysisResult.severity_assessment.overall_severity}`);
          console.log(`   Urgency: ${photoAnalysisResult.severity_assessment.urgency}`);
          
          // If photo is unusable, request a better one
          if (!photoAnalysisResult.image_quality.is_usable) {
            console.log(`   ⚠️ Photo unusable - requesting retake`);
            return {
              type: 'PHOTO_REQUEST',
              session_id: sessionId,
              photo_instructions: {
                text_mr: `📷 फोटो स्पष्ट नाही. कृपया पुन्हा फोटो पाठवा.\n\n💡 टिप्स:\n• चांगल्या प्रकाशात\n• प्रभावित भागाचा जवळून\n• निरोगी भाग सोबत`,
                text_hi: `📷 फोटो स्पष्ट नहीं है। कृपया फिर से फोटो भेजें.\n\n💡 टिप्स:\n• अच्छी रोशनी में\n• प्रभावित क्षेत्र का करीब से\n• स्वस्थ भाग के साथ`,
                text_en: `📷 Photo is not clear. Please send again.\n\n💡 Tips:\n• In good lighting\n• Close-up of affected area\n• Include healthy part for comparison`,
                tips: photoAnalysisResult.image_quality.issues
              },
              metadata: {
                confidence: 0,
                safety_status: 'PHOTO_RETAKE_NEEDED',
                rules_applied: 0,
                processing_time_ms: Date.now() - startTime,
                agents_used: agentsUsed,
                trace_id: traceId,
                photo_quality_issues: photoAnalysisResult.image_quality.issues
              }
            };
          }
        } catch (photoError) {
          console.error(`   ❌ Photo analysis failed (non-blocking):`, photoError);
          agentsUsed.push('PHOTO_ANALYZER_FALLBACK');
        }
      }
      
      // ========================================
      // PHASE 0.3: UNIFIED QUERY ROUTER (NEW)
      // Categorizes farmer question into proper handling route
      // ========================================
      // Static import at top of file
      
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
      // PHASE-13: ROUTE GREETING THROUGH SYMBOLIC PIPELINE
      // No more early return - let greeting queries go through rule engine
      // ========================================
      if (queryRoute.route === 'GREETING') {
        console.log(`✅ [${traceId}] GREETING detected - routing through symbolic pipeline (PHASE-13)`);
        agentsUsed.push('SYMBOLIC_GREETING_PIPELINE');
        // Continue to full symbolic pipeline - will match greeting-specific rules
      }
      
      // ========================================
      // ========================================
      // PHASE 0.4B: GENERAL_INFO - RULE ENGINE DRIVEN (Not LLM Bypass)
      // ========================================
      // SYMBOLIC BRAIN PRINCIPLE: ALL queries go through Rule Engine
      // Even general queries get routed through symbolic decision path
      // LLM only RENDERS the decision, never MAKES it
      // ========================================
      // P0-5 FIX: GENERAL_INFO now continues to full symbolic pipeline
      // REMOVED: Early return with decision_brain_source=true without actual rule evaluation
      // General queries without land context now flow through the normal NLU + Rule Engine path
      if (queryRoute.route === 'GENERAL_INFO' && !options.landId) {
        console.log(`💬 [${traceId}] GENERAL_INFO without land - continuing to full symbolic pipeline (P0-5)`);
        agentsUsed.push('SYMBOLIC_GENERAL_PIPELINE');
        // No early return - continue to NLU and rule evaluation for proper symbolic decisions
      }
      
      // ========================================
      // PHASE-13: ROUTE IRRIGATION THROUGH SYMBOLIC PIPELINE
      // Previously: Early return with inline irrigation logic
      // Now: Authority check + continue to rule engine for CPWS rules
      // ========================================
      if (queryRoute.route === 'IRRIGATION_SCHEDULING' && landContext) {
        console.log(`💧 [${traceId}] IRRIGATION query - routing through symbolic pipeline with authority check`);
        
        // P1-2: Resolve authority BEFORE proceeding (static import at top)
        
        const irrigationAuthority = resolveDecisionAuthority({
          detected_causes: [],
          cross_crop_symptoms: [],
          land_context: {
            has_soil_health: !!landContext.soil_health,
            soil_ec: landContext.soil_health?.ec,
            waterlogging: landContext.waterlogging || false
          }
        });
        
        console.log(`   🚦 Authority: ${irrigationAuthority.authority} (${irrigationAuthority.authority_status})`);
        agentsUsed.push('AUTHORITY_RESOLVER');
        
        // If authority blocks irrigation (e.g., LAND due to waterlogging/salinity)
        if (irrigationAuthority.authority === DecisionAuthority.LAND || 
            irrigationAuthority.authority === DecisionAuthority.SAFETY) {
          console.log(`   🚫 IRRIGATION BLOCKED by ${irrigationAuthority.authority} authority`);
          
          const blockMessage = this.generateAuthorityBlockMessage(
            irrigationAuthority.authority,
            irrigationAuthority.reason,
            options.language || 'mr'
          );
          
          return {
            type: 'DECISION_PROVIDED',
            session_id: sessionId,
            communication: {
              message_id: crypto.randomUUID(),
              decision_id: `irrigation_blocked_${Date.now()}`,
              session_id: sessionId,
              farmer_id: farmerId,
              language: options.language || 'mr',
              format: 'RICH_TEXT',
              tone: 'CAUTIONARY',
              created_at: new Date().toISOString(),
              main_message: { full_text: { mr: blockMessage, hi: blockMessage, en: blockMessage } },
              quick_actions: [],
              metadata: {
                word_count: blockMessage.split(/\s+/).length,
                reading_time_seconds: 10,
                confidence_score: 0.9,
                source: 'AUTHORITY_RESOLVER',
                response_type: 'AUTHORITY_BLOCK'
              }
            } as any,
            decision_output: {
              decision_id: `irrigation_blocked_${Date.now()}`,
              session_id: sessionId,
              status: 'AUTHORITY_BLOCKED',
              decision_brain_source: true,
              authority_decision: irrigationAuthority,
              metadata: {
                confidence: 0.9,
                trace_id: traceId,
                processing_time_ms: Date.now() - startTime,
                agents_used: agentsUsed
              }
            } as any,
            metadata: {
              confidence: 0.9,
              safety_status: 'BLOCKED',
              rules_applied: 0,
              processing_time_ms: Date.now() - startTime,
              agents_used: agentsUsed,
              trace_id: traceId
            }
          };
        }
        
        // Authority allows irrigation - continue to symbolic pipeline
        // Water rules from bundled rules will be evaluated
        console.log(`   ✅ Authority allows irrigation - continuing to symbolic pipeline for CPWS rules`);
        agentsUsed.push('SYMBOLIC_IRRIGATION_PIPELINE');
        // No early return - continue to NLU + Rule Engine
      }
      
      // ========================================
      // PHASE-13: ROUTE CROP_HEALTH THROUGH SYMBOLIC PIPELINE
      // Previously: Early return with inline generateCropHealthResponse
      // Now: Authority check + continue to rule engine for nutrient/water rules
      // ========================================
      if (queryRoute.route === 'CROP_HEALTH' && landContext) {
        console.log(`🌱 [${traceId}] CROP_HEALTH query - routing through symbolic pipeline with authority check`);
        
        // P1-2: Resolve authority BEFORE proceeding (static import at top)
        
        const cropHealthAuthority = resolveDecisionAuthority({
          detected_causes: [],
          cross_crop_symptoms: [],
          land_context: {
            has_soil_health: !!landContext.soil_health,
            soil_ec: landContext.soil_health?.ec,
            waterlogging: landContext.waterlogging || false
          }
        });
        
        console.log(`   🚦 Authority: ${cropHealthAuthority.authority} (${cropHealthAuthority.authority_status})`);
        agentsUsed.push('AUTHORITY_RESOLVER', 'SYMBOLIC_CROP_HEALTH_PIPELINE');
        
        // Continue to full symbolic pipeline - bundled nutrient/water rules will be evaluated
        console.log(`   ✅ Continuing to symbolic pipeline for NDVI + soil + weather rule evaluation`);
        // No early return - continue to NLU + Rule Engine
      }
      
      // ========================================
      // PHASE 0.5: STATIC DATA GATE (CRITICAL - BEFORE AI)
      // ========================================
      // Check if query is about static land attributes - answer WITHOUT AI (static import at top)
      
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
      // PHASE 9.1-FIX PATCH 1+2: CLARIFICATION RESPONSE HARD GATE
      // When pending_options > 0, COMPLETELY SKIP NLU pipeline - only process option selection
      // This is the CRITICAL FIX to prevent infinite clarification loops
      // ========================================
      let pendingOptionsCount = options.sessionState?.pendingClarificationOptions?.length || 0;
      const clarificationTurnCount = options.sessionState?.turnCount || 0;
      
      // ========================================
      // NEW QUERY DETECTOR (CRITICAL FIX FOR DEADLOCK BUG)
      // Detect when farmer is asking a NEW question vs selecting an option
      // If NEW agricultural query detected, CLEAR pending options and proceed to NLU
      // ========================================
      if (pendingOptionsCount > 0) {
        // Run Language Induction FIRST to detect new agricultural symptoms
        const earlyInductionResult = induceCanonicalSymbols(farmerMessage);
        const hasNewSymptoms = earlyInductionResult.symptoms.length > 0;
        const hasNewCrop = earlyInductionResult.crop !== null;
        
        // Check if this looks like a new query rather than option selection
        const pendingOptions = options.sessionState?.pendingClarificationOptions || [];
        const isNumericSelection = /^[१२३४१२३४1-4]$/.test(farmerMessage.trim());
        const isOptionTextMatch = pendingOptions.some(opt => 
          farmerMessage.toLowerCase().includes(opt.toLowerCase().slice(0, 10)) ||
          opt.toLowerCase().includes(farmerMessage.toLowerCase())
        );
        const isLikelyNewQuery = (hasNewSymptoms || hasNewCrop) && 
          !isNumericSelection && 
          !isOptionTextMatch && 
          farmerMessage.length > 20;
        
        // Agricultural symptom keywords that indicate a NEW problem
        const newProblemKeywords = [
          'problem', 'issue', 'help', 'damage', 'attack', 'disease', 'pest',
          // English urgent
          'dying', 'dead', 'wilting', 'yellowing', 'spots', 'holes',
          // Marathi/Hindi urgent (detected via Language Induction)
        ];
        const hasNewProblemKeyword = newProblemKeywords.some(kw => 
          farmerMessage.toLowerCase().includes(kw)
        );
        
        const isNewAgriculturalQuery = isLikelyNewQuery || (hasNewProblemKeyword && !isNumericSelection && !isOptionTextMatch);
        
        if (isNewAgriculturalQuery) {
          console.log('🆕 [NewQueryDetector] NEW agricultural query detected - clearing stale clarification');
          console.log(`   Symptoms detected: ${earlyInductionResult.symptoms.map(s => s.symbol).join(', ')}`);
          console.log(`   Crop detected: ${earlyInductionResult.crop?.symbol || 'none'}`);
          console.log(`   Clearing ${pendingOptionsCount} pending options to proceed with fresh NLU`);
          
          // CLEAR pending options - this is a NEW query, not an option selection
          pendingOptionsCount = 0;
          if (options.sessionState) {
            options.sessionState.pendingClarificationOptions = undefined;
            options.sessionState.pendingClarificationScope = undefined;
          }
          // Fall through to regular NLU pipeline
        }
      }
      
      if (pendingOptionsCount > 0) {
        console.log('🔒 [Phase9.1-Fix] Clarification HARD GATE active - NLU pipeline BLOCKED');
        console.log(`   📋 Pending options: ${pendingOptionsCount}, Turn count: ${clarificationTurnCount}`);
        
        // PHASE-9.1-FIX: Retrieve locked crop context FIRST - this is authoritative
        const lockedCropContext = options.sessionState?.lockedCropContext;
        const pendingOptions = options.sessionState?.pendingClarificationOptions || [];
        const pendingScope = options.sessionState?.pendingClarificationScope as ClarificationScope || ClarificationScope.IDENTIFY_DISTRIBUTION;
        
        // PATCH 2: NULL-SAFE option matching
        const matchResult = matchFarmerResponseToOption(farmerMessage, pendingOptions);
        
        // ═══════════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: Extract observation_key from frontend message if embedded
        // Frontend sends: "Label text [obs_keys:OBSERVATION_KEY1,OBSERVATION_KEY2]"
        // ═══════════════════════════════════════════════════════════════════════════
        const obsKeysMatch = farmerMessage.match(/\[obs_keys:([^\]]+)\]/);
        const embeddedObservationKeys = obsKeysMatch ? obsKeysMatch[1].split(',').filter(k => k.trim()) : [];
        
        // PATCH 2: NULL-SAFE - matchResult always returns a valid object now
        if (matchResult.matched && matchResult.matched_option) {
          console.log(`   ✅ Farmer selected option ${(matchResult.option_index || 0) + 1}: "${matchResult.matched_option}"`);
          
          // CRITICAL: Clear pending options and continue with ONLY the selected option
          console.log('   🔓 Clearing clarification lock, processing selected option only');
          
          // CRITICAL FIX: Use embedded observation key if available, else fall back to mapping
          let mappedObservationKey: string | null = null;
          if (embeddedObservationKeys.length > 0) {
            mappedObservationKey = embeddedObservationKeys[0];
            console.log(`   📋 Using EMBEDDED ObservationKey: "${mappedObservationKey}"`);
          } else {
            // PHASE-10 FIX: Map the option to observation using CORRECT parameters (option, scope)
            mappedObservationKey = mapOptionToObservation(matchResult.matched_option, pendingScope);
            console.log(`   📋 Mapped to ObservationKey (fallback): "${mappedObservationKey || 'UNKNOWN'}"`);
          }
          // ═══════════════════════════════════════════════════════════════════
          // CLARIFICATION-FIRST: CANONICAL STATE REBUILD AFTER CLARIFICATION
          // Log pre-clarification state and rebuild with new symbols
          // ═══════════════════════════════════════════════════════════════════
          
          // Track pre-clarification confidence for logging
          const preClarificationConfidence = options.sessionState?.confidence || 0.5;
          
          // FIX B (CRITICAL): Get land context for rule evaluation - use pre-fetched landContext
          let landContextForOptionSelection = landContext;
          if (!landContextForOptionSelection && options.landId) {
            console.log(`   🔄 [FIX B] Re-fetching landContext for OPTION_SELECTED path`);
            landContextForOptionSelection = await this.fetchComprehensiveLandContext(options.landId, farmerId) || undefined;
          }
          
          // P0-2 FIX: Determine crop and stage with source tracking
          // CLARIFICATION-FIRST: Use locked stage from clarification-strategy if available
          const lockedStageFromStrategy = getLockedStage();
          const cropName = lockedStageFromStrategy?.crop_code || 
                          lockedCropContext?.crop_name || 
                          landContextForOptionSelection?.current_crop || 'UNKNOWN';
          
          // STAGE-LOCKED: Use locked stage from clarification strategy, else fall back
          const growthStage = lockedStageFromStrategy?.growth_stage ||
                              lockedCropContext?.growth_stage || 
                              landContextForOptionSelection?.growth_stage || 'VEGETATIVE';
          const hasAuthorativeStage = !!(lockedStageFromStrategy?.growth_stage || 
                                         lockedCropContext?.growth_stage || 
                                         landContextForOptionSelection?.growth_stage);
          const stageSource = lockedStageFromStrategy?.growth_stage ? 'LOCKED_STRATEGY' :
                              lockedCropContext?.growth_stage ? 'LOCKED_CONTEXT' : 
                              landContextForOptionSelection?.growth_stage ? 'LAND_CONTEXT' : 'DEFAULT';
          
          // LOGGING: Track clarification event
          logClarificationEvent(
            traceId,
            'SELECTION_RECEIVED',
            growthStage,
            preClarificationConfidence,
            preClarificationConfidence, // Will be updated after rule eval
            {
              selected_option: matchResult.matched_option,
              mapped_observation: mappedObservationKey,
              stage_source: stageSource,
              pending_scope: pendingScope
            }
          );
          
          // P0-2: Log warning if using default stage
          if (stageSource === 'DEFAULT') {
            console.warn(`   ⚠️ [P0-2] Using DEFAULT stage (VEGETATIVE) - no authoritative source available`);
          } else {
            console.log(`   ✅ [P0-2] Stage source: ${stageSource}, value: ${growthStage}`);
          }
          
          // CANONICAL STATE REBUILD: Map selection to symbols
          const existingSymbols = options.sessionState?.symbols || [];
          const rebuildResult = mapClarificationSelectionToSymbols(
            {
              id: mappedObservationKey || 'unknown',
              label: matchResult.matched_option,
              observation_key: mappedObservationKey || 'SYMPTOM_REPORTED',
              rule_id: 'CLARIFICATION_SELECTION',
              confidence_boost: 0.15
            },
            existingSymbols
          );
          console.log(`   📊 [CanonicalRebuild] Symbols: ${existingSymbols.length} → ${rebuildResult.length}`);
          
          // Map the selected option to a visual symptom for the canonical state
          const visualSymptom = mapDistributionToSymptom(matchResult.matched_option, pendingScope);
          
          console.log(`   🌾 Building canonical state: crop=${cropName}, stage=${growthStage} (${stageSource}), symptom=${visualSymptom}`);
          
          // P0-1 FIX: Call authority resolver BEFORE rule evaluation (static import at top)
          const authorityInput = {
            detected_causes: [],  // Will be populated by rule engine
            cross_crop_symptoms: visualSymptom ? [visualSymptom] : [],
            land_context: landContextForOptionSelection ? {
              has_soil_health: !!landContextForOptionSelection.soil_health,
              soil_ec: landContextForOptionSelection.soil_health?.ec,
              waterlogging: landContextForOptionSelection.waterlogging
            } : undefined
          };
          const authorityDecision = resolveDecisionAuthority(authorityInput);
          
          console.log(`   🔐 [P0-1] Authority resolved: ${authorityDecision.authority}, Status: ${authorityDecision.authority_status}`);
          console.log(`   📋 Treatments allowed: ${authorityDecision.treatments_allowed}, Response mode: ${authorityDecision.response_mode}`);
          
          // Build canonical state with the clarification answer
          const canonicalState = buildCanonicalState({
            crop_type: mapCropNameToEnum(cropName),
            crop_stage: mapStageToEnum(growthStage),
            visual_symptom: mapVisualSymptomToEnum(visualSymptom),
            data_confidence: hasAuthorativeStage ? DataConfidence.MEDIUM : DataConfidence.LOW,
            // Include previous observations from session if available
            ndvi_level: options.sessionState?.ndvi_level,
            ndvi_trend: options.sessionState?.ndvi_trend,
            soil_nitrogen: options.sessionState?.soil_nitrogen
          });
          
          console.log(`   📊 Canonical state built, running layered rule evaluation...`);
          
          // PHASE-13: Use getAllRulesWithBundled() for complete rule coverage (ASYNC)
          const allRulesForOption = await getAllRulesWithBundled();
          console.log(`   📦 Total rules for option selection: ${allRulesForOption.length}`);
          
          // Pass user_query for keyword matching
          const stateWithQuery = { ...canonicalState, user_query: farmerMessage };
          const ruleResult = evaluateRulesLayered(allRulesForOption, stateWithQuery as any);
          
          console.log(`   ✅ Rules matched: ${ruleResult.rules_matched}, Applied: ${ruleResult.rules_applied.length}`);
          console.log(`   📋 Diagnoses: ${ruleResult.diagnoses.length}, Prescriptions: ${ruleResult.prescriptions.length}, Responses: ${ruleResult.matched_responses?.length || 0}`);
          
          // CRITICAL FIX: Check for matched_responses even when prescriptions are empty
          const hasMatchedResponses = ruleResult.matched_responses && ruleResult.matched_responses.length > 0;
          
          // ═══════════════════════════════════════════════════════════════════
          // CLARIFICATION-FIRST: DECISION GATE ALIGNMENT
          // If clarification completed + rules fire → MUST return recommendation
          // ═══════════════════════════════════════════════════════════════════
          
          const decisionGateCheck = checkDecisionGateAlignment({
            clarification_completed: true, // We just processed a clarification selection
            rules_fired: ruleResult.rules_matched,
            has_recommendations: ruleResult.prescriptions.length > 0 || hasMatchedResponses,
            authority_blocked: !authorityDecision.treatments_allowed
          });
          
          // LOGGING: Post-clarification confidence
          const postClarificationConfidence = calculateConfidenceWithTiming(
            ruleResult.confidence_in_result,
            true, // clarification completed
            0.15  // boost from clarification
          );
          
          logClarificationEvent(
            traceId,
            'DECISION_GATE',
            growthStage,
            preClarificationConfidence,
            postClarificationConfidence.post_clarification_confidence,
            {
              rules_fired: ruleResult.rules_matched,
              must_return_recommendation: decisionGateCheck.must_return_recommendation,
              allow_empty_response: decisionGateCheck.allow_empty_response,
              gate_reason: decisionGateCheck.reason
            }
          );
          
          // If we got rule matches, return them for LLM formatting
          if (ruleResult.rules_matched > 0 && (ruleResult.diagnoses.length > 0 || ruleResult.prescriptions.length > 0 || hasMatchedResponses)) {
            // FIX: Build dataAudit for OPTION_SELECTED path to preserve land context
            const dataAuditForOption = this.buildDataAudit(landContextForOptionSelection, null);
            
            // FIX A (CRITICAL): Build proper lockedCropContext for return
            const finalLockedCropContext = lockedCropContext || {
              crop_name: cropName,
              growth_stage: growthStage,
              days_since_sowing: landContextForOptionSelection?.days_since_sowing
            };
            
            // PHASE-16: Safe array handling - prevent .map() crashes
            // CRITICAL: Use matched_responses to build actions when prescriptions are blocked
            const safePrescriptions = Array.isArray(ruleResult.prescriptions) ? ruleResult.prescriptions : [];
            const safeMatchedResponses = Array.isArray(ruleResult.matched_responses) ? ruleResult.matched_responses : [];
            
            const actionsToReturn = safePrescriptions.length > 0 
              ? safePrescriptions.filter(p => p != null).map(p => ({
                  action_type: p.action_type || 'RECOMMEND',
                  action_details: p.action_details || {},
                  product_reference: p.product_reference,
                  rule_id: 'RULE_ENGINE'
                }))
              : safeMatchedResponses.length > 0 
                ? safeMatchedResponses.slice(0, 3).filter(r => r != null).map(r => ({
                    action_type: 'OBSERVATION_ADVICE',
                    action_details: {
                      response_mr: r.response_mr,
                      response_hi: r.response_hi,
                      response_en: r.response_en
                    },
                    product_reference: r.rule_id,
                    rule_id: r.rule_id
                  }))
                : [];
            
            // CRITICAL: Get the best response text for status determination
            const primaryResponse = hasMatchedResponses ? ruleResult.matched_responses[0] : null;
            const statusToUse = ruleResult.prescriptions.length > 0 ? 'DIAGNOSIS_COMPLETE' : 'OBSERVATION_PROVIDED';
            
            // ═══════════════════════════════════════════════════════════════════════════
            // CRITICAL FIX: Build proper primary_decision object from layered_rule_result
            // This MUST be a PrimaryDecision object, NOT a string
            // ═══════════════════════════════════════════════════════════════════════════
            const layeredPrimaryDecision = ruleResult.primary_decision;
            let primaryDecisionObject: any = null;
            
            if (layeredPrimaryDecision && layeredPrimaryDecision.rule_id && layeredPrimaryDecision.action_type) {
              // Use the properly built PrimaryDecision from LayeredRuleEvaluator
              primaryDecisionObject = {
                action_type: layeredPrimaryDecision.action_type,
                rule_id: layeredPrimaryDecision.rule_id,
                specific_action: layeredPrimaryDecision.action_type,
                target: {},
                urgency: layeredPrimaryDecision.action_type === 'BLOCK' || layeredPrimaryDecision.action_type === 'URGENT_TREATMENT' ? 'IMMEDIATE' : 'WITHIN_24H',
                priority: layeredPrimaryDecision.priority,
                timing: {
                  recommended_start: new Date().toISOString(),
                  recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                  weather_dependency: false,
                  reason: 'Built from layered_rule_result.primary_decision in OPTION_SELECTED path'
                },
                application_details: {
                  product_name: layeredPrimaryDecision.action_text?.includes('Apply') ? 'See action text' : 'Cultural practice',
                  product_type: 'IPM',
                  action_text: layeredPrimaryDecision.action_text,
                  reason_text: layeredPrimaryDecision.reason_text,
                  knowledge_text: layeredPrimaryDecision.knowledge_text,
                  i18n_key: layeredPrimaryDecision.i18n_key,
                  response_mr: layeredPrimaryDecision.response_mr,
                  response_hi: layeredPrimaryDecision.response_hi,
                  response_en: layeredPrimaryDecision.response_en,
                  rule_id: layeredPrimaryDecision.rule_id
                },
                expected_outcomes: {
                  efficacy_percent: Math.round((layeredPrimaryDecision.confidence_score || 0.75) * 100),
                  time_to_visible_effect_days: '3-5',
                  success_indicators: []
                }
              };
              
              console.log(`   ✅ PRIMARY_DECISION built from layered_rule_result: rule_id=${layeredPrimaryDecision.rule_id}, action_type=${layeredPrimaryDecision.action_type}`);
            } else if (safeMatchedResponses.length > 0) {
              // Fallback: Build from first eligible matched response
              const firstMatch = safeMatchedResponses.find(r => r.rule_id && r.action_type);
              if (firstMatch) {
                primaryDecisionObject = {
                  action_type: firstMatch.action_type,
                  rule_id: firstMatch.rule_id,
                  specific_action: firstMatch.action_type,
                  target: {},
                  urgency: 'WITHIN_24H',
                  priority: firstMatch.priority || 50,
                  timing: {
                    recommended_start: new Date().toISOString(),
                    recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                    weather_dependency: false,
                    reason: 'Built from matched_responses fallback in OPTION_SELECTED path'
                  },
                  application_details: {
                    product_name: 'See action text',
                    product_type: 'IPM',
                    action_text: firstMatch.action_text,
                    reason_text: firstMatch.reason_text,
                    knowledge_text: firstMatch.knowledge_text,
                    i18n_key: firstMatch.i18n_key,
                    response_mr: firstMatch.response_mr,
                    response_hi: firstMatch.response_hi,
                    response_en: firstMatch.response_en,
                    rule_id: firstMatch.rule_id
                  },
                  expected_outcomes: {
                    efficacy_percent: 75,
                    time_to_visible_effect_days: '3-5',
                    success_indicators: []
                  }
                };
                
                console.log(`   ✅ PRIMARY_DECISION built from matched_responses: rule_id=${firstMatch.rule_id}, action_type=${firstMatch.action_type}`);
              }
            }
            
            if (!primaryDecisionObject) {
              console.error(`   🚨 OPTION_SELECTED: Failed to build primary_decision - no eligible source found`);
            }
            
            return {
              type: 'DECISION_PROVIDED',
              session_id: sessionId,
              decision_output: {
                decision_id: `rule_${Date.now()}`,
                session_id: sessionId,
                status: statusToUse,
                decision_brain_source: true,
                // FIX A (CRITICAL): Include authority_decision to prevent default to NONE
                authority_decision: authorityDecision,
                // ═══════════════════════════════════════════════════════════════════════════
                // CRITICAL FIX: primary_decision MUST be an object, NOT a string!
                // ═══════════════════════════════════════════════════════════════════════════
                primary_decision: primaryDecisionObject,
                // CRITICAL: Attach layered_rule_result for recovery in index.ts
                layered_rule_result: {
                  primary_decision: ruleResult.primary_decision,
                  matched_responses: ruleResult.matched_responses
                },
                actions_returned: actionsToReturn,
                // CRITICAL: Include matched_responses for LLM to use
                matched_responses: ruleResult.matched_responses,
                warnings: ruleResult.warnings,
                metadata: {
                  confidence: ruleResult.confidence_in_result,
                  trace_id: traceId,
                  processing_time_ms: Date.now() - startTime,
                  agents_used: [...agentsUsed, 'OPTION_SELECTION_HANDLER', 'LAYERED_RULE_EVALUATOR'],
                  rules_applied: ruleResult.rules_applied,
                  clarification_resolved: true,
                  selected_option: matchResult.matched_option,
                  mapped_observation: mappedObservationKey,
                  prescription_allowed: ruleResult.prescription_allowed,
                  prescription_gate_reason: ruleResult.prescription_gate_reason,
                  // FIX: Include locked crop context in metadata
                  lockedCropContext: finalLockedCropContext
                }
              } as any,
              // FIX: Include dataAudit to preserve land context
              dataAudit: dataAuditForOption,
              metadata: {
                confidence: ruleResult.confidence_in_result,
                safety_status: ruleResult.safety_blocks.length > 0 ? 'BLOCKED' : 'SAFE',
                rules_applied: ruleResult.rules_matched,
                processing_time_ms: Date.now() - startTime,
                agents_used: [...agentsUsed, 'OPTION_SELECTION_HANDLER', 'LAYERED_RULE_EVALUATOR'],
                trace_id: traceId,
                // CRITICAL: Clear pending options after successful selection
                pendingClarificationOptions: undefined,
                pendingClarificationScope: undefined,
                // PATCH 3: Preserve locked crop context for next turn
                lockedCropContext: finalLockedCropContext
              }
            };
          }
          
          // ═══════════════════════════════════════════════════════════════════
          // PHASE-14: NO RULES MATCHED - Use Stage-Aware Fallback
          // Instead of generic "समजले", provide crop-stage-specific advice
          // ═══════════════════════════════════════════════════════════════════
          console.log(`⚠️ [OPTION_SELECTED] No rules matched for ${cropName}/${growthStage} - using stage-aware fallback`);
          
          // FIX: Build dataAudit for OPTION_SELECTED path to preserve land context
          const dataAuditNoRules = this.buildDataAudit(landContextForOptionSelection, null);
          
          // FIX A (CRITICAL): Build proper lockedCropContext for no-rules path
          const finalLockedCropContextNoRules = lockedCropContext || {
            crop_name: cropName,
            growth_stage: growthStage,
            days_since_sowing: landContextForOptionSelection?.days_since_sowing
          };
          
          // PHASE-14: Generate stage-aware fallback response
          const stageFallback = this.generateStageAwareFallback(
            cropName || 'UNKNOWN',
            growthStage || 'UNKNOWN',
            matchResult.matched_option || farmerMessage,
            landContextForOptionSelection?.days_since_sowing || 0,
            options.language || 'mr'
          );
          
          return {
            type: 'DECISION_PROVIDED',
            session_id: sessionId,
            decision_output: {
              decision_id: `option_selected_stage_fallback_${Date.now()}`,
              session_id: sessionId,
              status: 'STAGE_FALLBACK',
              decision_brain_source: true,
              // FIX A (CRITICAL): Include authority_decision to prevent default to NONE
              authority_decision: authorityDecision,
              // PHASE-14: Include stage-aware fallback message
              stage_fallback_message: stageFallback.message,
              stage_fallback_actions: stageFallback.actions,
              photo_requested: stageFallback.photoRequested,
              actions_returned: [],
              metadata: {
                confidence: 0.6, // Lower confidence since no rules matched
                trace_id: traceId,
                processing_time_ms: Date.now() - startTime,
                agents_used: [...agentsUsed, 'OPTION_SELECTION_HANDLER', 'STAGE_FALLBACK'],
                clarification_resolved: true,
                selected_option: matchResult.matched_option,
                mapped_observation: mappedObservationKey,
                rules_evaluated: ruleResult.rules_evaluated,
                rules_matched: 0,
                no_rules_matched_reason: `Stage-aware fallback for ${cropName}/${growthStage}`,
                // FIX: Include locked crop context in metadata
                lockedCropContext: finalLockedCropContextNoRules
              }
            } as any,
            // FIX: Include dataAudit to preserve land context
            dataAudit: dataAuditNoRules,
            metadata: {
              confidence: 0.6,
              safety_status: 'SAFE',
              rules_applied: 0,
              processing_time_ms: Date.now() - startTime,
              agents_used: [...agentsUsed, 'OPTION_SELECTION_HANDLER', 'STAGE_FALLBACK'],
              trace_id: traceId,
              pendingClarificationOptions: undefined,
              pendingClarificationScope: undefined,
              lockedCropContext: finalLockedCropContextNoRules
            }
          };
        } else {
          // PHASE-9.1-FIX: Farmer did NOT select a valid option - RETURN REMINDER IMMEDIATELY
          // DO NOT continue to NLU pipeline - this is the HARD GATE
          console.log('⚠️ [ClarificationGate] No valid option selected — returning reminder (NLU BLOCKED)');
          
          const reminderMessages: Record<string, string> = {
            mr: `🌾 कृपया वरीलपैकी एक पर्याय निवडा (1, 2, 3 किंवा पूर्ण मजकूर टाइप करा).\n\n${pendingOptions.map((opt, i) => `${i + 1}️⃣ ${opt}`).join('\n')}`,
            hi: `🌾 कृपया ऊपर दिए गए विकल्पों में से एक चुनें (1, 2, 3 या पूरा पाठ टाइप करें).\n\n${pendingOptions.map((opt, i) => `${i + 1}️⃣ ${opt}`).join('\n')}`,
            en: `🌾 Please select one of the options above (type 1, 2, 3 or the full text).\n\n${pendingOptions.map((opt, i) => `${i + 1}️⃣ ${opt}`).join('\n')}`
          };
          
          const lang = options.language || 'en';
          const reminderText = reminderMessages[lang] || reminderMessages['en'];
          
          // PHASE-9.1-FIX: HARD RETURN - Return clarification reminder and STOP
          // This is the CRITICAL gate that prevents NLU from running
          return {
            type: 'CLARIFICATION_QUESTION',
            session_id: sessionId,
            question: {
              question_id: `clarification_reminder_${Date.now()}`,
              text_mr: reminderMessages['mr'],
              text_hi: reminderMessages['hi'],
              text_en: reminderMessages['en'],
              options: pendingOptions.map((opt, idx) => ({
                value: String(idx + 1),
                label: opt
              }))
            },
            metadata: {
              confidence: 0.5,
              safety_status: 'CLARIFICATION_PENDING',
              rules_applied: 0,
              processing_time_ms: Date.now() - startTime,
              agents_used: ['CLARIFICATION_HARD_GATE'],
              trace_id: traceId,
              // PATCH 1: PRESERVE pending options - keeps clarification lock active
              pendingClarificationOptions: pendingOptions,
              // PATCH 3: PRESERVE locked crop context - prevents re-asking crop
              lockedCropContext: lockedCropContext,
              clarification_reminder: true
            }
          };
        }
        
        // UNREACHABLE: Both branches above return, so we never continue to NLU
        // This comment documents that the hard gate is complete
      }
      
      // ========================================
      // PHASE 0.4A: NEW QUERY PATH (No pending options)
      // Only reaches here if pendingOptionsCount === 0 (fresh query)
      // ========================================
      console.log('\n🔢 PHASE 0.4A: Fresh Query Detection...');
      
      // Track if farmer selected an option - used to bypass clarification later
      let bypassClarification = false;
      
      // PHASE-9.1-FIX PATCH 3: Initialize locked crop context from session state OR land context
      // This protects against crop context being lost during any clarification retries
      let lockedCropContext: { crop_name: string; growth_stage: string; days_since_sowing: number } | null = 
        options.sessionState?.lockedCropContext || null;
      
      // Detect numeric/Devanagari option selection patterns for logging only
      const isNumberSelection = /^[१२३४1-4]$/.test(farmerMessage.trim());
      
      console.log(`   📋 Input: "${farmerMessage}" | IsNumber: ${isNumberSelection} | Fresh query mode`);
      console.log(`   🔐 LockedCropContext: ${lockedCropContext ? lockedCropContext.crop_name : 'none (will derive from land context)'}`);
      
      let processedFarmerMessage = farmerMessage;
      let matchedObservation: { observation: string; likely_cause: string } | null = null;
      
      // ========================================
      // PHASE 1: MASTER PROMPT v3 - 5-STAGE UNDERSTANDING PIPELINE
      // Stage 1: Language Normalization
      // Stage 2: Observation Extraction
      // Stage 3: Symbol Canonicalization (in Phase 2.5)
      // Stage 4: Understanding Completeness Check
      // Stage 5: Diagnosis & Prescription (in Phase 4)
      // ========================================
      // ═══════════════════════════════════════════════════════════════════════════
      // LAYER 2: LLM UNDERSTANDING (Semantic Extraction)
      // ═══════════════════════════════════════════════════════════════════════════
      const layer2Start = Date.now();
      console.log('\n🧠 [LAYER 2] LLM Understanding Pipeline...');
      
      // ═══════════════════════════════════════════════════════════════════════════
      // STAGE 1: LANGUAGE NORMALIZATION (LLM, FLEXIBLE)
      // Clean farmer input - remove emotion, filler. NO intent, NO cause, NO codes.
      // ═══════════════════════════════════════════════════════════════════════════
      console.log('   📝 Stage 1: Language Normalization...');
      
      // Static import at top of file
      const normalizedInput = normalizeLanguage(processedFarmerMessage);
      agentsUsed.push('LANGUAGE_NORMALIZER');
      
      console.log(`      Original: "${normalizedInput.original_text.substring(0, 50)}..."`);
      console.log(`      Normalized: "${normalizedInput.normalized_text.substring(0, 50)}..."`);
      console.log(`      Language: ${normalizedInput.detected_language}, Removed: ${normalizedInput.removed_elements.length} elements`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // STAGE 1.5: UNIVERSAL SEMANTIC EXTRACTION (Phase 21 - LLM-Based)
      // Uses LLM to extract semantic meaning in ANY language → plain English
      // Then deterministic mapper converts English → ObservationKeys
      // ═══════════════════════════════════════════════════════════════════════════
      console.log(`\n   🔮 Stage 1.5: Universal Semantic Extractor (v${SEMANTIC_EXTRACTOR_VERSION})...`);
      
      // STEP 1: LLM extracts semantic meaning (any language → English)
      const semanticExtraction: SemanticExtraction = await extractSemanticMeaning(
        processedFarmerMessage, 
        normalizedInput.detected_language
      );
      agentsUsed.push('SEMANTIC_EXTRACTOR');
      
      // STEP 2: Deterministic mapper converts English → ObservationKeys
      const mappedCodes: MappedObservationCodes = mapToObservationCodes(semanticExtraction);
      agentsUsed.push('OBSERVATION_CODE_MAPPER');
      
      console.log(`      Concern: "${semanticExtraction.farmer_concern.substring(0, 60)}..."`);
      console.log(`      Parts: [${semanticExtraction.affected_plant_parts.join(', ')}]`);
      console.log(`      Changes: [${semanticExtraction.visual_changes.slice(0, 3).join(', ')}${semanticExtraction.visual_changes.length > 3 ? '...' : ''}]`);
      console.log(`      Codes: [${mappedCodes.observation_codes.slice(0, 5).join(', ')}${mappedCodes.observation_codes.length > 5 ? '...' : ''}]`);
      console.log(`      Confidence: ${(semanticExtraction.confidence * 100).toFixed(0)}%, Method: ${semanticExtraction.extraction_method}`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // LEGACY FALLBACK: Language Induction Layer (for backward compatibility)
      // Still runs to provide inductionResult for existing code paths
      // ═══════════════════════════════════════════════════════════════════════════
      console.log(`\n   🔤 Stage 1.5b: Legacy Induction (v${LANGUAGE_INDUCTION_VERSION}) [FALLBACK]...`);
      
      const inductionResult: LanguageInductionResult = induceCanonicalSymbols(processedFarmerMessage);
      agentsUsed.push('LANGUAGE_INDUCTION_LAYER');
      
      console.log(`      ${getInductionSummary(inductionResult)}`);
      console.log(`      Symptoms: [${getSymptomSymbolsForRules(inductionResult).join(', ')}]`);
      console.log(`      Crop: ${getCropSymbolForRules(inductionResult)}`);
      console.log(`      Symbol coverage: ${(inductionResult.symbol_coverage * 100).toFixed(0)}%`);
      console.log(`      Aggregate confidence: ${(inductionResult.aggregated_confidence * 100).toFixed(0)}%`);
      console.log(`      Total symbols: ${inductionResult.total_symbols_extracted}`);
      if (inductionResult.unmapped_tokens.length > 0) {
        console.log(`      Unmapped tokens: ${inductionResult.unmapped_tokens.slice(0, 5).join(', ')}${inductionResult.unmapped_tokens.length > 5 ? '...' : ''}`);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: MERGE LLM SEMANTIC EXTRACTION INTO INDUCTION RESULT
      // The new LLM-based mappedCodes.observation_codes must be injected into
      // inductionResult.symptoms so they flow through to clarification & rules
      // ═══════════════════════════════════════════════════════════════════════════
      if (mappedCodes.observation_codes.length > 0) {
        console.log(`      🔄 MERGING ${mappedCodes.observation_codes.length} LLM-extracted codes into induction result`);
        
        // Convert ObservationKey codes to symptom symbols for the induction result
        for (const code of mappedCodes.observation_codes) {
          // Check if symptom already exists in inductionResult
          const existingSymptom = inductionResult.symptoms.find(s => s.symbol === code);
          if (!existingSymptom) {
            inductionResult.symptoms.push({
              symbol: code,
              confidence: semanticExtraction.confidence,
              source: 'LLM_SEMANTIC_EXTRACTOR'
            });
            inductionResult.total_symbols_extracted++;
          }
        }
        
        // Add affected part and distribution from LLM extraction
        if (mappedCodes.affected_part_code) {
          const existingPart = inductionResult.symptoms.find(s => s.symbol === mappedCodes.affected_part_code);
          if (!existingPart) {
            inductionResult.symptoms.push({
              symbol: mappedCodes.affected_part_code,
              confidence: semanticExtraction.confidence,
              source: 'LLM_SEMANTIC_EXTRACTOR'
            });
            inductionResult.total_symbols_extracted++;
          }
        }
        
        if (mappedCodes.distribution_code) {
          const existingDist = inductionResult.symptoms.find(s => s.symbol === mappedCodes.distribution_code);
          if (!existingDist) {
            inductionResult.symptoms.push({
              symbol: mappedCodes.distribution_code,
              confidence: semanticExtraction.confidence,
              source: 'LLM_SEMANTIC_EXTRACTOR'
            });
            inductionResult.total_symbols_extracted++;
          }
        }
        
        if (mappedCodes.severity_code) {
          const existingSev = inductionResult.symptoms.find(s => s.symbol === mappedCodes.severity_code);
          if (!existingSev) {
            inductionResult.symptoms.push({
              symbol: mappedCodes.severity_code,
              confidence: semanticExtraction.confidence,
              source: 'LLM_SEMANTIC_EXTRACTOR'
            });
            inductionResult.total_symbols_extracted++;
          }
        }
        
        // Update symbol coverage based on merged symptoms
        inductionResult.symbol_coverage = Math.min(1.0, inductionResult.symptoms.length / 8); // 8 is approx max symptoms
        inductionResult.aggregated_confidence = Math.max(
          inductionResult.aggregated_confidence,
          semanticExtraction.confidence
        );
        
        console.log(`      ✅ POST-MERGE: ${inductionResult.symptoms.length} total symptoms, coverage=${(inductionResult.symbol_coverage * 100).toFixed(0)}%`);
        console.log(`      Merged symptoms: [${inductionResult.symptoms.map(s => s.symbol).join(', ')}]`);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // LANGUAGE INDUCTION GATE: Determine if symbolic brain should run
      // Based on symbol_coverage and aggregated_confidence, NOT intent confidence
      // ═══════════════════════════════════════════════════════════════════════════
      const inductionCoverageSufficient = hasMinimumCoverage(inductionResult, 0.25); // 25% coverage or 1+ symbols
      const inductionConfidenceSufficient = inductionResult.aggregated_confidence >= 0.5 || inductionResult.total_symbols_extracted >= 2;
      const shouldRunSymbolicBrain = inductionCoverageSufficient || inductionConfidenceSufficient;
      
      console.log(`      📊 Induction Gate: coverage_ok=${inductionCoverageSufficient}, confidence_ok=${inductionConfidenceSufficient}, run_symbolic=${shouldRunSymbolicBrain}`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // STAGE 2: OBSERVATION EXTRACTION (LLM, STRICT)
      // Extract ONLY what farmer explicitly states. NO pest, disease, deficiency.
      // PHASE-17 FIX: Pass landContext so crop is never "unknown" if we have it
      // ═══════════════════════════════════════════════════════════════════════════
      console.log('   👁️ Stage 2: Observation Extraction...');
      
      // PHASE-17 FIX (Issue #2): Build land context for observation extractor
      const landContextForExtraction = landContext ? {
        current_crop: landContext.current_crop || landContext.crop,
        crop_code: landContext.crop_code,
        growth_stage: landContext.growth_stage || landContext.stage,
        days_since_sowing: landContext.days_since_sowing
      } : undefined;
      
      // Static import at top of file - NOW WITH LAND CONTEXT
      const observationExtraction = extractObservations(
        normalizedInput.normalized_text, 
        normalizedInput.detected_language,
        landContextForExtraction
      );
      
      // Validate that no forbidden fields snuck in
      const observationValidation = validateObservationExtraction(observationExtraction);
      if (!observationValidation.valid) {
        console.error(`      ❌ Observation validation FAILED: ${observationValidation.errors.join(', ')}`);
      }
      
      agentsUsed.push('OBSERVATION_EXTRACTOR');
      
      console.log(`      Crop: ${observationExtraction.crop_mentioned || 'unknown'} (source: ${landContextForExtraction?.current_crop ? 'LAND_CONTEXT' : 'INFERRED'})`);
      console.log(`      Symptoms: ${observationExtraction.raw_symptom_text.length} extracted`);
      console.log(`      Affected part: ${observationExtraction.affected_part}, Distribution: ${observationExtraction.symptom_distribution}`);
      console.log(`      Severity words: ${observationExtraction.severity_words.join(', ') || 'none'}`);
      
      // PHASE-17 FIX: Detect urgency for adaptive gates
      const urgencyKeywords = ['मेला', 'मेले', 'मेलेला', 'dead', 'dying', 'died', 'मर गया', 'मर रहा'];
      const isUrgentQuery = urgencyKeywords.some(kw => 
        normalizedInput.normalized_text.toLowerCase().includes(kw.toLowerCase())
      );
      if (isUrgentQuery) {
        console.log('      ⚡ URGENCY DETECTED - will use adaptive thresholds');
        agentsUsed.push('URGENCY_DETECTED');
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // STAGE 2.5: PHASE-8/8.1 OBSERVATION KEY MAPPING (REQUIRED)
      // Convert observations to canonical ObservationKeys
      // PHASE-8.1: Build CropContextAuthority from landContext
      // PHASE-9.1-FIX PATCH 3: crop_schedules is authoritative - NEVER overwrite with observation
      // ═══════════════════════════════════════════════════════════════════════════
      console.log('   🔑 Stage 2.5: ObservationKey Mapping...');
      
      // PHASE-9.1-FIX PATCH 3: Use LOCKED crop context if available (from previous clarification)
      // Otherwise, build fresh from land context
      // This ensures crop context is NEVER lost during clarification retries
      let cropContextAuthority: CropContextAuthority | null = null;
      
      if (lockedCropContext && lockedCropContext.crop_name) {
        // PATCH 3: Reuse locked context - this is the authoritative source during clarification
        console.log(`      🔐 Using LOCKED CropContext: ${lockedCropContext.crop_name}`);
        cropContextAuthority = {
          crop_name: lockedCropContext.crop_name,
          growth_stage: lockedCropContext.growth_stage || 'UNKNOWN',
          days_since_sowing: lockedCropContext.days_since_sowing ?? 0,
          source: 'crop_schedules' // Must match CropContextAuthority interface
        };
      } else if (landContext) {
        // Build fresh from land context (crop_schedules is the authoritative source)
        cropContextAuthority = buildCropContextFromLandContext({
          current_crop: landContext.current_crop,
          growth_stage: landContext.growth_stage,
          days_since_sowing: landContext.days_since_sowing,
          sowing_date: landContext.sowing_date,
          expected_harvest_date: landContext.expected_harvest_date,
          crop_variety: landContext.crop_variety,
          crop_data_source: landContext.crop_data_source
        });
        
        // PATCH 3: Lock this context for future clarification turns
        if (cropContextAuthority) {
          lockedCropContext = {
            crop_name: cropContextAuthority.crop_name,
            growth_stage: cropContextAuthority.growth_stage,
            days_since_sowing: cropContextAuthority.days_since_sowing
          };
          console.log(`      🔐 LOCKED CropContext for session: ${lockedCropContext.crop_name}`);
        }
      }
      
      const hasCropContext = hasCropContextAuthority(cropContextAuthority);
      
      if (hasCropContext) {
        console.log(`      🌾 CropContextAuthority: ${cropContextAuthority!.crop_name} (${cropContextAuthority!.growth_stage}, DAS: ${cropContextAuthority!.days_since_sowing})`);
        
        // PATCH 3: CRITICAL - Ensure observation extractor cannot override crop context
        // crop_schedules is the ONLY authority for crop identification in land chat
        console.log('      ✅ PATCH 3: crop_schedules is authoritative - observation.crop will NOT override');
      } else {
        console.log('      ⚠️ No CropContextAuthority available - general chat mode');
      }
      
      // PHASE-8.1: Pass cropContext to ObservationKey mapper
      const observationKeyResult = mapToObservationKeys(
        observationExtraction,
        landContext ? {
          current_crop: landContext.current_crop,
          growth_stage: landContext.growth_stage
        } : undefined,
        cropContextAuthority // PHASE-8.1: CropContextAuthority
      );
      const observationKeys = observationKeyResult.keys;
      
      agentsUsed.push('OBSERVATION_KEY_MAPPER');
      
      console.log(`      Keys mapped: ${observationKeyResult.key_count}`);
      console.log(`      Unknown keys: ${observationKeyResult.unknown_count}`);
      console.log(`      Keys: ${(serializeKeys(observationKeys) || []).join(', ')}`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-8/8.1 GUARDRAIL: Prevent CROP_UNKNOWN when CropContextAuthority exists
      // This invariant prevents regression of the crop identification bug
      // ═══════════════════════════════════════════════════════════════════════════
      if (hasCropContext && observationKeys.has(ObservationKey.CROP_UNKNOWN)) {
        console.error('   ❌ PHASE-8.1 VIOLATION: CropContextAuthority exists but ObservationKey says CROP_UNKNOWN');
        console.error(`      cropContextAuthority.crop_name: ${cropContextAuthority!.crop_name}`);
        console.error(`      observationExtraction.crop_mentioned: ${observationExtraction.crop_mentioned}`);
        throw new Error(
          `PHASE-8.1 VIOLATION: CropContextAuthority has crop (${cropContextAuthority!.crop_name}) but ObservationKey says CROP_UNKNOWN. ` +
          `This indicates a bug in mapToObservationKeys() - it should use cropContext.crop_name as fallback.`
        );
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-9: CROSS-CROP SYMPTOM MAPPING
      // Map raw symptoms to canonical CrossCropSymptomKeys for uniform handling
      // ═══════════════════════════════════════════════════════════════════════════
      console.log('   🌿 Stage 2.6: Cross-Crop Symptom Mapping...');
      
      const crossCropResult = mapToCrossCropSymptoms(observationExtraction.raw_symptom_text);
      const crossCropSymptoms = crossCropResult.symptoms;
      
      // CRITICAL FIX: Also map farmer's direct message to catch death terms
      const messageSymptomResult = mapToCrossCropSymptoms([farmerMessage]);
      messageSymptomResult.symptoms.forEach(s => crossCropSymptoms.add(s));
      
      agentsUsed.push('CROSS_CROP_SYMPTOM_MAPPER');
      
      // CRITICAL FIX: Store cross-crop symptoms in session context for diagnostic flow
      (this as any)._crossCropSymptoms = crossCropSymptoms;
      
      console.log(`      Symptoms detected: ${crossCropSymptoms.size}`);
      console.log(`      Symptoms: ${serializeCrossCropSymptoms(crossCropSymptoms).slice(0, 5).join(', ')}${crossCropSymptoms.size > 5 ? '...' : ''}`);
      
      // NOTE: Cross-crop symptoms will be injected into nluOutput AFTER NLU processing (line ~2760)
      // The nluOutput variable is declared later, so we store crossCropSymptoms in this scope
      // and inject them after NLU declaration
      // ═══════════════════════════════════════════════════════════════════════════
      // STAGE 4: UNDERSTANDING COMPLETENESS CHECK (SYMBOLIC - NO LLM)
      // Determine if we have enough info to proceed or need clarification
      // ═══════════════════════════════════════════════════════════════════════════
      console.log('   🎯 Stage 4: Understanding Completeness Check...');
      
      // Static import at top of file
      
      const understandingResult = checkUnderstandingCompleteness(observationExtraction, landContext ? {
        current_crop: landContext.current_crop,
        growth_stage: landContext.growth_stage,
        days_since_sowing: landContext.days_since_sowing,
        area_acres: landContext.area_acres
      } : undefined);
      
      agentsUsed.push('UNDERSTANDING_CHECKER');
      
      console.log(`      Confidence: ${understandingResult.understanding_confidence} (score: ${understandingResult.completeness_score})`);
      console.log(`      Missing fields: ${understandingResult.unknown_critical_fields.join(', ') || 'none'}`);
      console.log(`      Contradictions: ${understandingResult.contradiction_detected.length}`);
      console.log(`      Clarification required: ${understandingResult.clarification_required}`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-19: ENHANCED PHOTO OBSERVATION NORMALIZATION
      // If farmer uploaded a photo, normalize Vision AI output to canonical
      // ObservationKey codes and inject into rule engine pipeline (same as text)
      // ═══════════════════════════════════════════════════════════════════════════
      
      // Import photo observation mapper for canonical code normalization
      let photoMappedCodes: any = null;
      
      if (photoAnalysisResult && photoAnalysisResult.success) {
        console.log(`\n📸 [PHASE-19 v2.0] Normalizing photo observations to ObservationKeys...`);
        
        // STEP 1: Import and use the photo-to-ObservationKey mapper
        const { mapPhotoToObservationKeys, photoProvidesSufficientData } = await import('../photo/photo-observation-mapper.ts');
        photoMappedCodes = mapPhotoToObservationKeys(photoAnalysisResult);
        
        console.log(`   ✅ Mapped ${photoMappedCodes.observation_codes.length} ObservationKeys from photo`);
        console.log(`   Keys: ${photoMappedCodes.observation_codes.slice(0, 5).join(', ')}${photoMappedCodes.observation_codes.length > 5 ? '...' : ''}`);
        console.log(`   Severity: ${photoMappedCodes.severity_code}`);
        console.log(`   Affected part: ${photoMappedCodes.affected_part_code}`);
        
        // STEP 2: Add photo observations to observation extraction (for NLU compatibility)
        photoAnalysisResult.observations.forEach(obs => {
          if (!observationExtraction.extracted_symptoms?.some(s => s.text?.includes(obs.key))) {
            observationExtraction.extracted_symptoms = observationExtraction.extracted_symptoms || [];
            observationExtraction.extracted_symptoms.push({
              text: obs.description,
              symptom_code: obs.key,
              confidence: obs.confidence
            } as any);
          }
        });
        
        // STEP 3: Inject photo observation codes into observationKeys array
        // This ensures photo data flows through rule engine exactly like text selections
        if (photoMappedCodes.observation_codes.length > 0) {
          console.log(`   📥 Injecting ${photoMappedCodes.observation_codes.length} photo codes into observationKeys...`);
          
          photoMappedCodes.observation_codes.forEach((code: any) => {
            if (!observationKeys.includes(code)) {
              observationKeys.push(code);
            }
          });
          
          // Also inject into inductionResult.symptoms for canonical state
          photoMappedCodes.observation_codes.forEach((code: any) => {
            if (!inductionResult.symptoms.find((s: any) => s.symbol === code)) {
              inductionResult.symptoms.push({
                symbol: code,
                confidence: photoMappedCodes.confidence,
                source: 'PHOTO_VISION_AI'
              });
            }
          });
          
          // Also inject into mappedCodes.observation_codes if exists
          if (mappedCodes?.observation_codes) {
            photoMappedCodes.observation_codes.forEach((code: any) => {
              if (!mappedCodes.observation_codes.includes(code)) {
                mappedCodes.observation_codes.push(code);
              }
            });
          }
        }
        
        // STEP 4: Check if photo provides sufficient data to skip clarification
        const photoIsSufficient = photoProvidesSufficientData(photoMappedCodes);
        
        if (photoIsSufficient) {
          console.log(`   📈 Photo provides SUFFICIENT data (${photoMappedCodes.observation_codes.length} codes, ${(photoMappedCodes.confidence * 100).toFixed(0)}% confidence)`);
          console.log(`   ⏭️ SKIPPING clarification - proceeding directly to rule evaluation`);
          understandingResult.clarification_required = false;
          understandingResult.completeness_score = Math.min(100, understandingResult.completeness_score + 30);
          understandingResult.understanding_confidence = UnderstandingConfidence.HIGH;
        } else if (photoAnalysisResult.observations.length >= 2 && photoAnalysisResult.confidence > 0.6) {
          console.log(`   📈 Photo provides ${photoAnalysisResult.observations.length} observations - reducing clarification need`);
          understandingResult.clarification_required = false;
          understandingResult.completeness_score = Math.min(100, understandingResult.completeness_score + 20);
          understandingResult.understanding_confidence = UnderstandingConfidence.SUFFICIENT;
        }
        
        agentsUsed.push('PHOTO_OBSERVATION_NORMALIZER');
        agentsUsed.push('PHOTO_UNDERSTANDING_ENHANCED');
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-22 v4.0: CROP DAMAGE DETECTION GATE (OBSERVATION-DERIVED AUTHORITY)
      // 
      // This is the SINGLE ENTRY POINT for rule-granted diagnosis authority.
      // HARD AGRONOMIC INVARIANT: 
      // If canonical ObservationKeys OR CrossCropSymptoms indicate crop damage
      // (e.g., PATCHY_GROWTH, AFFECTED_PATCHES, OVERALL_WEAK, SEEDLING_DIED)
      // with severity ≥ MEDIUM, the system MUST activate the DIAGNOSIS category.
      // 
      // NLU is treated as OBSERVATION EXTRACTOR only - it NEVER gates diagnosis.
      // Authority is derived from ObservationKeys + crop + stage, NOT from NLU intent.
      // pest_code and disease_code are NOT required to enter DIAGNOSIS mode.
      // 
      // Logs must show:
      // DiagnosticTrigger=CROP_DAMAGE
      // Authority=CROP
      // Mode=DIAGNOSIS
      // Stage=<GROWTH_STAGE>
      // RulesExecuted=DIAGNOSIS
      // ═══════════════════════════════════════════════════════════════════════════
      
      // Collect all observations for crop damage detection
      const allObservationsForPreAuth = new Set<string>();
      
      // Add from observation keys
      if (observationKeys) {
        observationKeys.forEach(key => allObservationsForPreAuth.add(String(key)));
      }
      
      // Add from mapped codes
      if (mappedCodes?.observation_codes) {
        mappedCodes.observation_codes.forEach((code: string) => allObservationsForPreAuth.add(code));
      }
      
      // Add from induction result symptoms
      if (inductionResult?.symptoms) {
        inductionResult.symptoms.forEach((s: any) => {
          if (s.symbol) allObservationsForPreAuth.add(s.symbol);
        });
      }
      
      // PHASE-19 v2.0: Add photo-mapped codes to allObservationsForPreAuth
      // This ensures photo observations are evaluated by the rule engine
      if (photoMappedCodes?.observation_codes) {
        console.log(`   📸 Adding ${photoMappedCodes.observation_codes.length} photo codes to allObservationsForPreAuth`);
        photoMappedCodes.observation_codes.forEach((code: any) => {
          allObservationsForPreAuth.add(String(code));
        });
      }
      
      // Add cross-crop symptoms if available
      const crossCropSymptomsList = crossCropSymptoms ? [...crossCropSymptoms] : [];
      
      // v4.0: Use enhanced crop damage detection (includes non-terminal damage)
      const cropDamageResult = detectCropDamageForDiagnosis(
        allObservationsForPreAuth,
        crossCropSymptomsList
      );
      
      // v4.0: Also run the legacy pre-authority gate for backward compatibility
      const preAuthorityResult = resolveDiagnosticAuthorityFromObservations(allObservationsForPreAuth);
      
      // v4.0: Enforced authority from either path
      let enforcedAuthorityDecision = preAuthorityResult.enforced_decision;
      
      // v4.0: If crop damage detected (any level that requires diagnosis), enforce CROP authority
      if (cropDamageResult.requires_diagnosis) {
        console.log(`\n🌾 [CROP DAMAGE GATE v4.0] Crop damage detected - DIAGNOSIS mode activated`);
        console.log(`   DiagnosticTrigger=CROP_DAMAGE`);
        console.log(`   Authority=CROP`);
        console.log(`   Mode=DIAGNOSIS`);
        console.log(`   Stage=${canonicalContext?.growth_stage || 'UNKNOWN'}`);
        console.log(`   RulesExecuted=DIAGNOSIS`);
        console.log(`   Damage type: ${cropDamageResult.damage_type}`);
        console.log(`   Severity: ${cropDamageResult.severity_level}`);
        console.log(`   Damage observations: ${cropDamageResult.damage_observations.slice(0, 5).join(', ')}`);
        console.log(`   NLU_GATING=${cropDamageResult.nlu_gating_disabled ? 'DISABLED' : 'ENABLED'}`);
        
        // Create enforced authority if not already set
        if (!enforcedAuthorityDecision && cropDamageResult.enforced_authority) {
          enforcedAuthorityDecision = createEnforcedCropAuthority(
            cropDamageResult.damage_observations,
            allObservationsForPreAuth
          );
        }
        
        agentsUsed.push('CROP_DAMAGE_GATE_V4');
      } else if (preAuthorityResult.nlu_bypassed) {
        // Legacy terminal damage path
        console.log(`\n🚨 [PRE-AUTHORITY GATE] Terminal damage detected - NLU gating DISABLED`);
        console.log(`   DiagnosticTrigger=CROP_DAMAGE`);
        console.log(`   Authority=CROP`);
        console.log(`   Mode=DIAGNOSIS`);
        console.log(`   Stage=${canonicalContext?.growth_stage || 'UNKNOWN'}`);
        console.log(`   RulesExecuted=DIAGNOSIS`);
        console.log(`   Terminal indicators: ${preAuthorityResult.terminal_indicators.join(', ')}`);
        console.log(`   NLU_ROLE=OBSERVATION_ONLY`);
        console.log(`   Source=DECISION_RULES`);
        
        // v3.0: Assert invariant immediately
        assertTerminalDamageAuthority(true, preAuthorityResult.authority);
      }
      
      // Check if Diagnosis-Only Mode should be activated
      // v4.0: Now also activated by non-terminal crop damage
      const diagnosisOnlyCheck = shouldActivateDiagnosisOnlyMode(
        canonicalContext,
        allObservationsForPreAuth,
        1 // Kept for backward compatibility
      );
      
      // v4.0: Enhanced activation check - crop damage OR terminal damage OR photo-detected issues
      // PHASE-19 v2.0: If photo detected high-confidence issues, force diagnosis mode
      let photoForcedDiagnosis = false;
      if (photoAnalysisResult?.success && photoAnalysisResult.detected_issues.length > 0) {
        const photoHasHighConfidenceIssue = photoAnalysisResult.detected_issues.some(
          (issue: any) => issue.confidence > 0.7
        );
        
        if (photoHasHighConfidenceIssue) {
          console.log(`   📸 [PHOTO DIAGNOSIS TRIGGER] Photo detected ${photoAnalysisResult.detected_issues.length} issues - forcing DIAGNOSIS mode`);
          console.log(`   Photo severity: ${photoAnalysisResult.severity_assessment.overall_severity}`);
          console.log(`   Photo confidence: ${(photoAnalysisResult.confidence * 100).toFixed(0)}%`);
          photoForcedDiagnosis = true;
        }
      }
      
      const shouldActivateDiagnosisMode = diagnosisOnlyCheck.activate || 
        preAuthorityResult.nlu_bypassed || 
        cropDamageResult.requires_diagnosis ||
        photoForcedDiagnosis;
      
      // Log the check result (v4.0 - enhanced logging)
      if (shouldActivateDiagnosisMode) {
        console.log(`\n════════════════════════════════════════════════════════════════`);
        console.log(`🔬 [DIAGNOSIS MODE ACTIVATED] v${DIAGNOSIS_ONLY_MODE_VERSION}`);
        console.log(`   DiagnosticTrigger=CROP_DAMAGE`);
        console.log(`   Authority=CROP`);
        console.log(`   Mode=DIAGNOSIS`);
        console.log(`   Stage=${canonicalContext?.growth_stage || 'UNKNOWN'}`);
        console.log(`   RulesExecuted=DIAGNOSIS`);
        console.log(`   Damage type: ${cropDamageResult.damage_type}`);
        console.log(`   Diagnosis mode: ${cropDamageResult.diagnosis_mode}`);
        console.log(`   Severity: ${cropDamageResult.severity_level}`);
        console.log(`   NLU_GATING=${cropDamageResult.nlu_gating_disabled || preAuthorityResult.nlu_bypassed ? 'DISABLED' : 'ENABLED'}`);
        console.log(`   Clarification=${cropDamageResult.diagnosis_mode === 'DIAGNOSIS_ONLY' ? 'SKIPPED' : 'OPTIONAL'}`);
        console.log(`════════════════════════════════════════════════════════════════\n`);
      }
      
      // If Diagnosis-Only Mode is activated, SKIP CLARIFICATION entirely
      let diagnosisOnlyModeActive = cropDamageResult.diagnosis_mode === 'DIAGNOSIS_ONLY' || 
        diagnosisOnlyCheck.activate || 
        preAuthorityResult.nlu_bypassed;
      let bypassClarificationForTerminalDamage = diagnosisOnlyModeActive;
      
      // v4.0: For DIAGNOSIS_WITH_CLARIFICATION, allow optional confirmation but still run rules
      let diagnosisWithOptionalClarification = cropDamageResult.diagnosis_mode === 'DIAGNOSIS_WITH_CLARIFICATION';
      
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX v4.1: Override DIAGNOSIS_ONLY → DIAGNOSIS_WITH_CLARIFICATION
      // when land context exists. This ensures farmers see diagnosis options to
      // select, which increases confidence for accurate treatment recommendations.
      // ═══════════════════════════════════════════════════════════════════════════
      const hasLandContext = landContext && 
        landContext.current_crop && 
        landContext.days_since_sowing !== undefined &&
        landContext.days_since_sowing !== null;
      
      const shouldShowDiagnosisOptions = cropDamageResult.requires_diagnosis && hasLandContext;
      
      if (shouldShowDiagnosisOptions && diagnosisOnlyModeActive) {
        console.log(`\n🔄 [DIAGNOSIS MODE OVERRIDE v4.1]`);
        console.log(`   Original mode: DIAGNOSIS_ONLY`);
        console.log(`   Override to: DIAGNOSIS_WITH_CLARIFICATION`);
        console.log(`   Reason: Land context available (${landContext.current_crop}, DAS: ${landContext.days_since_sowing})`);
        console.log(`   Effect: Will show diagnosis options to farmer for confirmation`);
        
        // Override mode flags
        diagnosisOnlyModeActive = false;
        bypassClarificationForTerminalDamage = false;
        diagnosisWithOptionalClarification = true;
      }
      
      // v4.0: HARD INVARIANT CHECK - crop damage MUST have CROP authority
      if (shouldActivateDiagnosisMode && (cropDamageResult.enforced_authority || diagnosisOnlyCheck.enforced_authority || preAuthorityResult.authority)) {
        const resolvedAuthority = cropDamageResult.enforced_authority || 
          diagnosisOnlyCheck.enforced_authority || 
          preAuthorityResult.authority;
        
        if (cropDamageResult.damage_type === 'TERMINAL' || cropDamageResult.severity_level === 'CRITICAL') {
          assertTerminalDamageAuthority(true, resolvedAuthority);
        }
      }
      
      if (diagnosisOnlyModeActive) {
        console.log(`\n🔬 [DIAGNOSIS-ONLY MODE v4.0] Clarification PERMANENTLY SKIPPED`);
        console.log(`   DiagnosticTrigger=CROP_DAMAGE`);
        console.log(`   Authority=CROP (ENFORCED)`);
        console.log(`   Mode=DIAGNOSIS`);
        console.log(`   Stage=${canonicalContext?.growth_stage || 'UNKNOWN'}`);
        console.log(`   RulesExecuted=DIAGNOSIS`);
        console.log(`   NLU_ROLE=OBSERVATION_ONLY`);
        console.log(`   Clarification=SKIPPED`);
        console.log(`   Source=DECISION_RULES`);
        console.log(`   Crop/Stage=${canonicalContext?.crop_code}/${canonicalContext?.growth_stage} (LOCKED)`);
        console.log(`   Damage observations: ${cropDamageResult.damage_observations.slice(0, 5).join(', ')}`);
        agentsUsed.push('DIAGNOSIS_ONLY_MODE_V4');
        agentsUsed.push('CROP_DAMAGE_GATE');
        
        // Force bypass clarification
        understandingResult.clarification_required = false;
        bypassClarification = true;
      } else if (diagnosisWithOptionalClarification) {
        console.log(`\n🌾 [DIAGNOSIS-FIRST MODE v${DIAGNOSIS_FIRST_VERSION}] Hypothesis-driven options`);
        console.log(`   DiagnosticTrigger=CROP_DAMAGE`);
        console.log(`   Authority=CROP`);
        console.log(`   Mode=DIAGNOSIS_FIRST`);
        console.log(`   Stage=${canonicalContext?.growth_stage || 'UNKNOWN'}`);
        console.log(`   Source=DECISION_RULES`);
        console.log(`   Clarification=HYPOTHESIS_DRIVEN (NOT generic)`);
        agentsUsed.push('DIAGNOSIS_FIRST_MODE');
        
        // ═══════════════════════════════════════════════════════════════════════════
        // DIAGNOSIS-FIRST: Run hypothesis evaluation IMMEDIATELY
        // This MUST happen BEFORE any generic clarification
        // ═══════════════════════════════════════════════════════════════════════════
        try {
          const cropCode = canonicalContext?.crop_code || landContext?.current_crop?.toUpperCase() || 'UNKNOWN';
          const growthStage = canonicalContext?.growth_stage || landContext?.growth_stage || 'UNKNOWN';
          const currentObservations = [...allObservationsForPreAuth].map(o => String(o));
          
          console.log(`   📊 Running hypothesis evaluation for ${cropCode}/${growthStage}...`);
          console.log(`   📊 Observations: ${currentObservations.slice(0, 5).join(', ')}`);
          
          const hypothesisResult = await evaluateCandidateHypotheses({
            crop_code: cropCode,
            growth_stage: growthStage,
            days_since_sowing: canonicalContext?.days_since_sowing || landContext?.days_since_sowing || null,
            ndvi_level: landContext?.ndvi?.level,
            ndvi_trend: landContext?.ndvi?.trend,
            known_observations: currentObservations,
            user_query: farmerMessage,
            supabaseClient: this.supabase,
            trace_id: traceId
          });
          
          agentsUsed.push('HYPOTHESIS_EVALUATOR');
          
          console.log(`   🎯 Found ${hypothesisResult.candidates.length} candidate hypotheses`);
          
          // Generate diagnosis-first response
          let diagnosisFirstOutput: DiagnosisFirstOutput | null = null;
          
          // v1.1.0: Build farmer location for regional translation
          const farmerLocation = landContext ? {
            state: landContext.state || 'Maharashtra',
            district: landContext.district || 'Pune',
            tehsil: landContext.tehsil || undefined,
            language: (options.language || 'mr') as 'mr' | 'hi' | 'en'
          } : undefined;
          
          if (farmerLocation) {
            console.log(`   🌍 Farmer location: ${farmerLocation.district}, ${farmerLocation.state}`);
          }
          
          if (hypothesisResult.candidates.length > 0) {
            // v1.1.0: Now async for regional translation support
            diagnosisFirstOutput = await generateDiagnosisFirstResponse({
              hypotheses: hypothesisResult.candidates,
              crop_code: cropCode,
              growth_stage: growthStage,
              current_observations: currentObservations,
              language: (options.language || 'mr') as 'mr' | 'hi' | 'en',
              damage_observations: cropDamageResult.damage_observations,
              trace_id: traceId,
              farmer_location: farmerLocation
            });
          } else {
            // No candidates - generate UNKNOWN diagnosis response
            console.log(`   ⚠️ No hypothesis candidates - generating UNKNOWN diagnosis`);
            diagnosisFirstOutput = createUnknownDiagnosisResponse(
              cropCode,
              growthStage,
              cropDamageResult.damage_observations,
              (options.language || 'mr') as 'mr' | 'hi' | 'en',
              traceId
            );
          }
          
          if (diagnosisFirstOutput) {
            agentsUsed.push('DIAGNOSIS_FIRST_GENERATOR');
            
            // Convert to clarification UI format and return immediately
            const clarificationFormat = formatForClarificationUI(diagnosisFirstOutput);
            
            console.log(`\n═══════════════════════════════════════════════════════════════`);
            console.log(`🔬 [DIAGNOSIS-FIRST] Returning hypothesis-driven options`);
            console.log(`   Mode=DIAGNOSIS_FIRST`);
            console.log(`   Source=DECISION_RULES`);
            console.log(`   Clarification=HYPOTHESIS_DRIVEN`);
            console.log(`   Options=${diagnosisFirstOutput.diagnoses.length} diagnoses + photo`);
            console.log(`   Top causes: ${diagnosisFirstOutput.diagnoses.slice(0, 3).map(d => d.cause).join(', ')}`);
            console.log(`═══════════════════════════════════════════════════════════════\n`);
            
            // Return diagnosis-first options to UI
            // ═══════════════════════════════════════════════════════════════════════════
            // CRITICAL FIX: Use snake_case fields and `question.options` for proper 
            // mapping in transformOrchestratorResponse (index.ts)
            // ═══════════════════════════════════════════════════════════════════════════
            const diagnosisOptions = clarificationFormat.options.map((opt: any) => ({
              label: opt.label,
              value: opt.value || opt.label,
              observation_key: opt.observation_key || opt.value,
              description: opt.description,
              diagnostic_power: opt.diagnostic_power || 'MEDIUM'
            }));
            
            return {
              type: 'CLARIFICATION_QUESTION',
              session_id: sessionId,
              // CRITICAL: Add `question` object with `options` array for proper transform
              question: {
                question_id: `diag_first_${Date.now()}`,
                text_mr: diagnosisFirstOutput.question_text,
                text_hi: diagnosisFirstOutput.question_text,
                text_en: diagnosisFirstOutput.question_text,
                options: diagnosisOptions,
                scope: 'DIAGNOSTIC_CONFIRMATION'
              },
              communication: {
                message_id: crypto.randomUUID(),
                decision_id: `diag_first_${Date.now()}`,
                session_id: sessionId,
                farmer_id: farmerId,
                language: options.language || 'mr',
                format: 'RICH_TEXT',
                tone: 'PROFESSIONAL',
                created_at: new Date().toISOString(),
                main_message: {
                  full_text: {
                    mr: diagnosisFirstOutput.question_text,
                    hi: diagnosisFirstOutput.question_text,
                    en: diagnosisFirstOutput.question_text
                  }
                },
                quick_actions: [],
                // CRITICAL: Also add options here for fallback extraction
                options: diagnosisOptions,
                metadata: {
                  word_count: diagnosisFirstOutput.question_text.split(/\s+/).length,
                  reading_time_seconds: 5,
                  complexity_score: 0.5,
                  template_type: 'DIAGNOSIS_FIRST',
                  sections_included: ['main_message', 'clarification_options']
                }
              } as any,
              metadata: {
                confidence: 0.7,
                safety_status: 'NEEDS_CONFIRMATION',
                rules_applied: diagnosisFirstOutput.total_hypotheses_considered,
                processing_time_ms: Date.now() - startTime,
                agents_used: agentsUsed,
                trace_id: traceId,
                clarification_scope: 'DIAGNOSTIC_CONFIRMATION',
                scope_validation_passed: true,
                // CRITICAL: Use snake_case `orchestrator_type` for frontend mapping
                orchestrator_type: 'CLARIFICATION_QUESTION',
                selectionType: 'SINGLE_CHOICE',
                canonicalContext: canonicalContext,
                diagnosisFirstMode: true,
                cropDamageDetected: true,
                damageObservations: cropDamageResult.damage_observations
              }
            };
          }
        } catch (diagnosisFirstError) {
          console.error(`   ❌ Diagnosis-first generation failed:`, diagnosisFirstError);
          // Fall through to standard clarification flow
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // STAGE 4B: UNDERSTANDING-BASED CLARIFICATION GATE
      // If understanding is insufficient, ask clarification BEFORE NLU
      // (SKIPPED if Diagnosis-Only Mode is active)
      // ═══════════════════════════════════════════════════════════════════════════
      if (understandingResult.clarification_required && !bypassClarification && !bypassClarificationForTerminalDamage) {
        console.log(`   ⚠️ Understanding insufficient (${understandingResult.understanding_confidence}) - generating scope-aware clarification`);
        
        // ═══════════════════════════════════════════════════════════════════════════
        // USE SCOPE-AWARE CLARIFICATION TO PREVENT DIAGNOSIS LEAKAGE
        // Options are constrained to what is OBSERVED, not suspected
        // ═══════════════════════════════════════════════════════════════════════════
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE-21: Pass CANONICAL CONTEXT (read-only) - NO MORE landContext/hasLandContext
        // The canonicalContext is the SINGLE source of truth, built once in Phase-1
        // ═══════════════════════════════════════════════════════════════════════════
        const scopedClarificationInput: ScopedClarificationInput = {
          language: normalizedInput.detected_language,
          observations: observationExtraction,
          understandingResult: understandingResult,
          canonicalContext: canonicalContext, // PHASE-21: Single canonical context (read-only)
          diagnosisRulesFired: false, // No diagnosis rules have fired yet
          farmerMessage: farmerMessage // Farmer message for LLM context
        };
        
        // P0 FIX: Properly await the async function (was causing Promise leak)
        const clarificationResponse = await generateScopedClarification(scopedClarificationInput);
        agentsUsed.push('SCOPED_CLARIFICATION');
        
        // ═══════════════════════════════════════════════════════════════════════════
        // VALIDATION FIX: Use sanitization instead of all-or-nothing validation
        // Even if some options leak diagnosis, we sanitize and continue
        // ═══════════════════════════════════════════════════════════════════════════
        if (!clarificationResponse.validation_passed) {
          console.warn(`   ⚠️ Clarification validation detected issues - using sanitized options`);
          
          // Import and use the sanitization function
          const { validateAndSanitizeClarification } = await import('../decision/clarification-validator.ts');
          
          // Convert options to DynamicOption format if needed
          const originalOptions = (clarificationResponse.options || []).map((opt: string | { label: string }) => 
            typeof opt === 'string' ? { label: opt, observation_key: 'DYNAMIC', confidence: 0.7 } : opt
          );
          
          const sanitizationResult = validateAndSanitizeClarification(
            originalOptions,
            clarificationResponse.scope || 'REFINE_OBSERVATION',
            normalizedInput.detected_language as 'mr' | 'hi' | 'en'
          );
          
          if (sanitizationResult.usedFallback) {
            console.log(`   📋 Using safe fallback options due to validation issues`);
          }
          
          // Replace options with sanitized ones - NEVER return empty
          clarificationResponse.options = sanitizationResult.sanitizedOptions.map(opt => opt.label);
          clarificationResponse.validation_passed = true; // Mark as passed after sanitization
          
          // Log the sanitization
          const auditLoggerSanitize = getAuditLogger();
          auditLoggerSanitize.startTurn({
            turn_id: `sanitized_clarification_${Date.now()}`,
            session_id: sessionId,
            farmer_id: farmerId,
            tenant_id: tenantId,
            trace_id: traceId,
            farmer_message: farmerMessage,
            detected_language: normalizedInput.detected_language,
            land_id: options.landId,
            raw_text: normalizedInput.original_text,
            normalized_text: normalizedInput.normalized_text
          });
          auditLoggerSanitize.logDecision('SANITIZED_OPTIONS', 'CLARIFICATION_VALIDATOR', {
            original_count: originalOptions.length,
            sanitized_count: sanitizationResult.sanitizedOptions.length,
            used_fallback: sanitizationResult.usedFallback,
            errors: sanitizationResult.errors
          });
          await auditLoggerSanitize.completeTurn(Date.now() - startTime);
        }
        
        console.log(`   🎯 Clarification Scope: ${clarificationResponse.scope}`);
        console.log(`   ✅ Validation passed: ${clarificationResponse.validation_passed}`);
        
        // Initialize audit logger and log the understanding gate decision (static import at top)
        const auditLoggerEarly = getAuditLogger();
        auditLoggerEarly.startTurn({
          turn_id: `understanding_gate_${Date.now()}`,
          session_id: sessionId,
          farmer_id: farmerId,
          tenant_id: tenantId,
          trace_id: traceId,
          farmer_message: farmerMessage,
          detected_language: normalizedInput.detected_language,
          land_id: options.landId,
          raw_text: normalizedInput.original_text,
          normalized_text: normalizedInput.normalized_text
        });
        auditLoggerEarly.logObservationExtraction(observationExtraction);
        auditLoggerEarly.logObservationKeys({
          before: serializeKeys(observationKeys),
          unknown_count: observationKeyResult.unknown_count,
          had_land_context_crop: !!landContext?.current_crop
        });
        // PHASE-8.1: Log CropContextAuthority
        if (hasCropContext && cropContextAuthority) {
          auditLoggerEarly.logCropContextAuthority({
            crop: cropContextAuthority.crop_name,
            stage: cropContextAuthority.growth_stage,
            days_since_sowing: cropContextAuthority.days_since_sowing
          });
        }
        // PHASE-9: Log Cross-Crop Symptoms
        if (crossCropResult.symptom_count > 0) {
          auditLoggerEarly.logCrossCropSymptoms(serializeCrossCropSymptoms(crossCropSymptoms));
        }
        auditLoggerEarly.logUnderstandingCheck({
          understanding_confidence: understandingResult.understanding_confidence,
          contradiction_detected: understandingResult.contradiction_detected,
          clarification_required: true
        });
        auditLoggerEarly.logDecision('CLARIFY', 'UNDERSTANDING_GATE');
        await auditLoggerEarly.completeTurn(Date.now() - startTime);
        
        const responseText = clarificationResponse.response_text || this.generateDefaultClarification(
          normalizedInput.detected_language,
          normalizedInput.normalized_text,
          observationExtraction.crop_mentioned || landContext?.current_crop
        );
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE-21: Validate canonical context integrity (fail-fast)
        // Uses canonicalContext !== null instead of hasLandContext boolean
        // ═══════════════════════════════════════════════════════════════════════════
        validateContextIntegrity(canonicalContext, !!canonicalContext, 'CLARIFICATION_RESPONSE');
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE-21: TRUST-FIRST PRODUCTION VERIFICATION
        // Uses canonicalContext directly - no more preservedContext rebuilding
        // ═══════════════════════════════════════════════════════════════════════════
        const clarificationScope = clarificationResponse.scope || 'UNKNOWN';
        const isDiagnosticConfirmation = clarificationScope === 'DIAGNOSTIC_CONFIRMATION';
        
        console.log(`\n✅ [ProductionCheck] Trust-First Clarification Generated:`);
        console.log(`   Scope=${clarificationScope}`);
        console.log(`   Source=${isDiagnosticConfirmation ? 'DECISION_RULES' : 'SYMBOLIC_SCOPED'}`);
        console.log(`   CanonicalContext=${canonicalContext ? 'LOCKED' : 'NULL'}`);
        console.log(`   Crop=${canonicalContext?.crop_name || 'UNKNOWN'} (INVARIANT)`);
        console.log(`   Stage=${canonicalContext?.growth_stage || 'UNKNOWN'} (INVARIANT)`);
        console.log(`   DAS=${canonicalContext?.days_since_sowing || 'UNKNOWN'} (INVARIANT)`);
        console.log(`   NDVI=${canonicalContext?.ndvi?.value || 'UNKNOWN'} (INVARIANT)`);
        console.log(`   Options count=${(clarificationResponse.options || []).length}`);
        
        // Log diagnostic confirmation details if applicable
        if (isDiagnosticConfirmation) {
          console.log(`   🔬 DIAGNOSTIC_CONFIRMATION active:`);
          console.log(`      - Options sourced from: DECISION_RULES.observable_characteristics`);
          console.log(`      - IDENTIFY_LOCATION: PERMANENTLY BLOCKED`);
          console.log(`      - Photo option: MANDATORY (replaces NONE_OF_THE_ABOVE)`);
          console.log(`      - Context preservation: ENFORCED (single canonical object)`);
        }
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE-21: HARD INVARIANT - IDENTIFY_LOCATION is ILLEGAL with canonical context
        // Uses canonicalContext instead of landContext
        // ═══════════════════════════════════════════════════════════════════════════
        if (clarificationScope === 'IDENTIFY_LOCATION' && canonicalContext) {
          console.error(`\n🚨 [FATAL INVARIANT VIOLATION] IDENTIFY_LOCATION used with known crop!`);
          console.error(`   Crop: ${canonicalContext.crop_code}, Stage: ${canonicalContext.growth_stage}`);
          console.error(`   This violates agronomist-style diagnostic confirmation.`);
          console.error(`   Expected: DIAGNOSTIC_CONFIRMATION or REFINE_OBSERVATION`);
          throw new Error(`INVARIANT VIOLATION: IDENTIFY_LOCATION scope is ILLEGAL when canonical context is known. Crop=${canonicalContext.crop_code}`);
        }
        
        // ✅ CRITICAL FIX: Safe array handling - prevent .map() crash on undefined
        const safeOptions = Array.isArray(clarificationResponse.options) 
          ? clarificationResponse.options.filter(opt => opt != null)
          : [];
        
        return {
          type: 'CLARIFICATION_QUESTION',
          session_id: sessionId,
          question: {
            question_id: `scoped_clarify_${Date.now()}`,
            text_mr: responseText,
            text_hi: responseText,
            text_en: responseText,
            options: safeOptions.map((opt, idx) => ({
              value: String(idx + 1),
              label: typeof opt === 'string' ? opt : (opt.label || String(opt))
            }))
          },
          // ✅ CRITICAL FIX: Always include communication object with safe options
          communication: {
            main_message: {
              mr: responseText,
              hi: responseText,
              en: responseText
            },
            options: safeOptions
          },
          metadata: {
            confidence: understandingResult.completeness_score / 100,
            safety_status: 'NEEDS_CLARIFICATION',
            rules_applied: 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            trace_id: traceId,
            understanding_confidence: understandingResult.understanding_confidence,
            clarification_reason: understandingResult.clarification_reason,
            clarification_scope: clarificationResponse.scope,
            scope_validation_passed: clarificationResponse.validation_passed,
            pendingClarificationOptions: safeOptions,
            // ═══════════════════════════════════════════════════════════════════════════
            // PHASE-21: Pass canonical context directly (no more preservedContext)
            // ═══════════════════════════════════════════════════════════════════════════
            canonicalContext: canonicalContext,
            // LEGACY: lockedCropContext for backward compatibility
            lockedCropContext: canonicalContext ? {
              crop_name: canonicalContext.crop_name,
              growth_stage: canonicalContext.growth_stage,
              days_since_sowing: canonicalContext.days_since_sowing ?? 0
            } : undefined
          }
        };
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // Continue with NLU processing for backward compatibility
      // NLU now ONLY extracts observations, NOT pest/disease codes
      // ═══════════════════════════════════════════════════════════════════════════
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
      
      // CRITICAL FIX: Inject cross_crop_symptoms into NLU output for diagnostic-flow-controller
      // This ensures terminal damage detection works even when NLU doesn't extract symptoms
      // NOTE: crossCropSymptoms was computed earlier in Stage 2.6 and stored in this._crossCropSymptoms
      const storedCrossCropSymptoms = (this as any)._crossCropSymptoms as Set<string> | undefined;
      if (nluOutput && storedCrossCropSymptoms && storedCrossCropSymptoms.size > 0) {
        if (!nluOutput.symptom_extraction) {
          nluOutput.symptom_extraction = { visual_symptoms: [], cross_crop_symptoms: [] };
        }
        nluOutput.symptom_extraction.cross_crop_symptoms = Array.from(storedCrossCropSymptoms);
        console.log(`      Injected ${storedCrossCropSymptoms.size} cross-crop symptoms into NLU output`);
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
      
      // Static imports at top of file
      
      const detectedIntent = nluOutput?.intent_classification?.primary_intent || 'GENERAL_QUERY';
      const intentConfidence = nluOutput?.intent_classification?.intent_confidence || 0.5;
      
      // Lock the intent for this turn
      const intentLock = lockIntent(detectedIntent, intentConfidence);
      agentsUsed.push('INTENT_LOCK');
      
      // ═══════════════════════════════════════════════════════════════════════════
      // AUDIT LOGGER INITIALIZATION - Include new Stage 1-4 data
      // ═══════════════════════════════════════════════════════════════════════════
      // Initialize audit logger for this turn
      const auditLogger = getAuditLogger();
      auditLogger.startTurn({
        turn_id: intentLock.turn_id,
        session_id: sessionId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        trace_id: traceId,
        farmer_message: farmerMessage,
        detected_language: normalizedInput.detected_language,
        land_id: options.landId,
        raw_text: normalizedInput.original_text,
        normalized_text: normalizedInput.normalized_text
      });
      
      // Log observation extraction (Stage 2)
      auditLogger.logObservationExtraction(observationExtraction);
      
      // Log ObservationKeys (Stage 2.5 - PHASE-8)
      auditLogger.logObservationKeys({
        before: serializeKeys(observationKeys),
        unknown_count: observationKeyResult.unknown_count,
        had_land_context_crop: !!landContext?.current_crop
      });
      
      // PHASE-8.1: Log CropContextAuthority
      if (hasCropContext && cropContextAuthority) {
        auditLogger.logCropContextAuthority({
          crop: cropContextAuthority.crop_name,
          stage: cropContextAuthority.growth_stage,
          days_since_sowing: cropContextAuthority.days_since_sowing
        });
      }
      
      // PHASE-9: Log Cross-Crop Symptoms
      if (crossCropResult.symptom_count > 0) {
        auditLogger.logCrossCropSymptoms(serializeCrossCropSymptoms(crossCropSymptoms));
      }
      
      // Log understanding check (Stage 4)
      auditLogger.logUnderstandingCheck({
        understanding_confidence: understandingResult.understanding_confidence,
        contradiction_detected: understandingResult.contradiction_detected,
        clarification_required: understandingResult.clarification_required
      });
      
      // Log NLU output in contract format
      auditLogger.logNLUOutput({
        intent_label: detectedIntent,
        observations: observationExtraction.raw_symptom_text,
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
      
      // ═══════════════════════════════════════════════════════════════════════════
      // LANGUAGE INDUCTION-BASED CLARIFICATION GATE (Replaces intent-confidence)
      // Uses symbol_coverage and aggregated_confidence from Language Induction Layer
      // This is INDEPENDENT of intent confidence logic
      // ═══════════════════════════════════════════════════════════════════════════
      
      // Determine if we have sufficient symbol coverage to proceed to symbolic brain
      // If coverage is low AND no agricultural symptoms detected, prepare clarification
      const inductionBasedBypass = shouldRunSymbolicBrain || inductionResult.symptoms.length > 0;
      
      if (inductionBasedBypass) {
        console.log(`   🌾 INDUCTION BYPASS ACTIVE - symbol coverage (${(inductionResult.symbol_coverage * 100).toFixed(0)}%) or symptoms (${inductionResult.symptoms.length}) sufficient`);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // CLARIFICATION CHECK - NOW BASED ON LANGUAGE INDUCTION RESULTS
      // Deferred until after symbolic brain runs
      // Uses symbol_coverage and aggregated_confidence instead of intent_confidence
      // ═══════════════════════════════════════════════════════════════════════════
      let pendingClarificationResponse: any = null;
      
      // Calculate induction-based clarification threshold
      // Clarification needed if: low symbol coverage AND low aggregated confidence AND no symptoms extracted
      const inductionNeedsClarification = (
        inductionResult.symbol_coverage < 0.25 && 
        inductionResult.aggregated_confidence < 0.5 && 
        inductionResult.symptoms.length === 0 &&
        !bypassClarification
      );
      
      // Also consider legacy intent-confidence for backward compatibility
      const legacyNeedsClarification = requiresClarification(intentConfidence) && !inductionBasedBypass;
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-20: CLARIFICATION-FIRST TRIGGER CHECK
      // If crop+stage known but symptoms partial → clarify BEFORE rules
      // ═══════════════════════════════════════════════════════════════════════════
      const clarificationCompleted = options.sessionState?.clarificationCompleted || false;
      const lockedStage = getLockedStage();
      
      const clarificationTriggerInput: ClarificationTriggerInput = {
        crop_known: !!(landContext?.current_crop || inductionResult.crop?.symbol),
        stage_known: !!(lockedStage?.growth_stage || landContext?.growth_stage),
        symptom_count: inductionResult.symptoms.length,
        symptom_coverage: inductionResult.symbol_coverage,
        is_ambiguous: inductionResult.aggregated_confidence < 0.5 && inductionResult.symptoms.length > 0,
        has_pending_clarification: pendingOptionsCount > 0,
        clarification_completed: clarificationCompleted
      };
      
      const clarificationTrigger = shouldTriggerClarificationFirst(clarificationTriggerInput);
      
      // Log the trigger decision
      logClarificationEvent(
        traceId,
        'TRIGGER',
        lockedStage?.growth_stage || landContext?.growth_stage || 'UNKNOWN',
        inductionResult.aggregated_confidence,
        inductionResult.aggregated_confidence,
        { 
          should_clarify: clarificationTrigger.should_clarify, 
          reason: clarificationTrigger.reason,
          symptom_count: inductionResult.symptoms.length,
          coverage: inductionResult.symbol_coverage
        }
      );
      
      // Use PHASE-20 trigger as primary, legacy as fallback
      const shouldPrepareClarification = (clarificationTrigger.should_clarify && !clarificationTrigger.bypass_allowed) || 
        (inductionNeedsClarification || (legacyNeedsClarification && !inductionBasedBypass));
      
      if (shouldPrepareClarification && !bypassClarification) {
        console.log(`   ⚠️ PHASE-20: Clarification triggered (${clarificationTrigger.reason}) - PREPARING clarification (deferred)`);
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE-20: TRY RULE-DRIVEN CLARIFICATION FIRST
        // Generate options from decision_rules.observable_characteristics
        // ═══════════════════════════════════════════════════════════════════════════
        let ruleDrivenClarification = null;
        if (lockedStage && this.supabase) {
          const ruleDrivenInput: RuleDrivenClarificationInput = {
            crop_code: lockedStage.crop_code,
            stage: lockedStage.growth_stage,
            current_symptoms: inductionResult.symptoms.map(s => s.symbol),
            language: (options.language || 'mr') as 'mr' | 'hi' | 'en',
            supabaseClient: this.supabase
          };
          
          ruleDrivenClarification = await fetchRuleDrivenClarificationOptions(ruleDrivenInput);
          
          if (ruleDrivenClarification) {
            console.log(`   ✅ PHASE-20: Rule-driven clarification generated with ${ruleDrivenClarification.options.length} options`);
            logClarificationEvent(
              traceId,
              'OPTIONS_GENERATED',
              lockedStage.growth_stage,
              inductionResult.aggregated_confidence,
              inductionResult.aggregated_confidence,
              { source: 'DECISION_RULES', option_count: ruleDrivenClarification.options.length }
            );
          }
        }
        
        // Extract NLU clarification hints as fallback
        const nluClarificationType = (nluOutput as any)?.clarification_type || 'OPTIONS_PLUS_PHOTO';
        const nluClarificationOptions = (nluOutput as any)?.clarification_options || [];
        
        // ═══════════════════════════════════════════════════════════════════════════
        // TRUST-FIRST: Rule-Driven Options MUST Take Priority
        // HARD INVARIANT: Rule-driven options CANNOT be overwritten by NLU fallback
        // ═══════════════════════════════════════════════════════════════════════════
        let finalClarificationOptions: string[];
        let clarificationSource: 'DECISION_RULES' | 'NLU_FALLBACK' = 'NLU_FALLBACK';
        
        if (ruleDrivenClarification && ruleDrivenClarification.options.length > 0) {
          console.log(`   ✅ Using ${ruleDrivenClarification.options.length} RULE-DRIVEN options (Source=DECISION_RULES)`);
          console.log(`      Options sourced from: hypothesis-first candidate rules`);
          finalClarificationOptions = ruleDrivenClarification.options.map(o => o.label);
          clarificationSource = 'DECISION_RULES';
          
          // Log the rule-driven options for audit
          ruleDrivenClarification.options.forEach((opt, i) => {
            console.log(`      ${i + 1}. ${opt.observation_key}: "${opt.label.substring(0, 50)}..."`);
          });
        } else {
          console.log(`   ⚠️ No rule-driven options available - using NLU fallback (${nluClarificationOptions.length} options)`);
          finalClarificationOptions = nluClarificationOptions;
          
          // ═══════════════════════════════════════════════════════════════════════════
          // INVARIANT WARNING: When context exists, rule-driven options SHOULD exist
          // This indicates a potential gap in decision_rules coverage
          // ═══════════════════════════════════════════════════════════════════════════
          if (lockedStage && inductionResult.symptoms.length > 0) {
            console.error(`   🚨 [INVARIANT WARNING] Land context + symptoms exist but no rule-driven options`);
            console.error(`      Crop: ${lockedStage.crop_code}, Stage: ${lockedStage.growth_stage}`);
            console.error(`      Symptoms: [${inductionResult.symptoms.map(s => s.symbol).join(', ')}]`);
            console.error(`      ACTION REQUIRED: Add observable_characteristics to matching decision_rules`);
          }
        }
        
        // Generate farmer-friendly clarification (use rule-driven if available)
        const clarificationInput: ClarificationInput = {
          language: (options.language || 'mr') as 'mr' | 'hi' | 'en',
          farmer_message: farmerMessage,
          observations: nluOutput?.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [],
          crop_code: inductionResult.crop?.symbol || landContext?.current_crop?.toUpperCase(),
          clarification_type: nluClarificationType as any,
          clarification_options: finalClarificationOptions
        };
        
        console.log(`   📋 Clarification input prepared: type=${nluClarificationType}, crop=${clarificationInput.crop_code}`);
        
        // P0 FIX: Properly await the async function
        const clarificationResponse = await generateClarificationResponse(clarificationInput);
        
        // Store for potential use AFTER symbolic brain runs
        pendingClarificationResponse = {
          clarificationResponse,
          intentConfidence,
          inductionCoverage: inductionResult.symbol_coverage,
          inductionConfidence: inductionResult.aggregated_confidence
        };
        
        console.log(`   📋 Clarification PREPARED (will use only if symbolic brain finds 0 rules)`);
      } else if (inductionBasedBypass || bypassClarification) {
        console.log(`   ✅ Clarification SKIPPED (induction bypass: ${inductionBasedBypass}, option bypass: ${bypassClarification}) - proceeding to Symbolic Decision Brain`);
      }
      
      // ========================================
      // PHASE 1B: LLM-FIRST CHECK - BLOCKED FOR AGRICULTURAL QUERIES WITH LAND CONTEXT
      // FIX: Routing Flag Determinism - evaluate once, invalidate conflicting flags
      // ========================================
      const canDirectAnswer = canAnswerDirectly(detectedIntent, farmerMessage);
      const needsRules = requiresRuleEngine(detectedIntent, farmerMessage);
      
      // FIX: Routing determinism - if symbolic path is chosen, invalidate direct-answer flag
      const isNonAgricultural = ['GREETING', 'APP_HELP'].includes(queryRoute.route);
      const hasLandContextForRouting = !!landContext; // Renamed to avoid duplicate declaration
      const hasSymptoms = inductionResult.symptoms.length > 0;
      
      // DETERMINISTIC ROUTING DECISION (evaluated exactly once)
      // Symbolic path takes priority when: land context exists OR symptoms detected OR rules needed
      const forceSymbolicPath = hasLandContextForRouting || hasSymptoms || needsRules || shouldRunSymbolicBrain;
      const effectiveCanDirectAnswer = canDirectAnswer && !forceSymbolicPath && isNonAgricultural;
      
      console.log(`   🔀 Routing decision: canDirectAnswer=${canDirectAnswer}, needsRules=${needsRules}`);
      console.log(`   🔀 FIX: forceSymbolicPath=${forceSymbolicPath}, effectiveCanDirectAnswer=${effectiveCanDirectAnswer}`);
      
      // CRITICAL: Block LLM-first path if symbolic path is forced
      if (forceSymbolicPath && canDirectAnswer) {
        console.log(`   🚫 LLM-first BLOCKED - symbolic path forced (land=${hasLandContextForRouting}, symptoms=${hasSymptoms})`);
      }
      
      // CRITICAL: Only allow LLM-first for NON-agricultural queries (use deterministic flag)
      if (effectiveCanDirectAnswer && !options.photoUrl) {
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
        // ENHANCED: Use Language Induction symbols as fallback/enrichment
        const inductionSymptoms = getSymptomSymbolsForRules(inductionResult);
        const inductionCrop = getCropSymbolForRules(inductionResult);
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 2.5 FIX: Pass GDD phenology result as the MOST AUTHORITATIVE stage source
        // Priority: gddResult.growth_stage → landContext.growth_stage → nluOutput → UNKNOWN
        // ═══════════════════════════════════════════════════════════════════════════
        const gddResultForCanonical = phenologyResult ? {
          growth_stage: phenologyResult.current_stage,
          stage_name: phenologyResult.stage_name,
          accumulated_gdd: phenologyResult.accumulated_gdd
        } : (landContext?.gdd_phenology ? {
          growth_stage: landContext.gdd_phenology.current_stage,
          stage_name: landContext.gdd_phenology.stage_name,
          accumulated_gdd: landContext.gdd_phenology.accumulated_gdd
        } : undefined);
        
        // ═══════════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: Collect ALL symptom sources for canonical state
        // Include: visual_symptoms + cross_crop_symptoms + induction symptoms
        // ═══════════════════════════════════════════════════════════════════════════
        const visualSymptomCodes = nluOutput?.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [];
        const crossCropSymptomCodes = nluOutput?.symptom_extraction?.cross_crop_symptoms || [];
        
        // Merge all symptom sources, prioritizing terminal damage symptoms
        const allSymptomCodes = [
          ...crossCropSymptomCodes,  // Cross-crop symptoms first (includes SEEDLING_DIED, PLANT_DEATH)
          ...visualSymptomCodes,
          ...inductionSymptoms
        ];
        
        // Remove duplicates
        const uniqueSymptomCodes = [...new Set(allSymptomCodes)];
        
        console.log(`   📋 Symptom sources for canonical state:`);
        console.log(`      Visual symptoms: ${visualSymptomCodes.join(', ') || 'none'}`);
        console.log(`      Cross-crop symptoms: ${crossCropSymptomCodes.join(', ') || 'none'}`);
        console.log(`      Induction symptoms: ${inductionSymptoms.join(', ') || 'none'}`);
        console.log(`      Combined unique: ${uniqueSymptomCodes.join(', ') || 'none'}`);
        
        canonicalState = buildCanonicalState({
          landContext,
          soilData: landContext?.soil_health,
          ndviData: landContext?.ndvi ? {
            value: landContext.ndvi.value || landContext.ndvi.mean_ndvi,
            trend: landContext.ndvi.ndvi_trend,
            captured_at: landContext.ndvi.captured_at
          } : undefined,
          weatherData: fusedIntelligence.weather_data,
          // PHASE 2.5 FIX: Pass GDD result for authoritative stage
          gddResult: gddResultForCanonical,
          // CRITICAL FIX: Use ALL symptom sources, not just visual_symptoms
          farmerObservations: uniqueSymptomCodes.length > 0 ? uniqueSymptomCodes : inductionSymptoms,
          nluOutput: nluOutput
        });
        
        // ENHANCEMENT: If canonical state has UNKNOWN crop, try induction crop
        if ((!canonicalState.crop_type || canonicalState.crop_type === 'UNKNOWN') && inductionCrop !== 'UNKNOWN_CROP') {
          console.log(`   📝 Enriching canonical state crop from induction: ${inductionCrop}`);
          canonicalState.crop_type = inductionCrop as any;
        }
        
        // ═══════════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: If terminal damage symptoms detected, force PLANT_DEATH/SEEDLING_DEATH
        // This ensures rule matching works for terminal damage regardless of mapping
        // ═══════════════════════════════════════════════════════════════════════════
        const terminalSymptoms = ['SEEDLING_DIED', 'PLANT_DIED', 'PLANT_DEATH', 'SEEDLING_DEATH'];
        const hasTerminalDamage = uniqueSymptomCodes.some(s => terminalSymptoms.includes(s.toUpperCase()));
        
        if (hasTerminalDamage && (!canonicalState.visual_symptom || canonicalState.visual_symptom === 'UNKNOWN' || canonicalState.visual_symptom === 'NONE')) {
          console.log(`   🚨 Terminal damage detected - forcing PLANT_DEATH symptom`);
          canonicalState.visual_symptom = 'PLANT_DEATH' as any;
          canonicalState.severity = 'CRITICAL' as any;
        } else if ((!canonicalState.visual_symptom || canonicalState.visual_symptom === 'UNKNOWN') && inductionSymptoms.length > 0) {
          // ENHANCEMENT: If no visual symptom but induction has symptoms, use first one
          console.log(`   📝 Enriching canonical state symptom from induction: ${inductionSymptoms[0]}`);
          canonicalState.visual_symptom = inductionSymptoms[0] as any;
        }
        
        agentsUsed.push('CANONICAL_STATE_BUILDER');
        
        console.log(`   ✅ Canonical State Built:`);
        console.log(`      Crop: ${canonicalState.crop_type}, Stage: ${canonicalState.crop_stage}`);
        console.log(`      Symptom: ${canonicalState.visual_symptom}, Severity: ${canonicalState.severity}`);
        console.log(`      Induction enrichment: crop=${inductionCrop !== 'UNKNOWN_CROP'}, symptoms=${inductionSymptoms.length}`);
        console.log(`      NDVI: ${canonicalState.ndvi_level} (${canonicalState.ndvi_trend})`);
        console.log(`      Soil N: ${canonicalState.soil_nitrogen}, P: ${canonicalState.soil_phosphorus}, K: ${canonicalState.soil_potassium}`);
        console.log(`      Data Confidence: ${canonicalState.data_confidence}`);
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE-17: 8 MANDATORY GATES (G1-G8) - Scientific Validation Layer
        // These gates ensure treatments are ONLY recommended when scientifically valid
        // ═══════════════════════════════════════════════════════════════════════════
        console.log('\n🔐 PHASE 2.5.1: Running 8 Mandatory Validation Gates...');
        agentsUsed.push('8_MANDATORY_GATES');
        
        // G1: INPUT_NORMALIZATION (Already passed if we reached here)
        console.log('   ✅ G1 INPUT_NORMALIZATION: PASSED (language detected)');
        
        // G2: CONTEXT_COMPLETENESS - Block if crop=UNKNOWN OR stage=DEFAULT without sowing_date
        const contextValidation = validateContextCompleteness({
          farmer_mentioned_crop: observationExtraction?.crop_mentioned || null,
          land_context: landContext,
          nlu_output: nluOutput,
          land_state: {
            crop: { crop_name: cropContextAuthority?.crop_name || 'UNKNOWN' }
          }
        });
        
        if (contextValidation.status === 'NEEDS_CLARIFICATION') {
          console.log(`   ⚠️ G2 CONTEXT_COMPLETENESS: NEEDS_CLARIFICATION`);
          console.log(`      Reason: ${contextValidation.clarification_prompt || 'Missing critical context'}`);
          agentsUsed.push('G2_CONTEXT_VALIDATION_FAILED');
          
          // Return clarification for crop mismatch or missing context
          const lang = options.language || 'mr';
          const clarificationPrompt = contextValidation.clarification_prompt || 
            (lang === 'mr' ? 'कोणत्या पिकाबद्दल विचारत आहात?' :
             lang === 'hi' ? 'किस फसल के बारे में पूछ रहे हैं?' :
             'Which crop are you asking about?');
          
          return {
            type: 'CLARIFICATION_QUESTION',
            session_id: sessionId,
            question: {
              question_id: `g2_context_${Date.now()}`,
              text_mr: clarificationPrompt,
              text_hi: clarificationPrompt,
              text_en: clarificationPrompt,
              options: contextValidation.clarification_options?.map((opt, idx) => ({
                value: String(idx + 1),
                label: opt.label
              })) || []
            },
            metadata: {
              confidence: 0.5,
              safety_status: 'CONTEXT_VALIDATION_REQUIRED',
              rules_applied: 0,
              processing_time_ms: Date.now() - startTime,
              agents_used: agentsUsed,
              trace_id: traceId,
              gate_failed: 'G2_CONTEXT_COMPLETENESS'
            }
          };
        }
        
        // Apply reconciled values if available
        if (contextValidation.reconciled_crop) {
          console.log(`   ✅ G2 CONTEXT_COMPLETENESS: PASSED (crop=${contextValidation.reconciled_crop})`);
        } else {
          console.log(`   ✅ G2 CONTEXT_COMPLETENESS: PASSED`);
        }
        
        // Update stage from deterministic calculation if available
        if (contextValidation.reconciled_stage && contextValidation.stage_source !== 'DEFAULT') {
          console.log(`   📊 G2 Growth Stage: ${contextValidation.reconciled_stage} (source: ${contextValidation.stage_source})`);
          if (landContext) {
            landContext.growth_stage = contextValidation.reconciled_stage;
          }
        }
        
        // G3: CONTEXT_CONSISTENCY - Check NDVI vs symptoms for contradictions
        const consistencyCheck = performConsistencyChecks({
          ndvi_value: landContext?.ndvi?.value || landContext?.ndvi?.mean_ndvi || null,
          symptoms: nluOutput?.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || []
        });
        
        if (consistencyCheck.contradictions.length > 0) {
          console.log(`   ⚠️ G3 CONTEXT_CONSISTENCY: ${consistencyCheck.contradictions.length} contradictions detected`);
          consistencyCheck.contradictions.forEach(c => {
            console.log(`      - ${c.field1} vs ${c.field2}: ${c.explanation}`);
          });
          // Don't block, but flag for lower confidence
          agentsUsed.push('G3_CONSISTENCY_WARNINGS');
        } else {
          console.log(`   ✅ G3 CONTEXT_CONSISTENCY: PASSED (no contradictions)`);
        }
        
        // G4: CONFIDENCE_THRESHOLD - Will be checked after rule evaluation
        // Get calibrated threshold for this crop + stage
        const { getCalibratedThreshold } = await import('../decision/confidence-calculator.ts');
        const calibratedThreshold = getCalibratedThreshold(
          canonicalState.crop_type || 'UNKNOWN',
          canonicalState.crop_stage || 'VEGETATIVE'
        );
        console.log(`   📊 G4 Calibrated Confidence Threshold: ${(calibratedThreshold * 100).toFixed(0)}% for ${canonicalState.crop_type}/${canonicalState.crop_stage}`);
        
        // G5: WEATHER_SAFETY - Check if weather allows spray
        let weatherSafetyResult: WeatherSafetyResult | null = null;
        if (fusedIntelligence.weather_data) {
          weatherSafetyResult = checkWeatherSafety(
            fusedIntelligence.weather_data,
            'PESTICIDE' // Default check, will re-check per specific action
          );
          
          if (weatherSafetyResult.status === 'UNSAFE') {
            console.log(`   ⚠️ G5 WEATHER_SAFETY: SPRAY BLOCKED - ${weatherSafetyResult.block_reason?.en || 'Unsafe weather'}`);
            agentsUsed.push('G5_WEATHER_BLOCK_ACTIVE');
          } else if (weatherSafetyResult.status === 'CAUTION') {
            console.log(`   ⚠️ G5 WEATHER_SAFETY: CAUTION - ${weatherSafetyResult.caution_message?.en || 'Weather marginal'}`);
          } else {
            console.log(`   ✅ G5 WEATHER_SAFETY: PASSED`);
          }
        } else {
          console.log(`   ⏭️ G5 WEATHER_SAFETY: SKIPPED (no weather data)`);
        }
        
        // G6: PHI_COMPLIANCE - Will be checked by safety guardian during prescription
        console.log(`   ⏳ G6 PHI_COMPLIANCE: Will validate during prescription phase`);
        
        // G7: STAGE_APPROPRIATENESS - Will validate treatment matches stage
        console.log(`   ⏳ G7 STAGE_APPROPRIATENESS: Will validate during prescription phase`);
        
        // G8: LLM_INTEGRITY - Will validate during response formatting
        console.log(`   ⏳ G8 LLM_INTEGRITY: Will validate during LLM formatting`);
        
        // Store gate results for use in later phases
        const gateResults = {
          g2_context: contextValidation,
          g3_consistency: consistencyCheck,
          g4_threshold: calibratedThreshold,
          g5_weather: weatherSafetyResult
        };
        
        // Check prescription gate before rule engine
        const prescriptionGate = checkPrescriptionGate(canonicalState);
        if (!prescriptionGate.allowed) {
          console.warn(`   ⚠️ Prescription Gate BLOCKED: ${prescriptionGate.reason}`);
        } else {
          console.log(`   ✅ Prescription Gate PASSED`);
        }
        
        // PHASE 2.6: LAYERED RULE EVALUATION (Symbolic Decision Brain)
        console.log('\n📊 PHASE 2.6: Layered Rule Evaluation (OBSERVATION → DIAGNOSIS → SAFETY → PRESCRIPTION)...');
        
        // PHASE-13: Use getAllRulesWithBundled() to include all 2000+ bundled ICAR rules (ASYNC)
        const allRulesWithBundled = await getAllRulesWithBundled();
        console.log(`   📦 Total rules loaded: ${allRulesWithBundled.length} (core + bundled)`);
        
        // CRITICAL: Pass user_query to canonical state for keyword-based matching
        const canonicalStateWithQuery = {
          ...canonicalState,
          user_query: farmerMessage
        };
        
        layeredRuleResult = evaluateRulesLayered(allRulesWithBundled, canonicalStateWithQuery as any);
        agentsUsed.push('LAYERED_RULE_EVALUATOR');
        
        // PHASE-16: Safe array access with null checks
        const safeRulesApplied = Array.isArray(layeredRuleResult.rules_applied) ? layeredRuleResult.rules_applied : [];
        const safeObservations = Array.isArray(layeredRuleResult.observations) ? layeredRuleResult.observations : [];
        const safeDiagnoses = Array.isArray(layeredRuleResult.diagnoses) ? layeredRuleResult.diagnoses : [];
        const safeSafetyBlocks = Array.isArray(layeredRuleResult.safety_blocks) ? layeredRuleResult.safety_blocks : [];
        
        console.log(`   ✅ Layered Rule Result:`);
        console.log(`      Rules Evaluated: ${layeredRuleResult.rules_evaluated || 0}`);
        console.log(`      Rules Matched: ${layeredRuleResult.rules_matched || 0}`);
        console.log(`      Rules Applied: ${safeRulesApplied.join(', ') || 'none'}`);
        console.log(`      Observations: ${safeObservations.join(', ') || 'none'}`);
        console.log(`      Diagnoses: ${safeDiagnoses.map(d => `${d?.cause || 'unknown'}(${((d?.confidence || 0) * 100).toFixed(0)}%)`).join(', ') || 'none'}`);
        console.log(`      Final Diagnosis: ${layeredRuleResult.final_diagnosis?.cause || 'none'}`);
        console.log(`      Prescription Allowed: ${layeredRuleResult.prescription_allowed}`);
        
        if (safeSafetyBlocks.length > 0) {
          console.warn(`   ⚠️ Safety Blocks: ${safeSafetyBlocks.map(b => b?.message || 'unknown').join(', ')}`);
        }
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE-14: IMPROVED KEYWORD FALLBACK - Runs when no enum rules match
        // FIX: Also runs when visual_symptom is NONE but query has strong agri keywords
        // This prevents infinite clarification loops for germination/stand failure queries
        // ═══════════════════════════════════════════════════════════════════════════
        const { hasStrongAgriKeywords } = await import('./layered-rule-evaluator.ts');
        const shouldTryKeywordFallback = layeredRuleResult.rules_matched === 0 && 
          (canonicalState.visual_symptom !== 'NONE' || hasStrongAgriKeywords(farmerMessage));
        
        if (shouldTryKeywordFallback) {
          console.log('   🔄 No enum rules matched, trying keyword-based bundled rules...');
          console.log(`      (visual_symptom=${canonicalState.visual_symptom}, has_strong_keywords=${hasStrongAgriKeywords(farmerMessage)})`);
          
          const keywordMatches = await evaluateBundledKeywordRules(farmerMessage, canonicalState);
          
          if (keywordMatches.length > 0) {
            console.log(`   ✅ Keyword fallback found ${keywordMatches.length} matches:`);
            keywordMatches.forEach(m => console.log(`      - ${m.ruleId}: ${m.cause} (${(m.confidence * 100).toFixed(0)}%)`));
            
            // Inject keyword matches into rule result
            layeredRuleResult.rules_matched = keywordMatches.length;
            layeredRuleResult.rules_applied = keywordMatches.map(m => m.ruleId);
            layeredRuleResult.diagnoses = keywordMatches.map(m => ({
              id: m.ruleId,
              category: 3 as any, // DiagnosisCategory.PEST/DISEASE
              cause: m.cause,
              confidence: m.confidence,
              evidence: [],
              rule_ids: [m.ruleId],
              severity: canonicalState.severity,
              requires_immediate_action: false
            }));
            layeredRuleResult.final_diagnosis = layeredRuleResult.diagnoses[0] || null;
            
            // Store bundled responses for LLM formatter
            (layeredRuleResult as any).bundled_responses = keywordMatches.map(m => m.response);
            
            agentsUsed.push('KEYWORD_FALLBACK_EVALUATOR');
          } else {
            console.warn(`
⚠️ ════════════════════════════════════════════════════════════════════════════
   [PHASE-14] ZERO RULE MATCH - KEYWORD FALLBACK ALSO FAILED
   ════════════════════════════════════════════════════════════════════════════
   Trace ID: ${traceId}
   Crop: ${canonicalState.crop_type}
   Stage: ${canonicalState.crop_stage}
   Symptom: ${canonicalState.visual_symptom}
   User Query: "${farmerMessage.substring(0, 100)}"
   
   🚨 ISSUE: Neither enum nor keyword rules matched.
   ACTION: Add rules for this combination or escalate to diagnostic.
   ════════════════════════════════════════════════════════════════════════════
            `);
          }
        }
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE-16: SYMBOLIC REASONER INTEGRATION (Enhanced JSON Condition Evaluation)
        // Uses new SymbolicReasoner for proper conditions_json parsing
        // ═══════════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: Run Symbolic Reasoner ALWAYS, not just when rules_matched === 0
        // This ensures the primary decision brain runs even when layered rules found some matches
        if (canonicalState) {
          console.log('\n🧠 PHASE 2.7: Running Symbolic Reasoner (PRIMARY PATH)...');
          console.log(`   📊 Current rules_matched: ${layeredRuleResult?.rules_matched || 0}`);
          try {
            const symbolicReasoner = new SymbolicReasoner();
            const factExtractor = new FactExtractor();
            
            // ═══════════════════════════════════════════════════════════════════════════
            // BUG FIX #2: Build NESTED AuthoritativeLandState matching interface
            // The interface expects nested crop/soil/ndvi/weather objects, not flat fields
            // ═══════════════════════════════════════════════════════════════════════════
            const authoritativeLandState = landContext ? {
              land_id: landContext.land_id,
              tenant_id: tenantId,
              farmer_id: farmerId,
              land_name: landContext.land_name || '',
              area_hectares: (landContext.area_acres || 0) * 0.404686,
              area_acres: landContext.area_acres || 0,
              latitude: landContext.center_lat || null,
              longitude: landContext.center_lng || null,
              district: landContext.district || null,
              state: landContext.state || null,
              // CRITICAL: Nested crop object matching AuthoritativeLandState interface
              crop: {
                current_crop: landContext.current_crop || null,
                crop_code: landContext.current_crop?.toUpperCase() || null,
                growth_stage: landContext.growth_stage || null,
                days_since_sowing: landContext.days_since_sowing || null,
                sowing_date: landContext.sowing_date || null,
                expected_harvest_date: null,
                schedule_status: 'active'
              },
              // CRITICAL: Nested soil object
              soil: {
                ph: landContext.soil_health?.ph_level || null,
                organic_carbon: landContext.soil_health?.organic_carbon || null,
                nitrogen_kg_per_ha: landContext.soil_health?.nitrogen_kg_per_ha || null,
                phosphorus_kg_per_ha: landContext.soil_health?.phosphorus_kg_per_ha || null,
                potassium_kg_per_ha: landContext.soil_health?.potassium_kg_per_ha || null,
                texture: landContext.soil_health?.soil_texture || null,
                test_date: null,
                test_age_days: null,
                data_fresh: !!landContext.soil_health
              },
              // CRITICAL: Nested ndvi object
              ndvi: {
                latest_value: landContext.ndvi?.value || null,
                latest_date: landContext.ndvi?.measurement_date || null,
                trend: landContext.ndvi?.ndvi_trend || 'unknown',
                age_days: null,
                history: landContext.ndvi_history || [],
                data_fresh: !!landContext.ndvi
              },
              // CRITICAL: Nested weather object
              weather: {
                temperature: fusedIntelligence.weather_data?.temperature || null,
                humidity: fusedIntelligence.weather_data?.humidity || null,
                rainfall_last_24h: fusedIntelligence.weather_data?.rainfall_mm || null,
                rain_probability: null,
                wind_speed: fusedIntelligence.weather_data?.wind_speed || null,
                data_timestamp: null,
                data_age_hours: null,
                data_fresh: !!fusedIntelligence.weather_data
              },
              // Optional GDD phenology
              gdd_phenology: phenologyResult || null,
              // Derived metrics (placeholder)
              derived: {
                water_stress_level: 'unknown' as const,
                crop_health_status: 'unknown' as const,
                data_completeness_score: 50,
                data_freshness_score: 50,
                critical_missing: []
              },
              loaded_at: new Date().toISOString(),
              sources_available: ['land_context'],
              sources_missing: []
            } : null;
            
            // Extract symbolic facts from observations
            const observations = {
              symptoms: nluOutput?.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [],
              affected_part: observationExtraction?.affected_part || 'unknown',
              distribution: observationExtraction?.symptom_distribution || 'unknown',
              severity: canonicalState.severity || 'UNKNOWN'
            };
            
            // ═══════════════════════════════════════════════════════════════════════════
            // BUG FIX #1: Pass correct arguments to FactExtractor.extractFacts()
            // Signature: extractFacts(observation, canonicalState, landState, userQuery)
            // ═══════════════════════════════════════════════════════════════════════════
            const symbolicFacts = factExtractor.extractFacts(
              observations,
              canonicalState,  // Pass actual CanonicalState, not a fragment
              authoritativeLandState,  // Now properly structured
              farmerMessage  // Add missing 4th argument (user query)
            );
            
            // Execute symbolic rules
            const symbolicResult = await symbolicReasoner.executeRules(symbolicFacts, authoritativeLandState);
            
            if (symbolicResult.rulesFired > 0) {
              console.log(`   ✅ Symbolic Reasoner fired ${symbolicResult.rulesFired} rules`);
              console.log(`   📋 Diagnosis: ${symbolicResult.diagnosis?.cause || 'none'}`);
              
              // Merge symbolic results into layered result
              layeredRuleResult.rules_matched = symbolicResult.rulesFired;
              layeredRuleResult.rules_applied = symbolicResult.firedRuleIds || [];
              if (symbolicResult.diagnosis) {
                layeredRuleResult.final_diagnosis = {
                  id: symbolicResult.diagnosis.ruleId || 'SYMBOLIC',
                  category: 3 as any, // DiagnosisCategory
                  cause: symbolicResult.diagnosis.cause,
                  confidence: symbolicResult.confidence,
                  evidence: symbolicResult.reasoning || [],
                  rule_ids: symbolicResult.firedRuleIds || [],
                  severity: canonicalState.severity,
                  requires_immediate_action: false
                };
                layeredRuleResult.diagnoses = [layeredRuleResult.final_diagnosis];
              }
              
              // Also merge recommendations if any
              if (symbolicResult.recommendations && symbolicResult.recommendations.length > 0) {
                layeredRuleResult.prescriptions = symbolicResult.recommendations.map((r: any) => ({
                  action_type: r.action || 'RECOMMEND',
                  action_details: {
                    response_en: r.description,
                    product: r.product,
                    dosage: r.dosage
                  },
                  product_reference: r.ruleId || 'SYMBOLIC'
                }));
              }
              
              // Calculate confidence using new calculator
              const confidenceCalc = new ConfidenceCalculator();
              const confidenceScore = confidenceCalc.calculateConfidence(
                layeredRuleResult.final_diagnosis || null,
                symbolicFacts,
                symbolicResult.firedRules || [],
                authoritativeLandState || {}
              );
              layeredRuleResult.confidence_in_result = confidenceScore.overall;
              
              agentsUsed.push('SYMBOLIC_REASONER', 'FACT_EXTRACTOR', 'CONFIDENCE_CALCULATOR');
              
              // ═══════════════════════════════════════════════════════════════════════════
              // WORLD-CLASS CLARIFICATION: Multi-Match Detection for Competing Diagnoses
              // Prevents wrong pesticide recommendations by asking farmer to clarify when
              // multiple pests/diseases match with similar confidence.
              // ═══════════════════════════════════════════════════════════════════════════
              // ═══════════════════════════════════════════════════════════════════════════
              // PHASE-22: DIAGNOSIS-ONLY MODE - Skip multi-match clarification
              // When terminal damage detected, present diagnoses directly instead of asking
              // ═══════════════════════════════════════════════════════════════════════════
              if (diagnosisOnlyModeActive && symbolicResult.firedRules && symbolicResult.firedRules.length > 0) {
                console.log(`\n🔬 [DIAGNOSIS-ONLY MODE] Generating direct diagnosis output...`);
                console.log(`   Mode=DIAGNOSIS_ONLY, Clarification=SKIPPED, Source=DECISION_RULES`);
                
                // Convert fired rules to MatchedRule format
                const matchedRulesForDiagnosis: MatchedRule[] = symbolicResult.firedRules.map((r: any) => ({
                  rule_id: r.ruleId || r.id || 'UNKNOWN',
                  cause: r.cause || r.diagnosis?.cause || 'UNKNOWN',
                  canonical_group: r.canonical_group || r.category || 'pest',
                  confidence: r.confidence || symbolicResult.confidence || 0.6,
                  priority: r.priority || 50,
                  response_mr: r.response_mr || r.response?.mr,
                  response_hi: r.response_hi || r.response?.hi,
                  response_en: r.response_en || r.response?.en,
                  actions: r.actions || [],
                  evidence_matched: r.evidence_matched || r.matched_conditions || []
                }));
                
                // Generate Diagnosis-Only output
                const diagnosisOnlyOutput = generateDiagnosisOnlyOutput({
                  canonicalContext: canonicalContext!,
                  observations: allObservationsForDiagCheck,
                  matched_rules: matchedRulesForDiagnosis,
                  language: (options.language as 'mr' | 'hi' | 'en') || 'mr',
                  trace_id: traceId
                });
                
                console.log(`   🎯 Top diagnosis: ${diagnosisOnlyOutput.diagnoses[0]?.cause || 'NONE'}`);
                console.log(`   Confidence: ${(diagnosisOnlyOutput.top_confidence * 100).toFixed(0)}%`);
                console.log(`   Treatment sufficient: ${diagnosisOnlyOutput.confidence_sufficient_for_treatment}`);
                
                // Format diagnosis for farmer communication
                const diagnosisMessage = formatDiagnosisForLLM(
                  diagnosisOnlyOutput,
                  (options.language as 'mr' | 'hi' | 'en') || 'mr'
                );
                
                // Complete audit logging
                auditLogger.logSymbolicDecision({
                  decision_id: `diag_only_${traceId}`,
                  rules_fired: matchedRulesForDiagnosis.map(r => r.rule_id),
                  actions_returned: diagnosisOnlyOutput.diagnoses.map(d => ({
                    action_type: d.action_type,
                    cause: d.cause,
                    confidence: d.confidence
                  })),
                  actions_filtered_out: []
                });
                
                auditLogger.logResponse({
                  source: 'DIAGNOSIS_ONLY_MODE',
                  language_match: true,
                  llm_model: undefined
                });
                
                await auditLogger.completeTurn(Date.now() - startTime);
                
                // Return DIAGNOSIS_ONLY response
                return {
                  type: 'DIAGNOSIS_PROVIDED',
                  session_id: sessionId,
                  decision_id: `diag_only_${traceId}`,
                  communication: {
                    main_message: {
                      mr: diagnosisMessage,
                      hi: diagnosisMessage,
                      en: diagnosisMessage
                    },
                    options: []
                  },
                  diagnosis_output: diagnosisOnlyOutput,
                  metadata: {
                    mode: 'DIAGNOSIS_ONLY',
                    clarification_status: 'SKIPPED',
                    source: 'DECISION_RULES',
                    confidence: diagnosisOnlyOutput.top_confidence,
                    safety_status: diagnosisOnlyOutput.confidence_sufficient_for_treatment ? 'TREATMENT_READY' : 'MONITORING_ADVISED',
                    rules_applied: matchedRulesForDiagnosis.length,
                    processing_time_ms: Date.now() - startTime,
                    agents_used: agentsUsed,
                    trace_id: traceId,
                    terminal_damage: diagnosisOnlyOutput.terminal_damage_detected,
                    crop_locked: diagnosisOnlyOutput.crop_code,
                    stage_locked: diagnosisOnlyOutput.growth_stage,
                    photo_confirmation_available: diagnosisOnlyOutput.photo_confirmation.available
                  }
                };
              }
              
              // Standard multi-match detection (only when NOT in Diagnosis-Only Mode)
              if (symbolicResult.firedRules && symbolicResult.firedRules.length > 1 && !diagnosisOnlyModeActive) {
                console.log(`\n🔍 [MultiMatch] Checking ${symbolicResult.firedRules.length} fired rules for competition...`);
                
                try {
                  const multiMatchResult = await performMultiMatchDetection(
                    symbolicResult.firedRules,
                    this.supabase,
                    options.language || 'mr',
                    0.15 // 15% confidence threshold
                  );
                  
                  if (multiMatchResult.has_competition && multiMatchResult.clarification_output) {
                    console.log(`   🚨 [MultiMatch] COMPETITION DETECTED: ${multiMatchResult.competing_matches.length} similar diagnoses`);
                    console.log(`   📋 Generating clarification to distinguish between:`);
                    multiMatchResult.competing_matches.forEach(m => {
                      console.log(`      - ${m.cause_code} (${(m.confidence * 100).toFixed(0)}%)`);
                    });
                    
                    // Return clarification response BEFORE proceeding to treatment
                    return {
                      type: 'CLARIFICATION_QUESTION',
                      session_id: sessionId,
                      question: {
                        question_id: multiMatchResult.clarification_output.question_id,
                        text_mr: multiMatchResult.clarification_output.question_text.mr,
                        text_hi: multiMatchResult.clarification_output.question_text.hi,
                        text_en: multiMatchResult.clarification_output.question_text.en,
                        options: multiMatchResult.clarification_output.options.map(opt => ({
                          value: opt.id,
                          label: opt.label[options.language || 'mr'] || opt.label.mr,
                          maps_to: opt.maps_to
                        })),
                        selection_type: multiMatchResult.clarification_output.selection_type
                      },
                      communication: {
                        main_message: multiMatchResult.clarification_output.question_text,
                        options: multiMatchResult.clarification_output.options.map(opt => 
                          opt.label[options.language || 'mr'] || opt.label.mr
                        )
                      },
                      metadata: {
                        confidence: multiMatchResult.competing_matches[0]?.confidence || 0,
                        safety_status: 'DIFFERENTIAL_DIAGNOSIS_REQUIRED',
                        reason: 'MULTIPLE_COMPETING_DIAGNOSES',
                        competing_rules: multiMatchResult.competing_matches.map(m => m.rule_id),
                        possible_causes: multiMatchResult.competing_matches.map(m => m.cause_code),
                        agents_used: agentsUsed,
                        trace_id: traceId,
                        processing_time_ms: Date.now() - startTime
                      }
                    };
                  } else {
                    console.log(`   ✅ [MultiMatch] No competition - single clear diagnosis`);
                  }
                } catch (multiMatchError) {
                  console.warn(`   ⚠️ [MultiMatch] Detection failed (non-blocking):`, multiMatchError);
                }
              }
            }
          } catch (symbolicError) {
            console.warn('   ⚠️ Symbolic Reasoner failed (non-blocking):', symbolicError);
          }
        }
        
      } catch (canonicalError) {
        console.error('   ❌ Canonical State Builder failed (non-blocking):', canonicalError);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // DEFERRED CLARIFICATION: Only return clarification if symbolic brain found 0 rules
      // This ensures we always try the symbolic brain BEFORE falling back to clarification
      // ═══════════════════════════════════════════════════════════════════════════
      const totalRulesMatched = layeredRuleResult?.rules_matched || 0;
      
      if (pendingClarificationResponse && totalRulesMatched === 0) {
        console.log(`\n🔄 DEFERRED CLARIFICATION TRIGGERED`);
        console.log(`   📊 Symbolic brain found 0 rules - now returning prepared clarification`);
        
        const { clarificationResponse, intentConfidence, inductionCoverage, inductionConfidence } = pendingClarificationResponse;
        
        // CRITICAL FIX: If clarification has 0 options, generate dynamic options from database
        let safeOptionsForLog = Array.isArray(clarificationResponse?.options) ? clarificationResponse.options : [];
        
        if (safeOptionsForLog.length === 0) {
          console.log(`   ⚠️ Clarification has 0 options - generating dynamic fallback from database`);
          
          // Try to generate observation-based options from multi-match detector
          try {
            const { generateFallbackClarificationOptions } = await import('./generic-multi-match-detector.ts');
            const dynamicOptions = await generateFallbackClarificationOptions(
              landContext?.current_crop?.toUpperCase(),
              this.supabase,
              options.language || 'mr'
            );
            
            if (dynamicOptions && dynamicOptions.length > 0) {
              safeOptionsForLog = dynamicOptions;
              console.log(`   ✅ Generated ${dynamicOptions.length} dynamic options from database`);
            }
          } catch (dynamicError) {
            console.warn(`   ⚠️ Dynamic option generation failed:`, dynamicError);
          }
        }
        
        const responseText = clarificationResponse?.response_text || this.generateDefaultClarification(
          options.language || 'mr',
          farmerMessage,
          landContext?.current_crop
        );
        
        console.log(`   📋 Returning clarification with ${safeOptionsForLog.length} options`);
        agentsUsed.push('CLARIFICATION_GENERATOR');
        
        return {
          type: 'CLARIFICATION_QUESTION',
          session_id: sessionId,
          question: {
            question_id: `clarify_${Date.now()}`,
            text_mr: responseText,
            text_hi: responseText,
            text_en: responseText,
            options: safeOptionsForLog.map((opt: string, idx: number) => ({
              value: String(idx + 1),
              label: opt
            }))
          },
          metadata: {
            confidence: intentConfidence,
            safety_status: 'NEEDS_CLARIFICATION',
            rules_applied: 0,
            symbolic_brain_ran: true,
            reason: 'ZERO_RULES_AFTER_SYMBOLIC_BRAIN',
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            trace_id: traceId,
            pendingClarificationOptions: safeOptionsForLog,
            // Language Induction Layer metrics (independent of intent confidence)
            induction_coverage: inductionCoverage,
            induction_confidence: inductionConfidence,
            induction_version: LANGUAGE_INDUCTION_VERSION
          }
        };
      } else if (pendingClarificationResponse && totalRulesMatched > 0) {
        console.log(`   ✅ Symbolic brain found ${totalRulesMatched} rules - SKIPPING clarification`);
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
      
      // ═══════════════════════════════════════════════════════════════════════════
      // LAYER 3: RULE EVALUATION (Symbolic Brain - No LLM)
      // ═══════════════════════════════════════════════════════════════════════════
      const layer3Start = Date.now();
      console.log('\n⚙️ [LAYER 3] Rule Evaluation...');
      console.log(`   [${traceId}] PHASE 4: Executing Rule Engine with Decision Graph Bridge...`);
      
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
      
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Attach layered_rule_result to decisionOutput for index.ts recovery
      // This ensures primary_decision from LayeredRuleEvaluator is available for fallback
      // ═══════════════════════════════════════════════════════════════════════════
      if (layeredRuleResult) {
        decisionOutput.layered_rule_result = layeredRuleResult;
        
        // CRITICAL: If ruleEngine.execute() returned empty primary_decision but layeredRuleResult has one,
        // use layeredRuleResult.primary_decision as the authoritative source
        if (layeredRuleResult.primary_decision && 
            layeredRuleResult.primary_decision.rule_id && 
            layeredRuleResult.primary_decision.action_type) {
          
          const hasValidPrimary = decisionOutput.primary_decision?.action_type && 
                                  (decisionOutput.primary_decision?.rule_id || 
                                   decisionOutput.primary_decision?.application_details?.rule_id);
          
          if (!hasValidPrimary) {
            console.log(`   🔄 PRIMARY_DECISION RECOVERY: Using layered_rule_result.primary_decision`);
            console.log(`      rule_id=${layeredRuleResult.primary_decision.rule_id}`);
            console.log(`      action_type=${layeredRuleResult.primary_decision.action_type}`);
            
            decisionOutput.primary_decision = {
              action_type: layeredRuleResult.primary_decision.action_type,
              rule_id: layeredRuleResult.primary_decision.rule_id,
              specific_action: layeredRuleResult.primary_decision.action_type,
              target: {},
              urgency: 'WITHIN_24H',
              priority: layeredRuleResult.primary_decision.priority,
              timing: {
                recommended_start: new Date().toISOString(),
                recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                weather_dependency: false,
                reason: 'Recovered from layered_rule_result.primary_decision in orchestrator'
              },
              application_details: {
                product_name: 'See structured response',
                product_type: 'BOTANICAL',
                action_text: layeredRuleResult.primary_decision.action_text,
                reason_text: layeredRuleResult.primary_decision.reason_text,
                knowledge_text: layeredRuleResult.primary_decision.knowledge_text,
                i18n_key: layeredRuleResult.primary_decision.i18n_key,
                response_mr: layeredRuleResult.primary_decision.response_mr,
                response_hi: layeredRuleResult.primary_decision.response_hi,
                response_en: layeredRuleResult.primary_decision.response_en,
                rule_id: layeredRuleResult.primary_decision.rule_id
              },
              expected_outcomes: {
                efficacy_percent: layeredRuleResult.primary_decision.confidence_score 
                  ? Math.round(layeredRuleResult.primary_decision.confidence_score * 100) 
                  : 75,
                time_to_visible_effect_days: '3-5',
                success_indicators: []
              }
            };
          }
        }
        
        // Also attach matched_responses for additional recovery options
        if (layeredRuleResult.matched_responses && layeredRuleResult.matched_responses.length > 0) {
          decisionOutput.matched_responses = layeredRuleResult.matched_responses;
        }
      }
      
      console.log('   ✅ Decision generated:', decisionOutput.status);
      console.log('   ✅ Rules applied:', decisionOutput.rules_applied?.length || 0);
      console.log(`   ✅ Primary decision: ${decisionOutput.primary_decision?.action_type || 'NONE'} (rule: ${decisionOutput.primary_decision?.rule_id || decisionOutput.primary_decision?.application_details?.rule_id || 'NONE'})`);
      
      layerTimings.layer3_rules = Date.now() - layer3Start;
      console.log(`   ✅ Layer 3 complete (${layerTimings.layer3_rules}ms)`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-19: PHOTO REQUEST ON LOW CONFIDENCE + NO RULES
      // If rule engine returned no recommendations AND confidence is low,
      // request a photo to help with diagnosis
      // ═══════════════════════════════════════════════════════════════════════════
      const rulesAppliedCount = decisionOutput.rules_applied?.length || 0;
      const hasNoRecommendations = rulesAppliedCount === 0 || !decisionOutput.primary_decision;
      const isLowConfidence = (decisionOutput.confidence_score || 0) < 0.6;
      const hasNoPhoto = !options.photoUrl && !photoAnalysisResult;
      
      if (hasNoRecommendations && isLowConfidence && hasNoPhoto) {
        console.log(`\n📸 [PHASE-19] Low confidence + no rules matched - requesting photo`);
        console.log(`   Rules applied: ${rulesAppliedCount}, Confidence: ${decisionOutput.confidence_score || 0}`);
        
        // Return photo request to help with diagnosis
        return {
          type: 'PHOTO_REQUEST',
          session_id: sessionId,
          photo_instructions: {
            text_mr: `📷 अधिक अचूक निदानासाठी, कृपया प्रभावित पानाचा/पिकाचा फोटो पाठवा.\n\n💡 टिप्स:\n• चांगल्या प्रकाशात फोटो काढा\n• प्रभावित भागाचा जवळून फोटो\n• निरोगी पान सोबत ठेवा`,
            text_hi: `📷 सटीक निदान के लिए, कृपया प्रभावित पत्ती/फसल की फोटो भेजें.\n\n💡 टिप्स:\n• अच्छी रोशनी में फोटो लें\n• प्रभावित क्षेत्र का करीब से फोटो\n• स्वस्थ पत्ती साथ में रखें`,
            text_en: `📷 For accurate diagnosis, please send a photo of the affected leaf/crop.\n\n💡 Tips:\n• Take photo in good lighting\n• Close-up of affected area\n• Include a healthy leaf for comparison`,
            tips: [
              'Good lighting',
              'Close-up of affected area',
              'Include healthy part for comparison'
            ]
          },
          metadata: {
            confidence: decisionOutput.confidence_score || 0,
            safety_status: 'PHOTO_REQUESTED',
            rules_applied: rulesAppliedCount,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            trace_id: traceId,
            layer_timings: layerTimings,
            reason: 'LOW_CONFIDENCE_NO_RULES'
          }
        };
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-19: Enhance decision with photo analysis results if available
      // ═══════════════════════════════════════════════════════════════════════════
      if (photoAnalysisResult && photoAnalysisResult.success) {
        console.log(`\n📸 [PHASE-19] Enhancing decision with photo analysis...`);
        
        // Add photo observations to decision output
        decisionOutput = {
          ...decisionOutput,
          photo_analysis: {
            observations: photoAnalysisResult.observations,
            detected_issues: photoAnalysisResult.detected_issues,
            severity: photoAnalysisResult.severity_assessment,
            confidence_boost: photoAnalysisResult.confidence > 0.7 ? 0.15 : 0.05
          }
        };
        
        // Boost confidence if photo confirms diagnosis
        if (photoAnalysisResult.confidence > 0.7) {
          decisionOutput.confidence_score = Math.min(1, (decisionOutput.confidence_score || 0.5) + 0.15);
          console.log(`   Confidence boosted to ${(decisionOutput.confidence_score * 100).toFixed(0)}% (photo confirmation)`);
        }
        
        agentsUsed.push('PHOTO_ENHANCED');
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // P0-E: INTENT LOCK ENFORCEMENT - Filter actions by locked intent
      // CRITICAL: Prevent actions outside the intent scope from reaching the farmer
      // ═══════════════════════════════════════════════════════════════════════════
      console.log(`\n🔒 [${traceId}] P0-E: Applying Intent Lock Filter...`);
      
      // PHASE-16: Safe array handling for actions collection
      const allActions: any[] = [];
      if (decisionOutput?.primary_decision) {
        allActions.push(decisionOutput.primary_decision);
      }
      const safeSecondaryActions = Array.isArray(decisionOutput?.secondary_actions) ? decisionOutput.secondary_actions : [];
      if (safeSecondaryActions.length > 0) {
        allActions.push(...safeSecondaryActions.filter(a => a != null));
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
      // ═══════════════════════════════════════════════════════════════════════════
      // LAYER 4: LLM RESPONSE FORMATTING (Render-only mode)
      // ═══════════════════════════════════════════════════════════════════════════
      const layer4Start = Date.now();
      console.log('\n🎨 [LAYER 4] LLM Response Formatting...');
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
      return this.handleOrchestrationError(
        error as Error, 
        sessionId, 
        farmerMessage, 
        agentsUsed, 
        startTime,
        options.language || 'mr',
        landContext
      );
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
      // PHASE-14: Log to ai_chat_messages.error_details instead of nonexistent system_errors table
      // This stores error info as metadata on assistant messages for debugging
      await this.supabase.from('ai_chat_messages').update({
        error_details: {
          error_type: 'DECISION_SAVE_FAILED',
          trace_id: traceId,
          error_message: error?.message || String(error),
          error_code: error?.code,
          timestamp: new Date().toISOString()
        }
      }).eq('session_id', sessionId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(1);
      
      console.log(`   📝 [${traceId}] Error logged to ai_chat_messages.error_details`);
    } catch (logError) {
      // Last resort: just log to console (non-blocking)
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
    startTime: number,
    language: 'mr' | 'hi' | 'en' = 'mr',
    landContext?: any
  ): OrchestratorResponse {
    console.error('❌ Orchestration error:', error.message);
    console.error('   Stack:', error.stack?.substring(0, 500));
    
    // PHASE-14: Log error to ai_chat_messages instead of nonexistent system_errors table
    // This ensures errors are visible in audit trail (non-blocking fire-and-forget)
    this.supabase.from('ai_chat_messages').update({
      error_details: {
        error_type: error.name,
        error_message: error.message,
        farmer_input_snippet: farmerMessage.substring(0, 200),
        stack_snippet: error.stack?.substring(0, 500),
        timestamp: new Date().toISOString()
      }
    }).eq('session_id', sessionId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(1)
      .then(() => console.log(`   📝 Error logged to ai_chat_messages.error_details`))
      .catch(() => {});
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PRODUCTION FIX: Generate context-aware helpful response even on error
    // Instead of generic message, provide stage-aware monitoring advice
    // ═══════════════════════════════════════════════════════════════════════════
    const messageLower = farmerMessage.toLowerCase();
    let fallbackAdvice = '';
    
    // Build context-aware advice if we have land data
    if (landContext?.current_crop && landContext?.growth_stage) {
      const cropName = landContext.current_crop;
      const stage = landContext.growth_stage;
      const days = landContext.days_since_sowing || '?';
      
      const stageAdviceMap: Record<string, Record<string, string>> = {
        'mr': {
          GERMINATION: `🌱 तुमचे ${cropName} उगवण अवस्थेत आहे (${days} दिवस). या टप्प्यात:\n• मातीचा ओलावा तपासा\n• अति पाणी टाळा\n• उंदीर/किडीचे निरीक्षण करा`,
          SEEDLING: `🌿 तुमचे ${cropName} रोप अवस्थेत आहे (${days} दिवस). या टप्प्यात:\n• पाणी व्यवस्थापन योग्य ठेवा\n• नायट्रोजन खताची पहिली मात्रा द्या\n• रोपांची संख्या तपासा`,
          TILLERING: `🌾 तुमचे ${cropName} फुटवा अवस्थेत आहे (${days} दिवस). या टप्प्यात:\n• युरिया टॉप ड्रेसिंग करा\n• खुंट भरणी करा\n• कीड/रोग निरीक्षण सुरू ठेवा`,
          VEGETATIVE: `🌱 तुमचे ${cropName} वाढीच्या अवस्थेत आहे (${days} दिवस). या टप्प्यात:\n• नियमित निरीक्षण करा\n• पाणी व्यवस्थापन योग्य ठेवा`,
          GRAND_GROWTH: `🌴 तुमचे ${cropName} जोमदार वाढ अवस्थेत आहे (${days} दिवस). या टप्प्यात:\n• पाणी आणि खत पुरेसे द्या\n• आंतर मशागत करा`,
          FLOWERING: `🌸 तुमचे ${cropName} फुलोरा अवस्थेत आहे (${days} दिवस). या टप्प्यात:\n• मधमाशांसाठी विषारी औषधे टाळा\n• पाणी थांबवू नका`,
          MATURITY: `🌾 तुमचे ${cropName} परिपक्व होत आहे (${days} दिवस). या टप्प्यात:\n• पाणी कमी करा\n• कापणीची तयारी करा`
        },
        'hi': {
          GERMINATION: `🌱 आपकी ${cropName} अंकुरण अवस्था में है (${days} दिन). इस समय:\n• मिट्टी की नमी जांचें\n• अधिक पानी न दें\n• चूहे/कीटों पर नजर रखें`,
          SEEDLING: `🌿 आपकी ${cropName} बीजावस्था में है (${days} दिन). इस समय:\n• पानी प्रबंधन सही रखें\n• नाइट्रोजन की पहली खुराक दें\n• पौधों की संख्या जांचें`,
          TILLERING: `🌾 आपकी ${cropName} कल्ले निकलने की अवस्था में है (${days} दिन). इस समय:\n• यूरिया टॉप ड्रेसिंग करें\n• गड्ढे भरें\n• कीट/रोग निगरानी जारी रखें`,
          VEGETATIVE: `🌱 आपकी ${cropName} वनस्पति अवस्था में है (${days} दिन). इस समय:\n• नियमित निगरानी करें\n• पानी प्रबंधन सही रखें`,
          GRAND_GROWTH: `🌴 आपकी ${cropName} तेज बढ़वार में है (${days} दिन). इस समय:\n• पानी और खाद पर्याप्त दें\n• अंतर-कृषि करें`,
          FLOWERING: `🌸 आपकी ${cropName} फूल आने की अवस्था में है (${days} दिन). इस समय:\n• मधुमक्खियों के लिए विषाक्त दवाइयां टालें\n• पानी बंद न करें`,
          MATURITY: `🌾 आपकी ${cropName} पक रही है (${days} दिन). इस समय:\n• पानी कम करें\n• कटाई की तैयारी करें`
        },
        'en': {
          GERMINATION: `🌱 Your ${cropName} is in germination stage (${days} days). At this stage:\n• Check soil moisture\n• Avoid excess water\n• Monitor for rodents/pests`,
          SEEDLING: `🌿 Your ${cropName} is in seedling stage (${days} days). At this stage:\n• Maintain proper water management\n• Apply first nitrogen dose\n• Check plant population`,
          TILLERING: `🌾 Your ${cropName} is in tillering stage (${days} days). At this stage:\n• Apply urea top dressing\n• Fill gaps\n• Continue pest/disease monitoring`,
          VEGETATIVE: `🌱 Your ${cropName} is in vegetative stage (${days} days). At this stage:\n• Monitor regularly\n• Maintain proper water management`,
          GRAND_GROWTH: `🌴 Your ${cropName} is in grand growth stage (${days} days). At this stage:\n• Provide adequate water and fertilizer\n• Do intercultivation`,
          FLOWERING: `🌸 Your ${cropName} is in flowering stage (${days} days). At this stage:\n• Avoid bee-toxic chemicals\n• Don't stop irrigation`,
          MATURITY: `🌾 Your ${cropName} is maturing (${days} days). At this stage:\n• Reduce irrigation\n• Prepare for harvest`
        }
      };
      
      const stageUpper = stage.toUpperCase();
      fallbackAdvice = stageAdviceMap[language]?.[stageUpper] || stageAdviceMap['mr']?.[stageUpper] || '';
    }
    
    // If no stage advice, detect query type and provide relevant generic advice
    if (!fallbackAdvice) {
      if (/खत|खाद|urea|dap|fertilizer|युरिया|डीएपी/.test(messageLower)) {
        fallbackAdvice = language === 'mr' ? '🌱 खत शिफारस: मातीची तपासणी करा आणि शिफारसीनुसार NPK द्या. पिकाचे नाव आणि वय सांगा.' :
                         language === 'hi' ? '🌱 खाद सिफारिश: मिट्टी जांच कराएं और सिफारिश के अनुसार NPK दें। फसल का नाम और उम्र बताएं।' :
                         '🌱 Fertilizer advice: Get soil tested and apply NPK as recommended. Tell me your crop name and age.';
      } else if (/पाणी|पानी|water|irrigation|सिंचन|सिंचाई/.test(messageLower)) {
        fallbackAdvice = language === 'mr' ? '💧 पाणी व्यवस्थापन: सकाळी किंवा संध्याकाळी पाणी द्या. पाणी साचणे टाळा. पिकाचे नाव सांगा.' :
                         language === 'hi' ? '💧 पानी प्रबंधन: सुबह या शाम को पानी दें। पानी का जमाव टालें। फसल का नाम बताएं।' :
                         '💧 Water management: Irrigate in morning or evening. Avoid waterlogging. Tell me your crop.';
      } else if (/किडी|कीट|कीड|pest|अळी|माशी|insect|बग|कीड़ा/.test(messageLower)) {
        fallbackAdvice = language === 'mr' ? '🐛 किडी नियंत्रण: निंबोळी अर्क 5% फवारा. अचूक निदानासाठी फोटो पाठवा.' :
                         language === 'hi' ? '🐛 कीट नियंत्रण: नीम अर्क 5% छिड़काव करें। सटीक निदान के लिए फोटो भेजें।' :
                         '🐛 Pest control: Spray 5% neem extract. Send a photo for accurate diagnosis.';
      } else if (/रोग|disease|वाळणे|पिवळे|बुरशी|fungus|wilting|yellow/.test(messageLower)) {
        fallbackAdvice = language === 'mr' ? '🌿 रोग नियंत्रण: प्रभावित भाग काढा. अचूक निदानासाठी फोटो पाठवा.' :
                         language === 'hi' ? '🌿 रोग नियंत्रण: प्रभावित भाग हटाएं। सटीक निदान के लिए फोटो भेजें।' :
                         '🌿 Disease control: Remove affected parts. Send a photo for accurate diagnosis.';
      }
    }
    
    // Add photo request if no specific advice
    if (!fallbackAdvice) {
      fallbackAdvice = language === 'mr' ? '📸 अधिक अचूक सल्ला देण्यासाठी कृपया पिकाचा फोटो पाठवा किंवा समस्या सविस्तर सांगा.' :
                       language === 'hi' ? '📸 अधिक सटीक सलाह के लिए कृपया फसल का फोटो भेजें या समस्या विस्तार से बताएं।' :
                       '📸 For more accurate advice, please send a photo of your crop or describe the problem in detail.';
    }
    
    return {
      type: 'DECISION_PROVIDED',  // Changed from SYSTEM_ERROR to provide better UX
      session_id: sessionId,
      communication: {
        message_id: crypto.randomUUID(),
        decision_id: `fallback_${Date.now()}`,
        session_id: sessionId,
        farmer_id: '',
        language: language,
        format: 'RICH_TEXT',
        tone: 'FRIENDLY',
        created_at: new Date().toISOString(),
        main_message: {
          full_text: {
            mr: fallbackAdvice,
            hi: fallbackAdvice,
            en: fallbackAdvice
          }
        },
        quick_actions: [],
        metadata: {
          word_count: fallbackAdvice.split(/\s+/).length,
          reading_time_seconds: 10,
          confidence_score: 0.4,
          source: 'ERROR_FALLBACK'
        }
      } as any,
      decision_output: {
        decision_id: `fallback_${Date.now()}`,
        session_id: sessionId,
        status: 'MONITORING_ADVISED',
        decision_brain_source: true,
        metadata: {
          error_type: error.name,
          error_message: error.message.substring(0, 200)
        }
      } as any,
      dataAudit: landContext ? this.buildDataAudit(landContext, null) : undefined,
      metadata: {
        confidence: 0.4,
        safety_status: 'SAFE',
        rules_applied: 0,
        processing_time_ms: Date.now() - startTime,
        agents_used: [...agentsUsed, 'ERROR_RECOVERY']
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P1-2: AUTHORITY BLOCK MESSAGE GENERATOR
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateAuthorityBlockMessage(
    authority: string,
    reason: string,
    language: string
  ): string {
    const messages: Record<string, Record<string, string>> = {
      LAND: {
        mr: `⚠️ **जमिनीची समस्या आढळली**\n\n${reason}\n\n` +
            `🚫 सध्या सिंचन/स्प्रे करू नका.\n\n` +
            `💡 **पुढचे पाऊल:**\n` +
            `• मातीची EC तपासणी करा\n` +
            `• जास्त पाणी देणे टाळा\n` +
            `• कृषी अधिकाऱ्यांचा सल्ला घ्या`,
        hi: `⚠️ **जमीन की समस्या पाई गई**\n\n${reason}\n\n` +
            `🚫 अभी सिंचाई/स्प्रे न करें।\n\n` +
            `💡 **अगला कदम:**\n` +
            `• मिट्टी की EC जांच करें\n` +
            `• अधिक पानी देना बंद करें\n` +
            `• कृषि अधिकारी से सलाह लें`,
        en: `⚠️ **Land Issue Detected**\n\n${reason}\n\n` +
            `🚫 Do not irrigate or spray now.\n\n` +
            `💡 **Next Steps:**\n` +
            `• Check soil EC level\n` +
            `• Avoid overwatering\n` +
            `• Consult agricultural officer`
      },
      SAFETY: {
        mr: `🚨 **सुरक्षितता चिंता**\n\n${reason}\n\n` +
            `⛔ कोणतीही फवारणी करू नका.\n` +
            `📞 कृपया तज्ञांशी संपर्क साधा.`,
        hi: `🚨 **सुरक्षा चिंता**\n\n${reason}\n\n` +
            `⛔ कोई स्प्रे न करें।\n` +
            `📞 कृपया विशेषज्ञ से संपर्क करें।`,
        en: `🚨 **Safety Concern**\n\n${reason}\n\n` +
            `⛔ Do not spray anything.\n` +
            `📞 Please contact an expert.`
      },
      CLIMATE: {
        mr: `🌧️ **हवामान चेतावणी**\n\n${reason}\n\n` +
            `⏳ हवामान सुधारल्यानंतर कार्यवाही करा.`,
        hi: `🌧️ **मौसम चेतावनी**\n\n${reason}\n\n` +
            `⏳ मौसम ठीक होने पर कार्रवाई करें।`,
        en: `🌧️ **Weather Warning**\n\n${reason}\n\n` +
            `⏳ Wait for weather to improve before taking action.`
      }
    };
    
    const authorityMessages = messages[authority] || messages['LAND'];
    return authorityMessages[language] || authorityMessages['mr'];
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P1-2: LAND STRESS WARNING PREPENDER FOR CROP HEALTH
  // ═══════════════════════════════════════════════════════════════════════════
  
  private prependLandStressWarning(
    originalMessage: string,
    reason: string,
    language: string
  ): string {
    const warnings: Record<string, string> = {
      mr: `⚠️ **जमिनीची समस्या आढळली:** ${reason}\n\n`,
      hi: `⚠️ **जमीन समस्या पाई गई:** ${reason}\n\n`,
      en: `⚠️ **Land Issue Detected:** ${reason}\n\n`
    };
    
    return (warnings[language] || warnings['mr']) + originalMessage;
  }
}

export const orchestrator = new AIAgentOrchestrator();
