## Architectural premise (corrected)

`crop_stage_master` is the **ontology SSOT** (stage definitions, DAS windows, ontology_id). It is **not** the runtime SSOT.
The **runtime SSOT** is a single SQL function `resolve_crop_stage_full(land_id, as_of_date)` that returns a structured RECORD. Every subsystem (orchestrator, decision brain, rule evaluator, clarification, scheduler, alerts, logs, UI) reads stage **only** from that record. `lands.crop_stage` and `conversation_state.growth_stage` (text) become deprecated read-only caches.

```text
ontology (defs)         runtime inputs              SSOT function          consumers
─────────────           ──────────────              ─────────────          ─────────
crop_stage_master  ─┐   crop_schedules ─┐                                ┌─ orchestrator
crop_stage_aliases ─┼─▶ lands           ─┼─▶ resolve_crop_stage_full ─▶ ├─ decision brain
crop_stage_graph   ─┘   current_date    ─┘     RECORD (stage_uuid,      ├─ rule evaluator
                                                growth_stage, das,      ├─ clarification
                                                reference_system,       ├─ scheduler
                                                phenology_index,        ├─ smart alerts
                                                ontology_id,            ├─ decision logs
                                                next/prev_uuid,         └─ UI display
                                                resolver_version,
                                                confidence)
                                                       │
                                                       ▼  trigger / nightly cron
                                                lands.stage_uuid (cache)
                                                ai_chat_sessions.stage_uuid (cache)
```

## Evidence that forced this rewrite

1. `lands.crop_stage` is NULL on 7/10 active schedules; the 3 populated rows all say `"Germination"` regardless of DAS (one sugarcane land at DAS=175 should be `grand_growth`). The client heuristic is still writing.
2. `crop_schedules` has **no** `transplant_date`. Without it, DAS for transplanted crops (rice/onion/tomato/brinjal/chilli) is wrong by ~21 days. Phase 0 must add it.
3. `lands.current_crop` ≠ `crop_schedules.crop_name` on 2/10 rows. The resolver MUST take crop from the active `crop_schedules` row, not `lands.current_crop`.
4. `lands` already has 21 BEFORE triggers — new sync trigger must order safely in the chain.
5. `crop_stage_master.reference_system` exists with values `DAS|DAT|DAP|DAE` — must branch on it.
6. `crop_stage_graph` has 56 `STAGE_PRECEDES` edges — resolver can return `next/prev_stage_uuid` in one call.
7. `crop_stage_master` has **no rows for groundnut** but `crop_schedules` has active Groundnut rows — silent NULL failure if resolver ships first.

## Phase 0 — Pre-flight (must ship before Phase 1)

1. Migration: `ALTER TABLE lands ADD COLUMN transplant_date DATE`; `ALTER TABLE crop_schedules ADD COLUMN transplant_date DATE`.
2. Backfill `lands.transplant_date` from `cultivation_date`/`planting_date` **only** for crops whose `crop_stage_master.reference_system='DAT'`.
3. Seed groundnut into `crop_stage_master` (Kharif ICAR-DGR Junagadh): `germination 0-10, seedling 10-20, vegetative 20-45, flowering 45-65, pegging 60-75, pod_development 75-100, pod_filling 100-120, maturity 120-135, harvest 125-140` — all `lower_snake_case`, `reference_system='DAS'`, with `ontology_id`, `phenology_index`, `stage_node_type='biological'`.
4. Sweep `crop_stage_master` for any other crops referenced by active `crop_schedules` rows but missing stage rows; report and seed.

## Phase 1 — Runtime SSOT function (`resolve_crop_stage_full`)

`CREATE FUNCTION public.resolve_crop_stage_full(p_land_id uuid, p_as_of_date date DEFAULT current_date) RETURNS TABLE(stage_uuid uuid, growth_stage text, ontology_id text, phenology_index numeric, stage_node_type text, crop_cycle text, reference_system text, das integer, next_stage_uuid uuid, prev_stage_uuid uuid, resolver_version text, confidence numeric) SECURITY DEFINER SET search_path = public`.

