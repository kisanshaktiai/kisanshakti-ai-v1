// CHANGE LOG (newest first)
// 2026-11-11 13:10 UTC — Ranked feed: markets placed at their own town; road distance/time via Google Routes (distanceKind road|approx).
// 2026-11-11 12:50 UTC — Cursor-page price reads, share public catalogs, and classify transient timeout responses.
// 2026-11-11 — Separate source-coded livestock across market queries; complete catalogs and paged ranked results.
// 2026-11-10 — Proximity feed: new action fetchRankedPrices ranks the latest price per
//   market+crop by the farmer's land (same district / ≤100 km / ≤200 km / major terminal
//   markets by data volume / rest). Market coordinates come from DB location tables
//   (marketGeo.ts). getTopMarkets/getMarkets/getCrops/getCropGroups page past the
//   1000-row cap over a recent window; history windows anchor to the latest price_date
//   for the crop and keep the newest rows (was now() + ascending limit 200).
// 2026-09-27 — AI model SSOT: getAIAnalysis calls callAITask task 'market.advice'; the model
//   comes from ai_task_route_step (was the literal 'gpt-4o-mini' posted straight to the OpenAI
//   endpoint with OPENAI_API_KEY). Request knobs unchanged: max 1000 output tokens,
//   temperature 0.7 (sent where the model's contract allows it), no JSON mode, no reasoning
//   effort. Result handling unchanged: an HTTP error or empty reply parses as '{}' (success
//   with an empty analysis, as the old unchecked response did), a transport failure goes to
//   the 500 catch, no provider key gives the same 500 "not configured" response.
//   Differences: that key check now happens after the market_prices read instead of before
//   it; the call now has the router's 55 s budget (there was no timeout); every call writes
//   one ai_model_metrics row.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from '../_shared/cors.ts';
import { callAITask } from '../_shared/aiConfig.ts';
import { resolveMarkets } from './marketGeo.ts';
import { roadDistances } from './roadDistance.ts';
import { marketScope, matchesScope, scopeQuery, pricePage } from './commodityScope.ts';
import { cursorRows, cachedRead } from './marketReads.ts';
import { isDatabaseTimeout, retryDatabaseRead } from '../_shared/readResilience.ts';

// deno-lint-ignore no-explicit-any
async function pageRows(build: () => any): Promise<any[]> {
  return cursorRows((after, size) => {
    return retryDatabaseRead(() => {
      let query = build().order('id').limit(size);
      if (after) query = query.gt('id', after);
      return query;
    });
  });
}

