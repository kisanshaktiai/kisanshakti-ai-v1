import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';
import {
  batchLoadDerived,
  batchLoadForecastTmax5d,
  loadFarmerVisibility,
  applyFarmerVisibilityGuard,
  isEnvIntelligenceRule,
  evaluateEnvRule,
  emptyDerived,
  type DerivedState,
} from './env-derived.ts';

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
  // Fix 1: Expanded treatment/safety columns
  active_ingredient: string | null;
  dosage_per_acre: string | null;
  water_volume_per_acre: string | null;
  application_method: string | null;
  organic_alternative: string | null;
  bee_toxicity: string | null;
  farmer_safety_level: string | null;
  treatment_type: string | null;
  chemical_class: string | null;
  confidence_score: number | null;
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
    /** 'exact' = key match, 'proximity' = nearest within 55km, 'unavailable' = no data */
    source: 'exact' | 'proximity' | 'unavailable';
    /** Distance in km from land centroid to weather station (null if exact/unavailable) */
    distance_km: number | null;
    /** Age of observation in hours (null if unavailable) */
    age_hours: number | null;
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
  /** D7 — Environmental Intelligence derived namespace (additive) */
  derived: DerivedState;
  /** 5-day forecast mean Tmax (°C), null when unavailable */
  forecast_tmax_mean_5d: number | null;
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
    const rawTenantId = body.tenant_id || null;

    console.log(`[ProactiveEvaluator] Action: ${action}, Land: ${targetLandId || 'ALL'}`);

    // =========================================================
    // FIX 1: Multi-tenant isolation — resolve tenant list
    // =========================================================
    let tenantIds: string[] = [];
    if (rawTenantId && rawTenantId !== 'default') {
      tenantIds = [rawTenantId];
    } else {
      // No valid tenant_id — query all distinct active tenants
      const { data: tenantRows } = await supabase
        .from('lands')
        .select('tenant_id')
        .eq('is_active', true)
        .not('tenant_id', 'is', null);
      const uniqueTenants = new Set<string>();
      (tenantRows || []).forEach((r: any) => { if (r.tenant_id) uniqueTenants.add(r.tenant_id); });
      tenantIds = Array.from(uniqueTenants);
      console.log(`[ProactiveEvaluator] Multi-tenant mode: ${tenantIds.length} tenants`);
    }

    if (tenantIds.length === 0) {
      return jsonResponse({ success: true, message: 'No active tenants', alerts_generated: 0 });
    }

    // Process each tenant independently for data isolation
    let totalAlerts = 0;
    let totalLands = 0;
    let totalRulesFired = 0;
    let totalRulesEvaluated = 0;

    for (const tenantId of tenantIds) {
      const tenantResult = await processOneTenant(supabase, tenantId, targetLandId, action);
      totalAlerts += tenantResult.alerts;
      totalLands += tenantResult.lands;
      totalRulesFired += tenantResult.rulesFired;
      totalRulesEvaluated += tenantResult.rulesEvaluated;
    }

    const elapsed = Date.now() - startTime;
    console.log(`[ProactiveEvaluator] Done: ${totalLands} lands, ${totalRulesFired} rules fired, ${totalAlerts} alerts in ${elapsed}ms`);

    // Log evaluation
    await supabase.from('proactive_evaluation_log').insert({
      tenant_id: tenantIds[0] || 'default',
      evaluation_type: action === 'scheduled' ? 'scheduled' : 'manual',
      lands_evaluated: totalLands,
      rules_evaluated: totalRulesEvaluated,
      rules_fired: totalRulesFired,
      alerts_generated: totalAlerts,
      execution_time_ms: elapsed,
      metadata: { tenants_processed: tenantIds.length },
    }).then(() => {});

    return jsonResponse({
      success: true,
      tenants_processed: tenantIds.length,
      lands_evaluated: totalLands,
      rules_fired: totalRulesFired,
      alerts_generated: totalAlerts,
      execution_time_ms: elapsed,
    });
  } catch (error) {
    console.error('[ProactiveEvaluator] Fatal error:', error.message);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
});

// =====================================================
// PROCESS ONE TENANT (isolated)
// =====================================================

