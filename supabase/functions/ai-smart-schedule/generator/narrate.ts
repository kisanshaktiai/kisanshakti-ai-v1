// CHANGE LOG
// 2026-08-17 14:06 UTC — Phase 2: LLM narration layer. Translation ONLY. The model may never
//   invent, add, remove or alter any number, unit, product or date.
// 2026-08-18 15:20 UTC — 504 fix: narration now chunks tasks (20/call) and runs chunks in
//   parallel under a 45s wall-clock budget; partial/failed chunks fall back to source text
//   instead of hanging the request until the 150s idle timeout.

export interface NarratableTask {
  task_name: string;
  task_description: string;
}

const NUM_RE = /\d+(?:[.,]\d+)?/g;

function numbersOf(s: string): string[] {
  return (s.match(NUM_RE) || []).map((n) => n.replace(",", "."));
}

/** Reject a translation that changed any number — fidelity gate. */
export function isFaithful(source: string, translated: string): boolean {
  const a = numbersOf(source).sort();
  const b = numbersOf(translated).sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const CHUNK_SIZE = 20;
/** Max simultaneous LLM calls — keeps peak worker memory bounded (546 guard). */
const MAX_CONCURRENCY = 3;
/** Hard wall-clock budget for the whole narration stage. The platform kills the
 *  request at 150s; a single mega-prompt with 100+ tasks routinely blew past it. */
const NARRATION_BUDGET_MS = 45_000;


async function narrateChunk(
  chunk: NarratableTask[],
  offset: number,
  language: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<Array<{ i: number; name?: string; desc?: string }>> {
  const payload = chunk.map((t, i) => ({ i, name: t.task_name, desc: t.task_description }));
  const prompt = [
    `You are a TRANSLATOR ONLY for farm task labels into language code "${language}".`,
    `HARD RULES:`,
    `1. Translate the text of "name" and "desc" only.`,
    `2. NEVER change, add or remove any number, unit, date, chemical or product name.`,
    `3. NEVER add advice, dosage, timing or explanation of your own.`,
    `4. Return STRICT JSON: [{"i":0,"name":"...","desc":"..."}]`,
    ``,
    JSON.stringify(payload),
  ].join("\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
      signal,
    },
  );
  if (!res.ok) throw new Error(`llm_http_${res.status}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  const parsed = JSON.parse(text) as Array<{ i: number; name?: string; desc?: string }>;
  return parsed.map((p) => ({ ...p, i: offset + p.i }));
}

export async function narrateTasks(
  tasks: NarratableTask[],
  language: string,
): Promise<{ tasks: NarratableTask[]; narrated: boolean; reason?: string }> {
  if (!tasks.length || language === "en") return { tasks, narrated: false, reason: "no_translation_needed" };

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return { tasks, narrated: false, reason: "no_llm_key" };

  const chunks: Array<{ items: NarratableTask[]; offset: number }> = [];
  for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
    chunks.push({ items: tasks.slice(i, i + CHUNK_SIZE), offset: i });
  }

  const controller = new AbortController();
  const budgetTimer = setTimeout(() => controller.abort(), NARRATION_BUDGET_MS);
  const out = tasks.map((t) => ({ ...t }));
  let applied = 0;
  const failures: string[] = [];

  try {
    // Bounded concurrency: unbounded Promise.all over every chunk held all
    // request/response bodies in memory at once and tripped WORKER_RESOURCE_LIMIT (546).
    const results: PromiseSettledResult<Array<{ i: number; name?: string; desc?: string }>>[] = [];
    for (let i = 0; i < chunks.length; i += MAX_CONCURRENCY) {
      if (controller.signal.aborted) break;
      const window = chunks.slice(i, i + MAX_CONCURRENCY);
      const settled = await Promise.allSettled(
        window.map((c) => narrateChunk(c.items, c.offset, language, apiKey, controller.signal)),
      );
      results.push(...settled);
    }


    for (const r of results) {
      if (r.status !== "fulfilled") {
        failures.push((r.reason as Error)?.message || "unknown");
        continue;
      }
      for (const item of r.value) {
        const target = out[item.i];
        if (!target) continue;
        if (item.name && isFaithful(target.task_name, item.name)) target.task_name = item.name;
        if (item.desc && isFaithful(target.task_description, item.desc)) target.task_description = item.desc;
        applied++;
      }
    }
  } finally {
    clearTimeout(budgetTimer);
  }

  if (!applied) {
    return { tasks, narrated: false, reason: `llm_failed:${failures.slice(0, 2).join("|") || "no_output"}` };
  }
  return {
    tasks: out,
    narrated: true,
    reason: failures.length ? `partial:${failures.length}/${chunks.length}_chunks_failed` : undefined,
  };
}

