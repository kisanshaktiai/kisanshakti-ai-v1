/**
 * PWAInstallBanner - Production-ready PWA install banner
 * 
 * Features:
 * - Captures beforeinstallprompt on Android/Desktop
 * - Shows custom banner (not browser's default)
 * - iOS Safari A2HS instructions overlay
 * - Smart timing: shows after user engagement, not on page load
 * - Analytics hooks for funnel tracking
 * - Respects user dismissal (with graduated cooldown)
 * - Accessible and mobile-first
 * 
 * ROOT CAUSE FIX:
 * - Previous: Duplicate handlers in index.html + component caused race conditions
 * - Previous: Hardcoded 10s delay caused unwanted auto-prompt
 * - Previous: Top positioning bad for mobile UX
 * 
 * NEW APPROACH:
 * - Single handler in component only
 * - Show only after user engagement (scroll, click, 30s idle)
 * - Bottom positioning for better reachability
 * - Proper event cleanup
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share, Plus, Smartphone, Monitor, ChevronUp } from 'lucide-react';
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
    console.log(`[PWA Analytics] ${event}`, data);
    
    // Google Analytics 4
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', event, {
        event_category: 'pwa',
        ...data
      });
    }

    // Custom analytics hook (extend as needed)
    if (typeof window !== 'undefined' && (window as any).analyticsHook) {
      (window as any).analyticsHook(event, data);
    }
  }, []);

  // Check if already installed
  const checkStandalone = useCallback(() => {
    const standalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone ||
      document.referrer.includes('android-app://');
    
    setIsStandalone(standalone);
    return standalone;
  }, []);

  // Detect platform
  const detectPlatform = useCallback((): Platform => {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
    
    if (isIOS && isSafari) return 'ios';
    if (isAndroid) return 'android';
    if (!isIOS && !isAndroid) return 'desktop';
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
      console.log(`[PWA] Banner dismissed ${dismissCount} times, cooling down for ${cooldownDays} days`);
      return false;
    }

    return true;
  }, []);

  // Handle user engagement detection
  useEffect(() => {
    if (isStandalone || !canShow()) return;

    const handleEngagement = () => {
      if (userEngaged) return;
      console.log('[PWA] User engaged, will show banner after idle period');
      setUserEngaged(true);
    };

    // Detect engagement signals
    const events = ['scroll', 'click', 'touchstart', 'keydown'];
    events.forEach(event => {
      window.addEventListener(event, handleEngagement, { once: true, passive: true });
    });

    // Fallback: show after 30s idle
    engagementTimerRef.current = setTimeout(() => {
      console.log('[PWA] Engagement timeout reached, user considered engaged');
      setUserEngaged(true);
    }, ENGAGEMENT_THRESHOLD_MS);

    return () => {
      events.forEach(event => window.removeEventListener(event, handleEngagement));
      if (engagementTimerRef.current) {
        clearTimeout(engagementTimerRef.current);
      }
    };
  }, [isStandalone, canShow, userEngaged]);

  // Capture beforeinstallprompt
  useEffect(() => {
    if (checkStandalone()) {
      console.log('[PWA] Already installed, not showing banner');
      return;
    }

    const detectedPlatform = detectPlatform();
    setPlatform(detectedPlatform);
    console.log('[PWA] Platform detected:', detectedPlatform);

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser's default install prompt
      e.preventDefault();
      console.log('[PWA] beforeinstallprompt captured');
      
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      // Show banner only if user is engaged and cooldown passed
      if (userEngaged && canShow()) {
        setShowBanner(true);
        
        if (!hasTrackedShow.current) {
          trackEvent('install_shown', { platform: detectedPlatform });
          hasTrackedShow.current = true;
        }
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // iOS: Show banner after engagement
    if (detectedPlatform === 'ios' && canShow() && userEngaged) {
      console.log('[PWA] iOS detected, showing banner after engagement');
      setShowBanner(true);
      
      if (!hasTrackedShow.current) {
        trackEvent('install_shown', { platform: 'ios' });
        hasTrackedShow.current = true;
      }
    }

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      console.log('[PWA] App installed successfully');
      setShowBanner(false);
      setShowIOSModal(false);
      localStorage.removeItem(STORAGE_KEY_DISMISSED);
      localStorage.removeItem(STORAGE_KEY_DISMISS_COUNT);
      trackEvent('appinstalled', { platform: detectedPlatform });
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [checkStandalone, detectPlatform, canShow, userEngaged, trackEvent]);

  // Show banner after engagement (for iOS and when prompt is available)
  useEffect(() => {
    if (userEngaged && !isStandalone && canShow()) {
      if ((platform === 'ios') || (deferredPrompt && (platform === 'android' || platform === 'desktop'))) {
        setShowBanner(true);
        
        if (!hasTrackedShow.current) {
          trackEvent('install_shown', { platform });
          hasTrackedShow.current = true;
        }
      }
    }
  }, [userEngaged, isStandalone, canShow, platform, deferredPrompt, trackEvent]);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      console.warn('[PWA] No deferred prompt available');
      return;
    }

    try {
      console.log('[PWA] Showing install prompt');
      trackEvent('install_prompted', { platform });

      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      console.log('[PWA] User choice:', choiceResult.outcome);

      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] Install accepted');
        trackEvent('install_accepted', { platform });
        setShowBanner(false);
        localStorage.removeItem(STORAGE_KEY_DISMISSED);
        localStorage.removeItem(STORAGE_KEY_DISMISS_COUNT);
      } else {
        console.log('[PWA] Install dismissed by user');
        trackEvent('install_dismissed', { platform, reason: 'user_declined_prompt' });
        handleDismiss();
      }

      setDeferredPrompt(null);
    } catch (error) {
      console.error('[PWA] Install error:', error);
      trackEvent('install_dismissed', { platform, reason: 'error', error: (error as Error).message });
    }
  };

  const handleDismiss = () => {
    const dismissCount = parseInt(localStorage.getItem(STORAGE_KEY_DISMISS_COUNT) || '0');
    localStorage.setItem(STORAGE_KEY_DISMISSED, Date.now().toString());
    localStorage.setItem(STORAGE_KEY_DISMISS_COUNT, (dismissCount + 1).toString());
    setShowBanner(false);
    setShowIOSModal(false);
    trackEvent('install_dismissed', { platform, dismiss_count: dismissCount + 1 });
  };

  const handleLater = () => {
    // "Later" doesn't count against dismiss count - short 1-day cooldown
    localStorage.setItem(STORAGE_KEY_DISMISSED, Date.now().toString());
    localStorage.setItem(STORAGE_KEY_DISMISS_COUNT, '0');
    setShowBanner(false);
    setShowIOSModal(false);
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
      {/* Bottom Banner (Android/Desktop) */}
      <AnimatePresence>
        {showBanner && (platform === 'android' || platform === 'desktop') && deferredPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-6 md:bottom-6 md:w-96"
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

        {/* iOS Banner (shows instructions button) */}
        {showBanner && platform === 'ios' && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-6 md:bottom-6 md:w-96"
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

        {/* iOS Instructions Modal */}
        {showIOSModal && platform === 'ios' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center p-4"
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
