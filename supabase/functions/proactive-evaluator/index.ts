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
import {
  loadEvaluatorConfig,
  loadApprovedMethodParams,
  loadSuppressionMatrix,
  type EvaluatorConfig,
  type MethodParams,
  type SuppressionRow,
} from './config.ts';
import { calculateIrrigationForLand } from './irrigation.ts';
import { enrichAndUpdateAlerts, enrichmentAvailable } from './enrichment.ts';

// =====================================================
// v124 — DATABASE-DRIVEN REBUILD (forensic-audit remediation)
// CHANGE LOG vs v123 (every change maps to an audit finding):
//  F1  Stage lookup case bug fixed: buildStageMap keys UPPERCASE; the dead
//      DB path is now live. computeStageHardcoded DELETED — a stage-coverage
//      gap is logged, never invented. Stage-scoped rules do NOT apply to
//      lands with unknown stage (fail-closed, deterministic).
//  F2  CROP_WATER_NEED_MM_PER_DAY / IRRIGATION_EFFICIENCY / SOIL_WATER_FACTOR
//      / flowRateLPH / hardcoded urgency DELETED. Irrigation volume now comes
//      ONLY from derived.water_deficit (FAO-56 chain in land_weather_state),
//      with efficiency/flow/cycle from sci_method_registry
//      IRRIGATION_METHOD_PARAMS@1.0, per-event cap from
//      derived.infiltration_cap (SOIL_INFILTRATION_CAPS@1.0), and urgency
//      from ALERT_URGENCY_THRESHOLDS@1.0 (SWSI-primary).
//  F3  Category-heuristic fallback gated by proactive_evaluator_config key
//      category_fallback_enabled (currently false in prod). When disabled,
//      rules with no machine-evaluable conditions are LOGGED as uncompilable
//      and never fired on generic weather.
//  F4  Neural enrichment gated by neural_invention_allowed (false in prod):
//      the LLM may only rephrase symbolic text; the prompt forbids
//      introducing any product, active ingredient, dosage, or quantity.
//  F5  All caps/windows (daily cap, cooldown default, freshness, proximity,
//      expiry, enrichment thresholds) read from proactive_evaluator_config.
//  F6  alert_suppression_matrix enforced: an active safety-block rule
//      suppresses conflicting alert categories for the same land.
//  F7  Invented GDD (base-10 everywhere, "temp × 30 days") DELETED;
//      gdd_accumulated now = derived.gdd_cumulative (land_gdd_daily, the
//      governed per-crop computation).
//  F8  ETL proxy (etl_value_min × 10 / T≥25&H≥60) DELETED — ETL requires
//      pest-count observations that do not exist; logged as knowledge gap.
//  F9  PHI harvest DAS from crop_stage data (max das_max), not a hardcoded map.
//  F10 decision_rules.conditions_compiled (declarative predicates) evaluated
//      through the single env predicate engine when present; runtime regex
//      parsing is the legacy path only for uncompiled rules.
//  F11 ctx.name → ctx.land_name bug fixed.
//  F12 Recent-alert window widened to cover suppression/cooldown horizons.
//  F13 AI gateway switched: Lovable (LOVABLE_API_KEY / ai.gateway.lovable.dev,
//      model google/gemini-2.5-flash-lite in v123) -> OpenAI Chat Completions
//      (OPENAI_API_KEY secret; model DB-configured via config key
//      'enrichment_model', default gpt-5-mini). See enrichment.ts.
//  F14 Modularized into five files: index.ts (orchestrator), env-derived.ts
//      (derived state + single predicate engine, now with an ndvi evidence
//      namespace), config.ts (DB config/params/suppression), irrigation.ts
//      (governed quantities), enrichment.ts (rephrase-only narration).
// UNKNOWN (flagged, not invented): semantics of frost_risk_score scale —
//      frost predicates use presence (>0) pending verification; rules whose
//      conditions need NDVI inside the env engine remain on the legacy path.
// =====================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  conditions_compiled: Record<string, any> | null; // F10
  compile_status: string | null;                   // F10
  etl_value_min: number | null;
  etl_value_max: number | null;
  phi_days: number | null;
  action_text: string | null;
  reason_text: string | null;
  knowledge_text: string | null;
  i18n_key: string | null;
  prediction_type: string | null;
  forecast_horizon_days: number | null;
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
    source: 'exact' | 'proximity' | 'unavailable';
    distance_km: number | null;
    age_hours: number | null;
  };
  ndvi: number | null;
  ndvi_previous: number | null;
  land_name: string | null;
  soil_n: number | null;
  soil_p: number | null;
  soil_k: number | null;
  soil_ph: number | null;
  organic_carbon: number | null;
  forecast_rain_probability_72h: number | null;
  gdd_accumulated: number | null; // F7: = derived.gdd_cumulative (land_gdd_daily)
  area_acres: number | null;
  soil_type: string | null;
  irrigation_type: string | null;
  water_source: string | null;
  derived: DerivedState;
  forecast_tmax_mean_5d: number | null;
  /** v125: minimum forecast night temperature (next 14h) for temp_night rules. */
  forecast_tmin_night: number | null;
  /** v125: cultivation lane (transplanted / direct_seeded) for stage series choice. */
  cultivation_method: string | null;
}

interface RuleEvalResult {
  fired: boolean;
  riskScore: number;
  confidence: number;
  reasoning: string;
  triggerData: Record<string, any>;
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

