/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARMER COMMUNICATION GENERATOR - TYPE DEFINITIONS v3.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Types for generating farmer-friendly, multilingual messages from
 * technical decision outputs. Supports Marathi, Hindi, and English.
 */

// ═══════════════════════════════════════════════════════════════════════════
// INPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SupportedLanguage = 'mr' | 'hi' | 'en';
export type LiteracyLevel = 'LOW' | 'MODERATE' | 'HIGH';
export type TechnicalKnowledge = 'BASIC' | 'MODERATE' | 'ADVANCED';
export type EmotionalState = 'STRESSED' | 'FRUSTRATED' | 'NEUTRAL' | 'CONFIDENT' | 'PANICKED';
export type MessageTone = 'CALM_CONFIDENT' | 'URGENT' | 'EMPATHETIC' | 'PROFESSIONAL' | 'ENCOURAGING';

export interface FarmerProfile {
  id?: string;
  name: string;
  preferred_language: SupportedLanguage;
  literacy_level: LiteracyLevel;
  technical_knowledge: TechnicalKnowledge;
  emotional_state: EmotionalState;
}

export interface ConversationContext {
  issue_urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  previous_failed_treatments: number;
  questions_asked: number;
  is_repeat_issue: boolean;
  time_since_first_report_hours?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRILINGUAL TEXT STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

export interface TrilingualText {
  mr: string;
  hi: string;
  en: string;
}

export interface TrilingualTextArray {
  mr: string[];
  hi: string[];
  en: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 1: IMMEDIATE ACTION
// ═══════════════════════════════════════════════════════════════════════════

export interface ImmediateAction {
  emoji: string;
  heading: TrilingualText;
  action_summary: TrilingualText;
  urgency_indicator: {
    text: TrilingualText;
    color: 'red' | 'orange' | 'yellow' | 'green';
    urgency_level: 'IMMEDIATE' | 'TODAY' | 'WITHIN_48H' | 'THIS_WEEK' | 'NON_URGENT';
  };
  weather_note?: TrilingualText;
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 2: APPLICATION INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface MaterialItem {
  name: TrilingualText;
  quantity: string;
  cost_inr?: number;
  local_name?: TrilingualText;
  where_to_buy?: TrilingualText;
}

export interface ApplicationInstructions {
  heading: TrilingualText;
  
  materials_needed: {
    items: MaterialItem[];
    total_cost_inr: number;
    cost_per_acre_inr: number;
  };
  
  mixing_instructions: {
    steps: TrilingualTextArray;
    caution?: TrilingualText;
  };
  
  application_method: {
    method: TrilingualText;
    coverage_tips: TrilingualTextArray;
    technique_tips?: TrilingualTextArray;
  };
  
  timing: {
    best_time: TrilingualText;
    duration_estimate: TrilingualText;
    weather_conditions: TrilingualText;
    avoid_times?: TrilingualText;
  };
  
