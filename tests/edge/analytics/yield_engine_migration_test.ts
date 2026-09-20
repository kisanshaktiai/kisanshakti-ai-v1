import { assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
const SQL = "supabase/migrations/20260921090000_yield_engine_v1.sql";

Deno.test("yield engine migration is additive and runner-safe", async () => {
  const up = (await Deno.readTextFile(SQL)).split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n").toUpperCase();
  for (const banned of ["DELETE FROM", "TRUNCATE", "DROP TABLE", "DROP COLUMN", "TEMP TABLE", "TEMPORARY", "SET LOCAL", "SET SESSION"]) {
    assert(!up.includes(banned), `must not contain ${banned}`);
  }
});

Deno.test("no crop names, yields, prices or wages in the engine code", async () => {
  const sql = await Deno.readTextFile(SQL);
  const body = sql.split("-- 2. Compute one land")[1];
  for (const banned of ["'rice'", "'sugarcane'", "'wheat'", "'groundnut'", "RICE_", "18.0", "₹", "'INR'", "'mr'", "'hi'"]) {
    assert(!body.includes(banned), `engine body must not contain ${banned}`);
  }
});

Deno.test("every model parameter is read from the policy row, not literal", async () => {
  const sql = await Deno.readTextFile(SQL);
  const body = sql.split("-- 2. Compute one land")[1].split("-- 3. Weekly run")[0];
  for (const key of ["max_age_days", "min_confidence", "floor", "default_ky", "band_pct", "confidence_base", "model_version", "observed_status_prefix"]) {
    assert(body.includes(`'${key}'`), `policy key ${key} must be read`);
  }
  assert(!/greatest\(0\.[1-9]\d*,/.test(body), "no literal factor floor in the body (only 0/1 clamps allowed)");
});

Deno.test("farmer RPC checks tenant, farmer and land; batch functions are service-role only", async () => {
  const sql = await Deno.readTextFile(SQL);
  const rpc = sql.split("refresh_my_yield_estimate(p_land_id uuid)")[1].split("$fn$;")[0];
  assert(rpc.includes("public.get_current_farmer_id()") && rpc.includes("public.has_tenant_access(l.tenant_id)") && rpc.includes("l.farmer_id = v_farmer"));
  assert(sql.includes("GRANT EXECUTE ON FUNCTION public.run_weekly_yield_estimates(date) TO service_role;"));
  assert(sql.includes("REVOKE ALL ON FUNCTION public.compute_land_yield_estimate(uuid, date) FROM PUBLIC, anon, authenticated;"));
  assert(sql.includes("security_invoker = true"), "view must run under the caller's RLS");
});

Deno.test("fix migration: no PL/pgSQL variable shares an unqualified name with a queried column", async () => {
  const sql = await Deno.readTextFile("supabase/migrations/20260921093000_yield_engine_v1_fix_variable_clash.sql");
  const declare = sql.split("DECLARE")[1].split("BEGIN")[0];
  const vars = [...declare.matchAll(/^\s+(\w+)\s+\w+/gm)].map((m) => m[1]);
  const columns = ["water_regime", "factors", "evidence", "explanation", "gaps", "week_start", "canopy", "stage_code", "crop_code", "land_id", "confidence_score"];
  for (const v of vars) assert(!columns.includes(v), `variable ${v} clashes with a column name`);
  assert(sql.includes("yp.week_start < v_week_start"));
  assert(sql.includes("RETURNING jsonb_build_object('land_id', yield_predictions.land_id"));
});
