// Behavioural tests of the reconciler's decision application (the real applyFieldDecisions)
// against an in-memory database double: rain → effective rainfall → no-irrigation decision →
// task adjustment, plus nutrient authorization, rain-loss deferral, pins, windows, idempotency
// and audit rows. No source-string assertions. The double is NOT a staging database.
import { describe, expect, it } from "vitest";
import { applyFieldDecisions } from "../../supabase/functions/schedule-reconciler/decision-application";

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>, rpc: Record<string, (args: Row) => { data?: unknown; error?: { code: string } | null }> = {}) {
  const calls: string[] = [];
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null, order: { col: string; asc: boolean } | null = null, limit: number | null = null;
    const rows = () => {
      let out = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (order) out = [...out].sort((a, b) => String(a[order!.col]).localeCompare(String(b[order!.col])) * (order!.asc ? 1 : -1));
      return limit != null ? out.slice(0, limit) : out;
    };
    const run = () => {
      if (patch) { for (const r of rows()) Object.assign(r, patch); return { data: null, error: null }; }
      return { data: rows().map((r) => structuredClone(r)), error: null }; // a query result is a copy, as with a real database
    };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      lte: (c: string, v: unknown) => { filters.push((r) => String(r[c]) <= String(v)); return q; },
      in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      order: (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return q; },
      limit: (n: number) => { limit = n; return q; },
      update: (p: Row) => { patch = p; return q; },
      maybeSingle: async () => ({ data: rows()[0] ? structuredClone(rows()[0]) : null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return q;
  };
  return { db: { from, rpc: async (name: string, args: Row) => { calls.push(name); return rpc[name] ? { data: null, error: null, ...rpc[name](args) } : { data: null, error: { code: "PGRST202" } }; } }, calls };
}

const TODAY = "2026-07-20", SOWING = "2026-06-01"; // today = DAS 49
const decision = (o: Row): Row => ({ id: "d-" + o.decision_key, decision_date: TODAY, category: "water", status: "INFO", priority: "low", action_code: null, title_en: "", rule_id: null, source: "land_weather_state", evidence: {}, valid_until: null, schedule_id: null, task_id: null, land_id: "land-1", ...o });
const task = (o: Row): Row => ({ schedule_id: "sch-1", status: "pending", original_date: null, days_from_sowing: 40, anchor_stage: "TILLERING", priority: "medium", weather_dependent: true, is_pinned: false, resources: {}, decision_state: null, ...o });
const world = (decisions: Row[], tasks: Row[], state: Row = {}) => ({
  lands: [{ id: "land-1", active_schedule_id: "sch-1" }],
  land_farm_state: [{ land_id: "land-1", state_date: TODAY, crop_code: "rice", stage_code: "TILLERING", stage_source: "das_ledger_provisional", water: { metric_date: TODAY, effective_rainfall_mm: 22, etc_mm: 5, irrigation_needed: false }, canopy: null, observations: [], gaps: [], state_version: { engine: "farm_monitoring_bridge@1.1.0" }, ...state }],
  farm_decision: decisions,
  schedule_tasks: tasks,
});
const input = { scheduleId: "sch-1", landId: "land-1", sowingDate: SOWING, todayIso: TODAY, engineVersion: "test", dryRun: false, stageRow: { stage_code: "TILLERING", das_max: 60 } };
const irrigationTask = (o: Row = {}) => task({ id: "irr-1", task_type: "irrigation", task_date: TODAY, resources: { recurrence: { interval_days: 5, window_start: 35, window_end: 60, expected_events: 6 } }, ...o });

describe("rainfall before irrigation", () => {
  it("rain covered crop water use (water:ok) → due irrigation is deferred by its own cadence, with audit and original date", async () => {
    const w = world([decision({ decision_key: "water:ok", action_code: "NO_IRRIGATION" })], [irrigationTask()]);
    // deno-lint-ignore no-explicit-any
    const out = await applyFieldDecisions(fakeDb(w).db as any, input);
    const t = w.schedule_tasks[0];
    expect(t.task_date).toBe("2026-07-25");
    expect(t.original_date).toBe(TODAY);
    expect(t.adjustment_reason).toBe("decision_no_irrigation");
    expect(t.auto_rescheduled).toBe(true);
    expect(out.counters.deferred).toBe(1);
    expect(out.adjustments).toHaveLength(1);
    expect(out.adjustments[0]).toMatchObject({ change_type: "DEFER", task_id: "irr-1", old_value: { task_date: TODAY }, new_value: { task_date: "2026-07-25" } });
    const ev = out.adjustments[0].evidence as Row;
    expect(ev.decision_key).toBe("water:ok");
    expect(ev.evidence_freshness).toMatchObject({ water_age_days: 0, satellite_age_days: null });
  });
  it("the historic key water:no_irrigation is honoured identically", async () => {
    const w = world([decision({ decision_key: "water:no_irrigation" })], [irrigationTask()]);
    // deno-lint-ignore no-explicit-any
    await applyFieldDecisions(fakeDb(w).db as any, input);
    expect(w.schedule_tasks[0].task_date).toBe("2026-07-25");
  });
  it("is idempotent: a second run on the same decision day moves nothing further", async () => {
    const w = world([decision({ decision_key: "water:ok" })], [irrigationTask()]);
    const { db } = fakeDb(w);
    // deno-lint-ignore no-explicit-any
    await applyFieldDecisions(db as any, input);
    // deno-lint-ignore no-explicit-any
    const second = await applyFieldDecisions(db as any, input);
    expect(w.schedule_tasks[0].task_date).toBe("2026-07-25");
    expect(w.schedule_tasks[0].original_date).toBe(TODAY);
    expect(second.adjustments).toHaveLength(0);
  });
  it("never moves a farmer-pinned irrigation", async () => {
    const w = world([decision({ decision_key: "water:ok" })], [irrigationTask({ is_pinned: true })]);
    // deno-lint-ignore no-explicit-any
    const out = await applyFieldDecisions(fakeDb(w).db as any, input);
    expect(w.schedule_tasks[0].task_date).toBe(TODAY);
    expect(out.adjustments).toHaveLength(0);
  });
  it("never defers beyond the task's approved stage window", async () => {
    const w = world([decision({ decision_key: "water:ok" })], [irrigationTask({ resources: { recurrence: { interval_days: 5, window_start: 35, window_end: 51 } } })]);
    // deno-lint-ignore no-explicit-any
    const out = await applyFieldDecisions(fakeDb(w).db as any, input);
    expect(w.schedule_tasks[0].task_date).toBe(TODAY);
    expect(w.schedule_tasks[0].decision_state).toBe("BLOCKED");
    expect(out.counters.deferred).toBe(0);
  });
  it("does not guess a new date for an irrigation without a declared cadence", async () => {
    const w = world([decision({ decision_key: "water:ok" })], [irrigationTask({ resources: {} })]);
    // deno-lint-ignore no-explicit-any
    await applyFieldDecisions(fakeDb(w).db as any, input);
    expect(w.schedule_tasks[0].task_date).toBe(TODAY);
  });
  it("with no fresh water balance (water:no_data) the planned irrigation is kept, not deferred", async () => {
    const w = world([decision({ decision_key: "water:no_data", action_code: "NO_DATA" })], [irrigationTask()]);
    // deno-lint-ignore no-explicit-any
    const out = await applyFieldDecisions(fakeDb(w).db as any, input);
    expect(w.schedule_tasks[0].task_date).toBe(TODAY);
    expect(out.counters.deferred).toBe(0);
  });
  it("a dry run reports the adjustment but writes nothing", async () => {
    const w = world([decision({ decision_key: "water:ok" })], [irrigationTask()]);
    // deno-lint-ignore no-explicit-any
    const out = await applyFieldDecisions(fakeDb(w).db as any, { ...input, dryRun: true });
    expect(w.schedule_tasks[0].task_date).toBe(TODAY);
    expect(out.adjustments).toHaveLength(1);
  });
  it("a stale (non-active) schedule is never touched", async () => {
    const w = world([decision({ decision_key: "water:ok" })], [irrigationTask()]);
    w.lands[0].active_schedule_id = "sch-other";
    // deno-lint-ignore no-explicit-any
    const out = await applyFieldDecisions(fakeDb(w).db as any, input);
    expect(out).toMatchObject({ applied: false, skipped: "not_active_schedule" });
    expect(w.schedule_tasks[0].task_date).toBe(TODAY);
  });
});

describe("nutrient actions", () => {
  const nutrition = (o: Row = {}) => task({ id: "nut-1", task_type: "nutrition", task_date: "2026-07-26", resources: { window: { from_das: 45, to_das: 60 } }, quantity: { value: 26, unit: "kg" }, ...o });
  it("a WATCH / observe-before-input request never brings a fertilizer application forward", async () => {
    const w = world([decision({ decision_key: "observe:nutrient:R1", category: "nutrient", status: "WATCH", action_code: "OBSERVE_BEFORE_INPUT" })], [nutrition()]);
    // deno-lint-ignore no-explicit-any
    const out = await applyFieldDecisions(fakeDb(w).db as any, input);
    expect(w.schedule_tasks[0].task_date).toBe("2026-07-26");
    expect(out.counters.advanced).toBe(0);
  });
  it("a verified nutrient decision brings the next card forward inside its window and leaves the quantity untouched", async () => {
    const w = world([
      decision({ decision_key: "observe:nutrient:R1", category: "nutrient", status: "WATCH", action_code: "OBSERVE_BEFORE_INPUT" }),
      decision({ decision_key: "observe:nutrient:verified:R1", category: "nutrient", status: "DUE", priority: "high", action_code: "APPLY_NUTRIENT_VERIFIED", evidence: { observed_value: 2.5, threshold_below: 3 } }),
    ], [nutrition()]);
    // deno-lint-ignore no-explicit-any
    const out = await applyFieldDecisions(fakeDb(w).db as any, input);
    const t = w.schedule_tasks[0];
    expect(t.task_date).toBe(TODAY);
    expect(t.original_date).toBe("2026-07-26");
    expect(t.quantity).toEqual({ value: 26, unit: "kg" });
    expect(out.adjustments[0]).toMatchObject({ change_type: "ADVANCE", task_id: "nut-1" });
    expect((out.adjustments[0].evidence as Row).decision_key).toBe("observe:nutrient:verified:R1");
  });
  it("a verified decision does not open a window that has not started", async () => {
    const w = world([decision({ decision_key: "observe:nutrient:verified:R1", category: "nutrient", status: "DUE", action_code: "APPLY_NUTRIENT_VERIFIED" })], [nutrition({ resources: { window: { from_das: 55, to_das: 70 } } })]);
    // deno-lint-ignore no-explicit-any
    await applyFieldDecisions(fakeDb(w).db as any, input);
    expect(w.schedule_tasks[0].task_date).toBe("2026-07-26");
  });
  it("heavy-rain loss risk defers a due fertilizer by one day (preserved behaviour) and outranks a verified advance", async () => {
    const w = world([
      decision({ decision_key: "info:ENV_HEAVY_RAIN_48H", category: "general" }),
      decision({ decision_key: "observe:nutrient:verified:R1", category: "nutrient", status: "DUE", action_code: "APPLY_NUTRIENT_VERIFIED" }),
    ], [nutrition({ task_date: TODAY })]);
    // deno-lint-ignore no-explicit-any
    const out = await applyFieldDecisions(fakeDb(w).db as any, input);
    expect(w.schedule_tasks[0].task_date).toBe("2026-07-21");
    expect(w.schedule_tasks[0].adjustment_reason).toBe("decision_rain_loss_risk");
    expect(w.schedule_tasks[0].original_date).toBe(TODAY);
    expect(out.counters.advanced).toBe(0);
  });
  it("calls the verified-nutrient producer, and a not-yet-deployed producer is non-fatal", async () => {
    const w = world([decision({ decision_key: "water:ok" })], [irrigationTask()]);
    const missing = fakeDb(w);
    // deno-lint-ignore no-explicit-any
    const out = await applyFieldDecisions(missing.db as any, input);
    expect(missing.calls).toEqual(["derive_verified_nutrient_decisions"]);
    expect(out.applied).toBe(true);
    expect((out.state_snapshot as Row).nutrient_producer).toEqual({ called: true, ok: false, error: "PGRST202" });
    const w2 = world([decision({ decision_key: "water:ok" })], [irrigationTask()]);
    const present = fakeDb(w2, { derive_verified_nutrient_decisions: () => ({ data: { ok: true, due: 0 } }) });
    // deno-lint-ignore no-explicit-any
    const out2 = await applyFieldDecisions(present.db as any, input);
    expect((out2.state_snapshot as Row).nutrient_producer).toMatchObject({ called: true, ok: true, due: 0 });
    // deno-lint-ignore no-explicit-any
    const dry = fakeDb(world([decision({ decision_key: "water:ok" })], [irrigationTask()]));
    // deno-lint-ignore no-explicit-any
    await applyFieldDecisions(dry.db as any, { ...input, dryRun: true });
    expect(dry.calls).toEqual([]);
  });
});
