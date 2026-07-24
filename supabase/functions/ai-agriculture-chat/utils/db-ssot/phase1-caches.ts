/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-07-24 — Tier 1 audit cutovers: added three DB-SSOT accessors backing
 *   previously hardcoded agri constants:
 *     • `isChemicalClass(name, class)` over chemical_regulatory_status.chemical_class
 *       (replaces NEONICOTINOIDS hardcode in decision-graph-bridge.ts).
 *     • `getRotationFamily(chemical, moa_system)` over chemical_rotation_group
 *       (replaces IRAC/FRAC maps in safety-enhancement.ts).
 *     • `getMaxDosePerHa(chemical)` over system_config.max_safe_doses (JSON map
 *       keyed by active ingredient — replaces MAX_SAFE_DOSES in
 *       deterministic-response-builder.ts).
 *   Enrichment discipline (skip on miss / legacy fallback during cold-boot).
 * 2026-07-24 — P4b: added `findBannedChemicalMention(text, legacyMentionList)`
 *   for the safety-guardian emergency branch. Same hard-fail discipline as
 *   `isBannedChemical` — throws `SafetyCacheUnavailableError` when the
 *   cache is warm but the banned set is empty. Enables removal of the
 *   hardcoded `EMERGENCY_KEYWORDS.banned_used` array in safety-guardian.
 * 2026-07-24 — P6: added `advisoryDirectIntents` DB set (loaded from
 *   observation_intent_master where clarification_mode='DIRECT' and
 *   is_active=true) and `isAdvisoryDirectIntent(intent, legacyFallback)`
 *   enrichment accessor. Cold-boot / miss falls back to caller's legacy set.
 * 2026-07-24 — Phase 3b promotion: `getEmergencyObsCodes` reclassified from
 *   `enrichment` to `safety_hard_fail_on_miss`. Throws
 *   `SafetyCacheUnavailableError` when preload has completed but the set is
 *   empty, matching the discipline of `isBannedChemical` /
 *   `isRestrictedChemical`. Orchestrator emergency detection is P0 critical
 *   and must not silently fail open.
 * 2026-07-22 — Phase 3b cutover: safety accessors (`isBannedChemical`,
 *   `isRestrictedChemical`) now HARD-FAIL via `SafetyCacheUnavailableError`
 *   when the preload has completed but the cache is empty. Legacy fallback
 *   is retained ONLY for the cold-boot window (phase1CacheReady()===false).
 *   Callers MUST catch this error and refuse to emit a chemical
 *   recommendation for the turn rather than silently under-blocking.
 * 2026-07-22 — Phase 1 initial: four DB-SSOT caches replacing hardcoded
 *   TS arrays across decision-graph-bridge, orchestrator, hypothesis-evaluator,
 *   fact-extractor. Boot-time preload with single-flight promise; sync
 *   accessors used by hot-path callers.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PHASE 1 DB-SSOT CACHES
 * ───────────────────────────────────────────────────────────────────────────
 * Replaces hardcoded agronomic constants with DB-driven Sets. All accessors
 * are SYNCHRONOUS to keep hot-path callers unchanged; freshness is guaranteed
 * by boot-time preload (or first-turn preload with single-flight promise).
 *
 * Two discipline classes per plan v2:
 *   - enrichment_skip_on_miss : safe to skip if DB unreachable (log + noop)
 *   - safety_hard_fail_on_miss: must NOT proceed without DB truth. Phase 1
 *     temporarily degrades to caller-supplied legacy fallback with a loud
 *     warning; Phase 3b will convert to a hard refusal once multilingual
 *     safety-refusal rows land in clarification_fallback_questions.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Supa = any;

interface Phase1CacheState {
  loadedAt: number | null;
  loading: Promise<void> | null;
  bannedChemicals: Set<string>;          // safety
  restrictedChemicals: Set<string>;      // safety
  watchListChemicals: Set<string>;       // safety (informational)
  emergencyObsCodes: Set<string>;        // safety (P3b)
  diagnosticIntents: Set<string>;        // enrichment
  hypothesisCanonicalGroups: Set<string>;// enrichment
  pestIndicators: Set<string>;           // enrichment
  advisoryDirectIntents: Set<string>;    // enrichment (P6)
  // Audit-plan v1 (Tier 1) additions:
  chemicalClasses: Map<string, string>;                // chemical_name (lower) → class
  rotationFamilies: Map<string, string>;               // `${moa_system}::${chemical_name(lower)}` → rotation_family
  maxSafeDoses: Map<string, { max_g_per_ha: number; unit: string }>; // chemical (lower) → cap
}

