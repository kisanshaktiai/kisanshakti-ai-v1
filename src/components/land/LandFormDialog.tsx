import { useState } from 'react';
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
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MapPin, Calendar } from 'lucide-react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  allCrops,
  cropStages,
  irrigationTypes,
  soilTypes,
  soilHealthStatus,
  waterSources
} from './cropData';

const formSchema = z.object({
  // Basic Information
  local_name: z.string().min(2, 'Farm name must be at least 2 characters'),
  gat_number: z.string().optional(),
  ownership_type: z.enum(['owned', 'leased', 'shared']),
  
  // Land Details
  soil_type: z.string().optional(),
  water_source: z.string().optional(),
  irrigation_type: z.string().optional(),
  soil_health: z.string().optional(),
  
  // Crop Information
  previous_crop: z.string().optional(),
  current_crop: z.string().optional(),
  sowing_date: z.date().optional(),
  crop_stage: z.string().optional(),
  expected_harvest_date: z.date().optional(),
  
  // Management
  last_fertilizer_date: z.date().optional(),
  pesticide_used: z.boolean().default(false),
  is_organic: z.boolean().default(false),
  
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface LandFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => Promise<void>;
  area: {
    sqft: number;
    guntha: number;
    acres: number;
  };
  centerCoordinates?: {
    lat: number;
    lng: number;
  };
}

export function LandFormDialog({ open, onClose, onSubmit, area, centerCoordinates }: LandFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      local_name: '',
      gat_number: '',
      ownership_type: 'owned',
      soil_type: '',
      water_source: '',
      irrigation_type: '',
      soil_health: 'good',
      previous_crop: '',
      current_crop: '',
      crop_stage: 'land_preparation',
      pesticide_used: false,
      is_organic: false,
      notes: '',
    },
  });

  const handleSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      form.reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] z-[100]">
        <DialogHeader>
          <DialogTitle>Complete Land Details</DialogTitle>
          <DialogDescription>
            Add details for your {area.acres.toFixed(3)} acre land
          </DialogDescription>
        </DialogHeader>

        {/* Area and Location Summary */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-muted rounded-lg">
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-xs font-medium">{area.sqft.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">sq ft</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-medium">{area.guntha.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">guntha</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-medium">{area.acres.toFixed(3)}</div>
              <div className="text-[10px] text-muted-foreground">acres</div>
            </div>
          </div>
          {centerCoordinates && (
            <div className="flex items-center justify-center gap-1">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              <div className="text-[10px] text-muted-foreground">
                {centerCoordinates.lat.toFixed(6)}, {centerCoordinates.lng.toFixed(6)}
              </div>
            </div>
          )}
        </div>

        <ScrollArea className="h-[450px] pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Basic Info</TabsTrigger>
                  <TabsTrigger value="crop">Crop Details</TabsTrigger>
                  <TabsTrigger value="management">Management</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  <FormField
                    control={form.control}
                    name="local_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Land Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., North Field" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="gat_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gat/Survey Number</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 123/A" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="ownership_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ownership Type *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="owned">Owned</SelectItem>
                              <SelectItem value="leased">Leased</SelectItem>
                              <SelectItem value="shared">Shared</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="soil_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Soil Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select soil type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {soilTypes.map((soil) => (
                                <SelectItem key={soil.value} value={soil.value}>
                                  {soil.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="soil_health"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Soil Health Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {soilHealthStatus.map((status) => (
                                <SelectItem key={status.value} value={status.value}>
                                  {status.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="water_source"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Water Source</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select source" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {waterSources.map((source) => (
                                <SelectItem key={source.value} value={source.value}>
                                  {source.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="irrigation_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Irrigation Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {irrigationTypes.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="crop" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="previous_crop"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Previous Crop</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select crop" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <ScrollArea className="h-[200px]">
                                {allCrops.map((crop) => (
                                  <SelectItem key={crop.value} value={crop.value}>
                                    {crop.label}
                                  </SelectItem>
                                ))}
                              </ScrollArea>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="current_crop"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Crop</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select crop" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <ScrollArea className="h-[200px]">
                                {allCrops.map((crop) => (
                                  <SelectItem key={crop.value} value={crop.value}>
                                    {crop.label}
                                  </SelectItem>
                                ))}
                              </ScrollArea>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="crop_stage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Crop Stage</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select stage" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {cropStages.map((stage) => (
                              <SelectItem key={stage.value} value={stage.value}>
                                {stage.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="sowing_date"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Sowing/Planting Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <Calendar className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date > new Date() || date < new Date("1900-01-01")
                                }
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expected_harvest_date"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Expected Harvest Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <Calendar className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date < new Date()
                                }
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="management" className="space-y-4">
                  <FormField
                    control={form.control}
                    name="last_fertilizer_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Last Fertilizer Application</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <Calendar className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date > new Date()
                              }
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="pesticide_used"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Pesticide Usage</FormLabel>
                            <FormDescription>
                              Have you used pesticides on this land?
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="is_organic"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Organic Certification</FormLabel>
                            <FormDescription>
                              Is this land certified organic?
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Notes</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Any additional information about the land"
                            className="resize-none"
                            rows={3}
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Land
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}