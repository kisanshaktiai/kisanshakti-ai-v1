// CHANGE LOG
// 2026-07-09 21:15 UTC — getDefaultClarificationOptionsFallback() now
//   returns []. The hardcoded English list ("Insects Visible / Leaf
//   Yellowing / Leaf Spots / Send Photo") was a second source of the
//   universal-generic-options bug. Empty[] forces upstream callers to
//   fall through to the hypothesis-graph clarification contract or the
//   neutral photo-only prompt.
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

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';

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
  [lang: string]: string | string[] | number;  // language code → question text
  discriminates_from: string[];
  information_gain: number;
}

export interface VisualMarkers {
  distinctive_feature?: string;
  photo_guidance?: Record<string, string>;  // language code → guidance text
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
  label: Record<string, string>;  // language code → display text
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
    question_text: Record<string, string>;  // language code → question text
    options: ClarificationOption[];
    selection_type: 'SINGLE' | 'MULTIPLE';
    scope: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSLATION TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Observable characteristic templates — English-only canonical labels.
 * LLM narration layer translates at runtime into farmer's language.
 * Previously contained 140+ lines of hardcoded Marathi/Hindi text.
 */
const TEMPLATES: Record<string, Record<string, Record<string, string>>> = {
  en: {
    color: {
      GREEN: 'green', BLACK: 'black', WHITE: 'white', BROWN: 'brown',
      YELLOW: 'yellow', PINK: 'pink', CREAM: 'cream-colored',
      COTTONY: 'cottony', WOOLLY: 'woolly', YELLOWISH_GREEN: 'yellowish-green'
    },
    size: {
      SMALL: 'small', LARGE: 'large', MEDIUM: 'medium', TINY: 'tiny'
    },
    behavior: {
      FLYING: 'flying', JUMPING: 'jumping', CRAWLING: 'crawling',
      STATIC: '', CLUSTERED: 'in clusters', BORING: 'boring',
      HIDDEN: 'hidden', TUNNELING: 'tunneling'
    },
    secondary: {
      STICKY_HONEYDEW: '(sticky liquid)', SOOTY_MOLD: '(black mold)',
      LEAF_CURLING: '(leaf curling)', HOLES: '(holes visible)',
      WEBBING: '(webbing present)', SILVERY_SHEEN: '(silvery sheen)',
      HOPPER_BURN: '(hopper burn)', DEAD_HEART: '(dead heart symptom)',
      FRASS: '(frass present)', ENTRY_HOLE: '(entry hole)',
      MUD_TUNNELS: '(mud tunnels)', WILTING: '(wilting)',
      WHITE_WOOLLY_MASS: '(white woolly mass)', HOLES_IN_BOLL: '(holes in bolls)',
      WAXY_COATING: '(waxy coating)'
    }
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
  language: string
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
        [language]: `${chars.icon || '🐛'} ${description[language] || description['en']}`,
        en: `${chars.icon || '🐛'} ${description['en']}`
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
      en: '🔍 I need more information. What exactly do you see?',
      mr: '', // @deprecated — LLM translates at runtime
      hi: ''  // @deprecated — LLM translates at runtime
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
  language: string
): Record<string, string> {
  
  const buildForLanguage = (lang: string): string => {
    const t = TEMPLATES[lang] || TEMPLATES['en'];
    const parts: string[] = [];

    if (chars.color && chars.color.length > 0) {
      const translatedColors = chars.color
        .map(c => t.color[c as keyof typeof t.color])
        .filter(Boolean);
      if (translatedColors.length > 0) {
        parts.push(translatedColors.slice(0, 2).join('/'));
      }
    }

    if (chars.size && t.size[chars.size as keyof typeof t.size]) {
      parts.push(t.size[chars.size as keyof typeof t.size]);
    }

    if (chars.behavior && chars.behavior.length > 0) {
      const translatedBehaviors = chars.behavior
        .map(b => t.behavior[b as keyof typeof t.behavior])
        .filter(Boolean);
      if (translatedBehaviors.length > 0) {
        parts.push(translatedBehaviors[0]);
      }
    }

    // Base noun - language-agnostic via template lookup
    let description = parts.join(' ');
    const baseNouns: Record<string, string> = { mr: 'किडे', hi: 'कीड़े', en: 'insects' };
    description += ' ' + (baseNouns[lang] || baseNouns['en']);

    if (chars.secondary_symptoms && chars.secondary_symptoms.length > 0) {
      const symptom = chars.secondary_symptoms[0];
      if (t.secondary[symptom as keyof typeof t.secondary]) {
        description += ' ' + t.secondary[symptom as keyof typeof t.secondary];
      }
    }

    const fallbackLabels: Record<string, string> = { mr: 'इतर लक्षणे', hi: 'अन्य लक्षण', en: 'Other symptoms' };
    return description.trim() || (fallbackLabels[lang] || fallbackLabels['en']);
  };

  const result: Record<string, string> = { en: buildForLanguage('en') };
  // Build for requested language if templates exist
  if (TEMPLATES[language]) {
    result[language] = buildForLanguage(language);
  }
  return result;
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
// FALLBACK CLARIFICATION: Generate options when no rules matched
// Used when symbolic brain returns 0 rules but we have low confidence
// ═══════════════════════════════════════════════════════════════════════════

export async function generateFallbackClarificationOptions(
  cropCode: string | undefined,
  supabaseClient: any,
  language: string = 'mr'
): Promise<string[]> {
  console.log(`🔄 [FallbackClarification] Generating options for crop: ${cropCode || 'UNKNOWN'}`);
  
  try {
    // Fetch common pests/diseases for this crop from database
    const query = supabaseClient
      .from('decision_rules')
      .select('cause, category, observable_characteristics')
      .not('observable_characteristics', 'is', null)
      .limit(5);
    
    // Filter by crop if known
    if (cropCode && cropCode !== 'UNKNOWN') {
      query.or(`crop_code.eq.${cropCode},crop_code.is.null`);
    }
    
    const { data: rules, error } = await query;
    
    if (error || !rules || rules.length === 0) {
      console.warn(`   ⚠️ [FallbackClarification] No rules found, using default options`);
      return getDefaultClarificationOptions(language);
    }
    
    // Build options from observable characteristics
    const options: string[] = [];
    const t = TEMPLATES[language] || TEMPLATES['en'];
    
    for (const rule of rules.slice(0, 3)) {
      const chars = rule.observable_characteristics as ObservableCharacteristics;
      if (!chars) continue;
      
      const parts: string[] = [];
      
      // Add icon if available
      if (chars.icon) parts.push(chars.icon);
      
      // Add color
      if (chars.color && chars.color.length > 0) {
        const color = chars.color[0];
        if (t.color[color]) parts.push(t.color[color]);
      }
      
      // Add size
      if (chars.size && t.size[chars.size]) {
        parts.push(t.size[chars.size]);
      }
      
      // Add behavior
      if (chars.behavior && chars.behavior.length > 0) {
        const behavior = chars.behavior[0];
        if (t.behavior[behavior]) parts.push(t.behavior[behavior]);
      }
      
      // Add base noun
      // Language-neutral: use English, LLM translates at runtime
      parts.push('insects');
      
      // Add secondary symptom
      if (chars.secondary_symptoms && chars.secondary_symptoms.length > 0) {
        const symptom = chars.secondary_symptoms[0];
        if (t.secondary[symptom]) parts.push(t.secondary[symptom]);
      }
      
      if (parts.length > 1) {
        options.push(parts.join(' '));
      }
    }
    
    // Always add photo option (icon is language-neutral)
    options.push(`${getObservationIcon('PHOTO_REQUEST')} Photo`);
    
    console.log(`   ✅ [FallbackClarification] Generated ${options.length} options`);
    return options.length > 0 ? options : getDefaultClarificationOptionsFallback(language);
    
  } catch (err) {
    console.error(`   ❌ [FallbackClarification] Error:`, err);
    return getDefaultClarificationOptionsFallback(language);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SSOT: Default clarification options now loaded from database
// Import from observation-label-loader for consistent translations
// ═══════════════════════════════════════════════════════════════════════════

import { loadObservationLabels, DEFAULT_CLARIFICATION_CODES, getObservationIcon } from '../i18n/observation-label-loader.ts';

/**
 * Get default clarification options from database
 * SSOT: All display text comes from observation_translations table
 * Falls back to formatted English codes if database unavailable
 */
async function getDefaultClarificationOptionsFromDB(
  supabaseClient: any,
  language: string
): Promise<string[]> {
  try {
    const labelMap = await loadObservationLabels(
      supabaseClient, 
      DEFAULT_CLARIFICATION_CODES, 
      language
    );
    
    const options: string[] = [];
    for (const code of DEFAULT_CLARIFICATION_CODES) {
      const label = labelMap.get(code.toUpperCase());
      if (label) {
        options.push(`${label.icon} ${label.display_text}`);
      }
    }
    
    // Ensure we have at least one option
    if (options.length === 0) {
      console.warn(`   ⚠️ [DefaultClarification] No options loaded from DB - using fallback`);
      return getDefaultClarificationOptionsFallback(language);
    }
    
    return options;
    
  } catch (err) {
    console.error(`   ❌ [DefaultClarification] DB error: ${err}`);
    return getDefaultClarificationOptionsFallback(language);
  }
}

/**
 * Fallback when database unavailable.
 * 2026-07-09 21:15 UTC — Returns [] instead of the hardcoded English
 *   pest/leaf list. That legacy list ("Insects Visible / Leaf Yellowing /
 *   Leaf Spots / Send Photo") was the second source of the "same 3
 *   options for every clarification" bug: it fired whenever the primary
 *   DB label load failed or returned nothing, injecting a context-blind
 *   generic list into REFINE_OBSERVATION responses regardless of intent.
 *   Neuro-symbolic invariant: no TypeScript-authored option list may
 *   reach the farmer. Callers already handle empty[] by falling through
 *   to loadClarificationCandidates (hypothesis graph) or a photo-only
 *   neutral prompt.
 */
function getDefaultClarificationOptionsFallback(_language: string): string[] {
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT: COMPLETE MULTI-MATCH DETECTION FLOW
// ═══════════════════════════════════════════════════════════════════════════

export async function performMultiMatchDetection(
  firedRules: any[],
  supabaseClient: any,
  language: string = 'mr',
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
  generateFallbackClarificationOptions,
  MULTI_MATCH_DETECTOR_VERSION
};
