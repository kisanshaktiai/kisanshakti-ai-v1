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
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, MapPin, Home, Droplets, Mountain, Leaf, Trees, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLandFormData } from '@/hooks/useLandFormData';
import { useLocationData } from '@/hooks/useLocationData';
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
  state_id: z.string().optional(),
  district_id: z.string().optional(),
  taluka_id: z.string().optional(),
  village_id: z.string().optional(),
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
  const { 
    states, 
    districts, 
    talukas, 
    villages, 
    loadDistricts, 
    loadTalukas, 
    loadVillages 
  } = useLocationData();
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      survey_no: '',
      ownership_type: 'owned',
      state_id: '',
      district_id: '',
      taluka_id: '',
      village_id: '',
      soil_type: '',
      water_source: '',
      irrigation_type: '',
    },
  });

  // Watch for location changes
  const stateId = form.watch('state_id');
  const districtId = form.watch('district_id');
  const talukaId = form.watch('taluka_id');

  useEffect(() => {
    if (stateId) {
      loadDistricts(stateId);
      form.setValue('district_id', '');
      form.setValue('taluka_id', '');
      form.setValue('village_id', '');
    }
  }, [stateId]);

  useEffect(() => {
    if (districtId) {
      loadTalukas(districtId);
      form.setValue('taluka_id', '');
      form.setValue('village_id', '');
    }
  }, [districtId]);

  useEffect(() => {
    if (talukaId) {
      loadVillages(talukaId);
      form.setValue('village_id', '');
    }
  }, [talukaId]);

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
            state_id: '', // These would need to be converted from text to IDs
            district_id: '',
            taluka_id: '',
            village_id: '',
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
      // Get names from selected IDs for saving
      const selectedState = states.find(s => s.id === data.state_id);
      const selectedDistrict = districts.find(d => d.id === data.district_id);
      const selectedTaluka = talukas.find(t => t.id === data.taluka_id);
      const selectedVillage = villages.find(v => v.id === data.village_id);

      await onSubmit({
        ...data,
        boundary: boundary,
        // Store names in database for backward compatibility
        state: selectedState?.name,
        district: selectedDistrict?.name,
        taluka: selectedTaluka?.name,
        village: selectedVillage?.name,
      } as any);
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
        {/* Compact Header */}
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-6 py-3 border-b">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              {existingLandId ? 'Edit' : 'Complete'} Land Details
              {area && (
                <Badge variant="secondary" className="ml-2">
                  {area.acres.toFixed(2)} acres
                </Badge>
              )}
            </DialogTitle>
            <p id="land-form-description" className="text-xs text-muted-foreground mt-1">
              Fill in the details below to save your land information
            </p>
          </DialogHeader>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col h-full">
            <ScrollArea className="flex-1 px-6 py-4">
              <div className="space-y-4">
                {/* Basic Information */}
                <div className="grid grid-cols-2 gap-3">
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
                            className="h-8 text-sm"
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
                            className="h-8 text-sm"
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
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        {ownershipTypes.map((type) => {
                          const Icon = type.icon;
                          const isSelected = field.value === type.value;
                          return (
                            <Card
                              key={type.value}
                              className={cn(
                                "p-2.5 cursor-pointer transition-all duration-200 border",
                                isSelected 
                                  ? "border-primary bg-primary/10" 
                                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                              )}
                              onClick={() => field.onChange(type.value)}
                            >
                              <div className="flex flex-col items-center space-y-1">
                                <Icon className={cn("h-4 w-4", type.color)} />
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

                {/* Location Details - Hierarchical Dropdowns */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location Details</h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="state_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">State</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select state" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {states.map((state) => (
                                <SelectItem key={state.id} value={state.id}>
                                  {state.name}
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
                      name="district_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">District</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            value={field.value}
                            disabled={!stateId}
                          >
                            <FormControl>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder={stateId ? "Select district" : "Select state first"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {districts.map((district) => (
                                <SelectItem key={district.id} value={district.id}>
                                  {district.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="taluka_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Taluka/Block</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            value={field.value}
                            disabled={!districtId}
                          >
                            <FormControl>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder={districtId ? "Select taluka" : "Select district first"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {talukas.map((taluka) => (
                                <SelectItem key={taluka.id} value={taluka.id}>
                                  {taluka.name}
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
                      name="village_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Village/Town</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            value={field.value}
                            disabled={!talukaId}
                          >
                            <FormControl>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder={talukaId ? "Select village" : "Select taluka first"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {villages.map((village) => (
                                <SelectItem key={village.id} value={village.id}>
                                  {village.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Land Characteristics */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Land Characteristics</h4>
                  
                  {/* Soil Type */}
                  <FormField
                    control={form.control}
                    name="soil_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">Soil Type</FormLabel>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {soilTypes.map((soil) => (
                            <Badge
                              key={soil.id}
                              variant={field.value === soil.value ? "default" : "outline"}
                              className={cn(
                                "px-2 py-0.5 cursor-pointer transition-all text-xs",
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
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  {/* Water Source */}
                  <FormField
                    control={form.control}
                    name="water_source"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">Water Source</FormLabel>
                        <div className="grid grid-cols-4 gap-1.5 mt-1">
                          {waterSources.map((source) => (
                            <Card
                              key={source.id}
                              className={cn(
                                "p-1.5 cursor-pointer transition-all text-center",
                                field.value === source.value 
                                  ? "border-info bg-info/10 border" 
                                  : "border hover:border-gray-300 dark:hover:border-gray-600"
                              )}
                              onClick={() => field.onChange(source.value)}
                            >
                              <Droplets className={cn(
                                "h-3.5 w-3.5 mx-auto mb-0.5",
                                field.value === source.value 
                                  ? "text-info" 
                                  : "text-muted-foreground"
                              )} />
                              <span className="text-[10px] leading-tight">{source.label}</span>
                            </Card>
                          ))}
                        </div>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  {/* Irrigation Type */}
                  <FormField
                    control={form.control}
                    name="irrigation_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">Irrigation Type</FormLabel>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {irrigationTypes.map((type) => (
                            <Badge
                              key={type.id}
                              variant={field.value === type.value ? "default" : "outline"}
                              className={cn(
                                "px-2 py-0.5 cursor-pointer transition-all text-xs",
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
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </ScrollArea>

            {/* Footer with buttons */}
            <div className="border-t px-6 py-3 bg-background">
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !form.formState.isValid}
                  className="min-w-[100px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Land'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}