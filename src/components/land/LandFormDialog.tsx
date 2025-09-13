import { useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Loader2, 
  MapPin, 
  Home, 
  Droplets, 
  Mountain, 
  Leaf, 
  Trees,
  Sprout,
  FileText,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLandFormData } from '@/hooks/useLandFormData';
import { supabase } from '@/integrations/supabase/client';

// Modern ownership type options
const ownershipTypes = [
  { value: 'owned', label: 'Owned', icon: Home, color: 'text-success' },
  { value: 'leased', label: 'Leased', icon: Trees, color: 'text-info' },
  { value: 'shared', label: 'Shared', icon: Leaf, color: 'text-accent' },
];

// Simplified form schema - only essential fields
const formSchema = z.object({
  name: z.string().min(2, 'Land name must be at least 2 characters'),
  survey_no: z.string().optional(),
  ownership_type: z.enum(['owned', 'leased', 'shared']),
  soil_type: z.string().optional(),
  water_source: z.string().optional(),
  irrigation_type: z.string().optional(),
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
      soil_type: '',
      water_source: '',
      irrigation_type: '',
      notes: '',
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
          .maybeSingle();
        
        if (data && !error) {
          form.reset({
            name: data.name || '',
            survey_no: data.survey_number || '',
            ownership_type: (data.ownership_type as 'owned' | 'leased' | 'shared') || 'owned',
            soil_type: data.soil_type || '',
            water_source: data.water_source || '',
            irrigation_type: data.irrigation_type || '',
            notes: data.notes || '',
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
        boundary: boundary,
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
      <DialogContent className="sm:max-w-[700px] h-[85vh] p-0 overflow-hidden z-[100]" aria-describedby="land-form-description">
        {/* Header with Area Info */}
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-6 py-4 border-b">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {existingLandId ? 'Edit' : 'Complete'} Land Details
            </DialogTitle>
            <p id="land-form-description" className="text-xs text-muted-foreground mt-1">
              Fill in the essential details to save your land
            </p>
          </DialogHeader>
          
          {/* Area and Boundary Info Cards */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Card className="p-3 bg-card/50 backdrop-blur">
              <div className="flex items-center gap-2">
                <Mountain className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Area</p>
                  <p className="text-sm font-bold text-primary">
                    {area.acres.toFixed(2)} acres
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {area.guntha.toFixed(1)} guntha | {area.sqft.toLocaleString()} sqft
                  </p>
                </div>
              </div>
            </Card>
            
            <Card className="p-3 bg-card/50 backdrop-blur">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-success" />
                <div>
                  <p className="text-xs text-muted-foreground">Boundary</p>
                  <p className="text-sm font-bold text-success">
                    {boundary.length} points
                  </p>
                  {centerCoordinates && (
                    <p className="text-[10px] text-muted-foreground">
                      {centerCoordinates.lat.toFixed(4)}°, {centerCoordinates.lng.toFixed(4)}°
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col h-full">
            <ScrollArea className="flex-1 px-6 py-4">
              <div className="space-y-6">
                {/* Basic Information Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Basic Information
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">
                            Land Name <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., North Field" 
                              className="h-9 text-sm"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="survey_no"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">
                            Survey/Gat Number
                          </FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., 123/A" 
                              className="h-9 text-sm"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
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
                        <FormLabel className="text-xs font-medium">
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
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Land Characteristics Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Sprout className="h-4 w-4" />
                    Land Characteristics
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="soil_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Soil Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Select soil type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {soilTypes.map((type) => (
                                <SelectItem key={type.id} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="water_source"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">
                            <Droplets className="inline h-3 w-3 mr-1" />
                            Water Source
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Select water source" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {waterSources.map((source) => (
                                <SelectItem key={source.id} value={source.value}>
                                  {source.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="irrigation_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Irrigation Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Select irrigation" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {irrigationTypes.map((type) => (
                                <SelectItem key={type.id} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Notes Field */}
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">Additional Notes</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Any additional information about the land..." 
                            className="resize-none text-sm"
                            rows={3}
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </ScrollArea>

            {/* Footer Actions */}
            <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="min-w-[120px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Save Land
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}