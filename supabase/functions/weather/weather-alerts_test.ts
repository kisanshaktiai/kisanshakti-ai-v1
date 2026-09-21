import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { selectCurrentDistrictWarning, toCurrentWeatherAlert } from "./weather-alerts.ts";
import type { ImdWarning } from "./imd-provider.ts";

const now = new Date("2026-09-21T06:00:00.000Z");
const warning = (district: string, color: number, from: string, to: string): ImdWarning => ({
  district, obj_id: "district-1", day: 1, alert_types: ["HEAVY_RAIN"],
  severity: color === 1 ? "severe" : "moderate", color_code: color,
  valid_from: from, valid_to: to, issued_at: "2026-09-21T00:00:00.000Z",
});

Deno.test("selects only a current warning for the requested district", () => {
  const selected = selectCurrentDistrictWarning([
    warning("Pune", 1, "2026-09-21T00:00:00.000Z", "2026-09-22T00:00:00.000Z"),
    warning("Kolhapur", 2, "2026-09-20T00:00:00.000Z", "2026-09-21T00:00:00.000Z"),
    warning("Kolhapur District", 3, "2026-09-21T00:00:00.000Z", "2026-09-22T00:00:00.000Z"),
  ], "Kolhapur", now);
  assertEquals(selected?.color_code, 3);
  if (!selected) throw new Error("Expected current district warning");
  assertEquals(toCurrentWeatherAlert(selected).provider, "IMD");
});

Deno.test("returns no alert when location does not match", () => {
  assertEquals(selectCurrentDistrictWarning([
    warning("Pune", 1, "2026-09-21T00:00:00.000Z", "2026-09-22T00:00:00.000Z"),
  ], "Kolhapur", now), null);
});