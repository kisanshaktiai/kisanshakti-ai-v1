import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Leaf, Beaker, Bug, Sparkles } from 'lucide-react';
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
    : 'Mix of all (organic + chemical)'
});

const suggestionOptions: { 
  type: SuggestionType; 
  icon: React.ReactNode; 
  gradient: string;
  bgColor: string;
}[] = [
  { 
    type: 'organic', 
    icon: <Leaf className="h-5 w-5" />, 
    gradient: 'from-green-500 to-emerald-600',
    bgColor: 'bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-950/50'
  },
  { 
    type: 'fertilizer', 
    icon: <Beaker className="h-5 w-5" />, 
    gradient: 'from-amber-500 to-yellow-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50'
  },
  { 
    type: 'pesticide', 
    icon: <Bug className="h-5 w-5" />, 
    gradient: 'from-red-500 to-orange-600',
    bgColor: 'bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50'
  },
  { 
    type: 'hybrid', 
    icon: <Sparkles className="h-5 w-5" />, 
    gradient: 'from-purple-500 to-violet-600',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-950/50'
  }
];

export function SuggestionTypeSelector({ onSelect, isLoading, language = 'en' }: SuggestionTypeSelectorProps) {
  const labels = getLabels(language);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4">
          <div className="text-center mb-4">
            <p className="font-semibold text-foreground text-sm md:text-base">
              {labels.title}
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {suggestionOptions.map((option, index) => (
              <motion.div
                key={option.type}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-auto py-3 px-3 flex flex-col items-center gap-2 transition-all",
                    option.bgColor,
                    "border-2 border-transparent hover:border-primary/30",
                    isLoading && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => !isLoading && onSelect(option.type)}
                  disabled={isLoading}
                >
                  <div className={cn(
                    "p-2 rounded-full bg-gradient-to-br text-white",
                    option.gradient
                  )}>
                    {option.icon}
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-sm">
                      {labels[option.type]}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {labels[`${option.type}Desc` as keyof typeof labels]}
                    </div>
                  </div>
                </Button>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
