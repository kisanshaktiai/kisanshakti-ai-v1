/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYMBOLIC REASONER - FACT-TO-RULE EVALUATION ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CRITICAL COMPONENT: This module evaluates `decision_rules.conditions_json`
 * against SymbolicFact objects and returns the rules that legitimately fire.
 *
 * PHILOSOPHY:
 * - Rules are SUPREME, AI only explains
 * - The hypothesis→rule graph is the ONLY diagnostic/rule authority
 * - All decisions come from deterministic, exact condition evaluation
 * - LLM is strictly prohibited from inventing treatments
 *
 * CHANGE LOG (newest first)
 *   2026-09-04 — P0 F14 PRECONDITION FIX (live-trace verified, ai_decision_log land
 *     30197c15: HYP_RICE_LODGING_001 served RICE_STRESS_CYCLONE_RECOVERY_001 whose
 *     conditions_json.trigger='cyclone_passed' was stripped as metadata):
 *     (a) `trigger` / `context` are no longer METADATA_KEYS. A value that is a
 *         registered observation_master code is evaluated exactly like an
 *         `observations:` any-of (evidence → context token → FAIL). An unregistered
 *         value (909/962 rows live, e.g. 'cyclone_passed', 'spray_request') keeps
 *         today's behaviour but is reported in `unresolved_preconditions` and logged
 *         `[TRIGGER_UNREGISTERED]`.
 *     (b) decision_rules.uncertainty_handling_mode (DB-owned, previously read by no
 *         runtime file) is honoured when a rule matched with unresolved
 *         preconditions: block_action / request_more_data ⇒ withheld (reported in
 *         `precondition_blocked`); monitor_only / allow_with_warning / NULL ⇒ fires
 *         with `unresolved_preconditions` attached. No default policy invented.
 *     (c) 2026-09-05 correction: block gates (rule_intent='block', is_safety_block, action_type
 *         'block') are never withheld — under uncertainty the block is the safe outcome.
 *   2026-09-03 — SERVABILITY GATE (live-DB verified): loadAuthorizedRules
 *     previously filtered decision_rules on is_active + deprecated_at only;
 *     254 active-but-not-farmer-servable rows (chemical rules missing dose /
 *     PHI / expert approval, restricted/banned products) were reachable via
 *     hypothesis_rule_mapping and the function runs on the service role, so
 *     RLS never applied. Query now requires is_farmer_servable=true OR
 *     rule_intent='block' OR is_safety_block=true. No agronomy added — the
 *     predicate is the DB's own generated column.
 *   2026-08-27 — P0 FINAL PRODUCTION FIX: graph-authorized execution only.
 *     (1) AUTHORITY: `executeRules()` no longer loads/evaluates the full crop
 *         `decision_rules` corpus. It evaluates ONLY rule_ids explicitly
 *         authorized by the surviving hypothesis→rule graph passed in
 *         `options.graph_authorization` (hypothesis_rule_mapping edges of
 *         surviving hypotheses). No graph edge ⇒ rule cannot fire. Stage,
 *         DAS, NDVI, weather, soil, IOM candidate space and similarity never
 *         authorize a rule. `loadRulesForContext`, the tiered
 *         `applyObservationLayerFilter` widening (tier 0→5, "never collapse to
 *         zero"), observation-metadata DiagBoost and the 5-min crop rule
 *         cache are REMOVED.
 *     (2) EVIDENCE GATE: `facts.all_observations` is rebuilt from
 *         `options.evidence` = CONFIRMED ∪ trusted PERCEIVED codes only.
 *         IOM/CANDIDATE/INFERRED/SYNTHETIC codes, `primary_symptom` and
 *         `user_query` are never evidence. Evidence count 0 ⇒ no rule, no
 *         diagnosis, `clarification_only=true`.
 *     (3) FUZZY DISABLED: `allowFuzzyMatch` is forced false for final rule
 *         execution; `urgencyOverride` never enables fuzzy matching.
 *         `evaluatePartialMatch` is REMOVED.
 *     (4) CONDITION SEMANTICS: `all` = every condition passes; `any` = at
 *         least one; observation = exact canonical evidence match (no token /
 *         substring / query matching); numeric threshold = exact operator;
 *         unknown / non-evaluable condition = FAIL; empty or non-symbolic
 *         conditions = NO MATCH. The `metConditions/totalConditions >= 0.6`
 *         scoring is REMOVED. Soft-pass contextual keys (`no_*`, `normal_*`,
 *         `context`, `stress`, `irrigation_system`, ...) no longer pass
 *         silently.
 *         A rule additionally FIRES ONLY IF at least one satisfied condition is
 *         an exact evidence match (`evidence_anchored`); context-only rules
 *         (stage/DAS/NDVI/weather/soil) never fire even when graph-authorized.
 *     (5) `mapToSymbolicFact` no longer derives NDVI bands, soil sufficiency
 *         thresholds, soil moisture from rainfall, or critical stage from a
 *         hardcoded stage list; it reads `landState.derived.*` SSOT values or
 *         returns UNKNOWN.
 *     (9) 2.4.0 — EVIDENCE CLASS FROM observation_master ONTOLOGY (live-DB verified
 *         2026-08-27: 2,576 rows; is_farmer_observable=false on 332 rows such as
 *         fertilizer_schedule / irrigation_planning / crop_management which are
 *         intent-mapped context tokens; is_diagnostic is a confidence flag, NOT an
 *         evidence flag — e.g. stem_rot_present is is_diagnostic=false yet
 *         is_farmer_observable=true).
 *         • Every observation code referenced by a rule condition is resolved
 *           against observation_master (utils/db-ssot/observation-index cache):
 *             is_farmer_observable=false  ⇒ CONTEXT_TOKEN  — can never be farmer
 *               evidence; satisfied ONLY by the turn's intent-derived context
 *               tokens (`options.context_tokens`, CANDIDATE authority, filtered
 *               to observable=false here).
 *             is_farmer_observable=true|null, or code unknown / index cold
 *                                         ⇒ FARMER_EVIDENCE — satisfied ONLY by
 *               trusted evidence (CONFIRMED / PERCEIVED). Fail-closed.
 *           `can_generate_question` is never consulted for execution.
 *         • `classifyRuleEvidenceRequirement()` now returns `evidence_class`
 *           (FARMER_EVIDENCE | CONTEXT_TOKEN | NONE). A rule whose observation
 *           conditions reference only context tokens is not skipped when
 *           trusted evidence=0; it fires iff the token is present for the turn
 *           and all other exact conditions pass, under graph authorization.
 *         • Result reports `observation_index` (ACTIVE|UNAVAILABLE) and
 *           `context_token_count`.
 *     (8) 2.3.0 — OBSERVATION IS OPTIONAL (route by DB rule contract):
 *         • The unconditional `evidence=0 ⇒ no decision` gate and the
 *           unconditional `!evidence_anchored ⇒ refuse` gate are REMOVED.
 *         • `classifyRuleEvidenceRequirement(rule)` (exported, generic,
 *           data-driven — no crop/category/intent strings):
 *             a) required_observation_category non-empty  ⇒ OBSERVATION_REQUIRED
 *             b) conditions_json has an explicit observation key
 *                (observations/observation/symptom/primary_symptom/
 *                required_symptoms) or a boolean/string observation
 *                assertion                                    ⇒ OBSERVATION_REQUIRED
 *             c) otherwise                                   ⇒ CONTEXT_SUFFICIENT
 *         • OBSERVATION_REQUIRED rules fire only with an exact trusted-evidence
 *           anchor; with evidence=0 they are SKIPPED (counted in
 *           `observation_required_skipped`) and `clarification_only` stays true
 *           when nothing else fired. CONTEXT_SUFFICIENT rules fire on exact
 *           context conditions alone, still ONLY under graph authorization.
 *         • New exact context conditions (schema field mapping, not agronomy):
 *           `cultivation_method` (string|array, vs landState.crop
 *           .cultivation_method), `das_range {min,max}`, `das_min`, `das_max`,
 *           `weather {temp_min,temp_max,humidity_min,humidity_max}`. Any other
 *           sub-key ⇒ FAIL. `context` joins `trigger` as authoring metadata
 *           (live DB: 64/168 rice rules carry free-text `context`).
 *     (7) 2.2.0 — post-review hardening:
 *         • `deriveTrustedEvidence()` is now the single exported contract for
 *           what may become rule evidence: CONFIRMED (any source) + EXTRACTED
 *           ONLY when its provenance is a deterministic farmer-text extractor
 *           (allowlist DB-overridable via system_config
 *           `trusted_perceived_sources`). LLM-sourced EXTRACTED, INFERRED,
 *           SYNTHETIC and CANDIDATE never enter evidence.
 *         • FiredRule carries `hypothesis_ids[]` (all surviving hypotheses
 *           that map to the rule), not just the first edge seen.
 *         • Result reports `taxonomy_guard` = ACTIVE | UNAVAILABLE so a cold
 *           DB-taxonomy cache is visible instead of silently degrading.
 *         • Confidence aggregation / tie-break numbers are declared as
 *           ENGINE policy (not agronomy) and are DB-overridable via
 *           system_config `symbolic_reasoner_engine_policy`.
 *     (6) ZERO AGRONOMIC CONSTANTS IN CODE (2.1.0): removed the in-code
 *         humidity/temperature/soil-moisture flag thresholds, the hardcoded
 *         CATEGORY_PRIORITY authority ordering (now decision_rules
 *         .data_authority_rank DESC, priority DESC), the NDVIGuard intent
 *         list, the 'nutrition' category exclusion and the nutrition
 *         arbitration gates (in-code marker sets). Boolean weather/soil flag
 *         keys are NON-EVALUABLE ⇒ FAIL; rules express thresholds numerically
 *         in conditions_json (e.g. `humidity: ">80"`, `rainfall_24h_mm: ">5"`).
 *         The only remaining restriction gate is the DB-taxonomy BioticGuard.
 *   2026-07-29 10:55 UTC — PHASE 0′ STEP 4: removed hardcoded BIOTIC_OBS_KEYS
 *     and the inline abiotic-category list from the BioticGuard. Rule class now
 *     resolves via utils/db-driven-taxonomies.ts (decision_rules
 *     .biological_group) and observation class via observation_master
 *     .semantic_class after alias canonicalization (exact match, no substring).
 *     Guard degrades to NO FILTER when the taxonomy cache is unloaded.
 *
 * VERSION: 2.0.0 - Graph-Authorized Execution
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import type { AuthoritativeLandState } from './authoritative-state-loader.ts';
import type { CanonicalState } from '../agents/canonical-state-builder.ts';
import { canonicalObsCode, canonicalStageKey } from '../utils/canonical-code.ts';
import {
  isTaxonomyLoaded,
  isAbioticRule,
  hasBioticEvidence as taxonomyHasBioticEvidence,
} from '../utils/db-driven-taxonomies.ts';
import { getConfigJson } from '../utils/db-ssot/system-config-cache.ts';
import {
  getObservationMaster as _getObservationMasterDb,
  observationIndexReady as _observationIndexReady,
  resolveAliasCanonical as _resolveAliasCanonicalDb,
  type ObservationMasterRow,
} from '../utils/db-ssot/observation-index.ts';
import { ObservationAuthority, type AuthoredObservationSet } from '../utils/observation-authority.ts';

