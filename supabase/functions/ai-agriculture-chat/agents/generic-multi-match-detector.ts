// CHANGE LOG
// 2026-08-15 08:15 UTC — MultiMatch differential options now render the rule's
// condition_code observation label from observation_translations in the farmer's
// language (English `cause` only as last resort); obsKeys carries condition_code.
// 2026-07-09 21:15 UTC — getDefaultClarificationOptionsFallback() now
// GENERIC MULTI-MATCH DETECTOR - World-Class Clarification System

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';

export const MULTI_MATCH_DETECTOR_VERSION = '1.0.0';

// TYPE DEFINITIONS

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
  condition_code?: string | null;
  observation_label?: Record<string, string> | null;
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

// TRANSLATION TEMPLATES

// Observable characteristic templates — English-only canonical labels.
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

// PHASE 1: DETECT COMPETING MATCHES

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
    .select('rule_id, cause, category, condition_code, observable_characteristics, differentiating_questions, visual_markers')
    .or('scope.eq.global,scope.is.null') // FIX-7 (P1-8)
    .in('rule_id', ruleIds);

  if (error) {
    console.error('   ❌ [MultiMatch] Database fetch error:', error);
    return [];
  }

  if (!dbRules || dbRules.length === 0) {
    console.warn('   ⚠️ [MultiMatch] No rules found in database');
    return [];
  }

  // 2026-08-15 — resolve farmer-language observation labels from each rule's
  // condition_code (global table, no tenant coupling, no hardcoded codes).
  const condCodes = Array.from(new Set(
    (dbRules as any[]).map((r: any) => r.condition_code).filter(Boolean).map(String),
  ));
  const obsLabelByCode = new Map<string, Record<string, string>>();
  if (condCodes.length > 0) {
    const { data: trs, error: trErr } = await supabaseClient
      .from('observation_translations')
      .select('observation_code, language_code, display_text, description_text')
      .in('observation_code', condCodes);
    if (trErr) {
      console.warn('   ⚠️ [MultiMatch] observation_translations fetch failed:', trErr.message);
    }
    for (const t of trs ?? []) {
      const code = String(t.observation_code);
      const txt = String(t.display_text || t.description_text || '').trim();
      if (!txt) continue;
      const e = obsLabelByCode.get(code) ?? {};
      e[String(t.language_code).toLowerCase()] = txt;
      obsLabelByCode.set(code, e);
    }
  }

  // Enrich with database metadata
  const enrichedMatches: CompetingMatch[] = competing.map(rule => {
    const ruleId = rule.rule_id || rule.ruleId;
    const dbRule = dbRules.find((r: any) => r.rule_id === ruleId);
    const condCode = dbRule?.condition_code ? String(dbRule.condition_code) : null;

    return {
      rule_id: ruleId,
      cause_code: dbRule?.cause || rule.cause || 'UNKNOWN',
      category: dbRule?.category || rule.category || 'UNKNOWN',
      confidence: rule.confidence || 0,
      condition_code: condCode,
      observation_label: condCode ? (obsLabelByCode.get(condCode) || null) : null,
      observable_characteristics: dbRule?.observable_characteristics || {},
      differentiating_questions: dbRule?.differentiating_questions || [],
      visual_markers: dbRule?.visual_markers || {}
    };
  });

  console.log(`   ✅ [MultiMatch] Enriched ${enrichedMatches.length} competing matches from database (obs labels: ${obsLabelByCode.size}/${condCodes.length})`);

  return enrichedMatches;
}

// PHASE 2: GENERATE CLARIFICATION FROM RULE METADATA

