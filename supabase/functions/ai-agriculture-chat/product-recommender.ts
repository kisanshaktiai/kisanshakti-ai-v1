// ============= PRODUCT RECOMMENDER WITH MASTER TABLE INTEGRATION =============

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface ProductRecommendation {
  id: string;
  name: string;
  brand: string;
  productType: 'organic' | 'fertilizer' | 'pesticide' | 'fungicide' | 'herbicide' | 'bio_input' | 'growth_regulator';
  purpose: string;
  dosage: string;
  applicationMethod: string;
  safetyNote: string;
  price?: string;
  organic_certified: boolean;
  effectiveness_rating: number;
  priority: number; // 1=organic, 2=fertilizer, 3=chemical
}

export interface RecommendationResult {
  products: ProductRecommendation[];
  source: 'master_table' | 'web_search' | 'ai_generated';
  fallbackReason?: string;
}

// Product type priority mapping (organic first, chemical last)
const PRODUCT_PRIORITY: Record<string, number> = {
  'organic': 1,
  'bio_input': 1,
  'fertilizer': 2,
  'growth_regulator': 2,
  'fungicide': 3,
  'pesticide': 3,
  'herbicide': 3
};

export async function getProductRecommendations(
  supabase: any,
  cropName: string,
  problemType: 'pest' | 'disease' | 'nutrient' | 'weed' | 'growth',
  soilType?: string,
  tenantId?: string
): Promise<RecommendationResult> {
  try {
    console.log(`🛒 Fetching product recommendations: crop=${cropName}, problem=${problemType}`);
    
    // Build query for master products
    let query = supabase
      .from('master_products')
      .select(`
        id,
        name,
        brand,
        product_type,
        description,
        dosage_instructions,
        application_method,
        safety_level,
        suitable_crops,
        suitable_soil_types,
        organic_certified,
        effectiveness_rating,
        price_range,
        ai_recommendable,
        active_ingredients
      `)
      .eq('status', 'active')
      .eq('ai_recommendable', true);
    
    // Filter by problem type
    if (problemType === 'pest') {
      query = query.in('product_type', ['pesticide', 'bio_input', 'organic']);
    } else if (problemType === 'disease') {
      query = query.in('product_type', ['fungicide', 'bio_input', 'organic']);
    } else if (problemType === 'nutrient') {
      query = query.in('product_type', ['fertilizer', 'organic', 'bio_input']);
    } else if (problemType === 'weed') {
      query = query.in('product_type', ['herbicide', 'organic']);
    } else if (problemType === 'growth') {
      query = query.in('product_type', ['growth_regulator', 'bio_input', 'organic', 'fertilizer']);
    }
    
    // Execute query
    const { data: products, error } = await query.limit(10);
    
    if (error) {
      console.error('Error fetching products:', error);
      return {
        products: [],
        source: 'ai_generated',
        fallbackReason: 'Database query failed'
      };
    }
    
    if (!products || products.length === 0) {
      console.log('No products found in master table');
      return {
        products: [],
        source: 'ai_generated',
        fallbackReason: 'No matching products in database'
      };
    }
    
    // Filter products suitable for the crop
    const suitableProducts = products.filter((product: any) => {
      if (!product.suitable_crops) return true;
      const crops = Array.isArray(product.suitable_crops) 
        ? product.suitable_crops 
        : Object.keys(product.suitable_crops);
      return crops.length === 0 || 
             crops.some((c: string) => 
               c.toLowerCase().includes(cropName.toLowerCase()) ||
               cropName.toLowerCase().includes(c.toLowerCase()) ||
               c.toLowerCase() === 'all'
             );
    });
    
    // Filter by soil type if provided
    const finalProducts = soilType 
      ? suitableProducts.filter((product: any) => {
          if (!product.suitable_soil_types) return true;
          const soils = Array.isArray(product.suitable_soil_types) 
            ? product.suitable_soil_types 
            : Object.keys(product.suitable_soil_types);
          return soils.length === 0 || 
                 soils.some((s: string) => 
                   s.toLowerCase().includes(soilType.toLowerCase()) ||
                   s.toLowerCase() === 'all'
                 );
        })
      : suitableProducts;
    
    // Transform and sort products
    const recommendations: ProductRecommendation[] = finalProducts
      .map((product: any) => ({
        id: product.id,
        name: product.name,
        brand: product.brand || 'Generic',
        productType: product.product_type,
        purpose: product.description || getPurposeFromType(product.product_type),
        dosage: product.dosage_instructions || 'Follow label instructions',
        applicationMethod: product.application_method || 'As per manufacturer guidelines',
        safetyNote: getSafetyNote(product.safety_level, product.product_type),
        price: formatPrice(product.price_range),
        organic_certified: product.organic_certified || false,
        effectiveness_rating: product.effectiveness_rating || 3.5,
        priority: PRODUCT_PRIORITY[product.product_type] || 3
      }))
      .sort((a, b) => {
        // Sort by priority (organic first), then by effectiveness
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (b.effectiveness_rating || 0) - (a.effectiveness_rating || 0);
      })
      .slice(0, 5); // Return top 5
    
    console.log(`✅ Found ${recommendations.length} product recommendations`);
    
    return {
      products: recommendations,
      source: 'master_table'
    };
    
  } catch (error) {
    console.error('Error in getProductRecommendations:', error);
    return {
      products: [],
      source: 'ai_generated',
      fallbackReason: 'Exception occurred'
    };
  }
}

