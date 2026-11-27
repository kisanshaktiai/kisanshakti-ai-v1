import { useQuery } from '@tanstack/react-query';
import { useSchedules } from '@/hooks/useSchedules';
import { schedulesApi } from '@/services/schedulesApi';

export interface LandTask {
  id: string; task_name: string | null; task_description?: string | null; task_type: string | null;
  status: string | null; task_date: string; completed_at?: string | null;
}
export type TodayTask = LandTask;

const todayInIndia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * Tasks of the land's active schedule, and the ones dated today that are not finished.
 * Reads through the same paths the Schedule page uses: useSchedules (schedules-api)
 * for the land's active schedule, then schedulesApi.fetchTasks for its tasks.
 */
export function useTodayTasks(landId?: string | null) {
  const { schedules, isLoading: schedulesLoading, isError: schedulesError } = useSchedules(landId || undefined);
  const schedule = landId ? (schedules as Array<{ id: string; land_id?: string | null; crop_name?: string | null }>).find((s) => s.land_id === landId) ?? null : null;

  const query = useQuery({
    queryKey: ['tasks', 'land', schedule?.id],
    enabled: !!schedule?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LandTask[]> => (await schedulesApi.fetchTasks(schedule!.id)) as LandTask[],
  });

  const allTasks = query.data ?? [];
  const today = todayInIndia();
  return {
    tasks: allTasks.filter((t) => String(t.task_date).slice(0, 10) === today && t.status !== 'completed'),
    allTasks,
    schedule,
    hasSchedule: !!schedule,
    isLoading: schedulesLoading || (!!schedule && query.isLoading),
    isError: schedulesError || query.isError,
    refetch: query.refetch,
  };
}
