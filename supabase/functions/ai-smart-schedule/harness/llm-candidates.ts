// CHANGE LOG
// 2026-09-08 — v1.5.0 AGRONOMIST PROMPT. The model is now briefed the way a senior agronomist
//   briefs a field officer: the universal crop-calendar pattern (what every crop's package covers,
//   phase by phase), the farmer-simplicity rules (one card = one job, water as a field condition
//   the farmer can see, doses as what to buy and how to mix), and explicit freedom to propose
//   the practices this crop/method/field genuinely needs — while every number still passes the
//   same gates (regulatory, policy, corroboration, second opinion). Where the DB plan was written
//   for another cultivation method (fertilizer_context_mismatch), the model is told so and asked
//   for the method-correct timing note as an advisory, never a replacement of the DB totals.
// 2026-09-08 — v1.4.0 THIRD GOLDEN CALENDAR (a factory-agronomist intensive package, Marathi,
//   per-acre): practices are organised by APPLICATION METHOD, each with its own water basis
//   (soil application at planting/day 45/75/120; drenching per 200 L; foliar spray per 100 L;
//   fertigation every 15 days when the field is on drip; preparation recipes such as a slurry that
//   ferments 4–5 days before use). The proposal schema now carries application_method_group,
//   water_volume_basis_l, mix_recipe steps, an irrigation_system applicability, and a product
//   grade on each input (as printed on the bag). The field's own irrigation system is read from
//   the land record and given to the model, so a drip field receives fertigation splits and a
//   flood field receives soil/drench splits — the same crop, two valid calendars.
// 2026-09-08 — v1.3.1 PRE-PUSH AUDIT (crop-/language-agnostic, no hardcoded agronomy):
//   (a) farming-policy gate now mirrors evidence-pack.ts exactly (organic_only | organic_fertilizer
//       = integrated | fertilizer_pesticide = synthetic_allowed) — invented aliases removed;
//   (b) harvest-relative windows anchor to the schedule's OWN harvest task (variety/graph
//       derived by the baseline), falling back to the graph's last stage only when no harvest
//       task exists — previously max(das_max) could land on a post-harvest stage;
//   (c) the second-opinion reviewer is scoped by the farmer's state/country from resolved
//       inputs, not a fixed country string. Every list in this file is a taxonomy or a unit
//       vocabulary; no crop, product, dose, threshold, stage name or language word.
// 2026-09-07 — v1.3.0 SECOND GOLDEN CALENDAR (a long-duration, multi-cycle crop schedule with a plant
//   crop and a ratoon crop): (a) regulatory gate distinguishes BANNED (rejected outright) from
//   RESTRICTED (admitted only through the full chemical path — corroboration + second opinion — and
//   recorded as regulatory_restricted in the verification); (b) ratoon/regrowth cycles are
//   described to the model from crop_cycle (no planting/seed treatment; stubble and trash
//   management, gap filling from nursery plants, the cycle's own fertilizer and irrigation
//   timeline); (c) irrigation cadence that changes by period is one proposal per window with its
//   own repeat_every_days, and a harvest-relative withdrawal.
// 2026-09-07 — v1.2.0 GOLDEN-CALENDAR FIXES (from transcribing the sample row by row):
//   nursery work (bed preparation and seed soaking in the days before nursery seeding) is also pre-sowing → negative
//   windows admitted for phase NURSERY as well as PRE_SEASON; NURSERY-phase tasks use task_type
//   'nursery'; cultural controls (hand-picking snails, bait traps, clean bunds, hand weeding) carry
//   no dosed input — dose+unit is required only for fertilizer/micronutrient/organic/biological
//   and plant-protection inputs, never for kind 'other'/'cultural'/'tool'.
// 2026-09-07 — v1.1.0 CALENDAR SHAPE. Modelled on the structure of a real field crop calendar
//   (activity · timing window on a named clock · anticipated date · how/how much): every proposal
//   now carries phase (PLANNING → PRE_SEASON → NURSERY → ESTABLISHMENT → VEGETATIVE →
//   REPRODUCTIVE → MATURITY → HARVEST → POST_HARVEST), a timing WINDOW (from/to days) on an
//   explicit clock (sowing / transplant / nursery / harvest-relative), an optional harvest
//   indicator, and tools/labour. Pre-season work (fallow, bund repair, land preparation, seed
//   treatment, nursery preparation) may be anchored BEFORE sowing (negative days); the structural
//   validator admits that only for phase PRE_SEASON. Task types are the DB's own enumeration.
// 2026-09-07 — v1.0.0 LLM ENRICHMENT TIER ("LLM proposes, DB governs, RAG corroborates,
//   agronomist promotes"). The database is the first tier and stays authoritative. This module
//   fills only the agronomic domains the database left empty for THIS crop / method / region
//   (the evidence pack names them: NO_AUTHORITATIVE_RULE:<DOMAIN>), by asking the schedule model
//   for STRUCTURED practices — never prose — shaped like a state package of practices:
//   stage, timing, purpose, inputs with dose+unit per acre, water volume, method, condition/ETL,
//   PHI, precautions, source kind. Every proposal then passes the same governance the DB rules
//   pass (banned/restricted ingredient list, farming policy, stage exists, dose+unit+PHI present
//   for chemicals) and two further checks for anything a farmer would buy and apply:
//   RAG corroboration filtered to this crop and state, and an independent second-opinion call
//   on the dose range. A proposal that passes becomes an ordinary Harness candidate,
//   indistinguishable to the farmer from a DB rule. A proposal that fails is NOT shown —
//   no hedged card, no "ask your dealer" — it is written to schedule_llm_proposals for
//   agronomist review, and promote_llm_proposal() turns an approved one into a decision_rules
//   row so the database grows from real usage.
//   No crop, product, dose or threshold is written in this file.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildAIRequest, getAPIEndpoint, getAPIKey, getScheduleProviderChain, type AIProvider } from "../../_shared/aiConfig.ts";
import { ragRetrieve } from "../../_shared/ragRetrieval.ts";
import { toDas, computeTransplantOffset, type BaselineTask } from "../generator/baseline-generator.ts";
import type { ResolvedInputs } from "../db/resolve-inputs.ts";
import type { LandContext } from "../db/land-context.ts";
import type { StageRow } from "../db/agronomy-repo.ts";
import type { AgronomicEvidencePack, CandidateDomain, CandidateStatus, HarnessCandidate } from "./evidence-pack.ts";

