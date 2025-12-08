import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Leaf, Sun, Droplets, Wind, Sprout, TreeDeciduous, CloudRain, Wheat } from 'lucide-react';
import { useLanguageStore } from '@/stores/languageStore';

interface ScheduleLoadingOverlayProps {
  isLoading: boolean;
  cropName: string;
  farmingType: string;
}

const motivationalQuotes: Record<string, { text: string; author?: string }[]> = {
  en: [
    { text: "The farmer is the only man in our economy who buys everything at retail, sells everything at wholesale, and pays the freight both ways.", author: "John F. Kennedy" },
    { text: "Agriculture is our wisest pursuit, because it will in the end contribute most to real wealth, good morals, and happiness.", author: "Thomas Jefferson" },
    { text: "Farming looks mighty easy when your plow is a pencil and you're a thousand miles from the corn field.", author: "Dwight D. Eisenhower" },
    { text: "To forget how to dig the earth and to tend the soil is to forget ourselves.", author: "Mahatma Gandhi" },
    { text: "The ultimate goal of farming is not the growing of crops, but the cultivation and perfection of human beings.", author: "Masanobu Fukuoka" },
    { text: "Good farmers, who take seriously their duties as stewards of Creation and of their land's inheritors, contribute to the welfare of society.", author: "Wendell Berry" },
    { text: "Agriculture is the most healthful, most useful and most noble employment of man.", author: "George Washington" },
  ],
  hi: [
    { text: "किसान देश की रीढ़ है। जब किसान खुश होगा, तभी देश खुशहाल होगा।", author: "लाल बहादुर शास्त्री" },
    { text: "खेती करना मनुष्य का सबसे श्रेष्ठ और पवित्र कर्म है।", author: "महात्मा गांधी" },
    { text: "जो मिट्टी से जुड़ा है, वही सच्चा इंसान है।" },
    { text: "बीज बोने वाला कभी भूखा नहीं रहता।" },
    { text: "मेहनत का फल हमेशा मीठा होता है।" },
    { text: "अन्न देवो भव - अन्न ही भगवान है।" },
    { text: "किसान की मेहनत से ही देश का पेट भरता है।" },
  ],
  mr: [
    { text: "शेतकरी हा देशाचा खरा कणा आहे.", author: "लाल बहादूर शास्त्री" },
    { text: "शेती करणे हे माणसाचे सर्वात श्रेष्ठ आणि पवित्र कर्तव्य आहे.", author: "महात्मा गांधी" },
    { text: "जो माती शी जोडलेला आहे, तोच खरा माणूस आहे." },
    { text: "बीज पेरणारा कधी उपाशी राहत नाही." },
    { text: "मेहनतीचे फळ नेहमी गोड असते." },
    { text: "अन्न हेच देव आहे - अन्न देवो भव." },
    { text: "शेतकऱ्याच्या मेहनतीमुळेच देशाचे पोट भरते." },
  ],
  pa: [
    { text: "ਕਿਸਾਨ ਦੇਸ਼ ਦੀ ਰੀੜ੍ਹ ਹੈ।", author: "ਲਾਲ ਬਹਾਦੁਰ ਸ਼ਾਸਤਰੀ" },
    { text: "ਖੇਤੀ ਕਰਨਾ ਮਨੁੱਖ ਦਾ ਸਭ ਤੋਂ ਉੱਤਮ ਕੰਮ ਹੈ।", author: "ਮਹਾਤਮਾ ਗਾਂਧੀ" },
    { text: "ਜੋ ਮਿੱਟੀ ਨਾਲ ਜੁੜਿਆ ਹੈ, ਉਹੀ ਸੱਚਾ ਇਨਸਾਨ ਹੈ।" },
    { text: "ਬੀਜ ਬੀਜਣ ਵਾਲਾ ਕਦੇ ਭੁੱਖਾ ਨਹੀਂ ਰਹਿੰਦਾ।" },
    { text: "ਮਿਹਨਤ ਦਾ ਫਲ ਹਮੇਸ਼ਾ ਮਿੱਠਾ ਹੁੰਦਾ ਹੈ।" },
  ],
  ta: [
    { text: "உழவர் நாட்டின் முதுகெலும்பு.", author: "லால் பகதூர் சாஸ்திரி" },
    { text: "விவசாயம் செய்வது மனிதனின் மிகச்சிறந்த கடமை.", author: "மகாத்மா காந்தி" },
    { text: "மண்ணுடன் இணைந்தவனே உண்மையான மனிதன்." },
    { text: "விதைப்பவன் ஒருபோதும் பசியால் வாடமாட்டான்." },
    { text: "உழைப்பின் பலன் எப்போதும் இனிமையானது." },
  ],
};

