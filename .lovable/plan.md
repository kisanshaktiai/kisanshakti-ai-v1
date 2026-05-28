## Root cause (confirmed by code trace)

The farmer asked a pure scheduling question:
> "सध्या कोणते खत देवू आणि फवारणी घेवू?"  
> ("At the current stage, what fertilizer should I give and what spray should I take?")

The expected answer is a stage-based fertilizer + preventive spray plan derived from `crop_schedules` (days since sowing, growth stage) and the symbolic rule engine.

Instead the system replied with a **diagnostic clarification** card ("What exactly are you observing? — रंग बदलला / गड्डे दिसत आहेत / Drying/wilting"). That UI is only meant for symptom-reporting queries.

### Why this happens

1. `supabase/functions/ai-agriculture-chat/agents/query-router.ts`
   - `PEST_DISEASE_PATTERNS` (line 78–121) contains broad "treatment request" tokens:
     - line 117 — `/फवारणी|स्प्रे|spray|छिड़काव/i`
     - line 119 — `/काय\s*करू|क्या\s*करूं|what\s*(should|can|to)\s*do/i`
   - In `routeQuery()` (line 219+), **Priority 4 = PEST_DISEASE_TREATMENT** runs before anything that could capture fertilizer/nutrition. The word *फवारणी* alone (no pest, no disease, no symptom) is enough to win, so `route = PEST_DISEASE_TREATMENT, requires_decision_brain = true`.
   - There is **no FERTILIZER / NUTRITION route at all** in `query-router.ts`. `खत / खाद / उर्वरक / fertilizer / khat / khaad` are never matched here.

2. `intent-classifier.ts` (line 472) *does* classify `खत…` as `FERTILIZER_SCHEDULE`, but the orchestrator's high-level routing relies on `routeQuery()` output for choosing the pipeline. The downstream Decision Brain receives `PEST_DISEASE_TREATMENT` with no pest/disease/symptom evidence → low confidence → the unified gate emits a generic "What exactly are you observing?" clarification with symptom options (`COLOR_CHANGE`, lumps, `WILTING`).

3. The clarification gate has no guard that says: *"If the resolved intent is a scheduling intent (`FERTILIZER_SCHEDULE` / `IRRIGATION_QUERY` / `INPUT_RECOMMENDATION` without symptom signal), never ask diagnostic 'what are you observing' questions."*

Net effect: every "खत + फवारणी" scheduling question is force-converted to a diagnostic flow.

## Fix plan (no DB schema changes; rules already exist in `decision_rules`)

### 1. `agents/query-router.ts` — add a dedicated nutrition route

- Add `FERTILIZER_NUTRITION` to `QueryRoute`.
- Add `FERTILIZER_NUTRITION_PATTERNS` covering:
  - `खत|खाद|उर्वरक|पोषण|fertili[sz]er|nutrient|\bkhat\b|\bkhaad\b`
  - `कोणते\s*खत|कौन\s*सा\s*खत|which\s*fertilizer`
  - `सध्या.*खत|आता.*खत|now.*fertilizer`
- Add `SYMPTOM_TOKENS` regex (`पिवळ|पीला|yellow|डाग|spots?|मेला|सुक|कुज|wilt|rog|kid[ia]|ali|borer|holes?|curl|blight|rust|करपा|तांबेरा`).

### 2. Tighten PEST_DISEASE matching

In `routeQuery()`, before returning `PEST_DISEASE_TREATMENT`:
- If `pestDiseaseScore` is driven **only** by the generic spray/treatment tokens (`फवारणी / spray / काय करू / उपाय / favarni`) **and** no `SYMPTOM_TOKENS` are present, demote the score.
- If fertilizer tokens are present and no symptom tokens are present, route to `FERTILIZER_NUTRITION` instead, even when `फवारणी` is also mentioned (interpreted as "preventive spray", not "treat my disease").

### 3. `agents/orchestrator.ts` — handle the new route

- Add a branch for `queryRoute.route === 'FERTILIZER_NUTRITION'` that:
  - Loads land context + active `crop_schedules` row (already fetched today for chat context).
  - Calls the symbolic rule engine with `intent_code = FERTILIZER_SCHEDULE` and crop/stage/DAS as input, reusing the existing `layered-rule-evaluator` → `deterministic-response-builder` path.
  - Skips the diagnostic clarification generator entirely.
- Extend the existing vocab-route override (line 1246–1285) so `NUTRIENT_INTENTS` map to `FERTILIZER_NUTRITION` (currently they map to a string the rest of the code doesn't actually route).

### 4. Clarification guard

In `decision/decision-readiness-gate.ts` / `clarification-strategy.ts`:
- Before emitting the "What are you observing?" symptom clarification, check the resolved intent. If it is `FERTILIZER_SCHEDULE`, `IRRIGATION_QUERY`, `HARVEST_TIMING`, `MARKET_PRICE_QUERY`, `WEATHER_QUERY`, or `INPUT_RECOMMENDATION` **with no symptom evidence**, do not generate a diagnostic clarification — fall through to the deterministic stage-based responder (or, only if rules return nothing, ask a *scoped* clarification like "Which nutrient concern — basal, top-dressing, micronutrient?", never "what are you observing").

### 5. Verification

- Replay the failing query with `supabase--curl_edge_functions` against `ai-agriculture-chat` for the same `land_id` and confirm:
  - `route = FERTILIZER_NUTRITION`
  - response section contains stage-based fertilizer dose (computed for the land's acreage) + preventive spray window, not a clarification card.
- Re-run 3 regression queries to ensure pest/disease flow still triggers clarification correctly:
  - "ऊसाला किडा लागला, काय फवारू?" → still `PEST_DISEASE_TREATMENT`.
  - "पान पिवळे झाले" → still `COLOR_CHANGE` / diagnostic clarification.
  - "पाणी कधी द्यायचे?" → still `IRRIGATION_SCHEDULING`.

## Files to change

- `supabase/functions/ai-agriculture-chat/agents/query-router.ts`
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
- `supabase/functions/ai-agriculture-chat/decision/decision-readiness-gate.ts` (or `agents/clarification-strategy.ts`, whichever owns the "observation symptom" clarification emission)

No DB migrations, no UI changes required.
