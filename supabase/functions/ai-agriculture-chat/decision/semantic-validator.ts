/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEMANTIC VALIDATOR — Phase C, gate #1
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs between Observation Extraction and Hypothesis Generation.
 * Drops observations whose `observation_master.semantic_class` is not in
 * `intent_semantic_class_allowlist` for the active intent.
 *
 * Without this gate, an "irrigation_query" intent can pull in pest-class
 * observations and end up generating pest hypotheses — the documented
 * cross-class drift bug.
 *
 * The gate is MANDATORY: callers cannot bypass it. If the allowlist for an
 * intent is empty (DB has no rows), behavior is fail-OPEN (allow all) with
 * a loud warning, so a missing seed never blocks the pipeline.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { EvidenceLedger } from './evidence-ledger.ts';
import type { ConfidenceChain } from './confidence-chain.ts';

export interface ObservationCandidate {
  code: string;
  semantic_class?: string | null;
  confidence?: number;
  source?: string;
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


export async function evaluateSemanticGate(
  input: SemanticGateInput
): Promise<SemanticGateResult> {
  const { intent, observations, supabase, ledger, chain } = input;
  const intentKey = (intent || '').toLowerCase();
  const byIntent = await loadAllowlist(supabase);
  const allowed = byIntent.get(intentKey);

  // FAIL-CLOSED (Phase X.4 hardening). A previously fail-open empty/error
  // allowlist let pest- and disease-class observations through for advisory
  // intents (e.g. GENERAL_CROP_INFO), feeding the diagnosis pipeline with
  // semantically wrong classes. We now apply a conservative default set
  // when the governance table is unseeded or the lookup errored, AND we
  // emit a degraded confidence so downstream gates know not to trust this
  // signal at face value. We never propagate semanticConfidence=1.
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
