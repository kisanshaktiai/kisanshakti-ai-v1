/**
 * AI Agriculture Chat - Orchestrator-Based Entry Point
 * Full migration to 9-agent orchestrator system
 * v7.0.1 - Romanized language detection + app language enforcement
 */

// BUILD_TAG bumps force the edge runtime to pick up dependent module changes
// (e.g. intent-classifier v4 canonical-intent whitelist). Visible in cold-start logs.
const BUILD_TAG = 'ai-agri-chat::classifier-v4-canonical::2026-05-31T16:45Z';
console.log(`[ai-agriculture-chat] BOOT ${BUILD_TAG}`);


// XHR polyfill removed to reduce bundle size - Deno fetch is used everywhere
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { guardTenantAccess } from '../_shared/tenantAccessGuard.ts';
import { getLanguageName, getScriptRegex, isDevanagariLanguage } from './utils/language-utils.ts';
import { getMaxDASForCrop } from './utils/baseline-guidelines-cache.ts';
import { loadFarmerProfileLite, getFarmerAddressing, type FarmerAddressing } from '../_shared/farmerAddressing.ts';

// Import orchestrator
import { AIAgentOrchestrator } from './agents/orchestrator.ts';
import type { OrchestratorResponse } from './agents/orchestrator.ts';

// Task 7a: per-request scope + typed engine errors
import {
  createRequestScope,
  EngineDataError,
  IntentResolutionError,
  InvariantViolation,
  type RequestScope,
} from './runtime/request-scope.ts';


// CANONICAL ADVISORY: Build structured advisory JSON for frontend rendering
import { buildCanonicalAdvisory, buildMultiRuleAdvisory } from './agents/canonical-advisory-schema.ts';
import { extractRichRuleData, buildDeterministicResponse, hasAdequateRuleContent } from './agents/deterministic-response-builder.ts';
import type { WeatherContext, CropContext } from './agents/deterministic-response-builder.ts';

// PHASE 5: Import LLM Response Formatter for natural language generation
import { formatRecommendationsWithLLM, sanitizeFarmerResponse } from './agents/llm-response-formatter.ts';
import type { LLMFormatterInput, LLMFormatterOutput } from './agents/llm-response-formatter.ts';

// Deterministic variety SSOT assertion (pre + post LLM gate)
import {
  assertVarietyInjected,
  assertResponseHonorsVariety,
} from '../_shared/variety-assertion.ts';

// Legacy helpers removed - dead code cleanup

// NOTE: General chat is handled by a separate edge function (`ai-general-chat`).
// This function is now strictly the symbolic-decision-brain endpoint.

// CRITICAL FIX: Import translation functions for farmer-friendly product names
import { 
  getProductName, 
  getActionTranslation, 
  getMethodTranslation,
  getUrgencyTranslation
} from './agents/communication-translation-dictionary.ts';

// PRODUCT MAPPING: Ingredient → Market Product brand names
import { lookupMarketProducts, formatMarketProducts } from './agents/market-product-lookup.ts';

// SYMBOLIC BRAIN: Import validation from decision representation
import { validateLLMOutputIntegrity } from './agents/decision-representation.ts';

// PHASE 11: Import Unified Decision Gate (P1-4 fix - single gate)
import { 
  evaluateUnifiedGate,
  applySuppressionGuard,
  type UnifiedGateInput
} from './decision/unified-decision-gate.ts';

// WAVE-R: Symbolic safety invariants — "no rule fired → no treatment text".
import { firedRuleIds, rulesActuallyFired } from './runtime/rules-fired.ts';
import { enforceNoRuleNoTreatment } from './decision/symbolic-invariant-gate.ts';
import { runSafetyGates, type SafetyGateInput, type SafetyGateResult } from './decision/safety-gates.ts';
import { buildDifferentialQuestionLookup } from './services/observation-question-resolver.ts';
import {
  ResponseMode,
  GateStatus,
  GateAction
} from './decision/authority-types.ts';
import {
  generateObservationOnlyResponse,
  generateYoungCropMonitoringResponse
} from './decision/prescription-gate-enforcer.ts';

// WAVE A.5 / Phase 2: defence-in-depth gate + observability
import { enforceClarificationInvariant } from './decision/clarification-invariant-gate.ts';
import { logDecisionTurn, logOrchestratorMetrics } from './runtime/decision-logger.ts';
import { getRuleSource } from './runtime/feature-flags.ts';
import { selectCandidateRuleIdsFromDb } from './bundled-rules/db-rule-executor.ts';
import { computeRuleSourceDiff, type RuleSourceDiff } from './bundled-rules/rule-source-diff.ts';
import { funnelStart, funnelEnd, type FunnelSnapshot } from './runtime/funnel-tracker.ts';
import {
  lookupSafeRuleForObservations,
  extractObservationCodes,
  type ObservationRuleHit
} from './decision/observation-rule-lookup.ts';
import { resolveCropTimeline } from './utils/resolveCropTimeline.ts';
import { getSiteDisposition } from './utils/clarification-site-tag.ts';
import {
  generateDiagnosticEscalationResponse,
  generateDiagnosticEscalationData,
  type DiagnosticEscalationInput
} from './decision/diagnostic-escalation-generator.ts';
import { enrichDiagnosticDifferential } from './decision/diagnostic-differential-enricher.ts';

// PHASE 11.1: Context Authority Reconciliation
import { 
  resolveFinalRenderContext,
  type CropContextAuthority
} from './decision/context-authority.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token, x-client-domain, if-none-match, origin, cache-control, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST DEDUPLICATION GUARD
// Prevents double-tap / duplicate concurrent requests from the same farmer
// ═══════════════════════════════════════════════════════════════════════════

interface InFlightRequest {
  promise: Promise<Response>;
  expiresAt: number;
}

const inFlightRequests = new Map<string, InFlightRequest>();
const DEDUP_WINDOW_MS = 5000; // 5-second dedup window

function getDedupeKey(farmerId: string, message: string): string {
  // Hash based on farmer + first 100 chars of message (covers double-tap)
  const msgSnippet = (message || '').substring(0, 100).trim().toLowerCase();
  return `${farmerId}:${msgSnippet}`;
}

