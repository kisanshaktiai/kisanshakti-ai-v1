
# Clarification Loop — Verified Root Cause & Repair Plan

Session audited: `bb9c239e…` (Rice, tillering, DAS 48–49, turn 438), trace `trace_ms2sopsa_8vgi87`.

## What the evidence actually shows

Message history (`ai_chat_messages`, last 8 turns) is a closed cycle, not progress:

```text
poor_rooting_post_transplant
  → stunted_after_transplant
  → poor_establishment + poor_tillering
  → slow_recovery_after_transplant
  → (card re-offers transplant_shock + poor_rooting_post_transplant)
```

Three independent defects produce this. Each is confirmed by a read, not inferred.

### RC-A — Biologically impossible hypotheses survive the stage gate

`hypothesis_conditions` for both surviving hypotheses carry `condition_type=STAGE`, `is_required=true`, `value_json=[transplanting]`:

- `HYP_RICE_TRANSPLANT_SHOCK_001`
- `HYP_RICE_ROOT_INJURY_PULLING_001`

Context is `tillering`, DAS 49. The log shows `[HYP_VALIDATION] blocked=[] warnings=[] stage_penalty_applied=false` and **no** `[HYP_BIOLOGICAL_GATE]` line — so the required-stage gate passed. Reason: `checkStageCondition` accepts `compatibility.family`, and stage families come from `crop_stage_graph`, which stores a symmetric `TRIGGERS` edge `transplanting → tillering`. Adjacency is being read as equivalence.

Agronomically this is wrong. Transplant shock and root-pulling injury are bounded to roughly 0–14 days after transplanting; recovery is complete well before tiller stabilisation. At 49 DAS a "slow growth" complaint in transplanted rice belongs to a different differential entirely (N deficiency, Zn deficiency/khaira, iron toxicity or waterlogging, root grubs/BPH, weed competition). Neither hypothesis has any `DAS_RANGE` condition row, so the DAS gate has nothing to enforce.

### RC-B — Evidence does not accumulate; asked options are not remembered

`ai_chat_sessions.conversation_state` for this session:

```json
{ "confirmed_observations": [], "ruled_out_observations": [], "round_counter": 0,
  "max_rounds": 2, "last_updated": "2026-06-25T14:59:27Z" }
```

Turn count is 438 and the row was updated today — the durable evidence ledger is stale and empty because nothing writes it. Only `metadata.decision_tracking.pending_clarification_observation_keys` (last turn only) is persisted. Consequently `[OBS_TO_HYP] obs=[slow_recovery_after_transplant]` carries exactly one observation: the current message. Four previously confirmed symptoms are gone.

`[HYP_CLARIFICATION][FILTER] removed_confirmed=1 removed_pending=0` confirms the pending exclusion list was empty at build time — the card that reached the farmer was built by the promotion path (`runtime/observation-selector-contract.ts → loadObservationSelectorOptions`), which never passes `pending_obs_keys` or an asked-history at all.

### RC-C — Empty decision is recycled into the same clarification, forever

Survivor rules are stage-scoped correctly, so they cannot fire at DAS 49:

| rule | stage_applicable | crop_age_days |
|---|---|---|
| RICE_MGT_TRANSPLANTING_001 | [transplanting] | 25–35 |
| RICE_IRRIG_FLOOD_001 | [transplanting … grain_filling] | 25–130 |

Result: `decision_provided_empty` → `[OBSERVATION_REQUIRED_PROMOTED]` → a new `CLARIFICATION_QUESTION` → `[INVARIANT VIOLATION] … forcing awaiting_clarification`. The promotion path has no round budget and no terminal exit, so the loop is unbounded. Note the contradiction the system is trapped in: hypotheses pass the stage gate while their own rules fail it. RC-A and RC-C are the same disagreement seen from two ends.

## Repair plan

**Track 1 — Biological plausibility (data + gate)**
1. Seed `DAS_RANGE` conditions (`is_required=true`) on the two rice transplant hypotheses: `{max: 21}` for transplant shock, `{max: 25}` for root-pulling injury, agronomically justified as the recovery window. Audit sibling transplanting/germination hypotheses for the same missing bound.
2. In `hypothesis-graph-evaluator.ts`, stop treating `crop_stage_graph` adjacency as satisfaction of an `is_required=true` STAGE condition. Adjacency may keep a soft candidate alive; a required stage must match exactly or via a same-family (not merely adjacent) relation. Emit `[HYP_BIOLOGICAL_GATE]` when it eliminates.
3. Add a coherence invariant: if a surviving hypothesis has zero rules whose `stage_applicable`/`crop_age_days` admit the current context, log `[HYP_RULE_STAGE_INCOHERENT]` and drop the hypothesis instead of emitting a card.

**Track 2 — Durable evidence & asked-history**
4. Persist per-turn to `ai_chat_sessions.conversation_state`: `confirmed_observations` (union, canonical lower_snake_case), `ruled_out_observations`, `asked_observation_keys` (cumulative, not last-turn), `round_counter`.
5. Load that state at Layer 3 and feed the union into `classifyEvidence`/`resolveHypothesesFromObservations`, so turn N sees all four prior confirmations rather than one.
6. Pass `pending_obs_keys = asked_observation_keys` from `observation-selector-contract.ts` and `clarification-contract.ts` into `buildHypothesisClarificationOptions`, closing the promotion-path gap.

**Track 3 — Terminal exit**
7. Enforce the DB round budget on the promotion path: when `round_counter >= max_rounds`, or when the option set after exclusion is empty, return a structured no-decision / escalation response instead of a new card. Log `[CLARIFICATION_ROUND_EXHAUSTED]`.
8. Add a guard: a clarification whose option key set is a subset of `asked_observation_keys` is a loop — refuse to emit it and fall through to escalation.

**Verification**
Replay this session's context (Rice, tillering, DAS 49, the four confirmed symptoms). Expect: transplant hypotheses eliminated with `[HYP_BIOLOGICAL_GATE]`, a stage-appropriate differential card (nutrient/root/pest) or a structured escalation, never a repeat of `transplant_shock` / `poor_rooting_post_transplant`.

## Not included
Broad re-curation of the rice tillering differential (new hypotheses for khaira, iron toxicity, root grub) is data work beyond this repair; flag it as follow-up once the gates are correct.
