# Agronomic audit of the live schedule + water in litres (2026-09-09)
Repo · branch kisanshakti-ai-update · HEAD **78535721** (pulled today). Schedule audited: **`07c8a5e6`** — Rice, Wada Kolam (Zini/Jhini), direct-seeded, 1.02 acre, Kolhapur, sown 20 Jun 2026, 145-day variety, 36 tasks, `single_pass_composition`, narration COMPLETE 36/36. All 36 tasks read individually.

## 1. Expense engine — audited, NOT built (as instructed, not built now)
`total_estimated_cost` is `null` on every schedule. In `baseline-generator.ts` the value is literally `const estimatedCost: number | null = null`, with a comment stating cost is only computed when the DB supplies an authoritative input-product identity, which does not exist yet. The only costing code is a labour-rate lookup, and `labor_rates` and `input_prices` are both empty. Two gaps are recorded honestly on every run: `labor_rates_no_row`, `input_price_not_authoritatively_mappable`. **Nothing to fix; left for the next phase.**

## 2. What is agronomically CORRECT in this schedule
- **Nutrient arithmetic is exact.** N 20.64 + 10.32 + 10.32 = 41.28 kg; K₂O 10.32 + 5.16 + 5.16 = 20.64 kg; P₂O₅ 20.64 kg all basal. Splits land at DAS 0 / 35 (tillering) / 60 (panicle initiation) — the right physiological moments.
- **Stage timing matches the DSR stage graph**: germination 0–9, seedling 10–20, early vegetative 21–34, tillering 35–59, PI 60–74, booting 75–89, heading 90–99, flowering 100–109.
- **Water rises and falls correctly through the cycle** — 20 → 30 → 60 → 70 mm peaking at panicle initiation, then tapering 60 → 55 → 60 → 40 mm. PI as the peak is right for rice.
- **Weed card at DAS 10** correctly states the critical first-45-day weed-free period.
- **Harvest indicator is proper agronomy**: "80% of panicles straw-coloured and the grain in the lower panicle hard when pressed."
- **Scouting is one card per stage** with real symptoms; the earlier 36-cards-on-one-day pile-up is gone.
- **Marathi is genuine** on 34 of 36 cards — real farmer language, not transliteration.

## 3. Defects found — and what I fixed
| # | Finding | Severity | Root | Fixed here |
|---|---|---|---|---|
| 1 | **Three harvest cards** — DAS 110 (8 Oct), 130 (28 Oct), 140 (7 Nov) — on a crop whose harvest date is 12 Nov. The first is 35 days early; a farmer could cut an unripe crop. | **P0 agronomic** | The stage graph runs to DAS 190 with overlapping late stages (grain-filling 110–129, maturity 130–150, harvest 140–160, post-harvest 160–190) while Wada Kolam matures at 145. One task per stage → several harvest cards. | **Yes** — the crop cycle now closes at the variety's maturity: harvest cards merge into **one** card at maturity carrying all merged guidance. |
| 2 | **Post-harvest dated 27 Nov** — 15 days *after* the farmer's own harvest date, window running to DAS 190. | **P0 agronomic** | same | **Yes** — post-harvest is moved to immediately after harvest. |
| 3 | **Two "stop irrigation" cards** (DAS 130 and 140) and **irrigation continuing DAS 110–129** while a harvest card says the crop is ready. | P1 | same | **Yes** — anything starting past maturity is dropped and stage windows are closed at maturity, so water never runs past harvest. |
| 4 | **Water only in mm** (20/30/60/70/60/55/60/40 mm). A farmer runs a pump or drip line in litres; "60 mm" is not actionable. | **P1, your ask** | never converted | **Yes** — see §4. |
| 5 | **Two nutrition cards kept English titles** ("Apply Potassium (K2O basis) fertilizer") with Marathi descriptions, and were still counted as translated. | P1 | My composer checked the language on the *joined* text, so an English title rode on a translated body. | **Yes** — language is now checked **per field**; a task with an English title is rejected and stays pending. |
| 6 | **The whole LLM enrichment tier is dead in production.** `enrichment` is null on every schedule. | **P0 silent failure** | `llm-candidates.ts` line 151 has an **unterminated string literal** — present in the pushed code. Enrichment is dynamically imported inside a try/catch, so the syntax error is swallowed as "enrichment failed (non-fatal)" and no proposal is ever made. | **Yes** — string terminated; all four files now parse clean. |
| 7 | Basal 50% N at sowing for **direct-seeded** rice; ~100 kg N/ha on a tall traditional variety that lodges. | P1 **content** | The only rice fertilizer row is a transplanted-context row (`fertilizer_context_mismatch` is recorded). | **No — content.** Needs a DSR row in `fertilizer_recommendation_master` and a variety class. |
| 8 | Harvest-readiness rule anchored to grain-filling (that is why a harvest card appeared at DAS 110 at all). | P2 **content** | rule `stage_applicable` names grain-filling only. | **No — content.** Re-tag the rule to maturity. |
| 9 | Micronutrient card is a soil-condition advisory ("where deficiency is common…") presented as a dated action; no soil test on this land. | P2 **content** | rule not marked soil-test conditional | **No — content.** |

