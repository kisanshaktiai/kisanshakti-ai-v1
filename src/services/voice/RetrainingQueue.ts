/**
 * RetrainingQueue - Collects failed commands and user corrections for model improvement
 * Provides data pipeline for retraining voice models
 */

import { VoiceTelemetry, UserFeedback } from './VoiceTelemetry';
import { supabase } from '@/integrations/supabase/client';

export interface RetrainingExample {
  id: string;
  originalTranscript: string;
  correctedTranscript?: string;
  expectedIntent: string;
  actualIntent?: string;
  confidence: number;
  language: string;
  context: Record<string, any>;
  timestamp: number;
  status: 'pending' | 'reviewed' | 'approved' | 'rejected';
  reviewedAt?: number;
  reviewedBy?: string;
}

export interface RetrainingBatch {
  id: string;
  examples: RetrainingExample[];
  createdAt: number;
  language: string;
  status: 'pending' | 'training' | 'completed' | 'failed';
  metrics?: {
    totalExamples: number;
    approvedExamples: number;
    rejectedExamples: number;
    avgConfidenceImprovement: number;
  };
}

export class RetrainingQueue {
  private telemetry: VoiceTelemetry;
  private queue: RetrainingExample[] = [];
  private batches: RetrainingBatch[] = [];
  private maxQueueSize = 1000;
  private batchSize = 50;
  private tenantId: string;

  constructor(telemetry: VoiceTelemetry, tenantId: string) {
    this.telemetry = telemetry;
    this.tenantId = tenantId;
    this.loadQueue();
  }

  /**
   * Add a failed command to the retraining queue
   */
  addFailedCommand(
    transcript: string,
    expectedIntent: string,
    actualIntent: string | null,
    confidence: number,
    language: string,
    context: Record<string, any> = {}
  ): void {
    const example: RetrainingExample = {
      id: `example_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalTranscript: transcript,
      expectedIntent,
      actualIntent: actualIntent || undefined,
      confidence,
      language,
      context,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.queue.push(example);

    // Trim queue if too large
    if (this.queue.length > this.maxQueueSize) {
      this.queue = this.queue.slice(-this.maxQueueSize);
    }

    this.saveQueue();

    console.log('[RetrainingQueue] Added failed command:', {
      transcript: transcript.substring(0, 50),
      expectedIntent,
      confidence,
    });

    // Collect telemetry
    this.telemetry.track('retraining_example_added', {
      expectedIntent,
      confidence,
      language,
    });
  }

  /**
   * Add user correction to the queue
   */
  addCorrection(feedback: UserFeedback): void {
    if (feedback.type !== 'correction' || !feedback.correctedTranscript) {
      return;
    }

    const example: RetrainingExample = {
      id: `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalTranscript: feedback.originalTranscript,
      correctedTranscript: feedback.correctedTranscript,
      expectedIntent: feedback.intent || 'unknown',
      confidence: feedback.confidence || 0,
      language: feedback.context.language || 'en',
      context: feedback.context,
      timestamp: feedback.timestamp,
      status: 'pending',
    };

    this.queue.push(example);
    this.saveQueue();

    console.log('[RetrainingQueue] Added correction:', {
      original: feedback.originalTranscript.substring(0, 30),
      corrected: feedback.correctedTranscript.substring(0, 30),
    });
  }

  /**
   * Create a batch for retraining
   */
  createBatch(language?: string): RetrainingBatch | null {
    let examples = this.queue.filter(e => e.status === 'pending');

    if (language) {
      examples = examples.filter(e => e.language === language);
    }

    if (examples.length < this.batchSize / 2) {
      console.log('[RetrainingQueue] Not enough examples for batch');
      return null;
    }

    // Take up to batchSize examples
    const batchExamples = examples.slice(0, this.batchSize);

    const batch: RetrainingBatch = {
      id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      examples: batchExamples,
      createdAt: Date.now(),
      language: language || 'mixed',
      status: 'pending',
    };

    // Mark examples as reviewed
    batchExamples.forEach(example => {
      example.status = 'reviewed';
    });

    this.batches.push(batch);
    this.saveQueue();

    console.log('[RetrainingQueue] Created batch:', {
      id: batch.id,
      exampleCount: batchExamples.length,
      language: batch.language,
    });

    return batch;
  }

  /**
   * Get pending examples for manual review
   */
  getPendingExamples(limit: number = 20, language?: string): RetrainingExample[] {
    let examples = this.queue.filter(e => e.status === 'pending');

    if (language) {
      examples = examples.filter(e => e.language === language);
    }

    return examples.slice(0, limit);
  }

  /**
   * Approve an example for training
   */
  approveExample(exampleId: string, reviewedBy: string): void {
    const example = this.queue.find(e => e.id === exampleId);
    if (example) {
      example.status = 'approved';
      example.reviewedAt = Date.now();
      example.reviewedBy = reviewedBy;
      this.saveQueue();

      console.log('[RetrainingQueue] Approved example:', exampleId);
    }
  }

