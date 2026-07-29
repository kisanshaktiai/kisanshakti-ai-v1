// AGENT 1B: VISUAL INTELLIGENCE AGENT - CORE LOGIC

import {
  VisualAgentInput,
  VisualAgentOutput,
  ImageQualityAssessment,
  VisualDetections,
  ContextualValidation,
  SeverityQuantification,
  ConfidenceAssessment,
  IntegratedDiagnosis,
  ImageUsability,
  QualityStatus,
  SeverityLevel,
  DetectedPest,
  DetectedDisease,
  DetectedSymptom,
  DetectedBeneficialInsect,
  RawAIAnalysisResult,
  PEST_ECONOMIC_THRESHOLDS,
  DISEASE_SEVERITY_THRESHOLDS,
  SuspectedIssue
} from './visual-agent-types.ts';

export const VISUAL_AGENT_VERSION = '3.0.1';

// MAIN PROCESSING FUNCTION

// Process visual input and generate comprehensive analysis
export async function processVisualAgent(
  input: VisualAgentInput,
  rawAnalysis?: RawAIAnalysisResult
): Promise<VisualAgentOutput> {
  const startTime = Date.now();
  
  console.log('🔬 [Visual Agent] Starting visual analysis...');
  console.log(`   Crop: ${input.crop_context.crop_code}, Stage: ${input.crop_context.crop_stage}`);
  console.log(`   Suspected issues from text: ${input.text_context.suspected_issues_from_text.length}`);
  
  // Step 1: Assess image quality
  const imageQuality = assessImageQuality(input.image_data);
  console.log(`   Image quality: ${imageQuality.overall_usability} (${(imageQuality.quality_score * 100).toFixed(0)}%)`);
  
  // If image is unusable, return early with retake request
  if (imageQuality.overall_usability === 'UNUSABLE') {
    return createRetakeResponse(input, imageQuality, startTime);
  }
  
  // Step 2: Process visual detections (from AI analysis or simulated)
  const visualDetections = processVisualDetections(rawAnalysis, input);
  console.log(`   Detected: ${visualDetections.pests.length} pests, ${visualDetections.diseases.length} diseases`);
  
  // Step 3: Validate against text context
  const contextualValidation = validateAgainstTextContext(
    visualDetections,
    input.text_context
  );
  console.log(`   Text-visual agreement: ${(contextualValidation.overall_agreement_score * 100).toFixed(0)}%`);
  
  // Step 4: Quantify severity
  const severityQuantification = quantifySeverity(
    visualDetections,
    input.crop_context
  );
  
  // Step 5: Assess confidence
  const confidenceAssessment = assessConfidence(
    imageQuality,
    visualDetections,
    contextualValidation
  );
  
  // Step 6: Create integrated diagnosis
  const integratedDiagnosis = createIntegratedDiagnosis(
    visualDetections,
    severityQuantification,
    contextualValidation,
    input.crop_context
  );
  
  const processingTime = Date.now() - startTime;
  console.log(`✅ [Visual Agent] Analysis complete in ${processingTime}ms`);
  
  return {
    analysis_metadata: {
      agent: 'AGENT_1B_VISUAL_INTELLIGENCE',
      version: VISUAL_AGENT_VERSION,
      analysis_timestamp: new Date().toISOString(),
      processing_time_ms: processingTime,
      model_versions: {
        pest_detection: 'vision-model-v1',
        disease_classification: 'disease-classifier-v1',
        quality_assessment: 'quality-check-v1'
      }
    },
    image_quality: imageQuality,
    visual_detections: visualDetections,
    contextual_validation: contextualValidation,
    severity_quantification: severityQuantification,
    confidence_assessment: confidenceAssessment,
    integrated_diagnosis: integratedDiagnosis,
    recommendation_to_next_agent: determineNextAction(
      confidenceAssessment,
      integratedDiagnosis,
      imageQuality
    )
  };
}

// STEP 1: IMAGE QUALITY ASSESSMENT

