import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Calendar, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useLanguageStore } from '@/stores/languageStore';
import { landsApi } from '@/services/landsApi';
import LandSelector from '@/components/schedule/LandSelector';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/layout/EmptyState';
import CropDateInput from '@/components/schedule/CropDateInput';
import CropScheduleView from '@/components/schedule/CropScheduleView';
import ScheduleLoadingOverlay from '@/components/schedule/ScheduleLoadingOverlay';
import { format } from 'date-fns';
import { useNotifications } from '@/hooks/useNotifications';
import { useLocation } from '@/hooks/useLocation';
import { useWeather } from '@/hooks/useWeather';
import { useLands } from '@/hooks/useLands';

interface Land {
  id: string;
  name: string;
  area_acres: number;
  area_guntas?: number;
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  survey_number?: string;
  soil_type?: string;
  water_source?: string;
  irrigation_type?: string;
  current_crop?: string;
  soil_ph?: number;
  organic_carbon_percent?: number;
}

type FlowStep = 'land-selection' | 'crop-input' | 'schedule-view';

export default function Schedule() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, session } = useAuthStore();
  const { tenant } = useTenant();
  const { currentLanguage } = useLanguageStore();
  // Use the unified lands hook with real-time updates
  const { lands: fetchedLands, isLoading: isLoadingLands, refetch: refetchLands } = useLands();
  const [lands, setLands] = useState<Land[]>([]);
  const [selectedLand, setSelectedLand] = useState<Land | null>(null);
  const [flowStep, setFlowStep] = useState<FlowStep>('land-selection');
  const [scheduleData, setScheduleData] = useState<{
    cropName: string;
    cropVariety: string;
    sowingDate: Date;
    isReadyMadePlant?: boolean;
    farmingType?: string;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [generatingCropName, setGeneratingCropName] = useState('');
  const [generatingFarmingType, setGeneratingFarmingType] = useState('');
  const { scheduleTaskReminder } = useNotifications();

  // Get device location and weather data for AI schedule generation
  const { location: deviceLocation } = useLocation();
  const weatherLocation = deviceLocation ? { lat: deviceLocation.lat, lon: deviceLocation.lon } : undefined;
  const { currentWeather, forecast } = useWeather(weatherLocation);

  // Sync lands from React Query to local state
  useEffect(() => {
    if (fetchedLands && fetchedLands.length > 0) {
      // Map the API response to our Land interface
      const mappedLands: Land[] = fetchedLands.map(land => ({
        id: land.id || '',
        name: land.name || 'Unnamed Land',
        area_acres: land.area_acres || 0,
        area_guntas: land.area_guntas,
        village: land.village || undefined,
        taluka: land.taluka || undefined,
        district: land.district || undefined,
        state: land.state || undefined,
        survey_number: land.survey_number || undefined,
        soil_type: land.soil_type || undefined,
        water_source: land.water_source || undefined,
        irrigation_type: land.irrigation_type || undefined,
        current_crop: land.current_crop || undefined,
        soil_ph: (land as any).soil_ph || undefined,
        organic_carbon_percent: (land as any).organic_carbon_percent || undefined,
      }));
      setLands(mappedLands);
    }
  }, [fetchedLands]);

  const handleLandSelect = (land: Land) => {
    setSelectedLand(land);
    setFlowStep('crop-input');
  };

  const handleViewSchedule = (landId: string) => {
    const land = lands.find(l => l.id === landId);
    if (land) {
      setSelectedLand(land);
      setFlowStep('schedule-view');
    }
  };

  const handleEditSchedule = (landId: string) => {
    const land = lands.find(l => l.id === landId);
    if (land) {
      setSelectedLand(land);
      setFlowStep('crop-input');
    }
  };

  const handleCropDateSubmit = async (cropName: string, cropVariety: string, sowingDate: Date, isReadyMadePlant: boolean, farmingType: string, nurseryDays: number = 0, localizedCropName: string = '', intercrops?: any[], backdatedConsent?: boolean, transplantDate?: Date | null) => {
    if (!selectedLand) return;

    console.log('🚀 [Schedule] Starting schedule generation:', { cropName, localizedCropName, farmingType, isReadyMadePlant, nurseryDays, intercrops, backdatedConsent });
    
    // Set generating state FIRST before anything else
    setGenerating(true);
    setGeneratingCropName(localizedCropName || cropName);
    setGeneratingFarmingType(farmingType);
    setScheduleData({ cropName, cropVariety, sowingDate, isReadyMadePlant, farmingType });
    
    try {

      // First, deactivate any existing active schedules for this land
      const { error: deactivateError } = await supabase
        .from('crop_schedules')
        .update({ is_active: false })
        .eq('land_id', selectedLand.id)
        .eq('is_active', true);

      if (deactivateError) {
        console.error('Error deactivating old schedules:', deactivateError);
      }

      // Structure weather data for AI with proper error handling (using hooks called at component top level)
      const weatherData = {
        current: currentWeather ? {
          temp: currentWeather.temp,
          feels_like: currentWeather.feels_like,
          humidity: currentWeather.humidity,
          pressure: currentWeather.pressure,
          wind_speed: currentWeather.wind_speed,
          conditions: currentWeather.description,
          main: currentWeather.main,
          clouds: currentWeather.clouds,
          visibility: currentWeather.visibility,
          uv_index: currentWeather.uv_index,
        } : null,
        forecast: forecast && forecast.length > 0 ? forecast.slice(0, 7).map((day, index) => ({
          day: index + 1,
          temp_min: day.temp.min,
          temp_max: day.temp.max,
          humidity: day.humidity,
          rainfall: day.rain || 0,
          pop: day.pop, // Probability of precipitation
          description: day.weather && day.weather[0] ? day.weather[0].description : 'Normal',
        })) : []
      };

      console.log('Fetched real weather data for AI:', weatherData);

      // Call the updated ai-smart-schedule edge function with user's current app language
      // Priority: currentLanguage (from language store/UI) > user.preferredLanguage > 'hi' (default)
      const scheduleLanguage = currentLanguage || user?.preferredLanguage || 'hi';
      console.log('🌐 [Schedule] Generating schedule in language:', scheduleLanguage, {
        currentLanguage,
        userPreferredLanguage: user?.preferredLanguage,
        userLanguage: user?.language
      });
      
      const response = await supabase.functions.invoke('ai-smart-schedule', {
        body: {
          landId: selectedLand.id,
          cropName,
          cropVariety,
          sowingDate: format(sowingDate, 'yyyy-MM-dd'),
          isReadyMadePlant: isReadyMadePlant || false,
          nurseryDays: nurseryDays || 0,
          localizedCropName: localizedCropName || cropName,
          farmingType: farmingType,
          weather: weatherData,
          regenerate: true,
          language: scheduleLanguage,
          country: 'India',
          // NEW: Multi-crop and backdated consent support (array of intercrops)
          intercrops: intercrops || [],
          backdatedConsent: backdatedConsent || false,
        },
        headers: {
          'x-tenant-id': tenant?.id || user?.tenantId || '',
          'x-farmer-id': user?.id || '',
        },
      });

      console.log('🔍 [Schedule] Edge function response:', { error: response.error, data: response.data });

      // Handle edge function errors
      if (response.error) {
        console.error('❌ [Schedule] Edge function error:', response.error);
        throw new Error(response.error.message || 'Edge function returned an error');
      }

      const { data } = response;
      
      // Check if data contains an error response from the edge function
      if (data?.error) {
        console.error('❌ [Schedule] API error:', data.error, data.details);
        throw new Error(data.error + (data.details ? `: ${data.details}` : ''));
      }
      
      // Enhanced error handling with retry logic
      if (!data || !data.success) {
        if (retryCount < 2) {
          setRetryCount(prev => prev + 1);
          toast({
            title: t('schedule.main.retrying'),
            description: t('schedule.main.generating_attempt', { count: retryCount + 1 }),
            className: 'bg-accent/10 border-accent/20',
          });
          // Retry after 2 seconds
          setTimeout(() => {
            handleCropDateSubmit(cropName, cropVariety, sowingDate, isReadyMadePlant || false, farmingType);
          }, 2000);
          return;
        }
        throw new Error(data?.error || 'Failed to generate schedule after multiple attempts');
      }

      // Reset retry count on success
      setRetryCount(0);
      
      // Schedule notification for upcoming task (if schedule data contains tasks)
      if (data.schedule && data.schedule.length > 0) {
        const nextTask = data.schedule[0];
        if (nextTask?.date) {
          await scheduleTaskReminder(
            nextTask.id || `task-${Date.now()}`,
            nextTask.task || nextTask.activity || 'Farming Task',
            new Date(nextTask.date)
          );
        }
      }
      
      toast({
        title: t('schedule.main.generated_success'),
        description: t('schedule.main.generated_description', { crop: cropName }),
        className: 'bg-success/10 border-success/20',
      });

      // Move directly to schedule view
      setFlowStep('schedule-view');
    } catch (error) {
      console.error('Error generating schedule:', error);
      
      // Show user-friendly error with retry option
      toast({
        title: t('schedule.main.generation_failed'),
        description: error instanceof Error ? error.message : t('schedule.toast.error'),
        variant: 'destructive',
        action: (
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => {
              setRetryCount(0);
              handleCropDateSubmit(cropName, cropVariety, sowingDate, scheduleData?.isReadyMadePlant || false, scheduleData?.farmingType || 'organic_fertilizer');
            }}
          >
            {t('common.try_again')}
          </Button>
        ),
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleBack = () => {
    if (flowStep === 'crop-input') {
      setFlowStep('land-selection');
      setSelectedLand(null);
    } else if (flowStep === 'schedule-view') {
      setFlowStep('land-selection');
      setSelectedLand(null);
    }
  };

  if (isLoadingLands) {
    return (
      <PageShell variant="gradient-primary" padding="default" spacing="default">
        <Card className="animate-pulse">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-10 w-24 rounded-lg" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border/50">
                  <Skeleton className="h-16 w-16 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-10 w-20 rounded-lg" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
          <p className="text-sm font-medium">{t('schedule.loading.syncing')}</p>
        </div>
      </PageShell>
    );
  }

  if (lands.length === 0) {
    return (
      <PageShell variant="gradient-primary">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/app')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{t('schedule.main.ai_crop_schedule')}</h1>
        </div>
        <EmptyState
          icon={Calendar}
          title={t('schedule.empty.title')}
          description={t('schedule.empty.message')}
          actionLabel={t('schedule.main.add_land')}
          onAction={() => navigate('/app/lands/add')}
        />
      </PageShell>
    );
  }

  const STEPS: FlowStep[] = ['land-selection', 'crop-input', 'schedule-view'];
  const currentStepIndex = STEPS.indexOf(flowStep);

  const stickyHeader = (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => flowStep === 'land-selection' ? navigate('/app') : handleBack()}
            className="h-9 w-9 rounded-xl bg-background/50 hover:bg-primary/10 transition-all shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-bold bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent truncate">
            {t('schedule.main.ai_crop_schedule')}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {flowStep === 'land-selection' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                refetchLands();
                toast({
                  title: t('schedule.main.refreshing'),
                  description: t('schedule.main.syncing_latest'),
                  className: 'bg-accent/10 border-accent/20',
                });
              }}
              className="h-9 w-9 rounded-xl bg-background/50 hover:bg-primary/10 transition-all"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}

          {/* Compact step indicator dots only */}
          <div className="flex items-center gap-1.5" aria-label={`Step ${currentStepIndex + 1} of ${STEPS.length}`}>
            {STEPS.map((step, index) => (
              <div
                key={step}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  index === currentStepIndex
                    ? 'w-6 bg-gradient-to-r from-primary to-accent shadow-sm shadow-primary/40'
                    : index < currentStepIndex
                    ? 'w-4 bg-primary/60'
                    : 'w-4 bg-primary/20'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );


  return (
    <PageShell variant="gradient-primary" padding="none" spacing="none" stickyHeader={stickyHeader}>
      <div className="relative">
        {flowStep === 'land-selection' && (
          <div className="animate-fade-in">
            <LandSelector
              lands={lands}
              onSelectLand={handleLandSelect}
              onViewSchedule={handleViewSchedule}
              onEditSchedule={handleEditSchedule}
            />
          </div>
        )}

        {flowStep === 'crop-input' && selectedLand && (
          <div className="animate-slide-in-right">
            <CropDateInput
              land={selectedLand}
              onSubmit={handleCropDateSubmit}
              onBack={handleBack}
              loading={generating}
            />
          </div>
        )}

        {flowStep === 'schedule-view' && selectedLand && (
          <div className="animate-slide-in-right">
            <CropScheduleView
              landId={selectedLand.id}
              landName={selectedLand.name}
              currentCrop={scheduleData?.cropName || selectedLand.current_crop || ''}
              onBack={handleBack}
            />
          </div>
        )}
      </div>

      <ScheduleLoadingOverlay
        isLoading={generating}
        cropName={generatingCropName || scheduleData?.cropName || ''}
        farmingType={generatingFarmingType || scheduleData?.farmingType || 'organic_fertilizer'}
      />
    </PageShell>
  );
}