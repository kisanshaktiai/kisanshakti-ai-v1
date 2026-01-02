/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OUTCOME TRACKING SYSTEM (GAP 8.2)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Track recommendation outcomes for learning:
 * - Farmer action tracking (followed/ignored/modified)
 * - Outcome recording (success/failure/partial)
 * - Photo evidence collection
 * - Feedback loop to improve recommendations
 * 
 * Reference: FAO Monitoring & Evaluation Framework
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type FarmerActionType = 'FOLLOWED' | 'PARTIALLY_FOLLOWED' | 'MODIFIED' | 'IGNORED' | 'DELAYED';

export type OutcomeStatus = 'PENDING' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE' | 'UNKNOWN';

export interface RecommendationOutcome {
  outcome_id: string;
  recommendation_id: string;
  session_id: string;
  farmer_id: string;
  land_id?: string;
  tenant_id: string;
  
  // Original recommendation
  original_recommendation: {
    type: 'PEST_CONTROL' | 'DISEASE_CONTROL' | 'NUTRITION' | 'IRRIGATION' | 'GENERAL';
    action_recommended: string;
    product_name?: string;
    dose?: string;
    expected_outcome: string;
    confidence_at_recommendation: number;
  };
  
  // Farmer's action
  farmer_action: {
    action_type: FarmerActionType;
    action_date?: Date;
    products_actually_used?: string[];
    dose_actually_used?: string;
    modification_reason?: string;
    ignored_reason?: string;
    delay_days?: number;
    cost_incurred_inr?: number;
  };
  
  // Outcome after action
  outcome: {
    status: OutcomeStatus;
    recorded_date?: Date;
    days_after_action?: number;
    problem_resolved: boolean;
    improvement_percent?: number;  // 0-100
    side_effects?: string[];
    farmer_satisfaction?: number;  // 1-5
    farmer_notes?: string;
    photo_evidence?: string[];  // URLs
  };
  
  // Metadata
  created_at: Date;
  updated_at: Date;
  use_for_training: boolean;
  agronomist_reviewed: boolean;
  agronomist_notes?: string;
}

export interface OutcomeFollowUp {
  recommendation_id: string;
  farmer_id: string;
  follow_up_type: 'ACTION_CHECK' | 'OUTCOME_CHECK' | 'SATISFACTION_CHECK';
  scheduled_date: Date;
  message: {
    mr: string;
    hi: string;
    en: string;
  };
  options?: Array<{
    value: string;
    label: { mr: string; hi: string; en: string };
  }>;
}

