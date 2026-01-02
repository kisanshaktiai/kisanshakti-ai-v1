/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P1: EXPLAINABLE AI ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Causal reasoning chain generator for transparent recommendations:
 * - "Why this recommendation?" explanations
 * - Scientific basis citations
 * - Confidence scoring
 * - Multi-language support (English, Hindi, Marathi)
 * 
 * Reference: FAO Decision Support System Guidelines
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface ReasoningStep {
  fact: string;
  rule: string;
  conclusion: string;
  confidence: number;  // 0-1
}

export interface ExplainableRecommendation {
  recommendation_id: string;
  recommendation: string;
  
  reasoning_chain: ReasoningStep[];
  
  scientific_basis: {
    source: string;
    reference: string;
    year?: number;
  };
  
  expected_outcome: string;
  risk_if_ignored: string;
  
  confidence_level: number;  // 0-100
  confidence_explanation: string;
  
  data_used: {
    factor: string;
    value: string;
    weight: number;
  }[];
  
  alternative_actions?: string[];
  
  translations?: {
    hi?: ExplanationTranslation;
    mr?: ExplanationTranslation;
  };
}

export interface ExplanationTranslation {
  recommendation: string;
  reasoning_summary: string;
  expected_outcome: string;
  risk_if_ignored: string;
}

