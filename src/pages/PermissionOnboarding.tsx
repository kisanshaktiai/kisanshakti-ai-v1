/**
 * PermissionOnboarding - First-install permission flow (Android-style).
 * Sequentially asks for Location, Microphone, Camera, Notifications with
 * voice-narrated rationale in the user's selected language.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Mic, Camera, Bell, Volume2, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { PermissionManager, PermissionType } from '@/services/PermissionManager';
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'ks_permissions_onboarded';

type Slide = {
  key: PermissionType | 'notifications';
  icon: typeof MapPin;
  titleKey: string;
  titleFallback: string;
  bodyKey: string;
  bodyFallback: string;
  narrations: Record<string, string>;
};

const SLIDES: Slide[] = [
  {
    key: 'location',
    icon: MapPin,
    titleKey: 'perm.location.title',
    titleFallback: 'Allow Location',
    bodyKey: 'perm.location.body',
    bodyFallback:
      'We use your location to give accurate weather, mandi prices, and crop advice for your village.',
    narrations: {
      hi: 'कृपया स्थान की अनुमति दें ताकि हम आपके गाँव के लिए सही मौसम, मंडी भाव और फसल सलाह दे सकें।',
      mr: 'कृपया स्थान परवानगी द्या जेणेकरून आम्ही आपल्या गावासाठी अचूक हवामान, बाजारभाव आणि पीक सल्ला देऊ शकू।',
      en: 'Please allow location so we can give accurate weather, market prices and crop advice for your village.',
    },
  },
  {
    key: 'microphone',
    icon: Mic,
    titleKey: 'perm.mic.title',
    titleFallback: 'Allow Microphone',
    bodyKey: 'perm.mic.body',
    bodyFallback: 'Speak to the app in your own language to ask any farming question.',
    narrations: {
      hi: 'माइक की अनुमति दें ताकि आप अपनी भाषा में बोलकर कोई भी सवाल पूछ सकें।',
      mr: 'माइकची परवानगी द्या जेणेकरून आपण आपल्या भाषेत बोलून कोणताही प्रश्न विचारू शकाल।',
      en: 'Allow microphone so you can speak to the app in your own language.',
    },
  },
  {
    key: 'camera',
    icon: Camera,
    titleKey: 'perm.camera.title',
    titleFallback: 'Allow Camera',
    bodyKey: 'perm.camera.body',
    bodyFallback: 'Take a photo of your crop to identify pests, diseases and get instant advice.',
    narrations: {
      hi: 'कैमरा की अनुमति दें ताकि आप अपनी फसल की फोटो लेकर कीट और रोग की पहचान कर सकें।',
      mr: 'कॅमेरा परवानगी द्या जेणेकरून आपण पिकाचा फोटो काढून कीड व रोग ओळखू शकाल।',
      en: 'Allow camera so you can take a photo of your crop to identify pests and diseases.',
    },
  },
  {
    key: 'notifications',
    icon: Bell,
    titleKey: 'perm.notif.title',
    titleFallback: 'Allow Notifications',
    bodyKey: 'perm.notif.body',
    bodyFallback: 'Get timely alerts about rain, pest risk, and your crop schedule.',
    narrations: {
      hi: 'सूचनाओं की अनुमति दें ताकि बारिश, कीट और फसल समय की चेतावनी समय पर मिले।',
      mr: 'सूचनांची परवानगी द्या जेणेकरून पाऊस, कीड आणि पीक वेळेच्या सूचना वेळेवर मिळतील।',
      en: 'Allow notifications to get timely alerts about rain, pests and your crop schedule.',
    },
  },
];

export default function PermissionOnboarding() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const lang = (i18n.language || 'en').split('-')[0];
  const { speak, stop } = useTextToSpeech({ language: lang });

  const slide = SLIDES[index];
  const Icon = slide.icon;
  const narration = useMemo(
    () => slide.narrations[lang] || slide.narrations.en,
    [slide, lang]
  );

  // Auto-narrate each slide
  useEffect(() => {
    const id = setTimeout(() => {
      speak(narration).catch(() => null);
    }, 400);
    return () => {
      clearTimeout(id);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, narration]);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    navigate('/auth', { replace: true });
  };

  const next = () => {
    if (index < SLIDES.length - 1) setIndex(index + 1);
    else finish();
  };

  const handleAllow = async () => {
    setBusy(true);
    try {
      if (slide.key === 'notifications') {
        // Best-effort: Web Notification API; on native, Capacitor plugins would handle it.
        if (typeof window !== 'undefined' && 'Notification' in window) {
          try {
            await Notification.requestPermission();
          } catch {
            /* noop */
          }
        }
      } else {
        const res = await PermissionManager.requestPermission({
          type: slide.key as PermissionType,
          reason: slide.bodyFallback,
          feature: 'KisanShakti',
        });
        // PermissionManager returns a modal-config flow; trigger native ask directly.
        await res.onConfirm();
      }
    } catch (e) {
      console.warn('[PermissionOnboarding] request failed', e);
    } finally {
      setBusy(false);
      next();
    }
  };

  const handleSkip = () => {
    stop();
    next();
  };

  return (
    <div className="min-h-mobile-screen flex flex-col bg-background">
      {/* Progress */}
      <div className="pt-safe px-4 pt-6 flex items-center justify-center gap-2">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-8 bg-primary' : i < index ? 'w-4 bg-primary/60' : 'w-4 bg-muted'
            }`}
          />
        ))}
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.key}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center gap-6 max-w-sm"
          >
            <div className="w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="w-14 h-14 text-primary" />
            </div>

            <h1 className="text-2xl font-bold text-foreground">
              {t(slide.titleKey, slide.titleFallback)}
            </h1>

            <p className="text-base text-muted-foreground leading-relaxed">
              {narration}
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={() => speak(narration)}
              className="gap-2"
            >
              <Volume2 className="w-4 h-4" />
              {t('common.listen', 'Listen again')}
            </Button>
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="px-6 pb-safe pb-6 space-y-3">
        <Button
          onClick={handleAllow}
          disabled={busy}
          size="lg"
          className="w-full h-14 text-base font-semibold rounded-2xl"
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
              {t('common.requesting', 'Requesting…')}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Check className="w-5 h-5" />
              {t('perm.allow', 'Allow')}
            </span>
          )}
        </Button>
        <Button
          onClick={handleSkip}
          variant="ghost"
          size="lg"
          className="w-full h-12 text-muted-foreground"
        >
          {t('perm.skip', 'Not now')}
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
        <p className="text-[11px] text-center text-muted-foreground">
          {Capacitor.isNativePlatform()
            ? t('perm.nativeNote', 'You can change this any time in phone Settings.')
            : t('perm.webNote', 'You can change this any time in your browser settings.')}
        </p>
      </footer>
    </div>
  );
}
