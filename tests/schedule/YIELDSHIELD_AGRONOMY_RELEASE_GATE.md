# YieldShield Agronomy Correctness Repair — Review Gate

Target: `kisanshakti-ai-update`. Source branch: `fix/yieldshield-agronomy-clock-evidence-hardening-20261111`.

## Why this is a surgical safety patch, not a claim of certification
Live Indrayani schedule `453fc97c-5c50-421f-a45a-359c7f1baec4` had nursery sowing 2026-05-25, transplanting 2026-07-06 and a 2026-09-21 harvest, despite the selected VCA using 110–119 **DAT** with evidence tier `D_unverified`. It also scheduled BGA/Azolla and weeding at **0 DAT**, had a 31.94 kg seed plan from an unverified VCA rate, and applied nursery water depth to 3.51 acres of main field. This branch avoids making additional unsupported agronomic claims.

## Changes in this branch
- Reject quantity/duration precision from VCA tier `D_unverified`. A documented duration is used ONLY with an explicit recognised reference clock and transplant offset where required. Missing verified duration means harvest_date remains NULL, not a guessed 119 DAS.
- Keep season-long stage graph and anchor harvest to its selected crop's actual **harvest** stage. Add missing maturity monitoring, soil-test/nutrient planning, and critical-stage water observation cards (no invented doses).
- Reanchor pre-transplant stage records to the farmer's transplant event. When nursery age lies outside the graph, withhold pending-stage fertilizer/irrigation applications and mark a review gap. The clock discrepancy is disclosed, not erased.
- Withhold date-relative rules such as “15 days after transplanting” until structured event-offset and method applicability are authored in the governed DB, rather than scheduling at stage start. A separate agronomic data curation project is required to restore these as precise tasks.
- Suppress deficit-dependent doses without observation, and suppress quantitative nutrient field actions when soil fertility evidence is absent.
- Do not extrapolate nursery water volume from main-field area.
- Preserve a safe scouting summary, but withhold candidate watch-list treatment instructions and reject treatment instructions after harness.
- Filter legacy DSR-specific scouting rules from transplanted rice, and respect safety/servable flags on observation rules.
- Keep LLM proposals in the expert-review channel instead of allowing model self-attestation or model second-opinion to authorize field applications.
- Enforce crop-stage and monitoring safety invariants immediately after harness and before persistence.
- Mark backdated pending work `HISTORICAL_UNCONFIRMED` in task resources, without marking farmer actions complete.

## Grounded agricultural source references (for the **review**, NOT blanket numeric migration)
- MPKV improved varieties PDF, Indrayani: 135–140 days, transplanted seed 12–15 kg/acre.
  https://mpkv.ac.in/Uploads/Research/02%20-%20Bajara%2C%20Rice_20230828121028.pdf
- IRRI rice crop establishment and management reference:
  https://www.knowledgebank.irri.org/images/docs/planting-establishment.pdf
- IRRI grain maturity and harvest moisture guidance:
  https://www.knowledgebank.irri.org/images/docs/training-manual-harvesting.pdf
- ICAR water productivity/modified SRI research (do NOT transfer method-specific quantities to conventional transplanted crops):
  https://www.icar.gov.in/en/technology-modified-sri-method-enhancing-water-productivity-rice

## Not resolved by code alone — **release blockers**
1. Approved Indrayani method-specific seed-rate and maturity reference semantics; an MPKV duration does not itself prove exact sowing/DAT clock.
2. Nursery-area measurement and verified irrigation interval / event-volume; rainfall and real soil-water evidence.
3. Expert-approved, soil/context-matched NPK splits and input products for the target land, plus crop-specific micronutrient triggers.
4. Structured `timing_anchor_event`, `offset_start_day`, `offset_end_day` and `condition` in governed decision-rule data; no regex-derived application dates.
5. Official currently valid CIB&RC/label claim mapping for any chemical product with verified dose, crop, pest, PHI and jurisdiction.
6. Crop × cultivation-method × crop-cycle × variety-stage graph matrix for **every target crop** and actual expert field validation.
7. End-to-end isolated Supabase integration tests (generation, persistence, RLS, weather reconciler, recurrent completion) plus agronomist signoff. Frontend build alone does not prove production readiness.
8. The production generation endpoint currently persists active schedules and does not yet support a scientific review-only activation state. Do not deploy this branch until that release policy is implemented and tested.

## Safe rollout sequence
1. Complete tests and formal agronomy review on this PR.
2. Staging DB only. Generate Indrayani, rice DSR, sugarcane sett and ratoon, groundnut and other crop scenarios. Diff ALL tasks and accepted action states.
3. Verify all reference and method/cycle eligibility, mutation/auth invariants, date events, source citations and Marathi narration.
4. Release by farmer/tenant cohort, with source version and rollback plan. Do not bulk-rewrite historical schedules.
