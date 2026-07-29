// STATIC DATA GATE - Zero-AI Cost Response for Land Attribute Queries

export interface LandContext {
  land_id: string;
  land_name?: string;
  area_acres?: number;
  soil_type?: string;
  current_crop?: string;
  crop_schedule?: {
    schedule_id?: string;
    crop_name: string;
    crop_variety?: string;
    sowing_date: string;
    expected_harvest_date?: string;
    status?: string;
    is_active?: boolean;
  };
  growth_stage?: string;
  days_since_sowing?: number;
  irrigation_type?: string;
  water_source?: string;
  location?: {
    village?: string;
    district?: string;
    state?: string;
    center_lat?: number;
    center_lon?: number;
  };
  data_quality_warnings?: string[];
}

export interface StaticDataGateInput {
  farmer_message: string;
  language: string;
  land_context: LandContext | null;
}

export interface StaticDataGateOutput {
  handled: boolean;
  response?: string;
  response_type?: 'CROP_NAME' | 'LAND_AREA' | 'SOIL_TYPE' | 'SOWING_DATE' | 'CROP_STAGE' | 'IRRIGATION' | 'LOCATION';
  confidence: number;
  processing_time_ms: number;
}

// Pattern definitions for static queries (language-agnostic)
const STATIC_QUERY_PATTERNS = {
  CROP_NAME: {
    patterns: [
      /कोणते\s*पीक/i,           // Marathi: "which crop"
      /कोणती\s*पिक/i,
      /काय\s*पीक/i,             // "what crop"
      /पीक\s*काय/i,
      /कौन\s*सी?\s*फसल/i,       // Hindi: "which crop"
      /क्या\s*फसल/i,            // "what crop"
      /फसल\s*क्या/i,
      /what\s*crop/i,           // English
      /which\s*crop/i,
      /current\s*crop/i,
      /या\s*शेतात.*पीक/i,       // "in this land...crop"
      /इस\s*खेत.*फसल/i,
      /कोणतं\s*पीक/i,
      /पिक\s*कोणतं/i,
      /फसल\s*कौन\s*सी/i
    ],
    data_source: 'crop_schedules.crop_name',
    requires_crop_schedule: true
  },
  
  LAND_AREA: {
    patterns: [
      /किती\s*(एकर|क्षेत्र|जमीन)/i,     // Marathi
      /क्षेत्रफळ/i,
      /शेत\s*किती/i,
      /जमीन\s*किती/i,
      /कितना\s*(एकड़|क्षेत्र)/i,        // Hindi
      /कितनी\s*जमीन/i,
      /खेत\s*कितना/i,
      /how\s*much.*area/i,              // English
      /land\s*size/i,
      /area.*acres/i,
      /how\s*many\s*acres/i,
      /size\s*of\s*(land|field)/i
    ],
    data_source: 'lands.area_acres',
    requires_crop_schedule: false
  },
  
  SOWING_DATE: {
    patterns: [
      /कधी\s*पेरणी/i,                  // Marathi
      /पेरणी.*कधी/i,
      /पेरणीची\s*तारीख/i,
      /लागवड\s*कधी/i,
      /कब\s*(बोया|बुवाई)/i,            // Hindi
      /बुवाई.*कब/i,
      /बुवाई\s*की\s*तारीख/i,
      /when.*sow(n|ing)/i,              // English
      /sowing\s*date/i,
      /when.*plant(ed)?/i,
      /planting\s*date/i
    ],
    data_source: 'crop_schedules.sowing_date',
    requires_crop_schedule: true
  },
  
  CROP_STAGE: {
    patterns: [
      /पीक.*टप्पा/i,                   // Marathi
      /कोणत्या.*अवस्था/i,
      /पिकाचा\s*टप्पा/i,
      /वाढीचा\s*टप्पा/i,
      /फसल.*अवस्था/i,                  // Hindi
      /कौन.*अवस्था/i,
      /फसल\s*की\s*स्थिति/i,
      /crop\s*stage/i,                 // English
      /growth\s*stage/i,
      /what\s*stage/i,
      /current\s*stage/i,
      /पीक\s*कुठे\s*आहे/i,
      /फसल\s*कहाँ\s*है/i
    ],
    data_source: 'CALCULATED from sowing_date',
    requires_crop_schedule: true
  },
  
  SOIL_TYPE: {
    patterns: [
      /माती.*प्रकार/i,                 // Marathi
      /कोणती\s*माती/i,
      /मातीचा\s*प्रकार/i,
      /मृदा.*प्रकार/i,                 // Hindi
      /मिट्टी.*प्रकार/i,
      /कौन\s*सी\s*मिट्टी/i,
      /soil\s*type/i,                  // English
      /type.*soil/i,
      /what.*soil/i,
      /kind\s*of\s*soil/i
    ],
    data_source: 'lands.soil_type',
    requires_crop_schedule: false
  },
  
  IRRIGATION: {
    patterns: [
      /सिंचन.*प्रकार/i,               // Marathi
      /पाणी.*पुरवठा/i,
      /पाण्याचा\s*स्त्रोत/i,
      /सिंचाई.*प्रकार/i,              // Hindi
      /पानी\s*का\s*स्रोत/i,
      /irrigation\s*type/i,           // English
      /water\s*source/i,
      /how.*irrigat/i
    ],
    data_source: 'lands.irrigation_type',
    requires_crop_schedule: false
  },
  
  LOCATION: {
    patterns: [
      /शेत\s*कुठे/i,                  // Marathi
      /गाव\s*कोणते/i,
      /जिल्हा\s*कोणता/i,
      /खेत\s*कहाँ/i,                  // Hindi
      /गाँव\s*कौन\s*सा/i,
      /जिला\s*कौन\s*सा/i,
      /where.*land/i,                 // English
      /location/i,
      /which\s*village/i,
      /which\s*district/i
    ],
    data_source: 'lands.village/district/state',
    requires_crop_schedule: false
  }
};

