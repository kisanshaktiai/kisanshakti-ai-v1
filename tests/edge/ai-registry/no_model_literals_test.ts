// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: tests/edge/ai-registry/no_model_literals_test.ts
//
// CHANGE LOG
// 2026-09-25 — AI model SSOT Phase 1: ratchet against hardcoded model names.
//   Model choice lives in the database registry (ai_task_route →
//   ai_model_catalog); code calls callAITask({ task }) in _shared/aiConfig.ts.
//   ALLOWED holds the measured count of model-name literals per file at
//   c78e6bb (comments excluded). The test fails when:
//     * a file NOT listed gains a model name        → use callAITask instead;
//     * a listed file's count GROWS                 → same;
//     * a listed file's count DROPS                 → lower its allowance
//       (or delete the entry at 0) so it can never grow back.
//   Phase 2 removes entries one function at a time. _shared/aiConfig.ts keeps
//   its AI_MODELS defaults (the emergency path) and stays listed.
//   Run with: deno test --allow-read tests/edge/ai-registry/
// 2026-09-26 — Gemini 2.5 family replaced in _shared/aiConfig.ts; the
//   formatter's last literal became a label built from AI_MODELS (allowance
//   removed). New lock: no live file may name a Gemini 2.5 model again, and
//   the three native Gemini/Lovable calls that hardcoded a temperature must
//   pass it through rejectsCustomTemperature() like their OpenAI neighbours.
// 2026-09-27 — AI model SSOT, all call sites: every chat-completions call in
//   supabase/functions now reaches a model through the registry (callAITask, or
//   resolveAITaskChain for ai-smart-schedule's own retry loops). Allowances for
//   the migrated files removed (photo-analyzer.ts and ai-smart-schedule
//   harness/llm.ts were dead code and are deleted). The temperature-gate lock is
//   replaced by a stronger one: outside _shared/aiConfig.ts no live file may call
//   a chat-completions endpoint directly. Audio (text-to-speech, transcribe-voice)
//   and Cohere embedding/rerank are NOT chat-completions tasks and stay listed:
//   the catalog cannot represent them yet (provider CHECK: openai|gemini|lovable;
//   the router speaks /chat/completions only).

import { assert } from "../../decision-brain/assert.ts";

const ALLOWED: Record<string, number> = {
  "_shared/aiConfig.ts": 24,          // AI_MODELS: cold-start emergency default only
  "text-to-speech/index.ts": 2,       // audio speech endpoint — not a chat-completions task
  "transcribe-voice/index.ts": 1,     // audio transcription endpoint — not a chat-completions task
};

const ROOT = "supabase/functions";
const MODEL_RE = /\b(?:gpt-[0-9][0-9a-z.\-]*[0-9a-z]|gemini-[0-9][0-9a-z.\-]*[0-9a-z]|whisper-[0-9][0-9a-z]*|o[134]-(?:mini|pro|preview)[0-9a-z\-]*)\b/g;

function stripComments(src: string): string {
  // Block comments, then line comments that start a line or follow code
  // punctuation/space — so "https://…" inside a string is kept.
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}(),])\/\/.*$/gm, "$1");
}

async function scan(dir: string, out: Record<string, string[]>) {
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) await scan(p, out);
    else if (p.endsWith(".ts")) {
      const hits = stripComments(await Deno.readTextFile(p)).match(MODEL_RE) || [];
      if (hits.length) out[p.slice(ROOT.length + 1)] = hits;
    }
  }
}

Deno.test("no new hardcoded AI model names outside the registry (ratchet)", async () => {
  const found: Record<string, string[]> = {};
  await scan(ROOT, found);
  const problems: string[] = [];
  for (const [file, hits] of Object.entries(found)) {
    const allowed = ALLOWED[file];
    if (allowed === undefined) problems.push(`${file}: new model name(s) ${[...new Set(hits)].join(", ")} — call callAITask({ task }) instead`);
    else if (hits.length > allowed) problems.push(`${file}: ${hits.length} model names, allowed ${allowed} (${[...new Set(hits)].join(", ")})`);
    else if (hits.length < allowed) problems.push(`${file}: now ${hits.length}, allowance ${allowed} — lower ALLOWED to ${hits.length} so it cannot grow back`);
  }
  for (const [file, allowed] of Object.entries(ALLOWED)) {
    if (!found[file]) problems.push(`${file}: now 0, allowance ${allowed} — remove its ALLOWED entry`);
  }
  assert(problems.length === 0, "\n" + problems.join("\n"));
});

// Models the registry has retired and live code must never call again.
const RETIRED = /(google\/)?gemini-2\.5[0-9a-z.\-]*/g;

Deno.test("no live code names a retired Gemini 2.5 model", async () => {
  const hits: string[] = [];
  async function walk(dir: string) {
    for await (const e of Deno.readDir(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) await walk(p);
      else if (p.endsWith(".ts")) {
        const m = stripComments(await Deno.readTextFile(p)).match(RETIRED);
        if (m) hits.push(`${p.slice(ROOT.length + 1)}: ${[...new Set(m)].join(", ")}`);
      }
    }
  }
  await walk(ROOT);
  assert(hits.length === 0, "\n" + hits.join("\n"));
});

// Chat-completions endpoints. Only the registry router in _shared/aiConfig.ts may call them.
const CHAT_ENDPOINT = /https:\/\/(?:api\.openai\.com\/v1\/chat\/completions|generativelanguage\.googleapis\.com\/v1beta\/(?:openai\/chat\/completions|models\/[^"'`\s]*:generateContent)|ai\.gateway\.lovable\.dev\/v1\/chat\/completions)/g;
// Model pickers that bypass the registry. aiConfig.ts still defines them for the emergency default.
const LEGACY_PICKER = /\b(?:getBestAvailableProvider|getBestScheduleProvider|getScheduleProviderChain|buildAIRequest)\s*\(|\bAI_MODELS\s*\./g;

Deno.test("no live file calls a chat-completions endpoint or a legacy model picker outside the registry router", async () => {
  const hits: string[] = [];
  async function walk(dir: string) {
    for await (const e of Deno.readDir(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) await walk(p);
      else if (p.endsWith(".ts") && !p.endsWith("_test.ts") && !p.endsWith(".test.ts")) {
        const rel = p.slice(ROOT.length + 1);
        if (rel === "_shared/aiConfig.ts") continue;
        const src = stripComments(await Deno.readTextFile(p));
        const m = [...(src.match(CHAT_ENDPOINT) || []), ...(src.match(LEGACY_PICKER) || [])];
        if (m.length) hits.push(`${rel}: ${[...new Set(m)].join(", ")}`);
      }
    }
  }
  await walk(ROOT);
  assert(hits.length === 0, "\n" + hits.join("\n"));
});
