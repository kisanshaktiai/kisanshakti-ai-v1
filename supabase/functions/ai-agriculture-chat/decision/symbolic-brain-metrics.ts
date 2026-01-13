/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYMBOLIC BRAIN HEALTH METRICS (STEP 5)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Lightweight observability for the symbolic decision brain.
 * Track metrics for audit and scaling readiness without affecting latency.
 * 
 * METRICS TRACKED:
 * 1. Response resolved without clarification
 * 2. Number of clarification questions per decision
 * 3. Confidence before and after clarification
 * 4. Rules fired vs recommendations returned
 * 5. Fallback vs rule-driven clarification usage
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const BRAIN_METRICS_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionMetrics {
  trace_id: string;
  session_id: string;
  land_id: string | null;
  
  // Resolution metrics
  resolved_without_clarification: boolean;
  clarification_count: number;
  clarification_sources: ('RULE_DRIVEN' | 'FALLBACK' | 'TEMPLATE')[];
  
  // Confidence metrics
  initial_confidence: number;
  pre_clarification_confidence: number;
  post_clarification_confidence: number;
  final_confidence: number;
  
  // Rule metrics
  rules_evaluated: number;
  rules_fired: number;
  recommendations_returned: number;
  prescriptions_blocked: number;
  
  // Timing
  started_at: number;
  completed_at: number;
  total_duration_ms: number;
  
  // Context
  crop_code: string;
  growth_stage: string;
  symptoms_count: number;
  
  // Flags
  invariant_violations: number;
  context_recovered: boolean;
  used_locked_diagnosis: boolean;
}

export interface AggregateMetrics {
  period_start: number;
  period_end: number;
  total_decisions: number;
  
  // Resolution rates
  direct_resolution_rate: number;
  avg_clarifications_per_decision: number;
  
  // Clarification sources
  rule_driven_clarification_pct: number;
  fallback_clarification_pct: number;
  
  // Confidence improvements
  avg_confidence_boost_from_clarification: number;
  
  // Rule effectiveness
  avg_rules_fired: number;
  recommendation_delivery_rate: number;
  prescription_block_rate: number;
  
