import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Calendar, Info } from 'lucide-react';
import { useLanguageStore } from '@/stores/languageStore';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BackdatedConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  sowingDate: Date;
  daysAgo: number;
  cropName: string;
}

const translations = {
  en: {
    title: 'Backdated Schedule Warning',
    description: 'You are creating a schedule for a crop that was planted in the past.',
    warning1: 'The sowing date you selected is',
    warning2: 'days ago.',
    consequences: [
      'AI cannot verify the current growth stage of your crop',
      'Recommendations may not match your crop\'s actual condition',
      'Tasks already past due will be marked as overdue',
      'Weather-based adjustments will use historical data',
    ],
    consent: 'I understand that using a backdated sowing date may result in inaccurate recommendations. I take full responsibility for any incorrect advisory.',
    confirm: 'I Accept & Continue',
    cancel: 'Go Back & Change Date',
    important: 'Important',
    importantNote: 'For accurate AI recommendations, please ensure the sowing date matches when you actually planted the crop.',
  },
  hi: {
    title: 'पुरानी तारीख की शेड्यूल चेतावनी',
    description: 'आप पहले से बोई गई फसल के लिए शेड्यूल बना रहे हैं।',
    warning1: 'आपने जो बुवाई तारीख चुनी है वह',
    warning2: 'दिन पहले की है।',
    consequences: [
      'AI आपकी फसल की वर्तमान अवस्था सत्यापित नहीं कर सकता',
      'सिफारिशें आपकी फसल की वास्तविक स्थिति से मेल नहीं खा सकतीं',
      'जो काम पहले होने चाहिए थे वे अतिदेय दिखेंगे',
      'मौसम आधारित समायोजन पुराने डेटा का उपयोग करेगा',
    ],
    consent: 'मैं समझता/समझती हूं कि पुरानी तारीख का उपयोग करने से गलत सिफारिशें मिल सकती हैं। किसी भी गलत सलाह की पूरी जिम्मेदारी मेरी है।',
    confirm: 'मैं स्वीकार करता/करती हूं',
    cancel: 'वापस जाएं और तारीख बदलें',
    important: 'महत्वपूर्ण',
    importantNote: 'सटीक AI सिफारिशों के लिए, कृपया सुनिश्चित करें कि बुवाई की तारीख वही है जब आपने वास्तव में फसल बोई थी।',
  },
  mr: {
    title: 'मागील तारखेच्या वेळापत्रकाची सूचना',
    description: 'तुम्ही आधीच पेरलेल्या पिकासाठी वेळापत्रक तयार करत आहात.',
    warning1: 'तुम्ही निवडलेली पेरणी तारीख',
    warning2: 'दिवसांपूर्वीची आहे.',
    consequences: [
      'AI तुमच्या पिकाची सध्याची अवस्था तपासू शकत नाही',
      'शिफारशी तुमच्या पिकाच्या प्रत्यक्ष स्थितीशी जुळणार नाहीत',
      'आधीच उशीर झालेली कामे \'उशीर\' म्हणून दिसतील',
      'हवामान आधारित समायोजन जुन्या डेटाचा वापर करेल',
    ],
    consent: 'मी समजतो/समजते की मागील तारीख वापरल्याने चुकीच्या शिफारशी मिळू शकतात. कोणत्याही चुकीच्या सल्ल्याची संपूर्ण जबाबदारी माझी आहे.',
    confirm: 'मी स्वीकारतो/स्वीकारते',
    cancel: 'मागे जा आणि तारीख बदला',
    important: 'महत्त्वाचे',
    importantNote: 'अचूक AI शिफारशींसाठी, कृपया खात्री करा की पेरणी तारीख तुम्ही प्रत्यक्षात पीक पेरले त्या तारखेशी जुळते.',
  },
};

export default function BackdatedConsentDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  sowingDate,
  daysAgo,
  cropName,
}: BackdatedConsentDialogProps) {
  const { currentLanguage } = useLanguageStore();
  const lang = currentLanguage || 'en';
  const t = translations[lang as keyof typeof translations] || translations.en;
  
  const [consentChecked, setConsentChecked] = useState(false);

  const handleConfirm = () => {
    if (consentChecked) {
      onConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        {/* Warning Header */}
        <div className="bg-warning/10 border-b border-warning/20 p-5">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-warning dark:text-warning" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-warning dark:text-warning">
                {t.title}
              </DialogTitle>
              <DialogDescription className="text-sm text-warning/80 dark:text-warning/80 mt-1">
                {t.description}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Date Info */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
            <Calendar className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <span className="text-sm text-foreground">
                {t.warning1} <strong className="text-warning dark:text-warning">{daysAgo}</strong> {t.warning2}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">{cropName}</p>
            </div>
          </div>

          {/* Consequences */}
          <div className="space-y-2">
            {t.consequences.map((consequence, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-warning mt-2" />
                <span>{consequence}</span>
              </motion.div>
            ))}
          </div>

          {/* Important Note */}
          <div className="flex items-start gap-3 p-3 bg-info/10 border border-info/20 rounded-xl">
            <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-info dark:text-info">{t.important}</p>
              <p className="text-xs text-info/80 dark:text-info/80 mt-0.5">{t.importantNote}</p>
            </div>
          </div>

          {/* Consent Checkbox */}
          <div className="flex items-start gap-3 p-4 bg-destructive/5 border-2 border-destructive/20 rounded-xl">
            <Checkbox
              id="consent"
              checked={consentChecked}
              onCheckedChange={(checked) => setConsentChecked(checked === true)}
              className="mt-0.5 border-destructive/50 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
            />
            <label htmlFor="consent" className="text-sm text-foreground cursor-pointer leading-relaxed">
              {t.consent}
            </label>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex flex-col gap-2 p-5 pt-0">
          <Button
            onClick={handleConfirm}
            disabled={!consentChecked}
            className={cn(
              "w-full transition-all",
              consentChecked
                ? "bg-warning hover:bg-warning text-white"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {t.confirm}
          </Button>
          <Button
            variant="ghost"
            onClick={onCancel}
            className="w-full text-muted-foreground hover:text-foreground"
          >
            {t.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
