import { useQuery } from '@tanstack/react-query';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { landsApi } from '@/services/landsApi';
/** Raw satellite rows for one land as returned by lands-api?action=satellite. */
export interface SatelliteBundle { decision:any[]; assets:any[]; logs:any[]; intel:any[]; radar:any[]; schedule:any|null; canopy:any[]; surface:any[]; }

export interface NDVIMetadata { alerts?: string[]; health_label?: string; ndvi_trend?: number; ndre_trend?: number; ndvi_geotiff_url?: string; valid_observations?: number; [key: string]: unknown; }
export interface NDVIDataComplete { id:string; land_id:string; date:string; acquisition_time?:string|null; ndvi_value:number; evi_value:number|null; ndwi_value:number|null; savi_value:number|null; ndre_value?:number|null; ndmi_value?:number|null; min_ndvi:number|null; max_ndvi:number|null; ndvi_min?:number|null; ndvi_max?:number|null; mean_ndvi:number|null; median_ndvi:number|null; ndvi_std:number|null; ndvi_spatial_min?:number|null; ndvi_spatial_max?:number|null; ndvi_spatial_median?:number|null; ndvi_spatial_std?:number|null; ndvi_p10?:number|null; ndvi_p90?:number|null; quality_score:number|null; confidence_level:string|null; cloud_coverage:number|null; cloud_cover?:number|null; coverage_percentage:number|null; coverage?:number|null; valid_pixels:number|null; total_pixels:number|null; effective_pixel_count?:number|null; coverage_weighted_purity?:number|null; boundary_contamination_fraction?:number|null; ndvi_spatial_se?:number|null; evidence_confidence?:string|null; measurement_status?:string|null; spatial_stat_method?:string|null; age_days?:number|null; is_fresh?:boolean|null; satellite_source:string|null; collection_id:string|null; scene_id:string|null; processing_level:string|null; spatial_resolution:number|null; tile_id:string|null; image_url:string|null; metadata:NDVIMetadata|null; created_at:string; updated_at:string|null; computed_at:string|null; soil_moisture:number|null; tenant_id:string; }
export interface NDVIProcessingLog { id:string; land_id:string|null; processing_step:string; step_status:string; completed_at:string|null; created_at:string|null; error_message:string|null; metadata:{thumbnail_url?:string;geotiff_url?:string;health_label?:string}|null; }
export interface NDVIProcessingThumbnail { url:string; date:string; geotiffUrl?:string; }
/** Compatibility only. Client-side predictions are deliberately disabled. */
export interface NDVIPrediction { days7:{predicted_ndvi:number;trend_direction:'improving'|'declining'|'stable';confidence:number}; days14:{predicted_ndvi:number;trend_direction:'improving'|'declining'|'stable';confidence:number}; risk_level:'low'|'medium'|'high'|'critical'; recommended_action_keys:string[]; is_indicative:true; }
export interface NDVIAnalysisResult { current:NDVIDataComplete|null; history:NDVIDataComplete[]; latestRaw:NDVIDataComplete|null; latestProcessingLog:NDVIProcessingLog|null; processingThumbnail:NDVIProcessingThumbnail|null; prediction:NDVIPrediction|null; bundle:SatelliteBundle|null; isLoading:boolean; error:Error|null; refetch:()=>void; }
const SIX_HOURS=6*60*60*1000; const ONE_HOUR=60*60*1000; const DECISION_VIEW='v_ndvi_decision_grade';
const DECISION_COLUMNS='land_id,tenant_id,acquisition_date,acquisition_time,scene_id,ndvi_value,savi_value,ndre_value,ndmi_value,uniformity_cv,quality_score,confidence_level,cloud_cover,observation_source,effective_pixel_count,coverage_weighted_purity,boundary_contamination_fraction,ndvi_spatial_se,evidence_confidence,measurement_status,spatial_stat_method,age_days,is_fresh';
export function useNDVIAnalysis(landId:string|null):NDVIAnalysisResult {
  const {tenant}=useTenant(); const {session}=useAuthStore(); const tenantId=session?.tenantId??tenant?.id; const farmerId=session?.farmerId; const sessionToken=session?.token;
  const {data,isLoading,error,refetch}=useQuery({queryKey:['ndvi-analysis','access-v3',landId,tenantId,sessionToken],queryFn:async()=>{
    if(!landId||!tenantId)return{current:null,history:[],latestRaw:null,latestProcessingLog:null,processingThumbnail:null,bundle:null};
    // 2026-10-10: read through lands-api (server verifies land ownership). Direct browser reads of
    // these tables are refused by their row rules (42501) and blanked the whole satellite screen.
    const cutoffDay=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
    const bundle:SatelliteBundle=await landsApi.fetchSatellite(landId);
    const decisionRows=(bundle.decision||[]) as any[]; const logResult={data:bundle.logs||[]};
    const assetRows:any[]=bundle.assets||[];
    const assetsByScene=new Map<string,any>(); for(const row of assetRows){if(row.scene_id&&!assetsByScene.has(row.scene_id))assetsByScene.set(row.scene_id,row);}
    const parsed=decisionRows.map((d:any,index:number)=>{const a=assetsByScene.get(d.scene_id)||{};const metadata=a.metadata?(typeof a.metadata==='string'?JSON.parse(a.metadata):a.metadata):null;return{...a,...d,id:`${d.land_id}:${d.scene_id||d.acquisition_date}:${index}`,date:d.acquisition_date,cloud_coverage:d.cloud_cover??null,coverage_percentage:null,metadata} as NDVIDataComplete;});
    const latestRaw=parsed[0]||null;
    // `current` is the newest decision-grade measurement even when stale. Freshness is a separate evidence dimension and is surfaced to the farmer; it must not turn a valid historical measurement into "no data".
    // Every row here already passed the decision-grade view. `is_fresh` is an age flag only:
    // filtering the trend by it discarded valid older measurements and left a single point.
    const history=parsed; const current=latestRaw;
    const logs=((logResult.data||[])as any[]).map(item=>({...item,metadata:item.metadata?(typeof item.metadata==='string'?JSON.parse(item.metadata):item.metadata):null}))as NDVIProcessingLog[];
    const latestProcessingLog=logs[0]||null; const successfulThumb=logs.find(log=>log.processing_step==='PROCESS_END'&&log.step_status==='completed'&&!!log.metadata?.thumbnail_url); const processingThumbnail=successfulThumb?.metadata?.thumbnail_url?{url:successfulThumb.metadata.thumbnail_url,date:successfulThumb.completed_at||successfulThumb.created_at||cutoffDay,geotiffUrl:successfulThumb.metadata.geotiff_url}:null;
    return{current,history,latestRaw,latestProcessingLog,processingThumbnail,bundle};
  },enabled:!!landId&&!!farmerId&&!!tenantId,staleTime:SIX_HOURS,refetchOnWindowFocus:false,refetchInterval:false});
  return{current:data?.current??null,history:data?.history??[],latestRaw:data?.latestRaw??null,latestProcessingLog:data?.latestProcessingLog??null,processingThumbnail:data?.processingThumbnail??null,prediction:null,bundle:data?.bundle??null,isLoading,error:error as Error|null,refetch};
}
export interface NDVIMicroTile{id:string;land_id:string;acquisition_date:string;bbox:any;cloud_cover:number|null;ndvi_mean:number|null;ndvi_min:number|null;ndvi_max:number|null;ndvi_std_dev:number|null;ndvi_thumbnail_url:string|null;resolution_meters:number|null;is_reliable:boolean;}
/** Legacy compatibility hook. New surfaces must use decision-grade observations. */
export function useNDVIMicroTiles(landId:string|null){const{tenant}=useTenant();const{session}=useAuthStore();const tenantId=session?.tenantId??tenant?.id;const farmerId=session?.farmerId;return useQuery({queryKey:['ndvi-micro-tiles',landId,tenantId],queryFn:async():Promise<NDVIMicroTile[]>=>{if(!landId||!tenantId)return[];const client=supabaseWithAuth(farmerId,tenantId);const cutoff=new Date(Date.now()-45*86400000).toISOString().slice(0,10);const{data,error}=await client.from('ndvi_micro_tiles').select('*').eq('land_id',landId).eq('tenant_id',tenantId).gte('acquisition_date',cutoff).order('acquisition_date',{ascending:false}).limit(24);if(error)return[];return(data||[])as unknown as NDVIMicroTile[];},enabled:!!landId&&!!farmerId&&!!tenantId,staleTime:ONE_HOUR,refetchOnWindowFocus:false});}