async function processOneTenant(supabase: any, tenantId: string, targetLandId: string | null, action: string): Promise<{ alerts: number; lands: number; rulesFired: number; rulesEvaluated: number }> {
    // =========================================================
    // STEP 1: Load proactive rules + decision_rules (is_proactive_rule=true)
    // =========================================================
    const [rulesRes, decisionRulesRes] = await Promise.all([
      supabase.from('proactive_rules').select('*').eq('is_active', true),
      supabase.from('decision_rules').select('id, crop_code, category, priority, condition_code, stage_applicable, conditions_json, etl_value_min, etl_value_max, phi_days, action_text, reason_text, knowledge_text, i18n_key, prediction_type, forecast_horizon_days, active_ingredient, dosage_per_acre, water_volume_per_acre, application_method, organic_alternative, bee_toxicity, farmer_safety_level, treatment_type, chemical_class, confidence_score').eq('is_proactive_rule', true).eq('is_active', true),
    ]);

    if (rulesRes.error) throw new Error(`Rules load failed: ${rulesRes.error.message}`);
    const rules: ProactiveRule[] = rulesRes.data || [];
    const decisionRules: DecisionRuleProactive[] = decisionRulesRes.data || [];

    if (rules.length === 0 && decisionRules.length === 0) {
      return { alerts: 0, lands: 0, rulesFired: 0, rulesEvaluated: 0 };
    }

    console.log(`[ProactiveEvaluator][${tenantId.slice(0,8)}] Loaded ${rules.length} proactive rules, ${decisionRules.length} decision rules`);

    // =========================================================
    // STEP 2: Load active lands — STRICT tenant filter
    // =========================================================
    let landsQuery = supabase
      .from('lands')
      .select('id, farmer_id, tenant_id, current_crop, name, last_sowing_date, cultivation_date, center_lat, center_lon, area_acres, soil_type, irrigation_type, water_source')
      .eq('is_active', true)
      .eq('tenant_id', tenantId);

    if (targetLandId) landsQuery = landsQuery.eq('id', targetLandId);

    const { data: lands, error: landsError } = await landsQuery.limit(500);
    if (landsError) throw new Error(`Lands load failed: ${landsError.message}`);
    if (!lands || lands.length === 0) {
      return { alerts: 0, lands: 0, rulesFired: 0, rulesEvaluated: 0 };
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
      // Recent alerts for dedup/cooldown (24h)
      supabase.from('proactive_alerts')
        .select('id, rule_id, land_id, farmer_id, dedup_key, created_at, status, trigger_data')
        .in('land_id', landIds)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
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

    // Batch-load weather: per-land via geo-proximity (≤55 km, ≤6 h freshness).
    // Aligned with mem://weather/live-weather-context-resolution so AI Chat and
    // proactive alerts see the same temperature/humidity for each land.
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
    const landWeatherMap = await batchLoadWeatherByLand(
      supabase,
      lands.map((l: any) => ({ id: l.id, center_lat: l.center_lat, center_lon: l.center_lon })),
    );
    
    // Batch-load forecast rain probability (72h) and GDD (30d) — by location_key
    const [forecastLocMap, gddLocMap, tmax5dLocMap, derivedMap, farmerVisibility] = await Promise.all([
      batchLoadForecast(supabase, locKeyArray),
      batchLoadGDD(supabase, locKeyArray),
      // D7 — Environmental Intelligence (additive)
      batchLoadForecastTmax5d(supabase, locKeyArray),
      batchLoadDerived(supabase, landIds),
      loadFarmerVisibility(supabase),
    ]);
    console.log(`[ProactiveEvaluator][${tenantId.slice(0,8)}] [ENV_DERIVED] hydrated derived state for ${derivedMap.size}/${landIds.length} lands`);
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
      const sowingDate = schedule?.sowing_date || land.last_sowing_date || land.cultivation_date;
      const cropSource = schedule?.crop_name || land.current_crop;
      const cropCode = normalizeCropCode(cropSource);

      const das = sowingDate
        ? Math.floor((Date.now() - new Date(sowingDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Dynamic stage computation (G3) — DB-driven first, then fallback
      const currentStage = computeStageDynamic(cropCode, das, stageMap);

      // Weather: per-land geo-proximity result (exact / proximity / unavailable)
      const locKey = (land.center_lat != null && land.center_lon != null)
        ? makeLocationKey(land.center_lat, land.center_lon) : null;
      const weather = landWeatherMap.get(land.id) || nullWeather();

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
        derived: derivedMap.get(land.id) || emptyDerived(),
        forecast_tmax_mean_5d: locKey ? (tmax5dLocMap.get(locKey) ?? null) : null,
      });
    }

    // =========================================================
    // STEP 5: Evaluate rules against each land (in-memory dedup)
    // =========================================================
    let totalAlerts = 0;
    let totalRulesFired = 0;
    let totalRulesEvaluated = 0;
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
      totalRulesEvaluated += applicableRules.length;

      for (const rule of applicableRules) {
        // D7 — Environmental Intelligence rules resolve derived.* / active_episodes.
        // Legacy rules keep their existing evaluation path untouched.
        const isEnvRule = isEnvIntelligenceRule(rule.conditions);
        let envPhase: string | null = null;
        let result: RuleEvalResult;
        if (isEnvRule) {
          const envRes = evaluateEnvRule(rule.rule_code, rule.conditions, {
            crop_code: ctx.crop_code,
            derived: ctx.derived,
            weather: { ...ctx.weather, rain_probability: ctx.forecast_rain_probability_72h },
            forecast: { tmax_mean_5d: ctx.forecast_tmax_mean_5d },
          });
          envPhase = envRes.episodePhase;
          result = { fired: envRes.fired, riskScore: envRes.riskScore, confidence: envRes.confidence, reasoning: envRes.reasoning, triggerData: envRes.triggerData };
          console.log(`[ENV_RULE_EVAL] land=${ctx.land_id.slice(0,8)} rule=${rule.rule_code} fired=${envRes.fired} reason=${envRes.reasoning}`);
        } else {
          result = evaluateRule(rule, ctx);
        }
        if (!result.fired) continue;
        totalRulesFired++;

        // Episode-driven rules fire only on phase TRANSITIONS (never every tick)
        if (isEnvRule && rule.conditions?.metadata?.episode_driven === true) {
          const lastPhase = lastAlertPhase(rule.rule_code, ctx.land_id, alertMap);
          if (lastPhase && envPhase && lastPhase === envPhase) {
            console.log(`[ENV_RULE_EVAL] land=${ctx.land_id.slice(0,8)} rule=${rule.rule_code} suppressed: phase unchanged (${envPhase})`);
            continue;
          }
        }

        // In-memory dedup check
        const dedupKey = isEnvRule && envPhase
          ? `${rule.rule_code}:${ctx.land_id}:${envPhase}:${todayStr}`
          : `${rule.rule_code}:${ctx.land_id}:${todayStr}`;
        if (isDuplicate(dedupKey, rule.rule_code, ctx.land_id, rule.cooldown_hours || 24, alertMap)) continue;

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
          trigger_data: applyFarmerVisibilityGuard(
            addSymbolicSolution(
              enrichTriggerDataWithIrrigation(result.triggerData, rule.alert_category, ctx),
              null, rule, ctx, decisionRules
            ),
            farmerVisibility,
            'farmer',
          ),
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
      totalRulesEvaluated += applicableDecisionRules.length;

      // Sort by priority (lower = higher priority)
      applicableDecisionRules.sort((a, b) => (a.priority || 99) - (b.priority || 99));

      for (const dr of applicableDecisionRules) {
        const result = evaluateDecisionRule(dr, ctx);
        if (!result.fired) continue;
        totalRulesFired++;

        const dedupKey = `DR:${dr.condition_code}:${ctx.land_id}:${todayStr}`;
        if (isDuplicate(dedupKey, dr.condition_code, ctx.land_id, 24, alertMap)) continue;

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
          trigger_data: addSymbolicSolution(
            enrichTriggerDataWithIrrigation({ ...result.triggerData, knowledge: dr.knowledge_text, decision_rule_id: dr.id }, alertCategory, ctx),
            dr, null, ctx, decisionRules
          ),
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
        .upsert(alertsToInsert, { onConflict: 'dedup_key', ignoreDuplicates: true })
        .select('id, risk_score, priority, alert_category, trigger_data, message_en, action_text_en, title_mr, message_mr');
      if (alErr) console.error('[ProactiveEvaluator] Alerts upsert error:', alErr.message);
      
      // Async neural enrichment for high-risk alerts (non-blocking — fire and forget)
      if (LOVABLE_API_KEY && insertedAlerts && insertedAlerts.length > 0) {
        enrichAndUpdateAlerts(supabase, insertedAlerts).catch(e => 
          console.warn('[NeuralEnrichment] Background enrichment failed:', e.message)
        );
      }
    }

    // =========================================================
    // STEP 7: Return tenant result
    // =========================================================
    return { alerts: totalAlerts, lands: landContexts.length, rulesFired: totalRulesFired, rulesEvaluated: totalRulesEvaluated };
}

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

/**
 * Haversine distance in kilometers between two lat/lon points.
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Per-land weather lookup using exact location_key first, then geo-proximity within
 * 55 km on observations newer than 6 hours. Returns a Map keyed by land_id.
 *
 * Aligned with the AI Chat policy in mem://weather/live-weather-context-resolution
 * (proximity lookup) so all surfaces of the app see the same temperature/humidity.
 */
async function batchLoadWeatherByLand(
  supabase: any,
  lands: Array<{ id: string; center_lat: number | null; center_lon: number | null }>,
): Promise<Map<string, { temp: number | null; humidity: number | null; rain_mm: number | null; wind_speed: number | null; description: string | null; source: 'exact' | 'proximity' | 'unavailable'; distance_km: number | null; age_hours: number | null }>> {
  const result = new Map();
  const FRESHNESS_HOURS = 6;
  const MAX_KM = 55;
  const BBOX_DEG = 0.5; // ≈ 55 km at this latitude band

  // Collect candidate keys (exact-match fast path)
  const exactKeys = new Set<string>();
  for (const land of lands) {
    if (land.center_lat != null && land.center_lon != null) {
      exactKeys.add(makeLocationKey(land.center_lat, land.center_lon));
    }
  }

  const freshCutoff = new Date(Date.now() - FRESHNESS_HOURS * 60 * 60 * 1000).toISOString();

  // Pull all candidate observations once: by exact key OR by global lat/lon bbox of all lands.
  // We build the bbox as the union of every land's ±0.5° window.
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const land of lands) {
    if (land.center_lat == null || land.center_lon == null) continue;
    minLat = Math.min(minLat, land.center_lat - BBOX_DEG);
    maxLat = Math.max(maxLat, land.center_lat + BBOX_DEG);
    minLon = Math.min(minLon, land.center_lon - BBOX_DEG);
    maxLon = Math.max(maxLon, land.center_lon + BBOX_DEG);
  }

  const obsRows: any[] = [];

  // 1. Fresh observations within bounding box (proximity candidates)
  if (Number.isFinite(minLat)) {
    const { data: bboxData, error: bboxErr } = await supabase
      .from('weather_current')
      .select('location_key, latitude, longitude, temperature_celsius, humidity_percent, rain_1h_mm, wind_speed_kmh, weather_description, observation_time')
      .gte('observation_time', freshCutoff)
      .gte('latitude', minLat)
      .lte('latitude', maxLat)
      .gte('longitude', minLon)
      .lte('longitude', maxLon)
      .order('observation_time', { ascending: false })
      .limit(500);
    if (bboxErr) {
      console.error('[batchLoadWeatherByLand] bbox query error:', bboxErr.message);
    } else if (bboxData) {
      obsRows.push(...bboxData);
    }
  }

  // 2. If a row has no latitude/longitude column populated, fall back to parsing location_key
  for (const r of obsRows) {
    if ((r.latitude == null || r.longitude == null) && typeof r.location_key === 'string') {
      const parts = r.location_key.split(',');
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          r.latitude = lat;
          r.longitude = lon;
        }
      }
    }
  }

  // 3. For each land, pick exact match (if fresh) else nearest fresh row within 55 km
  const now = Date.now();
  for (const land of lands) {
    if (land.center_lat == null || land.center_lon == null) {
      result.set(land.id, { temp: null, humidity: null, rain_mm: null, wind_speed: null, description: null, source: 'unavailable' as const, distance_km: null, age_hours: null });
      continue;
    }
    const exactKey = makeLocationKey(land.center_lat, land.center_lon);

    // Exact match (still must be fresh)
    let best: { row: any; distKm: number; isExact: boolean } | null = null;
    for (const row of obsRows) {
      if (row.location_key === exactKey) {
        best = { row, distKm: 0, isExact: true };
        break;
      }
    }

    // Nearest match within 55 km
    if (!best) {
      for (const row of obsRows) {
        if (row.latitude == null || row.longitude == null) continue;
        const d = haversineKm(land.center_lat, land.center_lon, row.latitude, row.longitude);
        if (d > MAX_KM) continue;
        if (!best || d < best.distKm) {
          best = { row, distKm: d, isExact: false };
        }
      }
    }

    if (best) {
      const ageHours = best.row.observation_time
        ? (now - new Date(best.row.observation_time).getTime()) / (1000 * 60 * 60)
        : null;
      result.set(land.id, {
        temp: best.row.temperature_celsius,
        humidity: best.row.humidity_percent,
        rain_mm: best.row.rain_1h_mm,
        wind_speed: best.row.wind_speed_kmh,
        description: best.row.weather_description,
        source: best.isExact ? 'exact' : 'proximity',
        distance_km: best.isExact ? 0 : Math.round(best.distKm * 10) / 10,
        age_hours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
      });
    } else {
      result.set(land.id, { temp: null, humidity: null, rain_mm: null, wind_speed: null, description: null, source: 'unavailable' as const, distance_km: null, age_hours: null });
    }
  }

  return result;
}

