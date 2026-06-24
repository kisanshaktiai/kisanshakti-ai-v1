/**
 * Centralized Cost Calculator Module
 * Accurate expense calculation outside AI prompt
 * Based on 2024-25 Indian market prices with regional variations
 */

// Regional labor rates (MGNREGA-based, ₹/day)
export const REGIONAL_LABOR_RATES: Record<string, number> = {
  // North India
  'punjab': 331,
  'haryana': 348,
  'uttar pradesh': 230,
  'uttarakhand': 230,
  'himachal pradesh': 248,
  'jammu and kashmir': 248,
  
  // West India
  'maharashtra': 273,
  'gujarat': 261,
  'rajasthan': 243,
  'goa': 315,
  
  // South India
  'karnataka': 316,
  'tamil nadu': 294,
  'kerala': 333,
  'andhra pradesh': 272,
  'telangana': 280,
  
  // East India
  'west bengal': 237,
  'odisha': 237,
  'bihar': 228,
  'jharkhand': 228,
  
  // Central India
  'madhya pradesh': 230,
  'chhattisgarh': 221,
  
  // Northeast India
  'assam': 235,
  'meghalaya': 235,
  'manipur': 259,
  'nagaland': 224,
  'tripura': 235,
  
  // Default
  'default': 350
};

// Current market prices (₹) - Updated 2024-25
export const MARKET_PRICES: Record<string, { unit: string; price: number; category: string }> = {
  // Fertilizers (per kg)
  urea: { unit: 'kg', price: 6.5, category: 'fertilizer' },
  dap: { unit: 'kg', price: 27, category: 'fertilizer' },
  mop: { unit: 'kg', price: 17, category: 'fertilizer' },
  ssp: { unit: 'kg', price: 8, category: 'fertilizer' },
  npk_10_26_26: { unit: 'kg', price: 29.5, category: 'fertilizer' },
  npk_12_32_16: { unit: 'kg', price: 29, category: 'fertilizer' },
  npk_20_20_0: { unit: 'kg', price: 25, category: 'fertilizer' },
  ammonium_sulphate: { unit: 'kg', price: 12, category: 'fertilizer' },
  zinc_sulphate: { unit: 'kg', price: 120, category: 'micronutrient' },
  ferrous_sulphate: { unit: 'kg', price: 35, category: 'micronutrient' },
  borax: { unit: 'kg', price: 95, category: 'micronutrient' },
  
  // Organic inputs (per kg)
  vermicompost: { unit: 'kg', price: 8, category: 'organic' },
  fym: { unit: 'kg', price: 1, category: 'organic' },
  neem_cake: { unit: 'kg', price: 25, category: 'organic' },
  castor_cake: { unit: 'kg', price: 22, category: 'organic' },
  bone_meal: { unit: 'kg', price: 20, category: 'organic' },
  
  // Bio-fertilizers (per kg)
  trichoderma: { unit: 'kg', price: 200, category: 'bio_fertilizer' },
  pseudomonas: { unit: 'kg', price: 200, category: 'bio_fertilizer' },
  rhizobium: { unit: 'kg', price: 180, category: 'bio_fertilizer' },
  azotobacter: { unit: 'kg', price: 180, category: 'bio_fertilizer' },
  psb: { unit: 'kg', price: 180, category: 'bio_fertilizer' },
  vam: { unit: 'kg', price: 220, category: 'bio_fertilizer' },
  
  // Pesticides (per liter/kg)
  imidacloprid: { unit: 'liter', price: 750, category: 'pesticide' },
  chlorpyrifos: { unit: 'liter', price: 550, category: 'pesticide' },
  lambda_cyhalothrin: { unit: 'liter', price: 800, category: 'pesticide' },
  cypermethrin: { unit: 'liter', price: 450, category: 'pesticide' },
  fipronil: { unit: 'liter', price: 1200, category: 'pesticide' },
  spinosad: { unit: 'liter', price: 2500, category: 'pesticide' },
  emamectin_benzoate: { unit: 'kg', price: 1800, category: 'pesticide' },
  neem_oil: { unit: 'liter', price: 350, category: 'organic_pesticide' },
  beauveria_bassiana: { unit: 'kg', price: 280, category: 'bio_pesticide' },
  metarhizium: { unit: 'kg', price: 280, category: 'bio_pesticide' },
  
  // Fungicides
  mancozeb: { unit: 'kg', price: 450, category: 'fungicide' },
  carbendazim: { unit: 'kg', price: 380, category: 'fungicide' },
  copper_oxychloride: { unit: 'kg', price: 420, category: 'fungicide' },
  propiconazole: { unit: 'liter', price: 1200, category: 'fungicide' },
  hexaconazole: { unit: 'liter', price: 950, category: 'fungicide' },
  tebuconazole: { unit: 'liter', price: 1100, category: 'fungicide' },
  
  // Herbicides
  glyphosate: { unit: 'liter', price: 350, category: 'herbicide' },
  paraquat: { unit: 'liter', price: 320, category: 'herbicide' },
  pendimethalin: { unit: 'liter', price: 450, category: 'herbicide' },
  atrazine: { unit: 'kg', price: 280, category: 'herbicide' },
  
  // Growth regulators
  humic_acid: { unit: 'liter', price: 200, category: 'growth_promoter' },
  seaweed_extract: { unit: 'liter', price: 300, category: 'growth_promoter' },
  amino_acids: { unit: 'liter', price: 250, category: 'growth_promoter' },
  gibberellic_acid: { unit: 'gram', price: 3, category: 'growth_promoter' },
};

