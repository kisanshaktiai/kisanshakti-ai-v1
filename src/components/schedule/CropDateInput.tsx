import { useVarietyMethodSuitability, type VarietyMethodConsent } from '@/hooks/useVarietyMethodSuitability';
import { VarietyMethodConsentDialog } from '@/components/schedule/VarietyMethodConsentDialog';
import { methodSuitabilityFor } from '@/lib/schedule/cultivationMethod';
import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { VarietySelector } from '@/components/crops/VarietySelector';
import { useCropVarieties } from '@/hooks/useCropVarieties';
import { useCropCultivationMethods } from '@/hooks/useCropCultivationMethods';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronLeft, Sparkles, Droplets, AlertTriangle, Wheat, Sprout, Check, Mountain } from 'lucide-react';

/** Localizes a raw land attribute value through the shared lands.wizard.* keys. */
const localizeLandValue = (
  t: (key: string, opts?: Record<string, unknown>) => string,
  group: 'soil_types' | 'water_sources' | 'irrigation_types',
  raw?: string | null,
): string => {
  if (!raw) return '';
  const slug = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return t(`lands.wizard.${group}.${slug}`, { defaultValue: raw });
};
import { format, differenceInDays, startOfDay, subDays } from 'date-fns';
import { formatFarmerDate } from '@/lib/dateFormat';
import { useLanguageStore } from '@/stores/languageStore';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { CentralizedCropSelector } from '@/components/crops/CentralizedCropSelector';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import FarmingTypeDialog, { FarmingMode, FARMING_OPTIONS } from './FarmingTypeDialog';
import BackdatedConsentDialog from './BackdatedConsentDialog';
import MultiIntercropSelector, { IntercropData } from './MultiIntercropSelector';

interface CropDateInputProps {
  land: {
    id: string;
    name: string;
    area_acres: number;
    area_guntas?: number;
    village?: string;
    district?: string;
    state?: string;
    soil_type?: string;
    water_source?: string;
  };
  onSubmit: (
    cropName: string, 
    cropVariety: string, 
    sowingDate: Date, 
    isReadyMadePlant: boolean, 
    farmingType: FarmingMode, 
    nurseryDays: number, 
    localizedCropName: string,
    intercrops?: IntercropData[],
    backdatedConsent?: boolean,
    /** Actual transplanting date (null when not transplanted yet / not applicable). */
    transplantDate?: Date | null,
    cropCycle?: string | null,
    cultivationMethod?: string | null,
    varietyMethodConsent?: VarietyMethodConsent | null
  ) => void;

  onBack: () => void;
  loading?: boolean;
  initialDraft?: { id: string; crop_name: string; crop_inputs: Record<string, unknown> } | null;
}

