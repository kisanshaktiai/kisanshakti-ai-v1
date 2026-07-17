## Forensic Audit — Verified Findings

### Failure 1 — PGRST202 on `resolve_crop_phenology(p_land_id)`
**Status: RESOLVED at DB (verified).** `pg_proc` now exposes three overloads:
- `resolve_crop_phenology(p_land_id uuid)` ← wrapper the TS caller needs
- `resolve_crop_phenology(p_crop_code, p_crop_cycle, p_cultivation_method, p_variety_id, p_sow_date, p_transplant_date, p_current_gdd, p_as_of, p_land_id)` ← full v7
- `resolve_crop_phenology_for_land(p_land_id, p_as_of)`

No TS change required for Failure 1. Cascade (stage=null → invariant → crash) is unblocked.

### Failure 2 — Turn 2 INFORMATION_ONLY
**Downstream of Failures 1 + 3.** No independent code defect. Once 1 and 3 are fixed, PHASE 6 GATE‑2 will see matched rules and stop suppressing.

### Failure 3 (real root cause) — `filterRulesByIntent` compares the wrong column
File: `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` (lines ~1366–1430).

Verified against DB:
```
SELECT rule_intent, COUNT(*) FROM decision_rules GROUP BY rule_intent;
 recommendation | 807
 command        | 601
 block          | 215
 education      | 153
 warning        |  70
 NULL           |   7
```

`decision_rules.rule_intent` encodes **semantic ACTION TYPE** (`recommendation` / `command` / `block` / `education` / `warning`), NOT diagnostic intent codes.

The gate does:
```ts
if (riLc === intentKey) { kept++ }              // intentKey = "POOR_TILLERING" etc.
else if (ri == null)    { demoted++ }
else                    { dropped++ }
```
`"recommendation" === "poor_tillering"` is impossible → `kept` is always 0 for every real intent. Only the 7 NULL rows survive as `demoted` (generic penalty), the entire 1,839‑rule corpus is `dropped`. The log line `kept=0 demoted=202` is exactly this bug (202 = crop‑scoped NULL rows after upstream `loadRulesForCrop`). Diagnostic exemption (added earlier) prevents the LEAKAGE_GUARD but the gate is still throwing away every intent‑bound rule.

There is no other column on `decision_rules` that encodes farmer diagnostic intent (`applicability_scope`, `category`, `crop_category`, `required_observation_category` are all scoping/taxonomy — verified). Intent→rule scoping is actually done upstream via `intent_observation_mapping` + hypothesis graph. This gate has no valid DB source and must not filter on `rule_intent`.

---

## Surgical Fix (one file, ~15 lines)

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

**Change `filterRulesByIntent`:**
1. Stop comparing `rule_intent` (action type) to `intentKey` (diagnostic intent) — it is a semantic type mismatch.
2. Keep the `INTENT_INCOMPATIBLE` hard‑drop map (`emergence_failure` never routes to `cyclone_recovery` etc.) — but evaluate it against `rule.category` (the correct column for that semantic), not `rule_intent`.
3. Return the full remaining rule set unfiltered. Intent scoping is already enforced upstream by IOM + hypothesis graph + condition evaluator; there is no correct DB signal on `decision_rules` to further gate here.
4. Preserve the `_genericPenalty` marker for rules with `rule_intent == null` so Phase D arbiter behaviour is unchanged (that penalty is legitimate — NULL means the rule has no declared action type).
5. Keep the `[BRAIN_TRACE][RULE_INTENT_GATE]` log line with the same shape (`kept/demoted/dropped/incompat_dropped`) so the regression fixtures and log parsers keep working, but redefine `kept` = rules with a declared `rule_intent`, `demoted` = NULL rule_intent rows.
6. Delete the LEAKAGE_GUARD block entirely — with the mismatch fixed, `kept` will normally be non‑zero and the guard's premise ("no rule matched the intent") is no longer represented by this column at all. `prescription-gate-enforcer.ts` `_noTreatmentEligible` check stays in place as defensive code; it just won't fire from this path anymore.

**No other files changed.** No DB migration. No agronomy. No new hardcoded intent lists.

## Verification steps (after edit)
1. Confirm build: `deno check` on the edge function.
2. Reissue the two failing turns; expect log:
   - `[BRAIN_TRACE][RULE_INTENT_GATE] intent="poor_tillering" kept>0 demoted=<small> dropped=0 incompat_dropped=0`
   - `graphExecuted=true`, `hypotheses>0`, `rules>0`.
3. Confirm `PHASE 6 GATE-2` no longer routes to INFORMATION_ONLY for diagnostic turns that have matched rules.
4. `_noTreatmentEligible` should no longer appear in prescription‑gate warnings from this path.

## Out of scope (explicit)
- No change to `resolve_crop_phenology*` or any other DB object.
- No change to `orchestrator.ts`, `layered-rule-evaluator.ts`, `prescription-gate-enforcer.ts`, or `pipeline-self-check.ts` (their contracts remain satisfied).
- No new bundled agronomic constants.
