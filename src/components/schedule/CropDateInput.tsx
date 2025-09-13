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
    <div className="space-y-4 pb-20 sm:pb-4">
      {/* Combined Land Info + Crop Selection Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-white/90 to-white/70 dark:from-black/40 dark:to-black/20 backdrop-blur-2xl border border-white/50 dark:border-white/20 rounded-2xl shadow-xl overflow-hidden"
      >
        {/* Land Header */}
        <div className="px-4 py-3 border-b border-white/20 dark:border-white/10 bg-gradient-to-r from-primary/5 to-accent/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="h-8 w-8 rounded-full hover:bg-white/20 dark:hover:bg-white/10"
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

        {/* Crop Selection Section */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wheat className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Select Crop</span>
          </div>
          
          <CentralizedCropSelector
            selectedCropId={cropId}
            onSelect={handleCropSelect}
            className="border-0 shadow-none bg-transparent -m-4"
            showHeader={false}
            variant="compact"
            showSearch={true}
          />
          
          {/* Variety Input - Shows only when crop is selected */}
          {cropName && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-2"
            >
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
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Date Selection Card - Only shows when crop is selected */}
      {cropName && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-white/90 to-white/70 dark:from-black/40 dark:to-black/20 backdrop-blur-2xl border border-white/50 dark:border-white/20 rounded-2xl shadow-xl p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Expected Sowing Date</span>
          </div>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-12",
                  "bg-white/50 dark:bg-black/20 backdrop-blur-sm",
                  "border-white/30 dark:border-white/20 hover:border-primary/50",
                  "transition-all duration-300 group",
                  !sowingDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-3 h-4 w-4 text-primary/60 group-hover:text-primary transition-colors" />
                {sowingDate ? (
                  <span className="text-foreground">{format(sowingDate, "PPP")}</span>
                ) : (
                  <span>Select sowing date...</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-xl overflow-hidden" align="start">
              <Calendar
                mode="single"
                selected={sowingDate}
                onSelect={setSowingDate}
                initialFocus
                className="rounded-xl"
              />
            </PopoverContent>
          </Popover>
          
          {/* AI Schedule Preview */}
          {sowingDate && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-3 p-3 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20"
            >
              <div className="flex items-start gap-2">
                <Sun className="h-4 w-4 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">AI will generate schedule for:</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">
                    Full crop lifecycle from {format(sowingDate, "dd MMM yyyy")}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Floating Generate Button - Mobile optimized */}
      <AnimatePresence>
        {cropName && sowingDate && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-20 sm:bottom-4 left-4 right-4 sm:relative sm:left-auto sm:right-auto z-20"
          >
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className={cn(
                "w-full h-12 sm:h-11",
                "bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary",
                "shadow-2xl shadow-primary/30 hover:shadow-primary/40",
                "transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]",
                "font-semibold text-white"
              )}
              size="lg"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Generating Schedule...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  <span>Generate AI Crop Schedule</span>
                </div>
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CropDateInput;