/**
 * PWA Update Prompt Component
 * Mobile-first update notification following best practices
 * - Only shows when update is downloaded and ready
 * - Respects user dismissals with smart re-prompting
 * - Handles platform-specific behaviors (Android/iOS PWA)
 * - Graceful offline handling
 */

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Download, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { updateStateManager } from '@/services/updateStateManager';
import { versionService } from '@/services/versionService';

export function PWAUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [newVersion, setNewVersion] = useState<string>('');
  const [isStandalone, setIsStandalone] = useState(false);

  const currentVersion = versionService.getCurrentVersion();

  useEffect(() => {
    // Detect if running as installed PWA (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone 
      || document.referrer.includes('android-app://');
    
    setIsStandalone(standalone);
    console.log('[PWAUpdatePrompt] Running mode:', standalone ? 'Installed PWA' : 'Browser');

    // Register service worker and set up update detection
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(reg => {
          console.log('[PWAUpdatePrompt] Service worker ready');
          setRegistration(reg);

          // Check if update is already waiting
          if (reg.waiting) {
            handleUpdateDetected(reg);
          }

          // Listen for new service worker waiting
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            console.log('[PWAUpdatePrompt] Update found, downloading...');

            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWAUpdatePrompt] Update downloaded and ready');
                  handleUpdateDetected(reg);
                }
              });
            }
          });

          // Check for updates periodically (15 minutes - not aggressive)
          const checkInterval = setInterval(() => {
            console.log('[PWAUpdatePrompt] Checking for updates...');
            reg.update().catch(err => {
              console.warn('[PWAUpdatePrompt] Update check failed:', err);
            });
          }, 15 * 60 * 1000); // 15 minutes

          // Initial check after 30 seconds
          setTimeout(() => reg.update(), 30000);

          return () => clearInterval(checkInterval);
        })
        .catch(err => {
          console.error('[PWAUpdatePrompt] Service worker registration failed:', err);
        });

      // Listen for service worker activation (after update)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWAUpdatePrompt] Service worker activated - reloading');
        // Wait a bit to ensure everything is ready
        setTimeout(() => {
          window.location.reload();
        }, 500);
      });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SW_ACTIVATED') {
          console.log('[PWAUpdatePrompt] Received activation confirmation');
        }
      });
    }
  }, []);

  /**
   * Handle when an update is detected and ready
   */
  const handleUpdateDetected = (reg: ServiceWorkerRegistration) => {
    // Skip update prompts in development mode
    if (versionService.isDevelopmentMode()) {
      console.log('[PWAUpdatePrompt] Skipping update prompt in development mode');
      return;
    }

    // Get version info
    const buildTime = versionService.getBuildTime();
    const versionDisplay = buildTime 
      ? `${currentVersion} (${new Date(buildTime).toLocaleDateString()})`
      : currentVersion;
    
    setNewVersion(versionDisplay);

    // Get last known version to check if version actually changed
    const lastKnownVersion = localStorage.getItem('last-known-version') || '0.0.0';
    
    // If version hasn't changed, don't show prompt (prevents false positives during dev)
    if (lastKnownVersion === currentVersion) {
      console.log('[PWAUpdatePrompt] Service worker updated but version unchanged - skipping prompt');
      versionService.acknowledgeCurrentVersion(); // Acknowledge to prevent repeated checks
      return;
    }

    // Check if we should show the prompt based on dismissal state
    const shouldShow = updateStateManager.shouldShowUpdatePrompt(currentVersion);
    
    // For major updates, override dismissal
    const isMajor = updateStateManager.isMajorUpdate(lastKnownVersion, currentVersion);

    if (shouldShow || isMajor) {
      console.log('[PWAUpdatePrompt] Showing update prompt', isMajor ? '(major update)' : '', `(${lastKnownVersion} → ${currentVersion})`);
      setShowPrompt(true);
      setRegistration(reg);
    } else {
      const timeUntil = updateStateManager.getTimeUntilNextPrompt(currentVersion);
      const hoursUntil = Math.round(timeUntil / 1000 / 60 / 60);
      console.log(`[PWAUpdatePrompt] Update available but dismissed. Next prompt in ${hoursUntil}h`);
    }

    // Store last known version for comparison
    localStorage.setItem('last-known-version', currentVersion);
  };

  /**
   * Handle user clicking "Update Now"
   */
  const handleUpdate = async () => {
    if (!registration?.waiting) {
      console.warn('[PWAUpdatePrompt] No waiting service worker found');
      return;
    }

    // Check if online
    if (!navigator.onLine) {
      console.warn('[PWAUpdatePrompt] Cannot update while offline');
      alert('You are currently offline. Please connect to update the app.');
      return;
    }

    setIsUpdating(true);
    console.log('[PWAUpdatePrompt] User initiated update');

    try {
      // Record that user accepted the update
      updateStateManager.recordUpdateAccepted(currentVersion);
      
      // Acknowledge the current version
      versionService.acknowledgeCurrentVersion();

      // Tell service worker to skip waiting and activate
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });

      // The page will reload automatically when controllerchange fires
      // Show loading state until then
      console.log('[PWAUpdatePrompt] Update initiated, waiting for activation...');
    } catch (error) {
      console.error('[PWAUpdatePrompt] Error during update:', error);
      setIsUpdating(false);
      alert('Update failed. Please try again.');
    }
  };

  /**
   * Handle user clicking "Later" (dismissing the update)
   */
  const handleDismiss = () => {
    console.log('[PWAUpdatePrompt] User dismissed update');
    
    // Record dismissal
    updateStateManager.recordDismissal(currentVersion);
    
    // Acknowledge current ETag so we don't keep detecting same version
    versionService.acknowledgeCurrentVersion();
    
    // Hide prompt
    setShowPrompt(false);

    // Show info about when they'll be prompted again
    const state = updateStateManager.getDebugInfo();
    if (state) {
      const nextPromptHours = state.dismissalCount >= 3 ? 168 : 24;
      console.log(`[PWAUpdatePrompt] Will prompt again in ${nextPromptHours} hours`);
    }
  };

  if (!showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-8 md:bottom-8 md:w-96"
      >
        <Card className="p-4 shadow-xl border-primary/20 bg-background/95 backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-1">
              {isStandalone ? (
                <Download className="h-5 w-5 text-primary" />
              ) : (
                <RefreshCw className="h-5 w-5 text-primary" />
              )}
            </div>
            
            <div className="flex-1 space-y-2">
              <div>
                <h3 className="font-semibold text-foreground">
                  Update Available
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Version {newVersion} is ready to install.
                  {isStandalone && ' Update now to get the latest features.'}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  className="flex-1"
                  size="sm"
                >
                  {isUpdating ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Update Now
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={handleDismiss}
                  variant="outline"
                  disabled={isUpdating}
                  size="sm"
                  className="flex-1"
                >
                  Later
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {isStandalone 
                  ? "Installed app • Update takes a few seconds"
                  : "App will reload after update"}
              </p>
            </div>

            <button
              onClick={handleDismiss}
              disabled={isUpdating}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
