import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Leaf, FlaskConical, Zap, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';
import { motion } from 'framer-motion';

export type FarmingMode = 'organic_only' | 'organic_fertilizer' | 'fertilizer_pesticide';

interface FarmingTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: FarmingMode) => void;
  cropName: string;
}

interface FarmingOption {
  mode: FarmingMode;
  icon: React.ReactNode;
  title: Record<string, string>;
  subtitle: Record<string, string>;
  yield: string;
  color: string;
  bgColor: string;
  borderColor: string;
  ringColor: string;
}

const farmingOptions: FarmingOption[] = [
  {
    mode: 'organic_only',
    icon: <Leaf className="h-5 w-5" />,
    title: {
      en: 'Organic',
      hi: 'जैविक',
      mr: 'सेंद्रिय',
      pa: 'ਜੈਵਿਕ',
      ta: 'இயற்கை',
    },
    subtitle: {
      en: 'Zero chemicals, premium price',
      hi: 'शून्य रसायन, प्रीमियम दाम',
      mr: 'शून्य रसायने, प्रीमियम भाव',
      pa: 'ਜ਼ੀਰੋ ਕੈਮੀਕਲ, ਵਧੀਆ ਕੀਮਤ',
      ta: 'ரசாயனம் இல்லை, சிறந்த விலை',
    },
    yield: '2x',
    color: 'text-success dark:text-success',
    bgColor: 'bg-success-soft dark:bg-success/30',
    borderColor: 'border-success/30 dark:border-success',
    ringColor: 'ring-success',
  },
  {
    mode: 'organic_fertilizer',
    icon: <FlaskConical className="h-5 w-5" />,
    title: {
      en: 'Balanced',
      hi: 'संतुलित',
      mr: 'संतुलित',
      pa: 'ਸੰਤੁਲਿਤ',
      ta: 'சமநிலை',
    },
    subtitle: {
      en: 'Organic base + fertilizers',
      hi: 'जैविक + रासायनिक मिश्रण',
      mr: 'सेंद्रिय + रासायनिक मिश्रण',
      pa: 'ਜੈਵਿਕ + ਰਸਾਇਣਕ ਮਿਲਾਵਟ',
      ta: 'இயற்கை + உரம் கலவை',
    },
    yield: '4x',
    color: 'text-info dark:text-info',
    bgColor: 'bg-info-soft dark:bg-info/30',
    borderColor: 'border-info/30 dark:border-info',
    ringColor: 'ring-info',
  },
  {
    mode: 'fertilizer_pesticide',
    icon: <Zap className="h-5 w-5" />,
    title: {
      en: 'High Yield',
      hi: 'अधिक उत्पादन',
      mr: 'जास्त उत्पादन',
      pa: 'ਵੱਧ ਝਾੜ',
      ta: 'அதிக மகசூல்',
    },
    subtitle: {
      en: 'Full chemicals, max output',
      hi: 'पूर्ण रसायन, अधिकतम पैदावार',
      mr: 'पूर्ण रसायने, जास्तीत जास्त उत्पादन',
      pa: 'ਪੂਰੇ ਰਸਾਇਣ, ਵੱਧ ਝਾੜ',
      ta: 'முழு ரசாயனம், அதிக விளைச்சல்',
    },
    yield: '6x',
    color: 'text-warning dark:text-warning',
    bgColor: 'bg-warning-soft dark:bg-warning/30',
    borderColor: 'border-warning/30 dark:border-warning',
    ringColor: 'ring-warning',
  },
];

export default function FarmingTypeDialog({ open, onOpenChange, onSelect, cropName }: FarmingTypeDialogProps) {
  const { currentLanguage } = useLanguageStore();
  const lang = currentLanguage || 'en';

  const getTitle = () => {
    const titles: Record<string, string> = {
      en: 'Choose Method',
      hi: 'तरीका चुनें',
      mr: 'पद्धत निवडा',
      pa: 'ਤਰੀਕਾ ਚੁਣੋ',
      ta: 'முறை தேர்வு',
    };
    return titles[lang] || titles.en;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold text-foreground">
            {getTitle()}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {cropName}
          </p>
        </DialogHeader>

        {/* Options */}
        <div className="px-4 pb-5 space-y-2">
          {farmingOptions.map((option, index) => (
            <motion.button
              key={option.mode}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onSelect(option.mode)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl",
                "border-2 transition-all duration-200",
                "hover:scale-[1.02] active:scale-[0.98]",
                "focus:outline-none focus:ring-2 focus:ring-offset-2",
                option.bgColor,
                option.borderColor,
                option.ringColor
              )}
            >
              {/* Icon */}
              <div className={cn(
                "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                "bg-white dark:bg-background shadow-sm border",
                option.borderColor,
                option.color
              )}>
                {option.icon}
              </div>

              {/* Content */}
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("font-semibold text-sm", option.color)}>
                    {option.title[lang] || option.title.en}
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    "bg-white dark:bg-background border shadow-sm",
                    option.borderColor,
                    option.color
                  )}>
                    {option.yield}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {option.subtitle[lang] || option.subtitle.en}
                </p>
              </div>

              {/* Arrow */}
              <div className={cn(
                "shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                "bg-white dark:bg-background border shadow-sm",
                option.borderColor
              )}>
                <Check className={cn("h-3.5 w-3.5", option.color)} />
              </div>
            </motion.button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
