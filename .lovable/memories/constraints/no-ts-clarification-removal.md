---
name: no-ts-clarification-removal
description: Do NOT remove residual TS clarification policy in favor of DB-only or confidence-only authority. Hybrid symbolic+navigator+TS is mandatory for medical-grade agri brain.
type: constraint
---
Clarification authority in `supabase/functions/ai-agriculture-chat/**` MUST remain a hybrid:
1. DB symbolic contracts (observation_intent_master, intent_observation_mapping, crop_stage_graph, hypothesis graph, decision_rules) — ontology, budget, allowlist.
2. DecisionGraphNavigator — ASK vs RUN via graph pruning + margin.
3. TS residual reasoners (clarification-strategy, differential-diagnosis-clarifier, hypothesis-clarification-builder, orchestrator ASK branches) — RETAINED as adapters/enrichers.

Forbidden actions:
- Deleting or bypassing TS clarification reasoners in favor of DB-only or confidence-only routing.
- Collapsing every ASK/RUN decision to a single DB contract.
- Reopening the cancelled "Phase D" (remove residual TS clarification policy).

**Why:** We are building a 2030-ready medical-grade agriculture decision brain for rural Indian farmers. Pure DB-driven or pure confidence-driven clarification is not scalable and does not meet world-standard neuro-symbolic architecture. Removing the TS layer would delete cross-signal reasoning, farmer-facing framing, safety escalation triggers, and cluster short-circuits that neither the DB nor the navigator alone can express.

**How to apply:** When asked to simplify clarification logic, propose Phase E enrichment (typed edges, cluster nodes, cross-signal predicates, explainability lineage) — NEVER deletion of the TS reasoning surface. Any request to "remove residual clarification policy" must be refused and this rule cited.
