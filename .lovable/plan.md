# Neuro-Symbolic Brain — Deep Audit & Fix Plan (Revised, DB-first)

Verified against live source and DB. The real disease is not "codes don't exist" but **broken graph edges**: Intent → Observation → Hypothesis → Rule is disconnected at the stage-filter and provenance layers. Fixes are ordered by graph-repair priority, not by ticket number. Agronomy ontology must live in the DB, never in TypeScript.

## Verified findings (live)

| # | Bug | File / Table | Evidence |
|---|---|---|---|
| B1 | Vocabulary ceiling `.limit(2000)` on `observation_master` | `utils/llm-output-validator.ts:60,109,169`; `i18n/translation-loader.ts:260` | `observation_master`: **1997 active / 2540 total** — 3 rows from silent truncation |
| B2 | Raw farmer text lowercased into "observation code" and pushed to SEMANTIC_GATE | `agents/orchestrator.ts:3608–3612` | Log shows `भात_अजून_उगवले_नाही` reaching the gate with `semantic_class=null` |
| B3 | Stage synonyms hardcoded in TS; `transplanting` missing emergence-family neighbours | `decision/iom-gate.ts:52 STAGE_SYNONYMS` | IOM returns only 5 `all` rows for `(EMERGENCE_FAILURE, rice, transplanting)` while 28 valid rows exist for nursery/seedling/germination |
| B4 | IOM queried with locked calendar stage even after contradiction is detected | `agents/orchestrator.ts:3010–3037` sets `bio.contradiction_flag=true` but never re-scopes IOM | Farmer's emergence-failure evidence never meets rice-emergence IOM rows |
| B5 | Understanding checker forces clarification at 53% even when intent is 100% + ≥2 informative obs | `agents/understanding-completeness-checker.ts:382` | Log: `Score: 53%, Threshold: 60%, ClarificationRequired: true` while intent conf = 1.00 |
| B6 | Terminal-code guard treats farmer-literal codes as if AI-inferred and blocks injection | `agents/orchestrator.ts:4094` + `utils/observation-authority.ts:167` | Log: `TERMINAL GUARD Blocked cross-crop terminal code: GERMINATION_FAILURE` after farmer literally said "not emerged" |
| B7 | Rule engine reaches `winner=none` with no differential fallback | `agents/orchestrator.ts` rule-engine call site; `runtime/differential-questions-reader.ts` exists but not used here | Log: `candidates=0 eligible=0 winner=none` → generic clarification, no next-best question |
| B8 | Observation → Hypothesis orphan audit missing | `observation_master` vs `hypothesis_conditions.observation_code` | Coverage never measured — orphan observations = dead nodes in graph |

Audit claims rejected (verified false):
- "Codes not found in DB" — `SEEDLING_DIED`, `STUNTED_PLANTS`, `POOR_GERMINATION`, `GERMINATION_FAILURE` are all active in `observation_master`.
- "`.limit(1000)` in a validator" — no such call exists; ceiling is `.limit(2000)`.
- "Alias to `POOR_CROP_ESTABLISHMENT`" — that code is not canonical; `SEEDLING_DIED` **is** the canonical code.

## Fix plan — DB-first, graph-repair ordered

### Phase 1 — Graph correctness (must ship together)

**F2 (P0). Raw text can never become a graph node.** `agents/orchestrator.ts:3608–3612`: stop synthesising `code = raw_text.toLowerCase().replace(/\s+/g,'_')` for SEMANTIC_GATE. Route `raw_symptom_text` through `decision/observation-code-mapper.ts:509` (`observation_aliases` lookup) **first**. Only codes that resolve to `observation_master.observation_code` enter the gate; unresolved strings emit `SSOT_VIOLATION_BLOCKED` on the evidence ledger with the raw text preserved for debugging (never for reasoning).

**B3 (P0). Move stage equivalences to the DB.** Reject the TS hardcode in `iom-gate.ts:52`. Instead:
1. Migration: create `public.crop_stage_equivalence(crop_code text, stage_code text, equivalent_stage text, reason text, is_active bool default true, primary key (crop_code, stage_code, equivalent_stage))` with the standard GRANT block (`authenticated`, `service_role`; anon read since the table is reference-only).
2. Seed the current TS map (verbatim) plus the missing `(rice, transplanting) → seedling|nursery|germination|emergence, reason='establishment_failure_family'` row so behaviour matches the corrected agronomy.
3. `iom-gate.ts` `expandStageSynonyms()` becomes async: query `crop_stage_equivalence` scoped by `(crop_code, stage_code)`, cache 15 min in-memory. Fall back to `[stage, 'all']` on empty. Emits `[STAGE_EQUIV] crop=... stage=... expanded=[...] source=DB`.
4. Callers become `await`ed.

**B4 (P0). Contradiction produces a reasoning-stage family, never overwrites calendar stage.** When `biological_state.contradiction_flag === true` AND `contradiction_codes` intersect emergence-fail set (already computed at `orchestrator.ts:3014`), attach `landContext.reasoning_stage_family = 'establishment_failure'` (derived from `crop_stage_equivalence.reason`). `loadIOMAllowed(...)` accepts a new optional `reasoning_stage_family` and OR-unions its expansion with the calendar-stage expansion. `bio.growth_stage` and `landContext.growth_stage` remain untouched; the ledger records both.

