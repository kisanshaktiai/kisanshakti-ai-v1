import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { landsApi } from '@/services/landsApi';
import LandSelector from '@/components/schedule/LandSelector';
import CropDateInput from '@/components/schedule/CropDateInput';
import CropScheduleView from '@/components/schedule/CropScheduleView';
import { format } from 'date-fns';

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
  const [lands, setLands] = useState<Land[]>([]);
  const [selectedLand, setSelectedLand] = useState<Land | null>(null);
  const [loading, setLoading] = useState(true);
  const [flowStep, setFlowStep] = useState<FlowStep>('land-selection');
  const [scheduleData, setScheduleData] = useState<{
    cropName: string;
    cropVariety: string;
    sowingDate: Date;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    fetchLands();
  }, []);

  const fetchLands = async () => {
    if (!user?.id) return;
    
    try {
      // Use lands API service which properly fetches from the edge function
      const data = await landsApi.fetchLands();
      
      if (data && data.length > 0) {
        // Map the API response to our Land interface
        const mappedLands: Land[] = data.map(land => ({
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
          // These fields might be in the actual response but not in the interface
          soil_ph: undefined,
          organic_carbon_percent: undefined,
        }));
        setLands(mappedLands);
      }
    } catch (error) {
      console.error('Error fetching lands:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch lands. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLandSelect = (land: Land) => {
    setSelectedLand(land);
    setFlowStep('crop-input');
  };

  const handleCropDateSubmit = async (cropName: string, cropVariety: string, sowingDate: Date) => {
    if (!selectedLand) return;

    setScheduleData({ cropName, cropVariety, sowingDate });
    
    try {
      setGenerating(true);

      // Fetch weather data if available
      const weatherData = null; // Can be integrated with weather API later

      // Call edge function to generate schedule
      const response = await supabase.functions.invoke('generate-crop-schedule', {
        body: {
          landId: selectedLand.id,
          cropName,
          cropVariety,
          sowingDate: format(sowingDate, 'yyyy-MM-dd'),
          weatherData,
          regenerate: false,
        },
        headers: {
          'x-tenant-id': user?.tenantId || '',
          'x-farmer-id': user?.id || '',
          'x-session-token': session?.token || '',
        },
      });

      if (response.error) throw response.error;

      const { data } = response;
      
      // Enhanced error handling with retry logic
      if (!data || !data.success) {
        if (retryCount < 2) {
          setRetryCount(prev => prev + 1);
          toast({
            title: 'Retrying...',
            description: `Attempting again (${retryCount + 1}/2)`,
          });
          // Retry after 2 seconds
          setTimeout(() => {
            handleCropDateSubmit(cropName, cropVariety, sowingDate);
          }, 2000);
          return;
        }
        throw new Error(data?.error || 'Failed to generate schedule after multiple attempts');
      }

      // Reset retry count on success
      setRetryCount(0);
      
      toast({
        title: '✅ Schedule Generated',
        description: `AI crop schedule created for ${cropName}`,
        className: 'bg-success/10 border-success/20',
      });

      setFlowStep('schedule-view');
    } catch (error) {
      console.error('Error generating schedule:', error);
      
      // Show user-friendly error with retry option
      toast({
        title: 'Generation Failed',
        description: (
          <div className="space-y-2">
            <p>{error instanceof Error ? error.message : 'Failed to generate schedule'}</p>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                setRetryCount(0);
                handleCropDateSubmit(cropName, cropVariety, sowingDate);
              }}
              className="mt-2"
            >
              Try Again
            </Button>
          </div>
        ) as any,
        variant: 'destructive',
        duration: 10000,
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
      setFlowStep('crop-input');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
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
        <div className="px-4 py-3">
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

      {/* Full Screen Content Area */}
      <div className="fixed inset-0 pt-16 pb-20 overflow-y-auto">
        <div className="min-h-full px-4 py-4">
          {/* Flow Steps with Enhanced Animations */}
          <div className="relative">
            {flowStep === 'land-selection' && (
              <div className="animate-fade-in">
                <LandSelector 
                  lands={lands}
                  onSelectLand={handleLandSelect}
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

            {flowStep === 'schedule-view' && selectedLand && scheduleData && (
              <div className="animate-slide-in-right">
                <CropScheduleView
                  landId={selectedLand.id}
                  landName={selectedLand.name}
                  currentCrop={scheduleData.cropName}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}