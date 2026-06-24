import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizeCropCode,
  normalizeObservationCode,
  normalizeGrowthStage,
  normalizeIntentCode,
  getCropCodeVariants,
} from "../utils/crop-code-normalizer.ts";

Deno.test("normalizeCropCode → lowercase full name", () => {
  assertEquals(normalizeCropCode("Cotton"), "cotton");
  assertEquals(normalizeCropCode("SUGARCANE"), "sugarcane");
  assertEquals(normalizeCropCode("SC"), "sugarcane");
  assertEquals(normalizeCropCode("CTN"), "cotton");
  assertEquals(normalizeCropCode("गन्ना"), "sugarcane");
  assertEquals(normalizeCropCode("ऊस"), "sugarcane");
  assertEquals(normalizeCropCode(""), "all");
  assertEquals(normalizeCropCode(null), "all");
  assertEquals(normalizeCropCode("Sugar Cane"), "sugarcane");
});

Deno.test("normalizeIntentCode stays UPPER_SNAKE", () => {
  assertEquals(normalizeIntentCode("pest_damage_report"), "PEST_DAMAGE_REPORT");
  assertEquals(normalizeIntentCode("PEST_DAMAGE_REPORT"), "PEST_DAMAGE_REPORT");
  assertEquals(normalizeIntentCode("borer identification"), "BORER_IDENTIFICATION");
});

Deno.test("normalizeObservationCode → lowercase snake", () => {
  assertEquals(normalizeObservationCode("STEM_DAMAGE"), "stem_damage");
  assertEquals(normalizeObservationCode("Leaf Yellowing"), "leaf_yellowing");
});

Deno.test("normalizeGrowthStage → lowercase snake", () => {
  assertEquals(normalizeGrowthStage("Grand Growth"), "grand_growth");
  assertEquals(normalizeGrowthStage("TILLERING"), "tillering");
});

Deno.test("getCropCodeVariants always includes 'all'", () => {
  const v = getCropCodeVariants("Cotton");
  assertEquals(v.includes("cotton"), true);
  assertEquals(v.includes("all"), true);
});
