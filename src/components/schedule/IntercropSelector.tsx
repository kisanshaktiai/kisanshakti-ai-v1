import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, X, Leaf, Check } from 'lucide-react';
import { useLanguageStore } from '@/stores/languageStore';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CentralizedCropSelector } from '@/components/crops/CentralizedCropSelector';

export interface IntercropData {
  cropName: string;
  localizedCropName: string;
  cropVariety: string;
  areaPercent: number;
}

interface IntercropSelectorProps {
  majorCropName: string;
  intercrop: IntercropData | null;
  onIntercropChange: (intercrop: IntercropData | null) => void;
}

const translations = {
  en: {
    addIntercrop: 'Add Intercrop',
    intercropTitle: 'Add Intercrop / Companion Crop',
    intercropDescription: 'Select a secondary crop to grow alongside your main crop',
    selectCrop: 'Select Intercrop',
    variety: 'Variety (optional)',
    varietyPlaceholder: 'e.g., Local variety',
    areaPercent: 'Area %',
    areaPlaceholder: '20',
    confirm: 'Add Intercrop',
    cancel: 'Cancel',
    remove: 'Remove',
    commonIntercrops: 'Common intercrops with',
    suggestedCrops: {
      sugarcane: ['Wheat', 'Soybean', 'Moong', 'Potato', 'Onion'],
      cotton: ['Moong', 'Groundnut', 'Soybean'],
      maize: ['Beans', 'Pumpkin', 'Cowpea'],
      rice: ['Fish (Paddy-Fish)', 'Azolla'],
    },
  },
  hi: {
    addIntercrop: 'अंतर-फसल जोड़ें',
    intercropTitle: 'अंतर-फसल / साथी फसल जोड़ें',
    intercropDescription: 'अपनी मुख्य फसल के साथ उगाने के लिए एक द्वितीयक फसल चुनें',
    selectCrop: 'अंतर-फसल चुनें',
    variety: 'किस्म (वैकल्पिक)',
    varietyPlaceholder: 'जैसे, स्थानीय किस्म',
    areaPercent: 'क्षेत्र %',
    areaPlaceholder: '20',
    confirm: 'अंतर-फसल जोड़ें',
    cancel: 'रद्द करें',
    remove: 'हटाएं',
    commonIntercrops: 'के साथ आम अंतर-फसलें',
    suggestedCrops: {
      sugarcane: ['गेहूं', 'सोयाबीन', 'मूंग', 'आलू', 'प्याज'],
      cotton: ['मूंग', 'मूंगफली', 'सोयाबीन'],
      maize: ['राजमा', 'कद्दू', 'लोबिया'],
      rice: ['मछली (धान-मछली)', 'अज़ोला'],
    },
  },
  mr: {
    addIntercrop: 'आंतरपीक जोडा',
    intercropTitle: 'आंतरपीक / सहपीक जोडा',
    intercropDescription: 'तुमच्या मुख्य पिकासोबत वाढवण्यासाठी दुय्यम पीक निवडा',
    selectCrop: 'आंतरपीक निवडा',
    variety: 'वाण (पर्यायी)',
    varietyPlaceholder: 'उदा., स्थानिक वाण',
    areaPercent: 'क्षेत्र %',
    areaPlaceholder: '20',
    confirm: 'आंतरपीक जोडा',
    cancel: 'रद्द करा',
    remove: 'काढा',
    commonIntercrops: 'सोबत सामान्य आंतरपिके',
    suggestedCrops: {
      sugarcane: ['गहू', 'सोयाबीन', 'मूग', 'बटाटा', 'कांदा'],
      cotton: ['मूग', 'भुईमूग', 'सोयाबीन'],
      maize: ['राजमा', 'भोपळा', 'चवळी'],
      rice: ['मासे (भात-मासे)', 'अझोला'],
    },
  },
};

export default function IntercropSelector({
  majorCropName,
  intercrop,
  onIntercropChange,
}: IntercropSelectorProps) {
  const { currentLanguage } = useLanguageStore();
  const lang = currentLanguage || 'en';
  const t = translations[lang as keyof typeof translations] || translations.en;

  const [showDialog, setShowDialog] = useState(false);
  const [selectedCropId, setSelectedCropId] = useState('');
  const [selectedCropName, setSelectedCropName] = useState('');
  const [selectedLocalizedName, setSelectedLocalizedName] = useState('');
  const [variety, setVariety] = useState('');
  const [areaPercent, setAreaPercent] = useState(20);

  const handleCropSelect = (id: string, name: string, localized: string) => {
    setSelectedCropId(id);
    setSelectedCropName(name);
    setSelectedLocalizedName(localized || name);
  };

  const handleConfirm = () => {
    if (selectedCropName) {
      onIntercropChange({
        cropName: selectedCropName,
        localizedCropName: selectedLocalizedName,
        cropVariety: variety,
        areaPercent: Math.min(50, Math.max(5, areaPercent)), // Clamp between 5-50%
      });
      setShowDialog(false);
      resetForm();
    }
  };

  const handleRemove = () => {
    onIntercropChange(null);
  };

  const resetForm = () => {
    setSelectedCropId('');
    setSelectedCropName('');
    setSelectedLocalizedName('');
    setVariety('');
    setAreaPercent(20);
  };

  // If intercrop already selected, show it as a chip
  if (intercrop) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-xl"
      >
        <div className="shrink-0 w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center">
          <Leaf className="h-4 w-4 text-success dark:text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {intercrop.localizedCropName || intercrop.cropName}
          </p>
          <p className="text-xs text-muted-foreground">
            {intercrop.cropVariety ? `${intercrop.cropVariety} • ` : ''}{intercrop.areaPercent}% area
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRemove}
          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <X className="h-4 w-4" />
        </Button>
      </motion.div>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDialog(true)}
        className="w-full border-dashed border-success/50 text-success dark:text-success hover:bg-success/10 hover:border-success"
      >
        <Plus className="h-4 w-4 mr-2" />
        {t.addIntercrop}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl flex flex-col">
          {/* Header */}
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Leaf className="h-5 w-5 text-success" />
              {t.intercropTitle}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {t.intercropDescription}
            </DialogDescription>
          </DialogHeader>

          {/* Crop Selector */}
          <div className="flex-1 overflow-hidden min-h-[250px] max-h-[350px]">
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
                className="px-5 py-4 border-t border-border/50 space-y-4"
              >
                <div className="flex items-center gap-2 p-2 bg-success/10 rounded-lg">
                  <Check className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium text-success dark:text-success">
                    {selectedLocalizedName || selectedCropName}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t.variety}</Label>
                    <Input
                      placeholder={t.varietyPlaceholder}
                      value={variety}
                      onChange={(e) => setVariety(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t.areaPercent}</Label>
                    <Input
                      type="number"
                      min={5}
                      max={50}
                      placeholder={t.areaPlaceholder}
                      value={areaPercent}
                      onChange={(e) => setAreaPercent(parseInt(e.target.value) || 20)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <DialogFooter className="flex flex-col gap-2 p-5 pt-3 border-t border-border/50 shrink-0">
            <Button
              onClick={handleConfirm}
              disabled={!selectedCropName}
              className={cn(
                "w-full",
                selectedCropName
                  ? "bg-success hover:bg-success text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {t.confirm}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowDialog(false);
                resetForm();
              }}
              className="w-full text-muted-foreground"
            >
              {t.cancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
