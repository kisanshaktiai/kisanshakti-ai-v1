/**
 * VoiceTelemetry - Enhanced telemetry and monitoring for voice system
 * Tracks metrics, errors, and user behavior for improvement
 */

import { VoiceAnalytics } from './voiceAnalytics';

export interface TelemetryEvent {
  name: string;
  timestamp: number;
  data: Record<string, any>;
  userId?: string;
  sessionId?: string;
  language?: string;
}

export interface ErrorReport {
  errorType: string;
  message: string;
  stack?: string;
  context: Record<string, any>;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface UserFeedback {
  type: 'correction' | 'help_request' | 'complaint' | 'praise';
  originalTranscript: string;
  correctedTranscript?: string;
  intent?: string;
  confidence?: number;
  context: Record<string, any>;
  timestamp: number;
}

export class VoiceTelemetry {
  private analytics: VoiceAnalytics;
  private events: TelemetryEvent[] = [];
  private errors: ErrorReport[] = [];
  private feedback: UserFeedback[] = [];
  private maxEventStorage = 1000;
  private maxErrorStorage = 500;
  private maxFeedbackStorage = 200;
  private sessionId: string;

  constructor(analytics: VoiceAnalytics) {
    this.analytics = analytics;
    this.sessionId = this.generateSessionId();
    this.loadFromStorage();
  }

  /**
   * Track a telemetry event
   */
  track(eventName: string, data: Record<string, any> = {}): void {
    const event: TelemetryEvent = {
      name: eventName,
      timestamp: Date.now(),
      data: this.sanitizeData(data),
      sessionId: this.sessionId,
      language: data.language,
    };

    this.events.push(event);
    
    // Trim to max storage
    if (this.events.length > this.maxEventStorage) {
      this.events = this.events.slice(-this.maxEventStorage);
    }

    // Use existing analytics for recording
    this.analytics.trackVoiceEvent(eventName, data);

    this.persistEvents();

    console.log(`[Telemetry] ${eventName}`, data);
  }

  /**
   * Report an error
   */
  reportError(error: Error | string, context: Record<string, any> = {}, severity: ErrorReport['severity'] = 'medium'): void {
    const errorReport: ErrorReport = {
      errorType: typeof error === 'string' ? 'Unknown' : error.name,
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'string' ? undefined : error.stack,
      context: this.sanitizeData(context),
      timestamp: Date.now(),
      severity,
    };

    this.errors.push(errorReport);

    // Trim to max storage
    if (this.errors.length > this.maxErrorStorage) {
      this.errors = this.errors.slice(-this.maxErrorStorage);
    }

    this.track('voice_error', {
      errorType: errorReport.errorType,
      message: errorReport.message,
      severity: errorReport.severity,
      context: errorReport.context,
    });

    this.persistErrors();

    console.error('[Telemetry] Error:', errorReport);
  }

  /**
   * Collect user feedback for retraining
   */
  collectFeedback(feedback: UserFeedback): void {
    this.feedback.push({
      ...feedback,
      originalTranscript: this.sanitizeTranscript(feedback.originalTranscript),
      correctedTranscript: feedback.correctedTranscript 
        ? this.sanitizeTranscript(feedback.correctedTranscript)
        : undefined,
      timestamp: Date.now(),
    });

    // Trim to max storage
    if (this.feedback.length > this.maxFeedbackStorage) {
      this.feedback = this.feedback.slice(-this.maxFeedbackStorage);
    }

    this.track('voice_feedback', {
      type: feedback.type,
      hasCorrection: !!feedback.correctedTranscript,
      intent: feedback.intent,
      confidence: feedback.confidence,
    });

    this.persistFeedback();

    console.log('[Telemetry] Feedback collected:', feedback.type);
  }

  /**
   * Get aggregated metrics for dashboard
   */
  getMetrics(timeframe: 'hour' | 'day' | 'week' = 'day'): {
    totalEvents: number;
    totalErrors: number;
    errorRate: number;
    topEvents: Array<{ name: string; count: number }>;
    topErrors: Array<{ type: string; count: number }>;
    feedbackCount: number;
    correctionRate: number;
  } {
    const now = Date.now();
    const timeframes = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    };
    const cutoff = now - timeframes[timeframe];

    const recentEvents = this.events.filter(e => e.timestamp > cutoff);
    const recentErrors = this.errors.filter(e => e.timestamp > cutoff);
    const recentFeedback = this.feedback.filter(f => f.timestamp > cutoff);

    // Count events
    const eventCounts = new Map<string, number>();
    recentEvents.forEach(e => {
      eventCounts.set(e.name, (eventCounts.get(e.name) || 0) + 1);
    });

