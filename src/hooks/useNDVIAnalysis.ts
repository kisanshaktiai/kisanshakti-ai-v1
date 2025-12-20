import { useQuery } from '@tanstack/react-query';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { 
  getScientificRiskLevel, 
  getTrendDirection, 
  NDVI_THRESHOLDS 
} from '@/lib/ndviScience';

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

  // Generate recommended actions based on scientific thresholds
  const getRecommendedActions = (healthLabel: string, alerts: string[], ndvi: number): string[] => {
    const actions: string[] = [];
    
    // Critical threshold (below 0.20)
    if (ndvi < NDVI_THRESHOLDS.POOR) {
      actions.push('🚨 Urgent: Immediate soil and water assessment required');
      actions.push('📞 Contact agricultural expert immediately');
      actions.push('📸 Document crop condition with photos');
      actions.push('Consider replanting or crop rotation');
    }
    // Poor threshold (0.20 - 0.35)
    else if (ndvi < NDVI_THRESHOLDS.MODERATE) {
      actions.push('💧 Increase irrigation frequency');
      actions.push('🌾 Check for nutrient deficiency');
      actions.push('🐛 Inspect for pest/disease damage');
      actions.push('Apply foliar nutrients if needed');
    }
    // Moderate threshold (0.35 - 0.50)
    else if (ndvi < NDVI_THRESHOLDS.HEALTHY) {
      actions.push('Monitor water stress levels');
      actions.push('Consider supplemental irrigation');
      actions.push('Check soil moisture regularly');
    }
    // Healthy/Excellent (above 0.50)
    else {
      actions.push('✅ Maintain current care routine');
      actions.push('Continue regular monitoring');
      if (ndvi >= NDVI_THRESHOLDS.EXCELLENT) {
        actions.push('🌿 Crop is in excellent condition');
      }
    }
    
    // Add alert-specific actions
    if (alerts?.includes('Crop water stress likely')) {
      actions.push('💧 Water stress detected - irrigate soon');
    }
    if (alerts?.includes('Very low vegetation cover')) {
      actions.push('Consider replanting affected areas');
    }

    return actions.length > 0 ? actions : ['Continue regular monitoring'];
  };

  const trendDirection = getTrendDirection(ndviTrend);
  const riskLevel = getScientificRiskLevel(currentNdvi, ndviTrend);

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
  const tenantId = tenant?.id ?? session?.tenantId;
  const farmerId = session?.farmerId;

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['ndvi-analysis', landId, tenantId],
    queryFn: async () => {
      if (!landId) return { current: null, history: [] };

      const client = supabaseWithAuth(farmerId, tenantId);

      const { data: ndviData, error: ndviError } = await client
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
    enabled: !!landId && !!farmerId && !!tenantId,
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
  const { session } = useAuthStore();
  const tenantId = tenant?.id ?? session?.tenantId;
  const farmerId = session?.farmerId;

  return useQuery({
    queryKey: ['ndvi-comparison', landIds, tenantId],
    queryFn: async () => {
      if (landIds.length === 0) return [];

      const client = supabaseWithAuth(farmerId, tenantId);

      const { data, error } = await client
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
    enabled: landIds.length > 0 && !!farmerId && !!tenantId,
  });
}
