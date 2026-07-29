// OBSERVATION CODE MAPPER v2.0.0 (100% Deterministic, Crash-Proof)

import { ObservationKey } from './observation-ontology.ts';
import type { SemanticExtraction } from '../agents/semantic-extractor.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { getObservationsForIntent, isObservationMappingLoaded } from '../utils/observation-mapping-cache.ts';
import {
  observationIndexDiff as _observationIndexDiff,
  resolveAliasCanonical as _resolveAliasCanonical,
  observationIndexReady as _observationIndexReady,
} from '../utils/db-ssot/observation-index.ts';

export const OBSERVATION_CODE_MAPPER_VERSION = '3.1.0'; // P8: shadow-diff observation_aliases against shared index

// OUTPUT INTERFACE

export interface MappedObservationCodes {
  observation_codes: ObservationKey[];         // All matched observation codes
  affected_part_code: ObservationKey;          // Primary affected part
  distribution_code: ObservationKey | null;    // Distribution pattern if detected
  severity_code: ObservationKey;               // Severity level
  mapping_method: 'DETERMINISTIC' | 'INTENT_BASED';
  mapping_confidence: number;                  // 1.0 for deterministic
  mapping_timestamp: string;
  patterns_matched: string[];                  // For audit trail
}

// INTENT CODE → OBSERVATION CODES  (v3.0.0 — DB-DRIVEN, SSOT)

// is now derived from the modal `observation_master.affected_plant_part`

/** DB `affected_plant_part` value → canonical ObservationKey AFFECTED_PART_*.
 *  Purely a code-shape adapter (framework, not agronomy). */
const AFFECTED_PART_KEY_BY_DB_VALUE: Record<string, ObservationKey> = {
  leaf: ObservationKey.AFFECTED_PART_LEAF,
  leaves: ObservationKey.AFFECTED_PART_LEAF,
  stem: ObservationKey.AFFECTED_PART_STEM,
  shoot: ObservationKey.AFFECTED_PART_STEM,
  root: ObservationKey.AFFECTED_PART_ROOT,
  roots: ObservationKey.AFFECTED_PART_ROOT,
  fruit: ObservationKey.AFFECTED_PART_FRUIT,
  fruits: ObservationKey.AFFECTED_PART_FRUIT,
  grain: ObservationKey.AFFECTED_PART_FRUIT,
  flower: ObservationKey.AFFECTED_PART_FLOWER,
  boll: ObservationKey.AFFECTED_PART_BOLL,
  whole: ObservationKey.AFFECTED_PART_WHOLE,
  whole_plant: ObservationKey.AFFECTED_PART_WHOLE,
  plant: ObservationKey.AFFECTED_PART_WHOLE,
};

function toAffectedPartKey(dbValue: string | null | undefined): ObservationKey {
  const v = (dbValue || '').toLowerCase().trim().replace(/\s+/g, '_');
  return AFFECTED_PART_KEY_BY_DB_VALUE[v] ?? ObservationKey.AFFECTED_PART_UNKNOWN;
}

// VISUAL CHANGES → OBSERVATION CODES MAPPING (Legacy fallback)

interface PatternMapping {
  patterns: string[];
  code: ObservationKey;
}

