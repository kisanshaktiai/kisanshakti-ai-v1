/**
 * analytics-forecast — AI-powered monthly income / expense / profit projection
 * for each farmer's lands. Stored in `public.analytics_forecasts` and refreshed
 * monthly by a pg_cron job.
 *
 * Modes:
 *   POST { mode: "farmer", farmer_id }        — generate now for one farmer
 *   POST { mode: "all", limit?: number }      — cron sweep (service role)
 *   GET  ?farmer_id=...&months=6              — read cached forecasts (auth user)
 *
 * Uses Lovable AI Gateway (google/gemini-2.5-flash) for narrative reasoning;
 * baseline numbers come from real DB tables (lands, financial_transactions,
 * market_prices, soil_health, weather_current, ndvi_data, schedule_tasks).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const MODEL = 'google/gemini-2.5-flash';
const FORECAST_HORIZON_MONTHS = 6;

const COC_PER_ACRE: Record<string, number> = {
  rice: 32000, paddy: 32000, sugarcane: 65000, cotton: 38000, wheat: 28000,
  maize: 26000, soybean: 24000, tomato: 85000, onion: 70000, potato: 75000,
  groundnut: 30000, default: 30000,
};
const YIELD_Q_PER_ACRE: Record<string, number> = {
  rice: 22, paddy: 22, sugarcane: 320, cotton: 8, wheat: 18, maize: 25,
  soybean: 10, tomato: 180, onion: 140, potato: 110, groundnut: 9, default: 15,
};

function cropKey(c?: string | null): string {
  if (!c) return 'default';
  const k = c.toLowerCase().trim();
  return COC_PER_ACRE[k] ? k : 'default';
}

function monthStart(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString().slice(0, 10);
}

function addMonths(d: Date, m: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1));
}

interface LandCtx {
  id: string;
  name: string;
  area_acres: number;
  current_crop: string | null;
  crop_stage: string | null;
  last_sowing_date: string | null;
  expected_harvest_date: string | null;
}

interface BaselineRow {
  month: string;
  projected_revenue: number;
  projected_expense: number;
  projected_profit: number;
  expected_yield_quintals: number;
  market_price_used: number | null;
  confidence: number;
  breakdown: Record<string, number>;
}

/** Distribute season expense across crop calendar months around sowing/harvest. */
function buildBaseline(
  land: LandCtx,
  marketPrice: number | null,
  actualByMonth: Map<string, number>,
  ndviAvg: number | null,
): BaselineRow[] {
  const ck = cropKey(land.current_crop);
  const area = Math.max(0, Number(land.area_acres) || 0);
  const cocPerAcre = COC_PER_ACRE[ck] ?? COC_PER_ACRE.default;
  const totalSeasonCost = cocPerAcre * area;
  const baseYield = (YIELD_Q_PER_ACRE[ck] ?? YIELD_Q_PER_ACRE.default) * area;
  const ndviFactor = ndviAvg != null
    ? Math.max(0.5, Math.min(1.25, 0.7 + ndviAvg * 0.5))
    : 1;
  const yieldQ = baseYield * ndviFactor;

  const sow = land.last_sowing_date ? new Date(land.last_sowing_date) : null;
  const harv = land.expected_harvest_date ? new Date(land.expected_harvest_date) : null;
  // Expense distribution: 30% in first month, 40% across middle, 30% near harvest.
  const monthsTotal = sow && harv
    ? Math.max(1, Math.round((harv.getTime() - sow.getTime()) / (30 * 86_400_000)))
    : 4;

  const out: BaselineRow[] = [];
  const start = new Date();
  for (let i = 0; i < FORECAST_HORIZON_MONTHS; i++) {
    const m = monthStart(addMonths(start, i));
    const monthDate = new Date(m);
    const monthsSinceSow = sow
      ? Math.round((monthDate.getTime() - sow.getTime()) / (30 * 86_400_000))
      : i;

    // Expense share per month
    let share = 0;
    if (sow && harv && monthsSinceSow >= 0 && monthsSinceSow <= monthsTotal) {
      if (monthsSinceSow === 0) share = 0.30;
      else if (monthsSinceSow === monthsTotal) share = 0.30;
      else share = 0.40 / Math.max(1, monthsTotal - 1);
    } else {
      // Fallow / unknown: spread evenly over horizon
      share = 1 / FORECAST_HORIZON_MONTHS;
    }
    let monthExpense = Math.round(totalSeasonCost * share);
    const actual = actualByMonth.get(m);
    if (actual != null && actual > monthExpense * 0.5) {
      monthExpense = Math.round(actual);
    }

    // Revenue: only in the expected harvest month (and the month right after)
    let monthRevenue = 0;
    if (harv && marketPrice) {
      const hm = monthStart(harv);
      if (m === hm) monthRevenue = Math.round(yieldQ * marketPrice * 0.85);
      else if (m === monthStart(addMonths(harv, 1))) {
        monthRevenue = Math.round(yieldQ * marketPrice * 0.15);
      }
    }

    out.push({
      month: m,
      projected_revenue: Math.max(0, monthRevenue),
      projected_expense: Math.max(0, monthExpense),
      projected_profit: monthRevenue - monthExpense,
      expected_yield_quintals: yieldQ,
      market_price_used: marketPrice,
      confidence: actual != null ? 0.75 : marketPrice ? 0.6 : 0.4,
      breakdown: {
        seeds: Math.round(monthExpense * 0.10),
        fertilizers: Math.round(monthExpense * 0.22),
        pesticides: Math.round(monthExpense * 0.10),
        labor: Math.round(monthExpense * 0.32),
        irrigation: Math.round(monthExpense * 0.10),
        machinery: Math.round(monthExpense * 0.10),
        other: Math.round(monthExpense * 0.06),
      },
    });
  }
  return out;
}

