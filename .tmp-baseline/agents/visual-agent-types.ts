// AGENT 1B: VISUAL INTELLIGENCE AGENT - TYPE DEFINITIONS

// INPUT SCHEMA

export interface VisualAgentInput {
  image_data: ImageData;
  text_context: TextContext;
  crop_context: CropContext;
  diagnostic_goals: DiagnosticGoals;
}

export interface ImageData {
  source: 'base64_encoded' | 'url' | 'file_path';
  data: string; // base64 or URL
  format: 'JPEG' | 'PNG' | 'HEIC' | 'WEBP';
  capture_metadata?: CaptureMetadata;
}

export interface CaptureMetadata {
  timestamp: string;
  gps_coordinates?: {
    latitude: number;
    longitude: number;
  };
  device_info?: string;
  camera_settings?: {
    resolution: string;
    focal_length?: number;
  };
}

export interface TextContext {
  farmer_description: string;
  suspected_issues_from_text: SuspectedIssue[];
  symptoms_reported: string[];
}

export interface SuspectedIssue {
  type: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'STRESS';
  code: string;
  confidence_from_text: number;
  local_name?: string;
}

export interface CropContext {
  crop_code: string;
  crop_variety?: string;
  crop_stage: string;
  days_after_sowing?: number;
  land_id?: string;
}

export interface DiagnosticGoals {
  primary: string;
  secondary?: string;
  specific_requirements: string[];
}

// IMAGE QUALITY ASSESSMENT

export type ImageUsability = 'USABLE' | 'MARGINAL' | 'UNUSABLE';
export type QualityStatus = 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'UNUSABLE';

export interface ImageQualityAssessment {
  overall_usability: ImageUsability;
  quality_score: number; // 0-1
  resolution: {
    pixels: string;
    width: number;
    height: number;
    status: QualityStatus;
  };
  sharpness: {
    score: number; // 0-100
    status: QualityStatus;
    issue?: string;
  };
  lighting: {
    status: QualityStatus;
    brightness_level: 'TOO_DARK' | 'OPTIMAL' | 'TOO_BRIGHT';
    issues: string[];
  };
  composition: {
    subject_visible: boolean;
    distance: 'TOO_CLOSE' | 'OPTIMAL' | 'TOO_FAR';
    angle: QualityStatus;
    critical_area_visible: boolean;
  };
  retake_recommendation: {
    needed: boolean;
    priority: 'HIGH' | 'MEDIUM' | 'LOW' | null;
    reason: string | null;
    instructions_mr?: string;
    instructions_hi?: string;
    instructions_en?: string;
    example_photo_url?: string;
  };
}

// VISUAL DETECTIONS

export type LifeStage = 'EGG' | 'LARVA' | 'NYMPH' | 'PUPA' | 'ADULT';
export type Distribution = 'CLUSTERED' | 'SCATTERED' | 'WIDESPREAD' | 'LOCALIZED';
export type SeverityLevel = 'MILD' | 'MODERATE' | 'MODERATE_TO_HIGH' | 'HIGH' | 'SEVERE' | 'CRITICAL';
export type ProgressionStage = 'EARLY' | 'MODERATE' | 'ADVANCED' | 'SEVERE';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface DetectedPest {
  pest_code: string;
  common_name: string;
  common_name_mr?: string;
  common_name_hi?: string;
  scientific_name?: string;
  confidence: number;
  count_visible: number;
  density_per_leaf?: number;
  life_stages_present: LifeStage[];
  distribution: Distribution;
  location_in_image: BoundingBox[];
  color?: string;
  size_mm?: string;
  behavior_notes?: string;
}

export interface DetectedDisease {
  disease_code: string;
  common_name: string;
  common_name_mr?: string;
  common_name_hi?: string;
  scientific_name?: string;
  disease_type: 'FUNGAL' | 'BACTERIAL' | 'VIRAL' | 'PHYSIOLOGICAL';
  confidence: number;
  severity: SeverityLevel;
  progression_stage: ProgressionStage;
  area_affected_percent: number;
  location_in_image: BoundingBox[];
  characteristic_symptoms: string[];
  secondary_to?: string; // If caused by another issue
}

export interface DetectedSymptom {
  symptom_code: string;
  symptom_name: string;
  symptom_name_mr?: string;
  symptom_name_hi?: string;
  severity: SeverityLevel;
  confidence: number;
  affected_plant_part: 'LEAVES' | 'STEM' | 'ROOTS' | 'FLOWERS' | 'FRUITS' | 'WHOLE_PLANT';
  affected_area_bbox: BoundingBox;
  pattern?: string; // e.g., "interveinal", "marginal", "random spots"
  color_change?: string;
  texture_change?: string;
}

