import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface CropGrowthUpload {
  id: string;
  land_id: string;
  farmer_id: string;
  tenant_id: string;
  file_url: string;
  file_type: string;
  thumbnail_url?: string;
  upload_timestamp: string;
  capture_location?: any;
  weather_at_capture?: any;
  ndvi_at_capture?: number;
  notes?: string;
  is_processed: boolean;
  processing_error?: string;
  created_at: string;
}

interface CropGrowthAnalysis {
  id: string;
  upload_id: string;
  land_id: string;
  crop_current_status: string;
  detected_growth_stage?: string;
  expected_growth_stage?: string;
  growth_stage_deviation?: string;
  visual_observation_summary: string;
  detected_issues?: any;
  canopy_health_score?: number;
  uniformity_score?: number;
  ndvi_weather_correlation?: string;
  signal_confidence?: string;
  next_3_day_prediction?: string;
  next_7_day_prediction?: string;
  next_14_day_prediction?: string;
  risk_level?: string;
  risk_factors?: any;
  yield_impact_estimate?: string;
  recommended_actions?: any;
  schedule_updates?: any;
  farmer_message: string;
  created_at: string;
}

interface CropGrowthAlert {
  id: string;
  land_id: string;
  alert_type: 'observation' | 'action_required' | 'critical_risk';
  alert_category: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger';
  recommended_action?: string;
  action_deadline?: string;
  is_read: boolean;
  is_actioned: boolean;
  created_at: string;
}

