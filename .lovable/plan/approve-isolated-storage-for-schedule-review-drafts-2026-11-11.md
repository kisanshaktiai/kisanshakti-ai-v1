# Approve isolated storage for schedule review drafts

## Verified database constraint
The hosted `crop_schedules.status` allows only active, paused, completed, cancelled and failed. The atomic save function requires nonempty executable tasks and updates the land. Reusing a paused or cancelled schedule as a review draft would misrepresent its lifecycle and expose it to existing schedule consumers.

## Minimal proposed database addition
Create a separate `crop_schedule_review_drafts` table, leaving active schedules and their triggers unchanged.

- Bind each draft to its verified farmer, tenant and owned land.
- Store crop inputs, evidence blockers, source references, requested language and an isolated review summary.
- Do not store executable tasks, doses, predicted harvest dates or an activation switch.
- Provide owner-scoped reads through the existing verified-session server architecture; deny direct public/client access. Grant the server role access and enable row-level security.
- Rechecking a draft reruns generation and all current evidence gates. It cannot directly activate or convert stored draft content into field tasks.

## Implementation after approval
1. Submit the table and grants through the database migration approval tool.
2. Add verified owner-scoped save/list/read operations to the existing schedule function and a persistent review screen with edit/recheck actions.
3. Preserve distinct database harvest phases and only authorize repeated-picking programmes when complete governed evidence exists.
4. Add isolation and release-gate regressions; verify staging read-back with an authorized farmer session before any production deployment.

## Unchanged
No changes to existing schedule data, active schedule access rules, land triggers, the chat decision brain, or agronomic verification requirements. No production deployment until the approved release checks pass.

## Decision requested
Approve the separate review-draft table so the approved schedule repair can proceed safely. This authorizes preparing the migration; the migration tool remains the execution approval boundary.