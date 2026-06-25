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

  // Fail-open when the allowlist is unseeded — never block diagnosis on
  // an empty governance table. Logged loudly so it's caught in audits.
  if (!allowed || allowed.size === 0) {
    console.warn(
      `[BRAIN_TRACE][SEMANTIC_GATE] FAIL_OPEN intent="${intentKey}" — no allowlist rows; ` +
        `keeping ${observations.length} observations.`
    );
    chain?.set('semantic', 1);
    return {
      kept: observations,
      dropped: [],
      semanticConfidence: 1,
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
