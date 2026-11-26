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
//
// 2026-11-20 (audit of the first live day):
//  H1  The card is seeded ONE DAY AHEAD (due today, or due tomorrow by the
//      plan), so it is already waiting when the farmer opens the app in the
//      morning — the evaluator's first run is 05:00 UTC (10:30 IST). The phone
//      still shows it only after the harvest date (src/lib/harvestCard.ts).
//      The row's dates always come from TODAY's plan.
//  H2  harvestWindowLandIds(): lands whose card is due today. The evaluator
//      raises no other advice on them (a crop past its harvest date is not
//      irrigated, sprayed or fed) and expires their other live alerts.
//  The plan is read once per run for today and tomorrow (loadHarvestPlan).
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

/** public.crop_cycle_close_plan read for today and for tomorrow, keyed by land. */
export interface HarvestPlan {
  today: Map<string, ClosePlanRow>;
  tomorrow: Map<string, ClosePlanRow>;
}

/** YYYY-MM-DD -> the next calendar day (UTC arithmetic on a date-only value). */
export function nextDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Reads the plan once per run (today + tomorrow). null when the read fails: no cards, no hold. */
export async function loadHarvestPlan(supabase: any, todayStr: string): Promise<HarvestPlan | null> {
  const [today, tomorrow] = await Promise.all([
    supabase.rpc('crop_cycle_close_plan', { p_as_of: todayStr }),
    supabase.rpc('crop_cycle_close_plan', { p_as_of: nextDay(todayStr) }),
  ]);
  if (today.error || tomorrow.error) {
    console.warn(`[HARVEST_QUESTION] crop_cycle_close_plan failed: ${(today.error ?? tomorrow.error).message}`);
    return null;
  }
  const byLand = (rows: ClosePlanRow[] | null) => {
    const m = new Map<string, ClosePlanRow>();
    for (const p of rows || []) m.set(p.land_id, p);
    return m;
  };
  return { today: byLand(today.data), tomorrow: byLand(tomorrow.data) };
}

/** H2: lands in their harvest countdown today (after the harvest date, before release). */
export function harvestWindowLandIds(plan: HarvestPlan | null): Set<string> {
  const ids = new Set<string>();
  if (!plan) return ids;
  for (const [landId, p] of plan.today) if (p.card_due === true) ids.add(landId);
  return ids;
}

/**
 * The card row for one land, or null when no card is due today or tomorrow (H1).
 * Dates on the row come from today's plan row.
 */
export function buildHarvestQuestionRow(
  ctx: HarvestSeedCtx,
  plan: ClosePlanRow | undefined,
  ui: UiText,
  deps: HarvestSeedDeps,
  planTomorrow?: ClosePlanRow,
): any | null {
  const due = plan?.card_due === true || planTomorrow?.card_due === true;
  if (!plan || !due || !plan.harvest_date || !plan.release_on) return null;

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
 * due today or tomorrow (never inserts). `plan` is the run's loadHarvestPlan().
 */
export async function buildHarvestQuestionAlerts(
  supabase: any,
  contexts: HarvestSeedCtx[],
  deps: HarvestSeedDeps,
  plan: HarvestPlan | null,
): Promise<any[]> {
  if (contexts.length === 0 || !plan) return [];

  const ui = await loadHarvestUiText(supabase);
  const rows: any[] = [];
  for (const ctx of contexts) {
    const row = buildHarvestQuestionRow(ctx, plan.today.get(ctx.land_id), ui, deps, plan.tomorrow.get(ctx.land_id));
    if (row) rows.push(row);
  }
  if (rows.length > 0) console.log(`[HARVEST_QUESTION] ${rows.length} harvest card(s) seeded`);
  return rows;
}
