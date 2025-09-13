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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  CheckCircle2,
  Sprout,
  Map,
  Info
} from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('basic');
  const { soilTypes, waterSources, irrigationTypes, loading: dataLoading } = useLandFormData();
  const { 
    states, 
    districts, 
    talukas, 
    villages, 
    loadDistricts, 
    loadTalukas, 
    loadVillages,
    loading: locationLoading
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
      // Load districts first, then clear dependent fields after load completes
      loadDistricts(stateId).then(() => {
        const currentDistrictId = form.getValues('district_id');
        // Only clear if district doesn't belong to this state
        const validDistrict = districts.some(d => d.id === currentDistrictId && d.state_id === stateId);
        if (!validDistrict) {
          form.setValue('district_id', '');
          form.setValue('taluka_id', '');
          form.setValue('village_id', '');
        }
      });
    } else {
      // Clear all dependent fields if no state
      form.setValue('district_id', '');
      form.setValue('taluka_id', '');
      form.setValue('village_id', '');
    }
  }, [stateId, loadDistricts]);

  useEffect(() => {
    if (districtId) {
      // Load talukas first, then clear dependent fields after load completes
      loadTalukas(districtId).then(() => {
        const currentTalukaId = form.getValues('taluka_id');
        // Only clear if taluka doesn't belong to this district
        const validTaluka = talukas.some(t => t.id === currentTalukaId && t.district_id === districtId);
        if (!validTaluka) {
          form.setValue('taluka_id', '');
          form.setValue('village_id', '');
        }
      });
    } else {
      // Clear all dependent fields if no district
      form.setValue('taluka_id', '');
      form.setValue('village_id', '');
    }
  }, [districtId, loadTalukas]);

  useEffect(() => {
    if (talukaId) {
      // Load villages first, then clear dependent field after load completes
      loadVillages(talukaId).then(() => {
        const currentVillageId = form.getValues('village_id');
        // Only clear if village doesn't belong to this taluka
        const validVillage = villages.some(v => v.id === currentVillageId && v.taluka_id === talukaId);
        if (!validVillage) {
          form.setValue('village_id', '');
        }
      });
    } else {
      // Clear village if no taluka
      form.setValue('village_id', '');
    }
  }, [talukaId, loadVillages]);

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
          // For now, we can't pre-fill location as we don't have IDs in database
          // Just reset with the basic values
          form.reset({
            name: data.name || '',
            survey_no: data.survey_number || '',
            ownership_type: (data.ownership_type as 'owned' | 'leased' | 'shared') || 'owned',
            state_id: '',
            district_id: '',
            taluka_id: '',
            village_id: '',
            soil_type: data.soil_type || '',
            water_source: data.water_source || '',
            irrigation_type: data.irrigation_type || '',
          });
          
          // TODO: In future, we can try to match names to IDs if needed
          // For now, user will need to re-select location when editing
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
      <DialogContent className="sm:max-w-[750px] h-[90vh] p-0 overflow-hidden z-[100]" aria-describedby="land-form-description">
        {/* Compact Header with Area Info */}
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-6 py-4 border-b">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {existingLandId ? 'Edit' : 'Complete'} Land Details
            </DialogTitle>
            <p id="land-form-description" className="text-xs text-muted-foreground mt-1">
              Fill in the details to save your land
            </p>
          </DialogHeader>
          
          {/* Area and Boundary Info Card */}
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
            {/* Tabs for organizing form sections */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-2 p-1 mx-6 mt-4 mb-2">
                <TabsTrigger 
                  value="basic" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Info className="h-4 w-4 mr-2" />
                  Basic Info
                </TabsTrigger>
                <TabsTrigger 
                  value="characteristics"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Sprout className="h-4 w-4 mr-2" />
                  Land Details
                </TabsTrigger>
              </TabsList>
              
              <ScrollArea className="flex-1 px-6">
                <TabsContent value="basic" className="space-y-4 mt-4">
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

                  {/* Location Details */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground">Location Details</h4>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="state_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium">State</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value}
                              disabled={locationLoading.states}
                            >
                              <FormControl>
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue placeholder="Select state" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {states.length === 0 && !locationLoading.states ? (
                                  <div className="text-sm text-muted-foreground p-2 text-center">
                                    No states found
                                  </div>
                                ) : (
                                  states.map((state) => (
                                    <SelectItem key={state.id} value={state.id}>
                                      {state.name}
                                    </SelectItem>
                                  ))
                                )}
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
                              disabled={!stateId || locationLoading.districts}
                            >
                              <FormControl>
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue placeholder={
                                    !stateId ? "Select state first" :
                                    locationLoading.districts ? "Loading..." :
                                    districts.length === 0 ? "No districts available" :
                                    "Select district"
                                  } />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {districts.length === 0 && !locationLoading.districts ? (
                                  <div className="text-sm text-muted-foreground p-2 text-center">
                                    {!stateId ? "Select a state first" : "No districts found"}
                                  </div>
                                ) : (
                                  districts.map((district) => (
                                    <SelectItem key={district.id} value={district.id}>
                                      {district.name}
                                    </SelectItem>
                                  ))
                                )}
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
                              disabled={!districtId || locationLoading.talukas}
                            >
                              <FormControl>
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue placeholder={
                                    !districtId ? "Select district first" :
                                    locationLoading.talukas ? "Loading..." :
                                    talukas.length === 0 ? "No talukas available" :
                                    "Select taluka"
                                  } />
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
                              disabled={!talukaId || locationLoading.villages}
                            >
                              <FormControl>
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue placeholder={
                                    !talukaId ? "Select taluka first" :
                                    locationLoading.villages ? "Loading..." :
                                    villages.length === 0 ? "No villages available" :
                                    "Select village"
                                  } />
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
                    
                    {locationLoading && (
                      <div className="flex items-center justify-center py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                        <span className="text-xs text-muted-foreground">Loading locations...</span>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="characteristics" className="space-y-4 mt-4">
                  {/* Soil Type */}
                  <FormField
                    control={form.control}
                    name="soil_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">Soil Type</FormLabel>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {soilTypes.map((soil) => (
                            <Badge
                              key={soil.id}
                              variant={field.value === soil.value ? "default" : "outline"}
                              className={cn(
                                "px-3 py-1.5 cursor-pointer transition-all text-xs",
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
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          {waterSources.map((source) => (
                            <Card
                              key={source.id}
                              className={cn(
                                "p-2 cursor-pointer transition-all text-center",
                                field.value === source.value 
                                  ? "border-info bg-info/10 border-2" 
                                  : "border hover:border-gray-300 dark:hover:border-gray-600"
                              )}
                              onClick={() => field.onChange(source.value)}
                            >
                              <Droplets className={cn(
                                "h-4 w-4 mx-auto mb-1",
                                field.value === source.value 
                                  ? "text-info" 
                                  : "text-muted-foreground"
                              )} />
                              <span className="text-[11px] leading-tight">{source.label}</span>
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
                        <div className="flex flex-wrap gap-2 mt-2">
                          {irrigationTypes.map((type) => (
                            <Badge
                              key={type.id}
                              variant={field.value === type.value ? "default" : "outline"}
                              className={cn(
                                "px-3 py-1.5 cursor-pointer transition-all text-xs",
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
                </TabsContent>
              </ScrollArea>
            </Tabs>

            {/* Fixed Footer with Save Button */}
            <div className="border-t px-6 py-4 bg-background/95 backdrop-blur">
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  {!form.formState.isValid && "Please fill required fields"}
                </p>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="default"
                    disabled={isSubmitting || !form.formState.isValid}
                    className="min-w-[120px]"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Save Land
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}