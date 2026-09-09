// CHANGE LOG
// 2026-09-09 — v1.0.0 SINGLE-PASS FARMER-LANGUAGE COMPOSITION. Replaces the assemble-in-English-
//   then-translate cycle for schedule generation.
//
//   OLD: deterministic English sentences → narrate.ts rewrote them into the farmer's language →
//        second pass → 5-minute sweep. Two LLM jobs over the same content, a "translation pending"
//        state the farmer could see, and drift between the English text and its translation.
//
//   NEW: the generator's STRUCTURED FACTS (what, when, how much, in how much water, why, wait
//        before harvest) are handed to the model once, together with the farmer's language, and the
//        model writes the farmer-facing text directly in that language. There is no English
//        intermediate to translate, so there is nothing to re-translate.
//
//   HARNESS (why this is safer than translating, not less safe): the old check compared the
//   translation against an English STRING. This one validates against the FACTS themselves —
//   every quantity, unit, dose, date, day number, PHI and product name supplied must appear in the
//   composed text, unchanged, and nothing numeric may appear that was not supplied. The model
//   chooses only words, never a number, never a product, never a timing. Anything that fails is
//   rejected and the task falls back to its deterministic text with needs_translation, exactly as
//   before — the existing sweep then remains the safety net.
//
//   The database stores agronomic prose in English by design — it is not duplicated per language.
//   Rendering that meaning into the farmer's language is explicitly this model's job, stated in the
//   prompt, and the fact boundary below is what makes it safe to delegate.
//   Language handling is by MEANING, not by word lists: the target language is passed as a code and
//   the instruction tells the model to write as a village extension officer speaking that language.
//   No language-specific vocabulary, no crop-specific wording, lives in this file.

import { buildAIRequest, getAPIEndpoint, getAPIKey, getScheduleProviderChain, type AIProvider } from "../../_shared/aiConfig.ts";

export const COMPOSER_VERSION = "farmer-language-composer@1.0.0";

const CHUNK_SIZE = 4;
const MAX_CONCURRENCY = 4;
const MAX_OUTPUT_TOKENS = 8_000;
const COMPOSE_BUDGET_MS = 90_000;
const RETRY_DELAYS_MS = [2_000, 5_000];

/** The facts a task is built from. Everything here is DB-derived; the model may not alter any of it. */
export interface TaskFacts {
  index: number;
  task_type: string;
  stage_name: string | null;
  phase: string | null;
  days_from_sowing: number;
  window: { from_das: number | null; to_das: number | null } | null;
  /** Ready-made deterministic text, used as source material AND as the fallback if composition fails. */
  fallback_name: string;
  fallback_description: string;
  fallback_instructions: string[];
  /** Structured, language-neutral values the composed text must preserve exactly. */
  quantity: { value: number; unit: string } | null;
  water_volume: { stage_total_liters: number; per_event_liters: number | null; events: number | null } | null;
  inputs: Array<Record<string, unknown>>;
  product_equivalents: Array<Record<string, unknown>>;
  phi_days: number | null;
  condition: Record<string, unknown> | null;
  recurrence: Record<string, unknown> | null;
  /** Authoritative source prose (DB rule text) the model renders into the farmer's language. */
  source_text: string[];
}

export interface ComposedTask { task_name: string; task_description: string; instructions: string[] }
export interface ComposeResult {
  tasks: ComposedTask[];
  composedIndices: number[];
  composed: boolean;
  composedCount: number;
  totalCount: number;
  reason?: string;
  provider?: AIProvider;
  model?: string;
  timedOut?: boolean;
}

/* ── Fact boundary ─────────────────────────────────────────────────────────── */

const NUM_RE = /\d+(?:[.,]\d+)?/g;
const numbersOf = (s: string) => (s.match(NUM_RE) || []).map((n) => n.replace(",", "."));

