import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { classifyFarmerQuery } from './query-classifier.ts';
import { buildCompressedContext } from './context-compressor.ts';
import { getMinimalContext, getMiniRefresh } from './context-helpers.ts';
import { generateMultilingualQuickReplies } from './multilingual-quick-replies.ts';
import { parseResponseToCards } from './response-parser.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token',
};

// ============= QUERY COMPLEXITY ANALYZER =============

interface ComplexityAnalysis {
  complexity: 'simple' | 'medium' | 'complex';
  maxWords: number;
  maxTokens: number;
  responseStyle: string;
}

function analyzeQueryComplexity(userMessage: string, language: string = 'en'): ComplexityAnalysis {
  const msg = userMessage.toLowerCase();
  
  // ✅ FIX: Use character count for Indic scripts, word count for Latin scripts
  const isIndicScript = /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/.test(userMessage);
  
  let complexity: 'simple' | 'medium' | 'complex';
  let baseMaxWords: number;
  let baseMaxTokens: number;
  
  // ============================================
  // SIMPLE QUERIES (1-5 words, yes/no, greetings)
  // ============================================
  const simplePatterns = [
    // Greetings
    /^(hi|hello|hey|namaste|namaskar|नमस्ते|नमस्कार|নমস্কার|হ্যালো|வணக்கம்|నమస్కారం|ਨਮਸਤੇ)$/i,
    
    // Yes/No questions
    /^(yes|no|ok|okay|हाँ|नहीं|हो|नाही|ஆம்|இல்லை|అవును|కాదు|ਹਾਂ|ਨਹੀਂ)$/i,
    
    // Single fact questions (1-3 words)
    /^(what is|क्या है|काय आहे|என்ன|ఏమిటి|ਕੀ ਹੈ)/,
    
    // When questions (1-4 words)
    /^(when|कब|कधी|எப்போது|ఎప్పుడు|ਕਦੋਂ)\s+(water|irrigate|spray|पानी|सिंचाई|पाणी|நீர்|నీరు|ਪਾਣੀ)/,
    
    // Simple status checks
    /^(crop|फसल|पीक|பயிர்|పంట|ਫ਼ਸਲ)\s+(ok|ठीक|बरोबर|good|சரி|బాగుంది|ਠੀਕ)/,
    
    // Direct short questions
    /^(कौनसी|which|எந்த|ఏ|ਕਿਹੜਾ)\s+(खाद|fertilizer|உரம்|ఎరువు|ਖਾਦ)/,
    /^(कितना|how much|எவ்வளவு|ఎంత|ਕਿੰਨਾ)/,
    /^(price|भाव|किंमत|விலை|ధర|ਭਾਅ)/
  ];
  
  // ============================================
  // MEDIUM QUERIES (6-15 words, how-to, advice)
  // ============================================
  const mediumPatterns = [
    // How-to questions
    /how (to|do|can)|कैसे|कसे|எப்படி|ఎలా|ਕਿਵੇਂ/,
    
    // Advice questions
    /should i|what should|मुझे क्या|मला काय|நான் என்ன|నేను ఏమి|ਮੈਨੂੰ ਕੀ/,
    
    // Recommendation requests
    /recommend|suggest|सुझाव|शिफारस|பரிந்துரை|సూచన|ਸਲਾਹ/,
    
    // Schedule questions
    /schedule|timing|समय|वेळ|அட்டவணை|షెడ్యూల్|ਸਮਾਂ/,
    
    // Problem diagnosis (medium detail)
    /problem|issue|समस्या|अडचण|பிரச்சனை|సమస్య|ਸਮੱਸਿਆ/
  ];
  
  if (isIndicScript) {
    // For Indic scripts, use character count
    const charCount = userMessage.length;
    if (charCount < 30) {
      complexity = 'simple';
      baseMaxWords = 80;
      baseMaxTokens = 150;
    } else if (charCount < 100) {
      complexity = 'medium';
      baseMaxWords = 250;
      baseMaxTokens = 400;
    } else {
      complexity = 'complex';
      baseMaxWords = 500;
      baseMaxTokens = 800;
    }
  } else {
    // For Latin scripts, use word count
    const wordCount = msg.split(/\s+/).length;
    
    if (wordCount <= 5 || simplePatterns.some(p => p.test(msg))) {
      complexity = 'simple';
      baseMaxWords = 80;
      baseMaxTokens = 150;
    } else if (wordCount <= 15 || mediumPatterns.some(p => p.test(msg))) {
      complexity = 'medium';
      baseMaxWords = 250;
      baseMaxTokens = 400;
    } else {
      complexity = 'complex';
      baseMaxWords = 500;
      baseMaxTokens = 800;
    }
  }
  
  // ✅ FIX: Apply 1.8x multiplier for Indic languages
  const indicLanguages = ['hi', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml', 'pa', 'or', 'ur'];
  const isIndicLanguage = indicLanguages.includes(language);
  
  let finalMaxTokens = baseMaxTokens;
  if (isIndicLanguage) {
    finalMaxTokens = Math.round(baseMaxTokens * 1.8); // Indic scripts use more tokens
    console.log(`🔤 Indic language detected (${language}): ${baseMaxTokens} → ${finalMaxTokens} tokens`);
  }
  
  // ✅ FIX: Add 20% safety buffer to prevent mid-response cutoffs
  finalMaxTokens = Math.round(finalMaxTokens * 1.2);
  
  return {
    complexity,
    maxWords: baseMaxWords,
    maxTokens: finalMaxTokens,
    responseStyle: complexity === 'simple' ? 'brief' : complexity === 'medium' ? 'structured' : 'comprehensive'
  };
}

function getResponseLengthInstruction(
  complexity: 'simple' | 'medium' | 'complex',
  language: string
): string {
  const instructions = {
    simple: {
      en: `
⚠️ RESPONSE LENGTH: MAXIMUM 80 WORDS (3-4 sentences)
This is a SIMPLE question. Give a DIRECT, SHORT answer.
DO NOT use emoji sections (🟢🟡🔴) for simple queries - just plain text.
🚫 ABSOLUTELY NO ** ASTERISKS ** OR MARKDOWN FORMATTING

Example:
User: "When to water wheat?"
You: "Water your wheat crop twice this week - Monday and Thursday. Apply 28,000 liters each time through drip system. Water early morning (6-8 AM) for best results."

DO NOT give:
❌ Long introductions or greetings
❌ Detailed explanations
❌ Multiple sections
❌ **Bold** or *italic* formatting
❌ ## Headers or ### Subheaders

DO give:
✅ Direct answer in 2-3 sentences
✅ Specific numbers/timings for their exact land
✅ One key tip in natural language`,
      
      hi: `
⚠️ उत्तर की लंबाई: अधिकतम 80 शब्द (3-4 वाक्य)
यह एक सरल सवाल है। सीधा, छोटा जवाब दें।
सरल सवालों के लिए इमोजी सेक्शन (🟢🟡🔴) का उपयोग न करें - केवल सादा टेक्स्ट।
🚫 बिल्कुल ** तारे ** या मार्कडाउन फॉर्मेटिंग नहीं

उदाहरण:
उपयोगकर्ता: "गेहूं में पानी कब दें?"
आप: "इस हफ्ते दो बार पानी दें - सोमवार और गुरुवार। हर बार 28,000 लीटर ड्रिप से। सुबह 6-8 बजे पानी देना बेस्ट है।"

मत दें:
❌ लंबी शुरुआत या नमस्ते
❌ विस्तृत व्याख्या
❌ कई सेक्शन
❌ **बोल्ड** या *इटैलिक* फॉर्मेटिंग
❌ ## हेडर या ### उप-हेडर

दें:
✅ सीधा जवाब 2-3 वाक्यों में
✅ उनकी जमीन के लिए सटीक संख्या
✅ सामान्य भाषा में एक मुख्य टिप`,
      
      mr: `
⚠️ उत्तराची लांबी: जास्तीत जास्त 80 शब्द (3-4 वाक्ये)
हा एक साधा प्रश्न आहे। थेट, लहान उत्तर द्या।
साध्या प्रश्नांसाठी इमोजी विभाग (🟢🟡🔴) वापरू नका - फक्त साधा मजकूर.
🚫 अजिबात ** तारे ** किंवा मार्कडाउन फॉरमॅटिंग नाही

उदाहरण:
वापरकर्ता: "गहू मध्ये पाणी कधी द्यावे?"
तुम्ही: "या आठवड्यात दोन वेळा पाणी द्या - सोमवार आणि गुरुवार। प्रत्येक वेळी 28,000 लीटर ठिबक प्रणालीतून। सकाळी 6-8 वाजता पाणी देणे चांगले।"

देऊ नका:
❌ लांब परिचय किंवा नमस्कार
❌ तपशीलवार स्पष्टीकरण
❌ अनेक विभाग
❌ **ठळक** किंवा *इटॅलिक* फॉरमॅटिंग
❌ ## शीर्षक किंवा ### उप-शीर्षक

द्या:
✅ थेट उत्तर 2-3 वाक्यांमध्ये
✅ त्यांच्या जमिनीसाठी अचूक संख्या
✅ नैसर्गिक भाषेत एक मुख्य टिप`,
      
      ta: `
⚠️ பதில் நீளம்: அதிகபட்சம் 80 சொற்கள் (3-4 வாக்கியங்கள்)
இது ஒரு எளிய கேள்வி. நேரடியான, குறுகிய பதில் கொடுங்கள்.

உதாரணம்:
பயனர்: "கோதுமைக்கு எப்போது நீர் தேவை?"
நீங்கள்: "இந்த வாரம் இருமுறை நீர் கொடுங்கள் - திங்கள் மற்றும் வியாழன். ஒவ்வொரு முறையும் 28,000 லிட்டர் சொட்டுநீர் மூலம். காலை 6-8 மணிக்கு நீர் கொடுப்பது சிறந்தது."

கொடுக்க வேண்டாம்:
❌ நீண்ட அறிமுகம்
❌ விரிவான விளக்கம்
❌ பல பிரிவுகள்

கொடுங்கள்:
✅ நேரடி பதில் 2-3 வாக்கியங்களில்
✅ குறிப்பிட்ட எண்கள்/நேரங்கள்
✅ ஒரு முக்கிய குறிப்பு`,
      
      te: `
⚠️ సమాధాన పొడవు: గరిష్టంగా 80 పదాలు (3-4 వాక్యాలు)
ఇది ఒక సాధారణ ప్రశ్న. ప్రత్యక్ష, చిన్న సమాధానం ఇవ్వండి।

ఉదాహరణ:
వినియోగదారు: "గోధుమకు నీరు ఎప్పుడు?"
మీరు: "ఈ వారం రెండుసార్లు నీరు ఇవ్వండి - సోమవారం మరియు గురువారం। ప్రతిసారి 28,000 లీటర్లు డ్రిప్ ద్వారా। ఉదయం 6-8 గంటలకు నీరు ఇవ్వడం మంచిది।"

ఇవ్వకండి:
❌ పొడవైన పరిచయం
❌ వివరణాత్మక వివరణ
❌ అనేక విభాగాలు

ఇవ్వండి:
✅ ప్రత్యక్ష సమాధానం 2-3 వాక్యాలలో
✅ నిర్దిష్ట సంఖ్యలు/సమయాలు
✅ ఒక ముఖ్య చిట్కా`,
      
      pa: `
⚠️ ਜਵਾਬ ਦੀ ਲੰਬਾਈ: ਅਧਿਕਤਮ 80 ਸ਼ਬਦ (3-4 ਵਾਕ)
ਇਹ ਇੱਕ ਸਧਾਰਨ ਸਵਾਲ ਹੈ। ਸਿੱਧਾ, ਛੋਟਾ ਜਵਾਬ ਦਿਓ।

ਉਦਾਹਰਨ:
ਵਰਤੋਂਕਾਰ: "ਕਣਕ ਵਿੱਚ ਪਾਣੀ ਕਦੋਂ?"
ਤੁਸੀਂ: "ਇਸ ਹਫਤੇ ਦੋ ਵਾਰ ਪਾਣੀ ਦਿਓ - ਸੋਮਵਾਰ ਅਤੇ ਵੀਰਵਾਰ। ਹਰ ਵਾਰ 28,000 ਲੀਟਰ ਡਰਿੱਪ ਰਾਹੀਂ। ਸਵੇਰੇ 6-8 ਵਜੇ ਪਾਣੀ ਦੇਣਾ ਚੰਗਾ ਹੈ।"

ਨਾ ਦਿਓ:
❌ ਲੰਮੀ ਜਾਣ-ਪਛਾਣ
❌ ਵਿਸਥਾਰਪੂਰਵਕ ਵਿਆਖਿਆ
❌ ਕਈ ਭਾਗ

ਦਿਓ:
✅ ਸਿੱਧਾ ਜਵਾਬ 2-3 ਵਾਕਾਂ ਵਿੱਚ
✅ ਖਾਸ ਸੰਖਿਆਵਾਂ/ਸਮੇਂ
✅ ਇੱਕ ਮੁੱਖ ਸੁਝਾਅ`
    },
    
    medium: {
      en: `
⚠️ RESPONSE LENGTH: MAXIMUM 250 WORDS (2-3 paragraphs)
This is a MEDIUM complexity question. Provide structured, step-by-step guidance.
🚫 ABSOLUTELY NO ** ASTERISKS ** OR ## MARKDOWN FORMATTING

Structure using EMOJIS ONLY:
1️⃣ Brief intro (1 sentence)
2️⃣ Main steps (3-5 bullet points with •)
3️⃣ Key tip (1 sentence)

Example:
User: "How to apply fertilizer to tomato?"
You: "Here's the fertilizer schedule for tomato in your 5.25 acres:

🌱 पायरी 1: लावताना - डीएपी 25 किलो + पोटॅश 15 किलो मातीत मिसळा
🌱 पायरी 2: 20 दिवसांनंतर - युरिया 20 किलो रोपांभोवती टाका
🌱 पायरी 3: फुलांच्या वेळी - 19:19:19 एनपीके 30 किलो लावा

ओल्या मातीवर टाका, नंतर हलके पाणी द्या। पानांना हात लावू नका।"

DO NOT use:
❌ **Bold** or *italic* text
❌ ## Headers or ### Subheaders  
❌ Multiple *** stars
❌ Long paragraphs (max 2-3 sentences each)

DO use:
✅ Emojis for visual structure (🌱, 💧, ⚠️)
✅ Simple bullet points (•)
✅ Numbered steps (1., 2., 3.)
✅ Natural conversational language
✅ Exact calculations for their land size

DO NOT exceed 250 words.`,
      
      hi: `
⚠️ उत्तर की लंबाई: अधिकतम 250 शब्द (2-3 पैराग्राफ)
यह मध्यम कठिनाई का सवाल है। स्टेप-बाय-स्टेप मार्गदर्शन दें।
🚫 बिल्कुल ** तारे ** या ## मार्कडाउन फॉर्मेटिंग नहीं

केवल इमोजी का उपयोग करके संरचना:
1️⃣ संक्षिप्त परिचय (1 वाक्य)
2️⃣ मुख्य कदम (• के साथ 3-5 बिंदु)
3️⃣ महत्वपूर्ण टिप (1 वाक्य)

उपयोग न करें:
❌ **बोल्ड** या *इटैलिक* टेक्स्ट
❌ ## हेडर या ### उप-हेडर
❌ कई *** तारे
❌ लंबे पैराग्राफ (प्रत्येक में अधिकतम 2-3 वाक्य)

उपयोग करें:
✅ दृश्य संरचना के लिए इमोजी (🌱, 💧, ⚠️)
✅ सरल बुलेट पॉइंट (•)
✅ क्रमांकित चरण (1., 2., 3.)
✅ प्राकृतिक बातचीत की भाषा
✅ उनकी जमीन के लिए सटीक गणना

250 शब्दों से अधिक न लिखें।`,
      
      mr: `
⚠️ उत्तराची लांबी: जास्तीत जास्त 250 शब्द (2-3 परिच्छेद)
हा मध्यम क्लिष्टतेचा प्रश्न आहे। पायरी-दर-पायरी मार्गदर्शन द्या।
🚫 अजिबात ** तारे ** किंवा ## मार्कडाउन फॉरमॅटिंग नाही

फक्त इमोजी वापरून रचना:
1️⃣ संक्षिप्त परिचय (1 वाक्य)
2️⃣ मुख्य पायऱ्या (• सह 3-5 मुद्दे)
3️⃣ महत्त्वाची टीप (1 वाक्य)

वापरू नका:
❌ **ठळक** किंवा *इटॅलिक* मजकूर
❌ ## शीर्षक किंवा ### उप-शीर्षक
❌ अनेक *** तारे
❌ लांब परिच्छेद (प्रत्येकी जास्तीत जास्त 2-3 वाक्ये)

वापरा:
✅ दृश्य रचनेसाठी इमोजी (🌱, 💧, ⚠️)
✅ साधे बुलेट पॉइंट (•)
✅ क्रमांकित पायऱ्या (1., 2., 3.)
✅ नैसर्गिक संवादात्मक भाषा
✅ त्यांच्या जमिनीसाठी अचूक गणना

250 शब्दांपेक्षा जास्त लिहू नका।`,
      
      ta: `
⚠️ பதில் நீளம்: அதிகபட்சம் 250 சொற்கள் (2-3 பத்திகள்)
இது நடுத்தர சிக்கலான கேள்வி। படிப்படியான வழிகாட்டுதலை வழங்கவும்.

கட்டமைப்பு:
1️⃣ சுருக்கமான அறிமுகம் (1 வாக்கியம்)
2️⃣ முக்கிய படிகள் (3-5 புள்ளிகள்)
3️⃣ முக்கிய குறிப்பு (1 வாக்கியம்)

250 சொற்களுக்கு மேல் எழுத வேண்டாம்.`,
      
      te: `
⚠️ సమాధాన పొడవు: గరిష్టంగా 250 పదాలు (2-3 పేరాగ్రాఫ్‌లు)
ఇది మధ్యస్థ సంక్లిష్టత ప్రశ్న. దశలవారీ మార్గదర్శకత్వం అందించండి.

నిర్మాణం:
1️⃣ సంక్షిప్త పరిచయం (1 వాక్యం)
2️⃣ ముఖ్య దశలు (3-5 పాయింట్లు)
3️⃣ ముఖ్య చిట్కా (1 వాక్యం)

250 పదాలకు మించి రాయకండి.`,
      
      pa: `
⚠️ ਜਵਾਬ ਦੀ ਲੰਬਾਈ: ਅਧਿਕਤਮ 250 ਸ਼ਬਦ (2-3 ਪੈਰੇ)
ਇਹ ਮੱਧਮ ਗੁੰਝਲਦਾਰਤਾ ਦਾ ਸਵਾਲ ਹੈ। ਕਦਮ-ਦਰ-ਕਦਮ ਮਾਰਗਦਰਸ਼ਨ ਦਿਓ।

ਢਾਂਚਾ:
1️⃣ ਸੰਖੇਪ ਜਾਣ-ਪਛਾਣ (1 ਵਾਕ)
2️⃣ ਮੁੱਖ ਕਦਮ (3-5 ਬਿੰਦੂ)
3️⃣ ਮੁੱਖ ਸੁਝਾਅ (1 ਵਾਕ)

250 ਸ਼ਬਦਾਂ ਤੋਂ ਵੱਧ ਨਾ ਲਿਖੋ।`
    },
    
    complex: {
      en: `
⚠️ RESPONSE LENGTH: MAXIMUM 500 WORDS
This is a COMPLEX question requiring detailed planning.
🚫 ABSOLUTELY NO ** ASTERISKS ** OR ## MARKDOWN FORMATTING

Use organized sections with emojis ONLY:
🟢 सेंद्रिय पद्धत (Organic methods if applicable)
🟡 खत वेळापत्रक (Fertilizer schedule if applicable)
🔵 पाणी योजना (Irrigation plan if applicable)  
🔴 कीड नियंत्रण (Pest control if applicable)
⚠️ सावधगिरी (Important precautions)

Keep each section to 3-5 sentences maximum.
Provide calculations for the exact land size.
Use natural language - NO **bold** or *italic* formatting.
Use bullet points (•) or numbers (1., 2., 3.) only.`,
      
      hi: `
⚠️ उत्तर की लंबाई: अधिकतम 500 शब्द
यह जटिल सवाल है जिसमें विस्तृत योजना चाहिए।
🚫 बिल्कुल ** तारे ** या ## मार्कडाउन फॉर्मेटिंग नहीं

केवल इमोजी के साथ सेक्शन बनाएं:
🟢 जैविक तरीके
🟡 खाद का शेड्यूल
🔵 पानी की योजना
🔴 कीट नियंत्रण
⚠️ सावधानी

हर सेक्शन 3-5 वाक्यों तक सीमित रखें।
प्राकृतिक भाषा का उपयोग करें - **बोल्ड** या *इटैलिक* नहीं।
केवल बुलेट पॉइंट (•) या संख्या (1., 2., 3.) का उपयोग करें।`,
      
      mr: `
⚠️ उत्तराची लांबी: जास्तीत जास्त 500 शब्द
हा गुंतागुंतीचा प्रश्न आहे ज्यासाठी तपशीलवार नियोजन आवश्यक आहे।
🚫 अजिबात ** तारे ** किंवा ## मार्कडाउन फॉरमॅटिंग नाही

फक्त इमोजीसह विभाग तयार करा:
🟢 सेंद्रिय पद्धती
🟡 खत वेळापत्रक
🔵 पाणी योजना
🔴 कीड नियंत्रण
⚠️ सावधगिरी

प्रत्येक विभाग 3-5 वाक्यांपर्यंत मर्यादित ठेवा।
नैसर्गिक भाषा वापरा - **ठळक** किंवा *इटॅलिक* नाही।
फक्त बुलेट पॉइंट (•) किंवा संख्या (1., 2., 3.) वापरा।`,
      
      ta: `
⚠️ பதில் நீளம்: அதிகபட்சம் 500 சொற்கள்
இது விரிவான திட்டமிடல் தேவைப்படும் சிக்கலான கேள்வி.

எமோஜியுடன் ஒழுங்கமைக்கப்பட்ட பிரிவுகள்:
🟢 இயற்கை முறைகள்
🟡 உர அட்டவணை
🔵 நீர்ப்பாசன திட்டம்
🔴 பூச்சி கட்டுப்பாடு

ஒவ்வொரு பிரிவையும் 3-5 வாக்கியங்களுக்கு மட்டுப்படுத்துங்கள்.`,
      
      te: `
⚠️ సమాధాన పొడవు: గరిష్టంగా 500 పదాలు
ఇది వివరణాత్మక ప్లానింగ్ అవసరమైన సంక్లిష్ట ప్రశ్న.

ఎమోజీలతో వ్యవస్థీకృత విభాగాలు:
🟢 సేంద్రీయ పద్ధతులు
🟡 ఎరువుల షెడ్యూల్
🔵 నీటిపారుదల ప్రణాళిక
🔴 చీడపురుగుల నియంత్రణ

ప్రతి విభాగాన్ని 3-5 వాక్యాలకు పరిమితం చేయండి.`,
      
      pa: `
⚠️ ਜਵਾਬ ਦੀ ਲੰਬਾਈ: ਅਧਿਕਤਮ 500 ਸ਼ਬਦ
ਇਹ ਗੁੰਝਲਦਾਰ ਸਵਾਲ ਹੈ ਜਿਸ ਲਈ ਵਿਸਥਾਰਪੂਰਵਕ ਯੋਜਨਾ ਚਾਹੀਦੀ ਹੈ।

ਇਮੋਜੀ ਨਾਲ ਸੰਗਠਿਤ ਭਾਗ:
🟢 ਜੈਵਿਕ ਤਰੀਕੇ
🟡 ਖਾਦ ਸਮਾਂ-ਸਾਰਣੀ
🔵 ਸਿੰਚਾਈ ਯੋਜਨਾ
🔴 ਕੀੜੇ ਨਿਯੰਤਰਣ

ਹਰੇਕ ਭਾਗ ਨੂੰ 3-5 ਵਾਕਾਂ ਤੱਕ ਸੀਮਤ ਰੱਖੋ।`
    }
  };
  
  // Fallback to English if language not found
  const langInstructions = instructions[complexity][language] || instructions[complexity]['en'];
  return langInstructions;
}

// ============= WEATHER RESPONSE GENERATOR =============

interface WeatherData {
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: string | number;
  description: string;
  rain_1h?: number;
  rain_3h?: number;
  location: string;
  provider: string;
}

interface ForecastDay {
  date: string;
  temp_min: number;
  temp_max: number;
  max_rain_prob: number;
  description: string;
}

function generateWeatherResponse(
  current: WeatherData,
  forecast: ForecastDay[],
  language: string
): string {
  const temp = Math.round(current.temp);
  const feelsLike = Math.round(current.feels_like);
  const humidity = current.humidity;
  const windSpeed = typeof current.wind_speed === 'string' 
    ? parseFloat(current.wind_speed) 
    : current.wind_speed;
  const desc = current.description;
  
  // Farming recommendations based on weather
  const hasRain = (current.rain_1h && current.rain_1h > 0) || (current.rain_3h && current.rain_3h > 0);
  const rainForecast = forecast.find(day => day.max_rain_prob > 50);
  const isHot = temp > 35;
  const isHumid = humidity > 80;
  const isWindy = windSpeed > 20;
  
  // Language responses
  const responses: Record<string, string> = {
    en: `📍 Current Weather for ${current.location}

🌡️ Temperature: ${temp}°C (Feels like ${feelsLike}°C)
💨 Wind: ${Math.round(windSpeed)} km/h
💧 Humidity: ${humidity}%
🌤️ Conditions: ${desc}

📅 Next 3 Days:
${forecast.slice(0, 3).map((day, i) => {
  const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short' });
  return `${dayName}: ${Math.round(day.temp_min)}-${Math.round(day.temp_max)}°C, Rain ${day.max_rain_prob}%`;
}).join('\n')}

🌾 Farming Advice:
${hasRain || rainForecast ? '🔴 Avoid spraying - rain expected' : '✅ Good for spraying'}
${isHot ? '💧 Water early (5-7 AM) or evening (5-7 PM)' : '✅ Normal watering time'}
${isHumid ? '⚠️ Watch for fungal diseases' : '✅ Low disease risk'}
${isWindy ? '🔴 Avoid fertilizer - windy' : '✅ Safe for fertilizer'}

Updated: ${new Date().toLocaleTimeString('en-IN')} • ${current.provider}`,
    
    hi: `📍 ${current.location} का मौसम

🌡️ तापमान: ${temp}°C (अनुभव ${feelsLike}°C)
💨 हवा: ${Math.round(windSpeed)} किमी/घंटा
💧 नमी: ${humidity}%
🌤️ स्थिति: ${desc}

📅 अगले 3 दिन:
${forecast.slice(0, 3).map((day, i) => {
  const dayName = i === 0 ? 'आज' : i === 1 ? 'कल' : new Date(day.date).toLocaleDateString('hi-IN', { weekday: 'short' });
  return `${dayName}: ${Math.round(day.temp_min)}-${Math.round(day.temp_max)}°C, बारिश ${day.max_rain_prob}%`;
}).join('\n')}

🌾 खेती सलाह:
${hasRain || rainForecast ? '🔴 छिड़काव न करें - बारिश होगी' : '✅ छिड़काव के लिए अच्छा'}
${isHot ? '💧 सुबह (5-7) या शाम (5-7) पानी दें' : '✅ सामान्य समय पानी दें'}
${isHumid ? '⚠️ फफूंद रोग का खतरा' : '✅ रोग का कम खतरा'}
${isWindy ? '🔴 खाद न डालें - तेज हवा' : '✅ खाद डाल सकते हैं'}

अपडेट: ${new Date().toLocaleTimeString('hi-IN')} • ${current.provider}`,
    
    mr: `📍 ${current.location} चे हवामान

🌡️ तापमान: ${temp}°C (अनुभव ${feelsLike}°C)
💨 वारा: ${Math.round(windSpeed)} किमी/तास
💧 आर्द्रता: ${humidity}%
🌤️ परिस्थिती: ${desc}

📅 पुढील 3 दिवस:
${forecast.slice(0, 3).map((day, i) => {
  const dayName = i === 0 ? 'आज' : i === 1 ? 'उद्या' : new Date(day.date).toLocaleDateString('mr-IN', { weekday: 'short' });
  return `${dayName}: ${Math.round(day.temp_min)}-${Math.round(day.temp_max)}°C, पाऊस ${day.max_rain_prob}%`;
}).join('\n')}

🌾 शेती सल्ला:
${hasRain || rainForecast ? '🔴 फवारणी टाळा - पाऊस होणार' : '✅ फवारणीसाठी चांगले'}
${isHot ? '💧 सकाळी (5-7) किंवा संध्याकाळी (5-7) पाणी द्या' : '✅ नेहमीच्या वेळी पाणी'}
${isHumid ? '⚠️ बुरशीजन्य रोगाचा धोका' : '✅ रोगाचा कमी धोका'}
${isWindy ? '🔴 खत टाकू नका - जोरदार वारा' : '✅ खत टाकू शकता'}

अपडेट: ${new Date().toLocaleTimeString('mr-IN')} • ${current.provider}`
  };
  
  return responses[language] || responses['en'];
}

function enforceResponseLength(
  aiResponse: string,
  maxWords: number,
  language: string
): string {
  const words = aiResponse.split(/\s+/);
  
  // If within limit, return as-is
  if (words.length <= maxWords) {
    return aiResponse;
  }
  
  console.log(`✂️ Truncating response from ${words.length} to ${maxWords} words`);
  
  // Truncate to max words
  const truncated = words.slice(0, maxWords).join(' ');
  
  // Find last complete sentence
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclamation = truncated.lastIndexOf('!');
  const lastDevanagari = truncated.lastIndexOf('।'); // Hindi/Marathi sentence end
  
  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation, lastDevanagari);
  
  if (lastSentenceEnd > 0) {
    return truncated.substring(0, lastSentenceEnd + 1);
  }
  
  // If no sentence end found, add ellipsis
  return truncated + '...';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    
    const requestBody = await req.json();
    const { 
      messages = [], 
      landId, 
      sessionId,
      imageUrl,
      language = 'en',
      metadata = {},
      fileContent,
      action // New: support for different actions
    } = requestBody;

    // Auto-detect language from user's message if language mismatch detected
    let detectedLanguage = language;
    const lastUserMessage = messages[messages.length - 1];
    const userText = lastUserMessage?.content || '';
    
    // Simple language detection based on Unicode ranges
    const hasDevanagari = /[\u0900-\u097F]/.test(userText); // Hindi/Marathi
    const hasTamil = /[\u0B80-\u0BFF]/.test(userText);
    const hasTelugu = /[\u0C00-\u0C7F]/.test(userText);
    const hasBengali = /[\u0980-\u09FF]/.test(userText);
    const hasGujarati = /[\u0A80-\u0AFF]/.test(userText);
    const hasKannada = /[\u0C80-\u0CFF]/.test(userText);
    const hasMalayalam = /[\u0D00-\u0D7F]/.test(userText);
    const hasOdia = /[\u0B00-\u0B7F]/.test(userText);
    const hasPunjabi = /[\u0A00-\u0A7F]/.test(userText);
    const hasUrdu = /[\u0600-\u06FF]/.test(userText);
    
    // ✅ FIX: Respect user's selected language for Devanagari script (Hindi/Marathi)
    if (hasDevanagari) {
      // If user selected Marathi or Hindi explicitly, keep their preference
      if (language === 'mr') {
        detectedLanguage = 'mr';
        console.log('🔍 Language detected: Marathi (user preference respected)');
      } else if (language === 'hi' || language === 'en') {
        detectedLanguage = 'hi';
        console.log('🔍 Language auto-detected: Hindi from Devanagari script');
      } else {
        // Keep user's original language if it's something else
        detectedLanguage = language;
        console.log('🔍 Language: keeping user preference:', language);
      }
    } else if (hasTamil) {
      detectedLanguage = 'ta';
      console.log('🔍 Language auto-detected: Tamil');
    } else if (hasTelugu) {
      detectedLanguage = 'te';
      console.log('🔍 Language auto-detected: Telugu');
    } else if (hasBengali) {
      detectedLanguage = 'bn';
      console.log('🔍 Language auto-detected: Bengali');
    } else if (hasGujarati) {
      detectedLanguage = 'gu';
      console.log('🔍 Language auto-detected: Gujarati');
    } else if (hasKannada) {
      detectedLanguage = 'kn';
      console.log('🔍 Language auto-detected: Kannada');
    } else if (hasMalayalam) {
      detectedLanguage = 'ml';
      console.log('🔍 Language auto-detected: Malayalam');
    } else if (hasOdia) {
      detectedLanguage = 'or';
      console.log('🔍 Language auto-detected: Odia');
    } else if (hasPunjabi) {
      detectedLanguage = 'pa';
      console.log('🔍 Language auto-detected: Punjabi');
    } else if (hasUrdu) {
      detectedLanguage = 'ur';
      console.log('🔍 Language auto-detected: Urdu');
    }

    // Handle training data collection action
    if (action === 'collect_training_data') {
      return await handleTrainingDataCollection(requestBody);
    }

    // SECURITY: Extract and validate tenant and farmer IDs from headers
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    const sessionToken = req.headers.get('x-session-token');

    // Validate required headers immediately
    if (!tenantId || !farmerId) {
      console.error('🚨 [Security] Missing required headers:', { tenantId, farmerId });
      return new Response(
        JSON.stringify({ 
          error: 'Authentication required',
          details: 'x-tenant-id and x-farmer-id headers are required'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔐 [Security] Request headers:', {
      tenantId,
      farmerId,
      hasSessionToken: !!sessionToken,
      timestamp: new Date().toISOString()
    });
    
    // Use metadata values first, then headers as fallback
    const finalTenantId = metadata.tenantId || tenantId;
    const finalFarmerId = metadata.farmerId || farmerId;

    // Initialize Supabase client (needed for validation)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // CRITICAL SECURITY: Database validation of tenant-farmer association
    if (finalTenantId && finalFarmerId) {
      console.log('🔐 [Security] Validating tenant-farmer association...');
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: farmer, error: farmerError } = await supabase
        .from('farmers')
        .select('id, tenant_id, farmer_name')
        .eq('id', finalFarmerId)
        .eq('tenant_id', finalTenantId)
        .single();

      if (farmerError || !farmer) {
        console.error('🚨 [Security] INVALID TENANT-FARMER ASSOCIATION:', {
          tenantId: finalTenantId,
          farmerId: finalFarmerId,
          error: farmerError?.message,
          code: farmerError?.code
        });
        return new Response(
          JSON.stringify({ 
            error: 'Unauthorized: Invalid tenant-farmer association',
            details: 'Security validation failed'
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ [Security] Tenant-farmer association validated:', {
        farmerId: farmer.id,
        farmerName: farmer.farmer_name,
        tenantId: farmer.tenant_id
      });
    }

    // CRITICAL SECURITY: Validate isolation context before ANY database operation
    await validateIsolation(finalTenantId, finalFarmerId, supabaseUrl, supabaseServiceKey);

    // Rate limiting check (20 requests per minute per farmer)
    const rateLimitKey = `${finalTenantId}:${finalFarmerId}`;
    const rateLimit = await checkRateLimit(rateLimitKey, 'ai-agriculture-chat', { maxRequests: 20, windowMs: 60000 });
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          resetTime: new Date(rateLimit.resetTime).toISOString()
        }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Validate required fields
    if (!finalTenantId || !finalFarmerId) {
      console.error('Missing context:', { 
        tenantId: finalTenantId, 
        farmerId: finalFarmerId, 
        metadata,
        headers: {
          'x-tenant-id': tenantId,
          'x-farmer-id': farmerId
        }
      });
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: tenantId and farmerId must be provided in metadata',
          required: ['tenantId', 'farmerId'],
          received: { tenantId: finalTenantId, farmerId: finalFarmerId }
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!sessionId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required field: sessionId',
          required: ['sessionId']
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('AI Chat Request:', { 
      tenantId: finalTenantId, 
      farmerId: finalFarmerId, 
      landId, 
      sessionId, 
      requestedLanguage: language,
      detectedLanguage: detectedLanguage 
    });

    // Create Supabase client (credentials already initialized above)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Set app session for RLS (if we have session token)
    if (sessionToken) {
      const { error: sessionError } = await supabase.rpc('set_app_session', {
        p_tenant_id: finalTenantId,
        p_farmer_id: finalFarmerId,
        p_session_token: sessionToken
      });
      
      if (sessionError) {
        console.error('Failed to set session:', sessionError);
        // Continue without RLS session - edge functions use service role key
      }
    }

    // Get or create chat session
    let currentSessionId = sessionId;
    let currentSession = null;
    
    if (currentSessionId) {
      // Load existing session
      const { data: existingSession } = await supabase
        .from('ai_chat_sessions')
        .select('*')
        .eq('id', currentSessionId)
        .single();
      
      currentSession = existingSession;
    }
    
    if (!currentSessionId || !currentSession) {
      const { data: newSession, error: sessionError } = await supabase
        .from('ai_chat_sessions')
        .insert({
          tenant_id: finalTenantId,
          farmer_id: finalFarmerId,
          land_id: landId || null,
          session_type: landId ? 'land_specific' : 'general',
          session_title: `Chat - ${new Date().toLocaleDateString()}`,
          metadata: { 
            language,
            created_at: new Date().toISOString(),
            total_messages: 0
          }
        })
        .select()
        .single();

      if (sessionError) throw sessionError;
      currentSessionId = newSession.id;
      currentSession = newSession;
    }

    // ============= SESSION-BASED SMART CACHING =============
    // Get message count for this session
    const { data: messageHistory } = await supabase
      .from('ai_chat_messages')
      .select('id, land_context')
      .eq('session_id', currentSessionId)
      .order('created_at', { ascending: true });

    const messageCount = (messageHistory?.length || 0) + 1;
    
    // Step 1: Classify farmer's query intent
    const queryIntent = classifyFarmerQuery(userText, language);
    console.log(`🎯 Query Intent: ${queryIntent.type} (confidence: ${queryIntent.confidence}) | Message #${messageCount}`);
    
    // Detect pure weather query vs agriculture query with weather context
    const weatherKeywords = /weather|मौसम|हवामान|வானிலை|వాతావరణం|ਮੌਸਮ|rain|बारिश|पाऊस|மழை|వర్షం|ਬਾਰਿਸ਼|temperature|तापमान|तापमान|வெப்பநிலை|ఉష్ణోగ్రత|ਤਾਪਮਾਨ|wind|हवा|वारा|காற்று|గాలి|ਹਵਾ|forecast|पूर्वानुमान|अंदाज|முன்னறிவிப்பு|అంచనా|ਪੂਰਵ ਅਨੁਮਾਨ|climate|जलवायु|हवामान|காலநிலை|వాతావరణం|ਜਲਵਾਯੂ/i;
    const agricultureKeywords = /spray|छिड़काव|फवारणी|water|पाणी|पानी|fertilizer|खत|खाद|irrigation|सिंचाई|पाणीपुरवठा|pesticide|कीटनाशक|crop|फसल|पीक|plant|रोपण|लागवड/i;
    
    const hasWeatherKeyword = weatherKeywords.test(userText);
    const hasAgricultureKeyword = agricultureKeywords.test(userText);
    
    // Pure weather query: Only weather keywords, no agriculture keywords
    const isPureWeatherQuery = hasWeatherKeyword && !hasAgricultureKeyword;
    // Agriculture with weather: Both types of keywords
    const isAgricultureWithWeather = hasWeatherKeyword && hasAgricultureKeyword;
    
    console.log(`🌤️ Query Analysis: Pure Weather=${isPureWeatherQuery}, Agriculture+Weather=${isAgricultureWithWeather}`);
    
    // Get land context if landId is provided
    let landContext = null;
    let landDetails: any = null;
    let farmerDetails: any = null;
    let farmerContext: any = null;
    let weatherContext: any = null;
    let currentWeather: any = null;
    let weatherForecast: any[] = [];
    
    // ✅ DECLARE CROP SCHEDULE VARIABLES AT TOP LEVEL (before systemPrompt)
    let cropSchedule: any = null;
    let daysSinceSowing: number | null = null;
    let daysToHarvest: number | null = null;
    let currentGrowthStage: string = 'Unknown';
    let areaInAcres: string | number = 'Unknown';
    
    // Check if land has changed (for context refresh)
    const previousLandId = messageHistory && messageHistory.length > 0 
      ? messageHistory[messageHistory.length - 1]?.land_context?.land_id 
      : null;
    const landHasChanged = previousLandId && landId && previousLandId !== landId;
    
    // ✅ STEP 1: FETCH LAND DATA FIRST (before constructing systemPrompt)
    if (landId) {
      const { data: land } = await supabase
        .from('lands')
        .select('*')
        .eq('id', landId)
        .eq('tenant_id', finalTenantId)
        .single();

      if (land) {
        landDetails = land;
        
        // Calculate area in acres (assign to outer variable)
        areaInAcres = land.area_acres || 
                           (land.area_gunta ? (land.area_gunta / 40).toFixed(2) : null) ||
                           (land.size ? land.size : 'Unknown');
        
        // ✅ Fetch active crop schedule for this land (assign to outer variables)
        try {
          const { data: schedule } = await supabase
            .from('crop_schedules')
            .select('*')
            .eq('land_id', landId)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (schedule) {
            cropSchedule = schedule;
            
            // Calculate days since actual sowing from schedule
            if (schedule.sowing_date) {
              daysSinceSowing = Math.floor((Date.now() - new Date(schedule.sowing_date).getTime()) / (1000 * 60 * 60 * 24));
              
              // Calculate days to harvest
              if (schedule.expected_harvest_date) {
                daysToHarvest = Math.floor((new Date(schedule.expected_harvest_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              }
              
              // Determine growth stage based on days since sowing
              if (daysSinceSowing <= 15) {
                currentGrowthStage = 'Germination/Early Growth';
              } else if (daysSinceSowing <= 30) {
                currentGrowthStage = 'Vegetative Growth';
              } else if (daysSinceSowing <= 60) {
                currentGrowthStage = 'Flowering/Reproductive';
              } else if (daysSinceSowing <= 90) {
                currentGrowthStage = 'Grain Filling/Maturity';
              } else {
                currentGrowthStage = 'Ready for Harvest';
              }
            }
            
            console.log('✅ Crop Schedule Found:', {
              crop: schedule.crop_name,
              variety: schedule.crop_variety,
              sowingDate: schedule.sowing_date,
              daysSinceSowing,
              daysToHarvest,
              growthStage: currentGrowthStage
            });
          } else {
            console.log('ℹ️ No active crop schedule found, using land cultivation_date');
            // Fallback to land cultivation_date
            daysSinceSowing = land.cultivation_date 
              ? Math.floor((Date.now() - new Date(land.cultivation_date).getTime()) / (1000 * 60 * 60 * 24))
              : null;
          }
        } catch (scheduleError) {
          console.warn('⚠️ Could not load crop schedule:', scheduleError);
          // Fallback to land cultivation_date
          daysSinceSowing = land.cultivation_date 
            ? Math.floor((Date.now() - new Date(land.cultivation_date).getTime()) / (1000 * 60 * 60 * 24))
            : null;
        }
      }
    }
    
    // ✅ STEP 1.5: FETCH WEATHER DATA IF NEEDED
    if (isPureWeatherQuery || isAgricultureWithWeather || landId) {
      try {
        // Get location from land or farmer profile
        let weatherLat: number | null = null;
        let weatherLon: number | null = null;
        let locationName = 'Unknown';
        
        if (landDetails?.center_lat && landDetails?.center_lon) {
          weatherLat = landDetails.center_lat;
          weatherLon = landDetails.center_lon;
          locationName = landDetails.location || landDetails.name;
        } else if (farmerDetails?.latitude && farmerDetails?.longitude) {
          weatherLat = farmerDetails.latitude;
          weatherLon = farmerDetails.longitude;
          locationName = `${farmerDetails.village || ''}, ${farmerDetails.district || ''}`.trim();
        }
        
        if (weatherLat && weatherLon) {
          // Round coordinates for cache lookup
          const roundedLat = Math.round(weatherLat * 100) / 100;
          const roundedLon = Math.round(weatherLon * 100) / 100;
          
          console.log(`🌤️ Fetching weather data via weather function: ${roundedLat},${roundedLon} (${locationName})`);
          
          // ✅ FETCH WEATHER FROM WEATHER EDGE FUNCTION
          const { data: weatherData, error: weatherError } = await supabase.functions.invoke('weather', {
            body: {
              action: 'all',
              lat: roundedLat,
              lon: roundedLon
            }
          });
          
          if (weatherError) {
            console.error('❌ Failed to fetch weather:', weatherError);
          } else if (weatherData) {
            console.log('✅ Weather data fetched:', {
              hasCurrent: !!weatherData.current,
              hasForecast: !!weatherData.forecast,
              hasHourly: !!weatherData.hourly
            });
            
            // Extract current weather
            if (weatherData.current) {
              currentWeather = {
                location: locationName,
                temp: weatherData.current.temp,
                feels_like: weatherData.current.feels_like,
                humidity: weatherData.current.humidity,
                wind_speed: (weatherData.current.wind_speed * 3.6).toFixed(1), // Convert m/s to km/h
                wind_direction: weatherData.current.wind_deg,
                description: weatherData.current.description,
                main: weatherData.current.main,
                rain_1h: weatherData.current.rain_1h || 0,
                rain_3h: weatherData.current.rain_3h || 0,
                uv_index: weatherData.current.uv_index,
                visibility: (weatherData.current.visibility / 1000).toFixed(1), // Convert m to km
                pressure: weatherData.current.pressure,
                clouds: weatherData.current.clouds,
                sunrise: weatherData.current.sunrise,
                sunset: weatherData.current.sunset,
                updated_at: new Date().toISOString(),
                provider: weatherData.provider || 'OpenWeather'
              };
              
              console.log(`✅ Current weather: ${currentWeather.temp}°C, ${currentWeather.description}`);
            }
            
            // Extract forecast (daily)
            if (weatherData.forecast && weatherData.forecast.length > 0) {
              weatherForecast = weatherData.forecast.slice(0, 7).map((day: any) => ({
                date: new Date(day.dt * 1000).toISOString().split('T')[0],
                temp_min: day.temp.min,
                temp_max: day.temp.max,
                temp_avg: day.temp.day,
                total_rain: 0, // Not directly available, would need hourly aggregation
                max_rain_prob: day.pop * 100,
                avg_humidity: day.humidity,
                avg_wind_speed: (day.wind_speed * 3.6).toFixed(1), // Convert m/s to km/h
                description: day.weather[0].description
              }));
              
              console.log(`✅ Weather forecast: ${weatherForecast.length} days`);
            }
          }
          
          // Build weather context for prompt
          if (currentWeather || weatherForecast.length > 0) {
            weatherContext = {
              location: locationName,
              current: currentWeather,
              forecast: weatherForecast,
              has_data: true
            };
            
            // 🌤️ PHASE 1: DIRECT WEATHER RESPONSE (NO AI, NO COST)
            // If this is a PURE weather query (no agriculture context), return template response
            if (isPureWeatherQuery && currentWeather) {
              console.log('🌤️ PHASE 1: Pure weather query - generating direct template response (no AI)');
              
              // Generate multi-language weather response using template
              const weatherResponse = generateWeatherResponse(currentWeather, weatherForecast, detectedLanguage);
              
              // Save user message first
              await supabase.from('ai_chat_messages').insert({
                session_id: currentSessionId,
                farmer_id: farmerId,
                tenant_id: finalTenantId,
                role: 'user',
                content: userText,
                language: detectedLanguage,
                land_context: landId ? { land_id: landId } : null,
                weather_context: weatherContext,
                ip_address: clientIp || '0.0.0.0',
                user_agent: req.headers.get('user-agent') || 'Unknown',
                partition_key: getPartitionKey(farmerId)
              });
              
              // Save assistant response
              await supabase.from('ai_chat_messages').insert({
                session_id: currentSessionId,
                farmer_id: farmerId,
                tenant_id: finalTenantId,
                role: 'assistant',
                content: weatherResponse,
                language: detectedLanguage,
                weather_context: weatherContext,
                message_type: 'weather_direct',
                ip_address: clientIp || '0.0.0.0',
                user_agent: req.headers.get('user-agent') || 'Unknown',
                partition_key: getPartitionKey(farmerId)
              });
              
              console.log('✅ Direct weather response generated and saved (PHASE 1 - no AI cost)');
              
              return new Response(
                JSON.stringify({
                  reply: weatherResponse,
                  language: detectedLanguage,
                  quickReplies: generateQuickReplies(detectedLanguage, 'weather'),
                  source: 'direct_weather_template',
                  weatherData: {
                    current: currentWeather,
                    forecast: weatherForecast.slice(0, 3)
                  }
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        }
      } catch (weatherError) {
        console.warn('⚠️ Could not load weather data:', weatherError);
        // Continue without weather data
      }
    }
    
    // ✅ STEP 2: NOW CONSTRUCT SYSTEM PROMPT WITH FETCHED DATA
    let systemPrompt = `You are KisanShakti AI — a Very Expert Agriculture Scientist and advanced agricultural AI assistant for Indian farmers.

🎯 PRIMARY OBJECTIVE:
Deliver clear, conversational agricultural advice in native Indian languages with natural, easy-to-understand responses that farmers can instantly act upon.

${landId && landDetails && cropSchedule ? `
═══════════════════════════════════════════════════════════════
🌾 FARMER'S LAND CONTEXT (ALWAYS USE THIS)
═══════════════════════════════════════════════════════════════

Land: ${landDetails.name || 'Unknown'} (${areaInAcres} acres)
Location: ${landDetails.location || 'Unknown'}
Soil Type: ${landDetails.soil_type || 'Unknown'}

CURRENT CROP SCHEDULE:
• Crop: ${cropSchedule.crop_name || 'Unknown'}${cropSchedule.crop_variety ? ` (Variety: ${cropSchedule.crop_variety})` : ''}
• Sowing Date: ${cropSchedule.sowing_date ? new Date(cropSchedule.sowing_date).toLocaleDateString() : 'Unknown'}
• Days Since Sowing: ${daysSinceSowing || 'Unknown'} days
• Current Growth Stage: ${currentGrowthStage}
• Expected Harvest: ${cropSchedule.expected_harvest_date ? new Date(cropSchedule.expected_harvest_date).toLocaleDateString() : 'Unknown'}${daysToHarvest ? ` (${daysToHarvest} days remaining)` : ''}
• Irrigation Type: ${landDetails.irrigation_type || 'Unknown'}

⚠️ CRITICAL: Always reference this context in your responses. Calculate doses for ${areaInAcres} acres automatically.
═══════════════════════════════════════════════════════════════
` : ''}

═══════════════════════════════════════════════════════════════
🧠 INTELLIGENT QUESTION UNDERSTANDING
═══════════════════════════════════════════════════════════════

UNDERSTAND THE REAL QUESTION behind farmer queries:

"खत कधी टाकावे?" → They want: specific timing, weather conditions, crop stage
"पाणी द्यावे का?" → They want: yes/no + when/how much + visual cues (soil moisture)
"पीक काळे पडतेय" → They want: disease diagnosis + immediate treatment + prevention
"किती नफा होईल?" → They want: cost breakdown + expected yield + market price
"कोणते बियाणे चांगले?" → They want: variety comparison for THEIR land + local availability
"मी कोणते पीक घ्यू?" → ${cropSchedule ? `They ALREADY have ${cropSchedule.crop_name} planted! Tell them current status and care advice.` : 'Ask about their land conditions to suggest suitable crops'}

Intent Recognition Patterns:
• Timing questions (कधी, when) → Include specific dates, crop stage, weather dependency
• Decision questions (का, should I) → Give clear yes/no FIRST, then explanation
• Problem questions (काळे, पिवळे, सुकतेय) → Start with diagnosis, then step-by-step solution
• Planning questions (काय करू, plan) → Provide complete timeline with actionable steps
• Comparison questions (चांगले, best, कोणते) → Simple comparison with local context

═══════════════════════════════════════════════════════════════
🌾 AGRICULTURAL ACCURACY RULES (CRITICAL)
═══════════════════════════════════════════════════════════════

1️⃣ LAND-SPECIFIC ADVICE ONLY
• Farmer's land has ONE current crop: ${cropSchedule?.crop_name || landDetails?.current_crop || 'unknown'}
• Current growth stage: ${currentGrowthStage}
• Days since sowing: ${daysSinceSowing || 'unknown'} days
• ONLY give advice for THIS crop at THIS stage, not other crops
• Don't suggest alternatives unless explicitly asked
• If farmer asks "which crop to plant" but already has crop planted, remind them about current crop first!

2️⃣ AUTOMATIC LAND-SPECIFIC CALCULATIONS (MANDATORY)
Always provide:
• Per-acre dose AND total dose for farmer's exact land size
• Format: "प्रति एकर: युरिया 25 किलो → तुमच्या ${landDetails?.area_acres || 'X'} एकरसाठी: युरिया ${landDetails?.area_acres ? Math.round(25 * landDetails.area_acres) : 'X'} किलो"
• Include both standard units AND local measurements
• Example: "25 किलो प्रति एकर (10 किलो प्रति कट्ठा)"

3️⃣ COMPLETE ACTIONABLE STEPS (NOT VAGUE ADVICE)
BAD: "Mix soil well"
GOOD: "ट्रॅक्टरने 6-8 इंच खोल नांगर घालवा, 2 वेळा, नंतर पाटाने सपाट करा"

BAD: "Water during flowering"
GOOD: "जेव्हा 50% फुले येतील (साधारण 45-50 दिवसांनी), ड्रिपमधून 25,000 लिटर पाणी द्या"

4️⃣ TIMING PRECISION (MANDATORY)
Every recommendation MUST include:
• WHEN: "20 दिवसांनंतर" OR "50% फुलांच्या वेळी" OR "दर सोमवार आणि गुरुवार"
• HOW MUCH: Exact quantity for farmer's land size
• HOW: Application method (पसरवून/ओळीत/ड्रिपमधून/फवारणी)

5️⃣ IRRIGATION SPECIFICS
Never say: "पाणी द्या"
Always say: "ड्रिप 4-6 तास चालवा, साधारण 25,000-28,000 लिटर तुमच्या ${landDetails?.area_acres || 'X'} एकरसाठी"

6️⃣ FERTILIZER SOURCE CONVERSION
Convert nutrients to actual products:
• N (Nitrogen) → "युरिया (46% N)" with conversion
• P2O5 (Phosphorus) → "डीएपी (46% P2O5)"
• K2O (Potassium) → "एमओपी (60% K2O)"
Show both: "नायट्रोजन 50 किलो = युरिया 109 किलो"

7️⃣ NO SUCCESS CARDS UNTIL CONFIRMED
• NEVER show green ✅ SUCCESS card until farmer confirms completion
• Wait for: "झाले", "लावले", "केले", "completed"
• Before confirmation, ask: "समजले का?" or "प्रश्न आहे का?"

═══════════════════════════════════════════════════════════════
📱 VISUAL RESPONSE FORMATTING RULES (CRITICAL)
═══════════════════════════════════════════════════════════════

🚫 NEVER USE THESE IN RESPONSES:
❌ Asterisks for emphasis: **word** or *word*
❌ Technical markers: ##, ###, ---, +++, ===
❌ Multiple special characters: **, __, @@, $$
❌ Markdown headers: # Header, ## Subheader
❌ Excessive bullet points (max 3-4 per section)

✅ ALWAYS USE THESE INSTEAD:
✓ Emojis for visual hierarchy: 🌾, 💧, 🌱, 📋, ⚠️, 💰, 📅
✓ Clean numbered lists with NEW LINE for each point: 
  1. First point
  2. Second point
  3. Third point
✓ Simple bullet points on NEW LINE: 
  • Point one
  • Point two
✓ Natural language emphasis: "हे महत्त्वाचे आहे" not **महत्त्वाचे**
✓ Whitespace for readability
✓ Short paragraphs (2-3 sentences max)
✓ EACH NEW POINT MUST START ON A NEW LINE

FORMATTING EXAMPLE (Marathi):
🟢 सेंद्रिय पद्धत:
1. गोबर खत 5 किलो प्रति एकर
2. नीम तेल फवारणी 10 मिली प्रति लिटर
3. दर 15 दिवसांनी वापरा

🟡 खत:
1. युरिया 25 किलो प्रति एकर
2. डीएपी 15 किलो प्रति एकर

⚠️ सावधगिरी:
• पाण्याचे प्रमाण योग्य ठेवा
• अतिरिक्त खत टाकू नका

EMOJI USAGE GUIDELINES (Section Headers):
📋 मुख्य माहिती / Main Information
🌾 शिफारस / Recommendations
💧 पाणी व्यवस्थापन / Water Management
🌱 खत व्यवस्थापन / Fertilizer Management
🐛 कीटक नियंत्रण / Pest Control
💰 खर्च आणि नफा / Cost & Profit
⚠️ सावधगिरी / Precautions
📅 कार्यक्रम / Schedule
📞 संपर्क / Contact
✅ यश मिळवण्यासाठी / For Success

COLOR-CODED CARD TRIGGERS (Auto-format sections):
🟢 सेंद्रिय पद्धत: → Organic/Natural Methods (Green card)
🟡 खत: → Fertilizers (Yellow card)
🔴 कीटकनाशक: → Pesticides (Red card)
🔵 पाणी: → Irrigation (Blue card)
🟣 वाढीचे संप्रेरक: → Growth Hormones (Purple card)
⚠️ महत्त्वाचे: → Warnings (Orange card)
ℹ️ माहिती: → Information (Blue card)

═══════════════════════════════════════════════════════════════
🗣️ LANGUAGE & CULTURAL ADAPTATION
═══════════════════════════════════════════════════════════════

NATURAL CONVERSATIONAL TONE:
• Hindi: Use "आप" with verbs, "कृपया" for requests
• Marathi: Use "तुम्ही" not "तू", action-oriented imperatives "करा", "द्या"
• All languages: Avoid English technical terms unless necessary
• Use local crop names: "ज्वारी" not "sorghum"
• Include traditional knowledge with modern science
• Reference local festivals for timing: "दिवाळीनंतर", "होळीपूर्वी"

MEASUREMENT CONVERSIONS (Always provide both):
• "25 किलो प्रति एकर (10 किलो प्रति कट्ठा)"
• "2000 लिटर पाणी (दोन ड्रम)"
• "50 ग्रॅम प्रति 15 लिटर पाणी (3 मोठे चमचे प्रति बादली)"

═══════════════════════════════════════════════════════════════
⚠️ CRITICAL SAFETY RULES
═══════════════════════════════════════════════════════════════

NEVER provide advice for:
• Banned/illegal pesticides
• Untested chemical combinations
• Quantities that could harm crop or environment
• Medical treatment for humans (redirect to doctor)

ALWAYS mention:
• Protective equipment needed: "हातमोजे आणि मास्क घाला"
• Waiting period before harvest after pesticide use
• Safe disposal: "रिकामी बाटली सुरक्षित फेकून द्या"
• Water source protection during chemical application

═══════════════════════════════════════════════════════════════
📊 RESPONSE QUALITY CHECKLIST
═══════════════════════════════════════════════════════════════

Before sending ANY response, verify:

✓ Accuracy:
  • All measurements are per-acre AND total for farmer's land
  • Timing is specific to current date/season
  • Crop stage is considered
  • Local availability mentioned

✓ Clarity:
  • No technical jargon without explanation
  • No asterisks or markdown formatting
  • Emojis used appropriately
  • Measurements in both standard and local units

✓ Actionability:
  • Clear next steps provided
  • Timeline specified (आज, पुढच्या आठवड्यात, 15 दिवसांनंतर)
  • Quantities mentioned (don't say "adequate", say "25 किलो")
  • Method explained (कसे लावायचे, कधी, कुठे)

✓ Natural Language:
  • No **bold** formatting
  • No ## headers
  • Only emojis for sections
  • Conversational tone like speaking to a friend

═══════════════════════════════════════════════════════════════
REMEMBER: You are having a conversation, not writing a technical document.
Speak naturally, be helpful, and always consider the farmer's specific land and situation.
═══════════════════════════════════════════════════════════════`;

    // ✅ STEP 3: LOAD NDVI AND SOIL DATA (after systemPrompt is constructed)
    if (landId && landDetails) {
      // ============= SELECTIVE DATA LOADING BASED ON QUERY INTENT =============
      let ndviData = null;
      let soilHealthData = null;
        
      // Only load new data if:
      // 1. First message (messageCount === 1), OR
      // 2. Land has changed, OR
      // 3. Long conversation (messageCount > 10)
      const shouldLoadFullData = messageCount === 1 || landHasChanged || messageCount > 10;
      
      // Load data selectively based on what the farmer is asking about
      const needsNDVI = ['pest', 'disease', 'health', 'market'].includes(queryIntent.type);
      const needsSoil = ['fertilizer', 'nutrition', 'health'].includes(queryIntent.type);
      
      if (shouldLoadFullData && needsNDVI) {
        try {
          const { data, error } = await supabase
            .from('ndvi_data')
            .select('*')
            .eq('land_id', landId)
            .order('date', { ascending: false })
            .limit(queryIntent.type === 'health' ? 5 : 1);
          
          if (!error) {
            ndviData = data;
            console.log(`✅ NDVI loaded (${queryIntent.type}):`, ndviData?.length || 0, 'records');
          }
        } catch (ndviError) {
          console.warn('⚠️ Could not load NDVI data:', ndviError);
        }
      } else if (needsNDVI) {
        console.log(`⚡ Skipping NDVI load - using conversation memory (message #${messageCount})`);
      }
      
      if (shouldLoadFullData && needsSoil) {
        try {
          const { data, error } = await supabase
            .from('soil_health')
            .select('*')
            .eq('land_id', landId)
            .order('test_date', { ascending: false })
            .limit(1);
          
          if (!error) {
            soilHealthData = data;
            console.log(`✅ Soil data loaded (${queryIntent.type}):`, soilHealthData?.length || 0, 'records');
          }
        } catch (soilError) {
          console.warn('⚠️ Could not load soil health data:', soilError);
        }
      } else if (needsSoil) {
        console.log(`⚡ Skipping soil load - using conversation memory (message #${messageCount})`);
      }
      
      const latestSoilHealth = soilHealthData && soilHealthData.length > 0 ? soilHealthData[0] : null;
      const latestNDVI = ndviData && ndviData.length > 0 ? ndviData[0] : null;
      
      // Build context based on message count (session-aware caching)
      let contextToSend = '';
      let contextType = 'none';
      
      if (messageCount === 1 || landHasChanged) {
        // First message or land changed: Send FULL compressed context
        contextToSend = buildCompressedContext({
          land: landDetails,
          areaInAcres,
          daysSinceSowing,
          latestSoilHealth,
          latestNDVI,
          ndviData,
          queryIntent,
          cropSchedule,
          currentGrowthStage,
          daysToHarvest
        });
        contextType = 'full';
        console.log(`📦 Sending FULL context (message #${messageCount}${landHasChanged ? ', land changed' : ''}): ~${Math.ceil(contextToSend.length / 4)} tokens`);
      } else if (messageCount >= 2 && messageCount <= 10) {
        // Messages 2-10: Send query-specific minimal context
        contextToSend = getMinimalContext(queryIntent.type, landDetails, areaInAcres, daysSinceSowing, latestSoilHealth, latestNDVI, cropSchedule, currentGrowthStage);
        contextType = 'minimal';
        console.log(`⚡ Sending MINIMAL context (message #${messageCount}, ${queryIntent.type}): ~${Math.ceil(contextToSend.length / 4)} tokens`);
      } else {
        // Message 11+: Send mini-refresh
        contextToSend = getMiniRefresh(landDetails, areaInAcres, latestSoilHealth);
        contextType = 'refresh';
        console.log(`🔄 Sending MINI-REFRESH (message #${messageCount}): ~${Math.ceil(contextToSend.length / 4)} tokens`);
      }
      
      landContext = {
        land_id: landDetails.id,
        name: landDetails.name,
        area_acres: areaInAcres,
        soil_type: landDetails.soil_type,
        location: landDetails.location,
        current_crop: cropSchedule?.crop_name || landDetails.current_crop,
        crop_variety: cropSchedule?.crop_variety,
        sowing_date: cropSchedule?.sowing_date,
        days_since_sowing: daysSinceSowing,
        growth_stage: currentGrowthStage,
        expected_harvest: cropSchedule?.expected_harvest_date,
        days_to_harvest: daysToHarvest,
        crops: landDetails.crops,
        water_source: landDetails.water_source,
        irrigation_type: landDetails.irrigation_type,
        cultivation_date: landDetails.cultivation_date,
        soil_health: latestSoilHealth,
        ndvi_value: latestNDVI?.ndvi_value || latestNDVI?.mean_ndvi,
        ndvi_history: ndviData,
        context_type: contextType,
        message_count: messageCount
      };
      
      if (contextToSend) {
        systemPrompt += `\n\n📊 LAND DATA (${queryIntent.type.toUpperCase()} query, msg #${messageCount}):
${contextToSend}

⚠️ CRITICAL: 
1. Calculate ALL doses for ${areaInAcres} acres. Show per-acre calculation.
2. Remember previous context from conversation history - don't ask for already provided information.`;
      }
    }

    // Get farmer context with enhanced details
    const { data: farmer } = await supabase
      .from('farmers')
      .select('*')
      .eq('id', finalFarmerId)
      .eq('tenant_id', finalTenantId)
      .single();

    if (farmer) {
      farmerDetails = farmer;
      
      // Determine regional title based on state/language
      let regionalTitle = 'Dada'; // Default
      const state = farmer.state?.toLowerCase() || '';
      if (state.includes('maharashtra')) regionalTitle = 'Bhau';
      else if (state.includes('punjab') || state.includes('haryana')) regionalTitle = 'Veere';
      else if (state.includes('tamil') || state.includes('kerala')) regionalTitle = 'Anna';
      else if (state.includes('karnataka')) regionalTitle = 'Avare';
      
      farmerContext = {
        name: farmer.name,
        regional_title: regionalTitle,
        village: farmer.village,
        district: farmer.district,
        state: farmer.state,
        language: farmer.language || detectedLanguage,
        experience: farmer.farming_experience,
        education: farmer.education_level
      };
      
      systemPrompt += `\n\n👨‍🌾 FARMER PROFILE:
You are speaking with ${farmer.name || 'a farmer'}:
- Regional Title: Use "${regionalTitle}" in your greeting
- Location: ${farmer.village || 'Unknown village'}, ${farmer.district || 'Unknown district'}, ${farmer.state || 'India'}
- Total Land: ${farmer.total_land_size || 'Unknown'} acres
- Experience: ${farmer.farming_experience || 'Not specified'} years
- Language: ${farmer.language || detectedLanguage}
- Adjust advice complexity based on experience: ${farmer.farming_experience > 10 ? 'Experienced farmer - can handle advanced techniques' : 'Provide simple, step-by-step guidance'}`;
    }
    
    // Add seasonal context with crop stage if available
    const currentMonth = new Date().getMonth() + 1;
    const season = currentMonth >= 6 && currentMonth <= 10 ? 'Kharif' : 
                   currentMonth >= 10 || currentMonth <= 3 ? 'Rabi' : 'Zaid';
    
    let cropStage = 'Not available';
    if (landDetails?.cultivation_date) {
      cropStage = getCropStage(landDetails.cultivation_date);
    }
    
    systemPrompt += `\n\n📅 SEASONAL & CROP CONTEXT:
- Current Season: ${season} season
- Crop Growth Stage: ${cropStage}
${landDetails?.cultivation_date ? `- Days Since Sowing: ${Math.floor((Date.now() - new Date(landDetails.cultivation_date).getTime()) / (1000 * 60 * 60 * 24))} days` : ''}
- Provide season-specific and stage-specific advice
- Consider weather patterns typical for this season in ${farmerDetails?.state || 'this region'}`;
    
    // ✅ ADD WEATHER DATA TO SYSTEM PROMPT
    if (weatherContext?.has_data) {
      systemPrompt += `\n\n🌤️ REAL-TIME WEATHER DATA (${weatherContext.location}):`;
      
      if (currentWeather) {
        systemPrompt += `

📍 CURRENT CONDITIONS (Updated: ${new Date(currentWeather.updated_at).toLocaleString('en-IN')}):
- Temperature: ${currentWeather.temp}°C (Feels like: ${currentWeather.feels_like}°C)
- Weather: ${currentWeather.description}
- Humidity: ${currentWeather.humidity}%
- Wind: ${currentWeather.wind_speed} km/h
- Rain (1h): ${currentWeather.rain_1h || 0} mm
- Rain (24h): ${currentWeather.rain_24h || 0} mm
- UV Index: ${currentWeather.uv_index || 'N/A'}
- Visibility: ${currentWeather.visibility} km
- Cloud Cover: ${currentWeather.clouds}%
- Sunrise: ${new Date(currentWeather.sunrise).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
- Sunset: ${new Date(currentWeather.sunset).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
- Data Source: ${currentWeather.provider}`;
      }
      
      if (weatherForecast.length > 0) {
        systemPrompt += `\n\n📊 WEATHER FORECAST (Next ${weatherForecast.length} Days):`;
        weatherForecast.forEach((day, index) => {
          const dayName = index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
          systemPrompt += `
${dayName} (${day.date}):
  • Temp: ${day.temp_min}°C - ${day.temp_max}°C (Avg: ${day.temp_avg.toFixed(1)}°C)
  • Rain: ${day.total_rain.toFixed(1)} mm (${day.max_rain_prob}% probability)
  • Humidity: ${day.avg_humidity.toFixed(0)}%
  • Wind: ${day.avg_wind_speed.toFixed(1)} km/h
  • Conditions: ${day.description}`;
        });
      }
      
    systemPrompt += `\n
⚠️ CRITICAL WEATHER INSTRUCTIONS:
As a Very Expert Agriculture Scientist, you MUST:
1. Use this REAL weather data in your response - NEVER make up weather information
2. For agriculture queries needing weather (watering, fertilizer, spray, etc), analyze weather data and provide expert recommendations
3. Provide specific, actionable farming advice based on actual weather:
   • If rain is forecasted (>50% probability), advise postponing spraying/fertilizing with specific timing
   • If temperature is high (>35°C), recommend early morning (5-7 AM) or evening (5-7 PM) irrigation
   • If humidity is high (>80%), warn about fungal disease risk and suggest preventive measures
   • If wind speed is high (>20 km/h), advise against pesticide application and explain why
4. Reference specific forecast data: "Rain expected on ${weatherForecast[0]?.date} with ${weatherForecast[0]?.max_rain_prob}% probability"
5. Always mention data source and update time for transparency
6. Combine weather data with crop stage and soil type for comprehensive expert advice`;
    } else if (isPureWeatherQuery || isAgricultureWithWeather) {
      systemPrompt += `\n\n⚠️ WEATHER DATA NOT AVAILABLE:
Weather data could not be retrieved for this location. Inform the farmer politely that:
- Real-time weather data is temporarily unavailable
- They can check local weather forecasts
- They should visit the Weather section of the app for updates
Do NOT make up or estimate weather information.`;
    }

    // CRITICAL: Add language-specific instruction based on user's selected language
    const languageMap: Record<string, string> = {
      'hi': 'Hindi (हिन्दी)',
      'mr': 'Marathi (मराठी)',
      'en': 'English',
      'pa': 'Punjabi (ਪੰਜਾਬੀ)',
      'ta': 'Tamil (தமிழ்)',
      'te': 'Telugu (తెలుగు)',
      'bn': 'Bengali (বাংলা)',
      'gu': 'Gujarati (ગુજરાતી)',
      'kn': 'Kannada (ಕನ್ನಡ)',
      'ml': 'Malayalam (മലയാളം)',
      'or': 'Odia (ଓଡ଼ିଆ)',
      'as': 'Assamese (অসমীয়া)',
      'ur': 'Urdu (اردو)'
    };

    // ✅ FIX: Use user's selected language preference (not detected language)
    const languageName = languageMap[language] || languageMap['en'];
    
    systemPrompt += `\n\n🌍 LANGUAGE INSTRUCTION (CRITICAL):
You MUST respond ENTIRELY in ${languageName}.
- Do NOT use English unless the user's language is English
- Translate ALL content including greetings, recommendations, technical terms
- Use natural, conversational ${languageName}
- Keep technical terms simple and explain them in ${languageName}
- Farmer's preferred language: ${languageName}

⚠️ LANGUAGE SIMPLICITY RULES:
- Use everyday rural farming words, not technical terms
- English: Say "watering" not "irrigation", "amount" not "dosage", "cutting crop" not "harvest"
- Hindi: कहें "डालना" न कि "अनुप्रयोग", "मात्रा" न कि "खुराक", "पानी देना" न कि "सिंचाई"
- Marathi: सांगा "टाकणे" नाही "अनुप्रयोग", "प्रमाण" नाही "डोस", "पाणी देणे" नाही "सिंचन"
- Explain scientific names in simple words (e.g., "Urea = white fertilizer for green leaves")`;

    // ✅ Helper: Detect simple questions for smart model selection
    function isSimpleQuestion(text: string): boolean {
      const simplePatterns = [
        /^(hi|hello|namaste|namaskar|नमस्ते|नमस्कार|hey|hola)/i,
        /^(yes|no|हाँ|नहीं|हो|नाही|होय|ஆம்|இல்லை)/i,
        /^(ok|okay|thanks|thank you|धन्यवाद|नन्दी|ధన్యవాదాలు)/i,
        /^(bye|goodbye|अलविदा|விடை)/i
      ];
      const wordCount = text.trim().split(/\s+/).length;
      return wordCount <= 5 || simplePatterns.some(p => p.test(text.trim()));
    }

    // Detect InstaScan mode (vision analysis)
    const isInstaScan = !!imageUrl;
    
    // Prepare messages for OpenAI
    let openAIMessages: any[] = [];
    
    // ✅ MODEL SELECTION: gpt-4o-mini for chat, gpt-4o for vision
    let openAIModel = isInstaScan 
      ? 'gpt-4o'  // Vision model for InstaScan
      : 'gpt-4o-mini'; // Fast & cost-effective for all chat queries
    
    console.log(`🤖 Model selected: ${openAIModel} (${isInstaScan ? 'vision' : 'chat'} mode)`);
    
    let tools = undefined;
    let tool_choice = undefined;

    if (isInstaScan) {
      // InstaScan: Vision analysis with structured output
      console.log('InstaScan mode: Analyzing crop image with vision API');
      openAIModel = 'gpt-4o'; // Full vision model for better agricultural accuracy
      
      const instaScanPrompt = `You are an expert agricultural botanist with 20+ years of field experience in crop identification and disease diagnosis.

🎯 YOUR MISSION: Analyze this crop image and provide ACCURATE, SPECIFIC identification.

📸 VISION ANALYSIS GUIDELINES:

**Step 1: Examine the Image Quality**
- Check if the image shows clear plant features (leaves, stems, flowers, fruits)
- Verify adequate lighting and focus
- Confirm the plant takes up most of the frame

**Step 2: Identify Distinctive Features**
Look for these key identifiers:
- LEAF SHAPE: Broad, narrow, serrated, smooth edges?
- LEAF ARRANGEMENT: Alternate, opposite, whorled?
- STEM: Round, square, hollow? Color?
- PLANT HEIGHT & STRUCTURE: Tall grass-like, bushy, vine?
- FLOWERS/FRUITS: Present? What color and shape?
- GROWTH PATTERN: Single stalk, multiple branches, creeping?

**Step 3: Match to Known Crops**

🌾 CEREAL CROPS (Grass-like, tall, grain heads):
- Wheat: Narrow leaves, hollow stem, grain spikes at top
- Rice: Narrow leaves, flooded fields, drooping grain panicles
- Maize/Corn: Broad leaves, thick stem, tassels/ears
- Barley: Similar to wheat but with long awns on grain

🌱 LEGUME CROPS (Compound leaves, pod fruits):
- Chickpea: Pinnate leaves, small white/pink flowers
- Soybean: Trifoliate leaves, small pods
- Lentil: Pinnate leaves, tiny flowers

🍅 VEGETABLE CROPS (Varied structures):
- Tomato: Compound leaves, yellow flowers, red fruits
- Potato: Compound leaves, white/purple flowers, underground tubers
- Onion: Hollow tube-like leaves, bulb base
- Cotton: Broad palmate leaves, white/pink flowers, cotton bolls

🌾 CASH CROPS:
- Sugarcane: Tall thick canes with nodes, strap-like leaves
- Tea: Small shiny leaves, white flowers
- Coffee: Glossy opposite leaves, red berries

❌ NON-CROPS (Report as "Unknown Plant" or "Not a Crop"):
- Grass lawns (too uniform, too short)
- Weeds (dock, thistle, dandelion)
- Ornamental plants
- Random vegetation without clear crop features

**Step 4: Disease/Pest Detection**

🔍 Look for these specific symptoms:

FUNGAL DISEASES:
- Powdery white coating → Powdery Mildew
- Yellow-orange pustules → Rust (Leaf Rust, Stem Rust)
- Brown spots with yellow halos → Leaf Spot
- Gray fuzzy growth → Gray Mold (Botrytis)

BACTERIAL DISEASES:
- Water-soaked lesions → Bacterial Blight
- Black streaks on leaves → Bacterial Streak

VIRAL DISEASES:
- Yellow mosaic patterns → Mosaic Virus
- Stunted growth + yellowing → Yellow Dwarf Virus

PEST DAMAGE:
- Curled leaves with tiny insects → Aphids
- Holes in leaves → Caterpillar/Beetle damage
- Webbing on leaves → Spider Mites
- Whitish scales on stems → Scale Insects

NUTRIENT DEFICIENCIES:
- Yellow older leaves, green veins → Iron Deficiency
- Yellow older leaves, uniform → Nitrogen Deficiency
- Purple tint on leaves → Phosphorus Deficiency
- Brown leaf edges → Potassium Deficiency

**Step 5: Generate Specific Recommendations**

✅ GOOD RECOMMENDATIONS (Be this specific):
- "Apply Mancozeb 75% WP fungicide at 2g/L water every 7 days"
- "Spray Neem oil (Azadirachtin 1500ppm) at 5ml/L water in evening"
- "Apply Urea fertilizer at 50kg/acre split into 3 doses"
- "Increase irrigation frequency to twice weekly"
- "Remove and destroy infected leaves to prevent spread"

❌ BAD RECOMMENDATIONS (Too vague):
- "Use fungicides" 
- "Improve nutrition"
- "Water properly"

🎯 CONFIDENCE LEVELS:

**85-100% (Report with certainty)**
- Image is sharp, well-lit, shows multiple identifying features
- Clear match to known crop with distinctive characteristics
- Example: "This is definitely Wheat based on the narrow leaves, hollow stem, and grain spikes"

**70-84% (Good identification)**
- Most features visible but some ambiguity
- Crop type clear but specific variety uncertain
- Example: "This appears to be Rice based on leaf shape and growth pattern"

**Below 70% (Do NOT identify - use "Unknown Plant")**
- Blurry image, poor lighting, or unclear features
- Could be multiple crop types or non-crop plant
- Example: Return "Unknown Plant" with confidence 40-60%

🌐 LANGUAGE: Respond in ${detectedLanguage === 'en' ? 'English' : detectedLanguage === 'hi' ? 'Hindi' : detectedLanguage === 'mr' ? 'Marathi' : detectedLanguage === 'pa' ? 'Punjabi' : detectedLanguage === 'ta' ? 'Tamil' : 'the user\'s language'}.

⚠️ CRITICAL RULES:
1. NEVER guess if uncertain - use "Unknown Plant" with low confidence
2. ALWAYS provide specific disease names, not "some disease"
3. ALWAYS give actionable recommendations with product names and quantities
4. If image is too blurry/dark/unclear, report low confidence (<50%) and suggest retaking photo

NOW ANALYZE THE IMAGE CAREFULLY AND RESPOND.`;

      // Vision message format
      openAIMessages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: instaScanPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high' // High detail for accurate crop analysis
              }
            }
          ]
        }
      ];

      // Structured output using tool calling for reliable JSON
      tools = [
        {
          type: 'function',
          function: {
            name: 'analyze_crop_image',
            description: 'Return structured crop analysis results',
            parameters: {
              type: 'object',
              properties: {
                cropName: {
                  type: 'string',
                  description: 'Exact name of the identified crop (e.g., "Wheat", "Rice Paddy", "Cotton"). Use "Unknown Plant" or "Not a Crop" if uncertain or not a recognizable agricultural crop.'
                },
                condition: {
                  type: 'string',
                  enum: ['healthy', 'warning', 'critical'],
                  description: 'Overall health status of the crop'
                },
                diseases: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of SPECIFIC disease names, pest names, or nutrient deficiencies detected (e.g., "Powdery Mildew", "Aphid Infestation", "Iron Deficiency"). Empty array [] if crop is healthy.'
                },
                suggestions: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '3-5 SPECIFIC, ACTIONABLE recommendations with exact product names, quantities, or methods (e.g., "Spray Chlorpyrifos 20% EC at 2ml/L water", "Apply Urea fertilizer 50kg/acre"). Be precise and practical.'
                },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                  description: 'Confidence level of crop identification and analysis (0-100). 85-100: Very certain, 70-84: Good certainty, 50-69: Uncertain, <50: Cannot identify reliably'
                }
              },
              required: ['cropName', 'condition', 'diseases', 'suggestions', 'confidence'],
              additionalProperties: false
            }
          }
        }
      ];
      tool_choice = { type: 'function', function: { name: 'analyze_crop_image' } };
      
    } else {
      // Regular chat mode
      openAIMessages = [
        { role: 'system', content: systemPrompt }
      ];

      // Get conversation history from database
      const { data: messageHistory } = await supabase
        .from('ai_chat_messages')
        .select('role, content')
        .eq('session_id', currentSessionId)
        .order('created_at', { ascending: true })
        .limit(10);

      // Filter out empty messages before adding to history
      if (messageHistory && messageHistory.length > 0) {
        const validMessages = messageHistory.filter(msg => 
          msg.content && msg.content.trim().length > 0
        );
        openAIMessages.push(...validMessages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })));
      }

      // Add current messages - handle both old and new format
      if (messages && messages.length > 0) {
        for (const msg of messages) {
          if (typeof msg === 'string') {
            openAIMessages.push({ role: 'user', content: msg });
          } else if (msg && typeof msg === 'object') {
            openAIMessages.push({
              role: msg.role || 'user',
              content: msg.content || ''
            });
          }
        }
      }
    }

    // ============================================
    // SMART RESPONSE LENGTH CONTROL
    // ============================================
    
    // Analyze query complexity (only for non-InstaScan queries)
    let complexityAnalysis = null;
    if (!isInstaScan) {
      const lastUserMsg = messages[messages.length - 1];
      const userQuery = typeof lastUserMsg === 'string' ? lastUserMsg : lastUserMsg?.content || '';
      
      complexityAnalysis = analyzeQueryComplexity(userQuery, detectedLanguage);
      
      console.log(`📊 Query Analysis:`, {
        query: userQuery.substring(0, 50) + '...',
        complexity: complexityAnalysis.complexity,
        maxWords: complexityAnalysis.maxWords,
        maxTokens: complexityAnalysis.maxTokens,
        style: complexityAnalysis.responseStyle
      });
      
      // Add length instruction to system prompt
      const lengthInstruction = getResponseLengthInstruction(
        complexityAnalysis.complexity,
        detectedLanguage
      );
      
      // Update the system prompt for regular chat mode
      if (openAIMessages[0]?.role === 'system') {
        openAIMessages[0].content += '\n\n' + lengthInstruction;
        console.log(`📝 Added ${complexityAnalysis.complexity} complexity instructions to system prompt`);
      }
    }

    // Call OpenAI API
    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Calling OpenAI API:', { 
      model: openAIModel, 
      isInstaScan, 
      messagesCount: openAIMessages.length,
      hasTools: !!tools 
    });

    // ✅ TOKEN LIMITS: gpt-4o-mini doesn't have reasoning token overhead
    // Set appropriate limits based on query complexity
    let maxTokens: number;
    if (isInstaScan) {
      maxTokens = 1500; // Vision tasks
    } else if (complexityAnalysis) {
      // GPT-4o-mini: Simple: 200-300 words, Medium: 500-600 words, Complex: 1000-1200 words
      maxTokens = complexityAnalysis.complexity === 'simple' 
        ? 400 
        : complexityAnalysis.complexity === 'medium' 
          ? 800 
          : 1500;
      console.log(`⚙️ Token limit set to: ${maxTokens} (${complexityAnalysis.complexity} query)`);
    } else {
      maxTokens = 1000; // Default fallback
    }

    console.log(`⚙️ Final token limit: ${maxTokens} (model: ${openAIModel})`);

    const openAIRequestBody: any = {
      model: openAIModel,
      messages: openAIMessages,
      max_tokens: maxTokens,  // gpt-4o-mini uses max_tokens not max_completion_tokens
      temperature: 0.7,       // Add creativity control (supported by gpt-4o-mini)
      stream: false
    };

    if (tools) {
      openAIRequestBody.tools = tools;
      openAIRequestBody.tool_choice = tool_choice;
    }

    // ✅ RETRY LOGIC: OpenAI API call with exponential backoff
    async function callOpenAIWithRetry(maxRetries = 3): Promise<Response> {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          console.log(`🔄 OpenAI API call attempt ${attempt + 1}/${maxRetries}`);
          
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(openAIRequestBody),
          });

          // Success case
          if (response.ok) {
            console.log(`✅ OpenAI API call succeeded on attempt ${attempt + 1}`);
            return response;
          }

          // Rate limit - wait and retry
          if (response.status === 429) {
            const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
            console.warn(`⚠️ Rate limit hit (429), waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }

          // Non-retryable error
          const errorData = await response.text();
          console.error(`❌ OpenAI API error (attempt ${attempt + 1}):`, errorData);
          throw new Error(`OpenAI API failed: ${response.status} - ${errorData}`);

        } catch (error) {
          // Last attempt - throw error
          if (attempt === maxRetries - 1) {
            console.error(`❌ OpenAI API call failed after ${maxRetries} attempts:`, error);
            throw error;
          }

          // Retry with exponential backoff
          const waitTime = Math.pow(2, attempt) * 1000;
          console.warn(`⚠️ OpenAI API error, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries}):`, error);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
      
      throw new Error('OpenAI API call failed after all retries');
    }

    const openAIResponse = await callOpenAIWithRetry();

    const aiData = await openAIResponse.json();
    
    // Add detailed logging for regular chat (similar to InstaScan)
    console.log('📝 OpenAI Response:', {
      model: aiData.model,
      finishReason: aiData.choices[0]?.finish_reason,
      hasContent: !!aiData.choices[0]?.message?.content,
      contentLength: aiData.choices[0]?.message?.content?.length || 0,
      tokensUsed: aiData.usage,
      language: detectedLanguage,
      // Show reasoning vs content token breakdown
      reasoningTokens: aiData.usage?.completion_tokens_details?.reasoning_tokens || 0,
      contentTokens: (aiData.usage?.completion_tokens || 0) - (aiData.usage?.completion_tokens_details?.reasoning_tokens || 0)
    });
    
    // Enhanced logging for debugging
    if (isInstaScan) {
      console.log('📸 InstaScan - Full OpenAI Response:', JSON.stringify({
        model: aiData.model,
        finishReason: aiData.choices[0].finish_reason,
        hasToolCalls: !!aiData.choices[0].message.tool_calls,
        toolCallsCount: aiData.choices[0].message.tool_calls?.length || 0,
        contentPreview: aiData.choices[0].message.content?.substring(0, 100),
        tokensUsed: aiData.usage,
        timestamp: new Date().toISOString()
      }, null, 2));
      
      if (aiData.choices[0].message.tool_calls) {
        console.log('🔧 Tool Call Details:', JSON.stringify(
          aiData.choices[0].message.tool_calls[0],
          null,
          2
        ));
      }
    }
    
    let aiMessage: string;
    let structuredResult = null;

    // Handle structured output from tool calling
    if (isInstaScan && aiData.choices[0].message.tool_calls) {
      const toolCall = aiData.choices[0].message.tool_calls[0];
      try {
        structuredResult = JSON.parse(toolCall.function.arguments);
        console.log('✅ InstaScan analysis completed:', {
          cropName: structuredResult.cropName,
          condition: structuredResult.condition,
          diseaseCount: structuredResult.diseases?.length || 0,
          confidence: structuredResult.confidence
        });
        
        // Validate critical fields
        if (!structuredResult.cropName || !structuredResult.condition || !structuredResult.confidence) {
          console.error('❌ Missing critical fields in InstaScan result:', structuredResult);
          throw new Error('Incomplete crop analysis - missing required fields');
        }
        
        // Format as readable text for storage
        aiMessage = `Crop: ${structuredResult.cropName}\nCondition: ${structuredResult.condition}\nDiseases: ${structuredResult.diseases.join(', ') || 'None'}\nSuggestions: ${structuredResult.suggestions.join(' ')}`;
      } catch (e) {
        console.error('❌ Failed to parse InstaScan tool call:', e, toolCall);
        throw new Error('Failed to parse crop analysis results');
      }
    } else {
      aiMessage = aiData.choices[0].message.content;
      
      // CRITICAL: Validate AI response is not empty
      if (!aiMessage || aiMessage.trim().length === 0) {
        console.error('❌ OpenAI returned empty response:', {
          finishReason: aiData.choices[0]?.finish_reason,
          model: aiData.model,
          usage: aiData.usage,
          sessionId: currentSessionId,
          messagesCount: openAIMessages.length,
          detectedLanguage: detectedLanguage,
          requestedLanguage: language
        });
        
        // ✅ FIX: Return error in user's language, not English
        const errorMessages: Record<string, string> = {
          'en': '🙏 Sorry, I had trouble answering your question. Please try again.',
          'hi': '🙏 क्षमा करें, मुझे आपके प्रश्न का उत्तर देने में समस्या हुई। कृपया पुनः प्रयास करें।',
          'mr': '🙏 माफ करा, मला तुमच्या प्रश्नाचे उत्तर देण्यात अडचण आली. कृपया पुन्हा प्रयत्न करा.',
          'ta': '🙏 மன்னிக்கவும், உங்கள் கேள்விக்கு பதிலளிக்க சிரமம். மீண்டும் முயற்சிக்கவும்.',
          'te': '🙏 క్షమించండి, మీ ప్రశ్నకు సమాధానం ఇవ్వడంలో సమస్య. దయచేసి మళ్లీ ప్రయత్నించండి.',
          'bn': '🙏 দুঃখিত, আপনার প্রশ্নের উত্তর দিতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
          'gu': '🙏 માફ કરશો, તમારા પ્રશ્નનો જવાબ આપવામાં સમસ્યા. કૃપા કરીને ફરી પ્રયાસ કરો.',
          'pa': '🙏 ਮਾਫ਼ ਕਰਨਾ, ਤੁਹਾਡੇ ਸਵਾਲ ਦਾ ਜਵਾਬ ਦੇਣ ਵਿੱਚ ਸਮੱਸਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
          'kn': '🙏 ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರಿಸಲು ತೊಂದರೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
          'ml': '🙏 ക്ഷമിക്കണം, നിങ്ങളുടെ ചോദ്യത്തിന് ഉത്തരം നൽകാൻ പ്രയാസം. വീണ്ടും ശ്രമിക്കൂ.',
          'or': '🙏 କ୍ଷମା କରନ୍ତୁ, ଆପଣଙ୍କ ପ୍ରଶ୍ନର ଉତ୍ତର ଦେବାରେ ସମସ୍ୟା। ପୁନର୍ବାର ଚେଷ୍ଟା କରନ୍ତୁ।',
          'as': '🙏 ক্ষমা কৰিব, আপোনাৰ প্ৰশ্নৰ উত্তৰ দিবলৈ সমস্যা। অনুগ্ৰহ কৰি পুনৰ চেষ্টা কৰক।',
          'ur': '🙏 معاف کریں، آپ کے سوال کا جواب دینے میں مشکل۔ براہ کرم دوبارہ کوشش کریں۔'
        };
        
        // ✅ FIX: Use user's selected language (not detected language) for error messages
        aiMessage = errorMessages[language] || errorMessages[detectedLanguage] || errorMessages['en'];
        
        // Log for monitoring
        console.warn('⚠️ Using fallback error message:', {
          userLanguage: language,
          detectedLanguage: detectedLanguage,
          message: aiMessage
        });
      }
      
      // ============================================
      // ENFORCE RESPONSE LENGTH LIMIT
      // ============================================
      if (complexityAnalysis && aiMessage && aiMessage.trim().length > 0) {
        const originalWordCount = aiMessage.split(/\s+/).length;
        console.log(`✅ AI response received: ${originalWordCount} words`);
        
        // Enforce length limit based on complexity
        aiMessage = enforceResponseLength(
          aiMessage,
          complexityAnalysis.maxWords,
          detectedLanguage
        );
        
        const finalWordCount = aiMessage.split(/\s+/).length;
        if (finalWordCount < originalWordCount) {
          console.log(`✂️ Response truncated: ${originalWordCount} → ${finalWordCount} words`);
        }
      }
    }
    const tokensUsed = aiData.usage?.total_tokens || 0;

    // For InstaScan, return structured result immediately
    if (isInstaScan && structuredResult) {
      return new Response(
        JSON.stringify({ 
          success: true,
          result: structuredResult,
          responseTime: Date.now() - startTime,
          tokensUsed
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Save messages to database
    // ✅ Reuse lastUserMessage already declared at line 33
    const responseTime = Date.now() - startTime;
    
    // Enhanced metadata for AI training
    const enhancedMetadata = {
      weather_context: weatherContext,
      farmer_context: farmerContext,
      land_context: landContext,
      crop_season: getCropSeason(),
      agro_climatic_zone: landDetails?.agro_climatic_zone || farmerDetails?.agro_climatic_zone,
      soil_zone: landDetails?.soil_type,
      rainfall_zone: farmerDetails?.rainfall_zone,
      language,
      timestamp: new Date().toISOString()
    };
    
    if (lastUserMessage) {
      // Save user message with enhanced metadata for training
      const userMessageContent = typeof lastUserMessage === 'string' ? lastUserMessage : lastUserMessage.content;
      const { error: userMsgError } = await supabase
        .from('ai_chat_messages')
        .insert({
          session_id: currentSessionId,
          tenant_id: finalTenantId,
          farmer_id: finalFarmerId,
          role: 'user',
          content: userMessageContent,
          status: 'sent',
          language: language, // ✅ FIX: Use user's selected language
          message_type: imageUrl || fileContent ? 'multimedia' : 'text',
          word_count: userMessageContent ? userMessageContent.split(/\s+/).length : 0,
          land_context: landContext,
          weather_context: weatherContext,
          crop_context: landContext?.crops,
          location_context: {
            village: farmerDetails?.village,
            district: farmerDetails?.district,
            state: farmerDetails?.state
          },
          crop_season: getCropSeason(),
          agro_climatic_zone: landDetails?.agro_climatic_zone || farmerDetails?.agro_climatic_zone,
          soil_zone: landDetails?.soil_type,
          rainfall_zone: farmerDetails?.rainfall_zone,
          image_urls: imageUrl ? [imageUrl] : null,
          attachments: fileContent ? [{ type: 'file', content: fileContent }] : null,
          metadata: enhancedMetadata,
          user_agent: req.headers.get('user-agent') || null,
          ip_address: req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('cf-connecting-ip') || null
        });
        
      if (userMsgError) {
        console.error('Error saving user message:', userMsgError);
      }
    }

    // Extract section tags from AI response for training data
    const sectionTags = extractSectionTags(aiMessage);
    
    // Only save AI response if it has content
    if (aiMessage && aiMessage.trim().length > 0) {
      // Save AI response with enhanced metadata for training
      const { error: aiMsgError } = await supabase
        .from('ai_chat_messages')
        .insert({
          session_id: currentSessionId,
          tenant_id: finalTenantId,
          farmer_id: finalFarmerId,
          role: 'assistant',
          content: aiMessage,
          status: 'sent',
          language: language, // ✅ FIX: Use user's selected language
          message_type: 'text',
          word_count: aiMessage ? aiMessage.split(/\s+/).length : 0,
          land_context: landContext,
          weather_context: weatherContext,
          crop_context: landContext?.current_crop ? {
            crop_name: landContext.current_crop,
            crop_stage: landDetails?.cultivation_date ? getCropStage(landDetails.cultivation_date) : null,
            days_since_sowing: landDetails?.cultivation_date ? 
              Math.floor((Date.now() - new Date(landDetails.cultivation_date).getTime()) / (1000 * 60 * 60 * 24)) : 0,
            soil_npk: landContext?.soil_npk,
            ndvi_value: landContext?.ndvi_value,
            soil_moisture: landContext?.soil_moisture
          } : landContext?.crops,
        location_context: {
          village: farmerDetails?.village,
          district: farmerDetails?.district,
          state: farmerDetails?.state
        },
        crop_season: getCropSeason(),
        agro_climatic_zone: landDetails?.agro_climatic_zone || farmerDetails?.agro_climatic_zone,
        soil_zone: landDetails?.soil_type,
        rainfall_zone: farmerDetails?.rainfall_zone,
        ai_model: 'gpt-4o-mini', // Fast, cost-effective model for farmer chat
        response_time_ms: responseTime,
        tokens_used: tokensUsed,
        metadata: {
          ...enhancedMetadata,
          prompt_tokens: aiData.usage?.prompt_tokens,
          completion_tokens: aiData.usage?.completion_tokens,
          quick_replies: generateQuickReplies(lastUserMessage?.content || '', aiMessage, landDetails),
          section_tags: sectionTags, // For AI training classification
          regional_title: farmerContext?.regional_title,
          land_size_acres: landContext?.area_acres,
          model_info: 'Using GPT-4o-mini for multilingual, fast farmer assistance'
        }
      });
      
      if (aiMsgError) {
        console.error('Error saving AI response:', aiMsgError);
      }
    } else {
      console.warn('⚠️ Skipping save - AI message is empty');
    }
    
    // Detect critical alerts and send push notifications
    const isCritical = detectCriticalAlert(aiMessage, sectionTags);
    if (isCritical.shouldNotify) {
      // Send push notification in background (don't await)
      EdgeRuntime.waitUntil(
        sendCriticalAlert(
          supabase,
          finalTenantId,
          finalFarmerId,
          isCritical,
          aiMessage,
          landId,
          currentSessionId
        )
      );
    }
    
    // Update session activity with context tracking
    await supabase
      .from('ai_chat_sessions')
      .update({
        updated_at: new Date().toISOString(),
        metadata: {
          last_activity: new Date().toISOString(),
          total_messages: (currentSession?.metadata?.total_messages || 0) + 2,
          last_land_id: landId,
          message_count: messageCount + 1, // Track message count for caching logic
          last_context_type: landContext?.context_type || 'none',
          context_sent: landContext?.context_type === 'full', // Full context sent?
          last_query_intent: queryIntent.type,
          query_intent_confidence: queryIntent.confidence,
          // ✅ NEW: Track complexity for analytics
          last_query_complexity: complexityAnalysis?.complexity,
          last_max_words: complexityAnalysis?.maxWords,
          last_max_tokens: complexityAnalysis?.maxTokens
        }
      })
      .eq('id', currentSessionId);

    // ✅ FIX: Generate language-specific quick replies
    const quickReplies = generateMultilingualQuickReplies(
      queryIntent.type,
      language, // Use user's selected language
      aiMessage
    );
    console.log(`💬 Generated quick replies in ${language}:`, quickReplies);
    
    // Parse response to structured cards for color-coded UI
    const structuredResponse = parseResponseToCards(aiMessage, language);

    // ============= TOKEN SAVINGS ANALYTICS =============
    // Estimate token savings from smart caching
    const estimatedFullContextTokens = 180; // Average full context
    const estimatedMinimalContextTokens = landContext?.context_type === 'minimal' ? 60 : 
                                         landContext?.context_type === 'refresh' ? 30 : 
                                         landContext?.context_type === 'full' ? 180 : 0;
    const tokensSaved = messageCount > 1 ? estimatedFullContextTokens - estimatedMinimalContextTokens : 0;
    
    console.log(`💰 TOKEN EFFICIENCY (msg #${messageCount}):`);
    console.log(`   Context type: ${landContext?.context_type || 'none'}`);
    console.log(`   Tokens sent: ~${estimatedMinimalContextTokens}`);
    console.log(`   Tokens saved: ~${tokensSaved} (vs full context)`);
    console.log(`   Cumulative savings: ~${tokensSaved * (messageCount - 1)} tokens this session`);

    return new Response(
      JSON.stringify({ 
        response: aiMessage,
        sessionId: currentSessionId,
        quickReplies,
        structuredResponse, // ✅ NEW: Color-coded cards for modern UI
        responseTime,
        detectedLanguage,
        landContext,
        analytics: {
          messageCount,
          contextType: landContext?.context_type || 'none',
          queryIntent: queryIntent.type,
          queryConfidence: queryIntent.confidence,
          // ✅ NEW: Add complexity analytics
          queryComplexity: complexityAnalysis?.complexity,
          maxWords: complexityAnalysis?.maxWords,
          maxTokens: complexityAnalysis?.maxTokens,
          tokensSaved,
          cumulativeSavings: tokensSaved * Math.max(0, messageCount - 1)
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in AI chat function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    
    // Determine appropriate status code
    let statusCode = 500;
    if (errorMessage.includes('Missing') || errorMessage.includes('Invalid')) {
      statusCode = 400;
    } else if (errorMessage.includes('unauthorized') || errorMessage.includes('Unauthorized')) {
      statusCode = 401;
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }),
      { 
        status: statusCode, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function getCropSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 6 && month <= 10) return 'Kharif';
  if (month >= 10 || month <= 3) return 'Rabi';
  return 'Zaid';
}

function getCropStage(cultivationDate: string): string {
  const daysElapsed = Math.floor((Date.now() - new Date(cultivationDate).getTime()) / (1000 * 60 * 60 * 24));
  if (daysElapsed < 30) return 'seedling';
  if (daysElapsed < 60) return 'vegetative';
  if (daysElapsed < 90) return 'flowering';
  return 'harvest';
}

function extractSectionTags(message: string): string[] {
  const tags: string[] = [];
  
  if (message.includes('🟢') && message.includes('Organic Practices')) tags.push('organic_practices');
  if (message.includes('🟡') && message.includes('Fertilizer Schedule')) tags.push('fertilizer_schedule');
  if (message.includes('🔴') && message.includes('Pesticide')) tags.push('pesticide_management');
  if (message.includes('🟣') && message.includes('Hormone')) tags.push('growth_promoters');
  if (message.includes('🟢') && message.includes('Advisory Note')) tags.push('advisory_note');
  
  // Content-based classification for training
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('irrigation') || lowerMsg.includes('water')) tags.push('irrigation');
  if (lowerMsg.includes('disease') || lowerMsg.includes('pest')) tags.push('pest_disease');
  if (lowerMsg.includes('weather') || lowerMsg.includes('rain')) tags.push('weather');
  if (lowerMsg.includes('market') || lowerMsg.includes('price')) tags.push('market_info');
  if (lowerMsg.includes('income') || lowerMsg.includes('yield')) tags.push('income_optimization');
  
  return [...new Set(tags)]; // Remove duplicates
}

// Detect if message contains critical alerts
function detectCriticalAlert(message: string, sectionTags: string[]) {
  const lowerMsg = message.toLowerCase();
  
  // Critical keywords for different alert types
  const criticalPatterns = {
    pest: {
      keywords: ['pest attack', 'pest infestation', 'disease outbreak', 'immediately spray', 'urgent', 'critical'],
      priority: 'critical',
      type: 'pest'
    },
    weather: {
      keywords: ['heavy rain', 'storm', 'drought', 'extreme heat', 'frost', 'weather warning', 'climate alert'],
      priority: 'high',
      type: 'weather'
    },
    pesticide: {
      keywords: ['apply pesticide', 'spray immediately', 'fungicide', 'insecticide', 'urgent treatment'],
      priority: 'high',
      type: 'critical_recommendation'
    },
    fertilizer: {
      keywords: ['fertilizer shortage', 'nutrient deficiency', 'immediate application'],
      priority: 'medium',
      type: 'critical_recommendation'
    }
  };
  
  // Check for critical patterns
  for (const [category, pattern] of Object.entries(criticalPatterns)) {
    const hasKeyword = pattern.keywords.some(kw => lowerMsg.includes(kw));
    const hasTag = sectionTags.includes(category) || sectionTags.includes(pattern.type);
    
    if (hasKeyword || (hasTag && pattern.priority === 'critical')) {
      // Extract title from first 100 characters
      const titleMatch = message.match(/^[👨‍🌾🌾🟢🟡🔴🟣\s]*(.*?)[\n\r]/);
      const title = titleMatch ? titleMatch[1].trim() : 'Critical Agricultural Alert';
      
      return {
        shouldNotify: true,
        alertType: pattern.type,
        priority: pattern.priority,
        title: title.substring(0, 50),
        category
      };
    }
  }
  
  return { shouldNotify: false };
}

// Send critical alert push notification with integrated Web Push
async function sendCriticalAlert(
  supabase: any,
  tenantId: string,
  farmerId: string,
  alertInfo: any,
  message: string,
  landId: string | undefined,
  chatMessageId: string
) {
  try {
    console.log('Sending critical alert notification:', alertInfo);
    
    // Extract summary (first 200 chars or first section)
    let summary = message.substring(0, 200).trim();
    if (summary.length === 200) summary += '...';
    
    // Get VAPID keys from environment
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.warn('VAPID keys not configured - skipping push notification');
      return;
    }

    // Get active push subscriptions for this farmer
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('farmer_id', farmerId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      return;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No active subscriptions found for farmer');
      return;
    }

    console.log(`Sending ${subscriptions.length} push notifications`);

    // Prepare notification payload
    const title = `🚨 ${alertInfo.title}`;
    const payload = JSON.stringify({
      title,
      body: summary,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: alertInfo.alertType,
      requireInteraction: alertInfo.priority === 'critical' || alertInfo.priority === 'high',
      data: {
        category: alertInfo.category,
        chatMessageId,
        url: landId ? `/app/land/${landId}` : '/app/chat',
        alertType: alertInfo.alertType,
        landId
      }
    });

    // Send push notifications to all subscriptions
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh_key,
              auth: sub.auth_key
            }
          };

          await sendWebPush(pushSubscription, payload, {
            vapidPublicKey: VAPID_PUBLIC_KEY,
            vapidPrivateKey: VAPID_PRIVATE_KEY,
            subject: 'mailto:support@kisanshakti.com'
          });

          // Log notification in database
          await supabase.from('alert_notifications').insert({
            tenant_id: tenantId,
            farmer_id: farmerId,
            alert_type: alertInfo.alertType,
            title,
            message: summary,
            priority: alertInfo.priority,
            data: { category: alertInfo.category, chatMessageId },
            land_id: landId,
            chat_message_id: chatMessageId
          });

          return { success: true, farmerId };
        } catch (error: any) {
          console.error(`Failed to send to subscription ${sub.id}:`, error);
          
          // Mark subscription as inactive if endpoint is gone (410)
          if (error.status === 410) {
            await supabase
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id);
          }
          
          return { success: false, farmerId, error: error.message };
        }
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`Successfully sent ${successCount}/${subscriptions.length} notifications`);
  } catch (error) {
    console.error('Failed to send critical alert:', error);
    // Don't throw - notification failure shouldn't break the chat
  }
}

