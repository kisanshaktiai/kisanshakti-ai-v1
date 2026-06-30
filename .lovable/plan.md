# KisanShakti AI — Ontology, Crop-Stage & Variety Forensic Audit

**Scope:** runtime brain path (orchestrator → stage resolver → rule evaluator → decision brain → scheduler → AI chat). **Mode:** evidence-only, no code, no migration.

## 0. Executive Summary

The Runtime SSOT (`resolve_crop_stage_full()` + `lands.stage_uuid` + sync triggers, migration `20260630084234`) is **landed in the DB but unread by the brain**. `rg` across `supabase/functions/ai-agriculture-chat/` returns **0 hits** for `resolve_crop_stage_full`, `stage_uuid`, `phenology_index`. The orchestrator still reads `landContext.growth_stage` (recomputed in `authoritative-state-loader.ts:615`) and falls back to legacy `lands.crop_stage`.

The **Variety dimension is effectively absent at runtime**:
- `master_products`: 113 varieties with `maturity_days_min/max`, `disease_resistance`, `yield_potential` — never read by the brain.
- `lands.current_crop_variety_id`: only 2 rows populated, never read.
- `crop_baseline_guidelines_v2.variety_id`: column exists, **0 rows populated**.
- `variety_resistance` (183), `variety_translations` (904) — orphaned from brain.

Ontology is crop-level only. Short-duration (90d) and long-duration (160d) rice resolve to identical stages, DAS bands and rules — the central scientific defect.

**Verdict:** Stage SSOT fixed in DB. Variety phenology / stage operations / stage transition conditions / GDD: **no SSOT exists**. Four new ontology objects + two columns are required. All proposed changes are additive — production keeps working.

## 1. Existing Schema (evidence)

| Table | Rows | Role | SSOT? |
|---|---|---|---|
| `crop_stage_master` | 120 (12 crops, sugarcane 2 cycles) | DAS-banded stages | Ontology SSOT ✅ |
| `crop_stage_graph` | 56 edges | Transitions (duration only) | Underused |
| `crop_stage_aliases` | 195 | Alias → canonical_id | Used ✅ |
| `crop_baseline_guidelines_v2` | 97 (variety_id=0) | Nutrient/water windows | `variety_id` unused ⚠ |
| `crop_stage_knowledge` | RLS off | Pre-ontology cache | Duplicates master ⚠ |
| `lands.crop_stage` (text) | legacy | Now trigger-overwritten ✅ | Was the bug |
| `lands.stage_uuid` (FK) | trigger-maintained | Runtime SSOT cache | ✅ (unread by TS) |
| `master_products` | 196 (113 varieties) | Has maturity_days_min/max, resistance, yields | Unread |
| `variety_resistance` | 183 | `(variety_id, observation_code, resistance_level)` | Unread |
| `crop_schedules.crop_variety` (text) | 28 | Free text, no FK | Ungoverned |

## 2. Stage Dependency Graph (40 files; 0 read the new SSOT)

```text
Client SmartLandConfirmCard → cropStage.ts (heuristic)
   ↓
lands.crop_stage (legacy text, now overwritten)   lands.stage_uuid (UNREAD ✗)
   ↓
authoritative-state-loader.ts:615
  "FIXED: Compute growth_stage from sowing_date since current_stage column doesn't exist"
   ↓
landContext.growth_stage
   ↓
canonical-context-contract.ts → canonicalContext.growth_stage
   ↓
orchestrator.ts:1331  stage = canonicalContext?.growth_stage ?? landContext?.current_crop_stage
orchestrator.ts:1945-1968  4-way fallback chain
   ↓
ConversationState.stage → layered-rule-evaluator / hypothesis-evaluator
                       → clarification-generator / deterministic-response-builder
```

## 3. SSOT Violations

| Concept | Should own it | Other places | Drift |
|---|---|---|---|
| Stage code | `crop_stage_master.stage_code` | `lands.crop_stage`, `crop_schedules.*`, `conversation_state.stage` | HIGH |
| DAS | resolver | `lands.das`, recomputed in TS | MEDIUM |
| Maturity duration | `master_products` (variety) | `crops.duration_days` (1 row), `cropStage.ts` heuristic | HIGH |
| Stage aliases | `crop_stage_aliases` | static maps in `stage-normalizer.ts`, `STAGE_FAMILIES` | MEDIUM |
| Variety identity | `master_products.id` | `crop_schedules.crop_variety` free text | HIGH |
| Variety phenology | — | — | **BLOCKER (missing)** |
| Stage operations | — | implicit in `decision_rules`, scheduler | **HIGH (missing)** |
| Stage transitions | `crop_stage_graph` (duration) | no GDD/event triggers | Incomplete |
| GDD | — | — | **BLOCKER (missing)** |

