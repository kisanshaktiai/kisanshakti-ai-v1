-- Comprehensive Voice Navigation Intents for All App Features
-- This migration adds detailed navigation intents covering all app routes and actions

-- First, get the tenant_id (assuming default tenant)
DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Get the first tenant (or you can specify a specific tenant_id)
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant found';
  END IF;

  -- Delete existing intents to start fresh
  DELETE FROM voice_navigation_intents WHERE tenant_id = v_tenant_id;

  -- Insert comprehensive navigation intents for all languages
  -- English (en)
  INSERT INTO voice_navigation_intents (tenant_id, intent_id, language_code, patterns, route, action, response_template, is_active) VALUES
  -- Home & Dashboard
  (v_tenant_id, 'navigate.home', 'en', '["go home", "show home", "home page", "main page", "dashboard", "go to dashboard"]'::jsonb, '/app', 'navigate', '{"en": "Opening home", "hi": "होम खोल रहे हैं", "mr": "मुख्य पृष्ठ उघडत आहे", "ta": "முகப்பு திறக்கிறது", "pa": "ਮੁੱਖ ਪੰਨਾ ਖੋਲ੍ਹ ਰਹੇ ਹਾਂ"}'::jsonb, true),
  
  -- Lands Management
  (v_tenant_id, 'navigate.lands', 'en', '["show lands", "my lands", "view lands", "land management", "show my farm", "farm lands"]'::jsonb, '/app/lands', 'navigate', '{"en": "Opening your lands", "hi": "आपकी जमीन दिखा रहे हैं", "mr": "तुमची जमीन दाखवत आहे"}'::jsonb, true),
  (v_tenant_id, 'navigate.add_land', 'en', '["add land", "new land", "add new land", "register land", "add farm"]'::jsonb, '/app/lands/add', 'navigate', '{"en": "Opening add land form", "hi": "जमीन जोड़ने का फॉर्म खोल रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'action.open_land_details', 'en', '["open land details", "show land info", "land information", "view land", "land profile"]'::jsonb, '', 'speak', '{"en": "Which land would you like to view?", "hi": "आप कौन सी जमीन देखना चाहेंगे?"}'::jsonb, true),
  
  -- Weather
  (v_tenant_id, 'navigate.weather', 'en', '["show weather", "weather forecast", "check weather", "todays weather", "weather update"]'::jsonb, '/app/weather', 'navigate', '{"en": "Opening weather forecast", "hi": "मौसम की जानकारी दिखा रहे हैं"}'::jsonb, true),
  
  -- Schedule
  (v_tenant_id, 'navigate.schedule', 'en', '["show schedule", "crop schedule", "farming schedule", "my tasks", "task list"]'::jsonb, '/app/schedule', 'navigate', '{"en": "Opening crop schedule", "hi": "फसल कार्यक्रम दिखा रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'action.schedule_daily', 'en', '["daily view", "show daily tasks", "todays tasks", "daily schedule"]'::jsonb, '', 'speak', '{"en": "Showing daily schedule view", "hi": "दैनिक कार्यक्रम दिखा रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'action.schedule_weekly', 'en', '["weekly view", "show weekly tasks", "this weeks tasks", "weekly schedule"]'::jsonb, '', 'speak', '{"en": "Showing weekly schedule view", "hi": "साप्ताहिक कार्यक्रम दिखा रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'action.schedule_monthly', 'en', '["monthly view", "show monthly tasks", "this months tasks", "monthly schedule"]'::jsonb, '', 'speak', '{"en": "Showing monthly schedule view", "hi": "मासिक कार्यक्रम दिखा रहे हैं"}'::jsonb, true),
  
  -- AI Chat
  (v_tenant_id, 'navigate.chat', 'en', '["ai chat", "chatbot", "ask question", "talk to ai", "open chat", "farming advice"]'::jsonb, '/app/chat', 'navigate', '{"en": "Opening AI assistant", "hi": "AI सहायक खोल रहे हैं"}'::jsonb, true),
  
  -- Market
  (v_tenant_id, 'navigate.market', 'en', '["show market", "marketplace", "buy products", "sell products", "shop", "market prices"]'::jsonb, '/app/market', 'navigate', '{"en": "Opening marketplace", "hi": "बाजार खोल रहे हैं"}'::jsonb, true),
  
  -- Profile
  (v_tenant_id, 'navigate.profile', 'en', '["my profile", "show profile", "profile settings", "account settings", "user profile"]'::jsonb, '/app/profile', 'navigate', '{"en": "Opening your profile", "hi": "आपकी प्रोफाइल खोल रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'navigate.edit_profile', 'en', '["edit profile", "update profile", "change profile", "profile edit"]'::jsonb, '/app/profile/edit', 'navigate', '{"en": "Opening profile editor", "hi": "प्रोफाइल संपादन खोल रहे हैं"}'::jsonb, true),
  
  -- Community/Social
  (v_tenant_id, 'navigate.community', 'en', '["community", "social", "show community", "farmer community", "social feed"]'::jsonb, '/app/social', 'navigate', '{"en": "Opening community", "hi": "समुदाय खोल रहे हैं"}'::jsonb, true),
  
  -- Analytics
  (v_tenant_id, 'navigate.analytics', 'en', '["analytics", "show analytics", "farm analytics", "statistics", "reports"]'::jsonb, '/app/analytics', 'navigate', '{"en": "Opening analytics", "hi": "विश्लेषण खोल रहे हैं"}'::jsonb, true),
  
  -- Soil Health
  (v_tenant_id, 'navigate.soil_health', 'en', '["soil health", "soil report", "soil test", "soil analysis"]'::jsonb, '/app/soil-health', 'navigate', '{"en": "Opening soil health report", "hi": "मिट्टी स्वास्थ्य रिपोर्ट खोल रहे हैं"}'::jsonb, true),
  
  -- NDVI Analysis
  (v_tenant_id, 'navigate.ndvi', 'en', '["ndvi analysis", "satellite view", "crop health map", "ndvi map"]'::jsonb, '/app/ndvi', 'navigate', '{"en": "Opening NDVI analysis", "hi": "NDVI विश्लेषण खोल रहे हैं"}'::jsonb, true),
  
  -- Schemes
  (v_tenant_id, 'navigate.schemes', 'en', '["government schemes", "schemes", "subsidies", "farm schemes"]'::jsonb, '/app/schemes', 'navigate', '{"en": "Opening government schemes", "hi": "सरकारी योजनाएं खोल रहे हैं"}'::jsonb, true),
  
  -- Advisory
  (v_tenant_id, 'navigate.advisory', 'en', '["advisory", "farming tips", "expert advice", "recommendations"]'::jsonb, '/app/advisory', 'navigate', '{"en": "Opening advisory", "hi": "सलाह खोल रहे हैं"}'::jsonb, true);

  -- Hindi (hi)
  INSERT INTO voice_navigation_intents (tenant_id, intent_id, language_code, patterns, route, action, response_template, is_active) VALUES
  (v_tenant_id, 'navigate.home', 'hi', '["घर दिखाओ", "होम", "मुख्य पृष्ठ", "डैशबोर्ड"]'::jsonb, '/app', 'navigate', '{"hi": "होम खोल रहे हैं", "en": "Opening home"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'hi', '["मेरी जमीन", "जमीन दिखाओ", "खेत", "जमीन प्रबंधन"]'::jsonb, '/app/lands', 'navigate', '{"hi": "आपकी जमीन दिखा रहे हैं", "en": "Opening your lands"}'::jsonb, true),
  (v_tenant_id, 'navigate.add_land', 'hi', '["जमीन जोड़ो", "नई जमीन", "जमीन रजिस्टर करो"]'::jsonb, '/app/lands/add', 'navigate', '{"hi": "जमीन जोड़ने का फॉर्म खोल रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'hi', '["मौसम बताओ", "मौसम", "मौसम की जानकारी", "आज का मौसम"]'::jsonb, '/app/weather', 'navigate', '{"hi": "मौसम की जानकारी दिखा रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'navigate.schedule', 'hi', '["कार्यक्रम", "फसल कार्यक्रम", "मेरे काम", "कार्य सूची"]'::jsonb, '/app/schedule', 'navigate', '{"hi": "फसल कार्यक्रम दिखा रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'action.schedule_daily', 'hi', '["दैनिक दृश्य", "आज के काम", "दैनिक कार्यक्रम"]'::jsonb, '', 'speak', '{"hi": "दैनिक कार्यक्रम दिखा रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'action.schedule_weekly', 'hi', '["साप्ताहिक दृश्य", "इस सप्ताह के काम", "साप्ताहिक कार्यक्रम"]'::jsonb, '', 'speak', '{"hi": "साप्ताहिक कार्यक्रम दिखा रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'action.schedule_monthly', 'hi', '["मासिक दृश्य", "इस महीने के काम", "मासिक कार्यक्रम"]'::jsonb, '', 'speak', '{"hi": "मासिक कार्यक्रम दिखा रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'navigate.chat', 'hi', '["एआई चैट", "चैटबॉट", "सवाल पूछो", "एआई से बात करो"]'::jsonb, '/app/chat', 'navigate', '{"hi": "AI सहायक खोल रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'navigate.market', 'hi', '["बाजार", "मार्केट", "खरीदो", "बेचो"]'::jsonb, '/app/market', 'navigate', '{"hi": "बाजार खोल रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'navigate.profile', 'hi', '["मेरी प्रोफाइल", "प्रोफाइल", "सेटिंग्स"]'::jsonb, '/app/profile', 'navigate', '{"hi": "आपकी प्रोफाइल खोल रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'navigate.community', 'hi', '["समुदाय", "सामाजिक", "किसान समुदाय"]'::jsonb, '/app/social', 'navigate', '{"hi": "समुदाय खोल रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'navigate.analytics', 'hi', '["विश्लेषण", "आंकड़े", "रिपोर्ट"]'::jsonb, '/app/analytics', 'navigate', '{"hi": "विश्लेषण खोल रहे हैं"}'::jsonb, true),
  (v_tenant_id, 'navigate.soil_health', 'hi', '["मिट्टी स्वास्थ्य", "मिट्टी रिपोर्ट", "मिट्टी परीक्षण"]'::jsonb, '/app/soil-health', 'navigate', '{"hi": "मिट्टी स्वास्थ्य रिपोर्ट खोल रहे हैं"}'::jsonb, true);

  -- Marathi (mr)
  INSERT INTO voice_navigation_intents (tenant_id, intent_id, language_code, patterns, route, action, response_template, is_active) VALUES
  (v_tenant_id, 'navigate.home', 'mr', '["घर दाखवा", "मुख्य पान", "डॅशबोर्ड"]'::jsonb, '/app', 'navigate', '{"mr": "मुख्य पृष्ठ उघडत आहे"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'mr', '["माझी जमीन", "जमीन दाखवा", "शेत", "जमीन व्यवस्थापन"]'::jsonb, '/app/lands', 'navigate', '{"mr": "तुमची जमीन दाखवत आहे"}'::jsonb, true),
  (v_tenant_id, 'navigate.add_land', 'mr', '["जमीन जोडा", "नवीन जमीन", "जमीन नोंदणी करा"]'::jsonb, '/app/lands/add', 'navigate', '{"mr": "जमीन जोडण्याचा फॉर्म उघडत आहे"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'mr', '["हवामान दाखवा", "हवामान", "आजचे हवामान"]'::jsonb, '/app/weather', 'navigate', '{"mr": "हवामान माहिती दाखवत आहे"}'::jsonb, true),
  (v_tenant_id, 'navigate.schedule', 'mr', '["कार्यक्रम", "पीक कार्यक्रम", "माझी कामे"]'::jsonb, '/app/schedule', 'navigate', '{"mr": "पीक कार्यक्रम दाखवत आहे"}'::jsonb, true),
  (v_tenant_id, 'navigate.market', 'mr', '["बाजार", "मार्केट", "खरेदी", "विक्री"]'::jsonb, '/app/market', 'navigate', '{"mr": "बाजार उघडत आहे"}'::jsonb, true),
  (v_tenant_id, 'navigate.profile', 'mr', '["माझे प्रोफाइल", "प्रोफाइल", "सेटिंग्ज"]'::jsonb, '/app/profile', 'navigate', '{"mr": "तुमचे प्रोफाइल उघडत आहे"}'::jsonb, true);

  -- Tamil (ta)
  INSERT INTO voice_navigation_intents (tenant_id, intent_id, language_code, patterns, route, action, response_template, is_active) VALUES
  (v_tenant_id, 'navigate.home', 'ta', '["முகப்பு காட்டு", "வீடு", "முகப்பு பக்கம்"]'::jsonb, '/app', 'navigate', '{"ta": "முகப்பு திறக்கிறது"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'ta', '["எனது நிலங்கள்", "நிலம் காட்டு", "பண்ணை நிலங்கள்"]'::jsonb, '/app/lands', 'navigate', '{"ta": "உங்கள் நிலங்களைத் திறக்கிறது"}'::jsonb, true),
  (v_tenant_id, 'navigate.add_land', 'ta', '["நிலம் சேர்", "புதிய நிலம்", "நிலம் பதிவு"]'::jsonb, '/app/lands/add', 'navigate', '{"ta": "நிலம் சேர்க்கும் படிவம் திறக்கிறது"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'ta', '["வானிலை காட்டு", "வானிலை", "இன்றைய வானிலை"]'::jsonb, '/app/weather', 'navigate', '{"ta": "வானிலை தகவல் திறக்கிறது"}'::jsonb, true),
  (v_tenant_id, 'navigate.schedule', 'ta', '["அட்டவணை", "பயிர் அட்டவணை", "எனது பணிகள்"]'::jsonb, '/app/schedule', 'navigate', '{"ta": "பயிர் அட்டவணை திறக்கிறது"}'::jsonb, true),
  (v_tenant_id, 'navigate.market', 'ta', '["சந்தை", "சந்தை இடம்", "வாங்கு", "விற்க"]'::jsonb, '/app/market', 'navigate', '{"ta": "சந்தையைத் திறக்கிறது"}'::jsonb, true),
  (v_tenant_id, 'navigate.profile', 'ta', '["எனது சுயவிவரம்", "சுயவிவரம்", "அமைப்புகள்"]'::jsonb, '/app/profile', 'navigate', '{"ta": "உங்கள் சுயவிவரம் திறக்கிறது"}'::jsonb, true);

  -- Punjabi (pa)
  INSERT INTO voice_navigation_intents (tenant_id, intent_id, language_code, patterns, route, action, response_template, is_active) VALUES
  (v_tenant_id, 'navigate.home', 'pa', '["ਘਰ ਦਿਖਾਓ", "ਮੁੱਖ ਪੰਨਾ", "ਡੈਸ਼ਬੋਰਡ"]'::jsonb, '/app', 'navigate', '{"pa": "ਮੁੱਖ ਪੰਨਾ ਖੋਲ੍ਹ ਰਹੇ ਹਾਂ"}'::jsonb, true),
  (v_tenant_id, 'navigate.lands', 'pa', '["ਮੇਰੀ ਜ਼ਮੀਨ", "ਜ਼ਮੀਨ ਦਿਖਾਓ", "ਖੇਤ"]'::jsonb, '/app/lands', 'navigate', '{"pa": "ਤੁਹਾਡੀ ਜ਼ਮੀਨ ਖੋਲ੍ਹ ਰਹੇ ਹਾਂ"}'::jsonb, true),
  (v_tenant_id, 'navigate.add_land', 'pa', '["ਜ਼ਮੀਨ ਜੋੜੋ", "ਨਵੀਂ ਜ਼ਮੀਨ"]'::jsonb, '/app/lands/add', 'navigate', '{"pa": "ਜ਼ਮੀਨ ਜੋੜਨ ਦਾ ਫਾਰਮ ਖੋਲ੍ਹ ਰਹੇ ਹਾਂ"}'::jsonb, true),
  (v_tenant_id, 'navigate.weather', 'pa', '["ਮੌਸਮ ਦੱਸੋ", "ਮੌਸਮ", "ਅੱਜ ਦਾ ਮੌਸਮ"]'::jsonb, '/app/weather', 'navigate', '{"pa": "ਮੌਸਮ ਦੀ ਜਾਣਕਾਰੀ ਖੋਲ੍ਹ ਰਹੇ ਹਾਂ"}'::jsonb, true),
  (v_tenant_id, 'navigate.schedule', 'pa', '["ਕਾਰਜਕ੍ਰਮ", "ਫਸਲ ਕਾਰਜਕ੍ਰਮ", "ਮੇਰੇ ਕੰਮ"]'::jsonb, '/app/schedule', 'navigate', '{"pa": "ਫਸਲ ਕਾਰਜਕ੍ਰਮ ਖੋਲ੍ਹ ਰਹੇ ਹਾਂ"}'::jsonb, true),
  (v_tenant_id, 'navigate.market', 'pa', '["ਬਾਜ਼ਾਰ", "ਮਾਰਕੀਟ", "ਖਰੀਦੋ"]'::jsonb, '/app/market', 'navigate', '{"pa": "ਬਾਜ਼ਾਰ ਖੋਲ੍ਹ ਰਹੇ ਹਾਂ"}'::jsonb, true),
  (v_tenant_id, 'navigate.profile', 'pa', '["ਮੇਰੀ ਪ੍ਰੋਫਾਈਲ", "ਪ੍ਰੋਫਾਈਲ", "ਸੈਟਿੰਗਾਂ"]'::jsonb, '/app/profile', 'navigate', '{"pa": "ਤੁਹਾਡੀ ਪ੍ਰੋਫਾਈਲ ਖੋਲ੍ਹ ਰਹੇ ਹਾਂ"}'::jsonb, true);

END $$;