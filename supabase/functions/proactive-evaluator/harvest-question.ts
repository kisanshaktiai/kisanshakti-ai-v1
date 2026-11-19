// =====================================================
// harvest-question.ts — DAILY HARVEST CARD SEEDER (2026-11-19)
//
// Farmers rarely say when they harvested. The database decides, per active
// crop schedule, the harvest date and the day the land is released
// (public.crop_cycle_close_plan, migration 20261119120000):
//   harvest date = farmer's own answer, else the VARIETY's duration for the
//   cultivation method, else the variety's maturity days, else the end of the
//   crop's harvest window; release_on = later of (harvest date, go-live day)
//   + grace_days (system_config 'crop_cycle_auto_close_policy').
//
// While card_due is true (after the harvest date, before release_on) this
// file seeds ONE alert per land per day. The farmer app shows it as a popup
// card on app open with release_on - today days left; the farmer answers
// "harvest done (date)" or "crop still in the field (expected date)". The
// answer is written by public.record_crop_harvest through the
// proactive-question-seed edge function (action 'harvest_answer').
//
// Same shape as germination-question.ts: rows are returned, never inserted;
// NO date arithmetic, threshold or farmer-facing string lives here — dates
// come from the plan function, text from ui_translations.
//
// Not limited by the farmer's daily alert cap and no rule cooldown: this card
// is the farmer's only warning before his land is released, so it must be
// there every day of the countdown (one per land per day via dedup_key).
// =====================================================

export const HARVEST_QUESTION_RULE_CODE = 'HARVEST_CONFIRM_QUESTION';
const UI_KEY_PREFIX = 'harvest.';

/** One row of public.crop_cycle_close_plan(as_of). */
export interface ClosePlanRow {
  schedule_id: string;
  land_id: string;
  crop_code: string | null;
  sowing_date: string | null;
  transplant_date: string | null;
  harvest_date: string | null;
  harvest_basis: string;
  harvest_window_end: string | null;
  max_expected_date: string | null;
  release_on: string | null;
  days_left: number | null;
  card_due: boolean;
}

export interface HarvestSeedCtx {
  land_id: string;
  farmer_id: string;
  tenant_id: string;
  land_name: string | null;
}

export interface HarvestSeedDeps {
  todayStr: string;
  isDuplicate: (dedupKey: string, ruleCode: string, landId: string, cooldownHours: number) => boolean;
}

export interface UiText {
  get(key: string, lang: string): string;
}

export async function loadHarvestUiText(supabase: any): Promise<UiText> {
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

/** YYYY-MM-DD -> DD-MM-YYYY (numeric, language-neutral) for the stored alert text. */
export function formatDayMonthYear(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}-${m}-${y}` : String(iso);
}

/** The card row for one land, or null when the plan says no card today. */
export function buildHarvestQuestionRow(
  ctx: HarvestSeedCtx,
  plan: ClosePlanRow | undefined,
  ui: UiText,
  deps: HarvestSeedDeps,
): any | null {
  if (!plan || plan.card_due !== true || !plan.harvest_date || !plan.release_on) return null;

  const dedupKey = `HARVEST_Q:${plan.schedule_id}:${deps.todayStr}`;
  if (deps.isDuplicate(dedupKey, HARVEST_QUESTION_RULE_CODE, ctx.land_id, 0)) return null;

  const vars = {
    land: ctx.land_name || '',
    harvest_date: formatDayMonthYear(plan.harvest_date),
    release_on: formatDayMonthYear(plan.release_on),
  };
  const title = (l: string) => fill(ui.get('harvest.question.title', l), vars);
  const body = (l: string) => fill(ui.get('harvest.question.body', l), vars);

  return {
    tenant_id: ctx.tenant_id,
    land_id: ctx.land_id,
    farmer_id: ctx.farmer_id,
    rule_id: HARVEST_QUESTION_RULE_CODE,
    alert_category: 'HARVEST_TIMING',
    priority: 'HIGH',
    title_en: title('en'),
    title_hi: title('hi'),
    title_mr: title('mr'),
    message_en: body('en'),
    message_hi: body('hi'),
    message_mr: body('mr'),
    action_text_en: null,
    action_text_hi: null,
    action_text_mr: null,
    risk_score: 60,
    confidence: 0.9,
    trigger_data: {
      condition_code: 'HARVEST_CONFIRM',
      land_name: ctx.land_name,
      question: {
        type: 'HARVEST_CONFIRM',
        action: 'harvest_answer',
        land_id: ctx.land_id,
        schedule_id: plan.schedule_id,
        crop_code: plan.crop_code,
        sowing_date: plan.sowing_date,
        harvest_date: plan.harvest_date,
        harvest_basis: plan.harvest_basis,
        release_on: plan.release_on,
        // latest date the farmer may give for "crop still in the field"; null = not offered
        max_expected_date: plan.max_expected_date,
      },
    },
    decision_reasoning: `harvest date ${plan.harvest_date} (${plan.harvest_basis}); land released on ${plan.release_on} unless the farmer answers`,
    status: 'PENDING',
    dedup_key: dedupKey,
    // valid until the release day; the app computes the days left from release_on
    expires_at: `${String(plan.release_on).slice(0, 10)}T00:00:00Z`,
  };
}

/**
 * Returns proactive_alerts rows for the lands in `contexts` whose harvest card is
 * due today (never inserts). The plan is read once per run.
 */
export async function buildHarvestQuestionAlerts(
  supabase: any,
  contexts: HarvestSeedCtx[],
  deps: HarvestSeedDeps,
): Promise<any[]> {
  if (contexts.length === 0) return [];
  const { data, error } = await supabase.rpc('crop_cycle_close_plan', { p_as_of: deps.todayStr });
  if (error) {
    console.warn(`[HARVEST_QUESTION] crop_cycle_close_plan failed: ${error.message}`);
    return [];
  }
  const planByLand = new Map<string, ClosePlanRow>();
  for (const p of (data || []) as ClosePlanRow[]) planByLand.set(p.land_id, p);

  const ui = await loadHarvestUiText(supabase);
  const rows: any[] = [];
  for (const ctx of contexts) {
    const row = buildHarvestQuestionRow(ctx, planByLand.get(ctx.land_id), ui, deps);
    if (row) rows.push(row);
  }
  if (rows.length > 0) console.log(`[HARVEST_QUESTION] ${rows.length} harvest card(s) seeded`);
  return rows;
}