function assessImageQuality(imageData: VisualAgentInput['image_data']): ImageQualityAssessment {
  // In production, this would use actual image analysis
  // For now, we'll simulate based on metadata and heuristics
  
  const metadata = imageData.capture_metadata;
  let qualityScore = 0.75; // Default moderate quality
  const issues: string[] = [];
  
  // Resolution check
  let resolutionStatus: QualityStatus = 'GOOD';
  let width = 1920;
  let height = 1080;
  
  if (metadata?.camera_settings?.resolution) {
    const [w, h] = metadata.camera_settings.resolution.split('x').map(Number);
    width = w || 1920;
    height = h || 1080;
  }
  
  if (width < 800 || height < 600) {
    resolutionStatus = 'UNUSABLE';
    qualityScore -= 0.4;
    issues.push('Resolution too low for analysis');
  } else if (width < 1280 || height < 720) {
    resolutionStatus = 'ACCEPTABLE';
    qualityScore -= 0.1;
  } else if (width >= 1920) {
    resolutionStatus = 'EXCELLENT';
    qualityScore += 0.05;
  }
  
  // Simulate sharpness score (in production, use Laplacian variance)
  const sharpnessScore = 75 + Math.random() * 20;
  let sharpnessStatus: QualityStatus = 'GOOD';
  let sharpnessIssue: string | undefined;
  
  if (sharpnessScore < 50) {
    sharpnessStatus = 'POOR';
    sharpnessIssue = 'Image appears blurry - details unclear';
    qualityScore -= 0.2;
  } else if (sharpnessScore < 70) {
    sharpnessStatus = 'ACCEPTABLE';
    sharpnessIssue = 'Slight blur on edges';
    qualityScore -= 0.05;
  }
  
  // Lighting assessment (simulated)
  const lightingStatus: QualityStatus = 'GOOD';
  const lightingIssues: string[] = [];
  
  // Determine overall usability
  let overallUsability: ImageUsability = 'USABLE';
  if (qualityScore < 0.4) {
    overallUsability = 'UNUSABLE';
  } else if (qualityScore < 0.65) {
    overallUsability = 'MARGINAL';
  }
  
  return {
    overall_usability: overallUsability,
    quality_score: Math.max(0, Math.min(1, qualityScore)),
    resolution: {
      pixels: `${width}x${height}`,
      width,
      height,
      status: resolutionStatus
    },
    sharpness: {
      score: sharpnessScore,
      status: sharpnessStatus,
      issue: sharpnessIssue
    },
    lighting: {
      status: lightingStatus,
      brightness_level: 'OPTIMAL',
      issues: lightingIssues
    },
    composition: {
      subject_visible: true,
      distance: 'OPTIMAL',
      angle: 'GOOD',
      critical_area_visible: true
    },
      retake_recommendation: {
        needed: overallUsability === 'UNUSABLE',
        priority: overallUsability === 'UNUSABLE' ? 'HIGH' : null,
        reason: overallUsability === 'UNUSABLE' ? issues.join('; ') : null,
        instructions_en: overallUsability === 'UNUSABLE'
          ? 'Please retake photo:\n1. Closer (15-20cm)\n2. In sunlight\n3. Of affected area\n4. Hold phone steady'
          : undefined
      }
  };
}

// STEP 2: VISUAL DETECTION PROCESSING

function processVisualDetections(
  rawAnalysis: RawAIAnalysisResult | undefined,
  input: VisualAgentInput
): VisualDetections {
  const pests: DetectedPest[] = [];
  const diseases: DetectedDisease[] = [];
  const symptoms: DetectedSymptom[] = [];
  const beneficial_insects: DetectedBeneficialInsect[] = [];
  
  if (rawAnalysis) {
    // Process detected pests
    if (rawAnalysis.pests_detected) {
      for (const pest of rawAnalysis.pests_detected) {
        pests.push(mapRawPestToDetection(pest, input));
      }
    }
    
    // Process detected diseases
    if (rawAnalysis.diseases_detected) {
      for (const disease of rawAnalysis.diseases_detected) {
        diseases.push(mapRawDiseaseToDetection(disease, input));
      }
    }
    
    // Process symptoms
    if (rawAnalysis.symptoms_observed) {
      for (const symptom of rawAnalysis.symptoms_observed) {
        symptoms.push(mapRawSymptomToDetection(symptom));
      }
    }
    
    // Process beneficial insects
    if (rawAnalysis.beneficial_insects) {
      for (const beneficial of rawAnalysis.beneficial_insects) {
        beneficial_insects.push(mapRawBeneficialToDetection(beneficial));
      }
    }
  } else {
    // Use text context suspected issues to create detections with lower confidence
    for (const issue of input.text_context.suspected_issues_from_text) {
      if (issue.type === 'PEST') {
        pests.push(createPestFromSuspectedIssue(issue));
      } else if (issue.type === 'DISEASE') {
        diseases.push(createDiseaseFromSuspectedIssue(issue));
      }
    }
  }
  
  return {
    pests,
    diseases,
    symptoms,
    beneficial_insects,
    nutrient_deficiencies: processNutrientDeficiencies(rawAnalysis),
    water_stress_indicators: processWaterStress(rawAnalysis)
  };
}