const loadingSteps = [
  { icon: Sprout, text: { en: 'Analyzing crop requirements...', hi: 'फसल आवश्यकताओं का विश्लेषण...', mr: 'पीक आवश्यकतांचे विश्लेषण...', pa: 'ਫ਼ਸਲ ਲੋੜਾਂ ਦਾ ਵਿਸ਼ਲੇਸ਼ਣ...', ta: 'பயிர் தேவைகளை ஆராய்கிறது...' } },
  { icon: Sun, text: { en: 'Checking weather patterns...', hi: 'मौसम पैटर्न की जांच...', mr: 'हवामान पद्धती तपासत आहे...', pa: 'ਮੌਸਮ ਪੈਟਰਨ ਦੀ ਜਾਂਚ...', ta: 'வானிலை மாதிரிகளை சோதிக்கிறது...' } },
  { icon: Droplets, text: { en: 'Planning irrigation schedule...', hi: 'सिंचाई अनुसूची की योजना...', mr: 'सिंचन वेळापत्रक नियोजन...', pa: 'ਸਿੰਚਾਈ ਅਨੁਸੂਚੀ ਦੀ ਯੋਜਨਾ...', ta: 'நீர்ப்பாசன அட்டவணை திட்டமிடுகிறது...' } },
  { icon: Leaf, text: { en: 'Designing nutrient management...', hi: 'पोषक तत्व प्रबंधन डिजाइन...', mr: 'पोषक व्यवस्थापन डिझाइन...', pa: 'ਪੋਸ਼ਕ ਤੱਤ ਪ੍ਰਬੰਧਨ ਡਿਜ਼ਾਈਨ...', ta: 'ஊட்டச்சத்து மேலாண்மை வடிவமைப்பு...' } },
  { icon: TreeDeciduous, text: { en: 'Setting growth milestones...', hi: 'विकास मील के पत्थर सेट करना...', mr: 'वाढ टप्पे सेट करत आहे...', pa: 'ਵਿਕਾਸ ਮੀਲ ਪੱਥਰ ਸੈੱਟ ਕਰਨਾ...', ta: 'வளர்ச்சி மைல்கற்கள் அமைக்கிறது...' } },
  { icon: CloudRain, text: { en: 'Optimizing for monsoon...', hi: 'मानसून के लिए अनुकूलन...', mr: 'मान्सूनसाठी अनुकूलन...', pa: 'ਮਾਨਸੂਨ ਲਈ ਅਨੁਕੂਲਨ...', ta: 'பருவமழைக்கு மேம்படுத்துகிறது...' } },
  { icon: Wheat, text: { en: 'Finalizing harvest timeline...', hi: 'कटाई समयरेखा को अंतिम रूप दे रहा है...', mr: 'कापणी टाइमलाइन अंतिम करत आहे...', pa: 'ਵਾਢੀ ਸਮਾਂ-ਸਾਰਣੀ ਨੂੰ ਅੰਤਿਮ ਰੂਪ...', ta: 'அறுவடை காலக்கெடுவை இறுதி செய்கிறது...' } },
];