    let tenantIds: string[] = [];
    if (rawTenantId && rawTenantId !== 'default') {
      tenantIds = [rawTenantId];
    } else {
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

    let totalAlerts = 0;
    let totalLands = 0;
    let totalRulesFired = 0;
    let totalRulesEvaluated = 0;
    let totalSuppressed = 0;
    let totalUncompilable = 0;
    let totalStageGaps = 0;

    for (const tenantId of tenantIds) {
      const t = await processOneTenant(supabase, tenantId, targetLandId, action);
      totalAlerts += t.alerts;
      totalLands += t.lands;
      totalRulesFired += t.rulesFired;
      totalRulesEvaluated += t.rulesEvaluated;
      totalSuppressed += t.suppressed;
      totalUncompilable += t.uncompilable;
      totalStageGaps += t.stageGaps;
    }

    const elapsed = Date.now() - startTime;
    console.log(`[ProactiveEvaluator] Done: ${totalLands} lands, ${totalRulesFired} rules fired, ${totalAlerts} alerts in ${elapsed}ms`);

    await supabase.from('proactive_evaluation_log').insert({
      tenant_id: tenantIds[0] || 'default',
      evaluation_type: action === 'scheduled' ? 'scheduled' : 'manual',
      lands_evaluated: totalLands,
      rules_evaluated: totalRulesEvaluated,
      rules_fired: totalRulesFired,
      alerts_generated: totalAlerts,
      execution_time_ms: elapsed,
      metadata: {
        tenants_processed: tenantIds.length,
        alerts_suppressed_by_safety: totalSuppressed,
        uncompilable_rules_skipped: totalUncompilable,
        stage_coverage_gaps: totalStageGaps,
        engine_version: 'v124-db-driven',
      },
    }).then(() => {});

    return jsonResponse({
      success: true,
      tenants_processed: tenantIds.length,
      lands_evaluated: totalLands,
      rules_fired: totalRulesFired,
      alerts_generated: totalAlerts,
      alerts_suppressed_by_safety: totalSuppressed,
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

async function processOneTenant(
  supabase: any,
  tenantId: string,
  targetLandId: string | null,
  action: string,
): Promise<{ alerts: number; lands: number; rulesFired: number; rulesEvaluated: number; suppressed: number; uncompilable: number; stageGaps: number }> {
  // F5: config + governed params + suppression loaded up front — DB decides.
  const [cfg, methods, suppression] = await Promise.all([
    loadEvaluatorConfig(supabase, tenantId),
    loadApprovedMethodParams(supabase),
    loadSuppressionMatrix(supabase),
  ]);

  const [rulesRes, decisionRulesRes] = await Promise.all([
    supabase.from('proactive_rules').select('*').eq('is_active', true),
    supabase.from('decision_rules').select('id, crop_code, category, priority, condition_code, stage_applicable, conditions_json, conditions_compiled, compile_status, etl_value_min, etl_value_max, phi_days, action_text, reason_text, knowledge_text, i18n_key, prediction_type, forecast_horizon_days, active_ingredient, dosage_per_acre, water_volume_per_acre, application_method, organic_alternative, bee_toxicity, farmer_safety_level, treatment_type, chemical_class, confidence_score').eq('is_proactive_rule', true).eq('is_active', true),
  ]);

  if (rulesRes.error) throw new Error(`Rules load failed: ${rulesRes.error.message}`);
  const rules: ProactiveRule[] = rulesRes.data || [];
  const decisionRules: DecisionRuleProactive[] = decisionRulesRes.data || [];

  if (rules.length === 0 && decisionRules.length === 0) {
    return { alerts: 0, lands: 0, rulesFired: 0, rulesEvaluated: 0, suppressed: 0, uncompilable: 0, stageGaps: 0 };
  }

  console.log(`[ProactiveEvaluator][${tenantId.slice(0, 8)}] Loaded ${rules.length} proactive rules, ${decisionRules.length} decision rules`);

  let landsQuery = supabase
    .from('lands')
    .select('id, farmer_id, tenant_id, current_crop, name, last_sowing_date, cultivation_date, center_lat, center_lon, area_acres, soil_type, irrigation_type, water_source')
    .eq('is_active', true)
    .eq('tenant_id', tenantId);

  if (targetLandId) landsQuery = landsQuery.eq('id', targetLandId);

  const { data: lands, error: landsError } = await landsQuery.limit(500);
  if (landsError) throw new Error(`Lands load failed: ${landsError.message}`);
  if (!lands || lands.length === 0) {
    return { alerts: 0, lands: 0, rulesFired: 0, rulesEvaluated: 0, suppressed: 0, uncompilable: 0, stageGaps: 0 };
  }

  const landIds = lands.map((l: any) => l.id);

  // F12: recent-alert window must cover cooldowns AND suppression horizons.
  const maxSuppressionHours = suppression.reduce((m, s) => Math.max(m, s.suppression_hours || 0), 0);
  const recentWindowHours = Math.max(24, cfg.default_cooldown_hours, maxSuppressionHours);

  const [
    cropSchedulesRes,
    recentAlertsRes,
    soilRes,
    ndviRes,
    stageMasterRes,
    stageFallbackRes,
  ] = await Promise.all([
    supabase.from('crop_schedules')
      .select('land_id, sowing_date, crop_name, status, is_active, cultivation_method')
      .in('land_id', landIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    supabase.from('proactive_alerts')
      .select('id, rule_id, land_id, farmer_id, dedup_key, created_at, status, trigger_data, alert_category')
      .in('land_id', landIds)
      .gte('created_at', new Date(Date.now() - recentWindowHours * 60 * 60 * 1000).toISOString()),
    supabase.from('soil_health')
      .select('land_id, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, ph_level, organic_carbon')
      .in('land_id', landIds)
      .order('created_at', { ascending: false }),
    supabase.from('ndvi_data')
      .select('land_id, ndvi_value, date')
      .in('land_id', landIds)
      .order('date', { ascending: false })
      .limit(1000),
    // v125: crop_stage_master is the stage SSOT (full phenology per crop + lane).
    supabase.from('crop_stage_master')
      .select('crop_code, stage_code, growth_stage, das_min, das_max, cultivation_method')
      .not('das_min', 'is', null)
      .not('das_max', 'is', null),
    // fallback only — used when crop_stage_master has no rows for the crop.
    supabase.from('intent_observation_mapping')
      .select('crop_code, growth_stage, das_min, das_max')
      .not('das_min', 'is', null)
      .neq('growth_stage', 'ALL'),
  ]);

  const scheduleMap = buildScheduleMap(cropSchedulesRes.data);
  const alertMap = buildAlertMap(recentAlertsRes.data);
  const soilMap = buildSoilMap(soilRes.data);
  const ndviMap = buildNdviMap(ndviRes.data);

  const stageMap = buildStageMap(stageMasterRes.data);
  const stageFallbackMap = buildStageFallbackMap(stageFallbackRes.data);
  // F9: harvest DAS per crop = max das_max from the governed stage data.
  const harvestDasByCrop = buildHarvestDasMap(stageMap.size > 0 ? stageMap : stageFallbackMap);

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
    cfg,
  );

  const [forecastLocMap, tmax5dLocMap, tminNightLocMap, derivedMap, farmerVisibility] = await Promise.all([
    batchLoadForecast(supabase, locKeyArray),
    batchLoadForecastTmax5d(supabase, locKeyArray),
    batchLoadForecastTminNight(supabase, locKeyArray),
    batchLoadDerived(supabase, landIds),
    loadFarmerVisibility(supabase),
  ]);
  console.log(`[ProactiveEvaluator][${tenantId.slice(0, 8)}] [ENV_DERIVED] hydrated derived state for ${derivedMap.size}/${landIds.length} lands`);
  const forecastMap = new Map<string, number>();
  for (const [landId, locKey] of landToLocKey) {
    const fVal = forecastLocMap.get(locKey);
    if (fVal != null) forecastMap.set(landId, fVal);
  }

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
  // Build LandContexts
  // =========================================================
  const landContexts: LandContext[] = [];
  let stageGaps = 0;

  for (const land of lands) {
    const schedule = scheduleMap.get(land.id);
    const sowingDate = schedule?.sowing_date || land.last_sowing_date || land.cultivation_date;
    const cropSource = schedule?.crop_name || land.current_crop;
    const cropCode = normalizeCropCode(cropSource);

    const das = sowingDate
      ? Math.floor((Date.now() - new Date(sowingDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // v125: DB-driven stage from crop_stage_master (lane-aware); IOM is fallback.
    const cultivationMethod = schedule?.cultivation_method ?? null;
    const currentStage = computeStageDynamic(cropCode, das, stageMap, cultivationMethod, stageFallbackMap);
    if (currentStage == null && cropCode && das > 0) {
      stageGaps++;
      console.warn(`[STAGE_COVERAGE_GAP] land=${land.id.slice(0, 8)} crop=${cropCode} das=${das} — no stage window in crop_stage_master or intent_observation_mapping; stage-scoped rules will not apply`);
    }


    const weather = landWeatherMap.get(land.id) || nullWeather();
    const ndviArr = ndviMap.get(land.id) || [];
    const ndvi = ndviArr[0]?.ndvi_value ?? null;
    const ndvi_previous = ndviArr[1]?.ndvi_value ?? null;
    const soil = soilMap.get(land.id);
    const forecastRain = forecastMap.get(land.id) ?? null;
    const derived = derivedMap.get(land.id) || emptyDerived();
    const locKey = (land.center_lat != null && land.center_lon != null)
      ? makeLocationKey(land.center_lat, land.center_lon) : null;

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
      gdd_accumulated: derived.gdd_cumulative, // F7: governed land_gdd_daily only
      area_acres: land.area_acres ?? null,
      soil_type: land.soil_type ?? null,
      irrigation_type: land.irrigation_type ?? null,
      water_source: land.water_source ?? null,
      derived,
      forecast_tmax_mean_5d: locKey ? (tmax5dLocMap.get(locKey) ?? null) : null,
      forecast_tmin_night: locKey ? (tminNightLocMap.get(locKey) ?? null) : null,
      cultivation_method: cultivationMethod,
    });
  }

  // =========================================================
  // Evaluate rules
  // =========================================================
  let totalAlerts = 0;
  let totalRulesFired = 0;
  let totalRulesEvaluated = 0;
  let uncompilableSkipped = 0;
  const alertsToInsert: any[] = [];
  const eventsToInsert: any[] = [];

  for (const ctx of landContexts) {
    const applicableRules = rules.filter((r: ProactiveRule) => {
      // Contract normalization: case-insensitive crop compare; NULL/'ALL' = crop-agnostic.
      const rc = r.crop_code ? r.crop_code.toUpperCase().trim() : null;
      if (rc && rc !== 'ALL' && rc !== ctx.crop_code) return false;
      const stages = (r.stage_applicable || []).map((s: string) => String(s).toUpperCase().trim());
      if (stages.length > 0 && !stages.includes('ALL')) {
        // F1: stage-scoped rules require a KNOWN stage — fail closed.
        if (ctx.current_stage == null) return false;
        if (!stages.includes(ctx.current_stage.toUpperCase().trim())) return false;
      }
      return true;
    });
    totalRulesEvaluated += applicableRules.length;

    for (const rule of applicableRules) {
      const isEnvRule = isEnvIntelligenceRule(rule.conditions);
      let envPhase: string | null = null;
      let result: RuleEvalResult;
      if (isEnvRule) {
        const envRes = evaluateEnvRule(rule.rule_code, rule.conditions, {
          crop_code: ctx.crop_code,
          das: ctx.das,
          derived: ctx.derived,
          weather: { ...ctx.weather, rain_probability: ctx.forecast_rain_probability_72h, tmin_forecast_night: ctx.forecast_tmin_night },
          forecast: { tmax_mean_5d: ctx.forecast_tmax_mean_5d },
          ndvi: { value: ctx.ndvi, previous: ctx.ndvi_previous,
                  drop: (ctx.ndvi != null && ctx.ndvi_previous != null) ? ctx.ndvi_previous - ctx.ndvi : null },
        });
        envPhase = envRes.episodePhase;
        result = { fired: envRes.fired, riskScore: envRes.riskScore, confidence: envRes.confidence, reasoning: envRes.reasoning, triggerData: envRes.triggerData };
        console.log(`[ENV_RULE_EVAL] land=${ctx.land_id.slice(0, 8)} rule=${rule.rule_code} fired=${envRes.fired} reason=${envRes.reasoning}`);
      } else {
        result = evaluateRule(rule, ctx);
      }
      if (!result.fired) continue;
      totalRulesFired++;

      if (isEnvRule && rule.conditions?.metadata?.episode_driven === true) {
        const lastPhase = lastAlertPhase(rule.rule_code, ctx.land_id, alertMap);
        if (lastPhase && envPhase && lastPhase === envPhase) {
          console.log(`[ENV_RULE_EVAL] land=${ctx.land_id.slice(0, 8)} rule=${rule.rule_code} suppressed: phase unchanged (${envPhase})`);
          continue;
        }
      }

      const dedupKey = isEnvRule && envPhase
        ? `${rule.rule_code}:${ctx.land_id}:${envPhase}:${todayStr}`
        : `${rule.rule_code}:${ctx.land_id}:${todayStr}`;
      if (isDuplicate(dedupKey, rule.rule_code, ctx.land_id, rule.cooldown_hours || cfg.default_cooldown_hours, alertMap)) continue;

      const dailyCount = farmerDailyCounts.get(ctx.farmer_id) || 0;
      if (dailyCount >= cfg.daily_alert_cap_per_farmer && mapRulePriority(rule.priority) !== 'CRITICAL') continue;

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
        alert_category: mapAlertCategory(rule.alert_category),
        priority: mapRulePriority(rule.priority),
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
            enrichTriggerDataWithIrrigation(result.triggerData, mapAlertCategory(rule.alert_category), ctx, methods),
            null, rule, ctx, decisionRules, methods,
          ),
          farmerVisibility,
          'farmer',
        ),
        decision_reasoning: result.reasoning,
        status: 'PENDING',
        dedup_key: dedupKey,
        expires_at: new Date(Date.now() + cfg.alert_expiry_days * 24 * 60 * 60 * 1000).toISOString(),
      });

      farmerDailyCounts.set(ctx.farmer_id, dailyCount + 1);
      totalAlerts++;
    }

    // ---- decision_rules bridge ----
    const applicableDecisionRules = decisionRules.filter(dr => {
      const dc = dr.crop_code ? dr.crop_code.toUpperCase().trim() : null;
      if (dc && dc !== 'ALL' && dc !== ctx.crop_code) return false;
      const stages = (dr.stage_applicable || []).map((s: string) => String(s).toUpperCase().trim());
      if (stages.length > 0 && !stages.includes('ALL')) {
        if (ctx.current_stage == null) return false; // F1: fail closed
        if (!stages.includes(ctx.current_stage.toUpperCase().trim())) return false;
      }
      return true;
    });
    totalRulesEvaluated += applicableDecisionRules.length;
    applicableDecisionRules.sort((a, b) => (a.priority || 99) - (b.priority || 99));

    for (const dr of applicableDecisionRules) {
      const evalOut = evaluateDecisionRule(dr, ctx, cfg, harvestDasByCrop);
      if (evalOut.uncompilable) { uncompilableSkipped++; continue; }
      const result = evalOut.result;
      if (!result.fired) continue;
      totalRulesFired++;

      const dedupKey = `DR:${dr.condition_code}:${ctx.land_id}:${todayStr}`;
      if (isDuplicate(dedupKey, dr.condition_code, ctx.land_id, cfg.default_cooldown_hours, alertMap)) continue;

      const dailyCount = farmerDailyCounts.get(ctx.farmer_id) || 0;
      if (dailyCount >= cfg.daily_alert_cap_per_farmer && dr.priority > 1) continue;

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

      const titleEn = `${dr.condition_code.replace(/_/g, ' ')} Alert`;
      const messageEn = dr.reason_text || result.reasoning;
      const actionEn = dr.action_text || null;
      const trilingualTitle = generateTrilingualTitle(dr.category, alertCategory, ctx);
      const trilingualMsg = generateTrilingualMessage(dr.category, messageEn, ctx, methods);
      const trilingualAction = generateTrilingualAction(dr.category, actionEn, ctx, methods);

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
          enrichTriggerDataWithIrrigation({ ...result.triggerData, knowledge: dr.knowledge_text, decision_rule_id: dr.id }, alertCategory, ctx, methods),
          dr, null, ctx, decisionRules, methods,
        ),
        decision_reasoning: result.reasoning,
        status: 'PENDING',
        dedup_key: dedupKey,
        expires_at: new Date(Date.now() + cfg.alert_expiry_days * 24 * 60 * 60 * 1000).toISOString(),
      });

