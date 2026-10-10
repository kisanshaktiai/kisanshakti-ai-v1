import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  resolveCaller,
  type SessionContextRow,
} from "../../../supabase/functions/analytics-forecast/caller.ts";

const SERVICE_KEY = "service-key-for-test";
const FARMER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const TENANT = "33333333-3333-3333-3333-333333333333";

const lookupFor = (valid: Record<string, SessionContextRow>) => {
  const seen: string[] = [];
  const fn = async (token: string) => {
    seen.push(token);
    return valid[token] ?? null;
  };
  return { fn, seen };
};

const req = (headers: Record<string, string>) =>
  new Request("https://example.test/functions/v1/analytics-forecast", { headers });

Deno.test("service-role bearer is accepted without a session lookup", async () => {
  const l = lookupFor({});
  const c = await resolveCaller(req({ authorization: `Bearer ${SERVICE_KEY}` }), SERVICE_KEY, l.fn);
  assertEquals(c, { kind: "service" });
  assertEquals(l.seen.length, 0);
});

Deno.test("anon caller with only x-farmer-id is rejected (header is not identity)", async () => {
  const l = lookupFor({});
  const c = await resolveCaller(
    req({ authorization: "Bearer anon", "x-farmer-id": FARMER, "x-tenant-id": TENANT }),
    SERVICE_KEY,
    l.fn,
  );
  assertEquals(c, null);
});

Deno.test("unknown or expired session token is rejected", async () => {
  const l = lookupFor({});
  const c = await resolveCaller(req({ "x-session-token": "stale" }), SERVICE_KEY, l.fn);
  assertEquals(c, null);
  assertEquals(l.seen, ["stale"]);
});

Deno.test("verified session resolves to the database farmer, not the spoofed header", async () => {
  const l = lookupFor({ good: { farmer_id: FARMER, tenant_id: TENANT } });
  const c = await resolveCaller(
    req({ "x-session-token": "good", "x-farmer-id": OTHER }),
    SERVICE_KEY,
    l.fn,
  );
  assertEquals(c, { kind: "farmer", farmerId: FARMER, tenantId: TENANT });
});

Deno.test("a bearer that only resembles the service key is not service role", async () => {
  const l = lookupFor({});
  const c = await resolveCaller(req({ authorization: `Bearer ${SERVICE_KEY}x` }), SERVICE_KEY, l.fn);
  assertEquals(c, null);
});

Deno.test("lock-down source contract: no code agronomy, no LLM, no writes", async () => {
  const src = await Deno.readTextFile("supabase/functions/analytics-forecast/index.ts");
  for (const banned of ["COC_PER_ACRE", "YIELD_Q_PER_ACRE", "ai.gateway", "LOVABLE_API_KEY", ".upsert(", ".insert(", ".update(", ".delete("]) {
    assert(!src.includes(banned), `index.ts must not contain ${banned}`);
  }
  assert(src.includes("resolveCaller("), "every request must pass resolveCaller");
  assert(src.includes("caller.kind === 'farmer'"), "a farmer must only read his own rows");
  assert(src.includes("FORECAST_GENERATION_PAUSED"));
  assert(!/searchParams\.get\('farmer_id'\)\s*;/.test(src.split("caller.kind === 'farmer'")[0]),
    "farmer_id query param must not be read before the farmer/service branch");
});