export const SYMBOLIC_REASONER_VERSION = '2.4.0';

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE POLICY (NOT agronomic knowledge). These govern how the engine
// aggregates DB-owned rule confidence_score values and breaks ties. They are
// DB-overridable via system_config key `symbolic_reasoner_engine_policy`
// (JSON object with the same keys). Nothing here can authorize a rule.
// ─────────────────────────────────────────────────────────────────────────────
export interface EnginePolicy {
  /** Base confidence once ≥1 rule fired. */
  base_confidence: number;
  /** Per-fired-rule increment and its cap. */
  per_rule_boost: number;
  per_rule_boost_cap: number;
  /** Weight of data_completeness (0..1 of this value). */
  completeness_weight: number;
  /** Hard ceiling on final confidence. */
  confidence_ceiling: number;
  /** Default rule confidence when decision_rules.confidence_score is null. */
  default_rule_confidence: number;
  /** Additional-evidence boost applied when a 2nd rule supports the same hypothesis. */
  hypothesis_support_boost: number;
  hypothesis_confidence_ceiling: number;
  /** Confidence delta below which hypotheses are tie-broken by rule count. */
  hypothesis_tie_delta: number;
  /** Provenance sources allowed to promote EXTRACTED observations to PERCEIVED evidence. */
  trusted_perceived_sources: string[];
}

const ENGINE_POLICY_DEFAULTS: Readonly<EnginePolicy> = Object.freeze({
  base_confidence: 0.5,
  per_rule_boost: 0.05,
  per_rule_boost_cap: 0.3,
  completeness_weight: 0.1,
  confidence_ceiling: 0.95,
  default_rule_confidence: 0.7,
  hypothesis_support_boost: 0.2,
  hypothesis_confidence_ceiling: 0.98,
  hypothesis_tie_delta: 0.1,
  // Deterministic farmer-text extractors only (see orchestrator authority tags).
  // LLM_SEMANTIC_EXTRACTOR / EVIDENCE_LOSS_RECOVERY / IOM_* are intentionally absent.
  trusted_perceived_sources: ['OBSERVATION_KEYS_INDUCTION', 'LANGUAGE_INDUCTION'],
});

export function getEnginePolicy(): EnginePolicy {
  const override = getConfigJson<Partial<EnginePolicy>>('symbolic_reasoner_engine_policy', {});
  const sources = Array.isArray(override.trusted_perceived_sources)
    ? override.trusted_perceived_sources.map(String)
    : getConfigJson<{ sources?: string[] }>('trusted_perceived_sources', {}).sources;
  return {
    ...ENGINE_POLICY_DEFAULTS,
    ...Object.fromEntries(
      Object.entries(override).filter(([k, v]) => k in ENGINE_POLICY_DEFAULTS && typeof v === 'number' && Number.isFinite(v)),
    ),
    trusted_perceived_sources: Array.isArray(sources) && sources.length > 0 ? sources : [...ENGINE_POLICY_DEFAULTS.trusted_perceived_sources],
  };
}

// TYPE DEFINITIONS

export interface SymbolicFact {
  // Core context (from database - NEVER ask farmer)
  crop: string;
  crop_code: string;
  dos: number;
  growth_stage: string;
  land_area_acres: number;
  /** crop_schedules.cultivation_method via landState.crop.cultivation_method, canonical lower-snake, or null. */
  cultivation_method?: string | null;

  // Symptom facts (from observations) — CONTEXT ONLY, never rule evidence
  primary_symptom: string;
  affected_part: string;
  distribution: string;
  severity: string;
  progression: string;

  // EVIDENCE: exact canonical CONFIRMED ∪ trusted PERCEIVED observation codes.
  // This is the ONLY observation evidence the rule evaluator reads.
  all_observations: string[];
  // Pest evidence flag for category exclusion (derived from all_observations)
  has_pest_evidence: boolean;
  /** Set by the reasoner only: intent-derived context tokens (observable=false) for this turn. */
  context_tokens?: string[];

  // Environmental facts
  ndvi: number | null;
  ndvi_trend: string;
  ndvi_status: string;                 // SSOT (landState.derived) or 'UNKNOWN'
  temperature: number | null;
  humidity: number | null;
  /** Measured 24h rainfall (mm) or null. Rules threshold this in conditions_json. */
  rainfall_24h_mm?: number | null;
  /** true iff a measured 24h rainfall value > 0 exists (no mm threshold in code). */
  recent_rain: boolean;
  soil_moisture_estimated: string;     // validated measurement/model or 'UNKNOWN'

  // Soil facts — macronutrients
  soil_n: number | null;
  soil_n_status: string;               // SSOT (landState.derived) or 'UNKNOWN'
  soil_p: number | null;
  soil_p_status: string;
  soil_k: number | null;
  soil_k_status: string;
  soil_ph: number | null;

  // Soil facts — micronutrients (populated when soil test data available)
  soil_zn_ppm: number | null;
  soil_fe_ppm: number | null;
  soil_mn_ppm: number | null;
  soil_mg_cmol: number | null;
  soil_s_ppm: number | null;
  soil_b_ppm: number | null;

  // Derived facts
  stress_level: string;                // SSOT water_stress_level or 'UNKNOWN'
  critical_stage: boolean;
  /** true ONLY when critical_stage came from authoritative stage metadata.
   *  When false/undefined a `critical_stage` condition is NON-EVALUABLE → FAIL. */
  critical_stage_known?: boolean;
  data_completeness: number;
  risk_level: string;                  // SSOT derived.risk_level or 'UNKNOWN'

  // Farmer action facts
  user_query: string;
  recent_treatments: string[];

  // PHASE C — Morphology reconciliation evidence (optional; null when phenology
  morphology_evidence?: {
    overall_status: 'CONSISTENT' | 'MILD_DEVIATION' | 'MAJOR_DEVIATION' | 'INSUFFICIENT_DATA';
    stage_shift_hint: 'AHEAD' | 'BEHIND' | null;
    confidence_delta: number;
    ndvi_status: 'BELOW' | 'IN_RANGE' | 'ABOVE' | 'UNKNOWN';
    height_status: 'BELOW' | 'IN_RANGE' | 'ABOVE' | 'UNKNOWN';
    leaf_status: 'BELOW' | 'IN_RANGE' | 'ABOVE' | 'UNKNOWN';
  } | null;
}

export interface RuleCondition {
  all?: RuleCondition[];
  any?: RuleCondition[];
  fact?: string;
  operator?: 'equal' | 'equals' | 'contains' | 'between' | 'lessThan' | 'greaterThan' | 'in' | 'matches' | 'notEqual';
  value?: any;
}

// FiredRule - LANGUAGE-INDEPENDENT symbolic output
export interface FiredRule {
  rule_id: string;
  rule_name: string;
  category: string;
  confidence: number;
  priority: number;
  /** decision_rules.data_authority_rank — DB-owned ordering authority. */
  data_authority_rank?: number | null;
  cause: string;
  /** First surviving hypothesis that authorized this rule (stable primary attribution). */
  hypothesis_id?: string | null;
  /** ALL surviving hypotheses with an edge to this rule (explainability). */
  hypothesis_ids?: string[];
  actions: {
    action_type: string;
    action_text?: string;
    reason_text?: string;
    knowledge_text?: string;
    i18n_key?: string;
    decision_trace_template?: string;
    product_reference?: string;
    phi_days?: number;
    bee_toxicity?: string;
    ipm_level?: number;
    active_ingredient?: string;
    organic_alternative?: string;
  };
  reasoning: string;
  conditions_matched: string[];
  /** F14: precondition tokens (trigger/context) the runtime could not evaluate. */
  unresolved_preconditions?: string[];
  /** decision_rules.uncertainty_handling_mode as authored (lowercased) or null. */
  uncertainty_handling_mode?: string | null;
}

export interface Hypothesis {
  cause_id: string;
  cause_name: string;
  confidence: number;
  evidence: string[];
  supporting_rules: string[];
}

/**
 * Graph authorization contract. Produced by the hypothesis→rule graph
 * (hypothesis-graph-evaluator + orchestrator snapshot). The reasoner NEVER
 * derives authorization from anything else.
 */
export interface GraphRuleAuthorization {
  /** Surviving (non-eliminated) hypothesis ids for this turn. */
  surviving_hypothesis_ids: ReadonlyArray<string>;
  /** hypothesis_id → rule_id[] from hypothesis_rule_mapping (graph `rule_edges`). */
  rule_edges?: Map<string, string[]> | Record<string, string[]> | null;
  /** Flat authorized rule_id list from the graph (graphOut candidate_rule_ids /
   *  merged snapshot). Used ONLY when `rule_edges` is not supplied. */
  authorized_rule_ids?: ReadonlyArray<string> | null;
}

/** Evidence contract. Only these two classes may become rule facts. */
export interface EvidenceInput {
  /** Farmer-CONFIRMED codes (clarification tap, direct statement, photo). */
  confirmed: ReadonlyArray<string>;
  /** Trusted PERCEIVED codes (pattern-extracted from the farmer's own words). */
  perceived?: ReadonlyArray<string>;
}

export type ExecuteRulesOptions = {
  /** Ignored for final execution — always false. Kept for call-site compatibility. */
  allowFuzzyMatch?: boolean;
  minFuzzyScore?: number;
  /** Never enables fuzzy matching. */
  urgencyOverride?: boolean;
  graph_authorization?: GraphRuleAuthorization | null;
  evidence?: EvidenceInput | null;
  /** Intent-derived observation codes for this turn (CANDIDATE authority). Only codes whose
   *  observation_master row says is_farmer_observable=false are retained as context tokens. */
  context_tokens?: ReadonlyArray<string> | null;
  /** Test injection only. */
  observation_lookup?: ObservationLookup;
};

export type AuthorizationOutcome =
  | 'AUTHORIZED'
  | 'NO_GRAPH_AUTHORIZATION'
  | 'NO_SURVIVING_HYPOTHESES'
  | 'NO_AUTHORIZED_RULES';

export type RuleEvidenceRequirement = 'OBSERVATION_REQUIRED' | 'CONTEXT_SUFFICIENT';
/** What can satisfy the rule's observation conditions (from observation_master.is_farmer_observable). */
export type RuleEvidenceClass = 'FARMER_EVIDENCE' | 'CONTEXT_TOKEN' | 'NONE';
export type ObservationCodeClass = 'FARMER_EVIDENCE' | 'CONTEXT_TOKEN' | 'UNKNOWN';

