import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { versionService } from "@/services/versionService";

export function PWAUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Register service worker and set up update detection
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg);
        console.log('PWA: Service Worker ready');

        // Check for updates every 2 minutes
        const intervalId = setInterval(() => {
          reg.update();
        }, 2 * 60 * 1000);

        return () => clearInterval(intervalId);
      });

      // Listen for service worker updates
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('PWA: Controller changed, new version detected');
        setShowPrompt(true);
      });

      // Check if there's a waiting service worker
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          console.log('PWA: Waiting service worker found');
          setShowPrompt(true);
        }
      });
    }

    // Start version checking
    versionService.startVersionChecking((updateAvailable) => {
      if (updateAvailable) {
        setShowPrompt(true);
      }
    });

    return () => {
      versionService.stopVersionChecking();
    };
  }, []);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      // Check if there's a waiting service worker
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        // Tell the waiting service worker to skip waiting
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      
      // Force update through version service
      await versionService.forceUpdate();
      // The page will reload automatically
    } catch (error) {
      console.error('Update failed:', error);
      setIsUpdating(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-md"
        >
          <Card className="bg-background/95 backdrop-blur-lg border-primary/20 shadow-lg">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-primary" />
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground mb-1">
                    Update Available
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    A new version of the app is ready. Update now to get the latest features and improvements.
                  </p>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={handleUpdate}
                      disabled={isUpdating}
                      size="sm"
                      className="flex-1"
                    >
                      {isUpdating ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Update Now
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={handleDismiss}
                      disabled={isUpdating}
                      variant="outline"
                      size="sm"
                    >
                      Later
                    </Button>
                  </div>
                </div>
                
                <button
                  onClick={handleDismiss}
                  disabled={isUpdating}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
