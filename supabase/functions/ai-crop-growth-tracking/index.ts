import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GrowthTrackingRequest {
  uploadId: string;
  imageUrl: string;
  landId: string;
  farmerId: string;
  tenantId: string;
  language?: string;
}

interface LandContext {
  id: string;
  name: string;
  crop_name?: string;
  variety?: string;
  sowing_date?: string;
  area_guntha?: number;
  soil_type?: string;
  irrigation_type?: string;
  village?: string;
  district?: string;
  state?: string;
}

interface NDVIData {
  ndvi_value?: number;
  ndwi_value?: number;
  recorded_at?: string;
}

interface WeatherData {
  temperature?: number;
  humidity?: number;
  rainfall?: number;
  condition?: string;
}

interface SoilHealth {
  nitrogen_level?: string;
  phosphorus_level?: string;
  potassium_level?: string;
  ph_value?: number;
  organic_carbon?: number;
  tested_at?: string;
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestData: GrowthTrackingRequest = await req.json();
    const { uploadId, imageUrl, landId, farmerId, tenantId, language = 'en' } = requestData;

    console.log('🌱 AI Crop Growth Tracking Request:', {
      uploadId,
      landId,
      farmerId,
      language,
      timestamp: new Date().toISOString()
    });

    // Fetch land context
    const { data: landData, error: landError } = await supabase
      .from('lands')
      .select('*')
      .eq('id', landId)
      .single();

    if (landError) {
      console.error('Error fetching land:', landError);
    }

    const land: LandContext = landData || {};

    // Fetch latest NDVI data
    const { data: ndviData } = await supabase
      .from('ndvi_data')
      .select('ndvi_value, ndwi_value, recorded_at')
      .eq('land_id', landId)
      .order('recorded_at', { ascending: false })
      .limit(5);

