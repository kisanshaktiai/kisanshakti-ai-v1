# The second sample — a Hindi sugarcane schedule, translated and transcribed into our standard format

**Source:** the Hindi text you pasted (a TNAU-style sugarcane package: plant crop day-wise to harvest, then a ratoon crop with its own day clock). Doses are per hectare as written; our pipeline scales per acre to the land record. Nothing added, nothing removed; `[as written]` marks source wording kept verbatim.

**Row format:** `phase · activity · domain → task_type · clock · window (days) · how / how much · condition`. Clock `planting` = days after planting (our sowing clock; the DB graph's `das_reference = planting`); `harvest` = days before harvest; ratoon rows are on the `ratoon_initiation` clock (a NEW schedule for the same land with `crop_cycle = ratoon`).

## PLANT CROP

### Up to 30 days
| # | Phase | Activity | Domain → task_type | Clock | Window | How / how much | Condition |
|---|---|---|---|---|---|---|---|
| 1 | PRE_SEASON | Deep ploughing to 45 cm; FYM / decomposed pressmud / compost 25 t/ha; deep tractor ploughing; furrows 80 cm apart, 20 cm high, 10 m long | LAND_PREPARATION → land_preparation | planting | before planting (graph: −45…−15) | tractor; 25 t/ha organic manure | — |
| 2 | PRE_SEASON | Superphosphate 375 kg/ha in the furrows (basal) | NUTRIENT → nutrition | planting | before planting (graph: −15…0) | 375 kg/ha SSP in furrows | — |
| 3 | ESTABLISHMENT | Sett selection: ~75,000 two-budded setts/ha from a 6–8-month nursery, or single-bud polybag seedlings | PLANTING → sowing | planting | 0 | 75,000 two-budded setts/ha | — |
| 4 | ESTABLISHMENT | Sett treatment: dip 10 min in 250 L water + 125 g carbendazim (Bavistin) + 2.5 kg urea + 2.5 kg lime | SEED_TREATMENT → seed_treatment | planting | 0 | 125 g carbendazim + 2.5 kg urea + 2.5 kg lime / 250 L, 10 min | — |
| 5 | ESTABLISHMENT | Plant setts 2 cm deep, buds to the sides; 2 rows per furrow every 10th furrow [as written] | PLANTING → sowing | planting | 0 | 2 cm depth, buds lateral | — |
| 6 | ESTABLISHMENT | Pre-emergence weed control: atrazine (Atrataf) 2.5 kg/ha in 500 L water, hand sprayer | WEED → weed_management | planting | 3 | 2.5 kg/ha in 500 L | — |
| 7 | ESTABLISHMENT | Trash mulching: spread dry cane leaves to 15 cm | INTERCULTURAL → intercultural | planting | 5 | 15 cm trash layer | — |
| 8 | ESTABLISHMENT | Gap filling with polybag-raised seedlings | INTERCULTURAL → gap_filling | planting | 25 | polybag seedlings | where gaps |

### 30–120 days
| # | Phase | Activity | Domain → task_type | Clock | Window | How / how much | Condition |
|---|---|---|---|---|---|---|---|
| 9 | VEGETATIVE | Biofertilizer: Azospirillum 5 kg + phosphobacteria 5 kg mixed with 250 kg FYM, at plant base; irrigate immediately | BIOLOGICAL_INPUT → nutrition | planting | 30 | 5 kg + 5 kg + 250 kg FYM /ha | — |
| 10 | VEGETATIVE | Irrigation every 7–10 days | IRRIGATION → irrigation (recurring) | planting | 35…100 | every 7–10 d | — |
| 11 | ESTABLISHMENT | Preventive early shoot borer: chlorpyriphos 250–300 g a.i./ha on setts, cover with soil | PEST → pest_management | planting | at planting (stated in the 35-day note) | 250–300 g a.i./ha | preventive |
| 12 | VEGETATIVE | Curative early shoot borer: if 25–30 % shoots affected, chlorpyriphos 250–300 g a.i. per 100 m row length, hand-spray top to bottom | PEST → pest_management | planting | 35…100 | 250–300 g a.i. per 100 m | ETL 25–30 % shoots affected |
| 13 | VEGETATIVE | Hand weeding; then N 110 kg + K₂O 60 kg + neem cake 35 kg /ha | WEED + NUTRIENT → weed_management, nutrition | planting | 45 | 110 kg N, 60 kg K₂O, 35 kg neem cake /ha | — |
| 14 | VEGETATIVE | Foliar spray urea 2.5 % + KCl 2.5 % during drought | NUTRIENT → nutrition (recurring) | planting | 60, 90, 120 | 2.5 % + 2.5 % | weather: drought |
| 15 | VEGETATIVE | Biofertilizer repeat: Azospirillum 5 kg + phosphobacteria 5 kg + 250 kg FYM at plant base; irrigate | BIOLOGICAL_INPUT → nutrition | planting | 60 | as row 9 | — |
| 16 | VEGETATIVE | Hand weeding; then N 110 kg + K 60 kg + neem cake 35 kg /ha | WEED + NUTRIENT → weed_management, nutrition | planting | 90 | as row 13 | — |

### 120 days to harvest
| # | Phase | Activity | Domain → task_type | Clock | Window | How / how much | Condition |
|---|---|---|---|---|---|---|---|
| 17 | GRAND GROWTH | K 60 kg/ha under drought; irrigate immediately | NUTRIENT → nutrition | planting | 120 | 60 kg K /ha | weather: drought |
| 18 | GRAND GROWTH | De-trashing | INTERCULTURAL → intercultural | planting | 150 | — | — |
| 19 | GRAND GROWTH | Internode borer: release parasitoid 5 cc/ha, 6 times, once every 15 days | PEST → pest_management (recurring, biological) | planting | 150…225 (every 15 d, 6×) | 5 cc/ha | if internode borer present |
| 20 | GRAND GROWTH | Irrigation once every 7 days | IRRIGATION → irrigation (recurring) | planting | 101…210 | every 7 d | — |
| 21 | GRAND GROWTH | Propping and tying the canes | INTERCULTURAL → intercultural | planting | 210 | — | — |
| 22 | GRAND GROWTH | Mealybug and whitefly: monocrotophos 36 SL 600 g a.i./ha [as written] | PEST → pest_management | planting | 225 | 600 g a.i./ha | — |
| 23 | RIPENING | Pyrilla and sucking pests: dichlorvos 76 EC 300 g a.i./ha [as written] | PEST → pest_management | planting | 260 | 300 g a.i./ha | if necessary |
| 24 | RIPENING | Irrigation once every 15 days | IRRIGATION → irrigation (recurring) | planting | 270…360 | every 15 d | — |
| 25 | MATURITY | Stop irrigation 15 days before harvest | IRRIGATION → irrigation | harvest | −15 | withdrawal | — |
| 26 | HARVEST | Cut canes at ground level with a sharp knife; remove dry leaves, roots and sheaths; send clean cane to the sugar mill | HARVEST → harvest | harvest | 0 | sharp knife, ground level | — |

## RATOON CROP (new schedule on the same land, `crop_cycle = ratoon`, day 0 = ratoon initiation)
| # | Phase | Activity | Domain → task_type | Clock | Window | How / how much | Condition |
|---|---|---|---|---|---|---|---|
| R1 | RATOON_INIT | Remove dry leaves; FYM 25 t + SSP 375 kg (75 kg P₂O₅) + N 135 kg + neem cake 35 kg /ha; irrigate and mix well; atrazine 2.5 kg in 500 L for weeds | POST_HARVEST/INTERCULTURAL + NUTRIENT + WEED | ratoon_initiation | 1…3 | as written | — |
| R2 | RATOON_INIT | Azospirillum 5 kg + phosphobacteria 5 kg + 250 kg powder at plant base; irrigate; spread dry leaves on beds | BIOLOGICAL_INPUT + INTERCULTURAL | ratoon_initiation | 9…10 | as written | — |
| R3 | EARLY_RATOON | Gap filling with polybag seedlings; preventive chlorpyriphos 250–300 g a.i./ha on setts, cover with soil | gap_filling + pest_management | ratoon_initiation | 25…30 | as written | — |
| R4 | EARLY_RATOON | Azospirillum 5 kg + 250 kg FYM at plant base; irrigate | BIOLOGICAL_INPUT → nutrition | ratoon_initiation | 35 | as written | — |
| R5 | EARLY_RATOON | Irrigation every 7 d | IRRIGATION (recurring) | ratoon_initiation | 1…35 | every 7 d | — |
| R6 | RATOON | Irrigation every 10 d | IRRIGATION (recurring) | ratoon_initiation | 35…90 | every 10 d | — |
| R7 | RATOON | Hand weeding; N 110 kg + K₂O 60 kg + neem cake 35 kg /ha; light hoeing | weed_management + nutrition + intercultural | ratoon_initiation | 60 | as written | — |
| R8 | RATOON | Extra K₂O 60 kg/ha under drought | NUTRIENT → nutrition | ratoon_initiation | 90 | 60 kg | weather: drought |
| R9 | RATOON | Irrigation every 7 d | IRRIGATION (recurring) | ratoon_initiation | 91…250 | every 7 d | — |
| R10 | RATOON | Foliar urea 2.5 % + KCl 2.5 % under drought | NUTRIENT (recurring) | ratoon_initiation | 30, 60, 90 | as written | weather: drought |
| R11 | RATOON | De-trashing and proper hoeing/earthing-up | INTERCULTURAL | ratoon_initiation | 120 | — | — |
| R12 | RATOON | Trichogramma parasitoid once every 15 days (when required) | PEST → pest_management (recurring, biological) | ratoon_initiation | 121…210 | every 15 d | when required |
| R13 | RATOON | Second de-trashing | INTERCULTURAL | ratoon_initiation | 180 | — | — |
| R14 | RATOON | Mealybug and whitefly: monocrotophos 36 SL 600 g a.i./ha [as written] | PEST → pest_management | ratoon_initiation | 210 | 600 g a.i./ha | — |
| R15 | RATOON | Irrigation every 15 d; stop 15 days before harvest | IRRIGATION (recurring) + withdrawal | ratoon_initiation / harvest | 251…360 / −15 | every 15 d | — |
| R16 | HARVEST | Cut at ground level with a sharp knife; clean cane to the mill | HARVEST → harvest | harvest | 0 | as written | — |

## What this calendar teaches that the rice one did not — and what the code does with it
1. **Pre-season work is part of the stage graph itself.** Your `crop_stage_master` already declares `SUGARCANE_LAND_PREPARATION −45…−15` and `PRE_PLANTING −15…0`. The validator used to reject any task there (V3). It now admits negative days **from the graph's own `das_min`** — the SSOT decides, not a code constant.
2. **A crop can have more than one cycle on the same land.** The ratoon is a separate schedule (`crop_cycle = ratoon`, day 0 = ratoon initiation, no planting, no sett treatment). Your graph has `sett_planted/ratoon` with 3 stages to day 120; the PoP runs the ratoon to day 360 → **content gap: ratoon stages 120…360 are missing** (report, not invented). The model is told what a ratoon cycle is and is not.
3. **Regulatory currency beats the source document.** Rows 22, 23, R14 prescribe **monocrotophos** (your regulatory table: `banned`) and **dichlorvos** (**not in your table** — verify against the CIB&RC banned/restricted list and add; until then the gate cannot stop it). Chlorpyriphos is `restricted` → admitted only through corroboration + second opinion, flagged `regulatory_restricted`. This is what "100 % accuracy on agronomy" means in 2026: the PoP is 20 years old in places; the gate is not.
4. **Cadence changes by period** (7–10 d → 7 d → 15 d → withdrawal at −15) → one irrigation proposal per period, plus a harvest-relative withdrawal; the reconciler then defers each event by rain and advances by deficit.
5. **Conditional recurring nutrition** (drought foliar at 60/90/120) → CONDITIONAL task with recurrence and a weather condition; the reconciler's `crop_stress_level` / water-balance verdicts are the trigger.
6. **Biological pest control is a first-class practice** (Trichogramma releases, 6× every 15 d) → `BIOLOGICAL_INPUT`/`PEST`, no PHI, no regulatory gate, dose still required.

## Sugarcane content status in your DB (verified today)
- stage graph: plant 21 stages (−45 → 390), ratoon 3 stages (0 → 120) · decision_rules: 533 active · fertilizer rows: 1 · variety agronomy rows: 0 · regulatory: monocrotophos banned, chlorpyrifos restricted, dichlorvos absent.