// Legacy key-only path retained for forecast/GDD code that already keys by location_key.
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
  
  // Fix 3: Try weather_daily_aggregate first for pre-computed GDD
  const { data: dailyData } = await supabase
    .from('weather_daily_aggregate')
    .select('location_key, gdd, temp_max_c, temp_min_c')
    .in('location_key', locationKeys)
    .gte('date', thirtyDaysAgo.split('T')[0]);

  if (dailyData && dailyData.length > 0) {
    for (const d of dailyData) {
      if (!d.location_key) continue;
      let gdd = d.gdd;
      if (gdd == null && d.temp_max_c != null && d.temp_min_c != null) {
        gdd = Math.max(0, (d.temp_max_c + d.temp_min_c) / 2 - 10);
      }
      if (gdd != null && gdd > 0) {
        map.set(d.location_key, (map.get(d.location_key) || 0) + gdd);
      }
    }
    if (map.size > 0) return map;
  }

  // Fallback: weather_forecasts
  const { data } = await supabase
    .from('weather_forecasts')
    .select('location_key, growing_degree_days, temperature_max_celsius, temperature_min_celsius')
    .in('location_key', locationKeys)
    .gte('forecast_time', thirtyDaysAgo);

  if (data) {
    for (const f of data) {
      if (!f.location_key) continue;
      let gdd = f.growing_degree_days;
      if (gdd == null && f.temperature_max_celsius != null && f.temperature_min_celsius != null) {
        gdd = Math.max(0, (f.temperature_max_celsius + f.temperature_min_celsius) / 2 - 10);
      }
      if (gdd != null && gdd > 0) {
        map.set(f.location_key, (map.get(f.location_key) || 0) + gdd);
      }
    }
  }

  // Fallback: compute from weather_current if still empty
  if (map.size === 0) {
    const { data: currentData } = await supabase
      .from('weather_current')
      .select('location_key, temperature_celsius')
      .in('location_key', locationKeys);
    if (currentData) {
      for (const c of currentData) {
        if (c.temperature_celsius != null) {
          // Rough daily GDD estimate from current temp × 30 days
          const dailyGDD = Math.max(0, c.temperature_celsius - 10);
          map.set(c.location_key, dailyGDD * 30);
        }
      }
    }
  }

  return map;
}

function nullWeather() {
  return { temp: null, humidity: null, rain_mm: null, wind_speed: null, description: null, source: 'unavailable' as const, distance_km: null, age_hours: null };
}

// =====================================================
// IN-MEMORY DEDUP + COOLDOWN (G4)
// =====================================================

/** Last stored episode phase for an episode-driven rule on this land (transition gating). */
function lastAlertPhase(ruleCode: string, landId: string, alertMap: Map<string, any[]>): string | null {
  const landAlerts = (alertMap.get(landId) || [])
    .filter(a => a.rule_id === ruleCode)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const phase = landAlerts[0]?.trigger_data?.episode?.phase;
  return phase ? String(phase) : null;
}

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
  if (upper.includes('SUGARCANE') || upper.includes('ऊस') || upper.includes('गन्ना') || upper.includes('ईख') || upper === 'SC') return 'SUGARCANE';
  if (upper.includes('WHEAT') || upper.includes('गहू') || upper.includes('गेहूं') || upper.includes('गेहूँ') || upper === 'WH') return 'WHEAT';
  if (upper.includes('COTTON') || upper.includes('कापूस') || upper.includes('कपास') || upper.includes('रुई') || upper === 'CT') return 'COTTON';
  if (upper.includes('RICE') || upper.includes('भात') || upper.includes('तांदूळ') || upper.includes('धान') || upper.includes('चावल') || upper === 'RC') return 'RICE';
  if (upper.includes('SOYBEAN') || upper.includes('सोयाबीन') || upper.includes('सोयाबिन') || upper === 'SB') return 'SOYBEAN';
  if (upper.includes('ONION') || upper.includes('कांदा') || upper.includes('प्याज') || upper === 'ON') return 'ONION';
  if (upper.includes('TURMERIC') || upper.includes('हळद') || upper.includes('हल्दी') || upper === 'TU') return 'TURMERIC';
  if (upper.includes('GRAPE') || upper.includes('द्राक्ष') || upper.includes('अंगूर') || upper === 'GR') return 'GRAPE';
  if (upper.includes('MAIZE') || upper.includes('CORN') || upper.includes('मका') || upper.includes('मक्का') || upper === 'MZ') return 'MAIZE';
  if (upper.includes('GROUNDNUT') || upper.includes('PEANUT') || upper.includes('भुईमूग') || upper.includes('मूंगफली') || upper === 'GN') return 'GROUNDNUT';
  if (upper.includes('BANANA') || upper.includes('केळी') || upper.includes('केला') || upper === 'BN') return 'BANANA';
  if (upper.includes('POMEGRANATE') || upper.includes('डाळिंब') || upper.includes('अनार') || upper === 'PM') return 'POMEGRANATE';
  if (upper.includes('CHILLI') || upper.includes('CHILI') || upper.includes('मिरची') || upper.includes('मिर्च') || upper === 'CH') return 'CHILLI';
  if (upper.includes('TOMATO') || upper.includes('टोमॅटो') || upper.includes('टमाटर') || upper === 'TM') return 'TOMATO';
  if (upper.includes('POTATO') || upper.includes('बटाटा') || upper.includes('आलू') || upper === 'PT') return 'POTATO';
  if (upper.includes('MANGO') || upper.includes('आंबा') || upper.includes('आम') || upper === 'MG') return 'MANGO';
  if (upper.includes('RAJMA') || upper.includes('राजमा') || upper.includes('KIDNEY BEAN')) return 'RAJMA';
  return upper;
}

