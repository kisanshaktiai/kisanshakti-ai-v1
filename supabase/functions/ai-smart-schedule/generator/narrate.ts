// CHANGE LOG
// 2026-09-08 — Language-quality ratio now ignores Latin words carried over from the SOURCE (product
//   names, fertilizer grades, units, codes). A faithful translation of a fact-dense line is mostly
//   Latin by necessity; counting it as 'untranslated' rejected such tasks permanently, so they stayed
//   English forever and the narration sweep retried them for ever.
// 2026-09-08 — farmer-simple register (by meaning, no language-specific words): extension-officer voice, short
//   sentences, what/when/how much/how to mix/why; numbers, units, dates, product names and grades untouched.
// 2026-09-07 — DURABLE NARRATION. Live measurement (schedule of 91 tasks, Marathi): 28-task
//   chunks at maxTokens 3000 overflow the output (Devanagari costs 3-4 tokens per word), the
//   model returns truncated JSON, every retry burns the budget, 0/91 tasks narrated. Fixes:
//   (1) chunk size 10, output budget 4500 tokens; (2) identical task texts are narrated ONCE and
//   the result is applied to every task that shares them (recurring irrigation/scouting cards);
//   (3) the caller's order is honoured, so soonest-due tasks are narrated first; (4) internal
//   ceiling raised to 90 s — the caller's budget governs; (5) or/as/ur scripts restored (all 13
//   app languages). Fact boundary (numeric fidelity + script share) unchanged.
// 2026-09-05 — Surgical timeout fix: one normal crop schedule is narrated in one bounded
// LLM request instead of several sequential/parallel chunk requests. This prevents the
// Supabase Edge invocation from exhausting its request lifetime before persistence.
// Farmer-language narration is a presentation step only. Agronomic selection stays DB/deterministic.
import { buildAIRequest, getAPIEndpoint, getAPIKey, getScheduleProviderChain, type AIProvider } from "../../_shared/aiConfig.ts";
import { isTechnicalLine } from "./farmer-text.ts";
export interface NarratableTask { task_name: string; task_description: string; instructions?: string[]; }
const NUM_RE = /\d+(?:[.,]\d+)?/g; const CHUNK_SIZE = 10; const MAX_CONCURRENCY = 2; const NARRATION_BUDGET_MS = 90_000; const MAX_OUTPUT_TOKENS = 4_500; const RETRY_DELAYS_MS = [2_000, 5_000]; const MAX_RETRY_AFTER_MS = 8_000; let rateLimited = false;
const cooldownUntil = new Map<AIProvider, number>();
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => { const id = setTimeout(resolve, ms); signal.addEventListener("abort", () => { clearTimeout(id); resolve(); }, { once: true }); });
function cooldownRemaining(provider: AIProvider) { return (cooldownUntil.get(provider) ?? 0) - Date.now(); }
async function waitForCooldown(provider: AIProvider, signal: AbortSignal) { const wait = cooldownRemaining(provider); if (wait > 0) await sleep(Math.min(wait, MAX_RETRY_AFTER_MS), signal); }
function noteRateLimit(provider: AIProvider, retryAfterMs: number | null) { rateLimited = true; cooldownUntil.set(provider, Math.max(cooldownUntil.get(provider) ?? 0, Date.now() + (retryAfterMs ?? 5_000))); }
class RetryableError extends Error { constructor(message: string, readonly retryAfterMs: number | null) { super(message); } }
function numbersOf(s: string): string[] { return (s.match(NUM_RE) || []).map((n) => n.replace(",", ".")); }
export function isFaithful(source: string, translated: string): boolean { const a = numbersOf(source).sort(); const b = numbersOf(translated).sort(); return a.length === b.length && a.every((v, i) => v === b[i]); }
function parseModelJson(content: string): unknown {
  const text = String(content).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(text); } catch {}
  const items: unknown[] = []; let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; } if (c === '"') { inStr = true; continue; } if (c === "{") { if (depth === 0) start = i; depth++; } else if (c === "}") { depth--; if (depth === 0 && start >= 0) { try { items.push(JSON.parse(text.slice(start, i + 1))); } catch {} start = -1; } } }
  return items;
}
function isProvenanceLine(s: string): boolean { return isTechnicalLine(s); }
function farmerInstructionSource(instructions: string[] | undefined): string[] { return (instructions ?? []).map(String).map((x) => x.trim()).filter(Boolean).filter((x) => !isProvenanceLine(x)); }