export default function ScheduleLoadingOverlay({ isLoading, cropName, farmingType }: ScheduleLoadingOverlayProps) {
  const { currentLanguage } = useLanguageStore();
  const lang = currentLanguage || 'en';
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const quotes = motivationalQuotes[lang] || motivationalQuotes.en;

  useEffect(() => {
    if (!isLoading) return;

    // Rotate quotes every 5 seconds
    const quoteInterval = setInterval(() => {
      setCurrentQuoteIndex((prev) => (prev + 1) % quotes.length);
    }, 5000);

    // Rotate steps every 2.5 seconds
    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev + 1) % loadingSteps.length);
    }, 2500);

    return () => {
      clearInterval(quoteInterval);
      clearInterval(stepInterval);
    };
  }, [isLoading, quotes.length]);

  // Reset indices when loading starts
  useEffect(() => {
    if (isLoading) {
      setCurrentQuoteIndex(0);
      setCurrentStepIndex(0);
    }
  }, [isLoading]);

  if (!isLoading) return null;

  const currentStep = loadingSteps[currentStepIndex];
  const CurrentIcon = currentStep.icon;
  const currentQuote = quotes[currentQuoteIndex];

  const getFarmingTypeLabel = () => {
    const labels: Record<string, Record<string, string>> = {
      organic_only: { en: '100% Organic', hi: 'पूर्ण जैविक', mr: 'संपूर्ण सेंद्रिय', pa: 'ਪੂਰੀ ਜੈਵਿਕ', ta: 'முழு இயற்கை' },
      organic_fertilizer: { en: 'Organic + Fertilizer', hi: 'जैविक + रासायनिक', mr: 'सेंद्रिय + रासायनिक', pa: 'ਜੈਵਿਕ + ਰਸਾਇਣਕ', ta: 'இயற்கை + உரம்' },
      fertilizer_pesticide: { en: 'Full Chemical', hi: 'पूर्ण रासायनिक', mr: 'पूर्ण रासायनिक', pa: 'ਪੂਰੀ ਰਸਾਇਣਕ', ta: 'முழு ரசாயனம்' },
    };
    return labels[farmingType]?.[lang] || labels[farmingType]?.en || farmingType;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-xl"
      >
        <div className="max-w-lg w-full mx-4 space-y-8">
          {/* Main Animation Area */}
          <div className="relative flex justify-center">
            {/* Outer rotating ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute w-48 h-48 rounded-full border-2 border-dashed border-primary/30"
            />
            
            {/* Middle pulsing ring */}
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute w-36 h-36 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/40"
            />

            {/* Inner spinning elements */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute w-24 h-24"
            >
              {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                <motion.div
                  key={deg}
                  className="absolute w-4 h-4 bg-primary/60 rounded-full"
                  style={{
                    transform: `rotate(${deg}deg) translateY(-40px)`,
                    transformOrigin: 'center center',
                  }}
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </motion.div>

            {/* Center icon */}
            <motion.div
              key={currentStepIndex}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative z-10 w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl"
            >
              <CurrentIcon className="h-10 w-10 text-white" />
            </motion.div>
          </div>

          {/* Current Step Text */}
          <motion.div
            key={currentStepIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center"
          >
            <p className="text-lg font-semibold text-primary">
              {currentStep.text[lang as keyof typeof currentStep.text] || currentStep.text.en}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {cropName} • {getFarmingTypeLabel()}
            </p>
          </motion.div>

          {/* Progress Dots */}
          <div className="flex justify-center gap-2">
            {loadingSteps.map((_, i) => (
              <motion.div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  i === currentStepIndex ? 'bg-primary' : i < currentStepIndex ? 'bg-primary/50' : 'bg-muted'
                }`}
                animate={i === currentStepIndex ? { scale: [1, 1.3, 1] } : {}}
                transition={{ duration: 0.5, repeat: Infinity }}
              />
            ))}
          </div>

          {/* Motivational Quote */}
          <motion.div
            key={currentQuoteIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="text-center px-6 py-6 rounded-2xl bg-gradient-to-br from-accent/10 to-primary/10 border border-border/50"
          >
            <p className="text-base italic text-foreground/90 leading-relaxed">
              "{currentQuote.text}"
            </p>
            {currentQuote.author && (
              <p className="text-sm text-muted-foreground mt-3">
                — {currentQuote.author}
              </p>
            )}
          </motion.div>

          {/* Loading indicator */}
          <div className="flex justify-center items-center gap-2 text-sm text-muted-foreground">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full"
            />
            <span>
              {lang === 'hi' ? 'AI शेड्यूल तैयार कर रहा है...' 
                : lang === 'mr' ? 'AI शेड्यूल तयार करत आहे...'
                : lang === 'pa' ? 'AI ਅਨੁਸੂਚੀ ਤਿਆਰ ਕਰ ਰਿਹਾ ਹੈ...'
                : lang === 'ta' ? 'AI அட்டவணை தயாரிக்கிறது...'
                : 'AI is preparing your personalized schedule...'}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}