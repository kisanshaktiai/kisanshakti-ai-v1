import React from 'react';
import { motion } from 'framer-motion';
import { Leaf, Beaker, Bug, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SuggestionType = 'organic' | 'fertilizer' | 'pesticide' | 'hybrid';

interface SuggestionTypeSelectorProps {
  onSelect: (type: SuggestionType) => void;
  isLoading?: boolean;
  language?: string;
}

const getLabels = (lang: string) => ({
  title: lang === 'hi' 
    ? 'आप किस प्रकार का समाधान चाहते हैं?' 
    : lang === 'mr' 
    ? 'तुम्हाला कोणत्या प्रकारचे समाधान हवे आहे?' 
    : 'What type of solution do you want?',
  organic: lang === 'hi' ? 'जैविक' : lang === 'mr' ? 'सेंद्रिय' : 'Organic',
  organicDesc: lang === 'hi' 
    ? 'प्राकृतिक और पर्यावरण अनुकूल' 
    : lang === 'mr' 
    ? 'नैसर्गिक आणि पर्यावरण अनुकूल' 
    : 'Natural & eco-friendly',
  fertilizer: lang === 'hi' ? 'खाद' : lang === 'mr' ? 'खत' : 'Fertilizer',
  fertilizerDesc: lang === 'hi' 
    ? 'पोषक तत्व और वृद्धि बूस्टर' 
    : lang === 'mr' 
    ? 'पोषक आणि वाढ बूस्टर' 
    : 'Nutrients & growth booster',
  pesticide: lang === 'hi' ? 'कीटनाशक' : lang === 'mr' ? 'कीटकनाशक' : 'Pesticide',
  pesticideDesc: lang === 'hi' 
    ? 'कीट और रोग नियंत्रण' 
    : lang === 'mr' 
    ? 'कीड आणि रोग नियंत्रण' 
    : 'Pest & disease control',
  hybrid: lang === 'hi' ? 'संपूर्ण समाधान' : lang === 'mr' ? 'संपूर्ण समाधान' : 'Complete Solution',
  hybridDesc: lang === 'hi' 
    ? 'सभी का मिश्रण (जैविक + रासायनिक)' 
    : lang === 'mr' 
    ? 'सर्वांचे मिश्रण (सेंद्रिय + रासायनिक)' 
    : 'Mix of all (organic + chemical)',
  tapToSelect: lang === 'hi' ? 'चुनने के लिए टैप करें' : lang === 'mr' ? 'निवडण्यासाठी टॅप करा' : 'Tap to select'
});

const suggestionOptions: { 
  type: SuggestionType; 
  icon: React.ReactNode; 
  gradient: string;
  iconBg: string;
  borderColor: string;
  shadowColor: string;
}[] = [
  { 
    type: 'organic', 
    icon: <Leaf className="h-5 w-5" />, 
    gradient: 'from-success/20 via-success/10 to-transparent',
    iconBg: 'bg-gradient-to-br from-success to-success',
    borderColor: 'border-success/30 hover:border-success/60',
    shadowColor: 'shadow-success/30/20'
  },
  { 
    type: 'fertilizer', 
    icon: <Beaker className="h-5 w-5" />, 
    gradient: 'from-warning/20 via-warning/10 to-transparent',
    iconBg: 'bg-gradient-to-br from-warning to-warning',
    borderColor: 'border-warning/30 hover:border-warning/60',
    shadowColor: 'shadow-warning/30/20'
  },
  { 
    type: 'pesticide', 
    icon: <Bug className="h-5 w-5" />, 
    gradient: 'from-destructive/20 via-destructive/10 to-transparent',
    iconBg: 'bg-gradient-to-br from-destructive to-destructive',
    borderColor: 'border-destructive/30 hover:border-destructive/60',
    shadowColor: 'shadow-destructive/30/20'
  },
  { 
    type: 'hybrid', 
    icon: <Sparkles className="h-5 w-5" />, 
    gradient: 'from-primary/20 via-primary/10 to-transparent',
    iconBg: 'bg-gradient-to-br from-primary to-primary',
    borderColor: 'border-primary/30 hover:border-primary/60',
    shadowColor: 'shadow-primary/30/20'
  }
];

export function SuggestionTypeSelector({ onSelect, isLoading, language = 'en' }: SuggestionTypeSelectorProps) {
  const labels = getLabels(language);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      {/* Modern Glass Card Container */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-background/95 via-background/90 to-muted/50 backdrop-blur-xl border border-border/50 shadow-xl">
        {/* Decorative gradient orb */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-gradient-to-br from-success/10 to-warning/10 rounded-full blur-2xl pointer-events-none" />
        
        {/* Header */}
        <div className="relative px-4 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-primary animate-pulse" />
            <p className="font-semibold text-foreground text-sm md:text-base">
              {labels.title}
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-1 pl-3">
            {labels.tapToSelect}
          </p>
        </div>
        
        {/* Options Grid - 2x2 Mobile First */}
        <div className="relative px-3 pb-4 grid grid-cols-2 gap-2.5">
          {suggestionOptions.map((option, index) => (
            <motion.button
              key={option.type}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ 
                delay: index * 0.08, 
                duration: 0.35,
                ease: [0.22, 1, 0.36, 1]
              }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => !isLoading && onSelect(option.type)}
              disabled={isLoading}
              className={cn(
                "relative group flex flex-col items-start p-3.5 rounded-xl",
                "bg-gradient-to-br", option.gradient,
                "border-2 transition-all duration-300",
                option.borderColor,
                "hover:shadow-lg",
                option.shadowColor,
                isLoading && "opacity-50 cursor-not-allowed pointer-events-none"
              )}
            >
              {/* Icon Circle */}
              <div className={cn(
                "p-2.5 rounded-xl text-white shadow-lg mb-2.5",
                "transform transition-transform duration-300 group-hover:scale-110",
                option.iconBg
              )}>
                {option.icon}
              </div>
              
              {/* Content */}
              <div className="flex-1 w-full text-left">
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-sm text-foreground">
                    {labels[option.type]}
                  </span>
                  <ChevronRight className={cn(
                    "h-4 w-4 text-muted-foreground/50",
                    "transform transition-all duration-300",
                    "group-hover:translate-x-0.5 group-hover:text-foreground/70"
                  )} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">
                  {labels[`${option.type}Desc` as keyof typeof labels]}
                </p>
              </div>
              
              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 bg-background/50 rounded-xl flex items-center justify-center">
                  <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
