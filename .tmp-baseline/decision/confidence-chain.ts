// CONFIDENCE CHAIN — Phase B

export type ConfidenceFactor =
  | 'intent'
  | 'observation'
  | 'semantic'
  | 'hypothesis'
  | 'rule'
  | 'scientific'
  | 'authority';

export interface ConfidenceBreakdown {
  intent: number;
  observation: number;
  semantic: number;
  hypothesis: number;
  rule: number;
  scientific: number;
  authority: number;
}

const NEUTRAL: ConfidenceBreakdown = {
  intent: 1,
  observation: 1,
  semantic: 1,
  hypothesis: 1,
  rule: 1,
  scientific: 1,
  authority: 1,
};

export class ConfidenceChain {
  private values: ConfidenceBreakdown = { ...NEUTRAL };
  private locked = new Set<ConfidenceFactor>();
  private requestId: string;

  constructor(requestId: string) {
    this.requestId = requestId;
  }

  /** Set a stage factor. Throws if the factor was already set (prevents silent overwrite). */
  set(factor: ConfidenceFactor, value: number): void {
    if (this.locked.has(factor)) {
      console.warn(
        `[BRAIN_TRACE][CHAIN][${this.requestId}] REFUSED overwrite of ${factor} ` +
          `(was=${this.values[factor].toFixed(3)} attempted=${value.toFixed(3)})`
      );
      return;
    }
    const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    this.values[factor] = clamped;
    this.locked.add(factor);
    console.log(`[BRAIN_TRACE][CHAIN][${this.requestId}] ${factor}=${clamped.toFixed(3)}`);
  }

  get(factor: ConfidenceFactor): number {
    return this.values[factor];
  }

  /** Multiplicative product of all factors. */
  finalConfidence(): number {
    const v = this.values;
    return v.intent * v.observation * v.semantic * v.hypothesis * v.rule * v.scientific * v.authority;
  }

  breakdown(): ConfidenceBreakdown {
    return { ...this.values };
  }

  /** Snapshot for persistence into `ai_decision_log.confidence_breakdown`. */
  snapshot(): ConfidenceBreakdown & { final: number } {
    return { ...this.values, final: this.finalConfidence() };
  }
}