**B6 (P0). Observation provenance.** Extend `utils/observation-authority.ts`:
- Add `FARMER_LITERAL` to `ObservationAuthority`.
- Codes tagged `FARMER_LITERAL` bypass `TERMINAL_CODES_BLOCKED_FROM_INJECTION`. `SYNTHETIC` and `INFERRED` remain blocked.
- The observation-extractor tags anything that appears verbatim in the alias lookup for the farmer message as `FARMER_LITERAL`; cross-crop mapper stays `SYNTHETIC`; IOM literal-peer expansion stays `INFERRED`.
- Downstream consumers (authority-resolver, safety-guardian) get a `sourceAuthority.isFarmerLiteral(code)` helper and continue to require CONFIRMED for terminal-gate activation.

**B8 (P0 audit, non-blocking migration). Observation ↔ Hypothesis coverage report.**
- Ship a read-only diagnostic edge function `symbolic-graph-coverage-audit` that returns three counts and CSV samples: orphan observations (`observation_master.observation_code NOT IN hypothesis_conditions.observation_code`), orphan hypotheses (no rules), and rule-observation gaps per `(crop, stage_family, intent)`.
- No writes. No auto-seeding. Output feeds Phase 3 data work.

### Phase 2 — Runtime correctness

**F1. Remove vocabulary ceiling.** Replace all `.limit(2000)` loads in `utils/llm-output-validator.ts` (three call sites) and `i18n/translation-loader.ts:260` with the adaptive-page pagination pattern already used in `bundled-rules/loader.ts:1253` (`.order().range(from, from+PAGE-1)` loop until short page, halve PAGE on 400 errors). Log a `[VOCAB_LOAD] rows=... pages=... duration_ms=...` line so future regressions are visible.

**F5. Confidence gate uses hypothesis separation, not intent alone.** In `understanding-completeness-checker.ts` (or a new wrapper called from `orchestrator.ts` after hypothesis generation), skip clarification only when **all** hold:
- `intent_confidence >= 0.9`
- `iom_anchored_observations >= 2` (observations that appear in IOM allowlist for the intent+crop+stage-family)
- `top_hypothesis.confidence - second_hypothesis.confidence >= 0.25` (differential separation)
- `contradiction_detected.length === 0`
Otherwise fall through to F7. All thresholds are constants co-located with an in-code comment pointing to this plan; no new hardcoded intent lists.

**F7. Differential fallback when no rule wins.** In `orchestrator.ts` rule-engine wrap-up: when `winner=none` AND IOM allowlist is non-empty, call `runtime/differential-questions-reader.ts` (or add a thin reader over `observation_differential_questions`) to surface the top-3 IOM-ranked codes as a structured `DIFFERENTIAL_QUESTION`. Emits `RULE_COVERAGE_GAP` ledger event `(crop, stage_family, intent, iom_rows, rule_rows)` so Phase 3 knows where to seed.

### Phase 3 — Agronomy data (follow-up PR, not this ticket)

- Populate `decision_rules` for rice emergence (`crop=rice`, stage-family=`establishment_failure`) against the IOM codes already curated (`poor_germination`, `germination_failure`, `seedling_died`, `obs_rice_seed_rotted`, `obs_soil_crust_formed`, …).
- Seed `hypothesis_conditions` links for any orphan observations reported by B8.
- Extend `crop_stage_equivalence` per crop (sugarcane, cotton) with the same DB-only pattern.
- Do **not** synthesise rules from code.

## Explicit non-goals for this ticket

- No LLM prompt changes, no narration-layer changes, no safety-guardian rewrites.
- No new tables beyond `crop_stage_equivalence`.
- No changes to `observation_aliases` semantics (memory rule: aliases must not encode causes).
- No auto-generation of decision rules or hypothesis rows.

## Verification

1. Re-deploy `ai-agriculture-chat`; re-run the exact query `या शेतातील पिक अजून उगवले नाही` (rice, DAS 27, stage=transplanting). Expect:
   - `[STAGE_EQUIV] crop=rice stage=transplanting expanded=[transplanting,seedling,nursery,germination,emergence,all] source=DB`
   - `IOM_GATE ... → ≥20 allowed` (previously 5).
   - `SEMANTIC_GATE` receives zero raw-text codes; unresolved strings appear as `SSOT_VIOLATION_BLOCKED` ledger entries.
   - `GERMINATION_FAILURE` retained with authority `FARMER_LITERAL`.
   - Either a rule winner or a `DIFFERENTIAL_QUESTION` from `observation_differential_questions` (never a generic clarification).
2. B1 regression test: temporarily lower `PAGE` to 500 and confirm validator still returns 1997 codes.
3. B8 audit function returns non-empty orphan lists (expected: rice emergence codes) and drives Phase-3 seeding.
4. Existing sugarcane and cotton locked contracts (per project memory) must show no regression.