      farmerDailyCounts.set(ctx.farmer_id, dailyCount + 1);
      totalAlerts++;
    }
  }

  // =========================================================
  // F6: SAFETY SUPPRESSION — matrix has teeth now
  // =========================================================
  const { kept, suppressedCount } = applySafetySuppression(alertsToInsert, alertMap, suppression);
  totalAlerts -= suppressedCount;

  if (eventsToInsert.length > 0) {
    const { error: evErr } = await supabase.from('proactive_events').insert(eventsToInsert);
    if (evErr) console.error('[ProactiveEvaluator] Events insert error:', evErr.message);
  }

  if (kept.length > 0) {
    const { data: insertedAlerts, error: alErr } = await supabase
      .from('proactive_alerts')
      .upsert(kept, { onConflict: 'dedup_key', ignoreDuplicates: true })
      .select('id, risk_score, priority, alert_category, trigger_data, message_en, action_text_en, title_mr, message_mr, title_hi, title_en, message_hi, action_text_mr, action_text_hi');
    if (alErr) console.error('[ProactiveEvaluator] Alerts upsert error:', alErr.message);

    if (enrichmentAvailable() && insertedAlerts && insertedAlerts.length > 0) {
      enrichAndUpdateAlerts(supabase, insertedAlerts, cfg).catch(e =>
        console.warn('[NeuralEnrichment] Background enrichment failed:', e.message)
      );
    }
  }

  return { alerts: totalAlerts, lands: landContexts.length, rulesFired: totalRulesFired, rulesEvaluated: totalRulesEvaluated, suppressed: suppressedCount, uncompilable: uncompilableSkipped, stageGaps };
}

