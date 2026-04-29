// Proactive Alert → AI-Generated, Multilingual, Farmer-Friendly Question
// ----------------------------------------------------------------------
// Decision-Brain-FIRST. The LLM only NARRATES (translates + simplifies).
// All agronomic facts come from the `proactive_alerts` row already produced
// by the symbolic engine. The LLM never invents agronomy.
//
// Contract:
//   POST { alertId: string, landId?: string, language?: string }
//   → 200 { question: string, language: string, source: 'llm' | 'fallback' }
//   → 4xx { error }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPPORTED_LANGS = ["en", "hi", "mr", "pa", "ta", "te", "kn", "gu", "bn", "or", "ml"] as const;
type Lang = typeof SUPPORTED_LANGS[number];

const LANG_NAME: Record<Lang, string> = {
  en: "English",
  hi: "Hindi (Devanagari script)",
  mr: "Marathi (Devanagari script)",
  pa: "Punjabi (Gurmukhi script)",
  ta: "Tamil script",
  te: "Telugu script",
  kn: "Kannada script",
  gu: "Gujarati script",
  bn: "Bengali script",
  or: "Odia script",
  ml: "Malayalam script",
};

function pickLang(input: unknown, fallback: Lang = "en"): Lang {
  const v = String(input || "").toLowerCase().slice(0, 2);
  return (SUPPORTED_LANGS as readonly string[]).includes(v) ? (v as Lang) : fallback;
}

function getLocalized(alert: Record<string, any>, field: string, lang: Lang): string {
  return (
    alert[`${field}_${lang}`] ||
    alert[`${field}_en`] ||
    alert[`${field}_hi`] ||
    alert[`${field}_mr`] ||
    ""
  ).toString().trim();
}

