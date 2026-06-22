import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Loader2, Save, Tag, FileText, Sprout, Droplet,
  Tractor, History, ChevronDown, Sparkles, MapPin, Wheat,
  Mountain, Globe, Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { landsApi } from '@/services/landsApi';
import { useLandFormData } from '@/hooks/useLandFormData';
import { useLandContextInference, type CropRef, type InferContextResult } from '@/hooks/useLandContextInference';
import { deriveCropCycle } from '@/lib/cropStage';
import { FieldChip } from './FieldChip';
import { LandVoiceCapture } from './LandVoiceCapture';
import { LocationPickerSection, type LocationValue } from './LocationPickerSection';
import { SeasonMonthPicker } from './SeasonMonthPicker';
import { LandMapThumb } from './LandMapThumb';
import { ReviewCard, type ReviewCardState } from './ReviewCard';
import { CentralizedCropSelector } from '@/components/crops/CentralizedCropSelector';

interface LatLng { lat: number; lng: number; }
interface Area { sqft: number; guntha: number; acres: number; }

interface SmartLandConfirmCardProps {
  boundary: LatLng[];
  area: Area;
  onComplete: () => void;
  onCancel: () => void;
}

type OwnershipType = 'owned' | 'leased' | 'shared';

interface FormState {
  name: string;
  survey_number: string;
  ownership_type: OwnershipType;
  country: string; country_code: string;
  state?: string; state_id?: string;
  district?: string; district_id?: string;
  taluka?: string; taluka_id?: string;
  village?: string; village_id?: string;
  location_context?: any;
  elevation_meters?: number;
  soil_type?: string;
  water_source?: string;
  irrigation_type?: string;
  current_crop?: string;
  current_crop_id?: string;
  current_crop_duration?: number | null;
  sowing_date?: string;
  land_prep_offset_days: number;
  previous_crop?: string;
  previous_crop_id?: string;
  last_harvest_date?: string;
  notes: string;
  marketplace_enabled: boolean;
}

type PickerKind = 'soil' | 'water' | 'irrigation' | 'crop' | 'previous_crop' | null;

