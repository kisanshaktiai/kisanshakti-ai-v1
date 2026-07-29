// DIAGNOSTIC ESCALATION RESPONSE GENERATOR

import type {
  DiagnosticEscalationData,
  DiagnosticHypothesis,
  RequiredInput
} from './authority-types.ts';

export const DIAGNOSTIC_ESCALATION_GENERATOR_VERSION = '1.0.0';

// INPUT TYPES

export interface DiagnosticEscalationInput {
  language: string;
  crop_name: string;
  crop_name_local?: string;
  growth_stage: string;
  days_since_sowing?: number;
  
  // Symptoms that triggered this escalation
  symptom_keys: string[];
  
  // Rules that partially matched (provide hypotheses)
  matched_rules?: Array<{
    rule_id: string;
    cause_code: string;
    cause_name?: string;
    category?: string;
    confidence: number;
    matching_conditions: string[];
    missing_conditions: string[];
    potential_treatments?: string[];
  }>;
  
  // What data is missing to increase confidence
  missing_data?: string[];
  
  // Current confidence level
  current_confidence: number;
  
  // Threshold needed for treatment
  treatment_threshold?: number;
}

// TEMPLATES

// English-only templates — LLM narration layer handles localization at runtime
const TEMPLATES = {
  en: {
    greeting: 'Hello',
    diagnostic_intro: 'Analysis of symptoms observed in your {crop_name} ({days} days, {stage} stage):',
    hypotheses_header: '🔍 Possible Causes:',
    hypothesis_template: '{index}. **{cause_name}** (Likelihood: {confidence}%)\n   {explanation}',
    evidence_header: '   ✓ Matching symptoms: {evidence}',
    confirm_header: '   📌 To confirm: {confirm}',
    required_inputs_header: '📸 To complete diagnosis, provide:',
    photo_request: '📷 **Take Photo**: {target}\n   Why: {rationale}',
    photo_guidance: '   💡 Tip: {guidance}',
    severity_request: '📊 **Severity Assessment**: {target}',
    distribution_request: '🗺️ **Distribution Pattern**: {target}',
    interim_monitoring: '⏳ **Meanwhile, monitor**:',
    confidence_note: '⚡ Current confidence: {current}% | Treatment threshold: {threshold}%',
    take_photo_cta: '📷 Take Photo',
    expert_note: 'Once we have more information, we can provide accurate diagnosis and treatment.'
  },
  /** @deprecated Use 'en' — LLM translates at runtime */
  get mr() { return this.en; },
  /** @deprecated Use 'en' — LLM translates at runtime */
  get hi() { return this.en; }
};

// CAUSE NAME TRANSLATIONS

// English-only cause names — LLM narration layer translates to local farming terms at runtime
const CAUSE_NAMES: Record<string, Record<string, string>> = {
  APHID_INFESTATION: { en: 'Aphid Infestation' },
  WHITEFLY_ATTACK: { en: 'Whitefly Attack' },
  THRIPS_DAMAGE: { en: 'Thrips Damage' },
  BORER_INFESTATION: { en: 'Stem Borer' },
  MITE_INFESTATION: { en: 'Mite Infestation' },
  CATERPILLAR_DAMAGE: { en: 'Caterpillar Damage' },
  FUNGAL_INFECTION: { en: 'Fungal Infection' },
  RUST_DISEASE: { en: 'Rust Disease' },
  BLIGHT_DISEASE: { en: 'Blight Disease' },
  POWDERY_MILDEW: { en: 'Powdery Mildew' },
  WILT_DISEASE: { en: 'Wilt Disease' },
  NITROGEN_DEFICIENCY: { en: 'Nitrogen Deficiency' },
  PHOSPHORUS_DEFICIENCY: { en: 'Phosphorus Deficiency' },
  POTASSIUM_DEFICIENCY: { en: 'Potassium Deficiency' },
  IRON_DEFICIENCY: { en: 'Iron Deficiency' },
  ZINC_DEFICIENCY: { en: 'Zinc Deficiency' },
  WATER_STRESS: { en: 'Water Stress' },
  HEAT_STRESS: { en: 'Heat Stress' },
  WIND_DAMAGE: { en: 'Wind Damage' }
};

