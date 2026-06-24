/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGRONOMIC KNOWLEDGE BASE - ICAR/SAU/KVK Scientific Standards
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module contains all agronomic data as structured references.
 * AI prompts should reference rule_id, NOT read this data directly.
 * 
 * Version: 2.0.0
 * Last Updated: 2024-25 (Rabi/Kharif Standards)
 */

// ═══════════════════════════════════════════════════════════════════════════
// RULE ID SYSTEM - All recommendations are identified by rule_id
// ═══════════════════════════════════════════════════════════════════════════

export interface AgroRule {
  rule_id: string;
  category: 'npk' | 'ipm' | 'seed' | 'fertilizer' | 'irrigation' | 'pest' | 'disease' | 'organic';
  crop?: string;
  stage?: string;
  confidence: number; // 0-1
  source: string; // ICAR, SAU, KVK reference
  conditions: Record<string, any>;
  recommendation: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════
// NPK TARGETS BY CROP (kg/ha) - ICAR Standards
// ═══════════════════════════════════════════════════════════════════════════
export const NPK_TARGETS: Record<string, { 
  rule_id: string;
  n: number; 
  p: number; 
  k: number; 
  split_schedule: { stage: string; n_pct: number; p_pct: number; k_pct: number }[];
  source: string;
}> = {
  wheat: {
    rule_id: 'NPK_WHEAT_001',
    n: 120, p: 60, k: 40,
    split_schedule: [
      { stage: 'basal', n_pct: 50, p_pct: 100, k_pct: 100 },
      { stage: 'first_irrigation', n_pct: 25, p_pct: 0, k_pct: 0 },
      { stage: 'heading', n_pct: 25, p_pct: 0, k_pct: 0 }
    ],
    source: 'ICAR-IARI Package of Practices 2024'
  },
  rice: {
    rule_id: 'NPK_RICE_001',
    n: 120, p: 60, k: 60,
    split_schedule: [
      { stage: 'basal', n_pct: 50, p_pct: 100, k_pct: 50 },
      { stage: 'tillering', n_pct: 25, p_pct: 0, k_pct: 25 },
      { stage: 'panicle_initiation', n_pct: 25, p_pct: 0, k_pct: 25 }
    ],
    source: 'ICAR-CRRI Cuttack Guidelines'
  },
  cotton: {
    rule_id: 'NPK_COTTON_001',
    n: 150, p: 60, k: 60,
    split_schedule: [
      { stage: 'basal', n_pct: 25, p_pct: 100, k_pct: 50 },
      { stage: 'square_formation', n_pct: 50, p_pct: 0, k_pct: 25 },
      { stage: 'boll_formation', n_pct: 25, p_pct: 0, k_pct: 25 }
    ],
    source: 'ICAR-CICR Nagpur Recommendations'
  },
  sugarcane: {
    rule_id: 'NPK_SUGARCANE_001',
    n: 250, p: 85, k: 85,
    split_schedule: [
      { stage: 'basal', n_pct: 20, p_pct: 100, k_pct: 50 },
      { stage: '45_days', n_pct: 30, p_pct: 0, k_pct: 25 },
      { stage: '90_days', n_pct: 30, p_pct: 0, k_pct: 25 },
      { stage: '120_days', n_pct: 20, p_pct: 0, k_pct: 0 }
    ],
    source: 'ICAR-SBI Coimbatore'
  },
  soybean: {
    rule_id: 'NPK_SOYBEAN_001',
    n: 30, p: 60, k: 30,
    split_schedule: [
      { stage: 'basal', n_pct: 100, p_pct: 100, k_pct: 100 }
    ],
    source: 'ICAR-IISR Indore'
  },
  maize: {
    rule_id: 'NPK_MAIZE_001',
    n: 120, p: 60, k: 40,
    split_schedule: [
      { stage: 'basal', n_pct: 33, p_pct: 100, k_pct: 100 },
      { stage: 'knee_high', n_pct: 33, p_pct: 0, k_pct: 0 },
      { stage: 'tasseling', n_pct: 34, p_pct: 0, k_pct: 0 }
    ],
    source: 'ICAR-DMR New Delhi'
  },
  groundnut: {
    rule_id: 'NPK_GROUNDNUT_001',
    n: 25, p: 50, k: 50,
    split_schedule: [
      { stage: 'basal', n_pct: 100, p_pct: 100, k_pct: 100 }
    ],
    source: 'ICAR-DGR Junagadh'
  },
  tomato: {
    rule_id: 'NPK_TOMATO_001',
    n: 150, p: 80, k: 80,
    split_schedule: [
      { stage: 'basal', n_pct: 30, p_pct: 100, k_pct: 50 },
      { stage: 'transplanting', n_pct: 20, p_pct: 0, k_pct: 25 },
      { stage: 'flowering', n_pct: 25, p_pct: 0, k_pct: 25 },
      { stage: 'fruiting', n_pct: 25, p_pct: 0, k_pct: 0 }
    ],
    source: 'ICAR-IIHR Bangalore'
  },
  onion: {
    rule_id: 'NPK_ONION_001',
    n: 110, p: 40, k: 60,
    split_schedule: [
      { stage: 'basal', n_pct: 50, p_pct: 100, k_pct: 100 },
      { stage: '30_days', n_pct: 25, p_pct: 0, k_pct: 0 },
      { stage: '45_days', n_pct: 25, p_pct: 0, k_pct: 0 }
    ],
    source: 'ICAR-DOGR Rajgurunagar'
  },
  default: {
    rule_id: 'NPK_DEFAULT_001',
    n: 80, p: 40, k: 40,
    split_schedule: [
      { stage: 'basal', n_pct: 50, p_pct: 100, k_pct: 100 },
      { stage: 'vegetative', n_pct: 50, p_pct: 0, k_pct: 0 }
    ],
    source: 'General ICAR Guidelines'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// IPM ETL THRESHOLDS - Economic Threshold Levels
// ═══════════════════════════════════════════════════════════════════════════
export interface IPMThreshold {
  rule_id: string;
  pest_name: string;
  pest_name_local: Record<string, string>;
  crop: string[];
  etl: number;
  etl_unit: string;
  sampling_method: string;
  action_threshold: string;
  organic_control: string[];
  chemical_control: string[];
  source: string;
}

export const IPM_THRESHOLDS: IPMThreshold[] = [
  {
    rule_id: 'IPM_BOLLWORM_001',
    pest_name: 'American Bollworm',
    pest_name_local: { hi: 'अमेरिकी सुंडी', mr: 'अमेरिकन बोंडअळी' },
    crop: ['cotton', 'tomato', 'gram'],
    etl: 1,
    etl_unit: 'larva per plant',
    sampling_method: 'Check 20 plants randomly in X pattern',
    action_threshold: 'Spray when 1 larva found per plant or 5% fruiting bodies damaged',
    organic_control: ['Neem oil 5ml/L', 'Bt spray 1g/L', 'Trichogramma cards 50000/acre'],
    chemical_control: ['Emamectin benzoate 0.4g/L', 'Spinosad 0.3ml/L'],
    source: 'ICAR-CICR IPM Module'
  },
  {
    rule_id: 'IPM_APHID_001',
    pest_name: 'Aphids',
    pest_name_local: { hi: 'माहू/चेपा', mr: 'मावा' },
    crop: ['wheat', 'mustard', 'vegetables'],
    etl: 10,
    etl_unit: 'aphids per tiller/plant',
    sampling_method: 'Check 10 plants, count aphids on ear/top 10cm',
    action_threshold: 'Spray when 10+ aphids per plant or 50% plants infested',
    organic_control: ['Neem oil 5ml/L', 'Soap spray 10g/L', 'Beauveria bassiana 5g/L'],
    chemical_control: ['Imidacloprid 0.3ml/L', 'Thiamethoxam 0.2g/L'],
    source: 'ICAR-IARI Wheat IPM'
  },
  {
    rule_id: 'IPM_STEMBORRER_001',
    pest_name: 'Stem Borer',
    pest_name_local: { hi: 'तना छेदक', mr: 'खोडकिडा' },
    crop: ['rice', 'maize', 'sugarcane'],
    etl: 5,
    etl_unit: '% dead hearts',
    sampling_method: 'Count dead hearts in 20 hills randomly',
    action_threshold: 'Spray when 5% dead hearts observed',
    organic_control: ['Trichogramma japonicum 50000/acre', 'Neem cake 250kg/acre'],
    chemical_control: ['Cartap hydrochloride 1kg/acre', 'Chlorantraniliprole 0.3ml/L'],
    source: 'ICAR-CRRI Rice IPM'
  },
  {
    rule_id: 'IPM_WHITEFLY_001',
    pest_name: 'Whitefly',
    pest_name_local: { hi: 'सफेद मक्खी', mr: 'पांढरी माशी' },
    crop: ['cotton', 'vegetables', 'pulses'],
    etl: 5,
    etl_unit: 'adults per leaf',
    sampling_method: 'Check underside of 3 leaves from 20 plants',
    action_threshold: 'Spray when 5+ adults per leaf or honeydew visible',
    organic_control: ['Neem oil 5ml/L', 'Yellow sticky traps 10/acre', 'Verticillium lecanii 5g/L'],
    chemical_control: ['Spiromesifen 0.8ml/L', 'Diafenthiuron 1g/L'],
    source: 'ICAR-CICR Whitefly Management'
  },
  {
    rule_id: 'IPM_THRIPS_001',
    pest_name: 'Thrips',
    pest_name_local: { hi: 'थ्रिप्स', mr: 'फुलकिडे' },
    crop: ['onion', 'chilli', 'grapes'],
    etl: 10,
    etl_unit: 'thrips per leaf',
    sampling_method: 'Tap leaves over white paper, count thrips',
    action_threshold: 'Spray when 10+ thrips per leaf or silvery patches visible',
    organic_control: ['Neem oil 5ml/L', 'Blue sticky traps 10/acre', 'Beauveria 5g/L'],
    chemical_control: ['Fipronil 2ml/L', 'Spinosad 0.3ml/L'],
    source: 'ICAR-DOGR Onion IPM'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// SEED RATES - ICAR Recommended (per acre)
// ═══════════════════════════════════════════════════════════════════════════
export const SEED_RATES: Record<string, {
  rule_id: string;
  rate_kg_per_acre: number;
  spacing_cm: string;
  depth_cm: number;
  treatment: string;
  organic_treatment: string;
  price_per_kg: number;
  source: string;
}> = {
  wheat: {
    rule_id: 'SEED_WHEAT_001',
    rate_kg_per_acre: 40,
    spacing_cm: '22.5cm rows',
    depth_cm: 5,
    treatment: 'Carboxin + Thiram 2g/kg',
    organic_treatment: 'Trichoderma viride 4g/kg + Beejamrut soak',
    price_per_kg: 35,
    source: 'ICAR-IARI Wheat PoP'
  },
  rice: {
    rule_id: 'SEED_RICE_001',
    rate_kg_per_acre: 8,
    spacing_cm: '20x15cm',
    depth_cm: 2,
    treatment: 'Carbendazim 2g/kg',
    organic_treatment: 'Pseudomonas 10g/kg + Beejamrut',
    price_per_kg: 50,
    source: 'ICAR-CRRI Rice PoP'
  },
  cotton: {
    rule_id: 'SEED_COTTON_001',
    rate_kg_per_acre: 1,
    spacing_cm: '90x60cm',
    depth_cm: 3,
    treatment: 'Imidacloprid 5g/kg',
    organic_treatment: 'Trichoderma 10g/kg + Azotobacter',
    price_per_kg: 800,
    source: 'ICAR-CICR Cotton PoP'
  },
  soybean: {
    rule_id: 'SEED_SOYBEAN_001',
    rate_kg_per_acre: 30,
    spacing_cm: '45x5cm',
    depth_cm: 3,
    treatment: 'Thiram + Carbendazim 3g/kg',
    organic_treatment: 'Trichoderma 4g/kg + Rhizobium 20g/kg',
    price_per_kg: 80,
    source: 'ICAR-IISR Soybean PoP'
  },
  maize: {
    rule_id: 'SEED_MAIZE_001',
    rate_kg_per_acre: 8,
    spacing_cm: '60x20cm',
    depth_cm: 5,
    treatment: 'Thiram 3g/kg',
    organic_treatment: 'Trichoderma 4g/kg + Azospirillum',
    price_per_kg: 250,
    source: 'ICAR-DMR Maize PoP'
  },
  sugarcane: {
    rule_id: 'SEED_SUGARCANE_001',
    rate_kg_per_acre: 25000,
    spacing_cm: '90cm rows, 3-bud setts',
    depth_cm: 8,
    treatment: 'Carbendazim soak 0.1%',
    organic_treatment: 'Trichoderma dip + hot water treatment',
    price_per_kg: 3,
    source: 'ICAR-SBI Sugarcane PoP'
  },
  tomato: {
    rule_id: 'SEED_TOMATO_001',
    rate_kg_per_acre: 0.15,
    spacing_cm: '60x45cm',
    depth_cm: 1,
    treatment: 'Thiram 3g/kg',
    organic_treatment: 'Trichoderma 4g/kg + Beejamrut',
    price_per_kg: 25000,
    source: 'ICAR-IIHR Vegetable PoP'
  },
  onion: {
    rule_id: 'SEED_ONION_001',
    rate_kg_per_acre: 4,
    spacing_cm: '15x10cm',
    depth_cm: 1,
    treatment: 'Thiram 3g/kg',
    organic_treatment: 'Trichoderma 4g/kg',
    price_per_kg: 1500,
    source: 'ICAR-DOGR Onion PoP'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FERTILIZER DATABASE - Active Ingredient Based (NOT Trade Names)
// ═══════════════════════════════════════════════════════════════════════════
export interface FertilizerSpec {
  rule_id: string;
  active_ingredient: string;
  chemical_class: string;
  n_content: number;
  p_content: number;
  k_content: number;
  allowed_modes: ('organic_only' | 'fertilizer_pesticide' | 'organic_fertilizer')[];
  price_per_kg: number;
  application_method: string;
  max_dose_kg_per_acre: number;
  regulatory_status: 'approved' | 'restricted' | 'banned';
  organic_alternative?: string;
}

export const FERTILIZERS: Record<string, FertilizerSpec> = {
  urea: {
    rule_id: 'FERT_UREA_001',
    active_ingredient: 'Urea (CO(NH₂)₂)',
    chemical_class: 'Synthetic Nitrogen',
    n_content: 46,
    p_content: 0,
    k_content: 0,
    allowed_modes: ['fertilizer_pesticide', 'organic_fertilizer'],
    price_per_kg: 6.5,
    application_method: 'broadcasting',
    max_dose_kg_per_acre: 100,
    regulatory_status: 'approved',
    organic_alternative: 'Vermicompost + Jeevamrut'
  },
  dap: {
    rule_id: 'FERT_DAP_001',
    active_ingredient: 'Diammonium Phosphate ((NH₄)₂HPO₄)',
    chemical_class: 'Synthetic Phosphorus',
    n_content: 18,
    p_content: 46,
    k_content: 0,
    allowed_modes: ['fertilizer_pesticide', 'organic_fertilizer'],
    price_per_kg: 27,
    application_method: 'band_placement',
    max_dose_kg_per_acre: 50,
    regulatory_status: 'approved',
    organic_alternative: 'Rock Phosphate + PSB'
  },
  mop: {
    rule_id: 'FERT_MOP_001',
    active_ingredient: 'Muriate of Potash (KCl)',
    chemical_class: 'Potassium Chloride',
    n_content: 0,
    p_content: 0,
    k_content: 60,
    allowed_modes: ['fertilizer_pesticide', 'organic_fertilizer'],
    price_per_kg: 17,
    application_method: 'broadcasting',
    max_dose_kg_per_acre: 40,
    regulatory_status: 'approved',
    organic_alternative: 'Wood Ash + Banana Stem Compost'
  },
  vermicompost: {
    rule_id: 'FERT_VERMI_001',
    active_ingredient: 'Organic Matter + Humus',
    chemical_class: 'Organic',
    n_content: 1.5,
    p_content: 0.5,
    k_content: 0.5,
    allowed_modes: ['organic_only', 'fertilizer_pesticide', 'organic_fertilizer'],
    price_per_kg: 8,
    application_method: 'basal_application',
    max_dose_kg_per_acre: 2000,
    regulatory_status: 'approved'
  },
  fym: {
    rule_id: 'FERT_FYM_001',
    active_ingredient: 'Farmyard Manure',
    chemical_class: 'Organic',
    n_content: 0.5,
    p_content: 0.25,
    k_content: 0.5,
    allowed_modes: ['organic_only', 'fertilizer_pesticide', 'organic_fertilizer'],
    price_per_kg: 1,
    application_method: 'basal_application',
    max_dose_kg_per_acre: 5000,
    regulatory_status: 'approved'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PESTICIDE DATABASE - Active Ingredient Based
// ═══════════════════════════════════════════════════════════════════════════
export interface PesticideSpec {
  rule_id: string;
  active_ingredient: string;
  chemical_class: string;
  mode_of_action: string;
  target_pests: string[];
  allowed_modes: ('organic_only' | 'fertilizer_pesticide' | 'organic_fertilizer')[];
  dose_per_liter: string;
  phi_days: number; // Pre-Harvest Interval
  waiting_period_days: number;
  regulatory_status: 'approved' | 'restricted' | 'banned';
  organic_alternative?: string;
}

export const PESTICIDES: Record<string, PesticideSpec> = {
  imidacloprid: {
    rule_id: 'PEST_IMIDA_001',
    active_ingredient: 'Imidacloprid',
    chemical_class: 'Neonicotinoid',
    mode_of_action: 'Systemic - Nicotinic receptor agonist',
    target_pests: ['Aphids', 'Whitefly', 'Jassids', 'Thrips'],
    allowed_modes: ['fertilizer_pesticide'],
    dose_per_liter: '0.3ml',
    phi_days: 21,
    waiting_period_days: 7,
    regulatory_status: 'approved',
    organic_alternative: 'Neem oil 5ml/L + Beauveria 5g/L'
  },
  chlorpyrifos: {
    rule_id: 'PEST_CHLOR_001',
    active_ingredient: 'Chlorpyrifos',
    chemical_class: 'Organophosphate',
    mode_of_action: 'Contact - Acetylcholinesterase inhibitor',
    target_pests: ['Termites', 'Cutworms', 'Soil insects'],
    allowed_modes: ['fertilizer_pesticide'],
    dose_per_liter: '2ml',
    phi_days: 30,
    waiting_period_days: 14,
    regulatory_status: 'restricted',
    organic_alternative: 'Neem cake 250kg/acre + Metarhizium'
  },
  neem_oil: {
    rule_id: 'PEST_NEEM_001',
    active_ingredient: 'Azadirachtin',
    chemical_class: 'Botanical',
    mode_of_action: 'Antifeedant + Growth regulator',
    target_pests: ['Aphids', 'Whitefly', 'Caterpillars', 'Mites'],
    allowed_modes: ['organic_only', 'fertilizer_pesticide', 'organic_fertilizer'],
    dose_per_liter: '5ml',
    phi_days: 0,
    waiting_period_days: 0,
    regulatory_status: 'approved'
  },
  bt: {
    rule_id: 'PEST_BT_001',
    active_ingredient: 'Bacillus thuringiensis',
    chemical_class: 'Microbial',
    mode_of_action: 'Stomach poison - Crystal toxin',
    target_pests: ['Bollworms', 'Caterpillars', 'Leaf folders'],
    allowed_modes: ['organic_only', 'fertilizer_pesticide', 'organic_fertilizer'],
    dose_per_liter: '1g',
    phi_days: 0,
    waiting_period_days: 0,
    regulatory_status: 'approved'
  },
  beauveria: {
    rule_id: 'PEST_BEAUV_001',
    active_ingredient: 'Beauveria bassiana',
    chemical_class: 'Entomopathogenic fungus',
    mode_of_action: 'Contact - Fungal infection',
    target_pests: ['Whitefly', 'Aphids', 'Thrips', 'Borers'],
    allowed_modes: ['organic_only', 'fertilizer_pesticide', 'organic_fertilizer'],
    dose_per_liter: '5g',
    phi_days: 0,
    waiting_period_days: 0,
    regulatory_status: 'approved'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE DATABASE
// ═══════════════════════════════════════════════════════════════════════════
export interface DiseaseSpec {
  rule_id: string;
  disease_name: string;
  disease_name_local: Record<string, string>;
  causal_organism: string;
  crops_affected: string[];
  favorable_conditions: string;
  symptoms: string[];
  etl_description: string;
  organic_control: string[];
  chemical_control: string[];
  source: string;
}

export const DISEASES: DiseaseSpec[] = [
  {
    rule_id: 'DIS_BLAST_001',
    disease_name: 'Rice Blast',
    disease_name_local: { hi: 'झोंका रोग', mr: 'भातावरील करपा' },
    causal_organism: 'Pyricularia oryzae',
    crops_affected: ['rice'],
    favorable_conditions: 'High humidity >90%, Temp 25-28°C, Excess N',
    symptoms: ['Diamond-shaped lesions on leaves', 'Neck blast at panicle', 'Node discoloration'],
    etl_description: '5% leaf area affected or 1-2 lesions per leaf',
    organic_control: ['Trichoderma viride 5g/L', 'Pseudomonas fluorescens 5g/L'],
    chemical_control: ['Tricyclazole 0.6g/L', 'Isoprothiolane 1.5ml/L'],
    source: 'ICAR-CRRI Disease Management'
  },
  {
    rule_id: 'DIS_BLIGHT_001',
    disease_name: 'Bacterial Blight',
    disease_name_local: { hi: 'जीवाणु झुलसा', mr: 'जिवाणूजन्य करपा' },
    causal_organism: 'Xanthomonas oryzae',
    crops_affected: ['rice'],
    favorable_conditions: 'Monsoon rains, Strong winds, Flood irrigation',
    symptoms: ['Water-soaked lesions', 'Yellow to white streaks', 'Leaf drying from tip'],
    etl_description: '5% plants showing symptoms',
    organic_control: ['Streptocycline 0.015g/L', 'Copper hydroxide 2g/L'],
    chemical_control: ['Streptocycline + Copper oxychloride'],
    source: 'ICAR-CRRI Disease Management'
  },
  {
    rule_id: 'DIS_WILT_001',
    disease_name: 'Fusarium Wilt',
    disease_name_local: { hi: 'उकठा रोग', mr: 'मर रोग' },
    causal_organism: 'Fusarium oxysporum',
    crops_affected: ['tomato', 'brinjal', 'cotton', 'gram'],
    favorable_conditions: 'Soil temp 25-30°C, Sandy soils, Acidic pH',
    symptoms: ['Yellowing of lower leaves', 'Wilting despite moisture', 'Brown vascular tissue'],
    etl_description: '2% plants wilting',
    organic_control: ['Trichoderma viride 2.5kg/acre', 'Pseudomonas 2.5kg/acre', 'Neem cake'],
    chemical_control: ['Carbendazim drench 1g/L', 'Copper oxychloride 3g/L'],
    source: 'ICAR-IIHR Disease Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// IRRIGATION REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════════════
export const IRRIGATION_REQUIREMENTS: Record<string, {
  rule_id: string;
  water_per_irrigation_mm: number;
  interval_days: number;
  critical_stages: string[];
  total_water_mm: number;
  source: string;
}> = {
  wheat: {
    rule_id: 'IRR_WHEAT_001',
    water_per_irrigation_mm: 50,
    interval_days: 21,
    critical_stages: ['crown_root_initiation', 'tillering', 'flowering', 'grain_filling'],
    total_water_mm: 350,
    source: 'ICAR-IARI Irrigation Schedule'
  },
  rice: {
    rule_id: 'IRR_RICE_001',
    water_per_irrigation_mm: 100,
    interval_days: 3,
    critical_stages: ['transplanting', 'tillering', 'panicle_initiation', 'flowering'],
    total_water_mm: 1200,
    source: 'ICAR-CRRI Water Management'
  },
  cotton: {
    rule_id: 'IRR_COTTON_001',
    water_per_irrigation_mm: 60,
    interval_days: 14,
    critical_stages: ['square_formation', 'flowering', 'boll_development'],
    total_water_mm: 600,
    source: 'ICAR-CICR Irrigation Guide'
  },
  sugarcane: {
    rule_id: 'IRR_SUGARCANE_001',
    water_per_irrigation_mm: 75,
    interval_days: 10,
    critical_stages: ['germination', 'tillering', 'grand_growth', 'maturity'],
    total_water_mm: 1800,
    source: 'ICAR-SBI Water Management'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CROP DURATION DATABASE
// ═══════════════════════════════════════════════════════════════════════════
export const CROP_DURATIONS: Record<string, {
  rule_id: string;
  duration_days: number;
  min_tasks: number;
  stages: { name: string; days: number }[];
}> = {
  wheat: { rule_id: 'DUR_WHEAT_001', duration_days: 140, min_tasks: 20, stages: [
    { name: 'planning', days: 7 }, { name: 'land_preparation', days: 10 },
    { name: 'sowing', days: 7 }, { name: 'germination', days: 14 },
    { name: 'vegetative_growth', days: 45 }, { name: 'reproductive', days: 30 },
    { name: 'maturity', days: 20 }, { name: 'harvest', days: 7 }
  ]},
  rice: { rule_id: 'DUR_RICE_001', duration_days: 130, min_tasks: 22, stages: [
    { name: 'planning', days: 7 }, { name: 'land_preparation', days: 14 },
    { name: 'sowing', days: 7 }, { name: 'germination', days: 21 },
    { name: 'vegetative_growth', days: 35 }, { name: 'reproductive', days: 25 },
    { name: 'maturity', days: 14 }, { name: 'harvest', days: 7 }
  ]},
  cotton: { rule_id: 'DUR_COTTON_001', duration_days: 180, min_tasks: 20, stages: [
    { name: 'planning', days: 7 }, { name: 'land_preparation', days: 14 },
    { name: 'sowing', days: 7 }, { name: 'germination', days: 14 },
    { name: 'vegetative_growth', days: 45 }, { name: 'reproductive', days: 60 },
    { name: 'maturity', days: 25 }, { name: 'harvest', days: 8 }
  ]},
  sugarcane: { rule_id: 'DUR_SUGARCANE_001', duration_days: 365, min_tasks: 18, stages: [
    { name: 'planning', days: 7 }, { name: 'land_preparation', days: 21 },
    { name: 'sowing', days: 14 }, { name: 'germination', days: 30 },
    { name: 'vegetative_growth', days: 120 }, { name: 'reproductive', days: 90 },
    { name: 'maturity', days: 60 }, { name: 'harvest', days: 23 }
  ]},
  tomato: { rule_id: 'DUR_TOMATO_001', duration_days: 120, min_tasks: 18, stages: [
    { name: 'planning', days: 5 }, { name: 'land_preparation', days: 7 },
    { name: 'sowing', days: 7 }, { name: 'germination', days: 14 },
    { name: 'vegetative_growth', days: 35 }, { name: 'reproductive', days: 30 },
    { name: 'maturity', days: 15 }, { name: 'harvest', days: 7 }
  ]},
  onion: { rule_id: 'DUR_ONION_001', duration_days: 140, min_tasks: 20, stages: [
    { name: 'planning', days: 5 }, { name: 'land_preparation', days: 10 },
    { name: 'sowing', days: 10 }, { name: 'germination', days: 21 },
    { name: 'vegetative_growth', days: 50 }, { name: 'reproductive', days: 20 },
    { name: 'maturity', days: 17 }, { name: 'harvest', days: 7 }
  ]},
  default: { rule_id: 'DUR_DEFAULT_001', duration_days: 120, min_tasks: 18, stages: [
    { name: 'planning', days: 5 }, { name: 'land_preparation', days: 10 },
    { name: 'sowing', days: 7 }, { name: 'germination', days: 14 },
    { name: 'vegetative_growth', days: 40 }, { name: 'reproductive', days: 25 },
    { name: 'maturity', days: 12 }, { name: 'harvest', days: 7 }
  ]}
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getRuleById(ruleId: string): AgroRule | null {
  // Search across all databases
  const npkMatch = Object.entries(NPK_TARGETS).find(([_, v]) => v.rule_id === ruleId);
  if (npkMatch) return { rule_id: ruleId, category: 'npk', ...npkMatch[1] } as any;
  
  const ipmMatch = IPM_THRESHOLDS.find(t => t.rule_id === ruleId);
  if (ipmMatch) return { ...ipmMatch, category: 'ipm' } as any;
  
  const seedMatch = Object.entries(SEED_RATES).find(([_, v]) => v.rule_id === ruleId);
  if (seedMatch) return { rule_id: ruleId, category: 'seed', ...seedMatch[1] } as any;
  
  return null;
}

export function getIPMThresholdForPest(pestName: string, crop: string): IPMThreshold | null {
  return IPM_THRESHOLDS.find(t => 
    t.pest_name.toLowerCase().includes(pestName.toLowerCase()) &&
    t.crop.includes(crop.toLowerCase())
  ) || null;
}

export function getFertilizerForMode(farmingMode: string): FertilizerSpec[] {
  return Object.values(FERTILIZERS).filter(f => 
    f.allowed_modes.includes(farmingMode as any) && 
    f.regulatory_status !== 'banned'
  );
}

export function getPesticideForMode(farmingMode: string): PesticideSpec[] {
  return Object.values(PESTICIDES).filter(p => 
    p.allowed_modes.includes(farmingMode as any) && 
    p.regulatory_status !== 'banned'
  );
}

export function calculateNPKDeficit(
  crop: string, 
  soilN: number, 
  soilP: number, 
  soilK: number
): { n_deficit: number; p_deficit: number; k_deficit: number; rule_id: string } {
  const target = NPK_TARGETS[crop.toLowerCase()] || NPK_TARGETS.default;
  return {
    n_deficit: Math.max(0, target.n - soilN),
    p_deficit: Math.max(0, target.p - soilP),
    k_deficit: Math.max(0, target.k - soilK),
    rule_id: target.rule_id
  };
}

export function getSplitSchedule(crop: string, nDeficit: number, pDeficit: number, kDeficit: number) {
  const target = NPK_TARGETS[crop.toLowerCase()] || NPK_TARGETS.default;
  return target.split_schedule.map(split => ({
    stage: split.stage,
    n_kg: Math.round((nDeficit * split.n_pct) / 100),
    p_kg: Math.round((pDeficit * split.p_pct) / 100),
    k_kg: Math.round((kDeficit * split.k_pct) / 100),
    rule_id: target.rule_id
  }));
}