export const ENRICHMENT_VERSION = "llm-enrichment@1.5.0";
export const PRE_SEASON_MAX_DAYS = 60; // structural sanity bound for pre-sowing anchors, not an agronomic value
const PROPOSE_TIMEOUT_MS = 40_000;
const VERIFY_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_TOKENS = 9_000;
const MAX_PROPOSALS = 60;
const RAG_PER_PROPOSAL = 4;
const RAG_TIME_PER_QUERY_MS = 2_500;

/** Domains the model may be asked to fill. MONITORING is DB-only (scouting comes from OBSERVATION rules). */
const ENRICHABLE: CandidateDomain[] = ["LAND_PREPARATION", "SEED_TREATMENT", "PLANTING", "NUTRIENT", "MICRONUTRIENT", "ORGANIC_INPUT", "BIOLOGICAL_INPUT", "IRRIGATION", "WEED", "PEST", "DISEASE", "PGR", "INTERCULTURAL", "HARVEST", "POST_HARVEST"];
const CHEMICAL_KINDS = new Set(["herbicide", "insecticide", "fungicide", "acaricide", "nematicide", "pgr"]);
const DOSED_KINDS = new Set(["fertilizer", "micronutrient", "organic", "biological"]);
const DOSE_UNITS = new Set(["kg", "g", "l", "ml", "kg/acre", "g/acre", "l/acre", "ml/acre", "t", "q", "bags", "packets", "tablets"]);
/** Must stay inside schedule_tasks.task_type CHECK (land_preparation, seed_treatment, nursery, sowing, gap_filling,
 *  nutrition, micronutrient, irrigation, weed_management, intercultural, pest_management, disease_management,
 *  growth_regulation, monitoring, harvest, post_harvest, residue_management, planning, advisory). */
const DOMAIN_TASK_TYPE: Record<string, string> = {
  LAND_PREPARATION: "land_preparation", SEED_TREATMENT: "seed_treatment", PLANTING: "sowing", NUTRIENT: "nutrition", MICRONUTRIENT: "micronutrient",
  ORGANIC_INPUT: "nutrition", BIOLOGICAL_INPUT: "nutrition", IRRIGATION: "irrigation", WEED: "weed_management", PEST: "pest_management",
  DISEASE: "disease_management", PGR: "growth_regulation", INTERCULTURAL: "intercultural", HARVEST: "harvest", POST_HARVEST: "post_harvest",
};
const PHASES = ["PLANNING", "PRE_SEASON", "NURSERY", "ESTABLISHMENT", "VEGETATIVE", "REPRODUCTIVE", "MATURITY", "HARVEST", "POST_HARVEST"] as const;
type Phase = typeof PHASES[number];
const CLOCKS = ["sowing", "transplant", "nursery", "harvest"] as const;
type Clock = typeof CLOCKS[number];

export interface ProposalInput { name: string; kind: string; grade?: string | null; active_ingredient?: string | null; formulation?: string | null; dose_value?: number | null; dose_unit?: string | null; water_volume_l_per_acre?: number | null; organic?: boolean | null }
const METHOD_GROUPS = ["soil_application", "seed_or_sett_treatment", "drenching", "foliar_spray", "fertigation", "broadcast", "mechanical", "manual", "other"] as const;
type MethodGroup = typeof METHOD_GROUPS[number];
const IRRIGATION_SYSTEMS = ["any", "drip", "sprinkler", "flood", "furrow", "surface", "manual"] as const;
export interface LlmProposal {
  domain: string; phase: Phase; stage_key: string; title: string; purpose: string;
  timing: { anchor: "stage_start" | "stage_mid" | "stage_end"; offset_days?: number | null; repeat_every_days?: number | null };
  /** Calendar-style window: activity is due between from_days and to_days on the named clock. Negative = before that clock's day 0. */
  window?: { from_days: number; to_days: number; clock: Clock } | null;
  action_steps: string[]; method?: string | null; inputs: ProposalInput[];
  /** How it is applied and the water basis it is mixed for (e.g. per 100 L spray, per 200 L drench). */
  application_method_group?: MethodGroup | null; water_volume_basis_l?: number | null;
  /** Preparation steps when the practice is a mixture/culture (ferment, dilute, filter, time to stand). */
  mix_recipe?: string[] | null;
  /** Which irrigation system this practice applies to; 'any' when independent of it. */
  irrigation_system?: typeof IRRIGATION_SYSTEMS[number] | null;
  condition?: { type: "none" | "observation" | "weather" | "soil_test"; text?: string | null; etl?: string | null } | null;
  phi_days?: number | null; precautions?: string[]; tools_or_labour?: string | null; harvest_indicator?: string | null;
  source_kind?: string | null; confidence?: number | null;
}
export interface ProposalRecord { proposal: LlmProposal; status: "verified" | "rejected"; reasons: string[]; verification: Record<string, unknown>; rag_evidence: Array<{ chunkId: string; documentId: string; title: string; publisher: string; authorityTier: string }>; candidate_id?: string }
export interface EnrichmentResult { candidates: HarnessCandidate[]; proposals: ProposalRecord[]; gaps: string[]; trace: Record<string, unknown> }

export interface EnrichmentContext { tenantId: string | null; farmerId: string | null; landId: string | null; deadlineAt: number; landContext: LandContext | null }
const CHEMICAL_KINDS_LIST = [...CHEMICAL_KINDS];

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const isChemical = (i: ProposalInput) => CHEMICAL_KINDS.has(norm(i.kind)) && !i.organic;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/* ────────────────────────── 1. Propose (structured only) ────────────────────────── */

