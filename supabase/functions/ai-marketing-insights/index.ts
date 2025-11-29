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

    // SECURITY: Extract tenant ID from headers (not body)
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    
    // Validate required header
    if (!tenantId) {
      console.error('Missing required header: x-tenant-id');
      return new Response(
        JSON.stringify({ 
          error: 'Missing required header',
          details: 'x-tenant-id header is required'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: 50 requests per hour per tenant
    const rateLimit = await checkRateLimit(tenantId || 'anonymous', 'ai-marketing-insights', { maxRequests: 50, windowMs: 3600000 });
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
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

    console.log(`Generating marketing insights for tenant: ${tenantId}`);

    // 1. Aggregate all active schedules data
    const { data: schedules } = await supabase
      .from('crop_schedules')
      .select(`
        *,
        schedule_tasks(*),
        lands(*)
      `)
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (!schedules || schedules.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active schedules found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Fetch recent alerts and refinements
    const { data: recentAlerts } = await supabase
      .from('farmer_alerts')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const { data: refinements } = await supabase
      .from('ai_schedule_refinements')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // 3. Build comprehensive analysis
    const cropsByType: Record<string, number> = {};
    const regionDistribution: Record<string, number> = {};
    const upcomingTasks: any[] = [];
    let totalArea = 0;

    schedules.forEach((schedule) => {
      cropsByType[schedule.crop_name] = (cropsByType[schedule.crop_name] || 0) + 1;
      const region = schedule.lands?.location || 'Unknown';
      regionDistribution[region] = (regionDistribution[region] || 0) + 1;
      totalArea += schedule.lands?.area || 0;

      // Find tasks in next 14 days
      const today = new Date();
      const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
      
      schedule.schedule_tasks?.forEach((task: any) => {
        const taskDate = new Date(task.due_date);
        if (taskDate >= today && taskDate <= twoWeeksLater && task.status === 'pending') {
          upcomingTasks.push({
            ...task,
            crop: schedule.crop_name,
            farmer_id: schedule.farmer_id,
            land_id: schedule.land_id,
          });
        }
      });
    });

    // 4. Aggregate demand by category
    const demandByCategory: Record<string, { count: number; tasks: any[] }> = {};
    upcomingTasks.forEach((task) => {
      const category = task.task_category;
      if (!demandByCategory[category]) {
        demandByCategory[category] = { count: 0, tasks: [] };
      }
      demandByCategory[category].count++;
      demandByCategory[category].tasks.push(task);
    });

    // 5. Build AI prompt for predictive insights
    const systemPrompt = `You are an AI agri-business intelligence system for KisanShakti AI.
Analyze farmer schedules and activities to generate actionable marketing insights for the tenant/admin team.
Focus on predicting upcoming demand, optimal timing for product promotions, and business opportunities.`;

    const userPrompt = `Analyze this agricultural data and generate business insights:

**ACTIVE FARMS:**
- Total Schedules: ${schedules.length}
- Total Area: ${totalArea.toFixed(2)} hectares
- Crops: ${JSON.stringify(cropsByType)}
- Regions: ${JSON.stringify(regionDistribution)}

**UPCOMING TASKS (Next 14 days):**
- Total Tasks: ${upcomingTasks.length}
- By Category: ${JSON.stringify(Object.keys(demandByCategory).map(cat => ({ category: cat, count: demandByCategory[cat].count })))}

**RECENT ALERTS (Last 30 days):**
- Total: ${recentAlerts?.length || 0}
- Types: ${JSON.stringify(recentAlerts?.reduce((acc: any, alert) => { acc[alert.alert_type] = (acc[alert.alert_type] || 0) + 1; return acc; }, {}))}

**RECENT ADJUSTMENTS (Last 30 days):**
- Total: ${refinements?.length || 0}
- Types: ${JSON.stringify(refinements?.reduce((acc: any, ref) => { acc[ref.refinement_type] = (acc[ref.refinement_type] || 0) + 1; return acc; }, {}))}

Generate marketing insights as JSON:
{
  "insights": [
    {
      "insight_type": "fertilizer_demand|seed_demand|pesticide_demand|equipment_rental|harvest_season|crop_trend",
      "crop_type": "string or null",
      "region": "string or null",
      "predicted_demand_quantity": number,
      "predicted_demand_unit": "string",
      "confidence_score": 0-1,
      "time_window_start": "YYYY-MM-DD",
      "time_window_end": "YYYY-MM-DD",
      "affected_farmers_count": number,
      "affected_lands_count": number,
      "total_area_hectares": number,
      "supporting_data": {},
      "ai_reasoning": "detailed explanation",
      "recommendations": "actionable business recommendations"
    }
  ],
  "summary": {
    "top_opportunities": ["list of top 3 business opportunities"],
    "urgent_demands": ["immediate needs to address"],
    "seasonal_trends": "analysis of seasonal patterns"
  }
}`;

    // 6. Call OpenAI GPT-5-mini
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
      const errorText = await aiResponse.text();
      console.error('OpenAI API error:', aiResponse.status, errorText);
      throw new Error(`OpenAI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysis = JSON.parse(aiData.choices[0].message.content);

    // 7. Save insights
    if (analysis.insights && analysis.insights.length > 0) {
      const insightsToSave = analysis.insights.map((insight: any) => ({
        tenant_id: tenantId,
        insight_type: insight.insight_type,
        crop_type: insight.crop_type,
        region: insight.region,
        predicted_demand_quantity: insight.predicted_demand_quantity,
        predicted_demand_unit: insight.predicted_demand_unit,
        confidence_score: insight.confidence_score,
        time_window_start: insight.time_window_start,
        time_window_end: insight.time_window_end,
        affected_farmers_count: insight.affected_farmers_count,
        affected_lands_count: insight.affected_lands_count,
        total_area_hectares: insight.total_area_hectares,
        supporting_data: insight.supporting_data,
        ai_reasoning: insight.ai_reasoning,
        recommendations: insight.recommendations,
      }));

      await supabase.from('agri_marketing_insights').insert(insightsToSave);
    }

    // 8. Log decision
    await supabase.from('ai_decision_log').insert({
      tenant_id: tenantId,
      decision_type: 'marketing_prediction',
      model_version: 'openai/gpt-5-mini-2025-08-07',
      input_data: {
        schedules_count: schedules.length,
        upcoming_tasks: upcomingTasks.length,
        alerts: recentAlerts?.length || 0,
      },
      output_data: analysis,
      reasoning: analysis.summary?.top_opportunities?.join(', ') || 'Marketing analysis completed',
      confidence_score: analysis.insights?.reduce((sum: number, i: any) => sum + i.confidence_score, 0) / (analysis.insights?.length || 1),
      success: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        insights: analysis.insights,
        summary: analysis.summary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-marketing-insights:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
