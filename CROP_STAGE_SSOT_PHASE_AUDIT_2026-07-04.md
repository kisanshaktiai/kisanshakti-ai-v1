# Crop-Stage SSOT — Phase Audit & Root-Cause Report
Date: 2026-07-04 · Scope: read-only

---

## TL;DR

**Phase 1 (immutable BiologicalState) shipped in code but is 100% inert in production.**
Every call to `resolve_crop_phenology()` throws:

```
ERROR 42702: column reference "crop_cycle" is ambiguous
DETAIL: It could refer to either a PL/pgSQL variable or a table column.
QUERY: SELECT id, current_crop, crop_cycle, current_crop_variety_id,
       planting_date, last_sowing_date, transplant_date, current_gdd
       FROM public.lands WHERE id = p_land_id
CONTEXT: PL/pgSQL function resolve_crop_phenology(uuid,date) line 25
```

Because the RPC raises before returning any row, `buildBiologicalState()` receives `null`, `landContext.biological_state` is never set, **no lock is ever installed**, and every legacy stage-writer path (GDD engine, `calculatePhenologicalStage`, context-validation reconciler, planting_date heuristic) continues to run and disagree. This is why edge logs still show three stage labels for one land in one turn (`VEGETATIVE`, `TILLERING`, `active_tillering`).

---

## Proof from edge logs (trace `trace_mr5neoev_xhzs7w`, 2026-07-04 00:53Z)

- `grep BIO_STATE_LOCKED` → **0 matches** (Phase-1 lock line never emitted)
- `grep BIO_STATE_WRITE_BLOCKED` → **0 matches** (no writer was ever blocked)
- `grep resolve_crop_phenology` / `phenology` → **0 matches** (RPC error is swallowed by supabase-js; no positive-path log)
- Same trace surfaces conflicting stage strings:
  - `Rule Engine Input … stage: "VEGETATIVE"` (LAND_CONTEXT)
  - `Core: crop=Rice, stage=active_tillering, DOS=26` (TS `calculatePhenologicalStage`)
  - `[PIPELINE_RULE_STAGE] … stage=TILLERING` (rule-engine normaliser)

The DB row for that land (`Shinghan Mal`, `30197c15-…`) has `crop_stage='Germination'`, `planting_date=NULL`, `last_sowing_date=NULL`, `stage_uuid=NULL` — none of those three stage strings comes from the DB. All are computed downstream.

---

## Root cause (exact)

`public.resolve_crop_phenology(uuid, date)` line 30:

```sql
SELECT id, current_crop, crop_cycle, current_crop_variety_id, …
  INTO v_land
  FROM public.lands WHERE id = p_land_id;
```

The function's `RETURNS TABLE (... crop_cycle text, current_gdd numeric, stage_uuid uuid ...)` clause makes `crop_cycle`, `current_gdd`, `stage_uuid` **implicit OUT variables**. `lands` also has columns with the same names. PostgreSQL cannot disambiguate → 42702 on every invocation.

The same latent ambiguity exists for at least `current_gdd` and `stage_uuid` inside the same SELECT — the exception fires on `crop_cycle` first, but fixing only `crop_cycle` would move the error to the next column.

Minimal safe fix (one migration, function body only, no signature change):
```sql
SELECT l.id, l.current_crop, l.crop_cycle, l.current_crop_variety_id,
       l.planting_date, l.last_sowing_date, l.transplant_date, l.current_gdd
  INTO v_land
  FROM public.lands l WHERE l.id = p_land_id;
```
Aliasing the table with `l.` removes the ambiguity for every column at once.

---

## Phase status vs. what has actually shipped

| Phase | Shipped | Runtime | Verdict |
|---|---|---|---|
| **1 — Immutable BiologicalState** | code merged (biological-state.ts, orchestrator, index.ts guards) | RPC error → `biological_state=null` on every call → 3 guards are dead code | ❌ inert |
| **2 — Fix Phase-G SQL (evaluate_stage_validation + apply_stage_transitions)** | migration `20260703182440_…sql` applied | Functions rewritten but still **no external caller** invokes them | ⚠️ compiles, dormant |
| **3 — Seed data** (variety_phenology_profile, stage_transition_conditions, stage_validation_rules, crop_stage_master.gdd_min/max) | not started | `vpp=0, stc=0, svr=0, csm_gdd=0` rows | ❌ blocking B/E/G |
| **4 — Kill client stage writer** in `SmartLandConfirmCard.tsx` / `src/lib/cropStage.ts` | not started | Client still writes English 7-bucket string into `lands.crop_stage` | ❌ B7 unresolved |
| **5 — Wire `apply_stage_transitions` into cron/orchestrator** | not started | Transitions table can never write to `stage_transition_log` in the field | ❌ |
| **6 — Expose GDD/`phenology_index` on canonical context for rule engine** | not started | Rules cannot predicate on GDD ranges | ❌ |

---

## Secondary issues that will bite immediately after Phase-1 unblock

1. **Two competing writers still assign `landContext.growth_stage` unconditionally when the resolver returns nothing** (orchestrator.ts:5108, :5961). The `blockStageWriteIfLocked()` guard is correct, but until Phase-1 RPC returns a row, both writers run and the log shows the drift.
2. `land_gdd_daily` has **795 rows** but `lands.current_gdd` is 0 for all sampled rows and `crop_stage_master.gdd_min/max` has **0 populated rows** — so even a healthy resolver cannot compute `phenology_index` from GDD; it would fall through to the DAS band with `confidence=0.75` for every land.
3. `stage_source='planting_date'` is being written to `lands` by some legacy path (visible on 4 lands) — this is a fourth stage authority not covered by the Phase-1 lock design.
4. `Shinghan Mal` (the land actively being chatted with) has `planting_date=NULL, last_sowing_date=NULL`. Even after the RPC is fixed, line 43 (`IF v_crop_code = '' OR v_sow_date IS NULL THEN RETURN;`) will short-circuit and biological_state will still be `null` for this land. The UI must ensure a sowing date is captured, or the resolver needs a defined "no sowing date" evidence path.

---

## Concrete recommendation

Ship **one micro-migration** that:

1. Rewrites `resolve_crop_phenology` with a table alias `l` for the initial SELECT (and for the two other selects that reference `crop_stage_master` columns colliding with OUT names — audit line-by-line while you're there).
2. Nothing else. No seed data, no rule change, no signature change.

Then re-run the same chat, tail edge logs for:
- `🔒 [BIO_STATE_LOCKED] land=… stage=… src=phenology_ssot` — must appear exactly once per turn.
- `[BIO_STATE_WRITE_BLOCKED] site=gdd-phenology-engine …` / `site=context-validation-reconciler …` — must appear on any turn where those legacy writers would have overwritten stage.
- The `Rule Engine Input` stage must equal the `[BIO_STATE_LOCKED]` stage. If they don't, we still have an un-guarded writer.

Only after that signal is clean should Phases 3/4/5 begin.
