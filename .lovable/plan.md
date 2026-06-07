## Problem

For Marathi "या शेतात कोणते नवीन पिक घेवू?" the system now reaches the `NEXT_CROP_RECOMMENDATION_LANE` (the earlier G2 regression is fixed), but the lane returns a **placeholder stub** — "rotation rules are being seeded, please share season/irrigation/sowing date." There is no actual next-crop name and no scientific reason. Root cause: zero rows exist in `decision_rules` for categories `crop_rotation | crop_selection | next_crop | rotation_advisory`, and the lane has no rule-evaluation step — it only narrates `landContext`.

The user wants the Symbolic Decision Brain to (a) name the recommended next crop(s) and (b) explain the scientific reason — for every recommendation response — without altering the regular diagnostic (pest/disease/nutrition) brain.

## Goal

Extend the existing `NEXT_CROP_RECOMMENDATION_LANE` into a real rotation engine that:

1. Loads seeded `crop_rotation` decision_rules from DB.
2. Scores candidates against the authoritative `canonicalContext` (last crop + family, soil NPK + OC + texture, agro_zone, irrigation_type, season, district, rotation_history).
3. Returns top 3 candidates each carrying `scientific_basis` (nitrogen fixation, pest-cycle break, soil-restoration, water-fit, market-fit, etc.) from the rule row.
4. Hands the structured candidates to the existing `llm-response-formatter` (already in NEXT-CROP RECOMMENDATION MODE) for vernacular narration that always includes the "why".
5. Falls back to the current deterministic stub **only** when zero rules match — never silently.

No change to: pest/disease/nutrition rule paths, Canonical Context Builder, Unified Decision Gate, Authority Hierarchy, Crop Schedule SSOT, tenant/farmer isolation, intent classifier, NO_ACTIVE_CROP bypass, G2 bypass.

## Changes

### 1. DB seed migration — `crop_rotation` rules
New migration `supabase/migrations/<ts>_seed_crop_rotation_rules.sql` inserts ~20 production-safe rules into `decision_rules` (category = `crop_rotation`). Each rule uses existing columns only — no schema change. Conditions live in `conditions_json`:

```jsonc
{
  "previous_crop_family": ["poaceae"],         // e.g. after sugarcane/wheat
  "previous_crop": ["sugarcane","wheat","rice"], // optional narrower match
  "season": ["rabi","kharif","summer"],
  "irrigation_type": ["irrigated","rainfed"],
  "soil_texture": ["black","loamy","sandy"],   // optional
  "soil_n_max": 280, "soil_n_min": null,       // ppm/kg-ha thresholds, all optional
  "soil_p_max": null, "soil_p_min": null,
  "soil_k_max": null, "soil_k_min": null,
  "agro_zone": ["western-maharashtra","marathwada","vidarbha","konkan"], // optional
  "min_rotation_gap_seasons": 1                 // do not repeat same family within N
}
```

Output columns used per rule:
- `cause` → recommended crop code (e.g. `chickpea`, `soybean`, `green_gram`, `maize`, `mustard`, `groundnut`, `sunflower`, `cotton`, `pigeonpea`, `wheat`, `sorghum`).
- `scientific_basis` → 1–3 sentence scientific reason (N-fixation kg/ha, pest cycle break, allelopathy, soil-OC build, water requirement fit, market window).
- `reason_text` / `knowledge_text` → farmer-facing one-liner the LLM will narrate.
- `confidence_score`, `priority`, `scientific_source` (ICAR / state agri-university ref), `is_active = true`, `applicability_scope = 'multi_crop'`.

Initial seed coverage (Maharashtra-first; safe defaults):
- after sugarcane → chickpea / green-gram / sunhemp (green-manure) / soybean
- after wheat → green-gram / soybean / cotton (kharif) / pigeonpea
- after rice → chickpea / mustard / lentil
- after cotton → wheat / chickpea / sorghum
- after soybean → wheat / chickpea / safflower
- after groundnut → wheat / sorghum
- after maize → chickpea / mustard
- "no prior record" generic season-based defaults per agro_zone

All rows include real ICAR/MPKV/PDKV references in `scientific_source`.

