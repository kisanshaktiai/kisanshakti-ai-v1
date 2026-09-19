import { assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

const SQL = "supabase/migrations/20260918090000_farm_economics_ssot.sql";

Deno.test("farm economics migration is additive and runner-safe", async () => {
  const sql = (await Deno.readTextFile(SQL)).toUpperCase();
  for (const banned of ["DELETE FROM", "TRUNCATE", "DROP TABLE", "DROP COLUMN", "TEMP TABLE", "TEMPORARY", "SET LOCAL", "SET SESSION"]) {
    assert(!sql.includes(banned), `migration must not contain ${banned}`);
  }
});

Deno.test("farmer-scoped reads use session identity, not auth.uid()", async () => {
  const sql = await Deno.readTextFile(SQL);
  const policies = sql.split("CREATE POLICY").slice(1)
    .filter((p) => /^\s*\w*farmer_session_read\b/.test(p))
    .map((p) => p.split(";")[0]);
  assert(policies.length === 4, `expected 4 farmer session policies, found ${policies.length}`);
  for (const p of policies) {
    assert(p.includes("public.get_current_farmer_id()"), "farmer policy must use get_current_farmer_id()");
    assert(!p.includes("auth.uid()"), "farmer policy must not use auth.uid()");
  }
});

Deno.test("no crop names or amounts are seeded by the schema migration", async () => {
  const sql = await Deno.readTextFile(SQL);
  assert(!/INSERT\s+INTO/i.test(sql), "schema migration must not insert data");
});
