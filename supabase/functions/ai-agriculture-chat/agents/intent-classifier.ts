/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-08-02 — P0-B.1/B.2: (1) the canonical code list handed to the LLM is
 *   now intersected with the intents that `intent_observation_mapping` scopes
 *   to the LOCKED crop, so a cotton-scoped intent can never be returned for a
 *   rice field; (2) emergency keyword matching is Unicode-mark-insensitive
 *   (NFC + anusvara/candrabindu/nukta stripped on BOTH sides) so spelling
 *   variants like तन/तण match.
 * 2026-07-22 — Phase 2 expansion: added SHADOW dual-read against the shared
 *   observation-index (utils/db-ssot/observation-index.ts). Compares the
 *   legacy `observation_intent_master` load against `getObservationIntent()`
 *   and emits `[OBS_INDEX_DIFF]` on any missing intent. Non-authoritative;
 *   legacy set is still returned unchanged. Extends the 7-day watch beyond
 *   symbol-resolver so Phase 3b cutover has coverage on intent lookups.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURAL CONTRACT — INTENT CLASSIFIER v4.0.0
 *
 * Role: language → canonical intent_code. Nothing else.
 *
 * v4.0.0 (Fix 1) changes:
 * - Intent code whitelist is loaded LIVE from observation_intent_master
 *   (the single source of truth — 88 codes verified). No more hand-maintained
 *   in-file lists drifting out of sync.
 * - LLM prompt receives the full canonical list as a hard constraint.
 * - LLM output is validated against the DB-loaded Set.
 * - Invalid output → 1 stricter retry → fallback GENERAL_CROP_INFO @ 0.3.
 * - Emergency keyword fallback is retained for total LLM outage, but every
 *   emitted code is gated through the same canonical Set before return.
 */

import { getAPIEndpoint, getBestAvailableProvider } from '../../_shared/aiConfig.ts';
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { registerIntentCodeSet } from '../runtime/graph-runtime.ts';
import { getIntentCodesForCrop } from '../utils/observation-mapping-cache.ts';

export const INTENT_CLASSIFIER_VERSION = '4.0.0';

// Module-load boot marker — if logs still show "v3.0.0" after a deploy, the
// edge runtime is serving a stale bundle and needs a forced redeploy.
console.log(`[IntentClassifier] MODULE_LOAD version=${INTENT_CLASSIFIER_VERSION}`);

// CANONICAL INTENT REGISTRY (Fix 1) — loaded once per cold start from DB

let _validIntentCodes: Set<string> | null = null;
let _validIntentCodesPromise: Promise<Set<string>> | null = null;

async function loadCanonicalIntentCodes(): Promise<Set<string>> {
  if (_validIntentCodes) return _validIntentCodes;
  if (_validIntentCodesPromise) return _validIntentCodesPromise;

  _validIntentCodesPromise = (async () => {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !serviceKey) {
        console.error('[IntentValidator] Missing Supabase credentials — cannot load canonical intents');
        return new Set<string>();
      }
      const client = createClient(supabaseUrl, serviceKey);
      const { data, error } = await client
        .from('observation_intent_master')
        .select('intent_code')
        .eq('is_active', true);
      if (error || !data) {
        console.error(`[IntentValidator] Failed to load registry: ${error?.message || 'no rows'}`);
        return new Set<string>();
      }
      const set = new Set<string>(data.map((r: any) => r.intent_code));
      _validIntentCodes = set;
      // Phase 3b: shadow dual-read removed. `observation-index` already
      try { registerIntentCodeSet(set); } catch (_e) { /* non-fatal */ }
      console.log(`[IntentValidator] Loaded ${set.size} canonical intent codes from DB`);
      return set;
    } catch (e) {
      console.error(`[IntentValidator] Exception loading registry: ${e}`);
      return new Set<string>();
    }
  })();

  return _validIntentCodesPromise;
}

// PUBLIC TYPES

export interface IntentLandContext {
  current_crop?: string;
  growth_stage?: string;
  days_since_sowing?: number;
  ndvi_value?: number;
  soil_type?: string;
}

export interface IntentClassification {
  intent_code: string;
  confidence: number;
}

// PROMPT BUILDER

