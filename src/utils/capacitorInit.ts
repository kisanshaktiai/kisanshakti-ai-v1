import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Initialize Capacitor plugins for native app
 */
export async function initializeCapacitor(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('[Capacitor] Running in web mode');
    return;
  }

  console.log('[Capacitor] Initializing native platform:', Capacitor.getPlatform());

  try {
    // Configure status bar
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: '#22c55e' });
    } else if (Capacitor.getPlatform() === 'ios') {
      await StatusBar.setStyle({ style: Style.Light });
    }

    // Hide splash screen after app is ready
    await SplashScreen.hide();

    // Handle app URL open (deep links)
    App.addListener('appUrlOpen', (event) => {
      console.log('[Capacitor] App opened with URL:', event.url);
      // Handle deep links here
      const slug = event.url.split('.app').pop();
      if (slug) {
        window.location.href = slug;
      }
    });

    // Handle back button on Android
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    // Handle app state changes
    App.addListener('appStateChange', ({ isActive }) => {
      console.log('[Capacitor] App state changed, isActive:', isActive);
    });

    console.log('[Capacitor] Native initialization complete');
  } catch (error) {
    console.error('[Capacitor] Initialization error:', error);
  }
}

/**
 * Check if running as native app
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Get the current platform
 */
export function getPlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}
