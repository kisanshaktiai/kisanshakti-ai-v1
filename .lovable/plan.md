

# Fix: Dead Dynamic Clarification Generator Causing Empty Responses

## Root Cause (Confirmed)

The `generateDynamicClarification()` function in `dynamic-clarification-generator.ts` (line 366-381) is a **deprecated stub** that returns empty data:

```text
question: ''        (empty string)
options: []         (empty array)
generated_by: 'SYMBOLIC_RULES'
```

In `clarification-generator.ts` line 211-277, when land context exists and scope is `REFINE_OBSERVATION`, the code calls this stub. It "succeeds" without throwing, so the catch block (line 278) is never hit, and the working template-based renderer (`renderClarificationAsync` at line 305) is never reached.

The result: the farmer sees "Understood." with no clarification question and no options -- a dead end.

## Data Flow

```text
Farmer: "kahi thikani us mela aahe"
   |
   v
Induction Gate: run_symbolic=true (PASS)
   |
   v
Understanding Check: clarification_required=true
   |
   v
clarification-generator.ts line 211:
  effectiveHasLandContext=true, scope=REFINE_OBSERVATION
   |
   v
generateDynamicClarification() [DEPRECATED STUB]
  -> returns { question: '', options: [] }
   |
   v
optionLabels = [] (empty)
validateClarificationOptions([]) -> valid (nothing to leak)
   |
   v
RETURNS: "Understood.\n\n" + options: []
   |
   NEVER REACHES: renderClarificationAsync() at line 305
```

## Fix (Single change in one file)

**File:** `supabase/functions/ai-agriculture-chat/agents/clarification-generator.ts`

**Change:** After calling `generateDynamicClarification()` at line 243, add a validation check: if the dynamic result returns zero options OR an empty question, throw an error to trigger the fallback to the template-based renderer.

The change is at line 244, right after:
```typescript
const dynamicResult = await generateDynamicClarification({...});
```

Add:
```typescript
// CRITICAL FIX: Detect deprecated stub returning empty data
if (!dynamicResult.question && dynamicResult.options.length === 0) {
  console.warn('   [DynamicClarification] Empty result detected (deprecated stub) - falling back to template renderer');
  throw new Error('Dynamic clarification returned empty result');
}
```

This makes the code fall through to the `catch` block at line 278, which then continues to `renderClarificationAsync()` at line 305 -- the working DB-driven template renderer that generates actual clarification questions with options based on the crop/stage context.

## What Does NOT Change

- No architectural changes
- No new files
- No schema changes
- No dependency changes
- The deprecated `generateDynamicClarification` function is left as-is (other code may reference it)
- The template-based renderer (`renderClarificationAsync`) is already working and battle-tested

## Expected Result After Fix

When "kahi thikani us mela aahe" is sent:
1. Dynamic clarification stub returns empty data
2. New guard detects empty result, throws error
3. Catch block triggers, falls through to `renderClarificationAsync()`
4. Template renderer generates crop/stage-aware clarification question with options
5. Farmer sees a meaningful question like "What part of the sugarcane is affected?" with selectable options

## Technical Detail

| Item | Detail |
|------|--------|
| File | `clarification-generator.ts` |
| Location | Line 244 (after `generateDynamicClarification` call) |
| Type | Guard clause (3 lines of code) |
| Risk | Zero -- only activates when result is empty |