// Helper function to send web push using fetch
async function sendWebPush(
  subscription: any,
  payload: string,
  options: { vapidPublicKey: string; vapidPrivateKey: string; subject: string }
) {
  const { endpoint, keys } = subscription;
  
  // Create VAPID headers
  const vapidHeaders = createVAPIDHeaders(
    endpoint,
    options.subject,
    options.vapidPublicKey,
    options.vapidPrivateKey
  );

  // Encrypt payload
  const encryptedPayload = await encryptPayload(payload, keys.p256dh, keys.auth);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...vapidHeaders,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': encryptedPayload.length.toString()
    },
    body: encryptedPayload
  });

  if (!response.ok) {
    const error: any = new Error(`Push failed: ${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }

  return response;
}

// Simplified VAPID header creation
function createVAPIDHeaders(endpoint: string, subject: string, publicKey: string, privateKey: string) {
  return {
    'Authorization': `vapid t=${generateVAPIDToken(endpoint, subject, publicKey, privateKey)}, k=${publicKey}`
  };
}

function generateVAPIDToken(endpoint: string, subject: string, publicKey: string, privateKey: string) {
  // Simplified token generation
  // In production, use proper JWT signing with ES256
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = btoa(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: now + 12 * 60 * 60,
    sub: subject
  }));
  
  return `${header}.${payload}.signature`;
}

async function encryptPayload(payload: string, p256dh: string, auth: string) {
  // Simplified encryption - in production use proper Web Push encryption
  const encoder = new TextEncoder();
  return encoder.encode(payload);
}

// Generate context-aware smart follow-up questions based on land and AI response
function generateQuickReplies(lastMessage: string = '', aiResponse: string = '', landData: any = null): string[] {
  try {
    // Validation guards - ensure parameters are defined and are strings
    if (typeof lastMessage !== 'string' || typeof aiResponse !== 'string') {
      console.error('Invalid parameters for generateQuickReplies:', { lastMessage: typeof lastMessage, aiResponse: typeof aiResponse });
      return getDefaultQuickReplies();
    }

    const lowerMessage = (lastMessage || '').toLowerCase();
    const lowerResponse = (aiResponse || '').toLowerCase();
  
  // PRIORITY 1: Generate questions based on AI response content
  const responseBasedQuestions: string[] = [];
  
  // If AI mentioned fertilizer application
  if (lowerResponse.includes('fertilizer') || lowerResponse.includes('खाद')) {
    responseBasedQuestions.push('💬 कौनसी खाद डालूं?'); // Which fertilizer?
  }
  
  // If AI mentioned watering/irrigation
  if (lowerResponse.includes('water') || lowerResponse.includes('irrigat') || lowerResponse.includes('पानी')) {
    responseBasedQuestions.push('💧 पानी कब दूं?'); // When to water?
  }
  
  // If AI mentioned pests/diseases
  if (lowerResponse.includes('pest') || lowerResponse.includes('disease') || lowerResponse.includes('कीड़े') || lowerResponse.includes('बीमारी')) {
    responseBasedQuestions.push('🐛 दवाई कब छिड़कें?'); // When to spray medicine?
  }
  
  // If AI mentioned spraying schedule
  if (lowerResponse.includes('spray') || lowerResponse.includes('application') || lowerResponse.includes('छिड़काव')) {
    responseBasedQuestions.push('📅 अगला छिड़काव कब?'); // When is next spray?
  }
  
  // If AI mentioned weather/rain
  if (lowerResponse.includes('weather') || lowerResponse.includes('rain') || lowerResponse.includes('मौसम') || lowerResponse.includes('बारिश')) {
    responseBasedQuestions.push('☁️ बारिश आएगी?'); // Will it rain?
  }
  
  // If AI mentioned yield/harvest
  if (lowerResponse.includes('yield') || lowerResponse.includes('harvest') || lowerResponse.includes('उपज') || lowerResponse.includes('कटाई')) {
    responseBasedQuestions.push('💰 कमाई कितनी होगी?'); // How much income?
  }
  
  // PRIORITY 2: Generate land-specific questions if land data available
  const landSpecificQuestions: string[] = [];
  
  if (landData) {
    const currentCrop = landData.current_crop?.toLowerCase() || '';
    const soilType = landData.soil_type?.toLowerCase() || '';
    const cultivationDate = landData.cultivation_date;
    
    // Crop-specific questions
    if (currentCrop.includes('wheat') || currentCrop.includes('गेहूं')) {
      landSpecificQuestions.push('🌾 गेहूं में पानी कब?'); // When to water wheat?
      landSpecificQuestions.push('🌱 गेहूं में खाद?'); // Wheat fertilizer?
    } else if (currentCrop.includes('rice') || currentCrop.includes('चावल') || currentCrop.includes('धान')) {
      landSpecificQuestions.push('🌾 धान में पानी?'); // Rice water?
      landSpecificQuestions.push('🐛 धान के कीड़े?'); // Rice pests?
    } else if (currentCrop.includes('cotton') || currentCrop.includes('कपास')) {
      landSpecificQuestions.push('🌸 कपास में फूल?'); // Cotton flowering?
      landSpecificQuestions.push('🐛 गुलाबी इल्ली?'); // Pink bollworm?
    } else if (currentCrop.includes('tomato') || currentCrop.includes('टमाटर')) {
      landSpecificQuestions.push('🍅 टमाटर की देखभाल?'); // Tomato care?
      landSpecificQuestions.push('🐛 टमाटर की बीमारी?'); // Tomato disease?
    } else if (currentCrop.includes('onion') || currentCrop.includes('प्याज')) {
      landSpecificQuestions.push('🧅 प्याज में पानी?'); // Onion water?
      landSpecificQuestions.push('🌱 प्याज की खाद?'); // Onion fertilizer?
    }
    
    // Soil-specific questions
    if (soilType.includes('clay') || soilType.includes('चिकनी')) {
      landSpecificQuestions.push('🌱 चिकनी मिट्टी सुधार?'); // Clay soil improvement?
    } else if (soilType.includes('sandy') || soilType.includes('रेतीली')) {
      landSpecificQuestions.push('💧 रेतीली मिट्टी में पानी?'); // Sandy soil water?
    } else if (soilType.includes('loam') || soilType.includes('दोमट')) {
      landSpecificQuestions.push('🌿 दोमट मिट्टी खाद?'); // Loam soil fertilizer?
    }
    
    // Growth stage-specific questions
    if (cultivationDate) {
      const daysElapsed = Math.floor((Date.now() - new Date(cultivationDate).getTime()) / (1000 * 60 * 60 * 24));
      if (daysElapsed < 30) {
        landSpecificQuestions.push('🌱 शुरुआती देखभाल?'); // Early care?
      } else if (daysElapsed < 60) {
        landSpecificQuestions.push('🌿 बढ़वार का समय?'); // Growth stage?
      } else if (daysElapsed < 90) {
        landSpecificQuestions.push('🌸 फूल आने पर क्या करें?'); // During flowering?
      } else {
        landSpecificQuestions.push('✂️ कटाई कब करें?'); // When to harvest?
      }
    }
  }
  
  // PRIORITY 3: User message context
  const messageBasedQuestions: string[] = [];
  
  // Fertilizer related
  if (lowerMessage.includes('fertilizer') || lowerMessage.includes('खाद') || lowerMessage.includes('npk')) {
    messageBasedQuestions.push('💬 कौनसी खाद डालूं?'); // Which fertilizer?
    messageBasedQuestions.push('💬 खाद कब डालें?'); // When to add fertilizer?
    messageBasedQuestions.push('💬 कितनी खाद चाहिए?'); // How much fertilizer?
  }
  
  // Pest/Disease related
  else if (lowerMessage.includes('pest') || lowerMessage.includes('disease') || lowerMessage.includes('कीड़े') || lowerMessage.includes('बीमारी')) {
    messageBasedQuestions.push('🐛 कीड़े दिख रहे हैं'); // Seeing insects
    messageBasedQuestions.push('🍃 पत्ते पीले हैं'); // Leaves are yellow
    messageBasedQuestions.push('💧 दवाई कब छिड़कें?'); // When to spray medicine?
  }
  
  // Weather/Irrigation related
  else if (lowerMessage.includes('water') || lowerMessage.includes('rain') || lowerMessage.includes('irrigat') || lowerMessage.includes('पानी')) {
    messageBasedQuestions.push('💧 पानी कब दूं?'); // When to water?
    messageBasedQuestions.push('☁️ बारिश आएगी?'); // Will it rain?
    messageBasedQuestions.push('💦 कितना पानी दूं?'); // How much water?
  }
  
  // Market/Yield related
  else if (lowerMessage.includes('market') || lowerMessage.includes('price') || lowerMessage.includes('yield') || lowerMessage.includes('बाजार')) {
    messageBasedQuestions.push('💰 आज का भाव?'); // Today's price?
    messageBasedQuestions.push('📊 बेचें कब?'); // When to sell?
    messageBasedQuestions.push('📈 कितनी पैदावार होगी?'); // How much yield?
  }
  
  // Combine all questions with priority (response-based > land-specific > message-based)
  const allQuestions = [
    ...responseBasedQuestions,
    ...landSpecificQuestions,
    ...messageBasedQuestions
  ];
  
  // Remove duplicates and limit to 4 questions
  const uniqueQuestions = [...new Set(allQuestions)];
  
  // If we have questions, return top 4
  if (uniqueQuestions.length > 0) {
    return uniqueQuestions.slice(0, 4);
  }
  
  // FALLBACK: Default land-based questions or general questions
  if (landData?.current_crop) {
    return [
      '🌅 आज क्या करूं?',           // What to do today?
      '💧 पानी देना है?',            // Need to water?
      `🌾 ${landData.current_crop} कैसी है?`, // How's the crop?
      '📅 अगला काम कब?'             // When's next task?
    ];
  }
  
  // Ultimate fallback
  return getDefaultQuickReplies();
  } catch (error) {
    console.error('Error in generateQuickReplies:', error);
    return getDefaultQuickReplies();
  }
}

// Helper function to return safe default quick replies
function getDefaultQuickReplies(): string[] {
  return [
    '🌅 आज क्या करूं?',           // What to do today?
    '💧 पानी देना है?',            // Need to water?
    '🌾 फसल कैसी है?',            // How's the crop?
    '📅 अगला काम कब?'             // When's next task?
  ];
}

// Validate isolation context to prevent tenant/farmer data leakage
async function validateIsolation(
  tenantId: string | null, 
  farmerId: string | null,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  // Check required fields
  if (!tenantId || !farmerId) {
    throw new Error('SECURITY: Missing isolation context - tenantId and farmerId are required');
  }

  // Verify tenant and farmer match in user_profiles table
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: userProfile, error } = await supabase
    .from('user_profiles')
    .select('tenant_id')
    .eq('id', farmerId)
    .single();

  if (error || !userProfile) {
    console.error('SECURITY: Farmer profile not found', { farmerId, error });
    throw new Error('SECURITY: Invalid farmer ID');
  }

  if (userProfile.tenant_id !== tenantId) {
    console.error('SECURITY: Tenant-Farmer mismatch detected', {
      providedTenantId: tenantId,
      actualTenantId: userProfile.tenant_id,
      farmerId
    });
    throw new Error('SECURITY: Tenant-Farmer mismatch - potential data isolation breach');
  }

  return true;
}

// Handle training data collection from positive feedback
async function handleTrainingDataCollection(requestBody: any) {
  try {
    const { messageId, tenantId, farmerId } = requestBody;

    if (!messageId || !tenantId || !farmerId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: messageId, tenantId, farmerId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Collecting training data for message:', messageId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the message with positive feedback
    const { data: message, error: messageError } = await supabase
      .from('ai_chat_messages')
      .select(`
        *,
        session:ai_chat_sessions(
          land_id,
          session_type,
          metadata
        )
      `)
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .eq('farmer_id', farmerId)
      .eq('is_training_candidate', true)
      .single();

    if (messageError || !message) {
      console.error('Message not found or not a training candidate:', messageError);
      return new Response(
        JSON.stringify({ error: 'Message not found or not suitable for training' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the previous user message (prompt)
    const { data: userMessage } = await supabase
      .from('ai_chat_messages')
      .select('content, metadata')
      .eq('session_id', message.session_id)
      .eq('role', 'user')
      .lt('created_at', message.created_at)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!userMessage) {
      console.error('User prompt not found for message:', messageId);
      return new Response(
        JSON.stringify({ error: 'User prompt not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract context data
    const landId = message.session?.[0]?.land_id;
    let contextData: any = {
      prompt: userMessage.content,
      response: message.content,
      feedback_rating: message.feedback_rating,
      feedback_text: message.feedback_text,
      language: message.metadata?.language || 'en',
      session_type: message.session?.[0]?.session_type,
      created_at: message.created_at
    };

    // Get land context if available
    if (landId) {
      const { data: land } = await supabase
        .from('lands')
        .select('*')
        .eq('id', landId)
        .eq('tenant_id', tenantId)
        .single();

      if (land) {
        contextData.land_context = {
          crop: land.current_crop || land.crops?.[0],
          soil_type: land.soil_type,
          area_acres: land.area_acres || (land.area_gunta ? land.area_gunta / 40 : null),
          location: land.location,
          irrigation_type: land.irrigation_type
        };
      }
    }

    // Get farmer context
    const { data: farmer } = await supabase
      .from('users')
      .select('name, language, metadata')
      .eq('id', farmerId)
      .eq('tenant_id', tenantId)
      .single();

    if (farmer) {
      contextData.farmer_context = {
        language: farmer.language,
        experience_level: farmer.metadata?.experience_level,
        farming_type: farmer.metadata?.farming_type
      };
    }

    // Calculate success metrics (placeholder - can be enhanced with real data)
    const successMetrics = {
      feedback_score: message.feedback_rating,
      has_detailed_feedback: !!message.feedback_text,
      response_time_ms: message.metadata?.response_time_ms,
      tokens_used: message.metadata?.tokens_used,
      section_tags: message.metadata?.section_tags || [],
      marked_as_training: new Date().toISOString()
    };

    // Store in training context table
    const { error: trainingError } = await supabase
      .from('ai_training_context')
      .insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        message_id: messageId,
        context_type: landId ? 'land_specific' : 'general',
        context_data: contextData,
        success_metrics: successMetrics,
        is_validated: false, // Requires manual review before training
        created_at: new Date().toISOString()
      });

    if (trainingError) {
      console.error('Error storing training context:', trainingError);
      return new Response(
        JSON.stringify({ error: 'Failed to store training context', details: trainingError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Training data collected successfully for message:', messageId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Training data collected successfully',
        messageId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in training data collection:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to collect training data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}