/**
 * Contract tests for decision_rules.rule_id_lc.
 *
 * Invariants (Stage-1 shadow column / Stage-2 dual-read shim):
 *   1. rule_id_lc is non-null for every row.
 *   2. rule_id_lc is unique.
 *   3. rule_id_lc always starts with the canonical 'rule_' prefix.
 *   4. rule_id_lc is fully lowercase snake_case (no UPPER chars, no spaces).
 *   5. rule_id_lc === ruleIdLc(rule_id) — i.e. matches the in-code normalizer
 *      used by id-normalizer.ts / selectRuleByAnyId / selectRulesByAnyIds.
 *   6. A sample lookup via the lc form returns the same row as the canonical form
 *      (dual-read reachability).
 *
 * If any of these fail, id-normalizer-based loaders will silently miss rules
 * and the symbolic brain will fall back to wrong/empty results.
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ruleIdLc } from "../utils/id-normalizer.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

assertExists(SUPABASE_URL, "VITE_SUPABASE_URL missing");
assertExists(SUPABASE_ANON_KEY, "VITE_SUPABASE_PUBLISHABLE_KEY missing");

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Page through decision_rules to bypass the PostgREST 1000-row cap. */
async function fetchAllRules(): Promise<{ rule_id: string; rule_id_lc: string | null }[]> {
  const PAGE = 1000;
  const out: { rule_id: string; rule_id_lc: string | null }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("decision_rules")
      .select("rule_id, rule_id_lc")
      .order("rule_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as any));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

const LC_SNAKE_RE = /^[a-z0-9_]+$/;

Deno.test("rule_id_lc: non-null, unique, prefixed, lowercase-snake, normalizer-consistent", async () => {
  const rows = await fetchAllRules();
  assert(rows.length > 0, "expected at least one decision_rules row");

  const nulls: string[] = [];
  const unprefixed: string[] = [];
  const badShape: string[] = [];
  const mismatched: { rule_id: string; got: string; expected: string }[] = [];
  const seen = new Map<string, string>();
  const dupes: { lc: string; a: string; b: string }[] = [];

  for (const { rule_id, rule_id_lc } of rows) {
    if (!rule_id_lc) {
      nulls.push(rule_id);
      continue;
    }
    if (!rule_id_lc.startsWith("rule_")) unprefixed.push(rule_id);
    if (!LC_SNAKE_RE.test(rule_id_lc)) badShape.push(rule_id_lc);

    const expected = ruleIdLc(rule_id);
    if (rule_id_lc !== expected) mismatched.push({ rule_id, got: rule_id_lc, expected });

    const prior = seen.get(rule_id_lc);
    if (prior) dupes.push({ lc: rule_id_lc, a: prior, b: rule_id });
    else seen.set(rule_id_lc, rule_id);
  }

  assertEquals(nulls, [], `null rule_id_lc rows: ${nulls.slice(0, 5).join(", ")}`);
  assertEquals(
    unprefixed,
    [],
    `rule_id_lc missing 'rule_' prefix (first 5): ${unprefixed.slice(0, 5).join(", ")}`,
  );
  assertEquals(
    badShape,
    [],
    `rule_id_lc not lowercase_snake (first 5): ${badShape.slice(0, 5).join(", ")}`,
  );
  assertEquals(
    mismatched,
    [],
    `rule_id_lc != ruleIdLc(rule_id) (first 3): ${JSON.stringify(mismatched.slice(0, 3))}`,
  );
  assertEquals(
    dupes,
    [],
    `duplicate rule_id_lc (first 3): ${JSON.stringify(dupes.slice(0, 3))}`,
  );
});

Deno.test("rule_id_lc: id-normalizer dual-read reaches the same row as canonical", async () => {
  // Take a small sample so we don't hammer PostgREST.
  const { data: sample, error } = await supabase
    .from("decision_rules")
    .select("rule_id, rule_id_lc")
    .limit(10);
  if (error) throw error;
  assert(sample && sample.length > 0, "no sample rows");

  for (const row of sample!) {
    const expectedLc = ruleIdLc(row.rule_id);
    assertEquals(row.rule_id_lc, expectedLc, `lc mismatch for ${row.rule_id}`);

    // Simulate the loader path: caller passes the canonical id, but we look it
    // up via rule_id_lc (Stage-2 fallback). It must come back.
    const { data: byLc, error: lcErr } = await supabase
      .from("decision_rules")
      .select("rule_id")
      .eq("rule_id_lc", expectedLc)
      .maybeSingle();
    if (lcErr) throw lcErr;
    assertExists(byLc, `dual-read miss for ${row.rule_id} via rule_id_lc=${expectedLc}`);
    assertEquals((byLc as any).rule_id, row.rule_id);
  }
});
