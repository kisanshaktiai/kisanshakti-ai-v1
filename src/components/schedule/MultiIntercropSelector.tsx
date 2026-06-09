import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, X, Leaf, Check, Sprout, TreeDeciduous, Flower2 } from 'lucide-react';
import { useLanguageStore } from '@/stores/languageStore';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CentralizedCropSelector } from '@/components/crops/CentralizedCropSelector';
import { Progress } from '@/components/ui/progress';
import { VarietySelector } from '@/components/crops/VarietySelector';

export interface IntercropData {
  cropId?: string;
  cropName: string;
  localizedCropName: string;
  cropVariety: string;
  varietyId?: string | null;
  areaPercent: number;
}

interface MultiIntercropSelectorProps {
  majorCropName: string;
  intercrops: IntercropData[];
  onIntercropsChange: (intercrops: IntercropData[]) => void;
  maxIntercrops?: number;
}

const translations = {
  en: {
    addIntercrop: 'Add Intercrop',
    intercropTitle: 'Add Companion Crop',
    intercropDescription: 'Select a crop to grow alongside your main crop',
    selectCrop: 'Select Intercrop',
    variety: 'Variety',
    varietyPlaceholder: 'e.g., Local',
    areaPercent: 'Area %',
    areaPlaceholder: '15',
    confirm: 'Add Crop',
    cancel: 'Cancel',
    remove: 'Remove',
    intercrop: 'Intercrop',
    totalArea: 'Total area used',
    remaining: 'remaining',
    maxReached: 'Maximum 3 intercrops reached',
  },
  hi: {
    addIntercrop: 'अंतर-फसल जोड़ें',
    intercropTitle: 'साथी फसल जोड़ें',
    intercropDescription: 'मुख्य फसल के साथ उगाने के लिए फसल चुनें',
    selectCrop: 'अंतर-फसल चुनें',
    variety: 'किस्म',
    varietyPlaceholder: 'जैसे, स्थानीय',
    areaPercent: 'क्षेत्र %',
    areaPlaceholder: '15',
    confirm: 'फसल जोड़ें',
    cancel: 'रद्द करें',
    remove: 'हटाएं',
    intercrop: 'अंतर-फसल',
    totalArea: 'कुल क्षेत्र उपयोग',
    remaining: 'शेष',
    maxReached: 'अधिकतम 3 अंतर-फसलें पहुंच गईं',
  },
  mr: {
    addIntercrop: 'आंतरपीक जोडा',
    intercropTitle: 'सहपीक जोडा',
    intercropDescription: 'मुख्य पिकासोबत वाढवण्यासाठी पीक निवडा',
    selectCrop: 'आंतरपीक निवडा',
    variety: 'वाण',
    varietyPlaceholder: 'उदा., स्थानिक',
    areaPercent: 'क्षेत्र %',
    areaPlaceholder: '15',
    confirm: 'पीक जोडा',
    cancel: 'रद्द करा',
    remove: 'काढा',
    intercrop: 'आंतरपीक',
    totalArea: 'एकूण क्षेत्र वापर',
    remaining: 'शिल्लक',
    maxReached: 'जास्तीत जास्त 3 आंतरपिके',
  },
};

const INTERCROP_ICONS = [Sprout, TreeDeciduous, Flower2];
const INTERCROP_COLORS = [
  { bg: 'bg-success/10', border: 'border-success/30', text: 'text-success dark:text-success', icon: 'text-success' },
  { bg: 'bg-success/10', border: 'border-success/30', text: 'text-success dark:text-success', icon: 'text-success' },
  { bg: 'bg-info/10', border: 'border-info/30', text: 'text-info dark:text-info', icon: 'text-info' },
];

