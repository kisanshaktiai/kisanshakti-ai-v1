/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORENSIC AUDIT LOGGER - Complete Decision Trail
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SYMBOLIC BRAIN PRINCIPLE: "Rules Decide, AI Only Explains"
 * This logger captures the COMPLETE decision trail for forensic analysis.
 * 
 * Captures:
 * - NLU output (observations only, no decisions)
 * - Intent lock (what actions are allowed)
 * - Rule engine input/output (the actual decisions)
 * - LLM formatter input/output (render-only verification)
 * - Validation gate results (source integrity)
 * 
 * Philosophy: 100% auditability - every recommendation traceable to rules
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { NLUDecisionGraphInput, SymbolicDecisionOutput } from './decision-representation.ts';
import { getRuntimeTraceCollector } from '../runtime/runtime-trace-collector.ts';
import { getKnowledgeVersions } from '../runtime/knowledge-versions.ts';

export const AUDIT_LOGGER_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: OBSERVATION CONTRACT — block raw vernacular text from leaking into
// ai_chat_audit_logs.observations. Only canonical English codes allowed.
// ═══════════════════════════════════════════════════════════════════════════
function filterCanonicalForAudit(obs: any): string[] {
  if (!Array.isArray(obs)) return [];
  const out: string[] = [];
  const blocked: string[] = [];
  for (const o of obs) {
    if (typeof o === 'string' && /^[A-Z][A-Z0-9_]+$/.test(o) && o.length <= 80) {
      out.push(o);
    } else if (o != null) {
      blocked.push(String(o).substring(0, 60));
    }
  }
  if (blocked.length > 0) {
    console.error(`[ObservationContract] BLOCKED ${blocked.length} non-canonical entries at audit boundary: ${blocked.join(' | ')}`);
  }
  return out;
}

function normalizeAuditResponseSource(source: any): 'SYMBOLIC_TEMPLATE' | 'LLM_FORMATTED' | 'CLARIFICATION' | 'ERROR' {
  const value = String(source || '').toUpperCase();
  if (value === 'LLM_FORMATTED') return 'LLM_FORMATTED';
  if (value === 'CLARIFICATION' || value.includes('CLARIF')) return 'CLARIFICATION';
  if (value === 'ERROR' || value.includes('ERROR') || value.includes('FAILED')) return 'ERROR';
  return 'SYMBOLIC_TEMPLATE';
}

function normalizeAuditLanguage(language: any): 'mr' | 'hi' | 'en' {
  const value = String(language || '').toLowerCase();
  if (value.startsWith('mr')) return 'mr';
  if (value.startsWith('hi')) return 'hi';
  return 'en';
}

function normalizeAuditConfidence(confidence: any): number | null {
  const n = Number(confidence);
  if (!Number.isFinite(n)) return null;
  const scaled = n > 1 && n <= 100 ? n / 100 : n;
  return Math.max(0, Math.min(1, scaled));
}


// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS - Extended for Full Forensic Trail
// ═══════════════════════════════════════════════════════════════════════════

export interface NLUContractOutput {
  intent_label: string;
  observations: string[];
  confidence: number;
  // FORBIDDEN fields (logged if present = violation)
  has_forbidden_fields: boolean;
  forbidden_field_names?: string[];
}

export interface RuleEngineAudit {
  input: {
    nlu_observations: string[];
    land_context_present: boolean;
    soil_data_present: boolean;
    ndvi_data_present: boolean;
  };
  output: {
    rules_fired: string[];
    causes_identified: string[];
    actions_generated: string[];
    clarification_needed: boolean;
  };
}

export interface LLMFormatterAudit {
  input: {
    symbolic_actions_count: number;
    product_names: string[];
    dosages: string[];
  };
  output: {
    response_length: number;
    validation_passed: boolean;
    violations: string[];
  };
}

export interface TurnAuditLog {
  turn_id: string;
  session_id: string;
  farmer_id: string;
  tenant_id: string;
  trace_id: string;
  
  // Stage 1: Raw vs Normalized text
  raw_text: string;
  normalized_text: string;
  farmer_message: string;
  detected_language: string;
  
