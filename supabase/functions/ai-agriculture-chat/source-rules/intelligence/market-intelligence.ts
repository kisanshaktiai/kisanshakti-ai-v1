/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P3: MARKET INTELLIGENCE INTEGRATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Market price analysis and crop planning advisor:
 * - Price trend analysis
 * - Best selling time recommendations
 * - Crop selection based on expected prices
 * - Input cost tracking
 * - ROI calculation
 * 
 * Reference: AGMARKNET, State Agricultural Marketing Boards
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface MarketPrice {
  commodity: string;
  market: string;
  state: string;
  district: string;
  
  date: Date;
  
  min_price: number;
  max_price: number;
  modal_price: number;  // Most common trading price
  
  unit: string;  // 'quintal', 'kg', 'ton'
  
  arrivals_ton?: number;
  
  grade?: string;
  variety?: string;
}

export interface PriceTrend {
  commodity: string;
  period: '7D' | '30D' | '90D' | '1Y';
  
  current_price: number;
  start_price: number;
  
  change_percent: number;
  trend: 'RISING' | 'FALLING' | 'STABLE' | 'VOLATILE';
  
  highest_price: number;
  lowest_price: number;
  average_price: number;
  
  volatility_index: number;  // 0-100, higher = more volatile
  
  price_points: Array<{
    date: Date;
    price: number;
  }>;
}

export interface SellingRecommendation {
  commodity: string;
  
  recommendation: 'SELL_NOW' | 'HOLD' | 'WAIT_AND_WATCH';
  confidence: number;  // 0-100
  
  current_price: number;
  expected_price_7d: number;
  expected_price_30d: number;
  
  best_selling_window: {
    start: Date;
    end: Date;
    expected_price_range: [number, number];
  };
  
  reasoning: string[];
  
  best_markets: Array<{
    market: string;
    state: string;
    current_price: number;
    distance_km?: number;
  }>;
  
  storage_advisory?: {
    recommended: boolean;
    max_days: number;
    storage_cost_per_quintal_per_day: number;
    expected_gain_if_stored: number;
  };
}

export interface CropSelectionAdvice {
  recommended_crops: Array<{
    crop: string;
    season: 'KHARIF' | 'RABI' | 'ZAID';
    
    expected_price_at_harvest: number;
    price_confidence: number;
    
    expected_cost_per_ha: number;
    expected_yield_per_ha: number;
    expected_revenue_per_ha: number;
    expected_profit_per_ha: number;
    
    roi_percent: number;
    
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
    risk_factors: string[];
    
    suitability_score: number;  // 0-100 based on local conditions
  }>;
  
  market_outlook: string;
  
  crops_to_avoid: Array<{
    crop: string;
    reason: string;
  }>;
}

export interface InputCostTracker {
  input_type: 'SEED' | 'FERTILIZER' | 'PESTICIDE' | 'LABOR' | 'IRRIGATION' | 'MACHINERY';
  
  product_name: string;
  unit: string;
  
  current_price: number;
  last_year_price: number;
  change_percent: number;
  
  trend: 'RISING' | 'FALLING' | 'STABLE';
  
  bulk_discount?: {
    quantity_threshold: number;
    discount_percent: number;
  };
  
  alternatives?: Array<{
    product: string;
    price: number;
    efficiency_comparison: string;
  }>;
}

export interface ROICalculation {
  crop: string;
  area_ha: number;
  
  costs: {
    seeds: number;
    fertilizers: number;
    pesticides: number;
    labor: number;
    irrigation: number;
    machinery: number;
    miscellaneous: number;
    total: number;
  };
  
  revenue: {
    expected_yield_quintal: number;
    expected_price_per_quintal: number;
    total_revenue: number;
  };
  
  profit: number;
  roi_percent: number;
  
  break_even_yield: number;  // Yield needed to break even
  break_even_price: number;  // Price needed to break even
  
  risk_adjusted_profit: number;  // With weather/price risk discount
  