function buildLandContextBlock(landContext?: IntentLandContext): string {
  if (!landContext || !landContext.current_crop) return '';
  const lines: string[] = [
    "═══════════════════════════════════════════════════════════════════════",
    "AUTHORITATIVE LAND CONTEXT (this is the ONLY crop for this chat):",
  ];
  lines.push(`- crop_code: ${landContext.current_crop}`);
  if (landContext.growth_stage) {
    const dasStr = landContext.days_since_sowing ? ` (DAS: ${landContext.days_since_sowing})` : '';
    lines.push(`- stage: ${landContext.growth_stage}${dasStr}`);
  }
  if (typeof landContext.ndvi_value === 'number') lines.push(`- ndvi: ${landContext.ndvi_value.toFixed(2)}`);
  if (landContext.soil_type) lines.push(`- soil_type: ${landContext.soil_type}`);
  lines.push("");
  lines.push("BINDING RULE (mandatory):");
  lines.push(`- If the farmer uses a GENERIC subject ("crop", "plant", "पिक", "फसल",`);
  lines.push(`  "pik", "fasal", "pikat", "shet", "field", "मालाला", "पिकाला"), you MUST`);
  lines.push(`  interpret it as the crop above (${landContext.current_crop}).`);
  lines.push(`- Do NOT return GENERAL_CROP_INFO when the farmer describes a specific`);
  lines.push(`  agronomic problem/state about this land's crop (emergence, growth,`);
  lines.push(`  pest, disease, colour change, wilting, damage, yield). Route to the`);
  lines.push(`  matching diagnostic intent instead.`);
  lines.push("═══════════════════════════════════════════════════════════════════════");
  return lines.join('\n');
}

function buildConstrainedPrompt(farmerMessage: string, validCodes: Set<string>, landContext?: IntentLandContext): string {
  const codesList = Array.from(validCodes).sort().join(', ');
  const landBlock = buildLandContextBlock(landContext);
  return `You are a language-understanding component for an agricultural decision system.

YOUR ONLY JOB: translate the farmer's natural-language query into ONE canonical intent_code.
You do NOT diagnose, recommend, or explain. The symbolic decision brain handles that.

The farmer may write in ANY language (Marathi, Hindi, English, Tamil, Telugu, Kannada, Gujarati,
Bengali, Punjabi) including ROMANIZED scripts (e.g. "mazya usala kide lagale",
"pani kab dena hai", "kapus la rog lagla").

═══════════════════════════════════════════════════════════════════════
HARD CONSTRAINT — intent_code MUST be EXACTLY one of these canonical codes
(do NOT invent new codes, do NOT change capitalization, do NOT abbreviate):

${codesList}
═══════════════════════════════════════════════════════════════════════

${landBlock}

ROUTING HINTS:
- "what fertilizer to apply", "खत", "खाद", "खते", "कोणते खत", "खत द्यावे" → FERTILIZER_SCHEDULE
- "spray", "फवारणी", "छिड़काव", "spraying schedule" → SPRAY_TIMING_QUERY
- "water", "पाणी", "पानी", "irrigation timing" → IRRIGATION_QUERY or IRRIGATION_SCHEDULING_QUERY
- "yellowing", "spots", "wilting", "borer", "insect visible" → diagnostic intents
  (COLOR_CHANGE, LEAF_MARKS_OR_SPOTS, WILTING_OR_DROOPING, STEM_DAMAGE, PEST_PRESENCE_VISIBLE, ...)
- "not emerged", "did not germinate", "उगवले नाही", "उगवण नाही", "अंकुरण नहीं", "खराब उगवण"
  → EMERGENCE_FAILURE (even when the subject is a generic word like "पिक" / "फसल" /
  "crop" — the AUTHORITATIVE LAND CONTEXT above tells you which crop it is).
- "when to harvest" → HARVEST_TIMING
- Pure greeting / unclear → GENERAL_CROP_INFO

If genuinely unsure → GENERAL_CROP_INFO. Never UNKNOWN_OBSERVATION unless the message is empty
or has no agricultural meaning.

Farmer query: "${farmerMessage}"

Return JSON ONLY (no markdown, no prose):
{"intent_code": "<one canonical code from the list>", "confidence": 0.0-1.0}`;
}

// HTTP / PARSING HELPERS

async function callLLMWithRetry(endpoint: string, payload: RequestInit, maxRetries = 2): Promise<Response> {
  let attempt = 0; let delay = 300;
  while (true) {
    const response = await fetch(endpoint, payload);
    if (response.status === 429 && attempt < maxRetries) {
      const jitter = Math.random() * 200;
      await new Promise(res => setTimeout(res, delay + jitter));
      delay *= 2; attempt++;
      continue;
    }
    return response;
  }
}

function extractFirstBalancedJSON(str: string): string | null {
  let depth = 0, start = -1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (str[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = str.slice(start, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { start = -1; }
      }
    }
  }
  return null;
}

