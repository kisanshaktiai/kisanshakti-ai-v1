/**
 * PermissionOnboarding - Single-page permission center.
 * Shows Location, Microphone, Camera as toggles. Each toggle triggers the
 * native OS permission prompt (via Capacitor on device, Web APIs in browser),
 * persists the granted/denied state to Capacitor Preferences + localStorage,
 * and offers a "Open Settings" path when a permission is blocked.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Mic, Camera, Volume2, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Camera as CapCamera } from '@capacitor/camera';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Preferences } from '@capacitor/preferences';
import { App as CapApp } from '@capacitor/app';
import { toast } from '@/hooks/use-toast';

const STORAGE_KEY = 'ks_permissions_onboarded';
const PREF_KEY = 'ks_permissions_state';

type PermKey = 'location' | 'microphone' | 'camera';
type PermState = 'granted' | 'denied' | 'prompt' | 'blocked';

interface PermItem {
  key: PermKey;
  icon: typeof MapPin;
  titleKey: string;
  titleFallback: string;
  bodyKey: string;
  bodyFallback: string;
  narrations: Record<string, string>;
}

const ITEMS: PermItem[] = [
  {
    key: 'location',
    icon: MapPin,
    titleKey: 'perm.location.title',
    titleFallback: 'Location',
    bodyKey: 'perm.location.body',
    bodyFallback: 'For accurate weather, mandi prices and village-level advice.',
    narrations: {
      hi: 'स्थान की अनुमति दें ताकि सही मौसम, मंडी भाव और फसल सलाह मिल सके।',
      mr: 'स्थान परवानगी द्या जेणेकरून अचूक हवामान, बाजारभाव आणि पीक सल्ला मिळेल।',
      en: 'Allow location for accurate weather, market prices and village advice.',
    },
  },
  {
    key: 'microphone',
    icon: Mic,
    titleKey: 'perm.mic.title',
    titleFallback: 'Microphone',
    bodyKey: 'perm.mic.body',
    bodyFallback: 'Talk to the app in your own language to ask farming questions.',
    narrations: {
      hi: 'माइक की अनुमति दें ताकि आप अपनी भाषा में सवाल पूछ सकें।',
      mr: 'माइकची परवानगी द्या जेणेकरून आपण आपल्या भाषेत प्रश्न विचारू शकाल।',
      en: 'Allow microphone so you can speak to the app in your own language.',
    },
  },
  {
    key: 'camera',
    icon: Camera,
    titleKey: 'perm.camera.title',
    titleFallback: 'Camera',
    bodyKey: 'perm.camera.body',
    bodyFallback: 'Snap a crop photo to detect pests and diseases instantly.',
    narrations: {
      hi: 'कैमरा की अनुमति दें ताकि फसल की फोटो लेकर कीट-रोग पहचान सकें।',
      mr: 'कॅमेरा परवानगी द्या जेणेकरून पिकाचा फोटो काढून कीड-रोग ओळखता येतील।',
      en: 'Allow camera to photograph crops and detect pests and diseases.',
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Persistence (Capacitor Preferences on native, localStorage everywhere)
// ────────────────────────────────────────────────────────────────────────────
async function loadStored(): Promise<Partial<Record<PermKey, PermState>>> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: PREF_KEY });
      if (value) return JSON.parse(value);
    }
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function persist(state: Partial<Record<PermKey, PermState>>) {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(PREF_KEY, json);
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key: PREF_KEY, value: json });
    }
  } catch {
    /* noop */
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Native + Web permission flows
// ────────────────────────────────────────────────────────────────────────────
const mapCapState = (s: string | undefined): PermState => {
  if (s === 'granted') return 'granted';
  if (s === 'denied') return 'blocked';
  if (s === 'prompt-with-rationale') return 'prompt';
  return 'prompt';
};

async function checkPermission(key: PermKey): Promise<PermState> {
  try {
    if (Capacitor.isNativePlatform()) {
      if (key === 'location') {
        const r = await Geolocation.checkPermissions();
        return mapCapState(r.location);
      }
      if (key === 'camera') {
        const r = await CapCamera.checkPermissions();
        return mapCapState(r.camera);
      }
      if (key === 'microphone') {
        const r = await SpeechRecognition.checkPermissions();
        return mapCapState((r as any).speechRecognition);
      }
    }
    // Web
    if (key === 'location' && 'permissions' in navigator) {
      const r = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return r.state as PermState;
    }
    if ((key === 'camera' || key === 'microphone') && 'permissions' in navigator) {
      try {
        const name = key === 'camera' ? 'camera' : 'microphone';
        const r = await navigator.permissions.query({ name: name as PermissionName });
        return r.state as PermState;
      } catch { /* unsupported */ }
    }
  } catch { /* noop */ }
  return 'prompt';
}

async function requestPermission(key: PermKey): Promise<PermState> {
  try {
    if (Capacitor.isNativePlatform()) {
      if (key === 'location') {
        const r = await Geolocation.requestPermissions({ permissions: ['location'] });
        return mapCapState(r.location);
      }
      if (key === 'camera') {
        const r = await CapCamera.requestPermissions({ permissions: ['camera'] });
        return mapCapState(r.camera);
      }
      if (key === 'microphone') {
        const r = await SpeechRecognition.requestPermissions();
        return mapCapState((r as any).speechRecognition);
      }
    }
    // Web fallbacks
    if (key === 'location') {
      return await new Promise<PermState>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve('granted'),
          (e) => resolve(e.code === 1 ? 'blocked' : 'denied'),
          { timeout: 10000 }
        );
      });
    }
    if (key === 'camera') {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
      return 'granted';
    }
    if (key === 'microphone') {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      return 'granted';
    }
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') return 'blocked';
    return 'denied';
  }
  return 'denied';
}

