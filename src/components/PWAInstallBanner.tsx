/**
 * PWAInstallBanner - PHASE 2 FIX: Production-ready PWA install banner
 * 
 * CRITICAL FIXES IMPLEMENTED:
 * ✅ Single component (removed PWAInstallPrompt duplicate)
 * ✅ Captures prompt from global window.__capturedPwaPrompt
 * ✅ Install button calls prompt() in IMMEDIATE user gesture handler
 * ✅ Proper z-index layering (z-[70] above modals at z-50)
 * ✅ Smart engagement detection before showing
 * ✅ Graduated cooldown on dismissal
 * ✅ Handles iOS manual instructions
 * ✅ Analytics tracking
 * 
 * ROOT CAUSE FIXES:
 * - Previous: Multiple components competing for same prompt
 * - Previous: prompt() called in async context losing user gesture
 * - Previous: Duplicate beforeinstallprompt handlers
 * - NOW: Single source of truth, immediate gesture handling, proper layering
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share, Plus, Smartphone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type Platform = 'ios' | 'android' | 'desktop' | null;
type AnalyticsEvent = 'install_shown' | 'install_prompted' | 'install_accepted' | 'install_dismissed' | 'appinstalled';

const DISMISS_COOLDOWN_DAYS = [1, 3, 7, 30]; // Graduated cooldown
const ENGAGEMENT_THRESHOLD_MS = 30000; // 30s idle before showing
const STORAGE_KEY_DISMISSED = 'pwa_install_dismissed_at';
const STORAGE_KEY_DISMISS_COUNT = 'pwa_install_dismiss_count';

export const PWAInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [platform, setPlatform] = useState<Platform>(null);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [userEngaged, setUserEngaged] = useState(false);

  const engagementTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasTrackedShow = useRef(false);

  // Analytics helper
  const trackEvent = useCallback((event: AnalyticsEvent, data?: Record<string, any>) => {
    console.log(`📊 [PWA Analytics] ${event}`, data);
    
    // Google Analytics 4
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', event, {
        event_category: 'pwa',
        ...data
      });
    }
  }, []);

  // Check if already installed
  const checkStandalone = useCallback(() => {
    const standalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone ||
      document.referrer.includes('android-app://');
    
    setIsStandalone(standalone);
    
    if (standalone) {
      console.log('✅ [PWA] App already installed (standalone mode)');
    }
    
    return standalone;
  }, []);

  // Detect platform
  const detectPlatform = useCallback((): Platform => {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
    
    if (isIOS && isSafari) {
      console.log('📱 [PWA] Platform: iOS Safari (manual instructions)');
      return 'ios';
    }
    if (isAndroid) {
      console.log('📱 [PWA] Platform: Android (native prompt)');
      return 'android';
    }
    if (!isIOS && !isAndroid) {
      console.log('💻 [PWA] Platform: Desktop (native prompt)');
      return 'desktop';
    }
    return null;
  }, []);

  // Check dismiss cooldown
  const canShow = useCallback((): boolean => {
    const dismissedAt = localStorage.getItem(STORAGE_KEY_DISMISSED);
    if (!dismissedAt) return true;

    const dismissCount = parseInt(localStorage.getItem(STORAGE_KEY_DISMISS_COUNT) || '0');
    const cooldownIndex = Math.min(dismissCount, DISMISS_COOLDOWN_DAYS.length - 1);
    const cooldownDays = DISMISS_COOLDOWN_DAYS[cooldownIndex];

    const daysSinceDismiss = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
    
    if (daysSinceDismiss < cooldownDays) {
      console.log(`⏸️ [PWA] Cooldown active: ${cooldownDays} days (dismissed ${dismissCount} times)`);
      return false;
    }

    return true;
  }, []);

  // User engagement detection
  useEffect(() => {
    if (isStandalone || !canShow()) return;

    const handleEngagement = () => {
      if (userEngaged) return;
      console.log('👆 [PWA] User engaged (scroll/click/touch)');
      setUserEngaged(true);
    };

    // Detect engagement signals
    const events = ['scroll', 'click', 'touchstart', 'keydown'];
    events.forEach(event => {
      window.addEventListener(event, handleEngagement, { once: true, passive: true });
    });

    // Fallback: consider engaged after 30s
    engagementTimerRef.current = setTimeout(() => {
      console.log('⏰ [PWA] Engagement timeout - considering user engaged');
      setUserEngaged(true);
    }, ENGAGEMENT_THRESHOLD_MS);

    return () => {
      events.forEach(event => window.removeEventListener(event, handleEngagement));
      if (engagementTimerRef.current) {
        clearTimeout(engagementTimerRef.current);
      }
    };
  }, [isStandalone, canShow, userEngaged]);

  // CRITICAL FIX: Check for prompt captured BEFORE component mounted (in main.tsx)
  useEffect(() => {
    if (checkStandalone()) {
      return;
    }

    const detectedPlatform = detectPlatform();
    setPlatform(detectedPlatform);

    // CRITICAL: Check if prompt was already captured in main.tsx BEFORE React mounted
    // Also check legacy variable name for backwards compatibility
    const capturedPrompt = window.__capturedPwaPrompt || (window as any).deferredPwaPrompt;
    
    if (capturedPrompt && !window.__pwaPromptUsed) {
      console.log('✅ [PWA Banner] Found pre-captured prompt!');
      console.log('📋 [PWA Banner] Source:', window.__capturedPwaPrompt ? 'main.tsx' : 'legacy');
      console.log('📋 [PWA Banner] Captured at:', window.__pwaPromptCapturedAt ? new Date(window.__pwaPromptCapturedAt).toISOString() : 'unknown');
      setDeferredPrompt(capturedPrompt as BeforeInstallPromptEvent);
      
      // Sync to main variable for consistency
      if (!window.__capturedPwaPrompt) {
        window.__capturedPwaPrompt = capturedPrompt;
      }
    }

    // Also listen for prompt captured after component mounts (fallback)
    const handlePromptCaptured = (e: Event) => {
      const customEvent = e as CustomEvent;
      const promptEvent = customEvent.detail || window.__capturedPwaPrompt;
      
      if (!promptEvent) {
        console.warn('⚠️ [PWA] Prompt event missing from capture');
        return;
      }

      console.log('✅ [PWA Banner] Received captured prompt from event listener');
      setDeferredPrompt(promptEvent as BeforeInstallPromptEvent);
    };

    window.addEventListener('pwa-prompt-captured', handlePromptCaptured);

    // For iOS, no native prompt - just set platform for manual instructions
    if (detectedPlatform === 'ios') {
      console.log('🍎 [PWA Banner] iOS detected - will show manual instructions');
    }

    // Listen for app installed event
    const handleAppInstalled = () => {
      console.log('✅ [PWA] App installed successfully!');
      setShowBanner(false);
      setShowIOSModal(false);
      localStorage.removeItem(STORAGE_KEY_DISMISSED);
      localStorage.removeItem(STORAGE_KEY_DISMISS_COUNT);
      trackEvent('appinstalled', { platform: detectedPlatform });
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('pwa-prompt-captured', handlePromptCaptured);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [checkStandalone, detectPlatform, trackEvent]);

  // Show banner when conditions are met (separated from capture logic)
  useEffect(() => {
    if (isStandalone || !canShow()) return;

    const shouldShow = (
      // Android/Desktop with native prompt
      (deferredPrompt && (platform === 'android' || platform === 'desktop') && userEngaged) ||
      // iOS needs manual instructions (no native prompt)
      (platform === 'ios' && userEngaged)
    );

    if (shouldShow && !showBanner) {
      console.log('📢 [PWA Banner] Showing banner', { platform, hasPrompt: !!deferredPrompt, userEngaged });
      setShowBanner(true);
      
      if (!hasTrackedShow.current) {
        trackEvent('install_shown', { platform });
        hasTrackedShow.current = true;
      }
    }
  }, [deferredPrompt, platform, userEngaged, isStandalone, canShow, showBanner, trackEvent]);

  // Removed: Banner show logic is now in the combined useEffect above

  // CRITICAL FIX: Install handler calls prompt() SYNCHRONOUSLY in user gesture
  // NO setTimeout, NO async before prompt() - user gesture is only valid briefly
  const handleInstall = () => {
    console.log('🚀 [PWA] Install button clicked!');
    
    // CRITICAL: Get prompt from state OR directly from window - NO ASYNC!
    // Check both variable names for backwards compatibility
    const windowPrompt = window.__capturedPwaPrompt || (window as any).deferredPwaPrompt;
    const promptToUse = deferredPrompt || 
      (windowPrompt && !window.__pwaPromptUsed 
        ? windowPrompt as BeforeInstallPromptEvent 
        : null);

    console.log('📋 [PWA] Prompt state:', {
      hasStatePrompt: !!deferredPrompt,
      hasWindowPrompt: !!window.__capturedPwaPrompt,
      promptUsed: window.__pwaPromptUsed,
      usingPrompt: !!promptToUse
    });

    if (!promptToUse) {
      console.error('❌ [PWA] No install prompt available!');
      console.error('❌ [PWA] This means beforeinstallprompt never fired or was already used');
      return;
    }

    // CRITICAL: Call prompt() IMMEDIATELY - NO setState, NO setTimeout before this!
    // The user gesture (click) is only valid for a very short time (~1 second)
    try {
      console.log('📲 [PWA] Calling prompt() SYNCHRONOUSLY...');
      
      // Mark as used BEFORE calling prompt to prevent double-calls
      window.__pwaPromptUsed = true;
      
      // THIS MUST BE SYNCHRONOUS - no async operations before this line!
      promptToUse.prompt();
      
      console.log('✅ [PWA] prompt() called successfully!');
      trackEvent('install_prompted', { platform });

      // Handle the result asynchronously AFTER prompt() is called
      promptToUse.userChoice
        .then(choiceResult => {
          console.log('👤 [PWA] User choice:', choiceResult.outcome);

          if (choiceResult.outcome === 'accepted') {
            console.log('🎉 [PWA] Install ACCEPTED!');
            trackEvent('install_accepted', { platform });
            setShowBanner(false);
            localStorage.removeItem(STORAGE_KEY_DISMISSED);
            localStorage.removeItem(STORAGE_KEY_DISMISS_COUNT);
          } else {
            console.log('❌ [PWA] Install dismissed by user');
            trackEvent('install_dismissed', { platform, reason: 'user_declined_prompt' });
            handleDismiss();
          }

          setDeferredPrompt(null);
          window.__capturedPwaPrompt = null;
        })
        .catch(error => {
          console.error('❌ [PWA] userChoice error:', error);
        });
    } catch (error) {
      console.error('❌ [PWA] prompt() failed:', error);
      console.error('❌ [PWA] Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      trackEvent('install_dismissed', { platform, reason: 'error', error: (error as Error).message });
      // Reset used flag on error so user can retry
      window.__pwaPromptUsed = false;
    }
  };

  const handleDismiss = () => {
    const dismissCount = parseInt(localStorage.getItem(STORAGE_KEY_DISMISS_COUNT) || '0');
    localStorage.setItem(STORAGE_KEY_DISMISSED, Date.now().toString());
    localStorage.setItem(STORAGE_KEY_DISMISS_COUNT, (dismissCount + 1).toString());
    setShowBanner(false);
    setShowIOSModal(false);
    console.log(`🔕 [PWA] Dismissed (count: ${dismissCount + 1})`);
    trackEvent('install_dismissed', { platform, dismiss_count: dismissCount + 1 });
  };

  const handleLater = () => {
    // "Later" doesn't count against dismiss count - short 1-day cooldown
    localStorage.setItem(STORAGE_KEY_DISMISSED, Date.now().toString());
    localStorage.setItem(STORAGE_KEY_DISMISS_COUNT, '0');
    setShowBanner(false);
    setShowIOSModal(false);
    console.log('⏰ [PWA] Later (1-day cooldown)');
    trackEvent('install_dismissed', { platform, reason: 'later' });
  };

  const handleIOSInstructions = () => {
    setShowBanner(false);
    setShowIOSModal(true);
    trackEvent('install_prompted', { platform: 'ios', type: 'instructions_modal' });
  };

  if (isStandalone || !platform) {
    return null;
  }

  return (
    <>
      {/* PHASE 2 FIX: z-[70] ensures banner is above modals (z-50) and onboarding (z-50) */}
      <AnimatePresence>
        {/* Android/Desktop Banner with native prompt button - FIXED: Position at TOP */}
        {showBanner && (platform === 'android' || platform === 'desktop') && deferredPrompt && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-4 left-4 right-4 z-[70] md:left-auto md:right-6 md:top-6 md:w-96"
          >
            <Card className="border-2 border-primary/30 bg-card/95 backdrop-blur-xl shadow-2xl">
              <button
                onClick={handleDismiss}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted/50 transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>

              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                    <Download className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 pr-6">
                    <h3 className="font-bold text-foreground mb-1">
                      Install KisanShakti
                    </h3>
                    <p className="text-sm text-muted-foreground leading-snug">
                      Fast access • Works offline • Get notifications
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {/* PHASE 2 CRITICAL FIX: onClick directly calls handleInstall (user gesture preserved) */}
                  <Button
                    onClick={handleInstall}
                    className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:opacity-90 shadow-md"
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Install App
                  </Button>
                  <Button
                    onClick={handleLater}
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                  >
                    Later
                  </Button>
                </div>
              </div>

              <div className="h-1 bg-gradient-to-r from-primary via-primary/80 to-primary" />
            </Card>
          </motion.div>
        )}

        {/* iOS Banner (shows instructions button) - FIXED: Position at TOP */}
        {showBanner && platform === 'ios' && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-4 left-4 right-4 z-[70] md:left-auto md:right-6 md:top-6 md:w-96"
          >
            <Card className="border-2 border-primary/30 bg-card/95 backdrop-blur-xl shadow-2xl">
              <button
                onClick={handleDismiss}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted/50 transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>

              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                    <Smartphone className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 pr-6">
                    <h3 className="font-bold text-foreground mb-1">
                      Install on iPhone
                    </h3>
                    <p className="text-sm text-muted-foreground leading-snug">
                      Add to Home Screen for better experience
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleIOSInstructions}
                    className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:opacity-90 shadow-md"
                    size="sm"
                  >
                    Show Instructions
                  </Button>
                  <Button
                    onClick={handleLater}
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                  >
                    Later
                  </Button>
                </div>
              </div>

              <div className="h-1 bg-gradient-to-r from-primary via-primary/80 to-primary" />
            </Card>
          </motion.div>
        )}

        {/* iOS Instructions Modal - z-[80] above banner */}
        {showIOSModal && platform === 'ios' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-end md:items-center justify-center p-4"
            onClick={handleDismiss}
          >
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.9 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="bg-card border-border shadow-2xl">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-foreground">Install KisanShakti</h2>
                    <Button
                      onClick={handleDismiss}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>

                  <Alert className="mb-4 bg-info/10 border-info/20">
                    <AlertDescription className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                          1
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-foreground mb-1">Tap Share Button</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Share className="w-4 h-4" />
                            Tap <span className="font-semibold">Share</span> in Safari toolbar (bottom)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                          2
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-foreground mb-1">Add to Home Screen</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Plus className="w-4 h-4" />
                            Scroll and tap <span className="font-semibold">"Add to Home Screen"</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                          3
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-foreground mb-1">Confirm Installation</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Smartphone className="w-4 h-4" />
                            Tap <span className="font-semibold">"Add"</span> in top-right corner
                          </p>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleDismiss}
                      className="flex-1 bg-gradient-to-r from-primary to-primary/90"
                    >
                      Got it!
                    </Button>
                    <Button
                      onClick={handleDismiss}
                      variant="outline"
                    >
                      Don't show again
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
