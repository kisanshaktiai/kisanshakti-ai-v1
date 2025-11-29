import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGoogleMapsApi } from '@/hooks/useGoogleMapsApi';
import { GoogleMapBoundaryDrawer } from '@/components/land/GoogleMapBoundaryDrawer';
import { ModernLandWizard } from '@/components/land/ModernLandWizard';
import { LandInstructionDialog } from '@/components/land/LandInstructionDialog';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, MapPin } from 'lucide-react';

interface LatLng {
  lat: number;
  lng: number;
}

export default function AddLand() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isLoaded, loadError, isLoading } = useGoogleMapsApi();
  
  const [showInstructions, setShowInstructions] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [boundary, setBoundary] = useState<LatLng[]>([]);
  const [area, setArea] = useState({ sqft: 0, guntha: 0, acres: 0 });

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

  // Loading state with animated skeleton
  if (isLoading || !isLoaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
        <Card className="p-8 space-y-6 text-center max-w-sm mx-4">
          <div className="relative">
            <div className="h-20 w-20 mx-auto rounded-full bg-primary/10 animate-pulse" />
            <MapPin className="absolute inset-0 m-auto h-8 w-8 text-primary animate-bounce" />
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground">{t('lands.add_land.loading.maps')}</p>
            <p className="text-sm text-muted-foreground">{t('lands.add_land.loading.location')}</p>
          </div>
          <Progress value={33} className="h-2" />
        </Card>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4 z-50">
        <Card className="p-6 max-w-md w-full space-y-4">
          <h2 className="text-xl font-semibold text-destructive">{t('lands.add_land.error.maps_failed.title')}</h2>
          <p className="text-muted-foreground">
            {t('lands.add_land.error.maps_failed.message')}
          </p>
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