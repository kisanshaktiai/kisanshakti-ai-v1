// CHANGE LOG
// 2026-08-17 14:06 UTC — Phase 2: LLM narration layer. Translation ONLY. The model may never
//   invent, add, remove or alter any number, unit, product or date.

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

export async function narrateTasks(
  tasks: NarratableTask[],
  language: string,
): Promise<{ tasks: NarratableTask[]; narrated: boolean; reason?: string }> {
  if (!tasks.length || language === "en") return { tasks, narrated: false, reason: "no_translation_needed" };

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return { tasks, narrated: false, reason: "no_llm_key" };

  const payload = tasks.map((t, i) => ({ i, name: t.task_name, desc: t.task_description }));
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

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) return { tasks, narrated: false, reason: `llm_http_${res.status}` };
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    const parsed = JSON.parse(text) as Array<{ i: number; name?: string; desc?: string }>;

    const out = tasks.map((t) => ({ ...t }));
    for (const item of parsed) {
      const target = out[item.i];
      if (!target) continue;
      if (item.name && isFaithful(target.task_name, item.name)) target.task_name = item.name;
      if (item.desc && isFaithful(target.task_description, item.desc)) target.task_description = item.desc;
    }
    return { tasks: out, narrated: true };
  } catch (e) {
    return { tasks, narrated: false, reason: `llm_error:${(e as Error).message}` };
  }
}