export interface DetectedBeneficialInsect {
  code: string;
  common_name: string;
  common_name_mr?: string;
  scientific_name?: string;
  count: number;
  confidence: number;
  significance: string;
  impact_on_treatment: string;
}

export interface NutrientDeficiencyIndicator {
  nutrient: 'N' | 'P' | 'K' | 'Ca' | 'Mg' | 'S' | 'Fe' | 'Mn' | 'Zn' | 'Cu' | 'B' | 'Mo';
  confidence: number;
  visual_indicators: string[];
  severity: SeverityLevel;
  affected_leaves: 'OLD' | 'NEW' | 'ALL';
}

export interface VisualDetections {
  pests: DetectedPest[];
  diseases: DetectedDisease[];
  symptoms: DetectedSymptom[];
  beneficial_insects: DetectedBeneficialInsect[];
  nutrient_deficiencies: NutrientDeficiencyIndicator[];
  water_stress_indicators?: {
    present: boolean;
    type: 'DROUGHT' | 'WATERLOGGING' | 'NONE';
    severity: SeverityLevel;
    confidence: number;
  };
}

// CONTEXTUAL VALIDATION

export interface TextVisualAgreement {
  pest_identification?: {
    text_suspected: string;
    visual_confirmed: string | null;
    agreement: boolean;
    confidence_increase: number;
    final_confidence: number;
  };
  disease_identification?: {
    text_suspected: string;
    visual_confirmed: string | null;
    agreement: boolean;
    confidence_increase: number;
    final_confidence: number;
  };
  symptoms: {
    text_reported: string[];
    visual_confirmed: string[];
    additional_found: string[];
    all_confirmed: boolean;
  };
}

export interface Contradiction {
  aspect: string;
  text_says: string;
  visual_shows: string;
  recommended_action: 'TRUST_VISUAL' | 'ASK_FARMER' | 'NEEDS_EXPERT';
  clarification_question_mr?: string;
  clarification_question_hi?: string;
  clarification_question_en?: string;
}

export interface NewVisualFinding {
  finding: string;
  finding_code: string;
  type: 'PEST' | 'DISEASE' | 'SYMPTOM' | 'BENEFICIAL' | 'STRESS';
  severity: SeverityLevel;
  confidence: number;
  likely_secondary_to?: string;
  requires_separate_action: boolean;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

export interface ContextualValidation {
  text_visual_agreement: TextVisualAgreement;
  contradictions: Contradiction[];
  new_findings: NewVisualFinding[];
  overall_agreement_score: number; // 0-1
}

// SEVERITY QUANTIFICATION

export interface EconomicThreshold {
  threshold_value: number;
  unit: string;
  current_value: number;
  threshold_exceeded: boolean;
  action_required: boolean;
  urgency: 'IMMEDIATE' | 'WITHIN_24H' | 'WITHIN_WEEK' | 'MONITOR';
}

export interface PestSeverityAssessment {
  density_per_leaf: {
    count: number;
    unit: string;
    sample_size: string;
  };
  economic_threshold: EconomicThreshold;
  infestation_pattern: string;
  severity_category: SeverityLevel;
  visible_damage_percent: number;
  damage_type: string[];
}

export interface DiseaseSeverityAssessment {
  area_affected_percent: number;
  progression_stage: ProgressionStage;
  spread_pattern: 'ISOLATED' | 'COALESCING' | 'WIDESPREAD';
  severity_category: SeverityLevel;
  tissue_damage_type: string[];
}

export interface SeverityQuantification {
  pest_severity?: PestSeverityAssessment;
  disease_severity?: DiseaseSeverityAssessment;
  symptom_severity: {
    [symptom_code: string]: {
      percent_affected: number;
      severity: SeverityLevel;
    };
  };
  overall_crop_health: {
    assessment: 'HEALTHY' | 'MILD_STRESS' | 'STRESSED' | 'SEVERE_STRESS' | 'CRITICAL';
    visible_vigor: 'GOOD' | 'REDUCED' | 'POOR';
    color_assessment: string;
    estimated_yield_impact_percent?: number;
  };
}

// CONFIDENCE ASSESSMENT

export interface UncertaintyArea {
  aspect: string;
  confidence: number;
  possible_alternatives: string[];
  note: string;
  requires_expert: boolean;
}

export interface ConfidenceModifiers {
  text_visual_agreement: number; // +/- adjustment
  image_quality_deduction: number;
  multiple_evidence_sources: number;
  context_match: number;
  final_confidence: number;
}

export interface ConfidenceAssessment {
  overall_confidence: number; // 0-1
  confidence_breakdown: {
    image_quality: number;
    pest_identification: number;
    disease_identification: number;
    severity_assessment: number;
    contextual_match: number;
  };
  uncertainty_areas: UncertaintyArea[];
  confidence_modifiers: ConfidenceModifiers;
  requires_expert_verification: boolean;
  requires_better_photo: boolean;
}

// INTEGRATED DIAGNOSIS

export interface PrimaryIssue {
  type: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'PHYSIOLOGICAL';
  code: string;
  name: string;
  name_mr?: string;
  name_hi?: string;
  confidence: number;
  requires_immediate_action: boolean;
  action_urgency: 'IMMEDIATE' | 'WITHIN_24H' | 'WITHIN_WEEK' | 'MONITOR';
}

export interface SecondaryIssue {
  type: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'PHYSIOLOGICAL';
  code: string;
  name: string;
  confidence: number;
  relationship: string; // e.g., "Caused by aphid honeydew"
  action: string; // e.g., "Will resolve when primary issue controlled"
}

export interface PositiveIndicator {
  type: 'BENEFICIAL_INSECT' | 'HEALTHY_TISSUE' | 'RECOVERY_SIGNS';
  description: string;
  impact: string;
  treatment_consideration?: string;
}

export interface IntegratedDiagnosis {
  primary_issue: PrimaryIssue | null;
  secondary_issues: SecondaryIssue[];
  contributing_factors: {
    type: string;
    symptom: string;
    confidence: number;
    note: string;
  }[];
  positive_indicators: PositiveIndicator[];
  diagnosis_summary_mr: string;
  diagnosis_summary_hi: string;
  diagnosis_summary_en: string;
}

// OUTPUT SCHEMA

export interface VisualAgentOutput {
  analysis_metadata: {
    agent: 'AGENT_1B_VISUAL_INTELLIGENCE';
    version: string;
    analysis_timestamp: string;
    processing_time_ms: number;
    model_versions?: {
      pest_detection?: string;
      disease_classification?: string;
      quality_assessment?: string;
    };
  };
  
