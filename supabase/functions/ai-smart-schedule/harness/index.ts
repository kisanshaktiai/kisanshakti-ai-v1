// CHANGE LOG
// 2026-09-27 — AI model SSOT: applyScheduleHarness passes its optional `ai` context (service-role client,
//   farmer) to requestPlan, whose model chain now comes from the AI model registry (schedule.compose).
// 2026-09-08 — ONE CARD PER STAGE for water and harvest: DB rule cards of the same type and stage as a
//   baseline card fold into it as instructions (foldSameStageRuleCards), so a stage shows one
//   irrigation card and one harvest card, each carrying the DB rule's practice text.
// 2026-09-08 — CALENDAR LEGIBILITY. Conditional (OBSERVATION-triggered) candidates are no longer
//   materializable (evidence-pack), so materialize()/fallback() stop emitting them as dated cards
//   — this alone removes the ~29-card pile-up on the tillering start day. Their watch briefs are
//   folded into the matching stage's scouting (monitoring) task via foldWatchBriefs(), so the
//   farmer sees ONE "scout this stage; if you see X, do Y" card per stage instead of dozens.
//   Deterministic fallback and the required-baseline contract are unchanged.
// 2026-09-05 — Deterministic fallback completeness. The fallback used to retain ONLY required
//   baseline candidates (canonicalSequence), so every evidence-pack candidate — dosed pest/disease/
//   weed treatments, nutrition corrections, organic inputs — was discarded whenever the planner did
//   not complete (verified: 41 candidates → 0 materialized on live schedules). The fallback now also
//   retains candidates whose classification is already deterministic in the DB: every CONDITIONAL
//   candidate (a trigger, never a forced application) and every SCHEDULED candidate whose task type
//   the baseline does not already cover. Required baseline candidates keep first priority; nothing
//   is invented; the LLM is not involved in this path.
// 2026-09-05 — Time-budgeted Harness. applyScheduleHarness accepts `budgetMs`; attempts stop as
//   soon as the remaining time cannot fit a useful planner call, and the deadline is passed
//   down to requestPlan so a slow provider can never consume the narration budget that index.ts
//   reserves for the farmer. The plan's per-candidate status and reason are now materialized
//   onto the task (`resources.harness`) so every persisted task carries the planner's
//   classification and the evidence-citing reason behind it. Fallback semantics unchanged:
//   required baseline candidates are always retained; nothing invents agronomy.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import type { BaselineTask } from "../generator/baseline-generator.ts";
import type { AgronomicEvidencePack } from "./evidence-pack.ts";
import { buildAgronomicEvidencePack } from "./evidence-pack.ts";
import { getStages } from "../db/agronomy-repo.ts";
import type { ResolvedInputs } from "../db/resolve-inputs.ts";
import type { LandContext } from "../db/land-context.ts";
import {
  HARNESS_VERSION,
  type HarnessContextSnapshot,
  type HarnessExecution,
  type PlanIntent,
  type PlanItem,
  type ScheduleHarnessContext,
} from "./types.ts";
import { buildCandidateGraph, canonicalSequence } from "./candidate-graph.ts";
import { requestPlan, type PlannerAIContext } from "./llm-v3.ts";
import { runPlanner } from "./plan-assembly.ts";
import { validatePlanIntent } from "./validator.ts";
import { plannerVarietyView, type VarietyProfile } from "../db/variety-profile.ts";
import { foldWatchBriefs } from "../generator/watch-relevance.ts";

const MAX_ATTEMPTS = 2;
const DEFAULT_BUDGET_MS = 40_000;
const MIN_ATTEMPT_MS = 8_000;