export interface DecisionContext {
  crop: string;
  stage: string;
  das: number;
  ndvi?: number;
  weather?: {
    temperature: number;
    humidity: number;
    rain_expected: boolean;
  };
  soil?: {
    ph?: number;
    moisture?: string;
    n_status?: string;
    p_status?: string;
    k_status?: string;
  };
  pest_disease?: string;
  severity?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCIENTIFIC SOURCES DATABASE
// ═══════════════════════════════════════════════════════════════════════════

export const SCIENTIFIC_SOURCES: Record<string, {
  source: string;
  reference: string;
  year?: number;
}> = {
  // ICAR Sources
  'ICAR_WHEAT': {
    source: 'ICAR-IARI',
    reference: 'Package of Practices for Wheat Production',
    year: 2024
  },
  'ICAR_RICE': {
    source: 'ICAR-CRRI',
    reference: 'Rice Production Technology Manual',
    year: 2024
  },
  'ICAR_COTTON': {
    source: 'ICAR-CICR',
    reference: 'Cotton Technical Bulletin',
    year: 2023
  },
  'ICAR_IPM': {
    source: 'ICAR-NCIPM',
    reference: 'Integrated Pest Management Guidelines',
    year: 2024
  },
  'ICAR_SOIL': {
    source: 'ICAR-IISS',
    reference: 'Soil Health Card Interpretation Guide',
    year: 2023
  },
  
  // FAO Sources
  'FAO_IPM': {
    source: 'FAO',
    reference: 'Integrated Pest Management Framework',
    year: 2023
  },
  'FAO_WATER': {
    source: 'FAO',
    reference: 'Crop Water Requirements (FAO-56)',
    year: 2022
  },
  
  // University Sources
  'PAU_PUNJAB': {
    source: 'Punjab Agricultural University',
    reference: 'Package of Practices for Kharif/Rabi Crops',
    year: 2024
  },
  'MPKV_MAHARASHTRA': {
    source: 'Mahatma Phule Krishi Vidyapeeth',
    reference: 'Crop Production Recommendations',
    year: 2024
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// REASONING TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const REASONING_TEMPLATES = {
  nitrogen_application: {
    template: (ctx: DecisionContext) => [
      {
        fact: `Crop is at ${ctx.stage} stage (${ctx.das} DAS)`,
        rule: `${ctx.stage} is a critical stage for nitrogen uptake in ${ctx.crop}`,
        conclusion: 'Nitrogen application timing is optimal',
        confidence: 0.9
      },
      {
        fact: ctx.ndvi ? `NDVI reading is ${ctx.ndvi} (${ctx.ndvi < 0.5 ? 'stress detected' : 'healthy'})` : 'No NDVI data available',
        rule: 'NDVI < 0.50 at vegetative stage indicates nitrogen deficiency',
        conclusion: ctx.ndvi && ctx.ndvi < 0.5 ? 'Nitrogen deficiency confirmed' : 'Vegetation health acceptable',
        confidence: ctx.ndvi ? 0.85 : 0.5
      },
      {
        fact: ctx.soil?.n_status ? `Soil nitrogen status: ${ctx.soil.n_status}` : 'Soil test data not available',
        rule: 'Soil nitrogen availability determines top-dressing requirement',
        conclusion: ctx.soil?.n_status === 'LOW' ? 'Top-dressing required' : 'Standard dose recommended',
        confidence: ctx.soil?.n_status ? 0.9 : 0.6
      }
    ],
    scientific_source: 'ICAR_WHEAT',
    expected_outcome_template: 'NDVI improvement to 0.65+ within 10-14 days, healthy green color restored',
    risk_template: 'Yield loss of 15-25% due to inadequate vegetative growth'
  },
  
  pest_spray: {
    template: (ctx: DecisionContext) => [
      {
        fact: `${ctx.pest_disease} detected with ${ctx.severity} severity`,
        rule: `ETL (Economic Threshold Level) for ${ctx.pest_disease} has been crossed`,
        conclusion: 'Pest management intervention required',
        confidence: 0.9
      },
      {
        fact: ctx.weather?.rain_expected ? 'Rain expected in 24 hours' : 'No rain expected for 48 hours',
        rule: 'Spray should be applied when no rain expected for 4-6 hours minimum',
        conclusion: ctx.weather?.rain_expected ? 'Delay spray or use rain-fast formulation' : 'Weather suitable for spray',
        confidence: 0.95
      },
      {
        fact: `Crop is at ${ctx.stage} stage`,
        rule: 'Stage-appropriate products and doses must be used',
        conclusion: 'Recommended product is compatible with current growth stage',
        confidence: 0.88
      }
    ],
    scientific_source: 'ICAR_IPM',
    expected_outcome_template: 'Pest population reduction by 80-90% within 7 days',
    risk_template: 'Crop damage may exceed 30%, significant yield loss'
  },
  
  irrigation: {
    template: (ctx: DecisionContext) => [
      {
        fact: `Current crop stage: ${ctx.stage} (${ctx.das} DAS)`,
        rule: `${ctx.stage} is a critical period for water requirement in ${ctx.crop}`,
        conclusion: 'Stage-based irrigation timing applies',
        confidence: 0.9
      },
      {
        fact: ctx.soil?.moisture ? `Soil moisture: ${ctx.soil.moisture}` : 'Soil moisture not measured',
        rule: 'Irrigation should be applied when soil moisture falls below 50% field capacity',
        conclusion: ctx.soil?.moisture === 'LOW' ? 'Irrigation urgently needed' : 'Monitor soil moisture',
        confidence: ctx.soil?.moisture ? 0.92 : 0.6
      },
      {
        fact: ctx.weather ? `Temperature: ${ctx.weather.temperature}°C, Humidity: ${ctx.weather.humidity}%` : 'Weather data unavailable',
        rule: 'High temperature and low humidity increase evapotranspiration',
        conclusion: 'Weather conditions factored into recommendation',
        confidence: ctx.weather ? 0.85 : 0.5
      }
    ],
    scientific_source: 'FAO_WATER',
    expected_outcome_template: 'Optimal crop growth maintained, no water stress symptoms',
    risk_template: 'Water stress at this stage can reduce yield by 20-40%'
  },
  
  disease_management: {
    template: (ctx: DecisionContext) => [
      {
        fact: `${ctx.pest_disease} symptoms observed`,
        rule: `${ctx.pest_disease} favored by current conditions`,
        conclusion: 'Disease management required',
        confidence: 0.85
      },
      {
        fact: ctx.weather ? `Humidity: ${ctx.weather.humidity}%` : 'Weather data unavailable',
        rule: 'High humidity (>80%) favors fungal disease development',
        conclusion: ctx.weather && ctx.weather.humidity > 80 ? 'Conditions highly favorable for disease' : 'Moderate disease pressure',
        confidence: 0.88
      }
    ],
    scientific_source: 'ICAR_IPM',
    expected_outcome_template: 'Disease progression halted, new infection prevented',
    risk_template: 'Disease may spread to entire field, causing 40-60% yield loss'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate explainable recommendation with reasoning chain
 */
export function generateExplanation(
  recommendationType: 'nitrogen_application' | 'pest_spray' | 'irrigation' | 'disease_management',
  recommendation: string,
  context: DecisionContext
): ExplainableRecommendation {
  const template = REASONING_TEMPLATES[recommendationType];
  if (!template) {
    return generateGenericExplanation(recommendation, context);
  }
  
  const reasoningChain = template.template(context);
  const scientificBasis = SCIENTIFIC_SOURCES[template.scientific_source];
  
  // Calculate overall confidence
  const avgConfidence = reasoningChain.reduce((sum, step) => sum + step.confidence, 0) / reasoningChain.length;
  const confidenceLevel = Math.round(avgConfidence * 100);
  
  // Determine data used
  const dataUsed: ExplainableRecommendation['data_used'] = [];
  if (context.ndvi) dataUsed.push({ factor: 'NDVI', value: context.ndvi.toString(), weight: 0.25 });
  if (context.soil?.n_status) dataUsed.push({ factor: 'Soil Nitrogen', value: context.soil.n_status, weight: 0.2 });
  if (context.weather) dataUsed.push({ factor: 'Weather', value: `${context.weather.temperature}°C, ${context.weather.humidity}%`, weight: 0.15 });
  if (context.stage) dataUsed.push({ factor: 'Growth Stage', value: `${context.stage} (${context.das} DAS)`, weight: 0.2 });
  if (context.pest_disease) dataUsed.push({ factor: 'Pest/Disease', value: `${context.pest_disease} (${context.severity})`, weight: 0.2 });
  
  return {
    recommendation_id: `EXP-${Date.now()}`,
    recommendation,
    reasoning_chain: reasoningChain,
    scientific_basis: scientificBasis,
    expected_outcome: template.expected_outcome_template,
    risk_if_ignored: template.risk_template,
    confidence_level: confidenceLevel,
    confidence_explanation: getConfidenceExplanation(confidenceLevel),
    data_used: dataUsed,
    translations: generateTranslations(recommendation, template.expected_outcome_template, template.risk_template)
  };
}

/**
 * Generate generic explanation for unsupported recommendation types
 */
function generateGenericExplanation(recommendation: string, context: DecisionContext): ExplainableRecommendation {
  return {
    recommendation_id: `EXP-${Date.now()}`,
    recommendation,
    reasoning_chain: [
      {
        fact: `Crop: ${context.crop}, Stage: ${context.stage} (${context.das} DAS)`,
        rule: 'General agronomic principles applied',
        conclusion: 'Recommendation generated based on available data',
        confidence: 0.7
      }
    ],
    scientific_basis: SCIENTIFIC_SOURCES['ICAR_WHEAT'],
    expected_outcome: 'Improved crop health and productivity',
    risk_if_ignored: 'Suboptimal crop performance possible',
    confidence_level: 70,
    confidence_explanation: 'Moderate confidence based on available data',
    data_used: [
      { factor: 'Growth Stage', value: `${context.stage} (${context.das} DAS)`, weight: 0.5 }
    ]
  };
}

/**
 * Get confidence explanation text
 */
function getConfidenceExplanation(confidence: number): string {
  if (confidence >= 90) return 'Very high confidence based on strong data signals and proven scientific principles';
  if (confidence >= 80) return 'High confidence with good data support from multiple sources';
  if (confidence >= 70) return 'Moderate-high confidence, some data points may need verification';
  if (confidence >= 60) return 'Moderate confidence, recommend field verification';
  return 'Lower confidence due to limited data, use as general guidance';
}

/**
 * Generate Hindi/Marathi translations
 */
function generateTranslations(
  recommendation: string,
  expectedOutcome: string,
  riskIfIgnored: string
): ExplainableRecommendation['translations'] {
  // Simplified translations - in production, use proper translation service
  return {
    hi: {
      recommendation: `सिफारिश: ${recommendation}`,
      reasoning_summary: 'यह सिफारिश वैज्ञानिक सिद्धांतों और आपके खेत के आंकड़ों पर आधारित है',
      expected_outcome: `अपेक्षित परिणाम: ${expectedOutcome}`,
      risk_if_ignored: `अनदेखा करने पर जोखिम: ${riskIfIgnored}`
    },
    mr: {
      recommendation: `शिफारस: ${recommendation}`,
      reasoning_summary: 'ही शिफारस वैज्ञानिक तत्त्वांवर आणि आपल्या शेताच्या माहितीवर आधारित आहे',
      expected_outcome: `अपेक्षित परिणाम: ${expectedOutcome}`,
      risk_if_ignored: `दुर्लक्ष केल्यास धोका: ${riskIfIgnored}`
    }
  };
}

/**
 * Generate human-readable explanation summary
 */
export function generateReadableSummary(explanation: ExplainableRecommendation): string {
  const lines: string[] = [];
  
  lines.push(`📋 **Recommendation:** ${explanation.recommendation}`);
  lines.push('');
  lines.push(`**Why this recommendation?**`);
  
  for (let i = 0; i < explanation.reasoning_chain.length; i++) {
    const step = explanation.reasoning_chain[i];
    lines.push(`${i + 1}. **Observation:** ${step.fact}`);
    lines.push(`   **Principle:** ${step.rule}`);
    lines.push(`   **Conclusion:** ${step.conclusion}`);
  }
  
  lines.push('');
  lines.push(`🎯 **Expected Outcome:** ${explanation.expected_outcome}`);
  lines.push(`⚠️ **Risk if Ignored:** ${explanation.risk_if_ignored}`);
  lines.push('');
  lines.push(`📊 **Confidence:** ${explanation.confidence_level}% - ${explanation.confidence_explanation}`);
  lines.push('');
  lines.push(`📚 **Source:** ${explanation.scientific_basis.source} - ${explanation.scientific_basis.reference}`);
  
  return lines.join('\n');
}

/**
 * Compare multiple recommendations
 */
export function compareRecommendations(
  recommendations: ExplainableRecommendation[]
): {
  best_option: ExplainableRecommendation;
  comparison: Array<{
    recommendation_id: string;
    confidence: number;
    pros: string[];
    cons: string[];
  }>;
} {
  const sorted = [...recommendations].sort((a, b) => b.confidence_level - a.confidence_level);
  
  return {
    best_option: sorted[0],
    comparison: sorted.map(rec => ({
      recommendation_id: rec.recommendation_id,
      confidence: rec.confidence_level,
      pros: rec.reasoning_chain
        .filter(step => step.confidence > 0.8)
        .map(step => step.conclusion),
      cons: rec.reasoning_chain
        .filter(step => step.confidence < 0.7)
        .map(step => step.conclusion)
    }))
  };
}
