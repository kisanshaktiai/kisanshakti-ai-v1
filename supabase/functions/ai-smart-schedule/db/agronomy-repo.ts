// CHANGE LOG
// 2026-09-04 — P0: baseline CONTEXT_SCHEDULE rules now use the same safety/servability
//   contract as the Harness evidence layer. Unsafe/non-farmer-servable rules must never
//   become required baseline candidates. This is a governance filter only; no agronomy is
//   invented or changed here.
// 2026-08-28 — P0 forensic fixes (schedule 5673e87a audit, all verified live):
//   (1) APPLICABILITY GATE: getFieldActionRules / getObservationRules now filter by
//       decision_rules.region_code and cultivation_method_applicable.
//   (2) IRRIGATION GRAPH SCOPING: getIrrigationGuidelines keeps only selected stage graph.
//   (3) getVarietyDuration: variety × method maturity from variety_cultivation_agronomy.
// 2026-08-28 — P0 counter-audit fix: getSeedRate rejects unverified TGW defaults.
// 2026-08-24 — P0: getStages hard-scoped by cultivation_method.
// 2026-08-18 — Phase 2: created DB-only agronomy repository.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export interface Provenance { table: string; row_id?: string | null; source?: string | null; authority?: string | null; confidence?: number | null; }
export interface StageRow { id:string; crop_code:string; growth_stage:string; stage_code:string|null; das_min:number|null; das_max:number|null; das_reference:string|null; clock_reference:string|null; gdd_min:number|null; gdd_max:number|null; base_temperature_c:number|null; cultivation_method:string|null; crop_cycle:string|null; is_moisture_critical:boolean|null; kc_coefficient:number|null; boundary_grace_days:number|null; }

export async function getStages(supabase:SupabaseClient,cropCode:string,cropCycle:string|null,cultivationMethod:string|null):Promise<StageRow[]> {
  let q=supabase.from("crop_stage_master").select("id, crop_code, growth_stage, stage_code, das_min, das_max, das_reference, clock_reference, gdd_min, gdd_max, base_temperature_c, cultivation_method, crop_cycle, is_moisture_critical, kc_coefficient, boundary_grace_days").eq("crop_code",cropCode).eq("is_active",true).order("das_min",{ascending:true,nullsFirst:true});
  if(cropCycle) q=q.or(`crop_cycle.eq.${cropCycle},crop_cycle.eq.universal,crop_cycle.is.null`);
  const {data}=await q; let rows=(data||[]) as StageRow[];
  if(cropCycle){const wanted=cropCycle.toLowerCase();const byKey=new Map<string,StageRow>();for(const r of rows){const key=(r.stage_code||r.growth_stage||r.id).toLowerCase();const prev=byKey.get(key);if(!prev){byKey.set(key,r);continue;}const rs=String(r.crop_cycle??"").toLowerCase()===wanted;const ps=String(prev.crop_cycle??"").toLowerCase()===wanted;if(rs&&!ps)byKey.set(key,r);}rows=[...byKey.values()];}
  if(cultivationMethod){const wanted=cultivationMethod.toLowerCase();rows=rows.filter(r=>{const m=String(r.cultivation_method??"").trim().toLowerCase();return !m||m==="any"||m===wanted;});}
  return rows.sort((a,b)=>(a.das_min??0)-(b.das_min??0)||String(a.stage_code??"").localeCompare(String(b.stage_code??"")));
}

export interface SeedRateResult { kgPerAcre:number; rationale:string|null; provenance:Provenance; }
const RPC_TGW_UNVERIFIED="default_20g_UNVERIFIED";
export async function getSeedRate(
  supabase: SupabaseClient,
  varietyId: string | null,
  cultivationMethod: string | null,
  stageClockMethod: string | null = null
): Promise<SeedRateResult | null> {
  if (!varietyId || !cultivationMethod) return null;
  const candidateMethods = [...new Set([cultivationMethod, stageClockMethod].filter(Boolean))] as string[];
  let vca: Record<string, unknown> | null = null;
  let vcaMethod: string | null = null;

  for (const method of candidateMethods) {
    const { data } = await supabase
      .from("variety_cultivation_agronomy")
      .select("id, target_plants_per_m2, seed_rate_kg_per_acre_min, seed_rate_kg_per_acre_max, seed_rate_rationale, source, evidence_tier")
      .eq("variety_id", varietyId)
      .eq("cultivation_method", method)
      .eq("is_active", true)
      .maybeSingle();
    if (data) {
      vca = data as Record<string, unknown>;
      vcaMethod = method;
      break;
    }
  }

  if (vca && vca.target_plants_per_m2 != null && vcaMethod) {
    const { data: rpc } = await supabase.rpc("fn_calculate_seed_rate", {
      p_variety_id: varietyId,
      p_cultivation_method: vcaMethod,
    });
    const r = Array.isArray(rpc) ? rpc[0] : rpc;
    if (r?.seed_rate_kg_per_acre != null && typeof r.tgw_source === "string" && r.tgw_source !== RPC_TGW_UNVERIFIED) {
      return {
        kgPerAcre: Number(r.seed_rate_kg_per_acre),
        rationale: r.rationale ?? null,
        provenance: { table: "fn_calculate_seed_rate", source: `tgw:${r.tgw_source}; method:${vcaMethod}` },
      };
    }
  }

  const min = vca?.seed_rate_kg_per_acre_min != null ? Number(vca.seed_rate_kg_per_acre_min) : null;
  const max = vca?.seed_rate_kg_per_acre_max != null ? Number(vca.seed_rate_kg_per_acre_max) : null;
  if (min == null && max == null) return null;
  return {
    kgPerAcre: min != null && max != null ? (min + max) / 2 : (min ?? max) as number,
    rationale: (vca?.seed_rate_rationale as string) ?? null,
    provenance: { table: "variety_cultivation_agronomy", row_id: (vca?.id as string) ?? null, source: `${(vca?.source as string) ?? ""}; method:${vcaMethod ?? ""}` },
  };
}

