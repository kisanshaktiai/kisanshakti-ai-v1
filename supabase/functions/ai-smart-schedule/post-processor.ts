/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DETERMINISTIC POST-PROCESSOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Handles all post-AI processing deterministically:
 * - Language translation (farmer-friendly rural language)
 * - Unit conversions (acre, guntha, kg, liter)
 * - Cost calculations
 * - Organic/chemical substitutions
 * 
 * AI output represents SCIENTIFIC INTENT - this module creates FARMER TEXT
 * 
 * Version: 2.0.0
 */

import { FERTILIZERS, PESTICIDES, SEED_RATES } from './agro-knowledge-base.ts';

// ═══════════════════════════════════════════════════════════════════════════
// RURAL LANGUAGE TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const RURAL_DICTIONARY: Record<string, Record<string, string>> = {
  hi: {
    // Technical → Rural Hindi
    'nitrogen': 'नाइट्रोजन खाद',
    'phosphorus': 'फॉस्फोरस खाद',
    'potassium': 'पोटाश खाद',
    'urea': 'यूरिया',
    'dap': 'डीएपी',
    'mop': 'मोप/पोटाश',
    'fertilizer': 'खाद',
    'pesticide': 'कीड़े की दवा',
    'fungicide': 'फफूंद की दवा',
    'herbicide': 'खरपतवार नाशक',
    'irrigation': 'पानी देना/सिंचाई',
    'spray': 'छिड़काव करना',
    'sowing': 'बुवाई करना',
    'transplanting': 'रोपाई करना',
    'harvesting': 'कटाई करना',
    'weeding': 'निराई-गुड़ाई',
    'thinning': 'विरलन करना',
    'mulching': 'पलवार बिछाना',
    'germination': 'अंकुरण',
    'flowering': 'फूल आना',
    'fruiting': 'फल लगना',
    'maturity': 'पकाव',
    'vegetative': 'बढ़वार का समय',
    'reproductive': 'फूल-फल का समय',
    'basal': 'जड़ में डालना',
    'foliar': 'पत्तों पर छिड़कना',
    'broadcasting': 'छिटकवां विधि',
    'application': 'डालना',
    'treatment': 'उपचार',
    'organic': 'जैविक/देसी',
    'chemical': 'रासायनिक',
    'vermicompost': 'केंचुआ खाद',
    'fym': 'गोबर की खाद',
    'neem': 'नीम',
    'trichoderma': 'ट्राइकोडर्मा',
    'pseudomonas': 'स्यूडोमोनास',
    'beauveria': 'ब्यूवेरिया',
    'per acre': 'प्रति एकड़',
    'per hectare': 'प्रति हेक्टेयर',
    'kilogram': 'किलो',
    'gram': 'ग्राम',
    'liter': 'लीटर',
    'milliliter': 'मिली',
    'morning': 'सुबह जल्दी',
    'evening': 'शाम को',
    'days': 'दिन',
    'week': 'सप्ताह',
    'critical': 'बहुत जरूरी',
    'important': 'जरूरी',
    'recommended': 'सलाह दी जाती है',
    'yield': 'पैदावार',
    'loss': 'नुकसान',
    'profit': 'मुनाफा',
    'income': 'आमदनी'
  },
  mr: {
    // Technical → Rural Marathi
    'nitrogen': 'नत्र खत',
    'phosphorus': 'स्फुरद खत',
    'potassium': 'पालाश खत',
    'urea': 'युरिया',
    'dap': 'डीएपी',
    'mop': 'मोप/पालाश',
    'fertilizer': 'खत',
    'pesticide': 'किडीची औषध',
    'fungicide': 'बुरशीची औषध',
    'herbicide': 'तण नाशक',
    'irrigation': 'पाणी देणे',
    'spray': 'फवारणी करणे',
    'sowing': 'पेरणी करणे',
    'transplanting': 'लावणी/रोपणी करणे',
    'harvesting': 'कापणी करणे',
    'weeding': 'निंदणी करणे',
    'thinning': 'विरळणी करणे',
    'mulching': 'आच्छादन करणे',
    'germination': 'उगवण',
    'flowering': 'फुले येणे',
    'fruiting': 'फळे लागणे',
    'maturity': 'पक्वता',
    'vegetative': 'वाढीचा टप्पा',
    'reproductive': 'फूल-फळाचा टप्पा',
    'basal': 'मुळाशी देणे',
    'foliar': 'पानांवर फवारणे',
    'broadcasting': 'पसरून देणे',
    'application': 'देणे/टाकणे',
    'treatment': 'उपचार',
    'organic': 'सेंद्रिय',
    'chemical': 'रासायनिक',
    'vermicompost': 'गांडूळ खत',
    'fym': 'शेणखत',
    'neem': 'कडुनिंब',
    'trichoderma': 'ट्रायकोडर्मा',
    'pseudomonas': 'स्यूडोमोनास',
    'beauveria': 'ब्युवेरिया',
    'per acre': 'एकरी',
    'per hectare': 'हेक्टरी',
    'kilogram': 'किलो',
    'gram': 'ग्रॅम',
    'liter': 'लिटर',
    'milliliter': 'मिली',
    'morning': 'सकाळी लवकर',
    'evening': 'संध्याकाळी',
    'days': 'दिवस',
    'week': 'आठवडा',
    'critical': 'अत्यंत महत्त्वाचे',
    'important': 'महत्त्वाचे',
    'recommended': 'सल्ला दिला जातो',
    'yield': 'उत्पादन',
    'loss': 'नुकसान',
    'profit': 'नफा',
    'income': 'उत्पन्न'
  },
  en: {
    // Keep English simple for rural farmers
    'nitrogen': 'N fertilizer',
    'phosphorus': 'P fertilizer',
    'potassium': 'K fertilizer'
  }
};