async function aiAdjustment(
  land: LandCtx,
  baseline: BaselineRow[],
  weather: any,
  soil: any,
): Promise<{ reasoning: string; multipliers: number[] } | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const prompt = `You are an Indian agronomy + farm-economics analyst.
Adjust this 6-month projection for ONE land based on agronomic conditions.

LAND: ${land.name} (${land.area_acres} acres)
CROP: ${land.current_crop || 'fallow'}  STAGE: ${land.crop_stage || 'n/a'}
SOWING: ${land.last_sowing_date || 'n/a'}  HARVEST: ${land.expected_harvest_date || 'n/a'}
WEATHER: temp=${weather?.temperature_celsius ?? '?'}°C, humidity=${weather?.humidity_percent ?? '?'}%, rain24h=${weather?.rain_24h_mm ?? '?'}mm
SOIL: pH=${soil?.ph_level ?? '?'}, N=${soil?.nitrogen_kg_per_ha ?? '?'}, P=${soil?.phosphorus_kg_per_ha ?? '?'}, K=${soil?.potassium_kg_per_ha ?? '?'}, OC=${soil?.organic_carbon ?? '?'}

BASELINE (rupees):
${baseline.map((b) => `${b.month}: revenue=${b.projected_revenue}, expense=${b.projected_expense}`).join('\n')}

Return strict JSON only:
{
  "reasoning": "1-2 short sentences about the biggest risk or opportunity",
  "multipliers": [
    {"month":"YYYY-MM-01","revenue_mult":1.0,"expense_mult":1.0},
    ... 6 entries
  ]
}
Keep multipliers in [0.7, 1.3]. Never multiply revenue by zero just because there is no harvest in that month — keep 1.0. Reflect risks: high temp + low rain → expense_mult ↑ (irrigation/pesticide); good NPK → revenue_mult ↑ slightly.`;

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      console.warn('AI gateway error', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(text);
    const months = baseline.map((b) => b.month);
    const mults = months.map((m) => {
      const row = (parsed.multipliers || []).find((x: any) => x.month === m);
      const rev = Math.max(0.7, Math.min(1.3, Number(row?.revenue_mult) || 1));
      const exp = Math.max(0.7, Math.min(1.3, Number(row?.expense_mult) || 1));
      return { rev, exp };
    });
    return {
      reasoning: String(parsed.reasoning || '').slice(0, 280),
      // pack as flat numbers (rev,exp pairs) — caller will use index
      multipliers: mults.flatMap((m) => [m.rev, m.exp]),
    };
  } catch (e) {
    console.warn('AI adjust failed', e);
    return null;
  }
}

