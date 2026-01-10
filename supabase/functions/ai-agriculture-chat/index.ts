/**
 * AI Agriculture Chat - Orchestrator-Based Entry Point
 * Full migration to 9-agent orchestrator system
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { checkRateLimit } from '../_shared/rateLimiter.ts';

// Import orchestrator
import { AIAgentOrchestrator } from './agents/orchestrator.ts';
import type { OrchestratorResponse } from './agents/orchestrator.ts';

// PHASE 5: Import LLM Response Formatter for natural language generation
import { formatRecommendationsWithLLM } from './agents/llm-response-formatter.ts';
import type { LLMFormatterInput, LLMFormatterOutput } from './agents/llm-response-formatter.ts';

// Import legacy helpers for backward compatibility
import { generateMultilingualQuickReplies } from './multilingual-quick-replies.ts';
import { parseResponseToCards } from './response-parser.ts';
import { localizeResponse } from './response-localizer.ts';

// CRITICAL FIX: Import translation functions for farmer-friendly product names
import { 
  getProductName, 
  getActionTranslation, 
  getMethodTranslation,
  getUrgencyTranslation
} from './agents/communication-translation-dictionary.ts';

// SYMBOLIC BRAIN: Import validation from decision representation
import { validateLLMOutputIntegrity } from './agents/decision-representation.ts';

// PHASE 11: Import Unified Decision Gate (P1-4 fix - single gate)
import { 
  evaluateUnifiedGate,
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


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token, x-client-domain, if-none-match, origin',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Initialize orchestrator singleton
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const traceId = generateTraceId();
  
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
    // SECURITY: Extract and validate tenant and farmer IDs
    // ═══════════════════════════════════════════════════════════════════════════
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');

    if (!tenantId || !farmerId) {
      console.error('🚨 [Security] Missing required headers:', { tenantId, farmerId });
      return new Response(
        JSON.stringify({ 
          error: 'Authentication required',
          details: 'x-tenant-id and x-farmer-id headers are required'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const finalTenantId = metadata.tenantId || tenantId;
    const finalFarmerId = metadata.farmerId || farmerId;

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ═══════════════════════════════════════════════════════════════════════════
    // SECURITY: Validate tenant-farmer association
    // ═══════════════════════════════════════════════════════════════════════════
    const { data: farmer, error: farmerError } = await supabase
      .from('farmers')
      .select('id, tenant_id, farmer_name')
      .eq('id', finalFarmerId)
      .eq('tenant_id', finalTenantId)
      .single();

    if (farmerError || !farmer) {
      console.error('🚨 [Security] INVALID TENANT-FARMER ASSOCIATION');
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized: Invalid tenant-farmer association',
          details: 'Security validation failed'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ [Security] Tenant-farmer validated:', farmer.farmer_name);

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
    // P0-A: SESSION MANAGEMENT WITH STRICT LAND ISOLATION
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
        
        console.log(`📋 [Session] State loaded (P0-A validated, land=${requestedLandId}, isGeneral=${isGeneralSession}):`, {
          decision_state: sessionState?.decision_state,
          last_pest: sessionState?.last_pest,
          last_crop: sessionState?.last_crop,
          pending_action: sessionState?.pending_user_action,
          pending_options: sessionState?.pending_clarification_options?.length || 0,
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
    // EXTRACT USER MESSAGE
    // ═══════════════════════════════════════════════════════════════════════════
    const lastUserMessage = messages[messages.length - 1];
    const userMessageContent = typeof lastUserMessage === 'string' 
      ? lastUserMessage 
      : lastUserMessage?.content || '';

    if (!userMessageContent.trim()) {
      return new Response(
        JSON.stringify({ error: 'Empty message provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LANGUAGE DETECTION & CONSISTENCY CHECK
    // Detect user's language and prepare for translation pipeline
    // ═══════════════════════════════════════════════════════════════════════════
    const detectedLanguage = detectLanguage(userMessageContent, language);
    
    // Normalize content to English for NLU processing (preprocessed_content)
    const preprocessedContent = normalizeToEnglish(userMessageContent);
    
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

    console.log(`🚀 [${traceId}] Processing message:`, {
      sessionId: currentSessionId,
      farmerId: finalFarmerId,
      language: detectedLanguage,
      hasImage: !!imageUrl,
      messagePreview: userMessageContent.substring(0, 50)
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CALL ORCHESTRATOR - THE NEW 9-AGENT FLOW WITH TRACE_ID AND SESSION STATE
    // ═══════════════════════════════════════════════════════════════════════════
    const orch = getOrchestrator();
    
    const orchestratorResponse: OrchestratorResponse = await orch.orchestrate(
      userMessageContent,
      currentSessionId,
      finalFarmerId,
      finalTenantId,
      {
        photoUrl: imageUrl,
        language: detectedLanguage as 'mr' | 'hi' | 'en',
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
          // P1-BUG FIX: Pass lockedCropContext for OPTION_SELECTED context preservation
          lockedCropContext: sessionState.lockedCropContext
        } : undefined
      }
    );

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
    
    const rawDecisionOutput = orchestratorResponse.decision_output;
    if (rawDecisionOutput) {
      console.log(`   Status: ${rawDecisionOutput.status}`);
      console.log(`   Primary Decision: ${rawDecisionOutput.primary_decision?.action_type || 'NONE'}`);
      console.log(`   Secondary Actions: ${rawDecisionOutput.secondary_actions?.length || 0}`);
      console.log(`   Blocked Actions: ${rawDecisionOutput.blocked_actions?.length || 0}`);
      
      // Log all raw recommendations before processing
      if (rawDecisionOutput.primary_decision) {
        console.log(`   📌 RAW Primary: ${JSON.stringify({
          action_type: rawDecisionOutput.primary_decision.action_type,
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
    } else {
      console.log(`   ⚠️ No decision_output present in orchestrator response`);
    }
    
    // STEP 2: Extract and audit with filter logging
    const { actions_returned, actions_filtered_out, audit_log, filter_trace } = extractAndAuditActionsWithFilterTrace(orchestratorResponse, traceId);
    
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
    // CRITICAL FIX: Check if Static Data Gate already handled this query
    // Static Gate responses should NOT go through LLM formatting
    // ═══════════════════════════════════════════════════════════════════════════
    const isStaticGateResponse = 
      orchestratorResponse.decision_output?.metadata?.template_type === 'STATIC_DIRECT' ||
      orchestratorResponse.communication?.metadata?.source === 'STATIC_DATA_GATE';
    
    if (isStaticGateResponse) {
      // Static Gate already generated the response - use it directly
      console.log(`   📊 [StaticGate] Using pre-generated response (NO LLM needed)`);
      responseContent = orchestratorResponse.communication?.main_message?.full_text?.[detectedLanguage as 'mr' | 'hi' | 'en'] ||
                        orchestratorResponse.communication?.main_message?.full_text?.mr ||
                        'माहिती उपलब्ध नाही';
    } else if (allActionsFiltered) {
      // Special response when all actions were filtered
      console.log(`   ⚠️ ALL actions filtered - generating explanation response`);
      responseContent = generateAllActionsFilteredResponse(actions_filtered_out, detectedLanguage as 'mr' | 'hi' | 'en');
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
        const lockedCropCtx = orchestratorResponse.decision_output?.metadata?.lockedCropContext ||
                              orchestratorResponse.metadata?.lockedCropContext;
        
        const landContext = orchestratorResponse.dataAudit?.land?.found ? {
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
          // FIX: Fallback to lockedCropContext when dataAudit is missing (OPTION_SELECTED path)
          current_crop: lockedCropCtx.crop_name,
          growth_stage: lockedCropCtx.growth_stage,
          days_since_sowing: lockedCropCtx.days_since_sowing,
          area_acres: lockedCropCtx.area_acres
        } : undefined;
        
        console.log(`   📊 [LandContext] Built from ${orchestratorResponse.dataAudit?.land?.found ? 'dataAudit' : lockedCropCtx ? 'lockedCropContext' : 'NONE'}`);
        if (landContext) {
          console.log(`      Crop: ${landContext.current_crop}, Stage: ${landContext.growth_stage}, Days: ${landContext.days_since_sowing}`);
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
          symptom_keys: orchestratorResponse.metadata?.symptomKeys || [],
          is_specific_symptom: !!orchestratorResponse.decision_output?.primary_decision?.target,
          clarification_turn_count: orchestratorResponse.metadata?.clarificationTurnCount || 0,
          pending_clarification: orchestratorResponse.decision_output?.clarification_needed || false,
          has_emergency_indicators: orchestratorResponse.metadata?.isEmergency || false,
          land_id: landId
        };
        
        const unifiedGateResult = evaluateUnifiedGate(unifiedGateInput);
        
        console.log(`   🚦 [UnifiedGate] ${unifiedGateResult.gate_status === 'PASS' ? '✅ PASS' : unifiedGateResult.gate_status === 'EMERGENCY_BYPASS' ? '🚨 EMERGENCY' : '🚫 ' + unifiedGateResult.gate_status}`);
        console.log(`      Response Mode: ${unifiedGateResult.response_mode}`);
        console.log(`      Action: ${unifiedGateResult.gate_action}`);
        console.log(`      Reason: ${unifiedGateResult.reason}`);
        
        // If unified gate blocks treatments, use appropriate fallback response
        if (!unifiedGateResult.treatments_allowed) {
          console.log(`   ⚠️ Unified gate blocked treatments - using ${unifiedGateResult.response_mode} response`);
          
          if (unifiedGateResult.response_mode === ResponseMode.DIAGNOSTIC_ESCALATION) {
            // NEW: Expert-quality diagnostic escalation response
            console.log(`   🔬 DIAGNOSTIC_ESCALATION - generating expert response with hypotheses`);
            
            const escalationInput: DiagnosticEscalationInput = {
              language: detectedLanguage as 'mr' | 'hi' | 'en',
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
            
            // Mark orchestrator response as DIAGNOSTIC_ESCALATION for frontend
            orchestratorResponse.type = 'DIAGNOSTIC_ESCALATION' as any;
            orchestratorResponse.metadata = {
              ...orchestratorResponse.metadata,
              diagnostic_escalation: unifiedGateResult.diagnostic_escalation,
              orchestrator_type: 'DIAGNOSTIC_ESCALATION'
            };
          } else if (unifiedGateResult.response_mode === ResponseMode.OBSERVATION) {
            // Young crop - use monitoring response with authority-reconciled values
            responseContent = generateYoungCropMonitoringResponse(
              detectedLanguage as 'mr' | 'hi' | 'en',
              finalCropName,
              finalGrowthStage,
              finalDaysSinceSowing
            );
          } else {
            // No confirmed diagnosis or authority block - use observation response
            responseContent = generateObservationOnlyResponse(
              detectedLanguage as 'mr' | 'hi' | 'en',
              finalCropName,
              unifiedGateResult.reason
            );
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
        
          const formatterInput: LLMFormatterInput = {
            farmer_message: userMessageContent,
            language: detectedLanguage as 'mr' | 'hi' | 'en',
            decision_output: orchestratorResponse.decision_output,
            land_context: landContext,
            data_audit: orchestratorResponse.dataAudit,
            trace_id: traceId
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
              responseContent = buildFormattedRecommendationsList(
                orchestratorResponse.decision_output, 
                detectedLanguage as 'mr' | 'hi' | 'en'
              );
            } else {
              responseContent = getResponseContent(orchestratorResponse, detectedLanguage);
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
          responseContent = buildFormattedRecommendationsList(
            orchestratorResponse.decision_output, 
            detectedLanguage as 'mr' | 'hi' | 'en'
          );
        } else {
          responseContent = getResponseContent(orchestratorResponse, detectedLanguage);
        }
      }
      } // End of STAGE_FALLBACK else block
    } else {
      // Non-decision responses (clarification, photo request, etc.)
      responseContent = getResponseContent(orchestratorResponse, detectedLanguage);
    }
    
    // Verify language consistency
    const responseHasTargetLanguage = verifyLanguageConsistency(responseContent, detectedLanguage);
    console.log(`   🌐 Language Check: input=${detectedLanguage}, response_matches=${responseHasTargetLanguage}`);
    
    if (!responseHasTargetLanguage && detectedLanguage !== 'en') {
      console.log(`   🔄 Response not in target language, applying translation`);
      responseContent = forceTranslateResponse(responseContent, detectedLanguage as 'mr' | 'hi' | 'en');
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION GATE: Prevent silent failures before saving response
    // ═══════════════════════════════════════════════════════════════════════════
    const decision_brain_source = true;
    const validationResult = validateResponseBeforeSave({
      decision_brain_source,
      actions_returned,
      responseContent,
      orchestratorResponse,
      traceId,
      language: detectedLanguage as 'mr' | 'hi' | 'en'  // CRITICAL FIX: Pass explicit language
    });
    
    console.log(`🔐 [${traceId}] ═══ RESPONSE VALIDATION GATE ═══`);
    console.log(`   Decision Brain Source: ${decision_brain_source}`);
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
        detectedLanguage as 'mr' | 'hi' | 'en',
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
          // VALIDATION GATE: Track whether response passed validation
          response_validation_passed: validationResult.passed,
          validation_errors: validationResult.passed ? undefined : validationResult.errors,
          language_pipeline: {
            input_language: detectedLanguage,
            output_language: detectedLanguage,
            translation_applied: !responseHasTargetLanguage
          }
        }
      });
      
      console.log('💾 [Storage] Messages saved with language consistency');
    } catch (storageError) {
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
    const clarificationOptions = orchestratorResponse.question?.options?.map((o: any) => o.label) || 
                                  orchestratorResponse.metadata?.pendingClarificationOptions || [];
    
    // P0-3 FIX: Extract lockedCropContext for session persistence
    const lockedCropContextForSession = 
      orchestratorResponse.decision_output?.metadata?.lockedCropContext ||
      orchestratorResponse.metadata?.lockedCropContext ||
      (orchestratorResponse.dataAudit?.land?.found ? {
        crop_name: orchestratorResponse.dataAudit.land.current_crop,
        growth_stage: orchestratorResponse.dataAudit.land.growth_stage,
        days_since_sowing: orchestratorResponse.dataAudit.land.days_since_sowing
      } : null);
    
    const decisionTracking = {
      decision_state: recommendationsProvided ? 'recommendations_given' : 
                      isClarificationResponse ? 'awaiting_clarification' : 
                      'no_action_needed',
      last_pest: lastPest,
      last_disease: lastDisease,
      last_crop: lastCrop,
      pending_user_action: recommendationsProvided, // User should act on recommendations
      turn_count: (sessionState?.turn_count || 0) + 1,
      recommendations_count: actions_returned?.length || 0,
      last_action_types: actions_returned?.map((a: any) => a.action_type || a.action).slice(0, 3) || [],
      timestamp: new Date().toISOString(),
      // CRITICAL FIX 1: Store clarification options for option matching in next turn
      pending_clarification_options: isClarificationResponse ? clarificationOptions : [],
      // P0-3 FIX: Persist lockedCropContext for multi-turn context continuity
      lockedCropContext: lockedCropContextForSession
    };
    
    try {
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
        .eq('id', currentSessionId);
      
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
        fallback_advice: 'कृपया पुन्हा प्रयत्न करा किंवा कृषी तज्ञांशी संपर्क साधा.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize message content to English for NLU processing
 * Maps common agricultural terms from regional languages to English
 */