export function SmartLandConfirmCard({
  boundary, area, onComplete, onCancel,
}: SmartLandConfirmCardProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { soilTypes, waterSources, irrigationTypes } = useLandFormData();
  const inference = useLandContextInference();

  const centroid = useMemo(() => {
    if (boundary.length < 3) return { lat: 0, lng: 0 };
    return {
      lat: boundary.reduce((s, p) => s + p.lat, 0) / boundary.length,
      lng: boundary.reduce((s, p) => s + p.lng, 0) / boundary.length,
    };
  }, [boundary]);

  const [form, setForm] = useState<FormState>({
    name: '', survey_number: '', ownership_type: 'owned',
    notes: '', marketplace_enabled: false, land_prep_offset_days: 0,
    country: 'India', country_code: 'IN',
  });
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [sources, setSources] = useState<Record<string, string>>({});
  const [crops, setCrops] = useState<CropRef[]>([]);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [saving, setSaving] = useState(false);
  // Per-section confirmation state — when true, AI guess accepted as-is
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const ranInfer = useRef(false);

  // ───────── AI inference (single-flight) ─────────
  useEffect(() => {
    if (ranInfer.current || !centroid.lat) return;
    ranInfer.current = true;
    inference.mutate(
      { centroid, language: i18n.language?.split('-')[0] || 'en' },
      {
        onSuccess: (res: InferContextResult) => {
          setConfidence(res.confidence || {});
          setSources(res.sources || {});
          setCrops(res.crops || []);
          setForm((f) => {
            const next: FormState = { ...f };
            const fld = res.fields || {};
            if (fld.country) next.country = fld.country;
            if (fld.country_code) next.country_code = fld.country_code;
            if (fld.state) next.state = fld.state;
            if (fld.state_id) next.state_id = fld.state_id;
            if (fld.district) next.district = fld.district;
            if (fld.district_id) next.district_id = fld.district_id;
            if (fld.taluka) next.taluka = fld.taluka;
            if (fld.taluka_id) next.taluka_id = fld.taluka_id;
            if (fld.village) next.village = fld.village;
            if (fld.village_id) next.village_id = fld.village_id;
            if (fld.location_context) next.location_context = fld.location_context;
            if (typeof fld.elevation_meters === 'number') next.elevation_meters = fld.elevation_meters;
            if (fld.soil_type) next.soil_type = fld.soil_type;
            if (fld.water_source) next.water_source = fld.water_source;
            if (fld.irrigation_type) next.irrigation_type = fld.irrigation_type;
            if (fld.current_crop && (res.confidence?.current_crop ?? 0) >= 0.6) {
              next.current_crop = fld.current_crop;
              if (fld.current_crop_id) next.current_crop_id = fld.current_crop_id;
              const c = (res.crops || []).find(c => c.id === fld.current_crop_id || c.value === fld.current_crop);
              if (c?.duration_days) next.current_crop_duration = c.duration_days;
            }
            if (!next.name && fld.village) next.name = `${fld.village} field`;
            return next;
          });
        },
        onError: (err) => console.warn('Land inference unavailable:', err.message),
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centroid.lat, centroid.lng]);

  const cycle = useMemo(() => deriveCropCycle(
    form.sowing_date, form.current_crop_duration ?? null, form.land_prep_offset_days,
  ), [form.sowing_date, form.current_crop_duration, form.land_prep_offset_days]);

  // ───────── Voice ─────────
  const handleVoiceTranscript = (text: string) => {
    if (!text) return;
    const lower = text.toLowerCase();
    const updates: Partial<FormState> = {};
    const soil = soilTypes.find(s => lower.includes(s.value.toLowerCase()) || (s.label && lower.includes(s.label.toLowerCase())));
    if (soil) updates.soil_type = soil.value;
    const water = waterSources.find(w => lower.includes(w.value.toLowerCase()) || (w.label && lower.includes(w.label.toLowerCase())));
    if (water) updates.water_source = water.value;
    const irr = irrigationTypes.find(i => lower.includes(i.value.toLowerCase()) || (i.label && lower.includes(i.label.toLowerCase())));
    if (irr) updates.irrigation_type = irr.value;
    const crop = crops.find(c =>
      lower.includes(c.value.toLowerCase()) ||
      (c.label && lower.includes(c.label.toLowerCase())) ||
      (c.label_local && text.includes(c.label_local)) ||
      (c.label_hi && text.includes(c.label_hi)) ||
      (c.label_mr && text.includes(c.label_mr)),
    );
    if (crop) {
      updates.current_crop = crop.value;
      updates.current_crop_id = crop.id;
      updates.current_crop_duration = crop.duration_days ?? null;
    }
    if (/lease|rent|भाडे|किराया/i.test(text)) updates.ownership_type = 'leased';
    else if (/share|बटाई|वाटा/i.test(text)) updates.ownership_type = 'shared';
    else if (/own|मालक|खुद/i.test(text)) updates.ownership_type = 'owned';
    if (Object.keys(updates).length === 0) {
      updates.notes = ((form.notes || '') + ' ' + text).trim();
    }
    setForm((f) => ({ ...f, ...updates }));
    if (navigator.vibrate) navigator.vibrate(15);
    toast({
      title: t('lands.smartConfirm.voiceCaptured', { defaultValue: 'Voice captured' }),
      description: text,
    });
  };

  // ───────── Save ─────────
  const validate = (): string | null => {
    if (!form.name?.trim()) return t('lands.smartConfirm.errors.name', { defaultValue: 'Land name is required' });
    if (!form.country) return t('lands.smartConfirm.errors.country', { defaultValue: 'Country is required' });
    if (!form.state) return t('lands.smartConfirm.errors.state', { defaultValue: 'State is required' });
    if (!form.district) return t('lands.smartConfirm.errors.district', { defaultValue: 'District is required' });
    if (!form.current_crop) return t('lands.smartConfirm.errors.crop', { defaultValue: 'Current crop is required' });
    if (!form.sowing_date) return t('lands.smartConfirm.errors.sowing', { defaultValue: 'Sowing date is required' });
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast({ title: t('common.error', { defaultValue: 'Error' }), description: err, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const boundaryGeoJSON = boundary.length >= 3 ? {
        type: 'Polygon',
        coordinates: [[
          ...boundary.map(p => [p.lng, p.lat]),
          [boundary[0].lng, boundary[0].lat],
        ]],
      } : null;
      const centerGeoJSON = boundary.length >= 3
        ? { type: 'Point', coordinates: [centroid.lng, centroid.lat] }
        : null;

      await landsApi.createLand({
        name: form.name.trim(),
        survey_number: form.survey_number?.trim() || undefined,
        ownership_type: form.ownership_type,
        area_acres: area.acres,
        area_guntas: area.guntha,
        area_sqft: area.sqft,
        boundary_polygon_old: boundaryGeoJSON,
        center_point_old: centerGeoJSON,
        center_lat: centroid.lat,
        center_lon: centroid.lng,
        boundary_method: 'gps_points',
        gps_accuracy_meters: 10,
        gps_recorded_at: new Date().toISOString(),
        elevation_meters: form.elevation_meters,
        country: form.country, country_code: form.country_code,
        state: form.state, state_id: form.state_id,
        district: form.district, district_id: form.district_id,
        taluka: form.taluka, taluka_id: form.taluka_id,
        village: form.village, village_id: form.village_id,
        location_context: form.location_context,
        soil_type: form.soil_type,
        water_source: form.water_source,
        irrigation_type: form.irrigation_type,
        current_crop: form.current_crop,
        current_crop_id: form.current_crop_id,
        crop_stage: cycle.stage !== '—' ? cycle.stage : undefined,
        planting_date: cycle.plantingDate || undefined,
        last_sowing_date: cycle.lastSowingDate || undefined,
        cultivation_date: cycle.cultivationDate || undefined,
        expected_harvest_date: cycle.expectedHarvestDate || undefined,
        previous_crop: form.previous_crop,
        previous_crop_id: form.previous_crop_id,
        last_crop: form.previous_crop,
        last_harvest_date: form.last_harvest_date,
        notes: form.notes?.trim() || undefined,
        marketplace_enabled: form.marketplace_enabled,
      });
      localStorage.removeItem('landFormDraft');
      if (navigator.vibrate) navigator.vibrate(30);
      toast({
        title: t('lands.smartConfirm.savedTitle', { defaultValue: 'Land saved' }),
        description: t('lands.smartConfirm.savedDesc', { defaultValue: 'Your land is ready for AI advice.' }),
      });
      onComplete();
    } catch (e: any) {
      toast({
        title: t('common.error', { defaultValue: 'Error' }),
        description: e?.message || 'Save failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // ───────── Picker (soil / water / irrigation / crop) ─────────
  const pickerItems = useMemo(() => {
    switch (picker) {
      case 'soil': return soilTypes.map(s => ({ value: s.value, label: s.label, id: s.id }));
      case 'water': return waterSources.map(w => ({ value: w.value, label: w.label, id: w.id }));
      case 'irrigation': return irrigationTypes.map(i => ({ value: i.value, label: i.label, id: i.id }));
      case 'crop':
      case 'previous_crop':
        return crops.map(c => ({
          value: c.value, label: c.label, id: c.id,
          meta: c.duration_days ? `${c.duration_days}d` : '',
          duration_days: c.duration_days,
        }));
      default: return [];
    }
  }, [picker, soilTypes, waterSources, irrigationTypes, crops]);

  const applyPick = (item: any) => {
    setForm((f) => {
      const next = { ...f };
      switch (picker) {
        case 'soil': next.soil_type = item.value; break;
        case 'water': next.water_source = item.value; break;
        case 'irrigation': next.irrigation_type = item.value; break;
        case 'crop':
          next.current_crop = item.value;
          next.current_crop_id = item.id;
          next.current_crop_duration = item.duration_days ?? null;
          break;
        case 'previous_crop':
          next.previous_crop = item.value;
          next.previous_crop_id = item.id;
          break;
      }
      return next;
    });
    setConfidence(c => ({ ...c, [pickerToConfKey(picker!)]: 1 }));
    setSources(s => ({ ...s, [pickerToConfKey(picker!)]: 'farmer' }));
    setPicker(null);
  };

  // ───────── Per-section state derivation ─────────
  const locationFilled = !!(form.state && form.district);
  const locationFromAi = locationFilled && (sources.state !== 'farmer' || sources.district !== 'farmer');
  const locationState: ReviewCardState = !locationFilled
    ? 'empty'
    : confirmed.location ? 'confirmed'
    : locationFromAi ? 'ai' : 'manual';

  const cropFilled = !!(form.current_crop && form.sowing_date);
  const cropFromAi = !!form.current_crop && sources.current_crop && sources.current_crop !== 'farmer';
  const cropState: ReviewCardState = !cropFilled
    ? 'empty'
    : confirmed.crop ? 'confirmed'
    : cropFromAi ? 'ai' : 'manual';

  const characterFilled = !!(form.soil_type || form.water_source || form.irrigation_type);
  const characterState: ReviewCardState = !characterFilled ? 'empty' : 'manual';

  // Summaries
  const locationSummary = useMemo(() => {
    if (!locationFilled) return t('lands.smartConfirm.tapToSet', { defaultValue: 'Tap to set' });
    return [form.village, form.taluka, form.district, form.state]
      .filter(Boolean).join(' · ');
  }, [form.village, form.taluka, form.district, form.state, locationFilled, t]);

  const cropSummary = useMemo(() => {
    if (!form.current_crop) return t('lands.smartConfirm.tapToAdd', { defaultValue: 'Tap to add crop' });
    const cropLabel = labelFor(crops as any, form.current_crop);
    const dt = form.sowing_date ? formatMonth(form.sowing_date, i18n.language) : null;
    return dt ? `${cropLabel} · ${t('lands.smartConfirm.sowed', { defaultValue: 'Sowed' })} ${dt}` : cropLabel;
  }, [form.current_crop, form.sowing_date, crops, i18n.language, t]);

  const characterSummary = useMemo(() => {
    if (!characterFilled) return t('lands.smartConfirm.tapToAddCharacter', { defaultValue: 'Add soil, water, irrigation' });
    const parts: string[] = [];
    if (form.soil_type) parts.push(labelFor(soilTypes, form.soil_type));
    if (form.water_source) parts.push(labelFor(waterSources, form.water_source));
    if (form.irrigation_type) parts.push(labelFor(irrigationTypes, form.irrigation_type));
    return parts.join(' · ');
  }, [form.soil_type, form.water_source, form.irrigation_type, soilTypes, waterSources, irrigationTypes, characterFilled, t]);

  const onLocationManualEdit = (field: keyof LocationValue) => {
    setConfidence(c => ({ ...c, [field]: 1 }));
    setSources(s => ({ ...s, [field]: 'farmer' }));
    setConfirmed(c => ({ ...c, location: false })); // reset confirmation after edit
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-background flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* ───────── Sticky header with map thumb ───────── */}
      <div className="border-b border-border bg-background">
        <div className="flex items-center gap-2 px-3 py-2">
          <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Back" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold flex-1 truncate">
            {t('lands.smartConfirm.title', { defaultValue: 'Confirm your land' })}
          </h1>
          {inference.isPending && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
              <Sparkles className="h-3 w-3 animate-pulse" />
              {t('lands.smartConfirm.thinking', { defaultValue: 'AI…' })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 px-3 pb-3">
          <LandMapThumb boundary={boundary} size={64} onClick={onCancel} />
          <div className="min-w-0 flex-1">
            <Input
              id="land-name"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t('lands.smartConfirm.namePlaceholder', { defaultValue: 'Name this land' })}
              className="h-11 rounded-xl text-sm font-semibold"
              aria-label={t('lands.smartConfirm.name', { defaultValue: 'Land name' })}
            />
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {area.acres.toFixed(2)} ac · {area.guntha.toFixed(1)} guntha
              {typeof form.elevation_meters === 'number' && (
                <span className="inline-flex items-center gap-0.5 ml-2">
                  <Mountain className="h-2.5 w-2.5" />
                  {form.elevation_meters} m
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ───────── Scrollable body ───────── */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3"
        style={{ paddingBottom: '140px' }}
      >
        {/* Location card */}
        <ReviewCard
          icon={<MapPin className="h-5 w-5 text-success dark:text-success" />}
          title={t('lands.smartConfirm.whereIsIt', { defaultValue: 'Where is it?' })}
          summary={locationSummary}
          state={locationState}
          required
          collapsible
          defaultOpen={!locationFilled || locationFromAi}
          alwaysShowChildrenWhenAi
          onConfirm={() => {
            setConfirmed(c => ({ ...c, location: true }));
            (['country','state','district','taluka','village'] as const).forEach(k => {
              setSources(s => ({ ...s, [k]: 'farmer' }));
              setConfidence(c => ({ ...c, [k]: 1 }));
            });
            if (navigator.vibrate) navigator.vibrate(15);
          }}
        >
          <LocationPickerSection
            value={{
              country: form.country, country_code: form.country_code,
              state: form.state, state_id: form.state_id,
              district: form.district, district_id: form.district_id,
              taluka: form.taluka, taluka_id: form.taluka_id,
              village: form.village, village_id: form.village_id,
            }}
            onChange={(loc: LocationValue) => setForm(f => ({ ...f, ...loc }))}
            confidence={confidence}
            sources={sources}
            onManualEdit={onLocationManualEdit}
            showCountry={showCountryPicker}
            hideHeading
          />
          {!showCountryPicker && (
            <button
              type="button"
              onClick={() => setShowCountryPicker(true)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mt-1"
            >
              <Globe className="h-3 w-3" />
              {t('lands.smartConfirm.outsideIndia', { defaultValue: 'Outside India?' })}
            </button>
          )}
        </ReviewCard>

        {/* Crop & dates card */}
        <ReviewCard
          icon={<Wheat className="h-5 w-5 text-warning dark:text-warning" />}
          title={t('lands.smartConfirm.whatsGrowing', { defaultValue: "What's growing?" })}
          summary={cropSummary}
          state={cropState}
          required
          collapsible
          defaultOpen={!cropFilled}
          onConfirm={() => {
            setConfirmed(c => ({ ...c, crop: true }));
            setSources(s => ({ ...s, current_crop: 'farmer' }));
            setConfidence(c => ({ ...c, current_crop: 1 }));
            if (navigator.vibrate) navigator.vibrate(15);
          }}
        >
          <FieldChip
            icon={<Tag className="h-5 w-5" />}
            label={t('lands.smartConfirm.currentCrop', { defaultValue: 'Current crop' })}
            value={form.current_crop ? labelFor(crops as any, form.current_crop) : null}
            confidence={confidence.current_crop}
            source={sources.current_crop}
            onClick={() => setPicker('crop')}
            required
          />
          <div className="rounded-2xl border border-border bg-card p-3 space-y-3">
            <div>
              <Label className="text-xs">
                {t('lands.smartConfirm.sowedOn', { defaultValue: 'When was it sowed?' })} *
              </Label>
              <div className="mt-2">
                <SeasonMonthPicker
                  value={form.sowing_date}
                  onChange={(iso) => setForm(f => ({ ...f, sowing_date: iso }))}
                  ariaLabel={t('lands.smartConfirm.sowedOn', { defaultValue: 'When was it sowed?' })}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">
                {t('lands.smartConfirm.landPrep', { defaultValue: 'Land prepared' })}
              </Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {[
                  { d: 0,  label: t('lands.smartConfirm.sameDay', { defaultValue: 'Same day' }) },
                  { d: 7,  label: t('lands.smartConfirm.7days', { defaultValue: '7 days before' }) },
                  { d: 14, label: t('lands.smartConfirm.14days', { defaultValue: '14 days before' }) },
                ].map(opt => (
                  <button
                    key={opt.d}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, land_prep_offset_days: opt.d }))}
                    className={cn(
                      'rounded-xl px-2 py-2.5 text-xs border min-h-[44px] active:scale-[0.97]',
                      form.land_prep_offset_days === opt.d
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {cycle.expectedHarvestDate && (
              <div className="text-xs text-muted-foreground bg-muted/60 rounded-xl p-2.5 space-y-1">
                <div>
                  <span className="font-medium text-foreground">
                    {t('lands.smartConfirm.expectedHarvest', { defaultValue: 'Expected harvest' })}:
                  </span>{' '}
                  {formatMonth(cycle.expectedHarvestDate, i18n.language)}
                </div>
                <div>
                  <span className="font-medium text-foreground">
                    {t('lands.smartConfirm.stageNow', { defaultValue: 'Stage now' })}:
                  </span>{' '}
                  {cycle.stage} ({cycle.daysSinceSowing}d)
                </div>
              </div>
            )}
          </div>
        </ReviewCard>

        {/* Land character — collapsed by default */}
        <ReviewCard
          icon={<Sprout className="h-5 w-5 text-success dark:text-success" />}
          title={t('lands.smartConfirm.character', { defaultValue: 'Land character' })}
          summary={characterSummary}
          state={characterState}
          collapsible
          defaultOpen={false}
        >
          <FieldChip
            icon={<Sprout className="h-5 w-5" />}
            label={t('lands.smartConfirm.soil', { defaultValue: 'Soil type' })}
            value={form.soil_type ? labelFor(soilTypes, form.soil_type) : null}
            confidence={confidence.soil_type}
            source={sources.soil_type}
            onClick={() => setPicker('soil')}
          />
          <FieldChip
            icon={<Droplet className="h-5 w-5" />}
            label={t('lands.smartConfirm.water', { defaultValue: 'Water source' })}
            value={form.water_source ? labelFor(waterSources, form.water_source) : null}
            confidence={confidence.water_source}
            source={sources.water_source}
            onClick={() => setPicker('water')}
          />
          <FieldChip
            icon={<Tractor className="h-5 w-5" />}
            label={t('lands.smartConfirm.irrigation', { defaultValue: 'Irrigation type' })}
            value={form.irrigation_type ? labelFor(irrigationTypes, form.irrigation_type) : null}
            confidence={confidence.irrigation_type}
            source={sources.irrigation_type}
            onClick={() => setPicker('irrigation')}
          />
        </ReviewCard>

        {/* Ownership + survey — collapsed by default */}
        <ReviewCard
          icon={<FileText className="h-5 w-5 text-foreground/80 dark:text-muted-foreground" />}
          title={t('lands.smartConfirm.ownershipTitle', { defaultValue: 'Ownership & survey' })}
          summary={ownershipLabel(form.ownership_type, t) + (form.survey_number ? ` · #${form.survey_number}` : '')}
          state={'manual'}
          collapsible
          defaultOpen={false}
        >
          <div className="grid grid-cols-3 gap-2">
            {(['owned','leased','shared'] as OwnershipType[]).map(kind => (
              <button
                key={kind}
                type="button"
                onClick={() => setForm(f => ({ ...f, ownership_type: kind }))}
                className={cn(
                  'flex flex-col items-center justify-center rounded-2xl px-2 py-3 border min-h-[68px]',
                  'transition-colors active:scale-[0.97]',
                  form.ownership_type === kind
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border',
                )}
              >
                <span className="text-xl">{ownershipEmoji(kind)}</span>
                <span className="text-xs font-medium mt-1">{ownershipLabel(kind, t)}</span>
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="survey" className="text-xs">
              {t('lands.smartConfirm.survey', { defaultValue: 'Survey number (optional)' })}
            </Label>
            <Input
              id="survey"
              value={form.survey_number}
              onChange={(e) => setForm(f => ({ ...f, survey_number: e.target.value }))}
              placeholder="e.g. 123/A"
              className="h-11 rounded-xl mt-1"
            />
          </div>
        </ReviewCard>

        {/* Previous cycle — collapsed */}
        <ReviewCard
          icon={<History className="h-5 w-5 text-primary dark:text-primary" />}
          title={t('lands.smartConfirm.previousCycle', { defaultValue: 'Previous cycle' })}
          summary={
            form.previous_crop
              ? `${labelFor(crops as any, form.previous_crop)}${form.last_harvest_date ? ' · ' + formatMonth(form.last_harvest_date, i18n.language) : ''}`
              : t('lands.smartConfirm.tapAddPrevious', { defaultValue: 'Tap to add (helps AI)' })
          }
          state={form.previous_crop ? 'manual' : 'empty'}
          collapsible
          defaultOpen={false}
        >
          <FieldChip
            label={t('lands.smartConfirm.previousCrop', { defaultValue: 'Previous crop' })}
            value={form.previous_crop ? labelFor(crops as any, form.previous_crop) : null}
            onClick={() => setPicker('previous_crop')}
          />
          <div>
            <Label className="text-xs">
              {t('lands.smartConfirm.lastHarvest', { defaultValue: 'Last harvest month' })}
            </Label>
            <div className="mt-2">
              <SeasonMonthPicker
                value={form.last_harvest_date}
                onChange={(iso) => setForm(f => ({ ...f, last_harvest_date: iso }))}
                yearsBack={3}
                yearsForward={0}
              />
            </div>
          </div>
        </ReviewCard>

        {/* Notes + marketplace */}
        <ReviewCard
          icon={<Store className="h-5 w-5 text-warning dark:text-warning" />}
          title={t('lands.smartConfirm.moreDetails', { defaultValue: 'More details' })}
          summary={form.notes ? form.notes.slice(0, 60) : t('lands.smartConfirm.optional', { defaultValue: 'Notes & marketplace (optional)' })}
          state={form.notes ? 'manual' : 'empty'}
          collapsible
          defaultOpen={false}
        >
          <Textarea
            value={form.notes}
            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="rounded-xl"
            placeholder={t('lands.smartConfirm.notesPlaceholder', { defaultValue: 'Anything else worth remembering…' })}
          />
          <label className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-3">
            <span className="text-sm">
              {t('lands.smartConfirm.marketplace', { defaultValue: 'List on marketplace' })}
            </span>
            <input
              type="checkbox"
              checked={form.marketplace_enabled}
              onChange={(e) => setForm(f => ({ ...f, marketplace_enabled: e.target.checked }))}
              className="h-5 w-5"
            />
          </label>
        </ReviewCard>
      </div>

      {/* ───────── Floating voice mic FAB ───────── */}
      <div
        className="absolute right-3 z-[5] rounded-full bg-background/90 shadow-lg p-1.5"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
      >
        <LandVoiceCapture
          language={i18n.language?.split('-')[0] || 'en'}
          onTranscript={handleVoiceTranscript}
        />
      </div>

      {/* ───────── Sticky save bar ───────── */}
      <div
        className="absolute bottom-0 inset-x-0 border-t border-border bg-background px-3 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-14 rounded-2xl text-base font-semibold"
        >
          {saving
            ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />{t('common.saving', { defaultValue: 'Saving…' })}</>
            : <><Save className="h-5 w-5 mr-2" />{t('lands.smartConfirm.save', { defaultValue: 'Save Land' })}</>
          }
        </Button>
      </div>

      {/* ───────── Picker sheet (soil/water/irrigation/crop) ───────── */}
      <Sheet open={picker !== null} onOpenChange={(o) => !o && setPicker(null)}>
        <SheetContent
          side="bottom"
          className={cn(
            'z-[70] rounded-t-3xl overflow-hidden p-0',
            picker === 'crop' || picker === 'previous_crop' ? 'h-[85vh]' : 'max-h-[75vh] overflow-y-auto',
          )}
        >
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle>
              {picker === 'soil'          && t('lands.smartConfirm.soil', { defaultValue: 'Soil type' })}
              {picker === 'water'         && t('lands.smartConfirm.water', { defaultValue: 'Water source' })}
              {picker === 'irrigation'    && t('lands.smartConfirm.irrigation', { defaultValue: 'Irrigation type' })}
              {picker === 'crop'          && t('lands.smartConfirm.currentCrop', { defaultValue: 'Current crop' })}
              {picker === 'previous_crop' && t('lands.smartConfirm.previousCrop', { defaultValue: 'Previous crop' })}
            </SheetTitle>
          </SheetHeader>

          {(picker === 'crop' || picker === 'previous_crop') ? (
            <div className="flex flex-col h-[calc(85vh-3.5rem)]">
              {/* AI suggestions strip — one-tap shortcut to the crops inferred for this land */}
              {crops.length > 0 && (
                <div className="px-4 pb-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    {t('lands.smartConfirm.suggestedCrops', { defaultValue: 'Suggested for your field' })}
                  </div>
                  <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                    {crops.slice(0, 8).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => applyPick({
                          id: c.id, value: c.value, label: c.label,
                          duration_days: c.duration_days,
                        })}
                        className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs active:scale-[0.97]"
                      >
                        {c.label_local || c.label_hi || c.label_mr || c.label}
                        {c.duration_days ? <span className="text-muted-foreground ml-1">· {c.duration_days}d</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Full Group → Crop selector backed by Supabase crop_groups + crops tables */}
              <div className="flex-1 min-h-0 border-t border-border overflow-hidden">
                <CentralizedCropSelector
                  variant="compact"
                  showHeader
                  showSearch
                  selectedCropId={picker === 'crop' ? form.current_crop_id : form.previous_crop_id}
                  onSelect={(cropId, englishLabel /* , localizedLabel */) => {
                    const known = crops.find(c => c.id === cropId);
                    applyPick({
                      id: cropId,
                      value: englishLabel,
                      label: englishLabel,
                      duration_days: known?.duration_days ?? null,
                    });
                  }}
                  className="h-full"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 mt-2 px-4 pb-4">
              {pickerItems.map((it: any) => (
                <button
                  key={it.id || it.value}
                  type="button"
                  onClick={() => applyPick(it)}
                  className="rounded-2xl border border-border bg-card px-3 py-3.5 text-sm text-left active:scale-[0.97] min-h-[60px]"
                >
                  <div className="font-medium truncate">{it.label}</div>
                  {it.meta && <div className="text-[11px] text-muted-foreground mt-0.5">{it.meta}</div>}
                </button>
              ))}
              {pickerItems.length === 0 && (
                <div className="col-span-2 text-center text-sm text-muted-foreground py-6">
                  {t('common.loading', { defaultValue: 'Loading…' })}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ───────── helpers ─────────
function pickerToConfKey(p: Exclude<PickerKind, null>): string {
  switch (p) {
    case 'soil': return 'soil_type';
    case 'water': return 'water_source';
    case 'irrigation': return 'irrigation_type';
    case 'crop': return 'current_crop';
    case 'previous_crop': return 'previous_crop';
  }
}

function labelFor(items: { value: string; label: string }[], value: string): string {
  return items.find(i => i.value === value)?.label || value;
}

function formatMonth(iso: string, lang?: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(lang || 'en', { month: 'short', year: 'numeric' }).format(d);
  } catch {
    return iso;
  }
}

function ownershipLabel(kind: OwnershipType, t: any): string {
  if (kind === 'owned')  return t('lands.smartConfirm.owned',  { defaultValue: 'Owned' });
  if (kind === 'leased') return t('lands.smartConfirm.leased', { defaultValue: 'Leased' });
  return t('lands.smartConfirm.shared', { defaultValue: 'Shared' });
}
function ownershipEmoji(kind: OwnershipType): string {
  return kind === 'owned' ? '🏡' : kind === 'leased' ? '📜' : '🤝';
}
