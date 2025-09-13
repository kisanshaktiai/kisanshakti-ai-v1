import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Save, X, MapPin, Info, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Progress } from '@/components/ui/progress';
import { useAuthStore } from '@/stores/authStore';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { supabase } from '@/integrations/supabase/client';
import { landsApi } from '@/services/landsApi';

interface LatLng {
  lat: number;
  lng: number;
}

interface EditLandWizardProps {
  landId: string;
  boundary: LatLng[];
  area: {
    sqft: number;
    guntha: number;
    acres: number;
  };
  existingData: any;
  onComplete: () => void;
  onCancel: () => void;
}

export function EditLandWizard({
  landId,
  boundary,
  area,
  existingData,
  onComplete,
  onCancel,
}: EditLandWizardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { speak } = useTextToSpeech();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize form data with existing values
  const [formData, setFormData] = useState({
    name: existingData?.name || '',
    survey_no: existingData?.survey_number || '',
    ownership_type: existingData?.ownership_type || 'owned',
    state: existingData?.state || '',
    district: existingData?.district || '',
    taluka: existingData?.taluka || '',
    village: existingData?.village || '',
    soil_type: existingData?.soil_type || '',
    water_source: existingData?.water_source || '',
    irrigation_type: existingData?.irrigation_type || '',
    cultivation_type: existingData?.cultivation_type || '',
    current_crop: existingData?.current_crop || '',
    crop_season: existingData?.crop_season || '',
    crop_variety: existingData?.crop_variety || '',
    planting_date: existingData?.planting_date || '',
    expected_harvest_date: existingData?.expected_harvest_date || '',
    area_acres: area.acres,
    area_guntha: area.guntha,
    boundary_polygon: boundary,
  });

  // Location data states
  const [states, setStates] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [talukas, setTalukas] = useState<any[]>([]);
  const [villages, setVillages] = useState<any[]>([]);

  // Load states on mount
  useEffect(() => {
    loadStates();
  }, []);

  // Load districts when state changes
  useEffect(() => {
    if (formData.state) {
      loadDistricts(formData.state);
    }
  }, [formData.state]);

  // Load talukas when district changes
  useEffect(() => {
    if (formData.district) {
      loadTalukas(formData.district);
    }
  }, [formData.district]);

  // Load villages when taluka changes
  useEffect(() => {
    if (formData.taluka) {
      loadVillages(formData.taluka);
    }
  }, [formData.taluka]);

  const loadStates = async () => {
    const { data } = await supabase
      .from('states')
      .select('*')
      .order('name');
    if (data) setStates(data);
  };

  const loadDistricts = async (stateId: string) => {
    const { data } = await supabase
      .from('districts')
      .select('*')
      .eq('state_id', stateId)
      .order('name');
    if (data) setDistricts(data);
  };

  const loadTalukas = async (districtId: string) => {
    const { data } = await supabase
      .from('talukas')
      .select('*')
      .eq('district_id', districtId)
      .order('name');
    if (data) setTalukas(data);
  };

  const loadVillages = async (talukaId: string) => {
    const { data } = await supabase
      .from('villages')
      .select('*')
      .eq('taluka_id', talukaId)
      .order('name');
    if (data) setVillages(data);
  };

  const handleInputChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const playVoiceGuide = (text: string) => {
    speak(text);
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSave = async () => {
    if (!user?.tenantId || !landId) {
      toast({
        title: 'Error',
        description: 'Session or land information missing',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Use the lands API to update which will inject tenant_id and farmer_id server-side
      await landsApi.updateLand(landId, {
        name: formData.name,
        survey_number: formData.survey_no,
        ownership_type: formData.ownership_type,
        area_acres: area.acres,
        area_guntas: area.guntha,
        soil_type: formData.soil_type,
        water_source: formData.water_source,
        irrigation_type: formData.irrigation_type,
        current_crop: formData.current_crop,
        previous_crop: existingData?.previous_crop,
        cultivation_date: formData.planting_date,
        last_harvest_date: formData.expected_harvest_date,
        state: formData.state,
        district: formData.district,
        taluka: formData.taluka,
        village: formData.village,
        boundary_polygon_old: {
          type: 'Polygon',
          coordinates: [boundary.map(p => [p.lng, p.lat]).concat([[boundary[0].lng, boundary[0].lat]])]
        },
        center_point_old: {
          type: 'Point',
          coordinates: [
            boundary.reduce((sum, p) => sum + p.lng, 0) / boundary.length,
            boundary.reduce((sum, p) => sum + p.lat, 0) / boundary.length
          ]
        },
        boundary_method: 'google_maps',
        gps_accuracy_meters: 10,
        gps_recorded_at: new Date().toISOString()
      });

      toast({
        title: 'Success',
        description: 'Land updated successfully',
      });

      onComplete();
    } catch (error) {
      console.error('Error updating land:', error);
      toast({
        title: 'Error',
        description: 'Failed to update land',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { title: 'Basic Details', icon: MapPin },
    { title: 'Location', icon: MapPin },
    { title: 'Land Characteristics', icon: Info },
    { title: 'Review', icon: Save },
  ];

  const soilTypes = [
    'Black Soil', 'Red Soil', 'Alluvial Soil', 'Clay Soil', 
    'Sandy Soil', 'Loamy Soil', 'Laterite Soil', 'Other'
  ];

  const waterSources = [
    'Well', 'Borewell', 'Canal', 'River', 'Pond', 
    'Rainwater', 'Dam', 'Other'
  ];

  const irrigationTypes = [
    'Drip', 'Sprinkler', 'Flood', 'Furrow', 
    'Surface', 'Subsurface', 'Manual', 'Other'
  ];

  const commonCrops = [
    'Wheat', 'Rice', 'Cotton', 'Sugarcane', 'Maize',
    'Soybean', 'Groundnut', 'Pulses', 'Vegetables', 'Fruits'
  ];

  const progressPercentage = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 bg-background z-50 overflow-y-auto">
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between mb-4">
                <CardTitle className="text-2xl font-bold">
                  Edit Land: {existingData?.name || 'Land Parcel'}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onCancel}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              {/* Progress Bar */}
              <div className="space-y-2">
                <Progress value={progressPercentage} className="h-2" />
                <div className="flex justify-between text-sm text-muted-foreground">
                  {steps.map((step, index) => (
                    <span
                      key={index}
                      className={index === currentStep ? 'text-primary font-semibold' : ''}
                    >
                      {step.title}
                    </span>
                  ))}
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Content */}
          <Card>
            <CardContent className="p-6">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {currentStep === 0 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Basic Land Information</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => playVoiceGuide('Enter basic land details')}
                      >
                        <Volume2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="name">Land Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          placeholder="e.g., North Field"
                          required
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="survey_no">Survey Number</Label>
                        <Input
                          id="survey_no"
                          value={formData.survey_no}
                          onChange={(e) => handleInputChange('survey_no', e.target.value)}
                          placeholder="e.g., 123/A"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="ownership_type">Ownership Type</Label>
                        <Select 
                          value={formData.ownership_type}
                          onValueChange={(value) => handleInputChange('ownership_type', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owned">Owned</SelectItem>
                            <SelectItem value="leased">Leased</SelectItem>
                            <SelectItem value="rented">Rented</SelectItem>
                            <SelectItem value="shared">Shared</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm font-medium">Area: {area.acres.toFixed(2)} acres</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {area.guntha.toFixed(2)} guntha | {area.sqft.toFixed(0)} sq ft
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Location Details</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => playVoiceGuide('Select your location details')}
                      >
                        <Volume2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="state">State</Label>
                        <Select 
                          value={formData.state}
                          onValueChange={(value) => handleInputChange('state', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select State" />
                          </SelectTrigger>
                          <SelectContent>
                            {states.map((state) => (
                              <SelectItem key={state.id} value={state.id}>
                                {state.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="district">District</Label>
                        <Select 
                          value={formData.district}
                          onValueChange={(value) => handleInputChange('district', value)}
                          disabled={!formData.state}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select District" />
                          </SelectTrigger>
                          <SelectContent>
                            {districts.map((district) => (
                              <SelectItem key={district.id} value={district.id}>
                                {district.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="taluka">Taluka</Label>
                        <Select 
                          value={formData.taluka}
                          onValueChange={(value) => handleInputChange('taluka', value)}
                          disabled={!formData.district}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Taluka" />
                          </SelectTrigger>
                          <SelectContent>
                            {talukas.map((taluka) => (
                              <SelectItem key={taluka.id} value={taluka.id}>
                                {taluka.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="village">Village</Label>
                        <Select 
                          value={formData.village}
                          onValueChange={(value) => handleInputChange('village', value)}
                          disabled={!formData.taluka}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Village" />
                          </SelectTrigger>
                          <SelectContent>
                            {villages.map((village) => (
                              <SelectItem key={village.id} value={village.id}>
                                {village.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Land Characteristics</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => playVoiceGuide('Select land characteristics')}
                      >
                        <Volume2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="soil_type">Soil Type</Label>
                        <Select 
                          value={formData.soil_type}
                          onValueChange={(value) => handleInputChange('soil_type', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Soil Type" />
                          </SelectTrigger>
                          <SelectContent>
                            {soilTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="water_source">Water Source</Label>
                        <Select 
                          value={formData.water_source}
                          onValueChange={(value) => handleInputChange('water_source', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Water Source" />
                          </SelectTrigger>
                          <SelectContent>
                            {waterSources.map((source) => (
                              <SelectItem key={source} value={source}>
                                {source}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="irrigation_type">Irrigation Type</Label>
                        <Select 
                          value={formData.irrigation_type}
                          onValueChange={(value) => handleInputChange('irrigation_type', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Irrigation Type" />
                          </SelectTrigger>
                          <SelectContent>
                            {irrigationTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="current_crop">Current Crop</Label>
                        <Select 
                          value={formData.current_crop}
                          onValueChange={(value) => handleInputChange('current_crop', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Current Crop" />
                          </SelectTrigger>
                          <SelectContent>
                            {commonCrops.map((crop) => (
                              <SelectItem key={crop} value={crop}>
                                {crop}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold mb-4">Review Land Information</h3>
                    
                    <div className="space-y-4">
                      <Card>
                        <CardContent className="pt-6">
                          <h4 className="font-semibold mb-3">Basic Details</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <span className="text-muted-foreground">Name:</span>
                            <span>{formData.name}</span>
                            <span className="text-muted-foreground">Survey No:</span>
                            <span>{formData.survey_no || 'N/A'}</span>
                            <span className="text-muted-foreground">Ownership:</span>
                            <span>{formData.ownership_type}</span>
                            <span className="text-muted-foreground">Area:</span>
                            <span>{area.acres.toFixed(2)} acres</span>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="pt-6">
                          <h4 className="font-semibold mb-3">Location</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <span className="text-muted-foreground">State:</span>
                            <span>{states.find(s => s.id === formData.state)?.name || 'N/A'}</span>
                            <span className="text-muted-foreground">District:</span>
                            <span>{districts.find(d => d.id === formData.district)?.name || 'N/A'}</span>
                            <span className="text-muted-foreground">Taluka:</span>
                            <span>{talukas.find(t => t.id === formData.taluka)?.name || 'N/A'}</span>
                            <span className="text-muted-foreground">Village:</span>
                            <span>{villages.find(v => v.id === formData.village)?.name || 'N/A'}</span>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="pt-6">
                          <h4 className="font-semibold mb-3">Characteristics</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <span className="text-muted-foreground">Soil Type:</span>
                            <span>{formData.soil_type || 'N/A'}</span>
                            <span className="text-muted-foreground">Water Source:</span>
                            <span>{formData.water_source || 'N/A'}</span>
                            <span className="text-muted-foreground">Irrigation:</span>
                            <span>{formData.irrigation_type || 'N/A'}</span>
                            <span className="text-muted-foreground">Current Crop:</span>
                            <span>{formData.current_crop || 'N/A'}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Navigation */}
              <div className="flex justify-between mt-8">
                <Button
                  variant="outline"
                  onClick={currentStep === 0 ? onCancel : prevStep}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  {currentStep === 0 ? 'Cancel' : 'Previous'}
                </Button>
                
                {currentStep === steps.length - 1 ? (
                  <Button
                    onClick={handleSave}
                    disabled={isLoading || !formData.name}
                  >
                    {isLoading ? (
                      <>
                        <Save className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Update Land
                      </>
                    )}
                  </Button>
                ) : (
                  <Button onClick={nextStep}>
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}