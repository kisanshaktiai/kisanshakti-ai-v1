import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';

export interface NDVIMetadata {
  alerts: string[];
  health_label: 'Critical' | 'Moderate' | 'Healthy' | 'Excellent';
  ndvi_trend: number;
  ndre_trend: number;
  valid_observations: number;
}

export interface NDVIDataComplete {
  id: string;
  land_id: string;
  date: string;
  // Core values
  ndvi_value: number;
  evi_value: number | null;
  ndwi_value: number | null;
  savi_value: number | null;
  // Statistics
  min_ndvi: number | null;
  max_ndvi: number | null;
  mean_ndvi: number | null;
  median_ndvi: number | null;
  ndvi_std: number | null;
  // Quality metrics
  quality_score: number | null;
  confidence_level: string | null;
  cloud_coverage: number | null;
  coverage_percentage: number | null;
  valid_pixels: number | null;
  total_pixels: number | null;
  // Satellite info
  satellite_source: string | null;
  collection_id: string | null;
  scene_id: string | null;
  processing_level: string | null;
  spatial_resolution: number | null;
  tile_id: string | null;
  // Media
  image_url: string | null;
  // AI-generated metadata
  metadata: NDVIMetadata | null;
  // Timestamps
  created_at: string;
  updated_at: string | null;
  computed_at: string | null;
  // Additional
  soil_moisture: number | null;
  tenant_id: string;
}

export interface NDVIPrediction {
  days7: {
    predicted_ndvi: number;
    trend_direction: 'improving' | 'declining' | 'stable';
    confidence: number;
  };
  days14: {
    predicted_ndvi: number;
    trend_direction: 'improving' | 'declining' | 'stable';
    confidence: number;
  };
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  recommended_actions: string[];
}

export interface NDVIAnalysisResult {
  current: NDVIDataComplete | null;
  history: NDVIDataComplete[];
  prediction: NDVIPrediction | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

function calculatePrediction(history: NDVIDataComplete[]): NDVIPrediction | null {
  if (history.length < 2) return null;

  const current = history[0];
  const metadata = current?.metadata;
  const ndviTrend = metadata?.ndvi_trend ?? 0;
  const currentNdvi = current?.ndvi_value ?? 0;

  // Calculate 7-day and 14-day predictions based on trend
  const predicted7 = Math.max(0, Math.min(1, currentNdvi + (ndviTrend * 7)));
  const predicted14 = Math.max(0, Math.min(1, currentNdvi + (ndviTrend * 14)));

  // Determine trend direction
  const getTrendDirection = (trend: number): 'improving' | 'declining' | 'stable' => {
    if (trend > 0.001) return 'improving';
    if (trend < -0.001) return 'declining';
    return 'stable';
  };

  // Calculate risk level
  const getRiskLevel = (ndvi: number, trend: number): 'low' | 'medium' | 'high' | 'critical' => {
    if (ndvi < 0.2 || (ndvi < 0.4 && trend < -0.005)) return 'critical';
    if (ndvi < 0.4 || (ndvi < 0.5 && trend < -0.003)) return 'high';
    if (ndvi < 0.5 || trend < -0.001) return 'medium';
    return 'low';
  };

  // Generate recommended actions based on analysis
  const getRecommendedActions = (healthLabel: string, alerts: string[], ndvi: number): string[] => {
    const actions: string[] = [];
    
    if (alerts?.includes('Very low vegetation cover')) {
      actions.push('Immediate soil and water assessment required');
      actions.push('Consider replanting or crop rotation');
    }
    
    if (alerts?.includes('Crop water stress likely') || alerts?.includes('Moderate vegetation stress')) {
      actions.push('Increase irrigation frequency');
      actions.push('Apply foliar nutrients');
    }
    
    if (healthLabel === 'Critical') {
      actions.push('Urgent: Contact agricultural expert');
      actions.push('Document crop condition with photos');
    }
    
    if (ndvi > 0.6) {
      actions.push('Maintain current care routine');
      actions.push('Monitor for pest activity');
    }

    return actions.length > 0 ? actions : ['Continue regular monitoring'];
  };

  const trendDirection = getTrendDirection(ndviTrend);
  const riskLevel = getRiskLevel(currentNdvi, ndviTrend);

  return {
    days7: {
      predicted_ndvi: predicted7,
      trend_direction: trendDirection,
      confidence: Math.min(95, 70 + (metadata?.valid_observations ?? 0) * 3),
    },
    days14: {
      predicted_ndvi: predicted14,
      trend_direction: trendDirection,
      confidence: Math.min(85, 60 + (metadata?.valid_observations ?? 0) * 2),
    },
    risk_level: riskLevel,
    recommended_actions: getRecommendedActions(
      metadata?.health_label ?? '',
      metadata?.alerts ?? [],
      currentNdvi
    ),
  };
}

export function useNDVIAnalysis(landId: string | null): NDVIAnalysisResult {
  const { tenant } = useTenant();
  const { session } = useAuthStore();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['ndvi-analysis', landId, tenant?.id],
    queryFn: async () => {
      if (!landId) return { current: null, history: [] };

      const { data: ndviData, error: ndviError } = await supabase
        .from('ndvi_data')
        .select('*')
        .eq('land_id', landId)
        .order('date', { ascending: false })
        .limit(30);

      if (ndviError) throw ndviError;

      // Parse metadata from JSONB
      const parsedData = (ndviData || []).map((item: any) => ({
        ...item,
        metadata: item.metadata ? (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata) : null,
      })) as NDVIDataComplete[];

      return {
        current: parsedData[0] || null,
        history: parsedData,
      };
    },
    enabled: !!landId && !!session?.farmerId,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const prediction = data?.history ? calculatePrediction(data.history) : null;

  return {
    current: data?.current ?? null,
    history: data?.history ?? [],
    prediction,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useNDVIComparison(landIds: string[]) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['ndvi-comparison', landIds, tenant?.id],
    queryFn: async () => {
      if (landIds.length === 0) return [];

      const { data, error } = await supabase
        .from('ndvi_data')
        .select('*')
        .in('land_id', landIds)
        .order('date', { ascending: false });

      if (error) throw error;

      // Group by land_id and get latest for each
      const latestByLand = new Map<string, NDVIDataComplete>();
      (data || []).forEach((item: any) => {
        if (!latestByLand.has(item.land_id)) {
          latestByLand.set(item.land_id, {
            ...item,
            metadata: item.metadata ? (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata) : null,
          });
        }
      });

      return Array.from(latestByLand.values());
    },
    enabled: landIds.length > 0,
  });
}
