/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION BRAIN INTEGRATION - Symbolic Rules + AI Understanding
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Bridges AI-powered NLU understanding with deterministic decision graph rules.
 * Architecture:
 *   [Farmer Message] → [NLU Agent + AI API] → [Decision Graph Rules] → [Response]
 * 
 * Version: 1.0.0
 */

import type { NLUAgentOutput } from './types.ts';

// Decision rule categories matching the decision graph structure
export type RuleCategory = 
  | 'PEST_MANAGEMENT'
  | 'DISEASE_MANAGEMENT'
  | 'NUTRIENT_MANAGEMENT'
  | 'WATER_MANAGEMENT'
  | 'PGR_APPLICATION'
  | 'STRESS_MANAGEMENT'
  | 'GENERAL_ADVISORY';

export interface DecisionRule {
  rule_id: string;
  category: RuleCategory;
  trigger_conditions: {
    intent?: string[];
    crop_codes?: string[];
    pest_codes?: string[];
    disease_codes?: string[];
    symptoms?: string[];
    urgency_levels?: ('HIGH' | 'MEDIUM' | 'LOW')[];
  };
  action: {
    type: 'RECOMMENDATION' | 'WARNING' | 'QUESTION' | 'ESCALATION';
    content: {
      mr: string;
      hi: string;
      en: string;
    };
    products?: Array<{
      name: string;
      dosage: string;
      method: string;
      timing: string;
    }>;
    safety_level: 'SAFE' | 'CAUTION' | 'RESTRICTED';
  };
  priority: number;
  scientific_basis?: string;
}

// Core decision rules - matching ICAR guidelines
const CORE_DECISION_RULES: DecisionRule[] = [
  // Pest Management Rules
  {
    rule_id: 'PM_001',
    category: 'PEST_MANAGEMENT',
    trigger_conditions: {
      intent: ['PEST_PROBLEM'],
      pest_codes: ['WHITEFLY'],
      crop_codes: ['COTTON', 'TOMATO', 'CHILLI']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟢 पांढऱ्या माशीसाठी: निंबोळी अर्क (5%) + पिवळे चिकट सापळे वापरा. गंभीर असल्यास: इमिडाक्लोप्रिड 0.5ml/L',
        hi: '🟢 सफेद मक्खी के लिए: नीम अर्क (5%) + पीले चिपचिपे जाल। गंभीर होने पर: इमिडाक्लोप्रिड 0.5ml/L',
        en: '🟢 For Whitefly: Neem extract (5%) + Yellow sticky traps. If severe: Imidacloprid 0.5ml/L'
      },
      products: [
        { name: 'Neem Oil 5%', dosage: '5ml/L', method: 'Foliar spray', timing: 'Evening' },
        { name: 'Yellow Sticky Traps', dosage: '10-15/acre', method: 'Hang at crop height', timing: 'Install early' }
      ],
      safety_level: 'SAFE'
    },
    priority: 85,
    scientific_basis: 'ICAR Pest Management Guidelines'
  },
  {
    rule_id: 'PM_002',
    category: 'PEST_MANAGEMENT',
    trigger_conditions: {
      intent: ['PEST_PROBLEM'],
      pest_codes: ['BOLLWORM', 'FRUITBORER'],
      crop_codes: ['COTTON', 'CHILLI', 'TOMATO']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🔴 बोंड अळीसाठी: फेरोमोन सापळे (5/एकर) + ट्रायकोग्रामा कार्ड. रासायनिक: क्विनालफॉस 2ml/L (PHI: 14 दिवस)',
        hi: '🔴 बॉलवर्म के लिए: फेरोमोन ट्रैप (5/एकर) + ट्राइकोग्रामा कार्ड। रासायनिक: क्विनालफॉस 2ml/L (PHI: 14 दिन)',
        en: '🔴 For Bollworm: Pheromone traps (5/acre) + Trichogramma cards. Chemical: Quinalphos 2ml/L (PHI: 14 days)'
      },
      products: [
        { name: 'Pheromone Traps', dosage: '5/acre', method: 'Place at canopy level', timing: 'Before flowering' },
        { name: 'Trichogramma Cards', dosage: '4-5/acre', method: 'Staple on leaves', timing: 'Weekly release' }
      ],
      safety_level: 'CAUTION'
    },
    priority: 90,
    scientific_basis: 'ICAR IPM Guidelines for Cotton'
  },
  // Disease Management Rules
  {
    rule_id: 'DM_001',
    category: 'DISEASE_MANAGEMENT',
    trigger_conditions: {
      intent: ['DISEASE_PROBLEM'],
      disease_codes: ['POWDERY_MILDEW'],
      crop_codes: ['CHILLI', 'TOMATO', 'CUCUMBER']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟡 भुरी (पावडरी मिल्ड्यू): गंधक पावडर 2g/L किंवा हेक्साकोनॅझोल 1ml/L फवारा. 10 दिवसांनी पुन्हा करा.',
        hi: '🟡 पाउडरी मिल्ड्यू: सल्फर डस्ट 2g/L या हेक्साकोनाज़ोल 1ml/L स्प्रे। 10 दिन बाद दोहराएं।',
        en: '🟡 Powdery Mildew: Sulphur dust 2g/L or Hexaconazole 1ml/L spray. Repeat after 10 days.'
      },
      products: [
        { name: 'Sulphur 80% WDG', dosage: '2g/L', method: 'Foliar spray', timing: 'Morning' }
      ],
      safety_level: 'SAFE'
    },
    priority: 80
  },
  {
    rule_id: 'DM_002',
    category: 'DISEASE_MANAGEMENT',
    trigger_conditions: {
      intent: ['DISEASE_PROBLEM'],
      disease_codes: ['WILT', 'ROOT_ROT']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '⚠️ मर रोग (विल्ट): ट्रायकोडर्मा 4g/L मुळांजवळ ओतणे + कॉपर ऑक्सिक्लोराइड 3g/L. प्रभावित झाडे काढा.',
        hi: '⚠️ विल्ट रोग: ट्राइकोडर्मा 4g/L जड़ों में डालें + कॉपर ऑक्सीक्लोराइड 3g/L। प्रभावित पौधे निकालें।',
        en: '⚠️ Wilt Disease: Trichoderma 4g/L soil drench + Copper Oxychloride 3g/L. Remove affected plants.'
      },
      products: [
        { name: 'Trichoderma viride', dosage: '4g/L', method: 'Soil drench', timing: 'Evening' }
      ],
      safety_level: 'SAFE'
    },
    priority: 88
  },
  // Nutrient Management
  {
    rule_id: 'NM_001',
    category: 'NUTRIENT_MANAGEMENT',
    trigger_conditions: {
      intent: ['NUTRIENT_ISSUE'],
      symptoms: ['YELLOWING', 'PALE_LEAVES', 'STUNTED_GROWTH']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟢 पिवळी पाने = नायट्रोजन कमी. युरिया 1% (10g/L) फवारा किंवा 19:19:19 (5g/L) वापरा.',
        hi: '🟢 पीले पत्ते = नाइट्रोजन की कमी। यूरिया 1% (10g/L) स्प्रे या 19:19:19 (5g/L) उपयोग करें।',
        en: '🟢 Yellow leaves = Nitrogen deficiency. Spray Urea 1% (10g/L) or use 19:19:19 (5g/L).'
      },
      products: [
        { name: 'Urea', dosage: '10g/L', method: 'Foliar spray', timing: 'Early morning' }
      ],
      safety_level: 'SAFE'
    },
    priority: 75
  },
  // Emergency Response
  {
    rule_id: 'EM_001',
    category: 'STRESS_MANAGEMENT',
    trigger_conditions: {
      urgency_levels: ['HIGH'],
      intent: ['EMERGENCY']
    },
    action: {
      type: 'ESCALATION',
      content: {
        mr: '🚨 आणीबाणी! कृपया जवळच्या कृषी अधिकाऱ्यांशी संपर्क साधा. तोपर्यंत: प्रभावित भाग काढा, पाणी देणे थांबवा.',
        hi: '🚨 आपातकाल! कृपया नजदीकी कृषि अधिकारी से संपर्क करें। तब तक: प्रभावित भाग हटाएं, सिंचाई रोकें।',
        en: '🚨 EMERGENCY! Please contact nearest agriculture officer. Meanwhile: Remove affected parts, stop irrigation.'
      },
      safety_level: 'RESTRICTED'
    },
    priority: 100
  }
];