  // Stage 2: Observation Extraction output
  extracted_observations?: {
    crop_mentioned?: string;
    raw_symptom_text: string[];
    affected_part: string;
    symptom_distribution: string;
    severity_words: string[];
    time_reference?: string;
    action_taken: string[];
    uncertainty_markers: string[];
  };
  
  // PHASE-8: Observation Keys (before/after clarification)
  observation_keys_before?: string[];
  observation_keys_after?: string[];
  
  // PHASE-8: Clarification Audit
  clarification_scope?: string;
  clarification_turn_count?: number;
  clarification_loop_detected?: boolean;
  escalation_reason?: string;
  
  // PHASE-8.1: Crop Context Authority
  crop_context_used?: {
    crop: string;
    stage: string;
    days_since_sowing: number;
    source: 'crop_schedules';
  };
  
  // PHASE-9: Cross-Crop Symptoms
  cross_crop_symptoms_detected?: string[];
  
  // Stage 3: Canonical State
  canonical_state?: any;
  canonical_state_snapshot?: {
    crop: string;
    stage: string;
    visual_symptoms: string[];
    soil_state: string;
    ndvi_state: string;
  };
  
  // Stage 4: Understanding Check
  understanding_confidence?: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH';
  contradiction_detected?: string[];
  
  // Stage 5: Data Confidence
  data_confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  
  // NLU Output
  nlu_output: NLUContractOutput;
  
  // Intent Lock
  locked_intent: string;
  allowed_scopes: string[];
  forbidden_actions: string[];
  
  // Rule Engine Trail
  rule_engine_audit?: RuleEngineAudit;
  rules_evaluated: string[];
  rules_applied: string[];
  
  // Symbolic Decision
  symbolic_decision_id?: string;
  rules_fired: string[];
  actions_returned: any[];
  actions_filtered_out: any[];
  
  // LLM Formatter Trail
  llm_formatter_audit?: LLMFormatterAudit;
  
  // PHASE-8: LLM Integrity Hashes
  llm_input_hash?: string;
  llm_output_hash?: string;
  
  // Cause Mapping
  observation_mapping?: {
    cause_codes: string[];
    cause_type: string;
    confidence: number;
    matched_patterns: string[];
  };
  
  // PHASE-8: Prescription Gate
  prescription_gate_result?: {
    passed: boolean;
    blocked_reasons: string[];
    allowed_actions: string[];
  };
  
  // Validation
  validation_passed: boolean;
  validation_errors: string[];
  source_validation_passed: boolean;
  
  // Decision tracking
  decision_type: 'CLARIFY' | 'PRESCRIBE' | 'MONITOR' | 'ESCALATE' | 'INFORM' | 'ERROR' | 'FAILED_DIAGNOSIS_LEAKAGE';
  decision_source: 'RULE_ENGINE' | 'UNDERSTANDING_GATE' | 'DATA_GATE' | 'SAFETY_GATE' | 'DIRECT' | 'CLARIFICATION_SCOPE_VALIDATOR';
  prescription_gate_passed?: boolean;
  
  // Response
  response_source: 'SYMBOLIC_TEMPLATE' | 'LLM_FORMATTED' | 'CLARIFICATION' | 'ERROR';
  response_language_match: boolean;
  llm_model_used?: string;
  
  // Timing
  processing_time_ms: number;
  timestamp: string;
  
  // Metadata
  agents_used: string[];
  land_id?: string;
  crop_code?: string;
  growth_stage?: string;
}

export interface AuditValidation {
  passed: boolean;
  violations: string[];
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class AuditLogger {
  private supabase: ReturnType<typeof createClient>;
  private currentTurn: Partial<TurnAuditLog> = {};
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }
  
