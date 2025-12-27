/**
 * AI Agriculture Chat - Orchestrator-Based Entry Point
 * Full migration to 9-agent orchestrator system
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { checkRateLimit } from '../_shared/rateLimiter.ts';

// Import orchestrator
import { AIAgentOrchestrator } from './agents/orchestrator.ts';
import type { OrchestratorResponse } from './agents/orchestrator.ts';

// Import legacy helpers for backward compatibility
import { generateMultilingualQuickReplies } from './multilingual-quick-replies.ts';
import { parseResponseToCards } from './response-parser.ts';
import { localizeResponse } from './response-localizer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token',
};

// Initialize orchestrator singleton
let orchestrator: AIAgentOrchestrator | null = null;

function getOrchestrator(): AIAgentOrchestrator {
  if (!orchestrator) {
    orchestrator = new AIAgentOrchestrator();
  }
  return orchestrator;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

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
    // SESSION MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    let currentSessionId = sessionId;
    
    if (!currentSessionId) {
      // Create new session
      const { data: newSession, error: sessionError } = await supabase
        .from('ai_chat_sessions')
        .insert({
          tenant_id: finalTenantId,
          farmer_id: finalFarmerId,
          land_id: landId || null,
          session_type: landId ? 'land_specific' : 'general',
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
      console.log('📝 New session created:', currentSessionId);
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

    // Detect language from message
    const detectedLanguage = detectLanguage(userMessageContent, language);

    console.log('🚀 [Orchestrator] Processing message:', {
      sessionId: currentSessionId,
      farmerId: finalFarmerId,
      language: detectedLanguage,
      hasImage: !!imageUrl,
      messagePreview: userMessageContent.substring(0, 50)
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CALL ORCHESTRATOR - THE NEW 9-AGENT FLOW
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
        landId: landId
      }
    );

    console.log('✅ [Orchestrator] Response type:', orchestratorResponse.type);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3: STORE MESSAGES FOR TRAINING & ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════
    const responseTime = Date.now() - startTime;
    
    // Store user message
    try {
      await supabase.from('ai_chat_messages').insert({
        session_id: currentSessionId,
        tenant_id: finalTenantId,
        farmer_id: finalFarmerId,
        role: 'user',
        content: userMessageContent,
        language: detectedLanguage,
        message_type: imageUrl ? 'image_analysis' : 'text',
        image_urls: imageUrl ? [imageUrl] : null,
        is_training_candidate: true,
        inferred_intent: orchestratorResponse.metadata?.agents_used?.includes('NLU') ? 'PROCESSED' : null,
        conversation_turn_number: messages.length,
        metadata: {
          source: 'orchestrator_v1',
          has_image: !!imageUrl,
          land_id: landId
        }
      });
      
      // Store assistant response
      const responseContent = getResponseContent(orchestratorResponse, detectedLanguage);
      await supabase.from('ai_chat_messages').insert({
        session_id: currentSessionId,
        tenant_id: finalTenantId,
        farmer_id: finalFarmerId,
        role: 'assistant',
        content: responseContent,
        language: detectedLanguage,
        message_type: 'orchestrator',
        response_time_ms: responseTime,
        decision_brain_source: true,
        is_training_candidate: true,
        conversation_turn_number: messages.length + 1,
        metadata: {
          orchestrator_type: orchestratorResponse.type,
          confidence: orchestratorResponse.metadata?.confidence,
          safety_status: orchestratorResponse.metadata?.safety_status,
          rules_applied: orchestratorResponse.metadata?.rules_applied,
          agents_used: orchestratorResponse.metadata?.agents_used,
          decision_id: orchestratorResponse.decision_id
        }
      });
      
      console.log('💾 [Storage] Messages saved for training');
    } catch (storageError) {
      console.warn('⚠️ [Storage] Failed to save messages:', storageError);
      // Continue - don't fail the request for storage issues
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSFORM ORCHESTRATOR RESPONSE TO LEGACY FORMAT
    // ═══════════════════════════════════════════════════════════════════════════
    const responsePayload = transformOrchestratorResponse(
      orchestratorResponse,
      detectedLanguage,
      currentSessionId,
      startTime
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // UPDATE SESSION ACTIVITY
    // ═══════════════════════════════════════════════════════════════════════════
    await supabase
      .from('ai_chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentSessionId);

    return new Response(
      JSON.stringify(responsePayload),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [ai-agriculture-chat] Error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getResponseContent(response: OrchestratorResponse, language: string): string {
  switch (response.type) {
    case 'DECISION_PROVIDED':
      const comm = response.communication;
      return language === 'mr' ? (comm?.message_text?.mr || comm?.message_text?.en || '') :
             language === 'hi' ? (comm?.message_text?.hi || comm?.message_text?.en || '') :
             (comm?.message_text?.en || '');
    case 'CLARIFICATION_QUESTION':
      return language === 'mr' ? (response.question?.text_mr || '') :
             language === 'hi' ? (response.question?.text_hi || '') :
             (response.question?.text_en || '');
    case 'PHOTO_REQUEST':
      return language === 'mr' ? (response.photo_instructions?.text_mr || '') :
             language === 'hi' ? (response.photo_instructions?.text_hi || '') :
             (response.photo_instructions?.text_en || '');
    case 'SAFETY_BLOCKED':
      return language === 'mr' ? (response.blocked_reason?.reason_mr || '') :
             language === 'hi' ? (response.blocked_reason?.reason_hi || '') :
             (response.blocked_reason?.reason_en || '');
    case 'ESCALATION_REQUIRED':
      return language === 'mr' ? (response.escalation?.message_mr || '') :
             language === 'hi' ? (response.escalation?.message_hi || '') :
             (response.escalation?.message_en || '');
    default:
      return 'Response generated';
  }
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
        metadata: {
          type: 'decision',
          confidence: response.metadata?.confidence,
          safety_status: response.metadata?.safety_status,
          rules_applied: response.metadata?.rules_applied,
          agents_used: response.metadata?.agents_used,
          decision_id: response.decision_id
        },
        quickReplies: generateQuickRepliesFromCommunication(comm, language),
        source: 'orchestrator_v1'
      };

    case 'CLARIFICATION_QUESTION':
      // System needs more info
      const question = response.question;
      const questionText = language === 'mr' ? question?.text_mr :
                          language === 'hi' ? question?.text_hi :
                          question?.text_en || 'Please provide more details.';
      
      return {
        response: questionText,
        sessionId: sessionId,
        language: language,
        responseTime: responseTime,
        metadata: {
          type: 'clarification',
          question_id: question?.question_id,
          options: question?.options
        },
        quickReplies: question?.options?.map((o: any) => o.label) || [],
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
      // Error case
      const errorMessages: Record<string, string> = {
        'en': '🙏 Sorry, I had trouble answering your question. Please try again.',
        'hi': '🙏 क्षमा करें, मुझे आपके प्रश्न का उत्तर देने में समस्या हुई। कृपया पुनः प्रयास करें।',
        'mr': '🙏 माफ करा, मला तुमच्या प्रश्नाचे उत्तर देण्यात अडचण आली. कृपया पुन्हा प्रयत्न करा.',
      };
      
      return {
        response: errorMessages[language] || errorMessages['en'],
        sessionId: sessionId,
        language: language,
        responseTime: responseTime,
        metadata: {
          type: 'error',
          error: response.error?.message
        },
        source: 'orchestrator_v1'
      };
  }
}

function getLocalizedMessage(comm: any, language: string): string {
  if (!comm) return '';
  
  // Try to get language-specific message
  if (language === 'mr' && comm.main_message_mr) return comm.main_message_mr;
  if (language === 'hi' && comm.main_message_hi) return comm.main_message_hi;
  if (language === 'en' && comm.main_message_en) return comm.main_message_en;
  
  // Fallback to main_message
  return comm.main_message || '';
}

function generateQuickRepliesFromCommunication(comm: any, language: string): string[] {
  if (!comm) return getDefaultQuickReplies(language);
  
  // If communication has follow-up options
  if (comm.follow_up_options && Array.isArray(comm.follow_up_options)) {
    return comm.follow_up_options.slice(0, 4);
  }
  
  return getDefaultQuickReplies(language);
}

function getDefaultQuickReplies(language: string): string[] {
  if (language === 'hi' || language === 'mr') {
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
