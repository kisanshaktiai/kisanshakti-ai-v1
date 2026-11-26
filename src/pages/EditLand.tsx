import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { GoogleMapsScriptProvider } from '@/components/maps/GoogleMapsScriptProvider';
import { GoogleMapBoundaryDrawer } from '@/components/land/GoogleMapBoundaryDrawer';
import { EditLandWizard } from '@/components/land/EditLandWizard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { landsApi } from '@/services/landsApi';

interface LatLng {
  lat: number;
  lng: number;
}

export default function EditLand() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { user } = useAuthStore();
  
  const [showMap, setShowMap] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [boundary, setBoundary] = useState<LatLng[]>([]);
  const [area, setArea] = useState({ sqft: 0, guntha: 0, acres: 0 });
  const [initialCenter, setInitialCenter] = useState<LatLng | undefined>(undefined);
  const [landData, setLandData] = useState<any>(null);
  const [loadingLand, setLoadingLand] = useState(true);

  // Load existing land data
  useEffect(() => {
    const loadLandData = async () => {
      if (!id) return;
      
      try {
        // Use the API service to fetch land data
        const data = await landsApi.fetchLandById(id);

        // Handle case when land is not found
        if (!data) {
          console.log('Land not found with ID:', id);
          toast({
            title: 'Warning',
            description: 'Land not found. It may have been deleted or you may not have permission to view it.',
            variant: 'destructive',
          });
          navigate('/app/lands');
          return;
        }
        
        setLandData(data);
        
        // Parse boundary from database
        let boundaryPoints: LatLng[] = [];
        if (data.boundary_polygon_old && typeof data.boundary_polygon_old === 'object' && 'coordinates' in data.boundary_polygon_old) {
          const polygonData = data.boundary_polygon_old as any;
          if (polygonData.coordinates?.[0]) {
            const coords = polygonData.coordinates[0];
            boundaryPoints = coords.map((coord: number[]) => ({
              lng: coord[0],
              lat: coord[1]
            }));
            // Remove last point if it's a duplicate of first (closing point)
            if (boundaryPoints.length > 1 && 
                boundaryPoints[0].lat === boundaryPoints[boundaryPoints.length - 1].lat &&
                boundaryPoints[0].lng === boundaryPoints[boundaryPoints.length - 1].lng) {
              boundaryPoints.pop();
            }
            setBoundary(boundaryPoints);
          }
        }
        
        // Set area
        setArea({
          acres: data.area_acres || 0,
          guntha: data.area_guntas || 0,
          sqft: (data.area_acres || 0) * 43560
        });
        
        // IMPORTANT: Center map on the boundary, not GPS location
        // Calculate center from boundary points if boundary exists
        if (boundaryPoints.length > 0) {
          const sumLat = boundaryPoints.reduce((sum, point) => sum + point.lat, 0);
          const sumLng = boundaryPoints.reduce((sum, point) => sum + point.lng, 0);
          setInitialCenter({
            lat: sumLat / boundaryPoints.length,
            lng: sumLng / boundaryPoints.length
          });
        } else if (data.center_point_old && typeof data.center_point_old === 'object' && 'coordinates' in data.center_point_old) {
          // Fall back to saved center point only if no boundary
          const centerData = data.center_point_old as any;
          setInitialCenter({
            lng: centerData.coordinates[0],
            lat: centerData.coordinates[1]
          });
        }
        
        // Show map with preloaded boundary
        setShowMap(true);
      } catch (error) {
        console.error('Error loading land:', error);
        toast({
          title: 'Error',
          description: 'Failed to load land details. Please try again.',
          variant: 'destructive',
        });
        navigate('/app/lands');
      } finally {
        setLoadingLand(false);
      }
    };

    loadLandData();
  }, [id, navigate, toast]);

  const handleMapSave = (boundaryPoints: LatLng[], calculatedArea: typeof area) => {
    setBoundary(boundaryPoints);
    setArea(calculatedArea);
    setShowMap(false);
    setShowForm(true);
  };

  const handleFormComplete = () => {
    // The ModernLandWizard will handle the save internally
    // We just need to navigate back after completion
    navigate('/app/lands');
  };

  const handleCancel = () => {
    navigate('/app/lands');
  };

  // Loading land data state
  if (loadingLand) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
        <Card className="p-6 space-y-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">{t('lands.edit.loading')}</p>
        </Card>
      </div>
    );
  }

  // Show map with preloaded boundary for editing - wrapped with GoogleMapsScriptProvider
  if (showMap && !showForm) {
    return (
      <GoogleMapsScriptProvider>
        <div className="fixed inset-0 z-[60] bg-background">
          {/* The map fills the screen; its own top bar carries the land's name and the back button. */}
          <div className="h-full">
            <GoogleMapBoundaryDrawer
              onSave={handleMapSave}
              onCancel={handleCancel}
              initialCenter={initialCenter}
              initialBoundary={boundary}
              title={landData?.name ? t('lands.edit.title', { name: landData.name }) : undefined}
            />
          </div>
        </div>
      </GoogleMapsScriptProvider>
    );
  }

  // Show form for editing other details
  if (showForm) {
    return (
      <EditLandWizard
        landId={id!}
        boundary={boundary}
        area={area}
        existingData={landData}
        onComplete={handleFormComplete}
        onCancel={handleCancel}
      />
    );
  }

  // Default state - shouldn't reach here
  return null;
}