Algorithm:
1. Resolve `(crop_name, sowing_date)` from latest `crop_schedules` row where `land_id=p_land_id AND is_active=true` (NOT from `lands.current_crop`).
2. Detect `reference_system` from `crop_stage_master` for that crop (`DAS` default).
3. Compute day count by reference:
   - `DAS` → `as_of_date - sowing_date`
   - `DAT` → `as_of_date - COALESCE(lands.transplant_date, sowing_date)`
   - `DAP`/`DAE` → analogous columns once seeded
4. Pick row from `crop_stage_master` where `crop_code = lower(crop_name) AND stage_node_type='biological' AND das BETWEEN das_min AND das_max`, ordered by `phenology_index DESC` (most advanced match).
5. Look up `next/prev_stage_uuid` via `crop_stage_graph` where `edge_type='STAGE_PRECEDES'`.
6. Return RECORD with `resolver_version='2.0'`. Return zero rows when crop is unknown or unseeded — never invent.

Hard constraint: this is the **only** function allowed to compute stage at runtime. Add a comment + repo lint rule.

## Phase 2 — Caches & triggers (lands + sessions)

1. `ALTER TABLE lands ADD COLUMN stage_uuid uuid REFERENCES crop_stage_master(id)`, `phenology_index numeric`, `reference_system text`, `stage_resolved_at timestamptz`, `resolver_version text`.
2. BEFORE INSERT/UPDATE trigger `sync_land_stage_cache` (added to existing 21-trigger chain after `prevent_land_overlap`): when `crop_code`, `last_sowing_date`, `planting_date`, `cultivation_date`, or `transplant_date` changes, call `resolve_crop_stage_full(NEW.id)` and write `stage_uuid`, `crop_stage` (text mirror), `phenology_index`, `reference_system`, `stage_resolved_at`, `resolver_version`. **Silent overwrite** if a client-supplied `crop_stage` disagrees — never RAISE EXCEPTION (would break new-land flow when ontology gap exists). When resolver returns nothing: leave existing values, log `[STAGE_SSOT] source=null reason=no_schedule|ontology_gap`.
3. CHECK `crop_stage ~ '^[a-z_]+$' OR crop_stage IS NULL` (added AFTER the cleanup UPDATE so the 3 "Germination" rows are first overwritten by the trigger).
4. `pg_cron` nightly job at 00:30 IST: `UPDATE lands SET (...) = (SELECT ... FROM resolve_crop_stage_full(id)) WHERE is_active=true AND deleted_at IS NULL` — keeps cache honest on passive days (the DAS=175/"Germination" class of bug).
5. `ai_chat_sessions.conversation_state` JSONB gains: `stage_uuid`, `resolver_version`, `ontology_version`, `das_snapshot`, `reference_system`, `resolved_at`. No schema migration — JSONB shape only. Old `growth_stage` text key kept read-only for one release for replay compatibility.

## Phase 3 — Edge function refactor (`ai-agriculture-chat`)

