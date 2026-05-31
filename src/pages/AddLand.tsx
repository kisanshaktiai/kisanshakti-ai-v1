import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoogleMapsScriptProvider } from '@/components/maps/GoogleMapsScriptProvider';
import { GoogleMapBoundaryDrawer } from '@/components/land/GoogleMapBoundaryDrawer';
import { ModernLandWizard } from '@/components/land/ModernLandWizard';
import { SmartLandConfirmCard } from '@/components/land/SmartLandConfirmCard';
import { LandInstructionDialog } from '@/components/land/LandInstructionDialog';
import { useEntitlements } from '@/hooks/useEntitlements';
import { toast } from '@/hooks/use-toast';

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
  const { lands: landsEntitlement, isReady } = useEntitlements();

  // ─── Land quota guard ────────────────────────────────────────────────
  // Block deep-link / direct navigation when farmer is at or over their plan
  // limit. The button-level disable happens via <LandLimitGuard>; this is the
  // last-line client-side defense before the server trigger raises.
  useEffect(() => {
    if (isReady && !landsEntitlement.allowed) {
      toast({
        title: t('lands.quota_title', 'Land limit reached'),
        description: t('lands.quota_body_short', {
          defaultValue: 'You have used {{used}}/{{limit}} lands. Upgrade to add more.',
          used: landsEntitlement.used,
          limit: landsEntitlement.limit ?? 0,
        }),
        variant: 'destructive',
      });
      navigate('/app/lands', { replace: true });
    }
  }, [isReady, landsEntitlement.allowed, landsEntitlement.used, landsEntitlement.limit, navigate, t]);

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