// =====================================================
// F6: SAFETY SUPPRESSION IMPLEMENTATION
// A safety-block rule that fired (this batch, or within suppression_hours in
// recent alerts) suppresses conflicting alert categories on the SAME land.
// Category comparison is case-insensitive (proactive rules use lowercase
// categories; decision-rule alerts use UPPERCASE mapped categories).
// =====================================================

function applySafetySuppression(
  alertsToInsert: any[],
  alertMap: Map<string, any[]>,
  suppression: SuppressionRow[],
): { kept: any[]; suppressedCount: number } {
  if (suppression.length === 0) return { kept: alertsToInsert, suppressedCount: 0 };

  const bySuppressor = new Map<string, SuppressionRow[]>();
  for (const s of suppression) {
    if (!bySuppressor.has(s.suppressor_rule_code)) bySuppressor.set(s.suppressor_rule_code, []);
    bySuppressor.get(s.suppressor_rule_code)!.push(s);
  }

  // land_id -> set of suppressed lowercase categories (with horizon respected)
  const suppressedByLand = new Map<string, Set<string>>();
  const now = Date.now();

  const registerSuppressor = (landId: string, ruleCode: string, firedAtMs: number) => {
    const rows = bySuppressor.get(ruleCode);
    if (!rows) return;
    for (const row of rows) {
      if (now - firedAtMs > row.suppression_hours * 60 * 60 * 1000) continue;
      if (!suppressedByLand.has(landId)) suppressedByLand.set(landId, new Set());
      suppressedByLand.get(landId)!.add(row.suppressed_category.toLowerCase());
    }
  };

  // Suppressors fired in THIS batch
  for (const a of alertsToInsert) {
    if (bySuppressor.has(a.rule_id)) registerSuppressor(a.land_id, a.rule_id, now);
  }
  // Suppressors fired recently (recent-alert window covers suppression horizon)
  for (const [landId, recents] of alertMap) {
    for (const r of recents) {
      if (bySuppressor.has(r.rule_id)) {
        registerSuppressor(landId, r.rule_id, new Date(r.created_at).getTime());
      }
    }
  }

  if (suppressedByLand.size === 0) return { kept: alertsToInsert, suppressedCount: 0 };

  const kept: any[] = [];
  let suppressedCount = 0;
  for (const a of alertsToInsert) {
    const supSet = suppressedByLand.get(a.land_id);
    const isSuppressor = bySuppressor.has(a.rule_id);
    if (!isSuppressor && supSet && supSet.has(String(a.alert_category || '').toLowerCase())) {
      suppressedCount++;
      console.log(`[SAFETY_SUPPRESSION] land=${String(a.land_id).slice(0, 8)} dropped ${a.rule_id} (category=${a.alert_category}) — active safety block on this land`);
      continue;
    }
    kept.push(a);
  }
  return { kept, suppressedCount };
}

// =====================================================
// BATCH LOADING HELPERS
// =====================================================

function buildScheduleMap(data: any[] | null): Map<string, { sowing_date: string; crop_name: string; cultivation_method: string | null }> {
  const map = new Map();
  if (!data) return map;
  for (const cs of data) {
    if (!map.has(cs.land_id) && cs.sowing_date) {
      map.set(cs.land_id, { sowing_date: cs.sowing_date, crop_name: cs.crop_name, cultivation_method: cs.cultivation_method ?? null });
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
    if (arr.length < 2) arr.push(n);
  }
  return map;
}

// v125: STAGE SSOT = crop_stage_master. Keys are UPPERCASE crop codes so the
// lookup with normalizeCropCode() output matches. stage_code is normalized by
// stripping the leading crop prefix and an optional lane token
// (RICE_TP_BOOTING -> BOOTING, RICE_DSR_EARLY_VEGETATIVE -> EARLY_VEGETATIVE).
function normalizeStageCode(stageCode: string | null, growthStage: string | null, cropKey: string): string {
  const raw = String(stageCode || '').toUpperCase().trim();
  if (!raw) return String(growthStage || '').toUpperCase().trim();
  let s = raw;
  if (cropKey && s.startsWith(`${cropKey}_`)) s = s.slice(cropKey.length + 1);
  s = s.replace(/^(TP|DSR)_/, '');
  return s || String(growthStage || '').toUpperCase().trim();
}

function buildStageMap(data: any[] | null): Map<string, { stage: string; das_min: number; das_max: number; series: 'TP' | 'DIRECT' }[]> {
  const map = new Map<string, any[]>();
  if (!data) return map;
  for (const row of data) {
    const key = String(row.crop_code || '').toUpperCase().trim();
    if (!key) continue;
    const rawCode = String(row.stage_code || '').toUpperCase();
    const method = String(row.cultivation_method || '').toLowerCase();
    const series: 'TP' | 'DIRECT' = (rawCode.includes('_TP_') || method === 'transplanted') ? 'TP' : 'DIRECT';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({
      stage: normalizeStageCode(row.stage_code, row.growth_stage, key),
      das_min: row.das_min,
      das_max: row.das_max,
      series,
    });
  }
  for (const [, stages] of map) {
    stages.sort((a: any, b: any) => a.das_min - b.das_min);
  }
  return map;
}

// Fallback stage windows (intent_observation_mapping) — used only when
// crop_stage_master has no rows for the crop.
function buildStageFallbackMap(data: any[] | null): Map<string, { stage: string; das_min: number; das_max: number; series: 'DIRECT' }[]> {
  const map = new Map<string, any[]>();
  if (!data) return map;
  for (const row of data) {
    const key = String(row.crop_code || '').toUpperCase().trim();
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ stage: String(row.growth_stage || '').toUpperCase().trim(), das_min: row.das_min, das_max: row.das_max, series: 'DIRECT' });
  }
  for (const [, stages] of map) {
    stages.sort((a: any, b: any) => a.das_min - b.das_min);
  }
  return map;
}

// F9: harvest DAS per crop from governed stage windows (max das_max).
function buildHarvestDasMap(stageMap: Map<string, any[]>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [crop, stages] of stageMap) {
    let maxDas = 0;
    for (const s of stages) if (s.das_max != null && s.das_max > maxDas) maxDas = s.das_max;
    if (maxDas > 0) out.set(crop, maxDas);
  }
  return out;
}

function makeLocationKey(lat: number, lon: number): string {
  return `${(Math.round(lat * 100) / 100)},${(Math.round(lon * 100) / 100)}`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Per-land weather lookup. Freshness/proximity limits come from
 * proactive_evaluator_config (F5), not literals.
 */
async function batchLoadWeatherByLand(
  supabase: any,
  lands: Array<{ id: string; center_lat: number | null; center_lon: number | null }>,
  cfg: EvaluatorConfig,
): Promise<Map<string, { temp: number | null; humidity: number | null; rain_mm: number | null; wind_speed: number | null; description: string | null; source: 'exact' | 'proximity' | 'unavailable'; distance_km: number | null; age_hours: number | null }>> {
  const result = new Map();
  const FRESHNESS_HOURS = cfg.weather_freshness_hours;
  const MAX_KM = cfg.weather_proximity_max_km;
  const BBOX_DEG = Math.max(0.1, MAX_KM / 110); // degrees ≈ km/110 at this latitude band

  const exactKeys = new Set<string>();
  for (const land of lands) {
    if (land.center_lat != null && land.center_lon != null) {
      exactKeys.add(makeLocationKey(land.center_lat, land.center_lon));
    }
  }

  const freshCutoff = new Date(Date.now() - FRESHNESS_HOURS * 60 * 60 * 1000).toISOString();

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const land of lands) {
    if (land.center_lat == null || land.center_lon == null) continue;
    minLat = Math.min(minLat, land.center_lat - BBOX_DEG);
    maxLat = Math.max(maxLat, land.center_lat + BBOX_DEG);
    minLon = Math.min(minLon, land.center_lon - BBOX_DEG);
    maxLon = Math.max(maxLon, land.center_lon + BBOX_DEG);
  }

  const obsRows: any[] = [];

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

  const now = Date.now();
  for (const land of lands) {
    if (land.center_lat == null || land.center_lon == null) {
      result.set(land.id, nullWeather());
      continue;
    }
    const exactKey = makeLocationKey(land.center_lat, land.center_lon);

    let best: { row: any; distKm: number; isExact: boolean } | null = null;
    for (const row of obsRows) {
      if (row.location_key === exactKey) {
        best = { row, distKm: 0, isExact: true };
        break;
      }
    }

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
      result.set(land.id, nullWeather());
    }
  }

  return result;
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