export function useCropGrowthTracking(landId?: string, farmerId?: string, tenantId?: string) {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Fetch uploads for a land
  const { data: uploads, isLoading: uploadsLoading, refetch: refetchUploads } = useQuery({
    queryKey: ['crop-growth-uploads', landId],
    queryFn: async () => {
      if (!landId) return [];
      
      // SPRINT 3: cap to last 50 uploads per land to keep payload small.
      const { data, error } = await supabase
        .from('crop_growth_uploads')
        .select('*')
        .eq('land_id', landId)
        .order('upload_timestamp', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as CropGrowthUpload[];
    },
    enabled: !!landId
  });

  // Fetch latest analysis for a land
  const { data: latestAnalysis, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery({
    queryKey: ['crop-growth-analysis', landId],
    queryFn: async () => {
      if (!landId) return null;
      
      const { data, error } = await supabase
        .from('crop_growth_analysis')
        .select('*')
        .eq('land_id', landId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as CropGrowthAnalysis | null;
    },
    enabled: !!landId
  });

  // Fetch all analyses for trend view
  const { data: analysisHistory } = useQuery({
    queryKey: ['crop-growth-analysis-history', landId],
    queryFn: async () => {
      if (!landId) return [];
      
      const { data, error } = await supabase
        .from('crop_growth_analysis')
        .select('*')
        .eq('land_id', landId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as CropGrowthAnalysis[];
    },
    enabled: !!landId
  });

  // Fetch active alerts
  const { data: alerts, refetch: refetchAlerts } = useQuery({
    queryKey: ['crop-growth-alerts', landId],
    queryFn: async () => {
      if (!landId) return [];
      
      // SPRINT 3: cap unread alerts to 50.
      const { data, error } = await supabase
        .from('crop_growth_alerts')
        .select('*')
        .eq('land_id', landId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as CropGrowthAlert[];
    },
    enabled: !!landId
  });

  // Upload photo/video
  const uploadMedia = useCallback(async (
    file: File,
    notes?: string,
    captureLocation?: { lat: number; lng: number }
  ): Promise<CropGrowthUpload | null> => {
    if (!landId || !farmerId || !tenantId) {
      toast.error('Missing required context');
      return null;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${farmerId}/${landId}/${Date.now()}.${fileExt}`;
      const fileType = file.type.startsWith('video/') ? 'video' : 'image';

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('crop-growth-media')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get signed URL
      const { data: urlData } = await supabase.storage
        .from('crop-growth-media')
        .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 days

      const fileUrl = urlData?.signedUrl;
      if (!fileUrl) throw new Error('Failed to get file URL');

      // Create upload record
      const { data: upload, error: insertError } = await supabase
        .from('crop_growth_uploads')
        .insert({
          land_id: landId,
          farmer_id: farmerId,
          tenant_id: tenantId,
          file_url: fileUrl,
          file_type: fileType,
          notes: notes,
          capture_location: captureLocation,
          is_processed: false
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await refetchUploads();
      toast.success('Photo uploaded successfully');
      
      return upload as CropGrowthUpload;
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photo');
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [landId, farmerId, tenantId, refetchUploads]);

  // Analyze uploaded media using existing ai-crop-scan function
  const analyzeUpload = useCallback(async (upload: CropGrowthUpload): Promise<any> => {
    if (!landId || !farmerId || !tenantId) {
      toast.error('Missing required context');
      return null;
    }

    setIsAnalyzing(true);

    try {
      // Fetch land details for context
      const { data: landData } = await supabase
        .from('lands')
        .select('*')
        .eq('id', landId)
        .single();

      // Fetch NDVI data
      const { data: ndviData } = await supabase
        .from('ndvi_data')
        .select('ndvi_value, ndwi_value, recorded_at')
        .eq('land_id', landId)
        .order('recorded_at', { ascending: false })
        .limit(3);

      // Fetch soil data - use direct query
      const { data: soilData } = await supabase
        .from('soil_health_reports' as any)
        .select('*')
        .eq('land_id', landId)
        .order('tested_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Calculate expected growth stage
      const calculateExpectedStage = (sowingDate: string | null, cropName: string | null): string => {
        if (!sowingDate) return 'unknown';
        const days = Math.floor((Date.now() - new Date(sowingDate).getTime()) / (1000 * 60 * 60 * 24));
        if (days < 15) return 'germination';
        if (days < 30) return 'seedling';
        if (days < 60) return 'vegetative';
        if (days < 90) return 'flowering';
        return 'maturity';
      };

      const sowingDate = (landData as any)?.sowing_date;
      const cropName = (landData as any)?.crop_name;
      const areaGuntha = (landData as any)?.area_guntha;
      const expectedStage = calculateExpectedStage(sowingDate, cropName);

      // Use existing ai-crop-scan function with growth_tracking mode
      const { data, error } = await supabase.functions.invoke('ai-crop-scan', {
        body: {
          images: [upload.file_url],
          mode: 'growth_tracking',
          uploadId: upload.id,
          landId: landId,
          farmerId: farmerId,
          tenantId: tenantId,
          landCrop: cropName,
          sowingDate: sowingDate,
          expectedStage: expectedStage,
          ndviData: ndviData,
          soilData: soilData,
          landArea: areaGuntha ? { guntha: areaGuntha, acres: areaGuntha * 0.025, sqft: areaGuntha * 1089 } : undefined,
          language: i18n.language
        }
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      await refetchAnalysis();
      await refetchAlerts();
      
      toast.success('Analysis complete');
      return data.analysis;
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to analyze photo');
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [landId, farmerId, tenantId, i18n.language, refetchAnalysis, refetchAlerts]);

  // Mark alert as read
  const markAlertRead = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('crop_growth_alerts')
        .update({ is_read: true })
        .eq('id', alertId);

      if (error) throw error;
    },
    onSuccess: () => {
      refetchAlerts();
    }
  });

  // Mark alert as actioned
  const markAlertActioned = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('crop_growth_alerts')
        .update({ 
          is_actioned: true,
          actioned_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (error) throw error;
    },
    onSuccess: () => {
      refetchAlerts();
      toast.success('Marked as done');
    }
  });

  return {
    uploads,
    uploadsLoading,
    latestAnalysis,
    analysisLoading,
    analysisHistory,
    alerts,
    isUploading,
    isAnalyzing,
    uploadMedia,
    analyzeUpload,
    markAlertRead: markAlertRead.mutate,
    markAlertActioned: markAlertActioned.mutate,
    refetch: () => {
      refetchUploads();
      refetchAnalysis();
      refetchAlerts();
    }
  };
}
