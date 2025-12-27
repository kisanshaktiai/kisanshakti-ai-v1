/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VALIDATION FRAMEWORK TYPES - KisanShakti AI Audit System
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Expert Agronomist's Deep Scientific Audit & Real-World Testing Framework
 * 12 Critical Validation Dimensions for Production Readiness
 */

// ═══════════════════════════════════════════════════════════════════════════
// CORE VALIDATION RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationResult {
  test: string;
  passed: boolean;
  critical?: boolean;
  details?: Record<string, unknown>;
  expert_verdict?: string;
  timestamp: string;
  duration_ms: number;
}

export interface AgentSequenceValidation extends ValidationResult {
  agents_called: string[];
  sequence_correct: boolean;
  data_integrity: boolean;
  confidence_tracked: boolean;
  critical_failures: string | null;
}

export interface VisualIdentificationValidation extends ValidationResult {
  accuracy: number;
  confidence_calibration: {
    well_calibrated: boolean;
    avg_confidence_correct: number;
    avg_confidence_wrong: number;
  };
  samples_tested: number;
}

export interface RuleFiringValidation extends ValidationResult {
  results: Array<{
    scenario: string;
    passed: boolean;
    rules_fired: string[];
    outcome: string;
  }>;
  determinism_verified: {
    deterministic: boolean;
    note: string;
  };
}

export interface SafetyGuardianValidation extends ValidationResult {
  results: Array<{
    scenario_id: string;
    correctly_blocked: boolean;
    safety_status: string;
    priority?: string;
  }>;
  all_dangers_blocked: boolean;
}

export interface MultiModalFusionValidation extends ValidationResult {
  contradiction_detected: boolean;
  correct_inference: boolean;
  fusion_confidence: number;
  conflicts_resolved: number;
}

export interface ConfidenceCalibrationValidation extends ValidationResult {
  analysis: Record<string, {
    avg_predicted_confidence: number;
    actual_accuracy: number;
    calibration_error: number;
    well_calibrated: boolean;
  }>;
}

export interface DataPersistenceValidation extends ValidationResult {
  all_saved: {
    sessions: boolean;
    decisions: boolean;
    conversations: boolean;
    hypotheses: boolean;
  };
  data_quality: boolean;
  sample_audit_trail?: unknown;
}

export interface FieldPerformanceValidation extends ValidationResult {
  duration_days: number;
  results: {
    total_farmers: number;
    total_sessions: number;
    diagnosis_accuracy: number;
    treatment_success_rate: number;
    economic_prediction_accuracy: number;
    farmer_satisfaction_avg: number;
    would_recommend_percent: number;
    issues: string[];
  };
}

export interface ResponseTimeValidation extends ValidationResult {
  metrics: {
    avg_response_time_ms: number;
    p50_ms: number;
    p90_ms: number;
    p99_ms: number;
    max_ms: number;
  };
}

export interface HallucinationValidation extends ValidationResult {
  hallucinations_detected: boolean;
  scenarios_tested: number;
  failures: Array<{
    scenario: string;
    issue: string;
  }>;
}

export interface TranslationQualityValidation extends ValidationResult {
  languages_tested: string[];
  accuracy_scores: Record<string, number>;
  culturally_appropriate: boolean;
}

