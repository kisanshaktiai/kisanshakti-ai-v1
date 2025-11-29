import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScanRequest {
  images: string[]; // base64 encoded images
  userNotes?: string;
  language?: string;
  farmerId?: string;
  tenantId?: string;
}

interface ScanResponse {
  success: boolean;
  result?: {
    // Core detection
    detectedItem: {
      commonName: string;
      scientificName: string;
      confidence: number; // 0-100
      category: 'crop' | 'weed' | 'pest' | 'disease' | 'seed' | 'nutrient_deficiency' | 'unknown';
    };
    
    // Health assessment
    healthStatus: {
      condition: 'healthy' | 'warning' | 'critical';
      riskLevel: 'low' | 'medium' | 'high';
      primaryIssues: string[];
      secondaryIssues: string[];
    };
    
    // Diagnosis
    diagnosis: {
      summary: string; // 2-4 sentences plain language
      details: string;
      affectedParts: string[];
      likelyDiseases: Array<{
        name: string;
        scientificName?: string;
        confidence: number;
        symptoms: string[];
      }>;
      likelyPests: Array<{
        name: string;
        scientificName?: string;
        confidence: number;
        damageType: string;
      }>;
      nutrientDeficiencies: Array<{
        nutrient: string;
        severity: 'mild' | 'moderate' | 'severe';
        symptoms: string[];
      }>;
    };
    
    // Recommendations
    recommendations: {
      immediate: Array<{
        action: string;
        priority: 'critical' | 'high' | 'medium';
        estimatedCost?: string;
        timeframe: string;
      }>;
      shortTerm: Array<{ // 3-7 days
        action: string;
        priority: 'high' | 'medium' | 'low';
        estimatedCost?: string;
      }>;
      longTerm: Array<{
        action: string;
        preventive: boolean;
      }>;
    };
    
    // Additional info
    metadata: {
      confidenceScore: number;
      needsMoreImages: boolean;
      suggestedNextSteps: string[];
      labTestRecommended: boolean;
      weatherSensitive: boolean;
      evidenceLinks?: string[];
    };
    
    // Visual analysis
    visualAnalysis?: {
      dominantColors: string[];
      textureNotes: string;
      anomalyRegions?: string;
    };
  };
  error?: string;
  rateLimited?: boolean;
  quotaExceeded?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestData: ScanRequest = await req.json();
    const { images, userNotes, language = 'en', farmerId, tenantId } = requestData;

    if (!images || images.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No images provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔬 AI Crop Scan Request:', {
      imageCount: images.length,
      hasUserNotes: !!userNotes,
      language,
      farmerId,
      tenantId,
      timestamp: new Date().toISOString()
    });

    // Build comprehensive agricultural analysis prompt
    const systemPrompt = `You are an expert agricultural scientist and plant pathologist with deep knowledge of crops, diseases, pests, weeds, and nutrient deficiencies. Analyze the provided images with precision and provide actionable farming advice.

Key Analysis Areas:
1. IDENTIFICATION: Precisely identify the plant/crop/weed/pest/disease
2. HEALTH ASSESSMENT: Evaluate overall plant health and stress indicators
3. DISEASE DETECTION: Identify visible diseases, pathogens, or infections
4. PEST DETECTION: Spot insect damage, infestations, or pest presence
5. NUTRIENT ANALYSIS: Detect deficiency symptoms (yellowing, stunting, discoloration)
6. ENVIRONMENTAL STRESS: Identify drought, heat, cold, or waterlogging damage

Be specific, actionable, and farmer-friendly. Prioritize immediate actions that prevent crop loss.`;

    const userPrompt = `Analyze these agricultural images and provide a comprehensive diagnosis.

${userNotes ? `FARMER'S NOTES: ${userNotes}\n` : ''}
Provide your analysis in this exact JSON structure (no markdown, just pure JSON):

{
  "detectedItem": {
    "commonName": "string (crop/plant common name)",
    "scientificName": "string (Latin scientific name)",
    "confidence": number (0-100),
    "category": "crop|weed|pest|disease|seed|nutrient_deficiency|unknown"
  },
  "healthStatus": {
    "condition": "healthy|warning|critical",
    "riskLevel": "low|medium|high",
    "primaryIssues": ["list of main problems"],
    "secondaryIssues": ["list of minor problems"]
  },
  "diagnosis": {
    "summary": "2-4 sentence plain language diagnosis",
    "details": "detailed explanation",
    "affectedParts": ["leaves", "stems", "roots", "fruits"],
    "likelyDiseases": [
      {
        "name": "disease common name",
        "scientificName": "pathogen name",
        "confidence": 0-100,
        "symptoms": ["visible symptoms"]
      }
    ],
    "likelyPests": [
      {
        "name": "pest common name",
        "scientificName": "insect scientific name",
        "confidence": 0-100,
        "damageType": "description"
      }
    ],
    "nutrientDeficiencies": [
      {
        "nutrient": "N|P|K|Mg|Fe|Zn|etc",
        "severity": "mild|moderate|severe",
        "symptoms": ["visible symptoms"]
      }
    ]
  },
  "recommendations": {
    "immediate": [
      {
        "action": "specific action to take NOW",
        "priority": "critical|high|medium",
        "estimatedCost": "approximate cost if applicable",
        "timeframe": "within X hours/days"
      }
    ],
    "shortTerm": [
      {
        "action": "action for next 3-7 days",
        "priority": "high|medium|low",
        "estimatedCost": "cost estimate"
      }
    ],
    "longTerm": [
      {
        "action": "preventive/future action",
        "preventive": true|false
      }
    ]
  },
  "metadata": {
    "confidenceScore": number (0-100),
    "needsMoreImages": boolean,
    "suggestedNextSteps": ["what other images/info would help"],
    "labTestRecommended": boolean,
    "weatherSensitive": boolean,
    "evidenceLinks": ["optional educational links"]
  },
  "visualAnalysis": {
    "dominantColors": ["color descriptions"],
    "textureNotes": "texture observations",
    "anomalyRegions": "description of abnormal areas"
  }
}

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations outside JSON.`;

    // Prepare OpenAI Vision API call with multiple images
    const imageContents = images.slice(0, 3).map(img => ({ // Limit to 3 images
      type: "image_url" as const,
      image_url: {
        url: img,
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

    console.log('📡 Calling OpenAI Vision API...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        max_tokens: 4000,
        temperature: 0.3, // Lower temperature for more consistent analysis
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
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'AI quota exceeded. Please contact support.',
            quotaExceeded: true 
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const aiResponse = await response.json();
    const aiContent = aiResponse.choices?.[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error('No content in AI response');
    }

    console.log('🤖 Raw AI Response:', aiContent.substring(0, 200));

    // Parse AI response
    let analysisResult;
    try {
      analysisResult = JSON.parse(aiContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw content:', aiContent);
      throw new Error('Invalid AI response format');
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
          image_count: images.length,
          detected_category: analysisResult.detectedItem?.category,
          detected_item: analysisResult.detectedItem?.commonName,
          confidence: analysisResult.detectedItem?.confidence,
          health_condition: analysisResult.healthStatus?.condition,
          risk_level: analysisResult.healthStatus?.riskLevel,
          has_user_notes: !!userNotes,
          language,
          processing_time_ms: Date.now() - startTime,
          created_at: new Date().toISOString()
        });
      } catch (dbError) {
        console.error('Failed to log scan to database:', dbError);
        // Don't fail the request if logging fails
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Scan completed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        result: analysisResult,
        processingTimeMs: duration
      } as ScanResponse),
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