  /**
   * Start a new audit turn
   */
  startTurn(params: {
    turn_id: string;
    session_id: string;
    farmer_id: string;
    tenant_id: string;
    trace_id: string;
    farmer_message: string;
    detected_language: string;
    land_id?: string;
    raw_text?: string;
    normalized_text?: string;
  }): void {
    this.currentTurn = {
      ...params,
      raw_text: params.raw_text || params.farmer_message,
      normalized_text: params.normalized_text || params.farmer_message,
      timestamp: new Date().toISOString(),
      agents_used: [],
      rules_fired: [],
      rules_evaluated: [],
      rules_applied: [],
      actions_returned: [],
      actions_filtered_out: [],
      validation_errors: [],
      validation_passed: false,
      decision_type: 'INFORM' as const,
      decision_source: 'DIRECT' as const
    };
    
    console.log(`📋 [Audit] Turn started: ${params.turn_id}`);
  }
  
  /**
   * Log observation extraction result (Stage 2)
   */
  logObservationExtraction(observations: {
    crop_mentioned?: string;
    raw_symptom_text: string[];
    affected_part: string;
    symptom_distribution: string;
    severity_words: string[];
    time_reference?: string;
    action_taken: string[];
    uncertainty_markers: string[];
  }): void {
    this.currentTurn.extracted_observations = observations;
    this.addAgent('OBSERVATION_EXTRACTOR');
    
    console.log(`📋 [Audit] Observations: ${observations.raw_symptom_text.length} symptoms, crop=${observations.crop_mentioned || 'unknown'}`);
  }
  
  /**
   * Log ObservationKeys mapping result (Stage 2.5 - PHASE-8)
   * This is REQUIRED for Phase-8 audit trail
   */
  logObservationKeys(params: {
    before: string[];
    after?: string[];
    unknown_count: number;
    had_land_context_crop: boolean;
  }): void {
    this.currentTurn.observation_keys_before = params.before;
    if (params.after) {
      this.currentTurn.observation_keys_after = params.after;
    }
    this.addAgent('OBSERVATION_KEY_MAPPER');
    
    console.log(`📋 [Audit] ObservationKeys: ${params.before.length} keys, ${params.unknown_count} unknown, land_crop=${params.had_land_context_crop}`);
  }
  
  /**
   * Log clarification turn for loop safety tracking (PHASE-8)
   */
  logClarificationTurn(params: {
    scope: string;
    turn_count: number;
    escalation_reason?: string;
    loop_detected?: boolean;
  }): void {
    this.currentTurn.clarification_scope = params.scope;
    this.currentTurn.clarification_turn_count = params.turn_count;
    this.currentTurn.escalation_reason = params.escalation_reason;
    this.currentTurn.clarification_loop_detected = params.loop_detected;
    
    console.log(`📋 [Audit] Clarification: scope=${params.scope}, turn=${params.turn_count}, loop=${params.loop_detected || false}`);
  }
  
  /**
   * Log CropContextAuthority usage (PHASE-8.1)
   */
  logCropContextAuthority(cropContext: {
    crop: string;
    stage: string;
    days_since_sowing: number;
  } | null | undefined): void {
    if (cropContext) {
      this.currentTurn.crop_context_used = {
        crop: cropContext.crop,
        stage: cropContext.stage,
        days_since_sowing: cropContext.days_since_sowing,
        source: 'crop_schedules'
      };
      this.addAgent('CROP_CONTEXT_AUTHORITY');
      
      console.log(`📋 [Audit] CropContext: ${cropContext.crop} (${cropContext.stage}, DAS: ${cropContext.days_since_sowing})`);
    }
  }
  
  /**
   * Log cross-crop symptoms detected (PHASE-9)
   */
  logCrossCropSymptoms(symptoms: string[]): void {
    this.currentTurn.cross_crop_symptoms_detected = symptoms;
    this.addAgent('CROSS_CROP_SYMPTOM_MAPPER');
    
    console.log(`📋 [Audit] CrossCropSymptoms: ${symptoms.length} detected - ${symptoms.slice(0, 5).join(', ')}${symptoms.length > 5 ? '...' : ''}`);
  }
  
  /**
   * Log understanding check result (Stage 4)
   */
  logUnderstandingCheck(result: {
    understanding_confidence: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH';
    contradiction_detected: string[];
    clarification_required: boolean;
  }): void {
    this.currentTurn.understanding_confidence = result.understanding_confidence;
    this.currentTurn.contradiction_detected = result.contradiction_detected;
    this.addAgent('UNDERSTANDING_CHECKER');
    
    console.log(`📋 [Audit] Understanding: ${result.understanding_confidence}, contradictions=${result.contradiction_detected.length}, clarify=${result.clarification_required}`);
  }
  
