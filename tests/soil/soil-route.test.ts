import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {handleSoil,summarizeModel,needsRedispatch} from '../../supabase/functions/lands-api/soil';
const id='00000000-0000-4000-8000-000000000001';
function q(data:unknown,error:unknown=null){const query:any={data,error};for(const k of ['select','eq','in','gte','order','limit','maybeSingle'])query[k]=vi.fn(()=>query);return query;}
let owned:any, workers:any, legacy:any, rpc:any,guard:any;
let ratings:ReturnType<typeof q>;
beforeEach(()=>{
 vi.stubGlobal('Deno',{env:{get:(key:string)=>({
   SOILGRIDS_SOURCE_VERSION:'v1',
   SOIL_GITHUB_DISPATCH_TOKEN:'fixture-token',
 } as Record<string,string>)[key]}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:204,ok:true}));
 owned=q({id,name:'Test'});workers=q([{source_version:'v1',algorithm_version:'algo'}]);legacy=q([]);ratings=q([]);rpc=vi.fn().mockResolvedValue({data:{job:null,model:null},error:null});
 guard={tenantId:'tenant',farmerId:'farmer',supabase:{from:vi.fn((name:string)=>({lands:owned,soil_engine_workers:workers,soil_health:legacy,user_profiles:q(null),soil_test_interpretation:ratings})[name]),rpc}};
});
afterEach(()=>vi.unstubAllGlobals());
it('checks owned land before any enqueue',async()=>{owned.data=null;const r=await handleSoil(new Request(`https://x/lands-api?action=soil&land_id=${id}`,{method:'POST'}),guard);expect(r.status).toBe(404);expect(rpc).not.toHaveBeenCalled();expect(owned.eq).toHaveBeenCalledWith('farmer_id','farmer');});
it('returns 503 without configured dispatch',async()=>{vi.stubGlobal('Deno',{env:{get:()=>undefined}});const r=await handleSoil(new Request(`https://x/?land_id=${id}`,{method:'POST'}),guard);expect(r.status).toBe(503);expect(rpc).not.toHaveBeenCalled();});
it('takes identity from the guard and dispatches only queued jobs',async()=>{rpc.mockResolvedValue({data:{status:'queued',job_id:'job'}});const r=await handleSoil(new Request(`https://x/?land_id=${id}`,{method:'POST',body:JSON.stringify({farmer_id:'attacker',geometry:{}})}),guard);expect(r.status).toBe(202);expect(rpc).toHaveBeenCalledWith('soil_enqueue',{p_land:id,p_tenant:'tenant',p_farmer:'farmer',p_source:'v1',p_algorithm:'parcel-native-area-zigzag-v2'});expect(fetch).toHaveBeenCalledTimes(1);});
it('does not enqueue on a report read',async()=>{const r=await handleSoil(new Request(`https://x/?land_id=${id}`),guard);expect(r.status).toBe(200);expect(rpc).toHaveBeenCalledWith('soil_state',expect.anything());expect(rpc).toHaveBeenCalledTimes(1);});
it('prefers lab evidence over model compatibility data',async()=>{legacy.data=[{source:'soilgrid',id:'map'},{source:'lab_test',id:'lab'}];const r=await handleSoil(new Request(`https://x/?land_id=${id}`),guard);expect((await r.json()).legacy.id).toBe('lab');});
it('removes raw pixels from browser responses',()=>{const s=summarizeModel({id:'r',report:{properties:{phh2o:{'0-5cm':{mean:6.8,evidence:{secret:'raw'}}}}}});expect(s.properties.phh2o['0-5cm'].mean).toBe(6.8);expect(s.properties.phh2o['0-5cm']).not.toHaveProperty('evidence');});

