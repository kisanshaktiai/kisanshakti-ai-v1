/**
 * Feedback Learning & Improvement Engine Types
 * Continuously learns from farmer outcomes to improve system accuracy
 */

// Treatment Outcome Tracking
export interface TreatmentOutcome {
  outcome_id: string;
  decision_id: string;
  session_id: string;
  farmer_id: string;
  land_id: string;
  tenant_id: string;
  
  // Original Decision
  original_decision: {
    pest_disease_diagnosed: string;
    confidence_at_diagnosis: number;
    treatment_recommended: string;
    cost_predicted_inr: number;
    benefit_predicted_inr: number;
    efficacy_predicted_percent: number;
    pest_density_initial?: number;
  };
  
  // Farmer Implementation
  farmer_implemented: {
    treatment_applied: string;
    actually_applied_on: string;
    quantity_used: string;
    cost_actual_inr: number;
    followed_instructions: boolean;
    deviations: string[];
  };
  
  // Follow-up Results
  follow_up_data: {
    day_3_check?: {
      improvement_visible: boolean;
      pest_density_now: number;
      farmer_satisfaction: 1 | 2 | 3 | 4 | 5;
      comments: string;
      photo_url?: string;
    };
    day_7_check?: {
      problem_resolved: boolean;
      pest_density_now: number;
      additional_treatment_needed: boolean;
      comments?: string;
    };
    day_14_check?: {
      final_outcome: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE';
      yield_impact_estimated: string;
      farmer_would_recommend: boolean;
      lessons_learned?: string;
    };
  };
  
  // Actual Economic Outcome
  actual_economics?: {
    total_cost_inr: number;
    yield_saved_quintals: number;
    benefit_realized_inr: number;
    actual_benefit_cost_ratio: number;
    prediction_accuracy: number;
  };
  
  // Expert Validation
  expert_review?: {
    expert_id: string;
    diagnosis_correct: boolean;
    diagnosis_correction?: string;
    treatment_appropriate: boolean;
    treatment_suggestion?: string;
    review_date: string;
    notes?: string;
  };
  
  // Metadata
  crop_code: string;
  crop_stage: string;
  region_code: string;
  season: string;
  created_at: string;
  updated_at: string;
}

// Identification Accuracy Tracking
export interface IdentificationAccuracy {
  identification_id: string;
  session_id: string;
  
  // What system predicted
  system_prediction: {
    pest_disease_code: string;
    confidence: number;
    based_on: string[];
    rule_fired: string;
    modalities_used: string[];
  };
  
  // Ground truth
  ground_truth: {
    actual_pest_disease: string;
    confirmed_by: 'EXPERT' | 'FARMER_OUTCOME' | 'LAB_TEST' | 'FIELD_VISIT';
    confirmation_date: string;
    confirmer_id?: string;
  };
  
  // Analysis
  correct: boolean;
  confidence_calibration: 'OVERCONFIDENT' | 'WELL_CALIBRATED' | 'UNDERCONFIDENT';
  error_type?: 'MISIDENTIFICATION' | 'MISSED_DETECTION' | 'FALSE_POSITIVE' | 'SEVERITY_MISMATCH';
  
  // Context
  crop_code: string;
  crop_stage: string;
  region_code: string;
  created_at: string;
}

// Rule Performance Metrics
export interface RulePerformance {
  rule_id: string;
  rule_file: string;
  category: string;
  priority: string;
  
  // Usage stats
  times_fired: number;
  times_blocked_action: number;
  times_recommended_action: number;
  times_skipped_by_farmer: number;
  
  // Outcome stats
  successful_outcomes: number;
  failed_outcomes: number;
  partial_outcomes: number;
  
  // Accuracy metrics
  success_rate: number;
  average_farmer_satisfaction: number;
  average_economic_accuracy: number;
  
  // Trends
  success_rate_trend_30d: 'IMPROVING' | 'STABLE' | 'DECLINING';
  usage_trend_30d: 'INCREASING' | 'STABLE' | 'DECREASING';
  
