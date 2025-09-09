import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  ArrowLeft, ArrowRight, Save, MapPin, Ruler, 
  FileText, Droplets, Mountain, Check
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Progress } from '@/components/ui/progress';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// Validation schemas for each step
const basicInfoSchema = z.object({
  name: z.string().min(1, 'Land name is required'),
  area_acres: z.number().min(0.01, 'Area must be greater than 0'),
  area_guntas: z.number().optional(),
  survey_number: z.string().optional(),
  ownership_type: z.string().min(1, 'Ownership type is required'),
});

const locationSchema = z.object({
  village: z.string().min(1, 'Village is required'),
  taluka: z.string().min(1, 'Taluka is required'),
  district: z.string().min(1, 'District is required'),
  state: z.string().min(1, 'State is required'),
});

const soilInfoSchema = z.object({
  soil_type: z.string().optional(),
  soil_ph: z.number().min(0).max(14).optional(),
  organic_carbon_percent: z.number().min(0).max(100).optional(),
  nitrogen_kg_per_ha: z.number().min(0).optional(),
  phosphorus_kg_per_ha: z.number().min(0).optional(),
  potassium_kg_per_ha: z.number().min(0).optional(),
});

const irrigationSchema = z.object({
  water_source: z.string().optional(),
  irrigation_source: z.string().optional(),
});

const cropInfoSchema = z.object({
  current_crop: z.string().optional(),
  crop_stage: z.string().optional(),
  last_sowing_date: z.string().optional(),
  expected_harvest_date: z.string().optional(),
});

type FormData = {
  name: string;
  area_acres: number;
  area_guntas?: number;
  survey_number?: string;
  ownership_type: string;
  village: string;
  taluka: string;
  district: string;
  state: string;
  soil_type?: string;
  soil_ph?: number;
  organic_carbon_percent?: number;
  nitrogen_kg_per_ha?: number;
  phosphorus_kg_per_ha?: number;
  potassium_kg_per_ha?: number;
  water_source?: string;
  irrigation_source?: string;
  current_crop?: string;
  crop_stage?: string;
  last_sowing_date?: string;
  expected_harvest_date?: string;
};

const steps = [
  { title: 'Basic Information', icon: FileText, schema: basicInfoSchema },
  { title: 'Location Details', icon: MapPin, schema: locationSchema },
  { title: 'Soil Information', icon: Mountain, schema: soilInfoSchema },
  { title: 'Irrigation Details', icon: Droplets, schema: irrigationSchema },
  { title: 'Crop Information', icon: Ruler, schema: cropInfoSchema },
];

