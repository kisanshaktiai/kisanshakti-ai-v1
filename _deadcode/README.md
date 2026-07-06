# _deadcode/

Quarantine for KisanShakti Symbolic Decision Brain audit. Each file has
**zero live references** (static + dynamic + barrel-folder imports). Path
structure mirrors the original layout so restoration is a `mv` back.

## Status log

- **PR-1 (2026-07-06)** — 20 files quarantined based on static-import scan.
- **PR-1 hotfix (2026-07-06)** — dynamic-import audit restored 3 files that
  were live via `await import(...)`: `iom-gate.ts`, `concept-bridge.ts`,
  `hypothesis-graph-evaluator.ts`.
- **PR-2 (2026-07-06)** — `graph/GraphRuntime.ts` promoted to
  `runtime/graph-runtime.ts` as the single mandatory hypothesis-graph
  entrypoint. Remaining 7 `graph/` loader files deleted (never wired).
- **PR-1.5 (2026-07-06)** — full re-audit found 13 more truly-dead files
  missed by the initial static scan; quarantined here.

## Currently quarantined (22)

### `agents/` (7)
- dialect-normalizer.ts
- dynamic-clarification-generator.ts   ← superseded by `runtime/observation-selector-contract.ts`
- entity-normalizer.ts
- irrigation-decision-module.ts
- raw-observation-contract.ts
- response-validation-gate.ts
- spray-window-calculator.ts

### `bundled-rules/canonical/` (1)
- index.ts   ← parent barrel does not re-export it

### `contracts/` (1)
- farmer-response-contract.ts

### `decision/` (7)
- canonical-state-invariants.ts
- confidence-thresholds.ts
- db-observation-validator.ts
- decision-readiness-gate.ts        ← only comment mentions in live code
- diagnostic-signal-detector.ts
- induction-to-observation-mapper.ts
- intent-resolver.ts                ← only comment mentions in live code

### `i18n/` (1)
- language-types.ts

### `runtime/` (3)
- clarification-authority.ts
- differential-questions-reader.ts
- graph-evidence-sentinel.ts

### `utils/` (2)
- invariant-guards.ts
- ui-response-builder.ts

## Kept live (test-only)

- `agents/diagnostic-options-i18n.ts` — used exclusively by
  `scripts/regression-diagnostic-options.test.ts`. Kept to preserve
  regression coverage.

## Restore

```sh
BASE=_deadcode/supabase/functions/ai-agriculture-chat
DST=supabase/functions/ai-agriculture-chat
for d in agents bundled-rules/canonical contracts decision i18n runtime utils; do
  mkdir -p "$DST/$d" && mv "$BASE/$d/"*.ts "$DST/$d/" 2>/dev/null
done
```

## Excluded from build

`_deadcode/` sits outside `supabase/functions/` and `src/`, so Deno edge
bundling and Vite compilation ignore it. Do not import from here.

## Invariants

- **PR-2:** `evaluateCandidateHypotheses` may be called from EXACTLY ONE
  file — `supabase/functions/ai-agriculture-chat/runtime/graph-runtime.ts`.
  Guard grep (must return exactly two lines):
  ```
  rg "evaluateCandidateHypotheses\s*\(" supabase/functions/ai-agriculture-chat
  ```
