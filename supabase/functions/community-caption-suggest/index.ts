// Suggest a caption + hashtags + crop tags for a community post draft.
// Accepts: { text?: string, image_base64?: string, language: string }
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-farmer-id, x-tenant-id",
};

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

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const userParts: any[] = [];
    if (text) userParts.push({ type: "text", text: `Farmer's draft note:\n${text}` });
    if (image_base64) {
      userParts.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${image_base64}` },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
        tool_choice: { type: "function", function: { name: "suggest_post" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "ai_unavailable", code: aiRes.status }), {
        status: aiRes.status === 429 || aiRes.status === 402 ? aiRes.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiRes.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
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
