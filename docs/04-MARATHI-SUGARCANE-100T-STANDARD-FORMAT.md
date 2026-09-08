# Third sample — Marathi "100 t/acre sugarcane" package (factory agronomist), transcribed into our standard format

**Source:** two photographed sheets in Marathi, author Shri Sandip Ganpatrao Pawar, soil & water testing expert, Krantiagrani Dr. G. D. Bapu Lad Sahakari Sakhar Karkhana (phone on sheet). Per **acre**. Page 1 = conventional (soil application + drenching + foliar + slurries); page 2 = the same package for a **drip** field (fertigation every 15 days). Nothing added; product names as printed ("Bavistin", "Chloro", "Seaweed extract", "IBA", "GA", "Mycorrhiza combi", "Combi", "Silicon", "Gandhak" = sulphur).

**Authority note (agronomist):** this is a practitioner's intensive package, not a SAU package of practices — `authority_tier` should be *practitioner/company*, corroboration weight lower than SAU/ICAR. Regulatory: "Chloro 200 ml" (chlorpyriphos, `restricted` in your table); GA and IBA are plant-growth regulators (registration for use on sugarcane must be checked before a PGR task is served).

## Row format
`phase · activity · domain → task_type · application_method_group · clock (days after planting) · window · water basis · inputs with quantity per acre (as written) · condition`

## Page 1 — flood / furrow field
| # | Phase | Activity | Domain → task_type | Method group | Day | Water basis | Inputs per acre (as written) |
|---|---|---|---|---|---|---|---|
| 1 | PRE_SEASON | Before opening furrows: plough, apply 5–7 trolley fully decomposed FYM, harrow/cultivate, then open furrows | LAND_PREPARATION → land_preparation | mechanical | before planting | — | FYM 5–7 trolleys |
| 2 | ESTABLISHMENT | Sett treatment dip | SEED_TREATMENT → seed_treatment | seed_or_sett_treatment | 0 | per 100 L | Bavistin 200 g, Chloro 200 ml, seaweed extract 200 ml, IBA 5 g |
| 3 | ESTABLISHMENT | Basal at planting | NUTRIENT + ORGANIC → nutrition | soil_application | 0 | — | Urea 50 kg, neem cake 100 kg, SSP 200 kg, potash 50 kg, mycorrhiza combi 50 kg, sulphur 10 kg, vermicompost 200 kg |
| 4 | VEGETATIVE | Day-45 dose | NUTRIENT → nutrition | soil_application | 45 | — | Urea 50 kg, ammonium sulphate 50 kg, DAP 50 kg, neem cake 50 kg, sulphur 10 kg, vermicompost 200 kg |
| 5 | VEGETATIVE | Day-75 dose (light earthing-up / "balbharni") | NUTRIENT + INTERCULTURAL | soil_application | 75 | — | DAP 50 kg, neem cake 50 kg |
| 6 | GRAND GROWTH | Day-120 dose (earthing-up / "bharni") | NUTRIENT + INTERCULTURAL | soil_application | 120 | — | Urea 100 kg, 10:26:26 50 kg, DAP 100 kg, potash 50 kg, combi 50 kg, neem cake 100 kg, sulphur 10 kg, silicon 50 kg |
| 7 | ESTABLISHMENT | Drenching 1 | NUTRIENT/BIOLOGICAL → nutrition | drenching | 20 | per 200 L | Humic acid 1 kg, fulvic acid 1 kg, IBA 5 g, GA 5 g |
| 8 | VEGETATIVE | Drenching 2 | BIOLOGICAL → nutrition | drenching | 40 | per 200 L | Humic 1 kg, fulvic 1 kg, Azotobacter 2 L, PSB 2 L, KSB 2 L |
| 9 | VEGETATIVE | Drenching 3 | NUTRIENT/PGR | drenching | 60 | per 200 L | Humic 1 kg, fulvic 1 kg, IBA 5 g, GA 5 g |
| 10 | VEGETATIVE | Drenching 4 | BIOLOGICAL | drenching | 80 | per 200 L | Humic 1 kg, fulvic 1 kg, Azotobacter 2 L, PSB 2 L, KSB 2 L |
| 11 | VEGETATIVE | Foliar 1 | NUTRIENT/PGR → nutrition | foliar_spray | 35 | per 100 L | Seaweed 500 ml, GA 5 g, 19:19:19 500 g |
| 12 | VEGETATIVE | Foliar 2 (with fungicide + insecticide) | NUTRIENT + DISEASE + PEST | foliar_spray | 45 | per 100 L | Seaweed 500 ml, 19:19:19 500 g, Bavistin 200 g, Chloro 200 ml |
| 13 | VEGETATIVE | Foliar 3 | NUTRIENT/PGR/MICRONUTRIENT | foliar_spray | 55 | per 100 L | Seaweed 500 ml, GA 5 g, 6-BA 4 g, chelated combi 100 g |
| 14 | VEGETATIVE | Foliar 4 | MICRONUTRIENT + NUTRIENT | foliar_spray | 65 | per 100 L | Seaweed 500 ml, calcium nitrate 200 g, boron 100 g, 13:0:45 500 g |
| 15 | VEGETATIVE | Foliar 5 (with fungicide + insecticide) | NUTRIENT + MICRONUTRIENT + DISEASE + PEST | foliar_spray | 85 | per 100 L | Seaweed 500 ml, 13:0:45 500 g, chelated combi 100 g, Bavistin 200 g, Chloro 200 ml |
| 16 | VEGETATIVE | Chemical slurry — prepare, ferment 4–5 days, apply in furrows | NUTRIENT (prepared mixture) | drenching | 50 | 200 L | Cow dung 5 pats, cow urine 50 L, jaggery 2 kg, sulphate combi 10 kg |
| 17 | VEGETATIVE | Biological slurry — prepare, ferment 4–5 days, apply in furrows | BIOLOGICAL (prepared mixture) | drenching | 70 | 200 L | Cow dung 5 pats, cow urine 50 L, jaggery 2 kg, Azotobacter 2 L, PSB 2 L, KSB 2 L |

