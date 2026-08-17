// Proactive Alert → AI-Generated, Multilingual, Farmer-Friendly Question
// ----------------------------------------------------------------------
// Decision-Brain-FIRST. The LLM only NARRATES (translates + simplifies).
// All agronomic facts come from the `proactive_alerts` row already produced
// by the symbolic engine. The LLM never invents agronomy.
//
// v2.0 — Action-aware question synthesis:
//   - Classifies primary_action (DIAGNOSTIC | IRRIGATION | NUTRITION | PROTECTION | MONITORING)
//     from `trigger_data.condition_code` + `alert_category`.
//   - Strips large numeric figures (lakhs of liters, hours) so the LLM cannot
//     anchor on irrigation math when the primary action is diagnostic.
//   - Deterministic fallback templates are also action-aware.
//
// Contract:
//   POST { alertId: string, landId?: string, language?: string }
//   → 200 { question: string, language: string, source: 'llm' | 'fallback', primary_action: string }
//   → 4xx { error }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-farmer-id, x-tenant-id",
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

type PrimaryAction = "DIAGNOSTIC" | "IRRIGATION" | "NUTRITION" | "PROTECTION" | "MONITORING";

function pickLang(input: unknown, fallback: Lang = "en"): Lang {
  const v = String(input || "").toLowerCase().slice(0, 2);
  return (SUPPORTED_LANGS as readonly string[]).includes(v) ? (v as Lang) : fallback;
}

function getLocalized(obj: Record<string, any> | null | undefined, field: string, lang: Lang): string {
  if (!obj) return "";
  return (
    obj[`${field}_${lang}`] ||
    obj[`${field}_en`] ||
    obj[`${field}_hi`] ||
    obj[`${field}_mr`] ||
    ""
  ).toString().trim();
}

// Classify the PRIMARY action expected of the farmer.
// Decision-Brain `condition_code` is the SSOT; `alert_category` is a coarse fallback.
function classifyPrimaryAction(alert: Record<string, any>): PrimaryAction {
  const code = String(alert?.trigger_data?.condition_code || "").toUpperCase();
  const cat = String(alert?.alert_category || "").toUpperCase();

  // Highest priority: explicit diagnostic conditions where water is ruled out
  if (
    code.includes("NDVI_NON_RECOVERY") ||
    code.includes("NON_RECOVERY") ||
    code.includes("PEST") ||
    code.includes("DISEASE") ||
    code.includes("BORER") ||
    code.includes("WILT") ||
    code.includes("ROT") ||
    code.includes("SMUT") ||
    code.includes("DAMAGE")
  ) {
    return "DIAGNOSTIC";
  }
  if (code.includes("IRRIGATION") || code.includes("WATER_STRESS") || code.includes("DROUGHT")) {
    return "IRRIGATION";
  }
  if (code.includes("FERTILIZER") || code.includes("NUTRIENT") || code.includes("DEFICIENCY") || cat === "FERTILIZER_WINDOW") {
    return "NUTRITION";
  }
  if (code.includes("SPRAY") || code.includes("PROTECTION") || code.includes("PROPHYLACTIC")) {
    return "PROTECTION";
  }
  // CROP_STRESS without a specific code → diagnostic by default (safer than irrigation)
  if (cat === "CROP_STRESS") return "DIAGNOSTIC";
  if (cat === "IRRIGATION") return "IRRIGATION";
  return "MONITORING";
}

