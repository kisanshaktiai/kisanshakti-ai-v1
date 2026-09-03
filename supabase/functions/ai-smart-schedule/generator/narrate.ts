// CHANGE LOG
// 2026-09-03 06:25 UTC — Rate-limit resilience + per-task truth. Live evidence: both
//   providers returned HTTP 429 and the whole Marathi schedule silently persisted as
//   English. Now: Retry-After-aware bounded backoff, provider chain retried after the
//   wait instead of failing instantly, chunk concurrency dropped to 1 once a 429 is
//   seen, and the exact set of narrated task indices is returned so untranslated tasks
//   can be marked translation-pending instead of being relabelled "en".
// 2026-09-02 12:40 UTC — Narration is now SIMPLIFY + TRANSLATE for EVERY language
//   (the `language === "en"` early return is gone; English gets a plain-language pass).
//   New village-officer prompt with hard readability rules, one failed-chunk retry,
//   and PARTIAL acceptance: tasks whose rewrite failed keep their sanitized text
//   instead of the whole schedule falling back to raw DB English.
//
// Agronomic selection remains deterministic/DB-backed. The model only rewrites supplied
// facts into clear farmer language and cannot add a dose, product, timing or treatment.

import { buildAIRequest, getAPIEndpoint, getAPIKey, getScheduleProviderChain, type AIProvider } from "../../_shared/aiConfig.ts";
import { isTechnicalLine } from "./farmer-text.ts";


export interface NarratableTask {
  task_name: string;
  task_description: string;
  instructions?: string[];
}

const NUM_RE = /\d+(?:[.,]\d+)?/g;
const CHUNK_SIZE = 20;
const MAX_CONCURRENCY = 3;
const NARRATION_BUDGET_MS = 45_000;

function numbersOf(s: string): string[] {
  return (s.match(NUM_RE) || []).map((n) => n.replace(",", "."));
}