const TTL_MS = 10 * 60 * 1000; // 10 min

const state: Phase1CacheState = {
  loadedAt: null,
  loading: null,
  bannedChemicals: new Set(),
  restrictedChemicals: new Set(),
  watchListChemicals: new Set(),
  emergencyObsCodes: new Set(),
  diagnosticIntents: new Set(),
  hypothesisCanonicalGroups: new Set(),
  pestIndicators: new Set(),
  advisoryDirectIntents: new Set(),
  chemicalClasses: new Map(),
  rotationFamilies: new Map(),
  maxSafeDoses: new Map(),
};

function isFresh(): boolean {
  return state.loadedAt !== null && Date.now() - state.loadedAt < TTL_MS;
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}
function normUpper(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}

/**
 * Load all four caches from Supabase. Idempotent + single-flight: concurrent
 * callers await the same in-flight promise. Safe to call at boot, on every
 * request, or lazily — the TTL gate prevents redundant round-trips.
 */
export async function preloadPhase1Caches(supabase: Supa, opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && isFresh()) return;
  if (state.loading) return state.loading;

  state.loading = (async () => {
    const started = Date.now();
    try {
      const [chemRes, emergRes, iomRes, hypRes, pestRes, advRes, rotRes, doseCfgRes] = await Promise.all([
        supabase
          .from('chemical_regulatory_status')
          .select('chemical_name, status, chemical_class'),
        supabase
          .from('emergency_observation_codes')
          .select('observation_code'),
        supabase
          .from('observation_intent_master')
          .select('intent_code, routing_target')
          .eq('routing_target', 'SYMBOLIC_BRAIN'),
        supabase
          .from('hypothesis_master')
          .select('canonical_group')
          .eq('is_active', true),
        supabase
          .from('observation_master')
          .select('observation_code')
          .eq('semantic_class', 'pest')
          .eq('is_diagnostic', true)
          .limit(2000),
        supabase
          .from('observation_intent_master')
          .select('intent_code')
          .eq('clarification_mode', 'DIRECT')
          .eq('is_active', true),
        // Tier 1 V3: IRAC/FRAC rotation family map
        supabase
          .from('chemical_rotation_group')
          .select('chemical_name, rotation_family, moa_system'),
        // Tier 1 V1: max_safe_doses JSON blob (single row)
        supabase
          .from('system_config')
          .select('config_value')
          .eq('config_key', 'max_safe_doses')
          .maybeSingle(),
      ]);

      // chemicals
      const banned = new Set<string>();
      const restricted = new Set<string>();
      const watch = new Set<string>();
      const classes = new Map<string, string>();
      for (const row of chemRes.data ?? []) {
        const name = norm(row.chemical_name);
        if (!name) continue;
        if (row.status === 'banned') banned.add(name);
        else if (row.status === 'restricted') restricted.add(name);
        else if (row.status === 'watch_list') watch.add(name);
        const cls = norm(row.chemical_class);
        if (cls) classes.set(name, cls);
      }

      const emerg = new Set<string>();
      for (const r of emergRes.data ?? []) {
        const c = normUpper(r.observation_code);
        if (c) emerg.add(c);
      }

      const intents = new Set<string>();
      for (const r of iomRes.data ?? []) {
        const c = normUpper(r.intent_code);
        if (c) intents.add(c);
      }

      const groups = new Set<string>();
      for (const r of hypRes.data ?? []) {
        const g = String(r.canonical_group ?? '').trim();
        if (g) groups.add(g);
      }

      const pests = new Set<string>();
      for (const r of pestRes.data ?? []) {
        const c = normUpper(r.observation_code);
        if (c) pests.add(c);
      }

      const advisoryDirect = new Set<string>();
      for (const r of advRes.data ?? []) {
        const c = normUpper(r.intent_code);
        if (c) advisoryDirect.add(c);
      }

      // Tier 1 V3: rotation families
      const rotations = new Map<string, string>();
      for (const r of rotRes.data ?? []) {
        const name = norm(r.chemical_name);
        const sys = normUpper(r.moa_system);
        const fam = String(r.rotation_family ?? '').trim();
        if (!name || !sys || !fam) continue;
        rotations.set(`${sys}::${name}`, fam);
      }

      // Tier 1 V1: max_safe_doses
      const doses = new Map<string, { max_g_per_ha: number; unit: string }>();
      const doseJson = (doseCfgRes?.data?.config_value ?? {}) as Record<
        string,
        { max_g_per_ha?: unknown; unit?: unknown }
      >;
      for (const [k, v] of Object.entries(doseJson ?? {})) {
        const cap = Number(v?.max_g_per_ha);
        if (!Number.isFinite(cap) || cap <= 0) continue;
        doses.set(norm(k), { max_g_per_ha: cap, unit: String(v?.unit ?? 'g') });
      }

      // Atomic swap only if we got non-empty safety data (banned MUST be non-empty).
      if (banned.size === 0) {
        console.warn(
          '[DB_SSOT_CACHE_MISS] discipline=safety table=chemical_regulatory_status ' +
            'reason=empty_banned_set action=keep_previous fallback=legacy_hardcoded',
        );
      } else {
        state.bannedChemicals = banned;
        state.restrictedChemicals = restricted;
        state.watchListChemicals = watch;
      }
      state.emergencyObsCodes = emerg;
      state.diagnosticIntents = intents;
      state.hypothesisCanonicalGroups = groups;
      state.pestIndicators = pests;
      state.advisoryDirectIntents = advisoryDirect;
      state.chemicalClasses = classes;
      state.rotationFamilies = rotations;
      state.maxSafeDoses = doses;
      state.loadedAt = Date.now();

      console.log(
        `[DB_SSOT_CACHE] phase1_loaded_ms=${Date.now() - started} ` +
          `banned=${banned.size} restricted=${restricted.size} watch=${watch.size} ` +
          `emerg=${emerg.size} diag_intents=${intents.size} ` +
          `hyp_groups=${groups.size} pest_indicators=${pests.size} ` +
          `advisory_direct=${advisoryDirect.size} ` +
          `chem_classes=${classes.size} rotations=${rotations.size} max_doses=${doses.size}`,
      );
    } catch (e) {
      console.error('[DB_SSOT_CACHE_MISS] discipline=mixed action=preload_failed err=' + (e as Error).message);
      // Do NOT reset loadedAt — retain last-good if any.
    } finally {
      state.loading = null;
    }
  })();

  return state.loading;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFETY-CRITICAL ACCESSORS (Phase 3b: hard-fail when cache ready but empty)
