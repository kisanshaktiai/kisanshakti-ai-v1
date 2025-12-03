import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.1ca669aaddca4527a8c3e8b29bf3e598',
  appName: 'KisanShakti',
  webDir: 'dist',
  
  // Server configuration for development
  // IMPORTANT: Comment out 'server' block for production APK builds
  server: {
    // For development - connects to Lovable preview for hot reload
    url: 'https://1ca669aa-ddca-4527-a8c3-e8b29bf3e598.lovableproject.com?forceHideBadge=true',
    cleartext: true,
    // Allow navigation to all URLs
    allowNavigation: ['*'],
  },
  
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#22c55e',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#22c55e',
    },
  },
  
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
    // Build configuration
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK',
    },
  },
  
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },
  
  // Logging configuration
  loggingBehavior: 'debug',
};

export default config;
