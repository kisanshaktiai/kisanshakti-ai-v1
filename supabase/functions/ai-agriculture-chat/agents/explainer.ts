/**
 * EXPLAINER — layer 3 of the neuro-symbolic brain (2026-09-09, replaces the curated farmer_glossary approach).
 *
 * ARCHITECTURE
 *   Layer 1 (LLM)      : farmer's words, any language → intent + observations.
 *   Layer 2 (symbolic) : hypotheses + SSOT + decision_rules → ONE decision. All agronomy is decided here.
 *   Layer 3 (LLM, this): explains that decision in the farmer's language. It may not add, remove or alter a fact.
 *
 * WHY NO WORD LIST. A curated term table caps the app at the languages and crops someone hand-seeded, which
 * breaks both the language-agnostic and the crop-agnostic policy. The model already knows how a farmer speaks in
 * every one of these languages; what it lacked was (a) instruction by MEANING instead of an English string to
 * translate, and (b) verification. So the symbolic layer emits a semantic FACT FRAME — each fact carries its
 * role, its concept type, its canonical code and its quantities — and this module instructs by meaning, then
 * verifies deterministically (facts and numbers, language-independent) and linguistically (a critic pass in the
 * same language that finds English-words-written-in-the-local-script without any hardcoded list), then repairs.
 * Nothing here names a language, a crop, a pest or a term.
 */

export type FactRole = 'situation' | 'cause' | 'action' | 'input' | 'method' | 'safety' | 'check' | 'note';
export type ConceptType = 'pest' | 'disease' | 'deficiency' | 'stage' | 'practice' | 'product' | 'measure' | 'other';

export interface Fact {
  role: FactRole;
  concept?: ConceptType;
  code?: string | null;        // canonical DB code — lets the model know two facts are the same thing
  gloss: string;               // the DB's own wording (usually English). NEVER shown to the farmer as-is.
  quantities?: Array<{ value: number; unit: string; basis?: string }>;
}
export interface FactFrame {
  kind: 'ADVICE' | 'DO_NOT' | 'INFO';
  crop?: string | null; stage?: string | null; das?: number | null; area_acres?: number | null;
  facts: Fact[];
  rule_id?: string | null;
}
export interface ExplainedCard {
  greeting: string; what_happened: string; why: string; how_to_fix: string;
  how_lines: string[]; extras: Array<{ title: string; text: string }>;
  explained_by: 'LLM' | 'LLM_REPAIRED' | 'FACTS_ONLY';
  verification: { numbers_ok: boolean; script_ok: boolean; critic_flags: string[]; attempts: number };
}

/* ── quantity extraction: unit-agnostic, no vocabulary ─────────────────────────────────────────── */
const QTY = /(\d+(?:[.,]\d+)?)\s*([^\s\d,.;:()]{1,12})/gu;
export function quantitiesOf(text: string): Array<{ value: number; unit: string }> {
  const out: Array<{ value: number; unit: string }> = [];
  for (const m of String(text ?? '').matchAll(QTY)) out.push({ value: parseFloat(m[1].replace(',', '.')), unit: m[2].toLowerCase() });
  return out;
}
/** Every number in the explanation must be a fact quantity, or a fact quantity × land area. Language-independent. */
export function numbersBacked(text: string, frame: FactFrame): { ok: boolean; offending: string[] } {
  const allowed: number[] = [];
  for (const f of frame.facts) for (const q of (f.quantities ?? [])) {
    allowed.push(q.value);
    const a = Number(frame.area_acres ?? NaN);
    if (Number.isFinite(a) && a > 0) for (const dp of [0, 1, 2]) allowed.push(Number((q.value * a).toFixed(dp)));
  }
  if (Number.isFinite(Number(frame.das))) allowed.push(Number(frame.das));
  if (Number.isFinite(Number(frame.area_acres))) allowed.push(Number(frame.area_acres));
  const offending: string[] = [];
  for (const q of quantitiesOf(text)) {
    if (!allowed.some(a => Math.abs(a - q.value) < 1e-9)) offending.push(`${q.value}${q.unit}`);
  }
  return { ok: offending.length === 0, offending };
}
/**
 * Script integrity, list-free: in a non-Latin target language, a Latin-script token is acceptable ONLY if it
 * appears verbatim in the facts (brand names, formulation codes, units the DB itself wrote). Anything else is
 * an English word that leaked through — no vocabulary needed to catch it.
 */
