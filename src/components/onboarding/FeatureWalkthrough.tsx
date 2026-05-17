/**
 * FeatureWalkthrough — 2030-ready, mobile-first, voice-narrated coach tour.
 *
 * Premium glass bottom-sheet coach card with cinematic spotlight (corner
 * brackets, rotating halo, aurora backdrop) targeting real DOM elements via
 * `data-tour` attributes. Optimized for low-end Android: ResizeObserver +
 * scroll listeners instead of an always-on RAF loop, single backdrop-blur
 * layer, framer-motion respects prefers-reduced-motion.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
  Volume2,
  VolumeX,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
  CloudSun,
  MessageCircle,
  ScanLine,
  Mic,
  LayoutGrid,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useFeatureWalkthrough } from '@/hooks/useFeatureWalkthrough';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { hapticFeedback } from '@/lib/haptics';
import { cn } from '@/lib/utils';

type Step = {
  target: string;
  Icon: typeof Sparkles;
  accent: string; // tailwind classes for chip gradient
  titleFallback: string;
  narrations: Record<string, string>;
};

const STEPS: Step[] = [
  {
    target: '',
    Icon: Sparkles,
    accent: 'from-primary to-accent',
    titleFallback: 'Welcome 🌾',
    narrations: {
      hi: 'नमस्ते किसान भाई! आइए मैं आपको ऐप दिखाता हूँ। आगे बढ़ने के लिए अगला दबाएँ।',
      mr: 'नमस्कार शेतकरी मित्रा! मी तुम्हाला अॅप दाखवतो. पुढे जाण्यासाठी पुढे दाबा।',
      en: 'Hello farmer! Let me show you the app. Tap Next to continue.',
    },
  },
  {
    target: 'weather',
    Icon: CloudSun,
    accent: 'from-sky-500 to-primary',
    titleFallback: "Today's Weather",
    narrations: {
      hi: 'यहाँ आपके खेत के लिए आज का मौसम दिखेगा।',
      mr: 'इथे तुमच्या शेतासाठी आजचे हवामान दिसेल।',
      en: "This shows today's weather for your farm.",
    },
  },
  {
    target: 'chat',
    Icon: MessageCircle,
    accent: 'from-primary to-emerald-500',
    titleFallback: 'Ask AI',
    narrations: {
      hi: 'कोई भी खेती का सवाल यहाँ बोलकर या लिखकर पूछें।',
      mr: 'कोणताही शेतीचा प्रश्न इथे बोलून किंवा लिहून विचारा।',
      en: 'Ask any farming question here, by voice or text.',
    },
  },
  {
    target: 'scan',
    Icon: ScanLine,
    accent: 'from-amber-500 to-orange-500',
    titleFallback: 'Scan Crop',
    narrations: {
      hi: 'फसल की फोटो लेकर कीट और रोग पहचानें।',
      mr: 'पिकाचा फोटो काढून कीड व रोग ओळखा।',
      en: 'Take a photo of your crop to identify pests and diseases.',
    },
  },
  {
    target: 'mic',
    Icon: Mic,
    accent: 'from-rose-500 to-pink-500',
    titleFallback: 'Voice Button',
    narrations: {
      hi: 'इस बटन को दबाकर रखें और अपनी भाषा में बोलें।',
      mr: 'हे बटण दाबून ठेवा आणि आपल्या भाषेत बोला।',
      en: 'Press and hold this button to speak in your language.',
    },
  },
  {
    target: 'nav',
    Icon: LayoutGrid,
    accent: 'from-indigo-500 to-violet-500',
    titleFallback: 'Bottom Menu',
    narrations: {
      hi: 'यहाँ से होम, मौसम, मंडी और अन्य पेज पर जाएँ।',
      mr: 'इथून मुख्यपान, हवामान, बाजार आणि इतर पानांवर जा।',
      en: 'Switch between Home, Weather, Market and more from here.',
    },
  },
];

/* -------- Sub-components -------- */

