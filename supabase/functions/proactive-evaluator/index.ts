import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// =====================================================
// TYPES
// =====================================================

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

interface DecisionRuleProactive {
  id: string;
  crop_code: string | null;
  category: string;
  priority: number;
  condition_code: string;
  stage_applicable: string[] | null;
  conditions_json: Record<string, any> | null;
  etl_value_min: number | null;
  etl_value_max: number | null;
  phi_days: number | null;
  action_text: string | null;
  reason_text: string | null;
  knowledge_text: string | null;
  i18n_key: string | null;
  prediction_type: string | null;
  forecast_horizon_days: number | null;
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
  // Extended signals (G1)
  soil_n: number | null;
  soil_p: number | null;
  soil_k: number | null;
  soil_ph: number | null;
  organic_carbon: number | null;
  forecast_rain_probability_72h: number | null;
  gdd_accumulated: number | null;
  // Land-specific fields for actionable alerts
  area_acres: number | null;
  soil_type: string | null;
  irrigation_type: string | null;
  water_source: string | null;
}

interface RuleEvalResult {
  fired: boolean;
  riskScore: number;
  confidence: number;
  reasoning: string;
  triggerData: Record<string, any>;
}

interface AlertCandidate {
  rule: ProactiveRule | null;
  decisionRule: DecisionRuleProactive | null;
  result: RuleEvalResult;
  ctx: LandContext;
  source: 'proactive_rule' | 'decision_rule';
}