## 4. Water: litres alongside depth
`litres = depth (mm) × field area (m²)`, and 1 mm over 1 m² is exactly 1 litre — so this needs only the land area you already hold, and **no irrigation-efficiency guess** (the test asserts no efficiency factor is introduced). For this field, 1.02 acre = 4,128 m²:

| Stage | Depth | Events | **Stage total** | **Per event** |
|---|---|---|---|---|
| Germination 0–9 | 20 mm | 10 | **82,556 L** | **8,256 L** |
| Seedling 10–20 | 30 mm | 6 | 123,834 L | 20,639 L |
| Tillering 35–59 | 60 mm | 9 | 247,668 L | 27,519 L |
| Panicle initiation 60–74 | 70 mm | 5 | 288,946 L | 57,789 L |
| Booting 75–89 | 60 mm | 5 | 247,668 L | 49,534 L |

Stored as `schedule_tasks.water_required_liters` (the column the UI already reads for a farmer-usable quantity) and in `resources.water_volume` with `stage_total_liters`, `per_event_liters`, `events`, `field_area_m2` and `basis: depth_mm_x_field_area_m2`. The composer is given the litres as a fact and told to say the volume as well as the depth, so the farmer's card carries the figure he can set a pump to. The depth stays as the agronomic figure.

## 5. Files
| File here | Repo path |
|---|---|
| `supabase__functions__ai-smart-schedule__generator__baseline-generator.ts` | `…/generator/baseline-generator.ts` — litres + maturity clamp |
| `supabase__functions__ai-smart-schedule__generator__compose-farmer-text.ts` | `…/generator/compose-farmer-text.ts` — litres as a fact, per-field language check |
| `supabase__functions__ai-smart-schedule__harness__llm-candidates.ts` | `…/harness/llm-candidates.ts` — **syntax fix that revives enrichment** |
| `supabase__functions__ai-smart-schedule__index.ts` | `…/index.ts` — persists `water_required_liters`, passes volume to the composer |
| 3 test files | `tests/edge/schedule/…` — 3 new contracts (litres, maturity clamp, per-field language); 2 realigned |

## 6. Evidence
`deno test tests/edge/schedule/ tests/decision-brain/product_match_test.ts` → **81 passed, 0 failed**. All four changed function files parse clean under esbuild (the syntax error is gone). Deno std and `@supabase/supabase-js` shimmed locally; no test logic weakened.

## 7. Not done
Existing schedules are unchanged until regenerated; the fixes reach farmers after `ai-smart-schedule` is deployed. Items 7–9 above are database content, not code.
