# WS13 — Wave N — Exploratory Re-Partition of Residual DEFECT_SUSPECT

> Analysis-only. **No code changes shipped.** Run date: 2026-06-22.

## Method

Queried `public.ai_chat_messages` for every assistant turn in the last 90 days where
`metadata.orchestrator_type = 'CLARIFICATION_QUESTION'` AND
`metadata.clarification_site_disposition = 'DEFECT_SUSPECT'`,
then joined laterally to the immediately preceding `role='user'` message in the same session to recover the actual farmer prompt that triggered the clarification.

## Top-level partition

```
42 / 42 rows  → site = orch.intent_lock_all_filtered (Wave-L backfilled)
42 / 42 rows  → language = mr (Marathi)
42 / 42 rows  → mapped_codes=0, expanded=0, candidate=0 (zero observation evidence reached the gate)
42 / 42 rows  → rules_fired=0 in metadata (corroborates — intent lock filtered everything pre-rule-engine)
```

> The Wave-L backfill stored zero per-turn metadata on the assistant row (it could only stamp the site, not reconstruct the lost evidence). The signal therefore lives in the **user prompt** that immediately preceded each assistant clarification.

## Wave N partition by user prompt

| Cluster | Sample prompt (mr) | English gloss | Turns | % | Proposed remediation |
|---|---|---|---:|---:|---|
| **N1. Rice non-germination** | `भात अद्याप उगवले नाही` / `भात अजून उगवले नाही` / `पिक अजून उगवले नाही` | "Rice has not yet germinated" | **36** | 86 % | DB curation — add Marathi germination-failure assertion patterns to `intent_assertion_pattern` and an `intent_observation_mapping` row mapping them to a `RICE_GERMINATION_FAILURE` / `EMERGENCE_FAILURE` observation code |
| **N2. Leaf yellowing** | `काही ठिकाणी पाने पिवळी झाली आहेत` (+ sugarcane variant + 1 follow-up clarification) | "Leaves have turned yellow in some places" | **4** | 10 % | Verify why `WAVE_J_INTENT_LOCK_BYPASS` did **not** fire — `LEAF_YELLOWING` should have produced ≥1 candidate observation. Likely the Marathi multi-crop phrase failed the canonical-group gate before reaching the rule engine. |
| **N3. Drought-induced non-germination (long form)** | `पाऊस नसले मुळ भात उगवले नाही, काय करावे?` | "Rice did not germinate because there was no rain — what to do?" | **1** | 2 % | Subsumed by N1 once the germination-failure mapping exists; the causal "no rain" phrasing also wants a soil-moisture/weather context hint. |
| **N4. Reflection of an earlier clarification** | `🔍 पाने पिवळी पडत आहेत — जुन्या खालच्या पानांपासून की नव्या वरच्या पानांपासून सुरुवात झाली?` | (Differential question echoed back as a user turn) | **1** | 2 % | Likely a UI replay artifact — verify the chat client is not re-submitting assistant prompts as user prompts. |

## Re-disposition under proposed Wave N taxonomy

| Proposed disposition | Turns | What it means |
|---|---:|---|
| `DB_CURATION_NEEDED` (rice + Marathi germination) | 37 | Symbolic brain has no LITERAL or STRONG_HYPOTHESIS path for Marathi `भात + उगवले नाही` |
| `LEAF_YELLOWING_INTENT_LOCK` | 4 | Wave-J bypass should have fired; needs canonical-group debug |
| `CLIENT_REPLAY_ARTIFACT` | 1 | UI defect, not orchestrator defect |

**Conclusion:** ~88 % of the residual `DEFECT_SUSPECT` mass is a **single DB-curation gap**, not a code defect. This validates the Wave-M decision to hold further code bypasses until forward telemetry arrives — the next correct action is **content/data curation**, not another bypass.

## Recommended (deferred) actions

These are NOT applied in this exploratory wave. They are the candidate Wave-N-implementation backlog:

1. **N1 / N3 (37 turns):** insert into `public.intent_assertion_pattern`:
   - `pattern_text` set: `भात (अद्याप|अजून) उगवले नाही`, `पिक अजून उगवले नाही`, `पाऊस नसले मुळ भात उगवले नाही`
   - `intent`: `DIAGNOSE_GERMINATION_FAILURE` (or whichever canonical intent the engine uses)
   - `assertion_strength`: `LITERAL`
   - Then add the matching row to `public.intent_observation_mapping` pointing at the `RICE_GERMINATION_FAILURE` / `EMERGENCE_FAILURE` observation code (verify code exists in `observation_master` first).
2. **N2 (4 turns):** log a focused trace for the Marathi `पाने पिवळी` phrase across rice + sugarcane and confirm whether `expandedObservationCodes` is being populated. If yes, Wave-J bypass should engage — investigate why it did not. If no, this is the same class of curation gap as N1.
3. **N4 (1 turn):** open a UI ticket against the chat client to confirm differential clarifications are not being replayed as user turns.

## Forward-telemetry note
After ≥72 h of new tagged traffic (post-Wave-M deploy), re-run the partition query in this doc. Any **new** `DEFECT_SUSPECT` rows would indicate a regression Wave M did not cover and should be triaged before applying the curation above.

## Reproducible SQL

```sql
WITH defect_asst AS (
  SELECT m.id, m.session_id, m.created_at
  FROM public.ai_chat_messages m
  WHERE m.role = 'assistant'
    AND m.created_at > now() - interval '90 days'
    AND m.metadata->>'orchestrator_type' = 'CLARIFICATION_QUESTION'
    AND COALESCE(m.metadata->>'clarification_site_disposition','') = 'DEFECT_SUSPECT'
)
SELECT u.content, u.language, COUNT(*) AS n
FROM defect_asst d
JOIN LATERAL (
  SELECT content, language FROM public.ai_chat_messages
  WHERE session_id = d.session_id AND role = 'user' AND created_at <= d.created_at
  ORDER BY created_at DESC LIMIT 1
) u ON true
GROUP BY 1,2
ORDER BY n DESC;
```
