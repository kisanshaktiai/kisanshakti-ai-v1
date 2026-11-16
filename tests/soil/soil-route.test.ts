import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {handleSoil,summarizeModel} from '../../supabase/functions/lands-api/soil';
const id='00000000-0000-4000-8000-000000000001';
function q(data:unknown,error:unknown=null){const query:any={data,error};for(const k of ['select','eq','gte','order','limit','maybeSingle'])query[k]=vi.fn(()=>query);return query;}
let owned:any, workers:any, legacy:any, rpc:any,guard:any;
beforeEach(()=>{
 vi.stubGlobal('Deno',{env:{get:(key:string)=>({
   SOILGRIDS_SOURCE_VERSION:'v1',
   SOIL_GITHUB_DISPATCH_TOKEN:'fixture-token',
 } as Record<string,string>)[key]}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:204,ok:true}));
 owned=q({id,name:'Test'});workers=q([{source_version:'v1',algorithm_version:'algo'}]);legacy=q([]);rpc=vi.fn().mockResolvedValue({data:{job:null,model:null},error:null});
 guard={tenantId:'tenant',farmerId:'farmer',supabase:{from:vi.fn((name:string)=>({lands:owned,soil_engine_workers:workers,soil_health:legacy,user_profiles:q(null)})[name]),rpc}};
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