export default function AddLand() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    area_acres: 0,
    ownership_type: 'owned',
    village: user?.village || '',
    taluka: user?.taluka || '',
    district: user?.district || '',
    state: user?.state || '',
  });

  const form = useForm<FormData>({
    resolver: zodResolver(steps[currentStep].schema),
    defaultValues: formData,
    mode: 'onChange',
  });

  const handleNext = async () => {
    const isValid = await form.trigger();
    if (!isValid) return;

    const stepData = form.getValues();
    setFormData({ ...formData, ...stepData });

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      form.reset({ ...formData, ...stepData });
    } else {
      handleSubmit({ ...formData, ...stepData });
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      const stepData = form.getValues();
      setFormData({ ...formData, ...stepData });
      setCurrentStep(currentStep - 1);
      form.reset(formData);
    }
  };

  const handleSubmit = async (data: FormData) => {
    if (!user?.id || !user?.tenantId) {
      toast({
        title: 'Error',
        description: 'User session not found',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('lands').insert({
        ...data,
        farmer_id: user.id,
        tenant_id: user.tenantId,
        boundary_method: 'manual',
        is_active: true,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Land added successfully',
      });

      navigate('/app/lands');
    } catch (error) {
      console.error('Error adding land:', error);
      toast({
        title: 'Error',
        description: 'Failed to add land',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercentage = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/app/lands')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Add New Land</h1>
          <p className="text-muted-foreground">Register your land parcel</p>
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Step {currentStep + 1} of {steps.length}
              </span>
              <span className="font-medium">{steps[currentStep].title}</span>
            </div>
            <Progress value={progressPercentage} />
            <div className="flex justify-between">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div
                    key={index}
                    className={`flex flex-col items-center gap-2 ${
                      index <= currentStep ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    <div
                      className={`rounded-full p-2 ${
                        index < currentStep
                          ? 'bg-primary text-primary-foreground'
                          : index === currentStep
                          ? 'bg-primary/20'
                          : 'bg-muted'
                      }`}
                    >
                      {index < currentStep ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <span className="text-xs hidden md:block">{step.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>{steps[currentStep].title}</CardTitle>
          <CardDescription>
            {currentStep === 0 && 'Enter basic information about your land'}
            {currentStep === 1 && 'Specify the location of your land'}
            {currentStep === 2 && 'Provide soil health information if available'}
            {currentStep === 3 && 'Add irrigation and water source details'}
            {currentStep === 4 && 'Current crop and cultivation details'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-4">
              {/* Step 1: Basic Information */}
              {currentStep === 0 && (
                <>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Land Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., North Field" {...field} />
                        </FormControl>
                        <FormDescription>
                          Give a memorable name to identify this land
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="area_acres"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Area (Acres)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="area_guntas"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Area (Guntas)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="0"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="survey_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Survey Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 123/4" {...field} />
                        </FormControl>
                        <FormDescription>
                          Official survey or khata number if available
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="ownership_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ownership Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="owned">Owned</SelectItem>
                            <SelectItem value="leased">Leased</SelectItem>
                            <SelectItem value="rented">Rented</SelectItem>
                            <SelectItem value="ancestral">Ancestral</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {/* Step 2: Location Details */}
              {currentStep === 1 && (
                <>
                  <FormField
                    control={form.control}
                    name="village"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Village</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter village name" {...field} />
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
                        <FormLabel>Taluka/Block</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter taluka name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="district"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>District</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter district name" {...field} />
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
                        <FormLabel>State</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter state name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {/* Step 3: Soil Information */}
              {currentStep === 2 && (
                <>
                  <FormField
                    control={form.control}
                    name="soil_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Soil Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select soil type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="black">Black Soil</SelectItem>
                            <SelectItem value="red">Red Soil</SelectItem>
                            <SelectItem value="alluvial">Alluvial Soil</SelectItem>
                            <SelectItem value="laterite">Laterite Soil</SelectItem>
                            <SelectItem value="clay">Clay Soil</SelectItem>
                            <SelectItem value="sandy">Sandy Soil</SelectItem>
                            <SelectItem value="loamy">Loamy Soil</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="soil_ph"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Soil pH</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="14"
                              placeholder="6.5"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                            />
                          </FormControl>
                          <FormDescription>0-14 scale</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="organic_carbon_percent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Organic Carbon (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              placeholder="0.75"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="nitrogen_kg_per_ha"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>N (kg/ha)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="0"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="phosphorus_kg_per_ha"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>P (kg/ha)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="0"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="potassium_kg_per_ha"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>K (kg/ha)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="0"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}

              {/* Step 4: Irrigation Details */}
              {currentStep === 3 && (
                <>
                  <FormField
                    control={form.control}
                    name="water_source"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Water Source</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select water source" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="borewell">Borewell</SelectItem>
                            <SelectItem value="well">Well</SelectItem>
                            <SelectItem value="canal">Canal</SelectItem>
                            <SelectItem value="river">River</SelectItem>
                            <SelectItem value="pond">Pond</SelectItem>
                            <SelectItem value="rainwater">Rainwater</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="irrigation_source"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Irrigation Method</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select irrigation method" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="drip">Drip Irrigation</SelectItem>
                            <SelectItem value="sprinkler">Sprinkler</SelectItem>
                            <SelectItem value="flood">Flood Irrigation</SelectItem>
                            <SelectItem value="furrow">Furrow Irrigation</SelectItem>
                            <SelectItem value="rainfed">Rain-fed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {/* Step 5: Crop Information */}
              {currentStep === 4 && (
                <>
                  <FormField
                    control={form.control}
                    name="current_crop"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Crop</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Wheat, Rice, Cotton" {...field} />
                        </FormControl>
                        <FormDescription>
                          Leave empty if no crop is currently planted
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="crop_stage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Crop Stage</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select crop stage" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="germination">Germination</SelectItem>
                            <SelectItem value="vegetative">Vegetative</SelectItem>
                            <SelectItem value="flowering">Flowering</SelectItem>
                            <SelectItem value="fruiting">Fruiting</SelectItem>
                            <SelectItem value="harvesting">Harvesting</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="last_sowing_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Sowing Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="expected_harvest_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Harvest Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentStep === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>
        
        <Button
          onClick={handleNext}
          disabled={isSubmitting}
        >
          {currentStep === steps.length - 1 ? (
            <>
              <Save className="h-4 w-4 mr-2" />
              {isSubmitting ? 'Saving...' : 'Save Land'}
            </>
          ) : (
            <>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}