function mapRawPestToDetection(
  raw: NonNullable<RawAIAnalysisResult['pests_detected']>[0],
  input: VisualAgentInput
): DetectedPest {
  const pestCode = normalizePestCode(raw.name);
  const pestNames = getPestLocalNames(pestCode);
  
  return {
    pest_code: pestCode,
    common_name: raw.name,
    common_name_mr: pestNames.mr,
    common_name_hi: pestNames.hi,
    scientific_name: raw.scientific_name,
    confidence: raw.confidence || 0.7,
    count_visible: raw.count || 10,
    density_per_leaf: raw.count ? Math.ceil(raw.count / 3) : undefined, // Estimate
    life_stages_present: parseLifeStages(raw.life_stage),
    distribution: 'CLUSTERED',
    location_in_image: [],
    color: undefined,
    size_mm: undefined
  };
}

function mapRawDiseaseToDetection(
  raw: NonNullable<RawAIAnalysisResult['diseases_detected']>[0],
  input: VisualAgentInput
): DetectedDisease {
  const diseaseCode = normalizeDiseaseCode(raw.name);
  const diseaseNames = getDiseaseLocalNames(diseaseCode);
  
  return {
    disease_code: diseaseCode,
    common_name: raw.name,
    common_name_mr: diseaseNames.mr,
    common_name_hi: diseaseNames.hi,
    disease_type: parseDiseaseType(raw.type),
    confidence: raw.confidence || 0.7,
    severity: mapSeverityLevel(raw.severity || 'moderate'),
    progression_stage: 'MODERATE',
    area_affected_percent: raw.area_percent || 20,
    location_in_image: [],
    characteristic_symptoms: []
  };
}

function mapRawSymptomToDetection(
  raw: NonNullable<RawAIAnalysisResult['symptoms_observed']>[0]
): DetectedSymptom {
  return {
    symptom_code: normalizeSymptomCode(raw.symptom),
    symptom_name: raw.symptom,
    severity: mapSeverityLevel(raw.severity || 'moderate'),
    confidence: 0.8,
    affected_plant_part: parseAffectedPart(raw.location),
    affected_area_bbox: { x: 0, y: 0, width: 100, height: 100, confidence: 0.7 }
  };
}

function mapRawBeneficialToDetection(
  raw: NonNullable<RawAIAnalysisResult['beneficial_insects']>[0]
): DetectedBeneficialInsect {
  const code = normalizeBeneficialCode(raw.name);
  
  return {
    code,
    common_name: raw.name,
    common_name_mr: getBeneficialLocalName(code, 'mr'),
    count: raw.count || 1,
    confidence: 0.75,
    significance: 'Natural predator present',
    impact_on_treatment: raw.count >= 3 
      ? 'Consider IPM approach - beneficial population significant'
      : 'Present but insufficient for biological control'
  };
}

function createPestFromSuspectedIssue(issue: SuspectedIssue): DetectedPest {
  const pestNames = getPestLocalNames(issue.code);
  
  return {
    pest_code: issue.code,
    common_name: issue.code.replace(/_/g, ' ').toLowerCase(),
    common_name_mr: issue.local_name || pestNames.mr,
    common_name_hi: pestNames.hi,
    confidence: issue.confidence_from_text * 0.6, // Lower confidence without visual
    count_visible: 0,
    life_stages_present: ['ADULT'],
    distribution: 'SCATTERED',
    location_in_image: []
  };
}

function createDiseaseFromSuspectedIssue(issue: SuspectedIssue): DetectedDisease {
  const diseaseNames = getDiseaseLocalNames(issue.code);
  
  return {
    disease_code: issue.code,
    common_name: issue.code.replace(/_/g, ' ').toLowerCase(),
    common_name_mr: issue.local_name || diseaseNames.mr,
    common_name_hi: diseaseNames.hi,
    disease_type: 'FUNGAL',
    confidence: issue.confidence_from_text * 0.6,
    severity: 'MODERATE',
    progression_stage: 'MODERATE',
    area_affected_percent: 20,
    location_in_image: [],
    characteristic_symptoms: []
  };
}

// STEP 3: CONTEXTUAL VALIDATION

