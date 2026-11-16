// 2026-11-13 — VARIETY PROFILE: the one place that gathers what the database knows about the
// SELECTED crop + variety + method, so the planner prompt, the farmer-language composer and the
// narration sweeper all work from the same dossier instead of a bare variety name.
//
// Contract (do not weaken):
//   * Everything here is read from the database. No crop, variety, disease or number is typed in
//     this file, so it is crop- and language-agnostic.
//   * Evidence tier is carried, never upgraded. A maturity window whose tier is unverified is
//     reported with verified=false and is shown to the PLANNER only (to judge relevance); it is never
//     handed to the composer, which cannot add a number the deterministic task does not already hold.
//   * The profile adds context. It never adds, removes or reschedules a task.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { isUnverifiedTier } from "../generator/agronomy-scientific-contract.ts";

export const VARIETY_PROFILE_SCHEMA = "variety_profile_v1" as const;

export interface CatalogueRow {
  variety_id: string | null; name: string | null; variety_code: string | null; season: string | null;
  maturity_days_min: number | null; maturity_days_max: number | null; released_by: string | null;
}
export interface AgronomyRow {
  cultivation_method: string | null; is_suitable: boolean | null; suitability_grade: string | null; suitability_note: string | null;
  duration_days_min: number | null; duration_days_max: number | null; duration_reference: string | null; evidence_tier: string | null;
  seedling_age_days_min: number | null; seedling_age_days_max: number | null; source: string | null;
}
export interface ResistanceRow {
  threat_type: string | null; threat_name: string | null; observation_code: string | null; canonical_observation_code?: string | null;
  resistance_level: string | null; hypothesis_id: string | null; score_modifier: number | null; source: string | null;
}
export interface HypothesisRuleRow { hypothesis_id: string; rule_id: string; priority?: number | null }
export interface StageTimelineEntry { order: number; stage_key: string | null; stage_name: string | null; das_from: number | null; das_to: number | null }

export interface VarietyProfileInput {
  crop: { code: string | null; label: string | null; labelLocal: string | null };
  variety: { id: string | null; name: string | null; nameLocal: string | null } | null;
  method: { cultivation: string | null; stageClock: string | null; cropCycle: string | null };
  catalogue: CatalogueRow | null;
  agronomy: AgronomyRow[];
  resistance: ResistanceRow[];
  hypothesisRules: HypothesisRuleRow[];
  stages: StageTimelineEntry[];
  scheduleDurationDays: number | null;
}

export interface ResistanceEntry {
  threat: string | null; kind: string | null; level: string | null; observation_code: string | null;
  hypothesis_id: string | null; score_modifier: number | null; source: string | null; rule_ids: string[];
}
export interface VarietyProfile {
  schema: typeof VARIETY_PROFILE_SCHEMA;
  crop: { code: string | null; label: string | null; label_local: string | null };
  variety: { id: string | null; name: string | null; name_local: string | null; code: string | null; season: string | null; released_by: string | null } | null;
  method: { cultivation: string | null; stage_clock: string | null; crop_cycle: string | null };
  maturity: {
    /** Days of the selected-method row, on `clock` (e.g. days after transplanting). */
    days_min: number | null; days_max: number | null; clock: string | null;
    source: "variety_cultivation_agronomy" | "variety_catalogue" | null;
    evidence_tier: string | null; verified: boolean;
    /** Sowing-to-maturity window: copied for a sowing clock, or derived (days + seedling age) for a transplanting clock. */
    total_from_sowing: { min: number; max: number; derived: boolean } | null;
    /** The catalogue's own total-duration statement, kept separate because it carries no evidence tier. */
    catalogue_total_days: { min: number | null; max: number | null } | null;
    /** What the generated schedule actually uses as its duration (null when withheld as unverified). */
    schedule_duration_days: number | null;
  };
  method_suitability: { suitable: boolean | null; grade: string | null; note: string | null } | null;
  resistance: ResistanceEntry[];
  stages: StageTimelineEntry[];
  data_limits: string[];
}

