/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION GRAPH - TYPES-ONLY FRONTEND EXPORT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SECURITY: This file exports ONLY TypeScript types, interfaces, and enums.
 * All rule logic has been migrated to the backend (Supabase Edge Function).
 * 
 * Frontend files should import from '@/decision-graph' or '@/decision-graph/types-only'
 * Both are equivalent and safe for frontend use.
 */

// Re-export all types from the main types file
export * from './types';

// Note: All rule evaluation now happens server-side in:
// supabase/functions/ai-agriculture-chat/source-rules/
