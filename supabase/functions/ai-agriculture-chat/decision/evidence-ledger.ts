// EVIDENCE LEDGER — Phase B

export type EvidenceAction =
  | 'CREATE'
  | 'MODIFY'
  | 'LOSE'
  | 'IGNORE'
  | 'OVERWRITE';

export interface EvidenceEntry {
  stage: string;            // e.g. 'OBSERVATION_EXTRACT', 'SEMANTIC_GATE'
  action: EvidenceAction;
  key: string;              // canonical key — e.g. 'observation:leaf_browning'
  before?: unknown;
  after?: unknown;
  confidence?: number;      // 0..1
  source?: string;          // db table or module that produced this evidence
  reason?: string;          // why MODIFY/LOSE/IGNORE/OVERWRITE happened
  at: number;               // epoch ms
}

export class EvidenceLedger {
  private entries: EvidenceEntry[] = [];
  private requestId: string;

  constructor(requestId: string) {
    this.requestId = requestId;
  }

  record(entry: Omit<EvidenceEntry, 'at'>): void {
    const full: EvidenceEntry = { ...entry, at: Date.now() };
    this.entries.push(full);
    // Compact one-line trace for edge logs
    console.log(
      `[BRAIN_TRACE][LEDGER][${this.requestId}] ${entry.stage} ${entry.action} ${entry.key}` +
        (entry.confidence !== undefined ? ` conf=${entry.confidence.toFixed(3)}` : '') +
        (entry.reason ? ` reason="${entry.reason}"` : '')
    );
  }

  /** Convenience helpers — keeps stage code terse. */
  create(stage: string, key: string, after: unknown, opts: Partial<EvidenceEntry> = {}) {
    this.record({ stage, action: 'CREATE', key, after, ...opts });
  }
  modify(stage: string, key: string, before: unknown, after: unknown, opts: Partial<EvidenceEntry> = {}) {
    this.record({ stage, action: 'MODIFY', key, before, after, ...opts });
  }
  lose(stage: string, key: string, before: unknown, reason: string) {
    this.record({ stage, action: 'LOSE', key, before, reason });
  }
  ignore(stage: string, key: string, reason: string) {
    this.record({ stage, action: 'IGNORE', key, reason });
  }
  overwrite(stage: string, key: string, before: unknown, after: unknown, reason: string) {
    this.record({ stage, action: 'OVERWRITE', key, before, after, reason });
  }

  /** Snapshot for persistence into `ai_decision_log.reasoning_trace`. */
  snapshot(): EvidenceEntry[] {
    return [...this.entries];
  }

  /** Quick diff helper for tests / audits. */
  countByAction(): Record<EvidenceAction, number> {
    const acc: Record<EvidenceAction, number> = {
      CREATE: 0, MODIFY: 0, LOSE: 0, IGNORE: 0, OVERWRITE: 0,
    };
    for (const e of this.entries) acc[e.action]++;
    return acc;
  }
}