/** Reject mixed English output that merely contains one target-language word. */
function hasFarmerLanguageQuality(value: string, language: string, source?: string): boolean {
  if (language === "en") return true;
  const patterns: Record<string, RegExp> = {
    hi: /[\u0900-\u097F]/g, mr: /[\u0900-\u097F]/g, pa: /[\u0A00-\u0A7F]/g,
    ta: /[\u0B80-\u0BFF]/g, te: /[\u0C00-\u0C7F]/g, bn: /[\u0980-\u09FF]/g,
    gu: /[\u0A80-\u0AFF]/g, kn: /[\u0C80-\u0CFF]/g, ml: /[\u0D00-\u0D7F]/g,
    or: /[\u0B00-\u0B7F]/g, as: /[\u0980-\u09FF]/g, ur: /[\u0600-\u06FF]/g,
  };
  const target = patterns[language]; if (!target) return false;
  const scriptChars = (value.match(target) || []).length;
  // Latin that CAME FROM THE SOURCE (product names, grades, units, codes) is a preserved fact, not
  // untranslated text: excluding it stops a correct line such as "…17.2 kg Muriate of Potash (MOP)
  // 60% K2O" from being rejected forever for being "mostly English".
  const carried = source ? new Set((source.match(/[A-Za-z]{2,}/g) || []).map((w) => w.toLowerCase())) : null;
  const latinWords = value.match(/[A-Za-z]{2,}/g) || [];
  const untranslatedLatin = carried ? latinWords.filter((w) => !carried.has(w.toLowerCase())) : latinWords;
  const latinChars = untranslatedLatin.join("").length + (value.match(/(?<![A-Za-z])[A-Za-z](?![A-Za-z])/g) || []).length;
  const totalLetters = scriptChars + latinChars;
  if (totalLetters < 3) return scriptChars > 0 || (carried != null && latinWords.length > 0 && untranslatedLatin.length === 0);
  return scriptChars / totalLetters >= 0.65;
}
function containsExpectedScript(value: string, language: string, source?: string): boolean { return hasFarmerLanguageQuality(value, language, source); }

