# _deadcode/

Quarantine for KisanShakti Symbolic Decision Brain audit.

Each file below has **zero live references** (static AND dynamic imports).
Path structure mirrors the original layout so restoration is a `mv` back.

## Status log

### PR-1 (2026-07-06)
Quarantined 20 files. Immediately hot-fixed: `iom-gate.ts`,
`concept-bridge.ts`, and `hypothesis-graph-evaluator.ts` were restored to
`decision/` when a follow-up audit found they are loaded via `await import(...)`
(dynamic import), which the initial static scan missed.

### PR-2 (2026-07-06)
`graph/GraphRuntime.ts` was promoted to `runtime/graph-runtime.ts` as the
single mandatory hypothesis-graph entrypoint. The remaining 7 dead loader
files in the `graph/` subfolder were deleted outright (they were never
wired in and are superseded by the loader-based SSOT plan).

## Currently quarantined (10)

### `supabase/functions/ai-agriculture-chat/decision/` (8)
- canonical-state-invariants.ts
- confidence-thresholds.ts
- db-observation-validator.ts
- decision-readiness-gate.ts   ← only referenced in comments
- diagnostic-signal-detector.ts
- induction-to-observation-mapper.ts
- intent-resolver.ts           ← only referenced in comments

### `supabase/functions/ai-agriculture-chat/runtime/` (2)
- clarification-authority.ts
- graph-evidence-sentinel.ts

## Restore

```sh
mv _deadcode/supabase/functions/ai-agriculture-chat/decision/*  supabase/functions/ai-agriculture-chat/decision/
mv _deadcode/supabase/functions/ai-agriculture-chat/runtime/*   supabase/functions/ai-agriculture-chat/runtime/
```

## Excluded from build

`_deadcode/` sits outside `supabase/functions/` and `src/`, so Deno edge
bundling and Vite compilation ignore it. Do not import from here.

## Invariants added

- **PR-2:** `evaluateCandidateHypotheses` may be called from EXACTLY ONE
  file: `supabase/functions/ai-agriculture-chat/runtime/graph-runtime.ts`.
  Any reintroduction of a direct import elsewhere is a P0 violation.

  Guard grep (must return exactly two lines — the definition and the single
  facade call):
  ```
  rg "evaluateCandidateHypotheses\s*\(" supabase/functions/ai-agriculture-chat
  ```