function getPurposeFromType(productType: string): string {
  const purposes: Record<string, string> = {
    'organic': 'Natural/organic solution for crop health',
    'bio_input': 'Biological input for sustainable farming',
    'fertilizer': 'Nutrient supplement for crop growth',
    'pesticide': 'Control of harmful insects',
    'fungicide': 'Prevention and treatment of fungal diseases',
    'herbicide': 'Weed control',
    'growth_regulator': 'Plant growth enhancement'
  };
  return purposes[productType] || 'Agricultural input';
}

function getSafetyNote(safetyLevel: string, productType: string): string {
  if (safetyLevel === 'safe' || productType === 'organic' || productType === 'bio_input') {
    return '✅ Safe for use. Minimal precautions required.';
  } else if (safetyLevel === 'moderate') {
    return '⚠️ Wear gloves and mask during application. Wash hands after use.';
  } else {
    return '🔴 Use protective equipment. Keep away from children and animals. Do not apply before rain.';
  }
}

function formatPrice(priceRange: any): string {
  if (!priceRange) return 'Price varies';
  if (typeof priceRange === 'string') return priceRange;
  if (priceRange.min && priceRange.max) {
    return `₹${priceRange.min} - ₹${priceRange.max}`;
  }
  return 'Price varies';
}

// Generate product context for AI prompt
export function generateProductContext(
  recommendations: RecommendationResult,
  language: string
): string {
  if (recommendations.products.length === 0) {
    return '';
  }
  
  const labels = {
    en: {
      organic: '🟢 ORGANIC SOLUTIONS (Recommended First)',
      fertilizer: '🟡 FERTILIZER OPTIONS',
      chemical: '🔴 CHEMICAL TREATMENTS (Last Resort)'
    },
    hi: {
      organic: '🟢 जैविक उपाय (पहले आज़माएं)',
      fertilizer: '🟡 खाद विकल्प',
      chemical: '🔴 रासायनिक उपचार (अंतिम विकल्प)'
    },
    mr: {
      organic: '🟢 सेंद्रिय उपाय (प्रथम प्राधान्य)',
      fertilizer: '🟡 खत पर्याय',
      chemical: '🔴 रासायनिक उपचार (शेवटचा पर्याय)'
    }
  };
  
  const l = labels[language as keyof typeof labels] || labels.en;
  
  let context = '\n\n📦 AVAILABLE PRODUCTS FROM DATABASE:\n';
  context += '(Include these specific products in your recommendations)\n\n';
  
  // Group by priority
  const organic = recommendations.products.filter(p => p.priority === 1);
  const fertilizers = recommendations.products.filter(p => p.priority === 2);
  const chemicals = recommendations.products.filter(p => p.priority === 3);
  
  if (organic.length > 0) {
    context += `${l.organic}\n`;
    organic.forEach(p => {
      context += `• ${p.name} (${p.brand})\n`;
      context += `  Purpose: ${p.purpose}\n`;
      context += `  Dosage: ${p.dosage}\n`;
      context += `  Method: ${p.applicationMethod}\n`;
      context += `  Safety: ${p.safetyNote}\n`;
      if (p.price) context += `  Price: ${p.price}\n`;
      context += '\n';
    });
  }
  
  if (fertilizers.length > 0) {
    context += `${l.fertilizer}\n`;
    fertilizers.forEach(p => {
      context += `• ${p.name} (${p.brand})\n`;
      context += `  Purpose: ${p.purpose}\n`;
      context += `  Dosage: ${p.dosage}\n`;
      if (p.price) context += `  Price: ${p.price}\n`;
      context += '\n';
    });
  }
  
  if (chemicals.length > 0) {
    context += `${l.chemical}\n`;
    chemicals.forEach(p => {
      context += `• ${p.name} (${p.brand})\n`;
      context += `  Purpose: ${p.purpose}\n`;
      context += `  Dosage: ${p.dosage}\n`;
      context += `  ⚠️ Safety: ${p.safetyNote}\n`;
      if (p.price) context += `  Price: ${p.price}\n`;
      context += '\n';
    });
  }
  
  context += '\nIMPORTANT: Always recommend organic solutions FIRST, then fertilizers, then chemicals as last resort.\n';
  
  return context;
}