export function scriptIntegrity(text: string, frame: FactFrame, targetIsLatin: boolean): { ok: boolean; leaks: string[] } {
  if (targetIsLatin) return { ok: true, leaks: [] };
  const factCorpus = frame.facts.map(f => `${f.gloss} ${(f.quantities ?? []).map(q => q.unit).join(' ')}`).join(' ').toLowerCase();
  const leaks = new Set<string>();
  for (const m of String(text ?? '').matchAll(/[A-Za-z][A-Za-z.\-]{1,}/g)) {
    const w = m[0]; if (factCorpus.includes(w.toLowerCase())) continue;
    leaks.add(w);
  }
  return { ok: leaks.size === 0, leaks: Array.from(leaks) };
}

/* ── prompts: instruct by MEANING, never by word list, never naming a language or crop ─────────── */
function systemPrompt(langCode: string): string {
  return [
    `You are the voice of a village agriculture advisor speaking to a farmer. The farmer's language code is "${langCode}". Write ONLY in that language.`,
    `You are an EXPLAINER. Every agronomic decision has already been made by the system and is given to you as FACTS.`,
    `You may not add, remove, generalise or alter any fact. No extra advice, no extra product, no extra reason, no extra safety note.`,
    `HOW TO SPEAK:`,
    `- Use the word a farmer of that language actually uses in the field for each concept. Not the textbook word, and never an English word written in that language's script.`,
    `- If you do not know a farmer's word for a concept, explain it in three or four simple words of that language instead of borrowing the English one.`,
    `- Address the farmer the way a respected younger advisor addresses an adult farmer in that language and culture. Never casual or familiar.`,
    `- Short sentences. One idea per sentence. A farmer with a few years of schooling must understand it on first reading.`,
    `- Keep product brand names and measurement units exactly as they appear in the facts. Keep all numbers exactly as given; you may also state the total for the land area when the area is provided.`,
    `Return ONLY a JSON object: {"greeting","what_happened","why","how_to_fix","how_lines":[],"extras":[{"title","text"}]}.`,
    `greeting = the respectful opening line. what_happened = the situation facts. why = the cause facts. how_to_fix = the action facts in plain words. how_lines = one short line per input/method/safety/check fact, in the order given. extras = the note facts.`,
  ].join('\n');
}
function criticPrompt(langCode: string): string {
  return [
    `You check text written for a farmer whose language code is "${langCode}".`,
    `Find ONLY these problems and list the exact offending words:`,
    `1. an English or technical word written in this language's script instead of the word farmers really use;`,
    `2. an abbreviation or acronym a farmer would not know;`,
    `3. a textbook or scientific word where an everyday farming word exists in this language;`,
    `4. wording that addresses the farmer casually or disrespectfully.`,
    `Do not comment on agronomy, correctness, numbers or completeness — those are verified elsewhere.`,
    `Return ONLY JSON: {"flags":[{"span":"<offending word>","fix":"<the word or short phrase a farmer of this language would use>"}]}. Empty list if the text is already farmer's language.`,
  ].join('\n');
}

const LATIN_SCRIPT_LANGS = new Set(['en']); // a language is treated as Latin-script only when the app says so

