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
import { landsApi } from '@/services/landsApi';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { cn } from '@/lib/utils';
import { CropSelectionCard } from '@/components/land/CropSelectionCard';

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
  
  // Crop selection state
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
  };

  const handlePreviousCropSelect = (cropId: string, cropName: string) => {
    setPreviousCropId(cropId);
    handleInputChange('previous_crop', cropName);
  };

  const handleSave = async () => {
    // Validate required fields
    if (!formData.name?.trim()) {
      toast({
        title: t('lands.wizard.toast.validation_title'),
        description: t('lands.wizard.toast.name_required'),
        variant: "destructive",
      });
      return;
    }

    if (!area.acres || area.acres <= 0) {
      toast({
        title: t('lands.wizard.toast.validation_title'),
        description: t('lands.wizard.toast.boundary_required'),
        variant: "destructive",
      });
      return;
    }

    // Check network connectivity
    if (!navigator.onLine) {
      toast({
        title: t('lands.wizard.toast.offline_title'),
        description: t('lands.wizard.toast.offline_message'),
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    
    try {
      // Build proper GeoJSON polygon from boundary points
      const boundaryGeoJSON = boundary.length >= 3 ? {
        type: 'Polygon',
        coordinates: [[
          ...boundary.map(p => [p.lng, p.lat]),
          [boundary[0].lng, boundary[0].lat]
        ]]
      } : null;
      
      // Calculate center point from boundary
      const centerGeoJSON = boundary.length >= 3 ? {
        type: 'Point',
        coordinates: [
          boundary.reduce((sum, p) => sum + p.lng, 0) / boundary.length,
          boundary.reduce((sum, p) => sum + p.lat, 0) / boundary.length
        ]
      } : null;

      console.log('📍 [ModernLandWizard] Saving land:', {
        name: formData.name,
        area_acres: area.acres,
        boundaryPoints: boundary.length
      });

      // Use landsApi with timeout handling
      const savePromise = landsApi.createLand({
        name: formData.name,
        survey_number: formData.survey_number || undefined,
        ownership_type: formData.ownership_type,
        area_acres: area.acres,
        area_guntas: area.guntha,
        area_sqft: area.sqft,
        state: formData.state || undefined,
        district: formData.district || undefined,
        taluka: formData.taluka || undefined,
        village: formData.village || undefined,
        soil_type: normalizeSoilType(formData.soil_type) || undefined,
        water_source: formData.water_source || undefined,
        irrigation_type: formData.irrigation_type || undefined,
        current_crop: formData.current_crop || undefined,
        previous_crop: formData.previous_crop || undefined,
        cultivation_date: formData.cultivation_date || undefined,
        last_harvest_date: formData.last_harvest_date || undefined,
        boundary_polygon_old: boundaryGeoJSON,
        center_point_old: centerGeoJSON,
        boundary_method: 'gps_points',
        gps_accuracy_meters: 10,
        gps_recorded_at: new Date().toISOString()
      });

      // Add timeout to prevent indefinite waiting
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), 30000)
      );

      await Promise.race([savePromise, timeoutPromise]);

      toast({
        title: t('lands.wizard.toast.success_title'),
        description: t('lands.wizard.toast.success_message'),
      });

      // Clear draft
      localStorage.removeItem('landFormDraft');
      
      onComplete();
    } catch (error: any) {
      console.error('❌ [ModernLandWizard] Save error:', error);
      
      let errorMessage = t('lands.wizard.toast.error_generic');
      
      if (error.message?.includes('timeout')) {
        errorMessage = t('lands.wizard.toast.error_timeout');
      } else if (error.message?.includes('logged in')) {
        errorMessage = t('lands.wizard.toast.error_session');
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: t('lands.wizard.toast.error_title'),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const steps = [
    { number: 1, title: t('lands.wizard.steps.basic_info'), icon: Home },
    { number: 2, title: t('lands.wizard.steps.location'), icon: MapPin },
    { number: 3, title: t('lands.wizard.steps.land_details'), icon: Sprout },
    { number: 4, title: t('lands.wizard.steps.review_save'), icon: Save },
  ];

  const soilTypes = [
    { value: 'alluvial', label: t('lands.wizard.soil_types.alluvial') },
    { value: 'black', label: t('lands.wizard.soil_types.black') },
    { value: 'red', label: t('lands.wizard.soil_types.red') },
    { value: 'laterite', label: t('lands.wizard.soil_types.laterite') },
    { value: 'desert', label: t('lands.wizard.soil_types.desert') },
    { value: 'mountain', label: t('lands.wizard.soil_types.mountain') },
  ];

  const waterSources = [
    { value: 'well', label: t('lands.wizard.water_sources.well') },
    { value: 'borewell', label: t('lands.wizard.water_sources.borewell') },
    { value: 'canal', label: t('lands.wizard.water_sources.canal') },
    { value: 'river', label: t('lands.wizard.water_sources.river') },
    { value: 'rain', label: t('lands.wizard.water_sources.rain') },
    { value: 'tank', label: t('lands.wizard.water_sources.tank') },
  ];

  const irrigationTypes = [
    { value: 'drip', label: t('lands.wizard.irrigation_types.drip') },
    { value: 'sprinkler', label: t('lands.wizard.irrigation_types.sprinkler') },
    { value: 'flood', label: t('lands.wizard.irrigation_types.flood') },
    { value: 'furrow', label: t('lands.wizard.irrigation_types.furrow') },
    { value: 'manual', label: t('lands.wizard.irrigation_types.manual') },
    { value: 'none', label: t('lands.wizard.irrigation_types.none') },
  ];

  return (
    <div className="min-h-full bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4 pb-24">
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
            {t('lands.wizard.step_of_total', { current: currentStep, total: 4, title: steps[currentStep - 1].title })}
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
                      {t('lands.wizard.sections.basic_info')}
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => playVoiceGuide(t('lands.wizard.voice_guides.basic_info'))}
                      className="gap-2"
                    >
                      <Volume2 className="w-4 h-4" />
                      {t('lands.wizard.voice_guide')}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name" className="text-base mb-2 block">
                        {t('lands.wizard.fields.land_name')} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder={t('lands.wizard.fields.land_name_placeholder')}
                        className="h-12 text-base"
                      />
                    </div>

                    <div>
                      <Label htmlFor="survey_number" className="text-base mb-2 block">
                        {t('lands.wizard.fields.survey_number')}
                      </Label>
                      <Input
                        id="survey_number"
                        value={formData.survey_number}
                        onChange={(e) => handleInputChange('survey_number', e.target.value)}
                        placeholder={t('lands.wizard.fields.survey_placeholder')}
                        className="h-12 text-base"
                      />
                    </div>

                    <div>
                      <Label className="text-base mb-3 block">
                        {t('lands.wizard.ownership.label')} <span className="text-destructive">*</span>
                      </Label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { value: 'owned', label: t('lands.wizard.ownership.owned'), icon: '🏡' },
                          { value: 'leased', label: t('lands.wizard.ownership.leased'), icon: '📝' },
                          { value: 'shared', label: t('lands.wizard.ownership.shared'), icon: '🤝' },
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
                      {t('lands.wizard.sections.location')}
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => playVoiceGuide(t('lands.wizard.voice_guides.location'))}
                      className="gap-2"
                    >
                      <Volume2 className="w-4 h-4" />
                      {t('lands.wizard.voice_guide')}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-base mb-2 block">{t('lands.wizard.sections.state')}</Label>
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
                          <SelectValue placeholder={t('lands.wizard.placeholders.select_state')} />
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
                      <Label className="text-base mb-2 block">{t('lands.wizard.sections.district')}</Label>
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
                          <SelectValue placeholder={t('lands.wizard.placeholders.select_district')} />
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
                      <Label className="text-base mb-2 block">{t('lands.wizard.sections.taluka')}</Label>
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
                          <SelectValue placeholder={t('lands.wizard.placeholders.select_taluka')} />
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
                      <Label className="text-base mb-2 block">{t('lands.wizard.sections.village')}</Label>
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
                          <SelectValue placeholder={t('lands.wizard.placeholders.select_village')} />
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
                      {t('lands.wizard.sections.land_details')}
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => playVoiceGuide(t('lands.wizard.voice_guides.land_details'))}
                      className="gap-2"
                    >
                      <Volume2 className="w-4 h-4" />
                      {t('lands.wizard.voice_guide')}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-base mb-2 block">{t('lands.wizard.sections.soil_type')}</Label>
                      <Select
                        value={formData.soil_type}
                        onValueChange={(value) => handleInputChange('soil_type', value)}
                      >
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder={t('lands.wizard.placeholders.select_soil')} />
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
                      <Label className="text-base mb-2 block">{t('lands.wizard.sections.water_source')}</Label>
                      <Select
                        value={formData.water_source}
                        onValueChange={(value) => handleInputChange('water_source', value)}
                      >
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder={t('lands.wizard.placeholders.select_water')} />
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
                      <Label className="text-base mb-2 block">{t('lands.wizard.sections.irrigation_type')}</Label>
                      <Select
                        value={formData.irrigation_type}
                        onValueChange={(value) => handleInputChange('irrigation_type', value)}
                      >
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder={t('lands.wizard.placeholders.select_irrigation')} />
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

                    {/* Modern Crop Selection Cards */}
                    <div className="col-span-1 md:col-span-2 space-y-4">
                      <Label className="text-base font-semibold block text-foreground/90">
                        {t('lands.wizard.crop_selection')}
                      </Label>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <CropSelectionCard
                          label={t('lands.wizard.current_crop')}
                          value={formData.current_crop}
                          cropId={currentCropId}
                          onSelect={handleCurrentCropSelect}
                          variant="current"
                        />
                        
                        <CropSelectionCard
                          label={t('lands.wizard.previous_crop')}
                          value={formData.previous_crop}
                          cropId={previousCropId}
                          onSelect={handlePreviousCropSelect}
                          variant="previous"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="cultivation_date" className="text-base mb-2 block">
                        {t('lands.wizard.fields.cultivation_date')}
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
                        {t('lands.wizard.fields.last_harvest_date')}
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
                      {t('lands.wizard.sections.review')}
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => playVoiceGuide(t('lands.wizard.voice_guides.review'))}
                      className="gap-2"
                    >
                      <Volume2 className="w-4 h-4" />
                      {t('lands.wizard.voice_guide')}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {/* Area Information */}
                    <Card className="p-4 bg-primary/5 border-primary/20">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {t('lands.wizard.review.land_area')}
                      </h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">{t('lands.wizard.review_labels.acres')}</p>
                          <p className="text-lg font-bold">{area.acres.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('lands.wizard.review_labels.guntha')}</p>
                          <p className="text-lg font-bold">{area.guntha.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('lands.wizard.review_labels.sqft')}</p>
                          <p className="text-lg font-bold">{area.sqft.toLocaleString()}</p>
                        </div>
                      </div>
                    </Card>

                    {/* Basic Info Review */}
                    <Card className="p-4">
                      <h4 className="font-semibold mb-3">{t('lands.wizard.review.basic_info')}</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('lands.wizard.review_labels.name')}:</span>
                          <span className="font-medium">{formData.name || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('lands.wizard.review_labels.survey_number')}:</span>
                          <span className="font-medium">{formData.survey_number || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('lands.wizard.review_labels.ownership')}:</span>
                          <span className="font-medium">{t(`lands.wizard.ownership.${formData.ownership_type}`)}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Location Review */}
                    <Card className="p-4">
                      <h4 className="font-semibold mb-3">{t('lands.wizard.review.location')}</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('lands.wizard.review_labels.state')}:</span>
                          <span className="font-medium">{formData.state || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('lands.wizard.review_labels.district')}:</span>
                          <span className="font-medium">{formData.district || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('lands.wizard.review_labels.taluka')}:</span>
                          <span className="font-medium">{formData.taluka || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('lands.wizard.review_labels.village')}:</span>
                          <span className="font-medium">{formData.village || '-'}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Land Details Review */}
                    <Card className="p-4">
                      <h4 className="font-semibold mb-3">{t('lands.wizard.review.land_details')}</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('lands.wizard.review_labels.soil_type')}:</span>
                          <span className="font-medium">{formData.soil_type ? t(`lands.wizard.soil_types.${formData.soil_type}`) : '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('lands.wizard.review_labels.water_source')}:</span>
                          <span className="font-medium">{formData.water_source ? t(`lands.wizard.water_sources.${formData.water_source}`) : '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('lands.wizard.review_labels.current_crop')}:</span>
                          <span className="font-medium">{formData.current_crop || '-'}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Boundary Points */}
                    <Card className="p-4 bg-secondary/5 border-secondary/20">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {t('lands.wizard.review.boundary_points')}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {t('lands.wizard.review.points_captured', { count: boundary.length })}
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
              {currentStep === 1 ? t('lands.wizard.buttons.cancel') : t('lands.wizard.buttons.previous')}
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
                {t('lands.wizard.buttons.next')}
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="gap-2 bg-success hover:bg-success/90"
              >
                {isSaving ? (
                  <>{t('lands.wizard.buttons.saving')}</>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {t('lands.wizard.buttons.save_land')}
                  </>
                )}
              </Button>
            )}
          </div>
        </Card>
      </div>

    </div>
  );
}