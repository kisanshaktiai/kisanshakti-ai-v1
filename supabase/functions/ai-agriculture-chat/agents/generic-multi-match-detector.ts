/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GENERIC MULTI-MATCH DETECTOR - World-Class Clarification System
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Detect when multiple rules match with similar confidence and generate
 * clarification questions dynamically from database metadata.
 * 
 * PHILOSOPHY:
 * - 100% database-driven (zero hardcoding)
 * - Works for ALL crops (cotton, wheat, vegetables, fruits, pulses)
 * - Based on observable characteristics (farmers can answer)
 * - Language agnostic (mr/hi/en templates)
 * 
 * SCALABILITY:
 * - Add new pest → Update database → Auto-generates clarifications
 * - Add new crop → No code changes needed
 * - Add new language → Update templates only
 * 
 * VERSION: 1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const MULTI_MATCH_DETECTOR_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ObservableCharacteristics {
  size?: 'SMALL' | 'MEDIUM' | 'LARGE' | 'TINY';
  color?: string[];
  behavior?: string[];
  location?: string[];
  secondary_symptoms?: string[];
  icon?: string;
}

export interface DifferentiatingQuestion {
  question_id: string;
  mr: string;
  hi: string;
  en: string;
  discriminates_from: string[];
  information_gain: number;
}

export interface VisualMarkers {
  distinctive_feature?: string;
  photo_guidance?: {
    mr: string;
    hi: string;
    en: string;
  };
}

export interface CompetingMatch {
  rule_id: string;
  cause_code: string;
  category: string;
  confidence: number;
  observable_characteristics: ObservableCharacteristics;
  differentiating_questions: DifferentiatingQuestion[];
  visual_markers: VisualMarkers;
}

export interface ClarificationOption {
  id: string;
  label: {
    mr: string;
    hi: string;
    en: string;
  };
  maps_to: {
    rule_id: string;
    cause_code: string;
    observation_keys?: string[];
  };
}

