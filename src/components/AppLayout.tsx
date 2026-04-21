import { Outlet, useLocation } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { HindenburgMenu } from './HindenburgMenu';
import { useEffect, useState } from 'react';
import { useProactiveAlerts } from '@/hooks/useProactiveAlerts';
import { ModernVoiceProvider } from '@/contexts/ModernVoiceContext';
import { ModernVoiceAssistant } from '@/components/voice';
import { VoiceIndicator } from '@/components/VoiceIndicator';
import { NativeVoiceButton } from '@/components/voice/NativeVoiceButton';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { SubscriptionStatusBanner } from '@/components/subscription/SubscriptionStatusBanner';
import { SubscriptionHeaderChip } from '@/components/subscription/SubscriptionHeaderChip';
import { BrandBlock } from '@/components/header/BrandBlock';
import { HeaderActionsSheet } from '@/components/header/HeaderActionsSheet';

export function AppLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  // Global real-time alert listener — fires toasts + WhatsApp nudges on ALL pages
  useProactiveAlerts();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  const isAIChat = location.pathname === '/app/chat';
  const isCommunityChat =
    location.pathname.includes('/app/community/') && location.pathname.includes('/chat');

  return (
    <ModernVoiceProvider>
      <SubscriptionProvider>
        <div className="flex flex-col h-mobile-screen bg-background">
          {/* 2030-ready compact glass header */}
          {!isAIChat && !isCommunityChat && (
            <header className="glass-header fixed top-0 left-0 right-0 h-14 z-40 flex items-center gap-2 px-3 pt-safe">
              <BrandBlock />
              <div className="flex items-center gap-2 shrink-0">
                <SubscriptionHeaderChip />
                <HeaderActionsSheet />
              </div>
            </header>
          )}

          {/* Subscription Status Banner — only renders when warning state */}
          {!isAIChat && !isCommunityChat && (
            <div className="fixed top-14 left-0 right-0 z-30">
              <SubscriptionStatusBanner />
            </div>
          )}

          {/* Main Content - Adjust padding based on route */}
          <main className={
            isAIChat || isCommunityChat 
              ? "" 
              : "pt-14 pb-nav-safe mobile-scroll-container"
          }>
            <Outlet />
          </main>

          {/* Voice Assistant */}
          <ModernVoiceAssistant />
          <VoiceIndicator />
          
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
            hideNav={isAIChat || isCommunityChat}
            hideAction={false}
          />
          
          {/* Hindenburg Menu */}
          <HindenburgMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
        </div>
      </SubscriptionProvider>
    </ModernVoiceProvider>
  );
}