function validateAgainstTextContext(
  detections: VisualDetections,
  textContext: VisualAgentInput['text_context']
): ContextualValidation {
  const textReported = textContext.symptoms_reported || [];
  const visualConfirmed: string[] = [];
  const additionalFound: string[] = [];
  let agreementScore = 0.5; // Base score
  
  // Check pest agreement
  let pestAgreement = undefined;
  const textPests = textContext.suspected_issues_from_text.filter(i => i.type === 'PEST');
  
  if (textPests.length > 0 && detections.pests.length > 0) {
    const textPestCode = textPests[0].code;
    const visualPest = detections.pests[0];
    const matches = visualPest.pest_code.toLowerCase().includes(textPestCode.toLowerCase()) ||
                   textPestCode.toLowerCase().includes(visualPest.pest_code.toLowerCase());
    
    pestAgreement = {
      text_suspected: textPestCode,
      visual_confirmed: matches ? visualPest.pest_code : null,
      agreement: matches,
      confidence_increase: matches ? 0.15 : -0.1,
      final_confidence: matches ? Math.min(0.95, visualPest.confidence + 0.15) : visualPest.confidence
    };
    
    agreementScore += matches ? 0.2 : -0.1;
  }
  
  // Check disease agreement
  let diseaseAgreement = undefined;
  const textDiseases = textContext.suspected_issues_from_text.filter(i => i.type === 'DISEASE');
  
  if (textDiseases.length > 0 && detections.diseases.length > 0) {
    const textDiseaseCode = textDiseases[0].code;
    const visualDisease = detections.diseases[0];
    const matches = visualDisease.disease_code.toLowerCase().includes(textDiseaseCode.toLowerCase()) ||
                   textDiseaseCode.toLowerCase().includes(visualDisease.disease_code.toLowerCase());
    
    diseaseAgreement = {
      text_suspected: textDiseaseCode,
      visual_confirmed: matches ? visualDisease.disease_code : null,
      agreement: matches,
      confidence_increase: matches ? 0.15 : -0.1,
      final_confidence: matches ? Math.min(0.95, visualDisease.confidence + 0.15) : visualDisease.confidence
    };
    
    agreementScore += matches ? 0.2 : -0.1;
  }
  
  // Check symptom matches
  for (const symptom of detections.symptoms) {
    const symptomLower = symptom.symptom_code.toLowerCase();
    const foundInText = textReported.some(t => 
      t.toLowerCase().includes(symptomLower) || 
      symptomLower.includes(t.toLowerCase())
    );
    
    if (foundInText) {
      visualConfirmed.push(symptom.symptom_name);
      agreementScore += 0.05;
    } else {
      additionalFound.push(symptom.symptom_name);
    }
  }
  
  // Check for new findings not in text
  const newFindings = [];
  
  for (const pest of detections.pests) {
    const inText = textPests.some(t => 
      t.code.toLowerCase() === pest.pest_code.toLowerCase()
    );
    if (!inText && pest.confidence > 0.6) {
      newFindings.push({
        finding: pest.common_name,
        finding_code: pest.pest_code,
        type: 'PEST' as const,
        severity: 'MODERATE' as SeverityLevel,
        confidence: pest.confidence,
        requires_separate_action: true,
        impact: 'NEGATIVE' as const
      });
    }
  }
  
  for (const beneficial of detections.beneficial_insects) {
    newFindings.push({
      finding: beneficial.common_name,
      finding_code: beneficial.code,
      type: 'BENEFICIAL' as const,
      severity: 'MILD' as SeverityLevel,
      confidence: beneficial.confidence,
      requires_separate_action: false,
      impact: 'POSITIVE' as const
    });
  }
  
  return {
    text_visual_agreement: {
      pest_identification: pestAgreement,
      disease_identification: diseaseAgreement,
      symptoms: {
        text_reported: textReported,
        visual_confirmed: visualConfirmed,
        additional_found: additionalFound,
        all_confirmed: textReported.length > 0 && visualConfirmed.length === textReported.length
      }
    },
    contradictions: [],
    new_findings: newFindings,
    overall_agreement_score: Math.max(0, Math.min(1, agreementScore))
  };
}

// STEP 4: SEVERITY QUANTIFICATION

