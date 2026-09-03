// CHANGE LOG
// 2026-09-01 — v1.5.1 farmer-semantic projection fix: irrigation guideline.notes is a
// generic stage note and is NOT safe to project into an irrigation card. Only
// irrigation-specific DB fields are farmer-facing; the raw note remains unprojected.
// 2026-08-29 — v1.5.0 "same task every day" fix: (1) irrigation guideline rows are RULES,
//   not calendars — one recurring task per stage window carrying `recurrence`
//   {interval_days, window_start, window_end, expected_events} instead of one dated clone
//   per interval (rice germination interval=1 emitted 10 identical daily rows, each
//   stamped with the whole-stage water total). interval 0 now emits a "stop irrigation"
//   withdrawal advisory instead of being dropped as invalid. (2) Scouting collapses the
//   same way — one weekly-recurring task per stage window (was 26 clones). (3) task_name
//   is a short LABEL (rule.action_text paragraphs moved to task_description only).
//   (4) Lifecycle operations (land prep, seed treatment, nursery, harvest, post-harvest)
//   are emitted from the stage graph — schedules previously just stopped at grain filling.
// 2026-08-28 — P2: the generated baseline is now self-validated (generator/validate-schedule.ts)

//   and the result carries `validation` — index.ts refuses to persist on any violation.
// 2026-08-28 — P0 forensic fixes (schedule 5673e87a audit): (1) field-action and scouting
//   rules are now applicability-gated by the land's region and the schedule's cultivation
//   methods (see agronomy-repo). (2) Irrigation guidelines are scoped to the SELECTED stage
//   graph by stage_master_id FK — no more nursery/transplanting expansion into DSR. (3)
//   Schedule duration/harvest now come from the variety's own VCA maturity window when
//   stated (PB1509 direct_seeded: 115–125 d) instead of the generic stage-graph das_max
//   (rice: 190 d); the graph overrun is a named gap. Version → 1.4.0 so schedules are
//   self-identifying.
// 2026-08-28 — P0 counter-audit fixes: (1) NUTRIENT_PRODUCT (N→UREA, P→SSP, K→MOP) removed —
//   an application-level agronomic mapping. Nutrient-task cost is now computed ONLY when the
//   DB itself supplies the product identity; until it does, cost stays null with an explicit
//   gap. (2) getSeedRate now receives the stage-clock method for declared-hierarchy VCA
//   fallback. (3) Fertilizer split parsing is strict: an explicit percent/pct key in (0,100]
//   divides by 100; a fraction key must already be in (0,1]; a bare 'share' or an
//   out-of-range value is AMBIGUOUS ⇒ null quantity + named gap, never a /100 heuristic.
// 2026-08-28 — P0-A: stage lookup now uses ResolvedInputs.stageClockMethod (canonical clock
//   from fn_effective_method's declared parent-walk) so child methods like rice
//   direct_seeded_dry clock against their declared canonical graph. Seed/fertilizer/VCA
//   lookups still use the farmer's selected method — this change touches phenology only.
// 2026-08-24 18:20 UTC — task content: scouting brief from condition_code/etl_threshold,
//   irrigation notes + critical moisture, sowing fallback detail, rule ETL/dose/source
//   instructions, precautions from rule contraindications. Empty content → named gap.
// 2026-08-24 17:47 UTC — P0: transplant clock (crop_stage_master.clock_reference='transplanting'
//   stages are days-after-transplant and are shifted onto the sowing axis via toDas /
//   transplantOffset; unresolvable offset → gap transplant_offset_unresolved + skip);
//   CONTEXT_SCHEDULE rules emit exactly ONE task (earliest matched stage); scouting rule_ids
//   capped at the top 12 by priority; deterministic final sort.
// 2026-08-24 17:05 UTC — BUG B/C: irrigation expansion de-duplicated to one task per DAS
//   (narrowest overlapping window wins; interval<=0 → "irrigation_interval_invalid";
//   overlaps reported once as "irrigation_windows_overlapping"), and stage_applicable tokens
//   now match namespaced stage_codes via stageMatchesToken (suffix / exact / growth_stage).
// 2026-08-23 07:20 UTC — Phase 2 taxonomy: emitted task_type values are canonical
//   ("sowing"/"nutrition"), field-action rule categories are canonicalised through the
//   DB table task_type_map (loaded once per generation, unmapped → "advisory" + gap
//   "task_type_unmapped"), and fertilizer splits without a nutrient are skipped with the
//   "fertilizer_split_nutrient_missing" gap instead of defaulting to NPK.
// 2026-08-23 06:20 UTC — FIX 1/2/3: field-action rules restricted to trigger_class=CONTEXT_SCHEDULE
//   (OBSERVATION rules are conditional, never dated tasks) + one weekly "Field scouting" task per
//   stage carrying OBSERVATION rules; costing keyed on a new structured `nutrient` field
//   (N→UREA, P→SSP, K→MOP) instead of task_name, compound splits reported as a gap;
//   sowing/planting task emitted unconditionally whenever stages exist.

// 2026-08-18 18:20 UTC — Phase A: every task now carries stage_uuid (crop_stage_master.id) alongside
//   stage_key; unresolvable stage labels stay null and add the "task_stage_unmappable" gap.
// 2026-08-18 15:45 UTC — hardened the fertilizer split loop: malformed splits skipped with a named gap,
//   dasFromSplit guarded, and splits with a non-computable dose are recorded instead of emitting null-dose tasks.
// 2026-08-17 14:02 UTC — Phase 2: created day-0 baseline generator. Builds the whole schedule
//   from database rows only. Any missing source is reported as a coverage gap — never invented.
// 2026-08-18 15:25 UTC — 546 fix: guarded the irrigation expansion loop (interval must be >=1,
//   valid DAS range, max 200 events per guideline row) — a 0-interval DB row looped forever
//   and exhausted the edge worker memory.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import type { ResolvedInputs } from "../db/resolve-inputs.ts";
import { validateBaseline } from "./validate-schedule.ts";
import {
  getStages,
  getSeedRate,
  getFertilizerPlan,
  getIrrigationGuidelines,
  getFieldActionRules,
  getObservationRules,
  getVarietyDuration,
  getBannedChemicals,
  getLaborRate,
  type Provenance,
  type StageRow,
} from "../db/agronomy-repo.ts";

