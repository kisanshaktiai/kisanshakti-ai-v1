// ============================================================================
// ENV-INTELLIGENCE API  —  supabase/functions/env-intelligence/index.ts
//
// Read-only serving layer over the Environmental Intelligence observation
// spine. Additive: it never writes, and it never touches the `weather`
// function contract.
//
// CHANGE LOG
// 2026-08-07 12:40 UTC — Initial implementation (PROMPT 5).
//
// Routes (path-based, GET only):
//   GET /observations?land_id|cell_key&property&from&to&kind&latest_issue
//   GET /lands/:id/state
//   GET /lands/:id/timeline?property&past_days&forecast_days
//   GET /observations/:id/lineage
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { resolveTenantFromRequest } from "../_shared/tenantMiddleware.ts";
import { corsHeaders } from "../_shared/cors.ts";

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };

type Role = "farmer" | "agronomist" | "admin";

const ELEVATED_ROLES: Record<string, Role> = {
  super_admin: "admin",
  tenant_admin: "admin",
  tenant_manager: "agronomist",
  tenant_viewer: "agronomist",
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function jwtSub(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const parts = auth.slice(7).trim().split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Farmer by default. Elevated only for an explicit public.user_roles row. */
async function resolveRole(req: Request, supabase: SupabaseClient): Promise<Role> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (serviceKey && token && token === serviceKey) return "admin";

  const sub = jwtSub(req);
  if (!sub) return "farmer";
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", sub);
  let best: Role = "farmer";
  for (const row of data ?? []) {
    const mapped = ELEVATED_ROLES[String(row.role)];
    if (mapped === "admin") return "admin";
    if (mapped === "agronomist") best = "agronomist";
  }
  return best;
}

// ── Reference data caches (per isolate) ─────────────────────────────────────
interface PropertyMeta {
  property_code: string;
  display_name: string | null;
  unit: string | null;
  value_kind: string | null;
  farmer_visible: boolean;
}
let propertyCache: Map<string, PropertyMeta> | null = null;
let sourceCache: Map<string, { source_kind: string; source_code: string | null }> | null = null;

async function getProperties(supabase: SupabaseClient) {
  if (propertyCache) return propertyCache;
  const { data } = await supabase
    .from("env_property_master")
    .select("property_code, display_name, unit, value_kind, farmer_visible");
  const map = new Map<string, PropertyMeta>();
  for (const r of data ?? []) {
    map.set(r.property_code, {
      property_code: r.property_code,
      display_name: r.display_name,
      unit: r.unit,
      value_kind: r.value_kind,
      farmer_visible: r.farmer_visible !== false,
    });
  }
  propertyCache = map;
  return map;
}

async function getSources(supabase: SupabaseClient) {
  if (sourceCache) return sourceCache;
  const { data } = await supabase
    .from("env_source_registry")
    .select("source_id, source_kind, source_code");
  const map = new Map<string, { source_kind: string; source_code: string | null }>();
  for (const r of data ?? []) {
    map.set(r.source_id, { source_kind: r.source_kind, source_code: r.source_code });
  }
  sourceCache = map;
  return map;
}

/**
 * Farmer-facing allowlist. Properties flagged farmer_visible = false are
 * removed entirely; commercial provider identity (source_code) is never
 * exposed — only source_kind.
 */
function isVisible(role: Role, meta: PropertyMeta | undefined): boolean {
  if (role !== "farmer") return true;
  if (!meta) return false; // unknown property -> withheld from farmers
  return meta.farmer_visible;
}

// ── Route helpers ───────────────────────────────────────────────────────────

function segmentsOf(url: URL): string[] {
  const raw = url.pathname.split("/").filter(Boolean);
  const idx = raw.indexOf("env-intelligence");
  return idx >= 0 ? raw.slice(idx + 1) : raw;
}

function kindFilter(kind: string | null) {
  // horizon_hours <= 0 => measured/analysis, > 0 => forecast.
  if (kind === "forecast") return { op: "gt", value: 0 };
  if (kind === "measured") return { op: "lte", value: 0 };
  return null;
}

interface ObsRow {
  obs_id: number;
  property_code: string;
  valid_time: string;
  issue_time: string | null;
  horizon_hours: number | null;
  value: number | null;
  u_std: number | null;
  confidence: number | null;
  qc_level: number | null;
  source_id: string | null;
}

/** Keep only the newest issue per (property_code, valid_time). */
function latestIssueOnly(rows: ObsRow[]): ObsRow[] {
  const best = new Map<string, ObsRow>();
  for (const r of rows) {
    const key = `${r.property_code}|${r.valid_time}`;
    const prev = best.get(key);
    if (!prev || String(r.issue_time ?? "") > String(prev.issue_time ?? "")) best.set(key, r);
  }
  return [...best.values()].sort((a, b) => a.valid_time.localeCompare(b.valid_time));
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleObservations(
  supabase: SupabaseClient,
  url: URL,
  role: Role,
  tenantId: string | null,
) {
  const landId = url.searchParams.get("land_id");
  const cellKey = url.searchParams.get("cell_key");
  if (!landId && !cellKey) {
    return json({ error: "land_id or cell_key is required", code: "MISSING_SCOPE" }, 400);
  }

  const properties = url.searchParams.getAll("property").flatMap((p) => p.split(","));
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const kind = url.searchParams.get("kind");
  const latestIssue = url.searchParams.get("latest_issue") !== "false";

  if (landId) {
    const ok = await landInScope(supabase, landId, tenantId, role);
    if (!ok) return json({ error: "Land not found in tenant scope", code: "LAND_NOT_FOUND" }, 404);
  }

  let q = supabase
    .from("env_observations")
    .select(
      "obs_id, property_code, valid_time, issue_time, horizon_hours, value, u_std, confidence, qc_level, source_id",
    )
    .is("superseded_by", null)
    .order("valid_time", { ascending: true })
    .limit(2000);

  if (landId) q = q.eq("land_id", landId);
  else q = q.eq("cell_key", cellKey!);
  if (properties.length) q = q.in("property_code", properties.map((p) => p.trim().toUpperCase()));
  if (from) q = q.gte("valid_time", from);
  if (to) q = q.lte("valid_time", to);

  const kf = kindFilter(kind);
  if (kf?.op === "gt") q = q.gt("horizon_hours", 0);
  if (kf?.op === "lte") q = q.lte("horizon_hours", 0);

  const { data, error } = await q;
  if (error) return json({ error: error.message, code: "QUERY_FAILED" }, 500);

  const propMeta = await getProperties(supabase);
  const sources = await getSources(supabase);
  let rows = (data ?? []) as ObsRow[];
  if (latestIssue) rows = latestIssueOnly(rows);

  const points = rows
    .filter((r) => isVisible(role, propMeta.get(r.property_code)))
    .map((r) => {
      const meta = propMeta.get(r.property_code);
      const src = r.source_id ? sources.get(r.source_id) : undefined;
      return {
        obs_id: r.obs_id,
        property: r.property_code,
        display_name: meta?.display_name ?? r.property_code,
        value: r.value === null ? null : Number(r.value),
        unit: meta?.unit ?? null,
        confidence: r.confidence === null ? null : Number(r.confidence),
        u_std: r.u_std === null ? null : Number(r.u_std),
        qc_level: r.qc_level,
        // Provider identity (source_code) is intentionally withheld from farmers.
        source_kind: src?.source_kind ?? null,
        ...(role === "farmer" ? {} : { source_code: src?.source_code ?? null }),
        valid_time: r.valid_time,
        horizon_hours: r.horizon_hours,
      };
    });

  return json({ scope: landId ? { land_id: landId } : { cell_key: cellKey }, count: points.length, points });
}

async function landInScope(
  supabase: SupabaseClient,
  landId: string,
  tenantId: string | null,
  role: Role,
): Promise<boolean> {
  const { data } = await supabase.from("lands").select("id, tenant_id").eq("id", landId).maybeSingle();
  if (!data) return false;
  if (role === "admin") return true;
  if (tenantId && data.tenant_id && data.tenant_id !== tenantId) return false;
  return true;
}

async function handleLandState(
  supabase: SupabaseClient,
  landId: string,
  role: Role,
  tenantId: string | null,
) {
  const ok = await landInScope(supabase, landId, tenantId, role);
  if (!ok) return json({ error: "Land not found in tenant scope", code: "LAND_NOT_FOUND" }, 404);

  const [stateRes, episodeRes, gddRes] = await Promise.all([
    supabase
      .from("land_weather_state")
      .select("*")
      .eq("land_id", landId)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("risk_episodes")
      .select("episode_id, risk_code, phase, current_value, peak_value, confidence, started_at, phase_updated_at")
      .eq("land_id", landId)
      .neq("phase", "ended")
      .order("phase_updated_at", { ascending: false }),
    supabase
      .from("land_gdd_daily")
      .select("obs_date, cumulative_gdd, daily_gdd")
      .eq("land_id", landId)
      .order("obs_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const row = stateRes.data as Record<string, unknown> | null;
  if (!row) {
    return json(
      { land_id: landId, state: null, active_episodes: [], gdd: null, role },
      200,
      { "Cache-Control": "private, max-age=900" },
    );
  }

  // Fields never shown to farmers regardless of property master coverage.
  const FARMER_BLOCKLIST = new Set([
    "cell_key",
    "tenant_id",
    "source",
    "humidity_percent",
    "wind_speed_kmh",
  ]);
  const propMeta = await getProperties(supabase);
  const COLUMN_PROPERTY: Record<string, string> = {
    temperature_c: "AIR_TEMP",
    humidity_percent: "RH",
    wind_speed_kmh: "WIND_2M",
    total_rainfall_mm: "RAIN",
    et0_pm: "ET0",
    et0_mm: "ET0",
    vpd_kpa: "VPD",
  };

  const state: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (role === "farmer") {
      if (FARMER_BLOCKLIST.has(k)) continue;
      const propCode = COLUMN_PROPERTY[k];
      if (propCode && !isVisible(role, propMeta.get(propCode))) continue;
    }
    state[k] = v;
  }

  const episodes = (episodeRes.data ?? []).map((e) => ({
    episode_id: e.episode_id,
    risk_code: e.risk_code,
    phase: e.phase,
    current_value: e.current_value === null ? null : Number(e.current_value),
    peak_value: e.peak_value === null ? null : Number(e.peak_value),
    confidence: e.confidence === null ? null : Number(e.confidence),
    started_at: e.started_at,
    phase_updated_at: e.phase_updated_at,
  }));

  return json(
    {
      land_id: landId,
      role,
      state,
      active_episodes: episodes,
      gdd: gddRes.data
        ? {
            obs_date: gddRes.data.obs_date,
            cumulative_gdd: Number(gddRes.data.cumulative_gdd ?? 0),
            daily_gdd: gddRes.data.daily_gdd === null ? null : Number(gddRes.data.daily_gdd),
          }
        : null,
    },
    200,
    { "Cache-Control": "private, max-age=900" },
  );
}

async function handleTimeline(
  supabase: SupabaseClient,
  landId: string,
  url: URL,
  role: Role,
  tenantId: string | null,
) {
  const ok = await landInScope(supabase, landId, tenantId, role);
  if (!ok) return json({ error: "Land not found in tenant scope", code: "LAND_NOT_FOUND" }, 404);

  const properties = (url.searchParams.getAll("property").flatMap((p) => p.split(",")))
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  const pastDays = Math.min(60, Math.max(0, Number(url.searchParams.get("past_days") ?? 14) || 14));
  const forecastDays = Math.min(16, Math.max(0, Number(url.searchParams.get("forecast_days") ?? 7) || 7));

  const now = Date.now();
  const from = new Date(now - pastDays * 86400000).toISOString();
  const to = new Date(now + forecastDays * 86400000).toISOString();

  const propMeta = await getProperties(supabase);
  const visibleProps = properties.filter((p) => isVisible(role, propMeta.get(p)));
  if (properties.length && visibleProps.length === 0) {
    return json({ land_id: landId, series: [] }, 200, { "Cache-Control": "private, max-age=900" });
  }

  let q = supabase
    .from("env_observations")
    .select("obs_id, property_code, valid_time, issue_time, horizon_hours, value, u_std, confidence, qc_level, source_id")
    .eq("land_id", landId)
    .is("superseded_by", null)
    .gte("valid_time", from)
    .lte("valid_time", to)
    .order("valid_time", { ascending: true })
    .limit(3000);
  if (visibleProps.length) q = q.in("property_code", visibleProps);

  const { data, error } = await q;
  if (error) return json({ error: error.message, code: "QUERY_FAILED" }, 500);

  const rows = latestIssueOnly((data ?? []) as ObsRow[]).filter((r) =>
    isVisible(role, propMeta.get(r.property_code)),
  );

  const grouped = new Map<string, unknown[]>();
  for (const r of rows) {
    const arr = grouped.get(r.property_code) ?? [];
    arr.push({
      valid_time: r.valid_time,
      value: r.value === null ? null : Number(r.value),
      u_std: r.u_std === null ? null : Number(r.u_std),
      confidence: r.confidence === null ? null : Number(r.confidence),
      is_forecast: (r.horizon_hours ?? 0) > 0,
    });
    grouped.set(r.property_code, arr);
  }

  return json(
    {
      land_id: landId,
      window: { from, to, past_days: pastDays, forecast_days: forecastDays },
      series: [...grouped.entries()].map(([property, points]) => ({
        property,
        display_name: propMeta.get(property)?.display_name ?? property,
        unit: propMeta.get(property)?.unit ?? null,
        points,
      })),
    },
    200,
    { "Cache-Control": "private, max-age=900" },
  );
}

/** Recursive lineage, depth-capped at 3. */
async function handleLineage(supabase: SupabaseClient, obsId: number, role: Role) {
  const propMeta = await getProperties(supabase);
  const sources = await getSources(supabase);

  const buildNode = async (id: number, depth: number): Promise<unknown | null> => {
    const { data: obs } = await supabase
      .from("env_observations")
      .select("obs_id, property_code, value, u_std, confidence, qc_level, source_id, valid_time, horizon_hours")
      .eq("obs_id", id)
      .maybeSingle();
    if (!obs) return null;

    const meta = propMeta.get(obs.property_code);
    if (!isVisible(role, meta)) return null;
    const src = obs.source_id ? sources.get(obs.source_id) : undefined;

    const node: Record<string, unknown> = {
      obs_id: obs.obs_id,
      property: obs.property_code,
      display_name: meta?.display_name ?? obs.property_code,
      unit: meta?.unit ?? null,
      value: obs.value === null ? null : Number(obs.value),
      u_std: obs.u_std === null ? null : Number(obs.u_std),
      confidence: obs.confidence === null ? null : Number(obs.confidence),
      qc_level: obs.qc_level,
      source_kind: src?.source_kind ?? null,
      ...(role === "farmer" ? {} : { source_code: src?.source_code ?? null }),
      valid_time: obs.valid_time,
      horizon_hours: obs.horizon_hours,
      method: null,
      inputs: [],
    };

    if (depth >= 3) return node;

    const { data: lineage } = await supabase
      .from("env_obs_lineage")
      .select("input_obs_id, run_id, sensitivity")
      .eq("derived_obs_id", id)
      .limit(30);
    if (!lineage?.length) return node;

    const runId = lineage[0].run_id;
    if (runId) {
      const { data: run } = await supabase
        .from("env_derivation_run")
        .select("run_id, method_id, method_version, executed_at, status")
        .eq("run_id", runId)
        .maybeSingle();
      if (run) {
        const { data: method } = await supabase
          .from("sci_method_registry")
          .select("method_id, version, method_kind, authoritative_source, equation_ref, review_status")
          .eq("method_id", run.method_id)
          .eq("version", run.method_version)
          .maybeSingle();
        node.method = {
          method_id: run.method_id,
          version: run.method_version,
          label: `${run.method_id}@${run.method_version}`,
          executed_at: run.executed_at,
          status: run.status,
          method_kind: method?.method_kind ?? null,
          authoritative_source: method?.authoritative_source ?? null,
          equation_ref: method?.equation_ref ?? null,
          review_status: method?.review_status ?? null,
        };
      }
    }

    const children = await Promise.all(
      lineage.map(async (l) => {
        const child = await buildNode(Number(l.input_obs_id), depth + 1);
        if (!child) return null;
        return { ...(child as Record<string, unknown>), sensitivity: l.sensitivity === null ? null : Number(l.sensitivity) };
      }),
    );
    node.inputs = children.filter(Boolean);
    return node;
  };

  const tree = await buildNode(obsId, 1);
  if (!tree) return json({ error: "Observation not found", code: "OBS_NOT_FOUND" }, 404);
  return json({ depth_cap: 3, tree });
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") {
    return json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server configuration error", code: "SERVER_CONFIG_ERROR" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const url = new URL(req.url);
    const seg = segmentsOf(url);

    // Tenant scoping (soft: farmers are additionally scoped by land ownership).
    const tenant = await resolveTenantFromRequest(req, supabaseUrl, serviceKey);
    const tenantId = tenant?.id ?? req.headers.get("x-tenant-id");

    // Rate limit with the shared limiter.
    const identifier =
      req.headers.get("x-farmer-id") ||
      tenantId ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "anonymous";
    const rl = await checkRateLimit(identifier, "env-intelligence", {
      maxRequests: 120,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return json({ error: "Too many requests", code: "RATE_LIMITED" }, 429, {
        "Retry-After": String(Math.max(1, Math.ceil((rl.resetTime - Date.now()) / 1000))),
      });
    }

    const role = await resolveRole(req, supabase);

    if (seg[0] === "observations" && seg.length === 1) {
      return await handleObservations(supabase, url, role, tenantId);
    }
    if (seg[0] === "observations" && seg[2] === "lineage") {
      const obsId = Number(seg[1]);
      if (!Number.isFinite(obsId)) return json({ error: "Invalid obs id", code: "BAD_ID" }, 400);
      return await handleLineage(supabase, obsId, role);
    }
    if (seg[0] === "lands" && seg[2] === "state") {
      return await handleLandState(supabase, seg[1], role, tenantId);
    }
    if (seg[0] === "lands" && seg[2] === "timeline") {
      return await handleTimeline(supabase, seg[1], url, role, tenantId);
    }

    return json({ error: "Not found", code: "NO_ROUTE", path: url.pathname }, 404);
  } catch (err) {
    console.error("[env-intelligence] unhandled", err);
    return json({ error: "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
});
