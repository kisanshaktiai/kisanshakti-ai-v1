/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILE:      supabase/functions/ai-agriculture-chat/agents/orchestrator.ts
 * ROLE:      Master orchestrator — coordinates 9 specialized agents for
 *            end-to-end agronomic advisory (intent → rules → narration).
 * AUTHORITY: RUNTIME (single orchestrator; only caller allowed to invoke
 *            runGraphRuntime, rule-engine-executor, layered-rule-evaluator).
 * STATUS:    ACTIVE
 * VERSION:   v2.0 (LLM-First Response System)
 * LAST_PR:   PR-6 (header stamping, 2026-07-06)
 * STAMPED:   2026-07-06
 * NOTES:     Simple Qs answered directly via LLM; rule engine only fires for
 *            pest / disease / treatment decisions.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getLanguageName } from '../utils/language-utils.ts';

// Phase H — Canonical Conversation State (single runtime authority)
import { buildConversationState, type ConversationState } from '../runtime/conversation-state.ts';
import { computeCoverage, isInformative as isInformativeObs } from '../runtime/evidence-coverage.ts';
import { emitBrainTrace } from '../runtime/brain-trace.ts';
import { reconcilePhenology } from '../runtime/phenology-reconciler.ts';
import { emitNodeTrace } from '../runtime/graph-node-trace.ts';
import { checkGraphInvariants, emitFinalResponseContract, type InvariantSnapshot } from '../runtime/graph-invariants.ts';
import { classifyEvidence, isRealObservation } from '../runtime/evidence-classifier.ts';
import { SymbolContract } from '../runtime/symbol-contract.ts';

type DecisionGraphStage =
  | 'POST_EVIDENCE_FREEZE'
  | 'OBS_TO_HYP'
  | 'HYP_TO_RULE'
  | 'RULE_RESULT'
  | 'BRAIN_TRACE';

const DECISION_GRAPH_STAGE_SEQUENCE: Record<DecisionGraphStage, number> = {
  POST_EVIDENCE_FREEZE: 1,
  OBS_TO_HYP: 2,
  HYP_TO_RULE: 3,
  RULE_RESULT: 4,
  BRAIN_TRACE: 5,
};

const DIAGNOSTIC_INTENTS_AUTHORITY = new Set<string>([
  'EMERGENCE_FAILURE',
  'GERMINATION_FAILURE',
  'PEST',
  'PEST_PRESENCE_VISIBLE',
  'DISEASE',
  'DISEASE_LIKE_PATTERN',
  'NUTRIENT_STRESS',
  'NUTRIENT_DEFICIENCY',
  'CROP_DAMAGE',
  'WILTING',
  'YELLOWING',
  'REPORT_SYMPTOM',
]);

export function requiresAgronomicReasoningIntent(intent: unknown): boolean {
  return DIAGNOSTIC_INTENTS_AUTHORITY.has(String(intent || '').trim().toUpperCase());
}

function assertDecisionGraphOrder(owner: any, traceId: string, stage: DecisionGraphStage): void {
  const expected = Number(owner.__decisionGraphSequence ?? 0) + 1;
  const actual = DECISION_GRAPH_STAGE_SEQUENCE[stage];
  if (actual !== expected) {
    throw new Error(
      `GRAPH_ORDER_ERROR: trace_id=${traceId} expected=${expected} actual=${actual} stage=${stage}`,
    );
  }
  owner.__decisionGraphSequence = actual;
}

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

// ═══════════════════════════════════════════════════════════════════════════
// SYMBOLIC ROUTING CONTRACT (Fix 2 + Fix 7 + Fix 8)
// Canonical DIRECT-mode intents verified against observation_intent_master
// where clarification_mode='DIRECT'. These intents MUST bypass symptom
// clarification gates and go straight to the symbolic rule engine.
// ═══════════════════════════════════════════════════════════════════════════
export const ADVISORY_DIRECT_INTENTS = new Set<string>([
  'FERTILIZER_SCHEDULE',
  'IRRIGATION_QUERY',
  'IRRIGATION_METHOD_SELECTION',
  'IRRIGATION_SCHEDULING_QUERY',
  'SPRAY_TIMING_QUERY',
  'CROP_HEALTH_DASHBOARD',
  'GENERAL_CROP_INFO',
  'HARVEST_TIMING',
  'BEST_PRACTICE_GENERAL',
  'ORGANIC_FARMING_QUERY',
  'INTERCROPPING_QUERY',
  'IPM_STRATEGY_QUERY',
  'PHI_SAFETY_QUERY',
  'DOSAGE_CALCULATION_QUERY',
  'RESISTANCE_MANAGEMENT_QUERY',
  'SOIL_HEALTH_RESTORATION',
  'SOIL_TESTING_QUERY',
  'SOIL_TYPE_MANAGEMENT',
  'PROACTIVE_SCHEDULE_QUERY',
  'COST_ESTIMATION_QUERY',
  'YIELD_FORECAST_QUERY',
  'TREATMENT_ROI_QUERY',
  'LABOR_PLANNING_QUERY',
  'POST_HARVEST_HANDLING',
  'CROP_ROTATION_QUERY',
  'PLANTING_METHOD_QUERY',
  'SEED_SELECTION',
  'VARIETY_SELECTION_QUERY',
  'SEASONAL_TRANSITION_ALERT',
  'WEATHER_ADVISORY',
]);

export function isAdvisoryRoute(intentCode: string | null | undefined): boolean {
  return !!intentCode && ADVISORY_DIRECT_INTENTS.has(intentCode);
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION CONTRACT GUARD (Fix 2)
// Observations entering the symbolic engine MUST be canonical English codes
// matching /^[A-Z][A-Z0-9_]+$/. Raw farmer text in any language is BLOCKED.
// ═══════════════════════════════════════════════════════════════════════════
export function isCanonicalObservationCode(s: any): boolean {
  return typeof s === 'string' && /^[A-Z][A-Z0-9_]+$/.test(s) && s.length <= 80;
}

const VERNACULAR_RE = /[\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0980-\u09FF\u0A80-\u0AFF\u0A00-\u0A7F\u0B00-\u0B7F]/;
export function filterToCanonicalObservations(obs: any): string[] {
  if (!Array.isArray(obs)) return [];
  const filtered: string[] = [];
  const vernacular: string[] = [];
  const suspicious: string[] = [];
  for (const o of obs) {
    if (isCanonicalObservationCode(o)) filtered.push(o);
    else if (o != null) {
      const s = String(o);
      // FIX 1: raw farmer text (any script) is pre-canonical noise — never
      // treat as a contract violation. Silently forward to canonical resolver.
      if (VERNACULAR_RE.test(s) || /\s/.test(s)) vernacular.push(s.substring(0, 40));
      else suspicious.push(s.substring(0, 60));
    }
  }
  if (vernacular.length > 0) {
    console.log(`[ObservationContract] forwarded ${vernacular.length} pre-canonical vernacular entries to resolver (not blocked)`);
  }
  if (suspicious.length > 0) {
    console.warn(`[ObservationContract] dropped ${suspicious.length} non-canonical entries: ${suspicious.join(' | ')}`);
  }
  return filtered;
}


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
  expandObservationVocabularyViaAliases,
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

// GraphTruth — immutable per-turn agronomic node (T1 in refactor plan)
import { buildGraphTruth, assertGraphTruthIntegrity } from '../runtime/graph-truth.ts';

// CRITICAL FIX: Import normalization functions from type-mappers for consistent code matching
import { 
  normalizeCropCode as normalizeTypeCropCode, 
  normalizePestCode, 
  normalizeDiseaseCode, 
  normalizeSeverity,
  normalizeCropStage,
  normalizeCropCodeForDB,  // Delegates to unified normalizer
  getCropCodeVariants      // Delegates to unified normalizer
} from './type-mappers.ts';

// UNIFIED: Import canonical crop code normalizer
import { normalizeCropCode as unifiedNormalizeCropCode } from '../utils/crop-code-normalizer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// STABILIZATION v4.0: LLM Output Validator + Crop Vocabulary Cache
// ═══════════════════════════════════════════════════════════════════════════
import { validateLLMOutputAgainstDB } from '../utils/llm-output-validator.ts';
import { getCropVocabulary, buildVocabularyPromptBlock } from '../utils/crop-vocabulary-cache.ts';

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
import { resetRuntimeTraceCollector, getRuntimeTraceCollector } from '../runtime/runtime-trace-collector.ts';
import { runNavigator as runDecisionGraphNavigator } from '../runtime/navigator-adapter.ts';
import { buildNavigatorOverride } from '../runtime/navigator-response.ts';
import { lockIntent, filterActionsByIntentLock, requiresClarification, shouldBypassClarificationForAgriSymptom } from './intent-lock.ts';
import { mapObservationsToCauses } from './observation-cause-mapper.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE B/C/E WIRING — request context, mandatory gates, stage SSOT
// ═══════════════════════════════════════════════════════════════════════════
import { createRequestContext, snapshotContext, type RequestContext } from '../decision/request-context.ts';
import { evaluateSemanticGate } from '../decision/semantic-validator.ts';
import { evaluateScientificGate, type CandidateRecommendation } from '../decision/scientific-validator.ts';
import { filterRulesByIntent } from '../bundled-rules/loader.ts';
import * as StageKnowledgeCache from '../utils/stage-knowledge-cache.ts';
// Expose cache to stage-normalizer (DB-first fallback path).
(globalThis as any).__stageKnowledgeCacheRef = StageKnowledgeCache;

// STATIC IMPORT: Causal hypothesis engine (no dynamic imports in edge functions)
import { runCausalHypothesisArbitration } from '../decision/causal-hypothesis-engine.ts';

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
  mapStageToEnum,
  projectCanonicalStateFromGraphTruth
} from './canonical-state-builder.ts';


import {
  evaluateRulesLayered,
  CORE_RULES,
  ALL_RULES,
  getAllRulesWithBundled, // PHASE-13: Use this to include all 2000+ bundled rules
  // Step 4 — evaluateBundledKeywordRules removed (parallel NLU brain);
  // Step 4 — hasStrongAgriObservations was only used inside that fallback.

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

// [STEP 7 REMOVED] gdd-phenology-engine — superseded by runtime/phenology-reconciler + crop_stage_master

// PHASE C: Morphology reconciler — reconciles observed NDVI / height / leaf
// count against expected bands from variety_phenology_profile.
import {
  reconcileMorphology,
  type MorphologyEvidence
} from '../decision/morphology-reconciler.ts';

// ═══════════════════════════════════════════════════════════════════════════
// SAFE STRING UTILITIES - Production-grade guards against undefined/null
// ═══════════════════════════════════════════════════════════════════════════
import {
  safePreviewText,
  normalizeFarmerMessage,
  hasTextContent,
  safeLowerCase
} from '../utils/safe-string.ts';

// RESPONSE INVARIANT GUARD - Ensures deterministic response delivery
import {
  checkResponseInvariant,
  assertResponseReturned,
  logInvariantCheck,
  type InvariantCheckResult
} from '../utils/response-invariant-guard.ts';

// P0: Agricultural NLP Validator - Marathi/Hindi validation with fuzzy matching
import { 
  validateAgricultureNLP, 
  type NLPValidationResult 
} from './nlp-agriculture-validator.ts';

// [STEP 7 REMOVED] phi-enforcement-guardian — PHI now enforced by SafetyGuardian (Gate 3: FoodSafetyCheck)

// [STEP 7 REMOVED] pollinator-protection-rules — pollinator safety now enforced by SafetyGuardian (Gate 4: EnvironmentalCheck POLLINATOR_RISK)

// PHASE-14: Crop Stage Advisor for stage-aware fallback responses
import {
  getStageSpecificAdvice,
  type StageAdvice
} from './crop-stage-advisor.ts';

// [STEP 7 REMOVED] photoperiod-calculator — photoperiod sensitivity moved to crop_stage_master DB flags

// PHASE 1 — Immutable Biological State (single writer = resolve_crop_phenology)
import {
  buildBiologicalState,
  blockStageWriteIfLocked,
  isBiologicalStateLocked,
  type BiologicalState,
} from './biological-state.ts';

interface BiologicalStateContradictionAudit {
  contradiction_flag: true;
  contradiction_codes: string[];
  stage_confidence_before_contradiction: number;
  adjusted_confidence: number;
  stage: string | null;
  trace_id: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED CONSTANT: Emergency observation codes (used in both return paths)
// ═══════════════════════════════════════════════════════════════════════════
const EMERGENCY_OBS_CODES = new Set([
  'DEAD_HEART_PRESENT', 'STEM_BORING_MARKS', 'BORER_DAMAGE', 'BORE_HOLES_AT_BASE',
  'FRASS_VISIBLE', 'MUD_TUBES', 'LARVAE_PRESENT', 'PLANT_DEATH_PATCHES',
  'STEM_ROT_PRESENT', 'CROWN_ROT', 'WILTING_SEVERE', 'SEVERITY_HIGH'
]);

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-17: 8 MANDATORY GATES - NEURO-SYMBOLIC VALIDATION MODULES
// These enforce scientific validity before any treatment recommendation
// ═══════════════════════════════════════════════════════════════════════════
import {
  validateContextCompleteness,
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

// PR-3: `getStageSpecificInfo` was imported but never referenced and was
// never exported by crop-calendar-lookup — removed. `calculateGrowthStageFromDAS`
// is retained as a re-export for downstream helpers that still resolve DAS→stage
// through the DB-backed shim in decision/crop-calendar-lookup.ts.
import { calculateGrowthStageFromDAS } from '../decision/crop-calendar-lookup.ts';

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
// PHASE H + I — Graph SSOT runtime blackboard
// ═══════════════════════════════════════════════════════════════════════════
import {
  GraphRuntimeState,
  checkpoint as graphCheckpoint,
  assertNoGraphDrift,
  loadSnapshotVersions,
  hashCanonicalContext,
  GraphStateDriftError,
  SymbolicIdLeakError,
  RuleCandidate,
} from '../runtime/graph-runtime-state.ts';

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
  type CandidateHypothesis,
  type HypothesisEvaluationOutput
} from '../decision/hypothesis-evaluator.ts';
// PR-2: hypothesis graph MUST be reached through the single runtime facade.
// Do NOT reintroduce a direct `evaluateCandidateHypotheses` import here —
// that bypasses `graphExecuted` bookkeeping and the [GRAPH_RUNTIME] trace.
import { runGraphRuntime } from '../runtime/graph-runtime.ts';
import {
  buildGraphRuntimeSnapshot,
  assertSnapshotNotCorrupt,
  type GraphRuntimeSnapshot,
} from '../runtime/graph-snapshot.ts';

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
// PHASE-25: CONTEXT TRACER - Track crop/stage/DAS through execution path
// Detects and logs context drift between CanonicalContext and CanonicalState
// ═══════════════════════════════════════════════════════════════════════════
import {
  initializeTrace,
  clearTrace,
  traceFromLandContext,
  traceFromCanonicalContext,
  traceFromCanonicalState,
  assertAndCorrectContextAlignment,
  logSessionDrifts,
  CONTEXT_TRACER_VERSION
} from '../utils/context-tracer.ts';

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
  detectCropDamageWithAuthority, // v5.0: Authority-aware terminal detection
  createEnforcedCropAuthority,
  assertTerminalDamageAuthority,
  // v5.1: resolveDiagnosticAuthorityFromObservations REMOVED (legacy v4 dual detector)
  DIAGNOSIS_ONLY_MODE_VERSION,
  CROP_DAMAGE_OBSERVATION_KEYS, // v4.0: Crop damage triggers
  type DiagnosisOnlyOutput,
  type MatchedRule,
  type TerminalDamageDetectionResult,
  type CropDamageDetectionResult, // v4.0: Enhanced result type
  type PreAuthorityGateResult // v3.0: Pre-authority gate result type
} from '../decision/diagnosis-only-mode.ts';

import {
  AuthoredObservationSet,
  ObservationAuthority,
  // PATCH 4 (BUG 4): TERMINAL_CODES_BLOCKED_FROM_INJECTION removed.
  // The DB (intent_observation_mapping.is_active + observation_master.can_generate_question)
  // is the sole authority for whether a code may enter the graph.
} from '../utils/observation-authority.ts';

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

import {
  loadClarificationCandidates,
  assertClarificationContract,
  canonicalizeObservationKey,
} from '../runtime/clarification-contract.ts';
import { buildHypothesisClarificationOptions } from '../decision/hypothesis-clarification-builder.ts';
import { resolveHypothesesFromObservations } from '../decision/observation-hypothesis-resolver.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-12: Helper function to map clarification answer to visual symptom
// UPDATED: Now maps to actual VisualSymptom enum values from canonical-state-builder
// ═══════════════════════════════════════════════════════════════════════════
/**
 * WORLD-CLASS FIX: Map clarification answer to visual symptom
 * Uses ENGLISH canonical keywords ONLY - no hardcoded Marathi/Hindi
 * Matching uses standardized English keywords embedded in option IDs
 */
/**
 * PHASE 5 REWRITE: mapDistributionToSymptom
 * 
 * REMOVED: 100+ hardcoded English/Marathi/Hindi string mappings that acted
 * as a parallel decision layer outside the symbolic engine.
 * 
 * NEW LOGIC: 
 * 1. Extract embedded observation_key from option metadata ([obs_keys:KEY])
 * 2. If no embedded key found, return the raw text as-is for the NLU + 
 *    observation code mapper to handle via DB-sourced lookups.
 * 
 * The symbolic engine (decision_rules + observation_master) is the SSOT
 * for symptom-to-diagnosis mapping. This function must NOT duplicate that logic.
 */
function mapDistributionToSymptom(optionText: string, _scope: ClarificationScope): string {
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Check for embedded observation_key in option text
  // Options are formatted as: "Label text [obs_keys:KEY1,KEY2]"
  // This is the AUTHORITATIVE path - keys come from observation_master
  // ═══════════════════════════════════════════════════════════════════════════
  const obsKeyMatch = optionText.match(/\[obs_keys?:([^\]]+)\]/i);
  if (obsKeyMatch) {
    const embeddedKey = obsKeyMatch[1].split(',')[0].trim().toUpperCase();
    console.log(`   🔑 [mapDistributionToSymptom] Embedded obs_key: ${embeddedKey}`);
    return embeddedKey;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: No embedded key found - return UNKNOWN
  // The NLU semantic extractor + observation code mapper (DB-sourced) will
  // handle language-agnostic mapping. DO NOT hardcode symptom mappings here.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`   ⚠️ [mapDistributionToSymptom] No embedded obs_key in option text, returning UNKNOWN`);
  console.log(`   📋 Option text: "${optionText.substring(0, 80)}"`);
  return 'UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION OPTION TRANSLATION HELPER
// Translates raw observation codes to farmer-friendly local language
// Priority: 1) observation_translations DB table, 2) LLM translation fallback
// ═══════════════════════════════════════════════════════════════════════════
async function translateClarificationOptions(
  options: Array<string | { label: string; observation_key?: string; [key: string]: any }>,
  language: string,
  supabaseClient: any
): Promise<Array<string | { label: string; observation_key?: string; [key: string]: any }>> {
  if (!options || options.length === 0) return options;

  const lang = (language || 'en').toLowerCase();

  // Extract all labels and observation keys
  const optionEntries = options.map((opt, idx) => ({
    idx,
    isString: typeof opt === 'string',
    label: typeof opt === 'string' ? opt : (opt.label || ''),
    obsKey: typeof opt === 'string' ? null : (opt.observation_key || null),
    original: opt
  }));

  // Check which labels look like raw codes (ALL_CAPS_WITH_UNDERSCORES)
  // FIX 33+: Robust normalization for emoji-prefixed labels like "🔍 GAPS IN FIELD"
  const RAW_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,}$/;
  const EMOJI_PREFIX_PATTERN = /^[\p{Emoji}\p{Emoji_Presentation}\s🔍]+\s*/u;

  const normalizeObservationCode = (label?: string | null, obsKey?: string | null): string | null => {
    const key = (obsKey || '').trim().toUpperCase();
    if (key && RAW_CODE_PATTERN.test(key)) return key;

    const cleaned = (label || '')
      .replace(EMOJI_PREFIX_PATTERN, '')
      .trim()
      .replace(/\s+/g, '_')
      .toUpperCase();

    if (cleaned && RAW_CODE_PATTERN.test(cleaned)) return cleaned;
    return null;
  };

  const needsTranslation = optionEntries.filter(e => {
    const normalizedCode = normalizeObservationCode(e.label, e.obsKey);
    if (normalizedCode) return true;

    const label = (e.label || '').trim();
    if (!label) return false;

    // Already human language if mixed/lower-case with spaces
    return false;
  });

  if (needsTranslation.length === 0) {
    return options;
  }

  console.log(`🌐 [ClarificationTranslation] ${needsTranslation.length}/${options.length} options need translation to ${lang}`);

  // Step 1: Look up labels from observation_translations (SSOT).
  // FIX (BUG B): DB stores observation_code lowercase; runtime carries
  // UPPERCASE. Query both cases and match case-insensitively.
  // FIX (BUG A): prefer display_text strictly over description_text — the
  // long description often embeds Latin pathogen names that must never
  // surface in a chip label.
  const upperCodes = Array.from(new Set(
    needsTranslation
      .map(e => normalizeObservationCode(e.label, e.obsKey))
      .filter((c): c is string => !!c)
  ));
  const codesToLookup = Array.from(new Set([
    ...upperCodes,
    ...upperCodes.map(c => c.toLowerCase()),
  ]));

  const labelMap = new Map<string, string>();      // primary chip label (lang)
  const fallbackEnMap = new Map<string, string>(); // english fallback

  try {
    if (codesToLookup.length > 0) {
      const wantLangs = Array.from(new Set([lang, 'en']));
      const { data, error } = await supabaseClient
        .from('observation_translations')
        .select('observation_code, language_code, display_text, description_text')
        .in('observation_code', codesToLookup)
        .in('language_code', wantLangs);

      if (!error && data) {
        for (const row of data) {
          const code = (row.observation_code || '').toUpperCase();
          const display = (row.display_text || '').trim();
          const desc = (row.description_text || '').trim();
          const label = display || desc;
          if (!label) continue;
          const rowLang = (row.language_code || 'en').toLowerCase();
          if (rowLang === lang) labelMap.set(code, label);
          else if (rowLang === 'en') fallbackEnMap.set(code, label);
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ [ClarificationTranslation] DB lookup failed: ${err}`);
  }

  // Step 2: Deterministic English fallback. The previous GPT-4o-mini
  // "translate codes to rural language" path was the source of hallucinated,
  // inconsistent farmer wording — it has been removed. Missing rows are
  // logged so observation_translations can be seeded.
  for (const code of upperCodes) {
    if (labelMap.has(code)) continue;
    const en = fallbackEnMap.get(code);
    if (en) {
      labelMap.set(code, en);
      console.warn(`⚠️ [OBS_LABEL_GAP] ${code} missing ${lang} translation — using EN fallback`);
    } else {
      console.warn(`⚠️ [OBS_LABEL_GAP] ${code} has no ${lang} or EN row in observation_translations — using code fallback`);
    }
  }

  // Step 3: Apply translations to options
  let translatedCount = 0;
  const result = options.map((opt, idx) => {
    const entry = optionEntries[idx];
    const normalizedCode = normalizeObservationCode(entry.label, entry.obsKey);
    const translated = normalizedCode ? labelMap.get(normalizedCode) : undefined;

    if (translated) {
      translatedCount++;
      if (entry.isString) {
        return translated;
      }
      return { ...(opt as any), label: translated };
    }

    // Fallback: avoid raw English leakage in non-English UI
    if (normalizedCode) {
      // CRITICAL FIX: Humanize the code into readable text instead of 
      // returning opaque "Observation option N" labels that are meaningless to farmers.
      // The humanized form (e.g., "Gaps In Field") is still better than generic numbering.
      const humanized = normalizedCode
        .replace(/_/g, ' ')
        .toLowerCase()
        .split(' ')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      if (entry.isString) return humanized;
      return { ...(opt as any), label: humanized };
    }

    return opt;
  });

  console.log(`✅ [ClarificationTranslation] Translated ${translatedCount}/${options.length} option labels`);
  return result;
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
    pendingClarificationObservationKeys?: string[];
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
   * PHASE Y SAFETY NET: expose the orchestrator's service-role Supabase client
   * so external callers (e.g. the index.ts persistence safety net) can persist
   * RuntimeTrace rows on early-return paths without relying on private-field
   * casts or globalThis lookups.
   */
  public getSupabase(): ReturnType<typeof createClient> {
    return this.supabase;
  }
  
  /**
   * Create a per-request DiagnosticFlowController
   */
  private createDiagnosticController(sessionId: string, farmerId: string, landId?: string): DiagnosticFlowController {
    return new DiagnosticFlowController(sessionId, farmerId, this.supabase, landId);
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
    language: string = 'mr'
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
        das: daysSinceSowing,
        pest_watch: stageAdvice.pest_watch.slice(0, 3),
        disease_watch: stageAdvice.disease_watch.slice(0, 2),
        critical_actions: stageAdvice.critical_actions.slice(0, 3)
      }
    };
  }
  
  /**
   * Generic fallback when no crop-stage advisor data is available
   * Returns symbolic structure - narration layer handles i18n
   */
  private generateGenericFallback(
    cropCode: string,
    daysSinceSowing: number,
    _language: string
  ): { i18n_key: string; action_codes: string[]; photoRequested: boolean; metadata: Record<string, any> } {
    // Return symbolic structure only - NO hardcoded language text
    return {
      i18n_key: 'fallback.generic.need_more_info',
      action_codes: ['MONITOR', 'TAKE_PHOTO', 'DESCRIBE_SYMPTOMS'],
      photoRequested: true,
      metadata: {
        crop_code: cropCode,
        das: daysSinceSowing
      }
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
      language?: string;
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
        pendingClarificationObservationKeys?: string[];
        // STRUCTURED SSOT — preferred. Per-option records with canonical
        // observation_key preserved alongside label/value, so OPTION_SELECTED
        // can resolve symbolic identity directly without label mapping.
        pendingClarificationOptionsStructured?: Array<{
          label: string;
          value: string;
          observation_key: string;
          diagnostic_power?: string;
        }>;
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
    (this as any).__decisionGraphSequence = 0;
    (this as any)._evidenceFrozen = false;
    (this as any)._graphExecuted = false;
    (this as any)._ruleResultExists = false;
    (this as any)._graphHypothesisIds = [];
    (this as any)._graphHypothesisRuleIds = [];
    (this as any)._graphHypothesisEdgeMissing = [];
    (this as any)._bioContradictionByLand = new Map<string, BiologicalStateContradictionAudit>();

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE B WIRING — per-request EvidenceLedger + ConfidenceChain
    // Every stage below contributes to this ctx instead of resetting confidence.
    // ═══════════════════════════════════════════════════════════════════════════
    const requestCtx: RequestContext = createRequestContext(traceId);
    // ─────────────────────────────────────────────────────────────────
    // Phase I — Graph SSOT blackboard. ONE per request. Shared by every
    // stage. Frozen-shell + append-only ledger + drift guards.
    // ─────────────────────────────────────────────────────────────────
    const graph = new GraphRuntimeState(traceId);
    let graphCp = graphCheckpoint(graph);

    // ─────────────────────────────────────────────────────────────────
    // PHASE Y — RuntimeTraceCollector (single per request).
    // Captures pipeline stages, snapshots, knowledge versions; persisted by
    // audit-logger.completeTurn() into ai_decision_log. Never throws.
    // ─────────────────────────────────────────────────────────────────
    const runtimeTrace = resetRuntimeTraceCollector({
      trace_id: traceId,
      execution_mode: options.photoUrl ? 'live-vision' : 'live',
      started_at_ms: startTime,
    });
    // Pre-load stage knowledge cache (idempotent, 10min TTL).
    try { await StageKnowledgeCache.loadStageKnowledge(this.supabase); } catch (_e) { /* non-fatal */ }
    // Pre-load DB-backed intent→observation mapping (replaces the deleted
    // hardcoded INTENT_TO_OBSERVATION_MAPPINGS table in observation-code-mapper).
    // Idempotent, 10min TTL — SSOT is public.intent_observation_mapping.
    try {
      const { loadObservationMapping } = await import('../utils/observation-mapping-cache.ts');
      await loadObservationMapping(this.supabase);
    } catch (_e) { /* non-fatal — mapper will log [OBS_MAPPING_CACHE_MISS] */ }
    // PR-2: Pre-load DB-backed observation & hypothesis classification caches
    // (replaces hardcoded failure-class and authority-domain Sets in
    // failure-class-detector, authority-resolver, and unified-decision-gate).
    // SSOT: observation_master + observation_aliases + hypothesis_master.
    try {
      const { loadObservationClassification, loadHypothesisTypes } =
        await import('../utils/observation-classification-cache.ts');
      await Promise.all([
        loadObservationClassification(this.supabase),
        loadHypothesisTypes(this.supabase),
      ]);
    } catch (_e) { /* non-fatal — classifiers log [OBS_CLASSIFICATION_MISS] on lookup */ }

    // ═══════════════════════════════════════════════════════════════════════════
    // Phase H — Fix 7 (Knowledge Initialization)
    // Pre-load all knowledge caches at request init so every execution path
    // (clarification / irrigation / diagnosis / advisory) shares the same
    // warm runtime context. Promise.allSettled → per-cache isolation.
    // ═══════════════════════════════════════════════════════════════════════════
    try {
      const [
        { loadETLStandards },
        { loadAgroZones },
        { loadBaselineGuidelines },
        { loadCropSynonyms },
        { loadCropNames }
      ] = await Promise.all([
        import('../decision/etl-gate.ts'),
        import('../utils/agro-zone-cache.ts'),
        import('../utils/baseline-guidelines-cache.ts'),
        import('../utils/crop-synonyms-cache.ts'),
        import('../utils/crop-names-cache.ts')
      ]);
      const settled = await Promise.allSettled([
        loadETLStandards(this.supabase),
        loadAgroZones(this.supabase),
        loadBaselineGuidelines(this.supabase),
        loadCropSynonyms(this.supabase),
        loadCropNames(this.supabase)
      ]);
      const names = ['etl-standards', 'agro-zones', 'baseline-guidelines', 'crop-synonyms', 'crop-names'];
      settled.forEach((s, i) => {
        if (s.status === 'rejected') {
          const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
          console.warn(`[KNOWLEDGE_PRELOAD] ${names[i]} FAILED: ${msg}`);
          try { requestCtx.ledger.lose('KNOWLEDGE_PRELOAD', names[i], null, msg); } catch {/* non-fatal */}
        } else {
          console.log(`[KNOWLEDGE_PRELOAD] ${names[i]} OK`);
        }
      });
    } catch (e) {
      console.warn(`⚠️ Knowledge base pre-load orchestration failed:`, e instanceof Error ? e.message : 'unknown');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT: Orchestrator must treat farmer text as OPTIONAL metadata.
    // ═══════════════════════════════════════════════════════════════════════════
    const safeFarmerMessage = normalizeFarmerMessage(farmerMessage);
    const hasTextInput = hasTextContent(safeFarmerMessage);
    
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
    console.log(`   [${traceId}] Message: ${safePreviewText(safeFarmerMessage)}`);
    console.log(`   [${traceId}] HasText: ${hasTextInput}, HasPhoto: ${!!options.photoUrl}`);
    console.log(`   [${traceId}] ContextTracer: v${CONTEXT_TRACER_VERSION}`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE-25: Initialize context trace for this turn
    // ═══════════════════════════════════════════════════════════════════════════
    initializeTrace(traceId);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE-26: MANDATORY SESSION STATE LOGGING (Every Turn)
    // Track decision state to detect infinite clarification loops
    // ═══════════════════════════════════════════════════════════════════════════
    const incomingDecisionState = options.sessionState?.decisionState || 'no_session_state';
    const pendingOptionsCount = options.sessionState?.pendingClarificationOptions?.length || 0;
    const clarificationActive = incomingDecisionState === 'awaiting_clarification';
    
    // PART 10: Session continuity data
    const problemsDiscussed = (options.sessionState as any)?.problems_discussed || [];
    const isRepeatConcern = !!(options.sessionState as any)?.is_repeat_concern;
    const lastQueryHash = (options.sessionState as any)?.last_query_hash || '';
    const causalChainDetected = !!(options.sessionState as any)?.causal_chain_detected;
    
    console.log(`\n📊 [${traceId}] ═══ DECISION STATE TRACKING (Turn Start) ═══`);
    console.log(`   session_decision_state: ${incomingDecisionState}`);
    console.log(`   clarification_active: ${clarificationActive}`);
    console.log(`   pending_options_count: ${pendingOptionsCount}`);
    console.log(`   option_selected: ${clarificationActive && pendingOptionsCount > 0 && hasTextInput ? 'LIKELY' : 'NO'}`);
    console.log(`   unified_gate_mode: ${clarificationActive ? 'BLOCKED (awaiting clarification)' : 'ALLOW'}`);
    console.log(`   problems_discussed: ${problemsDiscussed.length} (${problemsDiscussed.map((p: any) => p.problem_code).join(', ') || 'none'})`);
    console.log(`   repeat_concern: ${isRepeatConcern}`);
    console.log(`   causal_chain: ${causalChainDetected}`);
    console.log(`   ═════════════════════════════════════════════════════════`);
    
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
            // PHASE-1 SSOT: BiologicalState (when locked) is the sole stage authority.
            // Only fall back to CROP_SCHEDULE/LAND_CONTEXT when resolver produced no row.
            const _bioLocked = !!(landContext as any)?.biological_state?.is_locked;
            const stageSource: 'BIOLOGICAL_STATE' | 'CROP_SCHEDULE' | 'LAND_CONTEXT' =
              _bioLocked ? 'BIOLOGICAL_STATE'
                : (landContext.sowing_date ? 'CROP_SCHEDULE' : 'LAND_CONTEXT');
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
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-25: TRACE POINT 1 - After landContext fetch
      // ═══════════════════════════════════════════════════════════════════════════
      if (landContext) {
        traceFromLandContext('LAND_FETCH', landContext, traceId);
      }
      
      const canonicalContext = buildCanonicalContextContract(landContext, !!landContext);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-25: TRACE POINT 2 - After CanonicalContext build
      // ═══════════════════════════════════════════════════════════════════════════
      if (canonicalContext) {
        traceFromCanonicalContext('CANONICAL_CONTEXT', canonicalContext, traceId);
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

      // PHASE Y — context snapshot
      try {
        runtimeTrace.setContext({
          land_id:           options.landId ?? landContext?.id ?? null,
          farmer_id:         farmerId ?? null,
          conversation_id:   sessionId ?? null,
          schedule_id:       (landContext as any)?.schedule_id ?? null,
          language:          (options as any).language ?? normalizedInput?.detected_language ?? null,
          crop:              canonicalContext?.crop_code ?? landContext?.current_crop ?? null,
          stage:             canonicalContext?.growth_stage ?? landContext?.current_crop_stage ?? null,
          das:               canonicalContext?.days_since_sowing ?? landContext?.days_since_sowing ?? null,
          ndvi:              canonicalContext?.ndvi ?? null,
          weather:           (landContext as any)?.weather_summary ?? null,
          soil:              (landContext as any)?.soil_summary ?? null,
          canonical:         canonicalContext ?? null,
          intent:            null, // filled after intent lock
        });
      } catch {}

      // ═══════════════════════════════════════════════════════════════════════════
      // Phase H + I — Freeze canonical context onto the Graph SSOT blackboard.
      // Capture per-request snapshot versions (ontology / IOM / translations) so
      // every decision is replayable. assertNoGraphDrift() will fail-fast if any
      // later stage tries to mutate crop/stage/DAS/language/intent.
      // ═══════════════════════════════════════════════════════════════════════════
      try {
        graph.freezeCanonicalContext(canonicalContext ?? null);
        const language = (options as any).language ?? null;
        const cch = hashCanonicalContext(canonicalContext ?? null);
        const versions = await loadSnapshotVersions(this.supabase, {
          language,
          canonicalContextHash: cch,
          rulesBundleVersion: null,
        });
        graph.setSnapshotVersions(versions);
        console.log(
          `[SSOT_TRACE][${traceId}] canonical_hash=${cch} ` +
            `ontology=${versions.ontology_version} iom=${versions.iom_version} ` +
            `translations=${versions.translation_version} language=${language}`
        );

        // ═══════════════════════════════════════════════════════════════════
        // PHASE-1 STAGE AUTHORITY GUARD (log-only during migration)
        // The frozen canonical context MUST have source=BIOLOGICAL_STATE when
        // landContext exists. Any other source means an old authority (crop
        // schedule heuristic, lands.crop_stage text) beat the SSOT.
        // ═══════════════════════════════════════════════════════════════════
        if (canonicalContext && landContext) {
          const bioLocked = !!(landContext as any)?.biological_state?.is_locked;
          if (bioLocked && canonicalContext.source !== 'BIOLOGICAL_STATE') {
            console.warn(
              `⚠️ [STAGE_AUTHORITY_VIOLATION][${traceId}] canonical.source=${canonicalContext.source} ` +
                `but biological_state is LOCKED (stage=${(landContext as any).biological_state.growth_stage}). ` +
                `Expected source=BIOLOGICAL_STATE. Downstream reasoning may use wrong stage.`
            );
          } else if (!bioLocked) {
            console.warn(
              `⚠️ [STAGE_AUTHORITY_VIOLATION][${traceId}] canonical.source=${canonicalContext.source} ` +
                `— no BiologicalState lock (resolve_crop_phenology produced no row). ` +
                `Stage=${canonicalContext.growth_stage} is heuristic, not SSOT.`
            );
          }
        }

        graphCp = assertNoGraphDrift(graph, graphCp, 'CANONICAL_FREEZE');
      } catch (e) {
        if (e instanceof GraphStateDriftError || e instanceof SymbolicIdLeakError) {
          console.error(`🚨 ${e.name}: ${e.message}`);
          throw e;
        }
        console.warn(
          `⚠️ [GRAPH_FREEZE] non-fatal init issue: ${e instanceof Error ? e.message : String(e)}`
        );
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
      
      // ========================================
      // PHASE 0.3B: DB-DRIVEN VOCABULARY ROUTE OVERRIDE
      // ========================================
      // If routeQuery() returned GENERAL_INFO, check crop_vocabulary DB
      // for phrase_pattern matches that indicate a specific intent.
      // This is fully DB-driven: no hardcoded regional strings.
      // ========================================
      if (queryRoute.route === 'GENERAL_INFO') {
        try {
          const msgLower = farmerMessage.toLowerCase();
          // Load universal vocabulary (crop_code='ALL') for cross-crop terms
          const allVocab = await getCropVocabulary('ALL', this.supabase);
          // Also load crop-specific vocab if we have a crop context
          const cropCode = landContext?.current_crop || options.sessionState?.previousCrop;
          const cropVocab = cropCode ? await getCropVocabulary(cropCode, this.supabase) : [];
          const combinedVocab = [...allVocab, ...cropVocab];
          
          for (const entry of combinedVocab) {
            if (!entry.recommended_intent_bias) continue;
            // Word boundary match for phrase_pattern in farmer message
            const pattern = new RegExp(`\\b${entry.phrase_pattern}\\b`, 'i');
            if (pattern.test(msgLower)) {
              const bias = entry.recommended_intent_bias;
              // Map intent bias to appropriate route
              const SYMPTOM_INTENTS = ['WEED_PROBLEM', 'REPORT_SYMPTOM', 'PEST_PRESENCE_VISIBLE', 'DISEASE_LIKE_PATTERN'];
              const NUTRIENT_INTENTS = ['FERTILIZER_SCHEDULE', 'NUTRIENT_DEFICIENCY'];
              
              if (SYMPTOM_INTENTS.includes(bias)) {
                (queryRoute as any).route = 'PEST_DISEASE_TREATMENT';
                queryRoute.confidence = Math.max(queryRoute.confidence, 0.75);
                console.log(`📚 [${traceId}] VOCAB ROUTE OVERRIDE: "${entry.phrase_pattern}" → PEST_DISEASE_TREATMENT (bias: ${bias})`);
              } else if (NUTRIENT_INTENTS.includes(bias)) {
                (queryRoute as any).route = 'FERTILIZER_NUTRITION';
                queryRoute.confidence = Math.max(queryRoute.confidence, 0.75);
                console.log(`📚 [${traceId}] VOCAB ROUTE OVERRIDE: "${entry.phrase_pattern}" → FERTILIZER_NUTRITION (bias: ${bias})`);
              }
              
              if (queryRoute.route !== 'GENERAL_INFO') {
                agentsUsed.push('VOCAB_ROUTE_OVERRIDE');
                break; // First match wins
              }
            }
          }
        } catch (vocabRouteError) {
          console.warn(`⚠️ [${traceId}] Vocab route override failed: ${(vocabRouteError as Error)?.message || String(vocabRouteError)}`);
        }
      }
      
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
        language: options.language || 'mr',
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
      // PHASE 1.2: NEW QUERY DETECTOR (FAIL-OPEN TO NLU)
      // Language-agnostic detection of NEW question vs option selection
      // If farmer types free text that doesn't match any option, treat as NEW query
      // ========================================
      if (pendingOptionsCount > 0) {
        const pendingOptions = options.sessionState?.pendingClarificationOptions || [];
        
        // ========================================
        // STEP 1: Try to match response to pending options (using improved matcher)
        // This is the AUTHORITATIVE check - if it matches, it's an option selection
        // ========================================
        const matchResult = matchFarmerResponseToOption(safeFarmerMessage, pendingOptions);
        
        // ========================================
        // STEP 2: Check for explicit option selection indicators
        // ========================================
        const isNumericOnly = /^[१२३४1-4]$/.test(safeFarmerMessage.trim());
        const hasEmbeddedObsKeys = /\[obs_keys:[^\]]+\]/.test(safeFarmerMessage);
        
        // ========================================
        // STEP 3: FAIL-OPEN LOGIC
        // If message:
        //   - is NOT numeric-only (1-4), AND
        //   - has NO embedded obs_keys, AND
        //   - does NOT match any option (via improved matcher)
        // Then: CLEAR stale clarification and proceed to NLU pipeline
        // ========================================
        const isLikelyNewQuery = !isNumericOnly && 
                                  !hasEmbeddedObsKeys && 
                                  !matchResult.matched && 
                                  safeFarmerMessage.length > 10; // Minimum length for a real question
        
        if (isLikelyNewQuery) {
          console.log('🆕 [NewQueryDetector v2] FREE TEXT detected - clearing stale clarification (FAIL-OPEN)');
          console.log(`   Message preview: "${safeFarmerMessage.slice(0, 50)}..."`);
          console.log(`   Length: ${safeFarmerMessage.length}, Match confidence: ${matchResult.match_confidence}`);
          console.log(`   Clearing ${pendingOptionsCount} pending options to proceed with fresh NLU`);
          
          // CLEAR pending options - this is a NEW query, not an option selection
          pendingOptionsCount = 0;
          if (options.sessionState) {
            options.sessionState.pendingClarificationOptions = undefined;
            options.sessionState.pendingClarificationScope = undefined;
            // Also clear decision state to allow fresh processing
            options.sessionState.decision_state = 'idle';
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
        const matchResult = matchFarmerResponseToOption(safeFarmerMessage, pendingOptions);
        
        // ═══════════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: Extract observation_key from frontend message if embedded
        // Frontend sends: "Label text [obs_keys:OBSERVATION_KEY1,OBSERVATION_KEY2]"
        // ═══════════════════════════════════════════════════════════════════════════
        const obsKeysMatch = safeFarmerMessage.match(/\[obs_keys:([^\]]+)\]/);
        const embeddedObservationKeys = obsKeysMatch ? obsKeysMatch[1].split(',').filter(k => k.trim()) : [];
        
        // ═══════════════════════════════════════════════════════════════════════════
        // FIX #1: Extract cause and rule_id from confirmed diagnosis selection
        // Frontend embeds: "Label [obs_keys:KEY] [cause:Cause Name] [rule_id:RULE_ID]"
        // When present, this allows direct rule loading bypassing generic observation matching
        // ═══════════════════════════════════════════════════════════════════════════
        const causeMatch = safeFarmerMessage.match(/\[cause:([^\]]+)\]/);
        const ruleIdMatch = safeFarmerMessage.match(/\[rule_id:([^\]]+)\]/);
        const confirmedCause = causeMatch ? causeMatch[1].trim() : null;
        const confirmedRuleId = ruleIdMatch ? ruleIdMatch[1].trim() : null;
        if (confirmedCause) {
          console.log(`   🎯 [FIX#1] Confirmed diagnosis: cause="${confirmedCause}", rule_id="${confirmedRuleId}"`);
        }
        
        // PATCH 2: NULL-SAFE - matchResult always returns a valid object now
        if (matchResult.matched && matchResult.matched_option) {
          console.log(`   ✅ Farmer selected option ${(matchResult.option_index || 0) + 1}: "${matchResult.matched_option}"`);
          
          // CRITICAL: Clear pending options and continue with ONLY the selected option
          console.log('   🔓 Clearing clarification lock, processing selected option only');
          
          // CRITICAL FIX: Use embedded observation key if available, else use
          // the per-index canonical key persisted at clarification render time.
          // Heuristic label→code reconstruction is FORBIDDEN — it broke the
          // symbolic identity. Only fall back when both DB-sourced channels
          // are empty.
          let mappedObservationKey: string | null = null;
          const persistedObsKeys = (options.sessionState as any)?.pendingClarificationObservationKeys || [];
          const persistedStructured: Array<{
            label: string;
            value: string;
            observation_key: string;
            observation_id?: string;
            observation_code?: string;
            hypothesis_id?: string;
            hypothesis_condition_id?: string;
            graph_version?: string;
            source?: string;
          }> =
            (options.sessionState as any)?.pendingClarificationOptionsStructured || [];
          const selectedStructuredOption = matchResult.option_index != null
            ? persistedStructured[matchResult.option_index]
            : null;
          if (embeddedObservationKeys.length > 0) {
            mappedObservationKey = embeddedObservationKeys[0];
            console.log(`   📋 Using EMBEDDED ObservationKey: "${mappedObservationKey}"`);
          } else if (
            matchResult.option_index != null &&
            (selectedStructuredOption?.observation_code || selectedStructuredOption?.observation_key)
          ) {
            mappedObservationKey = String(
              selectedStructuredOption?.observation_code || selectedStructuredOption?.observation_key
            ).toUpperCase();
            console.log(
              `   📋 Using STRUCTURED ObservationKey @${matchResult.option_index}: "${mappedObservationKey}" ` +
              `(label="${selectedStructuredOption?.label}", source=${selectedStructuredOption?.source ?? 'legacy'})`
            );
          } else if (matchResult.option_index != null && persistedObsKeys[matchResult.option_index]) {
            mappedObservationKey = String(persistedObsKeys[matchResult.option_index]).toUpperCase();
            console.log(`   📋 Using PERSISTED ObservationKey @${matchResult.option_index}: "${mappedObservationKey}"`);
          } else {
            // Phase I-6: Heuristic label→code mapping is a SYMBOLIC_ID_LEAK.
            // Record it in the EvidenceLedger so it shows up in the trace and
            // emit a structured warning. The mapping is kept ONLY as a legacy
            // safety net until the wire contract is migrated to {option_id}.
            mappedObservationKey = mapOptionToObservation(matchResult.matched_option, pendingScope);
            try {
              requestCtx.ledger.lose(
                'OPTION_SELECTED',
                `observation:${matchResult.matched_option}`,
                { matched_option: matchResult.matched_option, pendingScope },
                'SYMBOLIC_ID_LEAK: heuristic label→code mapping used because ' +
                  'pendingClarificationObservationKeys was empty. Migrate client to ' +
                  'echo option_id (canonical observation_code) instead of label.'
              );
            } catch {/* ledger never throws fatally */}
            console.warn(
              `   ⚠️ [SYMBOLIC_ID_LEAK] heuristic-mapped "${matchResult.matched_option}" → ` +
                `"${mappedObservationKey || 'UNKNOWN'}" (legacy fallback)`
            );
          }
          // ─────────────────────────────────────────────────────────────
          // Phase I-3 — CLARIFICATION confirm on the ObservationLedger.
          // The user's selection is the strongest possible signal for an
          // observation. Append (or confirm) onto the append-only ledger
          // so downstream modules see a single canonical confirmation
          // node carrying source=CLARIFICATION and confidence≥0.9.
          // Non-canonical (leaked label) values are skipped — the
          // EvidenceLedger already recorded the SYMBOLIC_ID_LEAK above.
          // ─────────────────────────────────────────────────────────────
          try {
            const CANON_RE_OPT = /^[A-Z0-9_]+$/;
            if (mappedObservationKey && CANON_RE_OPT.test(mappedObservationKey)) {
              const already = graph.observation_ledger
                .latestByCode()
                .has(mappedObservationKey);
              if (!already) {
                graph.observation_ledger.append({
                  observation_code: mappedObservationKey,
                  source: 'CLARIFICATION',
                  confidence: 0.95,
                  actor: 'orchestrator:OPTION_SELECTED',
                });
              }
              graph.observation_ledger.confirm(
                mappedObservationKey,
                'orchestrator:OPTION_SELECTED'
              );
              console.log(
                `[SSOT_TRACE][${traceId}] OPTION_SELECTED ledger.confirm ` +
                  `code=${mappedObservationKey} ledger_size=${graph.observation_ledger.size()}`
              );
            }
          } catch (e) {
            if (e instanceof SymbolicIdLeakError) {
              console.error(`🚨 ${e.name}: ${e.message}`);
            } else {
              console.warn(
                `⚠️ [OPTION_SELECTED_LEDGER] non-fatal: ${e instanceof Error ? e.message : String(e)}`
              );
            }
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
          
          // ─────────────────────────────────────────────────────────────
          // Phase H — LAND-FIRST priority. CanonicalContext (land-derived)
          // is authoritative. lockedCropContext is a wire-compat artifact
          // and only used when land is unavailable. Old order
          // (strategy > locked > land) caused crop/stage divergence
          // between turns documented in the audit.
          // ─────────────────────────────────────────────────────────────
          const lockedStageFromStrategy = getLockedStage();
          const canonicalCropForOption = graph.canonical_context?.crop_code;
          const canonicalStageForOption = graph.canonical_context?.growth_stage;
          const cropName =
            canonicalCropForOption ||
            landContextForOptionSelection?.current_crop ||
            lockedStageFromStrategy?.crop_code ||
            lockedCropContext?.crop_name ||
            'UNKNOWN';

          const growthStage =
            canonicalStageForOption ||
            landContextForOptionSelection?.growth_stage ||
            lockedStageFromStrategy?.growth_stage ||
            lockedCropContext?.growth_stage ||
            'VEGETATIVE';
          const hasAuthorativeStage = !!(
            canonicalStageForOption ||
            landContextForOptionSelection?.growth_stage ||
            lockedStageFromStrategy?.growth_stage ||
            lockedCropContext?.growth_stage
          );
          const stageSource = canonicalStageForOption ? 'CANONICAL_LAND'
            : landContextForOptionSelection?.growth_stage ? 'LAND_CONTEXT'
            : lockedStageFromStrategy?.growth_stage ? 'LOCKED_STRATEGY'
            : lockedCropContext?.growth_stage ? 'LOCKED_CONTEXT'
            : 'DEFAULT';
          // SSOT trace: detect any divergence between authorities for visibility.
          if (
            lockedCropContext?.crop_name &&
            canonicalCropForOption &&
            lockedCropContext.crop_name.toUpperCase() !== canonicalCropForOption.toUpperCase()
          ) {
            console.warn(
              `[SSOT_TRACE][${traceId}] OPTION_SELECTED crop divergence ignored: ` +
                `canonical=${canonicalCropForOption} session.locked=${lockedCropContext.crop_name} → using canonical`
            );
            try {
              requestCtx.ledger.ignore(
                'OPTION_SELECTED',
                `crop_divergence:${lockedCropContext.crop_name}`,
                'land-SSOT: lockedCropContext overridden by canonical'
              );
            } catch {/* non-fatal */}
          }
          
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
          // v5.0: Tag clarification selection as CONFIRMED, expansions as INFERRED
          const allObservations: string[] = [];
          
          // The selected observation key is CONFIRMED (farmer explicitly chose it)
          if (mappedObservationKey) {
            allObservations.push(mappedObservationKey);
            console.log(`   ✅ [ObservationAuthority] ${mappedObservationKey} tagged as CONFIRMED (clarification selection)`);
          }
          if (visualSymptom && visualSymptom !== 'UNKNOWN' && visualSymptom !== mappedObservationKey) {
            allObservations.push(visualSymptom);
          }
          
          // ═══════════════════════════════════════════════════════════════════════════
          // FIX #3: OBSERVATION KEY EXPANSION - DB-DRIVEN via observation_aliases
          // Replaces hardcoded obsKeyExpansion dictionary with expandObservationVocabularyViaAliases()
          // v5.1: All expansion now comes from observation_aliases table
          // ═══════════════════════════════════════════════════════════════════════════
          
          // FIX #1: If cause was confirmed, add cause-specific observations from the confirmed rule
          if (confirmedRuleId && confirmedRuleId !== 'UNKNOWN_FALLBACK' && confirmedRuleId !== 'PHOTO_FALLBACK') {
            try {
              const { data: confirmedRule } = await this.supabase
                .from('decision_rules')
                .select('observable_characteristics, conditions_json')
                .eq('rule_id', confirmedRuleId)
                .eq('is_active', true)
                .single();
              
              if (confirmedRule) {
                // Add ALL observable characteristics from the confirmed rule
                const ruleObs = confirmedRule.observable_characteristics || [];
                if (Array.isArray(ruleObs)) {
                  for (const obs of ruleObs) {
                    const obsKey = typeof obs === 'string' ? obs : obs?.observation_key;
                    if (obsKey && !allObservations.includes(obsKey.toUpperCase())) {
                      allObservations.push(obsKey.toUpperCase());
                    }
                  }
                }
                // Also add observations from conditions_json
                const condObs = confirmedRule.conditions_json?.observations || [];
                for (const obs of condObs) {
                  if (typeof obs === 'string' && !allObservations.includes(obs.toUpperCase())) {
                    allObservations.push(obs.toUpperCase());
                  }
                }
                console.log(`   🎯 [FIX#1] Loaded ${allObservations.length} observations from confirmed rule ${confirmedRuleId}`);
              }
            } catch (e) {
              console.warn(`   ⚠️ [FIX#1] Failed to load confirmed rule ${confirmedRuleId}: ${e}`);
            }
          }
          
          // FIX #3: DB-driven alias expansion (replaces hardcoded dictionary)
          try {
            const aliasResult = await expandObservationVocabularyViaAliases(allObservations, this.supabase);
            if (aliasResult.expanded_codes.length > allObservations.length) {
              const newCodes = aliasResult.expanded_codes.filter(c => !allObservations.includes(c));
              allObservations.push(...newCodes);
              console.log(`   🔍 [ObservationExpansion] DB alias expansion: +${newCodes.length} codes [${newCodes.join(', ')}]`);
              if (aliasResult.trace.length > 0) {
                console.log(`      Trace: ${aliasResult.trace.slice(0, 5).join(', ')}${aliasResult.trace.length > 5 ? '...' : ''}`);
              }
            }
          } catch (e) {
            console.warn(`   ⚠️ [ObservationExpansion] DB alias expansion failed, using static fallback: ${e}`);
            // Minimal static fallback for critical paths only
            const criticalFallback: Record<string, string[]> = {
              'DEAD_HEART': ['DEAD_HEART_PRESENT', 'BORER_DAMAGE', 'SHOOT_BORER_DAMAGE'],
              'DEAD_HEART_PRESENT': ['DEAD_HEART', 'BORER_DAMAGE'],
              'BORER_DAMAGE': ['DEAD_HEART', 'TUNNELS_IN_STEM', 'BORER_HOLES'],
              'INSECTS_VISIBLE': ['PEST_DAMAGE', 'INSECT_PRESENCE_CONFIRMED'],
              'PEST_CHECK': ['PEST_DAMAGE', 'INSECT_PRESENT', 'BORER_DAMAGE'],
              'NUTRIENT_CHECK': ['NUTRIENT_DEFICIENCY', 'LEAF_YELLOWING', 'CHLOROSIS'],
              'WATER_STRESS_CHECK': ['WATER_STRESS', 'WILTING', 'LEAF_CURLING'],
            };
            if (mappedObservationKey && criticalFallback[mappedObservationKey]) {
              const fallbackCodes = criticalFallback[mappedObservationKey].filter(c => !allObservations.includes(c));
              allObservations.push(...fallbackCodes);
              console.log(`   🔍 [ObservationExpansion] Static fallback: +${fallbackCodes.length} codes`);
            }
          }
          console.log(`   🔍 [ObservationExpansion] Final observations for rule matching: [${allObservations.join(', ')}]`);

          // ═══════════════════════════════════════════════════════════════════
          // MANDATORY GRAPH CONTRACT: confirmed observation must traverse
          // Observation → Hypothesis before any rule or fallback branch.
          // ═══════════════════════════════════════════════════════════════════
          const optionEvidence = classifyEvidence(allObservations);
          const optionGraphResolution = await resolveHypothesesFromObservations({
            supabase: this.supabase,
            observations: optionEvidence.real_codes,
            crop_context: {
              crop_code: cropName,
              crop_group: cropName,
              growth_stage: growthStage,
              das: landContextForOptionSelection?.days_since_sowing ?? null,
            },
            trace_id: traceId,
          });
          const optionGraphRuleIds = Array.from(new Set(
            optionGraphResolution.hypotheses.flatMap((h) => h.candidate_rule_ids || []).filter(Boolean),
          ));
          console.log(
            `[EVIDENCE_COUNT_TRACE] confirmed_observations=${allObservations.length} ` +
            `real_observations=${optionEvidence.real_symptom_count} ` +
            `ignored_context_symbols=${optionEvidence.ignored_metadata_count} ` +
            `candidate_hypotheses=${optionGraphResolution.hypotheses.length} ` +
            `matched_rules=${optionGraphRuleIds.length}`,
          );

          if (optionEvidence.real_symptom_count > 0 && optionGraphResolution.hypotheses.length === 0) {
            const graphClarification = await buildHypothesisClarificationOptions({
              supabase: this.supabase,
              intent_code: (options.sessionState as any)?.last_intent || 'CLARIFICATION_REPLY',
              crop_code: cropName,
              crop_stage: growthStage,
              DAS: landContextForOptionSelection?.days_since_sowing ?? null,
              language: options.language || 'mr',
              confirmed_observations: optionEvidence.real_codes,
              trace_id: traceId,
              max: 5,
            });
            const clarificationOptions = graphClarification.options.map((o) => ({
              label: o.label,
              value: o.value,
              observation_key: o.observation_key,
              observation_id: o.observation_id,
              observation_code: o.observation_code,
              hypothesis_id: o.hypothesis_id,
              hypothesis_condition_id: o.hypothesis_condition_id,
              graph_version: 'hypothesis_graph_v1',
              source: 'hypothesis_graph',
            }));
            console.error(
              `[GRAPH_CONTRACT_ERROR] trace=${traceId} confirmed_observations=${allObservations.length} ` +
              `real_observations=${optionEvidence.real_symptom_count} ` +
              `candidate_hypotheses=0 graph_gap=${graphClarification.graph_gap ?? 'NO_HYPOTHESIS_EDGE'} ` +
              `clarification_source=hypothesis_graph options=${clarificationOptions.length}`,
            );
            return {
              type: 'CLARIFICATION_QUESTION',
              session_id: sessionId,
              question: {
                question_id: `graph_gap_${Date.now()}`,
                text_en: 'Please select one more visible observation from the crop so I can complete the graph diagnosis.',
                options: clarificationOptions,
                scope: 'GRAPH_KNOWLEDGE_GAP',
                source: 'hypothesis_graph',
              },
              communication: { options: clarificationOptions },
              metadata: {
                orchestrator_type: 'CLARIFICATION_QUESTION',
                observation_source: 'hypothesis_graph',
                graph_reason: graphClarification.graph_gap ?? 'GRAPH_NEEDS_DISAMBIGUATION',
                real_observations: optionEvidence.real_codes,
                ignored_context_symbols: optionEvidence.ignored_codes,
                trace_id: traceId,
                selectionType: 'SINGLE_CHOICE',
                session_state_update: {
                  decision_state: 'awaiting_clarification',
                  pending_options: clarificationOptions.length,
                  pending_action: false,
                },
              },
            } as any;
          }

          if (optionGraphResolution.hypotheses.length > 0 && optionGraphRuleIds.length === 0) {
            const graphClarification = await buildHypothesisClarificationOptions({
              supabase: this.supabase,
              intent_code: (options.sessionState as any)?.last_intent || 'CLARIFICATION_REPLY',
              crop_code: cropName,
              crop_stage: growthStage,
              DAS: landContextForOptionSelection?.days_since_sowing ?? null,
              language: options.language || 'mr',
              confirmed_observations: optionEvidence.real_codes,
              trace_id: traceId,
              max: 5,
            });
            const clarificationOptions = graphClarification.options.map((o) => ({
              label: o.label,
              value: o.value,
              observation_key: o.observation_key,
              observation_id: o.observation_id,
              observation_code: o.observation_code,
              hypothesis_id: o.hypothesis_id,
              hypothesis_condition_id: o.hypothesis_condition_id,
              graph_version: 'hypothesis_graph_v1',
              source: 'hypothesis_graph',
            }));
            console.error(
              `[GRAPH_CONTRACT_ERROR] trace=${traceId} candidate_hypotheses=${optionGraphResolution.hypotheses.length} ` +
              `matched_rules=0 reason=NO_HYPOTHESIS_RULE_EDGE options=${clarificationOptions.length}`,
            );
            return {
              type: 'CLARIFICATION_QUESTION',
              session_id: sessionId,
              question: {
                question_id: `hyp_rule_gap_${Date.now()}`,
                text_en: 'I need one more crop observation before I can choose a safe recommendation.',
                options: clarificationOptions,
                scope: 'GRAPH_KNOWLEDGE_GAP',
                source: 'hypothesis_graph',
              },
              communication: { options: clarificationOptions },
              metadata: {
                orchestrator_type: 'CLARIFICATION_QUESTION',
                observation_source: 'hypothesis_graph',
                graph_reason: 'NO_HYPOTHESIS_RULE_EDGE',
                trace_id: traceId,
                selectionType: 'SINGLE_CHOICE',
                session_state_update: {
                  decision_state: 'awaiting_clarification',
                  pending_options: clarificationOptions.length,
                  pending_action: false,
                },
              },
            } as any;
          }
          
          const canonicalState = buildCanonicalState({
            // CRITICAL FIX: Pass landContext to preserve all land data
            landContext: landContextForOptionSelection,
            // Override with clarification-resolved values
            cropName: cropName,
            cropStage: growthStage,
            daysAfterSowing: landContextForOptionSelection?.days_since_sowing ?? null,
            // Farmer observations - INCLUDE BOTH symptom and observation_key
            farmerObservations: allObservations.length > 0 ? allObservations : [],
            // NDVI data from landContext
            ndviData: landContextForOptionSelection?.ndvi ? {
              value: landContextForOptionSelection.ndvi.value || landContextForOptionSelection.ndvi.mean_ndvi,
              trend: landContextForOptionSelection.ndvi.ndvi_trend,
              captured_at: landContextForOptionSelection.ndvi.captured_at
            } : undefined,
            // Soil data from landContext
            soilData: landContextForOptionSelection?.soil_health
          });
          
          console.log(`   📊 Canonical state built with full landContext, running layered rule evaluation...`);
          console.log(`      DAS: ${canonicalState.days_after_sowing_exact}, NDVI: ${canonicalState.ndvi_value}`);
          console.log(`      Soil N: ${canonicalState.soil_nitrogen}`);
          
          console.log(`   📊 Canonical state built, running layered rule evaluation...`);
          
          // Use unified crop code normalizer for consistent rule filtering
          const cropCodeForRules = unifiedNormalizeCropCode(cropName).toLowerCase();
          let allRulesForOption = await getAllRulesWithBundled(cropCodeForRules);
          if (optionGraphRuleIds.length > 0) {
            const beforeGraphScope = allRulesForOption.length;
            const graphRuleIdSet = new Set(optionGraphRuleIds.map(String));
            allRulesForOption = allRulesForOption.filter((r: any) => graphRuleIdSet.has(String(r.rule_id)));
            console.log(
              `   🧭 [OPTION_GRAPH_SCOPE] rules ${beforeGraphScope} → ${allRulesForOption.length} ` +
              `from hypothesis_rule_mapping=${optionGraphRuleIds.length}`,
            );
          }
          console.log(`   📦 Total rules for option selection: ${allRulesForOption.length} (crop=${cropCodeForRules})`);
          
          // Pass user_query AND visual_symptoms for rule matching
          // CRITICAL: visual_symptoms array is what evaluateConditionsJson checks!
          // Phase Z FIX (H4): also propagate `confirmed_observations` so the
          // bundled-rule evaluator (layered-rule-evaluator.ts:1439-1452) and
          // the hypothesis evaluator both see the farmer-confirmed symbol set.
          // Without this the bundle path silently fell back to visual_symptom
          // = 'UNKNOWN' and hard-failed every conditions_json.observations[] check.
          const stateWithQuery = { 
            ...canonicalState, 
            user_query: farmerMessage,
            visual_symptoms: optionEvidence.real_codes,
            confirmed_observations: optionEvidence.real_codes,
            known_observations: optionEvidence.real_codes,
            primary_symptom: visualSymptom !== 'UNKNOWN' ? visualSymptom : mappedObservationKey
          };
          console.log(
            `   🔎 [SELECTION_TRACE] resolved_key=${stateWithQuery.primary_symptom} ` +
            `visual_symptoms=${(stateWithQuery.visual_symptoms || []).length} ` +
            `confirmed=${(stateWithQuery.confirmed_observations || []).length} ` +
            `crop=${(canonicalState as any).crop_code || (canonicalState as any).crop} ` +
            `stage=${(canonicalState as any).growth_stage || (canonicalState as any).crop_stage}`
          );
          const ruleResult = evaluateRulesLayered(allRulesForOption, stateWithQuery as any);
          
          console.log(`   ✅ Rules matched: ${ruleResult.rules_matched}, Applied: ${ruleResult.rules_applied.length}`);
          console.log(`   📋 Diagnoses: ${ruleResult.diagnoses.length}, Prescriptions: ${ruleResult.prescriptions.length}, Responses: ${ruleResult.matched_responses?.length || 0}`);
          
          // CRITICAL FIX: Check for matched_responses even when prescriptions are empty
          const hasMatchedResponses = ruleResult.matched_responses && ruleResult.matched_responses.length > 0;

          // ═══════════════════════════════════════════════════════════════════════════
          // PHASE H — Emit canonical ConversationState on OPTION_SELECTED short-circuit
          // so the [CONVERSATION_STATE] + [BRAIN_TRACE] invariants are observable on
          // every execution path (not only the main pipeline at line ~3804).
          // ═══════════════════════════════════════════════════════════════════════════
          try {
            const optionStateInferred = (ruleResult.diagnoses || [])
              .map((d: any) => d?.diagnosis_code || d?.code)
              .filter(Boolean);
            const optionConvState = buildConversationState({
              trace_id: traceId,
              intent: 'CLARIFICATION_REPLY',
              intent_confidence: 1,
              advisory_intent: false,
              confirmed: allObservations,
              inferred: optionStateInferred,
              hypotheses: (ruleResult.diagnoses || []).map((d: any) => d?.rule_id).filter(Boolean),
              stage: growthStage,
              stage_source: stageSource,
              crop: cropName,
              das: landContextForOptionSelection?.days_since_sowing ?? null,
              semantic_status: 'SKIPPED',
              authority_status: authorityDecision.authority_status,
            });
            console.log(`   🧊 [CONVERSATION_STATE] frozen mode=${optionConvState.mode} clarify=${optionConvState.clarification_required}(${optionConvState.clarification_reason}) coverage=${optionConvState.coverage.toFixed(2)} confirmed=${optionConvState.confirmed.length} unknown=${optionConvState.unknown.length} (path=OPTION_SELECTED)`);
            console.log(
              `[OPTION_STATE_TRACE] trace=${traceId} total_ms=${Date.now() - startTime} ` +
              `hyp=${optionConvState.hypotheses.length} confirmed=${optionConvState.confirmed.length}`,
            );
          } catch (e) {
            console.warn(`   ⚠️ [CONVERSATION_STATE] OPTION_SELECTED emit failed: ${e instanceof Error ? e.message : e}`);
          }

          
          // ═══════════════════════════════════════════════════════════════════
          // CLARIFICATION-FIRST: DECISION GATE ALIGNMENT
          // If clarification completed + rules fire → MUST return recommendation
          // SESSION STATE IS AUTHORITATIVE - clarification just answered
          // ═══════════════════════════════════════════════════════════════════
          
          const decisionGateCheck = checkDecisionGateAlignment({
            clarification_completed: true, // We just processed a clarification selection
            rules_fired: ruleResult.rules_matched,
            has_recommendations: ruleResult.prescriptions.length > 0 || hasMatchedResponses,
            authority_blocked: !authorityDecision.treatments_allowed,
            // CRITICAL: Pass session state for authoritative clarification status
            session_decision_state: 'decision_in_progress', // Clarification just answered = not awaiting
            clarification_answer_received: true
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
            
            // ═══════════════════════════════════════════════════════════════════════════
            // FORENSIC AUDIT FIX v8.0: Build actions from prescriptions > matched_responses > primary_decision
            // Previously, when both prescriptions and matched_responses were empty but primary_decision
            // existed (pest rules routed to DIAGNOSIS phase), actionsToReturn was [] causing Actions=0 bug.
            // ═══════════════════════════════════════════════════════════════════════════
            let actionsToReturn: any[] = [];
            
            if (safePrescriptions.length > 0) {
              actionsToReturn = safePrescriptions.filter(p => p != null).map(p => ({
                action_type: p.action_type || 'RECOMMEND',
                action_details: p.action_details || {},
                product_reference: p.product_reference,
                rule_id: 'RULE_ENGINE'
              }));
            } else if (safeMatchedResponses.length > 0) {
              actionsToReturn = safeMatchedResponses.slice(0, 3).filter(r => r != null).map(r => ({
                action_type: 'OBSERVATION_ADVICE',
                action_details: {
                  action_text: r.action_text,
                  reason_text: r.reason_text,
                  knowledge_text: r.knowledge_text
                },
                product_reference: r.rule_id,
                rule_id: r.rule_id
              }));
            } else if (ruleResult.primary_decision && ruleResult.primary_decision.rule_id) {
              // FORENSIC FIX: Extract action from primary_decision when formal arrays are empty
              const pd = ruleResult.primary_decision;
              console.log(`   🔧 [FORENSIC FIX] Building action from primary_decision: ${pd.rule_id} (${pd.action_type})`);
              actionsToReturn = [{
                action_type: pd.action_type || 'RECOMMEND',
                action_details: {
                  action_text: pd.action_text,
                  reason_text: pd.reason_text,
                  knowledge_text: pd.knowledge_text,
                  active_ingredient: pd.active_ingredient,
                  dosage_per_acre: pd.dosage_per_acre,
                  application_method: pd.application_method,
                  i18n_key: pd.i18n_key,
                },
                product_reference: pd.rule_id,
                rule_id: pd.rule_id
              }];
            }
            
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
                  product_name: layeredPrimaryDecision.active_ingredient || (layeredPrimaryDecision.action_text?.split(' ').slice(1, 3).join(' ')) || 'IPM',
                  product_type: 'IPM',
                  action_text: layeredPrimaryDecision.action_text,
                  reason_text: layeredPrimaryDecision.reason_text,
                  knowledge_text: layeredPrimaryDecision.knowledge_text,
                  i18n_key: layeredPrimaryDecision.i18n_key,
                  rule_id: layeredPrimaryDecision.rule_id,
                  // PRODUCTION FIX: Propagate ALL rich agronomic fields for deterministic builder
                  active_ingredient: layeredPrimaryDecision.active_ingredient || null,
                  dosage_per_acre: layeredPrimaryDecision.dosage_per_acre || null,
                  cause: layeredPrimaryDecision.cause || null,
                  organic_alternative: layeredPrimaryDecision.organic_alternative || null,
                  phi_days: layeredPrimaryDecision.phi_days || null,
                  bee_toxicity: layeredPrimaryDecision.bee_toxicity || null,
                  application_method: layeredPrimaryDecision.application_method || null,
                  water_volume_per_acre: layeredPrimaryDecision.water_volume_per_acre || null,
                  mode_of_action: layeredPrimaryDecision.mode_of_action || null,
                  chemical_class: layeredPrimaryDecision.chemical_class || null,
                  resistance_group: layeredPrimaryDecision.resistance_group || null,
                  target_pest_stage: layeredPrimaryDecision.target_pest_stage || null,
                  treatment_type: layeredPrimaryDecision.treatment_type || null,
                  biological_group: layeredPrimaryDecision.biological_group || null,
                  success_indicators: layeredPrimaryDecision.success_indicators || null,
                  failure_indicators: layeredPrimaryDecision.failure_indicators || null,
                  roi_yield_gain_pct: layeredPrimaryDecision.roi_yield_gain_pct || null,
                  reentry_interval_hours: layeredPrimaryDecision.reentry_interval_hours || null,
                  aquatic_toxicity: layeredPrimaryDecision.aquatic_toxicity || null,
                  farmer_safety_level: layeredPrimaryDecision.farmer_safety_level || null,
                  regulatory_status: layeredPrimaryDecision.regulatory_status || null,
                  ipm_level: layeredPrimaryDecision.ipm_level || null,
                  material_cost_per_acre_min: layeredPrimaryDecision.material_cost_per_acre_min || null,
                  material_cost_per_acre_max: layeredPrimaryDecision.material_cost_per_acre_max || null,
                  labor_cost_per_acre_min: layeredPrimaryDecision.labor_cost_per_acre_min || null,
                  labor_cost_per_acre_max: layeredPrimaryDecision.labor_cost_per_acre_max || null,
                  labor_hours_per_acre: layeredPrimaryDecision.labor_hours_per_acre || null,
                  equipment_required: layeredPrimaryDecision.equipment_required || null,
                  equipment_cost_per_acre: layeredPrimaryDecision.equipment_cost_per_acre || null,
                  total_cost_estimated: layeredPrimaryDecision.total_cost_estimated || null,
                  roi_cost_saved_min: layeredPrimaryDecision.roi_cost_saved_min || null,
                  roi_cost_saved_max: layeredPrimaryDecision.roi_cost_saved_max || null,
                  roi_net_score: layeredPrimaryDecision.roi_net_score || null,
                  roi_confidence: layeredPrimaryDecision.roi_confidence || null,
                  min_temperature: layeredPrimaryDecision.min_temperature || null,
                  max_temperature: layeredPrimaryDecision.max_temperature || null,
                  max_wind_speed: layeredPrimaryDecision.max_wind_speed || null,
                  rain_delay_hours: layeredPrimaryDecision.rain_delay_hours || null,
                  weather_dependency: layeredPrimaryDecision.weather_dependency || null,
                  scientific_source: layeredPrimaryDecision.scientific_source || null,
                  scientific_basis: layeredPrimaryDecision.scientific_basis || null,
                  icar_package_ref: layeredPrimaryDecision.icar_package_ref || null,
                  university_source: layeredPrimaryDecision.university_source || null,
                  risk_level: layeredPrimaryDecision.risk_level || null,
                  response_severity: layeredPrimaryDecision.response_severity || null,
                  data_authority_rank: layeredPrimaryDecision.data_authority_rank || null,
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
                    product_name: (firstMatch as any).active_ingredient || (firstMatch.action_text?.split(' ').slice(1, 3).join(' ')) || 'IPM',
                    product_type: 'IPM',
                    action_text: firstMatch.action_text,
                    reason_text: firstMatch.reason_text,
                    knowledge_text: firstMatch.knowledge_text,
                    i18n_key: firstMatch.i18n_key,
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
            
            // ═══════════════════════════════════════════════════════════════════════════
            // CRITICAL FIX: SESSION STATE TRANSITION - Decision state MUST be updated
            // This signals to index.ts that clarification is COMPLETE
            // ═══════════════════════════════════════════════════════════════════════════
            const sessionStateUpdate = {
              decision_state: 'decision_in_progress',  // NOT 'awaiting_clarification'
              pending_options: 0,
              pending_action: false,
              last_action_source: 'FARMER_SELECTION',
              clarification_answered: true,
              clarification_resolved_at: new Date().toISOString()
            };
            
            // MANDATORY LOGGING: Track decision state transition
            console.log(`\n🔄 [SESSION_STATE] ═══ DECISION STATE TRANSITION ═══`);
            console.log(`   session_decision_state: ${sessionStateUpdate.decision_state}`);
            console.log(`   clarification_active: false (answered)`);
            console.log(`   option_selected: "${matchResult.matched_option}"`);
            console.log(`   unified_gate_mode: ALLOW (clarification resolved)`);
            console.log(`   ═══════════════════════════════════════════════`);
            
            return {
              type: 'DECISION_PROVIDED',
              session_id: sessionId,
              // ═══════════════════════════════════════════════════════════════════════════
              // CRITICAL: session_state_update tells index.ts to transition decision_state
              // ═══════════════════════════════════════════════════════════════════════════
              session_state_update: sessionStateUpdate,
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
                  agents_used: [...agentsUsed, 'OPTION_SELECTION_HANDLER', 'OBSERVATION_HYPOTHESIS_RESOLVER', 'LAYERED_RULE_EVALUATOR'],
                  rules_applied: ruleResult.rules_applied,
                  clarification_resolved: true,
                  selected_option: matchResult.matched_option,
                  mapped_observation: mappedObservationKey,
                  selected_graph_node: selectedStructuredOption ? {
                    observation_id: selectedStructuredOption.observation_id,
                    observation_code: selectedStructuredOption.observation_code,
                    hypothesis_id: selectedStructuredOption.hypothesis_id,
                    hypothesis_condition_id: selectedStructuredOption.hypothesis_condition_id,
                    source: selectedStructuredOption.source,
                  } : undefined,
                  candidate_hypotheses: optionGraphResolution.hypotheses.length,
                  graph_rule_ids: optionGraphRuleIds,
                  prescription_allowed: ruleResult.prescription_allowed,
                  prescription_gate_reason: ruleResult.prescription_gate_reason,
                  // FIX: Include locked crop context in metadata
                  lockedCropContext: finalLockedCropContext,
                  // SESSION STATE: Signal to index.ts
                  session_state_update: sessionStateUpdate
                }
              } as any,
              // FIX: Include dataAudit to preserve land context
              dataAudit: dataAuditForOption,
              metadata: {
                confidence: ruleResult.confidence_in_result,
                safety_status: ruleResult.safety_blocks.length > 0 ? 'BLOCKED' : 'SAFE',
                rules_applied: ruleResult.rules_matched,
                processing_time_ms: Date.now() - startTime,
                agents_used: [...agentsUsed, 'OPTION_SELECTION_HANDLER', 'OBSERVATION_HYPOTHESIS_RESOLVER', 'LAYERED_RULE_EVALUATOR'],
                trace_id: traceId,
                candidate_hypotheses: optionGraphResolution.hypotheses.length,
                graph_rule_ids: optionGraphRuleIds,
                selected_graph_node: selectedStructuredOption ? {
                  observation_id: selectedStructuredOption.observation_id,
                  observation_code: selectedStructuredOption.observation_code,
                  hypothesis_id: selectedStructuredOption.hypothesis_id,
                  hypothesis_condition_id: selectedStructuredOption.hypothesis_condition_id,
                  source: selectedStructuredOption.source,
                } : undefined,
                // CRITICAL: Clear pending options after successful selection
                pendingClarificationOptions: undefined,
                pendingClarificationScope: undefined,
                // PATCH 3: Preserve locked crop context for next turn
                lockedCropContext: finalLockedCropContext,
                // SESSION STATE: Signal to index.ts
                session_state_update: sessionStateUpdate
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
          
          // SESSION STATE: Stage fallback still transitions decision state
          const sessionStateUpdateNoRules = {
            decision_state: 'decision_in_progress',
            pending_options: 0,
            pending_action: false,
            last_action_source: 'FARMER_SELECTION_STAGE_FALLBACK',
            clarification_answered: true,
            clarification_resolved_at: new Date().toISOString()
          };
          
          console.log(`\n🔄 [SESSION_STATE] ═══ DECISION STATE TRANSITION (Stage Fallback) ═══`);
          console.log(`   session_decision_state: ${sessionStateUpdateNoRules.decision_state}`);
          console.log(`   clarification_active: false (answered with stage fallback)`);
          console.log(`   option_selected: "${matchResult.matched_option}"`);
          console.log(`   ═══════════════════════════════════════════════`);
          
          return {
            type: 'DECISION_PROVIDED',
            session_id: sessionId,
            session_state_update: sessionStateUpdateNoRules,
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
                lockedCropContext: finalLockedCropContextNoRules,
                session_state_update: sessionStateUpdateNoRules
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
              lockedCropContext: finalLockedCropContextNoRules,
              session_state_update: sessionStateUpdateNoRules
            }
          };
        } else {
          // PHASE-9.1-FIX: Farmer did NOT select a valid option - RETURN REMINDER IMMEDIATELY
          // DO NOT continue to NLU pipeline - this is the HARD GATE
          console.log('⚠️ [ClarificationGate] No valid option selected — returning reminder (NLU BLOCKED)');
          
          // REFACTORED: Use i18n_key instead of hardcoded language text
          // The narration layer will resolve the actual display text
          
          // PHASE-9.1-FIX: HARD RETURN - Return clarification reminder and STOP
          // This is the CRITICAL gate that prevents NLU from running
          console.log(`[CLARIFY_EXIT] site=EXIT_01_OPTION_SELECTED trace=${(typeof traceId!=='undefined'?traceId:'?')} intent=${(typeof intentCode!=='undefined'?intentCode:'?')} crop=${(landContext?.current_crop) ?? '?'} stage=${(canonicalContext?.growth_stage) ?? '?'}`);
          return {
            type: 'CLARIFICATION_QUESTION',
            session_id: sessionId,
            question: {
              question_id: `clarification_reminder_${Date.now()}`,
              // SYMBOLIC: i18n_key for narration layer to resolve
              i18n_key: 'clarification.select_option_reminder',
              // Options are passed through for narration layer to render
              options: pendingOptions.map((opt, idx) => ({
                value: String(idx + 1),
                label: opt, // These are already localized observation descriptions
                option_code: `OPTION_${idx + 1}`
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
              clarification_reminder: true,
              i18n_driven: true
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
      const isNumberSelection = /^[१२३४1-4]$/.test(safeFarmerMessage.trim());
      
      console.log(`   📋 Input: "${safePreviewText(safeFarmerMessage)}" | IsNumber: ${isNumberSelection} | Fresh query mode`);
      console.log(`   🔐 LockedCropContext: ${lockedCropContext ? lockedCropContext.crop_name : 'none (will derive from land context)'}`);
      
      let processedFarmerMessage = safeFarmerMessage;
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
      
      // FIX 8: Canonical language enforcement — options.language (from app) is SSOT
      const canonicalLang = options.language || 'mr';
      if (normalizedInput.detected_language !== canonicalLang) {
        console.warn(`   ⚠️ [FIX8] Language mismatch: normalizer=${normalizedInput.detected_language}, canonical=${canonicalLang} → using canonical`);
        normalizedInput.detected_language = canonicalLang;
      }
      
      console.log(`      Original: "${safePreviewText(normalizedInput.original_text)}"...`);
      console.log(`      Normalized: "${safePreviewText(normalizedInput.normalized_text)}"...`);
      console.log(`      Language: ${normalizedInput.detected_language} (canonical=${canonicalLang}), Removed: ${normalizedInput.removed_elements.length} elements`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // STAGE 1.5: UNIVERSAL SEMANTIC EXTRACTION (Phase 21 - LLM-Based)
      // Uses LLM to extract semantic meaning in ANY language → plain English
      // Then deterministic mapper converts English → ObservationKeys
      // ═══════════════════════════════════════════════════════════════════════════
      console.log(`\n   🔮 Stage 1.5: Universal Semantic Extractor (v${SEMANTIC_EXTRACTOR_VERSION})...`);
      
      // STABILIZATION v4.0 ISSUE 8: Crop Vocabulary Prompt Enrichment
      // Fetch crop-specific vocabulary for LLM prompt enrichment (cached, 5-min TTL)
      let cropVocabularyBlock = '';
      try {
        // Load crop-specific vocabulary
        const cropSpecificEntries = (canonicalContext?.crop_code && canonicalContext.crop_code !== 'UNKNOWN')
          ? await getCropVocabulary(canonicalContext.crop_code, this.supabase)
          : [];
        // Always load universal vocabulary (crop_code='ALL') for cross-crop terms
        const universalEntries = await getCropVocabulary('ALL', this.supabase);
        const allEntries = [...cropSpecificEntries, ...universalEntries];
        
        if (allEntries.length > 0) {
          cropVocabularyBlock = buildVocabularyPromptBlock(
            canonicalContext?.crop_code || 'ALL',
            allEntries
          );
          console.log(`      📚 Loaded ${allEntries.length} vocabulary entries (${cropSpecificEntries.length} crop-specific + ${universalEntries.length} universal)`);
        }
      } catch (vocabError) {
        console.warn(`      ⚠️ Crop vocabulary load failed: ${(vocabError as Error)?.message || String(vocabError)}`);
      }
      
      // STEP 1: LLM extracts semantic meaning (any language → English)
      // v3.0.0: Pass land context so LLM can interpret romanized regional language
      const intentLandContext = landContext ? {
        current_crop: landContext.current_crop,
        growth_stage: landContext.growth_stage,
        days_since_sowing: landContext.days_since_sowing,
        ndvi_value: landContext.ndvi_value,
        soil_type: landContext.soil_type,
        // STABILIZATION v4.0: Inject crop vocabulary for romanized input enrichment
        crop_vocabulary_hint: cropVocabularyBlock || undefined
      } : (cropVocabularyBlock ? { crop_vocabulary_hint: cropVocabularyBlock } as any : undefined);
      
      const semanticExtraction: SemanticExtraction = await extractSemanticMeaning(
        processedFarmerMessage, 
        normalizedInput.detected_language,
        intentLandContext
      );
      agentsUsed.push('SEMANTIC_EXTRACTOR');
      
      // STEP 2: Deterministic mapper converts English → ObservationKeys
      const mappedCodes: MappedObservationCodes = mapToObservationCodes(semanticExtraction);
      agentsUsed.push('OBSERVATION_CODE_MAPPER');

      // STEP 2b: Vocabulary bridge expansion (generic ↔ specific)
      // Adds canonical codes for any aliases and also adds aliases for any canonical codes.
      let expandedObservationCodes: string[] = (mappedCodes?.observation_codes || []) as unknown as string[];
      try {
        const expanded = await expandObservationVocabularyViaAliases(expandedObservationCodes, this.supabase);
        if (expanded.expanded_codes.length !== expandedObservationCodes.length) {
          console.log(`      🔁 Alias expansion: ${expandedObservationCodes.length} → ${expanded.expanded_codes.length} codes`);
        }
        expandedObservationCodes = expanded.expanded_codes;
        if (expanded.trace.length > 0) {
          agentsUsed.push('OBSERVATION_ALIAS_EXPANDER');
        }
      } catch (e) {
        console.warn(`      ⚠️ Alias expansion failed, continuing without it: ${(e as Error)?.message || String(e)}`);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FIX 3: ZERO-CODE CLARIFICATION GATE
      // If mapper returns zero meaningful codes AND intent is symptom-based,
      // force clarification — do NOT enter symbolic brain with empty observations
      // ═══════════════════════════════════════════════════════════════════════════
      const symptomBasedIntents = [
        'EMERGENCE_FAILURE', 'GROWTH_ANOMALY', 'COLOR_CHANGE', 'WILTING_OR_DROOPING',
        'LEAF_DAMAGE_VISIBLE', 'LEAF_MARKS_OR_SPOTS', 'STEM_DAMAGE', 'ROOT_OR_BASE_PROBLEM',
        'PEST_PRESENCE_VISIBLE', 'DISEASE_LIKE_PATTERN', 'UNKNOWN_OBSERVATION'
      ];
      const currentIntentForGate = semanticExtraction?.intent_code || 'UNKNOWN';
      const isSymptomBasedIntent = symptomBasedIntents.includes(currentIntentForGate);
      const zeroCodeGateExemptRoutes = new Set(['FERTILIZER_NUTRITION', 'IRRIGATION_SCHEDULING', 'WEATHER_SPRAY_TIMING', 'CROP_HEALTH', 'GENERAL_INFO']);
      // Fix 7: also exempt when the canonical intent code is advisory.
      const isZeroCodeGateExempt = zeroCodeGateExemptRoutes.has(queryRoute.route) || isAdvisoryRoute(currentIntentForGate);

      
      if (!hasMeaningfulCodes(mappedCodes) && isSymptomBasedIntent && !isZeroCodeGateExempt) {
        console.log(`\n🚫 [ZERO_CODE_GATE] ObservationCodeMapper returned zero codes for symptom intent ${currentIntentForGate}`);
        console.log(`   → Forcing CLARIFICATION path, will NOT enter symbolic brain`);
        agentsUsed.push('ZERO_CODE_CLARIFICATION_GATE');
        
        // Generate clarification using crop/stage context
        const clarificationLandCtx = landContext ? {
          crop: landContext.current_crop || landContext.crop,
          stage: landContext.growth_stage || landContext.stage,
          das: landContext.days_since_sowing
        } : null;
        
        // English-only clarification — LLM narration layer translates at runtime
        let clarificationMessage: string;
        
        if (clarificationLandCtx) {
          const cropName = clarificationLandCtx.crop || 'crop';
          const dasStr = clarificationLandCtx.das ? ` (${clarificationLandCtx.das} days)` : '';
          clarificationMessage = `I understand you're reporting an issue with your ${cropName} crop${dasStr}. Could you describe the specific symptoms?\n• Leaf color changes?\n• Spots/holes on leaves?\n• Insects visible?\n• Stem/root problems?\n• Growth stunted?`;
        } else {
          clarificationMessage = `Could you describe the specific symptoms you're observing? For example: leaf color changes, holes in leaves/stem, wilting, spots, or insect presence.`;
        }
        const clarificationMr = clarificationMessage;
        const clarificationHi = clarificationMessage;
        const clarificationEn = clarificationMessage;
        
        // CRITICAL FIX: Return proper OrchestratorResponse with required `type` field
        // and correct `communication.main_message.full_text` structure
        console.log(`[CLARIFY_EXIT] site=EXIT_02_PENDING_OPTIONS trace=${(typeof traceId!=='undefined'?traceId:'?')} intent=${(typeof intentCode!=='undefined'?intentCode:'?')} crop=${(landContext?.current_crop) ?? '?'} stage=${(canonicalContext?.growth_stage) ?? '?'}`);
        return {
          type: 'CLARIFICATION_QUESTION' as OrchestratorResponseType,
          session_id: sessionId,
          response: clarificationMessage,
          question: {
            question_id: `zero_code_clarification_${Date.now()}`,
            text_mr: clarificationMr,
            text_hi: clarificationHi,
            text_en: clarificationEn,
            options: [],
            scope: 'SYMPTOM_DESCRIPTION'
          },
          communication: {
            message_id: crypto.randomUUID(),
            decision_id: `zero_code_${Date.now()}`,
            session_id: sessionId,
            farmer_id: farmerId,
            language: userLang,
            format: 'RICH_TEXT',
            tone: 'FRIENDLY',
            created_at: new Date().toISOString(),
            main_message: {
              full_text: {
                mr: clarificationMr,
                hi: clarificationHi,
                en: clarificationEn
              }
            },
            farmer_message: clarificationMessage,
            message_type: 'CLARIFICATION_QUESTION',
            decision_brain_source: false,
            actions_returned: [],
            quick_actions: [],
            metadata: {
              confidence: 0.3,
              trace_id: traceId,
              processing_time_ms: Date.now() - startTime,
              agents_used: agentsUsed,
              gate_triggered: 'ZERO_CODE_CLARIFICATION'
            }
          } as any,
          metadata: {
            confidence: 0.3,
            safety_status: 'SAFE',
            rules_applied: 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            trace_id: traceId
          }
        };
      }
      
      // CRASH-PROOF LOGGING: Use safe accessors for all fields (v5.1.0 SemanticExtraction)
      let intentCode = semanticExtraction?.intent_code || 'UNKNOWN';
      // Expose for [ORCHESTRATOR_EXIT] boundary audit in index.ts
      (this as any)._lastIntentCode = intentCode;
      const intentConf = typeof semanticExtraction?.intent_confidence === 'number' 
        ? semanticExtraction.intent_confidence : 0;
      const obsCodesList = expandedObservationCodes || [];

      // ═══════════════════════════════════════════════════════════════════════
      // INTENT SALVAGE + EVIDENCE OVERRIDE (Fix 2)
      // - Legacy: reclassify UNKNOWN when crop or observations exist.
      // - Fix 2: if the mapper returned any real farmer symptom, force a
      //   diagnostic intent regardless of what the LLM classified. A visible
      //   symptom is always diagnostic — never GENERAL_CROP_INFO / CROP_INFO.
      // ═══════════════════════════════════════════════════════════════════════
      let realObsCountForSalvage = 0;
      try {
        const ec = classifyEvidence(obsCodesList);
        realObsCountForSalvage = ec.real_symptom_count;
        const cropPresent = !!(canonicalContext?.crop_code || landContext?.current_crop);
        const isUnknown = intentCode === 'UNKNOWN' || intentCode === 'UNKNOWN_OBSERVATION';
        const isAdvisoryLike = ['GENERAL_CROP_INFO', 'CROP_INFO', 'GENERAL_INFO', 'GENERAL_QUERY'].includes(intentCode);

        if (isUnknown && (cropPresent || realObsCountForSalvage > 0)) {
          const salvaged = realObsCountForSalvage > 0 ? 'DIAGNOSTIC_INQUIRY' : 'GENERAL_CROP_INFO';
          console.log(`[INTENT_SALVAGE][${traceId}] ${intentCode} → ${salvaged} (crop=${cropPresent} real_obs=${realObsCountForSalvage})`);
          intentCode = salvaged;
        } else if (isAdvisoryLike && realObsCountForSalvage > 0) {
          console.log(`[INTENT_OVERRIDE_BY_EVIDENCE][${traceId}] ${intentCode} → DIAGNOSTIC_INQUIRY reason=real_symptoms_present codes=[${ec.real_codes.slice(0, 6).join(',')}]`);
          intentCode = 'DIAGNOSTIC_INQUIRY';
        }
        emitNodeTrace(traceId, 'INTENT', {
          intent: intentCode,
          confidence: intentConf,
          crop: canonicalContext?.crop_code ?? landContext?.current_crop ?? null,
          real_observations: realObsCountForSalvage,
        });
      } catch {/* trace must not throw */}

      // ═══════════════════════════════════════════════════════════════════════════
      // STABILIZATION v4.0 ISSUE 4: Intent Confidence Tiering with Hard Override Guard
      // ═══════════════════════════════════════════════════════════════════════════
      const intentTier = intentConf >= 0.65 ? 'HIGH' : intentConf >= 0.35 ? 'TENTATIVE' : 'LOW';
      console.log(`      [IntentTier] ${intentTier} confidence (${(intentConf * 100).toFixed(0)}%) - intent: ${intentCode}`);
      
      console.log(`      Intent: ${intentCode} (${(intentConf * 100).toFixed(0)}% confidence)`);
      console.log(`      Codes: [${obsCodesList.slice(0, 5).join(', ')}${obsCodesList.length > 5 ? '...' : ''}]`);
      console.log(`      Mapping: ${mappedCodes?.mapping_method || 'UNKNOWN'}, Patterns: ${(mappedCodes?.patterns_matched || []).length}`);

      // GRAPH_NODE_TRACE — OBSERVATION (canonicalized set entering symbolic engine)
      // Fix 1: hard invariant — if evidence classifier saw real symptoms but the
      // graph-facing observation array is empty, the pipeline handoff has
      // corrupted state. Log loudly (do not mask).
      try {
        const evidenceObs = classifyEvidence(expandedObservationCodes || []);
        emitNodeTrace(traceId, 'OBSERVATION', {
          canonical_count: (expandedObservationCodes || []).length,
          real_symptom_count: evidenceObs.real_symptom_count,
          ignored_metadata: evidenceObs.ignored_metadata_count,
          real_codes: evidenceObs.real_codes,
          mapping_method: mappedCodes?.mapping_method || 'UNKNOWN',
        });

        // Fix 1 — handoff corruption invariant
        if (realObsCountForSalvage > 0 && evidenceObs.real_symptom_count === 0) {
          console.error(
            `[GRAPH_STATE_CORRUPTION][${traceId}] observations lost between classifier and graph ` +
            `pre=${realObsCountForSalvage} post=0 codes_pre=[${(obsCodesList || []).slice(0, 8).join(',')}]`,
          );
        }

        // Fix 3 — biological contradiction gate (post-lock, non-destructive)
        try {
          const bio: any = (landContext as any)?.biological_state;
          if (bio?.is_locked && bio?.growth_stage && evidenceObs.real_codes.length > 0) {
            const EMERGENCE_FAIL_OBS = new Set([
              'POOR_GERMINATION', 'GERMINATION_FAILURE', 'NO_GERMINATION',
              'NO_EMERGENCE', 'EMERGENCE_FAILURE', 'SEEDLING_DEATH', 'PLANT_DEATH',
            ]);
            const POST_ESTABLISHMENT_STAGES = new Set([
              'transplanting', 'tillering', 'vegetative', 'grand_growth',
              'flowering', 'reproductive', 'maturity', 'ripening', 'maturation', 'harvest',
            ]);
            const stageKey = String(bio.growth_stage).toLowerCase().trim().replace(/[\s-]+/g, '_');
            const contradicting = evidenceObs.real_codes.filter(c => EMERGENCE_FAIL_OBS.has(String(c).toUpperCase()));
            if (contradicting.length > 0 && POST_ESTABLISHMENT_STAGES.has(stageKey)) {
              const prevConf = typeof bio.confidence === 'number' ? bio.confidence : 0;
              bio.contradiction_flag = true;
              bio.contradiction_codes = contradicting;
              bio.stage_confidence_before_contradiction = prevConf;
              bio.confidence = Math.min(prevConf, 0.30);
              console.warn(
                `[BIO_STATE_CONTRADICTION][${traceId}] stage=${bio.growth_stage} ` +
                `obs=[${contradicting.join(',')}] prev_conf=${prevConf.toFixed(2)} ` +
                `new_conf=${bio.confidence.toFixed(2)} action=confidence_downgrade`,
              );
            }
          }
        } catch { /* contradiction gate must not throw */ }
      } catch {/* trace must not throw */}


      
      // ═══════════════════════════════════════════════════════════════════════════
      // STABILIZATION v4.0 ISSUE 7: LLM Output Validation Against Database
      // Validate intent codes and observation codes before they enter the symbolic engine
      // ═══════════════════════════════════════════════════════════════════════════
      try {
        const llmValidation = await validateLLMOutputAgainstDB({
          intent_code: intentCode,
          observation_codes: expandedObservationCodes,
          canonical_crop: canonicalContext?.crop_code,
          supabase: this.supabase
        });

        // ONTOLOGY ALIAS SUBSTITUTION — preserve evidence instead of deleting it.
        // Codes like SEEDLING_DIED / STUNTED_PLANTS that are not per-crop rows
        // in intent_observation_mapping are re-mapped to canonical peers
        // (POOR_CROP_ESTABLISHMENT, POOR_GROWTH_VISIBLE) so hypothesis
        // conditions authored against the canonical vocabulary still fire.
        const aliasedMap = llmValidation.aliased_observations || {};
        const aliasedCount = Object.keys(aliasedMap).length;
        if (aliasedCount > 0) {
          expandedObservationCodes = expandedObservationCodes.map(c => aliasedMap[c] || c);
          // Deduplicate after aliasing
          expandedObservationCodes = Array.from(new Set(expandedObservationCodes));
          console.log(`      🔗 [LLM_VALIDATION] Aliased ${aliasedCount} generic codes → canonical peers: ${JSON.stringify(aliasedMap)}`);
          agentsUsed.push('OBSERVATION_ALIAS_RESOLVER');
        }

        if (!llmValidation.valid) {
          console.warn(`      ⚠️ [LLM_VALIDATION] Rejected: ${llmValidation.reason}`);
          // Remove observation codes that could NOT be aliased.
          if (llmValidation.rejected_observations.length > 0 || llmValidation.crop_applicable_rejections.length > 0) {
            const allRejectedObs = new Set([...llmValidation.rejected_observations, ...llmValidation.crop_applicable_rejections]);
            expandedObservationCodes = expandedObservationCodes.filter(c => !allRejectedObs.has(c));
            console.log(`      ⚠️ [LLM_VALIDATION] Filtered to ${expandedObservationCodes.length} valid observation codes (after alias resolution)`);
          }
          agentsUsed.push('LLM_OUTPUT_VALIDATOR');
        }
      } catch (validationError) {
        console.warn(`      ⚠️ [LLM_VALIDATION] Validation failed, continuing without it: ${(validationError as Error)?.message || String(validationError)}`);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // LEGACY FALLBACK: Language Induction Layer (for backward compatibility)
      // Still runs to provide inductionResult for existing code paths
      // ═══════════════════════════════════════════════════════════════════════════
      console.log(`\n   🔤 Stage 1.5b: Legacy Induction (v${LANGUAGE_INDUCTION_VERSION}) [FALLBACK]...`);
      
      // T4 — pass land-context authority so DB crop wins over hardcoded CROP_MAP
      const inductionResult: LanguageInductionResult = induceCanonicalSymbols(
        processedFarmerMessage,
        { current_crop: (landContext as any)?.current_crop ?? null },
      );

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
      // CRASH-PROOF: Use intent_confidence with fallback (v5.1.0 compatibility)
      const safeConfidence = typeof semanticExtraction?.intent_confidence === 'number'
        ? semanticExtraction.intent_confidence
        : (typeof semanticExtraction?.confidence === 'number' ? semanticExtraction.confidence : 0.5);
      
      if (expandedObservationCodes.length > 0) {
        console.log(`      🔄 MERGING ${expandedObservationCodes.length} LLM+alias-expanded codes into induction result`);
        
        // Convert codes to symptom symbols for the induction result
        for (const code of expandedObservationCodes) {
          // Check if symptom already exists in inductionResult
          const existingSymptom = inductionResult.symptoms.find(s => s.symbol === code);
          if (!existingSymptom) {
            inductionResult.symptoms.push({
              symbol: code,
              confidence: safeConfidence,
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
              confidence: safeConfidence,
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
              confidence: safeConfidence,
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
              confidence: safeConfidence,
              source: 'LLM_SEMANTIC_EXTRACTOR'
            });
            inductionResult.total_symbols_extracted++;
          }
        }
        
        // Update symbol coverage based on merged symptoms
        // SPRINT 3 FIX: Adaptive coverage denominator. Real-world farmer reports rarely exceed
        // 3–5 symptoms per case, so 8 systematically under-rated single/double-symptom diagnoses.
        // Cap denominator at max(4, len) so any single strong symptom yields ≥25% coverage.
        inductionResult.symbol_coverage = Math.min(1.0, inductionResult.symptoms.length / Math.max(4, Math.min(8, inductionResult.symptoms.length)));
        inductionResult.aggregated_confidence = Math.max(
          inductionResult.aggregated_confidence,
          safeConfidence
        );
        
        console.log(`      ✅ POST-MERGE: ${inductionResult.symptoms.length} total symptoms, coverage=${(inductionResult.symbol_coverage * 100).toFixed(0)}%`);
        console.log(`      Merged symptoms: [${inductionResult.symptoms.map(s => s.symbol).join(', ')}]`);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: ROUTER ENTITY FALLBACK
      // When LLM returns 429 or UNKNOWN_OBSERVATION, use the query router's
      // detected_entities (pest, symptom, crop) as fallback symptoms.
      // The router uses deterministic regex and ALWAYS runs successfully.
      // ═══════════════════════════════════════════════════════════════════════════
      const routerEntities = queryRoute?.detected_entities;
      const llmFailed = intentCode === 'UNKNOWN_OBSERVATION' || intentCode === 'UNKNOWN' || intentConf < 0.1;
      const routerHasEntities = routerEntities && (routerEntities.pest || routerEntities.symptom || routerEntities.crop);
      
      if (llmFailed && routerHasEntities && inductionResult.symptoms.length === 0) {
        console.log(`\n🔄 [ROUTER_FALLBACK] LLM failed (${intentCode}/${(intentConf * 100).toFixed(0)}%) - injecting router entities as symptoms`);
        
        // Map router entity names to canonical symptom symbols
        const routerSymbolMap: Record<string, string> = {
          'SHOOT_BORER': 'INSECTS_VISIBLE',
          'STEM_BORER': 'INSECTS_VISIBLE',
          'DEAD_HEART': 'DEAD_HEART',
          'LEAF_CURL': 'LEAF_CURLING',
          'LEAF_SPOT': 'LEAF_SPOTS',
          'YELLOWING': 'LEAF_YELLOWING',
          'WILTING': 'LEAF_WILTING',
          'WHITEFLY': 'INSECTS_VISIBLE',
          'APHID': 'INSECTS_VISIBLE',
          'MEALYBUG': 'INSECTS_VISIBLE',
          'RUST': 'LEAF_SPOTS',
          'SMUT': 'BLACK_WHIP_STRUCTURE',
          'RED_ROT': 'STEM_DISCOLORATION',
          'WILT': 'LEAF_WILTING',
          'BLIGHT': 'LEAF_SPOTS',
          'MOSAIC': 'LEAF_DISCOLORATION',
          'GRASSY_SHOOT': 'ABNORMAL_GROWTH',
          'POKKAH_BOENG': 'LEAF_CURLING',
          'TOP_BORER': 'DEAD_HEART',
          'INTERNODE_BORER': 'STEM_DAMAGE',
          'MITE': 'LEAF_DISCOLORATION',
          'TERMITE': 'ROOT_DAMAGE',
          'WHITE_GRUB': 'ROOT_DAMAGE',
          'DROUGHT_STRESS': 'LEAF_WILTING',
          'NUTRIENT_DEFICIENCY': 'LEAF_YELLOWING',
        };
        
        // Inject pest entity as symptom
        if (routerEntities.pest) {
          const mappedSymbol = routerSymbolMap[routerEntities.pest] || routerEntities.pest;
          if (!inductionResult.symptoms.find(s => s.symbol === mappedSymbol)) {
            inductionResult.symptoms.push({
              symbol: mappedSymbol,
              confidence: queryRoute.confidence,
              source: 'QUERY_ROUTER_FALLBACK'
            });
            inductionResult.total_symbols_extracted++;
            console.log(`   📋 Injected pest→symptom: ${routerEntities.pest} → ${mappedSymbol}`);
          }
        }
        
        // Inject symptom entity directly
        if (routerEntities.symptom) {
          const mappedSymbol = routerSymbolMap[routerEntities.symptom] || routerEntities.symptom;
          if (!inductionResult.symptoms.find(s => s.symbol === mappedSymbol)) {
            inductionResult.symptoms.push({
              symbol: mappedSymbol,
              confidence: queryRoute.confidence,
              source: 'QUERY_ROUTER_FALLBACK'
            });
            inductionResult.total_symbols_extracted++;
            console.log(`   📋 Injected symptom: ${routerEntities.symptom} → ${mappedSymbol}`);
          }
        }
        
        // Inject crop if not already present
        if (routerEntities.crop && !inductionResult.crop) {
          inductionResult.crop = {
            symbol: routerEntities.crop,
            confidence: queryRoute.confidence,
            source: 'QUERY_ROUTER_FALLBACK'
          };
          console.log(`   📋 Injected crop: ${routerEntities.crop}`);
        }
        
        // Recalculate coverage
        // SPRINT 3 FIX: see comment above — adaptive denominator (min 4) to avoid penalising
        // legitimate single/double-symptom diagnoses coming from the router-entity fallback path.
        inductionResult.symbol_coverage = Math.min(1.0, inductionResult.symptoms.length / Math.max(4, Math.min(8, inductionResult.symptoms.length)));
        inductionResult.aggregated_confidence = Math.max(inductionResult.aggregated_confidence, queryRoute.confidence);
        
        console.log(`   ✅ POST-ROUTER-FALLBACK: ${inductionResult.symptoms.length} symptoms, coverage=${(inductionResult.symbol_coverage * 100).toFixed(0)}%`);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PATCH 2: STAGE CONTEXT GUARD
      // If intent metadata requires stage context and we don't have it, ask farmer
      // ═══════════════════════════════════════════════════════════════════════════
      let intentMetaFromDB: { requires_stage_context?: boolean; routing_target?: string; requires_crop_context?: boolean; clarification_mode?: string; max_clarification_rounds?: number } | null = null;
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
        
        const { data: intentRow } = await supabaseClient
          .from('observation_intent_master')
          .select('requires_stage_context, routing_target, requires_crop_context, clarification_mode, max_clarification_rounds')
          .eq('intent_code', intentCode)
          .eq('is_active', true)
          .maybeSingle();
        
        if (intentRow) {
          intentMetaFromDB = intentRow;
          console.log(`   📋 [PATCH 2] Intent metadata loaded: stage_required=${intentRow.requires_stage_context}, routing=${intentRow.routing_target}`);
        }
      } catch (metaErr) {
        console.warn(`   ⚠️ [PATCH 2] Failed to load intent metadata: ${metaErr}`);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FIX 1: DIRECT-MODE INTENT BYPASS
      // If intent metadata says clarification_mode='DIRECT' AND we have crop context,
      // skip the understanding checker entirely. Advisory intents (fertilizer, irrigation,
      // harvest) don't need symptom clarification — they go straight to the rule engine.
      // ═══════════════════════════════════════════════════════════════════════════
      let directModeBypass = false;
      // FIX (advisory routing): widen route set + multi-source crop check so DIRECT mode
      // fires whenever any layer of context (canonical, land record, or crop schedule) knows the crop.
      const ADVISORY_DIRECT_ROUTES = new Set([
        'FERTILIZER_NUTRITION',
        'IRRIGATION_SCHEDULING',
        'WEATHER_SPRAY_TIMING',
        'CROP_HEALTH',
        'GENERAL_INFO'
      ]);
      const routeDirectModeBypass = ADVISORY_DIRECT_ROUTES.has(queryRoute.route as string);
      // Fix 7: ALSO bypass when LLM-emitted canonical intent code is advisory.
      const intentAdvisoryBypass = isAdvisoryRoute(intentCode);
      const cropFromAnyLayer =
        (landContext as any)?.current_crop ||
        (canonicalContext as any)?.crop ||
        (landContext as any)?.crop_schedule?.crop_name ||
        (landContext as any)?.crop_name;
      // Fix F: DIRECT-hard bypass — clarification_mode=DIRECT AND max_clarification_rounds=0
      // means this intent contract NEVER allows the diagnosis clarification loop.
      const directHardBypass =
        intentMetaFromDB?.clarification_mode === 'DIRECT' &&
        (intentMetaFromDB?.max_clarification_rounds ?? -1) === 0;
      if ((intentMetaFromDB?.clarification_mode === 'DIRECT' || routeDirectModeBypass || intentAdvisoryBypass) && cropFromAnyLayer) {
        directModeBypass = true;
        bypassClarification = true;
        console.log(`   🎯 [DIRECT_MODE] Intent ${intentCode} / route ${queryRoute.route} skips symptom clarification (advisoryIntent=${intentAdvisoryBypass}, hardBypass=${directHardBypass}, maxRounds=${intentMetaFromDB?.max_clarification_rounds ?? 'n/a'})`);
        console.log(`   Crop: ${cropFromAnyLayer}, Stage: ${(landContext as any)?.growth_stage || (canonicalContext as any)?.stage || 'UNKNOWN'}`);
        agentsUsed.push('DIRECT_MODE_BYPASS');
        if (directHardBypass) agentsUsed.push('DIRECT_HARD_BYPASS');
      }

      
      // PATCH 2: Stage context guard - ask farmer for crop stage if required
      // v7.7 FIX: For DIAGNOSTIC intents (STEM_DAMAGE, LEAF_DAMAGE, PEST_OBSERVATION, etc.)
      // the farmer is reporting visible damage. Blocking the entire pipeline for stage info
      // is WRONG — the symptoms alone are sufficient for rule matching.
      // Instead, use a default stage ('VEGETATIVE') and let the rule engine handle it.
      const DIAGNOSTIC_INTENTS = new Set([
        'STEM_DAMAGE', 'BORER_IDENTIFICATION', 'LEAF_DAMAGE', 'ROOT_DAMAGE', 'FRUIT_DAMAGE',
        'PEST_OBSERVATION', 'DISEASE_OBSERVATION', 'REPORT_SYMPTOM',
        'GROWTH_ANOMALY', 'WILTING_DRYING', 'YELLOWING', 'NUTRIENT_DEFICIENCY',
        'BORER_DAMAGE', 'DEAD_HEART', 'INSECT_DAMAGE', 'FUNGAL_INFECTION',
        'UNKNOWN_OBSERVATION'
      ]);
      
      if (intentMetaFromDB?.requires_stage_context && !landContext?.growth_stage) {
        if (DIAGNOSTIC_INTENTS.has(intentCode)) {
          // v7.7: Diagnostic intents proceed with default stage — symptoms are actionable
          console.log(`   ✅ [PATCH 2 v7.7] DIAGNOSTIC BYPASS: Intent ${intentCode} is diagnostic — proceeding with default stage VEGETATIVE`);
          console.log(`   📋 Rationale: Farmer reported visible damage/symptoms. Stage is helpful but NOT required for diagnosis.`);
          agentsUsed.push('STAGE_GUARD_DIAGNOSTIC_BYPASS');
          // landContext will be null — rule engine uses 'VEGETATIVE' as default downstream
        } else {
          console.log(`   🚧 [PATCH 2] STAGE_CONTEXT_REQUIRED: Intent ${intentCode} needs stage but none available`);
          agentsUsed.push('STAGE_CONTEXT_GUARD');
          
          const lang = options.language || 'en';
          const stageQuestion = 'What is the current stage of your crop? (e.g., seedling, tillering, vegetative, flowering, fruiting)';
          
          console.log(`[CLARIFY_EXIT] site=EXIT_03_INDUCTION_LOWCOV trace=${(typeof traceId!=='undefined'?traceId:'?')} intent=${(typeof intentCode!=='undefined'?intentCode:'?')} crop=${(landContext?.current_crop) ?? '?'} stage=${(canonicalContext?.growth_stage) ?? '?'}`);
          return {
            type: 'CLARIFICATION_QUESTION',
            session_id: sessionId,
            question: {
              text: stageQuestion,
              options: [],
              reason: 'STAGE_CONTEXT_REQUIRED'
            },
            metadata: {
              confidence: intentConf,
              safety_status: 'SAFE',
              rules_applied: 0,
              processing_time_ms: Date.now() - startTime,
              agents_used: agentsUsed,
              trace_id: traceId
            }
          } as any;
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PATCH 6: HYBRID ROUTING LOGIC
      // Route INFO_MODULE intents to LLM direct response, HYBRID based on crop context
      // ═══════════════════════════════════════════════════════════════════════════
      if (intentMetaFromDB?.routing_target === 'INFO_MODULE') {
        console.log(`   📚 [PATCH 6] INFO_MODULE route: Intent ${intentCode} → LLM direct response (no rule engine)`);
        agentsUsed.push('INFO_MODULE_ROUTE');
        
        // Generate direct LLM response for info-only queries
        const infoResponse = await generateLLMResponse({
          farmer_message: safeFarmerMessage,
           language: options.language || 'mr',
          land_context: landContext ? {
            current_crop: landContext.current_crop,
            crop_stage: landContext.growth_stage,
            days_since_sowing: landContext.days_since_sowing
          } : undefined
        });
        
        return {
          type: 'DECISION_PROVIDED',
          session_id: sessionId,
          communication: {
            message_id: crypto.randomUUID(),
            decision_id: `info_${Date.now()}`,
            session_id: sessionId,
            farmer_id: farmerId,
            language: options.language || 'mr',
            format: 'RICH_TEXT',
            tone: 'FRIENDLY',
            created_at: new Date().toISOString(),
            main_message: { full_text: { mr: infoResponse.response_text, hi: infoResponse.response_text, en: infoResponse.response_text } },
            quick_actions: [],
            metadata: {
              word_count: infoResponse.response_text.split(/\s+/).length,
              reading_time_seconds: 10,
              confidence_score: 0.7,
              source: 'INFO_MODULE',
              response_type: 'INFORMATION'
            }
          } as any,
          decision_output: {
            decision_id: `info_${Date.now()}`,
            session_id: sessionId,
            status: 'INFORMATION_PROVIDED',
            decision_brain_source: false,
            actions_returned: [],
            metadata: {
              confidence: 0.7,
              trace_id: traceId,
              processing_time_ms: Date.now() - startTime,
              agents_used: agentsUsed,
              routing_target: 'INFO_MODULE'
            }
          } as any,
          metadata: {
            confidence: 0.7,
            safety_status: 'SAFE',
            rules_applied: 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            trace_id: traceId
          }
        };
      }
      
      if (intentMetaFromDB?.routing_target === 'HYBRID') {
        if (landContext?.current_crop) {
          console.log(`   🔀 [PATCH 6] HYBRID route with active crop → continuing to symbolic engine`);
          agentsUsed.push('HYBRID_ROUTE_SYMBOLIC');
          // Continue to symbolic pipeline below
        } else {
          console.log(`   🔀 [PATCH 6] HYBRID route without crop → routing to LLM info response`);
          agentsUsed.push('HYBRID_ROUTE_INFO');
          
          const hybridResponse = await generateLLMResponse({
            farmer_message: safeFarmerMessage,
            language: options.language || 'mr'
          });
          
          return {
            type: 'DECISION_PROVIDED',
            session_id: sessionId,
            communication: {
              message_id: crypto.randomUUID(),
              decision_id: `hybrid_info_${Date.now()}`,
              session_id: sessionId,
              farmer_id: farmerId,
              language: options.language || 'mr',
              format: 'RICH_TEXT',
              tone: 'FRIENDLY',
              created_at: new Date().toISOString(),
              main_message: { full_text: { mr: hybridResponse.response_text, hi: hybridResponse.response_text, en: hybridResponse.response_text } },
              quick_actions: [],
              metadata: {
                word_count: hybridResponse.response_text.split(/\s+/).length,
                reading_time_seconds: 10,
                confidence_score: 0.7,
                source: 'HYBRID_INFO_MODULE',
                response_type: 'INFORMATION'
              }
            } as any,
            decision_output: {
              decision_id: `hybrid_info_${Date.now()}`,
              session_id: sessionId,
              status: 'INFORMATION_PROVIDED',
              decision_brain_source: false,
              actions_returned: [],
              metadata: {
                confidence: 0.7,
                trace_id: traceId,
                processing_time_ms: Date.now() - startTime,
                agents_used: agentsUsed,
                routing_target: 'HYBRID'
              }
            } as any,
            metadata: {
              confidence: 0.7,
              safety_status: 'SAFE',
              rules_applied: 0,
              processing_time_ms: Date.now() - startTime,
              agents_used: agentsUsed,
              trace_id: traceId
            }
          };
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FIX 4: REMOVED LLM_FAILSAFE — replaced with clarification-only path
      // When LLM fails but land context exists, force clarification instead of
      // artificially boosting coverage to allow ungrounded symbolic execution
      // ═══════════════════════════════════════════════════════════════════════════
      const llmFailedForFailsafe = intentCode === 'UNKNOWN_OBSERVATION' && intentConf < 0.2;
      const hasLandContextForFailsafe = landContext && landContext.current_crop && landContext.growth_stage;
      
      if (llmFailedForFailsafe && hasLandContextForFailsafe) {
        console.log(`\n🚑 [LLM_FAILED_CLARIFICATION] LLM failed (intent=${intentCode}, conf=${(intentConf * 100).toFixed(0)}%) — forcing clarification path`);
        console.log(`   Crop: ${landContext.current_crop}, Stage: ${landContext.growth_stage}, DAS: ${landContext.days_since_sowing || '?'}`);
        console.log(`   → Will NOT boost coverage. Generating crop-stage-aware clarification instead.`);
        agentsUsed.push('LLM_FAILED_CLARIFICATION');
        // Do NOT boost inductionResult — let shouldRunSymbolicBrain remain false
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // LANGUAGE INDUCTION GATE: Determine if symbolic brain should run
      // Based on symbol_coverage and aggregated_confidence, NOT intent confidence
      // ═══════════════════════════════════════════════════════════════════════════
      const inductionCoverageSufficient = hasMinimumCoverage(inductionResult, 0.25); // 25% coverage or 1+ symbols
      const inductionConfidenceSufficient = inductionResult.aggregated_confidence >= 0.5 || inductionResult.total_symbols_extracted >= 2;
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FIX: HARD BLOCK SYMBOLIC BRAIN WHEN ZERO SYMPTOMS EXTRACTED
      // A crop symbol alone (e.g., SUGARCANE) is NOT sufficient for PEST/DISEASE rules
      // BUT: Irrigation, crop health, and weather queries DON'T need symptoms
      // ═══════════════════════════════════════════════════════════════════════════
      const hasSymptoms = inductionResult.symptoms.length > 0;
      
      // PR-7 F2: `GENERAL_INFO` REMOVED from this allowlist. It was a
      // heuristic query-router bucket (50%-conf) that quietly bypassed the
      // zero-symptom invariant gate when the semantic classifier had already
      // locked a specific diagnostic intent — the "two classifiers, use
      // whichever is convenient" failure mode from trace_mr9ixe63_gvykf4.
      // Routes that legitimately do not need farmer-confirmed symptoms:
      const symptomFreeRoutes = ['IRRIGATION_SCHEDULING', 'CROP_HEALTH', 'WEATHER_SPRAY', 'WEATHER_SPRAY_TIMING', 'GREETING', 'FERTILIZER_NUTRITION'];
      const isSymptomFreeRoute = symptomFreeRoutes.includes(queryRoute.route);
      
      // FIX 4: LLM failsafe NO LONGER allows symbolic brain — clarification only
      let shouldRunSymbolicBrain = isSymptomFreeRoute || ((inductionCoverageSufficient || inductionConfidenceSufficient) && hasSymptoms);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FIX 7 (PR-7 F2 rewrite): HARD INVARIANT — Block rule firing whenever there
      // are zero symptoms and the route is not on the symptom-free allowlist.
      // The previous formulation `shouldRunSymbolicBrain && !hasSymptoms && !isSymptomFreeRoute`
      // was self-defeating: whenever `isSymptomFreeRoute` was true the gate
      // could not fire at all, which is exactly how GENERAL_INFO leaked
      // through with 0 observations.
      // ═══════════════════════════════════════════════════════════════════════════
      if (!hasSymptoms && !isSymptomFreeRoute) {
        const gateIntentCode = semanticExtraction?.intent_code || inductionResult?.intent_code || 'UNKNOWN';
        console.log(`\n🚫 [INVARIANT_GATE] Blocking symbolic brain: zero observations + route=${queryRoute.route} intent=${gateIntentCode}`);
        shouldRunSymbolicBrain = false;
        agentsUsed.push('INVARIANT_GATE_BLOCKED');
      }
      
      if (!hasSymptoms && !isSymptomFreeRoute && (inductionCoverageSufficient || inductionConfidenceSufficient)) {
        console.log(`\n⚠️ [INDUCTION_GATE] Blocking symbolic brain: coverage=${(inductionResult.symbol_coverage * 100).toFixed(0)}% but symptoms=0`);
        console.log(`   → Crop detected: ${inductionResult.crop?.symbol || 'NONE'}`);
        console.log(`   → Total symbols: ${inductionResult.total_symbols_extracted} (but none are symptoms)`);
        console.log(`   → Route: ${queryRoute.route} (requires symptoms)`);
        console.log(`   → Forcing CLARIFICATION path instead of empty rule matching`);
        agentsUsed.push('SYMPTOM_GATE_BLOCKED');
      } else if (isSymptomFreeRoute && !hasSymptoms) {
        console.log(`\n✅ [INDUCTION_GATE] Allowing symbolic brain for ${queryRoute.route} route WITHOUT symptoms (uses crop/stage/NDVI rules)`);
        agentsUsed.push('SYMPTOM_FREE_ROUTE');
      }
      
      console.log(`      📊 Induction Gate: coverage_ok=${inductionCoverageSufficient}, confidence_ok=${inductionConfidenceSufficient}, has_symptoms=${hasSymptoms}, run_symbolic=${shouldRunSymbolicBrain}`);
      
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

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE C, GATE #1 — SEMANTIC VALIDATOR
      // Runs immediately after observation extraction. Drops observations whose
      // semantic_class is not allow-listed for the active intent. Fails OPEN
      // when the allowlist is unseeded so the pipeline is never blocked.
      // ═══════════════════════════════════════════════════════════════════════
      requestCtx.ledger.create('OBSERVATION_EXTRACT', 'extraction',
        { symptoms: observationExtraction.raw_symptom_text.length, crop: observationExtraction.crop_mentioned },
        { source: 'observation-extractor' });
      requestCtx.chain.set('observation',
        observationExtraction.raw_symptom_text.length > 0 ? 0.9 : 0.5);
      try {
        const semObs = (observationExtraction.raw_symptom_text || []).map((t: string) => ({
          code: String(t).toLowerCase().replace(/\s+/g, '_'),
          semantic_class: null,
          source: 'observation-extractor',
        }));
        const semResult = await evaluateSemanticGate({
          intent: (typeof intentCode !== 'undefined' ? String(intentCode) : 'GENERAL_QUERY'),
          observations: semObs,
          supabase: this.supabase,
          ledger: requestCtx.ledger,
          chain: requestCtx.chain,
        });
        if (semResult.dropped.length > 0) {
          console.log(`      🚦 [SEMANTIC_GATE] dropped ${semResult.dropped.length} cross-class observations`);
        }
      } catch (semErr) {
        console.warn('[SEMANTIC_GATE] non-fatal failure', semErr instanceof Error ? semErr.message : semErr);
      }
      
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
        // v7.7 FIX: Infer crop from farmer message when no land context
        // The farmer may explicitly mention the crop (e.g., "ऊसाच्या" = sugarcane)
        const CROP_MENTION_PATTERNS: Record<string, RegExp> = {
          'SUGARCANE': /ऊस|ऊसा|उस|गन्ना|गन्ने|sugarcane|cane/i,
          'COTTON': /कापूस|कापस|कपास|cotton/i,
          'SOYBEAN': /सोयाबीन|सोयबीन|soybean|soya/i,
          'WHEAT': /गहू|गेहूं|गेहू|wheat/i,
          'RICE': /भात|धान|चावल|rice|paddy/i,
          'MAIZE': /मका|मक्का|maize|corn/i,
          'ONION': /कांदा|प्याज|onion/i,
          'TOMATO': /टोमॅटो|टमाटर|tomato/i,
          'GRAPE': /द्राक्ष|अंगूर|grape/i,
          'POMEGRANATE': /डाळिंब|अनार|pomegranate/i,
          'TURMERIC': /हळद|हल्दी|turmeric/i,
          'BANANA': /केळी|केला|banana/i,
        };
        
        let inferredCrop: string | null = null;
        for (const [cropCode, pattern] of Object.entries(CROP_MENTION_PATTERNS)) {
          if (pattern.test(safeFarmerMessage)) {
            inferredCrop = cropCode;
            break;
          }
        }
        
        if (inferredCrop) {
          console.log(`      🌾 [v7.7] CROP INFERRED FROM MESSAGE: ${inferredCrop}`);
          cropContextAuthority = {
            crop_name: inferredCrop,
            growth_stage: 'VEGETATIVE', // Safe default for diagnostic intents
            days_since_sowing: 60, // Reasonable default
            source: 'farmer_message' as any
          };
          lockedCropContext = {
            crop_name: inferredCrop,
            growth_stage: 'VEGETATIVE',
            days_since_sowing: 60
          };
          agentsUsed.push('CROP_INFERENCE_FROM_MESSAGE');
        } else {
          console.log('      ⚠️ No CropContextAuthority available - general chat mode');
        }
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
      const authoredObservations = new AuthoredObservationSet();
      const allObservationsForPreAuth = new Set<string>(); // backward-compat flat set
      
      // SYMBOL CONTRACT — runtime accepts any well-formed symbol regardless of
      // casing / separators. Agricultural authority (whether a code exists in
      // observation_master / IOM / hypothesis_conditions) is DB-owned; the
      // runtime only normalizes graph identity via SymbolContract. Lowercase
      // DB codes (e.g. `obs_rice_no_emergence`, `poor_germination`) MUST
      // survive this gate.
      function acceptSymbol(s: unknown): string | null {
        return SymbolContract.normalize(s as any);
      }
      
      let filteredOutCount = 0;
      
      // Add from observation keys - tagged as EXTRACTED (pattern-matched from farmer text)
      if (observationKeys) {
        observationKeys.forEach(key => {
          const norm = acceptSymbol(key);
          if (norm) {
            allObservationsForPreAuth.add(norm);
            authoredObservations.add(norm, ObservationAuthority.EXTRACTED, 'OBSERVATION_KEYS_INDUCTION');
          } else {
            filteredOutCount++;
            console.log(`   🔇 [SYMBOL_CONTRACT] Rejected empty/invalid observation key: "${String(key).substring(0, 30)}"`);
          }
        });
      }
      
      // Add from mapped codes - tagged as INFERRED (LLM semantic extraction)
      if (mappedCodes?.observation_codes) {
        mappedCodes.observation_codes.forEach((code: string) => {
          const norm = acceptSymbol(code);
          if (norm) {
            allObservationsForPreAuth.add(norm);
            authoredObservations.add(norm, ObservationAuthority.INFERRED, 'LLM_SEMANTIC_EXTRACTOR');
          } else {
            filteredOutCount++;
            console.log(`   🔇 [SYMBOL_CONTRACT] Rejected empty/invalid mapped code: "${String(code).substring(0, 30)}"`);
          }
        });
      }
      
      // Add from induction result symptoms - authority depends on source
      if (inductionResult?.symptoms) {
        inductionResult.symptoms.forEach((s: any) => {
          const norm = acceptSymbol(s?.symbol);
          if (norm) {
            allObservationsForPreAuth.add(norm);
            // Tag based on induction source
            const inductionAuthority = s.source === 'LLM_SEMANTIC_EXTRACTOR' 
              ? ObservationAuthority.INFERRED 
              : ObservationAuthority.EXTRACTED; // LANGUAGE_INDUCTION = pattern match
            authoredObservations.add(norm, inductionAuthority, s.source || 'LANGUAGE_INDUCTION');
          } else if (s.symbol) {
            filteredOutCount++;
            console.log(`   🔇 [SYMBOL_CONTRACT] Rejected empty/invalid symptom: "${String(s.symbol).substring(0, 30)}"`);
          }
        });
      }
      
      if (filteredOutCount > 0) {
        console.log(`   📊 [SYMBOL_CONTRACT] Total rejected (empty/blank only, casing NOT a rejection reason): ${filteredOutCount}`);
      }
      
      // PHASE-19 v2.0: Add photo-mapped codes - tagged as CONFIRMED (photo-verified)
      if (photoMappedCodes?.observation_codes) {
        console.log(`   📸 Adding ${photoMappedCodes.observation_codes.length} photo codes as CONFIRMED`);
        photoMappedCodes.observation_codes.forEach((code: any) => {
          const norm = acceptSymbol(code);
          if (norm) {
            allObservationsForPreAuth.add(norm);
            authoredObservations.add(norm, ObservationAuthority.CONFIRMED, 'PHOTO_ANALYSIS');
          }
        });
      }
      
      
      // ═══════════════════════════════════════════════════════════════════════════
      // LANGUAGE-AGNOSTIC ARCHITECTURE: LLM-First Symptom Fallback
      // 
      // OLD APPROACH (REMOVED): Hardcoded Marathi/Hindi/English keywords
      // This was NOT scalable - required manual maintenance for each language.
      // 
      // NEW APPROACH: If induction layer returns no symptoms but NLU detected
      // an agricultural problem intent (anything other than UNKNOWN_OBSERVATION),
      // inject a generic symptom to trigger diagnosis-first mode.
      // 
      // This is LANGUAGE-AGNOSTIC because:
      // 1. LLM understands ANY language the farmer uses
      // 2. LLM maps farmer's concern to canonical intent_code
      // 3. We use intent_code (not keywords) to determine if diagnosis is needed
      // 4. No hardcoded regional language patterns required
      // ═══════════════════════════════════════════════════════════════════════════
      // ═══════════════════════════════════════════════════════════════════════════
      // T3 · DB-DRIVEN INTENT→OBSERVATION FALLBACK (no hardcoded agronomy)
      //
      // If the extractor produced no observations but the LLM identified an
      // intent, look up LITERAL observation peers for that (intent, crop) in
      // `intent_observation_mapping`. The DB is the ONLY source of truth for
      // this mapping — no hardcoded `intentToSymptom` / `advisoryIntents` lists.
      //
      // Fallback ordering:
      //   1) rows scoped to landContext.current_crop with assertion_strength=LITERAL
      //   2) rows scoped to crop_code='universal' (advisory intents like
      //      FERTILIZER_SCHEDULE, HARVEST_TIMING) with LITERAL strength
      //   3) intent_code injected as observation only if it appears in
      //      observation_master (kept for advisory-direct rule matching)
      // ═══════════════════════════════════════════════════════════════════════════
      if (allObservationsForPreAuth.size === 0 && landContext && landContext.current_crop) {
        const intentCode = semanticExtraction?.intent_code || inductionResult?.intent_code || 'UNKNOWN_OBSERVATION';

        // ═══════════════════════════════════════════════════════════════════════
        // PR-7 F3: IOM-fallback preconditions.
        // Without these guards a low-confidence, wrong-crop, or clarification-
        // bound intent silently manufactured INFERRED evidence (see incident
        // trace_mr9ixe63_gvykf4 where COTTON_SQUARE_BOLL_DROP_QUERY injected
        // SEVERITY_MEDIUM + INSECT_DENSITY_MANY onto a Rice weed query).
        //   (a) require intent-lock confidence ≥ 0.75
        //   (b) reject when intent's crop prefix disagrees with land crop
        //   (c) never synthesise evidence when we are already heading to a
        //       clarification turn (route === DIAGNOSTIC and hasSymptoms === false)
        // ═══════════════════════════════════════════════════════════════════════
        const iomLockConfidence = Number((this as any)._intentLock?.confidence ?? intentConfidence ?? 0);
        const iomCropRejected = Boolean((this as any)._intentLock?.crop_scope_rejected);
        const iomIsDiagnosticNoSymptoms =
          (queryRoute?.route === 'DIAGNOSTIC') && (hasSymptoms === false);
        if (intentCode && intentCode !== 'UNKNOWN_OBSERVATION' && iomLockConfidence < 0.75) {
          console.log(`⛔ [INTENT_IOM_FALLBACK] skipped intent=${intentCode} reason=low_confidence(${iomLockConfidence.toFixed(2)}<0.75)`);
        } else if (intentCode && intentCode !== 'UNKNOWN_OBSERVATION' && iomCropRejected) {
          console.log(`⛔ [INTENT_IOM_FALLBACK] skipped intent=${intentCode} reason=crop_scope_rejected`);
        } else if (intentCode && intentCode !== 'UNKNOWN_OBSERVATION' && iomIsDiagnosticNoSymptoms) {
          console.log(`⛔ [INTENT_IOM_FALLBACK] skipped intent=${intentCode} reason=diagnostic_zero_symptoms_owes_clarification`);
        } else
        if (intentCode && intentCode !== 'UNKNOWN_OBSERVATION') {
          try {
            const cropScopes = Array.from(new Set([
              String(landContext.current_crop).toLowerCase(),
              'universal',
            ]));

            const { data: iomRows, error: iomErr } = await this.supabase
              .from('intent_observation_mapping')
              .select('observation_code, crop_code, assertion_strength, is_active')
              .eq('intent_code', intentCode)
              .in('crop_code', cropScopes)
              .eq('assertion_strength', 'LITERAL')
              .eq('is_active', true);

            if (iomErr) {
              console.warn(`⚠️ [INTENT_IOM_FALLBACK] db_error intent=${intentCode} error=${iomErr.message}`);
            } else if (Array.isArray(iomRows) && iomRows.length > 0) {
              // Prefer crop-scoped rows; fall back to universal
              const cropCodeLower = String(landContext.current_crop).toLowerCase();
              const cropScoped = iomRows.filter((r: any) => String(r.crop_code).toLowerCase() === cropCodeLower);
              const chosen = cropScoped.length > 0 ? cropScoped : iomRows;
              const injected: string[] = [];
              for (const r of chosen as any[]) {
                const obs = String(r.observation_code || '').trim();
                if (!obs) continue;
                if (allObservationsForPreAuth.has(obs)) continue;
                allObservationsForPreAuth.add(obs);
                authoredObservations.add(obs, ObservationAuthority.INFERRED, 'IOM_INTENT_TO_OBSERVATION');
                injected.push(obs);
              }
              if (injected.length > 0) {
                agentsUsed.push('IOM_INTENT_TO_OBSERVATION');
                console.log(
                  `🔗 [INTENT_IOM_FALLBACK] intent=${intentCode} crop=${cropCodeLower} ` +
                  `scope=${cropScoped.length > 0 ? 'CROP' : 'UNIVERSAL'} injected=[${injected.join(',')}] ` +
                  `source=intent_observation_mapping`,
                );
              } else {
                console.log(`ℹ️ [INTENT_IOM_FALLBACK] intent=${intentCode} rows=${iomRows.length} injected=0 (dedup)`);
              }
            } else {
              console.log(`ℹ️ [INTENT_IOM_FALLBACK] intent=${intentCode} crop=${landContext.current_crop} no_literal_peers_in_iom`);
              // Advisory-direct: if intent itself is a valid observation code (e.g. FERTILIZER_SCHEDULE),
              // inject it so the rule engine can match. Otherwise leave the observation set empty and
              // let clarification take over.
              if (directModeBypass) {
                allObservationsForPreAuth.add(intentCode);
                authoredObservations.add(intentCode, ObservationAuthority.INFERRED, 'ADVISORY_DIRECT_ROUTE');
                agentsUsed.push('ADVISORY_DIRECT_ROUTE');
                console.log(`🎯 [ADVISORY_DIRECT] intent=${intentCode} injected as observation (DIRECT bypass)`);
              }
            }
          } catch (e) {
            console.warn(`⚠️ [INTENT_IOM_FALLBACK] exception intent=${intentCode} error=${(e as Error).message}`);
          }
        }
      }
      
      // Add cross-crop symptoms if available
      const crossCropSymptomsList = crossCropSymptoms ? [...crossCropSymptoms] : [];
      
      // ═══════════════════════════════════════════════════════════════════════════
      // v6.0: Cross-crop symptoms injection — DB is authority, no hardcoded block-list.
      // The previous `TERMINAL_CODES_BLOCKED_FROM_INJECTION` hardcoded set was
      // agronomy-in-code that actively prevented `GERMINATION_FAILURE` from ever
      // reaching `hypothesis_conditions` for RICE_GERMINATION_FAILURE — the exact
      // regression tracked in the Marathi `भात अजून उगवले नाही` audit. Any code
      // the DB curator marked as a LITERAL peer for the active (intent, crop)
      // via `intent_observation_mapping` MUST be admissible; blocking is a
      // curator decision expressed via `intent_observation_mapping.is_active`,
      // never a static TS set. Kept the trace line for observability.
      // ═══════════════════════════════════════════════════════════════════════════
      if (crossCropSymptomsList.length > 0) {
        const injected: string[] = [];
        crossCropSymptomsList.forEach(sym => {
          allObservationsForPreAuth.add(sym);
          authoredObservations.add(sym, ObservationAuthority.SYNTHETIC, 'CROSS_CROP_MAPPER');
          injected.push(sym);
        });
        if (injected.length > 0) {
          console.log(`   🔗 [CrossCropFix] Injected ${injected.length} cross-crop symptoms (SYNTHETIC): ${injected.join(', ')}`);
        }
      }
      
      // STABILIZATION v4.0 ISSUE 4 Part C: Intent promotion respects confidence tiers
      if ((intentCode === 'UNKNOWN' || intentCode === 'UNKNOWN_OBSERVATION') && 
          allObservationsForPreAuth.size >= 2 && intentConf >= 0.35) {
        const prevIntent = intentCode;
        console.log(`   🔄 [IntentPromotion] ${prevIntent} -> REPORT_SYMPTOM (${allObservationsForPreAuth.size} observations present, conf=${(intentConf * 100).toFixed(0)}%)`);
      } else if ((intentCode === 'UNKNOWN' || intentCode === 'UNKNOWN_OBSERVATION') && 
          allObservationsForPreAuth.size >= 2) {
        console.log(`   ⚠️ [IntentPromotion] BLOCKED: confidence too low (${(intentConf * 100).toFixed(0)}%) for promotion`);
      }
      
      // v5.1: OBSERVATION PIPELINE CHECKPOINT — trace observation count through pipeline
      console.log(`   📊 [OBSERVATION_CHECKPOINT] Stage=POST_COLLECTION, count=${allObservationsForPreAuth.size}, codes=[${[...allObservationsForPreAuth].slice(0, 10).join(',')}]`);

      // ═══════════════════════════════════════════════════════════════════════
      // FORENSIC FIX — TRUE OBSERVATION HANDOFF (Fixes 1 + 2, late-binding)
      // ---------------------------------------------------------------------
      // The early OBSERVATION trace fires before the Language Interpreter /
      // induction / cross-crop enrichers add their evidence, so it reports
      // real_symptom_count=0 even when downstream discovers real symptoms
      // (e.g. POOR_GERMINATION at 95% conf). This second trace fires AFTER
      // allObservationsForPreAuth is fully populated and is the SSOT the
      // rule engine / decision graph will actually see. It also runs the
      // GRAPH_STATE_CORRUPTION invariant and the evidence→intent override
      // against the true merged set.
      // ═══════════════════════════════════════════════════════════════════════
      try {
        const mergedCodes = Array.from(allObservationsForPreAuth);
        const trueEvidence = classifyEvidence(mergedCodes);
        emitNodeTrace(traceId, 'OBSERVATION', {
          stage: 'POST_MERGE',
          canonical_count: mergedCodes.length,
          real_symptom_count: trueEvidence.real_symptom_count,
          ignored_metadata: trueEvidence.ignored_metadata_count,
          real_codes: trueEvidence.real_codes,
        });

        // FIX 2 (surgical) — symbolic evidence immutability. Once the
        // classifier confirmed real symptoms upstream, downstream handoffs
        // MUST preserve them. If the merged graph-facing set has lost every
        // real symptom, the handoff has corrupted state → loud invariant.
        if (realObsCountForSalvage > 0 && trueEvidence.real_symptom_count === 0) {
          console.error(
            `[GRAPH_EVIDENCE_LOSS][${traceId}] symbolic evidence dropped between ` +
            `EvidenceClassifier and GraphContext: pre_real=${realObsCountForSalvage} ` +
            `post_real=0 merged_size=${mergedCodes.length} — reinjecting from classifier`,
          );
          // Non-destructive recovery: re-seed from classifier so the graph
          // never runs on an empty symptom set when we already know one exists.
          try {
            const preEc = classifyEvidence(expandedObservationCodes || []);
            for (const code of preEc.real_codes) {
              if (!allObservationsForPreAuth.has(code)) {
                allObservationsForPreAuth.add(code);
                try { authoredObservations.add(code, ObservationAuthority.EXTRACTED, 'EVIDENCE_LOSS_RECOVERY'); } catch {/**/}
              }
            }
          } catch {/* non-fatal */}
        }
        if (trueEvidence.real_symptom_count === 0 && mergedCodes.length === 0) {
          console.warn(
            `[GRAPH_OBSERVATION_EMPTY][${traceId}] merged_set=0 — nothing entered graph`,
          );
        }

        // FIX 3 (surgical) — freeze intent after evidence extraction.
        // If ANY real farmer symptom exists, GENERAL_CROP_INFO / CROP_INFO /
        // GENERAL_QUERY / UNKNOWN are forbidden. Symptom evidence always
        // creates DIAGNOSTIC_INQUIRY — the intent is now sealed for the rest
        // of the turn (any later re-classification must respect this lock).
        const forbiddenAdvisory = new Set([
          'GENERAL_CROP_INFO', 'CROP_INFO', 'GENERAL_INFO', 'GENERAL_QUERY',
          'UNKNOWN', 'UNKNOWN_OBSERVATION',
        ]);
        // Re-classify against merged set (post-recovery) so the freeze uses truth.
        const postRecoveryEvidence = classifyEvidence(Array.from(allObservationsForPreAuth));
        if (postRecoveryEvidence.real_symptom_count > 0) {
          if (forbiddenAdvisory.has(intentCode)) {
            const from = intentCode;
            intentCode = 'DIAGNOSTIC_INQUIRY';
            console.log(
              `[INTENT_OVERRIDE_BY_EVIDENCE][${traceId}] ${from} → ${intentCode} ` +
              `reason=real_symptoms_present codes=[${postRecoveryEvidence.real_codes.slice(0, 6).join(',')}]`,
            );
          }
          // Publish frozen intent so downstream traces reflect the lock.
          try {
            emitNodeTrace(traceId, 'INTENT', {
              stage: 'INTENT_AFTER_EVIDENCE_LOCK',
              intent: intentCode,
              confidence: intentConf,
              real_observations: postRecoveryEvidence.real_symptom_count,
              frozen: true,
            });
          } catch {/**/}
        }

        // Fix 3 — biological contradiction now runs against classifier truth,
        // not any mutated graph state.
        try {
          const bio: BiologicalState | null = (landContext as any)?.biological_state ?? null;
          if (bio?.is_locked && bio?.growth_stage && trueEvidence.real_codes.length > 0) {
            const EMERGENCE_FAIL_OBS = new Set([
              'POOR_GERMINATION', 'GERMINATION_FAILURE', 'NO_GERMINATION',
              'NO_EMERGENCE', 'EMERGENCE_FAILURE', 'SEEDLING_DEATH', 'PLANT_DEATH',
            ]);
            const POST_ESTABLISHMENT_STAGES = new Set([
              'transplanting', 'tillering', 'vegetative', 'grand_growth',
              'flowering', 'reproductive', 'maturity', 'ripening', 'maturation', 'harvest',
            ]);
            const stageKey = String(bio.growth_stage).toLowerCase().trim().replace(/[\s-]+/g, '_');
            const contradicting = trueEvidence.real_codes.filter(c => EMERGENCE_FAIL_OBS.has(String(c).toUpperCase()));
            const sidecar = (this as any)._bioContradictionByLand as Map<string, BiologicalStateContradictionAudit> | undefined;
            if (contradicting.length > 0 && POST_ESTABLISHMENT_STAGES.has(stageKey) && !sidecar?.has(bio.land_id)) {
              const prevConf = typeof bio.confidence === 'number' ? bio.confidence : 0;
              const adjustedConf = Math.min(prevConf, 0.30);
              sidecar?.set(bio.land_id, {
                contradiction_flag: true,
                contradiction_codes: contradicting,
                stage_confidence_before_contradiction: prevConf,
                adjusted_confidence: adjustedConf,
                stage: bio.growth_stage,
                trace_id: traceId,
              });
              console.warn(
                `[BIO_STATE_CONTRADICTION][${traceId}] stage=${bio.growth_stage} ` +
                `obs=[${contradicting.join(',')}] prev_conf=${prevConf.toFixed(2)} ` +
                `new_conf=${adjustedConf.toFixed(2)} action=sidecar_confidence_downgrade`,
              );
            }
          }
        } catch { /* non-fatal */ }
      } catch (e) {
        console.warn(`[TRUE_OBSERVATION_TRACE][${traceId}] non-fatal: ${e instanceof Error ? e.message : String(e)}`);
      }


      // ═══════════════════════════════════════════════════════════════════════════
      // Phase I-8 — Seed the per-request ObservationLedger (append-only) from
      // the flat pre-auth set, freeze intent on the graph, and assert no drift.
      // Non-canonical (non UPPER_SNAKE) entries are recorded as SYMBOLIC_ID_LEAK
      // on the evidence ledger and skipped — never silently mutated into the
      // symbolic graph. This is the single SSOT entry-point for observations.
      // ═══════════════════════════════════════════════════════════════════════════
      try {
        const CANON_RE = /^[A-Z0-9_]+$/;
        const seenSeed = new Set<string>();
        for (const raw of allObservationsForPreAuth) {
          const code = typeof raw === 'string' ? raw : String(raw ?? '');
          if (!code || seenSeed.has(code)) continue;
          seenSeed.add(code);
          if (!CANON_RE.test(code)) {
            try {
              requestCtx.ledger.lose(
                'OBSERVATION_LEDGER_SEED',
                `non_canonical:${code}`,
                { code },
                'SYMBOLIC_ID_LEAK: non-canonical observation code rejected from graph ledger'
              );
            } catch {/* non-fatal */}
            continue;
          }
          try {
            graph.observation_ledger.append({
              observation_code: code,
              source: 'IOM',
              confidence: 0.7,
              actor: 'orchestrator:POST_COLLECTION',
            });
          } catch (e) {
            console.warn(
              `⚠️ [LEDGER_SEED] skip ${code}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
        if (intentCode && CANON_RE.test(intentCode) && !graph.intent_node) {
          try {
            graph.setIntent({
              intent_code: intentCode,
              confidence: typeof intentConf === 'number' ? intentConf : 0.5,
              source: 'orchestrator:POST_COLLECTION',
            });
          } catch (e) {
            console.warn(
              `⚠️ [GRAPH_INTENT] skip: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
        console.log(
          `[SSOT_TRACE][${traceId}] ledger_seed observations=${graph.observation_ledger.size()} ` +
            `intent=${graph.intent_node?.intent_code ?? 'NULL'}`
        );
        graphCp = assertNoGraphDrift(graph, graphCp, 'POST_COLLECTION');
      } catch (e) {
        if (e instanceof GraphStateDriftError || e instanceof SymbolicIdLeakError) {
          console.error(`🚨 ${e.name}: ${e.message}`);
          throw e;
        }
        console.warn(
          `⚠️ [LEDGER_SEED] non-fatal: ${e instanceof Error ? e.message : String(e)}`
        );
      }


      // ═══════════════════════════════════════════════════════════════════════════
      // Phase H — Fix 1: Direct-mode VETO on symptom signal.
      // Re-evaluate directModeBypass now that observations are extracted.
      // A symptom report mis-classified as GENERAL_CROP_INFO must NOT enter
      // GENERAL_INFO advisory routing. Content beats label.
      // ═══════════════════════════════════════════════════════════════════════════
      {
        const informativeNow = [...allObservationsForPreAuth].filter((c: string) => isInformativeObs(c));
        if (directModeBypass && informativeNow.length > 0 && !directHardBypass) {
          console.log(`   🛑 [DIRECT_MODE_VETO] Symptom signal detected (${informativeNow.length} informative obs) — overriding directModeBypass for intent=${intentCode}`);
          directModeBypass = false;
          bypassClarification = false;
        } else if (directHardBypass && informativeNow.length > 0) {
          // FORENSIC FIX (2026-07): Evidence beats intent contract. A symptom
          // report must never stay in advisory route just because the intent
          // metadata declared clarification_mode=DIRECT/max_rounds=0. Content
          // beats label — VETO applies even for hard bypass.
          console.log(`   🛑 [DIRECT_HARD_BYPASS_VETO] Symptom signal (${informativeNow.length} informative obs) overrides intent contract for intent=${intentCode}`);
          directModeBypass = false;
          bypassClarification = false;
        }

        // Fix F: For DIRECT-hard intents (e.g. GENERAL_CROP_INFO), seed the rule
        // engine input with IOM-allowed observations so the advisory comes from
        // the curated intent×crop×stage×DAS set instead of the raw intent code.
        if (directHardBypass) {
          try {
            // ═══════════════════════════════════════════════════════════════
            // PHASE-1 OBSERVATION-BEATS-INTENT GUARD
            // If the farmer's observation stream carries stress/failure signals
            // (POOR_GERMINATION, EMERGENCE_FAILURE, PLANT_DEATH, …), block the
            // "healthy_crop"-style IOM enrichment path. Never allow the graph
            // to hold POOR_GERMINATION + healthy_crop simultaneously.
            // ═══════════════════════════════════════════════════════════════
            const STRESS_MARKERS = [
              'POOR_GERMINATION', 'GERMINATION_FAILURE', 'NO_EMERGENCE', 'EMERGENCE_FAILURE',
              'SEEDLING_DIED', 'PLANT_DIED', 'PLANT_DEATH', 'DEAD_SEEDLINGS',
              'ESTABLISHMENT_FAILURE', 'CROP_FAILURE', 'PATCHY_DAMAGE',
              'WILTING_SEVERE', 'PLANT_DRYING', 'PLANT_STUNTED',
            ];
            const HEALTHY_MARKERS = new Set([
              'healthy_crop', 'HEALTHY_CROP', 'HEALTHY_PLANT', 'NORMAL_GROWTH',
              'variety_query', 'stage_general',
            ]);
            const stressPresent = [...allObservationsForPreAuth].some(
              (c: string) => STRESS_MARKERS.includes(String(c).toUpperCase())
            );
            const bioStage = ((landContext as any)?.biological_state?.growth_stage
              ?? (canonicalContext as any)?.growth_stage ?? '').toString().toUpperCase();
            if (stressPresent) {
              console.warn(
                `🚨 [BIOLOGICAL_CONTRADICTION] stress observations present ` +
                  `(${[...allObservationsForPreAuth].filter((c: string) => STRESS_MARKERS.includes(String(c).toUpperCase())).join(', ')}) ` +
                  `at stage=${bioStage || 'UNKNOWN'} — blocking DIRECT_HARD_IOM_SEED of healthy/general observations.`
              );
              agentsUsed.push('BIOLOGICAL_CONTRADICTION_GUARD');
            } else {
              const { loadIOMAllowed } = await import('../decision/iom-gate.ts');
              const _crop = (
                (landContext as any)?.current_crop ||
                (canonicalContext as any)?.crop_code ||
                (canonicalContext as any)?.crop ||
                ''
              ).toString().toLowerCase();
              const _stage = (
                (landContext as any)?.growth_stage ||
                (canonicalContext as any)?.growth_stage ||
                (canonicalContext as any)?.stage ||
                null
              );
              const _das = (
                (landContext as any)?.days_after_sowing ??
                (canonicalContext as any)?.das ??
                null
              );
              const iomSeed = await loadIOMAllowed(this.supabase, intentCode, _crop, _stage, _das);
              const topAllowed = iomSeed.allowedRanked
                .filter(r => !HEALTHY_MARKERS.has(r.observation_code))
                .slice(0, 5);
              for (const r of topAllowed) {
                const code = r.observation_code;
                if (!allObservationsForPreAuth.has(code)) {
                  allObservationsForPreAuth.add(code);
                  authoredObservations.add(code, ObservationAuthority.INFERRED, 'DIRECT_HARD_IOM_SEED');
                }
              }
              agentsUsed.push('DIRECT_HARD_IOM_SEED');
              console.log(`   🌱 [DIRECT_HARD_IOM_SEED] intent=${intentCode} crop=${_crop} stage=${_stage} das=${_das} → seeded ${topAllowed.length} IOM observations: ${topAllowed.map(r => r.observation_code).join(', ')}`);
            }
          } catch (e) {
            console.warn(`   ⚠️ [DIRECT_HARD_IOM_SEED] failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // STABILIZATION v4.0 ISSUE 5: Authority-Based Coverage Calculation
      // Phase H — Fix 3: confirmed-only, *_UNKNOWN placeholders excluded.
      // ═══════════════════════════════════════════════════════════════════════════
      const authorityBasedCodes = authoredObservations.getConfirmedAndExtractedCodes();
      const informativeAuthorityCodes = authorityBasedCodes.filter((c: string) => isInformativeObs(c));
      const evidenceCoverage = computeCoverage(informativeAuthorityCodes);
      console.log(`   📊 Evidence coverage (CONFIRMED+EXTRACTED, informative-only): ${(evidenceCoverage * 100).toFixed(0)}% (${informativeAuthorityCodes.length}/${authorityBasedCodes.length} informative)`);
      
      // REFINEMENT 3: Functional coverage gate - blocks diagnosis if evidence too low
      let shouldBlockDiagnosis = false;
      if (evidenceCoverage < 0.25 && !isSymptomFreeRoute && !bypassClarification) {
        console.log(`   [COVERAGE_GATE] Evidence coverage too low (${(evidenceCoverage * 100).toFixed(0)}%) -- blocking diagnosis, forcing clarification`);
        shouldBlockDiagnosis = true;
      }
      
      // BUG 5 FIX: Pass authority metadata into canonical state for rule evaluator
      // Separate confirmed/extracted observations from inferred/synthetic
      const confirmedObsCodes = authoredObservations.getConfirmedAndExtractedCodes();
      const syntheticObsCodes = [...allObservationsForPreAuth].filter(
        code => !confirmedObsCodes.includes(code)
      );
      console.log(`   📊 [AuthoritySplit] Confirmed+Extracted: ${confirmedObsCodes.length}, Synthetic: ${syntheticObsCodes.length}`);
      
      // Log authority breakdown
      console.log(`   📊 [ObservationAuthority] ${authoredObservations.toSummary()}`);

      // ═══════════════════════════════════════════════════════════════════════════
      // Phase H — Canonical ConversationState (frozen, single runtime authority)
      // Computed exactly once. Every downstream module should read from this.
      // ═══════════════════════════════════════════════════════════════════════════
      const __advisoryIntentForState =
        ADVISORY_DIRECT_ROUTES.has(queryRoute.route as string) ||
        isAdvisoryRoute(intentCode);
      const __stageForState =
        (landContext as any)?.growth_stage ||
        (canonicalContext as any)?.stage ||
        null;
      const __stageSourceForState =
        (landContext as any)?.growth_stage ? 'landContext'
        : (canonicalContext as any)?.stage  ? 'crop_stage_master'
        : 'default';
      const __cropForState =
        (landContext as any)?.current_crop ||
        (canonicalContext as any)?.crop ||
        (landContext as any)?.crop_name ||
        null;
      const __dasForState =
        (landContext as any)?.days_after_sowing ??
        (canonicalContext as any)?.das ??
        null;
      const conversationState: ConversationState = buildConversationState({
        trace_id: traceId,
        intent: String(intentCode || 'UNKNOWN'),
        intent_confidence: Number(intentConf || 0),
        advisory_intent: __advisoryIntentForState,
        confirmed: confirmedObsCodes,
        inferred:  syntheticObsCodes,
        hypotheses: [],
        stage: __stageForState,
        stage_source: __stageSourceForState,
        crop:  __cropForState,
        das:   __dasForState,
        semantic_status: 'OK',
        authority_status: authoredObservations.toSummary?.() || 'UNCONFIRMED',
      });
      (this as any).__conversationState = conversationState; // accessible to trace emit
      console.log(`   🧊 [CONVERSATION_STATE] frozen mode=${conversationState.mode} clarify=${conversationState.clarification_required}(${conversationState.clarification_reason}) coverage=${conversationState.coverage.toFixed(2)} confirmed=${conversationState.confirmed.length} unknown=${conversationState.unknown.length}`);
      // NOTE: The primary [BRAIN_TRACE] emit was here. It ran BEFORE the
      // hypothesis graph (see L~4811), which meant `hyp` was always 0.
      // The single authoritative emit is now downstream of the POST_RULE
      // stage so hyp/candidates/eligible/winner reflect real graph state.

      // Phase H — Fix 2: ConversationState owns clarification. Sync the
      // legacy boolean so downstream gates stay consistent without recomputing.
      if (conversationState.clarification_required && !bypassClarification) {
        shouldBlockDiagnosis = shouldBlockDiagnosis || true;
      }
      
      // v5.0: Use AUTHORITY-AWARE crop damage detection (only CONFIRMED+EXTRACTED trigger terminal gate)
      // Expose real observation count for [ORCHESTRATOR_EXIT] boundary audit
      try {
        (this as any)._lastRealObservations = Array
          .from(allObservationsForPreAuth)
          .filter((c) => isRealObservation(String(c)));
      } catch { /* audit-only, never throw */ }
      const cropDamageResult = detectCropDamageWithAuthority(
        authoredObservations,
        crossCropSymptomsList
      );
      
      // v5.1: REMOVED legacy v4 resolveDiagnosticAuthorityFromObservations — dual detector caused
      // INFERRED/SYNTHETIC codes to incorrectly trigger terminal damage via the flat allObservationsForPreAuth set.
      // cropDamageResult (v5, authority-aware) is now the SOLE authority source.
      
      // v5.1: Enforced authority derived ONLY from authority-aware v5 detector
      let enforcedAuthorityDecision = cropDamageResult.enforced_authority 
        ? createEnforcedCropAuthority(cropDamageResult.damage_observations, allObservationsForPreAuth)
        : undefined;
      
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
      }
      // v5.1: Removed legacy v4 terminal damage path (preAuthorityResult.nlu_bypassed)
      // Authority-aware v5 detector handles all terminal detection with proper authority filtering.
      
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
      
      // v5.1: `preAuthorityResult.nlu_bypassed` removed — authority-aware crop damage detector is the SSOT.
      // Defensive guard against any future scope drift.
      const shouldActivateDiagnosisMode = diagnosisOnlyCheck.activate || 
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
        console.log(`   NLU_GATING=${cropDamageResult.nlu_gating_disabled ? 'DISABLED' : 'ENABLED'}`);
        console.log(`   Clarification=${cropDamageResult.diagnosis_mode === 'DIAGNOSIS_ONLY' ? 'SKIPPED' : 'OPTIONAL'}`);
        console.log(`════════════════════════════════════════════════════════════════\n`);
      }
      
      // If Diagnosis-Only Mode is activated, SKIP CLARIFICATION entirely
      // v5.1: Removed preAuthorityResult.nlu_bypassed — using only v5 authority-aware detector
      let diagnosisOnlyModeActive = cropDamageResult.diagnosis_mode === 'DIAGNOSIS_ONLY' || 
        diagnosisOnlyCheck.activate || 
        cropDamageResult.nlu_gating_disabled;
      let bypassClarificationForTerminalDamage = diagnosisOnlyModeActive;
      
      // v4.0: For DIAGNOSIS_WITH_CLARIFICATION, allow optional confirmation but still run rules
      let diagnosisWithOptionalClarification = cropDamageResult.diagnosis_mode === 'DIAGNOSIS_WITH_CLARIFICATION';

      // ═══════════════════════════════════════════════════════════════════════════
      // TASK 2 — INTENT AUTHORITY OVERRIDE (Step 8 route-authority fix)
      // Any intent that inherently requires agronomic reasoning MUST route through
      // the symbolic diagnosis graph. The general query router cannot downgrade a
      // symbolic intent to GENERAL_INFO / advisory-only. This is what unblocks
      // EMERGENCE_FAILURE, PEST, DISEASE, NUTRIENT_STRESS, WILTING, YELLOWING,
      // CROP_DAMAGE, GERMINATION_FAILURE, REPORT_SYMPTOM from being silently
      // shunted into the LLM narration lane without OBS_TO_HYP / HYP_TO_RULE /
      // RULE_RESULT ever emitting.
      // ═══════════════════════════════════════════════════════════════════════════
      const isDiagnosticIntent = requiresAgronomicReasoningIntent(intentCode);
      const mandatoryGraphRealObsCount = Array
        .from(allObservationsForPreAuth)
        .filter((c) => isRealObservation(String(c))).length;
      // PATCH 1 (Mandatory Graph Gate — broadened):
      // Any signal that could produce agronomic reasoning MUST enter the graph:
      //   • diagnostic intent (EMERGENCE_FAILURE, PEST, DISEASE, …)
      //   • diagnosis mode / crop-damage activation
      //   • ANY real observation in the pre-auth set
      //   • ANY confirmed/inferred symbolic observation
      //   • Land context with a live crop (advisory-style diagnostic queries
      //     like "भात अजून उगवले नाही" where NLU may not extract observations
      //     but the graph still owns the answer)
      const _confirmedObsSignal = (confirmedObsCodes?.length ?? 0) > 0 ||
        (syntheticObsCodes?.length ?? 0) > 0;
      const _landCropSignal = !!(landContext && (landContext as any).current_crop);
      const mustExecuteDecisionGraph = isDiagnosticIntent ||
        shouldActivateDiagnosisMode ||
        cropDamageResult.requires_diagnosis ||
        mandatoryGraphRealObsCount > 0 ||
        _confirmedObsSignal ||
        (_landCropSignal && !__advisoryIntentForState);
      if (isDiagnosticIntent && !diagnosisOnlyModeActive && !diagnosisWithOptionalClarification) {
        console.log(
          `🧭 [INTENT_AUTHORITY] Diagnostic intent=${intentCode} confidence=${(intentConf ?? 0).toFixed(2)} ` +
          `route=${queryRoute.route} → forcing SYMBOLIC_DIAGNOSIS graph pipeline`,
        );
        diagnosisWithOptionalClarification = true;
        // Route authority: router cannot pin diagnostic intents to GENERAL_INFO.
        if (queryRoute.route === 'GENERAL_INFO') {
          (queryRoute as any).route = 'PEST_DISEASE_TREATMENT';
          queryRoute.confidence = Math.max(queryRoute.confidence, 0.9);
          console.log(`🧭 [ROUTE_AUTHORITY] Overrode GENERAL_INFO → PEST_DISEASE_TREATMENT (intent=${intentCode})`);
        }
        agentsUsed.push('INTENT_AUTHORITY_OVERRIDE');
      }
      // Hard invariant — never allow a diagnostic intent to run without the graph branch.
      if (isDiagnosticIntent && queryRoute.route === 'GENERAL_INFO' && !diagnosisWithOptionalClarification && !diagnosisOnlyModeActive) {
        throw new Error(`ROUTE_AUTHORITY_VIOLATION: diagnostic intent=${intentCode} but route=GENERAL_INFO`);
      }
      
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
      
      // v5.1: HARD INVARIANT CHECK - crop damage MUST have CROP authority
      if (shouldActivateDiagnosisMode && (cropDamageResult.enforced_authority || diagnosisOnlyCheck.enforced_authority)) {
        const resolvedAuthority = cropDamageResult.enforced_authority || 
          diagnosisOnlyCheck.enforced_authority;
        
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
      }

      if (mustExecuteDecisionGraph) {
        if (!diagnosisWithOptionalClarification || directHardBypass) {
          console.log(
            `🧭 [MANDATORY_GRAPH_GATE] trace=${traceId} intent=${intentCode} ` +
            `realObs=${mandatoryGraphRealObsCount} diagnosisMode=${shouldActivateDiagnosisMode} ` +
            `directHardBypass=${directHardBypass} action=executeDecisionGraph`,
          );
        }
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
          const bioForGraph: BiologicalState | null = (landContext as any)?.biological_state ?? null;
          const cropCode =
            bioForGraph?.crop_code?.toUpperCase?.() ||
            canonicalContext?.crop_code ||
            landContext?.current_crop?.toUpperCase() ||
            'UNKNOWN';
          const growthStage =
            bioForGraph?.growth_stage ||
            canonicalContext?.growth_stage ||
            landContext?.growth_stage ||
            'UNKNOWN';
          const graphGrowthStage = growthStage && String(growthStage).toUpperCase() !== 'UNKNOWN'
            ? growthStage
            : null;

          // ═══════════════════════════════════════════════════════════════════
          // Phase Y — Fix C: bridge generic NLU codes (poor_germination,
          // germination_failure, …) into the crop's IOM canonical vocabulary
          // (obs_rice_no_emergence, …) BEFORE hypothesis evaluation. Without
          // this, rice extracts emit "physiology" codes that the rice IOM
          // ("phenology") allowlist will never match, and the diagnosis
          // pipeline reaches for unrelated diseases like Tungro.
          // ═══════════════════════════════════════════════════════════════════
          // ═══════════════════════════════════════════════════════════════════
          // OBSERVATION BRIDGE — DB-BACKED (observation_aliases)
          // Freezes evidence just before hypothesis evaluation:
          //   real_codes                = raw farmer-derived symbols (EXTRACTED)
          //   canonical_observation_codes = DB-resolved canonical codes (INFERRED)
          // No hardcoded agronomy in TS. All mappings come from
          // public.observation_aliases (see decision/concept-bridge.ts).
          // ═══════════════════════════════════════════════════════════════════
          const { bridgeCodesDb, resolveCropCanonicalObservations } = await import('../decision/concept-bridge.ts');
          const raw_evidence_codes: string[] = [...allObservationsForPreAuth].map((o) => String(o));
          const real_codes: string[] = raw_evidence_codes.filter((code) => isRealObservation(code));
          const ignoredRawCodes: string[] = raw_evidence_codes.filter((code) => !isRealObservation(code));
          const evidenceContext = {
            action_taken: !ignoredRawCodes.some((c) => String(c).trim().toUpperCase() === 'ACTION_NONE'),
            photo: !ignoredRawCodes.some((c) => String(c).trim().toUpperCase() === 'PHOTO_NOT_PROVIDED'),
            crop_identified: ignoredRawCodes.some((c) => String(c).trim().toUpperCase() === 'CROP_IDENTIFIED'),
            metadata: ignoredRawCodes,
          };
          const bridged = await bridgeCodesDb(this.supabase, cropCode, real_codes);
          const bridgedCanonical: string[] = bridged.map((b) => b.canonical_code);

          // TURN_EVIDENCE_LOCK — ledger: INFERRED entries for any DB-bridged code
          for (const b of bridged) {
            if (b.source === 'observation_aliases' && b.canonical_code !== b.raw_code) {
              authoredObservations.add(
                b.canonical_code,
                ObservationAuthority.INFERRED,
                'OBSERVATION_ALIASES_BRIDGE',
              );
            }
          }

          // ═══════════════════════════════════════════════════════════════════
          // CROP CANONICAL RESOLVE — intent_observation_mapping LITERAL peers
          // Expands generic canonical codes (e.g. `poor_germination`) into
          // their crop-specific LITERAL peers (e.g. `obs_rice_no_emergence`)
          // whenever the anchor member is confirmed by the farmer. No
          // hardcoded agronomy — see decision/concept-bridge.ts.
          // ═══════════════════════════════════════════════════════════════════
          const resolved = await resolveCropCanonicalObservations(
            this.supabase,
            intentCode,
            cropCode,
            bridgedCanonical,
          );
          const resolvedCanonicalCodes: string[] = resolved.map((r) => r.code);
          const canonical_observation_codes: string[] = resolvedCanonicalCodes.filter((code) => isRealObservation(code));
          const ignoredCanonicalCodes: string[] = resolvedCanonicalCodes.filter((code) => !isRealObservation(code));
          const frozenContext = {
            ...evidenceContext,
            metadata: Array.from(new Set([...evidenceContext.metadata, ...ignoredCanonicalCodes])),
          };
          for (const r of resolved) {
            if (r.source === 'iom_literal_peer') {
              authoredObservations.add(
                r.code,
                ObservationAuthority.INFERRED,
                'IOM_LITERAL_PEER',
              );
            }
          }

          Object.freeze(real_codes);
          Object.freeze(canonical_observation_codes);
          console.log(`   🔒 [TURN_EVIDENCE_LOCK] real=${real_codes.length} bridged=${bridgedCanonical.length} canonical=${canonical_observation_codes.length}`);

          // STEP 8 — EVIDENCE_FREEZE ledger trace (single SSOT for the turn)
          const ledger = canonical_observation_codes.map((c) => ({
            code: c,
            source: real_codes.includes(c) ? 'FARMER_LITERAL' : 'INFERRED',
            confidence: real_codes.includes(c) ? 1 : 0.8,
          }));
          assertDecisionGraphOrder(this as any, traceId, 'POST_EVIDENCE_FREEZE');
          (this as any)._evidenceFrozen = true;
          (this as any)._lastIntentCode = intentCode;
          console.log(
            `[POST_EVIDENCE_FREEZE] trace=${traceId} sequence=1 observations=[${canonical_observation_codes.slice(0, 12).join(',')}] ` +
              `context=${JSON.stringify(frozenContext)} source=farmer count=${ledger.length}`,
          );

          const currentObservations = canonical_observation_codes;
          if (real_codes.length !== currentObservations.length ||
              real_codes.some((c, i) => c !== currentObservations[i])) {
            console.log(`   🔗 [CONCEPT_BRIDGE] ${cropCode}: ${real_codes.join(',')} → ${currentObservations.join(',')}`);
          }

          // ═══════════════════════════════════════════════════════════════════
          // STEP 8 — HYPOTHESIS GRAPH EVALUATOR (DB graph discovery)
          // Walks observation_master → hypothesis_conditions → hypothesis_master
          // → hypothesis_rule_mapping. Emits [OBS_TO_HYP]. Its candidate_rule_ids
          // are used later as a curated scope for the layered rule evaluator.
          // The existing evaluateCandidateHypotheses + CausalHypothesisEngine
          // remain in the chain (arbitration/ranking) as the plan requires.
          // ═══════════════════════════════════════════════════════════════════
          let graphHypothesisRuleIds: string[] = [];
          let graphHypothesisEdgeMissing: string[] = [];
          try {
            const { evaluateHypothesisGraph } = await import('../decision/hypothesis-graph-evaluator.ts');
            const graphInput = {
              crop_code: cropCode ?? null,
              crop_group: cropCode ?? null,
              growth_stage: graphGrowthStage,
              das: (typeof (canonicalContext as any)?.days_since_sowing === 'number'
                ? (canonicalContext as any).days_since_sowing
                : ((typeof (landContext as any)?.days_since_sowing === 'number')
                  ? (landContext as any).days_since_sowing
                  : null)),
              observation_codes: currentObservations,
              supabase: this.supabase,
              trace_id: traceId,
            };
            const graphOut = await evaluateHypothesisGraph(graphInput);
            for (const c of graphOut.candidates) {
              for (const rid of c.candidate_rule_ids) {
                if (rid) graphHypothesisRuleIds.push(rid);
              }
              if (c.candidate_rule_ids.length === 0) graphHypothesisEdgeMissing.push(c.hypothesis_id);
            }
            graphHypothesisRuleIds = Array.from(new Set(graphHypothesisRuleIds));
            (this as any)._graphHypothesisResult = graphOut;
            (this as any)._graphHypothesisRuleIds = graphHypothesisRuleIds;
            (this as any)._graphHypothesisEdgeMissing = graphHypothesisEdgeMissing;
            console.log(
              `   🧭 [HYP_GRAPH] survived=${graphOut.candidates.length} eliminated=${graphOut.eliminated.length} candidate_rule_ids=${graphHypothesisRuleIds.length} edge_missing=${graphHypothesisEdgeMissing.length}`,
            );
            (this as any)._graphExecuted = true;

            // ─── SNAPSHOT (Engine B merge) ────────────────────────────────
            // If Engine A already produced a snapshot this turn, merge it
            // with the Engine B result so a stage-filter kill on B never
            // overwrites a valid A hypothesis. If Engine A has not run yet
            // (diagnosis-first path arrives later) the snapshot is created
            // from Engine B alone and Engine A merges into it on arrival.
            try {
              const priorSnap = (this as any)._graphSnapshot as GraphRuntimeSnapshot | undefined;
              const engineAForMerge = priorSnap
                ? { candidates: priorSnap.hypotheses.map(h => ({
                    rule_id: h.id,
                    confidence: h.confidence,
                    matched_conditions: [...h.matched_conditions],
                    candidate_rule_ids: [...h.candidate_rule_ids],
                  })) }
                : null;
              const merged = buildGraphRuntimeSnapshot({
                trace_id: traceId,
                observations: (currentObservations ?? []) as string[],
                engineA: engineAForMerge as any,
                engineB: { candidates: graphOut.candidates as any },
              });
              (this as any)._graphSnapshot = merged;
              console.log(
                `[GRAPH_RUNTIME] snapshot trace=${traceId} observations=${merged.observations.length} ` +
                `hypotheses=${merged.hypotheses.length} winner=${merged.hypotheses[0]?.id ?? 'none'} ` +
                `rules=${merged.rules.length} state=${merged.graph_state} merge=engineB`,
              );
            } catch (snapErr) {
              console.warn(`[GRAPH_SNAPSHOT] engineB merge non-fatal: ${(snapErr as Error).message}`);
            }

            // ═══════════════════════════════════════════════════════════════
            // PATCH 1 (BUG 1) — Project graph result back onto ConversationState
            // so downstream readers (BRAIN_TRACE, decision builder, invariants)
            // see the real hypothesis count instead of the placeholder [] set
            // at buildConversationState time.
            // ═══════════════════════════════════════════════════════════════
            try {
              const hypIds = graphOut.candidates
                .map((c: any) => String(c?.hypothesis_id ?? '').trim())
                .filter(Boolean);
              const cs: any = (this as any).__conversationState ?? conversationState;
              if (cs) {
                cs.hypotheses = Object.freeze(hypIds) as ReadonlyArray<string>;
              }
              (this as any)._graphHypothesisIds = hypIds;
              (this as any)._graphObsToHypEdges = graphOut.candidates.reduce(
                (n: number, c: any) => n + (Array.isArray(c?.matched_observations)
                  ? c.matched_observations.length
                  : (Array.isArray(c?.required_evidence) ? c.required_evidence.length : 0)),
                0,
              );

              // PATCH 3 (BUG 3) — Orchestrator-boundary [OBS_TO_HYP] trace so
              // a single grep on trace= reconstructs the full edge chain.
              const obsSample = (currentObservations ?? []).slice(0, 12).join(',');
              const hypSample = hypIds.slice(0, 12).join(',');
              assertDecisionGraphOrder(this as any, traceId, 'OBS_TO_HYP');
              console.log(
                `[OBS_TO_HYP] trace=${traceId} obs=[${obsSample}] hyp=[${hypSample}] ` +
                `sequence=2 survived=${graphOut.candidates.length} eliminated=${graphOut.eliminated.length} ` +
                `edge_missing=${graphHypothesisEdgeMissing.length}`,
              );

              // PATCH 2 (BUG 2) — Graph handoff invariant. If the graph produced
              // hypotheses but ConversationState is empty, the handoff is broken.
              if (graphOut.candidates.length > 0 && cs && cs.hypotheses.length === 0) {
                throw new Error(
                  `GRAPH_RESULT_DROPPED: graph=${graphOut.candidates.length} state=0 trace=${traceId}`,
                );
              }
            } catch (projErr) {
              if ((projErr as Error).message?.startsWith('GRAPH_RESULT_DROPPED') ||
                  (projErr as Error).message?.startsWith('GRAPH_ORDER_ERROR')) throw projErr;
              console.warn(`[GRAPH_PROJECTION] non-fatal: ${(projErr as Error).message}`);
            }
          } catch (e) {
            if ((e as Error).message?.startsWith('GRAPH_RESULT_DROPPED') ||
                (e as Error).message?.startsWith('GRAPH_ORDER_ERROR')) throw e;
            const graphErrMessage = (e as Error).message ?? String(e);
            const nonFatalNoSurvivorGraph =
              graphErrMessage.startsWith('STAGE_FILTER_KILLED_VALID_DIAGNOSIS') ||
              graphErrMessage.includes('NO_SURVIVING_HYPOTHESIS') ||
              graphErrMessage.includes('REQUIRED_STAGE_FAILED') ||
              graphErrMessage.includes('REQUIRED_DAS_FAILED');

            console.warn(`   ⚠️ [HYP_GRAPH] evaluator skipped: ${graphErrMessage}`);
            if (nonFatalNoSurvivorGraph) {
              // The graph ran far enough to establish that DB-curated stage/DAS
              // constraints exhausted the candidate set. That is a valid graph
              // result, not a bypass. Mark sequence=2 so downstream invariants
              // and the index-level audit do not convert it into HTTP 500.
              try {
                assertDecisionGraphOrder(this as any, traceId, 'OBS_TO_HYP');
              } catch (orderErr) {
                if ((orderErr as Error).message?.startsWith('GRAPH_ORDER_ERROR')) throw orderErr;
              }
              (this as any)._graphExecuted = true;
              (this as any)._graphHypothesisResult = {
                candidates: [],
                eliminated: [],
                input_observations: currentObservations,
                trace_id: traceId,
                timings_ms: 0,
              };
              (this as any)._graphHypothesisIds = [];
              (this as any)._graphHypothesisRuleIds = [];
              (this as any)._graphHypothesisEdgeMissing = [];
              (this as any)._graphExhaustedReason = graphErrMessage;
              console.warn(
                `[OBS_TO_HYP] trace=${traceId} obs=[${(currentObservations ?? []).slice(0, 12).join(',')}] ` +
                `hyp=[] sequence=2 survived=0 eliminated=unknown edge_missing=0 ` +
                `reason=GRAPH_CONTEXT_EXHAUSTED`,
              );
            }
            // TASK 1 — GRAPH INVARIANT: diagnostic intents cannot silently
            // continue when the hypothesis graph did not execute. Fail closed.
            if (isDiagnosticIntent && !(this as any)._graphExecuted) {
              throw new Error(`GRAPH_PIPELINE_BYPASSED: diagnostic intent=${intentCode} but hypothesis graph evaluator threw: ${graphErrMessage}`);
            }
          }
          // Hard graph invariant — even if the try above resolved without an
          // exception, if it never actually ran (e.g., early return refactor),
          // fail closed for diagnostic intents.
          if (isDiagnosticIntent && !(this as any)._graphExecuted) {
            throw new Error(`GRAPH_PIPELINE_BYPASSED: diagnostic intent=${intentCode} but [OBS_TO_HYP] was never emitted`);
          }



          // ═══════════════════════════════════════════════════════════════════
          // T1/T9 · BUILD IMMUTABLE GRAPH TRUTH + CANONICAL HASH
          // Runs exactly once per turn, right after evidence lock. Downstream
          // hypothesis / rule engines read from this node; same agronomic
          // meaning MUST produce the same hash regardless of query wording.
          // ═══════════════════════════════════════════════════════════════════
          try {
            const bioState: any = (landContext as any)?.biological_state ?? null;
            const graphTruth = buildGraphTruth({
              land_id: options.landId ?? landContext?.id ?? null,
              crop_code: cropCode ?? landContext?.current_crop ?? null,
              variety_id: (landContext as any)?.crop_variety_id
                ?? (landContext as any)?.crop_variety
                ?? null,
              biological_stage: bioState?.growth_stage
                ?? canonicalContext?.growth_stage
                ?? landContext?.growth_stage
                ?? null,
              stage_uuid: bioState?.stage_uuid ?? null,
              DAS: (typeof canonicalContext?.days_since_sowing === 'number'
                ? canonicalContext.days_since_sowing
                : (typeof landContext?.days_since_sowing === 'number'
                    ? landContext.days_since_sowing
                    : null)),
              GDD: (typeof bioState?.gdd_accumulated === 'number' ? bioState.gdd_accumulated : null),
              canonical_observations: canonical_observation_codes,
              evidence_sources: real_codes.map((c) => ({
                code: c,
                authority: 'CONFIRMED' as const,
                source: 'EXTRACTOR',
              })),
            });
            // Attach to closure state for downstream stages
            (this as any)._graphTruth = graphTruth;
          } catch (e) {
            console.warn(`[GRAPH_TRUTH_BUILD] skipped: ${(e as Error).message}`);
          }



          // ═══════════════════════════════════════════════════════════════════════════
          // CRITICAL BUG FIX: DAS propagation - use ?? (nullish) not || (falsy)
          // Also add robust fallback chain with logging to trace DAS source
          // ═══════════════════════════════════════════════════════════════════════════
          const resolvedDAS = canonicalContext?.days_since_sowing 
            ?? landContext?.days_since_sowing 
            ?? lockedCropContext?.days_since_sowing 
            ?? (options.sessionState?.lockedCropContext as any)?.days_since_sowing
            ?? null;
          
          console.log(`   📊 Running hypothesis evaluation for ${cropCode}/${growthStage}...`);
          console.log(`   📊 DAS resolved: ${resolvedDAS} (canonical=${canonicalContext?.days_since_sowing}, land=${landContext?.days_since_sowing}, locked=${lockedCropContext?.days_since_sowing})`);
          console.log(`   📊 Observations (${currentObservations.length}): ${currentObservations.slice(0, 5).join(', ') || 'none'}`);

          // T1 — GraphTruth integrity check before hypothesis engine
          assertGraphTruthIntegrity((this as any)._graphTruth, 'PRE_HYPOTHESIS_ENGINE');

          // T3 — Hypothesis engine reads GraphTruth authority directly.
          // GraphTruth.canonical_observations is the frozen ontology-resolved set
          // (observation_master codes via observation_aliases + IOM peers). Any
          // divergence between currentObservations and this set means an upstream
          // mutator ran after the evidence lock — trace it, then trust GraphTruth.
          const _gtForHyp = (this as any)._graphTruth as import('../runtime/graph-truth.ts').GraphTruth | null;
          const hypObservations: string[] = _gtForHyp
            ? [..._gtForHyp.canonical_observations]
            : currentObservations;
          if (_gtForHyp) {
            const a = [...currentObservations].sort().join(',');
            const b = [..._gtForHyp.canonical_observations].sort().join(',');
            if (a !== b) {
              console.warn(`[GRAPH_OBS_DRIFT] site=PRE_HYPOTHESIS pipe=[${a}] graph=[${b}] — using GraphTruth`);
            }
          }

          // PR-2: single graph entrypoint. `runGraphRuntime` owns the
          // [GRAPH_RUNTIME] trace emission AND flips `_graphExecuted` on
          // success via the markExecuted hook — no duplicate bookkeeping here.
          const _graphRun = await runGraphRuntime({
            supabase: this.supabase,
            graph_truth: _gtForHyp,
            crop_code: (_gtForHyp?.crop_code ?? cropCode) as any,
            growth_stage: (_gtForHyp?.biological_stage ?? growthStage) as any,
            days_since_sowing: (_gtForHyp?.DAS ?? resolvedDAS) as any,
            ndvi_level: landContext?.ndvi?.level,
            ndvi_trend: landContext?.ndvi?.trend,
            known_observations: hypObservations,
            user_query: farmerMessage,
            trace_id: traceId,
            intent_code: intentCode,
            // Phase F — variety-aware resistance modulation
            variety_id: (_gtForHyp?.variety_id
              ?? (landContext as any)?.current_crop_variety_id
              ?? (landContext as any)?.variety_id
              ?? null),
            markExecuted: () => { (this as any)._graphExecuted = true; },
          });
          const hypothesisResult = _graphRun.result;

          agentsUsed.push('HYPOTHESIS_EVALUATOR');

          // ─── SNAPSHOT (Engine A) ─────────────────────────────────────────
          // Build the initial immutable snapshot from Engine A. Engine B
          // (evaluateHypothesisGraph) runs earlier in the pipeline — if its
          // result was stored, merge it in here so the snapshot never loses
          // hypotheses just because one engine produced zero candidates.
          try {
            const engineB = (this as any)._graphHypothesisResult ?? null;
            const snap = buildGraphRuntimeSnapshot({
              trace_id: traceId,
              observations: (currentObservations ?? []) as string[],
              engineA: { candidates: hypothesisResult.candidates as any },
              engineB: engineB ? { candidates: engineB.candidates ?? [] } : null,
            });
            (this as any)._graphSnapshot = snap;
            console.log(
              `[GRAPH_RUNTIME] snapshot trace=${traceId} observations=${snap.observations.length} ` +
              `hypotheses=${snap.hypotheses.length} winner=${snap.hypotheses[0]?.id ?? 'none'} ` +
              `rules=${snap.rules.length} state=${snap.graph_state}`,
            );
          } catch (snapErr) {
            console.warn(`[GRAPH_SNAPSHOT] engineA build non-fatal: ${(snapErr as Error).message}`);
          }

          console.log(`   🎯 Found ${hypothesisResult.candidates.length} candidate hypotheses (pre-IOM)`);

          // ═══════════════════════════════════════════════════════════════════
          // IOM AUDIT ONLY: intent_observation_mapping is an observation
          // discovery layer, not hypothesis authority. The graph result stays
          // owned by hypothesis_conditions + hypothesis_master.
          // ═══════════════════════════════════════════════════════════════════
          try {
            // T1 — GraphTruth integrity check before IOM gate
            assertGraphTruthIntegrity((this as any)._graphTruth, 'PRE_IOM_GATE');
            const { loadIOMAllowed, filterHypothesesByIOM } = await import('../decision/iom-gate.ts');

            const iomIntent = intentCode || (intentMetaFromDB as any)?.intent_code || 'GENERAL_CROP_INFO';
            const iom = await loadIOMAllowed(this.supabase, iomIntent, cropCode, growthStage, resolvedDAS);
            const { kept, dropped } = filterHypothesesByIOM(hypothesisResult.candidates as any[], iom.allowedSet, iom.traceMeta);
            if (dropped.length > 0 && iom.allowedSet.size > 0) {
              hypothesisResult.candidates = kept as typeof hypothesisResult.candidates;
              console.log(`   🛡️ [IOM_GATE] ${kept.length} candidates kept after enforcement (${dropped.length} dropped — including any leaked diagnosis like Tungro on ungerminated rice)`);
            }
          } catch (iomErr) {
            console.warn(`   ⚠️ [IOM_GATE] enforcement failed (continuing without IOM filter): ${iomErr instanceof Error ? iomErr.message : iomErr}`);
          }

          
          // Generate diagnosis-first response
          let diagnosisFirstOutput: DiagnosisFirstOutput | null = null;
          
          // v1.1.0: Build farmer location for regional translation
          const farmerLocation = landContext ? {
            state: landContext.state || 'Maharashtra',
            district: landContext.district || 'Pune',
            tehsil: landContext.tehsil || undefined,
            language: options.language || 'mr'
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
               language: options.language || 'mr',
              damage_observations: cropDamageResult.damage_observations,
              trace_id: traceId,
              farmer_location: farmerLocation,
              supabaseClient: this.supabase
            });
          } else {
            // No candidates - generate UNKNOWN diagnosis response
            console.log(`   ⚠️ No hypothesis candidates - generating UNKNOWN diagnosis`);
            diagnosisFirstOutput = createUnknownDiagnosisResponse(
              cropCode,
              growthStage,
              cropDamageResult.damage_observations,
              options.language || 'mr',
              traceId
            );
          }
          
          if (diagnosisFirstOutput && !(this as any)._evidenceFrozen) {
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
            let diagnosisOptions = clarificationFormat.options.map((opt: any) => ({
              label: opt.label,
              value: opt.value || opt.label,
              observation_key: opt.observation_key || opt.value,
              description: opt.description,
              diagnostic_power: opt.diagnostic_power || 'MEDIUM'
            }));

            // ═══════════════════════════════════════════════════════════════════
            // Phase Y — Fix G: never leak guardrail / block-rule labels into the
            // farmer-facing option list. Internal labels like
            // "A blocking rule is active." or "Block all CIB&RC banned chemicals
            // on rice" must be filtered out before translation. This is a
            // belt-and-braces filter in addition to the upstream sanitizers.
            // ═══════════════════════════════════════════════════════════════════
            const GUARDRAIL_LABEL_PATTERNS = [
              /blocking rule is active/i,
              /\bblock\b.*\b(cib&?rc|banned|chemical|pesticide|fertili[sz]er)/i,
              /\bcib&?rc\b/i,
              /^block\s+all\b/i,
              /^guardrail[:\s]/i,
              /^risk[_\s]safety/i,
            ];
            const isGuardrailLabel = (s: string) =>
              typeof s === 'string' && GUARDRAIL_LABEL_PATTERNS.some((re) => re.test(s));
            const preFilter = diagnosisOptions.length;
            diagnosisOptions = diagnosisOptions.filter(
              (o: any) => !isGuardrailLabel(o?.label) && !isGuardrailLabel(o?.observation_key),
            );
            if (diagnosisOptions.length !== preFilter) {
              console.warn(`   🛡️ [DIAG_FIRST] dropped ${preFilter - diagnosisOptions.length} guardrail labels from farmer-facing options`);
            }

            // ═══════════════════════════════════════════════════════════════════
            // GRAPH CONTRACT — Clarification options must originate from the
            // hypothesis graph: hypothesis_master → hypothesis_conditions →
            // observation_master → observation_translations. IOM is discovery
            // seed only inside the builder, never a direct UI source.
            // ═══════════════════════════════════════════════════════════════════
            try {
              const graphClarification = await buildHypothesisClarificationOptions({
                supabase: this.supabase,
                intent_code: intentCode,
                crop_code: cropCode,
                crop_stage: growthStage,
                DAS: (landContext as any)?.days_since_sowing ?? (landContext as any)?.das ?? null,
                language: options.language || 'mr',
                max: 5,
              });
              const contractOptions = graphClarification.options;
              if (contractOptions.length > 0) {
                diagnosisOptions = contractOptions.map((o) => ({
                  label: o.label,
                  value: o.value,
                  observation_key: o.observation_key,
                  observation_id: o.observation_id,
                  observation_code: o.observation_code,
                  hypothesis_id: o.hypothesis_id,
                  hypothesis_condition_id: o.hypothesis_condition_id,
                  graph_version: 'hypothesis_graph_v1',
                  source: 'hypothesis_graph',
                  description: undefined,
                  diagnostic_power: 'HIGH',
                }));
                console.log(
                  `   ✅ [CLARIFICATION_CONTRACT] diagnosis-first replaced with ${diagnosisOptions.length} hypothesis_graph options`,
                );
              } else {
                const allowed = new Set<string>();
                diagnosisOptions = assertClarificationContract(diagnosisOptions, allowed, {
                  intent: intentCode, crop: cropCode, stage: growthStage,
                });
                console.warn(
                  `   🛡️ [CLARIFICATION_CONTRACT] no hypothesis_graph candidates — diagnosis-first options dropped to preserve graph ownership`,
                );
              }
            } catch (contractErr) {
              console.error(`   ❌ [CLARIFICATION_CONTRACT] failed:`, contractErr);
              diagnosisOptions = [];
            }

            // FIX 33: Translate diagnosis-first options (was skipped - caused raw English codes in Marathi UI)
            try {
              diagnosisOptions = await translateClarificationOptions(
                diagnosisOptions,
                options.language || 'mr',
                this.supabase
              );
            } catch (transErr) {
              console.warn(`⚠️ [DIAG_FIRST] Translation failed, using raw labels: ${transErr}`);
            }

            
            if ((this as any)._evidenceFrozen && !(this as any)._ruleResultExists) {
              throw new Error(
                `GRAPH_ORDER_ERROR: trace_id=${traceId} expected=4 actual=${(this as any).__decisionGraphSequence ?? 0} ` +
                `stage=RULE_RESULT reason=diagnosis_first_return_before_rule_result`,
              );
            }
            console.log(`[CLARIFY_EXIT] site=EXIT_04_DIAGNOSTIC_CONFIRM trace=${(typeof traceId!=='undefined'?traceId:'?')} intent=${(typeof intentCode!=='undefined'?intentCode:'?')} crop=${(landContext?.current_crop) ?? '?'} stage=${(canonicalContext?.growth_stage) ?? '?'}`);
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
          if ((diagnosisFirstError as Error).message?.startsWith('GRAPH_ORDER_ERROR') ||
              (diagnosisFirstError as Error).message?.startsWith('GRAPH_PIPELINE_BYPASSED')) {
            throw diagnosisFirstError;
          }
          console.error(`   ❌ Diagnosis-first generation failed:`, diagnosisFirstError);
          // Fall through to standard clarification flow
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // STAGE 4B: UNDERSTANDING-BASED CLARIFICATION GATE
      // If understanding is insufficient, ask clarification BEFORE NLU
      // (SKIPPED if Diagnosis-Only Mode is active)
      // ═══════════════════════════════════════════════════════════════════════════
      // FIX (advisory routing): advisory routes (fertilizer / irrigation / spray-timing /
      // crop-health / general-info) never need symptom clarification. Reuse the same exempt
      // set as the Zero-Code Gate so the Understanding gate cannot ask "what are you observing?"
      // for a scheduling / nutrition question.
      const isAdvisoryRouteForGate =
        ADVISORY_DIRECT_ROUTES.has(queryRoute.route as string) ||
        intentMetaFromDB?.clarification_mode === 'DIRECT' ||
        isAdvisoryRoute(intentCode); // Fix 7: canonical-intent bypass
      if (isAdvisoryRouteForGate && understandingResult.clarification_required) {
        console.log(`   ✅ [ADVISORY_ROUTE_BYPASS_UNDERSTANDING_GATE] route=${queryRoute.route} intent=${intentCode} — skipping symptom clarification (understanding=${understandingResult.understanding_confidence})`);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // NEURO-SYMBOLIC INVARIANT: clarification cannot fire before the
      // hypothesis graph has executed. For diagnostic intents, if the
      // graph has NOT run yet (`_graphExecuted` set by the [OBS_TO_HYP]
      // stage above), UnderstandingChecker is downgraded to advisory —
      // ConversationState + graph evidence-gaps decide, not the checker.
      // Reference: mem://architecture/deterministic-response-return-invariant
      // and the current Marathi EMERGENCE_FAILURE regression trace.
      // ═══════════════════════════════════════════════════════════════════════
      const _graphHasRun = (this as any)._graphExecuted === true;
      const _evidenceHasFrozen = (this as any)._evidenceFrozen === true;
      const _ruleHasRun = (this as any)._ruleResultExists === true;
      const _convStateOk = (this as any).__conversationState
        && (this as any).__conversationState.clarification_required === false;
      // Scope-safe crop/stage locals for the log lines below. The `cropCode`
      // const declared inside the diagnosis-first try-block (line ~4828) is
      // OUT OF SCOPE here — referencing it caused
      // "ReferenceError: cropCode is not defined" in the UNDERSTANDING_GATE.
      const _logCropCode =
        (canonicalContext as any)?.crop_code ||
        (landContext as any)?.current_crop?.toUpperCase?.() ||
        (landContext as any)?.current_crop ||
        'UNKNOWN';
      const _logGrowthStage =
        (canonicalContext as any)?.growth_stage ||
        (landContext as any)?.growth_stage ||
        'UNKNOWN';

      if (understandingResult.clarification_required && isDiagnosticIntent && !_graphHasRun) {
        console.warn(
          `[SYMBOLIC_CONTRACT_VIOLATION] understanding_checker asked for clarification ` +
          `BEFORE hypothesis graph ran — demoting to advisory (intent=${intentCode} crop=${_logCropCode}). ` +
          `[CLARIFY_AUTHORITY] source=DEMOTED_CHECKER required=false reason=graph_before_clarification`,
        );
        understandingResult.clarification_required = false;
      } else if (understandingResult.clarification_required && _evidenceHasFrozen && !_ruleHasRun) {
        console.warn(
          `[SYMBOLIC_CONTRACT_VIOLATION] understanding_checker attempted pre-rule clarification ` +
          `after evidence freeze — demoting until RULE_RESULT (intent=${intentCode} crop=${_logCropCode}). ` +
          `[CLARIFY_AUTHORITY] source=GRAPH_RUNTIME required=false reason=rule_result_required`,
        );
        understandingResult.clarification_required = false;
      } else if (understandingResult.clarification_required && _convStateOk) {
        console.log(
          `[CLARIFY_AUTHORITY] source=CONVERSATION_STATE required=false reason=conv_state_sufficient ` +
          `intent=${intentCode} crop=${_logCropCode}`,
        );
        understandingResult.clarification_required = false;
      }

      if (understandingResult.clarification_required && !bypassClarification && !bypassClarificationForTerminalDamage && !isAdvisoryRouteForGate) {
        console.log(
          `[CLARIFY_EXIT] site=UNDERSTANDING_GATE trace=${traceId} intent=${intentCode} ` +
          `crop=${_logCropCode} stage=${_logGrowthStage} confidence=${understandingResult.understanding_confidence} ` +
          `missing=[${understandingResult.unknown_critical_fields?.join(',') ?? ''}] graph_ran=${_graphHasRun}`,
        );

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
          diagnosisRulesFired: false,
          farmerMessage: farmerMessage,
          // Phase J — Hand the frozen ConversationState to the clarification
          // subsystem so it stops reading legacy observation/session state.
          conversationState: (this as any).__conversationState,
          // R1 FIX — pass canonical intent_code so the clarification engine
          // can query intent_observation_mapping for curated observations.
          intent_code: intentCode
        };
        
        // P0 FIX: Properly await the async function (was causing Promise leak)
        const clarificationResponse = await generateScopedClarification(scopedClarificationInput);
        agentsUsed.push('SCOPED_CLARIFICATION');

        // ═══════════════════════════════════════════════════════════════════
        // v3 PHASE 4 — DECISION GRAPH NAVIGATOR ACTIVE-MODE OVERRIDE
        // ───────────────────────────────────────────────────────────────────
        // If the navigator flag is ACTIVE for this tenant and the navigator
        // produced a result (run earlier in the pipeline OR via a no-op
        // pre-pass below), swap the legacy clarification options for the
        // graph-pruning-ranked options. CONTEXT_CONTRADICTION /
        // INSUFFICIENT_EVIDENCE collapse to an empty option set so the
        // response collapses to a deterministic reconciliation prompt.
        // ═══════════════════════════════════════════════════════════════════
        try {
          // Pre-pass: trigger navigator now if it has not yet captured a
          // result (orchestrator-late shadow path may not have run yet on
          // this code branch). Safe — adapter swallows failures and skips
          // when prerequisites are missing.
          if (!(this as any).__navigatorOutput) {
            const navIntentEarly = intentCode || 'GENERAL_QUERY';
            (this as any).__navigatorOutput = await runDecisionGraphNavigator({
              supabase: this.getSupabase(),
              graph,
              intent_code: String(navIntentEarly),
              turn: 1,
              tenant_id: (canonicalState as any)?.tenant_id ?? null,
              runtimeTrace,
            }).catch(() => null);
          }
          const navOverride = await buildNavigatorOverride({
            supabase: this.getSupabase(),
            navOutput: (this as any).__navigatorOutput,
            language: normalizedInput.detected_language,
            max: 3,
            ctx: {
              intent: intentCode,
              crop: canonicalContext?.crop_code,
              stage: canonicalContext?.growth_stage || null,
              das: canonicalContext?.days_since_sowing ?? null,
            },
          });
          if (navOverride.override) {
            console.log(
              `[NAV_OVERRIDE][scoped] decision=${navOverride.decision} ` +
              `options=${(navOverride.labels || []).length} reason=${navOverride.reason}`,
            );
            clarificationResponse.options = navOverride.labels || [];
            (clarificationResponse as any).navigator_decision = navOverride.decision;
            (clarificationResponse as any).navigator_reason = navOverride.reason;
            (clarificationResponse as any).observation_keys = navOverride.observation_keys || [];
            clarificationResponse.validation_passed = true;
          }
        } catch (navOvrErr) {
          console.warn(
            `[NAV_OVERRIDE][scoped] non-fatal: ${navOvrErr instanceof Error ? navOvrErr.message : String(navOvrErr)}`,
          );
        }
        
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
            normalizedInput.detected_language
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
        
        console.log(`[CLARIFY_EXIT] site=EXIT_05_NLU_CLARIFY trace=${(typeof traceId!=='undefined'?traceId:'?')} intent=${(typeof intentCode!=='undefined'?intentCode:'?')} crop=${(landContext?.current_crop) ?? '?'} stage=${(canonicalContext?.growth_stage) ?? '?'}`);
        return {
          type: 'CLARIFICATION_QUESTION',
          session_id: sessionId,
          question: {
            question_id: `scoped_clarify_${Date.now()}`,
            text_mr: responseText,
            text_hi: responseText,
            text_en: responseText,
            options: await Promise.all(safeOptions.map(async (opt: any, idx: number) => {
              const rawLabel = typeof opt === 'string' ? opt : (opt.label || String(opt));
              const obsKey = (typeof opt === 'object' && opt) ? (opt.observation_key || opt.value || undefined) : undefined;
              return {
                value: String(idx + 1),
                label: rawLabel,
                observation_key: obsKey  // SYMBOLIC IDENTITY: preserve canonical code through to UI
              };
            })).then(async (opts) => {
              // Translate raw observation codes to farmer language WITHOUT dropping observation_key.
              const translated = await translateClarificationOptions(
                opts.map(o => ({ label: o.label, observation_key: o.observation_key })),
                options.language || 'mr',
                this.supabase
              );
              return opts.map((o, i) => {
                const t: any = translated[i];
                const newLabel = typeof t === 'string' ? t : (t?.label || o.label);
                return { ...o, label: newLabel };
              });
            })
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
      // [STEP 7 REMOVED] PHASE 1A.2 GDD Phenology + 1A.3 Photoperiod blocks.
      // Phenology is now resolved upstream by resolve_crop_phenology + runtime/phenology-reconciler
      // reading crop_stage_master / variety_phenology_profile / stage_transition_log.
      // Photoperiod sensitivity moved to crop_stage_master DB flags (Step 8).
      // ========================================
      const phenologyResult: any = null;
      
      // ========================================
      // PHASE 1A.4: INTENT LOCK - Enforce symbolic-first routing
      // Once locked, only rules scoped to this intent can be evaluated
      // ========================================
      console.log('\n🔒 PHASE 1A.4: Intent Lock Enforcement...');
      
      // Static imports at top of file
      
      // CRITICAL FIX v5.2: Prioritize SemanticExtractor intent (which correctly classifies via LLM)
      // over NLU Agent's primary_intent (which always returns UNKNOWN as it's a perception-only layer)
      const detectedIntent = semanticExtraction?.intent_code || 
                              nluOutput?.intent_classification?.primary_intent || 'GENERAL_QUERY';
      const intentConfidence = semanticExtraction?.intent_confidence || 
                                nluOutput?.intent_classification?.intent_confidence || 0.5;
      console.log(`   🔗 [IntentPropagation] semantic=${semanticExtraction?.intent_code}, nlu=${nluOutput?.intent_classification?.primary_intent}, final=${detectedIntent} (${(intentConfidence * 100).toFixed(0)}%)`);
      
      // Lock the intent for this turn
      // PR-7 F2 (log) + F6 (crop scope): pass land crop into lockIntent so the
      // crop-prefix compatibility check inside intent-lock.ts can flag mismatches.
      // Also surface router↔semantic disagreements — the pattern that let the
      // pipeline pick "GENERAL_INFO" to bypass gates but "COTTON_*" to filter rules.
      const routerIntentForLog = (queryRoute as any)?.route || 'UNKNOWN';
      const semanticIntentForLog = semanticExtraction?.intent_code || 'UNKNOWN';
      if (routerIntentForLog !== 'UNKNOWN' && semanticIntentForLog !== 'UNKNOWN' && routerIntentForLog !== semanticIntentForLog) {
        console.warn(
          `⚠️ [INTENT_ROUTER_DISAGREEMENT] router=${routerIntentForLog} semantic=${semanticIntentForLog} ` +
          `final=${detectedIntent} land_crop=${landContext?.current_crop || 'UNKNOWN'}`,
        );
      }
      const intentLock = lockIntent(detectedIntent, intentConfidence, {
        crop: landContext?.current_crop || landContext?.crop_code || null,
      });
      (this as any)._intentLock = intentLock;
      agentsUsed.push('INTENT_LOCK');
      // PHASE Y — record intent on collector
      try {
        const rt = getRuntimeTraceCollector();
        if (rt) { rt.context = { ...(rt.context || {}), intent: { code: detectedIntent, confidence: intentConfidence, crop_scope_rejected: !!intentLock.crop_scope_rejected } }; }
      } catch {}
      
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
        // STABILIZATION v4.0 ISSUE 3: Demote induction log - enrichment only, not routing authority
        console.log(`   🌾 Induction enrichment: ${inductionResult.symptoms.length} supplementary symbols (coverage=${(inductionResult.symbol_coverage * 100).toFixed(0)}%)`);
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
        !bypassClarification &&
        !isSymptomFreeRoute  // Irrigation/crop health/weather queries don't need symptoms
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
      // CRITICAL FIX: Symptom-free routes (irrigation, crop health, etc.) MUST NOT be blocked by clarification
      const shouldPrepareClarification = !isSymptomFreeRoute && (
        (clarificationTrigger.should_clarify && !clarificationTrigger.bypass_allowed) || 
        (inductionNeedsClarification || (legacyNeedsClarification && !inductionBasedBypass))
      );
      
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
            language: options.language || 'mr',
            supabaseClient: this.supabase,
            // Phase F — variety-aware resistance modulation
            variety_id: (landContext as any)?.current_crop_variety_id
              ?? (landContext as any)?.variety_id
              ?? null,
          };
          
          ruleDrivenClarification = await fetchRuleDrivenClarificationOptions(ruleDrivenInput);

          // ═══════════════════════════════════════════════════════════════
          // v3 PHASE 4 — NAVIGATOR ACTIVE-MODE OVERRIDE (rule-driven path)
          // ───────────────────────────────────────────────────────────────
          // Same contract as the scoped path: when the navigator flag is
          // ACTIVE and the navigator produced ranked evidence, swap the
          // rule-driven options for graph-pruning-ranked ones.
          // ═══════════════════════════════════════════════════════════════
          try {
            if (!(this as any).__navigatorOutput) {
              const navIntentRD = intentCode || 'GENERAL_QUERY';
              (this as any).__navigatorOutput = await runDecisionGraphNavigator({
                supabase: this.getSupabase(),
                graph,
                intent_code: String(navIntentRD),
                turn: 1,
                tenant_id: (canonicalState as any)?.tenant_id ?? null,
                runtimeTrace,
              }).catch(() => null);
            }
            const navOverrideRD = await buildNavigatorOverride({
              supabase: this.getSupabase(),
              navOutput: (this as any).__navigatorOutput,
              language: options.language || 'mr',
              max: 3,
              ctx: {
                intent: intentCode,
                crop: lockedStage?.crop_code,
                stage: lockedStage?.growth_stage || null,
              },
            });
            if (navOverrideRD.override) {
              console.log(
                `[NAV_OVERRIDE][rule_driven] decision=${navOverrideRD.decision} ` +
                `options=${(navOverrideRD.options || []).length} reason=${navOverrideRD.reason}`,
              );
              if (navOverrideRD.decision === 'ASK' && (navOverrideRD.options?.length || 0) > 0) {
                ruleDrivenClarification = {
                  options: (navOverrideRD.options || []).map(o => ({
                    label: o.label,
                    observation_key: o.observation_key,
                  })),
                } as any;
              } else {
                // CONTEXT_CONTRADICTION / INSUFFICIENT_EVIDENCE → drop options;
                // downstream NLU fallback path handles the empty case.
                ruleDrivenClarification = null;
              }
            }
          } catch (navOvrRDErr) {
            console.warn(
              `[NAV_OVERRIDE][rule_driven] non-fatal: ${navOvrRDErr instanceof Error ? navOvrRDErr.message : String(navOvrRDErr)}`,
            );
          }

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
          // Translate rule-driven option labels to farmer language
          const translatedRuleOptions = await translateClarificationOptions(
            ruleDrivenClarification.options.map(o => ({ label: o.label, observation_key: o.observation_key })),
            options.language || 'mr',
            this.supabase
          );
          finalClarificationOptions = translatedRuleOptions.map(o => typeof o === 'string' ? o : o.label);
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
          language: options.language || 'mr',
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
      // NOTE: Reusing hasSymptoms from line 2109 (already declared in this scope)
      
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
          language: options.language || 'en',
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
        
        assertGraphTruthIntegrity((this as any)._graphTruth, 'PRE_RESPONSE_BUILDER');
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
        
        // Phase 5 — integrity check before projection.
        assertGraphTruthIntegrity((this as any)._graphTruth, 'PRE_CANONICAL_STATE');

        // Strip metadata (CROP_IDENTIFIED, *_UNKNOWN, PHOTO_NOT_PROVIDED, ACTION_*, CONTEXT_*)
        // so downstream rule/hypothesis engines never see it as evidence.
        const _rawObsForBuild = allObservationsForPreAuth && allObservationsForPreAuth.size > 0
          ? Array.from(allObservationsForPreAuth)
          : (uniqueSymptomCodes.length > 0 ? uniqueSymptomCodes : inductionSymptoms);
        const _realObsForBuild = classifyEvidence(_rawObsForBuild).real_codes;

        canonicalState = buildCanonicalState({
          landContext,
          soilData: landContext?.soil_health,
          ndviData: landContext?.ndvi ? {
            value: landContext.ndvi.value || landContext.ndvi.mean_ndvi,
            trend: landContext.ndvi.ndvi_trend,
            captured_at: landContext.ndvi.captured_at
          } : undefined,
          weatherData: fusedIntelligence.weather_data,
          gddResult: gddResultForCanonical,
          farmerObservations: _realObsForBuild,
          nluOutput: nluOutput
        });

        // Phase 5 — GraphTruth is the sole authority for crop / stage / observations.
        // Overwrite those three fields with the frozen node so no upstream
        // inference (induction, NLU, GDD, cropContextAuthority) can leak.
        projectCanonicalStateFromGraphTruth(canonicalState, (this as any)._graphTruth);

        // ═══════════════════════════════════════════════════════════════════════════
        // Step 2 — POST-PROJECTION MUTATION BLOCK COLLAPSED (was lines 6252-6277).
        //
        // Prior behaviour (removed):
        //   1. Re-wrote `canonicalState.crop_type` from `inductionCrop` (hardcoded
        //      keyword map in language-induction-layer.ts) when GraphTruth had
        //      already projected the DB-authoritative crop.
        //   2. Re-wrote `canonicalState.crop_type` / `.growth_stage` from
        //      `cropContextAuthority` (message-inference fallback) with the same
        //      leak semantics.
        //
        // These branches only fired when GraphTruth returned UNKNOWN/null — a
        // structural signal that the land has no bound crop or the DB has no
        // matching row. In that case the correct action is to raise
        // GRAPH_NEEDS_MORE_EVIDENCE downstream (Step 1 sentinel), NOT to graft
        // a parallel NLU brain's guess onto the frozen node.
        //
        // GraphTruth is now the ONLY writer to canonicalState.crop_type /
        // .growth_stage after line 6249. Any drift is logged for observability
        // but never repaired here.
        // ═══════════════════════════════════════════════════════════════════════════
        {
          const _gtForAudit = (this as any)._graphTruth as
            | import('../runtime/graph-truth.ts').GraphTruth
            | null;
          const projectedCrop = canonicalState.crop_type as unknown as string | null;
          const projectedStage = canonicalState.growth_stage as unknown as string | null;
          if (!projectedCrop || projectedCrop === 'UNKNOWN') {
            console.warn(
              `[GRAPH_TRUTH_ENFORCED] site=POST_PROJECTION crop is UNKNOWN after GraphTruth projection ` +
                `— refusing to overwrite from induction (${inductionCrop}) or cropContextAuthority ` +
                `(${cropContextAuthority?.crop_name ?? 'null'}). graph_hash=${_gtForAudit?.hash ?? 'null'} ` +
                `— downstream must emit GRAPH_NEEDS_MORE_EVIDENCE.`,
            );
          }
          if (!projectedStage || projectedStage === 'UNKNOWN') {
            console.warn(
              `[GRAPH_TRUTH_ENFORCED] site=POST_PROJECTION stage is UNKNOWN after GraphTruth projection ` +
                `— refusing to overwrite from cropContextAuthority ` +
                `(${cropContextAuthority?.growth_stage ?? 'null'}). graph_hash=${_gtForAudit?.hash ?? 'null'}.`,
            );
          }
        }


        
        // ═══════════════════════════════════════════════════════════════════════════
        // NEURO-SYMBOLIC CONTRACT: CanonicalState transports symbols only.
        // Removed hasTerminalDamage / induction override — the ontology
        // (observation_master + observation_aliases + concept-bridge) already
        // resolves farmer language into canonical codes before this point.
        // If a mutation is observed, canonical-state-builder logs
        // [CANONICAL_MUTATION_BLOCKED]; if evidence never reached the builder,
        // the fix belongs upstream in the extractor/bridge, not here.
        // ═══════════════════════════════════════════════════════════════════════════
        if ((!canonicalState.visual_symptom || canonicalState.visual_symptom === 'UNKNOWN' || canonicalState.visual_symptom === 'NONE') && uniqueSymptomCodes.length > 0) {
          const firstRealCode = uniqueSymptomCodes[0];
          console.log(`[GRAPH_NODE_TRACE] node=OBSERVATION real_count=${uniqueSymptomCodes.length} first=${firstRealCode} canonical_symptom=${canonicalState.visual_symptom}`);
          if (canonicalState.visual_symptom !== firstRealCode) {
            console.error(`[GRAPH_CONSISTENCY_ERROR] original=${firstRealCode} resolved=${canonicalState.visual_symptom} mutation_source=canonical_state_builder (evidence present but symptom UNKNOWN — check observation_aliases/concept-bridge)`);
          }
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
        // CRITICAL FIX: Use enriched canonical state crop (which includes induction result)
        // instead of raw cropContextAuthority which may be undefined
        const enrichedCropName = canonicalState.crop_type && canonicalState.crop_type !== 'UNKNOWN' 
          ? canonicalState.crop_type 
          : cropContextAuthority?.crop_name;
        
        const contextValidation = validateContextCompleteness({
          farmer_mentioned_crop: observationExtraction?.crop_mentioned || null,
          land_context: landContext,
          nlu_output: nluOutput,
          land_state: enrichedCropName && enrichedCropName !== 'UNKNOWN' 
            ? { crop: { crop_name: enrichedCropName } } as any
            : undefined  // Don't pass { crop_name: 'UNKNOWN' } - let farmer_mentioned_crop be used
        });
        
        if (contextValidation.status === 'NEEDS_CLARIFICATION') {
          console.log(`   ⚠️ G2 CONTEXT_COMPLETENESS: NEEDS_CLARIFICATION`);
          console.log(`      Reason: ${contextValidation.clarification_prompt || 'Missing critical context'}`);
          agentsUsed.push('G2_CONTEXT_VALIDATION_FAILED');
          
          // Return clarification for crop mismatch or missing context
          const lang = options.language || 'en';
          const clarificationPrompt = contextValidation.clarification_prompt || 
            'Which crop are you asking about?';
          
          console.log(`[CLARIFY_EXIT] site=EXIT_06_HYPOTHESIS_GAP trace=${(typeof traceId!=='undefined'?traceId:'?')} intent=${(typeof intentCode!=='undefined'?intentCode:'?')} crop=${(landContext?.current_crop) ?? '?'} stage=${(canonicalContext?.growth_stage) ?? '?'}`);
          return {
            type: 'CLARIFICATION_QUESTION',
            session_id: sessionId,
            question: {
              question_id: `g2_context_${Date.now()}`,
              text_mr: clarificationPrompt,
              text_hi: clarificationPrompt,
              text_en: clarificationPrompt,
              options: await (async () => {
                const rawOpts = contextValidation.clarification_options || [];
                const translated = await translateClarificationOptions(
                  rawOpts.map(o => ({ label: o.label, observation_key: (o as any).observation_key })),
                  lang,
                  this.supabase
                );
                return translated.map((opt, idx) => ({
                  value: String(idx + 1),
                  label: typeof opt === 'string' ? opt : opt.label
                }));
              })()
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
        // v5.1 BUG 3 FIX: Stage immutability guard — canonical stage MUST NOT be overridden
        if (contextValidation.reconciled_stage && contextValidation.stage_source !== 'DEFAULT') {
          if (canonicalContext?.is_locked && canonicalContext.growth_stage) {
            console.log(`   🔒 [STAGE IMMUTABILITY] Stage override BLOCKED — canonical stage locked: ${canonicalContext.growth_stage} (attempted: ${contextValidation.reconciled_stage} from ${contextValidation.stage_source})`);
          } else {
            console.log(`   📊 G2 Growth Stage: ${contextValidation.reconciled_stage} (source: ${contextValidation.stage_source})`);
            if (landContext) {
              // PHASE 1 — biological SSOT lock takes precedence over reconciler.
              if (!blockStageWriteIfLocked(landContext, 'context-validation-reconciler', contextValidation.reconciled_stage)) {
                landContext.growth_stage = contextValidation.reconciled_stage;
              }
            }
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
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 2.5.5: CAUSAL HYPOTHESIS ARBITRATION (NEW)
        // ═══════════════════════════════════════════════════════════════════════════
        console.log('\n🧠 PHASE 2.5.5: Causal Hypothesis Arbitration...');
        let hypothesisRuleScope: string[] | undefined = undefined;
        let hypothesisResult: any = undefined;

        // STABILIZATION v4.0 ISSUE 5 REFINEMENT 3: Coverage gate blocks diagnosis
        if (shouldBlockDiagnosis) {
          console.log(`   [COVERAGE_GATE] Skipping hypothesis arbitration and rule evaluation -- insufficient evidence`);
          console.log(`   Evidence coverage: ${(evidenceCoverage * 100).toFixed(0)}% (need >= 25%)`);
          // Skip arbitration entirely - will trigger clarification path downstream
        } else {
        try {
          // STABILIZATION v4.0 ISSUE 1: Fix cropCode crash + REFINEMENT 2 (fail hard)
          const hypothesisCrop = canonicalContext?.crop_code;
          if (!hypothesisCrop || hypothesisCrop === 'UNKNOWN') {
            throw new Error('FATAL_CANONICAL_CONTEXT_CORRUPTION: crop_code missing or UNKNOWN before hypothesis arbitration');
          }
          
          // Static import used (moved to top of file for edge function compatibility)
          hypothesisResult = await runCausalHypothesisArbitration({
            // Step 3 — GraphTruth is the sole authority; engine will override
            // crop_group and observations from the frozen node and log drift.
            graph_truth: (this as any)._graphTruth ?? null,
            crop_group: hypothesisCrop,
            canonical_state: canonicalState,
            observations: [...(allObservationsForPreAuth || [])],
            supabase_client: this.supabase,
            trace_id: traceId
          });


          if (hypothesisResult.needs_clarification && hypothesisResult.decision_path === 'CLARIFICATION_REQUIRED') {
            console.log(`   🔄 Hypothesis arbitration needs clarification: ${hypothesisResult.clarification_reason}`);
            
            // BUG 4 FIX: Even during clarification, scope rules to top hypothesis to prevent rule explosion
            // This prevents contradictory domains (smut, red rot, wilt, shoot borer) from all firing simultaneously
            if (hypothesisResult.best_hypothesis?.mapped_rule_ids?.length > 0) {
              hypothesisRuleScope = hypothesisResult.best_hypothesis.mapped_rule_ids;
              console.log(`   🎯 [ClarificationScope] Restricting to top hypothesis rules (${hypothesisRuleScope.length}) to prevent explosion`);
            }
          }

          if (hypothesisResult.decision_path === 'HYPOTHESIS_SCOPED' && hypothesisResult.best_hypothesis) {
            hypothesisRuleScope = hypothesisResult.best_hypothesis.mapped_rule_ids;
            console.log(`   🎯 Hypothesis scoped to ${hypothesisRuleScope.length} rules: ${hypothesisRuleScope.join(', ')}`);
          }
        } catch (hypothesisError) {
          console.error(`   ⚠️ Hypothesis arbitration failed, falling back to full scope:`, hypothesisError);
        }
        } // end of coverage gate else block

        // PHASE 2.6: LAYERED RULE EVALUATION (Symbolic Decision Brain)
        console.log('\n📊 PHASE 2.6: Layered Rule Evaluation (OBSERVATION → DIAGNOSIS → SAFETY → PRESCRIPTION)...');
        
        // Use unified crop code normalizer for consistent rule filtering
        const cropForRules = canonicalContext?.crop_code || lockedCropContext?.crop_name || '';
        const cropCodeForFilter = unifiedNormalizeCropCode(cropForRules).toLowerCase();
        const allRulesWithBundled = await getAllRulesWithBundled(cropCodeForFilter || undefined);
        console.log(`   📦 Total rules loaded: ${allRulesWithBundled.length} (crop=${cropCodeForFilter || 'ALL'})`);
        
        // ═══════════════════════════════════════════════════════════════════════════
        // DIAGNOSTIC PRE-FILTER (PART 7): When pest evidence is present, 
        // filter to PEST_MANAGEMENT rules first and rank above all others.
        // This prevents irrigation/nutrition rules from being primary when
        // DEAD_HEART, BORE_HOLES, or BORER evidence is detected.
        // ═══════════════════════════════════════════════════════════════════════════
        const PEST_EVIDENCE_CODES = new Set([
          'DEAD_HEART', 'DEAD_HEART_PRESENT', 'DEADHEART', 'DEAD_HEART_VISIBLE',
          'STEM_BORING_MARKS', 'BORE_HOLES', 'BORER_DAMAGE', 'STEM_BORING',
          'BORER_SUSPECTED', 'TUNNELS_IN_STEM', 'INTERNAL_TUNNEL',
          'FRASS_VISIBLE', 'FRASS', 'LARVAE_IN_STEM', 'BORER_LARVAE_VISIBLE',
          'INSECT_PRESENCE_CONFIRMED', 'PINK_LARVAE_VISIBLE'
        ]);
        const PEST_RULE_CATEGORIES = new Set([
          'pest', 'pest_management', '03_pest', 'ipm', 'borer', 'insect',
          'pest_control', 'biological_control'
        ]);
        
        const allObsForPreFilter = [...(allObservationsForPreAuth || [])];
        const hasPestPreFilterEvidence = allObsForPreFilter.some(obs => 
          PEST_EVIDENCE_CODES.has(String(obs).toUpperCase())
        );
        
        let rulesToEvaluate = allRulesWithBundled;
        let diagnosticPreFilterApplied = false;
        
        if (hasPestPreFilterEvidence) {
          console.log(`\n🎯 [DIAGNOSTIC_PRE_FILTER] Pest evidence detected in observations!`);
          console.log(`   Evidence: ${allObsForPreFilter.filter(o => PEST_EVIDENCE_CODES.has(String(o).toUpperCase())).join(', ')}`);
          
          // Filter to pest management rules
          const pestRules = allRulesWithBundled.filter((r: any) => {
            // v7.9 FIX: Coerce to string to prevent .toLowerCase() crash on non-string fields
            const cat = String(r.category || r.canonical_group || r.required_observation_category || '').toLowerCase();
            const condCode = String(r.condition_code || '').toLowerCase();
            return PEST_RULE_CATEGORIES.has(cat) || 
                   condCode.includes('borer') || condCode.includes('pest') ||
                   condCode.includes('shoot') || condCode.includes('insect');
          });
          
          if (pestRules.length > 0) {
            // Prepend pest rules at high priority, then keep remaining rules as fallback
            const nonPestRules = allRulesWithBundled.filter((r: any) => !pestRules.includes(r));
            rulesToEvaluate = [...pestRules, ...nonPestRules];
            diagnosticPreFilterApplied = true;
            console.log(`   ✅ [DIAGNOSTIC_PRE_FILTER] Prioritized ${pestRules.length} pest rules above ${nonPestRules.length} others`);
            agentsUsed.push('DIAGNOSTIC_PRE_FILTER_PEST');
          } else {
            console.warn(`   ⚠️ [DIAGNOSTIC_PRE_FILTER] No pest-category rules found, using full set`);
          }
        }
        
        // If hypothesis narrowed scope, filter rules (only if pre-filter didn't already apply)
        if (!diagnosticPreFilterApplied && hypothesisRuleScope && hypothesisRuleScope.length > 0) {
          const scopedRules = allRulesWithBundled.filter((r: any) => hypothesisRuleScope!.includes(r.id || r.rule_id));
          if (scopedRules.length > 0) {
            rulesToEvaluate = scopedRules;
            console.log(`   🎯 [HypothesisScope] Narrowed from ${allRulesWithBundled.length} to ${scopedRules.length} rules`);
          } else {
            console.warn(`   ⚠️ [HypothesisScope] No rules matched scope, falling back to full set`);
          }
        }
        
        // CRITICAL: Pass user_query to canonical state for keyword-based matching
        // FIX 3: For DIRECT-mode advisory intents, prepend intent code to user_query
        // so rule engine can match by action_type (e.g., FERTILIZER_SCHEDULE rules)
        const queryForRuleEngine = directModeBypass 
          ? `[INTENT:${intentCode}] ${farmerMessage}` 
          : farmerMessage;
        const canonicalStateWithQuery = {
          ...canonicalState,
          user_query: queryForRuleEngine,
          // BUG 5 FIX: Pass authority-separated observations for rule evaluator
          confirmed_observations: confirmedObsCodes,
          synthetic_observations: syntheticObsCodes
        };
        
        // PRODUCTION FIX: Pass PrescriptionGate override signal to confidence gate
        // When prescriptionGate.allowed=true despite LOW confidence, this relaxes
        // the evaluator's pre-selection threshold (0.60→0.40) so rules can fire
        const isPrescriptionGateOverride = prescriptionGate.allowed && 
          canonicalState.data_confidence === 'LOW';
        
        // Phase H — Fix 7: knowledge caches are now pre-loaded at request init.
        // This block is intentionally a no-op (single-source preload upstream).
        console.log('[KNOWLEDGE_PRELOAD] using request-init caches (Phase H Fix 7)');
        
        // ═══════════════════════════════════════════════════════════════════
        // PHASE C, GATE #2 — INTENT FILTER before scoring
        // Replaces direct evaluateRulesLayered() with an intent-filtered list.
        // Generic rules (rule_intent == null) survive but carry a penalty flag
        // that the layered scorer multiplies by 0.85 (see Phase D).
        // ═══════════════════════════════════════════════════════════════════
        const activeIntentForRules = (typeof intentCode !== 'undefined' && intentCode)
          ? String(intentCode) : 'GENERAL_QUERY';
        const rulesAfterIntent = filterRulesByIntent(rulesToEvaluate as any, activeIntentForRules);
        requestCtx.ledger.create('RULE_INTENT_FILTER', `intent:${activeIntentForRules}`,
          { input: rulesToEvaluate.length, kept: rulesAfterIntent.length });
        console.log(`   🎯 [INTENT_FILTER] intent=${activeIntentForRules} ${rulesToEvaluate.length} → ${rulesAfterIntent.length}`);

        // STEP 8 — narrow the intent-filtered set to hypothesis_rule_mapping edges.
        // Union NOT intersection: if the graph edge set is available and non-empty,
        // it is treated as the authoritative candidate scope. Fallback path (no edges)
        // keeps the existing intent-filtered set so unrelated flows are unaffected.
        const graphRuleIdSet = new Set<string>(((this as any)._graphHypothesisRuleIds ?? []) as string[]);
        const graphEdgeMissing: string[] = ((this as any)._graphHypothesisEdgeMissing ?? []) as string[];
        const _graphExecutedFlag = (this as any)._graphExecuted === true;
        const _graphSurvivors: any[] = ((this as any)._graphHypothesisResult?.candidates) ?? [];
        const _isDiagnosticIntentForScope = typeof isDiagnosticIntent !== 'undefined' ? !!isDiagnosticIntent : true;
        let rulesForEvaluator = rulesAfterIntent;
        if (graphRuleIdSet.size > 0) {
          const scoped = rulesAfterIntent.filter((r: any) =>
            graphRuleIdSet.has(String(r?.rule_id ?? r?.id ?? '')));
          if (scoped.length > 0) {
            rulesForEvaluator = scoped;
            console.log(`   🧭 [HYP_GRAPH_SCOPE] ${rulesAfterIntent.length} → ${scoped.length} (edges=${graphRuleIdSet.size})`);
          } else {
            console.warn(`   ⚠️ [HYP_GRAPH_SCOPE] graph edges present but none in intent-filtered set (${graphRuleIdSet.size} edges); blocking (Neuro-Symbolic invariant)`);
            rulesForEvaluator = [];
          }
        } else if (_graphExecutedFlag && _graphSurvivors.length === 0 && _isDiagnosticIntentForScope) {
          // ═══════════════════════════════════════════════════════════════════
          // NEURO-SYMBOLIC INVARIANT — GRAPH_SCOPE_BLOCKED
          // Graph executed, DB gates eliminated every hypothesis. A diagnostic
          // decision rule cannot fire without causal hypothesis lineage:
          //   OBSERVATION → HYPOTHESIS → RULE → DECISION
          // Force empty candidate pool so the layered evaluator returns 0
          // matched rules and the downstream stage-clarification path takes
          // over. Prevents leakage of unrelated PROACTIVE_* / global rules.
          // ═══════════════════════════════════════════════════════════════════
          const _blocked = rulesAfterIntent.length;
          rulesForEvaluator = [];
          (this as any)._graphScopeBlocked = {
            graphExecuted: true,
            hypothesisCount: 0,
            graphRuleEdges: 0,
            blockedRuleCount: _blocked,
            reason: 'NO_HYPOTHESIS_SURVIVED_DB_GATES',
          };
          console.warn(
            `[GRAPH_SCOPE_BLOCKED] trace=${traceId} intent=${activeIntentForRules} ` +
            `graphExecuted=true hypothesisCount=0 graphRuleEdges=0 ` +
            `blockedRuleCount=${_blocked} reason=NO_HYPOTHESIS_SURVIVED_DB_GATES`,
          );
        }
        const graphHypIdsForTrace: string[] = (((this as any)._graphHypothesisResult?.candidates) ?? []).map((c: any) => c.hypothesis_id);
        const hypToRuleReason = graphHypIdsForTrace.length === 0
          ? 'NO_HYPOTHESIS_EDGE'
          : (graphRuleIdSet.size === 0 ? 'HYPOTHESIS_RULE_EDGE_MISSING' : 'OK');
        if ((this as any)._evidenceFrozen) {
          // Diagnosis-first / early rule-engine paths may enter here without
          // the main hypothesis-graph loop having emitted [OBS_TO_HYP]. Advance
          // the sequence synthetically when we already have graph output so the
          // strict HYP_TO_RULE ordering check does not crash the turn.
          if (Number((this as any).__decisionGraphSequence ?? 0) === 1) {
            // REAL_GRAPH_PATH — no more `synthesized=true`. Emit an OBS_TO_HYP
            // line whose numbers come from the immutable snapshot. If the
            // snapshot is empty here the downstream GRAPH_PIPELINE_BYPASSED
            // guard fires; we no longer paper over the miss.
            assertDecisionGraphOrder(this as any, traceId, 'OBS_TO_HYP');
            const snap = (this as any)._graphSnapshot as GraphRuntimeSnapshot | undefined;
            const snapHyp = (snap?.hypotheses ?? []).map(h => h.id).slice(0, 12).join(',');
            console.log(
              `[OBS_TO_HYP] trace=${traceId} source=REAL_GRAPH_PATH ` +
              `hyp=[${snapHyp}] sequence=2 hypotheses=${snap?.hypotheses.length ?? 0} ` +
              `state=${snap?.graph_state ?? 'NO_HYPOTHESIS'}`,
            );
          }
          assertDecisionGraphOrder(this as any, traceId, 'HYP_TO_RULE');
        }
        console.log(
          `[HYP_TO_RULE] trace=${traceId} hyp=[${graphHypIdsForTrace.slice(0,12).join(',')}] ` +
          `candidate_rules=[${[...graphRuleIdSet].slice(0,12).join(',')}] ` +
          `missing_edges=[${graphEdgeMissing.slice(0,12).join(',')}] sequence=3 reason=${hypToRuleReason}`,
        );

        // T1 — GraphTruth integrity check before layered rule evaluator
        assertGraphTruthIntegrity((this as any)._graphTruth, 'PRE_LAYERED_RULE_EVALUATOR');

        // PR-7 F4: forensic snapshot of what actually reaches the layered
        // evaluator. Resolves the addendum §4 open item: log the exact rule
        // ids + intents + proactive count so a wrongly-included rule like
        // PROACTIVE_FLOOD_PREPAREDNESS_001 is attributable to a concrete
        // upstream stage (intent filter vs graph-scope vs pre-filter).
        try {
          const _rfe: any[] = rulesForEvaluator as any[];
          const _ids = _rfe.map(r => String(r?.rule_id ?? r?.id ?? '?')).slice(0, 20);
          const _intents = Array.from(new Set(_rfe.map(r => String(r?.rule_intent ?? 'null')))).slice(0, 10);
          const _proactive = _rfe.filter(r => String(r?.category ?? '').toLowerCase().startsWith('proactive_')).length;
          console.log(
            `[RULE_EVALUATOR_INPUT] trace=${traceId} count=${_rfe.length} ` +
            `proactive_count=${_proactive} intents=[${_intents.join(',')}] ` +
            `ids=[${_ids.join(',')}${_rfe.length > 20 ? ',…' : ''}]`,
          );
        } catch { /* diagnostic-only */ }

        layeredRuleResult = evaluateRulesLayered(rulesForEvaluator as any, canonicalStateWithQuery as any, {

          prescriptionGateOverride: isPrescriptionGateOverride,
          traceId: traceId
        });
        agentsUsed.push('LAYERED_RULE_EVALUATOR');

        // STEP 8 — [RULE_RESULT] trace + coverage-gap / edge-missing surfacing
        try {
          const winnerId = (layeredRuleResult?.primary_decision?.rule_id
            ?? (layeredRuleResult?.matched_responses?.[0] as any)?.rule_id
            ?? 'none');
          const coverageGap = ((layeredRuleResult?.rules_matched ?? 0) === 0);
          const reason = graphHypIdsForTrace.length === 0
            ? 'NO_HYPOTHESIS_EDGE'
            : coverageGap
            ? (graphRuleIdSet.size === 0 && graphEdgeMissing.length > 0 ? 'HYPOTHESIS_RULE_EDGE_MISSING' : 'RULE_COVERAGE_GAP')
            : (layeredRuleResult?.safety_blocks?.length ? 'safety_block' : 'match');
          (this as any)._ruleResultExists = true;
          if ((this as any)._evidenceFrozen) {
            assertDecisionGraphOrder(this as any, traceId, 'RULE_RESULT');
          }
          console.log(`[RULE_RESULT] trace=${traceId} sequence=4 winner=${winnerId} reason=${reason}`);
          (layeredRuleResult as any).coverage_gap = coverageGap ? 'RULE_COVERAGE_GAP' : null;
          (layeredRuleResult as any).edge_missing = graphEdgeMissing;
        } catch (ruleTraceErr) {
          if ((ruleTraceErr as Error).message?.startsWith('GRAPH_ORDER_ERROR')) throw ruleTraceErr;
          /* trace-only */
        }



        // ═══════════════════════════════════════════════════════════════════
        // Phase I-4 — Seed the per-request hypothesis_graph with
        // RuleCandidate nodes. Scores are mutated IN-PLACE downstream
        // (scientific gate, authority, completeness, ranking). Validators
        // never rebuild this list — they call candidate.score(...) /
        // candidate.drop(reason). Non-canonical rule_ids are skipped
        // (recorded as SYMBOLIC_ID_LEAK on the evidence ledger).
        // ═══════════════════════════════════════════════════════════════════
        try {
          const RULE_ID_RE = /^[A-Z0-9_]+$/;
          const safeApplied = Array.isArray(layeredRuleResult?.rules_applied)
            ? layeredRuleResult.rules_applied
            : [];
          const safeMatched = Array.isArray(layeredRuleResult?.matched_responses)
            ? layeredRuleResult.matched_responses
            : [];
          const candidateIds = new Set<string>();
          for (const id of safeApplied) {
            const s = typeof id === 'string' ? id : String(id ?? '');
            if (s) candidateIds.add(s);
          }
          for (const r of safeMatched) {
            const s = String((r as any)?.rule_id ?? (r as any)?.id ?? '');
            if (s) candidateIds.add(s);
          }
          const existingIds = new Set(graph.hypothesis_graph.map((c) => c.rule_id));
          for (const rid of candidateIds) {
            if (existingIds.has(rid)) continue;
            if (!RULE_ID_RE.test(rid)) {
              try {
                requestCtx.ledger.lose(
                  'HYPOTHESIS_GRAPH_SEED',
                  `non_canonical_rule:${rid}`,
                  { rule_id: rid },
                  'SYMBOLIC_ID_LEAK: non-canonical rule_id rejected from hypothesis_graph'
                );
              } catch {/* non-fatal */}
              continue;
            }
            try {
              const cand = new RuleCandidate(rid);
              const matched = safeMatched.find(
                (r: any) => (r?.rule_id ?? r?.id) === rid
              ) as any;
              if (matched) {
                const conf = Number(
                  matched.weighted_confidence ?? matched.confidence_score ?? 0
                );
                if (Number.isFinite(conf)) {
                  cand.score('semantic', Math.max(0, Math.min(1, conf)));
                }
                if (Array.isArray(matched.matched_observations)) {
                  cand.matched_observations = matched.matched_observations
                    .map((x: any) => String(x))
                    .filter((x: string) => /^[A-Z0-9_]+$/.test(x));
                }
                if (Array.isArray(matched.missing_observations)) {
                  cand.missing_observations = matched.missing_observations
                    .map((x: any) => String(x))
                    .filter((x: string) => /^[A-Z0-9_]+$/.test(x));
                }
              }
              const winnerId =
                layeredRuleResult?.primary_decision?.rule_id ??
                layeredRuleResult?.primary_decision?.application_details?.rule_id;
              if (winnerId && winnerId === rid) {
                cand.status = 'WINNER';
                cand.ranking = 1;
              }
              graph.hypothesis_graph.push(cand);
            } catch (e) {
              if (e instanceof SymbolicIdLeakError) {
                console.warn(`⚠️ [HYPOTHESIS_GRAPH] reject ${rid}: ${e.message}`);
              } else {
                console.warn(
                  `⚠️ [HYPOTHESIS_GRAPH] skip ${rid}: ${e instanceof Error ? e.message : String(e)}`
                );
              }
            }
          }
          const _seededCount = graph.hypothesis_graph.length;
          console.log(
            `[SSOT_TRACE][${traceId}] hypothesis_graph_seed candidates=${_seededCount} ` +
              `winner=${graph.hypothesis_graph.find((c) => c.status === 'WINNER')?.rule_id ?? 'NONE'}`
          );
          // Fix 4 — promotion invariant: candidate ids were produced by the
          // rule evaluator but must survive into the active hypothesis_graph
          // used downstream. If they collapse to zero the rule engine ran on
          // the wrong universe and silently picked the wrong branch.
          try {
            (graph as any).__hypothesis_seeded_count = _seededCount;
            const _candidatesFromEvaluator = candidateIds.size;
            if (_candidatesFromEvaluator > 0 && _seededCount === 0) {
              console.error(
                `[HYPOTHESIS_PROMOTION_LOST][${traceId}] evaluator_candidates=${_candidatesFromEvaluator} ` +
                `active=0 reason=all_dropped_during_seed`,
              );
            }
          } catch { /* invariant must not throw */ }


        } catch (e) {
          if (e instanceof GraphStateDriftError) {
            console.error(`🚨 ${e.name}: ${e.message}`);
            throw e;
          }
          console.warn(
            `⚠️ [HYPOTHESIS_GRAPH_SEED] non-fatal: ${e instanceof Error ? e.message : String(e)}`
          );
        }


        // ═══════════════════════════════════════════════════════════════════
        // v3 PHASE 2/3 — DECISION GRAPH NAVIGATOR (shadow + flag-gated)
        // ───────────────────────────────────────────────────────────────────
        // Always runs in SHADOW mode (logs navigator decision into
        // runtime_trace.navigator_shadow) so we can replay-compare against
        // the legacy clarification producers. When the
        // DECISION_GRAPH_NAVIGATOR env flag (or tenant allowlist) is ON the
        // adapter additionally marks the result as ACTIVE for downstream
        // consumers — orchestrator does NOT yet swap the response path
        // (that flip happens in Phase 4 of the migration plan).
        //
        // Fire-and-forget: failures are swallowed inside the adapter.
        // ═══════════════════════════════════════════════════════════════════
        try {
          const navIntent = (typeof intentCode !== 'undefined' && intentCode)
            ? String(intentCode) : (activeIntentForRules || 'GENERAL_QUERY');
          const navTurn = Number(
            (canonicalStateWithQuery as any)?.conversation_turn
              ?? (canonicalState as any)?.conversation_turn
              ?? 1,
          );
          const navOutput = await runDecisionGraphNavigator({
            supabase: this.getSupabase(),
            graph,
            intent_code: navIntent,
            turn: Number.isFinite(navTurn) && navTurn > 0 ? navTurn : 1,
            tenant_id: (canonicalState as any)?.tenant_id ?? null,
            runtimeTrace,
          });
          // v3 Phase 4 — expose to downstream emission sites for active-mode override.
          (this as any).__navigatorOutput = navOutput;
          console.log(
            `[NAVIGATOR_CAPTURE] active=${navOutput?.flag?.active} shadow=${navOutput?.flag?.shadow} ` +
            `ran=${navOutput?.ran} decision=${navOutput?.result?.decision || 'n/a'} ` +
            `skip=${navOutput?.skip_reason || 'none'}`,
          );
        } catch (navErr) {
          console.warn(
            `⚠️ [NAVIGATOR_SHADOW] non-fatal: ${navErr instanceof Error ? navErr.message : String(navErr)}`
          );
          (this as any).__navigatorOutput = null;
        }





        // ═══════════════════════════════════════════════════════════════════
        // PHASE C, GATE #3 — SCIENTIFIC VALIDATOR (after rules, before authority)
        // Cross-checks rule outputs against crop_baseline_guidelines_v2.
        // ═══════════════════════════════════════════════════════════════════
        try {
          const candidates: CandidateRecommendation[] = (layeredRuleResult.matched_responses || [])
            .map((r: any) => ({
              rule_id: r?.rule_id || r?.id || 'unknown',
              crop_code: String(canonicalState.crop_type || 'UNKNOWN'),
              growth_stage: canonicalState.crop_stage || null,
              ...(r?.numeric_claims || {}),
            }));
          if (candidates.length > 0) {
            await evaluateScientificGate({
              candidates,
              supabase: this.supabase,
              ledger: requestCtx.ledger,
              chain: requestCtx.chain,
            });
          } else {
            requestCtx.chain.set('scientific', 1);
          }
        } catch (sciErr) {
          console.warn('[SCIENTIFIC_GATE] non-fatal failure', sciErr instanceof Error ? sciErr.message : sciErr);
        }
        requestCtx.chain.set('rules',
          (layeredRuleResult.rules_matched || 0) > 0 ? 0.85 : 0.4);
        
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

        // Phase G — G7: one-line end-of-rule-stage BRAIN_TRACE
        try {
          const winner = layeredRuleResult.primary_decision;
          console.log(
            `[RULE_STAGE_TRACE] intent=${activeIntentForRules} ` +
            `crop=${canonicalState.crop_type ?? '?'} stage=${canonicalState.crop_stage ?? '?'} ` +
            `candidates_in=${rulesToEvaluate.length} after_intent=${rulesAfterIntent.length} ` +
            `evaluated=${layeredRuleResult.rules_evaluated || 0} matched=${layeredRuleResult.rules_matched || 0} ` +
            `winner=${winner?.rule_id ?? 'none'} winner_score=${(winner?.weighted_confidence ?? winner?.confidence_score ?? 0).toFixed?.(3) ?? 'n/a'} ` +
            `winner_action_text=${winner?.action_text ? 'present' : 'EMPTY'}`
          );
        } catch (_) { /* trace must never throw */ }

        // PATCH 5 (BUG 1) — Single authoritative [BRAIN_TRACE] emit, AFTER the
        // hypothesis graph AND the rule stage. Reads real hyp count from the
        // graph projection (see L~4836), not the empty placeholder built at
        // buildConversationState time.
        try {
          const _winner = layeredRuleResult?.primary_decision;
          const _snap = (this as any)._graphSnapshot as GraphRuntimeSnapshot | undefined;

          // Prefer the immutable snapshot over the legacy per-field projections.
          // If snapshot has hypotheses but the legacy projection is empty, the
          // corruption guard throws GRAPH_STATE_CORRUPTION_ERROR — fail loud.
          const _legacyHypIds: string[] = ((this as any)._graphHypothesisIds ?? []) as string[];
          const _hypIds: string[] = _snap
            ? _snap.hypotheses.map(h => h.id)
            : _legacyHypIds;
          const _obsToHyp: number = _snap
            ? _snap.hypotheses.reduce((n, h) => n + h.matched_conditions.length, 0)
            : Number((this as any)._graphObsToHypEdges ?? 0);
          const _hypToRule: number = _snap
            ? _snap.rules.length
            : ((this as any)._graphHypothesisRuleIds ?? []).length;
          const _cs = (this as any).__conversationState ?? conversationState;
          const _graphRan = (this as any)._graphExecuted === true;
          const _realObsCount = Array.isArray((this as any)._lastRealObservations)
            ? (this as any)._lastRealObservations.length : 0;
          const _agronomicSignal =
            requiresAgronomicReasoningIntent(intentCode) ||
            _realObsCount > 0 ||
            (_cs?.confirmed?.length ?? 0) > 0 ||
            (_cs?.inferred?.length ?? 0) > 0;

          if (!_graphRan && _agronomicSignal) {
            throw new Error(
              `GRAPH_PIPELINE_BYPASSED: trace_id=${traceId} intent=${intentCode} ` +
              `real_obs=${_realObsCount} confirmed=${_cs?.confirmed?.length ?? 0} ` +
              `inferred=${_cs?.inferred?.length ?? 0} reason=graph_not_executed_before_brain_trace`,
            );
          }

          // FAIL LOUD — snapshot says N hypotheses but legacy projection is 0.
          // This is the split-brain the surgical fix exists to prevent.
          assertSnapshotNotCorrupt(_snap, _legacyHypIds.length, traceId);

          if ((this as any)._evidenceFrozen) {
            assertDecisionGraphOrder(this as any, traceId, 'BRAIN_TRACE');
          }
          if ((this as any)._evidenceFrozen && _obsToHyp === 0 && _hypIds.length === 0 && requiresAgronomicReasoningIntent(intentCode)) {
            console.warn(
              `[OBS_TO_HYP_GAP] trace_id=${traceId} intent=${intentCode} ` +
              `confirmed_obs=${_cs?.confirmed?.length ?? 0} real_obs=${_realObsCount} ` +
              `hypotheses=0 reason=no_hypothesis_edge_for_confirmed_observations ` +
              `action=route_to_clarification_question`
            );
          }

          emitBrainTrace(_cs, {
            rule_candidates:  rulesToEvaluate?.length ?? 0,
            rule_eligible:    layeredRuleResult?.matched_responses?.length ?? 0,
            rule_winner:      _winner?.rule_id ?? null,
            hypotheses_count: _hypIds.length,
            obs_to_hyp_edges: _obsToHyp,
            hyp_to_rule_edges: _hypToRule,
            sequence:         (this as any)._evidenceFrozen ? 5 : undefined,
            total_ms:         Date.now() - startTime,
          });
          // Retain forensic detail on a separate line — auditors still grep
          // POST_RULE for winner_score / action_text / prescription flags.
          console.log(
            `[POST_RULE_TRACE] trace=${traceId ?? '?'} ` +
            `candidates=${rulesToEvaluate?.length ?? 0} ` +
            `after_intent=${rulesAfterIntent?.length ?? 0} ` +
            `evaluated=${layeredRuleResult?.rules_evaluated ?? 0} ` +
            `matched=${layeredRuleResult?.rules_matched ?? 0} ` +
            `eligible=${layeredRuleResult?.matched_responses?.length ?? 0} ` +
            `winner=${_winner?.rule_id ?? 'none'} ` +
            `winner_score=${(_winner?.weighted_confidence ?? _winner?.confidence_score ?? 0).toFixed?.(3) ?? 'n/a'} ` +
            `action_text=${_winner?.action_text ? 'present' : 'EMPTY'} ` +
            `prescription_allowed=${layeredRuleResult?.prescription_allowed ?? '?'} ` +
            `final_diagnosis=${layeredRuleResult?.final_diagnosis?.cause ?? 'none'} ` +
            `hyp=${_hypIds.length} obs_to_hyp=${_obsToHyp} hyp_to_rule=${_hypToRule}`
          );

          // PATCH 2 (BUG 2) — late invariant. Even if the projection at graph
          // exit passed, catch any late reset that would silently drop the
          // hypotheses before decision assembly.
          if (_hypIds.length > 0 && (_cs?.hypotheses?.length ?? 0) === 0) {
            throw new Error(
              `GRAPH_RESULT_DROPPED: late reset graph=${_hypIds.length} state=0 trace=${traceId}`,
            );
          }
        } catch (e) {
          if ((e as Error).message?.startsWith('GRAPH_RESULT_DROPPED') ||
              (e as Error).message?.startsWith('GRAPH_ORDER_ERROR') ||
              (e as Error).message?.startsWith('GRAPH_PIPELINE_BYPASSED')) throw e;
          /* trace must never throw */
        }
        
        // ═══════════════════════════════════════════════════════════════════════════
        // AUDIT FIX: Pipeline health monitoring - detect rule match failures
        // Logs critical warning when symptoms exist but zero rules matched,
        // enabling fast identification of condition_code/observable_characteristics gaps
        // ═══════════════════════════════════════════════════════════════════════════
        const pipelineSymptoms = (canonicalStateWithQuery as any).confirmed_observations || (canonicalStateWithQuery as any).visual_symptoms || [];
        if (layeredRuleResult.rules_matched === 0 && pipelineSymptoms.length >= 3) {
          console.error(`🚨 [PIPELINE_HEALTH] ZERO RULES MATCHED despite ${pipelineSymptoms.length} symptoms!`);
          console.error(`   Crop: ${canonicalState.crop_type}, Stage: ${canonicalState.crop_stage}`);
          console.error(`   Symptoms: [${pipelineSymptoms.join(', ')}]`);
          console.error(`   Rules Evaluated: ${layeredRuleResult.rules_evaluated}`);
          console.error(`   Matched Responses: ${layeredRuleResult.matched_responses?.length || 0}`);
          console.error(`   ACTION: Check condition_code and observable_characteristics in decision_rules table`);
        }
        
        if (safeSafetyBlocks.length > 0) {
          console.warn(`   ⚠️ Safety Blocks: ${safeSafetyBlocks.map(b => b?.message || 'unknown').join(', ')}`);
        }
        
        // ═══════════════════════════════════════════════════════════════════════════
        // Step 4 — KEYWORD FALLBACK REMOVED (was PHASE-14, lines 6899-6955).
        //
        // Prior behaviour (deleted):
        //   - When `layeredRuleResult.rules_matched === 0`, ran
        //     `evaluateBundledKeywordRules(farmerMessage, canonicalState)`, a
        //     regex-over-raw-user-text parallel NLU brain.
        //   - On any match, OVERWROTE `layeredRuleResult.rules_matched`,
        //     `.rules_applied`, `.diagnoses`, and `.final_diagnosis` with
        //     keyword-derived hits — bypassing GraphTruth, the observation
        //     ontology, IOM, hypothesis arbitration, and safety gates.
        //
        // This violated: (a) GraphTruth as sole authority, (b) DB-driven
        // ontology (evaluator reads `observation_master` / `decision_rules`),
        // (c) neuro-symbolic contract (LLM is narrator only). Zero matches is
        // a legitimate graph signal: the correct downstream response is
        // GRAPH_NEEDS_MORE_EVIDENCE (Step 1 sentinel), not a keyword guess.
        // ═══════════════════════════════════════════════════════════════════════════
        if (layeredRuleResult.rules_matched === 0) {
          console.warn(
            `[GRAPH_ZERO_RULE_MATCH] trace=${traceId} ` +
              `crop=${canonicalState.crop_type} stage=${canonicalState.crop_stage} ` +
              `symptom=${canonicalState.visual_symptom} ` +
              `obs=[${(canonicalState.visual_symptoms || []).join(',')}] ` +
              `— refusing keyword fallback. Downstream must emit ` +
              `GRAPH_NEEDS_MORE_EVIDENCE with pending observation codes.`,
          );
        }


        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE-16: SYMBOLIC REASONER INTEGRATION (Enhanced JSON Condition Evaluation)
        // Uses new SymbolicReasoner for proper conditions_json parsing
        // ═══════════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: Run Symbolic Reasoner ALWAYS, not just when rules_matched === 0
        // This ensures the primary decision brain runs even when layered rules found some matches
        // BUG 3 FIX: Add intent guard - don't run symbolic reasoner when intent is UNKNOWN
        // unless there are at least 2 confirmed/extracted observations
        const shouldRunSymbolicReasoner = canonicalState && (
          intentCode !== 'UNKNOWN' || 
          (allObservationsForPreAuth && allObservationsForPreAuth.size >= 2)
        );
        if (shouldRunSymbolicReasoner) {
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
              longitude: landContext.center_lon || null,
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
                texture: landContext.soil_health?.texture || null,
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
              farmerMessage,  // Add missing 4th argument (user query)
              [...allObservationsForPreAuth]  // Bug 2 Fix: Pass all observations as array
            );
            
            // Execute symbolic rules
            const symbolicResult = await symbolicReasoner.executeRules(symbolicFacts, authoritativeLandState);
            
            if (symbolicResult.rules_fired > 0) {
              console.log(`   ✅ Symbolic Reasoner fired ${symbolicResult.rules_fired} rules`);
              console.log(`   📋 Diagnosis: ${symbolicResult.diagnosis?.cause_name || 'none'}`);
              
              // Merge symbolic results into layered result
              layeredRuleResult.rules_matched = symbolicResult.rules_fired;
              layeredRuleResult.rules_applied = symbolicResult.recommendations.map((r: any) => r.rule_id);
              if (symbolicResult.diagnosis) {
                layeredRuleResult.final_diagnosis = {
                  id: symbolicResult.diagnosis.cause_id || 'SYMBOLIC',
                  category: 3 as any, // DiagnosisCategory
                  cause: symbolicResult.diagnosis.cause_name,
                  confidence: symbolicResult.confidence,
                  evidence: symbolicResult.reasoning || [],
                  rule_ids: symbolicResult.recommendations.map((r: any) => r.rule_id),
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
                    action_text: r.description,
                    product: r.product,
                    dosage: r.dosage
                  },
                  product_reference: r.rule_id || 'SYMBOLIC'
                }));
                
                // ═══════════════════════════════════════════════════════════════════════════
                // CRITICAL FIX v5.3: Merge symbolic recommendations into matched_responses
                // AND build primary_decision so the pipeline doesn't hit RULE_DATA_INTEGRITY_ERROR.
                // Without this, pest rules fire but never become eligible for primary decision.
                // ═══════════════════════════════════════════════════════════════════════════
                for (const rec of symbolicResult.recommendations) {
                  layeredRuleResult.matched_responses.push({
                    rule_id: rec.rule_id || 'SYMBOLIC',
                    cause: rec.cause || symbolicResult.diagnosis?.cause_name || 'DIAGNOSIS',
                    action_type: rec.action || 'RECOMMEND',
                    priority: rec.priority || 80,
                    confidence_score: symbolicResult.confidence || 0.8,
                    action_text: rec.description || rec.action_text || null,
                    reason_text: rec.reason_text || null,
                    knowledge_text: rec.knowledge_text || null,
                    i18n_key: rec.i18n_key || null
                  });
                }
                
                // Build primary_decision from best symbolic recommendation
                const bestRec = symbolicResult.recommendations[0];
                if (bestRec && !layeredRuleResult.primary_decision) {
                  console.log(`   🔧 [SymbolicMerge] Building primary_decision from symbolic: ${bestRec.rule_id}`);
                  layeredRuleResult.primary_decision = {
                    rule_id: bestRec.rule_id || 'SYMBOLIC',
                    action_type: bestRec.action || 'RECOMMEND',
                    priority: bestRec.priority || 80,
                    confidence_score: symbolicResult.confidence || 0.8,
                    normalized_score: symbolicResult.confidence || 0.8,
                    total_required: 1,
                    passed_required: 1,
                    weighted_confidence: symbolicResult.confidence || 0.8,
                    action_text: bestRec.description || bestRec.action_text || null,
                    reason_text: bestRec.reason_text || null,
                    knowledge_text: bestRec.knowledge_text || null,
                    i18n_key: bestRec.i18n_key || null
                  };
                }
              }
              
              // BUG 6 FIX: Remove redundant ConfidenceCalculator call
              // The SSOT weighted_confidence from LayeredRuleEvaluator is authoritative
              // ConfidenceCalculator was Path B (legacy) and conflicts with SSOT
              // layeredRuleResult.confidence_in_result is already set by the evaluator
              if (!layeredRuleResult.confidence_in_result && layeredRuleResult.primary_decision?.weighted_confidence) {
                layeredRuleResult.confidence_in_result = layeredRuleResult.primary_decision.weighted_confidence;
              }
              
              // ═══════════════════════════════════════════════════════════════════════════
              // FIX 8B: POST-DECISION VALIDATION — Block misrouted biotic→abiotic decisions
              // If farmer observations contain biotic indicators but top rule is abiotic,
              // filter out abiotic rules and re-select from biotic-only rules
              // ═══════════════════════════════════════════════════════════════════════════
              const BIOTIC_INDICATORS = new Set([
                'BORE', 'HOLES', 'DEAD_HEART', 'INSECT', 'FRASS', 'WEBBING',
                'CHEWING', 'LARVAE', 'BORING', 'STEM_BORING_MARKS', 'DEAD_HEART_PRESENT',
                'INSECT_PRESENCE_CONFIRMED', 'FRASS_VISIBLE', 'WEBBING_PRESENT', 'LEAF_CHEWING',
                'BORER_SUSPECTED'
              ]);
              const ABIOTIC_CATEGORIES = new Set(['irrigation', 'nutrition', 'ndvi', 'water_stress', 'stress', 'weather']);
              
              const allObsFlat = symbolicFacts?.all_observations || [];
              const hasBioticEvidence = allObsFlat.some((obs: string) => 
                [...BIOTIC_INDICATORS].some(indicator => obs.toUpperCase().includes(indicator))
              );
              
              if (hasBioticEvidence && symbolicResult.recommendations.length > 0) {
                const topRule = symbolicResult.recommendations[0];
                const topCategory = (topRule.category || '').toLowerCase();
                
                if (ABIOTIC_CATEGORIES.has(topCategory)) {
                  console.log(`\n🚨 [MISROUTE_DETECTED] Biotic symptoms routed to abiotic rule!`);
                  console.log(`   Top rule: ${topRule.rule_id} (category=${topCategory})`);
                  console.log(`   Farmer observations include biotic indicators`);
                  console.log(`   → Filtering to biotic-only rules`);
                  
                  const bioticRules = symbolicResult.recommendations.filter((r: any) => {
                    const cat = (r.category || '').toLowerCase();
                    return !ABIOTIC_CATEGORIES.has(cat);
                  });
                  
                  if (bioticRules.length > 0) {
                    symbolicResult.recommendations = bioticRules;
                    console.log(`   → Re-selected ${bioticRules.length} biotic rules, top: ${bioticRules[0].rule_id}`);
                    agentsUsed.push('POST_DECISION_MISROUTE_CORRECTED');
                  } else {
                    console.log(`   → No biotic rules available, keeping original (needs clarification)`);
                    agentsUsed.push('POST_DECISION_MISROUTE_NO_BIOTIC_RULES');
                  }
                }
              }
              
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
              // v5.1 BUG 4 FIX: Guard DiagnosisOnlyMode against redundant execution
              // Skip reformatting if symbolic reasoner already produced a high-confidence primary decision
              // v5.3 FIX: Check BOTH symbolicResult AND layeredRuleResult for primary_decision
              // The v5.3 merge block builds primary_decision on layeredRuleResult (line ~5022),
              // NOT on symbolicResult. Without this, DiagnosisOnlyMode always activates and
              // overrides valid symbolic treatment recommendations with a diagnosis-only response.
              const symbolicHasPrimaryDecision = layeredRuleResult?.primary_decision || 
                (symbolicResult.primary_decision && (symbolicResult.confidence || 0) > 0.6);
              
              if (diagnosisOnlyModeActive && symbolicResult.recommendations && symbolicResult.recommendations.length > 0 && !symbolicHasPrimaryDecision) {
                console.log(`\n🔬 [DIAGNOSIS-ONLY MODE] Generating direct diagnosis output (no primary decision from symbolic)...`);
                console.log(`   Mode=DIAGNOSIS_ONLY, Clarification=SKIPPED, Source=DECISION_RULES`);
                
                // Convert fired rules to MatchedRule format
                const matchedRulesForDiagnosis: MatchedRule[] = symbolicResult.recommendations.map((r: any) => ({
                  rule_id: r.rule_id || r.id || 'UNKNOWN',
                  cause: r.cause || symbolicResult.diagnosis?.cause_name || 'UNKNOWN',
                  canonical_group: r.canonical_group || r.category || 'pest',
                  confidence: r.confidence || symbolicResult.confidence || 0.6,
                  priority: r.priority || 50,
                  action_text: r.action_text || r.description,
                  reason_text: r.reason_text,
                  knowledge_text: r.knowledge_text,
                  actions: r.actions || [],
                  evidence_matched: r.evidence_matched || r.matched_conditions || []
                }));
                
                // Generate Diagnosis-Only output
                const diagnosisOnlyOutput = generateDiagnosisOnlyOutput({
                  canonicalContext: canonicalContext!,
                  observations: [...allObservationsForPreAuth],
                  matched_rules: matchedRulesForDiagnosis,
                  language: options.language || 'mr',
                  trace_id: traceId
                });
                
                console.log(`   🎯 Top diagnosis: ${diagnosisOnlyOutput.diagnoses[0]?.cause || 'NONE'}`);
                console.log(`   Confidence: ${(diagnosisOnlyOutput.top_confidence * 100).toFixed(0)}%`);
                console.log(`   Treatment sufficient: ${diagnosisOnlyOutput.confidence_sufficient_for_treatment}`);
                
                // Format diagnosis for farmer communication
                const diagnosisMessage = formatDiagnosisForLLM(
                  diagnosisOnlyOutput,
                  options.language || 'mr'
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
              if (symbolicResult.recommendations && symbolicResult.recommendations.length > 1 && !diagnosisOnlyModeActive) {
                console.log(`\n🔍 [MultiMatch] Checking ${symbolicResult.recommendations.length} fired rules for competition...`);
                
                try {
                  const multiMatchResult = await performMultiMatchDetection(
                    symbolicResult.recommendations,
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
                    console.log(`[CLARIFY_EXIT] site=EXIT_07_MULTI_MATCH trace=${(typeof traceId!=='undefined'?traceId:'?')} intent=${(typeof intentCode!=='undefined'?intentCode:'?')} crop=${(landContext?.current_crop) ?? '?'} stage=${(canonicalContext?.growth_stage) ?? '?'}`);
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
        
        console.log(`[CLARIFY_EXIT] site=EXIT_08_DEFERRED_CLARIFICATION trace=${(typeof traceId!=='undefined'?traceId:'?')} intent=${(typeof intentCode!=='undefined'?intentCode:'?')} crop=${(landContext?.current_crop) ?? '?'} stage=${(canonicalContext?.growth_stage) ?? '?'}`);
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
            symptomKeys: Array.from(allObservationsForPreAuth || []),
            isEmergency: false,
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
      // CRITICAL FIX v5.2: Skip when symbolic brain already produced results
      // to prevent GATHERING_INFO from overriding valid diagnoses
      // ========================================
      
      // Build once so it's available for both diagnostic and rule-engine paths
      const nluWithRuleMapping = this.buildNLUOutputWithRuleMapping(nluOutput, fusedIntelligence, intentCode as any);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX (Forensic Audit): Wire orchestrator's assembled observations
      // into nluWithRuleMapping.entities.symptom_codes so DiagnosticFlowController
      // and authority-resolver can see them. Without this, observations=0 in the
      // diagnostic flow despite 20+ observations being assembled in the orchestrator.
      // ═══════════════════════════════════════════════════════════════════════════
      if (allObservationsForPreAuth && allObservationsForPreAuth.size > 0) {
        const existingSymptomCodes = new Set<string>(nluWithRuleMapping.entities?.symptom_codes || []);
        for (const obs of allObservationsForPreAuth) {
          existingSymptomCodes.add(obs);
        }
        nluWithRuleMapping.entities.symptom_codes = Array.from(existingSymptomCodes);
        console.log(`   🔗 [OBSERVATION_WIRING] Injected ${allObservationsForPreAuth.size} observations into nluWithRuleMapping.entities.symptom_codes (total: ${nluWithRuleMapping.entities.symptom_codes.length})`);
      }
      const symbolicAlreadyProduced = (totalRulesMatched > 0) || 
        (layeredRuleResult && (layeredRuleResult as any).rules_matched > 0);
      
      let diagnosticState: any;
      
      // FORENSIC FIX (2026-07): isSymptomFreeRoute is computed from the
      // initial queryRoute label and can be stale once observations are
      // extracted. If real informative symptoms exist, do NOT skip PHASE 3
      // as symptom_free — that hands the turn to unrelated advisory rules.
      const informativeForPhase3 = [...(allObservationsForPreAuth || new Set<string>())].filter((c: string) => isInformativeObs(c));
      const symptomFreeForPhase3 = isSymptomFreeRoute && informativeForPhase3.length === 0;
      if (symbolicAlreadyProduced || symptomFreeForPhase3 || bypassClarification) {
        console.log(`\n🧠 PHASE 3: SKIPPED — symbolic/advisory path active (rules=${totalRulesMatched}, symptom_free=${symptomFreeForPhase3}, bypass=${bypassClarification}, informative=${informativeForPhase3.length})`);
        diagnosticState = {
          mode: 'READY_FOR_DECISION',
          next_question: null,
          hypotheses: [],
          rule_modules_required: [],
          session_state: null
        };
        agentsUsed.push('Diagnostic_SKIPPED');
      } else {
        console.log('\n🧠 PHASE 3: Managing Diagnostic Flow...');
        
        // Create per-request diagnostic controller with required parameters
        const diagnosticController = this.createDiagnosticController(sessionId, farmerId, options.landId);
        
        // nluWithRuleMapping already built above for deterministic downstream usage
        
        // Process through diagnostic flow
        const diagnosticResponse = await diagnosticController.processNLUOutput(nluWithRuleMapping);
        
        // Extract the first question with full details for clarification
        const firstQuestion = diagnosticResponse.questions?.[0];

        diagnosticState = {
          mode: this.mapDiagnosticAction(diagnosticResponse.action),
          next_question: firstQuestion ? {
            question_id: firstQuestion.question_id,
            text_en: firstQuestion.question_text_en || 'Please provide more details',
            options: firstQuestion.options
          } : null,
          hypotheses: diagnosticResponse.evaluation_result ? [{ confidence: 0.7 }] : [],
          rule_modules_required: nluWithRuleMapping.requiredRuleModules || [],
          session_state: diagnosticResponse.session_state
        };
        
        agentsUsed.push('Diagnostic');
        console.log('   ✅ Diagnostic mode:', diagnosticState.mode);
        
        // Check if we need more information
        if (diagnosticState.mode === 'GATHERING_INFO' && diagnosticState.next_question) {
          console.log(`[CLARIFY_EXIT] site=EXIT_09_POST_SYMBOLIC trace=${(typeof traceId!=='undefined'?traceId:'?')} intent=${(typeof intentCode!=='undefined'?intentCode:'?')} crop=${(landContext?.current_crop) ?? '?'} stage=${(canonicalContext?.growth_stage) ?? '?'}`);
          return {
            type: 'CLARIFICATION_QUESTION',
            session_id: sessionId,
            question: diagnosticState.next_question,
          metadata: {
            confidence: diagnosticState.hypotheses?.[0]?.confidence || 0,
            safety_status: 'PENDING',
            rules_applied: 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            symptomKeys: Array.from(allObservationsForPreAuth || []),
            isEmergency: false
          }
          };
        }
      }
      
      if (diagnosticState.mode === 'WAITING_FOR_PHOTO') {
        return {
          type: 'PHOTO_REQUEST',
          session_id: sessionId,
          photo_instructions: {
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
            agents_used: agentsUsed,
            symptomKeys: Array.from(allObservationsForPreAuth || []),
            isEmergency: false
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
        landContext,  // CRITICAL FIX: Pass landContext directly
        canonicalState  // CRITICAL FIX: Pass enriched canonical state for crop fallback
      );
      ruleEngineInput.supabaseClient = this.supabase;
      
      let decisionOutput = await this.ruleEngine.execute(ruleEngineInput);
      agentsUsed.push('RuleEngine');
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PRODUCTION FIX: Set decision_brain_source = true on all rule engine outputs
      // Without this flag, the LLM formatter rejects the decision at the
      // SYMBOLIC-ONLY GATE (llm-response-formatter.ts line ~298) and returns empty,
      // causing "Continue monitoring" fallback responses even when rules matched.
      // ═══════════════════════════════════════════════════════════════════════════
      decisionOutput.decision_brain_source = true;
      
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
            
            // BUG-B FIX: Extract actual product info from rule for validation
            const ruleActiveIngredient = layeredRuleResult.primary_decision.active_ingredient || null;
            const ruleDosage = layeredRuleResult.primary_decision.dosage_per_acre || null;
            const ruleCause = layeredRuleResult.primary_decision.cause || null;
            
            decisionOutput.primary_decision = {
              action_type: layeredRuleResult.primary_decision.action_type,
              rule_id: layeredRuleResult.primary_decision.rule_id,
              specific_action: layeredRuleResult.primary_decision.action_type,
              target: {},
              urgency: 'WITHIN_24H',
              priority: layeredRuleResult.primary_decision.priority,
              // SSOT: Propagate ledger-derived confidence fields
              weighted_confidence: layeredRuleResult.primary_decision.weighted_confidence,
              normalized_score: layeredRuleResult.primary_decision.normalized_score,
              total_required: layeredRuleResult.primary_decision.total_required,
              passed_required: layeredRuleResult.primary_decision.passed_required,
              // BUG-B FIX: Propagate product_details with actual active_ingredient
              product_details: ruleActiveIngredient ? {
                product_name: ruleActiveIngredient,
                active_ingredient: ruleActiveIngredient,
                dosage_per_acre: ruleDosage,
              } : undefined,
              timing: {
                recommended_start: new Date().toISOString(),
                recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                weather_dependency: false,
                reason: 'Recovered from layered_rule_result.primary_decision in orchestrator'
              },
              application_details: {
                // BUG-B FIX: Use actual active_ingredient instead of placeholder
                product_name: ruleActiveIngredient || 'See structured response',
                product_type: 'BOTANICAL',
                active_ingredient: ruleActiveIngredient,
                dosage_per_acre: ruleDosage,
                cause: ruleCause,
                action_text: layeredRuleResult.primary_decision.action_text,
                reason_text: layeredRuleResult.primary_decision.reason_text,
                knowledge_text: layeredRuleResult.primary_decision.knowledge_text,
                i18n_key: layeredRuleResult.primary_decision.i18n_key,
                rule_id: layeredRuleResult.primary_decision.rule_id,
                // PRODUCTION FIX: Propagate ALL rich agronomic fields for deterministic builder
                organic_alternative: layeredRuleResult.primary_decision.organic_alternative || null,
                phi_days: layeredRuleResult.primary_decision.phi_days || null,
                bee_toxicity: layeredRuleResult.primary_decision.bee_toxicity || null,
                application_method: layeredRuleResult.primary_decision.application_method || null,
                water_volume_per_acre: layeredRuleResult.primary_decision.water_volume_per_acre || null,
                mode_of_action: layeredRuleResult.primary_decision.mode_of_action || null,
                chemical_class: layeredRuleResult.primary_decision.chemical_class || null,
                resistance_group: layeredRuleResult.primary_decision.resistance_group || null,
                target_pest_stage: layeredRuleResult.primary_decision.target_pest_stage || null,
                treatment_type: layeredRuleResult.primary_decision.treatment_type || null,
                biological_group: layeredRuleResult.primary_decision.biological_group || null,
                success_indicators: layeredRuleResult.primary_decision.success_indicators || null,
                failure_indicators: layeredRuleResult.primary_decision.failure_indicators || null,
                roi_yield_gain_pct: layeredRuleResult.primary_decision.roi_yield_gain_pct || null,
                reentry_interval_hours: layeredRuleResult.primary_decision.reentry_interval_hours || null,
                aquatic_toxicity: layeredRuleResult.primary_decision.aquatic_toxicity || null,
                farmer_safety_level: layeredRuleResult.primary_decision.farmer_safety_level || null,
                regulatory_status: layeredRuleResult.primary_decision.regulatory_status || null,
                ipm_level: layeredRuleResult.primary_decision.ipm_level || null,
                material_cost_per_acre_min: layeredRuleResult.primary_decision.material_cost_per_acre_min || null,
                material_cost_per_acre_max: layeredRuleResult.primary_decision.material_cost_per_acre_max || null,
                labor_cost_per_acre_min: layeredRuleResult.primary_decision.labor_cost_per_acre_min || null,
                labor_cost_per_acre_max: layeredRuleResult.primary_decision.labor_cost_per_acre_max || null,
                labor_hours_per_acre: layeredRuleResult.primary_decision.labor_hours_per_acre || null,
                equipment_required: layeredRuleResult.primary_decision.equipment_required || null,
                equipment_cost_per_acre: layeredRuleResult.primary_decision.equipment_cost_per_acre || null,
                total_cost_estimated: layeredRuleResult.primary_decision.total_cost_estimated || null,
                roi_cost_saved_min: layeredRuleResult.primary_decision.roi_cost_saved_min || null,
                roi_cost_saved_max: layeredRuleResult.primary_decision.roi_cost_saved_max || null,
                roi_net_score: layeredRuleResult.primary_decision.roi_net_score || null,
                roi_confidence: layeredRuleResult.primary_decision.roi_confidence || null,
                min_temperature: layeredRuleResult.primary_decision.min_temperature || null,
                max_temperature: layeredRuleResult.primary_decision.max_temperature || null,
                max_wind_speed: layeredRuleResult.primary_decision.max_wind_speed || null,
                rain_delay_hours: layeredRuleResult.primary_decision.rain_delay_hours || null,
                weather_dependency: layeredRuleResult.primary_decision.weather_dependency || null,
                scientific_source: layeredRuleResult.primary_decision.scientific_source || null,
                scientific_basis: layeredRuleResult.primary_decision.scientific_basis || null,
                icar_package_ref: layeredRuleResult.primary_decision.icar_package_ref || null,
                university_source: layeredRuleResult.primary_decision.university_source || null,
                risk_level: layeredRuleResult.primary_decision.risk_level || null,
                response_severity: layeredRuleResult.primary_decision.response_severity || null,
                data_authority_rank: layeredRuleResult.primary_decision.data_authority_rank || null,
              },
              expected_outcomes: {
                efficacy_percent: layeredRuleResult.primary_decision.weighted_confidence 
                  ? Math.round(layeredRuleResult.primary_decision.weighted_confidence * 100) 
                  : layeredRuleResult.primary_decision.confidence_score
                    ? Math.round(layeredRuleResult.primary_decision.confidence_score * 100)
                    : 75,
                time_to_visible_effect_days: '3-5',
                success_indicators: layeredRuleResult.primary_decision.success_indicators || []
              }
            };
          }
        }

        // ──────────────────────────────────────────────────────────────
        // Phase I-7 — POST_DECISION drift guard. Capture the winning
        // rule_id on the graph (once) and verify no module mutated the
        // canonical_context / intent between extraction and decision.
        // ──────────────────────────────────────────────────────────────
        try {
          const winnerRaw =
            decisionOutput.primary_decision?.rule_id ||
            decisionOutput.primary_decision?.application_details?.rule_id ||
            null;
          const winnerCanonical =
            typeof winnerRaw === 'string' && /^[A-Z0-9_]+$/.test(winnerRaw)
              ? winnerRaw
              : null;
          if (!graph.decision_node) {
            graph.setDecision({
              winner_rule_id: winnerCanonical,
              decision_kind: 'DIAGNOSIS',
              metadata: {
                action_type: decisionOutput.primary_decision?.action_type ?? null,
                weighted_confidence:
                  decisionOutput.primary_decision?.weighted_confidence ?? null,
                rules_applied_count: Array.isArray(decisionOutput.rules_applied)
                  ? decisionOutput.rules_applied.length
                  : 0,
              },
            });
          }
          graphCp = assertNoGraphDrift(graph, graphCp, 'POST_DECISION');
          console.log(
            `[SSOT_TRACE][${traceId}] POST_DECISION winner=${winnerCanonical ?? 'NULL'} ` +
              `obs=${graph.observation_ledger.size()} hyp=${graph.hypothesis_graph.length}`
          );
        } catch (e) {
          if (e instanceof GraphStateDriftError || e instanceof SymbolicIdLeakError) {
            console.error(`🚨 ${e.name}: ${e.message}`);
            throw e;
          }
          console.warn(
            `⚠️ [POST_DECISION] non-fatal: ${e instanceof Error ? e.message : String(e)}`
          );
        }

        // Also attach matched_responses for additional recovery options
        if (layeredRuleResult.matched_responses && layeredRuleResult.matched_responses.length > 0) {
          decisionOutput.matched_responses = layeredRuleResult.matched_responses;
        }

        
        // ═══════════════════════════════════════════════════════════════════════════
        // BUG-3 FIX: Propagate rules_applied from layeredRuleResult → decisionOutput
        // Without this, decisionOutput.rules_applied stays empty ([]) even when 11+
        // rules actually fired. This causes PHASE-19 photo gate (line 6322) to
        // incorrectly trigger when rulesAppliedCount === 0.
        // ═══════════════════════════════════════════════════════════════════════════
        const safeLayeredRulesApplied = Array.isArray(layeredRuleResult.rules_applied) 
          ? layeredRuleResult.rules_applied 
          : [];
        if (safeLayeredRulesApplied.length > 0 && (!decisionOutput.rules_applied || decisionOutput.rules_applied.length === 0)) {
          decisionOutput.rules_applied = safeLayeredRulesApplied.map((ruleId: string) => ({
            rule_id: ruleId,
            rule_file: 'layered-evaluator',
            priority: 'P5_IPM',
            result: 'RECOMMEND',
            confidence: layeredRuleResult.confidence_in_result ?? 0.7
          }));
          console.log(`   🔧 BUG-3 FIX: Propagated ${safeLayeredRulesApplied.length} rules_applied from layeredRuleResult → decisionOutput`);
        }
      }
      
      console.log('   ✅ Decision generated:', decisionOutput.status);
      console.log('   ✅ Rules applied:', decisionOutput.rules_applied?.length || 0);
      console.log(`   ✅ Primary decision: ${decisionOutput.primary_decision?.action_type || 'NONE'} (rule: ${decisionOutput.primary_decision?.rule_id || decisionOutput.primary_decision?.application_details?.rule_id || 'NONE'})`);
      
      layerTimings.layer3_rules = Date.now() - layer3Start;
      console.log(`   ✅ Layer 3 complete (${layerTimings.layer3_rules}ms)`);

      // PHASE Y — rules + decision + hypothesis snapshots
      try {
        const rt = getRuntimeTraceCollector();
        if (rt) {
          rt.setRules({
            candidates:     (decisionOutput as any).candidate_rules ?? null,
            candidate_count: Array.isArray((decisionOutput as any).candidate_rules) ? (decisionOutput as any).candidate_rules.length : null,
            matched_count:  decisionOutput.rules_applied?.length ?? 0,
            applied:        decisionOutput.rules_applied ?? [],
            blocked:        (decisionOutput as any).blocked_actions ?? [],
            winner:         decisionOutput.primary_decision ? {
              rule_id: decisionOutput.primary_decision.rule_id
                       || decisionOutput.primary_decision.application_details?.rule_id
                       || null,
              action_type: decisionOutput.primary_decision.action_type ?? null,
              confidence:  decisionOutput.primary_decision.weighted_confidence ?? decisionOutput.primary_decision.confidence ?? null,
            } : null,
            rejected: (decisionOutput as any).top_5_rejected_rules ?? null,
          });
          rt.setDecision({
            decision_id:      (decisionOutput as any).decision_id ?? null,
            decision_type:    decisionOutput.primary_decision?.action_type ?? null,
            primary_decision: decisionOutput.primary_decision ?? null,
            secondary_actions:(decisionOutput as any).secondary_actions ?? [],
            confidence:       decisionOutput.primary_decision?.weighted_confidence ?? null,
            status:           decisionOutput.status ?? null,
            reasoning:        (decisionOutput as any).reasoning ?? null,
          });
          // Hypothesis (may be undefined if no arbitration ran)
          try {
            const hyp = (typeof hypothesisResult !== 'undefined') ? hypothesisResult : null;
            if (hyp) {
              rt.setHypotheses({
                decision_path: (hyp as any).decision_path ?? null,
                winner: (hyp as any).best_hypothesis ?? (hyp as any).winner ?? null,
                candidates: (hyp as any).candidates ?? (hyp as any).all_hypotheses ?? null,
                rejected: (hyp as any).rejected_hypotheses ?? null,
              });
            }
          } catch {}
        }
      } catch {}
      
      // ═══════════════════════════════════════════════════════════════════════════
      // HARD INVARIANT: If PRIMARY_DECISION exists with valid rule_id, return NOW
      // This prevents timeout by ensuring we don't continue processing indefinitely
      // ═══════════════════════════════════════════════════════════════════════════
      const primaryRuleId = decisionOutput.primary_decision?.rule_id || 
                            decisionOutput.primary_decision?.application_details?.rule_id;
      const primaryActionType = decisionOutput.primary_decision?.action_type;

      // ─────────────────────────────────────────────────────────────────────
      // FORENSIC FIX (2026-06-28): Add confidence + observation-evidence guard
      // to the HARD INVARIANT. Previously, keyword-matched rules without any
      // confirmed observation (e.g. flood prep / crop rotation fired by a
      // generic Marathi query) were promoted to PRIMARY_DECISION, then
      // rejected downstream → final fallback message reached the farmer
      // instead of the clarification chips.
      // ─────────────────────────────────────────────────────────────────────
      const invariantObsCount = Array.from(allObservationsForPreAuth || []).length;
      const invariantRulesMatched = (layeredRuleResult as any)?.rules_matched
        ?? (layeredRuleResult as any)?.matched_rules?.length
        ?? 0;
      const invariantConfidence = decisionOutput.primary_decision?.weighted_confidence
        ?? (decisionOutput.primary_decision as any)?.confidence
        ?? 0;
      const hasEvidence = invariantObsCount > 0 || invariantRulesMatched > 0;
      const confidenceOk = invariantConfidence >= 0.5 || primaryActionType === 'MONITOR_ONLY';

      if (primaryRuleId && primaryActionType && hasEvidence && confidenceOk) {
        console.log(`\n✅ [INVARIANT] PRIMARY_DECISION valid - generating immediate response`);
        console.log(`   rule_id: ${primaryRuleId}`);
        console.log(`   action_type: ${primaryActionType}`);
        console.log(`   obs=${invariantObsCount} rules_matched=${invariantRulesMatched} conf=${invariantConfidence}`);
        
        // Complete audit trail
        await auditLogger.completeTurn(Date.now() - startTime);
        
        // Wire symptomKeys + isEmergency into IMMEDIATE return path
        const obsArray = Array.from(allObservationsForPreAuth || []);
        const isEmergencyImmediate = obsArray.some(code => EMERGENCY_OBS_CODES.has(code));
        
        // Wire symptom_keys, has_symptoms, decision_confidence onto decisionOutput
        decisionOutput.symptom_keys = obsArray;
        if (!decisionOutput.metadata) decisionOutput.metadata = {};
        decisionOutput.metadata.has_symptoms = obsArray.length > 0;
        decisionOutput.metadata.symptomKeys = obsArray;
        decisionOutput.metadata.decision_confidence = layeredRuleResult?.primary_decision?.weighted_confidence || 0;
        decisionOutput.metadata.isEmergency = isEmergencyImmediate;
        
        // Wire matched_responses into IMMEDIATE return path
        if (!decisionOutput.matched_responses && layeredRuleResult?.matched_responses?.length) {
          decisionOutput.matched_responses = layeredRuleResult.matched_responses;
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // [STEP 7 REMOVED] Local PHI + Pollinator enforcement.
        // Both are now handled inside SafetyGuardian.verifySafety() below
        // (Gate 3: FoodSafetyCheck / PHI, Gate 4: EnvironmentalCheck / POLLINATOR_RISK).
        // ═══════════════════════════════════════════════════════════════════
        let immediateSafetyStatus = 'APPROVED';
        const immediateChemicals = this.extractChemicalRecommendations(decisionOutput);

        
        // SafetyGuardian verification
        try {
          const immediateSafetyVerification = await this.safetyGuardian.verifySafety(
            decisionOutput,
            {
              original_input: farmerMessage,
              session_id: sessionId,
              farmer_id: farmerId,
              crop_stage: contextState?.crop_context?.stage,
              expected_harvest_date: contextState?.crop_context?.expected_harvest_date,
              previous_failed_treatments: 0,
              severity: fusedIntelligence?.unified_context?.problem?.severity
            },
            layeredRuleResult?.primary_decision?.weighted_confidence || 0.7
          );
          agentsUsed.push('Safety');
          
          if (immediateSafetyVerification.emergency_protocol?.emergency_detected) {
            return {
              type: 'ESCALATION_REQUIRED',
              session_id: sessionId,
              escalation: {
                level: 'EMERGENCY',
                expert_type: immediateSafetyVerification.emergency_protocol.expert_escalation.expert_type || 'SAFETY_OFFICER',
                sla_hours: (immediateSafetyVerification.emergency_protocol.expert_escalation.sla_minutes || 30) / 60,
                ...immediateSafetyVerification.emergency_protocol.farmer_safety_instructions
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
          
          if (!immediateSafetyVerification.approved) {
            return {
              type: 'SAFETY_BLOCKED',
              session_id: sessionId,
              blocked_reason: immediateSafetyVerification.blocked_decision ? {
                reason_en: immediateSafetyVerification.blocked_decision.reason_en
              } : undefined,
              alternatives: immediateSafetyVerification.safety_check.safer_alternatives,
              metadata: {
                confidence: 0,
                safety_status: 'BLOCKED',
                rules_applied: decisionOutput.rules_applied?.length || 0,
                processing_time_ms: Date.now() - startTime,
                agents_used: agentsUsed
              }
            };
          }
          
          immediateSafetyStatus = immediateSafetyVerification.safety_check.overall_safety_status || immediateSafetyStatus;
          
          // Use safety-modified decision if available
          if (immediateSafetyVerification.modified_decision) {
            decisionOutput = immediateSafetyVerification.modified_decision;
          }
        } catch (safetyErr) {
          console.error('   ❌ [INVARIANT] SafetyGuardian failed (non-blocking):', safetyErr);
        }
        
        // Generate farmer communication using the working communicationGenerator pattern
        const farmerProfile = await this.getFarmerProfile(farmerId, options.language || 'mr');
        const immediateResponse = await this.communicationGenerator.generate(
          decisionOutput,
          farmerProfile,
          {
            issue_urgency: fusedIntelligence?.unified_context?.problem?.severity === 'CRITICAL' ? 'CRITICAL' :
                           fusedIntelligence?.unified_context?.problem?.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
            previous_failed_treatments: 0,
            questions_asked: 0
          }
        );
        
        return {
          type: 'DECISION_PROVIDED',
          session_id: sessionId,
          decision_id: decisionOutput.decision_id,
          decision_output: decisionOutput,
          communication: immediateResponse,
          dataAudit: landContext ? this.buildDataAudit(landContext, fusedIntelligence) : undefined,
          metadata: {
            confidence: layeredRuleResult?.primary_decision?.weighted_confidence ||
                        layeredRuleResult?.primary_decision?.confidence_score || 
                        decisionOutput.confidence_score || 0.7,
            safety_status: immediateSafetyStatus,
            rules_applied: decisionOutput.rules_applied?.length || 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            trace_id: traceId,
            response_source: 'IMMEDIATE_PRIMARY_DECISION',
            layer_timings: layerTimings,
            symptomKeys: obsArray,
            isEmergency: isEmergencyImmediate
          }
        };
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-19: PHOTO REQUEST ON LOW CONFIDENCE + NO RULES
      // If rule engine returned no recommendations AND confidence is low,
      // request a photo to help with diagnosis
      // ═══════════════════════════════════════════════════════════════════════════
      const rulesAppliedCount = decisionOutput.rules_applied?.length || 0;
      const hasNoRecommendations = rulesAppliedCount === 0 || !decisionOutput.primary_decision;
      const isLowConfidence = (decisionOutput.confidence_score || 0) < 0.6;
      const hasNoPhoto = !options.photoUrl && !photoAnalysisResult;
      const shouldUseStageAdvisoryFallback = hasNoRecommendations && hasNoPhoto && (isSymptomFreeRoute || bypassClarification) && !!landContext?.current_crop;
      
      if (shouldUseStageAdvisoryFallback) {
        const cropName = landContext.current_crop || 'crop';
        const stageName = landContext.growth_stage || 'current stage';
        const dasText = landContext.days_since_sowing ? ` (${landContext.days_since_sowing} DAS)` : '';
        const userLanguage = options.language || 'mr';
        const stageFallback = this.generateStageAwareFallback(
          cropName,
          stageName,
          'stage_advisory',
          landContext.days_since_sowing || 0,
          userLanguage
        );
        const fallbackMessage = userLanguage === 'mr'
          ? `तुमच्या ${cropName} पिकाची अवस्था ${stageName}${dasText} आहे. सध्या खत/फवारणीचा निर्णय पिकाची अवस्था, माती परीक्षण, NDVI आणि हवामान पाहून घ्या. स्पष्ट कीड/रोगाची लक्षणे दिसत नसतील तर अनावश्यक रासायनिक फवारणी टाळा; नियोजित पोषण, पाणी व्यवस्थापन आणि निरीक्षण चालू ठेवा.`
          : userLanguage === 'hi'
            ? `आपकी ${cropName} फसल अभी ${stageName}${dasText} अवस्था में है। अभी खाद/स्प्रे का निर्णय फसल अवस्था, मिट्टी परीक्षण, NDVI और मौसम देखकर लें। कीट/रोग के स्पष्ट लक्षण न हों तो अनावश्यक रासायनिक स्प्रे टालें; नियोजित पोषण, पानी प्रबंधन और निगरानी जारी रखें।`
            : `Your ${cropName} crop is at ${stageName}${dasText}. Use crop stage, soil test, NDVI and weather before deciding fertilizer or spray. If there are no clear pest/disease symptoms, avoid unnecessary chemical spray; continue scheduled nutrition, water management and monitoring.`;
        agentsUsed.push('STAGE_ADVISORY_FALLBACK');
        return {
          type: 'DECISION_PROVIDED',
          session_id: sessionId,
          decision_output: {
            decision_id: `stage_advisory_${Date.now()}`,
            session_id: sessionId,
            status: 'STAGE_FALLBACK',
            decision_brain_source: true,
            stage_fallback_message: fallbackMessage,
            action_codes: stageFallback.action_codes,
            rules_applied: [],
            metadata: {
              ...stageFallback.metadata,
              route: queryRoute.route,
              reason: 'ZERO_RULES_FOR_SYMPTOM_FREE_ADVISORY',
              i18n_key: stageFallback.i18n_key
            }
          } as any,
          dataAudit: landContext ? this.buildDataAudit(landContext, fusedIntelligence) : undefined,
          metadata: {
            confidence: 0.65,
            safety_status: 'SAFE_STAGE_ADVISORY',
            rules_applied: 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            trace_id: traceId,
            response_source: 'STAGE_ADVISORY_FALLBACK',
            symptomKeys: Array.from(allObservationsForPreAuth || []),
            isEmergency: false
          }
        } as any;
      }
      
      if (hasNoRecommendations && isLowConfidence && hasNoPhoto) {
        console.log(`\n📸 [PHASE-19] Low confidence + no rules matched - requesting photo`);
        console.log(`   Rules applied: ${rulesAppliedCount}, Confidence: ${decisionOutput.confidence_score || 0}`);
        
        // ═══════════════════════════════════════════════════════════════════════════
        // SSOT: Photo request uses i18n_keys - actual translations loaded by UI layer
        // from observation_translations and message_translations tables
        // ═══════════════════════════════════════════════════════════════════════════
        return {
          type: 'PHOTO_REQUEST',
          session_id: sessionId,
          photo_instructions: {
            // i18n_key for UI layer resolution (no hardcoded regional text)
            i18n_key: 'photo_request.diagnosis_help',
            text_en: 'For accurate diagnosis, please send a photo of the affected leaf/crop.',
            tips_i18n_key: 'photo_request.tips',
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
            reason: 'LOW_CONFIDENCE_NO_RULES',
            ssot_source: 'observation_translations',
            symptomKeys: Array.from(allObservationsForPreAuth || []),
            isEmergency: false
          }
        };
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // MANDATORY FALLBACK: Generate SSOT-compliant clarification from decision_rules
      // when zero rules matched and no primary decision exists
      // This prevents the function from timing out without a response
      // ═══════════════════════════════════════════════════════════════════════════
      if (hasNoRecommendations && !hasNoPhoto) {
        console.warn(`\n⚠️ [MANDATORY_FALLBACK] No rules matched with photo present - generating SSOT clarification`);
        
        const cropCode = landContext?.current_crop?.toUpperCase() || landContext?.crop_code?.toUpperCase() || 'SC';
        const growthStage = (landContext?.growth_stage || 'TILLERING').toUpperCase();
        const userLanguage = options.language || 'mr';
        
        // SSOT: Load top observable_characteristics for this crop/stage from decision_rules
        const { data: topRules } = await this.supabase
          .from('decision_rules')
          .select('observable_characteristics')
          .eq('is_active', true)
          .or(`crop_code.eq.${cropCode},crop_code.eq.all`)
          .not('observable_characteristics', 'is', null)
          .limit(10);
        
        // Extract unique observation codes
        const obsCodesSet = new Set<string>();
        for (const rule of topRules || []) {
          const chars = rule.observable_characteristics;
          if (Array.isArray(chars)) {
            chars.slice(0, 3).forEach((c: string) => {
              if (typeof c === 'string') obsCodesSet.add(c.toUpperCase());
            });
          }
        }
        
        // Limit to top 4 + photo
        const obsCodes = Array.from(obsCodesSet).slice(0, 4);
        obsCodes.push('PHOTO_REQUEST');
        
        // SSOT: Load translations from observation_translations table
        const { loadObservationLabels } = await import('../i18n/observation-label-loader.ts');
        const labelMap = await loadObservationLabels(this.supabase, obsCodes, userLanguage);
        
        // Build options array
        const clarificationOptions = obsCodes.map(code => {
          const label = labelMap.get(code.toUpperCase());
          return {
            value: code,
            label: label ? `${label.icon} ${label.display_text}` : code,
            i18n_key: `observation.${code.toLowerCase()}`
          };
        });
        
        console.log(`   Loaded ${clarificationOptions.length} options from decision_rules + observation_translations`);
        
        agentsUsed.push('MANDATORY_FALLBACK');
        
        console.log(`[CLARIFY_EXIT] site=EXIT_10_INTENT_LOCK_EMPTY trace=${(typeof traceId!=='undefined'?traceId:'?')} intent=${(typeof intentCode!=='undefined'?intentCode:'?')} crop=${(landContext?.current_crop) ?? '?'} stage=${(canonicalContext?.growth_stage) ?? '?'}`);
        return {
          type: 'CLARIFICATION_QUESTION',
          session_id: sessionId,
          question: {
            question_id: `fallback_clarify_${Date.now()}`,
            i18n_key: 'clarification.zero_symptoms_detected',
            text_en: 'To help diagnose your crop issue, please select what you observe:',
            options: clarificationOptions,
            source: 'DECISION_RULES_SSOT'
          },
          metadata: {
            confidence: 0.3,
            safety_status: 'NEEDS_CLARIFICATION',
            rules_applied: 0,
            processing_time_ms: Date.now() - startTime,
            agents_used: agentsUsed,
            trace_id: traceId,
            fallback_reason: 'ZERO_RULES_WITH_PHOTO',
            ssot_source: 'decision_rules.observable_characteristics',
            symptomKeys: Array.from(allObservationsForPreAuth || []),
            isEmergency: false
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
          
          console.log(`[CLARIFY_EXIT] site=EXIT_11_ALL_ACTIONS_FILTERED trace=${(typeof traceId!=='undefined'?traceId:'?')} intent=${(typeof intentCode!=='undefined'?intentCode:'?')} crop=${(landContext?.current_crop) ?? '?'} stage=${(canonicalContext?.growth_stage) ?? '?'}`);
          return {
            type: 'CLARIFICATION_QUESTION',
            session_id: sessionId,
            question: {
              question_id: `intent_mismatch_${Date.now()}`,
              text_en: 'Could you describe your problem in more detail so I can help you better?',
              i18n_key: clarification.i18n_key,
              options: clarification.option_codes.map(code => ({ code, label: code }))
            },
            metadata: {
              confidence: intentConfidence,
              safety_status: 'PENDING',
              rules_applied: decisionOutput.rules_applied?.length || 0,
              processing_time_ms: Date.now() - startTime,
              agents_used: agentsUsed,
              trace_id: traceId,
              symptomKeys: Array.from(allObservationsForPreAuth || []),
              isEmergency: false
            }
          };
        }
      } else {
        console.log(`   ✅ P0-E: All ${allActions.length} actions passed intent lock filter`);
      }
      
      // ========================================
      // PHASE 5: SAFETY VERIFICATION
      // [STEP 7 REMOVED] PHASE 5.1 (PHI) and PHASE 5.2 (Pollinator) local pre-checks —
      // SafetyGuardian.verifySafety() below owns both gates end-to-end.
      // ========================================
      console.log('\n🛡️ PHASE 5: Safety Verification (SafetyGuardian single-gate)...');
      const chemicalRecommendations = this.extractChemicalRecommendations(decisionOutput);

      
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
      
      // Wire symptomKeys + isEmergency into main DECISION_PROVIDED return path
      // Uses module-level EMERGENCY_OBS_CODES constant (deduplicated)
      const obsArrayMain = Array.from(allObservationsForPreAuth || []);
      const isEmergencyMain = obsArrayMain.some(code => EMERGENCY_OBS_CODES.has(code));

      // ═══════════════════════════════════════════════════════════════════════
      // GRAPH CONTRACT — FINAL_RESPONSE + invariant assertions
      // ═══════════════════════════════════════════════════════════════════════
      try {
        const evidence = classifyEvidence(obsArrayMain);
        const snapshot: InvariantSnapshot = {
          trace_id: traceId,
          crop: landContext?.current_crop ?? null,
          bio_state_locked: !!(landContext as any)?.biological_state?.is_locked,
          real_observation_count: evidence.real_symptom_count,
          hypotheses_count: (diagnosticState?.hypotheses?.length ?? 0),
          rules_loaded: (decisionOutput as any)?.rules_evaluated_count ?? (decisionOutput?.rules_applied?.length ?? 0),
          rules_matched: (decisionOutput?.rules_applied?.length ?? 0),
          symbolic_decision_available: !!decisionOutput?.primary_decision,
          diagnosis_available: !!(diagnosticState?.hypotheses?.length),
          final_source: 'symbolic_decision_graph',
          fallback_reason: null,
          system_error: false,
        };
        emitFinalResponseContract(snapshot);
        emitNodeTrace(traceId, 'FINAL_RESPONSE', {
          source: snapshot.final_source,
          symbolic_decision: snapshot.symbolic_decision_available,
          real_obs: snapshot.real_observation_count,
          hypotheses: snapshot.hypotheses_count,
          rules_matched: snapshot.rules_matched,
        });
        checkGraphInvariants(snapshot);

        // FIX 5 (surgical) — final graph invariant. If we have real symptoms
        // AND a crop, the farmer must NEVER receive a generic "provide more
        // details" response — that's a symbolic-brain failure, not a farmer
        // problem. Log loudly so it surfaces in every log scan.
        try {
          const respText = String(
            (farmerCommunication as any)?.message ??
            (farmerCommunication as any)?.text ??
            (farmerCommunication as any)?.response_text ??
            ''
          );
          const asksForMoreDetails = /provide more details|ask your question again|अधिक माहिती द्या|और जानकारी दें|மேலும் தகவல்|మరింత సమాచారం/i.test(respText);
          if (snapshot.real_observation_count > 0 && snapshot.crop && asksForMoreDetails) {
            console.error(
              `[FINAL_INVARIANT_VIOLATION][${traceId}] observation_count=${snapshot.real_observation_count} ` +
              `crop=${snapshot.crop} intent_lock=DIAGNOSTIC_INQUIRY but response is generic "ask for more details". ` +
              `symbolic_brain_returned_no_actionable_advice`,
            );
          }
        } catch { /* invariant must never throw */ }
      } catch (invErr) {
        console.warn(`[GRAPH_INVARIANT_ERR][${traceId}] non-fatal: ${invErr instanceof Error ? invErr.message : String(invErr)}`);
      }

      return {
        type: 'DECISION_PROVIDED',
        session_id: sessionId,
        decision_id: decisionOutput.decision_id,
        communication: farmerCommunication,
        decision_output: safetyVerification.modified_decision || decisionOutput,
        question_classification: questionClassification,
        dataAudit,
        metadata: {
          confidence: diagnosticState.hypotheses?.[0]?.confidence || 0.7,
          safety_status: safetyVerification.safety_check.overall_safety_status,
          rules_applied: decisionOutput.rules_applied?.length || 0,
          processing_time_ms: processingTime,
          agents_used: agentsUsed,
          template_type: questionClassification.template_type,
          sections_count: farmerCommunication.metadata?.sections_count || 0,
          trace_id: traceId,
          symptomKeys: obsArrayMain,
          isEmergency: isEmergencyMain,
          final_source: 'symbolic_decision_graph'
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
        language_detected: language || 'en',
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
    // Use the unified crop code normalizer (SSOT) instead of hardcoded map
    return unifiedNormalizeCropCode(cropName);
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
      // PR-4a · SINGLE-BRAIN STAGE SSOT
      // Stage is produced EXCLUSIVELY by resolve_crop_phenology() (RPC below).
      // Any hardcoded DAS → stage ladder here would be a competing brain and
      // is explicitly forbidden by the neuro-symbolic contract.
      // We only compute DAS locally as a diagnostic fallback for logging and
      // for the `authoritativeDas` chain when the RPC returns no row; the RPC
      // itself coalesces lands.planting_date > lands.last_sowing_date >
      // crop_schedules.sowing_date and remains the authoritative producer.
      // ═══════════════════════════════════════════════════════════════════════════
      let daysSinceSowing: number | null = null;
      const growthStage: string | null = null; // never set locally — SSOT only

      if (cropSchedule?.sowing_date) {
        const sowingDate = new Date(cropSchedule.sowing_date);
        const today = new Date();
        daysSinceSowing = Math.floor((today.getTime() - sowingDate.getTime()) / (1000 * 60 * 60 * 24));

        console.log(`✅ [SOWING_DATE_SOURCE] crop_schedules.sowing_date (fallback DAS only)`);
        console.log(`   Crop: ${cropSchedule.crop_name}`);
        console.log(`   Sowing Date: ${cropSchedule.sowing_date}`);
        console.log(`   Days Since Sowing (local diag): ${daysSinceSowing}`);
        console.log(`   ⏭️  Stage will be resolved by resolve_crop_phenology() (SSOT)`);
      } else if (land.current_crop) {
        console.warn(`⚠️ [SOWING_DATE_MISSING] No active crop_schedule for land ${landId}`);
        console.warn(`   → lands.current_crop = "${land.current_crop}"`);
        console.warn('   → days_since_sowing unknown; stage still resolved by phenology SSOT if lands.planting_date/last_sowing_date exists');
      } else {
        console.warn(`⚠️ [NO_CROP_DATA] No crop_schedule AND no lands.current_crop for ${landId}`);
        console.warn('   → Cannot provide crop-specific advice');
      }
      
      // CRITICAL FIX: Calculate NDVI trend from history
      const ndviTrend = this.calculateNDVITrend(ndviHistory || []);

      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE A — Runtime SSOT: resolve_crop_phenology()
      // Authoritative stage from crop_stage_master ontology.
      // Overrides any client-heuristic stage stored on lands.crop_stage.
      // ═══════════════════════════════════════════════════════════════════════════
      let phenology: any = null;
      let phenErr: any = null;
      let phenThrew: Error | null = null;

      // Mandatory pre-RPC trace (fires unconditionally so silent skips are impossible)
      console.log(
        `🌱 [BIO_STATE_START] land_id=${landId} ` +
          `crop=${land.current_crop ?? 'null'} ` +
          `das=${daysSinceSowing ?? 'null'} ` +
          `sowing_date=${cropSchedule?.sowing_date ?? land.last_sowing_date ?? land.planting_date ?? 'null'}`,
      );

      try {
        const rpc = await this.supabase.rpc('resolve_crop_phenology', { p_land_id: landId });
        phenErr = rpc.error;
        const phenRows = rpc.data;
        if (phenErr) {
          console.error(
            `❌ [BIO_STATE_RPC_RESULT] success=false land=${landId} returned_stage=null ` +
              `error_code=${(phenErr as any).code ?? 'n/a'} error_msg=${phenErr.message} ` +
              `details=${(phenErr as any).details ?? ''} hint=${(phenErr as any).hint ?? ''}`,
          );
        } else if (Array.isArray(phenRows) && phenRows.length > 0) {
          phenology = phenRows[0];
          console.log(
            `✅ [BIO_STATE_RPC_RESULT] success=true land=${landId} ` +
              `returned_stage=${phenology.growth_stage} das=${phenology.current_das} ` +
              `source=${phenology.source} v${phenology.resolver_version}`,
          );
          console.log(
            `✅ [PHENOLOGY_SSOT] stage=${phenology.growth_stage} (${phenology.stage_code}) ` +
              `crop=${phenology.crop_code} das=${phenology.current_das} conf=${phenology.confidence} ` +
              `src=${phenology.source} v${phenology.resolver_version}`,
          );
        } else {
          console.warn(
            `⚠️ [BIO_STATE_RPC_RESULT] success=false land=${landId} returned_stage=null ` +
              `error=NO_ROW_RETURNED reason=resolver_short_circuited(likely_sowing_or_crop_missing)`,
          );
        }
      } catch (e) {
        phenThrew = e as Error;
        console.error(
          `❌ [BIO_STATE_RPC_RESULT] success=false land=${landId} returned_stage=null ` +
            `error=THREW msg=${phenThrew.message}`,
        );
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE 1 — Immutable BiologicalState (single writer = resolve_crop_phenology)
      // Build EXACTLY ONCE here. Downstream code must read from
      // landContext.biological_state instead of recomputing growth_stage.
      // ═══════════════════════════════════════════════════════════════════════════
      // BUG-2 FIX: adjudicate GDD-derived stage vs static-DAS stage BEFORE the
      // BiologicalState invariant locks. Runtime only — no seed data, no
      // per-crop branches. If a higher-confidence signal exists (GDD model,
      // completed stage transitions) we overwrite the local phenology row.
      if (phenology) {
        try {
          const recon = await reconcilePhenology(this.supabase, {
            landId,
            cropCode: phenology.crop_code ?? land.current_crop ?? null,
            das: phenology.current_das ?? daysSinceSowing ?? null,
            phenologyRow: phenology,
          });
          if (recon) {
            console.log(
              `[PHENOLOGY_RECONCILIATION] das_stage=${recon.das_stage ?? 'null'} ` +
              `gdd_stage=${recon.gdd_stage ?? 'null'} ` +
              `winner=${recon.winner.growth_stage ?? 'null'} ` +
              `source=${recon.winner.source} ` +
              `confidence=${recon.winner.confidence.toFixed(2)} ` +
              `reason=${recon.reason} changed=${recon.changed}`,
            );
            if (recon.changed) {
              phenology.growth_stage = recon.winner.growth_stage ?? phenology.growth_stage;
              phenology.stage_code   = recon.winner.stage_code   ?? phenology.stage_code;
              phenology.stage_uuid   = recon.winner.stage_uuid   ?? phenology.stage_uuid;
              phenology.source       = recon.winner.source;
              phenology.confidence   = recon.winner.confidence;
            }
          } else {
            console.log(`[PHENOLOGY_RECONCILIATION] skipped reason=no_phenology_row_or_crop`);
          }
        } catch (e) {
          console.warn(`[PHENOLOGY_RECONCILIATION] failed err=${(e as Error).message}`);
        }
      }
      const biological_state: BiologicalState | null = buildBiologicalState(landId, phenology);
      if (biological_state) {
        console.log(
          `🔒 [BIO_STATE_LOCKED] land_id=${landId} crop=${biological_state.crop_code} ` +
            `stage=${biological_state.growth_stage} stage_uuid=${biological_state.stage_uuid} ` +
            `code=${biological_state.stage_code} das=${biological_state.das} ` +
            `conf=${biological_state.confidence} source=${biological_state.source}`,
        );
        console.log(
          `🧬 [BIO_STATE_CREATE_RESULT] created=true land=${landId} ` +
            `stage=${biological_state.growth_stage} das=${biological_state.das}`,
        );
      } else {
        const failureReason = phenThrew
          ? `rpc_threw:${phenThrew.message}`
          : phenErr
            ? `rpc_error:${(phenErr as any).code ?? phenErr.message}`
            : !phenology
              ? 'rpc_returned_no_row'
              : 'buildBiologicalState_null';
        console.error(
          `🧬 [BIO_STATE_CREATE_RESULT] created=false land=${landId} ` +
            `failure_reason=${failureReason} ` +
            `sow_present=${!!(cropSchedule?.sowing_date || land.last_sowing_date || land.planting_date)} ` +
            `crop_present=${!!land.current_crop}`,
        );
      }



      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Prioritize crop_schedules, but FALLBACK to lands.current_crop
      // This ensures crop context is available even without a formal schedule
      // ═══════════════════════════════════════════════════════════════════════════
      const effectiveCropName = cropSchedule?.crop_name || land.current_crop || null;
      const effectiveCropVariety = cropSchedule?.crop_variety || null;

      // BiologicalState (when locked) is the sole authority for stage/DAS.
      const authoritativeStage = biological_state?.growth_stage ?? phenology?.growth_stage ?? growthStage;
      const authoritativeDas   = biological_state?.das ?? phenology?.current_das ?? daysSinceSowing;
      const stageAuthority     = biological_state ? 'biological_state_ssot' : (phenology ? 'phenology_ssot' : (cropSchedule ? 'schedule_heuristic' : 'lands_fallback'));
      console.log(
        `🧭 [STAGE_AUTHORITY_TRACE] land=${landId} ` +
          `biological_state.stage=${biological_state?.growth_stage ?? 'null'} ` +
          `phenology.stage=${phenology?.growth_stage ?? 'null'} ` +
          `landContext.stage=${authoritativeStage ?? 'null'} ` +
          `authority=${stageAuthority}`,
      );

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE C — Morphology reconciliation
      // Compare observed NDVI (and any user-supplied height/leaf count later)
      // against expected bands from the phenology SSOT. Result is EVIDENCE,
      // not a decision — feeds symbolic facts + confidence chain only.
      // ═══════════════════════════════════════════════════════════════════════
      const ndviLatestValue: number | null = Array.isArray(ndviHistory) && ndviHistory.length > 0
        ? (ndviHistory[0]?.ndvi_value ?? ndviHistory[0]?.value ?? null)
        : null;
      let morphology_evidence: MorphologyEvidence | null = null;
      try {
        morphology_evidence = reconcileMorphology(
          phenology,
          { ndvi: ndviLatestValue, plant_height_cm: null, leaf_count: null }
        );
        console.log(
          `🧬 [MORPHOLOGY] status=${morphology_evidence.overall_status} shift=${morphology_evidence.stage_shift_hint ?? 'none'} Δconf=${morphology_evidence.confidence_delta} ndvi=${morphology_evidence.ndvi.status}`
        );
      } catch (e) {
        console.warn(`⚠️ [MORPHOLOGY] reconciler threw: ${(e as Error).message}`);
      }
      
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
        crop_cycle: (land as any).crop_cycle || null,
        sowing_date: cropSchedule?.sowing_date || land.last_sowing_date || land.planting_date || null,
        transplant_date: (land as any).transplant_date || null,
        days_since_sowing: authoritativeDas,
        growth_stage: authoritativeStage,
        stage_authority: stageAuthority,
        phenology: phenology,          // full Phase-A resolver record (frozen shape)
        biological_state: biological_state, // PHASE 1 — immutable SSOT; do NOT mutate stage after this
        morphology_evidence: morphology_evidence, // PHASE C — reconciled bands + confidence delta
        stage_uuid: biological_state?.stage_uuid ?? phenology?.stage_uuid ?? (land as any).stage_uuid ?? null,
        expected_harvest_date: cropSchedule?.expected_harvest_date,
        // NEW: Track data source for debugging
        crop_data_source: cropSchedule ? 'crop_schedules' : (land.current_crop ? 'lands_table_fallback' : 'none'),
        // PHASE-1 SSOT: NEVER silently fall back to LAND_DATA. When BiologicalState
        // is unavailable, mark the source explicitly with a machine-readable reason
        // so [STAGE_AUTHORITY_VIOLATION] fires and downstream cannot confuse a
        // heuristic stage for the biological SSOT.
        source: biological_state ? 'BIOLOGICAL_STATE' : 'BIOLOGICAL_STATE_UNAVAILABLE',
        source_fallback_reason: biological_state
          ? null
          : (phenThrew ? 'rpc_threw' : phenErr ? 'rpc_error' : 'no_row'),
        source_fallback_used: biological_state
          ? null
          : (cropSchedule ? 'crop_schedules' : (land.current_crop ? 'lands' : 'none')),

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
  /**
   * Calculate NDVI trend from historical data
   * REFACTORED: Returns English canonical symbols (NDVI_IMPROVING, NDVI_DECLINING, NDVI_STABLE)
   * Narration layer handles translation to farmer language
   */
  private calculateNDVITrend(history: Array<{ ndvi_value?: number; mean_ndvi?: number; captured_at: string }>): {
    direction: 'IMPROVING' | 'STABLE' | 'DECLINING';
    slope: number;
    description: string;
  } {
    if (!history || history.length < 2) {
      // CANONICAL: English symbol for insufficient data
      return { direction: 'STABLE', slope: 0, description: 'INSUFFICIENT_DATA' };
    }
    
    // Get values (prefer ndvi_value, fallback to mean_ndvi)
    const values = history
      .map(h => h.ndvi_value ?? h.mean_ndvi)
      .filter((v): v is number => v !== null && v !== undefined);
    
    if (values.length < 2) {
      return { direction: 'STABLE', slope: 0, description: 'INSUFFICIENT_DATA' };
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
    // CANONICAL: Use English symbols - narration layer handles translation
    let direction: 'IMPROVING' | 'STABLE' | 'DECLINING';
    let description: string;
    
    if (slope < -0.02) {
      direction = 'IMPROVING';  // Slope is negative because array is newest-first
      description = 'NDVI_IMPROVING';  // Canonical symbol
    } else if (slope > 0.02) {
      direction = 'DECLINING';  // Slope is positive because array is newest-first
      description = 'NDVI_DECLINING';  // Canonical symbol
    } else {
      direction = 'STABLE';
      description = 'NDVI_STABLE';  // Canonical symbol
    }
    
    return { direction, slope: -slope, description };  // Negate slope for intuitive interpretation
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PR-4a · REMOVED: private calculateGrowthStage(daysSinceSowing, cropName)
  // Rationale: this 85-line ICAR ladder was a second brain competing with the
  // authoritative SSOT `public.resolve_crop_phenology(land_id)` (which joins
  // crop_stage_master + variety_phenology_profile + evaluate_stage_transitions
  // and coalesces lands.planting_date > lands.last_sowing_date >
  // crop_schedules.sowing_date). Any code path that needs a stage MUST read
  // `biological_state.growth_stage` or the phenology RPC row. No local
  // recomputation is permitted. See mem://architecture/single-brain-stage-ssot.
  // ═══════════════════════════════════════════════════════════════════════════

  
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
    // Weather data unavailable — return null values (no hardcoded defaults)
    const defaultWeather = {
      is_default: true,
      confidence: 'LOW' as const,
      warning: 'Weather data unavailable — advisory based on general conditions only',
      current: {
        temperature_c: null as number | null,
        humidity_percent: null as number | null,
        wind_speed_kmh: null as number | null,
        rainfall_last_24h_mm: 0
      },
      forecast_24h: {
        rain_probability_percent: null as number | null,
        temperature_max_c: null as number | null,
        temperature_min_c: null as number | null,
        wind_max_kmh: null as number | null
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
          const lat = Number(land.center_lat);
          const lon = Number(land.center_lon);
          const locationKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
          
          // Strategy 1: Exact location_key match
          let { data: weatherCurrent } = await this.supabase
            .from('weather_current')
            .select('temperature_celsius, humidity_percent, wind_speed_kmh, rain_1h_mm, rain_24h_mm, weather_main, weather_description, uv_index, cloud_cover_percent, feels_like_celsius, pressure_hpa, wind_direction_degrees, wind_gust_kmh, visibility_km, observation_time, location_key')
            .eq('location_key', locationKey)
            .order('observation_time', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          // Strategy 2: Proximity search - find nearest weather record within ~50km
          if (!weatherCurrent) {
            console.log(`⚠️ [Orchestrator] No exact match for ${locationKey}, searching nearby records...`);
            const latRange = 0.5; // ~55km
            const lonRange = 0.5;
            const { data: nearbyRecords } = await this.supabase
              .from('weather_current')
              .select('temperature_celsius, humidity_percent, wind_speed_kmh, rain_1h_mm, rain_24h_mm, weather_main, weather_description, uv_index, cloud_cover_percent, feels_like_celsius, pressure_hpa, wind_direction_degrees, wind_gust_kmh, visibility_km, observation_time, location_key, latitude, longitude')
              .gte('latitude', lat - latRange)
              .lte('latitude', lat + latRange)
              .gte('longitude', lon - lonRange)
              .lte('longitude', lon + lonRange)
              .order('observation_time', { ascending: false })
              .limit(5);
            
            if (nearbyRecords && nearbyRecords.length > 0) {
              let closest = nearbyRecords[0];
              let minDist = Infinity;
              for (const rec of nearbyRecords) {
                const d = Math.sqrt(Math.pow((rec.latitude || 0) - lat, 2) + Math.pow((rec.longitude || 0) - lon, 2));
                if (d < minDist) { minDist = d; closest = rec; }
              }
              weatherCurrent = closest;
              console.log(`✅ [Orchestrator] Found nearby weather at ${closest.location_key} (dist: ${(minDist * 111).toFixed(1)}km)`);
            }
          }
          
          if (weatherCurrent) {
            const matchKey = (weatherCurrent as any).location_key || locationKey;
            console.log(`🌤️ [Orchestrator] Using REAL weather data from weather_current (location_key: ${matchKey})`);
            // Also fetch 24h forecast for rain probability
            const { data: forecast } = await this.supabase
              .from('weather_forecasts')
              .select('temperature_celsius, temperature_min_celsius, temperature_max_celsius, rain_probability_percent, rain_amount_mm, wind_speed_kmh, wind_gust_kmh, weather_main')
              .eq('location_key', matchKey)
              .eq('forecast_type', 'daily')
              .gte('forecast_time', new Date().toISOString())
              .order('forecast_time', { ascending: true })
              .limit(1)
              .maybeSingle();

            // Check weather freshness — flag stale data
            const obsTime = weatherCurrent.observation_time ? new Date(weatherCurrent.observation_time).getTime() : 0;
            const ageHours = (Date.now() - obsTime) / (1000 * 60 * 60);
            const isStale = ageHours > 6;
            
            return {
              is_default: false,
              data_source: 'weather_current',
              observation_time: weatherCurrent.observation_time,
              confidence: isStale ? 'STALE' : 'HIGH',
              ...(isStale ? { warning: `Weather data is ${Math.round(ageHours)}h old — accuracy may be reduced` } : {}),
              current: {
                temperature_c: weatherCurrent.temperature_celsius ?? null,
                humidity_percent: weatherCurrent.humidity_percent ?? null,
                wind_speed_kmh: weatherCurrent.wind_speed_kmh ?? null,
                rainfall_last_24h_mm: weatherCurrent.rain_24h_mm ?? weatherCurrent.rain_1h_mm ?? 0,
                feels_like_c: weatherCurrent.feels_like_celsius,
                pressure_hpa: weatherCurrent.pressure_hpa,
                uv_index: weatherCurrent.uv_index,
                cloud_cover_percent: weatherCurrent.cloud_cover_percent,
                visibility_km: weatherCurrent.visibility_km,
                wind_direction_degrees: weatherCurrent.wind_direction_degrees,
                wind_gust_kmh: weatherCurrent.wind_gust_kmh,
                weather_condition: weatherCurrent.weather_main,
                weather_description: weatherCurrent.weather_description
              },
              forecast_24h: {
                rain_probability_percent: forecast?.rain_probability_percent ?? null,
                temperature_max_c: forecast?.temperature_max_celsius ?? null,
                temperature_min_c: forecast?.temperature_min_celsius ?? null,
                wind_max_kmh: forecast?.wind_gust_kmh ?? forecast?.wind_speed_kmh ?? null,
                rain_amount_mm: forecast?.rain_amount_mm ?? 0,
                weather_condition: forecast?.weather_main
              },
              forecast_72h: []
            };
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
  
  // normalizeWeatherData removed — was dead code (never called). 
  // fetchWeatherData now returns canonical format directly from weather_current table.
  
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
    landContext?: any,  // CRITICAL FIX: Accept landContext directly
    canonicalState?: any  // CRITICAL FIX: Accept enriched canonical state for crop fallback
  ): RuleExecutionInput {
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Use landContext parameter directly (NOT context.land_context)
    // The ContextState type does NOT include land_context - this was the root cause bug!
    // ═══════════════════════════════════════════════════════════════════════════
    
    const landCurrentCrop = landContext?.current_crop;
    // FIX 2 (STAGE INVARIANT): BiologicalState is the sole authority for stage.
    // Never let downstream fallbacks reintroduce a different stage.
    const bioStageAuthoritative: string | undefined =
      landContext?.biological_state?.growth_stage || landContext?.growth_stage;
    const landCropStage = bioStageAuthoritative;
    
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
    
    // CRITICAL FIX: Use canonical state crop (enriched from LLM semantic extractor + induction)
    // as fallback when land context has no crop. This ensures the crop detected from the
    // farmer's message (e.g., "my sugarcane...") flows to the rule engine.
    const canonicalCrop = canonicalState?.crop_type && canonicalState.crop_type !== 'UNKNOWN' 
      ? canonicalState.crop_type : undefined;
    
    // Priority: Land Context > Canonical State (enriched) > NLU entities > Fusion > fallback
    const rawCropCode = landCurrentCrop ||  // ALWAYS trust land's current crop
                        canonicalCrop ||     // ENRICHED canonical state (includes induction)
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
    // FIX 2: normalizeCropStage() collapses distinct biological stages (e.g.
    // ACTIVE_TILLERING/GRAND_GROWTH/RICE_TRANSPLANTING → VEGETATIVE), which
    // silently overwrites BiologicalState. When BiologicalState is present,
    // we KEEP its stage verbatim and only emit a normalized form for legacy
    // fallback code paths (never used to override the authoritative value).
    const normalizedStage = normalizeCropStage(rawCropStage);
    const cropStage = bioStageAuthoritative
      ? String(bioStageAuthoritative).toUpperCase()
      : normalizedStage;
    if (bioStageAuthoritative && normalizedStage && String(bioStageAuthoritative).toUpperCase() !== normalizedStage) {
      console.warn(
        `[STAGE_DRIFT_BLOCKED] land=${ids.landId ?? 'n/a'} ` +
        `bio_state=${bioStageAuthoritative} legacy_normalized=${normalizedStage} ` +
        `→ keeping BIOLOGICAL_STATE (rule_engine_stage=${cropStage})`
      );
    } else {
      console.log(
        `[STAGE_INVARIANT_PASS] land=${ids.landId ?? 'n/a'} ` +
        `bio_state=${bioStageAuthoritative ?? 'null'} canonical=${landContext?.growth_stage ?? 'null'} ` +
        `rule_engine=${cropStage}`
      );
    }
    
    // UNIFIED: Normalize crop code to DB short code ONCE via single source of truth
    const canonicalCropShortCode = unifiedNormalizeCropCode(basicCropCode);
    
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
          temperature_c: null,
          humidity_percent: null,
          wind_speed_kmh: null
        },
        weather_forecast_24h: fused.unified_context?.environmental?.weather_forecast_24h || {
          rain_probability_percent: null,
          temperature_max_c: null
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
        preferred_language: preferredLanguage || data?.language_preference || 'mr',
        name: data?.farmer_name || 'Farmer',
        literacy_level: (data?.education_level || 'MODERATE') as any,
        technical_knowledge: 'MODERATE',
        emotional_state: 'NEUTRAL'
      };
    } catch {
      return {
        preferred_language: preferredLanguage || 'mr',
        name: 'Farmer',
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
      } catch (error: any) {
        // FIX 7 (v6.1): Log actual error details instead of empty {}
        const errMsg = error?.message || error?.details || error?.hint || JSON.stringify(error);
        const errCode = error?.code || 'UNKNOWN';
        console.error(`   ❌ [${traceId}] Decision flow save FAILED [${errCode}]: ${errMsg}`);
        
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
  private buildNLUOutputWithRuleMapping(nluOutput: NLUOutput, fused: FusedIntelligence, frozenIntent?: string | null): any {
    // Extract intent for rule resolution
    // FORENSIC FIX (2026-07): Prefer the frozen graph intent (set by intent
    // freeze) over the raw NLU classifier. Without this, downstream logs
    // "Resolved 6 rule modules for intent: UNKNOWN" even after we've locked
    // intent=DIAGNOSTIC_INQUIRY.
    const nluIntent = (nluOutput.intent_classification?.primary_intent || 'GENERAL_QUERY') as NLUIntent;
    const intent = (frozenIntent && frozenIntent !== 'UNKNOWN' ? frozenIntent : nluIntent) as NLUIntent;
    
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
    language?: string,
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
          question_text_mr: '', // @deprecated — LLM translates at runtime
          question_text_hi: '', // @deprecated — LLM translates at runtime
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
    language: string = 'mr',
    landContext?: any
  ): OrchestratorResponse {
    console.error('❌ Orchestration error:', error.message);
    console.error('   Stack:', error.stack?.substring(0, 500));

    // ═══════════════════════════════════════════════════════════════════════
    // GRAPH_PIPELINE_BYPASSED invariant reconciliation.
    // The [ORCHESTRATOR_EXIT] audit in index.ts fails closed when it sees
    // `_evidenceFrozen=true` but `_graphExecuted=false` on a diagnostic
    // intent, because that pattern normally means a silent early return
    // skipped the hypothesis graph. A genuine SYSTEM_ERROR fallback (this
    // path) is a legitimate exit that already emits FINAL_RESPONSE_CONTRACT
    // with fallback_reason=SYSTEM_ERROR above. Reset the runtime flags so
    // the audit does not double-report the failure as a bypass and mask
    // the real error with a misleading 500 GRAPH_PIPELINE_BYPASSED.
    // ═══════════════════════════════════════════════════════════════════════
    try {
      (this as any)._evidenceFrozen = false;
      (this as any)._graphExecuted  = false;
      (this as any)._ruleResultExists = false;
      (this as any).__decisionGraphSequence = 0;
    } catch {/* flag reset must not throw */}


    // GRAPH CONTRACT — system-error fallback is legitimate. Emit the contract
    // line so downstream log analysis attributes the generic_template branch
    // to SYSTEM_ERROR rather than a silent symbolic-decision swap.
    try {
      emitFinalResponseContract({
        trace_id: `err_${sessionId}`,
        crop: landContext?.current_crop ?? null,
        bio_state_locked: !!(landContext as any)?.biological_state?.is_locked,
        real_observation_count: 0,
        hypotheses_count: 0,
        rules_loaded: 0,
        rules_matched: 0,
        symbolic_decision_available: false,
        diagnosis_available: false,
        final_source: 'generic_template',
        fallback_reason: 'SYSTEM_ERROR',
        system_error: true,
      });
    } catch {/* trace must not throw */}

    
    // PHASE-14: Log error to ai_chat_messages instead of nonexistent system_errors table
    // This ensures errors are visible in audit trail (non-blocking fire-and-forget)
    this.supabase.from('ai_chat_messages').update({
      error_details: {
        error_type: error.name,
        error_message: error.message,
        farmer_input_snippet: typeof farmerMessage === 'string' ? farmerMessage.substring(0, 200) : '[NO_TEXT]',
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
    const safeErrorMessage = typeof farmerMessage === 'string' ? farmerMessage : '';
    const messageLower = safeErrorMessage.toLowerCase();
    let fallbackAdvice = '';
    
    // Build context-aware advice if we have land data
    if (landContext?.current_crop && landContext?.growth_stage) {
      const cropName = landContext.current_crop;
      const stage = landContext.growth_stage;
      const days = landContext.days_since_sowing || '?';
      
      // ═══════════════════════════════════════════════════════════════════════════
      // REFACTORED: Use i18n keys instead of hardcoded Marathi/Hindi text
      // The actual text rendering happens in the narration/UI layer
      // This ensures SSOT compliance and easier maintenance
      // ═══════════════════════════════════════════════════════════════════════════
      
      const stageUpper = stage.toUpperCase();
      
      // Map stages to i18n keys - narration layer handles translation
      const stageI18nKeys: Record<string, string> = {
        'GERMINATION': 'error.fallback.stage.germination',
        'SEEDLING': 'error.fallback.stage.seedling',
        'TILLERING': 'error.fallback.stage.tillering',
        'VEGETATIVE': 'error.fallback.stage.vegetative',
        'STEM_ELONGATION': 'error.fallback.stage.stem_elongation',
        'GRAND_GROWTH': 'error.fallback.stage.grand_growth',
        'FLOWERING': 'error.fallback.stage.flowering',
        'GRAIN_FILLING': 'error.fallback.stage.grain_filling',
        'MATURITY': 'error.fallback.stage.maturity',
        'HARVEST': 'error.fallback.stage.harvest'
      };
      
      const i18nKey = stageI18nKeys[stageUpper] || 'error.fallback.stage.generic';
      
      // Build symbolic fallback advice with data placeholders
      // Narration layer will resolve i18n_key and inject data
      fallbackAdvice = `[i18n:${i18nKey}][crop:${cropName}][days:${days}][stage:${stageUpper}]`;
    }
    
    // If no stage advice, detect query type and provide relevant generic advice
    if (!fallbackAdvice) {
      // English-only fallbacks — LLM narration layer translates at runtime
      if (/खत|खाद|urea|dap|fertilizer|युरिया|डीएपी/.test(messageLower)) {
        fallbackAdvice = '🌱 Fertilizer advice: Get soil tested and apply NPK as recommended. Tell me your crop name and age.';
      } else if (/पाणी|पानी|water|irrigation|सिंचन|सिंचाई/.test(messageLower)) {
        fallbackAdvice = '💧 Water management: Irrigate in morning or evening. Avoid waterlogging. Tell me your crop.';
      } else if (/किडी|कीट|कीड|pest|अळी|माशी|insect|बग|कीड़ा/.test(messageLower)) {
        fallbackAdvice = '🐛 Pest control: Spray 5% neem extract. Send a photo for accurate diagnosis.';
      } else if (/रोग|disease|वाळणे|पिवळे|बुरशी|fungus|wilting|yellow/.test(messageLower)) {
        fallbackAdvice = '🌿 Disease control: Remove affected parts. Send a photo for accurate diagnosis.';
      }
    }
    
    // Add photo request if no specific advice
    if (!fallbackAdvice) {
      fallbackAdvice = '📸 For more accurate advice, please send a photo of your crop or describe the problem in detail.';
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
   * FIXED: Now uses weather_observations table (the correct one)
   */
  private async fetchWeatherHistoryForGDD(lat?: number, lon?: number, landId?: string): Promise<Array<{ date: string; tmax: number; tmin: number }>> {
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
      // PRIORITY 1: Try weather_historical table (most accurate for GDD)
      const { data: historical, error: histError } = await this.supabase
        .from('weather_historical')
        .select('record_date, temperature_min_celsius, temperature_max_celsius, growing_degree_days')
        .gte('record_date', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('record_date', { ascending: false })
        .limit(14);
      
      if (historical && historical.length > 0) {
        console.log(`🌡️ [GDD] Fetched ${historical.length} days from weather_historical (best source)`);
        return historical.map((d: any) => ({
          date: d.record_date,
          tmax: d.temperature_max_celsius || 35,
          tmin: d.temperature_min_celsius || 20
        }));
      }
      
      // PRIORITY 2: Try weather_aggregates which has min/max temps
      if (landId) {
        const { data: aggregates, error: aggError } = await this.supabase
          .from('weather_aggregates')
          .select('aggregate_date, temp_min_celsius, temp_max_celsius, gdd_accumulated')
          .eq('land_id', landId)
          .gte('aggregate_date', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .order('aggregate_date', { ascending: false })
          .limit(14);
        
        if (aggregates && aggregates.length > 0) {
          console.log(`🌡️ [GDD] Fetched ${aggregates.length} days from weather_aggregates for land ${landId}`);
          return aggregates.map((d: any) => ({
            date: d.aggregate_date,
            tmax: d.temp_max_celsius || 35,
            tmin: d.temp_min_celsius || 20
          }));
        }
      }
      
      // PRIORITY 3: Try weather_observations table
      const { data, error } = await this.supabase
        .from('weather_observations')
        .select('observation_date, temperature_celsius, metadata')
        .eq('land_id', landId || null)
        .gte('observation_date', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('observation_date', { ascending: false })
        .limit(100); // Get more observations to group by date
      
      if (data && data.length > 0) {
        console.log(`🌡️ [GDD] Fetched ${data.length} observations from weather_observations`);
        // Group by date and estimate min/max from observations
        const byDate = new Map<string, number[]>();
        data.forEach((d: any) => {
          const dateKey = d.observation_date;
          if (!byDate.has(dateKey)) byDate.set(dateKey, []);
          if (d.temperature_celsius) byDate.get(dateKey)!.push(d.temperature_celsius);
        });
        
        return Array.from(byDate.entries()).slice(0, 14).map(([date, temps]) => ({
          date,
          tmax: Math.max(...temps) + 3, // Estimate max
          tmin: Math.min(...temps) - 3  // Estimate min
        }));
      }
    } catch (e) {
      console.warn('⚠️ [GDD] Weather history fetch failed, using seasonal defaults:', e);
    }
    
    // Fallback to seasonal averages
    console.log('📊 [GDD] Using seasonal average temperatures for GDD calculation');
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
  
  // [STEP 7 REMOVED] applyPHIBlocking / applyPollinatorBlocking — SafetyGuardian
  // owns product substitution and blocked_actions population end-to-end.

  
  // ═══════════════════════════════════════════════════════════════════════════
  // P1-A: CROP HEALTH RESPONSE GENERATOR - REFACTORED TO SYMBOLIC OUTPUT
  // Returns structured data + i18n_keys, NOT hardcoded language text
  // Narration layer handles all text rendering
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateCropHealthResponse(
    landContext: any,
    _language: string // Kept for backward compat but NOT used for text
  ): { 
    message: string;  // DEPRECATED: Narration layer fills this
    confidence: number; 
    suggestions: string[]; 
    actions: any[]; 
    isCritical: boolean;
    // NEW: Symbolic output for narration layer
    symbolic_output?: {
      health_status_code: string;
      i18n_key: string;
      data_points: Record<string, any>;
      action_codes: string[];
    };
  } {
    const crop = landContext.current_crop || '';
    const cropCode = (crop || '').toUpperCase();
    const stage = landContext.growth_stage || 'VEGETATIVE';
    const das = landContext.days_since_sowing || 0;
    const ndvi = landContext.ndvi?.value || landContext.ndvi?.ndvi_value;
    const ndviTrend = landContext.ndvi?.ndvi_trend;
    const soil = landContext.soil_health;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // NDVI THRESHOLDS BY CROP + STAGE (ICAR Standards) - Pure data, no language
    // ═══════════════════════════════════════════════════════════════════════════
    
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
    
    const stageUpper = (stage || 'VEGETATIVE').toUpperCase();
    const expectedNdvi = EXPECTED_NDVI_BY_STAGE[stageUpper] || { min: 0.35, critical: 0.20 };
    
    // Calculate nitrogen state
    const nitrogenKgPerHa = soil?.nitrogen_kg_per_ha;
    let nitrogenState: 'LOW' | 'ADEQUATE' | 'HIGH' = 'ADEQUATE';
    
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
    // HEALTH STATUS DETERMINATION - SYMBOLIC CODES ONLY
    // ═══════════════════════════════════════════════════════════════════════════
    
    let healthStatusCode: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'CONCERN' | 'CRITICAL' = 'GOOD';
    let isCritical = false;
    const actionCodes: string[] = [];
    
    if (ndvi !== undefined) {
      if (ndvi < expectedNdvi.critical) {
        healthStatusCode = 'CRITICAL';
        isCritical = true;
        console.log(`🚨 [NDVI CRITICAL] NDVI=${ndvi} < critical threshold ${expectedNdvi.critical} for stage ${stageUpper}`);
      } else if (ndvi < expectedNdvi.min) {
        healthStatusCode = 'CONCERN';
      } else if (ndvi >= 0.6) {
        healthStatusCode = 'EXCELLENT';
      } else if (ndvi >= 0.4) {
        healthStatusCode = 'GOOD';
      } else {
        healthStatusCode = 'MODERATE';
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BUILD SYMBOLIC ACTIONS - i18n_keys, NOT text
    // ═══════════════════════════════════════════════════════════════════════════
    
    const actions: any[] = [];
    
    if (nitrogenState === 'LOW') {
      const ureaDosage = cropCode === 'WHEAT' ? '50' : cropCode === 'RICE' ? '45' : '40';
      actions.push({
        action_type: 'APPLY_FERTILIZER',
        action_code: 'APPLY_UREA',
        i18n_key: 'action.apply_urea',
        product_code: 'UREA_46N',
        dosage_value: ureaDosage,
        dosage_unit: 'kg/acre',
        priority: isCritical ? 'URGENT' : 'HIGH',
        data: { nitrogen_kg_ha: nitrogenKgPerHa }
      });
      actionCodes.push('APPLY_UREA');
    }
    
    // Always add monitoring action
    actions.push({
      action_type: 'MONITOR',
      action_code: 'MONITOR_CROP',
      i18n_key: 'action.monitor_regular',
      priority: 'MEDIUM',
      timing_code: 'EVERY_3_5_DAYS'
    });
    actionCodes.push('MONITOR_CROP');
    
    // Add urgent actions for critical status
    if (isCritical) {
      actionCodes.push('CHECK_IRRIGATION', 'INSPECT_PEST_DISEASE', 'CONSULT_EXPERT');
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BUILD SYMBOLIC OUTPUT - Narration layer renders to farmer language
    // ═══════════════════════════════════════════════════════════════════════════
    
    const symbolicOutput = {
      health_status_code: healthStatusCode,
      i18n_key: `crop_health.status.${healthStatusCode.toLowerCase()}`,
      data_points: {
        crop_code: cropCode,
        stage_code: stageUpper,
        days_after_sowing: das,
        ndvi_value: ndvi,
        ndvi_expected_min: expectedNdvi.min,
        ndvi_trend: ndviTrend,
        nitrogen_state: nitrogenState,
        nitrogen_kg_ha: nitrogenKgPerHa,
        phosphorus_kg_ha: soil?.phosphorus_kg_per_ha,
        potassium_kg_ha: soil?.potassium_kg_per_ha,
        ph_level: soil?.ph_level
      },
      action_codes: actionCodes
    };
    
    // Suggestion codes for quick actions (not hardcoded text)
    const suggestionCodes = ['PEST_QUERY', 'IRRIGATION_QUERY', 'FERTILIZER_QUERY'];
    
    return {
      message: '', // DEPRECATED: Narration layer fills this from symbolic_output
      confidence: ndvi !== undefined ? 0.85 : 0.65,
      suggestions: suggestionCodes, // These are CODES, not display text
      actions,
      isCritical,
      symbolic_output: symbolicOutput
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 8: GREETING RESPONSE GENERATOR - SYMBOLIC ONLY
  // REFACTORED: Returns i18n_key, narration layer handles text
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateGreetingResponse(
    sessionId: string,
    language: string,
    startTime: number,
    agentsUsed: string[],
    traceId: string
  ): OrchestratorResponse {
    // FIX H1: Populate full_text directly so greeting always renders
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
        // FIX H1: Direct full_text population instead of i18n_key-only approach
        main_message: {
          i18n_key: 'greeting.welcome',
          full_text: {
            en: '🙏 Hello! I am SATHI - your agricultural advisor. How can I help you today?'
          },
          fallback_text: ''
        },
        // SYMBOLIC: action_codes instead of hardcoded labels
        quick_actions: [
          { action_code: 'PEST_QUERY', i18n_key: 'quick_action.pest_problem', icon_code: 'PEST' },
          { action_code: 'WATER_QUERY', i18n_key: 'quick_action.irrigation', icon_code: 'WATER' },
          { action_code: 'FERTILIZER_QUERY', i18n_key: 'quick_action.fertilizer', icon_code: 'FERTILIZER' }
        ],
        metadata: {
          word_count: 0, // Narration layer calculates
          reading_time_seconds: 5,
          confidence_score: 1.0,
          source: 'GREETING',
          response_type: 'GREETING',
          i18n_driven: true
        }
      } as any,
      decision_output: {
        decision_id: `greeting_${Date.now()}`,
        session_id: sessionId,
        status: 'INFORMATION_PROVIDED',
        decision_brain_source: false,
        actions_returned: [],
        // SYMBOLIC: Include i18n_key in output
        primary_i18n_key: 'greeting.welcome',
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
  // P1-2: AUTHORITY BLOCK MESSAGE GENERATOR - REFACTORED TO SYMBOLIC
  // Returns i18n_key + reason_code, narration layer renders text
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateAuthorityBlockMessage(
    authority: string,
    reason: string,
    _language: string // Kept for backward compat but NOT used
  ): string {
    // SYMBOLIC: Return an i18n_key marker that narration layer will resolve
    // The actual text rendering happens in narration layer
    const i18nKey = `authority_block.${authority.toLowerCase()}`;
    console.log(`[SYMBOLIC] Authority block: ${authority}, i18n_key: ${i18nKey}, reason: ${reason}`);
    
    // Return empty string - caller should use symbolic output instead
    // This maintains backward compatibility while encouraging migration
    return `[i18n:${i18nKey}][reason:${reason}]`;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P1-2: LAND STRESS WARNING - REFACTORED TO SYMBOLIC
  // ═══════════════════════════════════════════════════════════════════════════
  
  private prependLandStressWarning(
    originalMessage: string,
    reason: string,
    _language: string // Kept for backward compat but NOT used
  ): string {
    // SYMBOLIC: Return marker for narration layer
    console.log(`[SYMBOLIC] Land stress warning, reason: ${reason}`);
    return `[i18n:land_stress_warning][reason:${reason}]\n\n${originalMessage}`;
  }
}

export const orchestrator = new AIAgentOrchestrator();