  comparison_with_alternatives?: Array<{
    crop: string;
    expected_profit: number;
    roi_percent: number;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPICAL PRODUCTION COSTS (INR per hectare) - 2024 estimates
// ═══════════════════════════════════════════════════════════════════════════

export const PRODUCTION_COSTS_PER_HA: Record<string, {
  seeds: number;
  fertilizers: number;
  pesticides: number;
  labor: number;
  irrigation: number;
  machinery: number;
  miscellaneous: number;
  expected_yield_quintal: number;
}> = {
  wheat: {
    seeds: 3000,
    fertilizers: 8000,
    pesticides: 2000,
    labor: 12000,
    irrigation: 5000,
    machinery: 8000,
    miscellaneous: 2000,
    expected_yield_quintal: 45
  },
  rice: {
    seeds: 2500,
    fertilizers: 9000,
    pesticides: 4000,
    labor: 15000,
    irrigation: 8000,
    machinery: 7000,
    miscellaneous: 2500,
    expected_yield_quintal: 55
  },
  cotton: {
    seeds: 4500,  // BT seeds
    fertilizers: 12000,
    pesticides: 8000,
    labor: 18000,
    irrigation: 6000,
    machinery: 5000,
    miscellaneous: 3500,
    expected_yield_quintal: 25  // Lint
  },
  soybean: {
    seeds: 5000,
    fertilizers: 4000,
    pesticides: 3000,
    labor: 10000,
    irrigation: 2000,
    machinery: 6000,
    miscellaneous: 2000,
    expected_yield_quintal: 20
  },
  sugarcane: {
    seeds: 15000,  // Setts
    fertilizers: 18000,
    pesticides: 5000,
    labor: 25000,
    irrigation: 12000,
    machinery: 10000,
    miscellaneous: 5000,
    expected_yield_quintal: 800
  },
  potato: {
    seeds: 40000,  // Seed potato
    fertilizers: 15000,
    pesticides: 12000,
    labor: 20000,
    irrigation: 8000,
    machinery: 8000,
    miscellaneous: 7000,
    expected_yield_quintal: 250
  },
  onion: {
    seeds: 3000,
    fertilizers: 10000,
    pesticides: 6000,
    labor: 22000,
    irrigation: 6000,
    machinery: 5000,
    miscellaneous: 3000,
    expected_yield_quintal: 200
  },
  tomato: {
    seeds: 8000,  // Hybrid seeds
    fertilizers: 12000,
    pesticides: 10000,
    labor: 25000,
    irrigation: 8000,
    machinery: 5000,
    miscellaneous: 5000,
    expected_yield_quintal: 350
  },
  chickpea: {
    seeds: 6000,
    fertilizers: 3000,
    pesticides: 2500,
    labor: 8000,
    irrigation: 2000,
    machinery: 5000,
    miscellaneous: 1500,
    expected_yield_quintal: 18
  },
  groundnut: {
    seeds: 12000,
    fertilizers: 6000,
    pesticides: 4000,
    labor: 15000,
    irrigation: 3000,
    machinery: 6000,
    miscellaneous: 2000,
    expected_yield_quintal: 22
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SEASONAL PRICE PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const SEASONAL_PATTERNS: Record<string, {
  harvest_months: number[];
  peak_price_months: number[];
  low_price_months: number[];
  typical_price_variation_percent: number;
}> = {
  wheat: {
    harvest_months: [3, 4],  // March-April
    peak_price_months: [11, 12, 1],  // Nov-Jan (pre-harvest)
    low_price_months: [4, 5, 6],  // Post-harvest glut
    typical_price_variation_percent: 20
  },
  rice: {
    harvest_months: [10, 11],  // Oct-Nov
    peak_price_months: [7, 8, 9],  // Pre-harvest
    low_price_months: [11, 12, 1],  // Post-harvest
    typical_price_variation_percent: 25
  },
  cotton: {
    harvest_months: [10, 11, 12],
    peak_price_months: [3, 4, 5],  // Off-season
    low_price_months: [11, 12],  // Harvest glut
    typical_price_variation_percent: 30
  },
  onion: {
    harvest_months: [2, 3, 4, 11, 12],  // Multiple seasons
    peak_price_months: [8, 9, 10],  // Pre-kharif harvest
    low_price_months: [1, 2, 3],  // Post-rabi harvest
    typical_price_variation_percent: 100  // Very volatile
  },
  potato: {
    harvest_months: [1, 2, 3],
    peak_price_months: [9, 10, 11],  // Before harvest
    low_price_months: [2, 3, 4],  // Post-harvest
    typical_price_variation_percent: 60
  },
  tomato: {
    harvest_months: [1, 2, 3, 4, 11, 12],  // Multiple
    peak_price_months: [6, 7, 8],  // Off-season/monsoon
    low_price_months: [12, 1, 2],  // Peak production
    typical_price_variation_percent: 150  // Very volatile
  },
  soybean: {
    harvest_months: [10, 11],
    peak_price_months: [6, 7, 8],  // Pre-harvest
    low_price_months: [11, 12],  // Harvest
    typical_price_variation_percent: 20
  },
  sugarcane: {
    harvest_months: [11, 12, 1, 2, 3, 4],  // Long season
    peak_price_months: [10, 11],  // Early crushing premium
    low_price_months: [3, 4],  // End of season
    typical_price_variation_percent: 10  // FRP controlled
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE ANALYSIS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze price trend from historical data
 */
export function analyzePriceTrend(
  prices: MarketPrice[],
  period: PriceTrend['period'] = '30D'
): PriceTrend {
  if (prices.length === 0) {
    throw new Error('No price data provided');
  }
  
  // Sort by date
  const sorted = [...prices].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  const current_price = sorted[0].modal_price;
  const start_price = sorted[sorted.length - 1].modal_price;
  
  const change_percent = ((current_price - start_price) / start_price) * 100;
  
  const all_prices = sorted.map(p => p.modal_price);
  const highest_price = Math.max(...all_prices);
  const lowest_price = Math.min(...all_prices);
  const average_price = all_prices.reduce((a, b) => a + b, 0) / all_prices.length;
  
  // Calculate volatility (coefficient of variation)
  const variance = all_prices.reduce((sum, p) => sum + Math.pow(p - average_price, 2), 0) / all_prices.length;
  const std_dev = Math.sqrt(variance);
  const volatility_index = Math.min(100, (std_dev / average_price) * 100 * 5);  // Scale to 0-100
  
  // Determine trend
  let trend: PriceTrend['trend'];
  if (volatility_index > 30) {
    trend = 'VOLATILE';
  } else if (change_percent > 5) {
    trend = 'RISING';
  } else if (change_percent < -5) {
    trend = 'FALLING';
  } else {
    trend = 'STABLE';
  }
  
  return {
    commodity: sorted[0].commodity,
    period,
    current_price,
    start_price,
    change_percent: Math.round(change_percent * 10) / 10,
    trend,
    highest_price,
    lowest_price,
    average_price: Math.round(average_price),
    volatility_index: Math.round(volatility_index),
    price_points: sorted.map(p => ({
      date: new Date(p.date),
      price: p.modal_price
    }))
  };
}

/**
 * Generate selling recommendation
 */
export function generateSellingRecommendation(
  commodity: string,
  currentPrice: number,
  priceTrend: PriceTrend,
  availableMarkets: MarketPrice[] = []
): SellingRecommendation {
  const pattern = SEASONAL_PATTERNS[commodity.toLowerCase()];
  const currentMonth = new Date().getMonth() + 1;
  
  let recommendation: SellingRecommendation['recommendation'];
  let confidence: number;
  const reasoning: string[] = [];
  
  // Seasonal analysis
  const isPeakMonth = pattern?.peak_price_months.includes(currentMonth);
  const isLowMonth = pattern?.low_price_months.includes(currentMonth);
  const isHarvestMonth = pattern?.harvest_months.includes(currentMonth);
  
  if (isPeakMonth) {
    recommendation = 'SELL_NOW';
    confidence = 85;
    reasoning.push('Currently in peak price season - prices typically highest now');
  } else if (isLowMonth) {
    recommendation = 'HOLD';
    confidence = 75;
    reasoning.push('Currently in low price season - consider storage if possible');
  } else if (isHarvestMonth) {
    recommendation = 'WAIT_AND_WATCH';
    confidence = 70;
    reasoning.push('Harvest season - prices may drop further due to arrivals');
  } else {
    recommendation = 'WAIT_AND_WATCH';
    confidence = 60;
  }
  
  // Trend analysis
  if (priceTrend.trend === 'RISING') {
    if (recommendation === 'SELL_NOW') {
      confidence = Math.min(95, confidence + 10);
      reasoning.push('Prices are rising - good time to sell');
    } else {
      recommendation = 'WAIT_AND_WATCH';
      reasoning.push('Prices rising - may want to hold for higher prices');
    }
  } else if (priceTrend.trend === 'FALLING') {
    recommendation = 'SELL_NOW';
    confidence = Math.max(confidence, 80);
    reasoning.push('Prices are falling - sell before further decline');
  } else if (priceTrend.trend === 'VOLATILE') {
    confidence = Math.max(50, confidence - 15);
    reasoning.push('High price volatility - difficult to predict');
  }
  
  // Price level analysis
  if (currentPrice >= priceTrend.highest_price * 0.95) {
    recommendation = 'SELL_NOW';
    confidence = Math.min(95, confidence + 10);
    reasoning.push('Current price near recent high');
  } else if (currentPrice <= priceTrend.lowest_price * 1.05) {
    recommendation = 'HOLD';
    confidence = Math.min(90, confidence + 5);
    reasoning.push('Current price near recent low - likely to improve');
  }
  
  // Expected prices (simple projection)
  const dailyChange = priceTrend.change_percent / 30;  // Assuming 30D period
  const expected_7d = Math.round(currentPrice * (1 + (dailyChange * 7) / 100));
  const expected_30d = Math.round(currentPrice * (1 + (dailyChange * 30) / 100));
  
  // Best selling window
  const bestWindowStart = new Date();
  const bestWindowEnd = new Date();
  if (pattern && pattern.peak_price_months.length > 0) {
    const nextPeakMonth = pattern.peak_price_months.find(m => m >= currentMonth) || pattern.peak_price_months[0];
    bestWindowStart.setMonth(nextPeakMonth - 1);
    bestWindowEnd.setMonth(nextPeakMonth);
  } else {
    bestWindowStart.setDate(bestWindowStart.getDate() + 7);
    bestWindowEnd.setDate(bestWindowEnd.getDate() + 30);
  }
  
  // Sort markets by price
  const sortedMarkets = [...availableMarkets]
    .sort((a, b) => b.modal_price - a.modal_price)
    .slice(0, 5)
    .map(m => ({
      market: m.market,
      state: m.state,
      current_price: m.modal_price
    }));
  
  // Storage advisory
  const storageRecommended = recommendation === 'HOLD' && pattern && !isLowMonth;
  
  return {
    commodity,
    recommendation,
    confidence,
    current_price: currentPrice,
    expected_price_7d: expected_7d,
    expected_price_30d: expected_30d,
    best_selling_window: {
      start: bestWindowStart,
      end: bestWindowEnd,
      expected_price_range: [
        Math.round(currentPrice * 0.95),
        Math.round(currentPrice * (1 + (pattern?.typical_price_variation_percent || 20) / 100))
      ]
    },
    reasoning,
    best_markets: sortedMarkets,
    storage_advisory: storageRecommended ? {
      recommended: true,
      max_days: 60,
      storage_cost_per_quintal_per_day: 2,
      expected_gain_if_stored: Math.max(0, expected_30d - currentPrice - (60 * 2))
    } : undefined
  };
}

/**
 * Calculate ROI for a crop
 */
export function calculateROI(
  crop: string,
  area_ha: number,
  expectedPrice: number,
  yieldMultiplier: number = 1.0
): ROICalculation {
  const costs = PRODUCTION_COSTS_PER_HA[crop.toLowerCase()];
  if (!costs) {
    throw new Error(`No cost data for crop: ${crop}`);
  }
  
  const totalCosts = {
    seeds: costs.seeds * area_ha,
    fertilizers: costs.fertilizers * area_ha,
    pesticides: costs.pesticides * area_ha,
    labor: costs.labor * area_ha,
    irrigation: costs.irrigation * area_ha,
    machinery: costs.machinery * area_ha,
    miscellaneous: costs.miscellaneous * area_ha,
    total: 0
  };
  totalCosts.total = Object.values(totalCosts).reduce((a, b) => a + b, 0) - totalCosts.total;
  
  const expected_yield = costs.expected_yield_quintal * area_ha * yieldMultiplier;
  const total_revenue = expected_yield * expectedPrice;
  const profit = total_revenue - totalCosts.total;
  const roi = (profit / totalCosts.total) * 100;
  
  const break_even_yield = totalCosts.total / expectedPrice;
  const break_even_price = totalCosts.total / expected_yield;
  
  // Risk-adjusted (15% discount for weather/price risk)
  const risk_adjusted_profit = profit * 0.85;
  
  return {
    crop,
    area_ha,
    costs: totalCosts,
    revenue: {
      expected_yield_quintal: Math.round(expected_yield),
      expected_price_per_quintal: expectedPrice,
      total_revenue: Math.round(total_revenue)
    },
    profit: Math.round(profit),
    roi_percent: Math.round(roi * 10) / 10,
    break_even_yield: Math.round(break_even_yield * 10) / 10,
    break_even_price: Math.round(break_even_price),
    risk_adjusted_profit: Math.round(risk_adjusted_profit)
  };
}

/**
 * Generate crop selection advice for next season
 */
export function generateCropSelectionAdvice(
  season: 'KHARIF' | 'RABI' | 'ZAID',
  region: string,
  soilType: string,
  irrigationAvailable: boolean,
  area_ha: number,
  historicalPrices: Record<string, number>  // crop -> avg price
): CropSelectionAdvice {
  const seasonCrops: Record<string, string[]> = {
    KHARIF: ['rice', 'cotton', 'soybean', 'groundnut', 'sugarcane'],
    RABI: ['wheat', 'chickpea', 'potato', 'onion'],
    ZAID: ['tomato', 'onion']  // Summer vegetables
  };
  
  const cropOptions = seasonCrops[season] || [];
  const recommendations: CropSelectionAdvice['recommended_crops'] = [];
  
  for (const crop of cropOptions) {
    const costs = PRODUCTION_COSTS_PER_HA[crop];
    if (!costs) continue;
    
    const expectedPrice = historicalPrices[crop] || 2000;  // Default price
    const roi = calculateROI(crop, 1, expectedPrice);  // Per hectare
    
    // Determine risk
    const volatility = SEASONAL_PATTERNS[crop]?.typical_price_variation_percent || 20;
    let risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
    const risk_factors: string[] = [];
    
    if (volatility > 50) {
      risk_level = 'HIGH';
      risk_factors.push('High price volatility');
    } else if (volatility > 25) {
      risk_level = 'MEDIUM';
      risk_factors.push('Moderate price fluctuations');
    } else {
      risk_level = 'LOW';
    }
    
    if (!irrigationAvailable && ['sugarcane', 'potato', 'tomato'].includes(crop)) {
      risk_level = 'HIGH';
      risk_factors.push('Irrigation-intensive crop without assured irrigation');
    }
    
    // Suitability score
    let suitability = 70;
    if (irrigationAvailable) suitability += 10;
    if (roi.roi_percent > 50) suitability += 15;
    if (risk_level === 'LOW') suitability += 10;
    
    recommendations.push({
      crop,
      season,
      expected_price_at_harvest: expectedPrice,
      price_confidence: 100 - volatility,
      expected_cost_per_ha: roi.costs.total / area_ha,
      expected_yield_per_ha: roi.revenue.expected_yield_quintal / area_ha,
      expected_revenue_per_ha: roi.revenue.total_revenue / area_ha,
      expected_profit_per_ha: roi.profit / area_ha,
      roi_percent: roi.roi_percent,
      risk_level,
      risk_factors,
      suitability_score: Math.min(100, suitability)
    });
  }
  
  // Sort by ROI
  recommendations.sort((a, b) => b.roi_percent - a.roi_percent);
  
  // Crops to avoid
  const avoid: CropSelectionAdvice['crops_to_avoid'] = [];
  for (const rec of recommendations) {
    if (rec.roi_percent < 20 || rec.risk_level === 'HIGH') {
      avoid.push({
        crop: rec.crop,
        reason: rec.roi_percent < 20 
          ? 'Low expected returns'
          : rec.risk_factors.join(', ')
      });
    }
  }
  
  return {
    recommended_crops: recommendations.filter(r => r.roi_percent >= 20 && r.risk_level !== 'HIGH').slice(0, 5),
    market_outlook: `${season} season outlook: Focus on crops with stable prices and good local demand`,
    crops_to_avoid: avoid.slice(0, 3)
  };
}
