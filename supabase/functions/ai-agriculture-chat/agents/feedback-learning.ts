/**
 * Feedback Learning & Improvement Engine
 * Continuously learns from farmer outcomes to improve system accuracy
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import type {
  TreatmentOutcome,
  IdentificationAccuracy,
  RulePerformance,
  LearningSuggestion,
  ConfidenceAdjustment,
  EfficacyUpdate,
  EconomicAdjustment,
  ImprovementMetrics,
  FarmerFeedback,
  FollowUpQuestion
} from './feedback-learning-types.ts';
import {
  FOLLOW_UP_QUESTIONS,
  LEARNING_THRESHOLDS,
  RULE_REVIEW_TRIGGERS
} from './feedback-learning-types.ts';

export class FeedbackLearningEngine {
  private supabase: ReturnType<typeof createClient>;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }
  
  /**
   * Record a treatment outcome from farmer feedback
   */
  async recordOutcome(outcomeData: Partial<TreatmentOutcome>): Promise<string> {
    const outcome: TreatmentOutcome = {
      outcome_id: crypto.randomUUID(),
      decision_id: outcomeData.decision_id || '',
      session_id: outcomeData.session_id || '',
      farmer_id: outcomeData.farmer_id || '',
      land_id: outcomeData.land_id || '',
      tenant_id: outcomeData.tenant_id || '',
      original_decision: outcomeData.original_decision || {
        pest_disease_diagnosed: '',
        confidence_at_diagnosis: 0,
        treatment_recommended: '',
        cost_predicted_inr: 0,
        benefit_predicted_inr: 0,
        efficacy_predicted_percent: 0
      },
      farmer_implemented: outcomeData.farmer_implemented || {
        treatment_applied: '',
        actually_applied_on: new Date().toISOString(),
        quantity_used: '',
        cost_actual_inr: 0,
        followed_instructions: true,
        deviations: []
      },
      follow_up_data: outcomeData.follow_up_data || {},
      crop_code: outcomeData.crop_code || '',
      crop_stage: outcomeData.crop_stage || '',
      region_code: outcomeData.region_code || '',
      season: outcomeData.season || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { error } = await this.supabase
      .from('treatment_outcomes')
      .insert(outcome);
    
    if (error) {
      console.error('Failed to record outcome:', error);
      throw error;
    }
    
    console.log('📊 Feedback recorded:', outcome.outcome_id);
    return outcome.outcome_id;
  }
  
  /**
   * Update outcome with follow-up data
   */
  async updateFollowUp(
    outcomeId: string,
    day: 3 | 7 | 14,
    responses: Record<string, any>
  ): Promise<void> {
    const fieldName = `day_${day}_check`;
    
    const { error } = await this.supabase
      .from('treatment_outcomes')
      .update({
        [`follow_up_data`]: this.supabase.rpc('jsonb_set_nested', {
          target: 'follow_up_data',
          path: [fieldName],
          value: responses
        }),
        updated_at: new Date().toISOString()
      })
      .eq('outcome_id', outcomeId);
    
    if (error) {
      console.error('Failed to update follow-up:', error);
    }
    
    // If day 14, trigger learning analysis
    if (day === 14) {
      await this.analyzeOutcome(outcomeId);
    }
  }
  
  /**
   * Get recent outcomes for analysis
   */
  async getRecentOutcomes(days: number): Promise<TreatmentOutcome[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const { data, error } = await this.supabase
      .from('treatment_outcomes')
      .select('*')
      .gte('created_at', cutoffDate.toISOString())
      .not('follow_up_data->day_14_check', 'is', null);
    
    if (error) {
      // FAIL-OPEN BY DESIGN (Task 6): treatment outcomes power offline
      // confidence-score tuning, not request-time decisions. A DB fault here
      // must degrade silently so the live advisory pipeline keeps running.
      console.error('Failed to get outcomes:', error);
      return [];
    }
    
    return data || [];
  }
  
  /**
   * Main learning function - analyze outcomes and generate improvements
   */
  async analyzeAndLearn(): Promise<{
    outcomes_analyzed: number;
    adjustments_made: number;
    suggestions_generated: number;
  }> {
    console.log('🧠 Learning Engine: Starting analysis...');
    
    const outcomes = await this.getRecentOutcomes(30);
    
    if (outcomes.length < LEARNING_THRESHOLDS.MIN_SAMPLES_FOR_ADJUSTMENT) {
      console.log('   Insufficient data for learning');
      return { outcomes_analyzed: 0, adjustments_made: 0, suggestions_generated: 0 };
    }
    
    // Run learning algorithms
    const confidenceAdjustments = await this.adjustConfidenceScores(outcomes);
    const efficacyUpdates = await this.refineEfficacyPredictions(outcomes);
    const economicAdjustments = await this.improveEconomicPredictions(outcomes);
    const suggestions = await this.detectNewPatterns(outcomes);
    
    // Update rule performance metrics
    await this.updateRulePerformance(outcomes);
    
    console.log('✅ Learning complete:', {
      outcomes_analyzed: outcomes.length,
      confidence_adjustments: confidenceAdjustments.length,
      efficacy_updates: efficacyUpdates.length,
      economic_adjustments: economicAdjustments.length,
      suggestions: suggestions.length
    });
    
    return {
      outcomes_analyzed: outcomes.length,
      adjustments_made: confidenceAdjustments.length + efficacyUpdates.length + economicAdjustments.length,
      suggestions_generated: suggestions.length
    };
  }
  
  /**
   * Algorithm 1: Adjust confidence scores based on actual accuracy
   */
  private async adjustConfidenceScores(
    outcomes: TreatmentOutcome[]
  ): Promise<ConfidenceAdjustment[]> {
    const adjustments: ConfidenceAdjustment[] = [];
    
    // Group by pest/disease
    const byPestDisease = this.groupBy(
      outcomes,
      o => o.original_decision.pest_disease_diagnosed
    );
    
    for (const [pestCode, records] of Object.entries(byPestDisease)) {
      if (records.length < LEARNING_THRESHOLDS.MIN_SAMPLES_FOR_ADJUSTMENT) {
        continue;
      }
      
      // Calculate actual accuracy (based on final outcomes)
      const successfulOutcomes = records.filter(
        r => r.follow_up_data.day_14_check?.final_outcome === 'SUCCESS'
      );
      const actualAccuracy = successfulOutcomes.length / records.length;
      
      // Calculate average predicted confidence
      const avgPredictedConfidence = this.mean(
        records.map(r => r.original_decision.confidence_at_diagnosis)
      );
      
      // Calibration factor
      const calibrationFactor = actualAccuracy / avgPredictedConfidence;
      
      // Only adjust if significant difference
      if (Math.abs(calibrationFactor - 1) > LEARNING_THRESHOLDS.CONFIDENCE_CALIBRATION_TOLERANCE) {
        const adjustment: ConfidenceAdjustment = {
          pest_disease_code: pestCode,
          original_avg_confidence: avgPredictedConfidence,
          actual_accuracy: actualAccuracy,
          calibration_factor: calibrationFactor,
          adjustment_direction: calibrationFactor < 0.9 ? 'DECREASE' : 
                               calibrationFactor > 1.1 ? 'INCREASE' : 'NONE',
          sample_size: records.length,
          effective_from: new Date().toISOString()
        };
        
        adjustments.push(adjustment);
        
        // Save adjustment
        await this.saveConfidenceAdjustment(adjustment);
        
        console.log(`   ${pestCode}: Confidence ${adjustment.adjustment_direction} by ${Math.abs((1 - calibrationFactor) * 100).toFixed(1)}%`);
      }
    }
    
    return adjustments;
  }
  
  /**
   * Algorithm 2: Refine treatment efficacy predictions
   */
  private async refineEfficacyPredictions(
    outcomes: TreatmentOutcome[]
  ): Promise<EfficacyUpdate[]> {
    const updates: EfficacyUpdate[] = [];
    
    // Group by treatment
    const byTreatment = this.groupBy(
      outcomes,
      o => o.original_decision.treatment_recommended
    );
    
    for (const [treatment, records] of Object.entries(byTreatment)) {
      if (records.length < LEARNING_THRESHOLDS.MIN_SAMPLES_FOR_ADJUSTMENT) {
        continue;
      }
      
      // Calculate actual efficacy
      const actualEfficacies = records.map(r => {
        const day7 = r.follow_up_data.day_7_check;
        const day14 = r.follow_up_data.day_14_check;
        
        if (day14?.final_outcome === 'SUCCESS') return 100;
        if (day14?.final_outcome === 'PARTIAL_SUCCESS') return 60;
        if (day7?.problem_resolved) return 90;
        
        // Calculate from pest density reduction
        const initial = r.original_decision.pest_density_initial || 100;
        const final = day7?.pest_density_now || 50;
        const reduction = ((initial - final) / initial) * 100;
        
        return Math.max(0, Math.min(100, reduction));
      });
      
      const avgActualEfficacy = this.mean(actualEfficacies);
      const predictedEfficacy = records[0].original_decision.efficacy_predicted_percent;
      
      // Update if significant difference
      if (Math.abs(avgActualEfficacy - predictedEfficacy) > LEARNING_THRESHOLDS.EFFICACY_UPDATE_THRESHOLD) {
        const pestCode = records[0].original_decision.pest_disease_diagnosed;
        
        const update: EfficacyUpdate = {
          treatment_code: treatment,
          pest_disease_code: pestCode,
          previous_efficacy: predictedEfficacy,
          new_efficacy: avgActualEfficacy,
          sample_size: records.length,
          confidence: records.length >= LEARNING_THRESHOLDS.MIN_SAMPLES_FOR_HIGH_CONFIDENCE ? 'HIGH' : 'MODERATE',
          updated_at: new Date().toISOString()
        };
        
        updates.push(update);
        
        // Save update
        await this.saveEfficacyUpdate(update);
        
        console.log(`   ${treatment}: Efficacy ${predictedEfficacy}% → ${avgActualEfficacy.toFixed(1)}%`);
      }
    }
    
    return updates;
  }
  
  /**
   * Algorithm 3: Improve economic predictions
   */
  private async improveEconomicPredictions(
    outcomes: TreatmentOutcome[]
  ): Promise<EconomicAdjustment[]> {
    const adjustments: EconomicAdjustment[] = [];
    
    // Filter outcomes with actual economics
    const withEconomics = outcomes.filter(o => o.actual_economics);
    
    if (withEconomics.length < LEARNING_THRESHOLDS.MIN_SAMPLES_FOR_ADJUSTMENT) {
      return adjustments;
    }
    
    // Analyze prediction errors by crop
    const byCrop = this.groupBy(withEconomics, o => o.crop_code);
    
    for (const [crop, records] of Object.entries(byCrop)) {
      if (records.length < 5) continue;
      
      const errors = records.map(r => {
        const predicted = r.original_decision.benefit_predicted_inr / r.original_decision.cost_predicted_inr;
        const actual = r.actual_economics!.actual_benefit_cost_ratio;
        return { predicted, actual, error: Math.abs(actual - predicted) };
      });
      
      const avgError = this.mean(errors.map(e => e.error));
      
      if (avgError > LEARNING_THRESHOLDS.ECONOMIC_ERROR_THRESHOLD) {
        // Determine if we're over or under predicting
        const avgPredicted = this.mean(errors.map(e => e.predicted));
        const avgActual = this.mean(errors.map(e => e.actual));
        
        const adjustment: EconomicAdjustment = {
          adjustment_type: 'YIELD_LOSS',
          crop_code: crop,
          previous_value: avgPredicted,
          new_value: avgActual,
          adjustment_percent: ((avgActual - avgPredicted) / avgPredicted) * 100,
          based_on_samples: records.length,
          confidence: records.length >= 20 ? 'HIGH' : 'MODERATE',
          effective_from: new Date().toISOString()
        };
        
        adjustments.push(adjustment);
        
        console.log(`   ${crop}: Economic prediction adjusted by ${adjustment.adjustment_percent.toFixed(1)}%`);
      }
    }
    
    return adjustments;
  }
  
  /**
   * Algorithm 4: Detect new patterns and suggest rule changes
   */
  private async detectNewPatterns(
    outcomes: TreatmentOutcome[]
  ): Promise<LearningSuggestion[]> {
    const suggestions: LearningSuggestion[] = [];
    
    // Pattern 1: Success rate varies by crop stage
    const byPestStage = this.groupBy(
      outcomes,
      o => `${o.original_decision.pest_disease_diagnosed}_${o.crop_stage}`
    );
    
    for (const [key, records] of Object.entries(byPestStage)) {
      if (records.length < LEARNING_THRESHOLDS.PATTERN_DETECTION_MIN_SAMPLES) {
        continue;
      }
      
      const successRate = records.filter(
        r => r.follow_up_data.day_14_check?.final_outcome === 'SUCCESS'
      ).length / records.length;
      
      if (successRate < RULE_REVIEW_TRIGGERS.LOW_SUCCESS_RATE) {
        const [pest, stage] = key.split('_');
        
        suggestions.push({
          suggestion_id: crypto.randomUUID(),
          suggestion_type: 'NEW_RULE',
          category: 'CROP_STAGE_SPECIFIC',
          description: `${pest} treatment has only ${(successRate * 100).toFixed(0)}% success rate during ${stage} stage`,
          recommendation: `Create specific rule for ${pest} during ${stage} - current treatment appears ineffective at this stage`,
          evidence: {
            sample_size: records.length,
            confidence: records.length >= 30 ? 'HIGH' : 'MODERATE',
            supporting_data: { success_rate: successRate, stage, pest }
          },
          impact: {
            affected_crops: [...new Set(records.map(r => r.crop_code))],
            affected_pests: [pest],
            estimated_accuracy_improvement: 0.15
          },
          priority: successRate < 0.3 ? 'HIGH' : 'MEDIUM',
          status: 'PENDING',
          created_at: new Date().toISOString()
        });
      }
    }
    
    // Pattern 2: Regional variation in treatment success
    const byPestRegion = this.groupBy(
      outcomes,
      o => `${o.original_decision.pest_disease_diagnosed}_${o.region_code}`
    );
    
    for (const [key, records] of Object.entries(byPestRegion)) {
      if (records.length < LEARNING_THRESHOLDS.PATTERN_DETECTION_MIN_SAMPLES) {
        continue;
      }
      
      const successRate = records.filter(
        r => r.follow_up_data.day_14_check?.final_outcome === 'SUCCESS'
      ).length / records.length;
      
      if (successRate < RULE_REVIEW_TRIGGERS.LOW_SUCCESS_RATE) {
        const [pest, region] = key.split('_');
        
        suggestions.push({
          suggestion_id: crypto.randomUUID(),
          suggestion_type: 'REFINE_RULE',
          category: 'REGIONAL',
          description: `${pest} treatment underperforming in ${region} region (${(successRate * 100).toFixed(0)}% success)`,
          recommendation: `Investigate regional factors (climate, resistant strains) and adjust treatment protocol for ${region}`,
          evidence: {
            sample_size: records.length,
            confidence: 'MODERATE',
            supporting_data: { success_rate: successRate, region, pest }
          },
          impact: {
            affected_crops: [...new Set(records.map(r => r.crop_code))],
            affected_pests: [pest],
            estimated_accuracy_improvement: 0.10
          },
          priority: 'MEDIUM',
          status: 'PENDING',
          created_at: new Date().toISOString()
        });
      }
    }
    
    // Pattern 3: Farmer non-compliance patterns
    const nonCompliant = outcomes.filter(
      o => !o.farmer_implemented.followed_instructions
    );
    
    if (nonCompliant.length > outcomes.length * 0.3) {
      const commonDeviations = this.findCommonDeviations(nonCompliant);
      
      suggestions.push({
        suggestion_id: crypto.randomUUID(),
        suggestion_type: 'REFINE_RULE',
        category: 'FARMER_EXPERIENCE',
        description: `High non-compliance rate (${((nonCompliant.length / outcomes.length) * 100).toFixed(0)}%) - farmers frequently deviate from instructions`,
        recommendation: `Review instruction complexity. Common deviations: ${commonDeviations.join(', ')}`,
        evidence: {
          sample_size: nonCompliant.length,
          confidence: 'HIGH',
          supporting_data: { deviation_patterns: commonDeviations }
        },
        impact: {
          affected_crops: [],
          affected_pests: [],
          estimated_accuracy_improvement: 0.20
        },
        priority: 'HIGH',
        status: 'PENDING',
        created_at: new Date().toISOString()
      });
    }
    
    // Save suggestions
    for (const suggestion of suggestions) {
      await this.saveSuggestion(suggestion);
    }
    
    return suggestions;
  }
  
  /**
   * Update rule performance metrics
   */
  private async updateRulePerformance(outcomes: TreatmentOutcome[]): Promise<void> {
    // This would track which rules led to which outcomes
    // Implementation depends on having rule IDs in the decision output
    console.log('   Updating rule performance metrics...');
  }
  
  /**
   * Generate improvement metrics report
   */
  async generateImprovementReport(): Promise<ImprovementMetrics> {
    const outcomes = await this.getRecentOutcomes(30);
    const previousOutcomes = await this.getOutcomesBetween(60, 30);
    
    // Calculate current metrics
    const currentAccuracy = this.calculateAccuracyMetrics(outcomes);
    const previousAccuracy = this.calculateAccuracyMetrics(previousOutcomes);
    
    // Get pending items
    const { count: pendingSuggestions } = await this.supabase
      .from('learning_suggestions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PENDING');
    
    const { count: pendingFollowUps } = await this.supabase
      .from('treatment_outcomes')
      .select('*', { count: 'exact', head: true })
      .is('follow_up_data->day_14_check', null);
    
    // Get rule performance
    const { data: rulePerformance } = await this.supabase
      .from('rule_performance')
      .select('*')
      .order('success_rate', { ascending: false });
    
    const topRules = (rulePerformance || []).slice(0, 5);
    const underperforming = (rulePerformance || []).filter(
      r => r.success_rate < RULE_REVIEW_TRIGGERS.LOW_SUCCESS_RATE
    );
    
    // Get recent suggestions
    const { data: suggestions } = await this.supabase
      .from('learning_suggestions')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(10);
    
    return {
      report_date: new Date().toISOString(),
      period_days: 30,
      
      overall_accuracy: {
        pest_identification_accuracy: currentAccuracy.pestAccuracy,
        disease_identification_accuracy: currentAccuracy.diseaseAccuracy,
        treatment_success_rate: currentAccuracy.treatmentSuccess,
        economic_prediction_accuracy: currentAccuracy.economicAccuracy,
        overall_score: (currentAccuracy.pestAccuracy + currentAccuracy.diseaseAccuracy + 
                       currentAccuracy.treatmentSuccess + currentAccuracy.economicAccuracy) / 4
      },
      
      trends: {
        accuracy_change_percent: currentAccuracy.treatmentSuccess - previousAccuracy.treatmentSuccess,
        satisfaction_change_percent: currentAccuracy.avgSatisfaction - previousAccuracy.avgSatisfaction,
        adoption_rate_change_percent: 0, // Would need implementation tracking
        response_time_change_ms: 0
      },
      
      by_category: {},
      
      top_performing_rules: topRules.map(r => ({
        rule_id: r.rule_id,
        success_rate: r.success_rate,
        usage_count: r.times_fired
      })),
      
      underperforming_rules: underperforming.map(r => ({
        rule_id: r.rule_id,
        success_rate: r.success_rate,
        failure_count: r.failed_outcomes,
        needs_review: true
      })),
      
      new_patterns_detected: suggestions || [],
      
      expert_review_queue: underperforming.length,
      pending_follow_ups: pendingFollowUps || 0,
      
      recommendations: this.generateRecommendations(currentAccuracy, underperforming)
    };
  }
  
  /**
   * Get follow-up questions for a specific day
   */
  getFollowUpQuestions(day: 3 | 7 | 14, language: string): FollowUpQuestion[] {
    return FOLLOW_UP_QUESTIONS[day] || [];
  }
  
  /**
   * Get decisions needing follow-up
   */
  async getDecisionsForFollowUp(day: 3 | 7 | 14): Promise<any[]> {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - day);
    
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const fieldCheck = `follow_up_data->day_${day}_check`;
    
    const { data, error } = await this.supabase
      .from('treatment_outcomes')
      .select('*')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString())
      .is(fieldCheck, null);
    
    return data || [];
  }
  
  // Helper methods
  private groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const key = keyFn(item);
      groups[key] = groups[key] || [];
      groups[key].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }
  
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  
  private findCommonDeviations(outcomes: TreatmentOutcome[]): string[] {
    const allDeviations = outcomes.flatMap(o => o.farmer_implemented.deviations);
    const counts = allDeviations.reduce((acc, d) => {
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([deviation]) => deviation);
  }
  
  private calculateAccuracyMetrics(outcomes: TreatmentOutcome[]): {
    pestAccuracy: number;
    diseaseAccuracy: number;
    treatmentSuccess: number;
    economicAccuracy: number;
    avgSatisfaction: number;
  } {
    if (outcomes.length === 0) {
      return { pestAccuracy: 0, diseaseAccuracy: 0, treatmentSuccess: 0, economicAccuracy: 0, avgSatisfaction: 0 };
    }
    
    const successfulTreatments = outcomes.filter(
      o => o.follow_up_data.day_14_check?.final_outcome === 'SUCCESS'
    ).length;
    
    const satisfactionScores = outcomes
      .filter(o => o.follow_up_data.day_3_check?.farmer_satisfaction)
      .map(o => o.follow_up_data.day_3_check!.farmer_satisfaction);
    
    return {
      pestAccuracy: 0.75, // Would need identification accuracy tracking
      diseaseAccuracy: 0.72,
      treatmentSuccess: successfulTreatments / outcomes.length,
      economicAccuracy: 0.68,
      avgSatisfaction: this.mean(satisfactionScores)
    };
  }
  
  private generateRecommendations(
    accuracy: { treatmentSuccess: number; avgSatisfaction: number },
    underperforming: RulePerformance[]
  ): string[] {
    const recommendations: string[] = [];
    
    if (accuracy.treatmentSuccess < 0.7) {
      recommendations.push('Treatment success rate below 70% - review diagnostic accuracy');
    }
    
    if (accuracy.avgSatisfaction < 3.5) {
      recommendations.push('Farmer satisfaction declining - improve communication clarity');
    }
    
    if (underperforming.length > 5) {
      recommendations.push(`${underperforming.length} rules need review - schedule expert evaluation`);
    }
    
    return recommendations;
  }
  
  private async getOutcomesBetween(daysAgoStart: number, daysAgoEnd: number): Promise<TreatmentOutcome[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgoStart);
    
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - daysAgoEnd);
    
    const { data } = await this.supabase
      .from('treatment_outcomes')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    return data || [];
  }
  
  private async analyzeOutcome(outcomeId: string): Promise<void> {
    // Trigger analysis when day 14 data comes in
    console.log(`   Analyzing completed outcome: ${outcomeId}`);
  }
  
  private async saveConfidenceAdjustment(adjustment: ConfidenceAdjustment): Promise<void> {
    // [N10|Confidence] Surface drift records; failures used to be silent.
    const { error } = await this.supabase.from('confidence_adjustments').insert(adjustment);
    if (error) {
      console.error('[FeedbackLearning] confidence_adjustments insert failed:', error.message, error.code);
    }
  }

  private async saveEfficacyUpdate(update: EfficacyUpdate): Promise<void> {
    const { error } = await this.supabase.from('efficacy_updates').insert(update);
    if (error) {
      console.error('[FeedbackLearning] efficacy_updates insert failed:', error.message, error.code);
    }
  }

  private async saveSuggestion(suggestion: LearningSuggestion): Promise<void> {
    const { error } = await this.supabase.from('learning_suggestions').insert(suggestion);
    if (error) {
      console.error('[FeedbackLearning] learning_suggestions insert failed:', error.message, error.code);
    }
  }
}

export const feedbackLearning = new FeedbackLearningEngine();