    // Fetch soil health data
    const { data: soilData } = await supabase
      .from('soil_health_reports')
      .select('*')
      .eq('land_id', landId)
      .order('tested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch previous uploads for comparison
    const { data: previousUploads } = await supabase
      .from('crop_growth_uploads')
      .select('id, upload_timestamp, file_url')
      .eq('land_id', landId)
      .neq('id', uploadId)
      .order('upload_timestamp', { ascending: false })
      .limit(3);

    // Fetch previous analysis for trend detection
    const { data: previousAnalysis } = await supabase
      .from('crop_growth_analysis')
      .select('*')
      .eq('land_id', landId)
      .order('created_at', { ascending: false })
      .limit(3);

    // Calculate expected growth stage based on sowing date
    const calculateExpectedStage = (sowingDate: string, cropName: string): string => {
      if (!sowingDate) return 'unknown';
      
      const sowing = new Date(sowingDate);
      const now = new Date();
      const daysSinceSowing = Math.floor((now.getTime() - sowing.getTime()) / (1000 * 60 * 60 * 24));
      
      const cropStages: Record<string, { stages: [number, string][] }> = {
        'wheat': { stages: [[0, 'germination'], [15, 'seedling'], [30, 'tillering'], [60, 'stem_elongation'], [80, 'heading'], [100, 'flowering'], [120, 'grain_filling'], [140, 'maturity']] },
        'rice': { stages: [[0, 'germination'], [20, 'seedling'], [40, 'tillering'], [60, 'panicle_initiation'], [80, 'heading'], [100, 'flowering'], [120, 'grain_filling'], [145, 'maturity']] },
        'cotton': { stages: [[0, 'germination'], [15, 'seedling'], [45, 'squaring'], [70, 'flowering'], [100, 'boll_development'], [140, 'boll_opening'], [170, 'maturity']] },
        'soybean': { stages: [[0, 'emergence'], [15, 'vegetative'], [45, 'flowering'], [70, 'pod_development'], [100, 'seed_filling'], [120, 'maturity']] },
        'sugarcane': { stages: [[0, 'germination'], [45, 'tillering'], [120, 'grand_growth'], [270, 'maturity']] },
        'default': { stages: [[0, 'germination'], [15, 'vegetative'], [45, 'growth'], [80, 'reproductive'], [120, 'maturity']] }
      };
      
      const cropKey = cropName?.toLowerCase().includes('wheat') ? 'wheat'
        : cropName?.toLowerCase().includes('rice') ? 'rice'
        : cropName?.toLowerCase().includes('cotton') ? 'cotton'
        : cropName?.toLowerCase().includes('soya') ? 'soybean'
        : cropName?.toLowerCase().includes('sugarcane') ? 'sugarcane'
        : 'default';
      
      const stages = cropStages[cropKey].stages;
      let currentStage = stages[0][1];
      
      for (const [day, stage] of stages) {
        if (daysSinceSowing >= day) {
          currentStage = stage;
        }
      }
      
      return currentStage;
    };

    const expectedStage = calculateExpectedStage(land.sowing_date || '', land.crop_name || '');
    const daysSinceSowing = land.sowing_date 
      ? Math.floor((new Date().getTime() - new Date(land.sowing_date).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Build comprehensive context
    const contextData = {
      land: {
        name: land.name,
        crop: land.crop_name,
        variety: land.variety,
        sowing_date: land.sowing_date,
        days_since_sowing: daysSinceSowing,
        expected_stage: expectedStage,
        area_guntha: land.area_guntha,
        soil_type: land.soil_type,
        irrigation_type: land.irrigation_type,
        location: `${land.village || ''}, ${land.district || ''}, ${land.state || ''}`
      },
      ndvi: ndviData?.map(n => ({
        value: n.ndvi_value,
        ndwi: n.ndwi_value,
        date: n.recorded_at
      })),
      soil: soilData ? {
        nitrogen: soilData.nitrogen_level,
        phosphorus: soilData.phosphorus_level,
        potassium: soilData.potassium_level,
        ph: soilData.ph_value,
        organic_carbon: soilData.organic_carbon,
        tested_at: soilData.tested_at
      } : null,
      previous_analysis_count: previousAnalysis?.length || 0,
      previous_issues: previousAnalysis?.flatMap(a => a.detected_issues || []).slice(0, 5)
    };

    // Language instruction
    const languageInstruction = language === 'hi' 
      ? 'Respond in Hindi (हिंदी). Use simple farmer-friendly language. Address farmer as "किसान मित्र".'
      : language === 'mr'
      ? 'Respond in Marathi (मराठी). Use simple farmer-friendly language. Address farmer as "शेतकरी मित्र".'
      : 'Respond in simple Indian English. Address farmer as "Farmer Mitra" or "Bhavkar".';

    const systemPrompt = `You are a Senior Agriculture Scientist with 50+ years of field experience across Indian agro-climatic zones. You are the core decision intelligence of KisanShaktiAI platform.

YOUR ROLE:
- Continuously monitor crop growth through uploaded photos
- Detect early stress signals before visible crop failure
- Provide proactive guidance to prevent losses and maximize yield
- Use scientific, practical, and region-specific advice

CRITICAL ANALYSIS RULES:
1. TREAT each photo as time-series growth evidence
2. COMPARE current visuals with expected growth stage
3. NEVER rely on images alone - correlate with NDVI, weather, soil data
4. If signals conflict, flag as "needs_observation" not false certainty
5. PREDICT what will happen in next 3-7-14 days
6. Always give ACTIONABLE advice, not just diagnosis

FARMER COMMUNICATION:
${languageInstruction}
- Use simple terms, avoid jargon unless explained
- Be respectful and encouraging
- Give specific quantities (e.g., "Apply 25 kg urea per acre")

CONTEXT DATA:
${JSON.stringify(contextData, null, 2)}`;

    const userPrompt = `Analyze this crop photo and provide comprehensive growth tracking analysis.

Expected Growth Stage: ${expectedStage}
Days Since Sowing: ${daysSinceSowing || 'Unknown'}
Current Crop: ${land.crop_name || 'Unknown'}
Latest NDVI: ${ndviData?.[0]?.ndvi_value || 'Not available'}

Return your analysis in this EXACT JSON structure:

{
  "crop_current_status": "Brief 1-2 sentence current status",
  "growth_stage_analysis": {
    "detected_stage": "detected growth stage name",
    "expected_stage": "${expectedStage}",
    "deviation": "ahead|on_track|slightly_delayed|delayed|severely_delayed",
    "days_deviation": number or null,
    "stage_confidence": 0-100
  },
  "visual_observation_summary": "Detailed 3-5 sentence visual analysis",
  "detected_issues": [
    {
      "type": "pest|disease|nutrient_deficiency|water_stress|weather_damage|mechanical_damage|weed|none",
      "name": "Issue name",
      "severity": "mild|moderate|severe",
      "affected_area": "percentage or description",
      "confidence": 0-100,
      "symptoms": ["visible symptoms"]
    }
  ],
  "canopy_health_score": 0-100,
  "uniformity_score": 0-100,
  "ndvi_weather_correlation": "Analysis of how NDVI and weather data correlate with visual observations",
  "signal_confidence": "high|medium|low|needs_observation",
  "conflicting_signals": ["List any conflicts between image, NDVI, weather, soil data"] or null,
  "predictions": {
    "next_3_day": "What will happen in next 3 days if current conditions continue",
    "next_7_day": "Prediction for next 7 days with specific risks",
    "next_14_day": "Longer term prediction and potential yield impact"
  },
  "risk_level": "low|medium|high|critical",
  "risk_factors": [
    {
      "factor": "Risk factor name",
      "probability": 0-100,
      "impact": "low|medium|high",
      "timeframe": "When this risk may materialize"
    }
  ],
  "yield_impact_estimate": "Estimated impact on yield if issues not addressed",
  "recommended_actions": [
    {
      "action": "Specific action to take",
      "timing": "When to do it (e.g., 'within 2 days', 'immediately')",
      "reason": "Why this is needed",
      "priority": "critical|high|medium|low",
      "product": "Specific product/input if applicable",
      "dosage": "Exact quantity per acre/guntha",
      "cost_estimate": "Approximate cost in INR"
    }
  ],
  "schedule_updates": [
    {
      "task_type": "irrigation|fertilizer|pesticide|harvesting|other",
      "change_type": "advance|delay|add|modify|cancel",
      "original_timing": "Original scheduled time if applicable",
      "new_timing": "New recommended timing",
      "reason": "Why this change is recommended"
    }
  ] or null,
  "alert_type": "observation|action_required|critical_risk|none",
  "alert_message": "Alert message if any" or null,
  "farmer_message": "Complete friendly message to farmer (3-5 sentences) with specific actionable advice"
}

IMPORTANT: Be specific with quantities and timing. Use the land area (${land.area_guntha || 'unknown'} guntha) for calculations.`;

    console.log('📡 Calling OpenAI Vision API for growth tracking...');

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
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API Error:', response.status, errorText);
      
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
    
    let analysisResult;
    try {
      analysisResult = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      throw new Error('Invalid AI response format');
    }

    const processingTime = Date.now() - startTime;

    // Store analysis in database
    const { data: analysis, error: insertError } = await supabase
      .from('crop_growth_analysis')
      .insert({
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
        canopy_health_score: analysisResult.canopy_health_score / 100,
        uniformity_score: analysisResult.uniformity_score / 100,
        ndvi_weather_correlation: analysisResult.ndvi_weather_correlation,
        signal_confidence: analysisResult.signal_confidence,
        conflicting_signals: analysisResult.conflicting_signals,
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
        ai_model_used: 'gpt-4o',
        processing_time_ms: processingTime,
        confidence_score: (analysisResult.growth_stage_analysis?.stage_confidence || 70) / 100
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error storing analysis:', insertError);
    }

    // Create alert if needed
    if (analysisResult.alert_type && analysisResult.alert_type !== 'none') {
      const alertCategory = analysisResult.detected_issues?.[0]?.type || 'general';
      const severity = analysisResult.risk_level === 'critical' ? 'danger' 
        : analysisResult.risk_level === 'high' ? 'warning' 
        : 'info';

      await supabase
        .from('crop_growth_alerts')
        .insert({
          analysis_id: analysis?.id,
          land_id: landId,
          farmer_id: farmerId,
          tenant_id: tenantId,
          alert_type: analysisResult.alert_type,
          alert_category: alertCategory,
          title: analysisResult.detected_issues?.[0]?.name || 'Crop Health Alert',
          message: analysisResult.alert_message || analysisResult.farmer_message,
          severity: severity,
          trigger_conditions: {
            risk_level: analysisResult.risk_level,
            issues: analysisResult.detected_issues,
            predictions: analysisResult.predictions
          },
          recommended_action: analysisResult.recommended_actions?.[0]?.action,
          action_deadline: analysisResult.recommended_actions?.[0]?.timing?.includes('immediately') 
            ? new Date().toISOString()
            : null,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });
    }

    // Update growth history
    const today = new Date().toISOString().split('T')[0];
    await supabase
      .from('crop_growth_history')
      .upsert({
        land_id: landId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        record_date: today,
        growth_stage: analysisResult.growth_stage_analysis?.detected_stage,
        health_score: analysisResult.canopy_health_score / 100,
        ndvi_value: ndviData?.[0]?.ndvi_value,
        weather_summary: null,
        issues_detected: analysisResult.detected_issues?.length || 0
      }, {
        onConflict: 'land_id,record_date'
      });

    // Mark upload as processed
    await supabase
      .from('crop_growth_uploads')
      .update({ is_processed: true })
      .eq('id', uploadId);

    console.log('✅ Growth tracking analysis complete:', {
      analysisId: analysis?.id,
      riskLevel: analysisResult.risk_level,
      alertType: analysisResult.alert_type,
      processingTime
    });

    return new Response(
      JSON.stringify({
        success: true,
        analysis: analysisResult,
        analysisId: analysis?.id,
        processingTimeMs: processingTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Growth tracking error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Analysis failed' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
