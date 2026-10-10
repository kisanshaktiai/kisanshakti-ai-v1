// Suggest a caption + hashtags + crop tags for a community post draft.
// Accepts: { text?: string, image_base64?: string, language: string }
//
// CHANGE LOG (newest first)
// 2026-09-27 — AI model SSOT: the model now comes from the AI model registry (task community.caption,
//   via callAITask) instead of the literal 'google/gemini-3-flash-preview' sent to the Lovable gateway.
//   Same messages, tools and forced tool_choice. Unavoidable differences: the call now has the router's
//   default 55 s timeout (previously none); a missing provider key or a timeout/network failure now answers
//   500 { error: "ai_unavailable", code: null } instead of 500 { error: "<exception text>" }; an unparseable
//   provider body now gives the empty caption fallback (router empty_output) instead of 500; after a 429
//   the router cools the provider for 5-8 s, so a call inside that window answers 500 (code null) without
//   reaching the provider; the error log carries the router's error class and the first 300 characters of
//   the provider body. Each call is recorded in ai_model_metrics.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { callAITask } from "../_shared/aiConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-farmer-id, x-tenant-id",
};

// Service-role client for the AI model registry and usage ledger (created once per isolate).
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, image_base64, language = "en" } = await req.json();
    if (!text && !image_base64) {
      return new Response(JSON.stringify({ error: "text or image_base64 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userParts: any[] = [];
    if (text) userParts.push({ type: "text", text: `Farmer's draft note:\n${text}` });
    if (image_base64) {
      userParts.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${image_base64}` },
      });
    }

    const r = await callAITask({
      db: supabase,
      task: "community.caption",
      functionName: "community-caption-suggest",
      farmerId: null,
      metadata: { caller: "caption-suggest" },
      messages: [
        {
          role: "system",
          content:
            `You help Indian farmers write short, friendly community posts in language code "${language}". Use natural rural vocabulary. Be concise (max 60 words). Detect any visible crop and possible issue.`,
        },
        { role: "user", content: userParts },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "suggest_post",
            description: "Return suggested caption, hashtags, crop, and detected issue.",
            parameters: {
              type: "object",
              properties: {
                caption: { type: "string" },
                hashtags: { type: "array", items: { type: "string" } },
                crop: { type: "string" },
                detected_issue: { type: "string" },
              },
              required: ["caption", "hashtags"],
              additionalProperties: false,
            },
          },
        },
      ],
      toolChoice: { type: "function", function: { name: "suggest_post" } },
    });

    // An answer without tool_calls (router: empty_output) keeps the old empty-caption fallback below.
    if (!r.ok && r.errorClass !== "empty_output") {
      const code = r.httpStatus ?? null;
      console.error("AI error", code, r.errorClass, r.detail);
      return new Response(JSON.stringify({ error: "ai_unavailable", code }), {
        status: code === 429 || code === 402 ? code : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const args = r.ok ? r.toolCalls?.[0]?.function?.arguments : undefined;
    const parsed = args ? JSON.parse(args) : { caption: "", hashtags: [] };

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("community-caption-suggest error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
