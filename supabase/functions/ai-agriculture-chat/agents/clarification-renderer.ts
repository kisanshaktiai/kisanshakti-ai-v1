/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE-8: CLARIFICATION RENDERER (LLM = TRANSLATOR ONLY)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Convert ObservationKeys to farmer-friendly language safely.
 * The LLM ONLY translates - it NEVER decides anything.
 * 
 * PHASE-8.1 UPDATE:
 * - Stage-aware framing when CropContextAuthority exists
 * - Prepend crop + stage info to clarification questions (NO DIAGNOSIS)
 * 
 * RULES:
 * - Input: ClarificationScope + ObservationKeys + Language + optional CropContext
 * - Output: Question + Options (validated for safety)
 * - LLM is a RENDERER ONLY - no decisions
 * - Hard validation gate rejects unsafe output
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ObservationKey } from '../decision/observation-ontology.ts';
import { type CropContextAuthority, formatCropContextFrame } from '../decision/context-authority.ts';
import { 
  getClarificationOptions, 
  loadObservationKeysFromDB,
  getObservationKeyLabels,
  loadIntentDrivenClarification,
  type ClarificationOption 
} from './canonical-observation-loader.ts';

export const CLARIFICATION_RENDERER_VERSION = '3.1.0'; // v3.1: INTENT_DRIVEN scope (DB intent question + options)

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION SCOPE ENUM (PHASE-8)
// ═══════════════════════════════════════════════════════════════════════════