// =====================================================
// SOIL TYPE NORMALIZATION
// Agronomy lookups (SOIL_INFILTRATION_CAPS, SOIL_TYPE_EFFECTIVE_RAIN, the
// soil-water factor below) are keyed on lowercase underscore codes. Free-form
// values such as 'Red Soil' used to fall through to the default silently.
// =====================================================
export function normalizeSoilType(s: string | null | undefined): string | null {
  if (!s) return null;
  const base = String(s).toLowerCase().trim().replace(/\s+/g, '_');
  if (!base) return null;
  const MAP: Record<string, string> = {
    black_soil: 'black',
    red_soil: 'red',
    black_cotton_soil: 'black_cotton',
  };
  return MAP[base] ?? base;
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

  // FIX 2: Category-based fallback evaluation when no parseable conditions matched
  if (condTotal === 0) {
    // Secondary evaluation path: use category + environmental cross-checks
    const cat = dr.category?.toLowerCase() || '';
    const stageMatch = dr.stage_applicable && ctx.current_stage
      ? dr.stage_applicable.some(s => s === ctx.current_stage || s === 'ALL')
      : false;

    // Disease rules: humidity > 75% + temp 20-35°C → favorable for fungal/bacterial disease
    if ((cat === 'disease' || cat === 'proactive_monitoring') && ctx.weather.humidity != null && ctx.weather.temp != null) {
      if (ctx.weather.humidity > 75 && ctx.weather.temp >= 20 && ctx.weather.temp <= 35) {
        const conf = stageMatch ? 0.55 : 0.40;
        reasons.push(`Disease-favorable: humidity ${ctx.weather.humidity}% >75%, temp ${ctx.weather.temp}°C`);
        if (stageMatch) reasons.push(`Stage match: ${ctx.current_stage}`);
        triggerData.humidity = ctx.weather.humidity;
        triggerData.temp = ctx.weather.temp;
        return { fired: true, riskScore: 55, confidence: conf, reasoning: reasons.join('; '), triggerData };
      }
    }

    // Pest rules: warm temps + GDD threshold or DAS within susceptible window
    if ((cat === 'pest' || cat === 'ipm' || cat === 'proactive_pest') && ctx.weather.temp != null) {
      const warmEnough = ctx.weather.temp >= 25;
      const gddSignal = ctx.gdd_accumulated != null && ctx.gdd_accumulated > 300;
      const dasWindow = ctx.das >= 30 && ctx.das <= 250; // most pest-susceptible window
      if (warmEnough && (gddSignal || dasWindow) && stageMatch) {
        reasons.push(`Pest-favorable: temp ${ctx.weather.temp}°C, DAS ${ctx.das}, GDD ${ctx.gdd_accumulated ?? 'N/A'}`);
        triggerData.temp = ctx.weather.temp;
        triggerData.das = ctx.das;
        return { fired: true, riskScore: 50, confidence: 0.45, reasoning: reasons.join('; '), triggerData };
      }
    }

    // Nutrition rules: stage-based fertilizer windows
    if ((cat === 'nutrition' || cat === 'nutrient') && stageMatch && ctx.das > 0) {
      reasons.push(`Nutrition window: stage ${ctx.current_stage}, DAS ${ctx.das}`);
      if (ctx.soil_n != null) { triggerData.soil_n = ctx.soil_n; reasons.push(`Soil N: ${ctx.soil_n}`); }
      if (ctx.soil_p != null) { triggerData.soil_p = ctx.soil_p; }
      if (ctx.soil_k != null) { triggerData.soil_k = ctx.soil_k; }
      return { fired: true, riskScore: 45, confidence: 0.50, reasoning: reasons.join('; '), triggerData };
    }

    // Irrigation rules: high temp + low humidity or forecast rain
    if ((cat === 'irrigation' || cat === 'proactive_irrigation') && ctx.weather.temp != null) {
      const highTemp = ctx.weather.temp >= 32;
      const lowHumidity = ctx.weather.humidity != null && ctx.weather.humidity < 40;
      const noForecastRain = ctx.forecast_rain_probability_72h != null && ctx.forecast_rain_probability_72h < 20;
      if (highTemp && (lowHumidity || noForecastRain)) {
        reasons.push(`Irrigation needed: temp ${ctx.weather.temp}°C, humidity ${ctx.weather.humidity ?? '--'}%, rain prob ${ctx.forecast_rain_probability_72h ?? '--'}%`);
        triggerData.temp = ctx.weather.temp;
        return { fired: true, riskScore: 60, confidence: 0.55, reasoning: reasons.join('; '), triggerData };
      }
    }

    return { fired: false, riskScore: 0, confidence: 0, reasoning: '', triggerData };
  }

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
  const highRisk = insertedAlerts.filter(a => a.risk_score >= 50 || a.priority === 'CRITICAL' || a.priority === 'HIGH');
  if (highRisk.length === 0 || !LOVABLE_API_KEY) return;

  const toEnrich = highRisk.slice(0, 8);

  for (const alert of toEnrich) {
    try {
      const prompt = `You are a world-class Indian agronomist (25 years experience). Generate a DETAILED, structured advisory for a rural farmer based on this alert data.

Context:
- Alert Category: ${alert.alert_category}
- Priority: ${alert.priority}
- Risk Score: ${alert.risk_score}
- Evidence: ${JSON.stringify(alert.trigger_data)}
- Current message: ${alert.message_en}
- Land: ${alert.title_mr || 'Field'}

Return JSON with these fields:
{
  "title_mr": "Marathi title (max 15 words, simple rural language)",
  "title_hi": "Hindi title (max 15 words)",
  "title_en": "English title (max 15 words)",
  "message_mr": "Detailed Marathi message - include SPECIFIC action steps, product names if applicable, quantities for the farmer's field size, timing. Min 50 words, max 120 words. Use simple rural Marathi.",
  "message_hi": "Detailed Hindi message - same detail level. Min 50 words, max 120 words. Simple rural Hindi.",
  "message_en": "Detailed English message - same detail level. Min 50 words, max 120 words.",
  "action_mr": "Primary action step in Marathi with specific quantity/timing (max 30 words)",
  "action_hi": "Primary action step in Hindi with specific quantity/timing (max 30 words)",
  "action_en": "Primary action step in English with specific quantity/timing (max 30 words)",
  "solution": {
    "problem_en": "What is happening to the crop (1-2 sentences)",
    "problem_mr": "मराठी मध्ये समस्या",
    "problem_hi": "हिंदी में समस्या",
    "cause_en": "Why this is happening based on evidence data",
    "cause_mr": "कारण मराठीत",
    "cause_hi": "कारण हिंदी में",
    "steps_en": ["Step 1 with specific product/dosage", "Step 2 with timing", "Step 3 if applicable"],
    "steps_mr": ["मराठीत पायरी 1", "पायरी 2", "पायरी 3"],
    "steps_hi": ["हिंदी में कदम 1", "कदम 2", "कदम 3"],
    "safety_en": "Safety precautions if chemicals involved, otherwise general field safety",
    "safety_mr": "सुरक्षा मराठीत",
    "safety_hi": "सुरक्षा हिंदी में",
    "organic_alt_en": "Organic/natural alternative if available",
    "organic_alt_mr": "सेंद्रिय पर्याय",
    "organic_alt_hi": "जैविक विकल्प",
    "expected_benefit_en": "What farmer should expect after following advice",
    "expected_benefit_mr": "अपेक्षित फायदा",
    "expected_benefit_hi": "अपेक्षित लाभ",
    "followup_en": "When to check again and what to look for",
    "followup_mr": "पुन्हा कधी तपासायचे",
    "followup_hi": "दोबारा कब जांचें"
  }
}

CRITICAL RULES:
- Be SPECIFIC: "Apply 2ml Chlorpyrifos 20EC per liter of water, spray on stems" NOT "use pesticide"
- Include quantities relative to field area from evidence data
- Use trade names farmers know, with active ingredient in brackets
- Give calendar-specific timing: "Today before 5pm" or "Tomorrow 6-8am"
- Safety warnings are MANDATORY for any chemical suggestion
- If the alert is about irrigation, use the irrigation data from evidence to give exact liters and hours`;

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
      // FIX 3: Protect symbolic data — neural enrichment only fills NULL/empty fields
      const updateData: Record<string, any> = {};
      if (enriched.title_mr && !alert.title_mr) updateData.title_mr = enriched.title_mr;
      if (enriched.title_hi && !alert.title_hi) updateData.title_hi = enriched.title_hi;
      if (enriched.title_en && !alert.title_en) updateData.title_en = enriched.title_en;
      if (enriched.message_mr && !alert.message_mr) updateData.message_mr = enriched.message_mr;
      if (enriched.message_hi && !alert.message_hi) updateData.message_hi = enriched.message_hi;
      if (enriched.message_en && !alert.message_en) updateData.message_en = enriched.message_en;
      if (enriched.action_mr && !alert.action_text_mr) updateData.action_text_mr = enriched.action_mr;
      if (enriched.action_hi && !alert.action_text_hi) updateData.action_text_hi = enriched.action_hi;
      if (enriched.action_en && !alert.action_text_en) updateData.action_text_en = enriched.action_en;
      
      // Fix 2: Protect symbolic solution — neural enrichment only fills NULL fields
      if (enriched.solution) {
        const existingTriggerData = alert.trigger_data || {};
        if (existingTriggerData.solution) {
          // Symbolic solution exists — preserve it, only fill gaps
          const merged = { ...existingTriggerData.solution };
          for (const [k, v] of Object.entries(enriched.solution)) {
            if (!merged[k] || merged[k] === '') merged[k] = v;
          }
          updateData.trigger_data = { ...existingTriggerData, solution: merged };
        } else {
          updateData.trigger_data = { ...existingTriggerData, solution: enriched.solution };
        }
      }

      await supabase.from('proactive_alerts').update(updateData).eq('id', alert.id);
      console.log(`[NeuralEnrichment] Enriched alert ${alert.id} with detailed solution`);
    } catch (e) {
      console.warn('[NeuralEnrichment] Error:', e.message);
    }
  }
}

// =====================================================
// IRRIGATION-ENRICHED TRIGGER DATA
// =====================================================

