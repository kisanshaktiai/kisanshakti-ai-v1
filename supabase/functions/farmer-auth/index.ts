/**
 * farmer-auth — thin transport around the shared auth core.
 *
 * CHANGE LOG
 * 2026-09-01 — Extracted logic to ../_shared/farmer-auth-core.ts so the same
 *              handler can also be reached through tenant-config.
 */
import { corsHeaders } from "../_shared/cors.ts";
import { handleFarmerAuth } from "../_shared/farmer-auth-core.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  return await handleFarmerAuth(req, body);
});
