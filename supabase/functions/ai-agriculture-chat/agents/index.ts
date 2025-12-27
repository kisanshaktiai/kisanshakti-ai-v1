/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI AGENTS INDEX - KisanShakti Decision Brain
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-grade AI agents for agricultural advisory system.
 * Total Agents: 12 (Agents 1 & 2A implemented, 10 more to follow)
 */

// Agent 1: Natural Language Understanding
export * from './types.ts';
export * from './agricultural-vocabulary.ts';
export { processNLUAgent, NLU_VERSION } from './nlu-agent.ts';

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
