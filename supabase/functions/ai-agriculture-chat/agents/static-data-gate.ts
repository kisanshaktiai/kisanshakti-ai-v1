/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STATIC DATA GATE - Zero-AI Cost Response for Land Attribute Queries
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module intercepts ALL static data queries BEFORE NLU/AI processing.
 * 
 * CRITICAL PRINCIPLE: If data is in database, NEVER call AI to retrieve it.
 * 
 * Handles:
 * - Crop name queries
 * - Land area queries
 * - Soil type queries
 * - Sowing date queries
 * - Crop stage queries (calculated from sowing_date)
 * - Location queries
 * - Irrigation type queries
 * 
 * Processing time: <50ms (vs 2-5 seconds with AI)
 * Cost: $0 (vs $0.0001-0.001 per AI call)
 */

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
  /**
   * Set when there is NO active crop on the land but a prior crop_schedule
   * exists. Used by CROP_NAME / past-tense crop-lookup responses so the
   * farmer hears "this field had X" instead of a generic "not recorded".
   */
  last_harvested_schedule?: {
    crop_name: string;
    crop_variety?: string | null;
    sowing_date?: string | null;
    actual_harvest_date?: string | null;
    expected_harvest_date?: string | null;
  } | null;
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
  /**
   * Phase 2 (P0): when true, the gate will REFUSE to handle CROP_NAME-style
   * lookups. Used by the orchestrator when the message looks like a next-crop
   * recommendation request (Marathi "नवीन पीक घेवू", Hindi "अगली फसल",
   * English "what should I plant next"). Without this, the gate's CROP_NAME
   * regex (e.g. /या\s*शेतात.*पीक/i) intercepts advisory queries and answers
   * with last-harvest info, blocking the symbolic decision brain.
   */
  is_recommendation_query?: boolean;
}

export interface StaticDataGateOutput {
  handled: boolean;
  response?: string;
  response_type?: 'CROP_NAME' | 'LAND_AREA' | 'SOIL_TYPE' | 'SOWING_DATE' | 'CROP_STAGE' | 'IRRIGATION' | 'LOCATION';
  confidence: number;
  processing_time_ms: number;
}

/**
 * Pattern definitions for static queries (language-agnostic)
 */
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
      /या\s*शेतात.*पिक/i,       // script variant (ि vs ी)
      /इस\s*खेत.*फसल/i,
      /कोणतं\s*पीक/i,
      /कोणतं\s*पिक/i,
      /पिक\s*कोणतं/i,
      /पीक\s*कोणतं/i,
      /फसल\s*कौन\s*सी/i,
      // ── Past-tense / harvested-land lookups ─────────────────────────────
      /कोणतं?\s*(पीक|पिक).*होतं?/i,      // Marathi: "which crop was (here)"
      /कोणते?\s*(पीक|पिक).*होते?/i,
      /(पीक|पिक).*होतं?\s*\??/i,
      /(पीक|पिक).*लावले/i,                // "what crop was planted"
      /(पीक|पिक).*पेरले/i,                // "what crop was sown"
      /कौन\s*सी?\s*फसल\s*थी/i,           // Hindi past
      /क्या\s*उगाया/i,                    // Hindi: "what was grown"
      /क्या\s*बोया/i,
      /पिछ(ली|ले)\s*फसल/i,               // "previous crop"
      /मागील\s*(पीक|पिक)/i,              // Marathi: "previous crop"
      /(last|previous)\s*crop/i,
      /tell\s*me\s*(the\s*)?crop/i,
      /this\s*field.*crop/i
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

/**
 * MAIN GATE FUNCTION - Check and handle static queries
 * 
 * CRITICAL: This MUST be called BEFORE NLU Agent
 */
/**
 * P0 GUARD (2026-06-23): Detect negation / damage / emergence-failure
 * predicates in a farmer message so the StaticGate refuses to answer them
 * as bare lookups (e.g. CROP_NAME → "this field has rice"). When this
 * returns true the gate MUST pass the query to the AI / symbolic pipeline.
 *
 * Exported for unit testing.
 */
