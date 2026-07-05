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
  SYNTHETIC = 'SYNTHETIC'
}

/** Numeric rank for authority comparison (higher = more authoritative) */
const AUTHORITY_RANK: Record<ObservationAuthority, number> = {
  [ObservationAuthority.CONFIRMED]: 4,
  [ObservationAuthority.EXTRACTED]: 3,
  [ObservationAuthority.INFERRED]: 2,
  [ObservationAuthority.SYNTHETIC]: 1
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
 * PATCH 4 (BUG 4) — Static terminal-code allowlist REMOVED.
 *
 * Injection admissibility is now decided by the DB:
 *   - `intent_observation_mapping.is_active`
 *   - `observation_master.can_generate_question`
 *   - `observation_master.is_farmer_observable`
 *
 * The previous hardcoded Set silently blocked legitimate cross-crop LITERAL
 * peers such as GERMINATION_FAILURE for RICE_EMERGENCE_FAILURE. Keeping a
 * runtime agriculture gate here violated the DB-is-brain contract.
 */
export const TERMINAL_CODES_BLOCKED_FROM_INJECTION: ReadonlySet<string> = new Set<string>();
