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
  height: '100%',
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
  const [isCentering, setIsCentering] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // Map options - enable rotation and tilt
  const mapOptions: google.maps.MapOptions = {
    mapTypeId: 'hybrid', // Shows satellite with village/place names
    disableDefaultUI: false,
    zoomControl: true,
    zoomControlOptions: {
      position: typeof google !== 'undefined' ? google.maps.ControlPosition.RIGHT_CENTER : 7,
    },
    gestureHandling: 'greedy',
    tilt: 45,
    rotateControl: true,
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: true,
    scaleControl: true,
  };

  // Get user's current location on mount with better error handling
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
          console.warn('Location access denied or unavailable:', error.message);
          // Set default location if geolocation fails
          const defaultCenter = { lat: 18.5204, lng: 73.8567 }; // Pune, Maharashtra
          setCenter(defaultCenter);
          setCurrentPosition(defaultCenter);
          
          if (map) {
            map.panTo(defaultCenter);
            map.setZoom(18);
          }
          
          toast({
            title: "Location Access",
            description: "Using default location. Enable GPS for accurate positioning.",
            variant: "default",
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
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
          guntha: Math.round(areaInGuntha * 100) / 100,
          acres: Math.round(areaInAcres * 100) / 100,
        });
      } catch (error) {
        console.error('Error calculating area:', error);
      }
    } else {
      setArea({ sqft: 0, guntha: 0, acres: 0 });
    }
  }, [boundary]);

  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    
    // Pan to current position if available
    if (currentPosition) {
      mapInstance.panTo(currentPosition);
      mapInstance.setZoom(18);
    }
  }, [currentPosition]);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (mode !== 'draw' || !e.latLng) return;
    
    const newPoint: LatLng = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };
    
    setBoundary(prev => [...prev, newPoint]);
  }, [mode]);

  const handleUndo = useCallback(() => {
    setBoundary(prev => prev.slice(0, -1));
  }, []);

  const handleDeleteAll = useCallback(() => {
    setBoundary([]);
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
    
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const newPoint: LatLng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        
        setCurrentPosition(newPoint);
        setGpsAccuracy(position.coords.accuracy);
        setBoundary(prev => [...prev, newPoint]);
        
        if (map) {
          map.panTo(newPoint);
        }
      },
      (error) => {
        console.error('GPS error:', error);
        toast({
          title: "GPS Error",
          description: "Failed to get GPS location. Please check your settings.",
          variant: "destructive",
        });
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
    
    watchIdRef.current = id;
  }, [map, toast]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const handleToggleTracking = useCallback(() => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  }, [isTracking, startTracking, stopTracking]);

  const handleSave = useCallback(() => {
    console.log('handleSave called', { boundary, area });
    if (boundary.length < 3) {
      toast({
        title: "Invalid Boundary",
        description: "Please mark at least 3 points to define your land boundary.",
        variant: "destructive",
      });
      return;
    }
    
    console.log('Calling onSave with:', boundary, area);
    onSave(boundary, area);
  }, [boundary, area, onSave, toast]);

  // Get theme colors from CSS variables
  const getThemeColor = (varName: string, fallback: string): string => {
    const root = document.documentElement;
    const cssVar = getComputedStyle(root).getPropertyValue(varName).trim();
    if (cssVar) {
      // Convert HSL to hex for Google Maps
      const [h, s, l] = cssVar.split(' ').map(v => parseFloat(v));
      return hslToHex(h, s, l);
    }
    return fallback;
  };

  // Helper to convert HSL to hex
  const hslToHex = (h: number, s: number, l: number): string => {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    
    if (0 <= h && h < 60) {
      r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
      r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
      r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
      r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
      r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
      r = c; g = 0; b = x;
    }
    
    const toHex = (n: number) => {
      const hex = Math.round((n + m) * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const polygonOptions = {
    fillColor: getThemeColor('--polygon-fill', '#10b981'),
    fillOpacity: 0.35,
    strokeColor: getThemeColor('--polygon-stroke', '#10b981'),
    strokeOpacity: 1,
    strokeWeight: 2,
    clickable: false,
    draggable: false,
    editable: false,
    geodesic: false,
    zIndex: 1,
  };

  const polylineOptions = {
    strokeColor: getThemeColor('--tracking-stroke', '#10b981'),
    strokeOpacity: 1,
    strokeWeight: 2,
    clickable: false,
    draggable: false,
    editable: false,
    geodesic: false,
    zIndex: 1,
  };

  // Create marker icon conditionally only when google is available
  const getCurrentPositionIcon = () => {
    if (typeof google !== 'undefined' && google.maps) {
      return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: getThemeColor('--tracking-fill', '#4285F4'),
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      };
    }
    return undefined;
  };

  const getMarkerIcon = () => {
    if (typeof google !== 'undefined' && google.maps) {
      return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: getThemeColor('--marker-color', '#ef4444'),
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      };
    }
    return undefined;
  };

  // GPS center button handler
  const handleCenterOnLocation = useCallback(() => {
    if (navigator.geolocation && map) {
      setIsCentering(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCurrentPosition(pos);
          setGpsAccuracy(position.coords.accuracy);
          map.setCenter(pos);
          map.setZoom(18);
          setIsCentering(false);
          
          toast({
            title: "Location Updated",
            description: `GPS Accuracy: ${Math.round(position.coords.accuracy)}m`,
          });
        },
        (error) => {
          setIsCentering(false);
          toast({
            title: "Location Error",
            description: "Could not get current location",
            variant: "destructive",
          });
        },
        { 
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    }
  }, [map, toast]);

  return (
    <div className="relative w-full h-full">
      {/* GPS Accuracy Button */}
      <button
        onClick={handleCenterOnLocation}
        className="absolute top-20 right-4 z-10 p-3 bg-background rounded-full shadow-lg hover:shadow-xl transition-shadow"
        disabled={isCentering}
      >
        {isCentering ? (
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
        ) : (
          <div className="relative">
            <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
            {gpsAccuracy > 0 && (
              <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs bg-background px-1 rounded whitespace-nowrap">
                {Math.round(gpsAccuracy)}m
              </div>
            )}
          </div>
        )}
      </button>

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={18}
        options={mapOptions}
        onClick={handleMapClick}
        onLoad={onLoad}
      >
        {/* Current position marker - only render if google is loaded */}
        {currentPosition && typeof google !== 'undefined' && (
          <Marker
            position={currentPosition}
            icon={getCurrentPositionIcon()}
          />
        )}

        {/* Boundary markers - only render if google is loaded */}
        {typeof google !== 'undefined' && boundary.map((point, index) => (
          <Marker
            key={index}
            position={point}
            label={{
              text: (index + 1).toString(),
              color: 'white',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
            icon={getMarkerIcon()}
          />
        ))}

        {/* Polygon or Polyline - only render if google is loaded */}
        {typeof google !== 'undefined' && boundary.length >= 3 ? (
          <Polygon
            paths={boundary}
            options={polygonOptions}
          />
        ) : boundary.length >= 2 && typeof google !== 'undefined' ? (
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
        onDeleteAll={handleDeleteAll}
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