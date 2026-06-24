/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARMER COMMUNICATION GENERATOR v3.1
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Translates complex technical decisions from the Rule Engine into clear,
 * actionable, culturally appropriate advice in Marathi, Hindi, and English.
 * 
 * v3.1 UPDATE: Full data extraction and translation integration
 */

import type { DecisionOutput, EconomicAssessment, PrimaryDecision } from './rule-engine-types.ts';
import { getNarratorVoice } from '../utils/language-utils.ts';
import type {
  FarmerProfile,
  ConversationContext,
  FarmerCommunication,
  SupportedLanguage,
  MessageTone,
  ImmediateAction,
  ApplicationInstructions,
  Rationale,
  Warnings,
  EconomicSummary,
  FollowUpPlan,
  TrilingualText,
  TrilingualTextArray,
  QuickAction,
  VoiceVersion,
  FarmerNotification,
  CommunicationScenario,
  EmotionalState
} from './communication-types.ts';
import {
  GREETINGS,
  CLOSINGS,
  EMPATHY_LINES,
  URGENCY_INDICATORS,
  SECTION_HEADINGS,
  EMOJI_DESCRIPTIONS
} from './communication-types.ts';

// NEW IMPORTS: Translation Dictionary and Data Extractors
import {
  CAUSE_TRANSLATIONS,
  ACTION_TRANSLATIONS,
  PRODUCT_TRANSLATIONS,
  METHOD_TRANSLATIONS,
  URGENCY_TRANSLATIONS,
  SAFETY_GEAR_TRANSLATIONS,
  translateText,
  getProductName,
  getCauseTranslation,
  getActionTranslation,
  getMethodTranslation,
  getUrgencyTranslation,
  getSafetyGearTranslation,
  type SupportedLanguage as TranslationLanguage
} from './communication-translation-dictionary.ts';

import {
  extractProductDetails,
  extractCauseInfo,
  extractEconomicInfo,
  extractSafetyInfo,
  extractMixingInstructions,
  extractApplicationSteps,
  extractWeatherConsiderations,
  extractFollowUpSchedule,
  extractScientificBasis,
  extractAlternatives,
  extractRepeatApplicationInfo,
  type ExtractedProductDetails,
  type ExtractedCauseInfo,
  type ExtractedEconomicInfo
} from './communication-data-extractors.ts';