const fallback = (c: ScheduleHarnessContext, baselineTasks: BaselineTask[]): PlanIntent => {
  const requiredOrder = canonicalSequence(c.graph);
  const requiredRank = new Map(requiredOrder.map((id, i) => [id, i]));
  const baselineTypes = new Set(baselineTasks.map((t) => t.task_type));
  // Conditional candidates are non-materializable (they fold into scouting), so only
  // SCHEDULED candidates for a domain the baseline does not already cover are added here.
  const optional = c.graph.nodes.filter((n) =>
    !n.required && n.materializable && n.default_status === "SCHEDULED" && !baselineTypes.has(n.task_type)
  );
  const nodes = [
    ...requiredOrder.map((id) => c.graph.nodes.find((n) => n.id === id)!).filter(Boolean),
    ...optional,
  ].sort((a, b) =>
    a.days_from_sowing - b.days_from_sowing ||
    (requiredRank.has(a.id) ? 0 : 1) - (requiredRank.has(b.id) ? 0 : 1) ||
    a.stage_order - b.stage_order ||
    a.id.localeCompare(b.id)
  );
  return {
    schema_version: "schedule_plan_intent_v3",
    status: "READY",
    sequence: nodes.map((n, i) => ({
      candidate_id: n.id,
      sequence_order: i + 1,
      status: n.required ? ("SCHEDULED" as const) : (n.default_status as PlanItem["status"]),
      reason: n.required
        ? "Deterministic fallback retained the database-backed baseline."
        : n.default_status === "CONDITIONAL"
          ? "Deterministic fallback retained a DB-classified conditional treatment; it applies only when its trigger is met."
          : "Deterministic fallback retained a DB-scheduled candidate for a domain the baseline does not cover.",
    })),
    uncertainties: c.gaps,
    reasoning_summary: "Deterministic fallback preserved the required database-backed baseline; optional evidence candidates were not auto-applied by a model — only DB-classified CONDITIONAL candidates and SCHEDULED candidates for uncovered domains were retained.",
  };
};

function contextSnapshot(inputs: ResolvedInputs, landContext: LandContext, varietyProfile: VarietyProfile | null = null): HarnessContextSnapshot {
  return {
    land_area_acres: inputs.landAreaAcres,
    land_area_ha: inputs.landAreaHa,
    state: inputs.state,
    district: inputs.district,
    region_code: inputs.regionCode,
    soil_fertility_class: inputs.soilFertilityClass,
    soil_test_id: inputs.soilTestId,
    variety_id: inputs.varietyId,
    variety_name: inputs.varietyName,
    cultivation_method: inputs.cultivationMethod,
    stage_clock_method: inputs.stageClockMethod,
    crop_cycle: inputs.cropCycle,
    sowing_date: inputs.sowingDate,
    transplant_date: inputs.transplantDate,
    language: inputs.language ?? null,
    farming_policy: inputs.farmingPolicy ?? null,
    soil: landContext.soil,
    weather: landContext.weather,
    ndvi: landContext.ndvi,
    coordinates: landContext.coordinates,
    agro_climatic_zone: landContext.agroClimaticZone,
    variety_profile: varietyProfile ? plannerVarietyView(varietyProfile) : null,
  };
}

/** Attach the planner's classification to the task without touching any agronomic field. */
const withPlanItem = (task: BaselineTask, item: PlanItem, planner: string): BaselineTask => ({
  ...task,
  resources: {
    ...(task.resources ?? {}),
    harness: { planner, status: item.status ?? "SCHEDULED", reason: item.reason ?? null, sequence_order: item.sequence_order },
  },
});

/** One card per stage for water and harvest: a DB rule card of the same task_type and stage as a
 *  baseline card (e.g. "keep 5 cm standing water, cyclic irrigation" beside the guideline cadence
 *  card; "harvest when 80% panicles are straw-coloured" beside the harvest card) is folded into the
 *  baseline card as instructions, so the farmer reads one card, not two contradicting ones. */
const FOLDABLE_TYPES = new Set(["irrigation", "harvest", "post_harvest"]);
function foldSameStageRuleCards(tasks: BaselineTask[]): BaselineTask[] {
  const keyOf = (t: BaselineTask) => `${t.task_type}|${String(t.stage_key ?? t.anchor_stage ?? t.days_from_sowing)}`;
  const isBaseline = (t: BaselineTask) => { const s = (t.resources as Record<string, unknown> | undefined)?.requirement_semantics; return s === "BASELINE" || s === "BASELINE_WITHDRAWAL" || s == null && t.rule_ids.length === 0; };
  const anchors = new Map<string, BaselineTask>();
  for (const t of tasks) if (FOLDABLE_TYPES.has(t.task_type) && isBaseline(t) && !anchors.has(keyOf(t))) anchors.set(keyOf(t), t);
  if (!anchors.size) return tasks;
  const out: BaselineTask[] = [];
  for (const t of tasks) {
    const anchor = FOLDABLE_TYPES.has(t.task_type) && !isBaseline(t) ? anchors.get(keyOf(t)) : undefined;
    if (!anchor || anchor === t) { out.push(t); continue; }
    const text = [t.task_description, ...(t.instructions ?? [])].map((x) => String(x ?? "").trim()).filter(Boolean);
    anchor.instructions = [...(anchor.instructions ?? []), ...text.filter((x) => !(anchor.instructions ?? []).includes(x))];
    anchor.rule_ids = [...new Set([...(anchor.rule_ids ?? []), ...(t.rule_ids ?? [])])];
    anchor.source_refs = [...(anchor.source_refs ?? []), ...(t.source_refs ?? [])];
    const res = (anchor.resources ??= {}) as Record<string, unknown>;
    res.folded_rule_cards = [...((res.folded_rule_cards as unknown[]) ?? []), { task_name: t.task_name, rule_ids: t.rule_ids }];
  }
  return out;
}

