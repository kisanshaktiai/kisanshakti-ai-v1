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

import { assert } from "../../decision-brain/assert.ts";

const ALLOWED: Record<string, number> = {
  "_shared/aiConfig.ts": 24,
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

Deno.test("native Gemini and Lovable calls pass temperature through rejectsCustomTemperature()", async () => {
  const idx = await Deno.readTextFile(`${ROOT}/ai-agriculture-chat/index.ts`);
  const tier2 = idx.slice(idx.indexOf("// TIER 2 — Gemini direct"), idx.indexOf("// TIER 3 — OpenAI direct"));
  assert(tier2.length > 0, "forceTranslate TIER 2 block not found");
  assert(tier2.includes("rejectsCustomTemperature('gemini', AI_MODELS.gemini.default)"), "translation Gemini tier must gate temperature");
  assert(!/^\s*generationConfig:\s*\{\s*temperature:/m.test(tier2), "translation Gemini tier hardcodes temperature");

  const fmt = await Deno.readTextFile(`${ROOT}/ai-agriculture-chat/agents/llm-response-formatter.ts`);
  for (const [fn, provider] of [["callGeminiWithTimeout", "gemini"], ["callLovableAIWithTimeout", "lovable"]] as const) {
    const start = fmt.indexOf(`async function ${fn}(`);
    assert(start >= 0, `${fn} not found`);
    const next = fmt.indexOf("\nasync function ", start + 10);
    const body = fmt.slice(start, next === -1 ? undefined : next);
    assert(body.includes(`rejectsCustomTemperature('${provider}'`), `${fn} must gate temperature`);
    assert(!/^\s*temperature:\s*[0-9.]+,/m.test(body), `${fn} hardcodes temperature`);
  }
});
