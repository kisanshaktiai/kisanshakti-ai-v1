---
name: DB intent→observation wiring
description: Orchestrator must call resolveIntentToObservations() so intent_observation_mapping (SSOT) feeds rule engine; vocab override must be Devanagari-safe; GENERAL_INFO is not a direct-mode bypass.
type: feature
---

After extractSemanticMeaning + mapToObservationCodes, the orchestrator calls
`resolveIntentToObservations(intent_code, crop_code, DAS, growth_stage)` and
merges the top-ranked DB observation_codes into `expandedObservationCodes`.
Without this, advisory intents (FERTILIZER_SCHEDULE, WEED_PROBLEM,
IRRIGATION_QUERY) reach the rule engine with only intent strings as
observations and every farmer question collapses to the same stage advisory.

Vocab route override in orchestrator.ts uses Devanagari-safe matching:
- Devanagari phrases → `msgLower.includes(phrase)`
- Latin phrases → escaped regex with non-word boundaries
`\b...\b` does NOT match Devanagari and silently disables SSOT vocab routing.

`GENERAL_INFO` is intentionally OUT of `ADVISORY_DIRECT_ROUTES` — when DB intent
is specific, the brain must run with its mapped observations rather than
bypass clarification on a generic 50% route.
