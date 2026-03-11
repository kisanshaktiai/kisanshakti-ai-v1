
# Critical Bug Fix: `this.generateFarmerCommunication is not a function`

## Root Cause

The edge function logs show a fatal crash at orchestrator.ts line 6140:

```
TypeError: this.generateFarmerCommunication is not a function
```

**The method `generateFarmerCommunication` does not exist on the `AIAgentOrchestrator` class.** It was likely added during the "deterministic return invariant" implementation but never defined. The existing working pattern (line 6624) uses `this.communicationGenerator.generate(...)` instead.

This crash occurs on the **PRIMARY_DECISION immediate return path** — the most common success path. Every time the symbolic brain fires a valid rule with a `rule_id` and `action_type`, the orchestrator crashes before generating the farmer response. This is why:

- Rules fire (41 matched, SC_IRRIGATION_DRIP_001 selected)
- Decision is generated successfully
- But `Response: undefined` and `Actions: 0 returned`
- The farmer sees incomplete/empty advice

## Fix

**File**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

**Change**: Replace the phantom `this.generateFarmerCommunication(...)` call at line 6140 with a proper call to the existing `this.communicationGenerator.generate(...)`, using the same pattern from line 6624:

1. Get farmer profile via `this.getFarmerProfile(farmerId, language)`
2. Call `this.communicationGenerator.generate(decisionOutput, farmerProfile, conversationContext)`
3. Pass the result as `immediateResponse`

This is a ~10-line fix that restores the entire farmer communication pipeline for the primary decision path.

## Impact

This single bug blocks **all** farmer responses on the primary decision path. Fixing it will restore:
- Observation display in responses
- Product/dosage/treatment data
- Organic alternatives
- Land-context-aware dosage calculations
- The full 8-section advisory format
