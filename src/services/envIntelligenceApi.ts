/**
 * Env-Intelligence API client (read-only).
 * Talks to the `env-intelligence` edge function using the app's custom
 * tenant/farmer isolation headers.
 */
import { dataIsolation } from './dataIsolationService';
import { SUPABASE_CONFIG, getSupabaseFunctionUrl } from '@/config/supabase';

const BASE = getSupabaseFunctionUrl('env-intelligence');

export interface EnvPoint {
  obs_id: number;
  property: string;
  display_name: string;
  value: number | null;
  unit: string | null;
  confidence: number | null;
  u_std: number | null;
  qc_level: number | null;
  source_kind: string | null;
  source_code?: string | null;
  valid_time: string;
  horizon_hours: number | null;
}

export interface RiskEpisode {
  episode_id: string;
  risk_code: string;
  phase: string;
  current_value: number | null;
  peak_value: number | null;
  confidence: number | null;
  started_at: string | null;
  phase_updated_at: string | null;
}

export interface LandEnvState {
  land_id: string;
  role: 'farmer' | 'agronomist' | 'admin';
  state: Record<string, any> | null;
  active_episodes: RiskEpisode[];
  gdd: { obs_date: string; cumulative_gdd: number; daily_gdd: number | null } | null;
}

export interface TimelineSeries {
  property: string;
  display_name: string;
  unit: string | null;
  points: Array<{
    valid_time: string;
    value: number | null;
    u_std: number | null;
    confidence: number | null;
    is_forecast: boolean;
  }>;
}

export interface LineageNode {
  obs_id: number;
  property: string;
  display_name: string;
  unit: string | null;
  value: number | null;
  confidence: number | null;
  qc_level: number | null;
  source_kind: string | null;
  source_code?: string | null;
  valid_time: string;
  sensitivity?: number | null;
  method: {
    method_id: string;
    version: string;
    label: string;
    executed_at: string | null;
    status: string | null;
    method_kind: string | null;
    authoritative_source: string | null;
    equation_ref: string | null;
    review_status: string | null;
  } | null;
  inputs: LineageNode[];
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const isolation = dataIsolation.getIsolationHeaders();
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_CONFIG.ANON_KEY,
      Authorization: `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
      ...isolation,
    },
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.error || body?.message || detail;
    } catch {
      /* ignore */
    }
    throw new Error(`env-intelligence ${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

export const envIntelligenceApi = {
  getLandState: (landId: string) => get<LandEnvState>(`/lands/${landId}/state`),

  getTimeline: (
    landId: string,
    opts: { properties?: string[]; pastDays?: number; forecastDays?: number } = {},
  ) =>
    get<{ land_id: string; series: TimelineSeries[] }>(`/lands/${landId}/timeline`, {
      property: opts.properties?.join(','),
      past_days: opts.pastDays,
      forecast_days: opts.forecastDays,
    }),

  getObservations: (params: {
    landId?: string;
    cellKey?: string;
    properties?: string[];
    from?: string;
    to?: string;
    kind?: 'measured' | 'forecast';
  }) =>
    get<{ count: number; points: EnvPoint[] }>(`/observations`, {
      land_id: params.landId,
      cell_key: params.cellKey,
      property: params.properties?.join(','),
      from: params.from,
      to: params.to,
      kind: params.kind,
    }),

  getLineage: (obsId: number) => get<{ depth_cap: number; tree: LineageNode }>(`/observations/${obsId}/lineage`),
};