// Deterministic, no-LLM fallback question — guaranteed safe + multilingual.
function deterministicQuestion(alert: Record<string, any>, lang: Lang, landName: string): string {
  const title = getLocalized(alert, "title", lang) || alert.title_en || alert.alert_category;
  const land = landName || "";
  const templates: Record<Lang, (t: string, l: string) => string> = {
    en: (t, l) => l ? `What should I do about "${t}" on ${l}?` : `What should I do about "${t}"?`,
    hi: (t, l) => l ? `${l} पर "${t}" के लिए मुझे क्या करना चाहिए?` : `"${t}" के लिए मुझे क्या करना चाहिए?`,
    mr: (t, l) => l ? `${l} वर "${t}" साठी मी काय करावे?` : `"${t}" साठी मी काय करावे?`,
    pa: (t, l) => l ? `${l} ਉੱਤੇ "${t}" ਲਈ ਮੈਨੂੰ ਕੀ ਕਰਨਾ ਚਾਹੀਦਾ ਹੈ?` : `"${t}" ਲਈ ਮੈਨੂੰ ਕੀ ਕਰਨਾ ਚਾਹੀਦਾ ਹੈ?`,
    ta: (t, l) => l ? `${l}-இல் "${t}" குறித்து நான் என்ன செய்ய வேண்டும்?` : `"${t}" குறித்து நான் என்ன செய்ய வேண்டும்?`,
    te: (t, l) => l ? `${l}లో "${t}" గురించి నేను ఏమి చేయాలి?` : `"${t}" గురించి నేను ఏమి చేయాలి?`,
    kn: (t, l) => l ? `${l} ನಲ್ಲಿ "${t}" ಕುರಿತು ನಾನು ಏನು ಮಾಡಬೇಕು?` : `"${t}" ಕುರಿತು ನಾನು ಏನು ಮಾಡಬೇಕು?`,
    gu: (t, l) => l ? `${l} પર "${t}" માટે મારે શું કરવું જોઈએ?` : `"${t}" માટે મારે શું કરવું જોઈએ?`,
    bn: (t, l) => l ? `${l}-এ "${t}" সম্পর্কে আমার কী করা উচিত?` : `"${t}" সম্পর্কে আমার কী করা উচিত?`,
    or: (t, l) => l ? `${l}ରେ "${t}" ପାଇଁ ମୁଁ କଣ କରିବି?` : `"${t}" ପାଇଁ ମୁଁ କଣ କରିବି?`,
    ml: (t, l) => l ? `${l}-ൽ "${t}" നെക്കുറിച്ച് ഞാൻ എന്ത് ചെയ്യണം?` : `"${t}" നെക്കുറിച്ച് ഞാൻ എന്ത് ചെയ്യണം?`,
  };
  return templates[lang](title, land);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Caller-context client (validates JWT)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const alertId = String(body.alertId || "").trim();
    if (!alertId) return json({ error: "alertId required" }, 400);

    // Service client for cross-table reads (farmer ownership enforced manually)
    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve farmer for this user. In this schema, `farmers.user_profile_id`
    // is the auth user id (user_profiles.id == auth.users.id).
    const { data: farmer } = await admin
      .from("farmers")
      .select("id, language_preference, tenant_id")
      .eq("user_profile_id", userId)
      .maybeSingle();

    if (!farmer) return json({ error: "Farmer profile not found" }, 403);

    // Load alert — MUST belong to this farmer
    const { data: alert, error: alertErr } = await admin
      .from("proactive_alerts")
      .select("*")
      .eq("id", alertId)
      .eq("farmer_id", farmer.id)
      .maybeSingle();

    if (alertErr || !alert) {
      return json({ error: "Alert not found" }, 404);
    }

    const lang: Lang = pickLang(body.language || farmer.language_preference, "en");

    // Land + crop come from the JOINED `lands` row, not from proactive_alerts.
    let landName = "";
    let cropName: string | null = null;
    if (alert.land_id) {
      const { data: land } = await admin
        .from("lands")
        .select("name, current_crop")
        .eq("id", alert.land_id)
        .maybeSingle();
      if (land) {
        landName = (land.name || "").toString().trim();
        cropName = land.current_crop ? String(land.current_crop) : null;
      }
    }

    // Inject land/crop into the alert object so the deterministic fallback
    // (which references alert.title etc.) has full context too.
    const enrichedAlert = { ...alert, land_name: landName, crop_name: cropName };

    // Build authoritative agronomic context from Decision-Brain row (NO INVENTION)
    const ctx = {
      land_name: landName,
      crop: cropName,
      category: alert.alert_category,
      priority: alert.priority,
      title: getLocalized(alert, "title", lang),
      message: getLocalized(alert, "message", lang),
      action: getLocalized(alert, "action_text", lang),
      decision_reasoning: alert.decision_reasoning || null,
      trigger_data: alert.trigger_data || null,
    };

    // Always-available safe answer
    const fallback = deterministicQuestion(enrichedAlert, lang, landName);

    // LLM narration (translation + simplification ONLY)
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return json({ question: fallback, language: lang, source: "fallback" });
    }

    const sys = [
      "You are a NARRATOR for an agronomic advisory system. You DO NOT invent agronomy.",
      "Your only job is to convert the structured agronomic facts below into ONE short,",
      "simple, conversational question that a rural Indian farmer would naturally ask",
      "their advisor when reading this alert on their phone.",
      "",
      "STRICT RULES:",
      `1. Output ONLY the question, in ${LANG_NAME[lang]}. No greetings, no preamble, no English fallback.`,
      "2. Maximum 18 words. Single sentence. Must end with a question mark.",
      "3. Use simple, rural, everyday vocabulary the farmer actually uses.",
      "4. Mention the land name if available. Mention the crop if available.",
      "5. Do NOT include chemical names, dosages, or technical codes.",
      "6. Do NOT add quotes, markdown, emojis, or labels.",
    ].join("\n");

    const usr = `Alert facts (authoritative — do not contradict):\n${JSON.stringify(ctx, null, 2)}\n\nWrite the farmer's question now.`;

    let question = fallback;
    let source: "llm" | "fallback" = "fallback";

    try {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: usr },
          ],
        }),
      });

      if (aiResp.ok) {
        const aiJson = await aiResp.json();
        const raw = aiJson?.choices?.[0]?.message?.content?.toString().trim() || "";
        // Sanitize: strip surrounding quotes, take first line, cap length
        const cleaned = raw
          .replace(/^["'`]+|["'`]+$/g, "")
          .split("\n")[0]
          .trim()
          .slice(0, 240);

        // Validate: must end with a question mark of some script
        const endsWithQ = /[?؟।]$/.test(cleaned) || cleaned.endsWith("?");
        if (cleaned && cleaned.length >= 6 && endsWithQ) {
          question = cleaned;
          source = "llm";
        }
      } else if (aiResp.status === 429 || aiResp.status === 402) {
        console.warn(`[proactive-question-seed] AI gateway ${aiResp.status} — using fallback`);
      }
    } catch (e) {
      console.error("[proactive-question-seed] LLM call failed", e);
    }

    return json({ question, language: lang, source });
  } catch (e) {
    console.error("[proactive-question-seed] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
