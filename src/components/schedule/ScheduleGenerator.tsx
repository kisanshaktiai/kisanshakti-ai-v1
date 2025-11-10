import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { useWeather } from '@/hooks/useWeather';
import { useLanguageStore } from '@/stores/languageStore';

interface ScheduleGeneratorProps {
  landId: string;
  landName: string;
  currentCrop?: string;
  onComplete: () => void;
  onCancel: () => void;
}

const popularCrops = [
  { value: 'rice', label: 'Rice', season: 'Kharif' },
  { value: 'wheat', label: 'Wheat', season: 'Rabi' },
  { value: 'cotton', label: 'Cotton', season: 'Kharif' },
  { value: 'sugarcane', label: 'Sugarcane', season: 'All' },
  { value: 'maize', label: 'Maize', season: 'Kharif' },
  { value: 'soybean', label: 'Soybean', season: 'Kharif' },
  { value: 'groundnut', label: 'Groundnut', season: 'Kharif' },
  { value: 'pulses', label: 'Pulses', season: 'Both' },
  { value: 'potato', label: 'Potato', season: 'Rabi' },
  { value: 'onion', label: 'Onion', season: 'Both' },
  { value: 'tomato', label: 'Tomato', season: 'All' },
  { value: 'chilli', label: 'Chilli', season: 'Both' },
];

const ScheduleGenerator: React.FC<ScheduleGeneratorProps> = ({ 
  landId, 
  landName, 
  currentCrop,
  onComplete, 
  onCancel 
}) => {
  const { toast } = useToast();
  const { user, session } = useAuthStore();
  const { currentWeather, forecast, loading: weatherLoading } = useWeather();
  const { currentLanguage } = useLanguageStore();
  
  const [cropName, setCropName] = useState(currentCrop || '');
  const [cropVariety, setCropVariety] = useState('');
  const [sowingDate, setSowingDate] = useState<Date | undefined>(new Date());
  const [isReadyMadePlant, setIsReadyMadePlant] = useState<boolean>(false);
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState(1);

  const handleGenerate = async () => {
    if (!cropName || !sowingDate) {
      toast({
        title: 'Missing Information',
        description: 'Please select a crop and sowing date',
        variant: 'destructive',
      });
      return;
    }

    try {
      setGenerating(true);

      // Prepare weather data
      const weatherData = currentWeather ? {
        current: currentWeather,
        forecast: forecast?.slice(0, 2), // Next 48 hours
      } : null;

      // Call edge function to generate schedule
      const response = await supabase.functions.invoke('ai-smart-schedule', {
        body: {
          landId,
          cropName,
          cropVariety,
          sowingDate: format(sowingDate, 'yyyy-MM-dd'),
          isReadyMadePlant,
          weather: weatherData,
          regenerate: false,
          language: currentLanguage,
          country: 'India',
        },
        headers: {
          'x-tenant-id': user?.tenantId || '',
          'x-farmer-id': user?.id || '',
          'x-session-token': session?.token || '',
        },
      });

      if (response.error) throw response.error;

      const { data } = response;
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate schedule');
      }

      toast({
        title: 'Success!',
        description: 'Crop schedule generated successfully',
      });

      onComplete();
    } catch (error) {
      console.error('Error generating schedule:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate schedule',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="bg-background/60 backdrop-blur-2xl border-border/50 shadow-2xl">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-accent/10 border-b border-border/50">
        <CardTitle className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <span className="bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Generate AI Crop Schedule
          </span>
        </CardTitle>
        <CardDescription>
          Create a personalized schedule for {landName}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {step === 1 && (
          <>
            {/* Crop Selection */}
            <div className="space-y-2">
              <Label htmlFor="crop">Select Crop *</Label>
              <Select value={cropName} onValueChange={setCropName}>
                <SelectTrigger id="crop">
                  <SelectValue placeholder="Choose a crop" />
                </SelectTrigger>
                <SelectContent>
                  {popularCrops.map((crop) => (
                    <SelectItem key={crop.value} value={crop.value}>
                      <div className="flex justify-between items-center w-full">
                        <span>{crop.label}</span>
                        <span className="text-xs text-gray-500 ml-2">{crop.season}</span>
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="other">Other (Custom)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cropName === 'other' && (
              <div className="space-y-2">
                <Label htmlFor="custom-crop">Enter Crop Name</Label>
                <Input
                  id="custom-crop"
                  placeholder="e.g., Brinjal, Cabbage, etc."
                  onChange={(e) => setCropName(e.target.value)}
                />
              </div>
            )}

            {/* Crop Variety */}
            <div className="space-y-2">
              <Label htmlFor="variety">Crop Variety (Optional)</Label>
              <Input
                id="variety"
                placeholder="e.g., Basmati, BT Cotton, etc."
                value={cropVariety}
                onChange={(e) => setCropVariety(e.target.value)}
              />
            </div>

            {/* Ready-made Plant Option */}
            <div className="space-y-3 p-4 bg-accent/20 rounded-lg border border-border/50">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="ready-made"
                  checked={isReadyMadePlant}
                  onChange={(e) => setIsReadyMadePlant(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <div className="flex-1">
                  <Label htmlFor="ready-made" className="text-sm font-medium cursor-pointer">
                    Using ready-made nursery plants/transplants
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Check this if you're planting ready-made seedlings from nursery instead of sowing seeds 
                    (applicable for vegetables, sugarcane sets, etc.)
                  </p>
                </div>
              </div>
            </div>

            {/* Sowing/Planting Date */}
            <div className="space-y-2">
              <Label>{isReadyMadePlant ? 'Planting Date *' : 'Sowing Date *'}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !sowingDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {sowingDate ? format(sowingDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={sowingDate}
                    onSelect={setSowingDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Weather Info */}
            {currentWeather && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-2">Current Weather</p>
                <div className="grid grid-cols-2 gap-2 text-sm text-blue-700">
                  <div>Temperature: {currentWeather.temp}°C</div>
                  <div>Humidity: {currentWeather.humidity}%</div>
                  <div>Clouds: {currentWeather.clouds}%</div>
                  <div>Wind: {currentWeather.wind_speed} km/h</div>
                </div>
                <p className="text-xs text-blue-600 mt-2">
                  Schedule will be optimized based on weather forecast
                </p>
              </div>
            )}

            {/* AI Features */}
            <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
              <p className="text-sm font-medium text-purple-900 mb-2">AI-Powered Features</p>
              <ul className="text-sm text-purple-700 space-y-1">
                <li>✓ Weather-adaptive scheduling</li>
                <li>✓ FAO & ICAR best practices</li>
                <li>✓ Soil-based recommendations</li>
                <li>✓ Pest & disease prevention</li>
                <li>✓ Resource optimization</li>
              </ul>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={generating}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating || !cropName || !sowingDate}
            className="flex-1"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Schedule
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ScheduleGenerator;