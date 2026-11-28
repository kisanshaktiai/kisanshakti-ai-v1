import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sprout, SunMedium, Layers, LayoutGrid, Mic, Camera, Keyboard, Navigation } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useModernVoice } from '@/contexts/ModernVoiceContext';
import { useFeatures } from '@/hooks/useFeatures';
import './living.css';

// The photo flow carries the camera and QR code; it is fetched the first time the farmer opens it, not with the app shell.
const InstaScanFlow = lazy(() => import('@/components/InstaScan/InstaScanFlow').then((m) => ({ default: m.InstaScanFlow })));

interface DockItem { path: string; icon: LucideIcon; labelKey: string; tour?: string; match: (pathname: string) => boolean }

const ITEMS: DockItem[] = [
  { path: '/app', icon: Sprout, labelKey: 'living.dock.field', match: (p) => p === '/app' || p === '/app/' || p === '/app/home' },
  { path: '/app/day', icon: SunMedium, labelKey: 'living.dock.day', tour: 'schedule', match: (p) => p.startsWith('/app/day') || p.startsWith('/app/schedule') },
  { path: '/app/land', icon: Layers, labelKey: 'living.dock.land', tour: 'ndvi', match: (p) => p.startsWith('/app/land') },
  { path: '/app/all', icon: LayoutGrid, labelKey: 'living.dock.all', tour: 'market community', match: (p) => p.startsWith('/app/all') },
];

/**
 * Bottom dock for the farmer shell: Field, Day, the voice button, Land, All.
 * The voice button opens one sheet with the three ways to ask that the app
 * already has: voice mode, photo scan and the chat page.
 */
export function LivingDock({ hidden = false }: { hidden?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { showVoiceMode, hideVoiceMode, isVoiceModeActive } = useModernVoice();
  const { features } = useFeatures();
  const [askOpen, setAskOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  // Stays true after the first open so the flow keeps its own closing behaviour.
  const [scanLoaded, setScanLoaded] = useState(false);
  useEffect(() => { if (scanOpen) setScanLoaded(true); }, [scanOpen]);

  useEffect(() => { setAskOpen(false); }, [pathname]);

  if (hidden) return null;

  // Same plan rule as the feature list: a locked or disabled destination opens the subscription page.
  const go = (path: string) => {
    // Day shows schedule work and Land shows a land, so they follow those features' locks.
    const feature = features.find((f) => f.path === (path === '/app/day' ? '/app/schedule' : path === '/app/land' ? '/app/lands' : path));
    navigate(feature && (feature.locked || !feature.enabled) ? '/app/subscription' : path);
  };

  const item = (it: DockItem) => {
    const Icon = it.icon;
    const active = it.match(pathname);
    return (
      <button key={it.path} type="button" className="lf-dock-item" data-tour={it.tour} aria-current={active ? 'page' : undefined} onClick={() => go(it.path)}>
        <Icon size={24} aria-hidden />
        <span>{t(it.labelKey)}</span>
      </button>
    );
  };

  const voiceNav = askOpen && typeof document !== 'undefined' && !!document.querySelector('[data-voice-nav]');
  const ways: Array<{ key: string; icon: LucideIcon; primary?: boolean; run: () => void }> = [
    { key: 'photo', icon: Camera, run: () => { setAskOpen(false); setScanOpen(true); } },
    { key: 'speak', icon: Mic, primary: true, run: () => { setAskOpen(false); if (isVoiceModeActive) hideVoiceMode(); else showVoiceMode(); } },
    { key: 'type', icon: Keyboard, run: () => { setAskOpen(false); go('/app/chat'); } },
    // Voice navigation ("show my lands"): starts the app's existing voice-navigation button. Offered only where that button exists.
    ...(voiceNav ? [{ key: 'go', icon: Navigation, run: () => { setAskOpen(false); window.dispatchEvent(new Event('voice-navigation:start')); } }] : []),
  ];

  return (
    <>
      <nav className="lf-dock" data-tour="nav" aria-label={t('living.dock.label')}>
        <div className="lf-dock-bar">
          {item(ITEMS[0])}
          {item(ITEMS[1])}
          <div className="lf-orb-wrap">
            <button type="button" className="lf-orb" data-tour="chat scan mic" aria-label={t('living.dock.ask')} aria-haspopup="dialog" onClick={() => setAskOpen(true)}>
              <Mic size={30} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
          {item(ITEMS[2])}
          {item(ITEMS[3])}
        </div>
      </nav>

      <Drawer open={askOpen} onOpenChange={setAskOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="lf-head text-center">{t('living.ask.title')}</DrawerTitle>
          </DrawerHeader>
          <div className="flex items-end justify-around gap-1 px-3 pt-2" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
            {ways.map(({ key, icon: Icon, primary, run }) => (
              <button key={key} type="button" onClick={run} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span
                  className={primary ? 'grid place-items-center rounded-full bg-primary text-primary-foreground shadow-lg' : 'grid place-items-center rounded-full bg-primary/10 text-primary'}
                  style={{ width: primary ? 'calc(var(--lf-orb) + 14px)' : 'calc(var(--lf-tap) + 6px)', height: primary ? 'calc(var(--lf-orb) + 14px)' : 'calc(var(--lf-tap) + 6px)' }}
                >
                  <Icon size={primary ? 36 : 26} aria-hidden />
                </span>
                <span className={`${primary ? 'lf-lab text-primary' : 'lf-cap'} max-w-full text-center leading-tight`} style={{ overflowWrap: 'anywhere' }}>{t(`living.ask.${key}`)}</span>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      {scanLoaded && (
        <Suspense fallback={null}>
          <InstaScanFlow isOpen={scanOpen} onClose={() => setScanOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