function enrichTriggerDataWithIrrigation(triggerData: Record<string, any>, alertCategory: string, ctx: LandContext): Record<string, any> {
  const irrigationCategories = ['CROP_STRESS', 'IRRIGATION', 'WEATHER_WARNING', 'STAGE_ADVISORY'];
  const hasNdviDrop = triggerData.drop != null || triggerData.ndvi != null;
  
  if (irrigationCategories.includes(alertCategory) || hasNdviDrop) {
    const irrigation = calculateIrrigationForLand(ctx);
    if (irrigation) {
      triggerData.irrigation = irrigation;
    }
  }
  
  // Always add land context to trigger_data
  if (ctx.name) triggerData.land_name = ctx.name;
  if (ctx.area_acres) triggerData.area_acres = ctx.area_acres;
  if (ctx.soil_type) triggerData.soil_type = ctx.soil_type;
  if (ctx.irrigation_type) triggerData.irrigation_method = ctx.irrigation_type;
  
  return triggerData;
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

const IRRIGATION_METHOD_MR: Record<string, string> = {
  DRIP: 'ठिबक सिंचन', SPRINKLER: 'तुषार सिंचन', FLOOD: 'पाट पाणी', FURROW: 'सरी सिंचन', SURFACE: 'पृष्ठभाग सिंचन',
};
const IRRIGATION_METHOD_HI: Record<string, string> = {
  DRIP: 'ड्रिप सिंचाई', SPRINKLER: 'स्प्रिंकलर सिंचाई', FLOOD: 'बाढ़ सिंचाई', FURROW: 'नाली सिंचाई', SURFACE: 'सतही सिंचाई',
};

function generateTrilingualTitle(category: string, alertCategory: string, ctx: LandContext): { mr: string; hi: string } {
  const templates = CATEGORY_TITLES[alertCategory] || CATEGORY_TITLES.GENERAL;
  const landMr = ctx.land_name || 'शेत';
  const landHi = ctx.land_name || 'खेत';
  const areaSuffix = ctx.area_acres ? ` (${ctx.area_acres} एकर)` : '';
  return {
    mr: `${templates.mr} - ${landMr}${areaSuffix}`,
    hi: `${templates.hi} - ${landHi}${areaSuffix}`,
  };
}

function generateTrilingualMessage(category: string, messageEn: string, ctx: LandContext): { mr: string; hi: string } {
  const landMr = ctx.land_name || 'तुमच्या शेतात';
  const landHi = ctx.land_name || 'आपके खेत में';
  const areaMr = ctx.area_acres ? ` (${ctx.area_acres} एकर)` : '';
  const areaHi = ctx.area_acres ? ` (${ctx.area_acres} एकर)` : '';
  
  // If irrigation data is calculable, include it in the message
  const irrigation = calculateIrrigationForLand(ctx);
  if (irrigation && (mapDecisionCategory(category) === 'IRRIGATION' || mapDecisionCategory(category) === 'CROP_STRESS')) {
    const methodMr = IRRIGATION_METHOD_MR[irrigation.method] || irrigation.method;
    const methodHi = IRRIGATION_METHOD_HI[irrigation.method] || irrigation.method;
    const wxMr = weatherEvidenceLine(ctx, 'mr');
    const wxHi = weatherEvidenceLine(ctx, 'hi');
    return {
      mr: `"${landMr}"${areaMr} शेतात ${methodMr}ने ${irrigation.water_liters_total.toLocaleString()} लिटर पाणी द्या (${irrigation.duration_hours} तास).${wxMr ? ' ' + wxMr : ''}`,
      hi: `"${landHi}"${areaHi} खेत में ${methodHi} से ${irrigation.water_liters_total.toLocaleString()} लीटर पानी दें (${irrigation.duration_hours} घंटे).${wxHi ? ' ' + wxHi : ''}`,
    };
  }
  
  const catTitleMr = CATEGORY_TITLES[mapDecisionCategory(category)]?.mr || 'सूचना';
  const catTitleHi = CATEGORY_TITLES[mapDecisionCategory(category)]?.hi || 'सूचना';
  const wxMr2 = weatherEvidenceLine(ctx, 'mr');
  const wxHi2 = weatherEvidenceLine(ctx, 'hi');
  return {
    mr: `"${landMr}"${areaMr} - ${catTitleMr}.${wxMr2 ? ' ' + wxMr2 : ''} शेताची तपासणी करा.`,
    hi: `"${landHi}"${areaHi} - ${catTitleHi}.${wxHi2 ? ' ' + wxHi2 : ''} खेत की जांच करें.`,
  };
}

function generateTrilingualAction(category: string, actionEn: string | null, ctx: LandContext): { mr: string; hi: string } {
  const alertCat = mapDecisionCategory(category);
  
  // For irrigation-related categories, provide specific action with water quantity
  const irrigation = calculateIrrigationForLand(ctx);
  if (irrigation && (alertCat === 'IRRIGATION' || alertCat === 'CROP_STRESS')) {
    const methodMr = IRRIGATION_METHOD_MR[irrigation.method] || irrigation.method;
    const methodHi = IRRIGATION_METHOD_HI[irrigation.method] || irrigation.method;
    return {
      mr: `${methodMr}ने ${irrigation.water_liters_per_acre.toLocaleString()} लिटर/एकर पाणी द्या (${irrigation.duration_hours} तास)`,
      hi: `${methodHi} से ${irrigation.water_liters_per_acre.toLocaleString()} लीटर/एकर पानी दें (${irrigation.duration_hours} घंटे)`,
    };
  }
  
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
// SYMBOLIC SOLUTION BUILDER — from decision_rules (SSOT)
// =====================================================

function addSymbolicSolution(
  triggerData: Record<string, any>,
  dr: DecisionRuleProactive | null,
  rule: ProactiveRule | null,
  ctx: LandContext,
  allDecisionRules: DecisionRuleProactive[]
): Record<string, any> {
  // If we already have a solution (from previous enrichment), keep it
  if (triggerData.solution) return triggerData;

  let sourceRule = dr;

  // For proactive_rules, find best matching decision_rule
  if (!sourceRule && rule) {
    sourceRule = findBestMatchingDecisionRule(rule, ctx, allDecisionRules);
  }

  const solution = buildSolutionFromSymbolicData(sourceRule, ctx, triggerData);
  triggerData.solution = solution;
  return triggerData;
}

function findBestMatchingDecisionRule(
  rule: ProactiveRule,
  ctx: LandContext,
  decisionRules: DecisionRuleProactive[]
): DecisionRuleProactive | null {
  const candidates = decisionRules.filter(dr => {
    // Must match crop
    if (dr.crop_code && ctx.crop_code && dr.crop_code !== ctx.crop_code) return false;
    // Must match stage if specified
    if (dr.stage_applicable?.length && ctx.current_stage) {
      if (!dr.stage_applicable.includes(ctx.current_stage) && !dr.stage_applicable.includes('ALL')) return false;
    }
    // Match by category mapping
    const drAlertCat = mapDecisionCategory(dr.category);
    if (rule.alert_category === drAlertCat) return true;
    // Match by condition code keywords
    const cc = dr.condition_code.toUpperCase();
    if (rule.condition_type === 'NDVI' && (cc.includes('STRESS') || cc.includes('NDVI') || cc.includes('WATER') || cc.includes('DROUGHT'))) return true;
    if (rule.condition_type === 'WEATHER' && (cc.includes('WEATHER') || cc.includes('RAIN') || cc.includes('HEAT'))) return true;
    if (rule.condition_type === 'DISEASE_RISK' && (cc.includes('DISEASE') || cc.includes('BLIGHT') || cc.includes('SMUT') || cc.includes('RUST'))) return true;
    if (rule.condition_type === 'PEST_RISK' && (cc.includes('PEST') || cc.includes('BORER') || cc.includes('INSECT'))) return true;
    if (rule.condition_type === 'SOIL' && (cc.includes('NUTRIENT') || cc.includes('NITROGEN') || cc.includes('PHOSPHORUS'))) return true;
    return false;
  });

  if (candidates.length === 0) return null;
  // Sort by priority (lower = higher priority)
  candidates.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  return candidates[0];
}

// =====================================================
// CROP NAME LOCALIZATION (no ALL_CAPS in farmer text)
// Per mem://architecture/canonical-language-governance and
// mem://logic/multilingual-crop-synonym-detection
// =====================================================
const CROP_LABEL: Record<string, { mr: string; hi: string; en: string }> = {
  SUGARCANE: { mr: 'ऊस', hi: 'गन्ना', en: 'sugarcane' },
  RICE:      { mr: 'भात', hi: 'चावल', en: 'rice' },
  WHEAT:     { mr: 'गहू', hi: 'गेहूं', en: 'wheat' },
  COTTON:    { mr: 'कापूस', hi: 'कपास', en: 'cotton' },
  MAIZE:     { mr: 'मका', hi: 'मक्का', en: 'maize' },
  SOYBEAN:   { mr: 'सोयाबीन', hi: 'सोयाबीन', en: 'soybean' },
  TOMATO:    { mr: 'टोमॅटो', hi: 'टमाटर', en: 'tomato' },
  ONION:     { mr: 'कांदा', hi: 'प्याज', en: 'onion' },
  POTATO:    { mr: 'बटाटा', hi: 'आलू', en: 'potato' },
  GROUNDNUT: { mr: 'भुईमूग', hi: 'मूंगफली', en: 'groundnut' },
  CHILLI:    { mr: 'मिरची', hi: 'मिर्च', en: 'chilli' },
  TURMERIC:  { mr: 'हळद', hi: 'हल्दी', en: 'turmeric' },
  BANANA:    { mr: 'केळी', hi: 'केला', en: 'banana' },
  GRAPE:     { mr: 'द्राक्ष', hi: 'अंगूर', en: 'grape' },
  PIGEONPEA: { mr: 'तूर', hi: 'अरहर', en: 'pigeonpea' },
  RAJMA:     { mr: 'राजमा', hi: 'राजमा', en: 'rajma' },
};

function cropLabel(code: string | null | undefined, lang: 'mr' | 'hi' | 'en'): string {
  if (!code) return lang === 'mr' ? 'पीक' : lang === 'hi' ? 'फसल' : 'crop';
  const upper = code.toUpperCase().trim();
  const entry = CROP_LABEL[upper];
  if (entry) return entry[lang];
  return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase();
}

/** One-line weather evidence in the requested language. Returns '' if no live data. */
function weatherEvidenceLine(ctx: LandContext, lang: 'mr' | 'hi' | 'en'): string {
  const w = ctx.weather;
  if (w.source === 'unavailable' || w.temp == null) return '';
  const temp = Math.round(w.temp);
  const hum = w.humidity != null ? Math.round(w.humidity) : null;
  const distTag = w.source === 'proximity' && w.distance_km != null && w.distance_km > 1
    ? (lang === 'mr' ? ` (≈ ${w.distance_km} किमी जवळचे केंद्र)` : lang === 'hi' ? ` (≈ ${w.distance_km} किमी नजदीकी केंद्र)` : ` (≈ ${w.distance_km} km nearby station)`)
    : '';
  if (lang === 'mr') return hum != null ? `आजचे हवामान: ${temp}°C, आर्द्रता ${hum}%${distTag}.` : `आजचे हवामान: ${temp}°C${distTag}.`;
  if (lang === 'hi') return hum != null ? `आज का मौसम: ${temp}°C, नमी ${hum}%${distTag}.` : `आज का मौसम: ${temp}°C${distTag}.`;
  return hum != null ? `Today's weather: ${temp}°C, humidity ${hum}%${distTag}.` : `Today's weather: ${temp}°C${distTag}.`;
}

function weatherUnavailableLine(lang: 'mr' | 'hi' | 'en'): string {
  if (lang === 'mr') return 'आजची हवामान माहिती सध्या उपलब्ध नाही.';
  if (lang === 'hi') return 'आज की मौसम जानकारी अभी उपलब्ध नहीं है.';
  return 'Live weather data is currently unavailable for this field.';
}

const AGRO_TERM_MR: Record<string, string> = {
  'irrigate': 'पाणी द्या', 'irrigation': 'सिंचन', 'spray': 'फवारणी करा',
  'apply': 'द्या', 'inspect': 'तपासणी करा', 'inspection': 'तपासणी',
  'check': 'तपासा', 'monitor': 'निरीक्षण करा', 'field': 'शेत',
  'soil': 'माती', 'moisture': 'ओलावा', 'fertilizer': 'खत',
  'nitrogen': 'नायट्रोजन', 'urea': 'युरिया', 'pest': 'कीड',
  'disease': 'रोग', 'shoot borer': 'खोडकिडा', 'stem borer': 'खोडकिडा',
  'root grub': 'मूळ अळी', 'wilt': 'मर रोग', 'red rot': 'लाल कूज',
  'smut': 'काणी', 'leaf': 'पान',
  'within 24 hours': '२४ तासांत', 'within 48 hours': '४८ तासांत',
  'within 7 days': '७ दिवसांत',
};

const AGRO_TERM_HI: Record<string, string> = {
  'irrigate': 'पानी दें', 'irrigation': 'सिंचाई', 'spray': 'छिड़काव करें',
  'apply': 'डालें', 'inspect': 'जांच करें', 'inspection': 'जांच',
  'check': 'देखें', 'monitor': 'निगरानी करें', 'field': 'खेत',
  'soil': 'मिट्टी', 'moisture': 'नमी', 'fertilizer': 'खाद',
  'nitrogen': 'नाइट्रोजन', 'urea': 'यूरिया', 'pest': 'कीट',
  'disease': 'रोग', 'shoot borer': 'तना छेदक', 'stem borer': 'तना छेदक',
  'root grub': 'जड़ की सुंडी', 'wilt': 'उकठा', 'red rot': 'लाल सड़न',
  'smut': 'कण्डुआ', 'leaf': 'पत्ती',
  'within 24 hours': '24 घंटों में', 'within 48 hours': '48 घंटों में',
  'within 7 days': '7 दिनों में',
};

const IRRIGATION_METHOD_EN: Record<string, string> = {
  DRIP: 'drip irrigation', SPRINKLER: 'sprinkler irrigation', FLOOD: 'flood irrigation',
  FURROW: 'furrow irrigation', SURFACE: 'surface irrigation',
};

/**
 * Deterministically localize ONE English step from `decision_rules.action_text`.
 * No LLM — the brain is the SSOT (mem://architecture/symbolic-engine-strict-invariants).
 */
function localizeStep(stepEn: string, lang: 'mr' | 'hi'): string {
  const dict = lang === 'mr' ? AGRO_TERM_MR : AGRO_TERM_HI;
  let s = stepEn.replace(/^\s*\d+[.)]\s*/, '').trim();
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    s = s.replace(new RegExp(`\\b${key}\\b`, 'gi'), dict[key]);
  }
  for (const [code] of Object.entries(IRRIGATION_METHOD_EN)) {
    const replace = lang === 'mr' ? IRRIGATION_METHOD_MR[code] : IRRIGATION_METHOD_HI[code];
    if (replace) s = s.replace(new RegExp(`\\b${code}\\b`, 'g'), replace);
  }
  return s;
}