// Crop name translations
const CROP_NAMES: Record<string, Record<string, string>> = {
  en: { wheat: 'Wheat', rice: 'Rice', cotton: 'Cotton', sugarcane: 'Sugarcane', tomato: 'Tomato', onion: 'Onion' },
  hi: { wheat: 'गेहूं', rice: 'धान', cotton: 'कपास', sugarcane: 'गन्ना', tomato: 'टमाटर', onion: 'प्याज' },
  mr: { wheat: 'गहू', rice: 'भात', cotton: 'कापूस', sugarcane: 'ऊस', tomato: 'टोमॅटो', onion: 'कांदा' }
};

// ═══════════════════════════════════════════════════════════════════════════
// UNIT CONVERSION TABLES
// ═══════════════════════════════════════════════════════════════════════════

const UNIT_CONVERSIONS = {
  // Area conversions (base: hectare)
  hectare_to_acre: 2.471,
  acre_to_hectare: 0.4047,
  acre_to_guntha: 40,
  guntha_to_acre: 0.025,
  hectare_to_bigha: 4, // Varies by state
  
  // Weight conversions (base: kg)
  kg_to_quintal: 0.01,
  quintal_to_kg: 100,
  kg_to_ton: 0.001,
  ton_to_kg: 1000,
  
  // Volume conversions (base: liter)
  liter_to_ml: 1000,
  ml_to_liter: 0.001
};

// ═══════════════════════════════════════════════════════════════════════════
// COST CALCULATION (2024-25 Indian Market Prices)
// ═══════════════════════════════════════════════════════════════════════════

interface CostEstimate {
  product_cost: number;
  labor_cost: number;
  total_cost: number;
  cost_per_acre: number;
  currency: string;
  breakdown: { item: string; cost: number }[];
}

// Current market prices (₹)
const MARKET_PRICES: Record<string, number> = {
  // Fertilizers (per kg)
  urea: 6.5,
  dap: 27,
  mop: 17,
  ssp: 8,
  npk_1226_26: 29.5,
  vermicompost: 8,
  fym: 1,
  neem_cake: 25,
  
  // Pesticides (per liter/kg)
  imidacloprid: 750,
  chlorpyrifos: 550,
  neem_oil: 350,
  trichoderma: 200,
  pseudomonas: 200,
  beauveria: 280,
  
  // Fungicides
  mancozeb: 450,
  carbendazim: 380,
  copper_oxychloride: 420,
  
  // Labor (per day)
  labor_daily: 350,
  skilled_labor: 500
};

