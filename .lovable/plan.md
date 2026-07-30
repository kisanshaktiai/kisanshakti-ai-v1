# Forensic Finding and Surgical Repair Plan

## Verified production failure

The uploaded session `bb9c239e-068d-402e-9cb6-5fb94ac2cbdf` is not failing because the graph is absent. The graph executes, but it receives a corrupted biological state and biologically invalid observation candidates.

```text
Farmer: “crop growth is low”
  → GROWTH_ANOMALY
  → rice_lodging injected from intent_observation_mapping
  → lodging rejected at tillering
  → zero surviving hypotheses
  → clarification expands eliminated/nearest hypotheses
  → transplanted-rice cards shown to direct-seeded farmer
  → selected impossible card enters evidence ledger
  → another invalid clarification round
  → forced DIAGNOSTIC_ESCALATION
```

### Critical root cause 1 — false biological-stage certainty

The database correctly returns the current stage as a **DAS-ledger provisional** result with confidence `0.50`. The only transition row for this crop cycle is:

- `trigger_type = autonomous_init`
- `confidence = 0.50`
- `to_stage = RICE_TILLERING`
- evidence reason = `autonomous_cycle_initialization`

The runtime reconciler classifies only `das` and `dat` as calendar triggers. It omits `autonomous_init`, then promotes that same row to `completed_stage_transitions` confidence `0.90`. The graph therefore applies a hard stage gate to a stage that has not been biologically confirmed.

The field has no usable corroborating biological inputs:

- Soil: no `soil_health` row available.
- Weather: no land-scoped `weather_observations`/`weather_aggregates` rows available.
- Morphology: `INSUFFICIENT_DATA`.
- NDVI: `0.184`, but the source scene is stale and has only `12.7%` coverage; this fails the project reliability requirement of coverage above 15%.

Therefore the scientifically valid state is **provisional tillering, confidence 0.50**, not biologically confirmed tillering at 0.90.

### Critical root cause 2 — incorrect agriculture knowledge in `intent_observation_mapping`

For rice `GROWTH_ANOMALY`, the active rank-1 mapping is:

- `observation_code = rice_lodging`
- `growth_stage = all`
- `das_min = 0`
- `das_max = 999`

But `observation_master` defines `rice_lodging` only for `grain_filling`, `maturity`, and `harvest`. At DAS 52/tillering, the mapping injects an observation that its own observation SSOT declares stage-inapplicable.

The other growth-anomaly mappings are germination/seedling observations capped at DAS 45, so only the biologically wrong lodging row survives at DAS 52.

### Critical root cause 3 — contradictory observation identity

`observation_aliases` contains conflicting case-insensitive identities:

- `STUNTED_GROWTH → stunted_plants` at confidence `1.0`
- `stunted_growth → obs_rice_patchy_emergence` at confidence `0.7`
- `stunted_plants → obs_rice_patchy_emergence` at confidence `0.7`

Both `stunted_growth` and `stunted_plants` are themselves active master observations. Alias rows are therefore overriding canonical master identities and converting general stunting into patchy emergence. This explains why unrelated establishment observations enter the second stream.

### Critical root cause 4 — clarification reintroduces hypotheses already rejected by biology

The main graph correctly eliminates transplant-only hypotheses when `cultivation_method=direct_seeded`. However, the clarification builder unions `matchedIds + nearestIds`, where `nearestIds` are taken from eliminated hypotheses with any positive match. It does not exclude hypotheses eliminated for:

- cultivation-method contradiction;
- required biological-stage contradiction;
- rule-scope incoherence.

It then emits `poor_establishment`, `missing_hills`, `stunted_after_transplant`, `seedling_mortality_post_transplant`, and later `deep_transplant_burial`. These are database-defined post-transplant observations, but the farmer’s authoritative cultivation method is `direct_seeded`.

On subsequent turns, the clarification path logs `cultivation=null`, proving that the immutable biological context is not carried into that graph invocation. The generic `net_new` loop override then treats a new but biologically impossible option as progress.

### Critical root cause 5 — observation stage metadata is loaded but not enforced for cards

`observation_master.applies_to_stages` is available and cached. The clarification card loader checks active/farmer-observable/question-enabled status, but does not enforce `applies_to_stages` before rendering. The database contains the correct stage restrictions, but that graph node does not execute them.

