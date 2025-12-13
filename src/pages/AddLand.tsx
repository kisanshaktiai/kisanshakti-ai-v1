import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGoogleMapsApi } from '@/hooks/useGoogleMapsApi';
import { GoogleMapBoundaryDrawer } from '@/components/land/GoogleMapBoundaryDrawer';
import { ModernLandWizard } from '@/components/land/ModernLandWizard';
import { LandInstructionDialog } from '@/components/land/LandInstructionDialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, MapPin, RefreshCw, AlertTriangle, Wifi, WifiOff } from 'lucide-react';

interface LatLng {
  lat: number;
  lng: number;
}

export default function AddLand() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isLoaded, loadError, isLoading, retry } = useGoogleMapsApi();
  
  const [showInstructions, setShowInstructions] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [boundary, setBoundary] = useState<LatLng[]>([]);
  const [area, setArea] = useState({ sqft: 0, guntha: 0, acres: 0 });
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
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 15;
        });
      }, 500);
      return () => clearInterval(interval);
    } else if (isLoaded) {
      setLoadingProgress(100);
    }
  }, [isLoading, isLoaded]);

  const handleInstructionStart = () => {
    setShowInstructions(false);
    setShowMap(true);
  };

  const handleInstructionClose = () => {
    navigate('/app/lands');
  };

  const handleMapSave = (boundaryPoints: LatLng[], calculatedArea: typeof area) => {
    console.log('Map boundary saved:', { boundaryPoints, calculatedArea });
    setBoundary(boundaryPoints);
    setArea(calculatedArea);
    setShowMap(false);
    setShowForm(true);
  };

  const handleFormComplete = () => {
    navigate('/app/lands');
  };

  const handleCancel = () => {
    navigate('/app/lands');
  };

  // Loading state with animated progress and offline indicator
  if (isLoading || !isLoaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
        <Card className="p-8 space-y-6 text-center max-w-sm mx-4">
          <div className="relative">
            <div className="h-20 w-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="h-10 w-10 text-primary animate-pulse" />
            </div>
            {/* Online/Offline indicator */}
            <div className={`absolute -top-1 -right-1 p-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-amber-500'}`}>
              {isOnline ? (
                <Wifi className="h-3 w-3 text-white" />
              ) : (
                <WifiOff className="h-3 w-3 text-white" />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground">
              {t('lands.add_land.loading.maps', 'Loading Map...')}
            </p>
            <p className="text-sm text-muted-foreground">
              {!isOnline 
                ? t('lands.add_land.loading.offline', 'Working offline - using cached data')
                : t('lands.add_land.loading.location', 'Getting your location...')}
            </p>
          </div>
          <Progress value={loadingProgress} className="h-2" />
          
          {/* Retry button after 5 seconds */}
          {isLoading && loadingProgress > 50 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={retry}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {t('common.retry', 'Retry')}
            </Button>
          )}
        </Card>
      </div>
    );
  }

  // Error state with retry button
  if (loadError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4 z-50">
        <Card className="p-6 max-w-md w-full space-y-4 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-destructive">
            {t('lands.add_land.error.maps_failed.title', 'Map Loading Failed')}
          </h2>
          <p className="text-muted-foreground">
            {t('lands.add_land.error.maps_failed.message', 'Unable to load Google Maps. Please check your internet connection and try again.')}
          </p>
          <p className="text-sm text-muted-foreground/70">{loadError}</p>
          <div className="flex gap-3 justify-center pt-2">
            <Button variant="outline" onClick={() => navigate('/app/lands')}>
              Go Back
            </Button>
            <Button onClick={retry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Show instructions dialog first
  if (showInstructions) {
    return (
      <LandInstructionDialog
        open={showInstructions}
        onClose={handleInstructionClose}
        onStart={handleInstructionStart}
      />
    );
  }

  // Show form if boundary is drawn
  if (showForm) {
    return (
      <ModernLandWizard
        boundary={boundary}
        area={area}
        onComplete={handleFormComplete}
        onCancel={() => setShowForm(false)}
      />
    );
  }

  // Show map for drawing boundary
  if (showMap) {
    return (
      <div className="fixed inset-0 z-[60] bg-background">
        <GoogleMapBoundaryDrawer
          onSave={handleMapSave}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return null;
}