  // Meta
  last_updated: string;
  needs_review: boolean;
  review_reason?: string;
}

// Suggested Rule Changes
export interface LearningSuggestion {
  suggestion_id: string;
  suggestion_type: 'NEW_RULE' | 'REFINE_RULE' | 'DEPRECATE_RULE' | 'ADJUST_THRESHOLD' | 'UPDATE_EFFICACY';
  category: string;
  
  description: string;
  recommendation: string;
  
  evidence: {
    sample_size: number;
    confidence: 'HIGH' | 'MODERATE' | 'LOW';
    supporting_data: Record<string, any>;
  };
  
  impact: {
    affected_crops: string[];
    affected_pests: string[];
    estimated_accuracy_improvement: number;
  };
  
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'PENDING' | 'APPROVED' | 'IMPLEMENTED' | 'REJECTED';
  
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

// Confidence Adjustment Record
export interface ConfidenceAdjustment {
  pest_disease_code: string;
  original_avg_confidence: number;
  actual_accuracy: number;
  calibration_factor: number;
  adjustment_direction: 'INCREASE' | 'DECREASE' | 'NONE';
  sample_size: number;
  effective_from: string;
}

// Efficacy Update Record
export interface EfficacyUpdate {
  treatment_code: string;
  pest_disease_code: string;
  crop_code?: string;
  crop_stage?: string;
  
  previous_efficacy: number;
  new_efficacy: number;
  sample_size: number;
  confidence: 'HIGH' | 'MODERATE' | 'LOW';
  
  updated_at: string;
}

// Economic Model Adjustment
export interface EconomicAdjustment {
  adjustment_type: 'YIELD_LOSS' | 'TREATMENT_COST' | 'MARKET_PRICE';
  crop_code: string;
  pest_disease_code?: string;
  region_code?: string;
  
  previous_value: number;
  new_value: number;
  adjustment_percent: number;
  
  based_on_samples: number;
  confidence: 'HIGH' | 'MODERATE' | 'LOW';
  
  effective_from: string;
}

// Follow-up Question Template
export interface FollowUpQuestion {
  id: string;
  day: 3 | 7 | 14;
  
  text_mr: string;
  text_hi: string;
  text_en: string;
  
  type: 'YES_NO' | 'RATING_1_TO_5' | 'MULTIPLE_CHOICE' | 'FREE_TEXT' | 'PHOTO_UPLOAD';
  options?: Array<{
    value: string;
    label_mr: string;
    label_hi: string;
    label_en: string;
  }>;
  
  required: boolean;
  conditional_on?: string;
}

// Improvement Metrics Dashboard
export interface ImprovementMetrics {
  report_date: string;
  period_days: number;
  
  overall_accuracy: {
    pest_identification_accuracy: number;
    disease_identification_accuracy: number;
    treatment_success_rate: number;
    economic_prediction_accuracy: number;
    overall_score: number;
  };
  
  trends: {
    accuracy_change_percent: number;
    satisfaction_change_percent: number;
    adoption_rate_change_percent: number;
    response_time_change_ms: number;
  };
  
  by_category: Record<string, {
    accuracy: number;
    sample_size: number;
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  }>;
  
  top_performing_rules: Array<{
    rule_id: string;
    success_rate: number;
    usage_count: number;
  }>;
  
  underperforming_rules: Array<{
    rule_id: string;
    success_rate: number;
    failure_count: number;
    needs_review: boolean;
  }>;
  
  new_patterns_detected: LearningSuggestion[];
  
  expert_review_queue: number;
  pending_follow_ups: number;
  
  recommendations: string[];
}

// Farmer Feedback Response
export interface FarmerFeedback {
  feedback_id: string;
  decision_id: string;
  farmer_id: string;
  
  day: 3 | 7 | 14;
  responses: Record<string, any>;
  
  overall_satisfaction?: number;
  would_recommend?: boolean;
  