### Remaining hardcoded agriculture bypasses

Two live paths still contain agriculture intelligence outside the database:

- `agents/crop-stage-advisor.ts`: hardcoded rice/wheat/sugarcane/cotton stage advice and NDVI ranges; invoked by the orchestrator’s stage fallback.
- `agents/decision-graph-bridge-data.ts`: hardcoded IPM fallback recommendations used by the decision graph bridge.

These violate the database-as-brain contract and can produce advice when DB rule closure fails.

## Surgical implementation

### 1. Correct the database knowledge rows

Use one migration against existing tables only:

- Deactivate the `GROWTH_ANOMALY → rice_lodging` mapping; do not substitute another symptom as confirmed evidence.
- Preserve `stunted_growth`/`stunted_plants` as their own master identities.
- Deactivate aliases where an active `observation_master.observation_code` is being redirected to a different canonical code, including the two patchy-emergence aliases verified above.
- Add an audit query that identifies every active IOM row whose stage/DAS scope contradicts `observation_master.applies_to_stages`.
- Do not create a new table and do not add a second weather source.

### 2. Keep autonomous initialization provisional

In the phenology reconciliation path:

- Treat `autonomous_init` exactly like `das`/`dat`: maximum confidence `0.50`.
- Read only ledger rows whose evidence says `applied=true`, belong to the current crop cycle, and resolve to the current cultivation lane.
- Never promote a transition merely because it exists in `stage_transition_log`.
- Preserve morphology/GDD/event-driven transitions as higher-authority candidates only when their database evidence actually exists.

### 3. Enforce NDVI reliability in the database transition evaluator

Update the existing `stc_eval_single` NDVI branch so an NDVI transition can match only when the row satisfies the established SSOT reliability gates:

- coverage above 15%;
- cloud cover below 40% when cloud metadata is present;
- within the configured transition window;
- valid NDVI value present.

No threshold will be duplicated in a weather table or `system_config`; this only validates the existing `ndvi_data` SSOT row.

### 4. Carry one immutable biological context through clarification

Thread the already-resolved canonical context into every observation→hypothesis invocation used by the clarification builder:

- `cultivation_method`
- biological `growth_stage`
- `predicted_stage_confidence`
- crop, land, DAS/GDD, soil, weather, and reliable NDVI fields already present in the turn SSOT

Remove the clarification path’s ability to silently fall back to `cultivation=null` when the locked biological state contains `direct_seeded`.

### 5. Stop biologically eliminated hypotheses from generating cards

Keep nearest-hypothesis expansion only for genuinely incomplete candidates. Exclude candidates eliminated for DB-backed contradictions such as cultivation mismatch, required-stage failure, crop mismatch, or rule-scope incoherence.

Before rendering each card, require:

- active observation master row;
- farmer observable;
- `can_generate_question=true`;
- current stage included in `applies_to_stages` when the array is populated;
- contributing hypothesis remains applicable to the current cultivation method and biological context.

The loop override may emit only net-new options that pass these same biological gates. Farmer selections must be revalidated before entering the evidence ledger.

### 6. Remove the two live hardcoded agriculture fallbacks

Disconnect the orchestrator from `crop-stage-advisor.ts` and the graph bridge from `decision-graph-bridge-data.ts`. On missing DB closure, return a structured database knowledge gap or safe escalation—never hardcoded agronomic advice.

No agriculture constants will be moved to another TypeScript file.

### 7. Validate scientifically and operationally

Run a production-like regression for the same land and session pattern:

- Rice, `direct_seeded`, DAS 52.
- Generic “growth is low” report.
- Stage remains provisional at `0.50` unless valid biological evidence exists.
- `rice_lodging`, transplant establishment, missing hills, deep transplant burial, and post-transplant mortality are not injected or displayed.
- Cultivation remains `direct_seeded` in every graph/clarification trace.
- Clarification cards are sourced from valid DB observation/hypothesis edges only.
- No repeated clarification subset and no forced escalation caused by biologically impossible options.
- Soil/weather/NDVI are marked unavailable or unreliable rather than converted into evidence.

Also report active hypothesis→rule edges that are not expert-approved. The current audit found **242 active rice graph edges but only 1 mapped to an expert-approved rule**; this is a separate scientific-governance blocker and must be surfaced, not silently treated as trusted knowledge.