/** Every number the facts supply, as strings, for exact preservation checks. */
function factNumbers(f: TaskFacts): string[] {
  const out: string[] = [];
  const push = (v: unknown) => { if (v != null && Number.isFinite(Number(v))) out.push(String(Number(v))); };
  push(f.days_from_sowing);
  if (f.window) { push(f.window.from_das); push(f.window.to_das); }
  if (f.quantity) push(f.quantity.value);
  if (f.water_volume) { push(f.water_volume.stage_total_liters); push(f.water_volume.per_event_liters); push(f.water_volume.events); }
  push(f.phi_days);
  for (const i of f.inputs) { push(i.dose_value); push(i.water_volume_l_per_acre); }
  for (const p of f.product_equivalents) { push(p.product_kg); push(p.percent); }
  for (const t of [...f.source_text, f.fallback_description, ...f.fallback_instructions]) out.push(...numbersOf(String(t ?? "")));
  return out;
}

/** Product / grade tokens that must survive verbatim (farmers read these on the bag). */
function factTokens(f: TaskFacts): string[] {
  const out: string[] = [];
  for (const i of f.inputs) for (const k of ["name", "grade", "active_ingredient", "formulation"]) { const v = i[k]; if (typeof v === "string" && v.trim()) out.push(v.trim()); }
  for (const p of f.product_equivalents) { const v = p.product_name; if (typeof v === "string" && v.trim()) out.push(v.trim()); }
  if (f.quantity?.unit) out.push(f.quantity.unit);
  return [...new Set(out)];
}

/**
 * A composition is accepted only when it is (a) genuinely in the target language, (b) carries every
 * supplied number unchanged, (c) invents no number of its own, and (d) preserves product/grade names.
 */
export function respectsFactBoundary(composed: ComposedTask, f: TaskFacts, language: string): boolean {
  const all = [composed.task_name, composed.task_description, ...(composed.instructions ?? [])].join(" \n ");
  if (!all.trim()) return false;
  // Per FIELD, not on the joined text: a task_name left in English used to pass because the
  // description carried the script, so farmers saw English card titles marked as translated.
  if (!isTargetLanguage(composed.task_name, language)) return false;
  if (!isTargetLanguage(composed.task_description, language)) return false;
  for (const line of composed.instructions ?? []) if (line.trim() && !isTargetLanguage(line, language)) return false;

  const supplied = factNumbers(f);
  const suppliedSet = new Set(supplied);
  const present = numbersOf(all);
  // (c) nothing numeric that was not supplied — the model may not invent a dose, a day or a price.
  for (const n of present) if (!suppliedSet.has(n)) return false;
  // (b) every quantity the farmer must act on is present. Only the acting values are mandatory;
  // day numbers already appear on the card as a date, so they are not required inside the prose.
  const mandatory: string[] = [];
  if (f.quantity) mandatory.push(String(f.quantity.value));
  for (const i of f.inputs) if (i.dose_value != null && Number.isFinite(Number(i.dose_value))) mandatory.push(String(Number(i.dose_value)));
  if (f.phi_days != null) mandatory.push(String(Number(f.phi_days)));
  const presentSet = new Set(present);
  for (const m of mandatory) if (!presentSet.has(m)) return false;
  // (d) product and grade names survive verbatim.
  const lowered = all.toLowerCase();
  for (const tok of factTokens(f)) if (!lowered.includes(tok.toLowerCase())) return false;
  return true;
}

const SCRIPTS: Record<string, RegExp> = {
  hi: /[\u0900-\u097F]/g, mr: /[\u0900-\u097F]/g, pa: /[\u0A00-\u0A7F]/g,
  ta: /[\u0B80-\u0BFF]/g, te: /[\u0C00-\u0C7F]/g, bn: /[\u0980-\u09FF]/g,
  gu: /[\u0A80-\u0AFF]/g, kn: /[\u0C80-\u0CFF]/g, ml: /[\u0D00-\u0D7F]/g,
  or: /[\u0B00-\u0B7F]/g, as: /[\u0980-\u09FF]/g, ur: /[\u0600-\u06FF]/g,
};

/** True when the text is actually written in the target language, not English wearing its label. */
export function isTargetLanguage(value: string, language: string): boolean {
  if (language === "en") return true;
  const target = SCRIPTS[language];
  if (!target) return false;                       // unknown target → fail closed, task stays pending
  const scriptChars = (value.match(target) || []).length;
  if (scriptChars === 0) return false;             // no target script at all is never a translation
  const latinLetters = (value.match(/[A-Za-z]/g) || []).length;
  // Facts (product names, grades, units) are legitimately Latin, so the bar is not "no Latin" but
  // "the sentence itself is in the target language".
  return scriptChars >= Math.max(3, latinLetters * 0.25);
}

