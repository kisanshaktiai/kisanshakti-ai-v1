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
  maxDisplay = 12
}: CropChipsProps) {
  const { t } = useTranslation();
  const displayCrops = crops.slice(0, maxDisplay);
  const remainingCount = crops.length - maxDisplay;

  if (displayCrops.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        <Wheat className="w-8 h-8 mx-auto mb-2 opacity-50" />
        {t('market.intelligence.selectCropType')}
      </div>
    );
  }

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <Wheat className="w-4 h-4 text-primary" />
        {t('market.intelligence.selectCrop')}
        <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
          {crops.length} {t('market.intelligence.crops')}
        </span>
      </h3>
      
      <div className="flex flex-wrap gap-2">
        {displayCrops.map((crop, index) => (
          <motion.button
            key={crop}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.02 }}
            onClick={() => onSelectCrop(crop)}
            disabled={isLoading}
            className={cn(
              "px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200",
              "border touch-manipulation active:scale-95",
              "min-h-[40px]",
              selectedCrop === crop
                ? "bg-accent text-accent-foreground border-accent shadow-md"
                : "bg-card/60 border-border/50 hover:border-accent/50 hover:bg-accent/10 text-foreground"
            )}
          >
            {crop}
          </motion.button>
        ))}
        
        {remainingCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-3 py-2 rounded-xl text-sm text-muted-foreground bg-muted/50 border border-dashed border-border flex items-center"
          >
            +{remainingCount} {t('market.intelligence.more')}
          </motion.div>
        )}
      </div>

      {/* Clear Selection */}
      {selectedCrop && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => onSelectCrop('')}
          className="mt-2 text-xs text-primary hover:text-primary/80 underline"
        >
          {t('market.intelligence.clearSelection')}
        </motion.button>
      )}
    </div>
  );
}