// Labor requirements by task category (workers × days per acre)
const LABOR_REQUIREMENTS: Record<string, { workers: number; days: number }> = {
  land_preparation: { workers: 2, days: 3 },
  sowing: { workers: 3, days: 1 },
  transplanting: { workers: 6, days: 1 },
  weeding: { workers: 4, days: 2 },
  irrigation: { workers: 1, days: 0.5 },
  fertilizer: { workers: 2, days: 0.5 },
  pest_control: { workers: 2, days: 0.5 },
  disease_control: { workers: 2, days: 0.5 },
  harvesting: { workers: 6, days: 3 },
  post_harvest: { workers: 3, days: 2 }
};

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIC SUBSTITUTION MAP
// ═══════════════════════════════════════════════════════════════════════════

const ORGANIC_SUBSTITUTES: Record<string, { name: string; dose_multiplier: number; effectiveness: number }> = {
  urea: { name: 'Vermicompost + Jeevamrut', dose_multiplier: 10, effectiveness: 0.7 },
  dap: { name: 'Rock Phosphate + PSB', dose_multiplier: 5, effectiveness: 0.6 },
  mop: { name: 'Wood Ash + Banana Stem', dose_multiplier: 8, effectiveness: 0.65 },
  imidacloprid: { name: 'Neem Oil + Beauveria', dose_multiplier: 2, effectiveness: 0.6 },
  chlorpyrifos: { name: 'Neem Cake + Metarhizium', dose_multiplier: 3, effectiveness: 0.55 },
  mancozeb: { name: 'Trichoderma + Pseudomonas', dose_multiplier: 2, effectiveness: 0.6 },
  carbendazim: { name: 'Trichoderma viride', dose_multiplier: 2, effectiveness: 0.55 }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN POST-PROCESSING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ProcessedTask {
  task_name: string;
  task_name_english: string;
  description: string;
  description_english: string;
  instructions: string[];
  instructions_english: string[];
  stage_key: string;
  category: string;
  days_from_sowing: number;
  product_recommendations: ProcessedProduct[];
  estimated_cost: number;
  labor_cost: number;
  product_cost: number;
  cost_breakdown: { item: string; cost: number }[];
  confidence_score: number;
  based_on: string[];
  risk_if_ignored: string;
  scientific_reason: string;
}

export interface ProcessedProduct {
  product_name: string;
  product_name_english: string;
  product_type: string;
  dose_per_acre: string;
  dose_for_land: string;
  application_method: string;
  price_estimate: number;
  active_ingredient?: string;
}

/**
 * Translate text to rural farmer-friendly language
 */
export function translateToRuralLanguage(text: string, language: string): string {
  if (!text) return '';
  
  const dict = RURAL_DICTIONARY[language] || RURAL_DICTIONARY.en;
  let translated = text;
  
  // Replace technical terms with rural equivalents
  for (const [english, rural] of Object.entries(dict)) {
    const regex = new RegExp(english, 'gi');
    translated = translated.replace(regex, rural);
  }
  
  return translated;
}

/**
 * Get translated crop name
 */
export function getCropName(cropKey: string, language: string): string {
  const langCrops = CROP_NAMES[language] || CROP_NAMES.en;
  return langCrops[cropKey.toLowerCase()] || cropKey;
}

/**
 * Convert units to local farmer units
 */
export function convertToLocalUnits(
  value: number, 
  fromUnit: string, 
  toUnit: string,
  language: string
): { value: number; displayString: string } {
  let convertedValue = value;
  
  const conversionKey = `${fromUnit}_to_${toUnit}` as keyof typeof UNIT_CONVERSIONS;
  if (UNIT_CONVERSIONS[conversionKey]) {
    convertedValue = value * UNIT_CONVERSIONS[conversionKey];
  }
  
  // Format for display
  const unitLabels: Record<string, Record<string, string>> = {
    hi: { acre: 'एकड़', hectare: 'हेक्टेयर', guntha: 'गुंठा', kg: 'किलो', liter: 'लीटर', quintal: 'क्विंटल' },
    mr: { acre: 'एकर', hectare: 'हेक्टर', guntha: 'गुंठे', kg: 'किलो', liter: 'लिटर', quintal: 'क्विंटल' },
    en: { acre: 'acre', hectare: 'hectare', guntha: 'guntha', kg: 'kg', liter: 'liter', quintal: 'quintal' }
  };
  
  const label = unitLabels[language]?.[toUnit] || toUnit;
  const displayValue = Number.isInteger(convertedValue) ? convertedValue : convertedValue.toFixed(2);
  
  return {
    value: convertedValue,
    displayString: `${displayValue} ${label}`
  };
}

/**
 * Calculate total cost for a task
 */
export function calculateTaskCost(
  category: string,
  products: { product_name: string; dose_per_acre?: string; quantity?: number }[],
  landAreaAcres: number,
  laborRate: number = 350
): CostEstimate {
  const breakdown: { item: string; cost: number }[] = [];
  let productCost = 0;
  
  // Calculate product costs
  for (const product of products) {
    const productLower = product.product_name.toLowerCase();
    let unitPrice = 0;
    
    // Match with known prices
    for (const [key, price] of Object.entries(MARKET_PRICES)) {
      if (productLower.includes(key.replace('_', ' ')) || productLower.includes(key)) {
        unitPrice = price;
        break;
      }
    }
    
    if (unitPrice === 0) {
      // Default prices by category
      const categoryDefaults: Record<string, number> = {
        fertilizer: 600,
        organic_input: 800,
        pesticide: 500,
        fungicide: 400,
        growth_promoter: 450,
        seed_treatment: 300
      };
      unitPrice = categoryDefaults[category] || 400;
    }
    
    const cost = Math.round(unitPrice * landAreaAcres);
    productCost += cost;
    breakdown.push({ item: product.product_name, cost });
  }
  
  // Calculate labor cost
  const laborReq = LABOR_REQUIREMENTS[category] || { workers: 1, days: 1 };
  const laborCost = Math.round(laborReq.workers * laborReq.days * landAreaAcres * laborRate);
  breakdown.push({ item: 'Labor', cost: laborCost });
  
  return {
    product_cost: productCost,
    labor_cost: laborCost,
    total_cost: productCost + laborCost,
    cost_per_acre: Math.round((productCost + laborCost) / landAreaAcres),
    currency: 'INR',
    breakdown
  };
}

/**
 * Convert chemical products to organic alternatives
 */
export function substituteForOrganic(
  products: { product_name: string; dose_per_acre?: string }[],
  language: string
): { product_name: string; dose_per_acre: string; is_substitute: boolean; effectiveness: number }[] {
  return products.map(product => {
    const productLower = product.product_name.toLowerCase();
    
    for (const [chemical, organic] of Object.entries(ORGANIC_SUBSTITUTES)) {
      if (productLower.includes(chemical)) {
        // Get original dose number
        const doseMatch = product.dose_per_acre?.match(/(\d+(?:\.\d+)?)/);
        const originalDose = doseMatch ? parseFloat(doseMatch[1]) : 10;
        const newDose = Math.round(originalDose * organic.dose_multiplier);
        
        return {
          product_name: translateToRuralLanguage(organic.name, language),
          dose_per_acre: `${newDose} kg/acre`,
          is_substitute: true,
          effectiveness: organic.effectiveness
        };
      }
    }
    
    return {
      product_name: translateToRuralLanguage(product.product_name, language),
      dose_per_acre: product.dose_per_acre || '',
      is_substitute: false,
      effectiveness: 1.0
    };
  });
}

/**
 * Process full task with all post-processing
 */
export function processTask(
  task: any,
  cropName: string,
  landAreaAcres: number,
  farmingType: string,
  language: string,
  laborRate: number = 350
): ProcessedTask {
  // Translate crop name
  const translatedCrop = getCropName(cropName, language);
  
  // Translate task name
  let taskNameTranslated = translateToRuralLanguage(task.task_name || '', language);
  if (!taskNameTranslated.includes(translatedCrop)) {
    taskNameTranslated = `${translatedCrop} - ${taskNameTranslated}`;
  }
  
  // Translate description
  const descriptionTranslated = translateToRuralLanguage(task.description || '', language);
  
  // Translate instructions
  const instructionsTranslated = (task.instructions || []).map((i: string) => 
    translateToRuralLanguage(i, language)
  );
  
  // Process products
  let products = task.product_recommendations || [];
  
  // Substitute for organic if needed
  if (farmingType === 'organic_only') {
    products = substituteForOrganic(products, language);
  }
  
  // Calculate doses for land area and costs
  const processedProducts: ProcessedProduct[] = products.map((p: any) => {
    // Parse dose
    const doseMatch = p.dose_per_acre?.match(/(\d+(?:\.\d+)?)\s*(\w+)/);
    let doseForLand = p.dose_per_acre || '';
    
    if (doseMatch) {
      const [_, amount, unit] = doseMatch;
      const totalAmount = Math.round(parseFloat(amount) * landAreaAcres * 10) / 10;
      doseForLand = `${totalAmount} ${unit}`;
    }
    
    return {
      product_name: translateToRuralLanguage(p.product_name || '', language),
      product_name_english: p.product_name || '',
      product_type: p.product_type || 'other',
      dose_per_acre: p.dose_per_acre || '',
      dose_for_land: doseForLand,
      application_method: translateToRuralLanguage(p.application_method || '', language),
      price_estimate: p.price_estimate || 0,
      active_ingredient: p.active_ingredient
    };
  });
  
  // Calculate costs
  const costEstimate = calculateTaskCost(
    task.category || 'other',
    products,
    landAreaAcres,
    laborRate
  );
  
  // Translate risk and scientific reason
  const riskTranslated = translateToRuralLanguage(task.risk_if_ignored || '', language);
  const scientificReasonTranslated = translateToRuralLanguage(task.scientific_reason || '', language);
  
  return {
    task_name: taskNameTranslated,
    task_name_english: task.task_name || '',
    description: descriptionTranslated,
    description_english: task.description || '',
    instructions: instructionsTranslated,
    instructions_english: task.instructions || [],
    stage_key: task.stage_key || 'vegetative_growth',
    category: task.category || 'other',
    days_from_sowing: task.days_from_sowing || 0,
    product_recommendations: processedProducts,
    estimated_cost: costEstimate.total_cost,
    labor_cost: costEstimate.labor_cost,
    product_cost: costEstimate.product_cost,
    cost_breakdown: costEstimate.breakdown,
    confidence_score: task.confidence_score || 0.5,
    based_on: task.based_on || [],
    risk_if_ignored: riskTranslated,
    scientific_reason: scientificReasonTranslated
  };
}

/**
 * Process entire schedule
 */
export function processSchedule(
  tasks: any[],
  cropName: string,
  landAreaAcres: number,
  farmingType: string,
  language: string,
  laborRate: number = 350
): ProcessedTask[] {
  return tasks.map(task => 
    processTask(task, cropName, landAreaAcres, farmingType, language, laborRate)
  );
}

/**
 * Generate yield benefit statement with confidence
 */
export function generateYieldStatement(
  expectedYield: number,
  confidenceScore: number,
  ndviTrend: string,
  rainfallStatus: string,
  language: string
): { statement: string; confidence: number; assumptions: string[] } {
  const assumptions: string[] = [];
  let adjustedConfidence = confidenceScore;
  
  // Adjust based on conditions
  if (ndviTrend === 'declining') {
    adjustedConfidence *= 0.8;
    assumptions.push(language === 'hi' ? 'NDVI में गिरावट' : language === 'mr' ? 'NDVI मध्ये घट' : 'NDVI declining');
  }
  
  if (rainfallStatus === 'deficit') {
    adjustedConfidence *= 0.85;
    assumptions.push(language === 'hi' ? 'वर्षा कम' : language === 'mr' ? 'पाऊस कमी' : 'Rainfall deficit');
  }
  
  // Calculate range
  const minYield = Math.round(expectedYield * 0.8);
  const maxYield = Math.round(expectedYield * 1.2);
  
  const statement = language === 'hi' 
    ? `अनुमानित पैदावार: ${minYield}-${maxYield} क्विंटल/एकड़ (${Math.round(adjustedConfidence * 100)}% विश्वास)`
    : language === 'mr'
    ? `अंदाजित उत्पादन: ${minYield}-${maxYield} क्विंटल/एकर (${Math.round(adjustedConfidence * 100)}% विश्वास)`
    : `Expected yield: ${minYield}-${maxYield} quintal/acre (${Math.round(adjustedConfidence * 100)}% confidence)`;
  
  return {
    statement,
    confidence: adjustedConfidence,
    assumptions
  };
}
