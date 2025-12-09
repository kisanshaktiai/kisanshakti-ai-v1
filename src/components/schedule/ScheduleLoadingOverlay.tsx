import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, Sun, Droplets, Wind, Sprout, TreeDeciduous, CloudRain, Wheat } from "lucide-react";
import { useLanguageStore } from "@/stores/languageStore";

interface ScheduleLoadingOverlayProps {
  isLoading: boolean;
  cropName: string;
  farmingType: string;
}

const motivationalQuotes: Record<string, { text: string; author?: string }[]> = {
  en: [
    {
      text: "The farmer is the only man in our economy who buys everything at retail, sells everything at wholesale, and pays the freight both ways.",
      author: "John F. Kennedy",
    },
    {
      text: "Agriculture is our wisest pursuit, because it will in the end contribute most to real wealth, good morals, and happiness.",
      author: "Thomas Jefferson",
    },
    { text: "To forget how to dig the earth and to tend the soil is to forget ourselves.", author: "Mahatma Gandhi" },
    {
      text: "The ultimate goal of farming is not the growing of crops, but the cultivation and perfection of human beings.",
      author: "Masanobu Fukuoka",
    },
  ],
  hi: [
    { text: "किसान देश की रीढ़ है। जब किसान खुश होगा, तभी देश खुशहाल होगा।", author: "लाल बहादुर शास्त्री" },
    { text: "खेती करना मनुष्य का सबसे श्रेष्ठ और पवित्र कर्म है।", author: "महात्मा गांधी" },
    { text: "मेहनत का फल हमेशा मीठा होता है।" },
    { text: "अन्न देवो भव - अन्न ही भगवान है।" },
  ],
  mr: [
    { text: "शेतकरी हा देशाचा खरा कणा आहे.", author: "लाल बहादूर शास्त्री" },
    { text: "शेती करणे हे माणसाचे सर्वात श्रेष्ठ आणि पवित्र कर्तव्य आहे.", author: "महात्मा गांधी" },
    { text: "मेहनतीचे फळ नेहमी गोड असते." },
    { text: "अन्न हेच देव आहे - अन्न देवो भव." },
  ],
  pa: [
    { text: "ਕਿਸਾਨ ਦੇਸ਼ ਦੀ ਰੀੜ੍ਹ ਹੈ।", author: "ਲਾਲ ਬਹਾਦੁਰ ਸ਼ਾਸਤਰੀ" },
    { text: "ਖੇਤੀ ਕਰਨਾ ਮਨੁੱਖ ਦਾ ਸਭ ਤੋਂ ਉੱਤਮ ਕੰਮ ਹੈ।", author: "ਮਹਾਤਮਾ ਗਾਂਧੀ" },
    { text: "ਮਿਹਨਤ ਦਾ ਫਲ ਹਮੇਸ਼ਾ ਮਿੱਠਾ ਹੁੰਦਾ ਹੈ।" },
  ],
  ta: [
    { text: "உழவர் நாட்டின் முதுகெலும்பு.", author: "லால் பகதூர் சாஸ்திரி" },
    { text: "விவசாயம் செய்வது மனிதனின் மிகச்சிறந்த கடமை.", author: "மகாத்மா காந்தி" },
    { text: "உழைப்பின் பலன் எப்போதும் இனிமையானது." },
  ],
};

const loadingSteps = [
  {
    icon: Sprout,
    text: {
      en: "Analyzing crop requirements",
      hi: "फसल आवश्यकताओं का विश्लेषण",
      mr: "पीक आवश्यकतांचे विश्लेषण",
      pa: "ਫ਼ਸਲ ਲੋੜਾਂ ਦਾ ਵਿਸ਼ਲੇਸ਼ਣ",
      ta: "பயிர் தேவைகளை ஆராய்தல்",
    },
  },
  {
    icon: Sun,
    text: {
      en: "Checking weather patterns",
      hi: "मौसम पैटर्न की जांच",
      mr: "हवामान पद्धती तपासणे",
      pa: "ਮੌਸਮ ਪੈਟਰਨ ਦੀ ਜਾਂਚ",
      ta: "வானிலை மாதிரிகளை சோதித்தல்",
    },
  },
  {
    icon: Droplets,
    text: {
      en: "Planning irrigation schedule",
      hi: "सिंचाई योजना बनाना",
      mr: "सिंचन वेळापत्रक नियोजन",
      pa: "ਸਿੰਚਾਈ ਯੋਜਨਾ",
      ta: "நீர்ப்பாசன திட்டம்",
    },
  },
  {
    icon: Leaf,
    text: {
      en: "Designing nutrient management",
      hi: "पोषक तत्व प्रबंधन",
      mr: "पोषक व्यवस्थापन",
      pa: "ਪੋਸ਼ਕ ਤੱਤ ਪ੍ਰਬੰਧਨ",
      ta: "ஊட்டச்சத்து மேலாண்மை",
    },
  },
  {
    icon: TreeDeciduous,
    text: {
      en: "Setting growth milestones",
      hi: "विकास मील के पत्थर",
      mr: "वाढ टप्पे",
      pa: "ਵਿਕਾਸ ਮੀਲ ਪੱਥਰ",
      ta: "வளர்ச்சி மைல்கற்கள்",
    },
  },
  {
    icon: CloudRain,
    text: {
      en: "Optimizing for monsoon",
      hi: "मानसून अनुकूलन",
      mr: "मान्सून अनुकूलन",
      pa: "ਮਾਨਸੂਨ ਅਨੁਕੂਲਨ",
      ta: "பருவமழை மேம்படுத்தல்",
    },
  },
  {
    icon: Wheat,
    text: {
      en: "Finalizing harvest timeline",
      hi: "कटाई समयरेखा",
      mr: "कापणी टाइमलाइन",
      pa: "ਵਾਢੀ ਸਮਾਂ-ਸਾਰਣੀ",
      ta: "அறுவடை காலக்கெடு",
    },
  },
];