function cleanExpiredInflight(): void {
  const now = Date.now();
  for (const [key, entry] of inFlightRequests) {
    if (now > entry.expiresAt) inFlightRequests.delete(key);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION FIX: Rich Application Details Builder
// Ensures ALL 50+ agronomic fields from decision_rules propagate through
// recovery paths to the deterministic response builder.
// Without this, extractRichRuleData() in llm-response-formatter.ts receives
// empty fields and the deterministic builder produces skeleton responses.
// ═══════════════════════════════════════════════════════════════════════════
function buildRichApplicationDetails(source: any, productName: string | null, productType: string | null): Record<string, any> {
  return {
    // Identity
    product_name: productName,
    product_type: productType,
    rule_id: source.rule_id,
    
    // Narrative
    action_text: source.action_text || null,
    reason_text: source.reason_text || null,
    knowledge_text: source.knowledge_text || null,
    i18n_key: source.i18n_key || null,
    decision_trace_template: source.decision_trace_template || null,
    cause: source.cause || null,
    
    // Product & Dosage
    active_ingredient: source.active_ingredient || null,
    dosage_per_acre: source.dosage_per_acre || null,
    water_volume_per_acre: source.water_volume_per_acre || null,
    application_method: source.application_method || null,
    target_pest_stage: source.target_pest_stage || null,
    chemical_class: source.chemical_class || null,
    mode_of_action: source.mode_of_action || null,
    resistance_group: source.resistance_group || null,
    treatment_type: source.treatment_type || null,
    
    // Safety
    phi_days: source.phi_days || null,
    reentry_interval_hours: source.reentry_interval_hours || null,
    bee_toxicity: source.bee_toxicity || null,
    aquatic_toxicity: source.aquatic_toxicity || null,
    farmer_safety_level: source.farmer_safety_level || null,
    regulatory_status: source.regulatory_status || null,
    
    // IPM / Organic
    organic_alternative: source.organic_alternative || null,
    biological_group: source.biological_group || null,
    ipm_level: source.ipm_level || null,
    
    // Cost
    material_cost_per_acre_min: source.material_cost_per_acre_min || null,
    material_cost_per_acre_max: source.material_cost_per_acre_max || null,
    labor_cost_per_acre_min: source.labor_cost_per_acre_min || null,
    labor_cost_per_acre_max: source.labor_cost_per_acre_max || null,
    labor_hours_per_acre: source.labor_hours_per_acre || null,
    equipment_required: source.equipment_required || null,
    equipment_cost_per_acre: source.equipment_cost_per_acre || null,
    total_cost_estimated: source.total_cost_estimated || null,
    
    // ROI
    roi_yield_gain_pct: source.roi_yield_gain_pct || null,
    roi_cost_saved_min: source.roi_cost_saved_min || null,
    roi_cost_saved_max: source.roi_cost_saved_max || null,
    roi_net_score: source.roi_net_score || null,
    roi_confidence: source.roi_confidence || null,
    
    // Monitoring
    success_indicators: source.success_indicators || null,
    failure_indicators: source.failure_indicators || null,
    
    // Environmental
    min_temperature: source.min_temperature || null,
    max_temperature: source.max_temperature || null,
    max_wind_speed: source.max_wind_speed || null,
    rain_delay_hours: source.rain_delay_hours || null,
    weather_dependency: source.weather_dependency || null,
    
    // Scientific Reference
    scientific_source: source.scientific_source || null,
    scientific_basis: source.scientific_basis || null,
    icar_package_ref: source.icar_package_ref || null,
    university_source: source.university_source || null,
    
    // Metadata
    risk_level: source.risk_level || null,
    response_severity: source.response_severity || null,
    data_authority_rank: source.data_authority_rank || null,
  };
}

// Per-request orchestrator construction (Task 7a, 2026-06-13).
// The previous module-level `let orchestrator` was a warm-isolate
// cross-tenant leakage vector — any per-turn state captured by the
// orchestrator survived between requests in the same Deno isolate.
// Construction is cheap; the orchestrator's own dependencies are now
// expected to receive `scope` and stop caching per-tenant state internally.
function buildOrchestrator(): AIAgentOrchestrator {
  return new AIAgentOrchestrator();
}


// Generate unique trace_id for request tracing
function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `trace_${timestamp}_${random}`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const traceId = generateTraceId();
  funnelStart(traceId); // Wave C — per-turn pipeline-drop attribution
  let dedupeKey: string | null = null;
  
  console.log(`\n🔍 [${traceId}] ═══════════════════════════════════════════════════`);
  console.log(`🔍 [${traceId}] REQUEST START`);

  try {
    // Parse request body
    const rawBody = await req.text();
    
    if (!rawBody || !rawBody.trim()) {
      return new Response(
        JSON.stringify({
          error: 'Missing request body',
          details: 'Expected JSON body but received an empty payload',
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    let requestBody: any;
    try {
      requestBody = JSON.parse(rawBody);
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: 'Invalid JSON body',
          details: e instanceof Error ? e.message : 'Invalid JSON',
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const {
      messages = [],
      landId,
      sessionId,
      imageUrl,
      language = 'en',
      metadata = {},
      action
    } = requestBody;

    // Handle training data collection action (legacy support)
    if (action === 'collect_training_data') {
      return await handleTrainingDataCollection(requestBody);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 5 SECURITY GUARD: JWT + tenant + farmer-spoof check (one call)
    //   - Validates Bearer token via getUser()
    //   - Asserts x-tenant-id / x-farmer-id are valid UUIDs
    //   - Verifies farmer.tenant_id === x-tenant-id
    //   - Verifies jwt.sub === x-farmer-id (service-role bypass for cron)
    // ═══════════════════════════════════════════════════════════════════════════
    const guard = await guardTenantAccess(req);
    if (guard instanceof Response) return guard;

    // metadata.* overrides are still honored, but only after the guard has
    // validated the *header* identity. If metadata disagrees, the override
    // must still belong to the same authenticated farmer.
    const finalTenantId = metadata.tenantId || guard.tenantId;
    const finalFarmerId = metadata.farmerId || guard.farmerId;

    if (
      !guard.isServiceRole &&
      (finalTenantId !== guard.tenantId || finalFarmerId !== guard.farmerId)
    ) {
      console.error('🚨 [Security] metadata.* override mismatch with guarded identity');
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          details: 'metadata.tenantId / metadata.farmerId must match authenticated identity',
          code: 'METADATA_IDENTITY_MISMATCH',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = guard.supabase;
    console.log('✅ [Security] Phase-5 guard passed for farmer:', finalFarmerId);

    // ═══════════════════════════════════════════════════════════════════════════
    // RATE LIMITING
    // ═══════════════════════════════════════════════════════════════════════════
    const rateLimitKey = `${finalTenantId}:${finalFarmerId}`;
    const rateLimit = await checkRateLimit(rateLimitKey, 'ai-agriculture-chat', { maxRequests: 20, windowMs: 60000 });
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          resetTime: new Date(rateLimit.resetTime).toISOString()
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REQUEST DEDUPLICATION: Prevent double-tap duplicate processing
    // If an identical request from the same farmer is already in-flight, reject it
    // ═══════════════════════════════════════════════════════════════════════════
    cleanExpiredInflight();
    const lastMessage = messages.length > 0 ? (messages[messages.length - 1]?.content || '') : '';
    dedupeKey = getDedupeKey(finalFarmerId, lastMessage);
    
    if (inFlightRequests.has(dedupeKey)) {
      console.log(`🔁 [${traceId}] DEDUP: Duplicate request blocked for farmer=${finalFarmerId}`);
      return new Response(
        JSON.stringify({ 
          error: 'Duplicate request in progress',
          details: 'Your previous identical request is still being processed. Please wait.',
          trace_id: traceId
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Mark this request as in-flight
    inFlightRequests.set(dedupeKey, { promise: Promise.resolve(new Response()), expiresAt: Date.now() + DEDUP_WINDOW_MS });

    // ═══════════════════════════════════════════════════════════════════════════
    // SUBSCRIPTION QUOTA — atomic 20-per-day check (IST-aware via DB function)
    // Uses `check_farmer_quota('ai_chat', 1, commit:true)` which locks the
    // usage row, validates the per-tenant plan limit, and increments. A 402
    // response tells the client to render the upgrade banner.
    // ═══════════════════════════════════════════════════════════════════════════
    try {
      const { data: quotaResult, error: quotaErr } = await supabase.rpc('check_farmer_quota', {
        _farmer: finalFarmerId,
        _feature: 'ai_chat',
        _delta: 1,
        _tokens: 0,
        _commit: true,
      });
      if (quotaErr) {
        console.warn(`⚠️ [Quota] RPC error (allow-on-error):`, quotaErr.message);
      } else if (quotaResult && (quotaResult as any).allowed === false) {
        const reason = (quotaResult as any).reason || 'quota_exceeded';
        const status = reason === 'feature_disabled' ? 403 : 402;
        inFlightRequests.delete(dedupeKey);
        return new Response(
          JSON.stringify({
            error: 'subscription_quota',
            code: reason,
            quota: (quotaResult as any).quota,
            used: (quotaResult as any).used,
            remaining: (quotaResult as any).remaining,
            resets_at: (quotaResult as any).period,
          }),
          { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    } catch (e) {
      console.warn('⚠️ [Quota] guard threw, allowing request:', (e as Error).message);
    }

    //
    // CRITICAL: Enforce sessionId ↔ landId binding to prevent cross-land contamination
    // ═══════════════════════════════════════════════════════════════════════════
    let currentSessionId = sessionId;
    const requestedLandId = landId || null;
    
    if (currentSessionId) {
      // ═══════════════════════════════════════════════════════════════════════════
      // P0-A CRITICAL: VALIDATE sessionId belongs to this landId
      // If mismatch, REJECT the sessionId and find/create correct one
      // ═══════════════════════════════════════════════════════════════════════════
      const { data: sessionCheck } = await supabase
        .from('ai_chat_sessions')
        .select('id, land_id, farmer_id, tenant_id')
        .eq('id', currentSessionId)
        .single();
      
      // Security: Also validate farmer/tenant ownership
      const isValidOwner = sessionCheck?.farmer_id === finalFarmerId && sessionCheck?.tenant_id === finalTenantId;
      const isLandMatch = sessionCheck?.land_id === requestedLandId;
      
      if (!sessionCheck || !isValidOwner || !isLandMatch) {
        console.warn(`⚠️ [Session] P0-A: Session-Land MISMATCH detected!`);
        console.warn(`   Provided sessionId: ${currentSessionId}`);
        console.warn(`   Session land_id: ${sessionCheck?.land_id}, Request land_id: ${requestedLandId}`);
        console.warn(`   Valid owner: ${isValidOwner}, Land match: ${isLandMatch}`);
        console.warn(`   → REJECTING sessionId, will find/create correct session for this land`);
        
        // REJECT the provided sessionId - set to null to trigger correct session lookup
        currentSessionId = null;
      } else {
        console.log(`✅ [Session] P0-A: SessionId validated - land_id=${requestedLandId}, farmer_id=${finalFarmerId}`);
      }
    }
    
    if (!currentSessionId) {
      // Find or create session FOR THIS SPECIFIC LAND
      let existingSessionQuery = supabase
        .from('ai_chat_sessions')
        .select('id')
        .eq('farmer_id', finalFarmerId)
        .eq('tenant_id', finalTenantId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);
      
      if (requestedLandId) {
        existingSessionQuery = existingSessionQuery.eq('land_id', requestedLandId);
      } else {
        existingSessionQuery = existingSessionQuery.is('land_id', null);
      }
      
      const { data: existingSession } = await existingSessionQuery.maybeSingle();
      
      if (existingSession) {
        // Reuse existing session FOR THIS LAND
        currentSessionId = existingSession.id;
        console.log(`📝 [Session] Reusing existing session for land ${requestedLandId}:`, currentSessionId);
      } else {
        // Create new session only if none exists for this land
        const { data: newSession, error: sessionError } = await supabase
          .from('ai_chat_sessions')
          .insert({
            tenant_id: finalTenantId,
            farmer_id: finalFarmerId,
            land_id: requestedLandId,
            session_type: requestedLandId ? 'land_specific' : 'general',
            is_active: true,
            metadata: { language, source: 'orchestrator_v1' }
          })
          .select('id')
          .single();

        if (sessionError || !newSession) {
          console.error('Failed to create session:', sessionError);
          return new Response(
            JSON.stringify({ error: 'Failed to create chat session' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        currentSessionId = newSession.id;
        console.log(`📝 [Session] New session created for land ${requestedLandId}:`, currentSessionId);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FETCH SESSION STATE + CONVERSATION HISTORY - CRITICAL for context continuity
    // ═══════════════════════════════════════════════════════════════════════════
    let sessionState: {
      decision_state?: string;
      last_pest?: string;
      last_crop?: string;
      last_disease?: string;
      pending_user_action?: boolean;
      turn_count?: number;
      recommendations_count?: number;
      // CRITICAL FIX 1: Add pending clarification options for option selection
      pending_clarification_options?: string[];
      // P0-3 FIX: Add lockedCropContext for multi-turn context continuity
      lockedCropContext?: {
        crop_name?: string;
        growth_stage?: string;
        days_since_sowing?: number;
      };
      // ═══════════════════════════════════════════════════════════════════════════
      // PART 10: SESSION CONTINUITY — problems_discussed tracking
      // Maintains a list of problems discussed in this session for:
      // 1. Repeat-concern detection (same query within 30 min → escalate)
      // 2. Causal chaining (poor growth after stem holes → likely consequence of borer)
      // ═══════════════════════════════════════════════════════════════════════════
      problems_discussed?: Array<{
        problem_code: string;      // e.g., 'STEM_DAMAGE', 'GROWTH_ANOMALY', 'PEST_BORER'
        turn_number: number;
        timestamp: string;
        diagnosis?: string;        // e.g., 'SHOOT_BORER', 'NITROGEN_DEFICIENCY'
        intent_code?: string;
      }>;
      last_query_hash?: string;    // For repeat-concern detection
      last_query_timestamp?: string;
    } | null = null;
    
    // CRITICAL FIX: Fetch previous messages from DB for conversation continuity
    let conversationHistory: Array<{ role: string; content: string }> = [];

    // Task 6: ConversationContext lives on ai_chat_sessions.conversation_state (top-level jsonb).
    // Reloaded at turn start, mutated request-scope, written back at turn end.
    type ConversationContext = {
      intent_code: string | null;
      confirmed_observations: string[];
      ruled_out_observations: string[];
      active_rule_candidates: string[];
      round_counter: number;
      max_rounds: number;
      last_updated: string | null;
    };
    let conversationContext: ConversationContext = {
      intent_code: null,
      confirmed_observations: [],
      ruled_out_observations: [],
      active_rule_candidates: [],
      round_counter: 0,
      max_rounds: 2,
      last_updated: null,
    };

    if (currentSessionId) {
      // Fetch session metadata + conversation_state - land_id already validated in P0-A above
      const { data: existingSession } = await supabase
        .from('ai_chat_sessions')
        .select('metadata, land_id, conversation_state')
        .eq('id', currentSessionId)
        .single();

      // Load top-level ConversationContext (Task 6)
      const cs = (existingSession as any)?.conversation_state;
      if (cs && typeof cs === 'object') {
        conversationContext = {
          intent_code: cs.intent_code ?? null,
          confirmed_observations: Array.isArray(cs.confirmed_observations) ? cs.confirmed_observations : [],
          ruled_out_observations: Array.isArray(cs.ruled_out_observations) ? cs.ruled_out_observations : [],
          active_rule_candidates: Array.isArray(cs.active_rule_candidates) ? cs.active_rule_candidates : [],
          round_counter: Number.isFinite(cs.round_counter) ? Number(cs.round_counter) : 0,
          max_rounds: Number.isFinite(cs.max_rounds) ? Number(cs.max_rounds) : 2,
          last_updated: cs.last_updated ?? null,
        };
        // Max-rounds reset: clarification flow gives up after N rounds.
        if (conversationContext.round_counter >= conversationContext.max_rounds) {
          console.log(`🧹 [ConversationContext] max_rounds=${conversationContext.max_rounds} reached, clearing context`);
          conversationContext = {
            intent_code: null,
            confirmed_observations: [],
            ruled_out_observations: [],
            active_rule_candidates: [],
            round_counter: 0,
            max_rounds: conversationContext.max_rounds,
            last_updated: null,
          };
        }
        console.log(`📥 [ConversationContext] Loaded: intent=${conversationContext.intent_code} confirmed=${conversationContext.confirmed_observations.length} round=${conversationContext.round_counter}/${conversationContext.max_rounds}`);
      }

      
      // ═══════════════════════════════════════════════════════════════════════════
      // P0-A ENFORCEMENT: Session is ALREADY validated to match this land
      // Safe to load session state since P0-A rejected mismatched sessions
      // ═══════════════════════════════════════════════════════════════════════════
      if (existingSession?.metadata?.decision_tracking) {
        sessionState = existingSession.metadata.decision_tracking;
        
        // ═══════════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: Session Isolation - Clear pending options for GENERAL queries
        // Prevents land-specific clarification options from leaking to General tab
        // ═══════════════════════════════════════════════════════════════════════════
        const isGeneralSession = !requestedLandId;
        const sessionHasLand = existingSession.land_id !== null;
        
        if (isGeneralSession && sessionState?.pending_clarification_options?.length > 0) {
          console.log(`🔒 [Session] ISOLATION: Clearing ${sessionState.pending_clarification_options.length} pending options for General session`);
          sessionState.pending_clarification_options = [];
        }
        
        // Also clear land-specific context for general sessions
        if (isGeneralSession) {
          if (sessionState?.last_pest || sessionState?.last_disease || sessionState?.last_crop) {
            console.log(`🔒 [Session] ISOLATION: Clearing land context (pest/disease/crop) for General session`);
            sessionState.last_pest = undefined;
            sessionState.last_disease = undefined;
            sessionState.last_crop = undefined;
          }
        }
        
        // ═══════════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: Auto-reset stuck session state
        // If decision_state is 'awaiting_clarification' but no pending options exist,
        // the session is STUCK from a previous turn. Reset to 'idle' to unblock.
        // ═══════════════════════════════════════════════════════════════════════════
        const pendingCount = sessionState?.pending_clarification_options?.length || 0;
        if (sessionState?.decision_state === 'awaiting_clarification' && pendingCount === 0) {
          console.log(`🔓 [Session] AUTO-RESET: decision_state was 'awaiting_clarification' with 0 pending options → resetting to 'idle'`);
          sessionState.decision_state = 'idle';
        }
        
        console.log(`📋 [Session] State loaded (P0-A validated, land=${requestedLandId}, isGeneral=${isGeneralSession}):`, {
          decision_state: sessionState?.decision_state,
          last_pest: sessionState?.last_pest,
          last_crop: sessionState?.last_crop,
          pending_action: sessionState?.pending_user_action,
          pending_options: pendingCount,
          turn: sessionState?.turn_count
        });
      }
      
      // P0-A: Fetch messages ONLY from this validated session (land-isolated by design)
      const { data: previousMessages, error: historyError } = await supabase
        .from('ai_chat_messages')
        .select('role, content')
        .eq('session_id', currentSessionId)
        .order('created_at', { ascending: false })
        .limit(6);
      
      if (!historyError && previousMessages && previousMessages.length > 0) {
        // Reverse to get chronological order and format
        conversationHistory = previousMessages
          .reverse()
          .map(m => ({ role: m.role, content: m.content }));
        
        console.log(`📜 [Session] Loaded ${conversationHistory.length} messages (P0-A land-isolated)`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXTRACT USER MESSAGE - WITH SAFETY GUARD
    // ═══════════════════════════════════════════════════════════════════════════
    const lastUserMessage = messages[messages.length - 1];
    const rawMessageContent = typeof lastUserMessage === 'string' 
      ? lastUserMessage 
      : lastUserMessage?.content;
    
    // SAFETY: Normalize to empty string, not undefined
    const userMessageContent = typeof rawMessageContent === 'string' ? rawMessageContent : '';

    // Only reject if truly empty AND no image provided
    if (!userMessageContent.trim() && !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Empty message provided or no image' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NOTE: General-chat requests are routed to the separate `ai-general-chat`
    // edge function by the client. This function is symbolic-brain only.



    // ═══════════════════════════════════════════════════════════════════════════
    // LANGUAGE DETECTION & CONSISTENCY CHECK
    // Detect user's language and prepare for translation pipeline
    // ═══════════════════════════════════════════════════════════════════════════
    // FIX 8: Canonical language detection — single source of truth
    // App language from client is the canonical language. Script detection only disambiguates.
    const canonicalLanguage = detectLanguage(userMessageContent, language);
    const detectedLanguage = canonicalLanguage;
    
    // BUG-4 FIX: DEPRECATED - normalizeToEnglish only had ~23 hardcoded mappings,
    // creating half-translated hybrid strings. LLM Semantic Extractor (Stage 1.5) 
    // handles all languages natively. Pass original text for DB logging/training.
    // const preprocessedContent = normalizeToEnglish(userMessageContent);
    const preprocessedContent = userMessageContent;
    
    console.log(`🌐 [${traceId}] Language Pipeline:`, {
      raw_input_language: detectedLanguage,
      has_devanagari: /[\u0900-\u097F]/.test(userMessageContent),
      preprocessed_to_english: preprocessedContent.substring(0, 50),
      output_language_target: detectedLanguage
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION CONTEXT INJECTION - Add previous recommendation context
    // ═══════════════════════════════════════════════════════════════════════════
    let contextPrefix = '';
    if (sessionState?.pending_user_action && sessionState?.decision_state === 'recommendations_given') {
      // Build context about previous recommendations
      const contextParts: string[] = [];
      if (sessionState.last_pest) contextParts.push(`pest: ${sessionState.last_pest}`);
      if (sessionState.last_disease) contextParts.push(`disease: ${sessionState.last_disease}`);
      if (sessionState.last_crop) contextParts.push(`crop: ${sessionState.last_crop}`);
      
      contextPrefix = `[PREVIOUS_RECOMMENDATIONS: ${contextParts.join(', ')} | COUNT: ${sessionState.recommendations_count || 0}] `;
      console.log(`🔗 [Session] Injecting context for follow-up:`, contextPrefix);
    }

    // Safe preview helper for logging
    const safePreview = (text: string, len = 50) => 
      typeof text === 'string' && text.length > 0 
        ? (text.length > len ? text.substring(0, len) + '...' : text) 
        : '[NO_TEXT]';
    
    console.log(`🚀 [${traceId}] Processing message:`, {
      sessionId: currentSessionId,
      farmerId: finalFarmerId,
      language: detectedLanguage,
      hasImage: !!imageUrl,
      hasText: userMessageContent.trim().length > 0,
      messagePreview: safePreview(userMessageContent)
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PROACTIVE-ALERT NARRATION SHORT-CIRCUIT (v1)
    // ─────────────────────────────────────────────────────────────────────────
    // When the user opened the chat from a proactive alert AND this is their
    // first message in the session, the alert payload is attached to
    // `metadata.proactiveAlert`. The Decision-Brain has ALREADY produced the
    // authoritative agronomic answer (action_text_<lang>, decision_reasoning,
    // trigger_data). We narrate that answer directly — LLM is restricted to
    // translation/simplification. This avoids the orchestrator re-diagnosing
    // from a vague seeded question and falling back to generic monitoring.
    //
    // Honors the SSOT invariant: 100% of agronomic advice comes from the DB.
    // ═══════════════════════════════════════════════════════════════════════════
    const proactiveAlert = metadata?.proactiveAlert;
    const isFirstTurnFromAlert =
      !!proactiveAlert &&
      conversationHistory.length === 0 && // truly first turn in this session
      !!(proactiveAlert.action_text_en || proactiveAlert.action_text_hi || proactiveAlert.action_text_mr);

    if (isFirstTurnFromAlert) {
      console.log(`🔔 [${traceId}] PROACTIVE_ALERT_NARRATION: Bypassing orchestrator for first-turn alert response`, {
        alert_id: proactiveAlert.id,
        category: proactiveAlert.alert_category,
        priority: proactiveAlert.priority,
        condition_code: proactiveAlert.trigger_data?.condition_code,
      });

      try {
        const lang = (detectedLanguage || language || 'en').toString().slice(0, 2);
        const langName: Record<string, string> = {
          en: 'English', hi: 'Hindi (Devanagari)', mr: 'Marathi (Devanagari)',
          pa: 'Punjabi (Gurmukhi)', ta: 'Tamil', te: 'Telugu', kn: 'Kannada',
          gu: 'Gujarati', bn: 'Bengali', or: 'Odia', ml: 'Malayalam',
        };
        const pickLocalized = (field: string) =>
          (proactiveAlert[`${field}_${lang}`] ||
            proactiveAlert[`${field}_en`] ||
            proactiveAlert[`${field}_mr`] ||
            proactiveAlert[`${field}_hi`] ||
            '').toString();

        const td = proactiveAlert.trigger_data || {};
        const sol = td.solution || {};
        const pickSol = (field: string) =>
          (sol[`${field}_${lang}`] || sol[`${field}_en`] || sol[`${field}_mr`] || sol[`${field}_hi`] || '').toString();

        // Authoritative facts block (Decision-Brain SSOT)
        const facts = {
          land_name: proactiveAlert.land_name || null,
          alert_category: proactiveAlert.alert_category,
          priority: proactiveAlert.priority,
          condition_code: td.condition_code || null,
          ndvi: typeof td.ndvi === 'number' ? td.ndvi : null,
          title: pickLocalized('title'),
          message: pickLocalized('message'),
          // The Decision-Brain's explicit instruction set — must be narrated verbatim in spirit
          authoritative_action_text: pickLocalized('action_text'),
          decision_reasoning: proactiveAlert.decision_reasoning || null,
          problem: pickSol('problem'),
          cause: pickSol('cause'),
          steps: sol[`steps_${lang}`] || sol.steps_en || sol.steps_mr || [],
          followup: pickSol('followup'),
          safety: pickSol('safety'),
          expected_benefit: pickSol('expected_benefit'),
        };

        const lovableKey = Deno.env.get('LOVABLE_API_KEY');
        let narratedResponse = facts.authoritative_action_text || facts.message || facts.title;

        if (lovableKey && facts.authoritative_action_text) {
          const sys = [
            'You are a NARRATOR for an agronomic advisory system. You DO NOT invent agronomy.',
            'A symbolic Decision-Brain has already produced the authoritative answer below.',
            'Your job is ONLY to translate, simplify, and structure it for a rural Indian farmer.',
            '',
            'STRICT RULES:',
            `1. Output the FULL response in ${langName[lang] || 'English'}. No English fallback unless lang=en.`,
            '2. Preserve EVERY action item, every checklist item, every number, every product, and every timing from the authoritative_action_text. Do NOT drop or invent any.',
            '3. Use simple rural farmer vocabulary. Short sentences.',
            '4. Structure with clear sections: 🌾 स्थिती (Situation) → ⚠️ कारण (Cause) → ✅ काय करावे (What to do) → 📅 पुढील पाऊल (Next step).',
            '5. If condition_code is NDVI_NON_RECOVERY, you MUST explicitly state that water stress is ruled out (rain happened but crop did not recover) and emphasize pest/disease/nutrient inspection.',
            '6. Never recommend irrigation when the authoritative_action_text says diagnostic investigation.',
            '7. Mention the land name, NDVI value, and priority if available.',
            '8. End with a clear 48-hour or follow-up action if the alert provides one.',
            '9. Use plain text with emojis — NO markdown headers (#, ##), NO code blocks.',
          ].join('\n');

          const usr = `Authoritative Decision-Brain facts (do not contradict, do not omit):\n${JSON.stringify(facts, null, 2)}\n\nFarmer's question: ${userMessageContent}\n\nNarrate the authoritative answer now.`;

          try {
            const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: { Authorization: `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'google/gemini-3-flash-preview',
                messages: [
                  { role: 'system', content: sys },
                  { role: 'user', content: usr },
                ],
              }),
            });
            if (aiResp.ok) {
              const j = await aiResp.json();
              const txt = j?.choices?.[0]?.message?.content?.toString().trim();
              if (txt && txt.length > 30) narratedResponse = txt;
            } else {
              console.warn(`[${traceId}] PROACTIVE_NARRATION: gateway ${aiResp.status} — using raw action_text`);
            }
          } catch (e) {
            console.error(`[${traceId}] PROACTIVE_NARRATION LLM error`, e);
          }
        }

        // Persist user + assistant messages so the conversation continues normally afterward.
        try {
          await supabase.from('ai_chat_messages').insert([
            {
              tenant_id: finalTenantId,
              farmer_id: finalFarmerId,
              session_id: currentSessionId,
              role: 'user',
              content: userMessageContent,
              language: lang,
              status: 'sent',
              decision_brain_source: true,
              metadata: { proactive_alert_id: proactiveAlert.id, source: 'proactive_alert_entry' },
            },
            {
              tenant_id: finalTenantId,
              farmer_id: finalFarmerId,
              session_id: currentSessionId,
              role: 'assistant',
              content: narratedResponse,
              language: lang,
              status: 'sent',
              decision_brain_source: true,
              ai_model: 'proactive-narration',
              actions_returned: 1,
              response_source: 'symbolic_rule_fired',
              metadata: {
                proactive_alert_id: proactiveAlert.id,
                alert_category: proactiveAlert.alert_category,
                condition_code: td.condition_code,
                priority: proactiveAlert.priority,
                source: 'PROACTIVE_ALERT_NARRATION',
              },
            },
          ]);
        } catch (persistErr) {
          console.error(`[${traceId}] PROACTIVE_NARRATION persist error`, persistErr);
        }

        return new Response(
          JSON.stringify({
            response: narratedResponse,
            sessionId: currentSessionId,
            responseTime: Date.now() - startTime,
            metadata: {
              type: 'DECISION_PROVIDED',
              orchestrator_type: 'PROACTIVE_ALERT_NARRATION',
              decision_brain_source: true,
              source: 'PROACTIVE_ALERT_NARRATION',
              alert_id: proactiveAlert.id,
              alert_category: proactiveAlert.alert_category,
              condition_code: td.condition_code,
              priority: proactiveAlert.priority,
              trace_id: traceId,
              language: lang,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        );
      } catch (alertErr) {
        console.error(`[${traceId}] PROACTIVE_NARRATION fatal — falling through to orchestrator`, alertErr);
        // Fall through: the regular orchestrator path runs as a safety net.
      }
    }

    // (General-chat path removed — handled by dedicated `ai-general-chat` function.)



    // ═══════════════════════════════════════════════════════════════════════════
    // CALL ORCHESTRATOR - THE NEW 9-AGENT FLOW WITH TRACE_ID AND SESSION STATE
    //
    // Task 7a (2026-06-13): per-request scope + focused engine try/catch.
    // The scope reuses the JWT-validated `supabase` client so privileges and
    // headers stay consistent. Typed engine errors (EngineDataError,
    // IntentResolutionError, InvariantViolation) are converted to a
    // structured 500 with { error, code, trace_id } — never silently
    // swallowed. Sub-stages 7b–7e will thread `scope` deeper into the
    // orchestrator's phases.
    // ═══════════════════════════════════════════════════════════════════════════
    const scope: RequestScope = createRequestScope({
      tenantId: finalTenantId,
      farmerId: finalFarmerId,
      sessionId: currentSessionId ?? 'pre-session',
      turnId: traceId,
      traceId,
      db: supabase,
    });

    const orch = buildOrchestrator();

    let orchestratorResponse: OrchestratorResponse;
    try {
      orchestratorResponse = await orch.orchestrate(
        userMessageContent,
        currentSessionId,
        finalFarmerId,
        finalTenantId,
        {
          photoUrl: imageUrl,
          language: detectedLanguage,
          landId: landId,
          traceId: traceId,
          // Task 7a: scope is passed through options so downstream sub-stages
          // can pick it up without coordinated breaking changes to the
          // orchestrator's positional signature.
          scope,
          // CRITICAL FIX: Pass conversation history for context continuity
          conversationHistory: conversationHistory,
          // Pass session state for follow-up awareness
          sessionState: sessionState ? {
            hasPreviousRecommendations: sessionState.pending_user_action || false,
            previousPest: sessionState.last_pest,
            previousDisease: sessionState.last_disease,
            previousCrop: sessionState.last_crop,
            turnCount: sessionState.turn_count || 0,
            decisionState: sessionState.decision_state,
            // CRITICAL FIX 2: Pass pending clarification options for option matching
            pendingClarificationOptions: sessionState.pending_clarification_options || [],
            // P1-BUG FIX: Pass lockedCropContext for OPTION_SELECTED context preservation
            lockedCropContext: sessionState.lockedCropContext,
            // PART 10: Pass problems_discussed for session continuity
            problems_discussed: sessionState.problems_discussed || [],
            last_query_hash: sessionState.last_query_hash,
            last_query_timestamp: sessionState.last_query_timestamp
          } : undefined
        } as any
      );
    } catch (engineErr) {
      const isTyped =
        engineErr instanceof EngineDataError ||
        engineErr instanceof IntentResolutionError ||
        engineErr instanceof InvariantViolation;

      if (isTyped) {
        const typed = engineErr as EngineDataError | IntentResolutionError | InvariantViolation;
        console.error(`🚨 [${traceId}] ENGINE_FAULT ${typed.name}/${typed.code}`, {
          details: typed.details,
          events: scope.events.slice(-20),
        });
        if (dedupeKey) inFlightRequests.delete(dedupeKey);
        return new Response(
          JSON.stringify({
            error: 'engine_fault',
            code: typed.code,
            kind: typed.name,
            trace_id: traceId,
            details: typed.details ?? null,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Unknown error — re-throw so the existing outer catch logs and responds.
      console.error(`🚨 [${traceId}] ORCHESTRATOR_UNHANDLED`, engineErr);
      throw engineErr;
    }


    console.log('✅ [Orchestrator] Response type:', orchestratorResponse.type);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3: STORE MESSAGES FOR TRAINING & ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════
    const responseTime = Date.now() - startTime;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3A: COMPREHENSIVE FILTERING AUDIT WITH TRANSPARENT LOGGING
    // ═══════════════════════════════════════════════════════════════════════════
    
    // STEP 1: Log RAW recommendations from decision graph BEFORE any filtering
    console.log(`\n🔬 [${traceId}] ═══ FILTERING AUDIT START ═══`);
    console.log(`🔬 [${traceId}] ─── BEFORE FILTERING: RAW DECISION GRAPH OUTPUT ───`);
    
    let rawDecisionOutput = orchestratorResponse.decision_output;
    if (rawDecisionOutput) {
      console.log(`   Status: ${rawDecisionOutput.status}`);
      console.log(`   Primary Decision: ${rawDecisionOutput.primary_decision?.action_type || 'NONE'}`);
      console.log(`   Secondary Actions: ${rawDecisionOutput.secondary_actions?.length || 0}`);
      console.log(`   Blocked Actions: ${rawDecisionOutput.blocked_actions?.length || 0}`);
      
      // Log all raw recommendations before processing
      if (rawDecisionOutput.primary_decision) {
        console.log(`   📌 RAW Primary: ${JSON.stringify({
          action_type: rawDecisionOutput.primary_decision.action_type,
          rule_id: rawDecisionOutput.primary_decision.rule_id,
          product: rawDecisionOutput.primary_decision.application_details?.product_name,
          target: rawDecisionOutput.primary_decision.target,
          priority: rawDecisionOutput.primary_decision.priority
        })}`);
      }
      if (rawDecisionOutput.secondary_actions?.length > 0) {
        rawDecisionOutput.secondary_actions.forEach((sec: any, i: number) => {
          console.log(`   📎 RAW Secondary ${i + 1}: ${sec.action} | Priority: ${sec.priority}`);
        });
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // PRODUCTION HARDENING: PRIMARY DECISION INVARIANT
      // A valid decision MUST have: rule_id AND action_type
      // RECOVERY PRIORITY: 
      //   1. layered_rule_result.primary_decision (NEW - from LayeredRuleEvaluator)
      //   2. primary_matched_response (LEGACY)
      //   3. matched_responses array
      //   4. SYSTEM_FALLBACK
      // ═══════════════════════════════════════════════════════════════════════════
      if (rawDecisionOutput.status === 'SUCCESS' || rawDecisionOutput.status === 'PARTIAL') {
        const primaryDecision = rawDecisionOutput.primary_decision;
        const hasValidActionType = !!primaryDecision?.action_type;
        const hasRuleId = !!primaryDecision?.rule_id || !!primaryDecision?.application_details?.rule_id;
        
        if (!hasValidActionType || !hasRuleId) {
          console.error(`🚨 [${traceId}] PRIMARY_ACTION_CONTRACT_VIOLATION!`);
          console.error(`   primary_decision exists: ${!!primaryDecision}`);
          console.error(`   action_type: ${primaryDecision?.action_type || 'MISSING'}`);
          console.error(`   rule_id: ${primaryDecision?.rule_id || primaryDecision?.application_details?.rule_id || 'MISSING'}`);
          console.error(`   source: index.ts`);
          
          // ═══════════════════════════════════════════════════════════════════════════
          // PRIORITY 1: Check for layered_rule_result.primary_decision (NEW CONTRACT)
          // This is built by layered-rule-evaluator.ts from eligible matched_responses
          // ═══════════════════════════════════════════════════════════════════════════
          const layeredPrimaryDecision = rawDecisionOutput.layered_rule_result?.primary_decision;
          
          // ═══════════════════════════════════════════════════════════════
          // BUG-1/BUG-6 FIX: Safety gate rules must NEVER be selected as
          // primary decision. They belong in warnings/blocked_actions only.
          // ═══════════════════════════════════════════════════════════════
          const SAFETY_GATE_RULE_PATTERN = /^GLOBAL_SAFETY/i;
          const isSafetyGateRule = (ruleId?: string) => 
            !!(ruleId && SAFETY_GATE_RULE_PATTERN.test(ruleId));
          
          const isLayeredSafetyGate = isSafetyGateRule(layeredPrimaryDecision?.rule_id);
          
          if (layeredPrimaryDecision && layeredPrimaryDecision.rule_id && layeredPrimaryDecision.action_type && !isLayeredSafetyGate) {
            console.log(`   🔄 RECOVERY: Using layered_rule_result.primary_decision`);
            
            // BUG-1 FIX: Never set placeholder product_name — leave null for formatter
            const recoveredProductName = layeredPrimaryDecision.product_name || null;
            const recoveredProductType = layeredPrimaryDecision.product_type || null;
            
            rawDecisionOutput.primary_decision = {
              action_type: layeredPrimaryDecision.action_type,
              rule_id: layeredPrimaryDecision.rule_id,
              specific_action: layeredPrimaryDecision.action_type,
              target: {},
              urgency: 'WITHIN_24H',
              priority: layeredPrimaryDecision.priority,
              // SSOT: Propagate ledger-derived confidence
              weighted_confidence: layeredPrimaryDecision.weighted_confidence,
              normalized_score: layeredPrimaryDecision.normalized_score,
              timing: {
                recommended_start: new Date().toISOString(),
                recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                weather_dependency: false,
                reason: 'Recovered from layered_rule_result.primary_decision'
              },
              application_details: buildRichApplicationDetails(layeredPrimaryDecision, recoveredProductName, recoveredProductType),
              expected_outcomes: {
                efficacy_percent: layeredPrimaryDecision.weighted_confidence 
                  ? Math.round(layeredPrimaryDecision.weighted_confidence * 100) : 75,
                time_to_visible_effect_days: '3-5',
                success_indicators: layeredPrimaryDecision.success_indicators || []
              }
            };
            
            console.log(`   ✅ Primary decision RECOVERED: rule_id=${layeredPrimaryDecision.rule_id}, action_type=${layeredPrimaryDecision.action_type}`);
          } else if (isLayeredSafetyGate) {
            console.warn(`   ⚠️ SAFETY_GATE_FILTER: Skipping GLOBAL_SAFETY rule ${layeredPrimaryDecision?.rule_id} as primary — moving to warnings`);
            // Move safety gate rule to warnings instead
            if (!rawDecisionOutput.warnings) rawDecisionOutput.warnings = [];
            rawDecisionOutput.warnings.push({
              type: 'SAFETY_GATE',
              rule_id: layeredPrimaryDecision?.rule_id,
              message: layeredPrimaryDecision?.action_text || 'Safety precaution applies',
              source: 'safety_gate_filter'
            });
          }
          // PRIORITY 2: Check for primary_matched_response (LEGACY)
          else {
            const primaryMatchedResponse = rawDecisionOutput.primary_matched_response;
            const isPrimaryMatchSafetyGate = isSafetyGateRule(primaryMatchedResponse?.rule_id);
            
            if (primaryMatchedResponse && primaryMatchedResponse.rule_id && primaryMatchedResponse.action_type && !isPrimaryMatchSafetyGate) {
              console.log(`   🔄 RECOVERY: Using primary_matched_response (legacy)`);
              
              rawDecisionOutput.primary_decision = {
                action_type: primaryMatchedResponse.action_type,
                rule_id: primaryMatchedResponse.rule_id,
                specific_action: primaryMatchedResponse.action_type,
                target: {},
                urgency: 'WITHIN_24H',
                priority: primaryMatchedResponse.priority,
                weighted_confidence: primaryMatchedResponse.weighted_confidence,
                timing: {
                  recommended_start: new Date().toISOString(),
                  recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                  weather_dependency: false,
                  reason: 'Recovered from primary_matched_response'
                },
                application_details: buildRichApplicationDetails(primaryMatchedResponse, primaryMatchedResponse.product_name || null, primaryMatchedResponse.product_type || null),
                expected_outcomes: {
                  efficacy_percent: primaryMatchedResponse.weighted_confidence 
                    ? Math.round(primaryMatchedResponse.weighted_confidence * 100) : 75,
                  time_to_visible_effect_days: '3-5',
                  success_indicators: primaryMatchedResponse.success_indicators || []
                }
              };
              
              console.log(`   ✅ Primary decision RECOVERED: rule_id=${primaryMatchedResponse.rule_id}, action_type=${primaryMatchedResponse.action_type}`);
            } else if (isPrimaryMatchSafetyGate) {
              console.warn(`   ⚠️ SAFETY_GATE_FILTER: Skipping safety rule ${primaryMatchedResponse?.rule_id} from primary_matched_response`);
            }
            // PRIORITY 3: Check matched_responses array
            else {
              // PRODUCTION FIX: Empty array is truthy — use strict length check
              const rawMatched = rawDecisionOutput.matched_responses;
              const layeredMatched = rawDecisionOutput.layered_rule_result?.matched_responses;
              const matchedResponses = (Array.isArray(rawMatched) && rawMatched.length > 0)
                ? rawMatched
                : (Array.isArray(layeredMatched) && layeredMatched.length > 0)
                  ? layeredMatched
                  : [];
              
              // PRODUCTION FIX: Align eligibility with layered-rule-evaluator.ts
              // Accept action_text OR i18n_key OR reason_text OR knowledge_text
              // BUG-6 FIX: Also filter out GLOBAL_SAFETY rules from eligible responses
              const eligibleResponses = matchedResponses.filter((r: any) => 
                r.rule_id && r.action_type && (r.action_text || r.i18n_key || r.reason_text || r.knowledge_text) && !isSafetyGateRule(r.rule_id)
              );
              
              if (eligibleResponses.length > 0) {
                console.log(`   🔄 RECOVERY: Using eligible matched_response (${eligibleResponses.length} available)`);
                
                const firstMatch = eligibleResponses[0];
                rawDecisionOutput.primary_decision = {
                  action_type: firstMatch.action_type,
                  rule_id: firstMatch.rule_id,
                  specific_action: firstMatch.cause || 'Recommendation',
                  target: {},
                  urgency: 'WITHIN_24H',
                  priority: firstMatch.priority,
                  weighted_confidence: firstMatch.weighted_confidence,
                  timing: {
                    recommended_start: new Date().toISOString(),
                    recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                    weather_dependency: false,
                    reason: 'Recovered from matched responses'
                  },
                  application_details: buildRichApplicationDetails(firstMatch, firstMatch.product_name || null, firstMatch.product_type || null),
                  expected_outcomes: {
                    efficacy_percent: firstMatch.weighted_confidence 
                      ? Math.round(firstMatch.weighted_confidence * 100) : 75,
                    time_to_visible_effect_days: '3-5',
                    success_indicators: firstMatch.success_indicators || []
                  }
                };
                
                console.log(`   ✅ Primary decision RECOVERED: rule_id=${firstMatch.rule_id}, action_type=${firstMatch.action_type}`);
              } else {
                // PRIORITY 4: No eligible responses - generate system fallback
                // PRODUCTION OBSERVABILITY: Log full diagnostic context before fallback
                const rawMatchedCount = Array.isArray(rawDecisionOutput.matched_responses) ? rawDecisionOutput.matched_responses.length : 0;
                const layeredMatchedCount = Array.isArray(rawDecisionOutput.layered_rule_result?.matched_responses) ? rawDecisionOutput.layered_rule_result.matched_responses.length : 0;
                const layeredPrimary = rawDecisionOutput.layered_rule_result?.primary_decision;
                console.error(`🚨 [${traceId}] INVARIANT_FALLBACK DIAGNOSTIC:`);
                console.error(`   status: ${rawDecisionOutput.status}`);
                console.error(`   raw matched_responses: ${rawMatchedCount}`);
                console.error(`   layered matched_responses: ${layeredMatchedCount}`);
                console.error(`   layered primary_decision: ${layeredPrimary ? `rule_id=${layeredPrimary.rule_id}, action_type=${layeredPrimary.action_type}` : 'NULL'}`);
                console.error(`   eligible after filter: ${matchedResponses.length} total → 0 eligible`);
                if (matchedResponses.length > 0) {
                  console.error(`   First 5 rule_ids: [${matchedResponses.slice(0, 5).map((r: any) => r.rule_id).join(', ')}]`);
                  console.error(`   First rule content: action_text=${!!matchedResponses[0]?.action_text}, i18n_key=${!!matchedResponses[0]?.i18n_key}, reason_text=${!!matchedResponses[0]?.reason_text}, knowledge_text=${!!matchedResponses[0]?.knowledge_text}`);
                }
                console.error(`   marking status=SYSTEM_ERROR (no fabricated MONITOR_ONLY)`);

                // ─────────────────────────────────────────────────────────────
                // SSOT FIX: Do NOT fabricate a MONITOR_ONLY decision with
                // hardcoded English action_text / reason_text. Per core
                // architecture invariant, 100% of agronomic advice must
                // originate from the database. A fake "Continue monitoring"
                // recommendation here is an Agronomic-Safety-Negligence risk
                // (it could mask a high-urgency pest emergency).
                //
                // Instead: surface SYSTEM_ERROR so the response pipeline
                // emits the orchestrator's own (DB-sourced) fallback_advice,
                // or logs SYMBOLIC_CONTRACT_VIOLATION when that is also
                // missing.
                // ─────────────────────────────────────────────────────────────
                rawDecisionOutput.status = 'SYSTEM_ERROR';
                rawDecisionOutput.primary_decision = null;
                rawDecisionOutput.invariant_violation = {
                  reason: 'NO_ELIGIBLE_MATCHED_RESPONSES',
                  raw_matched_count: rawMatchedCount,
                  layered_matched_count: layeredMatchedCount,
                  trace_id: traceId,
                };

                console.log(`   📋 SYSTEM_ERROR surfaced (no fabricated decision)`);
              }
            }
          }
        } else {
          console.log(`   ✅ Primary decision invariant PASSED: action_type=${primaryDecision.action_type}, rule_id=${primaryDecision.rule_id || primaryDecision.application_details?.rule_id}`);
        }
      }
    } else {
      console.log(`   ⚠️ No decision_output present in orchestrator response`);
    }
    
    // STEP 2: Extract and audit with filter logging
    const { actions_returned, actions_filtered_out, audit_log, filter_trace } = extractAndAuditActionsWithFilterTrace(orchestratorResponse, traceId, detectedLanguage);
    
    // STEP 3: Log DURING filtering - each filter rule applied
    console.log(`\n🔬 [${traceId}] ─── DURING FILTERING: FILTER RULES APPLIED ───`);
    if (filter_trace && filter_trace.length > 0) {
      filter_trace.forEach((trace, idx) => {
        const icon = trace.passed ? '✅' : '❌';
        console.log(`   ${icon} Rule ${idx + 1}: ${trace.filter_name}`);
        console.log(`      Action: ${trace.action}`);
        console.log(`      Result: ${trace.passed ? 'PASSED' : 'BLOCKED'}`);
        if (!trace.passed) {
          console.log(`      Reason: ${trace.reason}`);
          console.log(`      Category: ${trace.category}`);
        }
      });
    } else {
      console.log(`   ℹ️ No explicit filter rules applied (direct pass-through)`);
    }
    
    // STEP 4: Log AFTER filtering - what PASSED and what was BLOCKED
    console.log(`\n🔬 [${traceId}] ─── AFTER FILTERING: FINAL RESULTS ───`);
    console.log(`   ✅ PASSED Actions: ${actions_returned?.length || 0}`);
    console.log(`   ❌ BLOCKED Actions: ${actions_filtered_out?.length || 0}`);
    
    if (actions_returned && actions_returned.length > 0) {
      console.log(`   ─── PASSED RECOMMENDATIONS ───`);
      actions_returned.forEach((action, idx) => {
        console.log(`   ${idx + 1}. [PASSED] ${action.action_type || action.action}`);
        console.log(`      Product: ${action.product_name || 'N/A'}`);
        console.log(`      Priority: ${action.priority || 'N/A'}`);
        console.log(`      Rule ID: ${action.rule_id || 'N/A'}`);
      });
    }
    
    if (actions_filtered_out && actions_filtered_out.length > 0) {
      console.log(`   ─── BLOCKED ACTIONS (with explicit reasons) ───`);
      actions_filtered_out.forEach((filtered, idx) => {
        console.log(`   ${idx + 1}. [BLOCKED] ${filtered.action}`);
        console.log(`      Category: ${filtered.filter_category}`);
        console.log(`      Reason: ${filtered.reason}`);
        console.log(`      Blocked By Rule: ${filtered.blocked_by_rule || 'SYSTEM'}`);
        if (filtered.alternatives?.length > 0) {
          console.log(`      Alternatives: ${filtered.alternatives.join(', ')}`);
        }
      });
    }
    
    // Log filter category summary
    if (Object.keys(audit_log.filter_categories).length > 0) {
      console.log(`   ─── FILTER CATEGORY SUMMARY ───`);
      Object.entries(audit_log.filter_categories).forEach(([category, count]) => {
        console.log(`      ${category}: ${count} action(s) blocked`);
      });
    }
    
    if (audit_log.validation_errors.length > 0) {
      console.warn(`⚠️ [${traceId}] Validation Errors:`, audit_log.validation_errors);
    }
    console.log(`🔬 [${traceId}] ═══ FILTERING AUDIT END ═══\n`);
    
    // STEP 5: Check if ALL actions were filtered - generate special response
    const allActionsFiltered = orchestratorResponse.type === 'DECISION_PROVIDED' &&
      (!actions_returned || actions_returned.length === 0) &&
      (actions_filtered_out && actions_filtered_out.length > 0);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 5: LLM RESPONSE FORMATTING & DELIVERY
    // Takes rule engine output and formats it into natural, empathetic advice
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`\n📝 [${traceId}] ═══ PHASE 5: LLM RESPONSE FORMATTING ═══`);
    
    let responseContent: string;
    let llmFormatterOutput: LLMFormatterOutput | null = null;
    let aiModelUsed: string | undefined;
    
    // Calculate remaining time for timeout protection (25s total budget, minus time spent so far)
    const timeSpentSoFar = Date.now() - startTime;
    const remainingTime = Math.max(25000 - timeSpentSoFar, 5000); // At least 5s for formatting
    console.log(`   Time budget: ${remainingTime}ms remaining for response formatting`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX (2026-06-07 RCA #16): Generalised short-circuit bypass.
    //
    // The orchestrator has multiple short-circuit lanes — Static Gate,
    // NO_ACTIVE_CROP guard, NEXT_CROP_RECOMMENDATION engine, Greeting, Stage
    // Fallback — that each build a complete, localized, deterministic payload
    // (full_text in mr/hi/en, confidence_score, source). Previously ONLY
    // STATIC_DIRECT was honored; every other short-circuit fell through into
    // filtering → confidence-bridge → unified-gate → safety-gate → LLM template
    // formatter, which (a) wiped actions_returned, (b) overwrote the 1.0
    // confidence with 0, and (c) emitted a generic clarification template
    // with literal `{symptom}` placeholders.
    //
    // We now recognise the full set and route them straight to delivery.
    // ═══════════════════════════════════════════════════════════════════════════
    const SHORT_CIRCUIT_TEMPLATE_TYPES = new Set([
      'STATIC_DIRECT',
      'NO_ACTIVE_CROP',
      'NEXT_CROP_RECOMMENDATION',
      'GREETING',
      'STAGE_FALLBACK',
    ]);
    const SHORT_CIRCUIT_SOURCES = new Set([
      'STATIC_DATA_GATE',
      'NO_ACTIVE_CROP_GUARD',
      'NEXT_CROP_RECOMMENDATION_ENGINE',
      'NEXT_CROP_RECOMMENDATION_FALLBACK',
    ]);
    const shortCircuitTemplateType = (orchestratorResponse.decision_output as any)?.metadata?.template_type as string | undefined;
    const shortCircuitSource = (orchestratorResponse.communication as any)?.metadata?.source as string | undefined;
    const isShortCircuitResponse =
      (shortCircuitTemplateType && SHORT_CIRCUIT_TEMPLATE_TYPES.has(shortCircuitTemplateType)) ||
      (shortCircuitSource && SHORT_CIRCUIT_SOURCES.has(shortCircuitSource));
    // Backwards-compat alias retained for any reader of this name downstream.
    const isStaticGateResponse = isShortCircuitResponse;

    if (isShortCircuitResponse) {
      // Orchestrator already produced the localized, deterministic response.
      // Use it verbatim; do NOT run filtering, confidence-bridge, unified-gate,
      // safety-gate, or LLM/template formatting.
      const fullText = (orchestratorResponse.communication as any)?.main_message?.full_text || {};
      responseContent =
        fullText[detectedLanguage] ||
        fullText.en ||
        fullText.mr ||
        fullText.hi ||
        'Information not available';

      // Choose a clear sentinel for traces / persistence.
      const aiModelByTemplate: Record<string, string> = {
        STATIC_DIRECT: 'template-static-gate',
        NO_ACTIVE_CROP: 'template-no-active-crop',
        NEXT_CROP_RECOMMENDATION: 'next-crop-engine',
        GREETING: 'template-greeting',
        STAGE_FALLBACK: 'template-stage-fallback',
      };
      aiModelUsed = aiModelByTemplate[shortCircuitTemplateType || ''] ||
        (shortCircuitSource === 'STATIC_DATA_GATE' ? 'template-static-gate' : 'template-short-circuit');

      // Defensive placeholder guard — never leak unfilled `{token}` to farmers.
      if (responseContent && /\{[a-zA-Z_]+\}/.test(responseContent)) {
        console.error(`🚨 [ShortCircuit] Unfilled placeholder detected in response — falling back to safe text`);
        responseContent = detectedLanguage === 'mr'
          ? 'कृपया अधिक माहिती द्या जेणेकरून योग्य सल्ला देता येईल.'
          : detectedLanguage === 'hi'
            ? 'कृपया अधिक जानकारी दें ताकि सही सलाह दी जा सके।'
            : 'Please share a bit more detail so we can give precise advice.';
      }

      // Preserve orchestrator-supplied confidence so persistence + UI builder
      // read the authoritative value (not the confidence-bridge's 0).
      const scConfidence =
        (orchestratorResponse.decision_output as any)?.metadata?.confidence ??
        (orchestratorResponse.communication as any)?.metadata?.confidence_score ??
        1.0;
      orchestratorResponse.metadata = orchestratorResponse.metadata || {};
      (orchestratorResponse.metadata as any).confidence = scConfidence;
      (orchestratorResponse.metadata as any).confidence_score = scConfidence;

      console.log(`   ⚡ [ShortCircuit] template=${shortCircuitTemplateType} source=${shortCircuitSource} model=${aiModelUsed} confidence=${scConfidence} length=${responseContent.length}`);
    } else if (allActionsFiltered) {
      // Special response when all actions were filtered
      console.log(`   ⚠️ ALL actions filtered - generating explanation response`);
      responseContent = generateAllActionsFilteredResponse(actions_filtered_out, detectedLanguage);
    } else if (orchestratorResponse.type === 'DECISION_PROVIDED' && orchestratorResponse.decision_output) {
      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE-14: Check for Stage Fallback Response first
      // If orchestrator returned a stage-aware fallback, use it directly
      // ═══════════════════════════════════════════════════════════════════════════
      const decisionOutput = orchestratorResponse.decision_output as any;
      if (decisionOutput.status === 'STAGE_FALLBACK' && decisionOutput.stage_fallback_message) {
        console.log(`   🌱 [STAGE_FALLBACK] Using stage-aware fallback response`);
        responseContent = decisionOutput.stage_fallback_message;
        // Skip LLM formatting - stage fallback is already formatted
      } else {
      // PHASE 5: Use LLM to format rule engine recommendations
      console.log(`   🤖 Using LLM formatter for natural language generation`);
      
      try {
        // FIX: Build land context for LLM with fallback chain
        // Priority 1: From dataAudit (normal path)
        // Priority 2: From decision_output metadata lockedCropContext (OPTION_SELECTED path)
        // Priority 3: From metadata lockedCropContext (fallback)
        // FIX 3: Complete lockedCropContext propagation chain — 4-priority fallback
        const lockedCropCtx = orchestratorResponse.decision_output?.metadata?.lockedCropContext ||
                              orchestratorResponse.metadata?.lockedCropContext;
        
        const landContext = orchestratorResponse.dataAudit?.land?.found ? {
          // Priority 1: From dataAudit (normal land-linked path)
          current_crop: orchestratorResponse.dataAudit.land.current_crop,
          growth_stage: orchestratorResponse.dataAudit.land.growth_stage,
          area_acres: orchestratorResponse.dataAudit.land.area_acres,
          days_since_sowing: orchestratorResponse.dataAudit.land.days_since_sowing,
          soil_health: orchestratorResponse.dataAudit?.soil_health?.found ? {
            nitrogen_kg_per_ha: orchestratorResponse.dataAudit.soil_health.nitrogen_kg_per_ha,
            phosphorus_kg_per_ha: orchestratorResponse.dataAudit.soil_health.phosphorus_kg_per_ha,
            potassium_kg_per_ha: orchestratorResponse.dataAudit.soil_health.potassium_kg_per_ha,
            ph_level: orchestratorResponse.dataAudit.soil_health.ph_level
          } : undefined,
          ndvi: orchestratorResponse.dataAudit?.ndvi?.found ? {
            value: orchestratorResponse.dataAudit.ndvi.latest_value,
            trend: orchestratorResponse.dataAudit.ndvi.trend
          } : undefined
        } : lockedCropCtx ? {
          // Priority 2: From lockedCropContext (OPTION_SELECTED path)
          current_crop: lockedCropCtx.crop_name,
          growth_stage: lockedCropCtx.growth_stage,
          days_since_sowing: lockedCropCtx.days_since_sowing,
          area_acres: lockedCropCtx.area_acres
        } : sessionState?.last_crop ? {
          // Priority 3: From sessionState (multi-turn continuity)
          current_crop: sessionState.last_crop,
          growth_stage: (sessionState as any)?.last_growth_stage || 'VEGETATIVE',
          days_since_sowing: 0,
        } : undefined;
        
        const landContextSource = orchestratorResponse.dataAudit?.land?.found ? 'dataAudit' 
          : lockedCropCtx ? 'lockedCropContext' 
          : sessionState?.last_crop ? 'sessionState' : 'NONE';
        console.log(`   📊 [LandContext] Built from ${landContextSource}`);
        if (landContext) {
          console.log(`      Crop: ${landContext.current_crop}, Stage: ${landContext.growth_stage}, Days: ${landContext.days_since_sowing}`);
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // SSOT OVERLAY: derive DAS + growth_stage from crop_schedules.sowing_date
        // (date of sowing) and crop_stage_master (DB stage windows). This is the
        // single authoritative source — overrides any earlier heuristic value.
        // Never invents a stage from code; missing rows surface as 'UNKNOWN'.
        // ═══════════════════════════════════════════════════════════════════════════
        try {
          const timeline = await resolveCropTimeline({
            landId: landId || null,
            supabase,
            scope: (orchestratorResponse.metadata?.scope as any) || undefined,
          });
          if (timeline.schedule_source === 'crop_schedules') {
            if (landContext) {
              if (typeof timeline.days_since_sowing === 'number') {
                landContext.days_since_sowing = timeline.days_since_sowing;
              }
              if (timeline.growth_stage && timeline.growth_stage !== 'UNKNOWN') {
                landContext.growth_stage = timeline.growth_stage;
              }
              (landContext as any).sowing_date = timeline.sowing_date;
              (landContext as any).expected_harvest_date = timeline.expected_harvest_date;
              (landContext as any).maturity_days = timeline.maturity_days;
              (landContext as any).crop_code = timeline.crop_code;
            }
            console.log(`   📅 [CropTimeline SSOT] sow=${timeline.sowing_date} DAS=${timeline.days_since_sowing} stage=${timeline.growth_stage} (stage_src=${timeline.stage_source}, maturity_src=${timeline.maturity_source})`);
          } else {
            console.log(`   📅 [CropTimeline SSOT] no active crop_schedule for land — keeping prior landContext values`);
          }
        } catch (e) {
          console.warn(`   ⚠️ [CropTimeline SSOT] resolveCropTimeline failed: ${(e as Error).message}`);
        }
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 11.1: CONTEXT AUTHORITY RECONCILIATION
        // Ensures lockedCropContext overrides canonical defaults before rendering
        // ═══════════════════════════════════════════════════════════════════════════
        const renderContext = resolveFinalRenderContext(
          landContext,
          lockedCropCtx as CropContextAuthority | null | undefined,
          orchestratorResponse.dataAudit
        );
        
        // If authority override was applied, update landContext for downstream usage
        if (renderContext.authority_override_applied && landContext) {
          console.log(`   🔄 [Reconciliation] Updating landContext with authority values`);
          landContext.current_crop = renderContext.crop_name;
          landContext.growth_stage = renderContext.growth_stage;
          landContext.days_since_sowing = renderContext.days_since_sowing;
        }
        
        // Use renderContext values for response generation (authority-reconciled)
        const finalCropName = renderContext.crop_name;
        const finalGrowthStage = renderContext.growth_stage;
        const finalDaysSinceSowing = renderContext.days_since_sowing;
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 11 + P1-4: UNIFIED DECISION GATE - Single point of treatment validation
        // Replaces dual prescription-gate and decision-readiness-gate
        // ═══════════════════════════════════════════════════════════════════════════
        
        // ═══════════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: Extract symptom_keys from SSOT (decision_output) first
        // The orchestrator stores symptom info in decision_output, not just metadata
        // ═══════════════════════════════════════════════════════════════════════════
        const decisionOutput = orchestratorResponse.decision_output as Record<string, any> || {};
        const symptomKeysFromDecision = [
          ...(Array.isArray(decisionOutput.symptom_keys) ? decisionOutput.symptom_keys : []),
          ...(Array.isArray(decisionOutput.observation_keys) ? decisionOutput.observation_keys : []),
          ...(Array.isArray(decisionOutput.canonical_observations) ? decisionOutput.canonical_observations : []),
          ...(Array.isArray(decisionOutput.confirmed_observations) ? decisionOutput.confirmed_observations : []),
          ...(Array.isArray(decisionOutput.confirmed_observation_codes) ? decisionOutput.confirmed_observation_codes : []),
        ];
        const symptomKeysFromMetadata = [
          ...(Array.isArray(orchestratorResponse.metadata?.symptomKeys) ? orchestratorResponse.metadata.symptomKeys : []),
          ...(Array.isArray(orchestratorResponse.metadata?.confirmed_observations) ? orchestratorResponse.metadata.confirmed_observations : []),
          ...(Array.isArray(orchestratorResponse.metadata?.confirmed_observation_codes) ? orchestratorResponse.metadata.confirmed_observation_codes : []),
        ];
        const mergedSymptomKeys = [...new Set([...symptomKeysFromDecision, ...symptomKeysFromMetadata])];
        
        // ═══════════════════════════════════════════════════════════════════════════
        // CONFIDENCE BRIDGE: Extract symbolic confidence as SSOT for decision_confidence
        // ═══════════════════════════════════════════════════════════════════════════
        // CONFIDENCE BRIDGE v2 (RCA audit 2026-06-07): widened fallback chain
        // so missing `weighted_confidence` / `confidence_score` no longer collapses
        // the entire pipeline to 0. Order: layered → primary → hypothesis → 0.
        const decisionOutputForConf: any = orchestratorResponse.decision_output || {};
        const layered: any = decisionOutputForConf.layered_rule_result || {};
        const primary: any = decisionOutputForConf.primary_decision || {};
        const hypothesis: any = decisionOutputForConf.hypothesis_result || {};
        const rawSymbolicConfidence: number =
          layered?.primary_decision?.weighted_confidence ??
          layered?.primary_decision?.confidence_score ??
          layered?.primary_decision?.rule_confidence ??
          primary?.weighted_confidence ??
          primary?.confidence_score ??
          primary?.rule_confidence ??
          primary?.score ??
          hypothesis?.hypothesis_score ??
          orchestratorResponse.metadata?.confidence ??
          0;
        // Guard NaN / out-of-range; normalize 0-100 inputs to 0-1.
        let symbolicConfidence = isNaN(rawSymbolicConfidence) ? 0.5 : rawSymbolicConfidence;
        if (symbolicConfidence > 1) symbolicConfidence = symbolicConfidence / 100;
        if (symbolicConfidence < 0) symbolicConfidence = 0;
        if (symbolicConfidence > 1) symbolicConfidence = 1;

        // ── Observation → SAFE-rule precheck (drives young-crop bypass + OBSERVATION text)
        const observationCodesForBypass = extractObservationCodes(mergedSymptomKeys);
        let observationRuleHit: ObservationRuleHit | null = null;
        if (observationCodesForBypass.length > 0 && finalCropName && finalGrowthStage) {
          try {
            observationRuleHit = await lookupSafeRuleForObservations(supabase, {
              confirmedObservations: observationCodesForBypass,
              cropCode: String(finalCropName).toUpperCase(),
              growthStage: String(finalGrowthStage).toUpperCase(),
              language: detectedLanguage,
              // SSOT DAS from resolveCropTimeline → renderContext
              daysSinceSowing: typeof finalDaysSinceSowing === 'number' ? finalDaysSinceSowing : null,
            });
            if (observationRuleHit) {
              console.log(`   🎯 [ObservationRuleLookup] hit rule=${observationRuleHit.rule_id} safety=${observationRuleHit.farmer_safety_level} lang_localized=${!!observationRuleHit.localized_text}`);
            }
          } catch (e) {
            console.warn(`   ⚠️ [ObservationRuleLookup] failed: ${(e as Error).message}`);
          }
        }

        const unifiedGateInput: UnifiedGateInput = {
          authority_decision: orchestratorResponse.decision_output?.authority_decision || {
            authority: 'NONE',
            authority_status: 'UNCONFIRMED',
            treatments_allowed: false,
            reason: 'No authority resolved'
          },
          symbolic_decision: orchestratorResponse.decision_output as any,
          crop_name: finalCropName,
          growth_stage: finalGrowthStage,
          days_since_sowing: finalDaysSinceSowing,
          stage_source: orchestratorResponse.metadata?.stageSource || 'UNKNOWN',
          symptom_keys: mergedSymptomKeys,
          is_specific_symptom: !!orchestratorResponse.decision_output?.primary_decision?.target,
          clarification_turn_count: orchestratorResponse.metadata?.clarificationTurnCount || 0,
          pending_clarification: orchestratorResponse.decision_output?.clarification_needed || false,
          has_emergency_indicators: orchestratorResponse.metadata?.isEmergency || false,
          land_id: landId,
          decision_confidence: Math.round(symbolicConfidence * 100),  // Convert 0-1 to 0-100
          hypothesis_confidence: orchestratorResponse.decision_output?.hypothesis_result?.hypothesis_score ?? undefined,
          confirmed_observation_has_safe_rule: !!observationRuleHit,
          confirmed_observation_rule_id: observationRuleHit?.rule_id,
          confirmed_observation_codes: observationCodesForBypass,
        } as any;

        // INVARIANT: If symbolic layer selected a primary decision, confidence must not be zero
        const primaryDecisionExists = !!(orchestratorResponse.decision_output?.primary_decision?.rule_id ||
          orchestratorResponse.decision_output?.layered_rule_result?.primary_decision?.rule_id);

        if (primaryDecisionExists && symbolicConfidence === 0) {
          console.error(`🚨 [INVARIANT] Confidence pipeline inconsistency: primary_decision exists but symbolic_confidence=0`);
          console.error(`   Forcing minimum confidence of 0.5 to prevent decision suppression`);
          symbolicConfidence = 0.5;                          // mutate SSOT, not just gate input
          unifiedGateInput.decision_confidence = 50;
        }

        // Propagate the resolved confidence back into metadata so every downstream
        // surface (UI builder, persistence, audit log) reads the same value.
        orchestratorResponse.metadata = orchestratorResponse.metadata || {};
        orchestratorResponse.metadata.confidence = symbolicConfidence;
        orchestratorResponse.metadata.confidence_score = symbolicConfidence;

        console.log(`   📊 [ConfidenceBridge] symbolic_confidence=${symbolicConfidence.toFixed(3)} -> decision_confidence=${unifiedGateInput.decision_confidence}`);
        console.log(`   🔍 [UnifiedGate] Input: crop=${finalCropName}, stage=${finalGrowthStage}, DAS=${finalDaysSinceSowing}, symptoms=${mergedSymptomKeys.length}`);

        
        // FIX 1: Read gate result from orchestrator if already evaluated there (avoid duplicate gate)
        const orchestratorGateResult = orchestratorResponse.metadata?.gate_result;
        let unifiedGateResult: any;
        
        if (orchestratorGateResult && orchestratorGateResult.gate_status) {
          // Gate already evaluated in orchestrator — use that result
          console.log(`   🔄 [UnifiedGate] Using pre-evaluated gate from orchestrator`);
          unifiedGateResult = orchestratorGateResult;
        } else {
          // Backward compat: evaluate gate here if orchestrator didn't provide it
          const rawGateResult = evaluateUnifiedGate(unifiedGateInput);
          
          // Apply suppression guard to prevent silent recommendation drops
          // ═══════════════════════════════════════════════════════════════════════════
          // CRITICAL FIX: Use decision_output as SSOT, not metadata
          // decision_output contains the actual rules/actions from symbolic brain
          // ═══════════════════════════════════════════════════════════════════════════
          const decisionOutputSsot = orchestratorResponse.decision_output as Record<string, any> || {};
          // ───────────────────────────────────────────────────────────────
          // WAVE-R: SSOT counter is `firedRuleIds()` ONLY. matched_responses
          // and candidate_rules are NOT fired rules; using them inflated the
          // counter and re-opened the suppression gate. Identity-verified.
          // ───────────────────────────────────────────────────────────────
          const _firedRids = firedRuleIds(decisionOutputSsot);
          const symbolicDecisionForGuard = {
            decision_brain_source: orchestratorResponse.decision_brain_source || decisionOutputSsot.decision_brain_source,
            rules_fired: _firedRids,
            actions_returned: decisionOutputSsot.actions_returned ||
                              orchestratorResponse.metadata?.actionsReturned || [],
            // Filter matched_responses to only entries whose rule_id actually fired.
            matched_responses: (Array.isArray(decisionOutputSsot.matched_responses)
              ? decisionOutputSsot.matched_responses
              : []
            ).filter((r: any) => r?.rule_id && _firedRids.includes(r.rule_id))
          };

          console.log(`   🔍 [SuppressionGuard] SSOT check: rules=${symbolicDecisionForGuard.rules_fired?.length || 0}, actions=${symbolicDecisionForGuard.actions_returned?.length || 0}, responses=${symbolicDecisionForGuard.matched_responses?.length || 0}`);
          
          unifiedGateResult = applySuppressionGuard(rawGateResult, symbolicDecisionForGuard);
        }
        
        console.log(`   🚦 [UnifiedGate] ${unifiedGateResult.gate_status === 'PASS' ? '✅ PASS' : unifiedGateResult.gate_status === 'EMERGENCY_BYPASS' ? '🚨 EMERGENCY' : '🚫 ' + unifiedGateResult.gate_status}`);
        console.log(`      Response Mode: ${unifiedGateResult.response_mode}`);
        console.log(`      Action: ${unifiedGateResult.gate_action}`);
        console.log(`      Reason: ${unifiedGateResult.reason}`);
        if (unifiedGateResult.reason?.includes('Suppression guard')) {
          console.log(`      ✅ SUPPRESSION GUARD ACTIVATED - recommendations preserved`);
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // P0 HOTFIX: SAFETY GATES (Confidence/Clarification/NDVI/Stage/Foliar)
        // Runs AFTER unified gate; can downgrade to CLARIFY or BLOCK and override
        // unified gate's treatments_allowed. Result is persisted into the audit log.
        // ═══════════════════════════════════════════════════════════════════════════
        let safetyGateResult: SafetyGateResult | null = null;
        try {
          const candidateRulesForGate = (
            (orchestratorResponse.decision_output as any)?.layered_rule_result?.candidates ||
            (orchestratorResponse.decision_output as any)?.candidates ||
            []
          ).map((c: any) => ({
            rule_id: c.rule_id || c.rule?.rule_id,
            category: c.category ?? c.rule?.category ?? null,
            canonical_group: c.canonical_group ?? c.rule?.canonical_group ?? null,
            crop_age_days_max: c.crop_age_days_max ?? c.rule?.crop_age_days_max ?? null,
            crop_age_days_min: c.crop_age_days_min ?? c.rule?.crop_age_days_min ?? null,
            application_method: c.application_method ?? c.rule?.application_method ?? null,
            active_ingredient: c.active_ingredient ?? c.rule?.active_ingredient ?? null,
            water_volume_per_acre: c.water_volume_per_acre ?? c.rule?.water_volume_per_acre ?? null,
            // WAVE 2 FIX (P1-4): dosage_per_acre gates the foliar safety check
            dosage_per_acre: c.dosage_per_acre ?? c.rule?.dosage_per_acre ?? null,
            action_type: c.action_type ?? c.rule?.action_type ?? null,
          })).filter((c: any) => !!c.rule_id);

          // Add the primary decision as a candidate too
          const pd: any = (orchestratorResponse.decision_output as any)?.primary_decision
            || (orchestratorResponse.decision_output as any)?.layered_rule_result?.primary_decision;
          if (pd?.rule_id && !candidateRulesForGate.some((c: any) => c.rule_id === pd.rule_id)) {
            candidateRulesForGate.unshift({
              rule_id: pd.rule_id,
              category: pd.category ?? null,
              canonical_group: pd.canonical_group ?? null,
              crop_age_days_max: pd.crop_age_days_max ?? null,
              crop_age_days_min: pd.crop_age_days_min ?? null,
              application_method: pd.application_method ?? pd.application_details?.application_method ?? null,
              active_ingredient: pd.active_ingredient ?? pd.application_details?.active_ingredient ?? null,
              water_volume_per_acre: pd.water_volume_per_acre ?? pd.application_details?.water_volume_per_acre ?? null,
              dosage_per_acre: pd.dosage_per_acre ?? pd.application_details?.dosage_per_acre ?? null,
              action_type: pd.action_type ?? null,
            });
          }

          // Pull discriminator scores from observation_master snapshot if present
          const obsScores: Record<string, number> = (orchestratorResponse.metadata?.observationDiscriminatorScores
            || (orchestratorResponse.decision_output as any)?.observation_discriminator_scores
            || {}) as Record<string, number>;

          const soilK = (landContext as any)?.soil_health?.potassium_kg_per_ha ?? null;
          const soilKBand: 'LOW' | 'MEDIUM' | 'HIGH' | null = soilK === null || soilK === undefined
            ? null
            : (soilK >= 200 ? 'HIGH' : soilK >= 120 ? 'MEDIUM' : 'LOW');
          const ndviVal: number | null = (landContext as any)?.ndvi?.value ?? null;

          // SSOT FIX (2026-06-07): Differential clarification questions are
          // derived from the rich, already-populated SSOT tables
          // (observation_translations + intent_translations via
          // intent_observation_mapping). The previously-queried
          // `observation_differential_questions` table is effectively empty
          // and is now deprecated. See
          // services/observation-question-resolver.ts for the fallback chain.
          let diffLookup: Record<string, string> = {};
          if (mergedSymptomKeys.length > 0) {
            try {
              diffLookup = await buildDifferentialQuestionLookup(
                supabase,
                mergedSymptomKeys,
                detectedLanguage,
                finalCropName
              );
            } catch (e) {
              console.warn(`[SafetyGates] differential question resolver failed: ${(e as Error).message}`);
              diffLookup = {};
            }
          }

          const safetyInput: SafetyGateInput = {
            trace_id: traceId,
            crop_name: finalCropName,
            growth_stage: finalGrowthStage,
            days_since_sowing: finalDaysSinceSowing ?? null,
            symptom_keys: mergedSymptomKeys,
            symptom_discriminator_scores: obsScores,
            number_of_distinct_observations: mergedSymptomKeys.length,
            photo_present: !!imageUrl,
            soil_potassium_kg_ha: soilK,
            soil_potassium_band: soilKBand,
            soil_nitrogen_band: null,
            ndvi: ndviVal,
            primary_hypothesis_id: (orchestratorResponse.decision_output as any)?.hypothesis_result?.primary_hypothesis_id
              ?? (orchestratorResponse.decision_output as any)?.primary_hypothesis_id
              ?? null,
            primary_decision_rule_id: pd?.rule_id ?? null,
            candidate_rules: candidateRulesForGate,
            current_confidence: symbolicConfidence,
            differential_questions: diffLookup,
            confirmed_safe_rule_bypass: unifiedGateResult?.gate_action === GateAction.PROVIDE_OBSERVATION_ONLY
              && unifiedGateResult?.response_mode === ResponseMode.OBSERVATION,
            response_mode: unifiedGateResult?.response_mode,
          };


          safetyGateResult = runSafetyGates(safetyInput, detectedLanguage);

          // 2026-06-21 FIX: when unified gate has already approved a SAFE rule
          // via the confirmed_safe_rule_exists bypass (e.g. YOUNG_CROP_RESOW),
          // do NOT let the safety-gate's clarify override throw away that rule
          // and bounce the farmer back into another question loop.
          const safeBypassActive = safetyInput.confirmed_safe_rule_bypass === true;

          if (safetyGateResult.override_mode !== 'NONE' && !safeBypassActive) {
            console.warn(`🛡️ [SafetyGates] OVERRIDE=${safetyGateResult.override_mode} - downgrading unified gate to CLARIFY`);
            unifiedGateResult.treatments_allowed = false;
            unifiedGateResult.response_mode = ResponseMode.CLARIFICATION;
            (unifiedGateResult as any).reason =
              `Safety-gate override (${safetyGateResult.override_mode}): ` +
              Object.entries(safetyGateResult.gate_decisions)
                .filter(([, v]) => !v.passed)
                .map(([k, v]) => `${k}: ${v.reason}`)
                .join(' | ');
          } else if (safetyGateResult.override_mode !== 'NONE' && safeBypassActive) {
            console.log(`🛡️ [SafetyGates] OVERRIDE=${safetyGateResult.override_mode} IGNORED — confirmed_safe_rule bypass active; preserving unified gate ALLOW path`);
            safetyGateResult.override_mode = 'NONE';
          }

          // Persist gate_decisions into the audit row (best-effort, by trace_id)
          try {
            const payload = {
              version: safetyGateResult.version,
              override_mode: safetyGateResult.override_mode,
              effective_confidence: safetyGateResult.effective_confidence,
              rejected_rule_ids: safetyGateResult.rejected_rule_ids,
              decisions: safetyGateResult.gate_decisions,
              evaluated_at: new Date().toISOString(),
            };
            // Fire-and-forget update keyed by trace_id; column exists per migration.
            // @ts-ignore - generated types may not yet include gate_decisions
            await supabase
              .from('ai_chat_audit_logs')
              .update({ gate_decisions: payload, actions_filtered_out: { rejected_by_safety_gates: safetyGateResult.rejected_rule_ids } })
              .eq('trace_id', traceId);
          } catch (e) {
            console.warn(`🛡️ [SafetyGates] audit persist failed:`, (e as Error).message);
          }
        } catch (e) {
          console.error(`🛡️ [SafetyGates] runtime error:`, (e as Error).message);
        }

        // If unified gate blocks treatments, use appropriate fallback response
        if (!unifiedGateResult.treatments_allowed) {
          console.log(`   ⚠️ Unified gate blocked treatments - using ${unifiedGateResult.response_mode} response`);
          
          if (unifiedGateResult.response_mode === ResponseMode.DIAGNOSTIC_ESCALATION) {
            // ═══════════════════════════════════════════════════════════════
            // Wave-P (Stage 1+2): Differential enrichment + chips
            // The pre-Wave-P path passed matched_rules=[] which collapsed the
            // farmer response to a single tautological yes/no question. We
            // now call the symbolic hypothesis evaluator inline to derive a
            // ranked differential AND a selectable chip set.
            // ═══════════════════════════════════════════════════════════════
            console.log(`   🔬 DIAGNOSTIC_ESCALATION - enriching differential via hypothesis evaluator`);

            const symptomKeysForEscalation: string[] = orchestratorResponse.metadata?.symptomKeys
              || mergedSymptomKeys
              || [];

            // Best-effort enrichment. If the evaluator throws (DB down,
            // missing crop, etc.) we still emit the legacy escalation rather
            // than a hard error.
            let enrichment: Awaited<ReturnType<typeof enrichDiagnosticDifferential>> | null = null;
            try {
              if (finalCropName && finalGrowthStage) {
                enrichment = await enrichDiagnosticDifferential({
                  supabase,
                  crop_code: String(finalCropName).toUpperCase(),
                  growth_stage: String(finalGrowthStage).toUpperCase(),
                  days_since_sowing: typeof finalDaysSinceSowing === 'number' ? finalDaysSinceSowing : null,
                  observations: [...new Set([...(observationCodesForBypass || []), ...symptomKeysForEscalation])],
                  ndvi_level: (orchestratorResponse.metadata as any)?.ndvi?.level,
                  ndvi_trend: (orchestratorResponse.metadata as any)?.ndvi?.trend,
                  user_query: lastUserMessage?.content || '',
                  language: detectedLanguage,
                  trace_id: orchestratorResponse.metadata?.trace_id || `esc_${Date.now()}`,
                });
                console.log(`   📊 [DifferentialEnricher] candidates=${enrichment.candidate_count} chips=${enrichment.clarification_chips.length} top_conf=${enrichment.top_confidence.toFixed(2)}`);
              } else {
                console.warn(`   ⚠️ [DifferentialEnricher] skipped — missing crop/stage`);
              }
            } catch (e) {
              console.error(`   ❌ [DifferentialEnricher] failed: ${(e as Error).message}`);
            }

            // Wave-P Stage 4 invariant: a DIAGNOSTIC_ESCALATION with symptoms
            // MUST carry ≥1 hypothesis. If the enricher returned nothing AND
            // the legacy escalation also has nothing, downgrade to OBSERVATION
            // rather than emit a hollow yes/no question.
            const legacyHypotheses = unifiedGateResult.diagnostic_escalation?.hypotheses?.length || 0;
            const enrichedHypotheses = enrichment?.matched_rules?.length || 0;
            const totalHypotheses = legacyHypotheses + enrichedHypotheses;

            if (totalHypotheses === 0 && symptomKeysForEscalation.length > 0) {
              console.warn(`   🚨 [SYMBOLIC_CONTRACT_VIOLATION] DIAGNOSTIC_ESCALATION emitted with zero hypotheses — downgrading to OBSERVATION mode`);
              unifiedGateResult.response_mode = ResponseMode.OBSERVATION;
              unifiedGateResult.reason = `${unifiedGateResult.reason} | wave-p:zero_hypotheses_downgrade`;
              // Fall through to the OBSERVATION branch below by skipping the rest of this block
            } else {
              // Build the canonical escalation payload from enriched data
              // when available; otherwise use the gate's data as-is.
              const matchedRulesForEscalation = enrichment?.matched_rules
                ?? (orchestratorResponse.metadata?.matchedRules || []);

              const escalationInput: DiagnosticEscalationInput = {
                language: detectedLanguage,
                crop_name: finalCropName || 'Unknown',
                growth_stage: finalGrowthStage || 'Unknown',
                days_since_sowing: finalDaysSinceSowing,
                symptom_keys: symptomKeysForEscalation,
                matched_rules: matchedRulesForEscalation,
                current_confidence: symbolicConfidence
                  || unifiedGateResult.diagnostic_escalation?.current_confidence
                  || 0.4,
                treatment_threshold: unifiedGateResult.diagnostic_escalation?.threshold_for_treatment || 0.7,
              };

              // Rebuild escalation data with the populated matched_rules so
              // hypotheses[] is no longer empty.
              const rebuiltEscalation = generateDiagnosticEscalationData(escalationInput);

              // Attach Stage-2 chip payload + localized question
              if (enrichment && enrichment.clarification_chips.length > 0) {
                rebuiltEscalation.clarification_chips = enrichment.clarification_chips;
                rebuiltEscalation.clarification_question = enrichment.clarification_question;
              }

              responseContent = generateDiagnosticEscalationResponse(
                rebuiltEscalation,
                escalationInput
              );

              // Stage-3 frontend contract: surface chips through the same
              // metadata.clarification_options shape the chip renderer
              // already consumes (label/value/description/observation_key).
              const clarificationOptionsForUi = (enrichment?.clarification_chips || []).length > 0
                ? {
                    question: enrichment!.clarification_question,
                    options: enrichment!.clarification_chips.map(c => ({
                      label: c.label,
                      value: c.value,
                      description: c.description,
                      observation_key: c.observation_key,
                    })),
                    selectionType: 'SINGLE_CHOICE' as const,
                  }
                : undefined;

              // Mark orchestrator response as DIAGNOSTIC_ESCALATION for frontend
              orchestratorResponse.type = 'DIAGNOSTIC_ESCALATION' as any;
              orchestratorResponse.metadata = {
                ...orchestratorResponse.metadata,
                diagnostic_escalation: rebuiltEscalation,
                orchestrator_type: 'DIAGNOSTIC_ESCALATION',
                clarification_options: clarificationOptionsForUi,
                wave_p_enrichment: enrichment
                  ? {
                      candidate_count: enrichment.candidate_count,
                      top_confidence: enrichment.top_confidence,
                      chips_rendered: enrichment.clarification_chips.length,
                      enricher_version: enrichment.enricher_version,
                    }
                  : null,
                hypotheses_count: rebuiltEscalation.hypotheses.length,
              };
            }
          }

          // After the DIAGNOSTIC_ESCALATION block above, response_mode may
          // have been downgraded to OBSERVATION by the Wave-P invariant.
          // Fall through to the OBSERVATION / fallback branches below.
          if (unifiedGateResult.response_mode === ResponseMode.OBSERVATION) {
            // ─────────────────────────────────────────────────────────────
            // WAVE-Q INVARIANT (P0-C): "NO RULE FIRED → NO RECOMMENDATION".
            // Only consume observationRuleHit.text (which is a rule's stored
            // action_text) when the symbolic engine actually fired ≥1 rule.
            // Otherwise the farmer is shown a treatment narrative that was
            // never approved by rule evaluation. Fall back to the neutral
            // young-crop monitoring template instead.
            // ─────────────────────────────────────────────────────────────
            const dec: any = (orchestratorResponse.decision_output as any) || {};
            const rulesFiredCount = Array.isArray(dec.rules_applied)
              ? dec.rules_applied.length
              : Array.isArray(dec.layered_rule_result?.rules_applied)
                ? dec.layered_rule_result.rules_applied.length
                : Array.isArray(orchestratorResponse.metadata?.rulesFired)
                  ? orchestratorResponse.metadata.rulesFired.length
                  : 0;

            if (observationRuleHit && rulesFiredCount > 0) {
              responseContent = observationRuleHit.text;
              aiModelUsed = `rule:${observationRuleHit.rule_id}`;
              console.log(`   📜 [ObservationResponse] using rule=${observationRuleHit.rule_id} source=${observationRuleHit.source} rules_fired=${rulesFiredCount} lang=${detectedLanguage}`);
            } else {
              if (observationRuleHit && rulesFiredCount === 0) {
                console.warn(`   🚫 [SymbolicInvariant] observationRuleHit=${observationRuleHit.rule_id} suppressed — rules_fired=0; serving monitoring template instead of rule_action_text.`);
              }
              // Young crop - use monitoring response with authority-reconciled values
              responseContent = generateYoungCropMonitoringResponse(
                detectedLanguage,
                finalCropName,
                finalGrowthStage,
                finalDaysSinceSowing
              );
            }
          } else if (unifiedGateResult.response_mode !== ResponseMode.DIAGNOSTIC_ESCALATION) {
            // No confirmed diagnosis or authority block - use observation response
            // (Wave-P guard: never overwrite a successfully built DIAGNOSTIC_ESCALATION response)
            responseContent = generateObservationOnlyResponse(
              detectedLanguage,
              finalCropName,
              unifiedGateResult.reason
            );
          }


          // P0 HOTFIX: prefer safety-gate clarification text when present
          if (safetyGateResult?.clarification_text) {
            responseContent = safetyGateResult.clarification_text;
            console.log(`   🛡️ Safety-gate clarification text used (override_mode=${safetyGateResult.override_mode})`);
          }

          // Skip LLM formatting - use gate-generated response
          console.log(`   📋 Using unified gate fallback response (no LLM)`);
          if (renderContext.authority_override_applied) {
            console.log(`   ✅ Authority override ensured correct crop context in fallback response`);
          }
        } else {
          // ═══════════════════════════════════════════════════════════════════════════
          // PRESCRIPTION GATE PASSED - Continue with LLM formatting
          // ═══════════════════════════════════════════════════════════════════════════
          
          // SANITY CHECK: Prevent impossible stage calculations before LLM formatting
          // Uses reconciled values from renderContext
          const daysAfterSowing = finalDaysSinceSowing;
          const currentGrowthStage = finalGrowthStage?.toUpperCase();
          
          if (daysAfterSowing !== undefined && currentGrowthStage) {
            const impossibleHarvest = 
              (currentGrowthStage === 'HARVEST' || currentGrowthStage === 'MATURITY') && 
              daysAfterSowing < 100; // No crop harvests before 100 DAS
            
            if (impossibleHarvest) {
              console.error(`🚨 SANITY CHECK FAILED: ${currentGrowthStage} stage for ${daysAfterSowing} DAS crop`);
              console.error(`   Overriding to GERMINATION stage in landContext`);
              
              // Override to safe stage in landContext for LLM
              if (landContext) {
                landContext.growth_stage = 'GERMINATION';
              }
              
              // Also fix in dataAudit if present
              if (orchestratorResponse.dataAudit?.land) {
                orchestratorResponse.dataAudit.land.growth_stage = 'GERMINATION';
              }
            }
          }
        
          // Ensure decision_output includes rich SSOT fields (action_text/reason_text/knowledge_text)
          // so narration can always be generated from decision_rules, not templates.
          const decisionOutputForFormatting = orchestratorResponse.decision_output;

          // ───────────────────────────────────────────────────────────────
          // WAVE-R: SYMBOLIC INVARIANT GATE — universal safety contract.
          // Runs BEFORE hydrate and BEFORE the LLM formatter so that:
          //   • rules_fired===0 ⇒ primary_decision is nulled out, all
          //     candidate evidence preserved under `internal_candidates`.
          //   • emitted rule_id ∉ fired rule_ids ⇒ same scrub.
          // The gate also writes `decisionOutput.response_payload` as the
          // single farmer-visible surface for downstream consumers.
          // Crop-agnostic, language-agnostic, no agronomy logic.
          // ───────────────────────────────────────────────────────────────
          try {
            const _gateRes = await enforceNoRuleNoTreatment(decisionOutputForFormatting, {
              trace_id: traceId,
              tenant_id: finalTenantId ?? null,
              farmer_id: finalFarmerId ?? null,
              session_id: (orchestratorResponse as any)?.metadata?.session_id ?? null,
              crop_code: ((landContext as any)?.crop_code ?? (landContext as any)?.current_crop?.crop_code ?? null),
              language: detectedLanguage,
              intent: (orchestratorResponse as any)?.metadata?.intent_code ?? null,
              observations: {
                confirmed: (orchestratorResponse as any)?.metadata?.confirmed_observations ?? [],
              },
              observation_rule_hit: typeof observationRuleHit !== 'undefined' ? observationRuleHit : null,
            });
            console.log(
              `🛡️ [SymbolicInvariantGate] action=${_gateRes.gate_action} rules_fired=${_gateRes.rules_fired_count} emitted=${_gateRes.emitted_rule_id ?? 'none'} scrubbed=[${_gateRes.scrubbed_rule_ids.join(',')}]`,
            );
          } catch (e) {
            console.warn(`[SymbolicInvariantGate] non-fatal: ${(e as Error).message}`);
          }

          hydrateDecisionOutputRichText(decisionOutputForFormatting);

          // ── Load farmer profile + respectful addressing (presentation-only)
          let farmerAddressing: FarmerAddressing | undefined;
          try {
            const profile = await loadFarmerProfileLite(supabase, finalFarmerId, detectedLanguage);
            farmerAddressing = getFarmerAddressing({
              language: profile.language || detectedLanguage,
              state: profile.state,
              gender: profile.gender,
              farmer_name: profile.farmer_name,
            });
            console.log(`👤 [Addressing] ${farmerAddressing.primary} (${farmerAddressing.gender}/${profile.state || 'no-state'}) for lang=${detectedLanguage}`);
          } catch (e) {
            console.warn('[Addressing] load failed:', (e as Error).message);
          }

          const formatterInput: LLMFormatterInput = {
            farmer_message: userMessageContent,
            language: detectedLanguage,
            decision_output: decisionOutputForFormatting,
            land_context: landContext,
            data_audit: orchestratorResponse.dataAudit,
            trace_id: traceId,
            supabase_client: supabase,
            farmer_addressing: farmerAddressing,
          };

          // ═══════════════════════════════════════════════════════════════════
          // VARIETY INJECTION GATE (pre-LLM, deterministic)
          // Hard-asserts the resolved variety_profile on the land context
          // actually reaches the symbolic brain / LLM input. If it silently
          // dropped, we log a SYMBOLIC_CONTRACT_VIOLATION but do NOT block —
          // narration still proceeds; the post-LLM gate catches omission.
          // ═══════════════════════════════════════════════════════════════════
          const landVarietyProfile = (landContext as any)?.variety_profile || null;
          const preGate = assertVarietyInjected({
            land_context_variety_profile: landVarietyProfile,
            formatter_variety_profile: (formatterInput.land_context as any)?.variety_profile || null,
            decision_context_variety: (decisionOutputForFormatting as any)?.canonical_context?.variety || null,
          });
          if (!preGate.passed) {
            console.error(`🚫 [VARIETY-ASSERT/pre] SYMBOLIC_CONTRACT_VIOLATION trace=${traceId}`);
            for (const v of preGate.violations) console.error(`   - ${v}`);
          } else if (landVarietyProfile) {
            console.log(`🌱 [VARIETY-ASSERT/pre] variety SSOT injected: ${landVarietyProfile.name}`);
          }

          // Call LLM formatter with timeout protection
          const formatterPromise = formatRecommendationsWithLLM(formatterInput);
          const timeoutPromise = new Promise<LLMFormatterOutput>((_, reject) => {
            setTimeout(() => reject(new Error('LLM formatter timeout')), remainingTime - 2000);
          });
          
          llmFormatterOutput = await Promise.race([formatterPromise, timeoutPromise]);
          responseContent = llmFormatterOutput.formatted_response;
          aiModelUsed = llmFormatterOutput.ai_model_used;
          
          console.log(`   ✅ LLM formatting complete: ${llmFormatterOutput.source} (${llmFormatterOutput.processing_time_ms}ms)`);
          console.log(`   📊 Sections: ${llmFormatterOutput.sections_included.join(', ')}`);
          
          // ═══════════════════════════════════════════════════════════════════════════
          // SOURCE VALIDATION GATE - Final check before response delivery
          // Ensures LLM didn't add products/dosages not in symbolic output
          // ═══════════════════════════════════════════════════════════════════════════
          if (llmFormatterOutput.validation_passed === false) {
            console.error(`🚫 [SOURCE VALIDATION] LLM output validation failed!`);
            console.error(`   Violations: ${llmFormatterOutput.validation_violations?.join(', ')}`);
            
            // Use template fallback instead of potentially incorrect LLM output
            console.log(`   📋 Falling back to template-based response for safety`);
            
            if (orchestratorResponse.decision_output?.primary_decision) {
              responseContent = sanitizeFarmerResponse(await buildFormattedRecommendationsList(
                orchestratorResponse.decision_output, 
                detectedLanguage,
                supabase
              ));
            } else {
              responseContent = await getResponseContent(orchestratorResponse, detectedLanguage);
            }
          }

          // ═══════════════════════════════════════════════════════════════════════════
          // VARIETY HONOUR GATE (post-LLM, deterministic)
          // Blocks any response that omits the variety name when a variety
          // SSOT is attached, or that contradicts maturity windows /
          // resistance flags from variety_resistance. Falls back to the
          // template renderer (which the LLM-prompt build always seeds with
          // the variety block) so the farmer still gets the SSOT.
          // ═══════════════════════════════════════════════════════════════════════════
          if (landVarietyProfile) {
            const postGate = assertResponseHonorsVariety(responseContent, landVarietyProfile);
            if (!postGate.passed) {
              console.error(`🚫 [VARIETY-ASSERT/post] BLOCKED trace=${traceId} ` +
                `name_mentioned=${postGate.checked.name_mentioned} ` +
                `maturity=${postGate.checked.maturity_consistent} ` +
                `resistance=${postGate.checked.resistance_consistent}`);
              for (const v of postGate.violations) console.error(`   - ${v}`);

              // Deterministic remediation: render from symbolic SSOT directly.
              // buildFormattedRecommendationsList consumes decision_output and
              // (via the formatter contract) preserves variety facts verbatim.
              try {
                if (orchestratorResponse.decision_output?.primary_decision) {
                  const fallbackText = sanitizeFarmerResponse(await buildFormattedRecommendationsList(
                    orchestratorResponse.decision_output,
                    detectedLanguage,
                    supabase,
                  ));
                  const revalidate = assertResponseHonorsVariety(fallbackText, landVarietyProfile);
                  if (revalidate.passed) {
                    responseContent = fallbackText;
                    console.log(`   ✅ [VARIETY-ASSERT/post] template fallback honours variety SSOT`);
                  } else {
                    // Last-resort: append a deterministic variety footer so the
                    // SSOT is never silently dropped to the farmer.
                    const lbl = landVarietyProfile.label_mr || landVarietyProfile.label_hi || landVarietyProfile.name;
                    const code = landVarietyProfile.variety_code ? ` [${landVarietyProfile.variety_code}]` : '';
                    responseContent = `${fallbackText}\n\n— ${lbl}${code}`;
                    console.warn(`   ⚠️ [VARIETY-ASSERT/post] template still violated; appended variety footer`);
                  }
                }
              } catch (fallbackErr) {
                console.error(`   ❌ [VARIETY-ASSERT/post] fallback failed:`, (fallbackErr as Error).message);
              }
            } else {
              console.log(`   ✅ [VARIETY-ASSERT/post] response honours variety SSOT`);
            }
          }
        } // End of prescription gate allowed block
        
      } catch (formatterError) {
        console.error(`   ❌ LLM formatter failed:`, formatterError);
        // Fallback to template-based response
        console.log(`   📋 Falling back to template-based response`);
        
        // CRITICAL FIX: When LLM times out, build response directly from decision_output
        // instead of relying on potentially incomplete FarmerCommunication
        if (orchestratorResponse.decision_output?.primary_decision) {
          console.log(`   📋 Using buildFormattedRecommendationsList for complete response`);
          responseContent = sanitizeFarmerResponse(await buildFormattedRecommendationsList(
            orchestratorResponse.decision_output, 
            detectedLanguage,
            supabase
          ));
        } else {
          responseContent = await getResponseContent(orchestratorResponse, detectedLanguage);
        }
      }
      } // End of STAGE_FALLBACK else block
    } else {
      // Non-decision responses (clarification, photo request, etc.)
      responseContent = await getResponseContent(orchestratorResponse, detectedLanguage);
    }
    
    // Verify language consistency
    const responseHasTargetLanguage = verifyLanguageConsistency(responseContent, detectedLanguage);
    console.log(`   🌐 Language Check: input=${detectedLanguage}, response_matches=${responseHasTargetLanguage}`);
    
    if (!responseHasTargetLanguage && detectedLanguage !== 'en') {
      console.log(`   🔄 Response not in target language, applying translation`);
      responseContent = await forceTranslateResponse(responseContent, detectedLanguage);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 6 (POST-LLM): NARRATION BREACH VALIDATION
    // If the symbolic engine returned zero products but the LLM output contains
    // dosage patterns, strip the unauthorized content and log NARRATION_BREACH.
    // ═══════════════════════════════════════════════════════════════════════════
    const symbolicProducts = actions_returned?.filter((a: any) => a.product_name && a.product_name !== 'N/A') || [];
    if (symbolicProducts.length === 0 && responseContent) {
      const dosagePattern = /\d+\s*(ml|g|kg|l|gm|gram|liter|litre|मिली|ग्रॅम|किलो|लिटर)\b/gi;
      const dosageMatches = responseContent.match(dosagePattern);
      if (dosageMatches && dosageMatches.length > 0) {
        console.error(`🚨 [NARRATION_BREACH] LLM injected ${dosageMatches.length} dosage(s) without symbolic product authorization!`);
        console.error(`   Unauthorized dosages: ${dosageMatches.join(', ')}`);
        console.error(`   Symbolic products count: 0`);
        console.error(`   Action: Stripping unauthorized dosage content`);
        // Strip dosage patterns from response
        responseContent = responseContent.replace(dosagePattern, '[dosage removed]');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RCA #17 DEFENSIVE GUARD (2026-06-07): Universal "fake symptom" leak guard.
    // No farmer should ever see the literal token `{symptom}`, the literal word
    // `"symptom"`, or its force-translated quoted variants (e.g. `"लक्षण"`,
    // `"लक्षणा"`, `"लक्षण"`) when there were NO actual reported symptoms.
    // If any of these leak through (any code path: LLM template, safety-gate
    // clarification, fallback), replace with a stage-aware safe message built
    // from the canonical context we already have.
    // ═══════════════════════════════════════════════════════════════════════════
    if (responseContent) {
      const PLACEHOLDER_RE = /\{[a-zA-Z_]+\}|"\s*(symptom|लक्षण|लक्षणा|लक्षणे|लक्षण्|लक्षणं|लक्षणा)\s*"|'\s*symptom\s*'/i;
      if (PLACEHOLDER_RE.test(responseContent)) {
        console.error(`🚨 [LeakGuard] Fake-symptom / unfilled-placeholder leak detected — substituting safe stage-aware fallback`);
        console.error(`   Original (truncated): ${responseContent.slice(0, 160)}`);
        const ctxCrop =
          (orchestratorResponse as any)?.dataAudit?.land?.current_crop ||
          (orchestratorResponse as any)?.decision_output?.metadata?.lockedCropContext?.current_crop ||
          '';
        const ctxStage =
          (orchestratorResponse as any)?.dataAudit?.land?.growth_stage ||
          (orchestratorResponse as any)?.decision_output?.metadata?.lockedCropContext?.growth_stage ||
          '';
        const ctxDas =
          (orchestratorResponse as any)?.dataAudit?.land?.days_since_sowing ??
          (orchestratorResponse as any)?.decision_output?.metadata?.lockedCropContext?.days_since_sowing ??
          null;
        const dasText = ctxDas !== null ? ` (${ctxDas} DAS)` : '';
        if (detectedLanguage === 'mr') {
          responseContent = ctxCrop
            ? `तुमचे ${ctxCrop} पीक सध्या ${ctxStage || 'सध्याच्या'} अवस्थेत${dasText} आहे. सध्या स्पष्ट कीड/रोगाची लक्षणे नोंदवलेली नाहीत. कृपया कोणत्या भागावर (पाने/खोड/मूळ) काही दिसत असेल तर सांगा, किंवा फोटो पाठवा — म्हणजे योग्य सल्ला देता येईल.`
            : `कृपया तुम्हाला पिकात नक्की काय दिसत आहे ते सांगा (पाने, खोड, मूळ) किंवा एक स्पष्ट फोटो पाठवा.`;
        } else if (detectedLanguage === 'hi') {
          responseContent = ctxCrop
            ? `आपकी ${ctxCrop} फसल अभी ${ctxStage || 'मौजूदा'} अवस्था${dasText} में है। अभी कोई स्पष्ट कीट/रोग लक्षण दर्ज नहीं हैं। कृपया बताएं कि पौधे के किस भाग (पत्ते/तना/जड़) पर कुछ दिख रहा है, या एक साफ फोटो भेजें।`
            : `कृपया बताएं कि फसल में आपको क्या दिख रहा है (पत्ते/तना/जड़) या एक साफ फोटो भेजें।`;
        } else {
          responseContent = ctxCrop
            ? `Your ${ctxCrop} crop is currently at ${ctxStage || 'its current'} stage${dasText}. No clear pest/disease symptoms have been reported yet. Please tell me which part (leaves/stem/root) shows something, or share a clear photo for an accurate recommendation.`
            : `Please tell me what exactly you are seeing on the crop (leaves/stem/root) or share a clear photo.`;
        }
        aiModelUsed = aiModelUsed || 'leak-guard-stage-aware';
      }
    }


    
    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION GATE: Prevent silent failures before saving response
    // CRITICAL FIX: SKIP validation for non-decision response types
    // Clarification and photo requests should NOT be validated as treatment outputs
    // ═══════════════════════════════════════════════════════════════════════════
    const decision_brain_source = true;
    
    // Determine if this is a decision response that requires validation
    const isClarificationOrPhotoResponse = [
      'CLARIFICATION_QUESTION', 
      'PHOTO_REQUEST', 
      'CLARIFICATION_NEEDED',
      'NEEDS_CLARIFICATION'
    ].includes(orchestratorResponse.type);
    
    const isDecisionResponse = orchestratorResponse.type === 'DECISION_PROVIDED';
    
    let validationResult = { passed: true, errors: [] as string[] };
    
    if (isDecisionResponse && !isClarificationOrPhotoResponse) {
      // Only validate actual decision/treatment responses
      validationResult = validateResponseBeforeSave({
        decision_brain_source,
        actions_returned,
        responseContent,
        orchestratorResponse,
        traceId,
        language: detectedLanguage
      });
    } else if (isClarificationOrPhotoResponse) {
      // CRITICAL FIX: Skip validation for clarification/photo responses
      // These responses don't have actions and shouldn't be validated as treatment outputs
      console.log(`🔐 [${traceId}] VALIDATION SKIPPED: Response type is ${orchestratorResponse.type}`);
      console.log(`   Clarification responses don't require treatment validation`);
    }
    
    console.log(`🔐 [${traceId}] ═══ RESPONSE VALIDATION GATE ═══`);
    console.log(`   Decision Brain Source: ${decision_brain_source}`);
    console.log(`   Response Type: ${orchestratorResponse.type}`);
    console.log(`   Is Clarification/Photo: ${isClarificationOrPhotoResponse}`);
    console.log(`   Actions Returned Count: ${actions_returned?.length || 0}`);
    console.log(`   Response Content Length: ${responseContent?.length || 0}`);
    console.log(`   LLM Model Used: ${aiModelUsed || 'template'}`);
    console.log(`   Validation Passed: ${validationResult.passed}`);
    
    if (!validationResult.passed) {
      console.error(`❌ [${traceId}] VALIDATION FAILED:`, validationResult.errors);
      console.error(`   Full Context Dump:`, JSON.stringify({
        orchestrator_type: orchestratorResponse.type,
        decision_output_keys: Object.keys(orchestratorResponse.decision_output || {}),
        actions_returned: actions_returned,
        actions_filtered_out: actions_filtered_out,
        response_content_preview: responseContent?.substring(0, 200),
        llm_formatter_used: !!llmFormatterOutput,
        metadata: orchestratorResponse.metadata
      }, null, 2));
      
      // Generate fallback response if validation fails
      // CRITICAL FIX: Pass actions_returned so we can use them in fallback
      responseContent = generateValidationFailureFallback(
        detectedLanguage,
        validationResult.errors,
        orchestratorResponse,
        actions_returned  // Pass actions so fallback can use them
      );
    }
    
    // Store user message with preprocessed_content (English normalized)
    // Persist + capture {id, created_at} so the client can replace its
    // optimistic LocalDB rows with server-authoritative ones (fixes
    // chat-reopen sequence drift caused by client-side timestamps).
    let persistedUserMessage: { id: string; created_at: string; role: 'user' } | null = null;
    let persistedAssistantMessage: { id: string; created_at: string; role: 'assistant' } | null = null;
    let messageStorageStatus: 'ok' | 'partial' | 'failed' = 'ok';
    try {
      const { data: userRow, error: userErr } = await supabase
        .from('ai_chat_messages')
        .insert({
          session_id: currentSessionId,
          tenant_id: finalTenantId,
          farmer_id: finalFarmerId,
          role: 'user',
          content: userMessageContent,
          preprocessed_content: preprocessedContent,
          language: detectedLanguage,
          message_type: imageUrl ? 'image_analysis' : 'text',
          image_urls: imageUrl ? [imageUrl] : null,
          is_training_candidate: true,
          inferred_intent: orchestratorResponse.metadata?.agents_used?.includes('NLU') ? 'PROCESSED' : null,
          conversation_turn_number: messages.length,
          metadata: {
            source: 'orchestrator_v1',
            has_image: !!imageUrl,
            land_id: landId,
            language_detected: detectedLanguage,
            preprocessed: true
          }
        })
        .select('id, created_at')
        .single();
      if (userErr) {
        messageStorageStatus = 'failed';
        console.warn(`⚠️ [Storage] user-row insert failed: ${userErr.message}`);
      } else if (userRow) {
        persistedUserMessage = { id: userRow.id, created_at: userRow.created_at, role: 'user' };
      }

      // Store assistant response with language-appropriate content
      const tokensUsed = llmFormatterOutput?.tokens_used || null;

      // Task 7: classify response_source for symbolic-vs-LLM dashboards.
      const _oType = String(orchestratorResponse.type || '').toUpperCase();
      const _meta: any = orchestratorResponse.metadata || {};
      const _rulesFired = Array.isArray(_meta.rules_applied) ? _meta.rules_applied.length : 0;
      const _sourceTag = String(_meta.source || '').toLowerCase();
      const _confirmedObs: string[] = Array.isArray(_meta.confirmed_observation_codes)
        ? _meta.confirmed_observation_codes
        : Array.isArray(_meta.observations)
          ? _meta.observations
          : [];
      const responseSource: string = (() => {
        if (_sourceTag === 'symbolic_empty_fallback') return 'symbolic_empty_fallback';
        if (_oType.includes('CLARIFICATION')) return 'symbolic_clarification';
        if (_rulesFired > 0) return llmFormatterOutput ? 'llm_translation_only' : 'symbolic_rule_fired';
        // Task 3: symbolic produced ZERO rules even though the farmer confirmed
        // observations → reclassify as symbolic_empty_fallback and audit-log.
        if (_confirmedObs.length > 0) {
          (async () => {
            try {
              await supabase.from('ai_chat_audit_logs').insert({
                tenant_id: finalTenantId,
                farmer_id: finalFarmerId,
                session_id: currentSessionId,
                event_type: 'symbolic_empty_after_confirmed_observations',
                event_data: {
                  trace_id: traceId,
                  intent_code: _meta.intent_code ?? null,
                  crop_code: _meta.crop_code ?? null,
                  growth_stage: _meta.growth_stage ?? null,
                  das: _meta.das ?? null,
                  confirmed_observation_codes: _confirmedObs,
                  candidate_rule_ids: _meta.candidate_rule_ids ?? null,
                  orchestrator_type: orchestratorResponse.type,
                },
              });
            } catch (_e) { /* non-fatal */ }
          })();
          return 'symbolic_empty_fallback';
        }
        return 'llm_general_knowledge';
      })();

      // WAVE F: Clarification-origin classifier.
      // Wave E telemetry showed 42/47 silent matches (89%) were
      // CLARIFICATION_QUESTION — rules matched but the orchestrator forced a
      // clarification instead of returning the decision. Bucketing by
      // *whether rules matched before clarification was forced* tells us
      // whether to fix the pre-rule clarifier (no symptoms yet) or the
      // post-match clarifier (matched rules suppressed = real defect).
      //
      // Buckets:
      //   post_match_clarification  : rules fired AND confidence ≥ threshold
      //                               yet clarification was forced → WS13 bug
      //   post_match_low_confidence : rules fired but confidence < threshold
      //                               (expected; not a defect)
      //   hypothesis_differential   : multiple equally-likely hypotheses
      //   pre_rule_clarification    : no rules fired (legitimate symptom
      //                               collection)
      //   emergency_triage          : emergency observation path
      //   non_clarification         : not a clarification response
      const clarificationOrigin: string = (() => {
        if (!_oType.includes('CLARIFICATION')) return 'non_clarification';
        const meta: any = _meta;
        const isEmergency =
          String(meta.escalation_reason || '').toLowerCase().includes('emergency') ||
          String(meta.diagnostic_escalation_data?.escalation_type || '').toLowerCase().includes('emergency');
        if (isEmergency) return 'emergency_triage';
        const isDifferential =
          meta.differential_diagnosis === true ||
          (Array.isArray(meta.competing_hypotheses) && meta.competing_hypotheses.length > 1) ||
          String(meta.clarification_strategy || '').toLowerCase().includes('differential');
        if (isDifferential) return 'hypothesis_differential';
        if (_rulesFired > 0) {
          const conf = Number(meta.confidence ?? 0);
          const threshold = Number(meta.confidence_threshold ?? 0.5);
          return conf < threshold ? 'post_match_low_confidence' : 'post_match_clarification';
        }
        // WAVE J: distinguish pre_brain (rules matched, brain never assembled
        // primary_decision) from pre_rule (no rules ever matched). The Wave I
        // attribution view uses this bucket to surface the orchestrator paths
        // that strand matched rules. Without this split, both fall under
        // pre_rule_clarification and the real defect (matched-but-clarified)
        // stays invisible.
        if (_rulesFired > 0) return 'pre_brain_clarification';
        return 'pre_rule_clarification';
      })();

      // WAVE J: structured warning so log scans can surface the exact emission
      // site of every pre_brain_clarification turn (paired with metadata.
      // clarification_site set at the emission). The Wave I dashboard is
      // queryable post-hoc; this is the real-time signal.
      if (clarificationOrigin === 'pre_brain_clarification') {
        console.warn(
          `[WAVE_J_PRE_BRAIN_CLARIFICATION] site=${(orchestratorResponse as any).metadata?.clarification_site ?? 'unknown'} rules_fired=${_rulesFired} agents=${JSON.stringify((orchestratorResponse as any).metadata?.agents_used ?? [])}`
        );
      }

      const { data: assistantRow, error: assistantErr } = await supabase
        .from('ai_chat_messages')
        .insert({
          session_id: currentSessionId,
          tenant_id: finalTenantId,
          farmer_id: finalFarmerId,
          role: 'assistant',
          content: responseContent,
          language: detectedLanguage,
          message_type: 'orchestrator',
          response_time_ms: responseTime,
          decision_brain_source: true,
          ai_model: aiModelUsed || 'template',
          tokens_used: tokensUsed,
          is_training_candidate: true,
          conversation_turn_number: messages.length + 1,
          actions_returned: actions_returned,
          actions_filtered_out: actions_filtered_out,
          response_source: responseSource,
          metadata: {
            orchestrator_type: orchestratorResponse.type,
            confidence: orchestratorResponse.metadata?.confidence,
            safety_status: orchestratorResponse.metadata?.safety_status,
            rules_applied: orchestratorResponse.metadata?.rules_applied,
            agents_used: orchestratorResponse.metadata?.agents_used,
            decision_id: orchestratorResponse.decision_id,
            trace_id: traceId,
            actions_returned_count: actions_returned?.length || 0,
            actions_filtered_count: actions_filtered_out?.length || 0,
            all_actions_filtered: allActionsFiltered,
            filter_categories: audit_log.filter_categories,
            llm_formatter_used: !!llmFormatterOutput,
            llm_formatter_source: llmFormatterOutput?.source,
            llm_formatter_time_ms: llmFormatterOutput?.processing_time_ms,
            tokens_used: tokensUsed,
            response_validation_passed: validationResult.passed,
            validation_errors: validationResult.passed ? undefined : validationResult.errors,
            language_pipeline: {
              input_language: detectedLanguage,
              output_language: detectedLanguage,
              translation_applied: !responseHasTargetLanguage
            },
            clarification_options: (orchestratorResponse.type === 'CLARIFICATION_QUESTION' || orchestratorResponse.type === 'CLARIFICATION_NEEDED')
              ? {
                  question: responseContent,
                  options: orchestratorResponse.question?.options || [],
                  selectionType: orchestratorResponse.metadata?.selectionType || 'SINGLE_CHOICE'
                }
              : undefined,
            // WAVE E: top-level attribution columns so SQL aggregation is trivial
            // (no need to traverse decision_brain_data->funnel->largest_drop). These
            // mirror values already present in nested brain data — adding them at
            // the top level unblocks `GROUP BY crop_context, drop_stage` queries
            // that the WS13 audit needs to localize the 73% match→decision drop.
            crop_context: (
              _meta?.crop_code
              ?? orchestratorResponse.dataAudit?.land?.current_crop
              ?? orchestratorResponse.decision_output?.input_context?.crop?.code
              ?? orchestratorResponse.decision_output?.input_context?.crop?.name
              ?? null
            ),
            growth_stage: _meta?.growth_stage ?? orchestratorResponse.dataAudit?.land?.growth_stage ?? null,
            intent_code: _meta?.intent_code ?? null,
            response_source: responseSource,
            funnel_largest_drop: (orchestratorResponse as any).metadata?.funnel?.largest_drop?.stage ?? null,
            funnel_largest_drop_count: (orchestratorResponse as any).metadata?.funnel?.largest_drop?.lost ?? null,
            clarification_origin: clarificationOrigin,
            // WAVE J: per-emission-site identifier so dashboards can attribute
            // the surviving pre_brain_clarification drops to the precise code
            // path that produced them. Set inside metadata at every CLARIFICATION
            // return site by `CLARIFICATION_SITES`.
            clarification_site: (orchestratorResponse as any).metadata?.clarification_site ?? null,
            // WAVE K: disposition (INTENTIONAL_DIFFERENTIAL / INTENTIONAL_FOLLOWUP /
            // INTENTIONAL_GATE / DEFECT_SUSPECT) so the attribution view can
            // separate by-design clarifications from real defects. Resolved from
            // SITE_DISPOSITIONS in utils/clarification-site-tag.ts so the SQL
            // view and runtime stay in sync from a single source of truth.
            clarification_site_disposition: getSiteDisposition(
              (orchestratorResponse as any).metadata?.clarification_site ?? null
            ),
            // WAVE D: ALWAYS persist decision_brain_data regardless of response type.
            // Previously this was gated to type === 'DECISION_PROVIDED', which silently
            // dropped brain state for 73% (47/64) of matched turns — making the
            // match→decision attribution impossible. Now every turn carries the
            // brain snapshot (primary if available, plus gate/clarification/funnel
            // attribution so drop points are queryable post-hoc).
            decision_brain_data: {
              response_type: orchestratorResponse.type,
              primary_decision: orchestratorResponse.decision_output?.primary_decision ?? null,
              secondary_decisions: orchestratorResponse.decision_output?.secondary_decisions ?? null,
              blocked_actions: orchestratorResponse.decision_output?.blocked_actions ?? null,
              land_context: orchestratorResponse.dataAudit?.land ?? null,
              confidence: orchestratorResponse.metadata?.confidence ?? null,
              risk_level: orchestratorResponse.decision_output?.risk_level ?? null,
              // Drop-point attribution surface (Wave C/D)
              gate_decision: (orchestratorResponse as any).metadata?.gate_decision ?? null,
              clarification: (orchestratorResponse as any).metadata?.clarification ?? null,
              funnel: (orchestratorResponse as any).metadata?.funnel ?? null,
              rule_source_diff: (orchestratorResponse as any).metadata?.rule_source_diff ?? null,
              dropped_reason: (orchestratorResponse as any).metadata?.dropped_reason ?? null
            },
            diagnostic_escalation_data: orchestratorResponse.metadata?.diagnostic_escalation_data || undefined
          }
        })
        .select('id, created_at')
        .single();
      if (assistantErr) {
        messageStorageStatus = messageStorageStatus === 'failed' ? 'failed' : 'partial';
        console.warn(`⚠️ [Storage] assistant-row insert failed: ${assistantErr.message}`);
      } else if (assistantRow) {
        persistedAssistantMessage = { id: assistantRow.id, created_at: assistantRow.created_at, role: 'assistant' };
      }

      console.log(`💾 [Storage] Messages saved status=${messageStorageStatus} user=${!!persistedUserMessage} assistant=${!!persistedAssistantMessage}`);
    } catch (storageError) {
      messageStorageStatus = 'failed';
      console.warn('⚠️ [Storage] Failed to save messages:', storageError);
      // Continue - don't fail the request for storage issues
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSFORM ORCHESTRATOR RESPONSE TO LEGACY FORMAT
    // CRITICAL FIX: Use responseContent (from LLM formatter) instead of re-generating
    // This ensures what we save to DB is EXACTLY what we return to user
    // ═══════════════════════════════════════════════════════════════════════════
    const responsePayload = transformOrchestratorResponseWithContent(
      orchestratorResponse,
      responseContent, // ← CRITICAL: Use the LLM-formatted content we already generated
      detectedLanguage,
      currentSessionId,
      startTime,
      actions_returned,
      traceId,
      aiModelUsed
    );

    // Bug 2 fix: surface persisted-row identifiers so the client can replace
    // its optimistic LocalDB records (and avoid clock-skew sequence drift on
    // chat reopen). storage_status is explicit so the UI can mark the turn
    // as 'failed' when the DB write didn't actually land.
    (responsePayload as any).persisted_messages = {
      user: persistedUserMessage,
      assistant: persistedAssistantMessage,
      session_id: currentSessionId,
      storage_status: messageStorageStatus,
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION-LEVEL DECISION TRACKING
    // Updates session metadata after every decision brain execution
    // ═══════════════════════════════════════════════════════════════════════════
    const recommendationsProvided = orchestratorResponse.type === 'DECISION_PROVIDED' && 
      (actions_returned && actions_returned.length > 0);
    
    // Extract target info from primary action for session tracking
    // CRITICAL FIX: Search multiple possible locations for pest/crop data
    const primaryAction = actions_returned?.find(a => a.type === 'primary');
    const decisionOutput = orchestratorResponse.decision_output;
    
    // CRITICAL FIX: Extract pest from multiple sources (not just action.target which may not exist)
    // Safely handle rules_applied which may be an object, array, or undefined
    const rulesAppliedArray = Array.isArray(orchestratorResponse.metadata?.rules_applied) 
      ? orchestratorResponse.metadata.rules_applied 
      : [];
    
    const lastPest = 
      primaryAction?.target?.pest_code ||
      primaryAction?.pest_code ||
      decisionOutput?.primary_decision?.target?.pest ||
      decisionOutput?.input_context?.pest?.code ||
      rulesAppliedArray.find((r: string) => r.includes('PEST'))?.split('_')[1] ||
      null;
    
    // CRITICAL FIX: Extract disease from multiple sources
    const lastDisease = 
      primaryAction?.target?.disease_code ||
      primaryAction?.disease_code ||
      decisionOutput?.primary_decision?.target?.disease ||
      decisionOutput?.input_context?.disease?.code ||
      null;
    
    // CRITICAL FIX: Extract crop from multiple sources
    const lastCrop = 
      decisionOutput?.input_context?.crop?.name ||
      decisionOutput?.input_context?.crop?.code ||
      decisionOutput?.primary_decision?.crop_name ||
      primaryAction?.crop_code ||
      orchestratorResponse.dataAudit?.land?.current_crop ||
      null;
    
    // Build decision tracking state
    // CRITICAL FIX 1: Store pending clarification options for next turn's option selection
    const isClarificationResponse = orchestratorResponse.type === 'CLARIFICATION_QUESTION' || 
                                    orchestratorResponse.type === 'CLARIFICATION_NEEDED';
    // P0 FIX (system-audit 2026-06-22): Preserve canonical observation_code on each
    // pending option so the next-turn option-selected path can map the farmer's
    // selection back to a real symbolic code. Previously we persisted o.label only,
    // which dropped the per-option observation_code — on multilingual labels
    // (Marathi/Hindi/Tamil) the label-keyword fallback in mapOptionToObservation()
    // returned null/default, no observation reached the rule engine, 0 rules fired,
    // and the response collapsed to DIAGNOSTIC_ESCALATION → no_action_needed.
    // Format: "<label> [obs_keys:<CANONICAL_CODE>]" — matchFarmerResponseToOption
    // and the orchestrator already parse [obs_keys:...] from pending options.
    const clarificationOptions = orchestratorResponse.question?.options?.map((o: any) => {
      const label = String(o?.label ?? '').trim();
      const code = (o?.observation_code || o?.observation_key || '').toString().trim();
      // Don't double-embed if label already carries [obs_keys:...]
      if (!label) return label;
      if (/\[obs_keys:[^\]]+\]/i.test(label)) return label;
      return code ? `${label} [obs_keys:${code}]` : label;
    }) || orchestratorResponse.metadata?.pendingClarificationOptions || [];
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: SESSION STATE TRANSITION FROM ORCHESTRATOR
    // If orchestrator returns session_state_update, use it AUTHORITATIVELY
    // This prevents infinite clarification loops
    // ═══════════════════════════════════════════════════════════════════════════
    const sessionStateUpdateFromOrchestrator = orchestratorResponse.session_state_update ||
      orchestratorResponse.metadata?.session_state_update ||
      orchestratorResponse.decision_output?.metadata?.session_state_update;
    
    const clarificationAnswered = sessionStateUpdateFromOrchestrator?.clarification_answered === true ||
      orchestratorResponse.decision_output?.metadata?.clarification_resolved === true;
    
    // P0-3 FIX: Extract lockedCropContext for session persistence
    const lockedCropContextForSession = 
      orchestratorResponse.decision_output?.metadata?.lockedCropContext ||
      orchestratorResponse.metadata?.lockedCropContext ||
      (orchestratorResponse.dataAudit?.land?.found ? {
        crop_name: orchestratorResponse.dataAudit.land.current_crop,
        growth_stage: orchestratorResponse.dataAudit.land.growth_stage,
        days_since_sowing: orchestratorResponse.dataAudit.land.days_since_sowing
      } : null);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // DECISION STATE DETERMINATION - Session state is AUTHORITATIVE
    // Priority: session_state_update from orchestrator > isClarificationResponse > recommendationsProvided
    // ═══════════════════════════════════════════════════════════════════════════
    let computedDecisionState: string;
    
    if (sessionStateUpdateFromOrchestrator?.decision_state) {
      // AUTHORITATIVE: Orchestrator explicitly set decision state
      computedDecisionState = sessionStateUpdateFromOrchestrator.decision_state;
      console.log(`🔄 [Session] Decision state from ORCHESTRATOR: ${computedDecisionState}`);
    } else if (clarificationAnswered) {
      // Clarification was answered but no explicit state update
      computedDecisionState = recommendationsProvided ? 'recommendations_given' : 'decision_in_progress';
      console.log(`🔄 [Session] Clarification answered, state: ${computedDecisionState}`);
    } else if (recommendationsProvided) {
      computedDecisionState = 'recommendations_given';
    } else if (isClarificationResponse) {
      computedDecisionState = 'awaiting_clarification';
    } else {
      // ─────────────────────────────────────────────────────────────────────
      // SUPPRESSOR-5 FIX (2026-06-19): the bare catch-all used to emit
      // `no_action_needed` whenever orchestrator returned `DECISION_PROVIDED`
      // with zero actions. For a symptom-bearing query that left the farmer
      // staring at a generic 277-char template every turn.
      //
      // If the brain produced no actions but the request clearly carried
      // symptom evidence (intent flagged as symptomatic, or observation/
      // induction set non-empty), surface `awaiting_clarification` so the
      // session loop will ask one targeted clarifying question instead of
      // closing the turn as resolved.
      // ─────────────────────────────────────────────────────────────────────
      const orchestratorMeta = orchestratorResponse?.metadata || {};
      const decisionMeta = orchestratorResponse?.decision_output?.metadata || {};
      const symptomEvidence = Boolean(
        orchestratorMeta.symptom_evidence_present ||
        decisionMeta.symptom_evidence_present ||
        orchestratorMeta.induction_symptom_count > 0 ||
        decisionMeta.induction_symptom_count > 0 ||
        (Array.isArray(orchestratorMeta.observation_codes) && orchestratorMeta.observation_codes.length > 0) ||
        (Array.isArray(decisionMeta.observation_codes) && decisionMeta.observation_codes.length > 0)
      );
      if (orchestratorResponse?.type === 'DECISION_PROVIDED' && (!actions_returned || actions_returned.length === 0) && symptomEvidence) {
        computedDecisionState = 'awaiting_clarification';
        console.warn(`⚠️ [Session] DECISION_PROVIDED with 0 actions + symptom evidence → forcing 'awaiting_clarification' (was 'no_action_needed')`);
      } else {
        computedDecisionState = 'no_action_needed';
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT CHECK: Clarification answered but still awaiting_clarification = BUG
    // ═══════════════════════════════════════════════════════════════════════════
    if (clarificationAnswered && computedDecisionState === 'awaiting_clarification') {
      console.error(`🚨 [INVARIANT VIOLATION] Clarification answered but decision_state is still awaiting_clarification!`);
      console.error(`   Forcing transition to 'decision_in_progress'`);
      computedDecisionState = 'decision_in_progress';
    }
    
    // MANDATORY LOGGING: Decision state tracking
    console.log(`\n📊 [Session] ═══ DECISION STATE TRACKING ═══`);
    console.log(`   session_decision_state: ${computedDecisionState}`);
    console.log(`   clarification_active: ${isClarificationResponse && !clarificationAnswered}`);
    console.log(`   option_selected: ${clarificationAnswered}`);
    console.log(`   unified_gate_mode: ${computedDecisionState === 'awaiting_clarification' ? 'BLOCKED (awaiting)' : 'ALLOW'}`);
    console.log(`   ═══════════════════════════════════════════`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PART 10: SESSION CONTINUITY — Update problems_discussed list
    // ═══════════════════════════════════════════════════════════════════════════
    const currentProblems = sessionState?.problems_discussed || [];
    const currentTurn = (sessionState?.turn_count || 0) + 1;
    const now = new Date().toISOString();
    
    // Extract current problem code from orchestrator response
    const currentIntentCode = orchestratorResponse.metadata?.intent_code || 
                              orchestratorResponse.decision_output?.metadata?.intent_code || '';
    const currentDiagnosis = lastPest || lastDisease || 
                              orchestratorResponse.decision_output?.primary_decision?.target?.pest_code ||
                              orchestratorResponse.decision_output?.primary_decision?.target?.disease_code || '';
    
    // Build simple query hash for repeat detection (normalize: lowercase, remove spaces/punctuation)
    const queryHash = userMessageContent.toLowerCase()
      .replace(/[^\u0900-\u097F\u0A00-\u0A7Fa-z0-9]/g, '')
      .substring(0, 100);
    
    // REPEAT CONCERN DETECTION: Same semantic query within 30 minutes
    const lastQueryHash = sessionState?.last_query_hash || '';
    const lastQueryTs = sessionState?.last_query_timestamp;
    let isRepeatConcern = false;
    
    if (lastQueryHash && queryHash) {
      // Check similarity: exact match or >70% overlap
      const overlap = queryHash.length > 0 && lastQueryHash.length > 0 
        ? [...queryHash].filter((c, i) => lastQueryHash[i] === c).length / Math.max(queryHash.length, lastQueryHash.length)
        : 0;
      const withinTimeWindow = lastQueryTs 
        ? (Date.now() - new Date(lastQueryTs).getTime()) < 30 * 60 * 1000 
        : false;
      isRepeatConcern = overlap > 0.7 && withinTimeWindow;
      
      if (isRepeatConcern) {
        console.log(`\n🔄 [SESSION_CONTINUITY] REPEAT CONCERN detected!`);
        console.log(`   Query similarity: ${(overlap * 100).toFixed(0)}%`);
        console.log(`   Time since last: ${lastQueryTs ? Math.round((Date.now() - new Date(lastQueryTs).getTime()) / 60000) : 'N/A'} min`);
        console.log(`   → Escalating to more specific response`);
      }
    }
    
    // CAUSAL CHAINING: Check if current issue might be consequence of previous diagnosis
    // e.g., poor growth after stem holes → likely consequence of Shoot Borer
    const previousBorerDiagnosis = currentProblems.find(p => 
      p.diagnosis && (p.diagnosis.includes('BORER') || p.diagnosis.includes('SHOOT') || p.diagnosis.includes('STEM'))
    );
    const isGrowthIssue = currentIntentCode === 'GROWTH_ANOMALY' || 
                           currentIntentCode === 'INPUT_RECOMMENDATION' ||
                           queryHash.includes('वाढ') || queryHash.includes('फुट');
    
    if (previousBorerDiagnosis && isGrowthIssue) {
      console.log(`\n🔗 [SESSION_CONTINUITY] CAUSAL CHAIN detected!`);
      console.log(`   Previous: ${previousBorerDiagnosis.diagnosis} (turn ${previousBorerDiagnosis.turn_number})`);
      console.log(`   Current: ${currentIntentCode} — may be consequence of borer damage`);
    }
    
    // Add current problem to the list (keep last 10)
    const updatedProblems = [
      ...currentProblems,
      ...(currentIntentCode || currentDiagnosis ? [{
        problem_code: currentIntentCode || 'GENERAL',
        turn_number: currentTurn,
        timestamp: now,
        diagnosis: currentDiagnosis || undefined,
        intent_code: currentIntentCode || undefined
      }] : [])
    ].slice(-10); // Keep last 10 problems
    
    const decisionTracking = {
      decision_state: computedDecisionState,
      last_pest: lastPest,
      last_disease: lastDisease,
      last_crop: lastCrop,
      pending_user_action: recommendationsProvided, // User should act on recommendations
      turn_count: currentTurn,
      recommendations_count: actions_returned?.length || 0,
      last_action_types: actions_returned?.map((a: any) => a.action_type || a.action).slice(0, 3) || [],
      timestamp: now,
      // CRITICAL FIX: Clear pending options when clarification is answered
      pending_clarification_options: (isClarificationResponse && !clarificationAnswered) ? clarificationOptions : [],
      // P0-3 FIX: Persist lockedCropContext for multi-turn context continuity
      lockedCropContext: lockedCropContextForSession,
      // Track clarification resolution
      clarification_answered: clarificationAnswered,
      clarification_resolved_at: sessionStateUpdateFromOrchestrator?.clarification_resolved_at,
      // PART 10: Session continuity data
      problems_discussed: updatedProblems,
      last_query_hash: queryHash,
      last_query_timestamp: now,
      is_repeat_concern: isRepeatConcern,
      causal_chain_detected: !!(previousBorerDiagnosis && isGrowthIssue)
    };
    
    try {
      // Task 6: derive next ConversationContext from this turn's outcome.
      const _meta2: any = orchestratorResponse.metadata || {};
      const _isClarification = String(orchestratorResponse.type || '').toUpperCase().includes('CLARIFICATION');
      const _rulesFiredNow = Array.isArray(_meta2.rules_applied) ? _meta2.rules_applied.length : 0;
      const _newConfirmed: string[] = Array.isArray(_meta2.confirmed_observation_codes)
        ? _meta2.confirmed_observation_codes
        : Array.isArray(_meta2.observations) ? _meta2.observations : [];
      const _newRuledOut: string[] = Array.isArray(_meta2.ruled_out_observation_codes)
        ? _meta2.ruled_out_observation_codes : [];
      const _candidates: string[] = Array.isArray(_meta2.candidate_rule_ids) ? _meta2.candidate_rule_ids : [];

      const mergedConfirmed = Array.from(new Set([...conversationContext.confirmed_observations, ..._newConfirmed]));
      const mergedRuledOut  = Array.from(new Set([...conversationContext.ruled_out_observations,  ..._newRuledOut]));

      const nextConversationContext: ConversationContext = (() => {
        // Terminal outcomes clear the context.
        if (_rulesFiredNow > 0 || (!_isClarification && conversationContext.intent_code === null && _newConfirmed.length === 0)) {
          return {
            intent_code: null,
            confirmed_observations: [],
            ruled_out_observations: [],
            active_rule_candidates: [],
            round_counter: 0,
            max_rounds: conversationContext.max_rounds,
            last_updated: new Date().toISOString(),
          };
        }
        // Clarification turn → advance round counter & merge observations.
        return {
          intent_code: _meta2.intent_code ?? conversationContext.intent_code ?? null,
          confirmed_observations: mergedConfirmed,
          ruled_out_observations: mergedRuledOut,
          active_rule_candidates: _candidates.length > 0 ? _candidates : conversationContext.active_rule_candidates,
          round_counter: _isClarification ? conversationContext.round_counter + 1 : conversationContext.round_counter,
          max_rounds: conversationContext.max_rounds,
          last_updated: new Date().toISOString(),
        };
      })();

      // CRITICAL: Include tenant_id and farmer_id in update filter for security isolation
      await supabase
        .from('ai_chat_sessions')
        .update({ 
          updated_at: new Date().toISOString(),
          conversation_state: nextConversationContext as unknown as Record<string, unknown>,
          metadata: {
            language,
            source: 'orchestrator_v1',
            last_response_type: orchestratorResponse.type,
            agents_used: orchestratorResponse.metadata?.agents_used,
            confidence: orchestratorResponse.metadata?.confidence,
            rules_applied: orchestratorResponse.metadata?.rules_applied,
            decision_id: orchestratorResponse.decision_id,
            recommendations_provided: recommendationsProvided,
            recommendations_count: actions_returned?.length || 0,
            // CRITICAL: Decision tracking for session memory
            decision_tracking: decisionTracking,
            // Legacy nested conversation_state (kept for back-compat with dashboards)
            conversation_state: {
              turn_count: decisionTracking.turn_count,
              has_photo: !!imageUrl,
              last_intent: orchestratorResponse.type,
              safety_status: orchestratorResponse.metadata?.safety_status,
              has_recommendations: recommendationsProvided
            }
          }
        })
        .eq('id', currentSessionId)
        .eq('tenant_id', finalTenantId)  // CRITICAL: Tenant isolation
        .eq('farmer_id', finalFarmerId); // CRITICAL: Farmer isolation

      console.log(`📤 [ConversationContext] Persisted: intent=${nextConversationContext.intent_code} confirmed=${nextConversationContext.confirmed_observations.length} round=${nextConversationContext.round_counter}/${nextConversationContext.max_rounds}`);
      
      console.log(`💾 [Session] Decision tracking persisted:`, {
        state: decisionTracking.decision_state,
        pest: decisionTracking.last_pest,
        crop: decisionTracking.last_crop,
        pending: decisionTracking.pending_user_action,
        turn: decisionTracking.turn_count
      });
    } catch (sessionUpdateError) {
      console.warn('⚠️ [Session] Failed to update session:', sessionUpdateError);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WAVE A.5 / PHASE 2 — CLARIFICATION INVARIANT (final, defence-in-depth)
    // If clarification_required is true anywhere in the payload, STRIP every
    // treatment-carrying field. This is the production-bug fix for the
    // reported emergence-failure flow where DiagnosisOnlyMode was bypassing
    // clarification.
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const invariantResult = enforceClarificationInvariant(
        responsePayload as Record<string, any>,
        { trace_id: traceId, source: 'index.ts:final-response' }
      );
      if (invariantResult.invariant_violated) {
        (responsePayload as any).metadata = (responsePayload as any).metadata || {};
        (responsePayload as any).metadata.clarification_invariant = {
          violated: true,
          fields_stripped: invariantResult.fields_stripped,
        };
      }
    } catch (invErr) {
      console.warn('[ClarificationInvariant] gate threw — fail-open:', (invErr as Error).message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WAVE B1 — Rule-source shadow diff (RULE_SOURCE=shadow, default)
    //   Compare the rule_ids that actually fired (in-memory bundled path)
    //   against the candidate set a SQL-pushdown query would have offered.
    //   Logged into ai_decision_log.output_data.rule_source_diff for forensic
    //   review. NO behavior change — pure observability.
    // ═══════════════════════════════════════════════════════════════════════
    let _ruleSourceDiff: RuleSourceDiff | null = null;
    try {
      if (getRuleSource() === 'shadow') {
        const _resp: any = responsePayload;
        const _meta: any = _resp?.metadata || {};
        const bundledFired: string[] = Array.isArray(_meta?.rules_applied)
          ? _meta.rules_applied.map((r: any) => (typeof r === 'string' ? r : r?.rule_id)).filter(Boolean)
          : Array.isArray(_meta?.matchedRules)
            ? _meta.matchedRules.map((r: any) => (typeof r === 'string' ? r : r?.rule_id)).filter(Boolean)
            : [];
        const dbSelection = await selectCandidateRuleIdsFromDb({
          crop_code: _meta?.crop_code || _resp?.crop_code,
          crop_stage: _meta?.crop_stage || _meta?.stage,
          observations: Array.isArray(_meta?.observations) ? _meta.observations : [],
        }, { timeout_ms: 2000 });
        _ruleSourceDiff = computeRuleSourceDiff(bundledFired, dbSelection.rule_ids, {
          db_elapsed_ms: dbSelection.elapsed_ms,
          db_error: dbSelection.error,
        });
        if (_ruleSourceDiff.divergence_alert) {
          console.warn(
            `[RuleSourceShadow] divergence: bundled=${_ruleSourceDiff.bundled_count} db=${_ruleSourceDiff.db_candidate_count} ` +
            `ratio=${_ruleSourceDiff.bundled_in_db_ratio} only_bundled=${_ruleSourceDiff.only_bundled_count} only_db=${_ruleSourceDiff.only_db_count}`
          );
        }
      }
    } catch (diffErr) {
      console.warn('[RuleSourceShadow] diff failed — non-fatal:', (diffErr as Error).message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WAVE C — Funnel snapshot (per-stage pipeline drops)
    // ═══════════════════════════════════════════════════════════════════════
    let _funnelSnapshot: FunnelSnapshot | null = null;
    try {
      // record actions_returned now so the snapshot below sees it
      const _resp: any = responsePayload;
      const actionsCount = Array.isArray(_resp?.actions) ? _resp.actions.length : 0;
      // funnelRecord is internal; re-import dynamically via funnelEnd which captures all prior writes.
      // We attribute actions_returned through evaluation_trace below.
      _funnelSnapshot = funnelEnd(traceId);
      if (_funnelSnapshot) {
        _funnelSnapshot.counters.actions_returned = actionsCount;
        if (_funnelSnapshot.largest_drop) {
          console.warn(
            `[Funnel ${traceId}] largest drop: ${_funnelSnapshot.largest_drop.from}=${_funnelSnapshot.largest_drop.from_n} → ${_funnelSnapshot.largest_drop.to}=${_funnelSnapshot.largest_drop.to_n}`
          );
        }
        if (_resp && _resp.metadata) _resp.metadata.funnel = _funnelSnapshot.counters;
      }
    } catch (fnlErr) {
      console.warn('[Funnel] snapshot failed — non-fatal:', (fnlErr as Error).message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WAVE A1 — ai_decision_log insert (fire-and-forget)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const _resp: any = responsePayload;
      const _meta: any = _resp?.metadata || {};
      logDecisionTurn({
        trace_id: traceId,
        tenant_id: finalTenantId ?? null,
        farmer_id: finalFarmerId ?? null,
        land_id: _meta?.land_id ?? _resp?.land_id ?? null,
        decision_type: String(_meta?.intent_code || _resp?.type || 'UNKNOWN'),
        model_version: 'orchestrator-v1',
        prompt_version: _meta?.prompt_version ?? null,
        input_data: {
          query: typeof _meta?.query === 'string' ? _meta.query.slice(0, 500) : undefined,
          observations: Array.isArray(_meta?.observations) ? _meta.observations.slice(0, 30) : undefined,
          intent: _meta?.intent_code,
          language: _meta?.language,
        },
        output_data: {
          response_type: _resp?.type,
          clarification_required:
            _resp?.clarification_required === true ||
            _resp?.type === 'CLARIFICATION_QUESTION',
          actions_count: Array.isArray(_resp?.actions) ? _resp.actions.length : 0,
          recommendations_count: Array.isArray(_meta?.actions_returned)
            ? _meta.actions_returned.length
            : 0,
          rules_fired_count: Array.isArray(_meta?.rules_applied)
            ? _meta.rules_applied.length
            : 0,
          response_source: _meta?.source || _resp?.source,
          clarification_invariant: _meta?.clarification_invariant,
          rule_source_diff: _ruleSourceDiff,
        },
        reasoning: typeof _meta?.reasoning === 'string' ? _meta.reasoning.slice(0, 2000) : null,
        confidence_score: typeof _meta?.confidence === 'number' ? _meta.confidence : null,
        execution_time_ms: typeof _meta?.processing_time_ms === 'number' ? _meta.processing_time_ms : null,
        success: true,
        evaluation_trace: {
          agents_used: _meta?.agents_used ?? null,
          funnel: _funnelSnapshot ? {
            counters: _funnelSnapshot.counters,
            largest_drop: _funnelSnapshot.largest_drop ?? null,
            event_count: _funnelSnapshot.events.length,
          } : null,
        },
      }).catch(() => {});

      logOrchestratorMetrics({
        session_id: currentSessionId ?? null,
        tenant_id: finalTenantId ?? null,
        total_processing_time_ms: typeof _meta?.processing_time_ms === 'number' ? _meta.processing_time_ms : null,
        success: true,
        phase_timings: _meta?.phase_timings || {},
        agent_performance: { agents_used: _meta?.agents_used || [] },
        safety_status: _meta?.safety_status,
        final_confidence: typeof _meta?.confidence === 'number' ? _meta.confidence : null,
        rules_applied_count: Array.isArray(_meta?.rules_applied) ? _meta.rules_applied.length : 0,
      }).catch(() => {});
    } catch (logErr) {
      console.warn('[DecisionLog] insert failed — non-fatal:', (logErr as Error).message);
    }

    return new Response(
      JSON.stringify(responsePayload),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`❌ [${traceId}] ai-agriculture-chat Error:`, error);
    
    // PHASE A: Include trace_id in error response for debugging
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        trace_id: traceId,
        fallback_advice: 'Please try again or contact an agricultural expert.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    // Clean up dedup entry on completion (success or failure)
    if (typeof dedupeKey === 'string') {
      inFlightRequests.delete(dedupeKey);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize message content to English for NLU processing
 * Maps common agricultural terms from regional languages to English
 */
/**
 * @deprecated REMOVED — normalizeToEnglish had only 23 hardcoded mappings,
 * creating half-translated hybrid strings. LLM Semantic Extractor handles
 * all languages natively. Kept as no-op for any stale call sites.
 */
function normalizeToEnglish(content: string): string {
  return content;
}

/**
 * Verify if response content matches target language.
 * CRITICAL FIX: Old logic only checked if ANY script char existed (regex.test).
 * This passed for mixed English/Marathi responses like "Hello farmer! 🌾 शुभेच्छा".
 * New logic checks that the response has SUFFICIENT target-script content (>30% of text).
 */
function verifyLanguageConsistency(content: string, targetLanguage: string): boolean {
  if (targetLanguage === 'en') {
    const asciiRatio = (content.match(/[\x00-\x7F]/g) || []).length / content.length;
    return asciiRatio > 0.8;
  }
  
  // Strip emojis, numbers, whitespace, punctuation for ratio calculation
  const cleanText = content.replace(/[0-9₹%@\-/×.,()⛔⚠️🌾🐝🧤🔄📊📈💰✅❌🌤️🌧️💨🌡️🚨⏳🚫📌📋📍⏰🔧🛒🧪💡💊🌿👀🔍📖🎯📸📅🙏═─\n\r\s*#]+/g, '');
  
  const scriptRegex = getScriptRegex(targetLanguage);
  if (scriptRegex && cleanText.length > 20) {
    // Count script chars vs total significant chars
    const scriptChars = (cleanText.match(new RegExp(scriptRegex.source, 'g')) || []).length;
    const asciiAlpha = (cleanText.match(/[a-zA-Z]/g) || []).length;
    const total = scriptChars + asciiAlpha;
    if (total < 10) return true; // Too short to judge
    
    const scriptRatio = scriptChars / total;
    // If less than 30% is target script, it's predominantly English → needs translation
    return scriptRatio >= 0.3;
  }
  
  // Fallback: just check if ANY target script present
  if (scriptRegex) return scriptRegex.test(content);
  
  return true;
}

/**
 * Force translate response to target language.
 * 
 * CRITICAL FIX: Uses comprehensive section-header mapping + LLM fallback.
 * The old version only had 7 phrases and was useless.
 */
/**
 * Force-translate response to target language using LLM.
 * REFACTORED: Removed 70+ hardcoded English→Marathi/Hindi string mappings.
 * Now uses LLM-only translation when English density > 30%, supporting ALL languages.
 */
async function forceTranslateResponse(content: string, targetLang: string): Promise<string> {
  if (targetLang === 'en') return content;

  // Check if content is already in target language (Devanagari check for mr/hi)
  const isDevanagariLang = ['mr', 'hi'].includes(targetLang);
  if (isDevanagariLang) {
    const textForCheck = content.replace(/[0-9₹%@\-/×.,()⛔⚠️🌾🐝🧤🔄📊📈💰✅❌🌤️🌧️💨🌡️🚨⏳🚫📌📋📍⏰🔧🛒🧪💡💊🌿👀🔍📖🎯📸📅🙏═─\n\r\s]+/g, '');
    const devanagariChars = (textForCheck.match(/[\u0900-\u097F]/g) || []).length;
    const totalSignificantChars = textForCheck.length;
    const devanagariRatio = totalSignificantChars > 0 ? devanagariChars / totalSignificantChars : 0;
    
    // Already sufficiently translated
    if (devanagariRatio >= 0.7 || totalSignificantChars <= 30) {
      return content;
    }
  }

  // LLM translation for ANY target language
  const LANG_NAMES: Record<string, string> = { 
    mr: 'Marathi', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', 
    kn: 'Kannada', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi' 
  };
  const langName = LANG_NAMES[targetLang] || targetLang;
  
  console.log(`🌐 [forceTranslate] Translating to ${langName} via LLM`);
  
  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    
    const translationPrompt = `You are a village agriculture officer rewriting this advisory in natural rural ${langName}.
Speak like you are in the farmer's field explaining advice face-to-face.
Use local farming vocabulary, not textbook language.
Use common village words and farming terms that farmers actually use.
Agricultural symptom names must use the LOCAL FARMING TERM, not a literal English translation.
Avoid literal translation of English sentences — explain in local words.
Keep all numbers, product names, dosages, emojis, and formatting exactly as-is.
Do NOT add any new information. Do NOT change dosages or product names.
You are explaining, not translating.

Text to rewrite in natural rural ${langName}:
${content}`;

    if (OPENAI_API_KEY) {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: `You are a village agriculture officer with 20+ years of field experience. Rewrite the advisory in natural rural ${langName} as if you are standing in the farmer's field explaining advice face-to-face. Use local farming vocabulary, not textbook language. Keep numbers, product names, dosages unchanged. Output ONLY the rewritten text.` },
            { role: 'user', content: translationPrompt }
          ],
          max_tokens: 2000, temperature: 0.3
        })
      });
      clearTimeout(tid);
      if (resp.ok) {
        const data = await resp.json();
        const translatedText = data.choices?.[0]?.message?.content || '';
        if (translatedText.length > 30) {
          console.log(`✅ [forceTranslate] LLM translation successful (${translatedText.length} chars)`);
          return translatedText;
        }
      }
    } else if (GEMINI_API_KEY) {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: translationPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2000 }
        })
      });
      clearTimeout(tid);
      if (resp.ok) {
        const data = await resp.json();
        const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (translatedText.length > 30) {
          console.log(`✅ [forceTranslate] Gemini translation successful (${translatedText.length} chars)`);
          return translatedText;
        }
      }
    }
  } catch (e) {
    console.warn(`⚠️ [forceTranslate] LLM translation failed:`, e instanceof Error ? e.message : 'unknown');
  }

  return content;
}

/**
 * Ensure primary_decision contains the SSOT rich texts from decision_rules.
 * This prevents "missing reason/knowledge/action" when some pipeline paths
 * populate primary_decision but omit application_details fields.
 */
function hydrateDecisionOutputRichText(decisionOutput: any): void {
  if (!decisionOutput?.primary_decision) return;

  // ─────────────────────────────────────────────────────────────────────────
  // WAVE-R SYMBOLIC INVARIANT: hydration of treatment text (action_text /
  // reason_text / knowledge_text) is allowed ONLY when at least one rule
  // actually fired AND the primary_decision's rule_id is in the fired set.
  // Without this guard, candidates surfaced in `matched_responses` (e.g. by
  // observation-rule-lookup or hypothesis enrichers) are narrated as if they
  // had been validated by the symbolic engine — the very leak Wave-R seals.
  // ─────────────────────────────────────────────────────────────────────────
  const fired = firedRuleIds(decisionOutput);
  if (fired.length === 0) {
    console.log('🚫 [SymbolicInvariant] hydrate skipped — rules_fired=0');
    return;
  }
  const firedSet = new Set(fired);
  const primary = decisionOutput.primary_decision;
  const primaryRid = (primary as any)?.rule_id ?? null;
  if (!primaryRid || !firedSet.has(primaryRid)) {
    console.log(
      `🚫 [SymbolicInvariant] hydrate skipped — primary rule_id=${primaryRid} not in fired=[${fired.join(',')}]`,
    );
    return;
  }

  primary.application_details = primary.application_details || {};
  const app = primary.application_details as Record<string, any>;

  // 1) Prefer direct fields on primary_decision (some executors place them here)
  app.action_text ??= (primary as any).action_text;
  app.reason_text ??= (primary as any).reason_text;
  app.knowledge_text ??= (primary as any).knowledge_text;
  app.i18n_key ??= (primary as any).i18n_key;
  app.rule_id ??= primary.rule_id;

  // 2) If still missing, hydrate from matched_responses BUT only entries whose
  //    rule_id is in the fired set (Wave-R rule-identity verification).
  const ruleId = primary.rule_id || app.rule_id;
  if (ruleId && firedSet.has(ruleId) && Array.isArray(decisionOutput.matched_responses)) {
    const resp = decisionOutput.matched_responses.find(
      (r: any) => r?.rule_id === ruleId && firedSet.has(r.rule_id),
    );
    if (resp) {
      app.action_text ??= resp.action_text;
      app.reason_text ??= resp.reason_text;
      app.knowledge_text ??= resp.knowledge_text;
      app.i18n_key ??= resp.i18n_key;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE VALIDATION GATE - Prevents silent failures
// ═══════════════════════════════════════════════════════════════════════════

interface ValidationResult {
  passed: boolean;
  errors: string[];
}

/**
 * Validate response before saving to database
 * Ensures decision brain output is properly reflected in user response
 */
function validateResponseBeforeSave(params: {
  decision_brain_source: boolean;
  actions_returned: any[] | null;
  responseContent: string;
  orchestratorResponse: OrchestratorResponse;
  traceId: string;
  language: string;  // Language-agnostic: accepts any language code
}): ValidationResult {
  const { decision_brain_source, actions_returned, responseContent, orchestratorResponse, traceId, language } = params;
  const errors: string[] = [];
  // CRITICAL FIX: Use explicitly passed language, not metadata (which doesn't contain language)
  const detectedLanguage = language;
  
  console.log(`🔍 [${traceId}] Running validation checks...`);
  
  // Check 1: If decision_brain_source is TRUE
  if (decision_brain_source) {
    console.log(`   ✓ Check 1: decision_brain_source = TRUE`);
    
    // Check 2: For DECISION_PROVIDED type, verify actions_returned is not empty
    if (orchestratorResponse.type === 'DECISION_PROVIDED') {
      if (!actions_returned || actions_returned.length === 0) {
        // Only flag as error if there's a decision_output with recommendations
        const decisionOutput = orchestratorResponse.decision_output;
        const hasPrimaryDecision = !!decisionOutput?.primary_decision;
        const hasSecondaryDecisions = (decisionOutput?.secondary_recommendations?.length || 0) > 0;
        
        if (hasPrimaryDecision || hasSecondaryDecisions) {
          errors.push(`VALIDATION_FAIL: decision_output has recommendations but actions_returned is empty`);
          console.log(`   ✗ Check 2: actions_returned is empty but decision_output has data`);
        } else {
          console.log(`   ✓ Check 2: actions_returned empty, but decision_output also empty (expected)`);
        }
      } else {
        console.log(`   ✓ Check 2: actions_returned has ${actions_returned.length} items`);
      }
    }
    
    // Check 3: Verify content field contains recommendation text (not empty)
    if (!responseContent || responseContent.trim().length === 0) {
      errors.push(`VALIDATION_FAIL: response content is empty`);
      console.log(`   ✗ Check 3: responseContent is empty`);
    } else if (responseContent.trim().length < 50) {
      // Increased threshold from 20 to 50 for more robust content check
      errors.push(`VALIDATION_FAIL: response content too short for decision brain output (${responseContent.length} chars)`);
      console.log(`   ✗ Check 3: responseContent too short: "${responseContent.substring(0, 50)}"`);
    } else {
      console.log(`   ✓ Check 3: responseContent has ${responseContent.length} chars`);
    }
    
    // Check 4: For decisions with actions, verify content mentions actionable language
    if (actions_returned && actions_returned.length > 0 && orchestratorResponse.type === 'DECISION_PROVIDED') {
      const contentLower = responseContent.toLowerCase();
      
      // Language-specific recommendation keywords
      const recommendationKeywords: Record<string, string[]> = {
        'mr': ['फवारणी', 'करा', 'द्या', 'वापरा', 'शिफारस', 'उपाय', 'नियंत्रण', 'काढा', 'टाका'],
        'hi': ['छिड़काव', 'करें', 'दें', 'उपयोग', 'सिफारिश', 'उपाय', 'नियंत्रण', 'हटाएं', 'लगाएं'],
        'en': ['spray', 'apply', 'use', 'recommend', 'control', 'remove', 'treat', 'dosage', 'application']
      };
      
      const keywords = recommendationKeywords[detectedLanguage as string] || recommendationKeywords['en'];
      const hasRecommendationIndicators = keywords.some(kw => contentLower.includes(kw.toLowerCase()));
      
      if (!hasRecommendationIndicators) {
        // CRITICAL FIX: Downgrade to WARNING instead of FAIL - this is a heuristic check
        // If we have actions and content > 100 chars, don't block the response
        if (responseContent.length > 100) {
          console.log(`   ⚠️ Check 4: Response may lack recommendation language for ${detectedLanguage} (warning only - content is substantive)`);
        } else {
          errors.push(`VALIDATION_WARN: actions_returned present but response may lack actionable recommendation language`);
          console.log(`   ⚠️ Check 4: Response may lack recommendation language for ${detectedLanguage} (short content)`);
        }
      } else {
        console.log(`   ✓ Check 4: Response contains recommendation language`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // NEW CHECK 5: Detect agricultural errors (harvest for young crops)
    // CRITICAL FIX: Only validate when we HAVE crop schedule data - missing data should NOT trigger errors
    // ═══════════════════════════════════════════════════════════════════════════
    const contentLower = responseContent.toLowerCase();
    const cropStage = orchestratorResponse.dataAudit?.land?.growth_stage?.toUpperCase() || '';
    const daysSinceSowing = orchestratorResponse.dataAudit?.land?.days_since_sowing;
    const crop = orchestratorResponse.dataAudit?.land?.current_crop?.toUpperCase() || '';
    const hasCropScheduleData = orchestratorResponse.dataAudit?.crop_schedule?.found === true;
    
    // CRITICAL FIX: Also check decision_output.input_context for crop data when dataAudit is incomplete
    const inputContext = orchestratorResponse.decision_output?.input_context || {};
    const fallbackDays = inputContext.days_after_sowing || inputContext.farmer_context?.days_after_sowing;
    const fallbackStage = inputContext.crop_stage || inputContext.farmer_context?.crop_stage;
    
    const effectiveDays = daysSinceSowing ?? fallbackDays ?? null;
    const effectiveStage = cropStage || fallbackStage?.toUpperCase() || '';
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PRODUCTION FIX: Only truly young stages should be blocked for harvest
    // TILLERING (45-90 DAS for sugarcane) and GRAND_GROWTH are NOT young stages
    // They are active growth stages where pest/disease control is primary concern
    // Using blanket 120-day threshold was causing false rejections
    // ═══════════════════════════════════════════════════════════════════════════
    const trulyYoungStages = ['GERMINATION', 'SEEDLING', 'EMERGENCE'];
    
    // Use crop-specific minimum harvest age sourced from crop_baseline_guidelines_v2
    // (max das_end across stages). Falls back to 120 only when baseline cache misses.
    const baselineMaxDas = crop ? getMaxDASForCrop(crop) : null;
    const cropMinAge = baselineMaxDas ?? 120;
    if (crop && baselineMaxDas === null) {
      console.log(`   ℹ️ Check 5: No baseline DAS found for crop "${crop}" — defaulting cropMinAge=120`);
    }
    
    const hasValidCropData = (effectiveDays !== null && effectiveDays > 0) || effectiveStage;
    const isYoungCrop = hasValidCropData && (
      trulyYoungStages.includes(effectiveStage) || 
      (effectiveDays !== null && effectiveDays > 0 && effectiveDays < cropMinAge * 0.3) // Only block if < 30% of harvest age
    );
    
    // Check for harvest keywords in young crop responses
    const harvestKeywords = ['harvest', 'कापणी', 'काटाई', 'कटाई', 'वेचणी', 'काढणी', 'तोडणी'];
    const mentionsHarvest = harvestKeywords.some(kw => contentLower.includes(kw.toLowerCase()));
    
    if (isYoungCrop && mentionsHarvest) {
      errors.push(`VALIDATION_FAIL: Response recommends harvest for young crop (stage: ${effectiveStage}, days: ${effectiveDays})`);
      console.log(`   ✗ Check 5: AGRICULTURAL ERROR - Harvest recommended for ${effectiveStage} stage crop (${effectiveDays} days old)`);
    } else if (!hasValidCropData && mentionsHarvest) {
      // If we don't have crop data but response mentions harvest, don't block - just log warning
      console.log(`   ⚠️ Check 5: Response mentions harvest but no crop schedule data to validate (skipping check)`);
    } else {
      console.log(`   ✓ Check 5: No harvest-for-young-crop error (stage: ${effectiveStage || 'unknown'}, days: ${effectiveDays ?? 'unknown'})`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // NEW CHECK 6: Validate product details are present for chemical/spray actions
    // ═══════════════════════════════════════════════════════════════════════════
    if (actions_returned && actions_returned.length > 0) {
      const primaryAction = actions_returned.find((a: any) => a.type === 'primary');
      if (primaryAction) {
        const actionType = primaryAction.action_type?.toUpperCase() || '';
        const isChemicalAction = ['SPRAY', 'INSECTICIDE', 'FUNGICIDE', 'PESTICIDE', 'CHEMICAL'].some(t => actionType.includes(t));
        
        if (isChemicalAction) {
          const hasProductName = !!primaryAction.application_details?.product_name || !!primaryAction.product_name;
          const hasDosage = !!primaryAction.application_details?.dosage || !!primaryAction.dosage;
          
          if (!hasProductName) {
            errors.push(`VALIDATION_WARN: Chemical action missing product_name`);
            console.log(`   ⚠️ Check 6: Chemical action lacks product_name`);
          }
          if (!hasDosage) {
            errors.push(`VALIDATION_WARN: Chemical action missing dosage`);
            console.log(`   ⚠️ Check 6: Chemical action lacks dosage`);
          }
          if (hasProductName && hasDosage) {
            console.log(`   ✓ Check 6: Chemical action has complete product details`);
          }
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // NEW CHECK 7: SOURCE VALIDATION - Ensure all content comes from symbolic brain
    // Validates that LLM formatter did not add unauthorized content
    // ═══════════════════════════════════════════════════════════════════════════
    if (decision_brain_source && actions_returned && actions_returned.length > 0) {
      console.log(`   🔍 Check 7: Source validation - ensuring content matches symbolic brain output`);
      
      // Extract allowed products from actions_returned
      const allowedProducts = new Set<string>();
      for (const action of actions_returned) {
        const productName = action.product_name || action.application_details?.product_name;
        if (productName && typeof productName === 'string' && productName.length > 2) {
          allowedProducts.add(productName.toLowerCase());
          // Also add translated versions
          const translations = action.names || action.application_details?.names;
          if (translations) {
            if (translations.mr) allowedProducts.add(translations.mr.toLowerCase());
            if (translations.hi) allowedProducts.add(translations.hi.toLowerCase());
            if (translations.en) allowedProducts.add(translations.en.toLowerCase());
          }
        }
      }
      
      // Check for unauthorized percentage claims (effectiveness, success rate, etc.)
      const percentageClaimPatterns = [
        /(\d+)\s*%\s*(effective|success|cure|control|kill)/i,
        /(effective|success|cure).*?(\d+)\s*%/i
      ];
      
      for (const pattern of percentageClaimPatterns) {
        if (pattern.test(responseContent)) {
          // Check if this percentage is in the symbolic output
          const symbolicOutputStr = JSON.stringify(actions_returned);
          if (!pattern.test(symbolicOutputStr)) {
            errors.push(`VALIDATION_WARN: Response contains percentage effectiveness claim not in symbolic output`);
            console.log(`   ⚠️ Check 7: Unauthorized percentage claim detected`);
          }
        }
      }
      
      console.log(`   ✓ Check 7: Source validation complete (${allowedProducts.size} products allowed)`);
    }
  }
  
  return {
    passed: errors.filter(e => e.includes('VALIDATION_FAIL')).length === 0,
    errors
  };
}

/**
 * SSOT-COMPLIANT FALLBACK: renders ONLY DB-sourced product/dosage data.
 * NO hardcoded greetings, prose, or agronomic claims. If the symbolic brain
 * provided no usable actions, returns the orchestrator's own `fallback_advice`
 * (DB-sourced) or empty string after logging SYMBOLIC_CONTRACT_VIOLATION.
 *
 * Removed (was hardcoded English):
 *   - "🌾 Hello farmer friend!" greeting
 *   - "📌 **What to do now:**" header (UI label, not DB)
 *   - "I encountered a technical issue..." prose
 *   - "📞 For urgent help: Contact your nearest KVK" prose
 *   - "✅ Best wishes! 🙏" closing
 */
function generateValidationFailureFallback(
  lang: string,
  validationErrors: string[],
  orchestratorResponse: OrchestratorResponse,
  actionsReturned?: any[] | null
): string {
  const invalidNames = ['none', 'n/a', 'null', 'undefined', 'unknown', '', 'recommended treatment', 'additional measure'];
  const isValidProductName = (name: string | null | undefined): boolean => {
    if (!name) return false;
    const cleanName = name.toLowerCase().trim();
    return cleanName.length > 2 && !invalidNames.includes(cleanName);
  };

  if (actionsReturned && actionsReturned.length > 0) {
    const parts: string[] = [];
    let recNumber = 1;

    const primaryAction = actionsReturned.find(a => a.type === 'primary');
    if (primaryAction) {
      const rawProductName = primaryAction.product_name ||
                             primaryAction.application_details?.product_name ||
                             primaryAction.title;
      if (isValidProductName(rawProductName)) {
        const translatedProductName = getProductName(rawProductName, lang);
        const rawDosage = primaryAction.dosage || primaryAction.application_details?.dosage;
        const isValidDosage = rawDosage && rawDosage !== 'N/A' && rawDosage !== 'See product label' && rawDosage.length > 0;
        let line = `${recNumber}. **${translatedProductName}**`;
        if (isValidDosage && !translatedProductName.includes('/')) line += ` — ${rawDosage}`;
        parts.push(line);
        recNumber++;
      }
    }

    const secondaryActions = actionsReturned.filter(a => a.type !== 'primary');
    for (const action of secondaryActions.slice(0, 3)) {
      const rawActionName = action.action || action.title || action.product_name;
      if (isValidProductName(rawActionName)) {
        const translatedName = getProductName(rawActionName, lang);
        parts.push(`${recNumber}. **${translatedName}**`);
        recNumber++;
      }
    }

    if (parts.length > 0) return parts.join('\n');
  }

  // No DB-sourced actions available — surface the orchestrator's own fallback_advice (also DB-sourced)
  // or log a contract violation and return empty so upstream can decide what to do.
  const advice = orchestratorResponse?.error?.fallback_advice?.trim() || '';
  if (advice) return advice;

  console.error(`[SYMBOLIC_CONTRACT_VIOLATION] generateValidationFailureFallback called with no DB-sourced actions and no fallback_advice. validationErrors=${JSON.stringify(validationErrors)}`);
  return '';
}

/**
 * Generate response when ALL actions were filtered
 */
function generateAllActionsFilteredResponse(
  filteredActions: any[],
  lang: string
): string {
  // SSOT-COMPLIANT: render ONLY DB-sourced reasons grouped by their canonical
  // category code. NO hardcoded greetings, NO English category labels, NO
  // "what to do next" prose. The category code is a stable enum value the
  // narration layer can localize via i18n; here we only emit the raw code so
  // it never masks a missing DB string.
  const parts: string[] = [];

  const categoryReasons: Record<string, string[]> = {};
  filteredActions.forEach(action => {
    const category = action.filter_category || 'UNKNOWN';
    if (!categoryReasons[category]) categoryReasons[category] = [];
    const reason = (action.reason || action.action || '').toString().trim();
    if (reason) categoryReasons[category].push(reason);
  });

  for (const [category, reasons] of Object.entries(categoryReasons)) {
    if (reasons.length === 0) continue;
    parts.push(`[${category}]`);
    for (const reason of reasons.slice(0, 2)) parts.push(`• ${reason}`);
  }

  if (parts.length === 0) {
    console.error('[SYMBOLIC_CONTRACT_VIOLATION] generateAllActionsFilteredResponse called with no DB-sourced reasons');
    return '';
  }
  return parts.join('\n');
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTRACT & AUDIT ACTIONS WITH FILTER TRACE
 * Enhanced version with detailed filter rule logging
 * ═══════════════════════════════════════════════════════════════════════════
 */
interface ActionAuditLog {
  total_recommendations: number;
  total_filtered: number;
  validation_errors: string[];
  filter_categories: Record<string, number>;
}

interface FilterTraceEntry {
  filter_name: string;
  action: string;
  passed: boolean;
  reason?: string;
  category?: string;
}

type FilterCategory = 'REGULATORY' | 'SAFETY' | 'SEASONAL' | 'WEATHER' | 'ECONOMIC' | 'COMPATIBILITY' | 'EMERGENCY' | 'UNKNOWN';

function categorizeFilterReason(reason: string, blockedByRule?: string): FilterCategory {
  const reasonLower = (reason || '').toLowerCase();
  const ruleLower = (blockedByRule || '').toLowerCase();
  
  // Emergency: immediate danger, acute toxicity
  if (reasonLower.includes('emergency') || reasonLower.includes('acute') || 
      reasonLower.includes('immediate') || reasonLower.includes('danger')) {
    return 'EMERGENCY';
  }
  
  // Regulatory: pesticide bans, government restrictions
  if (reasonLower.includes('banned') || reasonLower.includes('regulated') || 
      reasonLower.includes('prohibited') || ruleLower.includes('REG_')) {
    return 'REGULATORY';
  }
  
  // Safety: PHI, worker safety, toxicity
  if (reasonLower.includes('phi') || reasonLower.includes('safety') || 
      reasonLower.includes('toxic') || reasonLower.includes('harmful') ||
      ruleLower.includes('SAFETY_') || reasonLower.includes('pre-harvest')) {
    return 'SAFETY';
  }
  
  // Seasonal: wrong season, wrong growth stage
  if (reasonLower.includes('season') || reasonLower.includes('stage') || 
      reasonLower.includes('timing') || ruleLower.includes('SEASON_')) {
    return 'SEASONAL';
  }
  
  // Weather: rain, wind, temperature
  if (reasonLower.includes('rain') || reasonLower.includes('weather') || 
      reasonLower.includes('wind') || reasonLower.includes('temperature')) {
    return 'WEATHER';
  }
  
  // Economic: cost, availability
  if (reasonLower.includes('cost') || reasonLower.includes('expensive') || 
      reasonLower.includes('unavailable')) {
    return 'ECONOMIC';
  }
  
  // Compatibility: tank mix issues
  if (reasonLower.includes('compatible') || reasonLower.includes('mix') || 
      reasonLower.includes('incompatible')) {
    return 'COMPATIBILITY';
  }
  
  return 'UNKNOWN';
}

function extractAndAuditActionsWithFilterTrace(orchestratorResponse: OrchestratorResponse, traceId: string, detectedLanguage: string = 'en'): {
  actions_returned: any[] | null;
  actions_filtered_out: any[] | null;
  audit_log: ActionAuditLog;
  filter_trace: FilterTraceEntry[];
} {
  const audit_log: ActionAuditLog = {
    total_recommendations: 0,
    total_filtered: 0,
    validation_errors: [],
    filter_categories: {}
  };
  
  const filter_trace: FilterTraceEntry[] = [];
  
  // Return early for non-decision types
  if (orchestratorResponse.type !== 'DECISION_PROVIDED') {
    console.log(`📋 [${traceId}] Non-decision response type: ${orchestratorResponse.type}`);
    return { actions_returned: null, actions_filtered_out: null, audit_log, filter_trace };
  }

  const decisionOutput = orchestratorResponse.decision_output;
  
  if (!decisionOutput) {
    audit_log.validation_errors.push('decision_output is null/undefined');
    return { actions_returned: null, actions_filtered_out: null, audit_log, filter_trace };
  }

  const actionsReturned: any[] = [];
  
  // Extract and validate primary decision
  if (decisionOutput.primary_decision) {
    const primary = decisionOutput.primary_decision;
    
    // Validation: Check required fields (NOTE: priority is optional for symbolic decisions)
    const validationErrors: string[] = [];
    if (!primary.action_type) validationErrors.push('primary.action_type missing');
    // CRITICAL FIX: priority is optional - don't fail validation for missing priority
    // The decision brain may not always set priority, but the decision is still valid
    
    // Build enriched action object with title/description
    const enrichedAction = {
      type: 'primary',
      action_type: primary.action_type,
      // Generate title from action type — use detected language, not hardcoded 'mr'
      title: generateActionTitle(primary, detectedLanguage),
      // Generate description from action details
      description: generateActionDescription(primary, detectedLanguage),
      product_name: primary.application_details?.product_name,
      dosage: primary.application_details?.concentration,
      timing: primary.timing,
      urgency: primary.urgency,
      priority: primary.priority || 'HIGH',
      ipm_level: primary.ipm_level,
      rule_id: primary.rule_id,
      efficacy_percent: primary.expected_outcomes?.efficacy_percent,
      target: {
        pest_code: primary.target?.pest_code,
        disease_code: primary.target?.disease_code,
        nutrient_deficiency: primary.target?.nutrient_deficiency
      },
      // Actions array for compatibility
      actions: [primary.action_type]
    };
    
    // Log filter trace for primary action (it passed all filters)
    filter_trace.push({
      filter_name: 'DECISION_GRAPH_OUTPUT',
      action: primary.action_type,
      passed: true
    });
    
    actionsReturned.push(enrichedAction);
    validationErrors.forEach(e => audit_log.validation_errors.push(e));
  }

  // Extract and validate secondary actions
  if (decisionOutput.secondary_actions && decisionOutput.secondary_actions.length > 0) {
    for (const secondary of decisionOutput.secondary_actions) {
      // Validation
      if (!secondary.action) {
        audit_log.validation_errors.push('secondary.action missing');
      }
      
      // Log filter trace for secondary action
      filter_trace.push({
        filter_name: 'SECONDARY_ACTION_INCLUDED',
        action: secondary.action || 'UNKNOWN',
        passed: true
      });
      
      actionsReturned.push({
        type: 'secondary',
        action: secondary.action,
        title: secondary.action, // Use action as title for secondary
        description: secondary.reason || '',
        reason: secondary.reason,
        timing: secondary.timing,
        priority: secondary.priority || 'MEDIUM',
        ipm_level: secondary.ipm_level,
        rule_id: secondary.rule_id,
        actions: [secondary.action]
      });
    }
  }

  // Extract blocked/filtered actions with comprehensive categorization and tracing
  const actionsFilteredOut: any[] = [];
  
  if (decisionOutput.blocked_actions && decisionOutput.blocked_actions.length > 0) {
    for (const blocked of decisionOutput.blocked_actions) {
      const filterCategory = categorizeFilterReason(blocked.reason, blocked.blocked_by_rule);
      
      // Track category counts
      audit_log.filter_categories[filterCategory] = 
        (audit_log.filter_categories[filterCategory] || 0) + 1;
      
      // Log filter trace for blocked action with explicit reason
      filter_trace.push({
        filter_name: blocked.blocked_by_rule || 'SAFETY_GUARDIAN',
        action: blocked.action || 'UNKNOWN',
        passed: false,
        reason: blocked.reason,
        category: filterCategory
      });
      
      actionsFilteredOut.push({
        action: blocked.action,
        blocked_by_rule: blocked.blocked_by_rule,
        reason: blocked.reason,
        filter_category: filterCategory, // WHY it was filtered
        priority: blocked.priority,
        alternatives: blocked.alternatives || [],
        // Additional explicit reason fields for transparency
        explicit_reason: buildExplicitFilterReason(blocked, filterCategory)
      });
    }
  }

  audit_log.total_recommendations = actionsReturned.length;
  audit_log.total_filtered = actionsFilteredOut.length;

  return {
    actions_returned: actionsReturned.length > 0 ? actionsReturned : null,
    actions_filtered_out: actionsFilteredOut.length > 0 ? actionsFilteredOut : null,
    audit_log,
    filter_trace
  };
}

/**
 * Build explicit human-readable filter reason
 */
function buildExplicitFilterReason(blocked: any, category: FilterCategory): string {
  const reasons: Record<FilterCategory, string> = {
    EMERGENCY: `EMERGENCY BLOCK: ${blocked.reason || 'Immediate safety concern'}`,
    REGULATORY: `REGULATORY COMPLIANCE: ${blocked.reason || 'Product banned or restricted by government regulations'}`,
    SAFETY: `SAFETY RESTRICTION: ${blocked.reason || 'Pre-harvest interval (PHI) or toxicity concern'}`,
    SEASONAL: `SEASONAL MISMATCH: ${blocked.reason || 'Not appropriate for current crop growth stage'}`,
    WEATHER: `WEATHER CONDITIONS: ${blocked.reason || 'Current weather unsuitable for application'}`,
    ECONOMIC: `ECONOMIC FACTOR: ${blocked.reason || 'Cost or availability concern'}`,
    COMPATIBILITY: `COMPATIBILITY ISSUE: ${blocked.reason || 'Cannot be mixed with other products'}`,
    UNKNOWN: `FILTERED: ${blocked.reason || 'Action blocked by system rules'}`
  };
  
  return reasons[category];
}

/**
 * Generate human-readable title for an action
 */
function generateActionTitle(primary: any, lang: string): string {
  const actionType = primary.action_type || 'UNKNOWN';
  const productName = primary.application_details?.product_name;
  
  // English-only titles — forceTranslateResponse() handles localization at runtime
  const titles: Record<string, string> = {
    SPRAY: productName ? `Apply ${productName}` : 'Insecticide Spray',
    FERTILIZER: 'Apply Fertilizer',
    NO_ACTION: 'No Action Required',
    MONITOR_ONLY: 'Monitor Only',
    CULTURAL: 'Cultural Practice',
    BIOLOGICAL: 'Biological Control',
    MECHANICAL: 'Mechanical Control',
    IRRIGATION: 'Irrigation Management',
    HERBICIDE: 'Weed Control',
    FUNGICIDE: 'Fungicide Application',
    INSECTICIDE: 'Insecticide Application',
  };
  
  return titles[actionType] || actionType;
}

/**
 * Generate human-readable description for an action
 */
function generateActionDescription(primary: any, lang: string): string {
  const parts: string[] = [];
  
  if (primary.target?.pest_code) {
    parts.push(`Target: ${primary.target.pest_code}`);
  }
  if (primary.target?.disease_code) {
    parts.push(`Target: ${primary.target.disease_code}`);
  }
  if (primary.application_details?.concentration) {
    parts.push(`Dosage: ${primary.application_details.concentration}`);
  }
  if (primary.expected_outcomes?.efficacy_percent) {
    parts.push(`Efficacy: ${primary.expected_outcomes.efficacy_percent}%`);
  }
  
  return parts.join(' | ') || 'Recommendation based on current conditions';
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POST-PROCESSING: Convert Decision Brain output to natural language
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This step runs AFTER the decision graph completes and:
 * 1. Takes all recommendations from decision brain output
 * 2. Converts them to natural language for detected language (MR/HI/EN)
 * 3. Formats as bullet points or numbered list for chat response
 * 4. Returns text suitable for ai_chat_messages.content field
 * 5. NEVER returns empty - always reflects decision brain output
 */
async function getResponseContent(response: OrchestratorResponse, language: string): Promise<string> {
  const lang = language;
  console.log(`📝 [PostProcessor] Converting response type: ${response.type} to language: ${lang}`);
  console.log(`📝 [PostProcessor] Response assembly:`, {
    has_communication: !!response.communication,
    has_decision_output: !!response.decision_output,
    comm_keys: response.communication?.main_message ? Object.keys(response.communication.main_message) : [],
    decision_status: response.decision_output?.status,
    has_primary: !!response.decision_output?.primary_decision
  });
  
  switch (response.type) {
    case 'DECISION_PROVIDED':
      // PRIMARY PATH: Decision Brain generated recommendations
      const comm = response.communication;
      const decisionOutput = response.decision_output;
      
      // Step 1: Try FarmerCommunication structure FIRST (preferred - already translated)
      // This includes both sections format AND full_text format (LLM-first path)
      const communicationText = flattenCommunicationToText(comm, language);
      if (communicationText && communicationText.length > 50) {
        console.log(`   ✅ Using FarmerCommunication text (${communicationText.length} chars)`);
        return communicationText;
      }
      
      // Step 2: Check decision_output if communication is incomplete
      if (decisionOutput?.primary_decision || 
          (decisionOutput?.secondary_actions && decisionOutput.secondary_actions.length > 0)) {
        console.log(`   ✅ Building from decision_output (primary or secondary actions found)`);
        return await buildFormattedRecommendationsList(decisionOutput, lang);
      }
      
      // Step 3: Fallback - only when truly no recommendations
      console.log(`   ⚠️ No valid communication or decision_output - generating fallback`);
      return generateNoRecommendationsFallback(response, lang);
      
    case 'CLARIFICATION_QUESTION':
    case 'CLARIFICATION_NEEDED':
      // Priority 1: question object with language-specific text (prefer lang, fallback to en)
      const questionText = (response.question as any)?.[`text_${lang}`] || response.question?.text_en || '';
      if (questionText) return questionText;
      
      // Priority 2: communication.main_message.full_text (ZERO_CODE_GATE path)
      const commFullText = response.communication?.main_message?.full_text;
      if (commFullText) {
        const commText = commFullText[lang] || commFullText['en'] || '';
        if (commText) return commText;
      }
      
      // Priority 3: communication.farmer_message (legacy path)
      if (response.communication?.farmer_message) return response.communication.farmer_message;
      
      // Priority 4: response.response (direct response field)
      if (response.response) return response.response;
      
      // Fallback: generate clarification prompt
      return generateClarificationPrompt(response, lang);
      
    case 'PHOTO_REQUEST':
      return (response.photo_instructions as any)?.[`text_${lang}`] || response.photo_instructions?.text_en || '';
    case 'SAFETY_BLOCKED':
      return (response.blocked_reason as any)?.[`reason_${lang}`] || response.blocked_reason?.reason_en || '';
    case 'ESCALATION_REQUIRED':
      return (response.escalation as any)?.[`message_${lang}`] || response.escalation?.message_en || '';
    case 'LLM_RESPONSE':
      return response.llm_response || 
             response.escalation?.message_en || '';
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Handle SYSTEM_ERROR properly - provide helpful advice
    // ═══════════════════════════════════════════════════════════════════════════
    case 'SYSTEM_ERROR':
      console.log(`   ⚠️ SYSTEM_ERROR response - generating helpful fallback`);
      const fallbackAdvice = response.error?.fallback_advice || '';
      return generateHelpfulErrorResponse(lang, fallbackAdvice);
      
    default:
      // NEVER silent - even for unknown types, provide helpful response
      console.log(`   ⚠️ Unknown response type: ${response.type} - generating helpful fallback`);
      return generateHelpfulErrorResponse(lang, '');
  }
}

/**
 * SSOT-COMPLIANT NO-RECOMMENDATIONS FALLBACK
 *
 * The symbolic brain is contractually required to attach `error.fallback_advice`
 * (DB-sourced) whenever it produces no recommendations. This function emits
 * that text verbatim. If it is missing we log SYMBOLIC_CONTRACT_VIOLATION and
 * return empty — we DO NOT invent greetings, clarification questions, or
 * encouragement prose here.
 *
 * Removed (was hardcoded English):
 *   - "Hello farmer friend! 🌾" greeting
 *   - "I understand you're dealing with X..." prose
 *   - "What is the crop name? / growth stage? / symptoms? / send a photo" template
 *   - "Once I have this information..." closing
 */
function generateNoRecommendationsFallback(response: OrchestratorResponse, lang: string): string {
  const advice = response?.error?.fallback_advice?.trim() || '';
  if (advice) return advice;
  console.error(`[SYMBOLIC_CONTRACT_VIOLATION] generateNoRecommendationsFallback: response.error.fallback_advice missing for type=${response?.type}`);
  return '';
}

/**
 * SSOT-COMPLIANT RECOMMENDATIONS RENDERER
 *
 * Renders ONLY DB-sourced fields from the DecisionOutput:
 *   - active_ingredient + dosage_per_acre (from rule rich data)
 *   - application_details.method
 *   - timing.best_time_of_day (raw code only — no hardcoded English window)
 *   - application_details.action_text / reason_text / knowledge_text
 *   - secondary_actions[].action + .reason
 *   - blocked_actions[].reason (BLOCKED status)
 *
 * Removed (was hardcoded English / fabricated agronomic content):
 *   - "Hello farmer friend! 🌾" greeting
 *   - "⚠️ Stop: Safety check required" default
 *   - "⏱️ Postpone spray — Spray when weather clears. Continue crop monitoring for now."
 *   - "👀 No action required at this time. Continue monitoring."
 *   - "📌 Recommendations:" header label
 *   - timingLabels map (Morning 6-10 AM / Evening 4-6 PM / Any time)
 *   - richLabels map (Action / Reason / Knowledge English labels)
 *   - "✅ Best wishes! 🙏" closing
 */
async function buildFormattedRecommendationsList(decision: any, lang: string, supabaseClient?: any): Promise<string> {
  const parts: string[] = [];
  const primary = decision.primary_decision;

  // BLOCKED — emit DB-sourced reason verbatim or log violation
  if (decision.status === 'BLOCKED') {
    const blockedReason = decision.blocked_actions?.[0]?.reason?.trim() || '';
    if (blockedReason) return blockedReason;
    console.error('[SYMBOLIC_CONTRACT_VIOLATION] buildFormattedRecommendationsList: BLOCKED status with no blocked_actions[0].reason');
    return '';
  }

  // WEATHER_DELAYED — must come from DB (decision.weather_delay_reason or rule text). No hardcoded prose.
  if (decision.status === 'WEATHER_DELAYED') {
    const weatherReason = (decision.weather_delay_reason || decision.primary_decision?.application_details?.reason_text || '').toString().trim();
    if (weatherReason) return weatherReason;
    console.error('[SYMBOLIC_CONTRACT_VIOLATION] buildFormattedRecommendationsList: WEATHER_DELAYED status with no DB-sourced reason text');
    return '';
  }

  // NO_ACTION / MONITOR_ONLY — render rich texts only (no fabricated "No action required" prose)
  if (primary?.action_type === 'NO_ACTION' || primary?.action_type === 'MONITOR_ONLY') {
    const app = primary?.application_details || {};
    const actionText = (app.action_text as string | undefined)?.trim();
    const reasonText = (app.reason_text as string | undefined)?.trim();
    const knowledgeText = (app.knowledge_text as string | undefined)?.trim();
    if (actionText) parts.push(actionText);
    if (reasonText) parts.push(reasonText);
    if (knowledgeText) parts.push(knowledgeText);
    if (parts.length === 0) {
      console.error(`[SYMBOLIC_CONTRACT_VIOLATION] buildFormattedRecommendationsList: ${primary.action_type} with no action_text/reason_text/knowledge_text`);
      return '';
    }
    return parts.join('\n\n');
  }

  // Primary recommendation
  if (primary) {
    let recNumber = 1;
    const recParts: string[] = [];

    const appDetails = primary.application_details || {};
    const richData = extractRichRuleData(primary, appDetails);
    const rawIngredient = richData.active_ingredient || '';
    const productName = rawIngredient ? getProductName(rawIngredient, lang) : '';
    const dosage = (richData.dosage_per_acre || '').toString().trim();
    const timing = primary.timing?.best_time_of_day || '';
    const method = appDetails.method || appDetails.application_method || '';

    let marketProductLine = '';
    if (richData.active_ingredient && supabaseClient) {
      try {
        const cropCode = decision.metadata?.crop_code || decision.primary_decision?.target?.crop || '';
        const marketResult = await lookupMarketProducts(supabaseClient, richData.active_ingredient, cropCode);
        marketProductLine = formatMarketProducts(marketResult.products, lang);
      } catch (err) {
        console.warn(`[ProductMapping] Lookup failed, continuing without market products:`, err);
      }
    }

    const actionText = (appDetails.action_text as string | undefined)?.trim();
    const reasonText = (appDetails.reason_text as string | undefined)?.trim();
    const knowledgeText = (appDetails.knowledge_text as string | undefined)?.trim();

    if (!productName && !actionText && !reasonText) {
      console.error('[SYMBOLIC_CONTRACT_VIOLATION] buildFormattedRecommendationsList: primary decision has no active_ingredient and no action_text/reason_text');
    }

    let primaryText = productName ? `${recNumber}. ${productName}` : `${recNumber}.`;
    if (dosage) primaryText += ` @ ${dosage}`;

    if (method) {
      const methodText = getMethodTranslation(method, lang);
      if (methodText) primaryText += `\n   ${methodText}`;
    }

    // Timing: emit raw DB enum code only; narration/i18n layer must localize it.
    if (timing) primaryText += `\n   [${timing}]`;

    if (marketProductLine) primaryText += `\n   ${marketProductLine}`;

    if (actionText) primaryText += `\n   ${actionText}`;
    if (reasonText) primaryText += `\n   ${reasonText}`;
    if (knowledgeText) primaryText += `\n   ${knowledgeText}`;

    const efficacy = primary.expected_outcomes?.efficacy_percent;
    if (efficacy) primaryText += `\n   ${efficacy}%`;

    recParts.push(primaryText);
    recNumber++;

    if (decision.secondary_actions && decision.secondary_actions.length > 0) {
      decision.secondary_actions.slice(0, 2).forEach((alt: any) => {
        if (alt.action && alt.action !== 'N/A' && alt.action !== 'None') {
          const translatedAction = getActionTranslation(alt.action, lang);
          const reason = (alt.reason || '').toString().trim();
          recParts.push(`${recNumber}. ${translatedAction}${reason ? ` — ${reason}` : ''}`);
          recNumber++;
        }
      });
    }

    parts.push(recParts.join('\n'));
  }

  return parts.join('\n\n');
}

/**
 * SSOT-COMPLIANT CLARIFICATION PROMPT
 *
 * The orchestrator must supply `response.question.text_*` for every
 * CLARIFICATION_QUESTION branch. If absent we log a contract violation and
 * return empty — never invent a generic English clarification.
 *
 * Removed (was hardcoded English):
 *   - "Please provide more details about your question..." template
 */
function generateClarificationPrompt(response: OrchestratorResponse, lang: string): string {
  const q = response.question as any;
  const text = (q?.[`text_${lang}`] || q?.text_en || '').toString().trim();
  if (text) return text;
  console.error(`[SYMBOLIC_CONTRACT_VIOLATION] generateClarificationPrompt: response.question.text_* missing for session=${response?.session_id}`);
  return '';
}

/**
 * @deprecated Use generateHelpfulErrorResponse instead
 */
function generateGenericAcknowledgment(lang: string): string {
  return generateHelpfulErrorResponse(lang, '');
}

/**
 * SSOT-COMPLIANT ERROR RESPONSE
 *
 * Emits the orchestrator-supplied `fallback_advice` verbatim. No hardcoded
 * greetings, quick tips, or fabricated agronomic guidance.
 *
 * Removed (was hardcoded English / fabricated agronomic claims):
 *   - "🙏 Hello Farmer Friend!" greeting
 *   - "📋 Tell me: crop / age / problem" template
 *   - "💡 Quick tips: Monitor your crop regularly / water management / Report new pest signs"
 */
function generateHelpfulErrorResponse(lang: string, fallbackAdvice: string): string {
  const advice = (fallbackAdvice || '').trim();
  if (advice) return advice;
  console.error('[SYMBOLIC_CONTRACT_VIOLATION] generateHelpfulErrorResponse called with empty fallbackAdvice');
  return '';
}

/**
 * SSOT-COMPLIANT FALLBACK BUILDER (used when CommunicationGenerator returns
 * incomplete data). Renders ONLY DB-sourced fields.
 *
 * Removed (was hardcoded English / fabricated agronomic claims):
 *   - "Hello farmer friend! 🌾"
 *   - "⚠️ Stop: Safety check required" default
 *   - "⏱️ Postpone spray - Spray when weather clears. Continue crop monitoring for now."
 *   - "👀 No action required at this time. Continue monitoring."
 *   - "📌 What to do now:" header label
 *   - "Recommended treatment" placeholder product name
 *   - timingLabels map ("Spray in the morning 6-10 AM" / "Evening 4-6 PM" / "Any time of day")
 *   - English labels "Action:" / "Reason:" / "Knowledge:" / "Alternative measures:" / "Expected efficacy:"
 *   - "✅ Best wishes! 🙏" closing
 */
async function buildResponseFromDecisionOutput(decision: any, language: string, supabaseClient?: any): Promise<string> {
  if (!decision) {
    return getGenericMonitoringMessage(language);
  }

  const parts: string[] = [];
  const primary = decision.primary_decision;

  if (decision.status === 'BLOCKED') {
    const blockedReason = (decision.blocked_actions?.[0]?.reason || '').toString().trim();
    if (blockedReason) return blockedReason;
    console.error('[SYMBOLIC_CONTRACT_VIOLATION] buildResponseFromDecisionOutput: BLOCKED with no blocked_actions[0].reason');
    return '';
  }

  if (decision.status === 'WEATHER_DELAYED') {
    const reason = (decision.weather_delay_reason || decision.primary_decision?.application_details?.reason_text || '').toString().trim();
    if (reason) return reason;
    console.error('[SYMBOLIC_CONTRACT_VIOLATION] buildResponseFromDecisionOutput: WEATHER_DELAYED with no DB-sourced reason');
    return '';
  }

  if (primary?.action_type === 'NO_ACTION' || primary?.action_type === 'MONITOR_ONLY') {
    const app = primary?.application_details || {};
    if (app.action_text) parts.push(String(app.action_text).trim());
    if (app.reason_text) parts.push(String(app.reason_text).trim());
    if (app.knowledge_text) parts.push(String(app.knowledge_text).trim());
    if (parts.length === 0) {
      console.error(`[SYMBOLIC_CONTRACT_VIOLATION] buildResponseFromDecisionOutput: ${primary.action_type} with no rich texts`);
      return '';
    }
    return parts.join('\n\n');
  }

  if (primary) {
    const appDetails = primary.application_details || {};
    const richData = extractRichRuleData(primary, appDetails);
    const rawProductName = richData.active_ingredient || appDetails.product_name || '';
    const productName = rawProductName ? getProductName(rawProductName, language) : '';
    const dosage = (richData.dosage_per_acre || appDetails.concentration || '').toString().trim();
    const timing = primary.timing?.best_time_of_day || '';
    const method = richData.application_method || appDetails.method || '';

    if (!productName) {
      console.error('[SYMBOLIC_CONTRACT_VIOLATION] buildResponseFromDecisionOutput: primary decision missing active_ingredient/product_name');
    }

    const productLine = productName
      ? (dosage ? `${productName} @ ${dosage}` : productName)
      : (dosage ? `@ ${dosage}` : '');
    if (productLine) parts.push(productLine);

    if (richData.active_ingredient && supabaseClient) {
      try {
        const cropCode = decision.metadata?.crop_code || primary?.target?.crop || '';
        const marketResult = await lookupMarketProducts(supabaseClient, richData.active_ingredient, cropCode);
        const marketLine = formatMarketProducts(marketResult.products, language);
        if (marketLine) parts.push(marketLine);
      } catch (err) {
        console.warn(`[ProductMapping] Lookup failed in fallback builder:`, err);
      }
    }

    if (method) {
      const methodText = getMethodTranslation(method, language);
      if (methodText) parts.push(methodText);
    }

    // Timing: emit raw enum code only — narration/i18n layer localizes.
    if (timing) parts.push(`[${timing}]`);

    const actionText = (appDetails.action_text as string | undefined)?.trim();
    const reasonText = (appDetails.reason_text as string | undefined)?.trim();
    if (actionText) parts.push(actionText);
    if (reasonText) parts.push(reasonText);

    const efficacy = primary.expected_outcomes?.efficacy_percent;
    if (efficacy) parts.push(`${efficacy}%`);
  }

  if (decision.secondary_actions && decision.secondary_actions.length > 0) {
    decision.secondary_actions.slice(0, 2).forEach((alt: any) => {
      if (alt.action) {
        const translatedAction = getActionTranslation(alt.action, language);
        if (translatedAction) parts.push(`• ${translatedAction}`);
      }
    });
  }

  return parts.join('\n');
}

/**
 * SSOT-COMPLIANT: when no decision output is available we have nothing to
 * say. Returning a hardcoded "continue monitoring" sentence violates
 * Agronomic-Safety-Negligence (e.g., it would suppress urgent-pest treatment).
 *
 * Removed: "Hello! 🌾 Continue monitoring your crop. Let us know if you notice any issues."
 */
function getGenericMonitoringMessage(_language: string): string {
  console.error('[SYMBOLIC_CONTRACT_VIOLATION] getGenericMonitoringMessage called — no DB-sourced text available');
  return '';
}

/**
 * CRITICAL FIX: Flatten FarmerCommunication structure to readable text
 * Handles the main_message.sections structure properly
 */
function flattenCommunicationToText(comm: any, language: string, requires?: any): string {
  if (!comm) return '';
  
  const lang = language;
  const parts: string[] = [];
  
  // Helper to get text from TrilingualText object
  const getText = (obj: any): string => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[lang] || obj.en || obj.hi || obj.mr || '';
  };
  
  // CRITICAL FIX: Check for full_text format FIRST (used by LLM-first path)
  if (comm.main_message?.full_text) {
    const fullText = getText(comm.main_message.full_text);
    if (fullText && fullText.length > 20) {
      console.log(`   ✅ Using full_text format (${fullText.length} chars)`);
      return fullText;
    }
  }
  
  // 1. Greeting (ALWAYS SHOW)
  if (comm.main_message?.greeting) {
    parts.push(comm.main_message.greeting);
  }
  
  // 2. Empathy line (ALWAYS SHOW if present)
  if (comm.main_message?.empathy_line) {
    parts.push(comm.main_message.empathy_line);
  }
  
  // 3. Immediate Action (ALWAYS SHOW)
  const immediate = comm.main_message?.sections?.immediate_action;
  if (immediate) {
    const emoji = immediate.emoji || '📌';
    const heading = getText(immediate.heading);
    const summary = getText(immediate.action_summary);
    const urgency = getText(immediate.urgency_indicator?.text);
    
    if (heading || summary) {
      // SSOT: only emit the DB-sourced heading. Do not invent "What to do now:" when missing.
      if (heading) parts.push(`\n${emoji} ${heading}`);
      if (summary) parts.push(summary);
      if (urgency) parts.push(`⏰ ${urgency}`);
    }
  }
  
  // 4. Application Instructions (ONLY IF PRESENT - adaptive)
  const howTo = comm.main_message?.sections?.how_to;
  if (howTo) {
    const heading = getText(howTo.heading);
    if (heading) parts.push(`\n🔧 ${heading}`);
    
    // Materials — DB-sourced items only; no hardcoded "Materials:" English label.
    if (howTo.materials_needed?.items?.length > 0) {
      const materialsHeading = getText(howTo.materials_needed?.heading);
      if (materialsHeading) parts.push(`🛒 ${materialsHeading}`);
      howTo.materials_needed.items.forEach((item: any) => {
        const name = getText(item.name);
        if (name && name !== 'Unknown product') parts.push(`• ${name} - ${item.quantity || ''}`);
      });
    }
    
    // Mixing steps
    if (howTo.mixing_instructions?.steps) {
      const steps = howTo.mixing_instructions.steps[lang] || howTo.mixing_instructions.steps.en || [];
      if (steps.length > 0) {
        parts.push('🧪 Mixing:');
        steps.slice(0, 4).forEach((step: string, i: number) => parts.push(`${i + 1}. ${step}`));
      }
    }
  }
  
  // 5. Rationale (ONLY IF PRESENT)
  const rationale = comm.main_message?.sections?.rationale;
  if (rationale) {
    const heading = getText(rationale.heading);
    const explanation = getText(rationale.problem_explanation);
    if (heading && explanation) {
      parts.push(`\n💡 ${heading}`);
      parts.push(explanation);
    }
  }
  
  // 6. Warnings (ONLY IF PRESENT)
  const warnings = comm.main_message?.sections?.warnings;
  if (warnings?.blocked_actions?.length > 0) {
    parts.push('\n⚠️ Do NOT:');
    warnings.blocked_actions.slice(0, 3).forEach((w: any) => {
      const action = getText(w.action);
      if (action) parts.push(`${w.icon || '❌'} ${action}`);
    });
  }
  
  // 7. Economics (ONLY IF PRESENT)
  const econ = comm.main_message?.sections?.economics;
  if (econ?.net_benefit) {
    const roi = getText(econ.net_benefit.roi_message);
    if (roi) parts.push(`\n💰 ${roi}`);
  }
  
  // 8. Follow-up (ONLY IF PRESENT)
  const followUp = comm.main_message?.sections?.follow_up;
  if (followUp?.schedule?.length > 0) {
    parts.push('\n📅 Follow-up:');
    followUp.schedule.slice(0, 2).forEach((item: any) => {
      const check = getText(item.check);
      if (check) parts.push(`Day ${item.day}: ${check}`);
    });
  }
  
  // 9. Closing (ALWAYS SHOW)
  if (comm.main_message?.closing) {
    parts.push(`\n${comm.main_message.closing}`);
  }
  
  // If we got meaningful content, return it
  if (parts.length > 2) {
    return parts.join('\n').trim();
  }
  
  // Fallbacks
  // Language-specific fallbacks via property lookup
  const langMessageKey = `main_message_${lang}`;
  if ((comm as any)[langMessageKey]) return (comm as any)[langMessageKey];
  if (comm.main_message_en || comm.main_message) return comm.main_message_en || comm.main_message || '';
  if (comm.notification?.body) return comm.notification.body;
  
  return '';
}

function detectLanguage(text: string, fallback: string): string {
  // ✅ FIX: Detect number-only inputs (option selections like "1", "2", "३") 
  // For these, always use the fallback (session language) to maintain conversation continuity
  const isNumberOnlyInput = /^[१२३४1-4\s]+$/.test(text.trim());
  if (isNumberOnlyInput) {
    console.log(`🌐 [detectLanguage] Number-only input detected: "${text}" → using session language: ${fallback}`);
    return fallback;
  }
  
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasTamil = /[\u0B80-\u0BFF]/.test(text);
  const hasTelugu = /[\u0C00-\u0C7F]/.test(text);
  const hasBengali = /[\u0980-\u09FF]/.test(text);
  const hasGujarati = /[\u0A80-\u0AFF]/.test(text);
  const hasKannada = /[\u0C80-\u0CFF]/.test(text);
  const hasMalayalam = /[\u0D00-\u0D7F]/.test(text);
  const hasPunjabi = /[\u0A00-\u0A7F]/.test(text);

  if (hasDevanagari) return fallback === 'mr' ? 'mr' : 'hi';
  if (hasTamil) return 'ta';
  if (hasTelugu) return 'te';
  if (hasBengali) return 'bn';
  if (hasGujarati) return 'gu';
  if (hasKannada) return 'kn';
  if (hasMalayalam) return 'ml';
  if (hasPunjabi) return 'pa';
  
  return fallback;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRITICAL FIX: New transform function that uses PRE-GENERATED content
 * This ensures DB save and API response are IDENTICAL (no duplicate messages)
 * ═══════════════════════════════════════════════════════════════════════════
 */
function transformOrchestratorResponseWithContent(
  response: OrchestratorResponse,
  preGeneratedContent: string,
  language: string,
  sessionId: string,
  startTime: number,
  actionsReturned: any[] | null,
  traceId: string,
  aiModelUsed?: string
): any {
  const responseTime = Date.now() - startTime;
  const comm = response.communication;

  // For DECISION_PROVIDED, use the pre-generated LLM-formatted content
  if (response.type === 'DECISION_PROVIDED') {
    // ═══════════════════════════════════════════════════════════════════════════
    // CANONICAL ADVISORY: Build structured JSON from decision_output
    // This enables the frontend to render rich advisory cards
    // ═══════════════════════════════════════════════════════════════════════════
    let structuredAdvisory: any = null;
    try {
      const decisionOutput = response.decision_output as any;
      const primaryDecision = decisionOutput?.primary_decision;
      if (primaryDecision?.rule_id) {
        const appDetails = primaryDecision.application_details || {};
        const richData = extractRichRuleData(primaryDecision, appDetails);
        
        // ═══ RULE ATOMICITY: Log advisory build trace for contamination detection ═══
        console.log(`🔍 [ADVISORY_BUILD_TRACE] rule_id=${richData.rule_id} | active_ingredient=${richData.active_ingredient || 'NONE'} | dosage_per_acre=${richData.dosage_per_acre || 'NONE'} | appDetails_rule=${appDetails.rule_id || 'NONE'}`);
        
        if (hasAdequateRuleContent(richData)) {
          const landAreaAcres = response.dataAudit?.land?.area_acres || undefined;
          const cropCtx: CropContext | undefined = response.dataAudit?.land?.days_since_sowing ? {
            days_since_sowing: response.dataAudit.land.days_since_sowing,
          } : undefined;
          const weatherMeta = decisionOutput?.metadata?.weather_context;
          const weather: WeatherContext | undefined = weatherMeta ? {
            temperature_celsius: weatherMeta.temperature,
            humidity_pct: weatherMeta.humidity,
            wind_speed_kmh: weatherMeta.wind_speed,
            rain_forecast_hours: weatherMeta.rain_forecast_hours,
            is_raining: weatherMeta.is_raining,
          } : undefined;
          
          const structuredResponse = buildDeterministicResponse(richData, landAreaAcres, cropCtx, weather);
          const secondaryDecisions = decisionOutput.secondary_decisions || decisionOutput.secondary_actions || [];
          let advisory = buildCanonicalAdvisory(structuredResponse, richData, secondaryDecisions);
          
          if (secondaryDecisions.length > 0) {
            advisory = buildMultiRuleAdvisory(advisory, secondaryDecisions);
          }
          
          structuredAdvisory = advisory;
          console.log(`📋 [CanonicalAdvisory] Built structured advisory for rule ${primaryDecision.rule_id}, decision=${advisory.diagnosis.response_decision}`);
        }
      }
    } catch (advisoryError) {
      console.warn('⚠️ [CanonicalAdvisory] Failed to build structured advisory:', advisoryError);
      // Non-fatal — response still works with text content
    }
    
    return {
      response: preGeneratedContent, // ← CRITICAL: Use exact same content as DB save
      sessionId: sessionId,
      language: language,
      responseTime: responseTime,
      dataAudit: response.dataAudit,
      actionsReturned: actionsReturned,
      structured_advisory: structuredAdvisory, // ← NEW: Canonical advisory JSON
      metadata: {
        type: 'decision',
        orchestrator_type: 'DECISION_PROVIDED', // Normalized enum
        confidence: response.metadata?.confidence,
        safety_status: response.metadata?.safety_status,
        rules_applied: response.metadata?.rules_applied,
        agents_used: response.metadata?.agents_used,
        decision_id: response.decision_id,
        trace_id: traceId,
        ai_model: aiModelUsed || 'template',
        actions_count: actionsReturned?.length || 0
      },
      quickReplies: generateQuickRepliesFromCommunication(comm, language, preGeneratedContent, actionsReturned, response.dataAudit),
      source: 'orchestrator_v1'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LANGUAGE INTEGRITY FIX (2026-06-17): For non-DECISION types (clarification,
  // photo_request, safety_blocked, escalation, llm_response, system_error) the
  // legacy transform re-reads `question.text_<lang>` / `blocked_reason.reason_<lang>`
  // etc. and silently falls back to `text_en` when the lang-specific field is
  // missing. That bypasses the force-translate pass we ran on `responseContent`
  // upstream — the DB row is saved in Marathi but the API returns English.
  //
  // Authoritative rule: `preGeneratedContent` is the SSOT for what the farmer
  // sees. The legacy transform still builds the metadata/quickReplies/options
  // envelope, but we ALWAYS overwrite `response` with the localized content
  // we already produced and saved to DB.
  // ═══════════════════════════════════════════════════════════════════════════
  const legacyPayload = transformOrchestratorResponse(response, language, sessionId, startTime);
  if (preGeneratedContent && typeof preGeneratedContent === 'string' && preGeneratedContent.trim().length > 0) {
    if (legacyPayload.response !== preGeneratedContent) {
      console.log(`🌐 [LangIntegrity] Overriding ${response.type} response with force-translated content (was ${legacyPayload.response?.length || 0} chars, now ${preGeneratedContent.length} chars, lang=${language})`);
    }
    legacyPayload.response = preGeneratedContent;
    if (legacyPayload.metadata) {
      legacyPayload.metadata.language_pipeline_override = true;
    }
  }
  return legacyPayload;
}

function transformOrchestratorResponse(
  response: OrchestratorResponse,
  language: string,
  sessionId: string,
  startTime: number
): any {
  const responseTime = Date.now() - startTime;

  switch (response.type) {
    case 'DECISION_PROVIDED':
      // Main success case - return AI advice
      const comm = response.communication;
      const mainMessage = getLocalizedMessage(comm, language);
      
      return {
        response: mainMessage,
        sessionId: sessionId,
        language: language,
        responseTime: responseTime,
        // NEW: Include data audit for frontend debugging cards
        dataAudit: response.dataAudit,
        metadata: {
          type: 'decision',
          orchestrator_type: 'DECISION_PROVIDED',
          confidence: response.metadata?.confidence,
          safety_status: response.metadata?.safety_status,
          rules_applied: response.metadata?.rules_applied,
          agents_used: response.metadata?.agents_used,
          decision_id: response.decision_id,
          trace_id: response.metadata?.trace_id
        },
        quickReplies: generateQuickRepliesFromCommunication(comm, language),
        source: 'orchestrator_v1'
      };

    case 'CLARIFICATION_QUESTION':
      // System needs more info - CRITICAL FIX: Handle both object and string formats
      const question = response.question;
      let questionText = '';
      
      // Handle the case where question might be a string (question_id) instead of object
      if (typeof question === 'string') {
        questionText = 'Please provide more details. Tell me more about your question.';
      } else {
        // Normal case: question is an object with text fields — prefer lang-specific, fallback to en
        questionText = (question as any)?.[`text_${language}`] || question?.text_en || 'Please provide more details.';
      }
      
      // Ensure we always have some response text
      if (!questionText) {
        questionText = 'Please provide more details.';
      }
      
      // ✅ CRITICAL FIX: Safe extraction of options from multiple possible locations
      // Priority: question.options > communication.options > empty array
      const rawOptions = (typeof question === 'object' && Array.isArray(question?.options)) 
        ? question.options 
        : (response.communication?.options && Array.isArray(response.communication.options))
          ? response.communication.options
          : [];
      
      // ✅ CRITICAL FIX: Safe array mapping with null checks +
      // LANGUAGE INTEGRITY (2026-06-17): prefer `label_<lang>` / `text_<lang>`
      // when the rule provides translated options, fall back to `label`.
      const pickOptionLabel = (o: any): string => {
        if (typeof o === 'string') return o;
        if (o && typeof o === 'object') {
          return o[`label_${language}`] || o[`text_${language}`] || o.label || o.text || String(o);
        }
        return String(o);
      };
      const safeQuickReplies = rawOptions
        .filter((o: any) => o != null)
        .map(pickOptionLabel);
      
      return {
        response: questionText,
        sessionId: sessionId,
        language: language,
        responseTime: responseTime,
        metadata: {
          type: 'clarification',
          orchestrator_type: 'CLARIFICATION_QUESTION',
          question_id: typeof question === 'string' ? question : question?.question_id,
          // ═══════════════════════════════════════════════════════════════════════════
          // CRITICAL FIX: Preserve observation_key for rule engine re-evaluation
          // Previously: Only label/value were passed, dropping observation_key
          // Now: Include observation_key, description, diagnostic_power for proper UI mapping
          // ═══════════════════════════════════════════════════════════════════════════
          options: rawOptions.map((o: any) => ({
            label: pickOptionLabel(o),
            value: typeof o === 'string' ? o : (o?.value || o?.label || String(o)),
            observation_key: typeof o === 'object' ? (o?.observation_key || o?.value) : undefined,
            description: typeof o === 'object' ? (o?.[`description_${language}`] || o?.description) : undefined,
            diagnostic_power: typeof o === 'object' ? o?.diagnostic_power : undefined
          })),
          selectionType: response.metadata?.selectionType || 'SINGLE_CHOICE',
          trace_id: response.metadata?.trace_id,
          validation_failed: response.metadata?.validation_failed,
          // Also include scope for UI context
          clarification_scope: response.metadata?.clarification_scope || 'GENERAL'
        },
        quickReplies: safeQuickReplies.length > 0 
          ? safeQuickReplies 
          : getDefaultQuickReplies(language),
        source: 'orchestrator_v1'
      };

    case 'PHOTO_REQUEST':
      // Need photo for diagnosis
      const photoInstr = response.photo_instructions;
      const photoText = (photoInstr as any)?.[`text_${language}`] || photoInstr?.text_en || 'Please send a photo.';
      
      return {
        response: photoText,
        sessionId: sessionId,
        language: language,
        responseTime: responseTime,
        metadata: {
          type: 'photo_request',
          tips: photoInstr?.tips
        },
        source: 'orchestrator_v1'
      };

    case 'SAFETY_BLOCKED':
      // Treatment blocked for safety
      const blockedReason = response.blocked_reason;
      const blockedText = (blockedReason as any)?.[`reason_${language}`] || blockedReason?.reason_en || 'This treatment is not safe.';
      
      let alternativesText = '';
      if (response.alternatives && response.alternatives.length > 0) {
        alternativesText = '\n\nSafe alternatives:\n' + 
          response.alternatives.map(a => `• ${a.product_name}: ${a.why_safer}`).join('\n');
      }
      
      return {
        response: blockedText + alternativesText,
        sessionId: sessionId,
        language: language,
        responseTime: responseTime,
        metadata: {
          type: 'safety_blocked',
          alternatives: response.alternatives
        },
        source: 'orchestrator_v1'
      };

    case 'ESCALATION_REQUIRED':
      // Need expert help
      const esc = response.escalation;
      const escText = (esc as any)?.[`message_${language}`] || esc?.message_en || 'Connecting you with an expert.';
      
      return {
        response: escText,
        sessionId: sessionId,
        language: language,
        responseTime: responseTime,
        metadata: {
          type: 'escalation',
          level: esc?.level,
          expert_type: esc?.expert_type,
          sla_hours: esc?.sla_hours
        },
        source: 'orchestrator_v1'
      };

    case 'SYSTEM_ERROR':
    default:
      // CRITICAL FIX: Try to provide helpful response instead of error
      // Use fallback advice from error response if available
      const fallbackAdvice = response.error?.fallback_advice;
      
      // Build a helpful message instead of just "sorry"
      const helpfulMessage = `🙏 Working on your question.

${fallbackAdvice || 'Please ask your question again or provide more details.'}

📋 Help me help you:
• What is your crop?
• What is the problem?
• Can you send a photo?`;
      
      return {
        response: helpfulMessage,
        sessionId: sessionId,
        language: language,
        responseTime: responseTime,
        metadata: {
          type: 'clarification_needed',
          error: response.error?.message
        },
        quickReplies: getDefaultQuickReplies(language),
        source: 'orchestrator_v1'
      };
  }
}

function getLocalizedMessage(comm: any, language: string): string {
  if (!comm) return '';
  
  // Use the same flattening logic for consistency
  const flattened = flattenCommunicationToText(comm, language);
  if (flattened) return flattened;
  
  // Legacy fallback: Try to get language-specific message via dynamic key
  const langMsg = comm[`main_message_${language}`];
  if (langMsg) return langMsg;
  
  // Fallback to main_message
  return comm.main_message || '';
}

/**
 * CRITICAL FIX: Generate context-aware follow-up questions based on:
 * 1. The actual AI response content
 * 2. The actions returned (pest/disease/fertilizer)
 * 3. The land and crop context
 * 4. User's preferred language
 */
function generateQuickRepliesFromCommunication(
  comm: any, 
  language: string, 
  responseContent?: string,
  actionsReturned?: any[],
  dataAudit?: any
): string[] {
  const lang = language;
  
  // If communication has explicit follow-up options, use them
  if (comm?.follow_up_options && Array.isArray(comm.follow_up_options) && comm.follow_up_options.length > 0) {
    return comm.follow_up_options.slice(0, 4);
  }
  
  // CONTEXT-AWARE GENERATION based on response content
  const questions: string[] = [];
  const content = responseContent || '';
  const lowerContent = content.toLowerCase();
  
  // Get crop name for personalized questions
  const cropName = dataAudit?.land?.current_crop || dataAudit?.crop_schedule?.crop_name || '';
  
  // Detect topics from response content
  const hasPest = /pest|कीट|कीड|किडा|borer|aphid|mites|whitefly|bollworm|stem.*borer|shoot.*borer|early.*shoot|trichogramma/i.test(lowerContent);
  const hasDisease = /disease|रोग|blight|rust|mildew|fungus|bacterial|virus|yellowing|wilting|rot|dead.*heart/i.test(lowerContent);
  const hasFertilizer = /fertilizer|खाद|खत|urea|dap|npk|nitrogen|potash|phosphorus|nutrient/i.test(lowerContent);
  const hasIrrigation = /water|पानी|पाणी|irrigation|सिंचाई|drip|sprinkler/i.test(lowerContent);
  const hasSpray = /spray|फवारणी|छिड़काव|treatment|उपचार/i.test(lowerContent);
  const hasDiagnosis = /diagnos|तपास|निदान|symptom|लक्षण|check|confirm|possible.*cause|संभाव्य/i.test(lowerContent);
  
  // Check actions returned for more context
  const primaryActionType = actionsReturned?.[0]?.action_type || actionsReturned?.[0]?.action || '';
  const hasChemicalAction = /SPRAY|PESTICIDE|FUNGICIDE|INSECTICIDE/i.test(primaryActionType);
  const hasBiologicalAction = /BIOLOGICAL|TRICHOGRAMMA|IPM|INTEGRATED/i.test(primaryActionType);
  
  // Generate language-specific context-aware questions
  // English-only context-aware questions — LLM narration layer translates at runtime
  if (hasPest || hasDisease || hasSpray) {
    questions.push(`💊 When should I spray ${cropName || 'my crop'} again?`);
    questions.push('💰 How much crop loss will this treatment prevent?');
    if (hasBiologicalAction) {
      questions.push('🦠 Where can I get Trichogramma cards?');
    }
  }
  if (hasDiagnosis) {
    questions.push('🔍 How can I confirm which cause is affecting my crop?');
    questions.push('📸 Should I send a photo for diagnosis?');
  }
  if (hasFertilizer) {
    questions.push(`📊 How much fertilizer should I use for ${cropName || 'my crop'}?`);
    questions.push('💵 How much will yield increase with this fertilizer?');
  }
  if (hasIrrigation) {
    questions.push('💧 When should I water next?');
    questions.push('🌧️ Should I water even if it rains?');
  }
  if (questions.length < 3) {
    questions.push('📅 What should I do first thing tomorrow?');
  }
  if (questions.length < 3) {
    questions.push('📈 How is my crop growth progressing?');
  }
  
  // Return up to 4 unique questions
  const uniqueQuestions = [...new Set(questions)];
  return uniqueQuestions.slice(0, 4);
}

function getDefaultQuickReplies(_language: string): string[] {
  // English-only — LLM narration translates at runtime
  return [
    '🌅 What to do today?',
    '💧 When to water?',
    '🌾 How is my crop?',
    '📅 Next task?'
  ];
}

// Legacy training data collection handler
async function handleTrainingDataCollection(requestBody: any) {
  try {
    const { messageId, tenantId, farmerId } = requestBody;

    if (!messageId || !tenantId || !farmerId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: messageId, tenantId, farmerId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: message, error: messageError } = await supabase
      .from('ai_chat_messages')
      .select('*')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .eq('farmer_id', farmerId)
      .single();

    if (messageError || !message) {
      return new Response(
        JSON.stringify({ error: 'Message not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark as training candidate
    await supabase
      .from('ai_chat_messages')
      .update({ is_training_candidate: true, training_processed: false })
      .eq('id', messageId);

    return new Response(
      JSON.stringify({ success: true, message: 'Training data collected', messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in training data collection:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to collect training data' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
