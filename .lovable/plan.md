
# Bundle-Size Forensic Audit — `ai-agriculture-chat`

## Headline finding (measured, not estimated)

I built the function's real bundle in the sandbox with `deno bundle --platform=browser --node-modules-dir=auto index.ts` (all npm deps resolved, unminified):

| Metric | Measured | Cap | Verdict |
|---|---|---|---|
| **Built bundle (unminified, incl. supabase-js)** | **2.82 MB** | 5 MB | 44% headroom |
| **Uploaded source** (`ai-agriculture-chat/**` + `_shared/**`) | **~4.57 MB** (Supabase reported 4.7 MB) | 5 MB | **binding constraint** |

The deploy is not failing because the bundle is too big. It is failing because the **source payload uploaded to Supabase** is near 5 MB.

**This inverts the optimization strategy.** Lazy imports, tree-shaking, dead-export elimination and dependency de-duplication reduce *bundle* bytes — they save **zero upload bytes**. Only removing actual characters from `.ts` files under `supabase/functions/` moves the number that is blocking deploys.

It also means **no architectural split is warranted**, and my earlier "consolidate supabase-js / switch to `Deno.serve`" recommendation is downgraded: those are correctness/perf wins worth ~0 KB of upload relief.

## Where the source bytes are

```
agents/            2,541.6 KB   (56%)
decision/          1,027.1 KB   (23%)
index.ts             261.5 KB   ( 6%)
everything else      ~660   KB
_shared/              78   KB
```

Top single files: `agents/orchestrator.ts` 682.2 KB, `index.ts` 240.4 KB, `agents/layered-rule-evaluator.ts` 99.5 KB, `agents/llm-response-formatter.ts` 118.1 KB.

### Lever 1 — Comments: 1,032 KB (26.2% of all source)

| File | Comment bytes | File size |
|---|---|---|
| `agents/orchestrator.ts` | 189.6 KB | 682.2 KB |
| `index.ts` | 58.0 KB | 240.4 KB |
| `agents/layered-rule-evaluator.ts` | 29.4 KB | 99.5 KB |
| `agents/llm-response-formatter.ts` | 28.4 KB | 118.1 KB |
| `decision/hypothesis-evaluator.ts` | 23.1 KB | 68.6 KB |
| `bundled-rules/loader.ts` | 20.1 KB | 68.0 KB |
| `decision/symbolic-reasoner.ts` | 19.5 KB | 73.5 KB |
| top 12 combined | **~440 KB** | |

Only 171.4 KB of this is `═══` banner / CHANGE LOG blocks — project memory mandates those stay. The remaining ~860 KB is inline narrative commentary, much of it historical ("FIX (2026-07-29) — …", "[STEP 7 REMOVED] …") duplicated across dozens of hunks.

### Lever 2 — Logging: 276.2 KB across 2,564 `console.*` call sites

`agents/orchestrator.ts` alone: **93.4 KB / 782 calls**. `index.ts`: 30.0 KB / 278 calls. These are emoji-decorated multi-line trace strings. They count toward source *and* bundle *and* runtime latency.

### Lever 3 — Hardcoded agronomy data literals (~150 KB, each with exactly ONE importer)

Every module below is imported by `agents/orchestrator.ts` only, and each contradicts the project's DB-SSOT rule (no hardcoded agronomy in TS):

| Module | Embedded literal | Size |
|---|---|---|
| `decision/differential-diagnosis-clarifier.ts` | `DIFFERENTIAL_PATTERNS` | 9.1 KB |
| `agents/intent-lock.ts` | `INTENT_SCOPE_MAP` | 8.1 KB |
| `agents/cross-crop-symptom-mapper.ts` | `SYMPTOM_PATTERNS` | 8.0 KB |
| `agents/observation-cause-mapper.ts` | `OBSERVATION_RULES` | 8.0 KB |
| `agents/language-induction-layer.ts` | Marathi/Hindi/English symptom maps | 13.2 KB |
| `agents/nlp-agriculture-validator.ts` | Marathi/Hindi vocab | 11.0 KB |
| `agents/crop-stage-advisor.ts` | WHEAT/RICE/COTTON/SUGARCANE advisors | 13.4 KB |
| `agents/agricultural-vocabulary.ts` | pest/crop/disease/symptom vocab | 12.1 KB |

