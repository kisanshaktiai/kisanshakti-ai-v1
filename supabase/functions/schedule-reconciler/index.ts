// CHANGE LOG
// 2026-08-30 — v1.2.1 (crop biological stage engine audit, P0-RC6):
//   (1) SOURCE GATE — the resolver's stage is only allowed to move tasks when it rests on
//       evidence: sources das_provisional / das_ledger_provisional /
//       gate_constrained_calendar (calendar-only, incl. 'autonomous_init' ledger rows) are
//       skipped as provisional_stage_source. Unknown biology never moves a schedule.
//   (2) ANCHOR-CORRECT DAY — for transplant-anchored stages (crop_stage_master.das_reference
//       = 'transplanting') drift is measured on current_dat, not current_das.
//   (3) SOWING FLOOR — a shifted date can never land before crop_schedules.sowing_date
//       (live defect: a germination task was moved to 22-May for a crop sown 08-Jun).
//   Semantics now match the DB-side reconcile_schedule_for_land@1.2.1 exactly, so the
//   nightly sweep and the synchronous ledger-trigger path can never disagree.
//   NOTE: this function was NOT deployed on 2026-08-30 (cron POST → 404); deploy it.
// 2026-08-28 — v1.2.0 (forensic implementation prompt P0-1/P0-2/P1-13/P1-14):
//   SSOT GATES — before any task of a schedule may move, the reconciler verifies:
//     (1) CROP IDENTITY: lands.current_crop_id (FK → crops), when set, must resolve to the
//         schedule's crop; (2) PHENOLOGY: the resolver's stage row must belong to the
//         schedule's crop and be cultivation_method/crop_cycle-compatible ('any'/'universal'
//         tolerated); (3) LAND STAGE: a lands.stage_uuid pointing at ANOTHER crop's stage is
//         a stale-state breach. Any conflict FAILS CLOSED for that schedule — zero task
//         mutations — recorded as a schedule_adjustments row (change_type=CONFLICT, task_id
//         NULL; column verified nullable, change_type unconstrained) plus a machine-readable
//         results entry. Within-crop stage lag between land state and resolver is NOT a
//         conflict: that lag is precisely the drift this engine reconciles (resolver is the
//         stage SSOT). Verified live trigger: land 8897e53d (active Rice AND Sugarcane
//         schedules, current_crop_id=sugarcane, lands.stage_uuid=SUGARCANE_TILLERING,
//         resolver=RICE_HEADING) now fails closed instead of being shifted.
//   REPORTING — per schedule: tasks_examined/changed/skipped/failed (+failed task ids),
//         started/completed timestamps; top-level success is true ONLY when no conflict
//         occurred and no task update failed. A completed invocation no longer implies
//         successful reconciliation.
// 2026-08-28 — P0 (forensic audit of schedule 5673e87a): the 1.0.0 drift algorithm was
//   unsafe on three counts and is corrected here BEFORE its first mutation of a live
//   DB-SSOT schedule (all 113 tasks of 5673e87a were still pending/unadjusted at fix time):
//   (1) SEMANTICS — drift was observedDas - das_min, i.e. the crop's POSITION inside its
//       current stage window, so a perfectly on-schedule crop was shifted by up to the
//       stage's full width every night. Corrected: drift is 0 while observed DAS lies
//       inside the observed stage's [das_min-grace, das_max+grace] window; (das - das_min)
//       (negative = biology ahead) only when the stage arrived before its window opens;
//       (das - das_max) (positive = biology behind) only when the crop is still in the
//       stage past its window.
//   (2) COMPOUNDING — the shift was applied to the current task_date, so consecutive runs
//       stacked (-9, then -8 on top…). Corrected: every run recomputes from the immutable
//       baseline (original_date, set once from the first pre-shift date), making the
//       operation idempotent — same biology in, same dates out, regardless of run count.
//   (3) SCOPE — every pending STAGE task was shifted, including tasks of stages the crop
//       has already passed. Corrected: only tasks whose baseline days_from_sowing falls at
//       or after the observed stage's das_min are re-anchored.
// 2026-08-18 18:55 UTC — Phase B: accept { landId } so a stage-changing event can reconcile
//   just that land immediately (nightly cron still runs the full sweep).
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