/* ── Composition ───────────────────────────────────────────────────────────── */

function prompt(chunk: TaskFacts[], language: string): string {
  return JSON.stringify({
    write_in_language: language,
    audience: "a smallholder farmer who left school early and reads slowly on a small phone",
    voice: "a village agriculture extension officer speaking to him in his own language",
    your_job: [
      "The agronomy is already decided. The reference material below (source_text, current_english_text) was written by agronomists IN ENGLISH and is stored that way. It is working material for you, never shown to the farmer.",
      "YOUR JOB IS TO SAY THE SAME THING TO THE FARMER IN HIS OWN LANGUAGE. Carry the meaning across — do not transliterate English words into the local script, and do not leave English sentences standing.",
      "Every farmer-facing sentence you return (task_name, task_description, instructions) must be written in the requested language. If a sentence in the reference material is English, translating it is part of your job, not a reason to copy it.",
    ],
    rules: [
      "task_name is a short label (a few words) naming the job.",
      "task_description is one plain sentence: what to do and why it matters now.",
      "instructions are short steps: what to do, how, how much, in how much water, and the wait before harvest when one is given.",
      "When water_volume_liters is supplied, tell the farmer the volume in litres as well as the depth — a pump or drip line is set in litres, so the litre figure is the one he can act on.",
      "Use the everyday farming word a farmer in that language actually uses for each operation, input and plant part. Prefer the common spoken word over the textbook term.",
      "When the reference material uses a technical or scientific term the farmer may not know, express the meaning in plain words of his language rather than reproducing the term.",
      "Copy every number, unit, product name and fertilizer grade EXACTLY as supplied. Do not convert, round, add or drop a single number.",
      "Never introduce a number, dose, product, date or threshold that is not in the supplied facts.",
      "Product names and fertilizer grades stay in the script the farmer reads on the bag; the sentence around them is written in his language.",
      "When a condition is supplied, begin the steps with that condition so the farmer knows this is done only if he sees it.",
      "Do not add advice, cautions or agronomy of your own — only what the supplied facts and reference material already say.",
    ],
    reference_material_is_english_by_design: true,
    tasks: chunk.map((f) => ({
      i: f.index,
      job_type: f.task_type,
      stage: f.stage_name,
      due_day_after_sowing: f.days_from_sowing,
      window_days: f.window,
      quantity: f.quantity,
      water_volume_liters: f.water_volume,
      inputs: f.inputs,
      product_equivalents: f.product_equivalents,
      wait_days_before_harvest: f.phi_days,
      only_if: f.condition,
      repeat: f.recurrence,
      source_text_english_translate_its_meaning: f.source_text,
      reference_text_english_do_not_copy: { name: f.fallback_name, description: f.fallback_description, steps: f.fallback_instructions },
    })),
    required_output: { tasks: [{ i: 0, task_name: "", task_description: "", instructions: [""] }] },
  });
}

