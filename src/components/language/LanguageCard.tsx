import { motion } from 'framer-motion';
import { Check, Star } from 'lucide-react';
import { RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface LanguageCardProps {
  code: string;
  nativeName: string;
  englishName: string;
  isSelected: boolean;
  isRecommended: boolean;
  index: number;
  onSelect: (code: string) => void;
}

export function LanguageCard({
  code,
  nativeName,
  englishName,
  isSelected,
  isRecommended,
  index,
  onSelect
}: LanguageCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative"
    >
      <Label
        htmlFor={`lang-${code}`}
        onClick={(e) => {
          e.preventDefault();
          onSelect(code);
        }}
        className={`
          flex items-center justify-between w-full p-4 rounded-2xl border-2 cursor-pointer
          transition-all duration-300 hover:scale-[1.02] hover:shadow-md
          ${isSelected 
            ? 'border-primary bg-primary/10 shadow-glow' 
            : 'border-border bg-card hover:border-primary/30'
          }
        `}
      >
        <div className="flex items-center gap-3">
          <RadioGroupItem 
            value={code} 
            id={`lang-${code}`}
            className="border-2"
            aria-label={`Select ${nativeName} - ${englishName}`}
            onClick={(e) => {
              e.preventDefault();
              onSelect(code);
            }}
          />
          <div className="flex flex-col">
            <span className={`text-xl font-bold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
              {nativeName}
            </span>
            <span className="text-sm text-muted-foreground">
              {englishName}
            </span>
          </div>
        </div>
        
        {isSelected && (
          <motion.div 
            className="bg-primary text-primary-foreground rounded-full p-2"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
          >
            <Check className="w-5 h-5" aria-hidden="true" />
          </motion.div>
        )}
      </Label>
      
      {isRecommended && (
        <motion.div 
          className="absolute -top-2 -right-2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1"
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <Star className="w-3 h-3 fill-current" aria-hidden="true" />
          <span>Recommended</span>
        </motion.div>
      )}
    </motion.div>
  );
}