// v125: minimum forecast night temperature (next 14 hours) per location_key.
// Batch-loaded once per tenant run — never queried per land.
async function batchLoadForecastTminNight(supabase: any, locationKeys: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (locationKeys.length === 0) return map;

  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('weather_forecasts')
    .select('location_key, temperature_min_celsius')
    .in('location_key', locationKeys)
    .gte('forecast_time', nowIso)
    .lte('forecast_time', untilIso)
    .not('temperature_min_celsius', 'is', null);

  if (data) {
    for (const f of data) {
      if (!f.location_key) continue;
      const v = Number(f.temperature_min_celsius);
      if (!Number.isFinite(v)) continue;
      const existing = map.get(f.location_key);
      if (existing == null || v < existing) map.set(f.location_key, v);
    }
  }
  return map;
}



// F7: batchLoadGDD DELETED. It invented GDD via a universal base temperature
// of 10°C and, worse, "current temp × 30 days". gdd_accumulated is now
// derived.gdd_cumulative from land_gdd_daily — the governed per-crop chain.

function nullWeather() {
  return { temp: null, humidity: null, rain_mm: null, wind_speed: null, description: null, source: 'unavailable' as const, distance_km: null, age_hours: null };
}

// =====================================================
// IN-MEMORY DEDUP + COOLDOWN
// =====================================================

function lastAlertPhase(ruleCode: string, landId: string, alertMap: Map<string, any[]>): string | null {
  const landAlerts = (alertMap.get(landId) || [])
    .filter(a => a.rule_id === ruleCode)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const phase = landAlerts[0]?.trigger_data?.episode?.phase;
  return phase ? String(phase) : null;
}

function isDuplicate(dedupKey: string, ruleCode: string, landId: string, cooldownHours: number, alertMap: Map<string, any[]>): boolean {
  const landAlerts = alertMap.get(landId) || [];
  for (const a of landAlerts) {
    if (a.dedup_key === dedupKey) return true;
  }
  const cooldownDate = Date.now() - cooldownHours * 60 * 60 * 1000;
  for (const a of landAlerts) {
    if (a.rule_id === ruleCode && new Date(a.created_at).getTime() > cooldownDate) return true;
  }
  return false;
}

// =====================================================
// v125: DYNAMIC STAGE — crop_stage_master SSOT (lane-aware), IOM fallback
// =====================================================

function computeStageDynamic(
  cropCode: string | null,
  das: number,
  stageMap: Map<string, any[]>,
  cultivationMethod?: string | null,
  fallbackMap?: Map<string, any[]>,
): string | null {
  if (!cropCode || das <= 0) return null;

  const stages = stageMap.get(cropCode); // UPPERCASE keys (buildStageMap)
  if (stages && stages.length > 0) {
    const hasTp = stages.some((s) => s.series === 'TP');
    const hasDirect = stages.some((s) => s.series === 'DIRECT');
    let preferred: 'TP' | 'DIRECT' | null = null;
    if (hasTp && hasDirect) {
      const method = String(cultivationMethod || '').toLowerCase();
      if (method.includes('transplant')) preferred = 'TP';
      else if (method.includes('direct') || method.includes('dsr') || method.includes('seed')) preferred = 'DIRECT';
      else {
        // Documented regional default (Maharashtra): rice is transplanted.
        preferred = cropCode === 'RICE' ? 'TP' : 'DIRECT';
        console.log(`[STAGE_SERIES_ASSUMED] crop=${cropCode} das=${das} series=${preferred} reason=cultivation_method_unknown`);
      }
    }
    const pool = preferred ? stages.filter((s) => s.series === preferred) : stages;
    for (const s of pool) {
      if (das >= s.das_min && das <= s.das_max) return s.stage;
    }
  } else if (fallbackMap) {
    // crop_stage_master has no rows for this crop => intent_observation_mapping.
    const fb = fallbackMap.get(cropCode);
    if (fb && fb.length > 0) {
      for (const s of fb) {
        if (das >= s.das_min && das <= s.das_max) return s.stage;
      }
    }
  }
  // No coverage => UNKNOWN. Never invent a stage. Caller logs the gap.
  return null;
}


// =====================================================
// CROP CODE NORMALIZATION
// (Interim: dictionary retained pending migration to crop_synonyms table —
// tracked as Phase-2 item; contains no thresholds, only name mapping.)
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
// =====================================================
export function normalizeSoilType(s: string | null | undefined): string | null {
  if (!s) return null;
  const base = String(s).toLowerCase().trim().replace(/\s+/g, '_');
  if (!base) return null;
  const MAP: Record<string, string> = {
    black_soil: 'black',
    red_soil: 'red',
    black_cotton_soil: 'black',
    black_cotton: 'black',
  };
  return MAP[base] ?? base;
}

// =====================================================
// PROACTIVE RULE EVALUATION (legacy typed conditions — numeric thresholds
// here come FROM the rule row (DB), never from code)
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
      if (conditions.rain_probability_min != null) {
        totalConditions++;
        if (ctx.forecast_rain_probability_72h != null && ctx.forecast_rain_probability_72h >= conditions.rain_probability_min) {
          conditionsMet++; triggerData.forecast_rain_72h = ctx.forecast_rain_probability_72h;
        }
      }
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
        // F7: GDD is the governed land_gdd_daily cumulative — no proxy.
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
// LEGACY CONDITIONS_JSON PARSER — numeric extraction ONLY.
// F3: Boolean flags (warm_temperature/high/high_humidity/waterlogging) no
// longer receive invented numeric defaults; they map to derived-state
// predicates or mark the rule uncompilable.
// =====================================================

function parseDecisionRuleConditions(cj: Record<string, any>): {
  temp_min: number | null; temp_max: number | null;
  humidity_min: number | null; humidity_max: number | null;
  rain_min: number | null; wind_max: number | null;
  frost: boolean; soil_moisture_low: boolean; soil_moisture_high: boolean;
  ndvi_below: number | null;
  had_unparseable_flags: boolean;
} {
  const result = {
    temp_min: null as number | null, temp_max: null as number | null,
    humidity_min: null as number | null, humidity_max: null as number | null,
    rain_min: null as number | null, wind_max: null as number | null,
    frost: false, soil_moisture_low: false, soil_moisture_high: false,
    ndvi_below: null as number | null,
    had_unparseable_flags: false,
  };

  const weather = cj.weather || {};

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
  // F3: no invented defaults. A boolean severity flag without a governed
  // number cannot be evaluated — it flags the rule for the compiler/review.
  if (weather.warm_temperature === true || weather.high === true ||
      (typeof weather.temperature === 'string' && weather.temperature === 'high')) {
    if (result.temp_min === null) result.had_unparseable_flags = true;
  }

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
  if ((cj.high_humidity === true || weather.high_humidity === true) && result.humidity_min === null) {
    result.had_unparseable_flags = true; // F3: was invented "80"
  }

  const windStr = weather.wind_speed_kmph || weather.wind || null;
  if (windStr && typeof windStr === 'string') {
    const gtMatch = windStr.match(/>(\d+)/);
    const ltMatch = windStr.match(/<(\d+)/);
    if (gtMatch) result.wind_max = parseFloat(gtMatch[1]);
    if (ltMatch) result.wind_max = parseFloat(ltMatch[1]);
  }

  const rainStr = weather.rain_forecast_4h || weather.rainfall || null;
  if (typeof rainStr === 'string' && rainStr.match(/>\d+/)) {
    const m = rainStr.match(/>(\d+)/);
    if (m) result.rain_min = parseFloat(m[1]);
  }
  if (cj.waterlogging === true || cj.soil_moisture === 'excess' || cj.soil_moisture === 'HIGH') {
    result.soil_moisture_high = true; // evaluated on derived state, not "rain 50"
  }

  if (weather.frost === true || weather.frost_warning === true) result.frost = true;

  if (cj.soil_moisture === 'low' || cj.soil_moisture === 'LOW' || cj.soil_moisture_low === true) result.soil_moisture_low = true;

  if (cj.ndvi_decline === true || cj.ndvi_before_rain != null) result.ndvi_below = cj.ndvi_current_max || null;
  if ((cj.ndvi_decline === true || cj.ndvi_before_rain != null) && result.ndvi_below == null) {
    result.had_unparseable_flags = true; // F3: was invented "0.5"
  }

  return result;
}