// EXPLANATION TEMPLATES

// English-only explanations — LLM uses local farming terms at runtime
const EXPLANATIONS: Record<string, Record<string, string>> = {
  APHID_INFESTATION: { en: 'Aphids are small, soft-bodied insects that suck plant sap. Usually found on the underside of leaves.' },
  THRIPS_DAMAGE: { en: 'Thrips are very tiny insects that cause silvery patches on leaves. They damage tender leaves more.' },
  NITROGEN_DEFICIENCY: { en: 'Nitrogen deficiency causes lower, older leaves to turn yellow. The crop appears light green overall.' },
  RUST_DISEASE: { en: 'Rust disease causes orange-brown pustules to appear on leaves.' }
};

// PHOTO GUIDANCE BY SYMPTOM

// English-only photo guidance — LLM translates at runtime
const PHOTO_GUIDANCE: Record<string, Record<string, { what: string; angle: string; lighting: string }>> = {
  INSECT_VISIBLE: {
    en: { what: 'Close-up of the insect', angle: 'Very close to the insect', lighting: 'Morning light is best' }
  },
  LEAF_DAMAGE: {
    en: { what: 'Damaged leaf', angle: 'Top and underside of leaf', lighting: 'Take in shade' }
  },
  YELLOWING: {
    en: { what: 'Yellow leaf', angle: 'Full leaf visible', lighting: 'In natural light' }
  },
  SPOTS: {
    en: { what: 'Close-up of spots', angle: 'Spots clearly visible', lighting: 'In good light' }
  }
};

// MAIN GENERATOR FUNCTION

export function generateDiagnosticEscalationData(input: DiagnosticEscalationInput): DiagnosticEscalationData {
  const { 
    language, 
    crop_name, 
    growth_stage, 
    days_since_sowing,
    symptom_keys,
    matched_rules = [],
    current_confidence,
    treatment_threshold = 0.7
  } = input;
  
  // Build hypotheses from matched rules
  const hypotheses: DiagnosticHypothesis[] = matched_rules
    .slice(0, 3) // Max 3 hypotheses for clarity
    .map((rule, index) => {
      const causeCode = rule.cause_code || 'UNKNOWN';
      const category = detectCategory(causeCode);
      
      return {
        cause_code: causeCode,
        cause_name: getCauseName(causeCode, language),
        category,
        confidence: rule.confidence,
        supporting_evidence: rule.matching_conditions || [],
        confirming_evidence: getConfirmingEvidence(causeCode, category),
        ruling_out_evidence: getRulingOutEvidence(causeCode, category),
        explanation: getExplanation(causeCode, language),
        potential_treatments: rule.potential_treatments || []
      };
    });
  
  // Build required inputs based on what's missing
  const required_inputs: RequiredInput[] = buildRequiredInputs(
    symptom_keys,
    matched_rules,
    hypotheses,
    language
  );
  
  // Determine if photo is the primary recommendation
  const photoRecommended = required_inputs.some(i => i.type === 'PHOTO' && i.priority === 'HIGH');
  
  // Build diagnostic summary
  const diagnostic_summary = buildDiagnosticSummary(hypotheses, language, crop_name);
  
  // Build interim monitoring advice
  const interim_monitoring = buildInterimMonitoring(hypotheses, language);
  
  return {
    hypotheses,
    required_inputs,
    current_confidence,
    threshold_for_treatment: treatment_threshold,
    diagnostic_summary,
    interim_monitoring,
    escalation_reason: `Symptoms matched ${hypotheses.length} possible cause(s) but confidence (${Math.round(current_confidence * 100)}%) below treatment threshold (${Math.round(treatment_threshold * 100)}%)`,
    photo_recommended: photoRecommended,
    created_at: new Date().toISOString()
  };
}

