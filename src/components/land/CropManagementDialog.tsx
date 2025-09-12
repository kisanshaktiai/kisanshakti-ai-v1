import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, addDays } from 'date-fns';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  CalendarIcon, 
  Loader2, 
  Wheat, 
  Leaf, 
  TreePine, 
  Apple, 
  DollarSign, 
  TrendingUp,
  ArrowLeft,
  Clock,
  Calendar as CalendarCheck,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface CropGroup {
  id: string;
  group_name: string;
  group_key: string;
  group_icon?: string;
  description?: string;
  display_order?: number;
}

interface Crop {
  id: string;
  value: string;
  label: string;
  local_name?: string;
  season?: string;
  duration_days?: number;
  crop_group_id?: string;
  is_popular?: boolean;
}

const groupIcons: Record<string, React.ReactNode> = {
  cereals: <Wheat className="h-5 w-5" />,
  grains: <Wheat className="h-5 w-5" />,
  vegetables: <Leaf className="h-5 w-5" />,
  fruits: <Apple className="h-5 w-5" />,
  cash_crops: <DollarSign className="h-5 w-5" />,
  pulses: <TreePine className="h-5 w-5" />,
  oilseeds: <TrendingUp className="h-5 w-5" />,
};

const formSchema = z.object({
  current_crop_id: z.string().optional(),
  current_crop_name: z.string().optional(),
  planting_date: z.date().optional(),
  expected_harvest_date: z.date().optional(),
  previous_crop_id: z.string().optional(),
  previous_crop_name: z.string().optional(),
  harvest_date: z.date().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface CropManagementDialogProps {
  open: boolean;
  onClose: () => void;
  landId: string;
  landName: string;
  onSuccess?: () => void;
}

export function CropManagementDialog({ 
  open, 
  onClose, 
  landId,
  landName,
  onSuccess 
}: CropManagementDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'current' | 'previous'>('current');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [cropGroups, setCropGroups] = useState<CropGroup[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentCropSelection, setCurrentCropSelection] = useState<{ id: string; name: string; duration?: number } | null>(null);
  const [previousCropSelection, setPreviousCropSelection] = useState<{ id: string; name: string } | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      current_crop_id: '',
      current_crop_name: '',
      planting_date: undefined,
      expected_harvest_date: undefined,
      previous_crop_id: '',
      previous_crop_name: '',
      harvest_date: undefined,
    },
  });

  // Load crop groups and crops
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load crop groups
        const { data: groupsData, error: groupsError } = await supabase
          .from('crop_groups')
          .select('*')
          .order('display_order', { ascending: true });
          
        if (groupsError) throw groupsError;
        
        // Load all crops
        const { data: cropsData, error: cropsError } = await supabase
          .from('crops')
          .select('*')
          .order('label', { ascending: true });
          
        if (cropsError) throw cropsError;
        
        setCropGroups(groupsData || []);
        setCrops(cropsData || []);

        // Load existing crop data for the land
        const { data: landData, error: landError } = await supabase
          .from('lands')
          .select('current_crop, planting_date, expected_harvest_date, previous_crop, harvest_date')
          .eq('id', landId)
          .single();

        if (landData && !landError) {
          form.reset({
            current_crop_name: landData.current_crop || '',
            planting_date: landData.planting_date ? new Date(landData.planting_date) : undefined,
            expected_harvest_date: landData.expected_harvest_date ? new Date(landData.expected_harvest_date) : undefined,
            previous_crop_name: landData.previous_crop || '',
            harvest_date: landData.harvest_date ? new Date(landData.harvest_date) : undefined,
          });
        }
      } catch (err) {
        console.error('Error loading data:', err);
        toast({
          title: 'Error',
          description: 'Failed to load crop data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [landId, form]);

  // Calculate expected harvest date when planting date changes
  useEffect(() => {
    const plantingDate = form.watch('planting_date');
    if (plantingDate && currentCropSelection?.duration) {
      const expectedHarvest = addDays(plantingDate, currentCropSelection.duration);
      form.setValue('expected_harvest_date', expectedHarvest);
    }
  }, [form.watch('planting_date'), currentCropSelection]);

  const handleCropSelect = (cropId: string, cropName: string, isCurrentCrop: boolean) => {
    const crop = crops.find(c => c.id === cropId);
    
    if (isCurrentCrop) {
      setCurrentCropSelection({ 
        id: cropId, 
        name: cropName, 
        duration: crop?.duration_days || 90 
      });
      form.setValue('current_crop_id', cropId);
      form.setValue('current_crop_name', cropName);
      
      // If planting date is already set, calculate harvest date
      const plantingDate = form.getValues('planting_date');
      if (plantingDate && crop?.duration_days) {
        const expectedHarvest = addDays(plantingDate, crop.duration_days);
        form.setValue('expected_harvest_date', expectedHarvest);
      }
    } else {
      setPreviousCropSelection({ id: cropId, name: cropName });
      form.setValue('previous_crop_id', cropId);
      form.setValue('previous_crop_name', cropName);
    }
    
    setSelectedGroup(null); // Reset group selection after crop selection
  };

  const handleSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('lands')
        .update({
          current_crop: data.current_crop_name || null,
          planting_date: data.planting_date?.toISOString() || null,
          expected_harvest_date: data.expected_harvest_date?.toISOString() || null,
          previous_crop: data.previous_crop_name || null,
          harvest_date: data.harvest_date?.toISOString() || null,
        })
        .eq('id', landId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Crop information updated successfully',
      });

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error updating crop information:', error);
      toast({
        title: 'Error',
        description: 'Failed to update crop information',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCrops = selectedGroup 
    ? crops.filter(crop => crop.crop_group_id === selectedGroup)
    : [];

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Manage Crops - {landName}</DialogTitle>
          <DialogDescription>
            Add or update crop information for your land
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col h-full">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'current' | 'previous')} className="flex-1">
              <TabsList className="grid w-full grid-cols-2 mx-6" style={{ width: 'calc(100% - 3rem)' }}>
                <TabsTrigger value="current">
                  <Wheat className="h-4 w-4 mr-2" />
                  Current Crop
                </TabsTrigger>
                <TabsTrigger value="previous">
                  <Clock className="h-4 w-4 mr-2" />
                  Previous Crop
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 max-h-[calc(90vh-250px)]">
                <div className="p-6">
                  <TabsContent value="current" className="mt-0 space-y-4">
                    {/* Current Crop Selection */}
                    {!selectedGroup ? (
                      <div>
                        <h3 className="text-sm font-medium mb-3">Select Crop Category</h3>
                        <div className="grid grid-cols-3 gap-3">
                          {cropGroups.slice(0, 9).map((group) => (
                            <Card
                              key={group.id}
                              className="cursor-pointer hover:border-primary transition-all"
                              onClick={() => setSelectedGroup(group.id)}
                            >
                              <CardContent className="p-4 text-center">
                                <div className="flex flex-col items-center gap-2">
                                  {group.group_icon ? (
                                    <span className="text-2xl">{group.group_icon}</span>
                                  ) : (
                                    groupIcons[group.group_key] || <Leaf className="h-6 w-6" />
                                  )}
                                  <span className="text-sm font-medium">{group.group_name}</span>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedGroup(null)}
                          >
                            <ArrowLeft className="h-4 w-4 mr-1" />
                            Back
                          </Button>
                          <h3 className="text-sm font-medium">
                            Select Crop from {cropGroups.find(g => g.id === selectedGroup)?.group_name}
                          </h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {filteredCrops.map((crop) => (
                            <Card
                              key={crop.id}
                              className={cn(
                                "cursor-pointer transition-all",
                                currentCropSelection?.id === crop.id 
                                  ? "ring-2 ring-primary bg-primary/5" 
                                  : "hover:border-primary"
                              )}
                              onClick={() => handleCropSelect(crop.id, crop.label, true)}
                            >
                              <CardContent className="p-3">
                                <div className="space-y-1">
                                  <p className="font-medium text-sm">{crop.label}</p>
                                  {crop.local_name && (
                                    <p className="text-xs text-muted-foreground">{crop.local_name}</p>
                                  )}
                                  {crop.duration_days && (
                                    <Badge variant="secondary" className="text-xs">
                                      ~{crop.duration_days} days
                                    </Badge>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentCropSelection && (
                      <div className="space-y-4 pt-4 border-t">
                        <div className="flex items-center gap-2">
                          <CalendarCheck className="h-4 w-4 text-primary" />
                          <span className="font-medium">Selected: {currentCropSelection.name}</span>
                        </div>

                        {/* Planting Date */}
                        <FormField
                          control={form.control}
                          name="planting_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Planting/Sowing Date</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !field.value && "text-muted-foreground"
                                      )}
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      {field.value ? format(field.value, 'PPP') : 'Select date'}
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) => date > new Date()}
                                    initialFocus
                                    className="pointer-events-auto"
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Expected Harvest Date */}
                        <FormField
                          control={form.control}
                          name="expected_harvest_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Expected Harvest Date</FormLabel>
                              {currentCropSelection.duration && form.watch('planting_date') && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Auto-calculated based on crop duration (~{currentCropSelection.duration} days)
                                </p>
                              )}
                              <FormControl>
                                <div className="p-3 border rounded-md bg-muted/50">
                                  {field.value ? (
                                    <span className="text-sm font-medium">
                                      {format(field.value, 'PPP')}
                                    </span>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">
                                      Select planting date first
                                    </span>
                                  )}
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="previous" className="mt-0 space-y-4">
                    {/* Previous Crop Selection */}
                    {!selectedGroup ? (
                      <div>
                        <h3 className="text-sm font-medium mb-3">Select Previous Crop Category</h3>
                        <div className="grid grid-cols-3 gap-3">
                          {cropGroups.slice(0, 9).map((group) => (
                            <Card
                              key={group.id}
                              className="cursor-pointer hover:border-primary transition-all"
                              onClick={() => setSelectedGroup(group.id)}
                            >
                              <CardContent className="p-4 text-center">
                                <div className="flex flex-col items-center gap-2">
                                  {group.group_icon ? (
                                    <span className="text-2xl">{group.group_icon}</span>
                                  ) : (
                                    groupIcons[group.group_key] || <Leaf className="h-6 w-6" />
                                  )}
                                  <span className="text-sm font-medium">{group.group_name}</span>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedGroup(null)}
                          >
                            <ArrowLeft className="h-4 w-4 mr-1" />
                            Back
                          </Button>
                          <h3 className="text-sm font-medium">
                            Select Previous Crop from {cropGroups.find(g => g.id === selectedGroup)?.group_name}
                          </h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {filteredCrops.map((crop) => (
                            <Card
                              key={crop.id}
                              className={cn(
                                "cursor-pointer transition-all",
                                previousCropSelection?.id === crop.id 
                                  ? "ring-2 ring-primary bg-primary/5" 
                                  : "hover:border-primary"
                              )}
                              onClick={() => handleCropSelect(crop.id, crop.label, false)}
                            >
                              <CardContent className="p-3">
                                <div className="space-y-1">
                                  <p className="font-medium text-sm">{crop.label}</p>
                                  {crop.local_name && (
                                    <p className="text-xs text-muted-foreground">{crop.local_name}</p>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {previousCropSelection && (
                      <div className="space-y-4 pt-4 border-t">
                        <div className="flex items-center gap-2">
                          <CalendarCheck className="h-4 w-4 text-primary" />
                          <span className="font-medium">Selected: {previousCropSelection.name}</span>
                        </div>

                        {/* Harvest Date */}
                        <FormField
                          control={form.control}
                          name="harvest_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Harvest Date</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !field.value && "text-muted-foreground"
                                      )}
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      {field.value ? format(field.value, 'PPP') : 'Select harvest date'}
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) => date > new Date()}
                                    initialFocus
                                    className="pointer-events-auto"
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>

            {/* Footer */}
            <div className="border-t p-6 bg-background">
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Crop Information
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}