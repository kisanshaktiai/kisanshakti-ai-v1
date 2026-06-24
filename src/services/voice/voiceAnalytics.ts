import { VoiceMetrics, VoiceConfig } from './types';

interface AggregatedMetrics {
  totalRequests: number;
  avgAsrLatency: number;
  avgTtsLatency: number;
  avgIntentAccuracy: number;
  offlineRequests: number;
  onlineRequests: number;
  languageDistribution: Record<string, number>;
  intentDistribution: Record<string, number>;
  errorRate: number;
}

export class VoiceAnalytics {
  private metrics: VoiceMetrics[] = [];
  private config: VoiceConfig;
  private maxStoredMetrics = 1000;

  constructor(config: VoiceConfig) {
    this.config = config;
    this.loadMetrics();
  }

  private loadMetrics(): void {
    if (!this.config.telemetryEnabled) return;

    try {
      const stored = localStorage.getItem('voice_metrics');
      if (stored) {
        this.metrics = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  }

  private saveMetrics(): void {
    if (!this.config.telemetryEnabled) return;
    if (this.config.privacyMode === 'local') {
      // Only store aggregated metrics locally
      try {
        // Keep only recent metrics
        const recentMetrics = this.metrics.slice(-this.maxStoredMetrics);
        localStorage.setItem('voice_metrics', JSON.stringify(recentMetrics));
      } catch (error) {
        console.error('Failed to save metrics:', error);
      }
    }
  }

  recordMetric(metric: VoiceMetrics): void {
    if (!this.config.telemetryEnabled) return;

    this.metrics.push(metric);
    this.saveMetrics();

    // Send to analytics if cloud opt-in
    if (this.config.privacyMode === 'cloud-opt-in') {
      this.sendToCloud(metric);
    }
  }

  private async sendToCloud(metric: VoiceMetrics | Record<string, any>): Promise<void> {
    // Implement cloud analytics sending here
    // For now, just log
    console.log('Would send to cloud:', metric);
  }

  getAggregatedMetrics(timeframe: 'hour' | 'day' | 'week' = 'day'): AggregatedMetrics {
    const now = Date.now();
    const timeframes = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    };

    const cutoff = now - timeframes[timeframe];
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);

    if (recentMetrics.length === 0) {
      return {
        totalRequests: 0,
        avgAsrLatency: 0,
        avgTtsLatency: 0,
        avgIntentAccuracy: 0,
        offlineRequests: 0,
        onlineRequests: 0,
        languageDistribution: {},
        intentDistribution: {},
        errorRate: 0,
      };
    }

    const languageDistribution: Record<string, number> = {};
    const intentDistribution: Record<string, number> = {};
    let totalAsrLatency = 0;
    let totalTtsLatency = 0;
    let totalIntentAccuracy = 0;
    let offlineCount = 0;
    let onlineCount = 0;

    recentMetrics.forEach(metric => {
      totalAsrLatency += metric.asrLatency;
      totalTtsLatency += metric.ttsLatency;
      totalIntentAccuracy += metric.intentAccuracy;

      if (metric.offline) {
        offlineCount++;
      } else {
        onlineCount++;
      }

      languageDistribution[metric.language] = (languageDistribution[metric.language] || 0) + 1;
    });

    return {
      totalRequests: recentMetrics.length,
      avgAsrLatency: totalAsrLatency / recentMetrics.length,
      avgTtsLatency: totalTtsLatency / recentMetrics.length,
      avgIntentAccuracy: totalIntentAccuracy / recentMetrics.length,
      offlineRequests: offlineCount,
      onlineRequests: onlineCount,
      languageDistribution,
      intentDistribution,
      errorRate: 0, // Calculate based on errors tracked
    };
  }

  clearMetrics(): void {
    this.metrics = [];
    localStorage.removeItem('voice_metrics');
  }

  /**
   * Track voice-specific events with privacy protection
   */
  trackVoiceEvent(eventType: string, data: Record<string, any>): void {
    if (!this.config.telemetryEnabled) return;

    // Privacy: Never store raw transcripts
    const sanitized = { ...data };
    delete sanitized.transcript;

    const event = {
      type: eventType,
      timestamp: Date.now(),
      language: this.config.language,
      offline: !navigator.onLine,
      ...sanitized
    };

    console.log(`[VoiceAnalytics] Event: ${eventType}`, event);

    // Store locally or send to cloud based on privacy mode
    if (this.config.privacyMode === 'cloud-opt-in') {
      this.sendToCloud(event);
    } else {
      // Store locally only for aggregation
      const localEvents = JSON.parse(localStorage.getItem('voice_events') || '[]');
      localEvents.push(event);
      // Keep only last 100 events
      if (localEvents.length > 100) localEvents.shift();
      localStorage.setItem('voice_events', JSON.stringify(localEvents));
    }
  }
}