export default function MultiIntercropSelector({
  majorCropName,
  intercrops,
  onIntercropsChange,
  maxIntercrops = 3,
}: MultiIntercropSelectorProps) {
  const { currentLanguage } = useLanguageStore();
  const lang = currentLanguage || 'en';
  const t = translations[lang as keyof typeof translations] || translations.en;

  const [showDialog, setShowDialog] = useState(false);
  const [selectedCropId, setSelectedCropId] = useState('');
  const [selectedCropName, setSelectedCropName] = useState('');
  const [selectedLocalizedName, setSelectedLocalizedName] = useState('');
  const [varietyId, setVarietyIdState] = useState<string | null>(null);
  const [varietyName, setVarietyName] = useState('');
  const [areaPercent, setAreaPercent] = useState(15);

  // Calculate total area used
  const totalAreaUsed = useMemo(() => {
    return intercrops.reduce((sum, ic) => sum + (ic.areaPercent || 0), 0);
  }, [intercrops]);

  const remainingArea = 100 - totalAreaUsed;
  const canAddMore = intercrops.length < maxIntercrops && remainingArea > 0;

  const handleCropSelect = (id: string, name: string, localized: string) => {
    setSelectedCropId(id);
    setSelectedCropName(name);
    setSelectedLocalizedName(localized || name);
    // Reset variety when crop changes
    setVarietyIdState(null);
    setVarietyName('');
  };

  const handleConfirm = () => {
    if (selectedCropName && areaPercent > 0) {
      const clampedArea = Math.min(remainingArea, Math.max(5, areaPercent));
      const newIntercrop: IntercropData = {
        cropId: selectedCropId || undefined,
        cropName: selectedCropName,
        localizedCropName: selectedLocalizedName,
        cropVariety: varietyName,
        varietyId: varietyId,
        areaPercent: clampedArea,
      };
      onIntercropsChange([...intercrops, newIntercrop]);
      setShowDialog(false);
      resetForm();
    }
  };

  const handleRemove = (index: number) => {
    const updated = intercrops.filter((_, i) => i !== index);
    onIntercropsChange(updated);
  };

  const resetForm = () => {
    setSelectedCropId('');
    setSelectedCropName('');
    setSelectedLocalizedName('');
    setVarietyIdState(null);
    setVarietyName('');
    setAreaPercent(15);
  };

  return (
    <div className="space-y-3">
      {/* Area Progress Bar */}
      {intercrops.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">{t.totalArea}</span>
            <span className={cn(
              "font-semibold",
              totalAreaUsed > 50 ? "text-warning" : "text-success"
            )}>
              {totalAreaUsed}% • {remainingArea}% {t.remaining}
            </span>
          </div>
          <Progress value={totalAreaUsed} className="h-2" />
        </div>
      )}

      {/* Intercrop Cards */}
      <AnimatePresence mode="popLayout">
        {intercrops.map((intercrop, index) => {
          const colors = INTERCROP_COLORS[index % INTERCROP_COLORS.length];
          const IconComponent = INTERCROP_ICONS[index % INTERCROP_ICONS.length];
          
          return (
            <motion.div
              key={`${intercrop.cropName}-${index}`}
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border backdrop-blur-sm",
                colors.bg,
                colors.border
              )}
            >
              {/* Icon */}
              <div className={cn(
                "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                colors.bg,
                "border",
                colors.border
              )}>
                <IconComponent className={cn("h-5 w-5", colors.icon)} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md",
                    colors.bg, colors.text
                  )}>
                    {t.intercrop} {index + 1}
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground truncate mt-0.5">
                  {intercrop.localizedCropName || intercrop.cropName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {intercrop.cropVariety ? `${intercrop.cropVariety} • ` : ''}
                  <span className={cn("font-semibold", colors.text)}>{intercrop.areaPercent}%</span> area
                </p>
              </div>

              {/* Remove Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(index)}
                className="h-9 w-9 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
              >
                <X className="h-4 w-4" />
              </Button>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Add Button */}
      {canAddMore ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDialog(true)}
            className={cn(
              "w-full h-12 border-dashed rounded-xl transition-all duration-300",
              "border-success/50 text-success dark:text-success",
              "hover:bg-success/10 hover:border-success",
              "active:scale-[0.98]"
            )}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t.addIntercrop} ({intercrops.length}/{maxIntercrops})
          </Button>
        </motion.div>
      ) : intercrops.length >= maxIntercrops ? (
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground">{t.maxReached}</p>
        </div>
      ) : null}

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[80vh] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl flex flex-col bg-background/95 backdrop-blur-xl">
          {/* Header - Fixed */}
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0 bg-gradient-to-b from-success/10 to-transparent">
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <div className="p-2 rounded-xl bg-success/20">
                <Leaf className="h-5 w-5 text-success" />
              </div>
              {t.intercropTitle}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {t.intercropDescription}
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Crop Selector - Scrollable */}
            <div className="h-[280px] overflow-y-auto">
              <CentralizedCropSelector
                selectedCropId={selectedCropId}
                onSelect={handleCropSelect}
                className="h-full"
                showHeader={false}
                variant="compact"
                showSearch={true}
              />
            </div>

            {/* Selected Crop Details */}
            <AnimatePresence>
              {selectedCropName && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-5 py-4 border-t border-border/50 space-y-4 bg-gradient-to-t from-success/5 to-transparent"
                >
                  <div className="flex items-center gap-2 p-2.5 bg-success/15 rounded-xl border border-success/30">
                    <Check className="h-4 w-4 text-success shrink-0" />
                    <span className="text-sm font-semibold text-success dark:text-success truncate">
                      {selectedLocalizedName || selectedCropName}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground font-medium">{t.variety}</Label>
                      <Input
                        placeholder={t.varietyPlaceholder}
                        value={variety}
                        onChange={(e) => setVariety(e.target.value)}
                        className="h-11 text-sm rounded-xl bg-background/50 border-border/50 focus:border-success/50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground font-medium">{t.areaPercent}</Label>
                      <Input
                        type="number"
                        min={5}
                        max={remainingArea}
                        placeholder={t.areaPlaceholder}
                        value={areaPercent}
                        onChange={(e) => setAreaPercent(parseInt(e.target.value) || 15)}
                        className="h-11 text-sm rounded-xl bg-background/50 border-border/50 focus:border-success/50"
                      />
                    </div>
                  </div>

                  {/* Area hint */}
                  <p className="text-[10px] text-muted-foreground text-center">
                    Max: {remainingArea}% available
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer - Fixed at Bottom */}
          <DialogFooter className="flex flex-col gap-2 p-5 pt-3 border-t border-border/50 shrink-0 bg-background/80 backdrop-blur-sm">
            <Button
              onClick={handleConfirm}
              disabled={!selectedCropName || areaPercent <= 0}
              className={cn(
                "w-full h-12 rounded-xl font-semibold transition-all duration-300",
                selectedCropName && areaPercent > 0
                  ? "bg-gradient-to-r from-success to-success hover:from-success hover:to-success text-white shadow-lg shadow-success/30/25"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t.confirm}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowDialog(false);
                resetForm();
              }}
              className="w-full h-10 text-muted-foreground rounded-xl"
            >
              {t.cancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}