export interface FertilizerPlan { n_kg_ha:number|null;p2o5_kg_ha:number|null;k2o_kg_ha:number|null;splits:Array<Record<string,unknown>>;gaps:string[];provenance:Provenance; }
export async function getFertilizerPlan(supabase:SupabaseClient,cropCode:string,regionCode:string|null,fertilityClass:string|null):Promise<FertilizerPlan|null>{
  const {data}=await supabase.from("fertilizer_recommendation_master").select("id, crop_code, region_code, soil_fertility_class, n_kg_ha, p2o5_kg_ha, k2o_kg_ha, split_schedule, source, authority, confidence").ilike("crop_code",cropCode);const rows=data||[];if(!rows.length)return null;
  const score=(r:Record<string,unknown>)=>(regionCode&&String(r.region_code??"").toLowerCase()===regionCode.toLowerCase()?2:0)+(fertilityClass&&String(r.soil_fertility_class??"").toLowerCase()===fertilityClass.toLowerCase()?2:0)+(r.region_code==null?1:0);const best=[...rows].sort((a,b)=>score(b)-score(a))[0];const gaps:string[]=[];let splitParsed:unknown=best.split_schedule;
  if(typeof splitParsed==="string"){const trimmed=splitParsed.trim();if(!trimmed)splitParsed=null;else{try{splitParsed=JSON.parse(trimmed);}catch{splitParsed=null;gaps.push("fertilizer_split_schedule_unparseable");}}}
  const splits=Array.isArray(splitParsed)?splitParsed:splitParsed&&typeof splitParsed==="object"?Object.values(splitParsed):[];return{n_kg_ha:best.n_kg_ha!=null?Number(best.n_kg_ha):null,p2o5_kg_ha:best.p2o5_kg_ha!=null?Number(best.p2o5_kg_ha):null,k2o_kg_ha:best.k2o_kg_ha!=null?Number(best.k2o_kg_ha):null,splits:splits as Array<Record<string,unknown>>,gaps,provenance:{table:"fertilizer_recommendation_master",row_id:best.id,source:best.source??null,authority:best.authority??null,confidence:best.confidence!=null?Number(best.confidence):null}};
}

export interface IrrigationGuideline { stageId:string|null;growthStage:string|null;dasStart:number|null;dasEnd:number|null;intervalDays:number|null;waterMm:number|null;notes:string|null;criticalMoisturePercent:number|null;provenance:Provenance; }
export async function getIrrigationGuidelines(supabase:SupabaseClient,cropCode:string,varietyId:string|null,stageGraphIds:string[]|null=null):Promise<IrrigationGuideline[]>{
  const {data}=await supabase.from("crop_baseline_guidelines_v2").select("id, crop_code, growth_stage, das_start, das_end, irrigation_interval_days, water_requirement_mm, variety_id, stage_master_id, source_reference, notes, critical_moisture_percent").ilike("crop_code",cropCode).eq("is_active",true).order("das_start",{ascending:true,nullsFirst:true});let rows=data||[];
  if(varietyId){const scoped=rows.filter((r:Record<string,unknown>)=>!r.variety_id||r.variety_id===varietyId);if(scoped.length)rows=scoped;}
  if(stageGraphIds&&stageGraphIds.length){const ids=new Set(stageGraphIds);rows=rows.filter((r:Record<string,unknown>)=>r.stage_master_id!=null&&ids.has(String(r.stage_master_id)));}
  return rows.filter((r:Record<string,unknown>)=>r.irrigation_interval_days!=null||r.water_requirement_mm!=null).map((r:Record<string,unknown>)=>({stageId:(r.stage_master_id as string)??null,growthStage:(r.growth_stage as string)??null,dasStart:r.das_start!=null?Number(r.das_start):null,dasEnd:r.das_end!=null?Number(r.das_end):null,intervalDays:r.irrigation_interval_days!=null?Number(r.irrigation_interval_days):null,waterMm:r.water_requirement_mm!=null?Number(r.water_requirement_mm):null,notes:(r.notes as string)??null,criticalMoisturePercent:r.critical_moisture_percent!=null?Number(r.critical_moisture_percent):null,provenance:{table:"crop_baseline_guidelines_v2",row_id:(r.id as string)??null,source:(r.source_reference as string)??null}}));
}

