/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDIT LOGGER - Complete Turn Logging for Debugging & Compliance
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Logs every turn for debugging and compliance verification.
 * Captures: NLU output, locked intent, symbolic decision, validation results.
 * 
 * Philosophy: "Symbolic Brain decides, AI only explains" - AUDIT TRAIL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const AUDIT_LOGGER_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface NLUContractOutput {
  intent_label: string;
  observations: string[];
  confidence: number;
}

export interface TurnAuditLog {
  turn_id: string;
  session_id: string;
  farmer_id: string;
  tenant_id: string;
  trace_id: string;
  
  // Original input
  farmer_message: string;
  detected_language: 'mr' | 'hi' | 'en';
  
  // NLU Output (Contract-compliant)
  nlu_output: NLUContractOutput;
  
  // Intent Lock
  locked_intent: string;
  allowed_scopes: string[];
  forbidden_actions: string[];
  
  // Symbolic Decision
  symbolic_decision_id?: string;
  rules_fired: string[];
  actions_returned: any[];
  actions_filtered_out: any[];
  
  // Cause Mapping (Observation → Cause)
  observation_mapping?: {
    cause_codes: string[];
    cause_type: string;
    confidence: number;
    matched_patterns: string[];
  };
  
  // Validation
  validation_passed: boolean;
  validation_errors: string[];
  
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
    detected_language: 'mr' | 'hi' | 'en';
    land_id?: string;
  }): void {
    this.currentTurn = {
      ...params,
      timestamp: new Date().toISOString(),
      agents_used: [],
      rules_fired: [],
      actions_returned: [],
      actions_filtered_out: [],
      validation_errors: [],
      validation_passed: false
    };
    
    console.log(`📋 [Audit] Turn started: ${params.turn_id}`);
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
   * Log validation result
   */
  logValidation(result: {
    passed: boolean;
    errors: string[];
  }): void {
    this.currentTurn.validation_passed = result.passed;
    this.currentTurn.validation_errors = result.errors;
    this.addAgent('VALIDATION_GATE');
    
    console.log(`📋 [Audit] Validation: ${result.passed ? 'PASSED' : 'FAILED'}`);
    if (!result.passed) {
      console.log(`   Errors: ${result.errors.join(', ')}`);
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
   * Save audit log to database
   */
  private async saveToDatabase(log: TurnAuditLog): Promise<void> {
    // Try to insert into audit table
    // Table may not exist yet - that's OK
    const { error } = await this.supabase
      .from('ai_chat_audit_logs')
      .insert({
        turn_id: log.turn_id,
        session_id: log.session_id,
        farmer_id: log.farmer_id,
        tenant_id: log.tenant_id,
        trace_id: log.trace_id,
        farmer_message: log.farmer_message,
        detected_language: log.detected_language,
        intent_label: log.nlu_output?.intent_label,
        observations: log.nlu_output?.observations,
        nlu_confidence: log.nlu_output?.confidence,
        locked_intent: log.locked_intent,
        allowed_scopes: log.allowed_scopes,
        forbidden_actions: log.forbidden_actions,
        symbolic_decision_id: log.symbolic_decision_id,
        rules_fired: log.rules_fired,
        actions_returned: log.actions_returned,
        actions_filtered_out: log.actions_filtered_out,
        observation_mapping: log.observation_mapping,
        validation_passed: log.validation_passed,
        validation_errors: log.validation_errors,
        response_source: log.response_source,
        response_language_match: log.response_language_match,
        llm_model_used: log.llm_model_used,
        processing_time_ms: log.processing_time_ms,
        agents_used: log.agents_used,
        land_id: log.land_id,
        crop_code: log.crop_code,
        growth_stage: log.growth_stage,
        created_at: log.timestamp
      });
    
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