function Aurora({ disabled }: { disabled: boolean }) {
  if (disabled) return null;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute w-[60vw] h-[60vw] rounded-full blur-3xl opacity-30"
        style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }}
        animate={{ x: ['-10%', '40%', '-10%'], y: ['10%', '60%', '10%'] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[55vw] h-[55vw] rounded-full blur-3xl opacity-25"
        style={{ background: 'radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)' }}
        animate={{ x: ['70%', '20%', '70%'], y: ['60%', '20%', '60%'] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

function CornerBrackets({ rect, padding }: { rect: DOMRect; padding: number }) {
  const left = Math.max(0, rect.left - padding);
  const top = Math.max(0, rect.top - padding);
  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;
  const size = 22;
  const stroke = 3;
  const corner = (style: React.CSSProperties) => (
    <motion.span
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: 'backOut' }}
      className="absolute border-primary"
      style={{ width: size, height: size, ...style }}
    />
  );
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left, top, width, height }}
    >
      {corner({ left: 0, top: 0, borderLeftWidth: stroke, borderTopWidth: stroke, borderTopLeftRadius: 12 })}
      {corner({ right: 0, top: 0, borderRightWidth: stroke, borderTopWidth: stroke, borderTopRightRadius: 12 })}
      {corner({ left: 0, bottom: 0, borderLeftWidth: stroke, borderBottomWidth: stroke, borderBottomLeftRadius: 12 })}
      {corner({ right: 0, bottom: 0, borderRightWidth: stroke, borderBottomWidth: stroke, borderBottomRightRadius: 12 })}
    </div>
  );
}

function Halo({ rect, padding, reduce }: { rect: DOMRect; padding: number; reduce: boolean }) {
  if (reduce) return null;
  return (
    <motion.div
      className="absolute rounded-2xl border-2 border-dashed border-primary/40 pointer-events-none"
      style={{
        left: rect.left - padding - 8,
        top: rect.top - padding - 8,
        width: rect.width + padding * 2 + 16,
        height: rect.height + padding * 2 + 16,
      }}
      animate={{ rotate: 360 }}
      transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
    />
  );
}

function SpeakingBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-primary"
          animate={
            active
              ? { height: ['25%', '100%', '40%', '85%', '30%'] }
              : { height: '25%' }
          }
          transition={{
            duration: 0.9,
            repeat: active ? Infinity : 0,
            delay: i * 0.12,
            ease: 'easeInOut',
          }}
          style={{ height: '25%' }}
        />
      ))}
    </div>
  );
}

function ProgressSegments({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 flex-1">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-accent"
            initial={false}
            animate={{ width: i < current ? '100%' : i === current ? '60%' : '0%' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      ))}
    </div>
  );
}

/* -------- Main component -------- */