const VISUAL_CHANGE_MAPPINGS: PatternMapping[] = [
  // Leaf color changes (English + Marathi + Hindi)
  { patterns: ['yellow', 'yellowing', 'turning yellow', 'turned yellow', 'पिवळे', 'pivle', 'पीला पड़ना', 'peela padna', 'peela', 'pivla'], code: ObservationKey.LEAF_YELLOWING },
  { patterns: ['brown', 'browning', 'turning brown'], code: ObservationKey.LEAF_BROWN_TIPS },
  { patterns: ['red', 'reddish', 'turning red', 'reddening'], code: ObservationKey.LEAF_REDDENING },
  { patterns: ['pale', 'pale green', 'light green'], code: ObservationKey.LEAF_PALE_GREEN },
  
  // Leaf texture/shape changes (English + Marathi + Hindi)
  { patterns: ['curling', 'curled', 'curl'], code: ObservationKey.LEAF_CURLING },
  { patterns: ['wilting', 'wilted', 'wilt', 'drooping', 'वाळणे', 'valne', 'murjhana', 'मुरझाना'], code: ObservationKey.LEAF_WILTING },
  { patterns: ['drying', 'dried', 'drying out', 'dry', 'वाळणे', 'valne', 'sukh', 'सूखना'], code: ObservationKey.LEAF_DRYING },
  { patterns: ['rolling', 'rolled'], code: ObservationKey.LEAF_ROLLING },
  { patterns: ['twisting', 'twisted'], code: ObservationKey.LEAF_TWISTING },
  { patterns: ['scorching', 'scorched', 'burnt', 'करपा', 'karpa', 'jhulsa', 'झुलसा'], code: ObservationKey.LEAF_SCORCHING },
  
  // Leaf markings (English + Marathi + Hindi)
  { patterns: ['spots', 'spotted', 'spots appearing', 'lesions'], code: ObservationKey.LEAF_SPOTS_PRESENT },
  { patterns: ['holes', 'chewed', 'eaten', 'bite marks', 'छिद्र', 'chhidra', 'भोक', 'bhok', 'छेद', 'chhed'], code: ObservationKey.LEAF_CHEWING },
  { patterns: ['stripes', 'striped', 'streaks'], code: ObservationKey.LEAF_STRIPES_PRESENT },
  { patterns: ['white patches', 'white powder', 'powdery'], code: ObservationKey.LEAF_WHITE_PATCHES },
  { patterns: ['black patches', 'black spots'], code: ObservationKey.LEAF_BLACK_PATCHES },
  { patterns: ['mosaic', 'mottled'], code: ObservationKey.LEAF_MOSAIC_PATTERN },
  
  // Stem/shoot symptoms (English + Marathi + Hindi)
  { patterns: ['dead heart', 'central shoot dried', 'central shoot dead'], code: ObservationKey.DEAD_HEART_PRESENT },
  { patterns: ['stem boring', 'borer holes', 'holes in stem', 'छिद्र', 'chhidra', 'भोक', 'bhok', 'छेद', 'chhed', 'boring'], code: ObservationKey.STEM_BORING_MARKS },
  { patterns: ['stem rot', 'rotting stem'], code: ObservationKey.STEM_ROT_PRESENT },
  { patterns: ['stem soft', 'softening'], code: ObservationKey.STEM_SOFTENING },
  { patterns: ['stem split', 'splitting'], code: ObservationKey.STEM_SPLITTING },
  
  // Plant-level symptoms (English + Marathi + Hindi)
  { patterns: ['plant death', 'died', 'dead plants', 'plants dying'], code: ObservationKey.SEEDLING_DIED },
  { patterns: ['stunted', 'not growing', 'poor growth', 'slow growth', 'poor tillering', 'stunting', 'फुट कमी', 'fut kami', 'वाढ कमी', 'vadh kami', 'फुट कम', 'phut kam', 'बढ़वार कम', 'badhwar kam'], code: ObservationKey.STUNTED_PLANTS },
  { patterns: ['lodging', 'fallen', 'bent over'], code: ObservationKey.PLANTS_LODGING },
  { patterns: ['pulled out easily', 'easily pulled', 'loose roots'], code: ObservationKey.SETT_EASILY_PULLED_OUT },
  
  // Root symptoms
  { patterns: ['root rot', 'rotting roots', 'roots rotted'], code: ObservationKey.ROOTS_ROTTED },
  { patterns: ['black roots', 'roots black'], code: ObservationKey.ROOT_BLACKENING },
  { patterns: ['soft roots', 'roots soft'], code: ObservationKey.ROOT_SOFT },
  
  // Disease signs
  { patterns: ['fungal growth', 'fungus'], code: ObservationKey.FUNGAL_GROWTH_VISIBLE },
  { patterns: ['white powdery', 'powdery mildew'], code: ObservationKey.WHITE_POWDERY_GROWTH },
  { patterns: ['mold', 'mould', 'grey mold'], code: ObservationKey.GREY_MOLD_PRESENT },
  { patterns: ['sooty mold', 'black sooty'], code: ObservationKey.BLACK_SOOTY_MOLD },
  { patterns: ['rust', 'pustules'], code: ObservationKey.RUST_PUSTULES },
  { patterns: ['ooze', 'bacterial ooze'], code: ObservationKey.BACTERIAL_OOZE },
  { patterns: ['foul smell', 'bad smell', 'rotting smell'], code: ObservationKey.FOUL_SMELL_PRESENT },
  
  // Fruit/flower symptoms
  { patterns: ['flower drop', 'flowers falling'], code: ObservationKey.FLOWER_DROP },
  { patterns: ['fruit rot', 'rotting fruit'], code: ObservationKey.FRUIT_ROT },
  { patterns: ['boll damage', 'boll rot'], code: ObservationKey.BOLL_DAMAGE },
  
  // Field patterns
  { patterns: ['patches', 'patchy'], code: ObservationKey.PATCHY_DAMAGE },
  { patterns: ['edges', 'field edges'], code: ObservationKey.EDGE_DAMAGE_ONLY },
  { patterns: ['spreading', 'spreading pattern'], code: ObservationKey.DISTRIBUTION_SPREADING },
  
  // Pest indicators
  { patterns: ['webbing', 'webs', 'silk threads'], code: ObservationKey.WEBBING_PRESENT },
  { patterns: ['honeydew', 'sticky'], code: ObservationKey.HONEYDEW_STICKY },
  { patterns: ['frass', 'insect droppings'], code: ObservationKey.FRASS_VISIBLE },
  { patterns: ['insect', 'pest', 'bug', 'worm'], code: ObservationKey.INSECT_PRESENCE_CONFIRMED },
];

