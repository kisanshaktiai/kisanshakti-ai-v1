import { useState, useEffect, useMemo } from 'react';
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
  X,
  Mountain,
  Droplets,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { landsApi } from '@/services/landsApi';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { cn } from '@/lib/utils';
import { CropSelectionCard } from '@/components/land/CropSelectionCard';
import { useLocalizedRef, cols } from '@/lib/i18nRef';

interface LatLng { lat: number; lng: number; }

interface EditLandWizardProps {
  landId: string;
  boundary: LatLng[];
  area: { sqft: number; guntha: number; acres: number; };
  existingData: any;
  onComplete: () => void;
  onCancel: () => void;
}

const OWNERSHIP_TYPES = [
  { value: 'owned', icon: '🏡', tKey: 'lands.wizard.ownership.owned' },
  { value: 'leased', icon: '📝', tKey: 'lands.wizard.ownership.leased' },
  { value: 'shared', icon: '🤝', tKey: 'lands.wizard.ownership.shared' },
  { value: 'contract', icon: '📑', tKey: 'lands.wizard.ownership.contract' },
] as const;

const SOIL_ICONS: Record<string, string> = {
  alluvial: '🟫', black: '⚫', red: '🟥', laterite: '🟧',
  desert: '🟨', mountain: '⛰️', clay: '🟤', sandy: '🏖️', loamy: '🌾',
};
const WATER_ICONS: Record<string, string> = {
  well: '🪣', borewell: '🕳️', canal: '🌊', river: '🏞️',
  rain: '🌧️', rainfed: '🌧️', tank: '🛢️', pond: '💧', dam: '🏞️',
};
const IRRIGATION_ICONS: Record<string, string> = {
  drip: '💧', sprinkler: '🚿', flood: '🌊', furrow: '〰️',
  manual: '👐', surface: '🌫️', subsurface: '🌱', mixed: '🔀',
  rainfed: '🌧️', none: '🚫',
};

function useRefList(table: 'soil_types' | 'water_sources' | 'irrigation_types') {
  return useQuery({
    queryKey: ['ref', table, 'edit-wizard'],
    queryFn: async () => {
      const { data } = await supabase
        .from(table)
        .select(cols('label', 'id', 'value', 'description'))
        .eq('is_active', true)
        .order('label');
      return data || [];
    },
    staleTime: 1000 * 60 * 60,
  });
}

