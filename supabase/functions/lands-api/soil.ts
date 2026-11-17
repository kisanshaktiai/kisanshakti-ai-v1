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
  const token = typeof Deno !== 'undefined' ? Deno.env.get('SOIL_GITHUB_DISPATCH_TOKEN') : undefined;
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
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(10000) : undefined,
    });
    if (!response.ok) console.warn('Soil GitHub dispatch unavailable', response.status);
    return response.status === 204;
  } catch {
    console.warn('Soil GitHub dispatch request unavailable');
    return false;
  }
}

// A lost or failed dispatch must not strand a durable job until GitHub's best-effort cron,
// because the farmer's button stays disabled while the job is active. The report poll
// re-dispatches a queued job that has waited, or a running job whose 10-minute lease ran
// out. Extra dispatches are harmless: the workflow concurrency group keeps one pending run.
const REDISPATCH_QUEUED_MS = 2 * 60_000;
const REDISPATCH_RUNNING_MS = 11 * 60_000;
const REDISPATCH_MIN_GAP_MS = 2 * 60_000;
const lastRedispatch = new Map<string, number>();
export function needsRedispatch(job: { status?: string; updated_at?: string } | null | undefined, now = Date.now()): boolean {
  const age = now - Date.parse(job?.updated_at || '');
  if (!Number.isFinite(age)) return false;
  return (job?.status === 'queued' && age >= REDISPATCH_QUEUED_MS) || (job?.status === 'running' && age >= REDISPATCH_RUNNING_MS);
}
async function redispatchIfStranded(landId: string, job: any): Promise<void> {
  const now = Date.now();
  if (!needsRedispatch(job, now) || now - (lastRedispatch.get(landId) || 0) < REDISPATCH_MIN_GAP_MS) return;
  if (lastRedispatch.size > 1000) lastRedispatch.clear();
  lastRedispatch.set(landId, now);
  await dispatchSoilJob();
}

// Seeded test/default rows stay in soil_health for audit but are never a saved report.
const SEEDED_FLAG = 'SEEDED_PLACEHOLDER';
const isSeeded = (row: any) => Array.isArray(row?.data_quality_flags) && row.data_quality_flags.includes(SEEDED_FLAG);

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
  const sourceVersion = (typeof Deno !== 'undefined' ? Deno.env.get('SOILGRIDS_SOURCE_VERSION') : undefined)?.trim() || '';
  // Readiness means dispatch configuration, not an always-running container heartbeat.
  // The scheduled sweep can process already queued jobs even if immediate dispatch fails.
  // A live GitHub dispatch token is optional: the default-branch cron workflow
  // recovers durable queued jobs. Do not block farmer requests on dispatch latency.
  const dispatchConfigured = !!(typeof Deno !== 'undefined' ? Deno.env.get('SOIL_GITHUB_DISPATCH_TOKEN') : undefined);
  const engineConfigured = !!sourceVersion;
  if (req.method === 'POST') {
    if (!engineConfigured) return json({ code: 'ENGINE_NOT_CONFIGURED' }, 503);
    const queued = await supabase.rpc('soil_enqueue', { p_land:landId,p_tenant:tenantId,p_farmer:farmerId,
      p_source:sourceVersion,p_algorithm:SOIL_ALGORITHM });
    if (queued.error) {
      const code = ['INVALID_BOUNDARY','RETRY_LATER','ENGINE_OFFLINE'].find(c=>queued.error!.message.includes(c)) || 'SOIL_REQUEST_FAILED';
      return json({ code }, code==='RETRY_LATER'?429:code==='INVALID_BOUNDARY'?422:503);
    }
    const dispatched = queued.data?.status === 'queued' && dispatchConfigured ? await dispatchSoilJob() : false;
    return json({ ...queued.data, dispatch_mode: queued.data?.status === 'queued'
      ? (dispatched ? 'immediate' : 'scheduled') : null },
      queued.data?.status==='cached'?200:202);
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
  if (engineConfigured && dispatchConfigured && !state.error) await redispatchIfStranded(landId, state.data?.job);
  const rows=(legacy.data || []).filter(r=>!isSeeded(r));
  const saved=rows.find(r=>r.source==='lab_test') || rows.find(r=>r.source==='manual') || rows[0] || null;
  return json({ land:owned.data, legacy:saved, profile:profile.data || null,
    job:state.data?.job || null, model:summarizeModel(state.data?.model),
    boundary_changed:state.data?.boundary_changed || false,
    engine_available:engineConfigured && !state.error,
    dispatch_mode:dispatchConfigured ? 'immediate' : 'scheduled',
    engine_status:!sourceVersion ? 'SOURCE_NOT_CONFIGURED' : state.error ? 'QUEUE_UNAVAILABLE' : 'READY',
    source_changed:!!state.data?.model && (sourceVersion!==state.data.model.source_version || SOIL_ALGORITHM!==state.data.model.algorithm_version) });
}