1. `agents/canonical-state-builder.ts`: on session bootstrap, call `resolve_crop_stage_full(land_id)` **once**, store the full RECORD in `canonicalContext.stage` (object, not string). No string remap, no Title-Case fallback.
2. `agents/orchestrator.ts:1331`: delete `?? landContext?.current_crop_stage`. Source of stage is `canonicalContext.stage.stage_uuid` only. When `stage_uuid` is null → route to `STAGE_UNKNOWN` clarification (new branch); never default.
3. `utils/stage-normalizer.ts`: delete hardcoded `SEEDLING/VEGETATIVE/REPRODUCTIVE/MATURITY` regex and `STAGE_DB_MAP`. `getStageCategory(stage, crop)` returns `getStageCategoryFromDB` or `null`.
4. `utils/stage-knowledge-cache.ts`: `getStageByDAS` is deprecated for orchestrator use — only `resolve_crop_stage_full` may compute. Cache stays for the knowledge map (`crop_stage_knowledge` lookups by `stage_uuid`).
5. `layered-rule-evaluator.ts`: keep `stage_applicable TEXT[]` schema, but resolve every token through `crop_stage_aliases` → `stage_uuid` before comparing against `canonicalContext.stage.stage_uuid`. UUID equality replaces the `toUpperCase().replace(/[\s-]/g,'_')` string match. `STAGE_FAMILIES` rewritten as `stage_uuid → stage_uuid[]` map sourced from `crop_stage_graph`.
6. `decision/intent-resolver.ts`, `decision/db-observation-validator.ts`, `decision/hypothesis-evaluator.ts`, `decision/symbolic-reasoner.ts`, `decision/pipeline-self-check.ts`, `runtime/conversation-state.ts`, `runtime/clarification-contract.ts`, `runtime/decision-graph-navigator.ts`, `runtime/runtime-trace-collector.ts`: all stage reads switch to `canonicalContext.stage.stage_uuid` + `growth_stage` (display only).
7. `runtime/conversation-state.ts::stage_source` enum: ADD `'resolver_v2'`. Keep legacy values for one release for forensics, but log `[STAGE_SSOT] WARN legacy_source=...` whenever they appear.
8. Structured forensic log at every stage read site:
   `[STAGE_SSOT] land_id, crop, sowing_date, transplant_date, reference_system, das, stage_uuid, growth_stage, ontology_id, phenology_index, resolver_version, source, alias_used, confidence`.

## Phase 4 — Client retirement & schema lock-down

1. Delete `stageFromProgress()` in `src/lib/cropStage.ts`. `deriveCropCycle` keeps only `expectedHarvestDate`, `daysSinceSowing`, `progressPercent`, `plantingDate`, `cultivationDate`, `lastSowingDate` — no `stage`/`stageKey`.
2. `SmartLandConfirmCard.tsx:242` stops sending `crop_stage`. Adds `transplant_date` field (conditional on crop's reference_system).
3. `src/services/landsApi.ts` + `supabase/functions/lands-api/index.ts`: drop `crop_stage` from writable payload schema; ignore any inbound value (defence-in-depth alongside the trigger).
4. New `useCropStageLabel(stage_uuid, lang)` hook → joins `crop_stage_master.stage_description` + i18n keys. UI never computes, only displays.
5. i18n: add per-`growth_stage` keys for en/hi/mr (e.g. `germination` → "अंकुरण", "उगवण").

## Phase 5 — Decision-rules bridge (no schema change)

`decision_rules.stage_applicable` stays `TEXT[]` for now. The evaluator resolves each token via `crop_stage_aliases` to a `stage_uuid` set at load time and compares UUIDs. Long-term migration to `rule_stage_mapping(rule_uuid, stage_uuid)` is tracked as a separate epic; not blocking.

## Phase 6 — Verification

1. SQL parity: `SELECT id FROM lands WHERE stage_uuid IS DISTINCT FROM (resolve_crop_stage_full(id)).stage_uuid` → 0 rows.
2. SQL vocabulary: `SELECT DISTINCT crop_stage FROM lands` ⊂ `crop_stage_master.growth_stage ∪ {NULL}`.
3. Reference-system test: insert rice land with `sowing_date=today-50d`, `transplant_date=today-29d` → resolver returns `active_tillering` via `DAT=29`, not nursery via `DAS=50`.
4. Sugarcane regression: the DAS=175 land becomes `grand_growth` (`phenology_index=4.0`, `ontology_id=AG_STAGE_SC008`) on next cron run.
5. Edge replay: a missing-DAS query routes to `STAGE_UNKNOWN` clarification with zero `landContext` / `default` source lines in logs.
6. Forensic log: every request emits exactly one `[STAGE_SSOT] source=resolver_v2` line per stage read.
7. UI smoke: Marathi farmer creates new land → card shows DB-resolved Devanagari label, never the old 7-bucket English string.

## Explicitly out of scope (later epics)
- Replacing `stage_applicable TEXT[]` with `rule_stage_mapping(uuid)`.
- Dropping `lands.crop_stage` text column entirely.
- Migrating `crop_schedules.crop_name` to FK on `crops`.
- Ontology versioning beyond `resolver_version='2.0'` (recorded but not yet used for replay branching).
