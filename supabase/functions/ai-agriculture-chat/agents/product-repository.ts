// ============= PRODUCT REPOSITORY (SSOT) =============

import { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

export interface ProductRecommendation {
  id: string;
  name: string;
  product_type: string;
  brand: string;
  active_ingredients: Array<{name: string; percentage: number; formulation?: string}>;
  dosage_instructions: string;
  application_method: string;
  pest_targets: string[];
  disease_targets: string[];
  suitable_crops: string[];
  pre_harvest_interval_days: number;
  spray_volume_per_acre: {min: number; max: number; unit: string};
  organic_certified: boolean;
  safety_level: string;
  effectiveness_rating: number;
  ai_metadata: {
    ipm_level: number;
    efficacy_percent: number;
    mode_of_action: string;
    timing: string;
    weather_restrictions: string;
    safety_precautions: string[];
    price_range?: string;
    formulation?: string;
    brand_examples?: string[];
  };
  translations: {
    mr?: string;
    hi?: string;
    en?: string;
  };
  // Computed fields for backward compatibility
  product_name: string;
  formulation: string;
  brand_examples: string[];
  dosage: string;
  dosage_per_acre: string;
  water_volume_per_acre: string;
  timing: string;
  phi_days: number;
  efficacy_percent: number;
  weather_restrictions: string;
  safety_precautions: string[];
  names: {
    mr: string;
    hi: string;
    en: string;
  };
}

// Helper to transform DB row to Recommendation object
function transformProduct(row: any): ProductRecommendation {
  const metadata = row.ai_metadata || {};
  const translations = row.translations || {};
  const volume = row.spray_volume_per_acre || { min: 200, max: 200, unit: 'L' };
  
  return {
    ...row,
    // Backward compatibility mappings
    product_name: row.name,
    formulation: metadata.formulation || '',
    brand_examples: metadata.brand_examples || (row.brand ? row.brand.split('/') : []),
    dosage: row.dosage_instructions?.split(' or ')?.[0] || row.dosage_instructions, // First part often concentration
    dosage_per_acre: row.dosage_instructions?.split(' or ')?.[1] || row.dosage_instructions, // Second part often per acre
    water_volume_per_acre: `${volume.min}-${volume.max} ${volume.unit}/acre`,
    timing: metadata.timing || '',
    phi_days: row.pre_harvest_interval_days || 0,
    efficacy_percent: metadata.efficacy_percent || 0,
    weather_restrictions: metadata.weather_restrictions || '',
    safety_precautions: metadata.safety_precautions || [],
    names: {
      mr: translations.mr || row.name,
      hi: translations.hi || row.name,
      en: translations.en || row.name
    }
  };
}

// Find best product for a specific pest
export async function findProductForPest(
  supabase: SupabaseClient,
  crop: string,
  pest: string,
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL',
  organicOnly: boolean = false
): Promise<ProductRecommendation | null> {
  
  // Map severity to max IPM level logic
  const severityToMaxIPM: Record<string, number> = {
    'LOW': 3,
    'MODERATE': 4,
    'HIGH': 5,
    'CRITICAL': 6
  };
  const maxIPMLevel = severityToMaxIPM[severity] || 5;
  
  // Normalize inputs
  const pestUpper = pest.toUpperCase().replace(/[_\s-]+/g, ''); // e.g. SHOOT_BORER -> SHOOTBORER
  const cropUpper = crop.toUpperCase().replace(/[_\s-]+/g, ''); // e.g. SUGARCANE -> SUGARCANE
  
  // Note: JSONB contains query uses strict string matching, so we rely on
  
  let query = supabase
    .from('master_products')
    .select('*')
    .eq('ai_recommendable', true)
    .eq('status', 'active')
    // We use a broad filter then refine in memory if needed, or specific JSON path
    .order('effectiveness_rating', { ascending: false });

  if (organicOnly) {
    query = query.eq('organic_certified', true);
  }
  // NOTE: IPM level filtering is done in-memory below because
  // PostgREST .lte() on JSONB arrow path uses text comparison, not numeric.

  const { data, error } = await query;
  
  if (error || !data || data.length === 0) {
    console.log(`[ProductRepo] No product found for ${crop}/${pest}`);
    return null;
  }

  // Filter in memory for fuzzy matching on array elements + numeric IPM level
  const matched = data.filter((p: any) => {
    // IPM level check (numeric, in-memory to avoid JSONB text comparison bug)
    if (!organicOnly) {
      const ipmLevel = Number(p.ai_metadata?.ipm_level);
      if (!isNaN(ipmLevel) && ipmLevel > maxIPMLevel) return false;
    }
    
    // Check crop
    const crops = p.suitable_crops || [];
    const hasCrop = crops.includes('ALL_CROPS') || 
                    crops.some((c: string) => c.toUpperCase().replace(/[_\s-]+/g, '').includes(cropUpper));
    if (!hasCrop) return false;

    // Check pest
    const pests = p.pest_targets || [];
    const hasPest = pests.some((pt: string) => {
      const ptNorm = pt.toUpperCase().replace(/[_\s-]+/g, '');
      return ptNorm.includes(pestUpper) || pestUpper.includes(ptNorm);
    });
    return hasPest;
  });

  if (matched.length === 0) return null;

  return transformProduct(matched[0]);
}

// Find best product for a specific disease
export async function findProductForDisease(
  supabase: SupabaseClient,
  crop: string,
  disease: string,
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL',
  organicOnly: boolean = false
): Promise<ProductRecommendation | null> {
  
  const diseaseUpper = disease.toUpperCase().replace(/[_\s-]+/g, '');
  const cropUpper = crop.toUpperCase().replace(/[_\s-]+/g, '');

  let query = supabase
    .from('master_products')
    .select('*')
    .eq('ai_recommendable', true)
    .eq('status', 'active')
    .or('product_type.eq.fungicide,product_type.eq.bio_input')
    .order('effectiveness_rating', { ascending: false });

  if (organicOnly) {
    query = query.eq('organic_certified', true);
  }

  const { data, error } = await query;

  if (error || !data) return null;

  const matched = data.filter((p: any) => {
    // Check crop
    const crops = p.suitable_crops || [];
    const hasCrop = crops.includes('ALL_CROPS') || 
                    crops.some((c: string) => c.toUpperCase().replace(/[_\s-]+/g, '').includes(cropUpper));
    if (!hasCrop) return false;

    // Check disease
    const diseases = p.disease_targets || [];
    const hasDisease = diseases.some((dt: string) => {
      const dtNorm = dt.toUpperCase().replace(/[_\s-]+/g, '');
      return dtNorm.includes(diseaseUpper) || diseaseUpper.includes(dtNorm);
    });
    return hasDisease;
  });

  if (matched.length === 0) return null;

  return transformProduct(matched[0]);
}

// Check regulatory status of a chemical
export async function checkChemicalStatus(
  supabase: SupabaseClient,
  chemicalName: string
): Promise<{status: 'banned' | 'restricted' | 'watch_list' | 'allowed'; reason?: string}> {
  
  const cleanName = chemicalName.trim().toLowerCase();
  
  const { data, error } = await supabase
    .from('chemical_regulatory_status')
    .select('status, reason')
    .ilike('chemical_name', `%${cleanName}%`)
    .limit(1)
    .maybeSingle(); // Use maybeSingle to avoid 406 error if multiple match, or none
  
  if (error || !data) {
    return { status: 'allowed' };
  }
  
  return { status: data.status, reason: data.reason };
}

// Get products by IPM level (for multi-stage recommendation)
export async function getProductsByIPMLevel(
  supabase: SupabaseClient,
  crop: string,
  targetType: 'pest' | 'disease',
  targetCode: string,
  ipmLevel: number
): Promise<ProductRecommendation[]> {
  
  const targetUpper = targetCode.toUpperCase().replace(/[_\s-]+/g, '');
  const cropUpper = crop.toUpperCase().replace(/[_\s-]+/g, '');
  
  // Map requested IPM level to allowed range in DB
  // DB has 3(botanical), 4(bio), 5(chem)
  const allowedLevels = ipmLevel <= 2 ? [3] : // Cultural/Mech -> fallback to Botanical
                        ipmLevel === 3 ? [3, 4] :
                        ipmLevel === 4 ? [4, 5] :
                        [5, 6];

  const { data, error } = await supabase
    .from('master_products')
    .select('*')
    .eq('ai_recommendable', true)
    .eq('status', 'active')
    // We can't filter by array content efficiently with fuzzy match in SQL without exact codes
    .order('effectiveness_rating', { ascending: false });

  if (error || !data) return [];

  const matched = data.filter((p: any) => {
    // IPM level check (numeric, in-memory to avoid JSONB text comparison bug)
    const ipmLevel = Number(p.ai_metadata?.ipm_level);
    if (!isNaN(ipmLevel) && !allowedLevels.includes(ipmLevel)) return false;
    
    // Crop check
    const crops = p.suitable_crops || [];
    const hasCrop = crops.includes('ALL_CROPS') || 
                    crops.some((c: string) => c.toUpperCase().replace(/[_\s-]+/g, '').includes(cropUpper));
    if (!hasCrop) return false;

    // Target check
    const targets = targetType === 'pest' ? (p.pest_targets || []) : (p.disease_targets || []);
    return targets.some((t: string) => {
      const tNorm = t.toUpperCase().replace(/[_\s-]+/g, '');
      return tNorm.includes(targetUpper) || targetUpper.includes(tNorm);
    });
  });

  return matched.map(transformProduct);
}
