/**
 * FeatureWalkthrough — 2030-ready compact "Mini-Coach" tour.
 *
 * Floating pill that auto-positions away from the highlighted element so the
 * spotlight target is always 100% visible. Lightweight: no aurora, no rotating
 * halos, single SVG mask, opaque card per project FPS rule.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2,
  VolumeX,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  CloudSun,
  CalendarDays,
  Leaf,
  MessageCircle,
  ScanLine,
  Store,
  Users,
  Mic,
  LayoutGrid,
  Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useFeatureWalkthrough } from '@/hooks/useFeatureWalkthrough';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { hapticFeedback } from '@/lib/haptics';
import { cn } from '@/lib/utils';

type Step = {
  target: string;
  Icon: typeof Sparkles;
  accent: string;
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
      hi: 'नमस्ते किसान भाई! आइए मैं आपको ऐप के सभी फीचर दिखाता हूँ। आगे बढ़ने के लिए अगला दबाएँ।',
      mr: 'नमस्कार शेतकरी मित्रा! मी तुम्हाला अॅपची सर्व वैशिष्ट्ये दाखवतो. पुढे जाण्यासाठी पुढे दाबा।',
      en: 'Hello farmer! Let me show you every feature of the app. Tap Next to continue.',
    },
  },
  {
    target: 'weather',
    Icon: CloudSun,
    accent: 'from-info to-primary',
    titleFallback: "Today's Weather",
    narrations: {
      hi: 'यहाँ आपके खेत के लिए आज का सटीक मौसम दिखेगा।',
      mr: 'इथे तुमच्या शेतासाठी आजचे अचूक हवामान दिसेल।',
      en: "Live weather forecast for your farm location.",
    },
  },
  {
    target: 'schedule',
    Icon: CalendarDays,
    accent: 'from-success to-primary',
    titleFallback: 'Crop Schedule',
    narrations: {
      hi: 'आज क्या काम करना है — सिंचाई, खाद, छिड़काव — सब AI से तय करके मिलेगा।',
      mr: 'आज काय करायचे — पाणी, खत, फवारणी — सर्व AI ठरवून देईल।',
      en: 'Your AI-generated daily tasks: irrigation, fertilizer, spraying.',
    },
  },
  {
    target: 'ndvi',
    Icon: Leaf,
    accent: 'from-success to-success',
    titleFallback: 'NDVI Crop Health',
    narrations: {
      hi: 'सैटेलाइट से आपकी फसल की सेहत प्रतिशत में देखें।',
      mr: 'उपग्रहावरून तुमच्या पिकाची आरोग्य टक्केवारी पहा।',
      en: 'Satellite-based crop health percentage for every field.',
    },
  },
  {
    target: 'chat',
    Icon: MessageCircle,
    accent: 'from-primary to-success',
    titleFallback: 'Ask AI',
    narrations: {
      hi: 'कोई भी खेती का सवाल यहाँ बोलकर या लिखकर पूछें।',
      mr: 'कोणताही शेतीचा प्रश्न इथे बोलून किंवा लिहून विचारा।',
      en: 'Ask any farming question by voice or text.',
    },
  },
  {
    target: 'scan',
    Icon: ScanLine,
    accent: 'from-warning to-warning',
    titleFallback: 'Scan Crop',
    narrations: {
      hi: 'फसल की फोटो लेकर कीट और रोग तुरंत पहचानें।',
      mr: 'पिकाचा फोटो काढून कीड व रोग लगेच ओळखा।',
      en: 'Photo-scan your crop to instantly identify pests and diseases.',
    },
  },
  {
    target: 'market',
    Icon: Store,
    accent: 'from-warning to-destructive',
    titleFallback: 'Market Prices',
    narrations: {
      hi: 'पास की मंडियों के आज के भाव यहाँ देखें।',
      mr: 'जवळच्या बाजारातील आजचे दर इथे पहा।',
      en: 'Live mandi prices from markets near you.',
    },
  },
  {
    target: 'community',
    Icon: Users,
    accent: 'from-primary to-primary',
    titleFallback: 'Community',
    narrations: {
      hi: 'अपने इलाके के किसानों से जुड़ें और अनुभव साझा करें।',
      mr: 'तुमच्या भागातील शेतकऱ्यांशी जोडा आणि अनुभव शेअर करा।',
      en: 'Connect with farmers nearby and share experiences.',
    },
  },
  {
    target: 'mic',
    Icon: Mic,
    accent: 'from-destructive to-primary',
    titleFallback: 'Voice Button',
    narrations: {
      hi: 'इस बटन को दबाकर रखें और अपनी भाषा में बोलें।',
      mr: 'हे बटण दाबून ठेवा आणि आपल्या भाषेत बोला।',
      en: 'Press and hold to speak in your own language.',
    },
  },
  {
    target: 'nav',
    Icon: LayoutGrid,
    accent: 'from-info to-primary',
    titleFallback: 'Bottom Menu',
    narrations: {
      hi: 'यहाँ से होम, मौसम, मंडी और अन्य पेज पर जाएँ।',
      mr: 'इथून मुख्यपान, हवामान, बाजार आणि इतर पानांवर जा।',
      en: 'Navigate Home, Weather, Market and more from here.',
    },
  },
];

/* ---------- Helpers ---------- */

