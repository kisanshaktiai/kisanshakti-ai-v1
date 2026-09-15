import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { respectsFactBoundary, isTargetLanguage } from "../../../supabase/functions/ai-smart-schedule/generator/compose-farmer-text.ts";

const read = (p: string) => Deno.readTextFile(p);
const facts = (over: Record<string, unknown> = {}) => ({
  index: 0, task_type: "nutrition", stage_name: "S1", phase: null, days_from_sowing: 35,
  window: { from_das: 35, to_das: 59 },
  fallback_name: "Apply Potassium (K2O basis) fertilizer",
  fallback_description: "Apply 5.16 kg Potassium to this field.",
  fallback_instructions: ["Apply 5.16 kg Potassium on this field for this application."],
  quantity: { value: 5.16, unit: "kg" }, water_volume: null, inputs: [], product_equivalents: [],
  phi_days: null, condition: null, recurrence: null,
  source_text: ["Apply 5.16 kg Potassium to this field."], ...over,
} as Parameters<typeof respectsFactBoundary>[1]);

Deno.test("generation composes in the farmer's language; no English-then-translate pass", async () => {
  const index = await read("supabase/functions/ai-smart-schedule/index.ts");
  assert(index.includes("composeFarmerText("), "generation must compose, not translate");
  assert(!index.includes("await narrateTasks("), "the translate pass must be gone from generation");
  assert(index.includes('mode: "single_pass_composition"'));
  assert(/composeFarmerText\([^;]*, language,/.test(index), "the farmer language must be passed to the composer");
});

Deno.test("fact boundary: unchanged English rejected, real target language accepted", () => {
  assertEquals(respectsFactBoundary({ task_name: "Apply Potassium (K2O basis) fertilizer", task_description: "Apply 5.16 kg Potassium to this field.", instructions: ["Apply 5.16 kg Potassium on this field."] }, facts(), "mr"), false);
  assertEquals(respectsFactBoundary({ task_name: "पोटॅश खत द्या", task_description: "या शेतात 5.16 kg पोटॅशियम खत द्या.", instructions: ["या शेतात 5.16 kg पोटॅशियम खत टाका."] }, facts(), "mr"), true);
});

Deno.test("fact boundary: a changed or invented number is rejected", () => {
  assertEquals(respectsFactBoundary({ task_name: "पोटॅश खत द्या", task_description: "या शेतात 6.00 kg पोटॅशियम खत द्या.", instructions: ["या शेतात 6.00 kg टाका."] }, facts(), "mr"), false);
  assertEquals(respectsFactBoundary({ task_name: "पोटॅश खत द्या", task_description: "या शेतात 5.16 kg पोटॅशियम खत द्या.", instructions: ["7 दिवसांनी पुन्हा टाका."] }, facts(), "mr"), false);
});

Deno.test("prompts state the translation duty: English DB prose is rendered, never copied", async () => {
  const c = await read("supabase/functions/ai-smart-schedule/generator/compose-farmer-text.ts");
  const m = await read("supabase/functions/ai-smart-schedule/harness/llm-candidates.ts");
  assert(c.includes("YOUR JOB IS TO SAY THE SAME THING TO THE FARMER IN HIS OWN LANGUAGE"));
  assert(c.includes("do not transliterate"));
  assert(c.includes("source_text_english_translate_its_meaning"));
  assert(m.includes("written in English by design"));
  for (const src of [c, m]) {
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert(!/\b(marathi|hindi|devanagari|rice|wheat|sugarcane)\b/i.test(code));
  }
});

Deno.test("irrigation carries litres as well as depth, derived from land area", async () => {
  const gen = await read("supabase/functions/ai-smart-schedule/generator/baseline-generator.ts");
  const idx = await read("supabase/functions/ai-smart-schedule/index.ts");
  const cmp = await read("supabase/functions/ai-smart-schedule/generator/compose-farmer-text.ts");
  assert(gen.includes("4046.856"), "acre→m² factor must be explicit");
  assert(gen.includes("stage_total_liters") && gen.includes("per_event_liters"));
  assert(gen.includes('basis: "depth_mm_x_field_area_m2"'), "the conversion basis must be recorded");
  // no efficiency factor may be invented — litres are the field volume, nothing more
  assert(!/efficiency|0\.[5-9]\s*\*\s*(waterMm|stageL)/i.test(gen.slice(gen.indexOf("water_volume:"), gen.indexOf("water_volume:") + 900)));
  assert(idx.includes("water_required_liters: t.water_volume?.per_event_liters"));
  assert(cmp.includes("water_volume_liters"));
});

Deno.test("the crop cycle closes at the variety's maturity", async () => {
  const gen = await read("supabase/functions/ai-smart-schedule/generator/baseline-generator.ts");
  assert(gen.includes("harvest_tasks_merged:"), "several harvest cards must collapse to one");
  assert(gen.includes("harvest_moved_to_variety_maturity:"));
  assert(gen.includes("post_harvest_moved_to_after_harvest:"));
  assert(gen.includes("tasks_after_variety_maturity_dropped:"));
  // the authority is the DB variety duration, never a constant
  assert(gen.includes("varietyDuration?.maxDays != null"));
  assert(!/maturityDas\s*=\s*\d/.test(gen));
});

Deno.test("language is checked per field, so an English title cannot ride on a translated body", async () => {
  const cmp = await read("supabase/functions/ai-smart-schedule/generator/compose-farmer-text.ts");
  assert(cmp.includes("isTargetLanguage(composed.task_name, language)"));
  assert(cmp.includes("isTargetLanguage(composed.task_description, language)"));
  assert(cmp.includes("for (const line of composed.instructions ?? []) if (line.trim() && !isTargetLanguage(line, language)) return false;"));
});

Deno.test("dose arithmetic is per land area, and the seed rate declares its sowing basis", async () => {
  const gen = await read("supabase/functions/ai-smart-schedule/generator/baseline-generator.ts");
  const repo = await read("supabase/functions/ai-smart-schedule/db/agronomy-repo.ts");
  // fertilizer: DB per-hectare rate × the field's own hectares — never a per-acre constant
  assert(gen.includes("fert.n_kg_ha * areaHa") || gen.includes("fert.n_kg_ha != null ? Number((fert.n_kg_ha * areaHa)"));
  // seed: per-acre rate × the field's acres
  assert(gen.includes("seed.kgPerAcre * areaAcres"));
  // the sowing basis and the broadcast band come from the DB row, and are shown to the farmer
  assert(repo.includes("seed_rate_basis_code") && repo.includes("seed_rate_broadcast_kg_per_acre_min"));
  assert(gen.includes('seed?.basisCode === "FIELD_LINE_SOWN"'));
  assert(gen.includes("If you broadcast the seed by hand instead"));
  assert(gen.includes("seed_rate_broadcast_band_missing:"), "a missing broadcast band must be reported, not guessed");
  // no hard-coded seed or fertilizer number anywhere in the arithmetic
  assert(!/kgPerAcre\s*=\s*\d/.test(gen) && !/n_kg_ha\s*=\s*\d/.test(gen));
});