export const GENERATOR_VERSION = "baseline-db-ssot@1.5.1";

/** Canonical task_type vocabulary — mirrors schedule_tasks_task_type_check. */
const CANONICAL_TASK_TYPES = new Set([
  "land_preparation", "seed_treatment", "nursery", "sowing", "gap_filling",
  "nutrition", "micronutrient", "irrigation", "weed_management", "intercultural",
  "pest_management", "disease_management", "growth_regulation", "monitoring",
  "harvest", "post_harvest", "residue_management", "planning", "advisory",
]);

/** Loads public.task_type_map once per generation. DB is the only taxonomy author. */
async function loadTaskTypeMap(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await supabase.from("task_type_map").select("raw_value, canonical").limit(2000);
  const map = new Map<string, string>();
  for (const r of (data || []) as Array<{ raw_value: string; canonical: string }>) {
    map.set(String(r.raw_value), String(r.canonical));
    map.set(String(r.raw_value).toLowerCase(), String(r.canonical));
  }
  return map;
}

function canonicaliseTaskType(
  map: Map<string, string>,
  ...candidates: Array<string | null | undefined>
): { taskType: string; unmapped: boolean } {
  for (const c of candidates) {
    const raw = (c ?? "").trim();
    if (!raw) continue;
    const hit = map.get(raw) ?? map.get(raw.toLowerCase());
    if (hit && CANONICAL_TASK_TYPES.has(hit)) return { taskType: hit, unmapped: false };
    if (CANONICAL_TASK_TYPES.has(raw.toLowerCase())) return { taskType: raw.toLowerCase(), unmapped: false };
  }
  return { taskType: "advisory", unmapped: true };
}

export interface BaselineTask {
  task_name: string;
  task_type: string;
  task_description: string;
  days_from_sowing: number;
  anchor_type: "DAS" | "DAT" | "STAGE" | "GDD";
  anchor_stage: string | null;
  gdd_target: number | null;
  stage_key: string | null;
  stage_uuid: string | null;
  stage_name: string | null;
  stage_order: number;
  priority: string;
  weather_dependent: boolean;
  nutrient: string | null;
  quantity: { value: number; unit: string } | null;
  estimated_cost: number | null;
  rule_ids: string[];
  confidence: number | null;
  source_refs: Provenance[];
  instructions: string[];
  precautions: string[];
  /** Provenance / audit lines (ETL, dose, PHI, source, derivations). Never farmer text. */
  technical_details?: string[];
  resources?: Record<string, unknown>;

  /**
   * A repeating instruction (irrigation every N days inside a stage window, weekly
   * scouting). ONE task carries the recurrence; the calendar is never expanded into
   * one clone per occurrence — the daily reconciler decides the real events from
   * weather / soil state.
   */
  recurrence?: {
    interval_days: number;
    window_start: number;
    window_end: number;
    expected_events: number;
  } | null;
}

/** Task names are labels, never prose. Long DB action_text belongs in the description. */
const MAX_TASK_NAME = 60;
function shortName(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const raw = String(c ?? "").trim().replace(/\s+/g, " ");
    if (!raw) continue;
    if (raw.length <= MAX_TASK_NAME) return raw;
    // Cut at the first sentence/clause boundary that fits, else hard-truncate.
    const cut = raw.slice(0, MAX_TASK_NAME);
    const boundary = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(": "), cut.lastIndexOf(" — "), cut.lastIndexOf(", "));
    return (boundary > 20 ? cut.slice(0, boundary) : cut.trimEnd()) + "…";
  }
  return "";
}

/** Human label for a stage row ("tillering" → "tillering"), DB values only. */
const stageLabel = (s: { growth_stage?: string | null; stage_code?: string | null } | null): string =>
  String(s?.growth_stage ?? s?.stage_code ?? "").replace(/_/g, " ").trim();


export interface BaselineResult {
  tasks: BaselineTask[];
  validation?: { violations: string[]; warnings: string[] };
  gaps: string[];
  coverage: Record<string, boolean>;
  totals: {
    seed_kg: number | null;
    n_kg: number | null;
    p_kg: number | null;
    k_kg: number | null;
    water_mm: number | null;
    duration_days: number | null;
    estimated_cost: number | null;
  };
  provenance: Provenance[];
  generator_version: string;
}

const priorityFromRule = (p: number | null): string =>
  p == null ? "medium" : p >= 90 ? "critical" : p >= 70 ? "high" : p >= 40 ? "medium" : "low";

function stageOrderOf(stages: StageRow[], stageCode: string | null): number {
  if (!stageCode) return 0;
  const idx = stages.findIndex(
    (s) => (s.stage_code || s.growth_stage || "").toLowerCase() === stageCode.toLowerCase(),
  );
  return idx >= 0 ? idx + 1 : 0;
}

/**
 * Transplant clock. Stages tagged clock_reference='transplanting' count days AFTER
 * transplanting, but the whole schedule is dated days-after-sowing. The offset is the
 * nursery duration: the measured sowing→transplant gap when both dates are known,
 * otherwise the largest das_max among the crop's nursery / transplanting stages.
 * Never invented — when neither source exists the caller reports a gap and skips.
 */
