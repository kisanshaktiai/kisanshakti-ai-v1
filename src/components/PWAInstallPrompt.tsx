import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share, Plus, Smartphone, Monitor } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop' | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                      (window.navigator as any).standalone ||
                      document.referrer.includes('android-app://');
    
    setIsStandalone(standalone);

    if (standalone) {
      return; // Don't show prompt if already installed
    }

    // Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
    
    if (isIOS && isSafari) {
      setPlatform('ios');
    } else if (isAndroid) {
      setPlatform('android');
    } else if (!isIOS && !isAndroid) {
      setPlatform('desktop');
    }

    // Check localStorage for dismissal
    const dismissedDate = localStorage.getItem('pwa-install-dismissed');
    const dismissCount = parseInt(localStorage.getItem('pwa-install-dismiss-count') || '0');
    
    if (dismissedDate) {
      const daysSinceDismiss = (Date.now() - parseInt(dismissedDate)) / (1000 * 60 * 60 * 24);
      
      // Show again based on dismiss count:
      // 1st dismiss: show after 3 days
      // 2nd dismiss: show after 7 days
      // 3rd+ dismiss: show after 30 days
      const daysToWait = dismissCount === 1 ? 3 : dismissCount === 2 ? 7 : 30;
      
      if (daysSinceDismiss < daysToWait) {
        return; // Don't show if dismissed recently
      }
    }

    // Listen for beforeinstallprompt event (Android/Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Show prompt after 10 seconds on page
      setTimeout(() => {
        setShowPrompt(true);
      }, 10000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // For iOS, show prompt after 10 seconds if not dismissed
    if (isIOS && isSafari && !dismissedDate) {
      setTimeout(() => {
        setShowPrompt(true);
      }, 10000);
    }

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      setShowPrompt(false);
      setShowSuccess(true);
      localStorage.removeItem('pwa-install-dismissed');
      localStorage.removeItem('pwa-install-dismiss-count');
      
      setTimeout(() => {
        setShowSuccess(false);
      }, 5000);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // For iOS, just show instructions (can't trigger programmatically)
      return;
    }

    try {
      // Show the install prompt
      await deferredPrompt.prompt();
      
      // Wait for user choice
      const choiceResult = await deferredPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        console.log('PWA install accepted');
        setShowSuccess(true);
        localStorage.removeItem('pwa-install-dismissed');
        localStorage.removeItem('pwa-install-dismiss-count');
      } else {
        console.log('PWA install dismissed');
        handleDismiss();
      }
      
      setShowPrompt(false);
      setDeferredPrompt(null);
    } catch (error) {
      console.error('Error installing PWA:', error);
    }
  };

  const handleDismiss = () => {
    const dismissCount = parseInt(localStorage.getItem('pwa-install-dismiss-count') || '0');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    localStorage.setItem('pwa-install-dismiss-count', (dismissCount + 1).toString());
    setShowPrompt(false);
  };

  const handleLater = () => {
    // Don't count "Later" as a permanent dismiss - show again in 1 day
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    localStorage.setItem('pwa-install-dismiss-count', '0'); // Reset counter
    setShowPrompt(false);
  };

  if (isStandalone || !platform) {
    return null;
  }

  return (
    <>
      {/* Install Prompt */}
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-6 md:bottom-6 md:w-96"
          >
            <Card className="border-2 border-primary/20 bg-card shadow-glow overflow-hidden">
              {/* Close Button */}
              <button
                onClick={handleDismiss}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>

              <div className="p-4">
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-gradient-primary">
                    <Download className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-1">
                      Install KisanShakti App
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Access faster, work offline, get notifications
                    </p>
                  </div>
                </div>

                {/* Platform-specific instructions */}
                {platform === 'ios' && (
                  <Alert className="mb-3 bg-info/10 border-info/20">
                    <AlertDescription className="text-xs space-y-2">
                      <p className="font-medium text-info-foreground">To install on iPhone/iPad:</p>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <Share className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>Tap the Share button in Safari</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Plus className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>Select "Add to Home Screen"</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Smartphone className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>Tap "Add" to confirm</span>
                        </li>
                      </ol>
                    </AlertDescription>
                  </Alert>
                )}

                {platform === 'android' && deferredPrompt && (
                  <div className="mb-3 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Smartphone className="w-3 h-3" />
                      Install the app for better experience
                    </p>
                  </div>
                )}

                {platform === 'desktop' && deferredPrompt && (
                  <div className="mb-3 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Monitor className="w-3 h-3" />
                      Install the app on your desktop
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {(platform === 'android' || platform === 'desktop') && deferredPrompt ? (
                    <>
                      <Button
                        onClick={handleInstall}
                        className="flex-1 bg-gradient-primary hover:opacity-90"
                        size="sm"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Install Now
                      </Button>
                      <Button
                        onClick={handleLater}
                        variant="outline"
                        size="sm"
                      >
                        Later
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleLater}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      Got it
                    </Button>
                  )}
                </div>
              </div>

              {/* Bottom gradient accent */}
              <div className="h-1 bg-gradient-primary" />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Message */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-4 right-4 z-50 md:left-auto md:right-6 md:w-96"
          >
            <Alert className="bg-success border-success shadow-lg">
              <Download className="w-4 h-4 text-success-foreground" />
              <AlertDescription className="text-success-foreground ml-2">
                <strong>App installed successfully!</strong> You can now access KisanShakti from your home screen.
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
