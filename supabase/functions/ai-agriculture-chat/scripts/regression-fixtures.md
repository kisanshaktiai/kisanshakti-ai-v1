# Regression Fixtures — Neuro-Symbolic Decision Brain (Phase G)

Manual QA reference. After any change to orchestrator / loader /
layered-rule-evaluator / scientific-validator, replay these 7 canonical
conversations and confirm the expected winning rule family + invariants.

| # | Crop      | Language | Farmer query (gist)                                 | Expected intent           | Winning rule family            | Invariants to confirm                                     |
|---|-----------|----------|-----------------------------------------------------|---------------------------|--------------------------------|-----------------------------------------------------------|
| 1 | Rice      | Marathi  | "भात अजून उगवले नाही" (seed never emerged)          | EMERGENCE_FAILURE         | RICE_EMERGENCE_*               | ❌ NOT cyclone/stress recovery. winner_tier=0 or 1.       |
| 2 | Wheat     | Hindi    | "गेहूँ ठीक से नहीं उगा"                              | GERMINATION_ISSUE         | WHEAT_GERMINATION_*            | stage_source=crop_stage_master HIT.                       |
| 3 | Sugarcane | Marathi  | "ऊसाला पाणी कधी द्यायचे?"                            | IRRIGATION_PLANNING       | SC_IRRIGATION_*                | Baseline guideline consulted, irrigation override active. |
| 4 | Cotton    | Hindi    | "पत्तियों पर सफेद धब्बे" (white spots)               | PEST_DIAGNOSIS            | COTTON_PEST_*                  | Action coalescer NOT triggered (action_text present).     |
| 5 | Tomato    | English  | "leaves are turning yellow with black spots"        | DISEASE_DIAGNOSIS         | TOMATO_DISEASE_*               | Scientific gate logs EXACT_STAGE or DAS_WINDOW.           |
| 6 | Maize     | Marathi  | "पाने पिवळी पडत आहेत, पोटॅशियम कमी आहे का?"          | NUTRIENT_DEFICIENCY       | MAIZE_NUTRITION_*              | Generic rule NEVER beats specific (tier guard).           |
| 7 | Onion     | Hindi    | "बारिश से नुकसान का अनुमान"                          | WEATHER_IMPACT            | WEATHER_RECOVERY_*             | All 4 knowledge caches log `[KNOWLEDGE_PRELOAD] … OK`.    |

## Required `[BRAIN_TRACE]` events per request

1. `[BRAIN_TRACE][RULE_INTENT_GATE] intent=… kept=… demoted=… dropped=… incompat_dropped=…`
2. `[BRAIN_TRACE][RULE_TIER] t0=… t1=… t2=… winner_tier=…`
3. `[BRAIN_TRACE][SCIENTIFIC_GATE] approved=… rejected=… conf=…`
4. `[SCIENTIFIC_GATE][BASELINE_PICK] rule=… reason=EXACT_STAGE|DAS_WINDOW|FIRST_AVAILABLE|NO_CACHE`
5. `[STAGE_SSOT] source=crop_stage_master result=HIT|MISS …`
6. `[BRAIN_TRACE][PIPELINE_RULE_STAGE] intent=… winner=… winner_action_text=present|EMPTY`

If any line is missing, the corresponding gate did not run — investigate
before signing off.