const norm = (v: unknown): string => String(v ?? "").trim().toLowerCase();
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function buildVarietyProfile(i: VarietyProfileInput): VarietyProfile {
  const limits: string[] = [];
  const methods = [...new Set([i.method.cultivation, i.method.stageClock].map(norm).filter(Boolean))];
  const row = methods.map((m) => i.agronomy.find((a) => norm(a.cultivation_method) === m)).find(Boolean) ?? null;

  const rowMin = num(row?.duration_days_min), rowMax = num(row?.duration_days_max);
  const verified = !!row && !isUnverifiedTier(row.evidence_tier) && rowMax != null;
  if (i.variety && !row) limits.push("variety_method_record_missing");
  if (row && rowMax == null) limits.push("maturity_unavailable");
  if (row && rowMax != null && !verified) limits.push(`maturity_evidence_unverified:${norm(row.evidence_tier) || "no_tier"}`);
  if (row?.is_suitable === false) limits.push("selected_method_marked_unsuitable_for_variety");

  const clock = row?.duration_reference ? norm(row.duration_reference) : null;
  let total: VarietyProfile["maturity"]["total_from_sowing"] = null;
  if (row && rowMax != null) {
    const lo = rowMin ?? rowMax;
    if (clock === "transplanting") {
      const sMin = num(row.seedling_age_days_min), sMax = num(row.seedling_age_days_max);
      if (sMin != null && sMax != null) total = { min: lo + sMin, max: rowMax + sMax, derived: true };
    } else if (clock === "sowing" || clock === "nursery_sowing" || clock === "direct_sowing") {
      total = { min: lo, max: rowMax, derived: false };
    }
  }
  const cMin = num(i.catalogue?.maturity_days_min), cMax = num(i.catalogue?.maturity_days_max);
  const catalogueTotal = cMin != null || cMax != null ? { min: cMin, max: cMax } : null;

  const rulesByHypothesis = new Map<string, string[]>();
  for (const h of i.hypothesisRules) {
    if (!h.hypothesis_id || !h.rule_id) continue;
    (rulesByHypothesis.get(h.hypothesis_id) ?? rulesByHypothesis.set(h.hypothesis_id, []).get(h.hypothesis_id)!).push(h.rule_id);
  }
  const resistance: ResistanceEntry[] = i.resistance.map((r) => ({
    threat: r.threat_name ?? null, kind: r.threat_type ?? null, level: r.resistance_level ?? null,
    observation_code: r.canonical_observation_code ?? r.observation_code ?? null,
    hypothesis_id: r.hypothesis_id ?? null, score_modifier: num(r.score_modifier), source: r.source ?? null,
    rule_ids: r.hypothesis_id ? [...new Set(rulesByHypothesis.get(r.hypothesis_id) ?? [])] : [],
  }));
  if (i.variety && !resistance.length) limits.push("no_resistance_records");
  for (const r of resistance) if (!r.hypothesis_id) limits.push(`resistance_not_linked_to_rules:${r.observation_code ?? r.threat ?? "unknown"}`);
  if (!i.stages.length) limits.push("stage_timeline_unavailable");
  if (!i.variety) limits.push("variety_not_resolved");

  return {
    schema: VARIETY_PROFILE_SCHEMA,
    crop: { code: i.crop.code, label: i.crop.label, label_local: i.crop.labelLocal },
    variety: i.variety ? {
      id: i.variety.id, name: i.variety.name, name_local: i.variety.nameLocal,
      code: i.catalogue?.variety_code ?? null, season: i.catalogue?.season ?? null, released_by: i.catalogue?.released_by ?? null,
    } : null,
    method: { cultivation: i.method.cultivation, stage_clock: i.method.stageClock, crop_cycle: i.method.cropCycle },
    maturity: {
      days_min: rowMin, days_max: rowMax, clock, source: row && rowMax != null ? "variety_cultivation_agronomy" : catalogueTotal ? "variety_catalogue" : null,
      evidence_tier: row?.evidence_tier ?? null, verified, total_from_sowing: total, catalogue_total_days: catalogueTotal,
      schedule_duration_days: i.scheduleDurationDays,
    },
    method_suitability: row ? { suitable: row.is_suitable, grade: row.suitability_grade, note: row.suitability_note } : null,
    resistance, stages: i.stages, data_limits: [...new Set(limits)],
  };
}

/** Planner dossier: everything, with evidence flags, so it can judge relevance. Context only. */
export function plannerVarietyView(p: VarietyProfile): Record<string, unknown> {
  return {
    crop: p.crop.label ?? p.crop.code, variety: p.variety?.name ?? null, variety_released_by: p.variety?.released_by ?? null, season: p.variety?.season ?? null,
    cultivation_method: p.method.cultivation, stage_clock_method: p.method.stage_clock, crop_cycle: p.method.crop_cycle,
    maturity: p.maturity, method_suitability: p.method_suitability,
    resistance: p.resistance.map((r) => ({ threat: r.threat, kind: r.kind, level: r.level, source_cited: !!r.source, linked_rule_ids: r.rule_ids.slice(0, 12) })),
    stage_timeline: p.stages.map((s) => ({ stage: s.stage_name ?? s.stage_key, das_from: s.das_from, das_to: s.das_to })),
    data_limits: p.data_limits,
  };
}