const ENGINE_VERSION = "schedule-reconciler@1.2.1";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const iso = (d: Date) => d.toISOString().split("T")[0];

/**
 * Calendar drift of the crop's biology vs the stage master, in days.
 *  - inside [das_min - grace, das_max + grace]  →  0 (on schedule; position within a
 *    stage window is NOT drift)
 *  - below the window  →  das - das_min  (negative: stage arrived early, biology ahead)
 *  - above the window  →  das - das_max  (positive: still in the stage late, biology behind)
 * Null when any input is unknown — unknown biology never moves a schedule.
 */
export function computeStageDrift(
  observedDas: number | null,
  dasMin: number | null,
  dasMax: number | null,
  graceDays: number | null,
): number | null {
  if (observedDas == null || dasMin == null || dasMax == null) return null;
  const grace = graceDays ?? 0;
  if (observedDas >= dasMin - grace && observedDas <= dasMax + grace) return 0;
  return observedDas < dasMin ? observedDas - dasMin : observedDas - dasMax;
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** Resolver sources that carry NO biological evidence (resolve_crop_phenology v9). */
export const PROVISIONAL_SOURCES = new Set(["das_provisional", "das_ledger_provisional", "gate_constrained_calendar"]);

export interface SsotContext {
  scheduleCropNames: string[];
  scheduleMethod: string | null;
  scheduleCycle: string | null;
  landCropName: string | null;
  resolvedStageCrop: string | null;
  resolvedStageMethod: string | null;
  resolvedStageCycle: string | null;
  landStageCrop: string | null;
}

/** Pure SSOT gate: machine-readable conflict code, or null when coherent. Never resolves
 *  a conflict itself — fail closed only; the caller must repair identity first. */
export function assessSsotConflict(ctx: SsotContext): string | null {
  const names = new Set(ctx.scheduleCropNames.map(norm).filter(Boolean));
  if (ctx.landCropName && !names.has(norm(ctx.landCropName))) return "CROP_IDENTITY_CONFLICT";
  if (ctx.resolvedStageCrop && !names.has(norm(ctx.resolvedStageCrop))) return "PHENOLOGY_SSOT_CONFLICT";
  if (
    ctx.resolvedStageMethod && ctx.scheduleMethod &&
    norm(ctx.resolvedStageMethod) !== "any" &&
    norm(ctx.resolvedStageMethod) !== norm(ctx.scheduleMethod)
  ) return "PHENOLOGY_SSOT_CONFLICT";
  if (
    ctx.resolvedStageCycle && ctx.scheduleCycle &&
    norm(ctx.resolvedStageCycle) !== "universal" &&
    norm(ctx.scheduleCycle) !== "universal" &&
    norm(ctx.resolvedStageCycle) !== norm(ctx.scheduleCycle)
  ) return "PHENOLOGY_SSOT_CONFLICT";
  if (ctx.landStageCrop && !names.has(norm(ctx.landStageCrop))) return "PHENOLOGY_SSOT_CONFLICT";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  try {
    const body = await req.json().catch(() => ({}));
    const scheduleIdFilter: string | null = body?.scheduleId ?? null;
    const landIdFilter: string | null = body?.landId ?? body?.land_id ?? null;

    let q = supabase
      .from("crop_schedules")
      .select("id, land_id, farmer_id, tenant_id, crop_name, sowing_date, transplant_date, cultivation_method, crop_cycle, variety_id")
      .eq("is_active", true)
      .eq("status", "active")
      .limit(500);
    if (scheduleIdFilter) q = q.eq("id", scheduleIdFilter);
    if (landIdFilter) q = q.eq("land_id", landIdFilter);
    const { data: schedules, error } = await q;
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];

    let anyConflict = false;
    let anyFailure = false;

    for (const sched of schedules || []) {
      const startedAt = new Date().toISOString();
      const adjustments: Array<Record<string, unknown>> = [];
      let examined = 0, changed = 0, skipped = 0, floorSkipped = 0;
      const failedTaskIds: string[] = [];

      // 0. SSOT context: land identity + stored biological stage
      const { data: land } = await supabase
        .from("lands")
        .select("id, current_crop_id, stage_uuid")
        .eq("id", sched.land_id)
        .maybeSingle();
      let landCropName: string | null = null;
      if (land?.current_crop_id) {
        const { data: cropRow } = await supabase
          .from("crops")
          .select("label, value")
          .eq("id", land.current_crop_id)
          .maybeSingle();
        landCropName = (cropRow?.label ?? cropRow?.value ?? null) as string | null;
      }
      let landStageCrop: string | null = null;
      if (land?.stage_uuid) {
        const { data: landStage } = await supabase
          .from("crop_stage_master")
          .select("crop_code")
          .eq("id", land.stage_uuid)
          .maybeSingle();
        landStageCrop = (landStage?.crop_code ?? null) as string | null;
      }

      // 1. Biological stage truth for the land (DB resolver is the stage SSOT)
      const { data: phen } = await supabase.rpc("resolve_crop_phenology", { p_land_id: sched.land_id });
      const stage = Array.isArray(phen) ? phen[0] : phen;
      if (!stage?.stage_code) {
        results.push({ schedule_id: sched.id, skipped: "phenology_unresolved", started_at: startedAt, completed_at: new Date().toISOString() });
        continue;
      }

      // 2. Stage window from the stage master
      const { data: stageRow } = await supabase
        .from("crop_stage_master")
        .select("id, stage_code, growth_stage, crop_code, cultivation_method, crop_cycle, das_min, das_max, boundary_grace_days, das_reference")
        .eq("id", stage.stage_uuid)
        .maybeSingle();

      // 2b. SSOT gate — any conflict fails CLOSED for this whole schedule (zero mutations).
      const conflict = assessSsotConflict({
        scheduleCropNames: [sched.crop_name],
        scheduleMethod: sched.cultivation_method ?? null,
        scheduleCycle: sched.crop_cycle ?? null,
        landCropName,
        resolvedStageCrop: (stageRow?.crop_code ?? null) as string | null,
        resolvedStageMethod: (stageRow?.cultivation_method ?? null) as string | null,
        resolvedStageCycle: (stageRow?.crop_cycle ?? null) as string | null,
        landStageCrop,
      });
      if (conflict) {
        anyConflict = true;
        await supabase.from("schedule_adjustments").insert({
          schedule_id: sched.id,
          task_id: null,
          change_type: "CONFLICT",
          reason: conflict,
          evidence: {
            land_id: sched.land_id,
            schedule_crop: sched.crop_name,
            land_crop: landCropName,
            land_stage_crop: landStageCrop,
            resolver_stage: stage.stage_code,
            resolver_stage_crop: stageRow?.crop_code ?? null,
            resolver_confidence: stage.confidence ?? null,
          },
          engine_version: ENGINE_VERSION,
        });
        results.push({
          schedule_id: sched.id,
          success: false,
          conflict,
          tasks_examined: 0,
          tasks_changed: 0,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
        continue;
      }

      // v1.2.1 SOURCE GATE — calendar-only stages carry no biological evidence and must not
      // move a farmer's tasks (the DB resolver labels them provisional).
      if (PROVISIONAL_SOURCES.has(String(stage.source ?? ""))) {
        results.push({
          schedule_id: sched.id,
          success: true,
          skipped: "provisional_stage_source",
          stage: stage.stage_code,
          stage_source: stage.source ?? null,
          tasks_examined: 0,
          tasks_changed: 0,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
        continue;
      }

      // v1.2.1 ANCHOR-CORRECT DAY — DAT for transplant-anchored stage windows.
      const observedDas: number | null =
        String(stageRow?.das_reference ?? "sowing").toLowerCase() === "transplanting"
          ? (stage.current_dat ?? null)
          : (stage.current_das ?? null);

      // 3. Drift = how far biology is from the calendar assumption. Position within the
      //    observed stage's window is NOT drift (see computeStageDrift).
      const drift = computeStageDrift(
        observedDas,
        stageRow?.das_min ?? null,
        stageRow?.das_max ?? null,
        stageRow?.boundary_grace_days ?? null,
      );

      if (drift == null || drift === 0) {
        results.push({ schedule_id: sched.id, success: true, stage: stage.stage_code, drift_days: drift, tasks_examined: 0, tasks_changed: 0, started_at: startedAt, completed_at: new Date().toISOString() });
        continue;
      }

      const { data: tasks } = await supabase
        .from("schedule_tasks")
        .select("id, task_name, task_date, projected_date, days_from_sowing, anchor_type, anchor_stage, status, is_pinned, original_date")
        .eq("schedule_id", sched.id)
        .eq("status", "pending");

      for (const task of tasks || []) {
        examined += 1;
        if (task.is_pinned) { skipped += 1; continue; } // farmer-pinned dates are never moved
        if (task.anchor_type !== "STAGE" || !task.anchor_stage) { skipped += 1; continue; } // DAS-anchored tasks are never stage-shifted
        // Only re-anchor from the observed biological stage onward: tasks whose baseline
        // clock precedes the observed stage belong to stages the crop has already passed.
        if (
          stageRow?.das_min != null &&
          task.days_from_sowing != null &&
          task.days_from_sowing < stageRow.das_min
        ) { skipped += 1; continue; }

        // Idempotent recomputation: always shift from the immutable baseline date, never
        // from an already-shifted task_date. original_date is written exactly once.
        const baselineDate = (task.original_date as string | null) ?? (task.task_date as string);
        const oldDate = task.task_date as string;
        const shifted = new Date(new Date(baselineDate).getTime() + drift * 86400000);
        const newDate = iso(shifted);
        if (newDate === oldDate) { skipped += 1; continue; }
        // v1.2.1 SOWING FLOOR — never schedule a task before the crop existed.
        if (sched.sowing_date && newDate < String(sched.sowing_date)) { skipped += 1; floorSkipped += 1; continue; }

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
        if (updErr) {
          failedTaskIds.push(task.id as string);
          continue; // recorded, never silently swallowed: surfaced in counters + success flag
        }
        changed += 1;

        adjustments.push({
          schedule_id: sched.id,
          task_id: task.id,
          change_type: "SHIFT",
          old_value: { task_date: oldDate },
          new_value: { task_date: newDate },
          reason: `Biological stage ${stage.stage_code} observed at DAS ${observedDas}; stage window ${stageRow?.das_min}-${stageRow?.das_max}`,
          evidence: {
            stage_code: stage.stage_code,
            stage_source: stage.source,
            confidence: stage.confidence,
            evidence_sources: stage.evidence_sources,
            drift_days: drift,
            baseline_date: baselineDate,
          },
          engine_version: ENGINE_VERSION,
        });
      }

      if (adjustments.length) {
        await supabase.from("schedule_adjustments").insert(adjustments);
      }
      if (failedTaskIds.length) anyFailure = true;

      results.push({
        schedule_id: sched.id,
        success: failedTaskIds.length === 0,
        stage: stage.stage_code,
        drift_days: drift,
        tasks_examined: examined,
        tasks_changed: changed,
        tasks_skipped: skipped,
        tasks_skipped_before_sowing: floorSkipped,
        tasks_failed: failedTaskIds.length,
        failed_task_ids: failedTaskIds,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      });
    }

    // A completed invocation is NOT successful reconciliation: success reflects outcomes.
    return json({
      success: !anyConflict && !anyFailure,
      engine: ENGINE_VERSION,
      schedules: results.length,
      conflicts: results.filter((r) => r.conflict).length,
      results,
    });
  } catch (e) {
    console.error("❌ [schedule-reconciler]", e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
