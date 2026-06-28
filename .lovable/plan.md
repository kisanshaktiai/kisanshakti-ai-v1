
# Neuro-Symbolic Brain — Post-Selection Rule Retrieval Fix

## Forensic Finding (proven from logs + DB)

Trace from the uploaded edge log (`trace_mqxhdd2p_9srx65`):

```
Farmer Query  → Clarification → Selection (POOR_GERMINATION / SEEDLING_DIED)
  → confirmed=1 propagated OK (CONVERSATION_STATE shows confirmed=1)
  → Total rules for option selection: 76  ← TRUNCATED
  → Rules matched: 0, Applied: 0          ← NO CANDIDATE SURVIVES
  → "[OPTION_SELECTED] No rules matched for RICE/SEEDLING — fallback"
```

The confirmed observation **does** reach `evaluateRulesLayered` (Cause A in your hypothesis is closed by the Phase-Z fix). The failure is now squarely in **candidate retrieval** (Cause B) and one gating mismatch (Cause C).

### Root Cause 1 — PostgREST 1000-row cap on `decision_rules`
`supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts:104-108`

```ts
.from('decision_rules').select('*').eq('is_active', true).limit(3000)
```

PostgREST hard-caps at 1000 rows regardless of `.limit(3000)`. DB has **1846 active rules**; only 1000 reach memory. After crop-filter the log shows `Loaded 76/1000`, but the true expected pool is **rice(137) + universal(64) = 201**. ~62% of rice rules — including the only matching one — never enter retrieval. Same class of bug already memorialised in `mem://core` for `observation_master`; loader paginates aliases + master but **not the rules themselves**.

### Root Cause 2 — Observation vocabulary chain is broken
The one rule that should win for "crop has not germinated":

```
RICE_GERMINATION_RESOW_DECISION_001
  conditions_json.observations = ['obs_rice_no_emergence', 'obs_rice_patchy_emergence']
```

After selection the orchestrator emits canonical codes `POOR_GERMINATION`, `SEEDLING_DIED`. `observation_aliases` returns:

```
POOR_GERMINATION    → poor_germination        (self)
SEEDLING_DIED       → seedling_died           (self)
OBS_RICE_NO_EMERGENCE → obs_rice_no_emergence (self)
```

The translation/description aliases (`XLAT_*`, `XDESC_*`) link both clusters to `obs_rice_no_emergence`, but the **canonical-to-canonical bridge** is missing. `expandObservationVocabularyViaAliases()` therefore never produces `obs_rice_no_emergence`, and `conditions_json.observations[]` matches zero.

### Root Cause 3 — Strict stage check vs canonical stage
Rule says `growth_stage: germination`; canonical state says `SEEDLING`. The bundle's `stage_applicable` family map (already patched in Phase-Z) covers this for the outer gate, but the inner `conditions_json.growth_stage` equality check in `rule-engine-executor.ts` does not. Needs the same family rule.

### What is NOT broken
Confirmed by trace: intent classification, clarification UI, observation generation, translation, runtime cache, ObservationAuthority propagation. Do not touch these.

## Single-Rule Verification Target

`RICE_GERMINATION_RESOW_DECISION_001` (priority 1, stage_applicable [seedling, nursery, germination, emergence], conditions: obs_rice_no_emergence | obs_rice_patchy_emergence, das 5-21). Instrumented evidence will follow this rule from DB row → loaded → crop-passed → stage-passed → observation-matched → winner.

## Fix Plan (3 surgical changes, no architecture changes)

### Fix 1 — Paginate `loadAllRules`
File: `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` (~lines 95-115)

Replace single `.select('*').limit(3000)` with `.range()` pagination (PAGE = 1000) mirroring the existing alias/observation paginators in the same file (lines 1191-1239). Loop until returned page < PAGE; cap at 5 pages (5000 rules) as safety.

### Fix 2 — Bridge canonical-to-canonical observation equivalents
Two sub-fixes, no schema change:

a) **Data**: insert `observation_aliases` rows (active=true) so retrieval-time expansion finds the rule code:
```
POOR_GERMINATION       → obs_rice_no_emergence
GERMINATION_FAILURE    → obs_rice_no_emergence
SEEDLING_DIED          → obs_rice_seed_rotted
PATCHY_GERMINATION     → obs_rice_patchy_emergence
```
Add the symmetric rows (`obs_rice_* → POOR_GERMINATION` etc.) so the bridge is bi-directional regardless of which side the engine asks from.

b) **Code defense**: in `orchestrator.ts:2107-2116`, after `expandObservationVocabularyViaAliases`, also call the alias loader **with the lower-cased canonical** so the expansion finds the `obs_*` family (current code only feeds UPPER codes; alias rows are stored both ways but the lookup is case-sensitive in the in-memory map). One-line normalisation.

### Fix 3 — Stage-family equivalence inside `conditions_json` evaluator
File: `supabase/functions/ai-agriculture-chat/agents/rule-engine-executor.ts` — the place where `conditions_json.growth_stage` is compared.

Reuse the same `STAGE_FAMILIES` map already used at `layered-rule-evaluator.ts:1317`. Replace strict equality with `family.includes(rule.growth_stage)`. Export `STAGE_FAMILIES` from a shared module so both gates use one SSOT.

## Verification (must pass before closing)

Re-run the exact failing turn (Marathi: "या शेतातील पिक अजून उगवले नाही", select POOR_GERMINATION) and assert from logs:

1. `[RuleLoader] Loaded ≥1800 rules from database` (pagination working)
2. `📦 Loaded ≥150 crop-filtered rules for rice`
3. `[FIX#2] alias bridge expanded: +obs_rice_no_emergence`
4. `Rules matched: ≥1, Applied: ≥1`
5. `winner_rule = RICE_GERMINATION_RESOW_DECISION_001` (or equivalent germination rule)
6. Response content is the deterministic resow-decision recommendation, not the stage-aware fallback.

Add a one-shot diagnostic log block keyed on the verification rule:
```
[SINGLE_RULE_TRACE] rule=RICE_GERMINATION_RESOW_DECISION_001
  loaded=Y crop_pass=Y stage_pass=Y das_pass=Y obs_match=Y category_pass=Y eligible=Y selected=Y
```
This is the one-rule audit you asked for; it stays in production behind a `BRAIN_TRACE_VERBOSE` flag.

## Out of scope
No new tables, no new abstractions, no LLM-generated agronomic content, no changes to clarification UI / intent / translation.

## Files touched
- `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` (paginate `loadAllRules`)
- `supabase/functions/ai-agriculture-chat/agents/rule-engine-executor.ts` (stage-family in conditions_json)
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (lowercase pass to alias expander; SINGLE_RULE_TRACE log)
- New migration: 4 (×2 symmetric) rows in `observation_aliases`
