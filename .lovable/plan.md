# Rice-Crop End-to-End Audit & Fix Plan

## Why the AI chat skips observation/clarification

Audit of the live DB for `rice` (1846 active rules, 28 hypotheses, 1166 intent→observation mappings) surfaced **four root-cause defects** that prevent the symbolic brain from ever offering a clarification card for rice queries — the orchestrator silently scores every hypothesis at ~0 and the response collapses into the generic "OBSERVATION/monitor" fallback.

### Root causes (rice)

1. **Case mismatch — hypothesis ↔ observation_master.**
   `hypothesis_conditions.condition_key` for rice is stored UPPERCASE (`YSB_DEAD_HEART`, `BLAST_LEAF_LESIONS`, `BPH_HOPPER_BURN`, …). `observation_master.observation_code` is stored lowercase (`ysb_dead_heart`, …).
   - 27 distinct OBSERVATION condition_keys exist for rice; **27 of 27 fail exact-match against observation_master** (26 match if compared case-insensitively, 1 is the wildcard `reported_codes`).
   - The hypothesis evaluator's pre-filter and `matched_conditions` join therefore returns 0 candidates → confidence < gate → no clarification surfaced.

2. **observation_master not tagged for rice.**
   Only **5 rows** in `observation_master` carry `crop_group='rice'` and **0 rows** list `'rice'` in `applicable_crop_groups`. But 70 distinct observation codes are actually used by the rice intent_observation_mapping. The brain's crop-scope pre-filter therefore drops most rice symptoms.

3. **No stage discrimination for rice mappings.**
   All 1228 `intent_observation_mapping` rows for rice use `growth_stage='all'`. Stage-aware narrowing (NURSERY / TILLERING / PI / FLOWERING / GRAIN_FILLING) never fires for rice; sugarcane uses proper stages.

4. **Communication-generator null-crash side-effect (already patched last turn).**
   `extractRepeatApplicationInfo()` returning `null` on non-treatment paths crashed the pipeline and forced the fallback "OBSERVATION" reply, masking root causes (1)–(3). Patch is in place; need regression tests so it cannot recur.

### What is healthy (verified)

- `decision_rules` rice coverage is broad (138 rows across 17 categories, all with `canonical_group` + `conditions_json` populated).
- `hypothesis_rule_mapping` for rice has **0 orphan rule_ids**.
- `intent_observation_mapping.observation_code` for rice matches `observation_master` (0 missing).
- `crops` / `crop_synonyms` / `crop_stage_master` / `cultural_strategies` / `disease_risk_model` / `crop_baseline_guidelines_v2` all have rice rows.

---

## Fix plan

### Phase A — Data integrity migrations (rice + global)

A1. **Normalize `hypothesis_conditions.condition_key` to lowercase** for `condition_type='OBSERVATION'` across all crops (sugarcane condition_keys already lowercase — verify and only touch rice + any other crop showing the mismatch). Add a `CHECK (condition_key = lower(condition_key))` invariant for OBSERVATION rows. Bump `hypothesis_master.version_hash` for affected hypotheses so the snapshot trigger fires (per Core rule on text-PK snapshot triggers).

A2. **Tag observation_master for rice.** For every observation_code that appears in `intent_observation_mapping WHERE crop_code='rice'` OR in rice hypothesis `condition_key` (post-A1 normalization), set `crop_group='rice'` if currently NULL/empty, else append `'rice'` to `applicable_crop_groups`. Expected: ~70 rows updated.

A3. **Stage-segment rice intent→observation mappings.** Replace the blanket `growth_stage='all'` rows for biotic and nutrition intents with stage-scoped rows (`nursery`, `tillering`, `panicle_initiation`, `flowering`, `grain_filling`, `maturity`) using `crop_stage_master.crop_code='rice'` as the SSOT. Keep `'all'` only for weather/irrigation/weed intents that are genuinely stage-agnostic. Expected: ~1000 rows re-fanned out from 1 stage to ~5 stages.

A4. **Backfill `observation_aliases`** for the 5–10 historic UPPERCASE keys we want to keep accepting from older clients (alias → canonical lowercase).

### Phase B — Symbolic brain hardening (code)

B1. **Case-insensitive condition matching guard** in `hypothesis-evaluator.ts` — normalize both sides (`condition_key.toLowerCase()` and `observation_code.toLowerCase()`) before set-membership / matched_conditions joins, so future drift cannot silently zero out scores again. Emit `SYMBOLIC_CONTRACT_VIOLATION` log when an UPPERCASE OBSERVATION condition_key is encountered (catches data regressions).

B2. **Crop-scope filter fallback.** When `observation_master.crop_group` is empty for an observation_code that the intent map already attached to a rice intent, treat the observation as in-scope rather than dropping it (defensive — backs up A2).

B3. **Strict invariant test fixture** (`tests/chat/rice-clarification-pipeline.test.ts`) that simulates 6 representative rice queries (BPH hopper burn, YSB dead heart, blast lesion, khaira zinc deficiency, sheath blight, drought rolling) and asserts the orchestrator returns a `clarification` mode with ≥2 candidate hypotheses each. Add the existing `extractRepeatApplicationInfo(null)` case to the regression suite.

### Phase C — Verification

C1. Re-run the SQL audit suite and confirm: `rice_hyp_obs_keys_missing_in_master = 0`, `obs_master_rice ≥ 70`, distinct rice stages ≥ 5.
C2. Run the new vitest fixture (`bunx vitest run tests/chat/rice-clarification-pipeline.test.ts`) — must be green.
C3. Live trace: send "मेरे चावल में हॉपर बर्न दिख रहा है" via the `/app/chat` preview; capture edge-function logs and verify `[orchestrator] mode=clarification, candidates>=2` and a clarification card renders before any final advisory.

### Out of scope (will report, not fix in this pass)

- Other crops' case/stage health (will surface in C1's broader query but only rice gets fixed unless the user asks).
- Re-seeding `decision_rules` content — current rules are rich enough; we are only fixing the linkage.

## Technical details

- Migration SQL will be authored in three numbered files (A1, A2, A3) so each can be reviewed individually; A1 must run first because A2's join depends on lowercase keys.
- All `CREATE/ALTER` statements respect the Core rule: snapshot triggers reference `NEW.hypothesis_id` / `NEW.observation_code`, never `NEW.id`.
- No new tables → no new GRANTs required; A2/A3 are pure data UPDATEs/INSERTs that go through the `supabase--insert` tool, not migrations.
- Edge function changes are limited to `hypothesis-evaluator.ts` (B1/B2) plus a new test file; no orchestrator surgery, no LLM-prompt edits, no UI changes.
- After Phase A I will update `mem://intelligence/rice-clarification-pipeline-invariants` with the new rules so future agents cannot reintroduce the case drift.