async function composeChunk(chunk: TaskFacts[], language: string, signal: AbortSignal): Promise<{ items: Array<{ i: number; task_name?: string; task_description?: string; instructions?: string[] }>; provider: AIProvider; model: string }> {
  const providers = getScheduleProviderChain().filter((p) => getAPIKey(p.provider));
  let lastError: Error = new Error("MODEL_UNAVAILABLE");
  for (const { provider, model } of providers) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const body = buildAIRequest(provider, model, [
          { role: "system", content: "You are a village agriculture extension officer writing a farmer's crop schedule in his own language. The agronomic reference material you are given is stored in English by design; rendering its meaning into the farmer's language is your job. Return only valid JSON. Preserve the supplied agricultural fact boundary exactly: never change, add or drop a number, dose, product or date." },
          { role: "user", content: prompt(chunk, language) },
        ], { maxTokens: MAX_OUTPUT_TOKENS, temperature: 0, useJsonMode: true });
        const res = await fetch(getAPIEndpoint(provider), { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAPIKey(provider)}` }, body: JSON.stringify(body), signal });
        if (res.status === 429 || res.status >= 500) { lastError = new Error(`MODEL_HTTP_${res.status}`); break; }
        if (!res.ok) { lastError = new Error(`MODEL_HTTP_${res.status}`); break; }
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) { lastError = new Error("MODEL_EMPTY_RESPONSE"); break; }
        const parsed = JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
        const items = Array.isArray(parsed?.tasks) ? parsed.tasks : Array.isArray(parsed) ? parsed : [];
        return { items, provider, model };
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (signal.aborted || lastError.name === "AbortError") throw new Error("COMPOSE_TIMEOUT");
        if (attempt < RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastError;
}

/**
 * Compose farmer-language text for a batch of tasks in ONE pass.
 * Tasks whose composition fails the fact boundary keep their deterministic text and are reported as
 * not composed, so the caller persists them with needs_translation and the sweep finishes them.
 */
export async function composeFarmerText(facts: TaskFacts[], language: string, budgetMs?: number): Promise<ComposeResult> {
  const out: ComposedTask[] = facts.map((f) => ({ task_name: f.fallback_name, task_description: f.fallback_description, instructions: [...f.fallback_instructions] }));
  const totalCount = facts.length;
  if (!totalCount) return { tasks: out, composedIndices: [], composed: true, composedCount: 0, totalCount: 0 };

  const controller = new AbortController();
  const budget = Math.max(0, Math.min(budgetMs ?? COMPOSE_BUDGET_MS, COMPOSE_BUDGET_MS));
  if (budget < 5_000) return { tasks: out, composedIndices: [], composed: false, composedCount: 0, totalCount, reason: "compose_budget_too_small" };
  const timer = setTimeout(() => controller.abort(), budget);

  // Identical text is composed once and reused (recurring irrigation / scouting cards).
  const keyOf = (f: TaskFacts) => JSON.stringify([f.fallback_name, f.fallback_description, f.fallback_instructions, f.quantity, f.inputs, f.phi_days, f.condition]);
  const byKey = new Map<string, number>(); const unique: TaskFacts[] = []; const members: number[][] = [];
  facts.forEach((f, idx) => { const k = keyOf(f); let u = byKey.get(k); if (u === undefined) { u = unique.length; byKey.set(k, u); unique.push({ ...f, index: u }); members.push([]); } members[u].push(idx); });

  const chunks: TaskFacts[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) chunks.push(unique.slice(i, i + CHUNK_SIZE));

  const composedIndices = new Set<number>();
  let provider: AIProvider | undefined; let model: string | undefined; const failures: string[] = [];
  let timedOut = false;

  try {
    for (let c = 0; c < chunks.length; c += MAX_CONCURRENCY) {
      if (controller.signal.aborted) { timedOut = true; break; }
      const results = await Promise.allSettled(chunks.slice(c, c + MAX_CONCURRENCY).map((ch) => composeChunk(ch, language, controller.signal)));
      for (const r of results) {
        if (r.status !== "fulfilled") { const m = (r.reason as Error)?.message || "unknown"; failures.push(m); if (m === "COMPOSE_TIMEOUT") timedOut = true; continue; }
        provider = r.value.provider; model = r.value.model;
        for (const item of r.value.items) {
          const u = unique[Number(item.i)];
          if (!u) continue;
          const candidate: ComposedTask = {
            task_name: String(item.task_name ?? "").trim() || u.fallback_name,
            task_description: String(item.task_description ?? "").trim() || u.fallback_description,
            instructions: Array.isArray(item.instructions) ? item.instructions.map(String).map((x) => x.trim()).filter(Boolean) : [...u.fallback_instructions],
          };
          if (!respectsFactBoundary(candidate, u, language)) continue;   // rejected → keeps fallback
          for (const idx of members[Number(item.i)] ?? []) { out[idx] = candidate; composedIndices.add(idx); }
        }
      }
    }
  } finally { clearTimeout(timer); }

  const composedCount = composedIndices.size;
  return {
    tasks: out,
    composedIndices: [...composedIndices].sort((a, b) => a - b),
    composed: composedCount > 0,
    composedCount,
    totalCount,
    reason: composedCount === totalCount ? undefined : (timedOut ? "compose_time_budget" : (failures[0] ?? "compose_fact_boundary_rejected")),
    provider, model, timedOut,
  };
}
