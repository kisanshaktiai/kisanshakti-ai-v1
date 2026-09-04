// CHANGE LOG
// 2026-09-03 — Full Agronomic Evidence Pack integration: Harness now receives the SAME
//   ResolvedInputs, LandContext and selected stage graph used by baseline generation. No
//   second resolver, no synthetic variety/region/soil context. The evidence pack is built
//   once from the authoritative request-scoped context and passed into Harness explicitly.
//   Existing DB schema, baseline generator, RAG adapter and atomic persistence are preserved.
//
// Existing safety/DB-SSOT changes remain unchanged below.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  resolveInputs,
  AMBIGUOUS_CULTIVATION_METHOD,
  AMBIGUOUS_CROP_CYCLE,
  getCultivationMethodOptions,
  getCropCycleOptions,
} from "./db/resolve-inputs.ts";
import { generateBaseline, GENERATOR_VERSION } from "./generator/baseline-generator.ts";
import { narrateTasks } from "./generator/narrate.ts";
import { sanitizeTaskText, hasFarmerText } from "./generator/farmer-text.ts";
import { loadLandContext } from "./db/land-context.ts";
import { attachRagEvidence, type RagEvidenceSummary } from "./db/rag-evidence.ts";
import { isFlagEnabled } from "../_shared/featureFlags.ts";
import { applyScheduleHarness } from "./harness/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token, x-ai-provider",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startTime = Date.now();
  let landId: string | null = null;
  let cropName: string | null = null;
  let farmerId: string | null = null;
  let tenantId: string | null = null;
  let resolvedCropCode: string | null = null;
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const body = await req.json();
    landId = body?.landId ?? null;
    cropName = body?.cropName ?? null;
    const cropVariety = body?.cropVariety ?? null;
    const cultivationMethod = body?.cultivationMethod ?? null;
    const isReadyMadePlant = body?.isReadyMadePlant === true;
    const cropCycle = body?.cropCycle ?? null;
    const sowingDate = body?.sowingDate ?? null;
    const transplantDate = body?.transplantDate ?? null;
    const farmingType = body?.farmingType ?? null;
    const backdatedConsent = body?.backdatedConsent ?? false;
    const language = body?.language ?? "en";
    tenantId = req.headers.get("x-tenant-id") || "";
    farmerId = req.headers.get("x-farmer-id") || "";

    if (!landId || !cropName) return json({ error: "landId and cropName are required" }, 400);
    if (!tenantId || !farmerId) return json({ error: "Missing tenant/farmer context" }, 401);

    const { data: ownedLand } = await supabase
      .from("lands")
      .select("id, farmer_id, tenant_id, lifecycle_status, active_schedule_id, current_crop, current_crop_id")
      .eq("id", landId)
      .maybeSingle();
    if (!ownedLand) return json({ error: "Land not found" }, 404);
    if (ownedLand.farmer_id !== farmerId || ownedLand.tenant_id !== tenantId) return json({ error: "Land does not belong to this farmer" }, 403);
    if (ownedLand.lifecycle_status === "CROP_ACTIVE") {
      return json({ success: false, error: "This land already has an active crop. Confirm the previous harvest before starting a new crop schedule.", code: "LAND_NOT_AVAILABLE", landId, currentCrop: ownedLand.current_crop ?? null, activeScheduleId: ownedLand.active_schedule_id ?? null }, 200);
    }

    const inputs = await resolveInputs(supabase, {
      landId, cropName, cropVariety, cultivationMethod, isReadyMadePlant, cropCycle,
      sowingDate, transplantDate, language, farmingType,
    });
    inputs.language = language;
    const landContext = await loadLandContext(supabase, landId);
    if (landContext.gaps.length) inputs.gaps.push(...landContext.gaps);
    resolvedCropCode = inputs.cropCode || null;

    const { data: otherActive } = await supabase
      .from("crop_schedules")
      .select("id, crop_name, status")
      .eq("land_id", landId)
      .or("status.eq.active,is_active.eq.true");
    const normName = (s: unknown) => String(s ?? "").trim().toLowerCase();
    const requestedNames = new Set([inputs.cropLabel, cropName, inputs.cropCode].filter(Boolean).map(normName));
    const conflictingSchedules = (otherActive || []).filter((s: Record<string, unknown>) => !requestedNames.has(normName(s.crop_name)));
    let landCropConflict: string | null = null;
    if (ownedLand.current_crop_id && inputs.cropId && String(ownedLand.current_crop_id) !== String(inputs.cropId)) landCropConflict = String(ownedLand.current_crop_id);
    if (conflictingSchedules.length || landCropConflict) {
      return json({ success: false, error: "Land crop identity conflicts with the requested schedule. Establish the land's crop first — nothing was generated or overwritten.", code: "CROP_IDENTITY_CONFLICT", landId, requestedCropId: inputs.cropId, requestedCrop: inputs.cropLabel || cropName, landCurrentCropId: ownedLand.current_crop_id ?? null, conflictingActiveSchedules: conflictingSchedules.map((s: Record<string, unknown>) => ({ id: s.id, crop_name: s.crop_name })) }, 200);
    }

    if (!inputs.cropCode) return json({ error: "Crop could not be resolved to the crop master", cropName, gaps: inputs.gaps }, 422);
    if (!inputs.sowingDate) return json({ error: "Sowing date is required and was not found", gaps: inputs.gaps }, 422);
    if (inputs.cultivationMethod === AMBIGUOUS_CULTIVATION_METHOD) return json({ error: "Cultivation method is required for this crop", code: "CULTIVATION_METHOD_REQUIRED", cropCode: inputs.cropCode, options: await getCultivationMethodOptions(supabase, inputs.cropCode), gaps: inputs.gaps }, 422);
    if (inputs.cropCycle === AMBIGUOUS_CROP_CYCLE) return json({ error: "Crop cycle is required for this crop", code: "CROP_CYCLE_REQUIRED", cropCode: inputs.cropCode, options: await getCropCycleOptions(supabase, inputs.cropCode), gaps: inputs.gaps }, 422);

    const baseline = await generateBaseline(supabase, inputs);
    if (!baseline.tasks.length) return json({ error: "No schedule could be produced from the agronomic database for this crop", cropCode: inputs.cropCode, gaps: baseline.gaps, coverage: baseline.coverage }, 422);
    if (!baseline.coverage.stages) return json({ error: "No growth-stage graph is available for this crop and cultivation method", code: "STAGE_COVERAGE_MISSING", cropCode: inputs.cropCode, cultivationMethod: inputs.cultivationMethod, stageClockMethod: inputs.stageClockMethod, options: await getCultivationMethodOptions(supabase, inputs.cropCode), gaps: baseline.gaps, coverage: baseline.coverage }, 422);
    if (baseline.validation && baseline.validation.violations.length) return json({ error: "Generated schedule failed structural validation and was not persisted", code: "SCHEDULE_VALIDATION_FAILED", violations: baseline.validation.violations, warnings: baseline.validation.warnings, gaps: baseline.gaps }, 422);
    if (baseline.validation && baseline.validation.warnings.length) for (const w of baseline.validation.warnings) baseline.gaps.push(`validation_warning: ${w}`);

    let harnessTrace: Record<string, unknown> | null = null;
    try {
      const harnessFlag = await isFlagEnabled(supabase, "crop_schedule_harness_v2", { tenantId, farmerId });
      if (harnessFlag.enabled) {
        // FULL CONTEXT INTEGRATION: this is the same resolved request context and selected
        // phenology graph already used by baseline generation. Harness must never reconstruct
        // variety, region, soil, dates, method or land state from partial inputs.
        const evidencePack = await (async () => {
          const { buildAgronomicEvidencePack } = await import("./harness/evidence-pack.ts");
          const { getStages } = await import("./db/agronomy-repo.ts");
          const stages = await getStages(supabase, inputs.cropCode!, inputs.cropCycle, inputs.stageClockMethod ?? inputs.cultivationMethod);
          return buildAgronomicEvidencePack(supabase, inputs, stages, baseline.tasks);
        })();
        const harnessed = await applyScheduleHarness(baseline.tasks, {
          cropCode: inputs.cropCode,
          cultivationMethod: inputs.cultivationMethod,
          cropCycle: inputs.cropCycle,
          gaps: baseline.gaps,
          resolvedInputs: inputs,
          landContext,
          evidencePack,
        });
        if (!harnessed.result.applied || harnessed.result.status !== "READY") return json({ error: "Schedule harness failed closed before persistence", code: "HARNESS_VALIDATION_FAILED", trace: harnessed.result.trace }, 422);
        baseline.tasks.splice(0, baseline.tasks.length, ...harnessed.tasks);
        harnessTrace = harnessed.result.trace;
      }
    } catch (error) {
      console.error("[ai-smart-schedule] harness failed:", error);
      return json({ error: "Schedule harness execution failed before persistence", code: "HARNESS_FAILURE" }, 422);
    }

    let ragEvidence: RagEvidenceSummary | null = null;
    try {
      const ragFlag = await isFlagEnabled(supabase, "rag_schedule_evidence", { tenantId, farmerId });
      if (ragFlag.enabled) {
        ragEvidence = await attachRagEvidence(supabase, baseline.tasks, { cropCode: inputs.cropCode, cropLabel: inputs.cropLabel || cropName, regionCode: inputs.regionCode, tenantId, farmerId });
        baseline.coverage.rag_evidence = ragEvidence.tasks_evidenced > 0 && ragEvidence.tasks_no_evidence === 0 && ragEvidence.tasks_not_evaluated === 0;
        if (ragEvidence.tasks_no_evidence > 0) baseline.gaps.push(`rag_evidence: ${ragEvidence.tasks_no_evidence} task(s) have no corpus evidence (explicit NO_EVIDENCE)`);
      }
    } catch (e) { console.error("rag-evidence attachment failed (non-fatal):", e); }

    const sanitized = baseline.tasks.map((t) => sanitizeTaskText({ task_name: t.task_name, task_description: t.task_description, instructions: t.instructions, technical_details: t.technical_details }));
    baseline.tasks.forEach((t, i) => { t.task_name = sanitized[i].task_name || t.task_name; t.task_description = sanitized[i].task_description; t.instructions = sanitized[i].instructions; if (!hasFarmerText(sanitized[i])) baseline.gaps.push(`task_without_farmer_text:${t.task_type}`); });
    const HARD_DEADLINE_MS = 110_000;
    const narrationBudgetMs = HARD_DEADLINE_MS - (Date.now() - startTime) - 20_000;
    const narration = await narrateTasks(baseline.tasks.map((t) => ({ task_name: t.task_name, task_description: t.task_description, instructions: t.instructions })), language, narrationBudgetMs);
    const narrated = narration.tasks;
    if (!narration.narrated) { baseline.gaps.push(`narration_unavailable: ${narration.reason ?? "unknown"}`); baseline.coverage.narration = false; }
    else { if (narration.narratedCount < narration.totalCount) baseline.gaps.push(`narration_partial: ${narration.narratedCount}/${narration.totalCount}`); baseline.coverage.narration = narration.narratedCount === narration.totalCount; }

    const sow = new Date(inputs.sowingDate);
    const durationDays = baseline.totals.duration_days;
    const harvestDateStr = durationDays ? new Date(sow.getTime() + durationDays * 86400000).toISOString().split("T")[0] : null;
    const narratedIdx = new Set(narration.appliedIndices);
    const tasksToPersist = baseline.tasks.map((t, idx) => ({
      farmer_id: farmerId, tenant_id: tenantId,
      task_name: narrated[idx]?.task_name || t.task_name,
      task_description: narrated[idx]?.task_description || t.task_description,
      task_type: t.task_type,
      task_date: new Date(sow.getTime() + t.days_from_sowing * 86400000).toISOString().split("T")[0],
      projected_date: new Date(sow.getTime() + t.days_from_sowing * 86400000).toISOString().split("T")[0],
      days_from_sowing: t.days_from_sowing, anchor_type: t.anchor_type, anchor_stage: t.anchor_stage, gdd_target: t.gdd_target,
      stage_key: t.stage_key, stage_uuid: t.stage_uuid ?? null, stage_name: t.stage_name, stage_order: t.stage_order, priority: t.priority,
      weather_dependent: t.weather_dependent, status: "pending", sequence_order: idx + 1,
      instructions: narrated[idx]?.instructions || t.instructions, precautions: t.precautions ?? [],
      resources: { ...(t.resources ?? {}), ...(t.quantity ? { quantity: t.quantity } : {}), ...(t.recurrence ? { recurrence: t.recurrence } : {}), ...(sanitized[idx]?.technical_details?.length ? { technical_details: sanitized[idx].technical_details } : {}), ...(narratedIdx.has(idx) ? {} : { needs_translation: true, source_language: null, target_language: language }) },
      estimated_cost: t.estimated_cost, currency: "INR", rule_ids: t.rule_ids, trigger_rule_id: t.rule_ids[0] || null, confidence: t.confidence,
      source_refs: t.source_refs, language: narratedIdx.has(idx) ? language : null, is_pinned: false,
    }));
    const schedulePayload = {
      land_id: landId, farmer_id: farmerId, tenant_id: tenantId, crop_name: inputs.cropLabel || cropName, crop_variety: inputs.varietyName,
      variety_id: inputs.varietyId, cultivation_method: inputs.stageClockMethod ?? inputs.cultivationMethod, crop_cycle: inputs.cropCycle,
      sowing_date: inputs.sowingDate, transplant_date: inputs.transplantDate, expected_harvest_date: harvestDateStr, is_active: true, status: "active",
      generation_language: language, ai_model: narration.narrated ? `${narration.provider ?? "unknown"}/${narration.model ?? "unknown"} (narration only)` : "none",
      input_soil_data: landContext.soil, input_weather_data: landContext.weather, input_land_coordinates: landContext.coordinates, agro_climatic_zone: landContext.agroClimaticZone,
      calculated_for_area_acres: inputs.landAreaAcres, total_duration_days: durationDays, seed_quantity_kg: baseline.totals.seed_kg,
      fertilizer_n_kg: baseline.totals.n_kg, fertilizer_p_kg: baseline.totals.p_kg, fertilizer_k_kg: baseline.totals.k_kg, total_estimated_cost: baseline.totals.estimated_cost,
      state_region: inputs.state, district_name: inputs.district, farming_type: farmingType, tasks_total_count: baseline.tasks.length, tasks_completed_count: 0,
      backdated_consent: !!backdatedConsent, backdated_consent_at: backdatedConsent ? new Date().toISOString() : null,
      generation_params: {
        generator_version: GENERATOR_VERSION, resolved_inputs: inputs, harness: harnessTrace,
        narration: { requested_language: language, persisted_language: language, applied: narration.narrated, narrated_count: narration.narratedCount, total_count: narration.totalCount, reason: narration.reason ?? null },
        farming_policy: farmingType, land_context_gaps: landContext.gaps, ndvi_context: landContext.ndvi,
      },
      metadata: { coverage: baseline.coverage, missing_sections: Object.entries(baseline.coverage).filter(([, ok]) => ok === false).map(([k]) => k), gaps: baseline.gaps, provenance: baseline.provenance, rag_evidence: ragEvidence },
    };
    const landPayload = {
      current_crop: inputs.cropLabel || cropName, current_crop_variety_id: inputs.varietyId, planting_date: inputs.sowingDate, transplant_date: inputs.transplantDate,
      gdd_anchor_type: inputs.transplantDate ? "transplant" : "planting", gdd_anchor_date: inputs.transplantDate ?? inputs.sowingDate,
      current_gdd: null, gdd_last_computed_at: null, expected_harvest_date: harvestDateStr, crop_cycle: inputs.cropCycle,
    };
    const { data: persisted, error: persistError } = await supabase.rpc("persist_ai_crop_schedule_atomic", { p_schedule: schedulePayload, p_tasks: tasksToPersist, p_land: landPayload }).single();
    if (persistError || !persisted?.schedule_id) throw new Error(`Failed to persist schedule atomically: ${persistError?.message ?? "missing schedule result"}`);
    if (Number(persisted.task_count) !== tasksToPersist.length) throw new Error(`Atomic persistence task count mismatch: expected ${tasksToPersist.length}, got ${persisted.task_count}`);
    const savedSchedule = { id: persisted.schedule_id };
    if (farmingType) {
      const { error: fmErr } = await supabase.from("land_crops").update({ farming_type: farmingType }).eq("land_id", landId).eq("is_active", true);
      if (fmErr) console.warn({ event: "farming_type_sync_failed", landId, error: fmErr.message });
    }
    const missingSections = Object.entries(baseline.coverage).filter(([, ok]) => ok === false).map(([key]) => key);
    const missingSectionLabelKeys = missingSections.map((k) => `schedule.section_pending.${k}`);
    try {
      await supabase.from("edge_invocation_logs").insert({ function_name: "ai-smart-schedule", user_id: farmerId || null, payload: { landId, cropCode: inputs.cropCode, http_status: 200, task_count: baseline.tasks.length, gaps: baseline.gaps, coverage: baseline.coverage, execution_time_ms: Date.now() - startTime } });
    } catch (logErr) { console.warn("[ai-smart-schedule] edge_invocation_logs insert failed:", logErr); }
    return json({ success: true, scheduleId: savedSchedule.id, landId, cropCode: inputs.cropCode, cropName: inputs.cropLabel || cropName, translatedCropName: inputs.cropLabelLocal, varietyId: inputs.varietyId, cultivationMethod: inputs.cultivationMethod, sowingDate: inputs.sowingDate, language, totalTasks: baseline.tasks.length, totals: baseline.totals, coverage: baseline.coverage, missing_sections: missingSections, missing_section_label_keys: missingSectionLabelKeys, gaps: baseline.gaps, generatorVersion: GENERATOR_VERSION, harness: harnessTrace, narrationApplied: narration.narrated, executionTimeMs: Date.now() - startTime, generatedAt: new Date().toISOString() });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const landNotAvailable = errorMessage.includes("LAND_NOT_AVAILABLE");
    if (!landNotAvailable) console.error("❌ [ai-smart-schedule] Error:", error);
    try {
      const logClient = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
      await logClient.from("edge_invocation_logs").insert({ function_name: "ai-smart-schedule", user_id: farmerId || null, payload: { landId, cropCode: resolvedCropCode ?? cropName, http_status: landNotAvailable ? 200 : 500, domain_code: landNotAvailable ? "LAND_NOT_AVAILABLE" : null, task_count: 0, error: errorMessage, execution_time_ms: Date.now() - startTime } });
    } catch (logErr) { console.warn("[ai-smart-schedule] edge_invocation_logs insert failed:", logErr); }
    if (landNotAvailable) return json({ success: false, error: "This land already has an active crop. Confirm the previous harvest before starting a new crop schedule.", code: "LAND_NOT_AVAILABLE", landId, executionTimeMs: Date.now() - startTime }, 200);
    return json({ error: errorMessage || "Schedule generation failed", executionTimeMs: Date.now() - startTime }, 500);
  }
});
