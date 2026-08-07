import { useQuery } from '@tanstack/react-query';
import { envIntelligenceApi } from '@/services/envIntelligenceApi';

const FIFTEEN_MIN = 15 * 60 * 1000;

export function useLandEnvState(landId?: string) {
  return useQuery({
    queryKey: ['env-intel', 'state', landId],
    queryFn: () => envIntelligenceApi.getLandState(landId!),
    enabled: !!landId,
    staleTime: FIFTEEN_MIN,
    gcTime: 2 * FIFTEEN_MIN,
    retry: 1,
  });
}

export function useLandEnvTimeline(
  landId?: string,
  properties: string[] = ['ET0', 'RAIN'],
  pastDays = 7,
  forecastDays = 5,
) {
  return useQuery({
    queryKey: ['env-intel', 'timeline', landId, properties.join(','), pastDays, forecastDays],
    queryFn: () => envIntelligenceApi.getTimeline(landId!, { properties, pastDays, forecastDays }),
    enabled: !!landId,
    staleTime: FIFTEEN_MIN,
    gcTime: 2 * FIFTEEN_MIN,
    retry: 1,
  });
}

export function useObservationLineage(obsId?: number, enabled = true) {
  return useQuery({
    queryKey: ['env-intel', 'lineage', obsId],
    queryFn: () => envIntelligenceApi.getLineage(obsId!),
    enabled: !!obsId && enabled,
    staleTime: FIFTEEN_MIN,
    retry: 1,
  });
}
