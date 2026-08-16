// FARMER TEXT FILTER — brain-only text must never reach the farmer message.
//
// CHANGE LOG
// 2026-08-16 15:40 UTC — created. FIX A: strip diagnosis-category action_text
//   (differential reasoning) and knowledge_text (internal scientific notes)
//   from every farmer-facing renderer; one-line clamp for secondary findings.

/** True when a rule (or matched response) is a brain-only DIAGNOSIS rule. */
export function isDiagnosisRule(ruleLike: any): boolean {
  if (!ruleLike) return false;
  const fields = [
    ruleLike.category,
    ruleLike.rule_category,
    ruleLike.semantic_class,
    ruleLike.rule_type,
  ];
  for (const f of fields) {
    if (typeof f === 'string' && /diagnos/i.test(f)) return true;
  }
  const rid = String(ruleLike.rule_id ?? '');
  return /_DIAG(NOSIS)?_/i.test(rid);
}

/** True when text is internal differential/decision reasoning, not farmer advice. */
export function isDifferentialText(text: unknown): boolean {
  if (typeof text !== 'string' || !text.trim()) return false;
  return /(^|\s)differential\b|\bdifferentiate\b|(^|\n)\s*ask\s*:|\brule\s+out\b|\bnext\s+steps?\s*:/i.test(text);
}

/**
 * Farmer-safe action text. Returns '' for diagnosis rules or differential
 * reasoning blobs so the renderer simply omits the section.
 */
export function farmerSafeActionText(text: unknown, ruleLike?: any): string {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return '';
  if (isDiagnosisRule(ruleLike)) {
    console.log(`[FARMER_TEXT_FILTER] dropped diagnosis action_text rule=${ruleLike?.rule_id ?? 'UNKNOWN'}`);
    return '';
  }
  if (isDifferentialText(t)) {
    console.log(`[FARMER_TEXT_FILTER] dropped differential text rule=${ruleLike?.rule_id ?? 'UNKNOWN'}`);
    return '';
  }
  return t;
}

/** Clamp secondary findings to a single short line (dose + timing only). */
export function oneLine(text: unknown, max = 160): string {
  const t = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!t) return '';
  const firstSentence = t.split(/(?<=[.।!?])\s/)[0] || t;
  const out = firstSentence.length > max ? `${firstSentence.slice(0, max - 1).trim()}…` : firstSentence;
  return out;
}