export function computeTransplantOffset(
  stages: StageRow[],
  sowingDate: string | null,
  transplantDate: string | null,
): number | null {
  if (sowingDate && transplantDate) {
    const d = Math.round(
      (new Date(transplantDate).getTime() - new Date(sowingDate).getTime()) / 86400000,
    );
    if (Number.isFinite(d) && d >= 0) return d;
  }
  let best: number | null = null;
  for (const s of stages) {
    const code = String(s.stage_code ?? "").toUpperCase();
    const growth = String(s.growth_stage ?? "").toUpperCase();
    const isNursery =
      code.endsWith("_NURSERY") || code.endsWith("_TRANSPLANTING") ||
      growth === "NURSERY" || growth === "TRANSPLANTING";
    if (isNursery && s.das_max != null && Number.isFinite(Number(s.das_max))) {
      const v = Number(s.das_max);
      if (best == null || v > best) best = v;
    }
  }
  return best;
}

const isTransplantClock = (stage: StageRow): boolean =>
  String(stage.clock_reference ?? "sowing").toLowerCase() === "transplanting";

/** Convert a stage-relative day onto the days-after-sowing axis. */
export function toDas(stage: StageRow, d: number | null, transplantOffset: number | null): number | null {
  if (d == null || !Number.isFinite(Number(d))) return null;
  if (!isTransplantClock(stage)) return Number(d);
  if (transplantOffset == null) return null;
  return Number(d) + transplantOffset;
}

function stageForDas(stages: StageRow[], das: number, transplantOffset: number | null): StageRow | null {
  return (
    stages.find((s) => {
      const min = toDas(s, s.das_min, transplantOffset);
      const max = toDas(s, s.das_max, transplantOffset);
      return min != null && max != null && das >= min && das <= max;
    }) || null
  );
}

/**
 * Stage tokens on decision_rules.stage_applicable are short labels ("booting"), while
 * crop_stage_master.stage_code is namespaced ("RICE_TP_BOOTING"). Match on suffix,
 * exact code, or growth_stage — all case-insensitive.
 */
function stageMatchesToken(stage: StageRow, token: string): boolean {
  const t = String(token ?? "").trim().toLowerCase();
  if (!t) return false;
  const code = (stage.stage_code || "").toLowerCase();
  const growth = (stage.growth_stage || "").toLowerCase();
  return code === t || growth === t || (!!code && code.endsWith(`_${t}`));
}

/** Read a DAS anchor out of a DB split-schedule entry without assuming any agronomy. */
function dasFromSplit(
  split: Record<string, unknown>,
  stages: StageRow[],
  transplantOffset: number | null,
): { das: number | null; stage: StageRow | null } {
  if (!split || typeof split !== "object") return { das: null, stage: null };
  const dasKeys = ["das", "day", "days", "days_after_sowing", "dap", "das_start"];
  for (const k of dasKeys) {
    const v = split[k];
    if (v != null && !isNaN(Number(v))) {
      const das = Number(v);
      return { das, stage: stageForDas(stages, das, transplantOffset) };
    }
  }
  const stageKeys = ["stage", "stage_code", "growth_stage", "timing"];
  for (const k of stageKeys) {
    const v = split[k];
    if (typeof v === "string") {
      const stage = stages.find(
        (s) =>
          (s.stage_code || "").toLowerCase() === v.toLowerCase() ||
          (s.growth_stage || "").toLowerCase() === v.toLowerCase(),
      );
      if (stage) return { das: toDas(stage, stage.das_min, transplantOffset), stage };
    }
  }
  return { das: null, stage: null };
}

