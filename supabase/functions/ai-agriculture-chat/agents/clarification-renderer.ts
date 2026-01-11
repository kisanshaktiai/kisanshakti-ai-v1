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

export const CLARIFICATION_RENDERER_VERSION = '2.0.0'; // Phase-11: Insect-first clarification

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
  language_code: 'mr' | 'hi' | 'en';
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

export interface ClarificationRenderOutput {
  question: string;
  options: string[];
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
const BASE_TEMPLATES: Record<ClarificationScope, Record<'mr' | 'hi' | 'en', {
  question: string;
  options: string[];
}>> = {
  [ClarificationScope.IDENTIFY_CROP]: {
    mr: {
      question: '🌾 कोणत्या पिकाबद्दल तुम्ही विचारत आहात?',
      options: ['ऊस', 'कापूस', 'सोयाबीन', 'गहू', 'भात', 'इतर पीक']
    },
    hi: {
      question: '🌾 आप किस फसल के बारे में पूछ रहे हैं?',
      options: ['गन्ना', 'कपास', 'सोयाबीन', 'गेहूं', 'धान', 'अन्य फसल']
    },
    en: {
      question: '🌾 Which crop are you asking about?',
      options: ['Sugarcane', 'Cotton', 'Soybean', 'Wheat', 'Rice', 'Other crop']
    }
  },
  
  [ClarificationScope.IDENTIFY_LOCATION]: {
    mr: {
      question: '🌿 झाडाच्या कोणत्या भागावर समस्या दिसते?',
      options: ['पान', 'खोड / देठ', 'मूळ', 'फळ / बोंड']
    },
    hi: {
      question: '🌿 पौधे के किस हिस्से पर समस्या दिख रही है?',
      options: ['पत्ते', 'तना / डंठल', 'जड़', 'फल / बॉल']
    },
    en: {
      question: '🌿 Which part of the plant is affected?',
      options: ['Leaves', 'Stem / Stalk', 'Roots', 'Fruit / Boll']
    }
  },
  
  [ClarificationScope.IDENTIFY_DISTRIBUTION]: {
    mr: {
      question: '📍 शेतात समस्या कशी पसरली आहे?',
      options: ['सगळीकडे सारखी', 'ठिकठिकाणी वेगळी', 'कडेने जास्त', 'मध्यभागी जास्त']
    },
    hi: {
      question: '📍 खेत में समस्या कैसे फैली है?',
      options: ['हर जगह एक जैसी', 'जगह-जगह अलग', 'किनारों पर ज्यादा', 'बीच में ज्यादा']
    },
    en: {
      question: '📍 How is the problem distributed in the field?',
      options: ['Uniform everywhere', 'Patchy/scattered', 'More on edges', 'More in center']
    }
  },
  
  [ClarificationScope.IDENTIFY_SEVERITY]: {
    mr: {
      question: '📊 समस्या किती गंभीर आहे?',
      options: ['थोडी (काही झाडे)', 'मध्यम (अर्धे शेत)', 'जास्त (बहुतेक शेत)']
    },
    hi: {
      question: '📊 समस्या कितनी गंभीर है?',
      options: ['थोड़ी (कुछ पौधे)', 'मध्यम (आधा खेत)', 'ज्यादा (अधिकतर खेत)']
    },
    en: {
      question: '📊 How severe is the problem?',
      options: ['Light (few plants)', 'Moderate (half field)', 'Heavy (most of field)']
    }
  },
  
  [ClarificationScope.IDENTIFY_TIMING]: {
    mr: {
      question: '⏰ समस्या कधीपासून दिसत आहे?',
      options: ['आज / काल', 'या आठवड्यात', 'गेल्या आठवड्यापासून', 'खूप दिवसांपासून']
    },
    hi: {
      question: '⏰ समस्या कब से दिख रही है?',
      options: ['आज / कल', 'इस हफ्ते', 'पिछले हफ्ते से', 'बहुत दिनों से']
    },
    en: {
      question: '⏰ When did you first notice this problem?',
      options: ['Today/Yesterday', 'This week', 'Since last week', 'Long time']
    }
  },
  
  [ClarificationScope.IDENTIFY_INSECT_TYPE]: {
    mr: {
      question: '🐛 किडे कसे दिसतात?',
      options: ['हिरवट-पिवळे लहान किडे', 'बारीक लांबट काळे किडे', 'पानांवर जाळी आणि लाल ठिपके']
    },
    hi: {
      question: '🐛 कीड़े कैसे दिखते हैं?',
      options: ['हरे-पीले छोटे कीड़े', 'पतले लंबे काले कीड़े', 'पत्तों पर जाला और लाल धब्बे']
    },
    en: {
      question: '🐛 What do the insects look like?',
      options: ['Small green-yellow insects', 'Tiny elongated dark insects', 'Fine webbing with red spots']
    }
  },
  
  [ClarificationScope.IDENTIFY_INSECT_BEHAVIOR]: {
    mr: {
      question: '🔍 हे किडे उडतात का चालतात?',
      options: ['उडतात', 'चालतात / रांगतात', 'सांगता येत नाही']
    },
    hi: {
      question: '🔍 ये कीड़े उड़ते हैं या रेंगते हैं?',
      options: ['उड़ते हैं', 'चलते / रेंगते हैं', 'पता नहीं']
    },
    en: {
      question: '🔍 Are these insects flying or crawling?',
      options: ['Flying', 'Crawling', 'Cannot tell']
    }
  },
  
  [ClarificationScope.IDENTIFY_PLANT_RESPONSE]: {
    mr: {
      question: '🌿 पानांवर काही बदल दिसतात का?',
      options: ['पाने वळलेली / मुडलेली', 'पाने पिवळी होत आहेत', 'पानांवर चिकटपणा', 'पानांवर छिद्र / भोक', 'असे काहीही दिसत नाही']
    },
    hi: {
      question: '🌿 पत्तों पर कोई बदलाव दिखता है?',
      options: ['पत्ते मुड़े हुए', 'पत्ते पीले हो रहे हैं', 'पत्तों पर चिपचिपाहट', 'पत्तों पर छेद', 'ऐसा कुछ नहीं दिखता']
    },
    en: {
      question: '🌿 Do you notice any changes in the leaves?',
      options: ['Leaves curling', 'Leaves yellowing', 'Sticky substance on leaves', 'Holes or bite marks', 'No such changes visible']
    }
  },
  
  [ClarificationScope.REFINE_OBSERVATION]: {
    mr: {
      question: '🔍 तुम्ही नेमके काय पाहत आहात?',
      options: ['रंग बदलला', 'छिद्र/भोक दिसतात', 'वाळलेले/सुकलेले', 'किडे दिसतात']
    },
    hi: {
      question: '🔍 आप ठीक से क्या देख रहे हैं?',
      options: ['रंग बदला है', 'छेद दिखते हैं', 'सूखा/मुरझाया', 'कीड़े दिखते हैं']
    },
    en: {
      question: '🔍 What exactly are you observing?',
      options: ['Color change', 'Holes visible', 'Drying/wilting', 'Insects visible']
    }
  },
  
  [ClarificationScope.PHOTO_ONLY]: {
    mr: {
      question: '📸 कृपया प्रभावित भागाचा फोटो पाठवा. यामुळे अचूक सल्ला देणे सोपे होईल.',
      options: []
    },
    hi: {
      question: '📸 कृपया प्रभावित हिस्से की फोटो भेजें। इससे सही सलाह देना आसान होगा।',
      options: []
    },
    en: {
      question: '📸 Please send a photo of the affected area. This will help provide accurate advice.',
      options: []
    }
  },
  
  [ClarificationScope.STOP_ESCALATE]: {
    mr: {
      question: '🌱 सध्या पिकाचे निरीक्षण करा. जर समस्या वाढली तर परत संपर्क करा किंवा जवळच्या कृषी सेवा केंद्राला भेट द्या.',
      options: []
    },
    hi: {
      question: '🌱 अभी फसल की निगरानी करें। अगर समस्या बढ़े तो फिर संपर्क करें या नजदीकी कृषि सेवा केंद्र जाएं।',
      options: []
    },
    en: {
      question: '🌱 Please monitor your crop for now. If the problem increases, contact us again or visit your nearest agriculture service center.',
      options: []
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CROP-SPECIFIC TEMPLATES - Different options for different crops
// ═══════════════════════════════════════════════════════════════════════════

interface CropSpecificTemplate {
  [ClarificationScope.IDENTIFY_LOCATION]?: Record<'mr' | 'hi' | 'en', { question: string; options: string[] }>;
  [ClarificationScope.REFINE_OBSERVATION]?: Record<'mr' | 'hi' | 'en', { question: string; options: string[] }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP-STAGE-SPECIFIC TEMPLATES
// Templates vary by crop AND growth stage for accurate clarification
// ═══════════════════════════════════════════════════════════════════════════

interface StageSpecificTemplates {
  [stage: string]: Partial<Record<ClarificationScope, Record<'mr' | 'hi' | 'en', { question: string; options: string[] }>>>;
}

interface CropStageSpecificTemplate {
  default: CropSpecificTemplate;
  stages?: StageSpecificTemplates;
}

const CROP_STAGE_SPECIFIC_TEMPLATES: Record<string, CropStageSpecificTemplate> = {
  'SUGARCANE': {
    default: {
      [ClarificationScope.IDENTIFY_LOCATION]: {
        mr: {
          question: '🎋 उसाच्या कोणत्या भागावर समस्या दिसते?',
          options: ['पान', 'खोड / सुरळी', 'मूळ / बुडखा', 'संपूर्ण झाड']
        },
        hi: {
          question: '🎋 गन्ने के किस हिस्से पर समस्या है?',
          options: ['पत्ते', 'तना / गड्डी', 'जड़ / गांठ', 'पूरा पौधा']
        },
        en: {
          question: '🎋 Which part of the sugarcane is affected?',
          options: ['Leaves', 'Stem / Whorl', 'Root / Sett', 'Whole plant']
        }
      },
      [ClarificationScope.REFINE_OBSERVATION]: {
        mr: {
          question: '🔍 उसामध्ये नेमके काय दिसते?',
          options: ['सुरळी वाळली (Dead Heart)', 'खोडात छिद्र', 'पाने पिवळी', 'पाने लाल झाली', 'खोड तुटते']
        },
        hi: {
          question: '🔍 गन्ने में क्या दिख रहा है?',
          options: ['गोभ सूख गई (Dead Heart)', 'तने में छेद', 'पत्ते पीले', 'पत्ते लाल', 'तना टूट रहा']
        },
        en: {
          question: '🔍 What exactly do you see in sugarcane?',
          options: ['Dead Heart (dried whorl)', 'Holes in stem', 'Yellow leaves', 'Red leaves', 'Stem breaking']
        }
      }
    },
    stages: {
      'GERMINATION': {
        [ClarificationScope.REFINE_OBSERVATION]: {
          mr: {
            question: '🌱 उगवण अवस्थेतील उसात नेमके काय दिसते?',
            options: ['बेणे काळे/मऊ दिसते', 'मातीवर पांढरे डाग', 'उगवण कमी/असमान', 'पाने पिवळी होत आहेत', 'काही झाडे पूर्ण मेली']
          },
          hi: {
            question: '🌱 अंकुरण अवस्था में गन्ने में क्या दिख रहा है?',
            options: ['बीज काला/नरम दिखता है', 'मिट्टी पर सफेद दाग', 'अंकुरण कम/असमान', 'पत्ते पीले हो रहे हैं', 'कुछ पौधे पूरे मर गए']
          },
          en: {
            question: '🌱 What do you see in sugarcane at germination stage?',
            options: ['Sett looks black/soft', 'White patches on soil', 'Poor/uneven germination', 'Leaves yellowing', 'Some plants completely dead']
          }
        },
        [ClarificationScope.IDENTIFY_LOCATION]: {
          mr: {
            question: '🎋 उगवण अवस्थेत समस्या कुठे दिसते?',
            options: ['बेणे/बुडखा', 'नवीन फुटवा', 'मूळ', 'संपूर्ण झाड']
          },
          hi: {
            question: '🎋 अंकुरण अवस्था में समस्या कहाँ है?',
            options: ['बीज/गांठ', 'नया अंकुर', 'जड़', 'पूरा पौधा']
          },
          en: {
            question: '🎋 Where is the problem in germination stage?',
            options: ['Sett/Node', 'New shoot', 'Roots', 'Whole plant']
          }
        }
      },
      'TILLERING': {
        [ClarificationScope.REFINE_OBSERVATION]: {
          mr: {
            question: '🪴 फुटवा अवस्थेतील उसात काय दिसते?',
            options: ['मधली सुरळी वाळली', 'खोडात छिद्र दिसते', 'पाने पिवळी/लाल होत आहेत', 'फुटवे कमी आहेत', 'झाडे वाळत आहेत']
          },
          hi: {
            question: '🪴 कल्ले अवस्था में गन्ने में क्या दिख रहा है?',
            options: ['बीच की पत्ती सूख गई', 'तने में छेद दिखता है', 'पत्ते पीले/लाल हो रहे', 'कल्ले कम हैं', 'पौधे सूख रहे']
          },
          en: {
            question: '🪴 What do you see in sugarcane at tillering stage?',
            options: ['Dried central whorl', 'Holes visible in stem', 'Leaves yellowing/reddening', 'Less tillers', 'Plants drying']
          }
        }
      },
      'GRAND_GROWTH': {
        [ClarificationScope.REFINE_OBSERVATION]: {
          mr: {
            question: '🎋 वाढीच्या अवस्थेतील उसात काय दिसते?',
            options: ['खोडात छिद्र दिसतात', 'पाने पिवळी/लाल', 'खोड तुटते/वाकते', 'पांढरे जीव दिसतात', 'पाने गुंडाळलेली']
          },
          hi: {
            question: '🎋 बढ़वार अवस्था में गन्ने में क्या दिख रहा है?',
            options: ['तने में छेद दिखते हैं', 'पत्ते पीले/लाल', 'तना टूट/झुक रहा', 'सफेद जीव दिखते हैं', 'पत्ते मुड़े हुए']
          },
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
      mr: {
        question: '🌾 गव्हाच्या कोणत्या भागावर समस्या दिसते?',
        options: ['पान', 'खोड / देठ', 'ओंबी / कणीस', 'मूळ']
      },
      hi: {
        question: '🌾 गेहूं के किस हिस्से पर समस्या है?',
        options: ['पत्ते', 'तना', 'बाली', 'जड़']
      },
      en: {
        question: '🌾 Which part of wheat is affected?',
        options: ['Leaves', 'Stem', 'Ear/Spike', 'Roots']
      }
    },
    [ClarificationScope.REFINE_OBSERVATION]: {
      mr: {
        question: '🔍 गव्हामध्ये नेमके काय दिसते?',
        options: ['पानांवर तपकिरी ठिपके', 'पाने पिवळी', 'पाने वाळत आहेत', 'ओंबी पांढरी झाली', 'खोड मऊ/काळे होत आहे']
      },
      hi: {
        question: '🔍 गेहूं में क्या दिख रहा है?',
        options: ['पत्तों पर भूरे धब्बे', 'पत्ते पीले', 'पत्ते सूख रहे', 'बाली सफेद हो गई', 'तना नरम/काला हो रहा']
      },
      en: {
        question: '🔍 What exactly do you see in wheat?',
        options: ['Brown spots on leaves', 'Yellow leaves', 'Drying leaves', 'White colored ear', 'Stem turning soft/dark']
      }
    }
  },
  
  'COTTON': {
    [ClarificationScope.IDENTIFY_LOCATION]: {
      mr: {
        question: '🪺 कापसाच्या कोणत्या भागावर समस्या दिसते?',
        options: ['पान', 'खोड', 'बोंड', 'फुले', 'मूळ']
      },
      hi: {
        question: '🪺 कपास के किस हिस्से पर समस्या है?',
        options: ['पत्ते', 'तना', 'बॉल', 'फूल', 'जड़']
      },
      en: {
        question: '🪺 Which part of cotton is affected?',
        options: ['Leaves', 'Stem', 'Boll', 'Flowers', 'Roots']
      }
    },
    [ClarificationScope.REFINE_OBSERVATION]: {
      mr: {
        question: '🔍 कापसात नेमके काय दिसते?',
        options: ['पानांवर पांढरे लहान जीव', 'बोंडात आतून खाल्लेले', 'पाने लाल झाली', 'पाने वळली/कुरळी', 'झाड वाळतंय']
      },
      hi: {
        question: '🔍 कपास में क्या दिख रहा है?',
        options: ['पत्तों पर छोटे सफेद जीव', 'बॉल अंदर से खाई हुई', 'पत्ते लाल', 'पत्ते मुड़े/कर्ली', 'पौधा सूख रहा']
      },
      en: {
        question: '🔍 What exactly do you see in cotton?',
        options: ['Small white creatures on leaves', 'Boll eaten from inside', 'Red leaves', 'Curled/twisted leaves', 'Plant drying']
      }
    }
  },
  
  'RICE': {
    [ClarificationScope.IDENTIFY_LOCATION]: {
      mr: {
        question: '🌾 भाताच्या कोणत्या भागावर समस्या दिसते?',
        options: ['पान', 'खोड / देठ', 'कणीस', 'मूळ', 'संपूर्ण झाड']
      },
      hi: {
        question: '🌾 धान के किस हिस्से पर समस्या है?',
        options: ['पत्ते', 'तना', 'बाली', 'जड़', 'पूरा पौधा']
      },
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
  language: 'mr' | 'hi' | 'en',
  cropContext?: CropContextAuthority | null,
  landData?: { soil_n?: string; ndvi_trend?: string } | null
): { question: string; options: string[] } {
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-14 FIX: Use CROP_STAGE_SPECIFIC_TEMPLATES (not the non-existent CROP_SPECIFIC_TEMPLATES)
  // Priority: Stage-specific > Crop default > Base template > English fallback
  // ═══════════════════════════════════════════════════════════════════════════
  
  try {
    if (cropContext?.crop_name) {
      const cropKey = cropContext.crop_name.toUpperCase();
      const cropTemplates = CROP_STAGE_SPECIFIC_TEMPLATES[cropKey];
      
      if (cropTemplates) {
        // 1. Try stage-specific template first (highest priority)
        if (cropContext.growth_stage && cropTemplates.stages) {
          const stageKey = cropContext.growth_stage.toUpperCase();
          const stageTemplates = cropTemplates.stages[stageKey];
          
          if (stageTemplates && stageTemplates[scope]) {
            const template = stageTemplates[scope]![language];
            if (template) {
              console.log(`   📋 Using stage-specific template for ${cropKey}/${stageKey}/${scope}`);
              return template;
            }
          }
        }
        
        // 2. Try crop default template
        if (cropTemplates.default && cropTemplates.default[scope]) {
          const template = cropTemplates.default[scope]![language];
          if (template) {
            console.log(`   📋 Using crop-default template for ${cropKey}/${scope}`);
            return template;
          }
        }
        
        // 3. Check if crop has flat structure (WHEAT, COTTON, RICE don't have default wrapper)
        const flatTemplate = (cropTemplates as any)[scope];
        if (flatTemplate && flatTemplate[language]) {
          console.log(`   📋 Using flat crop template for ${cropKey}/${scope}`);
          return flatTemplate[language];
        }
      }
    }
  } catch (templateError) {
    console.error(`   ⚠️ Template lookup error, falling back to BASE_TEMPLATES:`, templateError);
  }
  
  // 4. Fall back to base template
  const baseTemplate = BASE_TEMPLATES[scope]?.[language];
  if (baseTemplate) {
    return baseTemplate;
  }
  
  // 5. Final fallback to English
  return BASE_TEMPLATES[scope]?.en || {
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
  
  // Check each option
  for (const option of output.options) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(option)) {
        violations.push(`Forbidden pattern in option "${option.substring(0, 20)}...": ${pattern.source}`);
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
  
  // Limit options to max_options
  const limitedOptions = template.options.slice(0, max_options);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-8.1: Stage-Aware Framing (NO DIAGNOSIS)
  // If crop context exists, prepend crop + stage info to question
  // ═══════════════════════════════════════════════════════════════════════════
  let finalQuestion = template.question;
  let cropFramingApplied = false;
  
  if (cropContext && cropContext.crop_name && scope !== ClarificationScope.IDENTIFY_CROP) {
    // Prepend crop context frame (e.g., "🌾 तुमच्या गव्हामध्ये (Tillering अवस्था)")
    const cropFrame = formatCropContextFrame(cropContext, language_code);
    
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
export function getMonitoringAdvice(language: 'mr' | 'hi' | 'en'): string {
  const advice: Record<string, string> = {
    mr: '🌱 सध्या पिकाचे काळजीपूर्वक निरीक्षण करा. जर समस्या वाढली तर:\n\n1️⃣ प्रभावित भागाचा स्पष्ट फोटो काढा\n2️⃣ परत आमच्याशी संपर्क करा\n3️⃣ किंवा जवळच्या कृषी सेवा केंद्राला भेट द्या\n\nतुमच्या पिकाची काळजी घ्या! 🙏',
    hi: '🌱 अभी फसल की ध्यान से निगरानी करें। अगर समस्या बढ़े तो:\n\n1️⃣ प्रभावित हिस्से की साफ फोटो लें\n2️⃣ फिर से हमसे संपर्क करें\n3️⃣ या नजदीकी कृषि सेवा केंद्र जाएं\n\nअपनी फसल का ख्याल रखें! 🙏',
    en: '🌱 Please monitor your crop carefully for now. If the problem increases:\n\n1️⃣ Take a clear photo of the affected area\n2️⃣ Contact us again\n3️⃣ Or visit your nearest agriculture service center\n\nTake care of your crop! 🙏'
  };
  
  return advice[language] || advice.en;
}

export default {
  ClarificationScope,
  renderClarification,
  validateClarificationSafety,
  getMonitoringAdvice,
  CLARIFICATION_RENDERER_VERSION
};
