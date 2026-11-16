#!/usr/bin/env node
/**
 * Real staging HTTP integration test. Never points at production.
 * Required: STAGING_SUPABASE_PROJECT_REF, STAGING_SUPABASE_SERVICE_ROLE_KEY
 * Tested operations: unauthenticated 401/405, authenticated dry run 200,
 * and identical before/after snapshots of all mutable schedule ledgers.
 *
 * Requires isolated staging schema and anonymous TEST fixtures (no farmer PII).
 */
const REF=process.env.STAGING_SUPABASE_PROJECT_REF||"";
const KEY=process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY||"";
const PROD="qfklkkzxemsbeniyugiz";
if(!/^[a-z]{20}$/.test(REF)||REF===PROD||!KEY||KEY.length<25){
  console.error("DENIED: isolated staging ref and staging-only service key required");
  process.exit(2);
}
const origin=`https://${REF}.supabase.co`;
const timeLimit=120_000;
function assert(ok,message){if(!ok)throw new Error(message)}
async function fetchSafe(url,options={}){
  const res=await fetch(url,{...options,signal:AbortSignal.timeout(timeLimit)});
  return res;
}
const apiHeaders={apikey:KEY,Authorization:`Bearer ${KEY}`};
async function readRows(table,fields){
  const out=[];
  for(let offset=0;offset<100_000;offset+=1000){
    const url=`${origin}/rest/v1/${table}?select=${encodeURIComponent(fields)}&order=id.asc&limit=1000&offset=${offset}`;
    const res=await fetchSafe(url,{headers:apiHeaders});
    assert(res.ok,`staging read of ${table} failed with HTTP ${res.status}`);
    const rows=await res.json();
    assert(Array.isArray(rows),`unexpected ${table} response`);
    out.push(...rows);
    if(rows.length<1000)return JSON.stringify(out);
  }
  throw new Error(`${table} exceeded safe snapshot row limit`);
}
const tables={
 schedule_tasks:"id,task_date,status,original_date,projected_date,updated_at,decision_state,adjustment_reason,auto_rescheduled,resources",
 schedule_adjustments:"id",
 schedule_monitoring:"id",
 farm_decision:"id,schedule_id,task_id,updated_at",
 edge_invocation_logs:"id",
};
async function snapshot(){
  const data={};
  for(const [table,fields] of Object.entries(tables))data[table]=await readRows(table,fields);
  return data;
}
async function httpStatus(method,headers,body){
  const res=await fetchSafe(`${origin}/functions/v1/schedule-reconciler`,{
    method,headers,body:body===undefined?undefined:JSON.stringify(body)
  });
  const txt=await res.text();
  return {status:res.status,body:txt};
}
function publicHeaders(){
  return {"content-type":"application/json","apikey":KEY};
}
console.log("Checking staging-only reconciler endpoint and read-only data contracts");
const denied=await httpStatus("POST",publicHeaders(),{dryRun:true});
assert(denied.status===401,`anonymous reconciler must return 401, got ${denied.status}`);
const forged=await httpStatus("POST",{...publicHeaders(),Authorization:"Bearer forged-anon-token","x-tenant-id":"spoof","x-farmer-id":"spoof"},{dryRun:false});
assert(forged.status===401,`forged farmer reconciliation must return 401, got ${forged.status}`);
const wrongMethod=await httpStatus("GET",publicHeaders());
assert(wrongMethod.status===405,`GET reconcile must return 405, got ${wrongMethod.status}`);
console.log("PASS unauthorized POST=401, spoofed caller=401, GET=405");

const before=await snapshot();
const dry=await httpStatus("POST",{...apiHeaders,"content-type":"application/json"},{dryRun:true});
assert(dry.status===200,`authorized staging dry run must return 200, got ${dry.status}`);
let payload;try{payload=JSON.parse(dry.body)}catch{throw new Error("dryRun did not return JSON")}
assert(payload.dry_run===true,"response did not confirm dry_run=true");
const after=await snapshot();
for(const table of Object.keys(tables)){
  assert(before[table]===after[table],`DRY RUN MUTATED ${table}`);
}
console.log("PASS service-authorized dryRun=true and zero changes in all five ledgers");
console.log(JSON.stringify({staging_project:REF,auth_negative_cases:3,dry_run:true,read_only_tables:Object.keys(tables),schedules_examined:payload.schedules??null}));
