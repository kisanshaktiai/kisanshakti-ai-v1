// =====================================================
// graph-advice.ts — ADVICE FROM THE DECISION-BRAIN GRAPH ONLY
// =====================================================
// CHANGE LOG
// 2026-10-02 — Created (proactive-alert forensic audit). Before this module
//   the evaluator attached a "solution" to every alert by guessing a
//   decision rule from category / condition_code substrings, and when the
//   guess failed it wrote generic advice of its own ("Immediate field
//   inspection recommended", "Irrigate as per computed deficit …"). Neither
//   was decision-brain output. Advice now comes only from the
//   hypothesis → rule graph:
//     proactive_rules.conditions.metadata.graph  (authored link, data)
//       → hypothesis_master        (crop + applicability of the cause)
//       → hypothesis_rule_mapping  (the graph edges, edge priority)
//       → decision_rules           (the advice rows)
//   and every advice row must pass the same applicability gates the chat
//   decision lane applies (ai-agriculture-chat/decision/context-rule-selector:
//   servability, region, authored stage AND DAS window, cultivation method
//   fail-closed). A rule that carries an input dose (input_class other than
//   'none', a dosage or an active ingredient — the selector's own
//   candidateCarriesDose test) is never attached: a proactive alert is an
//   unconfirmed risk, and the farm-monitoring policy forbids an alert from
//   producing a chemical or fertilizer action.
//   No agronomy lives here. Every value is a DB column.
// 2026-10-04 — days-to-harvest gate. decision_rules.days_to_harvest_min/max
//   (authored on 20 rows) were never read here, so set-up advice written for
//   early season reached a crop three weeks from harvest. A row that authors
//   either bound needs a known days-to-harvest (the active crop schedule's
//   expected_harvest_date) and must fall inside it — fail closed, like the
//   stage and method gates.
// =====================================================

/** Authored link from one proactive rule into the graph (conditions.metadata.graph). */
export interface GraphLink {
  /** Explicit hypotheses (crop-specific ids; only the land's crop is used). */
  hypothesis_ids: string[];
  /** Hypothesis types (DISEASE, PEST, STRESS …) for the land's crop. */
  hypothesis_types: string[];
  /** Graph nodes linked directly (e.g. the NDVI decision gates, several of
   *  which have no hypothesis edge); only rows of the land's crop are used. */
  rule_ids: string[];
  /** Optional filter on decision_rules.category (e.g. only 'irrigation' rows). */
  rule_categories: string[];
  /** true = the alert is only raised when the graph has applicable advice. */
  required: boolean;
}

export interface GraphHypothesis {
  hypothesis_id: string;
  crop_code: string | null;
  hypothesis_type: string | null;
  cause_name_en: string | null;
  applicability: Record<string, any> | null;
}

export interface GraphEdge { hypothesis_id: string; rule_id: string; priority: number | null }

export interface GraphData {
  hypothesesByCrop: Map<string, GraphHypothesis[]>;
  edgesByHypothesis: Map<string, GraphEdge[]>;
  rulesById: Map<string, Record<string, any>>;
}

/** Land facts the applicability gates need (all from governed sources). */
export interface GraphLandContext {
  crop_code: string | null;      // any case
  stage: string | null;          // crop_stage_master stage, any case
  das: number | null;
  cultivation_method: string | null;
  region_code: string | null;    // v_land_region.region_code ('IN-MH' …)
  /** 2026-10-04: whole days to the schedule's expected harvest; null = unknown. */
  days_to_harvest?: number | null;
}

export interface GraphAdviceItem {
  rule_id: string;
  hypothesis_id: string;
  cause_name_en: string | null;
  category: string | null;
  rule_intent: string | null;
  action_text: string | null;
  knowledge_text: string | null;
  edge_priority: number | null;
}

export interface GraphAdvice {
  items: GraphAdviceItem[];
  /** What the selection was based on — shown to the farmer as "why". */
  basis: { crop: string | null; stage: string | null; das: number | null; region: string | null; hypotheses: string[] };
}

const UNIVERSAL = ['universal', 'all', 'any', '*'];

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(norm).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [norm(v)];
  return [];
}

export function readGraphLink(conditions: Record<string, any> | null | undefined): GraphLink | null {
  const g = conditions?.metadata?.graph;
  if (!g || typeof g !== 'object') return null;
  const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : []);
  const link: GraphLink = {
    hypothesis_ids: strs(g.hypothesis_ids),
    hypothesis_types: strs(g.hypothesis_types).map((s) => s.toUpperCase()),
    rule_ids: strs(g.rule_ids),
    rule_categories: strs(g.rule_categories).map((s) => s.toLowerCase()),
    required: g.required === true,
  };
  if (link.hypothesis_ids.length === 0 && link.hypothesis_types.length === 0 && link.rule_ids.length === 0) return null;
  return link;
}

// ---- applicability gates (mirror context-rule-selector.ts) -----------------

function stageMatches(row: any, stage: string): boolean {
  if (!stage) return false;
  const single = norm(row?.growth_stage);
  if (single && (single === stage || UNIVERSAL.includes(single))) return true;
  const list = arr(row?.stage_applicable);
  if (list.length === 0) return false;
  return list.includes(stage) || list.some((s) => UNIVERSAL.includes(s));
}

