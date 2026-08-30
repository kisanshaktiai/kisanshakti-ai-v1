// ============================================================================
// BACKFILL HISTORICAL WEATHER (FIX H)
// supabase/functions/backfill-historical-weather/index.ts
//
// CHANGE LOG
//   2026-08-22 — created. One-shot (idempotent) ERA5 reanalysis backfill so
//                cumulative GDD covers the whole season instead of ~3 weeks.
//
// WHY: no weather rows existed before ~2026-08-04, so land_gdd_daily measured
// only the last few weeks. Mature cane/rice read germination-range GDD and
// [0,600]-gated rules mis-fired. This function fetches Open-Meteo's free ERA5
// archive per 0.1° cell and upserts it into weather_aggregates as
// temp_source='reanalysis', then recomputes GDD through the canonical DB RPC.
//
// INVARIANTS
//   • This function NEVER writes land_gdd_daily directly. The only GDD writer
//     is public.recompute_land_gdd_daily / accumulate_gdd_for_land.
//   • Rows already labelled temp_source='observed' are never overwritten.
//   • Idempotent: a second run upserts identical values (0 effective changes).
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const DEFAULT_END_DATE = "2026-08-03"; // observed data starts ~2026-08-04
const MAX_CELLS_PER_RUN = 40;

function canonicalLocationKey(lat: number, lon: number): string {
  return `${lat.toFixed(1)},${lon.toFixed(1)}`;
}

async function fetchArchive(lat: number, lon: number, from: string, to: string) {
  const url = `${ARCHIVE_URL}?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
    `&start_date=${from}&end_date=${to}` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FKolkata`;

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      lastErr = `HTTP ${res.status}`;
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      lastErr = String(e);
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw new Error(`open-meteo archive failed (${lat},${lon}): ${lastErr}`);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const endDate: string = body.end_date ?? DEFAULT_END_DATE;
  const dryRun: boolean = body.dry_run === true;
  const cellLimit: number = Math.min(Number(body.cell_limit ?? MAX_CELLS_PER_RUN), MAX_CELLS_PER_RUN);
  const skipRecompute: boolean = body.skip_recompute === true;

  const report: Record<string, unknown> = { started_at: new Date().toISOString(), end_date: endDate };

  try {
    // ── 1. Target cells ─────────────────────────────────────────────────────
    const { data: lands, error: landErr } = await supabase
      .from("lands")
      .select("id, tenant_id, center_lat, center_lon, gdd_anchor_date")
      .not("gdd_anchor_date", "is", null);
    if (landErr) throw new Error(`lands query failed: ${landErr.message}`);

    type Cell = { lat: number; lon: number; from: string; tenant_id: string };
    const cells = new Map<string, Cell>();
    for (const l of lands ?? []) {
      const lat = Math.round(Number(l.center_lat) * 10) / 10;
      const lon = Math.round(Number(l.center_lon) * 10) / 10;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const key = canonicalLocationKey(lat, lon);
      const from = String(l.gdd_anchor_date).slice(0, 10);
      const prev = cells.get(key);
      if (!prev) cells.set(key, { lat, lon, from, tenant_id: l.tenant_id as string });
      else if (from < prev.from) prev.from = from;
    }

    report.cells_total = cells.size;
    const targets = [...cells.entries()].slice(0, cellLimit);

    // ── 2/3. Fetch + upsert ─────────────────────────────────────────────────
    let rowsWritten = 0;
    let rowsSkippedObserved = 0;
    const cellResults: unknown[] = [];

    for (const [key, cell] of targets) {
      if (cell.from >= endDate) {
        cellResults.push({ cell: key, skipped: "anchor_after_end_date" });
        continue;
      }
      const json = await fetchArchive(cell.lat, cell.lon, cell.from, endDate);
      const dates: string[] = json?.daily?.time ?? [];
      const tmax: (number | null)[] = json?.daily?.temperature_2m_max ?? [];
      const tmin: (number | null)[] = json?.daily?.temperature_2m_min ?? [];

      // Existing rows for this cell — never overwrite observed measurements.
      const { data: existing } = await supabase
        .from("weather_aggregates")
        .select("aggregate_date, temp_source")
        .eq("location_key", key)
        .is("land_id", null)
        .gte("aggregate_date", cell.from)
        .lte("aggregate_date", endDate);
      const observedDates = new Set(
        (existing ?? []).filter((r) => r.temp_source === "observed").map((r) => String(r.aggregate_date)),
      );

      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const mx = tmax[i];
        const mn = tmin[i];
        if (mx == null || mn == null) continue;
        if (observedDates.has(d)) { rowsSkippedObserved++; continue; }
        rows.push({
          tenant_id: cell.tenant_id,
          farmer_id: null,
          land_id: null,
          location_key: key,
          aggregate_date: d,
          temp_max_celsius: mx,
          temp_min_celsius: mn,
          temp_avg_celsius: Math.round(((mx + mn) / 2) * 10) / 10,
          temp_source: "reanalysis",
          observation_count: 1,
          updated_at: new Date().toISOString(),
        });
      }

      if (!dryRun && rows.length) {
        // Chunked upsert on the natural key so re-runs are no-ops.
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await supabase
            .from("weather_aggregates")
            .upsert(chunk, { onConflict: "tenant_id,location_key,aggregate_date,land_id" });
          if (error) throw new Error(`upsert failed for ${key}: ${error.message}`);
        }
      }
      rowsWritten += rows.length;
      cellResults.push({ cell: key, from: cell.from, days: dates.length, upserted: rows.length });
    }

    report.rows_written = rowsWritten;
    report.rows_skipped_observed = rowsSkippedObserved;
    report.cells = cellResults;

    // ── 4. Recompute GDD through the canonical DB function ──────────────────
    if (!dryRun && !skipRecompute) {
      let ok = 0;
      const failures: unknown[] = [];
      for (const l of lands ?? []) {
        const { error } = await supabase.rpc("recompute_land_gdd_daily", { p_land_id: l.id });
        if (error) failures.push({ land_id: l.id, error: error.message });
        else ok++;
      }
      report.recomputed_lands = ok;
      report.recompute_failures = failures;
    }

    report.finished_at = new Date().toISOString();
    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    report.error = String(e);
    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
