import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { respectsFactBoundary, isTargetLanguage } from "../../../supabase/functions/ai-smart-schedule/generator/compose-farmer-text.ts";

const read = (p: string) => Deno.readTextFile(p);
const facts = (over: Record<string, unknown> = {}) => ({
  index: 0, task_type: "nutrition", stage_name: "S1", phase: null, days_from_sowing: 35,
  window: { from_das: 35, to_das: 59 },
  fallback_name: "Apply Potassium (K2O basis) fertilizer",
  fallback_description: "Apply 5.16 kg Potassium to this field.",
  fallback_instructions: ["Apply 5.16 kg Potassium on this field for this application."],
  quantity: { value: 5.16, unit: "kg" }, inputs: [], product_equivalents: [],
  phi_days: null, condition: null, recurrence: null,
  source_text: ["Apply 5.16 kg Potassium to this field."], ...over,
} as Parameters<typeof respectsFactBoundary>[1]);

Deno.test("generation composes in the farmer's language; no English-then-translate pass", async () => {
  const index = await read("supabase/functions/ai-smart-schedule/index.ts");
  assert(index.includes("composeFarmerText("), "generation must compose, not translate");
  assert(!index.includes("await narrateTasks("), "the translate pass must be gone from generation");
  assert(index.includes('mode: "single_pass_composition"'));
  // the farmer's language must reach the composer
  assert(/composeFarmerText\([^;]*, language,/.test(index), "the farmer language must be passed to the composer");
});

Deno.test("enrichment writes farmer-facing words in the farmer's language, facts stay neutral", async () => {
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  assert(m.includes("const systemPrompt = (language: string)"));
  assert(m.includes("WRITE THE FARMER-FACING WORDS DIRECTLY IN THE LANGUAGE"));
  assert(m.includes("farmer_language: inputs.language"));
  assert(m.includes("Keep these fields language-neutral"));
  // still no crop / product / language word baked into the module
  const code = m.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert(!/\b(rice|wheat|sugarcane|urea|marathi|hindi|devanagari)\b/i.test(code));
});

Deno.test("fact boundary: unchanged English is rejected, real target language accepted", () => {
  assertEquals(respectsFactBoundary({ task_name: "Apply Potassium (K2O basis) fertilizer", task_description: "Apply 5.16 kg Potassium to this field.", instructions: ["Apply 5.16 kg Potassium on this field for this application."] }, facts(), "mr"), false);
  assertEquals(respectsFactBoundary({ task_name: "पोटॅश खत द्या", task_description: "या शेतात 5.16 kg पोटॅशियम खत द्या.", instructions: ["या शेतात 5.16 kg पोटॅशियम खत टाका."] }, facts(), "mr"), true);
});

Deno.test("fact boundary: a changed or invented number is rejected", () => {
  assertEquals(respectsFactBoundary({ task_name: "पोटॅश खत द्या", task_description: "या शेतात 6.00 kg पोटॅशियम खत द्या.", instructions: ["या शेतात 6.00 kg टाका."] }, facts(), "mr"), false, "changed dose must be rejected");
  assertEquals(respectsFactBoundary({ task_name: "पोटॅश खत द्या", task_description: "या शेतात 5.16 kg पोटॅशियम खत द्या.", instructions: ["7 दिवसांनी पुन्हा टाका."] }, facts(), "mr"), false, "invented number must be rejected");
});

Deno.test("fact boundary: the acting quantity and PHI must be present; product names survive", () => {
  assertEquals(respectsFactBoundary({ task_name: "पोटॅश खत द्या", task_description: "या शेतात पोटॅशियम खत द्या.", instructions: ["शेतात टाका."] }, facts(), "mr"), false, "missing dose must be rejected");
  const withPhi = facts({ phi_days: 7, source_text: ["Apply 5.16 kg Potassium.", "Wait 7 days before harvest."] });
  assertEquals(respectsFactBoundary({ task_name: "फवारणी करा", task_description: "या शेतात 5.16 kg द्या.", instructions: ["कापणीपूर्वी 7 दिवस थांबा."] }, withPhi, "mr"), true);
  const withProduct = facts({ inputs: [{ name: "Muriate of Potash", grade: "60% K2O", dose_value: 5.16, dose_unit: "kg" }] });
  assertEquals(respectsFactBoundary({ task_name: "खत द्या", task_description: "या शेतात 5.16 kg द्या.", instructions: ["टाका."] }, withProduct, "mr"), false, "dropped product name must be rejected");
});

Deno.test("target-language check: unknown language fails closed, English passes only for en", () => {
  assertEquals(isTargetLanguage("Apply fertilizer", "en"), true);
  assertEquals(isTargetLanguage("Apply fertilizer", "mr"), false);
  assertEquals(isTargetLanguage("खत द्या", "xx"), false);
  assertEquals(isTargetLanguage("या शेतात 17.2 kg Muriate of Potash (MOP) 60% K2O द्या", "mr"), true);
});

Deno.test("prompts state the translation duty: English DB prose is rendered, never copied or transliterated", async () => {
  const c = await read("supabase/functions/ai-smart-schedule/generator/compose-farmer-text.ts");
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  // the composer must tell the model that the reference material is English by design and that
  // carrying its meaning into the farmer's language is the job — not a reason to copy English
  assert(c.includes("YOUR JOB IS TO SAY THE SAME THING TO THE FARMER IN HIS OWN LANGUAGE"));
  assert(c.includes("do not transliterate"));
  assert(c.includes("reference_text_english_do_not_copy"));
  assert(c.includes("source_text_english_translate_its_meaning"));
  assert(c.includes("everyday farming word"));
  assert(m.includes("written in English by design"));
  assert(m.includes("do not transliterate"));
  // and neither prompt may name a language or a crop — the code is passed in at runtime
  for (const src of [c, m]) {
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert(!/\b(marathi|hindi|devanagari|rice|wheat|sugarcane)\b/i.test(code));
  }
});
