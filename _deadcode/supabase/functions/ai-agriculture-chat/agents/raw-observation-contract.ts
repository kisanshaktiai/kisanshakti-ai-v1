/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RAW OBSERVATION CONTRACT v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PRINCIPLE: PHASE-1 is a TRANSLATOR, not a DECISION MAKER
 * 
 * This contract defines the neutral output structure from PHASE-1 (language processing).
 * PHASE-1 components (language-normalizer, language-induction-layer, semantic-extractor, 
 * nlu-agent) MUST output ONLY:
 * 
 * ✅ ALLOWED:
 *   - Detected language
 *   - Normalized/cleaned text  
 *   - Raw extracted phrases (farmer's exact words)
 *   - Token count and coverage metrics
 * 
 * ❌ FORBIDDEN (these belong to PHASE-2 Symbolic Brain):
 *   - Observation codes (ObservationKey, VisualSymptom enums)
 *   - Confidence scores with agronomic meaning
 *   - Query routing (PEST_DISEASE_TREATMENT, etc.)
 *   - Symptom-to-diagnosis mapping
 *   - Stage inference
 *   - Severity classification
 * 
 * The AGRONOMIC OBSERVATION VALIDATOR (Phase 1.5) and CANONICAL STATE BUILDER (Phase 2)
 * are responsible for converting raw phrases into validated symbols.
 */

export const RAW_OBSERVATION_CONTRACT_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// RAW OBSERVATION CANDIDATE - NO AGRONOMIC MEANING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A raw phrase extracted from farmer input - NO interpretation
 */
export interface RawObservationCandidate {
  /** The exact phrase from farmer's message */
  raw_phrase: string;
  
  /** Source language of the phrase */
  source_language: string;
  
  /** Position in original text (for context) */
  start_index?: number;
  end_index?: number;
  
  /** Category hint (purely lexical, not agronomic) */
  lexical_category: 'COLOR_WORD' | 'ACTION_WORD' | 'OBJECT_WORD' | 'LOCATION_WORD' | 'TIME_WORD' | 'QUANTITY_WORD' | 'UNKNOWN';
}

/**
 * PHASE-1 Output Structure - Translation Only
 * 
 * This is the ONLY output structure allowed from PHASE-1 components.
 * It contains NO agronomic interpretation.
 */
export interface Phase1TranslationOutput {
  version: string;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LANGUAGE DETECTION (ALLOWED)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Primary detected language */
  detected_language: string;
  
  /** Whether message mixes languages */
  is_code_switched: boolean;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TEXT NORMALIZATION (ALLOWED)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Original farmer message */
  original_text: string;
  
  /** Cleaned text (removed greetings, fillers, emotions) */
  normalized_text: string;
  
  /** List of removed elements */
  removed_elements: string[];
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RAW PHRASE EXTRACTION (ALLOWED - NO SYMBOLS)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Raw observation candidates - farmer's exact words */
  observation_candidates: RawObservationCandidate[];
  
  /** Words that couldn't be categorized */
  unmapped_tokens: string[];
  
  /** Total token count */
  token_count: number;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA (ALLOWED)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Processing time in ms */
  processing_time_ms: number;
  
  /** Timestamp */
  extracted_at: string;
  
  /** Is this agricultural content? (simple keyword check) */
  is_agricultural_content: boolean;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY FLAGS ONLY (minimal, not agronomic)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Urgency indicators found */
  urgency_indicators: string[];
  
  /** Emotional tone detected */
  emotional_tone: 'PANIC' | 'STRESSED' | 'NEUTRAL' | 'UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════════════
// LEXICAL CATEGORY DETECTION (Pure Pattern Matching - No Agronomics)
// ═══════════════════════════════════════════════════════════════════════════

const COLOR_PATTERNS = [
  'पिवळ', 'पीला', 'yellow', 'तपकिरी', 'भूरा', 'brown', 
  'पांढर', 'सफेद', 'white', 'काळ', 'काला', 'black',
  'लाल', 'red', 'हिरव', 'हरा', 'green'
];

const ACTION_PATTERNS = [
  'वाळ', 'सुक', 'सूख', 'dry', 'dying', 'मर', 'मेल',
  'वळ', 'मुड', 'curl', 'पड', 'गिर', 'fall', 'फूट', 'burst',
  'खा', 'eat', 'उड', 'fly', 'रांग', 'crawl', 'उड्या', 'jump'
];

const OBJECT_PATTERNS = [
  'पान', 'पत्त', 'leaf', 'खोड', 'तना', 'stem', 'मूळ', 'जड़', 'root',
  'फळ', 'फल', 'fruit', 'फूल', 'flower', 'किड', 'कीड़', 'insect',
  'अळी', 'इल्ली', 'caterpillar', 'बुरशी', 'फफूंद', 'fungus'
];

const LOCATION_PATTERNS = [
  'वर', 'पर', 'on', 'मध्ये', 'में', 'in', 'खाली', 'नीचे', 'below',
  'सर्वत्र', 'हर जगह', 'everywhere', 'एका जागी', 'एक जगह', 'one spot'
];

const TIME_PATTERNS = [
  'आज', 'today', 'काल', 'yesterday', 'आठवडा', 'week',
  'महिना', 'month', 'सकाळ', 'morning', 'संध्याकाळ', 'evening'
];

const QUANTITY_PATTERNS = [
  'थोडे', 'थोड़ा', 'little', 'खूप', 'बहुत', 'very', 'many',
  'सर्व', 'सब', 'all', 'काही', 'कुछ', 'some'
];

/**
 * Detect lexical category of a phrase (pure pattern matching, no agronomics)
 */
export function detectLexicalCategory(phrase: string): RawObservationCandidate['lexical_category'] {
  const lower = phrase.toLowerCase();
  
  if (COLOR_PATTERNS.some(p => lower.includes(p.toLowerCase()))) return 'COLOR_WORD';
  if (ACTION_PATTERNS.some(p => lower.includes(p.toLowerCase()))) return 'ACTION_WORD';
  if (OBJECT_PATTERNS.some(p => lower.includes(p.toLowerCase()))) return 'OBJECT_WORD';
  if (LOCATION_PATTERNS.some(p => lower.includes(p.toLowerCase()))) return 'LOCATION_WORD';
  if (TIME_PATTERNS.some(p => lower.includes(p.toLowerCase()))) return 'TIME_WORD';
  if (QUANTITY_PATTERNS.some(p => lower.includes(p.toLowerCase()))) return 'QUANTITY_WORD';
  
  return 'UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════════════
// URGENCY DETECTION (Minimal, not agronomic)
// ═══════════════════════════════════════════════════════════════════════════

const URGENCY_KEYWORDS = [
  'ताबडतोब', 'तुरंत', 'immediately', 'urgent', 'emergency',
  'मर', 'dying', 'वाचवा', 'बचाओ', 'save', 'help',
  'संपलं', 'खत्म', 'destroyed', 'सर्व', 'all'
];

export function detectUrgencyIndicators(text: string): string[] {
  const lower = text.toLowerCase();
  return URGENCY_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));
}

// ═══════════════════════════════════════════════════════════════════════════
// EMOTIONAL TONE DETECTION (Simple)
// ═══════════════════════════════════════════════════════════════════════════

const PANIC_PATTERNS = ['मर', 'dying', 'वाचवा', 'बचाओ', 'help', 'emergency'];
const STRESS_PATTERNS = ['चिंता', 'tension', 'problem', 'समस्या'];

export function detectEmotionalTone(text: string): Phase1TranslationOutput['emotional_tone'] {
  const lower = text.toLowerCase();
  
  if (PANIC_PATTERNS.some(p => lower.includes(p.toLowerCase()))) return 'PANIC';
  if (STRESS_PATTERNS.some(p => lower.includes(p.toLowerCase()))) return 'STRESSED';
  
  return 'NEUTRAL';
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that a Phase1TranslationOutput doesn't contain forbidden fields
 */
export function validatePhase1OutputContract(output: any): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Check for forbidden agronomic fields
  const forbiddenFields = [
    'observation_code', 'symptom_code', 'pest_code', 'disease_code', 'crop_code',
    'confidence', 'confidence_score', 'aggregated_confidence',
    'intent', 'primary_intent', 'query_route', 'routing',
    'severity', 'severity_level', 'distribution', 'affected_part',
    'diagnosis', 'treatment', 'recommendation', 'action'
  ];
  
  for (const field of forbiddenFields) {
    if (output[field] !== undefined) {
      violations.push(`FORBIDDEN_FIELD: ${field} (Phase-1 must not infer ${field})`);
    }
  }
  
  // Check observation_candidates don't have symbol mappings
  if (Array.isArray(output.observation_candidates)) {
    for (const candidate of output.observation_candidates) {
      if (candidate.symbol || candidate.code || candidate.mapped_observation) {
        violations.push(`FORBIDDEN_MAPPING: observation_candidates contain symbol/code mapping`);
        break;
      }
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Create an empty Phase1TranslationOutput for error cases
 */
export function createEmptyPhase1Output(text: string, language: string): Phase1TranslationOutput {
  return {
    version: RAW_OBSERVATION_CONTRACT_VERSION,
    detected_language: language,
    is_code_switched: false,
    original_text: text,
    normalized_text: text.trim(),
    removed_elements: [],
    observation_candidates: [],
    unmapped_tokens: text.split(/\s+/).filter(t => t.length > 1),
    token_count: text.split(/\s+/).length,
    processing_time_ms: 0,
    extracted_at: new Date().toISOString(),
    is_agricultural_content: false,
    urgency_indicators: [],
    emotional_tone: 'UNKNOWN'
  };
}

export default {
  RAW_OBSERVATION_CONTRACT_VERSION,
  detectLexicalCategory,
  detectUrgencyIndicators,
  detectEmotionalTone,
  validatePhase1OutputContract,
  createEmptyPhase1Output
};
