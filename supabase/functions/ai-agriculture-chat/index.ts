/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (audit trail — newest first, keep entries short)
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-08-02 18:02 UTC — PERF: start farmer-profile read alongside orchestrator
 *   and share request-local market-product promises with formatter fallbacks.
 * 2026-07-28 14:35 UTC — FIX E2: fresh-query clarification state reset
 *   (round counter + asked keys cleared when no pending options, no option
 *   tap and intent is not CLARIFICATION_REPLY/OPTION_SELECTED).
 * 2026-07-27 09:00 UTC — Track 2/3: cumulative evidence ledgers

 *   (confirmed_observation_keys / asked_observation_keys / round counter)
 *   persisted in decision_tracking + CLARIFICATION_ROUND_EXHAUSTED loop guard
 *   that escalates instead of re-rendering an already-asked option set.
 * 2026-07-26 18:40 UTC — option_selected=true may no longer coexist with
 *   awaiting_clarification when the outgoing card repeats the option set the
 *   farmer just answered; that turn is forced to decision_in_progress.
 * 2026-07-26 12:00 UTC — R4/R6: Q3 rescue now reads the canonical SessionSSOT;
 *   Layer 14 DB-first fallback hydrates empty CLARIFICATION_QUESTION responses
 *   from DB observation tables + system_config intro text (no raw
 *   i18n keys, no LLM); added [TURN_START]/[TURN_END] boundary logs.
 * 2026-07-09 03:15 UTC — FIX 2 (GRAPH_HANDOFF_CHECK). New audit log in
 *   [ORCHESTRATOR_EXIT] compares snapshot vs canonical-state vs exit
 *   counters and emits [GRAPH_CONTRACT_VIOLATION] on drift (no throw;
 *   response already framed). Makes graph→state handoff greppable.
 * ═══════════════════════════════════════════════════════════════════════════
 */
// FILE:      supabase/functions/ai-agriculture-chat/index.ts

// BUILD_TAG bumps force the edge runtime to pick up dependent module changes
// (e.g. intent-classifier v4 canonical-intent whitelist). Visible in cold-start logs.
const BUILD_TAG = "ai-agri-chat::cultivation-lane-scope::2026-08-04T17:40Z";
console.log(`[ai-agriculture-chat] BOOT ${BUILD_TAG}`);
// [GRAPH_GATE_BUILD] — grep marker so an uploaded log can prove whether the
console.log('[GRAPH_GATE_BUILD] rev=mandatory-graph-gate-v1 hasMandatoryGate=true hasSequenceGuard=true hasOrchestratorExit=true');


// XHR polyfill removed to reduce bundle size - Deno fetch is used everywhere
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { guardTenantAccess } from '../_shared/tenantAccessGuard.ts';
import { getLanguageName, getScriptRegex, isDevanagariLanguage } from './utils/language-utils.ts';
import { loadFarmerProfileLite, getFarmerAddressing, type FarmerAddressing } from '../_shared/farmerAddressing.ts';

// Import orchestrator
import { AIAgentOrchestrator, requiresAgronomicReasoningIntent } from './agents/orchestrator.ts';
import type { OrchestratorResponse } from './agents/orchestrator.ts';
import { blockStageWriteIfLocked, isBiologicalStateLocked } from './agents/biological-state.ts';
import { getRuntimeTraceCollector, resetRuntimeTraceCollector } from './runtime/runtime-trace-collector.ts';
import { ensureObservationSelectorContract, attemptDbClarificationRescue } from './runtime/observation-selector-contract.ts';
import { getSessionSSOT } from './runtime/session-ssot.ts';


// CANONICAL ADVISORY: Build structured advisory JSON for frontend rendering
import { buildCanonicalAdvisory, buildMultiRuleAdvisory } from './agents/canonical-advisory-schema.ts';
import { extractRichRuleData, buildDeterministicResponse, hasAdequateRuleContent } from './agents/deterministic-response-builder.ts';
import type { WeatherContext, CropContext } from './agents/deterministic-response-builder.ts';

// PHASE 5: Import LLM Response Formatter for natural language generation
import { formatRecommendationsWithLLM, sanitizeFarmerResponse } from './agents/llm-response-formatter.ts';
import type { LLMFormatterInput, LLMFormatterOutput } from './agents/llm-response-formatter.ts';

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
import {
  lookupMarketProductsMemoized,
  formatMarketProducts,
  type MarketProductMemo,
} from './agents/market-product-lookup.ts';

// SYMBOLIC BRAIN: Import validation from decision representation
import { validateLLMOutputIntegrity } from './agents/decision-representation.ts';

// PHASE 11: Import Unified Decision Gate (P1-4 fix - single gate)
import { 
  evaluateUnifiedGate,
  applySuppressionGuard,
  type UnifiedGateInput
} from './decision/unified-decision-gate.ts';
import {
  ResponseMode,
  GateStatus,
  GateAction
} from './decision/authority-types.ts';
import {
  generateObservationOnlyResponse,
  generateYoungCropMonitoringResponse
} from './decision/prescription-gate-enforcer.ts';
import {
  generateDiagnosticEscalationResponse,
  type DiagnosticEscalationInput
} from './decision/diagnostic-escalation-generator.ts';

// PHASE 11.1: Context Authority Reconciliation
import { 
  resolveFinalRenderContext,
  type CropContextAuthority
} from './decision/context-authority.ts';


// PHASE F: Cold-start self-check — asserts gates and SSOT are wired
import { runPipelineSelfCheck } from './decision/pipeline-self-check.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token, x-client-domain, if-none-match, origin, cache-control, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// REQUEST DEDUPLICATION GUARD

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

// PRODUCTION FIX: Rich Application Details Builder
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

let orchestrator: AIAgentOrchestrator | null = null;

function getOrchestrator(): AIAgentOrchestrator {
  if (!orchestrator) {
    orchestrator = new AIAgentOrchestrator();
  }
  return orchestrator;
}

// Generate unique trace_id for request tracing
function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `trace_${timestamp}_${random}`;
}

function isSchemaColumnError(error: any): boolean {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return error?.code === 'PGRST204'
    || error?.code === '42703'
    || message.includes('column') && (message.includes('schema cache') || message.includes('does not exist') || message.includes('not found'));
}

function normalizeTraceConfidence(raw: any): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const scaled = n > 1 && n <= 100 ? n / 100 : n;
  return Math.max(0, Math.min(1, scaled));
}

