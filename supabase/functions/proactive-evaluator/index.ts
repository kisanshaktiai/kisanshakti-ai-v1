import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ProactiveRule {
  id: string;
  rule_code: string;
  crop_code: string | null;
  stage_applicable: string[];
  alert_category: string;
  priority: string;
  condition_type: string;
  conditions: Record<string, any>;
  title_mr: string | null;
  title_hi: string | null;
  title_en: string;
  message_template_mr: string | null;
  message_template_hi: string | null;
  message_template_en: string;
  action_template_mr: string | null;
  action_template_hi: string | null;
  action_template_en: string | null;
  cooldown_hours: number;
  forecast_horizon_days: number;
}

interface LandContext {
  land_id: string;
  farmer_id: string;
  tenant_id: string;
  crop_code: string | null;
  sowing_date: string | null;
  current_stage: string | null;
  das: number;
  weather: {
    temp: number | null;
    humidity: number | null;
    rain_mm: number | null;
    wind_speed: number | null;
    description: string | null;
  };
  ndvi: number | null;
  ndvi_previous: number | null;
  land_name: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'scheduled';
    const targetLandId = body.land_id || null;
    const tenantId = body.tenant_id || 'default';

    console.log(`[ProactiveEvaluator] Action: ${action}, Land: ${targetLandId || 'ALL'}`);

    // 1. Load active proactive rules
    const { data: rules, error: rulesError } = await supabase
      .from('proactive_rules')
      .select('*')
      .eq('is_active', true);

    if (rulesError) throw new Error(`Rules load failed: ${rulesError.message}`);
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, message: 'No active proactive rules', 
        alerts_generated: 0 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Load active lands with crop schedules
    let landsQuery = supabase
      .from('lands')
      .select('id, farmer_id, tenant_id, crop_type, land_name, sowing_date, coordinates')
      .eq('is_active', true);

    if (targetLandId) {
      landsQuery = landsQuery.eq('id', targetLandId);
    }

