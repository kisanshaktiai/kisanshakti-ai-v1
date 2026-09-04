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
 * 2026-08-27 — CROP-SCOPED GATES: Fallback A relaxes STATE only (keeps cropCodes — a
 *   crop-scoped gap is a real gap, not a filter artefact); Fallback B carries cropCodes
 *   too. New crop-consistency gate drops evidence from documents whose crop_codes do not
 *   overlap the query crop (state-relaxed retries can surface off-crop docs). Citations
 *   block now requires ≥1 cited [n] marker — an answer that cited nothing gets no source list.
 *   ragRetrieval belowThreshold: hybrid+fulltext-fallback (bestSem===null) is no longer a
 *   forced gap; top_score logs bestSem only (was RRF rank fallback).
 * 2026-08-26b — FARMER OUTPUT QUALITY (traces 3fb34b48/abb68997): admin provenance note leaked
 *   through registry.publisher into citations; 3 citation lines for 1 document incl. an
 *   irrelevant page; transliterated jargon (थिनिंग/गॅप फिलिंग/germination); per-hectare only.
 *   Fixes: trust gate (unverified sources never served/cited); citations = one line per
 *   document with pages actually cited via [n] markers; markers stripped; all-language
 *   labels; local-term rule in prompt; acre equivalents computed in code; default grain purpose.
 * 2026-08-26 — RANKING ROOT CAUSE (trace fbe05993): the correct 'Seed rate' and 'Spacing'
 *   chunks were not in the top-5 (raw pgroonga occurrence count favoured the contents page),
 *   so the model's correct numbers were rejected and the fallback masked digits with ▢.
 *   Fix: lexical re-ranker in ragRetrieval.ts; sentence-level fidelity fallback here
 *   (drop only offending sentences; never mask). MAX_EVIDENCE 6.
 * 2026-08-24b — LANGUAGE-AGNOSTIC RETRIEVAL + FARMER EXPLANATION:
 *   (5) The corpus is English; a Marathi/Hindi question sent verbatim to pgroonga
 *       returned 0 rows (verified). New _shared/queryNormalizer.ts uses the LLM as an
 *       INTERPRETER only: farmer text → English retrieval query + crop/topic hints,
 *       numbers preserved. Retrieval runs on the English query; if nothing is found
 *       and the farmer's text differs, retrieval is retried on the original text.
 *   (6) stateCode now resolves from body.stateCode → farmer profile state → states.code
 *       (the app never sends stateCode; verified in EnhancedAIChatInterface.tsx).
 *       cropCodes resolve from the normaliser's crop hint via crops.value.
 *   (7) Explanation prompt: evidence is English; the answer must explain it in the
 *       farmer's own language and simple field vocabulary, keep every evidence number
 *       exactly (units localised as words), never translate a figure into a new unit.
 *   (8) metadata.rag.normalization records the rewrite for audit.
 * 2026-08-24 — P0 fixes before first deploy of the RAG path:
 *   (1) FLAG SEMANTICS: isRagEnabled() treated empty target_tenants as "everyone"
 *       and ignored rollout_percentage — with the live row (is_enabled=true,
 *       rollout=0, targets=[]) that would have switched RAG ON for every farmer.
 *       Replaced by _shared/featureFlags.ts (target_users → target_tenants →
 *       rollout bucket). Live row now means OFF until targets/rollout are set.
 *   (2) NUMERIC FIDELITY GATE: prompt rules alone cannot stop an invented dose.
 *       Every number in the answer must exist in the evidence or the farmer's
 *       question (unsupportedNumbers). Violation ⇒ one strict retry ⇒ else a
 *       number-free answer. Deterministic; no LLM judges an LLM.
 *   (3) PROMPT CONFLICT: the base rule "Be specific: name inputs, dosages per
 *       acre …" is now emitted only when RAG is OFF; in RAG mode the evidence
 *       rules govern. Flag OFF ⇒ prompt is byte-identical to the legacy version.
 *   (4) LOGGING: retrieval purpose + document/chunk ids (migration applied).
 * 2026-08-08 — RAG GROUNDING (Stage 3, behind feature flag 'rag_general_chat'):
 *   information-class questions are grounded in retrieved authoritative
 *   evidence (rag_chunks via _shared/ragRetrieval.ts) with real citations
 *   appended in code from retrieval metadata — the LLM never invents them.
 *   Insufficient evidence ⇒ explicit honest-guidance mode selected in code.
 *   High-risk (pesticide/dosage/PHI) questions get the §23 informational
 *   boundary + routing note toward land-specific verified chat.
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
  unsupportedNumbers,
  dropUnsupportedSentences,
  citedEvidenceIndexes,
  stripCitationMarkers,
  acreEquivalentsLine,
  type Evidence,
  type RagResult,
} from '../_shared/ragRetrieval.ts';
import { isFlagEnabled } from '../_shared/featureFlags.ts';
import { normalizeQueryForRetrieval, resolveCropCode, resolveStateCode, type NormalizedQuery } from '../_shared/queryNormalizer.ts';

