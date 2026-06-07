// ═══════════════════════════════════════════════════════════════════════════
// VARIETY ASSERTION GUARD (deterministic)
// ───────────────────────────────────────────────────────────────────────────
// Two pure, side-effect-free assertions that the symbolic decision brain
// graph (and its rendered narration) actually honour the resolved variety
// profile fields. Used as a hard gate around the LLM formatter so the
// system refuses to ship a response that omits or contradicts the variety
// SSOT.
//
// Contract:
//   • assertVarietyInjected   — pre-LLM gate. Verifies the variety profile
//                               actually reached the formatter / symbolic
//                               brain input. Fails closed when an upstream
//                               variety_profile silently went missing.
//   • assertResponseHonorsVariety — post-LLM gate. Scans the rendered text
//                               for omission (variety never named) and
//                               contradictions (maturity windows wildly
//                               outside DB SSOT, resistance flipped to
//                               susceptibility).
//
// Both return { passed, violations[] } — never throw. Caller decides the
// remediation (template fallback, error, etc.).
// ═══════════════════════════════════════════════════════════════════════════

import type { VarietyProfile } from "./variety-context.ts";

export interface VarietyAssertionResult {
  passed: boolean;
  violations: string[];
  checked: {
    name_mentioned: boolean;
    maturity_consistent: boolean | null; // null = not asserted by response
    resistance_consistent: boolean | null;
  };
}

const RESISTANT_LEVELS = new Set([
  "resistant", "r", "highly_resistant", "highly resistant", "hr", "tolerant", "t",
]);

const SUSCEPTIBLE_PHRASES = [
  /highly\s+susceptible\s+to\s+([a-z0-9 _\-]+)/gi,
  /very\s+susceptible\s+to\s+([a-z0-9 _\-]+)/gi,
  /susceptible\s+to\s+([a-z0-9 _\-]+)/gi,
];

// Devanagari + Latin digit normalisation
const DEVA_DIGIT_MAP: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};
function toAsciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => DEVA_DIGIT_MAP[d] ?? d);
}

function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, "");
}

/**
 * Pre-LLM / pre-symbolic-graph assertion.
 *
 * If the orchestrator resolved a variety_profile on the land context, that
 * same profile MUST appear on the input shipped to the symbolic brain /
 * LLM formatter. A silent drop here is a regression — the brain would
 * reason without variety SSOT.
 */
export function assertVarietyInjected(input: {
  land_context_variety_profile?: VarietyProfile | null | undefined;
  formatter_variety_profile?: VarietyProfile | null | undefined;
  decision_context_variety?: unknown;
}): VarietyAssertionResult {
  const violations: string[] = [];
  const land = input.land_context_variety_profile;
  const fmt = input.formatter_variety_profile;

  if (land && !fmt) {
    violations.push(
      `VARIETY_INJECTION_DROPPED: land_context has variety_profile (${land.name}) ` +
      `but formatter input does not. Symbolic brain will reason without variety SSOT.`,
    );
  }

  if (land && fmt && land.variety_id !== fmt.variety_id) {
    violations.push(
      `VARIETY_INJECTION_MISMATCH: land=${land.variety_id} formatter=${fmt.variety_id}`,
    );
  }

  return {
    passed: violations.length === 0,
    violations,
    checked: {
      name_mentioned: false,
      maturity_consistent: null,
      resistance_consistent: null,
    },
  };
}

/**
 * Post-LLM assertion. Scans the rendered farmer-facing text against the
 * variety SSOT for omission + contradiction. Designed to be cheap and
 * deterministic — no LLM, no DB.
 *
 * Returns passed=true (with no violations) when no variety_profile is
 * attached — there is nothing to honour or contradict.
 */