function quantifySeverity(
  detections: VisualDetections,
  cropContext: VisualAgentInput['crop_context']
): SeverityQuantification {
  const symptomSeverity: Record<string, { percent_affected: number; severity: SeverityLevel }> = {};
  
  // Process symptom severities
  for (const symptom of detections.symptoms) {
    symptomSeverity[symptom.symptom_code] = {
      percent_affected: 30, // Default estimate
      severity: symptom.severity
    };
  }
  
  // Calculate pest severity
  let pestSeverity = undefined;
  if (detections.pests.length > 0) {
    const primaryPest = detections.pests[0];
    const threshold = PEST_ECONOMIC_THRESHOLDS[primaryPest.pest_code] || PEST_ECONOMIC_THRESHOLDS.DEFAULT;
    const density = primaryPest.density_per_leaf || primaryPest.count_visible / 3;
    
    pestSeverity = {
      density_per_leaf: {
        count: density,
        unit: 'per leaf',
        sample_size: '3 leaves visible'
      },
      economic_threshold: {
        threshold_value: threshold,
        unit: 'per leaf',
        current_value: density,
        threshold_exceeded: density > threshold,
        action_required: density > threshold,
        urgency: density > threshold * 2 ? 'IMMEDIATE' : density > threshold ? 'WITHIN_24H' : 'MONITOR'
      },
      infestation_pattern: primaryPest.distribution,
      severity_category: determinePestSeverity(density, threshold),
      visible_damage_percent: Math.min(100, density * 2),
      damage_type: ['Sap sucking', 'Leaf damage']
    };
  }
  
  // Calculate disease severity
  let diseaseSeverity = undefined;
  if (detections.diseases.length > 0) {
    const primaryDisease = detections.diseases[0];
    
    diseaseSeverity = {
      area_affected_percent: primaryDisease.area_affected_percent,
      progression_stage: primaryDisease.progression_stage,
      spread_pattern: primaryDisease.area_affected_percent > 30 ? 'WIDESPREAD' : 'ISOLATED',
      severity_category: primaryDisease.severity,
      tissue_damage_type: primaryDisease.characteristic_symptoms
    };
  }
  
  // Overall crop health assessment
  let healthAssessment: 'HEALTHY' | 'MILD_STRESS' | 'STRESSED' | 'SEVERE_STRESS' | 'CRITICAL' = 'HEALTHY';
  
  if (pestSeverity?.economic_threshold.threshold_exceeded || 
      (diseaseSeverity?.area_affected_percent || 0) > 30) {
    healthAssessment = 'STRESSED';
  }
  if ((pestSeverity?.severity_category === 'HIGH' || pestSeverity?.severity_category === 'SEVERE') ||
      (diseaseSeverity?.severity_category === 'HIGH' || diseaseSeverity?.severity_category === 'SEVERE')) {
    healthAssessment = 'SEVERE_STRESS';
  }
  
  return {
    pest_severity: pestSeverity,
    disease_severity: diseaseSeverity,
    symptom_severity: symptomSeverity,
    overall_crop_health: {
      assessment: healthAssessment,
      visible_vigor: healthAssessment === 'HEALTHY' ? 'GOOD' : 
                     healthAssessment === 'MILD_STRESS' ? 'GOOD' : 'REDUCED',
      color_assessment: healthAssessment === 'HEALTHY' ? 'Normal green' : 'Slightly pale',
      estimated_yield_impact_percent: healthAssessment === 'HEALTHY' ? 0 :
                                       healthAssessment === 'MILD_STRESS' ? 5 :
                                       healthAssessment === 'STRESSED' ? 15 :
                                       healthAssessment === 'SEVERE_STRESS' ? 30 : 50
    }
  };
}

function determinePestSeverity(density: number, threshold: number): SeverityLevel {
  const ratio = density / threshold;
  if (ratio < 0.5) return 'MILD';
  if (ratio < 1) return 'MODERATE';
  if (ratio < 2) return 'MODERATE_TO_HIGH';
  if (ratio < 3) return 'HIGH';
  return 'SEVERE';
}

// STEP 5: CONFIDENCE ASSESSMENT

function assessConfidence(
  imageQuality: ImageQualityAssessment,
  detections: VisualDetections,
  contextValidation: ContextualValidation
): ConfidenceAssessment {
  const imageQualityScore = imageQuality.quality_score;
  
  // Calculate pest ID confidence
  const pestIdConfidence = detections.pests.length > 0
    ? detections.pests.reduce((sum, p) => sum + p.confidence, 0) / detections.pests.length
    : 0;
  
  // Calculate disease ID confidence
  const diseaseIdConfidence = detections.diseases.length > 0
    ? detections.diseases.reduce((sum, d) => sum + d.confidence, 0) / detections.diseases.length
    : 0;
  
  // Calculate severity confidence
  const severityConfidence = 0.8; // Base confidence for severity assessment
  
  // Determine modifiers
  const textVisualAgreement = contextValidation.overall_agreement_score > 0.7 ? 0.10 : 
                              contextValidation.overall_agreement_score > 0.5 ? 0.05 : -0.05;
  const imageQualityDeduction = imageQuality.quality_score < 0.7 ? -0.10 : 0;
  const multipleEvidence = detections.pests.length > 0 && detections.symptoms.length > 0 ? 0.05 : 0;
  
  const overallConfidence = Math.max(0, Math.min(1,
    (imageQualityScore * 0.2) +
    (pestIdConfidence * 0.3) +
    (diseaseIdConfidence * 0.2) +
    (severityConfidence * 0.15) +
    (contextValidation.overall_agreement_score * 0.15) +
    textVisualAgreement + multipleEvidence
  ));
  
  const uncertaintyAreas = [];
  
  if (pestIdConfidence < 0.75 && detections.pests.length > 0) {
    uncertaintyAreas.push({
      aspect: 'Pest species identification',
      confidence: pestIdConfidence,
      possible_alternatives: ['Similar pest species may look alike'],
      note: 'Visual confirmation helps but exact species may vary',
      requires_expert: pestIdConfidence < 0.6
    });
  }
  
  if (diseaseIdConfidence < 0.75 && detections.diseases.length > 0) {
    uncertaintyAreas.push({
      aspect: 'Disease identification',
      confidence: diseaseIdConfidence,
      possible_alternatives: ['Multiple diseases show similar symptoms'],
      note: 'Lab confirmation recommended for precise diagnosis',
      requires_expert: diseaseIdConfidence < 0.6
    });
  }
  
  return {
    overall_confidence: overallConfidence,
    confidence_breakdown: {
      image_quality: imageQualityScore,
      pest_identification: pestIdConfidence || 0,
      disease_identification: diseaseIdConfidence || 0,
      severity_assessment: severityConfidence,
      contextual_match: contextValidation.overall_agreement_score
    },
    uncertainty_areas: uncertaintyAreas,
    confidence_modifiers: {
      text_visual_agreement: textVisualAgreement,
      image_quality_deduction: imageQualityDeduction,
      multiple_evidence_sources: multipleEvidence,
      context_match: contextValidation.overall_agreement_score > 0.6 ? 0.05 : 0,
      final_confidence: overallConfidence
    },
    requires_expert_verification: overallConfidence < 0.6,
    requires_better_photo: imageQuality.overall_usability === 'MARGINAL'
  };
}

