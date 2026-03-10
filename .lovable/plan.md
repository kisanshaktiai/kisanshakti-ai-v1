

# Deep Forensic Audit: AI Chat Response System — 2030-Ready Upgrade

## 1. Current System Audit Summary

The system already has a strong neuro-symbolic architecture. The LLM formatter (`llm-response-formatter.ts`, 2370 lines) is already properly constrained as a render-only narrator with 7+ validation gates. The deterministic response builder integrates rich rule data. However, several issues remain.

## 2. i18n Compliance Issues Found

### Frontend Hardcoded English Strings (HIGH priority)

**8 chat card components bypass i18n entirely** — they use inline English label dictionaries or raw strings instead of `useTranslation()`:

| File | Issue |
|---|---|
| `WhatHowWhyCard.tsx` | Has inline `SECTION_LABELS` dict (en/hi/mr only), plus hardcoded `"Scientific Basis"` (line 452) |
| `CanonicalAdvisoryCard.tsx` | All section titles hardcoded: `"What & Why"`, `"Symptoms to Confirm"`, `"Treatment"`, `"Safety"`, `"Organic Alternative"`, `"Safety Warnings"`, `"Dosage/acre:"`, `"Method:"`, `"Confidence"` etc. |
| `DataAuditCards.tsx` | `"Data Context Audit"`, `"No data available"`, `"Missing: "`, all data labels hardcoded |
| `DecisionBrainCards.tsx` | No `useTranslation` — all UI labels are in English |
| `DiagnosticResponseCard.tsx` | Likely hardcoded (no useTranslation import found) |
| `FarmerMessageCard.tsx` | Uses inline Marathi/Hindi checks but no i18n system |
| `DiagnosisOnlyCard.tsx` | No useTranslation |
| `ColorCodedCard.tsx` / `EnhancedColorCodedCard.tsx` | No useTranslation |

**Only 8 of 31 chat components use `useTranslation()`** — the remaining 23 either have no user-facing text or use hardcoded strings.

### Backend Hardcoded Strings (MEDIUM priority)

| File | Issue |
|---|---|
| `llm-response-formatter.ts` line 163-169 | `IPM_URGENCY_LABELS` hardcoded for en/mr/hi only — breaks for ta/te/bn/gu/kn |
| `llm-response-formatter.ts` line 2132 | Legacy template: `"🌾 Hello farmer friend!"` hardcoded English |
| `llm-response-formatter.ts` line 1730-1733 | `names.mr` / `names.hi` — only 2 languages |

## 3. Translation Quality Issues

The LLM system prompt (lines 1327-1368) already instructs semantic rewriting in rural language. However:

- **Missing instruction**: No explicit "translate meaning, not words" directive
- **Missing farmer dialect guidance**: No instruction to use regional colloquial terms (e.g., Marathi `पिवळेपणा` vs formal `पीतकरण`)
- **Temperature too high**: 0.5 allows inconsistent translations; could use 0.3 for formatting-only tasks

## 4. Response Format — Already 2030-Aligned

The system already implements the 8-section structured format via:
- `FORMAT_1` through `FORMAT_5` in `buildFormattingSystemPrompt()` (lines 1184-1296)
- `WhatHowWhyCard.tsx` renders WHAT → HOW → WHY sections
- `CanonicalAdvisoryCard.tsx` renders the full 10-section advisory
- `FarmerMessageCard.tsx` renders greeting → diagnosis → action → safety → economics → followup

**The 2030 format structure is already implemented.** The gap is i18n of the card labels.

## 5. Plan: Targeted Fixes

### Fix 1: Add i18n keys for chat card components (HIGH)

Add a new `chat-cards.json` locale file with keys for all hardcoded UI labels in the 8 card components. Create for `en`, `hi`, `mr`.

