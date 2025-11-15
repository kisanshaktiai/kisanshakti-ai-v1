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
import { motion, AnimatePresence } from 'framer-motion';

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
  onSubmit: (cropName: string, cropVariety: string, sowingDate: Date, isReadyMadePlant?: boolean) => void;
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
  const [isReadyMadePlant, setIsReadyMadePlant] = useState(false);

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

    onSubmit(cropName, cropVariety, sowingDate, isReadyMadePlant);
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
    <div className="fixed inset-0 bg-gradient-to-br from-background via-accent/5 to-primary/5 pt-14 pb-16 overflow-hidden">
      {/* Full Screen Container with Modern Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-full flex flex-col"
      >
        {/* Fixed Header Bar */}
        <div className="px-4 py-3 bg-background/60 backdrop-blur-2xl border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="h-9 w-9 rounded-xl bg-background/50 hover:bg-primary/10 transition-all duration-300"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{land.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {land.area_acres} acres {land.area_guntas && `• ${land.area_guntas} guntas`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {land.soil_type && (
                <span className="text-xs px-2 py-1 rounded-full bg-white/50 dark:bg-black/30 backdrop-blur-sm">
                  {land.soil_type}
                </span>
              )}
              {land.water_source && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                  <Droplets className="h-3 w-3 text-blue-500" />
                  <span className="text-blue-700 dark:text-blue-300">Water</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Full Height Crop Selection */}
        <div className="flex-1 overflow-hidden bg-background/40 backdrop-blur-sm">
          <CentralizedCropSelector
            selectedCropId={cropId}
            onSelect={handleCropSelect}
            className="h-full"
            showHeader={false}
            variant="compact"
            showSearch={true}
          />
        </div>
        
        {/* Bottom Fixed Panel for Variety & Date (Shows when crop selected) */}
        {cropName && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="bg-background/95 backdrop-blur-2xl border-t border-border/50 p-4 space-y-4"
          >
            {/* Variety Input */}
            <div className="space-y-2">
              <Label htmlFor="variety" className="text-xs font-medium text-muted-foreground">
                Variety (Optional)
              </Label>
              <Input
                id="variety"
                placeholder="e.g., IR-64, HD-2967, BT Cotton"
                value={cropVariety}
                onChange={(e) => setCropVariety(e.target.value)}
                className="h-10 bg-white/50 dark:bg-black/20 backdrop-blur-sm border-white/30 dark:border-white/20 focus:border-primary/50 transition-all"
              />
            </div>

            {/* Ready-made Plant Checkbox */}
            <div className="flex items-start gap-3 p-3 bg-accent/20 rounded-lg border border-border/50">
              <input
                type="checkbox"
                id="ready-made-plant"
                checked={isReadyMadePlant}
                onChange={(e) => setIsReadyMadePlant(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <div className="flex-1">
                <Label htmlFor="ready-made-plant" className="text-xs font-medium cursor-pointer">
                  Using ready-made nursery plants
                </Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Check if planting seedlings/transplants instead of sowing seeds
                </p>
              </div>
            </div>

            {/* Date Selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">
                  {isReadyMadePlant ? 'Planting Date' : 'Sowing Date'}
                </span>
              </div>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10",
                      "bg-white/50 dark:bg-black/20 backdrop-blur-sm",
                      "border-white/30 dark:border-white/20 hover:border-primary/50",
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
                    onSelect={(date) => date && setSowingDate(date)}
                    initialFocus
                    disabled={(date) => 
                      date < new Date(new Date().setHours(0,0,0,0)) || 
                      date > new Date(new Date().setFullYear(new Date().getFullYear() + 1))
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={!cropName || !sowingDate || loading}
              className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg"
            >
              {loading ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                  Generating AI Schedule...
                </>
              ) : (
                <>
                  Generate AI Schedule
                  <Sparkles className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </motion.div>
        )}

      </motion.div>
    </div>
  );
};

export default CropDateInput;