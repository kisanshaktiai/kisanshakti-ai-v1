import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useGoogleMapsApi } from '@/hooks/useGoogleMapsApi';
import { GoogleMapBoundaryDrawer } from '@/components/land/GoogleMapBoundaryDrawer';
import { LandFormDialog } from '@/components/land/LandFormDialog';
import { LandInstructionDialog } from '@/components/land/LandInstructionDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface LatLng {
  lat: number;
  lng: number;
}

export default function AddLand() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { isLoaded, loadError, isLoading } = useGoogleMapsApi();
  
  const [showForm, setShowForm] = useState(false);
  const [boundary, setBoundary] = useState<LatLng[]>([]);
  const [area, setArea] = useState({ sqft: 0, guntha: 0, acres: 0 });
  const [showInstructions, setShowInstructions] = useState(true);
  const [centerCoordinates, setCenterCoordinates] = useState({ lat: 0, lng: 0 });

  // Debug log for state changes
  console.log('AddLand render - showForm:', showForm, 'boundary:', boundary.length, 'area:', area);

  const handleMapSave = (boundaryPoints: LatLng[], calculatedArea: typeof area) => {
    console.log('handleMapSave called', { boundaryPoints, calculatedArea });
    
    // Validate boundary points
    if (!boundaryPoints || boundaryPoints.length < 3) {
      toast({
        title: 'Invalid Boundary',
        description: 'Please draw at least 3 points to create a valid boundary',
        variant: 'destructive',
      });
      return;
    }
    
    setBoundary(boundaryPoints);
    setArea(calculatedArea);
    
    // Calculate center coordinates for the boundary
    if (boundaryPoints.length > 0) {
      const sumLat = boundaryPoints.reduce((sum, point) => sum + point.lat, 0);
      const sumLng = boundaryPoints.reduce((sum, point) => sum + point.lng, 0);
      setCenterCoordinates({
        lat: sumLat / boundaryPoints.length,
        lng: sumLng / boundaryPoints.length
      });
    }
    
    console.log('Setting showForm to true');
    // Use setTimeout to ensure state update happens after render
    setTimeout(() => {
      setShowForm(true);
    }, 100);
  };

  const handleFormSubmit = async (formData: any) => {
    if (!user?.id || !user?.tenantId) {
      toast({
        title: 'Error',
        description: 'User session not found',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Get boundary points from formData (passed from the form)
      const boundaryPoints = formData.boundary || boundary;
      
      // Prepare the boundary polygon in GeoJSON format
      const coordinates = boundaryPoints.map((point: any) => [point.lng, point.lat]);
      // Close the polygon by adding the first point at the end
      if (coordinates.length > 0) {
        coordinates.push(coordinates[0]);
      }

      // Calculate center point
      const centerLat = boundaryPoints.reduce((sum: number, p: any) => sum + p.lat, 0) / boundaryPoints.length;
      const centerLng = boundaryPoints.reduce((sum: number, p: any) => sum + p.lng, 0) / boundaryPoints.length;

      const { error } = await supabase.from('lands').insert({
        farmer_id: user.id,
        tenant_id: user.tenantId,
        name: formData.name,
        survey_number: formData.survey_no || null,
        ownership_type: formData.ownership_type,
        area_acres: area.acres,
        area_guntas: area.guntha,
        soil_type: formData.soil_type || null,
        water_source: formData.water_source || null,
        current_crop: formData.current_crop || null,
        irrigation_type: formData.irrigation_type || null,
        planting_date: formData.cultivation_date ? formData.cultivation_date.toISOString().split('T')[0] : null,
        expected_harvest_date: formData.expected_harvest_date ? formData.expected_harvest_date.toISOString().split('T')[0] : null,
        last_crop: formData.last_crop || null,
        last_harvest_date: formData.last_harvest_date ? formData.last_harvest_date.toISOString().split('T')[0] : null,
        village: user?.village || '',
        taluka: user?.taluka || '',
        district: user?.district || '',
        state: user?.state || '',
        boundary_polygon_old: {
          type: 'Polygon',
          coordinates: [coordinates]
        },
        center_point_old: {
          type: 'Point',
          coordinates: [centerLng, centerLat]
        },
        boundary_method: 'google_maps',
        gps_accuracy_meters: 10, // Default accuracy
        gps_recorded_at: new Date().toISOString(),
        is_active: true,
        notes: formData.notes || null,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Land added successfully',
      });

      navigate('/app/lands');
    } catch (error) {
      console.error('Error adding land:', error);
      toast({
        title: 'Error',
        description: 'Failed to add land',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleCancel = () => {
    navigate('/app/lands');
  };

  // Loading state
  if (isLoading || !isLoaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
        <Card className="p-6 space-y-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading Google Maps...</p>
        </Card>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4 z-50">
        <Card className="p-6 max-w-md w-full space-y-4">
          <h2 className="text-xl font-semibold text-destructive">Failed to Load Maps</h2>
          <p className="text-muted-foreground">
            {loadError === 'User not authenticated' 
              ? 'Please sign in to add land parcels.'
              : 'Could not load Google Maps. Please check your internet connection and try again.'}
          </p>
          <Button onClick={() => navigate('/app/lands')} className="w-full">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Lands
          </Button>
        </Card>
      </div>
    );
  }

  // Show instruction dialog first, then fullscreen map
  if (showInstructions) {
    return (
      <>
        <div className="min-h-screen bg-background p-4 flex items-center justify-center">
          <Card className="max-w-md p-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Preparing map...</p>
          </Card>
        </div>
        <LandInstructionDialog
          open={showInstructions}
          onClose={() => navigate('/app/lands')}
          onStart={() => setShowInstructions(false)}
        />
      </>
    );
  }

  // Main map view - fullscreen without header and bottom navigation
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-background">
        <GoogleMapBoundaryDrawer
          onSave={handleMapSave}
          onCancel={handleCancel}
        />
      </div>
      
      <LandFormDialog
        open={showForm}
        onClose={() => {
          console.log('Closing form dialog');
          setShowForm(false);
        }}
        onSubmit={async (formData) => {
          console.log('Form submitted with data:', formData);
          await handleFormSubmit(formData);
          setShowForm(false);
        }}
        area={area}
        centerCoordinates={centerCoordinates}
        boundary={boundary}
      />
    </>
  );
}