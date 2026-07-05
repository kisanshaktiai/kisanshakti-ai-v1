
# Trace verdict — `trace_mr7vui7x_ifwebi`

Query: "भात अजून उगवले नाही" (Rice / transplanting, DAS 27)

Symbolic pipeline actually did its job on the perception side:

- Intent = `EMERGENCE_FAILURE` @ 0.90
- 12 observations produced, 5 real symptoms, 8 EXTRACTED + 4 INFERRED
- Terminal damage detected: `SEEDLING_DIED`, `AFFECTED_PART_WHOLE`, `POOR_GERMINATION`
- Emergency promotion + Authority=CROP correctly enforced
- Diagnosis-only mode activated, clarification correctly skipped

But the reasoning side collapsed at the end:

```
candidates=0 eligible=0 winner=none sci=n/a builder=n/a translation=n/a
```

Meaning: with 9 terminal-grade observations and a locked Rice/transplanting context, **zero hypotheses were retrieved**, so **zero rules ran** and the farmer got nothing. That is the actual failure — not the cross-crop `GERMINATION_FAILURE` block (Rice already has `POOR_GERMINATION` as EXTRACTED, so the block is cosmetic here).

Two suspects for the empty candidate set:

1. `hypothesis-evaluator.ts` (static, primary) — the one that produced `candidates=0`. Likely stage/crop filter over-restrictive (mem://logic/hypothesis-canonical-group-and-stage-equivalence says GERMINATION/NURSERY/SEEDLING/EMERGENCE/ESTABLISHMENT must be treated as one family; this trace shows the DB stage is `transplanting`).
2. `hypothesis-graph-evaluator.ts` (dynamic fallback) — the file the earlier turn edited. Never invoked on this run, which is why previous "fixes" didn't move the needle.

# Plan — next 3 steps, no assumptions, no agronomy in code

## Step 1 — Prove which evaluator ran and why it returned 0
Read-only forensic pass, no code changes:

- `hypothesis-evaluator.ts`: locate the DB query that produces `candidates`. Capture exactly which columns from `hypothesis_master` / `hypothesis_conditions` are filtered by crop and by stage.
- Run `supabase--read_query` against `hypothesis_master` + `hypothesis_conditions` filtered by Rice + `emergence_failure`/germination family, to confirm whether **the DB actually has** a matching hypothesis for this intent/stage combo.
- Two possible outcomes:
  - a. Row exists → filter in `hypothesis-evaluator.ts` is wrong (stage-equivalence family not honored). Fix is a TS filter relaxation using the same canonical-group table already noted in memory — still zero hardcoded crop/pest names.
  - b. Row missing → DB gap. Draft a data-only insert (no code) and stop.

Both paths preserve "DB = brain, TS = runtime" contract.

## Step 2 — Consolidate to one evaluator
Regardless of Step 1 outcome, the dynamic import at `orchestrator.ts:4811` for `hypothesis-graph-evaluator.ts` must be removed or promoted so we stop editing the wrong file.

Decision rule:
- If `hypothesis-graph-evaluator.ts` is a strict superset (already reads via the new `HypothesisGraphLoader` shape) → make it SSOT, delete `hypothesis-evaluator.ts`.
- Otherwise keep `hypothesis-evaluator.ts`, delete graph-evaluator + the dynamic import.

No behavior change other than removing the ghost path.

## Step 3 — Wire Phase-1 loaders behind flag `GRAPH_LOADERS_V1=off` by default
The 6 files created last turn (`graph/*.ts`) are inert. Wire them at exactly one call site — the hypothesis retrieval path chosen in Step 2 — behind an env flag, with a `[GRAPH_LOADER]` trace so the next failing query prints both legacy `candidates=N` and new `graph.candidates=N` side by side. Flag stays off until diffs are clean.

## What is explicitly NOT in this step
- No touching cross-crop mapper, terminal-guard list, orchestrator observation extraction, LLM prompts, or frontend.
- No deleting the ~15 dead files yet.
- No seeding `observation_differential_questions` (deferred; not blocking this trace).

## Technical notes
- Evidence for Step 1 comes only from `supabase--read_query` + reading `hypothesis-evaluator.ts` — no writes.
- Flag mechanism: `Deno.env.get('GRAPH_LOADERS_V1') === 'on'`, checked once per request in the orchestrator and passed into the chosen evaluator.
- `[GRAPH_LOADER]` trace lines will include `trace_id`, `loader`, `input_key`, `db_rows`, `duration_ms` so we can diff without re-running failing queries blindly.

## Deliverable order for build mode
1. Read `hypothesis-evaluator.ts` retrieval block + run the 2 confirmatory DB queries.
2. Report row-exists vs row-missing; pick 1a or 1b path.
3. Consolidate evaluators (Step 2) in the same turn as the fix from Step 1.
4. Wire flag-gated loader trace (Step 3).

Approve to switch to build mode and execute Step 1 first (read-only DB + file inspection, no edits yet).
