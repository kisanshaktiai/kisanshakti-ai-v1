import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // SECURITY: Extract tenant ID from headers for monitoring
    const tenantId = req.headers.get('x-tenant-id');
    
    // Note: This is a background monitoring job, so tenant filtering is optional
    // If tenantId is provided, only monitor that tenant's schedules
    console.log('🔐 [Monitor] Tenant filter:', tenantId || 'all tenants');

    // Rate limiting: 10 requests per hour for monitoring (background job)
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'monitor-service';
    const rateLimit = await checkRateLimit(clientIp, 'ai-schedule-monitor', { maxRequests: 10, windowMs: 3600000 });
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded for monitoring service.',
          resetTime: new Date(rateLimit.resetTime).toISOString()
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json'
          } 
        }
      );
    }

    // Fetch active schedules (filter by tenant if provided)
    let scheduleQuery = supabase
      .from('crop_schedules')
      .select('*, lands(*)')
      .eq('is_active', true)
      .gte('harvest_date', new Date().toISOString().split('T')[0]);
    
    // Apply tenant filter if header is present
    if (tenantId) {
      scheduleQuery = scheduleQuery.eq('tenant_id', tenantId);
    }
    
    const { data: activeSchedules } = await scheduleQuery;

    if (!activeSchedules || activeSchedules.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active schedules to monitor' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Monitoring ${activeSchedules.length} active schedules`);

    const results = [];

    for (const schedule of activeSchedules) {
      try {
        // 1. Fetch current weather
        const weatherResponse = await fetch(
          `https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/weather?lat=${schedule.lands.latitude}&lng=${schedule.lands.longitude}`
        );
        const weather = weatherResponse.ok ? await weatherResponse.json() : null;

        // 2. Fetch latest NDVI
        const { data: latestNdvi } = await supabase
          .from('ndvi_cache')
          .select('*')
          .eq('land_id', schedule.land_id)
          .order('cached_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // 3. Fetch land soil data
        const { data: land } = await supabase
          .from('lands')
          .select('*')
          .eq('id', schedule.land_id)
          .single();

        // 4. Build monitoring prompt
        const systemPrompt = `You are an AI agricultural monitoring system for KisanShakti AI.
Analyze current crop conditions and generate:
1. Schedule refinements if conditions have changed significantly
2. Urgent alerts for farmers if action is needed
3. Predictive insights about upcoming needs

Be proactive, precise, and always explain your reasoning.`;

        const userPrompt = `Analyze current conditions for:

**SCHEDULE:**
- Crop: ${schedule.crop_name} ${schedule.crop_variety || ''}
- Sowing Date: ${schedule.sowing_date}
- Days Since Sowing: ${Math.floor((new Date().getTime() - new Date(schedule.sowing_date).getTime()) / (1000 * 60 * 60 * 24))}

**CURRENT CONDITIONS:**
- Weather: ${JSON.stringify(weather?.current || {})}
- Forecast (7 days): ${JSON.stringify(weather?.forecast || [])}
- Latest NDVI: ${latestNdvi?.ndvi_value || 'Not available'}
- Soil pH: ${land?.soil_ph || 'Unknown'}
- Soil Moisture: ${weather?.current?.humidity ? `~${weather.current.humidity}%` : 'Unknown'}

**HISTORICAL NDVI TREND:**
${latestNdvi ? 'Available for analysis' : 'No data'}

Generate recommendations as JSON:
{
  "health_score": 0-100,
  "refinements": [
    {
      "type": "weather_adjustment|ndvi_adjustment|soil_adjustment|pest_alert|disease_alert|irrigation_optimization",
      "severity": "low|medium|high|critical",
      "reason": "detailed explanation",
      "recommended_action": "specific action needed",
      "original_date": "YYYY-MM-DD or null",
      "new_date": "YYYY-MM-DD or null"
    }
  ],
  "alerts": [
    {
      "type": "irrigation|fertilizer|pest_control|disease|harvest|weather_warning|soil_health",
      "priority": "low|medium|high|critical",
      "title": "short title",
      "message": "detailed message for farmer",
      "action_required": "specific steps",
      "expires_in_hours": number
    }
  ],
  "predictions": {
    "upcoming_needs": ["list of predicted needs in next 7-14 days"],
    "estimated_costs": number,
    "optimal_timing": "notes on timing"
  }
}`;

        // 5. Call OpenAI GPT-5-mini
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5-mini-2025-08-07',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
            max_completion_tokens: 4096,
          }),
        });

        if (!aiResponse.ok) {
          console.error(`OpenAI error for schedule ${schedule.id}:`, aiResponse.status);
          continue;
        }

        const aiData = await aiResponse.json();
        const analysis = JSON.parse(aiData.choices[0].message.content);

        // 6. Save monitoring data
        await supabase.from('schedule_monitoring').insert({
          schedule_id: schedule.id,
          tenant_id: schedule.tenant_id,
          farmer_id: schedule.farmer_id,
          land_id: schedule.land_id,
          check_date: new Date().toISOString().split('T')[0],
          weather_conditions: weather?.current,
          ndvi_value: latestNdvi?.ndvi_value,
          soil_ph: land?.soil_ph,
          npk_levels: { n: land?.nitrogen, p: land?.phosphorus, k: land?.potassium },
          health_score: analysis.health_score,
          alerts_generated: analysis.alerts?.length || 0,
          refinements_applied: 0,
        });

        // 7. Save refinements
        if (analysis.refinements && analysis.refinements.length > 0) {
          const refinements = analysis.refinements.map((r: any) => ({
            schedule_id: schedule.id,
            tenant_id: schedule.tenant_id,
            farmer_id: schedule.farmer_id,
            land_id: schedule.land_id,
            refinement_type: r.type,
            trigger_data: { weather, ndvi: latestNdvi },
            ai_reasoning: r.reason,
            recommended_action: r.recommended_action,
            original_date: r.original_date,
            new_date: r.new_date,
            severity: r.severity,
            status: 'pending',
          }));
          await supabase.from('ai_schedule_refinements').insert(refinements);
        }

        // 8. Save alerts
        if (analysis.alerts && analysis.alerts.length > 0) {
          const alerts = analysis.alerts.map((a: any) => ({
            tenant_id: schedule.tenant_id,
            farmer_id: schedule.farmer_id,
            land_id: schedule.land_id,
            schedule_id: schedule.id,
            alert_type: a.type,
            priority: a.priority,
            title: a.title,
            message: a.message,
            ai_reasoning: analysis.health_score < 70 ? 'Health score below threshold' : 'Proactive monitoring',
            action_required: a.action_required,
            data_source: { weather, ndvi: latestNdvi },
            expires_at: new Date(Date.now() + (a.expires_in_hours || 72) * 60 * 60 * 1000).toISOString(),
          }));
          await supabase.from('farmer_alerts').insert(alerts);
        }

        // 9. Log decision
        await supabase.from('ai_decision_log').insert({
          tenant_id: schedule.tenant_id,
          farmer_id: schedule.farmer_id,
          land_id: schedule.land_id,
          schedule_id: schedule.id,
          decision_type: 'schedule_refinement',
          model_version: 'openai/gpt-5-mini-2025-08-07',
          input_data: { schedule_id: schedule.id, days_since_sowing: Math.floor((Date.now() - new Date(schedule.sowing_date).getTime()) / (1000 * 60 * 60 * 24)) },
          output_data: analysis,
          reasoning: `Health: ${analysis.health_score}/100`,
          confidence_score: analysis.health_score / 100,
          weather_data: weather,
          ndvi_data: latestNdvi,
          soil_data: { ph: land?.soil_ph },
          success: true,
        });

        results.push({
          schedule_id: schedule.id,
          crop: schedule.crop_name,
          health_score: analysis.health_score,
          alerts: analysis.alerts?.length || 0,
          refinements: analysis.refinements?.length || 0,
        });

      } catch (scheduleError) {
        console.error(`Error monitoring schedule ${schedule.id}:`, scheduleError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        monitored: results.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-schedule-monitor:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
