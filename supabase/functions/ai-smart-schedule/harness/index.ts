// CHANGE LOG
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
import { requestPlan } from "./llm-v3.ts";
import { validatePlanIntent } from "./validator.ts";

const MAX_ATTEMPTS = 2;
const DEFAULT_BUDGET_MS = 40_000;
const MIN_ATTEMPT_MS = 8_000;

const fallback = (c: ScheduleHarnessContext, baselineTasks: BaselineTask[]): PlanIntent => {
  const requiredOrder = canonicalSequence(c.graph);
  const requiredRank = new Map(requiredOrder.map((id, i) => [id, i]));
  const baselineTypes = new Set(baselineTasks.map((t) => t.task_type));
  const optional = c.graph.nodes.filter((n) =>
    !n.required && n.materializable &&
    (n.default_status === "CONDITIONAL" || (n.default_status === "SCHEDULED" && !baselineTypes.has(n.task_type)))
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

function contextSnapshot(inputs: ResolvedInputs, landContext: LandContext): HarnessContextSnapshot {
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
}

const emptyLandContext: LandContext = { soil: null, weather: null, coordinates: null, agroClimaticZone: null, ndvi: null, gaps: [] };

export async function applyScheduleHarness(
  tasks: BaselineTask[],
  input: LegacyHarnessInput | (ScheduleHarnessContext & { budgetMs?: number }),
): Promise<HarnessExecution> {
  const startedAt = Date.now();
  const deadlineAt = startedAt + Math.max(0, input.budgetMs ?? DEFAULT_BUDGET_MS);
  const remaining = () => deadlineAt - Date.now();
  const isContext = "graph" in input && "evidencePack" in input;

  if (isContext) {
    const context = input as ScheduleHarnessContext;
    const graph = context.graph;
    let errors: string[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && remaining() >= MIN_ATTEMPT_MS; attempt++) {
      try {
        const r = await requestPlan(context, errors, { deadlineAt });
        const validationErrors = validatePlanIntent(r.plan, graph);
        if (!validationErrors.length && r.plan.status === "READY") {
          const materialized = materialize(tasks, context.evidencePack, r.plan, "llm_evidence_pack");
          return {
            tasks: materialized,
            result: {
              applied: true,
              status: "READY",
              plan: r.plan,
              selectedIds: r.plan.sequence
                .filter((x) => x.status === "SCHEDULED" || x.status === "CONDITIONAL")
                .map((x) => x.candidate_id),
              trace: {
                harness_version: HARNESS_VERSION,
                planner: "llm_evidence_pack",
                provider: r.provider,
                model: r.model,
                attempts: attempt,
                elapsed_ms: Date.now() - startedAt,
                baseline_candidate_count: tasks.length,
                evidence_candidate_count: context.evidencePack.candidates.length,
                materialized_candidate_count: materialized.length,
                domain_summary: context.evidencePack.domain_summary,
                domain_coverage: r.plan.domain_coverage ?? null,
                validation_errors: [],
              },
            },
          };
        }
        errors = validationErrors.length ? validationErrors : [`planner_status:${r.plan.status}`];
      } catch (error) {
        errors = [error instanceof Error ? error.message : String(error)];
        if (errors[0] === "MODEL_UNAVAILABLE" || errors[0] === "MODEL_TIMEOUT") break;
      }
    }
    const plan = fallback(context, tasks);
    const materialized = materialize(tasks, context.evidencePack, plan, "deterministic_fallback");
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
          attempts: MAX_ATTEMPTS,
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
    stages ??= await getStages(supabase, legacy.cropCode, legacy.cropCycle, legacy.resolvedInputs?.stageClockMethod ?? legacy.cultivationMethod);
    evidencePack = legacy.resolvedInputs
      ? await buildAgronomicEvidencePack(supabase, legacy.resolvedInputs, stages, tasks)
      : await buildSafeEvidencePack(legacy, tasks);
  }

  const snapshot: HarnessContextSnapshot | null = legacy.resolvedInputs
    ? contextSnapshot(legacy.resolvedInputs, legacy.landContext ?? emptyLandContext)
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
  };

  let errors: string[] = [];
  let provider: string | null = null;
  let model: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && remaining() >= MIN_ATTEMPT_MS; attempt++) {
    try {
      const r = await requestPlan(context, errors, { deadlineAt });
      provider = r.provider;
      model = r.model;
      const validationErrors = validatePlanIntent(r.plan, graph);
      if (!validationErrors.length && r.plan.status === "READY") {
        const materialized = materialize(tasks, evidencePack, r.plan, "llm_evidence_pack");
        return {
          tasks: materialized,
          result: {
            applied: true,
            status: "READY",
            plan: r.plan,
            selectedIds: r.plan.sequence
              .filter((x) => x.status === "SCHEDULED" || x.status === "CONDITIONAL")
              .map((x) => x.candidate_id),
            trace: {
              harness_version: HARNESS_VERSION,
              planner: "llm_evidence_pack",
              provider,
              model,
              attempts: attempt,
              elapsed_ms: Date.now() - startedAt,
              baseline_candidate_count: tasks.length,
              evidence_candidate_count: evidencePack.candidates.length,
              materialized_candidate_count: materialized.length,
              domain_summary: evidencePack.domain_summary,
              domain_coverage: r.plan.domain_coverage ?? null,
              context_integrated: Boolean(legacy.resolvedInputs),
              context_fields: snapshot ? Object.keys(snapshot) : [],
              validation_errors: [],
            },
          },
        };
      }
      errors = validationErrors.length ? validationErrors : [`planner_status:${r.plan.status}`];
    } catch (error) {
      errors = [error instanceof Error ? error.message : String(error)];
      if (errors[0] === "MODEL_UNAVAILABLE" || errors[0] === "MODEL_TIMEOUT") break;
    }
  }

  const plan = fallback(context, tasks);
  const materialized = materialize(tasks, evidencePack, plan, "deterministic_fallback");
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
        provider,
        model,
        attempts: MAX_ATTEMPTS,
        elapsed_ms: Date.now() - startedAt,
        baseline_candidate_count: tasks.length,
        evidence_candidate_count: evidencePack.candidates.length,
        materialized_candidate_count: materialized.length,
        domain_summary: evidencePack.domain_summary,
        context_integrated: Boolean(legacy.resolvedInputs),
        validation_errors: errors,
      },
    },
  };
}