function buildSolutionFromSymbolicData(
  dr: DecisionRuleProactive | null,
  ctx: LandContext,
  triggerData: Record<string, any>
): Record<string, any> {
  const areaStr = ctx.area_acres ? `${ctx.area_acres} acres` : '';
  const areaMr = ctx.area_acres ? `${ctx.area_acres} एकर` : '';
  const areaHi = ctx.area_acres ? `${ctx.area_acres} एकड़` : '';
  const cropEn = ctx.crop_code || 'crop';
  const stage = ctx.current_stage || 'current stage';
  const landName = ctx.land_name || 'your field';

  // If no decision rule found, build from context data
  if (!dr) {
    return buildContextualSolution(ctx, triggerData);
  }

  // Parse action_text into steps
  const actionText = dr.action_text || '';
  const steps = actionText
    .split(/(?:\.\s+|\n|;)/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 10)
    .slice(0, 5);

  // Build area-specific steps (multiply per-acre dosages)
  const areaSpecificSteps = steps.map((step: string) => {
    if (ctx.area_acres && ctx.area_acres > 0) {
      // Look for per-acre patterns and add total
      const perAcreMatch = step.match(/(\d+(?:\.\d+)?)\s*(ml|g|kg|l|liter|litre)\s*(?:per|\/)\s*acre/i);
      if (perAcreMatch) {
        const qty = parseFloat(perAcreMatch[1]);
        const unit = perAcreMatch[2];
        const total = Math.round(qty * ctx.area_acres * 10) / 10;
        return `${step} (Total for ${ctx.area_acres} acres: ${total} ${unit})`;
      }
    }
    return step;
  });

  // Fix 4: Add specific product/dosage step from expanded DB columns
  if (dr.active_ingredient && dr.dosage_per_acre) {
    const doseMatch = dr.dosage_per_acre.match(/(\d+(?:\.\d+)?)\s*(ml|g|kg|l|liter|litre)/i);
    if (doseMatch && ctx.area_acres && ctx.area_acres > 0) {
      const qtyPerAcre = parseFloat(doseMatch[1]);
      const unit = doseMatch[2];
      const total = Math.round(qtyPerAcre * ctx.area_acres * 10) / 10;
      const waterVol = dr.water_volume_per_acre || '200 liters';
      const method = dr.application_method || 'foliar spray';
      const productStep = `Apply ${dr.active_ingredient}: ${qtyPerAcre} ${unit}/acre × ${ctx.area_acres} acres = ${total} ${unit} total, in ${waterVol} water via ${method}`;
      if (!areaSpecificSteps.some(s => s.toLowerCase().includes(dr.active_ingredient!.toLowerCase()))) {
        areaSpecificSteps.unshift(productStep);
      }
    }
  }

  const reasonText = dr.reason_text || '';
  const knowledgeText = dr.knowledge_text || '';
  const conditionName = dr.condition_code.replace(/_/g, ' ').toLowerCase();

  // Problem description
  const problemEn = reasonText.split('.')[0] || `${conditionName} detected on ${landName}`;

  // Cause from knowledge_text or reason_text
  const causeEn = knowledgeText
    ? knowledgeText.split('.').slice(0, 2).join('. ')
    : (reasonText.split('.').slice(1, 3).join('. ') || `Environmental conditions favor ${conditionName}`);

  // Safety (PHI + bee_toxicity + farmer_safety_level)
  let safetyEn = '';
  if (dr.phi_days) {
    safetyEn = `Pre-harvest interval: ${dr.phi_days} days. Do not harvest before this period after application.`;
  }
  if (dr.bee_toxicity && dr.bee_toxicity !== 'SAFE' && dr.bee_toxicity !== 'LOW') {
    safetyEn += safetyEn ? ' ' : '';
    safetyEn += `⚠️ Bee toxicity: ${dr.bee_toxicity}. Do not spray during flowering or when bees are active.`;
  }
  if (dr.farmer_safety_level && dr.farmer_safety_level !== 'SAFE') {
    safetyEn += safetyEn ? ' ' : '';
    safetyEn += 'Wear gloves, mask, and full-sleeve clothing during application. Do not eat, drink, or smoke while spraying.';
  } else if (actionText.toLowerCase().includes('spray') || actionText.toLowerCase().includes('insecticide') || actionText.toLowerCase().includes('fungicide')) {
    safetyEn += safetyEn ? ' ' : '';
    safetyEn += 'Wear gloves, mask, and full-sleeve clothing during application. Do not eat, drink, or smoke while spraying.';
  }

  // Organic alternative from DB column
  const organicAltEn = dr.organic_alternative || '';

  // Expected benefit
  const benefitEn = `Following these steps should help manage ${conditionName} on your ${areaStr} ${cropEn} field. Monitor after 5-7 days for improvement.`;

  // Followup
  const followupEn = `Check ${landName} after 5-7 days. Look for improvement in crop health indicators. If condition persists, consult local agricultural extension officer.`;

  // Build Marathi solution using CATEGORY_TITLES mapping
  const catMr = CATEGORY_TITLES[mapDecisionCategory(dr.category)]?.mr || 'सूचना';
  const catHi = CATEGORY_TITLES[mapDecisionCategory(dr.category)]?.hi || 'सूचना';

  // Irrigation data if available
  const irrigation = triggerData.irrigation;
  let irrigationStepMr = '';
  let irrigationStepHi = '';
  let irrigationStepEn = '';
  if (irrigation) {
    const methodMr = IRRIGATION_METHOD_MR[irrigation.method] || irrigation.method;
    const methodHi = IRRIGATION_METHOD_HI[irrigation.method] || irrigation.method;
    irrigationStepEn = `Irrigate with ${irrigation.water_liters_total.toLocaleString()} liters via ${irrigation.method} (${irrigation.duration_hours} hrs)`;
    irrigationStepMr = `${methodMr}ने ${irrigation.water_liters_total.toLocaleString()} लिटर पाणी द्या (${irrigation.duration_hours} तास)`;
    irrigationStepHi = `${methodHi} से ${irrigation.water_liters_total.toLocaleString()} लीटर पानी दें (${irrigation.duration_hours} घंटे)`;
  }

  // Localize crop name (no ALL_CAPS) and weather evidence (only when fresh data exists)
  const cropMr = cropLabel(ctx.crop_code, 'mr');
  const cropHi = cropLabel(ctx.crop_code, 'hi');
  const cropEnLabel = cropLabel(ctx.crop_code, 'en');
  const wxMr = weatherEvidenceLine(ctx, 'mr');
  const wxHi = weatherEvidenceLine(ctx, 'hi');
  const wxEn = weatherEvidenceLine(ctx, 'en');

  // Cause = brain text (knowledge_text/reason_text), then weather as separate evidence line
  const baseCauseMr = knowledgeText
    ? localizeStep(knowledgeText.split('.').slice(0, 2).join('. '), 'mr')
    : (reasonText ? localizeStep(reasonText.split('.').slice(0, 2).join('. '), 'mr') : `${dr.condition_code.replace(/_/g, ' ').toLowerCase()} - ${cropMr} पिकाची तपासणी आवश्यक.`);
  const baseCauseHi = knowledgeText
    ? localizeStep(knowledgeText.split('.').slice(0, 2).join('. '), 'hi')
    : (reasonText ? localizeStep(reasonText.split('.').slice(0, 2).join('. '), 'hi') : `${dr.condition_code.replace(/_/g, ' ').toLowerCase()} - ${cropHi} फसल की जांच आवश्यक.`);

  // Steps from action_text (decision-brain SSOT), localized deterministically
  const stepsEnFinal = irrigationStepEn ? [...areaSpecificSteps, irrigationStepEn] : [...areaSpecificSteps];
  const stepsMrFinal = areaSpecificSteps.map((s: string) => localizeStep(s, 'mr'));
  const stepsHiFinal = areaSpecificSteps.map((s: string) => localizeStep(s, 'hi'));
  if (irrigationStepMr) stepsMrFinal.push(irrigationStepMr);
  if (irrigationStepHi) stepsHiFinal.push(irrigationStepHi);

  return {
    problem_en: problemEn,
    problem_mr: `${landName} ${areaMr} शेतात ${catMr} आढळले. ${cropMr} पिकावर परिणाम होत आहे.`,
    problem_hi: `${landName} ${areaHi} खेत में ${catHi} पाया गया. ${cropHi} फसल पर असर हो रहा है.`,
    cause_en: causeEn + (wxEn ? ` ${wxEn}` : ''),
    cause_mr: baseCauseMr + (wxMr ? ` ${wxMr}` : ''),
    cause_hi: baseCauseHi + (wxHi ? ` ${wxHi}` : ''),
    steps_en: stepsEnFinal,
    steps_mr: stepsMrFinal.length ? stepsMrFinal : [`${cropMr} पिकाची तपासणी करा`],
    steps_hi: stepsHiFinal.length ? stepsHiFinal : [`${cropHi} फसल की जांच करें`],
    safety_en: safetyEn || 'Wear protective equipment when applying any chemical treatment.',
    safety_mr: 'फवारणी करताना हातमोजे, मास्क आणि पूर्ण बाह्यांचे कपडे घाला. फवारणी दरम्यान खाणे-पिणे टाळा.',
    safety_hi: 'छिड़काव करते समय दस्ताने, मास्क और पूरी बाजू के कपड़े पहनें. छिड़काव के दौरान खाना-पीना न करें.',
    organic_alt_en: organicAltEn,
    organic_alt_mr: organicAltEn ? localizeStep(organicAltEn, 'mr') : '',
    organic_alt_hi: organicAltEn ? localizeStep(organicAltEn, 'hi') : '',
    expected_benefit_en: `Following these steps should help on your ${areaStr} ${cropEnLabel} field. Monitor after 5-7 days.`,
    expected_benefit_mr: `या उपायांनी ${landName} शेतातील ${areaMr} ${cropMr} पिकाची स्थिती सुधारेल. ५-७ दिवसांनी तपासा.`,
    expected_benefit_hi: `इन उपायों से ${landName} खेत के ${areaHi} ${cropHi} फसल की स्थिति सुधरेगी. 5-7 दिन बाद जांचें.`,
    followup_en: followupEn,
    followup_mr: `${landName} शेत ५-७ दिवसांनी तपासा. सुधारणा न झाल्यास स्थानिक कृषी अधिकाऱ्यांशी संपर्क करा.`,
    followup_hi: `${landName} खेत 5-7 दिन बाद जांचें. सुधार न हो तो स्थानीय कृषि अधिकारी से संपर्क करें.`,
    weather_source: ctx.weather.source,
    weather_distance_km: ctx.weather.distance_km,
  };
}

