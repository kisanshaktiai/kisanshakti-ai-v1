import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScanRequest {
  images?: string[];
  videoFrames?: string[];
  userNotes?: string;
  language?: string;
  farmerId?: string;
  tenantId?: string;
  landId?: string;
  landCrop?: string;
  mode?: 'quick' | 'full' | 'targeted_solution';
  suggestionType?: 'organic' | 'fertilizer' | 'pesticide' | 'hybrid';
  landArea?: { guntha: number; acres: number; sqft: number };
  diagnosis?: any;
  cropDetected?: any;
  healthStatus?: any;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    // Use OpenAI API exclusively
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAIApiKey) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      healthStatus
    } = requestData;

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
        url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`,
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