  /**
   * Log data confidence (Stage 5)
   */
  logDataConfidence(confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'): void {
    this.currentTurn.data_confidence = confidence;
    console.log(`📋 [Audit] Data confidence: ${confidence}`);
  }
  
  /**
   * Log canonical state
   */
  logCanonicalState(state: any): void {
    this.currentTurn.canonical_state = state;
    this.addAgent('CANONICAL_STATE_BUILDER');
  }
  
  /**
   * Log prescription gate result
   */
  logPrescriptionGate(passed: boolean, reason?: string): void {
    this.currentTurn.prescription_gate_passed = passed;
    if (!passed && reason) {
      this.currentTurn.validation_errors?.push(`Prescription gate blocked: ${reason}`);
    }
    this.addAgent('PRESCRIPTION_GATE');
    console.log(`📋 [Audit] Prescription gate: ${passed ? 'PASSED' : 'BLOCKED'} ${reason || ''}`);
  }
  
  /**
   * Log decision type and source
   */
  logDecision(type: 'CLARIFY' | 'PRESCRIBE' | 'MONITOR' | 'ESCALATE' | 'INFORM' | 'ERROR', source: 'RULE_ENGINE' | 'UNDERSTANDING_GATE' | 'DATA_GATE' | 'SAFETY_GATE' | 'DIRECT'): void {
    this.currentTurn.decision_type = type;
    this.currentTurn.decision_source = source;
    console.log(`📋 [Audit] Decision: ${type} from ${source}`);
  }
  
  /**
   * Log NLU output (Contract-compliant format)
   */
  logNLUOutput(nlu: NLUContractOutput): void {
    this.currentTurn.nlu_output = nlu;
    this.addAgent('NLU');
    
    console.log(`📋 [Audit] NLU: intent="${nlu.intent_label}", confidence=${nlu.confidence.toFixed(2)}`);
    console.log(`   Observations: ${nlu.observations.slice(0, 3).join(', ')}`);
  }
  
  /**
   * Log intent lock
   */
  logIntentLock(lock: {
    locked_intent: string;
    allowed_scopes: string[];
    forbidden_actions: string[];
  }): void {
    this.currentTurn.locked_intent = lock.locked_intent;
    this.currentTurn.allowed_scopes = lock.allowed_scopes;
    this.currentTurn.forbidden_actions = lock.forbidden_actions;
    this.addAgent('INTENT_LOCK');
    
    console.log(`📋 [Audit] Intent LOCKED: ${lock.locked_intent}`);
  }
  
  /**
   * Log observation-to-cause mapping
   */
  logObservationMapping(mapping: {
    cause_codes: string[];
    cause_type: string;
    confidence: number;
    matched_patterns: string[];
  }): void {
    this.currentTurn.observation_mapping = mapping;
    this.addAgent('OBSERVATION_MAPPER');
    
    console.log(`📋 [Audit] Causes: ${mapping.cause_codes.join(', ')} (${mapping.cause_type})`);
  }
  
  /**
   * Log symbolic decision output
   */
  logSymbolicDecision(decision: {
    decision_id: string;
    rules_fired: string[];
    actions_returned: any[];
    actions_filtered_out?: any[];
  }): void {
    this.currentTurn.symbolic_decision_id = decision.decision_id;
    this.currentTurn.rules_fired = decision.rules_fired;
    this.currentTurn.actions_returned = decision.actions_returned;
    this.currentTurn.actions_filtered_out = decision.actions_filtered_out || [];
    this.addAgent('SYMBOLIC_BRAIN');
    
    console.log(`📋 [Audit] Decision: ${decision.decision_id}`);
    console.log(`   Rules: ${decision.rules_fired.length}, Actions: ${decision.actions_returned.length}`);
  }
  