const RAG_FLAG = 'rag_general_chat';

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

// ── FIX F6 (audit 2026-09-04): when the model DID cite with [n], those indexes
//    select the pages listed (existing behaviour). But in 7 of 9 grounded turns
//    the model emitted no marker, so the code listed ALL retrieved evidence —
//    including a cover page (trace 3880bcc6). This picks, deterministically, the
//    evidence the answer actually leaned on: a chunk whose text/section/title
//    shares a number, or ≥2 non-stopword terms, with the final answer. If nothing
//    overlaps, fall back to the single best-ranked chunk (never the whole list).
//    Returns 1-based indexes into `evidence`, matching citedEvidenceIndexes().
const CITE_STOPWORDS = new Set([
  'the', 'and', 'for', 'per', 'with', 'from', 'this', 'that', 'are', 'use', 'used',
  'rice', 'crop', 'field', 'variety', 'varieties', 'yield', 'seed', 'seeds', 'soil',
  'water', 'plant', 'plants', 'good', 'average', 'high', 'low',
]);
function citeTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length >= 4 && !CITE_STOPWORDS.has(t)),
  );
}
function citeNumbers(s: string): Set<string> {
  const latin = s.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)));
  return new Set((latin.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.').replace(/\.0+$/, '')));
}
function selectCitedIndexes(answer: string, evidence: Evidence[]): number[] {
  if (!evidence.length) return [];
  const ansTokens = citeTokens(answer);
  const ansNums = citeNumbers(answer);
  const picked: number[] = [];
  evidence.forEach((ev, i) => {
    const evText = `${ev.text} ${ev.sectionPath ?? ''} ${ev.title ?? ''}`;
    const evNums = citeNumbers(evText);
    const numHit = [...evNums].some((n) => ansNums.has(n));
    const evTok = citeTokens(evText);
    let shared = 0;
    for (const t of evTok) if (ansTokens.has(t)) shared++;
    if (numHit || shared >= 2) picked.push(i + 1);
  });
  // Fallback: cite the single top-ranked chunk rather than the whole retrieved set.
  if (!picked.length) {
    let best = 0;
    evidence.forEach((ev, i) => { if (ev.rankScore > evidence[best].rankScore) best = i; });
    picked.push(best + 1);
  }
  return picked;
}

// ── FIX F5 (audit 2026-09-04): the distinct crop_codes present in the active
//    corpus, handed to the query normaliser so a local-language crop word maps
//    to a crop the corpus can actually answer. Cached briefly; best-effort.
let corpusCropsCache: { at: number; v: string[] } | null = null;
async function loadCorpusCrops(supabase: any): Promise<string[]> {
  if (corpusCropsCache && Date.now() - corpusCropsCache.at < 300_000) return corpusCropsCache.v;
  try {
    const { data } = await supabase.from('rag_documents').select('crop_codes').eq('is_active', true);
    const set = new Set<string>();
    for (const d of (data || []) as Array<{ crop_codes?: string[] | null }>) {
      for (const c of d.crop_codes || []) if (c) set.add(String(c).toLowerCase());
    }
    const v = [...set];
    corpusCropsCache = { at: Date.now(), v };
    return v;
  } catch {
    return corpusCropsCache?.v ?? [];
  }
}

// ── FIX F4 (audit 2026-09-04): last-resort state resolution from the farmer's
//    land. v_land_region exposes farmer_id → state_code (bare 'MH' etc., derived
//    as lands.state_id → states.code). Returns the single distinct state when the
//    farmer's lands are all in one state; NULL when absent, mixed, or on error —
//    so a mixed-state farmer keeps the unfiltered (whole-corpus) behaviour.
async function resolveStateFromLand(supabase: any, farmerId: string): Promise<string | null> {
  if (!farmerId) return null;
  try {
    const { data } = await supabase
      .from('v_land_region')
      .select('state_code')
      .eq('farmer_id', farmerId)
      .not('state_code', 'is', null)
      .limit(50);
    const codes = [...new Set((data || []).map((r: { state_code?: string }) => String(r.state_code || '').toUpperCase()).filter(Boolean))];
    return codes.length === 1 ? (codes[0] as string) : null;
  } catch {
    return null;
  }
}

function buildSystemPrompt(
  language: string,
  landContext: any | null,
  addressing: FarmerAddressing | null,
  rag?: {
    evidenceBlock: string | null; // null = retrieval ran but found nothing
    highRisk: boolean;
    strict?: boolean;             // retry after the numeric gate failed
  } | null,
): string {
  const langName = LANG_NAMES[language] || 'English';
  const landBlock = landContext
    ? `LAND_CONTEXT (authoritative — use these facts):\n${JSON.stringify(landContext, null, 2)}`
    : 'LAND_CONTEXT: none (farmer asked a general question without a specific land)';

  const addressingBlock = addressing ? `\n\n${addressing.promptDirective}\n` : '';

  // Legacy specificity rule — only when RAG is OFF. In RAG mode the evidence
  // rules below are the sole authority for any number.
  const specificityRule = rag
    ? ''
    : `
- Be specific: name inputs, dosages per acre, timings, and PHI (pre-harvest
  interval) when relevant. Prefer organic / IPM first, then chemical only
  when justified. Never invent regulatory approvals — if unsure, say so.`;

  // ── RAG grounding rules (§21). Only present when the feature flag is ON.
  let ragBlock = '';
  if (rag) {
    if (rag.evidenceBlock) {
      ragBlock = `

RETRIEVED_EVIDENCE (authoritative published sources — retrieved for THIS question):
${rag.evidenceBlock}

EVIDENCE RULES (mandatory):
- Every number you state (dose, rate, quantity, interval, days, PHI, ETL,
  spacing, seed rate, price, percentage, date) MUST appear verbatim in
  RETRIEVED_EVIDENCE. Never estimate, round, convert units, or recall a
  figure from memory. If a number the farmer needs is not in the evidence,
  say plainly (in ${langName}) that you do not have a verified figure and
  advise confirming with the local Krishi Vigyan Kendra / agriculture office.
- Ground every other factual claim (thresholds, timings, varieties, scheme
  rules, eligibility) in RETRIEVED_EVIDENCE; you may add general agronomic
  explanation but never contradict the evidence.
- After each sentence that uses a fact from the evidence, put the evidence
  number in square brackets, e.g. "... ३०-४५ सेंमी [2]". Cite only evidence
  you actually used. The system turns these into a source list — do NOT write
  a "Sources" section, page numbers, or document names yourself.
- Answer for the purpose the farmer asked; if unstated, assume a normal grain /
  main crop (not fodder, not seed multiplication) and do not list the other
  purposes unless the evidence says nothing else.
- Prefer organic / IPM guidance first when the evidence supports it.
- Do not mention the words "RETRIEVED_EVIDENCE", "chunks" or "RAG" to the farmer.

FARMER EXPLANATION STYLE (the evidence is in English; the farmer is not):
- Explain the MEANING of the evidence in ${langName}, in the words a village
  extension officer would use in the field — not a word-by-word translation.
- Keep every number exactly as it appears in the evidence. Write the unit as the
  local spoken word (e.g. kg → किलो, acre → एकर, hectare → हेक्टर, litre → लिटर,
  gram → ग्रॅम/ग्राम) but NEVER convert a value to a different unit.
- Product / chemical / variety names stay as written in the evidence.
- Structure: one line on what to do, then how much, then when, then one caution.
  Short sentences. No English sentences.
- NEVER transliterate English technical words into ${langName} script (no
  "थिनिंग", "गॅप फिलिंग", "germination"). Use the word a village extension
  officer uses (e.g. Marathi: विरळणी, नांग्या भरणे, उगवण, पेरणीची खोली; Hindi:
  विरलीकरण, खाली जगह भरना, अंकुरण, बुवाई की गहराई). If no local word exists,
  explain it in plain words.${rag.strict ? `
- STRICT MODE: your previous draft contained numbers that are NOT in
  RETRIEVED_EVIDENCE. Rewrite it using ONLY numbers that appear verbatim in
  RETRIEVED_EVIDENCE or in the farmer's own message.` : ''}`;
    } else {
      ragBlock = `

RETRIEVAL_RESULT: NO verified source document matched this question.
INSUFFICIENT-EVIDENCE RULES (mandatory):
- Say honestly (in ${langName}, one short sentence) that you do not have a
  verified official document for this, then give brief, safe, general
  guidance only.
- Do NOT state ANY number: no dose, rate, quantity, interval, days, PHI,
  ETL, spacing, seed rate, scheme amount, date or threshold. Write "the
  recommended quantity" instead of a figure. Do NOT cite or invent any source.
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
  answer next time.${specificityRule}
- NEVER ask the farmer to "classify" their question, pick an "intent",
  upload a photo, or choose from numbered options. At most ONE short
  follow-up question if it is truly required to answer well.
- Keep the reply under ~250 words. Use short bullets or numbered steps
  where they help readability.
${addressingBlock}
${landBlock}${ragBlock}`;
}

async function callLLM(
  chatMessages: Array<{ role: string; content: string }>,
  temperature: number,
  traceId: string,
): Promise<{ answer: string; usedModel: string }> {
  const { provider, model, apiKey } = getBestAvailableProvider();
  const usedModel = `${provider}/${model}`;
  const payload = buildAIRequest(provider, model, chatMessages, {
    maxTokens: AI_CONFIG.MAX_TOKENS_CHAT,
    temperature,
    useJsonMode: false,
  });
  const endpoint = getAPIEndpoint(provider);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), AI_CONFIG.REQUEST_TIMEOUT);
  try {
    const llmRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!llmRes.ok) {
      const errTxt = await llmRes.text().catch(() => '');
      console.error(`[${traceId}] LLM ${llmRes.status}:`, errTxt.slice(0, 300));
      throw new Error(`LLM_HTTP_${llmRes.status}`);
    }
    const json = await llmRes.json();
    return { answer: (json?.choices?.[0]?.message?.content || '').toString().trim(), usedModel };
  } finally {
    clearTimeout(t);
  }
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

    // ── Load farmer profile for respectful addressing (presentation-only)
    let addressing: FarmerAddressing | null = null;
    let profileState: string | null = null;
    try {
      const profile = await loadFarmerProfileLite(supabase, farmerId, language);
      profileState = profile.state ?? null;
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

    // ── RAG retrieval (feature-flagged; failure NEVER breaks chat — §31)
    let ragResult: RagResult | null = null;
    let ragEvidence: Evidence[] = [];
    let highRisk = false;
    const flag = await isFlagEnabled(supabase, RAG_FLAG, { tenantId, farmerId });
    const ragOn = flag.enabled;
    console.log(`🚩 [${traceId}] ${RAG_FLAG}=${ragOn} (${flag.reason}, rollout=${flag.rolloutPercentage}%)`);
    let normalized: NormalizedQuery | null = null;
    let retrievalFilters: { stateCodes: string[] | null; cropCodes: string[] | null } = { stateCodes: null, cropCodes: null };
    if (ragOn) {
      highRisk = HIGH_RISK_QUERY.test(userText);
      try {
        // (5) Understand the question first: farmer language → English retrieval query.
        // F5: give the interpreter the crops the corpus actually holds so a
        // local-language crop word maps to a real corpus crop (not a guess).
        const corpusCrops = await loadCorpusCrops(supabase);
        normalized = await normalizeQueryForRetrieval(userText, language, traceId, corpusCrops);
        highRisk = highRisk || HIGH_RISK_QUERY.test(normalized.query);
        // (6) Filters from SSOT tables: state (body → profile → land region) and crop.
        // FIX F4 (audit 2026-09-04): p_states was NULL on 100 % of logged retrievals —
        // the app never sent stateCode and the test farmer had no user_profiles.state,
        // so out-of-region variety docs (e.g. eastern-India rice) were served to a
        // Maharashtra farmer. When body + profile give no state, derive it from the
        // farmer's own land via the existing v_land_region view (farmer_id → state_code,
        // bare 2-letter code, exactly what rag_documents.state_codes uses). Best-effort;
        // no state resolved ⇒ unchanged (unfiltered) behaviour.
        let resolvedState = await resolveStateCode(supabase, stateCode || profileState);
        if (!resolvedState) resolvedState = await resolveStateFromLand(supabase, farmerId);
        const resolvedCrop = await resolveCropCode(supabase, normalized.cropHint);
        retrievalFilters = { stateCodes: resolvedState ? [resolvedState] : null, cropCodes: resolvedCrop ? [resolvedCrop] : null };
        console.log(`🔤 [${traceId}] normalized=${normalized.normalized} lang=${normalized.detectedLanguage} crop=${normalized.cropHint}→${resolvedCrop} state=${resolvedState} topic=${normalized.topic} q="${normalized.query.slice(0, 80)}"`);

        const audit = { sessionId, traceId, farmerId, tenantIdText: tenantId, purpose: 'GENERAL_CHAT' as const, queryOriginal: userText };
        const filters = { ...retrievalFilters, tenantId: null /* general corpus is global; tenant docs opt-in later */ };
        ragResult = await ragRetrieve(supabase, normalized.query, language, filters, audit);
        // Fallback A: STATE filter too narrow ⇒ retry without the state filter, keeping crop scope
        // (a crop-scoped gap is a real gap — do not widen it away).
        if (ragResult.belowThreshold && filters.stateCodes) {
          ragResult = await ragRetrieve(supabase, normalized.query, language, { tenantId: null, cropCodes: filters.cropCodes }, audit);
        }
        // Fallback B: the farmer's own words (covers native-language documents in the corpus).
        if (ragResult.belowThreshold && normalized.query !== userText) {
          ragResult = await ragRetrieve(supabase, userText, language, { tenantId: null, cropCodes: filters.cropCodes }, { ...audit, queryOriginal: null });
        }
        // Trust gate: unverified sources are retrieved (and logged) but never served/cited.
        const unservable = ragResult.evidence.filter((e) => !e.servable).length;
        ragEvidence = ragResult.evidence.filter((e) => e.servable);
        // Crop-consistency gate (FIXED 2026-08-28): drop only evidence that
        // POSITIVELY contradicts the query crop. The previous version kept
        // evidence only on a document-level crop_codes overlap, but the
        // retrieval SQL (rag_search_vector / rag_search_fulltext) legitimately
        // matches three classes: chunk-tag overlap, doc-tag overlap, or
        // untagged at both levels (general agronomy). This gate now mirrors
        // those exact semantics — an untagged doc or a chunk tagged with the
        // query crop is KEPT; a doc/chunk tagged only with a DIFFERENT crop
        // (e.g. a wheat doc surfacing on a soybean query) is dropped.
        if (retrievalFilters.cropCodes?.length && ragEvidence.length) {
          const want = retrievalFilters.cropCodes;
          const docIds = [...new Set(ragEvidence.map((e) => e.documentId))];
          const chunkIds = [...new Set(ragEvidence.map((e) => e.chunkId).filter(Boolean))];
          const [{ data: docCrops }, { data: chunkCrops }] = await Promise.all([
            supabase.from('rag_documents').select('id, crop_codes').in('id', docIds),
            chunkIds.length
              ? supabase.from('rag_chunks').select('id, crop_codes').in('id', chunkIds)
              : Promise.resolve({ data: [] as any[] }),
          ]);
          const docTags = new Map((docCrops || []).map((d: any) => [d.id, (d.crop_codes || []) as string[]]));
          const chunkTags = new Map((chunkCrops || []).map((c: any) => [c.id, (c.crop_codes || []) as string[]]));
          const overlaps = (tags: string[]) => tags.some((c) => want.includes(c));
          const keep = (e: { documentId: string; chunkId?: string | null }) => {
            const dTags = docTags.get(e.documentId) ?? [];
            const cTags = (e.chunkId && chunkTags.get(e.chunkId)) || [];
            // Mirror of the SQL clause: c.crop_codes && p_crops OR
            // d.crop_codes && p_crops OR (both NULL/empty).
            return overlaps(cTags) || overlaps(dTags) || (cTags.length === 0 && dTags.length === 0);
          };
          const before = ragEvidence.length;
          ragEvidence = ragEvidence.filter(keep);
          const dropped = before - ragEvidence.length;
          if (dropped) console.warn(`[${traceId}] crop-consistency gate dropped ${dropped} contradicting evidence (query crop ${want.join(',')})`);
        }
        console.log(`📚 [${traceId}] rag mode=${ragResult.mode} evidence=${ragResult.evidence.length} servable=${ragEvidence.length} unservable=${unservable} belowThreshold=${ragResult.belowThreshold} ${ragResult.traceNote}`);
      } catch (e) {
        console.warn(`[${traceId}] rag retrieval failed — continuing ungated:`, (e as Error).message);
        ragResult = null; // total failure ⇒ behave exactly like pre-RAG version
      }
    }

    const ragPromptCtx = ragResult
      ? { evidenceBlock: ragEvidence.length ? buildEvidenceBlock(ragEvidence) : null, highRisk }
      : null;
    const systemPrompt = buildSystemPrompt(language, landContext, addressing, ragPromptCtx);

    // ── Build LLM messages (filter symbolic-leakage from history)
    const history = (messages.slice(0, -1) as any[])
      .slice(-12)
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      }))
      .filter((m) => m.content.trim().length > 0)
      .filter((m) => !(m.role === 'assistant' && SYMBOLIC_HINTS.test(m.content)));

    const withSystem = (sys: string) => [
      { role: 'system', content: sys },
      ...history,
      { role: 'user', content: userText },
    ];

    let answer = '';
    let usedModel = 'unknown';
    let fidelity: { attempts: number; unsupported: string[]; degraded: boolean; filtered?: boolean } | null = null;
    let noEvidenceMode = ragResult !== null && ragEvidence.length === 0;
    try {
      const first = await callLLM(withSystem(systemPrompt), ragResult ? 0.3 : 0.6, traceId);
      answer = first.answer;
      usedModel = first.usedModel;

      // ── Numeric fidelity gate (RAG mode only). Deterministic; never ships an
      //    unsupported figure and never prints placeholder glyphs.
      //    1) drop only the offending sentences from the draft; 2) strict retry;
      //    3) number-free answer with any numeric sentence removed.
      if (ragResult) {
        const MIN_KEEP_RATIO = 0.5;
        let bad = unsupportedNumbers(answer, ragEvidence, userText);
        fidelity = { attempts: 1, unsupported: bad, degraded: false };

        if (bad.length) {
          const kept = dropUnsupportedSentences(answer, ragEvidence, userText);
          if (kept.length >= Math.max(60, answer.length * MIN_KEEP_RATIO)) {
            answer = kept; bad = [];
            fidelity = { attempts: 1, unsupported: [], degraded: false, filtered: true };
          }
        }

        if (bad.length && ragEvidence.length) {
          const strictPrompt = buildSystemPrompt(language, landContext, addressing, { ...ragPromptCtx!, strict: true });
          const retry = await callLLM(withSystem(strictPrompt), 0.1, traceId);
          let badRetry = unsupportedNumbers(retry.answer, ragEvidence, userText);
          let candidate = retry.answer;
          if (badRetry.length) {
            const kept = dropUnsupportedSentences(retry.answer, ragEvidence, userText);
            if (kept.length >= Math.max(60, retry.answer.length * MIN_KEEP_RATIO)) { candidate = kept; badRetry = []; }
          }
          if (!badRetry.length) answer = candidate;
          bad = badRetry;
          fidelity = { attempts: 2, unsupported: bad, degraded: false, filtered: candidate !== retry.answer };
        }

        if (bad.length) {
          // Final fallback: number-free informational answer; any sentence still
          // carrying a number is removed rather than masked.
          const safePrompt = buildSystemPrompt(language, landContext, addressing, { evidenceBlock: null, highRisk });
          const safe = await callLLM(withSystem(safePrompt), 0.1, traceId);
          const cleaned = dropUnsupportedSentences(safe.answer, [], userText);
          answer = cleaned || safe.answer.replace(/[^\n]*[\d०-९][^\n]*\n?/g, '').trim() || safe.answer;
          noEvidenceMode = true;
          fidelity = { attempts: 3, unsupported: unsupportedNumbers(answer, [], userText), degraded: true, filtered: true };
          console.warn(`⚠️ [${traceId}] fidelity gate degraded answer; unsupported=${JSON.stringify(bad)}`);
        }
      }
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
    //    Not appended when the answer was degraded to the number-free path.
    const citedIdx = citedEvidenceIndexes(answer);
    // markers only SELECT which pages are listed; their absence must not suppress
    // sources on a grounded answer — gap answers already arrive here with
    // ragEvidence=[] so fabricated citations remain impossible.
    // FIX F6: honour explicit [n] markers when present; otherwise pick the
    // evidence the answer actually used (selectCitedIndexes) instead of listing
    // every retrieved page. `used` also scopes the acre-equivalent line.
    if (ragEvidence.length > 0 && !noEvidenceMode) {
      const body = stripCitationMarkers(answer);
      const used = citedIdx.length ? citedIdx : selectCitedIndexes(body, ragEvidence);
      const acre = acreEquivalentsLine(body, used.length ? used.map((i) => ragEvidence[i - 1]).filter(Boolean) : ragEvidence, language);
      answer = body + acre + buildCitationLines(ragEvidence, language, used);
    } else {
      answer = stripCitationMarkers(answer);
    }

    const orchestratorType = !ragResult
      ? 'GENERAL_LLM_DIRECT'
      : noEvidenceMode
      ? 'GENERAL_RAG_NO_EVIDENCE'
      : 'GENERAL_RAG_GROUNDED';

    const ragMeta = ragResult
      ? {
          flag_reason: flag.reason,
          mode: ragResult.mode,
          evidence_count: ragResult.evidence.length,
          servable_count: ragEvidence.length,
          cited_indexes: citedIdx,
          below_threshold: ragResult.belowThreshold,
          high_risk: highRisk,
          evidence_ids: ragEvidence.map((e) => e.chunkId),
          document_ids: [...new Set(ragEvidence.map((e) => e.documentId))],
          embedding_model: ragResult.embeddingModel,
          retrieval_latency_ms: ragResult.latencyMs,
          normalization: normalized
            ? { applied: normalized.normalized, query_en: normalized.query, detected_language: normalized.detectedLanguage,
                crop_hint: normalized.cropHint, topic: normalized.topic, latency_ms: normalized.latencyMs, filters: retrievalFilters }
            : null,
          fidelity,
        }
      : null;

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
          orchestrator_type: orchestratorType,
          language,
          trace_id: traceId,
          land_context_used: !!landContext,
          rag: ragMeta,
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
          orchestrator_type: orchestratorType,
          chat_mode: ragResult ? 'general_rag_v1' : 'general_llm_v1',
          model: usedModel,
          trace_id: traceId,
          language,
          land_context_used: !!landContext,
          rag_grounded: orchestratorType === 'GENERAL_RAG_GROUNDED',
          rag_mode: ragResult?.mode || null,
          ...(orchestratorType === 'GENERAL_RAG_GROUNDED'
            ? {
                citations: ragEvidence.map((e, i) => ({
                  n: i + 1, title: e.title, publisher: e.publisher, page: e.pageNumber,
                  section: e.sectionPath, document_id: e.documentId, chunk_id: e.chunkId,
                })),
              }
            : {}),
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
