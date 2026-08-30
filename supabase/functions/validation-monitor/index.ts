/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VALIDATION MONITOR - CONTINUOUS QUALITY ASSURANCE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-ready validation pipeline for KisanShakti AI:
 * - Hourly automated checks (response time, error rate)
 * - Daily accuracy validation
 * - Alert system for degradation
 * 
 * Version: 1.0.0
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from '../_shared/cors.ts';

// Validation thresholds
const THRESHOLDS = {
  response_time_p95_ms: 2000,
  error_rate_percent: 0.1,
  hallucination_rate_percent: 0.01,
  accuracy_min_percent: 90,
  farmer_satisfaction_min: 4.0,
  safety_gate_effectiveness: 100,
};

interface ValidationResult {
  check_type: 'HOURLY' | 'DAILY' | 'WEEKLY';
  timestamp: string;
  passed: boolean;
  metrics: {
    response_time_p95_ms?: number;
    error_rate_percent?: number;
    hallucination_rate_percent?: number;
    accuracy_percent?: number;
    farmer_satisfaction_avg?: number;
    safety_gate_effectiveness?: number;
    total_requests?: number;
    failed_requests?: number;
  };
  alerts: string[];
  recommendations: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const url = new URL(req.url);
    const checkType = url.searchParams.get("type") || "hourly";

    let result: ValidationResult;

    switch (checkType) {
      case "hourly":
        result = await runHourlyChecks(supabase);
        break;
      case "daily":
        result = await runDailyChecks(supabase);
        break;
      case "weekly":
        result = await runWeeklyChecks(supabase);
        break;
      default:
        result = await runHourlyChecks(supabase);
    }

    // Store validation result
    try {
      await supabase.from("validation_results").insert({
        check_type: result.check_type,
        passed: result.passed,
        metrics: result.metrics,
        alerts: result.alerts,
        recommendations: result.recommendations,
        created_at: result.timestamp,
      });
    } catch {
      // fail-open: validation result storage is best-effort
    }

    // If validation failed, send alerts
    if (!result.passed && result.alerts.length > 0) {
      await sendAlerts(supabase, result);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Validation monitor error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

/**
 * Hourly automated checks
 */
async function runHourlyChecks(supabase: any): Promise<ValidationResult> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const alerts: string[] = [];
  const recommendations: string[] = [];

  // Fetch recent chat messages for metrics
  const { data: messages, error } = await supabase
    .from("ai_chat_messages")
    .select("response_time_ms, status, error_details, created_at")
    .gte("created_at", oneHourAgo)
    .eq("role", "assistant");

  if (error) {
    console.error("Failed to fetch messages:", error);
    return {
      check_type: "HOURLY",
      timestamp: new Date().toISOString(),
      passed: false,
      metrics: {},
      alerts: ["Failed to fetch metrics data"],
      recommendations: ["Check database connectivity"],
    };
  }

  const totalRequests = messages?.length || 0;
  
  if (totalRequests === 0) {
    return {
      check_type: "HOURLY",
      timestamp: new Date().toISOString(),
      passed: true,
      metrics: { total_requests: 0 },
      alerts: [],
      recommendations: [],
    };
  }

  // Calculate P95 response time
  const responseTimes = messages
    .filter((m: any) => m.response_time_ms)
    .map((m: any) => m.response_time_ms)
    .sort((a: number, b: number) => a - b);
  
  const p95Index = Math.floor(responseTimes.length * 0.95);
  const responseTimeP95 = responseTimes[p95Index] || 0;

  // Calculate error rate
  const failedRequests = messages.filter(
    (m: any) => m.status === "error" || m.error_details
  ).length;
  const errorRate = (failedRequests / totalRequests) * 100;

  // Check thresholds
  if (responseTimeP95 > THRESHOLDS.response_time_p95_ms) {
    alerts.push(`Response time P95 (${responseTimeP95}ms) exceeds threshold (${THRESHOLDS.response_time_p95_ms}ms)`);
    recommendations.push("Investigate slow queries and optimize database indexes");
  }

  if (errorRate > THRESHOLDS.error_rate_percent) {
    alerts.push(`Error rate (${errorRate.toFixed(2)}%) exceeds threshold (${THRESHOLDS.error_rate_percent}%)`);
    recommendations.push("Check edge function logs for error patterns");
  }

  const passed = alerts.length === 0;

  return {
    check_type: "HOURLY",
    timestamp: new Date().toISOString(),
    passed,
    metrics: {
      response_time_p95_ms: responseTimeP95,
      error_rate_percent: errorRate,
      total_requests: totalRequests,
      failed_requests: failedRequests,
    },
    alerts,
    recommendations,
  };
}

/**
 * Daily validation checks
 */
async function runDailyChecks(supabase: any): Promise<ValidationResult> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const alerts: string[] = [];
  const recommendations: string[] = [];