const CropDateInput: React.FC<CropDateInputProps> = ({
  land,
  onSubmit,
  onBack,
  loading = false,
  initialDraft = null,
}) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { currentLanguage } = useLanguageStore();
  const appLang = currentLanguage || 'en';
  const [cropId, setCropId] = useState('');
  const [cropName, setCropName] = useState('');
  const [localizedCropName, setLocalizedCropName] = useState('');
  const [cropVariety, setCropVariety] = useState('');
  const [wizardStep, setWizardStep] = useState<'variety' | 'planting'>('variety');
  const [varietyId, setVarietyId] = useState<string | null>(null);
  const [sowingDate, setSowingDate] = useState<Date | undefined>(new Date());
  const [isReadyMadePlant, setIsReadyMadePlant] = useState(false);
  const [nurseryDays, setNurseryDays] = useState<number>(0);
  const [transplantDate, setTransplantDate] = useState<Date | undefined>(undefined);
  const [sowingPickerOpen, setSowingPickerOpen] = useState(false);
  const [transplantPickerOpen, setTransplantPickerOpen] = useState(false);
  // Transplanting date = nursery sowing date + seedling age (days). Future result => not transplanted yet.
  const syncTransplantFromAge = (sowing: Date | undefined, ageDays: number) => {
    if (!sowing || !ageDays || ageDays < 1) return;
    const tp = startOfDay(new Date(startOfDay(sowing).getTime() + ageDays * 86400000));
    if (tp > startOfDay(new Date())) {
      setTransplantDate(undefined);
      setNotTransplantedYet(true);
    } else {
      setTransplantDate(tp);
      setNotTransplantedYet(false);
    }
  };
  const [cropCycleOptions, setCropCycleOptions] = useState<string[]>([]);
  const [cropCycle, setCropCycle] = useState<string>('');
  const [cycleOptionsLoading, setCycleOptionsLoading] = useState(false);
  const [cycleOptionsError, setCycleOptionsError] = useState(false);
  const [selectedCultivationMethod, setSelectedCultivationMethod] = useState('');
  const { options: cultivationOptions, loading: cultivationLoading, error: cultivationError } =
    useCropCultivationMethods(cropId || null, cropCycle || null);
  const selectedMethodInfo = cultivationOptions.find(option =>
    option.code === selectedCultivationMethod && option.hasCompleteCalendar);
  // Variety × method suitability straight from the agronomy DB (no client-side agronomy).
  const suitabilityRows = useVarietyMethodSuitability(varietyId);
  const [methodConsent, setMethodConsent] = useState<VarietyMethodConsent | null>(null);
  const [consentPrompt, setConsentPrompt] = useState<{ code: string; requiresNursery: boolean } | null>(null);
  const methodLabelOf = (o: { nameEn: string; nameHi: string | null; nameMr: string | null }) =>
    (appLang.startsWith('mr') ? o.nameMr : appLang.startsWith('hi') ? o.nameHi : null) || o.nameEn;
  const recommendedLabels = cultivationOptions
    .filter(o => o.hasCompleteCalendar && methodSuitabilityFor(o, suitabilityRows).state === 'recommended')
    .map(methodLabelOf);
  const applyMethod = (code: string, requiresNursery: boolean) => {
    setSelectedCultivationMethod(code);
    setIsReadyMadePlant(requiresNursery);
    setNurseryDays(0);
    setTransplantDate(undefined);
    setNotTransplantedYet(false);
    setMethodConsent(null);
  };
  useEffect(() => { setMethodConsent(null); }, [varietyId]);
  const cultivationReady = !cultivationLoading && !cultivationError && !!selectedMethodInfo;
  const [notTransplantedYet, setNotTransplantedYet] = useState(false);
  const [showFarmingTypeDialog, setShowFarmingTypeDialog] = useState(false);
  const [selectedFarmingType, setSelectedFarmingType] = useState<FarmingMode | null>(null);

  const [intercrops, setIntercrops] = useState<IntercropData[]>([]);
  const [showBackdatedConsent, setShowBackdatedConsent] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<{farmingType: FarmingMode} | null>(null);

  // Restore verified farmer selections; never infer a missing variety, method or
  // farming policy. This review screen has no executable tasks or chemical doses.
  useEffect(() => {
    if (!initialDraft?.id) return;
    const values = initialDraft.crop_inputs;
    const selectedName = typeof values.cropName === 'string' ? values.cropName : initialDraft.crop_name;
    let cancelled = false;
    (async () => {
      const { data: exact, error: cropError } = await supabase.from('crops')
        .select('id,label,value').eq('label', selectedName).eq('is_active', true).maybeSingle();
      if (cropError) throw cropError;
      const { data: byCode, error: codeError } = exact ? {data: exact,error:null} : await supabase.from('crops')
        .select('id,label,value').eq('value', selectedName.toLowerCase().replace(/\s+/g, '_')).eq('is_active', true).maybeSingle();
      if (codeError) throw codeError;
      if (!byCode || cancelled) return;
      setCropId(byCode.id);
      setCropName(byCode.label);
      setLocalizedCropName(typeof values.localizedCropName === 'string' ? values.localizedCropName : byCode.label);
      setCropVariety(typeof values.cropVariety === 'string' ? values.cropVariety : '');
      const parseDay = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
        ? new Date(v + 'T00:00:00') : undefined;
      const sow = parseDay(values.sowingDate);
      if (sow && !Number.isNaN(sow.getTime())) setSowingDate(sow);
      const transplant = parseDay(values.transplantDate);
      setTransplantDate(transplant && !Number.isNaN(transplant.getTime()) ? transplant : undefined);
      setIsReadyMadePlant(values.isReadyMadePlant === true);
      setNurseryDays(typeof values.nurseryDays === 'number' && Number.isFinite(values.nurseryDays) ? values.nurseryDays : 0);
      const mode = FARMING_OPTIONS.find(option => option.mode === values.farmingType)?.mode;
      setSelectedFarmingType(mode ?? null);
      setSelectedCultivationMethod(typeof values.cultivationMethod === 'string' ? values.cultivationMethod : '');
      const restoredIntercrops = Array.isArray(values.intercrops)
        ? (values.intercrops as IntercropData[]).filter(ic => typeof ic.cropName === 'string' &&
            Number.isFinite(ic.areaPercent) && ic.areaPercent > 0 && ic.areaPercent <= 100).slice(0, 3)
        : [];
      setIntercrops(restoredIntercrops);
      setWizardStep('variety');
    })().catch(error => console.warn('[CropDateInput] Draft restore failed', error));
    return () => { cancelled = true; };
  }, [initialDraft?.id, land.id]);

  // Map a draft's variety back to a real catalogue record, never pick a different one.
  useEffect(() => {
    if (!initialDraft?.id) return;
    const requested = String(initialDraft.crop_inputs.cropVariety ?? '').trim();
    const match = varieties.find(v => v.name.toLowerCase() === requested.toLowerCase());
    if (match) setVarietyId(match.id);
  }, [initialDraft?.id, varieties]);


  // Calculate total area for display
  const totalIntercropArea = useMemo(() => {
    return intercrops.reduce((sum, ic) => sum + (ic.areaPercent || 0), 0);
  }, [intercrops]);

  // Calculate if date is backdated
  const backdatedInfo = useMemo(() => {
    if (!sowingDate) return { isBackdated: false, daysAgo: 0 };
    const today = startOfDay(new Date());
    const selectedDate = startOfDay(sowingDate);
    const daysDiff = differenceInDays(today, selectedDate);
    return {
      isBackdated: daysDiff > 0,
      daysAgo: daysDiff,
    };
  }, [sowingDate]);

  // Crop cycle options come from active crop-stage records, not a crop-name guess.
  useEffect(() => {
    let cancelled = false;
    setCropCycleOptions([]);
    setCropCycle('');
    setCycleOptionsError(false);
    if (!cropId) return;
    setCycleOptionsLoading(true);
    (async () => {
      const { data: cropRow, error: cropError } = await supabase
        .from('crops').select('value').eq('id', cropId).maybeSingle();
      if (cropError || !cropRow?.value) throw new Error('Crop master lookup unavailable');
      const { data: stages, error: stageError } = await supabase
        .from('crop_stage_master')
        .select('crop_cycle')
        .eq('crop_code', String(cropRow.value)).eq('is_active', true);
      if (stageError) throw stageError;
      const distinct = [...new Set((stages || [])
        .map((r) => String(r.crop_cycle || '').toLowerCase())
        .filter((v) => v && v !== 'universal'))].sort();
      if (!cancelled) {
        setCropCycleOptions(distinct);
        const requested = typeof initialDraft?.crop_inputs.cropCycle === 'string'
          ? initialDraft.crop_inputs.cropCycle : '';
        if (requested && (distinct.includes(requested) || (requested === 'universal' && !distinct.length)))
          setCropCycle(requested);
        else if (distinct.length === 1) setCropCycle(distinct[0]);
      }
    })().catch((err) => {
      if (!cancelled) {
        console.error('[CropDateInput] crop cycle selection unavailable:', err);
        setCropCycleOptions([]);
        setCycleOptionsError(true);
      }
    }).finally(() => { if (!cancelled) setCycleOptionsLoading(false); });
    return () => { cancelled = true; };
  }, [cropId, initialDraft?.id]);

  // ── Variety source: master_products is the variety SSOT (shared, cached hook) ──
  const { varieties, loading: varietiesLoading } = useCropVarieties(cropId || null);

  // Pre-select the land's current variety (SSOT: lands.current_crop_variety_id).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!cropId || initialDraft?.id) return;
      const { data: landRow } = await supabase
        .from('lands')
        .select('current_crop_variety_id')
        .eq('id', land.id)
        .maybeSingle();
      if (cancelled) return;
      const currentId = landRow?.current_crop_variety_id ?? null;
      if (currentId) setVarietyId(currentId);
    };
    load();
    return () => { cancelled = true; };
  }, [cropId, land.id, initialDraft?.id]);

  // Resolve the selected variety's name once the catalogue arrives
  // (keeps the existing onSubmit(cropVariety) contract).
  useEffect(() => {
    if (!varietyId) return;
    const match = varieties.find((v) => v.id === varietyId);
    if (match) setCropVariety(match.name);
  }, [varietyId, varieties]);

  // Single-variety convenience pre-selection.
  useEffect(() => {
    if (!varietyId && !cropVariety && varieties.length === 1) {
      setVarietyId(varieties[0].id);
      setCropVariety(varieties[0].name);
    }
  }, [varieties, varietyId, cropVariety]);

  const handleSubmit = () => {
    if (!cropName) {
      toast({
        title: t('schedule.crop_input.select_crop'),
        description: t('schedule.crop_input.please_select_crop'),
        variant: 'destructive',
      });
      return;
    }
    
    if (!sowingDate) {
      toast({
        title: t('schedule.crop_input.select_date'),
        description: t('schedule.crop_input.please_select_date'),
        variant: 'destructive',
      });
      return;
    }

    // Transplanting lane: validate the captured transplant date (if any).
    if (isReadyMadePlant && !notTransplantedYet && transplantDate) {
      const today = startOfDay(new Date());
      const tp = startOfDay(transplantDate);
      if (tp > today) {
        toast({
          title: t('schedule.crop_input.transplant_date_label', 'Transplanting date'),
          description: t(
            'schedule.crop_input.transplant_future_error',
            'Transplanting date cannot be in the future.'
          ),
          variant: 'destructive',
        });
        return;
      }
      if (tp < startOfDay(sowingDate)) {
        toast({
          title: t('schedule.crop_input.transplant_date_label', 'Transplanting date'),
          description: t(
            'schedule.crop_input.transplant_before_sowing_error',
            'Transplanting date cannot be before the nursery sowing date.'
          ),
          variant: 'destructive',
        });
        return;
      }
    }

    if (cycleOptionsLoading || cycleOptionsError || (cropCycleOptions.length > 1 && !cropCycle)) {
      toast({
        title: t('schedule.crop_input.crop_cycle_label', 'Crop cycle'),
        description: t('schedule.crop_input.crop_cycle_required', 'Select the crop cycle to use the correct agronomy schedule.'),
        variant: 'destructive',
      });
      return;
    }

    if (!cultivationReady || selectedMethodInfo?.requiresNursery !== isReadyMadePlant) {
      toast({
        title: t('schedule.crop_input.cultivation_method_title', 'Crop establishment method'),
        description: t('schedule.crop_input.cultivation_method_required',
          'Choose the correct planting method with a complete crop calendar before generating a schedule.'),
        variant: 'destructive',
      });
      return;
    }

    // The farming method is chosen inline on this screen. The dialog only opens as a
    // fallback when nothing has been picked yet.
    if (selectedFarmingType) {
      handleFarmingTypeSelect(selectedFarmingType);
      return;
    }
    setShowFarmingTypeDialog(true);
  };


  const handleFarmingTypeSelect = (farmingType: FarmingMode) => {
    console.log('✅ [CropDateInput] Farming type selected:', farmingType);
    setSelectedFarmingType(farmingType);
    setShowFarmingTypeDialog(false);

    // Check if backdated consent is needed
    if (backdatedInfo.isBackdated && backdatedInfo.daysAgo > 0) {
      setPendingSubmitData({ farmingType });
      setShowBackdatedConsent(true);
    } else {
      // No backdated consent needed, proceed directly
      proceedWithSubmit(farmingType, false);
    }
  };

  const proceedWithSubmit = (farmingType: FarmingMode, backdatedConsent: boolean) => {
    if (sowingDate) {
      const effectiveTransplantDate =
        isReadyMadePlant && !notTransplantedYet && transplantDate ? transplantDate : null;
      console.log('🚀 [CropDateInput] Calling onSubmit with:', {
        cropName,
        farmingType,
        nurseryDays,
        intercrops,
        backdatedConsent,
        transplantDate: effectiveTransplantDate,
      });
      onSubmit(
        cropName, 
        cropVariety, 
        sowingDate, 
        isReadyMadePlant, 
        farmingType, 
        nurseryDays, 
        localizedCropName,
        intercrops,
        backdatedConsent,
        effectiveTransplantDate,
        cropCycle || null,
        selectedCultivationMethod || null,
        methodConsent
      );

    }
  };

  const handleBackdatedConsentConfirm = () => {
    setShowBackdatedConsent(false);
    if (pendingSubmitData) {
      proceedWithSubmit(pendingSubmitData.farmingType, true);
      setPendingSubmitData(null);
    }
  };

  const handleBackdatedConsentCancel = () => {
    setShowBackdatedConsent(false);
    setPendingSubmitData(null);
    // Reset date to today
    setSowingDate(new Date());
  };

  const handleCropSelect = (id: string, name: string, localized: string, _english: string) => {
    setCropId(id);
    setCropName(name);
    setLocalizedCropName(localized || name);

    // Reset intercrops when major crop changes
    setIntercrops([]);

    // Clear stale variety; the VarietySelector re-loads from master_products.
    setVarietyId(null);
    setCropVariety('');
    setWizardStep('variety');
    setSelectedCultivationMethod('');
    setIsReadyMadePlant(false);
    setNurseryDays(0);
    setTransplantDate(undefined);
    setNotTransplantedYet(false);
  };

  const handleChangeCrop = () => {
    setCropId('');
    setCropName('');
    setLocalizedCropName('');
    setVarietyId(null);
    setCropVariety('');
    setIntercrops([]);
    setWizardStep('variety');
    setSelectedCultivationMethod('');
    setIsReadyMadePlant(false);
    setNurseryDays(0);
    setTransplantDate(undefined);
    setNotTransplantedYet(false);
  };

  return (
    <div className="fixed inset-0 z-40 bg-background pt-14 pb-nav-safe overflow-hidden">
      {/* Full Screen Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-full flex flex-col"
      >
        {/* Compact land strip — one row: back + land identity + real attribute chips.
            Opaque (no backdrop-blur) for mobile FPS. */}
        <div className="px-3 py-2 bg-background border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-9 w-9 shrink-0 rounded-xl bg-muted/60 hover:bg-primary/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="min-w-0 shrink-0 max-w-[42%]">
              <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
                {land.name}
              </h3>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">
                {[land.village, land.district].filter(Boolean).join(', ')}
              </p>
            </div>

            {/* Attribute chips — DB values only, horizontally scrollable */}
            <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary whitespace-nowrap">
                <Wheat className="h-3 w-3" />
                {land.area_acres}
                {land.area_guntas ? ` • ${land.area_guntas}g` : ''}
              </span>
              {land.soil_type && (
                <span className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-muted border border-border/60 text-[11px] font-medium text-foreground whitespace-nowrap">
                  <Mountain className="h-3 w-3 text-muted-foreground" />
                  {localizeLandValue(t, 'soil_types', land.soil_type)}
                </span>
              )}
              {land.water_source && (
                <span className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-info/10 border border-info/20 text-[11px] font-medium text-foreground whitespace-nowrap">
                  <Droplets className="h-3 w-3 text-info" />
                  {localizeLandValue(t, 'water_sources', land.water_source)}
                </span>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!cropName ? (
            /* ── STEP 1: Full-height crop picker ─────────────────────────── */
            <motion.div
              key="crop-picker"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              className="flex-1 min-h-0 overflow-hidden bg-background"
            >
              <CentralizedCropSelector
                selectedCropId={cropId}
                onSelect={handleCropSelect}
                className="h-full"
                showHeader={false}
                variant="compact"
                showSearch={true}
              />
            </motion.div>
          ) : (
            /* ── STEP 2: Crop locked — variety & schedule details get the full screen ── */
            <motion.div
              key="crop-details"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.2 }}
              className="flex-1 min-h-0 flex flex-col bg-background"
            >
              {/* One compact selection strip — crop, chosen details and change action. */}
              <div className="px-3 py-2 bg-primary/5 border-b border-primary/15 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Sprout className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate leading-tight">
                      {localizedCropName || cropName}
                    </p>
                    {localizedCropName && cropName && localizedCropName !== cropName && (
                      <p className="text-[11px] text-muted-foreground truncate leading-tight">{cropName}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground truncate leading-tight">
                      {[cropVariety, sowingDate && wizardStep === 'planting' ? formatFarmerDate(sowingDate, appLang) : null].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleChangeCrop}
                    className="h-8 rounded-full px-3 text-xs shrink-0 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    {t('common.change', 'Change')}
                  </Button>
                </div>
              </div>

              {/* Scrollable content — variety first (most critical decision) */}
              <div className="flex-1 min-h-0 overflow-y-auto mobile-scroll-container">
                <div className="p-3 pb-5 space-y-4">
                  {wizardStep === 'variety' && (
                  /* Variety — tap-a-card picker from master_products (SSOT), free-text fallback */
                  <div className="space-y-2">

                    {varietiesLoading && varieties.length === 0 ? (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground">
                          {t('schedule.crop_input.variety_label')}
                        </Label>
                        <p className="text-xs text-muted-foreground italic">
                          {t('schedule.crop_input.variety_loading', 'Loading varieties…')}
                        </p>
                      </div>
                    ) : varieties.length > 0 ? (
                      <VarietySelector
                        cropId={cropId}
                        value={varietyId}
                        onChange={(v) => {
                          setVarietyId(v?.id ?? null);
                          setCropVariety(v?.name ?? '');
                        }}
                        onManualSubmit={(proposedName) => {
                          setVarietyId(null);
                          setCropVariety(proposedName);
                        }}
                        label={t('schedule.crop_input.variety_label')}
                        cropName={cropName}
                        regionState={land.state}
                      />
                    ) : (
                      <>
                        <Label htmlFor="variety" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                          <Sprout className="h-3.5 w-3.5 text-primary" />
                          {t('schedule.crop_input.variety_label')}
                        </Label>
                        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 space-y-2">
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            {t(
                              'schedule.variety.none_for_crop',
                              'No seed varieties are listed for this crop yet. You can type the variety name you sowed.'
                            )}
                          </p>
                          <Input
                            id="variety"
                            placeholder={t('schedule.crop_input.variety_placeholder')}
                            value={cropVariety}
                            onChange={(e) => setCropVariety(e.target.value)}
                            className="h-12 bg-card border-border focus:border-primary/50 transition-all rounded-xl"
                          />
                        </div>
                      </>
                    )}

                  </div>

                  )}

                  {wizardStep === 'planting' && (
                  <>
                  {/* Explicit choice only when the stage graph defines several crop cycles. */}
                  {cropCycleOptions.length > 1 && (
                    <div className="space-y-2">
                      <Label htmlFor="crop-cycle" className="text-sm font-medium">
                        {t('schedule.crop_input.crop_cycle_label', 'Crop cycle')}
                      </Label>
                      <select id="crop-cycle" value={cropCycle}
                        onChange={(e) => {
                          setCropCycle(e.target.value);
                          setSelectedCultivationMethod('');
                          setIsReadyMadePlant(false);
                          setNurseryDays(0);
                          setTransplantDate(undefined);
                          setNotTransplantedYet(false);
                        }}
                        className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" required>
                        <option value="">{t('schedule.crop_input.crop_cycle_required', 'Choose crop cycle')}</option>
                        {cropCycleOptions.map(code => <option key={code} value={code}>{code.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                  )}
                  {/* Crop establishment controls phenology; organic/chemical farming is separate. */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      {t('schedule.crop_input.cultivation_method_title', 'How are you establishing this crop?')}
                    </Label>
                    {cultivationLoading || cycleOptionsLoading ? (
                      <p className="text-xs text-muted-foreground">
                        {t('schedule.crop_input.cultivation_loading', 'Loading planting methods…')}
                      </p>
                    ) : cultivationError || cycleOptionsError ? (
                      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                        <p className="text-sm text-destructive">
                          {t('schedule.crop_input.cultivation_load_failed',
                            'Could not load crop planting methods. Please retry by reselecting the crop.')}
                        </p>
                      </div>
                    ) : cropCycleOptions.length > 1 && !cropCycle ? (
                      <p className="text-xs text-muted-foreground">
                        {t('schedule.crop_input.choose_cycle_first', 'Choose the crop cycle first.')}
                      </p>
                    ) : cultivationOptions.length ? (
                      <div className="grid grid-cols-1 gap-2">
                        {cultivationOptions.map(option => {
                          const active = selectedCultivationMethod === option.code;
                          const disabled = !option.hasCompleteCalendar;
                          const suit = methodSuitabilityFor(option, suitabilityRows);
                          const label = appLang.startsWith('mr') ? option.nameMr
                            : appLang.startsWith('hi') ? option.nameHi : null;
                          return (
                            <button key={option.code} type="button" disabled={disabled}
                              aria-pressed={active}
                              onClick={() => {
                                if (suit.state === 'not_recommended') {
                                  setConsentPrompt({ code: option.code, requiresNursery: option.requiresNursery });
                                  return;
                                }
                                applyMethod(option.code, option.requiresNursery);
                              }}
                              className={cn(
                                'min-h-[58px] w-full rounded-xl border-2 p-3 text-left',
                                active ? 'border-primary bg-primary/10' : 'border-border bg-card',
                                disabled && 'opacity-60 cursor-not-allowed'
                              )}>
                              <span className="flex items-center gap-2">
                                <span className="flex-1 text-sm font-semibold text-foreground">{label || option.nameEn}</span>
                                {active && <Check className="h-4 w-4 text-primary" />}
                              </span>
                              {label && <span className="block text-xs text-muted-foreground">{option.nameEn}</span>}
                              {suit.state === 'recommended' && <span className="mt-1 inline-block rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                                {t('schedule.method_consent.badge_recommended', 'Recommended for this variety')}
                              </span>}
                              {suit.state === 'not_recommended' && <span className="mt-1 block text-xs font-medium text-warning">
                                {t('schedule.method_consent.badge_not_recommended', 'Not recommended for this variety')}
                                {suit.unsuitable[0]?.limiting_factor && suit.unsuitable[0].limiting_factor !== 'none' ? ` — ${suit.unsuitable[0].limiting_factor}` : ''}
                              </span>}
                              {disabled && <span className="block text-xs text-warning mt-1">
                                {t('schedule.crop_input.calendar_unverified', 'Full-season crop calendar not verified for this method/cycle yet.')}
                              </span>}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-warning">
                        {t('schedule.crop_input.no_planting_methods', 'No approved planting-method calendar is available for this crop.')}
                      </p>
                    )}
                  </div>
                  {/* Date Selection */}
                  <div className="space-y-2">

                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">
                        {isReadyMadePlant ? t('schedule.crop_input.planting_date') : t('schedule.crop_input.sowing_date')}
                      </span>
                      {backdatedInfo.isBackdated && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-warning/10 border border-warning/30 text-warning dark:text-warning">
                          <AlertTriangle className="h-3 w-3" />
                          {backdatedInfo.daysAgo}d ago
                        </span>
                      )}
                    </div>

                    {/* Quick-pick chips — the common cases without opening a calendar */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'today', days: 0 },
                        { key: 'yesterday', days: 1 },
                        { key: 'week_ago', days: 7 },
                        { key: 'fifteen_days_ago', days: 15 },
                        { key: 'month_ago', days: 30 },
                      ].map((opt) => {
                        const chipDate = startOfDay(subDays(new Date(), opt.days));
                        const active = sowingDate && startOfDay(sowingDate).getTime() === chipDate.getTime();
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSowingDate(chipDate); if (isReadyMadePlant) syncTransplantFromAge(chipDate, nurseryDays); }}
                            className={cn(
                               'min-h-[44px] rounded-xl border px-2 text-xs font-medium transition-colors active:scale-[0.98]',
                              active
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-card border-border text-foreground',
                            )}
                          >
                            {t(`schedule.crop_input.quick_date.${opt.key}`)}
                          </button>
                        );
                      })}
                    </div>

                    <Popover open={sowingPickerOpen} onOpenChange={setSowingPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal h-12 rounded-xl",
                            "bg-card border-border hover:border-primary/50",
                            backdatedInfo.isBackdated && "border-warning/50",
                            !sowingDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {sowingDate ? formatFarmerDate(sowingDate, appLang) : t('schedule.crop_input.quick_date.choose_date')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={sowingDate}
                          onSelect={(date) => { if (!date) return; setSowingDate(date); setSowingPickerOpen(false); if (isReadyMadePlant) syncTransplantFromAge(date, nurseryDays); }}
                          initialFocus
                          // Allow past dates up to 180 days (6 months) for existing crops
                          disabled={(date) => {
                            const today = new Date();
                            const sixMonthsAgo = new Date();
                            sixMonthsAgo.setMonth(today.getMonth() - 6);
                            const oneYearFromNow = new Date();
                            oneYearFromNow.setFullYear(today.getFullYear() + 1);
                            return date < sixMonthsAgo || date > oneYearFromNow;
                          }}
                        />
                      </PopoverContent>
                    </Popover>

                    {sowingDate && (
                      <p className="text-xs text-muted-foreground">
                        {backdatedInfo.isBackdated
                          ? t('schedule.crop_input.quick_date.days_ago_note', { days: backdatedInfo.daysAgo })
                          : t('schedule.crop_input.quick_date.today_note')}
                      </p>
                    )}

                    {/* Backdated Warning Hint */}
                    {backdatedInfo.isBackdated && (
                      <p className="text-xs text-warning dark:text-warning flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {t('schedule.crop_input.backdated_warning', 'Past date selected. You\'ll need to confirm consent for backdated schedule.')}
                      </p>
                    )}
                  </div>

                  {/* Ready-made Plant Checkbox */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-accent/20 rounded-xl border border-border/50">
                      <input
                        type="checkbox"
                        id="ready-made-plant"
                        checked={isReadyMadePlant}
                        disabled={!!selectedMethodInfo}
                        onChange={(e) => {
                          setIsReadyMadePlant(e.target.checked);
                          if (!e.target.checked) {
                            setNurseryDays(0);
                            setTransplantDate(undefined);
                            setNotTransplantedYet(false);
                          }
                        }}

                        className="mt-1 h-5 w-5 rounded border-border accent-primary"
                      />
                      <div className="flex-1">
                        <Label htmlFor="ready-made-plant" className="text-sm font-medium cursor-pointer">
                          {t('schedule.crop_input.ready_made_plant')}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t('schedule.crop_input.ready_made_description')}
                        </p>
                      </div>
                    </div>

                    {/* Nursery Days Input - Only shown when ready-made plant is selected */}
                    {isReadyMadePlant && (
                      <div className="p-3 bg-primary/10 rounded-xl border border-primary/30 space-y-2">
                        <Label htmlFor="nursery-days" className="text-xs font-medium text-primary">
                          {t('schedule.crop_input.nursery_days_label', 'Plant age (days from seed sowing)')}
                        </Label>
                        <Input
                          id="nursery-days"
                          type="number"
                          min={1}
                          max={90}
                          placeholder={t('schedule.crop_input.nursery_days_placeholder', 'e.g., 25, 30, 45 days')}
                          value={nurseryDays || ''}
                          onChange={(e) => { const v = parseInt(e.target.value) || 0; setNurseryDays(v); if (isReadyMadePlant) syncTransplantFromAge(sowingDate, v); }}
                          className="h-12 bg-card border-primary/30 focus:border-primary/50 transition-all rounded-xl"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('schedule.crop_input.nursery_days_help', 'Enter how many days old the nursery plant is. Schedule will start from transplanting.')}
                        </p>
                      </div>
                    )}

                    {/* Transplanting Date - biological anchor for transplanted crops */}
                    {isReadyMadePlant && (
                      <div className="p-3 bg-accent/10 rounded-xl border border-accent/30 space-y-2">
                        <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                          <CalendarIcon className="h-3.5 w-3.5" />
                          {t('schedule.crop_input.transplant_date_label', 'Transplanting date')}
                        </Label>
                        <Popover open={transplantPickerOpen} onOpenChange={setTransplantPickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              disabled={notTransplantedYet}
                              className={cn(
                                'w-full justify-start text-left font-normal h-12 rounded-xl',
                                'bg-card border-accent/30',
                                !transplantDate && 'text-muted-foreground'
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {transplantDate
                                ? formatFarmerDate(transplantDate, appLang)
                                : t('schedule.crop_input.pick_date')}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={transplantDate}
                              onSelect={(date) => { if (!date) return; setTransplantDate(date); setTransplantPickerOpen(false); if (sowingDate) { const d = differenceInDays(startOfDay(date), startOfDay(sowingDate)); if (d > 0) setNurseryDays(d); } }}
                              initialFocus
                              disabled={(date) => {
                                const today = startOfDay(new Date());
                                const min = sowingDate ? startOfDay(sowingDate) : undefined;
                                return date > today || (!!min && date < min);
                              }}
                              className={cn('p-3 pointer-events-auto')}
                            />
                          </PopoverContent>
                        </Popover>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="not-transplanted-yet"
                            checked={notTransplantedYet}
                            onChange={(e) => {
                              setNotTransplantedYet(e.target.checked);
                              if (e.target.checked) setTransplantDate(undefined);
                            }}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          <Label htmlFor="not-transplanted-yet" className="text-xs cursor-pointer">
                            {t('schedule.crop_input.not_transplanted_yet', 'Not transplanted yet')}
                          </Label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            'schedule.crop_input.transplant_date_help',
                            'Used to time stage advice for transplanted crops.'
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Farming method — chosen inline (it decides which inputs the schedule uses) */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Sprout className="h-3.5 w-3.5 text-primary" />
                      {t('schedule.method.title')}
                    </Label>
                    <p className="text-[11px] text-muted-foreground -mt-1">
                      {t('schedule.method.subtitle')}
                    </p>
                    <div className="space-y-2">
                      {FARMING_OPTIONS.map((option) => {
                        const active = selectedFarmingType === option.mode;
                        return (
                          <button
                            key={option.mode}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedFarmingType(option.mode); }}
                            className={cn(
                              'w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left min-h-[64px] transition-colors active:scale-[0.99]',
                              active ? option.borderColor : 'border-border',
                              active ? option.bgColor : 'bg-card',
                            )}
                          >
                            <span className={cn('shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-card border', option.borderColor, option.color)}>
                              {option.icon}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className={cn('block font-semibold text-sm', active ? option.color : 'text-foreground')}>
                                {t(`schedule.method.${option.mode}_title`)}
                              </span>
                              <span className="block text-xs text-muted-foreground mt-0.5">
                                {t(`schedule.method.${option.mode}_subtitle`)}
                              </span>
                              <span className="block text-[11px] text-muted-foreground/80 mt-0.5">
                                {t(`schedule.method.${option.mode}_tradeoff`)}
                              </span>
                            </span>
                            {active && <Check className={cn('h-4 w-4 shrink-0', option.color)} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Multi-Intercrop Selector - optional, last */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Wheat className="h-3.5 w-3.5" />
                        {t('schedule.crop_input.intercrop_label', 'Intercrops (Optional)')}
                      </Label>
                      {intercrops.length > 0 && (
                        <span className="text-[10px] font-semibold text-success dark:text-success bg-success/10 px-2 py-0.5 rounded-full">
                          {intercrops.length}/3 • {totalIntercropArea}% area
                        </span>
                      )}
                    </div>
                    <MultiIntercropSelector
                      majorCropName={cropName}
                      intercrops={intercrops}
                      onIntercropsChange={setIntercrops}
                      maxIntercrops={3}
                    />
                  </div>

                  {/* Selected-variety confirmation strip (scroll anchor reassurance) */}
                  {varietyId && cropVariety && (
                    <div className="flex items-center gap-2 rounded-xl bg-success/10 border border-success/25 px-3 py-2.5">
                      <Check className="h-4 w-4 text-success shrink-0" />
                      <p className="text-xs font-medium text-success truncate">{cropVariety}</p>
                    </div>
                  )}
                  </>
                  )}

                </div>
              </div>

              {/* Mobile decision footer — one primary decision per step */}
              <div className="p-4 pt-3 border-t border-border/40 bg-background shrink-0">
                {wizardStep === 'variety' ? (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      disabled={loading}
                      onClick={() => setWizardStep('planting')}
                      className="w-full h-14 rounded-2xl text-base font-semibold"
                    >
                      {t('schedule.crop_input.next', 'Next')}
                    </Button>
                    {!cropVariety && (
                      <p className="text-xs text-center text-muted-foreground">
                        {t('schedule.crop_input.variety_optional_hint', "Don't know the variety? You can continue without it.")}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setWizardStep('variety')}
                      className="h-14 rounded-2xl px-4 shrink-0"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={!cropName || !sowingDate || loading || cycleOptionsLoading || cycleOptionsError || (cropCycleOptions.length > 1 && !cropCycle) || !cultivationReady}
                      className="flex-1 h-14 rounded-2xl text-base font-semibold"
                    >
                      {loading ? <><Sparkles className="mr-2 h-5 w-5 animate-spin" />{t('schedule.crop_input.generating')}</> : <>{t('schedule.crop_input.generate_ai_schedule')}<Sparkles className="ml-2 h-5 w-5" /></>}
                    </Button>
                  </div>
                )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>

      {/* Farming Type Dialog */}
      <FarmingTypeDialog
        open={showFarmingTypeDialog}
        onOpenChange={setShowFarmingTypeDialog}
        onSelect={handleFarmingTypeSelect}
        cropName={localizedCropName || cropName}
      />

      <VarietyMethodConsentDialog
        open={!!consentPrompt}
        varietyName={cropVariety}
        methodLabel={(() => { const o = cultivationOptions.find(x => x.code === consentPrompt?.code); return o ? methodLabelOf(o) : ''; })()}
        evidence={consentPrompt ? methodSuitabilityFor({ code: consentPrompt.code, stageClockMethod: cultivationOptions.find(o => o.code === consentPrompt.code)?.stageClockMethod ?? null }, suitabilityRows).unsuitable : []}
        recommendedLabels={recommendedLabels}
        onCancel={() => setConsentPrompt(null)}
        onAccept={() => {
          if (!consentPrompt) return;
          const rows = consentPrompt ? methodSuitabilityFor({ code: consentPrompt.code, stageClockMethod: cultivationOptions.find(o => o.code === consentPrompt.code)?.stageClockMethod ?? null }, suitabilityRows).unsuitable : [];
          applyMethod(consentPrompt.code, consentPrompt.requiresNursery);
          setMethodConsent({ accepted: true, evidenceIds: rows.map(r => r.id) });
          setConsentPrompt(null);
        }}
      />

      {/* Backdated Consent Dialog */}
      <BackdatedConsentDialog
        open={showBackdatedConsent}
        onOpenChange={setShowBackdatedConsent}
        onConfirm={handleBackdatedConsentConfirm}
        onCancel={handleBackdatedConsentCancel}
        sowingDate={sowingDate || new Date()}
        daysAgo={backdatedInfo.daysAgo}
        cropName={localizedCropName || cropName}
      />
    </div>
  );
};

export default CropDateInput;