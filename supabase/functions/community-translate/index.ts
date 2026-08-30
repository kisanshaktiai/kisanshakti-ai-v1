// Auto-translate community post content with DB caching.
// Cache table: post_translations(post_id, language_code, content, tenant_id)
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-farmer-id, x-tenant-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { post_id, target_language, source_text, source_language } = await req.json();
    if (!post_id || !target_language || !source_text) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = req.headers.get("x-tenant-id");

    if (source_language && source_language === target_language) {
      return new Response(JSON.stringify({ translated: source_text, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Cache lookup
    const { data: cached } = await supabase
      .from("post_translations")
      .select("content")
      .eq("post_id", post_id)
      .eq("language_code", target_language)
      .maybeSingle();

    if (cached?.content) {
      return new Response(JSON.stringify({ translated: cached.content, cached: true }), {
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
              "You are a translator for a farmer community app. Translate the user's text into the requested language using natural, conversational rural vocabulary. Preserve hashtags (#tag) and @mentions. Reply with ONLY the translation, no preamble.",
          },
          {
            role: "user",
            content: `Target language code: ${target_language}\n\nText:\n${source_text}`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      if (aiRes.status === 429 || aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "ai_unavailable", code: aiRes.status }), {
          status: aiRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const json = await aiRes.json();
    const translated = json.choices?.[0]?.message?.content?.trim() ?? source_text;

    // Cache
    await supabase.from("post_translations").upsert(
      {
        post_id,
        language_code: target_language,
        content: translated,
        tenant_id: tenantId,
      },
      { onConflict: "post_id,language_code" },
    );

    return new Response(JSON.stringify({ translated, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("community-translate error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
