/**
 * ADVISOR CARD — the farmer-facing contract of every decision turn (2026-09-09).
 *
 * Order is fixed by the product logic: RESPECT → WHAT HAPPENED → WHY → HOW TO FIX → extras → products.
 * The LLM is an EXPLAINER only: each field is rewritten in the farmer's language from the DB facts for that
 * field and nothing else. Numbers are re-checked against the DB facts, the farmer glossary is applied, and if the
 * model fails or invents, the card falls back to the DB facts as they are (the UI still renders the structure).
 * Products come from master_products through the existing lookup — never from the model.
 */
import { explainDecision, type FactFrame, type Fact } from './explainer.ts';

export interface AdvisorProduct { name: string; brand?: string | null; company?: string | null; image_url?: string | null; pack_sizes?: string | null; product_id?: string | null; }
export interface AdvisorCard {
  version: 1;
  language: string;
  kind: 'ADVICE' | 'DO_NOT' | 'INFO';
  greeting: string;
  crop?: string | null; stage?: string | null; das?: number | null;
  what_happened: string;
  why: string;
  how_to_fix: string;
  how_lines: string[];              // structured HOW: product/dose/method/water/timing/safety/check (already in farmer language)
  extras: Array<{ title: string; text: string }>;   // secondary rules, blocks, notes — collapsed in UI
  options: Array<{ title: string; text: string }>;  // alternatives / organic option — collapsed in UI
  economics?: { yield_gain_pct?: number | null; cost_min?: number | null; cost_max?: number | null; cost_estimated?: number | null } | null;
  products: AdvisorProduct[];       // collapsed in UI; from master_products only
  /** traceability: every claim's origin, so the answer can be audited back to the row that produced it */
  provenance: { rule_id?: string | null; scientific_source?: string | null; scientific_basis?: string | null;
    university_source?: string | null; mode_of_action?: string | null; chemical_class?: string | null;
    resistance_group?: string | null; regulatory_status?: string | null; phi_source?: string | null;
    confidence_score?: number | null; knowledge_text?: string | null };
  source: { rule_id?: string | null; explained_by: 'LLM' | 'LLM_REPAIRED' | 'FACTS_ONLY'; verification?: unknown };
}

type SourceFacts = { crop?: string; stage?: string; das?: number | null; kind: AdvisorCard['kind']; rule_id?: string | null;
  cause?: string | null; action_text?: string | null; reason_text?: string | null;
  product?: string | null; dose?: string | null; method?: string | null; water?: string | null; timing?: string | null;
  safety: string[]; checks: string[]; failures: string[]; options: Array<{ title: string; text: string }>;
  economics?: { yield_gain_pct?: number | null; cost_min?: number | null; cost_max?: number | null; cost_estimated?: number | null } | null;
  provenance: AdvisorCard['provenance'];
  extras: Array<{ title: string; text: string }> };

