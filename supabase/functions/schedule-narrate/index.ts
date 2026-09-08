// CHANGE LOG
// 2026-09-08 19:40 UTC — NEW. The cron job `schedule-narrate-10m` has been POSTing to
//   /functions/v1/schedule-narrate since it was created, but that function never existed:
//   every sweep 404'd, so schedules whose narration did not finish inside the generation
//   request stayed half-English for ever (audit: schedule 2fdaeb99, 26 of 36 tasks pending,
//   invisible in the farmer's Marathi cards). This endpoint is the missing sweep: it
//   authenticates the cron key and forwards to ai-smart-schedule `action=narrate` in
//   service-role (sweep) mode, which is the durable narration worker.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sweepKey = Deno.env.get("SCHEDULE_NARRATE_KEY") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer || (bearer !== serviceRoleKey && (!sweepKey || bearer !== sweepKey))) {
    return json({ error: "Unauthorized" }, 401);
  }
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cron may post an empty body */ }
  const limit = Number(body?.limit ?? 5);

  const res = await fetch(`${supabaseUrl}/functions/v1/ai-smart-schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}`, "apikey": serviceRoleKey },
    body: JSON.stringify({ action: "narrate", limit: Number.isFinite(limit) && limit > 0 ? limit : 5 }),
  });
  const out = await res.json().catch(() => ({}));
  return json({ success: res.ok, source: body?.source ?? "manual", forwarded: out, executionTimeMs: Date.now() - startedAt }, res.ok ? 200 : 502);
});
