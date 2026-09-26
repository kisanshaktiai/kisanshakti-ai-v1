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

import { assert } from "../../decision-brain/assert.ts";

const ALLOWED: Record<string, number> = {
  "_shared/aiConfig.ts": 24,
  "ai-agriculture-chat/agents/llm-response-formatter.ts": 1,
  "ai-agriculture-chat/agents/nlu-agent.ts": 1,
  "ai-agriculture-chat/index.ts": 1,
  "ai-agriculture-chat/photo/photo-analyzer.ts": 2,
  "ai-crop-scan/index.ts": 9,
  "ai-marketing-insights/index.ts": 2,
  "community-caption-suggest/index.ts": 1,
  "community-moderate/index.ts": 1,
  "market-price-intelligence/index.ts": 1,
  "proactive-evaluator/config.ts": 1,
  "proactive-question-seed/index.ts": 1,
  "text-to-speech/index.ts": 2,
  "transcribe-voice/index.ts": 1,
  "translate-text/index.ts": 1,
  "voice-navigation-agent/index.ts": 1,
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