function buildContextualSolution(
  ctx: LandContext,
  triggerData: Record<string, any>
): Record<string, any> {
  const landName = ctx.land_name || 'your field';
  const areaMr = ctx.area_acres ? `${ctx.area_acres} एकर` : '';
  const areaHi = ctx.area_acres ? `${ctx.area_acres} एकड़` : '';
  const cropMrL = cropLabel(ctx.crop_code, 'mr');
  const cropHiL = cropLabel(ctx.crop_code, 'hi');
  const cropEnL = cropLabel(ctx.crop_code, 'en');
  const wxEn = weatherEvidenceLine(ctx, 'en');
  const wxMr = weatherEvidenceLine(ctx, 'mr');
  const wxHi = weatherEvidenceLine(ctx, 'hi');

  const irrigation = triggerData.irrigation;

  // NDVI-specific solution
  if (triggerData.ndvi != null || triggerData.drop != null) {
    const ndviVal = triggerData.ndvi ?? '--';
    const steps_en: string[] = [
      'Inspect the field for visible stress signs: wilting, yellowing, or dry patches',
      'Check soil moisture level by pressing soil between fingers — it should feel moist',
    ];
    const steps_mr: string[] = [
      'शेतात जाऊन पिकाची स्थिती तपासा — पाने पिवळी, सुकलेली किंवा कोमेजलेली आहेत का पहा',
      'जमिनीतील ओलावा तपासा — माती बोटांनी दाबून ओलसर आहे का पहा',
    ];
    const steps_hi: string[] = [
      'खेत में जाकर फसल की स्थिति जांचें — पत्तियां पीली, सूखी या मुरझाई हुई हैं क्या देखें',
      'मिट्टी की नमी जांचें — उंगलियों से दबाकर देखें गीली है या सूखी',
    ];

    if (irrigation) {
      const methodMr = IRRIGATION_METHOD_MR[irrigation.method] || irrigation.method;
      const methodHi = IRRIGATION_METHOD_HI[irrigation.method] || irrigation.method;
      steps_en.push(`Irrigate immediately: ${irrigation.water_liters_total.toLocaleString()} liters via ${irrigation.method} for ${irrigation.duration_hours} hours`);
      steps_mr.push(`ताबडतोब ${methodMr}ने ${irrigation.water_liters_total.toLocaleString()} लिटर पाणी द्या (${irrigation.duration_hours} तास)`);
      steps_hi.push(`तुरंत ${methodHi} से ${irrigation.water_liters_total.toLocaleString()} लीटर पानी दें (${irrigation.duration_hours} घंटे)`);
    }

    steps_en.push('If stress persists after 5 days, take a photo and consult via AI Chat');
    steps_mr.push('5 दिवसांनी सुधारणा नसल्यास फोटो काढून AI चॅटवर विचारा');
    steps_hi.push('5 दिन बाद सुधार न हो तो फोटो लेकर AI चैट पर पूछें');

    return {
      problem_en: `Satellite data shows crop health decline (NDVI: ${ndviVal}) on ${landName}. This indicates possible water stress, nutrient deficiency, or pest/disease damage.`,
      problem_mr: `${landName} ${areaMr} शेतातील पिकाचे उपग्रह आरोग्य (NDVI: ${ndviVal}) कमी झाले आहे. पाणी कमतरता, अन्नद्रव्य कमतरता किंवा कीड-रोगामुळे असू शकते.`,
      problem_hi: `${landName} ${areaHi} खेत में उपग्रह फसल स्वास्थ्य (NDVI: ${ndviVal}) कम हुआ है. पानी की कमी, पोषक तत्वों की कमी या कीट-रोग के कारण हो सकता है.`,
      cause_en: `Satellite shows the ${cropEnL} crop looks weak (NDVI ${ndviVal}). Soil: ${ctx.soil_type || 'unknown'}.${wxEn ? ' ' + wxEn : ''}`,
      cause_mr: `उपग्रहावरून ${cropMrL} पीक कमजोर दिसत आहे (NDVI ${ndviVal}). माती: ${ctx.soil_type || '—'}.${wxMr ? ' ' + wxMr : ''}`,
      cause_hi: `उपग्रह से ${cropHiL} फसल कमजोर दिख रही है (NDVI ${ndviVal}). मिट्टी: ${ctx.soil_type || '—'}.${wxHi ? ' ' + wxHi : ''}`,
      steps_en,
      steps_mr,
      steps_hi,
      safety_en: 'If applying any chemical treatment, wear gloves and mask. Do not spray during windy conditions.',
      safety_mr: 'कोणतीही रासायनिक फवारणी करताना हातमोजे आणि मास्क वापरा. वाऱ्यात फवारणी करू नका.',
      safety_hi: 'कोई भी रासायनिक छिड़काव करते समय दस्ताने और मास्क पहनें. हवा में छिड़काव न करें.',
      organic_alt_en: 'Apply vermicompost (500 kg/acre) or jeevamrut (200 liters/acre) to boost soil biology and crop recovery.',
      organic_alt_mr: 'गांडूळखत (500 किलो/एकर) किंवा जीवामृत (200 लिटर/एकर) वापरा.',
      organic_alt_hi: 'वर्मीकम्पोस्ट (500 किलो/एकड़) या जीवामृत (200 लीटर/एकड़) डालें.',
      expected_benefit_en: `With proper irrigation and care, crop health on ${landName} should improve within 7-10 days. NDVI should show recovery in next satellite pass.`,
      expected_benefit_mr: `योग्य सिंचन आणि काळजीने ${landName} शेतातील पिकाचे आरोग्य 7-10 दिवसांत सुधारेल.`,
      expected_benefit_hi: `उचित सिंचाई और देखभाल से ${landName} खेत में फसल स्वास्थ्य 7-10 दिनों में सुधरेगा.`,
      followup_en: `Re-check ${landName} after 5-7 days. Look for greener leaves and new growth. Next NDVI update will confirm recovery.`,
      followup_mr: `5-7 दिवसांनी ${landName} शेत पुन्हा तपासा. हिरवी पाने आणि नवी वाढ दिसायला हवी.`,
      followup_hi: `5-7 दिन बाद ${landName} खेत फिर जांचें. हरी पत्तियां और नई वृद्धि दिखनी चाहिए.`,
    };
  }

  // Generic solution for other alert types
  return {
    problem_en: `Alert condition detected on ${landName}. Immediate field inspection recommended.`,
    problem_mr: `${landName} ${areaMr} शेतात समस्या आढळली. शेताची तपासणी करा.`,
    problem_hi: `${landName} ${areaHi} खेत में समस्या पाई गई. खेत की जांच करें.`,
    cause_en: `Crop stage: ${ctx.current_stage || 'unknown'}.${wxEn ? ' ' + wxEn : ''}`,
    cause_mr: `पीक टप्पा: ${ctx.current_stage || '—'}.${wxMr ? ' ' + wxMr : ''}`,
    cause_hi: `फसल चरण: ${ctx.current_stage || '—'}.${wxHi ? ' ' + wxHi : ''}`,
    steps_en: ['Inspect the field thoroughly', 'Check for any visible damage or stress signs', 'Consult AI Chat with a photo for specific advice'],
    steps_mr: ['शेताची संपूर्ण तपासणी करा', 'कोणतेही नुकसान किंवा ताण चिन्हे तपासा', 'फोटो काढून AI चॅटवर विचारा'],
    steps_hi: ['खेत की पूरी जांच करें', 'किसी भी नुकसान या तनाव के संकेत देखें', 'फोटो लेकर AI चैट पर पूछें'],
    safety_en: '',
    safety_mr: '',
    safety_hi: '',
    organic_alt_en: '',
    organic_alt_mr: '',
    organic_alt_hi: '',
    expected_benefit_en: '',
    expected_benefit_mr: '',
    expected_benefit_hi: '',
    followup_en: `Check ${landName} again after 3-5 days.`,
    followup_mr: `3-5 दिवसांनी ${landName} शेत पुन्हा तपासा.`,
    followup_hi: `3-5 दिन बाद ${landName} खेत फिर जांचें.`,
  };
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
  black: 0.85, red: 1.1, laterite: 1.15, alluvial: 0.95, sandy: 1.3, clay: 0.8, loamy: 1.0, medium_black: 0.9,
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
  const soilType = normalizeSoilType(ctx.soil_type) ?? 'medium_black';

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
