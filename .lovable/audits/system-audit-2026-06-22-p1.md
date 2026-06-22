# P1 System-Wide Symbolic Brain Fix — 2026-06-22

## Migration applied
- `intent_observation_mapping.assertion_strength` (default `DIFFERENTIAL`)
- `decision_rules.min_data_completeness` (default `0.0`)
- New `public.intent_assertion_pattern` (RLS on, read-authenticated)
- Backfill via 33 seeded cross-crop patterns

## Backfill result (all crops, no per-crop SQL)
| assertion_strength | rows |
|---|---|
| LITERAL            | 175 (across all crops where naming matched) |
| STRONG_HYPOTHESIS  | 141 |
| DIFFERENTIAL       | 13,205 (default; safe) |

## Code invariants deployed
- **Invariant A — Empty-confirmed gate**: if `state.confirmed_observations` is empty and any eligible rule declares observation conditions → force CLARIFY. Crop-agnostic.
- **Invariant B — Post-selection stage gate**: re-check `stage_applicable` against canonical stage after primary build; null on mismatch (authoritative stages only, ESTABLISHMENT family equivalence preserved).
- **Invariant C — `min_data_completeness` gate**: reject rules whose evidence ratio is below the rule's DB-curated threshold. Default 0.0 → no behavior change.

## Files changed
- supabase/migrations/<new>.sql
- supabase/functions/ai-agriculture-chat/decision/intent-resolver.ts
- supabase/functions/ai-agriculture-chat/agents/orchestrator.ts
- supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts
- supabase/functions/ai-agriculture-chat/bundled-rules/all-rules.ts
- supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts

## What this does NOT do
- No per-crop UPDATE scripts, no rice-only patches.
- No hardcoded synonym/intent lists in code.
- No schema change to existing `observation_translations` or `observation_master`.
- No deletion of rows.

## Agronomy curation path (no code deploys)
1. Edit `intent_assertion_pattern` in Supabase dashboard (add intent/regex/strength).
2. Re-run the backfill UPDATE (idempotent).
3. Optionally raise `decision_rules.min_data_completeness` per rule.
