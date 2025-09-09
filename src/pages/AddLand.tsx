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

  const handleMapSave = (boundaryPoints: LatLng[], calculatedArea: typeof area) => {
    setBoundary(boundaryPoints);
    setArea(calculatedArea);
    setShowForm(true);
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
      // Prepare the boundary polygon in GeoJSON format
      const coordinates = boundary.map(point => [point.lng, point.lat]);
      // Close the polygon by adding the first point at the end
      if (coordinates.length > 0) {
        coordinates.push(coordinates[0]);
      }

      // Calculate center point
      const centerLat = boundary.reduce((sum, p) => sum + p.lat, 0) / boundary.length;
      const centerLng = boundary.reduce((sum, p) => sum + p.lng, 0) / boundary.length;

      const { error } = await supabase.from('lands').insert({
        farmer_id: user.id,
        tenant_id: user.tenantId,
        name: formData.local_name,
        survey_number: formData.gat_number || null,
        ownership_type: formData.ownership_type,
        area_acres: area.acres,
        area_guntas: area.guntha,
        soil_type: formData.soil_type || null,
        water_source: formData.water_source || null,
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
      <div className="fixed inset-0 flex items-center justify-center bg-background">
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
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
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

  return (
    <div className="fixed inset-0 bg-background">
      <div className="absolute inset-0 top-14">
        <GoogleMapBoundaryDrawer
          onSave={handleMapSave}
          onCancel={handleCancel}
        />
      </div>
      
      <LandFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleFormSubmit}
        area={area}
      />
    </div>
  );
}