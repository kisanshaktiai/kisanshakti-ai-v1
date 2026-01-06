/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI AGENTS INDEX - KisanShakti Decision Brain
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-grade AI agents for agricultural advisory system.
 * Agents: NLU, Visual Intelligence, Context Manager, Diagnostic Flow, Rule Engine
 */

// Agent 1: Natural Language Understanding
export * from './types.ts';
export * from './agricultural-vocabulary.ts';
export { processNLUAgent, NLU_VERSION } from './nlu-agent.ts';

// Agent 1B: Visual Intelligence Agent
export * from './visual-agent-types.ts';
export { processVisualAgent, VISUAL_AGENT_VERSION } from './visual-agent.ts';

// Agent 2A: Context-Aware Conversation Manager
export * from './context-manager-types.ts';
export { 
  processContextManager, 
  CONTEXT_MANAGER_VERSION,
  QUESTION_BANK,
  createNewSession,
  getNextQuestion,
  detectContextSwitch 
} from './context-manager.ts';

// Agent 2B: Intelligent Diagnostic Flow Controller
export * from './hypothesis-types.ts';
export * from './diagnostic-questions-bank.ts';
export { 
  DIAGNOSTIC_QUESTIONS_BANK,
  getQuestionsForHypothesis,
  getDifferentiatingQuestions 
} from './diagnostic-questions-bank.ts';

// Rule Module Integration (Maps NLU to decision-graph rules)
export * from './rule-module-types.ts';
export * from './rule-module-resolver.ts';
export * from './diagnostic-flow-controller.ts';
export { DiagnosticFlowController } from './diagnostic-flow-controller.ts';
export { resolveRuleModules, buildNLUOutputWithRuleMapping } from './rule-module-resolver.ts';

// Decision Graph Bridge (Connects symbolic rules to agent execution)
export * from './decision-graph-bridge.ts';
export { evaluateDecisionGraph } from './decision-graph-bridge.ts';

// Decision Authority Resolver (Land-First Governance Layer)
export * from '../decision/authority-resolver.ts';
export { 
  resolveDecisionAuthority,
  shouldSkipCropRules,
  isDomainAllowed,
  areTreatmentsAllowed,
  buildAuthorityAuditEntry,
  DecisionAuthority,
  AuthorityStatus,
  AUTHORITY_RESOLVER_VERSION
} from '../decision/authority-resolver.ts';

// Prescription Gate Enforcer (Symbolic-Only Output Control)
export * from '../decision/prescription-gate-enforcer.ts';
export {
  enforcePrescriptionGate,
  generateObservationOnlyResponse,
  generateYoungCropMonitoringResponse,
  buildPrescriptionGateAudit,
  ResponseMode,
  AuthorityConfirmation,
  PRESCRIPTION_GATE_VERSION
} from '../decision/prescription-gate-enforcer.ts';

// Decision Readiness Gate (Hard Safety Gate - Phase 12)
export * from '../decision/decision-readiness-gate.ts';
export {
  checkDecisionReadiness,
  detectEmergencyIndicators,
  validateClarificationReEntry,
  validateOutputBeforeSend,
  GateStatus,
  GateAction,
  DECISION_READINESS_GATE_VERSION
} from '../decision/decision-readiness-gate.ts';

// Clarification Re-Entry Controller (State Preservation - Phase 12)
export * from '../decision/clarification-reentry-controller.ts';
export {
  validateStatePreservation,
  processClarificationAnswer,
  checkClarificationExitStrategy,
  createCanonicalSessionState,
  CLARIFICATION_REENTRY_VERSION
} from '../decision/clarification-reentry-controller.ts';

// UI Selection Contract (Decision Brain Controlled UI - Phase 12)
export * from '../decision/ui-selection-contract.ts';
export {
  getSelectionTypeForScope,
  validateMultiSelectResponse,
  validateUIResponse,
  SelectionType,
  UI_SELECTION_CONTRACT_VERSION
} from '../decision/ui-selection-contract.ts';

// Type Mappers (Enum conversions and trace ID generation)
export * from './type-mappers.ts';
export { generateTraceId, mapPriorityToAgent, mapAgentPriorityToGraph } from './type-mappers.ts';

// Agent 3: Rule Engine Executor & Decision Synthesizer
export * from './rule-engine-types.ts';
export * from './economic-calculator.ts';
export * from './conflict-resolver.ts';
export { RuleEngineExecutor, ruleEngineExecutor, RULE_ENGINE_VERSION } from './rule-engine-executor.ts';

// Agent 4: Farmer Communication Generator (Multilingual)
export * from './communication-types.ts';
export { CommunicationGenerator, communicationGenerator, COMMUNICATION_VERSION } from './communication-generator.ts';

// Multi-Modal Fusion Engine
export * from './multimodal-fusion-types.ts';
export { MultiModalFusionEngine, multiModalFusion, MULTIMODAL_FUSION_VERSION } from './multimodal-fusion.ts';

// Agent 5: Feedback Learning & Improvement Engine
export * from './feedback-learning-types.ts';
export { FeedbackLearningEngine, feedbackLearning } from './feedback-learning.ts';

// Agent 6: Safety Guardian & Escalation Manager
export * from './safety-guardian-types.ts';
export { SafetyGuardian, safetyGuardian, SAFETY_GUARDIAN_VERSION } from './safety-guardian.ts';

// Master Orchestrator (Coordinates all agents)
export { AIAgentOrchestrator, orchestrator, ORCHESTRATOR_VERSION } from './orchestrator.ts';
export type { OrchestratorResponse, OrchestratorResponseType } from './orchestrator.ts';

