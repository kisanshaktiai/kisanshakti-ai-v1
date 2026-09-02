# Make crop-schedule tasks readable for farmers

## What is wrong today (verified in code)

The harness → baseline generator → narration pipeline is agronomically correct, but the text a farmer reads is raw database text:

- `generator/narrate.ts` returns early when the app language is `en` (`language === "en"` → `no_translation_needed`). English users therefore see untouched DB strings.
- `generator/baseline-generator.ts` pushes machine-style lines straight into `instructions`: `Critical soil moisture: 100%`, `Source: ICAR-IIRR; TNAU`, `ETL: ...`, `Dose/acre: ...`, `PHI: 7 days`, `Irrigate about every 5 days from DAS 30 to 45`, and rule `action_text` paragraphs copied verbatim into `task_description` (this is where `[EVIDENCE:MPKV-RDF]`, `RDF 100:50:50`, `N35/P0/K30` reach the card, exactly as in the screenshot).
- `narrate.ts`'s provenance filter only drops lines that *start* with `source:`/`evidence:`, so numbered and inline provenance survives.
- Narration is all-or-nothing: any chunk failure discards every rewrite and the whole schedule falls back to raw English.

## What will change

1. **Deterministic sanitizer (new `generator/farmer-text.ts`)**
   - Strip bracketed audit tags (`[EVIDENCE:…]`, `[SOURCE:…]`, rule ids, `MPKV-RDF`-style codes) from `task_name`, `task_description` and `instructions`.
   - Move `Source:`, `ETL:`, `PHI:`, `Dose/acre:`, `Critical soil moisture:` out of farmer instructions into a separate `technical_details` array kept on the task (still persisted, shown in the card's collapsible "details" area — nothing is lost, it just stops being the headline text).
   - Expand shorthand deterministically before the model sees it: `DAS 30` → "30 days after sowing", `N/P/K` → Nitrogen/Phosphorus/Potassium, `RDF` → "recommended fertilizer dose", `PHI` → "days to wait before harvest".

2. **Narration becomes simplify-and-translate, for every language**
   - Remove the `language === "en"` early return; English runs a simplification pass instead of a translation pass.
   - Rewrite the prompt: role becomes "village agriculture officer explaining one task to a smallholder", with explicit rules — one idea per sentence, no scientific/latin names unless the local name is supplied, no codes, no ratios like `100:50:50` without an explanation in words, target reading level of a 5th-grade farmer, `name` 2-5 words, `desc` 2-3 short sentences, each instruction a single action step.
   - Keep the existing fact guard (`isFaithful` number preservation) unchanged — doses, dates and quantities still cannot change.
   - Model stays GPT-5.6 Luna via `getScheduleProviderChain()` (Gemini fallback unchanged).

3. **No more all-or-nothing fallback**
   - Retry a failed chunk once, then accept per-task rewrites that passed and mark only the un-narrated tasks in `coverage`/`gaps`. Any task that never got rewritten still shows sanitized (tag-free, expanded) text rather than raw DB text, so the card is never mixed-technical.

4. **UI-side wording for the fixed labels**
   - Section labels and units rendered by `src/lib/scheduleTaskPresentation.ts` / task cards come from `ui_translations` in the farmer's selected language (existing DB-SSOT i18n path), so "Critical", "Weather", "How to do it", `mm`, `kg/acre` are localized instead of English.
   - Add the missing schedule keys for `en`, `hi`, `mr` where the audit finds gaps.

## Technical notes

- Files touched: `supabase/functions/ai-smart-schedule/generator/narrate.ts`, `generator/baseline-generator.ts`, new `generator/farmer-text.ts`, `ai-smart-schedule/index.ts` (narration coverage/gaps + persisting `technical_details`), `src/lib/scheduleTaskPresentation.ts`, task card components, and the three locale files.
- No database schema change; `technical_details` rides in the existing task metadata JSON.
- Agronomic authority is unchanged: the harness and DB still decide *what* the task is; the model only rewords supplied facts.
- Change-log blocks at the top of every touched `ai-smart-schedule` file get a new entry, per project convention.
- After the change: regenerate one Marathi and one English schedule and read the produced tasks to confirm no `[EVIDENCE:`, no bare `DAS`, no `RDF`, and no English leakage in Marathi output.