// RESPONSE TEXT GENERATOR

export function generateDiagnosticEscalationResponse(
  escalation: DiagnosticEscalationData,
  input: DiagnosticEscalationInput
): string {
  const { language, crop_name, crop_name_local, growth_stage, days_since_sowing } = input;
  const t = TEMPLATES[language] || TEMPLATES.en;
  
  const lines: string[] = [];
  
  // Intro
  const cropDisplay = crop_name_local || crop_name;
  lines.push(t.diagnostic_intro
    .replace('{crop_name}', cropDisplay)
    .replace('{days}', String(days_since_sowing || '?'))
    .replace('{stage}', growth_stage || '?')
  );
  lines.push('');
  
  // Hypotheses section
  if (escalation.hypotheses.length > 0) {
    lines.push(t.hypotheses_header);
    lines.push('');
    
    escalation.hypotheses.forEach((h, index) => {
      // Main hypothesis line
      lines.push(t.hypothesis_template
        .replace('{index}', String(index + 1))
        .replace('{cause_name}', h.cause_name)
        .replace('{confidence}', String(Math.round(h.confidence * 100)))
      );
      
      // Supporting evidence
      if (h.supporting_evidence.length > 0) {
        lines.push(t.evidence_header.replace('{evidence}', h.supporting_evidence.slice(0, 2).join(', ')));
      }
      
      // What would confirm
      if (h.confirming_evidence.length > 0) {
        lines.push(t.confirm_header.replace('{confirm}', h.confirming_evidence[0]));
      }
      
      lines.push('');
    });
  }
  
  // Required inputs section
  if (escalation.required_inputs.length > 0) {
    lines.push(t.required_inputs_header);
    lines.push('');
    
    const highPriorityInputs = escalation.required_inputs.filter(i => i.priority === 'HIGH');
    
    for (const input of highPriorityInputs) {
      if (input.type === 'PHOTO') {
        lines.push(t.photo_request
          .replace('{target}', input.target)
          .replace('{rationale}', input.rationale)
        );
        if (input.photo_guidance) {
          lines.push(t.photo_guidance.replace('{guidance}', input.photo_guidance.what_to_capture));
        }
      } else if (input.type === 'SEVERITY_ASSESSMENT') {
        lines.push(t.severity_request.replace('{target}', input.target));
      } else if (input.type === 'DISTRIBUTION_PATTERN') {
        lines.push(t.distribution_request.replace('{target}', input.target));
      }
      lines.push('');
    }
  }
  
  // Interim monitoring
  if (escalation.interim_monitoring.length > 0) {
    lines.push(t.interim_monitoring);
    escalation.interim_monitoring.forEach(m => {
      lines.push(`• ${m}`);
    });
    lines.push('');
  }
  
  // Confidence note
  lines.push(t.confidence_note
    .replace('{current}', String(Math.round(escalation.current_confidence * 100)))
    .replace('{threshold}', String(Math.round(escalation.threshold_for_treatment * 100)))
  );
  lines.push('');
  
  // Expert note
  lines.push(`💡 ${t.expert_note}`);
  
  return lines.join('\n');
}

// HELPER FUNCTIONS

function detectCategory(causeCode: string): DiagnosticHypothesis['category'] {
  const code = causeCode.toUpperCase();
  if (code.includes('APHID') || code.includes('THRIP') || code.includes('MITE') || 
      code.includes('BORER') || code.includes('CATERPILLAR') || code.includes('WHITEFLY') ||
      code.includes('FLY') || code.includes('INSECT') || code.includes('PEST')) {
    return 'PEST';
  }
  if (code.includes('RUST') || code.includes('BLIGHT') || code.includes('MILDEW') || 
      code.includes('WILT') || code.includes('FUNGAL') || code.includes('DISEASE') ||
      code.includes('BACTERIAL') || code.includes('VIRAL')) {
    return 'DISEASE';
  }
  if (code.includes('NITROGEN') || code.includes('PHOSPHORUS') || code.includes('POTASSIUM') || 
      code.includes('IRON') || code.includes('ZINC') || code.includes('DEFICIENCY') ||
      code.includes('NUTRIENT')) {
    return 'NUTRIENT';
  }
  if (code.includes('WATER') || code.includes('HEAT') || code.includes('WIND') || 
      code.includes('STRESS') || code.includes('FROST')) {
    return 'ENVIRONMENTAL';
  }
  return 'MULTIPLE';
}

