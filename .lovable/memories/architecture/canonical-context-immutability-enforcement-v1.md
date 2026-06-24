# Memory: architecture/canonical-context-immutability-enforcement-v1

The AI Chat enforces strict canonical context immutability through a 6-phase implementation:

## Phase 1-2 Complete (v2.0.0)
- `canonical-context-contract.ts`: Defines the immutable `CanonicalContext` interface with `readonly` properties and `phase1_locked: true`
- `assertCanonicalContextLocked()`: Fail-fast guard that throws immediately if context is null or not locked
- `clarification-generator.ts`: Updated to receive `canonicalContext: CanonicalContext | null` directly, removing all `buildCanonicalContext()` calls
- `clarification-scope-resolver.ts`: Updated to use `canonicalContext` parameter directly, removing `buildCanonicalContext` import

## Phase 3 Complete (v3.0.0)
- `orchestrator.ts`: Builds `canonicalContext` EXACTLY ONCE in Phase-1 using `buildCanonicalContextContract()`
- All downstream functions receive this single immutable context by reference
- Replaced `hasLandContext` boolean flags with `canonicalContext !== null` checks
- Removed `preservedContext` rebuilding - using `canonicalContext` directly for metadata
- Logs now show `Scope=PHASE1_LOCKED`, `CanonicalContext=LOCKED` for audit trail

## Hard Invariants
1. `canonicalContext` is created EXACTLY ONCE at the start of the turn
2. No function may reconstruct, partially rebuild, or infer land/crop context
3. `IDENTIFY_LOCATION` scope is ILLEGAL when `canonicalContext` exists
4. `validateContextIntegrity()` throws immediately if context inconsistency is detected

## Key Changes
- Replaced: `hasLandContext: boolean` + `landContext?: any` → `canonicalContext: CanonicalContext | null`
- All context checks now use `canonicalContext !== null` instead of boolean flags
- Production logs explicitly show `CanonicalContext=LOCKED` status