Measurement caveat: my literal scanner reported `BLOCKED_PATTERNS` in `bundled-rules/loader.ts` at 50.4 KB — I verified the source and it is a 12-entry regex array (~0.4 KB). That row is a false positive; treat literal sizes above as approximate, confirmed individually before removal.

### Lever 4 — Correctness defects found during the trace (not size)

1. **Broken dynamic import.** `agents/orchestrator.ts:5057` does `await import('../photo/photo-observation-mapper.ts')`. That file **does not exist** (`photo/` contains only `photo-analyzer.ts`). Every photo-bearing request throws. The bundler surfaced this as a hard error.
2. **Duplicate supabase-js.** `_shared/subscriptionMiddleware.ts` pulls `https://esm.sh/@supabase/supabase-js@2.49.1`; everything else uses `npm:@supabase/supabase-js@2.57.2`. Two client copies in the bundle.
3. **Duplicate utilities.** `detectLanguage` defined in 3 files (`index.ts`, `agents/language-induction-layer.ts`, `agents/nlu-agent.ts`); `isSchemaColumnError` in 3; `isFresh` in 3.
4. **Duplicate object key.** `"सोयाबीन"` declared twice in `utils/crop-code-normalizer.ts` (lines 109 and 166) — the second silently overwrites the first.

## Recommended optimization order

**Phase A — zero behavior risk, ~400–450 KB recovered (unblocks deploy immediately)**
1. Comment compaction in the 12 heaviest files: collapse multi-line inline narrative to one line, delete superseded historical "FIX (date)" prose whose change is already recorded in the file's CHANGE LOG. Preserve every top-of-file CHANGE LOG banner verbatim (memory contract). Est. **~300 KB**.
2. Log compaction in `orchestrator.ts` + `index.ts`: collapse multi-line template traces to single-line key=value, delete pure entry/exit breadcrumbs. Keep every structured contract log (`[EVIDENCE_IDENTITY]`, `[GRAPH_CONTRACT_*]`, `[DOSAGE_PROVENANCE_VIOLATION]`, `[SYMBOLIC_ID_LEAK]`). Est. **~120 KB**.

Projected upload after Phase A: **~4.15 MB** (17% headroom).

**Phase B — correctness, ~0 KB, do in the same deploy**
3. Restore or remove the missing `photo/photo-observation-mapper.ts` import path.
4. Point `_shared/subscriptionMiddleware.ts` at `npm:@supabase/supabase-js@2.57.2`.
5. Delete the duplicate `"सोयाबीन"` key.

**Phase C — DB-SSOT consolidation, ~150–250 KB, behavior-bearing (separate change, verify per module)**
6. Migrate the eight hardcoded-agronomy modules in Lever 3 to lookups against the existing observation/intent/stage SSOT tables, deleting the literals. Each module is single-importer, so each can be cut over and verified independently.
7. Collapse the three duplicated utilities into single shared implementations.

Projected upload after Phase C: **~3.9 MB**.

**Not recommended:** splitting the decision brain into multiple Edge Functions. The built bundle is 2.82 MB against a 5 MB cap, and `_shared/**` re-uploads with every function, so a split adds deployment surface and a cross-function state boundary to solve a problem Phase A already solves.

## Technical notes

- Bundle measurement is reproducible: copy `supabase/functions/{_shared,ai-agriculture-chat}` to a scratch dir, stub the missing `photo-observation-mapper.ts`, then `deno bundle --node-modules-dir=auto --platform=browser index.ts -o out.js`.
- Supabase's server-side build strips comments, which is exactly why the 1 MB of comments shows up in the upload figure but not in the 2.82 MB bundle — and why comment removal is the highest-yield, lowest-risk lever available.
- Phase A touches no control flow, no exported signatures, and no DB contracts; it is verifiable by diffing the AST-relevant tokens before and after.
