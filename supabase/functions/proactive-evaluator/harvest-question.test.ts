/**
 * 2026-11-19 — daily harvest card seeder. Plan rows mirror crop_cycle_close_plan
 * output on 2026-11-19 (rolled-back test on the live database): Kodoli Mala rice,
 * Indrayani direct-seeded, harvest 26 Oct by variety duration, release 29 Nov;
 * sugarcane Mala, no variety, harvest window end 9 Jan 2027 — no card yet.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildHarvestQuestionAlerts,
  buildHarvestQuestionRow,
  formatDayMonthYear,
  HARVEST_QUESTION_RULE_CODE,
  harvestWindowLandIds,
  loadHarvestPlan,
  nextDay,
  type ClosePlanRow,
  type HarvestPlan,
} from "./harvest-question.ts";

const ui = {
  get: (key: string, lang: string) =>
    ({
      "harvest.question.title|en": "Is the harvest of {{land}} done?",
      "harvest.question.body|en": "Due {{harvest_date}}, freed on {{release_on}}.",
      "harvest.question.title|mr": "{{land}} ची काढणी झाली का?",
    } as Record<string, string>)[`${key}|${lang}`] ?? "",
};

const ctx = { land_id: "8897e53d", farmer_id: "f1", tenant_id: "t1", land_name: "Kodoli Mala" };
const riceDue: ClosePlanRow = {
  schedule_id: "2bb0f84c", land_id: "8897e53d", crop_code: "rice", sowing_date: "2026-06-08", transplant_date: null,
  harvest_date: "2026-10-26", harvest_basis: "variety_duration", harvest_window_end: "2026-11-15",
  max_expected_date: "2026-11-15", release_on: "2026-11-29", days_left: 10, card_due: true,
};
const deps = { todayStr: "2026-11-19", isDuplicate: () => false };

Deno.test("card due: one HIGH harvest card carrying the plan's dates, valid until the release day", () => {
  const row = buildHarvestQuestionRow(ctx, riceDue, ui, deps);
  assert(row);
  assertEquals(row.rule_id, HARVEST_QUESTION_RULE_CODE);
  assertEquals(row.alert_category, "HARVEST_TIMING");
  assertEquals(row.dedup_key, "HARVEST_Q:2bb0f84c:2026-11-19");
  assertEquals(row.expires_at, "2026-11-29T00:00:00Z");
  assertEquals(row.trigger_data.question.type, "HARVEST_CONFIRM");
  assertEquals(row.trigger_data.question.release_on, "2026-11-29");
  assertEquals(row.trigger_data.question.harvest_date, "2026-10-26");
  assertEquals(row.trigger_data.question.max_expected_date, "2026-11-15");
  assertEquals(row.title_en, "Is the harvest of Kodoli Mala done?");
  assertEquals(row.message_en, "Due 26-10-2026, freed on 29-11-2026.");
  assertEquals(row.title_mr, "Kodoli Mala ची काढणी झाली का?");
  // a language with no row falls back to nothing here (the loader falls back to English)
  assertEquals(row.message_hi, "");
});

Deno.test("no card when the plan says no (before the harvest date, or no plan row)", () => {
  assertEquals(buildHarvestQuestionRow(ctx, { ...riceDue, card_due: false }, ui, deps), null);
  assertEquals(buildHarvestQuestionRow(ctx, undefined, ui, deps), null);
  assertEquals(buildHarvestQuestionRow(ctx, { ...riceDue, release_on: null }, ui, deps), null);
});

Deno.test("one card per land per day: today's dedup key already present → nothing; no rule cooldown", () => {
  let seenCooldown = -1;
  const row = buildHarvestQuestionRow(ctx, riceDue, ui, {
    todayStr: "2026-11-19",
    isDuplicate: (key, _rule, _land, cooldown) => { seenCooldown = cooldown; return key === "HARVEST_Q:2bb0f84c:2026-11-19"; },
  });
  assertEquals(row, null);
  assertEquals(seenCooldown, 0);
});

Deno.test("dates in the stored text are numeric day-month-year", () => {
  assertEquals(formatDayMonthYear("2027-01-05"), "05-01-2027");
  assertEquals(formatDayMonthYear(null), "");
});

const caneNotYet: ClosePlanRow = { ...riceDue, schedule_id: "607ff3cc", land_id: "3307fac1", crop_code: "sugarcane",
  harvest_date: "2027-01-09", harvest_basis: "crop_harvest_window", release_on: "2027-01-19", days_left: 61, card_due: false };
const uiTable = { from: () => ({ select: () => ({ like: () => Promise.resolve({ data: [
  { ui_key: "harvest.question.title", language_code: "en", display_text: "Is the harvest of {{land}} done?" },
] }) }) }) };
const planOf = (today: ClosePlanRow[], tomorrow: ClosePlanRow[] = today): HarvestPlan => ({
  today: new Map(today.map((p) => [p.land_id, p])),
  tomorrow: new Map(tomorrow.map((p) => [p.land_id, p])),
});

Deno.test("nextDay crosses month and year ends", () => {
  assertEquals(nextDay("2026-11-19"), "2026-11-20");
  assertEquals(nextDay("2026-11-30"), "2026-12-01");
  assertEquals(nextDay("2026-12-31"), "2027-01-01");
});

Deno.test("H1: due tomorrow (today is the harvest date) → the card is seeded today with today's dates", () => {
  const todayRow = { ...riceDue, harvest_date: "2026-11-19", card_due: false, max_expected_date: "2026-11-29" };
  const tomorrowRow = { ...riceDue, harvest_date: "2026-11-19", card_due: true, max_expected_date: "2026-11-30" };
  const row = buildHarvestQuestionRow(ctx, todayRow, ui, deps, tomorrowRow);
  assert(row);
  assertEquals(row.dedup_key, "HARVEST_Q:2bb0f84c:2026-11-19");
  // never more permissive than what the database accepts today
  assertEquals(row.trigger_data.question.max_expected_date, "2026-11-29");
  // not due today and not due tomorrow → nothing
  assertEquals(buildHarvestQuestionRow(ctx, todayRow, ui, deps, { ...tomorrowRow, card_due: false }), null);
});

Deno.test("H2: only lands whose card is due today are in the harvest window", () => {
  const dueTomorrowOnly = { ...riceDue, land_id: "dcd8f946", card_due: false };
  const plan = planOf([riceDue, caneNotYet, dueTomorrowOnly], [riceDue, caneNotYet, { ...dueTomorrowOnly, card_due: true }]);
  assertEquals([...harvestWindowLandIds(plan)], ["8897e53d"]);
  assertEquals(harvestWindowLandIds(null).size, 0);
});

Deno.test("plan is read once per run for today and tomorrow; a failed read gives null", async () => {
  const asOf: unknown[] = [];
  const fake = { rpc: (name: string, args: Record<string, unknown>) => {
    assertEquals(name, "crop_cycle_close_plan");
    asOf.push(args.p_as_of);
    return Promise.resolve({ data: [riceDue, caneNotYet], error: null });
  } };
  const plan = await loadHarvestPlan(fake, "2026-11-19");
  assert(plan);
  assertEquals(asOf, ["2026-11-19", "2026-11-20"]);
  assertEquals(plan.today.get("8897e53d")?.release_on, "2026-11-29");
  const failing = { rpc: () => Promise.resolve({ data: null, error: { message: "boom" } }) };
  assertEquals(await loadHarvestPlan(failing, "2026-11-19"), null);
});

Deno.test("seeder seeds only lands whose card is due, from the run's plan", async () => {
  const rows = await buildHarvestQuestionAlerts(uiTable, [ctx, { ...ctx, land_id: "3307fac1", land_name: "Mala" }], deps,
    planOf([riceDue, caneNotYet]));
  assertEquals(rows.length, 1);
  assertEquals(rows[0].land_id, "8897e53d");
  // a language without its own row falls back to English
  assertEquals(rows[0].title_hi, "Is the harvest of Kodoli Mala done?");
});

Deno.test("no plan (read failed) → no cards, no throw", async () => {
  const fake = { from: () => { throw new Error("not reached"); } };
  assertEquals(await buildHarvestQuestionAlerts(fake, [ctx], deps, null), []);
});
