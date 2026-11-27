import { useQuery } from '@tanstack/react-query';
import { useSchedules } from '@/hooks/useSchedules';
import { schedulesApi } from '@/services/schedulesApi';

export interface TodayTask { id: string; task_name: string | null; task_type: string | null; status: string | null; task_date: string }

const todayInIndia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * Tasks dated today, and not finished, on the land's active schedule.
 * Reads through the same paths the Schedule page uses: useSchedules (schedules-api)
 * for the land's active schedule, then schedulesApi.fetchTasks for its tasks.
 */
export function useTodayTasks(landId?: string | null) {
  const { schedules, isLoading: schedulesLoading, isError: schedulesError } = useSchedules(landId || undefined);
  const schedule = landId ? (schedules as Array<{ id: string; land_id?: string | null }>).find((s) => s.land_id === landId) ?? null : null;

  const query = useQuery({
    queryKey: ['tasks', 'today', schedule?.id],
    enabled: !!schedule?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TodayTask[]> => {
      const today = todayInIndia();
      const rows = (await schedulesApi.fetchTasks(schedule!.id)) as TodayTask[];
      return rows.filter((t) => String(t.task_date).slice(0, 10) === today && t.status !== 'completed');
    },
  });

  return {
    tasks: query.data ?? [],
    hasSchedule: !!schedule,
    isLoading: schedulesLoading || (!!schedule && query.isLoading),
    isError: schedulesError || query.isError,
  };
}
