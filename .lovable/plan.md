# Clarification UI: stop the repeat loop, add photo option, kill raw-code labels

## What I verified (evidence, not assumption)

1. **Repeat loop is real and has a concrete cause.** `decision/hypothesis-clarification-builder.ts` already excludes `pending_obs_keys` (line ~342) — but none of the three orchestrator call sites (`agents/orchestrator.ts` lines ~2828, ~2897, ~6709) pass `pending_obs_keys` or `perceived_observations`. Only `runtime/clarification-contract.ts` does. The uploaded log confirms it: session persists `persisted_pending_obs_keys: [8 keys]`, yet the next turn logs `[HYP_CLARIFICATION][FILTER] removed_pending=0` and re-emits the same 8 keys (`bph_hopper_burn, poor_establishment, transplant_shock, …`). Session state carries the keys (`index.ts:1130` → `pendingClarificationObservationKeys`); the builder never receives them.

2. **Photo option does not exist in the backend.** No `PHOTO_UPLOAD` / photo option is appended anywhere in `supabase/functions/ai-agriculture-chat`. The frontend already fully supports it: `ClarificationOptionsUI.tsx` detects `observation_key === 'photo_upload'` / label containing photo and calls `onTakePhoto()` (camera opens, no message sent), and `EnhancedAIChatInterface.tsx:2454` wires `onTakePhoto`. So the capability is there — the backend simply never emits the option.

3. **Labels can legitimately fall back to raw codes at two sites.**
   - Builder: `label = translations.get(code) || master.description || master.observation_code` — last fallback renders the bare code.
   - Rescue path `runtime/observation-selector-contract.ts:226`: `(label_mr / label_hi / label_en) || key` — same leak.
   
   Note: for the 8 codes in this log, `observation_translations` **does** have `mr` rows (verified by query), so those specific options should have rendered Marathi. Which of the two fallbacks fired in the observed turn is **not yet confirmed** — step 3 below starts by instrumenting/confirming it rather than blind-patching.

4. **The observed turn emitted `options=0` to the client** (`[TURN_END] … options=0` while `persisted_pending_options: 8`), i.e. the outgoing payload lost the options even though the session stored them. This is a separate contract break worth fixing in the same pass.

## Plan

### 1. Close the repeat loop (backend, `agents/orchestrator.ts`)
Pass the already-available session state into all three `buildHypothesisClarificationOptions` call sites:
- `pending_obs_keys: options.sessionState?.pendingClarificationObservationKeys ?? []`
- `perceived_observations` / `confirmed_observations` from the current-turn grounded codes (site 6709 currently passes neither).
- Also pass `session_ssot` where available so crop/stage/DAS come from the Layer-3 lock, not from ad-hoc args.

Add an invariant log `[CLARIFICATION_REPEAT_VIOLATION]` when the emitted option key set is a subset of the previous turn's pending set — so a regression is visible in logs instead of silently looping.

### 2. Append the photo option (DB-sourced, backend)
Add a single shared helper that appends a terminal photo option to every clarification option list, in the builder (so all paths inherit it):
- `observation_key: 'photo_upload'`, `value: 'photo_upload'`, `source: 'system_config'`.
- Label text read from `system_config` keys `clarification_photo_option_<lang>` with `_en` fallback — **no hardcoded agronomy or Marathi string in TypeScript**, consistent with the existing `clarification_intro_<lang>` pattern.
- Seed `system_config` rows for `en / hi / mr` (and any other languages already seeded for `clarification_intro_*`).
- Exclude `photo_upload` from graph/hypothesis scoring, from `pending_obs_keys` persistence, and from the diversity/coverage invariants so it never counts as diagnostic evidence.

Frontend needs no change — the camera handler already matches on `photo_upload`.

### 3. Guarantee farmer-readable labels (never a raw code)
- Builder: replace the `|| master.observation_code` terminal fallback with a strict resolution order — `observation_translations[lang] → observation_translations[en] → observation_master.description` — and if all are empty, **drop the option** and log `[OBS_LABEL_MISSING] code=… lang=…` rather than showing a code to the farmer.
- Rescue path (`observation-selector-contract.ts:226`): same treatment — drop instead of `|| key`.
- Add a lightweight `[OBS_LABEL_SOURCE]` trace line (per option: `translation_mr | translation_en | description`) so the next log immediately shows which source produced each visible label, confirming or refuting root cause 3.
- Run one DB coverage query for the active differential codes to list any missing `mr`/`hi` translation rows, and report them for seeding (data seeding proposed separately, not silently invented).

### 4. Stop the outgoing `options=0` drop
Trace why the payload had 8 persisted pending options but `options=0` at `[TURN_END]`, between the orchestrator return and the `CLARIFICATION_QUESTION` formatter in `index.ts:4562`. Fix the losing hop and add an invariant: a `CLARIFICATION_QUESTION` whose session state persists pending options MUST carry a non-empty `metadata.options`, else log `[CLARIFICATION_OPTIONS_LOST]`.

## Technical notes
- Files touched: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`, `decision/hypothesis-clarification-builder.ts`, `runtime/observation-selector-contract.ts`, `runtime/clarification-contract.ts`, `index.ts`, plus one `system_config` seed migration.
- No new tables. No agronomy literals in TypeScript — all farmer-visible text stays sourced from `observation_translations`, `clarification_fallback_questions`, and `system_config`.
- CHANGE LOG blocks at the top of each edited chat-pipeline file will be updated per the project invariant.
- After deploy: run one end-to-end Rice/tillering/DAS-48 turn and confirm in the logs that `removed_pending=8`, the new option set differs from the previous turn, every option carries a translation source, and a `photo_upload` option is present as the last item.