// MAIN GATE FUNCTION - Check and handle static queries
export function checkStaticDataGate(input: StaticDataGateInput): StaticDataGateOutput {
  const startTime = performance.now();
  
  // CRITICAL VALIDATION: Land context MUST be present for most static queries
  if (!input.land_context) {
    console.log('⚠️ [StaticGate] No land context - passing to AI pipeline');
    return { handled: false, processing_time_ms: performance.now() - startTime, confidence: 0 };
  }
  
  const message = input.farmer_message.trim();
  const lang = input.language;
  
  // CHECK 1: CROP NAME QUERY
  for (const pattern of STATIC_QUERY_PATTERNS.CROP_NAME.patterns) {
    if (pattern.test(message)) {
      console.log('✅ [StaticGate] CROP_NAME query detected');
      
      const cropName = input.land_context.crop_schedule?.crop_name || 
                       input.land_context.current_crop;
      const cropVariety = input.land_context.crop_schedule?.crop_variety;
      const growthStage = input.land_context.growth_stage;
      const daysSinceSowing = input.land_context.days_since_sowing;
      
      if (!cropName) {
        const responses = {
          mr: '🌱 या शेताची पीक माहिती अद्याप नोंदवलेली नाही. कृपया "पीक नोंदणी" मध्ये पीक जोडा.',
          hi: '🌱 इस खेत की फसल जानकारी अभी दर्ज नहीं है। कृपया "फसल पंजीकरण" में फसल जोड़ें।',
          en: '🌱 Crop information for this field is not yet recorded. Please add crop in "Crop Registration".'
        };
        
        return {
          handled: true,
          response: responses[lang] || responses.en,
          response_type: 'CROP_NAME',
          confidence: 0.95,
          processing_time_ms: performance.now() - startTime
        };
      }
      
      // Build rich response with all available crop data
      const varietyText = cropVariety ? ` (${cropVariety})` : '';
      
      // Translate stage if available
      const stageTranslations: Record<string, Record<string, string>> = {
        mr: {
          'GERMINATION': 'अंकुरण',
          'SEEDLING': 'रोपटे',
          'VEGETATIVE': 'वाढीचा टप्पा',
          'FLOWERING': 'फुलोरा',
          'FRUITING': 'फळधारणा',
          'MATURITY': 'पिकणे',
          'HARVEST': 'कापणी'
        },
        hi: {
          'GERMINATION': 'अंकुरण',
          'SEEDLING': 'पौधा',
          'VEGETATIVE': 'विकास अवस्था',
          'FLOWERING': 'फूल-फल',
          'FRUITING': 'फल लगना',
          'MATURITY': 'परिपक्वता',
          'HARVEST': 'कटाई'
        },
        en: {
          'GERMINATION': 'Germination',
          'SEEDLING': 'Seedling',
          'VEGETATIVE': 'Vegetative Growth',
          'FLOWERING': 'Flowering',
          'FRUITING': 'Fruiting',
          'MATURITY': 'Maturity',
          'HARVEST': 'Harvest'
        }
      };
      
      const stageLocal = growthStage ? (stageTranslations[lang]?.[growthStage] || growthStage) : null;
      
      const responses = {
        mr: `🌾 या शेतात सध्या **${cropName}${varietyText}** हे पीक आहे.${stageLocal ? `\n📊 पिकाचा टप्पा: ${stageLocal}` : ''}${daysSinceSowing ? `\n📅 पेरणीपासून: ${daysSinceSowing} दिवस` : ''}`,
        hi: `🌾 इस खेत में अभी **${cropName}${varietyText}** फसल है।${stageLocal ? `\n📊 फसल की अवस्था: ${stageLocal}` : ''}${daysSinceSowing ? `\n📅 बुवाई के बाद: ${daysSinceSowing} दिन` : ''}`,
        en: `🌾 This field currently has **${cropName}${varietyText}**.${stageLocal ? `\n📊 Crop stage: ${stageLocal}` : ''}${daysSinceSowing ? `\n📅 Days since sowing: ${daysSinceSowing}` : ''}`
      };
      
      console.log(`📊 [StaticGate] Response generated in ${(performance.now() - startTime).toFixed(1)}ms (NO AI CALL)`);
      
      return {
        handled: true,
        response: responses[lang] || responses.en,
        response_type: 'CROP_NAME',
        confidence: 1.0,
        processing_time_ms: performance.now() - startTime
      };
    }
  }
  
  // CHECK 2: LAND AREA QUERY
  for (const pattern of STATIC_QUERY_PATTERNS.LAND_AREA.patterns) {
    if (pattern.test(message)) {
      console.log('✅ [StaticGate] LAND_AREA query detected');
      
      const areaAcres = input.land_context.area_acres;
      
      if (!areaAcres) {
        const responses = {
          mr: '📐 या शेताचे क्षेत्रफळ नोंदवलेले नाही.',
          hi: '📐 इस खेत का क्षेत्रफल दर्ज नहीं है।',
          en: '📐 Land area is not recorded.'
        };
        return {
          handled: true,
          response: responses[lang] || responses.en,
          response_type: 'LAND_AREA',
          confidence: 0.9,
          processing_time_ms: performance.now() - startTime
        };
      }
      
      const areaGuntha = (areaAcres * 40).toFixed(1);
      
      const responses = {
        mr: `📐 या शेताचे क्षेत्रफळ **${areaAcres.toFixed(2)} एकर** (${areaGuntha} गुंठे) आहे.`,
        hi: `📐 इस खेत का क्षेत्रफल **${areaAcres.toFixed(2)} एकड़** है।`,
        en: `📐 This field is **${areaAcres.toFixed(2)} acres**.`
      };
      
      return {
        handled: true,
        response: responses[lang] || responses.en,
        response_type: 'LAND_AREA',
        confidence: 1.0,
        processing_time_ms: performance.now() - startTime
      };
    }
  }
  
  // CHECK 3: SOWING DATE QUERY
  for (const pattern of STATIC_QUERY_PATTERNS.SOWING_DATE.patterns) {
    if (pattern.test(message)) {
      console.log('✅ [StaticGate] SOWING_DATE query detected');
      
      // CRITICAL: Use ONLY crop_schedules.sowing_date as source of truth
      const sowingDate = input.land_context.crop_schedule?.sowing_date;
      
      if (!sowingDate) {
        const responses = {
          mr: '📅 पेरणीची तारीख नोंदवलेली नाही. कृपया "पीक नोंदणी" मध्ये पीक जोडा.',
          hi: '📅 बुवाई की तारीख दर्ज नहीं है। कृपया "फसल पंजीकरण" में फसल जोड़ें।',
          en: '📅 Sowing date not recorded. Please add crop in "Crop Registration".'
        };
        return {
          handled: true,
          response: responses[lang] || responses.en,
          response_type: 'SOWING_DATE',
          confidence: 0.9,
          processing_time_ms: performance.now() - startTime
        };
      }
      
      const date = new Date(sowingDate);
      const daysSince = input.land_context.days_since_sowing || 0;
      
      // Format date based on language
      const dateOptions: Intl.DateTimeFormatOptions = { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      };
      const dateStrMr = date.toLocaleDateString('mr-IN', dateOptions);
      const dateStrHi = date.toLocaleDateString('hi-IN', dateOptions);
      const dateStrEn = date.toLocaleDateString('en-IN', dateOptions);
      
      const responses = {
        mr: `📅 पेरणीची तारीख: **${dateStrMr}**\n⏱️ पेरणीपासून ${daysSince} दिवस झाले.`,
        hi: `📅 बुवाई की तारीख: **${dateStrHi}**\n⏱️ बुवाई के ${daysSince} दिन हो गए।`,
        en: `📅 Sowing date: **${dateStrEn}**\n⏱️ ${daysSince} days since sowing.`
      };
      
      return {
        handled: true,
        response: responses[lang] || responses.en,
        response_type: 'SOWING_DATE',
        confidence: 1.0,
        processing_time_ms: performance.now() - startTime
      };
    }
  }
  
  // CHECK 4: CROP STAGE QUERY
  for (const pattern of STATIC_QUERY_PATTERNS.CROP_STAGE.patterns) {
    if (pattern.test(message)) {
      console.log('✅ [StaticGate] CROP_STAGE query detected');
      
      const stage = input.land_context.growth_stage;
      const days = input.land_context.days_since_sowing;
      const cropName = input.land_context.crop_schedule?.crop_name || 
                       input.land_context.current_crop;
      
      if (!stage || !cropName) {
        const responses = {
          mr: '🌱 पिकाचा टप्पा निश्चित करण्यासाठी पीक माहिती आणि पेरणी तारीख आवश्यक आहे.',
          hi: '🌱 फसल की अवस्था निर्धारित करने के लिए फसल जानकारी और बुवाई तिथि चाहिए।',
          en: '🌱 Crop information and sowing date needed to determine growth stage.'
        };
        return {
          handled: true,
          response: responses[lang] || responses.en,
          response_type: 'CROP_STAGE',
          confidence: 0.85,
          processing_time_ms: performance.now() - startTime
        };
      }
      
      const stageTranslations: Record<string, Record<string, string>> = {
        mr: {
          'GERMINATION': 'अंकुरण',
          'SEEDLING': 'रोपटे',
          'VEGETATIVE': 'वाढीचा टप्पा',
          'FLOWERING': 'फुलोरा',
          'FRUITING': 'फळधारणा',
          'MATURITY': 'पिकणे',
          'HARVEST': 'कापणी'
        },
        hi: {
          'GERMINATION': 'अंकुरण',
          'SEEDLING': 'पौधा',
          'VEGETATIVE': 'विकास अवस्था',
          'FLOWERING': 'फूल-फल',
          'FRUITING': 'फल लगना',
          'MATURITY': 'परिपक्वता',
          'HARVEST': 'कटाई'
        },
        en: {
          'GERMINATION': 'Germination',
          'SEEDLING': 'Seedling',
          'VEGETATIVE': 'Vegetative Growth',
          'FLOWERING': 'Flowering',
          'FRUITING': 'Fruiting',
          'MATURITY': 'Maturity',
          'HARVEST': 'Harvest'
        }
      };
      
      const stageLocal = stageTranslations[lang]?.[stage] || stage;
      
      const responses = {
        mr: `🌱 ${cropName} पीक सध्या **${stageLocal}** टप्प्यावर आहे${days ? ` (${days} DAS)` : ''}.`,
        hi: `🌱 ${cropName} फसल अभी **${stageLocal}** अवस्था में है${days ? ` (${days} DAS)` : ''}।`,
        en: `🌱 ${cropName} crop is currently at **${stageLocal}** stage${days ? ` (${days} DAS)` : ''}.`
      };
      
      return {
        handled: true,
        response: responses[lang] || responses.en,
        response_type: 'CROP_STAGE',
        confidence: 1.0,
        processing_time_ms: performance.now() - startTime
      };
    }
  }
  
  // CHECK 5: SOIL TYPE QUERY
  for (const pattern of STATIC_QUERY_PATTERNS.SOIL_TYPE.patterns) {
    if (pattern.test(message)) {
      console.log('✅ [StaticGate] SOIL_TYPE query detected');
      
      const soilType = input.land_context.soil_type;
      
      if (!soilType) {
        const responses = {
          mr: '🪨 मातीचा प्रकार नोंदवलेला नाही.',
          hi: '🪨 मृदा प्रकार दर्ज नहीं है।',
          en: '🪨 Soil type not recorded.'
        };
        return {
          handled: true,
          response: responses[lang] || responses.en,
          response_type: 'SOIL_TYPE',
          confidence: 0.9,
          processing_time_ms: performance.now() - startTime
        };
      }
      
      const responses = {
        mr: `🪨 या शेतातील माती: **${soilType}**`,
        hi: `🪨 इस खेत की मृदा: **${soilType}**`,
        en: `🪨 Soil type: **${soilType}**`
      };
      
      return {
        handled: true,
        response: responses[lang] || responses.en,
        response_type: 'SOIL_TYPE',
        confidence: 1.0,
        processing_time_ms: performance.now() - startTime
      };
    }
  }
  
  // CHECK 6: IRRIGATION QUERY
  for (const pattern of STATIC_QUERY_PATTERNS.IRRIGATION.patterns) {
    if (pattern.test(message)) {
      console.log('✅ [StaticGate] IRRIGATION query detected');
      
      const irrigationType = input.land_context.irrigation_type;
      const waterSource = input.land_context.water_source;
      
      if (!irrigationType && !waterSource) {
        const responses = {
          mr: '💧 सिंचन माहिती नोंदवलेली नाही.',
          hi: '💧 सिंचाई जानकारी दर्ज नहीं है।',
          en: '💧 Irrigation information not recorded.'
        };
        return {
          handled: true,
          response: responses[lang] || responses.en,
          response_type: 'IRRIGATION',
          confidence: 0.9,
          processing_time_ms: performance.now() - startTime
        };
      }
      
      const responses = {
        mr: `💧 सिंचन प्रकार: ${irrigationType || 'N/A'}${waterSource ? `\n🚰 पाण्याचा स्त्रोत: ${waterSource}` : ''}`,
        hi: `💧 सिंचाई प्रकार: ${irrigationType || 'N/A'}${waterSource ? `\n🚰 पानी का स्रोत: ${waterSource}` : ''}`,
        en: `💧 Irrigation type: ${irrigationType || 'N/A'}${waterSource ? `\n🚰 Water source: ${waterSource}` : ''}`
      };
      
      return {
        handled: true,
        response: responses[lang] || responses.en,
        response_type: 'IRRIGATION',
        confidence: 1.0,
        processing_time_ms: performance.now() - startTime
      };
    }
  }
  
  // CHECK 7: LOCATION QUERY
  for (const pattern of STATIC_QUERY_PATTERNS.LOCATION.patterns) {
    if (pattern.test(message)) {
      console.log('✅ [StaticGate] LOCATION query detected');
      
      const location = input.land_context.location;
      const landName = input.land_context.land_name;
      
      if (!location?.village && !location?.district) {
        const responses = {
          mr: '📍 शेताचे स्थान नोंदवलेले नाही.',
          hi: '📍 खेत का स्थान दर्ज नहीं है।',
          en: '📍 Land location not recorded.'
        };
        return {
          handled: true,
          response: responses[lang] || responses.en,
          response_type: 'LOCATION',
          confidence: 0.9,
          processing_time_ms: performance.now() - startTime
        };
      }
      
      const locationParts = [
        location?.village,
        location?.district,
        location?.state
      ].filter(Boolean).join(', ');
      
      const responses = {
        mr: `📍 ${landName ? `**${landName}**\n` : ''}स्थान: ${locationParts}`,
        hi: `📍 ${landName ? `**${landName}**\n` : ''}स्थान: ${locationParts}`,
        en: `📍 ${landName ? `**${landName}**\n` : ''}Location: ${locationParts}`
      };
      
      return {
        handled: true,
        response: responses[lang] || responses.en,
        response_type: 'LOCATION',
        confidence: 1.0,
        processing_time_ms: performance.now() - startTime
      };
    }
  }
  
  // No static pattern matched
  console.log('⏭️ [StaticGate] No static pattern matched - passing to AI pipeline');
  return { handled: false, processing_time_ms: performance.now() - startTime, confidence: 0 };
}

// Utility: Validate if land context is complete enough for crop-related queries
export function validateLandContextForCropQueries(landContext: LandContext | null): {
  isValid: boolean;
  missingFields: string[];
  recommendations: string[];
} {
  if (!landContext) {
    return {
      isValid: false,
      missingFields: ['land_context'],
      recommendations: ['Select a land to view crop information']
    };
  }
  
  const missingFields: string[] = [];
  const recommendations: string[] = [];
  
  if (!landContext.crop_schedule?.crop_name && !landContext.current_crop) {
    missingFields.push('crop_name');
    recommendations.push('Add crop schedule in Settings → Land → Add Crop');
  }
  
  if (!landContext.crop_schedule?.sowing_date) {
    missingFields.push('sowing_date');
    recommendations.push('Enter sowing date when adding crop schedule');
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
    recommendations
  };
}