function collectFacts(decision: any): SourceFacts | null {
  const p = decision?.primary_decision; if (!p) return null;
  const a = p.application_details || {};
  const at = String(p.action_type || '').toUpperCase();
  const isBlock = /^(BLOCK|NO_ACTION_REQUIRED|URGENT_BLOCK|WEATHER_BLOCK|AVOID)$/.test(at) || String(a.rule_intent || '').toLowerCase() === 'block';
  const safety: string[] = [];
  if (typeof a.phi_days === 'number' && a.phi_days > 0) safety.push(`PHI ${a.phi_days} days`);
  if (typeof a.reentry_interval_hours === 'number' && a.reentry_interval_hours > 0) safety.push(`re-entry ${a.reentry_interval_hours} h`);
  if (a.bee_toxicity && String(a.bee_toxicity).toLowerCase() === 'high') safety.push('highly toxic to bees — never during flowering');
  if (a.farmer_safety_level && String(a.farmer_safety_level).toLowerCase() !== 'safe') safety.push(`safety: ${a.farmer_safety_level}`);
  const checks: string[] = Array.isArray(a.success_indicators) ? a.success_indicators.filter((s: unknown) => typeof s === 'string') : [];
  // 2026-09-09 — EXPLAINABILITY: failure_indicators tell the farmer what "not working" looks like; alternatives and
  // organic_alternative are DB-authored options; ROI/cost are the economics the row carries. All were being dropped.
  const failures: string[] = Array.isArray(a.failure_indicators) ? a.failure_indicators.filter((s: unknown) => typeof s === 'string') : [];
  const options: Array<{ title: string; text: string }> = [];
  const altList = Array.isArray(a.alternatives) ? a.alternatives : (a.alternatives ? [a.alternatives] : []);
  for (const alt of altList) { const t = typeof alt === 'string' ? alt : (alt?.text ?? alt?.name ?? ''); if (t) options.push({ title: '', text: String(t) }); }
  if (a.organic_alternative) options.push({ title: 'organic', text: String(a.organic_alternative) });
  const economics = (a.roi_yield_gain_pct != null || a.input_cost_per_acre_min != null || a.total_cost_estimated != null)
    ? { yield_gain_pct: a.roi_yield_gain_pct ?? null, cost_min: a.input_cost_per_acre_min ?? a.material_cost_per_acre_min ?? null,
        cost_max: a.input_cost_per_acre_max ?? a.material_cost_per_acre_max ?? null, cost_estimated: a.total_cost_estimated ?? null }
    : null;
  const provenance = { rule_id: p.rule_id || a.rule_id || null, scientific_source: a.scientific_source || null,
    scientific_basis: a.scientific_basis || null, university_source: a.university_source || null,
    mode_of_action: a.mode_of_action || null, chemical_class: a.chemical_class || null, resistance_group: a.resistance_group || null,
    regulatory_status: a.regulatory_status || null, phi_source: a.phi_source || null,
    confidence_score: (typeof p.confidence_score === 'number' ? p.confidence_score : a.confidence_score) ?? null,
    knowledge_text: a.knowledge_text || null };
  const extras: Array<{ title: string; text: string }> = [];
  for (const s of (decision.secondary_decisions || [])) { const sa = s?.application_details || {}; if (sa.action_text) extras.push({ title: String(s.cause || s.rule_id || ''), text: String(sa.action_text) }); }
  for (const b of (decision.blocked_actions || [])) { if (b?.reason) extras.push({ title: String(b.action || 'blocked'), text: String(b.reason) }); }
  return { kind: isBlock ? 'DO_NOT' : 'ADVICE', rule_id: p.rule_id || a.rule_id || null, cause: p.cause || a.cause || null,
    action_text: a.action_text || p.specific_action || null, reason_text: a.reason_text || null,
    product: a.active_ingredient || a.product_name || null, dose: a.dosage_per_acre || null, method: a.application_method || null,
    water: a.water_volume_per_acre || null, timing: p.timing?.best_time_of_day || null, safety, checks, failures, options, economics, provenance, extras };
}

