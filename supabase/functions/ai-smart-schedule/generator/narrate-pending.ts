// CHANGE LOG
// 2026-09-07 — v1.0.0 DURABLE NARRATION WORKER (inside ai-smart-schedule; one feature = one edge
//   function). A schedule is persisted the moment its agronomy is ready; this worker turns the
//   remaining English task text into the farmer's language afterwards, batch by batch, and
//   persists after EVERY batch, so progress survives provider rate limits and the request
//   deadline. Ordering is by task_date: the farmer's next days are translated first. Same
//   fact gates as narrate.ts (numeric fidelity + script share); never touches a quantity, date,
//   rule_id or source_ref. Progress is recorded on crop_schedules.generation_params.narration.
//   Callers: index.ts right after persist (uses the time left in the request), the app's
//   follow-up (`action=narrate`, one owned schedule), and the periodic cron sweep (service-role
//   bearer, several schedules).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { narrateTasks } from "./narrate.ts";

export const NARRATE_ENGINE_VERSION = "ai-smart-schedule/narrate-pending@1.0.0";
const BATCH = 10;                 // tasks per LLM round trip (narrate.ts chunks at 10)
const PERSIST_RESERVE_MS = 6_000; // headroom for the last update + log
const MIN_BATCH_BUDGET_MS = 12_000;
const DEFAULT_SWEEP_LIMIT = 3;
const MAX_SWEEP_LIMIT = 10;

export interface NarratePendingOptions {
  scheduleId: string | null;
  tenantId: string | null;
  farmerId: string | null;
  sweep: boolean;
  limit?: number | null;
  deadlineAt: number;
}

export interface NarratePendingOutcome { status: number; body: Record<string, unknown> }

interface TaskRow {
  id: string;
  task_date: string;
  sequence_order: number | null;
  task_name: string;
  task_description: string | null;
  instructions: string[] | null;
  resources: Record<string, unknown> | null;
  language: string | null;
}

/** Pending = exactly what the pipeline said: language NULL + needs_translation. */
export const isPendingNarration = (t: { language: string | null; resources: Record<string, unknown> | null }) =>
  t.language == null && t.resources?.needs_translation === true;

export interface ScheduleNarrationResult {
  schedule_id: string;
  language: string;
  total: number;
  pending_before: number;
  narrated_now: number;
  still_pending: number;
  batches: number;
  reason: string | null;
  provider: string | null;
  model: string | null;
  failed_task_ids: string[];
  stopped: "complete" | "time_budget" | "provider" | "error";
}

/** Narrate the pending tasks of ONE schedule until done or out of time; persist after each batch. */
export async function narrateScheduleTasks(
  supabase: SupabaseClient,
  sched: { id: string; generation_language: string | null; generation_params: Record<string, unknown> | null },
  deadlineAt: number,
): Promise<ScheduleNarrationResult> {
  const language = String(sched.generation_language || "").trim().toLowerCase();
  const remaining = () => deadlineAt - Date.now();
  const { data: rows, error } = await supabase
    .from("schedule_tasks")
    .select("id, task_date, sequence_order, task_name, task_description, instructions, resources, language")
    .eq("schedule_id", sched.id)
    .order("task_date", { ascending: true })
    .order("sequence_order", { ascending: true });
  if (error) throw error;
  const all = (rows || []) as TaskRow[];
  const pending = all.filter(isPendingNarration);
  const result: ScheduleNarrationResult = { schedule_id: sched.id, language, total: all.length, pending_before: pending.length, narrated_now: 0, still_pending: pending.length, batches: 0, reason: null, provider: null, model: null, failed_task_ids: [], stopped: "complete" };
  if (!pending.length) { await recordProgress(supabase, sched, all.length, 0, null, null, null); return result; }

  for (let i = 0; i < pending.length; i += BATCH) {
    const budget = remaining() - PERSIST_RESERVE_MS;
    if (budget < MIN_BATCH_BUDGET_MS) { result.stopped = "time_budget"; result.reason = "narration_time_budget"; break; }
    const batch = pending.slice(i, i + BATCH);
    const narration = await narrateTasks(
      batch.map((t) => ({ task_name: t.task_name, task_description: t.task_description ?? "", instructions: t.instructions ?? [] })),
      language,
      budget,
    );
    result.batches += 1;
    result.provider = narration.provider ?? result.provider;
    result.model = narration.model ?? result.model;
    for (const idx of narration.appliedIndices) {
      const source = batch[idx]; const out = narration.tasks[idx]; if (!source || !out) continue;
      const { error: updErr } = await supabase
        .from("schedule_tasks")
        .update({
          task_name: out.task_name,
          task_description: out.task_description,
          instructions: out.instructions ?? source.instructions ?? [],
          language,
          resources: { ...(source.resources ?? {}), needs_translation: false, source_language: language, narrated_by: NARRATE_ENGINE_VERSION },
          updated_at: new Date().toISOString(),
        })
        .eq("id", source.id);
      if (updErr) { result.failed_task_ids.push(source.id); continue; }
      result.narrated_now += 1;
    }
    result.still_pending = pending.length - result.narrated_now;
    if (!narration.narrated || narration.timedOut) {
      // provider trouble or budget: stop this schedule, keep what was saved
      result.stopped = narration.timedOut ? "time_budget" : "provider";
      result.reason = narration.reason ?? "translation_unavailable";
      if (narration.narratedCount === 0) break;
    }
    if (result.stopped !== "complete") break;
  }
  if (result.still_pending === 0) { result.stopped = "complete"; result.reason = null; }
  await recordProgress(supabase, sched, all.length, result.still_pending, result.reason, result.provider, result.model);
  return result;
}

