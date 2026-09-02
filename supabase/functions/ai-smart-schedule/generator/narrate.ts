// Farmer-language narration layer.
// Agronomic selection remains deterministic/DB-backed. The model only rewrites supplied
// facts into clear farmer language and cannot add a dose, product, timing or treatment.

import { buildAIRequest, getAPIEndpoint, getAPIKey, getScheduleProviderChain, type AIProvider } from "../../_shared/aiConfig.ts";

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

/** Provenance is retained in source_refs; it must not be rendered as a farmer instruction. */
function isProvenanceLine(s: string): boolean {
  const v = s.trim();
  return /^(?:source|evidence)\s*:/i.test(v) || /^\[?(?:evidence|source)\s*:/i.test(v);
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

  const prompt = [
    `You are the farmer-language explanation layer for a high-assurance agricultural schedule. Output language code: "${language}".`,
    `You explain only the supplied facts. The database and deterministic pipeline remain the agricultural authority.`,
    `Do NOT use model memory to add agricultural facts, products, doses, timings or treatments.`,
    `HARD FACT RULES:`,
    `1. Never add, remove, calculate, convert or change a number, unit, date, product, chemical, dose, timing or threshold.`,
    `2. Never recommend treatment when the supplied task only says to inspect or monitor.`,
    `3. Never expose rule IDs, database field names, source labels, evidence tags, internal audit notes or machine-style identifiers.`,
    `4. If information is missing, leave the corresponding field empty. Never fill a gap with a guess.`,
    `FARMER LANGUAGE RULES:`,
    `5. Use short, natural spoken language suitable for a rural smallholder farmer.`,
    `6. name: a short action title, normally 2-6 words.`,
    `7. desc: explain what to do, how to do it, and how much/when only when supplied.`,
    `8. instructions: rewrite each supplied actionable line into a clear farmer step; do not expose raw condition codes.`,
    `9. When supplied nutrient text contains N, P or K, explain as Nitrogen (N), Phosphorus (P), Potassium (K) in the selected language without adding a new recommendation.`,
    `10. Preserve the same number of actionable instruction items. Return STRICT JSON only:`,
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
          { role: "system", content: "Return only valid JSON. Preserve the supplied agricultural fact boundary exactly." },
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
      const parsed = JSON.parse(text) as Array<{ i: number; name?: string; desc?: string; instructions?: string[] }>;
      return { items: parsed.map((p) => ({ ...p, i: offset + p.i })), provider, model };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function narrateTasks(
  tasks: NarratableTask[],
  language: string,
): Promise<{ tasks: NarratableTask[]; narrated: boolean; reason?: string; provider?: string; model?: string }> {
  if (!tasks.length || language === "en") return { tasks, narrated: false, reason: "no_translation_needed" };

  let configured: Array<{ provider: AIProvider; model: string }>;
  try { configured = getScheduleProviderChain(); } catch { return { tasks, narrated: false, reason: "no_llm_key" }; }
  if (!configured.length) return { tasks, narrated: false, reason: "no_llm_key" };
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
    const results: PromiseSettledResult<Array<{ i: number; name?: string; desc?: string; instructions?: string[] }>>[] = [];
    for (let i = 0; i < chunks.length; i += MAX_CONCURRENCY) {
      if (controller.signal.aborted) break;
      const settled = await Promise.allSettled(
        chunks.slice(i, i + MAX_CONCURRENCY).map((c) =>
          narrateChunk(c.items, c.offset, language, controller.signal),
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
        if (item.name && isFaithful(target.task_name, item.name)) target.task_name = item.name;
        if (item.desc && isFaithful(target.task_description, item.desc)) target.task_description = item.desc;
        const source = farmerInstructionSource(target.instructions);
        if (Array.isArray(item.instructions) && item.instructions.length === source.length) {
          const translated = item.instructions.map(String);
          if (translated.every((line, i) => isFaithful(source[i] ?? "", line))) target.instructions = translated;
        }
        applied++;
      }
    }
  } finally {
    clearTimeout(budgetTimer);
  }

  // Fail closed: never persist a mixed-language schedule.
  if (!applied || failures.length) {
    return {
      tasks,
      narrated: false,
      reason: !applied
        ? `llm_failed:${failures.slice(0, 2).join("|") || "no_output"}`
        : `llm_partial_rejected:${failures.length}/${chunks.length}_chunks_failed`,
      provider,
      model,
    };
  }
  return { tasks: out, narrated: true, provider, model };
}