const materialize = (
  tasks: BaselineTask[],
  evidence: AgronomicEvidencePack,
  plan: PlanIntent,
  planner: string,
): BaselineTask[] => {
  const baselineMap = new Map(tasks.map((t, i) => [`task_${String(i + 1).padStart(4, "0")}`, t]));
  const evidenceMap = new Map(
    evidence.candidates
      .filter((c) => c.materializable)
      .map((c) => [c.id, c.task]),
  );

  return [...plan.sequence]
    .filter((x) => {
      if (baselineMap.has(x.candidate_id)) return true;
      if (x.status !== "SCHEDULED" && x.status !== "CONDITIONAL") return false;
      return evidenceMap.has(x.candidate_id);
    })
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .map((x) => {
      const task = baselineMap.get(x.candidate_id) ?? evidenceMap.get(x.candidate_id);
      return task ? withPlanItem(task, x, planner) : undefined;
    })
    .filter((t): t is BaselineTask => Boolean(t));
};

/**
 * Compatibility path only. Production index.ts supplies the complete resolved context.
 * This path exists so older callers cannot accidentally invent variety/region/soil data.
 */
async function buildSafeEvidencePack(
  input: { cropCode: string; cultivationMethod: string | null; cropCycle: string | null; gaps: string[] },
  tasks: BaselineTask[],
): Promise<AgronomicEvidencePack> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
  const stages = await getStages(supabase, input.cropCode, input.cropCycle, input.cultivationMethod);
  const minimal: ResolvedInputs = {
    cropCode: input.cropCode,
    cropId: null,
    cropLabel: null,
    cropLabelLocal: null,
    varietyId: null,
    varietyName: null,
    varietyNameLocal: null,
    cultivationMethod: input.cultivationMethod,
    stageClockMethod: input.cultivationMethod,
    cropCycle: input.cropCycle,
    landAreaAcres: null,
    landAreaHa: null,
    state: null,
    district: null,
    regionCode: null,
    soilFertilityClass: null,
    soilTestId: null,
    sowingDate: null,
    transplantDate: null,
    language: "en",
    farmingPolicy: null,
    gaps: input.gaps,
    provenance: {},
  };
  return buildAgronomicEvidencePack(supabase, minimal, stages, tasks);
}

interface LegacyHarnessInput {
  cropCode: string;
  cultivationMethod: string | null;
  cropCycle: string | null;
  gaps: string[];
  resolvedInputs?: ResolvedInputs;
  landContext?: LandContext;
  stages?: Awaited<ReturnType<typeof getStages>>;
  evidencePack?: AgronomicEvidencePack;
  /** Wall-clock budget for the planner. index.ts derives it from its global deadline. */
  budgetMs?: number;
  /** 2026-09-27 — AI model registry + usage ledger context for the planner call (service-role client, farmer). */
  ai?: PlannerAIContext;
  /** 2026-11-13 — crop + variety dossier built once by index.ts and shared with the composer and sweeper. */
  varietyProfile?: VarietyProfile | null;
}

const emptyLandContext: LandContext = { soil: null, weather: null, coordinates: null, agroClimaticZone: null, ndvi: null, gaps: [] };

