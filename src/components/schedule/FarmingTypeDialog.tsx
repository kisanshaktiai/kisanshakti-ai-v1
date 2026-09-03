import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Leaf, FlaskConical, Zap, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

export type FarmingMode = 'organic_only' | 'organic_fertilizer' | 'fertilizer_pesticide';

interface FarmingTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: FarmingMode) => void;
  cropName: string;
}

export interface FarmingOptionStyle {
  mode: FarmingMode;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  ringColor: string;
}

/** Presentation only — all copy comes from the `schedule.method.*` i18n keys. */
export const FARMING_OPTIONS: FarmingOptionStyle[] = [
  {
    mode: 'organic_only',
    icon: <Leaf className="h-5 w-5" />,
    color: 'text-success dark:text-success',
    bgColor: 'bg-success-soft dark:bg-success/30',
    borderColor: 'border-success/30 dark:border-success',
    ringColor: 'ring-success',
  },
  {
    mode: 'organic_fertilizer',
    icon: <FlaskConical className="h-5 w-5" />,
    color: 'text-info dark:text-info',
    bgColor: 'bg-info-soft dark:bg-info/30',
    borderColor: 'border-info/30 dark:border-info',
    ringColor: 'ring-info',
  },
  {
    mode: 'fertilizer_pesticide',
    icon: <Zap className="h-5 w-5" />,
    color: 'text-warning dark:text-warning',
    bgColor: 'bg-warning-soft dark:bg-warning/30',
    borderColor: 'border-warning/30 dark:border-warning',
    ringColor: 'ring-warning',
  },
];

export default function FarmingTypeDialog({ open, onOpenChange, onSelect, cropName }: FarmingTypeDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold text-foreground">
            {t('schedule.method.title')}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{cropName}</p>
        </DialogHeader>

        <div className="px-4 pb-5 space-y-2">
          {FARMING_OPTIONS.map((option, index) => (
            <motion.button
              key={option.mode}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onSelect(option.mode)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl min-h-[64px]',
                'border-2 transition-all duration-200 active:scale-[0.98]',
                'focus:outline-none focus:ring-2 focus:ring-offset-2',
                option.bgColor,
                option.borderColor,
                option.ringColor,
              )}
            >
              <div
                className={cn(
                  'shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
                  'bg-card shadow-sm border',
                  option.borderColor,
                  option.color,
                )}
              >
                {option.icon}
              </div>

              <div className="flex-1 text-left min-w-0">
                <span className={cn('font-semibold text-sm', option.color)}>
                  {t(`schedule.method.${option.mode}_title`)}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(`schedule.method.${option.mode}_subtitle`)}
                </p>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                  {t(`schedule.method.${option.mode}_tradeoff`)}
                </p>
              </div>

              <div
                className={cn(
                  'shrink-0 w-6 h-6 rounded-full flex items-center justify-center',
                  'bg-card border shadow-sm',
                  option.borderColor,
                )}
              >
                <Check className={cn('h-3.5 w-3.5', option.color)} />
              </div>
            </motion.button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
