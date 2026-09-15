// CHANGE LOG
// 2026-09-09 — getSeedRate now also returns the row's seed_rate_basis_code and its broadcast band.
//   The computed rate is the DRILL / line-sown figure; a smallholder broadcasting by hand needs the
//   broadcast rate, which sits in the same row and was simply never read. The schedule stated one
//   number with no indication of which sowing method it assumed.
// 2026-09-08 — methodFilter tolerates a missing methods array (falls back to 'any'); getObservationRules /
//   getFieldActionRules called with fewer args no longer throw.
// 2026-09-08 — straight fertilizer = exactly one PRIMARY nutrient (N, P2O5, K2O) in nutrient_analysis; secondary
//   nutrients (S, Ca, Mg) no longer disqualify a product — SSP (16% P2O5 + 11% S + 20% Ca) was being rejected, so
//   every P dose shipped with no product equivalent.
// 2026-09-05 — Completeness fixes (all DB-driven, no agronomy constants):
//   (1) getFertilizerPlan prefers the row whose cultivation_context matches the farmer's method
//       or stage clock; a context mismatch is recorded as a named gap, never hidden.
//   (2) getCropClockOrigins exposes the crop's clock-origin names (crop_stage_master
//       clock_reference/das_reference) so a split anchored to another method's establishment
//       event can be re-anchored to THIS graph's establishment stage by the generator.
//   (3) getStraightFertilizerProducts reads master_products.nutrient_analysis for single-nutrient
//       fertilizers so a nutrient dose can be shown as an equivalent product quantity (pure
//       arithmetic on catalog percentages).
//   (4) getLaborRate re-wired to the real labor_rates columns (state, operation_type, daily_wage).
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

export interface SeedRateResult { kgPerAcre:number; rationale:string|null; provenance:Provenance;
  /** What the rate assumes (e.g. drill / line-sown vs nursery), straight from the DB row. */
  basisCode:string|null;
  /** The same row's broadcast band, for a farmer sowing by hand rather than with a drill. */
  broadcastKgPerAcre:{min:number|null;max:number|null}|null; }
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
      .select("id, target_plants_per_m2, seed_rate_kg_per_acre_min, seed_rate_kg_per_acre_max, seed_rate_rationale, source, evidence_tier, seed_rate_basis_code, seed_rate_broadcast_kg_per_acre_min, seed_rate_broadcast_kg_per_acre_max")
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
        basisCode: vca.seed_rate_basis_code != null ? String(vca.seed_rate_basis_code) : null,
        broadcastKgPerAcre: vca.seed_rate_broadcast_kg_per_acre_min != null || vca.seed_rate_broadcast_kg_per_acre_max != null ? { min: vca.seed_rate_broadcast_kg_per_acre_min != null ? Number(vca.seed_rate_broadcast_kg_per_acre_min) : null, max: vca.seed_rate_broadcast_kg_per_acre_max != null ? Number(vca.seed_rate_broadcast_kg_per_acre_max) : null } : null,
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
    basisCode: vca?.seed_rate_basis_code != null ? String(vca.seed_rate_basis_code) : null,
    broadcastKgPerAcre: vca?.seed_rate_broadcast_kg_per_acre_min != null || vca?.seed_rate_broadcast_kg_per_acre_max != null ? { min: vca?.seed_rate_broadcast_kg_per_acre_min != null ? Number(vca.seed_rate_broadcast_kg_per_acre_min) : null, max: vca?.seed_rate_broadcast_kg_per_acre_max != null ? Number(vca.seed_rate_broadcast_kg_per_acre_max) : null } : null,
    provenance: { table: "variety_cultivation_agronomy", row_id: (vca?.id as string) ?? null, source: `${(vca?.source as string) ?? ""}; method:${vcaMethod ?? ""}` },
  };
}