export interface MultiMatchResult {
  has_competition: boolean;
  competing_matches: CompetingMatch[];
  clarification_needed: boolean;
  clarification_output?: {
    question_id: string;
    question_text: {
      mr: string;
      hi: string;
      en: string;
    };
    options: ClarificationOption[];
    selection_type: 'SINGLE' | 'MULTIPLE';
    scope: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSLATION TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATES = {
  mr: {
    color: {
      GREEN: 'हिरवे',
      BLACK: 'काळे',
      WHITE: 'पांढरे',
      BROWN: 'तपकिरी',
      YELLOW: 'पिवळे',
      PINK: 'गुलाबी',
      CREAM: 'मलई रंगाचे',
      COTTONY: 'कापसासारखे',
      WOOLLY: 'लोकरीसारखे',
      YELLOWISH_GREEN: 'पिवळसर हिरवे'
    } as Record<string, string>,
    size: {
      SMALL: 'छोटे',
      LARGE: 'मोठे',
      MEDIUM: 'मध्यम',
      TINY: 'अगदी लहान'
    } as Record<string, string>,
    behavior: {
      FLYING: 'उडणारे',
      JUMPING: 'उड्या मारणारे',
      CRAWLING: 'रेंगणारे',
      STATIC: '',
      CLUSTERED: 'गुच्छ्यांमध्ये',
      BORING: 'आत शिरणारे',
      HIDDEN: 'लपलेले',
      TUNNELING: 'बोगदे करणारे'
    } as Record<string, string>,
    secondary: {
      STICKY_HONEYDEW: '(चिकट पाणी येतं)',
      SOOTY_MOLD: '(काळी भुकटी)',
      LEAF_CURLING: '(पान वळणे)',
      HOLES: '(भोके दिसतात)',
      WEBBING: '(जाळी दिसते)',
      SILVERY_SHEEN: '(चांदीसारखा थर)',
      HOPPER_BURN: '(पान करपणे)',
      DEAD_HEART: '(मधली सुरळी वाळणे)',
      FRASS: '(भुसा बाहेर येतो)',
      ENTRY_HOLE: '(छिद्र दिसते)',
      MUD_TUNNELS: '(मातीचे बोगदे)',
      WILTING: '(मलूल होणे)',
      WHITE_WOOLLY_MASS: '(पांढरा लोकरीसारखा थर)',
      HOLES_IN_BOLL: '(बोंडात छिद्रे)',
      WAXY_COATING: '(मेणासारखा थर)'
    } as Record<string, string>
  },
  hi: {
    color: {
      GREEN: 'हरे',
      BLACK: 'काले',
      WHITE: 'सफेद',
      BROWN: 'भूरे',
      YELLOW: 'पीले',
      PINK: 'गुलाबी',
      CREAM: 'क्रीम रंग के',
      COTTONY: 'रूई जैसे',
      WOOLLY: 'ऊनी',
      YELLOWISH_GREEN: 'पीलापन लिए हरे'
    } as Record<string, string>,
    size: {
      SMALL: 'छोटे',
      LARGE: 'बड़े',
      MEDIUM: 'मध्यम',
      TINY: 'बहुत छोटे'
    } as Record<string, string>,
    behavior: {
      FLYING: 'उड़ने वाले',
      JUMPING: 'कूदने वाले',
      CRAWLING: 'रेंगने वाले',
      STATIC: '',
      CLUSTERED: 'समूह में',
      BORING: 'अंदर घुसने वाले',
      HIDDEN: 'छिपे हुए',
      TUNNELING: 'सुरंग बनाने वाले'
    } as Record<string, string>,
    secondary: {
      STICKY_HONEYDEW: '(चिपचिपा पानी)',
      SOOTY_MOLD: '(काली फफूंद)',
      LEAF_CURLING: '(पत्ती मुड़ना)',
      HOLES: '(छेद दिखते)',
      WEBBING: '(जाला दिखता)',
      SILVERY_SHEEN: '(चांदी जैसी चमक)',
      HOPPER_BURN: '(पत्ती जलना)',
      DEAD_HEART: '(बीच की पत्ती मुरझाना)',
      FRASS: '(भूसा निकलता)',
      ENTRY_HOLE: '(छेद दिखता)',
      MUD_TUNNELS: '(मिट्टी की सुरंगें)',
      WILTING: '(मुरझाना)',
      WHITE_WOOLLY_MASS: '(सफेद रूई जैसा)',
      HOLES_IN_BOLL: '(बोल में छेद)',
      WAXY_COATING: '(मोम जैसी परत)'
    } as Record<string, string>
  },
  en: {
    color: {
      GREEN: 'green',
      BLACK: 'black',
      WHITE: 'white',
      BROWN: 'brown',
      YELLOW: 'yellow',
      PINK: 'pink',
      CREAM: 'cream-colored',
      COTTONY: 'cottony',
      WOOLLY: 'woolly',
      YELLOWISH_GREEN: 'yellowish-green'
    } as Record<string, string>,
    size: {
      SMALL: 'small',
      LARGE: 'large',
      MEDIUM: 'medium',
      TINY: 'tiny'
    } as Record<string, string>,
    behavior: {
      FLYING: 'flying',
      JUMPING: 'jumping',
      CRAWLING: 'crawling',
      STATIC: '',
      CLUSTERED: 'in clusters',
      BORING: 'boring',
      HIDDEN: 'hidden',
      TUNNELING: 'tunneling'
    } as Record<string, string>,
    secondary: {
      STICKY_HONEYDEW: '(sticky liquid)',
      SOOTY_MOLD: '(black mold)',
      LEAF_CURLING: '(leaf curling)',
      HOLES: '(holes visible)',
      WEBBING: '(webbing present)',
      SILVERY_SHEEN: '(silvery sheen)',
      HOPPER_BURN: '(hopper burn)',
      DEAD_HEART: '(dead heart symptom)',
      FRASS: '(frass present)',
      ENTRY_HOLE: '(entry hole)',
      MUD_TUNNELS: '(mud tunnels)',
      WILTING: '(wilting)',
      WHITE_WOOLLY_MASS: '(white woolly mass)',
      HOLES_IN_BOLL: '(holes in bolls)',
      WAXY_COATING: '(waxy coating)'
    } as Record<string, string>
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: DETECT COMPETING MATCHES
// ═══════════════════════════════════════════════════════════════════════════

export async function detectCompetingMatches(
  firedRules: any[],
  supabaseClient: any,
  confidenceThreshold: number = 0.15
): Promise<CompetingMatch[]> {
  
  // Early exit for single match
  if (!firedRules || firedRules.length <= 1) {
    console.log('   ✅ [MultiMatch] Single or no match - no competition');
    return [];
  }

  // Sort by confidence descending
  const sorted = [...firedRules].sort((a, b) => 
    (b.confidence || 0) - (a.confidence || 0)
  );
  const topConfidence = sorted[0]?.confidence || 0;

  console.log(`🔍 [MultiMatch] Top confidence: ${(topConfidence * 100).toFixed(0)}%, checking for competition...`);

  // Find rules within threshold
  const competing = sorted.filter(rule => 
    (rule.confidence || 0) >= topConfidence - confidenceThreshold
  );

  if (competing.length <= 1) {
    console.log(`   ✅ [MultiMatch] No competition (only ${competing.length} within ${(confidenceThreshold * 100).toFixed(0)}% threshold)`);
    return [];
  }

  console.log(`🚨 [MultiMatch] COMPETITION DETECTED: ${competing.length} rules within ${(confidenceThreshold * 100).toFixed(0)}% of top`);
  console.log(`   📋 Competing rules: ${competing.map(r => 
    `${r.rule_id || r.ruleId}(${((r.confidence || 0) * 100).toFixed(0)}%)`
  ).join(', ')}`);

  // Fetch full rule details from database
  const ruleIds = competing.map(r => r.rule_id || r.ruleId).filter(Boolean);

  if (ruleIds.length === 0) {
    console.warn('   ⚠️ [MultiMatch] No valid rule IDs found');
    return [];
  }

  const { data: dbRules, error } = await supabaseClient
    .from('decision_rules')
    .select('rule_id, cause, category, observable_characteristics, differentiating_questions, visual_markers')
    .in('rule_id', ruleIds);

  if (error) {
    console.error('   ❌ [MultiMatch] Database fetch error:', error);
    return [];
  }

  if (!dbRules || dbRules.length === 0) {
    console.warn('   ⚠️ [MultiMatch] No rules found in database');
    return [];
  }

  // Enrich with database metadata
  const enrichedMatches: CompetingMatch[] = competing.map(rule => {
    const ruleId = rule.rule_id || rule.ruleId;
    const dbRule = dbRules.find((r: any) => r.rule_id === ruleId);

    return {
      rule_id: ruleId,
      cause_code: dbRule?.cause || rule.cause || 'UNKNOWN',
      category: dbRule?.category || rule.category || 'UNKNOWN',
      confidence: rule.confidence || 0,
      observable_characteristics: dbRule?.observable_characteristics || {},
      differentiating_questions: dbRule?.differentiating_questions || [],
      visual_markers: dbRule?.visual_markers || {}
    };
  });

  console.log(`   ✅ [MultiMatch] Enriched ${enrichedMatches.length} competing matches from database`);

  return enrichedMatches;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: GENERATE CLARIFICATION FROM RULE METADATA
// ═══════════════════════════════════════════════════════════════════════════

export function generateDifferentialClarificationFromRules(
  competingMatches: CompetingMatch[],
  language: 'mr' | 'hi' | 'en'
): MultiMatchResult['clarification_output'] | null {

  if (competingMatches.length === 0) {
    return null;
  }

  console.log(`🧠 [Clarification] Generating database-driven options from ${competingMatches.length} competing rules`);

  const options: ClarificationOption[] = [];

  // Generate option for each competing match (limit to top 4)
  const topMatches = competingMatches.slice(0, 4);
  
  for (const match of topMatches) {
    const chars = match.observable_characteristics;

    // Build description from characteristics
    const description = buildDescriptionFromCharacteristics(chars, language);
    
    options.push({
      id: match.rule_id,
      label: {
        mr: `${chars.icon || '🐛'} ${description.mr}`,
        hi: `${chars.icon || '🐛'} ${description.hi}`,
        en: `${chars.icon || '🐛'} ${description.en}`
      },
      maps_to: {
        rule_id: match.rule_id,
        cause_code: match.cause_code,
        observation_keys: extractObservationKeys(chars)
      }
    });
  }

  // Add photo option
  options.push({
    id: 'photo',
    label: {
      mr: '📷 फोटो पाठवा',
      hi: '📷 फोटो भेजें',
      en: '📷 Send photo'
    },
    maps_to: {
      rule_id: 'PHOTO_REQUEST',
      cause_code: 'PHOTO_NEEDED',
      observation_keys: ['PHOTO_PROVIDED']
    }
  });

  console.log(`   ✅ [Clarification] Generated ${options.length} options (${options.length - 1} from rules + 1 photo)`);

  return {
    question_id: `differential_${Date.now()}`,
    question_text: {
      mr: '🔍 मला अधिक माहिती हवी आहे. तुम्हाला नक्की काय दिसतंय?',
      hi: '🔍 मुझे अधिक जानकारी चाहिए। आपको क्या दिख रहा है?',
      en: '🔍 I need more information. What exactly do you see?'
    },
    options,
    selection_type: 'SINGLE',
    scope: 'DIFFERENTIAL_DIAGNOSIS'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: BUILD DESCRIPTIONS FROM DATABASE CHARACTERISTICS
// ═══════════════════════════════════════════════════════════════════════════

function buildDescriptionFromCharacteristics(
  chars: ObservableCharacteristics,
  language: 'mr' | 'hi' | 'en'
): { mr: string; hi: string; en: string } {
  
  const buildForLanguage = (lang: 'mr' | 'hi' | 'en'): string => {
    const t = TEMPLATES[lang];
    const parts: string[] = [];

    // Add color
    if (chars.color && chars.color.length > 0) {
      const translatedColors = chars.color
        .map(c => t.color[c as keyof typeof t.color])
        .filter(Boolean);
      if (translatedColors.length > 0) {
        parts.push(translatedColors.slice(0, 2).join('/'));
      }
    }

    // Add size
    if (chars.size && t.size[chars.size as keyof typeof t.size]) {
      parts.push(t.size[chars.size as keyof typeof t.size]);
    }

    // Add behavior
    if (chars.behavior && chars.behavior.length > 0) {
      const translatedBehaviors = chars.behavior
        .map(b => t.behavior[b as keyof typeof t.behavior])
        .filter(Boolean);
      if (translatedBehaviors.length > 0) {
        parts.push(translatedBehaviors[0]);
      }
    }

    // Base noun
    let description = parts.join(' ');
    if (lang === 'mr') description += ' किडे';
    else if (lang === 'hi') description += ' कीड़े';
    else description += ' insects';

    // Add secondary symptom
    if (chars.secondary_symptoms && chars.secondary_symptoms.length > 0) {
      const symptom = chars.secondary_symptoms[0];
      if (t.secondary[symptom as keyof typeof t.secondary]) {
        description += ' ' + t.secondary[symptom as keyof typeof t.secondary];
      }
    }

    return description || (lang === 'mr' ? 'इतर लक्षणे' : lang === 'hi' ? 'अन्य लक्षण' : 'Other symptoms');
  };

  return {
    mr: buildForLanguage('mr'),
    hi: buildForLanguage('hi'),
    en: buildForLanguage('en')
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: EXTRACT OBSERVATION KEYS FROM CHARACTERISTICS
// ═══════════════════════════════════════════════════════════════════════════

function extractObservationKeys(chars: ObservableCharacteristics): string[] {
  const keys: string[] = [];

  // Map characteristics to observation keys
  if (chars.color && chars.color.includes('GREEN')) {
    keys.push('INSECT_COLOR_GREEN');
  }
  if (chars.color && chars.color.includes('WHITE')) {
    keys.push('INSECT_COLOR_WHITE');
  }
  if (chars.color && chars.color.includes('BLACK')) {
    keys.push('INSECT_COLOR_BLACK');
  }
  if (chars.behavior && chars.behavior.includes('FLYING')) {
    keys.push('INSECT_FLYING');
  }
  if (chars.behavior && chars.behavior.includes('JUMPING')) {
    keys.push('INSECT_JUMPING');
  }
  if (chars.behavior && chars.behavior.includes('CLUSTERED')) {
    keys.push('INSECT_CLUSTERED');
  }
  if (chars.secondary_symptoms && chars.secondary_symptoms.includes('STICKY_HONEYDEW')) {
    keys.push('HONEYDEW_PRESENT');
  }
  if (chars.secondary_symptoms && chars.secondary_symptoms.includes('DEAD_HEART')) {
    keys.push('DEAD_HEART_SYMPTOM');
  }
  if (chars.secondary_symptoms && chars.secondary_symptoms.includes('SILVERY_SHEEN')) {
    keys.push('SILVERY_DAMAGE');
  }
  if (chars.secondary_symptoms && chars.secondary_symptoms.includes('MUD_TUNNELS')) {
    keys.push('MUD_TUNNELS_VISIBLE');
  }

  return keys;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT: COMPLETE MULTI-MATCH DETECTION FLOW
// ═══════════════════════════════════════════════════════════════════════════

export async function performMultiMatchDetection(
  firedRules: any[],
  supabaseClient: any,
  language: 'mr' | 'hi' | 'en' = 'mr',
  confidenceThreshold: number = 0.15
): Promise<MultiMatchResult> {

  console.log(`🔍 [MultiMatch] Starting detection for ${firedRules?.length || 0} fired rules...`);

  // Phase 1: Detect competition
  const competingMatches = await detectCompetingMatches(
    firedRules,
    supabaseClient,
    confidenceThreshold
  );

  if (competingMatches.length === 0) {
    return {
      has_competition: false,
      competing_matches: [],
      clarification_needed: false
    };
  }

  // Phase 2: Generate clarification
  const clarificationOutput = generateDifferentialClarificationFromRules(
    competingMatches,
    language
  );

  return {
    has_competition: true,
    competing_matches: competingMatches,
    clarification_needed: true,
    clarification_output: clarificationOutput || undefined
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export default {
  performMultiMatchDetection,
  detectCompetingMatches,
  generateDifferentialClarificationFromRules,
  MULTI_MATCH_DETECTOR_VERSION
};
