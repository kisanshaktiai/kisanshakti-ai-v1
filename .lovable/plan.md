# Proactive Alert: Fix Weather Fetch + Decision-Brain-Only Narration

## What you saw vs what is wrong

The Marathi alert in the screenshot showed:
- `तापमान --°C, आर्द्रता --%` (temperature/humidity blank)
- The Marathi sentence still contained the raw English word `SUGARCANE`
- `कारण` (cause) and `काय करावे` (what to do) were generic templates ("शेताची तपासणी करा", "कृषी तज्ञांचा सल्ला घ्या") — none of the specific Sugarcane wisdom that exists in the decision brain rule (`NDVI_NON_RECOVERY` → "check shoot borer / red rot / wilt / nutrient deficiency, field inspection within 48 hours").

## Root causes (verified with DB + code reads)

### 1. Weather data IS in the database, but the lookup misses it
The land **Mala (7.59 acre, Sugarcane)** sits at `(16.7396, 74.2266)`. The evaluator builds `location_key = "16.74,74.23"` and runs:

```ts
.from('weather_current').select(...).in('location_key', ['16.74,74.23'])
```

But `weather_current` only has nearby keys: `16.71,74.23`, `16.7,74.23`, `16.72,74.23`, `16.84,74.22`. **Strict equality returns 0 rows → temp/humidity null → UI prints `--°C, --%`.**

This contradicts the established rule in memory `weather/live-weather-context-resolution` ("AI Chat resolves weather via 55km proximity lookup"). The proactive evaluator is the only path that still uses strict key match — it must use the same proximity logic.

A second issue: even when a key matches, some rows are months old (Jan / Dec / July). We need a freshness window so 4-month-old data does not silently power today's "कारण".

### 2. Cause/steps are not coming from the decision brain
For rule `NDVI_NON_RECOVERY` (the rule that actually fired):
- `decision_rules.action_text` is rich and Sugarcane-specific (shoot borer, red rot, smut, nitrogen, 48h inspection).
- `decision_rules.reason_text` and `knowledge_text` are **NULL**.

Code path in `proactive-evaluator/index.ts` lines 1754-1834 (`buildSolutionFromRule`) then falls back to:
- `cause_mr = "तापमान --°C, आर्द्रता --% - या हवामानामुळे ही समस्या उद्भवली."` (a hard-coded weather template — not from the brain)
- `steps_mr = ["शेताची तपासणी करा...", "कृषी तज्ञांचा सल्ला घ्या", ...]` (generic placeholders — not from the brain)

So even after fixing weather, the cause and steps would still be generic. The fix is: **always source `cause` and `steps` from `decision_rules.knowledge_text` / `reason_text` / `action_text`, and only append weather as a small "evidence" line — never as the entire cause.**

### 3. Crop name leaking as English ALL-CAPS in Marathi sentences
Lines 1811-1812, 1830-1831 use raw `cropEn = ctx.crop_code || 'crop'` ("SUGARCANE") inside Marathi/Hindi strings. Violates memory `architecture/canonical-language-governance` (strip ALL_CAPS technical codes from output). Needs a `cropLabel(lang, code)` lookup using the existing `crop_synonyms` table (memory `logic/multilingual-crop-synonym-detection`).

---

## The fix (all in `supabase/functions/proactive-evaluator/index.ts`)

### Fix A — Geo-proximity weather lookup with freshness gate

Replace `batchLoadWeather()` (lines 641-665):

```text
For each land's (lat, lon):
  1. Try exact location_key  (cheap path)
  2. If miss → SELECT location_key, lat, lon, temp, humidity, ...
       FROM weather_current
       WHERE observation_time > now() - interval '6 hours'   ← freshness gate
       (limit by bounding box: lat ± 0.5°, lon ± 0.5°  ≈ 55 km)
     Then in JS: keep the nearest row by haversine distance, max 55 km
  3. If still no row → return nullWeather()
     AND set ctx.weather_source = 'unavailable' so the
     narrator can write "हवामान माहिती सध्या उपलब्ध नाही"
     instead of "तापमान --°C, आर्द्रता --%"
```

Apply the same proximity + freshness logic to `batchLoadForecast` and the `weather_current` fallback inside `batchLoadGDD`.

Add `weather_source: 'exact' | 'proximity' | 'unavailable'` and `weather_distance_km` to the `weather` shape so the audit trail shows where the number came from.

### Fix B — Cause / steps strictly from the decision brain

Rewrite `buildSolutionFromRule()` so the structure is:

