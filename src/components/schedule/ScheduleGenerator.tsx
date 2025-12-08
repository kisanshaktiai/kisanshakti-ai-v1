import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CalendarIcon, Loader2, Sparkles, AlertTriangle, CheckCircle2, XCircle, Leaf, FlaskConical } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { useWeather } from '@/hooks/useWeather';
import { useLanguageStore } from '@/stores/languageStore';
import { useTranslation } from 'react-i18next';

interface ScheduleGeneratorProps {
  landId: string;
  landName: string;
  currentCrop?: string;
  onComplete: () => void;
  onCancel: () => void;
}

interface SuitabilityWarning {
  score: number;
  warnings: string[];
  risks: string[];
  alternatives: { crop: string; successRate: number; potentialProfit: string }[];
  warningMessage: string;
}

const popularCrops = [
  { value: 'Rice', label: 'Rice', season: 'Kharif' },
  { value: 'Wheat', label: 'Wheat', season: 'Rabi' },
  { value: 'Cotton', label: 'Cotton', season: 'Kharif' },
  { value: 'Sugarcane', label: 'Sugarcane', season: 'All' },
  { value: 'Maize', label: 'Maize', season: 'Kharif' },
  { value: 'Soybean', label: 'Soybean', season: 'Kharif' },
  { value: 'Groundnut', label: 'Groundnut', season: 'Kharif' },
  { value: 'Potato', label: 'Potato', season: 'Rabi' },
  { value: 'Onion', label: 'Onion', season: 'Both' },
  { value: 'Tomato', label: 'Tomato', season: 'All' },
  { value: 'Turmeric', label: 'Turmeric', season: 'Kharif' },
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
  const { t } = useTranslation();
  
  const [cropName, setCropName] = useState(currentCrop || '');
  const [customCropName, setCustomCropName] = useState('');
  const [cropVariety, setCropVariety] = useState('');
  const [sowingDate, setSowingDate] = useState<Date | undefined>(new Date());
  const [isReadyMadePlant, setIsReadyMadePlant] = useState<boolean>(false);
  const [farmingType, setFarmingType] = useState<'organic' | 'fertilizer'>('organic');
  const [generating, setGenerating] = useState(false);
  const [suitabilityWarning, setSuitabilityWarning] = useState<SuitabilityWarning | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const effectiveCropName = cropName === 'other' ? customCropName : cropName;

  const handleGenerate = async (forceGenerate = false) => {
    if (!effectiveCropName || !sowingDate) {
      toast({
        title: 'Missing Information',
        description: 'Please select a crop and sowing date',
        variant: 'destructive',
      });
      return;
    }

    try {
      setGenerating(true);
      setSuitabilityWarning(null);
      setShowWarning(false);

      // Prepare weather data
      const weatherData = currentWeather ? {
        current: currentWeather,
        forecast: forecast?.slice(0, 2),
      } : null;

      // Call edge function to generate schedule
      const response = await supabase.functions.invoke('ai-smart-schedule', {
        body: {
          landId,
          cropName: effectiveCropName,
          cropVariety,
          sowingDate: format(sowingDate, 'yyyy-MM-dd'),
          isReadyMadePlant,
          farmingType, // Pass farming type selection
          weather: weatherData,
          regenerate: false,
          language: currentLanguage,
          country: 'India',
          forceGenerate, // Pass force flag
        },
        headers: {
          'x-tenant-id': user?.tenantId || '',
          'x-farmer-id': user?.id || '',
          'x-session-token': session?.token || '',
        },
      });

      if (response.error) throw response.error;

      const { data } = response;
      
      // Check for suitability warning
      if (data.suitabilityWarning && !forceGenerate) {
        setSuitabilityWarning({
          score: data.score,
          warnings: data.warnings || [],
          risks: data.risks || [],
          alternatives: data.alternatives || [],
          warningMessage: data.warningMessage || '',
        });
        setShowWarning(true);
        setGenerating(false);
        return;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate schedule');
      }

      toast({
        title: 'Success!',
        description: `Crop schedule generated with ${data.totalTasks} tasks`,
      });

      onComplete();
    } catch (error: any) {
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

  const handleProceedAnyway = () => {
    handleGenerate(true); // Force generate
  };

  const handleSelectAlternative = (altCrop: string) => {
    setCropName(altCrop);
    setSuitabilityWarning(null);
    setShowWarning(false);
  };

  // Warning UI Component
  if (showWarning && suitabilityWarning) {
    return (
      <Card className="bg-background/60 backdrop-blur-2xl border-destructive/50 shadow-2xl">
        <CardHeader className="bg-gradient-to-r from-destructive/20 to-orange-500/20 border-b border-destructive/50">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-6 w-6" />
            <span>⚠️ Crop Suitability Warning</span>
          </CardTitle>
          <CardDescription>
            Suitability Score: <span className="font-bold text-destructive">{suitabilityWarning.score}%</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {/* Warning Message */}
          <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/30 whitespace-pre-wrap text-sm">
            {suitabilityWarning.warningMessage}
          </div>

          {/* Warnings List */}
          {suitabilityWarning.warnings.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2 text-orange-600">
                <XCircle className="h-4 w-4" />
                Why not suitable:
              </h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {suitabilityWarning.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-destructive">•</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risks */}
          {suitabilityWarning.risks.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                Risks:
              </h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {suitabilityWarning.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-red-500">⚡</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Alternative Crops */}
          {suitabilityWarning.alternatives.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Better alternatives for your area:
              </h4>
              <div className="grid gap-2">
                {suitabilityWarning.alternatives.map((alt, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    className="justify-between h-auto py-3 hover:bg-green-50 hover:border-green-300"
                    onClick={() => handleSelectAlternative(alt.crop)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{alt.crop}</span>
                    </div>
                    <div className="text-right text-xs">
                      <div className="text-green-600 font-medium">{alt.successRate}% success</div>
                      <div className="text-muted-foreground">{alt.potentialProfit}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-4 border-t border-border/50">
            <Button
              variant="destructive"
              onClick={handleProceedAnyway}
              disabled={generating}
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Proceed Anyway (At Your Risk)
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowWarning(false);
                setSuitabilityWarning(null);
              }}
              disabled={generating}
            >
              Choose Different Crop
            </Button>
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={generating}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

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

      <CardContent className="space-y-6 pt-6">
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
                    <span className="text-xs text-muted-foreground ml-2">{crop.season}</span>
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
              value={customCropName}
              onChange={(e) => setCustomCropName(e.target.value)}
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

        {/* Farming Type Selection - Organic vs Fertilizer */}
        <div className="space-y-3 p-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg border border-green-500/30">
          <Label className="text-sm font-medium flex items-center gap-2">
            🌱 {currentLanguage === 'hi' ? 'खेती का प्रकार चुनें' : currentLanguage === 'mr' ? 'शेतीचा प्रकार निवडा' : 'Select Farming Type'}
          </Label>
          <RadioGroup
            value={farmingType}
            onValueChange={(value) => setFarmingType(value as 'organic' | 'fertilizer')}
            className="grid grid-cols-2 gap-3"
          >
            <div className={cn(
              "flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
              farmingType === 'organic' 
                ? "border-green-500 bg-green-500/10" 
                : "border-border/50 hover:border-green-500/50"
            )}>
              <RadioGroupItem value="organic" id="organic" />
              <Label htmlFor="organic" className="flex flex-col cursor-pointer flex-1">
                <span className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
                  <Leaf className="h-4 w-4" />
                  {currentLanguage === 'hi' ? 'जैविक खेती' : currentLanguage === 'mr' ? 'सेंद्रिय शेती' : 'Organic'}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  {currentLanguage === 'hi' ? 'केवल जैविक उत्पाद, कोई रसायन नहीं' : currentLanguage === 'mr' ? 'फक्त सेंद्रिय, रसायन नाही' : 'Only organic inputs, no chemicals'}
                </span>
              </Label>
            </div>
            <div className={cn(
              "flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
              farmingType === 'fertilizer' 
                ? "border-blue-500 bg-blue-500/10" 
                : "border-border/50 hover:border-blue-500/50"
            )}>
              <RadioGroupItem value="fertilizer" id="fertilizer" />
              <Label htmlFor="fertilizer" className="flex flex-col cursor-pointer flex-1">
                <span className="flex items-center gap-2 font-medium text-blue-700 dark:text-blue-400">
                  <FlaskConical className="h-4 w-4" />
                  {currentLanguage === 'hi' ? 'रासायनिक खाद' : currentLanguage === 'mr' ? 'रासायनिक खत' : 'Fertilizer'}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  {currentLanguage === 'hi' ? 'रासायनिक + कुछ जैविक' : currentLanguage === 'mr' ? 'रासायनिक + थोडे सेंद्रिय' : 'Chemical + some organic'}
                </span>
              </Label>
            </div>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            {currentLanguage === 'hi' 
              ? '✓ दोनों में ग्रोथ प्रमोटर (सीवीड, ह्यूमिक एसिड) शामिल होंगे' 
              : currentLanguage === 'mr' 
              ? '✓ दोन्हींमध्ये ग्रोथ प्रमोटर (सीवीड, ह्यूमिक अॅसिड) समाविष्ट' 
              : '✓ Both include growth promoters (Seaweed, Humic acid) for yield boost'}
          </p>
        </div>

        {/* Ready-made Plant Option */}
        <div className="space-y-3 p-4 bg-accent/20 rounded-lg border border-border/50">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="ready-made"
              checked={isReadyMadePlant}
              onChange={(e) => setIsReadyMadePlant(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border"
            />
            <div className="flex-1">
              <Label htmlFor="ready-made" className="text-sm font-medium cursor-pointer">
                {currentLanguage === 'hi' ? 'नर्सरी के तैयार पौधे लगा रहे हैं' : currentLanguage === 'mr' ? 'नर्सरीचे तयार रोपे लावत आहात' : 'Using ready-made nursery plants/transplants'}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {currentLanguage === 'hi' 
                  ? 'यदि आप बीज बोने के बजाय नर्सरी से तैयार पौधे लगा रहे हैं तो इसे चेक करें' 
                  : currentLanguage === 'mr' 
                  ? 'बियाणे पेरण्याऐवजी नर्सरीतून तयार रोपे लावत असाल तर हे चेक करा' 
                  : 'Check this if planting ready seedlings instead of sowing seeds'}
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
          <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">Current Weather</p>
            <div className="grid grid-cols-2 gap-2 text-sm text-blue-600 dark:text-blue-400">
              <div>Temperature: {currentWeather.temp}°C</div>
              <div>Humidity: {currentWeather.humidity}%</div>
              <div>Clouds: {currentWeather.clouds}%</div>
              <div>Wind: {currentWeather.wind_speed} km/h</div>
            </div>
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-2">
              Schedule will be optimized based on weather forecast
            </p>
          </div>
        )}

        {/* AI Features */}
        <div className="p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg border border-purple-500/30">
          <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">AI-Powered Features</p>
          <ul className="text-sm text-purple-600 dark:text-purple-400 space-y-1">
            <li>✓ Crop-Climate Suitability Check</li>
            <li>✓ Weather-adaptive scheduling</li>
            <li>✓ ICAR & State University guidelines</li>
            <li>✓ Soil-based recommendations</li>
            <li>✓ Pest & disease prevention</li>
            <li>✓ 3-Tier Nutrient Management</li>
          </ul>
        </div>

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
            onClick={() => handleGenerate(false)}
            disabled={generating || !effectiveCropName || !sowingDate}
            className="flex-1"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking & Generating...
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