  // Health indicators
  invariant_violation_rate: number;
  context_recovery_rate: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// METRICS COLLECTION
// ═══════════════════════════════════════════════════════════════════════════

// In-memory metrics buffer (last 1000 entries)
const _metricsBuffer: DecisionMetrics[] = [];
const MAX_BUFFER_SIZE = 1000;

// Current decision being tracked
let _currentMetrics: Partial<DecisionMetrics> | null = null;

/**
 * Start tracking a new decision.
 */
export function startDecisionTracking(
  traceId: string,
  sessionId: string,
  landId: string | null
): void {
  _currentMetrics = {
    trace_id: traceId,
    session_id: sessionId,
    land_id: landId,
    resolved_without_clarification: true, // Assume true until clarification happens
    clarification_count: 0,
    clarification_sources: [],
    initial_confidence: 0,
    pre_clarification_confidence: 0,
    post_clarification_confidence: 0,
    final_confidence: 0,
    rules_evaluated: 0,
    rules_fired: 0,
    recommendations_returned: 0,
    prescriptions_blocked: 0,
    started_at: Date.now(),
    completed_at: 0,
    total_duration_ms: 0,
    crop_code: 'UNKNOWN',
    growth_stage: 'UNKNOWN',
    symptoms_count: 0,
    invariant_violations: 0,
    context_recovered: false,
    used_locked_diagnosis: false
  };
  
  console.log(`📊 [Metrics] Started tracking decision: ${traceId}`);
}

/**
 * Record initial context for the decision.
 */
export function recordContext(
  cropCode: string,
  growthStage: string,
  symptomsCount: number
): void {
  if (!_currentMetrics) return;
  
  _currentMetrics.crop_code = cropCode;
  _currentMetrics.growth_stage = growthStage;
  _currentMetrics.symptoms_count = symptomsCount;
}

/**
 * Record initial confidence score.
 */
export function recordInitialConfidence(confidence: number): void {
  if (!_currentMetrics) return;
  
  _currentMetrics.initial_confidence = confidence;
  _currentMetrics.pre_clarification_confidence = confidence;
  
  console.log(`📊 [Metrics] Initial confidence: ${(confidence * 100).toFixed(0)}%`);
}

/**
 * Record that clarification was triggered.
 */
export function recordClarificationTriggered(
  source: 'RULE_DRIVEN' | 'FALLBACK' | 'TEMPLATE'
): void {
  if (!_currentMetrics) return;
  
  _currentMetrics.resolved_without_clarification = false;
  _currentMetrics.clarification_count = (_currentMetrics.clarification_count || 0) + 1;
  _currentMetrics.clarification_sources = [
    ...(_currentMetrics.clarification_sources || []),
    source
  ];
  
  console.log(`📊 [Metrics] Clarification triggered (${source}) - count: ${_currentMetrics.clarification_count}`);
}

/**
 * Record pre-clarification confidence (before farmer responds).
 */
export function recordPreClarificationConfidence(confidence: number): void {
  if (!_currentMetrics) return;
  
  _currentMetrics.pre_clarification_confidence = confidence;
}

/**
 * Record post-clarification confidence (after farmer responds).
 */
export function recordPostClarificationConfidence(confidence: number): void {
  if (!_currentMetrics) return;
  
  _currentMetrics.post_clarification_confidence = confidence;
  
  const boost = confidence - (_currentMetrics.pre_clarification_confidence || 0);
  console.log(`📊 [Metrics] Post-clarification confidence: ${(confidence * 100).toFixed(0)}% (boost: ${(boost * 100).toFixed(0)}%)`);
}

/**
 * Record rule evaluation results.
 */
export function recordRuleEvaluation(
  rulesEvaluated: number,
  rulesFired: number,
  recommendationsReturned: number,
  prescriptionsBlocked: number = 0
): void {
  if (!_currentMetrics) return;
  
  _currentMetrics.rules_evaluated = rulesEvaluated;
  _currentMetrics.rules_fired = rulesFired;
  _currentMetrics.recommendations_returned = recommendationsReturned;
  _currentMetrics.prescriptions_blocked = prescriptionsBlocked;
  
  console.log(`📊 [Metrics] Rules: evaluated=${rulesEvaluated}, fired=${rulesFired}, recommendations=${recommendationsReturned}, blocked=${prescriptionsBlocked}`);
}

/**
 * Record invariant violation.
 */
export function recordInvariantViolation(recovered: boolean): void {
  if (!_currentMetrics) return;
  
  _currentMetrics.invariant_violations = (_currentMetrics.invariant_violations || 0) + 1;
  if (recovered) {
    _currentMetrics.context_recovered = true;
  }
  
  console.log(`📊 [Metrics] Invariant violation (recovered: ${recovered})`);
}

/**
 * Record that locked diagnosis was used.
 */
export function recordLockedDiagnosisUsed(): void {
  if (!_currentMetrics) return;
  
  _currentMetrics.used_locked_diagnosis = true;
}

/**
 * Complete decision tracking and add to buffer.
 */
export function completeDecisionTracking(finalConfidence: number): DecisionMetrics | null {
  if (!_currentMetrics) return null;
  
  _currentMetrics.final_confidence = finalConfidence;
  _currentMetrics.completed_at = Date.now();
  _currentMetrics.total_duration_ms = _currentMetrics.completed_at - (_currentMetrics.started_at || 0);
  
  const completedMetrics = _currentMetrics as DecisionMetrics;
  
  // Add to buffer
  _metricsBuffer.push(completedMetrics);
  
  // Maintain buffer size
  if (_metricsBuffer.length > MAX_BUFFER_SIZE) {
    _metricsBuffer.shift();
  }
  
  // Log summary
  console.log(`📊 [Metrics] Decision completed:`);
  console.log(`   Duration: ${completedMetrics.total_duration_ms}ms`);
  console.log(`   Resolved without clarification: ${completedMetrics.resolved_without_clarification}`);
  console.log(`   Clarification count: ${completedMetrics.clarification_count}`);
  console.log(`   Confidence: ${(completedMetrics.initial_confidence * 100).toFixed(0)}% → ${(completedMetrics.final_confidence * 100).toFixed(0)}%`);
  console.log(`   Rules fired: ${completedMetrics.rules_fired}, Recommendations: ${completedMetrics.recommendations_returned}`);
  
  _currentMetrics = null;
  
  return completedMetrics;
}

/**
 * Get the current decision metrics (for mid-decision queries).
 */
export function getCurrentMetrics(): Partial<DecisionMetrics> | null {
  return _currentMetrics;
}

/**
 * Get recent decision metrics.
 */
export function getRecentMetrics(count: number = 100): DecisionMetrics[] {
  return _metricsBuffer.slice(-count);
}

/**
 * Calculate aggregate metrics for a time period.
 */
export function calculateAggregateMetrics(
  periodStartMs: number,
  periodEndMs: number
): AggregateMetrics {
  const periodMetrics = _metricsBuffer.filter(
    m => m.started_at >= periodStartMs && m.started_at <= periodEndMs
  );
  
  if (periodMetrics.length === 0) {
    return {
      period_start: periodStartMs,
      period_end: periodEndMs,
      total_decisions: 0,
      direct_resolution_rate: 0,
      avg_clarifications_per_decision: 0,
      rule_driven_clarification_pct: 0,
      fallback_clarification_pct: 0,
      avg_confidence_boost_from_clarification: 0,
      avg_rules_fired: 0,
      recommendation_delivery_rate: 0,
      prescription_block_rate: 0,
      invariant_violation_rate: 0,
      context_recovery_rate: 0
    };
  }
  
  const totalDecisions = periodMetrics.length;
  
  // Resolution rates
  const directResolutions = periodMetrics.filter(m => m.resolved_without_clarification).length;
  const directResolutionRate = directResolutions / totalDecisions;
  
  const totalClarifications = periodMetrics.reduce((sum, m) => sum + m.clarification_count, 0);
  const avgClarificationsPerDecision = totalClarifications / totalDecisions;
  
  // Clarification sources
  const allSources = periodMetrics.flatMap(m => m.clarification_sources);
  const ruleDrivenCount = allSources.filter(s => s === 'RULE_DRIVEN').length;
  const fallbackCount = allSources.filter(s => s === 'FALLBACK').length;
  const totalSources = allSources.length || 1;
  
  // Confidence improvements
  const clarifiedMetrics = periodMetrics.filter(m => !m.resolved_without_clarification);
  const avgConfidenceBoost = clarifiedMetrics.length > 0
    ? clarifiedMetrics.reduce((sum, m) => sum + (m.post_clarification_confidence - m.pre_clarification_confidence), 0) / clarifiedMetrics.length
    : 0;
  
  // Rule effectiveness
  const avgRulesFired = periodMetrics.reduce((sum, m) => sum + m.rules_fired, 0) / totalDecisions;
  const withRulesFired = periodMetrics.filter(m => m.rules_fired > 0);
  const withRecommendations = withRulesFired.filter(m => m.recommendations_returned > 0);
  const recommendationDeliveryRate = withRulesFired.length > 0
    ? withRecommendations.length / withRulesFired.length
    : 1;
  
  const totalPrescriptionsBlocked = periodMetrics.reduce((sum, m) => sum + m.prescriptions_blocked, 0);
  const totalRulesFired = periodMetrics.reduce((sum, m) => sum + m.rules_fired, 0);
  const prescriptionBlockRate = totalRulesFired > 0
    ? totalPrescriptionsBlocked / totalRulesFired
    : 0;
  
  // Health indicators
  const withViolations = periodMetrics.filter(m => m.invariant_violations > 0).length;
  const withRecovery = periodMetrics.filter(m => m.context_recovered).length;
  
  return {
    period_start: periodStartMs,
    period_end: periodEndMs,
    total_decisions: totalDecisions,
    direct_resolution_rate: directResolutionRate,
    avg_clarifications_per_decision: avgClarificationsPerDecision,
    rule_driven_clarification_pct: ruleDrivenCount / totalSources,
    fallback_clarification_pct: fallbackCount / totalSources,
    avg_confidence_boost_from_clarification: avgConfidenceBoost,
    avg_rules_fired: avgRulesFired,
    recommendation_delivery_rate: recommendationDeliveryRate,
    prescription_block_rate: prescriptionBlockRate,
    invariant_violation_rate: withViolations / totalDecisions,
    context_recovery_rate: withViolations > 0 ? withRecovery / withViolations : 1
  };
}

/**
 * Log aggregate metrics summary.
 */
export function logMetricsSummary(): void {
  const lastHour = Date.now() - 60 * 60 * 1000;
  const aggregate = calculateAggregateMetrics(lastHour, Date.now());
  
  console.log(`📊 [Metrics] === LAST HOUR SUMMARY ===`);
  console.log(`   Total decisions: ${aggregate.total_decisions}`);
  console.log(`   Direct resolution rate: ${(aggregate.direct_resolution_rate * 100).toFixed(1)}%`);
  console.log(`   Avg clarifications/decision: ${aggregate.avg_clarifications_per_decision.toFixed(2)}`);
  console.log(`   Rule-driven clarification: ${(aggregate.rule_driven_clarification_pct * 100).toFixed(1)}%`);
  console.log(`   Avg confidence boost: ${(aggregate.avg_confidence_boost_from_clarification * 100).toFixed(1)}%`);
  console.log(`   Avg rules fired: ${aggregate.avg_rules_fired.toFixed(1)}`);
  console.log(`   Recommendation delivery rate: ${(aggregate.recommendation_delivery_rate * 100).toFixed(1)}%`);
  console.log(`   Invariant violation rate: ${(aggregate.invariant_violation_rate * 100).toFixed(1)}%`);
}
