
# Fix: Ontology Drift in Cross‑Crop Symptom Injection

## The bug (verified against live DB)

The cross‑crop symptom mapper (`agents/cross-crop-symptom-mapper.ts`) emits keys from the hardcoded `CrossCropSymptomKey` enum (Layer C, ~70 keys). The decision‑rule comparator matches those tokens (lowercased) directly against `decision_rules.conditions_json` — but rules were authored against `observation_master` **canonical** codes, which differ from the cross‑crop enum. The `observation_aliases` table (Layer B, 14,023 rows) knows the mapping, but **the cross‑crop injection path never consults it**.

Live counts from `decision_rules` confirm the gap:

| Cross‑crop emits | Rules hit | Canonical synonym(s) via alias | Rules hit (synonyms) |
|---|---:|---|---:|
| `larvae_visible` | 2 | `larva_present`, `pest_damage` | 13 + 13 |
| `leaf_yellowing` | 8 | `chlorosis`, `yellowing_leaves` | 7 + 9 |
| `leaf_browning` | **0** | `leaf_browning_visible` | 0 |
| `leaf_drying`  | 9 | `leaf_scorching`, `drying_leaves`, `leaf_drying_visible` | 1 + … |
| `stunted_growth` | 33 | `stunted_plants` | 2 |

Net effect: between 30 % and 100 % of the rule corpus addressable by a given cross‑crop symptom is silently unreachable. This is the "rule matcher returns zero" residue the audit report flagged, after the casing fix.

## Fix (surgical, one file)

In `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` only:

1. **Add import** at the existing cross‑crop import block (~line 494):
   ```ts
   import { resolveObservationCanonical } from '../runtime/observation-resolver.ts';
   ```

2. **Replace the cross‑crop injection block** (lines ~4521‑4548) so that for every non‑terminal cross‑crop key we:
   - Inject the lowercased original (preserves direct `observation_master` hits).
   - `await resolveObservationCanonical(symU, { language, source: 'rule_token' })` and inject every returned `canonical_code` as SYNTHETIC, deduplicated, re‑checked against the terminal‑code guard.
   - Log a `[CrossCropFanout]` line showing `LARVAE_VISIBLE -> larva_present(exact,1.00)` style for telemetry.
   - On resolver miss the existing RPC already writes to `observation_vocabulary_gaps` — no extra work needed.

Wrap the per‑symptom work in `await Promise.all(...)` so the existing async context (`async orchestrate`) absorbs it without blocking serially.

## What this does NOT change

- No DB migration. `observation_aliases` already contains the mappings; we just start using them on this path.
- No edits to the `CrossCropSymptomKey` enum, `ObservationKey` enum, or the rule comparator.
- Terminal‑code guard semantics preserved (checked on original key AND on every fanned‑out canonical).
- All other observation pipelines (induction, photo, intent_observation_mapping) are unchanged.

## Verification plan

1. After deploy, send a sugarcane query mentioning "अळी" (larvae) at tillering stage.
   - Expect log line: `[CrossCropFanout] DB-aliased 2 canonical synonyms: LARVAE_VISIBLE->larva_present(exact,1.00), LARVAE_VISIBLE->pest_damage(exact,1.00)`.
   - Expect rule‑fire count to jump from ≤2 to the larger union.
2. Send a query mentioning "पाने पिवळी" (yellow leaves). Expect `LEAF_YELLOWING` to fan out to `chlorosis` and `yellowing_leaves`.
3. Confirm `observation_vocabulary_gaps` table size does not balloon (resolver misses only fire on truly unknown tokens).
4. Re‑deploy `ai-agriculture-chat`; check edge logs for no new exceptions in the cross‑crop block.

## Risk

- **Low.** Resolver is already deployed, RPC‑gated, and has its own try/catch. Fanout cannot remove observations, only add canonical synonyms; the worst case under a resolver outage is the previous behaviour (original key only).
- Latency: one extra RPC per cross‑crop key (typically 3–6 keys). RPC is a single SQL on a trigram‑indexed table, sub‑5ms.

## Out of scope (acknowledged, separate work)

The deeper finding from the audit — unifying Layer A enum, Layer C enum, and `observation_master` into a single DB‑driven SSOT — is a multi‑week refactor and is not part of this fix. This patch closes the highest‑impact runtime symptom (zero‑match rules) without touching the wider architecture.