const COACH_W = 300;
const COACH_H_EST = 180;
const GAP = 14;
const PAD = 8;

type Pos = { top: number; left: number; arrow: 'up' | 'down' | 'left' | 'right' | 'none' };

function computeCoachPos(rect: DOMRect | null, vw: number, vh: number): Pos {
  if (!rect) {
    return {
      top: vh / 2 - COACH_H_EST / 2,
      left: vw / 2 - COACH_W / 2,
      arrow: 'none',
    };
  }
  const clampLeft = (x: number) =>
    Math.max(12, Math.min(vw - COACH_W - 12, x));
  const centerLeft = clampLeft(rect.left + rect.width / 2 - COACH_W / 2);

  // Below
  if (vh - rect.bottom >= COACH_H_EST + GAP + 24) {
    return { top: rect.bottom + GAP, left: centerLeft, arrow: 'up' };
  }
  // Above
  if (rect.top >= COACH_H_EST + GAP + 24) {
    return { top: rect.top - COACH_H_EST - GAP, left: centerLeft, arrow: 'down' };
  }
  // Right
  if (vw - rect.right >= COACH_W + GAP + 16) {
    return {
      top: Math.max(12, Math.min(vh - COACH_H_EST - 12, rect.top + rect.height / 2 - COACH_H_EST / 2)),
      left: rect.right + GAP,
      arrow: 'left',
    };
  }
  // Left
  if (rect.left >= COACH_W + GAP + 16) {
    return {
      top: Math.max(12, Math.min(vh - COACH_H_EST - 12, rect.top + rect.height / 2 - COACH_H_EST / 2)),
      left: rect.left - COACH_W - GAP,
      arrow: 'right',
    };
  }
  // Fallback: bottom-center pinned to safe bottom
  return {
    top: vh - COACH_H_EST - 24,
    left: vw / 2 - COACH_W / 2,
    arrow: 'none',
  };
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1 flex-1">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex-1 h-1 rounded-full bg-white/15 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-accent"
            initial={false}
            animate={{ width: i < current ? '100%' : i === current ? '50%' : '0%' }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        </div>
      ))}
    </div>
  );
}

