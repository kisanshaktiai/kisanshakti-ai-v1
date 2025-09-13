import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, MapPin, ChevronLeft, Sparkles, Wheat, Droplets, Sun } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface CropDateInputProps {
  land: {
    id: string;
    name: string;
    area_acres: number;
    area_guntas?: number;
    village?: string;
    district?: string;
    soil_type?: string;
    water_source?: string;
  };
  onSubmit: (cropName: string, cropVariety: string, sowingDate: Date) => void;
  onBack: () => void;
  loading?: boolean;
}

const popularCrops = [
  { value: 'rice', label: 'Rice (धान)', season: 'Kharif', icon: '🌾' },
  { value: 'wheat', label: 'Wheat (गेहूं)', season: 'Rabi', icon: '🌾' },
  { value: 'cotton', label: 'Cotton (कपास)', season: 'Kharif', icon: '☁️' },
  { value: 'sugarcane', label: 'Sugarcane (गन्ना)', season: 'All', icon: '🎋' },
  { value: 'maize', label: 'Maize (मक्का)', season: 'Kharif', icon: '🌽' },
  { value: 'soybean', label: 'Soybean (सोयाबीन)', season: 'Kharif', icon: '🫘' },
  { value: 'groundnut', label: 'Groundnut (मूंगफली)', season: 'Kharif', icon: '🥜' },
  { value: 'pulses', label: 'Pulses (दाल)', season: 'Both', icon: '🫘' },
  { value: 'potato', label: 'Potato (आलू)', season: 'Rabi', icon: '🥔' },
  { value: 'onion', label: 'Onion (प्याज)', season: 'Both', icon: '🧅' },
  { value: 'tomato', label: 'Tomato (टमाटर)', season: 'All', icon: '🍅' },
  { value: 'chilli', label: 'Chilli (मिर्च)', season: 'Both', icon: '🌶️' },
];

const CropDateInput: React.FC<CropDateInputProps> = ({
  land,
  onSubmit,
  onBack,
  loading = false
}) => {
  const { toast } = useToast();
  const [cropName, setCropName] = useState('');
  const [cropVariety, setCropVariety] = useState('');
  const [sowingDate, setSowingDate] = useState<Date | undefined>(new Date());
  const [cropTab, setCropTab] = useState<'popular' | 'custom'>('popular');

  const handleSubmit = () => {
    if (!cropName) {
      toast({
        title: 'Select Crop',
        description: 'Please select or enter a crop name',
        variant: 'destructive',
      });
      return;
    }
    
    if (!sowingDate) {
      toast({
        title: 'Select Date',
        description: 'Please select the sowing date',
        variant: 'destructive',
      });
      return;
    }

    onSubmit(cropName, cropVariety, sowingDate);
  };

  const selectCrop = (crop: string) => {
    setCropName(crop);
    // Auto-suggest variety based on crop
    if (crop === 'rice') setCropVariety('IR-64');
    if (crop === 'wheat') setCropVariety('HD-2967');
    if (crop === 'cotton') setCropVariety('BT Cotton');
  };

  return (
    <div className="space-y-4">
      {/* Land Info Bar */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="p-1"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium">{land.name}</p>
                <p className="text-xs text-muted-foreground">
                  {land.area_acres} acres {land.area_guntas && `${land.area_guntas} guntas`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {land.soil_type && (
                  <Badge variant="secondary" className="text-xs">
                    {land.soil_type}
                  </Badge>
                )}
                {land.water_source && (
                  <Badge variant="secondary" className="text-xs">
                    <Droplets className="h-3 w-3" />
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Crop Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wheat className="h-5 w-5 text-primary" />
            Select Crop
          </CardTitle>
          <CardDescription>
            Choose the crop you plan to cultivate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={cropTab} onValueChange={(v) => setCropTab(v as 'popular' | 'custom')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="popular">Popular Crops</TabsTrigger>
              <TabsTrigger value="custom">Custom Crop</TabsTrigger>
            </TabsList>
            
            <TabsContent value="popular" className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {popularCrops.map((crop) => (
                  <Button
                    key={crop.value}
                    variant={cropName === crop.value ? 'default' : 'outline'}
                    className="justify-start h-auto py-3 px-3"
                    onClick={() => selectCrop(crop.value)}
                  >
                    <span className="text-lg mr-2">{crop.icon}</span>
                    <div className="text-left">
                      <div className="text-sm font-medium">{crop.label.split(' ')[0]}</div>
                      <div className="text-xs text-muted-foreground">{crop.season}</div>
                    </div>
                  </Button>
                ))}
              </div>
              
              {cropName && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="variety">Variety (Optional)</Label>
                  <Input
                    id="variety"
                    placeholder="e.g., IR-64, HD-2967, BT Cotton"
                    value={cropVariety}
                    onChange={(e) => setCropVariety(e.target.value)}
                  />
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="custom" className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="custom-crop">Crop Name</Label>
                <Input
                  id="custom-crop"
                  placeholder="Enter crop name"
                  value={cropName}
                  onChange={(e) => setCropName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="custom-variety">Variety (Optional)</Label>
                <Input
                  id="custom-variety"
                  placeholder="Enter variety name"
                  value={cropVariety}
                  onChange={(e) => setCropVariety(e.target.value)}
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Sowing Date Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Expected Sowing Date
          </CardTitle>
          <CardDescription>
            When do you plan to sow the seeds?
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                {sowingDate ? format(sowingDate, "PPP") : <span>Pick a date</span>}
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
          
          {sowingDate && (
            <div className="mt-3 p-3 bg-primary/5 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">AI will generate schedule for:</p>
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  Full crop lifecycle from {format(sowingDate, "dd MMM yyyy")}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Button */}
      <Button
        onClick={handleSubmit}
        disabled={!cropName || !sowingDate || loading}
        className="w-full h-12"
        size="lg"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
            Generating Schedule...
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5 mr-2" />
            Generate AI Crop Schedule
          </>
        )}
      </Button>
    </div>
  );
};

export default CropDateInput;