export enum ClarificationScope {
  IDENTIFY_CROP = 'IDENTIFY_CROP',
  IDENTIFY_LOCATION = 'IDENTIFY_LOCATION',        // Affected part
  IDENTIFY_DISTRIBUTION = 'IDENTIFY_DISTRIBUTION',
  IDENTIFY_SEVERITY = 'IDENTIFY_SEVERITY',
  IDENTIFY_TIMING = 'IDENTIFY_TIMING',
  IDENTIFY_INSECT_TYPE = 'IDENTIFY_INSECT_TYPE',  // PHASE-10: Before distribution for insects
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-11: Insect-First Clarification (Agronomically Correct Order)
  // When farmer reports insect presence, ask about behavior and plant response
  // BEFORE asking about field distribution (which is biologically premature)
  // ═══════════════════════════════════════════════════════════════════════════
  IDENTIFY_INSECT_BEHAVIOR = 'IDENTIFY_INSECT_BEHAVIOR',   // Flying vs crawling
  IDENTIFY_PLANT_RESPONSE = 'IDENTIFY_PLANT_RESPONSE',     // Curling, yellowing, sticky, holes
  // ═══════════════════════════════════════════════════════════════════════════
  // DIAGNOSTIC_CONFIRMATION (Trust-First Agronomist Mode)
  // Activated when terminal/high-severity damage is reported (plant died, whole plant affected)
  // Shows CAUSE-confirmation options (pest evidence, disease signs) NOT location questions
  // ═══════════════════════════════════════════════════════════════════════════
  DIAGNOSTIC_CONFIRMATION = 'DIAGNOSTIC_CONFIRMATION',
  REFINE_OBSERVATION = 'REFINE_OBSERVATION',
  PHOTO_ONLY = 'PHOTO_ONLY',
  STOP_ESCALATE = 'STOP_ESCALATE'
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT/OUTPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationRenderInput {
  scope: ClarificationScope;
  target_observation_keys: ObservationKey[];
  language_code: string; // Language-agnostic: any BCP-47 code
  max_options: number;  // 2-4
  turn_count: number;
  constraints: {
    no_diagnosis: true;
    no_treatment: true;
    no_assumptions: true;
  };
  /** PHASE-8.1: Optional crop context for stage-aware framing */
  cropContext?: CropContextAuthority | null;
}

/**
 * Single clarification option carrying the canonical `observation_code` whenever the
 * DB resolver knows one. Without this, the orchestrator's chip-value builder falls back
 * to the label (e.g. "Drying/wilting") which is NOT a valid observation_code — the rule
 * engine then matches zero rules and the response collapses to DIAGNOSTIC_ESCALATION /
 * monitoring fallback (see edge log RULE_DATA_INTEGRITY_ERROR matched_responses=0).
 */
export interface RenderedClarificationOption {
  label: string;
  observation_code?: string;
}

export interface ClarificationRenderOutput {
  question: string;
  /**
   * Options are now ALWAYS objects so canonical `observation_code` (when known) survives
   * the round trip to the frontend chip → echoed back as `[obs_keys:<code>]`.
   */
  options: RenderedClarificationOption[];
  photo_request: boolean;
  validation_passed: boolean;
  violations: string[];
  scope: ClarificationScope;
  rendered_by: 'TEMPLATE' | 'LLM';
  /** PHASE-8.1: Whether crop context framing was applied */
  crop_framing_applied?: boolean;
}

export interface SafetyValidationResult {
  valid: boolean;
  violations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE-BASED RENDERER (Preferred - No LLM needed)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-defined safe templates for each clarification scope.
 * These are diagnosis-neutral and safe to use without validation.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DYNAMIC CLARIFICATION TEMPLATES v3.0
 * Templates are now CONTEXT-AWARE based on crop type and land data
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Base templates - used when no context-specific template exists
const BASE_TEMPLATES: Record<ClarificationScope, Record<string, {
  question: string;
  options: string[];
}>> = {
  [ClarificationScope.IDENTIFY_CROP]: {
    en: {
      question: '🌾 Which crop are you asking about?',
      options: ['Sugarcane', 'Cotton', 'Soybean', 'Wheat', 'Rice', 'Other crop']
    }
  },
  
  [ClarificationScope.IDENTIFY_LOCATION]: {
    en: {
      question: '🌿 Which part of the plant is affected?',
      options: ['Leaves', 'Stem / Stalk', 'Roots', 'Fruit / Boll']
    }
  },
  
  [ClarificationScope.IDENTIFY_DISTRIBUTION]: {
    en: {
      question: '📍 How is the problem distributed in the field?',
      options: ['Uniform everywhere', 'Patchy/scattered', 'More on edges', 'More in center']
    }
  },
  
  [ClarificationScope.IDENTIFY_SEVERITY]: {
    en: {
      question: '📊 How severe is the problem?',
      options: ['Light (few plants)', 'Moderate (half field)', 'Heavy (most of field)']
    }
  },
  
  [ClarificationScope.IDENTIFY_TIMING]: {
    en: {
      question: '⏰ When did you first notice this problem?',
      options: ['Today/Yesterday', 'This week', 'Since last week', 'Long time']
    }
  },
  
  [ClarificationScope.IDENTIFY_INSECT_TYPE]: {
    en: {
      question: '🐛 What do the insects look like?',
      options: ['Small green-yellow insects', 'Tiny elongated dark insects', 'Fine webbing with red spots']
    }
  },
  
  [ClarificationScope.IDENTIFY_INSECT_BEHAVIOR]: {
    en: {
      question: '🔍 Are these insects flying or crawling?',
      options: ['Flying', 'Crawling', 'Cannot tell']
    }
  },
  
  [ClarificationScope.IDENTIFY_PLANT_RESPONSE]: {
    en: {
      question: '🌿 Do you notice any changes in the leaves?',
      options: ['Leaves curling', 'Leaves yellowing', 'Sticky substance on leaves', 'Holes or bite marks', 'No such changes visible']
    }
  },
  
  [ClarificationScope.REFINE_OBSERVATION]: {
    en: {
      question: '🔍 What exactly are you observing?',
      options: ['Color change', 'Holes visible', 'Drying/wilting', 'Insects visible']
    }
  },
  
  [ClarificationScope.PHOTO_ONLY]: {
    en: {
      question: '📸 Please send a photo of the affected area. This will help provide accurate advice.',
      options: []
    }
  },
  
  [ClarificationScope.STOP_ESCALATE]: {
    en: {
      question: '🌱 Please monitor your crop for now. If the problem increases, contact us again or visit your nearest agriculture service center.',
      options: []
    }
  },
  
  [ClarificationScope.DIAGNOSTIC_CONFIRMATION]: {
    en: {
      question: '🔬 To confirm the cause, tell us which of these you see:',
      options: [
        '🔴 Central whorl dried / pulls out easily (Dead Heart)',
        '🐛 Larvae visible in stem / near roots',
        '🏠 White termites / tunnels visible in soil',
        '✨ Sticky substance / black mold on leaves',
        '📷 Take Photo (for accurate identification)'
      ]
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CROP-SPECIFIC TEMPLATES - Different options for different crops
// ═══════════════════════════════════════════════════════════════════════════

interface CropSpecificTemplate {
  [ClarificationScope.IDENTIFY_LOCATION]?: Record<string, { question: string; options: string[] }>;
  [ClarificationScope.REFINE_OBSERVATION]?: Record<string, { question: string; options: string[] }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP-STAGE-SPECIFIC TEMPLATES
// Templates vary by crop AND growth stage for accurate clarification
// ═══════════════════════════════════════════════════════════════════════════

interface StageSpecificTemplates {
  [stage: string]: Partial<Record<ClarificationScope, Record<string, { question: string; options: string[] }>>>;
}

interface CropStageSpecificTemplate {
  default: CropSpecificTemplate;
  stages?: StageSpecificTemplates;
}

const CROP_STAGE_SPECIFIC_TEMPLATES: Record<string, CropStageSpecificTemplate> = {
  'SUGARCANE': {
    default: {
      [ClarificationScope.IDENTIFY_LOCATION]: {
        en: {
          question: '🎋 Which part of the sugarcane is affected?',
          options: ['Leaves', 'Stem / Whorl', 'Root / Sett', 'Whole plant']
        }
      },
      [ClarificationScope.REFINE_OBSERVATION]: {
        en: {
          question: '🔍 What exactly do you see in sugarcane?',
          options: ['Dead Heart (dried whorl)', 'Holes in stem', 'Yellow leaves', 'Red leaves', 'Stem breaking']
        }
      }
    },
    stages: {
      'GERMINATION': {
        [ClarificationScope.REFINE_OBSERVATION]: {
          en: {
            question: '🌱 What do you see in sugarcane at germination stage?',
            options: ['Sett looks black/soft', 'White patches on soil', 'Poor/uneven germination', 'Leaves yellowing', 'Some plants completely dead']
          }
        },
        [ClarificationScope.IDENTIFY_LOCATION]: {
          en: {
            question: '🎋 Where is the problem in germination stage?',
            options: ['Sett/Node', 'New shoot', 'Roots', 'Whole plant']
          }
        },
        [ClarificationScope.DIAGNOSTIC_CONFIRMATION]: {
          en: {
            question: '🔬 What do you see at germination/seedling stage:',
            options: [
              '🔍 Early Shoot Borer (Dead Heart)',
              '🐛 Termite / Tunnels in soil',
              '🌱 Sett rotted / turned black',
              '💧 Waterlogging damage',
              '📷 Send Photo'
            ]
          }
        }
      },
      'TILLERING': {
        [ClarificationScope.REFINE_OBSERVATION]: {
          en: {
            question: '🪴 What do you see in sugarcane at tillering stage?',
            options: ['Dried central whorl', 'Holes visible in stem', 'Leaves yellowing/reddening', 'Less tillers', 'Plants drying']
          }
        },
        [ClarificationScope.DIAGNOSTIC_CONFIRMATION]: {
          en: {
            question: '🔬 What do you see at tillering stage:',
            options: [
              '🔴 Dried central whorl (Dead Heart)',
              '🐛 Holes in stem / larvae visible',
              '🏠 Termite / tunnels in soil',
              '💧 Waterlogging damage',
              '📷 Send Photo'
            ]
          }
        }
      },
      'GRAND_GROWTH': {
        [ClarificationScope.REFINE_OBSERVATION]: {
          en: {
            question: '🎋 What do you see in sugarcane at grand growth stage?',
            options: ['Holes visible in stem', 'Yellow/red leaves', 'Stem breaking/bending', 'White creatures visible', 'Leaves curled']
          }
        }
      }
    }
  },
  
  'WHEAT': {
    [ClarificationScope.IDENTIFY_LOCATION]: {
      en: {
        question: '🌾 Which part of wheat is affected?',
        options: ['Leaves', 'Stem', 'Ear/Spike', 'Roots']
      }
    },
    [ClarificationScope.REFINE_OBSERVATION]: {
      en: {
        question: '🔍 What exactly do you see in wheat?',
        options: ['Brown spots on leaves', 'Yellow leaves', 'Drying leaves', 'White colored ear', 'Stem turning soft/dark']
      }
    }
  },
  
  'COTTON': {
    [ClarificationScope.IDENTIFY_LOCATION]: {
      en: {
        question: '🪺 Which part of cotton is affected?',
        options: ['Leaves', 'Stem', 'Boll', 'Flowers', 'Roots']
      }
    },
    [ClarificationScope.REFINE_OBSERVATION]: {
      en: {
        question: '🔍 What exactly do you see in cotton?',
        options: ['Small white creatures on leaves', 'Boll eaten from inside', 'Red leaves', 'Curled/twisted leaves', 'Plant drying']
      }
    }
  },
  
  'RICE': {
    [ClarificationScope.IDENTIFY_LOCATION]: {
      en: {
        question: '🌾 Which part of rice is affected?',
        options: ['Leaves', 'Stem', 'Panicle', 'Roots', 'Whole plant']
      }
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT-AWARE TEMPLATE RESOLVER
// Returns appropriate template based on crop type and land data
// ═══════════════════════════════════════════════════════════════════════════

function getContextAwareTemplate(
  scope: ClarificationScope,
  language: string,
  cropContext?: CropContextAuthority | null,
  landData?: { soil_n?: string; ndvi_trend?: string } | null
): { question: string; options: string[] } {
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-14 FIX: Use CROP_STAGE_SPECIFIC_TEMPLATES (not the non-existent CROP_SPECIFIC_TEMPLATES)
  // Priority: Stage-specific > Crop default > Base template > English fallback
  // ═══════════════════════════════════════════════════════════════════════════
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL: Stage normalization for template lookup
  // SEEDLING maps to GERMINATION for sugarcane (agronomically same)
  // ═══════════════════════════════════════════════════════════════════════════
  const STAGE_TEMPLATE_ALIASES: Record<string, string> = {
    'SEEDLING': 'GERMINATION',
    'SEEDLING_STAGE': 'GERMINATION',
    'EMERGENCE': 'GERMINATION',
    'SPROUTING': 'GERMINATION'
  };
  
  try {
    if (cropContext?.crop_name) {
      const cropKey = cropContext.crop_name.toUpperCase();
      const cropTemplates = CROP_STAGE_SPECIFIC_TEMPLATES[cropKey];
      
      if (cropTemplates) {
        // 1. Try stage-specific template first (highest priority)
        if (cropContext.growth_stage && cropTemplates.stages) {
          // Normalize stage key - use alias if available
          let stageKey = cropContext.growth_stage.toUpperCase().replace(/[\s-]/g, '_');
          if (STAGE_TEMPLATE_ALIASES[stageKey]) {
            console.log(`   🔄 Stage alias: ${stageKey} → ${STAGE_TEMPLATE_ALIASES[stageKey]}`);
            stageKey = STAGE_TEMPLATE_ALIASES[stageKey];
          }
          
          const stageTemplates = cropTemplates.stages[stageKey];
          
          if (stageTemplates && stageTemplates[scope]) {
            const template = stageTemplates[scope]![language] || stageTemplates[scope]!['en'];
            if (template) {
              console.log(`   📋 Using stage-specific template for ${cropKey}/${stageKey}/${scope}`);
              return template;
            }
          }
        }
        
        // 2. Try crop default template
        if (cropTemplates.default && cropTemplates.default[scope]) {
          const template = cropTemplates.default[scope]![language] || cropTemplates.default[scope]!['en'];
          if (template) {
            console.log(`   📋 Using crop-default template for ${cropKey}/${scope}`);
            return template;
          }
        }
        
        // 3. Check if crop has flat structure (WHEAT, COTTON, RICE don't have default wrapper)
        const flatTemplate = (cropTemplates as any)[scope];
        if (flatTemplate && (flatTemplate[language] || flatTemplate['en'])) {
          console.log(`   📋 Using flat crop template for ${cropKey}/${scope}`);
          return flatTemplate[language] || flatTemplate['en'];
        }
      }
    }
  } catch (templateError) {
    console.error(`   ⚠️ Template lookup error, falling back to BASE_TEMPLATES:`, templateError);
  }
  
  // 4. Fall back to base template
  const baseTemplate = BASE_TEMPLATES[scope]?.[language] || BASE_TEMPLATES[scope]?.['en'];
  if (baseTemplate) {
    return baseTemplate;
  }
  
  // 5. Final fallback to English
  return BASE_TEMPLATES[scope]?.['en'] || {
    question: 'Please provide more details about your crop issue.',
    options: []
  };
}

// Export the old name for backward compatibility
const CLARIFICATION_TEMPLATES = BASE_TEMPLATES;

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY VALIDATION (HARD GATE)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FORBIDDEN patterns - if any match, the turn FAILS.
 * This is the HARD SAFETY GATE.
 * 
 * PHASE-9 UPDATE: Added additional pest patterns as per Task 8 requirements.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  // Pest names (Marathi/Hindi/English) - PHASE-9 EXTENDED
  /बोरर|borer|छेदक|stem\s*borer|shoot\s*borer/i,
  /बोंड\s*अळी|bollworm|बॉल\s*वर्म|pink\s*bollworm/i,
  /मावा|माहू|aphid/i,
  /तुडतुड|फुदक|hopper|jassid|planthopper/i,
  /स्पोडोप्टेरा|spodoptera|caterpillar|army\s*worm/i,
  /पांढरी\s*माशी|सफेद\s*मक्खी|whitefly|white\s*fly/i,
  /थ्रिप्स|thrips/i,
  /मीली\s*बग|mealybug|mealy\s*bug/i,
  
  // Disease names - PHASE-9 EXTENDED
  /तांबेरा|रतुआ|rust/i,
  /करपा|ब्लास्ट|blast/i,
  /कुज(?!त)|सड़न|rot(?!ting)/i,  // Negative lookahead to allow "rotting" as symptom
  /झुलसा|blight/i,
  /फफूंद|fungus|fungal/i,
  /विषाणू|वायरस|virus|viral/i,
  /जीवाणू|bacteria|bacterial/i,
  /मुरझाना|wilt(?!ing)/i,  // Allow "wilting" as symptom
  
  // Nutrient names
  /नत्र|नाइट्रोजन|nitrogen/i,
  /स्फुरद|फास्फोरस|phosphorus/i,
  /पालाश|पोटाश|potassium|potash/i,
  /सूक्ष्म\s*पोषक|micronutrient/i,
  /जस्त|जिंक|zinc/i,
  /लोह|आयरन|iron\s+deficiency/i,
  
  // Treatment patterns
  /spray|फवारणी|स्प्रे/i,
  /ml\s*\/\s*liter|ग्रॅम\s*.*\s*लिटर/i,
  /pesticide|कीटनाशक/i,
  /fungicide|फफूंदनाशक|बुरशीनाशक/i,
  /dosage|डोस|मात्रा/i,
  /apply|लावा|लगाओ|छिड़काव/i,
  
  // Product names
  /imidacloprid|chlorpyrifos|monocrotophos/i,
  /thiamethoxam|acetamiprid|fipronil/i,
  /carbendazim|mancozeb|copper/i
];

/**
 * Validate clarification output for safety.
 * If ANY forbidden pattern is found, the turn FAILS.
 */
export function validateClarificationSafety(
  output: Pick<ClarificationRenderOutput, 'question' | 'options'>
): SafetyValidationResult {
  const violations: string[] = [];
  
  // Check question
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(output.question)) {
      violations.push(`Forbidden pattern in question: ${pattern.source}`);
    }
  }
  
  // Check each option (object shape: {label, observation_code?})
  for (const option of output.options) {
    const optionText = typeof option === 'string' ? option : (option?.label ?? '');
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(optionText)) {
        violations.push(`Forbidden pattern in option "${optionText.substring(0, 20)}...": ${pattern.source}`);
      }
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render clarification using templates (no LLM needed).
 * Templates are pre-validated and safe.
 * 
 * PHASE-8.1: Added crop context framing for stage-aware questions.
 */
export function renderClarification(
  input: ClarificationRenderInput
): ClarificationRenderOutput {
  const { scope, language_code, max_options, turn_count, cropContext } = input;
  
  // Get CONTEXT-AWARE template (crop-specific if available)
  const template = getContextAwareTemplate(scope, language_code, cropContext);
  
  console.log(`   🎯 [Renderer] Scope: ${scope}, Crop: ${cropContext?.crop_name || 'none'}, Options: ${template.options.length}`);
  
  // Limit options to max_options. Template options are plain strings (no canonical
  // observation_code attached) — wrap as {label} only. Codes flow in only via the
  // DB-driven path (renderClarificationAsync → getContextAwareTemplateFromDB).
  const limitedOptions: RenderedClarificationOption[] = template.options
    .slice(0, max_options)
    .map((lbl) => ({ label: String(lbl) }));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-8.1: Stage-Aware Framing (NO DIAGNOSIS)
  // If crop context exists, prepend crop + stage info to question
  // ═══════════════════════════════════════════════════════════════════════════
  let finalQuestion = template.question;
  let cropFramingApplied = false;
  
  if (cropContext && cropContext.crop_name && scope !== ClarificationScope.IDENTIFY_CROP) {
    // Prepend crop context frame (e.g., "🌾 तुमच्या गव्हामध्ये (Tillering अवस्था)")
    const cropFrame = formatCropContextFrame(cropContext, language_code as string);
    
    // Format: "{CropFrame}\n\n{Question}"
    finalQuestion = `${cropFrame}\n\n${template.question}`;
    cropFramingApplied = true;
  }
  
  // Templates are pre-validated, but run safety check anyway
  const safetyResult = validateClarificationSafety({
    question: finalQuestion,
    options: limitedOptions
  });
  
  return {
    question: finalQuestion,
    options: limitedOptions,
    photo_request: scope === ClarificationScope.PHOTO_ONLY,
    validation_passed: safetyResult.valid,
    violations: safetyResult.violations,
    scope,
    rendered_by: 'TEMPLATE',
    crop_framing_applied: cropFramingApplied
  };
}

/**
 * Get monitoring advice for when clarification limit is reached (STOP_ESCALATE).
 */
export function getMonitoringAdvice(language: string): string {
  // ✅ FIX: Remove numbered emojis - use bullet points for clear instructions
  const advice: Record<string, string> = {
    en: '🌱 Please monitor your crop carefully for now. If the problem increases:\n\n• Take a clear photo of the affected area\n• Contact us again\n• Or visit your nearest agriculture service center\n\nTake care of your crop! 🙏'
  };
  
  return advice[language] || advice['en'];
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-18: DATABASE-DRIVEN CONTEXT-AWARE TEMPLATE RESOLVER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get context-aware clarification options from database first, then templates.
 * This ensures options are sourced from decision_rules.observable_characteristics
 */
export async function getContextAwareTemplateFromDB(
  scope: ClarificationScope,
  language: string,
  cropContext?: CropContextAuthority | null
): Promise<{ question: string; options: RenderedClarificationOption[] }> {
  const cropCode = cropContext?.crop_name?.toUpperCase() || '';
  const stage = cropContext?.growth_stage?.toUpperCase() || '';

  console.log(`   🔍 [Phase-18] Looking up DB options for ${cropCode}/${stage}/${scope}`);

  // Try to get options from decision_rules table for REFINE_OBSERVATION scope
  if (cropCode && stage && scope === ClarificationScope.REFINE_OBSERVATION) {
    try {
      // Pass language to get DB-resolved labels in the correct language
      const loaded = await loadObservationKeysFromDB(cropCode, stage, language);
      const top = (loaded.keys || []).slice(0, 3).map((k) => ({
        // `k.key` is the canonical observation_code (e.g. `leaf_wilting`) — preserve it
        // so the orchestrator can attach it as the chip `value` and the rule engine
        // receives a real observation_code instead of a UI label.
        observation_code: k.key,
        label: k.label || k.key.replace(/_/g, ' ')
      }));

      if (top.length > 0) {
        console.log(
          `   ✅ Found ${top.length} options from DB for ${cropCode}/${stage}/${language} (source=${loaded.loaded_from}); first code=${top[0].observation_code}`
        );

        const templateQuestion = getTemplateQuestion(scope, language, cropContext);
        return {
          question: templateQuestion,
          options: top
        };
      } else {
        console.log(
          `   ⚠️ No DB options found for ${cropCode}/${stage} (source=${loaded.loaded_from}) - using templates`
        );
      }
    } catch (dbError) {
      console.error(`   ⚠️ DB lookup failed, falling back to templates:`, dbError);
    }
  }

  // Fallback to hardcoded templates → wrap as objects with no observation_code
  const tmpl = getContextAwareTemplate(scope, language, cropContext);
  return {
    question: tmpl.question,
    options: tmpl.options.map((lbl) => ({ label: String(lbl) }))
  };
}

/**
 * Get just the question text from templates (for use with DB-sourced options)
 */
function getTemplateQuestion(
  scope: ClarificationScope,
  language: string,
  cropContext?: CropContextAuthority | null
): string {
  try {
    if (cropContext?.crop_name) {
      const cropKey = cropContext.crop_name.toUpperCase();
      const cropTemplates = CROP_STAGE_SPECIFIC_TEMPLATES[cropKey];
      
      if (cropTemplates) {
        // Stage-specific question
        if (cropContext.growth_stage && cropTemplates.stages) {
          const stageKey = cropContext.growth_stage.toUpperCase();
          const stageTemplates = cropTemplates.stages[stageKey];
          if (stageTemplates?.[scope]?.[language]?.question) {
            return stageTemplates[scope]![language].question;
          }
          // Fallback to English
          if (stageTemplates?.[scope]?.['en']?.question) {
            return stageTemplates[scope]!['en'].question;
          }
        }
        
        // Crop default question
        if (cropTemplates.default?.[scope]?.[language]?.question) {
          return cropTemplates.default[scope]![language].question;
        }
        if (cropTemplates.default?.[scope]?.['en']?.question) {
          return cropTemplates.default[scope]!['en'].question;
        }
        
        // Flat structure
        const flatTemplate = (cropTemplates as any)[scope];
        if (flatTemplate?.[language]?.question) {
          return flatTemplate[language].question;
        }
      }
    }
  } catch (e) {
    // Ignore and fallback
  }
  
  return BASE_TEMPLATES[scope]?.[language]?.question || 
         BASE_TEMPLATES[scope]?.en?.question || 
         'Please describe what you observe:';
}

/**
 * PHASE-18: Async render clarification with DB lookup first.
 * Priority: DB rules > Templates > Fallback
 */
export async function renderClarificationAsync(
  input: ClarificationRenderInput
): Promise<ClarificationRenderOutput> {
  const { scope, language_code, max_options, cropContext } = input;
  
  // Get DB-driven options first, then fall back to templates
  const template = await getContextAwareTemplateFromDB(scope, language_code, cropContext);
  
  console.log(`   🎯 [Renderer Async] Scope: ${scope}, Crop: ${cropContext?.crop_name || 'none'}, Options: ${template.options.length}`);
  
  // Limit options to max_options
  const limitedOptions = template.options.slice(0, max_options);
  
  // Stage-Aware Framing
  let finalQuestion = template.question;
  let cropFramingApplied = false;
  
  if (cropContext && cropContext.crop_name && scope !== ClarificationScope.IDENTIFY_CROP) {
    const cropFrame = formatCropContextFrame(cropContext, language_code as string);
    finalQuestion = `${cropFrame}\n\n${template.question}`;
    cropFramingApplied = true;
  }
  
  // Safety validation
  const safetyResult = validateClarificationSafety({
    question: finalQuestion,
    options: limitedOptions
  });
  
  return {
    question: finalQuestion,
    options: limitedOptions,
    photo_request: scope === ClarificationScope.PHOTO_ONLY,
    validation_passed: safetyResult.valid,
    violations: safetyResult.violations,
    scope,
    rendered_by: 'TEMPLATE',
    crop_framing_applied: cropFramingApplied
  };
}

export default {
  ClarificationScope,
  renderClarification,
  renderClarificationAsync,
  getContextAwareTemplateFromDB,
  validateClarificationSafety,
  getMonitoringAdvice,
  CLARIFICATION_RENDERER_VERSION
};
