// =====================================================
// germination-question.ts — ONE-TAP GERMINATION QUESTION SEEDER
//
// Biological (not calendar) trigger: the DB function
// `public.check_germination_gate(land_id)` decides when emergence is
// plausible. When the gate reports `conditions_favorable` AND the current
// day since the germination anchor falls inside the DB-governed prompt
// window (`germination_gate_params.question_prompt_min_day/max_day`), we
// seed ONE proactive alert carrying a two-option question.
//
// The farmer's tap is written back through `public.record_germination`
// (handled by the `proactive-question-seed` edge function), which is the
// only writer of the GERMINATION_CONFIRMED / GERMINATION_NOT_OBSERVED
// lifecycle events.
//
// NO agronomic knowledge and NO farmer-facing string lives in this file:
// thresholds come from the gate function, text comes from `ui_translations`.
// =====================================================

export const GERMINATION_QUESTION_RULE_CODE = 'GERMINATION_GATE_QUESTION';
const UI_KEY_PREFIX = 'germination.';

export interface UiText {
  get(key: string, lang: string): string;
}

export async function loadGerminationUiText(supabase: any): Promise<UiText> {
  const map = new Map<string, string>();
  const { data } = await supabase
    .from('ui_translations')
    .select('ui_key, language_code, display_text')
    .like('ui_key', `${UI_KEY_PREFIX}%`);
  for (const r of data || []) {
    map.set(`${r.ui_key}|${String(r.language_code).toLowerCase()}`, r.display_text);
  }
  return {
    get(key: string, lang: string) {
      return map.get(`${key}|${lang}`) ?? map.get(`${key}|en`) ?? '';
    },
  };
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');
}

export interface GateSnapshot {
  state: string;
  reasons?: unknown;
  params_source?: string | null;
  question_prompt_min_day?: number | null;
  question_prompt_max_day?: number | null;
  signal?: any;
}

