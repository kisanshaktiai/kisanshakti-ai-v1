// CHANGE LOG
// 2026-09-03 06:10 UTC — Forensic fix (audit 2026-09-03): the single-letter N/P/K
//   expansion is REMOVED. It corrupted legitimate DB prose and task titles
//   ("Fertilizer application (Nitrogen (N))", "fixes 30-40 kg Nitrogen (N)/ha").
//   Only whole-token shorthand is expanded now. Machine-coded lines
//   ("tungro_yellow_stunt: GLH vector presence") are detected as technical and
//   moved out of the farmer instruction list, and a farmer-text emptiness probe
//   is exported so index.ts can record a gap instead of persisting a blank card.
// 2026-09-02 12:35 UTC — NEW. Deterministic farmer-text sanitizer. Strips audit tags
//   ([EVIDENCE:...], [SOURCE:...], rule ids), moves provenance lines
//   (Source:, ETL:, Dose/acre:, PHI:, Critical soil moisture:) into `technical_details`,
//   and expands shorthand (DAS, DAT, RDF, PHI, ETL) into plain words BEFORE narration.
//   No agronomic value is changed — numbers are never touched.

export interface SanitizedTaskText {
  task_name: string;
  task_description: string;
  instructions: string[];
  /** Provenance / agronomic-audit lines. Kept, but not farmer headline text. */
  technical_details: string[];
}

const AUDIT_TAG = /\[(?:evidence|source|ref|rule|rule_id|audit)\s*:[^\]]*\]/gi;
const BARE_BRACKET_CODE = /\[[A-Z0-9][A-Z0-9_\-.:/]{2,}\]/g;

/** Lines that are provenance or machine-facing detail, not a farmer action. */
const TECHNICAL_LINE =
  /^\s*(?:\d+[.)]\s*)?(?:source|evidence|reference|etl|etl\s*threshold|dose\s*\/?\s*acre|dosage(?:\s*per\s*acre)?|phi|pre[- ]harvest\s+interval|critical\s+soil\s+moisture|confidence|rule|rule\s*id|derivation|seed\s*rate\s*basis)\s*[:\-]/i;

/**
 * A snake_case identifier used as a label ("tungro_yellow_stunt: 5-10/hill").
 * Requires an underscore so ordinary sentences ("Note: ...") are never captured.
 */
const MACHINE_CODE_LINE = /^\s*[a-z0-9]+(?:_[a-z0-9]+)+\s*:/;

function stripTags(value: string): string {
  return value
    .replace(AUDIT_TAG, " ")
    .replace(BARE_BRACKET_CODE, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}

/**
 * Expand agronomic shorthand into words. Purely lexical whole-token replacement —
 * no number is added, removed or recomputed, so the narration fact-guard still holds.
 * Single letters (N, P, K) are deliberately NOT expanded: doing so rewrote DB prose
 * and task titles (see change log 2026-09-03).
 */
export function expandShorthand(value: string): string {
  let out = value;
  out = out.replace(/\bDAT\s*(\d+)/gi, "$1 days after transplanting");
  out = out.replace(/\bDAS\s*(\d+)/gi, "$1 days after sowing");
  out = out.replace(/\bfrom\s+(\d+)\s+days after sowing\s+to\s+(\d+)\b/gi, "from day $1 to day $2 after sowing");
  out = out.replace(/\bDAS\b/g, "days after sowing");
  out = out.replace(/\bDAT\b/g, "days after transplanting");
  out = out.replace(/\bRDF\b/g, "recommended fertilizer dose");
  out = out.replace(/\bPHI\b/g, "waiting days before harvest");
  out = out.replace(/\bETL\b/g, "action threshold");
  out = out.replace(/\bNPK\b/g, "Nitrogen, Phosphorus and Potassium");
  return out.replace(/\s{2,}/g, " ").trim();
}

function clean(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  const stripped = stripTags(s);
  if (!stripped || stripped.toLowerCase() === "null" || stripped.toLowerCase() === "undefined") return "";
  return stripped;
}

export function isTechnicalLine(line: string): boolean {
  return TECHNICAL_LINE.test(line) || MACHINE_CODE_LINE.test(line);
}

/**
 * Split a task's text into farmer-facing text and technical detail.
 * Names/descriptions keep their meaning; only tags and shorthand change.
 */
export function sanitizeTaskText(task: {
  task_name?: string;
  task_description?: string;
  instructions?: unknown;
  technical_details?: unknown;
}): SanitizedTaskText {
  const farmer: string[] = [];
  const technical: string[] = (Array.isArray(task.technical_details) ? task.technical_details : [])
    .map(clean)
    .filter(Boolean);

  const rawInstructions = Array.isArray(task.instructions) ? task.instructions : [];
  for (const raw of rawInstructions) {
    const line = clean(raw);
    if (!line) continue;
    if (isTechnicalLine(line)) {
      technical.push(line);
      continue;
    }
    farmer.push(expandShorthand(line));
  }

  const description = clean(task.task_description);

  return {
    task_name: expandShorthand(clean(task.task_name)),
    task_description: isTechnicalLine(description) ? "" : expandShorthand(description),
    instructions: farmer,
    technical_details: [...new Set(technical)],
  };
}

/** True when a task has no readable farmer text at all (blank-card guard). */
export function hasFarmerText(t: SanitizedTaskText): boolean {
  return Boolean(t.task_description.trim()) || t.instructions.length > 0;
}
