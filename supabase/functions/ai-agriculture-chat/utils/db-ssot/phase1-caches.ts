/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 * ───────────────────────────────────────────────────────────────────────────
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
  emergencyObsCodes: Set<string>;        // enrichment
  diagnosticIntents: Set<string>;        // enrichment
  hypothesisCanonicalGroups: Set<string>;// enrichment
  pestIndicators: Set<string>;           // enrichment
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
      const [chemRes, emergRes, iomRes, hypRes, pestRes] = await Promise.all([
        supabase
          .from('chemical_regulatory_status')
          .select('chemical_name, status')
          .in('status', ['banned', 'restricted', 'watch_list']),
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
          .limit(2000), // PostgREST cap safety
      ]);

      // chemicals
      const banned = new Set<string>();
      const restricted = new Set<string>();
      const watch = new Set<string>();
      for (const row of chemRes.data ?? []) {
        const name = norm(row.chemical_name);
        if (!name) continue;
        if (row.status === 'banned') banned.add(name);
        else if (row.status === 'restricted') restricted.add(name);
        else if (row.status === 'watch_list') watch.add(name);
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
      state.loadedAt = Date.now();

      console.log(
        `[DB_SSOT_CACHE] phase1_loaded_ms=${Date.now() - started} ` +
          `banned=${banned.size} restricted=${restricted.size} watch=${watch.size} ` +
          `emerg=${emerg.size} diag_intents=${intents.size} ` +
          `hyp_groups=${groups.size} pest_indicators=${pests.size}`,
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
  };
}