function dasMatches(row: any, das: number | null): boolean {
  if (das === null || !Number.isFinite(das)) return false;
  const min = row?.crop_age_days_min;
  const max = row?.crop_age_days_max;
  if (min == null && max == null) return false;
  if (min != null && das < Number(min)) return false;
  if (max != null && das > Number(max)) return false;
  return true;
}

function cultivationMatches(list: string[], method: string): boolean {
  if (list.length === 0) return true;
  if (list.some((m) => UNIVERSAL.includes(m))) return true;
  if (!method) return false; // fail closed: a method-scoped row needs a known method
  return list.includes(method);
}

function harvestWindowMatches(row: any, daysToHarvest: number | null | undefined): boolean {
  const min = row?.days_to_harvest_min;
  const max = row?.days_to_harvest_max;
  if (min == null && max == null) return true;
  if (daysToHarvest == null || !Number.isFinite(daysToHarvest)) return false; // fail closed
  if (min != null && daysToHarvest < Number(min)) return false;
  if (max != null && daysToHarvest > Number(max)) return false;
  return true;
}

function regionMatches(row: any, landRegion: string): boolean {
  const ruleRegion = String(row?.region_code ?? '').trim().toUpperCase();
  if (!ruleRegion) return true;
  if (!landRegion) return false;
  return ruleRegion === landRegion;
}

/** Same servability gate as the chat selector: servable rows, plus block rows. */
function isServable(row: any): boolean {
  return row?.is_farmer_servable === true || norm(row?.rule_intent) === 'block' || row?.is_safety_block === true;
}

/** context-rule-selector candidateCarriesDose(): the row prescribes an input. */
export function carriesDose(row: any): boolean {
  const ic = norm(row?.input_class);
  if (ic && ic !== 'none') return true;
  if (norm(row?.dosage_per_acre)) return true;
  if (norm(row?.active_ingredient)) return true;
  return false;
}

/** Every dimension the row's author filled in must pass; empty dimensions do not constrain. */
export function ruleApplies(row: any, land: GraphLandContext): boolean {
  if (row?.is_active !== true) return false;
  if (!isServable(row)) return false;
  if (carriesDose(row)) return false;
  const hasStage = !!norm(row?.growth_stage) || arr(row?.stage_applicable).length > 0;
  const hasDas = row?.crop_age_days_min != null || row?.crop_age_days_max != null;
  if (!hasStage && !hasDas) return false;
  if (hasStage && !stageMatches(row, norm(land.stage))) return false;
  if (hasDas && !dasMatches(row, land.das)) return false;
  if (!cultivationMatches(arr(row?.cultivation_method_applicable), norm(land.cultivation_method))) return false;
  if (!regionMatches(row, String(land.region_code ?? '').trim().toUpperCase())) return false;
  if (!harvestWindowMatches(row, land.days_to_harvest)) return false;
  return true;
}

/** hypothesis_master.applicability.cultivation_method: ['a','b'] or { in: ['a','b'] }. */
export function hypothesisApplies(h: GraphHypothesis, land: GraphLandContext): boolean {
  const cm = h.applicability?.cultivation_method;
  const list = Array.isArray(cm) ? arr(cm) : arr(cm?.in);
  return cultivationMatches(list, norm(land.cultivation_method));
}

export function selectGraphAdvice(
  graph: GraphData,
  link: GraphLink,
  land: GraphLandContext,
  maxItems: number,
): GraphAdvice {
  const crop = norm(land.crop_code);
  const basis = { crop: crop || null, stage: land.stage, das: land.das, region: land.region_code, hypotheses: [] as string[] };
  if (!crop || !land.stage) return { items: [], basis };

  const ids = new Set(link.hypothesis_ids.map((s) => s.toUpperCase()));
  const types = new Set(link.hypothesis_types);
  const hyps = (graph.hypothesesByCrop.get(crop) ?? [])
    .filter((h) => ids.has(String(h.hypothesis_id).toUpperCase()) || types.has(String(h.hypothesis_type ?? '').toUpperCase()))
    .filter((h) => hypothesisApplies(h, land));
  basis.hypotheses = hyps.map((h) => h.hypothesis_id);

  const seen = new Set<string>();
  const candidates: Array<GraphAdviceItem & { _rulePriority: number }> = [];
  for (const ruleId of link.rule_ids) {
    const row = graph.rulesById.get(ruleId);
    if (!row || seen.has(ruleId)) continue;
    const rc = norm(row.crop_code);
    if (rc !== crop && !UNIVERSAL.includes(rc)) continue;
    if (link.rule_categories.length > 0 && !link.rule_categories.includes(norm(row.category))) continue;
    if (!ruleApplies(row, land)) continue;
    seen.add(ruleId);
    candidates.push({
      rule_id: ruleId, hypothesis_id: '', cause_name_en: null, category: row.category ?? null,
      rule_intent: row.rule_intent ?? null, action_text: row.action_text ?? null,
      knowledge_text: row.knowledge_text ?? null, edge_priority: null, _rulePriority: Number(row.priority ?? 0),
    });
  }
  for (const h of hyps) {
    for (const e of graph.edgesByHypothesis.get(h.hypothesis_id) ?? []) {
      if (seen.has(e.rule_id)) continue;
      const row = graph.rulesById.get(e.rule_id);
      if (!row) continue;
      if (link.rule_categories.length > 0 && !link.rule_categories.includes(norm(row.category))) continue;
      if (!ruleApplies(row, land)) continue;
      seen.add(e.rule_id);
      candidates.push({
        rule_id: e.rule_id,
        hypothesis_id: h.hypothesis_id,
        cause_name_en: h.cause_name_en,
        category: row.category ?? null,
        rule_intent: row.rule_intent ?? null,
        action_text: row.action_text ?? null,
        knowledge_text: row.knowledge_text ?? null,
        edge_priority: e.priority,
        _rulePriority: Number(row.priority ?? 0),
      });
    }
  }
  // Graph edge priority first (1 = strongest edge), then the rule's own priority (higher first).
  candidates.sort((a, b) =>
    (a.edge_priority ?? Number.MAX_SAFE_INTEGER) - (b.edge_priority ?? Number.MAX_SAFE_INTEGER) ||
    b._rulePriority - a._rulePriority);
  const items = candidates.slice(0, Math.max(0, maxItems)).map(({ _rulePriority, ...rest }) => rest);
  return { items, basis };
}

