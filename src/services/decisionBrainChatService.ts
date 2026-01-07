/**
 * @deprecated This file has been deprecated in favor of the backend 9-agent orchestrator.
 * All chat logic now flows through supabase/functions/ai-agriculture-chat
 * 
 * Kept for reference only - do not use in production.
 * See: supabase/functions/ai-agriculture-chat/agents/orchestrator.ts
 */

export const DEPRECATED_MESSAGE = 'This module has been deprecated. Use the 9-agent orchestrator instead.';

// Re-export types that other files might depend on
export interface LandContext {
  land_id: string;
  land_name?: string;
  crop_code?: string;
  crop_group?: string;
  crop_stage?: string;
  sowing_date?: string;
  [key: string]: unknown;
}

// Empty placeholder exports to prevent import errors in dependent files
export function getDecisionBrainResponse() {
  throw new Error(DEPRECATED_MESSAGE);
}
