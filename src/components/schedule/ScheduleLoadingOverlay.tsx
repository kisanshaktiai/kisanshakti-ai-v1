import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, Sun, Droplets, Wind, Sprout, TreeDeciduous, CloudRain, Wheat } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ScheduleLoadingOverlayProps {
  isLoading: boolean;
  cropName: string;
  farmingType: string;
}

const loadingSteps = [
  { icon: Sprout, key: "crop_requirements" },
  { icon: Sun, key: "weather" },
  { icon: Droplets, key: "irrigation" },
  { icon: Leaf, key: "nutrition" },
  { icon: TreeDeciduous, key: "growth" },
  { icon: CloudRain, key: "monsoon" },
  { icon: Wheat, key: "harvest" },
] as const;

export default function ScheduleLoadingOverlay({ isLoading, cropName, farmingType }: ScheduleLoadingOverlayProps) {
  const { t } = useTranslation();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const quotes = motivationalQuotes[lang] || motivationalQuotes.en;

  useEffect(() => {
    if (!isLoading) return;

    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev + 1) % loadingSteps.length);
    }, 2000);

    return () => {
      clearInterval(stepInterval);
    };
  }, [isLoading, quotes.length]);

  useEffect(() => {
    if (isLoading) {
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
            <p className="text-sm text-primary font-medium">{t(`schedule.loading_overlay.farming_type.${farmingType}`, farmingType)}</p>
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
                      {t(`schedule.loading_overlay.steps.${step.key}`)}
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

          {/* Loading indicator */}
          <div className="flex justify-center items-center gap-2 text-xs text-muted-foreground">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full"
            />
            <span>
              {t('schedule.loading_overlay.preparing')}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}