// =====================================================
// MAIN HANDLER
// =====================================================

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

    // =========================================================
    // STEP 1: Load proactive rules + decision_rules (is_proactive_rule=true)
    // =========================================================
    const [rulesRes, decisionRulesRes] = await Promise.all([
      supabase.from('proactive_rules').select('*').eq('is_active', true),
      supabase.from('decision_rules').select('id, crop_code, category, priority, condition_code, stage_applicable, conditions_json, etl_value_min, etl_value_max, phi_days, action_text, reason_text, knowledge_text, i18n_key, prediction_type, forecast_horizon_days').eq('is_proactive_rule', true).eq('is_active', true),
    ]);

    if (rulesRes.error) throw new Error(`Rules load failed: ${rulesRes.error.message}`);
    const rules: ProactiveRule[] = rulesRes.data || [];
    const decisionRules: DecisionRuleProactive[] = decisionRulesRes.data || [];

    if (rules.length === 0 && decisionRules.length === 0) {
      return jsonResponse({ success: true, message: 'No active proactive rules', alerts_generated: 0 });
    }

    console.log(`[ProactiveEvaluator] Loaded ${rules.length} proactive rules, ${decisionRules.length} decision rules`);

    // =========================================================
    // STEP 2: Load active lands
    // =========================================================
    let landsQuery = supabase
      .from('lands')
      .select('id, farmer_id, tenant_id, current_crop, name, last_sowing_date, center_lat, center_lon, area_acres, soil_type, irrigation_type, water_source')
      .eq('is_active', true);

    if (targetLandId) landsQuery = landsQuery.eq('id', targetLandId);
    if (tenantId && tenantId !== 'default') landsQuery = landsQuery.eq('tenant_id', tenantId);

    const { data: lands, error: landsError } = await landsQuery.limit(500);
    if (landsError) throw new Error(`Lands load failed: ${landsError.message}`);
    if (!lands || lands.length === 0) {
      return jsonResponse({ success: true, message: 'No active lands', alerts_generated: 0 });
    }

    const landIds = lands.map(l => l.id);

    // =========================================================
    // STEP 3: BATCH-LOAD all data in parallel (G4 fix)
    // =========================================================
    const [
      cropSchedulesRes,
      recentAlertsRes,
      soilRes,
      ndviRes,
      stageMapRes,
    ] = await Promise.all([
      // Crop schedules for sowing dates
      supabase.from('crop_schedules')
        .select('land_id, sowing_date, crop_name, status, is_active')
        .in('land_id', landIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      // Recent alerts for dedup/cooldown (72h)
      supabase.from('proactive_alerts')
        .select('id, rule_id, land_id, farmer_id, dedup_key, created_at, status')
        .in('land_id', landIds)
        .gte('created_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()),
      // Soil health per land
      supabase.from('soil_health')
        .select('land_id, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, ph_level, organic_carbon')
        .in('land_id', landIds)
        .order('created_at', { ascending: false }),
      // NDVI (latest 2 per land)
      supabase.from('ndvi_data')
        .select('land_id, ndvi_value, date')
        .in('land_id', landIds)
        .order('date', { ascending: false })
        .limit(1000),
      // Stage mappings from intent_observation_mapping
      supabase.from('intent_observation_mapping')
        .select('crop_code, growth_stage, das_min, das_max')
        .not('das_min', 'is', null)
        .neq('growth_stage', 'ALL'),
    ]);

    // Build batch-loaded maps
    const scheduleMap = buildScheduleMap(cropSchedulesRes.data);
    const alertMap = buildAlertMap(recentAlertsRes.data);
    const soilMap = buildSoilMap(soilRes.data);
    const ndviMap = buildNdviMap(ndviRes.data);
    const stageMap = buildStageMap(stageMapRes.data);

    // Batch-load weather: collect unique location keys + build land→locationKey mapping
    const locationKeys = new Set<string>();
    const landToLocKey = new Map<string, string>();
    for (const land of lands) {
      if (land.center_lat != null && land.center_lon != null) {
        const locKey = makeLocationKey(land.center_lat, land.center_lon);
        locationKeys.add(locKey);
        landToLocKey.set(land.id, locKey);
      }
    }
    const locKeyArray = Array.from(locationKeys);
    const weatherMap = await batchLoadWeather(supabase, locKeyArray);
    
    // Batch-load forecast rain probability (72h) and GDD (30d) — by location_key
    const [forecastLocMap, gddLocMap] = await Promise.all([
      batchLoadForecast(supabase, locKeyArray),
      batchLoadGDD(supabase, locKeyArray),
    ]);
    // Map location_key results back to land_ids
    const forecastMap = new Map<string, number>();
    const gddMap = new Map<string, number>();
    for (const [landId, locKey] of landToLocKey) {
      const fVal = forecastLocMap.get(locKey);
      if (fVal != null) forecastMap.set(landId, fVal);
      const gVal = gddLocMap.get(locKey);
      if (gVal != null) gddMap.set(landId, gVal);
    }

    // Batch daily alert counts per farmer
    const todayStr = new Date().toISOString().split('T')[0];
    const farmerDailyCounts = new Map<string, number>();
    if (recentAlertsRes.data) {
      for (const a of recentAlertsRes.data) {
        if (a.created_at?.startsWith(todayStr)) {
          farmerDailyCounts.set(a.farmer_id, (farmerDailyCounts.get(a.farmer_id) || 0) + 1);
        }
      }
    }

    // =========================================================
    // STEP 4: Build LandContexts
    // =========================================================
    const landContexts: LandContext[] = [];

    for (const land of lands) {
      const schedule = scheduleMap.get(land.id);
      const sowingDate = schedule?.sowing_date || land.last_sowing_date;
      const cropSource = schedule?.crop_name || land.current_crop;
      const cropCode = normalizeCropCode(cropSource);

      const das = sowingDate
        ? Math.floor((Date.now() - new Date(sowingDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Dynamic stage computation (G3) — DB-driven first, then fallback
      const currentStage = computeStageDynamic(cropCode, das, stageMap);

      // Weather from batch map
      const locKey = (land.center_lat != null && land.center_lon != null)
        ? makeLocationKey(land.center_lat, land.center_lon) : null;
      const weather = locKey ? (weatherMap.get(locKey) || nullWeather()) : nullWeather();

      // NDVI from batch map
      const ndviArr = ndviMap.get(land.id) || [];
      const ndvi = ndviArr[0]?.ndvi_value ?? null;
      const ndvi_previous = ndviArr[1]?.ndvi_value ?? null;

      // Soil from batch map
      const soil = soilMap.get(land.id);

      // Forecast rain probability 72h
      const forecastRain = forecastMap.get(land.id) ?? null;

      // GDD from batch-loaded forecast data
      const gdd = gddMap.get(land.id) ?? null;

      landContexts.push({
        land_id: land.id,
        farmer_id: land.farmer_id,
        tenant_id: land.tenant_id || tenantId,
        crop_code: cropCode,
        sowing_date: sowingDate,
        current_stage: currentStage,
        das,
        weather,
        ndvi,
        ndvi_previous,
        land_name: land.name,
        soil_n: soil?.nitrogen_kg_per_ha ?? null,
        soil_p: soil?.phosphorus_kg_per_ha ?? null,
        soil_k: soil?.potassium_kg_per_ha ?? null,
        soil_ph: soil?.ph_level ?? null,
        organic_carbon: soil?.organic_carbon ?? null,
        forecast_rain_probability_72h: forecastRain,
        gdd_accumulated: gdd,
        area_acres: land.area_acres ?? null,
        soil_type: land.soil_type ?? null,
        irrigation_type: land.irrigation_type ?? null,
        water_source: land.water_source ?? null,
      });
    }

    // =========================================================
    // STEP 5: Evaluate rules against each land (in-memory dedup)
    // =========================================================
    let totalAlerts = 0;
    let totalRulesFired = 0;
    const alertsToInsert: any[] = [];
    const eventsToInsert: any[] = [];

    for (const ctx of landContexts) {
      // Evaluate proactive_rules
      const applicableRules = rules.filter((r: ProactiveRule) => {
        if (r.crop_code && r.crop_code !== ctx.crop_code) return false;
        if (r.stage_applicable?.length > 0 && ctx.current_stage) {
          if (!r.stage_applicable.includes(ctx.current_stage) && !r.stage_applicable.includes('ALL')) return false;
        }
        return true;
      });

      for (const rule of applicableRules) {
        const result = evaluateRule(rule, ctx);
        if (!result.fired) continue;
        totalRulesFired++;

        // In-memory dedup check
        const dedupKey = `${rule.rule_code}:${ctx.land_id}:${todayStr}`;
        if (isDuplicate(dedupKey, rule.rule_code, ctx.land_id, rule.cooldown_hours || 72, alertMap)) continue;

        // Daily throttle check (in-memory)
        const dailyCount = farmerDailyCounts.get(ctx.farmer_id) || 0;
        if (dailyCount >= 5 && rule.priority !== 'CRITICAL') continue;

        // Stage alert
        eventsToInsert.push({
          tenant_id: ctx.tenant_id,
          land_id: ctx.land_id,
          farmer_id: ctx.farmer_id,
          event_type: mapConditionToEventType(rule.condition_type),
          event_data: { rule_code: rule.rule_code, trigger: result.triggerData },
          alerts_generated: 1,
          processed: true,
        });

        const templateVars = buildTemplateVars(ctx);
        alertsToInsert.push({
          tenant_id: ctx.tenant_id,
          land_id: ctx.land_id,
          farmer_id: ctx.farmer_id,
          rule_id: rule.rule_code,
          alert_category: rule.alert_category,
          priority: rule.priority,
          title_mr: fillTemplate(rule.title_mr, templateVars),
          title_hi: fillTemplate(rule.title_hi, templateVars),
          title_en: fillTemplate(rule.title_en, templateVars),
          message_mr: fillTemplate(rule.message_template_mr, templateVars),
          message_hi: fillTemplate(rule.message_template_hi, templateVars),
          message_en: fillTemplate(rule.message_template_en, templateVars),
          action_text_mr: fillTemplate(rule.action_template_mr, templateVars),
          action_text_hi: fillTemplate(rule.action_template_hi, templateVars),
          action_text_en: fillTemplate(rule.action_template_en, templateVars),
          risk_score: result.riskScore,
          confidence: result.confidence,
          trigger_data: enrichTriggerDataWithIrrigation(result.triggerData, rule.alert_category, ctx),
          decision_reasoning: result.reasoning,
          status: 'PENDING',
          dedup_key: dedupKey,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

        farmerDailyCounts.set(ctx.farmer_id, dailyCount + 1);
        totalAlerts++;
      }

      // Evaluate decision_rules (G2 bridge)
      const applicableDecisionRules = decisionRules.filter(dr => {
        if (dr.crop_code && dr.crop_code !== ctx.crop_code) return false;
        if (dr.stage_applicable?.length && ctx.current_stage) {
          if (!dr.stage_applicable.includes(ctx.current_stage) && !dr.stage_applicable.includes('ALL')) return false;
        }
        return true;
      });

      // Sort by priority (lower = higher priority)
      applicableDecisionRules.sort((a, b) => (a.priority || 99) - (b.priority || 99));

      for (const dr of applicableDecisionRules) {
        const result = evaluateDecisionRule(dr, ctx);
        if (!result.fired) continue;
        totalRulesFired++;

        const dedupKey = `DR:${dr.condition_code}:${ctx.land_id}:${todayStr}`;
        if (isDuplicate(dedupKey, dr.condition_code, ctx.land_id, 72, alertMap)) continue;

        const dailyCount = farmerDailyCounts.get(ctx.farmer_id) || 0;
        if (dailyCount >= 5 && dr.priority > 1) continue;

        const alertCategory = mapDecisionCategory(dr.category);
        const priority = mapDecisionPriority(dr.priority);

        eventsToInsert.push({
          tenant_id: ctx.tenant_id,
          land_id: ctx.land_id,
          farmer_id: ctx.farmer_id,
          event_type: mapDecisionEventType(dr.category),
          event_data: { rule_id: dr.id, condition_code: dr.condition_code, trigger: result.triggerData },
          alerts_generated: 1,
          processed: true,
        });

        // For decision rules, generate trilingual templates
        const templateVars = buildTemplateVars(ctx);
        const titleEn = `${dr.condition_code.replace(/_/g, ' ')} Alert`;
        const messageEn = dr.reason_text || result.reasoning;
        const actionEn = dr.action_text || null;
        // Generate basic Marathi/Hindi from category templates
        const trilingualTitle = generateTrilingualTitle(dr.category, alertCategory, ctx);
        const trilingualMsg = generateTrilingualMessage(dr.category, messageEn, ctx);
        const trilingualAction = generateTrilingualAction(dr.category, actionEn, ctx);
        
        alertsToInsert.push({
          tenant_id: ctx.tenant_id,
          land_id: ctx.land_id,
          farmer_id: ctx.farmer_id,
          rule_id: dr.condition_code,
          alert_category: alertCategory,
          priority: priority,
          title_en: titleEn,
          title_mr: trilingualTitle.mr,
          title_hi: trilingualTitle.hi,
          message_en: messageEn,
          message_mr: trilingualMsg.mr,
          message_hi: trilingualMsg.hi,
          action_text_en: actionEn,
          action_text_mr: trilingualAction.mr,
          action_text_hi: trilingualAction.hi,
          risk_score: result.riskScore,
          confidence: result.confidence,
          trigger_data: enrichTriggerDataWithIrrigation({ ...result.triggerData, knowledge: dr.knowledge_text, decision_rule_id: dr.id }, alertCategory, ctx),
          decision_reasoning: result.reasoning,
          status: 'PENDING',
          dedup_key: dedupKey,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

        farmerDailyCounts.set(ctx.farmer_id, dailyCount + 1);
        totalAlerts++;
      }
    }

    // =========================================================
    // STEP 6: Batch-insert events and alerts
    // =========================================================
    if (eventsToInsert.length > 0) {
      const { error: evErr } = await supabase.from('proactive_events').insert(eventsToInsert);
      if (evErr) console.error('[ProactiveEvaluator] Events insert error:', evErr.message);
    }

    // Insert alerts FIRST (non-blocking enrichment — P0-3 fix)
    if (alertsToInsert.length > 0) {
      const { data: insertedAlerts, error: alErr } = await supabase
        .from('proactive_alerts')
        .insert(alertsToInsert)
        .select('id, risk_score, priority, alert_category, trigger_data, message_en, action_text_en, title_mr, message_mr');
      if (alErr) console.error('[ProactiveEvaluator] Alerts insert error:', alErr.message);
      
      // Async neural enrichment for high-risk alerts (non-blocking — fire and forget)
      if (LOVABLE_API_KEY && insertedAlerts && insertedAlerts.length > 0) {
        enrichAndUpdateAlerts(supabase, insertedAlerts).catch(e => 
          console.warn('[NeuralEnrichment] Background enrichment failed:', e.message)
        );
      }
    }

    // =========================================================
    // STEP 7: Log evaluation
    // =========================================================
    const executionTime = Date.now() - startTime;
    await supabase.from('proactive_evaluation_log').insert({
      tenant_id: tenantId,
      evaluation_type: action,
      lands_evaluated: landContexts.length,
      rules_evaluated: rules.length + decisionRules.length,
      rules_fired: totalRulesFired,
      alerts_generated: totalAlerts,
      execution_time_ms: executionTime,
    });

    console.log(`[ProactiveEvaluator] Done: ${landContexts.length} lands, ${totalRulesFired} rules fired, ${totalAlerts} alerts in ${executionTime}ms`);

    return jsonResponse({
      success: true,
      lands_evaluated: landContexts.length,
      rules_evaluated: rules.length + decisionRules.length,
      rules_fired: totalRulesFired,
      alerts_generated: totalAlerts,
      execution_time_ms: executionTime,
    });

  } catch (error) {
    console.error('[ProactiveEvaluator] Error:', error);
    const executionTime = Date.now() - startTime;

    await supabase.from('proactive_evaluation_log').insert({
      tenant_id: 'default',
      evaluation_type: 'error',
      execution_time_ms: executionTime,
      error_message: error.message,
    }).catch(() => {});

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// =====================================================
// BATCH LOADING HELPERS
// =====================================================

function buildScheduleMap(data: any[] | null): Map<string, { sowing_date: string; crop_name: string }> {
  const map = new Map();
  if (!data) return map;
  for (const cs of data) {
    if (!map.has(cs.land_id) && cs.sowing_date) {
      map.set(cs.land_id, { sowing_date: cs.sowing_date, crop_name: cs.crop_name });
    }
  }
  return map;
}

function buildAlertMap(data: any[] | null): Map<string, any[]> {
  const map = new Map<string, any[]>();
  if (!data) return map;
  for (const a of data) {
    const key = a.land_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return map;
}

function buildSoilMap(data: any[] | null): Map<string, any> {
  const map = new Map();
  if (!data) return map;
  for (const s of data) {
    if (!map.has(s.land_id)) map.set(s.land_id, s);
  }
  return map;
}

function buildNdviMap(data: any[] | null): Map<string, any[]> {
  const map = new Map<string, any[]>();
  if (!data) return map;
  for (const n of data) {
    if (!map.has(n.land_id)) map.set(n.land_id, []);
    const arr = map.get(n.land_id)!;
    if (arr.length < 2) arr.push(n); // only keep latest 2
  }
  return map;
}

function buildStageMap(data: any[] | null): Map<string, { stage: string; das_min: number; das_max: number }[]> {
  const map = new Map<string, any[]>();
  if (!data) return map;
  for (const row of data) {
    const key = row.crop_code;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ stage: row.growth_stage, das_min: row.das_min, das_max: row.das_max });
  }
  // Sort each crop's stages by das_min
  for (const [, stages] of map) {
    stages.sort((a: any, b: any) => a.das_min - b.das_min);
  }
  return map;
}

function makeLocationKey(lat: number, lon: number): string {
  return `${(Math.round(lat * 100) / 100)},${(Math.round(lon * 100) / 100)}`;
}

async function batchLoadWeather(supabase: any, locationKeys: string[]): Promise<Map<string, any>> {
  const map = new Map();
  if (locationKeys.length === 0) return map;
  
  const { data } = await supabase
    .from('weather_current')
    .select('location_key, temperature_celsius, humidity_percent, rain_1h_mm, wind_speed_kmh, weather_description, observation_time')
    .in('location_key', locationKeys)
    .order('observation_time', { ascending: false });

  if (data) {
    for (const w of data) {
      if (!map.has(w.location_key)) {
        map.set(w.location_key, {
          temp: w.temperature_celsius,
          humidity: w.humidity_percent,
          rain_mm: w.rain_1h_mm,
          wind_speed: w.wind_speed_kmh,
          description: w.weather_description,
        });
      }
    }
  }
  return map;
}

async function batchLoadForecast(supabase: any, locationKeys: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (locationKeys.length === 0) return map;

  const futureTime = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('weather_forecasts')
    .select('location_key, rain_probability_percent')
    .in('location_key', locationKeys)
    .gte('forecast_time', new Date().toISOString())
    .lte('forecast_time', futureTime)
    .not('rain_probability_percent', 'is', null);

  if (data) {
    for (const f of data) {
      if (!f.location_key) continue;
      const existing = map.get(f.location_key) ?? 0;
      if (f.rain_probability_percent > existing) {
        map.set(f.location_key, f.rain_probability_percent);
      }
    }
  }
  return map;
}

async function batchLoadGDD(supabase: any, locationKeys: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (locationKeys.length === 0) return map;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  // GDD from weather_forecasts if available
  const { data } = await supabase
    .from('weather_forecasts')
    .select('location_key, growing_degree_days, temperature_max_celsius, temperature_min_celsius')
    .in('location_key', locationKeys)
    .gte('forecast_time', thirtyDaysAgo);

  if (data) {
    for (const f of data) {
      if (!f.location_key) continue;
      // Use stored GDD if available, otherwise compute from temp
      let gdd = f.growing_degree_days;
      if (gdd == null && f.temperature_max_celsius != null && f.temperature_min_celsius != null) {
        gdd = Math.max(0, (f.temperature_max_celsius + f.temperature_min_celsius) / 2 - 10);
      }
      if (gdd != null && gdd > 0) {
        map.set(f.location_key, (map.get(f.location_key) || 0) + gdd);
      }
    }
  }
  return map;
}

function nullWeather() {
  return { temp: null, humidity: null, rain_mm: null, wind_speed: null, description: null };
}

// =====================================================
// IN-MEMORY DEDUP + COOLDOWN (G4)
// =====================================================

function isDuplicate(dedupKey: string, ruleCode: string, landId: string, cooldownHours: number, alertMap: Map<string, any[]>): boolean {
  // Check dedup key (same rule+land+day)
  const landAlerts = alertMap.get(landId) || [];
  for (const a of landAlerts) {
    if (a.dedup_key === dedupKey) return true;
  }
  // Check cooldown
  const cooldownDate = Date.now() - cooldownHours * 60 * 60 * 1000;
  for (const a of landAlerts) {
    if (a.rule_id === ruleCode && new Date(a.created_at).getTime() > cooldownDate) return true;
  }
  return false;
}

// =====================================================
// DYNAMIC STAGE COMPUTATION (G3)
// =====================================================

function computeStageDynamic(cropCode: string | null, das: number, stageMap: Map<string, any[]>): string {
  if (!cropCode || das <= 0) return 'VEGETATIVE';

  // Try DB-driven stage lookup first
  const stages = stageMap.get(cropCode);
  if (stages && stages.length > 0) {
    // Find the most specific stage for this DAS
    for (const s of stages) {
      if (das >= s.das_min && das <= s.das_max) {
        return s.stage;
      }
    }
  }

  // Fallback to hardcoded stages
  return computeStageHardcoded(cropCode, das);
}

function computeStageHardcoded(cropCode: string, das: number): string {
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
  if (cropCode === 'RICE') {
    if (das <= 15) return 'GERMINATION';
    if (das <= 30) return 'SEEDLING';
    if (das <= 55) return 'TILLERING';
    if (das <= 80) return 'PANICLE_INITIATION';
    if (das <= 100) return 'FLOWERING';
    if (das <= 130) return 'GRAIN_FILLING';
    return 'MATURITY';
  }
  return 'VEGETATIVE';
}

// =====================================================
// CROP CODE NORMALIZATION
// =====================================================

function normalizeCropCode(crop: string | null): string | null {
  if (!crop) return null;
  const upper = crop.toUpperCase().trim();
  if (upper.includes('SUGARCANE') || upper.includes('ऊस') || upper === 'SC') return 'SUGARCANE';
  if (upper.includes('WHEAT') || upper.includes('गहू') || upper === 'WH') return 'WHEAT';
  if (upper.includes('COTTON') || upper.includes('कापूस') || upper === 'CT') return 'COTTON';
  if (upper.includes('RICE') || upper.includes('भात') || upper === 'RC') return 'RICE';
  if (upper.includes('SOYBEAN') || upper.includes('सोयाबीन') || upper === 'SB') return 'SOYBEAN';
  if (upper.includes('ONION') || upper.includes('कांदा') || upper === 'ON') return 'ONION';
  if (upper.includes('TURMERIC') || upper.includes('हळद') || upper === 'TU') return 'TURMERIC';
  if (upper.includes('GRAPE') || upper.includes('द्राक्ष') || upper === 'GR') return 'GRAPE';
  return upper;
}

// =====================================================
// PROACTIVE RULE EVALUATION (enhanced with G1 signals)
// =====================================================

function evaluateRule(rule: ProactiveRule, ctx: LandContext): RuleEvalResult {
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
          score++; triggerData.temp = ctx.weather.temp;
          reasons.push(`Temp ${ctx.weather.temp}°C < ${conditions.temp_min}°C`);
        }
      }
      if (conditions.temp_max != null) {
        maxScore++;
        if (ctx.weather.temp != null && ctx.weather.temp > conditions.temp_max) {
          score++; triggerData.temp = ctx.weather.temp;
          reasons.push(`Temp ${ctx.weather.temp}°C > ${conditions.temp_max}°C`);
        }
      }
      if (conditions.humidity_min != null) {
        maxScore++;
        if (ctx.weather.humidity != null && ctx.weather.humidity > conditions.humidity_min) {
          score++; triggerData.humidity = ctx.weather.humidity;
          reasons.push(`Humidity ${ctx.weather.humidity}% > ${conditions.humidity_min}%`);
        }
      }
      if (conditions.rain_min != null) {
        maxScore++;
        if (ctx.weather.rain_mm != null && ctx.weather.rain_mm > conditions.rain_min) {
          score++; triggerData.rain_mm = ctx.weather.rain_mm;
          reasons.push(`Rain ${ctx.weather.rain_mm}mm > ${conditions.rain_min}mm`);
        }
      }
      if (conditions.wind_max != null) {
        maxScore++;
        if (ctx.weather.wind_speed != null && ctx.weather.wind_speed > conditions.wind_max) {
          score++; triggerData.wind = ctx.weather.wind_speed;
          reasons.push(`Wind ${ctx.weather.wind_speed}km/h > ${conditions.wind_max}km/h`);
        }
      }
      // G1: forecast rain probability
      if (conditions.rain_probability_min != null) {
        maxScore++;
        if (ctx.forecast_rain_probability_72h != null && ctx.forecast_rain_probability_72h >= conditions.rain_probability_min) {
          score++; triggerData.forecast_rain_72h = ctx.forecast_rain_probability_72h;
          reasons.push(`Forecast rain probability ${ctx.forecast_rain_probability_72h}% >= ${conditions.rain_probability_min}%`);
        }
      }
      const fired = score > 0;
      return { fired, riskScore: Math.min(100, score * 30 + 40), confidence: 0.85, reasoning: reasons.join('; '), triggerData };
    }

    case 'NDVI': {
      if (conditions.ndvi_below != null && ctx.ndvi != null) {
        if (ctx.ndvi < conditions.ndvi_below) {
          triggerData.ndvi = ctx.ndvi; triggerData.threshold = conditions.ndvi_below;
          return { fired: true, riskScore: 75, confidence: 0.8, reasoning: `NDVI ${ctx.ndvi.toFixed(2)} below ${conditions.ndvi_below}`, triggerData };
        }
      }
      if (conditions.ndvi_drop != null && ctx.ndvi != null && ctx.ndvi_previous != null) {
        const drop = ctx.ndvi_previous - ctx.ndvi;
        if (drop > conditions.ndvi_drop) {
          triggerData.ndvi = ctx.ndvi; triggerData.ndvi_previous = ctx.ndvi_previous; triggerData.drop = drop;
          return { fired: true, riskScore: 70, confidence: 0.75, reasoning: `NDVI dropped ${drop.toFixed(2)} (threshold: ${conditions.ndvi_drop})`, triggerData };
        }
      }
      return { fired: false, riskScore: 0, confidence: 0, reasoning: '', triggerData };
    }

    case 'STAGE': {
      if (conditions.das_min != null && conditions.das_max != null) {
        if (ctx.das >= conditions.das_min && ctx.das <= conditions.das_max) {
          triggerData.das = ctx.das; triggerData.stage = ctx.current_stage;
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
          conditionsMet++; triggerData.temp = ctx.weather.temp;
        }
      }
      if (conditions.humidity_min != null) {
        totalConditions++;
        if (ctx.weather.humidity != null && ctx.weather.humidity >= conditions.humidity_min) {
          conditionsMet++; triggerData.humidity = ctx.weather.humidity;
        }
      }
      if (conditions.rain_min != null) {
        totalConditions++;
        if (ctx.weather.rain_mm != null && ctx.weather.rain_mm >= conditions.rain_min) {
          conditionsMet++; triggerData.rain_mm = ctx.weather.rain_mm;
        }
      }
      // G1: forecast rain probability for disease risk
      if (conditions.rain_probability_min != null) {
        totalConditions++;
        if (ctx.forecast_rain_probability_72h != null && ctx.forecast_rain_probability_72h >= conditions.rain_probability_min) {
          conditionsMet++; triggerData.forecast_rain_72h = ctx.forecast_rain_probability_72h;
        }
      }
      // G1: soil pH (some diseases favor low/high pH)
      if (conditions.soil_ph_min != null && conditions.soil_ph_max != null) {
        totalConditions++;
        if (ctx.soil_ph != null && ctx.soil_ph >= conditions.soil_ph_min && ctx.soil_ph <= conditions.soil_ph_max) {
          conditionsMet++; triggerData.soil_ph = ctx.soil_ph;
        }
      }

      const ratio = totalConditions > 0 ? conditionsMet / totalConditions : 0;
      const fired = ratio >= 0.6;
      return { fired, riskScore: Math.round(ratio * 100), confidence: ratio * 0.9, reasoning: `${conditionsMet}/${totalConditions} conditions met (${Math.round(ratio * 100)}%)`, triggerData };
    }

    case 'PEST_RISK': {
      if (conditions.das_min != null && ctx.das >= conditions.das_min) {
        // G1: Use GDD if available, otherwise temp-based
        if (conditions.gdd_min != null && ctx.gdd_accumulated != null) {
          if (ctx.gdd_accumulated >= conditions.gdd_min) {
            triggerData.gdd = ctx.gdd_accumulated; triggerData.das = ctx.das;
            return { fired: true, riskScore: 70, confidence: 0.8, reasoning: `GDD ${ctx.gdd_accumulated} >= ${conditions.gdd_min} + DAS ${ctx.das}`, triggerData };
          }
        }
        if (conditions.temp_min != null && ctx.weather.temp != null && ctx.weather.temp >= conditions.temp_min) {
          triggerData.das = ctx.das; triggerData.temp = ctx.weather.temp;
          return { fired: true, riskScore: 65, confidence: 0.7, reasoning: `DAS ${ctx.das} + Temp ${ctx.weather.temp}°C favorable for pest`, triggerData };
        }
      }
      return { fired: false, riskScore: 0, confidence: 0, reasoning: '', triggerData };
    }

    case 'SOIL': {
      let conditionsMet = 0;
      let totalConditions = 0;

      if (conditions.soil_n_min != null) {
        totalConditions++;
        if (ctx.soil_n != null && ctx.soil_n < conditions.soil_n_min) {
          conditionsMet++; triggerData.soil_n = ctx.soil_n;
          reasons.push(`N ${ctx.soil_n} kg/ha < ${conditions.soil_n_min} kg/ha`);
        }
      }
      if (conditions.soil_p_min != null) {
        totalConditions++;
        if (ctx.soil_p != null && ctx.soil_p < conditions.soil_p_min) {
          conditionsMet++; triggerData.soil_p = ctx.soil_p;
          reasons.push(`P ${ctx.soil_p} kg/ha < ${conditions.soil_p_min} kg/ha`);
        }
      }
      if (conditions.soil_k_min != null) {
        totalConditions++;
        if (ctx.soil_k != null && ctx.soil_k < conditions.soil_k_min) {
          conditionsMet++; triggerData.soil_k = ctx.soil_k;
          reasons.push(`K ${ctx.soil_k} kg/ha < ${conditions.soil_k_min} kg/ha`);
        }
      }
      if (conditions.soil_ph_min != null || conditions.soil_ph_max != null) {
        totalConditions++;
        if (ctx.soil_ph != null) {
          const outOfRange = (conditions.soil_ph_min != null && ctx.soil_ph < conditions.soil_ph_min) ||
                            (conditions.soil_ph_max != null && ctx.soil_ph > conditions.soil_ph_max);
          if (outOfRange) {
            conditionsMet++; triggerData.soil_ph = ctx.soil_ph;
            reasons.push(`pH ${ctx.soil_ph} out of range [${conditions.soil_ph_min || '-'}-${conditions.soil_ph_max || '-'}]`);
          }
        }
      }
      if (conditions.organic_carbon_min != null) {
        totalConditions++;
        if (ctx.organic_carbon != null && ctx.organic_carbon < conditions.organic_carbon_min) {
          conditionsMet++; triggerData.organic_carbon = ctx.organic_carbon;
          reasons.push(`OC ${ctx.organic_carbon}% < ${conditions.organic_carbon_min}%`);
        }
      }

      const fired = conditionsMet > 0;
      return { fired, riskScore: Math.min(100, conditionsMet * 25 + 40), confidence: 0.7, reasoning: reasons.join('; '), triggerData };
    }

    default:
      return { fired: false, riskScore: 0, confidence: 0, reasoning: `Unknown condition_type: ${rule.condition_type}`, triggerData };
  }
}

// =====================================================
// CONDITIONS_JSON PARSER (translates string formats → numeric thresholds)
// =====================================================

function parseDecisionRuleConditions(cj: Record<string, any>): {
  temp_min: number | null; temp_max: number | null;
  humidity_min: number | null; humidity_max: number | null;
  rain_min: number | null; wind_max: number | null;
  frost: boolean; soil_moisture_low: boolean; soil_moisture_high: boolean;
  ndvi_below: number | null;
} {
  const result = {
    temp_min: null as number | null, temp_max: null as number | null,
    humidity_min: null as number | null, humidity_max: null as number | null,
    rain_min: null as number | null, wind_max: null as number | null,
    frost: false, soil_moisture_low: false, soil_moisture_high: false,
    ndvi_below: null as number | null,
  };

  const weather = cj.weather || {};
  
  // Parse temperature: ">38", "<15C", "22-28C", ">40C", "<0C"
  const tempStr = weather.temperature || weather.temperature_c || null;
  if (tempStr && typeof tempStr === 'string') {
    const rangeMatch = tempStr.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
      result.temp_min = parseFloat(rangeMatch[1]);
      result.temp_max = parseFloat(rangeMatch[2]);
    } else {
      const gtMatch = tempStr.match(/>(\d+)/);
      const ltMatch = tempStr.match(/<(\d+)/);
      if (gtMatch) result.temp_min = parseFloat(gtMatch[1]);
      if (ltMatch) result.temp_max = parseFloat(ltMatch[1]);
    }
  }
  if (weather.warm_temperature === true && result.temp_min === null) result.temp_min = 25;
  if (weather.high === true || (typeof weather.temperature === 'string' && weather.temperature === 'high')) result.temp_min = 35;

  // Parse humidity: ">80%", ">95", ">90", "40-80"
  const humStr = weather.humidity || null;
  if (humStr && typeof humStr === 'string') {
    const rangeMatch = humStr.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
      result.humidity_min = parseFloat(rangeMatch[1]);
      result.humidity_max = parseFloat(rangeMatch[2]);
    } else {
      const gtMatch = humStr.match(/>(\d+)/);
      if (gtMatch) result.humidity_min = parseFloat(gtMatch[1]);
    }
  }
  if (cj.high_humidity === true || weather.high_humidity === true) {
    if (result.humidity_min === null) result.humidity_min = 80;
  }

  // Parse wind: "<10", ">20"
  const windStr = weather.wind_speed_kmph || weather.wind || null;
  if (windStr && typeof windStr === 'string') {
    const gtMatch = windStr.match(/>(\d+)/);
    const ltMatch = windStr.match(/<(\d+)/);
    if (gtMatch) result.wind_max = parseFloat(gtMatch[1]);
    if (ltMatch) result.wind_max = parseFloat(ltMatch[1]);
  }

  // Parse rain
  const rainStr = weather.rain_forecast_4h || weather.rainfall || null;
  if (rainStr === 'deficit') result.rain_min = 0; // drought condition
  if (typeof rainStr === 'string' && rainStr.match(/>\d+/)) {
    const m = rainStr.match(/>(\d+)/);
    if (m) result.rain_min = parseFloat(m[1]);
  }
  if (cj.waterlogging === true || cj.soil_moisture === 'excess' || cj.soil_moisture === 'HIGH') {
    result.rain_min = 50;
    result.soil_moisture_high = true;
  }

  // Frost
  if (weather.frost === true || weather.frost_warning === true) result.frost = true;

  // Soil moisture
  if (cj.soil_moisture === 'low' || cj.soil_moisture === 'LOW' || cj.soil_moisture_low === true) result.soil_moisture_low = true;

  // NDVI
  if (cj.ndvi_decline === true || cj.ndvi_before_rain != null) result.ndvi_below = cj.ndvi_current_max || 0.5;

  return result;
}

// =====================================================
// DECISION RULES EVALUATION (G2 bridge — with conditions_json parser)
// =====================================================

function evaluateDecisionRule(dr: DecisionRuleProactive, ctx: LandContext): RuleEvalResult {
  const triggerData: Record<string, any> = { decision_rule_id: dr.id, condition_code: dr.condition_code };
  const reasons: string[] = [];

  const cj = dr.conditions_json || {};
  const parsed = parseDecisionRuleConditions(cj);
  let condMet = 0;
  let condTotal = 0;

  // Temperature check (parsed from string formats)
  if (parsed.temp_min != null || parsed.temp_max != null) {
    condTotal++;
    if (ctx.weather.temp != null) {
      const tooHot = parsed.temp_min != null && ctx.weather.temp >= parsed.temp_min;
      const tooCold = parsed.temp_max != null && ctx.weather.temp <= parsed.temp_max;
      // For range conditions (both min and max), both must be true
      // For single threshold, only that check matters
      const rangeCheck = parsed.temp_min != null && parsed.temp_max != null
        ? (ctx.weather.temp >= parsed.temp_min && ctx.weather.temp <= parsed.temp_max)
        : (tooHot || tooCold);
      if (rangeCheck) {
        condMet++; triggerData.temp = ctx.weather.temp;
        reasons.push(`Temp ${ctx.weather.temp}°C matches threshold`);
      }
    }
  }

  // Humidity check
  if (parsed.humidity_min != null) {
    condTotal++;
    if (ctx.weather.humidity != null && ctx.weather.humidity >= parsed.humidity_min) {
      condMet++; triggerData.humidity = ctx.weather.humidity;
      reasons.push(`Humidity ${ctx.weather.humidity}% ≥ ${parsed.humidity_min}%`);
    }
  }

  // Rain check
  if (parsed.rain_min != null && parsed.rain_min > 0) {
    condTotal++;
    if (ctx.weather.rain_mm != null && ctx.weather.rain_mm >= parsed.rain_min) {
      condMet++; triggerData.rain_mm = ctx.weather.rain_mm;
      reasons.push(`Rain ${ctx.weather.rain_mm}mm ≥ ${parsed.rain_min}mm`);
    }
  }

  // Wind check
  if (parsed.wind_max != null) {
    condTotal++;
    if (ctx.weather.wind_speed != null && ctx.weather.wind_speed >= parsed.wind_max) {
      condMet++; triggerData.wind = ctx.weather.wind_speed;
      reasons.push(`Wind ${ctx.weather.wind_speed}km/h ≥ ${parsed.wind_max}km/h`);
    }
  }

  // Frost check
  if (parsed.frost) {
    condTotal++;
    if (ctx.weather.temp != null && ctx.weather.temp <= 5) {
      condMet++; triggerData.temp = ctx.weather.temp;
      reasons.push(`Frost risk: ${ctx.weather.temp}°C`);
    }
  }

  // Soil moisture (proxy via rain + humidity)
  if (parsed.soil_moisture_low) {
    condTotal++;
    if (ctx.weather.rain_mm != null && ctx.weather.rain_mm < 2 && ctx.weather.humidity != null && ctx.weather.humidity < 50) {
      condMet++; reasons.push('Low soil moisture conditions');
    }
  }
  if (parsed.soil_moisture_high) {
    condTotal++;
    if ((ctx.weather.rain_mm != null && ctx.weather.rain_mm > 30) || (ctx.forecast_rain_probability_72h != null && ctx.forecast_rain_probability_72h > 70)) {
      condMet++; triggerData.rain_mm = ctx.weather.rain_mm; reasons.push('Excess moisture/waterlogging risk');
    }
  }

  // NDVI check
  if (parsed.ndvi_below != null) {
    condTotal++;
    if (ctx.ndvi != null && ctx.ndvi < parsed.ndvi_below) {
      condMet++; triggerData.ndvi = ctx.ndvi;
      reasons.push(`NDVI ${ctx.ndvi.toFixed(2)} < ${parsed.ndvi_below}`);
    }
  }

  // ETL threshold check
  if (dr.etl_value_min != null) {
    condTotal++;
    // Use GDD as pest-pressure proxy when available
    if (ctx.gdd_accumulated != null && ctx.gdd_accumulated >= (dr.etl_value_min * 10)) {
      condMet++; triggerData.gdd = ctx.gdd_accumulated;
      reasons.push(`GDD ${ctx.gdd_accumulated} indicates pest pressure`);
    } else if (ctx.weather.temp != null && ctx.weather.temp >= 25 && ctx.weather.humidity != null && ctx.weather.humidity >= 60) {
      condMet++; reasons.push('ETL-favorable conditions (T≥25°C, H≥60%)');
    }
  }

  // PHI window check
  if (dr.phi_days != null && ctx.das > 0) {
    const estimatedHarvestDas = getEstimatedHarvestDas(ctx.crop_code);
    if (estimatedHarvestDas > 0) {
      const daysToHarvest = estimatedHarvestDas - ctx.das;
      if (daysToHarvest > 0 && daysToHarvest <= dr.phi_days) {
        condTotal++; condMet++;
        triggerData.days_to_harvest = daysToHarvest; triggerData.phi_days = dr.phi_days;
        reasons.push(`${daysToHarvest} days to harvest, PHI ${dr.phi_days} days`);
      }
    }
  }

  if (condTotal === 0) return { fired: false, riskScore: 0, confidence: 0, reasoning: '', triggerData };

  const ratio = condMet / condTotal;
  const fired = ratio >= 0.5;
  return { fired, riskScore: Math.round(ratio * 100), confidence: ratio * 0.85, reasoning: reasons.join('; '), triggerData };
}

function getEstimatedHarvestDas(cropCode: string | null): number {
  const harvestDas: Record<string, number> = {
    SUGARCANE: 360, WHEAT: 130, COTTON: 180, RICE: 140, SOYBEAN: 110, ONION: 120,
  };
  return harvestDas[cropCode || ''] || 0;
}

// =====================================================
// NEURAL ENRICHMENT — ASYNC (updates DB after insert)
// =====================================================

async function enrichAndUpdateAlerts(supabase: any, insertedAlerts: any[]): Promise<void> {
  const highRisk = insertedAlerts.filter(a => a.risk_score >= 70 || a.priority === 'CRITICAL');
  if (highRisk.length === 0 || !LOVABLE_API_KEY) return;

  const toEnrich = highRisk.slice(0, 5);

  for (const alert of toEnrich) {
    try {
      const prompt = `You are an expert Indian agronomist helping a rural farmer. Generate a brief, actionable alert in 3 languages.

Context:
- Alert Category: ${alert.alert_category}
- Priority: ${alert.priority}
- Risk Score: ${alert.risk_score}
- Evidence: ${JSON.stringify(alert.trigger_data)}
- Current message: ${alert.message_en}

Return a JSON with exactly these fields:
{
  "title_mr": "Short Marathi title (max 15 words)",
  "title_hi": "Short Hindi title (max 15 words)",
  "title_en": "Short English title (max 15 words)",
  "message_mr": "Farmer-friendly Marathi message (max 40 words, use simple rural Marathi)",
  "message_hi": "Farmer-friendly Hindi message (max 40 words, use simple rural Hindi)",
  "message_en": "Farmer-friendly English message (max 40 words)",
  "action_mr": "Actionable step in Marathi (max 20 words)",
  "action_hi": "Actionable step in Hindi (max 20 words)",
  "action_en": "Actionable step in English (max 20 words)"
}

Important: Use simple village language. Tell the farmer exactly what to do physically. Be specific about timing.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        console.warn(`[NeuralEnrichment] API returned ${response.status}`);
        await response.text();
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) continue;

      const enriched = JSON.parse(content);
      const updateData: Record<string, string> = {};
      if (enriched.title_mr) updateData.title_mr = enriched.title_mr;
      if (enriched.title_hi) updateData.title_hi = enriched.title_hi;
      if (enriched.title_en) updateData.title_en = enriched.title_en;
      if (enriched.message_mr) updateData.message_mr = enriched.message_mr;
      if (enriched.message_hi) updateData.message_hi = enriched.message_hi;
      if (enriched.message_en) updateData.message_en = enriched.message_en;
      if (enriched.action_mr) updateData.action_text_mr = enriched.action_mr;
      if (enriched.action_hi) updateData.action_text_hi = enriched.action_hi;
      if (enriched.action_en) updateData.action_text_en = enriched.action_en;

      // Update the already-inserted alert with enriched content
      await supabase.from('proactive_alerts').update(updateData).eq('id', alert.id);
      console.log(`[NeuralEnrichment] Enriched alert ${alert.id}`);
    } catch (e) {
      console.warn('[NeuralEnrichment] Error:', e.message);
    }
  }
}

// =====================================================
// TRILINGUAL TEMPLATE GENERATORS (for decision rules without enrichment)
// =====================================================

const CATEGORY_TITLES: Record<string, { mr: string; hi: string }> = {
  PEST_RISK: { mr: '🐛 कीड चेतावणी', hi: '🐛 कीट चेतावनी' },
  DISEASE_RISK: { mr: '🦠 रोग धोका', hi: '🦠 रोग का खतरा' },
  WEATHER_WARNING: { mr: '⛈️ हवामान इशारा', hi: '⛈️ मौसम चेतावनी' },
  IRRIGATION: { mr: '💧 पाणी व्यवस्थापन', hi: '💧 पानी प्रबंधन' },
  FERTILIZER_WINDOW: { mr: '🌿 खत व्यवस्थापन', hi: '🌿 उर्वरक प्रबंधन' },
  SPRAY_WINDOW: { mr: '🔫 फवारणी वेळ', hi: '🔫 छिड़काव का समय' },
  CROP_STRESS: { mr: '🌡️ पीक ताण', hi: '🌡️ फसल तनाव' },
  STAGE_ADVISORY: { mr: '🌱 टप्पा सल्ला', hi: '🌱 चरण सलाह' },
  HARVEST_TIMING: { mr: '🌾 कापणी वेळ', hi: '🌾 कटाई का समय' },
  GENERAL: { mr: '📢 सूचना', hi: '📢 सूचना' },
};

const CATEGORY_ACTIONS: Record<string, { mr: string; hi: string }> = {
  PEST_RISK: { mr: 'शेताची तपासणी करा आणि कीडनाशक फवारणी करा', hi: 'खेत की जांच करें और कीटनाशक छिड़काव करें' },
  DISEASE_RISK: { mr: 'प्रभावित पाने काढून बुरशीनाशक फवारा', hi: 'प्रभावित पत्तियां हटाएं और फफूंदनाशक छिड़कें' },
  WEATHER_WARNING: { mr: 'पिकाला संरक्षण द्या, सिंचन थांबवा', hi: 'फसल को सुरक्षा दें, सिंचाई रोकें' },
  IRRIGATION: { mr: 'आज सिंचन करा', hi: 'आज सिंचाई करें' },
  FERTILIZER_WINDOW: { mr: 'खत द्यायची योग्य वेळ आहे', hi: 'खाद देने का सही समय है' },
  SPRAY_WINDOW: { mr: 'आज फवारणीसाठी योग्य हवामान', hi: 'आज छिड़काव के लिए उपयुक्त मौसम' },
  CROP_STRESS: { mr: 'पिकाची स्थिती तपासा', hi: 'फसल की स्थिति जांचें' },
  STAGE_ADVISORY: { mr: 'या टप्प्यात विशेष काळजी घ्या', hi: 'इस चरण में विशेष देखभाल करें' },
  HARVEST_TIMING: { mr: 'कापणी नियोजन करा', hi: 'कटाई की योजना बनाएं' },
  GENERAL: { mr: 'तपासणी करा', hi: 'जांच करें' },
};

function generateTrilingualTitle(category: string, alertCategory: string, ctx: LandContext): { mr: string; hi: string } {
  const templates = CATEGORY_TITLES[alertCategory] || CATEGORY_TITLES.GENERAL;
  const landMr = ctx.land_name || 'शेत';
  const landHi = ctx.land_name || 'खेत';
  return {
    mr: `${templates.mr} - ${landMr}`,
    hi: `${templates.hi} - ${landHi}`,
  };
}

function generateTrilingualMessage(category: string, messageEn: string, ctx: LandContext): { mr: string; hi: string } {
  // For decision rules, create a basic Marathi/Hindi message from context
  const landMr = ctx.land_name || 'तुमच्या शेतात';
  const landHi = ctx.land_name || 'आपके खेत में';
  const catTitleMr = CATEGORY_TITLES[mapDecisionCategory(category)]?.mr || 'सूचना';
  const catTitleHi = CATEGORY_TITLES[mapDecisionCategory(category)]?.hi || 'सूचना';
  
  return {
    mr: `${landMr} - ${catTitleMr}. तापमान: ${ctx.weather.temp ?? '--'}°C, आर्द्रता: ${ctx.weather.humidity ?? '--'}%. शेताची तपासणी करा.`,
    hi: `${landHi} - ${catTitleHi}. तापमान: ${ctx.weather.temp ?? '--'}°C, नमी: ${ctx.weather.humidity ?? '--'}%. खेत की जांच करें.`,
  };
}

function generateTrilingualAction(category: string, actionEn: string | null, ctx: LandContext): { mr: string; hi: string } {
  const alertCat = mapDecisionCategory(category);
  const templates = CATEGORY_ACTIONS[alertCat] || CATEGORY_ACTIONS.GENERAL;
  return { mr: templates.mr, hi: templates.hi };
}

// =====================================================
// DECISION RULE MAPPING HELPERS
// =====================================================

function mapDecisionCategory(category: string): string {
  const map: Record<string, string> = {
    'proactive_monitoring': 'CROP_STRESS',
    'proactive_pest': 'PEST_RISK',
    'proactive_irrigation': 'IRRIGATION',
    'ipm': 'PEST_RISK',
    'pest': 'PEST_RISK',
    'disease': 'DISEASE_RISK',
    'nutrient': 'FERTILIZER_WINDOW',
    'nutrition': 'FERTILIZER_WINDOW',
    'safety': 'SPRAY_WINDOW',
    'advisory': 'STAGE_ADVISORY',
    'stage_problems': 'CROP_STRESS',
    'stress': 'CROP_STRESS',
    'weather': 'WEATHER_WARNING',
    'irrigation': 'IRRIGATION',
    'soil': 'CROP_STRESS',
    'physiology': 'CROP_STRESS',
  };
  return map[category] || 'GENERAL';
}

function mapDecisionPriority(priority: number): string {
  if (priority <= 1) return 'CRITICAL';
  if (priority <= 2) return 'HIGH';
  if (priority <= 3) return 'MEDIUM';
  if (priority <= 5) return 'LOW';
  return 'LOW';
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

function mapDecisionEventType(category: string): string {
  const map: Record<string, string> = {
    'pest': 'PEST_EMERGENCE',
    'disease': 'DISEASE_RISK_WINDOW',
    'weather': 'WEATHER_CHANGE',
    'stress': 'WEATHER_CHANGE',
    'irrigation': 'IRRIGATION_NEEDED',
    'safety': 'SPRAY_WINDOW',
    'soil': 'SOIL_CHANGE',
    'nutrition': 'SCHEDULED_CHECK',
    'nutrient': 'SCHEDULED_CHECK',
    'physiology': 'SCHEDULED_CHECK',
    'stage_problems': 'STAGE_TRANSITION',
  };
  return map[category] || 'SCHEDULED_CHECK';
}

// =====================================================
// IRRIGATION CALCULATION MODULE (ICAR-based)
// =====================================================

const CROP_WATER_NEED_MM_PER_DAY: Record<string, Record<string, number>> = {
  SUGARCANE: { GERMINATION: 3, SEEDLING: 4, TILLERING: 6, GRAND_GROWTH: 8, MATURITY: 4, HARVEST: 2, VEGETATIVE: 5 },
  WHEAT: { GERMINATION: 2, SEEDLING: 3, TILLERING: 4, HEADING: 5, GRAIN_FILLING: 4, MATURITY: 2, VEGETATIVE: 3 },
  COTTON: { GERMINATION: 2, SEEDLING: 3, SQUARING: 5, FLOWERING: 6, BOLL_DEVELOPMENT: 5, MATURITY: 3, VEGETATIVE: 4 },
  RICE: { GERMINATION: 5, SEEDLING: 6, TILLERING: 8, PANICLE_INITIATION: 8, FLOWERING: 7, GRAIN_FILLING: 5, MATURITY: 3, VEGETATIVE: 6 },
  SOYBEAN: { GERMINATION: 2, SEEDLING: 3, FLOWERING: 5, POD_FILLING: 4, MATURITY: 2, VEGETATIVE: 3 },
  ONION: { GERMINATION: 2, SEEDLING: 3, BULB_FORMATION: 5, MATURITY: 2, VEGETATIVE: 3 },
};

const IRRIGATION_EFFICIENCY: Record<string, number> = {
  DRIP: 0.90, SPRINKLER: 0.75, FURROW: 0.55, FLOOD: 0.45, MICRO_SPRINKLER: 0.80, SURFACE: 0.50,
};

const SOIL_WATER_FACTOR: Record<string, number> = {
  BLACK: 0.85, RED: 1.1, LATERITE: 1.15, ALLUVIAL: 0.95, SANDY: 1.3, CLAY: 0.8, LOAMY: 1.0, MEDIUM_BLACK: 0.9,
};

function calculateIrrigationForLand(ctx: LandContext): {
  water_liters_per_acre: number;
  water_liters_total: number;
  duration_hours: number;
  urgency: string;
  timing: string;
  frequency_days: number;
  method: string;
} | null {
  const cropCode = ctx.crop_code || 'SUGARCANE';
  const stage = ctx.current_stage || 'VEGETATIVE';
  const area = ctx.area_acres || 1;
  const irrigationType = (ctx.irrigation_type || 'FLOOD').toUpperCase();
  const soilType = (ctx.soil_type || 'MEDIUM_BLACK').toUpperCase().replace(/\s+/g, '_');

  const cropNeeds = CROP_WATER_NEED_MM_PER_DAY[cropCode] || CROP_WATER_NEED_MM_PER_DAY.SUGARCANE;
  const dailyNeedMm = cropNeeds[stage] || cropNeeds.VEGETATIVE || 5;
  
  const efficiency = IRRIGATION_EFFICIENCY[irrigationType] || 0.55;
  const soilFactor = SOIL_WATER_FACTOR[soilType] || 1.0;

  // ICAR formula: water_need = (ETcrop * soil_factor) / irrigation_efficiency
  // 1 acre = 4047 m², 1mm on 1 acre = 4047 liters
  const frequencyDays = irrigationType === 'DRIP' ? 1 : irrigationType === 'SPRINKLER' ? 3 : 7;
  const totalMmPerCycle = dailyNeedMm * frequencyDays * soilFactor;
  const appliedMm = totalMmPerCycle / efficiency;
  
  // Subtract recent rainfall
  const rainMm = ctx.weather.rain_mm || 0;
  const effectiveAppliedMm = Math.max(0, appliedMm - (rainMm * 0.7)); // 70% effective rainfall
  
  if (effectiveAppliedMm <= 0) return null;

  const litersPerAcre = Math.round(effectiveAppliedMm * 4047);
  const totalLiters = Math.round(litersPerAcre * area);

  // Duration based on typical flow rates
  const flowRateLPH: Record<string, number> = { DRIP: 4000, SPRINKLER: 12000, FLOOD: 30000, FURROW: 20000, SURFACE: 25000 };
  const flowRate = flowRateLPH[irrigationType] || 20000;
  const durationHours = Math.round((totalLiters / flowRate) * 10) / 10;

  // Urgency based on temp + humidity + NDVI
  let urgency = 'TOMORROW';
  if (ctx.weather.temp != null && ctx.weather.temp > 38) urgency = 'IMMEDIATE';
  else if (ctx.ndvi != null && ctx.ndvi < 0.3) urgency = 'IMMEDIATE';
  else if (ctx.weather.temp != null && ctx.weather.temp > 33) urgency = 'TODAY';
  else if (ctx.weather.humidity != null && ctx.weather.humidity < 30) urgency = 'TODAY';

  const timingMap: Record<string, string> = {
    IMMEDIATE: 'Do it now / आत्ताच करा',
    TODAY: 'Before sunset today / आज सूर्यास्तापूर्वी',
    TOMORROW: 'Early morning tomorrow / उद्या सकाळी',
  };

  return {
    water_liters_per_acre: litersPerAcre,
    water_liters_total: totalLiters,
    duration_hours: durationHours,
    urgency,
    timing: timingMap[urgency] || timingMap.TOMORROW,
    frequency_days: frequencyDays,
    method: irrigationType,
  };
}

// =====================================================
// TEMPLATE HELPERS
// =====================================================

function buildTemplateVars(ctx: LandContext): Record<string, string> {
  return {
    '{{crop}}': ctx.crop_code || 'crop',
    '{{temp}}': ctx.weather.temp?.toString() || '--',
    '{{humidity}}': ctx.weather.humidity?.toString() || '--',
    '{{rain}}': ctx.weather.rain_mm?.toString() || '0',
    '{{wind}}': ctx.weather.wind_speed?.toString() || '--',
    '{{ndvi}}': ctx.ndvi?.toFixed(2) || '--',
    '{{das}}': ctx.das.toString(),
    '{{stage}}': ctx.current_stage || 'unknown',
    '{{land}}': ctx.land_name || 'your field',
    '{{soil_n}}': ctx.soil_n?.toString() || '--',
    '{{soil_p}}': ctx.soil_p?.toString() || '--',
    '{{soil_k}}': ctx.soil_k?.toString() || '--',
    '{{soil_ph}}': ctx.soil_ph?.toString() || '--',
    '{{forecast_rain}}': ctx.forecast_rain_probability_72h?.toString() || '--',
    '{{area}}': ctx.area_acres?.toString() || '--',
    '{{irrigation_type}}': ctx.irrigation_type || '--',
  };
}

function fillTemplate(tpl: string | null, vars: Record<string, string>): string {
  if (!tpl) return '';
  let result = tpl;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(key, val);
  }
  return result;
}

// mapConditionToEventType moved to category mapping section above

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
