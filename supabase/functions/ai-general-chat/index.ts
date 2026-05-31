/**
 * ai-general-chat — DEDICATED edge function for the General chat tab.
 *
 * Pure direct-LLM "Senior Agronomist" advisor. NO symbolic decision brain,
 * NO 9-agent orchestrator, NO proactive-narration, NO clarification cards.
 *
 * The land-specific chat keeps using `ai-agriculture-chat` (symbolic brain).
 * This separation is the SSOT for routing — by function name, not by flags.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  getBestAvailableProvider,
  buildAIRequest,
  getAPIEndpoint,
  AI_CONFIG,
} from '../_shared/aiConfig.ts';
import {
  loadFarmerProfileLite,
  getFarmerAddressing,
  type FarmerAddressing,
} from '../_shared/farmerAddressing.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token, x-client-domain, if-none-match, origin, cache-control, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari)',
  mr: 'Marathi (Devanagari)',
  pa: 'Punjabi (Gurmukhi)',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  gu: 'Gujarati',
  bn: 'Bengali',
  or: 'Odia',
  ml: 'Malayalam',
  ur: 'Urdu',
};

// Filter previous symbolic / clarification turns so the senior agronomist is
// not biased by past Decision-Brain output (which belongs to land-specific chat).
const SYMBOLIC_HINTS =
  /(\[obs_keys?:|\[cause:|\[rule_id:|which part of the plant|एक पर्याय निवडा|एक विकल्प चुनें)/i;

function buildSystemPrompt(
  language: string,
  landContext: any | null,
  addressing: FarmerAddressing | null,
): string {
  const langName = LANG_NAMES[language] || 'English';
  const landBlock = landContext
    ? `LAND_CONTEXT (authoritative — use these facts):\n${JSON.stringify(landContext, null, 2)}`
    : 'LAND_CONTEXT: none (farmer asked a general question without a specific land)';

  const addressingBlock = addressing ? `\n\n${addressing.promptDirective}\n` : '';

  return `You are a SENIOR AGRONOMIST with 25+ years of on-field, rural farming
experience across Indian smallholder agriculture. You advise farmers in clear,
practical, season-aware language they can act on the same day.

HARD RULES:
- Answer ONLY agriculture topics (crops, soil, water, fertilizer, pest /
  disease, weather, market, schemes, livestock, post-harvest). If the
  question is off-topic, politely steer back to farming in ONE sentence.
- Reply in the farmer's language: ${langName}. Use its NATIVE SCRIPT only.
  Do not mix English words unless they are well-known trade names
  (e.g., Urea, DAP, Imidacloprid).
- Use simple rural vocabulary — like an elder advisor in the village, not a
  textbook. Short sentences. Plain markdown only.
- If LAND_CONTEXT is provided, use crop, growth stage, area, soil, district,
  season and recent weather to ground the answer. If missing, give the best
  general guidance and briefly note ONE extra detail that would sharpen the
  answer next time.
- Be specific: name inputs, dosages per acre, timings, and PHI (pre-harvest
  interval) when relevant. Prefer organic / IPM first, then chemical only
  when justified. Never invent regulatory approvals — if unsure, say so.
- NEVER ask the farmer to "classify" their question, pick an "intent",
  upload a photo, or choose from numbered options. At most ONE short
  follow-up question if it is truly required to answer well.
- Keep the reply under ~250 words. Use short bullets or numbered steps
  where they help readability.
${addressingBlock}
${landBlock}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const traceId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  try {
    // ── Auth headers (custom-auth, same contract as the rest of the app)
    const tenantId = req.headers.get('x-tenant-id') || '';
    const farmerId = req.headers.get('x-farmer-id') || '';
    if (!tenantId || !farmerId) {
      return new Response(
        JSON.stringify({ error: 'Missing x-tenant-id / x-farmer-id header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      messages = [],
      language = 'en',
      landContext = null,
      sessionId: providedSessionId = null,
    } = body || {};

    const lastMsg = messages[messages.length - 1];
    const userText = (typeof lastMsg === 'string' ? lastMsg : lastMsg?.content || '').trim();
    if (!userText) {
      return new Response(
        JSON.stringify({ error: 'Empty message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    console.log(`💬 [${traceId}] ai-general-chat | farmer=${farmerId.slice(0, 8)} lang=${language} landCtx=${!!landContext}`);

    // ── Resolve / create the general (land_id IS NULL) session for this farmer
    let sessionId = providedSessionId as string | null;
    if (sessionId) {
      const { data: check } = await supabase
        .from('ai_chat_sessions')
        .select('id, farmer_id, tenant_id, land_id')
        .eq('id', sessionId)
        .maybeSingle();
      const owned = check?.farmer_id === farmerId && check?.tenant_id === tenantId;
      const isGeneral = check?.land_id === null;
      if (!check || !owned || !isGeneral) {
        sessionId = null; // reject mismatched
      }
    }

    if (!sessionId) {
      const { data: existing } = await supabase
        .from('ai_chat_sessions')
        .select('id')
        .eq('farmer_id', farmerId)
        .eq('tenant_id', tenantId)
        .is('land_id', null)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        sessionId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from('ai_chat_sessions')
          .insert({
            tenant_id: tenantId,
            farmer_id: farmerId,
            land_id: null,
            session_type: 'general',
            is_active: true,
            metadata: { language, source: 'general_chat_v1' },
          })
          .select('id')
          .single();
        if (createErr || !created) {
          console.error(`[${traceId}] session create failed`, createErr);
          return new Response(
            JSON.stringify({ error: 'Failed to create chat session' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        sessionId = created.id;
      }
    }

    // ── Persist user message
    try {
      await supabase.from('ai_chat_messages').insert({
        session_id: sessionId,
        tenant_id: tenantId,
        farmer_id: farmerId,
        role: 'user',
        content: userText,
        metadata: {
          chat_mode: 'general_llm_v1',
          language,
          trace_id: traceId,
          land_context_attached: !!landContext,
        },
      });
    } catch (e) {
      console.warn(`[${traceId}] user persist failed`, (e as Error).message);
    }

    // ── Build LLM messages (filter symbolic-leakage from history)
    // ── Load farmer profile for respectful addressing (presentation-only)
    let addressing: FarmerAddressing | null = null;
    try {
      const profile = await loadFarmerProfileLite(supabase, farmerId, language);
      addressing = getFarmerAddressing({
        language: profile.language || language,
        state: profile.state,
        gender: profile.gender,
        farmer_name: profile.farmer_name,
      });
      console.log(`👤 [${traceId}] addressing: ${addressing.primary} (${addressing.gender}/${profile.state || 'no-state'})`);
    } catch (e) {
      console.warn(`[${traceId}] addressing build failed:`, (e as Error).message);
    }

    const systemPrompt = buildSystemPrompt(language, landContext, addressing);
    const history = (messages.slice(0, -1) as any[])
      .slice(-12)
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      }))
      .filter((m) => m.content.trim().length > 0)
      .filter((m) => !(m.role === 'assistant' && SYMBOLIC_HINTS.test(m.content)));

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userText },
    ];

    let answer = '';
    let usedModel = 'unknown';
    try {
      const { provider, model, apiKey } = getBestAvailableProvider();
      usedModel = `${provider}/${model}`;

      const payload = buildAIRequest(provider, model, chatMessages, {
        maxTokens: AI_CONFIG.MAX_TOKENS_CHAT,
        temperature: 0.6,
        useJsonMode: false,
      });

      const endpoint = getAPIEndpoint(provider);
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), AI_CONFIG.REQUEST_TIMEOUT);

      const llmRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(t);

      if (!llmRes.ok) {
        const errTxt = await llmRes.text().catch(() => '');
        console.error(`[${traceId}] LLM ${llmRes.status}:`, errTxt.slice(0, 300));
        throw new Error(`LLM_HTTP_${llmRes.status}`);
      }
      const json = await llmRes.json();
      answer = (json?.choices?.[0]?.message?.content || '').toString().trim();
    } catch (e) {
      console.error(`[${traceId}] LLM call failed`, (e as Error).message);
      answer = language === 'hi'
        ? 'माफ करें, अभी जवाब तैयार करने में दिक्कत आ रही है। कृपया कुछ देर बाद पुनः प्रयास करें।'
        : language === 'mr'
        ? 'क्षमा करा, सध्या उत्तर तयार करण्यात अडचण येत आहे. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.'
        : 'Sorry, I could not prepare an answer right now. Please try again in a moment.';
    }

    if (!answer) {
      answer = language === 'mr'
        ? 'माझ्याकडे या क्षणी पूर्ण माहिती नाही. कृपया अधिक तपशील द्या.'
        : language === 'hi'
        ? 'मेरे पास इस समय पूरी जानकारी नहीं है। कृपया अधिक विवरण दें।'
        : 'I need a little more detail to help you well.';
    }

    // ── Persist assistant response
    try {
      await supabase.from('ai_chat_messages').insert({
        session_id: sessionId,
        tenant_id: tenantId,
        farmer_id: farmerId,
        role: 'assistant',
        content: answer,
        ai_model: usedModel,
        metadata: {
          chat_mode: 'general_llm_v1',
          orchestrator_type: 'GENERAL_LLM_DIRECT',
          language,
          trace_id: traceId,
          land_context_used: !!landContext,
        },
      });
    } catch (e) {
      console.warn(`[${traceId}] assistant persist failed`, (e as Error).message);
    }

    return new Response(
      JSON.stringify({
        response: answer,
        sessionId,
        responseTime: Date.now() - startedAt,
        metadata: {
          type: 'general_chat',
          orchestrator_type: 'GENERAL_LLM_DIRECT',
          chat_mode: 'general_llm_v1',
          model: usedModel,
          trace_id: traceId,
          language,
          land_context_used: !!landContext,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error(`[${traceId}] fatal`, (e as Error).message);
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: (e as Error).message, trace_id: traceId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
