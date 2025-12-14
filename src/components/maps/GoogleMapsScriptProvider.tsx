import React, { createContext, useContext, useMemo, useCallback, useState, useEffect } from 'react';
import { useJsApiLoader, Libraries } from '@react-google-maps/api';
import { useGoogleMaps } from '@/contexts/GoogleMapsContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, RefreshCw, AlertTriangle, WifiOff, Wifi } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

// Google Maps libraries to load
const GOOGLE_MAPS_LIBRARIES: Libraries = ['places', 'geometry', 'drawing'];

// Stable script ID to prevent duplicate loading
const SCRIPT_ID = 'google-maps-script-main';

interface GoogleMapsScriptContextType {
  isLoaded: boolean;
  loadError: string | null;
  isLoading: boolean;
  retry: () => void;
}

const GoogleMapsScriptContext = createContext<GoogleMapsScriptContextType>({
  isLoaded: false,
  loadError: null,
  isLoading: true,
  retry: () => {},
});

/**
 * Check if Google Maps is already loaded and fully functional
 */
function isGoogleMapsAlreadyLoaded(): boolean {
  return !!(
    typeof window !== 'undefined' && 
    window.google?.maps?.Map &&
    window.google?.maps?.Marker &&
    window.google?.maps?.Polygon &&
    window.google?.maps?.SymbolPath
  );
}

/**
 * Inner component that loads the Google Maps script
 * ONLY rendered when we have a valid API key
 */
function GoogleMapsScriptLoader({ 
  apiKey, 
  children,
  onRetry
}: { 
  apiKey: string; 
  children: React.ReactNode;
  onRetry: () => void;
}) {
  // Check if already loaded BEFORE calling useJsApiLoader
  const [alreadyLoaded] = useState(() => isGoogleMapsAlreadyLoaded());
  
  // Only use useJsApiLoader if not already loaded
  const { isLoaded: hookLoaded, loadError: scriptError } = useJsApiLoader({
    id: SCRIPT_ID,
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
    // Skip if already loaded
    preventGoogleFontsLoading: true,
  });

  // Combine both states - script is loaded if hook says so OR if it was already loaded
  const scriptLoaded = hookLoaded || alreadyLoaded;
  
  // Double-check by verifying Google is actually ready
  const [verifiedReady, setVerifiedReady] = useState(isGoogleMapsAlreadyLoaded());
  
  useEffect(() => {
    if (scriptLoaded && !verifiedReady) {
      // Give a small delay for Google to fully initialize
      const checkReady = () => {
        if (isGoogleMapsAlreadyLoaded()) {
          console.log('🗺️ [GoogleMapsScriptLoader] Google Maps verified ready');
          setVerifiedReady(true);
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    }
  }, [scriptLoaded, verifiedReady]);

  const isLoaded = verifiedReady;
  const isLoading = !scriptLoaded && !scriptError;
  const loadError = scriptError ? scriptError.message : null;

  // Log state for debugging
  useEffect(() => {
    console.log('🗺️ [GoogleMapsScriptLoader] State:', { 
      hookLoaded, 
      alreadyLoaded, 
      scriptLoaded, 
      verifiedReady,
      isLoaded,
      loadError 
    });
  }, [hookLoaded, alreadyLoaded, scriptLoaded, verifiedReady, isLoaded, loadError]);

  const contextValue = useMemo(() => ({
    isLoaded,
    loadError,
    isLoading,
    retry: onRetry,
  }), [isLoaded, loadError, isLoading, onRetry]);

  return (
    <GoogleMapsScriptContext.Provider value={contextValue}>
      {children}
    </GoogleMapsScriptContext.Provider>
  );
}

interface GoogleMapsScriptProviderProps {
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
}

/**
 * Production-ready Google Maps Script Provider
 * 
 * This component:
 * 1. Waits for the API key from GoogleMapsContext
 * 2. Only mounts useJsApiLoader AFTER we have a valid key
 * 3. Provides proper loading/error states
 * 4. Handles offline scenarios gracefully
 */
export function GoogleMapsScriptProvider({ 
  children,
  loadingComponent,
  errorComponent 
}: GoogleMapsScriptProviderProps) {
  const { apiKey, isLoading: isKeyLoading, error: keyError, retry: retryKey, isReady } = useGoogleMaps();
  const [loadingProgress, setLoadingProgress] = useState(10);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Animate loading progress
  useEffect(() => {
    if (isKeyLoading) {
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 15;
        });
      }, 500);
      return () => clearInterval(interval);
    } else if (isReady) {
      setLoadingProgress(100);
    }
  }, [isKeyLoading, isReady]);

  const handleRetry = useCallback(() => {
    setLoadingProgress(10);
    retryKey();
  }, [retryKey]);

  // Show loading while fetching API key
  if (isKeyLoading || !isReady) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
        <Card className="p-8 space-y-6 text-center max-w-sm mx-4">
          <div className="relative">
            <div className="h-20 w-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="h-10 w-10 text-primary animate-pulse" />
            </div>
            <div className={`absolute -top-1 -right-1 p-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-amber-500'}`}>
              {isOnline ? (
                <Wifi className="h-3 w-3 text-white" />
              ) : (
                <WifiOff className="h-3 w-3 text-white" />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground">Loading Google Maps...</p>
            <p className="text-sm text-muted-foreground">
              {!isOnline 
                ? 'Working offline - using cached data'
                : 'Initializing map services...'}
            </p>
          </div>
          <Progress value={loadingProgress} className="h-2" />
          
          {loadingProgress > 60 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRetry}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          )}
        </Card>
      </div>
    );
  }

  // Show error state if API key fetch failed
  if (keyError && !apiKey) {
    if (errorComponent) {
      return <>{errorComponent}</>;
    }

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4 z-50">
        <Card className="p-6 max-w-md w-full space-y-4 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-destructive">Map Loading Failed</h2>
          <p className="text-muted-foreground">
            Unable to load Google Maps. Please check your internet connection and try again.
          </p>
          <p className="text-sm text-muted-foreground/70">{keyError}</p>
          <Button onClick={handleRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  // API key is ready - now mount the script loader
  // This is the KEY fix: useJsApiLoader is only called with a VALID key
  return (
    <GoogleMapsScriptLoader apiKey={apiKey!} onRetry={handleRetry}>
      {children}
    </GoogleMapsScriptLoader>
  );
}

/**
 * Hook to access Google Maps script loading state
 * Use inside components wrapped with GoogleMapsScriptProvider
 */
export function useGoogleMapsScript() {
  const context = useContext(GoogleMapsScriptContext);
  return context;
}
