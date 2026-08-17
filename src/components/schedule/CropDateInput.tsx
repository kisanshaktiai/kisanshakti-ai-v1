import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronLeft, Sparkles, Droplets, AlertTriangle, Wheat } from 'lucide-react';
import { format, differenceInDays, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { CentralizedCropSelector } from '@/components/crops/CentralizedCropSelector';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import FarmingTypeDialog, { FarmingMode } from './FarmingTypeDialog';
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
    transplantDate?: Date | null
  ) => void;

  onBack: () => void;
  loading?: boolean;
}

const CropDateInput: React.FC<CropDateInputProps> = ({
  land,
  onSubmit,
  onBack,
  loading = false
}) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [cropId, setCropId] = useState('');
  const [cropName, setCropName] = useState('');
  const [localizedCropName, setLocalizedCropName] = useState('');
  const [cropVariety, setCropVariety] = useState('');
  const [sowingDate, setSowingDate] = useState<Date | undefined>(new Date());
  const [isReadyMadePlant, setIsReadyMadePlant] = useState(false);
  const [nurseryDays, setNurseryDays] = useState<number>(0);
  const [transplantDate, setTransplantDate] = useState<Date | undefined>(undefined);
  const [notTransplantedYet, setNotTransplantedYet] = useState(false);
  const [showFarmingTypeDialog, setShowFarmingTypeDialog] = useState(false);
  const [selectedFarmingType, setSelectedFarmingType] = useState<FarmingMode | null>(null);

  const [intercrops, setIntercrops] = useState<IntercropData[]>([]);
  const [showBackdatedConsent, setShowBackdatedConsent] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<{farmingType: FarmingMode} | null>(null);

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

    // Open farming type dialog instead of submitting directly
    console.log('🔔 [CropDateInput] Opening farming type dialog for:', cropName);
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
        effectiveTransplantDate
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

  const handleCropSelect = (id: string, name: string, localized: string, english: string) => {
    setCropId(id);
    setCropName(name);
    setLocalizedCropName(localized || name);
    
    // Reset intercrops when major crop changes
    setIntercrops([]);
    
    // Auto-suggest variety based on crop
    if (english.toLowerCase().includes('rice')) setCropVariety('IR-64');
    if (english.toLowerCase().includes('wheat')) setCropVariety('HD-2967');
    if (english.toLowerCase().includes('cotton')) setCropVariety('BT Cotton');
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-background via-accent/5 to-primary/5 pt-14 pb-16 overflow-hidden">
      {/* Full Screen Container with Modern Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-full flex flex-col"
      >
        {/* Fixed Header Bar */}
        <div className="px-4 py-3 bg-background/60 backdrop-blur-2xl border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="h-9 w-9 rounded-xl bg-background/50 hover:bg-primary/10 transition-all duration-300"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{land.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {land.area_acres} acres {land.area_guntas && `• ${land.area_guntas} guntas`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {land.soil_type && (
                <span className="text-xs px-2 py-1 rounded-full bg-white/50 dark:bg-black/30 backdrop-blur-sm">
                  {land.soil_type}
                </span>
              )}
              {land.water_source && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-info/10 border border-info/20">
                  <Droplets className="h-3 w-3 text-info" />
                  <span className="text-info dark:text-info">Water</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Full Height Crop Selection */}
        <div className="flex-1 overflow-hidden bg-background/40 backdrop-blur-sm">
          <CentralizedCropSelector
            selectedCropId={cropId}
            onSelect={handleCropSelect}
            className="h-full"
            showHeader={false}
            variant="compact"
            showSearch={true}
          />
        </div>
        
        {/* Bottom Fixed Panel for Variety & Date (Shows when crop selected) */}
        {cropName && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="bg-background/95 backdrop-blur-2xl border-t border-border/50 space-y-0 max-h-[55vh] flex flex-col shrink-0"
          >
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {/* Variety Input */}
              <div className="space-y-2">
                <Label htmlFor="variety" className="text-xs font-medium text-muted-foreground">
                  {t('schedule.crop_input.variety_label')}
                </Label>
                <Input
                  id="variety"
                  placeholder={t('schedule.crop_input.variety_placeholder')}
                  value={cropVariety}
                  onChange={(e) => setCropVariety(e.target.value)}
                  className="h-11 bg-white/50 dark:bg-black/20 backdrop-blur-sm border-white/30 dark:border-white/20 focus:border-primary/50 transition-all rounded-xl"
                />
              </div>

              {/* Multi-Intercrop Selector - 2030 Ready UI */}
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

              {/* Ready-made Plant Checkbox */}
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-accent/20 rounded-xl border border-border/50">
                  <input
                    type="checkbox"
                    id="ready-made-plant"
                    checked={isReadyMadePlant}
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
                      onChange={(e) => setNurseryDays(parseInt(e.target.value) || 0)}
                      className="h-11 bg-white/50 dark:bg-black/20 backdrop-blur-sm border-primary/30 focus:border-primary/50 transition-all rounded-xl"
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
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          disabled={notTransplantedYet}
                          className={cn(
                            'w-full justify-start text-left font-normal h-11 rounded-xl',
                            'bg-white/50 dark:bg-black/20 backdrop-blur-sm border-accent/30',
                            !transplantDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {transplantDate
                            ? format(transplantDate, 'PPP')
                            : t('schedule.crop_input.pick_date')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={transplantDate}
                          onSelect={(date) => date && setTransplantDate(date)}
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
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-11 rounded-xl",
                        "bg-white/50 dark:bg-black/20 backdrop-blur-sm",
                        "border-white/30 dark:border-white/20 hover:border-primary/50",
                        backdatedInfo.isBackdated && "border-warning/50",
                        !sowingDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {sowingDate ? format(sowingDate, "PPP") : t('schedule.crop_input.pick_date')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={sowingDate}
                      onSelect={(date) => date && setSowingDate(date)}
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

                {/* Backdated Warning Hint */}
                {backdatedInfo.isBackdated && (
                  <p className="text-xs text-warning dark:text-warning flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {t('schedule.crop_input.backdated_warning', 'Past date selected. You\'ll need to confirm consent for backdated schedule.')}
                  </p>
                )}
              </div>
            </div>

            {/* Fixed Submit Button at Bottom */}
            <div className="p-4 pt-2 border-t border-border/30 bg-background/90 backdrop-blur-sm shrink-0">
              <Button
                onClick={handleSubmit}
                disabled={!cropName || !sowingDate || loading}
                className="w-full h-14 rounded-xl text-base font-semibold bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg shadow-primary/25 transition-all active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Sparkles className="mr-2 h-5 w-5 animate-spin" />
                    {t('schedule.crop_input.generating')}
                  </>
                ) : (
                  <>
                    {t('schedule.crop_input.generate_ai_schedule')}
                    <Sparkles className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}

      </motion.div>

      {/* Farming Type Dialog */}
      <FarmingTypeDialog
        open={showFarmingTypeDialog}
        onOpenChange={setShowFarmingTypeDialog}
        onSelect={handleFarmingTypeSelect}
        cropName={localizedCropName || cropName}
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
