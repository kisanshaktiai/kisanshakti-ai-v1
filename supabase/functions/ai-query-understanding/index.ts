/**
 * AI Query Understanding Edge Function
 * 
 * Purpose: Use AI ONLY for semantic understanding of farmer queries.
 * Extract intent, entities, and normalize local/regional vocabulary.
 * 
 * Key principle: AI understands → Symbolic Brain decides actions
 * 
 * Uses: Google Gemini API (GEMINI_API_KEY from Supabase secrets)
 * Fallback: OpenAI API (OPENAI_API_KEY)
 */

import { corsHeaders } from '../_shared/cors.ts';

// Canonical intent types that map to Decision Brain
type CanonicalIntent = 
  | 'WATER_MANAGEMENT'
  | 'NUTRIENT_MANAGEMENT' 
  | 'PEST_ISSUE'
  | 'DISEASE_ISSUE'
  | 'WEED_ISSUE'
  | 'GROWTH_PROBLEM'
  | 'HARVEST_TIMING'
  | 'STATUS_CHECK'
  | 'MARKET_PRICE'
  | 'WEATHER_QUERY'
  | 'GENERAL_QUERY';

// Canonical symptom IDs that match symptomPatternRecognizer
type CanonicalSymptom = 
  | 'LEAF_YELLOWING'
  | 'LEAF_SPOTS'
  | 'LEAF_CURLING'
  | 'WILTING'
  | 'STUNTED_GROWTH'
  | 'ROOT_DAMAGE'
  | 'FRUIT_DAMAGE'
  | 'STEM_DAMAGE'
  | 'PEST_VISIBLE'
  | 'FUNGAL_GROWTH';

interface QueryUnderstandingRequest {
  text: string;
  language: string;
  landCropCode?: string;
  state?: string;
  district?: string;
  tenantId: string;
}

interface QueryUnderstandingResponse {
  success: boolean;
  understanding: {
    canonical_intent: CanonicalIntent;
    confidence: number;
    entities: {
      crop_code: string | null;
      symptom_id: CanonicalSymptom | null;
      pest_code: string | null;
      disease_code: string | null;
      weed_code: string | null;
      growth_stage: string | null;
      urgency: 'low' | 'medium' | 'high' | 'critical';
    };
    local_terms_detected: Array<{
      term: string;
      canonical_type: 'crop' | 'pest' | 'disease' | 'weed' | 'symptom';
      canonical_code: string;
      confidence: number;
    }>;
    normalized_query: string;
    needs_clarification: boolean;
    clarification_question?: string;
  };
  raw_text: string;
  processing_time_ms: number;
}

// Crop code mapping for common local names
const CROP_LOCAL_NAMES: Record<string, string[]> = {
  'SUGARCANE': ['ऊस', 'गन्ना', 'ऊंस', 'गना', 'शेरडी', 'कांडा', 'उस'],
  'WHEAT': ['गहू', 'गेहूं', 'गव्हा', 'कनक', 'गोधूम'],
  'RICE': ['तांदूळ', 'धान', 'भात', 'चावल', 'पडी'],
  'COTTON': ['कापूस', 'कपास', 'रुई', 'नरमा'],
  'SOYBEAN': ['सोयाबीन', 'सोयाबिन', 'भाटला'],
  'MAIZE': ['मका', 'मक्का', 'मक्याचे', 'भुट्टा'],
  'GRAM': ['हरभरा', 'चना', 'छोले'],
  'GROUNDNUT': ['भुईमूग', 'मूंगफली', 'शेंगदाणे'],
  'ONION': ['कांदा', 'प्याज', 'कांदे'],
  'TOMATO': ['टमाटा', 'टमाटर', 'टोमॅटो'],
  'POTATO': ['बटाटा', 'आलू', 'बटाटे'],
  'CHILLI': ['मिरची', 'मिर्च', 'मिरच्या'],
  'TURMERIC': ['हळद', 'हल्दी'],
  'BANANA': ['केळी', 'केला', 'केळं'],
  'GRAPES': ['द्राक्षे', 'अंगूर', 'द्राक्ष'],
  'POMEGRANATE': ['डाळिंब', 'अनार'],
  'MANGO': ['आंबा', 'आम'],
};