export interface FieldActionRule {rule_id:string;category:string|null;action_type:string|null;action_text:string|null;stage_applicable:unknown;priority:number|null;phi_days:number|null;chemical_class:string|null;scientific_source:string|null;biological_group:string|null;etl_threshold:string|null;dosage_per_acre:string|null;contraindications:unknown;organic_alternative?:string|null;ipm_level?:number|string|null;}
const regionFilter=(regionCode:string|null):string=>regionCode?`region_code.is.null,region_code.eq.${regionCode}`:`region_code.is.null`;
const methodFilter=(methods:string[]):string=>`cultivation_method_applicable.is.null,cultivation_method_applicable.ov.{${[...new Set(["any",...methods.filter(Boolean)])].join(",")}}`;
export async function getFieldActionRules(supabase:SupabaseClient,cropCode:string,regionCode:string|null,methods:string[]):Promise<FieldActionRule[]>{
  const FIELD_ACTION_RULE_LIMIT=1000;
  const {data}=await supabase.from("decision_rules").select("rule_id, category, action_type, action_text, stage_applicable, priority, phi_days, chemical_class, scientific_source, biological_group, etl_threshold, dosage_per_acre, contraindications, crop_code, organic_alternative, ipm_level").eq("is_active",true).eq("requires_field_action",true).eq("trigger_class","CONTEXT_SCHEDULE").eq("is_safety_block",false).neq("is_farmer_servable",false).or(`crop_code.ilike.${cropCode},crop_code.ilike.ALL`).or(regionFilter(regionCode)).or(methodFilter(methods)).limit(FIELD_ACTION_RULE_LIMIT);
  return (data||[]) as FieldActionRule[];
}

export interface ObservationRuleRef {rule_id:string;stage_applicable:unknown;priority:number|null;category:string|null;condition_code:string|null;etl_threshold:string|null;action_text:string|null;}
export const SCOUTING_RULE_CATEGORIES=["pest","disease","weed","stress","ipm","proactive_pest","proactive_monitoring"];
export async function getObservationRules(supabase:SupabaseClient,cropCode:string,regionCode:string|null,methods:string[]):Promise<ObservationRuleRef[]>{
  const OBSERVATION_RULE_LIMIT=2000;const {data}=await supabase.from("decision_rules").select("rule_id, stage_applicable, priority, category, condition_code, etl_threshold, action_text, crop_code").eq("is_active",true).eq("trigger_class","OBSERVATION").in("category",SCOUTING_RULE_CATEGORIES).or(`crop_code.ilike.${cropCode},crop_code.ilike.ALL`).or(regionFilter(regionCode)).or(methodFilter(methods)).limit(OBSERVATION_RULE_LIMIT);return(data||[]) as ObservationRuleRef[];
}

export async function getVarietyDuration(supabase:SupabaseClient,varietyId:string|null,methods:string[]):Promise<{maxDays:number|null;provenance:Provenance}|null>{
  if(!varietyId)return null;for(const method of [...new Set(methods.filter(Boolean))]){const {data}=await supabase.from("variety_cultivation_agronomy").select("id, duration_days_min, duration_days_max, source, evidence_tier").eq("variety_id",varietyId).eq("cultivation_method",method).eq("is_active",true).maybeSingle();if(data)return{maxDays:data.duration_days_max!=null?Number(data.duration_days_max):null,provenance:{table:"variety_cultivation_agronomy",row_id:data.id,source:data.source??null}};}return null;}

export async function getBannedChemicals(supabase:SupabaseClient):Promise<Set<string>>{const {data}=await supabase.from("chemical_regulatory_status").select("chemical_name, status").limit(1000);const out=new Set<string>();for(const r of data||[]){if(String(r.status??"").toLowerCase()!=="approved")out.add(String(r.chemical_name??"").toLowerCase());}return out;}
export async function getLaborRate(supabase:SupabaseClient,state:string|null,district:string|null):Promise<number|null>{if(!state&&!district)return null;const {data}=await supabase.from("labor_rates").select("daily_rate").eq("state",state).eq("district",district).maybeSingle();return data?.daily_rate!=null?Number(data.daily_rate):null;}
