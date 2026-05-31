/**
 * General Chat Handler — direct LLM (no symbolic brain)
 *
 * Used by the "General" tab of the farmer chat: any open-ended agriculture
 * question goes straight to a senior-agronomist persona without running the
 * 9-agent diagnostic orchestrator. If the farmer attached a land context, we
 * pass it as authoritative facts; otherwise we answer generally.
 *
 * Reuses the existing _shared/aiConfig helpers so we add **no** new edge
 * function and **no** new provider plumbing.
 */

import {
  getBestAvailableProvider,
  buildAIRequest,
  getAPIEndpoint,
  AI_CONFIG,
} from '../_shared/aiConfig.ts';

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

function buildSeniorAgronomistSystemPrompt(
  language: string,
  landContext: any | null,
): string {
  const langName = LANG_NAMES[language] || 'English';
  const landBlock = landContext
    ? `LAND_CONTEXT (authoritative — use these facts):\n${JSON.stringify(landContext, null, 2)}`
    : 'LAND_CONTEXT: none (farmer asked a general question without a specific land)';

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

${landBlock}`;
}

export interface GeneralChatHandlerArgs {
  supabase: any;
  traceId: string;
  farmerId: string;
  tenantId: string;
  sessionId: string;
  language: string;
  // The full messages[] from the request body (last entry = current user msg)
  messages: Array<{ role: string; content: string }>;
  // Optional land context attached by the farmer via the picker
  landContext: any | null;
  // CORS headers from the caller
  corsHeaders: Record<string, string>;
  // Optional previously-fetched DB history (chronological)
  conversationHistory?: Array<{ role: string; content: string }>;
}

export async function handleGeneralChat(
  args: GeneralChatHandlerArgs,
): Promise<Response> {
  const {
    supabase, traceId, farmerId, tenantId, sessionId,
    language, messages, landContext, corsHeaders, conversationHistory = [],
  } = args;

  const lastMsg = messages[messages.length - 1];
  const userText = (typeof lastMsg === 'string' ? lastMsg : lastMsg?.content || '').trim();

  if (!userText) {
    return new Response(
      JSON.stringify({ error: 'Empty message' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  console.log(`💬 [${traceId}] GENERAL_CHAT direct-LLM | lang=${language} | landCtx=${!!landContext}`);

  // 1. Persist user message immediately
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
    console.warn(`[${traceId}] GENERAL_CHAT: user message persist failed`, (e as Error).message);
  }

  // 2. Build LLM request
  const systemPrompt = buildSeniorAgronomistSystemPrompt(language, landContext);

  // Use up to last 12 turns of history (DB-loaded preferred, fall back to body history).
  // CRITICAL: strip symbolic-clarification turns ("Which part of the plant…",
  // numbered option lists, observation_key markers) so the senior agronomist is
  // not biased by past Decision-Brain output that belongs to land-specific chat.
  const SYMBOLIC_HINTS = /(\[obs_keys?:|\[cause:|\[rule_id:|which part of the plant|एक पर्याय निवडा|एक विकल्प चुनें)/i;
  const history = (conversationHistory.length ? conversationHistory : messages.slice(0, -1))
    .slice(-12)
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    }))
    .filter(m => m.content.trim().length > 0)
    .filter(m => !(m.role === 'assistant' && SYMBOLIC_HINTS.test(m.content)));

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
    const timeout = setTimeout(() => controller.abort(), AI_CONFIG.REQUEST_TIMEOUT);

    const llmRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!llmRes.ok) {
      const errText = await llmRes.text().catch(() => '');
      console.error(`[${traceId}] GENERAL_CHAT LLM ${llmRes.status}:`, errText.slice(0, 300));
      throw new Error(`LLM_HTTP_${llmRes.status}`);
    }

    const json = await llmRes.json();
    answer = (json?.choices?.[0]?.message?.content || '').toString().trim();
  } catch (e) {
    console.error(`[${traceId}] GENERAL_CHAT LLM call failed:`, (e as Error).message);
    // Fallback localized message
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

  // 3. Persist assistant response
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
    console.warn(`[${traceId}] GENERAL_CHAT: assistant persist failed`, (e as Error).message);
  }

  return new Response(
    JSON.stringify({
      response: answer,
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
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  );
}