  collected_via: 'APP' | 'SMS' | 'VOICE_CALL' | 'FIELD_VISIT';
  collected_at: string;
}

// Constants
export const FOLLOW_UP_QUESTIONS: Record<number, FollowUpQuestion[]> = {
  // All text fields are English-only — LLM narration layer handles runtime localization
  // @deprecated text_mr/text_hi/label_mr/label_hi — kept as empty strings for backward compat
  3: [
    {
      id: 'improvement_visible',
      day: 3,
      text_mr: '',
      text_hi: '',
      text_en: 'Did pests/disease reduce after treatment?',
      type: 'YES_NO',
      required: true
    },
    {
      id: 'satisfaction_3day',
      day: 3,
      text_mr: '',
      text_hi: '',
      text_en: 'How satisfied are you with the advice?',
      type: 'RATING_1_TO_5',
      required: true
    },
    {
      id: 'comments_3day',
      day: 3,
      text_mr: '',
      text_hi: '',
      text_en: 'Any issues faced?',
      type: 'FREE_TEXT',
      required: false
    }
  ],
  7: [
    {
      id: 'problem_resolved',
      day: 7,
      text_mr: '',
      text_hi: '',
      text_en: 'Is the problem fully resolved?',
      type: 'YES_NO',
      required: true
    },
    {
      id: 'additional_treatment',
      day: 7,
      text_mr: '',
      text_hi: '',
      text_en: 'Did you need additional treatment?',
      type: 'YES_NO',
      required: true
    },
    {
      id: 'current_photo',
      day: 7,
      text_mr: '',
      text_hi: '',
      text_en: 'Send current photo',
      type: 'PHOTO_UPLOAD',
      required: false
    }
  ],
  14: [
    {
      id: 'final_outcome',
      day: 14,
      text_mr: '',
      text_hi: '',
      text_en: 'What was the overall outcome?',
      type: 'MULTIPLE_CHOICE',
      options: [
        { value: 'SUCCESS', label_mr: '', label_hi: '', label_en: 'Successful' },
        { value: 'PARTIAL_SUCCESS', label_mr: '', label_hi: '', label_en: 'Partially Successful' },
        { value: 'FAILURE', label_mr: '', label_hi: '', label_en: 'Failed' }
      ],
      required: true
    },
    {
      id: 'would_recommend',
      day: 14,
      text_mr: '',
      text_hi: '',
      text_en: 'Would you recommend this advice?',
      type: 'YES_NO',
      required: true
    },
    {
      id: 'yield_impact',
      day: 14,
      text_mr: '',
      text_hi: '',
      text_en: 'What was the impact on yield?',
      type: 'MULTIPLE_CHOICE',
      options: [
        { value: 'SAVED_FULL', label_mr: '', label_hi: '', label_en: 'Fully Saved' },
        { value: 'SAVED_PARTIAL', label_mr: '', label_hi: '', label_en: 'Partially Saved' },
        { value: 'NO_IMPACT', label_mr: '', label_hi: '', label_en: 'No Impact' },
        { value: 'LOSS', label_mr: '', label_hi: '', label_en: 'Loss Occurred' }
      ],
      required: true
    }
  ]
};

export const LEARNING_THRESHOLDS = {
  MIN_SAMPLES_FOR_ADJUSTMENT: 10,
  MIN_SAMPLES_FOR_HIGH_CONFIDENCE: 30,
  CONFIDENCE_CALIBRATION_TOLERANCE: 0.1,
  EFFICACY_UPDATE_THRESHOLD: 10, // % difference
  ECONOMIC_ERROR_THRESHOLD: 1.0, // BCR difference
  SUCCESS_RATE_REVIEW_THRESHOLD: 0.5, // 50%
  PATTERN_DETECTION_MIN_SAMPLES: 15
};

export const RULE_REVIEW_TRIGGERS = {
  LOW_SUCCESS_RATE: 0.5,
  HIGH_SKIP_RATE: 0.4,
  DECLINING_TREND_DAYS: 14,
  MIN_FAILURES_FOR_REVIEW: 5
};