async function persistRuntimeTraceSafetyNet(params: {
  supabase: any;
  traceLabel: string;
  tenantId: string;
  farmerId: string;
  landId?: string | null;
  sessionId?: string | null;
  farmerMessage: string;
  detectedLanguage: string;
  startTime: number;
  responseType?: string | null;
  agentsUsed?: string[];
  cropCode?: string | null;
  growthStage?: string | null;
}): Promise<string | null> {
  try {
    const _rtc = getRuntimeTraceCollector();
    if (!_rtc) return null;
    if (!params.supabase) {
      console.warn(`⚠️ [SafetyNet] No Supabase client available; trace=${_rtc.header.trace_id}`);
      return null;
    }

    const _persistedId = _rtc.persistedDecisionId || await _rtc.persistDecisionLog(params.supabase, {
      tenant_id: params.tenantId,
      farmer_id: params.farmerId,
      land_id: params.landId ?? null,
      farmer_message: params.farmerMessage,
      processing_time_ms: Date.now() - params.startTime,
    });

    if (!_persistedId) {
      console.warn(`⚠️ [SafetyNet] persistDecisionLog returned null (tenant=${params.tenantId ?? 'NULL'}) trace=${_rtc.header.trace_id}`);
      return null;
    }

    const _auditPatch = {
      symbolic_decision_id: _persistedId,
      execution_id: _rtc.header.execution_id,
      pipeline_version: _rtc.header.pipeline_version,
      graph_version: _rtc.header.graph_version,
      runtime_version: _rtc.header.runtime_version,
    };

    let { data: _auditRows, error: _auditUpdateError } = await params.supabase
      .from('ai_chat_audit_logs')
      .update(_auditPatch)
      .eq('trace_id', _rtc.header.trace_id)
      .select('id');

    if (_auditUpdateError && isSchemaColumnError(_auditUpdateError)) {
      const _retryStamp = await params.supabase
        .from('ai_chat_audit_logs')
        .update({ symbolic_decision_id: _persistedId })
        .eq('trace_id', _rtc.header.trace_id)
        .select('id');
      _auditRows = _retryStamp.data;
      _auditUpdateError = _retryStamp.error;
    }

    if (_auditUpdateError) {
      console.warn(`⚠️ [SafetyNet] ai_chat_audit_logs stamp failed (${_auditUpdateError.code}): ${_auditUpdateError.message}`);
    }

    if (_auditUpdateError || !_auditRows || _auditRows.length === 0) {
      const _safeLang = ['mr', 'hi', 'en'].includes(params.detectedLanguage) ? params.detectedLanguage : 'en';
      const _auditInsertData: Record<string, any> = {
        turn_id: `runtime_trace_${_rtc.header.execution_id}`,
        session_id: params.sessionId || `runtime_trace_${_rtc.header.execution_id}`,
        farmer_id: params.farmerId,
        tenant_id: params.tenantId,
        trace_id: _rtc.header.trace_id,
        farmer_message: params.farmerMessage,
        detected_language: _safeLang,
        intent_label: _rtc.context?.intent?.code ?? params.responseType ?? null,
        observations: [],
        nlu_confidence: normalizeTraceConfidence(_rtc.context?.intent?.confidence),
        locked_intent: _rtc.context?.intent?.code ?? null,
        allowed_scopes: [],
        forbidden_actions: [],
        symbolic_decision_id: _persistedId,
        rules_fired: [],
        actions_returned: [],
        actions_filtered_out: [],
        validation_passed: true,
        validation_errors: [],
        response_source: params.responseType === 'CLARIFICATION_QUESTION' || params.responseType === 'clarification' ? 'CLARIFICATION' : 'SYMBOLIC_TEMPLATE',
        response_language_match: true,
        processing_time_ms: Date.now() - params.startTime,
        agents_used: params.agentsUsed ?? [],
        land_id: params.landId ?? null,
        crop_code: params.cropCode ?? null,
        growth_stage: params.growthStage ?? null,
        ..._auditPatch,
      };
      let { error: _auditInsertError } = await params.supabase.from('ai_chat_audit_logs').insert(_auditInsertData);
      if (_auditInsertError && isSchemaColumnError(_auditInsertError)) {
        delete _auditInsertData.execution_id;
        delete _auditInsertData.pipeline_version;
        delete _auditInsertData.graph_version;
        delete _auditInsertData.runtime_version;
        const _retry = await params.supabase.from('ai_chat_audit_logs').insert(_auditInsertData);
        _auditInsertError = _retry.error;
      }
      if (_auditInsertError) {
        console.warn(`⚠️ [SafetyNet] ai_chat_audit_logs insert failed (${_auditInsertError.code}): ${_auditInsertError.message}`);
      }
    }

    console.log(`✅ [SafetyNet] ${params.traceLabel} persisted decision_id=${_persistedId} trace=${_rtc.header.trace_id}`);
    return _persistedId;
  } catch (_e: any) {
    console.warn(`⚠️ [SafetyNet] RuntimeTrace safety-net crashed: ${_e?.message || _e}`);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // PHASE F: Cold-start self-check (memoized — runs once per cold start).
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    await runPipelineSelfCheck({ supabase: sb });
  } catch (e) {
    console.error('[PIPELINE_SELF_CHECK] threw', e instanceof Error ? e.message : e);
  }


  const startTime = Date.now();
  const traceId = generateTraceId();
  let dedupeKey: string | null = null;
  let currentSessionIdForError: string | null = null;
  
  console.log(`\n🔍 [${traceId}] ═══════════════════════════════════════════════════`);
  console.log(`🔍 [${traceId}] REQUEST START`);
  // R6 — turn boundary marker (paired with [TURN_END]) for log-replay audits.
  console.log(`[TURN_START] trace=${traceId} at=${new Date().toISOString()}`);


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

    // PHASE 5 SECURITY GUARD: JWT + tenant + farmer-spoof check (one call)
    const guard = await guardTenantAccess(req);
    if (guard instanceof Response) return guard;

    // metadata.* overrides are still honored, but only after the guard has
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

    // RATE LIMITING
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

    // REQUEST DEDUPLICATION: Prevent double-tap duplicate processing
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

    // SUBSCRIPTION QUOTA — atomic 20-per-day check (IST-aware via DB function)
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

    // CRITICAL: Enforce sessionId ↔ landId binding to prevent cross-land contamination
    let currentSessionId = sessionId;
    const requestedLandId = landId || null;
    
    if (currentSessionId) {
      // P0-A CRITICAL: VALIDATE sessionId belongs to this landId
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

    // FETCH SESSION STATE + CONVERSATION HISTORY - CRITICAL for context continuity
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
      // SYMBOLIC IDENTITY: per-index observation_code captured at clarification render time
      pending_clarification_observation_keys?: string[];
      // STRUCTURED SSOT: full option records preserving canonical observation_key
      pending_clarification_options_structured?: Array<{
        label: string;
        value: string;
        observation_key: string;
        observation_id?: string;
        observation_code?: string;
        hypothesis_id?: string;
        hypothesis_condition_id?: string;
        graph_version?: string;
        source?: string;
        diagnostic_power?: string;
      }>;
      // P0-3 FIX: Add lockedCropContext for multi-turn context continuity
      lockedCropContext?: {
        crop_name?: string;
        growth_stage?: string;
        days_since_sowing?: number;
      };
      // PART 10: SESSION CONTINUITY — problems_discussed tracking
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
    
    if (currentSessionId) {
      // Fetch session metadata - land_id already validated in P0-A above
      const { data: existingSession } = await supabase
        .from('ai_chat_sessions')
        .select('metadata, land_id')
        .eq('id', currentSessionId)
        .single();
      
      // P0-A ENFORCEMENT: Session is ALREADY validated to match this land
      if (existingSession?.metadata?.decision_tracking) {
        sessionState = existingSession.metadata.decision_tracking;
        
        // CRITICAL FIX: Session Isolation - Clear pending options for GENERAL queries
        const isGeneralSession = !requestedLandId;
        const sessionHasLand = existingSession.land_id !== null;
        
        if (isGeneralSession && sessionState?.pending_clarification_options?.length > 0) {
          console.log(`🔒 [Session] ISOLATION: Clearing ${sessionState.pending_clarification_options.length} pending options for General session`);
          sessionState.pending_clarification_options = [];
          sessionState.pending_clarification_observation_keys = [];
          sessionState.pending_clarification_options_structured = [];
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
        
        // CRITICAL FIX: Auto-reset stuck session state
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
        console.log(`🧭 [CANONICAL_CONTEXT_TRACE] ═══ NEXT-TURN LOADED STATE ═══`);
        console.log(`   session_id:                 ${currentSessionId}`);
        console.log(`   loaded_locked_context:      ${JSON.stringify(sessionState?.lockedCropContext)}`);
        console.log(`   loaded_pending_options:     ${sessionState?.pending_clarification_options?.length || 0}`);
        console.log(`   loaded_pending_obs_keys:    ${JSON.stringify(sessionState?.pending_clarification_observation_keys)}`);
        console.log(`   loaded_decision_state:      ${sessionState?.decision_state}`);
        console.log(`   ═══════════════════════════════════════════`);
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

    // EXTRACT USER MESSAGE - WITH SAFETY GUARD
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



    // LANGUAGE DETECTION & CONSISTENCY CHECK
    const canonicalLanguage = detectLanguage(userMessageContent, language);
    const detectedLanguage = canonicalLanguage;

    // PHASE Y HARD GUARANTEE: initialize trace collector before any symbolic
    try {
      const earlyRuntimeTrace = resetRuntimeTraceCollector({
        trace_id: traceId,
        execution_mode: imageUrl ? 'live-vision' : 'live',
        started_at_ms: startTime,
      });
      earlyRuntimeTrace.setContext({
        tenant_id: finalTenantId,
        farmer_id: finalFarmerId,
        land_id: landId ?? null,
        language: detectedLanguage,
        intent: { code: 'PENDING_ORCHESTRATOR', confidence: null },
      });
    } catch (_traceInitErr) {
      console.warn(`[${traceId}] RuntimeTrace early init failed`, _traceInitErr);
    }
    
    // BUG-4 FIX: DEPRECATED - normalizeToEnglish only had ~23 hardcoded mappings,
    const preprocessedContent = userMessageContent;
    
    console.log(`🌐 [${traceId}] Language Pipeline:`, {
      raw_input_language: detectedLanguage,
      has_devanagari: /[\u0900-\u097F]/.test(userMessageContent),
      preprocessed_to_english: preprocessedContent.substring(0, 50),
      output_language_target: detectedLanguage
    });
    
    // SESSION CONTEXT INJECTION - Add previous recommendation context
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

    // PROACTIVE-ALERT NARRATION SHORT-CIRCUIT (v1)
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

        try {
          const proactiveTrace = getRuntimeTraceCollector();
          proactiveTrace?.setDecision({
            decision_type: 'alert_generation',
            action_type: 'PROACTIVE_ALERT_NARRATION',
            confidence: 1,
            reasoning: proactiveAlert.decision_reasoning || proactiveAlert.message_en || 'Proactive alert narration from Decision-Brain payload',
            output: { alert_id: proactiveAlert.id, category: proactiveAlert.alert_category, condition_code: td.condition_code },
          });
          await persistRuntimeTraceSafetyNet({
            supabase,
            traceLabel: 'PROACTIVE_ALERT_NARRATION',
            tenantId: finalTenantId,
            farmerId: finalFarmerId,
            landId: landId ?? null,
            sessionId: currentSessionId,
            farmerMessage: userMessageContent,
            detectedLanguage: lang,
            startTime,
            responseType: 'PROACTIVE_ALERT_NARRATION',
            agentsUsed: ['proactive_alert_narrator'],
            cropCode: metadata?.landContext?.crop_name ?? null,
            growthStage: metadata?.landContext?.current_crop_stage ?? null,
          });
        } catch (tracePersistErr) {
          console.warn(`[${traceId}] PROACTIVE_NARRATION trace persist error`, tracePersistErr);
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



    // CALL ORCHESTRATOR - THE NEW 9-AGENT FLOW WITH TRACE_ID AND SESSION STATE
    const orch = getOrchestrator();
    currentSessionIdForError = currentSessionId;
    const farmerProfilePromise = loadFarmerProfileLite(supabase, finalFarmerId, detectedLanguage);
    const marketProductMemo: MarketProductMemo = new Map();
    
    
    const orchestratorResponse: OrchestratorResponse = await orch.orchestrate(
      userMessageContent,
      currentSessionId,
      finalFarmerId,
      finalTenantId,
      {
        photoUrl: imageUrl,
        language: detectedLanguage,
        landId: landId,
        traceId: traceId,
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
          pendingClarificationObservationKeys: sessionState.pending_clarification_observation_keys || [],
          pendingClarificationOptionsStructured: sessionState.pending_clarification_options_structured || [],
          // CUMULATIVE EVIDENCE LEDGERS (2026-07-27) — survive across turns so
          // prior farmer selections are never re-offered / re-asked.
          confirmedObservationKeys: sessionState.confirmed_observation_keys || [],
          askedObservationKeys: sessionState.asked_observation_keys || [],
          clarificationRoundCounter: sessionState.clarification_round_counter || 0,
          // P1-BUG FIX: Pass lockedCropContext for OPTION_SELECTED context preservation
          lockedCropContext: sessionState.lockedCropContext,
          // PART 10: Pass problems_discussed for session continuity
          problems_discussed: sessionState.problems_discussed || [],
          last_query_hash: sessionState.last_query_hash,
          last_query_timestamp: sessionState.last_query_timestamp
        } : undefined
      }
    );

    console.log('✅ [Orchestrator] Response type:', orchestratorResponse.type);

    // OBSERVATION_REQUIRED CONTRACT ENFORCER
    let _observationContract: { promoted: boolean; hydrated: boolean; option_count: number; observation_required: boolean; reason: string | null } =
      { promoted: false, hydrated: false, option_count: 0, observation_required: false, reason: null };
    try {
      const _orchAnyForCtx: any = orch as any;
      const _graphScopeBlockedMeta = _orchAnyForCtx?._graphScopeBlocked ?? null;
      const _realObservationCountForContract = Array.isArray(_orchAnyForCtx?._lastRealObservations)
        ? _orchAnyForCtx._lastRealObservations.length
        : (Array.isArray((orchestratorResponse as any)?.metadata?.real_observations)
            ? (orchestratorResponse as any).metadata.real_observations.length
            : 0);
      _observationContract = await ensureObservationSelectorContract(orchestratorResponse, {
        supabase,
        // 2026-08-04 — lane + context threading so the applicability gate can enforce.
        // Mirrors the resolution chain used at orchestrator.ts:3486.
        cultivation_method:
          (orchestratorResponse as any)?.metadata?.canonicalContext?.cultivation_method ??
          (orchestratorResponse as any)?.metadata?.biological_state?.cultivation_method ??
          (orchestratorResponse as any)?.dataAudit?.land?.cultivation_method ??
          null,
        canonical_context:
          (orchestratorResponse as any)?.metadata?.canonicalContext ?? null,
        biological_state:
          (orchestratorResponse as any)?.metadata?.biological_state ??
          (orchestratorResponse as any)?.dataAudit?.land?.biological_state ??
          null,
        cropCode:
          (orchestratorResponse as any)?.dataAudit?.land?.current_crop ??
          (orchestratorResponse as any)?.metadata?.canonicalContext?.crop_code ??
          null,
        growthStage:
          (orchestratorResponse as any)?.dataAudit?.land?.growth_stage ??
          (orchestratorResponse as any)?.metadata?.canonicalContext?.growth_stage ??
          null,
        language: detectedLanguage,
        traceId,
        intentCode:
          (orchestratorResponse as any)?.metadata?.intent_code ??
          (orchestratorResponse as any)?.intent ??
          _orchAnyForCtx?._lastIntentCode ??
          null,
        daysSinceSowing:
          (orchestratorResponse as any)?.dataAudit?.land?.days_since_sowing ??
          (orchestratorResponse as any)?.metadata?.canonicalContext?.days_since_sowing ??
          null,
        realObservationCount: _realObservationCountForContract,
        graphReason: _graphScopeBlockedMeta
          ? `INSUFFICIENT_EVIDENCE:${_graphScopeBlockedMeta.reason ?? 'NO_HYPOTHESIS_SURVIVED_DB_GATES'}`
          : null,
      });
      if (_observationContract.promoted || _observationContract.hydrated) {
        console.log(
          `[OBSERVATION_CONTRACT] trace=${traceId} promoted=${_observationContract.promoted} hydrated=${_observationContract.hydrated} options=${_observationContract.option_count} reason=${_observationContract.reason}`,
        );
      }
    } catch (contractErr) {
      // OBSERVATION_CONTRACT_VIOLATION is fatal and greppable — do not swallow.
      if ((contractErr as Error).message?.startsWith('OBSERVATION_CONTRACT_VIOLATION')) {
        console.error(`[OBSERVATION_CONTRACT] ${(contractErr as Error).message}`);
        throw contractErr;
      }
      console.warn(`[OBSERVATION_CONTRACT] non-fatal: ${(contractErr as Error).message}`);
    }

    // CLARIFICATION LOOP GUARD (2026-07-27)
    let _clarificationRoundCounter = Number((sessionState as any)?.clarification_round_counter ?? 0);
    let _priorAskedObservationKeys: string[] = Array.isArray((sessionState as any)?.asked_observation_keys)
      ? ((sessionState as any).asked_observation_keys as string[]).map((k) => String(k).trim().toLowerCase()).filter(Boolean)
      : [];

    // FIX E2 (2026-07-28): Fresh-query state reset.
    {
      const _loadedPendingOptions =
        ((sessionState as any)?.pending_clarification_options?.length ?? 0) ||
        ((sessionState as any)?.pending_clarification_observation_keys?.length ?? 0);
      const _tapKeys =
        (metadata as any)?.selected_observation_keys ??
        (metadata as any)?.selectedObservationKeys ??
        (requestBody as any)?.selected_observation_keys ??
        null;
      const _intentCodeForReset = String(
        (orchestratorResponse as any)?.metadata?.intent_code ??
        (orchestratorResponse as any)?.intent ??
        (orch as any)?._lastIntentCode ??

        '',
      ).toUpperCase();
      const _isFreshDiagnosticQuery =
        (_loadedPendingOptions === 0) &&
        !Array.isArray(_tapKeys) &&
        (metadata as any)?.optionSelected !== true &&
        _intentCodeForReset !== 'CLARIFICATION_REPLY' &&
        _intentCodeForReset !== 'OPTION_SELECTED';
      if (_isFreshDiagnosticQuery && (_clarificationRoundCounter > 0 || _priorAskedObservationKeys.length > 0)) {
        console.log(
          `[CLARIFICATION_STATE_RESET] trace=${traceId} reason=fresh_diagnostic_query ` +
          `prior_round=${_clarificationRoundCounter} prior_asked=${_priorAskedObservationKeys.length} ` +
          `intent=${_intentCodeForReset || 'UNKNOWN'} action=reset_to_round_0`,
        );
        _clarificationRoundCounter = 0;
        _priorAskedObservationKeys = [];
        // Do NOT clear pending_clarification_observation_keys itself — that
      }
    }
    try {

      const _isClarif = orchestratorResponse.type === 'CLARIFICATION_QUESTION' ||
        orchestratorResponse.type === 'CLARIFICATION_NEEDED';
      if (_isClarif) {
        const { getConfigNumber } = await import('./utils/db-ssot/system-config-cache.ts');
        const _maxRounds = Number(await getConfigNumber(supabase, 'max_clarification_rounds', 3)) || 3;
        const _outKeys = ((orchestratorResponse as any)?.question?.options ?? [])
          .map((o: any) => String(o?.observation_key ?? '').trim().toLowerCase())
          .filter((k: string) => k && k !== 'photo_upload');
        const _askedSet = new Set(_priorAskedObservationKeys);
        const _isSubsetOfAsked = _outKeys.length > 0 && _outKeys.every((k: string) => _askedSet.has(k));
        const _budgetExhausted = _clarificationRoundCounter >= _maxRounds;

        // FIX B3 (2026-07-28): Round-0 override for repeat_subset false-positive.
        const _netNew = (Array.isArray(_outKeys) ? _outKeys : [])
          .map((k: any) => String(k ?? '').trim().toLowerCase())
          .filter((k: string) => !!k && !_askedSet.has(k));
        const _isRound0 = _clarificationRoundCounter <= 0;
        const _hasNetNew = _netNew.length > 0;
        const _round0Bypass = _isRound0 && !_budgetExhausted && _isSubsetOfAsked && _outKeys.length > 0;
        const _netNewBypass = !_isRound0 && !_budgetExhausted && _hasNetNew;
        if (_round0Bypass) {
          console.log(
            `[CLARIFICATION_LOOP_OVERRIDE] trace=${traceId} round=${_clarificationRoundCounter} ` +
            `outgoing_count=${_outKeys.length} asked_persisted=${_priorAskedObservationKeys.length} ` +
            `reason=round0_bypass_persisted_asked action=emit_options_anyway`,
          );
          _clarificationRoundCounter += 1;
        } else if (_netNewBypass) {
          console.log(
            `[CLARIFICATION_LOOP_OVERRIDE] trace=${traceId} round=${_clarificationRoundCounter} ` +
            `outgoing_count=${_outKeys.length} net_new_count=${_netNew.length} ` +
            `net_new_keys=[${_netNew.join(',')}] asked_persisted=${_priorAskedObservationKeys.length} ` +
            `reason=net_new_options_available_round${_clarificationRoundCounter} action=emit_options_anyway`,
          );
          _clarificationRoundCounter += 1;
        } else if (_isSubsetOfAsked || _budgetExhausted) {

          console.error(
            `[CLARIFICATION_ROUND_EXHAUSTED] trace=${traceId} round=${_clarificationRoundCounter}/${_maxRounds} ` +
            `repeat_subset=${_isSubsetOfAsked} outgoing=[${_outKeys.slice(0, 6).join(',')}] ` +
            `asked=${_priorAskedObservationKeys.length} action=escalate_instead_of_reask`,
          );
          (orchestratorResponse as any).type = 'DIAGNOSTIC_ESCALATION';
          (orchestratorResponse as any).question = undefined;
          (orchestratorResponse as any).metadata = {
            ...((orchestratorResponse as any).metadata ?? {}),
            orchestrator_type: 'DIAGNOSTIC_ESCALATION',
            clarification_options: [],
            selectionType: undefined,
            escalation_reason: _isSubsetOfAsked ? 'REPEATED_CLARIFICATION_BLOCKED' : 'CLARIFICATION_BUDGET_EXHAUSTED',
          };
        } else {
          _clarificationRoundCounter += 1;
        }
      } else {
        _clarificationRoundCounter = 0;
      }
    } catch (loopGuardErr) {
      console.warn(`[CLARIFICATION_LOOP_GUARD] non-fatal: ${(loopGuardErr as Error).message}`);
    }


    // [ORCHESTRATOR_EXIT] audit + GRAPH_PIPELINE_BYPASSED invariant.
    try {
      const _orchAny: any = orch as any;
      const _graphExecuted: boolean = _orchAny?._graphExecuted === true;
      const _hypCount: number = Array.isArray(_orchAny?._graphHypothesisIds)
        ? _orchAny._graphHypothesisIds.length
        : 0;
      const _ruleCount: number = Array.isArray(_orchAny?._graphHypothesisRuleIds)
        ? _orchAny._graphHypothesisRuleIds.length
        : 0;
      const _evidenceFrozen: boolean = _orchAny?._evidenceFrozen === true;
      const _ruleResultExists: boolean = _orchAny?._ruleResultExists === true;
      const _intentUpper = String(
        (orchestratorResponse as any)?.metadata?.intent_code
          ?? (orchestratorResponse as any)?.intent
          ?? _orchAny?._lastIntentCode
          ?? '',
      ).toUpperCase();
      const _isDiagnosticIntent = requiresAgronomicReasoningIntent(_intentUpper);
      const _realObsCount: number = Array.isArray(_orchAny?._lastRealObservations)
        ? _orchAny._lastRealObservations.length
        : (Array.isArray((orchestratorResponse as any)?.metadata?.real_observations)
            ? (orchestratorResponse as any).metadata.real_observations.length
            : 0);
      const _path = String(orchestratorResponse.type ?? 'UNKNOWN');
      const _seq: number = Number(_orchAny?.__decisionGraphSequence ?? 0);
      console.log(
        `[ORCHESTRATOR_EXIT] trace=${traceId} path=${_path} intent=${_intentUpper || 'n/a'} ` +
        `graphExecuted=${_graphExecuted} hypotheses=${_hypCount} rules=${_ruleCount} ` +
        `ruleResult=${_ruleResultExists} evidenceFrozen=${_evidenceFrozen} realObs=${_realObsCount} ` +
        `graphSequence=${_seq}/5`,
      );

      // FIX 2 (GRAPH_HANDOFF_CHECK) — snapshot vs canonical-state vs exit must
      try {
        const _snap = _orchAny?._graphSnapshot;
        const _snapHyp: number = Array.isArray(_snap?.hypotheses) ? _snap.hypotheses.length : -1;
        const _snapRules: number = Array.isArray(_snap?.rules) ? _snap.rules.length : -1;
        const _csHyp: number = Number(_orchAny?.__conversationState?.hypotheses?.length ?? -1);
        const _mismatch =
          (_snapHyp >= 0 && _snapHyp !== _hypCount) ||
          (_snapRules >= 0 && _snapRules !== _ruleCount);
        console.log(
          `[GRAPH_HANDOFF_CHECK] trace=${traceId} snapshot_hyp=${_snapHyp} snapshot_rules=${_snapRules} ` +
          `exit_hyp=${_hypCount} exit_rules=${_ruleCount} cs_hyp=${_csHyp} ok=${!_mismatch}`,
        );
        if (_mismatch) {
          console.error(
            `[GRAPH_CONTRACT_VIOLATION] handoff drift trace=${traceId} ` +
            `snapshot=(${_snapHyp}/${_snapRules}) exit=(${_hypCount}/${_ruleCount})`,
          );
        }
      } catch (hcErr) {
        console.warn(`[GRAPH_HANDOFF_CHECK] non-fatal: ${(hcErr as Error).message}`);
      }
      // NOTE: These invariants previously `throw`-ed, converting silent
      if (_isDiagnosticIntent && _evidenceFrozen && !_graphExecuted) {
        console.error(
          `[GRAPH_PIPELINE_BYPASSED_WARN] exit_path=${_path} intent=${_intentUpper} ` +
          `realObs=${_realObsCount} evidenceFrozen=true graphExecuted=false trace_id=${traceId}`,
        );
      } else if (_isDiagnosticIntent && _evidenceFrozen && _graphExecuted && !_ruleResultExists) {
        console.error(
          `[GRAPH_PIPELINE_BYPASSED_WARN] exit_path=${_path} intent=${_intentUpper} ` +
          `realObs=${_realObsCount} evidenceFrozen=true graphExecuted=true ruleResult=false trace_id=${traceId}`,
        );
      } else if (_isDiagnosticIntent && _evidenceFrozen && _realObsCount > 0 && _seq < 4) {
        console.error(
          `[GRAPH_PIPELINE_BYPASSED_WARN] sequence_incomplete stage=${_seq}/5 ` +
          `exit_path=${_path} intent=${_intentUpper} realObs=${_realObsCount} trace_id=${traceId}`,
        );
      }

    } catch (auditErr) {
      if ((auditErr as Error).message?.startsWith('GRAPH_PIPELINE_BYPASSED')) throw auditErr;
      console.warn(`[ORCHESTRATOR_EXIT] audit non-fatal: ${(auditErr as Error).message}`);
    }

    // PHASE Y SAFETY NET: ensure a RuntimeTrace row lands in ai_decision_log
    await persistRuntimeTraceSafetyNet({
      supabase: (typeof (orch as any)?.getSupabase === 'function' ? (orch as any).getSupabase() : null) ?? supabase,
      traceLabel: 'ORCHESTRATOR_RESPONSE',
      tenantId: finalTenantId,
      farmerId: finalFarmerId,
      landId: landId ?? null,
      sessionId: currentSessionId,
      farmerMessage: userMessageContent,
      detectedLanguage,
      startTime,
      responseType: orchestratorResponse.type,
      agentsUsed: orchestratorResponse.metadata?.agents_used ?? [],
      cropCode: orchestratorResponse.dataAudit?.land?.current_crop ?? null,
      growthStage: orchestratorResponse.dataAudit?.land?.current_crop_stage ?? null,
    });



    // PHASE 3: STORE MESSAGES FOR TRAINING & ANALYSIS
    const responseTime = Date.now() - startTime;
    
    // PHASE 3A: COMPREHENSIVE FILTERING AUDIT WITH TRANSPARENT LOGGING
    
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
      
      // PRODUCTION HARDENING: PRIMARY DECISION INVARIANT
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
          
          // PRIORITY 1: Check for layered_rule_result.primary_decision (NEW CONTRACT)
          const layeredPrimaryDecision = rawDecisionOutput.layered_rule_result?.primary_decision;
          
          // BUG-1/BUG-6 FIX: Safety gate rules must NEVER be selected as
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
                console.error(`   generating SYSTEM_FALLBACK`);
                
                rawDecisionOutput.status = 'SYSTEM_FALLBACK';
                rawDecisionOutput.primary_decision = {
                  action_type: 'MONITOR_ONLY',
                  rule_id: 'INVARIANT_FALLBACK',
                  specific_action: 'CONTINUE_MONITORING',
                  target: {},
                  urgency: 'NON_URGENT',
                  timing: {
                    recommended_start: new Date().toISOString(),
                    recommended_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    weather_dependency: false,
                    reason: 'System fallback - primary decision invariant violated'
                  },
                  application_details: {
                    product_name: 'Continue monitoring',
                    product_type: 'CULTURAL',
                    concentration: 'Daily observation',
                    coverage_instructions: 'Monitor crop health and look for symptoms',
                    action_text: 'Continue monitoring your crop. If symptoms persist, upload a photo for diagnosis.',
                    reason_text: 'Insufficient information to provide specific recommendation.',
                    rule_id: 'INVARIANT_FALLBACK'
                  },
                  expected_outcomes: {
                    efficacy_percent: 100,
                    time_to_visible_effect_days: 'Ongoing',
                    success_indicators: ['Early detection of issues']
                  }
                };
                
                console.log(`   📋 INVARIANT_FALLBACK decision generated`);
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
    
    // PHASE 5: LLM RESPONSE FORMATTING & DELIVERY
    console.log(`\n📝 [${traceId}] ═══ PHASE 5: LLM RESPONSE FORMATTING ═══`);
    
    let responseContent: string;
    let llmFormatterOutput: LLMFormatterOutput | null = null;
    let aiModelUsed: string | undefined;
    
    // Calculate remaining time for timeout protection (25s total budget, minus time spent so far)
    const timeSpentSoFar = Date.now() - startTime;
    const remainingTime = Math.max(25000 - timeSpentSoFar, 5000); // At least 5s for formatting
    console.log(`   Time budget: ${remainingTime}ms remaining for response formatting`);
    
    // CRITICAL FIX: Check if Static Data Gate already handled this query
    const isStaticGateResponse = 
      orchestratorResponse.decision_output?.metadata?.template_type === 'STATIC_DIRECT' ||
      orchestratorResponse.communication?.metadata?.source === 'STATIC_DATA_GATE';
    
    if (isStaticGateResponse) {
      // Static Gate already generated the response - use it directly
      console.log(`   📊 [StaticGate] Using pre-generated response (NO LLM needed)`);
      responseContent = orchestratorResponse.communication?.main_message?.full_text?.[detectedLanguage] ||
                        orchestratorResponse.communication?.main_message?.full_text?.en ||
                        'Information not available';
    } else if (allActionsFiltered) {
      // Special response when all actions were filtered
      console.log(`   ⚠️ ALL actions filtered - generating explanation response`);
      responseContent = generateAllActionsFilteredResponse(actions_filtered_out, detectedLanguage);
    } else if (
      orchestratorResponse.type === 'DECISION_PROVIDED' &&
      orchestratorResponse.decision_output &&
      // T1 — DECISION_PROVIDED HARD INVARIANT (SAFETY CRITICAL)
      !(() => {
        const _do: any = orchestratorResponse.decision_output;
        const backed =
          (Array.isArray(actions_returned) && actions_returned.length > 0) ||
          !!_do?.metadata?.winner_rule_id ||
          !!_do?.winner_rule?.rule_id ||
          (Array.isArray(orchestratorResponse.metadata?.rules_applied) &&
            orchestratorResponse.metadata!.rules_applied.length > 0);
        if (!backed) {
          console.error(
            `[DECISION_WITHOUT_DB_BACKING][${traceId}] type=DECISION_PROVIDED actions=0 ` +
              `winner_rule=NONE rules_applied=0 action=llm_formatter_suppressed`,
          );
        }
        return !backed;
      })()
    ) {
      // PHASE-14: Check for Stage Fallback Response first
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
        // Phase H — SSOT_TRACE: surface every source that competed for crop/stage
        console.log(
          `[SSOT_TRACE][${traceId}] landContext_source=${landContextSource} ` +
            `dataAudit_crop=${orchestratorResponse.dataAudit?.land?.current_crop ?? 'NULL'} ` +
            `locked_crop=${lockedCropCtx?.crop_name ?? 'NULL'} ` +
            `session_last_crop=${sessionState?.last_crop ?? 'NULL'}`
        );
        if (landContext) {
          console.log(`      Crop: ${landContext.current_crop}, Stage: ${landContext.growth_stage}, Days: ${landContext.days_since_sowing}`);
        }
        
        // PHASE 11.1: CONTEXT AUTHORITY RECONCILIATION
        const renderContext = resolveFinalRenderContext(
          landContext,
          lockedCropCtx as CropContextAuthority | null | undefined,
          orchestratorResponse.dataAudit
        );
        
        // If authority override was applied, update landContext for downstream usage
        if (renderContext.authority_override_applied && landContext) {
          console.log(`   🔄 [Reconciliation] Updating landContext with authority values`);
          landContext.current_crop = renderContext.crop_name;
          // PHASE 1 — biological SSOT lock takes precedence over render authority for stage/DAS.
          if (!blockStageWriteIfLocked(landContext, 'render-authority-reconciliation', renderContext.growth_stage)) {
            landContext.growth_stage = renderContext.growth_stage;
            landContext.days_since_sowing = renderContext.days_since_sowing;
          }
        }
        
        // Use renderContext values for response generation (authority-reconciled)
        const finalCropName = renderContext.crop_name;
        const finalGrowthStage = renderContext.growth_stage;
        const finalDaysSinceSowing = renderContext.days_since_sowing;
        
        // PHASE 11 + P1-4: UNIFIED DECISION GATE - Single point of treatment validation
        
        // CRITICAL FIX: Extract symptom_keys from SSOT (decision_output) first
        const decisionOutput = orchestratorResponse.decision_output as Record<string, any> || {};
        const symptomKeysFromDecision = decisionOutput.symptom_keys || 
                                        decisionOutput.observation_keys ||
                                        decisionOutput.canonical_observations ||
                                        [];
        const symptomKeysFromMetadata = orchestratorResponse.metadata?.symptomKeys || [];
        const mergedSymptomKeys = [...new Set([...symptomKeysFromDecision, ...symptomKeysFromMetadata])];
        
        // CONFIDENCE BRIDGE: Extract symbolic confidence as SSOT for decision_confidence
        const rawSymbolicConfidence = orchestratorResponse.decision_output?.layered_rule_result
          ?.primary_decision?.weighted_confidence
          ?? orchestratorResponse.decision_output?.layered_rule_result
            ?.primary_decision?.confidence_score
          ?? 0;
        // BUG FIX: Guard against NaN from division-by-zero in rule evaluator
        const symbolicConfidence = isNaN(rawSymbolicConfidence) ? 0.5 : rawSymbolicConfidence;
        
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
          hypothesis_confidence: orchestratorResponse.decision_output?.hypothesis_result?.hypothesis_score ?? undefined
        } as any;
        
        // INVARIANT: If symbolic layer selected a primary decision, confidence must not be zero
        const primaryDecisionExists = !!(orchestratorResponse.decision_output?.primary_decision?.rule_id ||
          orchestratorResponse.decision_output?.layered_rule_result?.primary_decision?.rule_id);
        
        if (primaryDecisionExists && symbolicConfidence === 0) {
          console.error(`🚨 [INVARIANT] Confidence pipeline inconsistency: primary_decision exists but symbolic_confidence=0`);
          console.error(`   Forcing minimum confidence of 0.5 to prevent decision suppression`);
          unifiedGateInput.decision_confidence = 50;  // Safe floor
        }
        
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
          const decisionOutputSsot = orchestratorResponse.decision_output as Record<string, any> || {};
          const symbolicDecisionForGuard = {
            decision_brain_source: orchestratorResponse.decision_brain_source || decisionOutputSsot.decision_brain_source,
            // SSOT: Use decision_output fields first, fallback to metadata
            rules_fired: decisionOutputSsot.rules_applied || 
                         decisionOutputSsot.layered_rule_result?.rules_applied || 
                         orchestratorResponse.metadata?.rulesFired || [],
            actions_returned: decisionOutputSsot.actions_returned || 
                              orchestratorResponse.metadata?.actionsReturned || [],
            matched_responses: decisionOutputSsot.matched_responses || 
                               orchestratorResponse.metadata?.matchedResponses || []
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
        
        // If unified gate blocks treatments, use appropriate fallback response
        if (!unifiedGateResult.treatments_allowed) {
          console.log(`   ⚠️ Unified gate blocked treatments - using ${unifiedGateResult.response_mode} response`);
          
          if (unifiedGateResult.response_mode === ResponseMode.DIAGNOSTIC_ESCALATION) {
            // Q3 — SSOT propagation invariant. Before committing to an
            const _q3Ssot = getSessionSSOT(orchestratorResponse, orch);
            const _intentCodeResolved =
              _q3Ssot?.intent_code ??
              (orchestratorResponse as any)?.metadata?.intent_code ??
              (orchestratorResponse as any)?.intent ??
              (orch as any)?._lastIntentCode ??
              null;
            const _q3Crop = _q3Ssot?.crop_code ?? finalCropName;
            const _q3Stage = _q3Ssot?.growth_stage ?? finalGrowthStage;
            const _q3Das = typeof _q3Ssot?.days_since_sowing === 'number'
              ? _q3Ssot.days_since_sowing
              : finalDaysSinceSowing;
            const _ssotLockValid = !!(
              _q3Crop && _q3Stage &&
              typeof _q3Das === 'number' && _intentCodeResolved
            );
            if (_ssotLockValid && orchestratorResponse.type !== 'CLARIFICATION_QUESTION') {
              try {
                const _rescue = await attemptDbClarificationRescue(orchestratorResponse, {
                  supabase,
                  cropCode: _q3Crop,
                  growthStage: _q3Stage,
                  language: _q3Ssot?.language ?? detectedLanguage,
                  traceId,
                  intentCode: _intentCodeResolved,
                  daysSinceSowing: _q3Das,
                  realObservationCount: Array.isArray((orch as any)?._lastRealObservations)
                    ? (orch as any)._lastRealObservations.length
                    : 0,
                  graphReason: (orch as any)?._graphScopeBlocked?.reason ?? null,
                  session_ssot: _q3Ssot,
                } as any);

                if (_rescue.rescued) {
                  console.log(
                    `   ✅ [Q3] DB clarification rescue before escalation site=${_rescue.site} options=${_rescue.option_count}`,
                  );
                }
              } catch (e) {
                console.warn(`   ⚠️ [Q3] rescue attempt failed: ${(e as Error).message}`);
              }
            } else if (!_ssotLockValid) {
              console.error(
                `[INVARIANT_VIOLATION] site=OBSERVATION_CONTRACT_DEGRADE reason=SSOT_LOCK_LOST field=${!_q3Crop ? 'crop_code' : !_q3Stage ? 'growth_stage' : typeof _q3Das !== 'number' ? 'days_since_sowing' : 'intent_code'} trace=${traceId}`,
              );
            }

            // NEW: Expert-quality diagnostic escalation response
            console.log(`   🔬 DIAGNOSTIC_ESCALATION - generating expert response with hypotheses`);

            
            const escalationInput: DiagnosticEscalationInput = {
              language: detectedLanguage,
              crop_name: finalCropName || 'Unknown',
              growth_stage: finalGrowthStage || 'Unknown',
              days_since_sowing: finalDaysSinceSowing,
              symptom_keys: orchestratorResponse.metadata?.symptomKeys || [],
              matched_rules: orchestratorResponse.metadata?.matchedRules || [],
              current_confidence: unifiedGateResult.diagnostic_escalation?.current_confidence || 0.4,
              treatment_threshold: unifiedGateResult.diagnostic_escalation?.threshold_for_treatment || 0.7
            };
            
            responseContent = generateDiagnosticEscalationResponse(
              unifiedGateResult.diagnostic_escalation!,
              escalationInput
            );
            
            // Mark orchestrator response as DIAGNOSTIC_ESCALATION for frontend,
            if (orchestratorResponse.type !== 'CLARIFICATION_QUESTION') {
              orchestratorResponse.type = 'DIAGNOSTIC_ESCALATION' as any;
              orchestratorResponse.metadata = {
                ...orchestratorResponse.metadata,
                diagnostic_escalation: unifiedGateResult.diagnostic_escalation,
                orchestrator_type: 'DIAGNOSTIC_ESCALATION'
              };
            } else {
              console.log('   ⏭️ Skipping DIAGNOSTIC_ESCALATION mark — observation-contract already promoted CLARIFICATION_QUESTION');
            }
          } else if (unifiedGateResult.response_mode === ResponseMode.OBSERVATION) {
            // Young crop - use monitoring response with authority-reconciled values
            responseContent = generateYoungCropMonitoringResponse(
              detectedLanguage,
              finalCropName,
              finalGrowthStage,
              finalDaysSinceSowing
            );
          } else {
            // No confirmed diagnosis or authority block - use observation response
            responseContent = generateObservationOnlyResponse(
              detectedLanguage,
              finalCropName,
              unifiedGateResult.reason
            );
          }
          
          // Skip LLM formatting - use gate-generated response
          console.log(`   📋 Using unified gate fallback response (no LLM)`);
          if (renderContext.authority_override_applied) {
            console.log(`   ✅ Authority override ensured correct crop context in fallback response`);
          }

          // Second observation-selector contract pass — the unified gate may
          try {
            const _orchAnyForCtx2: any = orch as any;
            const _graphScopeBlockedMeta2 = _orchAnyForCtx2?._graphScopeBlocked ?? null;
            const _realObservationCountForContract2 = Array.isArray(_orchAnyForCtx2?._lastRealObservations)
              ? _orchAnyForCtx2._lastRealObservations.length
              : (Array.isArray((orchestratorResponse as any)?.metadata?.real_observations)
                  ? (orchestratorResponse as any).metadata.real_observations.length
                  : 0);
            const _postGate = await ensureObservationSelectorContract(orchestratorResponse, {
              supabase,
              cropCode:
                finalCropName ??
                (orchestratorResponse as any)?.dataAudit?.land?.current_crop ??
                (orchestratorResponse as any)?.metadata?.canonicalContext?.crop_code ??
                null,
              growthStage:
                finalGrowthStage ??
                (orchestratorResponse as any)?.dataAudit?.land?.growth_stage ??
                (orchestratorResponse as any)?.metadata?.canonicalContext?.growth_stage ??
                null,
              language: detectedLanguage,
              traceId,
              intentCode:
                (orchestratorResponse as any)?.metadata?.intent_code ??
                (orchestratorResponse as any)?.intent ??
                _orchAnyForCtx2?._lastIntentCode ??
                null,
              daysSinceSowing:
                finalDaysSinceSowing ??
                (orchestratorResponse as any)?.dataAudit?.land?.days_since_sowing ??
                null,
              realObservationCount: _realObservationCountForContract2,
              graphReason: _graphScopeBlockedMeta2
                ? `INSUFFICIENT_EVIDENCE:${_graphScopeBlockedMeta2.reason ?? 'NO_HYPOTHESIS_SURVIVED_DB_GATES'}`
                : 'INSUFFICIENT_EVIDENCE',
            });
            if (_postGate.promoted || _postGate.hydrated) {
              console.log(
                `[OBSERVATION_CONTRACT_POSTGATE] trace=${traceId} promoted=${_postGate.promoted} hydrated=${_postGate.hydrated} options=${_postGate.option_count} reason=${_postGate.reason}`,
              );
              // If we promoted to CLARIFICATION_QUESTION, prefer the question
              // text over the gate-generated escalation content.
              if ((orchestratorResponse as any).type === 'CLARIFICATION_QUESTION') {
                const q = (orchestratorResponse as any).question;
                if (q && typeof q === 'object' && (q.text_en || q.text)) {
                  responseContent = String(q[`text_${detectedLanguage}`] || q.text_en || q.text || responseContent);
                }
              }
            }
          } catch (postGateErr) {
            if ((postGateErr as Error).message?.startsWith('OBSERVATION_CONTRACT_VIOLATION')) {
              console.error(`[OBSERVATION_CONTRACT_POSTGATE] ${(postGateErr as Error).message}`);
            } else {
              console.warn(`[OBSERVATION_CONTRACT_POSTGATE] non-fatal: ${(postGateErr as Error).message}`);
            }
          }
        } else {
          // PRESCRIPTION GATE PASSED - Continue with LLM formatting
          
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
              // PHASE 1 — biological SSOT lock wins; only the resolver may set stage.
              if (landContext) {
                if (!blockStageWriteIfLocked(landContext, 'sanity-check-impossible-harvest', 'GERMINATION')) {
                  landContext.growth_stage = 'GERMINATION';
                }
              }

              // Also fix in dataAudit if present (only when SSOT is not locked)
              if (orchestratorResponse.dataAudit?.land && !isBiologicalStateLocked(landContext)) {
                orchestratorResponse.dataAudit.land.growth_stage = 'GERMINATION';
              }
            }
          }
        
          // Ensure decision_output includes rich SSOT fields (action_text/reason_text/knowledge_text)
          // so narration can always be generated from decision_rules, not templates.
          const decisionOutputForFormatting = orchestratorResponse.decision_output;
          hydrateDecisionOutputRichText(decisionOutputForFormatting);

          // ── Load farmer profile + respectful addressing (presentation-only)
          let farmerAddressing: FarmerAddressing | undefined;
          try {
            const profile = await farmerProfilePromise;
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
            market_product_memo: marketProductMemo,
            farmer_addressing: farmerAddressing,
          };
          
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
          
          // SOURCE VALIDATION GATE - Final check before response delivery
          if (llmFormatterOutput.validation_passed === false) {
            console.error(`🚫 [SOURCE VALIDATION] LLM output validation failed!`);
            console.error(`   Violations: ${llmFormatterOutput.validation_violations?.join(', ')}`);
            
            // Use template fallback instead of potentially incorrect LLM output
            console.log(`   📋 Falling back to template-based response for safety`);
            
            if (orchestratorResponse.decision_output?.primary_decision) {
              responseContent = sanitizeFarmerResponse(await buildFormattedRecommendationsList(
                orchestratorResponse.decision_output, 
                detectedLanguage,
                supabase,
                marketProductMemo
              ));
            } else {
              responseContent = await getResponseContent(orchestratorResponse, detectedLanguage);
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
            supabase,
            marketProductMemo
          ));
        } else {
          responseContent = await getResponseContent(orchestratorResponse, detectedLanguage);
        }
      }
      } // End of STAGE_FALLBACK else block
    } else {
      // R4b · Layer 14 — DB-first fallback for empty CLARIFICATION_QUESTION.
      try {
        const response: any = orchestratorResponse as any;
        const _l14Ssot = getSessionSSOT(response, orch);
        const _isClarification = response?.type === 'CLARIFICATION_QUESTION';
        const _hasComm = !!response?.communication?.main_message
          && Object.keys(response.communication.main_message).length > 0;
        const _hasOptions = (Array.isArray(response?.options) && response.options.length > 0)
          || (Array.isArray(response?.question?.options) && response.question.options.length > 0);

        if (_isClarification && !_hasComm && !_hasOptions && _l14Ssot) {
          const _lang = _l14Ssot.language || 'en';

          // 1. Load fallback questions using the same DB-driven mapper as R3.
          const _rescueResult = await attemptDbClarificationRescue(response, {
            supabase,
            cropCode: _l14Ssot.crop_code,
            growthStage: _l14Ssot.growth_stage,
            language: _lang,
            traceId: _l14Ssot.trace_id,
            intentCode: _l14Ssot.intent_code,
            daysSinceSowing: _l14Ssot.days_since_sowing,
            realObservationCount: Array.isArray((orch as any)?._lastRealObservations)
              ? (orch as any)._lastRealObservations.length
              : 0,
            graphReason: (response?.decision_output as any)?.graph_gap ?? null,
            session_ssot: _l14Ssot,
          } as any);

          // 2. Load intro sentence template from system_config (DB, pre-translated).
          let _introText: string | null = null;
          try {
            const { data: _introRow } = await supabase
              .from('system_config')
              .select('config_key, config_value')
              .in('config_key', [`clarification_intro_${_lang}`, 'clarification_intro_en']);
            const _byKey = new Map<string, any>();
            for (const r of _introRow ?? []) _byKey.set(String(r.config_key), r.config_value);
            const _pick = _byKey.get(`clarification_intro_${_lang}`) ?? _byKey.get('clarification_intro_en') ?? null;
            _introText = typeof _pick === 'object' && _pick !== null ? (_pick.value ?? null) : (_pick ?? null);
          } catch (introErr) {
            console.warn(`[POSTPROC_DB_FALLBACK] intro load failed: ${(introErr as Error).message}`);
          }

          // 3. Populate response.communication with DB intro text (never a raw i18n key).
          if (_introText) {
            response.communication = response.communication && typeof response.communication === 'object'
              ? response.communication
              : {};
            response.communication.main_message = {
              text: String(_introText),
              language: _lang,
              source: 'system_config',
            };
            console.log(
              `[POSTPROC_DB_FALLBACK] site=intro_from_system_config intent=${_l14Ssot.intent_code} ` +
              `language=${_lang} rescue_options=${_rescueResult?.option_count ?? 0} trace=${_l14Ssot.trace_id}`,
            );
          } else {
            console.error(
              `[POSTPROC_DB_FALLBACK] MISSING SYSTEM_CONFIG intro clarification_intro_${_lang} / clarification_intro_en — ` +
              `frontend may render raw key. Seed system_config with R5.`,
            );
          }
        }
      } catch (l14Err) {
        console.warn(`[POSTPROC_DB_FALLBACK] non-fatal: ${(l14Err as Error).message}`);
      }

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
    
    // PHASE 6 (POST-LLM): NARRATION BREACH VALIDATION
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
    
    // ─────────────────────────────────────────────────────────────────────
    // P0-B.3 + P0-C — ZERO-CODE HONESTY GUARD (no generic English template).
    // When the symbolic brain produced NOTHING (no DB actions, no decision
    // output, no clarification options and no symbolic codes) we must not ship
    // a confident-looking generic answer. Emit an honest, DB-sourced message
    // ALREADY IN THE FARMER'S LANGUAGE (system_config not_understood_<lang>)
    // so forceTranslate never has to run. No agronomy is asserted here.
    try {
      const _zc: any = orchestratorResponse as any;
      const _noActions = !Array.isArray(actions_returned) || actions_returned.length === 0;
      const _noDecision = !_zc?.decision_output
        || Object.keys(_zc.decision_output || {}).length === 0;
      const _noOptions = !(Array.isArray(_zc?.options) && _zc.options.length > 0)
        && !(Array.isArray(_zc?.question?.options) && _zc.question.options.length > 0);
      const _noCodes = !(Array.isArray(_zc?.observation_codes) && _zc.observation_codes.length > 0);

      if (_noActions && _noDecision && _noOptions && _noCodes) {
        const _lang = (detectedLanguage || 'en').toLowerCase();
        let _msg: string | null = null;
        try {
          const { data: _rows } = await supabase
            .from('system_config')
            .select('config_key, config_value')
            .in('config_key', [`not_understood_${_lang}`, 'not_understood_en']);
          const _byKey = new Map<string, any>();
          for (const r of _rows ?? []) _byKey.set(String(r.config_key), r.config_value);
          const _pick = _byKey.get(`not_understood_${_lang}`) ?? _byKey.get('not_understood_en') ?? null;
          _msg = typeof _pick === 'object' && _pick !== null ? (_pick.value ?? null) : (_pick ?? null);
        } catch (_e) { /* non-fatal — guard still downgrades the response type */ }

        console.warn(
          `[ZERO_CODE_GUARD][${traceId}] no_actions=1 no_decision=1 no_options=1 no_codes=1 ` +
            `lang=${_lang} db_message=${_msg ? 'hit' : 'miss'} action=downgrade_to_clarification`,
        );
        if (_msg) {
          responseContent = String(_msg);
          // Already in the farmer's language → skip the 2.3 s forceTranslate hop.
          try { (orchestratorResponse as any)._skipForceTranslate = true; } catch { /* noop */ }
        }
        (orchestratorResponse as any).type = 'CLARIFICATION_NEEDED';
      }
    } catch (_zcErr) {
      console.warn(`[ZERO_CODE_GUARD_SKIP][${traceId}] err=${(_zcErr as Error).message}`);
    }

    // VALIDATION GATE: Prevent silent failures before saving response
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

    // T2 — CHEMICAL / DOSAGE PROVENANCE GATE (SAFETY CRITICAL)
    try {
      const _dbCorpus = JSON.stringify(actions_returned ?? [])
        .concat(JSON.stringify(orchestratorResponse.decision_output ?? {}))
        .toLowerCase()
        .replace(/\s+/g, '');
      const _doseRe = /(\d+(?:[.,]\d+)?)\s*(ml|l|litre|liter|g|kg|gm|gram)\b/gi;
      const _rendered = String(responseContent ?? '');
      const _unbacked: string[] = [];
      for (const m of _rendered.matchAll(_doseRe)) {
        const num = m[1].replace(',', '.');
        const unit = m[2].toLowerCase();
        const compact = `${num}${unit}`;
        const alt = `${parseFloat(num)}${unit}`;
        if (!_dbCorpus.includes(compact) && !_dbCorpus.includes(alt)) _unbacked.push(m[0].trim());
      }
      if (_unbacked.length > 0) {
        console.error(
          `[DOSAGE_PROVENANCE_VIOLATION][${traceId}] unbacked=[${_unbacked.join(' | ')}] ` +
            `db_actions=${actions_returned?.length ?? 0} model=${aiModelUsed ?? 'template'} ` +
            `action=fallback_to_db_template`,
        );
        validationResult = {
          passed: false,
          errors: [...validationResult.errors, `DOSAGE_NOT_DB_BACKED:${_unbacked.join(',')}`],
        };
      } else {
        console.log(`[DOSAGE_PROVENANCE_OK][${traceId}] all_rendered_doses_db_backed=true`);
      }
    } catch (provErr) {
      console.warn(`[DOSAGE_PROVENANCE_SKIP][${traceId}] err=${(provErr as Error).message}`);
    }


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
    try {
      await supabase.from('ai_chat_messages').insert({
        session_id: currentSessionId,
        tenant_id: finalTenantId,
        farmer_id: finalFarmerId,
        role: 'user',
        content: userMessageContent, // Original in user's language
        preprocessed_content: preprocessedContent, // Normalized to English for NLU
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
      });
      
      // Store assistant response with language-appropriate content
      // FIXED: Now includes tokens_used tracking for cost monitoring
      const tokensUsed = llmFormatterOutput?.tokens_used || null;
      
      await supabase.from('ai_chat_messages').insert({
        session_id: currentSessionId,
        tenant_id: finalTenantId,
        farmer_id: finalFarmerId,
        role: 'assistant',
        content: responseContent, // In user's language (translated if needed)
        language: detectedLanguage,
        message_type: 'orchestrator',
        response_time_ms: responseTime,
        decision_brain_source: true,
        ai_model: aiModelUsed || 'template', // PHASE 5: Track LLM model used
        tokens_used: tokensUsed,  // NEW: Track token usage for cost monitoring
        is_training_candidate: true,
        conversation_turn_number: messages.length + 1,
        // Store actions with explicit filter reasons
        actions_returned: actions_returned,
        actions_filtered_out: actions_filtered_out,
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
          // PHASE 5: LLM formatter tracking
          llm_formatter_used: !!llmFormatterOutput,
          llm_formatter_source: llmFormatterOutput?.source,
          llm_formatter_time_ms: llmFormatterOutput?.processing_time_ms,
          tokens_used: tokensUsed,
          // VALIDATION GATE
          response_validation_passed: validationResult.passed,
          validation_errors: validationResult.passed ? undefined : validationResult.errors,
          language_pipeline: {
            input_language: detectedLanguage,
            output_language: detectedLanguage,
            translation_applied: !responseHasTargetLanguage
          },
          // P0 FIX: Persist clarification options for reload after app restart
          clarification_options: (orchestratorResponse.type === 'CLARIFICATION_QUESTION' || orchestratorResponse.type === 'CLARIFICATION_NEEDED')
            ? {
                question: responseContent,
                options: orchestratorResponse.question?.options || [],
                selectionType: orchestratorResponse.metadata?.selectionType || 'SINGLE_CHOICE'
              }
            : undefined,
          // P0 FIX: Persist structured decision data for rich card reload
          decision_brain_data: orchestratorResponse.type === 'DECISION_PROVIDED' && orchestratorResponse.decision_output
            ? {
                primary_decision: orchestratorResponse.decision_output.primary_decision,
                secondary_decisions: orchestratorResponse.decision_output.secondary_decisions,
                blocked_actions: orchestratorResponse.decision_output.blocked_actions,
                land_context: orchestratorResponse.dataAudit?.land,
                confidence: orchestratorResponse.metadata?.confidence,
                risk_level: orchestratorResponse.decision_output.risk_level
              }
            : undefined,
          // P0 FIX: Persist diagnostic escalation data
          diagnostic_escalation_data: orchestratorResponse.metadata?.diagnostic_escalation_data || undefined
        }
      });
      
      console.log('💾 [Storage] Messages saved with language consistency');
    } catch (storageError) {
      console.warn('⚠️ [Storage] Failed to save messages:', storageError);
      // Continue - don't fail the request for storage issues
    }

    // TRANSFORM ORCHESTRATOR RESPONSE TO LEGACY FORMAT
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

    // SESSION-LEVEL DECISION TRACKING
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
    const rawOptions: any[] = orchestratorResponse.question?.options || [];
    const clarificationOptions = rawOptions.map((o: any) => o?.label).filter(Boolean) ||
                                  orchestratorResponse.metadata?.pendingClarificationOptions || [];
    // SYMBOLIC IDENTITY: persist observation_key per option index so the next
    const clarificationObservationKeys: string[] =
      rawOptions
        .map((o: any) => (o?.observation_key || ''))
        .filter((k: string) => k.toLowerCase() !== 'photo_upload');

    // Contract invariant: a clarification turn without any option is a dead-end
    // card for the farmer — surface it loudly instead of silently shipping it.
    if (isClarificationResponse && rawOptions.length === 0) {
      console.error(
        `[CLARIFICATION_OPTIONS_LOST] type=${orchestratorResponse.type} ` +
        `question=${!!orchestratorResponse.question} ` +
        `metadata_options=${(orchestratorResponse.metadata?.options || []).length} ` +
        `reason=clarification_emitted_with_zero_options`,
      );
    }

    // STRUCTURED SSOT — full per-option record. This is what the next turn's
    const clarificationOptionsStructured = rawOptions
      .map((o: any) => ({
        label: String(o?.label ?? ''),
        value: String(o?.value ?? o?.label ?? ''),
        observation_key: String(o?.observation_key ?? ''),
        observation_id: o?.observation_id,
        observation_code: o?.observation_code,
        hypothesis_id: o?.hypothesis_id,
        hypothesis_condition_id: o?.hypothesis_condition_id,
        graph_version: o?.graph_version,
        source: o?.source,
        diagnostic_power: o?.diagnostic_power,
      }))
      .filter((o) => o.label || o.observation_key);
    
    // CRITICAL FIX: SESSION STATE TRANSITION FROM ORCHESTRATOR
    const sessionStateUpdateFromOrchestrator = orchestratorResponse.session_state_update ||
      orchestratorResponse.metadata?.session_state_update ||
      orchestratorResponse.decision_output?.metadata?.session_state_update;
    
    const clarificationAnswered = sessionStateUpdateFromOrchestrator?.clarification_answered === true ||
      orchestratorResponse.decision_output?.metadata?.clarification_resolved === true;
    
    // P0-3 FIX: Extract lockedCropContext for session persistence.
    const candidateLockedCropContextFromResponse =
      orchestratorResponse.decision_output?.metadata?.lockedCropContext ||
      orchestratorResponse.metadata?.lockedCropContext ||
      (orchestratorResponse.dataAudit?.land?.found ? {
        crop_name: orchestratorResponse.dataAudit.land.current_crop,
        growth_stage: orchestratorResponse.dataAudit.land.growth_stage,
        days_since_sowing: orchestratorResponse.dataAudit.land.days_since_sowing
      } : null);

    const priorLockedCropContext = sessionState?.lockedCropContext || null;

    // Prefer response-provided context only when it actually carries a crop_name;
    const lockedCropContextForSession =
      (candidateLockedCropContextFromResponse && candidateLockedCropContextFromResponse.crop_name)
        ? {
            crop_name: candidateLockedCropContextFromResponse.crop_name ?? priorLockedCropContext?.crop_name,
            growth_stage: candidateLockedCropContextFromResponse.growth_stage ?? priorLockedCropContext?.growth_stage,
            days_since_sowing: candidateLockedCropContextFromResponse.days_since_sowing ?? priorLockedCropContext?.days_since_sowing,
          }
        : priorLockedCropContext;

    console.log(`\n🧭 [CANONICAL_CONTEXT_TRACE] ═══ PRE-PERSIST CONTEXT ═══`);
    console.log(`   response_type:           ${orchestratorResponse.type}`);
    console.log(`   prior_session_context:   ${JSON.stringify(priorLockedCropContext)}`);
    console.log(`   response_candidate_ctx:  ${JSON.stringify(candidateLockedCropContextFromResponse)}`);
    console.log(`   resolved_persist_ctx:    ${JSON.stringify(lockedCropContextForSession)}`);
    console.log(`   preserved_from_session:  ${!candidateLockedCropContextFromResponse?.crop_name && !!priorLockedCropContext}`);
    console.log(`   ═══════════════════════════════════════════`);
    
    // DECISION STATE DETERMINATION - Session state is AUTHORITATIVE
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
      computedDecisionState = 'no_action_needed';
    }
    
    // INVARIANT CHECK: Clarification answered but still awaiting_clarification = BUG
    let repeatClarificationBlocked = false;
    if (clarificationAnswered && computedDecisionState === 'awaiting_clarification') {
      const priorAskedKeys = new Set<string>(
        ((sessionState?.pending_clarification_observation_keys || []) as string[])
          .map((k) => String(k).trim().toLowerCase()),
      );
      const outgoingKeys = clarificationObservationKeys.map((k) => String(k).trim().toLowerCase());
      const isRepeat =
        outgoingKeys.length > 0 && outgoingKeys.every((k) => priorAskedKeys.has(k));
      if (!isClarificationResponse || outgoingKeys.length === 0 || isRepeat) {
        console.error(
          `🚨 [INVARIANT VIOLATION] option_selected=true with decision_state=awaiting_clarification ` +
          `(repeat_options=${isRepeat} outgoing=${outgoingKeys.length}) → forcing 'decision_in_progress'`,
        );
        computedDecisionState = 'decision_in_progress';
        repeatClarificationBlocked = isRepeat || outgoingKeys.length === 0;
      }
    }


    // FIX (repeated-option loop invariant): if the OUTGOING response is a
    if (
      isClarificationResponse &&
      clarificationOptions.length > 0 &&
      !repeatClarificationBlocked &&
      computedDecisionState !== 'awaiting_clarification'
    ) {
      console.error(`🚨 [INVARIANT VIOLATION] Outgoing CLARIFICATION_QUESTION with ${clarificationOptions.length} options but decision_state=${computedDecisionState}. Forcing to 'awaiting_clarification'.`);
      computedDecisionState = 'awaiting_clarification';
    }
    
    // MANDATORY LOGGING: Decision state tracking
    console.log(`\n📊 [Session] ═══ DECISION STATE TRACKING ═══`);
    console.log(`   session_decision_state: ${computedDecisionState}`);
    console.log(`   clarification_active: ${isClarificationResponse && !clarificationAnswered}`);
    console.log(`   option_selected: ${clarificationAnswered}`);
    console.log(`   unified_gate_mode: ${computedDecisionState === 'awaiting_clarification' ? 'BLOCKED (awaiting)' : 'ALLOW'}`);
    console.log(`   ═══════════════════════════════════════════`);
    
    // PART 10: SESSION CONTINUITY — Update problems_discussed list
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

    // ── CUMULATIVE SYMBOLIC EVIDENCE LEDGERS (2026-07-27) ──────────────────
    const _turnConfirmedKeys: string[] = Array.isArray((orch as any)?._lastRealObservations)
      ? ((orch as any)._lastRealObservations as any[]).map((o) => String(o ?? '').trim().toLowerCase()).filter(Boolean)
      : [];
    const cumulativeConfirmedObservationKeys = Array.from(new Set([
      ...(((sessionState as any)?.confirmed_observation_keys ?? []) as string[]).map((k) => String(k).trim().toLowerCase()),
      ..._turnConfirmedKeys,
    ])).filter(Boolean);
    const cumulativeAskedObservationKeys = Array.from(new Set([
      ..._priorAskedObservationKeys,
      ...clarificationObservationKeys.map((k) => String(k).trim().toLowerCase()),
    ])).filter((k) => k && k !== 'photo_upload');

    console.log(
      `[EVIDENCE_LEDGER] trace=${traceId} confirmed=${cumulativeConfirmedObservationKeys.length} ` +
      `asked=${cumulativeAskedObservationKeys.length} round=${_clarificationRoundCounter}`,
    );

    const decisionTracking = {
      confirmed_observation_keys: cumulativeConfirmedObservationKeys,
      asked_observation_keys: cumulativeAskedObservationKeys,
      clarification_round_counter: _clarificationRoundCounter,
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
      pending_clarification_options: (isClarificationResponse && clarificationOptions.length > 0) ? clarificationOptions : [],
      pending_clarification_observation_keys: (isClarificationResponse && clarificationObservationKeys.length > 0) ? clarificationObservationKeys : [],
      pending_clarification_options_structured: (isClarificationResponse && clarificationOptionsStructured.length > 0) ? clarificationOptionsStructured : [],
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
      // CRITICAL: Include tenant_id and farmer_id in update filter for security isolation
      await supabase
        .from('ai_chat_sessions')
        .update({ 
          updated_at: new Date().toISOString(),
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
            // Persist conversation state for continuity
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
      
      console.log(`💾 [Session] Decision tracking persisted:`, {
        state: decisionTracking.decision_state,
        pest: decisionTracking.last_pest,
        crop: decisionTracking.last_crop,
        pending: decisionTracking.pending_user_action,
        turn: decisionTracking.turn_count
      });
      console.log(`🧭 [CANONICAL_CONTEXT_TRACE] ═══ POST-PERSIST STATE ═══`);
      console.log(`   session_id:                ${currentSessionId}`);
      console.log(`   persisted_locked_context:  ${JSON.stringify(decisionTracking.lockedCropContext)}`);
      console.log(`   persisted_pending_options: ${decisionTracking.pending_clarification_options?.length || 0}`);
      console.log(`   persisted_pending_obs_keys:${JSON.stringify(decisionTracking.pending_clarification_observation_keys)}`);
      console.log(`   persisted_pending_structured:${decisionTracking.pending_clarification_options_structured?.length || 0} records`);
      console.log(`   persisted_decision_state:  ${decisionTracking.decision_state}`);
      console.log(`   ═══════════════════════════════════════════`);
    } catch (sessionUpdateError) {
      console.warn('⚠️ [Session] Failed to update session:', sessionUpdateError);
    }

    // R6 — turn boundary marker: final farmer-visible outcome of this turn.
    {
      const _rp: any = responsePayload as any;
      const _endSsot = getSessionSSOT(orchestratorResponse, orch);
      console.log(
        `[TURN_END] trace=${traceId} type=${(orchestratorResponse as any)?.type ?? 'n/a'} ` +
        `decision_status=${(orchestratorResponse as any)?.decision_output?.status ?? 'none'} ` +
        `graph_gap=${(orchestratorResponse as any)?.decision_output?.graph_gap ?? 'none'} ` +
        `options=${Array.isArray(_rp?.metadata?.clarification_options) ? _rp.metadata.clarification_options.length : 0} ` +
        `crop=${_endSsot?.crop_code ?? 'n/a'} stage=${_endSsot?.growth_stage ?? 'n/a'} ` +
        `das=${_endSsot?.days_since_sowing ?? 'n/a'} intent=${_endSsot?.intent_code ?? 'n/a'} ` +
        `content_len=${typeof responseContent === 'string' ? responseContent.length : 0} ` +
        `ms=${Date.now() - startTime}`,
      );
    }

    return new Response(
      JSON.stringify(responsePayload),

      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`❌ [${traceId}] ai-agriculture-chat Error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // GRAPH_PIPELINE_BYPASSED is an internal audit/safety invariant, not a
    if (
      errorMessage.includes('GRAPH_PIPELINE_BYPASSED') ||
      errorMessage.includes('GRAPH_ORDER_ERROR') ||
      errorMessage.includes('GRAPH_RESULT_DROPPED')
    ) {
      console.error(`[GRAPH_INVARIANT_RECOVERED] trace_id=${traceId} ${errorMessage}`);
      return new Response(
        JSON.stringify({
          response: '🙏 I understood the crop problem, but the diagnosis engine needs one more clear observation before giving treatment advice. Please describe what you see in the field or send a crop photo.',
          sessionId: currentSessionIdForError,
          responseTime: Date.now() - startTime,
          metadata: {
            type: 'SYSTEM_ERROR',
            orchestrator_type: 'SYSTEM_ERROR_RECOVERED',
            trace_id: traceId,
            recovered: true,
            fallback_reason: errorMessage.includes('GRAPH_ORDER_ERROR')
              ? 'GRAPH_ORDER_ERROR'
              : errorMessage.includes('GRAPH_RESULT_DROPPED')
                ? 'GRAPH_RESULT_DROPPED'
                : 'GRAPH_PIPELINE_BYPASSED',
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    
    // PHASE A: Include trace_id in error response for debugging
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: errorMessage,
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

// HELPER FUNCTIONS

// Normalize message content to English for NLU processing
// @deprecated REMOVED — normalizeToEnglish had only 23 hardcoded mappings,
function normalizeToEnglish(content: string): string {
  return content;
}

// Verify if response content matches target language.
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

// Force translate response to target language.
// Force-translate response to target language using LLM.
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

// Ensure primary_decision contains the SSOT rich texts from decision_rules.
function hydrateDecisionOutputRichText(decisionOutput: any): void {
  if (!decisionOutput?.primary_decision) return;

  const primary = decisionOutput.primary_decision;
  primary.application_details = primary.application_details || {};

  const app = primary.application_details as Record<string, any>;

  // 1) Prefer direct fields on primary_decision (some executors place them here)
  app.action_text ??= (primary as any).action_text;
  app.reason_text ??= (primary as any).reason_text;
  app.knowledge_text ??= (primary as any).knowledge_text;
  app.i18n_key ??= (primary as any).i18n_key;
  app.rule_id ??= primary.rule_id;

  // 2) If still missing, hydrate from matched_responses by rule_id
  const ruleId = primary.rule_id || app.rule_id;
  if (ruleId && Array.isArray(decisionOutput.matched_responses)) {
    const resp = decisionOutput.matched_responses.find((r: any) => r?.rule_id === ruleId);
    if (resp) {
      app.action_text ??= resp.action_text;
      app.reason_text ??= resp.reason_text;
      app.knowledge_text ??= resp.knowledge_text;
      app.i18n_key ??= resp.i18n_key;
    }
  }
}

// RESPONSE VALIDATION GATE - Prevents silent failures

interface ValidationResult {
  passed: boolean;
  errors: string[];
}

// Validate response before saving to database
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
    
    // NEW CHECK 5: Detect agricultural errors (harvest for young crops)
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
    
    // PRODUCTION FIX: Only truly young stages should be blocked for harvest
    const trulyYoungStages = ['GERMINATION', 'SEEDLING', 'EMERGENCE'];
    
    // Use crop-specific minimum harvest age instead of blanket 120 days
    const MIN_HARVEST_AGE: Record<string, number> = {
      'SUGARCANE': 270, 'COTTON': 150, 'RICE': 120, 'WHEAT': 120,
      'MAIZE': 90, 'SOYBEAN': 95, 'GROUNDNUT': 110, 'ONION': 120
    };
    const cropMinAge = MIN_HARVEST_AGE[crop] || 120;
    
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
    
    // NEW CHECK 6: Validate product details are present for chemical/spray actions
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
    
    // NEW CHECK 7: SOURCE VALIDATION - Ensure all content comes from symbolic brain
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

// Generate fallback response when validation fails
function generateValidationFailureFallback(
  lang: string,
  validationErrors: string[],
  orchestratorResponse: OrchestratorResponse,
  actionsReturned?: any[] | null
): string {
  // CRITICAL FIX: If we have actions, build a minimal response from them
  // This prevents "technical issue" messages when we actually have recommendations
  if (actionsReturned && actionsReturned.length > 0) {
    console.log(`   🔄 Validation fallback: Building response from ${actionsReturned.length} available actions`);
    
    const parts: string[] = [];
    
    // Greeting
    parts.push('🌾 Hello farmer friend!');
    
    // Header
    parts.push('📌 **What to do now:**');
    
    // Extract actions - with STRICT validation to prevent placeholder content
    const invalidNames = ['none', 'n/a', 'null', 'undefined', 'unknown', '', 'recommended treatment', 'additional measure'];
    
    const isValidProductName = (name: string | null | undefined): boolean => {
      if (!name) return false;
      const cleanName = name.toLowerCase().trim();
      return cleanName.length > 2 && !invalidNames.includes(cleanName);
    };
    
    const primaryAction = actionsReturned.find(a => a.type === 'primary');
    let hasValidPrimaryAction = false;
    
    if (primaryAction) {
      const rawProductName = primaryAction.product_name || 
                             primaryAction.application_details?.product_name || 
                             primaryAction.title;
      
      // CRITICAL: Validate product name is meaningful
      if (isValidProductName(rawProductName)) {
        hasValidPrimaryAction = true;
        
        // CRITICAL FIX: Translate chemical name to farmer-friendly language
        const translatedProductName = getProductName(rawProductName, lang);
        
        const rawDosage = primaryAction.dosage || primaryAction.application_details?.dosage;
        const isValidDosage = rawDosage && 
                              rawDosage !== 'N/A' && 
                              rawDosage !== 'See product label' &&
                              rawDosage.length > 0;
        
        let actionText = `1. **${translatedProductName}**`;
        // Only add dosage if not already included in translation
        if (isValidDosage && !translatedProductName.includes('/')) actionText += ` - ${rawDosage}`;
        parts.push(actionText);
      }
    }
    
    // If no valid primary action, check secondary actions
    if (!hasValidPrimaryAction) {
      console.log(`   ⚠️ Primary action invalid, checking secondary actions...`);
      
      // Check if any secondary action has valid data
      const validSecondaryActions = actionsReturned.filter(a => {
        if (a.type === 'primary') return false;
        const name = a.action || a.title || a.product_name;
        return isValidProductName(name);
      });
      
      if (validSecondaryActions.length === 0) {
        // NO valid actions at all - use technical issue fallback
        console.log(`   ⚠️ No valid actions found in actionsReturned, using technical fallback`);
        const fallbackText = `🌾 Hello Farmer Friend!\n\nI encountered a technical issue. Please try again or describe your problem in more detail.\n\n📞 For urgent help: Contact your nearest KVK.`;
        return fallbackText;
      }
      
      // Use valid secondary actions - TRANSLATE to farmer-friendly language
      validSecondaryActions.slice(0, 3).forEach((action, idx) => {
        const rawActionName = action.action || action.title || action.product_name;
        const translatedName = getProductName(rawActionName, lang);
        parts.push(`${idx + 1}. **${translatedName}**`);
      });
    } else {
      // Add secondary actions (only if primary was valid) - TRANSLATE names
      const secondaryActions = actionsReturned.filter(a => a.type === 'secondary');
      let actionIdx = 2;
      for (const action of secondaryActions.slice(0, 2)) {
        const rawActionName = action.action || action.title;
        if (isValidProductName(rawActionName)) {
          const translatedName = getProductName(rawActionName, lang);
          parts.push(`${actionIdx}. **${translatedName}**`);
          actionIdx++;
        }
      }
    }
    
    // Closing
    parts.push('\n✅ Best wishes! 🙏');
    
    return parts.join('\n\n');
  }
  
  // Original fallback when no actions available
  // English-only fallback — forceTranslateResponse() handles localization at runtime
  return `🌾 **Hello Farmer Friend!**

I encountered a technical issue while preparing recommendations. Please provide the following information:

1. What is your crop?
2. What is the current problem?
3. What is the crop stage?

With this information, I can provide you proper guidance.

📞 For urgent help: Contact your nearest Krishi Vigyan Kendra (KVK).`;
}

// Generate response when ALL actions were filtered
function generateAllActionsFilteredResponse(
  filteredActions: any[], 
  lang: string
): string {
  const parts: string[] = [];
  
  // Greeting
  parts.push('Hello farmer friend! 🌾');
  
  // Explanation
  parts.push('⚠️ Unable to provide recommendations at this time. Here\'s why:');
  
  // List filtered reasons by category
  const categoryReasons: Record<string, string[]> = {};
  filteredActions.forEach(action => {
    const category = action.filter_category || 'UNKNOWN';
    if (!categoryReasons[category]) categoryReasons[category] = [];
    categoryReasons[category].push(action.reason || action.action);
  });
  
  // English-only category labels — forceTranslateResponse() handles localization
  const categoryLabels: Record<string, string> = {
    REGULATORY: '📋 Regulatory Restrictions',
    SAFETY: '🛡️ Safety Reasons',
    SEASONAL: '📅 Seasonal Restrictions',
    WEATHER: '🌧️ Weather Conditions',
    ECONOMIC: '💰 Economic Factors',
    COMPATIBILITY: '⚗️ Compatibility Issues',
    UNKNOWN: 'ℹ️ Other Reasons'
  };
  
  Object.entries(categoryReasons).forEach(([category, reasons]) => {
    const label = categoryLabels[category] || category;
    parts.push(`\n${label}:`);
    reasons.slice(0, 2).forEach(reason => {
      parts.push(`  • ${reason}`);
    });
  });
  
  // Suggestion
  parts.push('\n💡 **What to do next:**\n1. Wait for weather conditions to improve\n2. Ask again when crop stage changes\n3. Contact your local agricultural officer');
  
  return parts.join('\n');
}

// EXTRACT & AUDIT ACTIONS WITH FILTER TRACE
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

// Build explicit human-readable filter reason
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

// Generate human-readable title for an action
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

// Generate human-readable description for an action
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

// POST-PROCESSING: Convert Decision Brain output to natural language
async function getResponseContent(response: OrchestratorResponse, language: string): Promise<string> {
  const lang = language;
  console.log(`📝 [PostProcessor] Converting response type: ${response.type} to language: ${lang}`);
  console.log(`📝 [PostProcessor] Response assembly:`, {
    has_communication: !!response.communication,
    has_decision_output: !!response.decision_output,
    comm_keys: response.communication?.main_message ? Object.keys(response.communication.main_message) : [],
    decision_status: (response.decision_output as any)?.status,
    has_primary: !!response.decision_output?.primary_decision,
    // P6: graph observability at the response boundary
    graphExecuted: (response as any)?.graph_snapshot?.graph_executed
      ?? (response as any)?.metadata?.graph_executed
      ?? false,
    graph_gap: (response.decision_output as any)?.graph_gap ?? null,
    trace_id: (response as any)?.graph_snapshot?.trace_id
      ?? (response.decision_output as any)?.trace_id
      ?? null,
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
    
    // CRITICAL FIX: Handle SYSTEM_ERROR properly - provide helpful advice
    case 'SYSTEM_ERROR':
      console.log(`   ⚠️ SYSTEM_ERROR response - generating helpful fallback`);
      const fallbackAdvice = response.error?.fallback_advice || '';
      return generateHelpfulErrorResponse(lang, fallbackAdvice);

    // SC-2 FIX (2026-07-25): DIAGNOSTIC_ESCALATION — emitted by
    case 'DIAGNOSTIC_ESCALATION': {
      const commFull = response.communication?.main_message?.full_text as any;
      const commText = commFull?.[lang] || commFull?.en || '';
      if (commText) return commText;
      if (response.communication?.farmer_message) return response.communication.farmer_message;
      const escText = (response.escalation as any)?.[`message_${lang}`] || response.escalation?.message_en || '';
      if (escText) return escText;
      console.warn(`   ⚠️ DIAGNOSTIC_ESCALATION with no communication payload — using generic escalation prompt`);
      return generateNoRecommendationsFallback(response, lang);
    }

    default:
      // NEVER silent - even for unknown types, provide helpful response
      console.log(`   ⚠️ Unknown response type: ${response.type} - generating helpful fallback`);
      return generateHelpfulErrorResponse(lang, '');
  }
}

// FALLBACK: When decision brain runs but produces no recommendations
function generateNoRecommendationsFallback(response: OrchestratorResponse, lang: string): string {
  const parts: string[] = [];
  
  // Greeting
  parts.push('Hello farmer friend! 🌾');
  
  // Extract context clues from response
  const nluIntent = response.metadata?.nlu_output?.primary_intent;
  const detectedPest = response.metadata?.nlu_output?.pest_mentions?.[0];
  const detectedDisease = response.metadata?.nlu_output?.disease_mentions?.[0];
  const detectedCrop = response.metadata?.nlu_output?.crop_mentions?.[0];
  
  // NOTE: Reaching this fallback means the OBSERVATION_REQUIRED contract
  if (detectedPest || detectedDisease) {
    const target = detectedPest || detectedDisease;
    parts.push(`Noted: ${target}. Please share what you currently observe in the field so I can advise precisely.`);
  } else {
    parts.push('Please share what you currently observe in the field so I can advise precisely.');
  }

  
  return parts.join('\n\n');
}

// Build formatted numbered list from decision output
async function buildFormattedRecommendationsList(
  decision: any,
  lang: string,
  supabaseClient?: any,
  marketProductMemo: MarketProductMemo = new Map(),
): Promise<string> {
  const parts: string[] = [];
  
  // Greeting
  parts.push('Hello farmer friend! 🌾');
  
  const primary = decision.primary_decision;
  
  // Status handling
  if (decision.status === 'BLOCKED') {
    const blockedReason = decision.blocked_actions?.[0]?.reason || 'Safety check required';
    parts.push(`⚠️ **Stop:** ${blockedReason}`);
    return parts.join('\n\n');
  }
  
  if (decision.status === 'WEATHER_DELAYED') {
    parts.push('⏱️ **Postpone spray** - Spray when weather clears. Continue crop monitoring for now.');
    return parts.join('\n\n');
  }
  
  // Action type - NO ACTION / MONITOR
  if (primary?.action_type === 'NO_ACTION' || primary?.action_type === 'MONITOR_ONLY') {
    parts.push('👀 **No action required at this time.** Continue monitoring.');

    // If decision_rules provided rich text, include it so response stays SSOT-based
    const app = primary?.application_details || {};
    const actionText = app.action_text as string | undefined;
    const reasonText = app.reason_text as string | undefined;
    const knowledgeText = app.knowledge_text as string | undefined;

    if (actionText) parts.push(`\n🧾 **Action:** ${actionText}`);
    if (reasonText) parts.push(`\n🔍 **Reason:** ${reasonText}`);
    if (knowledgeText) parts.push(`\n📚 **Knowledge:** ${knowledgeText}`);

    return parts.join('\n\n');
  }
  
  // Primary recommendation as numbered list
  if (primary) {
    parts.push('📌 **Recommendations:**');
    
    let recNumber = 1;
    const recParts: string[] = [];
    
    // Primary action - CRITICAL FIX: Validate through extractRichRuleData to prevent contaminated data
    const appDetails = primary.application_details || {};
    const richData = extractRichRuleData(primary, appDetails);
    const productName = richData.active_ingredient ? getProductName(richData.active_ingredient, lang) : 'Recommended product';
    const dosage = richData.dosage_per_acre || '';
    const timing = primary.timing?.best_time_of_day || 'MORNING';
    const method = appDetails.method || appDetails.application_method || '';

    // PRODUCT MAPPING: Look up market brand names for the active ingredient
    let marketProductLine = '';
    if (richData.active_ingredient && supabaseClient) {
      try {
        const cropCode = decision.metadata?.crop_code || decision.primary_decision?.target?.crop || '';
        const marketResult = await lookupMarketProductsMemoized(
          marketProductMemo,
          supabaseClient,
          richData.active_ingredient,
          cropCode,
        );
        marketProductLine = formatMarketProducts(marketResult.products, lang);
      } catch (err) {
        console.warn(`[ProductMapping] Lookup failed, continuing without market products:`, err);
      }
    }

    // NEW: Also include SSOT rich texts from decision_rules (action_text/reason_text/knowledge_text)
    const app = primary.application_details || {};
    const actionText = app.action_text as string | undefined;
    const reasonText = app.reason_text as string | undefined;
    const knowledgeText = app.knowledge_text as string | undefined;

    // English-only labels — forceTranslateResponse() handles localization
    const richLabels = { action: 'Action', reason: 'Reason', knowledge: 'Knowledge' };

    let primaryText = `**${recNumber}. ${productName}**`;
    if (dosage) primaryText += ` @ ${dosage}`;

    // Add method - translated
    if (method) {
      const methodText = getMethodTranslation(method, lang);
      primaryText += `\n   📍 ${methodText}`;
    }

    // Add timing
    const timingLabels: Record<string, string> = {
      MORNING: 'Morning 6-10 AM',
      EVENING: 'Evening 4-6 PM',
      ANY: 'Any time'
    };
    const timingText = timingLabels[timing] || timingLabels.MORNING;
    primaryText += `\n   ⏰ ${timingText}`;

    // PRODUCT MAPPING: Append market product brand names
    if (marketProductLine) {
      primaryText += `\n   ${marketProductLine}`;
    }

    if (actionText) primaryText += `\n   🧾 **${richLabels.action}:** ${actionText}`;
    if (reasonText) primaryText += `\n   🔍 **${richLabels.reason}:** ${reasonText}`;
    if (knowledgeText) primaryText += `\n   📚 **${richLabels.knowledge}:** ${knowledgeText}`;

    // Add efficacy
    const efficacy = primary.expected_outcomes?.efficacy_percent;
    if (efficacy) {
      primaryText += ` | 📊 ${efficacy}% effective`;
    }

    recParts.push(primaryText);
    recNumber++;
    
    // Secondary actions - CRITICAL FIX: Translate action names
    if (decision.secondary_actions && decision.secondary_actions.length > 0) {
      decision.secondary_actions.slice(0, 2).forEach((alt: any) => {
        if (alt.action && alt.action !== 'N/A' && alt.action !== 'None') {
          // Translate action type to farmer language
          const translatedAction = getActionTranslation(alt.action, lang);
          // Also translate reason if it contains technical terms
          const reason = alt.reason || '';
          recParts.push(`**${recNumber}. ${translatedAction}** ${reason ? `- ${reason}` : ''}`);
          recNumber++;
        }
      });
    }
    
    parts.push(recParts.join('\n'));
  }
  
  // Closing
  parts.push('\n✅ Best wishes! 🙏');
  
  return parts.join('\n\n');
}

// Generate clarification prompt when question text is missing
function generateClarificationPrompt(response: OrchestratorResponse, lang: string): string {
  // English-only — forceTranslateResponse() handles localization at runtime
  return 'Please provide more details about your question. Tell us the crop name, problem, and symptoms.';
}

// Generic acknowledgment for unknown response types
function generateGenericAcknowledgment(lang: string): string {
  return generateHelpfulErrorResponse(lang, '');
}

// PRODUCTION FIX: Generate helpful error response with actionable guidance
function generateHelpfulErrorResponse(lang: string, fallbackAdvice: string): string {
  // English-only — forceTranslateResponse() handles localization at runtime
  return `🙏 Hello Farmer Friend!

${fallbackAdvice ? fallbackAdvice + '\n\n' : ''}To answer your question, please provide:

📋 **Tell me:**
• What is your crop?
• How old is the crop (days)?
• What problem are you seeing?

📸 If possible, send a photo of the affected area - I can give more accurate advice!

💡 **Quick tips:**
• Monitor your crop regularly
• Maintain proper water management
• Report any new pest/disease signs`;
}

// Fallback: Build natural language response directly from DecisionOutput
async function buildResponseFromDecisionOutput(
  decision: any,
  language: string,
  supabaseClient?: any,
  marketProductMemo: MarketProductMemo = new Map(),
): Promise<string> {
  if (!decision) {
    return getGenericMonitoringMessage(language);
  }
  
  const parts: string[] = [];
  
  // English-only — forceTranslateResponse() handles localization at runtime
  parts.push('Hello farmer friend! 🌾');
  
  const primary = decision.primary_decision;
  
  // Status handling
  if (decision.status === 'BLOCKED') {
    const blockedReason = decision.blocked_actions?.[0]?.reason || 'Safety check required';
    parts.push(`⚠️ **Stop:** ${blockedReason}`);
    return parts.join('\n\n');
  }
  
  if (decision.status === 'WEATHER_DELAYED') {
    parts.push('⏱️ **Postpone spray** - Spray when weather clears. Continue crop monitoring for now.');
    return parts.join('\n\n');
  }
  
  // Action type
  if (primary?.action_type === 'NO_ACTION' || primary?.action_type === 'MONITOR_ONLY') {
    parts.push('👀 **No action required at this time.** Continue monitoring.');

    const app = primary?.application_details || {};
    if (app.action_text) parts.push(`\n🧾 **Action:** ${app.action_text}`);
    if (app.reason_text) parts.push(`\n🔍 **Reason:** ${app.reason_text}`);
    if (app.knowledge_text) parts.push(`\n📚 **Knowledge:** ${app.knowledge_text}`);

    return parts.join('\n\n');
  }
  
  // Primary recommendation
  if (primary) {
    const appDetails = primary.application_details || {};
    const richData = extractRichRuleData(primary, appDetails);
    const rawProductName = richData.active_ingredient || appDetails.product_name || '';
    const productName = rawProductName ? getProductName(rawProductName, language) : 'Recommended treatment';
    const dosage = richData.dosage_per_acre || appDetails.concentration || '';
    const timing = primary.timing?.best_time_of_day || 'MORNING';
    const method = richData.application_method || appDetails.method || '';
    
    parts.push('📌 **What to do now:**');
    
    const productLine = dosage ? `${productName} @ ${dosage}` : productName;
    parts.push(productLine);

    // PRODUCT MAPPING: Append market brand names
    if (richData.active_ingredient && supabaseClient) {
      try {
        const cropCode = decision.metadata?.crop_code || primary?.target?.crop || '';
        const marketResult = await lookupMarketProductsMemoized(
          marketProductMemo,
          supabaseClient,
          richData.active_ingredient,
          cropCode,
        );
        const marketLine = formatMarketProducts(marketResult.products, language);
        if (marketLine) parts.push(marketLine);
      } catch (err) {
        console.warn(`[ProductMapping] Lookup failed in fallback builder:`, err);
      }
    }
    
    if (method) {
      const methodText = getMethodTranslation(method, language);
      parts.push(`📍 ${methodText}`);
    }
    
    const timingLabels: Record<string, string> = {
      MORNING: 'Spray in the morning 6-10 AM',
      EVENING: 'Spray in the evening 4-6 PM',
      ANY: 'Any time of day'
    };
    parts.push(`⏰ ${timingLabels[timing] || timingLabels.MORNING}`);
    
    // Rich SSOT texts
    const actionText = appDetails.action_text as string | undefined;
    const reasonText = appDetails.reason_text as string | undefined;
    if (actionText) parts.push(`\n🧾 **Action:** ${actionText}`);
    if (reasonText) parts.push(`\n🔍 **Reason:** ${reasonText}`);
    
    const efficacy = primary.expected_outcomes?.efficacy_percent;
    if (efficacy) {
      parts.push(`📊 Expected efficacy: ${efficacy}%`);
    }
  }
  
  // Secondary actions
  if (decision.secondary_actions && decision.secondary_actions.length > 0) {
    parts.push('\n🔄 **Alternative measures:**');
    decision.secondary_actions.slice(0, 2).forEach((alt: any) => {
      if (alt.action) {
        const translatedAction = getActionTranslation(alt.action, language);
        parts.push(`• ${translatedAction}`);
      }
    });
  }
  
  parts.push('\n✅ Best wishes! 🙏');
  
  return parts.join('\n');
}

// Get generic monitoring message when no decision output is available
function getGenericMonitoringMessage(_language: string): string {
  // English-only — forceTranslateResponse() handles localization at runtime
  return 'Hello! 🌾 Continue monitoring your crop. Let us know if you notice any issues.';
}

// CRITICAL FIX: Flatten FarmerCommunication structure to readable text
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
      parts.push(`\n${emoji} ${heading || 'What to do now:'}`);
      if (summary) parts.push(summary);
      if (urgency) parts.push(`⏰ ${urgency}`);
    }
  }
  
  // 4. Application Instructions (ONLY IF PRESENT - adaptive)
  const howTo = comm.main_message?.sections?.how_to;
  if (howTo) {
    const heading = getText(howTo.heading);
    if (heading) parts.push(`\n🔧 ${heading}`);
    
    // Materials
    if (howTo.materials_needed?.items?.length > 0) {
      parts.push('🛒 Materials:');
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

// CRITICAL FIX: New transform function that uses PRE-GENERATED content
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
    // CANONICAL ADVISORY: Build structured JSON from decision_output
    let structuredAdvisory: any = null;
    try {
      const decisionOutput = response.decision_output as any;
      const primaryDecision = decisionOutput?.primary_decision;

      // PHASE D: Authority gate BEFORE deterministic builder.
      const authDecision = decisionOutput?.authority_decision || primaryDecision?.authority_decision;
      const treatmentsAllowed = authDecision ? authDecision.treatments_allowed !== false : true;
      if (authDecision && !treatmentsAllowed) {
        console.log(`🛑 [AUTHORITY_GATE] treatments_allowed=false (authority=${authDecision.authority}) — skipping structured advisory build`);
      }

      if (primaryDecision?.rule_id && treatmentsAllowed) {
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

  // For other types, delegate to the original function
  return transformOrchestratorResponse(response, language, sessionId, startTime);
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
      
      // ✅ CRITICAL FIX: Safe array mapping with null checks
      const safeQuickReplies = rawOptions
        .filter((o: any) => o != null)
        .map((o: any) => {
          if (typeof o === 'string') return o;
          if (typeof o === 'object' && o.label) return o.label;
          return String(o);
        });
      
      return {
        response: questionText,
        sessionId: sessionId,
        language: language,
        responseTime: responseTime,
        metadata: {
          type: 'clarification',
          orchestrator_type: 'CLARIFICATION_QUESTION',
          question_id: typeof question === 'string' ? question : question?.question_id,
          // CRITICAL FIX: Preserve observation_key for rule engine re-evaluation
          options: rawOptions.map((o: any) => ({
            label: typeof o === 'string' ? o : (o?.label || String(o)),
            value: typeof o === 'string' ? o : (o?.value || o?.label || String(o)),
            observation_key: typeof o === 'object' ? (o?.observation_key || o?.value) : undefined,
            observation_id: typeof o === 'object' ? o?.observation_id : undefined,
            observation_code: typeof o === 'object' ? o?.observation_code : undefined,
            hypothesis_id: typeof o === 'object' ? o?.hypothesis_id : undefined,
            hypothesis_condition_id: typeof o === 'object' ? o?.hypothesis_condition_id : undefined,
            graph_version: typeof o === 'object' ? o?.graph_version : undefined,
            source: typeof o === 'object' ? o?.source : undefined,
            description: typeof o === 'object' ? o?.description : undefined,
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

// CRITICAL FIX: Generate context-aware follow-up questions based on:
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