/** Composer dossier: names and qualitative facts only. It never carries a number the task lacks. */
export function composerVarietyView(p: VarietyProfile): Record<string, unknown> {
  return {
    crop: p.crop.label ?? p.crop.code, crop_local_name: p.crop.label_local, variety: p.variety?.name ?? null, variety_local_name: p.variety?.name_local ?? null,
    cultivation_method: p.method.cultivation,
    resistance: p.resistance.filter((r) => r.threat && r.level).map((r) => ({ threat: r.threat, level: r.level })),
    stages: p.stages.map((s) => s.stage_name ?? s.stage_key).filter(Boolean),
  };
}

/** One short context block both text prompts use; empty when there is no profile. */
export function varietyContextBlock(view: Record<string, unknown> | null | undefined): string {
  if (!view) return "";
  return [
    `CROP CONTEXT (the farmer selected this crop and variety; every task is for it):`,
    JSON.stringify(view),
    `Write each task for THIS crop and variety at THIS growth stage. Name the crop or the stage where it makes the instruction clearer. Do not describe other crops, other varieties or the crop in general.`,
    `The context above is background only: never copy a number, product or treatment from it into a task unless that exact value is in the task's own supplied facts.`,
  ].join("\n");
}

/** Read the database rows and build the profile. Never throws: a failed read returns a profile that says so. */
export async function loadVarietyProfile(
  supabase: SupabaseClient,
  inputs: {
    cropCode: string | null; cropLabel: string | null; cropLabelLocal: string | null; varietyId: string | null; varietyName: string | null; varietyNameLocal: string | null;
    cultivationMethod: string | null; stageClockMethod: string | null; cropCycle: string | null;
  },
  stages: StageTimelineEntry[],
  scheduleDurationDays: number | null,
): Promise<VarietyProfile> {
  const base: VarietyProfileInput = {
    crop: { code: inputs.cropCode, label: inputs.cropLabel, labelLocal: inputs.cropLabelLocal },
    variety: inputs.varietyId ? { id: inputs.varietyId, name: inputs.varietyName, nameLocal: inputs.varietyNameLocal } : null,
    method: { cultivation: inputs.cultivationMethod, stageClock: inputs.stageClockMethod, cropCycle: inputs.cropCycle },
    catalogue: null, agronomy: [], resistance: [], hypothesisRules: [], stages, scheduleDurationDays,
  };
  if (!inputs.varietyId) return buildVarietyProfile(base);
  try {
    const [cat, vca, res] = await Promise.all([
      supabase.from("v_crop_varieties").select("variety_id, name, variety_code, season, maturity_days_min, maturity_days_max, released_by").eq("variety_id", inputs.varietyId).maybeSingle(),
      supabase.from("variety_cultivation_agronomy").select("cultivation_method, is_suitable, suitability_grade, suitability_note, duration_days_min, duration_days_max, duration_reference, evidence_tier, seedling_age_days_min, seedling_age_days_max, source").eq("variety_id", inputs.varietyId).eq("is_active", true),
      supabase.from("variety_resistance").select("threat_type, threat_name, observation_code, canonical_observation_code, resistance_level, hypothesis_id, score_modifier, source").eq("variety_id", inputs.varietyId),
    ]);
    if (cat.error) throw cat.error; if (vca.error) throw vca.error; if (res.error) throw res.error;
    base.catalogue = (cat.data as CatalogueRow | null) ?? null;
    base.agronomy = (vca.data ?? []) as AgronomyRow[];
    base.resistance = (res.data ?? []) as ResistanceRow[];
    const hypotheses = [...new Set(base.resistance.map((r) => r.hypothesis_id).filter((h): h is string => !!h))];
    if (hypotheses.length) {
      const map = await supabase.from("hypothesis_rule_mapping").select("hypothesis_id, rule_id, priority").in("hypothesis_id", hypotheses);
      if (map.error) throw map.error;
      base.hypothesisRules = (map.data ?? []) as HypothesisRuleRow[];
    }
    return buildVarietyProfile(base);
  } catch (error) {
    const profile = buildVarietyProfile(base);
    profile.data_limits.push(`variety_profile_read_failed:${(error as Error)?.message ?? "unknown"}`.slice(0, 160));
    return profile;
  }
}
