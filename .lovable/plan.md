## Goal
Fix the 4 defects identified in the forensic audit so a Marathi factual crop-lookup question on a harvested (post-backfill) land returns a correct answer instead of a generic diagnostic clarification with a literal `{symptom}` token.

## Root-cause recap
1. Marathi/Hindi crop-lookup variants like "या शेतात कोणते **पिक** होते?" don't match the static-data-gate regex (regex uses **पीक** with `ी`; user typed **पिक** with `ि`; past-tense "होते" not considered).
2. `static-data-gate.ts` CROP_NAME branch reads only `crop_schedule.crop_name` / `current_crop` — both null after harvest backfill — and returns the generic "not recorded" message instead of falling back to the last harvested schedule.
3. `canonical-context-contract.ts:166` throws `INVARIANT VIOLATION` for the legitimate state "land present, no active crop", forcing the orchestrator into a broken diagnostic path.
4. `response-generator.ts` clarification templates emit raw `{{symptom}}` when no symptom object is present.

## Fix 1 — Expand crop-lookup regex coverage  (`agents/static-data-gate.ts`)
Add patterns covering:
- script variants `पिक` / `पीक` / `पिकं` / `पिका`
- past-tense lookups `होते`, `होती`, `लावले`, `पेरले`, `कोणतं\s*पीक\s*होतं`
- Hindi past-tense `कौन\s*सी?\s*फसल\s*थी`, `क्या\s*उगाया`
- generic "tell me crop", "this field crop" English
Run patterns case-insensitive; keep existing entries.

## Fix 2 — Harvested-land fallback in CROP_NAME branch  (`agents/static-data-gate.ts`)
When `crop_schedule.crop_name` and `current_crop` are both null:
1. Look at `land_context.last_harvested_schedule` (new optional field).
2. If found, respond with localized "this field had **{crop}**, harvested on **{actual_harvest_date}**. The land is currently available for sowing."
3. If still nothing, keep existing "not recorded" reply.

Add the loader plumbing: in `decision/authoritative-state-loader.ts`, when no active schedule exists, fetch the most recent `crop_schedules` row (any status, ordered by `actual_harvest_date desc nulls last, sowing_date desc`) and expose it as `land_context.last_harvested_schedule = { crop_name, crop_variety, sowing_date, actual_harvest_date }`. Don't mutate `current_crop`.

## Fix 3 — Allow `NO_ACTIVE_CROP` canonical context  (`decision/canonical-context-contract.ts`)
Replace the throw at line 170 with a non-fatal branch:
- If `landContext` exists but `cropCode` / `growthStage` are missing, return a `CanonicalContext` with `phase1_locked: true`, `status: 'NO_ACTIVE_CROP'`, `crop_code: null`, `growth_stage: null`, and a `last_harvest` summary copied from `landContext.last_harvested_schedule`.
- Add `status: 'ACTIVE' | 'NO_ACTIVE_CROP'` to the `CanonicalContext` type.
- Keep the strict throw only for the truly invalid case: `hasLandContext=true && landContext==null` (line 150 unchanged).

Downstream guard: in `agents/orchestrator.ts`, when `canonicalContext.status === 'NO_ACTIVE_CROP'`, short-circuit before the diagnostic pipeline and route to the static-data-gate's last-harvest responder (or a new `respondNoActiveCrop()` helper) so diagnosis is never attempted on an empty field.

## Fix 4 — Guard the `{{symptom}}` placeholder  (`decision/response-generator.ts`)
- Add a `renderTemplate(template, vars)` helper that:
  - replaces every `{{key}}` with `vars[key]` if defined and non-empty,
  - otherwise drops the entire bullet line containing the unresolved token (so we never ship `{symptom}` to the farmer).
- Switch the three clarification templates (lines 62, 83, 116) to go through this helper.
- If after substitution the response body is empty, fall back to `EMPTY_CONTEXT_CLARIFY` (one new template per language: "Please share what you're seeing on the crop so I can help.").

## Regression coverage
Add unit tests:
- `tests/chat/static-data-gate.test.ts`
  - "या शेतात कोणते पिक होते?" on land with no active crop but with `last_harvested_schedule` → returns last-harvest message.
  - Same query, no last harvest → returns "not recorded".
  - Same query for active crop → unchanged behavior.
- `tests/chat/canonical-context-contract.test.ts`
  - landContext present, no crop/stage → returns `NO_ACTIVE_CROP` context (no throw).
  - hasLandContext=true, landContext=null → still throws.
- `tests/chat/response-generator.test.ts`
  - template render with missing `symptom` → bullet removed, no literal `{{symptom}}` in output.

## Out of scope
- Wider intent-classifier rewrite, variety-context integration, and any UI changes — only the four audit defects are addressed.

## Technical references
- `supabase/functions/ai-agriculture-chat/agents/static-data-gate.ts` (regex + CROP_NAME branch)
- `supabase/functions/ai-agriculture-chat/decision/authoritative-state-loader.ts` (last-schedule loader)
- `supabase/functions/ai-agriculture-chat/decision/canonical-context-contract.ts` (lines 141–171, type def)
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (line ~612, NO_ACTIVE_CROP short-circuit)
- `supabase/functions/ai-agriculture-chat/decision/response-generator.ts` (lines 62, 83, 116)
