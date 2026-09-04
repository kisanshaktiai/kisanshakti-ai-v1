// Farmer-language narration is a presentation step only. Agronomic selection stays DB/deterministic.
import { buildAIRequest, getAPIEndpoint, getAPIKey, getScheduleProviderChain, type AIProvider } from "../../_shared/aiConfig.ts";
import { isTechnicalLine } from "./farmer-text.ts";
export interface NarratableTask { task_name: string; task_description: string; instructions?: string[]; }
const NUM_RE = /\d+(?:[.,]\d+)?/g; const CHUNK_SIZE = 8; const MAX_CONCURRENCY = 1; const NARRATION_BUDGET_MS = 90_000; const RETRY_DELAYS_MS = [5_000, 15_000, 30_000]; const MAX_RETRY_AFTER_MS = 30_000; let rateLimited = false;
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
async function narrateChunk(chunk: NarratableTask[], offset: number, language: string, signal: AbortSignal): Promise<{ items: Array<{ i: number; name?: string; desc?: string; instructions?: string[] }>; provider: AIProvider; model: string }> {
  const payload = chunk.map((t, i) => ({ i, name: t.task_name, desc: t.task_description, instructions: farmerInstructionSource(t.instructions) }));
  const prompt = [`You are a village agriculture officer explaining farm tasks to a smallholder farmer who left school early.`, language === "en" ? `Rewrite the supplied text in very simple English.` : `Rewrite the supplied text in very simple spoken language for language code "${language}". Every word you output must be in that language (numbers and units stay as digits).`, `The database and deterministic pipeline are the agricultural authority. You only re-word the supplied facts.`, `Do NOT use model memory to add agricultural facts, products, doses, timings or treatments.`, `Never add, remove, calculate, convert or change a number, unit, date, product, chemical, dose, timing or threshold.`, `Never recommend treatment when the supplied task only says to inspect or monitor.`, `Never output rule IDs, database field names, source labels, evidence tags, bracketed codes, or machine-style identifiers.`, `If information is missing, leave the field empty. Never fill a gap with a guess.`, `Use short spoken sentences and ordinary farmer words. No scientific or Latin names, jargon or abbreviations. Keep every supplied number exactly as supplied.`, `name: a short action title, 2-5 words.`, `desc: 2-3 short sentences using only supplied facts.`, `instructions: rewrite each supplied line into one clear farmer action step; keep count and order.`, `Return STRICT JSON only: [{"i":0,"name":"...","desc":"...","instructions":["..."]}]`, `INPUT:`, JSON.stringify(payload)].join("\n");
  let lastError: unknown = new Error("MODEL_UNAVAILABLE"); const chain = getScheduleProviderChain().filter((p) => getAPIKey(p.provider));
  const ordered = [...chain].sort((a, b) => Math.max(0, cooldownRemaining(a.provider)) - Math.max(0, cooldownRemaining(b.provider)));
  for (const { provider, model } of ordered) { const apiKey = getAPIKey(provider); if (!apiKey) continue; try {
    await waitForCooldown(provider, signal); if (signal.aborted) throw new Error("narration_budget_exhausted");
    const body = buildAIRequest(provider, model, [{ role: "system", content: "Return only valid JSON. Preserve the supplied agricultural fact boundary exactly. Write for a low-literacy farmer." }, { role: "user", content: prompt }], { maxTokens: 4000, temperature: 0, useJsonMode: true });
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
    if (attempt > 0) {
      const wait = lastError instanceof RetryableError && lastError.retryAfterMs != null ? lastError.retryAfterMs : RETRY_DELAYS_MS[attempt - 1];
      await sleep(wait, signal); if (signal.aborted) break;
    }
    try { return await narrateChunk(chunk, offset, language, signal); }
    catch (error) { lastError = error; if (signal.aborted || !(error instanceof RetryableError)) break; }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
function containsExpectedScript(value: string, language: string): boolean { if (language === "en") return true; const patterns: Record<string, RegExp> = { hi: /[\u0900-\u097F]/, mr: /[\u0900-\u097F]/, pa: /[\u0A00-\u0A7F]/, ta: /[\u0B80-\u0BFF]/ }; return patterns[language] ? patterns[language].test(value) : true; }
export async function narrateTasks(tasks: NarratableTask[], language: string): Promise<{ tasks: NarratableTask[]; narrated: boolean; narratedCount: number; totalCount: number; appliedIndices: number[]; reason?: string; provider?: string; model?: string }> {
  const totalCount = tasks.length; if (!totalCount) return { tasks, narrated: false, narratedCount: 0, totalCount, appliedIndices: [], reason: "no_tasks" };
  let configured: Array<{ provider: AIProvider; model: string }>; try { configured = getScheduleProviderChain(); } catch { return { tasks, narrated: false, narratedCount: 0, totalCount, appliedIndices: [], reason: "no_llm_key" }; }
  if (!configured.length) return { tasks, narrated: false, narratedCount: 0, totalCount, appliedIndices: [], reason: "no_llm_key" };
  let provider: AIProvider | undefined; let model: string | undefined; rateLimited = false; cooldownUntil.clear();
  const chunks: Array<{ items: NarratableTask[]; offset: number }> = []; for (let i = 0; i < tasks.length; i += CHUNK_SIZE) chunks.push({ items: tasks.slice(i, i + CHUNK_SIZE), offset: i });
  const controller = new AbortController(); const budgetTimer = setTimeout(() => controller.abort(), NARRATION_BUDGET_MS); const out = tasks.map((t) => ({ ...t, instructions: farmerInstructionSource(t.instructions) })); const failures: string[] = []; const appliedIndices = new Set<number>();
  try {
    const results: PromiseSettledResult<Awaited<ReturnType<typeof narrateChunk>>>[] = []; let i = 0;
    while (i < chunks.length) {
      if (controller.signal.aborted) break;
      if (configured.every((p) => cooldownRemaining(p.provider) > 0)) break;
      results.push(...await Promise.allSettled(chunks.slice(i, i + MAX_CONCURRENCY).map((c) => narrateChunkWithRetry(c.items, c.offset, language, controller.signal))));
      i += MAX_CONCURRENCY;
    }
    for (const result of results) { if (result.status !== "fulfilled") { failures.push((result.reason as Error)?.message || "unknown"); continue; } provider = result.value.provider; model = result.value.model; for (const item of result.value.items) { const target = out[item.i]; if (!target) continue; let touched = false;
      if (item.name && isFaithful(target.task_name, item.name) && containsExpectedScript(item.name, language)) { target.task_name = item.name; touched = true; }
      if (item.desc && isFaithful(target.task_description, item.desc) && containsExpectedScript(item.desc, language)) { target.task_description = item.desc; touched = true; }
      const source = farmerInstructionSource(target.instructions); if (Array.isArray(item.instructions) && item.instructions.length === source.length) { const translated = item.instructions.map(String); if (translated.every((line, idx) => isFaithful(source[idx] ?? "", line) && containsExpectedScript(line, language))) { target.instructions = translated; touched = true; } }
      if (touched) appliedIndices.add(item.i);
    } }
  } finally { clearTimeout(budgetTimer); }
  const applied = appliedIndices.size; const uniqueFailures = [...new Set(failures)].slice(0, 2);
  if (!applied) return { tasks: out, narrated: false, narratedCount: 0, totalCount, appliedIndices: [], reason: `llm_failed:${uniqueFailures.join("|") || "no_output"}`, provider, model };
  return { tasks: out, narrated: applied === totalCount, narratedCount: applied, totalCount, appliedIndices: [...appliedIndices].sort((a, b) => a - b), reason: applied < totalCount ? `partial:${applied}/${totalCount}:${uniqueFailures.join("|") || "translation_unavailable"}` : undefined, provider, model };
}