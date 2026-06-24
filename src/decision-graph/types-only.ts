/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TYPES-ONLY EXPORT - FRONTEND SAFE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file re-exports ONLY TypeScript types, interfaces, and enums from types.ts.
 * NO rule data, NO condition functions, NO business logic.
 * 
 * SECURITY: This is the ONLY file from decision-graph that frontend
 * components should import from. All actual rule evaluation happens
 * server-side in the Supabase Edge Function.
 * 
 * Frontend files should import from '@/decision-graph/types-only'
 * instead of '@/decision-graph' to prevent rule exposure.
 */

// Re-export all types from the main types file
// types.ts contains ONLY type definitions, no rule logic
export * from './types';