export async function explainDecision(opts: {
  frame: FactFrame; lang: string;
  llm: (system: string, user: string) => Promise<string>;
  factsOnlyCard: Omit<ExplainedCard, 'explained_by' | 'verification'>;
  traceId?: string; maxRepairs?: number;
}): Promise<ExplainedCard> {
  const { frame, lang, llm } = opts;
  const targetIsLatin = LATIN_SCRIPT_LANGS.has(String(lang).toLowerCase());
  const factsOnly: ExplainedCard = { ...opts.factsOnlyCard, explained_by: 'FACTS_ONLY', verification: { numbers_ok: true, script_ok: true, critic_flags: [], attempts: 0 } };
  const userPrompt = `FACTS (the only source of truth):\n${JSON.stringify(frame, null, 1)}`;
  const maxRepairs = opts.maxRepairs ?? 1;
  let attempts = 0; let critique: string[] = [];

  let draft: any = null;
  let repairNote = '';
  while (attempts <= maxRepairs) {
    attempts++;
    let raw: string;
    try { raw = await llm(systemPrompt(lang), userPrompt + repairNote); }
    catch (e) { console.warn(`[EXPLAINER] generate failed (${(e as Error)?.message ?? e}) — facts-only card used`); return { ...factsOnly, verification: { ...factsOnly.verification, attempts } }; }
    try { draft = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
    catch { console.warn('[EXPLAINER] non-JSON output — facts-only card used'); return { ...factsOnly, verification: { ...factsOnly.verification, attempts } }; }

    const joined = [draft.greeting, draft.what_happened, draft.why, draft.how_to_fix, ...(draft.how_lines ?? []), ...(draft.extras ?? []).map((e: any) => e?.text)].filter(Boolean).join('\n');
    const nums = numbersBacked(joined, frame);
    const script = scriptIntegrity(joined, frame, targetIsLatin);

    // linguistic critic — same model, same language, no word list
    critique = [];
    try {
      const cRaw = await llm(criticPrompt(lang), joined);
      const cj = JSON.parse(cRaw.replace(/```json|```/g, '').trim());
      critique = Array.isArray(cj?.flags) ? cj.flags.filter((f: any) => f?.span).map((f: any) => `${f.span}→${f.fix ?? ''}`) : [];
    } catch { /* critic is advisory; its absence never blocks a valid draft */ }

    const clean = nums.ok && script.ok && critique.length === 0;
    if (clean) {
      console.log(`[EXPLAINER] trace=${opts.traceId ?? '-'} lang=${lang} attempts=${attempts} verified`);
      return { greeting: draft.greeting ?? factsOnly.greeting, what_happened: draft.what_happened ?? '', why: draft.why ?? '', how_to_fix: draft.how_to_fix ?? '',
        how_lines: Array.isArray(draft.how_lines) ? draft.how_lines.map(String) : factsOnly.how_lines,
        extras: Array.isArray(draft.extras) ? draft.extras.filter((e: any) => e?.text).map((e: any) => ({ title: String(e.title ?? ''), text: String(e.text) })) : factsOnly.extras,
        explained_by: attempts > 1 ? 'LLM_REPAIRED' : 'LLM',
        verification: { numbers_ok: true, script_ok: true, critic_flags: [], attempts } };
    }

    if (!nums.ok) {
      // a number that is not in the facts is an invention — never repaired, always dropped to the facts
      console.warn(`[EXPLAINER] trace=${opts.traceId ?? '-'} unbacked numbers ${nums.offending.join(', ')} — facts-only card used`);
      return { ...factsOnly, verification: { numbers_ok: false, script_ok: script.ok, critic_flags: critique, attempts } };
    }
    if (attempts > maxRepairs) break;
    repairNote = `\n\nREWRITE. Problems found in your previous answer — fix ONLY the wording, keep every fact and number identical:\n`
      + (script.leaks.length ? `- these English words leaked into the farmer's script: ${script.leaks.join(', ')}. Use the farmer's word of this language, or explain in simple words.\n` : '')
      + (critique.length ? `- replace these: ${critique.join('; ')}\n` : '');
    console.log(`[EXPLAINER] trace=${opts.traceId ?? '-'} repair pass: leaks=[${script.leaks.join(',')}] critic=[${critique.join(',')}]`);
  }
  console.warn(`[EXPLAINER] trace=${opts.traceId ?? '-'} still not farmer-clean after ${attempts} passes — facts-only card used`);
  return { ...factsOnly, explained_by: 'FACTS_ONLY', verification: { numbers_ok: true, script_ok: false, critic_flags: critique, attempts } };
}