/** The symbolic layer's decision, expressed as a semantic frame the explainer can speak from. */
function toFactFrame(f: SourceFacts): FactFrame {
  const q = (text?: string | null) => {
    const out: Array<{ value: number; unit: string; basis?: string }> = [];
    for (const m of String(text ?? '').matchAll(/(\d+(?:[.,]\d+)?)\s*([^\s\d,.;:()]{1,12})/gu)) out.push({ value: parseFloat(m[1].replace(',', '.')), unit: m[2] });
    return out.length ? out : undefined;
  };
  const facts: Fact[] = [];
  if (f.cause) facts.push({ role: 'situation', concept: 'other', code: f.rule_id ?? null, gloss: f.cause });
  if (f.reason_text) facts.push({ role: 'cause', gloss: f.reason_text });
  if (f.action_text) facts.push({ role: 'action', gloss: f.action_text, quantities: q(f.action_text) });
  if (f.product) facts.push({ role: 'input', concept: 'product', gloss: f.product + (f.dose ? ` — ${f.dose}` : ''), quantities: q(f.dose ?? '') });
  if (f.method) facts.push({ role: 'method', concept: 'practice', gloss: f.method });
  if (f.water) facts.push({ role: 'method', concept: 'measure', gloss: f.water, quantities: q(f.water) });
  if (f.timing) facts.push({ role: 'method', concept: 'practice', gloss: f.timing });
  for (const s2 of f.safety) facts.push({ role: 'safety', concept: 'measure', gloss: s2, quantities: q(s2) });
  for (const c of f.checks) facts.push({ role: 'check', gloss: c, quantities: q(c) });
  for (const c of f.failures) facts.push({ role: 'check', gloss: `If this is seen, the treatment is not working: ${c}`, quantities: q(c) });
  for (const o of f.options) facts.push({ role: 'note', concept: 'practice', gloss: o.title ? `${o.title}: ${o.text}` : o.text });
  if (f.economics?.yield_gain_pct != null) facts.push({ role: 'note', concept: 'measure', gloss: `expected yield gain up to ${f.economics.yield_gain_pct}%`, quantities: [{ value: Number(f.economics.yield_gain_pct), unit: '%' }] });
  if (f.economics?.cost_min != null || f.economics?.cost_max != null) facts.push({ role: 'note', concept: 'measure', gloss: `input cost per acre ${f.economics.cost_min ?? ''}${f.economics.cost_max != null ? `-${f.economics.cost_max}` : ''}`, quantities: [f.economics.cost_min, f.economics.cost_max].filter((v) => v != null).map((v) => ({ value: Number(v), unit: 'currency' })) });
  if (f.provenance.mode_of_action) facts.push({ role: 'note', concept: 'product', gloss: `how this product works: ${f.provenance.mode_of_action}` });
  if (f.provenance.resistance_group) facts.push({ role: 'note', concept: 'product', gloss: `rotate with a different group next spray (this one is ${f.provenance.resistance_group})` });
  for (const e of f.extras) facts.push({ role: 'note', gloss: `${e.title}: ${e.text}` });
  return { kind: f.kind, crop: f.crop ?? null, stage: f.stage ?? null, das: f.das ?? null, area_acres: null, facts, rule_id: f.rule_id ?? null };
}

/** Facts-only card: the DB's own wording, used when the explainer cannot be trusted. */
function factsOnlyCard(f: SourceFacts) {
  const how: string[] = [];
  if (f.kind !== 'DO_NOT') {
    if (f.product) how.push(`${f.product}${f.dose ? ` — ${f.dose}` : ''}`);
    if (f.method) how.push(f.method); if (f.water) how.push(f.water); if (f.timing) how.push(f.timing);
    how.push(...f.safety); if (f.checks.length) how.push(...f.checks.slice(0, 3));
    if (f.failures.length) how.push(...f.failures.slice(0, 2));
  }
  return { greeting: '', what_happened: f.cause ?? f.action_text ?? '', why: f.reason_text ?? '', how_to_fix: f.action_text ?? '', how_lines: how, extras: f.extras };
}

export async function buildAdvisorCard(opts: {
  decision: any; lang: string; supabase: any; landContext?: any;
  llm?: (system: string, user: string) => Promise<string>;
  products?: AdvisorProduct[]; traceId?: string; greetingFallback?: string;
}): Promise<AdvisorCard | null> {
  const f = collectFacts(opts.decision); if (!f) return null;
  const lang = String(opts.lang || 'en');
  f.crop = opts.landContext?.current_crop || opts.decision?.land_context?.crop || undefined;
  f.stage = opts.landContext?.growth_stage || opts.decision?.land_context?.growth_stage || undefined;
  f.das = opts.landContext?.days_since_sowing ?? null;

  const frame = toFactFrame(f);
  frame.area_acres = Number.isFinite(Number(opts.landContext?.area_acres)) ? Number(opts.landContext.area_acres) : null;
  const base = factsOnlyCard(f);

  const explained = opts.llm
    ? await explainDecision({ frame, lang, llm: opts.llm, factsOnlyCard: base, traceId: opts.traceId })
    : { ...base, explained_by: 'FACTS_ONLY' as const, verification: { numbers_ok: true, script_ok: true, critic_flags: [], attempts: 0 } };

  return {
    version: 1, language: lang, kind: f.kind,
    greeting: explained.greeting || base.greeting || (opts.greetingFallback ?? ''),
    crop: f.crop ?? null, stage: f.stage ?? null, das: f.das ?? null,
    what_happened: explained.what_happened, why: explained.why, how_to_fix: explained.how_to_fix,
    how_lines: explained.how_lines, extras: explained.extras,
    options: f.options, economics: f.economics ?? null, provenance: f.provenance,
    products: opts.products ?? [],
    source: { rule_id: f.rule_id, explained_by: explained.explained_by, verification: explained.verification },
  };
}
