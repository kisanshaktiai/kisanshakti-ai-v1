import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Loader2, Save, MapPin, Mountain, Tag, FileText,
  Sprout, Droplet, GlassWater, Tractor, CalendarDays, History,
  ChevronDown, Sparkles,
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
import { SeasonPicker } from './SeasonPicker';
import { LandVoiceCapture } from './LandVoiceCapture';
import { LocationPickerSection, type LocationValue } from './LocationPickerSection';

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
  // Location — full administrative chain
  country: string; country_code: string;
  state?: string; state_id?: string;
  district?: string; district_id?: string;
  taluka?: string; taluka_id?: string;
  village?: string; village_id?: string;
  location_context?: any;
  elevation_meters?: number;
  // Land character
  soil_type?: string;
  water_source?: string;
  irrigation_type?: string;
  // Current crop cycle
  current_crop?: string;
  current_crop_id?: string;
  current_crop_duration?: number | null;
  sowing_date?: string;
  land_prep_offset_days: number; // 0/7/14
  // Previous cycle
  previous_crop?: string;
  previous_crop_id?: string;
  last_harvest_date?: string;
  // Misc
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
    name: '',
    survey_number: '',
    ownership_type: 'owned',
    notes: '',
    marketplace_enabled: false,
    land_prep_offset_days: 0,
    country: 'India',
    country_code: 'IN',
  });

  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [sources, setSources] = useState<Record<string, string>>({});
  const [crops, setCrops] = useState<CropRef[]>([]);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const ranInfer = useRef(false);

  // Run AI inference exactly once when card mounts.
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
            // Location
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
            // Land character — only fill if confidence is high enough
            if (fld.soil_type) next.soil_type = fld.soil_type;
            if (fld.water_source) next.water_source = fld.water_source;
            if (fld.irrigation_type) next.irrigation_type = fld.irrigation_type;
            // Crop suggestion (do NOT auto-set if low confidence)
            if (fld.current_crop && (res.confidence?.current_crop ?? 0) >= 0.6) {
              next.current_crop = fld.current_crop;
              if (fld.current_crop_id) next.current_crop_id = fld.current_crop_id;
              const c = (res.crops || []).find(c => c.id === fld.current_crop_id || c.value === fld.current_crop);
              if (c?.duration_days) next.current_crop_duration = c.duration_days;
            }
            // Suggest a default name from village
            if (!next.name && fld.village) next.name = `${fld.village} field`;
            return next;
          });
        },
        onError: (err) => {
          console.warn('Land inference unavailable:', err.message);
        },
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centroid.lat, centroid.lng]);

  // Derived crop cycle preview
  const cycle = useMemo(() => deriveCropCycle(
    form.sowing_date,
    form.current_crop_duration ?? null,
    form.land_prep_offset_days,
  ), [form.sowing_date, form.current_crop_duration, form.land_prep_offset_days]);

  const locationLabel = [form.village, form.taluka, form.district].filter(Boolean).join(' › ') || null;
  const elevationLabel = typeof form.elevation_meters === 'number'
    ? `${form.elevation_meters} m`
    : null;

  // ───────────────────────── Voice slot extraction ─────────────────────────
  // Lightweight client-side extractor — no LLM agronomic generation. Maps the
  // farmer's spoken phrase to known reference values in the same script.
  const handleVoiceTranscript = (text: string) => {
    if (!text) return;
    const lower = text.toLowerCase();
    const updates: Partial<FormState> = {};

    // Soil
    const soil = soilTypes.find(s =>
      lower.includes(s.value.toLowerCase()) ||
      (s.label && lower.includes(s.label.toLowerCase())),
    );
    if (soil) updates.soil_type = soil.value;

    // Water
    const water = waterSources.find(w =>
      lower.includes(w.value.toLowerCase()) ||
      (w.label && lower.includes(w.label.toLowerCase())),
    );
    if (water) updates.water_source = water.value;

    // Irrigation
    const irr = irrigationTypes.find(i =>
      lower.includes(i.value.toLowerCase()) ||
      (i.label && lower.includes(i.label.toLowerCase())),
    );
    if (irr) updates.irrigation_type = irr.value;

    // Crop
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

    // Ownership
    if (/lease|rent|भाडे|किराया/i.test(text)) updates.ownership_type = 'leased';
    else if (/share|बटाई|वाटा/i.test(text)) updates.ownership_type = 'shared';
    else if (/own|मालक|खुद/i.test(text)) updates.ownership_type = 'owned';

    if (Object.keys(updates).length === 0) {
      // Fallback: put into notes so we never lose what the farmer said.
      updates.notes = ((form.notes || '') + ' ' + text).trim();
    }

    setForm((f) => ({ ...f, ...updates }));
    if (navigator.vibrate) navigator.vibrate(15);
    toast({
      title: t('lands.smartConfirm.voiceCaptured', { defaultValue: 'Voice captured' }),
      description: text,
    });
  };

  // ───────────────────────── Save ─────────────────────────
  const validate = (): string | null => {
    if (!form.name?.trim()) return t('lands.smartConfirm.errors.name', { defaultValue: 'Land name is required' });
    if (!form.ownership_type) return t('lands.smartConfirm.errors.ownership', { defaultValue: 'Ownership is required' });
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
      const centerGeoJSON = boundary.length >= 3 ? {
        type: 'Point',
        coordinates: [centroid.lng, centroid.lat],
      } : null;

      await landsApi.createLand({
        // Identity
        name: form.name.trim(),
        survey_number: form.survey_number?.trim() || undefined,
        ownership_type: form.ownership_type,
        area_acres: area.acres,
        area_guntas: area.guntha,
        area_sqft: area.sqft,
        // Geometry
        boundary_polygon_old: boundaryGeoJSON,
        center_point_old: centerGeoJSON,
        center_lat: centroid.lat,
        center_lon: centroid.lng,
        boundary_method: 'gps_points',
        gps_accuracy_meters: 10,
        gps_recorded_at: new Date().toISOString(),
        elevation_meters: form.elevation_meters,
        // Location (strings + IDs together — closes data-loss gap from old wizard)
        state: form.state, state_id: form.state_id,
        district: form.district, district_id: form.district_id,
        taluka: form.taluka, taluka_id: form.taluka_id,
        village: form.village, village_id: form.village_id,
        location_context: form.location_context,
        // Character
        soil_type: form.soil_type,
        water_source: form.water_source,
        irrigation_type: form.irrigation_type,
        // CURRENT crop cycle — write all 3 dates so downstream pipelines never see NULL
        current_crop: form.current_crop,
        current_crop_id: form.current_crop_id,
        crop_stage: cycle.stage !== '—' ? cycle.stage : undefined,
        planting_date: cycle.plantingDate || undefined,
        last_sowing_date: cycle.lastSowingDate || undefined,
        cultivation_date: cycle.cultivationDate || undefined,
        expected_harvest_date: cycle.expectedHarvestDate || undefined,
        // Previous cycle
        previous_crop: form.previous_crop,
        previous_crop_id: form.previous_crop_id,
        last_crop: form.previous_crop,
        last_harvest_date: form.last_harvest_date,
        // Misc
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

  // ───────────────────────── Picker (bottom sheet) ─────────────────────────
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

  const ownershipBtn = (kind: OwnershipType, label: string, emoji: string) => (
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
      <span className="text-xl">{emoji}</span>
      <span className="text-xs font-medium mt-1">{label}</span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[60] bg-background flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background">
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">
            {t('lands.smartConfirm.title', { defaultValue: 'Confirm your land' })}
          </h1>
          <p className="text-xs text-muted-foreground truncate">
            {area.acres.toFixed(2)} ac · {area.guntha.toFixed(1)} guntha · {Math.round(area.sqft).toLocaleString()} sqft
          </p>
        </div>
        {inference.isPending && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            {t('lands.smartConfirm.thinking', { defaultValue: 'AI…' })}
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4"
        style={{ paddingBottom: '160px' }}
      >
        {/* Location pill */}
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium truncate">
              {locationLabel || t('lands.smartConfirm.locationDetecting', { defaultValue: 'Detecting location…' })}
            </span>
          </div>
          {elevationLabel && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1.5">
              <Mountain className="h-3.5 w-3.5" />
              {t('lands.smartConfirm.elevation', { defaultValue: 'Elevation' })}: {elevationLabel}
            </div>
          )}
        </div>

        {/* Identity */}
        <div className="space-y-2">
          <Label htmlFor="land-name" className="text-xs">
            {t('lands.smartConfirm.name', { defaultValue: 'Land name' })} *
          </Label>
          <Input
            id="land-name"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t('lands.smartConfirm.namePlaceholder', { defaultValue: 'e.g. North field' })}
            className="h-12 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="survey" className="text-xs">
            {t('lands.smartConfirm.survey', { defaultValue: 'Survey number (optional)' })}
          </Label>
          <Input
            id="survey"
            value={form.survey_number}
            onChange={(e) => setForm(f => ({ ...f, survey_number: e.target.value }))}
            placeholder="e.g. 123/A"
            className="h-12 rounded-xl"
          />
        </div>

        {/* Ownership tiles */}
        <div>
          <Label className="text-xs mb-2 block">
            {t('lands.smartConfirm.ownership', { defaultValue: 'Ownership' })} *
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {ownershipBtn('owned',  t('lands.smartConfirm.owned',  { defaultValue: 'Owned' }),  '🏡')}
            {ownershipBtn('leased', t('lands.smartConfirm.leased', { defaultValue: 'Leased' }), '📜')}
            {ownershipBtn('shared', t('lands.smartConfirm.shared', { defaultValue: 'Shared' }), '🤝')}
          </div>
        </div>

        {/* Land character */}
        <div>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t('lands.smartConfirm.character', { defaultValue: 'Land character' })}
          </h3>
          <div className="space-y-2">
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
          </div>
        </div>

        {/* Current crop cycle — REQUIRED */}
        <div>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t('lands.smartConfirm.currentCycle', { defaultValue: 'Current crop cycle' })} *
          </h3>
          <div className="space-y-2">
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
                  {t('lands.smartConfirm.sowedOn', { defaultValue: 'Sowed on' })} *
                </Label>
                <SeasonPicker
                  value={form.sowing_date}
                  onChange={(iso) => setForm(f => ({ ...f, sowing_date: iso }))}
                />
                <Input
                  type="date"
                  value={form.sowing_date || ''}
                  onChange={(e) => setForm(f => ({ ...f, sowing_date: e.target.value }))}
                  className="h-11 rounded-xl mt-2"
                />
              </div>

              <div>
                <Label className="text-xs">
                  {t('lands.smartConfirm.landPrep', { defaultValue: 'Land prepared' })}
                </Label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  {[
                    { d: 0,  label: t('lands.smartConfirm.sameDay', { defaultValue: 'Same day' }) },
                    { d: 7,  label: '7 days earlier' },
                    { d: 14, label: '14 days earlier' },
                  ].map(opt => (
                    <button
                      key={opt.d}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, land_prep_offset_days: opt.d }))}
                      className={cn(
                        'rounded-xl px-2 py-2 text-xs border min-h-[44px]',
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
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-xl p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {t('lands.smartConfirm.expectedHarvest', { defaultValue: 'Expected harvest' })}:
                    <span className="font-medium text-foreground">{cycle.expectedHarvestDate}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sprout className="h-3.5 w-3.5" />
                    {t('lands.smartConfirm.stageNow', { defaultValue: 'Stage now' })}:
                    <span className="font-medium text-foreground">{cycle.stage}</span>
                    <span className="text-muted-foreground">({cycle.daysSinceSowing}d)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Previous cycle */}
        <div>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            {t('lands.smartConfirm.previousCycle', { defaultValue: 'Previous cycle (recommended)' })}
          </h3>
          <div className="space-y-2">
            <FieldChip
              label={t('lands.smartConfirm.previousCrop', { defaultValue: 'Previous crop' })}
              value={form.previous_crop ? labelFor(crops as any, form.previous_crop) : null}
              onClick={() => setPicker('previous_crop')}
            />
            <div>
              <Label className="text-xs">
                {t('lands.smartConfirm.lastHarvest', { defaultValue: 'Last harvest date' })}
              </Label>
              <Input
                type="date"
                value={form.last_harvest_date || ''}
                onChange={(e) => setForm(f => ({ ...f, last_harvest_date: e.target.value }))}
                className="h-11 rounded-xl mt-1"
              />
            </div>
          </div>
        </div>

        {/* More details */}
        <button
          type="button"
          onClick={() => setShowMore(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-border bg-card text-sm"
        >
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t('lands.smartConfirm.moreDetails', { defaultValue: 'More details' })}
          </span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', showMore && 'rotate-180')} />
        </button>
        {showMore && (
          <div className="space-y-3 px-1">
            <div>
              <Label htmlFor="notes" className="text-xs">
                {t('lands.smartConfirm.notes', { defaultValue: 'Notes' })}
              </Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="rounded-xl mt-1"
                placeholder={t('lands.smartConfirm.notesPlaceholder', { defaultValue: 'Anything else worth remembering…' })}
              />
            </div>
            <label className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
              <span className="flex items-center gap-2 text-sm">
                <GlassWater className="h-4 w-4" />
                {t('lands.smartConfirm.marketplace', { defaultValue: 'List on marketplace' })}
              </span>
              <input
                type="checkbox"
                checked={form.marketplace_enabled}
                onChange={(e) => setForm(f => ({ ...f, marketplace_enabled: e.target.checked }))}
                className="h-5 w-5"
              />
            </label>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div
        className="absolute bottom-0 inset-x-0 border-t border-border bg-background px-4 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="flex items-center gap-3">
          <LandVoiceCapture
            language={i18n.language?.split('-')[0] || 'en'}
            onTranscript={handleVoiceTranscript}
          />
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-14 rounded-2xl text-base font-semibold"
          >
            {saving
              ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />{t('common.saving', { defaultValue: 'Saving…' })}</>
              : <><Save className="h-5 w-5 mr-2" />{t('lands.smartConfirm.save', { defaultValue: 'Save Land' })}</>
            }
          </Button>
        </div>
      </div>

      {/* Picker bottom sheet */}
      <Sheet open={picker !== null} onOpenChange={(o) => !o && setPicker(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[75vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {picker === 'soil'          && t('lands.smartConfirm.soil', { defaultValue: 'Soil type' })}
              {picker === 'water'         && t('lands.smartConfirm.water', { defaultValue: 'Water source' })}
              {picker === 'irrigation'    && t('lands.smartConfirm.irrigation', { defaultValue: 'Irrigation type' })}
              {picker === 'crop'          && t('lands.smartConfirm.currentCrop', { defaultValue: 'Current crop' })}
              {picker === 'previous_crop' && t('lands.smartConfirm.previousCrop', { defaultValue: 'Previous crop' })}
            </SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {pickerItems.map((it: any) => (
              <button
                key={it.id || it.value}
                type="button"
                onClick={() => applyPick(it)}
                className="rounded-2xl border border-border bg-card px-3 py-3 text-sm text-left active:scale-[0.97]"
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
        </SheetContent>
      </Sheet>
    </div>
  );
}

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