// Common pest local names
const PEST_LOCAL_NAMES: Record<string, string[]> = {
  'STEM_BORER': ['खोडकिडा', 'तना छेदक', 'गाभा किडा', 'गाभी कीड'],
  'APHID': ['मावा', 'माहू', 'तुडतुडा'],
  'WHITEFLY': ['पांढरी माशी', 'सफेद मक्खी', 'वाइटफ्लाय'],
  'BOLLWORM': ['बोंडअळी', 'बॉलवर्म', 'बोंडकिडा', 'गुलाबी बोंड अळी'],
  'THRIPS': ['थ्रीप्स', 'त्रिपस', 'तृप्स'],
  'MITES': ['माइट', 'मिटे', 'कोळी'],
  'LEAF_MINER': ['पान खाणारी अळी', 'पत्ती सुरंगक'],
  'ROOT_GRUB': ['मुळे कीड', 'मूळ किडा', 'वांगी'],
  'CATERPILLAR': ['अळी', 'सुंडी', 'इल्ली'],
  'GRASSHOPPER': ['टोळ', 'टिड्डा', 'नाकतोडा'],
};

// Common disease local names
const DISEASE_LOCAL_NAMES: Record<string, string[]> = {
  'RED_ROT': ['तांबेरा', 'रेड रॉट', 'लाल कुज'],
  'SMUT': ['काणी', 'कंडा', 'स्मट'],
  'WILT': ['मर', 'सुकारा', 'विल्ट', 'मुरडा'],
  'RUST': ['गंज', 'रस्ट', 'तांबेरा'],
  'BLIGHT': ['करपा', 'झुलसा', 'ब्लाइट'],
  'LEAF_SPOT': ['पानावर डाग', 'पत्ती धब्बा'],
  'POWDERY_MILDEW': ['भुरी', 'पाउडरी मिल्ड्यू', 'पांढरी भुरी'],
  'DOWNY_MILDEW': ['डाउनी', 'केवडा'],
  'ROOT_ROT': ['मूळ कुज', 'रूट रॉट'],
  'MOSAIC': ['मोज़ेक', 'पट्टी रोग'],
};