async function generateForFarmer(supabase: any, farmerId: string) {
  const { data: lands } = await supabase
    .from('lands')
    .select('id, name, area_acres, current_crop, crop_stage, last_sowing_date, expected_harvest_date, tenant_id')
    .eq('farmer_id', farmerId);

  if (!lands?.length) return { farmer_id: farmerId, lands: 0, rows: 0 };

  const landIds = lands.map((l: any) => l.id);
  const sixMonthsAgo = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);

  const [finRes, marketRes, weatherRes, soilRes, ndviRes] = await Promise.all([
    supabase.from('financial_transactions')
      .select('land_id, transaction_type, amount, transaction_date')
      .eq('farmer_id', farmerId)
      .gte('transaction_date', sixMonthsAgo)
      .limit(2000),
    supabase.from('market_prices')
      .select('commodity_name_normalized, crop_name, modal_price, price_per_unit, price_date')
      .gte('price_date', new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10))
      .order('price_date', { ascending: false })
      .limit(500),
    supabase.from('weather_current')
      .select('land_id, temperature_celsius, humidity_percent, rain_24h_mm, observation_time')
      .in('land_id', landIds)
      .order('observation_time', { ascending: false }),
    supabase.from('soil_health')
      .select('land_id, ph_level, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, organic_carbon')
      .in('land_id', landIds)
      .order('test_date', { ascending: false }),
    supabase.from('ndvi_data')
      .select('land_id, mean_ndvi, ndvi_value, date')
      .in('land_id', landIds)
      .gte('date', sixMonthsAgo)
      .limit(2000),
  ]);

  const weatherByLand = new Map<string, any>();
  (weatherRes.data || []).forEach((w: any) => {
    if (!weatherByLand.has(w.land_id)) weatherByLand.set(w.land_id, w);
  });
  const soilByLand = new Map<string, any>();
  (soilRes.data || []).forEach((s: any) => {
    if (!soilByLand.has(s.land_id)) soilByLand.set(s.land_id, s);
  });
  const ndviByLand = new Map<string, number[]>();
  (ndviRes.data || []).forEach((n: any) => {
    const v = Number(n.mean_ndvi ?? n.ndvi_value);
    if (Number.isFinite(v)) {
      const arr = ndviByLand.get(n.land_id) || [];
      arr.push(v);
      ndviByLand.set(n.land_id, arr);
    }
  });
  const market = marketRes.data || [];

  const rowsToUpsert: any[] = [];
  const farmMonthly = new Map<string, { rev: number; exp: number }>();
  const generatedFor = monthStart(new Date());

  for (const land of lands as LandCtx[]) {
    const cropLc = (land.current_crop || '').toLowerCase();
    const pr = cropLc
      ? market.find((m: any) =>
          (m.commodity_name_normalized || m.crop_name || '').toLowerCase().includes(cropLc)
            && (m.modal_price || m.price_per_unit),
        )
      : null;
    const marketPrice = Number(pr?.modal_price ?? pr?.price_per_unit) || null;

    const actualByMonth = new Map<string, number>();
    (finRes.data || [])
      .filter((f: any) => f.land_id === land.id && f.transaction_type === 'expense')
      .forEach((f: any) => {
        const m = monthStart(new Date(f.transaction_date));
        actualByMonth.set(m, (actualByMonth.get(m) || 0) + Number(f.amount || 0));
      });

    const ndviArr = ndviByLand.get(land.id) || [];
    const ndviAvg = ndviArr.length ? ndviArr.reduce((a, b) => a + b, 0) / ndviArr.length : null;

    const baseline = buildBaseline(land, marketPrice, actualByMonth, ndviAvg);
    const ai = await aiAdjustment(land, baseline, weatherByLand.get(land.id), soilByLand.get(land.id));

    baseline.forEach((b, i) => {
      const revMul = ai?.multipliers?.[i * 2] ?? 1;
      const expMul = ai?.multipliers?.[i * 2 + 1] ?? 1;
      const rev = Math.max(0, Math.round(b.projected_revenue * revMul));
      const exp = Math.max(0, Math.round(b.projected_expense * expMul));
      const profit = rev - exp;
      const agg = farmMonthly.get(b.month) || { rev: 0, exp: 0 };
      farmMonthly.set(b.month, { rev: agg.rev + rev, exp: agg.exp + exp });
      rowsToUpsert.push({
        farmer_id: farmerId,
        tenant_id: (land as any).tenant_id ?? null,
        land_id: land.id,
        scope: 'land',
        forecast_month: b.month,
        generated_for_month: generatedFor,
        crop: land.current_crop,
        area_acres: land.area_acres,
        projected_revenue: rev,
        projected_expense: exp,
        projected_profit: profit,
        expected_yield_quintals: b.expected_yield_quintals,
        market_price_used: b.market_price_used,
        confidence: b.confidence,
        ai_reasoning: ai?.reasoning ?? null,
        breakdown: { ...b.breakdown, revenue_mult: revMul, expense_mult: expMul },
        model_version: MODEL,
      });
    });
  }

  // Farm aggregate rows
  for (const [m, agg] of farmMonthly.entries()) {
    rowsToUpsert.push({
      farmer_id: farmerId,
      tenant_id: (lands[0] as any).tenant_id ?? null,
      land_id: null,
      scope: 'farm',
      forecast_month: m,
      generated_for_month: generatedFor,
      crop: null,
      area_acres: lands.reduce((s: number, l: any) => s + (Number(l.area_acres) || 0), 0),
      projected_revenue: agg.rev,
      projected_expense: agg.exp,
      projected_profit: agg.rev - agg.exp,
      expected_yield_quintals: null,
      market_price_used: null,
      confidence: 0.55,
      ai_reasoning: null,
      breakdown: {},
      model_version: MODEL,
    });
  }

  // Upsert in chunks
  const chunk = 200;
  for (let i = 0; i < rowsToUpsert.length; i += chunk) {
    const slice = rowsToUpsert.slice(i, i + chunk);
    const landRows = slice.filter((r) => r.land_id);
    const farmRows = slice.filter((r) => !r.land_id);
    if (landRows.length) {
      const { error } = await supabase
        .from('analytics_forecasts')
        .upsert(landRows, { onConflict: 'farmer_id,land_id,forecast_month,scope' });
      if (error) console.error('upsert land rows error', error);
    }
    if (farmRows.length) {
      const { error } = await supabase
        .from('analytics_forecasts')
        .upsert(farmRows, { onConflict: 'farmer_id,forecast_month,scope' });
      if (error) console.error('upsert farm rows error', error);
    }
  }

  return { farmer_id: farmerId, lands: lands.length, rows: rowsToUpsert.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const farmerId = url.searchParams.get('farmer_id');
      const months = Number(url.searchParams.get('months') || '6');
      if (!farmerId) {
        return new Response(JSON.stringify({ error: 'farmer_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const today = monthStart(new Date());
      const end = monthStart(addMonths(new Date(), months));
      const { data, error } = await supabase
        .from('analytics_forecasts')
        .select('*')
        .eq('farmer_id', farmerId)
        .gte('forecast_month', today)
        .lt('forecast_month', end)
        .order('forecast_month', { ascending: true });
      if (error) throw error;
      return new Response(JSON.stringify({ forecasts: data ?? [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'farmer';

    if (mode === 'farmer') {
      const farmerId = body.farmer_id;
      if (!farmerId) {
        return new Response(JSON.stringify({ error: 'farmer_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const result = await generateForFarmer(supabase, farmerId);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'all') {
      const limit = Math.min(Number(body.limit || 500), 2000);
      const { data: farmers } = await supabase
        .from('lands')
        .select('farmer_id')
        .not('current_crop', 'is', null)
        .limit(limit * 5);
      const ids = [...new Set((farmers || []).map((f: any) => f.farmer_id))].slice(0, limit);
      const results: any[] = [];
      for (const id of ids) {
        try { results.push(await generateForFarmer(supabase, id)); }
        catch (e) { console.error('farmer failed', id, e); }
      }
      return new Response(JSON.stringify({ processed: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unknown mode' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('analytics-forecast error', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