it('reports configured engine without a heartbeat',async()=>{
 workers.data=[];
 const r=await handleSoil(new Request(`https://x/?land_id=${id}`),guard);
 expect(r.status).toBe(200);
 expect((await r.json()).engine_available).toBe(true);
});
it('cached result never dispatches',async()=>{
 rpc.mockResolvedValue({data:{status:'cached',report_id:'existing'},error:null});
 const r=await handleSoil(new Request(`https://x/?land_id=${id}`,{method:'POST'}),guard);
 expect(r.status).toBe(200);
 expect(fetch).not.toHaveBeenCalled();
});
it('a failed dispatch preserves the durable queued job',async()=>{
 rpc.mockResolvedValue({data:{status:'queued',job_id:'queued'},error:null});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:503,ok:false}));
 const r=await handleSoil(new Request(`https://x/?land_id=${id}`,{method:'POST'}),guard);
 expect(r.status).toBe(202);
 expect((await r.json()).status).toBe('queued');
});

it('keeps the request queue available when immediate GitHub dispatch is unconfigured',async()=>{
 vi.stubGlobal('Deno',{env:{get:(key:string)=>key==='SOILGRIDS_SOURCE_VERSION'?'v1':undefined}});
 const get=await handleSoil(new Request(`https://x/?land_id=${id}`),guard);
 expect(get.status).toBe(200);
 expect(await get.json()).toMatchObject({engine_available:true,engine_status:'READY',dispatch_mode:'scheduled'});
 rpc.mockResolvedValue({data:{status:'queued',job_id:'job'},error:null});
 const post=await handleSoil(new Request(`https://x/?land_id=${id}`,{method:'POST'}),guard);
 expect(post.status).toBe(202);
 expect(await post.json()).toMatchObject({status:'queued',dispatch_mode:'scheduled'});
 expect(fetch).not.toHaveBeenCalled();
});
it('does not claim immediate dispatch when GitHub rejects workflow dispatch',async()=>{
 rpc.mockResolvedValue({data:{status:'queued',job_id:'job'},error:null});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:403,ok:false}));
 const r=await handleSoil(new Request(`https://x/?land_id=${id}`,{method:'POST'}),guard);
 expect(r.status).toBe(202);
 expect(await r.json()).toMatchObject({status:'queued',dispatch_mode:'scheduled'});
});
it('labels successfully dispatched requests accurately',async()=>{
 rpc.mockResolvedValue({data:{status:'queued',job_id:'job'},error:null});
 const r=await handleSoil(new Request(`https://x/?land_id=${id}`,{method:'POST'}),guard);
 expect(await r.json()).toMatchObject({status:'queued',dispatch_mode:'immediate'});
});
it('still refuses to enqueue when source version is unconfigured',async()=>{
 vi.stubGlobal('Deno',{env:{get:()=>undefined}});
 const r=await handleSoil(new Request(`https://x/?land_id=${id}`,{method:'POST'}),guard);
 expect(r.status).toBe(503);
 expect(await r.json()).toMatchObject({code:'ENGINE_NOT_CONFIGURED'});
 expect(rpc).not.toHaveBeenCalled();
});
it('never shows a seeded placeholder row as the saved report',async()=>{
 legacy.data=[{source:'manual',id:'seed',data_quality_flags:['SEEDED_PLACEHOLDER']},{source:'soilgrid',id:'model',data_quality_flags:{soil_parcel_report_id:'r'}}];
 const r=await handleSoil(new Request(`https://x/?land_id=${id}`),guard);
 expect((await r.json()).legacy.id).toBe('model');
});
it('returns no saved report when only seeded rows exist',async()=>{
 legacy.data=[{source:'soilgrid',id:'seed',data_quality_flags:['SEEDED_PLACEHOLDER']}];
 const r=await handleSoil(new Request(`https://x/?land_id=${id}`),guard);
 expect((await r.json()).legacy).toBeNull();
});
it('detects stranded queued and lease-expired running jobs only',()=>{
 const now=Date.parse('2026-11-17T10:00:00Z');
 const at=(m:number)=>new Date(now-m*60_000).toISOString();
 expect(needsRedispatch({status:'queued',updated_at:at(1)},now)).toBe(false);
 expect(needsRedispatch({status:'queued',updated_at:at(3)},now)).toBe(true);
 expect(needsRedispatch({status:'running',updated_at:at(5)},now)).toBe(false);
 expect(needsRedispatch({status:'running',updated_at:at(12)},now)).toBe(true);
 expect(needsRedispatch({status:'complete',updated_at:at(60)},now)).toBe(false);
 expect(needsRedispatch(null,now)).toBe(false);
 expect(needsRedispatch({status:'queued',updated_at:'bad'},now)).toBe(false);
});
it('re-dispatches a stranded job on the report poll, at most once per gap',async()=>{
 const stale=new Date(Date.now()-5*60_000).toISOString();
 rpc.mockResolvedValue({data:{job:{id:'j',status:'queued',updated_at:stale},model:null},error:null});
 const land='00000000-0000-4000-8000-0000000000aa';
 const first=await handleSoil(new Request(`https://x/?land_id=${land}`),guard);
 expect(first.status).toBe(200);
 await handleSoil(new Request(`https://x/?land_id=${land}`),guard);
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not re-dispatch a fresh job or without a dispatch token',async()=>{
 rpc.mockResolvedValue({data:{job:{id:'j',status:'queued',updated_at:new Date().toISOString()},model:null},error:null});
 await handleSoil(new Request(`https://x/?land_id=00000000-0000-4000-8000-0000000000bb`),guard);
 expect(fetch).not.toHaveBeenCalled();
 vi.stubGlobal('Deno',{env:{get:(key:string)=>key==='SOILGRIDS_SOURCE_VERSION'?'v1':undefined}});
 rpc.mockResolvedValue({data:{job:{id:'j',status:'queued',updated_at:new Date(Date.now()-9e5).toISOString()},model:null},error:null});
 await handleSoil(new Request(`https://x/?land_id=00000000-0000-4000-8000-0000000000cc`),guard);
 expect(fetch).not.toHaveBeenCalled();
});
it('returns the newest saved row for each of the three report types, never a seeded row',async()=>{
 legacy.data=[
  {source:'lab_test',id:'lab-new'},{source:'lab_test',id:'lab-old'},
  {source:'manual',id:'typed'},
  {source:'soilgrid',id:'seed',data_quality_flags:['SEEDED_PLACEHOLDER']},{source:'soilgrid',id:'map'},
 ];
 const body=await (await handleSoil(new Request(`https://x/?land_id=${id}`),guard)).json();
 expect(body.sources.lab.id).toBe('lab-new');
 expect(body.sources.satellite.id).toBe('map');
 expect(body.sources.device).toBeNull();
 expect(body.legacy.id).toBe('lab-new');
});
it('places a farmer-typed card under lab and a device reading under device',async()=>{
 legacy.data=[{source:'device',id:'dev'},{source:'manual',id:'typed'}];
 const body=await (await handleSoil(new Request(`https://x/?land_id=${id}`),guard)).json();
 expect(body.sources).toMatchObject({lab:{id:'typed'},device:{id:'dev'},satellite:null});
});

it('returns the governed India rating rows with the report and an empty list if they fail to load',async()=>{
 ratings.data=[{parameter:'organic_carbon',low_below:0.5,high_above:0.75,review_status:'confirmed_convention'}];
 const r=await handleSoil(new Request(`https://x/?land_id=${id}`),guard);
 expect((await r.json()).ratings).toEqual(ratings.data);
 expect(ratings.eq).toHaveBeenCalledWith('region_scope','IN');
 expect(ratings.in).toHaveBeenCalledWith('parameter',expect.arrayContaining(['organic_carbon','available_nitrogen']));
 ratings.error={message:'denied'};
 const failed=await handleSoil(new Request(`https://x/?land_id=${id}`),guard);
 expect((await failed.json()).ratings).toEqual([]);
});