// Labor requirements by task type (workers × days per acre)
export const LABOR_REQUIREMENTS: Record<string, { workers: number; daysPerAcre: number; isSkilled?: boolean }> = {
  land_preparation: { workers: 2, daysPerAcre: 3 },
  soil_preparation: { workers: 2, daysPerAcre: 3 },
  sowing: { workers: 3, daysPerAcre: 1 },
  transplanting: { workers: 6, daysPerAcre: 1 },
  weeding: { workers: 4, daysPerAcre: 2 },
  weed_management: { workers: 4, daysPerAcre: 2 },
  irrigation: { workers: 1, daysPerAcre: 0.5 },
  fertilizer: { workers: 2, daysPerAcre: 0.5 },
  fertilizer_application: { workers: 2, daysPerAcre: 0.5 },
  pest_control: { workers: 2, daysPerAcre: 0.5, isSkilled: true },
  pesticide: { workers: 2, daysPerAcre: 0.5, isSkilled: true },
  disease_control: { workers: 2, daysPerAcre: 0.5, isSkilled: true },
  fungicide: { workers: 2, daysPerAcre: 0.5, isSkilled: true },
  harvesting: { workers: 6, daysPerAcre: 3 },
  harvest: { workers: 6, daysPerAcre: 3 },
  post_harvest: { workers: 3, daysPerAcre: 2 },
  pruning: { workers: 3, daysPerAcre: 1.5 },
  thinning: { workers: 4, daysPerAcre: 1 },
  staking: { workers: 3, daysPerAcre: 1 },
  mulching: { workers: 2, daysPerAcre: 1 },
  other: { workers: 2, daysPerAcre: 1 }
};

export interface CostBreakdown {
  item: string;
  quantity?: string;
  unitPrice?: number;
  cost: number;
}

export interface CostEstimate {
  productCost: number;
  laborCost: number;
  totalCost: number;
  costPerAcre: number;
  breakdown: CostBreakdown[];
  laborDetails: {
    workers: number;
    daysPerAcre: number;
    totalDays: number;
    dailyWage: number;
    description: string;
  };
  currency: string;
  region?: string;
}

/**
 * Get labor rate for a specific state/region
 */
export function getLaborRate(state?: string): number {
  if (!state) return REGIONAL_LABOR_RATES.default;
  const normalizedState = state.toLowerCase().trim();
  return REGIONAL_LABOR_RATES[normalizedState] || REGIONAL_LABOR_RATES.default;
}

/**
 * Find product price by name (fuzzy matching)
 */
export function findProductPrice(productName: string): { price: number; unit: string; category: string } | null {
  const nameLower = productName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  // Direct match
  if (MARKET_PRICES[nameLower]) {
    return MARKET_PRICES[nameLower];
  }
  
  // Partial match
  for (const [key, data] of Object.entries(MARKET_PRICES)) {
    if (nameLower.includes(key) || key.includes(nameLower.split('_')[0])) {
      return data;
    }
  }
  
  // Common aliases
  const aliases: Record<string, string> = {
    'potash': 'mop',
    'muriate_of_potash': 'mop',
    'diammonium_phosphate': 'dap',
    'single_super_phosphate': 'ssp',
    'farm_yard_manure': 'fym',
    'gobar': 'fym',
    'shenak': 'fym',
    'gandula': 'vermicompost',
    'kenchua': 'vermicompost',
    'neem': 'neem_oil',
    'copper_fungicide': 'copper_oxychloride',
  };
  
  for (const [alias, original] of Object.entries(aliases)) {
    if (nameLower.includes(alias)) {
      return MARKET_PRICES[original];
    }
  }
  
  return null;
}

/**
 * Parse dose string to extract quantity and unit
 */
