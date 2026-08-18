// CHANGE LOG
// 2026-08-18 15:45 UTC — success response (and crop_schedules.metadata) now carries missing_sections +
//   i18n label keys so partial schedules render pending sections instead of silent gaps.
// 2026-08-17 14:10 UTC — Phases 1/2/6: replaced the legacy 4.5k-line generator (hardcoded seed
//   rates, NPK targets, labor rates, product lists, IPM thresholds) with the DB-SSOT pipeline:
//   resolve-inputs -> baseline-generator -> narrate. LLM is narration-only.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveInputs } from "./db/resolve-inputs.ts";
import { generateBaseline, GENERATOR_VERSION } from "./generator/baseline-generator.ts";
import { narrateTasks } from "./generator/narrate.ts";

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

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const body = await req.json();
    const {
      landId,
      cropName,
      cropVariety = null,
      cultivationMethod = null,
      cropCycle = null,
      sowingDate = null,
      transplantDate = null,
      farmingType = null,
      backdatedConsent = false,
      language = "en",
    } = body || {};

    const tenantId = req.headers.get("x-tenant-id") || "";
    const farmerId = req.headers.get("x-farmer-id") || "";

    if (!landId || !cropName) return json({ error: "landId and cropName are required" }, 400);
    if (!tenantId || !farmerId) return json({ error: "Missing tenant/farmer context" }, 401);

    // Ownership: the land must belong to this farmer + tenant
    const { data: ownedLand } = await supabase
      .from("lands")
      .select("id, farmer_id, tenant_id")
      .eq("id", landId)
      .maybeSingle();
    if (!ownedLand) return json({ error: "Land not found" }, 404);
    if (ownedLand.farmer_id !== farmerId || ownedLand.tenant_id !== tenantId) {
      return json({ error: "Land does not belong to this farmer" }, 403);
    }

    // ── PHASE 1: resolve farmer inputs to database IDs ──────────────────────
    const inputs = await resolveInputs(supabase, {
      landId,
      cropName,
      cropVariety,
      cultivationMethod,
      cropCycle,
      sowingDate,
      transplantDate,
      language,
    });

    if (!inputs.cropCode) {
      return json(
        { error: "Crop could not be resolved to the crop master", cropName, gaps: inputs.gaps },
        422,
      );
    }
    if (!inputs.sowingDate) {
      return json({ error: "Sowing date is required and was not found", gaps: inputs.gaps }, 422);
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
        cultivation_method: inputs.cultivationMethod,
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
        },
      })
      .select()
      .single();

    if (scheduleError) throw new Error(`Failed to save schedule: ${scheduleError.message}`);

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
      stage_name: t.stage_name,
      stage_order: t.stage_order,
      priority: t.priority,
      weather_dependent: t.weather_dependent,
      status: "pending",
      sequence_order: idx + 1,
      instructions: t.instructions,
      resources: t.quantity ? { quantity: t.quantity } : {},
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
    console.error("❌ [ai-smart-schedule] Error:", error);
    // Observability on failure too — best effort, never blocks the error response.
    try {
      await supabase.from("edge_invocation_logs").insert({
        function_name: "ai-smart-schedule",
        user_id: farmerId || null,
        payload: {
          landId: landId ?? null,
          cropCode: inputs?.cropCode ?? cropName,
          http_status: 500,
          task_count: 0,
          error: (error as Error)?.message ?? String(error),
          execution_time_ms: Date.now() - startTime,
        },
      });
    } catch (logErr) {
      console.warn("[ai-smart-schedule] edge_invocation_logs insert failed:", logErr);
    }
    return json({ error: (error as Error).message || "Schedule generation failed", executionTimeMs: Date.now() - startTime }, 500);
  }
});
