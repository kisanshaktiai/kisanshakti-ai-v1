import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Wheat } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CropChipsProps {
  crops: string[];
  selectedCrop: string | null;
  onSelectCrop: (crop: string) => void;
  isLoading?: boolean;
  maxDisplay?: number;
}

export function CropChips({
  crops = [],
  selectedCrop,
  onSelectCrop,
  isLoading = false,
  maxDisplay = 20,
}: CropChipsProps) {
  const { t } = useTranslation();
  const displayCrops = crops.slice(0, maxDisplay);

  if (displayCrops.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-xs">
        <Wheat className="w-6 h-6 mx-auto mb-1 opacity-50" />
        {t('market.intelligence.selectCropType')}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          पीक निवडा • {crops.length}
        </h3>
        {selectedCrop && (
          <button
            onClick={() => onSelectCrop('')}
            className="text-[11px] text-primary font-medium"
          >
            साफ करा
          </button>
        )}
      </div>

      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
        <div className="flex gap-2 pb-1 pr-4">
          {displayCrops.map((crop, index) => (
            <motion.button
              key={crop}
              type="button"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.02 }}
              onClick={() => onSelectCrop(crop)}
              disabled={isLoading}
              className={cn(
                'px-4 h-10 rounded-2xl text-sm font-medium flex-shrink-0 snap-start',
                'border touch-manipulation transition-colors',
                selectedCrop === crop
                  ? 'bg-accent text-accent-foreground border-accent shadow-sm'
                  : 'bg-card text-foreground border-border/60 active:bg-muted',
              )}
            >
              {crop}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
