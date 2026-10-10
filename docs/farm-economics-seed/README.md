# Farm economics seed data — how rows get in (farmer-app repo)

No cost, wage, norm or yield figure is written by code or by a migration.
Every figure enters through one of three origins, all recorded on the row:

| origin | who | scope it may claim | source proof |
|---|---|---|---|
| knowledge_source | admin loading a published document | the level the document publishes (WRRI: state x operation x gender, monthly; CACP: state x crop x season) | knowledge_sources.id registered first, with url / document_ref / accessed_on |
| admin_entered | admin / field officer entering a locally observed rate | district, taluka or village | source_note (where, when observed — no personal names) |
| farmer_confirmed_aggregate | the engine, from farmers' confirmed/corrected expenses | taluka, then district | observation_count on the row; never overwrites the other two |

Published-rate loading order (nothing is typed from memory):
1. Labour Bureau "Wage Rates in Rural India" — data.gov.in catalog "Average Daily
   Wage Rate in Rural India" (machine-readable) or the monthly Labour Bureau
   release. Register the release in knowledge_sources, then load labor_rates rows:
   state_id, operation_type (WRRI occupation), skill_tier (as published),
   daily_wage, currency, effective_date (WRRI month), origin='knowledge_source',
   knowledge_source_id.
2. CACP "Cost of Cultivation / Production" state tables — cost_component_standard
   rows per crop x state x season, cost_basis exactly as the CACP concept
   (A1, A2, A2+FL, C2 ...), reference_season, effective_from.
3. State agriculture university package-of-practice labour norms —
   cultivation_operation_norm rows (person_days_per_acre, machine_hours_per_acre)
   with the publication registered in knowledge_sources.

CSV templates (header only) are beside this file. Load them from the admin panel
or with a reviewable INSERT; a migration must never carry the figures.
