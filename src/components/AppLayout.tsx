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
import { SubscriptionHeaderChip } from '@/components/subscription/SubscriptionHeaderChip';
import { BrandBlock } from '@/components/header/BrandBlock';
import { HeaderStatusDot } from '@/components/header/HeaderStatusDot';
import { UnifiedSyncButton } from '@/components/header/UnifiedSyncButton';
import { LanguageSelector } from '@/components/LanguageSelector';
import { ScrollContext } from './layout/ScrollContext';
import { ScrollToTopFab } from './layout/ScrollToTopFab';

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

  const isFullScreenRoute = isAIChat || isCommunityChat;

  return (
    <ModernVoiceProvider>
      <SubscriptionProvider>
        <ScrollContext.Provider value={mainRef}>
          <div className="flex flex-col h-mobile-screen bg-background">
            {/* 2030-ready compact glass header */}
            {!isFullScreenRoute && (
              <header className="glass-header fixed top-0 left-0 right-0 h-14 z-40 flex items-center gap-1.5 px-3 pt-safe">
                <BrandBlock />
                <div className="flex items-center gap-1.5 shrink-0">
                  <SubscriptionHeaderChip />
                  <HeaderStatusDot />
                  <UnifiedSyncButton />
                  <LanguageSelector />
                </div>
              </header>
            )}

            {/* Subscription Status Banner — only renders when warning state */}
            {!isFullScreenRoute && (
              <div className="fixed top-14 left-0 right-0 z-30">
                <SubscriptionStatusBanner />
              </div>
            )}

            {/* Main Content - the SINGLE scroll container for the entire app.
                Pages must NOT add their own scrollers. Use <PageShell>. */}
            <main
              ref={mainRef}
              className={
                isFullScreenRoute
                  ? 'flex-1 min-h-0'
                  : 'pt-14 pb-nav-safe mobile-scroll-container scroll-pt-14'
              }
            >
              <Outlet />
            </main>

            {/* Voice Assistant */}
            <ModernVoiceAssistant />
            <VoiceIndicator />

            {/* Floating actions */}
            {!isFullScreenRoute && <ScrollToTopFab />}

            {/* Native Voice Navigation Button - Floating */}
            <NativeVoiceButton
              className="bottom-24 right-4"
              size="md"
              showTranscript={true}
              showExamples={true}
            />

            {/* Bottom Navigation - Hidden on full-screen routes */}
            <BottomNavigation
              onMenuOpen={() => setIsMenuOpen(true)}
              hideNav={isFullScreenRoute}
              hideAction={false}
            />

            {/* Hindenburg Menu */}
            <HindenburgMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
          </div>
        </ScrollContext.Provider>
      </SubscriptionProvider>
    </ModernVoiceProvider>
  );
}