// ─────────────────────────────────────────────────────────────────────────────

class SafetyCacheUnavailableError extends Error {
  constructor(table: string) {
    super(
      `[SAFETY_HARD_FAIL] ${table} cache is empty after preload — refusing to ` +
        `evaluate chemical safety without DB truth. Reasoner MUST NOT emit a ` +
        `recommendation this turn.`,
    );
    this.name = 'SafetyCacheUnavailableError';
  }
}

function safetyMissWarn(table: string): void {
  console.warn(
    `[DB_SSOT_CACHE_MISS] discipline=safety table=${table} loaded=${state.loadedAt ? 'stale' : 'never'} ` +
      `action=phase3b_cold_boot_legacy_fallback`,
  );
}

export function isBannedChemical(name: string, legacyFallback: readonly string[] = []): boolean {
  const q = norm(name);
  if (!q) return false;
  if (state.bannedChemicals.size > 0) {
    for (const b of state.bannedChemicals) if (q.includes(b)) return true;
    return false;
  }
  // Phase 3b: once the cache preload has completed, an empty banned set is a
  // safety-critical failure — hard-fail rather than silently under-blocking.
  if (phase1CacheReady()) {
    throw new SafetyCacheUnavailableError('chemical_regulatory_status.banned');
  }
  safetyMissWarn('chemical_regulatory_status.banned');
  return legacyFallback.some((b) => q.includes(b.toLowerCase()));
}

export function isRestrictedChemical(name: string, legacyFallback: readonly string[] = []): boolean {
  const q = norm(name);
  if (!q) return false;
  if (state.restrictedChemicals.size > 0) {
    for (const b of state.restrictedChemicals) if (q.includes(b)) return true;
    return false;
  }
  if (phase1CacheReady()) {
    throw new SafetyCacheUnavailableError('chemical_regulatory_status.restricted');
  }
  safetyMissWarn('chemical_regulatory_status.restricted');
  return legacyFallback.some((b) => q.includes(b.toLowerCase()));
}

/** watch_list: informational only — never blocks, only WARNs downstream. */
export function isWatchListChemical(name: string): boolean {
  const q = norm(name);
  if (!q || state.watchListChemicals.size === 0) return false;
  for (const b of state.watchListChemicals) if (q.includes(b)) return true;
  return false;
}

