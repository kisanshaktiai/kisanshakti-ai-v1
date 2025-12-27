/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI AGENTS INDEX - KisanShakti Decision Brain
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-grade AI agents for agricultural advisory system.
 * Agents: NLU, Visual Intelligence, Context Manager, Diagnostic Flow
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
