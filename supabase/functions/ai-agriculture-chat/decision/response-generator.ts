/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESPONSE GENERATOR v2.0 — DEPRECATED (LEGACY)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️ DEPRECATED: This module is superseded by:
 *   - `agents/deterministic-response-builder.ts` (structured response)
 *   - `agents/canonical-advisory-schema.ts` (canonical JSON)
 *   - `agents/llm-response-formatter.ts` (LLM narration)
 * 
 * Exports are preserved for backward compatibility with orchestrator.ts
 * but the template system is no longer the primary response path.
 * The canonical advisory JSON is now built in index.ts and sent to frontend.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { SymbolicFact, InferenceResult, Hypothesis, FiredRule } from './symbolic-reasoner.ts';
import type { ConfidenceScore, ConfidenceLevel } from './confidence-calculator.ts';
import type { AuthoritativeLandState } from './authoritative-state-loader.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ResponseInput {
  inferenceResult: InferenceResult;
  confidenceScore: ConfidenceScore;
  facts: SymbolicFact;
  landState: AuthoritativeLandState | null;
  language: string;
}

export interface GeneratedResponse {
  text: string;
  sections: {
    acknowledgment: string;
    diagnosis: string;
    confidence_display: string;
    recommendations: string;
    reasoning: string;
    data_used: string;
    next_steps: string;
    caveats: string;
  };
  template_used: string;
  language: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE-NEUTRAL TEMPLATES (English structural scaffolds)
// LLM narration layer translates into farmer's language at runtime.
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATES = {
  VERY_HIGH: `📊 Diagnosis Report - {{land_name}} ({{crop}} - {{dos}} days)

🎯 Issue Identified: **{{diagnosis}}**
Confidence: {{confidence_stars}} ({{confidence_percent}}%)

📋 Analysis:
• Your {{crop}} is in {{stage}} stage
• {{symptom}} is a key symptom of {{diagnosis}}
{{reasoning}}

💊 Recommended Treatments:
{{recommendations}}

💰 Estimated Cost: ₹{{estimated_cost}}
📅 Apply: {{timing}}

📊 Next Steps:
• Check improvement after 7 days
• Take and share photos

[View Reasoning] [Task List] [Set Reminder]`,

  HIGH: `📋 Diagnosis - {{land_name}}

🎯 Probable Issue: **{{diagnosis}}**
Confidence: {{confidence_stars}} ({{confidence_percent}}%)

📊 Symptoms:
• {{symptom}}
{{reasoning}}

💊 Recommendation:
{{recommendations}}

⚠️ Note: Check results after 7 days to confirm this diagnosis.

[More Info] [Send Photo]`,

  MODERATE: `🔍 Preliminary Diagnosis - {{land_name}}

⚠️ Possible Cause: {{diagnosis}}
Confidence: {{confidence_stars}} ({{confidence_percent}}%)

📊 Based on symptoms:
{{reasoning}}

Alternative possibilities:
{{alternatives}}

⚠️ Important: Answer questions below for more accurate diagnosis.

💡 If possible:
{{recommendations}}

[Provide More Info] [Talk to Expert] [Send Photo]`,

  LOW: `🔍 More Information Needed - {{land_name}}

More information is needed to accurately identify the problem.

📊 Understood so far:
• {{symptom}}
{{reasoning}}

❓ Please tell us:
{{clarification_questions}}

💡 For now:
• Continue monitoring
• Take and send photos
• Contact nearby agriculture center

[Send Photo] [Talk to Expert]`
};

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE GENERATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ResponseGenerator {
  
  generateResponse(input: ResponseInput): GeneratedResponse {
    const { inferenceResult, confidenceScore, facts, landState, language } = input;
    
    console.log('📝 [ResponseGenerator v2] Generating language-neutral response...');
    console.log(`   Confidence: ${confidenceScore.level}, Language: ${language}`);
    
    const templateKey = this.mapConfidenceToTemplate(confidenceScore.level);
    const template = TEMPLATES[templateKey];
    
    const sections = this.buildSections(input);
    
    const text = this.fillTemplate(template, {
      land_name: landState?.land_name || 'Your Land',
      crop: this.formatCode(facts.crop),
      dos: facts.dos.toString(),
      stage: this.formatCode(facts.growth_stage),
      symptom: this.formatCode(facts.primary_symptom),
      diagnosis: inferenceResult.diagnosis?.cause_name || 'Unknown',
      confidence_stars: this.getConfidenceStars(confidenceScore.overall),
      confidence_percent: Math.round(confidenceScore.overall * 100).toString(),
      reasoning: sections.reasoning,
      recommendations: sections.recommendations,
      alternatives: this.formatAlternatives(inferenceResult.alternative_diagnoses),
      estimated_cost: this.estimateCost(inferenceResult.recommendations),
      timing: this.getTimingAdvice(facts),
      clarification_questions: this.getClarificationQuestions(facts)
    });
    
    return {
      text,
      sections,
      template_used: templateKey,
      language
    };
  }
  
  private mapConfidenceToTemplate(level: ConfidenceLevel): keyof typeof TEMPLATES {
    switch (level) {
      case 'VERY_HIGH': return 'VERY_HIGH';
      case 'HIGH': return 'HIGH';
      case 'MODERATE': return 'MODERATE';
      case 'LOW':
      case 'VERY_LOW':
      default: return 'LOW';
    }
  }
  
  private buildSections(input: ResponseInput) {
    const { inferenceResult, confidenceScore, facts, landState } = input;
    
    return {
      acknowledgment: '🌾 Understood.',
      diagnosis: inferenceResult.diagnosis?.cause_name || '',
      confidence_display: `${this.getConfidenceStars(confidenceScore.overall)} (${Math.round(confidenceScore.overall * 100)}%)`,
      recommendations: this.formatRecommendations(inferenceResult.recommendations),
      reasoning: this.formatReasoning(inferenceResult.reasoning),
      data_used: this.formatDataUsed(facts, landState),
      next_steps: this.getNextSteps(confidenceScore.level),
      caveats: this.getCaveats(confidenceScore.level)
    };
  }
  
  private fillTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    // 1) Substitute every {{key}} where the value is a non-empty string.
    for (const [key, value] of Object.entries(variables)) {
      const v = (value ?? '').toString();
      if (v.trim().length > 0) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), v);
      }
    }
    // 2) Drop any line that still contains an unresolved {{...}} token so we
    //    never leak debug-looking placeholders (e.g. "{symptom}") to farmers.
    result = result
      .split('\n')
      .filter((line) => !/\{\{[^}]+\}\}/.test(line))
      .join('\n')
      // collapse 3+ consecutive blank lines that filtering may produce
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return result;
  }
  
  private getConfidenceStars(score: number): string {
    if (score >= 0.85) return '⭐⭐⭐⭐⭐';
    if (score >= 0.70) return '⭐⭐⭐⭐';
    if (score >= 0.55) return '⭐⭐⭐';
    if (score >= 0.40) return '⭐⭐';
    return '⭐';
  }
  
  /** Format code for display — language-neutral */
  private formatCode(code: string): string {
    return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase().replace(/_/g, ' ');
  }
  
  private formatRecommendations(recommendations: FiredRule[]): string {
    if (recommendations.length === 0) {
      return 'Continue monitoring';
    }
    return recommendations.slice(0, 3).map((rec, i) => {
      const response = rec.actions.action_text || rec.actions.reason_text || rec.cause;
      return `${i + 1}. ${response}`;
    }).join('\n');
  }
  
  private formatReasoning(reasoning: string[]): string {
    if (reasoning.length === 0) return '';
    return reasoning.slice(0, 3).map(r => `• ${r}`).join('\n');
  }
  
  private formatAlternatives(alternatives: Hypothesis[]): string {
    if (alternatives.length === 0) return '';
    return alternatives.slice(0, 2).map(alt =>
      `• ${alt.cause_name} (${Math.round(alt.confidence * 100)}%)`
    ).join('\n');
  }
  
  private formatDataUsed(facts: SymbolicFact, landState: AuthoritativeLandState | null): string {
    const data: string[] = [];
    if (facts.ndvi !== null) data.push(`NDVI: ${facts.ndvi.toFixed(2)}`);
    if (facts.soil_n !== null) data.push(`N: ${facts.soil_n}`);
    if (facts.temperature !== null) data.push(`Temp: ${facts.temperature}°C`);
    return data.join(' | ');
  }
  
  private estimateCost(recommendations: FiredRule[]): string {
    return '500-1000';
  }
  
  private getTimingAdvice(facts: SymbolicFact): string {
    if (facts.recent_rain) {
      return 'After rain stops';
    }
    return 'As soon as possible';
  }
  
  private getNextSteps(level: ConfidenceLevel): string {
    if (level === 'LOW' || level === 'VERY_LOW') {
      return 'Send photo or talk to expert';
    }
    return 'Check after 7 days';
  }
  
  private getCaveats(level: ConfidenceLevel): string {
    if (level === 'MODERATE' || level === 'LOW') {
      return '⚠️ This is a preliminary diagnosis. Confirmation needed.';
    }
    return '';
  }
  
  private getClarificationQuestions(facts: SymbolicFact): string {
    const questions: string[] = [];
    if (facts.distribution === 'unknown') {
      questions.push('• Where is the problem visible? (Everywhere / Patches)');
    }
    if (facts.severity === 'unknown') {
      questions.push('• How much? (Little / Medium / Severe)');
    }
    return questions.join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY (Type B — stateless class, see context-validator.ts for rationale)
// ═══════════════════════════════════════════════════════════════════════════

export function getResponseGenerator(): ResponseGenerator {
  return new ResponseGenerator();
}


export function generateFarmerResponse(input: ResponseInput): GeneratedResponse {
  const generator = getResponseGenerator();
  return generator.generateResponse(input);
}
