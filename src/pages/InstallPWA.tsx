import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, Smartphone, Monitor, CheckCircle, Share, Plus, Chrome, Apple } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTenant } from '@/hooks/useTenant';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function InstallPWA() {
  const { branding } = useTenant();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop' | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Check if already installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                      (window.navigator as any).standalone ||
                      document.referrer.includes('android-app://');
    
    setIsInstalled(standalone);

    // Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
    
    if (isIOS && isSafari) {
      setPlatform('ios');
    } else if (isAndroid) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }

    // Check global prompt from index.html script
    const globalPrompt = (window as any).deferredPwaPrompt;
    if (globalPrompt) {
      setDeferredPrompt(globalPrompt as BeforeInstallPromptEvent);
    }

    // Listen for custom event
    const handleCanInstall = () => {
      const prompt = (window as any).deferredPwaPrompt;
      if (prompt) {
        setDeferredPrompt(prompt as BeforeInstallPromptEvent);
      }
    };

    document.addEventListener('pwa:can-install', handleCanInstall);
    
    return () => {
      document.removeEventListener('pwa:can-install', handleCanInstall);
    };
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    
    try {
      // Use global install helper if available
      const globalInstall = (window as any).triggerPwaInstall;
      if (globalInstall) {
        await globalInstall();
        setIsInstalled(true);
        return;
      }

      // Fallback to component prompt
      if (!deferredPrompt) {
        setInstalling(false);
        return;
      }

      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
      }
      
      setDeferredPrompt(null);
    } catch (error) {
      console.error('Install error:', error);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-block p-4 rounded-2xl bg-gradient-primary mb-6">
            <Download className="w-12 h-12 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold mb-3">
            Install {branding?.company_name || 'KisanShakti'}
          </h1>
          <p className="text-muted-foreground">
            Get the full app experience with offline access and notifications
          </p>
        </motion.div>

        {/* Install Status */}
        {isInstalled ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Alert className="bg-success/10 border-success mb-8">
              <CheckCircle className="w-5 h-5 text-success" />
              <AlertDescription className="text-success-foreground ml-2">
                <strong>App installed!</strong> You can access it from your home screen.
              </AlertDescription>
            </Alert>
          </motion.div>
        ) : null}

        {/* Benefits */}
        <Card className="p-6 mb-8">
          <h2 className="font-semibold text-lg mb-4">Why Install?</h2>
          <div className="space-y-3">
            {[
              { icon: '🚀', title: 'Faster Access', desc: 'Launch instantly from home screen' },
              { icon: '📴', title: 'Work Offline', desc: 'Access your data without internet' },
              { icon: '🔔', title: 'Get Notifications', desc: 'Stay updated with alerts' },
              { icon: '💾', title: 'Save Data', desc: 'Uses less mobile data' },
            ].map((benefit, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-2xl">{benefit.icon}</span>
                <div>
                  <h3 className="font-medium">{benefit.title}</h3>
                  <p className="text-sm text-muted-foreground">{benefit.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Platform-specific instructions */}
        {platform === 'android' && deferredPrompt && !isInstalled && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="p-6 border-2 border-primary/20">
              <div className="flex items-center gap-3 mb-4">
                <Chrome className="w-6 h-6 text-primary" />
                <h2 className="font-semibold text-lg">Install on Android</h2>
              </div>
              <Button
                onClick={handleInstall}
                disabled={installing}
                className="w-full bg-gradient-primary hover:opacity-90"
                size="lg"
              >
                <Download className="w-5 h-5 mr-2" />
                {installing ? 'Installing...' : 'Install App Now'}
              </Button>
            </Card>
          </motion.div>
        )}

        {platform === 'ios' && !isInstalled && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="p-6 border-2 border-primary/20">
              <div className="flex items-center gap-3 mb-4">
                <Apple className="w-6 h-6 text-primary" />
                <h2 className="font-semibold text-lg">Install on iPhone/iPad</h2>
              </div>
              <Alert className="bg-info/10 border-info/20 mb-4">
                <AlertDescription className="text-sm space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="bg-info/20 p-2 rounded-lg flex-shrink-0">
                      <Share className="w-4 h-4 text-info" />
                    </div>
                    <div>
                      <p className="font-medium mb-1">Step 1: Tap Share</p>
                      <p className="text-xs text-muted-foreground">
                        Tap the Share button <Share className="inline w-3 h-3" /> in Safari's toolbar
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-info/20 p-2 rounded-lg flex-shrink-0">
                      <Plus className="w-4 h-4 text-info" />
                    </div>
                    <div>
                      <p className="font-medium mb-1">Step 2: Add to Home Screen</p>
                      <p className="text-xs text-muted-foreground">
                        Scroll and select "Add to Home Screen"
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-info/20 p-2 rounded-lg flex-shrink-0">
                      <Smartphone className="w-4 h-4 text-info" />
                    </div>
                    <div>
                      <p className="font-medium mb-1">Step 3: Confirm</p>
                      <p className="text-xs text-muted-foreground">
                        Tap "Add" to install the app
                      </p>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
              <p className="text-xs text-muted-foreground text-center">
                Note: Installation must be done through Safari browser
              </p>
            </Card>
          </motion.div>
        )}

        {platform === 'desktop' && deferredPrompt && !isInstalled && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="p-6 border-2 border-primary/20">
              <div className="flex items-center gap-3 mb-4">
                <Monitor className="w-6 h-6 text-primary" />
                <h2 className="font-semibold text-lg">Install on Desktop</h2>
              </div>
              <Button
                onClick={handleInstall}
                disabled={installing}
                className="w-full bg-gradient-primary hover:opacity-90"
                size="lg"
              >
                <Download className="w-5 h-5 mr-2" />
                {installing ? 'Installing...' : 'Install App Now'}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-3">
                Or look for the install icon <Download className="inline w-3 h-3" /> in your browser's address bar
              </p>
            </Card>
          </motion.div>
        )}

        {/* Manual fallback */}
        {!deferredPrompt && !isInstalled && platform !== 'ios' && (
          <Alert className="bg-muted">
            <AlertDescription className="text-sm">
              <strong>Alternative method:</strong> Look for the install icon in your browser's menu or address bar.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