// ---- loader -----------------------------------------------------------------

/** One read per tenant run: hypotheses for the crops in play, their edges, the
 *  mapped rule rows, plus rule rows linked directly by id. */
export async function loadGraph(supabase: any, cropCodes: string[], directRuleIds: string[] = []): Promise<GraphData> {
  const graph: GraphData = { hypothesesByCrop: new Map(), edgesByHypothesis: new Map(), rulesById: new Map() };
  const crops = Array.from(new Set(cropCodes.map(norm).filter(Boolean)));
  if (crops.length === 0) return graph;
  const loadRules = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 300) {
      const { data: rules, error: rErr } = await supabase
        .from('decision_rules')
        .select('rule_id, crop_code, is_active, is_farmer_servable, is_safety_block, rule_intent, category, priority, growth_stage, stage_applicable, crop_age_days_min, crop_age_days_max, days_to_harvest_min, days_to_harvest_max, cultivation_method_applicable, region_code, input_class, dosage_per_acre, active_ingredient, action_text, knowledge_text')
        .eq('is_active', true)
        .in('rule_id', ids.slice(i, i + 300));
      if (rErr) { console.warn(`[GRAPH_ADVICE] rule load failed: ${rErr.message}`); continue; }
      for (const r of (rules ?? [])) graph.rulesById.set(String(r.rule_id), r);
    }
  };
  await loadRules(Array.from(new Set(directRuleIds)));

  const { data: hyps, error: hErr } = await supabase
    .from('hypothesis_master')
    .select('hypothesis_id, crop_code, hypothesis_type, cause_name_en, applicability')
    .eq('is_active', true)
    .in('crop_code', crops)
    .limit(5000);
  if (hErr) { console.warn(`[GRAPH_ADVICE] hypothesis load failed: ${hErr.message}`); return graph; }
  for (const h of (hyps ?? []) as GraphHypothesis[]) {
    const k = norm(h.crop_code);
    if (!graph.hypothesesByCrop.has(k)) graph.hypothesesByCrop.set(k, []);
    graph.hypothesesByCrop.get(k)!.push(h);
  }
  const hypIds = (hyps ?? []).map((h: any) => h.hypothesis_id);
  if (hypIds.length === 0) return graph;

  const { data: edges, error: eErr } = await supabase
    .from('hypothesis_rule_mapping')
    .select('hypothesis_id, rule_id, priority')
    .in('hypothesis_id', hypIds)
    .limit(20000);
  if (eErr) { console.warn(`[GRAPH_ADVICE] edge load failed: ${eErr.message}`); return graph; }
  for (const e of (edges ?? []) as GraphEdge[]) {
    if (!graph.edgesByHypothesis.has(e.hypothesis_id)) graph.edgesByHypothesis.set(e.hypothesis_id, []);
    graph.edgesByHypothesis.get(e.hypothesis_id)!.push(e);
  }
  // Chunked IN lists keep the request URL short.
  const edgeRuleIds: string[] = Array.from(new Set<string>((edges ?? []).map((e: any) => String(e.rule_id))));
  await loadRules(edgeRuleIds.filter((id) => !graph.rulesById.has(id)));
  return graph;
}

/** land_id → region_code from v_land_region (unresolved lands are simply absent). */
export async function loadLandRegions(supabase: any, landIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (landIds.length === 0) return out;
  const { data, error } = await supabase.from('v_land_region').select('land_id, region_code').in('land_id', landIds);
  if (error) { console.warn(`[GRAPH_ADVICE] region load failed: ${error.message}`); return out; }
  for (const r of (data ?? [])) if (r.region_code) out.set(String(r.land_id), String(r.region_code));
  return out;
}
