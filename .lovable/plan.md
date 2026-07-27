## Forensic findings (verified against code + DB + the uploaded log)

**The two streams**

| | Stream A (authoritative) | Stream B (the failing one) |
|---|---|---|
| Built at | `agents/orchestrator.ts:6297` `currentObservations = canonical_observation_codes`, frozen into `_graphSnapshot` (`:6396-6405`, `:6746-6755`) | `allObservationsForPreAuth` Set, assembled at `agents/orchestrator.ts:5072-5900` (pre-graph) |
| Log evidence | `[GRAPH_RUNTIME] snapshot … observations=5 hypotheses=1 winner=HYP_RICE_POST_TRANSPLANT_ESTABLISHMENT_FAILURE_001 state=READY_FOR_DECISION` | `[OBS_SEMANTIC_FILTER] admitted=3 … preAuthSize=2`, then `[OBSERVATION_BRIDGE] raw=[RICE_LODGING,STUNTED_GROWTH]` |
| Consumer | graph runtime → hypothesis → rules | `factExtractor.extractFacts(..., [...allObservationsForPreAuth])` at `:9557`, → `SymbolicReasoner.executeRules` → `applyObservationLayerFilter` (`decision/symbolic-reasoner.ts:815`) |

Stream B is a genuinely separate, earlier, smaller list. It never reads `_graphSnapshot.observations`. That is why `[ObsMeta] Loaded 1–2 observation metadata entries` while the graph holds 5, and why the reasoner path produces zero rule matches.

**`obs=[]` in the zero-rule log** — `agents/orchestrator.ts:9443` prints `canonicalState.visual_symptoms`, a third (empty) container. The same block at `:9409` uses `confirmed_observations` and printed `despite 8 symptoms`. So `obs=[]` is a reporting defect on top of the real divergence, not the evidence set actually used.

**Ontology join** — `decision/symbolic-reasoner.ts:737-780`. DB check: `observation_master.canonical_group` values are engine-group shaped (`01_physiology`, `06_abiotic`, `03_pest`, …) and `canonical_group_mapping.engine_group` holds the *same* strings (rows for `01_physiology` and `06_abiotic` do exist: `PHYSIOLOGY_LODGING`, `PHYSIOLOGY_STUNTING`, `STRESS_WATER`, `STRESS_TEMPERATURE`). So the current `.in('engine_group', bioGroups)` + in-memory `m.engine_group === obs.canonical_group` join is **tautological** — at best it re-derives the value it already had. The runtime nevertheless got 0 rows back, which the SQL contradicts; the most likely cause is table privileges (`information_schema.table_privileges` returns no rows for this table, though that view is role-filtered, so this is *unconfirmed*). Either way `engine_groups` is decorative: the tier widening in `applyObservationLayerFilter` matches on `canonical_group`, not on `engine_group`. It is not the cause of the empty decision, and I will not present it as one.

## Plan (read-path only, no agronomy, no new tables)

**1. Single authoritative observation source at the reasoner call site** — `agents/orchestrator.ts` (~`:9546-9562`)

Add a small local resolver used only for reads:
- prefer `(this as any)._graphSnapshot?.observations` when non-empty;
- else `canonical_observation_codes` if still in scope;
- else the existing `allObservationsForPreAuth` (cold/no-graph turns only);
- normalize every code through `canonicalObsCode` from `utils/canonical-code.ts` and de-duplicate.

Pass that array to `factExtractor.extractFacts(...)` instead of `[...allObservationsForPreAuth]`. Log `[OBS_STREAM_UNIFIED] source=graph_snapshot|preauth count=N codes=[…]`, and log `[OBS_STREAM_DIVERGENCE]` when the graph set and the pre-auth set differ, so any remaining second stream is visible instead of silent.

**2. Do not let Stream B re-pollute the evidence** — `decision/symbolic-reasoner.ts:820-855`

`applyObservationLayerFilter` re-bridges incoming codes through `observation_aliases` (this is what turned `STUNTED_GROWTH` into `obs_rice_patchy_emergence`). Change it to alias-resolve **only codes that are not already present in `observation_master`**, after `canonicalObsCode` normalization. Codes arriving from the graph are already canonical and must pass through untouched. Purely a read-path guard; the alias table stays the authority for unresolved codes.

**3. Correct the reporting defect** — `agents/orchestrator.ts:9443`

Print the unified list from step 1 in `[GRAPH_ZERO_RULE_MATCH]` (and the same for `[PIPELINE_HEALTH]`), so `obs=[]` can never again mask a populated evidence set.

**4. Ontology join: make it honest, not louder** — `decision/symbolic-reasoner.ts:737-780`

Keep the DB read, but treat `observation_master.canonical_group` as itself an engine group (seed `engine_groups` with it directly), and use `canonical_group_mapping` rows purely as optional enrichment (`biological_group` labels). Downgrade `[ONTOLOGY_JOIN_ZERO]` from a warning implying breakage to an informational `[ONTOLOGY_ENRICHMENT_EMPTY]`. Result: `EngineGroups: []` disappears without pretending the mapping table was the blocker.

**5. Explicitly out of scope** — no change to the GraphProjection frozen-state guard, no change to the graph→clarification collapse logic beyond what step 1 implies, no rule/hypothesis seeding, no new files.

## Verification

- Re-run the same Marathi rice/lodging turn and confirm: `[OBS_STREAM_UNIFIED] source=graph_snapshot count=5`, `[ObsMeta] Loaded 5 …`, non-empty `EngineGroups`, and `rules_matched > 0` (or a structured no-decision that cites the graph's 5 observations rather than `obs=[]`).
- Confirm `[GRAPH_RUNTIME] snapshot … READY_FOR_DECISION` is still produced and is no longer followed by a clarification fallback triggered by the reasoner path.
- Add a CHANGE LOG entry to both touched files per the project rule.

## Open item for you

If, after step 1, `canonical_group_mapping` still returns 0 rows in the edge runtime while SQL shows rows, the cause is table privileges and the fix is a one-line `GRANT SELECT … TO service_role` migration. I would confirm from the redeployed log first rather than issue a migration on a guess.