    const { data: lands, error: landsError } = await landsQuery.limit(500);
    if (landsError) throw new Error(`Lands load failed: ${landsError.message}`);
    if (!lands || lands.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, message: 'No active lands', 
        alerts_generated: 0 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Build land contexts with weather + NDVI
    const landContexts: LandContext[] = [];

    for (const land of lands) {
      const das = land.sowing_date 
        ? Math.floor((Date.now() - new Date(land.sowing_date).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const currentStage = computeStage(land.crop_type, das);

      // Get latest weather
      let weather = { temp: null as number | null, humidity: null as number | null, rain_mm: null as number | null, wind_speed: null as number | null, description: null as string | null };
      if (land.coordinates) {
        const coords = typeof land.coordinates === 'string' ? JSON.parse(land.coordinates) : land.coordinates;
        const lat = coords?.center?.lat || coords?.lat || coords?.[0]?.lat;
        const lon = coords?.center?.lng || coords?.lng || coords?.[0]?.lng;
        if (lat && lon) {
          const locationKey = `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
          const { data: weatherData } = await supabase
            .from('weather_current')
            .select('temperature, humidity, rain_1h, wind_speed, description')
            .eq('location_key', locationKey)
            .order('fetched_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (weatherData) {
            weather = {
              temp: weatherData.temperature,
              humidity: weatherData.humidity,
              rain_mm: weatherData.rain_1h,
              wind_speed: weatherData.wind_speed,
              description: weatherData.description,
            };
          }
        }
      }

      // Get latest NDVI
      let ndvi: number | null = null;
      let ndvi_previous: number | null = null;
      const { data: ndviData } = await supabase
        .from('ndvi_data')
        .select('ndvi_value, recorded_at')
        .eq('land_id', land.id)
        .order('recorded_at', { ascending: false })
        .limit(2);
      if (ndviData && ndviData.length > 0) {
        ndvi = ndviData[0].ndvi_value;
        if (ndviData.length > 1) ndvi_previous = ndviData[1].ndvi_value;
      }

      landContexts.push({
        land_id: land.id,
        farmer_id: land.farmer_id,
        tenant_id: land.tenant_id || tenantId,
        crop_code: normalizeCropCode(land.crop_type),
        sowing_date: land.sowing_date,
        current_stage: currentStage,
        das,
        weather,
        ndvi,
        ndvi_previous,
        land_name: land.land_name,
      });
    }

    // 4. Evaluate rules against each land
    let totalAlerts = 0;
    let totalRulesFired = 0;

    for (const ctx of landContexts) {
      const applicableRules = rules.filter((r: ProactiveRule) => {
        if (r.crop_code && r.crop_code !== ctx.crop_code) return false;
        if (r.stage_applicable && r.stage_applicable.length > 0 && ctx.current_stage) {
          if (!r.stage_applicable.includes(ctx.current_stage) && !r.stage_applicable.includes('ALL')) return false;
        }
        return true;
      });

      for (const rule of applicableRules as ProactiveRule[]) {
        const result = evaluateRule(rule, ctx);
        if (!result.fired) continue;

        totalRulesFired++;

        // Check dedup
        const today = new Date().toISOString().split('T')[0];
        const dedupKey = `${rule.rule_code}:${ctx.land_id}:${today}`;

        const { data: existing } = await supabase
          .from('proactive_alerts')
          .select('id')
          .eq('dedup_key', dedupKey)
          .maybeSingle();

        if (existing) continue;

        // Check cooldown
        const cooldownDate = new Date(Date.now() - (rule.cooldown_hours || 72) * 60 * 60 * 1000).toISOString();
        const { data: recentAlert } = await supabase
          .from('proactive_alerts')
          .select('id')
          .eq('rule_id', rule.rule_code)
          .eq('land_id', ctx.land_id)
          .gte('created_at', cooldownDate)
          .maybeSingle();

        if (recentAlert) continue;

        // Check daily throttle (max 5 per farmer per day)
        const todayStart = `${today}T00:00:00Z`;
        const { count: dailyCount } = await supabase
          .from('proactive_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('farmer_id', ctx.farmer_id)
          .gte('created_at', todayStart);

        if ((dailyCount || 0) >= 5 && rule.priority !== 'CRITICAL') continue;

        // Create event
        const { data: event } = await supabase
          .from('proactive_events')
          .insert({
            tenant_id: ctx.tenant_id,
            land_id: ctx.land_id,
            farmer_id: ctx.farmer_id,
            event_type: mapConditionToEventType(rule.condition_type),
            event_data: { rule_code: rule.rule_code, trigger: result.triggerData },
            alerts_generated: 1,
            processed: true,
          })
          .select('id')
          .single();

        // Generate alert with template substitution
        const templateVars: Record<string, string> = {
          '{{crop}}': ctx.crop_code || 'पीक',
          '{{temp}}': ctx.weather.temp?.toString() || '--',
          '{{humidity}}': ctx.weather.humidity?.toString() || '--',
          '{{rain}}': ctx.weather.rain_mm?.toString() || '0',
          '{{wind}}': ctx.weather.wind_speed?.toString() || '--',
          '{{ndvi}}': ctx.ndvi?.toFixed(2) || '--',
          '{{das}}': ctx.das.toString(),
          '{{stage}}': ctx.current_stage || 'unknown',
          '{{land}}': ctx.land_name || 'तुमची शेत',
        };

        const fillTemplate = (tpl: string | null): string => {
          if (!tpl) return '';
          let result = tpl;
          for (const [key, val] of Object.entries(templateVars)) {
            result = result.replaceAll(key, val);
          }
          return result;
        };

        await supabase.from('proactive_alerts').insert({
          tenant_id: ctx.tenant_id,
          land_id: ctx.land_id,
          farmer_id: ctx.farmer_id,
          event_id: event?.id || null,
          rule_id: rule.rule_code,
          alert_category: rule.alert_category,
          priority: rule.priority,
          title_mr: fillTemplate(rule.title_mr),
          title_hi: fillTemplate(rule.title_hi),
          title_en: fillTemplate(rule.title_en),
          message_mr: fillTemplate(rule.message_template_mr),
          message_hi: fillTemplate(rule.message_template_hi),
          message_en: fillTemplate(rule.message_template_en),
          action_text_mr: fillTemplate(rule.action_template_mr),
          action_text_hi: fillTemplate(rule.action_template_hi),
          action_text_en: fillTemplate(rule.action_template_en),
          risk_score: result.riskScore,
          confidence: result.confidence,
          trigger_data: result.triggerData,
          decision_reasoning: result.reasoning,
          status: 'PENDING',
          dedup_key: dedupKey,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

        totalAlerts++;
      }
    }

    // 5. Log evaluation
    const executionTime = Date.now() - startTime;
    await supabase.from('proactive_evaluation_log').insert({
      tenant_id: tenantId,
      evaluation_type: action,
      lands_evaluated: landContexts.length,
      rules_evaluated: rules.length,
      rules_fired: totalRulesFired,
      alerts_generated: totalAlerts,
      execution_time_ms: executionTime,
    });

    console.log(`[ProactiveEvaluator] Done: ${landContexts.length} lands, ${totalRulesFired} rules fired, ${totalAlerts} alerts in ${executionTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      lands_evaluated: landContexts.length,
      rules_evaluated: rules.length,
      rules_fired: totalRulesFired,
      alerts_generated: totalAlerts,
      execution_time_ms: executionTime,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[ProactiveEvaluator] Error:', error);
    const executionTime = Date.now() - startTime;
    
    await supabase.from('proactive_evaluation_log').insert({
      tenant_id: 'default',
      evaluation_type: 'error',
      execution_time_ms: executionTime,
      error_message: error.message,
    }).catch(() => {});

    return new Response(JSON.stringify({ 
      success: false, error: error.message 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

// === HELPER FUNCTIONS ===

function normalizeCropCode(crop: string | null): string | null {
  if (!crop) return null;
  const upper = crop.toUpperCase().trim();
  if (upper.includes('SUGARCANE') || upper.includes('ऊस') || upper === 'SC') return 'SUGARCANE';
  if (upper.includes('WHEAT') || upper.includes('गहू') || upper === 'WH') return 'WHEAT';
  if (upper.includes('COTTON') || upper.includes('कापूस') || upper === 'CT') return 'COTTON';
  if (upper.includes('RICE') || upper.includes('भात') || upper === 'RC') return 'RICE';
  return upper;
}

function computeStage(crop: string | null, das: number): string {
  const cropCode = normalizeCropCode(crop);
  if (cropCode === 'SUGARCANE') {
    if (das <= 30) return 'GERMINATION';
    if (das <= 60) return 'SEEDLING';
    if (das <= 120) return 'TILLERING';
    if (das <= 270) return 'GRAND_GROWTH';
    if (das <= 330) return 'MATURITY';
    return 'HARVEST';
  }
  if (cropCode === 'WHEAT') {
    if (das <= 15) return 'GERMINATION';
    if (das <= 30) return 'SEEDLING';
    if (das <= 60) return 'TILLERING';
    if (das <= 90) return 'HEADING';
    if (das <= 120) return 'GRAIN_FILLING';
    return 'MATURITY';
  }
  if (cropCode === 'COTTON') {
    if (das <= 20) return 'GERMINATION';
    if (das <= 45) return 'SEEDLING';
    if (das <= 90) return 'SQUARING';
    if (das <= 130) return 'FLOWERING';
    if (das <= 170) return 'BOLL_DEVELOPMENT';
    return 'MATURITY';
  }
  return 'VEGETATIVE';
}

function evaluateRule(rule: ProactiveRule, ctx: LandContext): { fired: boolean; riskScore: number; confidence: number; reasoning: string; triggerData: Record<string, any> } {
  const conditions = rule.conditions;
  const triggerData: Record<string, any> = {};
  let score = 0;
  let maxScore = 0;
  const reasons: string[] = [];

  switch (rule.condition_type) {
    case 'WEATHER': {
      if (conditions.temp_min != null) {
        maxScore++;
        if (ctx.weather.temp != null && ctx.weather.temp < conditions.temp_min) {
          score++;
          triggerData.temp = ctx.weather.temp;
          reasons.push(`Temp ${ctx.weather.temp}°C < ${conditions.temp_min}°C threshold`);
        }
      }
      if (conditions.temp_max != null) {
        maxScore++;
        if (ctx.weather.temp != null && ctx.weather.temp > conditions.temp_max) {
          score++;
          triggerData.temp = ctx.weather.temp;
          reasons.push(`Temp ${ctx.weather.temp}°C > ${conditions.temp_max}°C threshold`);
        }
      }
      if (conditions.humidity_min != null) {
        maxScore++;
        if (ctx.weather.humidity != null && ctx.weather.humidity > conditions.humidity_min) {
          score++;
          triggerData.humidity = ctx.weather.humidity;
          reasons.push(`Humidity ${ctx.weather.humidity}% > ${conditions.humidity_min}%`);
        }
      }
      if (conditions.rain_min != null) {
        maxScore++;
        if (ctx.weather.rain_mm != null && ctx.weather.rain_mm > conditions.rain_min) {
          score++;
          triggerData.rain_mm = ctx.weather.rain_mm;
          reasons.push(`Rain ${ctx.weather.rain_mm}mm > ${conditions.rain_min}mm`);
        }
      }
      if (conditions.wind_max != null) {
        maxScore++;
        if (ctx.weather.wind_speed != null && ctx.weather.wind_speed > conditions.wind_max) {
          score++;
          triggerData.wind = ctx.weather.wind_speed;
          reasons.push(`Wind ${ctx.weather.wind_speed}km/h > ${conditions.wind_max}km/h`);
        }
      }
      // For weather, if ANY condition matches, fire
      const fired = score > 0;
      return { fired, riskScore: Math.min(100, score * 30 + 40), confidence: 0.85, reasoning: reasons.join('; '), triggerData };
    }

    case 'NDVI': {
      if (conditions.ndvi_below != null && ctx.ndvi != null) {
        if (ctx.ndvi < conditions.ndvi_below) {
          triggerData.ndvi = ctx.ndvi;
          triggerData.threshold = conditions.ndvi_below;
          return { fired: true, riskScore: 75, confidence: 0.8, reasoning: `NDVI ${ctx.ndvi.toFixed(2)} below ${conditions.ndvi_below}`, triggerData };
        }
      }
      if (conditions.ndvi_drop != null && ctx.ndvi != null && ctx.ndvi_previous != null) {
        const drop = ctx.ndvi_previous - ctx.ndvi;
        if (drop > conditions.ndvi_drop) {
          triggerData.ndvi = ctx.ndvi;
          triggerData.ndvi_previous = ctx.ndvi_previous;
          triggerData.drop = drop;
          return { fired: true, riskScore: 70, confidence: 0.75, reasoning: `NDVI dropped ${drop.toFixed(2)} (threshold: ${conditions.ndvi_drop})`, triggerData };
        }
      }
      return { fired: false, riskScore: 0, confidence: 0, reasoning: '', triggerData };
    }

    case 'STAGE': {
      if (conditions.das_min != null && conditions.das_max != null) {
        if (ctx.das >= conditions.das_min && ctx.das <= conditions.das_max) {
          triggerData.das = ctx.das;
          triggerData.stage = ctx.current_stage;
          return { fired: true, riskScore: 50, confidence: 0.9, reasoning: `DAS ${ctx.das} within stage window [${conditions.das_min}-${conditions.das_max}]`, triggerData };
        }
      }
      return { fired: false, riskScore: 0, confidence: 0, reasoning: '', triggerData };
    }

    case 'COMPOUND':
    case 'DISEASE_RISK': {
      let conditionsMet = 0;
      let totalConditions = 0;

      if (conditions.temp_min != null && conditions.temp_max != null) {
        totalConditions++;
        if (ctx.weather.temp != null && ctx.weather.temp >= conditions.temp_min && ctx.weather.temp <= conditions.temp_max) {
          conditionsMet++;
          triggerData.temp = ctx.weather.temp;
        }
      }
      if (conditions.humidity_min != null) {
        totalConditions++;
        if (ctx.weather.humidity != null && ctx.weather.humidity >= conditions.humidity_min) {
          conditionsMet++;
          triggerData.humidity = ctx.weather.humidity;
        }
      }
      if (conditions.rain_min != null) {
        totalConditions++;
        if (ctx.weather.rain_mm != null && ctx.weather.rain_mm >= conditions.rain_min) {
          conditionsMet++;
          triggerData.rain_mm = ctx.weather.rain_mm;
        }
      }

      const ratio = totalConditions > 0 ? conditionsMet / totalConditions : 0;
      const fired = ratio >= 0.6; // At least 60% conditions met
      const riskScore = Math.round(ratio * 100);
      return { 
        fired, riskScore, confidence: ratio * 0.9, 
        reasoning: `${conditionsMet}/${totalConditions} conditions met (${Math.round(ratio * 100)}%)`, 
        triggerData 
      };
    }

    case 'PEST_RISK': {
      // GDD-based: simple accumulation check
      if (conditions.das_min != null && ctx.das >= conditions.das_min) {
        if (conditions.temp_min != null && ctx.weather.temp != null && ctx.weather.temp >= conditions.temp_min) {
          triggerData.das = ctx.das;
          triggerData.temp = ctx.weather.temp;
          return { fired: true, riskScore: 65, confidence: 0.7, reasoning: `DAS ${ctx.das} + Temp ${ctx.weather.temp}°C favorable for pest`, triggerData };
        }
      }
      return { fired: false, riskScore: 0, confidence: 0, reasoning: '', triggerData };
    }

    case 'SOIL': {
      // Placeholder for soil-based rules
      return { fired: false, riskScore: 0, confidence: 0, reasoning: 'Soil evaluation not yet implemented', triggerData };
    }

    default:
      return { fired: false, riskScore: 0, confidence: 0, reasoning: `Unknown condition_type: ${rule.condition_type}`, triggerData };
  }
}

function mapConditionToEventType(conditionType: string): string {
  const map: Record<string, string> = {
    'WEATHER': 'WEATHER_CHANGE',
    'NDVI': 'NDVI_DROP',
    'STAGE': 'STAGE_TRANSITION',
    'COMPOUND': 'DISEASE_RISK_WINDOW',
    'DISEASE_RISK': 'DISEASE_RISK_WINDOW',
    'PEST_RISK': 'PEST_EMERGENCE',
    'SOIL': 'SOIL_CHANGE',
  };
  return map[conditionType] || 'SCHEDULED_CHECK';
}