/** Injectable observation_master lookup (tests). Default = DB-SSOT observation-index cache. */
export interface ObservationLookup {
  ready(): boolean;
  get(code: string): Pick<ObservationMasterRow, 'observation_code' | 'is_farmer_observable' | 'is_diagnostic' | 'is_active'> | null;
}
const DB_OBSERVATION_LOOKUP: ObservationLookup = {
  ready: () => _observationIndexReady(),
  get: (code) => {
    const k = canonicalObsCode(code);
    if (!k) return null;
    const direct = _getObservationMasterDb(k);
    if (direct) return direct;
    const alias = _resolveAliasCanonicalDb(k);
    return alias ? _getObservationMasterDb(alias) : null;
  },
};

/**
 * Evidence class of ONE observation code, from observation_master ONLY.
 *   is_farmer_observable === false ⇒ CONTEXT_TOKEN (intent/context marker, never farmer evidence)
 *   true / null                    ⇒ FARMER_EVIDENCE
 *   index cold or code unknown     ⇒ UNKNOWN (callers treat as FARMER_EVIDENCE — fail-closed)
 */
export function resolveObservationCodeClass(code: unknown, lookup: ObservationLookup = DB_OBSERVATION_LOOKUP): ObservationCodeClass {
  if (!lookup.ready()) return 'UNKNOWN';
  const row = lookup.get(String(code ?? ''));
  if (!row || row.is_active === false) return 'UNKNOWN';
  return row.is_farmer_observable === false ? 'CONTEXT_TOKEN' : 'FARMER_EVIDENCE';
}

/** Explicit observation keys in conditions_json (schema vocabulary, not agronomy). */
const OBSERVATION_CONDITION_KEYS: ReadonlySet<string> = new Set([
  'observations', 'observation', 'symptom', 'primary_symptom', 'required_symptoms',
]);
/** Rule METADATA keys — describe the rule, never conditions (verified against live decision_rules key inventory). */
const METADATA_KEYS: ReadonlySet<string> = new Set([
  'recommendation', 'action', 'diagnosis', 'trigger_keywords',
  'roi_basis', 'roi_modifier', 'roi_by_region', 'roi_estimate', 'cost_benefit', 'economic_note',
  'crop_code', 'crop_type', // crop scope is graph authority (hypothesis crop_group + rule scope)
]);
/** Stage / context keys the evaluator understands (schema field names). */
const STAGE_KEYS: ReadonlySet<string> = new Set(['crop_stage', 'stage', 'growth_stage']);
const CONTEXT_STRUCT_KEYS: ReadonlySet<string> = new Set(['cultivation_method', 'das_range', 'das_min', 'das_max', 'weather']);
const DIRECT_BOOLEAN_KEYS: ReadonlySet<string> = new Set(['recent_rain', 'critical_stage']);
const STATUS_KEYS: ReadonlySet<string> = new Set([
  'ndvi_level', 'ndvi_status', 'ndvi_trend', 'severity', 'soil_moisture', 'stress_level', 'water_stress',
  'soil_nitrogen', 'soil_n_status', 'soil_phosphorus', 'soil_p_status', 'soil_potassium', 'soil_k_status', 'risk_level',
]);
/**
 * Rule PRECONDITION token keys (F14). Values are evaluated as any-of observation codes
 * when registered in observation_master; unregistered values are reported, not evaluated.
 */
const PRECONDITION_TOKEN_KEYS: ReadonlySet<string> = new Set(['trigger', 'context']);
const NUMERIC_THRESHOLD_RE = /^([<>]=?|==?)\s*(-?\d+\.?\d*)$/;

/**
 * Generic, data-driven evidence classifier. Reads ONLY the rule row's
 * `required_observation_category` and the STRUCTURE of `conditions_json`.
 * Never inspects crop, category, intent or action strings.
 */
export function classifyRuleEvidenceRequirement(
  rule: any,
  lookup: ObservationLookup = DB_OBSERVATION_LOOKUP,
): { requirement: RuleEvidenceRequirement; evidence_class: RuleEvidenceClass; reason: string; referenced_codes: string[] } {
  const roc = rule?.required_observation_category;
  const rocNonEmpty = Array.isArray(roc) && roc.filter((x: unknown) => typeof x === 'string' && x.trim().length > 0).length > 0;
  const found = findObservationConditions(rule?.conditions_json);
  const codes = Array.from(new Set(found.flatMap((f) => f.codes)));

  // Evidence class from observation_master: any FARMER_EVIDENCE / UNKNOWN code ⇒ farmer evidence
  // is mandatory (fail-closed). Only when EVERY referenced code is a context token is the
  // rule satisfiable by intent-derived context.
  let evidenceClass: RuleEvidenceClass = 'NONE';
  const classes = codes.map((c) => ({ c, k: resolveObservationCodeClass(c, lookup) }));
  if (classes.length > 0) {
    evidenceClass = classes.every((x) => x.k === 'CONTEXT_TOKEN') ? 'CONTEXT_TOKEN' : 'FARMER_EVIDENCE';
  }

  if (rocNonEmpty) {
    // spec (a): required_observation_category set ⇒ observation REQUIRED. If it references
    // no code at all, the requirement cannot be satisfied by context ⇒ farmer evidence.
    if (evidenceClass === 'NONE') evidenceClass = 'FARMER_EVIDENCE';
    return { requirement: 'OBSERVATION_REQUIRED', evidence_class: evidenceClass, referenced_codes: codes,
      reason: `required_observation_category=[${roc.join(',')}]; codes=[${classes.map((x) => `${x.c}:${x.k}`).join(',')}]` };
  }
  if (found.length > 0) {
    return { requirement: 'OBSERVATION_REQUIRED', evidence_class: evidenceClass, referenced_codes: codes,
      reason: `conditions_json observation condition: ${found.slice(0, 4).map((f) => f.label).join(', ')}; codes=[${classes.map((x) => `${x.c}:${x.k}`).join(',')}]` };
  }
  return { requirement: 'CONTEXT_SUFFICIENT', evidence_class: 'NONE', referenced_codes: [],
    reason: 'no required_observation_category and no observation condition in conditions_json' };
}

/** Walk conditions_json (flat or all/any/leaf) and list observation-bearing conditions with their codes. */
function findObservationConditions(c: any, out: Array<{ label: string; codes: string[] }> = []): Array<{ label: string; codes: string[] }> {
  if (!c || typeof c !== 'object') return out;
  if (Array.isArray(c)) { for (const x of c) findObservationConditions(x, out); return out; }
  if (Array.isArray(c.all)) findObservationConditions(c.all, out);
  if (Array.isArray(c.any)) findObservationConditions(c.any, out);
  const toCodes = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map((x) => canonicalObsCode(x)).filter(Boolean);
  if (typeof c.fact === 'string') {
    const f = c.fact.toLowerCase().replace(/[_-]/g, '');
    if (['symptom', 'primarysymptom', 'visualsymptom', 'observation', 'observations', 'allobservations'].includes(f)) {
      out.push({ label: `fact:${c.fact}`, codes: toCodes(c.value) });
    }
    return out;
  }
  for (const key of Object.keys(c)) {
    if (key === 'all' || key === 'any') continue;
    if (OBSERVATION_CONDITION_KEYS.has(key)) { out.push({ label: key, codes: toCodes(c[key]) }); continue; }
    if (METADATA_KEYS.has(key) || key.startsWith('_')) continue;
    if (STAGE_KEYS.has(key) || CONTEXT_STRUCT_KEYS.has(key) || DIRECT_BOOLEAN_KEYS.has(key) || STATUS_KEYS.has(key)) continue;
    const v = c[key];
    // boolean observation assertion {dead_heart:true} or negative assertion {etl_exceeded:false}
    if (v === true || v === 'true' || v === false || v === 'false') { out.push({ label: `${key}=${v}`, codes: [canonicalObsCode(key)] }); continue; }
    // string evidence value {pest:"termite"} — unless it is a numeric threshold
    if (typeof v === 'string' && !NUMERIC_THRESHOLD_RE.test(v)) { out.push({ label: `${key}=${v}`, codes: [canonicalObsCode(v)] }); continue; }
  }
  return out;
}

// InferenceResult - LANGUAGE-INDEPENDENT symbolic output
export interface InferenceResult {
  diagnosis: Hypothesis | null;
  alternative_diagnoses: Hypothesis[];
  recommendations: FiredRule[];
  confidence: number;
  reasoning: string[];
  rules_fired: number;
  rules_evaluated: number;
  matched_responses: {
    rule_id: string;
    cause: string;
    action_type: string;
    priority?: number;
    action_text?: string;
    reason_text?: string;
    knowledge_text?: string;
    i18n_key?: string;
    decision_trace_template?: string;
  }[];
  /** P0 audit fields */
  authorization: AuthorizationOutcome;
  authorized_rule_ids: string[];
  evidence_count: number;
  /** true ⇒ nothing fired; downstream may ask a clarification question. */
  clarification_only: boolean;
  /** Graph-authorized OBSERVATION_REQUIRED rules skipped because trusted evidence was empty
   *  (the diagnostic route that still needs farmer confirmation). */
  observation_required_skipped: string[];
  /** F14: rules that matched but were withheld by their own uncertainty_handling_mode. */
  precondition_blocked?: Array<{ rule_id: string; mode: string; unresolved: string[] }>;
  /** DB-taxonomy BioticGuard availability this turn. UNAVAILABLE ⇒ guard did not run. */
  taxonomy_guard: 'ACTIVE' | 'UNAVAILABLE';
  /** observation_master index availability. UNAVAILABLE ⇒ every referenced code is treated as FARMER_EVIDENCE. */
  observation_index: 'ACTIVE' | 'UNAVAILABLE';
  /** Intent-derived context tokens accepted this turn (observable=false only). */
  context_token_count: number;
}

// AUTHORIZED RULE CACHE — keyed by the exact authorized rule_id set

interface CachedRules {
  rules: any[];
  expiresAt: number;
}

const ruleCache = new Map<string, CachedRules>();
const RULE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedRules(cacheKey: string): any[] | null {
  const entry = ruleCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    ruleCache.delete(cacheKey);
    return null;
  }
  return entry.rules;
}

function setCachedRules(cacheKey: string, rules: any[]): void {
  if (ruleCache.size > 50) {
    const now = Date.now();
    for (const [key, val] of ruleCache) {
      if (now > val.expiresAt) ruleCache.delete(key);
    }
    if (ruleCache.size > 50) {
      const firstKey = ruleCache.keys().next().value;
      if (firstKey) ruleCache.delete(firstKey);
    }
  }
  ruleCache.set(cacheKey, { rules, expiresAt: Date.now() + RULE_CACHE_TTL_MS });
}

