-- Seed voice_navigation_intents table with all 14 Indian languages
-- Using proper JSONB format for patterns column

DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Get first available tenant
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    v_tenant_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;

  -- Delete existing intents
  DELETE FROM voice_navigation_intents;

  -- English intents
  INSERT INTO voice_navigation_intents (tenant_id, intent_id, language_code, patterns, action, route, priority, is_offline, response_template, is_active) VALUES
  (v_tenant_id, 'navigate.home', 'en', '["go home", "take me home", "open home", "home screen", "main page"]'::jsonb, 'navigate', '/app', 'high', true, '{"en": "Opening home"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'en', '["show my lands", "open lands", "view my farms", "my fields"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"en": "Showing lands"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'en', '["show weather", "weather", "weather forecast", "check weather"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"en": "Opening weather"}'::jsonb, true),
  (v_tenant_id, 'navigate.schedule', 'en', '["show schedule", "my tasks", "open calendar", "farming schedule"]'::jsonb, 'navigate', '/app/schedule', 'high', true, '{"en": "Opening schedule"}'::jsonb, true),
  (v_tenant_id, 'navigate.chat', 'en', '["open chat", "talk to assistant", "ai assistant", "help me"]'::jsonb, 'navigate', '/app/chat', 'high', false, '{"en": "Opening chat"}'::jsonb, true),
  (v_tenant_id, 'navigate.market', 'en', '["open market", "marketplace", "buy products", "sell crops"]'::jsonb, 'navigate', '/app/market', 'medium', true, '{"en": "Opening market"}'::jsonb, true),
  (v_tenant_id, 'navigate.profile', 'en', '["my profile", "open profile", "account settings"]'::jsonb, 'navigate', '/app/profile', 'medium', true, '{"en": "Opening profile"}'::jsonb, true),
  (v_tenant_id, 'navigate.community', 'en', '["open community", "social feed", "farmer community"]'::jsonb, 'navigate', '/app/social', 'medium', false, '{"en": "Opening community"}'::jsonb, true);

  -- Hindi intents
  INSERT INTO voice_navigation_intents (tenant_id, intent_id, language_code, patterns, action, route, priority, is_offline, response_template, is_active) VALUES
  (v_tenant_id, 'navigate.home', 'hi', '["घर जाओ", "होम खोलो", "मुख्य पेज", "मुख्य स्क्रीन"]'::jsonb, 'navigate', '/app', 'high', true, '{"hi": "होम खोल रहा हूं"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'hi', '["मेरी जमीन दिखाओ", "खेत खोलो", "मेरे खेत", "जमीन देखो"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"hi": "जमीन दिखा रहा हूं"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'hi', '["मौसम दिखाओ", "मौसम कैसा है", "मौसम देखो", "आज का मौसम"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"hi": "मौसम खोल रहा हूं"}'::jsonb, true),
  (v_tenant_id, 'navigate.schedule', 'hi', '["कार्यक्रम दिखाओ", "मेरे काम", "समय सारिणी खोलो", "आज के काम"]'::jsonb, 'navigate', '/app/schedule', 'high', true, '{"hi": "कार्यक्रम खोल रहा हूं"}'::jsonb, true),
  (v_tenant_id, 'navigate.chat', 'hi', '["चैट खोलो", "सहायक से बात करो", "मदद करो", "सवाल पूछो"]'::jsonb, 'navigate', '/app/chat', 'high', false, '{"hi": "चैट खोल रहा हूं"}'::jsonb, true),
  (v_tenant_id, 'navigate.market', 'hi', '["बाजार खोलो", "बाजार दिखाओ", "फसल बेचो", "बाजार के भाव"]'::jsonb, 'navigate', '/app/market', 'medium', true, '{"hi": "बाजार खोल रहा हूं"}'::jsonb, true),
  (v_tenant_id, 'navigate.profile', 'hi', '["मेरी प्रोफ़ाइल", "प्रोफ़ाइल खोलो", "खाता सेटिंग"]'::jsonb, 'navigate', '/app/profile', 'medium', true, '{"hi": "प्रोफ़ाइल खोल रहा हूं"}'::jsonb, true),
  (v_tenant_id, 'navigate.community', 'hi', '["समुदाय खोलो", "सोशल फीड", "किसान समुदाय"]'::jsonb, 'navigate', '/app/social', 'medium', false, '{"hi": "समुदाय खोल रहा हूं"}'::jsonb, true);

  -- Marathi
  INSERT INTO voice_navigation_intents (tenant_id, intent_id, language_code, patterns, action, route, priority, is_offline, response_template, is_active) VALUES
  (v_tenant_id, 'navigate.home', 'mr', '["घरी जा", "होम उघडा", "मुख्य पृष्ठ", "मुख्य स्क्रीन"]'::jsonb, 'navigate', '/app', 'high', true, '{"mr": "होम उघडत आहे"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'mr', '["माझी जमीन दाखवा", "शेत उघडा", "माझी शेते", "जमीन पहा"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"mr": "जमीन दाखवत आहे"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'mr', '["हवामान दाखवा", "हवामान कसे आहे", "हवामान पहा", "आजचे हवामान"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"mr": "हवामान उघडत आहे"}'::jsonb, true),
  (v_tenant_id, 'navigate.schedule', 'mr', '["वेळापत्रक दाखवा", "माझी कामे", "वेळापत्रक उघडा", "आजची कामे"]'::jsonb, 'navigate', '/app/schedule', 'high', true, '{"mr": "वेळापत्रक उघडत आहे"}'::jsonb, true),
  (v_tenant_id, 'navigate.market', 'mr', '["बाजार उघडा", "बाजार दाखवा", "पीक विका", "बाजार भाव"]'::jsonb, 'navigate', '/app/market', 'medium', true, '{"mr": "बाजार उघडत आहे"}'::jsonb, true);

  -- Tamil
  INSERT INTO voice_navigation_intents (tenant_id, intent_id, language_code, patterns, action, route, priority, is_offline, response_template, is_active) VALUES
  (v_tenant_id, 'navigate.home', 'ta', '["வீட்டிற்கு செல்", "முகப்பை திற", "முதன்மை பக்கம்", "முதன்மை திரை"]'::jsonb, 'navigate', '/app', 'high', true, '{"ta": "முகப்பு திறக்கிறது"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'ta', '["என் நிலங்களை காட்டு", "வயல்களை திற", "என் நிலங்கள்", "நிலத்தை பார்"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"ta": "நிலங்களை காட்டுகிறது"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'ta', '["வானிலையை காட்டு", "வானிலை எப்படி", "வானிலையை பார்", "இன்றைய வானிலை"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"ta": "வானிலையை திறக்கிறது"}'::jsonb, true),
  (v_tenant_id, 'navigate.schedule', 'ta', '["அட்டவணையை காட்டு", "என் பணிகள்", "அட்டவணையை திற", "இன்றைய பணிகள்"]'::jsonb, 'navigate', '/app/schedule', 'high', true, '{"ta": "அட்டவணையை திறக்கிறது"}'::jsonb, true);

  -- Punjabi, Telugu, Bengali, Malayalam, Sanskrit, Gujarati, Odia, Assamese, Kannada, Urdu
  INSERT INTO voice_navigation_intents (tenant_id, intent_id, language_code, patterns, action, route, priority, is_offline, response_template, is_active) VALUES
  (v_tenant_id, 'navigate.home', 'pa', '["ਘਰ ਦਿਖਾਓ", "ਮੁੱਖ ਪੰਨਾ", "ਘਰ ਜਾਓ", "ਡੈਸ਼ਬੋਰਡ"]'::jsonb, 'navigate', '/app', 'high', true, '{"pa": "ਹੋਮ ਖੋਲ੍ਹ ਰਿਹਾ"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'pa', '["ਮੇਰੀ ਜ਼ਮੀਨ", "ਜ਼ਮੀਨ ਦਿਖਾਓ", "ਖੇਤ ਦਿਖਾਓ"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"pa": "ਜ਼ਮੀਨ ਦਿਖਾ ਰਿਹਾ"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'pa', '["ਮੌਸਮ ਦੱਸੋ", "ਮੌਸਮ ਦਿਖਾਓ", "ਹਵਾ ਕਿਵੇਂ ਹੈ"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"pa": "ਮੌਸਮ ਖੋਲ੍ਹ ਰਿਹਾ"}'::jsonb, true),
  (v_tenant_id, 'navigate.schedule', 'pa', '["ਕਾਰਜਕ੍ਰਮ ਦਿਖਾਓ", "ਮੇਰੇ ਕੰਮ", "ਅੱਜ ਦੇ ਕੰਮ"]'::jsonb, 'navigate', '/app/schedule', 'high', true, '{"pa": "ਕਾਰਜਕ੍ਰਮ ਖੋਲ੍ਹ ਰਿਹਾ"}'::jsonb, true);

  INSERT INTO voice_navigation_intents (tenant_id, intent_id, language_code, patterns, action, route, priority, is_offline, response_template, is_active) VALUES
  (v_tenant_id, 'navigate.home', 'te', '["హోమ్ చూపించు", "మొదటి పేజీ", "హోమ్‌కు వెళ్ళు"]'::jsonb, 'navigate', '/app', 'high', true, '{"te": "హోమ్ తెరుస్తున్నాను"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'te', '["నా భూములు", "భూములు చూపించు", "పొలం చూపించు"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"te": "భూములను చూపిస్తున్నాను"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'te', '["వాతావరణం చెప్పు", "వాతావరణం చూపించు", "వాన పడుతుందా"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"te": "వాతావరణం తెరుస్తున్నాను"}'::jsonb, true),
  (v_tenant_id, 'navigate.home', 'bn', '["হোম দেখাও", "প্রথম পাতা", "হোমে যাও"]'::jsonb, 'navigate', '/app', 'high', true, '{"bn": "হোম খুলছি"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'bn', '["আমার জমি", "জমি দেখাও", "খামার দেখাও"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"bn": "জমি দেখাচ্ছি"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'bn', '["আবহাওয়া বলুন", "আবহাওয়া দেখাও", "বৃষ্টি হবে"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"bn": "আবহাওয়া খুলছি"}'::jsonb, true),
  (v_tenant_id, 'navigate.home', 'ml', '["ഹോം കാണിക്കുക", "പ്രധാന പേജ്", "ഹോമിലേക്ക് പോകുക"]'::jsonb, 'navigate', '/app', 'high', true, '{"ml": "ഹോം തുറക്കുന്നു"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'ml', '["എന്റെ ഭൂമി", "ഭൂമി കാണിക്കുക", "കൃഷിഭൂമി"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"ml": "ഭൂമി കാണിക്കുന്നു"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'ml', '["കാലാവസ്ഥ കാണിക്കുക", "മഴ പെയ്യുമോ", "ഇന്നത്തെ കാലാവസ്ഥ"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"ml": "കാലാവസ്ഥ തുറക്കുന്നു"}'::jsonb, true),
  (v_tenant_id, 'navigate.home', 'sa', '["गृहं दर्शयतु", "मुख्यपृष्ठम्", "गृहं गच्छतु"]'::jsonb, 'navigate', '/app', 'high', true, '{"sa": "गृहं प्रारभते"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'sa', '["मम भूमिः", "भूमिं दर्शयतु", "क्षेत्रं दर्शयतु"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"sa": "भूमिं दर्शयति"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'sa', '["वातावरणं दर्शयतु", "वर्षा भविष्यति", "अद्य वातावरणम्"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"sa": "वातावरणं प्रारभते"}'::jsonb, true),
  (v_tenant_id, 'navigate.home', 'gu', '["ઘર બતાવો", "મુખ્ય પૃષ્ઠ", "ઘર જાઓ"]'::jsonb, 'navigate', '/app', 'high', true, '{"gu": "હોમ ખોલી રહ્યા છીએ"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'gu', '["મારી જમીન", "જમીન બતાવો", "ખેતર બતાવો"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"gu": "જમીન બતાવી રહ્યા છીએ"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'gu', '["હવામાન બતાવો", "હવામાન કેવું છે", "વરસાદ આવશે"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"gu": "હવામાન ખોલી રહ્યા છીએ"}'::jsonb, true),
  (v_tenant_id, 'navigate.home', 'or', '["ଘର ଦେଖାଅ", "ମୁଖ୍ୟ ପୃଷ୍ଠା", "ଘରକୁ ଯାଅ"]'::jsonb, 'navigate', '/app', 'high', true, '{"or": "ହୋମ ଖୋଲୁଛି"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'or', '["ମୋର ଜମି", "ଜମି ଦେଖାଅ", "କ୍ଷେତ୍ର ଦେଖାଅ"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"or": "ଜମି ଦେଖାଉଛି"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'or', '["ପାଗ ଦେଖାଅ", "ପାଗ କେମିତି", "ବର୍ଷା ହେବ"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"or": "ପାଗ ଖୋଲୁଛି"}'::jsonb, true),
  (v_tenant_id, 'navigate.home', 'as', '["ঘৰ দেখুৱাওক", "মুখ্য পৃষ্ঠা", "ঘৰলৈ যাওক"]'::jsonb, 'navigate', '/app', 'high', true, '{"as": "হোম খুলিছে"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'as', '["মোৰ মাটি", "মাটি দেখুৱাওক", "খেতি দেখুৱাওক"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"as": "মাটি দেখুৱাইছে"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'as', '["বতৰ দেখুৱাওক", "বতৰ কেনে আছে", "বৰষুণ হব"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"as": "বতৰ খুলিছে"}'::jsonb, true),
  (v_tenant_id, 'navigate.home', 'kn', '["ಮನೆ ತೋರಿಸಿ", "ಮುಖ್ಯ ಪುಟ", "ಮನೆಗೆ ಹೋಗು"]'::jsonb, 'navigate', '/app', 'high', true, '{"kn": "ಹೋಮ್ ತೆರೆಯುತ್ತಿದೆ"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'kn', '["ನನ್ನ ಭೂಮಿ", "ಭೂಮಿ ತೋರಿಸಿ", "ಹೊಲ ತೋರಿಸಿ"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"kn": "ಭೂಮಿ ತೋರಿಸುತ್ತಿದೆ"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'kn', '["ಹವಾಮಾನ ತೋರಿಸಿ", "ಹವಾಮಾನ ಹೇಗಿದೆ", "ಮಳೆ ಬರುತ್ತದೆಯೇ"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"kn": "ಹವಾಮಾನ ತೆರೆಯುತ್ತಿದೆ"}'::jsonb, true),
  (v_tenant_id, 'navigate.home', 'ur', '["گھر دکھائیں", "مرکزی صفحہ", "گھر جائیں"]'::jsonb, 'navigate', '/app', 'high', true, '{"ur": "ہوم کھول رہے ہیں"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'ur', '["میری زمین", "زمین دکھائیں", "کھیت دکھائیں"]'::jsonb, 'navigate', '/app/lands', 'high', true, '{"ur": "زمین دکھا رہے ہیں"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'ur', '["موسم دکھائیں", "موسم کیسا ہے", "بارش ہوگی"]'::jsonb, 'navigate', '/app/weather', 'high', true, '{"ur": "موسم کھول رہے ہیں"}'::jsonb, true);

END $$;