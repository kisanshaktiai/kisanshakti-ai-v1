/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REQUEST CONTEXT — Phase B wiring
 * ═══════════════════════════════════════════════════════════════════════════
 * One per orchestrator turn. Bundles EvidenceLedger + ConfidenceChain so
 * every stage shares a single observability + confidence backbone instead
 * of recomputing values in isolation.
 *
 * Usage:
 *   const ctx = createRequestContext(traceId);
 *   ctx.ledger.create('OBSERVATION_EXTRACT', 'obs:leaf_browning', payload);
 *   ctx.chain.set('observation', 0.82);
 *   // ... later ...
 *   const final = ctx.chain.finalConfidence();
 *   const trace = ctx.ledger.snapshot();
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { EvidenceLedger } from './evidence-ledger.ts';
import { ConfidenceChain } from './confidence-chain.ts';

export interface RequestContext {
  requestId: string;
  ledger: EvidenceLedger;
  chain: ConfidenceChain;
  startedAt: number;
}

export function createRequestContext(requestId: string): RequestContext {
  return {
    requestId,
    ledger: new EvidenceLedger(requestId),
    chain: new ConfidenceChain(requestId),
    startedAt: Date.now(),
  };
}

export function snapshotContext(ctx: RequestContext) {
  return {
    request_id: ctx.requestId,
    confidence: ctx.chain.snapshot(),
    evidence: ctx.ledger.snapshot(),
    evidence_counts: ctx.ledger.countByAction(),
    elapsed_ms: Date.now() - ctx.startedAt,
  };
}
