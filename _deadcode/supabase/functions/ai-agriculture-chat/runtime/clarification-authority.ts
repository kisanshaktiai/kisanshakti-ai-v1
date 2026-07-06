/**
 * Phase H — Clarification Authority (single decision point).
 * Reads only from a frozen ConversationState. Never mutates.
 */
import type { ConversationState } from './conversation-state.ts';

export interface ClarificationDecision {
  required: boolean;
  reason: string;
  source: 'CONVERSATION_STATE';
}

export function decideClarification(state: ConversationState): ClarificationDecision {
  return {
    required: state.clarification_required,
    reason:   state.clarification_reason,
    source:   'CONVERSATION_STATE',
  };
}
