// AGENT 1: NATURAL LANGUAGE UNDERSTANDING - TYPE DEFINITIONS v3.0

// INPUT SCHEMA

export interface NLUAgentInput {
  raw_input: string;
  input_metadata: InputMetadata;
  conversation_context: ConversationContext;
  land_context?: LandContext;
  environmental_context?: EnvironmentalContext;
}

export interface InputMetadata {
  language_detected: string;
  input_method: 'TEXT' | 'VOICE' | 'IMAGE_CAPTION';
  timestamp: string; // ISO_8601
  farmer_id?: string;
  session_id?: string;
  gps_location?: {
    latitude: number;
    longitude: number;
    accuracy_meters?: number;
  };
}

export interface ConversationContext {
  previous_turns: ConversationTurn[];
  session_state: 'NEW' | 'ONGOING' | 'CLARIFICATION' | 'PHOTO_WAIT';
}

export interface ConversationTurn {
  turn_number: number;
  farmer_input: string;
  system_response: string;
  timestamp: string;
  extracted_entities?: Record<string, unknown>;
}

export interface LandContext {
  land_id: string;
  crop_code: string;
  crop_variety?: string;
  sowing_date?: string;
  days_after_sowing?: number;
  crop_stage?: CropStage;
  land_size_acres?: number;
  soil_type?: SoilType;
  irrigation_type?: IrrigationType;
}

export type CropStage = 
  | 'GERMINATION' 
  | 'SEEDLING' 
  | 'VEGETATIVE' 
  | 'FLOWERING' 
  | 'FRUITING' 
  | 'MATURITY' 
  | 'HARVEST';

export type SoilType = 
  | 'BLACK' 
  | 'RED' 
  | 'ALLUVIAL' 
  | 'LATERITE' 
  | 'SANDY' 
  | 'CLAYEY' 
  | 'LOAMY';

export type IrrigationType = 
  | 'RAINFED' 
  | 'DRIP' 
  | 'SPRINKLER' 
  | 'FLOOD' 
  | 'FURROW' 
  | 'CANAL';

export interface EnvironmentalContext {
  season: 'KHARIF' | 'RABI' | 'ZAID' | 'YEAR_ROUND';
  region_code: string;
  district?: string;
  taluka?: string;
  current_date: string;
  last_7_days_rainfall_mm?: number;
  last_irrigation_date?: string;
  current_temperature_celsius?: number;
  humidity_percent?: number;
}

// OUTPUT SCHEMA

export interface NLUAgentOutput {
  understanding_metadata: UnderstandingMetadata;
  language_analysis: LanguageAnalysis;
  intent_classification: IntentClassification;
  crop_identification: CropIdentification;
  symptom_extraction: SymptomExtraction;
  pest_disease_hypothesis: PestDiseaseHypothesis;
  entities_extracted: EntitiesExtracted;
  context_integration: ContextIntegration;
  understanding_quality: UnderstandingQuality;
  clarification_strategy: ClarificationStrategy;
  photo_recommendation: PhotoRecommendation;
  normalized_text: NormalizedText;
  safety_flags: SafetyFlags;
  next_agent_recommendation: NextAgentRecommendation;
}

export interface UnderstandingMetadata {
  nlu_version: string;
  processing_timestamp: string;
  processing_time_ms: number;
}

export interface LanguageAnalysis {
  detected_language: string;
  language_confidence: number;
  dialect: string;
  code_switching_present: boolean;
  normalization_applied: boolean;
  original_script?: string;
}

export interface IntentClassification {
  primary_intent: PrimaryIntent;
  intent_confidence: number;
  secondary_intents: SecondaryIntent[];
  urgency_level: 'HIGH' | 'MEDIUM' | 'LOW';
  emotional_state: 'PANIC' | 'STRESSED' | 'NEUTRAL' | 'CONFIDENT';
}

export type PrimaryIntent = 
  | 'PEST_PROBLEM'
  | 'DISEASE_PROBLEM'
  | 'NUTRIENT_ISSUE'
  | 'WATER_ISSUE'
  | 'GENERAL_QUERY'
  | 'WEATHER_QUERY'
  | 'MARKET_QUERY'
  | 'EMERGENCY'
  | 'GREETING'
  | 'CONFIRMATION'
  | 'CLARIFICATION_RESPONSE';

export interface SecondaryIntent {
  intent: PrimaryIntent;
  confidence: number;
}

export interface CropIdentification {
  crop_code: string;
  crop_variety?: string;
  local_name?: string;
  identification_source: 'EXPLICIT' | 'INFERRED_FROM_CONTEXT' | 'UNKNOWN';
  confidence: number;
}

export interface SymptomExtraction {
  visual_symptoms: VisualSymptom[];
  behavioral_symptoms: BehavioralSymptom[];
  temporal_pattern: TemporalPattern;
}

export interface VisualSymptom {
  symptom_code: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  affected_part: AffectedPart;
  location: 'UPPER_LEAVES' | 'LOWER_LEAVES' | 'ALL' | 'STEM' | 'ROOT' | 'FRUIT' | 'FLOWER';
  color_change?: string;
  pattern?: string;
  confidence: number;
}

export type AffectedPart = 
  | 'LEAVES' 
  | 'STEM' 
  | 'ROOT' 
  | 'FRUIT' 
  | 'FLOWER' 
  | 'WHOLE_PLANT' 
  | 'PODS' 
  | 'BOLLS';

export interface BehavioralSymptom {
  symptom_code: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  confidence: number;
}

