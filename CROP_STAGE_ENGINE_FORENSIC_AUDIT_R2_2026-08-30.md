# Crop Biological Growth Stage Engine — Forensic Audit R2 (reconciliation + P1 fix package)

**Repo:** `kisanshaktiai/kisanshakti-ai-v1` · branch `kisanshakti-ai-update` · head `36a933a` (Lovable update, 2026-08-30 04:08 UTC)
**Live system:** Supabase project `qfklkkzxemsbeniyugiz`, verified 2026-08-30 05:10–05:30 UTC
**Method:** every claim below was checked against (a) the branch files, (b) the live database (`pg_get_functiondef`, row counts, per-land resolver census), (c) the deployed edge-function list (versions + build timestamps). Nothing is inferred from the earlier report; where the report and reality differ, reality is stated.

---

## 1. Verdict on the pasted audit — what is already done, what is not

The pasted document is the "2nd forensic audit". A P0 package answering it was committed by the user this morning (`42347bf`, 04:04 UTC: `20260830_stage_authority_p0.sql`, `20260830_clock_alignment_and_cache.sql`, `phenology-reconciler.ts` v11, `orchestrator.ts`, `ai-smart-schedule/index.ts`, `schedule-reconciler/index.ts` v1.2.1). The live DB confirms both migrations are applied.