// STEP 6: INTEGRATED DIAGNOSIS

function createIntegratedDiagnosis(
  detections: VisualDetections,
  severity: SeverityQuantification,
  contextValidation: ContextualValidation,
  cropContext: VisualAgentInput['crop_context']
): IntegratedDiagnosis {
  // Determine primary issue
  let primaryIssue = null;
  
  if (detections.pests.length > 0 && severity.pest_severity?.economic_threshold.threshold_exceeded) {
    const pest = detections.pests[0];
    primaryIssue = {
      type: 'PEST' as const,
      code: pest.pest_code,
      name: pest.common_name,
      name_mr: pest.common_name_mr,
      name_hi: pest.common_name_hi,
      confidence: pest.confidence,
      requires_immediate_action: severity.pest_severity!.economic_threshold.action_required,
      action_urgency: severity.pest_severity!.economic_threshold.urgency
    };
  } else if (detections.diseases.length > 0) {
    const disease = detections.diseases[0];
    const urgent = disease.severity === 'HIGH' || disease.severity === 'SEVERE';
    primaryIssue = {
      type: 'DISEASE' as const,
      code: disease.disease_code,
      name: disease.common_name,
      name_mr: disease.common_name_mr,
      name_hi: disease.common_name_hi,
      confidence: disease.confidence,
      requires_immediate_action: urgent,
      action_urgency: urgent ? 'WITHIN_24H' : 'WITHIN_WEEK'
    };
  }
  
  // Gather secondary issues
  const secondaryIssues = [];
  
  // Add secondary diseases
  for (let i = 1; i < detections.diseases.length; i++) {
    const disease = detections.diseases[i];
    secondaryIssues.push({
      type: 'DISEASE' as const,
      code: disease.disease_code,
      name: disease.common_name,
      confidence: disease.confidence,
      relationship: disease.secondary_to || 'Independent issue',
      action: disease.secondary_to ? 'May resolve when primary issue controlled' : 'Needs separate treatment'
    });
  }
  
  // Add secondary pests
  for (let i = 1; i < detections.pests.length; i++) {
    const pest = detections.pests[i];
    secondaryIssues.push({
      type: 'PEST' as const,
      code: pest.pest_code,
      name: pest.common_name,
      confidence: pest.confidence,
      relationship: 'Additional pest infestation',
      action: 'Monitor and treat if threshold exceeded'
    });
  }
  
  // Positive indicators
  const positiveIndicators = [];
  for (const beneficial of detections.beneficial_insects) {
    positiveIndicators.push({
      type: 'BENEFICIAL_INSECT' as const,
      description: `${beneficial.common_name} (${beneficial.count} found)`,
      impact: beneficial.significance,
      treatment_consideration: 'Prefer selective pesticides to preserve beneficial population'
    });
  }
  
  // Generate summaries
  const primaryName = primaryIssue?.name || 'Unknown issue';
  const primaryNameMr = primaryIssue?.name_mr || primaryName;
  const primaryNameHi = primaryIssue?.name_hi || primaryName;
  
  return {
    primary_issue: primaryIssue,
    secondary_issues: secondaryIssues,
    contributing_factors: [],
    positive_indicators: positiveIndicators,
    diagnosis_summary_mr: primaryIssue
      ? `${cropContext.crop_code} पिकावर ${primaryNameMr} दिसत आहे. ${severity.pest_severity?.economic_threshold.threshold_exceeded ? 'आर्थिक मर्यादा ओलांडली.' : ''}`
      : 'फोटो विश्लेषणातून निश्चित समस्या ओळखता आली नाही.',
    diagnosis_summary_hi: primaryIssue
      ? `${cropContext.crop_code} फसल पर ${primaryNameHi} पाया गया। ${severity.pest_severity?.economic_threshold.threshold_exceeded ? 'आर्थिक सीमा पार।' : ''}`
      : 'फोटो विश्लेषण से निश्चित समस्या पहचानी नहीं गई।',
    diagnosis_summary_en: primaryIssue
      ? `${primaryName} detected on ${cropContext.crop_code}. ${severity.pest_severity?.economic_threshold.threshold_exceeded ? 'Economic threshold exceeded.' : ''}`
      : 'Photo analysis did not identify a definite issue.'
  };
}