/**
 * Match NLU output to decision rules
 */
export function matchDecisionRules(nluOutput: NLUAgentOutput): DecisionRule[] {
  const matchedRules: DecisionRule[] = [];
  
  const intent = nluOutput.intent_classification?.primary_intent;
  const cropCode = nluOutput.crop_identification?.crop_code;
  const pestCode = nluOutput.entities_extracted?.pest_mentioned?.canonical;
  const diseaseCode = nluOutput.entities_extracted?.disease_mentioned?.canonical;
  const urgency = nluOutput.intent_classification?.urgency_level;
  const symptoms = nluOutput.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [];
  
  for (const rule of CORE_DECISION_RULES) {
    let score = 0;
    const conditions = rule.trigger_conditions;
    
    // Check intent match
    if (conditions.intent?.includes(intent || '')) {
      score += 3;
    }
    
    // Check crop match
    if (conditions.crop_codes?.includes(cropCode || '') || !conditions.crop_codes) {
      score += 2;
    }
    
    // Check pest match
    if (conditions.pest_codes?.includes(pestCode || '')) {
      score += 4;
    }
    
    // Check disease match
    if (conditions.disease_codes?.includes(diseaseCode || '')) {
      score += 4;
    }
    
    // Check urgency match
    if (conditions.urgency_levels?.includes(urgency as any)) {
      score += 2;
    }
    
    // Check symptom match
    if (conditions.symptoms?.some(s => symptoms.includes(s))) {
      score += 2;
    }
    
    // Include rule if it has significant match
    if (score >= 3) {
      matchedRules.push(rule);
    }
  }
  
  // Sort by priority (highest first)
  return matchedRules.sort((a, b) => b.priority - a.priority);
}

/**
 * Generate response from matched rules
 */
export function generateRuleBasedResponse(
  matchedRules: DecisionRule[],
  language: 'mr' | 'hi' | 'en'
): {
  message: string;
  rules_applied: string[];
  confidence: number;
  safety_level: string;
} {
  if (matchedRules.length === 0) {
    return {
      message: language === 'mr' ? 'कृपया अधिक माहिती द्या जेणेकरून मी मदत करू शकेन.' :
               language === 'hi' ? 'कृपया अधिक जानकारी दें ताकि मैं मदद कर सकूं।' :
               'Please provide more details so I can help you.',
      rules_applied: [],
      confidence: 0.3,
      safety_level: 'UNKNOWN'
    };
  }
  
  const topRule = matchedRules[0];
  const message = topRule.action.content[language] || topRule.action.content.en;
  
  return {
    message,
    rules_applied: matchedRules.slice(0, 3).map(r => r.rule_id),
    confidence: Math.min(0.95, 0.7 + (matchedRules.length * 0.05)),
    safety_level: topRule.action.safety_level
  };
}

export { CORE_DECISION_RULES };
