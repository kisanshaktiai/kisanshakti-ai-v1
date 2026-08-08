/**
 * ai-general-chat — DEDICATED edge function for the General chat tab.
 *
 * Pure direct-LLM "Senior Agronomist" advisor. NO symbolic decision brain,
 * NO 9-agent orchestrator, NO proactive-narration, NO clarification cards.
 *
 * The land-specific chat keeps using `ai-agriculture-chat` (symbolic brain).
 * This separation is the SSOT for routing — by function name, not by flags.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (audit trail — newest first)
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-08-08 — RAG GROUNDING (Stage 3, behind feature flag 'rag_general_chat'):
 *   information-class questions are grounded in retrieved authoritative
 *   evidence (rag_chunks via _shared/ragRetrieval.ts) with real citations
 *   appended in code from retrieval metadata — the LLM never invents them.
 *   Insufficient evidence ⇒ explicit honest-guidance mode selected in code.
 *   High-risk (pesticide/dosage/PHI) questions get the §23 informational
 *   boundary + routing note toward land-specific verified chat.
 *   Flag OFF ⇒ behavior is byte-identical to previous direct-LLM version.
 *   RAG NEVER touches ai-agriculture-chat (master prompt §2/§39/§45).
 * ═══════════════════════════════════════════════════════════════════════════
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
import {
  ragRetrieve,
  buildEvidenceBlock,
  buildCitationLines,
  type Evidence,
  type RagResult,
} from '../_shared/ragRetrieval.ts';

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

// ── RAG: high-risk (§23) — chemical/dosage/interval questions. RAG may inform,
// but the answer must carry the informational boundary + verified-path routing.
const HIGH_RISK_QUERY =
  /(pesticide|insecticide|fungicide|herbicide|weedicide|spray|dose|dosage|ml per|gram per|ग्राम प्रति|मिली प्रति|छिड़काव|फवारणी|कीटनाशक|बुरशीनाशक|तणनाशक|खुराक|मात्रा|डोस|PHI|pre-?harvest interval|ETL|mix(ing)? chemical|कौन सी दवा|कोणते औषध)/i;

async function isRagEnabled(supabase: any, tenantId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('feature_flags')
      .select('is_enabled, target_tenants')
      .eq('flag_name', 'rag_general_chat')
      .maybeSingle();
    if (!data?.is_enabled) return false;
    const targets: string[] = data.target_tenants || [];
    return targets.length === 0 || targets.includes(tenantId);
  } catch {
    return false; // flag lookup failure ⇒ safe default: previous behavior
  }
}

function buildSystemPrompt(
  language: string,
  landContext: any | null,
  addressing: FarmerAddressing | null,
  rag?: {
    evidenceBlock: string | null; // null = retrieval ran but found nothing
    highRisk: boolean;
  } | null,
): string {
  const langName = LANG_NAMES[language] || 'English';
  const landBlock = landContext
    ? `LAND_CONTEXT (authoritative — use these facts):\n${JSON.stringify(landContext, null, 2)}`
    : 'LAND_CONTEXT: none (farmer asked a general question without a specific land)';

  const addressingBlock = addressing ? `\n\n${addressing.promptDirective}\n` : '';

  // ── RAG grounding rules (§21). Only present when the feature flag is ON.
  let ragBlock = '';
  if (rag) {
    if (rag.evidenceBlock) {
      ragBlock = `

RETRIEVED_EVIDENCE (authoritative published sources — retrieved for THIS question):
${rag.evidenceBlock}

EVIDENCE RULES (mandatory):
- Ground every factual agricultural claim (numbers, thresholds, timings,
  varieties, scheme rules, eligibility, amounts) in RETRIEVED_EVIDENCE.
- You may add general agronomic explanation, but clearly favor the evidence
  when they differ, and never contradict it.
- NEVER invent a source, page number, document name, or citation. Citations
  are appended by the system, not by you — do not write a "Sources" section.
- If the evidence does not fully answer the question, answer what it supports
  and say plainly (in ${langName}) what is not covered by verified sources.
- Do not mention the words "RETRIEVED_EVIDENCE", "chunks" or "RAG" to the farmer.`;
    } else {
      ragBlock = `

RETRIEVAL_RESULT: NO verified source document matched this question.
INSUFFICIENT-EVIDENCE RULES (mandatory):
- Say honestly (in ${langName}, one short sentence) that you do not have a
  verified official document for this, then give brief, safe, general
  guidance only.
- Do NOT state specific numbers (doses, amounts, scheme payment figures,
  dates, thresholds) as facts. Do NOT cite or invent any source.
- Suggest the farmer confirm with the local Krishi Vigyan Kendra or
  agriculture office where appropriate.`;
    }
    if (rag.highRisk) {
      ragBlock += `

HIGH-RISK QUESTION BOUNDARY (chemical / dosage / PHI):
- This answer is INFORMATIONAL only. Do not present it as a treatment
  decision for the farmer's specific field.
- Only mention chemical names, doses or PHI values that appear verbatim in
  RETRIEVED_EVIDENCE; otherwise give non-chemical/IPM guidance and state that
  the exact product and dose must be confirmed.
- End with ONE short sentence (in ${langName}) telling the farmer that for an
  exact recommendation for THEIR field and crop stage, they should ask in
  their land-specific chat, which gives verified advice.`;
    }
  }

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
${landBlock}${ragBlock}`;
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
      stateCode = null,  // optional retrieval filter, e.g. 'MH' (from farmer profile/app)
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

    // ── RAG retrieval (feature-flagged; failure NEVER breaks chat — §31)
    let ragResult: RagResult | null = null;
    let ragEvidence: Evidence[] = [];
    let highRisk = false;
    const ragOn = await isRagEnabled(supabase, tenantId);
    if (ragOn) {
      highRisk = HIGH_RISK_QUERY.test(userText);
      try {
        ragResult = await ragRetrieve(
          supabase,
          userText,
          language,
          { stateCodes: stateCode ? [stateCode] : null, tenantId: null /* general corpus is global; tenant docs opt-in later */ },
          { sessionId, traceId, farmerId, tenantIdText: tenantId },
        );
        ragEvidence = ragResult.evidence;
        console.log(`📚 [${traceId}] rag mode=${ragResult.mode} evidence=${ragEvidence.length} belowThreshold=${ragResult.belowThreshold} ${ragResult.traceNote}`);
      } catch (e) {
        console.warn(`[${traceId}] rag retrieval failed — continuing ungated:`, (e as Error).message);
        ragResult = null; // total failure ⇒ behave exactly like pre-RAG version
      }
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

    const systemPrompt = buildSystemPrompt(
      language,
      landContext,
      addressing,
      ragResult
        ? {
            evidenceBlock: ragEvidence.length ? buildEvidenceBlock(ragEvidence) : null,
            highRisk,
          }
        : null,
    );
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

    // ── Citations: appended IN CODE from retrieval metadata (§22) — the LLM
    //    is forbidden from writing them, so page numbers can never be invented.
    if (ragEvidence.length > 0) {
      answer += buildCitationLines(ragEvidence, language);
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
          chat_mode: ragResult ? 'general_rag_v1' : 'general_llm_v1',
          orchestrator_type: ragResult ? 'GENERAL_RAG_GROUNDED' : 'GENERAL_LLM_DIRECT',
          language,
          trace_id: traceId,
          land_context_used: !!landContext,
          rag: ragResult
            ? {
                mode: ragResult.mode,
                evidence_count: ragEvidence.length,
                below_threshold: ragResult.belowThreshold,
                high_risk: highRisk,
                evidence_ids: ragEvidence.map((e) => e.chunkId),
                embedding_model: ragResult.embeddingModel,
                retrieval_latency_ms: ragResult.latencyMs,
              }
            : null,
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
          orchestrator_type: ragResult ? 'GENERAL_RAG_GROUNDED' : 'GENERAL_LLM_DIRECT',
          chat_mode: ragResult ? 'general_rag_v1' : 'general_llm_v1',
          model: usedModel,
          trace_id: traceId,
          language,
          land_context_used: !!landContext,
          rag_grounded: ragEvidence.length > 0,
          rag_mode: ragResult?.mode || null,
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
