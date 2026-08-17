// CHANGE LOG
// 2026-08-17 14:16 UTC — Phase 4: created the living-schedule reconciler. Re-anchors pending
//   tasks to the biological stage resolved from land state, logs every change with evidence.
//   No agronomic constants: all thresholds come from DB rows.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ENGINE_VERSION = "schedule-reconciler@1.0.0";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const iso = (d: Date) => d.toISOString().split("T")[0];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  try {
    const body = await req.json().catch(() => ({}));
    const scheduleIdFilter: string | null = body?.scheduleId ?? null;

    let q = supabase
      .from("crop_schedules")
      .select("id, land_id, farmer_id, tenant_id, crop_name, sowing_date, transplant_date, cultivation_method, crop_cycle, variety_id")
      .eq("is_active", true)
      .eq("status", "active")
      .limit(500);
    if (scheduleIdFilter) q = q.eq("id", scheduleIdFilter);
    const { data: schedules, error } = await q;
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];

    for (const sched of schedules || []) {
      const adjustments: Array<Record<string, unknown>> = [];

      // 1. Biological stage truth for the land (DB resolver is the SSOT)
      const { data: phen } = await supabase.rpc("resolve_crop_phenology", { p_land_id: sched.land_id });
      const stage = Array.isArray(phen) ? phen[0] : phen;
      if (!stage?.stage_code) {
        results.push({ schedule_id: sched.id, skipped: "phenology_unresolved" });
        continue;
      }

      // 2. Stage window from the stage master
      const { data: stageRow } = await supabase
        .from("crop_stage_master")
        .select("id, stage_code, growth_stage, das_min, das_max, boundary_grace_days")
        .eq("id", stage.stage_uuid)
        .maybeSingle();

      const observedDas: number | null = stage.current_das ?? null;
      const expectedDasMin = stageRow?.das_min ?? null;

      // 3. Drift = how far biology is from the calendar assumption
      const drift =
        observedDas != null && expectedDasMin != null ? observedDas - expectedDasMin : null;

      const { data: tasks } = await supabase
        .from("schedule_tasks")
        .select("id, task_name, task_date, projected_date, days_from_sowing, anchor_type, anchor_stage, status, is_pinned")
        .eq("schedule_id", sched.id)
        .eq("status", "pending");

      for (const task of tasks || []) {
        if (task.is_pinned) continue; // farmer-pinned dates are never moved
        if (task.anchor_type !== "STAGE" || !task.anchor_stage) continue;
        if (drift == null || drift === 0) continue;

        const oldDate = task.task_date as string;
        const shifted = new Date(new Date(oldDate).getTime() + drift * 86400000);
        const newDate = iso(shifted);
        if (newDate === oldDate) continue;

        const { error: updErr } = await supabase
          .from("schedule_tasks")
          .update({
            task_date: newDate,
            projected_date: newDate,
            original_date: task.original_date ?? oldDate,
            auto_rescheduled: true,
            adjustment_reason: `stage_drift:${drift}d`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", task.id);
        if (updErr) continue;

        adjustments.push({
          schedule_id: sched.id,
          task_id: task.id,
          change_type: "SHIFT",
          old_value: { task_date: oldDate },
          new_value: { task_date: newDate },
          reason: `Biological stage ${stage.stage_code} observed at DAS ${observedDas}; calendar expected ${expectedDasMin}`,
          evidence: {
            stage_code: stage.stage_code,
            stage_source: stage.source,
            confidence: stage.confidence,
            evidence_sources: stage.evidence_sources,
            drift_days: drift,
          },
          engine_version: ENGINE_VERSION,
        });
      }

      if (adjustments.length) {
        await supabase.from("schedule_adjustments").insert(adjustments);
      }

      results.push({
        schedule_id: sched.id,
        stage: stage.stage_code,
        drift_days: drift,
        adjusted_tasks: adjustments.length,
      });
    }

    return json({ success: true, engine: ENGINE_VERSION, schedules: results.length, results });
  } catch (e) {
    console.error("❌ [schedule-reconciler]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
