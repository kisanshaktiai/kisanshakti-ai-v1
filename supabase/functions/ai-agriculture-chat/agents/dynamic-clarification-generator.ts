/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DYNAMIC CONTEXT-AWARE CLARIFICATION GENERATOR
 * World-Class LLM + Symbolic Decision Brain Integration
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Generate intelligent, context-aware clarification options using ALL available
 * agronomic data: crop, days since sowing, growth stage, soil NPK, NDVI trends,
 * weather forecasts, and AI crop schedule data.
 * 
 * PHILOSOPHY:
 * - NOT a traditional chatbot with static templates
 * - World-class symbolic decision brain with LLM rendering
 * - Options are EVIDENCE-BASED from actual field conditions
 * - Farmer sees RELEVANT choices, not generic menus
 * 
 * EXAMPLE:
 * Instead of: "पान", "खोड", "मूळ" (generic)
 * Generate: "30 दिवसांच्या उसात उगवण गॅप (NDVI कमी)", 
 *           "पांढरी माती (वाळवी)", "पान पिवळे होणे (N कमतरता)"
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ClarificationScope } from './clarification-renderer.ts';
import { getStageSpecificAdvice, type StageAdvice } from './crop-stage-advisor.ts';
import { AI_CONFIG, getModel, getAPIKey } from '../../_shared/aiConfig.ts';

export const DYNAMIC_CLARIFICATION_VERSION = '2.0.0'; // World-class probabilistic reasoning

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Probabilistic Cause Hypothesis
 * Used for intelligent inference based on all available context
 */
export interface ProbableCause {
  cause_id: string;
  cause_name: string;
  probability: number;  // 0-1 confidence
  evidence: string[];   // What data supports this
  differentiating_test: string;  // How to confirm/rule out
  observation_key: string;  // Maps to ObservationKey enum
}

export interface AgronomicContext {
  // Crop Identity
  crop_name: string;
  crop_code: string;
  
  // Growth Stage
  growth_stage: string;
  days_since_sowing: number;
  expected_harvest_date?: string;
  
  // Soil Health
  soil_n?: number | string;  // Nitrogen kg/ha or status
  soil_p?: number | string;  // Phosphorus kg/ha or status
  soil_k?: number | string;  // Potassium kg/ha or status
  soil_ph?: number;
  soil_ec?: number;
  soil_tested?: boolean;
  
  // NDVI/Satellite
  ndvi_value?: number;
  ndvi_trend?: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'CRITICAL';
  ndvi_history_count?: number;
  
  // Weather
  temperature?: number;
  humidity?: number;
  rain_expected?: boolean;
  rain_probability?: number;
  wind_speed?: number;
  
  // Land Info
  area_acres?: number;
  irrigation_type?: string;
  village?: string;
  district?: string;
  
  // Schedule Data
  next_scheduled_task?: string;
  pending_tasks_count?: number;
}

export interface DynamicClarificationInput {
  scope: ClarificationScope;
  farmer_message: string;
  language: 'mr' | 'hi' | 'en';
  agronomic_context: AgronomicContext;
  max_options?: number;
}

export interface DynamicClarificationOption {
  label: string;
  observation_key: string;
  confidence: number;
  evidence: string;  // Why this option is relevant
}