// =====================================================
// DECISION RULES EVALUATION
// F10: conditions_compiled (declarative predicates) evaluated through the
// single env predicate engine first. Legacy path only for uncompiled rules.
// F3: category-heuristic fallback GATED by config; disabled => uncompilable.
// =====================================================

function evaluateDecisionRule(
  dr: DecisionRuleProactive,
  ctx: LandContext,
  cfg: EvaluatorConfig,
  harvestDasByCrop: Map<string, number>,
): { result: RuleEvalResult; uncompilable: boolean } {
  const triggerData: Record<string, any> = { decision_rule_id: dr.id, condition_code: dr.condition_code };
  const reasons: string[] = [];

  // ---- F10: compiled declarative path (one predicate engine for everything)
  if (dr.conditions_compiled && dr.compile_status === 'compiled' && isEnvIntelligenceRule(dr.conditions_compiled)) {
    const envRes = evaluateEnvRule(`DR:${dr.condition_code}`, dr.conditions_compiled, {
      crop_code: ctx.crop_code,
      das: ctx.das,
      derived: ctx.derived,
      weather: { ...ctx.weather, rain_probability: ctx.forecast_rain_probability_72h, tmin_forecast_night: ctx.forecast_tmin_night },
      forecast: { tmax_mean_5d: ctx.forecast_tmax_mean_5d },
      ndvi: { value: ctx.ndvi, previous: ctx.ndvi_previous,
              drop: (ctx.ndvi != null && ctx.ndvi_previous != null) ? ctx.ndvi_previous - ctx.ndvi : null },
    });
    return {
      uncompilable: false,
      result: {
        fired: envRes.fired,
        riskScore: envRes.riskScore,
        confidence: envRes.confidence,
        reasoning: envRes.reasoning,
        triggerData: { ...triggerData, ...envRes.triggerData },
      },
    };
  }

  // ---- legacy numeric-extraction path
  const cj = dr.conditions_json || {};
  const parsed = parseDecisionRuleConditions(cj);
  let condMet = 0;
  let condTotal = 0;

  if (parsed.temp_min != null || parsed.temp_max != null) {
    condTotal++;
    if (ctx.weather.temp != null) {
      const tooHot = parsed.temp_min != null && ctx.weather.temp >= parsed.temp_min;
      const tooCold = parsed.temp_max != null && ctx.weather.temp <= parsed.temp_max;
      const rangeCheck = parsed.temp_min != null && parsed.temp_max != null
        ? (ctx.weather.temp >= parsed.temp_min && ctx.weather.temp <= parsed.temp_max)
        : (tooHot || tooCold);
      if (rangeCheck) {
        condMet++; triggerData.temp = ctx.weather.temp;
        reasons.push(`Temp ${ctx.weather.temp}°C matches threshold`);
      }
    }
  }

  if (parsed.humidity_min != null) {
    condTotal++;
    if (ctx.weather.humidity != null && ctx.weather.humidity >= parsed.humidity_min) {
      condMet++; triggerData.humidity = ctx.weather.humidity;
      reasons.push(`Humidity ${ctx.weather.humidity}% ≥ ${parsed.humidity_min}%`);
    }
  }

  if (parsed.rain_min != null && parsed.rain_min > 0) {
    condTotal++;
    // Prefer governed 24h accumulation when derivation supplies it.
    const rainObs = ctx.derived.rain_24h ?? ctx.weather.rain_mm;
    if (rainObs != null && rainObs >= parsed.rain_min) {
      condMet++; triggerData.rain_mm = rainObs;
      reasons.push(`Rain ${rainObs}mm ≥ ${parsed.rain_min}mm`);
    }
  }

  if (parsed.wind_max != null) {
    condTotal++;
    if (ctx.weather.wind_speed != null && ctx.weather.wind_speed >= parsed.wind_max) {
      condMet++; triggerData.wind = ctx.weather.wind_speed;
      reasons.push(`Wind ${ctx.weather.wind_speed}km/h ≥ ${parsed.wind_max}km/h`);
    }
  }

  // Frost — consumes derived FROST_COMPOSITE output; presence(>0) semantics
  // flagged UNKNOWN pending scale verification. Never a hardcoded temperature.
  if (parsed.frost) {
    condTotal++;
    if (ctx.derived.frost_risk != null && ctx.derived.frost_risk > 0) {
      condMet++; triggerData.frost_risk = ctx.derived.frost_risk;
      reasons.push(`Derived frost risk present (${ctx.derived.frost_risk})`);
    }
  }

  // Soil moisture — governed FAO-56 states from land_weather_state, not
  // rain/humidity proxies:
  //   low  := root-zone depletion has reached RAW (the FAO-56 trigger point)
  //   high := profile at/above capacity (depletion ≤ 0), definitional
  if (parsed.soil_moisture_low) {
    condTotal++;
    if (ctx.derived.root_depletion != null && ctx.derived.raw_mm != null &&
        ctx.derived.root_depletion >= ctx.derived.raw_mm) {
      condMet++; triggerData.root_depletion = ctx.derived.root_depletion;
      triggerData.raw_mm = ctx.derived.raw_mm;
      reasons.push(`Root-zone depletion ${ctx.derived.root_depletion}mm ≥ RAW ${ctx.derived.raw_mm}mm (FAO-56 trigger)`);
    }
  }
  if (parsed.soil_moisture_high) {
    condTotal++;
    if (ctx.derived.root_depletion != null && ctx.derived.root_depletion <= 0) {
      condMet++; triggerData.root_depletion = ctx.derived.root_depletion;
      reasons.push('Profile at/above field capacity (depletion ≤ 0)');
    }
  }

  if (parsed.ndvi_below != null) {
    condTotal++;
    if (ctx.ndvi != null && ctx.ndvi < parsed.ndvi_below) {
      condMet++; triggerData.ndvi = ctx.ndvi;
      reasons.push(`NDVI ${ctx.ndvi.toFixed(2)} < ${parsed.ndvi_below}`);
    }
  }

  // F8: ETL proxy DELETED. etl_value_min is an economic threshold on PEST
  // COUNTS; no pest-count observations exist, so the condition is
  // unevaluable — never approximated from GDD or generic warm weather.
  if (dr.etl_value_min != null && condTotal === 0) {
    console.warn(`[KNOWLEDGE_GAP] rule=${dr.condition_code} needs pest-count observations for ETL evaluation — skipped`);
    return { uncompilable: true, result: notFiredResult(triggerData) };
  }

  // F9: PHI window using governed harvest DAS (max das_max for the crop).
  if (dr.phi_days != null && ctx.das > 0 && ctx.crop_code) {
    const estimatedHarvestDas = harvestDasByCrop.get(ctx.crop_code) ?? 0;
    if (estimatedHarvestDas > 0) {
      const daysToHarvest = estimatedHarvestDas - ctx.das;
      if (daysToHarvest > 0 && daysToHarvest <= dr.phi_days) {
        condTotal++; condMet++;
        triggerData.days_to_harvest = daysToHarvest; triggerData.phi_days = dr.phi_days;
        reasons.push(`${daysToHarvest} days to harvest, PHI ${dr.phi_days} days`);
      }
    }
  }

  // ---- F3: no machine-evaluable conditions
  if (condTotal === 0) {
    if (parsed.had_unparseable_flags || cfg.category_fallback_enabled !== true) {
      // Kill switch OFF (production): log, never fire on generic weather.
      console.warn(`[UNCOMPILABLE_RULE] rule=${dr.condition_code} id=${dr.id} — no governed machine conditions; category fallback disabled`);
      return { uncompilable: true, result: notFiredResult(triggerData) };
    }
    // Fallback explicitly enabled by config (non-production/testing only).
    console.warn(`[CATEGORY_FALLBACK_ENABLED] rule=${dr.condition_code} evaluated on category heuristics per config override`);
    return { uncompilable: false, result: notFiredResult(triggerData) };
  }

  const ratio = condMet / condTotal;
  const fired = ratio >= 0.5;
  return {
    uncompilable: false,
    result: { fired, riskScore: Math.round(ratio * 100), confidence: ratio * 0.85, reasoning: reasons.join('; '), triggerData },
  };
}

