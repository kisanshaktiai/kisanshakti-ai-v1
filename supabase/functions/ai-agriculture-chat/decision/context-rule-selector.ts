/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Lane B — CONTEXT rule selector (zero-observation advisory)
 * ───────────────────────────────────────────────────────────────────────────
 * CHANGE LOG (newest first)
 *   2026-08-26 14:40 UTC — Fix 5 (agronomic safety): added
 *     `selectContextBlocks()` + `applyContextBlockGate()`. CONTEXT_BLOCK rows
 *     applicable to the current crop/stage/DAS/cultivation now suppress ANY
 *     emitted rule that carries the same condition_code or category, in every
 *     lane (not only Lane B). The block row itself becomes the primary
 *     response so the farmer receives the prohibition, never the dose.
 *     NO agronomy is hardcoded: applicability and identity come from the DB row.
 *   2026-08-20 10:10 UTC — Initial. Selects decision_rules rows whose
 *     trigger_class is CONTEXT_SCHEDULE / CONTEXT_BLOCK by crop + stage + DAS +
 *     cultivation method, with NO observation / condition_code filter. Lane A
 *     (symptom-driven) is untouched. CONTEXT_BLOCK wins over a CONTEXT_SCHEDULE
 *     row that carries the same condition_code (same nutrient) — the block
 *     message is kept and the conflicting dose suppressed.
 *     NO agronomy is encoded here: every value comes from the DB row.
 * ═══════════════════════════════════════════════════════════════════════════
 */


export type ContextTriggerClass = 'CONTEXT_SCHEDULE' | 'CONTEXT_BLOCK';

export interface ContextRuleQuery {
  cropCode: string | null | undefined;
  growthStage: string | null | undefined;
  das: number | null | undefined;
  cultivationMethod?: string | null;
  traceId?: string;
}

export interface ContextRuleSelection {
  /** Winning rule (block first, then highest priority schedule rule). */
  primary: any | null;
  /** All applicable rows after block-suppression, priority DESC. */
  applicable: any[];
  /** Rows suppressed because a CONTEXT_BLOCK owns the same condition_code. */
  suppressed: any[];
  blocks: any[];
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

function stageMatches(row: any, stage: string): boolean {
  if (!stage) return false;
  const single = norm(row?.growth_stage);
  if (single && (single === stage || UNIVERSAL.includes(single))) return true;
  const list = arr(row?.stage_applicable);
  if (list.length === 0) return false;
  return list.includes(stage) || list.some((s) => UNIVERSAL.includes(s));
}

function dasMatches(row: any, das: number | null): boolean {
  if (das === null || !isFinite(das)) return false;
  const min = row?.crop_age_days_min;
  const max = row?.crop_age_days_max;
  if (min == null && max == null) return false;
  if (min != null && das < Number(min)) return false;
  if (max != null && das > Number(max)) return false;
  return true;
}

function cultivationMatches(row: any, method: string): boolean {
  const list = arr(row?.cultivation_method_applicable);
  if (list.length === 0) return true; // universal
  if (list.some((m) => UNIVERSAL.includes(m))) return true;
  if (!method) return true; // unknown lane → do not exclude
  return list.includes(method);
}

/**
 * Query CONTEXT rules for the canonical crop/stage/DAS context.
 * Never throws — a failure returns an empty selection so the turn survives.
 */
export async function selectContextRules(
  supabase: any,
  q: ContextRuleQuery,
): Promise<ContextRuleSelection> {
  const empty: ContextRuleSelection = { primary: null, applicable: [], suppressed: [], blocks: [] };
  const crop = norm(q.cropCode);
  const stage = norm(q.growthStage);
  const das = typeof q.das === 'number' && isFinite(q.das) ? Math.floor(q.das) : null;
  const method = norm(q.cultivationMethod);
  const trace = q.traceId ?? 'n/a';

  if (!crop) {
    console.log(`[LANE_B_CONTEXT_RULES] trace=${trace} skipped reason=no_crop`);
    return empty;
  }

  let rows: any[] = [];
  try {
    const cropVariants = Array.from(new Set([
      crop, crop.toUpperCase(),
      ...UNIVERSAL, ...UNIVERSAL.map((u) => u.toUpperCase()),
    ]));
    const { data, error } = await supabase
      .from('decision_rules')
      .select('*')
      .eq('is_active', true)
      .in('trigger_class', ['CONTEXT_SCHEDULE', 'CONTEXT_BLOCK'])
      .in('crop_code', cropVariants)
      .order('priority', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    rows = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn(`[LANE_B_CONTEXT_RULES] trace=${trace} query failed: ${(e as Error).message}`);
    return empty;
  }

  const applicableRaw = rows.filter((r) =>
    (stageMatches(r, stage) || dasMatches(r, das)) && cultivationMatches(r, method)
  );

  const blocks = applicableRaw.filter((r) => norm(r?.trigger_class) === 'context_block');
  const blockedCodes = new Set(blocks.map((b) => norm(b?.condition_code)).filter(Boolean));

  const suppressed: any[] = [];
  const kept: any[] = [];
  for (const r of applicableRaw) {
    const isBlock = norm(r?.trigger_class) === 'context_block';
    if (!isBlock && blockedCodes.has(norm(r?.condition_code))) {
      suppressed.push(r);
      continue;
    }
    kept.push(r);
  }

  kept.sort((a, b) => {
    const ab = norm(a?.trigger_class) === 'context_block' ? 1 : 0;
    const bb = norm(b?.trigger_class) === 'context_block' ? 1 : 0;
    if (ab !== bb) return bb - ab; // blocks lead
    return Number(b?.priority ?? 0) - Number(a?.priority ?? 0);
  });

  console.log(
    `[LANE_B_CONTEXT_RULES] trace=${trace} crop=${crop} stage=${stage || 'null'} das=${das ?? 'null'} ` +
    `cultivation=${method || 'null'} fetched=${rows.length} applicable=${kept.length} ` +
    `blocks=${blocks.map((b) => b.rule_id).join(',') || 'none'} ` +
    `suppressed=${suppressed.map((s) => s.rule_id).join(',') || 'none'} ` +
    `winner=${kept[0]?.rule_id ?? 'none'}`,
  );

  return { primary: kept[0] ?? null, applicable: kept, suppressed, blocks };
}

/** Project a decision_rules row into the evaluator's matched_response shape. */
export function toMatchedResponse(row: any): any {
  return {
    ...row,
    rule_id: row?.rule_id,
    action_type: row?.action_type ?? (norm(row?.trigger_class) === 'context_block' ? 'AVOID' : 'APPLY'),
    action_text: row?.action_text ?? null,
    reason_text: row?.reason_text ?? null,
    cause: row?.cause ?? row?.condition_code ?? null,
    observation_code: row?.condition_code ?? null,
    condition_code: row?.condition_code ?? null,
    dosage_per_acre: row?.dosage_per_acre ?? null,
    organic_alternative: row?.organic_alternative ?? null,
    priority: Number(row?.priority ?? 0),
    confidence_score: 0.9,
    weighted_confidence: 0.9,
    application_details: { ...row, rule_id: row?.rule_id },
    trigger_class: row?.trigger_class ?? null,
    lane: 'CONTEXT',
  };
}