  /**
   * Log Rule Engine audit trail (NEW)
   */
  logRuleEngineAudit(audit: RuleEngineAudit): void {
    this.currentTurn.rule_engine_audit = audit;
    this.addAgent('RULE_ENGINE');
    
    console.log(`📋 [Audit] Rule Engine:`);
    console.log(`   Inputs: land=${audit.input.land_context_present}, soil=${audit.input.soil_data_present}, ndvi=${audit.input.ndvi_data_present}`);
    console.log(`   Outputs: rules=${audit.output.rules_fired.length}, actions=${audit.output.actions_generated.length}`);
  }
  
  /**
   * Log LLM Formatter audit trail (NEW)
   */
  logLLMFormatterAudit(audit: LLMFormatterAudit): void {
    this.currentTurn.llm_formatter_audit = audit;
    this.addAgent('LLM_FORMATTER');
    
    console.log(`📋 [Audit] LLM Formatter:`);
    console.log(`   Input: ${audit.input.symbolic_actions_count} actions, products: ${audit.input.product_names.join(', ') || 'none'}`);
    console.log(`   Output: ${audit.output.response_length} chars, validation: ${audit.output.validation_passed ? 'PASSED' : 'FAILED'}`);
    if (!audit.output.validation_passed) {
      console.log(`   Violations: ${audit.output.violations.join(', ')}`);
    }
  }
  
  /**
   * Log response generation
   */
  logResponse(response: {
    source: 'SYMBOLIC_TEMPLATE' | 'LLM_FORMATTED' | 'CLARIFICATION' | 'ERROR';
    language_match: boolean;
    llm_model?: string;
  }): void {
    this.currentTurn.response_source = response.source;
    this.currentTurn.response_language_match = response.language_match;
    this.currentTurn.llm_model_used = response.llm_model;
    
    console.log(`📋 [Audit] Response: ${response.source}, language_match=${response.language_match}`);
  }
  
  /**
   * Log validation result (required by orchestrator)
   */
  logValidation(result: { passed: boolean; errors: string[] }): void {
    this.currentTurn.validation_passed = result.passed;
    this.currentTurn.validation_errors = result.errors || [];
    console.log(`📋 [Audit] Validation: ${result.passed ? 'PASSED' : 'FAILED'}${result.errors?.length ? ` (${result.errors.join(', ')})` : ''}`);
  }
  
  /**
   * Log crop context
   */
  logCropContext(context: {
    crop_code?: string;
    growth_stage?: string;
  }): void {
    this.currentTurn.crop_code = context.crop_code;
    this.currentTurn.growth_stage = context.growth_stage;
  }
  
  /**
   * Add agent to used list
   */
  private addAgent(agent: string): void {
    if (!this.currentTurn.agents_used?.includes(agent)) {
      this.currentTurn.agents_used?.push(agent);
    }
  }
  
  /**
   * Complete and save the audit log
   */
  async completeTurn(processing_time_ms: number): Promise<void> {
    this.currentTurn.processing_time_ms = processing_time_ms;
    
    const auditLog = this.currentTurn as TurnAuditLog;
    
    // Console summary
    console.log(`\n📋 ═══ AUDIT LOG COMPLETE ═══`);
    console.log(`   Turn: ${auditLog.turn_id}`);
    console.log(`   Intent: ${auditLog.locked_intent}`);
    console.log(`   Rules Fired: ${auditLog.rules_fired?.length || 0}`);
    console.log(`   Actions: ${auditLog.actions_returned?.length || 0} returned, ${auditLog.actions_filtered_out?.length || 0} filtered`);
    console.log(`   Validation: ${auditLog.validation_passed ? 'PASSED' : 'FAILED'}`);
    console.log(`   Response: ${auditLog.response_source}`);
    console.log(`   Time: ${processing_time_ms}ms`);
    console.log(`═══════════════════════════════\n`);
    
    // Save to database (if table exists)
    try {
      await this.saveToDatabase(auditLog);
    } catch (error) {
      // Log but don't fail - audit logging is non-critical
      console.warn(`⚠️ [Audit] Failed to save to DB:`, error);
    }
    
    // Reset for next turn
    this.currentTurn = {};
  }
  