export default function ScheduleLoadingOverlay({ isLoading, cropName, farmingType }: ScheduleLoadingOverlayProps) {
  const { currentLanguage } = useLanguageStore();
  const lang = currentLanguage || "en";
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const quotes = motivationalQuotes[lang] || motivationalQuotes.en;

  useEffect(() => {
    if (!isLoading) return;

    const quoteInterval = setInterval(() => {
      setCurrentQuoteIndex((prev) => (prev + 1) % quotes.length);
    }, 5000);

    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev + 1) % loadingSteps.length);
    }, 2000);

    return () => {
      clearInterval(quoteInterval);
      clearInterval(stepInterval);
    };
  }, [isLoading, quotes.length]);

  useEffect(() => {
    if (isLoading) {
      setCurrentQuoteIndex(0);
      setCurrentStepIndex(0);
    }
  }, [isLoading]);

  if (!isLoading) return null;

  const currentQuote = quotes[currentQuoteIndex];

  const getFarmingTypeLabel = () => {
    const labels: Record<string, Record<string, string>> = {
      organic_only: {
        en: "100% Organic",
        hi: "पूर्ण जैविक",
        mr: "संपूर्ण सेंद्रिय",
        pa: "ਪੂਰੀ ਜੈਵਿਕ",
        ta: "முழு இயற்கை",
      },
      organic_fertilizer: {
        en: "Organic + Fertilizer",
        hi: "जैविक + रासायनिक",
        mr: "सेंद्रिय + रासायनिक",
        pa: "ਜੈਵਿਕ + ਰਸਾਇਣਕ",
        ta: "இயற்கை + உரம்",
      },
      fertilizer_pesticide: {
        en: "Full Chemical",
        hi: "पूर्ण रासायनिक",
        mr: "पूर्ण रासायनिक",
        pa: "ਪੂਰੀ ਰਸਾਇਣਕ",
        ta: "முழு ரசாயனம்",
      },
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
        <div className="max-w-md w-full mx-4 space-y-6">
          {/* Main Animation Area */}
          <div className="relative flex justify-center h-40">
            {/* Outer rotating ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute w-36 h-36 rounded-full border-2 border-dashed border-primary/30"
            />

            {/* Middle pulsing ring */}
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute w-28 h-28 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/40"
            />

            {/* Inner spinning elements */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute w-20 h-20"
            >
              {[0, 72, 144, 216, 288].map((deg, i) => (
                <motion.div
                  key={deg}
                  className="absolute w-3 h-3 bg-primary/60 rounded-full"
                  style={{
                    transform: `rotate(${deg}deg) translateY(-32px)`,
                    transformOrigin: "center center",
                  }}
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </motion.div>

            {/* Center icon - smooth crossfade between steps */}
            <div className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl">
              <AnimatePresence mode="wait">
                {loadingSteps.map((step, index) => {
                  const Icon = step.icon;
                  return index === currentStepIndex ? (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.3 }}
                      className="absolute"
                    >
                      <Icon className="h-8 w-8 text-white" />
                    </motion.div>
                  ) : null;
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Crop & Farming Type */}
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{cropName}</p>
            <p className="text-sm text-primary font-medium">{getFarmingTypeLabel()}</p>
          </div>

          {/* Single Step Display - smooth transition */}
          <div className="h-12 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {loadingSteps.map((step, index) => {
                const Icon = step.icon;
                return index === currentStepIndex ? (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-full"
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium text-foreground">
                      {step.text[lang as keyof typeof step.text] || step.text.en}
                    </span>
                  </motion.div>
                ) : null;
              })}
            </AnimatePresence>
          </div>

          {/* Progress Dots */}
          <div className="flex justify-center gap-1.5">
            {loadingSteps.map((_, i) => (
              <motion.div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStepIndex
                    ? "w-6 bg-primary"
                    : i < currentStepIndex
                      ? "w-1.5 bg-primary/50"
                      : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Motivational Quote - smooth crossfade */}
          <div className="h-28 flex items-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentQuoteIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="text-center px-4 py-4 rounded-xl bg-muted/50 border border-border/50 w-full"
              >
                <p className="text-sm italic text-foreground/80 leading-relaxed">"{currentQuote.text}"</p>
                {currentQuote.author && <p className="text-xs text-muted-foreground mt-2">— {currentQuote.author}</p>}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Loading indicator */}
          <div className="flex justify-center items-center gap-2 text-xs text-muted-foreground">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full"
            />
            <span>
              {lang === "hi"
                ? "AI शेड्यूल तैयार कर रहा है..."
                : lang === "mr"
                  ? "AI वेळापत्रक तयार करत आहे..."
                  : lang === "pa"
                    ? "AI ਅਨੁਸੂਚੀ ਤਿਆਰ ਕਰ ਰਿਹਾ ਹੈ..."
                    : lang === "ta"
                      ? "AI அட்டவணை தயாரிக்கிறது..."
                      : "AI preparing your schedule..."}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
