/**
 * Regression tests for "every query returns the same generic 277-char template"
 * bug (2026-06-19). Two layers:
 *
 *   1. DB-level invariants for the lower_snake_case migration (Scope A).
 *      Any future row that creeps in with UPPER_CASE on these three columns
 *      would re-introduce the brain-side join misses that produced the
 *      generic response in the first place. CHECK constraints already block
 *      writes — this test catches any backdoor (replication, dump-restore).
 *
 *   2. Code-level invariants for the DIRECT_MODE / DIAGNOSTIC_INTENTS gate
 *      in `agents/orchestrator.ts`. We don't spin up the whole brain here;
 *      we statically assert the source file declares the new symbols, so
 *      a future refactor can't silently regress the suppressor fix.
 */

// NB: do NOT use std/dotenv/load — root .env.example references variables
// (e.g. VITE_DEFAULT_TENANT_ID) that are not in the sandbox .env, which makes
// the loader throw. Read env directly; values are injected by the Supabase
// test runner / local shell.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

Deno.test("DB invariant: cultural_strategies.crop_code is fully lowercase", async () => {
  const { data, error } = await supabase
    .from("cultural_strategies")
    .select("crop_code");
  if (error) throw error;
  const upper = (data ?? []).filter((r: any) => /[A-Z]/.test(r.crop_code));
  assertEquals(upper, [], `uppercase rows remain: ${JSON.stringify(upper.slice(0, 5))}`);
});

Deno.test("DB invariant: emergency_observation_codes.observation_code is fully lowercase", async () => {
  const { data, error } = await supabase
    .from("emergency_observation_codes")
    .select("observation_code");
  if (error) throw error;
  const upper = (data ?? []).filter((r: any) => /[A-Z]/.test(r.observation_code));
  assertEquals(upper, [], `uppercase rows remain: ${JSON.stringify(upper.slice(0, 5))}`);
});

Deno.test("DB invariant: observation_differential_questions.observation_code is fully lowercase", async () => {
  const { data, error } = await supabase
    .from("observation_differential_questions")
    .select("observation_code");
  if (error) throw error;
  const upper = (data ?? []).filter((r: any) => /[A-Z]/.test(r.observation_code));
  assertEquals(upper, [], `uppercase rows remain: ${JSON.stringify(upper.slice(0, 5))}`);
});

Deno.test("DB invariant: observation_master is fully lowercase (should stay clean)", async () => {
  // observation_master is the SSOT; any uppercase row here would re-break
  // the entire decision brain (rule_conditions join on observation_code).
  // Paginate — table has 2540 rows.
  const PAGE = 1000;
  let from = 0;
  let upperCount = 0;
  while (true) {
    const { data, error } = await supabase
      .from("observation_master")
      .select("observation_code")
      .order("observation_code", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    upperCount += data.filter((r: any) => /[A-Z]/.test(r.observation_code)).length;
    if (data.length < PAGE) break;
    from += PAGE;
  }
  assertEquals(upperCount, 0, `observation_master has ${upperCount} uppercase rows`);
});

Deno.test("Code invariant: orchestrator DIRECT_MODE is gated by symptom evidence", async () => {
  const src = await Deno.readTextFile(
    new URL("../agents/orchestrator.ts", import.meta.url),
  );
  // Symptom-evidence guard must exist on the DIRECT_MODE branch.
  assert(
    src.includes("symptomEvidencePresent"),
    "orchestrator.ts: lost the symptomEvidencePresent guard on DIRECT_MODE",
  );
  assert(
    src.includes("DIRECT_MODE_BLOCKED_BY_SYMPTOMS"),
    "orchestrator.ts: lost the DIRECT_MODE_BLOCKED_BY_SYMPTOMS audit tag",
  );
  // DIAGNOSTIC_INTENTS must contain the previously-missing symptom intents
  // that were dead-ending at STAGE_CONTEXT_REQUIRED.
  for (const intent of [
    "EMERGENCE_FAILURE",
    "POOR_GERMINATION",
    "CROP_PROBLEM_REPORT",
    "PEST_PRESENCE_VISIBLE",
    "DISEASE_LIKE_PATTERN",
  ]) {
    assert(
      src.includes(`'${intent}'`),
      `orchestrator.ts: DIAGNOSTIC_INTENTS missing ${intent}`,
    );
  }
});

Deno.test("Code invariant: index.ts catch-all no longer blindly emits no_action_needed", async () => {
  const src = await Deno.readTextFile(
    new URL("../index.ts", import.meta.url),
  );
  assert(
    src.includes("symptom_evidence_present") || src.includes("symptomEvidence"),
    "index.ts: lost the symptom-evidence guard around computedDecisionState catch-all",
  );
  assert(
    src.includes("forcing 'awaiting_clarification'"),
    "index.ts: lost the 'forcing awaiting_clarification' log — guard likely deleted",
  );
});

Deno.test("Code invariant: resolveCropTimeline hardens cache.has against plain objects", async () => {
  const src = await Deno.readTextFile(
    new URL("../utils/resolveCropTimeline.ts", import.meta.url),
  );
  assert(
    src.includes("typeof (rawCache as any).has === 'function'"),
    "resolveCropTimeline.ts: lost the cache typeguard (cache.has crash will return)",
  );
});
