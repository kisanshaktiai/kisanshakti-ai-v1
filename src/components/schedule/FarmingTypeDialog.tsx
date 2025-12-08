import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Leaf, FlaskConical, Bug, Sparkles, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';
import { motion, AnimatePresence } from 'framer-motion';

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
  description: Record<string, string>;
  allowed: string[];
  notAllowed: string[];
  yieldMultiplier: string;
  color: string;
  gradient: string;
  borderColor: string;
}

const farmingOptions: FarmingOption[] = [
  {
    mode: 'organic_only',
    icon: <Leaf className="h-8 w-8" />,
    title: {
      en: '100% Organic',
      hi: 'पूर्ण जैविक खेती',
      mr: 'संपूर्ण सेंद्रिय शेती',
      pa: 'ਪੂਰੀ ਜੈਵਿਕ ਖੇਤੀ',
      ta: 'முழு இயற்கை வேளாண்மை',
    },
    subtitle: {
      en: 'Zero chemicals, premium pricing',
      hi: 'शून्य रसायन, प्रीमियम दाम',
      mr: 'शून्य रसायने, प्रीमियम भाव',
      pa: 'ਜ਼ੀਰੋ ਕੈਮੀਕਲ, ਵਧੀਆ ਕੀਮਤ',
      ta: 'ரசாயனம் இல்லை, சிறந்த விலை',
    },
    description: {
      en: 'Use only organic inputs like FYM, vermicompost, neem, bio-fertilizers. Get premium prices for organic produce.',
      hi: 'केवल गोबर की खाद, केंचुआ खाद, नीम, जैविक खाद का उपयोग करें। जैविक उत्पाद के लिए प्रीमियम दाम पाएं।',
      mr: 'फक्त शेणखत, गांडूळ खत, कडुनिंब, जैविक खते वापरा. सेंद्रिय उत्पादनासाठी प्रीमियम भाव मिळवा.',
      pa: 'ਸਿਰਫ਼ ਗੋਬਰ ਖਾਦ, ਕੀੜੇ ਖਾਦ, ਨਿੰਮ, ਜੈਵਿਕ ਖਾਦ ਵਰਤੋ। ਜੈਵਿਕ ਫ਼ਸਲ ਲਈ ਵਧੀਆ ਕੀਮਤ ਲਓ।',
      ta: 'சாணம், மண்புழு உரம், வேப்பம், உயிர் உரங்கள் மட்டுமே பயன்படுத்தவும். இயற்கை விளைபொருளுக்கு சிறந்த விலை பெறுங்கள்.',
    },
    allowed: ['FYM/Vermicompost', 'Neem/Bio-pesticides', 'Seaweed/Humic Acid', 'Trichoderma/Rhizobium'],
    notAllowed: ['Urea/DAP/MOP', 'Chemical pesticides', 'Synthetic fertilizers'],
    yieldMultiplier: '1.5x-2.5x',
    color: 'text-green-600',
    gradient: 'from-green-500 to-emerald-500',
    borderColor: 'border-green-500',
  },
  {
    mode: 'organic_fertilizer',
    icon: <><Leaf className="h-6 w-6" /><FlaskConical className="h-6 w-6" /></>,
    title: {
      en: 'Organic + Fertilizer',
      hi: 'जैविक + रासायनिक',
      mr: 'सेंद्रिय + रासायनिक',
      pa: 'ਜੈਵਿਕ + ਰਸਾਇਣਕ',
      ta: 'இயற்கை + உரம்',
    },
    subtitle: {
      en: 'Best of both worlds, balanced approach',
      hi: 'दोनों का फायदा, संतुलित तरीका',
      mr: 'दोन्हींचा फायदा, संतुलित पद्धत',
      pa: 'ਦੋਵਾਂ ਦਾ ਫਾਇਦਾ, ਸੰਤੁਲਿਤ ਤਰੀਕਾ',
      ta: 'இரண்டின் நன்மை, சமநிலை அணுகுமுறை',
    },
    description: {
      en: 'Start with organic base (60%), add chemical fertilizers (40%) for boost. Use IPM for pest control. Best yield with good soil health.',
      hi: 'जैविक आधार (60%) से शुरू करें, बढ़ोतरी के लिए रासायनिक खाद (40%) डालें। कीट नियंत्रण के लिए IPM। अच्छी पैदावार और मिट्टी स्वास्थ्य।',
      mr: 'सेंद्रिय आधार (60%) ने सुरू करा, वाढीसाठी रासायनिक खत (40%) टाका. कीड नियंत्रणासाठी IPM. चांगले उत्पादन आणि माती आरोग्य.',
      pa: 'ਜੈਵਿਕ ਬੇਸ (60%) ਨਾਲ ਸ਼ੁਰੂ ਕਰੋ, ਵਾਧੇ ਲਈ ਰਸਾਇਣਕ ਖਾਦ (40%) ਪਾਓ। ਕੀੜਿਆਂ ਲਈ IPM। ਵਧੀਆ ਝਾੜ ਤੇ ਮਿੱਟੀ ਸਿਹਤ।',
      ta: 'இயற்கை அடிப்படை (60%) தொடங்குங்கள், வளர்ச்சிக்கு ரசாயன உரம் (40%) சேர்க்கவும். பூச்சி கட்டுப்பாட்டிற்கு IPM. நல்ல மகசூல் மற்றும் மண் ஆரோக்கியம்.',
    },
    allowed: ['Organic base (60%)', 'Urea/DAP/MOP (40%)', 'Growth promoters', 'IPM pest control'],
    notAllowed: ['Excessive chemicals', 'Harmful pesticides'],
    yieldMultiplier: '3x-5x',
    color: 'text-blue-600',
    gradient: 'from-blue-500 to-cyan-500',
    borderColor: 'border-blue-500',
  },
  {
    mode: 'fertilizer_pesticide',
    icon: <><FlaskConical className="h-6 w-6" /><Bug className="h-6 w-6" /></>,
    title: {
      en: 'Full Chemical',
      hi: 'पूर्ण रासायनिक',
      mr: 'पूर्ण रासायनिक',
      pa: 'ਪੂਰੀ ਰਸਾਇਣਕ',
      ta: 'முழு ரசாயனம்',
    },
    subtitle: {
      en: 'Maximum yield focus, conventional farming',
      hi: 'अधिकतम पैदावार, परंपरागत खेती',
      mr: 'जास्तीत जास्त उत्पादन, पारंपरिक शेती',
      pa: 'ਵੱਧ ਤੋਂ ਵੱਧ ਝਾੜ, ਰਵਾਇਤੀ ਖੇਤੀ',
      ta: 'அதிகபட்ச மகசூல், வழக்கமான விவசாயம்',
    },
    description: {
      en: 'Use chemical fertilizers and pesticides for maximum yield. Includes organic base (20%) for soil health. Full pest and disease control.',
      hi: 'अधिकतम पैदावार के लिए रासायनिक खाद और कीटनाशक। मिट्टी स्वास्थ्य के लिए जैविक आधार (20%)। पूर्ण कीट और रोग नियंत्रण।',
      mr: 'जास्तीत जास्त उत्पादनासाठी रासायनिक खत आणि कीटकनाशके. माती आरोग्यासाठी सेंद्रिय आधार (20%). पूर्ण कीड आणि रोग नियंत्रण.',
      pa: 'ਵੱਧ ਝਾੜ ਲਈ ਰਸਾਇਣਕ ਖਾਦ ਤੇ ਕੀਟਨਾਸ਼ਕ। ਮਿੱਟੀ ਸਿਹਤ ਲਈ ਜੈਵਿਕ ਬੇਸ (20%)। ਪੂਰਾ ਕੀੜਾ ਤੇ ਰੋਗ ਕੰਟਰੋਲ।',
      ta: 'அதிக மகசூலுக்கு ரசாயன உரம் மற்றும் பூச்சிக்கொல்லிகள். மண் ஆரோக்கியத்திற்கு இயற்கை அடிப்படை (20%). முழு பூச்சி மற்றும் நோய் கட்டுப்பாடு.',
    },
    allowed: ['Full fertilizer program', 'All pesticides/fungicides', 'Growth regulators', 'Organic base (20%)'],
    notAllowed: ['Banned pesticides only'],
    yieldMultiplier: '5x-7x',
    color: 'text-orange-600',
    gradient: 'from-orange-500 to-red-500',
    borderColor: 'border-orange-500',
  },
];