// PEST BEHAVIOR → OBSERVATION CODES MAPPING

const PEST_BEHAVIOR_MAPPINGS: PatternMapping[] = [
  { patterns: ['boring', 'tunneling', 'internal damage'], code: ObservationKey.STEM_BORING_MARKS },
  { patterns: ['chewing', 'eating leaves'], code: ObservationKey.LEAF_CHEWING },
  { patterns: ['sucking', 'sap sucking'], code: ObservationKey.LEAF_YELLOWING },
  { patterns: ['webbing', 'making webs'], code: ObservationKey.WEBBING_PRESENT },
  { patterns: ['laying eggs'], code: ObservationKey.INSECT_PRESENCE_CONFIRMED },
  { patterns: ['flying', 'flying around'], code: ObservationKey.INSECT_PRESENCE_CONFIRMED },
  { patterns: ['burrowing'], code: ObservationKey.ROOTS_ROTTED },
];

// AFFECTED PART → OBSERVATION CODES MAPPING

const AFFECTED_PART_MAPPINGS: Record<string, ObservationKey> = {
  'leaves': ObservationKey.AFFECTED_PART_LEAF,
  'leaf': ObservationKey.AFFECTED_PART_LEAF,
  'stem': ObservationKey.AFFECTED_PART_STEM,
  'stalk': ObservationKey.AFFECTED_PART_STEM,
  'shoot': ObservationKey.AFFECTED_PART_STEM,
  'roots': ObservationKey.AFFECTED_PART_ROOT,
  'root': ObservationKey.AFFECTED_PART_ROOT,
  'whole plant': ObservationKey.AFFECTED_PART_WHOLE,
  'entire plant': ObservationKey.AFFECTED_PART_WHOLE,
  'plant': ObservationKey.AFFECTED_PART_WHOLE,
  'fruit': ObservationKey.AFFECTED_PART_FRUIT,
  'fruits': ObservationKey.AFFECTED_PART_FRUIT,
  'flower': ObservationKey.AFFECTED_PART_FLOWER,
  'flowers': ObservationKey.AFFECTED_PART_FLOWER,
  'boll': ObservationKey.AFFECTED_PART_BOLL,
  'bolls': ObservationKey.AFFECTED_PART_BOLL,
  'grain': ObservationKey.AFFECTED_PART_FRUIT,
  'grains': ObservationKey.AFFECTED_PART_FRUIT,
};