export async function applyScheduleHarness(
  tasks: BaselineTask[],
  input: LegacyHarnessInput | (ScheduleHarnessContext & { budgetMs?: number; ai?: PlannerAIContext }),
): Promise<HarnessExecution> {
  const startedAt = Date.now();
  const deadlineAt = startedAt + Math.max(0, input.budgetMs ?? DEFAULT_BUDGET_MS);
  const remaining = () => deadlineAt - Date.now();
  const isContext = "graph" in input && "evidencePack" in input;

  if (isContext) {
    const context = input as ScheduleHarnessContext;
    const graph = context.graph;
    // 2026-11-12: bounded plan → validate → repair loop lives in plan-assembly.runPlanner (pure,
    // regression-tested with an injected planner). The trace now reports what really happened.
    let providerAttempts: unknown = null;
    const outcome = await runPlanner(graph, async (repairErrors) => {
      try { return await requestPlan(context, repairErrors, { deadlineAt, ai: input.ai }); }
      catch (error) { providerAttempts = (error as { provider_attempts?: unknown })?.provider_attempts ?? providerAttempts; throw error; }
    }, validatePlanIntent, { maxAttempts: MAX_ATTEMPTS, minAttemptMs: MIN_ATTEMPT_MS, remainingMs: remaining });
    if (outcome.ok) {
      const materialized = foldSameStageRuleCards(foldWatchBriefs(materialize(tasks, context.evidencePack, outcome.plan, "llm_evidence_pack"), context.evidencePack, context.varietyProfile ?? null));
      return {
        tasks: materialized,
        result: {
          applied: true,
          status: "READY",
          plan: outcome.plan,
          selectedIds: outcome.plan.sequence
            .filter((x) => x.status === "SCHEDULED" || x.status === "CONDITIONAL")
            .map((x) => x.candidate_id),
          trace: {
            harness_version: HARNESS_VERSION,
            planner: "llm_evidence_pack",
            provider: outcome.provider,
            model: outcome.model,
            attempts: outcome.attempts,
            elapsed_ms: Date.now() - startedAt,
            baseline_candidate_count: tasks.length,
            evidence_candidate_count: context.evidencePack.candidates.length,
            materialized_candidate_count: materialized.length,
            domain_summary: context.evidencePack.domain_summary,
            domain_coverage: outcome.plan.domain_coverage ?? null,
            validation_errors: [],
          },
        },
      };
    }
    const errors = outcome.errors;
    const plan = fallback(context, tasks);
    const materialized = foldSameStageRuleCards(foldWatchBriefs(materialize(tasks, context.evidencePack, plan, "deterministic_fallback"), context.evidencePack, context.varietyProfile ?? null));
    return {
      tasks: materialized,
      result: {
        applied: true,
        status: "READY",
        plan,
        selectedIds: plan.sequence.map((x) => x.candidate_id),
        trace: {
          harness_version: HARNESS_VERSION,
          planner: "deterministic_fallback",
          attempts: outcome.attempts,
          fallback_reason: errors[0] ?? "unknown",
          provider_attempts: providerAttempts,
          budget_ms: Math.max(0, input.budgetMs ?? DEFAULT_BUDGET_MS),
          elapsed_ms: Date.now() - startedAt,
          baseline_candidate_count: tasks.length,
          evidence_candidate_count: context.evidencePack.candidates.length,
          materialized_candidate_count: materialized.length,
          domain_summary: context.evidencePack.domain_summary,
          validation_errors: errors,
        },
      },
    };
  }

  const legacy = input as LegacyHarnessInput;

  let evidencePack = legacy.evidencePack;
  let stages = legacy.stages;
  if (!evidencePack) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );
    stages ??= await getStages(supabase, legacy.cropCode, legacy.cropCycle, legacy.resolvedInputs?.stageClockMethod ?? legacy.cultivationMethod, legacy.resolvedInputs?.varietyId ?? null);
    evidencePack = legacy.resolvedInputs
      ? await buildAgronomicEvidencePack(supabase, legacy.resolvedInputs, stages, tasks)
      : await buildSafeEvidencePack(legacy, tasks);
  }

  const snapshot: HarnessContextSnapshot | null = legacy.resolvedInputs
    ? contextSnapshot(legacy.resolvedInputs, legacy.landContext ?? emptyLandContext, legacy.varietyProfile ?? null)
    : null;

  const graph = buildCandidateGraph(tasks, evidencePack.candidates);
  const context: ScheduleHarnessContext = {
    cropCode: legacy.cropCode,
    cultivationMethod: legacy.resolvedInputs?.cultivationMethod ?? legacy.cultivationMethod,
    cropCycle: legacy.resolvedInputs?.cropCycle ?? legacy.cropCycle,
    gaps: [...legacy.gaps, ...evidencePack.gaps],
    graph,
    evidencePack,
    contextSnapshot: snapshot,
    varietyProfile: legacy.varietyProfile ?? null,
  };

  // 2026-11-13 — ONE planner path. The legacy input shape (what index.ts passes) used to run its
  // own copy of the plan -> validate loop with a thin trace, so the production trace could not show
  // why the planner fell back and the loop never benefited from runPlanner's fixes. It now builds
  // the same context object and delegates to the context branch above; only the context-integration
  // fields are added to the trace here.
  const executed = await applyScheduleHarness(tasks, { ...context, budgetMs: Math.max(0, remaining()), ai: input.ai });
  executed.result.trace = {
    ...executed.result.trace,
    context_integrated: Boolean(legacy.resolvedInputs),
    context_fields: snapshot ? Object.keys(snapshot) : [],
  };
  return executed;
}