export interface TemporalPattern {
  onset: 'SUDDEN' | 'GRADUAL' | 'UNKNOWN';
  duration_days?: number;
  progression: 'WORSENING' | 'STABLE' | 'IMPROVING' | 'UNKNOWN';
}

export interface PestDiseaseHypothesis {
  suspected_causes: {
    primary: SuspectedCause[];
    secondary: SuspectedCause[];
  };
}

export interface SuspectedCause {
  type: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'STRESS' | 'ENVIRONMENTAL';
  code: string;
  common_name_mr?: string;
  common_name_hi?: string;
  common_name_en?: string;
  confidence: number;
  evidence: string[];
}

export interface EntitiesExtracted {
  pest_mentioned?: LocalizedEntity;
  disease_mentioned?: LocalizedEntity;
  chemical_mentioned?: LocalizedEntity;
  fertilizer_mentioned?: LocalizedEntity;
  action_mentioned?: ActionEntity;
  quantity_mentioned?: QuantityEntity;
  time_mentioned?: TimeEntity;
}

export interface LocalizedEntity {
  local_term: string;
  canonical: string;
  confidence: number;
}

export interface ActionEntity {
  local_term: string;
  canonical_action: string;
  confidence: number;
}

export interface QuantityEntity {
  value: number;
  unit: string;
  context: string;
}

export interface TimeEntity {
  relative?: string;
  absolute?: string;
  duration_days?: number;
}

export interface ContextIntegration {
  is_follow_up: boolean;
  previous_conversation_summary?: string;
  question_answered?: QuestionAnswered;
  hypothesis_update?: HypothesisUpdate;
  context_from_land?: boolean;
}

export interface QuestionAnswered {
  question_id: string;
  answer_value: string;
  quantified_detail?: string;
}

export interface HypothesisUpdate {
  pest_confidence_increased?: number;
  disease_confidence_increased?: number;
  new_total_confidence?: number;
  hypothesis_changed?: boolean;
}

export interface UnderstandingQuality {
  overall_confidence: number;
  confidence_breakdown: {
    language_clarity: number;
    symptom_specificity: number;
    context_completeness: number;
    ambiguity_score: number;
  };
  missing_information: MissingInfo[];
}

export type MissingInfo = 
  | 'CROP_TYPE'
  | 'SYMPTOM_DETAILS'
  | 'AFFECTED_AREA_PERCENTAGE'
  | 'PEST_DENSITY'
  | 'DURATION'
  | 'PREVIOUS_TREATMENTS'
  | 'LAND_SIZE'
  | 'IRRIGATION_STATUS';

export interface ClarificationStrategy {
  clarification_needed: boolean;
  clarification_priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  questions_to_ask: ClarificationQuestion[];
}

export interface ClarificationQuestion {
  question_id: string;
  question_text_mr: string;
  question_text_hi: string;
  question_text_en: string;
  expected_answer_type: 'TEXT' | 'NUMBER' | 'PERCENTAGE_RANGE' | 'YES_NO' | 'MULTIPLE_CHOICE';
  options?: QuestionOption[];
  skip_if_urgent: boolean;
}

export interface QuestionOption {
  value: string;
  label_mr: string;
  label_hi: string;
  label_en: string;
}

export interface PhotoRecommendation {
  photo_needed: boolean;
  photo_priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  specific_instructions: {
    mr: string;
    hi: string;
    en: string;
    what_to_capture: string;
    lighting: string;
    distance: string;
  };
}

export interface NormalizedText {
  original_language: string;
  cleaned: string;
  english_translation: string;
}

export interface SafetyFlags {
  banned_substance_mentioned: boolean;
  banned_substance_code?: string;
  dangerous_practice_mentioned: boolean;
  dangerous_practice_details?: string;
  emergency_escalation_needed: boolean;
  human_expert_needed: boolean;
}

export interface NextAgentRecommendation {
  proceed_to: 'AGENT_2_DIAGNOSTIC_FLOW' | 'AGENT_3_PHOTO_ANALYSIS' | 'AGENT_4_RECOMMENDATION' | 'HUMAN_EXPERT';
  skip_photo_agent: boolean;
  escalate_to_expert: boolean;
  confidence_sufficient: boolean;
  reasoning?: string;
}

// LOCAL AGRICULTURAL VOCABULARY

export interface AgriculturalTerm {
  canonical: string;
  type: 'PEST' | 'DISEASE' | 'SYMPTOM' | 'CROP' | 'FERTILIZER' | 'PESTICIDE' | 'ACTION';
  terms: {
    mr: string[];
    hi: string[];
    en: string[];
  };
  scientific_name?: string;
}

// PROCESSING STEP TYPES

export interface LanguageDetectionResult {
  primary_language: string;
  confidence: number;
  is_code_switched: boolean;
  secondary_language?: string;
  dialect_detected?: string;
  normalized_text: string;
  tokens: string[];
}

export interface IntentDetectionResult {
  primary: PrimaryIntent;
  primary_confidence: number;
  secondary: SecondaryIntent[];
  detected_patterns: string[];
}

export interface EntityExtractionResult {
  crops: LocalizedEntity[];
  pests: LocalizedEntity[];
  diseases: LocalizedEntity[];
  symptoms: VisualSymptom[];
  chemicals: LocalizedEntity[];
  quantities: QuantityEntity[];
  times: TimeEntity[];
}

export interface UrgencyAssessment {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  emotional_state: 'PANIC' | 'STRESSED' | 'NEUTRAL' | 'CONFIDENT';
  urgency_indicators: string[];
  requires_immediate_response: boolean;
}
