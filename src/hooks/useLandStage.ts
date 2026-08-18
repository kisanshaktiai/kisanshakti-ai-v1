/**
 * Land stage SSOT reader.
 *
 * The land row (lands.stage_uuid / crop_stage / stage_source / stage_resolved_at) is the
 * ONLY source of the crop's current stage. resolve_crop_phenology is the only writer.
 * This hook READS it — it never computes, infers or reconciles a stage.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type StagePhase = 'past' | 'now' | 'upcoming' | 'unknown';

export interface LandStageInfo {
  stageUuid: string | null;
  stageLabel: string | null;
  stageSource: string | null;
  stageResolvedAt: string | null;
  /** crop_stage_master ordering for this land's crop: stage id -> order index */
  order: Record<string, number>;
  currentOrder: number | null;
}

const STRONG_SOURCES = ['photo_morphology', 'farmer_observation', 'morphology'];

export const isStrongStageSource = (source: string | null | undefined): boolean =>
  !!source && STRONG_SOURCES.includes(String(source).toLowerCase());

export function useLandStage(landId?: string | null) {
  const query = useQuery({
    queryKey: ['land-stage-ssot', landId],
    enabled: !!landId,
    staleTime: 60_000,
    queryFn: async (): Promise<LandStageInfo> => {
      const { data: land } = await supabase
        .from('lands')
        .select('stage_uuid, crop_stage, stage_source, stage_resolved_at, current_crop')
        .eq('id', landId!)
        .maybeSingle();

      const empty: LandStageInfo = {
        stageUuid: null,
        stageLabel: null,
        stageSource: null,
        stageResolvedAt: null,
        order: {},
        currentOrder: null,
      };
      if (!land) return empty;

      // Ordering comes from the stage catalogue for the resolved stage's crop.
      let cropCode: string | null = null;
      if (land.stage_uuid) {
        const { data: cur } = await supabase
          .from('crop_stage_master')
          .select('crop_code')
          .eq('id', land.stage_uuid)
          .maybeSingle();
        cropCode = cur?.crop_code ?? null;
      }

      const order: Record<string, number> = {};
      if (cropCode) {
        const { data: stages } = await supabase
          .from('crop_stage_master')
          .select('id, das_min, stage_code')
          .eq('crop_code', cropCode)
          .eq('is_active', true)
          .order('das_min', { ascending: true, nullsFirst: true });
        (stages || []).forEach((s: any, idx: number) => {
          order[s.id] = idx;
        });
      }

      return {
        stageUuid: land.stage_uuid ?? null,
        stageLabel: (land as any).crop_stage ?? null,
        stageSource: (land as any).stage_source ?? null,
        stageResolvedAt: (land as any).stage_resolved_at ?? null,
        order,
        currentOrder: land.stage_uuid != null && order[land.stage_uuid] != null ? order[land.stage_uuid] : null,
      };
    },
  });

  const info = query.data;

  /** Compare a task's stage to the land's current stage. Never hides a task. */
  const phaseOfTask = (task: { stage_uuid?: string | null }): StagePhase => {
    if (!info || !info.stageUuid || info.currentOrder == null) return 'unknown';
    const taskStage = task?.stage_uuid;
    if (!taskStage) return 'unknown';
    if (taskStage === info.stageUuid) return 'now';
    const taskOrder = info.order[taskStage];
    if (taskOrder == null) return 'unknown';
    return taskOrder < info.currentOrder ? 'past' : 'upcoming';
  };

  /**
   * Disagreement signal: the land's stage was resolved from a strong observation but the
   * task list's stage span does not include it. Surfaced to the farmer, never auto-fixed.
   */
  const hasStageDisagreement = (tasks: Array<{ stage_uuid?: string | null }>): boolean => {
    if (!info || !info.stageUuid || !isStrongStageSource(info.stageSource)) return false;
    const withStage = (tasks || []).filter((t) => !!t?.stage_uuid);
    if (!withStage.length) return false;
    return !withStage.some((t) => t.stage_uuid === info.stageUuid);
  };

  return {
    stage: info,
    isLoading: query.isLoading,
    phaseOfTask,
    hasStageDisagreement,
  };
}

export default useLandStage;