function SpeakingDots({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-0.5 rounded-full bg-primary"
          animate={active ? { height: ['25%', '100%', '40%', '85%', '30%'] } : { height: '25%' }}
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

/* ---------- Main ---------- */

export function FeatureWalkthrough() {
  const { shouldShow, finish } = useFeatureWalkthrough();
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const lang = (i18n.language || 'en').split('-')[0];
  const { speak, stop, isSpeaking } = useTextToSpeech({ language: lang });
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });

  const step = STEPS[index];
  const narration = useMemo(
    () => step.narrations[lang] || step.narrations.en,
    [step, lang]
  );

  /* Track viewport */
  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  /* Track target element */
  useLayoutEffect(() => {
    if (!shouldShow) return;

    const measure = () => {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };

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

    // Burst RAF for first 600ms to track scroll/layout settling
    let raf: number;
    const t0 = performance.now();
    const burst = () => {
      measure();
      if (performance.now() - t0 < 600) raf = requestAnimationFrame(burst);
    };
    raf = requestAnimationFrame(burst);

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
    }, 350);
    return () => {
      clearTimeout(id);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow, index, muted, narration]);

  /* Keyboard */
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

  const pos = computeCoachPos(rect, vp.w, vp.h);
  const hasTarget = !!rect;
  const Icon = step.Icon;
  const isLast = index === STEPS.length - 1;
  const radius = 16;

  // Title from i18n with fallback
  const title = t(`tour.steps.${step.target || 'welcome'}.title`, step.titleFallback);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="tour"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[9999]"
        aria-modal="true"
        role="dialog"
        aria-label="App walkthrough"
      >
        {/* Spotlight mask — pointer-events-none so users can still tap nothing */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          <defs>
            <mask id="tour-mask-mini">
              <rect width="100%" height="100%" fill="white" />
              {hasTarget && (
                <rect
                  x={Math.max(0, rect!.left - PAD)}
                  y={Math.max(0, rect!.top - PAD)}
                  width={rect!.width + PAD * 2}
                  height={rect!.height + PAD * 2}
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
            fill="rgba(2, 6, 23, 0.72)"
            mask="url(#tour-mask-mini)"
          />
        </svg>

        {/* Spotlight ring + soft pulse */}
        {hasTarget && (
          <>
            <motion.div
              className="absolute rounded-2xl pointer-events-none ring-2 ring-primary"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              style={{
                left: rect!.left - PAD,
                top: rect!.top - PAD,
                width: rect!.width + PAD * 2,
                height: rect!.height + PAD * 2,
              }}
            />
            {!reduce && (
              <motion.div
                className="absolute rounded-2xl pointer-events-none"
                style={{
                  left: rect!.left - PAD - 4,
                  top: rect!.top - PAD - 4,
                  width: rect!.width + PAD * 2 + 8,
                  height: rect!.height + PAD * 2 + 8,
                  boxShadow:
                    '0 0 0 1px hsl(var(--primary) / 0.4), 0 0 32px hsl(var(--primary) / 0.35)',
                }}
                animate={{ opacity: [0.55, 1, 0.55] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </>
        )}

        {/* Top progress bar + skip */}
        <div className="absolute top-0 left-0 right-0 pt-safe pointer-events-none">
          <div className="flex items-center gap-2 px-3 pt-3 pointer-events-auto">
            <span className="text-[10px] font-bold tracking-wider text-white/80 shrink-0">
              {index + 1}/{STEPS.length}
            </span>
            <ProgressBar current={index} total={STEPS.length} />
            <button
              onClick={handleSkip}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white text-[11px] font-medium active:scale-95 transition"
              aria-label="Skip tour"
            >
              {t('tour.skip', 'Skip')}
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Mini-Coach pill */}
        <motion.div
          key={`coach-${index}`}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          className={cn(
            'absolute pointer-events-auto rounded-2xl overflow-hidden',
            'bg-card border border-primary/25',
            'shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)]'
          )}
          style={{
            top: pos.top,
            left: pos.left,
            width: COACH_W,
          }}
        >
          {/* Accent strip */}
          <div className={cn('h-1 w-full bg-gradient-to-r', step.accent)} />

          <div className="p-3.5">
            {/* Header: icon + title + mute */}
            <div className="flex items-center gap-2.5 mb-2">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm',
                  'bg-gradient-to-br',
                  step.accent
                )}
              >
                <Icon className="w-5 h-5 text-white" strokeWidth={2.4} />
              </motion.div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
                  {t('tour.guide', 'KisanShakti Guide')}
                </div>
                <div className="text-[15px] font-bold text-foreground leading-tight truncate">
                  {title}
                </div>
              </div>
              <button
                onClick={handleToggleMute}
                className="shrink-0 w-8 h-8 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center active:scale-90 transition"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? (
                  <VolumeX className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Volume2 className="w-4 h-4 text-primary" />
                )}
              </button>
            </div>

            {/* Narration text */}
            <p
              className="text-[13px] leading-snug text-foreground/90 mb-3"
              aria-live="polite"
            >
              {narration}
            </p>

            {/* Inline controls row */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSpeakAgain}
                className="flex items-center gap-1.5 px-2.5 h-9 rounded-full bg-primary/10 hover:bg-primary/15 text-primary text-[11px] font-semibold active:scale-95 transition"
                aria-label="Listen again"
              >
                <SpeakingDots active={isSpeaking} />
                <span>{t('tour.listen', 'Listen')}</span>
              </button>

              <div className="flex-1" />

              <button
                onClick={handleBack}
                disabled={index === 0}
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition',
                  index === 0
                    ? 'bg-muted/40 text-muted-foreground/40'
                    : 'bg-muted text-foreground hover:bg-muted/70'
                )}
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                onClick={handleNext}
                className={cn(
                  'h-9 px-4 rounded-full flex items-center gap-1 text-white text-[13px] font-semibold active:scale-95 transition',
                  'bg-gradient-to-r shadow-md',
                  step.accent
                )}
                aria-label={isLast ? 'Finish tour' : 'Next step'}
              >
                {isLast ? (
                  <>
                    <Check className="w-4 h-4" />
                    {t('tour.done', 'Done')}
                  </>
                ) : (
                  <>
                    {t('tour.next', 'Next')}
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

export default FeatureWalkthrough;
