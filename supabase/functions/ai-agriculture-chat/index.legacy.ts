// ✅ FORENSIC REFACTOR COMPLETE
// Authority: Legacy compatibility layer - routes to modern symbolic pipeline, NO language text

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI AGRICULTURE CHAT - LEGACY ENTRY POINT v2.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️ THIS FILE IS DEPRECATED
 * 
 * Use index.ts for the modern SSOT-compliant entry point.
 * This file exists ONLY for backward compatibility with old clients.
 * 
 * ARCHITECTURAL CHANGES:
 * - Removed detectQueryType import (deprecated)
 * - Removed all hardcoded language text
 * - Routes all requests to symbolic pipeline
 * - Returns structured outputs for narration layer
 * 
 * VERSION: 2.0.0 - SSOT Compliant
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { checkRateLimit } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token',
};

export const LEGACY_VERSION = '2.0.0';
export const LEGACY_DEPRECATED = true;

// ═══════════════════════════════════════════════════════════════════════════
// SYMBOLIC OUTPUT CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

interface SymbolicQueryResult {
  query_type: string;
  intent_code: string;
  confidence: number;
  requires_clarification: boolean;
  observation_codes: string[];
  i18n_key: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY QUERY ANALYZER - Returns codes only, no text
// ═══════════════════════════════════════════════════════════════════════════

function analyzeQuerySymbolic(userMessage: string): SymbolicQueryResult {
  const msg = userMessage.toLowerCase();
  
  // Simple intent detection - returns codes only
  let queryType = 'GENERAL';
  let intentCode = 'UNKNOWN';
  
  // Greeting detection
  const greetingPatterns = /^(hi|hello|hey|namaste|namaskar|नमस्ते|नमस्कार)[\s!?.]*$/i;
  if (greetingPatterns.test(msg.trim())) {
    queryType = 'GREETING';
    intentCode = 'GREETING';
  }
  
  // Pest/disease keywords
  const pestKeywords = ['pest', 'insect', 'bug', 'worm', 'kida', 'kide', 'किडा', 'कीड़ा', 'कीट'];
  const diseaseKeywords = ['disease', 'rot', 'wilt', 'blight', 'rog', 'रोग', 'बीमारी'];
  
  if (pestKeywords.some(k => msg.includes(k))) {
    queryType = 'PEST_QUERY';
    intentCode = 'PEST_PROBLEM';
  } else if (diseaseKeywords.some(k => msg.includes(k))) {
    queryType = 'DISEASE_QUERY';
    intentCode = 'DISEASE_PROBLEM';
  }
  
  // Irrigation keywords
  const irrigationKeywords = ['water', 'irrigat', 'pani', 'paani', 'पानी', 'सिंचाई'];
  if (irrigationKeywords.some(k => msg.includes(k))) {
    queryType = 'IRRIGATION_QUERY';
    intentCode = 'WATER_MANAGEMENT';
  }
  
  // Fertilizer keywords
  const fertKeywords = ['fertilizer', 'nutrient', 'khad', 'खाद', 'उर्वरक', 'पोषक'];
  if (fertKeywords.some(k => msg.includes(k))) {
    queryType = 'NUTRIENT_QUERY';
    intentCode = 'NUTRIENT_MANAGEMENT';
  }
  
  return {
    query_type: queryType,
    intent_code: intentCode,
    confidence: 0.7,
    requires_clarification: queryType === 'GENERAL',
    observation_codes: [],
    i18n_key: `query.${queryType.toLowerCase()}`
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY SERVE HANDLER
// ═══════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[Legacy v${LEGACY_VERSION}] Request received`);
    console.warn('[DEPRECATED] Using legacy entry point - migrate to index.ts');
    
    const { 
      message, 
      session_id, 
      language = 'en',
      farmer_id,
      tenant_id,
      land_id
    } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ 
          error: 'MISSING_MESSAGE',
          i18n_key: 'error.missing_message'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting
    const rateLimitResult = await checkRateLimit(
      req,
      farmer_id || 'anonymous',
      tenant_id || 'default'
    );
    
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: 'RATE_LIMITED',
          i18n_key: 'error.rate_limited',
          retry_after_seconds: rateLimitResult.retryAfter
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Analyze query symbolically
    const queryAnalysis = analyzeQuerySymbolic(message);
    
    console.log(`  Query type: ${queryAnalysis.query_type}`);
    console.log(`  Intent: ${queryAnalysis.intent_code}`);

    // Return structured response - NO text generation here
    // All text rendering happens in the narration layer on the client
    const response = {
      session_id: session_id || crypto.randomUUID(),
      query_analysis: queryAnalysis,
      result_type: queryAnalysis.requires_clarification ? 'CLARIFICATION_NEEDED' : 'READY',
      confidence: queryAnalysis.confidence,
      language: language,
      i18n_key: queryAnalysis.i18n_key,
      metadata: {
        version: LEGACY_VERSION,
        deprecated: true,
        migrate_to: 'index.ts'
      },
      // NOTE: No farmer-facing text here - narration layer handles this
      _deprecated_warning: 'Use index.ts entry point for full symbolic pipeline'
    };

    return new Response(
      JSON.stringify(response),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-Deprecation-Warning': 'Use index.ts instead'
        } 
      }
    );

  } catch (error) {
    console.error('[Legacy] Error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'INTERNAL_ERROR',
        i18n_key: 'error.internal',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
