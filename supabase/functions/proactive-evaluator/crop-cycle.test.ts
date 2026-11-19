/**
 * v133 (2026-11-19) — crop-cycle gate.
 * Inputs mirror the live lands / crop_schedules rows of 2026-11-19 (31 active
 * land records: 23 AVAILABLE with no active schedule, 8 CROP_ACTIVE each with
 * one active sown schedule; 3 of those 8 schedules still read PLANNED).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cropCycleGate } from "./crop-cycle.ts";

type Sched = { sowing_date: string; crop_name: string; cultivation_method: string | null; expected_harvest_date: string | null };
const sched = (crop: string, sow: string, harvest: string | null = null): Sched =>
  ({ sowing_date: sow, crop_name: crop, cultivation_method: null, expected_harvest_date: harvest });

Deno.test("harvested and released (Vadd farm: wheat harvested 2026-04-25, NDVI 0.629 on 2026-11-14) → held", () => {
  const g = cropCycleGate("AVAILABLE", null);
  assertEquals(g, { active: false, reason: "no_active_sown_schedule" });
});

Deno.test("cancelled schedule, no replacement (Chrysanthemum, Khari) → held", () => {
  assertEquals(cropCycleGate("AVAILABLE", undefined).active, false);
});

Deno.test("standing crop whose schedule still reads PLANNED (Kodoli Mala) → active, schedule dates win over the land row", () => {
  // the land row says last_sowing_date 2025-06-15 (last year); the schedule says 2026-06-08
  const g = cropCycleGate("CROP_ACTIVE", sched("Rice", "2026-06-08", "2026-10-26"));
  assert(g.active);
  if (g.active) {
    assertEquals(g.schedule.sowing_date, "2026-06-08");
    assertEquals(g.schedule.crop_name, "Rice");
  }
});

Deno.test("crop at maturity, harvest not confirmed yet → still active (advice on the standing crop continues)", () => {
  assert(cropCycleGate("WAITING_HARVEST_CONFIRMATION", sched("Sugarcane", "2025-12-15", "2026-11-20")).active);
  assert(cropCycleGate("READY_FOR_HARVEST", sched("Sugarcane", "2025-12-15")).active);
});

Deno.test("active schedule but the land says released → held as a conflict, never guessed", () => {
  assertEquals(cropCycleGate("AVAILABLE", sched("Rice", "2026-06-08")), { active: false, reason: "land_released" });
  assertEquals(cropCycleGate("HARVEST_COMPLETED", sched("Rice", "2026-06-08")), { active: false, reason: "land_released" });
  assertEquals(cropCycleGate(" available ", sched("Rice", "2026-06-08")).active, false);
});

Deno.test("lifecycle missing or a non-crop state → held (fail closed: never speak about an unconfirmed crop)", () => {
  assertEquals(cropCycleGate(null, sched("Groundnut", "2026-06-03")), { active: false, reason: "land_released" });
  assertEquals(cropCycleGate("PREPARING", sched("Groundnut", "2026-06-03")).active, false);
});

Deno.test("auto-closed crop (run_daily_crop_cycle_close) → held; next crop saved → active again on the new schedule", () => {
  // after the close the schedule is inactive (not in scheduleMap) and the land is AVAILABLE
  assertEquals(cropCycleGate("AVAILABLE", null).active, false);
  // the farmer saves the next crop: fn_block_double_active_schedule sets CROP_ACTIVE
  const g = cropCycleGate("CROP_ACTIVE", sched("Wheat", "2026-11-15"));
  assert(g.active);
  if (g.active) assertEquals(g.schedule.crop_name, "Wheat");
});

Deno.test("live snapshot 2026-11-19: 23 held, 8 active; every land carrying a pending alert while AVAILABLE is held", () => {
  // [land id prefix, lifecycle_status, has active sown schedule, live alerts]
  const live: Array<[string, string, boolean, number]> = [
    ["06c8de52", "AVAILABLE", false, 1], ["cbb82a43", "AVAILABLE", false, 1], ["8ff22346", "AVAILABLE", false, 1],
    ["879e229f", "AVAILABLE", false, 1], ["7329d635", "AVAILABLE", false, 1], ["8e888403", "AVAILABLE", false, 1],
    ["358adbb0", "AVAILABLE", false, 1], ["4af38aa2", "AVAILABLE", false, 1], ["8a6d4a98", "AVAILABLE", false, 0],
    ["08d80324", "AVAILABLE", false, 1], ["033c81da", "AVAILABLE", false, 1], ["714f7464", "AVAILABLE", false, 1],
    ["ca9687fa", "AVAILABLE", false, 2], ["6e06302e", "AVAILABLE", false, 0], ["5805d831", "AVAILABLE", false, 1],
    ["0e279788", "AVAILABLE", false, 1], ["91c08b3f", "AVAILABLE", false, 1], ["d094ed13", "AVAILABLE", false, 1],
    ["50075ca6", "AVAILABLE", false, 1], ["3b10c80d", "AVAILABLE", false, 0], ["e2965883", "AVAILABLE", false, 1],
    ["592259ac", "AVAILABLE", false, 1], ["3a8e83d0", "AVAILABLE", false, 1],
    ["8897e53d", "CROP_ACTIVE", true, 1], ["25f98741", "CROP_ACTIVE", true, 0], ["3307fac1", "CROP_ACTIVE", true, 1],
    ["6b0d9b65", "CROP_ACTIVE", true, 1], ["e3cc058a", "CROP_ACTIVE", true, 1], ["a652f408", "CROP_ACTIVE", true, 1],
    ["30197c15", "CROP_ACTIVE", true, 1], ["dcd8f946", "CROP_ACTIVE", true, 1],
  ];
  const gated = live.map(([id, lc, has, alerts]) => ({ id, alerts, g: cropCycleGate(lc, has ? sched("X", "2026-06-01") : null) }));
  assertEquals(gated.length, 31);
  assertEquals(gated.filter((x) => !x.g.active).length, 23);
  assertEquals(gated.filter((x) => x.g.active).length, 8);
  // the 21 pending alerts on released lands all sit on held lands; the 7 on standing crops stay with active lands
  assertEquals(gated.filter((x) => !x.g.active).reduce((s, x) => s + x.alerts, 0), 21);
  assertEquals(gated.filter((x) => x.g.active).reduce((s, x) => s + x.alerts, 0), 7);
});