// HELPER FUNCTIONS

function createRetakeResponse(
  input: VisualAgentInput,
  imageQuality: ImageQualityAssessment,
  startTime: number
): VisualAgentOutput {
  return {
    analysis_metadata: {
      agent: 'AGENT_1B_VISUAL_INTELLIGENCE',
      version: VISUAL_AGENT_VERSION,
      analysis_timestamp: new Date().toISOString(),
      processing_time_ms: Date.now() - startTime
    },
    image_quality: imageQuality,
    visual_detections: {
      pests: [],
      diseases: [],
      symptoms: [],
      beneficial_insects: [],
      nutrient_deficiencies: []
    },
    contextual_validation: {
      text_visual_agreement: {
        symptoms: { text_reported: [], visual_confirmed: [], additional_found: [], all_confirmed: false }
      },
      contradictions: [],
      new_findings: [],
      overall_agreement_score: 0
    },
    severity_quantification: {
      symptom_severity: {},
      overall_crop_health: {
        assessment: 'HEALTHY',
        visible_vigor: 'GOOD',
        color_assessment: 'Cannot assess - image unusable'
      }
    },
    confidence_assessment: {
      overall_confidence: 0,
      confidence_breakdown: {
        image_quality: imageQuality.quality_score,
        pest_identification: 0,
        disease_identification: 0,
        severity_assessment: 0,
        contextual_match: 0
      },
      uncertainty_areas: [{
        aspect: 'Entire analysis',
        confidence: 0,
        possible_alternatives: [],
        note: 'Image quality too poor for analysis',
        requires_expert: false
      }],
      confidence_modifiers: {
        text_visual_agreement: 0,
        image_quality_deduction: -1,
        multiple_evidence_sources: 0,
        context_match: 0,
        final_confidence: 0
      },
      requires_expert_verification: false,
      requires_better_photo: true
    },
    integrated_diagnosis: {
      primary_issue: null,
      secondary_issues: [],
      contributing_factors: [],
      positive_indicators: [],
      diagnosis_summary_en: 'Photo is not clear. Please retake photo.'
    },
    recommendation_to_next_agent: {
      proceed_to: 'RETAKE_PHOTO',
      confidence_sufficient: false,
      visual_confirmation_complete: false,
      additional_clarification_needed: false
    }
  };
}

function determineNextAction(
  confidence: ConfidenceAssessment,
  diagnosis: IntegratedDiagnosis,
  imageQuality: ImageQualityAssessment
): VisualAgentOutput['recommendation_to_next_agent'] {
  if (imageQuality.overall_usability === 'UNUSABLE') {
    return {
      proceed_to: 'RETAKE_PHOTO',
      confidence_sufficient: false,
      visual_confirmation_complete: false,
      additional_clarification_needed: false
    };
  }
  
  if (confidence.requires_expert_verification) {
    return {
      proceed_to: 'EXPERT_CONSULTATION',
      confidence_sufficient: false,
      visual_confirmation_complete: true,
      additional_clarification_needed: true
    };
  }
  
  if (confidence.overall_confidence >= 0.7 && diagnosis.primary_issue) {
    return {
      proceed_to: 'AGENT_3_DECISION_BRAIN',
      confidence_sufficient: true,
      visual_confirmation_complete: true,
      additional_clarification_needed: false
    };
  }
  
  return {
    proceed_to: 'AGENT_2_DIAGNOSTIC_FLOW',
    confidence_sufficient: confidence.overall_confidence >= 0.5,
    visual_confirmation_complete: true,
    additional_clarification_needed: confidence.overall_confidence < 0.7
  };
}

// Normalization helpers (English-only codes; Devanagari removed - use crop_vocabulary DB)
function normalizePestCode(name: string): string {
  const normalized = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const mappings: Record<string, string> = {
    'APHID': 'APHID',
    'APHIS': 'APHID',
    'WHITEFLY': 'WHITEFLY',
    'JASSID': 'JASSID',
    'THRIPS': 'THRIPS',
    'BOLLWORM': 'BOLLWORM',
    'MEALYBUG': 'MEALYBUG',
    'MITE': 'MITE',
    'BORER': 'BORER'
  };
  return mappings[normalized] || normalized;
}

