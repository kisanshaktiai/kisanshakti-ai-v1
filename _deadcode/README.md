# _deadcode/

Quarantine for PR-1 (KisanShakti Symbolic Decision Brain audit, 2026-07-06).

Every file below has **zero external importers** verified via ripgrep at
move time. Path structure mirrors the original project layout so restoration
is a straight `mv` back.

## Moved files (20)

### `supabase/functions/ai-agriculture-chat/decision/` (10)
- canonical-state-invariants.ts
- concept-bridge.ts
- confidence-thresholds.ts
- db-observation-validator.ts
- decision-readiness-gate.ts
- diagnostic-signal-detector.ts
- hypothesis-graph-evaluator.ts   ← superseded by `hypothesis-evaluator.ts`
- induction-to-observation-mapper.ts
- intent-resolver.ts
- iom-gate.ts

### `supabase/functions/ai-agriculture-chat/graph/` (8, whole directory)
Dead facade. Loaders + GraphRuntime never wired into orchestrator.
- ClarificationGraphLoader.ts
- GraphRuntime.ts
- HypothesisGraphLoader.ts
- ObservationOntologyLoader.ts
- RuleGraphLoader.ts
- index.ts
- loader-cache.ts
- loader-types.ts

### `supabase/functions/ai-agriculture-chat/runtime/` (2)
- clarification-authority.ts     ← marked stale; single-decision-point never adopted
- graph-evidence-sentinel.ts

## Restore

```sh
mv _deadcode/supabase/functions/ai-agriculture-chat/decision/*  supabase/functions/ai-agriculture-chat/decision/
mv _deadcode/supabase/functions/ai-agriculture-chat/runtime/*   supabase/functions/ai-agriculture-chat/runtime/
mkdir -p supabase/functions/ai-agriculture-chat/graph
mv _deadcode/supabase/functions/ai-agriculture-chat/graph/*     supabase/functions/ai-agriculture-chat/graph/
```

## Excluded from build

`_deadcode/` sits outside `supabase/functions/` and outside `src/`, so
Deno edge-function bundling and Vite compilation ignore it. Do not import
from here.
