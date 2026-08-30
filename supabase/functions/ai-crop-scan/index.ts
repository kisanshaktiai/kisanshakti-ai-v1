import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from '../_shared/cors.ts';
import { rateGuard } from '../_shared/rateGuard.ts';


interface ScanRequest {
  images?: string[];
  videoFrames?: string[];
  userNotes?: string;
  language?: string;
  farmerId?: string;
  tenantId?: string;
  landId?: string;
  landCrop?: string;
  mode?: 'quick' | 'full' | 'targeted_solution' | 'growth_tracking';
  suggestionType?: 'organic' | 'fertilizer' | 'pesticide' | 'hybrid';
  landArea?: { guntha: number; acres: number; sqft: number };
  diagnosis?: any;
  cropDetected?: any;
  healthStatus?: any;
  // Growth tracking specific fields
  uploadId?: string;
  sowingDate?: string;
  expectedStage?: string;
  ndviData?: any[];
  soilData?: any;
}

interface ThreeCategoryRecommendation {
  organic: {
    title: string;
    products: Array<{
      name: string;
      localName?: string;
      dosage: string;
      applicationMethod?: string;
      timing?: string;
      cost?: string;
    }>;
    instructions?: string[];
    benefits?: string[];
    precautions?: string[];
    estimatedCost?: string;
  };
  fertilizer: {
    title: string;
    products: Array<{
      name: string;
      localName?: string;
      dosage: string;
      applicationMethod?: string;
      timing?: string;
      cost?: string;
    }>;
    instructions?: string[];
    benefits?: string[];
    precautions?: string[];
    estimatedCost?: string;
  };
  pesticide: {
    title: string;
    products: Array<{
      name: string;
      localName?: string;
      dosage: string;
      applicationMethod?: string;
      timing?: string;
      cost?: string;
    }>;
    instructions?: string[];
    benefits?: string[];
    precautions?: string[];
    estimatedCost?: string;
  };
  hormone?: {
    title: string;
    products: Array<{
      name: string;
      localName?: string;
      dosage: string;
      applicationMethod?: string;
      timing?: string;
      cost?: string;
    }>;
    instructions?: string[];
    benefits?: string[];
    precautions?: string[];
    estimatedCost?: string;
  };
}

/**
 * Normalise an image reference into a form the vision APIs accept.
 *
 * 2026-08-30: callers may send a data URL, a raw base64 string, or a storage
 * URL. TaskPhotoUploadDialog sends a signed crop-growth-media URL, and the
 * previous expression wrapped anything not starting with `data:` in a base64
 * template — producing `data:image/jpeg;base64,https://...`, a corrupt data
 * URI that failed every crop-schedule photo analysis.
 */