    // Count errors
    const errorCounts = new Map<string, number>();
    recentErrors.forEach(e => {
      errorCounts.set(e.errorType, (errorCounts.get(e.errorType) || 0) + 1);
    });

    // Calculate correction rate
    const corrections = recentFeedback.filter(f => f.type === 'correction').length;
    const correctionRate = recentFeedback.length > 0 ? corrections / recentFeedback.length : 0;

    return {
      totalEvents: recentEvents.length,
      totalErrors: recentErrors.length,
      errorRate: recentEvents.length > 0 ? recentErrors.length / recentEvents.length : 0,
      topEvents: Array.from(eventCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topErrors: Array.from(errorCounts.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      feedbackCount: recentFeedback.length,
      correctionRate,
    };
  }

  /**
   * Get feedback data for retraining pipeline
   */
  getFeedbackForRetraining(): UserFeedback[] {
    // Return corrections with high confidence that can be used for training
    return this.feedback.filter(f => 
      f.type === 'correction' && 
      f.correctedTranscript &&
      (f.confidence || 0) > 0.5
    );
  }

  /**
   * Get error patterns for debugging
   */
  getErrorPatterns(): Array<{
    pattern: string;
    count: number;
    examples: ErrorReport[];
  }> {
    const patterns = new Map<string, ErrorReport[]>();

    this.errors.forEach(error => {
      // Group by error type and message prefix (first 50 chars)
      const key = `${error.errorType}:${error.message.substring(0, 50)}`;
      if (!patterns.has(key)) {
        patterns.set(key, []);
      }
      patterns.get(key)!.push(error);
    });

    return Array.from(patterns.entries())
      .map(([pattern, examples]) => ({
        pattern,
        count: examples.length,
        examples: examples.slice(0, 3), // Keep only 3 examples
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Export telemetry data for analysis
   */
  exportData(format: 'json' | 'csv' = 'json'): string {
    const data = {
      sessionId: this.sessionId,
      exportedAt: Date.now(),
      events: this.events,
      errors: this.errors,
      feedback: this.feedback,
      metrics: this.getMetrics('week'),
    };

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      // Simple CSV export for events
      const header = 'Timestamp,Event,Language,Data\n';
      const rows = this.events.map(e => 
        `${e.timestamp},${e.name},${e.language || 'unknown'},${JSON.stringify(e.data)}`
      ).join('\n');
      return header + rows;
    }
  }

  /**
   * Clear old telemetry data
   */
  clearOldData(olderThanDays: number = 7): void {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

    this.events = this.events.filter(e => e.timestamp > cutoff);
    this.errors = this.errors.filter(e => e.timestamp > cutoff);
    this.feedback = this.feedback.filter(f => f.timestamp > cutoff);

    this.persistEvents();
    this.persistErrors();
    this.persistFeedback();

    console.log(`[Telemetry] Cleared data older than ${olderThanDays} days`);
  }

  // ============ Private Methods ============

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeData(data: Record<string, any>): Record<string, any> {
    // Remove sensitive data
    const sanitized = { ...data };
    delete sanitized.userId;
    delete sanitized.email;
    delete sanitized.phone;
    delete sanitized.password;
    
    // Truncate long strings
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 500) {
        sanitized[key] = sanitized[key].substring(0, 500) + '...';
      }
    });

    return sanitized;
  }

  private sanitizeTranscript(transcript: string): string {
    // Truncate if too long
    if (transcript.length > 500) {
      return transcript.substring(0, 500) + '...';
    }
    return transcript;
  }

  private persistEvents(): void {
    try {
      localStorage.setItem('voice_telemetry_events', JSON.stringify(this.events));
    } catch (error) {
      console.error('[Telemetry] Failed to persist events:', error);
    }
  }

  private persistErrors(): void {
    try {
      localStorage.setItem('voice_telemetry_errors', JSON.stringify(this.errors));
    } catch (error) {
      console.error('[Telemetry] Failed to persist errors:', error);
    }
  }

  private persistFeedback(): void {
    try {
      localStorage.setItem('voice_telemetry_feedback', JSON.stringify(this.feedback));
    } catch (error) {
      console.error('[Telemetry] Failed to persist feedback:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const events = localStorage.getItem('voice_telemetry_events');
      const errors = localStorage.getItem('voice_telemetry_errors');
      const feedback = localStorage.getItem('voice_telemetry_feedback');

      if (events) this.events = JSON.parse(events);
      if (errors) this.errors = JSON.parse(errors);
      if (feedback) this.feedback = JSON.parse(feedback);

      console.log('[Telemetry] Loaded from storage:', {
        events: this.events.length,
        errors: this.errors.length,
        feedback: this.feedback.length,
      });
    } catch (error) {
      console.error('[Telemetry] Failed to load from storage:', error);
    }
  }
}
