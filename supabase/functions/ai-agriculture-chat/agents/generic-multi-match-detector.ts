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

  // ─────────────────────────────────────────────────────────────────────
  // WAVE G FIX — Three structural defects that caused this gate to absorb
  // 89% (42/47) of silent match→decision drops in the WS13 audit:
  //
  //   1. NO TOP-CONFIDENCE ESCAPE: a top rule at 0.92 with a second at
  //      0.78 would still trigger clarification, even though 0.92 is
  //      decisively actionable. Real triage requires BOTH a margin AND a
  //      top-confidence threshold.
  //   2. SAME-CAUSE COUNTED AS COMPETITION: sugarcane carries 523 rules
  //      with many redundant signal forms; multiple rules sharing the
  //      same `cause_code` fire together and were being treated as
  //      competing causes — asking the farmer to differentiate between
  //      *identical* diagnoses.
  //   3. NO NOISE FLOOR: rules at 0.04 vs 0.03 trivially pass the 15%
  //      margin (0.03 ≥ 0.04 − 0.15) and forced clarification on noise.
  // ─────────────────────────────────────────────────────────────────────
  const MIN_RULE_CONFIDENCE_FOR_COMPETITION = 0.30; // noise floor
  const TOP_CONF_AUTORESOLVE = 0.75;                // top is decisive
  const MIN_MARGIN_FOR_AUTORESOLVE = 0.10;          // and clear of #2

  // Sort by confidence descending
  const sorted = [...firedRules].sort((a, b) =>
    (b.confidence || 0) - (a.confidence || 0)
  );
  const topConfidence = sorted[0]?.confidence || 0;
  const secondConfidence = sorted[1]?.confidence || 0;

  console.log(`🔍 [MultiMatch] Top=${(topConfidence * 100).toFixed(0)}% Second=${(secondConfidence * 100).toFixed(0)}%, checking for competition...`);

  // (Bug 3) Drop rules below the noise floor before any further analysis
  const aboveFloor = sorted.filter(r => (r.confidence || 0) >= MIN_RULE_CONFIDENCE_FOR_COMPETITION);
  if (aboveFloor.length <= 1) {
    console.log(`   ✅ [MultiMatch] After noise floor (${(MIN_RULE_CONFIDENCE_FOR_COMPETITION * 100).toFixed(0)}%): ${aboveFloor.length} rule(s) — no competition`);
    return [];
  }

  // (Bug 1) Top-confidence escape hatch — let the symbolic primary resolve
  if (topConfidence >= TOP_CONF_AUTORESOLVE &&
      (topConfidence - secondConfidence) >= MIN_MARGIN_FOR_AUTORESOLVE) {
    console.log(`   ✅ [MultiMatch] AUTORESOLVE: top=${(topConfidence * 100).toFixed(0)}% margin=${((topConfidence - secondConfidence) * 100).toFixed(0)}% — skipping clarification`);
    return [];
  }

  // Find rules within margin of top
  const withinMargin = aboveFloor.filter(rule =>
    (rule.confidence || 0) >= topConfidence - confidenceThreshold
  );

  // (Bug 2) Dedupe by cause_code — same cause is NOT competition
  const seenCauses = new Set<string>();
  const competing = withinMargin.filter(rule => {
    const cause = String(rule.cause || rule.cause_code || '').toUpperCase().trim();
    if (!cause) return true; // can't dedupe unknown causes; treat as distinct
    if (seenCauses.has(cause)) return false;
    seenCauses.add(cause);
    return true;
  });

  if (competing.length <= 1) {
    console.log(`   ✅ [MultiMatch] After cause-dedupe: ${competing.length} distinct cause(s) within ${(confidenceThreshold * 100).toFixed(0)}% — no competition`);
    return [];
  }

  console.log(`🚨 [MultiMatch] COMPETITION DETECTED: ${competing.length} distinct causes within ${(confidenceThreshold * 100).toFixed(0)}% of top`);
  console.log(`   📋 Competing rules: ${competing.map(r =>
    `${r.rule_id || r.ruleId}/${r.cause || r.cause_code}(${((r.confidence || 0) * 100).toFixed(0)}%)`
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
    // FAIL-OPEN BY DESIGN (Task 6): clarification differentiation is a UX
    // enhancement, not a decision gate. A DB fault here suppresses the
    // clarification prompt and the engine returns the primary diagnosis
    // unchanged — preferable to throwing on every turn during a brownout.
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

  // (Bug 2 final guard) Dedupe enriched by DB-resolved cause_code — the
  // pre-DB dedupe may have under-deduplicated when fired rules carried
  // empty/UNKNOWN causes that the DB later resolved to the same cause.
  const seenDbCauses = new Set<string>();
  const dedupedEnriched = enrichedMatches.filter(m => {
    const c = String(m.cause_code || '').toUpperCase().trim();
    if (!c || c === 'UNKNOWN') return true;
    if (seenDbCauses.has(c)) return false;
    seenDbCauses.add(c);
    return true;
  });

  if (dedupedEnriched.length <= 1) {
    console.log(`   ✅ [MultiMatch] After DB-cause-dedupe: ${dedupedEnriched.length} distinct cause(s) — no competition`);
    return [];
  }

  console.log(`   ✅ [MultiMatch] Enriched ${dedupedEnriched.length} competing matches from database`);

  return dedupedEnriched;
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
 * Fallback when database unavailable - returns formatted English codes
 * This is language-neutral to comply with SSOT principle
 */
function getDefaultClarificationOptionsFallback(language: string): string[] {
  // Return formatted English codes with icons (SSOT-compliant fallback)
  return [
    `${getObservationIcon('INSECTS_VISIBLE')} Insects Visible`,
    `${getObservationIcon('LEAF_YELLOWING')} Leaf Yellowing`, 
    `${getObservationIcon('LEAF_SPOTS')} Leaf Spots`,
    `${getObservationIcon('PHOTO_REQUEST')} Send Photo`
  ];
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
