import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

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
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { action, params } = await req.json();

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
        
        const today = new Date();
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
            .order('price_date', { ascending: true });

          if (crop && crop !== 'all') query = query.ilike('crop_name', `%${crop}%`);
          if (district) query = query.ilike('district', `%${district}%`);
          if (market) query = query.ilike('market_location', `%${market}%`);

          const { data, error } = await query.limit(200);
          if (error) throw error;

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

        if (!openaiApiKey) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'OpenAI API key not configured' 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Fetch recent market data for context - FIXED: removed state filter
        let query = supabase
          .from('market_prices')
          .select('*')
          .order('price_date', { ascending: false })
          .limit(50);

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

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are an agricultural market analyst. Always respond with valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 1000,
            temperature: 0.7,
          }),
        });

        const aiResponse = await response.json();
        let analysis;
        
        try {
          const content = aiResponse.choices?.[0]?.message?.content || '{}';
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
        const { data, error } = await supabase
          .from('market_prices')
          .select('market_location')
          .not('market_location', 'is', null);

        if (error) throw error;

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
        let query = supabase
          .from('market_prices')
          .select('crop_name, commodity_category')
          .not('crop_name', 'is', null);

        if (group && group !== 'all') {
          query = query.eq('commodity_category', group);
        }

        const { data, error } = await query;
        if (error) throw error;

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
        const { data, error } = await supabase
          .from('market_prices')
          .select('commodity_category');

        if (error) throw error;

        // Count crops per group
        const groupCounts: Record<string, number> = {};
        (data || []).forEach((d: any) => {
          const group = d.commodity_category || 'इतर';
          groupCounts[group] = (groupCounts[group] || 0) + 1;
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
            count,
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
        
        const { data, error } = await supabase
          .from('market_prices')
          .select('market_location');

        if (error) throw error;

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
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