  /**
   * Reject an example
   */
  rejectExample(exampleId: string, reviewedBy: string): void {
    const example = this.queue.find(e => e.id === exampleId);
    if (example) {
      example.status = 'rejected';
      example.reviewedAt = Date.now();
      example.reviewedBy = reviewedBy;
      this.saveQueue();

      console.log('[RetrainingQueue] Rejected example:', exampleId);
    }
  }

  /**
   * Export batch for retraining
   */
  async exportBatch(batchId: string, format: 'json' | 'jsonl' = 'jsonl'): Promise<string> {
    const batch = this.batches.find(b => b.id === batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    const approvedExamples = batch.examples.filter(e => e.status === 'approved');

    if (format === 'json') {
      return JSON.stringify({
        batchId: batch.id,
        language: batch.language,
        createdAt: batch.createdAt,
        examples: approvedExamples.map(e => ({
          transcript: e.correctedTranscript || e.originalTranscript,
          intent: e.expectedIntent,
          confidence: e.confidence,
          context: e.context,
        })),
      }, null, 2);
    } else {
      // JSONL format (one JSON object per line)
      return approvedExamples
        .map(e => JSON.stringify({
          transcript: e.correctedTranscript || e.originalTranscript,
          intent: e.expectedIntent,
          confidence: e.confidence,
          language: e.language,
        }))
        .join('\n');
    }
  }

  /**
   * Submit batch to database for processing
   */
  async submitBatchToDatabase(batchId: string): Promise<void> {
    const batch = this.batches.find(b => b.id === batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    try {
      // Store in voice_error_corrections table for future processing
      const corrections = batch.examples
        .filter(e => e.status === 'approved')
        .map(e => ({
          tenant_id: this.tenantId,
          language: e.language,
          original_transcript: e.originalTranscript,
          corrected_transcript: e.correctedTranscript || e.originalTranscript,
          expected_intent: e.expectedIntent,
          actual_intent: e.actualIntent,
          confidence_score: e.confidence,
          context_data: e.context,
          created_at: new Date(e.timestamp).toISOString(),
        }));

      const { error } = await supabase
        .from('voice_error_corrections')
        .insert(corrections);

      if (error) {
        throw error;
      }

      batch.status = 'completed';
      this.saveQueue();

      console.log('[RetrainingQueue] Submitted batch to database:', batchId);

      this.telemetry.track('retraining_batch_submitted', {
        batchId,
        exampleCount: corrections.length,
        language: batch.language,
      });
    } catch (error) {
      console.error('[RetrainingQueue] Failed to submit batch:', error);
      batch.status = 'failed';
      this.saveQueue();
      throw error;
    }
  }

  /**
   * Get retraining statistics
   */
  getStats(): {
    queueSize: number;
    pendingExamples: number;
    approvedExamples: number;
    rejectedExamples: number;
    batchCount: number;
    completedBatches: number;
    byLanguage: Record<string, number>;
  } {
    const byLanguage: Record<string, number> = {};
    this.queue.forEach(e => {
      byLanguage[e.language] = (byLanguage[e.language] || 0) + 1;
    });

    return {
      queueSize: this.queue.length,
      pendingExamples: this.queue.filter(e => e.status === 'pending').length,
      approvedExamples: this.queue.filter(e => e.status === 'approved').length,
      rejectedExamples: this.queue.filter(e => e.status === 'rejected').length,
      batchCount: this.batches.length,
      completedBatches: this.batches.filter(b => b.status === 'completed').length,
      byLanguage,
    };
  }

  /**
   * Clear old examples
   */
  clearOldExamples(olderThanDays: number = 30): void {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    const before = this.queue.length;

    this.queue = this.queue.filter(e => e.timestamp > cutoff || e.status === 'pending');
    
    const removed = before - this.queue.length;
    if (removed > 0) {
      console.log(`[RetrainingQueue] Cleared ${removed} old examples`);
      this.saveQueue();
    }
  }

  // ============ Private Methods ============

  private saveQueue(): void {
    try {
      localStorage.setItem('voice_retraining_queue', JSON.stringify({
        queue: this.queue,
        batches: this.batches,
      }));
    } catch (error) {
      console.error('[RetrainingQueue] Failed to save queue:', error);
    }
  }

  private loadQueue(): void {
    try {
      const stored = localStorage.getItem('voice_retraining_queue');
      if (stored) {
        const data = JSON.parse(stored);
        this.queue = data.queue || [];
        this.batches = data.batches || [];
        console.log('[RetrainingQueue] Loaded queue:', {
          examples: this.queue.length,
          batches: this.batches.length,
        });
      }
    } catch (error) {
      console.error('[RetrainingQueue] Failed to load queue:', error);
    }
  }
}