const systemPrompt = () => [
  "You are a senior field agronomist (30 years, smallholder farms in India) writing the season plan for ONE farmer's field, for a farm advisory system that will check every number you give against a governed database before the farmer sees it.",
  "You are given the farmer's exact context (field, soil, irrigation system, method, variety, sowing date, policy) and the crop's biological stage graph from the database. Write the practices a good package of practices gives — for the DOMAINS REQUESTED ONLY — in the JSON schema supplied.",
  "THE UNIVERSAL PATTERN every crop package follows (use it as your checklist, fill only what applies to this crop and method):",
  "  PRE-SEASON: field preparation (tillage depth, levelling, drainage/bunds, organic manure), basal soil amendment where the soil calls for it; seed/planting-material selection and treatment; nursery raising for transplanted crops.",
  "  ESTABLISHMENT: sowing/planting method, rate, spacing and depth; first water; gap filling; early weed control (pre-emergence where the method needs it).",
  "  VEGETATIVE: nutrient top-dressings with the trigger for each (days, stage, leaf-colour or soil-test), water regime, weeding/intercultural operations (hoeing, earthing-up, thinning, propping, trash handling), micronutrient correction on deficiency signs.",
  "  REPRODUCTIVE: the critical water stages (never let the crop dry at these), reproductive-stage nutrition, growth regulation only where the package recommends it, protection through scouting with thresholds.",
  "  MATURITY / HARVEST: irrigation withdrawal timing, the crop's own harvest indicator, harvest method; POST-HARVEST: drying, primary processing, storage, residue or regrowth-cycle handling.",
  "FARMER SIMPLICITY RULES (rural farmers, small phones, read once): one practice = one job a farmer can do in one visit; say what to do, when, how, how much to buy, how to mix, and why in one plain sentence; describe water as a field condition the farmer can SEE (standing-water depth, soil moist/cracking, wet-dry cycle) with the interval, never as millimetres alone; give inputs as what to buy (product or grade, quantity per acre) and how to mix (water volume); no jargon, no abbreviations the farmer would not know.
  "SHAPE (a real crop calendar): each practice = activity · phase · timing window on a named clock (sowing / transplant / nursery / harvest-relative) · how and how much per acre · why · precautions · tools or labour. Cover the whole crop life: PLANNING decisions are NOT tasks (skip them); PRE_SEASON (fallow, bund/field preparation, land preparation, seed treatment, nursery preparation — these may fall BEFORE sowing, use negative from_days on the sowing clock, never earlier than -" + String(PRE_SEASON_MAX_DAYS) + " days), NURSERY (for transplanted crops), ESTABLISHMENT (gap filling, first irrigation, pre-emergence weed control), VEGETATIVE (top-dressing, weeding/intercultural, critical irrigation, micronutrient correction), REPRODUCTIVE (reproductive-stage nutrition, PGR where recommended, protection), MATURITY (irrigation withdrawal, the crop's own harvest indicator — maturity signs, moisture, colour), HARVEST, POST_HARVEST (drying, primary processing, storage, residue or regrowth-cycle handling).",
  "RULES:",
  "1. Anchor every practice to a stage_key from the supplied stage graph AND give its window (from_days, to_days, clock). For pre-season work anchor to the first stage with a negative window on the sowing clock; for harvest-relative work (drain, withdrawal) use clock 'harvest' with negative days.",
  "2. Every input must carry name, kind, active ingredient (for plant-protection and PGR), formulation, dose_value, dose_unit per acre, and water volume per acre for sprays. Doses are the registered/recommended dose per ACRE for this crop; convert from hectare if the source is per hectare.",
  "3. Give phi_days for every plant-protection or PGR input. Give condition.type='observation' with the threshold text for curative sprays; 'none' for stage-timed practices such as seed treatment, pre-emergence herbicide, basal and top-dressing.",
  "4. Respect the farming policy: for organic-only farmers propose no synthetic input; for organic-fertilizer farmers propose no synthetic fertilizer.",
  "5. Do not duplicate what the existing schedule already covers (existing_coverage). Do not propose scouting/monitoring — the database owns it.",
  "6. Prefer practices documented for the farmer's state; set source_kind to state_pop, icar, label_claim or general_practice accordingly, and confidence 0–1.",
  "7. Never invent a product that does not exist. If a domain has no sound practice for this crop, return nothing for it.",
  "8. If crop.crop_cycle names a ratoon / regrowth cycle, the crop is NOT planted: propose no seed, sett, nursery or planting practice; propose stubble and trash management, gap filling from nursery plants, and that cycle's own fertilizer and irrigation timeline anchored to its stage graph.",
  "9. Irrigation whose interval changes by period is one proposal per period (its own window and repeat_every_days), plus a harvest-relative withdrawal (clock 'harvest', negative days) when the practice calls for it.",
  "10. Organise inputs by APPLICATION METHOD, each with its own water basis: give application_method_group and water_volume_basis_l (the litres the mixture is prepared for, e.g. a spray per 100 L, a drench per 200 L). When several inputs go into one tank at one time, list them all in one proposal. Give each fertilizer input its grade as printed on the bag (e.g. an N:P:K grade string) in inputs[].grade.",
  "11. Respect the field's irrigation system (farmer_field.irrigation_system): on drip, nutrition after establishment is fertigation — one proposal per fertigation interval with repeat_every_days and the per-event quantities; on flood/furrow/surface, soil application and drenching. Mark practices valid for one system only with irrigation_system; use 'any' otherwise.",
  "12. When a practice is a prepared mixture or culture (a slurry, a fermented extract, a biofertilizer culture), give mix_recipe as ordered preparation steps including standing/fermentation time and the water it is made up in.",
  "13. FREE HAND, STRICT HARNESS: you may propose any practice this crop, method and field genuinely need in the requested domains — you are not limited to what the database holds. But every input must be a real registered product or a standard grade, with a real recommended dose per acre; every number you give will be checked and dropped if unverifiable, so give the practice that the state package of practices, ICAR or the product label actually states, and name that source in source_kind.",
  "14. If db_plan_notes says the database fertilizer or irrigation plan was written for a different cultivation method than the farmer's, do NOT rewrite the totals; add ONE advisory practice at the establishment stage (domain NUTRIENT or IRRIGATION, task_type advisory via method 'advisory') that tells the farmer, in one sentence, how the timing differs for his method — the harness keeps the database totals.",
  "15. Write purpose and action_steps in plain spoken language a farmer with little schooling understands; short sentences; the translator will render them in the farmer's language and must keep every number unchanged.",
  "Return JSON only: {\"proposals\":[...]}.",
].join("\n");

