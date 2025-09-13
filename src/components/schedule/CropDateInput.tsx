import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, MapPin, ChevronLeft, Sparkles, Wheat, Droplets, Sun } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { CentralizedCropSelector } from '@/components/crops/CentralizedCropSelector';

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

const CropDateInput: React.FC<CropDateInputProps> = ({
  land,
  onSubmit,
  onBack,
  loading = false
}) => {
  const { toast } = useToast();
  const [cropId, setCropId] = useState('');
  const [cropName, setCropName] = useState('');
  const [cropVariety, setCropVariety] = useState('');
  const [sowingDate, setSowingDate] = useState<Date | undefined>(new Date());

  const handleSubmit = () => {
    if (!cropName) {
      toast({
        title: 'Select Crop',
        description: 'Please select a crop',
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

  const handleCropSelect = (id: string, name: string) => {
    setCropId(id);
    setCropName(name);
    
    // Auto-suggest variety based on crop
    if (name.toLowerCase().includes('rice')) setCropVariety('IR-64');
    if (name.toLowerCase().includes('wheat')) setCropVariety('HD-2967');
    if (name.toLowerCase().includes('cotton')) setCropVariety('BT Cotton');
  };

  return (
    <div className="space-y-4">
      {/* Crop Selection at Top */}
      <Card className="glass-card-premium">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wheat className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">{land.name}</CardTitle>
                <CardDescription className="text-xs">
                  {land.area_acres} acres {land.area_guntas && `${land.area_guntas} guntas`}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {land.soil_type && (
                <Badge className="glass-badge text-xs">
                  {land.soil_type}
                </Badge>
              )}
              {land.water_source && (
                <Badge className="glass-badge text-xs">
                  <Droplets className="h-3 w-3" />
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <CentralizedCropSelector
            selectedCropId={cropId}
            onSelect={handleCropSelect}
            className="border-0 shadow-none bg-transparent"
            showHeader={false}
            variant="compact"
          />
          
          {cropName && (
            <div className="p-4 pt-0 space-y-2">
              <Label htmlFor="variety" className="text-sm text-foreground/80">Variety (Optional)</Label>
              <Input
                id="variety"
                placeholder="e.g., IR-64, HD-2967, BT Cotton"
                value={cropVariety}
                onChange={(e) => setCropVariety(e.target.value)}
                className="h-9 glass-card"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sowing Date Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
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
                  "w-full justify-start text-left font-normal h-10",
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
        className="w-full h-11"
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