```text
problem  ← decision_rules.condition_code  →  human label
                                              from a small DB-driven map
                                              (intent_observation_mapping)

cause    ← decision_rules.knowledge_text  (preferred)
       OR decision_rules.reason_text     (fallback)
       OR  a single short line built from the actual triggered
           condition: e.g. "NDVI 0.10 < 0.30 — पीक 7 दिवस पावसानंतरही
           सावरले नाही"  (this is the rule's firing reason, not weather)

           Append weather ONLY as evidence on a separate line
           when ctx.weather_source !== 'unavailable':
               "आजचे हवामान: 24°C, आर्द्रता 80%."

steps    ← split decision_rules.action_text on '\n' / numbered list
           Each step is ONE short Marathi sentence (≤ 12 words)
           Translate via the same nano translator we already use
           for AI Chat narration (LLM is render-only, per memory
           `architecture/symbolic-engine-strict-invariants`).

           If action_text is missing, fall back to the existing
           generic 3-step list — but log a `decision_rules` data
           gap so we can backfill.

safety   ← phi_days + bee_toxicity + farmer_safety_level (already correct)

organic  ← decision_rules.organic_alternative (already correct)
```

Hard rule (matches existing memory `architecture/symbolic-engine-strict-invariants`):
**no agronomic phrase in `cause`/`steps` may originate outside `decision_rules`.** Weather is environmental evidence, not a cause.

### Fix C — Strip ALL-CAPS crop codes from farmer text

Add `cropLabel(lang, ctx.crop_code)` that:
1. Looks up `crop_synonyms` for the localized name (`ऊस` for Marathi, `गन्ना` for Hindi).
2. Falls back to title-case (`Sugarcane`, never `SUGARCANE`) if no row.

Replace every interpolation of `cropEn` inside `_mr` / `_hi` strings with the localized label. Same treatment for `irrigation.method` in English steps (`FLOOD` → `flood irrigation`).

### Fix D — Simpler farmer language (the "rural Indian farmer" rule)

Apply per memory `ui/farmer-centric-content-rules`:
- One idea per sentence, max ~12 words.
- No technical tokens (`NDVI`, `GDD`, `DAS`, `ETL`) in the visible Marathi/Hindi text. Replace with farmer-friendly phrases:
  - `NDVI 0.10` → `उपग्रहावरून पीक खूप कमजोर दिसतंय` (with the number kept in a small "तांत्रिक तपशील" expandable line for power users).
  - `GDD` → `उष्णता एकूण` (hidden under tech-detail).
- Numbers stay in Devanagari numerals when the rest of the sentence is Devanagari (the LLM Output Validator already supports this — memory `logic/llm-output-validation-gate`).
- Keep the 8-section `2030-Ready` structure unchanged (समस्या, कारण, काय करावे, सुरक्षा, अपेक्षित फायदा, पुढील तपासणी, सेंद्रिय पर्याय, तांत्रिक तपशील).

### Fix E — Backfill mission for `decision_rules`

Open a follow-up task (no code today) to fill `reason_text` + `knowledge_text` for the proactive rules that are currently NULL:
- `NDVI_STRESS_DETECTION` (sugarcane)
- `NDVI_NON_RECOVERY` (sugarcane)
- and any other `is_proactive_rule = true` row where either column is null.

Until that backfill lands, Fix B's "build cause from the firing condition" branch keeps the output safe and brain-sourced.

---

## Files I will edit

- `supabase/functions/proactive-evaluator/index.ts`
  - `batchLoadWeather` → proximity + freshness
  - `batchLoadForecast`, `batchLoadGDD` (current-fallback) → same
  - `buildSolutionFromRule` → cause/steps from `decision_rules` only
  - `buildContextualSolution` (NDVI generic path) → same
  - new helpers: `findNearestWeather`, `cropLabel`, `simplifyForFarmer`
- New small migration (read-only sanity): index `weather_current(observation_time desc)` to keep the proximity query fast (only if EXPLAIN shows it is needed — I'll check before adding).

## Out of scope for this pass

- Re-seeding `decision_rules.knowledge_text` / `reason_text` (separate task; flagged above).
- Changing the proactive cron frequency or notification UI — they already work.
- Touching AI Chat (its weather lookup is already correct per memory).

## Acceptance check after implementation

1. Trigger the evaluator for Mala (16.74, 74.23) → alert shows `तापमान 24°C, आर्द्रता 80%` (the real `16.71,74.23` reading) **with a small "≈ 3 km away" tag**, not `--°C, --%`.
2. The Marathi `कारण` paragraph quotes the sugarcane `NDVI_NON_RECOVERY` text from `decision_rules`, not the generic weather template.
3. The Marathi `काय करावे` list mirrors `action_text` (shoot borer / red rot / nitrogen / 48-hour inspection), not "शेताची तपासणी करा / कृषी तज्ञांचा सल्ला घ्या".
4. The word `SUGARCANE` no longer appears in any Marathi/Hindi sentence — replaced with `ऊस` / `गन्ना`.
5. If both proximity and exact lookup fail, the alert says `हवामान माहिती सध्या उपलब्ध नाही` — never `--°C`.

Awaiting approval to switch to default mode and apply Fixes A–D.
