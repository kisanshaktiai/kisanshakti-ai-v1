// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: tests/edge/ai-registry/temperature_gate_test.ts
//
// CHANGE LOG
// 2026-09-26 — Gemini 2.5 retirement: rejectsCustomTemperature() in
//   supabase/functions/_shared/aiConfig.ts now also covers Gemini 3 and later
//   (direct Gemini API, "google" and the Lovable gateway). Google: keep Gemini 3
//   temperature at its default 1.0; lower values may cause looping.
//   Every buildAIRequest() caller (schedule narration/composition, general
//   chat, query normaliser, response generator) and the intent classifier
//   inherit it. Gemini 2.x and OpenAI behaviour must be unchanged.
//   Run with: deno test --allow-read --allow-env tests/edge/ai-registry/

import { assert, assertEquals } from "../../decision-brain/assert.ts";
import { AI_MODELS, buildAIRequest, rejectsCustomTemperature } from "../../../supabase/functions/_shared/aiConfig.ts";

Deno.test("rejectsCustomTemperature: Gemini 3+ omitted on every Google path; Gemini 2.x and legacy OpenAI unchanged", () => {
  const cases: Array<[Parameters<typeof rejectsCustomTemperature>[0], string, boolean]> = [
    // unchanged OpenAI rule
    ["openai", "gpt-5.6-luna", true],
    ["openai", "gpt-5-mini", true],
    ["openai", "gpt-4o", false],
    ["openai", "gpt-4o-mini", false],
    // new: Gemini 3 and later, any Google path
    ["gemini", "gemini-3.5-flash-lite", true],
    ["gemini", "gemini-3.8-flash", true],
    ["gemini", "gemini-3.1-pro-preview", true],
    ["lovable", "google/gemini-3.8-flash", true],
    ["lovable", "google/gemini-3-flash-preview", true],
    ["google", "google/gemini-3.8-flash", true],
    ["gemini", "gemini-10-flash", true],
    // Gemini 2.x and older keep caller temperature
    ["gemini", "gemini-2.5-flash", false],
    ["gemini", "gemini-2.0-flash", false],
    ["gemini", "gemini-1.5-flash-latest", false],
    ["lovable", "google/gemini-2.5-flash", false],
    // a model name is not a provider: an OpenAI model on the gateway is not Gemini
    ["lovable", "openai/gpt-5-mini", false],
  ];
  for (const [provider, model, want] of cases) {
    assertEquals(rejectsCustomTemperature(provider, model), want, `${provider} ${model}`);
  }
});

Deno.test("the configured Gemini and Lovable defaults are Gemini 3+ models, so temperature is never sent to them", () => {
  assert(rejectsCustomTemperature("gemini", AI_MODELS.gemini.default), `gemini.default ${AI_MODELS.gemini.default}`);
  assert(rejectsCustomTemperature("lovable", AI_MODELS.lovable.default), `lovable.default ${AI_MODELS.lovable.default}`);
});

Deno.test("buildAIRequest (schedule narration path): temperature 0 dropped for Gemini 3, kept for Gemini 2.5; JSON mode and max_tokens unchanged", () => {
  const msgs = [{ role: "user", content: "x" }];
  const g3 = buildAIRequest("gemini", AI_MODELS.gemini.default, msgs, { maxTokens: 8000, temperature: 0, useJsonMode: true }) as Record<string, unknown>;
  assert(!("temperature" in g3), "Gemini 3 must not receive temperature");
  assertEquals(g3.max_tokens, 8000);
  assertEquals(g3.response_format, { type: "json_object" });

  const lov = buildAIRequest("lovable", AI_MODELS.lovable.default, msgs, { maxTokens: 8000, temperature: 0, useJsonMode: true }) as Record<string, unknown>;
  assert(!("temperature" in lov), "Lovable Gemini 3 must not receive temperature");

  const g25 = buildAIRequest("gemini", "gemini-2.5-flash", msgs, { maxTokens: 8000, temperature: 0, useJsonMode: true }) as Record<string, unknown>;
  assertEquals(g25.temperature, 0, "Gemini 2.5 behaviour must be unchanged");

  const legacyDefault = buildAIRequest("gemini", "gemini-2.5-flash", msgs, { maxTokens: 100 }) as Record<string, unknown>;
  assertEquals(legacyDefault.temperature, 0.4, "Gemini 2.x default temperature path unchanged");
});