export function FeatureWalkthrough() {
  const { shouldShow, finish } = useFeatureWalkthrough();
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const lang = (i18n.language || 'en').split('-')[0];
  const { speak, stop, isSpeaking } = useTextToSpeech({ language: lang });
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dragControls = useDragControls();
  const cardRef = useRef<HTMLDivElement | null>(null);

  const step = STEPS[index];
  const narration = useMemo(
    () => step.narrations[lang] || step.narrations.en,
    [step, lang]
  );

  /* Track target element position via ResizeObserver + scroll/resize */
  useEffect(() => {
    if (!shouldShow) return;

    const measure = () => {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      setRect(el.getBoundingClientRect());
    };

    // Initial: scroll target into view, then measure
    const el = step.target
      ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      : null;
    if (el) {
      try {
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      } catch {
        /* noop */
      }
    }
    measure();

    // Burst RAF for first 700ms to track scroll/layout settling
    let raf: number;
    const t0 = performance.now();
    const burst = () => {
      measure();
      if (performance.now() - t0 < 700) {
        raf = requestAnimationFrame(burst);
      }
    };
    raf = requestAnimationFrame(burst);

    // Then idle listeners
    const ro = new ResizeObserver(measure);
    if (el) ro.observe(el);
    ro.observe(document.body);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [shouldShow, step.target, reduce]);

  /* Auto-narrate on step change */
  useEffect(() => {
    if (!shouldShow || muted) return;
    const id = setTimeout(() => {
      speak(narration).catch(() => null);
    }, 400);
    return () => {
      clearTimeout(id);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow, index, muted, narration]);

  /* Keyboard: Esc skips, arrows nav */
  useEffect(() => {
    if (!shouldShow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'ArrowLeft') handleBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow, index]);

  if (!shouldShow) return null;

  const handleNext = () => {
    hapticFeedback('light');
    stop();
    if (index < STEPS.length - 1) setIndex(index + 1);
    else {
      hapticFeedback('success');
      finish();
    }
  };
  const handleBack = () => {
    hapticFeedback('light');
    stop();
    if (index > 0) setIndex(index - 1);
  };
  const handleSkip = () => {
    hapticFeedback('light');
    stop();
    finish();
  };
  const handleSpeakAgain = () => {
    hapticFeedback('light');
    speak(narration).catch(() => null);
  };
  const handleToggleMute = () => {
    if (!muted) stop();
    setMuted((m) => !m);
  };

  const padding = 10;
  const radius = 18;
  const hasTarget = !!rect;
  const Icon = step.Icon;
  const isLast = index === STEPS.length - 1;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="tour"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] overflow-hidden"
        aria-modal="true"
        role="dialog"
        aria-label="App walkthrough"
      >
        {/* Aurora ambient backdrop */}
        <Aurora disabled={reduce} />

        {/* Spotlight mask */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-auto"
          aria-hidden="true"
        >
          <defs>
            <mask id="tour-mask-2030">
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
            <filter id="tour-glow">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(3, 7, 18, 0.82)"
            mask="url(#tour-mask-2030)"
          />
        </svg>

        {/* Halo + brackets */}
        {hasTarget && (
          <>
            <Halo rect={rect!} padding={padding} reduce={reduce} />
            <CornerBrackets rect={rect!} padding={padding} />
            {!reduce && (
              <motion.div
                className="absolute rounded-2xl pointer-events-none"
                style={{
                  left: rect!.left - padding,
                  top: rect!.top - padding,
                  width: rect!.width + padding * 2,
                  height: rect!.height + padding * 2,
                  boxShadow: '0 0 0 1px hsl(var(--primary) / 0.6), 0 0 40px hsl(var(--primary) / 0.35)',
                }}
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </>
        )}

        {/* Top bar: progress + skip */}
        <div className="absolute top-0 left-0 right-0 pt-safe">
          <div className="flex items-center gap-3 px-4 pt-4">
            <ProgressSegments current={index} total={STEPS.length} />
            <button
              onClick={handleSkip}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs font-medium hover:bg-white/20 active:scale-95 transition"
              aria-label="Skip tour"
            >
              {t('tour.skip', 'Skip')}
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-4 pt-2 text-[11px] text-white/60 font-medium tracking-wide">
            {t('tour.stepLabel', 'STEP')} {index + 1} / {STEPS.length}
          </div>
        </div>

        {/* Coach bottom-sheet */}
        <motion.div
          ref={cardRef}
          key={`card-${index}`}
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 200 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.y > 120) handleSkip();
          }}
          className={cn(
            'absolute left-0 right-0 bottom-0 pb-safe',
            'mx-auto max-w-md',
            'rounded-t-[28px] overflow-hidden',
            'bg-card/90 backdrop-blur-xl',
            'border-t border-x border-white/10',
            'shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.6)]'
          )}
          style={{ touchAction: 'pan-y' }}
        >
          {/* Drag handle */}
          <div
            className="flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => dragControls.start(e)}
          >
            <span className="w-10 h-1.5 rounded-full bg-muted-foreground/40" />
          </div>

          <div className="px-5 pt-2 pb-5">
            {/* Icon chip + title */}
            <div className="flex items-center gap-3 mb-3">
              <motion.div
                initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                className={cn(
                  'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
                  'bg-gradient-to-br shadow-lg',
                  step.accent
                )}
              >
                <Icon className="w-6 h-6 text-white" strokeWidth={2.4} />
              </motion.div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('tour.guide', 'KisanShakti Guide')}
                </div>
                <h2 className="text-lg font-bold text-foreground leading-tight truncate">
                  {t(`tour.${step.target || 'welcome'}.title`, step.titleFallback)}
                </h2>
              </div>
            </div>

            {/* Narration */}
            <p
              aria-live="polite"
              className="text-[15px] leading-relaxed text-foreground/85 mb-4 min-h-[3.5rem]"
            >
              {narration}
            </p>

            {/* Voice row */}
            <div className="flex items-center justify-between gap-3 mb-4 px-3 py-2.5 rounded-2xl bg-primary/8 border border-primary/15">
              <button
                onClick={handleSpeakAgain}
                className="flex items-center gap-2 text-sm font-semibold text-primary active:scale-95 transition"
              >
                <Volume2 className="w-4 h-4" />
                {t('tour.listen', 'Listen again')}
              </button>
              <div className="flex items-center gap-2">
                <SpeakingBars active={isSpeaking && !muted} />
                <button
                  onClick={handleToggleMute}
                  aria-label={muted ? 'Unmute narration' : 'Mute narration'}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-background/60 active:scale-90 transition"
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-primary" />
                  )}
                </button>
              </div>
            </div>

            {/* Nav buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={index === 0}
                className="h-14 px-4 rounded-2xl text-base font-semibold disabled:opacity-40"
                aria-label="Previous step"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <Button
                onClick={handleNext}
                className={cn(
                  'flex-1 h-14 rounded-2xl text-base font-bold gap-2',
                  'bg-gradient-to-r shadow-lg',
                  step.accent,
                  'text-white hover:opacity-95 active:scale-[0.98] transition'
                )}
              >
                {isLast ? (
                  <>
                    <Check className="w-5 h-5" />
                    {t('tour.done', "Let's Go")}
                  </>
                ) : (
                  <>
                    {t('common.next', 'Next')}
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