  safety_equipment: {
    required_ppe: TrilingualTextArray;
    safety_tips: TrilingualTextArray;
    first_aid?: TrilingualText;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3: RATIONALE
// ═══════════════════════════════════════════════════════════════════════════

export interface Rationale {
  heading: TrilingualText;
  
  problem_assessment: {
    current_status: TrilingualText;
    threshold_info: TrilingualText;
    severity_explanation?: TrilingualText;
  };
  
  why_this_treatment: {
    reasons: TrilingualTextArray;
    scientific_basis_simple: TrilingualText;
    advantages: TrilingualTextArray;
  };
  
  expected_results: {
    timeline: TrilingualText;
    success_indicators: TrilingualTextArray;
    realistic_expectations: TrilingualText;
  };
  
  comparison_to_alternatives?: {
    why_not_chemical?: TrilingualText;
    why_not_other?: TrilingualText;
    why_this_is_best: TrilingualText;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 4: WARNINGS
// ═══════════════════════════════════════════════════════════════════════════

export interface WarningItem {
  icon: '❌' | '⛔' | '🚫' | '⚠️';
  action: TrilingualText;
  reason: TrilingualText;
  consequence: TrilingualText;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface CommonMistake {
  mistake: TrilingualText;
  why_wrong: TrilingualText;
  correct_approach?: TrilingualText;
}

export interface Warnings {
  heading: TrilingualText;
  blocked_actions: WarningItem[];
  common_mistakes: CommonMistake[];
  regulatory_notes?: TrilingualText;
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 5: FOLLOW-UP
// ═══════════════════════════════════════════════════════════════════════════

export interface FollowUpCheckItem {
  day: number;
  date?: string;
  check: TrilingualText;
  method: TrilingualText;
  success_criteria: TrilingualText;
  action_if_unsuccessful?: TrilingualText;
}

export interface FollowUpPlan {
  heading: TrilingualText;
  schedule: FollowUpCheckItem[];
  automated_followup: {
    system_will_ask: TrilingualText;
    reminder_scheduled: boolean;
  };
  if_not_working: {
    condition: TrilingualText;
    next_action: TrilingualText;
    escalation_contact?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ECONOMIC SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

export interface EconomicSummary {
  heading: TrilingualText;
  treatment_cost: {
    amount_inr: number;
    breakdown: TrilingualText;
  };
  expected_benefit: {
    loss_prevented_inr: number;
    explanation: TrilingualText;
  };
  net_benefit: {
    amount_inr: number;
    roi_message: TrilingualText;
  };
  affordability_message: TrilingualText;
  value_proposition: TrilingualText;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE COMMUNICATION OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

export interface FarmerNotification {
  title: string;
  body: string;
  icon: string;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  action_url?: string;
}

export interface QuickAction {
  button_text: TrilingualText;
  action: 'ACKNOWLEDGE' | 'ASK_QUESTION' | 'UPLOAD_PHOTO' | 'CALL_EXPERT' | 'SHARE' | 'REMIND_LATER';
  icon?: string;
}

export interface VoiceVersion {
  text_to_speak: string;
  language: SupportedLanguage;
  estimated_duration_seconds: number;
  narrator_voice: 'MARATHI_MALE' | 'MARATHI_FEMALE' | 'HINDI_MALE' | 'HINDI_FEMALE' | 'ENGLISH_NEUTRAL';
}

export interface AccessibilityInfo {
  screen_reader_optimized: boolean;
  simplified_version_available: boolean;
  emoji_descriptions: Record<string, string>;
  high_contrast_available: boolean;
}

export interface MainMessage {
  greeting: string;
  empathy_line?: string;
  sections: {
    immediate_action: ImmediateAction;
    how_to: ApplicationInstructions;
    rationale: Rationale;
    warnings: Warnings;
    economics: EconomicSummary;
    follow_up: FollowUpPlan;
  };
  closing: string;
  signature: string;
}

export interface FarmerCommunication {
  message_id: string;
  decision_id: string;
  session_id: string;
  farmer_id?: string;
  language: SupportedLanguage;
  format: 'RICH_TEXT' | 'PLAIN_TEXT' | 'VOICE' | 'SMS';
  tone: MessageTone;
  created_at: string;
  
  notification: FarmerNotification;
  main_message: MainMessage;
  quick_actions: QuickAction[];
  voice_version?: VoiceVersion;
  accessibility: AccessibilityInfo;
  
  metadata: {
    word_count: number;
    reading_time_seconds: number;
    complexity_score: number;
    adapted_for_literacy: boolean;
    adapted_for_emotion: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIAL SCENARIO TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type CommunicationScenario = 
  | 'STANDARD_RECOMMENDATION'
  | 'BLOCKED_ACTION'
  | 'WEATHER_DELAY'
  | 'ECONOMICALLY_UNVIABLE'
  | 'EMERGENCY'
  | 'ESCALATED_TO_EXPERT'
  | 'MONITORING_ONLY'
  | 'TREATMENT_SUCCESS'
  | 'TREATMENT_FAILED';

export interface ScenarioContext {
  scenario: CommunicationScenario;
  farmer_expectation?: string;
  system_recommendation?: string;
  conflict_resolution_needed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

export const GREETINGS: Record<SupportedLanguage, string[]> = {
  mr: ['नमस्कार शेतकरी मित्र,', 'नमस्कार,', 'शेतकरी बंधू/भगिनी,'],
  hi: ['नमस्कार किसान मित्र,', 'नमस्कार,', 'किसान भाई/बहन,'],
  en: ['Dear Farmer,', 'Hello,', 'Greetings,']
};

export const CLOSINGS: Record<SupportedLanguage, string[]> = {
  mr: ['शुभेच्छा! 🌾', 'यशस्वी हो! 💪', 'पुढील हंगामासाठी शुभेच्छा!'],
  hi: ['शुभकामनाएं! 🌾', 'सफलता मिले! 💪', 'अगले सीजन के लिए शुभकामनाएं!'],
  en: ['Best wishes! 🌾', 'Wishing you success! 💪', 'Good luck with your crops!']
};

export const EMPATHY_LINES: Record<EmotionalState, TrilingualText> = {
  'STRESSED': {
    mr: 'चिंता नको. समस्या सोडवता येईल.',
    hi: 'चिंता न करें। समस्या का समाधान हो सकता है।',
    en: "Don't worry. This problem can be solved."
  },
  'FRUSTRATED': {
    mr: 'तुमचा प्रयत्न योग्य होता. आता हा मार्ग प्रभावी होईल.',
    hi: 'आपका प्रयास सही था। अब यह तरीका कारगर होगा।',
    en: 'Your effort was right. This approach will work now.'
  },
  'PANICKED': {
    mr: 'शांत राहा. मी तुम्हाला मार्गदर्शन करतो.',
    hi: 'शांत रहें। मैं आपका मार्गदर्शन करता हूं।',
    en: 'Stay calm. I will guide you through this.'
  },
  'NEUTRAL': {
    mr: '',
    hi: '',
    en: ''
  },
  'CONFIDENT': {
    mr: 'तुम्ही योग्य मार्गावर आहात!',
    hi: 'आप सही रास्ते पर हैं!',
    en: "You're on the right track!"
  }
};

export const URGENCY_INDICATORS: Record<string, TrilingualText> = {
  'IMMEDIATE': {
    mr: '🔴 आता लगेच',
    hi: '🔴 अभी तुरंत',
    en: '🔴 Immediately'
  },
  'TODAY': {
    mr: '🟠 आज',
    hi: '🟠 आज',
    en: '🟠 Today'
  },
  'WITHIN_48H': {
    mr: '🟡 2 दिवसांत',
    hi: '🟡 2 दिनों में',
    en: '🟡 Within 2 days'
  },
  'THIS_WEEK': {
    mr: '🟢 या आठवड्यात',
    hi: '🟢 इस हफ्ते',
    en: '🟢 This week'
  },
  'NON_URGENT': {
    mr: '🟢 सोयीनुसार',
    hi: '🟢 सुविधानुसार',
    en: '🟢 At your convenience'
  }
};

export const SECTION_HEADINGS: Record<string, TrilingualText> = {
  'IMMEDIATE_ACTION': {
    mr: '📌 आता काय करावे:',
    hi: '📌 अभी क्या करें:',
    en: '📌 What to Do Now:'
  },
  'HOW_TO': {
    mr: '🔧 कसे करावे:',
    hi: '🔧 कैसे करें:',
    en: '🔧 How to Do It:'
  },
  'RATIONALE': {
    mr: '💡 हे का:',
    hi: '💡 यह क्यों:',
    en: '💡 Why This:'
  },
  'WARNINGS': {
    mr: '⚠️ हे नको करू:',
    hi: '⚠️ यह न करें:',
    en: '⚠️ Do NOT Do:'
  },
  'ECONOMICS': {
    mr: '💰 खर्च आणि फायदा:',
    hi: '💰 खर्च और फायदा:',
    en: '💰 Cost & Benefit:'
  },
  'FOLLOW_UP': {
    mr: '📅 पुढे काय:',
    hi: '📅 आगे क्या:',
    en: '📅 What\'s Next:'
  },
  'MATERIALS': {
    mr: '🛒 साहित्य:',
    hi: '🛒 सामग्री:',
    en: '🛒 Materials:'
  },
  'MIXING': {
    mr: '🧪 मिश्रण:',
    hi: '🧪 मिश्रण:',
    en: '🧪 Mixing:'
  },
  'APPLICATION': {
    mr: '💧 फवारणी:',
    hi: '💧 छिड़काव:',
    en: '💧 Application:'
  },
  'SAFETY': {
    mr: '🦺 सुरक्षा:',
    hi: '🦺 सुरक्षा:',
    en: '🦺 Safety:'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// EMOJI ACCESSIBILITY DESCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const EMOJI_DESCRIPTIONS: Record<string, TrilingualText> = {
  '📌': { mr: 'महत्त्वाचे', hi: 'महत्वपूर्ण', en: 'Important' },
  '🔧': { mr: 'साधने', hi: 'उपकरण', en: 'Tools' },
  '💡': { mr: 'माहिती', hi: 'जानकारी', en: 'Information' },
  '⚠️': { mr: 'सावधान', hi: 'सावधान', en: 'Warning' },
  '❌': { mr: 'नको', hi: 'नहीं', en: 'No' },
  '✅': { mr: 'होय', hi: 'हाँ', en: 'Yes' },
  '💰': { mr: 'पैसे', hi: 'पैसे', en: 'Money' },
  '📅': { mr: 'तारीख', hi: 'तारीख', en: 'Date' },
  '🌾': { mr: 'पीक', hi: 'फसल', en: 'Crop' },
  '💪': { mr: 'शक्ती', hi: 'शक्ति', en: 'Strength' },
  '⏰': { mr: 'वेळ', hi: 'समय', en: 'Time' },
  '🎯': { mr: 'लक्ष्य', hi: 'लक्ष्य', en: 'Target' },
  '⛈️': { mr: 'पाऊस', hi: 'बारिश', en: 'Rain' },
  '🦺': { mr: 'सुरक्षा', hi: 'सुरक्षा', en: 'Safety' }
};