export interface OutcomeStatistics {
  total_recommendations: number;
  followed_count: number;
  success_rate: number;  // Among followed
  avg_satisfaction: number;
  avg_improvement_percent: number;
  common_modifications: string[];
  common_ignore_reasons: string[];
  best_performing_recommendations: string[];
  needs_improvement: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP MESSAGE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

export const FOLLOW_UP_TEMPLATES = {
  action_check_24h: {
    mr: '🌾 नमस्कार! काल आम्ही {recommendation} सुचवले होते. तुम्ही हे केले का?',
    hi: '🌾 नमस्ते! कल हमने {recommendation} सुझाव दिया था। क्या आपने यह किया?',
    en: '🌾 Hello! Yesterday we recommended {recommendation}. Did you apply it?'
  },
  outcome_check_7d: {
    mr: '📊 {days} दिवसांपूर्वी तुम्ही {action} केले. पीक कसे आहे? समस्या सुटली का?',
    hi: '📊 {days} दिन पहले आपने {action} किया। फसल कैसी है? समस्या हल हुई?',
    en: '📊 {days} days ago you applied {action}. How is the crop? Is the problem resolved?'
  },
  photo_request: {
    mr: '📸 कृपया पिकाचा सध्याचा फोटो पाठवा - आम्हाला परिणाम पाहायचा आहे.',
    hi: '📸 कृपया फसल का वर्तमान फोटो भेजें - हम परिणाम देखना चाहते हैं।',
    en: '📸 Please send a current photo of the crop - we want to see the result.'
  },
  satisfaction_check: {
    mr: '⭐ आमच्या सल्ल्याबद्दल तुमचे मत काय आहे? (1-5 तारे)',
    hi: '⭐ हमारी सलाह के बारे में आपकी राय क्या है? (1-5 सितारे)',
    en: '⭐ How would you rate our advice? (1-5 stars)'
  }
};

export const ACTION_OPTIONS = [
  { value: 'FOLLOWED', label: { mr: '✅ हो, केले', hi: '✅ हाँ, किया', en: '✅ Yes, I did it' } },
  { value: 'PARTIALLY_FOLLOWED', label: { mr: '🔶 थोडे केले', hi: '🔶 कुछ किया', en: '🔶 Partially done' } },
  { value: 'MODIFIED', label: { mr: '🔄 वेगळे केले', hi: '🔄 कुछ और किया', en: '🔄 Did something different' } },
  { value: 'DELAYED', label: { mr: '⏳ उद्या करणार', hi: '⏳ कल करूंगा', en: '⏳ Will do tomorrow' } },
  { value: 'IGNORED', label: { mr: '❌ नाही केले', hi: '❌ नहीं किया', en: '❌ Did not do' } }
];

export const OUTCOME_OPTIONS = [
  { value: 'SUCCESS', label: { mr: '✅ समस्या सुटली', hi: '✅ समस्या हल हुई', en: '✅ Problem solved' } },
  { value: 'PARTIAL_SUCCESS', label: { mr: '🔶 थोडे सुधारले', hi: '🔶 कुछ सुधार हुआ', en: '🔶 Some improvement' } },
  { value: 'FAILURE', label: { mr: '❌ काम नाही केले', hi: '❌ काम नहीं किया', en: '❌ Did not work' } },
  { value: 'UNKNOWN', label: { mr: '🤔 माहीत नाही', hi: '🤔 पता नहीं', en: '🤔 Not sure' } }
];

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new outcome tracking record
 */
export function createOutcomeRecord(
  recommendationId: string,
  sessionId: string,
  farmerId: string,
  tenantId: string,
  recommendation: RecommendationOutcome['original_recommendation'],
  landId?: string
): RecommendationOutcome {
  return {
    outcome_id: `OUT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    recommendation_id: recommendationId,
    session_id: sessionId,
    farmer_id: farmerId,
    land_id: landId,
    tenant_id: tenantId,
    original_recommendation: recommendation,
    farmer_action: {
      action_type: 'IGNORED'  // Default until we get feedback
    },
    outcome: {
      status: 'PENDING',
      problem_resolved: false
    },
    created_at: new Date(),
    updated_at: new Date(),
    use_for_training: false,
    agronomist_reviewed: false
  };
}

/**
 * Generate follow-up messages
 */
export function generateFollowUps(
  outcome: RecommendationOutcome
): OutcomeFollowUp[] {
  const followUps: OutcomeFollowUp[] = [];
  const now = new Date();
  
  // Follow-up 1: Check if action taken (24 hours)
  const actionCheck = new Date(now);
  actionCheck.setHours(actionCheck.getHours() + 24);
  
  followUps.push({
    recommendation_id: outcome.recommendation_id,
    farmer_id: outcome.farmer_id,
    follow_up_type: 'ACTION_CHECK',
    scheduled_date: actionCheck,
    message: {
      mr: FOLLOW_UP_TEMPLATES.action_check_24h.mr.replace('{recommendation}', outcome.original_recommendation.action_recommended),
      hi: FOLLOW_UP_TEMPLATES.action_check_24h.hi.replace('{recommendation}', outcome.original_recommendation.action_recommended),
      en: FOLLOW_UP_TEMPLATES.action_check_24h.en.replace('{recommendation}', outcome.original_recommendation.action_recommended)
    },
    options: ACTION_OPTIONS
  });
  
  // Follow-up 2: Check outcome (7 days)
  const outcomeCheck = new Date(now);
  outcomeCheck.setDate(outcomeCheck.getDate() + 7);
  
  followUps.push({
    recommendation_id: outcome.recommendation_id,
    farmer_id: outcome.farmer_id,
    follow_up_type: 'OUTCOME_CHECK',
    scheduled_date: outcomeCheck,
    message: {
      mr: FOLLOW_UP_TEMPLATES.outcome_check_7d.mr
        .replace('{days}', '7')
        .replace('{action}', outcome.original_recommendation.action_recommended),
      hi: FOLLOW_UP_TEMPLATES.outcome_check_7d.hi
        .replace('{days}', '7')
        .replace('{action}', outcome.original_recommendation.action_recommended),
      en: FOLLOW_UP_TEMPLATES.outcome_check_7d.en
        .replace('{days}', '7')
        .replace('{action}', outcome.original_recommendation.action_recommended)
    },
    options: OUTCOME_OPTIONS
  });
  
  return followUps;
}

/**
 * Record farmer's action
 */
export function recordFarmerAction(
  outcome: RecommendationOutcome,
  actionType: FarmerActionType,
  details?: Partial<RecommendationOutcome['farmer_action']>
): RecommendationOutcome {
  return {
    ...outcome,
    farmer_action: {
      ...outcome.farmer_action,
      action_type: actionType,
      action_date: new Date(),
      ...details
    },
    updated_at: new Date()
  };
}

/**
 * Record outcome after action
 */
export function recordOutcome(
  outcome: RecommendationOutcome,
  status: OutcomeStatus,
  details: Partial<RecommendationOutcome['outcome']>
): RecommendationOutcome {
  const actionDate = outcome.farmer_action.action_date || outcome.created_at;
  const daysAfter = Math.floor((new Date().getTime() - actionDate.getTime()) / (1000 * 60 * 60 * 24));
  
  const updatedOutcome: RecommendationOutcome = {
    ...outcome,
    outcome: {
      ...outcome.outcome,
      status,
      recorded_date: new Date(),
      days_after_action: daysAfter,
      ...details
    },
    updated_at: new Date()
  };
  
  // Determine if suitable for training
  updatedOutcome.use_for_training = shouldUseForTraining(updatedOutcome);
  
  return updatedOutcome;
}

/**
 * Determine if outcome should be used for training
 */
export function shouldUseForTraining(outcome: RecommendationOutcome): boolean {
  // Use for training if:
  // 1. Farmer followed advice AND we have clear outcome
  // 2. OR farmer reported specific modification that worked better
  
  if (outcome.farmer_action.action_type === 'IGNORED') {
    return false;  // Can't learn from ignored advice
  }
  
  if (outcome.outcome.status === 'PENDING' || outcome.outcome.status === 'UNKNOWN') {
    return false;  // No clear outcome yet
  }
  
  if (outcome.farmer_action.action_type === 'FOLLOWED') {
    return true;  // Clear signal - advice followed with known outcome
  }
  
  if (outcome.farmer_action.action_type === 'MODIFIED' && outcome.outcome.status === 'SUCCESS') {
    return true;  // Farmer found better approach - valuable!
  }
  
  return outcome.outcome.farmer_satisfaction !== undefined && outcome.outcome.farmer_satisfaction >= 3;
}

/**
 * Calculate statistics from outcomes
 */
export function calculateOutcomeStatistics(
  outcomes: RecommendationOutcome[]
): OutcomeStatistics {
  const total = outcomes.length;
  const followed = outcomes.filter(o => 
    o.farmer_action.action_type === 'FOLLOWED' || 
    o.farmer_action.action_type === 'PARTIALLY_FOLLOWED'
  );
  const followedWithOutcome = followed.filter(o => o.outcome.status !== 'PENDING');
  
  const successCount = followedWithOutcome.filter(o => 
    o.outcome.status === 'SUCCESS' || o.outcome.status === 'PARTIAL_SUCCESS'
  ).length;
  
  const satisfactionScores = outcomes
    .filter(o => o.outcome.farmer_satisfaction !== undefined)
    .map(o => o.outcome.farmer_satisfaction!);
  
  const improvementScores = outcomes
    .filter(o => o.outcome.improvement_percent !== undefined)
    .map(o => o.outcome.improvement_percent!);
  
  const modifications = outcomes
    .filter(o => o.farmer_action.action_type === 'MODIFIED' && o.farmer_action.modification_reason)
    .map(o => o.farmer_action.modification_reason!);
  
  const ignoreReasons = outcomes
    .filter(o => o.farmer_action.action_type === 'IGNORED' && o.farmer_action.ignored_reason)
    .map(o => o.farmer_action.ignored_reason!);
  
  return {
    total_recommendations: total,
    followed_count: followed.length,
    success_rate: followedWithOutcome.length > 0 ? (successCount / followedWithOutcome.length) * 100 : 0,
    avg_satisfaction: satisfactionScores.length > 0 
      ? satisfactionScores.reduce((a, b) => a + b, 0) / satisfactionScores.length 
      : 0,
    avg_improvement_percent: improvementScores.length > 0
      ? improvementScores.reduce((a, b) => a + b, 0) / improvementScores.length
      : 0,
    common_modifications: [...new Set(modifications)].slice(0, 5),
    common_ignore_reasons: [...new Set(ignoreReasons)].slice(0, 5),
    best_performing_recommendations: outcomes
      .filter(o => o.outcome.status === 'SUCCESS' && (o.outcome.farmer_satisfaction || 0) >= 4)
      .map(o => o.original_recommendation.action_recommended)
      .slice(0, 5),
    needs_improvement: outcomes
      .filter(o => o.outcome.status === 'FAILURE' || (o.outcome.farmer_satisfaction || 5) <= 2)
      .map(o => o.original_recommendation.action_recommended)
      .slice(0, 5)
  };
}

/**
 * Get training-ready outcomes for a crop/region
 */
export function getTrainingData(
  outcomes: RecommendationOutcome[],
  filters?: { crop?: string; region?: string; type?: string }
): Array<{
  input: RecommendationOutcome['original_recommendation'];
  farmer_action: string;
  outcome: string;
  success: boolean;
  satisfaction: number;
}> {
  return outcomes
    .filter(o => o.use_for_training)
    .filter(o => !filters?.type || o.original_recommendation.type === filters.type)
    .map(o => ({
      input: o.original_recommendation,
      farmer_action: o.farmer_action.action_type,
      outcome: o.outcome.status,
      success: o.outcome.status === 'SUCCESS' || o.outcome.status === 'PARTIAL_SUCCESS',
      satisfaction: o.outcome.farmer_satisfaction || 3
    }));
}

/**
 * Generate improvement recommendations from outcomes
 */
export function generateImprovementInsights(
  statistics: OutcomeStatistics
): string[] {
  const insights: string[] = [];
  
  if (statistics.success_rate < 70) {
    insights.push(`Success rate (${statistics.success_rate.toFixed(0)}%) below target. Review failed recommendations.`);
  }
  
  if (statistics.avg_satisfaction < 3.5) {
    insights.push(`Farmer satisfaction (${statistics.avg_satisfaction.toFixed(1)}/5) needs improvement.`);
  }
  
  if (statistics.common_modifications.length > 0) {
    insights.push(`Farmers frequently modify: ${statistics.common_modifications.join(', ')}. Consider updating recommendations.`);
  }
  
  if (statistics.common_ignore_reasons.length > 0) {
    insights.push(`Common ignore reasons: ${statistics.common_ignore_reasons.join(', ')}. Address these barriers.`);
  }
  
  if (statistics.followed_count / statistics.total_recommendations < 0.5) {
    insights.push(`Only ${((statistics.followed_count / statistics.total_recommendations) * 100).toFixed(0)}% recommendations followed. Improve communication.`);
  }
  
  return insights;
}