// DISTRIBUTION PATTERN → OBSERVATION CODES MAPPING

const DISTRIBUTION_MAPPINGS: Record<string, ObservationKey> = {
  'entire field': ObservationKey.ENTIRE_FIELD_AFFECTED,
  'whole field': ObservationKey.ENTIRE_FIELD_AFFECTED,
  'all plants': ObservationKey.ENTIRE_FIELD_AFFECTED,
  'everywhere': ObservationKey.ENTIRE_FIELD_AFFECTED,
  'uniform': ObservationKey.DISTRIBUTION_UNIFORM,
  'patches': ObservationKey.PATCHY_DAMAGE,
  'patchy': ObservationKey.PATCHY_DAMAGE,
  'some areas': ObservationKey.PATCHY_DAMAGE,
  'specific area': ObservationKey.LOCALIZED_SPOTS,
  'localized': ObservationKey.LOCALIZED_SPOTS,
  'edges': ObservationKey.EDGE_DAMAGE_ONLY,
  'field edges': ObservationKey.EDGE_DAMAGE_ONLY,
  'borders': ObservationKey.EDGE_DAMAGE_ONLY,
  'scattered': ObservationKey.DISTRIBUTION_PATCHY,
  'random': ObservationKey.DISTRIBUTION_PATCHY,
  'spreading': ObservationKey.DISTRIBUTION_SPREADING,
  'directional': ObservationKey.DIRECTIONAL_SPREAD,
  'low lying': ObservationKey.LOW_LYING_AREA_AFFECTED,
};

// SEVERITY → OBSERVATION CODES MAPPING

const SEVERITY_MAPPINGS: Record<string, ObservationKey> = {
  'mild': ObservationKey.SEVERITY_LOW,
  'moderate': ObservationKey.SEVERITY_MEDIUM,
  'severe': ObservationKey.SEVERITY_HIGH,
  'critical': ObservationKey.SEVERITY_CRITICAL,
};

// SAFE FIELD ACCESSORS (Crash-proof)

function safeArray<T>(arr: T[] | undefined | null): T[] {
  return Array.isArray(arr) ? arr : [];
}

function safeString(str: string | undefined | null): string {
  return typeof str === 'string' ? str : '';
}

// MAIN MAPPING FUNCTION (v2.0.0 - Intent-Based with Legacy Fallback)

// Map semantic extraction to canonical ObservationKey codes
// Scope for the DB-SSOT `intent_observation_mapping` lookup. Comes from the
export interface ObservationMappingScope {
  crop_code?: string | null;
  growth_stage?: string | null;
  das?: number | null;
}