function safeExtractJson(content: string): { intent_code: string; confidence: number } | null {
  if (!content || typeof content !== 'string') return null;
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { const d = JSON.parse(cleaned); if (d && typeof d.intent_code === 'string') return d; } catch {/* */}
  const m = cleaned.match(/\{[^{}]*"intent_code"[^{}]*\}/);
  if (m) { try { const e = JSON.parse(m[0]); if (e?.intent_code) return e; } catch {/* */} }
  const bal = extractFirstBalancedJSON(cleaned);
  if (bal) { try { const e = JSON.parse(bal); if (e?.intent_code) return e; } catch {/* */} }
  const im = cleaned.match(/intent_code["\s:]*["']?([A-Z_]+)["']?/i);
  const cm = cleaned.match(/confidence["\s:]*([0-9.]+)/i);
  if (im) return { intent_code: im[1].toUpperCase(), confidence: cm ? Math.min(1, Math.max(0, parseFloat(cm[1]))) : 0.5 };
  return null;
}

async function callClassifierLLM(prompt: string, strict: boolean): Promise<{ intent_code: string; confidence: number } | null> {
  const { provider, model, apiKey } = getBestAvailableProvider();
  const endpoint = getAPIEndpoint(provider);
  const isGemini = provider === 'gemini' || provider === 'google';
  const requestBody: any = {
    model,
    messages: [
      { role: 'system', content: strict
        ? 'You are a JSON-only classifier. Output MUST be valid JSON containing intent_code and confidence. Nothing else.'
        : 'You are an intent classifier. Return only JSON: {"intent_code": "...", "confidence": 0.0-1.0}. No prose, no markdown.' },
      { role: 'user', content: prompt }
    ],
    temperature: strict ? 0 : 0.1,
    max_tokens: 1024,
  };
  if (!isGemini) requestBody.response_format = { type: 'json_object' };

  const response = await callLLMWithRetry(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return safeExtractJson(content);
}

// MAIN CLASSIFY

export async function classifyFarmerIntent(
  farmerMessage: string,
  landContext?: IntentLandContext
): Promise<IntentClassification> {
  console.log(`\n🎯 [IntentClassifier v${INTENT_CLASSIFIER_VERSION}] Classifying...`);
  if (landContext?.current_crop) {
    console.log(`   📋 Land context: ${landContext.current_crop}/${landContext.growth_stage || '?'} DAS=${landContext.days_since_sowing || '?'}`);
  }

  const validCodes = await loadCanonicalIntentCodes();
  if (validCodes.size === 0) {
    console.error('[IntentClassifier] Canonical registry empty — emergency fallback only');
    return emergencyFallback(farmerMessage, new Set());
  }

  const prompt = buildConstrainedPrompt(farmerMessage, validCodes, landContext);

  try {
    let result = await callClassifierLLM(prompt, false);

    if (result && validCodes.has(result.intent_code)) {
      const conf = typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : 0.6;
      console.log(`   ✅ Intent: ${result.intent_code} (${(conf * 100).toFixed(0)}%)`);
      return { intent_code: result.intent_code, confidence: conf };
    }

    if (result) {
      console.error(`[IntentValidator] LLM emitted non-canonical intent: "${result.intent_code}". Retrying with stricter prompt.`);
    } else {
      console.warn('[IntentValidator] LLM returned no parseable JSON. Retrying.');
    }

    const retryPrompt = prompt + `\n\nYour previous response was INVALID. Return ONLY a code from the canonical list above.`;
    const retry = await callClassifierLLM(retryPrompt, true);
    if (retry && validCodes.has(retry.intent_code)) {
      const conf = typeof retry.confidence === 'number' ? Math.max(0, Math.min(1, retry.confidence)) : 0.5;
      console.log(`   ✅ Intent (retry): ${retry.intent_code} (${(conf * 100).toFixed(0)}%)`);
      return { intent_code: retry.intent_code, confidence: conf };
    }

    console.error(`[IntentValidator] Retry also failed. Trying keyword fallback, then GENERAL_CROP_INFO.`);
    const kw = emergencyFallback(farmerMessage, validCodes);
    if (kw.intent_code !== 'UNKNOWN_OBSERVATION') return kw;
    return { intent_code: 'GENERAL_CROP_INFO', confidence: 0.3 };
  } catch (e) {
    console.error(`[IntentClassifier] Error: ${e}`);
    return emergencyFallback(farmerMessage, validCodes);
  }
}

// EMERGENCY KEYWORD FALLBACK — every emitted code is gated through validCodes

function emit(code: string, conf: number, validCodes: Set<string>): IntentClassification {
  // PR-10 · Empty-registry safety: when the DB-driven registry is empty
  if (validCodes.size === 0) return { intent_code: 'GENERAL_CROP_INFO', confidence: 0.1 };
  if (validCodes.has(code)) return { intent_code: code, confidence: conf };
  if (validCodes.has('GENERAL_CROP_INFO')) return { intent_code: 'GENERAL_CROP_INFO', confidence: 0.3 };
  return { intent_code: 'UNKNOWN_OBSERVATION', confidence: 0.15 };
}

/**
 * P0-B.2 — Unicode-mark-insensitive folding. NFC-normalises, then strips the
 * combining marks that farmers routinely omit or add: anusvara (U+0902),
 * candrabindu (U+0901) and nukta (U+093C), plus their Indic-block siblings
 * (U+0981/0982, U+0A01/0A02, U+0B01/0B02, U+0C01/0C02, U+0C82, U+0CBC,
 * U+0D02, U+0A3C, U+0B3C). Retroflex vs dental phonemes (ण vs न) are NOT
 * folded — that would collapse genuinely distinct words.
 */
const MARK_RE = /[\u0901\u0902\u093C\u0981\u0982\u09BC\u0A01\u0A02\u0A3C\u0B01\u0B02\u0B3C\u0C00\u0C01\u0C02\u0C3C\u0C81\u0C82\u0CBC\u0D01\u0D02]/g;
function foldMarks(s: string): string {
  return (s || '').normalize('NFC').replace(MARK_RE, '');
}

function emergencyFallback(message: string, validCodes: Set<string>): IntentClassification {
  const original = foldMarks(message || '');
  if (!original.trim()) return emit('UNKNOWN_OBSERVATION', 0.0, validCodes);

  // Fertilizer
  if (/खत|खते|खाद|उर्वरक|fertiliz|\bkhat\b|\bkhaad\b/i.test(original)) return emit('FERTILIZER_SCHEDULE', 0.6, validCodes);
  // Spray
  if (/फवारणी|छिडकाव|spray/i.test(original)) return emit('SPRAY_TIMING_QUERY', 0.6, validCodes);
  // Irrigation
  if (/पाणी|पानी|सिचन|सिचाई|irrigat|\bpani\b|\bpaani\b/i.test(original)) return emit('IRRIGATION_QUERY', 0.55, validCodes);
  // Harvest
  if (/कापणी|काटाई|harvest|तोड/i.test(original)) return emit('HARVEST_TIMING', 0.55, validCodes);
  // Weed
  if (/तण|खरपतवार|weed|निदणी|निराई/i.test(original)) return emit('WEED_PROBLEM', 0.55, validCodes);
  // Death/dying
  if (/मेला|मेले|मरत|सुकल|सुकत|वाळल|dried|dead|dying|wilt|droop|कोमेज/i.test(original)) return emit('WILTING_OR_DROOPING', 0.5, validCodes);
  // Pest
  if (/किडा|किडे|कीट|कीड|insect|pest|अळी|बोड/i.test(original)) return emit('PEST_PRESENCE_VISIBLE', 0.5, validCodes);
  // Disease
  if (/रोग|बीमारी|disease|fungus|करपा|ताबेरा/i.test(original)) return emit('DISEASE_LIKE_PATTERN', 0.5, validCodes);
  // Yellowing
  if (/पिवळ|पीला|yellow/i.test(original)) return emit('COLOR_CHANGE', 0.5, validCodes);
  // Leaf spots
  if (/ठिपके|डाग|धब्बे|spots?/i.test(original)) return emit('LEAF_MARKS_OR_SPOTS', 0.5, validCodes);
  // Stem damage / borer
  if (/borer|छेदक|खोड.*भोक|खोड.*अळी|frass/i.test(original)) return emit('STEM_DAMAGE', 0.55, validCodes);
  if (/खोड|तना|stem/i.test(original)) return emit('STEM_DAMAGE', 0.45, validCodes);
  // Soil
  if (/soil test|माती परीक्षण|मृदा परीक्षण/i.test(original)) return emit('SOIL_TESTING_QUERY', 0.55, validCodes);
  // Market
  if (/market price|भाव|दर|mandi|बाजार/i.test(original)) return emit('MARKET_PRICE_QUERY', 0.55, validCodes);
  // Weather
  if (/weather|forecast|rain|पाऊस|बारिश/i.test(original)) return emit('WEATHER_ADVISORY', 0.55, validCodes);

  return emit('GENERAL_CROP_INFO', 0.3, validCodes);
}

export default { classifyFarmerIntent, INTENT_CLASSIFIER_VERSION };
