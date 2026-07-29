// REQUEST CONTEXT — Phase B wiring

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
