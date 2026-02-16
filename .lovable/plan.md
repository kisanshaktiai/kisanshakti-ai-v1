
# LLM Response Formatter: 12 Safety and Quality Fixes

## Verified Findings Against Actual Code

Each finding was validated line-by-line against `llm-response-formatter.ts` (1637 lines).

---

## CRITICAL FIXES (4)

### Fix 1: Secondary Product/Dosage Validation (Lines 349-376, 538-722)

**Problem confirmed:** `validateLLMOutput()` only validates `primary_decision.product_details.product_name` (line 553) and `primary_decision.application_details.dosage` (line 597). Secondary products injected at lines 1038-1051 (`secondary_actions`/`secondary_recommendations` with `product_name`, `dosage`, `dosage_per_acre`) are NEVER validated.

**Fix:** After the primary product/dosage checks (around line 614), add a new CHECK section that iterates `decisionInput.decision_output.secondary_actions` and:
- Extracts each `sec.product_name` and adds to `allowedProducts`
- Extracts each `sec.dosage`/`sec.dosage_per_acre` and adds to `allowedDosages`
- Validates that no secondary product names appear modified in the LLM output

### Fix 2: Remove Hardcoded Biocontrol Dosages (Lines 1054-1074)

**Problem confirmed:** Lines 1066-1073 hardcode:
- `Trichogramma chilonis: 50,000 parasitoids/acre`
- `Cotesia flavipes: 5,000 cocoons/acre`

These bypass the rule engine. The `application_details.dosage_per_acre` from the symbolic decision already contains the correct dosage from the database.

**Fix:** Remove lines 1065-1074 entirely (the biocontrol dosage reminder block). The primary decision's `dosage_per_acre` field already carries the correct biocontrol dosage from the rule engine. The existing product/dosage rendering at lines 984-1007 already handles this.

### Fix 3: PHI Value Validation (Lines 992, 538-722)

**Problem confirmed:** Line 992 outputs `PHI Days: ${appDetails.phi_days}` to the LLM prompt, but `validateLLMOutput()` never checks that the LLM preserved this PHI value. The LLM could change "14 days" to "7 days" undetected.

**Fix:** Add a new CHECK after the dosage validation (after line 614) that:
- Extracts `appDetails.phi_days` number from the symbolic decision
- If it exists and is a number, checks that the same number appears in the LLM output
- Flags as violation if PHI number is missing or modified

### Fix 4: Percentage Validation Regex Enhancement (Line 644)

**Problem confirmed:** Current regex is:
```
/(\d{1,3})\s*%\s*(effective|control|reduction|success)/gi
```
This misses: `percent`, `efficacy`, `protection`, `yield increase`, and patterns like `85 percent control`.

**Fix:** Replace line 644 with an expanded regex:
```
/(\d{1,3})\s*(%|percent|प्रतिशत|टक्के)\s*(effective|efficacy|control|reduction|success|protection|yield increase|प्रभावी|नियंत्रण)/gi
```

**Additionally (Finding 11 -- efficacy conflict):** The current validator blocks ALL percentage patterns, but line 993 injects `efficacy_percent` from the rule engine. Fix: before running the percentage check, extract allowed efficacy values from `appDetails.efficacy_percent` and `primary.expected_outcomes.efficacy_percent`, then exclude those specific numbers from the regex violation check.

---

## MODERATE FIXES (5)

### Fix 5: Cap knowledge_text Length (Lines 960-962)

**Problem confirmed:** Line 961 outputs full `knowledge_text` with no length limit. Some ICAR scientific references are 500+ words.

**Fix:** At line 961, cap: `knowledgeText.substring(0, 600)` before injecting into prompt. Apply same cap at line 1099-1100 for matched response knowledge_text.

### Fix 6: Conditional Land Context Injection (Lines 827-836)

**Problem confirmed:** Lines 827-836 unconditionally inject Village, District, exact soil N/P/K, and NDVI into every prompt regardless of rule type.

**Fix:** Make land context conditional in `buildFormattingUserPrompt()`:
- Village/District: only include if `primary_decision.action_type` involves weather-dependent rules
- Soil N/P/K: only include if primary rule's `canonical_group` is nutrition-related or action_text mentions nutrient/fertilizer
- NDVI: only include if primary rule involves stress assessment
- Always include: Crop, Growth Stage, Area, Days Since Sowing (these are always relevant)

