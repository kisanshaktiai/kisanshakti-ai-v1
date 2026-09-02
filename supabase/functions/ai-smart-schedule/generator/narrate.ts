// Farmer-language narration layer.
// Agronomic selection remains deterministic/DB-backed. The model only rewrites supplied
// facts into clear farmer language and cannot add a dose, product, timing or treatment.

import { buildAIRequest, getAPIEndpoint, getAPIKey, getBestScheduleProvider, type AIProvider } from "../../_shared/aiConfig.ts";

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
  provider: AIProvider,
  model: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<Array<{ i: number; name?: string; desc?: string; instructions?: string[] }>> {
  const payload = chunk.map((t, i) => ({
    i,
    name: t.task_name,
    desc: t.task_description,
    instructions: farmerInstructionSource(t.instructions),
  }));

  const prompt = [
    `You are the farmer-language explanation layer inside a high-assurance agricultural schedule. Output language code: "${language}".`,
    `All agronomic candidates and values were selected before you. You are NOT an agronomy source of truth.`,
    `Use ONLY facts supplied in each task. Do not use model memory to add agricultural facts, products, doses, timings or treatments.`,
    `Your goal is natural, simple language a rural smallholder farmer can understand.`,
    `HARD FACT RULES:`,
    `1. Never add, remove, calculate, convert or change a number, unit, date, product, chemical, dose, timing or threshold.`,
    `2. Never recommend treatment when the supplied task only says to inspect or monitor.`,
    `3. Never expose rule IDs, database field names, source labels, evidence tags, internal audit notes or machine-style identifiers.`,
    `4. If information is missing, leave the corresponding field empty. Never fill a gap with a guess.`,
    `FARMER EXPLANATION RULES:`,
    `5. "name": a short action title, normally 2-6 words.`,
    `6. "desc": explain the supplied task in short natural sentences. Prefer: what to do, how to do it, when/how much if supplied.`,
    `7. "instructions": turn each supplied actionable line into a clear spoken step. Do not output raw condition codes such as blast_leaf_lesions.`,
    `8. When an abbreviation N, P or K appears in supplied nutrient text, explain it in the selected language using the standard full nutrient name — Nitrogen (N), Phosphorus (P), Potassium (K) — without adding any new recommendation or value.`,
    `9. Use the common local farmer word first. A technical term may appear once in brackets when it helps understanding.`,
    `10. Keep sentences short and direct. Avoid textbook tone, English loan words when a clear local equivalent exists, and long paragraphs.`,
    `11. Preserve the same number of actionable instruction items. Return STRICT JSON only:`,
    `[{"i":0,"name":"...","desc":"...","instructions":["..."]}]`,
    `INPUT:`,
    JSON.stringify(payload),
  ].join("\n");

  const body = buildAIRequest(
    provider,
    model,
    [{ role: "system", content: "Return only valid JSON. Follow the supplied agricultural fact boundary exactly." }, { role: "user", content: prompt }],
    { maxTokens: 3500, temperature: 0, useJsonMode: true },
  );

  const res = await fetch(getAPIEndpoint(provider), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`llm_http_${res.status}`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "[]";
  const parsed = JSON.parse(text) as Array<{ i: number; name?: string; desc?: string; instructions?: string[] }>;
  return parsed.map((p) => ({ ...p, i: offset + p.i }));
}

export async function narrateTasks(
  tasks: NarratableTask[],
  language: string,
): Promise<{ tasks: NarratableTask[]; narrated: boolean; reason?: string; provider?: string; model?: string }> {
  if (!tasks.length || language === "en") return { tasks, narrated: false, reason: "no_translation_needed" };

  let provider: AIProvider;
  let model: string;
  let apiKey: string;
  try {
    ({ provider, model } = getBestScheduleProvider());
    apiKey = getAPIKey(provider);
  } catch {
    return { tasks, narrated: false, reason: "no_llm_key" };
  }
  if (!apiKey) return { tasks, narrated: false, reason: "no_llm_key" };

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
          narrateChunk(c.items, c.offset, language, provider, model, apiKey, controller.signal),
        ),
      );
      results.push(...settled);
    }

    for (const result of results) {
      if (result.status !== "fulfilled") {
        failures.push((result.reason as Error)?.message || "unknown");
        continue;
      }
      for (const item of result.value) {
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
