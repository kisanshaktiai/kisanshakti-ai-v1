// Lightweight health-check endpoint. Returns DB connectivity + recent error counts.
// Public (no JWT) — safe to expose: only aggregate counts, no PII.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const start = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("system_health_snapshot");
    if (error) throw error;

    return new Response(
      JSON.stringify({
        status: "ok",
        latency_ms: Date.now() - start,
        snapshot: data,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        status: "degraded",
        error: String((e as Error)?.message ?? e),
        latency_ms: Date.now() - start,
        timestamp: new Date().toISOString(),
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