export async function generateBaseline(
  supabase: SupabaseClient,
  inputs: ResolvedInputs,
): Promise<BaselineResult> {
  const gaps: string[] = [...inputs.gaps];
  const coverage: Record<string, boolean> = {};
  const provenance: Provenance[] = [];
  const tasks: BaselineTask[] = [];

  if (!inputs.cropCode) {
    return {
      tasks: [],
      gaps: [...gaps, "cannot_generate_without_crop_code"],
      coverage: { stages: false, seed: false, fertilizer: false, irrigation: false, field_actions: false },
      totals: { seed_kg: null, n_kg: null, p_kg: null, k_kg: null, water_mm: null, duration_days: null, estimated_cost: null },
      provenance,
      generator_version: GENERATOR_VERSION,
    };
  }

  const areaAcres = inputs.landAreaAcres;
  const areaHa = inputs.landAreaHa;

  // ── Stages (phenology spine) ───────────────────────────────────────────────
  // P0-A: clock stages by the DB-resolved canonical method (declared-hierarchy walk).
  // Falls back to the farmer's method string only when resolution itself was skipped;
  // an unresolvable clock still hard-fails to zero stage rows — no phenology mixing.
  const stages = await getStages(
    supabase,
    inputs.cropCode,
    inputs.cropCycle,
    inputs.stageClockMethod ?? inputs.cultivationMethod,
  );
  coverage.stages = stages.length > 0;
  if (!stages.length) {
    gaps.push(inputs.cultivationMethod ? "crop_stage_master_no_rows_for_method" : "crop_stage_master_no_rows");
  }

  // Transplant clock: stages tagged clock_reference='transplanting' are days-after-transplant.
  const transplantOffset = computeTransplantOffset(stages, inputs.sowingDate, inputs.transplantDate);
  const needsTransplantOffset = stages.some((s) => isTransplantClock(s));
  if (needsTransplantOffset && transplantOffset == null) gaps.push("transplant_offset_unresolved");
  /** Days-after-sowing for a stage boundary, or null when it cannot be placed. */
  const das0 = (s: StageRow, d: number | null) => toDas(s, d, transplantOffset);

  const graphDurationDays =
    stages.reduce((max, s) => Math.max(max, das0(s, s.das_max) ?? 0), 0) || null;

  // Applicability context reused by every rule/guideline lookup below: the farmer's
  // method plus the declared stage-clock method (both DB-resolved, never guessed).
  const applicMethods = [
    ...new Set([inputs.cultivationMethod, inputs.stageClockMethod].filter(Boolean)),
  ] as string[];

  // Schedule duration: the variety's own stated maturity window (VCA, per method) beats
  // the generic stage-graph span — a 115–125 d basmati must not inherit rice's 190 d
  // graph tail as its harvest date. The overrun is recorded, never silently dropped.
  const varietyDuration = await getVarietyDuration(supabase, inputs.varietyId, applicMethods);
  let durationDays = graphDurationDays;
  if (varietyDuration && varietyDuration.maxDays != null) {
    durationDays = varietyDuration.maxDays;
    provenance.push(varietyDuration.provenance);
    if (graphDurationDays != null && graphDurationDays > varietyDuration.maxDays) {
      gaps.push("stage_graph_exceeds_variety_duration");
    }
  }

  // ── Seed / planting task ───────────────────────────────────────────────────
  // The day-0 anchor operation is always emitted when a phenology spine exists.
  // A missing seed rate degrades the quantity to null (with a named gap) — it never
  // removes the operation itself.
  const seed = await getSeedRate(supabase, inputs.varietyId, inputs.cultivationMethod, inputs.stageClockMethod);
  coverage.seed = !!seed;
  let seedKg: number | null = null;
  if (!seed) {
    gaps.push("seed_rate_unavailable");
  } else {
    provenance.push(seed.provenance);
    if (areaAcres == null) {
      gaps.push("seed_quantity_not_computed_missing_area");
    } else {
      seedKg = Number((seed.kgPerAcre * areaAcres).toFixed(2));
    }
  }

  if (stages.length) {
    const sowStage = stages.find((s) => (das0(s, s.das_min) ?? 0) <= 0) || stages[0] || null;
    // 2026-09-03: seed.rationale is a DERIVATION string ("150 plants/m2 x 18.0 g TGW,
    // corrected for 90% germination, 98% purity …") — audit evidence, not farmer text.
    // The farmer line is built from the same DB numbers in plain words.
    const sowTechnical: string[] = [];
    if (seed?.rationale) sowTechnical.push(`Derivation: ${seed.rationale}`);
    const sowDescription = seedKg != null && areaAcres != null
      ? `Sow the crop. Use ${seedKg} kg of seed for ${areaAcres} acre.`
      : "";
    const sowInstructions: string[] = [];
    if (!sowDescription) {
      if (sowStage?.growth_stage) sowInstructions.push(`Stage: ${sowStage.growth_stage}`);
      if (!sowInstructions.length) gaps.push("sowing_task_no_detail");
    }

    const sowProvenance: Provenance[] = seed
      ? [seed.provenance]
      : sowStage
        ? [{ table: "crop_stage_master", row_id: sowStage.id }]
        : [];
    tasks.push({
      task_name: "Sowing / planting",
      task_type: "sowing",
      task_description: sowDescription,
      days_from_sowing: 0,
      anchor_type: "DAS",
      anchor_stage: sowStage?.stage_code || sowStage?.growth_stage || null,
      gdd_target: sowStage?.gdd_min ?? null,
      stage_key: sowStage?.stage_code || null,
      stage_uuid: sowStage?.id || null,
      stage_name: sowStage?.growth_stage || null,
      stage_order: 1,
      priority: "critical",
      weather_dependent: true,
      nutrient: null,
      quantity: seedKg != null ? { value: seedKg, unit: "kg" } : null,
      estimated_cost: null,
      rule_ids: [],
      confidence: seed ? 0.9 : null,
      source_refs: sowProvenance,
      instructions: sowInstructions,
      precautions: [],
      technical_details: sowTechnical,
    });

  }


  // ── Fertilizer split tasks ─────────────────────────────────────────────────
  const fert = await getFertilizerPlan(supabase, inputs.cropCode, inputs.regionCode, inputs.soilFertilityClass);
  coverage.fertilizer = !!fert && fert.splits.length > 0;
  let nKg: number | null = null, pKg: number | null = null, kKg: number | null = null;
  if (!fert) {
    gaps.push("fertilizer_recommendation_master_no_row");
  } else {
    provenance.push(fert.provenance);
    if (areaHa == null) {
      gaps.push("fertilizer_quantity_not_computed_missing_area");
    } else {
      nKg = fert.n_kg_ha != null ? Number((fert.n_kg_ha * areaHa).toFixed(2)) : null;
      pKg = fert.p2o5_kg_ha != null ? Number((fert.p2o5_kg_ha * areaHa).toFixed(2)) : null;
      kKg = fert.k2o_kg_ha != null ? Number((fert.k2o_kg_ha * areaHa).toFixed(2)) : null;
    }
    if (fert.gaps?.length) gaps.push(...fert.gaps);
    if (!fert.splits.length) gaps.push("fertilizer_split_schedule_missing");

    for (const split of fert.splits) {
      if (!split || typeof split !== "object" || Array.isArray(split)) {
        gaps.push("fertilizer_split_malformed");
        continue;
      }
      let das: number | null = null;
      let stage: StageRow | null = null;
      try {
        ({ das, stage } = dasFromSplit(split, stages, transplantOffset));
      } catch {
        gaps.push("fertilizer_split_malformed");
        continue;
      }
      if (das == null) {
        gaps.push("fertilizer_split_without_timing_skipped");
        continue;
      }
      // Strict split semantics — agronomic quantities never come from a heuristic.
      // percent/pct in (0,100] ⇒ /100; fraction in (0,1] used as-is; anything else
      // (a bare 'share', an out-of-range number) is ambiguous ⇒ null + named gap.
      let fraction: number | null = null;
      const pctRaw = split.percent ?? split.pct;
      const fracRaw = split.fraction;
      if (pctRaw != null && !isNaN(Number(pctRaw)) && Number(pctRaw) > 0 && Number(pctRaw) <= 100) {
        fraction = Number(pctRaw) / 100;
      } else if (fracRaw != null && !isNaN(Number(fracRaw)) && Number(fracRaw) > 0 && Number(fracRaw) <= 1) {
        fraction = Number(fracRaw);
      } else if (pctRaw != null || fracRaw != null || split.share != null) {
        gaps.push("fertilizer_split_semantics_ambiguous");
      }
      const nutrientSource = split.nutrient ?? split.name ?? null;
      if (nutrientSource == null || String(nutrientSource).trim() === "") {
        // No nutrient named by the DB row — never assume a compound blend.
        gaps.push("fertilizer_split_nutrient_missing");
        continue;
      }
      const nutrientRaw = String(nutrientSource).trim().toUpperCase();
      // Exact nutrient semantics — no prefix guessing, no compound approximation.
      const nutrient =
        nutrientRaw === "N"
          ? "N"
          : nutrientRaw === "P" || nutrientRaw === "P2O5"
            ? "P"
            : nutrientRaw === "K" || nutrientRaw === "K2O"
              ? "K"
              : nutrientRaw;
      const qtyBase = nutrient === "N" ? nKg : nutrient === "P" ? pKg : nutrient === "K" ? kKg : null;
      if (qtyBase == null) {
        // A compound/unknown nutrient split cannot be resolved to a single dose.
        gaps.push(
          nutrient === "N" || nutrient === "P" || nutrient === "K"
            ? "fertilizer_split_dose_not_computable"
            : "fertilizer_split_compound_dose_ambiguous",
        );
        continue;
      }
      const qty = fraction != null ? Number((qtyBase * fraction).toFixed(2)) : null;
      if (qty == null) {
        // Never emit a task with an unknown dose — record the gap and move on.
        gaps.push("fertilizer_split_dose_not_computable");
        continue;
      }

      // 2026-09-03: the card used to read "Fertilizer application (N)" with an EMPTY
      // description. Nutrient letters are spelled out and the farmer line is composed
      // from the SAME DB numbers already computed above (no new agronomy).
      const nutrientLabel = nutrient === "N" ? "Nitrogen" : nutrient === "P" ? "Phosphorus" : nutrient === "K" ? "Potassium" : nutrient;
      const splitNote = String(split.note ?? split.description ?? "").trim();
      tasks.push({
        task_name: `Apply ${nutrientLabel} fertilizer`,
        task_type: "nutrition",
        task_description: splitNote || `Apply ${qty} kg of ${nutrientLabel} to this field.`,

        days_from_sowing: das,
        anchor_type: stage ? "STAGE" : "DAS",
        anchor_stage: stage?.stage_code || stage?.growth_stage || null,
        gdd_target: stage?.gdd_min ?? null,
        stage_key: stage?.stage_code || null,
        stage_uuid: stage?.id || null,
        stage_name: stage?.growth_stage || null,
        stage_order: stageOrderOf(stages, stage?.stage_code || null),
        priority: "high",
        weather_dependent: true,
        nutrient,
        quantity: { value: qty, unit: "kg" },
        estimated_cost: null,

        rule_ids: [],
        confidence: fert.provenance.confidence ?? null,
        source_refs: [fert.provenance],
        instructions: [],
        precautions: [],
        resources: { requirement_semantics: "BASELINE" },
      });
    }
  }

  // ── Irrigation plan (ONE recurring task per stage window) ──────────────────
  // v1.5.0: a guideline row is a RULE ("every 3 days through tillering, 60 mm for the
  // stage"), not a calendar. Expanding it into one dated task per interval produced the
  // "same task every day" defect (rice germination interval=1 → 10 identical daily rows)
  // and stamped the whole-stage water total on every one of them. The baseline now emits
  // one recurring task per window; the nightly reconciler turns it into real events from
  // weather / soil water state.
  const irrigation = await getIrrigationGuidelines(supabase, inputs.cropCode, inputs.varietyId, stages.map((s) => s.id));
  coverage.irrigation = irrigation.length > 0;
  if (!irrigation.length) gaps.push("crop_baseline_guidelines_v2_no_irrigation_rows");
  let waterMm = 0;
  /** One irrigation task per window start; overlapping rows keep the narrowest window. */
  const irrigationByStart = new Map<number, { task: BaselineTask; width: number }>();
  let irrigationOverlap = false;
  for (const g of irrigation) {
    if (g.waterMm != null) waterMm += g.waterMm;
    if (g.dasStart == null || g.dasEnd == null) continue;
    if (!Number.isFinite(g.dasStart) || !Number.isFinite(g.dasEnd) || g.dasEnd < g.dasStart) {
      gaps.push("irrigation_das_range_invalid_row_skipped");
      continue;
    }
    const rawStep = g.intervalDays == null ? null : Number(g.intervalDays);
    const step = rawStep != null && Number.isFinite(rawStep) ? rawStep : null;
    if (step == null) continue;
    provenance.push(g.provenance);

    const stage = stages.find(
      (s) => (s.growth_stage || "").toLowerCase() === String(g.growthStage ?? "").toLowerCase(),
    ) || stageForDas(stages, g.dasStart, transplantOffset);
    const label = stageLabel(stage) || String(g.growthStage ?? "").replace(/_/g, " ");
    const width = g.dasEnd - g.dasStart;

    const irrigationInstructions: string[] = [];
    // 2026-09-03: machine/provenance detail no longer sits in the farmer instruction
    // list — it is carried as technical_details and shown only under "details".
    const irrigationTechnical: string[] = [];
    if (g.criticalMoisturePercent != null) irrigationTechnical.push(`Critical soil moisture: ${g.criticalMoisturePercent}%`);
    if (g.provenance.source) irrigationTechnical.push(`Source: ${g.provenance.source}`);

    // interval 0 is NOT an invalid row: the DB says "no irrigation in this window"
    // (rice maturity/harvest = drain the field). Emit the withdrawal advisory instead
    // of dropping late-season water management entirely.
    const isWithdrawal = step < 1;
    if (isWithdrawal) {
      irrigationInstructions.unshift("No irrigation in this window — let the field drain.");
    } else {
      irrigationInstructions.unshift(
        `Irrigate about every ${step} day${step === 1 ? "" : "s"} from DAS ${g.dasStart} to ${g.dasEnd}.`,
      );
      if (g.waterMm != null) irrigationInstructions.push(`Total water for this stage: ${g.waterMm} mm`);
    }


    const expectedEvents = isWithdrawal ? 0 : Math.floor(width / step) + 1;
    const task: BaselineTask = {
      task_name: isWithdrawal
        ? shortName(label ? `Stop irrigation — ${label}` : "Stop irrigation")
        : shortName(label ? `Irrigation — ${label}` : "Irrigation"),
      task_type: isWithdrawal ? "advisory" : "irrigation",
      // Generic guideline notes can contain nutrition, nursery, seed-treatment or
      // other stage guidance. They are not an irrigation-specific field and must not
      // be shown under an irrigation action. The farmer sentence is the cadence line
      // built above, so the card is never blank.
      task_description: irrigationInstructions[0] ?? "",

      days_from_sowing: g.dasStart,
      anchor_type: stage ? "STAGE" : "DAS",
      anchor_stage: stage?.stage_code || g.growthStage || null,
      gdd_target: stage?.gdd_min ?? null,
      stage_key: stage?.stage_code || null,
      stage_uuid: stage?.id || null,
      stage_name: stage?.growth_stage || g.growthStage || null,
      stage_order: stageOrderOf(stages, stage?.stage_code || null),
      priority: stage?.is_moisture_critical ? "critical" : "high",
      weather_dependent: true,
      nutrient: null,
      // The DB value is the STAGE total, so it belongs on the stage-level task —
      // never repeated per event.
      quantity: !isWithdrawal && g.waterMm != null ? { value: g.waterMm, unit: "mm" } : null,
      estimated_cost: null,
      rule_ids: [],
      confidence: null,
      source_refs: [g.provenance],
      instructions: [...irrigationInstructions],
      precautions: [],
      recurrence: isWithdrawal
        ? null
        : { interval_days: step, window_start: g.dasStart, window_end: g.dasEnd, expected_events: expectedEvents },
      resources: {
        requirement_semantics: isWithdrawal ? "BASELINE_WITHDRAWAL" : "BASELINE",
        ...(g.notes ? { source_note_unprojected: true } : {}),
      },
    };

    const existing = irrigationByStart.get(g.dasStart);
    if (!existing) {
      irrigationByStart.set(g.dasStart, { task, width });
    } else {
      irrigationOverlap = true;
      if (width < existing.width) irrigationByStart.set(g.dasStart, { task, width });
    }
  }
  if (irrigationOverlap) gaps.push("irrigation_windows_overlapping");
  for (const { task } of irrigationByStart.values()) tasks.push(task);


  // ── Field-action rules (scouting, protection, operations) ──────────────────
  const rules = await getFieldActionRules(supabase, inputs.cropCode, inputs.regionCode, applicMethods);
  const banned = await getBannedChemicals(supabase);
  const taskTypeMap = await loadTaskTypeMap(supabase);
  coverage.field_actions = rules.length > 0;
  if (!rules.length) gaps.push("decision_rules_no_field_actions");

  for (const rule of rules) {
    const chem = String(rule.chemical_class ?? "").toLowerCase();
    if (chem && banned.has(chem)) {
      gaps.push(`rule_skipped_banned_chemical:${rule.rule_id}`);
      continue;
    }
    const stageList: string[] = Array.isArray(rule.stage_applicable)
      ? (rule.stage_applicable as string[])
      : rule.stage_applicable
        ? [String(rule.stage_applicable)]
        : [];
    // ONE task per rule. A rule whose stage token matches several stages (rice matched
    // both the transplanted and the DSR tillering rows) was emitted once per match —
    // the farmer saw N_TOP1 twice and would have applied double nitrogen.
    const matched = stages
      .filter((s) => stageList.some((sa) => stageMatchesToken(s, sa)))
      .map((s) => ({ stage: s, das: das0(s, s.das_min) }))
      .filter((m) => m.das != null)
      .sort((a, b) => (a.das as number) - (b.das as number) ||
        String(a.stage.stage_code ?? "").localeCompare(String(b.stage.stage_code ?? "")));
    if (!matched.length) continue;

    {
      const { stage, das } = matched[0];
      const { taskType, unmapped } = canonicaliseTaskType(taskTypeMap, rule.category, rule.action_type);
      if (unmapped) gaps.push("task_type_unmapped");
      const ruleInstructions: string[] = [];
      if (rule.etl_threshold) ruleInstructions.push(`ETL: ${rule.etl_threshold}`);
      if (rule.dosage_per_acre) ruleInstructions.push(`Dose/acre: ${rule.dosage_per_acre}`);
      if (rule.phi_days != null) ruleInstructions.push(`PHI: ${rule.phi_days} days`);
      if (rule.scientific_source) ruleInstructions.push(`Source: ${rule.scientific_source}`);
      const rulePrecautions: string[] = Array.isArray(rule.contraindications)
        ? (rule.contraindications as unknown[]).map((c) => String(c)).filter(Boolean)
        : [];
      if (!rule.action_text && !ruleInstructions.length && !rulePrecautions.length) {
        gaps.push("rule_task_no_detail");
      }
      // v1.5.0: the name is a LABEL. Previously rule.action_text (a full advisory
      // paragraph) became the task_name, so cards showed prose as a title.
      const ruleLabel = String(rule.category ?? rule.action_type ?? taskType).replace(/_/g, " ").trim();
      const stageTag = stageLabel(stage);
      tasks.push({
        task_name:
          shortName(
            ruleLabel && stageTag ? `${ruleLabel} — ${stageTag}` : ruleLabel || stageTag,
            rule.action_text,
            rule.rule_id,
          ) || rule.rule_id,

        task_type: taskType,
        task_description: rule.action_text || "",
        days_from_sowing: das as number,
        anchor_type: "STAGE",
        anchor_stage: stage.stage_code || stage.growth_stage,
        gdd_target: stage.gdd_min ?? null,
        stage_key: stage.stage_code,
        stage_uuid: stage.id || null,
        stage_name: stage.growth_stage,
        stage_order: stageOrderOf(stages, stage.stage_code),
        priority: priorityFromRule(rule.priority),
        weather_dependent: true,
        nutrient: null,
        quantity: null,
        estimated_cost: null,
        rule_ids: [rule.rule_id],
        confidence: null,
        source_refs: [{ table: "decision_rules", row_id: rule.rule_id, source: rule.scientific_source ?? null }],
        instructions: ruleInstructions,
        precautions: rulePrecautions,
      });
    }
  }

  // ── Recurring scouting (derived from conditional OBSERVATION rules) ────────
  // OBSERVATION rules are conditional knowledge and are never materialised as dated
  // tasks. Instead, a stage that carries at least one active protection OBSERVATION rule
  // gets one weekly field-scouting task inside its DAS window.
  const MAX_SCOUT_RULE_IDS = 12;
  /** Top rule ids by priority, deterministically ordered. */
  const topRuleIds = (refs: Array<{ id: string; p: number | null }>): string[] =>
    [...new Map(refs.map((r) => [r.id, r])).values()]
      .sort((a, b) => (b.p ?? -1) - (a.p ?? -1) || a.id.localeCompare(b.id))
      .slice(0, MAX_SCOUT_RULE_IDS)
      .map((r) => r.id);

  const observationRules = await getObservationRules(supabase, inputs.cropCode, inputs.regionCode, applicMethods);
  coverage.monitoring = false;
  if (observationRules.length) {
    const ruleById = new Map(observationRules.map((r) => [r.rule_id, r]));
    /** Farmer-facing scouting brief built strictly from DB rule fields. */
    const scoutBrief = (ids: string[], matchedCount: number) => {
      const conditions: string[] = [];
      const instructions: string[] = [];
      for (const id of ids) {
        const r = ruleById.get(id);
        if (!r) continue;
        const cc = String(r.condition_code ?? "").trim();
        if (cc) {
          const label = cc.replace(/_/g, " ");
          if (!conditions.includes(label)) conditions.push(label);
          const etl = String(r.etl_threshold ?? "").trim();
          if (etl && instructions.length < 6) instructions.push(`${cc}: ${etl}`);
        }
      }
      return {
        description: conditions.length ? `Inspect for: ${conditions.slice(0, 8).join(", ")}` : "",
        instructions,
        resources: { scouting_targets: matchedCount },
      };
    };
    const byStage = new Map<string, { stage: StageRow; refs: Array<{ id: string; p: number | null }>; priority: number | null }>();
    for (const r of observationRules) {
      const stageList: string[] = Array.isArray(r.stage_applicable)
        ? (r.stage_applicable as string[])
        : r.stage_applicable
          ? [String(r.stage_applicable)]
          : [];
      const matched = stages.filter((s) => stageList.some((sa) => stageMatchesToken(s, sa)));
      for (const stage of matched) {
        const entry = byStage.get(stage.id) || { stage, refs: [], priority: null };
        const p = r.priority != null ? Number(r.priority) : null;
        entry.refs.push({ id: r.rule_id, p });
        if (p != null && (entry.priority == null || p > entry.priority)) entry.priority = p;
        byStage.set(stage.id, entry);
      }
    }
    const WEEK = 7;
    // v1.5.0: ONE recurring scouting task per stage window (was one clone per week —
    // 26 identical "Field scouting" cards on a single rice schedule). Overlapping
    // stage windows merge on the window start, keeping the narrowest window.
    const scoutByStart = new Map<number, { task: BaselineTask; width: number; refs: Array<{ id: string; p: number | null }> }>();
    for (const { stage, refs, priority } of byStage.values()) {
      const start = das0(stage, stage.das_min);
      const end = das0(stage, stage.das_max);
      if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        gaps.push("monitoring_stage_das_range_missing");
        continue;
      }
      const width = end - start;
      const label = stageLabel(stage);
      const task: BaselineTask = {
        task_name: shortName(label ? `Scouting — ${label}` : "Field scouting"),
        task_type: "monitoring",
        task_description: "",
        days_from_sowing: start,
        anchor_type: "STAGE",
        anchor_stage: stage.stage_code || stage.growth_stage,
        gdd_target: stage.gdd_min ?? null,
        stage_key: stage.stage_code,
        stage_uuid: stage.id || null,
        stage_name: stage.growth_stage,
        stage_order: stageOrderOf(stages, stage.stage_code),
        priority: priorityFromRule(priority),
        weather_dependent: false,
        nutrient: null,
        quantity: null,
        estimated_cost: null,
        rule_ids: topRuleIds(refs),
        confidence: null,
        source_refs: [{ table: "decision_rules" }],
        instructions: [`Walk the field once a week from DAS ${start} to ${end}.`],
        precautions: [],
        recurrence: {
          interval_days: WEEK,
          window_start: start,
          window_end: end,
          expected_events: Math.floor(width / WEEK) + 1,
        },
      };
      const existing = scoutByStart.get(start);
      if (!existing) {
        scoutByStart.set(start, { task, width, refs: [...refs] });
      } else {
        const mergedRefs = [...existing.refs, ...refs];
        if (width < existing.width) {
          task.rule_ids = topRuleIds(mergedRefs);
          scoutByStart.set(start, { task, width, refs: mergedRefs });
        } else {
          existing.refs = mergedRefs;
          existing.task.rule_ids = topRuleIds(mergedRefs);
        }
      }
      coverage.monitoring = true;
    }
    for (const entry of scoutByStart.values()) {
      const brief = scoutBrief(entry.task.rule_ids, entry.refs.length);
      entry.task.task_description = brief.description;
      entry.task.instructions = [...entry.task.instructions, ...brief.instructions];
      entry.task.resources = brief.resources;
      if (!brief.description && !brief.instructions.length) gaps.push("scouting_brief_empty");
      tasks.push(entry.task);
    }
  }

  // ── Lifecycle anchor operations (land prep, seed treatment, harvest, post-harvest) ──
  // v1.5.0: the stage graph carries these phases (rice: RICE_HARVEST 140–160,
  // RICE_POST_HARVEST 160–190) but the baseline never emitted an operation for them,
  // so a farmer's plan simply ended after grain filling. One task per lifecycle stage
  // present in the graph — the stage row itself is the only source.
  const LIFECYCLE_STAGES: Array<{ match: RegExp; taskType: string; label: string; priority: string }> = [
    { match: /land[_ ]?prep/i, taskType: "land_preparation", label: "Land preparation", priority: "high" },
    { match: /seed[_ ]?treat/i, taskType: "seed_treatment", label: "Seed treatment", priority: "high" },
    { match: /^nursery$/i, taskType: "nursery", label: "Nursery management", priority: "high" },
    { match: /^harvest$/i, taskType: "harvest", label: "Harvest", priority: "critical" },
    { match: /post[_ ]?harvest/i, taskType: "post_harvest", label: "Post-harvest handling", priority: "medium" },
  ];
  const emittedLifecycle = new Set<string>();
  for (const stage of stages) {
    const key = `${stage.growth_stage ?? ""}|${stage.stage_code ?? ""}`;
    const spec = LIFECYCLE_STAGES.find((l) => l.match.test(String(stage.growth_stage ?? "")) || l.match.test(String(stage.stage_code ?? "")));
    if (!spec || emittedLifecycle.has(spec.taskType)) continue;
    const das = das0(stage, stage.das_min);
    if (das == null || !Number.isFinite(das)) continue;
    // Never plan an operation past the variety's own maturity window.
    if (durationDays != null && das > durationDays + 30) continue;
    emittedLifecycle.add(spec.taskType);
    void key;
    const end = das0(stage, stage.das_max);
    tasks.push({
      task_name: spec.label,
      task_type: spec.taskType,
      task_description: "",
      days_from_sowing: das,
      anchor_type: "STAGE",
      anchor_stage: stage.stage_code || stage.growth_stage,
      gdd_target: stage.gdd_min ?? null,
      stage_key: stage.stage_code,
      stage_uuid: stage.id || null,
      stage_name: stage.growth_stage,
      stage_order: stageOrderOf(stages, stage.stage_code),
      priority: spec.priority,
      weather_dependent: true,
      nutrient: null,
      quantity: null,
      estimated_cost: null,
      rule_ids: [],
      confidence: null,
      source_refs: [{ table: "crop_stage_master", row_id: stage.id }],
      instructions:
        end != null && Number.isFinite(end)
          ? [`Window: DAS ${das} to ${end} (${stageLabel(stage)}).`]
          : [],
      precautions: [],
    });
  }





  // ── Costing (only from priced DB rows) ─────────────────────────────────────
  const labor = await getLaborRate(supabase, inputs.state, null);
  coverage.labor_rate = !!labor;
  if (!labor) gaps.push("labor_rates_no_row");
  const estimatedCost: number | null = null;
  // Nutrient→product mapping is NOT an application decision (N→UREA etc. was a hardcoded
  // agronomic assumption). Cost is computed only when the DB explicitly supplies the input
  // product identity for the recommendation; no such authoritative mapping exists in the
  // live data yet (input_prices is also empty), so cost stays null with an explicit gap.
  if (tasks.some((t) => t.quantity && t.task_type === "nutrition")) {
    gaps.push("input_price_not_authoritatively_mappable");
  }

  // Total order — two identical runs must produce byte-identical task lists.
  tasks.sort(
    (a, b) =>
      a.days_from_sowing - b.days_from_sowing ||
      a.stage_order - b.stage_order ||
      a.task_type.localeCompare(b.task_type) ||
      a.task_name.localeCompare(b.task_name),
  );

  // A task labelled with a stage that could not be resolved to a crop_stage_master
  // row is reported as a gap — the stage link is left null, never invented.
  if (tasks.some((t) => t.stage_key && !t.stage_uuid)) gaps.push("task_stage_unmappable");

  const validation = validateBaseline(
    tasks,
    // das_max must be normalised onto the SOWING axis (same axis as task
    // days_from_sowing) — raw das_max on transplant-clocked stages is on the
    // transplanting axis and would falsely trip the bounds check.
    stages.map((s) => ({ id: s.id, das_max: das0(s, s.das_max) })),
    varietyDuration?.maxDays ?? null,
  );

  return {
    tasks,
    validation,
    gaps: [...new Set(gaps)],
    coverage,
    totals: {
      seed_kg: seedKg,
      n_kg: nKg,
      p_kg: pKg,
      k_kg: kKg,
      water_mm: waterMm > 0 ? waterMm : null,
      duration_days: durationDays,
      estimated_cost: estimatedCost,
    },
    provenance,
    generator_version: GENERATOR_VERSION,
  };
}
