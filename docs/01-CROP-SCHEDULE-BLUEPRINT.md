# KisanShakti crop schedule — the shape, learned from a real crop calendar

The sample (an IRRI-style rice calendar for one field, transplanted NSIC Rc218) teaches five structural things that every crop calendar from a KVK, SAU or company R&D shares, whatever the crop. Our schedule now follows all five, in our own stage-wise style.

## 1. A calendar is phases → activities, and phases start BEFORE sowing
The sample has 8 rows before the seed touches the field: variety choice, sowing-method choice, fertilizer plan, weed plan, pest plan, field-prep plan, fallow spray/plough at −30 days, bund repair at −20…0, nursery soil prep at −7…−1, seed soaking at −2. Our pipeline started at day 0. Now: **PRE_SEASON** tasks are dated before sowing (validator admits negative days only for `phase = PRE_SEASON`, bounded at −60), and the six planning rows are not tasks but the **season-plan header** (`generation_params.plan_summary`: variety, method, seed, every fertilizer split with its window, water/weed/pest/disease strategy, harvest, post-harvest, domain coverage).

Phase ladder we use for every crop: `PLANNING (header) → PRE_SEASON → NURSERY → ESTABLISHMENT → VEGETATIVE → REPRODUCTIVE → MATURITY → HARVEST → POST_HARVEST`. Biological stages (`crop_stage_master`) sit inside these phases; tasks are anchored to a stage AND carry a phase.

## 2. Timing is a window on a named clock, not a date
Every sample row: `0–14 DAT`, `14–21 DAS/DAT`, `40–50 DAT`, `−7…−1 DAP`, `10–14 days before harvest`. Four clocks: sowing (DAS), transplant (DAT), nursery (DAP), harvest-relative. Then one anticipated date inside the window. Now every task carries `resources.window = {from_das, to_das, clock}` (sowing-clock days for the calendar axis, original clock recorded) plus its `task_date`. The card can say "between 24 and 31 Jan"; the reconciler defers only inside the window.

## 3. Every activity says how and how much for THIS field
`20 kg 14-14-14 for 1500 m²`, `12 kg urea at 30 DAT`, `soak 24 h then dry 24 h`, `puddle 2–3×, harrow 2–3×, level`, `2-wheel power tiller with rotavator`. Our task text = purpose · steps · inputs with dose per acre scaled to the land · water volume · method · tools/labour · PHI. Tier 1 comes from the DB; Tier 2 from the verified model proposals, both in this shape.

## 4. Conditional and continuous activities are first-class
"If weeds, apply post-emergent herbicide", "hand weed if any", "monitor early tillering to harvest", "maintain 3–10 cm water 0 DAS to 10–14 days before harvest". Ours: `CONDITIONAL_RULE` tasks with an "Only if:" step; recurring irrigation/scouting carried as ONE task with a recurrence window; harvest-relative anchors for drain/withdrawal.

## 5. The crop life ends at storage and sale, not at harvest, and the crop decides the shape
Drying (flatbed), storage (Superbag), milling, marketing, sale — and for sugarcane a ratoon decision. `POST_HARVEST` is now an audited, enrichable domain. Crop-specific structure (nursery for transplanted rice; sett treatment and earthing-up for sugarcane; pinching/pruning for cotton; fruit-set sprays for horticulture) comes from each crop's own stage graph + DB rules + PoP-corroborated proposals — never from a generic template.

## What is deliberately different from the sample
- Quantities per **acre scaled to the land record**, not per field entered by hand.
- Pest/disease lines carry ETL + product + dose + PHI when verified, or scouting only — never "to be determined".
- Every task knows its evidence (`source_refs`, `provenance`) and the dynamic layer moves it by field state.