export interface FertilizerPlan { n_kg_ha:number|null;p2o5_kg_ha:number|null;k2o_kg_ha:number|null;splits:Array<Record<string,unknown>>;gaps:string[];provenance:Provenance;cultivation_context:string|null; }
export async function getFertilizerPlan(supabase:SupabaseClient,cropCode:string,regionCode:string|null,fertilityClass:string|null,methodTokens:string[]=[]):Promise<FertilizerPlan|null>{
  const {data}=await supabase.from("fertilizer_recommendation_master").select("id, crop_code, region_code, soil_fertility_class, n_kg_ha, p2o5_kg_ha, k2o_kg_ha, split_schedule, source, authority, confidence, cultivation_context").ilike("crop_code",cropCode);const rows=data||[];if(!rows.length)return null;
  const tokens=[...new Set(methodTokens.filter(Boolean).map(t=>String(t).toLowerCase()))];const contextMatches=(r:Record<string,unknown>)=>{const c=String(r.cultivation_context??"").toLowerCase();return !!c&&tokens.some(t=>c.includes(t));};
  const score=(r:Record<string,unknown>)=>(contextMatches(r)?4:0)+(regionCode&&String(r.region_code??"").toLowerCase()===regionCode.toLowerCase()?2:0)+(fertilityClass&&String(r.soil_fertility_class??"").toLowerCase()===fertilityClass.toLowerCase()?2:0)+(r.region_code==null?1:0);const best=[...rows].sort((a,b)=>score(b)-score(a))[0];const gaps:string[]=[];let splitParsed:unknown=best.split_schedule;
  if(tokens.length&&best.cultivation_context&&!contextMatches(best))gaps.push(`fertilizer_context_mismatch:${String(best.cultivation_context)}`);
  if(typeof splitParsed==="string"){const trimmed=splitParsed.trim();if(!trimmed)splitParsed=null;else{try{splitParsed=JSON.parse(trimmed);}catch{splitParsed=null;gaps.push("fertilizer_split_schedule_unparseable");}}}
  const splits=Array.isArray(splitParsed)?splitParsed:splitParsed&&typeof splitParsed==="object"?Object.values(splitParsed):[];return{n_kg_ha:best.n_kg_ha!=null?Number(best.n_kg_ha):null,p2o5_kg_ha:best.p2o5_kg_ha!=null?Number(best.p2o5_kg_ha):null,k2o_kg_ha:best.k2o_kg_ha!=null?Number(best.k2o_kg_ha):null,splits:splits as Array<Record<string,unknown>>,gaps,provenance:{table:"fertilizer_recommendation_master",row_id:best.id,source:best.source??null,authority:best.authority??null,confidence:best.confidence!=null?Number(best.confidence):null},cultivation_context:best.cultivation_context!=null?String(best.cultivation_context):null};
}

/** Clock-origin names used by this crop's stage graphs (e.g. the values of clock_reference/das_reference). DB-derived; no crop-specific list. */
export async function getCropClockOrigins(supabase:SupabaseClient,cropCode:string):Promise<string[]>{const {data}=await supabase.from("crop_stage_master").select("clock_reference, das_reference").ilike("crop_code",cropCode).eq("is_active",true).limit(1000);const out=new Set<string>();for(const r of data||[]){for(const v of [r.clock_reference,r.das_reference]){const s=String(v??"").trim().toLowerCase();if(s)out.add(s);}}return [...out];}

export interface StraightFertilizerProduct { id:string;name:string;nutrient:string;percent:number;organicCertified:boolean; }
/** Single-nutrient fertilizer products from the catalog (exactly one non-zero key in nutrient_analysis). Used only to express a DB-derived nutrient dose as a product quantity. */
export async function getStraightFertilizerProducts(supabase:SupabaseClient):Promise<StraightFertilizerProduct[]>{
  const {data}=await supabase.from("master_products").select("id, name, nutrient_analysis, organic_certified").eq("product_type","fertilizer").eq("ai_recommendable",true).eq("status","active").limit(500);const out:StraightFertilizerProduct[]=[];
  for(const r of data||[]){const na=r.nutrient_analysis&&typeof r.nutrient_analysis==="object"?r.nutrient_analysis as Record<string,unknown>:null;if(!na)continue;const PRIMARY=new Set(["N","P2O5","K2O"]);const nonZero=Object.entries(na).filter(([k,v])=>PRIMARY.has(String(k).toUpperCase())&&v!=null&&Number.isFinite(Number(v))&&Number(v)>0);if(nonZero.length!==1)continue;const [key,val]=nonZero[0];const pct=Number(val);if(!(pct>0&&pct<=100))continue;out.push({id:String(r.id),name:String(r.name),nutrient:String(key).toUpperCase(),percent:pct,organicCertified:r.organic_certified===true});}
  return out.sort((a,b)=>b.percent-a.percent||a.name.localeCompare(b.name));
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
const methodFilter=(methods:string[]|null|undefined):string=>`cultivation_method_applicable.is.null,cultivation_method_applicable.ov.{${[...new Set(["any",...(methods??[]).filter(Boolean)])].join(",")}}`;
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
export async function getLaborRate(supabase:SupabaseClient,state:string|null,operationType:string|null):Promise<number|null>{if(!state)return null;let q=supabase.from("labor_rates").select("daily_wage").ilike("state",state).eq("is_active",true).order("effective_date",{ascending:false}).limit(1);if(operationType)q=q.eq("operation_type",operationType);const {data}=await q;const row=(data||[])[0];return row?.daily_wage!=null?Number(row.daily_wage):null;}
