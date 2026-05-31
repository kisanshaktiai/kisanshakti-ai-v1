import { Outlet, useLocation } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { HindenburgMenu } from './HindenburgMenu';
import { useEffect, useRef, useState } from 'react';
import { useProactiveAlerts } from '@/hooks/useProactiveAlerts';
import { ModernVoiceProvider } from '@/contexts/ModernVoiceContext';
import { ModernVoiceAssistant } from '@/components/voice';
import { VoiceIndicator } from '@/components/VoiceIndicator';
import { NativeVoiceButton } from '@/components/voice/NativeVoiceButton';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { SubscriptionStatusBanner } from '@/components/subscription/SubscriptionStatusBanner';
import { AppBootGate } from '@/components/subscription/AppBootGate';
import { FeatureRouteGate } from '@/components/subscription/FeatureRouteGate';
import { TenantThemeRealtimeSync } from '@/components/tenant/TenantThemeRealtimeSync';

import { BrandBlock } from '@/components/header/BrandBlock';
import { StatusPill } from '@/components/header/StatusPill';
import { SpeakPageButton } from '@/components/header/SpeakPageButton';
import { LanguageSelector } from '@/components/LanguageSelector';
import { ScrollContext } from './layout/ScrollContext';
import { FeatureWalkthrough } from '@/components/onboarding/FeatureWalkthrough';

export function AppLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Global real-time alert listener — fires toasts + WhatsApp nudges on ALL pages
  useProactiveAlerts();

  // Scroll the actual scroll container (not window) to top on route change.
  // The single source of truth for app scrolling is <main>.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  const isAIChat = location.pathname === '/app/chat';
  const isCommunityChat =
    location.pathname.includes('/app/community/') && location.pathname.includes('/chat');
  // Add Land / Edit Land map drawer needs full viewport (no header, no bottom nav)
  const isLandMapRoute =
    location.pathname === '/app/lands/add' ||
    /^\/app\/lands\/[^/]+\/edit$/.test(location.pathname);

  const isFullScreenRoute = isAIChat || isCommunityChat || isLandMapRoute;

  return (
    <ModernVoiceProvider>
      <SubscriptionProvider>
        <ScrollContext.Provider value={mainRef}>
          <div className="flex flex-col h-mobile-screen bg-background">
            {/* 2030-ready compact glass header — 56px tall, single StatusPill */}
            {!isFullScreenRoute && (
              <header className="glass-header fixed top-0 left-0 right-0 h-14 z-40 flex items-center gap-1.5 px-3 pt-safe">
                <BrandBlock />
                <div className="flex items-center gap-1.5 shrink-0">
                  <SpeakPageButton />
                  <LanguageSelector />
                  <StatusPill />
                </div>
              </header>
            )}

            {/* Subscription Status Banner — only renders when warning state.
                Publishes its measured height to --banner-h so <main> offsets precisely. */}
            {!isFullScreenRoute && (
              <div className="fixed top-14 left-0 right-0 z-30">
                <SubscriptionStatusBanner />
              </div>
            )}

            {/* Main Content - the SINGLE scroll container for the entire app.
                Pages must NOT add their own scrollers. Use <PageShell>.
                Top padding = header (56px) + dynamic banner height var. */}
            <main
              ref={mainRef}
              className={
                isFullScreenRoute
                  ? 'flex-1 min-h-0'
                  : 'pb-nav-safe mobile-scroll-container'
              }
              style={
                isFullScreenRoute
                  ? undefined
                  : { paddingTop: 'calc(3.5rem + var(--banner-h, 0px))' }
              }
            >
              <AppBootGate>
                <FeatureRouteGate>
                  <TenantThemeRealtimeSync />
                  <Outlet />
                </FeatureRouteGate>

              </AppBootGate>
            </main>

            {/* Voice Assistant */}
            <ModernVoiceAssistant />
            <VoiceIndicator />

            {/* Native Voice Navigation Button - Floating (hidden on full-screen routes) */}
            {!isFullScreenRoute && (
              <NativeVoiceButton
                className="bottom-24 right-4"
                size="md"
                showTranscript={true}
                showExamples={true}
              />
            )}

            {/* Bottom Navigation - Hidden on full-screen routes */}
            <BottomNavigation
              onMenuOpen={() => setIsMenuOpen(true)}
              hideNav={isFullScreenRoute}
              hideAction={false}
            />

            {/* Hindenburg Menu */}
            <HindenburgMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

            {/* First-run voice-narrated walkthrough — shows once per install */}
            <FeatureWalkthrough />
          </div>
        </ScrollContext.Provider>
      </SubscriptionProvider>
    </ModernVoiceProvider>
  );
}