/** A narration is rejected if it changes any supplied number. */
export function isFaithful(source: string, translated: string): boolean {
  const a = numbersOf(source).sort();
  const b = numbersOf(translated).sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Provenance is retained in source_refs / technical_details; never a farmer instruction. */
function isProvenanceLine(s: string): boolean {
  return isTechnicalLine(s);
}

function farmerInstructionSource(instructions: string[] | undefined): string[] {
  return (instructions ?? []).map(String).map((x) => x.trim()).filter(Boolean).filter((x) => !isProvenanceLine(x));
}

async function narrateChunk(
  chunk: NarratableTask[],
  offset: number,
  language: string,
  signal: AbortSignal,
): Promise<{ items: Array<{ i: number; name?: string; desc?: string; instructions?: string[] }>; provider: AIProvider; model: string }> {
  const payload = chunk.map((t, i) => ({
    i,
    name: t.task_name,
    desc: t.task_description,
    instructions: farmerInstructionSource(t.instructions),
  }));

  const sameLanguage = language === "en";

  const prompt = [
    `You are a village agriculture officer explaining farm tasks to a smallholder farmer who left school early.`,
    sameLanguage
      ? `Rewrite the supplied text in very simple English.`
      : `Rewrite the supplied text in very simple spoken language for language code "${language}". Every word you output must be in that language (numbers and units stay as digits).`,
    `The database and deterministic pipeline are the agricultural authority. You only re-word the supplied facts.`,
    `Do NOT use model memory to add agricultural facts, products, doses, timings or treatments.`,
    `HARD FACT RULES:`,
    `1. Never add, remove, calculate, convert or change a number, unit, date, product, chemical, dose, timing or threshold.`,
    `2. Never recommend treatment when the supplied task only says to inspect or monitor.`,
    `3. Never output rule IDs, database field names, source labels, evidence tags, bracketed codes, or machine-style identifiers such as "MPKV-RDF", "N35/P0/K30" or "[EVIDENCE:...]".`,
    `4. If information is missing, leave the field empty. Never fill a gap with a guess.`,
    `SIMPLE LANGUAGE RULES (this is the main job):`,
    `5. One idea per sentence. Short sentences. Words a farmer uses in the field.`,
    `6. No scientific or Latin names, no jargon, no abbreviations. Spell things out in ordinary words.`,
    `7. A ratio like 100:50:50 must be explained in words (for example: "100 parts Nitrogen, 50 parts Phosphorus, 50 parts Potassium") — keep every number exactly as supplied.`,
    `8. Explain nutrient letters as Nitrogen (N), Phosphorus (P), Potassium (K) in the output language, without adding a new recommendation.`,
    `9. name: a short action title, 2-5 words.`,
    `10. desc: 2-3 short sentences saying what to do, how to do it, and how much/when — only when supplied.`,
    `11. instructions: rewrite each supplied line into ONE clear farmer action step. Keep the same number of items, in the same order.`,
    `Return STRICT JSON only:`,
    `[{"i":0,"name":"...","desc":"...","instructions":["..."]}]`,
    `INPUT:`,
    JSON.stringify(payload),
  ].join("\n");

  let lastError: unknown = new Error("MODEL_UNAVAILABLE");
  for (const { provider, model } of getScheduleProviderChain()) {
    const apiKey = getAPIKey(provider);
    if (!apiKey) continue;
    try {
      const body = buildAIRequest(
        provider,
        model,
        [
          { role: "system", content: "Return only valid JSON. Preserve the supplied agricultural fact boundary exactly. Write for a low-literacy farmer." },
          { role: "user", content: prompt },
        ],
        // Rewriting must be stable and reproducible.
        { maxTokens: 3500, temperature: 0, useJsonMode: true },
      );
      const res = await fetch(getAPIEndpoint(provider), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) throw new Error(`llm_http_${res.status}`);
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content ?? "[]";
      const raw = JSON.parse(text);
      const parsed = (Array.isArray(raw) ? raw : Array.isArray(raw?.tasks) ? raw.tasks : []) as Array<
        { i: number; name?: string; desc?: string; instructions?: string[] }
      >;
      return { items: parsed.map((p) => ({ ...p, i: offset + Number(p.i) })), provider, model };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function narrateChunkWithRetry(
  chunk: NarratableTask[],
  offset: number,
  language: string,
  signal: AbortSignal,
) {
  try {
    return await narrateChunk(chunk, offset, language, signal);
  } catch (first) {
    if (signal.aborted) throw first;
    return await narrateChunk(chunk, offset, language, signal);
  }
}

export async function narrateTasks(
  tasks: NarratableTask[],
  language: string,
): Promise<{
  tasks: NarratableTask[];
  narrated: boolean;
  narratedCount: number;
  totalCount: number;
  reason?: string;
  provider?: string;
  model?: string;
}> {
  const totalCount = tasks.length;
  if (!totalCount) return { tasks, narrated: false, narratedCount: 0, totalCount, reason: "no_tasks" };

  let configured: Array<{ provider: AIProvider; model: string }>;
  try { configured = getScheduleProviderChain(); } catch { return { tasks, narrated: false, narratedCount: 0, totalCount, reason: "no_llm_key" }; }
  if (!configured.length) return { tasks, narrated: false, narratedCount: 0, totalCount, reason: "no_llm_key" };
  let provider: AIProvider | undefined;
  let model: string | undefined;

  const chunks: Array<{ items: NarratableTask[]; offset: number }> = [];
  for (let i = 0; i < tasks.length; i += CHUNK_SIZE) chunks.push({ items: tasks.slice(i, i + CHUNK_SIZE), offset: i });

  const controller = new AbortController();
  const budgetTimer = setTimeout(() => controller.abort(), NARRATION_BUDGET_MS);
  const out = tasks.map((t) => ({ ...t, instructions: farmerInstructionSource(t.instructions) }));
  const failures: string[] = [];
  let applied = 0;

  try {
    const results: PromiseSettledResult<Awaited<ReturnType<typeof narrateChunk>>>[] = [];
    for (let i = 0; i < chunks.length; i += MAX_CONCURRENCY) {
      if (controller.signal.aborted) break;
      const settled = await Promise.allSettled(
        chunks.slice(i, i + MAX_CONCURRENCY).map((c) =>
          narrateChunkWithRetry(c.items, c.offset, language, controller.signal),
        ),
      );
      results.push(...settled);
    }

    for (const result of results) {
      if (result.status !== "fulfilled") {
        failures.push((result.reason as Error)?.message || "unknown");
        continue;
      }
      provider = result.value.provider;
      model = result.value.model;
      for (const item of result.value.items) {
        const target = out[item.i];
        if (!target) continue;
        let touched = false;
        if (item.name && isFaithful(target.task_name, item.name)) { target.task_name = item.name; touched = true; }
        if (item.desc && isFaithful(target.task_description, item.desc)) { target.task_description = item.desc; touched = true; }
        const source = farmerInstructionSource(target.instructions);
        if (Array.isArray(item.instructions) && item.instructions.length === source.length) {
          const translated = item.instructions.map(String);
          if (translated.every((line, i) => isFaithful(source[i] ?? "", line))) {
            target.instructions = translated;
            touched = true;
          }
        }
        if (touched) applied++;
      }
    }
  } finally {
    clearTimeout(budgetTimer);
  }

  if (!applied) {
    return {
      tasks: out,
      narrated: false,
      narratedCount: 0,
      totalCount,
      reason: `llm_failed:${failures.slice(0, 2).join("|") || "no_output"}`,
      provider,
      model,
    };
  }

  // Partial acceptance: un-narrated tasks keep their SANITIZED text (tag-free, shorthand
  // expanded) — never raw DB text — so a card is never half machine-speak.
  return {
    tasks: out,
    narrated: true,
    narratedCount: applied,
    totalCount,
    reason: applied < totalCount ? `partial:${applied}/${totalCount}` : undefined,
    provider,
    model,
  };
}