function normalizeDiseaseCode(name: string): string {
  const normalized = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const mappings: Record<string, string> = {
    'RUST': 'RUST',
    'BLIGHT': 'BLIGHT',
    'WILT': 'WILT',
    'POWDERY_MILDEW': 'POWDERY_MILDEW',
    'SOOTY_MOLD': 'SOOTY_MOLD',
    'LEAF_SPOT': 'LEAF_SPOT'
  };
  return mappings[normalized] || normalized;
}

function normalizeSymptomCode(symptom: string): string {
  return symptom.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

function normalizeBeneficialCode(name: string): string {
  const mappings: Record<string, string> = {
    'LADYBIRD': 'LADYBIRD_BEETLE',
    'LADYBUG': 'LADYBIRD_BEETLE',
    'LACEWING': 'LACEWING',
    'SPIDER': 'SPIDER',
    'PARASITIC_WASP': 'PARASITIC_WASP'
  };
  return mappings[name.toUpperCase()] || name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

// Local name functions removed - use observation_translations DB via i18n cache
// getPestLocalNames, getDiseaseLocalNames, getBeneficialLocalName are now DB-driven
function getPestLocalNames(code: string): { mr: string; hi: string } {
  // Return code as placeholder; actual translations come from observation_translations DB
  return { mr: code, hi: code };
}

function getDiseaseLocalNames(code: string): { mr: string; hi: string } {
  return { mr: code, hi: code };
}

function getBeneficialLocalName(code: string, _lang: 'mr' | 'hi'): string {
  return code;
}

function parseLifeStages(stage?: string): Array<'EGG' | 'LARVA' | 'NYMPH' | 'PUPA' | 'ADULT'> {
  if (!stage) return ['ADULT'];
  const stageUpper = stage.toUpperCase();
  const stages: Array<'EGG' | 'LARVA' | 'NYMPH' | 'PUPA' | 'ADULT'> = [];
  if (stageUpper.includes('EGG')) stages.push('EGG');
  if (stageUpper.includes('LARVA')) stages.push('LARVA');
  if (stageUpper.includes('NYMPH')) stages.push('NYMPH');
  if (stageUpper.includes('PUPA')) stages.push('PUPA');
  if (stageUpper.includes('ADULT') || stages.length === 0) stages.push('ADULT');
  return stages;
}

function parseDiseaseType(type: string): 'FUNGAL' | 'BACTERIAL' | 'VIRAL' | 'PHYSIOLOGICAL' {
  const typeUpper = type.toUpperCase();
  if (typeUpper.includes('FUNG')) return 'FUNGAL';
  if (typeUpper.includes('BACT')) return 'BACTERIAL';
  if (typeUpper.includes('VIR')) return 'VIRAL';
  return 'PHYSIOLOGICAL';
}

function parseAffectedPart(location?: string): 'LEAVES' | 'STEM' | 'ROOTS' | 'FLOWERS' | 'FRUITS' | 'WHOLE_PLANT' {
  if (!location) return 'LEAVES';
  const loc = location.toLowerCase();
  if (loc.includes('stem')) return 'STEM';
  if (loc.includes('root')) return 'ROOTS';
  if (loc.includes('flower')) return 'FLOWERS';
  if (loc.includes('fruit')) return 'FRUITS';
  if (loc.includes('whole') || loc.includes('plant')) return 'WHOLE_PLANT';
  return 'LEAVES';
}

function mapSeverityLevel(severity: string): SeverityLevel {
  const sev = severity.toLowerCase();
  if (sev.includes('mild') || sev.includes('low')) return 'MILD';
  if (sev.includes('high') || sev.includes('severe')) return 'HIGH';
  if (sev.includes('critical')) return 'CRITICAL';
  return 'MODERATE';
}

function processNutrientDeficiencies(rawAnalysis?: RawAIAnalysisResult) {
  if (!rawAnalysis?.nutrient_issues) return [];
  
  return rawAnalysis.nutrient_issues.map(issue => ({
    nutrient: issue.nutrient.toUpperCase() as any,
    confidence: 0.7,
    visual_indicators: [],
    severity: mapSeverityLevel(issue.deficiency_level),
    affected_leaves: 'ALL' as const
  }));
}

function processWaterStress(rawAnalysis?: RawAIAnalysisResult) {
  // Check if water stress is indicated in symptoms
  const waterStressKeywords = ['wilt', 'drought', 'water stress', 'dry'];
  
  if (rawAnalysis?.symptoms_observed) {
    for (const symptom of rawAnalysis.symptoms_observed) {
      if (waterStressKeywords.some(kw => symptom.symptom.toLowerCase().includes(kw))) {
        return {
          present: true,
          type: 'DROUGHT' as const,
          severity: mapSeverityLevel(symptom.severity || 'moderate'),
          confidence: 0.7
        };
      }
    }
  }
  
  return undefined;
}

// Export version constant
export { VISUAL_AGENT_VERSION as VERSION };