/** Whole days since the germination anchor date, or null when unresolvable. */
export function daysSinceAnchor(gate: GateSnapshot): number | null {
  const anchorDate = gate?.signal?.anchor?.anchor_date;
  if (!anchorDate) return null;
  const t = new Date(`${String(anchorDate).slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/**
 * The anchor resolver flags contradictory nursery/transplant dates. While that
 * is unresolved we must NOT ask the emergence question or show favorability —
 * reasoning from contradictory dates is worse than asking the farmer for one
 * date (handled by the frontend clarification card).
 */
export function anchorNeedsClarification(gate: GateSnapshot): boolean {
  return gate?.signal?.anchor?.needs_farmer_clarification === true;
}

export function isPromptDue(gate: GateSnapshot): boolean {
  if (anchorNeedsClarification(gate)) return false;
  if (gate?.state !== 'conditions_favorable') return false;
  const d = daysSinceAnchor(gate);
  if (d == null || d < 0) return false;
  const min = gate.question_prompt_min_day ?? null;
  const max = gate.question_prompt_max_day ?? null;
  if (min != null && d < min) return false;
  if (max != null && d > max) return false;
  return true;
}

export interface GerminationSeedCtx {
  land_id: string;
  farmer_id: string;
  tenant_id: string;
  land_name: string | null;
  crop_code: string | null;
}

export interface SeedDeps {
  todayStr: string;
  expiryDays: number;
  dailyCap: number;
  cooldownHours: number;
  farmerDailyCounts: Map<string, number>;
  isDuplicate: (dedupKey: string, ruleCode: string, landId: string, cooldownHours: number) => boolean;
}

/**
 * Returns proactive_alerts rows (never inserts). Cooldown / dedup / daily cap
 * are delegated to the caller's existing helpers so behaviour matches every
 * other alert lane.
 */
export async function buildGerminationQuestionAlerts(
  supabase: any,
  contexts: GerminationSeedCtx[],
  deps: SeedDeps,
): Promise<any[]> {
  if (contexts.length === 0) return [];
  const ui = await loadGerminationUiText(supabase);
  const rows: any[] = [];

  // Sequential-with-small-parallelism: the gate function is DB heavy.
  const CHUNK = 8;
  for (let i = 0; i < contexts.length; i += CHUNK) {
    const slice = contexts.slice(i, i + CHUNK);
    const gates = await Promise.all(
      slice.map(async (ctx) => {
        try {
          const { data, error } = await supabase.rpc('check_germination_gate', { p_land_id: ctx.land_id });
          if (error) {
            console.warn(`[GERM_QUESTION] gate error land=${ctx.land_id.slice(0, 8)} ${error.message}`);
            return null;
          }
          return data as GateSnapshot;
        } catch (e) {
          console.warn(`[GERM_QUESTION] gate threw land=${ctx.land_id.slice(0, 8)}`, e);
          return null;
        }
      }),
    );

    slice.forEach((ctx, idx) => {
      const gate = gates[idx];
      if (!gate) return;
      if (!isPromptDue(gate)) {
        console.log(
          `[GERM_QUESTION] land=${ctx.land_id.slice(0, 8)} state=${gate.state} day=${daysSinceAnchor(gate)} — not due`,
        );
        return;
      }

      const dedupKey = `GERM_Q:${ctx.land_id}:${deps.todayStr}`;
      if (deps.isDuplicate(dedupKey, GERMINATION_QUESTION_RULE_CODE, ctx.land_id, deps.cooldownHours)) return;

      const used = deps.farmerDailyCounts.get(ctx.farmer_id) || 0;
      if (used >= deps.dailyCap) return;

      const vars = { land: ctx.land_name || '', crop: ctx.crop_code || '' };
      const title = (l: string) => fill(ui.get('germination.question.title', l), vars);
      const body = (l: string) => fill(ui.get('germination.question.body', l), vars);

      const options = [
        { key: 'yes', confirmed: true, label_en: ui.get('germination.answer.yes', 'en'), label_hi: ui.get('germination.answer.yes', 'hi'), label_mr: ui.get('germination.answer.yes', 'mr') },
        { key: 'no', confirmed: false, label_en: ui.get('germination.answer.no', 'en'), label_hi: ui.get('germination.answer.no', 'hi'), label_mr: ui.get('germination.answer.no', 'mr') },
      ];

      rows.push({
        tenant_id: ctx.tenant_id,
        land_id: ctx.land_id,
        farmer_id: ctx.farmer_id,
        rule_id: GERMINATION_QUESTION_RULE_CODE,
        alert_category: 'STAGE_ADVISORY',
        priority: 'MEDIUM',
        title_en: title('en'),
        title_hi: title('hi'),
        title_mr: title('mr'),
        message_en: body('en'),
        message_hi: body('hi'),
        message_mr: body('mr'),
        action_text_en: null,
        action_text_hi: null,
        action_text_mr: null,
        risk_score: 30,
        confidence: 0.9,
        trigger_data: {
          condition_code: 'GERMINATION_CHECK',
          gate_state: gate.state,
          gate_reasons: gate.reasons ?? null,
          params_source: gate.params_source ?? null,
          day_since_anchor: daysSinceAnchor(gate),
          question: {
            type: 'GERMINATION_CHECK',
            rpc: 'record_germination',
            land_id: ctx.land_id,
            options,
          },
        },
        decision_reasoning: `germination gate favorable (${gate.params_source || 'db'}) at day ${daysSinceAnchor(gate)}`,
        status: 'PENDING',
        dedup_key: dedupKey,
        expires_at: new Date(Date.now() + deps.expiryDays * 86400000).toISOString(),
      });

      deps.farmerDailyCounts.set(ctx.farmer_id, used + 1);
      console.log(`[GERM_QUESTION] seeded land=${ctx.land_id.slice(0, 8)} day=${daysSinceAnchor(gate)}`);
    });
  }

  return rows;
}
