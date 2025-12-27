/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARMER COMMUNICATION GENERATOR v3.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Translates complex technical decisions from the Rule Engine into clear,
 * actionable, culturally appropriate advice in Marathi, Hindi, and English.
 */

import type { DecisionOutput, EconomicAssessment, PrimaryDecision } from './rule-engine-types.ts';
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

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNICATION GENERATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class CommunicationGenerator {
  private readonly version = '3.0.0';
  
  /**
   * Main entry point - Generate farmer-friendly communication
   */
  async generate(
    decisionOutput: DecisionOutput,
    farmerProfile: FarmerProfile,
    conversationContext: ConversationContext
  ): Promise<FarmerCommunication> {
    console.log('📝 Communication Generator: Starting message generation...');
    const startTime = Date.now();
    
    // Determine scenario and tone
    const scenario = this.determineScenario(decisionOutput, conversationContext);
    const tone = this.selectTone(farmerProfile.emotional_state, scenario);
    const lang = farmerProfile.preferred_language;
    
    console.log(`   Scenario: ${scenario}, Tone: ${tone}, Language: ${lang}`);
    
    // Generate all sections
    const sections = {
      immediate_action: this.generateImmediateAction(decisionOutput, lang, tone),
      how_to: this.generateHowTo(decisionOutput, lang, farmerProfile.literacy_level),
      rationale: this.generateRationale(decisionOutput, lang),
      warnings: this.generateWarnings(decisionOutput, lang),
      economics: this.generateEconomics(decisionOutput.economic_assessment, lang),
      follow_up: this.generateFollowUp(decisionOutput, lang)
    };
    
    // Compile main message
    const mainMessage = this.compileMainMessage(
      sections,
      lang,
      tone,
      farmerProfile
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
        reading_time_seconds: Math.ceil(wordCount / 3), // ~180 words/min
        complexity_score: this.calculateComplexity(fullText),
        adapted_for_literacy: farmerProfile.literacy_level !== 'HIGH',
        adapted_for_emotion: farmerProfile.emotional_state !== 'NEUTRAL'
      }
    };
    
    console.log(`✅ Communication Generator: Message generated in ${Date.now() - startTime}ms`);
    console.log(`   Word count: ${wordCount}, Reading time: ${output.metadata.reading_time_seconds}s`);
    
    return output;
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
    const primary = decision.primary_decision;
    const urgency = this.mapUrgencyLevel(primary.urgency);
    
    // Determine action summary based on action type
    const actionSummary = this.getActionSummary(primary, decision);
    
    // Add weather note if relevant
    let weatherNote: TrilingualText | undefined;
    if (decision.status === 'WEATHER_DELAYED' || 
        decision.blocked_actions.some(b => b.blocked_by_rule.includes('WEATHER'))) {
      weatherNote = this.getWeatherNote(decision);
    }
    
    return {
      emoji: decision.status === 'BLOCKED' ? '⚠️' : '📌',
      heading: SECTION_HEADINGS['IMMEDIATE_ACTION'],
      action_summary: actionSummary,
      urgency_indicator: {
        text: URGENCY_INDICATORS[urgency] || URGENCY_INDICATORS['TODAY'],
        color: this.getUrgencyColor(urgency),
        urgency_level: urgency as any
      },
      weather_note: weatherNote
    };
  }
  
  private getActionSummary(primary: PrimaryDecision, decision: DecisionOutput): TrilingualText {
    const productName = primary.application_details.product_name;
    const timing = primary.timing.recommended_start 
      ? new Date(primary.timing.recommended_start).toLocaleDateString('mr-IN')
      : 'आज';
    
    if (primary.action_type === 'NO_ACTION' || primary.action_type === 'MONITOR_ONLY') {
      return {
        mr: 'सध्या कोणतीही कृती आवश्यक नाही. निरीक्षण सुरू ठेवा.',
        hi: 'अभी कोई कार्रवाई आवश्यक नहीं। निगरानी जारी रखें।',
        en: 'No action required at this time. Continue monitoring.'
      };
    }
    
    if (decision.status === 'BLOCKED') {
      const blockedAction = decision.blocked_actions[0];
      return {
        mr: `⚠️ थांबा: ${blockedAction?.reason || 'सुरक्षा कारणांमुळे'}`,
        hi: `⚠️ रुकें: ${blockedAction?.reason || 'सुरक्षा कारणों से'}`,
        en: `⚠️ Stop: ${blockedAction?.reason || 'For safety reasons'}`
      };
    }
    
    if (decision.status === 'WEATHER_DELAYED') {
      return {
        mr: `पाऊस/हवामानामुळे प्रतीक्षा करा. पुढील सुरक्षित वेळ: ${timing}`,
        hi: `बारिश/मौसम के कारण प्रतीक्षा करें। अगला सुरक्षित समय: ${timing}`,
        en: `Wait due to weather. Next safe window: ${timing}`
      };
    }
    
    // Standard recommendation
    return {
      mr: `${timing} सकाळी ${productName} फवारणी करा.`,
      hi: `${timing} सुबह ${productName} का छिड़काव करें।`,
      en: `Apply ${productName} spray on ${timing} morning.`
    };
  }
  
  private getWeatherNote(decision: DecisionOutput): TrilingualText {
    return {
      mr: '⛈️ पुढील 24 तासांत पाऊस शक्य - फवारणी टाळा',
      hi: '⛈️ अगले 24 घंटों में बारिश संभव - छिड़काव टालें',
      en: '⛈️ Rain possible in next 24 hours - avoid spraying'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2: HOW TO DO IT
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateHowTo(
    decision: DecisionOutput,
    lang: SupportedLanguage,
    literacy: string
  ): ApplicationInstructions {
    const primary = decision.primary_decision;
    const details = primary.application_details;
    
    // Generate materials list
    const materials = this.generateMaterialsList(details, decision.economic_assessment);
    
    // Generate mixing instructions
    const mixing = this.generateMixingInstructions(details);
    
    // Generate application method
    const application = this.generateApplicationMethod(details);
    
    // Generate timing
    const timing = this.generateTimingInstructions(primary.timing, details);
    
    // Generate safety equipment
    const safety = this.generateSafetyInstructions(details);
    
    return {
      heading: SECTION_HEADINGS['HOW_TO'],
      materials_needed: materials,
      mixing_instructions: mixing,
      application_method: application,
      timing,
      safety_equipment: safety
    };
  }
  
  private generateMaterialsList(details: any, economics: EconomicAssessment): ApplicationInstructions['materials_needed'] {
    const items = [];
    
    // Main product
    items.push({
      name: {
        mr: details.product_name,
        hi: details.product_name,
        en: details.product_name
      },
      quantity: details.quantity_per_acre,
      cost_inr: economics.breakdown?.product_cost_inr || Math.round(economics.treatment_cost_per_acre_inr * 0.6)
    });
    
    // Water
    items.push({
      name: {
        mr: 'पाणी',
        hi: 'पानी',
        en: 'Water'
      },
      quantity: details.water_requirement || '200 लिटर/एकर'
    });
    
    // Sticker/spreader if applicable
    if (details.product_type === 'BOTANICAL' || details.product_type === 'BIOLOGICAL') {
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
      total_cost_inr: economics.treatment_cost_inr,
      cost_per_acre_inr: economics.treatment_cost_per_acre_inr
    };
  }
  
  private generateMixingInstructions(details: any): ApplicationInstructions['mixing_instructions'] {
    return {
      steps: {
        mr: [
          'अर्ध्या पाण्यात ' + details.product_name + ' घाला',
          'स्टिकर मिक्स करा, नीट ढवळा',
          'उरलेले पाणी भरा',
          'स्प्रेयर स्वच्छ करा'
        ],
        hi: [
          'आधे पानी में ' + details.product_name + ' डालें',
          'स्टिकर मिलाएं, अच्छी तरह हिलाएं',
          'बाकी पानी भरें',
          'स्प्रेयर साफ करें'
        ],
        en: [
          'Add ' + details.product_name + ' to half the water',
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
  // LAYER 3: RATIONALE
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateRationale(decision: DecisionOutput, lang: SupportedLanguage): Rationale {
    const scientific = decision.scientific_justification[0];
    const primary = decision.primary_decision;
    
    return {
      heading: SECTION_HEADINGS['RATIONALE'],
      
      problem_assessment: {
        current_status: {
          mr: `तुमच्या पिकावर ${primary.target.pest_code || primary.target.disease_code || 'समस्या'} आढळली`,
          hi: `आपकी फसल पर ${primary.target.pest_code || primary.target.disease_code || 'समस्या'} पाई गई`,
          en: `${primary.target.pest_code || primary.target.disease_code || 'Issue'} detected on your crop`
        },
        threshold_info: {
          mr: 'आर्थिक थ्रेशोल्ड ओलांडली - कृती आवश्यक',
          hi: 'आर्थिक सीमा पार हो गई - कार्रवाई आवश्यक',
          en: 'Economic threshold exceeded - action required'
        }
      },
      
      why_this_treatment: {
        reasons: {
          mr: [
            `${primary.expected_outcomes.efficacy_percent}% प्रभावी`,
            'सुरक्षित आणि मान्यताप्राप्त',
            'किफायतशीर'
          ],
          hi: [
            `${primary.expected_outcomes.efficacy_percent}% प्रभावी`,
            'सुरक्षित और मान्यता प्राप्त',
            'किफायती'
          ],
          en: [
            `${primary.expected_outcomes.efficacy_percent}% effective`,
            'Safe and approved',
            'Cost-effective'
          ]
        },
        scientific_basis_simple: {
          mr: scientific?.rationale || 'ICAR मान्यताप्राप्त पद्धत',
          hi: scientific?.rationale || 'ICAR मान्यता प्राप्त विधि',
          en: scientific?.rationale || 'ICAR approved method'
        },
        advantages: {
          mr: ['प्रतिकार विकसित होत नाही', 'पर्यावरण मित्र', 'मधमाश्यांना सुरक्षित'],
          hi: ['प्रतिरोध विकसित नहीं होता', 'पर्यावरण मित्र', 'मधुमक्खियों के लिए सुरक्षित'],
          en: ['No resistance development', 'Environment friendly', 'Safe for bees']
        }
      },
      
      expected_results: {
        timeline: {
          mr: primary.expected_outcomes.time_to_visible_effect_days + ' दिवसांत परिणाम',
          hi: primary.expected_outcomes.time_to_visible_effect_days + ' दिनों में परिणाम',
          en: 'Results in ' + primary.expected_outcomes.time_to_visible_effect_days + ' days'
        },
        success_indicators: {
          mr: primary.expected_outcomes.success_indicators_mr || 
            primary.expected_outcomes.success_indicators.slice(0, 3),
          hi: primary.expected_outcomes.success_indicators_hi || 
            primary.expected_outcomes.success_indicators.slice(0, 3),
          en: primary.expected_outcomes.success_indicators.slice(0, 3)
        },
        realistic_expectations: {
          mr: '70-80% कमी अपेक्षित - 100% नाही',
          hi: '70-80% कमी अपेक्षित - 100% नहीं',
          en: '70-80% reduction expected - not 100%'
        }
      },
      
      comparison_to_alternatives: primary.ipm_level && primary.ipm_level <= 4 ? {
        why_not_chemical: {
          mr: 'रासायनिक नंतर - जैविक प्रथम IPM तत्त्व आहे',
          hi: 'रासायनिक बाद में - जैविक पहले IPM सिद्धांत है',
          en: 'Chemical later - biological first is IPM principle'
        },
        why_this_is_best: {
          mr: 'सर्वात योग्य पर्याय आर्थिक आणि पर्यावरणीय दृष्टीने',
          hi: 'सबसे उपयुक्त विकल्प आर्थिक और पर्यावरण की दृष्टि से',
          en: 'Best option economically and environmentally'
        }
      } : undefined
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 4: WARNINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateWarnings(decision: DecisionOutput, lang: SupportedLanguage): Warnings {
    const blockedActions = decision.blocked_actions.map(blocked => ({
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
  // LAYER 5: ECONOMICS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateEconomics(economics: EconomicAssessment, lang: SupportedLanguage): EconomicSummary {
    return {
      heading: SECTION_HEADINGS['ECONOMICS'],
      
      treatment_cost: {
        amount_inr: economics.treatment_cost_inr,
        breakdown: {
          mr: `₹${economics.treatment_cost_per_acre_inr}/एकर × जमीन = ₹${economics.treatment_cost_inr}`,
          hi: `₹${economics.treatment_cost_per_acre_inr}/एकड़ × जमीन = ₹${economics.treatment_cost_inr}`,
          en: `₹${economics.treatment_cost_per_acre_inr}/acre × land = ₹${economics.treatment_cost_inr}`
        }
      },
      
      expected_benefit: {
        loss_prevented_inr: economics.expected_loss_prevented_inr,
        explanation: {
          mr: `उपचार न केल्यास ₹${economics.expected_loss_without_treatment_inr} नुकसान संभव`,
          hi: `उपचार न करने पर ₹${economics.expected_loss_without_treatment_inr} नुकसान संभव`,
          en: `Without treatment, ₹${economics.expected_loss_without_treatment_inr} loss possible`
        }
      },
      
      net_benefit: {
        amount_inr: economics.net_benefit_inr,
        roi_message: {
          mr: `₹1 खर्च केल्यास ₹${economics.benefit_cost_ratio.toFixed(1)} परत`,
          hi: `₹1 खर्च करने पर ₹${economics.benefit_cost_ratio.toFixed(1)} वापस`,
          en: `₹1 spent returns ₹${economics.benefit_cost_ratio.toFixed(1)}`
        }
      },
      
      affordability_message: {
        mr: economics.affordability.farmer_can_afford 
          ? '✅ तुमच्या बजेटमध्ये बसते' 
          : '⚠️ बजेटपेक्षा जास्त - स्वस्त पर्याय पहा',
        hi: economics.affordability.farmer_can_afford 
          ? '✅ आपके बजट में है' 
          : '⚠️ बजट से ज्यादा - सस्ता विकल्प देखें',
        en: economics.affordability.farmer_can_afford 
          ? '✅ Within your budget' 
          : '⚠️ Over budget - consider cheaper options'
      },
      
      value_proposition: {
        mr: economics.recommendation === 'STRONGLY_RECOMMENDED' 
          ? '💪 हा उपचार अत्यंत शिफारसीय!' 
          : economics.recommendation === 'RECOMMENDED'
            ? '👍 शिफारसीय उपचार'
            : '⚖️ विचार करा',
        hi: economics.recommendation === 'STRONGLY_RECOMMENDED' 
          ? '💪 यह उपचार अत्यधिक अनुशंसित!' 
          : economics.recommendation === 'RECOMMENDED'
            ? '👍 अनुशंसित उपचार'
            : '⚖️ विचार करें',
        en: economics.recommendation === 'STRONGLY_RECOMMENDED' 
          ? '💪 Highly recommended!' 
          : economics.recommendation === 'RECOMMENDED'
            ? '👍 Recommended treatment'
            : '⚖️ Consider carefully'
      }
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 6: FOLLOW-UP
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateFollowUp(decision: DecisionOutput, lang: SupportedLanguage): FollowUpPlan {
    const schedule = decision.follow_up_schedule;
    const items = [];
    
    if (schedule.day_3) {
      items.push({
        day: 3,
        check: {
          mr: schedule.day_3.check_mr || schedule.day_3.check,
          hi: schedule.day_3.check_hi || schedule.day_3.check,
          en: schedule.day_3.check
        },
        method: {
          mr: '10 पाने तपासा',
          hi: '10 पत्ते जांचें',
          en: 'Check 10 leaves'
        },
        success_criteria: {
          mr: schedule.day_3.success_criteria_mr || schedule.day_3.success_criteria,
          hi: schedule.day_3.success_criteria_hi || schedule.day_3.success_criteria,
          en: schedule.day_3.success_criteria
        }
      });
    }
    
    if (schedule.day_7) {
      items.push({
        day: 7,
        check: {
          mr: schedule.day_7.check_mr || schedule.day_7.check,
          hi: schedule.day_7.check_hi || schedule.day_7.check,
          en: schedule.day_7.check
        },
        method: {
          mr: '20 पाने तपासा',
          hi: '20 पत्ते जांचें',
          en: 'Check 20 leaves'
        },
        success_criteria: {
          mr: schedule.day_7.success_criteria_mr || schedule.day_7.success_criteria,
          hi: schedule.day_7.success_criteria_hi || schedule.day_7.success_criteria,
          en: schedule.day_7.success_criteria
        }
      });
    }
    
    return {
      heading: SECTION_HEADINGS['FOLLOW_UP'],
      schedule: items,
      automated_followup: {
        system_will_ask: {
          mr: 'मी 3 दिवसांनी तुम्हाला विचारेन',
          hi: 'मैं 3 दिनों में आपसे पूछूंगा',
          en: 'I will ask you after 3 days'
        },
        reminder_scheduled: true
      },
      if_not_working: {
        condition: {
          mr: 'जर 5 दिवसांत फरक नसेल',
          hi: 'अगर 5 दिनों में फर्क न हो',
          en: 'If no improvement in 5 days'
        },
        next_action: {
          mr: 'मला सांगा - आम्ही वेगळा पर्याय शोधू',
          hi: 'मुझे बताएं - हम दूसरा विकल्प खोजेंगे',
          en: 'Tell me - we will find another option'
        }
      }
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE COMPILATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  private compileMainMessage(
    sections: any,
    lang: SupportedLanguage,
    tone: MessageTone,
    profile: FarmerProfile
  ): any {
    const greeting = GREETINGS[lang][0];
    const empathyLine = profile.emotional_state !== 'NEUTRAL' 
      ? EMPATHY_LINES[profile.emotional_state][lang] 
      : undefined;
    const closing = CLOSINGS[lang][0];
    
    return {
      greeting,
      empathy_line: empathyLine,
      sections,
      closing,
      signature: lang === 'mr' ? 'किसानशक्ती AI 🌾' : 
                 lang === 'hi' ? 'किसानशक्ति AI 🌾' : 
                 'KisanShakti AI 🌾'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATION & QUICK ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateNotification(action: ImmediateAction, lang: SupportedLanguage): FarmerNotification {
    return {
      title: lang === 'mr' ? 'तुमच्या पिकासाठी सल्ला तयार! 🌾' :
             lang === 'hi' ? 'आपकी फसल के लिए सलाह तैयार! 🌾' :
             'Advice ready for your crop! 🌾',
      body: action.action_summary[lang],
      icon: action.emoji,
      priority: action.urgency_indicator.urgency_level === 'IMMEDIATE' ? 'HIGH' : 'NORMAL'
    };
  }
  
  private generateQuickActions(lang: SupportedLanguage, scenario: CommunicationScenario): QuickAction[] {
    const actions: QuickAction[] = [
      {
        button_text: {
          mr: '✅ समजले',
          hi: '✅ समझ गया',
          en: '✅ Got it'
        },
        action: 'ACKNOWLEDGE',
        icon: '✅'
      },
      {
        button_text: {
          mr: '❓ प्रश्न विचारा',
          hi: '❓ सवाल पूछें',
          en: '❓ Ask question'
        },
        action: 'ASK_QUESTION',
        icon: '❓'
      }
    ];
    
    if (scenario === 'ESCALATED_TO_EXPERT' || scenario === 'EMERGENCY') {
      actions.push({
        button_text: {
          mr: '📞 तज्ञाला कॉल करा',
          hi: '📞 विशेषज्ञ को कॉल करें',
          en: '📞 Call expert'
        },
        action: 'CALL_EXPERT',
        icon: '📞'
      });
    }
    
    actions.push({
      button_text: {
        mr: '📷 फोटो पाठवा',
        hi: '📷 फोटो भेजें',
        en: '📷 Send photo'
      },
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
      narrator_voice: lang === 'mr' ? 'MARATHI_MALE' : 
                      lang === 'hi' ? 'HINDI_MALE' : 
                      'ENGLISH_NEUTRAL'
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
    const sections = mainMessage.sections;
    let fullText = mainMessage.greeting + ' ';
    
    if (mainMessage.empathy_line) {
      fullText += mainMessage.empathy_line + ' ';
    }
    
    fullText += sections.immediate_action.action_summary[lang] + ' ';
    
    // Add other sections
    const howTo = sections.how_to;
    if (howTo.mixing_instructions?.steps?.[lang]) {
      fullText += howTo.mixing_instructions.steps[lang].join(' ') + ' ';
    }
    
    fullText += mainMessage.closing;
    
    return fullText;
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