// Detect what type of products to recommend based on query
export function detectProductNeed(text: string): {
  needsProducts: boolean;
  problemType: 'pest' | 'disease' | 'nutrient' | 'weed' | 'growth' | null;
} {
  const lowerText = text.toLowerCase();
  
  // Pest keywords
  const pestKeywords = ['pest', 'insect', 'bug', 'aphid', 'worm', 'caterpillar', 'beetle', 'mite', 'thrips', 'borer',
    'कीड़े', 'कीट', 'इल्ली', 'माहू', 'थ्रिप्स', 'छेदक',
    'किडा', 'कीटक', 'अळी', 'मावा'];
  
  // Disease keywords
  const diseaseKeywords = ['disease', 'fungus', 'rot', 'blight', 'rust', 'mildew', 'wilt', 'spot', 'yellow', 'brown',
    'बीमारी', 'रोग', 'फफूंद', 'गलन', 'जंग', 'फफूंदी', 'मुरझान',
    'आजार', 'रोग', 'बुरशी', 'करपा', 'गंज', 'मर'];
  
  // Nutrient keywords
  const nutrientKeywords = ['fertilizer', 'nutrient', 'growth', 'yellow leaves', 'weak', 'stunted', 'npk', 'urea',
    'खाद', 'उर्वरक', 'पोषक', 'पीले पत्ते', 'कमजोर', 'छोटा',
    'खत', 'पोषण', 'पिवळी पाने', 'अशक्त'];
  
  // Weed keywords
  const weedKeywords = ['weed', 'grass', 'unwanted plant', 'खरपतवार', 'घास', 'तण', 'गवत'];
  
  // Growth keywords
  const growthKeywords = ['growth', 'boost', 'increase', 'bigger', 'hormone', 'flower', 'fruit',
    'बढ़वार', 'बढ़ाना', 'फूल', 'फल', 'वाढ', 'वाढवणे', 'फुले', 'फळ'];
  
  if (pestKeywords.some(kw => lowerText.includes(kw))) {
    return { needsProducts: true, problemType: 'pest' };
  }
  if (diseaseKeywords.some(kw => lowerText.includes(kw))) {
    return { needsProducts: true, problemType: 'disease' };
  }
  if (nutrientKeywords.some(kw => lowerText.includes(kw))) {
    return { needsProducts: true, problemType: 'nutrient' };
  }
  if (weedKeywords.some(kw => lowerText.includes(kw))) {
    return { needsProducts: true, problemType: 'weed' };
  }
  if (growthKeywords.some(kw => lowerText.includes(kw))) {
    return { needsProducts: true, problemType: 'growth' };
  }
  
  return { needsProducts: false, problemType: null };
}