async function openNativeSettings() {
  if (Capacitor.isNativePlatform()) {
    try {
      const url = Capacitor.getPlatform() === 'ios' ? 'app-settings:' : 'package:';
      // openUrl is available at runtime on @capacitor/app; types may lag
      await (CapApp as any).openUrl?.({ url });
      return;
    } catch { /* noop */ }
  }
  toast({
    title: 'Open phone Settings',
    description: 'Open your phone Settings → Apps → KisanShakti → Permissions.',
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────
export default function PermissionOnboarding() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || 'en').split('-')[0];
  const { speak, stop } = useTextToSpeech({ language: lang });

  const [states, setStates] = useState<Record<PermKey, PermState>>({
    location: 'prompt',
    microphone: 'prompt',
    camera: 'prompt',
  });
  const [busy, setBusy] = useState<PermKey | null>(null);

  // Initial load: merge live OS state with stored state
  useEffect(() => {
    (async () => {
      const stored = await loadStored();
      const live = await Promise.all(ITEMS.map((i) => checkPermission(i.key)));
      const next: Record<PermKey, PermState> = {
        location: live[0] || stored.location || 'prompt',
        microphone: live[1] || stored.microphone || 'prompt',
        camera: live[2] || stored.camera || 'prompt',
      };
      setStates(next);
      persist(next);
    })();
  }, []);

  const handleToggle = useCallback(
    async (item: PermItem) => {
      const current = states[item.key];
      setBusy(item.key);

      // If blocked at OS level, route to settings
      if (current === 'blocked') {
        await openNativeSettings();
        setBusy(null);
        return;
      }

      // If granted, nothing to revoke from inside the app — guide to settings
      if (current === 'granted') {
        toast({
          title: t('perm.alreadyOn', 'Already enabled'),
          description: t(
            'perm.revokeHint',
            'To turn this off, use your phone Settings → Apps → KisanShakti.'
          ),
        });
        setBusy(null);
        return;
      }

      const next = await requestPermission(item.key);
      const updated = { ...states, [item.key]: next };
      setStates(updated);
      await persist(updated);

      if (next === 'granted') {
        toast({
          title: t('perm.granted', 'Permission granted'),
          description: t(item.titleKey, item.titleFallback),
        });
      } else if (next === 'blocked') {
        toast({
          title: t('perm.blocked', 'Permission blocked'),
          description: t('perm.openSettingsHint', 'Open phone Settings to enable it.'),
          variant: 'destructive',
        });
      }
      setBusy(null);
    },
    [states, t]
  );

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    stop();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-mobile-screen flex flex-col bg-background">
      <header className="pt-safe px-6 pt-8 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {t('perm.center.title', 'App Permissions')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('perm.center.subtitle', 'Turn on what you need. Change any time in Settings.')}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-2 space-y-3">
        {ITEMS.map((item, idx) => {
          const Icon = item.icon;
          const state = states[item.key];
          const isOn = state === 'granted';
          const isBlocked = state === 'blocked';
          const narration = item.narrations[lang] || item.narrations.en;

          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isOn ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="w-6 h-6" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold text-foreground">
                      {t(item.titleKey, item.titleFallback)}
                    </h2>
                    <Switch
                      checked={isOn}
                      disabled={busy === item.key}
                      onCheckedChange={() => handleToggle(item)}
                      aria-label={t(item.titleKey, item.titleFallback)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 leading-snug">
                    {t(item.bodyKey, item.bodyFallback)}
                  </p>

                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => speak(narration)}
                      className="h-7 px-2 text-xs gap-1"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      {t('common.listen', 'Listen')}
                    </Button>

                    {isBlocked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={openNativeSettings}
                        className="h-7 px-2 text-xs gap-1 text-destructive"
                      >
                        <SettingsIcon className="w-3.5 h-3.5" />
                        {t('perm.openSettings', 'Open Settings')}
                      </Button>
                    )}

                    <span
                      className={`ml-auto text-[11px] px-2 py-0.5 rounded-full ${
                        isOn
                          ? 'bg-primary/10 text-primary'
                          : isBlocked
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isOn
                        ? t('perm.status.on', 'On')
                        : isBlocked
                          ? t('perm.status.blocked', 'Blocked')
                          : t('perm.status.off', 'Off')}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}

        <p className="text-[11px] text-center text-muted-foreground pt-2">
          {Capacitor.isNativePlatform()
            ? t('perm.nativeNote', 'You can change this any time in phone Settings.')
            : t('perm.webNote', 'You can change this any time in your browser settings.')}
        </p>
      </main>

      <footer className="px-6 pb-safe pb-6 pt-2">
        <Button
          onClick={finish}
          size="lg"
          className="w-full h-14 text-base font-semibold rounded-2xl"
        >
          {t('perm.continue', 'Continue')}
        </Button>
      </footer>
    </div>
  );
}