function emptyResult(
  authorization: AuthorizationOutcome,
  authorizedRuleIds: string[],
  evidenceCount: number,
  rulesEvaluated: number,
  reason: string,
): InferenceResult {
  return {
    diagnosis: null,
    alternative_diagnoses: [],
    recommendations: [],
    confidence: 0,
    reasoning: [reason],
    rules_fired: 0,
    rules_evaluated: rulesEvaluated,
    matched_responses: [],
    authorization,
    authorized_rule_ids: authorizedRuleIds,
    evidence_count: evidenceCount,
    clarification_only: true,
    observation_required_skipped: [],
    taxonomy_guard: isTaxonomyLoaded() ? 'ACTIVE' : 'UNAVAILABLE',
    observation_index: _observationIndexReady() ? 'ACTIVE' : 'UNAVAILABLE',
    context_token_count: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRUSTED EVIDENCE CONTRACT — the ONLY way observations become rule evidence.
// Pure function; the orchestrator calls it after the observation bridge.
//   confirmed : CONFIRMED authority, any source (tap / photo / direct statement)
//   perceived : EXTRACTED authority whose `source` is in the trusted allowlist
//   never     : INFERRED, SYNTHETIC, CANDIDATE, or EXTRACTED from an LLM source
// Codes are returned post-bridge canonical and restricted to observation_master
// (`knownCanonical`) when that set is supplied.
// ─────────────────────────────────────────────────────────────────────────────
export function deriveTrustedEvidence(
  authored: Pick<AuthoredObservationSet, 'get' | 'getAllCodes'>,
  bridged: ReadonlyArray<{ raw_code: string; canonical_code: string }>,
  knownCanonical?: ReadonlySet<string> | null,
  policy: EnginePolicy = getEnginePolicy(),
): { confirmed: string[]; perceived: string[]; rejected: Array<{ code: string; authority: string; source: string }> } {
  const trustedSources = new Set(policy.trusted_perceived_sources.map((x) => String(x).toUpperCase()));
  const confirmed = new Set<string>();
  const perceived = new Set<string>();
  const rejected: Array<{ code: string; authority: string; source: string }> = [];

  const classify = (code: string): 'CONFIRMED' | 'PERCEIVED' | null => {
    const a = authored.get(code) ?? authored.get(canonicalObsCode(code));
    if (!a) return null;
    if (a.authority === ObservationAuthority.CONFIRMED) return 'CONFIRMED';
    if (a.authority === ObservationAuthority.EXTRACTED && trustedSources.has(String(a.source).toUpperCase())) return 'PERCEIVED';
    if (!rejected.some((r) => r.code === a.code)) rejected.push({ code: a.code, authority: a.authority, source: a.source });
    return null;
  };

  const known = (c: string) => !knownCanonical || knownCanonical.has(c) || knownCanonical.has(c.toLowerCase());
  const bridgedRaw = new Set<string>();

  for (const b of bridged) {
    const raw = canonicalObsCode(b.raw_code);
    const can = canonicalObsCode(b.canonical_code);
    if (!raw || !can) continue;
    bridgedRaw.add(raw);
    const k = classify(b.raw_code) ?? classify(raw);
    if (!k || !known(can)) continue;
    if (k === 'CONFIRMED') { confirmed.add(can); perceived.delete(can); }
    else if (!confirmed.has(can)) perceived.add(can);
  }
  // Authored codes that never went through the bridge (already canonical)
  for (const code of authored.getAllCodes()) {
    const can = canonicalObsCode(code);
    if (!can || bridgedRaw.has(can)) continue;
    const k = classify(code);
    if (!k || !known(can)) continue;
    if (k === 'CONFIRMED') { confirmed.add(can); perceived.delete(can); }
    else if (!confirmed.has(can)) perceived.add(can);
  }
  return { confirmed: [...confirmed], perceived: [...perceived], rejected };
}

// SYMBOLIC REASONER CLASS

export class SymbolicReasoner {
  private supabase: any;

  constructor(supabaseClient?: any) {
    this.supabase = supabaseClient || createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTHORIZATION — hypothesis→rule graph is the ONLY authority
  // ─────────────────────────────────────────────────────────────────────────
  private resolveAuthorization(
    auth: GraphRuleAuthorization | null | undefined,
  ): { outcome: AuthorizationOutcome; ruleIds: string[]; ruleToHypothesis: Map<string, string[]> } {
    const ruleToHypothesis = new Map<string, string[]>();
    if (!auth) return { outcome: 'NO_GRAPH_AUTHORIZATION', ruleIds: [], ruleToHypothesis };

    const surviving = new Set(
      (auth.surviving_hypothesis_ids ?? []).map((h) => String(h ?? '').trim()).filter(Boolean),
    );
    if (surviving.size === 0) return { outcome: 'NO_SURVIVING_HYPOTHESES', ruleIds: [], ruleToHypothesis };

    const edges = auth.rule_edges;
    if (edges) {
      const entries: Array<[string, string[]]> = edges instanceof Map
        ? Array.from(edges.entries())
        : Object.entries(edges as Record<string, string[]>);
      for (const [hid, rids] of entries) {
        const h = String(hid ?? '').trim();
        if (!surviving.has(h)) continue; // eliminated hypothesis ⇒ its edges are dead
        for (const rid of (rids ?? [])) {
          const r = String(rid ?? '').trim();
          if (!r) continue;
          const list = ruleToHypothesis.get(r) ?? [];
          if (!list.includes(h)) list.push(h);
          ruleToHypothesis.set(r, list);
        }
      }
    } else {
      // Flat list from the same graph — provenance is the surviving set as a whole.
      for (const rid of (auth.authorized_rule_ids ?? [])) {
        const r = String(rid ?? '').trim();
        if (r && !ruleToHypothesis.has(r)) ruleToHypothesis.set(r, [...surviving]);
      }
    }

    const ruleIds = Array.from(ruleToHypothesis.keys());
    if (ruleIds.length === 0) return { outcome: 'NO_AUTHORIZED_RULES', ruleIds: [], ruleToHypothesis };
    return { outcome: 'AUTHORIZED', ruleIds, ruleToHypothesis };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EVIDENCE GATE — CONFIRMED ∪ trusted PERCEIVED only
  // ─────────────────────────────────────────────────────────────────────────
  private gateEvidence(evidence: EvidenceInput | null | undefined): string[] {
    if (!evidence) return [];
    const out = new Set<string>();
    for (const c of (evidence.confirmed ?? [])) {
      const k = canonicalObsCode(c);
      if (k) out.add(k);
    }
    for (const c of (evidence.perceived ?? [])) {
      const k = canonicalObsCode(c);
      if (k) out.add(k);
    }
    return Array.from(out);
  }

  // CRITICAL: Execute symbolic rules against facts — GRAPH-AUTHORIZED ONLY
  async executeRules(
    facts: SymbolicFact,
    landState: AuthoritativeLandState | null,
    options?: ExecuteRulesOptions,
  ): Promise<InferenceResult> {
    console.log(`🔬 [SymbolicReasoner v${SYMBOLIC_REASONER_VERSION}] Starting graph-authorized rule execution...`);
    console.log(`   Crop: ${facts.crop}, Stage: ${facts.growth_stage}, DOS: ${facts.dos}`);

    // (3) FUZZY DISABLED — never for final execution, never via urgency.
    if (options?.allowFuzzyMatch || options?.urgencyOverride) {
      console.log(
        `   🚫 [FuzzyDisabled] allowFuzzyMatch=${!!options?.allowFuzzyMatch} urgencyOverride=${!!options?.urgencyOverride} ` +
        `— ignored; fuzzy/semantic matching is retrieval-only and never authorizes a rule`,
      );
    }

    const startTime = Date.now();
    const policy = getEnginePolicy();
    const taxonomyGuard: 'ACTIVE' | 'UNAVAILABLE' = isTaxonomyLoaded() ? 'ACTIVE' : 'UNAVAILABLE';
    if (taxonomyGuard === 'UNAVAILABLE') {
      console.warn('   ⚠️ [BioticGuard] DB taxonomy cache not loaded — biotic/abiotic exclusion NOT applied this turn (restriction only; authorization unaffected)');
    }

    // (2) EVIDENCE GATE
    const gatedObservations = this.gateEvidence(options?.evidence);
    const evidenceCount = gatedObservations.length;
    const lookup = options?.observation_lookup ?? DB_OBSERVATION_LOOKUP;
    const observationIndex: 'ACTIVE' | 'UNAVAILABLE' = lookup.ready() ? 'ACTIVE' : 'UNAVAILABLE';
    // CONTEXT TOKENS — intent-derived codes accepted ONLY when observation_master says the
    // code is not farmer-observable (i.e. it is a route/context marker, never evidence).
    const contextTokens = new Set<string>();
    for (const c of (options?.context_tokens ?? [])) {
      const k = canonicalObsCode(c);
      if (k && resolveObservationCodeClass(k, lookup) === 'CONTEXT_TOKEN') contextTokens.add(k);
    }
    if (observationIndex === 'UNAVAILABLE') {
      console.warn('   ⚠️ [ObservationIndex] observation_master cache cold — all referenced codes treated as FARMER_EVIDENCE; context tokens disabled');
    }

    // (1) AUTHORIZATION
    const auth = this.resolveAuthorization(options?.graph_authorization);
    console.log(
      `   🧭 [GraphAuthorization] outcome=${auth.outcome} authorized_rules=${auth.ruleIds.length} ` +
      `evidence=${evidenceCount} [${gatedObservations.slice(0, 8).join(',')}] context_tokens=${contextTokens.size} [${[...contextTokens].slice(0, 6).join(',')}]`,
    );

    if (auth.outcome !== 'AUTHORIZED') {
      return emptyResult(auth.outcome, [], evidenceCount, 0,
        `${auth.outcome} — no rule may fire without a surviving hypothesis→rule edge`);
    }

    // Rule facts: the caller's facts with the evidence set REPLACED by the
    // gated set. Nothing IOM/CANDIDATE/INFERRED/SYNTHETIC survives this line.
    const ruleFacts: SymbolicFact = {
      ...facts,
      all_observations: gatedObservations,
      context_tokens: [...contextTokens],
      // has_pest_evidence must be a function of gated evidence only
      has_pest_evidence: facts.has_pest_evidence === true &&
        (facts.all_observations || []).some((o) => gatedObservations.includes(canonicalObsCode(o))),
    };

    const firedRules: FiredRule[] = [];
    const hypotheses = new Map<string, Hypothesis>();
    const matchedResponses: InferenceResult['matched_responses'] = [];
    const observationRequiredSkipped: string[] = [];
    let rulesEvaluated = 0;

    try {
      const rules = await this.loadAuthorizedRules(auth.ruleIds);
      console.log(`   📦 Loaded ${rules.length}/${auth.ruleIds.length} authorized rules (active, non-deprecated)`);

      // Stage applicability is a RESTRICTION (can only remove), never authorization.
      const stageRules = this.filterByStage(rules, ruleFacts.growth_stage?.toLowerCase() || '');
      if (stageRules.length !== rules.length) {
        console.log(`   🎯 [StageRestriction] ${rules.length} → ${stageRules.length} rules applicable at stage=${ruleFacts.growth_stage}`);
      }

      const _taxReady = isTaxonomyLoaded();
      const hasBioticObs = _taxReady && taxonomyHasBioticEvidence(ruleFacts.all_observations);

      // F14: rules withheld by their own uncertainty_handling_mode (DB-owned policy).
      const preconditionBlocked: Array<{ rule_id: string; mode: string; unresolved: string[] }> = [];

      for (const rule of stageRules) {
        // (8)/(9) DB rule contract + observation_master ontology decide what may satisfy the rule.
        const evidenceReq = classifyRuleEvidenceRequirement(rule, lookup);
        const needsFarmerEvidence = evidenceReq.evidence_class === 'FARMER_EVIDENCE';
        const needsContextToken = evidenceReq.evidence_class === 'CONTEXT_TOKEN';
        if (needsFarmerEvidence && evidenceCount === 0) {
          observationRequiredSkipped.push(String(rule.rule_id));
          console.log(`   ⏸ [EvidenceRequired] ${rule.rule_id} skipped — FARMER_EVIDENCE required (${evidenceReq.reason}) but trusted evidence=0`);
          continue;
        }
        rulesEvaluated++;
        const ruleIsAbiotic = _taxReady && isAbioticRule(rule);

        // BioticGuard (restriction, DB taxonomy: decision_rules.biological_group ×
        // observation_master.semantic_class). No filter when taxonomy unloaded.
        if (ruleIsAbiotic && (ruleFacts.has_pest_evidence || hasBioticObs)) {
          console.log(`   🚫 [BioticGuard] Skipping abiotic rule ${rule.rule_id} - biotic evidence present`);
          continue;
        }

        // (4) EXACT condition evaluation — no fuzzy, no partial, no scoring
        const match = this.evaluateConditionsJson(rule.conditions_json || {}, ruleFacts);
        if (!match.matches) {
          console.log(`   ✖ Rule ${rule.rule_id} did not match: ${match.reason}`);
          continue;
        }
        // FARMER_EVIDENCE rules must be anchored to an exact trusted-evidence match;
        // CONTEXT_TOKEN rules must be anchored to an intent-derived context token;
        // CONTEXT_SUFFICIENT rules fire on exact context conditions alone.
        if (needsFarmerEvidence && !match.evidence_anchored) {
          console.log(`   🚫 [EvidenceAnchor] Rule ${rule.rule_id} requires FARMER_EVIDENCE but matched without one (${match.matched_conditions.join(', ')}) — refusing to fire`);
          continue;
        }
        if (needsContextToken && !match.context_anchored) {
          console.log(`   🚫 [ContextAnchor] Rule ${rule.rule_id} requires an intent CONTEXT_TOKEN but none matched (${match.matched_conditions.join(', ')}) — refusing to fire`);
          continue;
        }
        // UNCERTAINTY POLICY (F14) — decision_rules.uncertainty_handling_mode is the rule's own
        // instruction for unproven context. Applied only when the match left a precondition
        // token unresolved. No mode / other modes ⇒ fire, flagged.
        const unresolvedPre: string[] = match.unresolved_preconditions ?? [];
        const uncertaintyMode: string | null = typeof rule.uncertainty_handling_mode === 'string' && rule.uncertainty_handling_mode.trim().length > 0
          ? rule.uncertainty_handling_mode.trim().toLowerCase()
          : null;
        if (unresolvedPre.length > 0) {
          console.log(`   ⚠️ [TRIGGER_UNREGISTERED] ${rule.rule_id} unresolved=[${unresolvedPre.join('; ')}] uncertainty_handling_mode=${uncertaintyMode ?? 'null'}`);
          // Block gates (rule_intent='block' / is_safety_block / action_type='block') are the fail-safe
          // side of uncertainty: withholding them would REMOVE a spray/PHI/re-entry block, which inverts
          // block_action. They fire as before, flagged. Live 2026-09-05: 75 of 105 withheld rules were gates.
          const isBlockGate = rule.rule_intent === 'block' || rule.is_safety_block === true
            || String(rule.action_type ?? '').trim().toLowerCase() === 'block';
          if (isBlockGate) {
            console.log(`   🛡️ [PreconditionPolicy] ${rule.rule_id} block gate — fires fail-safe despite unproven precondition(s)`);
          } else if (uncertaintyMode === 'block_action' || uncertaintyMode === 'request_more_data') {
            preconditionBlocked.push({ rule_id: String(rule.rule_id), mode: uncertaintyMode, unresolved: [...unresolvedPre] });
            console.log(`   🚫 [PreconditionPolicy] ${rule.rule_id} withheld — uncertainty_handling_mode=${uncertaintyMode} with unproven precondition(s)`);
            continue;
          }
        }
        console.log(`   ▶ ${rule.rule_id} route=${evidenceReq.requirement}/${evidenceReq.evidence_class}`);

        const hypothesisIds = auth.ruleToHypothesis.get(String(rule.rule_id)) ?? [];
        const hypothesisId = hypothesisIds[0] ?? null;
        console.log(`   ✅ Rule fired: ${rule.rule_id} (hypotheses=[${hypothesisIds.join(',')}], conf: ${(match.confidence * 100).toFixed(0)}%)`);

        const firedRule: FiredRule = {
          rule_id: rule.rule_id,
          rule_name: rule.cause || rule.rule_id,
          category: rule.category,
          confidence: (() => {
            const cs = rule.confidence_score;
            if (cs != null && cs > 1) {
              console.error(`[symbolic-reasoner] confidence_score out of range: ${cs} for rule ${rule.rule_id}. Expected 0–1 float.`);
            }
            return cs || match.confidence;
          })(),
          priority: rule.priority || 50,
          data_authority_rank: typeof rule.data_authority_rank === 'number' ? rule.data_authority_rank : null,
          cause: rule.cause || 'UNKNOWN',
          hypothesis_id: hypothesisId,
          hypothesis_ids: [...hypothesisIds],
          actions: {
            action_type: rule.action_type || 'advisory',
            action_text: rule.action_text,
            reason_text: rule.reason_text,
            knowledge_text: rule.knowledge_text,
            i18n_key: rule.i18n_key,
            decision_trace_template: rule.decision_trace_template,
            product_reference: rule.rule_id,
            phi_days: rule.phi_days,
            bee_toxicity: rule.bee_toxicity,
            ipm_level: rule.ipm_level,
            active_ingredient: rule.active_ingredient,
            organic_alternative: rule.organic_alternative,
          },
          reasoning: this.generateRuleExplanation(rule, ruleFacts, match, hypothesisId),
          conditions_matched: match.matched_conditions,
          unresolved_preconditions: unresolvedPre.length > 0 ? [...unresolvedPre] : undefined,
          uncertainty_handling_mode: uncertaintyMode,
        };
        firedRules.push(firedRule);

        if (rule.action_type || rule.action_text || rule.i18n_key) {
          matchedResponses.push({
            rule_id: rule.rule_id,
            cause: rule.cause || 'UNKNOWN',
            action_type: rule.action_type || 'advisory',
            priority: rule.priority,
            action_text: rule.action_text,
            reason_text: rule.reason_text,
            knowledge_text: rule.knowledge_text,
            i18n_key: rule.i18n_key,
            decision_trace_template: rule.decision_trace_template,
          });
        }

        this.updateHypotheses(hypotheses, rule, match.confidence, hypothesisIds, policy);
      }

      console.log(`   🎯 Total rules fired: ${firedRules.length}/${rulesEvaluated}`);

      const rankedHypotheses = this.rankHypotheses(hypotheses, policy);

      // Ordering authority is DB-owned: data_authority_rank DESC, then priority DESC.
      firedRules.sort((a, b) => {
        const rankA = a.data_authority_rank ?? 0;
        const rankB = b.data_authority_rank ?? 0;
        if (rankA !== rankB) return rankB - rankA;
        return b.priority - a.priority;
      });

      const finalConfidence = this.calculateFinalConfidence(rankedHypotheses, firedRules, ruleFacts, policy);
      console.log(`   ✅ Inference complete in ${Date.now() - startTime}ms`);

      return {
        diagnosis: rankedHypotheses[0] || null,
        alternative_diagnoses: rankedHypotheses.slice(1, 3),
        recommendations: firedRules,
        confidence: firedRules.length > 0 ? finalConfidence : 0,
        reasoning: firedRules.map((r) => r.reasoning),
        rules_fired: firedRules.length,
        rules_evaluated: rulesEvaluated,
        matched_responses: matchedResponses,
        authorization: 'AUTHORIZED',
        authorized_rule_ids: auth.ruleIds,
        evidence_count: evidenceCount,
        clarification_only: firedRules.length === 0,
        observation_required_skipped: observationRequiredSkipped,
        precondition_blocked: preconditionBlocked,
        taxonomy_guard: taxonomyGuard,
        observation_index: observationIndex,
        context_token_count: contextTokens.size,
      };
    } catch (error) {
      console.error('❌ [SymbolicReasoner] Execution error:', error);
      return emptyResult('AUTHORIZED', auth.ruleIds, evidenceCount, rulesEvaluated, `Error: ${(error as Error).message}`);
    }
  }

  // Load ONLY the authorized rule ids (active, non-deprecated). No crop corpus.
  private async loadAuthorizedRules(ruleIds: string[]): Promise<any[]> {
    if (ruleIds.length === 0) return [];
    const cacheKey = `auth_rules_${[...ruleIds].sort().join('|')}`;
    const cached = getCachedRules(cacheKey);
    if (cached) {
      console.log(`   ♻️ [Cache HIT] ${cached.length} authorized rules`);
      return cached;
    }

    const loaded: any[] = [];
    const CHUNK = 100;
    for (let i = 0; i < ruleIds.length; i += CHUNK) {
      const chunk = ruleIds.slice(i, i + CHUNK);
      const { data, error } = await this.supabase
        .from('decision_rules')
        .select('*')
        .in('rule_id', chunk)
        .eq('is_active', true)
        .is('deprecated_at', null)
        // SERVABILITY GATE (2026-09-03): the DB computes is_farmer_servable
        // (active ∧ not deprecated ∧ not banned/restricted ∧ chemical rows
        // need dose + PHI + expert_approved). Only servable rows may become a
        // recommendation; block rows (rule_intent='block' / is_safety_block)
        // stay loaded because a banned-chemical block is non-servable by
        // construction and must still be able to block.
        .or('is_farmer_servable.eq.true,rule_intent.eq.block,is_safety_block.eq.true');
      if (error) {
        console.error('❌ Failed to load authorized rules:', error);
        const { KnowledgeLoadError } = await import('../data/rule-repository.ts');
        throw new KnowledgeLoadError(`decision_rules load failed (authorized ids=${chunk.length}): ${error.message}`);
      }
      loaded.push(...(data || []));
    }

    // Defensive: never evaluate a row the graph did not authorize, even if the
    // client returned extras.
    const allowed = new Set(ruleIds.map(String));
    const rules = loaded.filter((r) => allowed.has(String(r?.rule_id)));
    const droppedByServability = ruleIds.length - rules.length;
    if (droppedByServability > 0) {
      console.log(`   🔒 [SERVABILITY_GATE] ${droppedByServability} graph-authorized rule id(s) not loaded (inactive, deprecated or not farmer-servable)`);
    }
    setCachedRules(cacheKey, rules);
    return rules;
  }

  // Filter rules by growth stage (restriction only)
  private filterByStage(rules: any[], stage: string): any[] {
    return rules.filter((rule) => {
      const stageApplicable = rule.stage_applicable || [];
      if (stageApplicable.length === 0) return true;
      return stageApplicable.some((s: string) =>
        s.toLowerCase() === stage || s === '*' || s === 'all'
      );
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // (4) CONDITION SEMANTICS — exact, fail-closed
  // ─────────────────────────────────────────────────────────────────────────
  evaluateConditionsJson(
    conditions: RuleCondition,
    facts: SymbolicFact,
  ): { matches: boolean; confidence: number; reason: string; matched_conditions: string[]; evidence_anchored: boolean; context_anchored: boolean; unresolved_preconditions?: string[] } {
    const matchedConditions: string[] = [];
    // evidence_anchored: at least one satisfied condition was an EXACT match against
    // gated evidence (all_observations). Context-only matches (stage / DAS / NDVI /
    // weather / soil) never anchor a rule — spec P0 §1.
    let evidenceAnchored = false;
    // context_anchored: a satisfied observation condition was met by an intent-derived
    // CONTEXT_TOKEN (observation_master.is_farmer_observable=false). Never farmer evidence.
    let contextAnchored = false;
    // F14: trigger/context values not registered in observation_master — reported, not evaluated.
    const unresolvedPreconditions: string[] = [];
    const FAIL = (reason: string) => ({ matches: false, confidence: 0, reason, matched_conditions: [] as string[], evidence_anchored: false, context_anchored: false, unresolved_preconditions: [] as string[] });

    if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions) || Object.keys(conditions).length === 0) {
      return FAIL('NO_CONDITIONS — empty/non-symbolic conditions never match');
    }

    // PATH A: Recursive all/any/fact/operator format
    if (conditions.all !== undefined) {
      if (!Array.isArray(conditions.all) || conditions.all.length === 0) return FAIL('all: empty — never matches');
      const results = conditions.all.map((c) => this.evaluateConditionsJson(c, facts));
      const allMatch = results.every((r) => r.matches);
      if (!allMatch) return FAIL(`all: failed [${results.filter((r) => !r.matches).map((r) => r.reason).join('; ')}]`);
      results.forEach((r) => matchedConditions.push(...r.matched_conditions));
      const avg = results.reduce((s, r) => s + r.confidence, 0) / results.length;
      return { matches: true, confidence: avg, reason: 'All conditions met', matched_conditions: matchedConditions,
        evidence_anchored: results.some((r) => r.evidence_anchored), context_anchored: results.some((r) => r.context_anchored) };
    }

    if (conditions.any !== undefined) {
      if (!Array.isArray(conditions.any) || conditions.any.length === 0) return FAIL('any: empty — never matches');
      const results = conditions.any.map((c) => this.evaluateConditionsJson(c, facts));
      const hits = results.filter((r) => r.matches);
      if (hits.length === 0) return FAIL('any: no condition met');
      hits.forEach((r) => matchedConditions.push(...r.matched_conditions));
      return { matches: true, confidence: Math.max(...hits.map((r) => r.confidence)), reason: 'At least one condition met', matched_conditions: matchedConditions,
        evidence_anchored: hits.some((r) => r.evidence_anchored), context_anchored: hits.some((r) => r.context_anchored) };
    }

    if (conditions.fact !== undefined || conditions.operator !== undefined) {
      if (!conditions.fact || !conditions.operator) return FAIL('fact/operator: incomplete leaf — non-evaluable');
      const factValue = this.getFactValue(facts, conditions.fact);
      if (factValue === undefined || factValue === null || factValue === 'UNKNOWN' || factValue === 'unknown') {
        return FAIL(`Fact '${conditions.fact}' not available`);
      }
      const ok = this.evaluateOperator(factValue, conditions.operator, conditions.value, facts);
      if (!ok) return FAIL(`${conditions.fact} ${conditions.operator} ${JSON.stringify(conditions.value)} failed`);
      const label = `${conditions.fact} ${conditions.operator} ${JSON.stringify(conditions.value)}`;
      const leafAnchored = Array.isArray(factValue) &&
        ['equal', 'equals', 'contains', 'in'].includes(String(conditions.operator).toLowerCase());
      return { matches: true, confidence: 1.0, reason: label, matched_conditions: [label], evidence_anchored: leafAnchored, context_anchored: false };
    }

    // PATH B: Flat DB format — EVERY evaluable key must pass; non-evaluable = FAIL
    const cond = conditions as Record<string, any>;
    const factStageCanon = canonicalStageKey(facts.growth_stage);
    const evidence = new Set((facts.all_observations || []).map((o) => canonicalObsCode(o)).filter(Boolean));
    const tokens = new Set((facts.context_tokens || []).map((o) => canonicalObsCode(o)).filter(Boolean));
    const hasEvidence = (code: unknown): boolean => {
      const k = canonicalObsCode(code);
      return !!k && evidence.has(k);
    };
    // Context tokens were already filtered to observable=false by executeRules.
    const hasToken = (code: unknown): boolean => {
      const k = canonicalObsCode(code);
      return !!k && tokens.has(k);
    };
    // Observation condition satisfied by trusted evidence (anchors evidence) or by a
    // context token (anchors context). Returns null when neither.
    const satisfy = (code: unknown): 'evidence' | 'token' | null =>
      hasEvidence(code) ? 'evidence' : hasToken(code) ? 'token' : null;

    // Boolean facts that are directly measured/authoritative (no threshold in code).
    // Every other boolean weather/soil flag key (high_humidity, low_temperature,
    // soil_moisture_low, …) is NON-EVALUABLE ⇒ FAIL; express it numerically.
    const DIRECT_BOOLEAN_FACTS: Record<string, (f: SymbolicFact) => boolean | null> = {
      'recent_rain':    (f) => typeof f.recent_rain === 'boolean' && f.rainfall_24h_mm !== null && f.rainfall_24h_mm !== undefined ? f.recent_rain : null,
      'critical_stage': (f) => f.critical_stage_known === true ? f.critical_stage === true : null,
    };
    // Status-label facts (SSOT strings). Condition value = exact label; UNKNOWN ⇒ FAIL.
    const STATUS_FACTS: Record<string, (f: SymbolicFact) => string> = {
      'ndvi_level': (f) => f.ndvi_status, 'ndvi_status': (f) => f.ndvi_status,
      'ndvi_trend': (f) => f.ndvi_trend,
      'severity': (f) => f.severity,
      'soil_moisture': (f) => f.soil_moisture_estimated,
      'stress_level': (f) => f.stress_level, 'water_stress': (f) => f.stress_level,
      'soil_nitrogen': (f) => f.soil_n_status, 'soil_n_status': (f) => f.soil_n_status,
      'soil_phosphorus': (f) => f.soil_p_status, 'soil_p_status': (f) => f.soil_p_status,
      'soil_potassium': (f) => f.soil_k_status, 'soil_k_status': (f) => f.soil_k_status,
      'risk_level': (f) => f.risk_level,
    };

    let evaluated = 0;

    for (const key of Object.keys(cond)) {
      if (METADATA_KEYS.has(key)) continue;
      if (key.startsWith('_')) continue; // authoring metadata
      const val = cond[key];

      // PRECONDITION TOKEN KEYS (F14) — trigger/context. Registered observation codes are
      // evaluated exactly like `observations:` (any-of; evidence → context token → FAIL).
      // Unregistered values keep legacy metadata behaviour but are reported upstream.
      if (PRECONDITION_TOKEN_KEYS.has(key)) {
        const list = (Array.isArray(val) ? val : [val]).filter((x: unknown) => typeof x === 'string' && x.trim().length > 0) as string[];
        if (list.length === 0) continue;
        const registered = list.filter((x) => resolveObservationCodeClass(x) !== 'UNKNOWN');
        if (registered.length === 0) {
          unresolvedPreconditions.push(`${key}:${list.join('|')}`);
          continue;
        }
        evaluated++;
        const hitE = registered.find((o) => hasEvidence(o));
        const hit = hitE !== undefined ? hitE : registered.find((o) => hasToken(o));
        if (hit === undefined) return FAIL(`${key}: precondition [${registered.join(',')}] not in evidence or context tokens`);
        matchedConditions.push(`${key}:${canonicalObsCode(hit)}`);
        if (hitE !== undefined) evidenceAnchored = true; else contextAnchored = true;
        continue;
      }

      // STAGE KEYS — exact canonical stage match ('*'/'all' wildcard)
      if (STAGE_KEYS.has(key)) {
        evaluated++;
        if (!factStageCanon || factStageCanon === 'unknown') return FAIL(`${key}: stage unknown`);
        const stages = Array.isArray(val) ? val : [val];
        const ok = stages.some((s: unknown) => {
          const c = canonicalStageKey(s);
          return c === factStageCanon || c === '*' || c === 'all';
        });
        if (!ok) return FAIL(`${key}: ${factStageCanon} ∉ [${stages.join(',')}]`);
        matchedConditions.push('crop_stage');
        continue;
      }

      // OBSERVATION KEYS — exact canonical evidence match, any-of listed codes
      if (OBSERVATION_CONDITION_KEYS.has(key)) {
        evaluated++;
        const list = (Array.isArray(val) ? val : [val]).filter((x) => x !== null && x !== undefined && String(x).length > 0);
        if (list.length === 0) return FAIL(`${key}: empty`);
        const hitE = list.find((o: unknown) => hasEvidence(o));
        const hit = hitE !== undefined ? hitE : list.find((o: unknown) => hasToken(o));
        if (hit === undefined) return FAIL(`${key}: none of [${list.join(',')}] in evidence or context tokens`);
        matchedConditions.push(`observations:${canonicalObsCode(hit)}`);
        if (hitE !== undefined) evidenceAnchored = true; else contextAnchored = true;
        continue;
      }

      // STATUS-LABEL KEYS — exact label equality; UNKNOWN fact ⇒ FAIL
      if (STATUS_FACTS[key]) {
        evaluated++;
        const factVal = STATUS_FACTS[key](facts);
        if (typeof val !== 'string' || !factVal || String(factVal).toUpperCase() === 'UNKNOWN') return FAIL(`${key}: fact unknown`);
        if (val.trim().toUpperCase() !== String(factVal).toUpperCase()) return FAIL(`${key}: ${factVal} ≠ ${val}`);
        matchedConditions.push(key);
        continue;
      }

      // DIRECT BOOLEAN FACTS
      if (DIRECT_BOOLEAN_FACTS[key]) {
        evaluated++;
        const expected = val === true || val === 'true' ? true : (val === false || val === 'false' ? false : null);
        if (expected === null) return FAIL(`${key}: non-boolean value`);
        const actual = DIRECT_BOOLEAN_FACTS[key](facts);
        if (actual === null) return FAIL(`${key}: fact unknown`);
        if (actual !== expected) return FAIL(`${key}: expected ${expected}, got ${actual}`);
        matchedConditions.push(key);
        continue;
      }

      // CONTEXT STRUCTURE KEYS — exact evaluation against authoritative land context
      if (key === 'cultivation_method') {
        evaluated++;
        const fact = canonicalObsCode(facts.cultivation_method ?? '');
        if (!fact || fact === 'unknown') return FAIL('cultivation_method: fact unknown');
        const allowed = (Array.isArray(val) ? val : [val]).map((x: unknown) => canonicalObsCode(x)).filter(Boolean);
        if (allowed.length === 0) return FAIL('cultivation_method: empty');
        if (!allowed.includes(fact)) return FAIL(`cultivation_method: ${fact} ∉ [${allowed.join(',')}]`);
        matchedConditions.push(`cultivation_method=${fact}`);
        continue;
      }
      if (key === 'das_range' || key === 'das_min' || key === 'das_max') {
        evaluated++;
        const dos = typeof facts.dos === 'number' && Number.isFinite(facts.dos) && facts.dos > 0 ? facts.dos : null;
        if (dos === null) return FAIL(`${key}: DAS unknown`);
        const min = key === 'das_min' ? val : key === 'das_range' ? val?.min : undefined;
        const max = key === 'das_max' ? val : key === 'das_range' ? val?.max : undefined;
        if (key === 'das_range' && (val === null || typeof val !== 'object' || Array.isArray(val))) return FAIL('das_range: non-object');
        if (min !== undefined && (typeof min !== 'number' || !Number.isFinite(min))) return FAIL(`${key}: min non-numeric`);
        if (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max))) return FAIL(`${key}: max non-numeric`);
        if (min === undefined && max === undefined) return FAIL(`${key}: no bounds`);
        if (min !== undefined && dos < min) return FAIL(`${key}: DAS ${dos} < ${min}`);
        if (max !== undefined && dos > max) return FAIL(`${key}: DAS ${dos} > ${max}`);
        matchedConditions.push(`${key}:${dos}`);
        continue;
      }
      if (key === 'weather') {
        evaluated++;
        if (val === null || typeof val !== 'object' || Array.isArray(val)) return FAIL('weather: non-object (free-text weather is non-evaluable)');
        const sub = Object.keys(val);
        if (sub.length === 0) return FAIL('weather: empty');
        const WEATHER_FIELDS: Record<string, (f: SymbolicFact, n: number) => boolean | null> = {
          temp_min:     (f, n) => f.temperature === null || f.temperature === undefined ? null : f.temperature >= n,
          temp_max:     (f, n) => f.temperature === null || f.temperature === undefined ? null : f.temperature <= n,
          humidity_min: (f, n) => f.humidity === null || f.humidity === undefined ? null : f.humidity >= n,
          humidity_max: (f, n) => f.humidity === null || f.humidity === undefined ? null : f.humidity <= n,
        };
        for (const wk of sub) {
          const fn = WEATHER_FIELDS[wk];
          const n = val[wk];
          if (!fn) return FAIL(`weather.${wk}: non-evaluable field`);
          if (typeof n !== 'number' || !Number.isFinite(n)) return FAIL(`weather.${wk}: non-numeric`);
          const r = fn(facts, n);
          if (r === null) return FAIL(`weather.${wk}: fact unknown`);
          if (!r) return FAIL(`weather.${wk}: ${n} not satisfied`);
        }
        matchedConditions.push(`weather:${sub.join('+')}`);
        continue;
      }

      // Objects / arrays under arbitrary keys — non-evaluable ⇒ FAIL
      if (val !== null && typeof val === 'object') {
        return FAIL(`${key}: structured value is non-evaluable`);
      }

      // Boolean observation assertion: {dead_heart: true} ⇒ exact canonical evidence match
      if (val === true || val === 'true') {
        evaluated++;
        const how = satisfy(key);
        if (!how) return FAIL(`${key}: not in evidence or context tokens`);
        matchedConditions.push(key);
        if (how === 'evidence') evidenceAnchored = true; else contextAnchored = true;
        continue;
      }

      // Negative assertion: {etl_exceeded: false} ⇒ passes iff NOT in evidence
      if (val === false || val === 'false') {
        evaluated++;
        if (hasEvidence(key) || hasToken(key)) return FAIL(`${key}: contradicted by evidence/context`);
        matchedConditions.push(`!${key}`);
        continue;
      }

      if (typeof val === 'string') {
        // Numeric threshold string: "<0.6", ">=3"
        const thresholdMatch = val.match(NUMERIC_THRESHOLD_RE);
        if (thresholdMatch) {
          evaluated++;
          const factVal = this.getNumericFactForConditionKey(key, facts);
          if (factVal === null) return FAIL(`${key}: numeric fact unknown`);
          if (!this.evaluateThreshold(factVal, thresholdMatch[1], parseFloat(thresholdMatch[2]))) {
            return FAIL(`${key}: ${factVal} !${val}`);
          }
          matchedConditions.push(`${key}${val}`);
          continue;
        }
        // String value: {pest: "termite"} ⇒ exact canonical evidence match of the value
        evaluated++;
        const howS = satisfy(val);
        if (!howS) return FAIL(`${key}=${val}: not in evidence or context tokens`);
        matchedConditions.push(`${key}=${val}`);
        if (howS === 'evidence') evidenceAnchored = true; else contextAnchored = true;
        continue;
      }

      if (typeof val === 'number') {
        evaluated++;
        const factVal = this.getNumericFactForConditionKey(key, facts);
        if (factVal === null) return FAIL(`${key}: numeric fact unknown`);
        if (Math.abs(factVal - val) >= 0.01) return FAIL(`${key}: ${factVal} ≠ ${val}`);
        matchedConditions.push(`${key}=${val}`);
        continue;
      }

      // null / undefined / anything else — non-evaluable ⇒ FAIL
      return FAIL(`${key}: non-evaluable value`);
    }

    if (evaluated === 0) {
      return FAIL('No symbolic conditions — metadata-only conditions never match');
    }

    return {
      matches: true,
      confidence: 1.0,
      reason: `All ${evaluated} conditions matched: ${matchedConditions.join(', ')}`,
      matched_conditions: matchedConditions,
      evidence_anchored: evidenceAnchored,
      context_anchored: contextAnchored,
      unresolved_preconditions: unresolvedPreconditions,
    };
  }

  // Get fact value from facts object with normalization
  private getFactValue(facts: SymbolicFact, factName: string): any {
    const normalizedName = factName.toLowerCase().replace(/[_-]/g, '');
    const mapping: Record<string, keyof SymbolicFact> = {
      'crop': 'crop', 'cropcode': 'crop_code', 'crop_code': 'crop_code',
      'croptype': 'crop', 'crop_type': 'crop',
      'stage': 'growth_stage', 'growthstage': 'growth_stage', 'growth_stage': 'growth_stage',
      'cropstage': 'growth_stage', 'crop_stage': 'growth_stage',
      'dos': 'dos', 'dayssincesowing': 'dos', 'days_since_sowing': 'dos',
      'daysaftersowing': 'dos', 'days_after_sowing': 'dos', 'das': 'dos',
      // observation-class facts resolve to the gated evidence array
      'symptom': 'all_observations', 'primarysymptom': 'all_observations', 'primary_symptom': 'all_observations',
      'visualsymptom': 'all_observations', 'visual_symptom': 'all_observations',
      'observation': 'all_observations', 'observations': 'all_observations',
      'allobservations': 'all_observations', 'all_observations': 'all_observations',
      'affectedpart': 'affected_part', 'affected_part': 'affected_part',
      'severity': 'severity', 'distribution': 'distribution',
      'ndvi': 'ndvi', 'ndvivalue': 'ndvi', 'ndvi_value': 'ndvi',
      'ndvilevel': 'ndvi_status', 'ndvi_level': 'ndvi_status', 'ndvistatus': 'ndvi_status',
      'ndvitrend': 'ndvi_trend', 'ndvi_trend': 'ndvi_trend',
      'soilnitrogen': 'soil_n_status', 'soil_nitrogen': 'soil_n_status',
      'soilphosphorus': 'soil_p_status', 'soil_phosphorus': 'soil_p_status',
      'soilpotassium': 'soil_k_status', 'soil_potassium': 'soil_k_status',
      'soilph': 'soil_ph', 'soil_ph': 'soil_ph',
      'soilmoisture': 'soil_moisture_estimated', 'soil_moisture': 'soil_moisture_estimated',
      'temperature': 'temperature', 'humidity': 'humidity',
      'rainfall': 'rainfall_24h_mm', 'rainfall24hmm': 'rainfall_24h_mm', 'rainfall_24h_mm': 'rainfall_24h_mm', 'rainfalllast24h': 'rainfall_24h_mm',
      'risklevel': 'risk_level', 'risk_level': 'risk_level',
      'waterstress': 'stress_level', 'water_stress': 'stress_level',
      'stresslevel': 'stress_level', 'stress_level': 'stress_level',
    };
    const key = mapping[factName.toLowerCase()] || mapping[normalizedName];
    if (key && key in facts) return (facts as any)[key];
    if (factName in facts) {
      // user_query and primary_symptom are context, not rule facts
      if (factName === 'user_query') return undefined;
      return (facts as any)[factName];
    }
    return undefined;
  }

  // Evaluate comparison operator — exact semantics; unknown operator ⇒ false
  private evaluateOperator(factValue: any, operator: string, conditionValue: any, _facts?: SymbolicFact): boolean {
    const op = String(operator).toLowerCase();
    const isList = Array.isArray(factValue);
    const eq = (a: unknown, b: unknown) => canonicalObsCode(a) === canonicalObsCode(b);

    switch (op) {
      case 'equal':
      case 'equals':
        return isList ? factValue.some((v: unknown) => eq(v, conditionValue)) : eq(factValue, conditionValue);
      case 'notequal':
      case 'not_equal':
        return isList ? !factValue.some((v: unknown) => eq(v, conditionValue)) : !eq(factValue, conditionValue);
      case 'contains':
        // exact element membership (no substring)
        return isList ? factValue.some((v: unknown) => eq(v, conditionValue)) : eq(factValue, conditionValue);
      case 'in':
        if (!Array.isArray(conditionValue)) return false;
        return isList
          ? factValue.some((v: unknown) => conditionValue.some((cv: unknown) => eq(cv, v)))
          : conditionValue.some((cv: unknown) => eq(cv, factValue));
      case 'between': {
        if (isList || !Array.isArray(conditionValue) || conditionValue.length !== 2) return false;
        const n = Number(factValue);
        if (!Number.isFinite(n)) return false;
        return n >= Number(conditionValue[0]) && n <= Number(conditionValue[1]);
      }
      case 'lessthan':
      case 'less_than': {
        const n = Number(factValue); const t = Number(conditionValue);
        return !isList && Number.isFinite(n) && Number.isFinite(t) && n < t;
      }
      case 'greaterthan':
      case 'greater_than': {
        const n = Number(factValue); const t = Number(conditionValue);
        return !isList && Number.isFinite(n) && Number.isFinite(t) && n > t;
      }
      case 'matches':
        // regex is similarity, not evidence — never authorizes
        return false;
      default:
        console.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }

  // Map condition keys to numeric fact values
  private getNumericFactForConditionKey(key: string, facts: SymbolicFact): number | null {
    const CONDITION_TO_FACT: Record<string, () => number | null> = {
      'soil_ph': () => facts.soil_ph,
      'soil_n': () => facts.soil_n, 'soil_p': () => facts.soil_p, 'soil_k': () => facts.soil_k,
      'soil_zn_ppm': () => facts.soil_zn_ppm, 'soil_zn': () => facts.soil_zn_ppm,
      'soil_fe_ppm': () => facts.soil_fe_ppm, 'soil_fe': () => facts.soil_fe_ppm,
      'soil_mn_ppm': () => facts.soil_mn_ppm, 'soil_mn': () => facts.soil_mn_ppm,
      'soil_mg_cmol': () => facts.soil_mg_cmol, 'soil_mg': () => facts.soil_mg_cmol,
      'soil_s_ppm': () => facts.soil_s_ppm, 'soil_s': () => facts.soil_s_ppm,
      'soil_b_ppm': () => facts.soil_b_ppm, 'soil_b': () => facts.soil_b_ppm,
      'ndvi': () => facts.ndvi, 'ndvi_value': () => facts.ndvi,
      'temperature': () => facts.temperature, 'temperature_c': () => facts.temperature,
      'humidity': () => facts.humidity,
      'rainfall_24h_mm': () => facts.rainfall_24h_mm ?? null, 'rainfall_last_24h': () => facts.rainfall_24h_mm ?? null, 'rainfall': () => facts.rainfall_24h_mm ?? null,
      'dos': () => facts.dos, 'das': () => facts.dos, 'days_after_sowing': () => facts.dos, 'days_since_sowing': () => facts.dos,
      'land_area_acres': () => facts.land_area_acres,
    };
    const getter = CONDITION_TO_FACT[key.toLowerCase()];
    if (!getter) return null;
    const v = getter();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  private evaluateThreshold(factValue: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '<': return factValue < threshold;
      case '<=': return factValue <= threshold;
      case '>': return factValue > threshold;
      case '>=': return factValue >= threshold;
      case '=': case '==': return Math.abs(factValue - threshold) < 0.01;
      default: return false;
    }
  }

  private generateRuleExplanation(rule: any, _facts: SymbolicFact, match: any, hypothesisId: string | null): string {
    const parts: string[] = [`Rule ${rule.rule_id} matched`];
    if (hypothesisId) parts.push(`via hypothesis ${hypothesisId}`);
    if (match.matched_conditions && match.matched_conditions.length > 0) {
      parts.push(`because: ${match.matched_conditions.slice(0, 3).join(', ')}`);
    }
    if (rule.scientific_basis) parts.push(`(${rule.scientific_basis})`);
    return parts.join(' ');
  }

  private updateHypotheses(
    hypotheses: Map<string, Hypothesis>,
    rule: any,
    confidence: number,
    hypothesisIds: string[],
    policy: EnginePolicy,
  ): void {
    const targets = hypothesisIds.length > 0 ? hypothesisIds : [rule.cause || rule.rule_id];
    const cs = typeof rule.confidence_score === 'number' ? rule.confidence_score : policy.default_rule_confidence;
    if (cs > 1) console.error(`[symbolic-reasoner] confidence_score out of range: ${cs} for rule ${rule.rule_id}.`);
    for (const causeId of targets) {
      const existing = hypotheses.get(causeId);
      if (existing) {
        existing.confidence = Math.min(policy.hypothesis_confidence_ceiling, existing.confidence + (confidence * policy.hypothesis_support_boost));
        if (!existing.supporting_rules.includes(rule.rule_id)) existing.supporting_rules.push(rule.rule_id);
      } else {
        hypotheses.set(causeId, {
          cause_id: causeId,
          cause_name: rule.cause || rule.rule_id,
          confidence: confidence * cs,
          evidence: [rule.scientific_basis || 'rule match'],
          supporting_rules: [rule.rule_id],
        });
      }
    }
  }

  private rankHypotheses(hypotheses: Map<string, Hypothesis>, policy: EnginePolicy): Hypothesis[] {
    const ranked = Array.from(hypotheses.values());
    ranked.sort((a, b) => {
      if (Math.abs(a.confidence - b.confidence) > policy.hypothesis_tie_delta) return b.confidence - a.confidence;
      return b.supporting_rules.length - a.supporting_rules.length;
    });
    return ranked;
  }

  private calculateFinalConfidence(hypotheses: Hypothesis[], firedRules: FiredRule[], facts: SymbolicFact, policy: EnginePolicy): number {
    if (hypotheses.length === 0 && firedRules.length === 0) return 0;
    let confidence = policy.base_confidence;
    if (firedRules.length > 0) confidence += Math.min(policy.per_rule_boost_cap, firedRules.length * policy.per_rule_boost);
    if (hypotheses.length > 0) confidence = Math.max(confidence, hypotheses[0].confidence);
    confidence += (facts.data_completeness / 100) * policy.completeness_weight;
    return Math.min(policy.confidence_ceiling, confidence);
  }

  // Map canonical + authoritative state to SymbolicFact (no evidence, no
  // hardcoded bands — SSOT derived values or UNKNOWN)
  static mapToSymbolicFact(
    canonicalState: CanonicalState,
    landState: AuthoritativeLandState | null,
    userQuery: string,
  ): SymbolicFact {
    let dataPoints = 0;
    const availablePoints = 4;
    if (landState?.crop?.current_crop) dataPoints++;
    if (landState?.ndvi?.latest_value !== null && landState?.ndvi?.latest_value !== undefined) dataPoints++;
    if (landState?.soil?.nitrogen_kg_per_ha !== null && landState?.soil?.nitrogen_kg_per_ha !== undefined) dataPoints++;
    if (landState?.weather?.temperature !== null && landState?.weather?.temperature !== undefined) dataPoints++;
    const dataCompleteness = (dataPoints / availablePoints) * 100;

    const derived: any = landState?.derived ?? {};
    const ssot = (v: unknown): string => (typeof v === 'string' && v.length > 0 ? v.toUpperCase() : 'UNKNOWN');
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const dos = landState?.crop?.days_since_sowing || 0;
    const stage = landState?.crop?.growth_stage?.toUpperCase() || canonicalState.crop_stage || '';
    const rainfall = num(landState?.weather?.rainfall_last_24h);
    const criticalMeta = (landState?.crop as any)?.is_critical_stage;

    return {
      crop: landState?.crop?.current_crop || canonicalState.crop_type || 'UNKNOWN',
      crop_code: landState?.crop?.crop_code || canonicalState.crop_type?.toLowerCase() || '',
      dos,
      growth_stage: stage,
      land_area_acres: landState?.area_acres || 0,
      cultivation_method: landState?.crop?.cultivation_method ? canonicalObsCode(landState.crop.cultivation_method) : null,

      primary_symptom: canonicalState.visual_symptom || 'UNKNOWN',
      affected_part: (canonicalState as any).affected_part || 'unknown',
      distribution: (canonicalState as any).distribution || 'unknown',
      severity: canonicalState.severity || 'unknown',
      progression: 'unknown',

      all_observations: [],
      has_pest_evidence: false,

      ndvi: num(landState?.ndvi?.latest_value),
      ndvi_trend: ssot(landState?.ndvi?.trend),
      ndvi_status: ssot(derived.ndvi_status),
      temperature: num(landState?.weather?.temperature),
      humidity: num(landState?.weather?.humidity),
      rainfall_24h_mm: rainfall,
      recent_rain: rainfall !== null && rainfall > 0,
      soil_moisture_estimated: ssot((landState?.soil as any)?.moisture_status),

      soil_n: landState?.soil?.nitrogen_kg_per_ha ?? null,
      soil_n_status: ssot(derived.nitrogen_level),
      soil_p: landState?.soil?.phosphorus_kg_per_ha ?? null,
      soil_p_status: ssot(derived.phosphorus_level),
      soil_k: landState?.soil?.potassium_kg_per_ha ?? null,
      soil_k_status: ssot(derived.potassium_level),
      soil_ph: landState?.soil?.ph ?? null,

      soil_zn_ppm: (landState?.soil as any)?.zinc_ppm ?? null,
      soil_fe_ppm: (landState?.soil as any)?.iron_ppm ?? null,
      soil_mn_ppm: (landState?.soil as any)?.manganese_ppm ?? null,
      soil_mg_cmol: (landState?.soil as any)?.magnesium_cmol ?? null,
      soil_s_ppm: (landState?.soil as any)?.sulphur_ppm ?? null,
      soil_b_ppm: (landState?.soil as any)?.boron_ppm ?? null,

      stress_level: ssot(derived.water_stress_level),
      critical_stage: criticalMeta === true,
      critical_stage_known: typeof criticalMeta === 'boolean',
      data_completeness: dataCompleteness,
      risk_level: ssot(derived.risk_level),

      user_query: userQuery,
      recent_treatments: [],
    };
  }
}

// SINGLETON INSTANCE

let reasonerInstance: SymbolicReasoner | null = null;

export function getSymbolicReasoner(supabaseClient?: any): SymbolicReasoner {
  if (!reasonerInstance) {
    reasonerInstance = new SymbolicReasoner(supabaseClient);
  } else if (supabaseClient) {
    (reasonerInstance as any).supabase = supabaseClient;
  }
  return reasonerInstance;
}

// Convenience function — callers MUST supply graph_authorization + evidence
// or the result is clarification-only by construction.
export async function executeSymbolicReasoning(
  canonicalState: CanonicalState,
  landState: AuthoritativeLandState | null,
  userQuery: string,
  options?: ExecuteRulesOptions,
): Promise<InferenceResult> {
  const facts = SymbolicReasoner.mapToSymbolicFact(canonicalState, landState, userQuery);
  const reasoner = getSymbolicReasoner();
  return reasoner.executeRules(facts, landState, options);
}