export interface DynamicClarificationOutput {
  question: string;
  options: DynamicClarificationOption[];
  context_frame: string;  // e.g., "तुमच्या 30 दिवसांच्या उसात (उगवण अवस्था)"
  evidence_summary: string;  // What data influenced these options
  generated_by: 'LLM_DYNAMIC' | 'SYMBOLIC_RULES' | 'HYBRID';
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE-SPECIFIC PROBLEM INDICATORS
// Based on ICAR standards from crop-stage-advisor.ts
// ═══════════════════════════════════════════════════════════════════════════

interface StageProblemIndicators {
  likely_pests: string[];
  likely_diseases: string[];
  likely_deficiencies: string[];
  environmental_stressors: string[];
  common_symptoms: { symptom: string; probable_causes: string[] }[];
}

function getStageProblemIndicators(
  cropCode: string, 
  growthStage: string,
  context: AgronomicContext
): StageProblemIndicators {
  const stageAdvice = getStageSpecificAdvice(cropCode, growthStage);
  
  const indicators: StageProblemIndicators = {
    likely_pests: stageAdvice?.pest_watch || [],
    likely_diseases: stageAdvice?.disease_watch || [],
    likely_deficiencies: [],
    environmental_stressors: [],
    common_symptoms: []
  };
  
  // Add nutrient deficiencies based on soil data
  if (context.soil_tested) {
    if (context.soil_n === 'LOW' || (typeof context.soil_n === 'number' && context.soil_n < 250)) {
      indicators.likely_deficiencies.push('Nitrogen_Deficiency');
    }
    if (context.soil_p === 'LOW' || (typeof context.soil_p === 'number' && context.soil_p < 10)) {
      indicators.likely_deficiencies.push('Phosphorus_Deficiency');
    }
    if (context.soil_k === 'LOW' || (typeof context.soil_k === 'number' && context.soil_k < 120)) {
      indicators.likely_deficiencies.push('Potassium_Deficiency');
    }
  }
  
  // Add environmental stressors based on weather/NDVI
  if (context.ndvi_trend === 'DECLINING' || context.ndvi_trend === 'CRITICAL') {
    indicators.environmental_stressors.push('Vegetation_Stress_Detected');
  }
  if (context.temperature && context.temperature > 38) {
    indicators.environmental_stressors.push('Heat_Stress');
  }
  if (context.humidity && context.humidity > 85) {
    indicators.environmental_stressors.push('High_Humidity_Disease_Risk');
  }
  if (context.rain_expected && context.rain_probability && context.rain_probability > 60) {
    indicators.environmental_stressors.push('Rain_Expected');
  }
  
  // Crop-stage specific symptom patterns
  if (cropCode.toUpperCase() === 'SUGARCANE') {
    if (growthStage === 'GERMINATION') {
      indicators.common_symptoms = [
        { symptom: 'gaps_in_field', probable_causes: ['Termite', 'Sett_Rot', 'Poor_Germination'] },
        { symptom: 'wilted_shoots', probable_causes: ['Early_Shoot_Borer', 'Water_Stress'] },
        { symptom: 'white_soil_patches', probable_causes: ['Termite', 'Salt_Accumulation'] },
        { symptom: 'yellow_leaves', probable_causes: ['Nitrogen_Deficiency', 'Waterlogging', 'Iron_Deficiency'] }
      ];
    } else if (growthStage === 'TILLERING') {
      indicators.common_symptoms = [
        { symptom: 'dead_heart', probable_causes: ['Early_Shoot_Borer', 'Top_Borer'] },
        { symptom: 'reduced_tillers', probable_causes: ['Water_Stress', 'Nitrogen_Deficiency'] },
        { symptom: 'red_leaves', probable_causes: ['Red_Rot', 'Drought_Stress'] }
      ];
    } else if (growthStage === 'GRAND_GROWTH') {
      indicators.common_symptoms = [
        { symptom: 'holes_in_stem', probable_causes: ['Internode_Borer', 'Top_Borer'] },
        { symptom: 'white_powder', probable_causes: ['Woolly_Aphid', 'Mealybug'] },
        { symptom: 'yellowing', probable_causes: ['Nitrogen_Deficiency', 'Water_Stress', 'Red_Rot'] }
      ];
    }
  }
  
  return indicators;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORLD-CLASS: PROBABILISTIC CAUSE RANKING
// Calculate probability of each cause based on ALL available context
// ═══════════════════════════════════════════════════════════════════════════

export function calculateProbableCauses(
  context: AgronomicContext,
  farmerMessage: string,
  dialectResult?: any // DialectNormalizationResult from dialect-normalizer
): ProbableCause[] {
  const causes: ProbableCause[] = [];
  const cropCode = context.crop_code?.toUpperCase() || 'UNKNOWN';
  const stage = context.growth_stage?.toUpperCase() || 'UNKNOWN';
  const dos = context.days_since_sowing || 0;
  
  console.log(`   📊 [ProbableCauses] Calculating for ${cropCode}/${stage} (${dos} DAS)`);
  
  // Get stage-specific indicators
  const indicators = getStageProblemIndicators(cropCode, stage, context);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SUGARCANE-SPECIFIC PROBABILISTIC REASONING
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (cropCode === 'SUGARCANE') {
    // Check for patchy death pattern (key indicator for germination issues)
    const isPatchyDeath = dialectResult?.pattern_indicator === 'PATCHY' ||
      /काही\s*ठिकाणी|patch|गॅप|gap/i.test(farmerMessage);
    
    const isNewPlanting = dialectResult?.crop_age_indicator === 'NEW' || dos < 30;
    const isPlantDying = dialectResult?.severity_indicator === 'DEAD' || 
      dialectResult?.severity_indicator === 'DYING';
    
    // Weather factors
    const isNoRain = context.rain_probability !== undefined && context.rain_probability < 20;
    const isHot = context.temperature !== undefined && context.temperature > 35;
    
    // NDVI factors
    const isLowNDVI = context.ndvi_value !== undefined && context.ndvi_value < 0.35;
    const isDecliningNDVI = context.ndvi_trend === 'DECLINING' || context.ndvi_trend === 'CRITICAL';
    
    // GERMINATION STAGE PROBABILITIES
    if (stage === 'GERMINATION' || dos < 35) {
      // ═══════════════════════════════════════════════════════════════════════════
      // HYPOTHESIS 1: GERMINATION FAILURE
      // ═══════════════════════════════════════════════════════════════════════════
      let germFailProb = 0.30; // Base probability
      const germEvidence: string[] = ['germination_stage'];
      
      if (isPatchyDeath) { germFailProb += 0.15; germEvidence.push('patchy_pattern'); }
      if (isNewPlanting) { germFailProb += 0.10; germEvidence.push('new_planting'); }
      if (isNoRain) { germFailProb += 0.10; germEvidence.push('no_rain'); }
      if (isHot) { germFailProb += 0.05; germEvidence.push('high_temp'); }
      if (isLowNDVI) { germFailProb += 0.10; germEvidence.push('low_ndvi'); }
      
      causes.push({
        cause_id: 'GERMINATION_FAILURE',
        cause_name: 'Germination Failure',
        probability: Math.min(germFailProb, 0.85),
        evidence: germEvidence,
        differentiating_test: 'Check soil moisture at 10cm depth, pull dead plant - roots absent?',
        observation_key: 'GAPS_IN_FIELD'
      });
      
      // ═══════════════════════════════════════════════════════════════════════════
      // HYPOTHESIS 2: TERMITE ATTACK
      // ═══════════════════════════════════════════════════════════════════════════
      let termiteProb = 0.20; // Base for sugarcane
      const termiteEvidence: string[] = ['sugarcane'];
      
      if (isPatchyDeath) { termiteProb += 0.15; termiteEvidence.push('patchy_pattern'); }
      if (isNoRain) { termiteProb += 0.10; termiteEvidence.push('dry_conditions'); }
      if (/वाळवी|दीमक|termite|white\s*ant|पांढर/i.test(farmerMessage)) {
        termiteProb += 0.25; termiteEvidence.push('farmer_suspects_termite');
      }
      
      causes.push({
        cause_id: 'TERMITE_ATTACK',
        cause_name: 'Termite Attack',
        probability: Math.min(termiteProb, 0.80),
        evidence: termiteEvidence,
        differentiating_test: 'Dig near dead plant, check for white ants/mud tunnels',
        observation_key: 'WHITE_SOIL_TERMITE'
      });
      
      // ═══════════════════════════════════════════════════════════════════════════
      // HYPOTHESIS 3: POOR SEED QUALITY
      // ═══════════════════════════════════════════════════════════════════════════
      let seedQualityProb = 0.15;
      const seedEvidence: string[] = ['germination_stage'];
      
      if (isPatchyDeath && !isNoRain) { seedQualityProb += 0.10; seedEvidence.push('patchy_with_rain'); }
      if (dialectResult?.pattern_indicator === 'UNIFORM') { 
        seedQualityProb += 0.15; seedEvidence.push('uniform_pattern'); 
      }
      
      causes.push({
        cause_id: 'POOR_SEED_QUALITY',
        cause_name: 'Poor Seed Quality',
        probability: Math.min(seedQualityProb, 0.50),
        evidence: seedEvidence,
        differentiating_test: 'Dead plants pull out easily? Check if roots were ever formed',
        observation_key: 'EASY_PULLOUT'
      });
    }
    
    // TILLERING STAGE PROBABILITIES
    if (stage === 'TILLERING' || (dos >= 35 && dos < 100)) {
      // DEAD HEART / SHOOT BORER
      let shootBorerProb = 0.35;
      const borerEvidence: string[] = ['tillering_stage'];
      
      if (/सुरळी|dead\s*heart|गोभ|डेड\s*हार्ट/i.test(farmerMessage)) {
        shootBorerProb += 0.35; borerEvidence.push('dead_heart_symptom');
      }
      if (isDecliningNDVI) { shootBorerProb += 0.10; borerEvidence.push('declining_ndvi'); }
      
      causes.push({
        cause_id: 'SHOOT_BORER',
        cause_name: 'Early Shoot Borer / Dead Heart',
        probability: Math.min(shootBorerProb, 0.90),
        evidence: borerEvidence,
        differentiating_test: 'Pull dried whorl - is there bore hole at base?',
        observation_key: 'DEAD_HEART'
      });
      
      // NITROGEN DEFICIENCY
      let nDefProb = 0.25;
      const nDefEvidence: string[] = ['tillering_stage'];
      
      if (/पिवळ|पील|yellow/i.test(farmerMessage)) {
        nDefProb += 0.20; nDefEvidence.push('yellowing_symptom');
      }
      if (context.soil_n === 'LOW' || (typeof context.soil_n === 'number' && context.soil_n < 200)) {
        nDefProb += 0.25; nDefEvidence.push('low_soil_n');
      }
      
      causes.push({
        cause_id: 'NITROGEN_DEFICIENCY',
        cause_name: 'Nitrogen Deficiency',
        probability: Math.min(nDefProb, 0.80),
        evidence: nDefEvidence,
        differentiating_test: 'Lower leaves yellow first? V-shaped yellowing from tip?',
        observation_key: 'LOWER_LEAVES_YELLOW'
      });
    }
  }
  
  // Sort by probability (highest first)
  causes.sort((a, b) => b.probability - a.probability);
  
  console.log(`   📊 [ProbableCauses] Top causes: ${causes.slice(0, 3).map(c => `${c.cause_id}(${(c.probability * 100).toFixed(0)}%)`).join(', ')}`);
  
  return causes;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE HYPOTHESIS-TESTING OPTIONS
// Options that help differentiate between probable causes
// ═══════════════════════════════════════════════════════════════════════════

function generateHypothesisTestingOptions(
  causes: ProbableCause[],
  language: 'mr' | 'hi' | 'en',
  maxOptions: number = 3
): DynamicClarificationOption[] {
  const options: DynamicClarificationOption[] = [];
  
  const differentiatingLabels: Record<string, Record<string, string>> = {
    'GAPS_IN_FIELD': {
      mr: 'माती सुकी आहे का? (कोरडी पांढरी दिसते)',
      hi: 'मिट्टी सूखी है? (सूखी सफेद दिखती है)',
      en: 'Is soil dry? (looks dry and white)'
    },
    'WHITE_SOIL_TERMITE': {
      mr: 'मुळांजवळ पांढरे किडे आहेत का? (वाळवी/दीमक)',
      hi: 'जड़ों के पास सफेद कीड़े हैं? (दीमक)',
      en: 'White insects near roots? (termites)'
    },
    'EASY_PULLOUT': {
      mr: 'मेलेली उस सहज ओढता येते का? (मुळं नाहीत = उगवण अयशस्वी)',
      hi: 'मरा गन्ना आसानी से निकलता है? (जड़ें नहीं)',
      en: 'Does dead plant pull out easily? (no roots)'
    },
    'DEAD_HEART': {
      mr: 'सुरळी ओढली तर खाली छिद्र दिसते का?',
      hi: 'गोभ खींचने पर नीचे छेद दिखता है?',
      en: 'Bore hole visible when whorl is pulled?'
    },
    'LOWER_LEAVES_YELLOW': {
      mr: 'खालची पाने आधी पिवळी होत आहेत का?',
      hi: 'नीचे के पत्ते पहले पीले हो रहे हैं?',
      en: 'Lower leaves turning yellow first?'
    }
  };
  
  // Take top causes and create differentiating options
  for (const cause of causes.slice(0, maxOptions)) {
    const labelKey = cause.observation_key;
    const label = differentiatingLabels[labelKey]?.[language] || 
                  differentiatingLabels[labelKey]?.en || 
                  cause.differentiating_test;
    
    options.push({
      label,
      observation_key: labelKey,
      confidence: cause.probability,
      evidence: `Tests: ${cause.cause_name} (${(cause.probability * 100).toFixed(0)}%)`
    });
  }
  
  return options;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT FRAME GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

function generateContextFrame(context: AgronomicContext, language: 'mr' | 'hi' | 'en'): string {
  const cropNames: Record<string, Record<string, string>> = {
    'SUGARCANE': { mr: 'ऊस', hi: 'गन्ना', en: 'Sugarcane' },
    'COTTON': { mr: 'कापूस', hi: 'कपास', en: 'Cotton' },
    'WHEAT': { mr: 'गहू', hi: 'गेहूं', en: 'Wheat' },
    'RICE': { mr: 'भात', hi: 'धान', en: 'Rice' },
    'SOYBEAN': { mr: 'सोयाबीन', hi: 'सोयाबीन', en: 'Soybean' }
  };
  
  const stageNames: Record<string, Record<string, string>> = {
    'GERMINATION': { mr: 'उगवण', hi: 'अंकुरण', en: 'Germination' },
    'TILLERING': { mr: 'फुटवे', hi: 'टिलरिंग', en: 'Tillering' },
    'GRAND_GROWTH': { mr: 'वाढीचा काळ', hi: 'बढ़वार', en: 'Grand Growth' },
    'FLOWERING': { mr: 'फुलोरा', hi: 'फूल', en: 'Flowering' },
    'MATURITY': { mr: 'पक्वता', hi: 'परिपक्वता', en: 'Maturity' },
    'VEGETATIVE': { mr: 'वनस्पती वाढ', hi: 'वनस्पति वृद्धि', en: 'Vegetative' }
  };
  
  const cropName = cropNames[context.crop_code?.toUpperCase()]?.[language] || context.crop_name;
  const stageName = stageNames[context.growth_stage?.toUpperCase()]?.[language] || context.growth_stage;
  
  const frames: Record<string, string> = {
    mr: `🌾 तुमच्या ${context.days_since_sowing} दिवसांच्या ${cropName}ात (${stageName} अवस्था)`,
    hi: `🌾 आपके ${context.days_since_sowing} दिन के ${cropName} में (${stageName} अवस्था)`,
    en: `🌾 In your ${context.days_since_sowing}-day ${cropName} (${stageName} stage)`
  };
  
  return frames[language];
}

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE SUMMARY GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

function generateEvidenceSummary(context: AgronomicContext, language: 'mr' | 'hi' | 'en'): string {
  const evidence: string[] = [];
  
  // NDVI Evidence
  if (context.ndvi_value !== undefined) {
    const ndviStatus = context.ndvi_value < 0.3 ? 'LOW' : context.ndvi_value < 0.5 ? 'MODERATE' : 'GOOD';
    if (language === 'mr') {
      evidence.push(`NDVI: ${context.ndvi_value.toFixed(2)} (${context.ndvi_trend === 'DECLINING' ? 'घटत आहे ⚠️' : context.ndvi_trend === 'IMPROVING' ? 'सुधारत आहे ✓' : 'स्थिर'})`);
    } else if (language === 'hi') {
      evidence.push(`NDVI: ${context.ndvi_value.toFixed(2)} (${context.ndvi_trend === 'DECLINING' ? 'घट रहा है ⚠️' : context.ndvi_trend === 'IMPROVING' ? 'सुधर रहा है ✓' : 'स्थिर'})`);
    } else {
      evidence.push(`NDVI: ${context.ndvi_value.toFixed(2)} (${context.ndvi_trend})`);
    }
  }
  
  // Soil Evidence
  if (context.soil_tested) {
    const soilInfo = [];
    if (context.soil_n) soilInfo.push(`N:${context.soil_n}`);
    if (context.soil_p) soilInfo.push(`P:${context.soil_p}`);
    if (context.soil_k) soilInfo.push(`K:${context.soil_k}`);
    if (soilInfo.length > 0) {
      evidence.push(`Soil: ${soilInfo.join(', ')}`);
    }
  }
  
  // Weather Evidence
  if (context.rain_expected) {
    evidence.push(language === 'mr' ? 'पाऊस अपेक्षित 🌧️' : language === 'hi' ? 'बारिश अपेक्षित 🌧️' : 'Rain expected 🌧️');
  }
  
  return evidence.join(' | ');
}

// ═══════════════════════════════════════════════════════════════════════════
// SYMBOLIC OPTION GENERATOR
// Uses rules + context to generate options WITHOUT LLM
// ═══════════════════════════════════════════════════════════════════════════

function generateSymbolicOptions(
  input: DynamicClarificationInput
): DynamicClarificationOption[] {
  const { scope, language, agronomic_context: context } = input;
  const maxOptions = input.max_options || 3;
  
  const indicators = getStageProblemIndicators(
    context.crop_code, 
    context.growth_stage,
    context
  );
  
  const options: DynamicClarificationOption[] = [];
  
  // Generate options based on scope and context
  if (scope === ClarificationScope.REFINE_OBSERVATION) {
    // Use stage-specific symptom patterns
    for (const symptom of indicators.common_symptoms.slice(0, maxOptions)) {
      const labels: Record<string, Record<string, string>> = {
        'gaps_in_field': {
          mr: `शेतात गॅप / काही ठिकाणी उगवले नाही`,
          hi: `खेत में गैप / कहीं-कहीं नहीं उगा`,
          en: `Gaps in field / patchy germination`
        },
        'wilted_shoots': {
          mr: `कोंब वाळले / सुकले`,
          hi: `अंकुर मुरझाए / सूखे`,
          en: `Wilted or dried shoots`
        },
        'white_soil_patches': {
          mr: `मातीत पांढरे डाग / मुंग्या दिसतात`,
          hi: `मिट्टी में सफेद धब्बे / दीमक`,
          en: `White patches in soil / termite signs`
        },
        'yellow_leaves': {
          mr: `पाने पिवळी होत आहेत`,
          hi: `पत्ते पीले हो रहे हैं`,
          en: `Leaves turning yellow`
        },
        'dead_heart': {
          mr: `सुरळी वाळली (Dead Heart)`,
          hi: `गोभ सूख गई (Dead Heart)`,
          en: `Dead Heart (dried whorl)`
        },
        'reduced_tillers': {
          mr: `फुटवे कमी आहेत`,
          hi: `टिलर कम हैं`,
          en: `Reduced tillers`
        },
        'red_leaves': {
          mr: `पाने लाल होत आहेत`,
          hi: `पत्ते लाल हो रहे हैं`,
          en: `Leaves turning red`
        },
        'holes_in_stem': {
          mr: `खोडात छिद्र / भोक`,
          hi: `तने में छेद`,
          en: `Holes in stem`
        },
        'white_powder': {
          mr: `पांढरी पावडर / किडे`,
          hi: `सफेद पाउडर / कीड़े`,
          en: `White powder / insects`
        },
        'yellowing': {
          mr: `पिवळेपणा`,
          hi: `पीलापन`,
          en: `Yellowing`
        }
      };
      
      const label = labels[symptom.symptom]?.[language] || symptom.symptom;
      
      options.push({
        label,
        observation_key: symptom.symptom.toUpperCase(),
        confidence: 0.8,
        evidence: `Stage-specific: ${symptom.probable_causes.join(', ')}`
      });
    }
    
    // Add pest-based options if applicable
    if (indicators.likely_pests.length > 0 && options.length < maxOptions) {
      const pestLabels: Record<string, Record<string, string>> = {
        'Termite': {
          mr: `पांढरी माती / वाळवी दिसते`,
          hi: `सफेद मिट्टी / दीमक दिखता है`,
          en: `White soil / termite visible`
        },
        'Early_Shoot_Borer': {
          mr: `कोंबात किडा / छिद्र`,
          hi: `अंकुर में कीड़ा / छेद`,
          en: `Insect/hole in shoot`
        }
      };
      
      for (const pest of indicators.likely_pests.slice(0, maxOptions - options.length)) {
        const pestKey = pest.replace(/\s+/g, '_');
        const label = pestLabels[pestKey]?.[language] || pest;
        if (!options.find(o => o.label === label)) {
          options.push({
            label,
            observation_key: `PEST_${pestKey.toUpperCase()}`,
            confidence: 0.75,
            evidence: `Common at ${context.growth_stage} stage`
          });
        }
      }
    }
    
    // Add deficiency-based options
    if (indicators.likely_deficiencies.length > 0 && options.length < maxOptions) {
      const defLabels: Record<string, Record<string, string>> = {
        'Nitrogen_Deficiency': {
          mr: `खालची पाने पिवळी (N कमी)`,
          hi: `नीचे के पत्ते पीले (N कमी)`,
          en: `Lower leaves yellow (N deficiency)`
        },
        'Phosphorus_Deficiency': {
          mr: `पाने जांभळी / गडद`,
          hi: `पत्ते बैंगनी / गहरे`,
          en: `Leaves purplish/dark`
        }
      };
      
      for (const def of indicators.likely_deficiencies.slice(0, maxOptions - options.length)) {
        const label = defLabels[def]?.[language] || def;
        if (!options.find(o => o.label === label)) {
          options.push({
            label,
            observation_key: def.toUpperCase(),
            confidence: 0.7,
            evidence: `Based on soil data: ${context.soil_n ? `N=${context.soil_n}` : 'N=unknown'}`
          });
        }
      }
    }
  }
  
  // Ensure we have at least some options
  if (options.length === 0) {
    // Fallback to general symptom options
    const fallbackOptions: Record<string, DynamicClarificationOption[]> = {
      mr: [
        { label: 'पाने पिवळी होत आहेत', observation_key: 'SYMPTOM_YELLOWING', confidence: 0.6, evidence: 'General symptom' },
        { label: 'किडे दिसतात', observation_key: 'INSECT_PRESENT', confidence: 0.6, evidence: 'General symptom' },
        { label: 'वाळलेले / सुकलेले दिसते', observation_key: 'SYMPTOM_DRYING', confidence: 0.6, evidence: 'General symptom' }
      ],
      hi: [
        { label: 'पत्ते पीले हो रहे हैं', observation_key: 'SYMPTOM_YELLOWING', confidence: 0.6, evidence: 'General symptom' },
        { label: 'कीड़े दिखते हैं', observation_key: 'INSECT_PRESENT', confidence: 0.6, evidence: 'General symptom' },
        { label: 'सूखा/मुरझाया दिखता है', observation_key: 'SYMPTOM_DRYING', confidence: 0.6, evidence: 'General symptom' }
      ],
      en: [
        { label: 'Leaves turning yellow', observation_key: 'SYMPTOM_YELLOWING', confidence: 0.6, evidence: 'General symptom' },
        { label: 'Insects visible', observation_key: 'INSECT_PRESENT', confidence: 0.6, evidence: 'General symptom' },
        { label: 'Drying/wilting seen', observation_key: 'SYMPTOM_DRYING', confidence: 0.6, evidence: 'General symptom' }
      ]
    };
    
    return fallbackOptions[language] || fallbackOptions.en;
  }
  
  return options.slice(0, maxOptions);
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM DYNAMIC OPTION GENERATOR
// Uses Gemini/OpenAI to generate context-aware options
// ═══════════════════════════════════════════════════════════════════════════

async function generateLLMOptions(
  input: DynamicClarificationInput
): Promise<DynamicClarificationOption[]> {
  const { scope, farmer_message, language, agronomic_context: context } = input;
  const maxOptions = input.max_options || 3;
  
  // Build prompt for LLM
  const systemPrompt = `You are an expert agronomist generating clarification options for a farmer's query.

CONTEXT (USE THIS DATA):
- Crop: ${context.crop_name} (${context.crop_code})
- Growth Stage: ${context.growth_stage}
- Days Since Sowing: ${context.days_since_sowing}
- NDVI: ${context.ndvi_value?.toFixed(2) || 'N/A'} (Trend: ${context.ndvi_trend || 'N/A'})
- Soil: N=${context.soil_n || 'N/A'}, P=${context.soil_p || 'N/A'}, K=${context.soil_k || 'N/A'}
- Weather: Temp=${context.temperature || 'N/A'}°C, Rain=${context.rain_expected ? 'Expected' : 'No'}
- Area: ${context.area_acres || 'N/A'} acres

FARMER MESSAGE: "${farmer_message}"

TASK:
Generate ${maxOptions} clarification options in ${language === 'mr' ? 'Marathi' : language === 'hi' ? 'Hindi' : 'English'}.

RULES:
1. Options must be OBSERVATION-BASED (what farmer can see), not diagnosis
2. Options should be relevant to the crop, stage, and available data
3. Use simple village-friendly language
4. Each option should be 5-10 words maximum
5. Options should help narrow down the actual problem

OUTPUT FORMAT (JSON array):
[
  {"label": "option text in ${language}", "observation_key": "SYMPTOM_KEY", "evidence": "why this is relevant"},
  ...
]

FORBIDDEN:
- Do NOT name specific pests/diseases (e.g., "borer", "rust")
- Do NOT suggest treatments
- Do NOT use technical jargon`;

  try {
    const apiKey = getAPIKey('gemini');
    if (!apiKey) {
      console.log('   ⚠️ No Gemini API key, falling back to symbolic options');
      return generateSymbolicOptions(input);
    }
    
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ 
          parts: [{ text: systemPrompt }] 
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
          responseMimeType: 'application/json'
        }
      })
    });
    
    if (!response.ok) {
      console.log(`   ⚠️ Gemini API error: ${response.status}, falling back to symbolic`);
      return generateSymbolicOptions(input);
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      return generateSymbolicOptions(input);
    }
    
    // Parse LLM response
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, maxOptions).map((opt: any) => ({
        label: opt.label || opt.text || 'Unknown',
        observation_key: opt.observation_key || 'UNKNOWN',
        confidence: 0.85,
        evidence: opt.evidence || 'LLM generated'
      }));
    }
    
    return generateSymbolicOptions(input);
  } catch (error) {
    console.error('   ❌ LLM option generation failed:', error);
    return generateSymbolicOptions(input);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DYNAMIC CLARIFICATION GENERATOR (WORLD-CLASS)
// Uses probabilistic cause ranking for intelligent hypothesis-testing
// ═══════════════════════════════════════════════════════════════════════════

export async function generateDynamicClarification(
  input: DynamicClarificationInput,
  dialectResult?: any // Optional: DialectNormalizationResult for enhanced context
): Promise<DynamicClarificationOutput> {
  const { scope, language, agronomic_context: context, farmer_message } = input;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P0 INVARIANT 1: Land Context Integrity Check
  // If crop_code exists (non-UNKNOWN), crop_name MUST be populated
  // This catches silent context loss before it causes downstream issues
  // ═══════════════════════════════════════════════════════════════════════════
  if (context.crop_code && context.crop_code !== 'UNKNOWN' && context.crop_name === 'Unknown') {
    console.error(`🚨 [FATAL] Invariant violation: crop_code=${context.crop_code} but crop_name=Unknown`);
    console.error(`   Full context snapshot:`, JSON.stringify(context, null, 2));
    throw new Error(`Invariant violation: landContext expected but missing. crop_code=${context.crop_code}, crop_name=Unknown. Blocking clarification.`);
  }
  
  console.log(`   🧠 [DynamicClarification] Generating context-aware options for ${context.crop_name}/${context.growth_stage}`);
  console.log(`   📊 Context: DOS=${context.days_since_sowing}, NDVI=${context.ndvi_value ?? 'UNKNOWN'}, Soil=${context.soil_tested ? 'tested' : 'not tested'}`);
  
  // Generate context frame
  const contextFrame = generateContextFrame(context, language);
  const evidenceSummary = generateEvidenceSummary(context, language);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD-CLASS: Calculate probable causes using ALL available context
  // This is the intelligent inference layer
  // ═══════════════════════════════════════════════════════════════════════════
  let options: DynamicClarificationOption[];
  let generatedBy: 'LLM_DYNAMIC' | 'SYMBOLIC_RULES' | 'HYBRID' = 'SYMBOLIC_RULES';
  
  try {
    // Calculate probable causes
    const probableCauses = calculateProbableCauses(context, farmer_message, dialectResult);
    
    // If we have high-probability causes, generate hypothesis-testing options
    if (probableCauses.length > 0 && probableCauses[0].probability >= 0.4) {
      console.log(`   🎯 [DynamicClarification] Using probabilistic hypothesis-testing (top cause: ${probableCauses[0].cause_id} @ ${(probableCauses[0].probability * 100).toFixed(0)}%)`);
      
      // Generate options that test the top hypotheses
      options = generateHypothesisTestingOptions(probableCauses, language, input.max_options || 3);
      generatedBy = 'HYBRID';  // Hybrid = probabilistic + symbolic
      
      // If hypothesis testing didn't generate enough options, supplement with LLM/symbolic
      if (options.length < 2) {
        const supplementOptions = await generateLLMOptions(input);
        options = [...options, ...supplementOptions].slice(0, 3);
      }
    } else {
      // Fall back to LLM or symbolic generation
      if (farmer_message && farmer_message.length > 20) {
        options = await generateLLMOptions(input);
        generatedBy = 'LLM_DYNAMIC';
      } else {
        options = generateSymbolicOptions(input);
        generatedBy = 'SYMBOLIC_RULES';
      }
    }
  } catch (error) {
    console.error('   ⚠️ Option generation error, using symbolic fallback:', error);
    options = generateSymbolicOptions(input);
    generatedBy = 'SYMBOLIC_RULES';
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD-CLASS: Context-aware question templates
  // Questions acknowledge farmer's input and guide hypothesis testing
  // ═══════════════════════════════════════════════════════════════════════════
  const questionTemplates: Record<ClarificationScope, Record<string, string>> = {
    [ClarificationScope.REFINE_OBSERVATION]: {
      mr: `खात्री करण्यासाठी, मेलेल्या/प्रभावित भागाजवळ तपासा:`,
      hi: `पुष्टि के लिए, प्रभावित भाग के पास जाँचें:`,
      en: `To confirm, please check near the affected area:`
    },
    [ClarificationScope.IDENTIFY_LOCATION]: {
      mr: `कोणत्या भागावर समस्या दिसते?`,
      hi: `किस हिस्से पर समस्या है?`,
      en: `Which part is affected?`
    },
    [ClarificationScope.IDENTIFY_SEVERITY]: {
      mr: `किती टक्के पीक प्रभावित आहे?`,
      hi: `कितने प्रतिशत फसल प्रभावित है?`,
      en: `What percentage of crop is affected?`
    },
    [ClarificationScope.IDENTIFY_DISTRIBUTION]: {
      mr: `शेतात कुठे दिसते - सर्वत्र की काही ठिकाणी?`,
      hi: `खेत में कहाँ दिखता है - हर जगह या कहीं-कहीं?`,
      en: `Where in field - everywhere or in patches?`
    },
    [ClarificationScope.IDENTIFY_TIMING]: {
      mr: `हे कधीपासून दिसते?`,
      hi: `यह कब से दिख रहा है?`,
      en: `When did this start?`
    },
    [ClarificationScope.IDENTIFY_INSECT_BEHAVIOR]: {
      mr: `किडे कसे दिसतात?`,
      hi: `कीड़े कैसे दिखते हैं?`,
      en: `How do the insects behave?`
    },
    [ClarificationScope.IDENTIFY_PLANT_RESPONSE]: {
      mr: `झाडावर काय परिणाम दिसतो?`,
      hi: `पौधे पर क्या असर है?`,
      en: `What effect on the plant?`
    },
    [ClarificationScope.IDENTIFY_CROP]: {
      mr: `कोणते पीक आहे?`,
      hi: `कौन सी फसल है?`,
      en: `Which crop?`
    },
    [ClarificationScope.IDENTIFY_INSECT_TYPE]: {
      mr: `किडे कसे दिसतात?`,
      hi: `कीड़े कैसे दिखते हैं?`,
      en: `What do insects look like?`
    },
    [ClarificationScope.PHOTO_ONLY]: {
      mr: `अचूक निदानासाठी प्रभावित भागाचा फोटो पाठवा`,
      hi: `सही निदान के लिए प्रभावित भाग की फोटो भेजें`,
      en: `For accurate diagnosis, please send a photo of the affected area`
    },
    [ClarificationScope.STOP_ESCALATE]: {
      mr: `सध्या निरीक्षण करा, तज्ञ सल्ला घ्या`,
      hi: `अभी निगरानी करें, विशेषज्ञ से सलाह लें`,
      en: `Monitor for now, consult an expert`
    }
  };
  
  // Build the full question with context frame
  const baseQuestion = questionTemplates[scope]?.[language] || questionTemplates[scope]?.en || 'Please select:';
  const question = `${contextFrame}\n\n${baseQuestion}`;
  
  // Always append photo option reminder
  const photoReminder: Record<string, string> = {
    mr: `\n\n📸 **सर्वोत्तम**: फोटो पाठवा - अचूक निदान होईल!`,
    hi: `\n\n📸 **सबसे अच्छा**: फोटो भेजें - सही निदान होगा!`,
    en: `\n\n📸 **Best option**: Send a photo for accurate diagnosis!`
  };
  
  const finalQuestion = `${question}${photoReminder[language] || photoReminder.en}`;
  
  console.log(`   ✅ Generated ${options.length} dynamic options (${generatedBy})`);
  
  return {
    question: finalQuestion,
    options,
    context_frame: contextFrame,
    evidence_summary: evidenceSummary,
    generated_by: generatedBy
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Build Agronomic Context from Land Data
// ═══════════════════════════════════════════════════════════════════════════

export function buildAgronomicContext(landContext: any, scheduleData?: any): AgronomicContext {
  // P0 FIX: Explicit NDVI passthrough with fallback chain
  // Ensures NDVI data is captured regardless of landContext shape
  const ndviValue = landContext?.ndvi?.latest_value || 
                    landContext?.ndvi?.value || 
                    landContext?.ndvi_value || 
                    null;
  const ndviTrend = landContext?.ndvi?.trend || 
                    landContext?.ndvi_trend || 
                    'STABLE';
  
  // P0 INVARIANT LOGGING: Log NDVI extraction for production verification
  if (landContext) {
    console.log(`   ✅ [NDVI Passthrough] Extracted: value=${ndviValue}, trend=${ndviTrend}`);
    console.log(`   📊 [NDVI Source] ndvi.latest_value=${landContext?.ndvi?.latest_value}, ndvi.value=${landContext?.ndvi?.value}, ndvi_value=${landContext?.ndvi_value}`);
  }
  
  return {
    crop_name: landContext?.current_crop || 'Unknown',
    crop_code: landContext?.crop_code || landContext?.current_crop?.toUpperCase() || 'UNKNOWN',
    growth_stage: landContext?.growth_stage || 'UNKNOWN',
    days_since_sowing: landContext?.days_since_sowing || 0,
    
    // Soil
    soil_n: landContext?.soil_health?.nitrogen_kg_per_ha,
    soil_p: landContext?.soil_health?.phosphorus_kg_per_ha,
    soil_k: landContext?.soil_health?.potassium_kg_per_ha,
    soil_ph: landContext?.soil_health?.ph,
    soil_tested: !!landContext?.soil_tested,
    
    // P0 FIX: NDVI with fallback chain (not just single path)
    ndvi_value: ndviValue,
    ndvi_trend: ndviTrend as 'IMPROVING' | 'STABLE' | 'DECLINING' | 'CRITICAL',
    
    // Weather
    temperature: landContext?.weather?.temperature,
    humidity: landContext?.weather?.humidity,
    rain_expected: landContext?.weather?.rain_expected,
    
    // Land
    area_acres: landContext?.area_acres,
    irrigation_type: landContext?.irrigation_type,
    village: landContext?.village,
    district: landContext?.district,
    
    // Schedule
    next_scheduled_task: scheduleData?.next_task?.task_name,
    pending_tasks_count: scheduleData?.pending_count
  };
}

export default {
  generateDynamicClarification,
  buildAgronomicContext,
  calculateProbableCauses,
  DYNAMIC_CLARIFICATION_VERSION
};
