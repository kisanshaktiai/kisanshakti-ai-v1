import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, 
  ChevronLeft, 
  Home, 
  MapPin, 
  Sprout, 
  Save,
  Volume2,
  Check,
  AlertCircle,
  TreePine,
  Droplets,
  Calendar,
  Wheat
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { cn } from '@/lib/utils';
import { CropSelectorModal } from '@/components/crops/CropSelectorModal';

interface LandFormData {
  // Basic Info
  name: string;
  survey_number: string;
  ownership_type: 'owned' | 'leased' | 'shared';
  
  // Location
  state_id: string;
  state: string;
  district_id: string;
  district: string;
  taluka_id: string;
  taluka: string;
  village_id: string;
  village: string;
  
  // Land Details
  soil_type: string;
  water_source: string;
  irrigation_type: string;
  current_crop: string;
  previous_crop: string;
  cultivation_date: string;
  last_harvest_date: string;
  
  // Boundary & Area (from map)
  boundary: Array<{lat: number; lng: number}>;
  area_acres: number;
  area_guntas: number;
  area_sqft: number;
}

interface ModernLandWizardProps {
  boundary: Array<{lat: number; lng: number}>;
  area: {
    sqft: number;
    guntha: number;
    acres: number;
  };
  onComplete: () => void;
  onCancel: () => void;
}

const initialFormData: LandFormData = {
  name: '',
  survey_number: '',
  ownership_type: 'owned',
  state_id: '',
  state: '',
  district_id: '',
  district: '',
  taluka_id: '',
  taluka: '',
  village_id: '',
  village: '',
  soil_type: '',
  water_source: '',
  irrigation_type: '',
  current_crop: '',
  previous_crop: '',
  cultivation_date: '',
  last_harvest_date: '',
  boundary: [],
  area_acres: 0,
  area_guntas: 0,
  area_sqft: 0,
};

