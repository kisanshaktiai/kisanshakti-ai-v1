/**
 * analytics-forecast — monthly income / expense / profit projection rows for a
 * farmer's lands, stored in `public.analytics_forecasts`.
 *
 * 2026-09-18 lock-down (Farm Analytics forensic audit, P0-1/P0-2/P0-4/P0-5/P0-8/P0-9):
 *   - Every request must come from the service role or from a farmer whose
 *     `x-session-token` the database verifies (see ./caller.ts). A farmer can
 *     only ever read his own rows; `farmer_id` in the query/body is not identity.
 *   - Generation is PAUSED. The previous generator priced every land from
 *     crop-name maps held in code, matched Marathi mandi names with an English
 *     substring (revenue was always 0), charged a full season to lands with no
 *     sowing date, let an LLM multiply money figures, and its upserts could never
 *     succeed (partial unique indexes cannot be targeted by onConflict — 42P10).
 *     Generation returns FORECAST_GENERATION_PAUSED and writes nothing until the
 *     database-SSOT cost and yield engine replaces it.
 *
 * Modes:
 *   GET  ?months=6                       — farmer: read own forecasts
 *   GET  ?farmer_id=...&months=6         — service role: read one farmer's forecasts
 *   POST { mode: "farmer" | "all" }      — paused (409), writes nothing
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';
import { resolveCaller, type SessionContextRow } from './caller.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MAX_HORIZON_MONTHS = 12;
const DEFAULT_HORIZON_MONTHS = 6;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function monthStart(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString().slice(0, 10);
}

function addMonths(d: Date, m: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1));
}

/** Resolve a session token through the database, exactly as RLS does. */
async function lookupSession(sessionToken: string): Promise<SessionContextRow | null> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'x-session-token': sessionToken } },
  });
  const { data, error } = await client.rpc('verified_session_context');
  if (error) {
    console.warn('verified_session_context failed', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { farmer_id: row.farmer_id ?? null, tenant_id: row.tenant_id ?? null } : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const caller = await resolveCaller(req, SUPABASE_SERVICE_KEY, lookupSession);
    if (!caller) {
      return json({ error: 'Authentication required', code: 'UNAUTHENTICATED' }, 401);
    }

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const requested = Number(url.searchParams.get('months') || DEFAULT_HORIZON_MONTHS);
      const months = Number.isFinite(requested)
        ? Math.min(MAX_HORIZON_MONTHS, Math.max(1, Math.trunc(requested)))
        : DEFAULT_HORIZON_MONTHS;

      const farmerId = caller.kind === 'farmer'
        ? caller.farmerId
        : url.searchParams.get('farmer_id');
      if (!farmerId) return json({ error: 'farmer_id required' }, 400);

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const today = monthStart(new Date());
      const end = monthStart(addMonths(new Date(), months));
      const { data, error } = await supabase
        .from('analytics_forecasts')
        .select('*')
        .eq('farmer_id', farmerId)
        .gte('forecast_month', today)
        .lt('forecast_month', end)
        .order('forecast_month', { ascending: true });
      if (error) throw error;
      return json({ forecasts: data ?? [] });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const mode = body.mode || 'farmer';
      if (mode === 'farmer' || mode === 'all') {
        return json({
          error: 'Forecast generation is paused until the database cost and yield engine is live',
          code: 'FORECAST_GENERATION_PAUSED',
          generated: false,
        }, 409);
      }
      return json({ error: 'unknown mode' }, 400);
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (e: any) {
    console.error('analytics-forecast error', e);
    return json({ error: e?.message || 'internal error' }, 500);
  }
});