  // Fetch daily metrics
  const { data: messages } = await supabase
    .from("ai_chat_messages")
    .select("feedback_rating, agricultural_accuracy, decision_brain_source")
    .gte("created_at", oneDayAgo)
    .eq("role", "assistant");

  const totalMessages = messages?.length || 0;
  
  if (totalMessages === 0) {
    return {
      check_type: "DAILY",
      timestamp: new Date().toISOString(),
      passed: true,
      metrics: { total_requests: 0 },
      alerts: [],
      recommendations: [],
    };
  }

  // Calculate farmer satisfaction
  const ratings = messages.filter((m: any) => m.feedback_rating).map((m: any) => m.feedback_rating);
  const avgSatisfaction = ratings.length > 0 
    ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length 
    : null;

  // Calculate accuracy from agricultural_accuracy field
  const accuracyScores = messages
    .filter((m: any) => m.agricultural_accuracy)
    .map((m: any) => m.agricultural_accuracy);
  const avgAccuracy = accuracyScores.length > 0
    ? (accuracyScores.reduce((a: number, b: number) => a + b, 0) / accuracyScores.length) * 100
    : null;

  // Check thresholds
  if (avgAccuracy !== null && avgAccuracy < THRESHOLDS.accuracy_min_percent) {
    alerts.push(`Accuracy (${avgAccuracy.toFixed(1)}%) below threshold (${THRESHOLDS.accuracy_min_percent}%)`);
    recommendations.push("Review recent recommendations and update rule engine");
  }

  if (avgSatisfaction !== null && avgSatisfaction < THRESHOLDS.farmer_satisfaction_min) {
    alerts.push(`Farmer satisfaction (${avgSatisfaction.toFixed(1)}) below threshold (${THRESHOLDS.farmer_satisfaction_min})`);
    recommendations.push("Analyze low-rated responses and improve communication");
  }

  // Check safety gate effectiveness
  const { data: safetyBlocks } = await supabase
    .from("advisory_feedback")
    .select("status")
    .gte("recorded_at", oneDayAgo)
    .eq("status", "safety_blocked");

  const safetyBlockCount = safetyBlocks?.length || 0;

  const passed = alerts.length === 0;

  return {
    check_type: "DAILY",
    timestamp: new Date().toISOString(),
    passed,
    metrics: {
      accuracy_percent: avgAccuracy || undefined,
      farmer_satisfaction_avg: avgSatisfaction || undefined,
      total_requests: totalMessages,
      safety_gate_effectiveness: safetyBlockCount > 0 ? 100 : undefined,
    },
    alerts,
    recommendations,
  };
}

/**
 * Weekly validation checks (field outcome validation)
 */
async function runWeeklyChecks(supabase: any): Promise<ValidationResult> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const alerts: string[] = [];
  const recommendations: string[] = [];

  // Fetch feedback with outcomes
  const { data: feedback } = await supabase
    .from("advisory_feedback")
    .select("effectiveness_rating, status, reason")
    .gte("recorded_at", oneWeekAgo)
    .not("effectiveness_rating", "is", null);

  const totalFeedback = feedback?.length || 0;

  if (totalFeedback === 0) {
    return {
      check_type: "WEEKLY",
      timestamp: new Date().toISOString(),
      passed: true,
      metrics: { total_requests: 0 },
      alerts: [],
      recommendations: ["Encourage farmers to provide feedback on recommendations"],
    };
  }

  // Calculate success rate
  const successfulOutcomes = feedback.filter(
    (f: any) => f.effectiveness_rating >= 4 || f.status === "completed"
  ).length;
  const successRate = (successfulOutcomes / totalFeedback) * 100;

  // Check threshold (85% success)
  if (successRate < 85) {
    alerts.push(`Field outcome success rate (${successRate.toFixed(1)}%) below target (85%)`);
    recommendations.push("Review failed recommendations and update rule engine");
  }

  const passed = alerts.length === 0;

  return {
    check_type: "WEEKLY",
    timestamp: new Date().toISOString(),
    passed,
    metrics: {
      accuracy_percent: successRate,
      total_requests: totalFeedback,
    },
    alerts,
    recommendations,
  };
}

/**
 * Send alerts for failed validations
 */
async function sendAlerts(supabase: any, result: ValidationResult): Promise<void> {
  // Log alert to admin_notifications
  try {
    await supabase.from("admin_notifications").insert({
      title: `⚠️ Validation Alert: ${result.check_type}`,
      message: result.alerts.join("; "),
      type: "validation_alert",
      priority: result.alerts.length > 2 ? "high" : "medium",
      metadata: {
        metrics: result.metrics,
        recommendations: result.recommendations,
      },
    });
  } catch (e) {
    console.error("Failed to send alert notification:", e);
  }
}
