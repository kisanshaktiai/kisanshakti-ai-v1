import type { GuardedContext } from '../_shared/tenantAccessGuard.ts';
import { corsHeaders } from '../_shared/cors.ts';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// Dispatch uses a server-only fine-grained GitHub token (Actions: write on soil-engine).
// A dispatch failure does not erase a durable queued job: scheduled Actions sweep it.
const SOIL_ALGORITHM = 'parcel-native-area-zigzag-v2';
const GH_DISPATCH_URL = 'https://api.github.com/repos/kisanshaktiai/kisanshakti-soil-engine/actions/workflows/soil-on-demand.yml/dispatches';

async function dispatchSoilJob(): Promise<boolean> {
  const token = Deno.env.get('SOIL_GITHUB_DISPATCH_TOKEN');
  if (!token) return false;
  try {
    const response = await fetch(GH_DISPATCH_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) console.warn('Soil GitHub dispatch unavailable', response.status);
    return response.status === 204;
  } catch {
    console.warn('Soil GitHub dispatch request unavailable');
    return false;
  }
}

/** Return summary layers only; raw source pixels stay in the server-side report. */
export function summarizeModel(model: any) {
  if (!model?.report) return null;
  const report = model.report;
  const properties = Object.fromEntries(Object.entries(report.properties || {}).map(([name, depths]: [string, any]) =>
    [name, Object.fromEntries(Object.entries(depths).map(([depth, layer]: [string, any]) =>
      [depth, { mean: layer.mean, unit: layer.unit, quality: layer.quality,
        coverage_fraction: layer.coverage_fraction, distinct_pixels: layer.distinct_pixels }]))]));
  return { id: model.id, quality: model.quality, retrieved_at: model.retrieved_at, expires_at: model.expires_at,
    source_version: model.source_version, algorithm_version: model.algorithm_version,
    area_m2: report.area_m2, sampling: report.sampling, properties, warnings: report.warnings || [] };
}

export async function handleSoil(req: Request, guard: GuardedContext): Promise<Response> {
  const { supabase, farmerId, tenantId } = guard;
  const url = new URL(req.url);
  const landId = url.searchParams.get('land_id') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(landId)) return json({ code: 'BAD_LAND_ID' }, 400);
  if (!['GET','POST'].includes(req.method)) return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
  // All identity and geometry come from verified guard + owned database records.
  const owned = await supabase.from('lands').select('id,name').eq('id',landId).eq('farmer_id',farmerId).eq('tenant_id',tenantId).maybeSingle();
  if (owned.error) return json({ code: 'SOIL_READ_FAILED' }, 503);
  if (!owned.data) return json({ code: 'LAND_NOT_FOUND' }, 404);
  const sourceVersion = Deno.env.get('SOILGRIDS_SOURCE_VERSION')?.trim() || '';
  // Readiness means dispatch configuration, not an always-running container heartbeat.
  // The scheduled sweep can process already queued jobs even if immediate dispatch fails.
  const engineConfigured = !!sourceVersion && !!Deno.env.get('SOIL_GITHUB_DISPATCH_TOKEN');
  if (req.method === 'POST') {
    if (!engineConfigured) return json({ code: 'ENGINE_NOT_CONFIGURED' }, 503);
    const queued = await supabase.rpc('soil_enqueue', { p_land:landId,p_tenant:tenantId,p_farmer:farmerId,
      p_source:sourceVersion,p_algorithm:SOIL_ALGORITHM });
    if (queued.error) {
      const code = ['INVALID_BOUNDARY','RETRY_LATER','ENGINE_OFFLINE'].find(c=>queued.error!.message.includes(c)) || 'SOIL_REQUEST_FAILED';
      return json({ code }, code==='RETRY_LATER'?429:code==='INVALID_BOUNDARY'?422:503);
    }
    if (queued.data?.status === 'queued') await dispatchSoilJob();
    return json(queued.data, queued.data?.status==='cached'?200:202);
  }
  const [state, legacy, profile] = await Promise.all([
    supabase.rpc('soil_state',{p_land:landId,p_tenant:tenantId,p_farmer:farmerId}),
    supabase.from('soil_health').select('*').eq('land_id',landId).eq('tenant_id',tenantId).eq('farmer_id',farmerId)
      .order('source',{ascending:true,nullsFirst:false}).order('test_date',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).limit(50),
    supabase.from('user_profiles').select('full_name,farmer_code').eq('farmer_id',farmerId).eq('tenant_id',tenantId).limit(1).maybeSingle(),
  ]);
  if (legacy.error) return json({code:'SOIL_READ_FAILED'},503);
  // Missing migration may still serve the existing report, but never claim fetch readiness.
  if (state.error && !['PGRST202','42883'].includes(state.error.code)) return json({code:'SOIL_READ_FAILED'},503);
  const rows=legacy.data || [];
  const saved=rows.find(r=>r.source==='lab_test') || rows.find(r=>r.source==='manual') || rows[0] || null;
  return json({ land:owned.data, legacy:saved, profile:profile.data || null,
    job:state.data?.job || null, model:summarizeModel(state.data?.model),
    boundary_changed:state.data?.boundary_changed || false,
    engine_available:engineConfigured && !state.error,
    source_changed:!!state.data?.model && (sourceVersion!==state.data.model.source_version || SOIL_ALGORITHM!==state.data.model.algorithm_version) });
}