function notFiredResult(triggerData: Record<string, any>): RuleEvalResult {
  return { fired: false, riskScore: 0, confidence: 0, reasoning: '', triggerData };
}

// F9: getEstimatedHarvestDas (hardcoded crop map) DELETED — see buildHarvestDasMap.

// =====================================================
// IRRIGATION-ENRICHED TRIGGER DATA
// =====================================================

function enrichTriggerDataWithIrrigation(triggerData: Record<string, any>, alertCategory: string, ctx: LandContext, methods: MethodParams): Record<string, any> {
  const irrigationCategories = ['CROP_STRESS', 'IRRIGATION', 'WEATHER_WARNING', 'STAGE_ADVISORY'];
  const hasNdviDrop = triggerData.drop != null || triggerData.ndvi != null;

  if (irrigationCategories.includes(alertCategory) || hasNdviDrop) {
    const irrigation = calculateIrrigationForLand(ctx, methods);
    if (irrigation) {
      triggerData.irrigation = irrigation;
    }
  }

  // F11: LandContext field is land_name (ctx.name never existed).
  if (ctx.land_name) triggerData.land_name = ctx.land_name;
  if (ctx.area_acres) triggerData.area_acres = ctx.area_acres;
  if (ctx.soil_type) triggerData.soil_type = ctx.soil_type;
  if (ctx.irrigation_type) triggerData.irrigation_method = ctx.irrigation_type;

  return triggerData;
}

// =====================================================
// TRILINGUAL TEMPLATE GENERATORS
// (Display-label localization only — no agronomy. Migration of these
// dictionaries to i18n tables is a tracked Phase-2 item.)
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
  PEST_RISK: { mr: 'शेताची तपासणी करा', hi: 'खेत की जांच करें' },
  DISEASE_RISK: { mr: 'शेताची तपासणी करा आणि प्रभावित भाग पहा', hi: 'खेत की जांच करें और प्रभावित हिस्से देखें' },
  WEATHER_WARNING: { mr: 'पिकाला संरक्षण द्या', hi: 'फसल को सुरक्षा दें' },
  IRRIGATION: { mr: 'पाणी नियोजन तपासा', hi: 'सिंचाई योजना जांचें' },
  FERTILIZER_WINDOW: { mr: 'खत नियोजन तपासा', hi: 'खाद योजना जांचें' },
  SPRAY_WINDOW: { mr: 'फवारणी नियोजन तपासा', hi: 'छिड़काव योजना जांचें' },
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