function normalizeToEnglish(content: string): string {
  // Common agricultural term mappings
  const termMappings: Record<string, string> = {
    // Marathi terms
    'ऊस': 'sugarcane',
    'मधली सुरळी': 'shoot borer',
    'खोड किडा': 'stem borer',
    'कापूस': 'cotton',
    'सोयाबीन': 'soybean',
    'तूर': 'tur dal',
    'गहू': 'wheat',
    'भात': 'paddy',
    'ज्वारी': 'jowar',
    'बाजरी': 'bajra',
    'फवारणी': 'spray',
    'खत': 'fertilizer',
    'पाणी': 'water',
    'रोग': 'disease',
    'किडा': 'pest',
    'पान': 'leaf',
    // Hindi terms
    'गन्ना': 'sugarcane',
    'कीट': 'pest',
    'बीमारी': 'disease',
    'छिड़काव': 'spray',
    'उर्वरक': 'fertilizer',
    'सिंचाई': 'irrigation'
  };
  
  let normalized = content;
  for (const [regional, english] of Object.entries(termMappings)) {
    normalized = normalized.replace(new RegExp(regional, 'gi'), english);
  }
  
  return normalized;
}

/**
 * Verify if response content matches target language
 */
function verifyLanguageConsistency(content: string, targetLanguage: string): boolean {
  if (targetLanguage === 'en') {
    // For English, check it's mostly ASCII
    const asciiRatio = (content.match(/[\x00-\x7F]/g) || []).length / content.length;
    return asciiRatio > 0.8;
  }
  
  if (targetLanguage === 'mr' || targetLanguage === 'hi') {
    // For Marathi/Hindi, check for Devanagari presence
    const hasDevanagari = /[\u0900-\u097F]/.test(content);
    return hasDevanagari;
  }
  
  return true; // Default to true for other languages
}

