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
