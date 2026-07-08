---
name: Observation mapping DB SSOT
description: Intent→observation mapping is DB-driven (intent_observation_mapping) not hardcoded; cache preloaded at request boot.
type: architecture
---
PR-1 (2026-07-08) deleted the 15-row hardcoded `INTENT_TO_OBSERVATION_MAPPINGS` array from `supabase/functions/ai-agriculture-chat/decision/observation-code-mapper.ts`. The intent→observation mapping is now sourced EXCLUSIVELY from `public.intent_observation_mapping` (13,539 active rows / 86 intents at deletion time, 30–100× richer than the deleted hardcoded table).

**Runtime contract:**
- SSOT: `public.intent_observation_mapping` filtered by `is_active=true AND assertion_strength IN ('LITERAL','STRONG')`.
- Cache: `utils/observation-mapping-cache.ts` — paginated load (bypasses PostgREST 1000-row cap), 10min TTL, request-scoped.
- Preload: `agents/orchestrator.ts` loads it beside `StageKnowledgeCache.loadStageKnowledge` at request boot.
- `default_part` is DB-derived from the modal `observation_master.affected_plant_part` across matched observations — NOT a hardcoded per-intent value.
- `default_severity` is left at runtime neutral `SEVERITY_MEDIUM` — severity is an observation-level property, not intent-level, and the DB schema does not curate a per-intent default.
- Cache miss policy: emit `[OBS_MAPPING_CACHE_MISS]`, skip intent expansion. NEVER fall back to hardcoded agronomy. Legacy visual/pest phrase tables in the same file are separately scheduled for PR-1b.

**Traces to look for:**
- `[OBS_MAPPING_CACHE] loaded iom_rows=N intents=M obs_with_part=K` — boot
- `[DB_SSOT_SOURCE] path=intent_observation_mapping intent=X rows=Y modal_part=Z` — per call
- `[OBS_MAPPING_CACHE_MISS] intent=X reason=... action=skip_intent_expansion` — degraded

**Why:** Enforces the "Database = Agriculture Brain, TypeScript = Graph Runtime, LLM = Language Layer" contract. Curators update `intent_observation_mapping` rows — never edit TypeScript to add a new intent or observation.
