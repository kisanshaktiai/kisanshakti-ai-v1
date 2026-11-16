import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getCultivationOptions, type CropMethodLink, type CropMethodMaster, type CropStageEvidence } from '@/lib/schedule/cultivationMethod';

export function useCropCultivationMethods(cropId: string | null, cropCycle: string | null) {
  const [catalog, setCatalog] = useState<{master: CropMethodMaster[];links: CropMethodLink[];stages: CropStageEvidence[]}>({
    master: [], links: [], stages: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setCatalog({master: [],links: [],stages: []});
    setError(null);
    if (!cropId) { setLoading(false); return () => { alive = false; }; }
    setLoading(true);
    (async () => {
      const { data: crop, error: cropError } = await supabase.from('crops')
        .select('value').eq('id',cropId).maybeSingle();
      if (cropError || !crop?.value) throw new Error(cropError?.message || 'Crop code is unavailable');
      const [linked, masters, stages] = await Promise.all([
        supabase.from('crop_cultivation_methods')
          .select('method_code,is_primary').eq('crop_code',crop.value),
        supabase.from('cultivation_method_master')
          .select('method_code,method_name_en,method_name_hi,method_name_mr,requires_nursery,is_active,parent_method_code')
          .eq('is_active',true),
        supabase.from('crop_stage_master')
          .select('cultivation_method,crop_cycle,stage_code,growth_stage')
          .eq('crop_code',crop.value).eq('is_active',true)
      ]);
      if (linked.error || masters.error || stages.error)
        throw new Error(linked.error?.message || masters.error?.message || stages.error?.message);
      if (alive) setCatalog({
        links:(linked.data||[]) as CropMethodLink[],
        master:(masters.data||[]) as CropMethodMaster[],
        stages:(stages.data||[]) as CropStageEvidence[]
      });
    })().catch((e: unknown) => {
      console.error('[useCropCultivationMethods] catalogue failed',e);
      if (alive) setError(e instanceof Error ? e.message : 'Could not load planting methods');
    }).finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[cropId]);
  return {options:getCultivationOptions(catalog.master,catalog.links,catalog.stages,cropCycle),loading,error};
}