// Symptom patterns in local languages
const SYMPTOM_LOCAL_PATTERNS: Record<CanonicalSymptom, string[]> = {
  'LEAF_YELLOWING': ['पिवळे पान', 'पान पिवळे', 'पत्ते पीले', 'पिवळी पडत', 'पिवळसर'],
  'LEAF_SPOTS': ['पानावर डाग', 'डाग पडले', 'धब्बे', 'ठिपके'],
  'LEAF_CURLING': ['पान गुंडाळत', 'पत्ते मुड़ रहे', 'वाकडे पान', 'कर्लिंग'],
  'WILTING': ['सुकले', 'कोमेजले', 'मुरझाया', 'सुकत आहे', 'वाळतय'],
  'STUNTED_GROWTH': ['वाढ नाही', 'वाढत नाही', 'बढ़ नहीं रहा', 'छोटे राहिले', 'खुंटला'],
  'ROOT_DAMAGE': ['मुळे खराब', 'जड़ें खराब', 'मूळ कुजले'],
  'FRUIT_DAMAGE': ['फळ खराब', 'फल खराब', 'फळात अळी'],
  'STEM_DAMAGE': ['खोड खराब', 'तना खराब', 'खोड कुजले', 'देठ खराब'],
  'PEST_VISIBLE': ['किडा दिसतो', 'कीड़े दिख रहे', 'अळी आहे', 'मावा आला'],
  'FUNGAL_GROWTH': ['बुरशी', 'फफूंद', 'काळी बुरशी', 'पांढरी बुरशी'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const requestBody: QueryUnderstandingRequest = await req.json();
    const { text, language, landCropCode, state, district, tenantId } = requestBody;

    console.log('🧠 [AI-Understanding] Processing query:', { text, language, landCropCode });

    // Step 1: Try local pattern matching first (fast, no API call)
    const localMatch = tryLocalPatternMatching(text, language, landCropCode);
    
    if (localMatch.confidence >= 0.85) {
      console.log('✅ [AI-Understanding] High confidence local match:', localMatch);
      return new Response(JSON.stringify({
        success: true,
        understanding: localMatch,
        raw_text: text,
        processing_time_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Use AI for understanding (when local patterns aren't enough)
    // Try Gemini API first (primary), fallback to OpenAI
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
      console.warn('⚠️ [AI-Understanding] No API keys configured, using local match only');
      return new Response(JSON.stringify({
        success: true,
        understanding: localMatch,
        raw_text: text,
        processing_time_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build AI prompt for semantic understanding
    const systemPrompt = buildUnderstandingSystemPrompt(language, landCropCode);
    const userPrompt = buildUnderstandingUserPrompt(text, language, landCropCode, state, district);

    let aiResponse: Response;
    let useGemini = !!GEMINI_API_KEY;

    if (useGemini) {
      // Use Google Gemini API
      console.log('🤖 [AI-Understanding] Using Gemini API');
      
      const geminiPayload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              canonical_intent: {
                type: 'string',
                enum: [
                  'WATER_MANAGEMENT', 'NUTRIENT_MANAGEMENT', 'PEST_ISSUE',
                  'DISEASE_ISSUE', 'WEED_ISSUE', 'GROWTH_PROBLEM',
                  'HARVEST_TIMING', 'STATUS_CHECK', 'MARKET_PRICE',
                  'WEATHER_QUERY', 'GENERAL_QUERY'
                ],
              },
              confidence: { type: 'number' },
              crop_code: { type: 'string' },
              symptom_id: { type: 'string' },
              pest_code: { type: 'string' },
              disease_code: { type: 'string' },
              weed_code: { type: 'string' },
              growth_stage: { type: 'string' },
              urgency: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              local_terms: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    term: { type: 'string' },
                    canonical_type: { type: 'string' },
                    canonical_code: { type: 'string' },
                    confidence: { type: 'number' },
                  },
                },
              },
              normalized_query: { type: 'string' },
              needs_clarification: { type: 'boolean' },
              clarification_question: { type: 'string' },
            },
            required: ['canonical_intent', 'confidence', 'urgency', 'normalized_query'],
          },
        },
      };

      aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload),
        }
      );
    } else {
      // Fallback to OpenAI API
      console.log('🤖 [AI-Understanding] Using OpenAI API');
      
      aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'extract_query_understanding',
              description: 'Extract structured understanding from farmer query',
              parameters: {
                type: 'object',
                properties: {
                  canonical_intent: {
                    type: 'string',
                    enum: [
                      'WATER_MANAGEMENT', 'NUTRIENT_MANAGEMENT', 'PEST_ISSUE',
                      'DISEASE_ISSUE', 'WEED_ISSUE', 'GROWTH_PROBLEM',
                      'HARVEST_TIMING', 'STATUS_CHECK', 'MARKET_PRICE',
                      'WEATHER_QUERY', 'GENERAL_QUERY'
                    ],
                  },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  crop_code: { type: 'string', nullable: true },
                  symptom_id: {
                    type: 'string',
                    enum: [
                      'LEAF_YELLOWING', 'LEAF_SPOTS', 'LEAF_CURLING', 'WILTING',
                      'STUNTED_GROWTH', 'ROOT_DAMAGE', 'FRUIT_DAMAGE', 'STEM_DAMAGE',
                      'PEST_VISIBLE', 'FUNGAL_GROWTH'
                    ],
                    nullable: true,
                  },
                  pest_code: { type: 'string', nullable: true },
                  disease_code: { type: 'string', nullable: true },
                  weed_code: { type: 'string', nullable: true },
                  growth_stage: { type: 'string', nullable: true },
                  urgency: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                  local_terms: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        term: { type: 'string' },
                        canonical_type: { type: 'string', enum: ['crop', 'pest', 'disease', 'weed', 'symptom'] },
                        canonical_code: { type: 'string' },
                        confidence: { type: 'number' },
                      },
                    },
                  },
                  normalized_query: { type: 'string' },
                  needs_clarification: { type: 'boolean' },
                  clarification_question: { type: 'string', nullable: true },
                },
                required: ['canonical_intent', 'confidence', 'urgency', 'normalized_query'],
              },
            },
          }],
          tool_choice: { type: 'function', function: { name: 'extract_query_understanding' } },
        }),
      });
    }

    if (!aiResponse.ok) {
      console.error('❌ [AI-Understanding] AI API error:', aiResponse.status);
      // Fall back to local match
      return new Response(JSON.stringify({
        success: true,
        understanding: localMatch,
        raw_text: text,
        processing_time_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    
    // Parse response based on which API was used
    let aiUnderstanding: any = null;
    
    if (useGemini) {
      // Gemini returns structured JSON directly in candidates[0].content.parts[0].text
      const geminiText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (geminiText) {
        try {
          aiUnderstanding = JSON.parse(geminiText);
          console.log('✅ [AI-Understanding] Gemini extracted:', aiUnderstanding);
        } catch (parseError) {
          console.error('❌ [AI-Understanding] Failed to parse Gemini response:', parseError);
        }
      }
    } else {
      // OpenAI uses tool_calls
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          aiUnderstanding = JSON.parse(toolCall.function.arguments);
          console.log('✅ [AI-Understanding] OpenAI extracted:', aiUnderstanding);
        } catch (parseError) {
          console.error('❌ [AI-Understanding] Failed to parse OpenAI response:', parseError);
        }
      }
    }
    
    if (!aiUnderstanding) {
      console.warn('⚠️ [AI-Understanding] No valid AI response, using local match');
      return new Response(JSON.stringify({
        success: true,
        understanding: localMatch,
        raw_text: text,
        processing_time_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Merge AI understanding with local match (prefer AI for ambiguous cases)
    const finalUnderstanding = {
      canonical_intent: aiUnderstanding.canonical_intent || localMatch.canonical_intent,
      confidence: Math.max(aiUnderstanding.confidence || 0, localMatch.confidence),
      entities: {
        crop_code: aiUnderstanding.crop_code || localMatch.entities.crop_code,
        symptom_id: aiUnderstanding.symptom_id || localMatch.entities.symptom_id,
        pest_code: aiUnderstanding.pest_code || localMatch.entities.pest_code,
        disease_code: aiUnderstanding.disease_code || localMatch.entities.disease_code,
        weed_code: aiUnderstanding.weed_code || localMatch.entities.weed_code,
        growth_stage: aiUnderstanding.growth_stage || localMatch.entities.growth_stage,
        urgency: aiUnderstanding.urgency || localMatch.entities.urgency,
      },
      local_terms_detected: aiUnderstanding.local_terms || localMatch.local_terms_detected,
      normalized_query: aiUnderstanding.normalized_query || text,
      needs_clarification: aiUnderstanding.needs_clarification || false,
      clarification_question: aiUnderstanding.clarification_question,
    };

    return new Response(JSON.stringify({
      success: true,
      understanding: finalUnderstanding,
      raw_text: text,
      processing_time_ms: Date.now() - startTime,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ [AI-Understanding] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processing_time_ms: Date.now() - startTime,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Try local pattern matching for fast understanding
 */
function tryLocalPatternMatching(
  text: string,
  language: string,
  landCropCode?: string
): QueryUnderstandingResponse['understanding'] {
  const normalizedText = text.toLowerCase();
  let intent: CanonicalIntent = 'GENERAL_QUERY';
  let confidence = 0.5;
  const localTerms: QueryUnderstandingResponse['understanding']['local_terms_detected'] = [];
  
  let detectedCrop: string | null = landCropCode || null;
  let detectedSymptom: CanonicalSymptom | null = null;
  let detectedPest: string | null = null;
  let detectedDisease: string | null = null;
  let urgency: 'low' | 'medium' | 'high' | 'critical' = 'medium';

  // Check for crop mentions
  for (const [cropCode, localNames] of Object.entries(CROP_LOCAL_NAMES)) {
    for (const localName of localNames) {
      if (normalizedText.includes(localName.toLowerCase())) {
        detectedCrop = cropCode;
        localTerms.push({
          term: localName,
          canonical_type: 'crop',
          canonical_code: cropCode,
          confidence: 0.9,
        });
        confidence = Math.max(confidence, 0.7);
        break;
      }
    }
  }

  // Check for symptom mentions
  for (const [symptomId, patterns] of Object.entries(SYMPTOM_LOCAL_PATTERNS)) {
    for (const pattern of patterns) {
      if (normalizedText.includes(pattern.toLowerCase())) {
        detectedSymptom = symptomId as CanonicalSymptom;
        localTerms.push({
          term: pattern,
          canonical_type: 'symptom',
          canonical_code: symptomId,
          confidence: 0.85,
        });
        
        // Determine intent based on symptom
        if (['LEAF_YELLOWING', 'STUNTED_GROWTH'].includes(symptomId)) {
          intent = 'NUTRIENT_MANAGEMENT';
        } else if (['WILTING'].includes(symptomId)) {
          intent = 'WATER_MANAGEMENT';
        } else if (['PEST_VISIBLE'].includes(symptomId)) {
          intent = 'PEST_ISSUE';
        } else if (['LEAF_SPOTS', 'FUNGAL_GROWTH'].includes(symptomId)) {
          intent = 'DISEASE_ISSUE';
        } else {
          intent = 'GROWTH_PROBLEM';
        }
        confidence = Math.max(confidence, 0.8);
        break;
      }
    }
  }

  // Check for pest mentions
  for (const [pestCode, localNames] of Object.entries(PEST_LOCAL_NAMES)) {
    for (const localName of localNames) {
      if (normalizedText.includes(localName.toLowerCase())) {
        detectedPest = pestCode;
        intent = 'PEST_ISSUE';
        localTerms.push({
          term: localName,
          canonical_type: 'pest',
          canonical_code: pestCode,
          confidence: 0.9,
        });
        confidence = Math.max(confidence, 0.85);
        break;
      }
    }
  }

  // Check for disease mentions
  for (const [diseaseCode, localNames] of Object.entries(DISEASE_LOCAL_NAMES)) {
    for (const localName of localNames) {
      if (normalizedText.includes(localName.toLowerCase())) {
        detectedDisease = diseaseCode;
        intent = 'DISEASE_ISSUE';
        localTerms.push({
          term: localName,
          canonical_type: 'disease',
          canonical_code: diseaseCode,
          confidence: 0.9,
        });
        confidence = Math.max(confidence, 0.85);
        break;
      }
    }
  }

  // Check for urgency indicators
  const urgentPatterns = ['तात्काळ', 'लगेच', 'जल्दी', 'अभी', 'urgent', 'immediately', 'मरत आहे', 'मर रहा'];
  const criticalPatterns = ['पूर्ण खराब', 'सगळे मेले', 'सब मर गया', 'complete loss'];
  
  if (criticalPatterns.some(p => normalizedText.includes(p.toLowerCase()))) {
    urgency = 'critical';
  } else if (urgentPatterns.some(p => normalizedText.includes(p.toLowerCase()))) {
    urgency = 'high';
  }

  // Check for water-related queries
  const waterPatterns = ['पाणी', 'पानी', 'सिंचन', 'सिंचाई', 'water', 'irrigation', 'ओलावा'];
  if (waterPatterns.some(p => normalizedText.includes(p.toLowerCase()))) {
    intent = 'WATER_MANAGEMENT';
    confidence = Math.max(confidence, 0.75);
  }

  // Check for harvest queries
  const harvestPatterns = ['कापणी', 'काढणी', 'कटाई', 'harvest', 'तोडा', 'काढायचे'];
  if (harvestPatterns.some(p => normalizedText.includes(p.toLowerCase()))) {
    intent = 'HARVEST_TIMING';
    confidence = Math.max(confidence, 0.75);
  }

  // Check for market/price queries
  const marketPatterns = ['भाव', 'किंमत', 'दाम', 'मंडी', 'बाजार', 'price', 'market', 'विक्री'];
  if (marketPatterns.some(p => normalizedText.includes(p.toLowerCase()))) {
    intent = 'MARKET_PRICE';
    confidence = Math.max(confidence, 0.8);
  }

  return {
    canonical_intent: intent,
    confidence,
    entities: {
      crop_code: detectedCrop,
      symptom_id: detectedSymptom,
      pest_code: detectedPest,
      disease_code: detectedDisease,
      weed_code: null,
      growth_stage: null,
      urgency,
    },
    local_terms_detected: localTerms,
    normalized_query: text,
    needs_clarification: confidence < 0.6,
  };
}

function buildUnderstandingSystemPrompt(language: string, landCropCode?: string): string {
  const langName = language === 'mr' ? 'Marathi' : language === 'hi' ? 'Hindi' : 'English';
  
  return `You are an agricultural query understanding system for Indian farmers.
Your ONLY job is to UNDERSTAND what the farmer is asking - NOT to provide advice or recommendations.

Language context: The farmer speaks ${langName}. They may use local/regional terms for crops, pests, diseases.

${landCropCode ? `Current crop in their field: ${landCropCode}` : 'Crop not specified.'}

IMPORTANT RULES:
1. Extract the INTENT (what type of problem/question)
2. Identify ENTITIES (crop, pest, disease, symptom, etc.)
3. Recognize LOCAL TERMS and map them to canonical codes
4. Normalize the query to standard agricultural terminology
5. Flag if clarification is needed

You must output in ${langName} for the normalized_query field.
Do NOT provide any farming advice - only extract meaning.`;
}

function buildUnderstandingUserPrompt(
  text: string,
  language: string,
  landCropCode?: string,
  state?: string,
  district?: string
): string {
  let prompt = `Farmer's query: "${text}"

Language: ${language === 'mr' ? 'Marathi' : language === 'hi' ? 'Hindi' : 'English'}`;

  if (landCropCode) {
    prompt += `\nCurrent crop: ${landCropCode}`;
  }
  if (state) {
    prompt += `\nState: ${state}`;
  }
  if (district) {
    prompt += `\nDistrict: ${district}`;
  }

  prompt += `

Extract the structured understanding from this query. Identify any local/regional terms and map them to standard codes.`;

  return prompt;
}
