// AI-based moderation for community posts.
// Returns { allowed, reason, severity } and on block writes a post_reports row (status='auto_blocked').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-farmer-id, x-tenant-id",
};

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

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
        tool_choice: { type: "function", function: { name: "classify" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      // Fail-open to avoid blocking the user; flag if rate limited.
      return new Response(
        JSON.stringify({ allowed: true, severity: "none", reason: "moderation_unavailable", category: "safe" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = await aiRes.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args
      ? JSON.parse(args)
      : { allowed: true, severity: "none", reason: "no_classification", category: "safe" };

    // If blocked and we have a post_id, log a report row
    if (!parsed.allowed && post_id) {
      const tenantId = req.headers.get("x-tenant-id");
      const farmerId = req.headers.get("x-farmer-id");
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
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