| # | Audit finding | Branch | Live DB | Deployed function | Status |
|---|---|---|---|---|---|
| §8 | `autonomous_init` ledger rows relabelled `biological_ledger` at 0.85 | fixed (resolver v9) | **fixed** — all 6 autonomous-init lands resolve `das_ledger_provisional 0.50` | n/a | CLOSED |
| §9 | reconciler selects non-existent `transitioned_at` → transition tier silently dead | fixed (v11 selects `evaluated_at`, warns on failure) | n/a | **NOT deployed** — `ai-agriculture-chat` v47 built 2026-08-29 16:50 UTC, before the fix commit | OPEN in production |
| §11 | `Math.max(0.95, …)` promotes every photo to 0.95 | fixed (v11 keeps detector value) | n/a | NOT deployed (same build) | OPEN in production |
| §6 | `crop_thermal_anchor_policy` seed unapplied | seed file present | **0 rows** | n/a | OPEN by design (standing order: seed after the clean rice regeneration on 8897e53d) |
| §10 | `crop_growth_analysis` empty | — | 0 rows; `crop_growth_uploads` also 0 rows | `ai-crop-scan` build 2026-06-24 | OPEN — the photo pipeline has never produced one evidence row |
| §12 | 8 resolved / 34 unresolved | — | reproduced live: 8 / 34 | — | root cause identified below (§2.7) |
| P0 | `schedule-reconciler` v1.2.1 | on branch | — | **deployed** (v1, 05:03 UTC; file header confirms 1.2.1) | CLOSED |
| P0 | `ai-smart-schedule/index.ts` GDD-anchor fix | on branch | — | NOT deployed (v735 = Lovable's 01:30 UTC "Relaxed schedule validation") | OPEN in production |
| P0 | `stage_review_queue`, `sync_land_stage_cache`, retraction of the 30197c15 NDVI row and the 8897e53d init row | on branch | **applied** (`retracted=true`, `applied=false` on both rows) | n/a | CLOSED |
| §3.1 | crop-taxonomy fallback for cultivation method | present | present (1-arg resolver) | used by nightly writers + schedule-reconciler | **fixed in this package (F4)** |
| §4/§5 | authority vs confidence separation, evidence schema | not done | not done | — | **fixed in this package (F1)** |
| §7 | audit's "fail closed" | partial (transition tier only) | — | — | **completed in this package** (GDD + morphology tiers, policy-missing) |

Live facts the report got approximately right, now exact: 42 lands; `land_gdd_daily` 1,558 rows over 10 lands; `crop_stage_master` 233 active rows / 24 crops, GDD windows on rice only (21 rows), `phenology_index` populated on all 233; `variety_phenology_profile` 363 rows, rice only, DAS overrides only (0 GDD targets); `stage_transition_conditions`: 182 das, 175 event, 181 morphology_stage, 9 gdd, 1 ndvi active + 9 ndvi retired; lands missing variety 40, coords 9, GDD 32, `stage_uuid` 35; `crop_lifecycle_events` 19 rows (only HARVEST_COMPLETED / SCHEDULE_DEACTIVATED — no farmer stage observations exist yet).

---

## 2. Defects the pasted audit missed (all row/source-verified)

### 2.1 Photo evidence has no authority, even after v11
`phenology-reconciler.ts` v11 picks the winner by **maximum confidence**. A location-validated photo scored 0.62 loses to a GDD window at 0.90 — the exact inversion of the product principle ("the photo is the fact, the engine estimates"). Non-calendar transitions are still floored with `Math.max(0.90, stored)`. The morphology tier reads `crop_growth_analysis` by `land_id` only (a previous cycle's photo qualifies), and its errors are swallowed (`catch (_e) { // Optional signal }`).

### 2.2 The write layer re-creates the inflation one level down
- `apply_stage_transitions` stores the **rule's** confidence (0.95 on all 181 `morphology_stage` rules), never the detector's.
- `stc_eval_single('morphology_stage')` uses `coalesce(cga.confidence_score, 1)` — a NULL confidence counts as certainty; no crop/cycle boundary; no provenance (`location_validated` never consulted).
- `resolve_crop_phenology` v9: `greatest(0.85, ledger)` on every non-calendar ledger row, `greatest(., 0.90)` merely because a variety profile row exists, rule confidence in the [B] preview.

### 2.3 A photo can only ever advance the crop by one rung
All morphology rules are `from_stage → next_stage`. A photo showing booting while the calendar is stuck at tillering matches nothing; the evidence is dropped silently every night.

### 2.4 The photo producer is not evidence-grade
`ai-crop-scan` `growth_tracking` (deployed 2026-06-24): trusts client `expectedStage` / `landCrop` / `sowingDate`; **primes the vision model with the expected stage** (destroys independence); writes free-text stage names; defaults a missing confidence to **0.70** (`|| 70`); no server-side geofence (the client computes distance to the land *centre* with hardcoded 100 m / 500 m); stores a 7-day signed URL as the permanent `file_url`; never uses the crop's stage ontology. The client hook `useCropGrowthTracking.ts` reads columns that do not exist (`lands.sowing_date`, `lands.crop_name`, `ndvi_data.recorded_at`) and carries its own hardcoded stage calendar.

### 2.5 Ghost function
`ai-crop-growth-tracking` (v13, 2025-12-19) is ACTIVE in Supabase but absent from the repo: hardcoded per-crop DAS calendars (wheat/rice/cotton/soybean/sugarcane), `gpt-4o` dosages, the same non-existent columns, and it writes `crop_growth_analysis` with free-text stages and the same 0.70 default. It occupies one of the 99 function slots.

### 2.6 Split-brain cultivation method
Nightly writers (`run_daily_phenology`, `initialize_crop_cycle_stage`, `evaluate_stage_transitions`, `reconcile_schedule_for_land`) and the deployed schedule-reconciler call the 1-arg `resolve_crop_phenology`, which applies a crop-taxonomy fallback; the chat path (`resolve_crop_phenology_for_land → resolve_biological_profile`) has none. The fallback is wrong today: it forces sugarcane to `direct_seeded` while every sugarcane stage row is `sett_planted`, so lands cbb82a43 and ca9687fa can never resolve on the nightly path.

### 2.7 Most unresolved lands are a crop-identity problem, not a phenology problem
16 of 42 lands hold display/localized text in `lands.current_crop` with no `current_crop_id`: `ऊस` ×3, `गहू` ×3, `तांदूळ`, `राजमा` ×2, "Brinjal (Eggplant)", "Chickpea (Chana)", "Jowar (Sorghum)", "Carrot" ×2, "pulses", "Cluster Beans (Vegetable)". The resolver matches `lower(current_crop) = crop_code`, so these are structurally unresolvable. `crop_synonyms` resolves 10 unambiguously to crops that have a stage master; 6 have no ontology at all. Of the remaining unresolved lands, 2 have a sowing date but no lane (the sugarcane pair above) and the rest have no sowing date.

### 2.8 What already exists and makes the fix possible without new tables
`crop_growth_uploads.capture_location / location_validated / distance_from_land_meters / upload_timestamp / task_id / upload_type`; `lands.boundary` (PostGIS geography) + `center_lat/center_lon`; `crop_stage_aliases` (195 rows); `phenology_index` on every active stage; `stage_review_queue`; `feature_flags`; `system_config` already carrying an evidence-weight vocabulary.

---

## 3. The evidence contract (what "photo is the fact" means in code)

Two separate dimensions, everywhere (SQL and TS):

| Dimension | Meaning | Source |
|---|---|---|
| **authority** | which *kind* of evidence backs the stage: `morphology > farmer_observation > sensor > thermal_model > variety_calendar > calendar` | `system_config.stage_evidence_policy.authority_rank` |
| **confidence** | the source's *own* calibrated value — never floored, never promoted | detector / rule / model |
| **confirmation** | `ESTIMATED` (calendar / thermal / sensor inference) → `OBSERVED` (one validated photo or farmer event, this cycle) → `CONFIRMED` (≥ `min_photos_for_confirmation` validated photos agreeing within `confirmation_window_days`) | ledger evidence written by `apply_stage_transitions`; previews are never CONFIRMED |

A photo counts as evidence only if **all** hold (single SQL definition `stc_morphology_evidence`, used by every reader and writer): captured in *this* cycle (≥ cycle start), confidence NOT NULL and ≥ policy/rule minimum, `location_validated` against the land geometry (`validate_growth_upload_location`, PostGIS: 0 m when inside the boundary, else distance ≤ `photo.max_distance_m`), no `CROP_IDENTITY_MISMATCH / OFF_FARM_LOCATION / IMAGE_UNUSABLE / OUT_OF_LANE_STAGE / STAGE_UNDETERMINED` conflict. Missing policy row ⇒ photo tier **unavailable** (fail closed), never defaulted.

Arbitration (reconciler v12 and resolver v10): best authority wins; confidence only breaks ties inside a tier; every tier disagreement is returned as a conflict record and logged (`[PHENOLOGY_EVIDENCE_CONFLICT]`).

Ladder vs jump (`apply_stage_transitions` v2): a single-step morphology rule with one validated photo applies as `OBSERVED`; a forward jump of ≤ `max_auto_jump_steps` (2) backed by ≥ `min_photos_for_jump` (2) validated photos applies as `morphology_stage` with `evidence.jump=true`; anything further, with fewer photos, or **backward** is queued (`morphology_stage_jump` / `stage_regression_evidence`) — visible, never silent, never auto-applied.

Independence: the classifier sees the crop's stage **ontology** (lane-scoped `crop_stage_master`) but never the calendar stage; deviation is computed server-side as an ordinal difference in the same ontology. The farmer narration may know the expected stage but may not name products or doses.

---

## 4. Package delivered (all files: farmer-app repo `kisanshaktiai/kisanshakti-ai-v1`, branch `kisanshakti-ai-update`)

| File | What it does | Check performed |
|---|---|---|
| `supabase/migrations/20260830_stage_evidence_authority_p1.sql` | §0 policy row + `photo_stage_persist` flag (off); §1 `resolve_biological_profile` v2 (schedule → transplant-date inference → UNKNOWN; taxonomy fallback removed); §2 1-arg resolver delegates to the profile; §3 `stc_morphology_evidence` + `stc_evidence_summary`; §4 `stc_eval_single` v2; §5 `evaluate_stage_transitions` v2 (evidence.authority / rule_confidence / evidence_confidence / photo_count); §6 `stc_morphology_jump_candidate`; §7 `apply_stage_transitions` v2; §8 `resolve_crop_phenology` 9-arg v10; §9 `validate_growth_upload_location`; §10 review-queue entries. **No DDL.** | all 10 functions compile on local PostgreSQL 16 (stub tables for the 3 INSERT targets) |
| `supabase/migrations/20260830_land_crop_identity_repair.sql` | **APPROVAL-GATED** — re-codes 10 lands via `crop_synonyms` evidence, queues 6 without ontology, leaves an audit-trail row | compiles on local PG 16 |
| `supabase/functions/ai-agriculture-chat/runtime/phenology-reconciler.ts` (v12) | authority-first arbitration; stored confidence preserved; morphology tier via `rpc stc_morphology_evidence`; conflict records; `confirmation`; tier errors surfaced; policy from DB | tsc: 0 syntax errors |
| `supabase/functions/ai-agriculture-chat/agents/biological-state.ts` (v8) | additive `authority`, `confirmation`, `evidence_conflicts`, `evidence_sources` on the locked state + trace | tsc: 0 syntax errors |
| `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` | 21-line change at the reconciliation block: carries authority/confirmation/conflicts into the row before `buildBiologicalState`, warns on conflicts | syntax-error count unchanged vs branch (0 TS1xxx) |
| `supabase/functions/ai-crop-scan/index.ts` | `growth_tracking` branch rewritten as the evidence producer (server truth, blind ontology-constrained classification, geofence, canonical `stage_code`, honest confidence, conflict codes, no doses, ledger only via flag). `quick/full/targeted_solution` untouched. | tsc: 0 syntax errors |
| `src/hooks/useCropGrowthTracking.ts` | `analyzeUpload` sends identifiers only; surfaces server codes; warns when a photo is not evidence-grade | tsc: 0 syntax errors |
| this file | reconciled audit | — |

Policy defaults chosen (all tunable in `system_config.stage_evidence_policy`, none in code): `max_distance_m 150`, `max_age_days 21`, `min_confidence 0.6`, `signal_confidence_high 0.8`, `min_photos_for_confirmation 2`, `confirmation_window_days 10`, `max_auto_jump_steps 2`, `min_photos_for_jump 2`, transition decay `0.05 / 7 days`, floor `0.30`, stale after `14` days.

---

## 4a. Second-pass wiring verification (2026-08-30, after the package was written)

Every `table.column` reference in the package was extracted programmatically and checked against the live `information_schema`: **90 references in the two SQL files and 92 in the three TS files — 0 missing.** The four RPC calls (`stc_morphology_evidence` with its 5 named params, `validate_growth_upload_location`, `resolve_crop_phenology_for_land`, `apply_stage_transitions`) match the live/new function signatures. `evaluate_stage_validation(p_land_id uuid, p_target_stage text)`, `initialize_crop_cycle_stage(uuid)`, PostGIS (`postgis` extension present) and the `system_config.config_key` UNIQUE constraint were confirmed. Lands triggers that fire on the identity repair are only `trg_sync_land_stage_cache` (recomputes the display cache → stays `unresolved`, no dates) and `update_farmer_land_on_change` (acre totals); overlap triggers fire on `boundary_geom` only.

Two wiring defects were found in this pass and fixed in the delivered files:

| # | Defect | Fix |
|---|---|---|
| W1 | `phenology-reconciler.ts` (every version since v7, including v11 on the branch) selects `gdd_accumulated, gdd_date` from `land_gdd_daily`, whose real columns are **`cumulative_gdd`, `obs_date`**. PostgREST rejected the query and the silent catch disabled the GDD tier on every chat turn — the reconciler's thermal tier has **never** run in production. (`decision/authoritative-state-loader.ts`, updated by you today, already uses the correct columns.) | v12 selects `cumulative_gdd, obs_date`, orders by `obs_date`, and falls back to the resolver's `current_gdd` (not the non-existent `gdd_accumulated`); failures now warn |
| W2 | `biological-state.ts` maps `gdd_accumulated` from a `gdd_accumulated` field that the resolver row never carries (it is `current_gdd`), so the locked state — and the orchestrator's GDD read at line 6495 — was always null | v8 accepts `current_gdd` (numeric or PostgREST string) as well |

Type consumers were checked: `phenology-reconciler.ts` is imported only by `orchestrator.ts`; the other `is_locked: true` literals in the codebase are the CanonicalContext contract and test mocks cast `as any`, so the new required fields on `BiologicalState` break nothing.

## 5. Deploy order

0. Commit the 8 files to `kisanshakti-ai-update` at the paths in §4 (the edge functions are deployed from the repo tree, so the commit must land before steps 2–4).
1. Run `supabase/migrations/20260830_stage_evidence_authority_p1.sql` through the SQL runner (after the two P0 migrations — both already live). Run the validation block at its foot: 8 lands resolve at `resolver_version 10`; 30197c15 reads `biological_ledger 0.85 authority:thermal_model confirmation:ESTIMATED` (legacy GDD row, confidence preserved). Nothing in steps 2–4 depends on the migration for *safety* (the TS fails closed without the policy row), but the photo tier stays unavailable until it is applied.
2. Deploy `ai-agriculture-chat` (whole function folder) — this is what finally ships reconciler v11 **and** v12, biological-state v8 and the orchestrator patch; production still runs the 2026-08-29 16:50 UTC build with the dead transition tier and the dead GDD tier.
3. Deploy `ai-crop-scan` (single file).
4. Deploy `ai-smart-schedule` (the GDD-anchor fix committed at 04:04 UTC is still not in production).
5. Apply `supabase/migrations/20260830_land_crop_identity_repair.sql` **only after your approval** (data change; independent of step 1).
6. Delete the legacy `ai-crop-growth-tracking` function (approval; frees a slot; nothing in the repo calls it).
7. Thermal-anchor seed (`20260829_seed_crop_thermal_anchor_policy.sql`): unchanged standing order — only after the clean rice regeneration on 8897e53d.
8. Smoke test with one real photo taken inside a land boundary (case C in §6), then one taken outside (case D).

Nothing in this package was applied or deployed by the auditor.

---

## 6. Regression matrix (run after step 2)

| Case | Setup | Expected |
|---|---|---|
| A — calendar only | land with sowing date, no ledger, no photos | `das_provisional 0.50`, `authority:calendar`, `confirmation:ESTIMATED` |
| B — GDD vs calendar | land 30197c15 | ledger GDD row wins the resolver (`biological_ledger 0.85`, thermal_model, ESTIMATED); reconciler reports any gdd_model disagreement as a conflict |
| C — one validated photo, next stage | insert `crop_growth_uploads` (capture inside boundary) + `crop_growth_analysis` with canonical `stage_code` of the next stage, confidence 0.7 | `stc_eval_single` true; nightly `apply_stage_transitions` writes `morphology_stage` at **0.7** (not 0.95), `confirmation observed`; chat reconciler winner = morphological_evidence with authority morphology |
| D — same photo off-farm | same as C, capture 2 km away | `validate_growth_upload_location` → validated false; photo excluded everywhere; conflict `OFF_FARM_LOCATION` recorded by ai-crop-scan |
| E — photo two stages ahead, 1 photo | detected stage = anchor + 2 | no ladder match → `jump_needs_review`, review-queue row `morphology_stage_jump`; nothing applied |
| F — photo two stages ahead, 2 photos within 10 days | two validated rows | applied as `morphology_stage`, `evidence.jump=true`, `confirmation confirmed`, confidence = weakest photo |
| G — photo earlier than ledger | detected stage index < anchor | `regression_evidence_queued`; ledger untouched |
| H — NULL confidence row | legacy row with `confidence_score NULL` | excluded (was counted as 1.0) |
| I — previous cycle photo | analysis `created_at` < sowing date | excluded |
| J — policy row deleted | `delete from system_config where config_key='stage_evidence_policy'` (test env) | morphology tier unavailable, reconciler logs `[STAGE_EVIDENCE_POLICY_MISSING]`, resolver tags `policy:missing`; calendar/GDD/ledger still work |
| K — sugarcane, no schedule method | cbb82a43 | nightly and chat paths agree (`cultivation_method:unknown`); no forced `direct_seeded` |

---

## 7. Residual gaps (not fixed here — need a decision or a schema change)

- **Permanent photo reference.** `file_url` is a 7-day signed URL; the evidence becomes unopenable after a week. Needs a `storage_path` (or equivalent) column on `crop_growth_uploads` — schema change, not made without approval.
- **Variety DAS overrides** reach the plausibility gate and expected metrics but not the provisional calendar pick ([C] window). Queued as `variety_das_override_not_in_calendar_window` for agronomic sign-off.
- **Land writer** stores display labels in `lands.current_crop` (see §2.7). The repair file fixes the data; the writer (`save-land` / `lands-api`) must store `crops.value` + `crops.id`.
- **Farmer stage observations** (`observation`/`event` rules) have no producer yet — `crop_lifecycle_events` only holds harvest/deactivation events.
- **Client geofence** in `TaskPhotoUploadDialog.tsx` (centre-distance, 100/500 m) can stay as UX guidance; the server result is now authoritative.
- **Narration cost**: growth_tracking now makes two vision calls (blind classifier + narration). If cost matters, the narration pass can be made optional per tenant.