### 2. New engine module — `agents/next-crop-recommender.ts`
Pure function, no side effects, no LLM calls:

```ts
recommendNextCrop({ canonicalContext, language, traceId }) →
  { candidates: Array<{ crop_code, crop_label_i18n, score, rule_id,
                        scientific_basis, farmer_reason, rotation_gap_ok,
                        soil_fit, season_fit, water_fit }>,
    matched_rule_count, fallback_used }
```

Steps:
1. Query `decision_rules` where `category='crop_rotation' AND is_active=true` (cached per-edge-invocation).
2. Filter on hard predicates from `conditions_json` against context: season, irrigation, previous-crop-family rotation gap.
3. Score on soft predicates: soil N/P/K window fit (0–1), agro-zone match (+0.2), soil_texture match (+0.1), priority (rule weight).
4. Deduplicate by `crop_code`, keep highest-scoring rule per crop.
5. Return top 3 sorted by score desc.

### 3. Wire into existing lane — `agents/orchestrator.ts` (~line 1755)
Inside the existing `if (isRecommendationQuery)` block:
- Call `recommendNextCrop(...)`.
- If `candidates.length > 0`: build a structured `decision_output.actions_returned` array — one action per candidate carrying `crop_code`, `scientific_basis`, `farmer_reason`, `rule_id`, `confidence`. Set `template_type: 'NEXT_CROP_RECOMMENDATION'`, `decision_brain_source: true`, `confidence = top.score`.
- If `candidates.length === 0`: keep current deterministic stub (unchanged) but log `audit_tag: 'NEXT_CROP_NO_RULE_MATCH'`.
- Send through the existing return shape so `index.ts` pipeline bypass (already in place) still applies.

### 4. LLM formatter — `agents/llm-response-formatter.ts`
Already runs in NEXT-CROP RECOMMENDATION MODE (Phase 6). Extend the prompt builder so when `template_type === 'NEXT_CROP_RECOMMENDATION'` and `actions_returned[*].crop_code` is present, it MUST:
- Name each recommended crop in the farmer's language (use existing i18n crop-name map).
- For each crop, render `scientific_basis` as the "का?" / "क्यों?" / "Why?" line.
- Forbid inventing crops or reasons not present in `actions_returned` (existing output-validation gate already enforces this — extend its allow-list to include the candidate crop_codes).

No new LLM tools, no new prompts beyond this constraint block.

### 5. Tests — `tests/chat/next-crop-recommendation-routing.test.ts`
Add a new `describe('engine')` block:
- Given context `{ last_crop: 'sugarcane', soil: { n: 200, p: 25, k: 180 }, season: 'rabi', irrigation: 'irrigated', agro_zone: 'western-maharashtra' }` → top candidate is `chickpea`, candidate carries non-empty `scientific_basis` referencing N-fixation, response contains the Marathi word for chickpea ("हरभरा").
- Given no rule match → response falls back to current stub, never throws.
- Diagnostic flow unchanged: existing 33/33 routing tests still pass.

### 6. Audit doc
`docs/audit-2026-06-07/22-next-crop-recommender-engine.md` — root cause (no seeded rules), engine design, scoring formula, seed coverage matrix, gate-bypass invariants preserved.

## Files touched

- `supabase/migrations/<ts>_seed_crop_rotation_rules.sql` (new)
- `supabase/functions/ai-agriculture-chat/agents/next-crop-recommender.ts` (new)
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (extend existing lane only — lines 1755–1857)
- `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` (RECOMMEND-mode prompt + allow-list extension)
- `tests/chat/next-crop-recommendation-routing.test.ts` (extend)
- `docs/audit-2026-06-07/22-next-crop-recommender-engine.md` (new)

## Non-goals / preserved invariants

- No change to diagnostic intent paths, Canonical Context Builder, Unified Decision Gate, Authority Hierarchy, Crop Schedule SSOT, tenant/farmer isolation, NLU contract, NO_ACTIVE_CROP / G2 bypasses.
- No new DB columns; uses existing `decision_rules` schema only.
- No LLM-originated agronomic content — `scientific_basis` always comes from the matched DB row (existing "Rules are Supreme, AI Only Explains" invariant honored).
