---
name: Farmer-Observable Chip Contract
description: Diagnostic clarification chips must show observable symptoms (translated from observation_translations) — never action/gate codes like *_check or humanized observation_codes.
type: feature
---

# Farmer-Observable Chip Contract (Wave P-2 hotfix)

## Hard rules
1. Clarification chips MUST present **observable symptoms** the farmer can answer yes/no to (e.g. "पाने कोमेजलेली दिसत आहेत"), NEVER action prompts ("पाण्याची कमतरता तपासा" / "check water stress").
2. Codes matching `/(^|_)(check|gate|authority|threshold|verify|verification)(_|$)|^etl_|^phi_|^safety_|_check$/i` are workflow/gate codes — they MUST be filtered out before chips are emitted (both in `hypothesis-evaluator.ts` synthetic chip generation and in `diagnostic-differential-enricher.ts` chip assembly).
3. Codes where `observation_master.is_farmer_observable = false` MUST be gated out by the enricher overlay. Null is treated as observable (permissive default).

## Label resolution chain (in order)
1. `observation_translations.display_text` where `language_code` matches request lang (fallback mr→hi→en for mr; hi→mr→en for hi; en→hi→mr for en). Lookup key is `lower(observation_code)`.
2. `observation_master.description` (English last-resort).
3. Humanized `observation_key.replace(/_/g,' ')` — only if both above missing.

The enricher MUST also overlay `observation_differential_questions.question_text` (crop-specific preferred over generic) into `chip.description` so the farmer sees a real confirmation prompt.

## Forbidden
- Setting `label_en = code.replace(/_/g,' ').toLowerCase()` in `hypothesis-evaluator.ts` for synthetic chips — leave `label_en` undefined so the enricher overlay fills it from `observation_translations`.
- Querying `observation_translations` with uppercase codes — the column stores lower_snake_case post-migration.
- Emitting any chip whose final label still contains underscores (means overlay failed → drop or humanize).

## Tables involved
- `observation_translations(observation_code, language_code, display_text, description_text, crop_code)` — farmer-friendly symptom text per language.
- `observation_differential_questions(observation_code, language, question_text, crop_code)` — full confirmation question text.
- `observation_master(observation_code, is_farmer_observable, description, ...)` — observability gate.

## Validation
Replay any DIAGNOSTIC_ESCALATION turn (e.g. rice nursery, DAS 15, Marathi). Every chip label MUST be Devanagari script and describe what the farmer SEES, not what they should DO.