async function recordProgress(
  supabase: SupabaseClient,
  sched: { id: string; generation_params: Record<string, unknown> | null },
  total: number,
  stillPending: number,
  reason: string | null,
  provider: string | null,
  model: string | null,
) {
  const prev = (sched.generation_params ?? {}) as Record<string, unknown>;
  const prevN = (prev.narration ?? {}) as Record<string, unknown>;
  const attempts = Number(prevN.attempts ?? 0) + 1;
  const narration = {
    ...prevN,
    status: stillPending === 0 ? "COMPLETE" : "PENDING",
    applied: stillPending === 0,
    narrated_count: total - stillPending,
    total_count: total,
    pending_count: stillPending,
    reason,
    attempts,
    last_attempt_at: new Date().toISOString(),
    ...(stillPending === 0 ? { completed_at: new Date().toISOString(), completed_by: NARRATE_ENGINE_VERSION } : {}),
  };
  await supabase
    .from("crop_schedules")
    .update({
      generation_params: { ...prev, narration },
      ...(provider ? { ai_model: `${provider}/${model ?? "unknown"} (narration only)` } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sched.id);
  sched.generation_params = { ...prev, narration };
}

/** Entry for action=narrate (app: one owned schedule; cron: sweep of schedules with pending work). */
export async function narratePendingSchedules(supabase: SupabaseClient, opts: NarratePendingOptions): Promise<NarratePendingOutcome> {
  const startedAt = Date.now();
  let q = supabase
    .from("crop_schedules")
    .select("id, tenant_id, farmer_id, generation_language, generation_params")
    .eq("is_active", true)
    .eq("status", "active")
    .neq("generation_language", "en");
  if (opts.sweep) {
    if (opts.scheduleId) q = q.eq("id", opts.scheduleId);
    // oldest pending first so no schedule starves; the status filter keeps the sweep cheap
    q = q.filter("generation_params->narration->>status", "eq", "PENDING").order("created_at", { ascending: true }).limit(Math.min(Math.max(Number(opts.limit) || DEFAULT_SWEEP_LIMIT, 1), MAX_SWEEP_LIMIT));
  } else {
    if (!opts.tenantId || !opts.farmerId) return { status: 401, body: { error: "Missing tenant/farmer context" } };
    if (!opts.scheduleId) return { status: 400, body: { error: "scheduleId is required for action=narrate" } };
    q = q.eq("id", opts.scheduleId).eq("tenant_id", opts.tenantId).eq("farmer_id", opts.farmerId).limit(1);
  }
  const { data: schedules, error } = await q;
  if (error) throw error;
  if (!schedules?.length) return { status: opts.sweep ? 200 : 404, body: { success: true, engine: NARRATE_ENGINE_VERSION, schedules: 0, results: [], note: opts.sweep ? "no schedules with pending narration" : "schedule not found for this farmer" } };

  const results: ScheduleNarrationResult[] = [];
  for (const sched of schedules) {
    if (opts.deadlineAt - Date.now() < MIN_BATCH_BUDGET_MS + PERSIST_RESERVE_MS) break;
    try { results.push(await narrateScheduleTasks(supabase, sched as { id: string; generation_language: string | null; generation_params: Record<string, unknown> | null }, opts.deadlineAt)); }
    catch (e) { results.push({ schedule_id: sched.id, language: String(sched.generation_language ?? ""), total: 0, pending_before: 0, narrated_now: 0, still_pending: 0, batches: 0, reason: (e as Error).message, provider: null, model: null, failed_task_ids: [], stopped: "error" }); }
  }
  return { status: 200, body: { success: results.every((r) => r.stopped !== "error" && r.failed_task_ids.length === 0), engine: NARRATE_ENGINE_VERSION, mode: opts.sweep ? "sweep" : "farmer", schedules: results.length, results, executionTimeMs: Date.now() - startedAt } };
}
