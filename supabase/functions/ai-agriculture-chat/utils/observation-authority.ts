/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OBSERVATION AUTHORITY SYSTEM (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tracks the epistemic source and authority level of each observation symbol.
 * Ensures the Terminal Damage Gate only fires on farmer-confirmed evidence,
 * not on alias expansions, cross-crop injections, or LLM inferences.
 * 
 * Authority hierarchy (highest to lowest):
 * - CONFIRMED: Clarification selection, explicit farmer statement, photo-verified
 * - EXTRACTED: Pattern match from farmer's raw text (induction, cross-crop on raw text)
 * - INFERRED: Alias expansion, LLM semantic extraction, intent-to-observation mapping
 * - SYNTHETIC: Cross-crop injection, obsKeyExpansion, router fallback injection
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const OBSERVATION_AUTHORITY_VERSION = '1.0.0';

/**
 * Authority levels for observation symbols.
 * Higher authority = more trustworthy for terminal gate decisions.
 */
export enum ObservationAuthority {
  /** Farmer explicitly confirmed via clarification selection, direct statement, or photo */
  CONFIRMED = 'CONFIRMED',
  /** Pattern-matched from farmer's raw text (language induction, cross-crop mapper on raw text) */
  EXTRACTED = 'EXTRACTED',
  /** Alias expansion, LLM semantic extraction, intent-to-observation mapping */
  INFERRED = 'INFERRED',
  /** Cross-crop injection, obsKeyExpansion, router fallback injection */
  SYNTHETIC = 'SYNTHETIC',
  /**
   * Hypothesis-only candidate. Sourced from intent_observation_mapping,
   * hypothesis_master differentiating observations, or canonical→alias fan-out.
   * MUST NEVER reach confirmedObservations, terminal gates, or rule firing.
   * Used only to seed clarification questions and weight hypothesis scoring.
   */
  HYPOTHESIS_CANDIDATE = 'HYPOTHESIS_CANDIDATE'
}

/** Numeric rank for authority comparison (higher = more authoritative) */
const AUTHORITY_RANK: Record<ObservationAuthority, number> = {
  [ObservationAuthority.CONFIRMED]: 5,
  [ObservationAuthority.EXTRACTED]: 4,
  [ObservationAuthority.INFERRED]: 3,
  [ObservationAuthority.SYNTHETIC]: 2,
  [ObservationAuthority.HYPOTHESIS_CANDIDATE]: 1
};

/**
 * A single observation with its authority metadata.
 */
export interface AuthoredObservation {
  code: string;
  authority: ObservationAuthority;
  source: string; // e.g., "CLARIFICATION_SELECTION", "ALIAS_EXPANSION", "CROSS_CROP_MAPPER"
}

/**
 * AuthoredObservationSet - Tracks observations with their authority levels.
 * 
 * When duplicate codes are added, the highest authority wins.
 * Provides filtered views for different consumers:
 * - Terminal gate: only CONFIRMED (+ optionally EXTRACTED)
 * - Rule engine: all codes (flat set)
 */
export class AuthoredObservationSet {
  private observations: Map<string, AuthoredObservation> = new Map();

  /**
   * Add an observation with its authority level and source.
   * If the code already exists, the higher authority wins.
   */
  add(code: string, authority: ObservationAuthority, source: string): void {
    const existing = this.observations.get(code);
    if (existing) {
      // Keep the higher authority
      if (AUTHORITY_RANK[authority] > AUTHORITY_RANK[existing.authority]) {
        this.observations.set(code, { code, authority, source });
      }
    } else {
      this.observations.set(code, { code, authority, source });
    }
  }

  /**
   * Add multiple codes with the same authority and source.
   */
  addAll(codes: Iterable<string>, authority: ObservationAuthority, source: string): void {
    for (const code of codes) {
      this.add(code, authority, source);
    }
  }

  /** Get only CONFIRMED codes (farmer-verified evidence). */
  getConfirmedCodes(): string[] {
    return this.getCodesByAuthority(ObservationAuthority.CONFIRMED);
  }

  /** Get CONFIRMED + EXTRACTED codes (direct evidence from farmer input). */
  getConfirmedAndExtractedCodes(): string[] {
    return [...this.observations.values()]
      .filter(obs => 
        obs.authority === ObservationAuthority.CONFIRMED || 
        obs.authority === ObservationAuthority.EXTRACTED
      )
      .map(obs => obs.code);
  }

  /** Get codes suitable for the Terminal Damage Gate (CONFIRMED + EXTRACTED only). */
  getCodesForTerminalGate(): string[] {
    return this.getConfirmedAndExtractedCodes();
  }

  /** Get all codes regardless of authority (for rule evaluation). */
  getAllCodes(): string[] {
    return [...this.observations.keys()];
  }

  /** Get codes filtered by specific authority level. */
  getCodesByAuthority(authority: ObservationAuthority): string[] {
    return [...this.observations.values()]
      .filter(obs => obs.authority === authority)
      .map(obs => obs.code);
  }

  /** Get the full authored observation for a code. */
  get(code: string): AuthoredObservation | undefined {
    return this.observations.get(code);
  }

  /** Check if a code exists at any authority level. */
  has(code: string): boolean {
    return this.observations.has(code);
  }

  /** Total number of unique observation codes. */
  get size(): number {
    return this.observations.size;
  }

  /** Backward-compatible flat Set<string> for consumers that don't need authority. */
  toFlatSet(): Set<string> {
    return new Set(this.observations.keys());
  }

  /** Get a summary for logging. */
  toSummary(): string {
    const confirmed = this.getCodesByAuthority(ObservationAuthority.CONFIRMED);
    const extracted = this.getCodesByAuthority(ObservationAuthority.EXTRACTED);
    const inferred = this.getCodesByAuthority(ObservationAuthority.INFERRED);
    const synthetic = this.getCodesByAuthority(ObservationAuthority.SYNTHETIC);
    
    const parts: string[] = [];
    if (confirmed.length > 0) parts.push(`CONFIRMED(${confirmed.length}): [${confirmed.join(', ')}]`);
    if (extracted.length > 0) parts.push(`EXTRACTED(${extracted.length}): [${extracted.join(', ')}]`);
    if (inferred.length > 0) parts.push(`INFERRED(${inferred.length}): [${inferred.join(', ')}]`);
    if (synthetic.length > 0) parts.push(`SYNTHETIC(${synthetic.length}): [${synthetic.join(', ')}]`);
    
    return parts.join(' | ') || 'EMPTY';
  }

  /** Get all observations with their metadata (for auditing). */
  toArray(): AuthoredObservation[] {
    return [...this.observations.values()];
  }
}

/**
 * Terminal-level codes that must NEVER be injected via cross-crop or synthetic sources.
 * These require explicit farmer confirmation to trigger the Terminal Damage Gate.
 */
export const TERMINAL_CODES_BLOCKED_FROM_INJECTION = new Set([
  'PLANT_DEATH',
  'SEEDLING_DEATH',
  'GERMINATION_FAILURE',
  'CROP_FAILURE',
  'ESTABLISHMENT_FAILURE',
  'PLANT_DIED',
  'SEEDLING_DIED',
  'DEAD_SEEDLINGS',
  'COMPLETE_DRYING'
]);