/**
 * Force translate response to target language using templates
 */
function forceTranslateResponse(content: string, targetLang: 'mr' | 'hi' | 'en'): string {
  if (targetLang === 'en') return content;
  
  // Basic translation templates for common phrases
  const translations: Record<string, Record<string, string>> = {
    'Hello farmer friend!': {
      mr: 'नमस्कार शेतकरी मित्र!',
      hi: 'नमस्कार किसान मित्र!'
    },
    'What to do now:': {
      mr: 'आता काय करावे:',
      hi: 'अभी क्या करें:'
    },
    'Recommendations:': {
      mr: 'शिफारसी:',
      hi: 'सिफारिशें:'
    },
    'Best wishes!': {
      mr: 'शुभेच्छा!',
      hi: 'शुभकामनाएं!'
    },
    'Morning': {
      mr: 'सकाळी',
      hi: 'सुबह'
    },
    'Evening': {
      mr: 'संध्याकाळी',
      hi: 'शाम को'
    },
    'Apply': {
      mr: 'वापरा',
      hi: 'लगाएं'
    }
  };
  
  let translated = content;
  for (const [english, langs] of Object.entries(translations)) {
    translated = translated.replace(new RegExp(english, 'gi'), langs[targetLang] || english);
  }
  
  return translated;
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
  language: 'mr' | 'hi' | 'en';  // CRITICAL FIX: Accept explicit language instead of inferring
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
    
    const youngCropStages = ['GERMINATION', 'SEEDLING', 'VEGETATIVE', 'TILLERING', 'GRAND_GROWTH'];
    
    // CRITICAL FIX: Only apply harvest check if we ACTUALLY know the crop's age
    // If daysSinceSowing is null/undefined, skip this check - don't assume anything
    const hasValidCropData = (effectiveDays !== null && effectiveDays > 0) || effectiveStage;
    const isYoungCrop = hasValidCropData && (
      youngCropStages.includes(effectiveStage) || 
      (effectiveDays !== null && effectiveDays > 0 && effectiveDays < 120)
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
 * Generate fallback response when validation fails
 * CRITICAL FIX: Use available actions if present instead of generic "technical issue"
 * Ensures user always gets helpful feedback even on failures
 */
function generateValidationFailureFallback(
  lang: 'mr' | 'hi' | 'en',
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
    const greetings: Record<string, string> = {
      mr: '🌾 नमस्कार शेतकरी मित्र!',
      hi: '🌾 नमस्कार किसान मित्र!',
      en: '🌾 Hello farmer friend!'
    };
    parts.push(greetings[lang]);
    
    // Header
    const headers: Record<string, string> = {
      mr: '📌 **आता काय करावे:**',
      hi: '📌 **अभी क्या करें:**',
      en: '📌 **What to do now:**'
    };
    parts.push(headers[lang]);
    
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
        const fallbacks: Record<string, string> = {
          mr: `🌾 नमस्कार शेतकरी मित्र!\n\nमाझ्याकडून शिफारस तयार करताना तांत्रिक समस्या आली. कृपया पुन्हा प्रयत्न करा किंवा तुमची समस्या अधिक तपशीलात सांगा.\n\n📞 तातडीसाठी: जवळच्या कृषी विज्ञान केंद्राशी संपर्क साधा.`,
          hi: `🌾 नमस्कार किसान मित्र!\n\nसिफारिश तैयार करते समय तकनीकी समस्या आई। कृपया दोबारा प्रयास करें या अपनी समस्या और विस्तार से बताएं।\n\n📞 तत्काल सहायता के लिए: निकटतम KVK से संपर्क करें।`,
          en: `🌾 Hello Farmer Friend!\n\nI encountered a technical issue. Please try again or describe your problem in more detail.\n\n📞 For urgent help: Contact your nearest KVK.`
        };
        return fallbacks[lang] || fallbacks['en'];
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
    const closings: Record<string, string> = {
      mr: '\n✅ शुभेच्छा! 🙏',
      hi: '\n✅ शुभकामनाएं! 🙏',
      en: '\n✅ Best wishes! 🙏'
    };
    parts.push(closings[lang]);
    
    return parts.join('\n\n');
  }
  
  // Original fallback when no actions available
  const fallbacks: Record<string, string> = {
    mr: `🌾 **नमस्कार शेतकरी मित्र!**

माझ्याकडून शिफारस तयार करताना तांत्रिक समस्या आली. कृपया खालील माहिती द्या:

1. तुमचे पीक कोणते आहे?
2. सध्याची समस्या काय आहे?
3. पिकाचा टप्पा कोणता आहे?

या माहितीवरून मी तुम्हाला योग्य मार्गदर्शन करू शकेन.

📞 तातडीसाठी: जवळच्या कृषी विज्ञान केंद्राशी (KVK) संपर्क साधा.`,

    hi: `🌾 **नमस्कार किसान मित्र!**

सिफारिश तैयार करते समय तकनीकी समस्या आई। कृपया निम्नलिखित जानकारी दें:

1. आपकी फसल कौन सी है?
2. वर्तमान समस्या क्या है?
3. फसल की अवस्था क्या है?

इस जानकारी से मैं आपको उचित मार्गदर्शन दे सकूंगा।

📞 तत्काल सहायता के लिए: निकटतम कृषि विज्ञान केंद्र (KVK) से संपर्क करें।`,

    en: `🌾 **Hello Farmer Friend!**

I encountered a technical issue while preparing recommendations. Please provide the following information:

1. What is your crop?
2. What is the current problem?
3. What is the crop stage?

With this information, I can provide you proper guidance.

📞 For urgent help: Contact your nearest Krishi Vigyan Kendra (KVK).`
  };
  
  return fallbacks[lang] || fallbacks['en'];
}

/**
 * Generate response when ALL actions were filtered
 */
function generateAllActionsFilteredResponse(
  filteredActions: any[], 
  lang: 'mr' | 'hi' | 'en'
): string {
  const parts: string[] = [];
  
  // Greeting
  const greetings: Record<string, string> = {
    mr: 'नमस्कार शेतकरी मित्र! 🌾',
    hi: 'नमस्कार किसान मित्र! 🌾',
    en: 'Hello farmer friend! 🌾'
  };
  parts.push(greetings[lang]);
  
  // Explanation
  const explanations: Record<string, string> = {
    mr: '⚠️ सध्या या परिस्थितीत शिफारसी देणे शक्य नाही. कारणे खालीलप्रमाणे:',
    hi: '⚠️ वर्तमान में इस स्थिति में सिफारिशें देना संभव नहीं है। कारण इस प्रकार हैं:',
    en: '⚠️ Unable to provide recommendations at this time. Here\'s why:'
  };
  parts.push(explanations[lang]);
  
  // List filtered reasons by category
  const categoryReasons: Record<string, string[]> = {};
  filteredActions.forEach(action => {
    const category = action.filter_category || 'UNKNOWN';
    if (!categoryReasons[category]) categoryReasons[category] = [];
    categoryReasons[category].push(action.reason || action.action);
  });
  
  const categoryLabels: Record<string, Record<string, string>> = {
    REGULATORY: {
      mr: '📋 नियामक निर्बंध',
      hi: '📋 नियामक प्रतिबंध',
      en: '📋 Regulatory Restrictions'
    },
    SAFETY: {
      mr: '🛡️ सुरक्षा कारणे',
      hi: '🛡️ सुरक्षा कारण',
      en: '🛡️ Safety Reasons'
    },
    SEASONAL: {
      mr: '📅 हंगाम-संबंधित',
      hi: '📅 मौसम-संबंधित',
      en: '📅 Seasonal Restrictions'
    },
    WEATHER: {
      mr: '🌧️ हवामान-संबंधित',
      hi: '🌧️ मौसम-संबंधित',
      en: '🌧️ Weather Conditions'
    },
    ECONOMIC: {
      mr: '💰 आर्थिक कारणे',
      hi: '💰 आर्थिक कारण',
      en: '💰 Economic Factors'
    },
    COMPATIBILITY: {
      mr: '⚗️ सुसंगतता समस्या',
      hi: '⚗️ संगतता समस्या',
      en: '⚗️ Compatibility Issues'
    },
    UNKNOWN: {
      mr: 'ℹ️ इतर कारणे',
      hi: 'ℹ️ अन्य कारण',
      en: 'ℹ️ Other Reasons'
    }
  };
  
  Object.entries(categoryReasons).forEach(([category, reasons]) => {
    const label = categoryLabels[category]?.[lang] || category;
    parts.push(`\n${label}:`);
    reasons.slice(0, 2).forEach(reason => {
      parts.push(`  • ${reason}`);
    });
  });
  
  // Suggestion
  const suggestions: Record<string, string> = {
    mr: '\n💡 **पुढे काय करावे:**\n1. हवामान सुधारण्याची प्रतीक्षा करा\n2. पीक टप्पा बदलल्यावर पुन्हा विचारा\n3. कृषी अधिकाऱ्यांशी संपर्क साधा',
    hi: '\n💡 **आगे क्या करें:**\n1. मौसम सुधरने का इंतज़ार करें\n2. फसल चरण बदलने पर फिर से पूछें\n3. कृषि अधिकारियों से संपर्क करें',
    en: '\n💡 **What to do next:**\n1. Wait for weather conditions to improve\n2. Ask again when crop stage changes\n3. Contact your local agricultural officer'
  };
  parts.push(suggestions[lang]);
  
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

function extractAndAuditActionsWithFilterTrace(orchestratorResponse: OrchestratorResponse, traceId: string): {
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
    
    // Validation: Check required fields
    const validationErrors: string[] = [];
    if (!primary.action_type) validationErrors.push('primary.action_type missing');
    if (!primary.priority && primary.action_type !== 'NO_ACTION') {
      validationErrors.push('primary.priority missing');
    }
    
    // Build enriched action object with title/description
    const enrichedAction = {
      type: 'primary',
      action_type: primary.action_type,
      // Generate title from action type
      title: generateActionTitle(primary, 'mr'),
      // Generate description from action details
      description: generateActionDescription(primary, 'mr'),
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
  const pestCode = primary.target?.pest_code;
  const diseaseCode = primary.target?.disease_code;
  
  const titles: Record<string, Record<string, string>> = {
    SPRAY: {
      mr: productName ? `${productName} फवारणी` : 'किटकनाशक फवारणी',
      hi: productName ? `${productName} छिड़काव` : 'कीटनाशक छिड़काव',
      en: productName ? `Apply ${productName}` : 'Insecticide Spray'
    },
    FERTILIZER: {
      mr: 'खत देणे',
      hi: 'उर्वरक देना',
      en: 'Apply Fertilizer'
    },
    NO_ACTION: {
      mr: 'कोणतीही कृती नाही',
      hi: 'कोई कार्रवाई नहीं',
      en: 'No Action Required'
    },
    MONITOR_ONLY: {
      mr: 'निरीक्षण करा',
      hi: 'निगरानी करें',
      en: 'Monitor Only'
    }
  };
  
  return titles[actionType]?.[lang] || titles[actionType]?.en || actionType;
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
function getResponseContent(response: OrchestratorResponse, language: string): string {
  const lang = language as 'mr' | 'hi' | 'en';
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
        return buildFormattedRecommendationsList(decisionOutput, lang);
      }
      
      // Step 3: Fallback - only when truly no recommendations
      console.log(`   ⚠️ No valid communication or decision_output - generating fallback`);
      return generateNoRecommendationsFallback(response, lang);
      
    case 'CLARIFICATION_QUESTION':
      const questionText = lang === 'mr' ? (response.question?.text_mr || '') :
                          lang === 'hi' ? (response.question?.text_hi || '') :
                          (response.question?.text_en || '');
      // Never silent - if no question text, generate clarification prompt
      return questionText || generateClarificationPrompt(response, lang);
      
    case 'PHOTO_REQUEST':
      return lang === 'mr' ? (response.photo_instructions?.text_mr || '') :
             lang === 'hi' ? (response.photo_instructions?.text_hi || '') :
             (response.photo_instructions?.text_en || '');
    case 'SAFETY_BLOCKED':
      return lang === 'mr' ? (response.blocked_reason?.reason_mr || '') :
             lang === 'hi' ? (response.blocked_reason?.reason_hi || '') :
             (response.blocked_reason?.reason_en || '');
    case 'ESCALATION_REQUIRED':
      return lang === 'mr' ? (response.escalation?.message_mr || '') :
             lang === 'hi' ? (response.escalation?.message_hi || '') :
             (response.escalation?.message_en || '');
    case 'LLM_RESPONSE':
      return response.llm_response || 
             (response.escalation?.message_mr || '') ||
             (response.escalation?.message_en || '');
    
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
 * FALLBACK: When decision brain runs but produces no recommendations
 * Generates explanatory message asking for more information
 */
function generateNoRecommendationsFallback(response: OrchestratorResponse, lang: 'mr' | 'hi' | 'en'): string {
  const parts: string[] = [];
  
  // Greeting
  const greetings: Record<string, string> = {
    mr: 'नमस्कार शेतकरी मित्र! 🌾',
    hi: 'नमस्कार किसान मित्र! 🌾',
    en: 'Hello farmer friend! 🌾'
  };
  parts.push(greetings[lang]);
  
  // Extract context clues from response
  const nluIntent = response.metadata?.nlu_output?.primary_intent;
  const detectedPest = response.metadata?.nlu_output?.pest_mentions?.[0];
  const detectedDisease = response.metadata?.nlu_output?.disease_mentions?.[0];
  const detectedCrop = response.metadata?.nlu_output?.crop_mentions?.[0];
  
  // Build context-aware message
  if (detectedPest || detectedDisease) {
    const target = detectedPest || detectedDisease;
    const messages: Record<string, string> = {
      mr: `तुमच्या ${target} समस्येबद्दल माहिती मिळाली. अचूक शिफारसी देण्यासाठी मला आणखी काही माहिती हवी:`,
      hi: `आपकी ${target} समस्या के बारे में जानकारी मिली। सटीक सिफारिशों के लिए मुझे और जानकारी चाहिए:`,
      en: `I understand you're dealing with ${target}. To give accurate recommendations, I need more information:`
    };
    parts.push(messages[lang]);
  } else {
    const messages: Record<string, string> = {
      mr: 'तुमच्या प्रश्नाचे योग्य उत्तर देण्यासाठी मला आणखी काही माहिती हवी:',
      hi: 'आपके प्रश्न का सही उत्तर देने के लिए मुझे और जानकारी चाहिए:',
      en: 'To properly answer your question, I need some more information:'
    };
    parts.push(messages[lang]);
  }
  
  // Numbered list of required information
  const questions: Record<string, string[]> = {
    mr: [
      '1. पिकाचे नाव काय आहे?',
      '2. पिकाची सध्याची अवस्था (वाढीचा टप्पा) काय आहे?',
      '3. समस्येची लक्षणे काय दिसत आहेत?',
      '4. शक्य असल्यास प्रभावित पानांचा/रोपांचा फोटो पाठवा'
    ],
    hi: [
      '1. फसल का नाम क्या है?',
      '2. फसल की वर्तमान अवस्था (विकास चरण) क्या है?',
      '3. समस्या के लक्षण क्या दिख रहे हैं?',
      '4. यदि संभव हो तो प्रभावित पत्तियों/पौधों की तस्वीर भेजें'
    ],
    en: [
      '1. What is the crop name?',
      '2. What is the current growth stage?',
      '3. What symptoms are you seeing?',
      '4. If possible, send a photo of the affected leaves/plants'
    ]
  };
  parts.push('\n' + questions[lang].join('\n'));
  
  // Encouragement
  const closings: Record<string, string> = {
    mr: '\nही माहिती मिळाल्यावर मी तुम्हाला योग्य शिफारस देईन! 🙏',
    hi: '\nयह जानकारी मिलने पर मैं आपको सही सिफारिश दूंगा! 🙏',
    en: '\nOnce I have this information, I can give you the right recommendation! 🙏'
  };
  parts.push(closings[lang]);
  
  return parts.join('\n\n');
}

/**
 * Build formatted numbered list from decision output
 */
function buildFormattedRecommendationsList(decision: any, lang: 'mr' | 'hi' | 'en'): string {
  const parts: string[] = [];
  
  // Greeting
  const greetings: Record<string, string> = {
    mr: 'नमस्कार शेतकरी मित्र! 🌾',
    hi: 'नमस्कार किसान मित्र! 🌾',
    en: 'Hello farmer friend! 🌾'
  };
  parts.push(greetings[lang]);
  
  const primary = decision.primary_decision;
  
  // Status handling
  if (decision.status === 'BLOCKED') {
    const blockedReason = decision.blocked_actions?.[0]?.reason || 'Safety check required';
    const blockedMessages: Record<string, string> = {
      mr: `⚠️ **थांबा:** ${blockedReason}`,
      hi: `⚠️ **रुकें:** ${blockedReason}`,
      en: `⚠️ **Stop:** ${blockedReason}`
    };
    parts.push(blockedMessages[lang]);
    return parts.join('\n\n');
  }
  
  if (decision.status === 'WEATHER_DELAYED') {
    const delayMessages: Record<string, string> = {
      mr: '⏱️ **फवारणी पुढे ढकला** - हवामान सुधारल्यावर फवारणी करा. सध्या पिकाचे निरीक्षण सुरू ठेवा.',
      hi: '⏱️ **छिड़काव टालें** - मौसम साफ होने पर छिड़काव करें। अभी फसल की निगरानी जारी रखें।',
      en: '⏱️ **Postpone spray** - Spray when weather clears. Continue crop monitoring for now.'
    };
    parts.push(delayMessages[lang]);
    return parts.join('\n\n');
  }
  
  // Action type - NO ACTION
  if (primary?.action_type === 'NO_ACTION' || primary?.action_type === 'MONITOR_ONLY') {
    const monitorMessages: Record<string, string> = {
      mr: '👀 **सध्या कोणतीही कृती आवश्यक नाही.** निरीक्षण सुरू ठेवा.',
      hi: '👀 **अभी कोई कार्रवाई आवश्यक नहीं।** निगरानी जारी रखें।',
      en: '👀 **No action required at this time.** Continue monitoring.'
    };
    parts.push(monitorMessages[lang]);
    return parts.join('\n\n');
  }
  
  // Primary recommendation as numbered list
  if (primary) {
    const actionHeaders: Record<string, string> = {
      mr: '📌 **शिफारसी:**',
      hi: '📌 **सिफारिशें:**',
      en: '📌 **Recommendations:**'
    };
    parts.push(actionHeaders[lang]);
    
    let recNumber = 1;
    const recParts: string[] = [];
    
    // Primary action - CRITICAL FIX: Translate chemical names to farmer-friendly language
    const rawProductName = primary.application_details?.product_name || '';
    // Use translation dictionary for farmer-friendly names
    const productName = rawProductName ? getProductName(rawProductName, lang) : (
      lang === 'mr' ? 'शिफारस केलेले उत्पादन' : 
      lang === 'hi' ? 'सिफारिश किया गया उत्पाद' : 
      'Recommended product'
    );
    const dosage = primary.application_details?.concentration || '';
    const timing = primary.timing?.best_time_of_day || 'MORNING';
    const method = primary.application_details?.method || primary.application_details?.application_method || '';
    
    let primaryText = `**${recNumber}. ${productName}**`;
    if (dosage) primaryText += ` @ ${dosage}`;
    
    // Add method - translated
    if (method) {
      const methodText = getMethodTranslation(method, lang);
      primaryText += `\n   📍 ${methodText}`;
    }
    
    // Add timing
    const timingLabels: Record<string, Record<string, string>> = {
      MORNING: { mr: 'सकाळी 6-10 वाजता', hi: 'सुबह 6-10 बजे', en: 'Morning 6-10 AM' },
      EVENING: { mr: 'संध्याकाळी 4-6 वाजता', hi: 'शाम 4-6 बजे', en: 'Evening 4-6 PM' },
      ANY: { mr: 'दिवसातून कधीही', hi: 'दिन में कभी भी', en: 'Any time' }
    };
    const timingText = timingLabels[timing]?.[lang] || timingLabels.MORNING[lang];
    primaryText += `\n   ⏰ ${timingText}`;
    
    // Add efficacy
    const efficacy = primary.expected_outcomes?.efficacy_percent;
    if (efficacy) {
      const efficacyLabel = lang === 'mr' ? 'प्रभावी' : lang === 'hi' ? 'प्रभावी' : 'effective';
      primaryText += ` | 📊 ${efficacy}% ${efficacyLabel}`;
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
  const closings: Record<string, string> = {
    mr: '\n✅ शुभेच्छा! 🙏',
    hi: '\n✅ शुभकामनाएं! 🙏',
    en: '\n✅ Best wishes! 🙏'
  };
  parts.push(closings[lang]);
  
  return parts.join('\n\n');
}

/**
 * Generate clarification prompt when question text is missing
 */
function generateClarificationPrompt(response: OrchestratorResponse, lang: 'mr' | 'hi' | 'en'): string {
  const messages: Record<string, string> = {
    mr: 'कृपया तुमच्या प्रश्नाबद्दल अधिक माहिती द्या. पिकाचे नाव, समस्या आणि लक्षणे सांगा.',
    hi: 'कृपया अपने प्रश्न के बारे में अधिक जानकारी दें। फसल का नाम, समस्या और लक्षण बताएं।',
    en: 'Please provide more details about your question. Tell us the crop name, problem, and symptoms.'
  };
  return messages[lang];
}

/**
 * Generic acknowledgment for unknown response types
 * @deprecated Use generateHelpfulErrorResponse instead
 */
function generateGenericAcknowledgment(lang: 'mr' | 'hi' | 'en'): string {
  return generateHelpfulErrorResponse(lang, '');
}

/**
 * PRODUCTION FIX: Generate helpful error response with actionable guidance
 * Instead of "we will respond shortly", provide immediate value
 */
function generateHelpfulErrorResponse(lang: 'mr' | 'hi' | 'en', fallbackAdvice: string): string {
  const messages: Record<string, string> = {
    mr: `🙏 नमस्कार शेतकरी मित्र!

${fallbackAdvice ? fallbackAdvice + '\n\n' : ''}तुमच्या प्रश्नाचे उत्तर देण्यासाठी मला थोडी माहिती द्या:

📋 **कृपया सांगा:**
1️⃣ तुमचे पीक कोणते आहे?
2️⃣ पिकाचे वय किती दिवस?
3️⃣ काय समस्या दिसत आहे?

📸 शक्य असल्यास प्रभावित भागाचा फोटो पाठवा - अधिक अचूक सल्ला देता येईल!

💡 **तात्पुरता सल्ला:**
• पिकाचे नियमित निरीक्षण करा
• पाणी व्यवस्थापन योग्य ठेवा
• नवीन कीड/रोग दिसल्यास कळवा`,

    hi: `🙏 नमस्कार किसान मित्र!

${fallbackAdvice ? fallbackAdvice + '\n\n' : ''}आपके प्रश्न का उत्तर देने के लिए थोड़ी जानकारी दें:

📋 **कृपया बताएं:**
1️⃣ आपकी फसल कौन सी है?
2️⃣ फसल की उम्र कितने दिन?
3️⃣ क्या समस्या दिख रही है?

📸 यदि संभव हो तो प्रभावित भाग का फोटो भेजें - अधिक सटीक सलाह दे पाऊंगा!

💡 **तात्कालिक सलाह:**
• फसल का नियमित निरीक्षण करें
• पानी प्रबंधन सही रखें
• नई कीट/रोग दिखने पर बताएं`,

    en: `🙏 Hello Farmer Friend!

${fallbackAdvice ? fallbackAdvice + '\n\n' : ''}To answer your question, please provide:

📋 **Tell me:**
1️⃣ What is your crop?
2️⃣ How old is the crop (days)?
3️⃣ What problem are you seeing?

📸 If possible, send a photo of the affected area - I can give more accurate advice!

💡 **Quick tips:**
• Monitor your crop regularly
• Maintain proper water management
• Report any new pest/disease signs`
  };
  
  return messages[lang];
}

/**
 * Fallback: Build natural language response directly from DecisionOutput
 * Used when CommunicationGenerator fails or returns incomplete data
 */
function buildResponseFromDecisionOutput(decision: any, language: string): string {
  if (!decision) {
    return getGenericMonitoringMessage(language);
  }
  
  const parts: string[] = [];
  const lang = language as 'mr' | 'hi' | 'en';
  
  // Greeting
  const greetings: Record<string, string> = {
    mr: 'नमस्कार शेतकरी मित्र! 🌾',
    hi: 'नमस्कार किसान मित्र! 🌾',
    en: 'Hello farmer friend! 🌾'
  };
  parts.push(greetings[lang] || greetings.en);
  
  const primary = decision.primary_decision;
  
  // Status handling
  if (decision.status === 'BLOCKED') {
    const blockedReason = decision.blocked_actions?.[0]?.reason || 'Safety check required';
    const blockedMessages: Record<string, string> = {
      mr: `⚠️ थांबा: ${blockedReason}`,
      hi: `⚠️ रुकें: ${blockedReason}`,
      en: `⚠️ Stop: ${blockedReason}`
    };
    parts.push(blockedMessages[lang]);
    return parts.join('\n\n');
  }
  
  if (decision.status === 'WEATHER_DELAYED') {
    const delayMessages: Record<string, string> = {
      mr: '⏱️ फवारणी पुढे ढकला - हवामान सुधारल्यावर फवारणी करा. सध्या पिकाचे निरीक्षण सुरू ठेवा.',
      hi: '⏱️ छिड़काव टालें - मौसम साफ होने पर छिड़काव करें। अभी फसल की निगरानी जारी रखें।',
      en: '⏱️ Postpone spray - Spray when weather clears. Continue crop monitoring for now.'
    };
    parts.push(delayMessages[lang]);
    return parts.join('\n\n');
  }
  
  // Action type
  if (primary?.action_type === 'NO_ACTION' || primary?.action_type === 'MONITOR_ONLY') {
    const monitorMessages: Record<string, string> = {
      mr: '👀 सध्या कोणतीही कृती आवश्यक नाही. निरीक्षण सुरू ठेवा.',
      hi: '👀 अभी कोई कार्रवाई आवश्यक नहीं। निगरानी जारी रखें।',
      en: '👀 No action required at this time. Continue monitoring.'
    };
    parts.push(monitorMessages[lang]);
    return parts.join('\n\n');
  }
  
  // Primary recommendation - CRITICAL FIX: Translate chemical names to farmer language
  if (primary) {
    const rawProductName = primary.application_details?.product_name || '';
    // Use translation dictionary for farmer-friendly names
    const productName = rawProductName ? getProductName(rawProductName, lang) : (
      lang === 'mr' ? 'शिफारस केलेले औषध' : 
      lang === 'hi' ? 'सिफारिश की गई दवा' : 
      'Recommended treatment'
    );
    const dosage = primary.application_details?.concentration || '';
    const timing = primary.timing?.best_time_of_day || 'MORNING';
    const method = primary.application_details?.method || '';
    
    const actionHeaders: Record<string, string> = {
      mr: '📌 आता काय करावे:',
      hi: '📌 अभी क्या करें:',
      en: '📌 What to do now:'
    };
    parts.push(actionHeaders[lang]);
    
    // Product and dosage - with translated product name
    const productLine = dosage ? `${productName} @ ${dosage}` : productName;
    parts.push(productLine);
    
    // Application method - translated
    if (method) {
      const methodText = getMethodTranslation(method, lang);
      parts.push(`📍 ${methodText}`);
    }
    
    // Timing - with detailed labels
    const timingLabels: Record<string, Record<string, string>> = {
      MORNING: { mr: 'सकाळी 6-10 वाजता फवारणी करा', hi: 'सुबह 6-10 बजे छिड़काव करें', en: 'Spray in the morning 6-10 AM' },
      EVENING: { mr: 'संध्याकाळी 4-6 वाजता फवारणी करा', hi: 'शाम 4-6 बजे छिड़काव करें', en: 'Spray in the evening 4-6 PM' },
      ANY: { mr: 'दिवसातून कधीही', hi: 'दिन में कभी भी', en: 'Any time of day' }
    };
    const timingText = timingLabels[timing]?.[lang] || timingLabels.MORNING[lang];
    parts.push(`⏰ ${timingText}`);
    
    // Efficacy if available
    const efficacy = primary.expected_outcomes?.efficacy_percent;
    if (efficacy) {
      const efficacyText: Record<string, string> = {
        mr: `📊 अपेक्षित परिणामकारकता: ${efficacy}%`,
        hi: `📊 अपेक्षित प्रभावशीलता: ${efficacy}%`,
        en: `📊 Expected efficacy: ${efficacy}%`
      };
      parts.push(efficacyText[lang]);
    }
  }
  
  // Secondary actions - CRITICAL FIX: Translate action names
  if (decision.secondary_actions && decision.secondary_actions.length > 0) {
    const altHeaders: Record<string, string> = {
      mr: '\n🔄 पर्यायी उपाय:',
      hi: '\n🔄 वैकल्पिक उपाय:',
      en: '\n🔄 Alternative measures:'
    };
    parts.push(altHeaders[lang]);
    
    decision.secondary_actions.slice(0, 2).forEach((alt: any) => {
      if (alt.action) {
        // Translate action to farmer language
        const translatedAction = getActionTranslation(alt.action, lang);
        parts.push(`• ${translatedAction}`);
      }
    });
  }
  
  // Closing
  const closings: Record<string, string> = {
    mr: '\nशुभेच्छा! 🙏',
    hi: '\nशुभकामनाएं! 🙏',
    en: '\nBest wishes! 🙏'
  };
  parts.push(closings[lang]);
  
  return parts.join('\n');
}

/**
 * Get generic monitoring message when no decision output is available
 */
function getGenericMonitoringMessage(language: string): string {
  const messages: Record<string, string> = {
    mr: 'नमस्कार! 🌾 तुमच्या पिकाचे निरीक्षण सुरू ठेवा. काही समस्या दिसल्यास आम्हाला कळवा.',
    hi: 'नमस्कार! 🌾 अपनी फसल की निगरानी जारी रखें। कोई समस्या दिखे तो हमें बताएं।',
    en: 'Hello! 🌾 Continue monitoring your crop. Let us know if you notice any issues.'
  };
  return messages[language] || messages.en;
}

/**
 * CRITICAL FIX: Flatten FarmerCommunication structure to readable text
 * Handles the main_message.sections structure properly
 */
function flattenCommunicationToText(comm: any, language: string, requires?: any): string {
  if (!comm) return '';
  
  const lang = language as 'mr' | 'hi' | 'en';
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
  if (comm.main_message_mr && lang === 'mr') return comm.main_message_mr;
  if (comm.main_message_hi && lang === 'hi') return comm.main_message_hi;
  if (comm.main_message_en || comm.main_message) return comm.main_message_en || comm.main_message || '';
  if (comm.notification?.body) return comm.notification.body;
  
  return '';
}

function detectLanguage(text: string, fallback: string): string {
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
    return {
      response: preGeneratedContent, // ← CRITICAL: Use exact same content as DB save
      sessionId: sessionId,
      language: language,
      responseTime: responseTime,
      dataAudit: response.dataAudit,
      actionsReturned: actionsReturned,
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
        // Fallback message when only question_id is provided
        questionText = language === 'mr' ? 'कृपया अधिक माहिती द्या. तुमच्या प्रश्नाबद्दल मला अधिक तपशील सांगा.' :
                       language === 'hi' ? 'कृपया अधिक जानकारी दें। अपने प्रश्न के बारे में मुझे अधिक विवरण बताएं।' :
                       'Please provide more details. Tell me more about your question.';
      } else {
        // Normal case: question is an object with text fields
        questionText = language === 'mr' ? (question?.text_mr || '') :
                       language === 'hi' ? (question?.text_hi || '') :
                       (question?.text_en || 'Please provide more details.');
      }
      
      // Ensure we always have some response text
      if (!questionText) {
        questionText = language === 'mr' ? 'कृपया अधिक माहिती द्या.' :
                       language === 'hi' ? 'कृपया अधिक जानकारी दें।' :
                       'Please provide more details.';
      }
      
      return {
        response: questionText,
        sessionId: sessionId,
        language: language,
        responseTime: responseTime,
        metadata: {
          type: 'clarification',
          question_id: typeof question === 'string' ? question : question?.question_id,
          options: typeof question === 'object' ? question?.options : undefined
        },
        quickReplies: (typeof question === 'object' && question?.options) 
          ? question.options.map((o: any) => o.label) 
          : getDefaultQuickReplies(language),
        source: 'orchestrator_v1'
      };

    case 'PHOTO_REQUEST':
      // Need photo for diagnosis
      const photoInstr = response.photo_instructions;
      const photoText = language === 'mr' ? photoInstr?.text_mr :
                       language === 'hi' ? photoInstr?.text_hi :
                       photoInstr?.text_en || 'Please send a photo.';
      
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
      const blockedText = language === 'mr' ? blockedReason?.reason_mr :
                         language === 'hi' ? blockedReason?.reason_hi :
                         blockedReason?.reason_en || 'This treatment is not safe.';
      
      let alternativesText = '';
      if (response.alternatives && response.alternatives.length > 0) {
        alternativesText = '\n\nसुरक्षित विकल्प:\n' + 
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
      const escText = language === 'mr' ? esc?.message_mr :
                     language === 'hi' ? esc?.message_hi :
                     esc?.message_en || 'Connecting you with an expert.';
      
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
      const helpfulMessages: Record<string, string> = {
        'mr': `🙏 तुमच्या प्रश्नावर काम करत आहे.

${fallbackAdvice || 'कृपया तुमचा प्रश्न पुन्हा विचारा किंवा अधिक माहिती द्या.'}

📋 मला मदत करा:
• तुमचे पीक कोणते?
• समस्या काय आहे?
• फोटो पाठवू शकता का?`,
        'hi': `🙏 आपके प्रश्न पर काम कर रहा हूं।

${fallbackAdvice || 'कृपया अपना प्रश्न दोबारा पूछें या अधिक जानकारी दें।'}

📋 मेरी मदद करें:
• आपकी फसल कौन सी?
• समस्या क्या है?
• फोटो भेज सकते हैं?`,
        'en': `🙏 Working on your question.

${fallbackAdvice || 'Please ask your question again or provide more details.'}

📋 Help me help you:
• What is your crop?
• What is the problem?
• Can you send a photo?`
      };
      
      return {
        response: helpfulMessages[language] || helpfulMessages['en'],
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
  
  // Legacy fallback: Try to get language-specific message
  if (language === 'mr' && comm.main_message_mr) return comm.main_message_mr;
  if (language === 'hi' && comm.main_message_hi) return comm.main_message_hi;
  if (language === 'en' && comm.main_message_en) return comm.main_message_en;
  
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
  const lang = language as 'mr' | 'hi' | 'en';
  
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
  if (lang === 'mr') {
    // Marathi questions
    if (hasPest || hasDisease || hasSpray) {
      questions.push(`💊 ${cropName ? cropName + 'साठी' : ''} औषध किती दिवसांनी पुन्हा फवारावे?`);
      questions.push('💰 या उपचाराने किती नुकसान टळेल?');
      if (hasBiologicalAction) {
        questions.push('🦠 ट्रायकोग्रामा कुठे मिळेल?');
      }
    }
    if (hasDiagnosis) {
      questions.push('🔍 मी कसे खात्री करू की हेच कारण आहे?');
      questions.push('📸 फोटो पाठवू का तपासणीसाठी?');
    }
    if (hasFertilizer) {
      questions.push(`📊 ${cropName || 'पीक'}साठी किती खत द्यावे?`);
      questions.push('💵 या खताने उत्पादन किती वाढेल?');
    }
    if (hasIrrigation) {
      questions.push('💧 पुढचे पाणी कधी द्यावे?');
      questions.push('🌧️ पाऊस आला तर पाणी द्यावे का?');
    }
    // Add general follow-ups if less than 3
    if (questions.length < 3) {
      questions.push('📅 उद्या सर्वात आधी काय करू?');
    }
    if (questions.length < 3) {
      questions.push('📈 माझ्या पिकाची वाढ कशी आहे?');
    }
  } else if (lang === 'hi') {
    // Hindi questions
    if (hasPest || hasDisease || hasSpray) {
      questions.push(`💊 ${cropName ? cropName + ' पर' : ''} दोबारा स्प्रे कब करें?`);
      questions.push('💰 इस इलाज से कितना नुकसान बचेगा?');
      if (hasBiologicalAction) {
        questions.push('🦠 ट्राइकोग्रामा कहां मिलेगा?');
      }
    }
    if (hasDiagnosis) {
      questions.push('🔍 मैं कैसे पक्का करूं कि यही कारण है?');
      questions.push('📸 जांच के लिए फोटो भेजूं?');
    }
    if (hasFertilizer) {
      questions.push(`📊 ${cropName || 'फसल'} को कितना खाद दूं?`);
      questions.push('💵 इस खाद से उपज कितनी बढ़ेगी?');
    }
    if (hasIrrigation) {
      questions.push('💧 अगला पानी कब दूं?');
      questions.push('🌧️ बारिश आए तो भी पानी दूं?');
    }
    if (questions.length < 3) {
      questions.push('📅 कल सबसे पहले क्या करूं?');
    }
    if (questions.length < 3) {
      questions.push('📈 मेरी फसल की बढ़त कैसी है?');
    }
  } else {
    // English questions
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
  }
  
  // Return up to 4 unique questions
  const uniqueQuestions = [...new Set(questions)];
  return uniqueQuestions.slice(0, 4);
}

function getDefaultQuickReplies(language: string): string[] {
  if (language === 'mr') {
    return [
      '🌅 आज काय करावे?',
      '💧 पाणी द्यावे का?',
      '🌾 माझे पीक कसे आहे?',
      '📅 पुढील काम कधी?'
    ];
  }
  if (language === 'hi') {
    return [
      '🌅 आज क्या करूं?',
      '💧 पानी देना है?',
      '🌾 फसल कैसी है?',
      '📅 अगला काम कब?'
    ];
  }
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
