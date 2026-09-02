// CHANGE LOG
// 2026-09-02 12:35 UTC — NEW. Deterministic farmer-text sanitizer. Strips audit tags
//   ([EVIDENCE:...], [SOURCE:...], rule ids), moves machine/provenance lines
//   (Source:, ETL:, Dose/acre:, PHI:, Critical soil moisture:) out of farmer
//   instructions into `technical_details`, and expands shorthand (DAS, N/P/K, RDF,
//   PHI) into plain words BEFORE the narration model sees the text.
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
  /^\s*(?:\d+[.)]\s*)?(?:source|evidence|reference|etl|etl\s*threshold|dose\s*\/?\s*acre|dosage(?:\s*per\s*acre)?|phi|pre[- ]harvest\s+interval|critical\s+soil\s+moisture|confidence|rule|rule\s*id)\s*[:\-]/i;

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
 * Expand agronomic shorthand into words. Purely lexical — no number is added,
 * removed or recomputed, so the narration fact-guard still holds.
 */
export function expandShorthand(value: string): string {
  let out = value;
  out = out.replace(/\bDAT\s*(\d+)/gi, "$1 days after transplanting");
  out = out.replace(/\bDAS\s*(\d+)/gi, "$1 days after sowing");
  out = out.replace(/\bfrom\s+(\d+)\s+days after sowing\s+to\s+(\d+)\b/gi, "from day $1 to day $2 after sowing");
  out = out.replace(/\bDAS\b/gi, "days after sowing");
  out = out.replace(/\bDAT\b/gi, "days after transplanting");
  out = out.replace(/\bRDF\b/g, "recommended fertilizer dose");
  out = out.replace(/\bPHI\b/g, "waiting days before harvest");
  out = out.replace(/\bETL\b/g, "action threshold");
  out = out.replace(/\bNPK\b/g, "Nitrogen, Phosphorus and Potassium");
  // Standalone nutrient letters only (never inside a word or a code like N35).
  out = out.replace(/(^|[\s(])N(?=[\s,)/.]|$)/g, "$1Nitrogen (N)");
  out = out.replace(/(^|[\s(])P(?=[\s,)/.]|$)/g, "$1Phosphorus (P)");
  out = out.replace(/(^|[\s(])K(?=[\s,)/.]|$)/g, "$1Potassium (K)");
  return out.replace(/\s{2,}/g, " ").trim();
}

function clean(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  const stripped = stripTags(s);
  if (!stripped || stripped.toLowerCase() === "null" || stripped.toLowerCase() === "undefined") return "";
  return stripped;
}

export function isTechnicalLine(line: string): boolean {
  return TECHNICAL_LINE.test(line);
}

/**
 * Split a task's text into farmer-facing text and technical detail.
 * Names/descriptions keep their meaning; only tags and shorthand change.
 */
export function sanitizeTaskText(task: {
  task_name?: string;
  task_description?: string;
  instructions?: unknown;
}): SanitizedTaskText {
  const farmer: string[] = [];
  const technical: string[] = [];

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

  return {
    task_name: expandShorthand(clean(task.task_name)),
    task_description: expandShorthand(clean(task.task_description)),
    instructions: farmer,
    technical_details: technical,
  };
}
