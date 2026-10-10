import { assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

const SQL = "supabase/migrations/20260918090000_farm_economics_ssot.sql";

Deno.test("farm economics migration is additive and runner-safe", async () => {
  const sql = (await Deno.readTextFile(SQL)).toUpperCase();
  for (const banned of ["DELETE FROM", "TRUNCATE", "DROP TABLE", "DROP COLUMN", "TEMP TABLE", "TEMPORARY", "SET LOCAL", "SET SESSION"]) {
    assert(!sql.includes(banned), `migration must not contain ${banned}`);
  }
});

Deno.test("farmer-scoped reads use session identity and land ownership, never auth.uid()", async () => {
  const sql = await Deno.readTextFile(SQL);
  const policies = sql.split("CREATE POLICY").slice(1)
    .filter((p) => /^\s*\w*farmer_session_read\b/.test(p))
    .map((p) => p.split(";")[0]);
  assert(policies.length === 4, `expected 4 farmer session policies, found ${policies.length}`);
  for (const p of policies) {
    assert(p.includes("public.get_current_farmer_id()"), "farmer policy must use get_current_farmer_id()");
    assert(!p.includes("auth.uid()"), "farmer policy must not use auth.uid()");
    assert(p.includes("FROM public.lands l") && p.includes("l.farmer_id = public.get_current_farmer_id()"),
      "farmer policy must check land ownership");
  }
});

Deno.test("the only seeded rows are vocabulary — no rates, costs, yields or crops", async () => {
  const sql = await Deno.readTextFile(SQL);
  const inserts = [...sql.matchAll(/INSERT\s+INTO\s+public\.(\w+)/gi)].map((m) => m[1]);
  const allowed = new Set(["expense_component_master", "expense_component_task_map"]);
  for (const t of inserts) assert(allowed.has(t), `unexpected seed into ${t}`);
  // vocabulary inserts carry no numeric amounts other than display_order
  const valueBlocks = sql.split(/INSERT\s+INTO/i).slice(1).map((b) => b.split("ON CONFLICT")[0]);
  for (const b of valueBlocks) {
    const nums = b.match(/\b\d+(\.\d+)?\b/g) ?? [];
    for (const n of nums) assert(Number(n) <= 7, `numeric literal ${n} in a vocabulary seed`);
  }
});

Deno.test("scope and source columns follow repo conventions", async () => {
  const sql = await Deno.readTextFile(SQL);
  assert(!/region_level/.test(sql), "use scope_level (region_recommendation_scope convention)");
  assert(!/source_type\s+text/.test(sql), "publisher lives in knowledge_sources; rows carry origin + knowledge_source_id");
  assert(/origin <> 'knowledge_source' OR knowledge_source_id IS NOT NULL/.test(sql));
  for (const code of ["'seeds'", "'fertilizers'", "'pesticides'", "'labor'", "'irrigation'", "'machinery'", "'other'"]) {
    assert(sql.includes(code), `component ${code} must match the i18n key set`);
  }
});