export function mapToObservationCodes(
  semantic: SemanticExtraction,
  scope?: ObservationMappingScope,
): MappedObservationCodes {
  console.log(`\n🔗 [ObservationCodeMapper v${OBSERVATION_CODE_MAPPER_VERSION}] Mapping to codes...`);

  const startTime = Date.now();
  const observationCodes: ObservationKey[] = [];
  const patternsMatched: string[] = [];

  // Determine mapping method based on intent_code presence
  const intentCode = safeString(semantic?.intent_code).toUpperCase();
  let usedIntentMapping = false;
  let affectedPartCode = ObservationKey.AFFECTED_PART_UNKNOWN;
  let severityCode = ObservationKey.SEVERITY_MEDIUM;

  // PRIMARY PATH — DB-SSOT intent → observations (scope-aware, 2026-07-09)
  if (intentCode && intentCode !== 'UNKNOWN_OBSERVATION') {
    if (!isObservationMappingLoaded()) {
      console.warn(`[OBS_MAPPING_CACHE_MISS] intent=${intentCode} reason=cache_not_loaded action=skip_intent_expansion`);
    } else if (!scope || !scope.crop_code) {
      // Fail-closed: without a locked crop we cannot scope, and unscoped
      // expansion is exactly the cross-crop leak we removed.
      console.warn(
        `[OBS_MAPPING_CACHE_MISS] intent=${intentCode} reason=no_scope ` +
        `action=skip_intent_expansion crop=${scope?.crop_code ?? 'null'} ` +
        `stage=${scope?.growth_stage ?? 'null'} das=${scope?.das ?? 'null'}`
      );
    } else {
      const entry = getObservationsForIntent(intentCode, {
        crop_code: scope.crop_code,
        growth_stage: scope.growth_stage ?? null,
        das: typeof scope.das === 'number' ? scope.das : null,
      });
      if (entry && entry.observation_codes.length > 0) {
        usedIntentMapping = true;
        for (const rawCode of entry.observation_codes) {
          // ObservationKey is a string-valued enum — DB observation_codes
          const code = rawCode as ObservationKey;
          if (!observationCodes.includes(code)) {
            observationCodes.push(code);
            patternsMatched.push(`intent:${intentCode}→${code}`);
          }
        }
        affectedPartCode = toAffectedPartKey(entry.modal_affected_part);
        // severityCode intentionally left at runtime neutral (SEVERITY_MEDIUM).
        patternsMatched.push(`intent_part:${affectedPartCode}`);
        patternsMatched.push(`db_ssot:intent_observation_mapping rows=${entry.source_rows}`);
        console.log(
          `[DB_SSOT_SOURCE] path=intent_observation_mapping intent=${intentCode} ` +
          `crop=${scope.crop_code} stage=${scope.growth_stage ?? 'null'} das=${scope.das ?? 'null'} ` +
          `rows=${entry.source_rows} modal_part=${entry.modal_affected_part ?? 'none'}`
        );
      } else {
        console.warn(
          `[OBS_MAPPING_CACHE_MISS] intent=${intentCode} reason=no_db_rows_in_scope ` +
          `crop=${scope.crop_code} stage=${scope.growth_stage ?? 'null'} das=${scope.das ?? 'null'} ` +
          `action=skip_intent_expansion`
        );
      }
    }
  }
  
  // FALLBACK: Map from legacy fields if available (backward compatibility)
  
  // Map visual changes (if any exist)
  const visualChanges = safeArray(semantic?.visual_changes);
  if (visualChanges.length > 0) {
    for (const change of visualChanges) {
      const changeLower = safeString(change).toLowerCase();
      
      for (const mapping of VISUAL_CHANGE_MAPPINGS) {
        for (const pattern of mapping.patterns) {
          if (changeLower.includes(pattern)) {
            if (!observationCodes.includes(mapping.code)) {
              observationCodes.push(mapping.code);
              patternsMatched.push(`visual:"${pattern}"→${mapping.code}`);
            }
            break;
          }
        }
      }
    }
  }
  
  // Map pest behavior (if any exist)
  const pestBehavior = safeArray(semantic?.pest_behavior);
  if (pestBehavior.length > 0) {
    for (const behavior of pestBehavior) {
      const behaviorLower = safeString(behavior).toLowerCase();
      
      for (const mapping of PEST_BEHAVIOR_MAPPINGS) {
        for (const pattern of mapping.patterns) {
          if (behaviorLower.includes(pattern)) {
            if (!observationCodes.includes(mapping.code)) {
              observationCodes.push(mapping.code);
              patternsMatched.push(`pest:"${pattern}"→${mapping.code}`);
            }
            break;
          }
        }
      }
    }
  }
  
  // Map affected parts (if any exist and we didn't get one from intent)
  const affectedParts = safeArray(semantic?.affected_plant_parts);
  if (affectedParts.length > 0 && !usedIntentMapping) {
    const primaryPart = safeString(affectedParts[0]).toLowerCase();
    
    for (const [partPattern, code] of Object.entries(AFFECTED_PART_MAPPINGS)) {
      if (primaryPart.includes(partPattern)) {
        affectedPartCode = code;
        patternsMatched.push(`part:"${partPattern}"→${code}`);
        break;
      }
    }
  }
  
  // Map distribution pattern
  let distributionCode: ObservationKey | null = null;
  const distPattern = safeString(semantic?.distribution_pattern).toLowerCase();
  if (distPattern && distPattern !== 'not specified') {
    for (const [pattern, code] of Object.entries(DISTRIBUTION_MAPPINGS)) {
      if (distPattern.includes(pattern)) {
        distributionCode = code;
        patternsMatched.push(`dist:"${pattern}"→${code}`);
        break;
      }
    }
  }
  
  // Map severity (if we didn't get one from intent)
  const severityIndicator = safeString(semantic?.severity_indicator).toLowerCase();
  if (severityIndicator && !usedIntentMapping) {
    const mappedSeverity = SEVERITY_MAPPINGS[severityIndicator];
    if (mappedSeverity) {
      severityCode = mappedSeverity;
      patternsMatched.push(`severity:${severityIndicator}→${severityCode}`);
    }
  }
  
  // BUILD RESULT
  const result: MappedObservationCodes = {
    observation_codes: observationCodes,
    affected_part_code: affectedPartCode,
    distribution_code: distributionCode,
    severity_code: severityCode,
    mapping_method: usedIntentMapping ? 'INTENT_BASED' : 'DETERMINISTIC',
    mapping_confidence: 1.0, // Deterministic = 100% confident
    mapping_timestamp: new Date().toISOString(),
    patterns_matched: patternsMatched
  };
  
  const elapsed = Date.now() - startTime;
  console.log(`   ✅ Mapping complete in ${elapsed}ms`);
  console.log(`      Codes: [${observationCodes.join(', ')}]`);
  console.log(`      Part: ${affectedPartCode}, Dist: ${distributionCode || 'none'}, Severity: ${severityCode}`);
  console.log(`      Patterns matched: ${patternsMatched.length}`);
  
  return result;
}