### Fix 7: Remove Rule ID from LLM Prompt (Line 911, 1034)

**Problem confirmed:** Line 911 sends `Rule ID: ${primary.rule_id}` and line 1034 sends `Scientific Basis: ICAR Rule ${primary.rule_id}`. While the output validator blocks `RULE_*` patterns, sending rule_id to LLM increases leakage risk.

**Fix:** Remove line 911 (`Rule ID` line) and change line 1034 to just `Scientific Basis: ICAR Validated` (no rule_id).

### Fix 8: Remove Hardcoded Water Volume and Timing Defaults (Lines 990-991)

**Problem confirmed:**
- Line 991: `Water Volume: ${appDetails.water_volume || '200 L/acre'}` -- hardcoded fallback
- Line 990: `Timing: ${appDetails.timing || 'Early morning 6-10 AM'}` -- hardcoded fallback

These should come from the rule engine only.

**Fix:** Change defaults to `'As per label'` instead of specific hardcoded values:
- Water Volume fallback: `'As per label'`
- Timing fallback: `'As per label'`

### Fix 9: Improve ASCII Language Detection (Lines 484-494)

**Problem confirmed:** Line 488 uses `asciiRatio > 0.4` which counts English numbers as ASCII, causing false positives for Marathi/Hindi text with numeric dosages.

**Fix:** Replace ASCII ratio check with Devanagari Unicode range detection:
```typescript
const devanagariChars = (formattedResponse.match(/[\u0900-\u097F]/g) || []).length;
const devanagariRatio = totalChars > 0 ? devanagariChars / totalChars : 0;
if (devanagariRatio < 0.3) { // Less than 30% Devanagari = likely translation failure
```

---

## MINOR FIXES (3)

### Fix 10: IPM Urgency Unknown Level Guard (Lines 139-145, 1030)

**Problem confirmed:** `IPM_URGENCY_LABELS` only defines LEVEL_1 through LEVEL_5. Line 1030 falls back to `'Normal priority'` for unknown levels, but does not log a warning.

**Fix:** At line 1030, add a console.warn when the IPM level is not found in the map:
```typescript
if (!IPM_URGENCY_LABELS[primary.ipm_level]) {
  console.warn(`[IPM_GOVERNANCE] Unknown IPM level: ${primary.ipm_level}`);
}
```

### Fix 11: Cross-Crop Biocontrol Validation Enhancement (Lines 668-676)

**Problem confirmed:** Only wheat is validated (line 669). Missing: Rice (no Cotesia flavipes), Cotton (no sugarcane-specific biocontrol), Maize (no cotton bollworm-specific agents).

**Fix:** Extend the crop-specific biocontrol validation block to include Rice, Cotton, and Maize with their respective invalid biocontrols.

### Fix 12: Efficacy Percentage Conflict Resolution (Line 993)

**Problem confirmed:** Line 993 injects `efficacy_percent` from rule engine (or defaults to 75%), but the percentage validator at line 644 blocks all percentage claims. This creates a conflict where rule-engine-provided efficacy could trigger a false validation failure.

**Fix:** In the percentage validation check, extract the rule-engine-provided efficacy number and exclude it from violation matching. Additionally, remove the hardcoded `|| 75` default at line 993 -- if no efficacy is provided by the rule engine, don't fabricate one.

---

## Technical Summary

**File modified:** `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts`

**No database changes required.** All fixes are in the formatter logic.

| Fix | Lines Affected | Risk |
|---|---|---|
| 1. Secondary validation | 349-376, ~614 | Low -- additive check |
| 2. Remove hardcoded biocontrol | 1054-1074 | Low -- rule engine already provides dosage |
| 3. PHI validation | ~614 | Low -- additive check |
| 4. Percentage regex | 644 | Low -- broadens existing check |
| 5. knowledge_text cap | 961, 1099 | Low -- substring only |
| 6. Conditional land context | 827-836 | Medium -- logic change |
| 7. Remove rule_id from prompt | 911, 1034 | Low -- string change |
| 8. Remove hardcoded defaults | 990-991 | Low -- default value change |
| 9. Devanagari detection | 484-494 | Low -- improved accuracy |
| 10. IPM level guard | 1030 | None -- logging only |
| 11. Cross-crop validation | 668-676 | Low -- additive checks |
| 12. Efficacy conflict | 644, 993 | Medium -- logic interaction |