export function generateDifferentialClarificationFromRules(
  competingMatches: CompetingMatch[],
  language: string
): MultiMatchResult['clarification_output'] | null {

  if (competingMatches.length === 0) {
    return null;
  }

  console.log(`🧠 [Clarification] Generating database-driven options from ${competingMatches.length} competing rules`);

  const options: ClarificationOption[] = [];

  // FIX-V18 (P0-UI, 2026-08-09): a rule with NO farmer-observable
  // characteristics must not fabricate a UI option. Previously such rules fell
  // through buildDescriptionFromCharacteristics with empty parts and received
  // the hardcoded pest base-noun — four distinct nutrient-deficiency rules all
  // rendered as "🐛 insects" (verified: RICE_NUTR_{N,K,P,FE}_DEFICIT_001 have
  // observable_characteristics=NULL in live DB; stored turn metadata showed
  // 4× identical labels). Policy mirrors decision/hypothesis-evaluator.ts:1027.
  // Rules without characteristics still participate as competitors — their
  // option label comes from the rule's own DB `cause` text (real, distinct,
  // no invented agronomy). Duplicate labels are deduped (the exact regression
  // class seen in production). Nothing in the output contract changes.
  const hasFarmerObservableChars = (c: ObservableCharacteristics | null | undefined): boolean =>
    !!c && (
      (Array.isArray(c.color) && c.color.length > 0) ||
      !!c.size ||
      (Array.isArray(c.behavior) && c.behavior.length > 0) ||
      (Array.isArray(c.secondary_symptoms) && c.secondary_symptoms.length > 0)
    );

  // Generate option for each competing match (limit to top 4)
  const topMatches = competingMatches.slice(0, 4);
  const seenLabels = new Set<string>();

  for (const match of topMatches) {
    const chars = match.observable_characteristics;

    let labelMap: Record<string, string>;
    let obsKeys: string[];

    if (hasFarmerObservableChars(chars)) {
      // Existing template path — unchanged for rules that carry real
      // farmer-observable characteristics (the pest-differential design case).
      const description = buildDescriptionFromCharacteristics(chars, language);
      labelMap = {
        [language]: `${chars.icon || '🐛'} ${description[language] || description['en']}`,
        en: `${chars.icon || '🐛'} ${description['en']}`
      };
      obsKeys = extractObservationKeys(chars);
    } else {
      // 2026-08-15 — prefer the rule's farmer-observable observation label in the
      // farmer's language (observation_translations). English `cause` is a
      // last-resort fallback only.
      const lang = String(language || 'mr').toLowerCase();
      const obsMap = match.observation_label || null;
      const obsLabel = (obsMap && (obsMap[lang] || obsMap['en'])) || '';
      const causeText = (match.cause_code || '').trim();
      const visibleText = obsLabel || (causeText && causeText !== 'UNKNOWN' ? causeText : '');
      if (!visibleText) {
        console.log(`   ℹ️ Rule ${match.rule_id}: no observation label or cause — kept as internal candidate`);
        continue;
      }

      const optionLabel = `🔍 ${visibleText}`;
      labelMap = obsLabel
        ? {
            [lang]: optionLabel,
            mr: obsMap?.mr ? `🔍 ${obsMap.mr}` : optionLabel,
            hi: obsMap?.hi ? `🔍 ${obsMap.hi}` : optionLabel,
            en: obsMap?.en ? `🔍 ${obsMap.en}` : optionLabel,
          }
        : { mr: optionLabel, hi: optionLabel, en: optionLabel };
      obsKeys = match.condition_code ? [String(match.condition_code)] : [];
    }

    const dedupeKey = (labelMap[language] || labelMap['en'] || '').toLowerCase();
    if (dedupeKey && seenLabels.has(dedupeKey)) {
      console.warn(`   ⚠️ [MultiMatch] duplicate option label suppressed for ${match.rule_id}: "${dedupeKey}"`);
      continue;
    }
    if (dedupeKey) seenLabels.add(dedupeKey);

    options.push({
      id: match.rule_id,
      label: labelMap,
      maps_to: {
        rule_id: match.rule_id,
        cause_code: match.cause_code,
        observation_keys: obsKeys
      }
    });
  }

  // FIX-V18: if no rule produced a farmer-meaningful option, do not emit a
  // photo-only differential. Returning null lands on the orchestrator's
  // existing guard (`has_competition && clarification_output`) and the turn
  // proceeds exactly as it did before multi-match existed.
  if (options.length === 0) {
    console.warn(`   ⚠️ [MultiMatch] ${topMatches.length} competing rules, 0 UI-eligible options — returning null (no fabricated clarification)`);
    return null;
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

// PHASE 3: BUILD DESCRIPTIONS FROM DATABASE CHARACTERISTICS

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

// HELPER: EXTRACT OBSERVATION KEYS FROM CHARACTERISTICS

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

// FALLBACK CLARIFICATION: Generate options when no rules matched

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
      .or('scope.eq.global,scope.is.null') // FIX-7 (P1-8)
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

// SSOT: Default clarification options now loaded from database

import { loadObservationLabels, DEFAULT_CLARIFICATION_CODES, getObservationIcon } from '../i18n/observation-label-loader.ts';

// Get default clarification options from database
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

// Fallback when database unavailable.
function getDefaultClarificationOptionsFallback(_language: string): string[] {
  return [];
}

// MAIN EXPORT: COMPLETE MULTI-MATCH DETECTION FLOW

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

// DEFAULT EXPORT

export default {
  performMultiMatchDetection,
  detectCompetingMatches,
  generateDifferentialClarificationFromRules,
  generateFallbackClarificationOptions,
  MULTI_MATCH_DETECTOR_VERSION
};