// deno-lint-ignore no-explicit-any
async function latestDate(supabase: any, crop?: string, scope = marketScope(undefined)): Promise<string | null> {
  let q = scopeQuery(supabase.from('market_prices').select('price_date'), scope).order('price_date', { ascending: false }).limit(1);
  if (crop && crop !== 'all') q = q.ilike('crop_name', `%${crop}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data?.[0]?.price_date ?? null;
}
function daysBefore(d: string, n: number) { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().split('T')[0]; }


const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!supabaseUrl || !supabaseKey) throw new Error('Supabase configuration missing');
const supabase = createClient(supabaseUrl, supabaseKey);
const publicCatalog = cachedRead(async () => {
  // Disjoint UUID ranges keep cold catalog reads bounded without deep offsets.
  // Each range advances serially; concurrent selectors reuse this same load.
  const partitions = await Promise.all(Array.from({ length: 4 }, (_, i) => pageRows(() => {
    let query = supabase.from('market_prices')
      .select('id,crop_name,commodity_category,commodity_code,market_location')
      .gte('id', `${(i * 4).toString(16)}0000000-0000-0000-0000-000000000000`);
    if (i < 3) query = query.lt('id', `${((i + 1) * 4).toString(16)}0000000-0000-0000-0000-000000000000`);
    return query;
  })));
  const unique = new Map<string, (typeof partitions)[number][number]>();
  for (const row of partitions.flat()) {
    unique.set(JSON.stringify([row.crop_name, row.commodity_category, row.commodity_code, row.market_location]), row);
  }
  return [...unique.values()];
});
async function catalog(scope: ReturnType<typeof marketScope>) {
  return (await publicCatalog()).filter(row => matchesScope(row.commodity_code, scope));
}

// Haversine formula to calculate distance between two points in km
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Parse location to get approximate coordinates (simplified geocoding)
function getMarketCoordinates(location: string, district: string): { lat: number; lon: number } | null {
  // Maharashtra major market coordinates - includes Marathi names
  const marketCoords: Record<string, { lat: number; lon: number }> = {
    'pune': { lat: 18.5204, lon: 73.8567 },
    'पुणे': { lat: 18.5204, lon: 73.8567 },
    'mumbai': { lat: 19.0760, lon: 72.8777 },
    'मुंबई': { lat: 19.0760, lon: 72.8777 },
    'nashik': { lat: 19.9975, lon: 73.7898 },
    'नाशिक': { lat: 19.9975, lon: 73.7898 },
    'nagpur': { lat: 21.1458, lon: 79.0882 },
    'नागपूर': { lat: 21.1458, lon: 79.0882 },
    'aurangabad': { lat: 19.8762, lon: 75.3433 },
    'औरंगाबाद': { lat: 19.8762, lon: 75.3433 },
    'kolhapur': { lat: 16.7050, lon: 74.2433 },
    'कोल्हापूर': { lat: 16.7050, lon: 74.2433 },
    'solapur': { lat: 17.6599, lon: 75.9064 },
    'सोलापूर': { lat: 17.6599, lon: 75.9064 },
    'sangli': { lat: 16.8524, lon: 74.5815 },
    'सांगली': { lat: 16.8524, lon: 74.5815 },
    'satara': { lat: 17.6805, lon: 74.0183 },
    'सातारा': { lat: 17.6805, lon: 74.0183 },
    'ahmednagar': { lat: 19.0948, lon: 74.7480 },
    'अहमदनगर': { lat: 19.0948, lon: 74.7480 },
    'jalgaon': { lat: 21.0077, lon: 75.5626 },
    'जळगाव': { lat: 21.0077, lon: 75.5626 },
    'dhule': { lat: 20.9042, lon: 74.7749 },
    'धुळे': { lat: 20.9042, lon: 74.7749 },
    'nanded': { lat: 19.1383, lon: 77.3210 },
    'नांदेड': { lat: 19.1383, lon: 77.3210 },
    'latur': { lat: 18.4088, lon: 76.5604 },
    'लातूर': { lat: 18.4088, lon: 76.5604 },
    'osmanabad': { lat: 18.1860, lon: 76.0440 },
    'उस्मानाबाद': { lat: 18.1860, lon: 76.0440 },
    'beed': { lat: 18.9891, lon: 75.7531 },
    'बीड': { lat: 18.9891, lon: 75.7531 },
    'parbhani': { lat: 19.2610, lon: 76.7748 },
    'परभणी': { lat: 19.2610, lon: 76.7748 },
    'hingoli': { lat: 19.7173, lon: 77.1461 },
    'हिंगोली': { lat: 19.7173, lon: 77.1461 },
    'akola': { lat: 20.7002, lon: 77.0082 },
    'अकोला': { lat: 20.7002, lon: 77.0082 },
    'amravati': { lat: 20.9374, lon: 77.7796 },
    'अमरावती': { lat: 20.9374, lon: 77.7796 },
    'yavatmal': { lat: 20.3899, lon: 78.1307 },
    'यवतमाळ': { lat: 20.3899, lon: 78.1307 },
    'wardha': { lat: 20.7453, lon: 78.6022 },
    'वर्धा': { lat: 20.7453, lon: 78.6022 },
    'chandrapur': { lat: 19.9615, lon: 79.2961 },
    'चंद्रपूर': { lat: 19.9615, lon: 79.2961 },
    'gadchiroli': { lat: 20.1809, lon: 80.0000 },
    'गडचिरोली': { lat: 20.1809, lon: 80.0000 },
    'bhandara': { lat: 21.1669, lon: 79.6500 },
    'भंडारा': { lat: 21.1669, lon: 79.6500 },
    'gondia': { lat: 21.4602, lon: 80.1920 },
    'गोंदिया': { lat: 21.4602, lon: 80.1920 },
    'buldhana': { lat: 20.5293, lon: 76.1842 },
    'बुलढाणा': { lat: 20.5293, lon: 76.1842 },
    'washim': { lat: 20.1120, lon: 77.1339 },
    'वाशिम': { lat: 20.1120, lon: 77.1339 },
    'ratnagiri': { lat: 16.9902, lon: 73.3120 },
    'रत्नागिरी': { lat: 16.9902, lon: 73.3120 },
    'sindhudurg': { lat: 16.3489, lon: 73.5339 },
    'सिंधुदुर्ग': { lat: 16.3489, lon: 73.5339 },
    'raigad': { lat: 18.5158, lon: 73.1822 },
    'रायगड': { lat: 18.5158, lon: 73.1822 },
    'thane': { lat: 19.2183, lon: 72.9781 },
    'ठाणे': { lat: 19.2183, lon: 72.9781 },
    'palghar': { lat: 19.6967, lon: 72.7699 },
    'पालघर': { lat: 19.6967, lon: 72.7699 },
  };
  
  // Try exact match first, then partial match
  const searchText = (location || district || '').toLowerCase();
  
  // Direct lookup
  if (marketCoords[searchText]) {
    return marketCoords[searchText];
  }
  
  // Try to find a matching key
  for (const [key, coords] of Object.entries(marketCoords)) {
    if (searchText.includes(key) || key.includes(searchText)) {
      return coords;
    }
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, params = {} } = await req.json();
    const scope = marketScope(params.scope);

    console.log(`[market-price-intelligence] Action: ${action}`, params);

    switch (action) {
      case 'fetchPrices': {
        // FIXED: Removed state filter since all data is from Maharashtra (state column is NULL)
        const { crop, date, district, market, limit = 100 } = params;
        
        let query = supabase
          .from('market_prices')
          .select('*')
          .order('price_date', { ascending: false })
          .limit(limit);

        // Filter by crop name
        query = scopeQuery(query, scope);
        if (crop && crop !== 'all') query = query.ilike('crop_name', `%${crop}%`);
        // Filter by district
        if (district) query = query.ilike('district', `%${district}%`);
        // Filter by market location
        if (market && market !== 'all') query = query.ilike('market_location', `%${market}%`);
        // Filter by exact date
        if (date) query = query.eq('price_date', date);

        const { data, error } = await query;
        
        if (error) throw error;

        console.log(`[market-price-intelligence] fetchPrices returned ${data?.length || 0} records`);

        // Group by date
        const groupedByDate: Record<string, any[]> = {};
        (data || []).forEach((item: any) => {
          const dateKey = item.price_date || 'unknown';
          if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
          groupedByDate[dateKey].push(item);
        });

        return new Response(JSON.stringify({ 
          success: true, 
          data: data || [],
          groupedByDate,
          totalRecords: data?.length || 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'fetchRankedPrices': {
        const { lat, lon, district: farmerDistrict, crop, group, corridor = 'all', limit: requestedLimit = 120, offset: requestedOffset = 0 } = params || {};
        const anchor = await latestDate(supabase, crop, scope);
        if (!anchor) {
          return new Response(JSON.stringify({ success: true, data: [], latestDate: null, tiers: {}, totalRecords: 0, hasMore: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const limit = Math.min(500, Math.max(1, Number(requestedLimit) || 120));
        const offset = Math.max(0, Math.floor(Number(requestedOffset) || 0));
        const rows = await pageRows(() => {
          let q = supabase.from('market_prices')
            .select('id,crop_name,variety,price_per_unit,unit,market_location,district,state,price_date,min_price,max_price,modal_price,arrival,commodity_category,commodity_code')
            .gte('price_date', daysBefore(anchor, 7));
          q = scopeQuery(q, scope);
          if (crop && crop !== 'all') q = q.ilike('crop_name', `%${crop}%`);
          if (group && group !== 'all') q = q.eq('commodity_category', group);
          return q;
        });

        rows.sort((a, b) => String(b.price_date).localeCompare(String(a.price_date)) || String(a.id).localeCompare(String(b.id)));
        // Newest row per market + crop + variety.
        const latest = new Map<string, any>();
        const volume = new Map<string, number>();
        for (const r of rows) {
          const key = `${r.market_location}|${r.crop_name}|${r.variety || ''}`;
          if (!latest.has(key)) latest.set(key, r);
          volume.set(r.market_location, (volume.get(r.market_location) || 0) + 1);
        }
        // Major terminal markets = the busiest markets in the data (data-driven, not a fixed list).
        const majors = new Set([...volume.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m]) => m));
        const mDistrict = new Map<string, string>();
        for (const r of rows) if (r.district && !mDistrict.has(r.market_location)) mDistrict.set(r.market_location, r.district);
        const geo = await resolveMarkets(supabase, [...volume.keys()], 'Maharashtra', mDistrict);
        const hasFarm = Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && lat !== null && lon !== null;
        // Road distance for the nearest markets (straight-line pre-sort, bounded batch).
        const road = new Map<string, { km: number; min: number }>();
        if (hasFarm) {
          const o = { lat: Number(lat), lon: Number(lon) };
          const cand = [...geo.entries()].filter(([, g]) => g)
            .map(([m, g]) => ({ key: m, lat: g!.lat, lon: g!.lon, d: haversineDistance(o.lat, o.lon, g!.lat, g!.lon) }))
            .filter((c) => c.d <= 250).sort((a, b) => a.d - b.d);
          for (const [k, v] of await roadDistances(o, cand)) road.set(k, v);
        }
        const fd = String(farmerDistrict || '').trim().toLowerCase();

        const tierOrder: Record<string, number> = { near: 0, regional: 1, major: 2, other: 3 };
        const items = [...latest.values()].map((r) => {
          const g = geo.get(r.market_location) || null;
          const rd = road.get(r.market_location);
          const distance = rd ? rd.km : hasFarm && g ? Math.round(haversineDistance(Number(lat), Number(lon), g.lat, g.lon)) : undefined;
          const distanceKind = rd ? 'road' : distance !== undefined ? 'approx' : undefined;
          const sameDistrict = !!fd && !!g?.district && g.district.toLowerCase() === fd;
          let tier = 'other';
          if (sameDistrict || (distance !== undefined && distance <= 100)) tier = 'near';
          else if (distance !== undefined && distance <= 200) tier = 'regional';
          else if (majors.has(r.market_location)) tier = 'major';
          return { ...r, district: r.district || g?.district || null, distance, distanceKind, travelMinutes: rd?.min, tier, is_major_market: majors.has(r.market_location) };
        });
        const filtered = items.filter((i) =>
          corridor === 'near' ? i.tier === 'near'
          : corridor === 'regional' ? i.tier === 'near' || i.tier === 'regional'
          : corridor === 'major' ? i.is_major_market
          : true);
        filtered.sort((a, b) =>
          tierOrder[a.tier] - tierOrder[b.tier]
          || (a.distance ?? 1e9) - (b.distance ?? 1e9)
          || String(b.price_date).localeCompare(String(a.price_date))
          || Number(b.arrival || 0) - Number(a.arrival || 0));
        const tiers: Record<string, number> = { near: 0, regional: 0, major: 0, other: 0 };
        for (const i of items) tiers[i.tier]++;

        return new Response(JSON.stringify({
          success: true, ...pricePage(filtered, offset, limit), latestDate: anchor, tiers,
          majorMarkets: [...majors], located: hasFarm,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'fetchNearbyMarkets': {
        const { lat, lon, radiusKm = 50, crop, limit = 50 } = params;
        
        if (!lat || !lon) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Latitude and longitude required' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // FIXED: Removed state filter - fetch all market prices
        let query = supabase
          .from('market_prices')
          .select('*')
          .order('price_date', { ascending: false })
          .limit(500);

        query = scopeQuery(query, scope);
        if (crop && crop !== 'all') query = query.ilike('crop_name', `%${crop}%`);

        const { data, error } = await query;
        if (error) throw error;

        console.log(`[market-price-intelligence] fetchNearbyMarkets fetched ${data?.length || 0} records for distance calc`);

        // Calculate distances and filter nearby markets
        const nearbyMarkets = (data || [])
          .map((market: any) => {
            const marketCoords = getMarketCoordinates(
              market.market_location || '',
              market.district || ''
            );
            
            if (!marketCoords) return null;
            
            const distance = haversineDistance(lat, lon, marketCoords.lat, marketCoords.lon);
            return { ...market, distance: Math.round(distance * 10) / 10 };
          })
          .filter((m: any) => m && m.distance <= radiusKm)
          .sort((a: any, b: any) => a.distance - b.distance)
          .slice(0, limit);

        console.log(`[market-price-intelligence] Found ${nearbyMarkets.length} nearby markets within ${radiusKm}km`);

        return new Response(JSON.stringify({ 
          success: true, 
          data: nearbyMarkets,
          searchRadius: radiusKm,
          marketsFound: nearbyMarkets.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getHistoricalComparison': {
        // FIXED: Removed state filter
        const { crop, district, market, periods = ['week', 'month', 'year'] } = params;
        
        const anchor = await latestDate(supabase, crop, scope);
        const today = anchor ? new Date(anchor) : new Date();
        const comparisons: Record<string, any> = {};

        for (const period of periods) {
          let daysBack = 7;
          if (period === 'month') daysBack = 30;
          if (period === 'year') daysBack = 365;

          const pastDate = new Date(today);
          pastDate.setDate(pastDate.getDate() - daysBack);
          const pastDateStr = pastDate.toISOString().split('T')[0];

          let query = supabase
            .from('market_prices')
            .select('crop_name, price_per_unit, min_price, max_price, modal_price, price_date, market_location, district')
            .gte('price_date', pastDateStr)
            .order('price_date', { ascending: false });

          query = scopeQuery(query, scope);
        if (crop && crop !== 'all') query = query.ilike('crop_name', `%${crop}%`);
          if (district) query = query.ilike('district', `%${district}%`);
          if (market) query = query.ilike('market_location', `%${market}%`);

          const { data: newest, error } = await query.limit(1000);
          if (error) throw error;
          const data = (newest || []).slice().reverse();

          // Calculate trend
          if (data && data.length > 1) {
            const prices = data.map((d: any) => d.modal_price || d.price_per_unit || 0).filter((p: number) => p > 0);
            const avgPrice = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
            const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
            const secondHalf = prices.slice(Math.floor(prices.length / 2));
            const firstAvg = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length || 0;
            const secondAvg = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length || 0;
            const trend = secondAvg > firstAvg ? 'up' : secondAvg < firstAvg ? 'down' : 'stable';
            const changePercent = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg * 100).toFixed(1) : '0';

            comparisons[period] = {
              data,
              stats: {
                avgPrice: Math.round(avgPrice),
                minPrice: Math.min(...prices),
                maxPrice: Math.max(...prices),
                trend,
                changePercent,
                dataPoints: prices.length
              }
            };
          } else {
            comparisons[period] = { data: data || [], stats: null };
          }
        }

        return new Response(JSON.stringify({ 
          success: true, 
          comparisons 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getAIAnalysis': {
        const { crop, district, market, currentPrice, historicalData } = params;

        // Fetch recent market data for context - FIXED: removed state filter
        let query = supabase
          .from('market_prices')
          .select('*')
          .order('price_date', { ascending: false })
          .limit(50);

        query = scopeQuery(query, scope);
        if (crop && crop !== 'all') query = query.ilike('crop_name', `%${crop}%`);

        const { data: marketData } = await query;

        const prompt = `You are an expert agricultural market analyst for Indian farmers, especially Maharashtra. 
        
Analyze this market data and provide selling recommendations:

Crop: ${crop || 'General'}
State: Maharashtra (MSAMB data)
District: ${district || 'Not specified'}
Market: ${market || 'Not specified'}
Current Price: ₹${currentPrice || 'Not available'}

Recent Market Data:
${JSON.stringify(marketData?.slice(0, 20) || [], null, 2)}

Historical Context:
${JSON.stringify(historicalData || {}, null, 2)}

Provide analysis in JSON format with these fields:
{
  "recommendation": "SELL_NOW" | "WAIT" | "HOLD",
  "confidence": 0-100,
  "reasoning": "Brief explanation in simple farmer-friendly language",
  "bestMarkets": ["List of 3 best markets to sell"],
  "priceOutlook": "up" | "down" | "stable",
  "expectedPriceRange": { "min": number, "max": number },
  "bestTimeToSell": "When to sell (e.g., 'within 2 weeks')",
  "tips": ["3 actionable tips for the farmer"]
}

Respond ONLY with valid JSON, no markdown.`;

        // 2026-09-27 — AI model SSOT: model from registry task market.advice (was 'gpt-4o-mini').
        // Same request: max 1000 output tokens, temperature 0.7.
        const aiResponse = await callAITask({
          db: supabase,
          task: 'market.advice',
          functionName: 'market-price-intelligence',
          messages: [
            { role: 'system', content: 'You are an agricultural market analyst. Always respond with valid JSON only.' },
            { role: 'user', content: prompt }
          ],
          farmerId: null,
          maxOutputTokens: 1000,
          temperature: 0.7,
          metadata: { caller: 'market-price-intelligence' },
        });

        if (!aiResponse.ok) {
          // Every model skipped for a missing provider key ⇒ the old "not configured" response.
          if (aiResponse.errorClass === 'no_provider_available' && aiResponse.attempts.every((a) => a.outcome === 'skipped_no_key')) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'OpenAI API key not configured' 
            }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          console.error('[market-price-intelligence] AI call failed:', aiResponse.httpStatus ?? '-', aiResponse.errorClass, aiResponse.detail);
          // No HTTP response at all was a thrown fetch before ⇒ the 500 catch. An HTTP error
          // or an empty reply was parsed as '{}' below, unchanged.
          if (!aiResponse.httpStatus && aiResponse.errorClass !== 'empty_output') {
            throw new Error(`AI API error: ${aiResponse.errorClass}`);
          }
        }
        let analysis;
        
        try {
          const content = (aiResponse.ok ? aiResponse.content : '') || '{}';
          analysis = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
        } catch (e) {
          console.error('Failed to parse AI response:', e);
          analysis = {
            recommendation: 'HOLD',
            confidence: 50,
            reasoning: 'Unable to analyze current market conditions. Please check individual market prices.',
            bestMarkets: [],
            priceOutlook: 'stable',
            tips: ['Monitor daily prices', 'Compare multiple markets', 'Consider storage costs']
          };
        }

        return new Response(JSON.stringify({ 
          success: true, 
          analysis 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getFarmerLocation': {
        const { farmerId } = params;
        
        if (!farmerId) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Farmer ID required' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get farmer's lands with coordinates
        const { data: lands, error } = await supabase
          .from('lands')
          .select('id, name, state, district, center_lat, center_lon')
          .eq('farmer_id', farmerId)
          .limit(1);

        if (error) throw error;

        const land = lands?.[0];
        
        return new Response(JSON.stringify({ 
          success: true, 
          location: land ? {
            state: land.state || 'Maharashtra',
            district: land.district,
            lat: land.center_lat,
            lon: land.center_lon
          } : null
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getStates': {
        // FIXED: All data is from Maharashtra (MSAMB source), state column is NULL
        // Return hardcoded Maharashtra
        return new Response(JSON.stringify({ 
          success: true, 
          states: ['महाराष्ट्र'],
          note: 'Currently showing Maharashtra state data from MSAMB'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getMarkets': {
        // NEW: Fetch unique market locations
        const data = await catalog(scope);

        const uniqueMarkets = [...new Set((data || []).map((d: any) => d.market_location))].filter(Boolean).sort();

        console.log(`[market-price-intelligence] Found ${uniqueMarkets.length} unique markets`);

        return new Response(JSON.stringify({ 
          success: true, 
          markets: uniqueMarkets 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getCrops': {
        // Filter by group if provided
        const { group } = params;
        const data = (await catalog(scope)).filter(row => row.crop_name && (!group || group === 'all' || row.commodity_category === group));

        const uniqueCrops = [...new Set((data || []).map((d: any) => d.crop_name))].filter(Boolean).sort();
        const categories = [...new Set((data || []).map((d: any) => d.commodity_category))].filter(Boolean);

        console.log(`[market-price-intelligence] Found ${uniqueCrops.length} unique crops for group: ${group || 'all'}`);

        return new Response(JSON.stringify({ 
          success: true, 
          crops: uniqueCrops,
          categories 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getCropGroups': {
        // Get unique crop groups with counts
        const data = await catalog(scope);

        // Count crops per group
        const groupCounts: Record<string, Set<string>> = {};
        (data || []).forEach((d: any) => {
          const group = d.commodity_category || 'इतर';
          if (!groupCounts[group]) groupCounts[group] = new Set();
          groupCounts[group].add(d.crop_name);
        });

        // Define group metadata with icons and English names
        const groupMeta: Record<string, { icon: string; en: string; hi: string }> = {
          'धान्ये': { icon: '🌾', en: 'Grains', hi: 'अनाज' },
          'डाळी': { icon: '🫘', en: 'Pulses', hi: 'दालें' },
          'भाज्या': { icon: '🥬', en: 'Vegetables', hi: 'सब्जियां' },
          'फळे': { icon: '🍎', en: 'Fruits', hi: 'फल' },
          'मसाले': { icon: '🧄', en: 'Spices', hi: 'मसाले' },
          'तेलबिया': { icon: '🌻', en: 'Oilseeds', hi: 'तिलहन' },
          'गूळ व साखर': { icon: '🍯', en: 'Jaggery & Sugar', hi: 'गुड़ और चीनी' },
          'कापूस': { icon: '🧶', en: 'Cotton', hi: 'कपास' },
          'इतर': { icon: '📦', en: 'Others', hi: 'अन्य' },
        };

        const groups = Object.entries(groupCounts)
          .map(([name, count]) => ({
            name,
            count: count.size,
            ...(groupMeta[name] || { icon: '📦', en: name, hi: name })
          }))
          .sort((a, b) => b.count - a.count);

        console.log(`[market-price-intelligence] Found ${groups.length} crop groups`);

        return new Response(JSON.stringify({ 
          success: true, 
          groups 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getTopMarkets': {
        // Get top markets by record count for button display
        const { limit = 6 } = params;
        
        const anchorT = await latestDate(supabase, undefined, scope);
        const data = anchorT ? await pageRows(() => scopeQuery(supabase.from('market_prices').select('id,market_location').gte('price_date', daysBefore(anchorT, 30)), scope)) : [];

        // Count records per market
        const marketCounts: Record<string, number> = {};
        (data || []).forEach((d: any) => {
          const market = d.market_location;
          if (market) {
            marketCounts[market] = (marketCounts[market] || 0) + 1;
          }
        });

        const topMarkets = Object.entries(marketCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([name, count]) => ({ name, count }));

        console.log(`[market-price-intelligence] Found ${topMarkets.length} top markets`);

        return new Response(JSON.stringify({ 
          success: true, 
          markets: topMarkets 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ 
          success: false, 
          error: `Unknown action: ${action}` 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('[market-price-intelligence] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: isDatabaseTimeout(error) ? 'The server took too long to respond. Please try again.' : error instanceof Error ? error.message : 'Request failed',
      ...(isDatabaseTimeout(error) ? { code: 'DB_TIMEOUT', retryable: true } : {})
    }), {
      status: isDatabaseTimeout(error) ? 503 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
