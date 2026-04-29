import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoogleMapsScriptProvider } from '@/components/maps/GoogleMapsScriptProvider';
import { GoogleMapBoundaryDrawer } from '@/components/land/GoogleMapBoundaryDrawer';
import { ModernLandWizard } from '@/components/land/ModernLandWizard';
import { SmartLandConfirmCard } from '@/components/land/SmartLandConfirmCard';
import { LandInstructionDialog } from '@/components/land/LandInstructionDialog';

// Feature flag: when true, use the AI-prefilled single-screen confirm card.
// Falls back to the legacy 4-step wizard via localStorage override
// `localStorage.setItem('smartLandConfirm', 'off')` for emergency rollback.
const USE_SMART_CONFIRM =
  typeof window === 'undefined'
    ? true
    : window.localStorage.getItem('smartLandConfirm') !== 'off';


interface LatLng {
  lat: number;
  lng: number;
}

export default function AddLand() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [showInstructions, setShowInstructions] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [boundary, setBoundary] = useState<LatLng[]>([]);
  const [area, setArea] = useState({ sqft: 0, guntha: 0, acres: 0 });

  // Mark <body> while the map drawer is open so any residual app overlays
  // (FABs, banners) can opt out via CSS: body[data-fullscreen="map"] { ... }
  useEffect(() => {
    if (showMap) {
      document.body.dataset.fullscreen = 'map';
      return () => {
        delete document.body.dataset.fullscreen;
      };
    }
  }, [showMap]);

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
    if (USE_SMART_CONFIRM) {
      return (
        <SmartLandConfirmCard
          boundary={boundary}
          area={area}
          onComplete={handleFormComplete}
          onCancel={() => setShowForm(false)}
        />
      );
    }
    return (
      <ModernLandWizard
        boundary={boundary}
        area={area}
        onComplete={handleFormComplete}
        onCancel={() => setShowForm(false)}
      />
    );
  }

  // Show map for drawing boundary - wrapped with GoogleMapsScriptProvider
  if (showMap) {
    return (
      <GoogleMapsScriptProvider>
        <div className="fixed inset-0 z-[60] bg-background">
          <GoogleMapBoundaryDrawer
            onSave={handleMapSave}
            onCancel={handleCancel}
          />
        </div>
      </GoogleMapsScriptProvider>
    );
  }

  return null;
}