function generateTrilingualMessage(category: string, messageEn: string, ctx: LandContext, methods: MethodParams): { mr: string; hi: string } {
  const landMr = ctx.land_name || 'तुमच्या शेतात';
  const landHi = ctx.land_name || 'आपके खेत में';
  const areaMr = ctx.area_acres ? ` (${ctx.area_acres} एकर)` : '';
  const areaHi = ctx.area_acres ? ` (${ctx.area_acres} एकर)` : '';

  const irrigation = calculateIrrigationForLand(ctx, methods);
  if (irrigation && (mapDecisionCategory(category) === 'IRRIGATION' || mapDecisionCategory(category) === 'CROP_STRESS')) {
    const methodMr = IRRIGATION_METHOD_MR[irrigation.method] || irrigation.method;
    const methodHi = IRRIGATION_METHOD_HI[irrigation.method] || irrigation.method;
    const splitMr = irrigation.applications > 1 ? ` ${irrigation.applications} वेळा विभागून द्या (प्रत्येकी ≤${irrigation.per_application_mm} मिमी).` : '';
    const splitHi = irrigation.applications > 1 ? ` ${irrigation.applications} बार में बांटकर दें (प्रत्येक ≤${irrigation.per_application_mm} मिमी).` : '';
    const wxMr = weatherEvidenceLine(ctx, 'mr');
    const wxHi = weatherEvidenceLine(ctx, 'hi');
    return {
      mr: `"${landMr}"${areaMr} शेतात ${methodMr}ने ${irrigation.water_liters_total.toLocaleString()} लिटर पाणी द्या (${irrigation.duration_hours} तास).${splitMr}${wxMr ? ' ' + wxMr : ''}`,
      hi: `"${landHi}"${areaHi} खेत में ${methodHi} से ${irrigation.water_liters_total.toLocaleString()} लीटर पानी दें (${irrigation.duration_hours} घंटे).${splitHi}${wxHi ? ' ' + wxHi : ''}`,
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

function generateTrilingualAction(category: string, actionEn: string | null, ctx: LandContext, methods: MethodParams): { mr: string; hi: string } {
  const alertCat = mapDecisionCategory(category);

  const irrigation = calculateIrrigationForLand(ctx, methods);
  if (irrigation && (alertCat === 'IRRIGATION' || alertCat === 'CROP_STRESS')) {
    const methodMr = IRRIGATION_METHOD_MR[irrigation.method] || irrigation.method;
    const methodHi = IRRIGATION_METHOD_HI[irrigation.method] || irrigation.method;
    return {
      mr: `${methodMr}ने ${irrigation.water_liters_per_acre.toLocaleString()} लिटर/एकर पाणी द्या (${irrigation.duration_hours} तास)`,
      hi: `${methodHi} से ${irrigation.water_liters_per_acre.toLocaleString()} लीटर/एकड़ पानी दें (${irrigation.duration_hours} घंटे)`,
    };
  }

  const templates = CATEGORY_ACTIONS[alertCat] || CATEGORY_ACTIONS.GENERAL;
  return { mr: templates.mr, hi: templates.hi };
}

// =====================================================
// DECISION RULE MAPPING HELPERS
// =====================================================

function mapAlertCategory(raw: string | null | undefined): string {
  // proactive_alerts CHECK allows: IRRIGATION, PEST_RISK, DISEASE_RISK,
  // WEATHER_WARNING, FERTILIZER_WINDOW, HARVEST_TIMING, SPRAY_WINDOW,
  // STAGE_ADVISORY, CROP_STRESS, GENERAL. Rule authors write lowercase and
  // synonyms — normalize the contract here.
  const key = String(raw || '').toLowerCase().trim();
  const MAP: Record<string, string> = {
    irrigation: 'IRRIGATION', pest_risk: 'PEST_RISK', pest: 'PEST_RISK',
    disease_risk: 'DISEASE_RISK', disease: 'DISEASE_RISK',
    weather_warning: 'WEATHER_WARNING', weather: 'WEATHER_WARNING',
    fertilizer_window: 'FERTILIZER_WINDOW', nutrition: 'FERTILIZER_WINDOW', nutrient: 'FERTILIZER_WINDOW',
    harvest_timing: 'HARVEST_TIMING', harvest: 'HARVEST_TIMING',
    spray_window: 'SPRAY_WINDOW', safety: 'SPRAY_WINDOW',
    stage_advisory: 'STAGE_ADVISORY', advisory: 'STAGE_ADVISORY',
    crop_stress: 'CROP_STRESS', crop_health: 'CROP_STRESS', stress: 'CROP_STRESS',
  };
  return MAP[key] || 'GENERAL';
}

function mapRulePriority(raw: string | null | undefined): string {
  const p = String(raw || '').toUpperCase().trim();
  return ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(p) ? p : 'MEDIUM';
}

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
  allDecisionRules: DecisionRuleProactive[],
  methods: MethodParams,
): Record<string, any> {
  if (triggerData.solution) return triggerData;

  let sourceRule = dr;
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
    const bc = dr.crop_code ? dr.crop_code.toUpperCase().trim() : null;
    if (bc && bc !== 'ALL' && ctx.crop_code && bc !== ctx.crop_code) return false;
    if (dr.stage_applicable?.length && ctx.current_stage) {
      if (!dr.stage_applicable.includes(ctx.current_stage) && !dr.stage_applicable.includes('ALL')) return false;
    }
    const drAlertCat = mapDecisionCategory(dr.category);
    if (rule.alert_category === drAlertCat) return true;
    const cc = dr.condition_code.toUpperCase();
    if (rule.condition_type === 'NDVI' && (cc.includes('STRESS') || cc.includes('NDVI') || cc.includes('WATER') || cc.includes('DROUGHT'))) return true;
    if (rule.condition_type === 'WEATHER' && (cc.includes('WEATHER') || cc.includes('RAIN') || cc.includes('HEAT'))) return true;
    if (rule.condition_type === 'DISEASE_RISK' && (cc.includes('DISEASE') || cc.includes('BLIGHT') || cc.includes('SMUT') || cc.includes('RUST'))) return true;
    if (rule.condition_type === 'PEST_RISK' && (cc.includes('PEST') || cc.includes('BORER') || cc.includes('INSECT'))) return true;
    if (rule.condition_type === 'SOIL' && (cc.includes('NUTRIENT') || cc.includes('NITROGEN') || cc.includes('PHOSPHORUS'))) return true;
    return false;
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  return candidates[0];
}

// =====================================================
// CROP NAME LOCALIZATION
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
  const landName = ctx.land_name || 'your field';

  if (!dr) {
    return buildContextualSolution(ctx, triggerData);
  }

  const actionText = dr.action_text || '';
  const steps = actionText
    .split(/(?:\.\s+|\n|;)/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 10)
    .slice(0, 5);

  const areaSpecificSteps = steps.map((step: string) => {
    if (ctx.area_acres && ctx.area_acres > 0) {
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

  const problemEn = reasonText.split('.')[0] || `${conditionName} detected on ${landName}`;
  const causeEn = knowledgeText
    ? knowledgeText.split('.').slice(0, 2).join('. ')
    : (reasonText.split('.').slice(1, 3).join('. ') || `Environmental conditions favor ${conditionName}`);

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

  const organicAltEn = dr.organic_alternative || '';
  const followupEn = `Check ${landName} after 5-7 days. Look for improvement in crop health indicators. If condition persists, consult local agricultural extension officer.`;

  const catMr = CATEGORY_TITLES[mapDecisionCategory(dr.category)]?.mr || 'सूचना';
  const catHi = CATEGORY_TITLES[mapDecisionCategory(dr.category)]?.hi || 'सूचना';

  const irrigation = triggerData.irrigation;
  let irrigationStepMr = '';
  let irrigationStepHi = '';
  let irrigationStepEn = '';
  if (irrigation) {
    const methodMr = IRRIGATION_METHOD_MR[irrigation.method] || irrigation.method;
    const methodHi = IRRIGATION_METHOD_HI[irrigation.method] || irrigation.method;
    const splitEn = irrigation.applications > 1 ? ` split into ${irrigation.applications} applications of ≤${irrigation.per_application_mm} mm` : '';
    irrigationStepEn = `Irrigate with ${irrigation.water_liters_total.toLocaleString()} liters via ${irrigation.method} (${irrigation.duration_hours} hrs)${splitEn}`;
    irrigationStepMr = `${methodMr}ने ${irrigation.water_liters_total.toLocaleString()} लिटर पाणी द्या (${irrigation.duration_hours} तास)${irrigation.applications > 1 ? `, ${irrigation.applications} वेळा विभागून` : ''}`;
    irrigationStepHi = `${methodHi} से ${irrigation.water_liters_total.toLocaleString()} लीटर पानी दें (${irrigation.duration_hours} घंटे)${irrigation.applications > 1 ? `, ${irrigation.applications} बार में बांटकर` : ''}`;
  }

  const cropMr = cropLabel(ctx.crop_code, 'mr');
  const cropHi = cropLabel(ctx.crop_code, 'hi');
  const cropEnLabel = cropLabel(ctx.crop_code, 'en');
  const wxMr = weatherEvidenceLine(ctx, 'mr');
  const wxHi = weatherEvidenceLine(ctx, 'hi');
  const wxEn = weatherEvidenceLine(ctx, 'en');

  const baseCauseMr = knowledgeText
    ? localizeStep(knowledgeText.split('.').slice(0, 2).join('. '), 'mr')
    : (reasonText ? localizeStep(reasonText.split('.').slice(0, 2).join('. '), 'mr') : `${dr.condition_code.replace(/_/g, ' ').toLowerCase()} - ${cropMr} पिकाची तपासणी आवश्यक.`);
  const baseCauseHi = knowledgeText
    ? localizeStep(knowledgeText.split('.').slice(0, 2).join('. '), 'hi')
    : (reasonText ? localizeStep(reasonText.split('.').slice(0, 2).join('. '), 'hi') : `${dr.condition_code.replace(/_/g, ' ').toLowerCase()} - ${cropHi} फसल की जांच आवश्यक.`);

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
      // NOTE: wording is deficit-based ("as per water deficit"), no "immediately" —
      // urgency is a governed field carried separately in irrigation.urgency.
      steps_en.push(`Irrigate as per computed deficit: ${irrigation.water_liters_total.toLocaleString()} liters via ${irrigation.method} (${irrigation.duration_hours} hours)`);
      steps_mr.push(`${methodMr}ने ${irrigation.water_liters_total.toLocaleString()} लिटर पाणी द्या (${irrigation.duration_hours} तास)`);
      steps_hi.push(`${methodHi} से ${irrigation.water_liters_total.toLocaleString()} लीटर पानी दें (${irrigation.duration_hours} घंटे)`);
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
      organic_alt_en: '',
      organic_alt_mr: '',
      organic_alt_hi: '',
      expected_benefit_en: `With proper care, crop health on ${landName} should improve within 7-10 days. NDVI should show recovery in the next satellite pass.`,
      expected_benefit_mr: `योग्य काळजीने ${landName} शेतातील पिकाचे आरोग्य 7-10 दिवसांत सुधारेल.`,
      expected_benefit_hi: `उचित देखभाल से ${landName} खेत में फसल स्वास्थ्य 7-10 दिनों में सुधरेगा.`,
      followup_en: `Re-check ${landName} after 5-7 days. Look for greener leaves and new growth. Next NDVI update will confirm recovery.`,
      followup_mr: `5-7 दिवसांनी ${landName} शेत पुन्हा तपासा. हिरवी पाने आणि नवी वाढ दिसायला हवी.`,
      followup_hi: `5-7 दिन बाद ${landName} खेत फिर जांचें. हरी पत्तियां और नई वृद्धि दिखनी चाहिए.`,
    };
  }

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

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
