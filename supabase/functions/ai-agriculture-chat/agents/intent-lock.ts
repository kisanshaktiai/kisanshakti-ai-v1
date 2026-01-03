/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTENT LOCK LAYER - Enforces "Symbolic Brain decides, AI only explains"
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Once an intent_label is produced for a turn, it is LOCKED.
 * The symbolic brain must evaluate only rules scoped to that intent.
 * This prevents intent mixing (e.g., irrigation queries producing pest advice).
 */

export const INTENT_LOCK_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface IntentLock {
  turn_id: string;
  locked_intent: string;
  locked_at: number;
  allowed_rule_scopes: string[];
  allowed_action_types: string[];
  forbidden_action_types: string[];
  confidence: number;
}

export interface IntentLockValidation {
  passed: boolean;
  violations: string[];
  filtered_actions: any[];
}

// ═══════════════════════════════════════════════════════════════════════════
// INTENT → SCOPE MAPPING (Deterministic, No AI)
// ═══════════════════════════════════════════════════════════════════════════

const INTENT_SCOPE_MAP: Record<string, {
  allowed_scopes: string[];
  allowed_actions: string[];
  forbidden_actions: string[];
}> = {
  // Pest problems - only pest-related rules and actions
  'PEST_PROBLEM': {
    allowed_scopes: ['PEST', 'IPM', 'BIOCONTROL', 'CHEMICAL_PEST', 'CULTURAL'],
    allowed_actions: ['SPRAY', 'APPLY', 'RELEASE', 'MONITOR', 'REMOVE', 'TRAP', 'CULTURAL_PRACTICE'],
    forbidden_actions: ['HARVEST', 'IRRIGATE', 'FERTILIZE', 'SELL']
  },
  
  // Disease problems - only disease-related rules
  'DISEASE_PROBLEM': {
    allowed_scopes: ['DISEASE', 'FUNGICIDE', 'BACTERICIDE', 'CULTURAL'],
    allowed_actions: ['SPRAY', 'APPLY', 'REMOVE', 'MONITOR', 'CULTURAL_PRACTICE'],
    forbidden_actions: ['HARVEST', 'IRRIGATE', 'FERTILIZE', 'SELL']
  },
  
  // Irrigation/Water issues - only irrigation rules
  'WATER_ISSUE': {
    allowed_scopes: ['IRRIGATION', 'WATER_MANAGEMENT', 'DRAINAGE'],
    allowed_actions: ['IRRIGATE', 'DRAIN', 'MULCH', 'MONITOR'],
    forbidden_actions: ['SPRAY', 'HARVEST', 'SELL', 'APPLY_PESTICIDE']
  },
  
  // Nutrient issues - only fertilizer rules
  'NUTRIENT_ISSUE': {
    allowed_scopes: ['FERTILIZER', 'NUTRIENT', 'SOIL_AMENDMENT'],
    allowed_actions: ['FERTILIZE', 'APPLY', 'SOIL_TEST', 'MONITOR'],
    forbidden_actions: ['SPRAY_PESTICIDE', 'HARVEST', 'SELL']
  },
  
  // Weather queries - informational only
  'WEATHER_QUERY': {
    allowed_scopes: ['WEATHER', 'FORECAST', 'ADVISORY'],
    allowed_actions: ['INFORM', 'ADVISE', 'MONITOR', 'DELAY', 'SCHEDULE'],
    forbidden_actions: ['SPRAY', 'HARVEST', 'SELL', 'APPLY']
  },
  
  // Market queries - price/selling only
  'MARKET_QUERY': {
    allowed_scopes: ['MARKET', 'PRICE', 'TRADING'],
    allowed_actions: ['INFORM', 'ADVISE', 'SELL', 'STORE'],
    forbidden_actions: ['SPRAY', 'IRRIGATE', 'FERTILIZE']
  },
  
  // General queries - informational
  'GENERAL_QUERY': {
    allowed_scopes: ['GENERAL', 'INFORMATION', 'ADVISORY'],
    allowed_actions: ['INFORM', 'ADVISE', 'CLARIFY', 'MONITOR'],
    forbidden_actions: [] // Allow clarification for any topic
  },
  
  // CROP_HEALTH - "How is my crop?" queries
  // CRITICAL: This must allow FERTILIZE when soil shows deficiency
  // and allow IRRIGATE when NDVI shows stress
  'CROP_HEALTH': {
    allowed_scopes: ['GENERAL', 'INFORMATION', 'ADVISORY', 'NUTRIENT', 'FERTILIZER', 'IRRIGATION', 'HEALTH', 'NDVI'],
    allowed_actions: ['INFORM', 'ADVISE', 'CLARIFY', 'MONITOR', 'FERTILIZE', 'APPLY_FERTILIZER', 'IRRIGATE', 'APPLY', 'SOIL_TEST'],
    forbidden_actions: ['SPRAY', 'HARVEST', 'SELL'] // Don't recommend pesticides for general health check
  },
  
  // HEALTH_ASSESSMENT - Same as CROP_HEALTH (alias)
  'HEALTH_ASSESSMENT': {
    allowed_scopes: ['GENERAL', 'INFORMATION', 'ADVISORY', 'NUTRIENT', 'FERTILIZER', 'IRRIGATION', 'HEALTH', 'NDVI'],
    allowed_actions: ['INFORM', 'ADVISE', 'CLARIFY', 'MONITOR', 'FERTILIZE', 'APPLY_FERTILIZER', 'IRRIGATE', 'APPLY', 'SOIL_TEST'],
    forbidden_actions: ['SPRAY', 'HARVEST', 'SELL']
  },
  
  // Emergency - allows broader scope but still controlled
  'EMERGENCY': {
    allowed_scopes: ['PEST', 'DISEASE', 'IPM', 'CHEMICAL', 'CULTURAL', 'EMERGENCY', 'NUTRIENT', 'IRRIGATION'],
    allowed_actions: ['SPRAY', 'APPLY', 'REMOVE', 'MONITOR', 'CULTURAL_PRACTICE', 'EMERGENCY_ACTION', 'FERTILIZE', 'IRRIGATE'],
    forbidden_actions: ['HARVEST', 'SELL'] // Even in emergency, young crop shouldn't be harvested
  },
  
  // NDVI_CRITICAL - When NDVI is dangerously low, allow emergency actions
  'NDVI_CRITICAL': {
    allowed_scopes: ['EMERGENCY', 'NUTRIENT', 'FERTILIZER', 'IRRIGATION', 'HEALTH', 'ADVISORY'],
    allowed_actions: ['FERTILIZE', 'APPLY_FERTILIZER', 'IRRIGATE', 'MONITOR', 'ADVISE', 'EMERGENCY_ACTION', 'APPLY'],
    forbidden_actions: ['HARVEST', 'SELL', 'SPRAY'] // Don't spray on dying crop
  },
  
  // Greeting - no actions
  'GREETING': {
    allowed_scopes: ['GREETING', 'GENERAL'],
    allowed_actions: ['GREET', 'INFORM'],
    forbidden_actions: ['SPRAY', 'IRRIGATE', 'FERTILIZE', 'HARVEST', 'SELL']
  }
};

