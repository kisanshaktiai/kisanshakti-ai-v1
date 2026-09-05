import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Calendar, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

export default function BackdatedConsentDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  sowingDate,
  daysAgo,
  cropName,
}: BackdatedConsentDialogProps) {
  const { t } = useTranslation();
  const consequences = [1, 2, 3, 4].map((i) => t(`schedule.backdated.consequence_${i}`));
  
  const [consentChecked, setConsentChecked] = useState(false);

  const handleConfirm = () => {
    if (consentChecked) {
      onConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-hidden p-0 gap-0 rounded-3xl border-0 shadow-2xl flex flex-col">
        {/* Warning Header */}
        <div className="bg-warning/10 border-b border-warning/20 p-5">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-warning dark:text-warning" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-warning dark:text-warning">
                {t('schedule.backdated.title')}
              </DialogTitle>
              <DialogDescription className="text-sm text-warning/80 dark:text-warning/80 mt-1">
                {t('schedule.backdated.description')}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto mobile-scroll-container min-h-0">
          {/* Date Info */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
            <Calendar className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <span className="text-sm text-foreground">
                {t('schedule.backdated.days_line', { days: daysAgo })}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">{cropName}</p>
            </div>
          </div>

          {/* Consequences */}
          <div className="space-y-2">
            {consequences.map((consequence, index) => (
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
              <p className="text-xs font-semibold text-info dark:text-info">{t('schedule.backdated.important')}</p>
              <p className="text-xs text-info/80 dark:text-info/80 mt-0.5">{t('schedule.backdated.important_note')}</p>
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
              {t('schedule.backdated.consent')}
            </label>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex flex-col gap-2 p-4 border-t border-border bg-background shrink-0">
          <Button
            onClick={handleConfirm}
            disabled={!consentChecked}
            className={cn(
              "w-full transition-all",
              consentChecked
                ? "bg-warning hover:bg-warning text-warning-foreground"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {t('schedule.backdated.confirm')}
          </Button>
          <Button
            variant="ghost"
            onClick={onCancel}
            className="w-full text-muted-foreground hover:text-foreground"
          >
            {t('schedule.backdated.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