// VOCABULARY BRIDGE: ALIAS EXPANSION (DB-Driven)

type ObservationAliasRow = { alias_code: string; canonical_code: string };

type AliasCache = {
  fetched_at_ms: number;
  rows: ObservationAliasRow[];
};

const OBS_ALIAS_CACHE_TTL_MS = 5 * 60 * 1000;
let OBS_ALIAS_CACHE: AliasCache | null = null;

function normalizeObsCode(code: string): string {
  return (code || '').toUpperCase().replace(/[\s-]+/g, '_').trim();
}

function getSupabaseClient(existingClient?: any) {
  if (existingClient) return existingClient;

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('[ObservationCodeMapper] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

async function loadObservationAliases(supabaseClient?: any): Promise<ObservationAliasRow[]> {
  const now = Date.now();
  if (OBS_ALIAS_CACHE && now - OBS_ALIAS_CACHE.fetched_at_ms < OBS_ALIAS_CACHE_TTL_MS) {
    return OBS_ALIAS_CACHE.rows;
  }

  const supabase = getSupabaseClient(supabaseClient);

  const { data, error } = await supabase
    .from('observation_aliases')
    .select('alias_code, canonical_code');

  if (error) {
    console.warn(`[ObservationCodeMapper] Failed to load observation_aliases: ${error.message}`);
    return [];
  }

  const rows: ObservationAliasRow[] = (data || []).map((r: any) => ({
    alias_code: normalizeObsCode(r.alias_code),
    canonical_code: normalizeObsCode(r.canonical_code),
  }));

  // P8 (2026-07-24): SHADOW-DIFF observation_aliases against shared index.
  if (_observationIndexReady()) {
    let checked = 0;
    for (const r of rows) {
      if (checked >= 25) break; // cap per refresh
      const indexCanonical = _resolveAliasCanonical(r.alias_code);
      if (indexCanonical == null) continue; // index doesn't know this alias
      _observationIndexDiff(
        'observation-code-mapper.loadObservationAliases',
        r.alias_code,
        r.canonical_code,
        indexCanonical,
      );
      checked++;
    }
  }

  OBS_ALIAS_CACHE = { fetched_at_ms: now, rows };
  return rows;
}

// Expand observation vocabulary so the rule engine sees BOTH generic + specific codes.
export async function expandObservationVocabularyViaAliases(
  inputCodes: string[],
  supabaseClient?: any
): Promise<{ expanded_codes: string[]; trace: string[] }> {
  const normalized = inputCodes.map(normalizeObsCode).filter(Boolean);
  const base = new Set<string>(normalized);

  if (base.size === 0) return { expanded_codes: [], trace: [] };

  const rows = await loadObservationAliases(supabaseClient);
  if (rows.length === 0) return { expanded_codes: Array.from(base), trace: [] };

  const aliasToCanonical = new Map<string, Set<string>>();
  const canonicalToAlias = new Map<string, Set<string>>();

  for (const r of rows) {
    if (!aliasToCanonical.has(r.alias_code)) aliasToCanonical.set(r.alias_code, new Set());
    aliasToCanonical.get(r.alias_code)!.add(r.canonical_code);

    if (!canonicalToAlias.has(r.canonical_code)) canonicalToAlias.set(r.canonical_code, new Set());
    canonicalToAlias.get(r.canonical_code)!.add(r.alias_code);
  }

  const expanded = new Set<string>(base);
  const trace: string[] = [];

  for (const code of base) {
    const canonicals = aliasToCanonical.get(code);
    if (canonicals) {
      for (const c of canonicals) {
        if (!expanded.has(c)) {
          expanded.add(c);
          trace.push(`alias:${code}→${c}`);
        }
      }
    }

    const aliases = canonicalToAlias.get(code);
    if (aliases) {
      for (const a of aliases) {
        if (!expanded.has(a)) {
          expanded.add(a);
          trace.push(`canonical:${code}→${a}`);
        }
      }
    }
  }

  return { expanded_codes: Array.from(expanded), trace };
}

// P1 (Batch A) — INTENT-PEER SEED EXPANSION (DB-SSOT, zero hardcoded agronomy)

export interface IntentPeerContext {
  crop_code?: string | null;
  growth_stage?: string | null;
  das?: number | null;
}

export interface IntentPeerExpansion {
  peer_codes: string[];
  via_intents: string[];
  trace: string[];
}

/** Lowercase DB-canonical form used by observation_master.observation_code. */
function dbCanonicalCode(code: string): string {
  return (code || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export async function expandSeedsViaIntentPeers(
  seedCodes: string[],
  ctx: IntentPeerContext,
  supabaseClient?: any,
): Promise<IntentPeerExpansion> {
  const seeds = Array.from(new Set(seedCodes.map(dbCanonicalCode).filter(Boolean)));
  if (seeds.length === 0) return { peer_codes: [], via_intents: [], trace: [] };

  let supabase: any;
  try {
    supabase = getSupabaseClient(supabaseClient);
  } catch (e) {
    console.warn(`[OBS_CANONICAL_EXPAND] no_supabase err=${(e as Error).message}`);
    return { peer_codes: [], via_intents: [], trace: [] };
  }

  // Step 1 — which curated intents reference any of the seed codes?
  const { data: intentRows, error: intentErr } = await supabase
    .from('intent_observation_mapping')
    .select('intent_code')
    .in('observation_code', seeds)
    .eq('is_active', true);

  if (intentErr) {
    console.warn(`[OBS_CANONICAL_EXPAND] intent_lookup_failed err=${intentErr.message}`);
    return { peer_codes: [], via_intents: [], trace: [] };
  }

  const intents = Array.from(
    new Set(((intentRows ?? []) as any[]).map((r) => String(r.intent_code || '')).filter(Boolean)),
  );
  if (intents.length === 0) {
    console.log(`[OBS_CANONICAL_EXPAND] seeds=[${seeds.join(',')}] via_intents=0 peers=0`);
    return { peer_codes: [], via_intents: [], trace: [] };
  }

  // Step 2 — sibling observation codes under those intents, scoped by context.
  const crop = ctx.crop_code ? dbCanonicalCode(ctx.crop_code) : null;
  let q = supabase
    .from('intent_observation_mapping')
    .select('intent_code, observation_code, crop_code, growth_stage, das_min, das_max, confidence_rank')
    .in('intent_code', intents)
    .eq('is_active', true);
  if (crop) q = q.in('crop_code', [crop, 'all']);

  const { data: peerRows, error: peerErr } = await q;
  if (peerErr) {
    console.warn(`[OBS_CANONICAL_EXPAND] peer_lookup_failed err=${peerErr.message}`);
    return { peer_codes: [], via_intents: intents, trace: [] };
  }

  const stage = ctx.growth_stage ? dbCanonicalCode(ctx.growth_stage) : null;
  const das = typeof ctx.das === 'number' && Number.isFinite(ctx.das) ? ctx.das : null;

  const scored: Array<{ code: string; rank: number; via: string }> = [];
  for (const r of (peerRows ?? []) as any[]) {
    const code = dbCanonicalCode(String(r.observation_code || ''));
    if (!code || seeds.includes(code)) continue;

    const rowStage = r.growth_stage ? dbCanonicalCode(String(r.growth_stage)) : null;
    // Stage scope: null/'all' rows are stage-agnostic and always eligible.
    if (stage && rowStage && rowStage !== 'all' && rowStage !== stage) continue;

    // DAS scope: only reject when the row declares a window the context misses.
    if (das !== null) {
      const lo = r.das_min == null ? null : Number(r.das_min);
      const hi = r.das_max == null ? null : Number(r.das_max);
      if (lo !== null && Number.isFinite(lo) && das < lo) continue;
      if (hi !== null && Number.isFinite(hi) && das > hi) continue;
    }

    scored.push({
      code,
      rank: Number.isFinite(Number(r.confidence_rank)) ? Number(r.confidence_rank) : 999,
      via: String(r.intent_code || ''),
    });
  }

  scored.sort((a, b) => a.rank - b.rank);
  const seen = new Set<string>();
  const peer_codes: string[] = [];
  const trace: string[] = [];
  for (const s of scored) {
    if (seen.has(s.code)) continue;
    seen.add(s.code);
    peer_codes.push(s.code);
    trace.push(`intent:${s.via}→${s.code}`);
  }

  console.log(
    `[OBS_CANONICAL_EXPAND] seeds=[${seeds.join(',')}] crop=${crop ?? 'unknown'} stage=${stage ?? 'unknown'} ` +
      `das=${das ?? 'null'} via_intents=[${intents.slice(0, 12).join(',')}] peers=${peer_codes.length} ` +
      `peer_codes=[${peer_codes.slice(0, 20).join(',')}]`,
  );

  return { peer_codes, via_intents: intents, trace };
}



// UTILITY FUNCTIONS

// Convert MappedObservationCodes to Set<ObservationKey> for rule engine
export function toObservationKeySet(mapped: MappedObservationCodes): Set<ObservationKey> {
  const keys = new Set<ObservationKey>(mapped.observation_codes);
  keys.add(mapped.affected_part_code);
  keys.add(mapped.severity_code);
  if (mapped.distribution_code) {
    keys.add(mapped.distribution_code);
  }
  return keys;
}

// Check if mapping produced any meaningful codes
export function hasMeaningfulCodes(mapped: MappedObservationCodes): boolean {
  return mapped.observation_codes.length > 0 || 
         mapped.affected_part_code !== ObservationKey.AFFECTED_PART_UNKNOWN;
}

// Get observation codes as string array (for logging/storage)
export function serializeMappedCodes(mapped: MappedObservationCodes): string[] {
  const codes = [...mapped.observation_codes];
  codes.push(mapped.affected_part_code);
  codes.push(mapped.severity_code);
  if (mapped.distribution_code) {
    codes.push(mapped.distribution_code);
  }
  return codes;
}

// EXPORTS

export default {
  mapToObservationCodes,
  toObservationKeySet,
  hasMeaningfulCodes,
  serializeMappedCodes,
  OBSERVATION_CODE_MAPPER_VERSION
};