// Default for unknown intents
const DEFAULT_SCOPE = {
  allowed_scopes: ['GENERAL'],
  allowed_actions: ['INFORM', 'CLARIFY'],
  forbidden_actions: []
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lock an intent for the current turn
 * Once locked, only rules scoped to this intent can be evaluated
 */
export function lockIntent(
  intent_label: string,
  confidence: number = 1.0
): IntentLock {
  const turn_id = `turn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  // Normalize intent to uppercase for matching
  const normalizedIntent = intent_label.toUpperCase().replace(/\s+/g, '_');
  
  // Get scope configuration
  const scopeConfig = INTENT_SCOPE_MAP[normalizedIntent] || DEFAULT_SCOPE;
  
  const lock: IntentLock = {
    turn_id,
    locked_intent: normalizedIntent,
    locked_at: Date.now(),
    allowed_rule_scopes: scopeConfig.allowed_scopes,
    allowed_action_types: scopeConfig.allowed_actions,
    forbidden_action_types: scopeConfig.forbidden_actions,
    confidence
  };
  
  console.log(`🔒 [IntentLock] LOCKED intent: ${normalizedIntent}`);
  console.log(`   Allowed scopes: ${scopeConfig.allowed_scopes.join(', ')}`);
  console.log(`   Allowed actions: ${scopeConfig.allowed_actions.join(', ')}`);
  console.log(`   Forbidden actions: ${scopeConfig.forbidden_actions.join(', ')}`);
  
  return lock;
}

/**
 * Validate if a rule is allowed under the current intent lock
 */
export function validateRuleScope(
  rule_id: string,
  rule_scope: string,
  lock: IntentLock
): boolean {
  const normalizedScope = rule_scope.toUpperCase();
  
  // Check if rule scope is allowed
  const isAllowed = lock.allowed_rule_scopes.some(
    allowed => normalizedScope.includes(allowed) || allowed.includes(normalizedScope)
  );
  
  if (!isAllowed) {
    console.log(`🚫 [IntentLock] Rule ${rule_id} BLOCKED - scope ${rule_scope} not in allowed: ${lock.allowed_rule_scopes.join(', ')}`);
  }
  
  return isAllowed;
}

/**
 * Validate if an action type is allowed under the current intent lock
 */
export function validateActionType(
  action_type: string,
  lock: IntentLock
): { allowed: boolean; reason?: string } {
  const normalizedAction = action_type.toUpperCase().replace(/\s+/g, '_');
  
  // Check forbidden first (higher priority)
  const isForbidden = lock.forbidden_action_types.some(
    forbidden => normalizedAction.includes(forbidden) || forbidden.includes(normalizedAction)
  );
  
  if (isForbidden) {
    return {
      allowed: false,
      reason: `Action '${action_type}' is forbidden for intent '${lock.locked_intent}'`
    };
  }
  
  // Check if explicitly allowed
  const isAllowed = lock.allowed_action_types.some(
    allowed => normalizedAction.includes(allowed) || allowed.includes(normalizedAction)
  );
  
  // For non-forbidden actions, allow if in allowed list OR if it's a general informational action
  if (isAllowed || ['INFORM', 'MONITOR', 'ADVISE'].some(a => normalizedAction.includes(a))) {
    return { allowed: true };
  }
  
  return {
    allowed: false,
    reason: `Action '${action_type}' not in allowed list for intent '${lock.locked_intent}'`
  };
}

/**
 * Filter actions based on intent lock
 * Returns only actions that pass the intent scope validation
 */
export function filterActionsByIntentLock(
  actions: any[],
  lock: IntentLock
): IntentLockValidation {
  const violations: string[] = [];
  const filtered_actions: any[] = [];
  
  for (const action of actions) {
    const actionType = action.action_type || action.action || action.type || '';
    const validation = validateActionType(actionType, lock);
    
    if (validation.allowed) {
      filtered_actions.push(action);
    } else {
      violations.push(validation.reason || `Action ${actionType} blocked by intent lock`);
      console.log(`🚫 [IntentLock] Action BLOCKED: ${actionType} - ${validation.reason}`);
    }
  }
  
  const passed = violations.length === 0;
  
  if (!passed) {
    console.log(`⚠️ [IntentLock] ${violations.length} action(s) blocked by intent lock`);
  }
  
  return { passed, violations, filtered_actions };
}

/**
 * Filter rules based on intent lock scope
 * Returns only rules that are scoped to the locked intent
 */
export function filterRulesByIntentLock(
  rules: Array<{ rule_id: string; scope?: string; category?: string }>,
  lock: IntentLock
): Array<{ rule_id: string; scope?: string; category?: string }> {
  return rules.filter(rule => {
    const scope = rule.scope || rule.category || 'GENERAL';
    return validateRuleScope(rule.rule_id, scope, lock);
  });
}

/**
 * Check if the current intent lock allows a specific output field
 * Prevents LLM from adding content outside the intent scope
 */
export function validateOutputField(
  field_name: string,
  field_value: any,
  lock: IntentLock
): { allowed: boolean; reason?: string } {
  // Fields that should never be added by LLM
  const LLM_FORBIDDEN_FIELDS = [
    'percentage_effectiveness',
    'success_rate',
    'cure_rate',
    'efficacy_claim'
  ];
  
  if (LLM_FORBIDDEN_FIELDS.some(f => field_name.toLowerCase().includes(f))) {
    return {
      allowed: false,
      reason: `Field '${field_name}' cannot be generated - requires scientific validation`
    };
  }
  
  // Intent-specific field restrictions
  if (lock.locked_intent === 'WATER_ISSUE') {
    if (['pesticide', 'fungicide', 'insecticide'].some(p => 
      field_name.toLowerCase().includes(p) || String(field_value).toLowerCase().includes(p)
    )) {
      return {
        allowed: false,
        reason: `Pesticide fields not allowed for irrigation intent`
      };
    }
  }
  
  if (lock.locked_intent === 'PEST_PROBLEM' || lock.locked_intent === 'DISEASE_PROBLEM') {
    if (field_name.toLowerCase().includes('harvest') && 
        !String(field_value).toLowerCase().includes('phi')) {
      return {
        allowed: false,
        reason: `Harvest recommendations not allowed for pest/disease intent (except PHI warnings)`
      };
    }
  }
  
  return { allowed: true };
}

/**
 * Get human-readable description of what's allowed under current lock
 */
export function getIntentLockDescription(lock: IntentLock): string {
  return `Intent: ${lock.locked_intent}
Allowed Actions: ${lock.allowed_action_types.join(', ')}
Forbidden Actions: ${lock.forbidden_action_types.join(', ')}
Rule Scopes: ${lock.allowed_rule_scopes.join(', ')}`;
}

/**
 * Check if intent should trigger clarification (low confidence)
 */
export function requiresClarification(confidence: number): boolean {
  return confidence < 0.7;
}
