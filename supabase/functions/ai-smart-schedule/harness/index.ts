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
  type ScheduleHarnessContext,
} from "./types.ts";
import { buildCandidateGraph, canonicalSequence } from "./candidate-graph.ts";
import { requestPlan } from "./llm-v3.ts";
import { validatePlanIntent } from "./validator.ts";

const MAX_ATTEMPTS = 2;

const fallback = (c: ScheduleHarnessContext): PlanIntent => ({
  schema_version: "schedule_plan_intent_v3",
  status: "READY",
  sequence: canonicalSequence(c.graph).map((candidate_id, i) => ({
    candidate_id,
    sequence_order: i + 1,
    status: "SCHEDULED" as const,
    reason: "Deterministic fallback retained the database-backed baseline.",
  })),
  uncertainties: c.gaps,
  reasoning_summary: "Deterministic fallback preserved the required database-backed baseline; optional evidence candidates were not auto-applied.",
});

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

const materialize = (
  tasks: BaselineTask[],
  evidence: AgronomicEvidencePack,
  plan: PlanIntent,
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
    .map((x) => baselineMap.get(x.candidate_id) ?? evidenceMap.get(x.candidate_id))
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

export async function applyScheduleHarness(
  tasks: BaselineTask[],
  input:
    | {
        cropCode: string;
        cultivationMethod: string | null;
        cropCycle: string | null;
        gaps: string[];
        resolvedInputs?: ResolvedInputs;
        landContext?: LandContext;
        stages?: Awaited<ReturnType<typeof getStages>>;
        evidencePack?: AgronomicEvidencePack;
      }
    | ScheduleHarnessContext,
): Promise<HarnessExecution> {
  const isContext = "graph" in input && "evidencePack" in input;
  if (isContext) {
    const context = input as ScheduleHarnessContext;
    const graph = context.graph;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const r = await requestPlan(context, []);
        const errors = validatePlanIntent(r.plan, graph);
        if (!errors.length && r.plan.status === "READY") {
          const materialized = materialize(tasks, context.evidencePack, r.plan);
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
                baseline_candidate_count: tasks.length,
                evidence_candidate_count: context.evidencePack.candidates.length,
                materialized_candidate_count: materialized.length,
                domain_summary: context.evidencePack.domain_summary,
                validation_errors: [],
              },
            },
          };
        }
      } catch {
        // Rebuild below into the deterministic fallback. No model failure can create agronomy.
      }
    }
    const plan = fallback(context);
    return {
      tasks: materialize(tasks, context.evidencePack, plan),
      result: {
        applied: true,
        status: "READY",
        plan,
        selectedIds: plan.sequence.map((x) => x.candidate_id),
        trace: {
          harness_version: HARNESS_VERSION,
          planner: "deterministic_fallback",
          attempts: MAX_ATTEMPTS,
          baseline_candidate_count: tasks.length,
          evidence_candidate_count: context.evidencePack.candidates.length,
          materialized_candidate_count: tasks.length,
          domain_summary: context.evidencePack.domain_summary,
        },
      },
    };
  }

  const legacy = input as {
    cropCode: string;
    cultivationMethod: string | null;
    cropCycle: string | null;
    gaps: string[];
    resolvedInputs?: ResolvedInputs;
    landContext?: LandContext;
    stages?: Awaited<ReturnType<typeof getStages>>;
    evidencePack?: AgronomicEvidencePack;
  };

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
    ? contextSnapshot(
        legacy.resolvedInputs,
        legacy.landContext ?? {
          soil: null,
          weather: null,
          coordinates: null,
          agroClimaticZone: null,
          ndvi: null,
          gaps: [],
        },
      )
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
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const r = await requestPlan(context, errors);
      provider = r.provider;
      model = r.model;
      const validationErrors = validatePlanIntent(r.plan, graph);
      if (!validationErrors.length && r.plan.status === "READY") {
        const materialized = materialize(tasks, evidencePack, r.plan);
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
              baseline_candidate_count: tasks.length,
              evidence_candidate_count: evidencePack.candidates.length,
              materialized_candidate_count: materialized.length,
              domain_summary: evidencePack.domain_summary,
              context_integrated: Boolean(legacy.resolvedInputs),
              context_fields: legacy.resolvedInputs
                ? Object.keys(contextSnapshot(legacy.resolvedInputs, legacy.landContext ?? {
                    soil: null, weather: null, coordinates: null, agroClimaticZone: null, ndvi: null, gaps: [],
                  }))
                : [],
              validation_errors: [],
            },
          },
        };
      }
      errors = validationErrors.length ? validationErrors : [`planner_status:${r.plan.status}`];
    } catch (error) {
      errors = [error instanceof Error ? error.message : String(error)];
      if (errors[0] === "MODEL_UNAVAILABLE") break;
    }
  }

  const plan = fallback(context);
  const materialized = materialize(tasks, evidencePack, plan);
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