function toImagePayloadUrl(img: string): string {
  const v = (img ?? '').trim();
  if (v.startsWith('data:')) return v;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  return `data:image/jpeg;base64,${v}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Sprint 5: cost-control rate limit (vision-LLM scans are expensive).
  const rl = await rateGuard(req, { endpoint: 'ai-crop-scan', maxRequests: 10, windowMs: 60_000 });
  if (rl) return rl;



  const startTime = Date.now();
  
  try {
    // Try OpenAI first, fall back to Gemini
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    
    // Determine available providers
    const hasOpenAI = !!openAIApiKey;
    const hasGemini = !!geminiApiKey;
    
    if (!hasOpenAI && !hasGemini) {
      console.error('No AI API key configured (OPENAI_API_KEY or GEMINI_API_KEY)');
      return new Response(
        JSON.stringify({ success: false, error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Helper function to call AI with fallback
    const callAIWithFallback = async (
      systemPrompt: string,
      userContent: any[],
      maxTokens: number = 4000
    ): Promise<any> => {
      // Try OpenAI first if available
      if (hasOpenAI) {
        try {
          console.log('🤖 [AI] Trying OpenAI gpt-4o...');
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
              ],
              max_tokens: maxTokens,
              response_format: { type: 'json_object' }
            }),
          });

          if (response.ok) {
            const data = await response.json();
            console.log('✅ [AI] OpenAI succeeded');
            return { success: true, data, provider: 'openai' };
          }

          if (response.status === 429) {
            console.warn('⚠️ [AI] OpenAI rate limited, trying Gemini fallback...');
          } else {
            const errorText = await response.text();
            console.warn(`⚠️ [AI] OpenAI error ${response.status}: ${errorText.substring(0, 200)}`);
          }
        } catch (e) {
          console.warn('⚠️ [AI] OpenAI failed:', e);
        }
      }

      // Fallback to Gemini
      if (hasGemini) {
        try {
          console.log('🤖 [AI] Trying Gemini gemini-2.0-flash...');
          
          // Convert image_url format to Gemini format
          const geminiContent = userContent.map((item: any) => {
            if (item.type === 'image_url') {
              const url = item.image_url.url;
              if (url.startsWith('data:')) {
                const [meta, base64] = url.split(',');
                const mimeType = meta.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                return {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64
                  }
                };
              }
            }
            return { text: item.text || JSON.stringify(item) };
          });

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  { role: 'user', parts: [{ text: systemPrompt }, ...geminiContent] }
                ],
                generationConfig: {
                  maxOutputTokens: maxTokens,
                  responseMimeType: 'application/json'
                }
              }),
            }
          );

          if (response.ok) {
            const geminiData = await response.json();
            const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            console.log('✅ [AI] Gemini succeeded');
            
            // Parse Gemini response
            let parsed;
            try {
              parsed = JSON.parse(content);
            } catch {
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content };
            }
            
            return { 
              success: true, 
              data: { choices: [{ message: { content: JSON.stringify(parsed) } }] },
              provider: 'gemini' 
            };
          }

          const errorText = await response.text();
          console.error('❌ [AI] Gemini error:', response.status, errorText.substring(0, 200));
        } catch (e) {
          console.error('❌ [AI] Gemini failed:', e);
        }
      }

      return { success: false, error: 'All AI providers failed' };
    };

    const apiEndpoint = 'https://api.openai.com/v1/chat/completions';

    const requestData: ScanRequest = await req.json();
    const { 
      images, 
      videoFrames,
      userNotes, 
      language = 'en', 
      farmerId, 
      tenantId, 
      landId,
      landCrop,
      mode = 'full',
      suggestionType,
      landArea,
      diagnosis,
      cropDetected,
      healthStatus,
      uploadId,
      sowingDate,
      expectedStage,
      ndviData,
      soilData
    } = requestData;

    // Handle growth_tracking mode
    if (mode === 'growth_tracking') {
      console.log('🌱 Growth Tracking Mode:', { landId, uploadId, expectedStage });
      
      const allImages = [...(images || []), ...(videoFrames || [])];
      if (allImages.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'No images provided for growth tracking' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const languageInstruction = language === 'hi' 
        ? 'Respond in Hindi (हिंदी). Use simple farmer-friendly language. Address farmer as "किसान मित्र".'
        : language === 'mr'
        ? 'Respond in Marathi (मराठी). Use simple farmer-friendly language. Address farmer as "शेतकरी मित्र".'
        : 'Respond in simple Indian English. Address farmer as "Farmer Mitra".';

      const growthTrackingPrompt = `You are a Senior Agriculture Scientist with 50+ years of experience across Indian agro-climatic zones.

ROLE: Monitor crop growth, detect early stress signals, provide proactive guidance to prevent losses.

CRITICAL RULES:
1. Treat each photo as time-series growth evidence
2. Compare with expected growth stage: ${expectedStage || 'unknown'}
3. Correlate visual data with NDVI: ${ndviData?.[0]?.ndvi_value || 'N/A'}, Soil: ${soilData ? 'available' : 'N/A'}
4. If signals conflict, flag as "needs_observation"
5. Predict what will happen in next 3-7-14 days
6. Give ACTIONABLE advice with specific quantities

CONTEXT:
- Crop: ${landCrop || 'Unknown'}
- Sowing Date: ${sowingDate || 'Unknown'}
- Land Area: ${landArea?.guntha || 'Unknown'} guntha
- Latest NDVI: ${ndviData?.[0]?.ndvi_value || 'N/A'}
- Soil NPK: ${soilData?.nitrogen_level || 'N/A'}/${soilData?.phosphorus_level || 'N/A'}/${soilData?.potassium_level || 'N/A'}

${languageInstruction}

Return JSON:
{
  "crop_current_status": "1-2 sentence status",
  "growth_stage_analysis": {
    "detected_stage": "detected stage name",
    "expected_stage": "${expectedStage || 'unknown'}",
    "deviation": "ahead|on_track|slightly_delayed|delayed|severely_delayed",
    "stage_confidence": 0-100
  },
  "visual_observation_summary": "3-5 sentence visual analysis",
  "detected_issues": [{"type": "pest|disease|nutrient_deficiency|water_stress|none", "name": "Issue name", "severity": "mild|moderate|severe", "confidence": 0-100, "symptoms": ["symptoms"]}],
  "canopy_health_score": 0-100,
  "uniformity_score": 0-100,
  "ndvi_weather_correlation": "How NDVI/weather correlate with visuals",
  "signal_confidence": "high|medium|low|needs_observation",
  "predictions": {
    "next_3_day": "3-day prediction",
    "next_7_day": "7-day prediction with risks",
    "next_14_day": "14-day prediction and yield impact"
  },
  "risk_level": "low|medium|high|critical",
  "risk_factors": [{"factor": "name", "probability": 0-100, "impact": "low|medium|high", "timeframe": "when"}],
  "yield_impact_estimate": "Impact if issues not addressed",
  "recommended_actions": [{"action": "specific action", "timing": "when", "reason": "why", "priority": "critical|high|medium|low", "product": "product name", "dosage": "per acre", "cost_estimate": "INR"}],
  "schedule_updates": [{"task_type": "irrigation|fertilizer|pesticide", "change_type": "advance|delay|add", "new_timing": "new time", "reason": "why"}],
  "alert_type": "observation|action_required|critical_risk|none",
  "farmer_message": "Complete friendly message with specific actionable advice (3-5 sentences)"
}`;

      const imageContents = allImages.slice(0, 4).map(img => ({
        type: "image_url" as const,
        image_url: {
          url: toImagePayloadUrl(img),
          detail: "high" as const
        }
      }));

      // Use fallback-enabled AI call
      const userContent = [
        { type: 'text', text: `Analyze this crop photo for growth tracking. ${userNotes ? `Farmer notes: ${userNotes}` : ''}` },
        ...imageContents
      ];

      const aiResult = await callAIWithFallback(growthTrackingPrompt, userContent, 4000);
      
      if (!aiResult.success) {
        console.error('❌ All AI providers failed for growth tracking');
        return new Response(
          JSON.stringify({ success: false, error: 'AI analysis temporarily unavailable. Please try again.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const content = aiResult.data.choices?.[0]?.message?.content || '';
      
      let analysisResult;
      try {
        analysisResult = JSON.parse(content);
      } catch {
        analysisResult = { crop_current_status: content, farmer_message: content };
      }

      // Store analysis if we have Supabase access
      if (farmerId && tenantId && uploadId) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const supabase = createClient(supabaseUrl, supabaseKey);

          await supabase.from('crop_growth_analysis').insert({
            upload_id: uploadId,
            land_id: landId,
            farmer_id: farmerId,
            tenant_id: tenantId,
            crop_current_status: analysisResult.crop_current_status,
            detected_growth_stage: analysisResult.growth_stage_analysis?.detected_stage,
            expected_growth_stage: analysisResult.growth_stage_analysis?.expected_stage,
            growth_stage_deviation: analysisResult.growth_stage_analysis?.deviation,
            visual_observation_summary: analysisResult.visual_observation_summary,
            detected_issues: analysisResult.detected_issues,
            canopy_health_score: (analysisResult.canopy_health_score || 0) / 100,
            uniformity_score: (analysisResult.uniformity_score || 0) / 100,
            ndvi_weather_correlation: analysisResult.ndvi_weather_correlation,
            signal_confidence: analysisResult.signal_confidence,
            next_3_day_prediction: analysisResult.predictions?.next_3_day,
            next_7_day_prediction: analysisResult.predictions?.next_7_day,
            next_14_day_prediction: analysisResult.predictions?.next_14_day,
            risk_level: analysisResult.risk_level,
            risk_factors: analysisResult.risk_factors,
            yield_impact_estimate: analysisResult.yield_impact_estimate,
            recommended_actions: analysisResult.recommended_actions,
            schedule_updates: analysisResult.schedule_updates,
            farmer_message: analysisResult.farmer_message,
            farmer_message_language: language,
            ai_model_used: aiResult.provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o',
            processing_time_ms: Date.now() - startTime,
            confidence_score: (analysisResult.growth_stage_analysis?.stage_confidence || 70) / 100
          });

          // Create alert if needed
          if (analysisResult.alert_type && analysisResult.alert_type !== 'none') {
            await supabase.from('crop_growth_alerts').insert({
              land_id: landId,
              farmer_id: farmerId,
              tenant_id: tenantId,
              alert_type: analysisResult.alert_type,
              alert_category: analysisResult.detected_issues?.[0]?.type || 'general',
              title: analysisResult.detected_issues?.[0]?.name || 'Crop Health Alert',
              message: analysisResult.farmer_message,
              severity: analysisResult.risk_level === 'critical' || analysisResult.risk_level === 'high' ? 'danger' : analysisResult.risk_level === 'medium' ? 'warning' : 'info',
              recommended_action: analysisResult.recommended_actions?.[0]?.action,
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            });
          }

          // Mark upload as processed
          if (uploadId) {
            await supabase.from('crop_growth_uploads').update({ is_processed: true }).eq('id', uploadId);
          }
        } catch (dbError) {
          console.error('Database error:', dbError);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          analysis: analysisResult, 
          processingTimeMs: Date.now() - startTime,
          provider: aiResult.provider 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle targeted_solution mode (no images needed) - use gpt-4o-mini for text-only
    if (mode === 'targeted_solution' && suggestionType && diagnosis) {
      console.log('🎯 Targeted Solution Request:', { suggestionType, landArea, cropDetected: cropDetected?.name });
      
      const areaText = landArea 
        ? `Land area: ${landArea.guntha} guntha (${landArea.acres?.toFixed(2)} acres). Calculate exact product quantities for this area.`
        : '';
      
      const typeLabel = suggestionType === 'organic' ? 'organic/natural' 
        : suggestionType === 'fertilizer' ? 'chemical fertilizer' 
        : suggestionType === 'pesticide' ? 'pesticide/chemical' 
        : 'comprehensive (organic + chemical)';
      
      const targetedPrompt = `Based on this crop diagnosis, provide ONLY ${typeLabel} solutions.

CROP: ${cropDetected?.name || landCrop || 'Unknown'}
DIAGNOSIS: ${diagnosis?.summary || JSON.stringify(diagnosis)}
HEALTH: ${healthStatus?.condition || 'unknown'} (${healthStatus?.score || 0}%)
${areaText}

Provide response in ${language === 'hi' ? 'Hindi' : language === 'mr' ? 'Marathi' : 'English'}.

Return JSON with this structure:
{
  "summary": "Brief summary of recommended solution",
  "recommendations": {
    "${suggestionType}": {
      "type": "${suggestionType}",
      "title": "Solution title",
      "products": [
        {
          "name": "Product name",
          "localName": "Local name",
          "dosage": "Exact dosage${landArea ? ` for ${landArea.guntha} guntha` : ' per acre'}",
          "totalQuantity": "${landArea ? `Total quantity needed for ${landArea.guntha} guntha` : 'Per acre quantity'}",
          "applicationMethod": "How to apply",
          "timing": "When to apply",
          "cost": "₹XXX${landArea ? ` for ${landArea.guntha} guntha` : ' per acre'}"
        }
      ],
      "instructions": ["Step by step"],
      "benefits": ["Expected results"],
      "precautions": ["Safety notes"],
      "estimatedCost": "₹XXX total"
    }
  }
}`;

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Use cheaper model for text-only
          messages: [
            { role: 'system', content: 'You are an expert agricultural scientist. Provide specific, actionable product recommendations with exact quantities.' },
            { role: 'user', content: targetedPrompt }
          ],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again.', rateLimited: true }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const aiResponse = await response.json();
      const content = aiResponse.choices?.[0]?.message?.content || '';
      
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: content, recommendations: {} };
        
        return new Response(
          JSON.stringify({ success: true, result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (parseError) {
        return new Response(
          JSON.stringify({ success: true, result: { summary: content, recommendations: {} } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Combine images and video frames
    const allImages = [...(images || []), ...(videoFrames || [])];
    
    if (allImages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No images or video frames provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔬 AI Crop Scan Request:', {
      imageCount: images?.length || 0,
      videoFrameCount: videoFrames?.length || 0,
      hasUserNotes: !!userNotes,
      language,
      farmerId,
      tenantId,
      landId,
      landCrop,
      mode,
      timestamp: new Date().toISOString()
    });

    // Get language-specific labels
    const getLabels = () => {
      if (language === 'hi') {
        return {
          organic: '🟢 जैविक उपाय (Organic Solution)',
          fertilizer: '🟡 रासायनिक खाद (Chemical Fertilizer)',
          pesticide: '🔴 कीटनाशक (Pesticide Solution)',
          hormone: '💪 हार्मोन ग्रोअर (Hormone Grower)'
        };
      } else if (language === 'mr') {
        return {
          organic: '🟢 सेंद्रिय उपाय (Organic Solution)',
          fertilizer: '🟡 रासायनिक खत (Chemical Fertilizer)',
          pesticide: '🔴 कीटकनाशक (Pesticide Solution)',
          hormone: '💪 हार्मोन ग्रोअर (Hormone Grower)'
        };
      }
      return {
        organic: '🟢 Organic Solution',
        fertilizer: '🟡 Chemical Fertilizer',
        pesticide: '🔴 Pesticide Solution',
        hormone: '💪 Hormone Grower'
      };
    };
    
    const labels = getLabels();

    // Build comprehensive agricultural analysis prompt
    const languageInstruction = language !== 'en' 
      ? `\n\nIMPORTANT: Provide ALL text responses in ${language === 'hi' ? 'Hindi (हिंदी)' : language === 'mr' ? 'Marathi (मराठी)' : language} language. This includes all names, descriptions, instructions, and recommendations. Keep scientific names in Latin.`
      : '';
    
    const landValidation = landCrop 
      ? `\n\nLAND VALIDATION: The farmer's land has "${landCrop}" planted. Compare detected crop with this. If they don't match, set "matchesLandCrop": false and suggest using General Chat for accurate advice.`
      : '';

    const systemPrompt = `You are a world-class agricultural scientist with expertise from:
- ICAR (Indian Council of Agricultural Research)
- State Agricultural Universities (PAU, IARI, TNAU)
- 30+ years of practical field experience across India
- Deep knowledge of regional farming practices

CRITICAL INSTRUCTIONS:
- You are analyzing images from rural Indian farmers using basic smartphones
- Images may be blurry, poorly lit, or taken from awkward angles
- DO NOT reject images for quality issues - work with what you have
- Even sub-optimal images contain valuable diagnostic information
- ACCEPT ALL IMAGES: Even if uncertain, provide your best educated analysis

Your responses must be:
1. ACCURATE: Based on real agricultural science, not generic advice
2. PRACTICAL: Actionable by farmers with limited resources
3. SPECIFIC: Include exact dosages per acre, product names, costs
4. STRUCTURED: Always provide 3 categories of recommendations

THREE-CATEGORY RECOMMENDATION SYSTEM:
For EVERY diagnosis, provide recommendations in 3 categories:
1. ${labels.organic} - Natural/organic solutions (neem, vermicompost, cow dung, etc.)
2. ${labels.fertilizer} - Chemical fertilizers with exact NPK ratios
3. ${labels.pesticide} - Pesticides/fungicides with brand names

For WEAK CROPS, also include:
4. ${labels.hormone} - Growth hormones/regulators (Gibberellic acid, NAA, etc.)

Include for each product:
- Name (local + scientific)
- Exact dosage per acre
- Application method & timing
- Estimated cost in INR
- Safety precautions${languageInstruction}${landValidation}`;

    const userPrompt = `Analyze these agricultural images and provide a comprehensive diagnosis with THREE-CATEGORY recommendations.

${userNotes ? `FARMER'S NOTES: ${userNotes}\n` : ''}
${landCrop ? `LAND'S CURRENT CROP: ${landCrop}\n` : ''}

Provide your analysis in this exact JSON structure (no markdown, just pure JSON):

{
  "cropDetected": {
    "name": "common name of crop/plant",
    "scientificName": "Latin name",
    "confidence": 0-100,
    "category": "crop|weed|pest|disease|seed|nutrient_deficiency|unknown",
    "matchesLandCrop": true|false,
    "landCrop": "${landCrop || 'null'}"
  },
  "healthStatus": {
    "condition": "healthy|warning|critical",
    "score": 0-100,
    "issues": ["list of detected problems"]
  },
  "diagnosis": {
    "summary": "2-4 sentence diagnosis in farmer-friendly language",
    "diseases": [
      {
        "name": "disease name",
        "scientificName": "pathogen name",
        "confidence": 0-100,
        "symptoms": ["visible symptoms"]
      }
    ],
    "pests": [
      {
        "name": "pest name",
        "scientificName": "insect name",
        "confidence": 0-100,
        "damageType": "description"
      }
    ],
    "deficiencies": [
      {
        "nutrient": "N|P|K|Mg|Fe|Zn|etc",
        "severity": "mild|moderate|severe",
        "symptoms": ["visible symptoms"]
      }
    ]
  },
  "recommendations": {
    "organic": {
      "type": "organic",
      "title": "${labels.organic}",
      "products": [
        {
          "name": "Product name",
          "localName": "Local/Hindi name",
          "dosage": "X kg/liter per acre",
          "applicationMethod": "How to apply",
          "timing": "When to apply",
          "cost": "₹XXX per acre"
        }
      ],
      "instructions": ["Step by step instructions"],
      "benefits": ["Why this works"],
      "precautions": ["Safety notes"],
      "estimatedCost": "₹XXX total"
    },
    "fertilizer": {
      "type": "fertilizer",
      "title": "${labels.fertilizer}",
      "products": [
        {
          "name": "Product name (e.g., DAP, Urea, NPK 19:19:19)",
          "localName": "Local name",
          "dosage": "X kg per acre",
          "applicationMethod": "Broadcast/Drip/Foliar",
          "timing": "Growth stage timing",
          "cost": "₹XXX per acre"
        }
      ],
      "instructions": ["Application steps"],
      "benefits": ["Expected improvements"],
      "precautions": ["Avoid over-application warnings"],
      "estimatedCost": "₹XXX total"
    },
    "pesticide": {
      "type": "pesticide",
      "title": "${labels.pesticide}",
      "products": [
        {
          "name": "Active ingredient + Brand name",
          "localName": "Local name",
          "dosage": "X ml/gram per liter water",
          "applicationMethod": "Spray method",
          "timing": "Best time of day/crop stage",
          "cost": "₹XXX per acre"
        }
      ],
      "instructions": ["Mixing and spraying instructions"],
      "benefits": ["Expected control percentage"],
      "precautions": ["Safety gear, withholding period"],
      "estimatedCost": "₹XXX total"
    },
    "hormone": {
      "type": "hormone",
      "title": "${labels.hormone}",
      "products": [
        {
          "name": "Hormone name (e.g., Gibberellic Acid GA3)",
          "localName": "Brand name",
          "dosage": "X ppm concentration",
          "applicationMethod": "Foliar spray",
          "timing": "Growth stage",
          "cost": "₹XXX per acre"
        }
      ],
      "instructions": ["Preparation and application"],
      "benefits": ["Growth improvement expected"],
      "precautions": ["Don't over-apply, temperature sensitivity"],
      "estimatedCost": "₹XXX total"
    }
  },
  "metadata": {
    "confidenceScore": 0-100,
    "needsMoreImages": true|false,
    "labTestRecommended": true|false,
    "weatherSensitive": true|false
  }
}

NOTE: Include "hormone" recommendations ONLY if the crop appears weak, stunted, or needs growth boost. Otherwise, exclude it.

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations outside JSON.`;

    // Prepare image contents (limit to 4 images for token efficiency)
    const imageContents = allImages.slice(0, 4).map(img => ({
      type: "image_url" as const,
      image_url: {
        url: toImagePayloadUrl(img),
        detail: "high" as const
      }
    }));

    const messages = [
      { role: "system" as const, content: systemPrompt },
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: userPrompt },
          ...imageContents
        ]
      }
    ];

    console.log('📡 Calling OpenAI Vision API (gpt-4o)...');
    
    // Use gpt-4o for vision tasks
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Vision model
        messages,
        max_tokens: 8000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API Error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Rate limit exceeded. Please try again in a moment.',
            rateLimited: true 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402 || response.status === 401) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'OpenAI API authentication/billing error.',
            quotaExceeded: true 
          }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const aiResponse = await response.json();
    const aiContent = aiResponse.choices?.[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error('No content in AI response');
    }

    console.log('🤖 Raw AI Response length:', aiContent.length);

    // Helper function to repair truncated JSON
    const repairTruncatedJSON = (content: string): object | null => {
      try {
        let depth = 0;
        let lastValidIndex = 0;
        let inString = false;
        let escapeNext = false;
        
        for (let i = 0; i < content.length; i++) {
          const char = content[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{' || char === '[') depth++;
            if (char === '}' || char === ']') {
              depth--;
              if (depth === 0) lastValidIndex = i + 1;
            }
          }
        }
        
        if (lastValidIndex > 0) {
          const validJSON = content.substring(0, lastValidIndex);
          return JSON.parse(validJSON);
        }
      } catch (e) {
        console.error('JSON repair failed:', e);
      }
      return null;
    };

    // Parse AI response
    let analysisResult;
    try {
      let cleanContent = aiContent.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      
      analysisResult = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response, attempting repair:', parseError);
      console.error('Raw content length:', aiContent.length);
      
      let cleanContent = aiContent.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      
      analysisResult = repairTruncatedJSON(cleanContent);
      
      if (!analysisResult) {
        console.error('JSON repair failed, returning fallback response');
        analysisResult = {
          cropDetected: {
            name: "Crop detected",
            scientificName: "Unknown",
            confidence: 60,
            category: "crop",
            matchesLandCrop: true
          },
          healthStatus: {
            condition: "warning",
            score: 50,
            issues: ["Analysis was incomplete - please try again with a clearer image"]
          },
          diagnosis: {
            summary: language === 'hi' 
              ? "विश्लेषण अधूरा है। कृपया एक स्पष्ट छवि के साथ पुनः प्रयास करें।"
              : language === 'mr'
              ? "विश्लेषण अपूर्ण आहे. कृपया स्पष्ट प्रतिमेसह पुन्हा प्रयत्न करा."
              : "Analysis was incomplete. Please try again with a clearer image.",
            diseases: [],
            pests: [],
            deficiencies: []
          },
          recommendations: {
            organic: {
              type: "organic",
              title: labels.organic,
              products: [{
                name: "General organic treatment",
                dosage: "As recommended",
                applicationMethod: "Foliar spray",
                timing: "Morning hours"
              }],
              instructions: ["Retry analysis for specific recommendations"],
              benefits: [],
              precautions: []
            },
            fertilizer: {
              type: "fertilizer",
              title: labels.fertilizer,
              products: [],
              instructions: ["Retry analysis for specific recommendations"],
              benefits: [],
              precautions: []
            },
            pesticide: {
              type: "pesticide",
              title: labels.pesticide,
              products: [],
              instructions: ["Retry analysis for specific recommendations"],
              benefits: [],
              precautions: []
            }
          },
          metadata: {
            confidenceScore: 40,
            needsMoreImages: true,
            labTestRecommended: false,
            weatherSensitive: false
          }
        };
      } else {
        console.log('✅ JSON repair successful');
      }
    }

    // Log scan to database for analytics
    if (farmerId && tenantId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        await supabase.from('crop_scan_logs').insert({
          farmer_id: farmerId,
          tenant_id: tenantId,
          land_id: landId || null,
          image_count: allImages.length,
          detected_category: analysisResult.cropDetected?.category,
          detected_item: analysisResult.cropDetected?.name,
          confidence: analysisResult.cropDetected?.confidence,
          health_condition: analysisResult.healthStatus?.condition,
          risk_level: analysisResult.healthStatus?.condition === 'critical' ? 'high' : 
                     analysisResult.healthStatus?.condition === 'warning' ? 'medium' : 'low',
          has_user_notes: !!userNotes,
          land_crop_match: analysisResult.cropDetected?.matchesLandCrop,
          language,
          processing_time_ms: Date.now() - startTime,
          created_at: new Date().toISOString()
        }).then(() => {
          console.log('📊 Scan logged to database');
        }).catch((dbError: Error) => {
          console.error('Failed to log scan:', dbError);
        });
      } catch (dbError) {
        console.error('Database logging error:', dbError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Scan completed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        result: analysisResult,
        processingTimeMs: duration,
        language
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in ai-crop-scan:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