export function EditLandWizard({
  landId, boundary, area, existingData, onComplete, onCancel,
}: EditLandWizardProps) {
  const { t } = useTranslation();
  const tRef = useLocalizedRef();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { speak } = useTextToSpeech();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: existingData?.name || '',
    survey_number: existingData?.survey_number || '',
    ownership_type: (existingData?.ownership_type || 'owned') as string,
    state_id: '',
    state: existingData?.state || '',
    district_id: '',
    district: existingData?.district || '',
    taluka_id: '',
    taluka: existingData?.taluka || '',
    village_id: '',
    village: existingData?.village || '',
    soil_type: existingData?.soil_type || '',
    water_source: existingData?.water_source || '',
    irrigation_type: existingData?.irrigation_type || '',
    current_crop: existingData?.current_crop || '',
    previous_crop: existingData?.previous_crop || '',
    cultivation_date: existingData?.planting_date || existingData?.cultivation_date || '',
    last_harvest_date: existingData?.expected_harvest_date || existingData?.last_harvest_date || '',
  });

  const handleChange = (field: string, value: any) =>
    setFormData((p) => ({ ...p, [field]: value }));

  // Location cascading data
  const [states, setStates] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [talukas, setTalukas] = useState<any[]>([]);
  const [villages, setVillages] = useState<any[]>([]);

  // Ref tables (DB-driven tiny cards)
  const soilQ = useRefList('soil_types');
  const waterQ = useRefList('water_sources');
  const irrigationQ = useRefList('irrigation_types');

  // Load states + resolve existing name → id chain
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('states').select('id,name').order('name');
      const list = data || [];
      setStates(list);
      if (existingData?.state) {
        const match = list.find((s: any) =>
          s.name?.toLowerCase() === String(existingData.state).toLowerCase() ||
          s.id === existingData.state
        );
        if (match) handleChange('state_id', match.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!formData.state_id) return;
    (async () => {
      const { data } = await supabase
        .from('districts').select('id,name')
        .eq('state_id', formData.state_id).order('name');
      const list = data || [];
      setDistricts(list);
      if (existingData?.district && !formData.district_id) {
        const match = list.find((d: any) =>
          d.name?.toLowerCase() === String(existingData.district).toLowerCase() ||
          d.id === existingData.district
        );
        if (match) handleChange('district_id', match.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.state_id]);

  useEffect(() => {
    if (!formData.district_id) return;
    (async () => {
      const { data } = await supabase
        .from('talukas').select('id,name')
        .eq('district_id', formData.district_id).order('name');
      const list = data || [];
      setTalukas(list);
      if (existingData?.taluka && !formData.taluka_id) {
        const match = list.find((tk: any) =>
          tk.name?.toLowerCase() === String(existingData.taluka).toLowerCase() ||
          tk.id === existingData.taluka
        );
        if (match) handleChange('taluka_id', match.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.district_id]);

  useEffect(() => {
    if (!formData.taluka_id) return;
    (async () => {
      const { data } = await supabase
        .from('villages').select('id,name')
        .eq('taluka_id', formData.taluka_id).order('name');
      const list = data || [];
      setVillages(list);
      if (existingData?.village && !formData.village_id) {
        const match = list.find((v: any) =>
          v.name?.toLowerCase() === String(existingData.village).toLowerCase() ||
          v.id === existingData.village
        );
        if (match) handleChange('village_id', match.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.taluka_id]);

  const playVoice = (msg: string) => speak(msg);
  const next = () => currentStep < 4 && setCurrentStep(currentStep + 1);
  const prev = () => currentStep > 1 && setCurrentStep(currentStep - 1);

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      toast({
        title: t('lands.wizard.toast.validation_title'),
        description: t('lands.wizard.toast.name_required'),
        variant: 'destructive',
      });
      return;
    }
    if (!user?.tenantId) {
      toast({
        title: t('lands.wizard.toast.error_title'),
        description: t('lands.edit.toast.session_error'),
        variant: 'destructive',
      });
      return;
    }
    setIsSaving(true);
    try {
      const boundaryGeoJSON = boundary.length >= 3 ? {
        type: 'Polygon',
        coordinates: [[
          ...boundary.map((p) => [p.lng, p.lat]),
          [boundary[0].lng, boundary[0].lat],
        ]],
      } : null;
      const centerGeoJSON = boundary.length >= 3 ? {
        type: 'Point',
        coordinates: [
          boundary.reduce((s, p) => s + p.lng, 0) / boundary.length,
          boundary.reduce((s, p) => s + p.lat, 0) / boundary.length,
        ],
      } : null;

      await landsApi.updateLand(landId, {
        name: formData.name,
        survey_number: formData.survey_number || undefined,
        ownership_type: formData.ownership_type,
        area_acres: area.acres,
        area_guntas: area.guntha,
        soil_type: formData.soil_type || undefined,
        water_source: formData.water_source || undefined,
        irrigation_type: formData.irrigation_type || undefined,
        current_crop: formData.current_crop || undefined,
        previous_crop: formData.previous_crop || undefined,
        cultivation_date: formData.cultivation_date || undefined,
        last_harvest_date: formData.last_harvest_date || undefined,
        state: formData.state || undefined,
        district: formData.district || undefined,
        taluka: formData.taluka || undefined,
        village: formData.village || undefined,
        boundary_polygon_old: boundaryGeoJSON,
        center_point_old: centerGeoJSON,
        boundary_method: 'gps_points',
        gps_accuracy_meters: 10,
        gps_recorded_at: new Date().toISOString(),
      } as any);

      toast({
        title: t('lands.wizard.toast.success_title'),
        description: t('lands.edit.toast.success'),
      });
      onComplete();
    } catch (err: any) {
      console.error('[EditLandWizard] save error', err);
      toast({
        title: t('lands.wizard.toast.error_title'),
        description: err?.message || t('lands.edit.toast.error'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const steps = useMemo(() => [
    { number: 1, title: t('lands.wizard.steps.basic_info'), icon: Home },
    { number: 2, title: t('lands.wizard.steps.location'), icon: MapPin },
    { number: 3, title: t('lands.wizard.steps.land_details'), icon: Sprout },
    { number: 4, title: t('lands.wizard.steps.review_save'), icon: Save },
  ], [t]);

  // ─────────────────────────────────────────────────────────────────────
  // Tiny-card chooser (DB-driven)
  // ─────────────────────────────────────────────────────────────────────
  const TinyCardGrid = ({
    items, value, onPick, iconMap, loading,
  }: {
    items: any[];
    value: string;
    onPick: (val: string) => void;
    iconMap: Record<string, string>;
    loading?: boolean;
  }) => {
    if (loading) {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((row: any) => {
          const val = row.value || row.id;
          const label = tRef(row, 'label') || row.label;
          const selected =
            value === val ||
            value?.toLowerCase() === String(row.value || '').toLowerCase() ||
            value?.toLowerCase() === String(row.label || '').toLowerCase();
          const icon = iconMap[String(row.value || '').toLowerCase()] || '•';
          return (
            <button
              type="button"
              key={row.id || val}
              onClick={() => onPick(val)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-3 text-center transition-all active:scale-95',
                selected
                  ? 'border-primary bg-primary/10 shadow-md shadow-primary/20'
                  : 'border-border bg-card hover:border-primary/40'
              )}
            >
              <span className="text-2xl leading-none">{icon}</span>
              <span className="text-xs font-medium leading-tight line-clamp-2">{label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  // Location list chooser — tiny cards built from DB rows
  const LocationGrid = ({
    items, valueId, onPick, baseField = 'name', emptyKey,
  }: {
    items: any[];
    valueId: string;
    onPick: (id: string, name: string) => void;
    baseField?: 'name' | 'label';
    emptyKey: string;
  }) => {
    if (!items.length) {
      return <p className="text-sm text-muted-foreground italic">{t(emptyKey)}</p>;
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
        {items.map((row: any) => {
          const label = tRef(row, baseField as any) || row[baseField];
          const selected = valueId === row.id;
          return (
            <button
              type="button"
              key={row.id}
              onClick={() => onPick(row.id, row.name || row.label)}
              className={cn(
                'rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all active:scale-95 text-left',
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/40'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overscroll-contain">
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold truncate">
              {t('lands.edit.title', { name: existingData?.name || '' })}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('lands.wizard.step_of_total', {
                current: currentStep, total: 4, title: steps[currentStep - 1].title,
              })}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} className="shrink-0">
            <X className="h-5 w-5" />
          </Button>
        </div>
        {/* Step Dots */}
        <div className="flex items-center gap-1 px-4 pb-3">
          {steps.map((s) => (
            <div
              key={s.number}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-all',
                currentStep >= s.number ? 'bg-primary' : 'bg-muted'
              )}
            />
          ))}
        </div>
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4 pb-32">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {/* STEP 1 — Basic Info */}
              {currentStep === 1 && (
                <section className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Home className="w-5 h-5 text-primary" />
                      {t('lands.wizard.sections.basic_info', { defaultValue: t('lands.edit.basic_land_info') })}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={() => playVoice(t('lands.wizard.voice_guides.basic_info', { defaultValue: '' }))}>
                      <Volume2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm mb-1.5 block">
                        {t('lands.wizard.fields.land_name')} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder={t('lands.wizard.fields.land_name_placeholder')}
                        className="h-12"
                      />
                    </div>

                    <div>
                      <Label className="text-sm mb-1.5 block">
                        {t('lands.wizard.fields.survey_number')}
                      </Label>
                      <Input
                        value={formData.survey_number}
                        onChange={(e) => handleChange('survey_number', e.target.value)}
                        placeholder={t('lands.wizard.fields.survey_placeholder')}
                        className="h-12"
                      />
                    </div>

                    <div>
                      <Label className="text-sm mb-2 block">
                        {t('lands.wizard.ownership.label')} <span className="text-destructive">*</span>
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        {OWNERSHIP_TYPES.map((o) => (
                          <button
                            type="button"
                            key={o.value}
                            onClick={() => handleChange('ownership_type', o.value)}
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all active:scale-95',
                              formData.ownership_type === o.value
                                ? 'border-primary bg-primary/10 shadow'
                                : 'border-border bg-card hover:border-primary/40'
                            )}
                          >
                            <span className="text-2xl">{o.icon}</span>
                            <span className="text-sm font-medium">{t(o.tKey)}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <Card className="p-3 bg-primary/5 border-primary/20">
                      <p className="text-xs text-muted-foreground mb-1">
                        {t('lands.wizard.review.land_area')}
                      </p>
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="text-2xl font-bold">{area.acres.toFixed(2)}</span>
                        <span className="text-sm text-muted-foreground">
                          {t('lands.wizard.review_labels.acres')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          • {area.guntha.toFixed(1)} {t('lands.wizard.review_labels.guntha')}
                        </span>
                      </div>
                    </Card>
                  </div>
                </section>
              )}

              {/* STEP 2 — Location (tiny cards) */}
              {currentStep === 2 && (
                <section className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-primary" />
                      {t('lands.wizard.sections.location')}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={() => playVoice(t('lands.wizard.voice_guides.location', { defaultValue: '' }))}>
                      <Volume2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div>
                    <Label className="text-sm mb-2 block">{t('lands.wizard.sections.state')}</Label>
                    <LocationGrid
                      items={states}
                      valueId={formData.state_id}
                      onPick={(id, name) => {
                        handleChange('state_id', id);
                        handleChange('state', name);
                        handleChange('district_id', ''); handleChange('district', '');
                        handleChange('taluka_id', ''); handleChange('taluka', '');
                        handleChange('village_id', ''); handleChange('village', '');
                      }}
                      emptyKey="lands.wizard.placeholders.select_state"
                    />
                  </div>

                  <div>
                    <Label className="text-sm mb-2 block">{t('lands.wizard.sections.district')}</Label>
                    <LocationGrid
                      items={districts}
                      valueId={formData.district_id}
                      onPick={(id, name) => {
                        handleChange('district_id', id);
                        handleChange('district', name);
                        handleChange('taluka_id', ''); handleChange('taluka', '');
                        handleChange('village_id', ''); handleChange('village', '');
                      }}
                      emptyKey="lands.wizard.placeholders.select_district"
                    />
                  </div>

                  <div>
                    <Label className="text-sm mb-2 block">{t('lands.wizard.sections.taluka')}</Label>
                    <LocationGrid
                      items={talukas}
                      valueId={formData.taluka_id}
                      onPick={(id, name) => {
                        handleChange('taluka_id', id);
                        handleChange('taluka', name);
                        handleChange('village_id', ''); handleChange('village', '');
                      }}
                      emptyKey="lands.wizard.placeholders.select_taluka"
                    />
                  </div>

                  <div>
                    <Label className="text-sm mb-2 block">{t('lands.wizard.sections.village')}</Label>
                    <LocationGrid
                      items={villages}
                      valueId={formData.village_id}
                      onPick={(id, name) => {
                        handleChange('village_id', id);
                        handleChange('village', name);
                      }}
                      emptyKey="lands.wizard.placeholders.select_village"
                    />
                  </div>
                </section>
              )}

              {/* STEP 3 — Land Details (DB-driven tiny cards) */}
              {currentStep === 3 && (
                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Sprout className="w-5 h-5 text-primary" />
                      {t('lands.wizard.sections.land_details')}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={() => playVoice(t('lands.wizard.voice_guides.land_details', { defaultValue: '' }))}>
                      <Volume2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div>
                    <Label className="text-sm mb-2 flex items-center gap-2">
                      <Mountain className="w-4 h-4 text-warning" />
                      {t('lands.wizard.sections.soil_type')}
                    </Label>
                    <TinyCardGrid
                      items={soilQ.data || []}
                      value={formData.soil_type}
                      onPick={(v) => handleChange('soil_type', v)}
                      iconMap={SOIL_ICONS}
                      loading={soilQ.isLoading}
                    />
                  </div>

                  <div>
                    <Label className="text-sm mb-2 flex items-center gap-2">
                      <Droplets className="w-4 h-4 text-info" />
                      {t('lands.wizard.sections.water_source')}
                    </Label>
                    <TinyCardGrid
                      items={waterQ.data || []}
                      value={formData.water_source}
                      onPick={(v) => handleChange('water_source', v)}
                      iconMap={WATER_ICONS}
                      loading={waterQ.isLoading}
                    />
                  </div>

                  <div>
                    <Label className="text-sm mb-2 flex items-center gap-2">
                      <Droplets className="w-4 h-4 text-primary" />
                      {t('lands.wizard.sections.irrigation_type')}
                    </Label>
                    <TinyCardGrid
                      items={irrigationQ.data || []}
                      value={formData.irrigation_type}
                      onPick={(v) => handleChange('irrigation_type', v)}
                      iconMap={IRRIGATION_ICONS}
                      loading={irrigationQ.isLoading}
                    />
                  </div>

                  <div className="space-y-3 pt-2">
                    <Label className="text-sm font-semibold">
                      {t('lands.wizard.crop_selection')}
                    </Label>
                    <CropSelectionCard
                      label={t('lands.wizard.current_crop')}
                      value={formData.current_crop}
                      cropId={''}
                      onSelect={(_, name) => handleChange('current_crop', name)}
                      variant="current"
                    />
                    <CropSelectionCard
                      label={t('lands.wizard.previous_crop')}
                      value={formData.previous_crop}
                      cropId={''}
                      onSelect={(_, name) => handleChange('previous_crop', name)}
                      variant="previous"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm mb-1.5 block">
                        {t('lands.wizard.fields.cultivation_date')}
                      </Label>
                      <Input
                        type="date"
                        value={formData.cultivation_date}
                        onChange={(e) => handleChange('cultivation_date', e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div>
                      <Label className="text-sm mb-1.5 block">
                        {t('lands.wizard.fields.last_harvest_date')}
                      </Label>
                      <Input
                        type="date"
                        value={formData.last_harvest_date}
                        onChange={(e) => handleChange('last_harvest_date', e.target.value)}
                        className="h-11"
                      />
                    </div>
                  </div>
                </section>
              )}

              {/* STEP 4 — Review */}
              {currentStep === 4 && (
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Save className="w-5 h-5 text-primary" />
                    {t('lands.wizard.sections.review')}
                  </h2>

                  <Card className="p-4 bg-primary/5 border-primary/20">
                    <h3 className="font-semibold mb-2 text-sm">{t('lands.wizard.review.land_area')}</h3>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold">{area.acres.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{t('lands.wizard.review_labels.acres')}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{area.guntha.toFixed(1)}</p>
                        <p className="text-xs text-muted-foreground">{t('lands.wizard.review_labels.guntha')}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{Math.round(area.sqft).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{t('lands.wizard.review_labels.sqft')}</p>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h3 className="font-semibold mb-2 text-sm">{t('lands.wizard.review.basic_info')}</h3>
                    <dl className="space-y-1 text-sm">
                      <Row k={t('lands.wizard.review_labels.name')} v={formData.name} />
                      <Row k={t('lands.wizard.review_labels.survey_number')} v={formData.survey_number} />
                      <Row
                        k={t('lands.wizard.review_labels.ownership')}
                        v={t(`lands.wizard.ownership.${formData.ownership_type}`)}
                      />
                    </dl>
                  </Card>

                  <Card className="p-4">
                    <h3 className="font-semibold mb-2 text-sm">{t('lands.wizard.review.location')}</h3>
                    <dl className="space-y-1 text-sm">
                      <Row k={t('lands.wizard.review_labels.state')} v={formData.state} />
                      <Row k={t('lands.wizard.review_labels.district')} v={formData.district} />
                      <Row k={t('lands.wizard.review_labels.taluka')} v={formData.taluka} />
                      <Row k={t('lands.wizard.review_labels.village')} v={formData.village} />
                    </dl>
                  </Card>

                  <Card className="p-4">
                    <h3 className="font-semibold mb-2 text-sm">{t('lands.wizard.review.land_details')}</h3>
                    <dl className="space-y-1 text-sm">
                      <Row
                        k={t('lands.wizard.review_labels.soil_type')}
                        v={tRef(
                          (soilQ.data || []).find((r: any) => r.value === formData.soil_type),
                          'label'
                        ) || formData.soil_type}
                      />
                      <Row
                        k={t('lands.wizard.review_labels.water_source')}
                        v={tRef(
                          (waterQ.data || []).find((r: any) => r.value === formData.water_source),
                          'label'
                        ) || formData.water_source}
                      />
                      <Row
                        k={t('lands.wizard.sections.irrigation_type')}
                        v={tRef(
                          (irrigationQ.data || []).find((r: any) => r.value === formData.irrigation_type),
                          'label'
                        ) || formData.irrigation_type}
                      />
                      <Row k={t('lands.wizard.review_labels.current_crop')} v={formData.current_crop} />
                    </dl>
                  </Card>
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Sticky footer */}
      <footer className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl flex items-center gap-2">
          <Button
            variant="outline"
            onClick={currentStep === 1 ? onCancel : prev}
            className="gap-1 flex-1"
            disabled={isSaving}
          >
            <ChevronLeft className="w-4 h-4" />
            {currentStep === 1 ? t('lands.wizard.buttons.cancel') : t('lands.wizard.buttons.previous')}
          </Button>
          {currentStep < 4 ? (
            <Button
              onClick={next}
              className="gap-1 flex-1"
              disabled={currentStep === 1 && !formData.name}
            >
              {t('lands.wizard.buttons.next')}
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="gap-1 flex-1 bg-success hover:bg-success/90"
            >
              {isSaving ? (
                t('lands.wizard.buttons.saving')
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {t('lands.edit.save')}
                </>
              )}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground shrink-0">{k}</dt>
      <dd className="font-medium text-right truncate">{v || '—'}</dd>
    </div>
  );
}
