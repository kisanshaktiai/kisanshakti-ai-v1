// AI-based moderation for community posts.
// Returns { allowed, reason, severity } and on block writes a post_reports row (status='auto_blocked').
//
// CHANGE LOG (newest first)
// 2026-09-27 — AI model SSOT: the model now comes from the AI model registry (task community.moderate,
//   via callAITask) instead of the literal 'google/gemini-3-flash-preview' sent to the Lovable gateway.
//   Same messages, tools and forced tool_choice; still fails open. The service-role client is now created
//   once at module level and used for the registry/ledger and the post_reports write. Unavoidable
//   differences: the call now has the router's default 55 s timeout (previously none); a missing provider
//   key or a timeout/network failure now fails open with reason "moderation_unavailable" instead of
//   "error"; an unparseable provider body now gives "no_classification" (router empty_output) instead of
//   "error"; after a 429 the router cools the provider for 5-8 s, so a call inside that window fails open
//   without reaching the provider; the error log carries the router's error class and the first 300
//   characters of the provider body. Each call is recorded in ai_model_metrics.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAITask } from "../_shared/aiConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-farmer-id, x-tenant-id",
};

// Service-role client for the AI model registry/ledger and post_reports (created once per isolate).
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { content, post_id } = await req.json();
    if (!content || typeof content !== "string") {
      return new Response(JSON.stringify({ error: "content required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await callAITask({
      db: supabase,
      task: "community.moderate",
      functionName: "community-moderate",
      farmerId: null,
      metadata: { caller: "moderate", post_id: post_id ?? null },
      messages: [
        {
          role: "system",
          content:
            "You are a moderation classifier for a farmer community. Block: hate, harassment, sexual content, violence, spam/scam, dangerous misinformation about pesticides (e.g., banned chemicals, lethal doses). Allow: normal farming discussion, complaints, jokes.",
        },
        { role: "user", content },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "classify",
            parameters: {
              type: "object",
              properties: {
                allowed: { type: "boolean" },
                severity: { type: "string", enum: ["none", "low", "medium", "high"] },
                reason: { type: "string" },
                category: {
                  type: "string",
                  enum: ["safe", "hate", "harassment", "sexual", "violence", "spam", "unsafe_advice"],
                },
              },
              required: ["allowed", "severity", "reason", "category"],
              additionalProperties: false,
            },
          },
        },
      ],
      toolChoice: { type: "function", function: { name: "classify" } },
    });

    // An answer without tool_calls (router: empty_output) keeps the old no_classification fallback below.
    if (!r.ok && r.errorClass !== "empty_output") {
      console.error("AI error", r.httpStatus ?? null, r.errorClass, r.detail);
      // Fail-open to avoid blocking the user; flag if rate limited.
      return new Response(
        JSON.stringify({ allowed: true, severity: "none", reason: "moderation_unavailable", category: "safe" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const args = r.ok ? r.toolCalls?.[0]?.function?.arguments : undefined;
    const parsed = args
      ? JSON.parse(args)
      : { allowed: true, severity: "none", reason: "no_classification", category: "safe" };

    // If blocked and we have a post_id, log a report row
    if (!parsed.allowed && post_id) {
      const tenantId = req.headers.get("x-tenant-id");
      const farmerId = req.headers.get("x-farmer-id");
      await supabase.from("post_reports").upsert(
        {
          post_id,
          farmer_id: farmerId,
          tenant_id: tenantId,
          reason: `auto:${parsed.category}:${parsed.reason}`.slice(0, 500),
          status: "auto_blocked",
        },
        { onConflict: "post_id,farmer_id" },
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("community-moderate error", e);
    return new Response(
      JSON.stringify({ allowed: true, severity: "none", reason: "error", category: "safe" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