function getCauseName(causeCode: string, language: string): string {
  const names = CAUSE_NAMES[causeCode];
  if (names) {
    return names[language] || names.en || causeCode;
  }
  // Fallback: humanize the code
  return causeCode.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

function getExplanation(causeCode: string, language: string): string {
  const explanations = EXPLANATIONS[causeCode];
  if (explanations) {
    return explanations[language] || explanations.en || '';
  }
  return '';
}

function getConfirmingEvidence(causeCode: string, category: string): string[] {
  switch (category) {
    case 'PEST':
      return ['Live insects visible', 'Eggs or larvae present', 'Characteristic feeding pattern'];
    case 'DISEASE':
      return ['Lesions with distinct margins', 'Spreading pattern visible', 'Spore production visible'];
    case 'NUTRIENT':
      return ['Uniform pattern across field', 'Soil test results', 'Response to foliar application'];
    case 'ENVIRONMENTAL':
      return ['Weather data correlation', 'Uniform field damage', 'No pathogen/pest signs'];
    default:
      return ['Visual confirmation', 'Additional symptoms'];
  }
}

function getRulingOutEvidence(causeCode: string, category: string): string[] {
  switch (category) {
    case 'PEST':
      return ['No insects found after careful inspection', 'Damage pattern inconsistent with insect feeding'];
    case 'DISEASE':
      return ['No spreading pattern', 'No pathogen signs under magnification'];
    case 'NUTRIENT':
      return ['Localized damage only', 'Soil test shows adequate levels'];
    case 'ENVIRONMENTAL':
      return ['No weather event correlation', 'Patchy pattern suggests biotic cause'];
    default:
      return ['Visual evidence contradicts hypothesis'];
  }
}

function buildRequiredInputs(
  symptom_keys: string[],
  matched_rules: DiagnosticEscalationInput['matched_rules'],
  hypotheses: DiagnosticHypothesis[],
  language: string
): RequiredInput[] {
  const inputs: RequiredInput[] = [];
  const t = TEMPLATES[language] || TEMPLATES.en;
  
  // Always recommend photo for pest/disease hypotheses
  const hasPestOrDisease = hypotheses.some(h => h.category === 'PEST' || h.category === 'DISEASE');
  
  if (hasPestOrDisease) {
    // Find relevant photo guidance
    let photoTarget = 'affected part of the plant';
    let photoGuidance = PHOTO_GUIDANCE['LEAF_DAMAGE']?.[language];
    
    if (symptom_keys.some(s => s.includes('INSECT') || s.includes('FLYING') || s.includes('CRAWLING'))) {
      photoTarget = 'the insect and affected area';
      photoGuidance = PHOTO_GUIDANCE['INSECT_VISIBLE']?.[language];
    } else if (symptom_keys.some(s => s.includes('SPOT') || s.includes('LESION'))) {
      photoTarget = 'the spots/lesions on the leaf';
      photoGuidance = PHOTO_GUIDANCE['SPOTS']?.[language];
    } else if (symptom_keys.some(s => s.includes('YELLOW'))) {
      photoTarget = 'the yellowing leaves';
      photoGuidance = PHOTO_GUIDANCE['YELLOWING']?.[language];
    }
    
    inputs.push({
      type: 'PHOTO',
      target: photoTarget,
      rationale: 'Visual confirmation helps identify the exact cause and severity',
      priority: 'HIGH',
      ui_hint: 'camera',
      photo_guidance: photoGuidance ? {
        what_to_capture: photoGuidance.what,
        angle_suggestion: photoGuidance.angle,
        lighting_tip: photoGuidance.lighting
      } : undefined
    });
  }
  
  // Add severity assessment if not already known
  if (!symptom_keys.some(s => s.includes('SEVERE') || s.includes('MILD') || s.includes('MODERATE'))) {
    inputs.push({
      type: 'SEVERITY_ASSESSMENT',
      target: 'What percentage of plants are affected?',
      rationale: 'Severity determines urgency and treatment approach',
      priority: 'MEDIUM',
      ui_hint: 'selector'
    });
  }
  
  // Add distribution pattern if not known
  if (!symptom_keys.some(s => s.includes('UNIFORM') || s.includes('PATCHY') || s.includes('EDGE'))) {
    inputs.push({
      type: 'DISTRIBUTION_PATTERN',
      target: 'Is the damage uniform, patchy, or at field edges?',
      rationale: 'Pattern helps distinguish biotic vs abiotic causes',
      priority: 'MEDIUM',
      ui_hint: 'selector'
    });
  }
  
  return inputs;
}

function buildDiagnosticSummary(hypotheses: DiagnosticHypothesis[], language: string, cropName: string): string {
  if (hypotheses.length === 0) {
    const templates = {
      mr: `${cropName} पिकातील लक्षणांचे विश्लेषण सुरू आहे.`,
      hi: `${cropName} फसल में लक्षणों का विश्लेषण जारी है।`,
      en: `Analyzing symptoms in ${cropName} crop.`
    };
    return templates[language] || templates.en;
  }
  
  const topCauses = hypotheses.slice(0, 2).map(h => h.cause_name).join(' or ');
  const templates = {
    mr: `लक्षणे ${topCauses} दर्शवतात. पुष्टीकरणासाठी अधिक माहिती आवश्यक.`,
    hi: `लक्षण ${topCauses} की ओर इशारा करते हैं। पुष्टि के लिए और जानकारी चाहिए।`,
    en: `Symptoms suggest ${topCauses}. More information needed for confirmation.`
  };
  return templates[language] || templates.en;
}

function buildInterimMonitoring(hypotheses: DiagnosticHypothesis[], language: string): string[] {
  const monitoring: string[] = [];
  
  const templates = {
    mr: {
      spread: 'लक्षणांचा प्रसार होत आहे का ते पहा',
      newSymptoms: 'नवीन लक्षणे दिसत आहेत का निरीक्षण करा',
      insects: 'सकाळी लवकर किड्यांची तपासणी करा',
      weather: 'हवामान बदलाचे परिणाम पहा'
    },
    hi: {
      spread: 'देखें कि लक्षण फैल रहे हैं या नहीं',
      newSymptoms: 'नए लक्षणों पर नजर रखें',
      insects: 'सुबह जल्दी कीटों की जाँच करें',
      weather: 'मौसम बदलाव का प्रभाव देखें'
    },
    en: {
      spread: 'Monitor if symptoms are spreading',
      newSymptoms: 'Watch for new symptoms',
      insects: 'Check for insects early morning',
      weather: 'Observe effects of weather changes'
    }
  };
  
  const t = templates[language] || templates.en;
  
  // Always include spread monitoring
  monitoring.push(t.spread);
  
  // Add category-specific monitoring
  const categories = new Set(hypotheses.map(h => h.category));
  
  if (categories.has('PEST')) {
    monitoring.push(t.insects);
  }
  
  if (categories.has('ENVIRONMENTAL')) {
    monitoring.push(t.weather);
  }
  
  if (monitoring.length < 2) {
    monitoring.push(t.newSymptoms);
  }
  
  return monitoring;
}

// Export for testing
export { TEMPLATES, CAUSE_NAMES, EXPLANATIONS, PHOTO_GUIDANCE };
