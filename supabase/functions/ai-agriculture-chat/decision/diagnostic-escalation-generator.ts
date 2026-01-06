/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC ESCALATION RESPONSE GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Generates expert-quality explanatory responses when:
 * - Crop and stage are known
 * - Specific symptom is identified
 * - Diagnosis needs one more signal (photo, severity, distribution)
 * 
 * KEY PRINCIPLE: "Agronomists don't say 'just watch it' - they say 
 * 'this could be X, Y, or Z, and here's what I need to know next to confirm.'"
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type {
  DiagnosticEscalationData,
  DiagnosticHypothesis,
  RequiredInput
} from './authority-types.ts';

export const DIAGNOSTIC_ESCALATION_GENERATOR_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// INPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticEscalationInput {
  language: 'mr' | 'hi' | 'en';
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

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATES = {
  mr: {
    greeting: 'नमस्कार',
    diagnostic_intro: 'तुमच्या {crop_name} पिकात ({days} दिवस, {stage} अवस्था) आढळलेल्या लक्षणांचे विश्लेषण:',
    hypotheses_header: '🔍 संभाव्य कारणे:',
    hypothesis_template: '{index}. **{cause_name}** (शक्यता: {confidence}%)\n   {explanation}',
    evidence_header: '   ✓ जुळणारी लक्षणे: {evidence}',
    confirm_header: '   📌 खात्री करण्यासाठी: {confirm}',
    required_inputs_header: '📸 निदान पूर्ण करण्यासाठी खालील माहिती द्या:',
    photo_request: '📷 **फोटो काढा**: {target}\n   कारण: {rationale}',
    photo_guidance: '   💡 टिप: {guidance}',
    severity_request: '📊 **तीव्रता सांगा**: {target}',
    distribution_request: '🗺️ **वितरण नमुना**: {target}',
    interim_monitoring: '⏳ **तोपर्यंत निरीक्षण करा**:',
    confidence_note: '⚡ सध्याची खात्री: {current}% | उपचारासाठी आवश्यक: {threshold}%',
    take_photo_cta: '📷 फोटो काढा',
    expert_note: 'अधिक माहिती मिळाल्यावर अचूक निदान व उपचार सुचवता येईल.'
  },
  hi: {
    greeting: 'नमस्ते',
    diagnostic_intro: 'आपकी {crop_name} फसल ({days} दिन, {stage} अवस्था) में दिखे लक्षणों का विश्लेषण:',
    hypotheses_header: '🔍 संभावित कारण:',
    hypothesis_template: '{index}. **{cause_name}** (संभावना: {confidence}%)\n   {explanation}',
    evidence_header: '   ✓ मिलते-जुलते लक्षण: {evidence}',
    confirm_header: '   📌 पुष्टि के लिए: {confirm}',
    required_inputs_header: '📸 निदान पूर्ण करने के लिए यह जानकारी दें:',
    photo_request: '📷 **फोटो लें**: {target}\n   कारण: {rationale}',
    photo_guidance: '   💡 टिप: {guidance}',
    severity_request: '📊 **गंभीरता बताएं**: {target}',
    distribution_request: '🗺️ **वितरण पैटर्न**: {target}',
    interim_monitoring: '⏳ **तब तक निगरानी करें**:',
    confidence_note: '⚡ वर्तमान विश्वास: {current}% | उपचार के लिए आवश्यक: {threshold}%',
    take_photo_cta: '📷 फोटो लें',
    expert_note: 'अधिक जानकारी मिलने पर सटीक निदान और उपचार सुझाव दिया जा सकता है।'
  },
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
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE NAME TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const CAUSE_NAMES: Record<string, Record<string, string>> = {
  // Pests
  APHID_INFESTATION: { mr: 'मावा (Aphid)', hi: 'माहू (Aphid)', en: 'Aphid Infestation' },
  WHITEFLY_ATTACK: { mr: 'पांढरी माशी', hi: 'सफेद मक्खी', en: 'Whitefly Attack' },
  THRIPS_DAMAGE: { mr: 'तुडतुडे (Thrips)', hi: 'थ्रिप्स', en: 'Thrips Damage' },
  BORER_INFESTATION: { mr: 'खोडकिडा', hi: 'तना छेदक', en: 'Stem Borer' },
  MITE_INFESTATION: { mr: 'कोळी (Mites)', hi: 'मकड़ी (Mites)', en: 'Mite Infestation' },
  CATERPILLAR_DAMAGE: { mr: 'अळी', hi: 'इल्ली', en: 'Caterpillar Damage' },
  
  // Diseases
  FUNGAL_INFECTION: { mr: 'बुरशीजन्य रोग', hi: 'फफूंद रोग', en: 'Fungal Infection' },
  RUST_DISEASE: { mr: 'तांबेरा रोग', hi: 'गेरुआ रोग', en: 'Rust Disease' },
  BLIGHT_DISEASE: { mr: 'करपा रोग', hi: 'झुलसा रोग', en: 'Blight Disease' },
  POWDERY_MILDEW: { mr: 'भुरी', hi: 'चूर्णिल आसिता', en: 'Powdery Mildew' },
  WILT_DISEASE: { mr: 'मर रोग', hi: 'उकठा रोग', en: 'Wilt Disease' },
  
  // Nutrients
  NITROGEN_DEFICIENCY: { mr: 'नत्र कमतरता', hi: 'नाइट्रोजन की कमी', en: 'Nitrogen Deficiency' },
  PHOSPHORUS_DEFICIENCY: { mr: 'स्फुरद कमतरता', hi: 'फॉस्फोरस की कमी', en: 'Phosphorus Deficiency' },
  POTASSIUM_DEFICIENCY: { mr: 'पालाश कमतरता', hi: 'पोटाश की कमी', en: 'Potassium Deficiency' },
  IRON_DEFICIENCY: { mr: 'लोह कमतरता', hi: 'लोहे की कमी', en: 'Iron Deficiency' },
  ZINC_DEFICIENCY: { mr: 'जस्त कमतरता', hi: 'जिंक की कमी', en: 'Zinc Deficiency' },
  
  // Environmental
  WATER_STRESS: { mr: 'पाण्याचा ताण', hi: 'जल तनाव', en: 'Water Stress' },
  HEAT_STRESS: { mr: 'उष्णतेचा ताण', hi: 'गर्मी का तनाव', en: 'Heat Stress' },
  WIND_DAMAGE: { mr: 'वाऱ्याचे नुकसान', hi: 'हवा से नुकसान', en: 'Wind Damage' }
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPLANATION TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const EXPLANATIONS: Record<string, Record<string, string>> = {
  APHID_INFESTATION: {
    mr: 'मावा हे लहान, मऊ शरीराचे कीटक आहेत जे पानांचा रस शोषतात. साधारणपणे पानांच्या खालच्या बाजूस आढळतात.',
    hi: 'माहू छोटे, मुलायम शरीर वाले कीट हैं जो पत्तियों का रस चूसते हैं। आमतौर पर पत्तियों के नीचे पाए जाते हैं।',
    en: 'Aphids are small, soft-bodied insects that suck plant sap. Usually found on the underside of leaves.'
  },
  THRIPS_DAMAGE: {
    mr: 'तुडतुडे हे अत्यंत लहान कीटक आहेत जे पानांवर चांदी रंगाचे डाग करतात. कोवळ्या पानांना जास्त नुकसान करतात.',
    hi: 'थ्रिप्स बहुत छोटे कीट हैं जो पत्तियों पर चाँदी जैसे धब्बे बनाते हैं। कोमल पत्तियों को ज्यादा नुकसान करते हैं।',
    en: 'Thrips are very tiny insects that cause silvery patches on leaves. They damage tender leaves more.'
  },
  NITROGEN_DEFICIENCY: {
    mr: 'नत्राच्या कमतरतेमुळे खालच्या जुन्या पानांचा रंग पिवळा होतो. पिक फिकट हिरवे दिसते.',
    hi: 'नाइट्रोजन की कमी से नीचे की पुरानी पत्तियाँ पीली हो जाती हैं। फसल हल्की हरी दिखती है।',
    en: 'Nitrogen deficiency causes lower, older leaves to turn yellow. The crop appears light green overall.'
  },
  RUST_DISEASE: {
    mr: 'तांबेरा रोगामुळे पानांवर नारंगी-तपकिरी रंगाचे पुस्ट्यूल (pustules) दिसतात.',
    hi: 'गेरुआ रोग से पत्तियों पर नारंगी-भूरे रंग के पस्ट्यूल (pustules) दिखते हैं।',
    en: 'Rust disease causes orange-brown pustules to appear on leaves.'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO GUIDANCE BY SYMPTOM
// ═══════════════════════════════════════════════════════════════════════════

const PHOTO_GUIDANCE: Record<string, Record<string, { what: string; angle: string; lighting: string }>> = {
  INSECT_VISIBLE: {
    mr: { what: 'किड्याचा जवळून फोटो', angle: 'किड्याच्या अगदी जवळून', lighting: 'सकाळचा प्रकाश उत्तम' },
    hi: { what: 'कीट का नजदीकी फोटो', angle: 'कीट के बिल्कुल पास से', lighting: 'सुबह की रोशनी सबसे अच्छी' },
    en: { what: 'Close-up of the insect', angle: 'Very close to the insect', lighting: 'Morning light is best' }
  },
  LEAF_DAMAGE: {
    mr: { what: 'खराब झालेले पान', angle: 'पानाच्या वरून आणि खालून', lighting: 'सावलीत काढा' },
    hi: { what: 'क्षतिग्रस्त पत्ता', angle: 'पत्ते के ऊपर और नीचे से', lighting: 'छाया में लें' },
    en: { what: 'Damaged leaf', angle: 'Top and underside of leaf', lighting: 'Take in shade' }
  },
  YELLOWING: {
    mr: { what: 'पिवळे पडलेले पान', angle: 'पूर्ण पान दिसेल असे', lighting: 'नैसर्गिक प्रकाशात' },
    hi: { what: 'पीला पड़ा पत्ता', angle: 'पूरा पत्ता दिखे ऐसा', lighting: 'प्राकृतिक रोशनी में' },
    en: { what: 'Yellow leaf', angle: 'Full leaf visible', lighting: 'In natural light' }
  },
  SPOTS: {
    mr: { what: 'डागांचा जवळून फोटो', angle: 'डाग स्पष्ट दिसतील असे', lighting: 'चांगल्या प्रकाशात' },
    hi: { what: 'धब्बों का नजदीकी फोटो', angle: 'धब्बे साफ दिखें ऐसा', lighting: 'अच्छी रोशनी में' },
    en: { what: 'Close-up of spots', angle: 'Spots clearly visible', lighting: 'In good light' }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GENERATOR FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE TEXT GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

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
