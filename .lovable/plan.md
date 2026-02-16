

# Remaining Safety and Quality Fixes for Production Readiness

## Audit Results: What's Already Fixed vs What Remains

Previous rounds successfully fixed 8 of 12 issues. This plan addresses the **5 remaining issues** confirmed by line-by-line code audit.

### Already Fixed (No Action Needed)
- Hardcoded biocontrol dosages (Trichogramma/Cotesia) -- REMOVED (line 1145 comment confirms)
- PHI validation -- IMPLEMENTED (lines 650-660)
- Efficacy conflict / hardcoded 75% -- FIXED (lines 690-704, line 1077)
- Percentage regex -- ENHANCED (line 697 with Devanagari support)
- Land context overexposure -- CONDITIONAL injection implemented (lines 884-917)
- Rule ID leakage -- REMOVED from prompt (lines 992, 1124)
- ASCII language detection -- REPLACED with Devanagari Unicode check (lines 484-506)
- Knowledge text cap -- IMPLEMENTED (lines 1042-1043, 600 char cap)

---

## Remaining Issues to Fix (5 items)

### FIX A: Product Validation Still Uses Substring Matching (CRITICAL)

**File:** `llm-response-formatter.ts`, lines 593-595

**Current code:**
```typescript
const productWords = primaryProductName.toLowerCase().split(/[\s+@\/]+/).filter((w: string) => w.length > 2);
const productFound = productWords.some((word: string) => lowerOutput.includes(word));
```

**Problem:** Word "Chlor" from "Chlorpyrifos 20 EC" would match "Chloride solution". Substring matching allows partial token spoofing.

**Fix:** Replace with set-based entity validation:
1. Build a `Set` of full product names (lowercased, trimmed) from the symbolic decision
2. Extract product mentions from LLM output using a product-boundary-aware check
3. Validate that the FULL product name (or a significant multi-word portion, minimum 2 words) appears in the output, not just single-word substring matches
4. Keep the existing check as a fallback warning (downgrade from error to warn) for cases where product names are transliterated

### FIX B: Dosage Unit Validation Missing (CRITICAL)

**File:** `llm-response-formatter.ts`, lines 608-621

**Current code:**
```typescript
const dosageNumbers = dosagePerAcre.match(/\d+\.?\d*/g);
const numbersFound = dosageNumbers.some((n: string) => llmOutput.includes(n));
```

**Problem:** Only checks numeric values. LLM could change "250 ml/acre" to "250 L/acre" (1000x dosage increase) and validation would pass because "250" is present.

**Fix:** After the existing number check, add unit consistency validation:
1. Extract unit from the symbolic dosage (ml, L, g, kg, etc.)
2. Find the dosage number in the LLM output
3. Check that the unit immediately following the number matches the expected unit
4. Flag as error if unit mismatch detected (e.g., ml vs L, g vs kg)

```typescript
// After existing number check, add:
const UNIT_GROUPS = { volume: ['ml', 'l', 'litre', 'liter'], weight: ['g', 'gm', 'kg', 'gram'] };
const sourceUnit = dosagePerAcre.match(/(ml|l|litre|liter|g|gm|kg|gram)/i)?.[0]?.toLowerCase();
if (sourceUnit && dosageNumbers) {
  for (const num of dosageNumbers) {
    const unitAfterNum = new RegExp(`${num}\\s*(ml|l|litre|liter|g|gm|kg|gram)`, 'gi');
    const outputMatch = unitAfterNum.exec(llmOutput);
    if (outputMatch) {
      const outputUnit = outputMatch[1].toLowerCase();
      // Check same category but different magnitude
      if ((sourceUnit === 'ml' && outputUnit === 'l') || (sourceUnit === 'g' && outputUnit === 'kg') ||
          (sourceUnit === 'l' && outputUnit === 'ml') || (sourceUnit === 'kg' && outputUnit === 'g')) {
        errors.push(`Dosage UNIT mismatch: source=${sourceUnit}, output=${outputUnit} for number ${num}`);
      }
    }
  }
}
```

### FIX C: Hardcoded Water Volume Fallback Still Present (MODERATE)

**File:** `llm-response-formatter.ts`, line 1085

**Current code:**
```typescript
const waterPerAcre = appDetails.water_volume || appDetails.water_volume_per_acre || '200 L/acre';
```

**Problem:** While the display line (1074) was fixed to use "As per label", this calculation block at line 1085 still uses the hardcoded `'200 L/acre'` fallback for the total dosage calculation section.

**Fix:** Change to `'As per label'` to match the rest of the file:
```typescript
const waterPerAcre = appDetails.water_volume || appDetails.water_volume_per_acre || 'As per label';
```

### FIX D: Hardcoded Weather Restrictions Fallback (MODERATE)

**File:** `llm-response-formatter.ts`, line 1079

**Current code:**
```typescript
parts.push(`- Weather Restrictions: ${appDetails.weather_restrictions || 'No rain within 4-6 hours after spray'}`);
```

**Problem:** Hardcoded agronomic constant. Different chemicals have different rain-free requirements (2-6 hours depending on formulation). This should come from the rule engine only.

**Fix:** Change fallback to generic:
```typescript
parts.push(`- Weather Restrictions: ${appDetails.weather_restrictions || 'Follow label instructions'}`);
```

### FIX E: Generic Action Type Bypass Allows Product Injection (LOW-MEDIUM)

**File:** `llm-response-formatter.ts`, lines 568-603

**Current code:** When `primaryProductName` matches any string in `GENERIC_ACTION_TYPES` via `.includes()`, product validation is entirely skipped.

**Problem:** If a rule accidentally sets `product_name = "Cultural practice with Chlorpyrifos"`, it matches the generic check and skips all product validation. The LLM could then inject any product within that "generic" context.

**Fix:** After the generic action type skip, add a secondary safety check that scans the LLM output for any `commonPesticides` even when the action type is generic. This ensures that even if product validation is skipped for the primary check, unauthorized chemical names are still caught:

```typescript
if (isGenericActionType) {
  console.log(`   [VALIDATION] Skipping primary product check for generic action type: ${primaryProductName}`);
  // SAFETY: Still check for unauthorized chemicals in generic context
  for (const pesticide of commonPesticides) {
    if (lowerOutput.includes(pesticide) && !allowedProducts.includes(pesticide)) {
      errors.push(`Chemical product "${pesticide}" found in generic action context`);
    }
  }
}
```

---

## Technical Summary

| Fix | Location (line) | Risk | Impact |
|---|---|---|---|
| A. Entity-based product validation | 593-595 | Low | Prevents partial token spoofing |
| B. Dosage unit consistency check | 608-621 | Low | Catches ml-to-L magnitude errors |
| C. Remove hardcoded 200 L/acre | 1085 | None | Consistency fix |
| D. Remove hardcoded weather restriction | 1079 | None | Agronomic constant removal |
| E. Generic action type safety check | 568-603 | Low | Closes validation escape hatch |

**File modified:** `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` (single file)

**No database changes required.**

After these fixes, the formatter will have:
- Zero hardcoded agronomic constants
- Full product entity validation (primary + secondary)
- Dosage number AND unit validation
- PHI preservation check
- No rule ID exposure
- Conditional land context
- Enhanced percentage detection with rule-engine whitelist
- Generic action safety net

