/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESPONSE GENERATOR - TEMPLATE-BASED FARMER COMMUNICATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Generates farmer-friendly responses based on confidence level using
 * structured templates. Ensures the LLM serves as a PRESENTER only,
 * not a decision-maker.
 * 
 * VERSION: 1.0.0
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
// TEMPLATE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATES = {
  // Very High Confidence (≥85%)
  VERY_HIGH: {
    mr: `📊 निदान रिपोर्ट - {{land_name}} ({{crop}} - {{dos}} दिवस)

🎯 समस्या ओळखली: **{{diagnosis}}**
विश्वास: {{confidence_stars}} ({{confidence_percent}}%)

📋 विश्लेषण:
• तुमची {{crop}} {{stage}} अवस्थेत आहे
• {{symptom}} हे {{diagnosis}} चे प्रमुख लक्षण आहे
{{reasoning}}

💊 शिफारस केलेले उपचार:
{{recommendations}}

💰 अंदाजित खर्च: ₹{{estimated_cost}}
📅 लागू करा: {{timing}}

📊 पुढील पावले:
• 7 दिवसांनी सुधारणा तपासा
• फोटो काढून शेअर करा

[कारण पहा] [कार्य सूची] [रिमाइंडर]`,
    
    hi: `📊 निदान रिपोर्ट - {{land_name}} ({{crop}} - {{dos}} दिन)

🎯 समस्या पहचानी: **{{diagnosis}}**
विश्वास: {{confidence_stars}} ({{confidence_percent}}%)

📋 विश्लेषण:
• आपकी {{crop}} {{stage}} अवस्था में है
• {{symptom}} यह {{diagnosis}} का प्रमुख लक्षण है
{{reasoning}}

💊 सिफारिश किए गए उपचार:
{{recommendations}}

💰 अनुमानित लागत: ₹{{estimated_cost}}
📅 लागू करें: {{timing}}

📊 अगले कदम:
• 7 दिन बाद सुधार जांचें
• फोटो लेकर शेयर करें

[कारण देखें] [कार्य सूची] [रिमाइंडर]`,
    
    en: `📊 Diagnosis Report - {{land_name}} ({{crop}} - {{dos}} days)

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

[View Reasoning] [Task List] [Set Reminder]`
  },
  
  // High Confidence (70-85%)
  HIGH: {
    mr: `📋 निदान - {{land_name}}

🎯 संभाव्य समस्या: **{{diagnosis}}**
विश्वास: {{confidence_stars}} ({{confidence_percent}}%)

📊 लक्षणे:
• {{symptom}}
{{reasoning}}

💊 शिफारस:
{{recommendations}}

⚠️ टीप: या निदानाची पुष्टी करण्यासाठी 7 दिवसांनी परिणाम तपासा.

[अधिक माहिती] [फोटो पाठवा]`,
    
    hi: `📋 निदान - {{land_name}}

🎯 संभावित समस्या: **{{diagnosis}}**
विश्वास: {{confidence_stars}} ({{confidence_percent}}%)

📊 लक्षण:
• {{symptom}}
{{reasoning}}

💊 सिफारिश:
{{recommendations}}

⚠️ नोट: इस निदान की पुष्टि के लिए 7 दिन बाद परिणाम जांचें।

[अधिक जानकारी] [फोटो भेजें]`,
    
    en: `📋 Diagnosis - {{land_name}}

🎯 Probable Issue: **{{diagnosis}}**
Confidence: {{confidence_stars}} ({{confidence_percent}}%)

📊 Symptoms:
• {{symptom}}
{{reasoning}}

💊 Recommendation:
{{recommendations}}

⚠️ Note: Check results after 7 days to confirm this diagnosis.

[More Info] [Send Photo]`
  },
  
  // Moderate Confidence (55-70%)
  MODERATE: {
    mr: `🔍 प्राथमिक निदान - {{land_name}}

⚠️ संभाव्य कारण: {{diagnosis}}
विश्वास: {{confidence_stars}} ({{confidence_percent}}%)

📊 लक्षणांवरून:
{{reasoning}}

पर्यायी शक्यता:
{{alternatives}}

⚠️ महत्वाचे: अधिक माहितीसाठी खालील प्रश्नांची उत्तरे द्या.

💡 शक्य असल्यास:
{{recommendations}}

[अधिक माहिती द्या] [तज्ञाशी बोला] [फोटो पाठवा]`,
    
    hi: `🔍 प्रारंभिक निदान - {{land_name}}

⚠️ संभावित कारण: {{diagnosis}}
विश्वास: {{confidence_stars}} ({{confidence_percent}}%)

📊 लक्षणों से:
{{reasoning}}

वैकल्पिक संभावनाएं:
{{alternatives}}

⚠️ महत्वपूर्ण: अधिक जानकारी के लिए नीचे दिए गए सवालों का जवाब दें।

💡 संभव हो तो:
{{recommendations}}

[अधिक जानकारी दें] [विशेषज्ञ से बात करें] [फोटो भेजें]`,
    
    en: `🔍 Preliminary Diagnosis - {{land_name}}

⚠️ Possible Cause: {{diagnosis}}
Confidence: {{confidence_stars}} ({{confidence_percent}}%)

📊 Based on symptoms:
{{reasoning}}

Alternative possibilities:
{{alternatives}}

⚠️ Important: Answer questions below for more accurate diagnosis.

💡 If possible:
{{recommendations}}

[Provide More Info] [Talk to Expert] [Send Photo]`
  },
  
  // Low Confidence (<55%)
  LOW: {
    mr: `🔍 माहिती आवश्यक - {{land_name}}

समस्या नक्की ओळखण्यासाठी अधिक माहिती आवश्यक आहे.

📊 आतापर्यंत समजले:
• {{symptom}}
{{reasoning}}

❓ कृपया सांगा:
{{clarification_questions}}

💡 तात्पुरते सुचवणी:
• निरीक्षण सुरू ठेवा
• फोटो काढून पाठवा
• जवळच्या कृषि केंद्राशी संपर्क करा

[फोटो पाठवा] [तज्ञाशी बोला]`,
    
    hi: `🔍 जानकारी आवश्यक - {{land_name}}

समस्या सही से पहचानने के लिए अधिक जानकारी चाहिए।

📊 अभी तक समझा:
• {{symptom}}
{{reasoning}}

❓ कृपया बताएं:
{{clarification_questions}}

💡 अभी के लिए सुझाव:
• निगरानी जारी रखें
• फोटो लेकर भेजें
• नजदीकी कृषि केंद्र से संपर्क करें

[फोटो भेजें] [विशेषज्ञ से बात करें]`,
    
    en: `🔍 More Information Needed - {{land_name}}

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
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE GENERATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ResponseGenerator {
  
  /**
   * Generate farmer-friendly response
   */
  generateResponse(input: ResponseInput): GeneratedResponse {
    const { inferenceResult, confidenceScore, facts, landState, language } = input;
    
    console.log('📝 [ResponseGenerator] Generating response...');
    console.log(`   Confidence: ${confidenceScore.level}, Language: ${language}`);
    
    // Select template based on confidence level
    const templateKey = this.mapConfidenceToTemplate(confidenceScore.level);
    const template = TEMPLATES[templateKey][language];
    
    // Build sections
    const sections = this.buildSections(input);
    
    // Fill template
    const text = this.fillTemplate(template, {
      land_name: landState?.land_name || 'आपली जमीन',
      crop: this.localizeCrop(facts.crop, language),
      dos: facts.dos.toString(),
      stage: this.localizeStage(facts.growth_stage, language),
      symptom: this.localizeSymptom(facts.primary_symptom, language),
      diagnosis: inferenceResult.diagnosis?.cause_name || 'अज्ञात',
      confidence_stars: this.getConfidenceStars(confidenceScore.overall),
      confidence_percent: Math.round(confidenceScore.overall * 100).toString(),
      reasoning: sections.reasoning,
      recommendations: sections.recommendations,
      alternatives: this.formatAlternatives(inferenceResult.alternative_diagnoses, language),
      estimated_cost: this.estimateCost(inferenceResult.recommendations),
      timing: this.getTimingAdvice(facts, language),
      clarification_questions: this.getClarificationQuestions(facts, language)
    });
    
    return {
      text,
      sections,
      template_used: templateKey,
      language
    };
  }
  
  /**
   * Map confidence level to template key
   */
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
  
  /**
   * Build response sections
   */
  private buildSections(input: ResponseInput) {
    const { inferenceResult, confidenceScore, facts, landState, language } = input;
    
    return {
      acknowledgment: this.getAcknowledgment(language),
      diagnosis: inferenceResult.diagnosis?.cause_name || '',
      confidence_display: `${this.getConfidenceStars(confidenceScore.overall)} (${Math.round(confidenceScore.overall * 100)}%)`,
      recommendations: this.formatRecommendations(inferenceResult.recommendations, language),
      reasoning: this.formatReasoning(inferenceResult.reasoning, language),
      data_used: this.formatDataUsed(facts, landState, language),
      next_steps: this.getNextSteps(confidenceScore.level, language),
      caveats: this.getCaveats(confidenceScore.level, language)
    };
  }
  
  /**
   * Fill template with variables
   */
  private fillTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
    }
    return result;
  }
  
  /**
   * Get confidence stars display
   */
  private getConfidenceStars(score: number): string {
    if (score >= 0.85) return '⭐⭐⭐⭐⭐';
    if (score >= 0.70) return '⭐⭐⭐⭐';
    if (score >= 0.55) return '⭐⭐⭐';
    if (score >= 0.40) return '⭐⭐';
    return '⭐';
  }
  
  /**
   * Localize crop name — FIX 34: Use code formatting, LLM handles translation at render time
   */
  private localizeCrop(crop: string, _language: string): string {
    // Crop name localization is handled by the LLM narration layer at response generation time
    // Return formatted code as fallback — the LLM system prompt instructs it to use local names
    return crop.charAt(0).toUpperCase() + crop.slice(1).toLowerCase().replace(/_/g, ' ');
  }
  
  /**
   * Localize stage name — FIX 34: Use code formatting, LLM handles translation at render time
   */
  private localizeStage(stage: string, _language: string): string {
    return stage.charAt(0).toUpperCase() + stage.slice(1).toLowerCase().replace(/_/g, ' ');
  }
  
  /**
   * Localize symptom — FIX 34: Use code formatting, LLM handles translation at render time
   */
  private localizeSymptom(symptom: string, _language: string): string {
    return symptom.charAt(0).toUpperCase() + symptom.slice(1).toLowerCase().replace(/_/g, ' ');
  }
  
  /**
   * Format recommendations
   */
  private formatRecommendations(recommendations: FiredRule[], language: string): string {
    if (recommendations.length === 0) {
      return language === 'mr' ? 'सध्या निरीक्षण करा' : 
             language === 'hi' ? 'अभी निगरानी करें' : 
             'Continue monitoring';
    }
    
    // FIX 34: Use action_text (SSOT) instead of dropped response_mr/hi/en
    return recommendations.slice(0, 3).map((rec, i) => {
      const response = rec.actions.action_text || rec.actions.reason_text || rec.cause;
      return `${i + 1}. ${response}`;
    }).join('\n');
  }
  
  /**
   * Format reasoning steps
   */
  private formatReasoning(reasoning: string[], language: string): string {
    if (reasoning.length === 0) return '';
    return reasoning.slice(0, 3).map(r => `• ${r}`).join('\n');
  }
  
  /**
   * Format alternative diagnoses
   */
  private formatAlternatives(alternatives: Hypothesis[], language: string): string {
    if (alternatives.length === 0) return '';
    return alternatives.slice(0, 2).map(alt => 
      `• ${alt.cause_name} (${Math.round(alt.confidence * 100)}%)`
    ).join('\n');
  }
  
  /**
   * Format data used
   */
  private formatDataUsed(facts: SymbolicFact, landState: AuthoritativeLandState | null, language: string): string {
    const data: string[] = [];
    if (facts.ndvi !== null) data.push(`NDVI: ${facts.ndvi.toFixed(2)}`);
    if (facts.soil_n !== null) data.push(`N: ${facts.soil_n}`);
    if (facts.temperature !== null) data.push(`Temp: ${facts.temperature}°C`);
    return data.join(' | ');
  }
  
  /**
   * Estimate treatment cost
   */
  private estimateCost(recommendations: FiredRule[]): string {
    // Placeholder - would calculate based on land area and product costs
    return '500-1000';
  }
  
  /**
   * Get timing advice
   */
  private getTimingAdvice(facts: SymbolicFact, language: string): string {
    if (facts.recent_rain) {
      return language === 'mr' ? 'पाऊस थांबल्यावर' : 
             language === 'hi' ? 'बारिश रुकने के बाद' : 
             'After rain stops';
    }
    return language === 'mr' ? 'लवकरात लवकर' : 
           language === 'hi' ? 'जल्द से जल्द' : 
           'As soon as possible';
  }
  
  /**
   * Get acknowledgment
   */
  private getAcknowledgment(language: string): string {
    return language === 'mr' ? '🌾 समजले.' : 
           language === 'hi' ? '🌾 समझ गया.' : 
           '🌾 Understood.';
  }
  
  /**
   * Get next steps based on confidence
   */
  private getNextSteps(level: ConfidenceLevel, language: string): string {
    if (level === 'LOW' || level === 'VERY_LOW') {
      return language === 'mr' ? 'फोटो पाठवा किंवा तज्ञाशी बोला' :
             language === 'hi' ? 'फोटो भेजें या विशेषज्ञ से बात करें' :
             'Send photo or talk to expert';
    }
    return language === 'mr' ? '7 दिवसांनी तपासा' :
           language === 'hi' ? '7 दिन बाद जांचें' :
           'Check after 7 days';
  }
  
  /**
   * Get caveats based on confidence
   */
  private getCaveats(level: ConfidenceLevel, language: string): string {
    if (level === 'MODERATE' || level === 'LOW') {
      return language === 'mr' ? '⚠️ हे प्राथमिक निदान आहे. पुष्टी आवश्यक.' :
             language === 'hi' ? '⚠️ यह प्रारंभिक निदान है। पुष्टि आवश्यक.' :
             '⚠️ This is a preliminary diagnosis. Confirmation needed.';
    }
    return '';
  }
  
  /**
   * Get clarification questions
   */
  private getClarificationQuestions(facts: SymbolicFact, language: string): string {
    const questions: string[] = [];
    
    if (facts.distribution === 'unknown') {
      questions.push(language === 'mr' ? '• समस्या कुठे दिसते? (सगळीकडे / ठिकठिकाणी)' :
                     language === 'hi' ? '• समस्या कहाँ दिखती है? (हर जगह / जगह-जगह)' :
                     '• Where is the problem visible? (Everywhere / Patches)');
    }
    
    if (facts.severity === 'unknown') {
      questions.push(language === 'mr' ? '• किती प्रमाणात? (थोडे / मध्यम / जास्त)' :
                     language === 'hi' ? '• कितना? (थोड़ा / मध्यम / ज्यादा)' :
                     '• How much? (Little / Medium / Severe)');
    }
    
    return questions.join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let generatorInstance: ResponseGenerator | null = null;

export function getResponseGenerator(): ResponseGenerator {
  if (!generatorInstance) {
    generatorInstance = new ResponseGenerator();
  }
  return generatorInstance;
}

// Export convenience function
export function generateFarmerResponse(input: ResponseInput): GeneratedResponse {
  const generator = getResponseGenerator();
  return generator.generateResponse(input);
}
