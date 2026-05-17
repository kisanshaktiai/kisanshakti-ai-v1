/**
 * FeatureWalkthrough - voice-narrated coach-mark tour shown once after
 * first authenticated visit. Highlights real DOM elements via data-tour attrs.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, ArrowRight, ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useFeatureWalkthrough } from '@/hooks/useFeatureWalkthrough';

type Step = {
  target: string; // data-tour value, '' = center modal
  titleFallback: string;
  bodyFallback: string;
  narrations: Record<string, string>;
};

const STEPS: Step[] = [
  {
    target: '',
    titleFallback: 'Welcome 🌾',
    bodyFallback: 'Let me show you around. Tap Next to continue.',
    narrations: {
      hi: 'नमस्ते किसान भाई! आइए मैं आपको ऐप दिखाता हूँ। आगे बढ़ने के लिए अगला दबाएँ।',
      mr: 'नमस्कार शेतकरी मित्रा! मी तुम्हाला अॅप दाखवतो. पुढे जाण्यासाठी पुढे दाबा।',
      en: 'Hello farmer! Let me show you the app. Tap Next to continue.',
    },
  },
  {
    target: 'weather',
    titleFallback: "Today's Weather",
    bodyFallback: 'See live weather for your farm right here.',
    narrations: {
      hi: 'यहाँ आपके खेत के लिए आज का मौसम दिखेगा।',
      mr: 'इथे तुमच्या शेतासाठी आजचे हवामान दिसेल।',
      en: "This shows today's weather for your farm.",
    },
  },
  {
    target: 'chat',
    titleFallback: 'Ask AI',
    bodyFallback: 'Ask any farming question by voice or text.',
    narrations: {
      hi: 'कोई भी खेती का सवाल यहाँ बोलकर या लिखकर पूछें।',
      mr: 'कोणताही शेतीचा प्रश्न इथे बोलून किंवा लिहून विचारा।',
      en: 'Ask any farming question here, by voice or text.',
    },
  },
  {
    target: 'scan',
    titleFallback: 'Scan Crop',
    bodyFallback: 'Take a photo of your crop to identify pests and diseases.',
    narrations: {
      hi: 'फसल की फोटो लेकर कीट और रोग पहचानें।',
      mr: 'पिकाचा फोटो काढून कीड व रोग ओळखा।',
      en: 'Take a photo of your crop to identify pests and diseases.',
    },
  },
  {
    target: 'mic',
    titleFallback: 'Voice Button',
    bodyFallback: 'Press and hold this button to speak in your language.',
    narrations: {
      hi: 'इस बटन को दबाकर रखें और अपनी भाषा में बोलें।',
      mr: 'हे बटण दाबून ठेवा आणि आपल्या भाषेत बोला।',
      en: 'Press and hold this button to speak in your language.',
    },
  },
  {
    target: 'nav',
    titleFallback: 'Bottom Menu',
    bodyFallback: 'Switch between Home, Weather, Market and more from here.',
    narrations: {
      hi: 'यहाँ से होम, मौसम, मंडी और अन्य पेज पर जाएँ।',
      mr: 'इथून मुख्यपान, हवामान, बाजार आणि इतर पानांवर जा।',
      en: 'Switch between Home, Weather, Market and more from here.',
    },
  },
];

export function FeatureWalkthrough() {
  const { shouldShow, finish } = useFeatureWalkthrough();
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || 'en').split('-')[0];
  const { speak, stop } = useTextToSpeech({ language: lang });
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);

  const step = STEPS[index];
  const narration = useMemo(
    () => step.narrations[lang] || step.narrations.en,
    [step, lang]
  );

  // Track target element position
  useEffect(() => {
    if (!shouldShow) return;
    const measure = () => {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        // Scroll element into view first
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        } catch {
          /* noop */
        }
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    measure();
    const loop = () => {
      measure();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [shouldShow, step.target, index]);

  // Auto-narrate on step change
  useEffect(() => {
    if (!shouldShow || muted) return;
    const id = setTimeout(() => {
      speak(narration).catch(() => null);
    }, 350);
    return () => {
      clearTimeout(id);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow, index, muted, narration]);

  if (!shouldShow) return null;

  const handleNext = () => {
    stop();
    if (index < STEPS.length - 1) setIndex(index + 1);
    else finish();
  };
  const handleBack = () => {
    stop();
    if (index > 0) setIndex(index - 1);
  };
  const handleSkip = () => {
    stop();
    finish();
  };
  const handleSpeakAgain = () => speak(narration).catch(() => null);
  const handleToggleMute = () => {
    if (!muted) stop();
    setMuted((m) => !m);
  };

  // Build spotlight overlay using SVG mask (cutout around target)
  const padding = 10;
  const radius = 16;
  const hasTarget = !!rect;
  const bubbleTop = hasTarget && rect!.bottom + 16 < window.innerHeight - 220
    ? rect!.bottom + 16
    : hasTarget
      ? Math.max(16, rect!.top - 220)
      : window.innerHeight / 2 - 110;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="tour-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999]"
        aria-modal="true"
        role="dialog"
      >
        {/* Spotlight backdrop */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-auto"
          width="100%"
          height="100%"
        >
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              {hasTarget && (
                <rect
                  x={Math.max(0, rect!.left - padding)}
                  y={Math.max(0, rect!.top - padding)}
                  width={rect!.width + padding * 2}
                  height={rect!.height + padding * 2}
                  rx={radius}
                  ry={radius}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.72)"
            mask="url(#tour-mask)"
          />
        </svg>

        {/* Pulsing ring around target */}
        {hasTarget && (
          <motion.div
            className="absolute border-2 border-primary rounded-2xl pointer-events-none"
            style={{
              left: rect!.left - padding,
              top: rect!.top - padding,
              width: rect!.width + padding * 2,
              height: rect!.height + padding * 2,
            }}
            animate={{ scale: [1, 1.04, 1], opacity: [0.9, 0.4, 0.9] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        )}

        {/* Coach bubble */}
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-4 right-4 mx-auto max-w-md bg-card text-card-foreground rounded-2xl shadow-2xl border border-border p-5"
          style={{ top: bubbleTop }}
        >
          <div className="flex items-start justify-between mb-2">
            <h2 className="text-lg font-bold">
              {t(`tour.${step.target || 'welcome'}.title`, step.titleFallback)}
            </h2>
            <button
              onClick={handleSkip}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Skip tour"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {narration}
          </p>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSpeakAgain}
                className="gap-1"
              >
                <Volume2 className="w-4 h-4" />
                {t('tour.listen', 'Listen')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleToggleMute}
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 opacity-50" />}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {index > 0 && (
                <Button size="sm" variant="ghost" onClick={handleBack} className="gap-1">
                  <ArrowLeft className="w-4 h-4" />
                  {t('common.back', 'Back')}
                </Button>
              )}
              <Button size="sm" onClick={handleNext} className="gap-1">
                {index === STEPS.length - 1
                  ? t('tour.done', 'Done')
                  : t('common.next', 'Next')}
                {index < STEPS.length - 1 && <ArrowRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-6 bg-primary' : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
