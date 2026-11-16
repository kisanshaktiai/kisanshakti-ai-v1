# Restore schedule availability without weakening agronomic safety

## Confirmed issue
The current activation gate rejects every repeated-picking crop, even when its other evidence is complete. Missing verified variety duration or planting-material rate also rejects the whole plan before anything is saved. The farmer only receives a toast and returns to the input form.

The baseline generator additionally merges harvest tasks into one task, so deleting the repeated-picking blocker alone would expose an incomplete harvest programme. Persistence currently creates an active schedule and updates the land. There is no implemented review-only alternative.

## Proposed repair
1. **Separate creation from activation.** Let evidence-incomplete plans be saved as clearly labelled, inactive review drafts. Keep all verified-evidence gates for activating actionable schedules.
2. **Protect field operations.** Review drafts must not update the land's crop, replace its active schedule, create executable field tasks, or enter reminders, reconciliation, completion, or proactive workflows. Keep unverified doses and harvest dates absent.
3. **Repair repeated-picking support.** Preserve distinct DB-backed harvest stages and their governed timing/recurrence instead of merging them. Activation requires complete applicable database evidence; crop names must never control eligibility. If the database does not provide enough evidence, retain a review draft rather than guessing picking intervals.
4. **Show a durable review view.** Replace the toast-only dead end with a saved-plan screen listing evidence gaps in the farmer's selected language. Offer editing of crop details and a recheck action; do not imply that farmer consent can verify unsupported agronomy.
5. **Leave existing schedules untouched.** No historical schedule rewrite or automatic activation of older plans.

## Technical details
- Inspect the hosted schedule schema, atomic persistence function, and all schedule consumers before choosing storage. Use existing fields only if they can enforce review isolation; otherwise present the minimal necessary database change for approval. No database or access-policy changes are authorized by this plan alone.
- Represent release eligibility separately from the generated baseline; preserve DB provenance, nullable quantities, reference-clock validation, tenant/farmer ownership and existing treatment safeguards.
- Review drafts should store an isolated review payload, not executable `schedule_tasks`. All paths that read active schedules must exclude drafts.
- Changes stay in schedule generation, persistence integration and schedule presentation; the chat decision brain remains untouched.

## Verification and release
- Regression scenarios: no variety; unverified maturity/rate; ambiguous maturity clock; fully evidenced single harvest; fully evidenced repeated picking; incomplete repeated-picking evidence.
- Verify drafts cannot activate, mutate land state, replace existing schedules, produce reminders or accept task completion.
- Verify repeat harvest stages survive generation and chronology remains correct without invented recurrence.
- Run schedule regression tests and inspect automatic preview checks. Then verify creation and read-back with an authorized farmer session in an isolated staging environment.
- Do not deploy production changes until review isolation and agronomic release checks pass. Authenticated verification currently requires an available authorized session for this external Supabase project.

## Approval boundary
This is a cross-cutting release-policy repair, not a safe one-line fix. Approval starts implementation and schema inspection; any required database modification must receive its own approval before execution.