export interface EdgeCaseValidation extends ValidationResult {
  cases_tested: number;
  all_handled_gracefully: boolean;
  failures: Array<{
    input: string;
    error: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE VALIDATION REPORT
// ═══════════════════════════════════════════════════════════════════════════

export interface ComprehensiveValidationReport {
  report_id: string;
  generated_date: string;
  auditor: string;
  
  executive_summary: {
    overall_verdict: 'APPROVED' | 'CONDITIONAL_APPROVAL' | 'NOT_APPROVED';
    confidence_in_system: number;
    ready_for_production: boolean;
    critical_issues_found: number;
    recommendations: string[];
  };
  
  dimension_results: {
    agent_connectivity: AgentSequenceValidation;
    scientific_accuracy: VisualIdentificationValidation;
    rule_engine_accuracy: RuleFiringValidation;
    safety_guardian: SafetyGuardianValidation;
    multimodal_fusion: MultiModalFusionValidation;
    confidence_calibration: ConfidenceCalibrationValidation;
    data_persistence: DataPersistenceValidation;
    field_performance: FieldPerformanceValidation;
    response_time: ResponseTimeValidation;
    hallucination_detection: HallucinationValidation;
    translation_quality: TranslationQualityValidation;
    edge_case_handling: EdgeCaseValidation;
  };
  
  field_test_summary: {
    farmers_tested: number;
    success_rate: number;
    farmer_satisfaction: number;
    diagnosis_accuracy: number;
    treatment_effectiveness: number;
  };
  
  critical_findings: Array<{
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    finding: string;
    impact: string;
    recommendation: string;
  }>;
  
  expert_final_verdict: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIELD-VALIDATED TEST CASE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FieldValidatedTestCase {
  id: string;
  crop: string;
  stage: string;
  issue: string;
  
  farmer_input_mr: string;
  farmer_input_hi?: string;
  farmer_input_en?: string;
  
  photo_url?: string;
  
  expected_diagnosis: {
    pest_code?: string;
    disease_code?: string;
    confidence_min: number;
    severity: string;
    urgency?: string;
  };
  
  expected_recommendation: {
    action_type: string;
    product: string | string[];
    timing?: string;
    etl_check?: string;
    ipm_level?: number;
    weather_block?: boolean;
    next_safe_window?: string;
    chemical_blocked?: string[];
  };
  
  safety_requirements: {
    banned_substances: number;
    phi_violations: number;
    pollinator_safe?: boolean;
  };
  
  critical_safety_checks?: {
    neonicotinoid_blocked?: boolean;
    application_time?: string;
    bee_protection?: boolean;
  };
  
  weather_context?: {
    rain_last_24h?: number;
    humidity?: number;
    temperature?: number;
    rain_forecast_24h?: number;
  };
  
  field_validation: {
    tested_on_farm: string;
    actual_outcome: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE';
    farmer_satisfaction?: number;
    cost_actual?: number;
    efficacy_actual?: number;
    weather_dependent?: boolean;
    critical_period?: boolean;
    farmer_feedback?: string;
  };
}

export interface AmbiguousTestCase {
  id: string;
  description: string;
  image?: string;
  farmer_input?: string;
  expert_diagnosis: string;
  expected_behavior: {
    confidence?: string;
    clarification_requested?: boolean;
    should_ask?: string;
    multiple_hypotheses?: boolean;
    requires_soil_data?: boolean;
    should_not_recommend_fungicide?: boolean;
  };
}

export interface DangerousScenario {
  id: string;
  attempt: Record<string, unknown>;
  must_block: boolean;
  blocking_priority: string;
  farmer_must_see?: string;
  reason?: string;
}

export interface HallucinationTestCase {
  scenario: string;
  input: Record<string, unknown>;
  must_not_claim: string[];
  must_say?: string[];
  must_ask?: string[];
}

export interface EdgeCaseTest {
  input: string | Record<string, unknown>;
  expected: string;
  description?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT TRACE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentTrace {
  session_id: string;
  agents_called: string[];
  execution_order: string[];
  agent_outputs: Array<{
    agent: string;
    output: unknown;
    confidence?: number;
    duration_ms: number;
  }>;
  total_duration_ms: number;
}

export interface DataHandoffResult {
  from_agent: string;
  to_agent: string;
  data_preserved: boolean;
  fields_lost: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationConfig {
  min_accuracy_threshold: number;
  min_confidence_threshold: number;
  max_response_time_ms: number;
  calibration_error_tolerance: number;
  min_farmer_satisfaction: number;
  beta_test_farmers: number;
  beta_test_days: number;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  min_accuracy_threshold: 0.85,
  min_confidence_threshold: 0.60,
  max_response_time_ms: 5000,
  calibration_error_tolerance: 0.10,
  min_farmer_satisfaction: 4.0,
  beta_test_farmers: 50,
  beta_test_days: 30
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPECTED AGENT FLOW
// ═══════════════════════════════════════════════════════════════════════════

export const EXPECTED_AGENT_FLOW = [
  'Agent_1_NLU',
  'Agent_2A_Context',
  'Agent_1B_Visual', // Optional - only when photo provided
  'Agent_7_Fusion',
  'Agent_2B_Diagnostic',
  'Agent_5_Rules',
  'Agent_9_Safety',
  'Agent_6_Communication',
  'Agent_8_Feedback'
] as const;

export type AgentName = typeof EXPECTED_AGENT_FLOW[number];
