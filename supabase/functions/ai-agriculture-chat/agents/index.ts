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

// Centralized Entity Normalizer (CRITICAL: Single source of truth for pest/disease/crop codes)
export * from './entity-normalizer.ts';
export { normalizePestEntity, normalizeDiseaseEntity, normalizeCropEntity, validateEntityConsistency } from './entity-normalizer.ts';