export function assertResponseHonorsVariety(
  responseText: string,
  variety: VarietyProfile | null | undefined,
): VarietyAssertionResult {
  const result: VarietyAssertionResult = {
    passed: true,
    violations: [],
    checked: {
      name_mentioned: false,
      maturity_consistent: null,
      resistance_consistent: null,
    },
  };

  if (!variety) return result;
  if (!responseText || typeof responseText !== "string") {
    result.passed = false;
    result.violations.push("VARIETY_OMISSION: empty response cannot honour variety profile");
    return result;
  }

  const haystackRaw = responseText;
  const haystackAscii = toAsciiDigits(haystackRaw);
  const haystackNorm = norm(haystackRaw);

  // ── 1. OMISSION CHECK ────────────────────────────────────────────────
  // Response must mention at least one of: name / code / localized label
  const labels = [variety.name, variety.variety_code, variety.label_hi, variety.label_mr]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0);

  const nameMentioned = labels.some((label) => {
    const n = norm(label);
    if (!n) return false;
    if (haystackNorm.includes(n)) return true;
    // Also allow raw substring (handles spaces / punctuation in original text)
    return haystackRaw.toLowerCase().includes(label.toLowerCase());
  });
  result.checked.name_mentioned = nameMentioned;

  if (!nameMentioned) {
    result.violations.push(
      `VARIETY_OMISSION: response does not mention variety name/code "${variety.name}" ` +
      `(${variety.variety_code || "-"}). Variety SSOT not honoured.`,
    );
  }

  // ── 2. MATURITY CONTRADICTION CHECK ──────────────────────────────────
  const minD = variety.maturity_days_min ?? null;
  const maxD = variety.maturity_days_max ?? null;

  if (minD || maxD) {
    // Find "N days" / "N day" / "N दिवस" / "N दिन" mentions
    const dayMatches = Array.from(
      haystackAscii.matchAll(/(\d{2,4})\s*(?:days?|day|दिवस|दिन)/gi),
    ).map((m) => parseInt(m[1], 10)).filter((n) => Number.isFinite(n));

    if (dayMatches.length > 0) {
      // Allow ±15% grace; if a stated number sits entirely outside
      // [min*0.85, max*1.15] we treat it as a contradiction of SSOT.
      const lo = (minD ?? maxD ?? 0) * 0.85;
      const hi = (maxD ?? minD ?? 0) * 1.15;
      const offenders = dayMatches.filter((n) => n < lo || n > hi);
      // Only flag when EVERY mentioned number is offending — otherwise we
      // probably hit unrelated day references (PHI, irrigation intervals).
      const allOffend = offenders.length === dayMatches.length;
      result.checked.maturity_consistent = !allOffend;
      if (allOffend && offenders.length > 0) {
        result.violations.push(
          `VARIETY_MATURITY_CONTRADICTION: response cites ${offenders.join("/")}d, ` +
          `variety SSOT maturity window is ${minD ?? "?"}-${maxD ?? "?"}d.`,
        );
      }
    } else {
      result.checked.maturity_consistent = null;
    }
  }

  // ── 3. RESISTANCE CONTRADICTION CHECK ────────────────────────────────
  const resistantPathogens = (variety.resistance || [])
    .filter((r) => r && r.pathogen && RESISTANT_LEVELS.has(String(r.level || "").toLowerCase().trim()))
    .map((r) => norm(r.pathogen));

  if (resistantPathogens.length > 0) {
    let contradiction = false;
    for (const pat of SUSCEPTIBLE_PHRASES) {
      for (const m of haystackRaw.matchAll(pat)) {
        const claimedSusceptible = norm(m[1] || "");
        if (!claimedSusceptible) continue;
        if (resistantPathogens.some((rp) => claimedSusceptible.includes(rp) || rp.includes(claimedSusceptible))) {
          result.violations.push(
            `VARIETY_RESISTANCE_CONTRADICTION: response labels variety susceptible to ` +
            `"${m[1].trim()}" but variety_resistance marks it RESISTANT.`,
          );
          contradiction = true;
        }
      }
    }
    result.checked.resistance_consistent = !contradiction;
  }

  result.passed = result.violations.length === 0;
  return result;
}