export function hasProblemOrEmergenceSignal(message: string): boolean {
  if (!message || typeof message !== 'string') return false;

  // English problem / negation / damage predicates
  const en = /\b(not|no|never|n't|fail|failed|failing|dying|dead|damage|damaged|poor|wilt|wilting|yellow|stunt|stunted|rot|rotting|disease|pest|attack|burn|burnt|missing|empty|gap|sparse|patchy|emerge|emergence|germinat|sprout|sprouted|did\s*not|hasn't|hasnt|haven't|havent)\b/i;
  if (en.test(message)) return true;

  // Marathi / Hindi (Devanagari) — negation, damage, emergence/germination
  const dev = /(नाही|नही|नहीं|उगवले|उगवल|उगवली|उगवलं|उगाव|अंकुर|अंकुरण|उगणे|उगत|पेरणी|पेरले|सुकल|सुकली|सुकत|सुकले|मेली|मेले|मरत|मरण|खराब|कमी|पिवळ|पीला|पीली|जळ|जळल|जळली|जळले|करपल|करपली|करपले|कुजल|कुजली|कुजले|नष्ट|नुकसान|रोग|कीड|कीडे|डाग|वाळ|वाळल|वाळली|गायब)/i;
  if (dev.test(message)) return true;

  return false;
}

export function checkStaticDataGate(input: StaticDataGateInput): StaticDataGateOutput {
  const startTime = performance.now();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL VALIDATION: Land context MUST be present for most static queries
  // ═══════════════════════════════════════════════════════════════════════════
  if (!input.land_context) {
    console.log('⚠️ [StaticGate] No land context - passing to AI pipeline');
    return { handled: false, processing_time_ms: performance.now() - startTime, confidence: 0 };
  }
  
  const message = input.farmer_message.trim();
  const lang = input.language;

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 PROBLEM/NEGATION/EMERGENCE GUARD (2026-06-23):
  // If the message contains any negation, damage/symptom predicate, or an
  // emergence/germination signal, the static gate MUST bypass ALL branches
  // — these are diagnostic queries (e.g. "या शेतातील पिक अजून उगवले नाही")
  // that the CROP_NAME regex (/या\s*शेतात.*पिक/i) would otherwise hijack
  // and answer as a generic "what crop is in this field" lookup. Pass to
  // the symbolic brain so EMERGENCE_FAILURE / diagnosis rules can fire.
  // ═══════════════════════════════════════════════════════════════════════════
  if (hasProblemOrEmergenceSignal(message)) {
    console.log('🚫 [StaticGate] Problem/negation/emergence predicate detected — bypassing static branches (→ AI pipeline)');
    return { handled: false, processing_time_ms: performance.now() - startTime, confidence: 0 };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 1: CROP NAME QUERY
  // Phase 2 (P0): skip CROP_NAME when message is pre-classified as a
  // next-crop recommendation request.
  // ═══════════════════════════════════════════════════════════════════════════
  if (input.is_recommendation_query) {
    console.log('⏭️ [StaticGate] CROP_NAME branch SKIPPED — message classified as NEXT_CROP_RECOMMENDATION; routing to symbolic brain');
  } else {
  for (const pattern of STATIC_QUERY_PATTERNS.CROP_NAME.patterns) {
    if (pattern.test(message)) {
      console.log('✅ [StaticGate] CROP_NAME query detected');
      
      const cropName = input.land_context.crop_schedule?.crop_name || 
                       input.land_context.current_crop;
      const cropVariety = input.land_context.crop_schedule?.crop_variety;
      const growthStage = input.land_context.growth_stage;
      const daysSinceSowing = input.land_context.days_since_sowing;
      
      if (!cropName) {
        // ─── HARVESTED-LAND FALLBACK ────────────────────────────────────────
        // If there is no active crop but a prior crop_schedule exists, tell
        // the farmer what *was* grown rather than the generic "not recorded".
        const last = input.land_context.last_harvested_schedule;
        if (last?.crop_name) {
          const lastVariety = last.crop_variety ? ` (${last.crop_variety})` : '';
          const harvestDate = last.actual_harvest_date || last.expected_harvest_date || null;
          let dateStrMr = '', dateStrHi = '', dateStrEn = '';
          if (harvestDate) {
            const d = new Date(harvestDate);
            const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
            try { dateStrMr = d.toLocaleDateString('mr-IN', opts); } catch { dateStrMr = harvestDate; }
            try { dateStrHi = d.toLocaleDateString('hi-IN', opts); } catch { dateStrHi = harvestDate; }
            try { dateStrEn = d.toLocaleDateString('en-IN', opts); } catch { dateStrEn = harvestDate; }
          }
          const harvestedResponses = {
            mr: `🌾 या शेतात मागील हंगामात **${last.crop_name}${lastVariety}** हे पीक होते.${harvestDate ? `\n📅 कापणी: ${dateStrMr}` : ''}\n🌱 सध्या हे शेत रिकामे आहे — नवीन पेरणीसाठी उपलब्ध आहे.`,
            hi: `🌾 इस खेत में पिछले मौसम में **${last.crop_name}${lastVariety}** फसल थी।${harvestDate ? `\n📅 कटाई: ${dateStrHi}` : ''}\n🌱 अभी यह खेत खाली है — नई बुवाई के लिए उपलब्ध है।`,
            en: `🌾 This field previously had **${last.crop_name}${lastVariety}**.${harvestDate ? `\n📅 Harvested: ${dateStrEn}` : ''}\n🌱 The field is currently empty and available for sowing.`
          };
          return {
            handled: true,
            response: harvestedResponses[lang] || harvestedResponses.en,
            response_type: 'CROP_NAME',
            confidence: 0.98,
            processing_time_ms: performance.now() - startTime
          };
        }

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
  } // end of `else { ... }` for is_recommendation_query guard
  
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 2: LAND AREA QUERY
  // ═══════════════════════════════════════════════════════════════════════════
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 3: SOWING DATE QUERY
  // ═══════════════════════════════════════════════════════════════════════════
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 4: CROP STAGE QUERY
  // ═══════════════════════════════════════════════════════════════════════════
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 5: SOIL TYPE QUERY
  // ═══════════════════════════════════════════════════════════════════════════
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 6: IRRIGATION QUERY
  // ═══════════════════════════════════════════════════════════════════════════
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 7: LOCATION QUERY
  // ═══════════════════════════════════════════════════════════════════════════
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

/**
 * Utility: Validate if land context is complete enough for crop-related queries
 */
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