export function ModernLandWizard({ boundary, area, onComplete, onCancel }: ModernLandWizardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { speak } = useTextToSpeech();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<LandFormData>({
    ...initialFormData,
    boundary,
    area_acres: area.acres,
    area_guntas: area.guntha,
    area_sqft: area.sqft,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Location data
  const [states, setStates] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [talukas, setTalukas] = useState<any[]>([]);
  const [villages, setVillages] = useState<any[]>([]);
  
  // Crop selector modals
  const [showCurrentCropModal, setShowCurrentCropModal] = useState(false);
  const [showPreviousCropModal, setShowPreviousCropModal] = useState(false);
  const [currentCropId, setCurrentCropId] = useState('');
  const [previousCropId, setPreviousCropId] = useState('');

  // Auto-save draft to localStorage
  useEffect(() => {
    const draft = localStorage.getItem('landFormDraft');
    if (draft) {
      const parsedDraft = JSON.parse(draft);
      setFormData({
        ...parsedDraft,
        boundary,
        area_acres: area.acres,
        area_guntas: area.guntha,
        area_sqft: area.sqft,
      });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('landFormDraft', JSON.stringify(formData));
  }, [formData]);

  // Load states
  useEffect(() => {
    const loadStates = async () => {
      const { data, error } = await supabase
        .from('states')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (data) setStates(data);
    };
    loadStates();
  }, []);

  // Load districts when state changes
  useEffect(() => {
    if (formData.state_id) {
      const loadDistricts = async () => {
        const { data } = await supabase
          .from('districts')
          .select('*')
          .eq('state_id', formData.state_id)
          .eq('is_active', true)
          .order('name');
        
        if (data) setDistricts(data);
      };
      loadDistricts();
    }
  }, [formData.state_id]);

  // Load talukas when district changes
  useEffect(() => {
    if (formData.district_id) {
      const loadTalukas = async () => {
        const { data } = await supabase
          .from('talukas')
          .select('*')
          .eq('district_id', formData.district_id)
          .eq('is_active', true)
          .order('name');
        
        if (data) setTalukas(data);
      };
      loadTalukas();
    }
  }, [formData.district_id]);

  // Load villages when taluka changes
  useEffect(() => {
    if (formData.taluka_id) {
      const loadVillages = async () => {
        const { data } = await supabase
          .from('villages')
          .select('*')
          .eq('taluka_id', formData.taluka_id)
          .eq('is_active', true)
          .order('name');
        
        if (data) setVillages(data);
      };
      loadVillages();
    }
  }, [formData.taluka_id]);

  const handleInputChange = (field: keyof LandFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const playVoiceGuide = (message: string) => {
    speak(message);
  };

  const nextStep = () => {
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleCurrentCropSelect = (cropId: string, cropName: string) => {
    setCurrentCropId(cropId);
    handleInputChange('current_crop', cropName);
    setShowCurrentCropModal(false);
  };

  const handlePreviousCropSelect = (cropId: string, cropName: string) => {
    setPreviousCropId(cropId);
    handleInputChange('previous_crop', cropName);
    setShowPreviousCropModal(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      const response = await supabase.functions.invoke('lands-api', {
        body: {
          action: 'create',
          ...formData,
          farmer_id: user?.id,
          tenant_id: user?.tenantId,
        },
      });

      if (response.error) throw response.error;

      toast({
        title: "✅ Success",
        description: "Your land has been saved successfully!",
      });

      // Clear draft
      localStorage.removeItem('landFormDraft');
      
      onComplete();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save land",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const steps = [
    { number: 1, title: 'Basic Info', icon: Home },
    { number: 2, title: 'Location', icon: MapPin },
    { number: 3, title: 'Land Details', icon: Sprout },
    { number: 4, title: 'Review & Save', icon: Save },
  ];

  const soilTypes = [
    { value: 'alluvial', label: 'Alluvial' },
    { value: 'black', label: 'Black (Regur)' },
    { value: 'red', label: 'Red' },
    { value: 'laterite', label: 'Laterite' },
    { value: 'desert', label: 'Desert' },
    { value: 'mountain', label: 'Mountain' },
  ];

  const waterSources = [
    { value: 'well', label: 'Well' },
    { value: 'borewell', label: 'Borewell' },
    { value: 'canal', label: 'Canal' },
    { value: 'river', label: 'River' },
    { value: 'rain', label: 'Rain-fed' },
    { value: 'tank', label: 'Tank' },
  ];

  const irrigationTypes = [
    { value: 'drip', label: 'Drip' },
    { value: 'sprinkler', label: 'Sprinkler' },
    { value: 'flood', label: 'Flood' },
    { value: 'furrow', label: 'Furrow' },
    { value: 'manual', label: 'Manual' },
    { value: 'none', label: 'None' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      {/* Progress Bar */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-4">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center flex-1">
              <div className={cn(
                "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300",
                currentStep >= step.number 
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" 
                  : "bg-muted text-muted-foreground"
              )}>
                <step.icon className="w-5 h-5" />
              </div>
              {index < steps.length - 1 && (
                <div className={cn(
                  "flex-1 h-1 mx-2 transition-all duration-500",
                  currentStep > step.number ? "bg-primary" : "bg-muted"
                )} />
              )}
            </div>
          ))}
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground">
            Step {currentStep} of 4: {steps[currentStep - 1].title}
          </h2>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto">
        <Card className="backdrop-blur-md bg-card/95 border-border/50 shadow-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="p-6"
            >
              {/* Step 1: Basic Info */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Home className="w-5 h-5 text-primary" />
                      Basic Information
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => playVoiceGuide('Enter your land name, survey number, and ownership type')}
                      className="gap-2"
                    >
                      <Volume2 className="w-4 h-4" />
                      Voice Guide
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name" className="text-base mb-2 block">
                        Land Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="e.g., North Field"
                        className="h-12 text-base"
                      />
                    </div>

                    <div>
                      <Label htmlFor="survey_number" className="text-base mb-2 block">
                        Survey/Gat Number
                      </Label>
                      <Input
                        id="survey_number"
                        value={formData.survey_number}
                        onChange={(e) => handleInputChange('survey_number', e.target.value)}
                        placeholder="e.g., 123/A"
                        className="h-12 text-base"
                      />
                    </div>

                    <div>
                      <Label className="text-base mb-3 block">
                        Ownership Type <span className="text-destructive">*</span>
                      </Label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { value: 'owned', label: 'Owned', icon: '🏡' },
                          { value: 'leased', label: 'Leased', icon: '📝' },
                          { value: 'shared', label: 'Shared', icon: '🤝' },
                        ].map((type) => (
                          <Card
                            key={type.value}
                            className={cn(
                              "p-4 cursor-pointer transition-all duration-200 border-2",
                              formData.ownership_type === type.value
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50"
                            )}
                            onClick={() => handleInputChange('ownership_type', type.value as any)}
                          >
                            <div className="text-center">
                              <div className="text-2xl mb-2">{type.icon}</div>
                              <span className="text-sm font-medium">{type.label}</span>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Location */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-primary" />
                      Location Details
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => playVoiceGuide('Select your state, district, taluka, and village')}
                      className="gap-2"
                    >
                      <Volume2 className="w-4 h-4" />
                      Voice Guide
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-base mb-2 block">State</Label>
                      <Select
                        value={formData.state_id}
                        onValueChange={(value) => {
                          const state = states.find(s => s.id === value);
                          handleInputChange('state_id', value);
                          handleInputChange('state', state?.name || '');
                          // Reset dependent fields
                          handleInputChange('district_id', '');
                          handleInputChange('district', '');
                          handleInputChange('taluka_id', '');
                          handleInputChange('taluka', '');
                          handleInputChange('village_id', '');
                          handleInputChange('village', '');
                        }}
                      >
                        <SelectTrigger className="h-12 text-base">
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
                      <Label className="text-base mb-2 block">District</Label>
                      <Select
                        value={formData.district_id}
                        onValueChange={(value) => {
                          const district = districts.find(d => d.id === value);
                          handleInputChange('district_id', value);
                          handleInputChange('district', district?.name || '');
                          // Reset dependent fields
                          handleInputChange('taluka_id', '');
                          handleInputChange('taluka', '');
                          handleInputChange('village_id', '');
                          handleInputChange('village', '');
                        }}
                        disabled={!formData.state_id}
                      >
                        <SelectTrigger className="h-12 text-base">
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
                      <Label className="text-base mb-2 block">Taluka</Label>
                      <Select
                        value={formData.taluka_id}
                        onValueChange={(value) => {
                          const taluka = talukas.find(t => t.id === value);
                          handleInputChange('taluka_id', value);
                          handleInputChange('taluka', taluka?.name || '');
                          // Reset dependent fields
                          handleInputChange('village_id', '');
                          handleInputChange('village', '');
                        }}
                        disabled={!formData.district_id}
                      >
                        <SelectTrigger className="h-12 text-base">
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
                      <Label className="text-base mb-2 block">Village</Label>
                      <Select
                        value={formData.village_id}
                        onValueChange={(value) => {
                          const village = villages.find(v => v.id === value);
                          handleInputChange('village_id', value);
                          handleInputChange('village', village?.name || '');
                        }}
                        disabled={!formData.taluka_id}
                      >
                        <SelectTrigger className="h-12 text-base">
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

              {/* Step 3: Land Details */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Sprout className="w-5 h-5 text-primary" />
                      Land Characteristics
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => playVoiceGuide('Enter soil type, water source, crops, and dates')}
                      className="gap-2"
                    >
                      <Volume2 className="w-4 h-4" />
                      Voice Guide
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-base mb-2 block">Soil Type</Label>
                      <Select
                        value={formData.soil_type}
                        onValueChange={(value) => handleInputChange('soil_type', value)}
                      >
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder="Select Soil Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {soilTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-base mb-2 block">Water Source</Label>
                      <Select
                        value={formData.water_source}
                        onValueChange={(value) => handleInputChange('water_source', value)}
                      >
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder="Select Water Source" />
                        </SelectTrigger>
                        <SelectContent>
                          {waterSources.map((source) => (
                            <SelectItem key={source.value} value={source.value}>
                              {source.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-base mb-2 block">Irrigation Type</Label>
                      <Select
                        value={formData.irrigation_type}
                        onValueChange={(value) => handleInputChange('irrigation_type', value)}
                      >
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder="Select Irrigation" />
                        </SelectTrigger>
                        <SelectContent>
                          {irrigationTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-base mb-2 block">Current Crop</Label>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowCurrentCropModal(true)}
                        className="w-full h-12 text-base justify-start text-left font-normal"
                      >
                        {formData.current_crop ? (
                          <span className="flex items-center gap-2">
                            <Wheat className="w-4 h-4 text-primary" />
                            <span>{formData.current_crop}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Select Current Crop</span>
                        )}
                      </Button>
                    </div>

                    <div>
                      <Label className="text-base mb-2 block">Previous Crop</Label>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowPreviousCropModal(true)}
                        className="w-full h-12 text-base justify-start text-left font-normal"
                      >
                        {formData.previous_crop ? (
                          <span className="flex items-center gap-2">
                            <TreePine className="w-4 h-4 text-muted-foreground" />
                            <span>{formData.previous_crop}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Select Previous Crop</span>
                        )}
                      </Button>
                    </div>

                    <div>
                      <Label htmlFor="cultivation_date" className="text-base mb-2 block">
                        Cultivation Date
                      </Label>
                      <Input
                        id="cultivation_date"
                        type="date"
                        value={formData.cultivation_date}
                        onChange={(e) => handleInputChange('cultivation_date', e.target.value)}
                        className="h-12 text-base"
                      />
                    </div>

                    <div>
                      <Label htmlFor="last_harvest_date" className="text-base mb-2 block">
                        Last Harvest Date
                      </Label>
                      <Input
                        id="last_harvest_date"
                        type="date"
                        value={formData.last_harvest_date}
                        onChange={(e) => handleInputChange('last_harvest_date', e.target.value)}
                        className="h-12 text-base"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Review & Save */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Save className="w-5 h-5 text-primary" />
                      Review & Save
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => playVoiceGuide('Review your land details and save')}
                      className="gap-2"
                    >
                      <Volume2 className="w-4 h-4" />
                      Voice Guide
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {/* Area Information */}
                    <Card className="p-4 bg-primary/5 border-primary/20">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Land Area
                      </h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Acres</p>
                          <p className="text-lg font-bold">{area.acres.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Guntha</p>
                          <p className="text-lg font-bold">{area.guntha.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Sq.ft</p>
                          <p className="text-lg font-bold">{area.sqft.toLocaleString()}</p>
                        </div>
                      </div>
                    </Card>

                    {/* Basic Info Review */}
                    <Card className="p-4">
                      <h4 className="font-semibold mb-3">Basic Information</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Name:</span>
                          <span className="font-medium">{formData.name || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Survey Number:</span>
                          <span className="font-medium">{formData.survey_number || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ownership:</span>
                          <span className="font-medium capitalize">{formData.ownership_type}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Location Review */}
                    <Card className="p-4">
                      <h4 className="font-semibold mb-3">Location</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">State:</span>
                          <span className="font-medium">{formData.state || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">District:</span>
                          <span className="font-medium">{formData.district || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Taluka:</span>
                          <span className="font-medium">{formData.taluka || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Village:</span>
                          <span className="font-medium">{formData.village || '-'}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Land Details Review */}
                    <Card className="p-4">
                      <h4 className="font-semibold mb-3">Land Details</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Soil Type:</span>
                          <span className="font-medium capitalize">{formData.soil_type || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Water Source:</span>
                          <span className="font-medium capitalize">{formData.water_source || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current Crop:</span>
                          <span className="font-medium capitalize">{formData.current_crop || '-'}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Boundary Points */}
                    <Card className="p-4 bg-secondary/5 border-secondary/20">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Boundary Points
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {boundary.length} points captured from map
                      </p>
                    </Card>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation Buttons */}
          <div className="px-6 pb-6 flex justify-between items-center">
            <Button
              variant="outline"
              onClick={currentStep === 1 ? onCancel : prevStep}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              {currentStep === 1 ? 'Cancel' : 'Previous'}
            </Button>

            {currentStep < 4 ? (
              <Button
                onClick={nextStep}
                className="gap-2"
                disabled={
                  (currentStep === 1 && !formData.name) ||
                  (currentStep === 2 && (!formData.state || !formData.district))
                }
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="gap-2 bg-success hover:bg-success/90"
              >
                {isSaving ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Land
                  </>
                )}
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Crop Selector Modals */}
      <CropSelectorModal
        open={showCurrentCropModal}
        onClose={() => setShowCurrentCropModal(false)}
        onSelect={handleCurrentCropSelect}
        selectedCropId={currentCropId}
        title="Select Current Crop"
        description="Choose the crop currently growing on this land"
      />

      <CropSelectorModal
        open={showPreviousCropModal}
        onClose={() => setShowPreviousCropModal(false)}
        onSelect={handlePreviousCropSelect}
        selectedCropId={previousCropId}
        title="Select Previous Crop"
        description="Choose the crop that was previously grown on this land"
      />
    </div>
  );
}