  /**
   * Save audit log to database.
   * PHASE Y: First persists ai_decision_log (sourced from RuntimeTraceCollector
   * if present), then stamps symbolic_decision_id onto the ai_chat_audit_logs row.
   */
  private async saveToDatabase(log: TurnAuditLog): Promise<void> {
    // ─── PHASE Y: persist ai_decision_log first ─────────────────────────────
    const collector = getRuntimeTraceCollector();
    let symbolicDecisionId: string | null = log.symbolic_decision_id || null;
    let decisionLogExtras: {
      execution_id?: string;
      pipeline_version?: string;
      graph_version?: string;
      runtime_version?: string;
    } = {};

    if (collector) {
      try {
        const knowledgeVersions = await getKnowledgeVersions().catch(() => ({}));
        collector.setKnowledgeVersions(knowledgeVersions);

        const insertedId = await collector.persistDecisionLog(this.supabase, {
          tenant_id: log.tenant_id ?? null,
          farmer_id: log.farmer_id ?? null,
          land_id:   log.land_id ?? null,
          farmer_message: log.farmer_message,
          observations: log.nlu_output?.observations ?? [],
          validation_passed: log.validation_passed,
          processing_time_ms: log.processing_time_ms,
          knowledge_versions: knowledgeVersions,
        });

        if (insertedId) symbolicDecisionId = insertedId;

        decisionLogExtras = {
          execution_id:     collector.header.execution_id,
          pipeline_version: collector.header.pipeline_version,
          graph_version:    collector.header.graph_version,
          runtime_version:  collector.header.runtime_version,
        };
      } catch (e: any) {
        console.warn(`⚠️ [Audit] RuntimeTraceCollector persist failed (non-blocking):`, e?.message || e);
      }
    }


    // ─── ai_chat_audit_logs (existing behaviour + Phase Y columns) ──────────
    const insertData: Record<string, any> = {
      turn_id: log.turn_id,
      session_id: log.session_id,
      farmer_id: log.farmer_id,
      tenant_id: log.tenant_id,
      trace_id: log.trace_id,
      farmer_message: log.farmer_message,
      detected_language: normalizeAuditLanguage(log.detected_language),
      intent_label: log.nlu_output?.intent_label,
      observations: filterCanonicalForAudit(log.nlu_output?.observations),

      nlu_confidence: normalizeAuditConfidence(log.nlu_output?.confidence),
      locked_intent: log.locked_intent,
      allowed_scopes: log.allowed_scopes,
      forbidden_actions: log.forbidden_actions,
      symbolic_decision_id: symbolicDecisionId,
      rules_fired: log.rules_fired,
      actions_returned: log.actions_returned,
      actions_filtered_out: log.actions_filtered_out,
      observation_mapping: log.observation_mapping,
      validation_passed: log.validation_passed,
      validation_errors: log.validation_errors,
      response_source: normalizeAuditResponseSource(log.response_source),
      response_language_match: log.response_language_match,
      llm_model_used: log.llm_model_used,
      processing_time_ms: log.processing_time_ms,
      agents_used: log.agents_used,
      land_id: log.land_id,
      crop_code: log.crop_code,
      growth_stage: log.growth_stage,
      created_at: log.timestamp,
      ...decisionLogExtras,
    };

    // @ts-ignore - Supabase types may not match exactly
    const { error } = await this.supabase
      .from('ai_chat_audit_logs')
      .insert(insertData);

    if (error) {
      // Table might not exist - log warning only
      if (error.code === '42P01') {
        console.log(`⚠️ [Audit] Table 'ai_chat_audit_logs' not found - skipping DB save`);
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Validate the audit log for compliance violations
   */
  validateCompliance(): AuditValidation {
    const violations: string[] = [];
    let severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';
    
    // Check 1: NLU must not contain internal codes
    const nluOutput = this.currentTurn.nlu_output;
    if (nluOutput) {
      const nluString = JSON.stringify(nluOutput);
      const forbiddenPatterns = [
        /pest_code/i,
        /disease_code/i,
        /crop_code/i,
        /rule_id/i,
        /product_id/i
      ];
      
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(nluString)) {
          violations.push(`NLU output contains forbidden field: ${pattern.source}`);
          severity = 'CRITICAL';
        }
      }
    }
    
    // Check 2: Intent must be locked before decision
    if (this.currentTurn.symbolic_decision_id && !this.currentTurn.locked_intent) {
      violations.push('Decision made without locked intent');
      severity = 'CRITICAL';
    }
    
    // Check 3: Actions must match allowed scopes
    const actions = this.currentTurn.actions_returned || [];
    const forbiddenActions = this.currentTurn.forbidden_actions || [];
    
    for (const action of actions) {
      const actionType = action.action_type || action.type || '';
      for (const forbidden of forbiddenActions) {
        if (actionType.toUpperCase().includes(forbidden.toUpperCase())) {
          violations.push(`Forbidden action '${forbidden}' in response`);
          severity = 'CRITICAL';
        }
      }
    }
    
    // Check 4: Response language must match
    if (this.currentTurn.response_language_match === false) {
      violations.push('Response language does not match detected language');
      severity = severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
    }
    
    return {
      passed: violations.length === 0,
      violations,
      severity
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let auditLoggerInstance: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger();
  }
  return auditLoggerInstance;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quick log function for one-off logging
 */
export function logAuditEvent(
  event_type: string,
  details: Record<string, any>,
  trace_id?: string
): void {
  console.log(`📋 [Audit:${event_type}] ${trace_id || ''}`);
  console.log(`   ${JSON.stringify(details)}`);
}

/**
 * PHASE-10: Log warning when no rules match but decision is made
 * This helps identify gaps in the rule engine
 */
export function logZeroRuleMatchWarning(params: {
  trace_id: string;
  crop: string;
  symptoms: string[];
  canonical_state_snapshot: Record<string, any>;
  decision_made: string;
  response_source: string;
}): void {
  console.warn(`
⚠️ ════════════════════════════════════════════════════════════════════════════
   [PHASE-10 AUDIT] ZERO RULE MATCH WARNING
   ════════════════════════════════════════════════════════════════════════════
   Trace ID: ${params.trace_id}
   Crop: ${params.crop}
   Symptoms: ${params.symptoms.join(', ')}
   Decision Made: ${params.decision_made}
   Response Source: ${params.response_source}
   
   🚨 ISSUE: Rules did not fire but a response was generated.
   This may indicate a gap in the rule engine for this crop/symptom combination.
   
   Canonical State Snapshot:
   ${JSON.stringify(params.canonical_state_snapshot, null, 2)}
   
   ACTION REQUIRED: Review and add rules for this scenario.
   ════════════════════════════════════════════════════════════════════════════
  `);
}

/**
 * PHASE-10: Log when cross-crop biocontrol agent is detected
 */
export function logInvalidBiocontrolWarning(params: {
  trace_id: string;
  crop: string;
  bioagent_suggested: string;
  valid_for_crop: string;
}): void {
  console.warn(`
⚠️ [PHASE-10 AUDIT] INVALID BIOCONTROL WARNING
   Trace ID: ${params.trace_id}
   Target Crop: ${params.crop}
   Bioagent Suggested: ${params.bioagent_suggested}
   Valid For: ${params.valid_for_crop} (NOT ${params.crop})
   
   This biocontrol agent is not effective for the target crop.
  `);
}

/**
 * Check if NLU output complies with contract
 * Returns violations if any internal codes are present
 */
export function validateNLUContract(nluOutput: any): string[] {
  const violations: string[] = [];
  
  // Forbidden fields that indicate internal code leakage
  const forbiddenFields = [
    'pest_code',
    'disease_code', 
    'crop_code',
    'rule_id',
    'product_id',
    'intent_code',
    'entity_code'
  ];
  
  const checkObject = (obj: any, path: string = ''): void => {
    if (!obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check if key is forbidden
      if (forbiddenFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        violations.push(`Forbidden field found: ${currentPath}`);
      }
      
      // Recursively check nested objects
      if (value && typeof value === 'object') {
        checkObject(value, currentPath);
      }
    }
  };
  
  checkObject(nluOutput);
  
  return violations;
}
