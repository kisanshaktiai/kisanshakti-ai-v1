import type { GuardedContext } from '../_shared/tenantAccessGuard.ts';
import { corsHeaders } from '../_shared/cors.ts';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

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
  const workers = await supabase.from('soil_engine_workers').select('source_version,algorithm_version')
    .gte('heartbeat_at',new Date(Date.now()-120000).toISOString()).order('heartbeat_at',{ascending:false}).limit(1);
  const worker = workers.error ? null : workers.data?.[0];
  if (req.method === 'POST') {
    if (!worker) return json({ code: 'ENGINE_OFFLINE' }, 503);
    const queued = await supabase.rpc('soil_enqueue', { p_land:landId,p_tenant:tenantId,p_farmer:farmerId,
      p_source:worker.source_version,p_algorithm:worker.algorithm_version });
    if (queued.error) {
      const code = ['INVALID_BOUNDARY','RETRY_LATER','ENGINE_OFFLINE'].find(c=>queued.error!.message.includes(c)) || 'SOIL_REQUEST_FAILED';
      return json({ code }, code==='RETRY_LATER'?429:code==='INVALID_BOUNDARY'?422:503);
    }
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
    engine_available:!!worker && !state.error,
    source_changed:!!worker && !!state.data?.model && (worker.source_version!==state.data.model.source_version || worker.algorithm_version!==state.data.model.algorithm_version) });
}