## 4. Variety & Phenology Audit

Structurally impossible today: variety-specific DAS windows, hybrid vs OPV stage curves, ratoon disambiguation (no `lands.crop_cycle`), DSR vs transplanted rice differentiation beyond `transplant_date`, perennials (not in master), GDD, variety-aware nutrient curves, resistance-aware hypothesis pruning. DAS is calendar-only — a 2030 brain must accumulate GDD and modulate stages by variety.

## 5. Proposed Ontology — Decision Matrix

| # | Object | Decision | Priority | Justification |
|---|---|---|---|---|
| **T1** | `variety_phenology_profile` (variety_id × crop_stage_id → das/gdd overrides) | **CREATE NOW** | CRITICAL | Unlocks variety-aware resolver; N×M can't fit elsewhere |
| **T2** | `stage_operations` (sow/transplant/spray/harvest windows per stage) | **CREATE NOW** | CRITICAL | Backbone for scheduler; replaces free-form gen |
| T3 | `stage_transition_conditions` (triggers: days/gdd/observation/event) | LATER (Phase 2) | HIGH | Replaces graph duration-only after GDD lands |
| T4 | `stage_validation_rules` (window/plausibility guards) | LATER (Phase 2) | HIGH | Centralises scattered TS guards |
| T5 | `stage_expected_conditions` | **REJECT** | — | Extend `crop_baseline_guidelines_v2` (already has stage+variety FKs) |
| T6 | `variety_stage_profile` | **REJECT** | — | Subsumed by T1 |
| **C1** | `lands.crop_cycle` (`plant\|ratoon1\|ratoon2`) | **CREATE NOW** | CRITICAL | Sugarcane ratoon disambiguation already broken |
| **C2** | `crop_stage_master.base_temperature_c` | CREATE NOW | HIGH | Pre-req for GDD |
| C3 | `crop_stage_master.requires_photoperiod` | LATER | MEDIUM | Photoperiod-sensitive crops |
| C4 | Backfill `crop_baseline_guidelines_v2.variety_id` | DATA TASK | HIGH | Column exists, 0 rows |

## 6. Backward Compatibility

All additive. New tables: no impact. New columns: nullable + defaulted. `resolve_crop_stage_full()` v2/v3 appends fields; existing callers unaffected. No deprecations this phase.

## 7. Migration Roadmap (each step independently deployable, zero downtime)

| Step | Action | Type |
|---|---|---|
| **0** | **Wire orchestrator to read `resolve_crop_stage_full()` / `lands.stage_uuid`** | Code only |
| 1 | Add `lands.crop_cycle` + `crop_stage_master.base_temperature_c` | Migration |
| 2 | Create `variety_phenology_profile` (T1), seed top varieties for rice/cotton/sugarcane | Migration + data |
| 3 | Extend resolver to honour T1 via `lands.current_crop_variety_id` | DB function |
| 4 | Create `stage_operations` (T2), seed 12 crops | Migration + data |
| 5 | Refactor scheduler to read T2 | Code only |
| 6 | Backfill `crop_baseline_guidelines_v2.variety_id` | Data |
| 7 | Add `requires_photoperiod` + GDD accumulator cron; resolver v3 returns `gdd_accumulated` | Migration + cron |
| 8 | Create `stage_transition_conditions` (T3) | Migration |
| 9 | Create `stage_validation_rules` (T4); retire scattered TS guards | Migration + code |
| 10 | Hook `variety_resistance` into hypothesis-evaluator | Code only |

## 8. Validation Gate (all 4 proposed tables pass)

T1–T4 each: no duplication, solves real defect, improves symbolic reasoning, supports all crops + varieties + sensors + GDD + DAS/DAP/DAT + multilingual + brain integration. T5/T6 fail (duplication) → rejected.

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Variety curation bandwidth | Seed top-10 per major crop; fall back to `crop_stage_master` when T1 absent |
| Resolver signature drift | Append-only fields |
| GDD weather cost | Daily Tmax/Tmin from `weather_aggregates` suffices |
| TS still reads legacy `growth_stage` | Step 0 fixes this BEFORE any new table lands |

## 10. Deliverables on Approval

On approval (build mode), I will:

1. Write the full report to `/mnt/documents/ONTOLOGY_STAGE_VARIETY_FORENSIC_AUDIT.md` and emit a `<presentation-artifact>` so you can download it.
2. **Stop and wait** before any code or migration changes — Steps 0/1/2 each ship as separate approval cycles.

No edits will happen until you say "go".
