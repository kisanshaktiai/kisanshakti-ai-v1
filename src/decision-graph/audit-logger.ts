/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDIT LOGGER - Decision Audit Trail
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Logs all decision graph executions for:
 * - Regulatory compliance (traceability)
 * - Feedback loop learning
 * - Performance monitoring
 * - Debug and support
 * 
 * CRITICAL: Every advisory MUST be logged before returning to caller
 * 
 * Version: 1.0.0
 */

import { 
  UnifiedAdvisory, 
  DecisionInput,
  Cause,
  Action,
  PrioritizedAction,
  RiskLevel,
  ENGINE_VERSION
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditLogEntry {
  // Identity
  log_id: string;
  advisory_id: string;
  timestamp: string;
  
  // Context
  farmer_id: string;
  land_id: string;
  tenant_id: string;
  
  // Input Summary
  input_hash: string;  // For deduplication
  crop_code: string;
  crop_stage: string;
  farming_mode: string;
  days_after_sowing: number;
  
  // Input States
  ndvi_state: string;
  ndvi_trend: string;
  weather_state: string;
  soil_n: string;
  soil_p: string;
  soil_k: string;
  soil_moisture: string;
  
  // Output Summary
  causes_count: number;
  causes: string[];
  actions_count: number;
  actions: string[];
  risk_level: string;
  confidence: number;
  primary_concern: string | null;
  
  // Execution Metrics
  execution_time_ms: number;
  rules_applied_count: number;
  rules_applied: string[];
  conflicts_resolved_count: number;
  conflicts_resolved: string[];
  
  // Regional
  agro_climatic_zone: string | null;
  regional_modifications: string[];
  
  // Engine Info
  engine_version: string;
  
  // AI Augmentation (if any)
  ai_adjusted: boolean;
  ai_model: string | null;
  ai_priority_changes: number;
  ai_confidence_delta: number;
}

export interface AuditLogBatch {
  batch_id: string;
  created_at: string;
  entries: AuditLogEntry[];
  count: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// IN-MEMORY BUFFER (For offline-first operation)
// ═══════════════════════════════════════════════════════════════════════════

const LOG_BUFFER: AuditLogEntry[] = [];
const MAX_BUFFER_SIZE = 100;
let lastFlushTime = Date.now();
const FLUSH_INTERVAL_MS = 60000; // 1 minute

// ═══════════════════════════════════════════════════════════════════════════
// HASH GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function generateLogId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `AL_${timestamp}_${random}`;
}

/**
 * Generate hash of input for deduplication
 */
function hashInput(input: DecisionInput): string {
  const key = [
    input.land_id,
    input.crop_code,
    input.crop_stage,
    input.days_after_sowing,
    input.ndvi_state,
    input.ndvi_trend,
    input.weather_state,
    input.soil_states.n,
    input.soil_states.p,
    input.soil_states.k,
    input.soil_states.moisture
  ].join('|');
  
  // Simple hash for deduplication
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ═══════════════════════════════════════════════════════════════════════════
// LOG DECISION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log a decision execution
 * 
 * This function MUST be called for every advisory generated.
 * It operates offline-first, buffering logs until they can be persisted.
 * 
 * @param advisory - The generated advisory
 * @param executionTimeMs - Execution time in milliseconds
 * @param input - Original input (for detailed logging)
 * @param regionalModifications - Regional modifications applied
 */
export async function logDecision(
  advisory: UnifiedAdvisory,
  executionTimeMs: number,
  input?: DecisionInput,
  regionalModifications?: string[]
): Promise<void> {
  const entry: AuditLogEntry = {
    // Identity
    log_id: generateLogId(),
    advisory_id: advisory.advisory_id,
    timestamp: advisory.generated_at,
    
    // Context - from advisory facts or input
    farmer_id: input?.farmer_id || 'unknown',
    land_id: input?.land_id || 'unknown',
    tenant_id: input?.tenant_id || 'unknown',
    
    // Input Summary
    input_hash: input ? hashInput(input) : 'no_input',
    crop_code: advisory.facts.crop_code,
    crop_stage: advisory.facts.crop_stage,
    farming_mode: advisory.facts.farming_mode,
    days_after_sowing: advisory.facts.days_after_sowing,
    
    // Input States
    ndvi_state: advisory.facts.ndvi_state,
    ndvi_trend: advisory.facts.ndvi_trend,
    weather_state: advisory.facts.weather_state,
    soil_n: advisory.facts.soil_states.n,
    soil_p: advisory.facts.soil_states.p,
    soil_k: advisory.facts.soil_states.k,
    soil_moisture: advisory.facts.soil_states.moisture,
    
    // Output Summary
    causes_count: advisory.causes.length,
    causes: advisory.causes.map(c => c as string),
    actions_count: advisory.actions.length,
    actions: advisory.actions.map(a => a.action as string),
    risk_level: advisory.risk_level,
    confidence: advisory.confidence,
    primary_concern: advisory.primary_concern || null,
    
    // Execution Metrics
    execution_time_ms: executionTimeMs,
    rules_applied_count: advisory.rules_applied.length,
    rules_applied: advisory.rules_applied,
    conflicts_resolved_count: advisory.conflicts_resolved.length,
    conflicts_resolved: advisory.conflicts_resolved,
    
    // Regional
    agro_climatic_zone: input?.agro_climatic_zone || null,
    regional_modifications: regionalModifications || [],
    
    // Engine Info
    engine_version: advisory.engine_version,
    
    // AI Augmentation
    ai_adjusted: !!advisory.ai_adjustments,
    ai_model: advisory.ai_adjustments?.model_used || null,
    ai_priority_changes: advisory.ai_adjustments?.priority_changes || 0,
    ai_confidence_delta: advisory.ai_adjustments?.confidence_delta || 0
  };
  
  // Add to buffer
  LOG_BUFFER.push(entry);
  
  // Flush if buffer is full or interval elapsed
  if (
    LOG_BUFFER.length >= MAX_BUFFER_SIZE ||
    Date.now() - lastFlushTime > FLUSH_INTERVAL_MS
  ) {
    await flushLogBuffer();
  }
}

/**
 * Synchronous version for offline execution
 */
export function logDecisionSync(
  advisory: UnifiedAdvisory,
  executionTimeMs: number,
  input?: DecisionInput,
  regionalModifications?: string[]
): void {
  // Same logic as async, just don't await flush
  const entry: AuditLogEntry = {
    log_id: generateLogId(),
    advisory_id: advisory.advisory_id,
    timestamp: advisory.generated_at,
    farmer_id: input?.farmer_id || 'unknown',
    land_id: input?.land_id || 'unknown',
    tenant_id: input?.tenant_id || 'unknown',
    input_hash: input ? hashInput(input) : 'no_input',
    crop_code: advisory.facts.crop_code,
    crop_stage: advisory.facts.crop_stage,
    farming_mode: advisory.facts.farming_mode,
    days_after_sowing: advisory.facts.days_after_sowing,
    ndvi_state: advisory.facts.ndvi_state,
    ndvi_trend: advisory.facts.ndvi_trend,
    weather_state: advisory.facts.weather_state,
    soil_n: advisory.facts.soil_states.n,
    soil_p: advisory.facts.soil_states.p,
    soil_k: advisory.facts.soil_states.k,
    soil_moisture: advisory.facts.soil_states.moisture,
    causes_count: advisory.causes.length,
    causes: advisory.causes.map(c => c as string),
    actions_count: advisory.actions.length,
    actions: advisory.actions.map(a => a.action as string),
    risk_level: advisory.risk_level,
    confidence: advisory.confidence,
    primary_concern: advisory.primary_concern || null,
    execution_time_ms: executionTimeMs,
    rules_applied_count: advisory.rules_applied.length,
    rules_applied: advisory.rules_applied,
    conflicts_resolved_count: advisory.conflicts_resolved.length,
    conflicts_resolved: advisory.conflicts_resolved,
    agro_climatic_zone: input?.agro_climatic_zone || null,
    regional_modifications: regionalModifications || [],
    engine_version: advisory.engine_version,
    ai_adjusted: !!advisory.ai_adjustments,
    ai_model: advisory.ai_adjustments?.model_used || null,
    ai_priority_changes: advisory.ai_adjustments?.priority_changes || 0,
    ai_confidence_delta: advisory.ai_adjustments?.confidence_delta || 0
  };
  
  LOG_BUFFER.push(entry);
  
  // Trim buffer if too large (don't block on flush)
  if (LOG_BUFFER.length > MAX_BUFFER_SIZE * 2) {
    LOG_BUFFER.splice(0, MAX_BUFFER_SIZE);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BUFFER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Flush log buffer to persistent storage
 * 
 * In production, this would write to IndexedDB or send to server
 */
async function flushLogBuffer(): Promise<void> {
  if (LOG_BUFFER.length === 0) return;
  
  const batch: AuditLogBatch = {
    batch_id: `BATCH_${Date.now().toString(36)}`,
    created_at: new Date().toISOString(),
    entries: [...LOG_BUFFER],
    count: LOG_BUFFER.length
  };
  
  try {
    // In production: persist to IndexedDB or send to server
    await persistLogBatch(batch);
    
    // Clear buffer after successful persist
    LOG_BUFFER.length = 0;
    lastFlushTime = Date.now();
    
  } catch (error) {
    console.error('Failed to flush audit log buffer:', error);
    // Keep logs in buffer for retry
  }
}

/**
 * Persist log batch (stub for actual implementation)
 */
async function persistLogBatch(batch: AuditLogBatch): Promise<void> {
  // In production, implement one of:
  // 1. IndexedDB for offline storage
  // 2. Supabase insert for cloud persistence
  // 3. Local file for mobile apps
  
  // For now, log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[AuditLog] Batch ${batch.batch_id}: ${batch.count} entries`);
  }
  
  // Store in localStorage as fallback (limited, but works offline)
  try {
    const key = `audit_log_${batch.batch_id}`;
    const existing = localStorage.getItem('audit_log_batches');
    const batches: string[] = existing ? JSON.parse(existing) : [];
    batches.push(key);
    
    // Keep only last 50 batches
    while (batches.length > 50) {
      const oldKey = batches.shift();
      if (oldKey) localStorage.removeItem(oldKey);
    }
    
    localStorage.setItem('audit_log_batches', JSON.stringify(batches));
    localStorage.setItem(key, JSON.stringify(batch));
  } catch (e) {
    // localStorage might be full or unavailable
    console.warn('localStorage audit log storage failed:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get recent audit logs from buffer
 */
export function getRecentLogs(limit: number = 10): AuditLogEntry[] {
  return LOG_BUFFER.slice(-limit);
}

/**
 * Get log by advisory ID
 */
export function getLogByAdvisoryId(advisoryId: string): AuditLogEntry | null {
  return LOG_BUFFER.find(entry => entry.advisory_id === advisoryId) || null;
}

/**
 * Get logs for a specific land
 */
export function getLogsForLand(landId: string): AuditLogEntry[] {
  return LOG_BUFFER.filter(entry => entry.land_id === landId);
}

/**
 * Get execution time statistics
 */
export function getExecutionStats(): {
  count: number;
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  p95_ms: number;
} {
  if (LOG_BUFFER.length === 0) {
    return { count: 0, avg_ms: 0, min_ms: 0, max_ms: 0, p95_ms: 0 };
  }
  
  const times = LOG_BUFFER.map(e => e.execution_time_ms).sort((a, b) => a - b);
  const count = times.length;
  const sum = times.reduce((a, b) => a + b, 0);
  const p95Index = Math.floor(count * 0.95);
  
  return {
    count,
    avg_ms: Math.round(sum / count),
    min_ms: times[0],
    max_ms: times[count - 1],
    p95_ms: times[p95Index] || times[count - 1]
  };
}

/**
 * Get cause frequency from logs
 */
export function getCauseFrequency(): Map<string, number> {
  const frequency = new Map<string, number>();
  
  for (const entry of LOG_BUFFER) {
    for (const cause of entry.causes) {
      frequency.set(cause, (frequency.get(cause) || 0) + 1);
    }
  }
  
  return frequency;
}

/**
 * Get action frequency from logs
 */
export function getActionFrequency(): Map<string, number> {
  const frequency = new Map<string, number>();
  
  for (const entry of LOG_BUFFER) {
    for (const action of entry.actions) {
      frequency.set(action, (frequency.get(action) || 0) + 1);
    }
  }
  
  return frequency;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export logs as JSON
 */
export function exportLogsAsJson(): string {
  return JSON.stringify({
    exported_at: new Date().toISOString(),
    engine_version: ENGINE_VERSION,
    count: LOG_BUFFER.length,
    entries: LOG_BUFFER
  }, null, 2);
}

/**
 * Export logs as CSV
 */
export function exportLogsAsCsv(): string {
  if (LOG_BUFFER.length === 0) return '';
  
  const headers = [
    'log_id', 'advisory_id', 'timestamp', 'farmer_id', 'land_id',
    'crop_code', 'crop_stage', 'days_after_sowing', 'farming_mode',
    'ndvi_state', 'weather_state', 'risk_level', 'confidence',
    'causes_count', 'actions_count', 'execution_time_ms',
    'rules_applied_count', 'conflicts_resolved_count'
  ];
  
  const rows = LOG_BUFFER.map(entry => [
    entry.log_id,
    entry.advisory_id,
    entry.timestamp,
    entry.farmer_id,
    entry.land_id,
    entry.crop_code,
    entry.crop_stage,
    entry.days_after_sowing,
    entry.farming_mode,
    entry.ndvi_state,
    entry.weather_state,
    entry.risk_level,
    entry.confidence,
    entry.causes_count,
    entry.actions_count,
    entry.execution_time_ms,
    entry.rules_applied_count,
    entry.conflicts_resolved_count
  ].join(','));
  
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Clear all logs (for testing only)
 */
export function clearLogs(): void {
  LOG_BUFFER.length = 0;
  lastFlushTime = Date.now();
}

/**
 * Get buffer size
 */
export function getBufferSize(): number {
  return LOG_BUFFER.length;
}

/**
 * Force flush (for graceful shutdown)
 */
export async function forceFlush(): Promise<void> {
  await flushLogBuffer();
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  logDecision as default
};
