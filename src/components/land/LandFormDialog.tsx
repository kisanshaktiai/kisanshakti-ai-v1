import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MapPin, Home, Droplets, Mountain, Leaf, Trees, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  allCrops,
  soilTypes,
  waterSources
} from './cropData';

// Modern ownership type options
const ownershipTypes = [
  { value: 'owned', label: 'Owned', icon: Home, color: 'text-green-600 dark:text-green-400' },
  { value: 'leased', label: 'Leased', icon: Trees, color: 'text-blue-600 dark:text-blue-400' },
  { value: 'shared', label: 'Shared', icon: Leaf, color: 'text-purple-600 dark:text-purple-400' },
];

// Enhanced form schema matching database fields
const formSchema = z.object({
  // Required fields
  name: z.string().min(2, 'Land name must be at least 2 characters'),
  ownership_type: z.enum(['owned', 'leased', 'shared']),
  
  // Optional fields
  survey_number: z.string().optional(),
  soil_type: z.string().optional(),
  water_source: z.string().optional(),
  current_crop: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface LandFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FormData & { boundary: Array<{lat: number; lng: number}> }) => Promise<void>;
  area: {
    sqft: number;
    guntha: number;
    acres: number;
  };
  centerCoordinates?: {
    lat: number;
    lng: number;
  };
  boundary: Array<{lat: number; lng: number}>;
}

export function LandFormDialog({ 
  open, 
  onClose, 
  onSubmit, 
  area, 
  centerCoordinates,
  boundary 
}: LandFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOwnership, setSelectedOwnership] = useState<string>('owned');
  const [selectedSoilType, setSelectedSoilType] = useState<string>('');
  const [selectedWaterSource, setSelectedWaterSource] = useState<string>('');
  const [selectedCrop, setSelectedCrop] = useState<string>('');
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      survey_number: '',
      ownership_type: 'owned',
      soil_type: '',
      water_source: '',
      current_crop: '',
      notes: '',
    },
  });

  const handleSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      // Include boundary points with form data
      await onSubmit({
        ...data,
        boundary: boundary
      });
      form.reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update form values when selections change
  const handleOwnershipSelect = (value: string) => {
    setSelectedOwnership(value);
    form.setValue('ownership_type', value as any);
  };

  const handleSoilTypeSelect = (value: string) => {
    setSelectedSoilType(value);
    form.setValue('soil_type', value);
  };

  const handleWaterSourceSelect = (value: string) => {
    setSelectedWaterSource(value);
    form.setValue('water_source', value);
  };

  const handleCropSelect = (value: string) => {
    setSelectedCrop(value);
    form.setValue('current_crop', value);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] z-[100] p-0 overflow-hidden">
        {/* Compact header */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-4 border-b">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Complete Land Details</DialogTitle>
          </DialogHeader>
          
          {/* Compact area display */}
          <div className="flex gap-2 mt-3">
            <Card className="flex-1 p-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
              <div className="flex items-center gap-2">
                <Mountain className="h-5 w-5 text-green-600/50 dark:text-green-400/50" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Area</p>
                  <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                    {area.acres.toFixed(3)} acres
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {area.guntha.toFixed(2)} guntha • {area.sqft.toLocaleString()} sqft
                  </p>
                </div>
              </div>
            </Card>
            
            {centerCoordinates && (
              <Card className="flex-1 p-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-[10px] font-mono">
                      {centerCoordinates.lat.toFixed(4)}, {centerCoordinates.lng.toFixed(4)}
                    </p>
                    {boundary && boundary.length > 0 && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="h-3 w-3" />
                        {boundary.length} boundary points
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 max-h-[calc(85vh-150px)]">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="p-4 space-y-4">
              {/* Basic Information Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Basic Information
                </h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          Land Name <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., North Field" 
                            className="h-9"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="survey_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          Survey/Gat Number
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., 123/A" 
                            className="h-9"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Ownership Type - Modern Card Selection */}
                <FormField
                  control={form.control}
                  name="ownership_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Ownership Type <span className="text-red-500">*</span>
                      </FormLabel>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {ownershipTypes.map((type) => {
                          const Icon = type.icon;
                          const isSelected = selectedOwnership === type.value;
                          return (
                            <Card
                              key={type.value}
                              className={cn(
                                "p-3 cursor-pointer transition-all duration-200 border",
                                isSelected 
                                  ? "border-green-500 bg-green-50 dark:bg-green-900/20" 
                                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                              )}
                              onClick={() => handleOwnershipSelect(type.value)}
                            >
                              <div className="flex flex-col items-center space-y-1">
                                <Icon className={cn("h-5 w-5", type.color)} />
                                <span className={cn(
                                  "text-xs font-medium",
                                  isSelected ? "text-green-700 dark:text-green-300" : "text-gray-700 dark:text-gray-300"
                                )}>
                                  {type.label}
                                </span>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Land Properties Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Land Properties
                </h3>

                {/* Soil Type - Badge Selection */}
                <FormField
                  control={form.control}
                  name="soil_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Soil Type</FormLabel>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {soilTypes.map((soil) => (
                          <Badge
                            key={soil.value}
                            variant={selectedSoilType === soil.value ? "default" : "outline"}
                            className={cn(
                              "px-2 py-1 cursor-pointer transition-all text-xs",
                              selectedSoilType === soil.value 
                                ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500" 
                                : "hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            )}
                            onClick={() => handleSoilTypeSelect(soil.value)}
                          >
                            {soil.label}
                          </Badge>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Water Source - Icon Cards */}
                <FormField
                  control={form.control}
                  name="water_source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Water Source</FormLabel>
                      <div className="grid grid-cols-4 gap-1.5 mt-2">
                        {waterSources.map((source) => (
                          <Card
                            key={source.value}
                            className={cn(
                              "p-2 cursor-pointer transition-all text-center",
                              selectedWaterSource === source.value 
                                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 border" 
                                : "border hover:border-gray-300 dark:hover:border-gray-600"
                            )}
                            onClick={() => handleWaterSourceSelect(source.value)}
                          >
                            <Droplets className={cn(
                              "h-4 w-4 mx-auto mb-0.5",
                              selectedWaterSource === source.value 
                                ? "text-blue-600 dark:text-blue-400" 
                                : "text-gray-400"
                            )} />
                            <span className="text-[10px]">{source.label}</span>
                          </Card>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Current Crop Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Current Crop
                </h3>

                <FormField
                  control={form.control}
                  name="current_crop"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Select Current Crop</FormLabel>
                      <ScrollArea className="h-24 w-full border rounded-lg p-2">
                        <div className="flex flex-wrap gap-1.5">
                          {allCrops.map((crop) => (
                            <Badge
                              key={crop.value}
                              variant={selectedCrop === crop.value ? "default" : "outline"}
                              className={cn(
                                "cursor-pointer transition-all text-xs px-2 py-0.5",
                                selectedCrop === crop.value 
                                  ? "bg-green-500 hover:bg-green-600 text-white" 
                                  : "hover:bg-green-50 dark:hover:bg-green-900/20"
                              )}
                              onClick={() => handleCropSelect(crop.value)}
                            >
                              {crop.label}
                            </Badge>
                          ))}
                        </div>
                      </ScrollArea>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Notes Section */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Additional Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Any additional information..."
                        className="min-h-[60px] resize-none"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving Land...
                    </>
                  ) : (
                    'Save Land Details'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}