## Page 2 — drip field (fertigation), same crop and package
| # | Phase | Activity | Method group | Day(s) | Inputs per acre (as written) |
|---|---|---|---|---|---|
| D1 | ESTABLISHMENT | Basal at planting (in furrow) | soil_application | 0 | 10:26:26 100 kg, DAP 100 kg, ammonium sulphate 50 kg, neem cake 100 kg, mycorrhiza combi 50 kg, sulphur 10 kg, vermicompost 100 kg |
| D2 | GRAND GROWTH | Earthing-up dose | soil_application | ~120 | 10:26:26 100 kg, DAP 100 kg, ammonium sulphate 100 kg, neem cake 100 kg, mycorrhiza combi 50 kg, sulphur 10 kg, vermicompost 100 kg |
| D3 | ESTABLISHMENT→GRAND GROWTH | Fertigation every 15 days, 14 events, day 15 → 210 | fertigation | 15,30,…,210 | Premium 19:19:19 / 12:61:0 / 0:0:50 per event: 3/2/1 (d15–60), 3/3/1 (d45–60), 2/4/2 (d75–105), 2/3/2 (d120–135), 1/3/2 (d150), 1/2/3 (d165–210) kg — totals 27 / 33 / 29 kg |
| D4 | monthly | Biological "sanjeevak" with fertigation | fertigation | month 1, 2, 3 | Humic 1 kg + fulvic 1 kg + IBA 10 g (months 1 & 3); Azotobacter 2 L + PSB 2 L + KSB 2 L (month 2) |
| D5–D9 | as page 1 rows 11–15 | Foliar 1–5 | foliar_spray | 35, 45, 55, 65, 85 | identical to page 1 |
| D10–D11 | as page 1 rows 16–17 | Slurries | drenching | 50, 70 | identical to page 1 |

## What this style teaches — and what changed in the code (v1.4.0)
1. **Practices are organised by application method, each with its own water basis.** Soil application (no basis), drench per 200 L, foliar per 100 L, sett dip per 100 L, fertigation per event. → `application_method_group` + `water_volume_basis_l` on every proposal; the task text says "mixture for 100 L water".
2. **Several inputs go into one tank at one time** (row 12: seaweed + NPK + fungicide + insecticide). → one proposal with many inputs; each input keeps its own kind, grade, regulatory check and PHI.
3. **Fertilizer is named by grade as printed on the bag** (19:19:19, 12:61:0, 0:0:50, 10:26:26, 13:0:45). → `inputs[].grade`; narration keeps grades in Latin script, unchanged.
4. **The same crop has two valid calendars depending on the field's irrigation system.** → the model receives `farmer_field.irrigation_system` from `lands.irrigation_type` (values in your DB: drip, flood, furrow, manual, sprinkler, surface); fertigation proposals are gated `fertigation_requires_drip`; a proposal marked for one system is rejected on another (`irrigation_system_mismatch`).
5. **Prepared mixtures have recipes** (slurry: 5 dung pats + 50 L cow urine + 2 kg jaggery + …, ferment 4–5 days, apply in furrows). → `mix_recipe` ordered steps, rendered as "Prepare 1: … Prepare 2: …".
6. **Everything is per acre** — the unit our pipeline already scales to the land record.
7. **Language:** the source is Marathi; RAG ingestion is language-agnostic, the corpus filter is by crop + state, and the farmer receives the card in *their* language through narration — a Marathi source can serve a Kannada farmer.

## Where the gates will act on this sheet (correctly)
- Bavistin (carbendazim) and Chloro (chlorpyriphos, `restricted`) in rows 2, 12, 15 → full chemical path: corroboration + second opinion; served only if both pass.
- GA, IBA, 6-BA are PGRs → `chemical_without_phi` unless PHI is given; registration on this crop is checked by the second opinion.
- Practitioner authority tier → corroboration from an SAU/ICAR source raises confidence; the sheet alone does not make a chemical row servable.
