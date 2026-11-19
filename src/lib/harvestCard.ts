/**
 * Harvest card — pure helpers (2026-11-19).
 *
 * The database decides every date (public.crop_cycle_close_plan): the harvest date
 * (the variety's duration, else the crop's harvest window), the day the land is
 * released, and the latest date a farmer may give for "crop still in the field".
 * The proactive evaluator puts those dates on one alert per land per day
 * (rule HARVEST_CONFIRM_QUESTION, trigger_data.question.type 'HARVEST_CONFIRM').
 *
 * This file only reads those dates. Days left are counted on the phone from
 * release_on so the countdown is right even before that day's alert is seeded.
 */

export const HARVEST_QUESTION_RULE_CODE = 'HARVEST_CONFIRM_QUESTION';

/** The question block the evaluator writes into trigger_data. */
export interface HarvestQuestion {
  type: 'HARVEST_CONFIRM';
  land_id: string;
  schedule_id: string;
  crop_code: string | null;
  sowing_date: string | null;
  harvest_date: string;
  harvest_basis: string;
  release_on: string;
  max_expected_date: string | null;
}

export interface HarvestCardAlert {
  id: string;
  land_id: string | null;
  rule_id: string | null;
  status: string;
  created_at: string;
  expires_at?: string | null;
  trigger_data: Record<string, unknown> | null;
}

export interface HarvestCard {
  alertId: string;
  landId: string;
  landName: string | null;
  question: HarvestQuestion;
}

/** Local calendar day as YYYY-MM-DD (the farmer's own day, not UTC). */
export function localDayIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD -> local Date at midnight. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Whole days from `todayIso` to `release_on` (0 = released today). */
export function daysLeft(releaseOn: string, todayIso: string): number {
  return Math.round((parseDay(releaseOn).getTime() - parseDay(todayIso).getTime()) / 86_400_000);
}

export function harvestQuestionOf(alert: Pick<HarvestCardAlert, 'trigger_data'>): HarvestQuestion | null {
  const q = (alert.trigger_data?.question ?? null) as Partial<HarvestQuestion> | null;
  if (!q || q.type !== 'HARVEST_CONFIRM' || !q.harvest_date || !q.release_on || !q.land_id) return null;
  return q as HarvestQuestion;
}

const LIVE = new Set(['PENDING', 'DELIVERED', 'SEEN']);

/**
 * The cards to show on app open: the newest live harvest card per land, only while
 * today is after the harvest date and before the release day, minus lands the
 * farmer already put off today ("remind me tomorrow").
 */
export function pickHarvestCards(
  alerts: HarvestCardAlert[],
  todayIso: string,
  putOffToday: (landId: string) => boolean = () => false,
): HarvestCard[] {
  const newestByLand = new Map<string, HarvestCardAlert>();
  for (const a of alerts) {
    if (a.rule_id !== HARVEST_QUESTION_RULE_CODE || !LIVE.has(a.status)) continue;
    const q = harvestQuestionOf(a);
    if (!q) continue;
    const prev = newestByLand.get(q.land_id);
    if (!prev || prev.created_at < a.created_at) newestByLand.set(q.land_id, a);
  }
  const cards: HarvestCard[] = [];
  for (const a of newestByLand.values()) {
    const q = harvestQuestionOf(a)!;
    if (!(todayIso > q.harvest_date.slice(0, 10))) continue;
    if (daysLeft(q.release_on, todayIso) <= 0) continue;
    if (putOffToday(q.land_id)) continue;
    const landName = typeof a.trigger_data?.land_name === 'string' ? a.trigger_data.land_name : null;
    cards.push({ alertId: a.id, landId: q.land_id, landName, question: q });
  }
  // the land closest to release first
  return cards.sort((x, y) => x.question.release_on.localeCompare(y.question.release_on));
}

/** "Harvest done" dates: after sowing, up to today. */
export function harvestDateAllowed(day: Date, q: HarvestQuestion, todayIso: string): boolean {
  const iso = localDayIso(day);
  if (iso > todayIso) return false;
  if (q.sowing_date && iso <= q.sowing_date.slice(0, 10)) return false;
  return true;
}

/** "Crop still in the field" dates: after today, up to the crop's harvest-window end. */
export function expectedDateAllowed(day: Date, q: HarvestQuestion, todayIso: string): boolean {
  const iso = localDayIso(day);
  if (iso <= todayIso) return false;
  return !!q.max_expected_date && iso <= q.max_expected_date.slice(0, 10);
}

/** "Crop still in the field" is offered only while a later date is still possible. */
export function canReportStillInField(q: HarvestQuestion, todayIso: string): boolean {
  return !!q.max_expected_date && q.max_expected_date.slice(0, 10) > todayIso;
}

const PUT_OFF_KEY = 'ks_harvest_card_put_off';

/** "Remind me tomorrow" — a per-phone convenience; the database is unaffected. */
export function readPutOff(todayIso: string): Set<string> {
  try {
    const raw = localStorage.getItem(PUT_OFF_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return new Set(Object.entries(parsed).filter(([, day]) => day === todayIso).map(([land]) => land));
  } catch {
    return new Set();
  }
}

export function putOffUntilTomorrow(landId: string, todayIso: string): void {
  try {
    const raw = localStorage.getItem(PUT_OFF_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    // keep only today's entries so the store never grows
    const next: Record<string, string> = {};
    for (const [land, day] of Object.entries(parsed)) if (day === todayIso) next[land] = day;
    next[landId] = todayIso;
    localStorage.setItem(PUT_OFF_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the card simply shows again next time */
  }
}