// Strip large numeric anchors that bias the LLM toward irrigation phrasing
function stripNumericAnchors(s: string): string {
  if (!s) return "";
  return s
    // Remove "2,436,861 liters" / "24,36,861 लिटर" style figures
    .replace(/[\d,]{4,}\s*(liters?|लिटर|लीटर|லிட்டர்|లీటర్|ਲੀਟਰ|લિટર|লিটার|ଲିଟର|ലിറ്റർ)/giu, "")
    // Remove "81.2 hours" / "81.2 तास" style figures
    .replace(/\d+(\.\d+)?\s*(hours?|hrs?|तास|घंटे|hr|घ\.|மணி|గంట|ਘੰਟੇ|કલાક|ঘণ্টা|ଘଣ୍ଟା|മണിക്കൂർ)/giu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Action-aware deterministic fallback templates
function deterministicQuestion(
  alert: Record<string, any>,
  lang: Lang,
  landName: string,
  primary: PrimaryAction
): string {
  const title = getLocalized(alert, "title", lang) || alert.title_en || alert.alert_category || "";
  const cleanTitle = stripNumericAnchors(title).replace(/[🌡️⚠️⛔🐝🌿💊📊🎯]/gu, "").trim();
  const land = landName || "";

  // Action-specific phrasing key
  const verb: Record<PrimaryAction, Record<Lang, string>> = {
    DIAGNOSTIC: {
      en: `What is wrong with my crop on ${land || "the field"}? How should I inspect it?`,
      hi: `${land ? land + " में " : ""}मेरी फसल को क्या समस्या है? कैसे जांच करूं?`,
      mr: `${land ? land + " शेतातील " : ""}माझ्या पिकाला काय झाले आहे? कशी तपासणी करू?`,
      pa: `${land ? land + " ਵਿੱਚ " : ""}ਮੇਰੀ ਫਸਲ ਨੂੰ ਕੀ ਹੋਇਆ ਹੈ? ਕਿਵੇਂ ਜਾਂਚ ਕਰਾਂ?`,
      ta: `${land ? land + "-இல் " : ""}என் பயிருக்கு என்ன பிரச்சினை? எப்படி பரிசோதிக்க வேண்டும்?`,
      te: `${land ? land + "లో " : ""}నా పంటకు ఏం సమస్య? ఎలా పరీక్షించాలి?`,
      kn: `${land ? land + " ನಲ್ಲಿ " : ""}ನನ್ನ ಬೆಳೆಗೆ ಏನು ಸಮಸ್ಯೆ? ಹೇಗೆ ಪರಿಶೀಲಿಸಬೇಕು?`,
      gu: `${land ? land + " માં " : ""}મારા પાકને શું થયું છે? કેવી રીતે તપાસું?`,
      bn: `${land ? land + "-এ " : ""}আমার ফসলের কী সমস্যা? কীভাবে পরীক্ষা করব?`,
      or: `${land ? land + "ରେ " : ""}ମୋର ଫସଲରେ କଣ ସମସ୍ୟା? କିପରି ପରୀକ୍ଷା କରିବି?`,
      ml: `${land ? land + "-ൽ " : ""}എന്റെ വിളയ്ക്ക് എന്താണ് കുഴപ്പം? എങ്ങനെ പരിശോധിക്കണം?`,
    },
    IRRIGATION: {
      en: `${land ? `On ${land}, ` : ""}does my crop need irrigation now? How much water should I give?`,
      hi: `${land ? land + " पर " : ""}क्या अभी सिंचाई करनी चाहिए? कितना पानी दूं?`,
      mr: `${land ? land + " वर " : ""}आता पाणी द्यायला हवं का? किती पाणी द्यावे?`,
      pa: `${land ? land + " ਉੱਤੇ " : ""}ਕੀ ਹੁਣ ਸਿੰਚਾਈ ਕਰਨੀ ਚਾਹੀਦੀ ਹੈ? ਕਿੰਨਾ ਪਾਣੀ ਦੇਵਾਂ?`,
      ta: `${land ? land + "-இல் " : ""}இப்போது நீர்ப்பாசனம் தேவையா? எவ்வளவு தண்ணீர்?`,
      te: `${land ? land + "లో " : ""}ఇప్పుడు నీటి పారుదల అవసరమా? ఎంత నీరు ఇవ్వాలి?`,
      kn: `${land ? land + " ನಲ್ಲಿ " : ""}ಈಗ ನೀರಾವರಿ ಬೇಕೇ? ಎಷ್ಟು ನೀರು ಕೊಡಬೇಕು?`,
      gu: `${land ? land + " પર " : ""}અત્યારે પિયત જોઈએ? કેટલું પાણી આપું?`,
      bn: `${land ? land + "-এ " : ""}এখন কি সেচ দরকার? কতটা জল দেব?`,
      or: `${land ? land + "ରେ " : ""}ବର୍ତ୍ତମାନ ଜଳସେଚନ ଦରକାର କି? କେତେ ପାଣି?`,
      ml: `${land ? land + "-ൽ " : ""}ഇപ്പോൾ ജലസേചനം വേണോ? എത്ര വെള്ളം?`,
    },
    NUTRITION: {
      en: `${land ? `On ${land}, ` : ""}what fertilizer should I apply now and how much?`,
      hi: `${land ? land + " पर " : ""}अब कौन सा खाद दूं और कितनी मात्रा?`,
      mr: `${land ? land + " वर " : ""}आता कोणते खत द्यावे आणि किती?`,
      pa: `${land ? land + " ਉੱਤੇ " : ""}ਹੁਣ ਕਿਹੜੀ ਖਾਦ ਪਾਵਾਂ ਅਤੇ ਕਿੰਨੀ?`,
      ta: `${land ? land + "-இல் " : ""}இப்போது என்ன உரம், எவ்வளவு போடணும்?`,
      te: `${land ? land + "లో " : ""}ఇప్పుడు ఏ ఎరువు, ఎంత వేయాలి?`,
      kn: `${land ? land + " ನಲ್ಲಿ " : ""}ಈಗ ಯಾವ ಗೊಬ್ಬರ, ಎಷ್ಟು ಹಾಕಬೇಕು?`,
      gu: `${land ? land + " પર " : ""}હવે કયો ખાતર, કેટલો આપું?`,
      bn: `${land ? land + "-এ " : ""}এখন কোন সার, কত দেব?`,
      or: `${land ? land + "ରେ " : ""}ବର୍ତ୍ତମାନ କେଉଁ ସାର, କେତେ ଦେବି?`,
      ml: `${land ? land + "-ൽ " : ""}ഇപ്പോൾ ഏത് വളം, എത്ര ഇടണം?`,
    },
    PROTECTION: {
      en: `${land ? `On ${land}, ` : ""}what protection or spray should I do now?`,
      hi: `${land ? land + " पर " : ""}अब क्या छिड़काव करूं?`,
      mr: `${land ? land + " वर " : ""}आता कोणती फवारणी करावी?`,
      pa: `${land ? land + " ਉੱਤੇ " : ""}ਹੁਣ ਕਿਹੜੀ ਛਿੜਕਾਅ ਕਰਾਂ?`,
      ta: `${land ? land + "-இல் " : ""}இப்போது என்ன மருந்து தெளிக்க வேண்டும்?`,
      te: `${land ? land + "లో " : ""}ఇప్పుడు ఏ స్ప్రే చేయాలి?`,
      kn: `${land ? land + " ನಲ್ಲಿ " : ""}ಈಗ ಯಾವ ಸಿಂಪರಣೆ ಮಾಡಬೇಕು?`,
      gu: `${land ? land + " પર " : ""}હવે કયો છંટકાવ કરું?`,
      bn: `${land ? land + "-এ " : ""}এখন কী স্প্রে করব?`,
      or: `${land ? land + "ରେ " : ""}ବର୍ତ୍ତମାନ କେଉଁ ସ୍ପ୍ରେ କରିବି?`,
      ml: `${land ? land + "-ൽ " : ""}ഇപ്പോൾ എന്ത് സ്പ്രേ ചെയ്യണം?`,
    },
    MONITORING: {
      en: `${land ? `For ${land}, ` : ""}what should I do about "${cleanTitle}"?`,
      hi: `${land ? land + " के लिए, " : ""}"${cleanTitle}" के लिए मुझे क्या करना चाहिए?`,
      mr: `${land ? land + " साठी, " : ""}"${cleanTitle}" साठी मी काय करावे?`,
      pa: `${land ? land + " ਲਈ, " : ""}"${cleanTitle}" ਲਈ ਮੈਨੂੰ ਕੀ ਕਰਨਾ ਚਾਹੀਦਾ ਹੈ?`,
      ta: `${land ? land + "-க்கு, " : ""}"${cleanTitle}" குறித்து என்ன செய்ய வேண்டும்?`,
      te: `${land ? land + " కోసం, " : ""}"${cleanTitle}" గురించి ఏమి చేయాలి?`,
      kn: `${land ? land + " ಗಾಗಿ, " : ""}"${cleanTitle}" ಬಗ್ಗೆ ಏನು ಮಾಡಬೇಕು?`,
      gu: `${land ? land + " માટે, " : ""}"${cleanTitle}" માટે શું કરું?`,
      bn: `${land ? land + "-এর জন্য, " : ""}"${cleanTitle}" নিয়ে কী করব?`,
      or: `${land ? land + " ପାଇଁ, " : ""}"${cleanTitle}" ପାଇଁ କଣ କରିବି?`,
      ml: `${land ? land + "-നായി, " : ""}"${cleanTitle}" നെക്കുറിച്ച് എന്ത് ചെയ്യണം?`,
    },
  };
  return verb[primary][lang];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Custom auth: this app identifies the caller via x-farmer-id + x-tenant-id headers.
    const farmerIdHeader = (req.headers.get("x-farmer-id") || "").trim();
    const tenantIdHeader = (req.headers.get("x-tenant-id") || "").trim();
    if (!farmerIdHeader || !tenantIdHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim();
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: farmer } = await admin
      .from("farmers")
      .select("id, language_preference, tenant_id")
      .eq("id", farmerIdHeader)
      .eq("tenant_id", tenantIdHeader)
      .maybeSingle();

    if (!farmer) return json({ error: "Farmer profile not found" }, 403);

    // ── One-tap germination answer (GERMINATION template) ────────────────
    // The tap is written by the DB RPC `record_germination`, the only writer
    // of GERMINATION_CONFIRMED / GERMINATION_NOT_OBSERVED lifecycle events.
    if (action === "germination_answer") {
      const answerLang: Lang = pickLang(body.language || farmer.language_preference, "en");
      return await handleGerminationAnswer(admin, {
        farmerId: farmer.id,
        tenantId: tenantIdHeader,
        landId: String(body.landId || "").trim(),
        alertId: String(body.alertId || "").trim() || null,
        confirmed: body.confirmed === true,
        lang: answerLang,
      });
    }

    const alertId = String(body.alertId || "").trim();
    if (!alertId) return json({ error: "alertId required" }, 400);


    const { data: alert, error: alertErr } = await admin
      .from("proactive_alerts")
      .select("*")
      .eq("id", alertId)
      .eq("farmer_id", farmer.id)
      .maybeSingle();

    if (alertErr || !alert) return json({ error: "Alert not found" }, 404);

    const lang: Lang = pickLang(body.language || farmer.language_preference, "en");

    // ── GERMINATION template: deterministic, one-tap, DB-authored ─────────
    if (String(alert?.trigger_data?.question?.type || "") === "GERMINATION_CHECK") {
      const q = getLocalized(alert, "message", lang) || getLocalized(alert, "title", lang);
      const opts = (alert.trigger_data.question.options || []).map((o: any) => ({
        key: o.key,
        confirmed: o.confirmed === true,
        label: o[`label_${lang}`] || o.label_en || o.key,
      }));
      return json({
        question: q,
        language: lang,
        source: "fallback",
        primary_action: "MONITORING",
        template: "GERMINATION_CHECK",
        land_id: alert.land_id,
        options: opts,
      });
    }


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

    // ─── Decision-Brain SSOT extraction ────────────────────────────────────
    const primary = classifyPrimaryAction(alert);
    const triggerData = alert.trigger_data || {};
    const solution = triggerData.solution || {};

    const enrichedAlert = { ...alert, land_name: landName, crop_name: cropName };

    // Always-available safe answer (action-aware)
    const fallback = deterministicQuestion(enrichedAlert, lang, landName, primary);

    console.log(`[proactive-question-seed] alert=${alertId} category=${alert.alert_category} condition=${triggerData.condition_code || "n/a"} primary_action=${primary} lang=${lang}`);

    // ─── LLM narration (translation + simplification ONLY) ─────────────────
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return json({ question: fallback, language: lang, source: "fallback", primary_action: primary });
    }

    // Build authoritative facts WITHOUT numeric anchors that bias the LLM
    const ctx = {
      land_name: landName,
      crop: cropName,
      category: alert.alert_category,
      priority: alert.priority,
      condition_code: triggerData.condition_code || null,
      ndvi: typeof triggerData.ndvi === "number" ? triggerData.ndvi : null,
      primary_action: primary,
      title: stripNumericAnchors(getLocalized(alert, "title", lang)),
      problem: stripNumericAnchors(getLocalized(solution, "problem", lang)),
      cause: stripNumericAnchors(getLocalized(solution, "cause", lang)),
      // Intentionally NOT passing `message_<lang>`, `action_text_<lang>`, or `irrigation`
      // because those embed large numbers / specific dosages that anchor the LLM.
    };

    const actionGuidance: Record<PrimaryAction, string> = {
      DIAGNOSTIC:
        "The farmer must ask WHAT IS WRONG with the crop and HOW TO INSPECT IT (pest/disease/nutrient diagnosis). DO NOT phrase it as an irrigation, fertilizer, or spray question.",
      IRRIGATION:
        "The farmer must ask whether and how much to IRRIGATE. Do not ask about pests or fertilizer.",
      NUTRITION:
        "The farmer must ask WHICH FERTILIZER and HOW MUCH. Do not ask about irrigation or pests.",
      PROTECTION:
        "The farmer must ask WHAT SPRAY / PROTECTION to apply. Do not ask about irrigation or fertilizer.",
      MONITORING:
        "The farmer must ask WHAT TO DO ABOUT this condition. Keep it open-ended.",
    };

    const sys = [
      "You are a NARRATOR for an agronomic advisory system. You DO NOT invent agronomy.",
      "Your only job is to convert the structured agronomic facts below into ONE short,",
      "simple, conversational question that a rural Indian farmer would naturally ask",
      "their advisor when reading this alert on their phone.",
      "",
      "STRICT RULES:",
      `1. Output ONLY the question, in ${LANG_NAME[lang]}. No greetings, no preamble, no English fallback.`,
      "2. Maximum 22 words. Single sentence. Must end with a question mark.",
      "3. Use simple, rural, everyday vocabulary the farmer actually uses.",
      "4. Mention the land name if available. Mention the crop if available.",
      "5. Do NOT include chemical names, dosages, liter amounts, or hours.",
      "6. Do NOT add quotes, markdown, emojis, or labels.",
      "",
      "PRIMARY ACTION RULE (CRITICAL — DO NOT VIOLATE):",
      `The primary_action for this alert is "${primary}". ${actionGuidance[primary]}`,
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
        const cleaned = raw
          .replace(/^["'`]+|["'`]+$/g, "")
          .split("\n")[0]
          .trim()
          .slice(0, 280);

        const endsWithQ = /[?؟।]$/.test(cleaned) || cleaned.endsWith("?");

        // Validate the LLM didn't violate the primary_action rule for DIAGNOSTIC alerts.
        // If the LLM produced an irrigation/water question for a DIAGNOSTIC alert, reject it.
        const violatesDiagnostic =
          primary === "DIAGNOSTIC" &&
          /(irrigat|पाणी|पाट पाणी|पानी|water|सिंचाई|நீர்|నీరు|ਪਾਣੀ|પાણી|জল|ପାଣି|വെള്ളം)/iu.test(cleaned);

        if (cleaned && cleaned.length >= 6 && endsWithQ && !violatesDiagnostic) {
          question = cleaned;
          source = "llm";
        } else if (violatesDiagnostic) {
          console.warn(`[proactive-question-seed] LLM violated DIAGNOSTIC rule, using fallback. Got: ${cleaned}`);
        }
      } else if (aiResp.status === 429 || aiResp.status === 402) {
        console.warn(`[proactive-question-seed] AI gateway ${aiResp.status} — using fallback`);
      }
    } catch (e) {
      console.error("[proactive-question-seed] LLM call failed", e);
    }

    return json({ question, language: lang, source, primary_action: primary });
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

// =====================================================
// GERMINATION one-tap answer
// "Yes" / "No" → public.record_germination (SSOT writer).
// A "No" additionally surfaces a POSSIBLE_ESTABLISHMENT_FAILURE alert that
// carries needs_diagnosis so the advisory brain picks it up. Every farmer
// facing string comes from `ui_translations` — nothing is hardcoded here.
// =====================================================
async function loadUiText(admin: any, prefix: string): Promise<(key: string, lang: string) => string> {
  const map = new Map<string, string>();
  const { data } = await admin
    .from("ui_translations")
    .select("ui_key, language_code, display_text")
    .like("ui_key", `${prefix}%`);
  for (const r of data || []) {
    map.set(`${r.ui_key}|${String(r.language_code).toLowerCase()}`, r.display_text);
  }
  return (key: string, lang: string) => map.get(`${key}|${lang}`) ?? map.get(`${key}|en`) ?? "";
}

function fillVars(text: string, vars: Record<string, string>): string {
  return (text || "").replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? "");
}

async function handleGerminationAnswer(
  admin: any,
  args: {
    farmerId: string;
    tenantId: string;
    landId: string;
    alertId: string | null;
    confirmed: boolean;
    lang: Lang;
  },
): Promise<Response> {
  const { farmerId, landId, alertId, confirmed, lang } = args;
  if (!landId) return json({ error: "landId required" }, 400);

  const { data: land } = await admin
    .from("lands")
    .select("id, name, farmer_id, tenant_id")
    .eq("id", landId)
    .maybeSingle();
  if (!land || land.farmer_id !== farmerId) return json({ error: "Land not found" }, 403);

  const observedDate = new Date().toISOString().slice(0, 10);
  const { error: rpcErr } = await admin.rpc("record_germination", {
    p_land_id: landId,
    p_confirmed: confirmed,
    p_observed_date: observedDate,
  });
  if (rpcErr) {
    console.error("[proactive-question-seed] record_germination failed", rpcErr.message);
    return json({ error: rpcErr.message }, 500);
  }

  if (alertId) {
    await admin
      .from("proactive_alerts")
      .update({ status: "ACTED", acted_at: new Date().toISOString() })
      .eq("id", alertId)
      .eq("farmer_id", farmerId);
  }

  const ui = await loadUiText(admin, "germination.");
  let followUpAlertId: string | null = null;

  if (!confirmed) {
    const vars = { land: (land.name || "").toString() };
    const dedupKey = `GERM_FAIL:${landId}:${observedDate}`;
    const { data: inserted } = await admin
      .from("proactive_alerts")
      .upsert(
        [{
          tenant_id: land.tenant_id,
          land_id: landId,
          farmer_id: farmerId,
          rule_id: "POSSIBLE_ESTABLISHMENT_FAILURE",
          alert_category: "CROP_STRESS",
          priority: "HIGH",
          title_en: ui("germination.failure.title", "en"),
          title_hi: ui("germination.failure.title", "hi"),
          title_mr: ui("germination.failure.title", "mr"),
          message_en: fillVars(ui("germination.failure.body", "en"), vars),
          message_hi: fillVars(ui("germination.failure.body", "hi"), vars),
          message_mr: fillVars(ui("germination.failure.body", "mr"), vars),
          action_text_en: ui("germination.failure.action", "en"),
          action_text_hi: ui("germination.failure.action", "hi"),
          action_text_mr: ui("germination.failure.action", "mr"),
          risk_score: 70,
          confidence: 0.9,
          trigger_data: {
            condition_code: "POSSIBLE_ESTABLISHMENT_FAILURE",
            needs_diagnosis: true,
            observed_date: observedDate,
            source: "farmer_one_tap",
          },
          decision_reasoning: "farmer reported no emergence at the germination gate prompt",
          status: "PENDING",
          dedup_key: dedupKey,
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        }],
        { onConflict: "dedup_key", ignoreDuplicates: true },
      )
      .select("id");
    followUpAlertId = inserted?.[0]?.id ?? null;
  }

  console.log(`[GERM_ANSWER] land=${landId.slice(0, 8)} confirmed=${confirmed} followup=${followUpAlertId || "none"}`);

  return json({
    ok: true,
    confirmed,
    message: ui("germination.answered", lang),
    needs_diagnosis: !confirmed,
    follow_up_alert_id: followUpAlertId,
  });
}
