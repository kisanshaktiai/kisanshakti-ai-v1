/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REGIONAL AGRICULTURAL TRANSLATOR (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Translates agricultural terms to regional dialects based on farmer's location.
 * Uses LLM with location-aware prompts for authentic rural vocabulary.
 * 
 * SENIOR AGRONOMIST PRINCIPLE:
 * "Same pest has different names in different regions:
 *  - 'Shoot Borer' in Western Maharashtra → 'खोड किडा'
 *  - 'Shoot Borer' in Vidarbha → 'पोखरा किडा'
 *  - 'Shoot Borer' in Karnataka → 'ಗುರು ಕೊರೆಯುವ ಹುಳು'
 *  
 * Farmers understand LOCAL names, not bookish translations."
 * 
 * ARCHITECTURE:
 * 1. Extract farmer's district/region from landContext
 * 2. Build LLM prompt with regional context
 * 3. Get authentic regional translation
 * 4. Cache for future requests (optional)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const REGIONAL_TRANSLATOR_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface FarmerLocation {
  state: string;      // "Maharashtra", "Karnataka", etc.
  district: string;   // "Satara", "Pune", "Nagpur", etc.
  tehsil?: string;    // Optional: "Phaltan", etc.
  language: string;   // "mr", "hi", "kn", "ta", etc.
}

export interface TreatmentToTranslate {
  pest_name_en: string;           // "Shoot Borer"
  treatment_description_en: string; // "IPM Treatment Using Biocontrol"
  product_name_en?: string;       // "Trichogramma chilonis"
  method_en?: string;             // "Release 50,000 adults per acre"
}

export interface RegionalTranslation {
  pest_name_regional: string;
  treatment_label_regional: string;
  full_description_regional?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const LANGUAGE_MAP: Record<string, string> = {
  'mr': 'Marathi',
  'hi': 'Hindi',
  'kn': 'Kannada',
  'ta': 'Tamil',
  'te': 'Telugu',
  'gu': 'Gujarati',
  'pa': 'Punjabi',
  'bn': 'Bengali',
  'od': 'Odia',
  'en': 'English'
};

// ═══════════════════════════════════════════════════════════════════════════
// REGION-SPECIFIC KNOWN TRANSLATIONS (Fallback Cache)
// These are pre-verified translations for common terms by region
// ═══════════════════════════════════════════════════════════════════════════

const REGIONAL_FALLBACK_CACHE: Record<string, Record<string, Record<string, string>>> = {
  // Format: { pest_en: { district_lower: { language: translation } } }
  'shoot_borer': {
    'satara': { 'mr': 'खोड किडा' },
    'pune': { 'mr': 'खोड किडा' },
    'kolhapur': { 'mr': 'खोड किडा' },
    'nagpur': { 'mr': 'पोखरा किडा' },
    'amravati': { 'mr': 'पोखरा किडा' },
    'yavatmal': { 'mr': 'पोखरा किडा' },
    'belgaum': { 'kn': 'ಗುರು ಕೊರೆಯುವ ಹುಳು' },
    'default': { 'mr': 'खोड किडा', 'hi': 'तना छेदक', 'en': 'Shoot Borer' }
  },
  'early_shoot_borer': {
    'satara': { 'mr': 'सुरुवातीची खोड किडा' },
    'nagpur': { 'mr': 'लवकरचा पोखरा' },
    'default': { 'mr': 'सुरुवातीची खोड किडा', 'hi': 'प्रारंभिक तना छेदक', 'en': 'Early Shoot Borer' }
  },
  'termite': {
    'satara': { 'mr': 'वाळवी' },
    'nagpur': { 'mr': 'उधई' },
    'belgaum': { 'kn': 'ಗೆದ್ದಲು' },
    'default': { 'mr': 'वाळवी', 'hi': 'दीमक', 'en': 'Termite' }
  },
  'whitefly': {
    'satara': { 'mr': 'पांढरी माशी' },
    'nagpur': { 'mr': 'सफेद माशी' },
    'ahmedabad': { 'gu': 'સફેદ માખી' },
    'default': { 'mr': 'पांढरी माशी', 'hi': 'सफेद मक्खी', 'en': 'Whitefly' }
  },
  'root_rot': {
    'satara': { 'mr': 'मूळ कुज' },
    'nagpur': { 'mr': 'जड सड' },
    'default': { 'mr': 'मूळ कुज', 'hi': 'जड़ सड़न', 'en': 'Root Rot' }
  },
  'water_stress': {
    'default': { 'mr': 'पाणी ताण', 'hi': 'पानी तनाव', 'en': 'Water Stress' }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// LLM PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildRegionalPrompt(
  treatment: TreatmentToTranslate,
  location: FarmerLocation
): string {
  const targetLanguage = LANGUAGE_MAP[location.language] || 'Marathi';
  
  return `You are an agricultural expert translator for rural Indian farmers.

FARMER LOCATION:
- District: ${location.district}
- State: ${location.state}
${location.tehsil ? `- Tehsil: ${location.tehsil}` : ''}
- Language: ${targetLanguage}

TASK:
Translate this agricultural treatment to the ACTUAL vocabulary that farmers in ${location.district} district use when talking about their crops:

- Pest/Problem: ${treatment.pest_name_en}
- Treatment: ${treatment.treatment_description_en}
${treatment.product_name_en ? `- Product: ${treatment.product_name_en}` : ''}
${treatment.method_en ? `- Method: ${treatment.method_en}` : ''}

IMPORTANT RULES:
1. Use the dialect/vocabulary specific to ${location.district} district
2. Use simple, practical language that rural farmers actually speak (not formal ${targetLanguage})
3. If farmers in this region use a LOCAL pest name, use that instead of the standard translation
4. Keep product names transliterated if they're commonly known (e.g., ट्रायकोग्रामा for Trichogramma)
5. Use local measurement units (बिघा, एकर as appropriate for the region)
6. If there's a regional folk name for the pest, prefer that over scientific

RESPONSE FORMAT (JSON only, no markdown):
{
  "pest_name_regional": "<regional name farmers actually use>",
  "treatment_label_regional": "<short farmer-friendly treatment label>",
  "full_description_regional": "<complete treatment description>"
}

EXAMPLES:
- For "Shoot Borer" in Western Maharashtra → "खोड किडा"
- For "Shoot Borer" in Vidarbha → "पोखरा किडा"
- For "Shoot Borer" in Karnataka → "ಗುರು ಕೊರೆಯುವ ಹುಳು"

Now translate for ${location.district} district:`;
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM CALLER
// ═══════════════════════════════════════════════════════════════════════════

async function callLLMForTranslation(prompt: string): Promise<string | null> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ [RegionalTranslator] OPENAI_API_KEY not available');
    return null;
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',  // Cost-effective for translation
        messages: [
          { role: 'system', content: 'You are an agricultural translation expert for rural Indian farmers. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,  // Lower temperature for consistent translations
        max_tokens: 500
      })
    });
    
    if (!response.ok) {
      console.error(`❌ [RegionalTranslator] LLM call failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error(`❌ [RegionalTranslator] LLM call error:`, error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE PARSER
// ═══════════════════════════════════════════════════════════════════════════

function parseTranslationResponse(response: string): RegionalTranslation | null {
  try {
    // Clean markdown code blocks if present
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    if (parsed.pest_name_regional && parsed.treatment_label_regional) {
      return parsed as RegionalTranslation;
    }
    
    return null;
  } catch {
    console.warn('⚠️ [RegionalTranslator] Failed to parse LLM response');
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

function getFallbackTranslation(
  pestName: string,
  location: FarmerLocation
): RegionalTranslation | null {
  const normalizedPest = pestName.toLowerCase().replace(/[\s-]+/g, '_');
  const normalizedDistrict = location.district.toLowerCase();
  
  const pestCache = REGIONAL_FALLBACK_CACHE[normalizedPest];
  if (!pestCache) {
    return null;
  }
  
  // Try district-specific first
  const districtTranslation = pestCache[normalizedDistrict]?.[location.language];
  if (districtTranslation) {
    return {
      pest_name_regional: districtTranslation,
      treatment_label_regional: districtTranslation
    };
  }
  
  // Fall back to default for language
  const defaultTranslation = pestCache['default']?.[location.language];
  if (defaultTranslation) {
    return {
      pest_name_regional: defaultTranslation,
      treatment_label_regional: defaultTranslation
    };
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TRANSLATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Translate agricultural terms to regional farmer vocabulary.
 * 
 * PRIORITY:
 * 1. Cached regional translation (instant, verified)
 * 2. LLM translation (dynamic, context-aware)
 * 3. Fallback to English (last resort)
 */
export async function translateToRegionalTerms(
  treatment: TreatmentToTranslate,
  location: FarmerLocation
): Promise<RegionalTranslation> {
  console.log(`\n🌍 [RegionalTranslator v${REGIONAL_TRANSLATOR_VERSION}] Translating for ${location.district}, ${location.state} (${location.language})`);
  console.log(`   Input: ${treatment.pest_name_en}`);
  
  // STEP 1: Check fallback cache first (instant, verified)
  const cachedTranslation = getFallbackTranslation(treatment.pest_name_en, location);
  if (cachedTranslation) {
    console.log(`   ✅ Using CACHED regional translation: ${cachedTranslation.pest_name_regional}`);
    return cachedTranslation;
  }
  
  // STEP 2: Try LLM translation
  const prompt = buildRegionalPrompt(treatment, location);
  const llmResponse = await callLLMForTranslation(prompt);
  
  if (llmResponse) {
    const parsed = parseTranslationResponse(llmResponse);
    if (parsed) {
      console.log(`   ✅ LLM regional translation: ${parsed.pest_name_regional}`);
      return parsed;
    }
  }
  
  // STEP 3: Ultimate fallback
  console.log(`   ⚠️ Using fallback (original English)`);
  return {
    pest_name_regional: treatment.pest_name_en,
    treatment_label_regional: treatment.treatment_description_en
  };
}

/**
 * Batch translate multiple terms for efficiency.
 * Useful when generating diagnosis options with multiple causes.
 */
export async function batchTranslateTerms(
  terms: TreatmentToTranslate[],
  location: FarmerLocation
): Promise<RegionalTranslation[]> {
  // For now, translate sequentially (can be parallelized if needed)
  const results: RegionalTranslation[] = [];
  
  for (const term of terms) {
    const translation = await translateToRegionalTerms(term, location);
    results.push(translation);
  }
  
  return results;
}

/**
 * Quick translate just the pest/cause name for option labels.
 */
export async function translatePestName(
  pestNameEn: string,
  location: FarmerLocation
): Promise<string> {
  const translation = await translateToRegionalTerms(
    { pest_name_en: pestNameEn, treatment_description_en: '' },
    location
  );
  return translation.pest_name_regional;
}