/**
 * P4b (2026-07-24): safety-guardian emergency-branch helper. Scans a free-text
 * farmer input for any banned-chemical mention using the DB SSOT set. Returns
 * the matched canonical name (lower-case, as stored in DB) or null. Follows
 * the same hard-fail discipline as `isBannedChemical` — throws
 * `SafetyCacheUnavailableError` when the preload has completed but the banned
 * set is empty, so the reasoner refuses to declare "no banned mention" from
 * a stale/empty safety cache. During the cold-boot window we fall back to
 * `legacyMentionList` (typically the caller's built-in EMERGENCY_KEYWORDS
 * banned-name list) to avoid false negatives.
 */
export function findBannedChemicalMention(
  text: string,
  legacyMentionList: readonly string[] = [],
): string | null {
  const q = norm(text);
  if (!q) return null;
  if (state.bannedChemicals.size > 0) {
    for (const b of state.bannedChemicals) if (q.includes(b)) return b;
    return null;
  }
  if (phase1CacheReady()) {
    throw new SafetyCacheUnavailableError('chemical_regulatory_status.banned');
  }
  safetyMissWarn('chemical_regulatory_status.banned');
  for (const b of legacyMentionList) if (q.includes(b.toLowerCase())) return b.toLowerCase();
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENRICHMENT ACCESSORS (fail open: return empty Set on miss)
// ─────────────────────────────────────────────────────────────────────────────

function enrichmentMissWarnOnce(table: string): void {
  // Cheap dedup: only warn if never loaded.
  if (state.loadedAt === null) {
    console.warn(`[DB_SSOT_CACHE_MISS] discipline=enrichment table=${table} action=skip`);
  }
}

/**
 * True once the boot-time preload has populated caches at least once (and did
 * not fail leaving loadedAt=null). Used by callers with a legacy hardcoded
 * fallback so they only degrade during the pre-load window, never permanently.
 */
export function phase1CacheReady(): boolean {
  return state.loadedAt !== null;
}

/**
 * Phase 3b promotion (2026-07-24): emergency observation codes are SAFETY
 * critical (they gate P0 emergency treatment pathways). Once the preload has
 * completed, an empty set is a hard-fail — the reasoner MUST refuse to emit a
 * decision this turn rather than silently downgrading a life-critical field
 * signal to a routine observation. Legacy fallback retained ONLY for the
 * cold-boot window (phase1CacheReady()===false).
 */
export function getEmergencyObsCodes(legacyFallback: readonly string[] = []): Set<string> {
  if (state.emergencyObsCodes.size > 0) return state.emergencyObsCodes;
  if (phase1CacheReady()) {
    throw new SafetyCacheUnavailableError('emergency_observation_codes');
  }
  safetyMissWarn('emergency_observation_codes');
  return new Set(legacyFallback.map(normUpper));
}

export function isDiagnosticIntent(intent: unknown, legacyFallback?: readonly string[]): boolean {
  const k = normUpper(intent);
  if (!k) return false;
  if (state.diagnosticIntents.size > 0) return state.diagnosticIntents.has(k);
  enrichmentMissWarnOnce('observation_intent_master.SYMBOLIC_BRAIN');
  if (legacyFallback && !phase1CacheReady()) {
    return legacyFallback.some((v) => normUpper(v) === k);
  }
  return false;
}

export function getHypothesisCanonicalGroups(): string[] {
  if (state.hypothesisCanonicalGroups.size === 0) {
    enrichmentMissWarnOnce('hypothesis_master.canonical_group');
    return [];
  }
  return Array.from(state.hypothesisCanonicalGroups);
}

export function isPestIndicator(code: string): boolean {
  const k = normUpper(code).replace(/[\s-]/g, '_');
  if (!k) return false;
  if (state.pestIndicators.size === 0) {
    enrichmentMissWarnOnce('observation_master.pest');
    return false;
  }
  return state.pestIndicators.has(k);
}

/**
 * P6 (2026-07-24): advisory DIRECT-mode intents from observation_intent_master.
 * Enrichment discipline. When the cache is warm the DB set is authoritative;
 * the caller-supplied `legacyFallback` is unioned in for safety-net coverage
 * so a DB row-removal cannot silently strip an intent from the direct route
 * before an agronomist has reconciled it. Cold-boot returns legacy only.
 */
export function isAdvisoryDirectIntent(
  intent: unknown,
  legacyFallback: readonly string[] = [],
): boolean {
  const k = normUpper(intent);
  if (!k) return false;
  if (state.advisoryDirectIntents.size > 0) {
    if (state.advisoryDirectIntents.has(k)) return true;
    // Safety-net union with legacy until DB rows fully reconciled.
    return legacyFallback.some((v) => normUpper(v) === k);
  }
  enrichmentMissWarnOnce('observation_intent_master.DIRECT');
  return legacyFallback.some((v) => normUpper(v) === k);
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1 CUTOVER ACCESSORS (audit plan v1) — enrichment discipline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V2: True when the chemical belongs to the queried class per
 * `chemical_regulatory_status.chemical_class`. During cold-boot (cache not yet
 * loaded) callers may pass `legacyFallback` — the union of hardcoded class
 * members preserved as a `_LEGACY_` array in the call site — so the pipeline
 * does not silently open a hole for a still-uncatalogued neonicotinoid.
 */
export function isChemicalClass(
  name: string,
  chemicalClass: string,
  legacyFallback: readonly string[] = [],
): boolean {
  const q = norm(name);
  const cls = norm(chemicalClass);
  if (!q || !cls) return false;
  if (state.chemicalClasses.size > 0) {
    for (const [k, v] of state.chemicalClasses) {
      if (v === cls && q.includes(k)) return true;
    }
    return false;
  }
  enrichmentMissWarnOnce('chemical_regulatory_status.chemical_class');
  if (!phase1CacheReady()) {
    return legacyFallback.some((v) => q.includes(v.toLowerCase()));
  }
  return false;
}

/**
 * V3: IRAC/FRAC rotation family lookup from `public.chemical_rotation_group`.
 * `moaSystem` MUST be either 'IRAC' or 'FRAC'. Returns the family label
 * (e.g. 'IRAC_1B', 'FRAC_M') or null if unknown. Cold-boot legacy fallback
 * accepts a `{chemical → family}` map to match the pre-cutover behaviour.
 */
export function getRotationFamily(
  chemical: string,
  moaSystem: 'IRAC' | 'FRAC',
  legacyFallback?: Record<string, string>,
): string | null {
  const q = norm(chemical);
  const sys = normUpper(moaSystem);
  if (!q || (sys !== 'IRAC' && sys !== 'FRAC')) return null;
  if (state.rotationFamilies.size > 0) {
    // Prefer exact match, then substring
    const exact = state.rotationFamilies.get(`${sys}::${q}`);
    if (exact) return exact;
    for (const [k, v] of state.rotationFamilies) {
      if (!k.startsWith(`${sys}::`)) continue;
      const name = k.substring(sys.length + 2);
      if (q.includes(name) || name.includes(q)) return v;
    }
    return null;
  }
  enrichmentMissWarnOnce('chemical_rotation_group');
  if (!phase1CacheReady() && legacyFallback) {
    for (const [k, v] of Object.entries(legacyFallback)) {
      if (q.includes(k.toLowerCase())) return v;
    }
  }
  return null;
}

/**
 * V1: Regulatory maximum-safe dose per hectare, keyed by active ingredient,
 * from `system_config.max_safe_doses`. Returns null when unknown. Legacy
 * fallback accepts the caller's pre-cutover `MAX_SAFE_DOSES` map (kept as
 * `_LEGACY_MAX_SAFE_DOSES`) used only during the cold-boot window.
 */
export function getMaxDosePerHa(
  chemical: string,
  legacyFallback?: Record<string, { max_g_per_ha: number; unit: string }>,
): { max_g_per_ha: number; unit: string } | null {
  const q = norm(chemical);
  if (!q) return null;
  if (state.maxSafeDoses.size > 0) {
    const exact = state.maxSafeDoses.get(q);
    if (exact) return exact;
    for (const [k, v] of state.maxSafeDoses) {
      if (q.includes(k) || k.includes(q)) return v;
    }
    return null;
  }
  enrichmentMissWarnOnce('system_config.max_safe_doses');
  if (!phase1CacheReady() && legacyFallback) {
    const lc = legacyFallback[q];
    if (lc) return lc;
    for (const [k, v] of Object.entries(legacyFallback)) {
      if (q.includes(k.toLowerCase())) return v;
    }
  }
  return null;
}

/** For diagnostics / tests. */
export function _phase1CacheSnapshot() {
  return {
    loadedAt: state.loadedAt,
    banned: state.bannedChemicals.size,
    restricted: state.restrictedChemicals.size,
    watch: state.watchListChemicals.size,
    emerg: state.emergencyObsCodes.size,
    diagnostic_intents: state.diagnosticIntents.size,
    hypothesis_groups: state.hypothesisCanonicalGroups.size,
    pest_indicators: state.pestIndicators.size,
    advisory_direct: state.advisoryDirectIntents.size,
    chemical_classes: state.chemicalClasses.size,
    rotation_families: state.rotationFamilies.size,
    max_safe_doses: state.maxSafeDoses.size,
  };
}