function stageSummary(stages: StageRow[], transplantOffset: number | null) {
  return stages.map((s) => ({ stage_key: s.stage_code || s.growth_stage, growth_stage: s.growth_stage, das_start: toDas(s, s.das_min, transplantOffset), das_end: toDas(s, s.das_max, transplantOffset), gdd_min: s.gdd_min, gdd_max: s.gdd_max, moisture_critical: s.is_moisture_critical ?? null }));
}

function existingCoverage(tasks: BaselineTask[], pack: AgronomicEvidencePack) {
  const byStage: Record<string, Set<string>> = {};
  for (const t of tasks) { const k = t.stage_key || t.anchor_stage || "unknown"; (byStage[k] ??= new Set()).add(t.task_type); }
  for (const c of pack.candidates) { const k = c.task.stage_key || c.task.anchor_stage || "unknown"; (byStage[k] ??= new Set()).add(c.task.task_type); }
  return Object.fromEntries(Object.entries(byStage).map(([k, v]) => [k, [...v]]));
}

async function callModel(messages: Array<{ role: string; content: string }>, timeoutMs: number, deadlineAt: number, maxTokens: number): Promise<{ content: string; provider: AIProvider; model: string } | null> {
  const providers = getScheduleProviderChain().filter((p) => getAPIKey(p.provider));
  for (const { provider, model } of providers) {
    const budget = Math.min(timeoutMs, deadlineAt - Date.now());
    if (budget < 5_000) return null;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), budget);
    try {
      const res = await fetch(getAPIEndpoint(provider), { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAPIKey(provider)}` }, body: JSON.stringify(buildAIRequest(provider, model, messages, { maxTokens, temperature: 0, useJsonMode: true })), signal: controller.signal });
      if (!res.ok) continue;
      const data = await res.json(); const content = data?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) return { content, provider, model };
    } catch { /* next provider */ } finally { clearTimeout(timer); }
  }
  return null;
}

function parseProposals(content: string): LlmProposal[] {
  try {
    const raw = JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.proposals) ? raw.proposals : [];
    return arr.filter((p: unknown) => p && typeof p === "object").slice(0, MAX_PROPOSALS).map((p: Record<string, unknown>) => ({
      domain: String(p.domain ?? "").toUpperCase(),
      phase: (PHASES.includes(String(p.phase ?? "").toUpperCase() as Phase) ? String(p.phase).toUpperCase() : "VEGETATIVE") as Phase,
      stage_key: String(p.stage_key ?? ""), title: String(p.title ?? ""), purpose: String(p.purpose ?? ""),
      window: p.window && typeof p.window === "object" && numOrNull((p.window as Record<string, unknown>).from_days) != null && numOrNull((p.window as Record<string, unknown>).to_days) != null
        ? { from_days: Number((p.window as Record<string, unknown>).from_days), to_days: Number((p.window as Record<string, unknown>).to_days), clock: (CLOCKS.includes(String((p.window as Record<string, unknown>).clock) as Clock) ? String((p.window as Record<string, unknown>).clock) : "sowing") as Clock }
        : null,
      tools_or_labour: p.tools_or_labour == null ? null : String(p.tools_or_labour), harvest_indicator: p.harvest_indicator == null ? null : String(p.harvest_indicator),
      application_method_group: (METHOD_GROUPS as readonly string[]).includes(String(p.application_method_group ?? "")) ? String(p.application_method_group) as MethodGroup : null,
      water_volume_basis_l: numOrNull(p.water_volume_basis_l),
      mix_recipe: Array.isArray(p.mix_recipe) ? p.mix_recipe.map(String).filter(Boolean) : null,
      irrigation_system: (IRRIGATION_SYSTEMS as readonly string[]).includes(String(p.irrigation_system ?? "")) ? String(p.irrigation_system) as typeof IRRIGATION_SYSTEMS[number] : "any",
      timing: { anchor: (["stage_start", "stage_mid", "stage_end"].includes(String((p.timing as Record<string, unknown>)?.anchor)) ? String((p.timing as Record<string, unknown>).anchor) : "stage_start") as LlmProposal["timing"]["anchor"], offset_days: numOrNull((p.timing as Record<string, unknown>)?.offset_days), repeat_every_days: numOrNull((p.timing as Record<string, unknown>)?.repeat_every_days) },
      action_steps: Array.isArray(p.action_steps) ? p.action_steps.map(String).filter(Boolean) : [], method: p.method == null ? null : String(p.method),
      inputs: Array.isArray(p.inputs) ? p.inputs.filter((i: unknown) => i && typeof i === "object").map((i: Record<string, unknown>) => ({ name: String(i.name ?? ""), kind: String(i.kind ?? "other"), grade: i.grade == null ? null : String(i.grade), active_ingredient: i.active_ingredient == null ? null : String(i.active_ingredient), formulation: i.formulation == null ? null : String(i.formulation), dose_value: numOrNull(i.dose_value), dose_unit: i.dose_unit == null ? null : String(i.dose_unit), water_volume_l_per_acre: numOrNull(i.water_volume_l_per_acre), organic: i.organic === true })) : [],
      condition: p.condition && typeof p.condition === "object" ? { type: (["none", "observation", "weather", "soil_test"].includes(String((p.condition as Record<string, unknown>).type)) ? String((p.condition as Record<string, unknown>).type) : "none") as NonNullable<LlmProposal["condition"]>["type"], text: (p.condition as Record<string, unknown>).text == null ? null : String((p.condition as Record<string, unknown>).text), etl: (p.condition as Record<string, unknown>).etl == null ? null : String((p.condition as Record<string, unknown>).etl) } : { type: "none" },
      phi_days: numOrNull(p.phi_days), precautions: Array.isArray(p.precautions) ? p.precautions.map(String).filter(Boolean) : [], source_kind: p.source_kind == null ? null : String(p.source_kind), confidence: numOrNull(p.confidence),
    }));
  } catch { return []; }
}
const numOrNull = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/* ────────────────────────── 2. Governance gates ────────────────────────── */

async function loadRestrictedIngredients(supabase: SupabaseClient): Promise<Array<{ name: string; status: string }>> {
  const { data } = await supabase.from("chemical_regulatory_status").select("chemical_name, status").limit(2000);
  return (data || []).filter((r: Record<string, unknown>) => norm(r.status) !== "approved").map((r: Record<string, unknown>) => ({ name: norm(r.chemical_name), status: norm(r.status) }));
}

/** Same vocabulary and semantics as evidence-pack.ts policyKind()/policyAllows(): the farmer's declared
 *  policy is one of organic_only | organic_fertilizer (= integrated) | fertilizer_pesticide (= synthetic_allowed). */
function policyKind(policy: string | null): "organic_only" | "integrated" | "synthetic_allowed" | "unknown" {
  const p = norm(policy);
  if (p === "organic_only") return "organic_only";
  if (p === "integrated" || p === "organic_fertilizer") return "integrated";
  if (p === "fertilizer_pesticide" || p === "synthetic_allowed") return "synthetic_allowed";
  return "unknown";
}
function policyAllowsInput(policy: string | null, input: ProposalInput): boolean {
  const kind = policyKind(policy);
  const k = norm(input.kind);
  const synthetic = !(input.organic === true || k === "organic" || k === "biological" || k === "cultural" || k === "other" || k === "tool");
  if (kind === "organic_only") return !synthetic;
  if (kind === "integrated") return !(synthetic && (k === "fertilizer" || k === "micronutrient")); // organic fertilizer, integrated protection
  return true;
}

function gate(p: LlmProposal, stages: Map<string, StageRow>, restricted: Array<{ name: string; status: string }>, policy: string | null, irrigationSystem: string | null): string[] {
  const reasons: string[] = [];
  if (p.irrigation_system && p.irrigation_system !== "any" && irrigationSystem && norm(p.irrigation_system) !== norm(irrigationSystem)) reasons.push(`irrigation_system_mismatch:${p.irrigation_system}`);
  if (p.application_method_group === "fertigation" && irrigationSystem && norm(irrigationSystem) !== "drip") reasons.push("fertigation_requires_drip");
  if (!ENRICHABLE.includes(p.domain as CandidateDomain)) reasons.push(`domain_not_enrichable:${p.domain}`);
  if (!stages.has(norm(p.stage_key))) reasons.push(`stage_not_in_graph:${p.stage_key}`);
  if (!p.title || !p.action_steps.length) reasons.push("no_actionable_steps");
  if (p.phase === "PLANNING") reasons.push("planning_is_not_a_task");
  if (p.window && p.window.clock === "sowing" && p.window.from_days < -PRE_SEASON_MAX_DAYS) reasons.push(`pre_season_window_out_of_bounds:${p.window.from_days}`);
  if (p.window && p.window.from_days < 0 && p.phase !== "PRE_SEASON" && p.phase !== "NURSERY" && p.window.clock !== "harvest") reasons.push("negative_window_outside_pre_season");
  for (const i of p.inputs) {
    if (!i.name) { reasons.push("input_without_name"); continue; }
    if (!policyAllowsInput(policy, i)) reasons.push(`blocked_by_farming_policy:${i.name}`);
    const chem = isChemical(i);
    if (chem) {
      if (!i.active_ingredient) reasons.push(`chemical_without_active_ingredient:${i.name}`);
      if (p.phi_days == null) reasons.push(`chemical_without_phi:${i.name}`);
    }
    const dosed = DOSED_KINDS.has(norm(i.kind)) || chem;
    if (dosed && (i.dose_value == null || !i.dose_unit)) reasons.push(`input_without_dose:${i.name}`);
    else if (dosed && !DOSE_UNITS.has(norm(i.dose_unit))) reasons.push(`unrecognised_dose_unit:${i.dose_unit}`);
    const ai = norm(i.active_ingredient || i.name);
    const hit = restricted.find((r) => r.name && (ai.includes(r.name) || r.name.includes(ai)));
    // banned / withdrawn / prohibited → never; restricted → only via the full chemical verification path
    if (hit && hit.status !== "restricted") reasons.push(`regulatory_${hit.status}:${hit.name}`);
  }
  return reasons;
}

/* ────────────────────────── 3. Corroboration + second opinion ────────────────────────── */

async function corroborate(supabase: SupabaseClient, p: LlmProposal, inputs: ResolvedInputs, ctx: EnrichmentContext): Promise<ProposalRecord["rag_evidence"]> {
  if (ctx.deadlineAt - Date.now() < RAG_TIME_PER_QUERY_MS + 3_000) return [];
  const terms = [inputs.cropLabel || inputs.cropCode, p.stage_key.replace(/_/g, " "), ...p.inputs.map((i) => i.active_ingredient || i.name), p.domain.toLowerCase().replace(/_/g, " ")].filter(Boolean).join(" ");
  const stateCode = inputs.regionCode ? inputs.regionCode.replace(/^IN-/, "") : null;
  try {
    const r = await ragRetrieve(supabase, terms, "en", { cropCodes: inputs.cropCode ? [inputs.cropCode] : null, stateCodes: stateCode ? [stateCode] : null, tenantId: ctx.tenantId }, { purpose: "SCHEDULE_VALIDATION", tenantIdText: ctx.tenantId, farmerId: ctx.farmerId, maxEvidence: RAG_PER_PROPOSAL });
    const needles = p.inputs.map((i) => norm(i.active_ingredient || i.name).split(/\s+/)[0]).filter((n) => n.length >= 4);
    return r.evidence.filter((e) => e.servable && (!needles.length || needles.some((n) => norm(e.text).includes(n)))).map((e) => ({ chunkId: e.chunkId, documentId: e.documentId, title: e.title, publisher: e.publisher, authorityTier: e.authorityTier }));
  } catch { return []; }
}

async function secondOpinion(chemicals: Array<{ id: number; p: LlmProposal }>, inputs: ResolvedInputs, deadlineAt: number): Promise<Map<number, { ok: boolean; note: string }>> {
  const out = new Map<number, { ok: boolean; note: string }>();
  if (!chemicals.length) return out;
  const msg = JSON.stringify({ crop: inputs.cropLabel || inputs.cropCode, jurisdiction: { state: inputs.state, region_code: inputs.regionCode, country: inputs.regionCode?.includes("-") ? inputs.regionCode.split("-")[0] : null }, chemical_kinds: CHEMICAL_KINDS_LIST, items: chemicals.map((c) => ({ id: c.id, stage: c.p.stage_key, inputs: c.p.inputs.filter(isChemical).map((i) => ({ active_ingredient: i.active_ingredient, formulation: i.formulation, dose_value: i.dose_value, dose_unit: i.dose_unit, per: "acre" })), phi_days: c.p.phi_days, condition: c.p.condition })) });
  const res = await callModel([
    { role: "system", content: `You are an independent pesticide-registration reviewer for the jurisdiction given in the request (state and country of the farmer's field). For each item, answer ONLY whether every listed active ingredient is registered for use on this crop there and whether the dose per acre is within its label-recommended range. Do not suggest alternatives. Return JSON: {"reviews":[{"id":0,"registered":true,"dose_in_range":true,"note":"..."}]}` },
    { role: "user", content: msg },
  ], VERIFY_TIMEOUT_MS, deadlineAt, 2_000);
  if (!res) return out;
  try {
    const raw = JSON.parse(res.content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
    for (const r of raw?.reviews ?? []) out.set(Number(r.id), { ok: r.registered === true && r.dose_in_range === true, note: String(r.note ?? "") });
  } catch { /* unparsable → no verdict → chemicals fail closed */ }
  return out;
}

/* ────────────────────────── 4. Candidate construction ────────────────────────── */

function candidateFromProposal(p: LlmProposal, rec: ProposalRecord, stage: StageRow, transplantOffset: number | null, idx: number, model: string, harvestDas: number | null): HarnessCandidate {
  const stageStart = toDas(stage, stage.das_min, transplantOffset) ?? 0; const stageEnd = toDas(stage, stage.das_max, transplantOffset) ?? stageStart;
  // Window on the named clock → sowing-clock days (the schedule's calendar axis).
  let winFrom = stageStart, winTo = stageEnd;
  if (p.window) {
    const shift = p.window.clock === "transplant" ? (transplantOffset ?? 0) : p.window.clock === "harvest" ? (harvestDas ?? stageEnd) : 0;
    winFrom = p.window.from_days + shift; winTo = p.window.to_days + shift;
  }
  const base = p.timing.anchor === "stage_end" ? winTo : p.timing.anchor === "stage_mid" ? Math.round((winFrom + winTo) / 2) : winFrom;
  const preSowing = p.phase === "PRE_SEASON" || p.phase === "NURSERY";
  const das = Math.max(preSowing ? -PRE_SEASON_MAX_DAYS : 0, base + (p.timing.offset_days ?? 0));
  const start = winFrom, end = winTo;
  const hasChem = p.inputs.some(isChemical);
  const conditional = p.condition?.type === "observation" || p.condition?.type === "weather" || p.condition?.type === "soil_test";
  const status: CandidateStatus = conditional ? "CONDITIONAL" : "SCHEDULED";
  const basis = p.water_volume_basis_l ? ` (mixture for ${p.water_volume_basis_l} L water)` : "";
  const how = p.application_method_group ? p.application_method_group.replace(/_/g, " ") : (p.method ?? "");
  const inputLines = p.inputs.map((i) => `Apply: ${i.name}${i.grade ? ` ${i.grade}` : ""}${i.active_ingredient ? ` (${i.active_ingredient}${i.formulation ? ` ${i.formulation}` : ""})` : ""}${i.dose_value != null ? ` — ${i.dose_value} ${i.dose_unit} per acre` : ""}${i.water_volume_l_per_acre ? ` in ${i.water_volume_l_per_acre} L water per acre` : ""}${how ? `, by ${how}` : ""}${basis}.`);
  const recipeLines = (p.mix_recipe ?? []).map((r, n) => `Prepare ${n + 1}: ${r}`);
  const instructions = [
    ...(conditional ? [`Only if: ${p.condition?.etl || p.condition?.text || "the condition is confirmed in the field"}.`] : []),
    `Why: ${p.purpose}`,
    ...p.action_steps.map((s) => s.endsWith(".") ? s : `${s}.`),
    ...recipeLines,
    ...inputLines,
    ...(p.harvest_indicator ? [`Harvest indicator: ${p.harvest_indicator}`] : []),
    ...(p.tools_or_labour ? [`Tools / labour: ${p.tools_or_labour}`] : []),
    ...(p.phi_days != null ? [`Wait ${p.phi_days} days after this application before harvest.`] : []),
  ];
  const technical = [
    `Source: ${p.source_kind ?? "unspecified"} (model proposal, verified)`,
    `Confidence: ${p.confidence ?? "n/a"}`,
    ...rec.rag_evidence.map((e) => `Evidence: ${e.title} — ${e.publisher}`),
    ...(hasChem ? [`Second opinion: ${String(rec.verification.second_opinion_note ?? "")}`] : []),
  ];
  const task: BaselineTask = {
    task_name: clip(p.title, 60), task_type: norm(p.method) === "ADVISORY" ? "advisory" : p.phase === "NURSERY" ? "nursery" : (DOMAIN_TASK_TYPE[p.domain] ?? "advisory"), task_description: p.purpose,
    days_from_sowing: das, anchor_type: "STAGE", anchor_stage: stage.stage_code || stage.growth_stage, gdd_target: stage.gdd_min ?? null,
    stage_key: stage.stage_code || stage.growth_stage, stage_uuid: stage.id, stage_name: stage.growth_stage, stage_order: idx,
    priority: hasChem ? "high" : "medium", weather_dependent: hasChem || p.domain === "NUTRIENT" || p.domain === "MICRONUTRIENT",
    nutrient: null, quantity: null, estimated_cost: null, rule_ids: [], confidence: p.confidence ?? null,
    source_refs: [{ table: "schedule_llm_proposals", row_id: null, source: model, authority: "llm_verified", confidence: p.confidence ?? null }, ...rec.rag_evidence.map((e) => ({ table: "rag_chunks", row_id: e.chunkId, source: e.title, authority: e.authorityTier }))],
    instructions, precautions: p.precautions ?? [], technical_details: technical,
    resources: { requirement_semantics: conditional ? "CONDITIONAL_RULE" : "LLM_VERIFIED_PRACTICE", provenance: "llm_proposed_verified", enrichment_version: ENRICHMENT_VERSION, phase: p.phase, window: { from_das: start, to_das: end, clock: p.window?.clock ?? "sowing", from_days: p.window?.from_days ?? null, to_days: p.window?.to_days ?? null }, inputs: p.inputs, condition: p.condition ?? null, phi_days: p.phi_days ?? null, tools_or_labour: p.tools_or_labour ?? null, harvest_indicator: p.harvest_indicator ?? null, application_method_group: p.application_method_group ?? null, water_volume_basis_l: p.water_volume_basis_l ?? null, mix_recipe: p.mix_recipe ?? null, irrigation_system: p.irrigation_system ?? "any", verification: rec.verification },
    recurrence: p.timing.repeat_every_days && p.timing.repeat_every_days > 0 && end > das ? { interval_days: p.timing.repeat_every_days, window_start: das, window_end: end, expected_events: Math.max(1, Math.floor((end - das) / p.timing.repeat_every_days) + 1) } : null,
  };
  return { id: `llm_${String(idx + 1).padStart(4, "0")}`, task, kind: "RULE_ACTION", domain: p.domain as CandidateDomain, required: false, materializable: true, default_status: status, trigger_class: conditional ? "OBSERVATION" : "CONTEXT_SCHEDULE", condition_code: p.condition?.etl ?? p.condition?.text ?? null, evidence: { provenance: "llm_proposed_verified", source_kind: p.source_kind, confidence: p.confidence, rag_evidence: rec.rag_evidence.length, has_chemical: hasChem } };
}

/* ────────────────────────── 5. Orchestration ────────────────────────── */

export async function proposeAndVerifyCandidates(
  supabase: SupabaseClient, inputs: ResolvedInputs, stages: StageRow[], existingTasks: BaselineTask[], pack: AgronomicEvidencePack, ctx: EnrichmentContext,
): Promise<EnrichmentResult> {
  const startedAt = Date.now();
  const empty: EnrichmentResult = { candidates: [], proposals: [], gaps: [], trace: { version: ENRICHMENT_VERSION, skipped: null } };
  const targets = pack.gaps.filter((g) => g.startsWith("NO_AUTHORITATIVE_RULE:")).map((g) => g.split(":")[1]).filter((d) => ENRICHABLE.includes(d as CandidateDomain));
  // The DB plan was authored for another cultivation method → ask for a method-timing advisory (never new totals).
  const dbPlanNotes: string[] = [];
  const allGaps = [...pack.gaps, ...(inputs.gaps ?? [])];
  const fertMismatch = allGaps.find((g) => g.startsWith("fertilizer_context_mismatch:"));
  if (fertMismatch) { dbPlanNotes.push(`The database fertilizer plan (totals fixed by the harness) was written for cultivation context "${fertMismatch.split(":").slice(1).join(":")}", not for the farmer's method "${inputs.cultivationMethod ?? ""}". Give one advisory on timing differences only.`); if (!targets.includes("NUTRIENT")) targets.push("NUTRIENT"); }
  if (allGaps.some((g) => g.startsWith("irrigation_variety_unscoped:")) && !targets.includes("IRRIGATION")) { dbPlanNotes.push("The database irrigation guideline is crop-level (not variety- or method-specific). Give the water regime as a field condition the farmer can see for each stage."); targets.push("IRRIGATION"); }
  // Pre-season and harvest-side domains are always worth asking for when the DB has nothing dated there.
  for (const d of ["LAND_PREPARATION", "SEED_TREATMENT", "POST_HARVEST"] as const) if (!targets.includes(d) && !existingTasks.some((t) => t.task_type === DOMAIN_TASK_TYPE[d])) targets.push(d);
  if (!targets.length) return { ...empty, trace: { ...empty.trace, skipped: "no_uncovered_domains" } };
  if (ctx.deadlineAt - Date.now() < 20_000) return { ...empty, gaps: ["enrichment_skipped_time_budget"], trace: { ...empty.trace, skipped: "time_budget", targets } };

  const transplantOffset = computeTransplantOffset(stages, inputs.sowingDate, inputs.transplantDate);
  const stageMap = new Map(stages.map((s) => [norm(s.stage_code || s.growth_stage), s]));
  // The field's own irrigation system (lands.irrigation_type / irrigation_source / water_source) decides fertigation vs soil/drench.
  let irrigation: { irrigation_type: string | null; irrigation_source: string | null; water_source: string | null } = { irrigation_type: null, irrigation_source: null, water_source: null };
  if (ctx.landId) { const { data: land } = await supabase.from("lands").select("irrigation_type, irrigation_source, water_source").eq("id", ctx.landId).maybeSingle(); if (land) irrigation = { irrigation_type: land.irrigation_type ?? null, irrigation_source: land.irrigation_source ?? null, water_source: land.water_source ?? null }; }
  // Harvest anchor = the schedule's own harvest task (baseline derives it from variety duration or the graph);
  // fallback: the graph's last stage end. Never a constant.
  const harvestTask = existingTasks.filter((t) => t.task_type === "harvest").sort((a, b) => a.days_from_sowing - b.days_from_sowing)[0] ?? null;
  const harvestDas = harvestTask?.days_from_sowing ?? stages.reduce<number | null>((m, s) => { const d = toDas(s, s.das_max, transplantOffset); return d != null && (m == null || d > m) ? d : m; }, null);
  const context = {
    crop: { code: inputs.cropCode, label: inputs.cropLabel, variety: inputs.varietyName, cultivation_method: inputs.cultivationMethod, stage_clock_method: inputs.stageClockMethod, crop_cycle: inputs.cropCycle },
    farmer_field: { state: inputs.state, district: inputs.district, region_code: inputs.regionCode, land_area_acres: inputs.landAreaAcres, soil_fertility_class: inputs.soilFertilityClass, soil: ctx.landContext?.soil ?? null, sowing_date: inputs.sowingDate, transplant_date: inputs.transplantDate, farming_policy: inputs.farmingPolicy ?? null, agro_climatic_zone: ctx.landContext?.agroClimaticZone ?? null, irrigation_system: irrigation.irrigation_type, irrigation_source: irrigation.irrigation_source, water_source: irrigation.water_source },
    stage_graph: stageSummary(stages, transplantOffset),
    existing_coverage: existingCoverage(existingTasks, pack),
    domains_requested: targets,
    db_plan_notes: dbPlanNotes,
    schema: { proposals: [{ domain: "one of domains_requested", application_method_group: "soil_application|seed_or_sett_treatment|drenching|foliar_spray|fertigation|broadcast|mechanical|manual|other", water_volume_basis_l: null, mix_recipe: ["optional ordered preparation steps"], irrigation_system: "any|drip|sprinkler|flood|furrow|surface|manual", phase: "PRE_SEASON|NURSERY|ESTABLISHMENT|VEGETATIVE|REPRODUCTIVE|MATURITY|HARVEST|POST_HARVEST", stage_key: "from stage_graph", window: { from_days: 0, to_days: 0, clock: "sowing|transplant|nursery|harvest" }, tools_or_labour: "optional", harvest_indicator: "optional, MATURITY/HARVEST only", title: "2-6 words", purpose: "one sentence", timing: { anchor: "stage_start|stage_mid|stage_end", offset_days: 0, repeat_every_days: null }, action_steps: ["..."], method: "e.g. broadcast / foliar spray / soil drench / drip", inputs: [{ name: "", kind: "fertilizer|micronutrient|organic|biological|herbicide|insecticide|fungicide|pgr|other", grade: "as printed on the bag, optional", active_ingredient: "", formulation: "", dose_value: 0, dose_unit: "kg|g|l|ml per acre", water_volume_l_per_acre: null, organic: false }], condition: { type: "none|observation|weather|soil_test", text: "", etl: "" }, phi_days: null, precautions: ["..."], source_kind: "state_pop|icar|label_claim|general_practice", confidence: 0.0 }] },
  };
  const res = await callModel([{ role: "system", content: systemPrompt() }, { role: "user", content: JSON.stringify(context) }], PROPOSE_TIMEOUT_MS, ctx.deadlineAt, MAX_OUTPUT_TOKENS);
  if (!res) return { ...empty, gaps: ["enrichment_model_unavailable"], trace: { ...empty.trace, skipped: "model_unavailable", targets, elapsed_ms: Date.now() - startedAt } };
  const proposals = parseProposals(res.content).filter((p) => targets.includes(p.domain));
  const restricted = await loadRestrictedIngredients(supabase);

  const records: ProposalRecord[] = proposals.map((p) => ({ proposal: p, status: "rejected", reasons: gate(p, stageMap, restricted, inputs.farmingPolicy ?? null, irrigation.irrigation_type), verification: { gate: "pending" }, rag_evidence: [] }));
  // corroboration for every structurally sound proposal (evidence is attached even to non-chemical practices)
  for (const rec of records) {
    if (rec.reasons.length) { rec.verification = { gate: "failed" }; continue; }
    rec.rag_evidence = await corroborate(supabase, rec.proposal, inputs, ctx);
    rec.verification = { gate: "passed", rag_corroborated: rec.rag_evidence.length > 0 };
  }
  // chemicals: corroboration AND independent second opinion are both required
  const restrictedNames = restricted.filter((r) => r.status === "restricted").map((r) => r.name);
  for (const rec of records) {
    const flagged = rec.proposal.inputs.map((i) => norm(i.active_ingredient || i.name)).filter((ai) => restrictedNames.some((n) => ai.includes(n) || n.includes(ai)));
    if (flagged.length) rec.verification = { ...rec.verification, regulatory_restricted: flagged };
  }
  const chemIdx = records.map((r, i) => ({ r, i })).filter(({ r }) => !r.reasons.length && (r.proposal.inputs.some(isChemical) || (r.verification as Record<string, unknown>).regulatory_restricted));
  const opinions = await secondOpinion(chemIdx.map(({ r, i }) => ({ id: i, p: r.proposal })), inputs, ctx.deadlineAt);
  for (const { r, i } of chemIdx) {
    const op = opinions.get(i);
    r.verification = { ...r.verification, second_opinion: op ? (op.ok ? "passed" : "failed") : "unavailable", second_opinion_note: op?.note ?? null };
    if (!r.rag_evidence.length) r.reasons.push("chemical_not_corroborated_by_corpus");
    if (!op || !op.ok) r.reasons.push(op ? "chemical_second_opinion_failed" : "chemical_second_opinion_unavailable");
  }
  const candidates: HarnessCandidate[] = [];
  records.forEach((rec, i) => {
    if (rec.reasons.length) return;
    rec.status = "verified";
    const stage = stageMap.get(norm(rec.proposal.stage_key))!;
    const c = candidateFromProposal(rec.proposal, rec, stage, transplantOffset, i, `${res.provider}/${res.model}`, harvestDas);
    rec.candidate_id = c.id; candidates.push(c);
  });
  const gaps = targets.filter((d) => !candidates.some((c) => c.domain === d)).map((d) => `LLM_PROPOSAL_UNVERIFIED:${d}`);
  return { candidates, proposals: records, gaps, trace: { version: ENRICHMENT_VERSION, provider: res.provider, model: res.model, targets, proposed: proposals.length, verified: candidates.length, rejected: records.length - candidates.length, elapsed_ms: Date.now() - startedAt } };
}

/** Persist every proposal (verified and rejected) for agronomist review / promotion. */
export async function recordProposals(supabase: SupabaseClient, records: ProposalRecord[], meta: { tenantId: string | null; farmerId: string | null; landId: string | null; scheduleId: string | null; inputs: ResolvedInputs; model: string | null }) {
  if (!records.length) return;
  const rows = records.map((r) => ({
    tenant_id: meta.tenantId, farmer_id: meta.farmerId, land_id: meta.landId, schedule_id: meta.scheduleId,
    crop_code: meta.inputs.cropCode, variety_id: meta.inputs.varietyId, cultivation_method: meta.inputs.cultivationMethod, region_code: meta.inputs.regionCode,
    stage_key: r.proposal.stage_key, domain: r.proposal.domain, task_type: r.proposal.phase === "NURSERY" ? "nursery" : (DOMAIN_TASK_TYPE[r.proposal.domain] ?? "advisory"),
    proposal: r.proposal, verification: r.verification, rag_evidence: r.rag_evidence, rejection_reasons: r.reasons,
    status: r.status === "verified" ? "verified" : "pending_review", model: meta.model, candidate_id: r.candidate_id ?? null,
  }));
  const { error } = await supabase.from("schedule_llm_proposals").insert(rows);
  if (error) console.warn("[llm-candidates] proposal logging failed:", error.message);
}
