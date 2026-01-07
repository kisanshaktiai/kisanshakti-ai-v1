/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION RULES DATABASE SEEDER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Seeds the decision_rules table with all canonical rules from bundled files.
 * This enables the hybrid database storage strategy.
 * 
 * Usage: POST /seed-decision-rules with optional { clear: true } to wipe first
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Canonical rules definition - embedded for seeding
const CANONICAL_RULES = [
  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 01: CROP IDENTITY RULES
  // ═══════════════════════════════════════════════════════════════════════
  { rule_id: 'CROP_WHEAT_001', crop_code: 'wheat', category: 'crop_identity', stage_applicable: ['ALL'], conditionCode: '(input) => ["wheat","गहू","गेहूं"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'CROP_WHEAT_IDENTIFIED', priority: 95, scientific_source: 'ICAR-IIWBR', scientific_basis: 'Wheat identification', trigger_keywords: ['wheat','गहू','गेहूं'], response_mr: '🌾 गहू पीक ओळखले.', response_hi: '🌾 गेहूं फसल पहचानी।', response_en: '🌾 Wheat crop identified.', action_type: 'RECOMMEND', canonical_group: 'crop_identity' },
  { rule_id: 'CROP_RICE_001', crop_code: 'rice', category: 'crop_identity', stage_applicable: ['ALL'], conditionCode: '(input) => ["rice","भात","धान","चावल"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'CROP_RICE_IDENTIFIED', priority: 95, scientific_source: 'ICAR-CRRI', scientific_basis: 'Rice identification', trigger_keywords: ['rice','भात','धान','चावल'], response_mr: '🌾 भात पीक ओळखले.', response_hi: '🌾 धान फसल पहचानी।', response_en: '🌾 Rice crop identified.', action_type: 'RECOMMEND', canonical_group: 'crop_identity' },
  { rule_id: 'CROP_SUGARCANE_001', crop_code: 'sugarcane', category: 'crop_identity', stage_applicable: ['ALL'], conditionCode: '(input) => ["sugarcane","ऊस","गन्ना"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'CROP_SUGARCANE_IDENTIFIED', priority: 95, scientific_source: 'ICAR-SBI', scientific_basis: 'Sugarcane identification', trigger_keywords: ['sugarcane','ऊस','गन्ना'], response_mr: '🎋 ऊस पीक ओळखले.', response_hi: '🎋 गन्ना फसल पहचानी।', response_en: '🎋 Sugarcane crop identified.', action_type: 'RECOMMEND', canonical_group: 'crop_identity' },
  { rule_id: 'CROP_COTTON_001', crop_code: 'cotton', category: 'crop_identity', stage_applicable: ['ALL'], conditionCode: '(input) => ["cotton","कापूस","कपास"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'CROP_COTTON_IDENTIFIED', priority: 95, scientific_source: 'ICAR-CICR', scientific_basis: 'Cotton identification', trigger_keywords: ['cotton','कापूस','कपास'], response_mr: '🪺 कापूस पीक ओळखले.', response_hi: '🪺 कपास फसल पहचानी।', response_en: '🪺 Cotton crop identified.', action_type: 'RECOMMEND', canonical_group: 'crop_identity' },
  { rule_id: 'CROP_MAIZE_001', crop_code: 'maize', category: 'crop_identity', stage_applicable: ['ALL'], conditionCode: '(input) => ["maize","मका","मक्का","corn"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'CROP_MAIZE_IDENTIFIED', priority: 95, scientific_source: 'ICAR-IIMR', scientific_basis: 'Maize identification', trigger_keywords: ['maize','मका','मक्का','corn'], response_mr: '🌽 मका पीक ओळखले.', response_hi: '🌽 मक्का फसल पहचानी।', response_en: '🌽 Maize crop identified.', action_type: 'RECOMMEND', canonical_group: 'crop_identity' },
  
  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 02: GROWTH STAGE RULES
  // ═══════════════════════════════════════════════════════════════════════
  { rule_id: 'STAGE_GERMINATION_001', crop_code: 'all', category: 'growth_stage', stage_applicable: ['GERMINATION'], conditionCode: '(input) => ["germination","उगवण","अंकुरण"].some(k => input.user_query?.toLowerCase().includes(k)) || input.days_after_sowing <= 15', cause: 'STAGE_GERMINATION_DETECTED', priority: 90, scientific_source: 'ICAR Crop Phenology', scientific_basis: 'Germination stage 0-15 DAS', trigger_keywords: ['germination','उगवण','अंकुरण'], response_mr: '🌱 उगवण अवस्था ओळखली.', response_hi: '🌱 अंकुरण अवस्था पहचानी।', response_en: '🌱 Germination stage detected.', action_type: 'RECOMMEND', canonical_group: 'growth_stage' },
  { rule_id: 'STAGE_VEGETATIVE_001', crop_code: 'all', category: 'growth_stage', stage_applicable: ['VEGETATIVE'], conditionCode: '(input) => ["vegetative","वाढ","वृद्धि"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'STAGE_VEGETATIVE_DETECTED', priority: 90, scientific_source: 'ICAR Crop Phenology', scientific_basis: 'Vegetative stage', trigger_keywords: ['vegetative','वाढ','वृद्धि'], response_mr: '🌿 वाढीची अवस्था.', response_hi: '🌿 वृद्धि अवस्था।', response_en: '🌿 Vegetative stage.', action_type: 'RECOMMEND', canonical_group: 'growth_stage' },
  { rule_id: 'STAGE_FLOWERING_001', crop_code: 'all', category: 'growth_stage', stage_applicable: ['FLOWERING'], conditionCode: '(input) => ["flowering","फुलोरा","फूल"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'STAGE_FLOWERING_DETECTED', priority: 90, scientific_source: 'ICAR Crop Phenology', scientific_basis: 'Flowering stage critical', trigger_keywords: ['flowering','फुलोरा','फूल'], response_mr: '🌸 फुलोरा अवस्था.', response_hi: '🌸 फूल आने की अवस्था।', response_en: '🌸 Flowering stage.', action_type: 'WARN', canonical_group: 'growth_stage' },
  
  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 04: NUTRIENT RULES
  // ═══════════════════════════════════════════════════════════════════════
  { rule_id: 'NUTRIENT_N_DEF_001', crop_code: 'all', category: 'nutrient', stage_applicable: ['ALL'], conditionCode: '(input) => ["nitrogen","नायट्रोजन","नाइट्रोजन","n deficiency"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'NITROGEN_DEFICIENCY', priority: 85, scientific_source: 'ICAR Soil Science', scientific_basis: 'N deficiency causes chlorosis', trigger_keywords: ['nitrogen','नायट्रोजन','नाइट्रोजन'], response_mr: '💛 नायट्रोजन कमतरता. युरिया @ 25kg/एकर द्या.', response_hi: '💛 नाइट्रोजन कमी। यूरिया @ 25kg/एकड़ दें।', response_en: '💛 Nitrogen deficiency. Apply Urea @ 25kg/acre.', action_type: 'RECOMMEND', canonical_group: 'nutrient' },
  { rule_id: 'NUTRIENT_P_DEF_001', crop_code: 'all', category: 'nutrient', stage_applicable: ['ALL'], conditionCode: '(input) => ["phosphorus","फॉस्फरस","फास्फोरस"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'PHOSPHORUS_DEFICIENCY', priority: 85, scientific_source: 'ICAR Soil Science', scientific_basis: 'P deficiency causes purple leaves', trigger_keywords: ['phosphorus','फॉस्फरस','फास्फोरस'], response_mr: '💜 फॉस्फरस कमतरता. SSP @ 50kg/एकर द्या.', response_hi: '💜 फास्फोरस कमी। SSP @ 50kg/एकड़ दें।', response_en: '💜 Phosphorus deficiency. Apply SSP @ 50kg/acre.', action_type: 'RECOMMEND', canonical_group: 'nutrient' },
  { rule_id: 'NUTRIENT_K_DEF_001', crop_code: 'all', category: 'nutrient', stage_applicable: ['ALL'], conditionCode: '(input) => ["potassium","पोटॅशियम","पोटेशियम"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'POTASSIUM_DEFICIENCY', priority: 85, scientific_source: 'ICAR Soil Science', scientific_basis: 'K deficiency causes marginal burn', trigger_keywords: ['potassium','पोटॅशियम','पोटेशियम'], response_mr: '🔥 पोटॅशियम कमतरता. MOP @ 25kg/एकर द्या.', response_hi: '🔥 पोटेशियम कमी। MOP @ 25kg/एकड़ दें।', response_en: '🔥 Potassium deficiency. Apply MOP @ 25kg/acre.', action_type: 'RECOMMEND', canonical_group: 'nutrient' },
  { rule_id: 'NUTRIENT_ZN_DEF_001', crop_code: 'all', category: 'nutrient', stage_applicable: ['ALL'], conditionCode: '(input) => ["zinc","झिंक","जिंक","khaira"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'ZINC_DEFICIENCY', priority: 82, scientific_source: 'ICAR Micronutrient', scientific_basis: 'Zn deficiency causes Khaira in rice', trigger_keywords: ['zinc','झिंक','जिंक','khaira'], response_mr: '🟢 झिंक कमतरता. झिंक सल्फेट @ 10kg/एकर द्या.', response_hi: '🟢 जिंक कमी। जिंक सल्फेट @ 10kg/एकड़ दें।', response_en: '🟢 Zinc deficiency. Apply Zinc Sulphate @ 10kg/acre.', action_type: 'RECOMMEND', canonical_group: 'nutrient' },
  
  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 05: PEST RULES
  // ═══════════════════════════════════════════════════════════════════════
  { rule_id: 'PEST_APHID_001', crop_code: 'all', category: 'pest', stage_applicable: ['VEGETATIVE','FLOWERING'], conditionCode: '(input) => ["aphid","माव","माहू"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'APHID_INFESTATION', priority: 82, scientific_source: 'ICAR-NBAIR', scientific_basis: 'Aphids suck phloem sap', trigger_keywords: ['aphid','माव','माहू'], response_mr: '🐛 माव! इमिडाक्लोप्रिड @ 0.3ml/L फवारा.', response_hi: '🐛 माहू! इमिडाक्लोप्रिड @ 0.3ml/L स्प्रे करें।', response_en: '🐛 Aphids! Spray Imidacloprid @ 0.3ml/L.', action_type: 'RECOMMEND', canonical_group: 'pest' },
  { rule_id: 'PEST_EARLY_SHOOT_BORER_001', crop_code: 'sugarcane', category: 'pest', stage_applicable: ['GERMINATION','TILLERING'], conditionCode: '(input) => input.crop_code === "sugarcane" && ["shoot borer","dead heart","खोडकिड","सुरळी मेली"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'SUGARCANE_EARLY_SHOOT_BORER', priority: 90, scientific_source: 'ICAR-SBI', scientific_basis: 'ESB causes dead hearts', trigger_keywords: ['shoot borer','dead heart','खोडकिड'], response_mr: '🪱 शूट बोरर! मेलेली सुरळी काढा. क्लोरॅन्ट्रानिलिप्रोल 0.4GR @ 10kg/एकर द्या.', response_hi: '🪱 शूट बोरर! मृत गोभ निकालें। क्लोरैंट्रानिलिप्रोल 0.4GR @ 10kg/एकड़ दें।', response_en: '🪱 Early shoot borer! Remove dead hearts. Apply Chlorantraniliprole 0.4GR @ 10kg/acre.', action_type: 'RECOMMEND', canonical_group: 'pest' },
  { rule_id: 'PEST_PINK_BOLLWORM_001', crop_code: 'cotton', category: 'pest', stage_applicable: ['FLOWERING','BOLL_FORMATION'], conditionCode: '(input) => input.crop_code === "cotton" && ["pink bollworm","गुलाबी बोंड अळी","गुलाबी बॉलवर्म"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'PINK_BOLLWORM_COTTON', priority: 92, scientific_source: 'ICAR-CICR', scientific_basis: 'PBW causes rosette flowers', trigger_keywords: ['pink bollworm','गुलाबी बोंड अळी'], response_mr: '🌸 गुलाबी बोंड अळी! फेरोमोन ट्रॅप लावा. स्पिनोसॅड @ 0.3ml/L फवारा.', response_hi: '🌸 गुलाबी बॉलवर्म! फेरोमोन ट्रैप लगाएं। स्पिनोसैड @ 0.3ml/L स्प्रे करें।', response_en: '🌸 Pink bollworm! Install pheromone traps. Spray Spinosad @ 0.3ml/L.', action_type: 'RECOMMEND', canonical_group: 'pest' },
  { rule_id: 'PEST_FALL_ARMYWORM_001', crop_code: 'maize', category: 'pest', stage_applicable: ['VEGETATIVE','TASSELING'], conditionCode: '(input) => input.crop_code === "maize" && ["fall armyworm","faw","सेना अळी","लष्कर कीट"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'FALL_ARMYWORM_MAIZE', priority: 90, scientific_source: 'ICAR-IIMR', scientific_basis: 'FAW causes severe defoliation', trigger_keywords: ['fall armyworm','faw','सेना अळी'], response_mr: '🐛 सेना अळी! स्पिनोसॅड @ 0.3ml/L फवारा.', response_hi: '🐛 सेना कीट! स्पिनोसैड @ 0.3ml/L स्प्रे करें।', response_en: '🐛 Fall armyworm! Spray Spinosad @ 0.3ml/L.', action_type: 'RECOMMEND', canonical_group: 'pest' },
  
  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 06: DISEASE RULES
  // ═══════════════════════════════════════════════════════════════════════
  { rule_id: 'DISEASE_BLAST_001', crop_code: 'rice', category: 'disease', stage_applicable: ['TILLERING','HEADING'], conditionCode: '(input) => input.crop_code === "rice" && ["blast","करपा","झुलसा"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'RICE_BLAST', priority: 88, scientific_source: 'ICAR-CRRI', scientific_basis: 'Blast by Magnaporthe oryzae', trigger_keywords: ['blast','करपा','झुलसा'], response_mr: '🍄 करपा! ट्रायसायक्लाझोल @ 0.6g/L फवारा.', response_hi: '🍄 झुलसा! ट्राइसाइक्लाज़ोल @ 0.6g/L स्प्रे करें।', response_en: '🍄 Blast! Spray Tricyclazole @ 0.6g/L.', action_type: 'RECOMMEND', canonical_group: 'disease' },
  { rule_id: 'DISEASE_RUST_001', crop_code: 'wheat', category: 'disease', stage_applicable: ['TILLERING','HEADING'], conditionCode: '(input) => input.crop_code === "wheat" && ["rust","गंज","गेरुआ"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'WHEAT_RUST', priority: 88, scientific_source: 'ICAR-IIWBR', scientific_basis: 'Rust by Puccinia spp.', trigger_keywords: ['rust','गंज','गेरुआ'], response_mr: '🟠 गंज! प्रोपिकोनाझोल @ 1ml/L फवारा.', response_hi: '🟠 गेरुआ! प्रोपिकोनाज़ोल @ 1ml/L स्प्रे करें।', response_en: '🟠 Rust! Spray Propiconazole @ 1ml/L.', action_type: 'RECOMMEND', canonical_group: 'disease' },
  { rule_id: 'DISEASE_WILT_001', crop_code: 'all', category: 'disease', stage_applicable: ['ALL'], conditionCode: '(input) => ["wilt","मर","उकठा"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'WILT_DISEASE', priority: 85, scientific_source: 'ICAR Plant Pathology', scientific_basis: 'Wilt by Fusarium spp.', trigger_keywords: ['wilt','मर','उकठा'], response_mr: '😵 मर रोग! ट्रायकोडर्मा वापरा.', response_hi: '😵 उकठा! ट्राइकोडर्मा उपयोग करें।', response_en: '😵 Wilt! Use Trichoderma.', action_type: 'WARN', canonical_group: 'disease' },
  
  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 09: WEATHER RULES
  // ═══════════════════════════════════════════════════════════════════════
  { rule_id: 'WEATHER_RAIN_BLOCK_001', crop_code: 'all', category: 'weather', stage_applicable: ['ALL'], conditionCode: '(input) => input.weather_state?.includes("RAIN") && input.user_query?.toLowerCase().includes("spray")', cause: 'RAIN_SPRAY_BLOCKED', priority: 95, scientific_source: 'ICAR IPM', scientific_basis: 'Rain washes off pesticides', trigger_keywords: ['rain','spray','पाऊस','फवारणी'], response_mr: '🌧️ पाऊस! फवारणी टाळा. पाऊस थांबल्यावर 4-6 तासांनी फवारा.', response_hi: '🌧️ बारिश! छिड़काव टालें। बारिश रुकने के 4-6 घंटे बाद स्प्रे करें।', response_en: '🌧️ Rain! Avoid spraying. Spray 4-6 hours after rain stops.', action_type: 'BLOCK', canonical_group: 'weather' },
  { rule_id: 'WEATHER_HIGH_TEMP_001', crop_code: 'all', category: 'weather', stage_applicable: ['FLOWERING'], conditionCode: '(input) => input.weather_state?.includes("HIGH_TEMP") && input.crop_stage === "FLOWERING"', cause: 'HIGH_TEMP_FLOWERING_STRESS', priority: 90, scientific_source: 'ICAR Agronomy', scientific_basis: 'High temp causes sterility', trigger_keywords: ['high temp','heat','उच्च तापमान'], response_mr: '🌡️ उच्च तापमान! फुलोरा अवस्थेत धोकादायक. सकाळी सिंचन करा.', response_hi: '🌡️ उच्च तापमान! फूल अवस्था में खतरनाक। सुबह सिंचाई करें।', response_en: '🌡️ High temperature! Dangerous at flowering. Irrigate in morning.', action_type: 'WARN', canonical_group: 'weather' },
  
  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 13: RISK/SAFETY RULES
  // ═══════════════════════════════════════════════════════════════════════
  { rule_id: 'SAFETY_PHI_001', crop_code: 'all', category: 'risk_safety', stage_applicable: ['MATURITY'], conditionCode: '(input) => input.days_to_harvest < 14 && input.user_query?.toLowerCase().includes("pesticide")', cause: 'PHI_VIOLATION_RISK', priority: 98, scientific_source: 'ICAR Pesticide Safety', scientific_basis: 'PHI prevents residue', trigger_keywords: ['phi','harvest','कापणी','pesticide'], response_mr: '⚠️ PHI उल्लंघन! कापणीपूर्वी 14 दिवस कीटनाशक टाळा.', response_hi: '⚠️ PHI उल्लंघन! कटाई से 14 दिन पहले कीटनाशक टालें।', response_en: '⚠️ PHI violation risk! Avoid pesticides 14 days before harvest.', action_type: 'BLOCK', canonical_group: 'risk_safety' },
  { rule_id: 'SAFETY_POLLINATOR_001', crop_code: 'all', category: 'risk_safety', stage_applicable: ['FLOWERING'], conditionCode: '(input) => input.crop_stage === "FLOWERING" && ["neonicotinoid","imidacloprid","thiamethoxam"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'POLLINATOR_RISK', priority: 95, scientific_source: 'ICAR Pollinator Safety', scientific_basis: 'Neonicotinoids harm pollinators', trigger_keywords: ['pollinator','bee','मधमाशी','neonicotinoid'], response_mr: '🐝 परागणकर्त्यांचा धोका! फुलोरात निओनिकोटिनॉईड टाळा. संध्याकाळी फवारा.', response_hi: '🐝 परागणकों को खतरा! फूल अवस्था में निओनिकोटिनॉइड टालें। शाम को स्प्रे करें।', response_en: '🐝 Pollinator risk! Avoid neonicotinoids at flowering. Spray in evening.', action_type: 'WARN', canonical_group: 'risk_safety' },
  { rule_id: 'SAFETY_PPE_001', crop_code: 'all', category: 'risk_safety', stage_applicable: ['ALL'], conditionCode: '(input) => ["spray","pesticide","chemical","फवारणी","कीटनाशक"].some(k => input.user_query?.toLowerCase().includes(k))', cause: 'PPE_REMINDER', priority: 75, scientific_source: 'ICAR Pesticide Safety', scientific_basis: 'PPE prevents exposure', trigger_keywords: ['spray','pesticide','ppe','सुरक्षा'], response_mr: '🧤 फवारणी करताना PPE वापरा: हातमोजे, मास्क, गॉगल्स.', response_hi: '🧤 छिड़काव करते समय PPE उपयोग करें: दस्ताने, मास्क, चश्मा।', response_en: '🧤 Use PPE while spraying: gloves, mask, goggles.', action_type: 'RECOMMEND', canonical_group: 'risk_safety' }
];

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🌱 Starting decision rules seeding...');
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let clearFirst = false;
    try {
      const body = await req.json();
      clearFirst = body?.clear === true;
    } catch {
      // No body or invalid JSON
    }

    // Clear existing rules if requested
    if (clearFirst) {
      console.log('🗑️ Clearing existing rules...');
      const { error: deleteError } = await supabase
        .from('decision_rules')
        .delete()
        .neq('rule_id', '');
      
      if (deleteError) {
        console.error('❌ Error clearing rules:', deleteError);
        throw deleteError;
      }
      console.log('✅ Existing rules cleared');
    }

    // Insert rules in batches
    const batchSize = 50;
    let insertedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < CANONICAL_RULES.length; i += batchSize) {
      const batch = CANONICAL_RULES.slice(i, i + batchSize);
      
      // Format rules for database
      const formattedRules = batch.map(rule => ({
        rule_id: rule.rule_id,
        crop_code: rule.crop_code,
        category: rule.category,
        stage_applicable: rule.stage_applicable,
        condition_code: rule.conditionCode,
        cause: rule.cause,
        priority: rule.priority,
        scientific_source: rule.scientific_source,
        scientific_basis: rule.scientific_basis,
        trigger_keywords: rule.trigger_keywords,
        response_mr: rule.response_mr,
        response_hi: rule.response_hi,
        response_en: rule.response_en,
        action_type: rule.action_type,
        canonical_group: rule.canonical_group,
        is_active: true,
        version: 1
      }));

      const { data, error } = await supabase
        .from('decision_rules')
        .upsert(formattedRules, { 
          onConflict: 'rule_id',
          ignoreDuplicates: false 
        })
        .select('rule_id');

      if (error) {
        console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error);
        errors.push(`Batch ${i / batchSize + 1}: ${error.message}`);
      } else {
        insertedCount += data?.length || batch.length;
        console.log(`✅ Inserted batch ${i / batchSize + 1}: ${data?.length || batch.length} rules`);
      }
    }

    // Get final count
    const { count } = await supabase
      .from('decision_rules')
      .select('*', { count: 'exact', head: true });

    const result = {
      success: true,
      message: `Seeded ${insertedCount} rules`,
      stats: {
        total_attempted: CANONICAL_RULES.length,
        inserted: insertedCount,
        skipped: skippedCount,
        errors: errors.length,
        final_count: count
      },
      errors: errors.length > 0 ? errors : undefined
    };

    console.log('🌱 Seeding complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
