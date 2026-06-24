---
name: Phase 3 — DB-driven brain SSOT
description: Hardcoded BIOTIC_OBS_KEYS / EMERGENCY_OBS_CODES / ADVISORY_DIRECT_ROUTES / IPM_DATABASE / DISEASE_DATABASE / CULTURAL_STRATEGIES / CROP_NAME_TO_CODE replaced by DB lookups via decision/db-lookups.ts. SSOT tables: emergency_observation_codes, direct_advisory_routes, cultural_strategies, observation_master.semantic_class, crop_synonyms.
type: feature
---

The AI agriculture chat brain reads ALL of the following from the database — never from in-code constants:

| Concern | Table / column | Loader |
|---|---|---|
| biotic (pest/disease) observation codes | `observation_master.semantic_class IN ('pest','disease')` | `loadBioticObservationCodes()` |
| emergency observation codes | `public.emergency_observation_codes` | `loadEmergencyObservationCodes()` |
| advisory direct routes (skip clarification) | `public.direct_advisory_routes` | `loadDirectAdvisoryRoutes()` |
| cultural strategies per crop | `public.cultural_strategies` | `getCulturalAdviceFromDB()` |
| crop name → canonical code | `public.crop_synonyms` | server-side resolver; frontend `normalizeCropName` is async stub |
| IPM / disease products | `public.master_products` + `public.decision_rules` | `product-repository.ts` |

All loaders live in `supabase/functions/ai-agriculture-chat/decision/db-lookups.ts` with a 5-min TTL WeakMap cache keyed by SupabaseClient instance. Caches survive warm-isolate reuse and die when the client is reconstructed.

Removed files: `supabase/functions/ai-agriculture-chat/agents/decision-graph-bridge-data.ts`.

Editing agronomy knowledge is now a DB update — no code deploy required.
