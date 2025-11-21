import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import CropDateInput from '@/components/schedule/CropDateInput';
import CropScheduleView from '@/components/schedule/CropScheduleView';
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
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
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

  const handleCropDateSubmit = async (cropName: string, cropVariety: string, sowingDate: Date, isReadyMadePlant?: boolean) => {
    if (!selectedLand) return;

    setScheduleData({ cropName, cropVariety, sowingDate, isReadyMadePlant });
    
    try {
      setGenerating(true);

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

      // Call the updated ai-smart-schedule edge function with user's preferred language
      const response = await supabase.functions.invoke('ai-smart-schedule', {
        body: {
          landId: selectedLand.id,
          cropName,
          cropVariety,
          sowingDate: format(sowingDate, 'yyyy-MM-dd'),
          isReadyMadePlant: isReadyMadePlant || false,
          weather: weatherData,
          regenerate: true,
          tenantId: tenant?.id || user?.tenantId || '',
          farmerId: user?.id || '',
          language: user?.preferredLanguage || currentLanguage || 'en',
          country: 'India',
        },
      });

      if (response.error) throw response.error;

      const { data } = response;
      
      // Enhanced error handling with retry logic
      if (!data || !data.success) {
        if (retryCount < 2) {
          setRetryCount(prev => prev + 1);
          toast({
            title: '🔄 Retrying...',
            description: `Generating AI schedule (Attempt ${retryCount + 1}/2)`,
            className: 'bg-accent/10 border-accent/20',
          });
          // Retry after 2 seconds
          setTimeout(() => {
            handleCropDateSubmit(cropName, cropVariety, sowingDate, isReadyMadePlant);
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
        title: '✅ AI Schedule Generated!',
        description: `Smart farming schedule created for ${cropName}`,
        className: 'bg-success/10 border-success/20',
      });

      // Move directly to schedule view
      setFlowStep('schedule-view');
    } catch (error) {
      console.error('Error generating schedule:', error);
      
      // Show user-friendly error with retry option
      toast({
        title: '❌ Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate schedule',
        variant: 'destructive',
        action: (
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => {
              setRetryCount(0);
              handleCropDateSubmit(cropName, cropVariety, sowingDate, scheduleData?.isReadyMadePlant);
            }}
          >
            Try Again
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
      <div className="fixed inset-0 bg-gradient-to-br from-background via-accent/5 to-primary/5">
        {/* Header Skeleton */}
        <div className="fixed top-0 left-0 right-0 z-40 bg-background/60 backdrop-blur-2xl border-b border-border/50">
          <div className="px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-1.5 w-8 rounded-full" />
                  <Skeleton className="h-1.5 w-6 rounded-full" />
                  <Skeleton className="h-1.5 w-6 rounded-full" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="fixed inset-0 pt-14 pb-16 overflow-y-auto">
          <div className="min-h-full p-4 space-y-4">
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
            
            {/* Syncing message */}
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
              <p className="text-sm font-medium">Syncing data from server...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (lands.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/app')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">AI Crop Schedule</h1>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Lands Found</h3>
            <p className="text-muted-foreground text-center mb-6">
              Add your land first to generate AI-powered crop schedules
            </p>
            <Button onClick={() => navigate('/app/lands/add')}>
              <Plus className="h-4 w-4 mr-2" />
              Add Land
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-background via-accent/5 to-primary/5">
      {/* Modern Glass Header */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-background/60 backdrop-blur-2xl border-b border-border/50">
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => flowStep === 'land-selection' ? navigate('/app') : handleBack()}
                className="h-9 w-9 rounded-xl bg-background/50 hover:bg-primary/10 transition-all duration-300"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent animate-gradient">
                  AI Crop Schedule
                </h1>
                <p className="text-xs text-muted-foreground font-medium">
                  {flowStep === 'land-selection' && 'Step 1: Select Your Land'}
                  {flowStep === 'crop-input' && 'Step 2: Crop Details'}
                  {flowStep === 'schedule-view' && 'Step 3: AI Schedule'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Manual Refresh Button */}
              {flowStep === 'land-selection' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    refetchLands();
                    toast({
                      title: '🔄 Refreshing',
                      description: 'Syncing latest data...',
                      className: 'bg-accent/10 border-accent/20',
                    });
                  }}
                  className="h-9 w-9 rounded-xl bg-background/50 hover:bg-primary/10 transition-all duration-300"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              
              {/* Modern Step Progress Bar */}
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  {['land-selection', 'crop-input', 'schedule-view'].map((step, index) => (
                    <div 
                      key={step}
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        flowStep === step 
                          ? 'w-8 bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/50' 
                          : index < ['land-selection', 'crop-input', 'schedule-view'].indexOf(flowStep)
                          ? 'w-6 bg-primary/60'
                          : 'w-6 bg-primary/20'
                      }`} 
                    />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">
                  Step {['land-selection', 'crop-input', 'schedule-view'].indexOf(flowStep) + 1} of 3
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full Screen Content Area */}
      <div className="fixed inset-0 pt-14 pb-16 overflow-y-auto">
        <div className="min-h-full">
          {/* Flow Steps with Enhanced Animations */}
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
        </div>
      </div>
    </div>
  );
}