// CHANGE LOG
// 2026-08-30 — P0-RC5 (crop biological stage engine audit): a new cycle re-anchors the
//   THERMAL clock too. lands.gdd_anchor_date is sticky in accumulate_gdd_for_land
//   ("respect an existing anchor; only derive when NULL"), so writing planting_date
//   without the anchor left the GDD sum running from the previous cycle (live: 8897e53d
//   anchored 2026-05-25 vs planting_date 2026-06-15 → +21 phantom days, premature GDD
//   stage transitions). The anchor follows the accumulator's own precedence
//   (transplant → planting); cumulative GDD is rebuilt from it by the 6-hourly cron.
// 2026-08-28 — P0-1/P2 (forensic implementation prompt): (1) crop-identity SSOT gate after
//   input resolution — generation fails closed as typed CROP_IDENTITY_CONFLICT (HTTP 200,
//   same convention as LAND_NOT_AVAILABLE) when another ACTIVE schedule on the land carries
//   a different crop, or when lands.current_crop_id (FK → crops, owned by the land workflow,
//   never written here) resolves to a different crop than requested. Nothing is overwritten;
//   the caller must establish land crop identity first. Verified live trigger case: land
//   8897e53d holds active Rice AND Sugarcane schedules with current_crop_id = sugarcane.
//   (2) pre-persistence validation gate: baseline.validation violations (stage-graph
//   membership, provenance, DAS bounds) block persistence with 422
//   SCHEDULE_VALIDATION_FAILED — a structurally invalid schedule can never become ACTIVE.
// 2026-08-28 — P0 counter-audit fixes: (1) the isReadyMadePlant → 'transplanted' literal is
//   removed — the flag is forwarded to resolveInputs and resolved through
//   cultivation_method_master.requires_nursery ∩ the crop's stage-graph methods (DB metadata,
//   crop-agnostic). (2) New 422 CROP_CYCLE_REQUIRED with DB-derived cycle options when the
//   crop's stage graph defines multiple real cycles and none was chosen (sugarcane
//   plant vs ratoon) — mirrors the cultivation-method pattern; the old resolver guessed 'plant'.
// 2026-08-28 — P0-A: (1) hard visible failure when the stage graph is empty — 422
//   STAGE_COVERAGE_MISSING with DB-derived method options; a stage-free schedule is never
//   persisted (the live rice direct_seeded_dry stages=false schedule is the proven case).
//   (2) crop_schedules.cultivation_method now persists the CANONICAL stage-clock method
//   (inputs.stageClockMethod) because resolve_crop_phenology & the nightly phenology cron
//   exact-match the stored value as SSOT; the farmer's selected child method is preserved
//   verbatim inside generation_params.resolved_inputs.cultivationMethod.
// 2026-08-28 — P1 (audit Phase 2): flag-gated (`rag_schedule_evidence`) RAG evidence
//   attachment via db/rag-evidence.ts, AFTER deterministic baseline generation and
//   BEFORE narration. Non-blocking: corpus gaps become explicit NO_EVIDENCE tags and
//   a `rag_evidence` coverage entry — never invented content, never an abort.
// 2026-08-24 17:47 UTC — P0: accept isReadyMadePlant as the transplanted cultivation method and
//   422 CULTIVATION_METHOD_REQUIRED (with DB-derived options) when the crop defines several.
// 2026-08-20 01:35 UTC — Return LAND_NOT_AVAILABLE as a typed domain result over HTTP 200;
//   Supabase invoke treats every non-2xx response as a runtime FunctionsHttpError, which caused
//   an expected active-crop conflict to be reported as a blank-screen edge-function failure.
// 2026-08-19 19:08 UTC — Normalize LAND_NOT_AVAILABLE errors in the outer boundary so
//   concurrent lifecycle changes always return an expected 409 instead of a fatal 500.
// 2026-08-18 18:20 UTC — Phase A: persist stage_uuid (crop_stage_master FK) on inserted tasks.
// 2026-08-18 17:58 UTC — PROMPT 1.6: insert an edge_invocation_logs row on both success and
//   error paths (function_name, user_id, payload={landId,cropCode,http_status,task_count,gaps,
//   coverage,execution_time_ms}); wrapped so a logging failure never breaks generation.
// 2026-08-18 15:45 UTC — success response (and crop_schedules.metadata) now carries missing_sections +
//   i18n label keys so partial schedules render pending sections instead of silent gaps.
// 2026-08-17 14:10 UTC — Phases 1/2/6: replaced the legacy 4.5k-line generator (hardcoded seed
//   rates, NPK targets, labor rates, product lists, IPM thresholds) with the DB-SSOT pipeline:
//   resolve-inputs -> baseline-generator -> narrate. LLM is narration-only.

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
import { attachRagEvidence, type RagEvidenceSummary } from "./db/rag-evidence.ts";
import { isFlagEnabled } from "../_shared/featureFlags.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token, x-ai-provider",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  // Hoisted so the catch-block observability log can read them.
  let landId: string | null = null;
  let cropName: string | null = null;
  let farmerId: string | null = null;
  let tenantId: string | null = null;
  let resolvedCropCode: string | null = null;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const body = await req.json();
    landId = body?.landId ?? null;
    cropName = body?.cropName ?? null;
    const cropVariety = body?.cropVariety ?? null;
    const cultivationMethod = body?.cultivationMethod ?? null;
    // "Ready-made plant" is resolved inside resolveInputs from cultivation_method_master
    // metadata (requires_nursery ∩ the crop's stage-graph methods) — never a literal here.
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

    // Ownership: the land must belong to this farmer + tenant
    const { data: ownedLand } = await supabase
      .from("lands")
      .select("id, farmer_id, tenant_id, lifecycle_status, active_schedule_id, current_crop, current_crop_id")
      .eq("id", landId)
      .maybeSingle();
    if (!ownedLand) return json({ error: "Land not found" }, 404);
    if (ownedLand.farmer_id !== farmerId || ownedLand.tenant_id !== tenantId) {
      return json({ error: "Land does not belong to this farmer" }, 403);
    }

    // Fail fast instead of burning ~45s of generation only to hit the
    // LAND_NOT_AVAILABLE guard at insert time. This is an expected domain result,
    // not a transport failure: Supabase invoke turns any non-2xx status into a
    // FunctionsHttpError before the client can consume the typed result.
    if (ownedLand.lifecycle_status === "CROP_ACTIVE") {
      return json(
        {
          success: false,
          error:
            "This land already has an active crop. Confirm the previous harvest before starting a new crop schedule.",
          code: "LAND_NOT_AVAILABLE",
          landId,
          currentCrop: ownedLand.current_crop ?? null,
          activeScheduleId: ownedLand.active_schedule_id ?? null,
        },
        200,
      );
    }


    // ── PHASE 1: resolve farmer inputs to database IDs ──────────────────────
    const inputs = await resolveInputs(supabase, {
      landId,
      cropName,
      cropVariety,
      cultivationMethod,
      isReadyMadePlant,
      cropCycle,
      sowingDate,
      transplantDate,
      language,
    });

    resolvedCropCode = inputs.cropCode || null;

    // ── P0-1: crop-identity SSOT gate (fail closed, overwrite nothing) ──────
    // (a) Another ACTIVE schedule on this land for a DIFFERENT crop.
    const { data: otherActive } = await supabase
      .from("crop_schedules")
      .select("id, crop_name, status")
      .eq("land_id", landId)
      .or("status.eq.active,is_active.eq.true");
    const normName = (s: unknown) => String(s ?? "").trim().toLowerCase();
    const requestedNames = new Set(
      [inputs.cropLabel, cropName, inputs.cropCode].filter(Boolean).map(normName),
    );
    const conflictingSchedules = (otherActive || []).filter(
      (s: Record<string, unknown>) => !requestedNames.has(normName(s.crop_name)),
    );
    // (b) The land's own crop FK (crops.id), when set, must match the requested crop.
    let landCropConflict: string | null = null;
    if (ownedLand.current_crop_id && inputs.cropId && String(ownedLand.current_crop_id) !== String(inputs.cropId)) {
      landCropConflict = String(ownedLand.current_crop_id);
    }
    if (conflictingSchedules.length || landCropConflict) {
      return json(
        {
          success: false,
          error:
            "Land crop identity conflicts with the requested schedule. Establish the land's crop first — nothing was generated or overwritten.",
          code: "CROP_IDENTITY_CONFLICT",
          landId,
          requestedCropId: inputs.cropId,
          requestedCrop: inputs.cropLabel || cropName,
          landCurrentCropId: ownedLand.current_crop_id ?? null,
          conflictingActiveSchedules: conflictingSchedules.map((s: Record<string, unknown>) => ({
            id: s.id,
            crop_name: s.crop_name,
          })),
        },
        200,
      );
    }


    if (!inputs.cropCode) {
      return json(
        { error: "Crop could not be resolved to the crop master", cropName, gaps: inputs.gaps },
        422,
      );
    }
    if (!inputs.sowingDate) {
      return json({ error: "Sowing date is required and was not found", gaps: inputs.gaps }, 422);
    }
    // Cultivation method is as structural as the sowing date for any two-method crop
    // (rice, sugarcane, onion, tomato, brinjal, chilli): generating without it merges
    // two phenologies into one calendar. Ask instead of guessing.
    if (inputs.cultivationMethod === AMBIGUOUS_CULTIVATION_METHOD) {
      return json(
        {
          error: "Cultivation method is required for this crop",
          code: "CULTIVATION_METHOD_REQUIRED",
          cropCode: inputs.cropCode,
          options: await getCultivationMethodOptions(supabase, inputs.cropCode),
          gaps: inputs.gaps,
        },
        422,
      );
    }
    // Same philosophy for the crop cycle: sugarcane plant vs ratoon are distinct
    // phenologies (different stage graphs) — ask with DB-derived options, never guess.
    if (inputs.cropCycle === AMBIGUOUS_CROP_CYCLE) {
      return json(
        {
          error: "Crop cycle is required for this crop",
          code: "CROP_CYCLE_REQUIRED",
          cropCode: inputs.cropCode,
          options: await getCropCycleOptions(supabase, inputs.cropCode),
          gaps: inputs.gaps,
        },
        422,
      );
    }


    // ── PHASE 2: day-0 baseline, database rows only ─────────────────────────
    const baseline = await generateBaseline(supabase, inputs);

    if (!baseline.tasks.length) {
      return json(
        {
          error: "No schedule could be produced from the agronomic database for this crop",
          cropCode: inputs.cropCode,
          gaps: baseline.gaps,
          coverage: baseline.coverage,
        },
        422,
      );
    }

    // ── P0-A: never persist a stage-free schedule ───────────────────────────
    // coverage.stages=false means the resolved stage-clock method has no active
    // crop_stage_master graph (and fn_effective_method found no declared ancestor
    // with one). The pre-fix generator continued and shipped 54 stage-less tasks
    // for rice/direct_seeded_dry — this makes that state a hard, explainable 422.
    if (!baseline.coverage.stages) {
      return json(
        {
          error: "No growth-stage graph is available for this crop and cultivation method",
          code: "STAGE_COVERAGE_MISSING",
          cropCode: inputs.cropCode,
          cultivationMethod: inputs.cultivationMethod,
          stageClockMethod: inputs.stageClockMethod,
          options: await getCultivationMethodOptions(supabase, inputs.cropCode),
          gaps: baseline.gaps,
          coverage: baseline.coverage,
        },
        422,
      );
    }

    // ── P2: pre-persistence validation gate (invariant 15) ──────────────────
    if (baseline.validation && baseline.validation.violations.length) {
      return json(
        {
          error: "Generated schedule failed structural validation and was not persisted",
          code: "SCHEDULE_VALIDATION_FAILED",
          violations: baseline.validation.violations,
          warnings: baseline.validation.warnings,
          gaps: baseline.gaps,
        },
        422,
      );
    }
    if (baseline.validation && baseline.validation.warnings.length) {
      for (const w of baseline.validation.warnings) baseline.gaps.push(`validation_warning: ${w}`);
    }

    // ── PHASE 2 / P1: verified RAG evidence attachment (flag-gated) ─────────
    // Runs AFTER the deterministic baseline so RAG can only annotate, never
    // generate. belowThreshold / unservable ⇒ explicit NO_EVIDENCE on the task.
    let ragEvidence: RagEvidenceSummary | null = null;
    try {
      const ragFlag = await isFlagEnabled(supabase, "rag_schedule_evidence", { tenantId, farmerId });
      if (ragFlag.enabled) {
        ragEvidence = await attachRagEvidence(supabase, baseline.tasks, {
          cropCode: inputs.cropCode,
          cropLabel: inputs.cropLabel || cropName,
          regionCode: inputs.regionCode,
          tenantId,
          farmerId,
        });
        baseline.coverage.rag_evidence =
          ragEvidence.tasks_evidenced > 0 &&
          ragEvidence.tasks_no_evidence === 0 &&
          ragEvidence.tasks_not_evaluated === 0;
        if (ragEvidence.tasks_no_evidence > 0) {
          baseline.gaps.push(
            `rag_evidence: ${ragEvidence.tasks_no_evidence} task(s) have no corpus evidence (explicit NO_EVIDENCE)`,
          );
        }
      }
    } catch (e) {
      console.error("rag-evidence attachment failed (non-fatal):", e);
    }

    // ── Narration (translation only) ────────────────────────────────────────
    const narration = await narrateTasks(
      baseline.tasks.map((t) => ({ task_name: t.task_name, task_description: t.task_description })),
      language,
    );
    const narrated = narration.tasks;

    // ── Persist ─────────────────────────────────────────────────────────────
    const sow = new Date(inputs.sowingDate);
    const durationDays = baseline.totals.duration_days;
    const harvestDateStr = durationDays
      ? new Date(sow.getTime() + durationDays * 86400000).toISOString().split("T")[0]
      : null;

    const { data: savedSchedule, error: scheduleError } = await supabase
      .from("crop_schedules")
      .insert({
        land_id: landId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        crop_name: inputs.cropLabel || cropName,
        crop_variety: inputs.varietyName,
        variety_id: inputs.varietyId,
        // P0-A: canonical stage-clock method — the DB phenology resolvers exact-match
        // this stored value against crop_stage_master (schedule is SSOT for method).
        cultivation_method: inputs.stageClockMethod ?? inputs.cultivationMethod,
        crop_cycle: inputs.cropCycle,
        sowing_date: inputs.sowingDate,
        transplant_date: inputs.transplantDate,
        expected_harvest_date: harvestDateStr,
        is_active: true,
        status: "active",
        generation_language: language,
        ai_model: narration.narrated ? "gemini-2.5-flash (narration only)" : "none",
        calculated_for_area_acres: inputs.landAreaAcres,
        total_duration_days: durationDays,
        seed_quantity_kg: baseline.totals.seed_kg,
        fertilizer_n_kg: baseline.totals.n_kg,
        fertilizer_p_kg: baseline.totals.p_kg,
        fertilizer_k_kg: baseline.totals.k_kg,
        total_estimated_cost: baseline.totals.estimated_cost,
        state_region: inputs.state,
        district_name: inputs.district,
        farming_type: farmingType,
        tasks_total_count: baseline.tasks.length,
        tasks_completed_count: 0,
        backdated_consent: !!backdatedConsent,
        backdated_consent_at: backdatedConsent ? new Date().toISOString() : null,
        generation_params: {
          generator_version: GENERATOR_VERSION,
          resolved_inputs: inputs,
          narration: { applied: narration.narrated, reason: narration.reason ?? null },
        },
        metadata: {
          coverage: baseline.coverage,
          missing_sections: Object.entries(baseline.coverage).filter(([, ok]) => ok === false).map(([k]) => k),
          gaps: baseline.gaps,
          provenance: baseline.provenance,
          rag_evidence: ragEvidence,
        },
      })
      .select()
      .single();

    if (scheduleError) {
      if ((scheduleError.message || "").includes("LAND_NOT_AVAILABLE")) {
        return json(
          {
            success: false,
            error:
              "This land already has an active crop. Confirm the previous harvest before starting a new crop schedule.",
            code: "LAND_NOT_AVAILABLE",
            landId,
          },
          200,
        );
      }
      throw new Error(`Failed to save schedule: ${scheduleError.message}`);
    }

    const tasksToInsert = baseline.tasks.map((t, idx) => ({
      schedule_id: savedSchedule.id,
      farmer_id: farmerId,
      tenant_id: tenantId,
      task_name: narrated[idx]?.task_name || t.task_name,
      task_description: narrated[idx]?.task_description || t.task_description,
      task_type: t.task_type,
      task_date: new Date(sow.getTime() + t.days_from_sowing * 86400000).toISOString().split("T")[0],
      projected_date: new Date(sow.getTime() + t.days_from_sowing * 86400000).toISOString().split("T")[0],
      days_from_sowing: t.days_from_sowing,
      anchor_type: t.anchor_type,
      anchor_stage: t.anchor_stage,
      gdd_target: t.gdd_target,
      stage_key: t.stage_key,
      stage_uuid: t.stage_uuid ?? null,
      stage_name: t.stage_name,
      stage_order: t.stage_order,
      priority: t.priority,
      weather_dependent: t.weather_dependent,
      status: "pending",
      sequence_order: idx + 1,
      instructions: t.instructions,
      precautions: t.precautions ?? [],
      // v1.5.0: recurring tasks (irrigation window, weekly scouting) carry their cadence
      // in resources.recurrence instead of being expanded into one dated row per event.
      resources: {
        ...(t.resources ?? {}),
        ...(t.quantity ? { quantity: t.quantity } : {}),
        ...(t.recurrence ? { recurrence: t.recurrence } : {}),
      },

      estimated_cost: t.estimated_cost,
      currency: "INR",
      rule_ids: t.rule_ids,
      trigger_rule_id: t.rule_ids[0] || null,
      confidence: t.confidence,
      source_refs: t.source_refs,
      language,
      is_pinned: false,
    }));

    const { error: tasksError } = await supabase.from("schedule_tasks").insert(tasksToInsert);
    if (tasksError) throw new Error(`Failed to save tasks: ${tasksError.message}`);

    await supabase
      .from("lands")
      .update({
        current_crop: inputs.cropLabel || cropName,
        current_crop_variety_id: inputs.varietyId,
        planting_date: inputs.sowingDate,
        transplant_date: inputs.transplantDate,
        // P0-RC5: DAS clock and GDD clock start on the same day (accumulator precedence:
        // transplant → planting). current_gdd is cleared so a stale sum from the previous
        // cycle can never feed the stage engine before the rebuild.
        gdd_anchor_type: inputs.transplantDate ? "transplant" : "planting",
        gdd_anchor_date: inputs.transplantDate ?? inputs.sowingDate,
        current_gdd: null,
        gdd_last_computed_at: null,
        expected_harvest_date: harvestDateStr,
        active_schedule_id: savedSchedule.id,
        crop_cycle: inputs.cropCycle,
        updated_at: new Date().toISOString(),
      })
      .eq("id", landId);

    // Sections the agronomic database could not cover for this crop. They are returned
    // explicitly so the app can render them as "pending" instead of silently omitting them.
    const missingSections = Object.entries(baseline.coverage)
      .filter(([, ok]) => ok === false)
      .map(([key]) => key);
    const missingSectionLabelKeys = missingSections.map((k) => `schedule.section_pending.${k}`);

    const httpStatus = 200;
    // Observability: log this invocation to edge_invocation_logs. Wrapped so a logging
    // failure never breaks generation — the schedule still returns to the farmer.
    try {
      await supabase.from("edge_invocation_logs").insert({
        function_name: "ai-smart-schedule",
        user_id: farmerId || null,
        payload: {
          landId,
          cropCode: inputs.cropCode,
          http_status: httpStatus,
          task_count: baseline.tasks.length,
          gaps: baseline.gaps,
          coverage: baseline.coverage,
          execution_time_ms: Date.now() - startTime,
        },
      });
    } catch (logErr) {
      console.warn("[ai-smart-schedule] edge_invocation_logs insert failed:", logErr);
    }

    return json({
      success: true,
      scheduleId: savedSchedule.id,
      landId,
      cropCode: inputs.cropCode,
      cropName: inputs.cropLabel || cropName,
      translatedCropName: inputs.cropLabelLocal,
      varietyId: inputs.varietyId,
      cultivationMethod: inputs.cultivationMethod,
      sowingDate: inputs.sowingDate,
      language,
      totalTasks: baseline.tasks.length,
      totals: baseline.totals,
      coverage: baseline.coverage,
      missing_sections: missingSections,
      missing_section_label_keys: missingSectionLabelKeys,
      gaps: baseline.gaps,
      generatorVersion: GENERATOR_VERSION,
      narrationApplied: narration.narrated,
      executionTimeMs: Date.now() - startTime,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const landNotAvailable = errorMessage.includes("LAND_NOT_AVAILABLE");

    if (!landNotAvailable) {
      console.error("❌ [ai-smart-schedule] Error:", error);
    }
    // Observability on failure too — best effort, never blocks the error response.
    try {
      const logClient = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      );
      await logClient.from("edge_invocation_logs").insert({
        function_name: "ai-smart-schedule",
        user_id: farmerId || null,
        payload: {
          landId,
          cropCode: resolvedCropCode ?? cropName,
          http_status: landNotAvailable ? 200 : 500,
          domain_code: landNotAvailable ? "LAND_NOT_AVAILABLE" : null,
          task_count: 0,
          error: errorMessage,
          execution_time_ms: Date.now() - startTime,
        },
      });
    } catch (logErr) {
      console.warn("[ai-smart-schedule] edge_invocation_logs insert failed:", logErr);
    }
    if (landNotAvailable) {
      return json(
        {
          success: false,
          error:
            "This land already has an active crop. Confirm the previous harvest before starting a new crop schedule.",
          code: "LAND_NOT_AVAILABLE",
          landId,
          executionTimeMs: Date.now() - startTime,
        },
        200,
      );
    }

    return json({ error: errorMessage || "Schedule generation failed", executionTimeMs: Date.now() - startTime }, 500);
  }
});
