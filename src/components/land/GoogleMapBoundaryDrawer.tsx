import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, Marker, Polygon, Polyline } from '@react-google-maps/api';
import * as turf from '@turf/turf';
import { MapControls } from './MapControls';
import { AreaDisplay } from './AreaDisplay';
import { useToast } from '@/components/ui/use-toast';
import LocationService from '@/services/LocationService';
import { Card } from '@/components/ui/card';
import { Satellite, Navigation, MapPin } from 'lucide-react';

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
  const [isAccuracyInfoVisible, setIsAccuracyInfoVisible] = useState(false);
  const [locationSource, setLocationSource] = useState<string>('gps');
  const [locationAccuracy, setLocationAccuracy] = useState<number>(0);
  const watchIdRef = useRef<number | null>(null);

  // Map options - enable rotation and tilt with street labels
  const mapOptions: google.maps.MapOptions = {
    mapTypeId: 'hybrid', // Shows satellite with labels
    disableDefaultUI: false,
    zoomControl: true,
    zoomControlOptions: {
      position: typeof google !== 'undefined' ? google.maps.ControlPosition.RIGHT_CENTER : 7,
    },
    gestureHandling: 'greedy',
    tilt: 45,
    rotateControl: true,
    mapTypeControl: true,
    mapTypeControlOptions: {
      mapTypeIds: ['hybrid', 'roadmap', 'satellite', 'terrain'],
      position: typeof google !== 'undefined' ? google.maps.ControlPosition.TOP_LEFT : 1,
    },
    streetViewControl: false,
    fullscreenControl: false, // Hide fullscreen control
    scaleControl: true,
    styles: [
      {
        featureType: 'all',
        elementType: 'labels',
        stylers: [{ visibility: 'on' }]
      },
      {
        featureType: 'road',
        elementType: 'labels',
        stylers: [{ visibility: 'on' }]
      },
      {
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{ visibility: 'on' }]
      }
    ],
  };

  // Get user's current location on mount using LocationService
  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const location = await LocationService.getCurrentLocation();
        
        if (location) {
          const newCenter = {
            lat: location.lat,
            lng: location.lon,
          };
          setCenter(newCenter);
          setCurrentPosition(newCenter);
          setLocationAccuracy(location.accuracy);
          setLocationSource(location.source || 'gps');
          
          if (map) {
            map.panTo(newCenter);
            // Adjust zoom based on location source
            const zoom = location.source === 'gps' ? 18 : 
                        location.source === 'village' ? 16 :
                        location.source === 'taluka' ? 14 :
                        location.source === 'district' ? 12 : 10;
            map.setZoom(zoom);
          }
          
          // Show location source to user
          if (location.source && location.source !== 'gps') {
            toast({
              title: "Location Set",
              description: `Using ${location.approximateArea || location.source} location`,
            });
          }
        }
      } catch (error) {
        console.error('Error fetching location:', error);
        toast({
          title: "Location Error",
          description: "Could not determine your location",
          variant: "destructive",
        });
      }
    };
    
    fetchLocation();
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
              // Adjust zoom based on location accuracy
              const zoom = locationSource === 'gps' ? 18 : 
                          locationSource === 'village' ? 16 :
                          locationSource === 'taluka' ? 14 :
                          locationSource === 'district' ? 12 : 10;
              mapInstance.setZoom(zoom);
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
    fillColor: getThemeColor('--primary', 'hsl(var(--primary))'),
    fillOpacity: 0.35,
    strokeColor: getThemeColor('--primary', 'hsl(var(--primary))'),
    strokeOpacity: 1,
    strokeWeight: 2,
    clickable: false,
    draggable: false,
    editable: false,
    geodesic: false,
    zIndex: 1,
  };

  const polylineOptions = {
    strokeColor: getThemeColor('--primary', 'hsl(var(--primary))'),
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
        fillColor: getThemeColor('--accent', 'hsl(var(--accent))'),
        fillOpacity: 1,
        strokeColor: getThemeColor('--background', 'hsl(var(--background))'),
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
        fillColor: getThemeColor('--destructive', 'hsl(var(--destructive))'),
        fillOpacity: 1,
        strokeColor: getThemeColor('--background', 'hsl(var(--background))'),
        strokeWeight: 2,
      };
    }
    return undefined;
  };

  // GPS center button handler
  const handleCenterOnLocation = useCallback(async () => {
    if (map) {
      setIsCentering(true);
      try {
        const location = await LocationService.getCurrentLocation(true);
        
        if (location) {
          const pos = {
            lat: location.lat,
            lng: location.lon,
          };
          setCurrentPosition(pos);
          setLocationAccuracy(location.accuracy);
          setLocationSource(location.source || 'gps');
          map.setCenter(pos);
          
          // Adjust zoom based on location source
          const zoom = location.source === 'gps' ? 18 : 
                      location.source === 'village' ? 16 :
                      location.source === 'taluka' ? 14 :
                      location.source === 'district' ? 12 : 10;
          map.setZoom(zoom);
          
          toast({
            title: "Location Updated",
            description: location.source === 'gps' ? 
              `GPS Accuracy: ${Math.round(location.accuracy)}m` :
              `Using ${location.approximateArea || location.source} location`,
          });
        }
      } catch (error) {
        console.error('Error getting location:', error);
        toast({
          title: "Location Error",
          description: "Could not get current location",
          variant: "destructive",
        });
      } finally {
        setIsCentering(false);
      }
    }
  }, [map, toast]);

  return (
    <div className="relative w-full h-full">
      {/* Location button - bottom right like Google Maps */}
      <button
        onClick={handleCenterOnLocation}
        className="absolute bottom-24 right-3 h-10 w-10 bg-background/95 backdrop-blur-sm shadow-lg z-10 rounded-full flex items-center justify-center hover:bg-accent/10 transition-colors border border-border"
        disabled={isCentering}
      >
        {isCentering ? (
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
        ) : (
          <svg 
            className={`h-5 w-5 ${locationSource === 'gps' && locationAccuracy < 20 ? 'text-primary' : 'text-muted-foreground'}`} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
          </svg>
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