Keys needed (~40):
- `cards.what`, `cards.how`, `cards.why`, `cards.nextSteps`, `cards.confidence`
- `cards.symptoms`, `cards.dosage`, `cards.timing`, `cards.safety`
- `cards.phiDays`, `cards.beeWarning`, `cards.ppeRequired`, `cards.organicOption`
- `cards.takePhoto`, `cards.followUp`, `cards.source`, `cards.method`
- `cards.ipmLevel1-4`, `cards.treatment`, `cards.monitoring`
- `cards.dataAudit`, `cards.noData`, `cards.missing`, `cards.quality`
- `cards.organicAlternative`, `cards.safetyWarnings`, `cards.whatAndWhy`
- `cards.dosagePerAcre`, `cards.total`, `cards.waterPerAcre`
- `cards.scientificBasis`, `cards.confirmSymptoms`

### Fix 2: Migrate 8 card components to useTranslation (HIGH)

Update these components to import `useTranslation` and replace hardcoded strings:
1. `WhatHowWhyCard.tsx` — Replace `SECTION_LABELS` dict with `t()` calls
2. `CanonicalAdvisoryCard.tsx` — All section titles
3. `DataAuditCards.tsx` — All labels
4. `DecisionBrainCards.tsx` — Status labels
5. `DiagnosticResponseCard.tsx` — Labels
6. `FarmerMessageCard.tsx` — Section headers
7. `DiagnosisOnlyCard.tsx` — Labels
8. `CanonicalAdvisoryCard.tsx` `ConfidenceBadge` — `"Treatment"`, `"Monitor"`, `"Clarify"`

### Fix 3: Enhance LLM system prompt for translation quality (MEDIUM)

Add to `buildFormattingSystemPrompt()`:
```
═══ TRANSLATION QUALITY RULES ═══
- TRANSLATE MEANING, not words. Rewrite like an experienced agricultural officer talking to a farmer.
- Use colloquial rural dialect, NOT literary/formal language.
- For Marathi: use बोलीभाषा (spoken language), not प्रमाणभाषा (standard written).
- Example: "Interveinal chlorosis observed" → "पानांच्या शिरांजवळ पिवळेपणा दिसतोय"
- Keep sentences under 15 words.
- Every instruction must be actionable — farmer must know exactly what to buy, how much, and when.
```

### Fix 4: Remove IPM_URGENCY_LABELS hardcoded dict (LOW)

Replace the 5-entry hardcoded `IPM_URGENCY_LABELS` dict with LLM translation (already handled by the prompt) or DB-driven labels.

### Fix 5: Token optimization (LOW)

Current prompt is already optimized with `filterRelevantResponses()` capping at 3 responses. Temperature 0.5 is reasonable. The `<250 token target` is unrealistic for structured multilingual responses — current 2800/4000 token limits are correct for Devanagari scripts.

## 6. Files to Change

| File | Change |
|---|---|
| `src/i18n/locales/en/chat-cards.json` | **NEW** — ~40 card UI label keys |
| `src/i18n/locales/hi/chat-cards.json` | **NEW** — Hindi translations |
| `src/i18n/locales/mr/chat-cards.json` | **NEW** — Marathi translations |
| `src/i18n/config.ts` | Add chat-cards import for en/hi/mr |
| `src/components/chat/WhatHowWhyCard.tsx` | Replace `SECTION_LABELS` with `useTranslation` |
| `src/components/chat/CanonicalAdvisoryCard.tsx` | Add `useTranslation`, replace hardcoded labels |
| `src/components/chat/DataAuditCards.tsx` | Add `useTranslation`, replace hardcoded labels |
| `src/components/chat/DecisionBrainCards.tsx` | Add `useTranslation` for status text |
| `src/components/chat/FarmerMessageCard.tsx` | Add `useTranslation` for section headers |
| `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` | Add translation quality rules to system prompt (lines ~1342), remove IPM dict |

## 7. What Will NOT Change (Pipeline Integrity)

- Symbolic decision brain graph
- Rule engine and authority hierarchy
- Land context loader and observation pipeline
- Decision readiness gate
- Deterministic response builder
- Output validation gate (7 checks)
- Crop name consistency validator

## 8. Implementation Order

1. Create locale files (`chat-cards.json` × 3 languages)
2. Register in `i18n/config.ts`
3. Migrate card components (8 files)
4. Enhance LLM prompt translation rules
5. Remove `IPM_URGENCY_LABELS` hardcoded dict

