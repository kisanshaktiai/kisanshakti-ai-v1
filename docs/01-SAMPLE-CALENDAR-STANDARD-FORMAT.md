# The sample calendar, transcribed into our standard format

**Source received:** one file, `crop-calendar-example.docx` — an IRRI "Rice Survivor" single-field calendar (Field 2, 1,500 m², variety NSIC Rc218, manual transplanting; the only image in the file is the programme logo). It is already in English; no second example was in the upload. Below is every row of it, re-expressed in the format our pipeline stores — nothing added, nothing removed.

**Our standard row:** `phase · activity · domain · task_type · clock · window (from…to days) · anticipated date · how / how much (as written) · condition`.
Clocks: `sowing` = DAS (in this transplanted calendar the sowing clock is the nursery seeding day, "DAP"), `transplant` = DAT, `harvest` = days before harvest.

## Season-plan header (not tasks → `generation_params.plan_summary`)
| Plan item | As written |
|---|---|
| Variety | NSIC Rc 218 (30 Nov) |
| Method | Manual transplanting |
| Fertilizer plan | 14-14-14 20 kg at 0–14 DAT; Urea 12 kg at 26–32 DAT; Urea 15 kg at 43–47 DAT (for 1,500 m²) |
| Weed plan | Wet land preparation with deep cultivation and puddling; continuous flooding 2–4 cm; clean bunds |
| Pest/disease plan | Snails – hand picking and bait leaves; rats – bait traps and clean bunds; insects/disease – to be determined |
| Field preparation plan | Wet preparation |

## Tasks
| # | Phase | Activity | Domain → task_type | Clock | Window | Anticipated | How / how much (as written) | Condition |
|---|---|---|---|---|---|---|---|---|
| 1 | PRE_SEASON | Fallow — glyphosate spray | LAND_PREPARATION → land_preparation | sowing | −30 | 3 Dec | — | if applicable |
| 2 | PRE_SEASON | Fallow — plough stubble | LAND_PREPARATION → land_preparation | sowing | −30 | 13 Dec | 4-wheel tractor, disc plough 2× | if applicable |
| 3 | PRE_SEASON | Bund maintenance and repair | LAND_PREPARATION → land_preparation | sowing/transplant | −20…0 | 13 Dec | Clean bunds, fill holes | — |
| 4 | NURSERY | Nursery soil preparation | PLANTING → nursery | sowing (DAP) | −7…−1 | 15 Dec | Prepare wet-bed nursery | — |
| 5 | NURSERY | Breaking seed dormancy | SEED_TREATMENT → seed_treatment | sowing (DAP) | −2 | 20 Dec | Soak seeds 24 h, then dry 24 h | — |
| 6 | NURSERY | Seeding nursery | PLANTING → nursery | sowing (DAP) | 0 | 22 Dec | Sow seeds in wet-bed nursery | — |
| 7 | PRE_SEASON | Wet prep — land soaking | LAND_PREPARATION → land_preparation | transplant | −30…−14 | 13–27 Dec | 14 days flooding to decompose stubble and soften soil | — |
| 8 | PRE_SEASON | Wet prep — puddling, harrowing, levelling | LAND_PREPARATION → land_preparation | transplant | −14…−4 | 27 Dec–4 Jan | Power tiller rotavator 2× (27 Dec); harrow 2× (30 Dec); third harrow + plank leveller (4 Jan) | — |
| 9 | PRE_SEASON | Dry prep — drying time before machine sowing | LAND_PREPARATION → land_preparation | transplant | −5 | — | — | if machine sowing |
| 10 | ESTABLISHMENT | Pre-emergence herbicide (Pretilachlor/Butachlor) | WEED → weed_management | sowing/transplant | −2…+2 | — | Not needed — weeds managed with water | if applicable |
| 11 | ESTABLISHMENT | Transplant | PLANTING → sowing | sowing (DAP) | 14…20 | 10 Jan | Transplant 19-day-old seedlings | — |
| 12 | ESTABLISHMENT | Apply water | IRRIGATION → irrigation | transplant | 0… | 10–25 Jan | Maintain water at 2–5 cm | — |
| 13 | ESTABLISHMENT | Basal fertilizer | NUTRIENT → nutrition | transplant | 0…14 | 15 Jan | 20 kg 14-14-14 | — |
| 14 | ESTABLISHMENT | Golden apple snail — check and control | PEST → pest_management | sowing (DAP) | 0…30 | 10–21 Jan | Hand-pick until seedlings are 30 days old | on presence |
| 15 | VEGETATIVE→MATURITY | Water management 3–10 cm | IRRIGATION → irrigation (recurring) | sowing → harvest | 0 … −14/−10 before harvest | 25 Jan–28 Apr | Maintain 3–10 cm water | — |
| 16 | ESTABLISHMENT | Post-emergent weed control | WEED → weed_management | sowing/transplant | 14…21 | 24–31 Jan | Apply post-emergent herbicide | if weeds |
| 17 | VEGETATIVE→MATURITY | Pest and disease monitoring and control | MONITORING → monitoring (recurring) | stage | early tillering → harvest | 25 Jan–10 May | Monitor | — |
| 18 | VEGETATIVE | Nitrogen top-dressing (Nutrient Manager) | NUTRIENT → nutrition | transplant | tillering (≈30) | 10 Feb | 12 kg urea at 30 DAT | — |
| 19 | VEGETATIVE | Weeds check | WEED → weed_management | sowing (DAP) | 30…40 | 10–20 Feb | Hand-weed if any weeds | if weeds |
| 20 | REPRODUCTIVE | Fertilizer — panicle initiation | NUTRIENT → nutrition | transplant | 40…50 | 25 Feb | 15 kg urea at 45 DAT | — |
| 21 | MATURITY | Drain water | IRRIGATION → irrigation | harvest | −14…−10 | 26 Apr–1 May | Drain | — |
| 22 | HARVEST | Harvest | HARVEST → harvest | harvest indicator | 22–24 % grain moisture | 10 May | Combine harvest at 22 % MC | — |
| 23 | POST_HARVEST | Drying | POST_HARVEST → post_harvest | harvest | 0…+2 | 10–12 May | Flatbed dryer | — |
| 24 | POST_HARVEST | Storage | POST_HARVEST → post_harvest | harvest | +2… | 12 May–20 Sep | Superbag storage | — |
| 25 | POST_HARVEST | Milling | POST_HARVEST → post_harvest | harvest | — | 20 Sep | Mill as brown rice | — |
| 26 | POST_HARVEST | Marketing / sale | POST_HARVEST → post_harvest | harvest | — | 20 Sep | Higher value: off-season, brown rice | — |