async function narrateChunk(chunk: NarratableTask[], offset: number, language: string, signal: AbortSignal): Promise<{ items: Array<{ i: number; name?: string; desc?: string; instructions?: string[] }>; provider: AIProvider; model: string }> {
  const payload = chunk.map((t, i) => ({ i, name: t.task_name, desc: t.task_description, instructions: farmerInstructionSource(t.instructions) }));
  const prompt = [
    `You are a village agriculture officer explaining farm tasks to a smallholder farmer who left school early.`,
    language === "en" ? `Rewrite the supplied text in very simple spoken English, as a village extension officer would say it to a farmer with little schooling: short sentences; say what to do, when, how much to buy, how to mix, and why; keep every number, unit, product name and date exactly as given.` : `Rewrite the supplied text in natural, simple spoken ${language}, as a village extension officer would say it to a farmer with little schooling: short sentences; everyday farming words the farmer already uses; say what to do, when, how much to buy, how to mix, and why. Use the target language as the main language, not English transliteration. Keep every number, unit, date, product name and fertilizer grade exactly as given, in Latin script where the farmer reads them that way on the bag.`,
    `The database and deterministic pipeline are the agricultural authority. You only re-word the supplied facts.`,
    `Do NOT use model memory to add agricultural facts, products, doses, timings or treatments.`,
    `Never add, remove, calculate, convert or change a number, unit, date, product, chemical, dose, timing or threshold.`,
    `Never recommend treatment when the supplied task only says to inspect or monitor.`,
    `Never output rule IDs, database field names, source labels, evidence tags, bracketed codes, or machine-style identifiers.`,
    `If information is missing, leave the field empty. Never fill a gap with a guess.`,
    `Use short spoken sentences and ordinary farmer words. No scientific or Latin names, jargon or abbreviations unless they are supplied facts that cannot be safely translated.`,
    `name: a short action title, 2-5 words.`,
    `desc: 1-2 short sentences using only supplied facts.`,
    `instructions: rewrite each supplied line into one clear farmer action step; keep count and order.`,
    `Return STRICT JSON only: [{"i":0,"name":"...","desc":"...","instructions":["..."]}]`,
    `INPUT:`, JSON.stringify(payload)
  ].join("\n");
  let lastError: unknown = new Error("MODEL_UNAVAILABLE"); const chain = getScheduleProviderChain().filter((p) => getAPIKey(p.provider));
  const ordered = [...chain].sort((a, b) => Math.max(0, cooldownRemaining(a.provider)) - Math.max(0, cooldownRemaining(b.provider)));
  for (const { provider, model } of ordered) { const apiKey = getAPIKey(provider); if (!apiKey) continue; try {
    await waitForCooldown(provider, signal); if (signal.aborted) throw new Error("narration_budget_exhausted");
    const body = buildAIRequest(provider, model, [{ role: "system", content: "Return only valid JSON. Preserve the supplied agricultural fact boundary exactly. Write for a low-literacy farmer in the requested language." }, { role: "user", content: prompt }], { maxTokens: MAX_OUTPUT_TOKENS, temperature: 0, useJsonMode: true });
    const res = await fetch(getAPIEndpoint(provider), { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` }, body: JSON.stringify(body), signal });
    if (!res.ok) { if (res.status === 429 || res.status >= 500) { const h = res.headers.get("Retry-After"); const retryAfterMs = h && !isNaN(Number(h)) ? Math.min(Number(h) * 1000, MAX_RETRY_AFTER_MS) : null; if (res.status === 429) noteRateLimit(provider, retryAfterMs); throw new RetryableError(`llm_http_${res.status}`, retryAfterMs); } throw new Error(`llm_http_${res.status}`); }
    const responseJson = await res.json(); const raw = parseModelJson(responseJson?.choices?.[0]?.message?.content ?? "[]"); const parsed = (Array.isArray(raw) ? raw : Array.isArray((raw as any)?.tasks) ? (raw as any).tasks : []) as Array<{ i: number; name?: string; desc?: string; instructions?: string[] }>;
    if (parsed.length < chunk.length) throw new RetryableError(`llm_incomplete_${parsed.length}/${chunk.length}`, null);
    return { items: parsed.map((p) => ({ ...p, i: offset + Number(p.i) })), provider, model };
  } catch (error) { lastError = error; } }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
async function narrateChunkWithRetry(chunk: NarratableTask[], offset: number, language: string, signal: AbortSignal) {
  let lastError: unknown = new Error("MODEL_UNAVAILABLE");
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) { const wait = lastError instanceof RetryableError && lastError.retryAfterMs != null ? lastError.retryAfterMs : RETRY_DELAYS_MS[attempt - 1]; await sleep(wait, signal); if (signal.aborted) break; }
    try { return await narrateChunk(chunk, offset, language, signal); } catch (error) { lastError = error; if (signal.aborted || !(error instanceof RetryableError)) break; }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
export async function narrateTasks(tasks: NarratableTask[], language: string, budgetMs?: number): Promise<{ tasks: NarratableTask[]; narrated: boolean; narratedCount: number; totalCount: number; appliedIndices: number[]; timedOut: boolean; reason?: string; provider?: string; model?: string }> {
  const totalCount = tasks.length; if (budgetMs !== undefined && budgetMs <= 2_000) return { tasks, narrated: false, narratedCount: 0, totalCount, appliedIndices: [], timedOut: true, reason: "narration_skipped_time_budget" };
  if (!totalCount) return { tasks, narrated: false, narratedCount: 0, totalCount, appliedIndices: [], timedOut: false, reason: "no_tasks" };
  let configured: Array<{ provider: AIProvider; model: string }>; try { configured = getScheduleProviderChain(); } catch { return { tasks, narrated: false, narratedCount: 0, totalCount, appliedIndices: [], timedOut: false, reason: "no_llm_key" }; }
  if (!configured.length) return { tasks, narrated: false, narratedCount: 0, totalCount, appliedIndices: [], timedOut: false, reason: "no_llm_key" };
  let provider: AIProvider | undefined; let model: string | undefined; rateLimited = false; cooldownUntil.clear();
  // Narrate each distinct text once (recurring cards share name/desc/steps); fan the result out.
  const keyOf = (t: NarratableTask) => JSON.stringify([t.task_name, t.task_description, farmerInstructionSource(t.instructions)]);
  const uniqueIndexByKey = new Map<string, number>(); const uniqueTasks: NarratableTask[] = []; const members: number[][] = [];
  tasks.forEach((t, idx) => { const k = keyOf(t); let u = uniqueIndexByKey.get(k); if (u === undefined) { u = uniqueTasks.length; uniqueIndexByKey.set(k, u); uniqueTasks.push(t); members.push([]); } members[u].push(idx); });
  const chunks: Array<{ items: NarratableTask[]; offset: number }> = []; for (let i = 0; i < uniqueTasks.length; i += CHUNK_SIZE) chunks.push({ items: uniqueTasks.slice(i, i + CHUNK_SIZE), offset: i });
  const controller = new AbortController(); const budgetTimer = setTimeout(() => controller.abort(), Math.max(0, Math.min(NARRATION_BUDGET_MS, budgetMs ?? NARRATION_BUDGET_MS))); const out = tasks.map((t) => ({ ...t, instructions: farmerInstructionSource(t.instructions) })); const failures: string[] = []; const appliedIndices = new Set<number>();
  try {
    const results: PromiseSettledResult<Awaited<ReturnType<typeof narrateChunk>>>[] = []; let i = 0;
    while (i < chunks.length) { if (controller.signal.aborted) break; if (configured.every((p) => cooldownRemaining(p.provider) > 0)) break; results.push(...await Promise.allSettled(chunks.slice(i, i + MAX_CONCURRENCY).map((c) => narrateChunkWithRetry(c.items, c.offset, language, controller.signal)))); i += MAX_CONCURRENCY; }
    for (const result of results) { if (result.status !== "fulfilled") { failures.push((result.reason as Error)?.message || "unknown"); continue; } provider = result.value.provider; model = result.value.model; for (const item of result.value.items) { const unique = uniqueTasks[item.i]; if (!unique) continue;
      const source = farmerInstructionSource(unique.instructions);
      const nameOk = !!item.name && isFaithful(unique.task_name, item.name) && containsExpectedScript(item.name, language, unique.task_name);
      const descOk = !!item.desc && isFaithful(unique.task_description, item.desc) && containsExpectedScript(item.desc, language, unique.task_description);
      const translated = Array.isArray(item.instructions) && item.instructions.length === source.length ? item.instructions.map(String) : null;
      const stepsOk = !!translated && translated.every((line, idx) => isFaithful(source[idx] ?? "", line) && containsExpectedScript(line, language, source[idx] ?? ""));
      if (!nameOk && !descOk && !stepsOk) continue;
      for (const idx of members[item.i] ?? []) { const target = out[idx]; if (!target) continue; if (nameOk) target.task_name = String(item.name); if (descOk) target.task_description = String(item.desc); if (stepsOk && translated) target.instructions = translated; appliedIndices.add(idx); }
    } }
  } finally { clearTimeout(budgetTimer); }
  const applied = appliedIndices.size; const uniqueFailures = [...new Set(failures)].slice(0, 2);
  const timedOut = controller.signal.aborted || uniqueFailures.some((failure) => /budget_exhausted|AbortError|aborted/i.test(failure));
  if (!applied) return { tasks: out, narrated: false, narratedCount: 0, totalCount, appliedIndices: [], timedOut, reason: `llm_failed:${uniqueFailures.join("|") || "no_output"}`, provider, model };
  return { tasks: out, narrated: applied === totalCount, narratedCount: applied, totalCount, appliedIndices: [...appliedIndices].sort((a, b) => a - b), timedOut, reason: applied < totalCount ? `partial:${applied}/${totalCount}:${uniqueFailures.join("|") || "translation_unavailable"}` : undefined, provider, model };
}