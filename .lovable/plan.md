# Fix: clarification card shows English options with empty observation keys

## Verified findings (checked against live code + live DB)

Code — `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`:

- Line 7416-7421 (observation-state branch) and 7434-7439 (rule-driven branch) both call
  `translateClarificationOptions(...)` and then immediately reduce the result to label strings
  (`finalClarificationOptions`). The translated **objects** are discarded.
- Line 7482, the final render assembly:
  `options: ruleDrivenClarification?.options || finalClarificationOptions.map((label) => ({ label }))`
  — `ruleDrivenClarification.options` is always truthy on this branch, so the render always ships the
  **untranslated** English labels. The translated Marathi result is computed and thrown away.
- The fallback arm wraps bare label strings as `{ label }`, i.e. no `observation_key` at all.

Code — `supabase/functions/ai-agriculture-chat/index.ts` line 2605:
`pending_clarification_observation_keys` is derived from `response.question.options[].observation_key`.
Because the render ships the raw/unkeyed options, those keys persist as `""` and turn-2 selection cannot
map back to an observation.

Database (confirmed by query, no assumption): `observation_translations` already holds the Marathi rows —
`n_deficiency_rice` (mr) = "खालची जुनी पाने फिकट पिवळी, फुटवे कमी", `k_deficiency_rice` (mr) =
"जुन्या पानांच्या कडा व टोके करपल्यासारखी तपकिरी…". The data is complete; only the render is wrong.

## The fix (one file, three small edits)

**File: `agents/orchestrator.ts` only.** No DB change, no new tables, no tenant filters on the global
knowledge tables, no hardcoded observation codes or labels.

1. Declare `let finalClarificationOptionObjects: Array<{ label: string; observation_key?: string; [k: string]: any }> = [];`
   beside `finalClarificationOptions` (line 7352).
2. In both translation branches, after mapping to label strings, also keep the full translated objects in
   `finalClarificationOptionObjects` (they carry the farmer-language label *and* the recovered
   `observation_key`). Set it to `[]` in the empty branch.
3. Change the render assembly (line 7482) to prefer the translated objects:
   translated objects → translated label strings wrapped as `{ label }` → raw options only as last resort.
   Also feed `pendingClarificationResponse.structuredOptions` from the same translated objects so the
   downstream persistence path in `index.ts` reads real `observation_key` values (no change needed in
   `index.ts` — it already reads them from the shipped options).

## Not touched

`translateClarificationOptions`, `generateScopedClarification`, the hypothesis evaluator, the
`orchestrate()` signature, and the response shape all stay exactly as they are.

## Verification

Fresh Marathi session with "पिक पिवळे पडले आहे काय करावे" on a rice land, then read edge logs:

- rendered options are Devanagari observation labels, not "Nitrogen deficiency observed mid-season";
- `persisted_pending_obs_keys` contains real codes (e.g. `["n_deficiency_rice","k_deficiency_rice"]`),
  not `["","",…]`;
- tapping an option advances to a diagnosis instead of re-asking.

Then redeploy `ai-agriculture-chat` and add the CHANGE LOG entry required for files under
`ai-agriculture-chat/**`.