## What the transcription changed in the code (rev 3)
- Rows 4–5 sit before nursery seeding → negative windows now admitted for phase **NURSERY** too, and NURSERY-phase tasks use task_type `nursery`.
- Rows 1–3, 14, 19: cultural work with no dosed input (plough, clean bunds, hand-pick, hand-weed) → dose+unit is required only for fertilizer/micronutrient/organic/biological and plant-protection inputs.
- Everything else in the table was already representable: pre-season negatives, transplant/harvest clocks, recurring water and monitoring, conditional rows, harvest indicator, post-harvest chain, tools/labour, the planning header.

## Coverage check for a generated transplanted-rice schedule (run after generation)
```sql
-- expects one row per category with present=true; a false row is a content gap for that crop, not a code gap
with s as (select id from crop_schedules where id = '<schedule_id>')
select c.category, exists (select 1 from schedule_tasks t, s where t.schedule_id = s.id and t.task_type = any(c.types)
        and (c.negative is null or (c.negative and t.days_from_sowing < 0) or (not c.negative and t.days_from_sowing >= 0))) as present
from (values
  ('pre-season land preparation', array['land_preparation'], true),
  ('nursery / seed treatment before seeding', array['nursery','seed_treatment'], true),
  ('sowing or transplanting', array['sowing'], false),
  ('basal fertilizer', array['nutrition'], false),
  ('irrigation', array['irrigation'], false),
  ('weed management', array['weed_management'], false),
  ('pest management', array['pest_management'], false),
  ('scouting / monitoring', array['monitoring'], false),
  ('harvest', array['harvest'], false),
  ('post-harvest (drying/storage)', array['post_harvest','residue_management'], false)
) as c(category, types, negative);
```