export default function FarmingTypeDialog({ open, onOpenChange, onSelect, cropName }: FarmingTypeDialogProps) {
  const { currentLanguage } = useLanguageStore();
  const lang = currentLanguage || 'en';

  const getTitle = () => {
    const titles: Record<string, string> = {
      en: 'Select Farming Method',
      hi: 'खेती का तरीका चुनें',
      mr: 'शेती पद्धत निवडा',
      pa: 'ਖੇਤੀ ਦਾ ਤਰੀਕਾ ਚੁਣੋ',
      ta: 'விவசாய முறையை தேர்ந்தெடுக்கவும்',
    };
    return titles[lang] || titles.en;
  };

  const getDescription = () => {
    const descriptions: Record<string, string> = {
      en: `Choose how you want to grow ${cropName}. This affects what products will be recommended.`,
      hi: `${cropName} कैसे उगाना चाहते हैं चुनें। इससे कौन से उत्पाद सुझाए जाएंगे तय होगा।`,
      mr: `${cropName} कसे वाढवायचे ते निवडा. यामुळे कोणती उत्पादने सुचवली जातील ते ठरते.`,
      pa: `${cropName} ਕਿਵੇਂ ਉਗਾਉਣਾ ਹੈ ਚੁਣੋ। ਇਸ ਨਾਲ ਕਿਹੜੇ ਉਤਪਾਦ ਸੁਝਾਏ ਜਾਣਗੇ ਤੈਅ ਹੋਵੇਗਾ।`,
      ta: `${cropName} எவ்வாறு வளர்க்க விரும்புகிறீர்கள் என்பதைத் தேர்ந்தெடுக்கவும். இது எந்த தயாரிப்புகள் பரிந்துரைக்கப்படும் என்பதை தீர்மானிக்கும்.`,
    };
    return descriptions[lang] || descriptions.en;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 rounded-3xl">
        <DialogHeader className="p-6 pb-4 bg-gradient-to-r from-primary/10 to-accent/10 border-b">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            {getTitle()}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <AnimatePresence>
            {farmingOptions.map((option, index) => (
              <motion.div
                key={option.mode}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    "relative cursor-pointer transition-all duration-300 overflow-hidden",
                    "border-2 hover:shadow-xl hover:scale-[1.02]",
                    option.borderColor,
                    "hover:border-opacity-100"
                  )}
                  onClick={() => onSelect(option.mode)}
                >
                  {/* Gradient overlay */}
                  <div className={cn("absolute inset-0 opacity-5 bg-gradient-to-br", option.gradient)} />
                  
                  <div className="relative p-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "p-3 rounded-2xl text-white shadow-lg",
                          `bg-gradient-to-br ${option.gradient}`
                        )}>
                          <div className="flex items-center gap-1">
                            {option.icon}
                          </div>
                        </div>
                        <div>
                          <h3 className={cn("text-lg font-bold", option.color)}>
                            {option.title[lang] || option.title.en}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {option.subtitle[lang] || option.subtitle.en}
                          </p>
                        </div>
                      </div>
                      <Badge className={cn("text-white border-0", `bg-gradient-to-r ${option.gradient}`)}>
                        {option.yieldMultiplier} yield
                      </Badge>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {option.description[lang] || option.description.en}
                    </p>

                    {/* Allowed / Not Allowed */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {lang === 'hi' ? 'अनुमति है' : lang === 'mr' ? 'परवानगी आहे' : 'Allowed'}
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {option.allowed.map((item, i) => (
                            <Badge key={i} variant="outline" className="text-xs bg-green-500/10 border-green-500/30 text-green-700">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-red-600 flex items-center gap-1">
                          <XCircle className="h-3.5 w-3.5" />
                          {lang === 'hi' ? 'अनुमति नहीं' : lang === 'mr' ? 'परवानगी नाही' : 'Not Allowed'}
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {option.notAllowed.map((item, i) => (
                            <Badge key={i} variant="outline" className="text-xs bg-red-500/10 border-red-500/30 text-red-700">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Select Button */}
                    <Button
                      className={cn("w-full text-white", `bg-gradient-to-r ${option.gradient} hover:opacity-90`)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(option.mode);
                      }}
                    >
                      {lang === 'hi' ? 'यह तरीका चुनें' : lang === 'mr' ? 'ही पद्धत निवडा' : 'Select This Method'}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Info note */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {lang === 'hi' 
                ? 'सभी तरीकों में ग्रोथ प्रमोटर (सीवीड, ह्यूमिक एसिड) शामिल हैं। ये 10-20% पैदावार बढ़ाते हैं।'
                : lang === 'mr'
                ? 'सर्व पद्धतींमध्ये ग्रोथ प्रमोटर (सीवीड, ह्यूमिक अॅसिड) समाविष्ट आहेत. हे 10-20% उत्पादन वाढवतात.'
                : 'All methods include growth promoters (Seaweed, Humic Acid). These boost yield by 10-20%.'}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
