import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MapPin, Home, Droplets, Mountain, Leaf, Trees, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLandFormData } from '@/hooks/useLandFormData';
import { supabase } from '@/integrations/supabase/client';

// Modern ownership type options
const ownershipTypes = [
  { value: 'owned', label: 'Owned', icon: Home, color: 'text-success' },
  { value: 'leased', label: 'Leased', icon: Trees, color: 'text-info' },
  { value: 'shared', label: 'Shared', icon: Leaf, color: 'text-accent' },
];

// Enhanced form schema matching database fields
const formSchema = z.object({
  name: z.string().min(2, 'Land name must be at least 2 characters'),
  survey_no: z.string().optional(),
  ownership_type: z.enum(['owned', 'leased', 'shared']),
  village: z.string().optional(),
  taluka: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  soil_type: z.string().optional(),
  water_source: z.string().optional(),
  irrigation_type: z.string().optional(),
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
  existingLandId?: string;
}

export function LandFormDialog({ 
  open, 
  onClose, 
  onSubmit, 
  area, 
  centerCoordinates,
  boundary,
  existingLandId
}: LandFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { soilTypes, waterSources, irrigationTypes, loading: dataLoading } = useLandFormData();
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      survey_no: '',
      ownership_type: 'owned',
      village: '',
      taluka: '',
      district: '',
      state: '',
      soil_type: '',
      water_source: '',
      irrigation_type: '',
    },
  });

  // Load existing land data if editing
  useEffect(() => {
    if (existingLandId && open) {
      const loadLandData = async () => {
        const { data, error } = await supabase
          .from('lands')
          .select('*')
          .eq('id', existingLandId)
          .single();
        
        if (data && !error) {
          form.reset({
            name: data.name || '',
            survey_no: data.survey_number || '',
            ownership_type: (data.ownership_type as 'owned' | 'leased' | 'shared') || 'owned',
            village: data.village || '',
            taluka: data.taluka || '',
            district: data.district || '',
            state: data.state || '',
            soil_type: data.soil_type || '',
            water_source: data.water_source || '',
            irrigation_type: data.irrigation_type || '',
          });
        }
      };
      loadLandData();
    }
  }, [existingLandId, open, form]);

  const handleSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...data,
        boundary: boundary
      });
      form.reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (dataLoading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Loading Land Form</DialogTitle>
            <DialogDescription>Please wait while we load the form data...</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] z-[100] p-0 overflow-hidden">
        {/* Header with area display */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-4 border-b">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {existingLandId ? 'Edit Land Details' : 'Complete Land Details'}
            </DialogTitle>
            <DialogDescription>
              Fill in the details below to save your land information
            </DialogDescription>
          </DialogHeader>
          
          {/* Compact area and location display */}
          <div className="flex gap-2 mt-3">
            <Card className="flex-1 p-3 bg-card/80 backdrop-blur">
              <div className="flex items-center gap-2">
                <Mountain className="h-5 w-5 text-primary/50" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Area</p>
                  <p className="text-sm font-semibold text-primary">
                    {area.acres.toFixed(3)} acres
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {area.guntha.toFixed(2)} guntha • {area.sqft.toLocaleString()} sqft
                  </p>
                </div>
              </div>
            </Card>
            
            {centerCoordinates && (
              <Card className="flex-1 p-3 bg-card/80 backdrop-blur">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-accent" />
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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col h-full">
            <ScrollArea className="flex-1 max-h-[calc(90vh-200px)]">
              <div className="p-4 space-y-4">
                {/* Basic Information */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          Land Name <span className="text-destructive">*</span>
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
                    name="survey_no"
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

                {/* Ownership Type */}
                <FormField
                  control={form.control}
                  name="ownership_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Ownership Type <span className="text-destructive">*</span>
                      </FormLabel>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {ownershipTypes.map((type) => {
                          const Icon = type.icon;
                          const isSelected = field.value === type.value;
                          return (
                            <Card
                              key={type.value}
                              className={cn(
                                "p-3 cursor-pointer transition-all duration-200 border",
                                isSelected 
                                  ? "border-primary bg-primary/10" 
                                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                              )}
                              onClick={() => field.onChange(type.value)}
                            >
                              <div className="flex flex-col items-center space-y-1">
                                <Icon className={cn("h-5 w-5", type.color)} />
                                <span className={cn(
                                  "text-xs font-medium",
                                  isSelected ? "text-primary" : "text-muted-foreground"
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

                {/* Location Details */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="village"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Village/Town</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter village name" 
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
                    name="taluka"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Taluka/Block</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter taluka" 
                            className="h-9"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="district"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">District</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter district" 
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
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">State</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter state" 
                            className="h-9"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Soil Type */}
                <FormField
                  control={form.control}
                  name="soil_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Soil Type</FormLabel>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {soilTypes.map((soil) => (
                          <Badge
                            key={soil.id}
                            variant={field.value === soil.value ? "default" : "outline"}
                            className={cn(
                              "px-2 py-1 cursor-pointer transition-all text-xs",
                              field.value === soil.value 
                                ? "bg-warning hover:bg-warning/90 text-warning-foreground border-warning" 
                                : "hover:bg-warning/10"
                            )}
                            onClick={() => field.onChange(soil.value)}
                          >
                            {soil.label}
                          </Badge>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Water Source */}
                <FormField
                  control={form.control}
                  name="water_source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Water Source</FormLabel>
                      <div className="grid grid-cols-4 gap-1.5 mt-2">
                        {waterSources.map((source) => (
                          <Card
                            key={source.id}
                            className={cn(
                              "p-2 cursor-pointer transition-all text-center",
                              field.value === source.value 
                                ? "border-info bg-info/10 border" 
                                : "border hover:border-gray-300 dark:hover:border-gray-600"
                            )}
                            onClick={() => field.onChange(source.value)}
                          >
                            <Droplets className={cn(
                              "h-4 w-4 mx-auto mb-0.5",
                              field.value === source.value 
                                ? "text-info" 
                                : "text-muted-foreground"
                            )} />
                            <span className="text-[10px]">{source.label}</span>
                          </Card>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Irrigation Type */}
                <FormField
                  control={form.control}
                  name="irrigation_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Irrigation Type</FormLabel>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {irrigationTypes.map((type) => (
                          <Badge
                            key={type.id}
                            variant={field.value === type.value ? "default" : "outline"}
                            className={cn(
                              "px-2 py-1 cursor-pointer transition-all text-xs",
                              field.value === type.value 
                                ? "bg-info hover:bg-info/90 text-info-foreground border-info" 
                                : "hover:bg-info/10"
                            )}
                            onClick={() => field.onChange(type.value)}
                          >
                            {type.label}
                          </Badge>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t p-4 bg-background">
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {existingLandId ? 'Update' : 'Save Land'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}