export function parseDose(doseString: string): { quantity: number; unit: string } {
  if (!doseString) return { quantity: 0, unit: 'kg' };
  
  const match = doseString.match(/(\d+(?:\.\d+)?)\s*(kg|g|gram|liter|litre|l|ml|quintal)/i);
  if (match) {
    let quantity = parseFloat(match[1]);
    let unit = match[2].toLowerCase();
    
    // Normalize units
    if (unit === 'g' || unit === 'gram') {
      quantity = quantity / 1000;
      unit = 'kg';
    } else if (unit === 'ml') {
      quantity = quantity / 1000;
      unit = 'liter';
    } else if (unit === 'l' || unit === 'litre') {
      unit = 'liter';
    } else if (unit === 'quintal') {
      quantity = quantity * 100;
      unit = 'kg';
    }
    
    return { quantity, unit };
  }
  
  // Default: try to extract just the number
  const numMatch = doseString.match(/(\d+(?:\.\d+)?)/);
  return { quantity: numMatch ? parseFloat(numMatch[1]) : 0, unit: 'kg' };
}

/**
 * Calculate accurate cost for a task
 */
export function calculateTaskCost(
  taskType: string,
  products: Array<{ product_name: string; dose_per_acre?: string; quantity?: number }>,
  landAreaAcres: number,
  state?: string
): CostEstimate {
  const breakdown: CostBreakdown[] = [];
  let productCost = 0;
  const laborRate = getLaborRate(state);
  
  // Calculate product costs
  for (const product of products) {
    const priceData = findProductPrice(product.product_name);
    
    if (priceData) {
      const dose = parseDose(product.dose_per_acre || '');
      const quantity = dose.quantity * landAreaAcres;
      const cost = Math.round(priceData.price * quantity);
      
      productCost += cost;
      breakdown.push({
        item: product.product_name,
        quantity: `${quantity.toFixed(2)} ${priceData.unit}`,
        unitPrice: priceData.price,
        cost
      });
    } else {
      // Fallback to category-based estimate
      const categoryDefaults: Record<string, number> = {
        fertilizer: 600,
        organic: 500,
        pesticide: 400,
        fungicide: 350,
        growth_promoter: 300,
        seed_treatment: 250,
        bio_fertilizer: 200
      };
      
      const estimatedCost = Math.round((categoryDefaults['fertilizer'] || 400) * landAreaAcres);
      productCost += estimatedCost;
      breakdown.push({
        item: product.product_name,
        cost: estimatedCost
      });
    }
  }
  
  // Calculate labor cost
  const laborReq = LABOR_REQUIREMENTS[taskType.toLowerCase()] || LABOR_REQUIREMENTS.other;
  const totalDays = laborReq.daysPerAcre * landAreaAcres;
  const effectiveRate = laborReq.isSkilled ? laborRate * 1.4 : laborRate;
  const laborCost = Math.round(laborReq.workers * totalDays * effectiveRate);
  
  breakdown.push({
    item: 'Labor',
    quantity: `${laborReq.workers} workers × ${totalDays.toFixed(1)} days`,
    unitPrice: effectiveRate,
    cost: laborCost
  });
  
  const totalCost = productCost + laborCost;
  
  return {
    productCost,
    laborCost,
    totalCost,
    costPerAcre: Math.round(totalCost / landAreaAcres),
    breakdown,
    laborDetails: {
      workers: laborReq.workers,
      daysPerAcre: laborReq.daysPerAcre,
      totalDays,
      dailyWage: effectiveRate,
      description: laborReq.isSkilled ? 'Skilled labor' : 'Regular labor'
    },
    currency: 'INR',
    region: state
  };
}

/**
 * Format cost for display
 */
export function formatCost(amount: number, language: string = 'en'): string {
  const formatted = amount.toLocaleString('en-IN');
  
  const currencySymbols: Record<string, string> = {
    hi: '₹',
    mr: '₹',
    pa: '₹',
    ta: '₹',
    en: '₹'
  };
  
  return `${currencySymbols[language] || '₹'}${formatted}`;
}

/**
 * Get localized cost breakdown labels
 */
export function getCostLabels(language: string): Record<string, string> {
  const labels: Record<string, Record<string, string>> = {
    hi: {
      productCost: 'उत्पाद लागत',
      laborCost: 'मजदूरी',
      totalCost: 'कुल लागत',
      perAcre: 'प्रति एकड़',
      workers: 'मजदूर',
      days: 'दिन',
      breakdown: 'विवरण'
    },
    mr: {
      productCost: 'उत्पादन खर्च',
      laborCost: 'मजुरी',
      totalCost: 'एकूण खर्च',
      perAcre: 'एकरी',
      workers: 'मजूर',
      days: 'दिवस',
      breakdown: 'तपशील'
    },
    en: {
      productCost: 'Product Cost',
      laborCost: 'Labor Cost',
      totalCost: 'Total Cost',
      perAcre: 'per acre',
      workers: 'workers',
      days: 'days',
      breakdown: 'Breakdown'
    }
  };
  
  return labels[language] || labels.en;
}
