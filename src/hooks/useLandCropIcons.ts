import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Crop icon for each land, from the crops master (crops.icon) — never a crop list written in code.
 *
 * The crop is identified by lands.current_crop_id; where that is empty (older lands keep only the crop's
 * display text in lands.current_crop), by the crop of the stage the phenology engine resolved for the land
 * (lands.stage_uuid → crop_stage_master.crop_code, matched to crops.value). Display text is never matched.
 * A land whose crop cannot be identified gets null, and the screen shows a neutral plant icon.
 */
export function useLandCropIcons(lands: Array<{ id: string; current_crop_id?: string | null; stage_uuid?: string | null }>): Record<string, string | null> {
  const cropsQ = useQuery({
    queryKey: ['crops-icons'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('crops').select('id, value, icon');
      if (error) throw error;
      return (data || []) as Array<{ id: string; value: string | null; icon: string | null }>;
    },
  });

  const stageIds = useMemo(() => [...new Set(lands.filter((l) => !l.current_crop_id && l.stage_uuid).map((l) => l.stage_uuid as string))].sort(), [lands]);
  const stagesQ = useQuery({
    queryKey: ['land-stage-crops', stageIds],
    enabled: stageIds.length > 0,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('crop_stage_master').select('id, crop_code').in('id', stageIds);
      if (error) throw error;
      return (data || []) as Array<{ id: string; crop_code: string }>;
    },
  });

  return useMemo(() => {
    const crops = cropsQ.data || [];
    const byId = new Map(crops.map((c) => [c.id, c.icon]));
    const byCode = new Map(crops.filter((c) => c.value).map((c) => [String(c.value).toLowerCase(), c.icon]));
    const stageCrop = new Map((stagesQ.data || []).map((s) => [s.id, s.crop_code]));
    const out: Record<string, string | null> = {};
    for (const l of lands) {
      const code = l.stage_uuid ? stageCrop.get(l.stage_uuid) : undefined;
      out[l.id] = (l.current_crop_id ? byId.get(l.current_crop_id) : undefined) ?? (code ? byCode.get(code.toLowerCase()) : undefined) ?? null;
    }
    return out;
  }, [cropsQ.data, stagesQ.data, lands]);
}