// Crop Knowledge Base (Fallback advice)
export * from './crop-knowledge-base.ts';
export { CROP_KNOWLEDGE, getCropAdvice, getStageAdvice, getClarifyingQuestions } from './crop-knowledge-base.ts';

// Fallback Response Generator (Error recovery)
export * from './fallback-response-generator.ts';
export { FallbackResponseGenerator, fallbackGenerator, generateFallbackResponse } from './fallback-response-generator.ts';

// Soil-NDVI State Calculator (Crop-specific calculations)
export * from './soil-ndvi-state-calculator.ts';
export { 
  calculateNitrogenState, 
  calculatePhosphorusState, 
  calculatePotassiumState,
  mapNDVIToState,
  calculateNDVITrend,
  normalizeSoilType,
  validateCropContext,
  logLandCropStateCalculation
} from './soil-ndvi-state-calculator.ts';

// Enhanced Intent Classification & Routing (PART 1)
export * from './intent-router.ts';
export { classifyEnhancedIntent, getResponseGuidelines } from './intent-router.ts';

// Agronomic Validation (PART 4)
export * from './agronomic-validator.ts';
export { validateAgronomicAccuracy, getIPMDefaultRecommendation, PEST_BIOLOGY, IPM_DEFAULTS } from './agronomic-validator.ts';

// Language Quality Validation (PART 5)
export * from './language-quality-validator.ts';
export { validateLanguageQuality, enforceTermConsistency, getSafeAskMoreInfoMessage } from './language-quality-validator.ts';

// Response Validation Gate (PART 9)
export * from './response-validation-gate.ts';
export { validateResponseBeforeSend } from './response-validation-gate.ts';

// Static Data Gate (CRITICAL: Zero-AI cost for land attribute queries)
export * from './static-data-gate.ts';
export { checkStaticDataGate, validateLandContextForCropQueries } from './static-data-gate.ts';

// Centralized Entity Normalizer (CRITICAL: Single source of truth for pest/disease/crop codes)
export * from './entity-normalizer.ts';
export { normalizePestEntity, normalizeDiseaseEntity, normalizeCropEntity, validateEntityConsistency } from './entity-normalizer.ts';

// Data Validator (PHASE 1: NDVI-Stage validation, growth stage calculation)
export * from './data-validator.ts';
export { 
  validateNDVIForStage, 
  calculateGrowthStage, 
  validateGrowthStage,
  canRecommendHarvest,
  validateSoilData,
  generateDataQualityReport,
  MINIMUM_HARVEST_DAYS,
  DATA_VALIDATOR_VERSION
} from './data-validator.ts';

// Crop Stage Advisor (PHASE 5: Stage-specific decision trees)
export * from './crop-stage-advisor.ts';
export {
  getStageSpecificAdvice,
  getWaterAdvice,
  getCriticalActions,
  getPestWatch,
  shouldAvoidAction,
  CROP_STAGE_ADVISOR_VERSION
} from './crop-stage-advisor.ts';

// ═══════════════════════════════════════════════════════════════════════════
// P0 CRITICAL MODULES - World-Class Agricultural Science (Audit Implementation)
// ═══════════════════════════════════════════════════════════════════════════

// GDD Phenology Engine (GAP 1.1, 1.2, 1.3: Replaces fixed DAS with thermal units)
export * from './gdd-phenology-engine.ts';
export {
  calculatePhenologicalStage,
  calculateDailyGDD,
  calculateAccumulatedGDD,
  estimateGDDFromAverage,
  calculateDayLength,
  getPhotoperiodInfo,
  CROP_GDD_CONFIG,
  WHEAT_PHENOLOGY,
  RICE_PHENOLOGY,
  COTTON_PHENOLOGY,
  SUGARCANE_PHENOLOGY,
  GDD_PHENOLOGY_VERSION
} from './gdd-phenology-engine.ts';

// NLP Agriculture Validator (GAP 2.1, 2.2, 2.3: Marathi/Hindi dialect + fuzzy matching)
export * from './nlp-agriculture-validator.ts';
export {
  validateAgricultureNLP,
  fuzzyMatchAgTerm,
  detectGibberish,
  devanagariSoundex,
  isPhoneticallySimilar,
  MARATHI_AG_VOCABULARY,
  HINDI_AG_VOCABULARY,
  DIALECT_NORMALIZATIONS,
  FORBIDDEN_COMBINATIONS,
  NLP_VALIDATOR_VERSION
} from './nlp-agriculture-validator.ts';

// PHI Enforcement Guardian (GAP 6.1: Pre-Harvest Interval safety blocking)
export * from './phi-enforcement-guardian.ts';
export {
  checkPHISafety,
  enforcePHI,
  getChemicalPHI,
  getSafeAlternativesForPest,
  PHI_DATABASE,
  NEAR_HARVEST_ALTERNATIVES,
  PHI_GUARDIAN_VERSION
} from './phi-enforcement-guardian.ts';

// Pollinator Protection Rules (GAP 6.2: Bee-safe spray restrictions)
export * from './pollinator-protection-rules.ts';
export {
  checkPollinatorSafety,
  enforcePollinatorProtection,
  getPollinatorProfile,
  isFloweringStage,
  POLLINATOR_TOXICITY_DB,
  POLLINATOR_DEPENDENT_CROPS,
  POLLINATOR_PROTECTION_VERSION
} from './pollinator-protection-rules.ts';