  image_quality: ImageQualityAssessment;
  visual_detections: VisualDetections;
  contextual_validation: ContextualValidation;
  severity_quantification: SeverityQuantification;
  confidence_assessment: ConfidenceAssessment;
  integrated_diagnosis: IntegratedDiagnosis;
  
  recommendation_to_next_agent: {
    proceed_to: 'AGENT_2_DIAGNOSTIC_FLOW' | 'AGENT_3_DECISION_BRAIN' | 'RETAKE_PHOTO' | 'EXPERT_CONSULTATION';
    confidence_sufficient: boolean;
    visual_confirmation_complete: boolean;
    additional_clarification_needed: boolean;
    clarification_questions?: {
      question_mr: string;
      question_hi: string;
      question_en: string;
    }[];
  };
}

// PROCESSING INTERMEDIATE TYPES

export interface ImageAnalysisRequest {
  images: string[];
  cropCode: string;
  cropStage: string;
  textContext: string;
  suspectedIssues: SuspectedIssue[];
  language: string;
}

export interface RawAIAnalysisResult {
  crop_identified?: string;
  health_status?: string;
  confidence?: number;
  pests_detected?: Array<{
    name: string;
    scientific_name?: string;
    confidence: number;
    count?: number;
    life_stage?: string;
  }>;
  diseases_detected?: Array<{
    name: string;
    type: string;
    confidence: number;
    severity?: string;
    area_percent?: number;
  }>;
  symptoms_observed?: Array<{
    symptom: string;
    severity?: string;
    location?: string;
  }>;
  beneficial_insects?: Array<{
    name: string;
    count: number;
  }>;
  nutrient_issues?: Array<{
    nutrient: string;
    deficiency_level: string;
  }>;
  recommendations?: string[];
  severity_assessment?: {
    overall: string;
    threshold_exceeded?: boolean;
    action_required?: boolean;
  };
}

// Economic thresholds for common pests (per leaf)
export const PEST_ECONOMIC_THRESHOLDS: Record<string, number> = {
  'APHID': 10,
  'WHITEFLY': 5,
  'JASSID': 5,
  'THRIPS': 10,
  'MEALYBUG': 3,
  'BOLLWORM': 1,
  'SPOTTED_BOLLWORM': 1,
  'PINK_BOLLWORM': 1,
  'AMERICAN_BOLLWORM': 1,
  'SPODOPTERA': 1,
  'MITE': 8,
  'LEAF_MINER': 3,
  'BORER': 1,
  'DEFAULT': 10
};

// Disease severity thresholds (percent affected area)
export const DISEASE_SEVERITY_THRESHOLDS = {
  MILD: { min: 0, max: 15 },
  MODERATE: { min: 15, max: 35 },
  HIGH: { min: 35, max: 60 },
  SEVERE: { min: 60, max: 100 }
};
