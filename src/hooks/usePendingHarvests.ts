import { useQuery, useQueryClient } from '@tanstack/react-query';
import { schedulesApi } from '@/services/schedulesApi';
import { useAuthStore } from '@/stores/authStore';

export interface PendingHarvest {
  id: string;
  schedule_id: string;
  land_id: string;
  due_at: string | null;
  reminder_count: number;
  last_reminded_at: string | null;
  triggered_at: string;
  status: string;
  crop_schedules?: {
    id: string;
    crop_name: string | null;
    crop_variety: string | null;
    sowing_date: string | null;
    expected_harvest_date: string | null;
    harvest_status: string | null;
  } | null;
  lands?: {
    id: string;
    name: string | null;
    area_acres: number | null;
  } | null;
}

export function usePendingHarvests() {
  const { user } = useAuthStore();
  const farmerId = user?.id;

  return useQuery({
    queryKey: ['pending-harvests', farmerId],
    queryFn: () => schedulesApi.fetchPendingHarvests() as Promise<PendingHarvest[]>,
    enabled: !!farmerId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useInvalidatePendingHarvests() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['pending-harvests'] });
    qc.invalidateQueries({ queryKey: ['schedules'] });
    qc.invalidateQueries({ queryKey: ['lands'] });
  };
}
