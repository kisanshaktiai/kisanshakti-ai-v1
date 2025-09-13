import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

export default function EditLand() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { isLoaded, loadError, isLoading } = useGoogleMapsApi();
  
  const [showForm, setShowForm] = useState(false);
  const [boundary, setBoundary] = useState<LatLng[]>([]);
  const [area, setArea] = useState({ sqft: 0, guntha: 0, acres: 0 });
  const [centerCoordinates, setCenterCoordinates] = useState({ lat: 0, lng: 0 });
  const [landData, setLandData] = useState<any>(null);
  const [loadingLand, setLoadingLand] = useState(true);

  // Load existing land data
  useEffect(() => {
    const loadLandData = async () => {
      if (!id || !user?.id) return;
      
      try {
        const { data, error } = await supabase
          .from('lands')
          .select('*')
          .eq('id', id)
          .eq('farmer_id', user.id)
          .single();

        if (error) throw error;
        
        setLandData(data);
        
        // Parse boundary from database
        if (data.boundary_polygon_old && typeof data.boundary_polygon_old === 'object' && 'coordinates' in data.boundary_polygon_old) {
          const polygonData = data.boundary_polygon_old as any;
          if (polygonData.coordinates?.[0]) {
            const coords = polygonData.coordinates[0];
            const boundaryPoints = coords.map((coord: number[]) => ({
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
        
        // Set center
        if (data.center_point_old && typeof data.center_point_old === 'object' && 'coordinates' in data.center_point_old) {
          const centerData = data.center_point_old as any;
          setCenterCoordinates({
            lng: centerData.coordinates[0],
            lat: centerData.coordinates[1]
          });
        }
        
        setShowForm(true);
      } catch (error) {
        console.error('Error loading land:', error);
        toast({
          title: 'Error',
          description: 'Failed to load land details',
          variant: 'destructive',
        });
        navigate('/app/lands');
      } finally {
        setLoadingLand(false);
      }
    };

    loadLandData();
  }, [id, user, navigate, toast]);

  const handleMapSave = (boundaryPoints: LatLng[], calculatedArea: typeof area) => {
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
    
    setShowForm(true);
  };

  const handleFormSubmit = async (formData: any) => {
    if (!user?.id || !user?.tenantId || !id) {
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

      // Get location names from the IDs
      let stateName = '', districtName = '', talukaName = '', villageName = '';
      
      if (formData.state_id) {
        const { data } = await supabase
          .from('states')
          .select('name')
          .eq('id', formData.state_id)
          .single();
        stateName = data?.name || '';
      }
      
      if (formData.district_id) {
        const { data } = await supabase
          .from('districts')
          .select('name')
          .eq('id', formData.district_id)
          .single();
        districtName = data?.name || '';
      }
      
      if (formData.taluka_id) {
        const { data } = await supabase
          .from('talukas')
          .select('name')
          .eq('id', formData.taluka_id)
          .single();
        talukaName = data?.name || '';
      }
      
      if (formData.village_id) {
        const { data } = await supabase
          .from('villages')
          .select('name')
          .eq('id', formData.village_id)
          .single();
        villageName = data?.name || '';
      }

      const { error } = await supabase
        .from('lands')
        .update({
          name: formData.name,
          survey_number: formData.survey_no || null,
          ownership_type: formData.ownership_type,
          area_acres: area.acres,
          area_guntas: area.guntha,
          soil_type: formData.soil_type || null,
          water_source: formData.water_source || null,
          irrigation_type: formData.irrigation_type || null,
          // Store location IDs
          state_id: formData.state_id || null,
          district_id: formData.district_id || null,
          taluka_id: formData.taluka_id || null,
          village_id: formData.village_id || null,
          // Store location names for display
          state: stateName,
          district: districtName,
          taluka: talukaName,
          village: villageName,
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
          notes: formData.notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Land updated successfully',
      });

      navigate('/app/lands');
    } catch (error) {
      console.error('Error updating land:', error);
      toast({
        title: 'Error',
        description: 'Failed to update land',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleCancel = () => {
    navigate('/app/lands');
  };

  // Loading state
  if (isLoading || !isLoaded || loadingLand) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
        <Card className="p-6 space-y-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading land details...</p>
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
              ? 'Please sign in to edit land parcels.'
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

  // If we want to allow editing the boundary
  if (!showForm && boundary.length > 0) {
    return (
      <>
        <div className="fixed inset-0 z-[60] bg-background">
          <GoogleMapBoundaryDrawer
            onSave={handleMapSave}
            onCancel={handleCancel}
          />
        </div>
      </>
    );
  }

  // Show form directly for editing other details
  return (
    <LandFormDialog
      open={showForm}
      onClose={() => navigate('/app/lands')}
      onSubmit={async (formData) => {
        await handleFormSubmit(formData);
        setShowForm(false);
      }}
      area={area}
      centerCoordinates={centerCoordinates}
      boundary={boundary}
      existingLandId={id}
    />
  );
}