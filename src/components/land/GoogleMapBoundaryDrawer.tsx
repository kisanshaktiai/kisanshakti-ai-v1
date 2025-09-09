import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, Marker, Polygon, Polyline } from '@react-google-maps/api';
import * as turf from '@turf/turf';
import { MapControls } from './MapControls';
import { AreaDisplay } from './AreaDisplay';
import { useToast } from '@/components/ui/use-toast';

interface LatLng {
  lat: number;
  lng: number;
}

interface GoogleMapBoundaryDrawerProps {
  onSave: (boundary: LatLng[], area: { sqft: number; guntha: number; acres: number }) => void;
  onCancel: () => void;
  initialCenter?: LatLng;
}

const mapContainerStyle = {
  width: '100%',
  height: '100vh',
};

const mapOptions: google.maps.MapOptions = {
  mapTypeId: 'satellite',
  disableDefaultUI: true,
  zoomControl: true,
  zoomControlOptions: {
    position: 7, // RIGHT_CENTER
  },
  gestureHandling: 'greedy',
  tilt: 0,
};

export function GoogleMapBoundaryDrawer({ 
  onSave, 
  onCancel,
  initialCenter 
}: GoogleMapBoundaryDrawerProps) {
  const { toast } = useToast();
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [center, setCenter] = useState<LatLng>(
    initialCenter || { lat: 20.5937, lng: 78.9629 } // Default to India center
  );
  const [boundary, setBoundary] = useState<LatLng[]>([]);
  const [mode, setMode] = useState<'draw' | 'walk'>('draw');
  const [isTracking, setIsTracking] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<LatLng | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number>(0);
  const [area, setArea] = useState({ sqft: 0, guntha: 0, acres: 0 });
  const watchIdRef = useRef<number | null>(null);

  // Get user's current location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newCenter = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCenter(newCenter);
          setCurrentPosition(newCenter);
          setGpsAccuracy(position.coords.accuracy);
          
          if (map) {
            map.panTo(newCenter);
            map.setZoom(18);
          }
        },
        (error) => {
          console.error('Error getting location:', error);
          toast({
            title: "Location Error",
            description: "Could not get your current location. Using default location.",
            variant: "destructive",
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    }
  }, [map, toast]);

  // Calculate area whenever boundary changes
  useEffect(() => {
    if (boundary.length >= 3) {
      try {
        // Create a polygon with the first point repeated at the end to close it
        const coordinates = [...boundary, boundary[0]].map(point => [point.lng, point.lat]);
        const polygon = turf.polygon([coordinates]);
        const areaInSqMeters = turf.area(polygon);
        
        // Convert to different units
        const areaInSqft = areaInSqMeters * 10.764;
        const areaInGuntha = areaInSqft / 1089;
        const areaInAcres = areaInSqft / 43560;
        
        setArea({
          sqft: Math.round(areaInSqft),
          guntha: areaInGuntha,
          acres: areaInAcres,
        });
      } catch (error) {
        console.error('Error calculating area:', error);
      }
    } else {
      setArea({ sqft: 0, guntha: 0, acres: 0 });
    }
  }, [boundary]);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (mode === 'draw' && e.latLng) {
      const newPoint = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng(),
      };
      setBoundary(prev => [...prev, newPoint]);
    }
  }, [mode]);

  const handleUndo = useCallback(() => {
    setBoundary(prev => prev.slice(0, -1));
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast({
        title: "GPS Not Available",
        description: "Your device doesn't support GPS tracking.",
        variant: "destructive",
      });
      return;
    }

    setIsTracking(true);
    
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        
        setCurrentPosition(newPoint);
        setGpsAccuracy(position.coords.accuracy);
        
        // Add point to boundary
        setBoundary(prev => {
          // Avoid adding duplicate points too close together
          if (prev.length > 0) {
            const lastPoint = prev[prev.length - 1];
            const distance = turf.distance(
              [lastPoint.lng, lastPoint.lat],
              [newPoint.lng, newPoint.lat],
              { units: 'meters' }
            );
            
            // Only add if moved more than 5 meters
            if (distance < 5) {
              return prev;
            }
          }
          return [...prev, newPoint];
        });
        
        // Pan map to new position
        if (map) {
          map.panTo(newPoint);
        }
      },
      (error) => {
        console.error('GPS tracking error:', error);
        toast({
          title: "GPS Error",
          description: "Could not track your position. Please try again.",
          variant: "destructive",
        });
        stopTracking();
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  }, [map, toast]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  const handleToggleTracking = useCallback(() => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  }, [isTracking, startTracking, stopTracking]);

  const handleSave = useCallback(() => {
    if (boundary.length < 3) {
      toast({
        title: "Invalid Boundary",
        description: "Please mark at least 3 points to define your land boundary.",
        variant: "destructive",
      });
      return;
    }
    
    onSave(boundary, area);
  }, [boundary, area, onSave, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
    map.setZoom(18);
  }, []);

  const polygonOptions = {
    fillColor: 'hsl(var(--primary))',
    fillOpacity: 0.3,
    strokeColor: 'hsl(var(--primary))',
    strokeOpacity: 1,
    strokeWeight: 2,
    clickable: false,
    draggable: false,
    editable: false,
    geodesic: false,
    zIndex: 1,
  };

  const polylineOptions = {
    strokeColor: 'hsl(var(--primary))',
    strokeOpacity: 1,
    strokeWeight: 2,
    clickable: false,
    draggable: false,
    editable: false,
    geodesic: false,
    zIndex: 1,
  };

  return (
    <div className="relative w-full h-screen">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={18}
        options={mapOptions}
        onClick={handleMapClick}
        onLoad={onLoad}
      >
        {/* Current position marker */}
        {currentPosition && (
          <Marker
            position={currentPosition}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#4285F4',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            }}
          />
        )}

        {/* Boundary markers */}
        {boundary.map((point, index) => (
          <Marker
            key={index}
            position={point}
            label={{
              text: (index + 1).toString(),
              color: 'white',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          />
        ))}

        {/* Draw polygon if 3+ points, otherwise polyline */}
        {boundary.length >= 3 ? (
          <Polygon
            paths={boundary}
            options={polygonOptions}
          />
        ) : boundary.length >= 2 ? (
          <Polyline
            path={boundary}
            options={polylineOptions}
          />
        ) : null}
      </GoogleMap>

      <AreaDisplay area={area} pointsCount={boundary.length} />

      <MapControls
        mode={mode}
        onModeChange={setMode}
        onUndo={handleUndo}
        onSave={handleSave}
        onCancel={onCancel}
        canUndo={boundary.length > 0}
        canSave={boundary.length >= 3}
        isTracking={isTracking}
        onToggleTracking={mode === 'walk' ? handleToggleTracking : undefined}
        gpsAccuracy={gpsAccuracy}
      />
    </div>
  );
}