import { 
  type QuestionClassification, 
  type SectionRequirements,
  ResponseTemplateType 
} from './question-classifier.ts';

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNICATION GENERATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class CommunicationGenerator {
  private readonly version = '3.1.0';
  
  /**
   * Main entry point - Generate farmer-friendly communication
   * NOW WITH ADAPTIVE TEMPLATE SYSTEM
   */
  async generate(
    decisionOutput: DecisionOutput,
    farmerProfile: FarmerProfile,
    conversationContext: ConversationContext,
    questionClassification?: QuestionClassification  // NEW: Optional for backward compat
  ): Promise<FarmerCommunication> {
    console.log('📝 Communication Generator: Starting message generation...');
    const startTime = Date.now();
    
    // Use default classification if not provided (backward compatibility)
    const classification = questionClassification || this.getDefaultClassification();
    const requires = classification.requires_sections;
    
    console.log(`   Template type: ${classification.template_type}`);
    console.log(`   Response style: ${classification.response_style}`);
    
    // Determine scenario and tone
    const scenario = this.determineScenario(decisionOutput, conversationContext);
    const tone = this.selectTone(farmerProfile.emotional_state, scenario);
    const lang = farmerProfile.preferred_language;
    
    console.log(`   Scenario: ${scenario}, Tone: ${tone}, Language: ${lang}`);
    
    // Generate ONLY required sections based on question classification
    const sections: any = {};
    
    // Layer 1: Immediate Action (ALWAYS REQUIRED)
    sections.immediate_action = this.generateImmediateAction(decisionOutput, lang, tone);
    console.log('   ✅ Generated immediate_action section');
    
    // Layer 2: Application Instructions (CONDITIONAL)
    if (requires.materials || requires.mixing || requires.application) {
      sections.how_to = this.generateHowTo(decisionOutput, lang, farmerProfile.literacy_level);
      console.log('   ✅ Generated how_to section');
    } else {
      console.log('   ⏭️  Skipped how_to section (not required)');
    }
    
    // Layer 3: Rationale (CONDITIONAL)
    if (requires.rationale) {
      sections.rationale = this.generateRationale(decisionOutput, lang);
      console.log('   ✅ Generated rationale section');
    } else {
      console.log('   ⏭️  Skipped rationale section (not required)');
    }
    
    // Layer 4: Warnings (CONDITIONAL)
    if (requires.warnings) {
      sections.warnings = this.generateWarnings(decisionOutput, lang);
      console.log('   ✅ Generated warnings section');
    } else {
      console.log('   ⏭️  Skipped warnings section (not required)');
    }
    
    // Layer 5: Economics (CONDITIONAL)
    if (requires.economics) {
      sections.economics = this.generateEconomics(decisionOutput.economic_assessment, lang);
      console.log('   ✅ Generated economics section');
    } else {
      console.log('   ⏭️  Skipped economics section (not required)');
    }
    
    // Layer 6: Follow-up (CONDITIONAL)
    if (requires.follow_up) {
      sections.follow_up = this.generateFollowUp(decisionOutput, lang);
      console.log('   ✅ Generated follow_up section');
    } else {
      console.log('   ⏭️  Skipped follow_up section (not required)');
    }
    
    // Compile main message with ONLY generated sections
    const mainMessage = this.compileMainMessage(
      sections,
      lang,
      tone,
      farmerProfile,
      classification
    );
    
    // Generate notification
    const notification = this.generateNotification(sections.immediate_action, lang);
    
    // Generate quick actions
    const quickActions = this.generateQuickActions(lang, scenario);
    
    // Generate voice version
    const voiceVersion = this.generateVoiceVersion(mainMessage, lang);
    
    // Calculate metadata
    const fullText = this.getFullTextForMetrics(mainMessage, lang);
    const wordCount = fullText.split(/\s+/).length;
    const sectionsIncluded = Object.keys(sections);
    
    const output: FarmerCommunication = {
      message_id: crypto.randomUUID(),
      decision_id: decisionOutput.decision_id,
      session_id: decisionOutput.session_id,
      farmer_id: farmerProfile.id,
      language: lang,
      format: 'RICH_TEXT',
      tone,
      created_at: new Date().toISOString(),
      notification,
      main_message: mainMessage,
      quick_actions: quickActions,
      voice_version: voiceVersion,
      accessibility: {
        screen_reader_optimized: true,
        simplified_version_available: farmerProfile.literacy_level === 'LOW',
        emoji_descriptions: this.getEmojiDescriptions(lang),
        high_contrast_available: true
      },
      metadata: {
        word_count: wordCount,
        reading_time_seconds: Math.ceil(wordCount / 3),
        complexity_score: this.calculateComplexity(fullText),
        adapted_for_literacy: farmerProfile.literacy_level !== 'HIGH',
        adapted_for_emotion: farmerProfile.emotional_state !== 'NEUTRAL',
        sections_count: sectionsIncluded.length
      }
    };
    
    console.log(`✅ Communication Generator: Message generated in ${Date.now() - startTime}ms`);
    console.log(`   Word count: ${wordCount}, Sections: ${sectionsIncluded.length}, Style: ${classification.response_style}`);
    
    return output;
  }
  
  /**
   * Get default classification for backward compatibility
   */
  private getDefaultClassification(): QuestionClassification {
    return {
      template_type: ResponseTemplateType.TREATMENT_FULL,
      requires_sections: {
        materials: true,
        mixing: true,
        application: true,
        timing: true,
        economics: true,
        follow_up: true,
        warnings: true,
        rationale: true
      },
      response_style: 'detailed',
      max_sections: 8,
      priority_order: ['immediate_action', 'how_to', 'warnings', 'economics', 'follow_up', 'rationale']
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO & TONE SELECTION
  // ═══════════════════════════════════════════════════════════════════════════
  
  private determineScenario(
    decision: DecisionOutput,
    context: ConversationContext
  ): CommunicationScenario {
    if (decision.status === 'BLOCKED') {
      return 'BLOCKED_ACTION';
    }
    if (decision.status === 'WEATHER_DELAYED') {
      return 'WEATHER_DELAY';
    }
    if (decision.status === 'NOT_VIABLE') {
      return 'ECONOMICALLY_UNVIABLE';
    }
    if (decision.status === 'ESCALATED') {
      return 'ESCALATED_TO_EXPERT';
    }
    if (context.issue_urgency === 'CRITICAL') {
      return 'EMERGENCY';
    }
    if (decision.primary_decision.action_type === 'MONITOR_ONLY') {
      return 'MONITORING_ONLY';
    }
    return 'STANDARD_RECOMMENDATION';
  }
  
  private selectTone(state: EmotionalState, scenario: CommunicationScenario): MessageTone {
    if (state === 'STRESSED' || state === 'PANICKED') {
      return 'CALM_CONFIDENT';
    }
    if (state === 'FRUSTRATED') {
      return 'EMPATHETIC';
    }
    if (scenario === 'EMERGENCY') {
      return 'URGENT';
    }
    if (scenario === 'ECONOMICALLY_UNVIABLE') {
      return 'EMPATHETIC';
    }
    return 'PROFESSIONAL';
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 1: IMMEDIATE ACTION
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateImmediateAction(
    decision: DecisionOutput,
    lang: SupportedLanguage,
    tone: MessageTone
  ): ImmediateAction {
    // EXTRACT DATA using new extractors
    const product = extractProductDetails(decision);
    const cause = extractCauseInfo(decision);
    const weatherNote = extractWeatherConsiderations(decision);
    const primary = decision.primary_decision;
    const urgency = this.mapUrgencyLevel(primary?.urgency || 'WITHIN_48H');
    
    // BUILD ACTION SUMMARY with real data
    const actionSummary = this.buildPopulatedActionSummary(decision, product, cause);
    
    // Determine emoji based on action type
    const actionEmoji = this.getActionEmoji(decision.status, product);
    
    return {
      emoji: actionEmoji,
      heading: SECTION_HEADINGS['IMMEDIATE_ACTION'],
      action_summary: actionSummary,
      urgency_indicator: {
        text: {
          mr: getUrgencyTranslation(urgency, 'mr') || URGENCY_INDICATORS['TODAY']?.en || '🟠 Today',
          hi: getUrgencyTranslation(urgency, 'hi') || URGENCY_INDICATORS['TODAY']?.en || '🟠 Today',
          en: getUrgencyTranslation(urgency, 'en') || URGENCY_INDICATORS['TODAY']?.en || '🟠 Today'
        },
        color: this.getUrgencyColor(urgency),
        urgency_level: urgency as 'IMMEDIATE' | 'TODAY' | 'WITHIN_48H' | 'THIS_WEEK' | 'NON_URGENT'
      },
      weather_note: weatherNote ? {
        mr: this.translateWeatherNote(weatherNote, 'mr'),
        hi: this.translateWeatherNote(weatherNote, 'hi'),
        en: weatherNote
      } : undefined
    };
  }
  
  private buildPopulatedActionSummary(
    decision: DecisionOutput, 
    product: ExtractedProductDetails | null,
    cause: ExtractedCauseInfo
  ): TrilingualText {
    const primary = decision.primary_decision;
    
    if (decision.status === 'BLOCKED') {
      const blockedAction = decision.blocked_actions?.[0];
      return {
        mr: `⚠️ थांबा: ${blockedAction?.reason || 'सुरक्षा कारणांमुळे'}`,
        hi: `⚠️ रुकें: ${blockedAction?.reason || 'सुरक्षा कारणों से'}`,
        en: `⚠️ Stop: ${blockedAction?.reason || 'For safety reasons'}`
      };
    }
    
    if (decision.status === 'WEATHER_DELAYED') {
      const weatherNote = extractWeatherConsiderations(decision) || '';
      const delayReason = decision.blocked_actions?.[0]?.reason || 'हवामानामुळे';
      return {
        mr: `⏱️ फवारणी पुढे ढकला: ${delayReason}. हवामान सुधारल्यावर फवारणी करा. सध्या पिकाचे निरीक्षण सुरू ठेवा.`,
        hi: `⏱️ छिड़काव टालें: ${delayReason}। मौसम साफ होने पर छिड़काव करें। अभी फसल की निगरानी जारी रखें।`,
        en: `⏱️ Postpone spray: ${delayReason}. Spray when weather clears. Continue crop monitoring for now.`
      };
    }
    
    if (primary?.action_type === 'NO_ACTION' || primary?.action_type === 'MONITOR_ONLY') {
      return {
        mr: 'सध्या कोणतीही कृती आवश्यक नाही. निरीक्षण सुरू ठेवा.',
        hi: 'अभी कोई कार्रवाई आवश्यक नहीं। निगरानी जारी रखें।',
        en: 'No action required at this time. Continue monitoring.'
      };
    }
    
    if (product && product.name && product.name !== 'Unknown product') {
      const productMr = getProductName(product.name, 'mr');
      const productHi = getProductName(product.name, 'hi');
      const dosage = product.dosage || 'शिफारसीनुसार';
      const methodMr = getMethodTranslation(product.method || 'FOLIAR_SPRAY', 'mr');
      
      return {
        mr: `${productMr} @ ${dosage} - ${methodMr}`,
        hi: `${productHi} @ ${dosage} - ${getMethodTranslation(product.method || 'FOLIAR_SPRAY', 'hi')}`,
        en: `${product.name} @ ${dosage} - ${getMethodTranslation(product.method || 'FOLIAR_SPRAY', 'en')}`
      };
    }
    
    if (cause.cause && cause.cause !== 'UNKNOWN') {
      return {
        mr: `${getCauseTranslation(cause.cause, 'mr')} साठी तपासणी करा.`,
        hi: `${getCauseTranslation(cause.cause, 'hi')} के लिए जांच करें।`,
        en: `Inspect for ${getCauseTranslation(cause.cause, 'en')}.`
      };
    }
    
    return {
      mr: 'पिकाचे निरीक्षण सुरू ठेवा.',
      hi: 'फसल की निगरानी जारी रखें।',
      en: 'Continue crop monitoring.'
    };
  }
  
  private getActionEmoji(status: string, product: ExtractedProductDetails | null): string {
    if (status === 'BLOCKED') return '⚠️';
    if (status === 'WEATHER_DELAYED') return '⛈️';
    if (!product) return '👀';
    const method = product.method?.toUpperCase() || '';
    if (method.includes('SPRAY')) return '💊';
    if (method.includes('SOIL')) return '🌱';
    return '📌';
  }
  
  private translateWeatherNote(note: string, _lang: SupportedLanguage): string {
    // Language-neutral: return English note, LLM narration layer translates at runtime
    return note;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2: HOW TO DO IT (v3.1 - Full Data Population)
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateHowTo(
    decision: DecisionOutput,
    lang: SupportedLanguage,
    literacy: string
  ): ApplicationInstructions {
    // EXTRACT DATA using new extractors
    const product = extractProductDetails(decision);
    const economic = extractEconomicInfo(decision);
    const safety = extractSafetyInfo(decision);
    const mixingData = extractMixingInstructions(decision.rules_applied || [], product);
    const applicationData = extractApplicationSteps(decision.primary_decision, product);
    
    // Handle no product scenario
    if (!product || !product.name) {
      return this.generateMonitoringInstructions(lang);
    }
    
    // BUILD MATERIALS LIST with real data
    const materials = this.buildPopulatedMaterialsList(product, economic);
    
    // BUILD MIXING INSTRUCTIONS with real data
    const mixing = this.buildPopulatedMixingInstructions(product, mixingData.steps, safety);
    
    // BUILD APPLICATION METHOD with real data
    const application = this.buildPopulatedApplicationMethod(product, applicationData.steps);
    
    // BUILD TIMING with real data
    const primary = decision.primary_decision;
    const timing = this.generateTimingInstructions(primary?.timing, primary?.application_details);
    
    // BUILD SAFETY EQUIPMENT with real data
    const safetyEquipment = this.buildPopulatedSafetyInstructions(safety);
    
    return {
      heading: SECTION_HEADINGS['HOW_TO'],
      materials_needed: materials,
      mixing_instructions: mixing,
      application_method: application,
      timing,
      safety_equipment: safetyEquipment
    };
  }
  
  /**
   * Generate instructions for monitoring-only scenarios
   */
  private generateMonitoringInstructions(lang: SupportedLanguage): ApplicationInstructions {
    return {
      heading: SECTION_HEADINGS['HOW_TO'],
      materials_needed: {
        items: [],
        total_cost_inr: 0,
        cost_per_acre_inr: 0
      },
      mixing_instructions: {
        steps: {
          mr: ['कोणतेही मिश्रण आवश्यक नाही'],
          hi: ['कोई मिश्रण आवश्यक नहीं'],
          en: ['No mixing required']
        }
      },
      application_method: {
        method: {
          mr: 'नियमित निरीक्षण',
          hi: 'नियमित निगरानी',
          en: 'Regular monitoring'
        },
        coverage_tips: {
          mr: ['दररोज पिकाची तपासणी करा', 'नवीन लक्षणे नोंदवा', 'फोटो काढा'],
          hi: ['रोज फसल की जांच करें', 'नए लक्षण नोट करें', 'फोटो लें'],
          en: ['Check crop daily', 'Note new symptoms', 'Take photos']
        }
      },
      timing: {
        best_time: {
          mr: 'सकाळी आणि संध्याकाळी',
          hi: 'सुबह और शाम',
          en: 'Morning and evening'
        },
        duration_estimate: {
          mr: '15-30 मिनिटे',
          hi: '15-30 मिनट',
          en: '15-30 minutes'
        },
        weather_conditions: {
          mr: 'कोणत्याही हवामानात निरीक्षण करता येते',
          hi: 'किसी भी मौसम में निगरानी की जा सकती है',
          en: 'Monitoring can be done in any weather'
        }
      },
      safety_equipment: {
        required_ppe: {
          mr: ['कोणतेही विशेष उपकरण नाही'],
          hi: ['कोई विशेष उपकरण नहीं'],
          en: ['No special equipment needed']
        },
        safety_tips: {
          mr: [],
          hi: [],
          en: []
        }
      }
    };
  }
  
  /**
   * Build materials list with extracted product data
   */
  private buildPopulatedMaterialsList(
    product: ExtractedProductDetails,
    economic: ExtractedEconomicInfo | null
  ): ApplicationInstructions['materials_needed'] {
    const items = [];
    
    // Main product with translations
    const productMr = getProductName(product.name, 'mr');
    const productHi = getProductName(product.name, 'hi');
    
    items.push({
      name: {
        mr: productMr,
        hi: productHi,
        en: product.name
      },
      quantity: product.dosage,
      cost_inr: economic?.costInr || 0,
      local_name: {
        mr: productMr,
        hi: productHi,
        en: product.name
      },
      where_to_buy: {
        mr: 'जवळच्या कृषी केंद्रावर',
        hi: 'निकटतम कृषि केंद्र पर',
        en: 'At nearest agri center'
      }
    });
    
    // Add water for spray methods
    if (product.method === 'FOLIAR_SPRAY' || product.method?.includes('SPRAY')) {
      items.push({
        name: {
          mr: 'स्वच्छ पाणी',
          hi: 'साफ पानी',
          en: 'Clean water'
        },
        quantity: product.waterVolume || '200 लिटर/एकर',
        cost_inr: 0
      });
      
      // Add sticker/spreader
      items.push({
        name: {
          mr: 'स्टिकर/स्प्रेडर',
          hi: 'स्टिकर/स्प्रेडर',
          en: 'Sticker/Spreader'
        },
        quantity: '50 ml/एकर',
        cost_inr: 80
      });
    }
    
    return {
      items,
      total_cost_inr: economic?.costInr || 0,
      cost_per_acre_inr: economic?.costPerAcreInr || 0
    };
  }
  
  /**
   * Build mixing instructions with extracted data
   */
  private buildPopulatedMixingInstructions(
    product: ExtractedProductDetails,
    mixingSteps: string[],
    safety: ReturnType<typeof extractSafetyInfo>
  ): ApplicationInstructions['mixing_instructions'] {
    const productMr = getProductName(product.name, 'mr');
    const productHi = getProductName(product.name, 'hi');
    
    // Translate mixing steps
    const stepsMr = mixingSteps.map(step => this.translateMixingStep(step, product.name, productMr, 'mr'));
    const stepsHi = mixingSteps.map(step => this.translateMixingStep(step, product.name, productHi, 'hi'));
    
    return {
      steps: {
        mr: stepsMr.length > 0 ? stepsMr : [
          `स्प्रे टँकमध्ये अर्धे पाणी घाला`,
          `${productMr} @ ${product.dosage} घाला`,
          `चांगले मिक्स करा (5 मिनिटे)`,
          `उरलेले पाणी भरा`,
          `स्टिकर/स्प्रेडर घाला`
        ],
        hi: stepsHi.length > 0 ? stepsHi : [
          `स्प्रे टैंक में आधा पानी डालें`,
          `${productHi} @ ${product.dosage} डालें`,
          `अच्छी तरह मिलाएं (5 मिनट)`,
          `बाकी पानी भरें`,
          `स्टिकर/स्प्रेडर डालें`
        ],
        en: mixingSteps.length > 0 ? mixingSteps : [
          `Fill spray tank with half water`,
          `Add ${product.name} @ ${product.dosage}`,
          `Mix well for 5 minutes`,
          `Fill remaining water`,
          `Add sticker/spreader`
        ]
      },
      caution: {
        en: safety.warnings.length > 0 
          ? `⚠️ ${safety.warnings[0]}` 
          : '⚠️ Use within 2 hours of mixing'
      }
    };
  }
  
  private translateMixingStep(step: string, originalName: string, translatedName: string, _lang: SupportedLanguage): string {
    // Replace product name in step — LLM narration layer translates at runtime
    return step.replace(originalName, translatedName);
  }
  
  /**
   * Build application method with extracted data
   */
  private buildPopulatedApplicationMethod(
    product: ExtractedProductDetails,
    applicationSteps: string[]
  ): ApplicationInstructions['application_method'] {
    const methodMr = getMethodTranslation(product.method, 'mr');
    const methodHi = getMethodTranslation(product.method, 'hi');
    const methodEn = getMethodTranslation(product.method, 'en');
    
    return {
      method: {
        mr: methodMr,
        hi: methodHi,
        en: methodEn
      },
      coverage_tips: {
        mr: applicationSteps.length > 0 ? applicationSteps.map(s => this.translateApplicationStep(s, 'mr')) : [
          'पानांच्या वरच्या आणि खालच्या दोन्ही बाजू फवारा',
          'नवीन पाने आणि फुलांवर जास्त लक्ष द्या',
          'एकसमान फवारणी करा - एक ठिकाणी जास्त नको',
          'संपूर्ण झाड ओले होईल इतपत फवारा'
        ],
        hi: applicationSteps.length > 0 ? applicationSteps.map(s => this.translateApplicationStep(s, 'hi')) : [
          'पत्तों के ऊपर और नीचे दोनों तरफ छिड़काव करें',
          'नई पत्तियों और फूलों पर ज्यादा ध्यान दें',
          'समान छिड़काव करें - एक जगह ज्यादा नहीं',
          'पूरा पौधा गीला हो जाए इतना छिड़काव करें'
        ],
        en: applicationSteps.length > 0 ? applicationSteps : [
          'Spray both upper and lower leaf surfaces',
          'Focus on new leaves and flowers',
          'Apply evenly - not too much in one spot',
          'Spray until plant is thoroughly wet'
        ]
      }
    };
  }
  
  private translateApplicationStep(step: string, lang: SupportedLanguage): string {
    // Basic translation for common application terms
    if (lang === 'en') return step;
    
    // For now return as-is, proper translation would use AI or lookup table
    return step;
  }
  
  /**
   * Build safety instructions with extracted data
   */
  private buildPopulatedSafetyInstructions(
    safety: ReturnType<typeof extractSafetyInfo>
  ): ApplicationInstructions['safety_equipment'] {
    // Translate PPE items
    const ppeMr = safety.ppeRequired.map((ppe: string) => getSafetyGearTranslation(ppe, 'mr'));
    const ppeHi = safety.ppeRequired.map((ppe: string) => getSafetyGearTranslation(ppe, 'hi'));
    const ppeEn = safety.ppeRequired.map((ppe: string) => getSafetyGearTranslation(ppe, 'en'));
    
    return {
      required_ppe: {
        mr: ppeMr.length > 0 ? ppeMr : ['हातमोजे घाला', 'मास्क लावा', 'पूर्ण बाह्यांचा शर्ट घाला'],
        hi: ppeHi.length > 0 ? ppeHi : ['दस्ताने पहनें', 'मास्क लगाएं', 'पूरी बांह की शर्ट पहनें'],
        en: ppeEn.length > 0 ? ppeEn : ['Wear gloves', 'Wear mask', 'Wear full-sleeved shirt']
      },
      safety_tips: {
        mr: [
          'फवारणीनंतर साबणाने हात धुवा',
          'फवारणी करताना खाणे/पिणे नको',
          'फवारणीनंतर कपडे बदला',
          'मुलांना दूर ठेवा'
        ],
        hi: [
          'छिड़काव के बाद साबुन से हाथ धोएं',
          'छिड़काव करते समय खाना/पीना नहीं',
          'छिड़काव के बाद कपड़े बदलें',
          'बच्चों को दूर रखें'
        ],
        en: [
          'Wash hands with soap after spraying',
          'No eating/drinking while spraying',
          'Change clothes after spraying',
          'Keep children away'
        ]
      },
      first_aid: {
        mr: 'डोळ्यात गेल्यास स्वच्छ पाण्याने धुवा. त्वचेवर आल्यास साबणाने धुवा. समस्या असल्यास: ' + safety.emergencyContact,
        hi: 'आंखों में जाने पर साफ पानी से धोएं। त्वचा पर लगने पर साबुन से धोएं। समस्या होने पर: ' + safety.emergencyContact,
        en: 'If in eyes, rinse with clean water. If on skin, wash with soap. For problems: ' + safety.emergencyContact
      }
    };
  }
  
  private generateMaterialsList(details: any, economics: EconomicAssessment): ApplicationInstructions['materials_needed'] {
    const items = [];
    
    // CRITICAL FIX: Sanitize product name before adding to materials list
    const productName = this.sanitizeProductName(details?.product_name);
    
    // Main product - only add if valid product name exists
    if (productName) {
      items.push({
        name: {
          mr: productName,
          hi: productName,
          en: productName
        },
        quantity: details?.quantity_per_acre || 'प्रमाणानुसार',
        cost_inr: economics?.breakdown?.product_cost_inr || Math.round((economics?.treatment_cost_per_acre_inr || 0) * 0.6)
      });
    }
    
    // Water
    items.push({
      name: {
        mr: 'पाणी',
        hi: 'पानी',
        en: 'Water'
      },
      quantity: details?.water_requirement || '200 लिटर/एकर'
    });
    
    // Sticker/spreader if applicable
    if (details?.product_type === 'BOTANICAL' || details?.product_type === 'BIOLOGICAL') {
      items.push({
        name: {
          mr: 'स्टिकर/स्प्रेडर',
          hi: 'स्टिकर/स्प्रेडर',
          en: 'Sticker/Spreader'
        },
        quantity: '50ml/एकर',
        cost_inr: 100
      });
    }
    
    return {
      items,
      total_cost_inr: economics?.treatment_cost_inr || 0,
      cost_per_acre_inr: economics?.treatment_cost_per_acre_inr || 0
    };
  }
  
  /**
   * CRITICAL FIX: Sanitize product names to remove invalid values
   */
  private sanitizeProductName(name: any): string | null {
    if (!name) return null;
    const strName = String(name).trim();
    if (strName === '' || 
        strName.toLowerCase() === 'none' || 
        strName.toLowerCase() === 'undefined' || 
        strName.toLowerCase() === 'null') {
      return null;
    }
    return strName;
  }
  
  private generateMixingInstructions(details: any): ApplicationInstructions['mixing_instructions'] {
    // CRITICAL FIX: Sanitize product name in mixing instructions
    const productName = this.sanitizeProductName(details?.product_name) || 'औषध';
    
    return {
      steps: {
        mr: [
          'अर्ध्या पाण्यात ' + productName + ' घाला',
          'स्टिकर मिक्स करा, नीट ढवळा',
          'उरलेले पाणी भरा',
          'स्प्रेयर स्वच्छ करा'
        ],
        hi: [
          'आधे पानी में ' + productName + ' डालें',
          'स्टिकर मिलाएं, अच्छी तरह हिलाएं',
          'बाकी पानी भरें',
          'स्प्रेयर साफ करें'
        ],
        en: [
          'Add ' + productName + ' to half the water',
          'Mix sticker, stir well',
          'Fill remaining water',
          'Clean the sprayer'
        ]
      },
      caution: {
        mr: '⚠️ मिश्रण तयार केल्यानंतर 2 तासांत वापरा',
        hi: '⚠️ मिश्रण बनाने के 2 घंटे के भीतर उपयोग करें',
        en: '⚠️ Use within 2 hours of mixing'
      }
    };
  }
  
  private generateApplicationMethod(details: any): ApplicationInstructions['application_method'] {
    return {
      method: {
        mr: details.application_method === 'FOLIAR_SPRAY' ? 'पानांवर फवारणी' : details.application_method,
        hi: details.application_method === 'FOLIAR_SPRAY' ? 'पत्तों पर छिड़काव' : details.application_method,
        en: details.application_method === 'FOLIAR_SPRAY' ? 'Foliar spray' : details.application_method
      },
      coverage_tips: {
        mr: [
          'पानांच्या वरच्या आणि खालच्या दोन्ही बाजू',
          'नवीन पाने आणि फुलांवर जास्त',
          'फवारणी समान करा - एक ठिकाणी जास्त नको'
        ],
        hi: [
          'पत्तों के ऊपर और नीचे दोनों तरफ',
          'नई पत्तियों और फूलों पर ज्यादा',
          'समान छिड़काव करें - एक जगह ज्यादा नहीं'
        ],
        en: [
          'Cover both upper and lower leaf surfaces',
          'Focus on new leaves and flowers',
          'Spray evenly - not too much in one spot'
        ]
      }
    };
  }
  
  private generateTimingInstructions(timing: any, details: any): ApplicationInstructions['timing'] {
    const bestTime = timing.best_time_of_day || 'EARLY_MORNING';
    
    const timeMap: Record<string, TrilingualText> = {
      'EARLY_MORNING': {
        mr: 'सकाळी 6-9 वाजता',
        hi: 'सुबह 6-9 बजे',
        en: '6-9 AM'
      },
      'MORNING': {
        mr: 'सकाळी 6-10 वाजता',
        hi: 'सुबह 6-10 बजे',
        en: '6-10 AM'
      },
      'EVENING': {
        mr: 'संध्याकाळी 4-6 वाजता',
        hi: 'शाम 4-6 बजे',
        en: '4-6 PM'
      },
      'ANY': {
        mr: 'कोणत्याही वेळी (थंड हवामानात)',
        hi: 'किसी भी समय (ठंडे मौसम में)',
        en: 'Any time (in cool weather)'
      }
    };
    
    return {
      best_time: timeMap[bestTime] || timeMap['MORNING'],
      duration_estimate: {
        mr: '1-2 तास/एकर',
        hi: '1-2 घंटे/एकड़',
        en: '1-2 hours/acre'
      },
      weather_conditions: {
        mr: 'थंड हवामान, वारा कमी (<15 किमी/तास)',
        hi: 'ठंडा मौसम, कम हवा (<15 किमी/घंटा)',
        en: 'Cool weather, low wind (<15 km/h)'
      },
      avoid_times: {
        mr: 'दुपारी 11-4 वाजता फवारणी टाळा (उष्णता)',
        hi: 'दोपहर 11-4 बजे छिड़काव न करें (गर्मी)',
        en: 'Avoid spraying 11 AM - 4 PM (heat)'
      }
    };
  }
  
  private generateSafetyInstructions(details: any): ApplicationInstructions['safety_equipment'] {
    const ppeList = details.ppe_required || ['GLOVES', 'MASK', 'FULL_SLEEVES'];
    
    return {
      required_ppe: {
        mr: ['हातमोजे घाला', 'मास्क लावा', 'पूर्ण बाह्यांचा शर्ट घाला', 'बूट घाला'],
        hi: ['दस्ताने पहनें', 'मास्क लगाएं', 'पूरी बांह की शर्ट पहनें', 'जूते पहनें'],
        en: ['Wear gloves', 'Wear mask', 'Wear full-sleeved shirt', 'Wear boots']
      },
      safety_tips: {
        mr: [
          'फवारणीनंतर साबणाने हात धुवा',
          'फवारणी करताना खाणे/पिणे नको',
          'फवारणीनंतर कपडे बदला',
          'मुलांना दूर ठेवा'
        ],
        hi: [
          'छिड़काव के बाद साबुन से हाथ धोएं',
          'छिड़काव करते समय खाना/पीना नहीं',
          'छिड़काव के बाद कपड़े बदलें',
          'बच्चों को दूर रखें'
        ],
        en: [
          'Wash hands with soap after spraying',
          'No eating/drinking while spraying',
          'Change clothes after spraying',
          'Keep children away'
        ]
      },
      first_aid: {
        mr: 'डोळ्यात गेल्यास स्वच्छ पाण्याने धुवा. त्वचेवर आल्यास साबणाने धुवा.',
        hi: 'आंखों में जाने पर साफ पानी से धोएं। त्वचा पर लगने पर साबुन से धोएं।',
        en: 'If in eyes, rinse with clean water. If on skin, wash with soap.'
      }
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 3: RATIONALE (v3.1 - Full Data Population)
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateRationale(decision: DecisionOutput, lang: SupportedLanguage): Rationale {
    // EXTRACT DATA using new extractors
    const cause = extractCauseInfo(decision);
    const product = extractProductDetails(decision);
    const scientific = extractScientificBasis(decision.rules_applied || []);
    const alternatives = extractAlternatives(decision);
    
    const primary = decision.primary_decision;
    
    // TRANSLATE CAUSE to farmer-friendly language
    const causeMr = getCauseTranslation(cause.cause, 'mr');
    const causeHi = getCauseTranslation(cause.cause, 'hi');
    const causeEn = getCauseTranslation(cause.cause, 'en');
    
    // Get efficacy percentage
    const efficacy = primary?.expected_outcomes?.efficacy_percent || cause.confidence * 100;
    
    return {
      heading: SECTION_HEADINGS['RATIONALE'],
      
      problem_assessment: {
        current_status: {
          mr: `तुमच्या पिकावर आढळले: ${causeMr}`,
          hi: `आपकी फसल पर पाया गया: ${causeHi}`,
          en: `Detected on your crop: ${causeEn}`
        },
        threshold_info: cause.severity === 'HIGH' || cause.severity === 'CRITICAL' ? {
          mr: `⚠️ गंभीर स्थिती (${Math.round(cause.affected_area_percent)}% क्षेत्र प्रभावित) - तात्काळ कृती आवश्यक`,
          hi: `⚠️ गंभीर स्थिति (${Math.round(cause.affected_area_percent)}% क्षेत्र प्रभावित) - तुरंत कार्रवाई आवश्यक`,
          en: `⚠️ Serious condition (${Math.round(cause.affected_area_percent)}% area affected) - Immediate action required`
        } : {
          mr: 'आर्थिक थ्रेशोल्ड ओलांडली - कृती फायदेशीर',
          hi: 'आर्थिक सीमा पार हो गई - कार्रवाई लाभदायक',
          en: 'Economic threshold exceeded - Action beneficial'
        }
      },
      
      why_this_treatment: {
        reasons: product ? {
          mr: [
            `${Math.round(efficacy)}% प्रभावी या समस्येवर`,
            `${getProductName(product.name, 'mr')} - सुरक्षित आणि मान्यताप्राप्त`,
            'किफायतशीर आणि सहज उपलब्ध'
          ],
          hi: [
            `${Math.round(efficacy)}% प्रभावी इस समस्या पर`,
            `${getProductName(product.name, 'hi')} - सुरक्षित और मान्यता प्राप्त`,
            'किफायती और आसानी से उपलब्ध'
          ],
          en: [
            `${Math.round(efficacy)}% effective for this problem`,
            `${product.name} - Safe and approved`,
            'Cost-effective and readily available'
          ]
        } : {
          mr: ['नियमित निरीक्षण पुरेसे', 'सध्या कोणत्याही उपचाराची गरज नाही'],
          hi: ['नियमित निगरानी पर्याप्त', 'अभी किसी उपचार की जरूरत नहीं'],
          en: ['Regular monitoring sufficient', 'No treatment needed currently']
        },
        scientific_basis_simple: {
          mr: scientific || 'ICAR मान्यताप्राप्त पद्धत',
          hi: scientific || 'ICAR मान्यता प्राप्त विधि',
          en: scientific || 'ICAR approved method'
        },
        advantages: {
          mr: ['प्रतिकार विकसित होत नाही', 'पर्यावरण मित्र', 'मधमाश्यांना सुरक्षित'],
          hi: ['प्रतिरोध विकसित नहीं होता', 'पर्यावरण मित्र', 'मधुमक्खियों के लिए सुरक्षित'],
          en: ['No resistance development', 'Environment friendly', 'Safe for bees']
        }
      },
      
      expected_results: {
        timeline: {
          mr: `${primary?.expected_outcomes?.time_to_visible_effect_days || 7} दिवसांत परिणाम दिसेल`,
          hi: `${primary?.expected_outcomes?.time_to_visible_effect_days || 7} दिनों में परिणाम दिखेगा`,
          en: `Results visible in ${primary?.expected_outcomes?.time_to_visible_effect_days || 7} days`
        },
        success_indicators: {
          mr: primary?.expected_outcomes?.success_indicators_mr || 
            primary?.expected_outcomes?.success_indicators?.slice(0, 3) || 
            ['समस्या कमी होणे', 'पाने हिरवी होणे', 'नवीन वाढ दिसणे'],
          hi: primary?.expected_outcomes?.success_indicators_hi || 
            primary?.expected_outcomes?.success_indicators?.slice(0, 3) ||
            ['समस्या कम होना', 'पत्ते हरे होना', 'नई बढ़त दिखना'],
          en: primary?.expected_outcomes?.success_indicators?.slice(0, 3) ||
            ['Problem reducing', 'Leaves greening', 'New growth visible']
        },
        realistic_expectations: {
          mr: `${Math.round(efficacy * 0.8)}-${Math.round(efficacy)}% कमी अपेक्षित - 100% नाही`,
          hi: `${Math.round(efficacy * 0.8)}-${Math.round(efficacy)}% कमी अपेक्षित - 100% नहीं`,
          en: `${Math.round(efficacy * 0.8)}-${Math.round(efficacy)}% reduction expected - not 100%`
        }
      },
      
      comparison_to_alternatives: alternatives.length > 0 ? {
        why_not_chemical: primary?.ipm_level && primary.ipm_level <= 4 ? {
          mr: 'रासायनिक नंतर - जैविक प्रथम IPM तत्त्व आहे',
          hi: 'रासायनिक बाद में - जैविक पहले IPM सिद्धांत है',
          en: 'Chemical later - biological first is IPM principle'
        } : undefined,
        why_this_is_best: {
          mr: `सर्वात योग्य पर्याय. ${alternatives.length} इतर पर्याय उपलब्ध.`,
          hi: `सबसे उपयुक्त विकल्प। ${alternatives.length} अन्य विकल्प उपलब्ध।`,
          en: `Best option selected. ${alternatives.length} alternatives available.`
        }
      } : undefined
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 4: WARNINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateWarnings(decision: DecisionOutput, lang: SupportedLanguage): Warnings {
    // PHASE-16: Safe array handling to prevent crashes
    const safeBlockedActions = Array.isArray(decision?.blocked_actions) ? decision.blocked_actions : [];
    const blockedActions = safeBlockedActions.filter(b => b != null).map(blocked => ({
      icon: '❌' as const,
      action: {
        mr: blocked.action,
        hi: blocked.action,
        en: blocked.action
      },
      reason: {
        mr: blocked.reason_mr || blocked.reason,
        hi: blocked.reason_hi || blocked.reason,
        en: blocked.reason
      },
      consequence: {
        mr: 'पैसे वाया जातील / नुकसान होईल',
        hi: 'पैसे बर्बाद होंगे / नुकसान होगा',
        en: 'Money will be wasted / Damage may occur'
      },
      severity: 'HIGH' as const
    }));
    
    const commonMistakes = [
      {
        mistake: {
          mr: 'जास्त डोस वापरणे',
          hi: 'ज्यादा खुराक देना',
          en: 'Using higher dose'
        },
        why_wrong: {
          mr: 'पानांना जळवेल, प्रतिकार वाढेल',
          hi: 'पत्तियां जलेंगी, प्रतिरोध बढ़ेगा',
          en: 'Will burn leaves, increase resistance'
        },
        correct_approach: {
          mr: 'लेबलवर दिलेला डोस वापरा',
          hi: 'लेबल पर दी गई खुराक का उपयोग करें',
          en: 'Use dose mentioned on label'
        }
      },
      {
        mistake: {
          mr: 'उन्हात फवारणी करणे',
          hi: 'धूप में छिड़काव करना',
          en: 'Spraying in hot sun'
        },
        why_wrong: {
          mr: 'पटकन सुकते, परिणाम कमी',
          hi: 'जल्दी सूख जाता है, परिणाम कम',
          en: 'Evaporates quickly, less effective'
        },
        correct_approach: {
          mr: 'सकाळी किंवा संध्याकाळी फवारा',
          hi: 'सुबह या शाम को छिड़काव करें',
          en: 'Spray in morning or evening'
        }
      }
    ];
    
    return {
      heading: SECTION_HEADINGS['WARNINGS'],
      blocked_actions: blockedActions,
      common_mistakes: commonMistakes
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 5: ECONOMICS (v3.1 - Full Data Population)
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateEconomics(economics: EconomicAssessment | undefined, lang: SupportedLanguage): EconomicSummary {
    // Handle missing economics data gracefully
    if (!economics) {
      return {
        heading: SECTION_HEADINGS['ECONOMICS'],
        treatment_cost: {
          amount_inr: 0,
          breakdown: {
            en: 'Cost information not available'
          }
        },
        expected_benefit: {
          loss_prevented_inr: 0,
          explanation: {
            en: 'Benefit information not available'
          }
        },
        net_benefit: {
          amount_inr: 0,
          roi_message: {
            en: 'ROI information not available'
          }
        },
        affordability_message: {
          en: 'Check budget information'
        },
        value_proposition: {
          en: '📊 Economic information not available'
        }
      };
    }
    
    // Extract economic info using the extractor
    const economicInfo = extractEconomicInfo({ economic_assessment: economics } as DecisionOutput);
    
    const costPerAcre = economics.treatment_cost_per_acre_inr || economicInfo?.cost_inr || 0;
    const totalCost = economics.treatment_cost_inr || costPerAcre;
    const benefit = economics.expected_loss_prevented_inr || economicInfo?.benefit_inr || 0;
    const netBenefit = economics.net_benefit_inr || (benefit - totalCost);
    const bcr = economics.benefit_cost_ratio || economicInfo?.bcr || (totalCost > 0 ? benefit / totalCost : 0);
    const canAfford = economics.affordability?.farmer_can_afford ?? economicInfo?.is_viable ?? true;
    
    return {
      heading: SECTION_HEADINGS['ECONOMICS'],
      
      treatment_cost: {
        amount_inr: totalCost,
        breakdown: {
          mr: `💰 खर्च: ₹${costPerAcre}/एकर = एकूण ₹${totalCost}`,
          hi: `💰 लागत: ₹${costPerAcre}/एकड़ = कुल ₹${totalCost}`,
          en: `💰 Cost: ₹${costPerAcre}/acre = Total ₹${totalCost}`
        }
      },
      
      expected_benefit: {
        loss_prevented_inr: benefit,
        explanation: {
          mr: `📈 उपचाराने ₹${benefit} नुकसान टळेल`,
          hi: `📈 उपचार से ₹${benefit} नुकसान टलेगा`,
          en: `📈 Treatment will prevent ₹${benefit} loss`
        }
      },
      
      net_benefit: {
        amount_inr: netBenefit,
        roi_message: {
          mr: `💵 प्रत्येक ₹1 खर्चावर ₹${bcr.toFixed(1)} परतावा मिळेल`,
          hi: `💵 हर ₹1 खर्च पर ₹${bcr.toFixed(1)} वापसी मिलेगी`,
          en: `💵 Every ₹1 spent returns ₹${bcr.toFixed(1)}`
        }
      },
      
      affordability_message: {
        mr: canAfford 
          ? '✅ तुमच्या बजेटमध्ये बसते' 
          : '⚠️ बजेटपेक्षा जास्त - स्वस्त पर्याय विचारात घ्या',
        hi: canAfford 
          ? '✅ आपके बजट में है' 
          : '⚠️ बजट से ज्यादा - सस्ता विकल्प विचार करें',
        en: canAfford 
          ? '✅ Within your budget' 
          : '⚠️ Over budget - consider cheaper alternatives'
      },
      
      value_proposition: this.getValueProposition(bcr, economics.recommendation)
    };
  }
  
  private getValueProposition(bcr: number, recommendation?: string): TrilingualText {
    if (bcr >= 3 || recommendation === 'STRONGLY_RECOMMENDED') {
      return {
        mr: '💪 अत्यंत शिफारसीय! उत्तम परतावा.',
        hi: '💪 अत्यधिक अनुशंसित! बेहतरीन रिटर्न।',
        en: '💪 Highly recommended! Excellent returns.'
      };
    }
    if (bcr >= 1.5 || recommendation === 'RECOMMENDED') {
      return {
        mr: '👍 शिफारसीय - चांगला परतावा',
        hi: '👍 अनुशंसित - अच्छा रिटर्न',
        en: '👍 Recommended - Good returns'
      };
    }
    if (bcr >= 1) {
      return {
        mr: '⚖️ ठीक आहे - परतावा खर्चाइतका',
        hi: '⚖️ ठीक है - रिटर्न खर्च जितना',
        en: '⚖️ Fair - Returns equal to cost'
      };
    }
    return {
      mr: '⚠️ कमी परतावा - पर्यायी उपाय विचारात घ्या',
      hi: '⚠️ कम रिटर्न - वैकल्पिक उपाय विचार करें',
      en: '⚠️ Low returns - Consider alternatives'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 6: FOLLOW-UP (v3.1 - Full Data Population)
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateFollowUp(decision: DecisionOutput, lang: SupportedLanguage): FollowUpPlan {
    // EXTRACT follow-up schedule using extractor
    // Coerce both extractor returns with explicit nullish fallbacks. Declared
    // return types may be non-nullable, which allows bundlers/optimizers to
    // eliminate downstream `&&` guards as dead code — `??` and `?.` are spec
    // runtime checks no bundler will strip.
    const extractedSchedule = extractFollowUpSchedule(decision) ?? {} as ReturnType<typeof extractFollowUpSchedule>;
    const repeatInfo = extractRepeatApplicationInfo(decision) ?? null;
    
    const schedule = decision.follow_up_schedule;
    const items = [];
    
    // Day 3 check
    items.push({
      day: 3,
      check: {
        mr: extractedSchedule?.day_3 || schedule?.day_3?.check_mr || 'किड्यांची संख्या तपासा',
        hi: extractedSchedule?.day_3 || schedule?.day_3?.check_hi || 'कीटों की संख्या जांचें',
        en: extractedSchedule?.day_3 || schedule?.day_3?.check || 'Check pest population'
      },
      method: {
        mr: '10 पाने यादृच्छिक तपासा',
        hi: '10 पत्ते रैंडम जांचें',
        en: 'Check 10 random leaves'
      },
      success_criteria: {
        mr: schedule?.day_3?.success_criteria_mr || '50% कमी दिसावी',
        hi: schedule?.day_3?.success_criteria_hi || '50% कमी दिखनी चाहिए',
        en: schedule?.day_3?.success_criteria || '50% reduction visible'
      }
    });
    
    // Day 7 check
    items.push({
      day: 7,
      check: {
        mr: extractedSchedule?.day_7 || schedule?.day_7?.check_mr || 'उपचाराची प्रभावीता तपासा',
        hi: extractedSchedule?.day_7 || schedule?.day_7?.check_hi || 'उपचार की प्रभावशीलता जांचें',
        en: extractedSchedule?.day_7 || schedule?.day_7?.check || 'Assess treatment effectiveness'
      },
      method: {
        mr: '20 पाने तपासा, फोटो काढा',
        hi: '20 पत्ते जांचें, फोटो लें',
        en: 'Check 20 leaves, take photos'
      },
      success_criteria: {
        mr: schedule?.day_7?.success_criteria_mr || '70-80% कमी दिसावी',
        hi: schedule?.day_7?.success_criteria_hi || '70-80% कमी दिखनी चाहिए',
        en: schedule?.day_7?.success_criteria || '70-80% reduction visible'
      }
    });
    
    // Day 14 check
    items.push({
      day: 14,
      check: {
        mr: extractedSchedule?.day_14 || 'अंतिम मूल्यांकन करा',
        hi: extractedSchedule?.day_14 || 'अंतिम मूल्यांकन करें',
        en: extractedSchedule?.day_14 || 'Final evaluation'
      },
      method: {
        mr: 'संपूर्ण क्षेत्र तपासा',
        hi: 'पूरा क्षेत्र जांचें',
        en: 'Check entire area'
      },
      success_criteria: {
        mr: 'समस्या नियंत्रणात असावी',
        hi: 'समस्या नियंत्रण में होनी चाहिए',
        en: 'Problem should be under control'
      }
    });
    
    // Build repeat application note if needed (extractor may return null for monitoring-only flows)
    let repeatNote: TrilingualText | undefined;
    // Optional chaining (?.) is preserved by every bundler — never strip-eliminated
    // like `repeatInfo && repeatInfo.x` can be when the declared type is non-nullable.
    if (repeatInfo?.may_need_repeat) {
      const intervalDays = repeatInfo.interval_days ?? 7;
      repeatNote = {
        mr: `📅 ${intervalDays} दिवसांनी पुन्हा फवारणी आवश्यक असू शकते`,
        hi: `📅 ${intervalDays} दिनों बाद फिर से छिड़काव जरूरी हो सकता है`,
        en: `📅 Repeat spray may be needed after ${intervalDays} days`
      };
    }
    
    return {
      heading: SECTION_HEADINGS['FOLLOW_UP'],
      schedule: items,
      automated_followup: {
        system_will_ask: {
          mr: '🔔 मी 3 दिवसांनी तुम्हाला स्वयंचलित विचारेन',
          hi: '🔔 मैं 3 दिनों में आपसे स्वचालित पूछूंगा',
          en: '🔔 I will automatically ask you after 3 days'
        },
        reminder_scheduled: true
      },
      if_not_working: {
        condition: {
          mr: '⚠️ जर 7 दिवसांत 50% कमी नसेल',
          hi: '⚠️ अगर 7 दिनों में 50% कमी न हो',
          en: '⚠️ If no 50% reduction in 7 days'
        },
        next_action: {
          mr: '📞 मला सांगा - आम्ही वेगळा पर्याय शोधू किंवा तज्ञांशी संपर्क करू',
          hi: '📞 मुझे बताएं - हम दूसरा विकल्प खोजेंगे या विशेषज्ञ से संपर्क करेंगे',
          en: '📞 Tell me - we will find another option or contact an expert'
        }
      },
      repeat_application_note: repeatNote
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE COMPILATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  private compileMainMessage(
    sections: any,
    lang: SupportedLanguage,
    tone: MessageTone,
    profile: FarmerProfile,
    questionClassification?: QuestionClassification
  ): any {
    const greeting = (GREETINGS[lang] || GREETINGS['en'])?.[0] || 'Hello,';
    const empathyLine = profile.emotional_state !== 'NEUTRAL' 
      ? (EMPATHY_LINES[profile.emotional_state]?.[lang] || EMPATHY_LINES[profile.emotional_state]?.['en'] || '')
      : undefined;
    const closing = (CLOSINGS[lang] || CLOSINGS['en'])?.[0] || 'Best wishes! 🌾';
    
    // Adjust closing based on response style
    const adjustedClosing = questionClassification?.response_style === 'concise'
      ? closing
      : closing;
    
    return {
      greeting,
      empathy_line: empathyLine,
      sections,  // ONLY the sections that were generated
      closing: adjustedClosing,
      signature: 'KisanShakti AI 🌾'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATION & QUICK ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateNotification(action: ImmediateAction, lang: SupportedLanguage): FarmerNotification {
    return {
      title: 'Advice ready for your crop! 🌾',
      body: action.action_summary[lang] || action.action_summary['en'] || '',
      icon: action.emoji,
      priority: action.urgency_indicator.urgency_level === 'IMMEDIATE' ? 'HIGH' : 'NORMAL'
    };
  }
  
  private generateQuickActions(_lang: SupportedLanguage, scenario: CommunicationScenario): QuickAction[] {
    // English-only keys — LLM narration layer translates at runtime
    const actions: QuickAction[] = [
      {
        button_text: { en: '✅ Got it' },
        action: 'ACKNOWLEDGE',
        icon: '✅'
      },
      {
        button_text: { en: '❓ Ask question' },
        action: 'ASK_QUESTION',
        icon: '❓'
      }
    ];
    
    if (scenario === 'ESCALATED_TO_EXPERT' || scenario === 'EMERGENCY') {
      actions.push({
        button_text: { en: '📞 Call expert' },
        action: 'CALL_EXPERT',
        icon: '📞'
      });
    }
    
    actions.push({
      button_text: { en: '📷 Send photo' },
      action: 'UPLOAD_PHOTO',
      icon: '📷'
    });
    
    return actions;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE VERSION
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateVoiceVersion(mainMessage: any, lang: SupportedLanguage): VoiceVersion {
    const sections = mainMessage.sections;
    
    // Compile text for voice
    let voiceText = mainMessage.greeting + ' ';
    if (mainMessage.empathy_line) {
      voiceText += mainMessage.empathy_line + ' ';
    }
    voiceText += sections.immediate_action.action_summary[lang] + ' ';
    voiceText += mainMessage.closing;
    
    return {
      text_to_speak: voiceText,
      language: lang,
      estimated_duration_seconds: Math.ceil(voiceText.split(/\s+/).length / 2.5), // ~150 words/min
      narrator_voice: getNarratorVoice(lang)
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private mapUrgencyLevel(urgency: string): string {
    const mapping: Record<string, string> = {
      'IMMEDIATE': 'IMMEDIATE',
      'WITHIN_24H': 'TODAY',
      'WITHIN_48H': 'WITHIN_48H',
      'WITHIN_WEEK': 'THIS_WEEK',
      'NON_URGENT': 'NON_URGENT'
    };
    return mapping[urgency] || 'TODAY';
  }
  
  private getUrgencyColor(urgency: string): 'red' | 'orange' | 'yellow' | 'green' {
    const colorMap: Record<string, 'red' | 'orange' | 'yellow' | 'green'> = {
      'IMMEDIATE': 'red',
      'TODAY': 'orange',
      'WITHIN_48H': 'yellow',
      'THIS_WEEK': 'green',
      'NON_URGENT': 'green'
    };
    return colorMap[urgency] || 'orange';
  }
  
  private getFullTextForMetrics(mainMessage: any, lang: SupportedLanguage): string {
    try {
      const sections = mainMessage?.sections;
      let fullText = (mainMessage?.greeting || '') + ' ';
      
      if (mainMessage?.empathy_line) {
        fullText += mainMessage.empathy_line + ' ';
      }
      
      // Safely access immediate_action
      if (sections?.immediate_action?.action_summary?.[lang]) {
        fullText += sections.immediate_action.action_summary[lang] + ' ';
      }
      
      // CRITICAL FIX: Only access how_to if it exists
      const howTo = sections?.how_to;
      if (howTo?.mixing_instructions?.steps?.[lang]) {
        fullText += howTo.mixing_instructions.steps[lang].join(' ') + ' ';
      }
      
      // Safely access closing
      if (mainMessage?.closing) {
        fullText += mainMessage.closing;
      }
      
      return fullText;
    } catch (error) {
      console.warn('⚠️ [CommunicationGenerator] getFullTextForMetrics error - using fallback:', error);
      // Return minimal text to avoid crash
      return mainMessage?.greeting || 'Advisory generated';
    }
  }
  
  private calculateComplexity(text: string): number {
    const words = text.split(/\s+/);
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    
    // Simple complexity: 0-1 based on average word length
    return Math.min(1, avgWordLength / 10);
  }
  
  private getEmojiDescriptions(lang: SupportedLanguage): Record<string, string> {
    const descriptions: Record<string, string> = {};
    for (const [emoji, trilingual] of Object.entries(EMOJI_DESCRIPTIONS)) {
      descriptions[emoji] = trilingual[lang];
    }
    return descriptions;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const communicationGenerator = new CommunicationGenerator();
export const COMMUNICATION_VERSION = '3.0.0';
