## Root cause (confirmed from edge logs)

The Marathi query `उसाला कोणती फवारणी घेवू काय ?` (sugarcane DAS=154) was wrongly routed to a "What are you observing?" clarification card instead of `SPRAY_TIMING_QUERY` / `FERTILIZER_SCHEDULE`. Three independent failures stack on top of each other:

### 1. The deployed edge function is stale — still IntentClassifier v3.0.0

Log line:

```
🎯 [IntentClassifier v3.0.0] Classifying...
   ✅ Intent: INPUT_RECOMMENDATION (100%) [1523ms]
```

`supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts` in the repo is already `v4.0.0` with the canonical-intent whitelist (loaded from `observation_intent_master`). The expected marker `[IntentValidator] Loaded N canonical intent codes from DB` is **absent** from the logs. The v4 file was never picked up by the deployed function — only v3 is running in production. As a result the LLM is free to emit non-canonical codes (`INPUT_RECOMMENDATION`) and nothing rejects them.

### 2. Non-canonical intent → fallback route → clarification gate

Because `INPUT_RECOMMENDATION` is not in `observation_intent_master` (88 valid codes), the symbolic brain can find no `intent_observation_mapping` rows, falls through to `GENERAL_INFO` (50% confidence), and the clarification generator emits the generic "What exactly are you observing?" card. The orchestrator's `ADVISORY_DIRECT_INTENTS` bypass cannot fire because the intent code is not in the canonical set.

### 3. Crop-code casing mismatch in `crop_vocabulary`

Logs show:

```
[CROP_VOCAB] Loaded 0 vocabulary entries for Sugarcane     ← title-case (LandContext)
[CROP_VOCAB] Loaded 101 vocabulary entries for SUGARCANE    ← upper-case (other call site)
```

The fertilizer / spray Marathi keyword bias from `crop_vocabulary` is being silently skipped on the first call because `crop_code` lookups are case-sensitive and the rows are stored UPPER while one caller passes title-case. This is the `Fix 3` item in `.lovable/plan.md` that is still awaiting DB-side approval.

---

## Fix plan

### A. Force redeploy of `ai-agriculture-chat` (code-side, no logic change)

Bump the file-level version marker and re-export it through `index.ts` so the deployment system picks up the change. No behaviour change — this only forces the v4 classifier and the v3.0.0 orchestrator (with `ADVISORY_DIRECT_INTENTS`, `filterToCanonicalObservations`, advisory bypasses) to actually go live.

Touch points:
- `supabase/functions/ai-agriculture-chat/index.ts` — add a `BUILD_TAG = 'classifier-v4-canonical-2026-05-31'` log at boot so we can verify the new deploy is serving traffic.
- `supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts` — add a single `console.log(`[IntentClassifier] BUILD=v${INTENT_CLASSIFIER_VERSION}`)` at module load to make staleness instantly visible in future audits.

### B. Belt-and-suspenders: case-insensitive crop_code lookups

Patch the two vocabulary loaders to upper-case the `crop_code` argument before querying. This makes the system correct even before the DB normalization migration runs.

Files:
- `supabase/functions/ai-agriculture-chat/agents/agricultural-vocabulary.ts` — `.eq('crop_code', cropCode)` → `.eq('crop_code', cropCode.toUpperCase())`.
- `supabase/functions/ai-agriculture-chat/agents/semantic-extractor.ts` — same normalization where `crop_vocabulary` is loaded for the current crop.

### C. DB normalization (requires user approval) — `Fix 3` from existing plan

Single migration, after the read-only verification queries already documented in `.lovable/plan.md`:

```sql
UPDATE public.decision_rules           SET crop_code = UPPER(crop_code) WHERE crop_code <> UPPER(crop_code);
UPDATE public.intent_observation_mapping SET crop_code = UPPER(crop_code) WHERE crop_code <> UPPER(crop_code);
UPDATE public.crop_vocabulary          SET crop_code = UPPER(crop_code) WHERE crop_code <> UPPER(crop_code);
```

No schema change, no new columns, no new rules. The verification SELECTs are presented for review before any UPDATE is executed.

### D. No new rules, no new intents, no LLM agronomic generation

Out of scope for this fix: adding `INPUT_RECOMMENDATION` as an alias, adding Marathi vocabulary rows, adding sugarcane intent mappings (`Fix 4` / `Fix 5` / `Fix 6` in the existing plan remain queued and unaffected by this change).

---

## Validation after deploy

Re-run the same query `उसाला कोणती फवारणी घेवू काय ?` on sugarcane DAS=154 and confirm in edge logs:

- `[IntentClassifier] BUILD=v4.0.0` appears on cold start
- `[IntentValidator] Loaded 88 canonical intent codes from DB`
- `Intent: SPRAY_TIMING_QUERY` (or `FERTILIZER_SCHEDULE` / `GENERAL_CROP_INFO` fallback) — never `INPUT_RECOMMENDATION`
- `[AdvisoryBypass] Skipping clarification gate for advisory intent=...`
- `response_source = DECISION_RULES`, no `CLARIFICATION_QUESTION` for advisory queries
- `[CROP_VOCAB] Loaded 101 vocabulary entries for SUGARCANE` on every call (no more `Loaded 0`)

Regression set: disease query still clarifies; greeting returns greeting; irrigation routes to `IRRIGATION_QUERY`.
