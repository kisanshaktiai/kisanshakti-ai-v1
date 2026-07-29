// SEMANTIC VALIDATOR — Phase C, gate #1

import type { EvidenceLedger } from './evidence-ledger.ts';
import type { ConfidenceChain } from './confidence-chain.ts';

export interface ObservationCandidate {
  code: string;
  semantic_class?: string | null;
  confidence?: number;
  source?: string;
  // Canonical observation_code(s) extracted from the surface annotation
  obs_keys?: string[];
}


export interface SemanticGateInput {
  intent: string;
  observations: ObservationCandidate[];
  supabase: any;
  ledger?: EvidenceLedger;
  chain?: ConfidenceChain;
}

export interface SemanticGateResult {
  kept: ObservationCandidate[];
  dropped: Array<ObservationCandidate & { reason: string }>;
  semanticConfidence: number; // kept / total (1 if no observations)
  fallbackOpen: boolean;
}

// In-memory cache per cold start (TTL 10 min)
let allowlistCache:
  | { loadedAt: number; byIntent: Map<string, Set<string>> }
  | null = null;
const TTL_MS = 600_000;

async function loadAllowlist(supabase: any): Promise<Map<string, Set<string>>> {
  const now = Date.now();
  if (allowlistCache && now - allowlistCache.loadedAt < TTL_MS) {
    return allowlistCache.byIntent;
  }
  const byIntent = new Map<string, Set<string>>();
  try {
    const { data, error } = await supabase
      .from('intent_semantic_class_allowlist')
      .select('intent_code, allowed_classes')
      .limit(5000);
    if (error) throw error;
    for (const row of data ?? []) {
      const intent = String(row.intent_code || '').toLowerCase();
      if (!intent) continue;
      const classes = Array.isArray(row.allowed_classes) ? row.allowed_classes : [];
      if (!byIntent.has(intent)) byIntent.set(intent, new Set());
      const set = byIntent.get(intent)!;
      for (const c of classes) {
        const sc = String(c || '').toLowerCase();
        if (sc) set.add(sc);
      }
    }
  } catch (e) {
    console.error('[SEMANTIC_GATE] allowlist load failed', e);
  }
  allowlistCache = { loadedAt: now, byIntent };
  return byIntent;
}


// Resolve a canonical `observation_master.semantic_class` for a candidate.
async function resolveSemanticClass(
  supabase: any,
  obs: ObservationCandidate,
): Promise<{ semanticClass: string | null; source: 'candidate' | 'obs_keys' | 'label' | 'none'; key: string | null }> {
  const preset = (obs.semantic_class || '').toLowerCase();
  if (preset) return { semanticClass: preset, source: 'candidate', key: obs.code };
  const keys = Array.isArray(obs.obs_keys)
    ? obs.obs_keys.map((k) => String(k || '').trim()).filter(Boolean)
    : [];
  const codeAsKey = String(obs.code || '').trim();
  const lookup = Array.from(new Set([...keys, codeAsKey].filter(Boolean)));
  if (lookup.length === 0 || !supabase) return { semanticClass: null, source: 'none', key: null };
  try {
    const { data, error } = await supabase
      .from('observation_master')
      .select('observation_code, semantic_class')
      .in('observation_code', lookup);
    if (error) return { semanticClass: null, source: 'none', key: null };
    // Preserve requested order (obs_keys first)
    for (const k of lookup) {
      const row = (data ?? []).find((r: any) => String(r.observation_code) === k);
      if (row && row.semantic_class) {
        const src = keys.includes(k) ? 'obs_keys' : 'label';
        console.log(`[SEMANTIC_GATE][RESOLVE] key=${k} class=${String(row.semantic_class).toLowerCase()} source=${src}`);
        return { semanticClass: String(row.semantic_class).toLowerCase(), source: src, key: k };
      }
    }
  } catch { /* non-fatal */ }
  return { semanticClass: null, source: 'none', key: null };
}


export async function evaluateSemanticGate(
  input: SemanticGateInput
): Promise<SemanticGateResult> {
  const { intent, observations, supabase, ledger, chain } = input;
  const intentKey = (intent || '').toLowerCase();
  const byIntent = await loadAllowlist(supabase);
  const allowed = byIntent.get(intentKey);

  // Hydrate missing semantic_class from observation_master using obs_keys
  for (const obs of observations) {
    if (!obs.semantic_class) {
      const r = await resolveSemanticClass(supabase, obs);
      if (r.semanticClass) {
        obs.semantic_class = r.semanticClass;
        // Prefer the canonical code that resolved successfully as the
        // display code (keeps ledger keys consistent across gates).
        if (r.key && r.source === 'obs_keys') obs.code = r.key;
      }
    }
  }


  // FAIL-CLOSED (Phase X.4 hardening). A previously fail-open empty/error
  if (!allowed || allowed.size === 0) {
    const CONSERVATIVE_DEFAULT_CLASSES = new Set([
      'physiology',
      'phenology',
      'general',
      'ndvi',
      'weather_damage',
    ]);
    const kept: ObservationCandidate[] = [];
    const dropped: Array<ObservationCandidate & { reason: string }> = [];
    for (const obs of observations) {
      const sc = (obs.semantic_class || '').toLowerCase();
      if (!sc) {
        kept.push(obs);
        ledger?.ignore('SEMANTIC_GATE', `observation:${obs.code}`, 'missing semantic_class metadata');
        continue;
      }
      if (CONSERVATIVE_DEFAULT_CLASSES.has(sc)) {
        kept.push(obs);
      } else {
        const reason = `FAIL_CLOSED conservative default: semantic_class="${sc}" not in {${[...CONSERVATIVE_DEFAULT_CLASSES].join(',')}}`;
        dropped.push({ ...obs, reason });
        ledger?.lose('SEMANTIC_GATE', `observation:${obs.code}`, obs, reason);
      }
    }
    const conf = observations.length === 0 ? 0.5 : Math.min(0.5, kept.length / observations.length);
    chain?.set('semantic', conf);
    console.warn(
      `[BRAIN_TRACE][SEMANTIC_GATE] FAIL_CLOSED intent="${intentKey}" — no/failed allowlist rows; ` +
        `kept=${kept.length} dropped=${dropped.length} conf=${conf.toFixed(3)} (gate_degraded=true)`,
    );
    return {
      kept,
      dropped,
      semanticConfidence: conf,
      fallbackOpen: true,
    };
  }

  const kept: ObservationCandidate[] = [];
  const dropped: Array<ObservationCandidate & { reason: string }> = [];
  for (const obs of observations) {
    const sc = (obs.semantic_class || '').toLowerCase();
    if (!sc) {
      // Unknown semantic_class — keep but log (don't punish missing metadata).
      kept.push(obs);
      ledger?.ignore('SEMANTIC_GATE', `observation:${obs.code}`, 'missing semantic_class metadata');
      continue;
    }
    if (allowed.has(sc)) {
      kept.push(obs);
    } else {
      const reason = `semantic_class="${sc}" not allowed for intent="${intentKey}"`;
      dropped.push({ ...obs, reason });
      ledger?.lose('SEMANTIC_GATE', `observation:${obs.code}`, obs, reason);
    }
  }

  const semanticConfidence = observations.length === 0
    ? 1
    : kept.length / observations.length;
  chain?.set('semantic', semanticConfidence);

  console.log(
    `[BRAIN_TRACE][SEMANTIC_GATE] intent="${intentKey}" kept=${kept.length} ` +
      `dropped=${dropped.length} conf=${semanticConfidence.toFixed(3)}`
  );

  return { kept, dropped, semanticConfidence, fallbackOpen: false };
}
