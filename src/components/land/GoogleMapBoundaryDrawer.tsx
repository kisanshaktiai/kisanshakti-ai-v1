import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, Marker, Polygon, Polyline, LoadScript } from '@react-google-maps/api';
import * as turf from '@turf/turf';
import { MapControls } from './MapControls';
import { AreaDisplay } from './AreaDisplay';
import { useToast } from '@/components/ui/use-toast';
import LocationService from '@/services/LocationService';
import { Card } from '@/components/ui/card';
import { Satellite, Navigation, MapPin, Loader2, AlertCircle } from 'lucide-react';

interface LatLng {
  lat: number;
  lng: number;
}

interface GoogleMapBoundaryDrawerProps {
  onSave: (boundary: LatLng[], area: { sqft: number; guntha: number; acres: number }) => void;
  onCancel: () => void;
  initialCenter?: LatLng;
  initialBoundary?: LatLng[];
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

export function GoogleMapBoundaryDrawer({ 
  onSave, 
  onCancel,
  initialCenter,
  initialBoundary = []
}: GoogleMapBoundaryDrawerProps) {
  const { toast } = useToast();
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [center, setCenter] = useState<LatLng>(
    initialCenter || { lat: 20.5937, lng: 78.9629 } // Default to India center
  );
  const [boundary, setBoundary] = useState<LatLng[]>(initialBoundary);
  const [mode, setMode] = useState<'draw' | 'walk'>('draw');
  const [isTracking, setIsTracking] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<LatLng | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number>(0);
  const [area, setArea] = useState({ sqft: 0, guntha: 0, acres: 0 });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isCentering, setIsCentering] = useState(false);
  const [isAccuracyInfoVisible, setIsAccuracyInfoVisible] = useState(false);
  const [locationSource, setLocationSource] = useState<string>('gps');
  const [locationAccuracy, setLocationAccuracy] = useState<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const initialZoomSet = useRef(false);

  // Map options - enable rotation and tilt with street labels
  const mapOptions: google.maps.MapOptions = {
    mapTypeId: 'hybrid', // Shows satellite with labels
    disableDefaultUI: false,
    zoom: 18, // Start with a closer zoom for better visibility
    // Critical: Prevent ALL zoom on click/tap for smooth boundary marking
    disableDoubleClickZoom: true,
    scrollwheel: true, // Allow scroll wheel zoom on desktop
    // Disable clickable POIs to prevent interference with point marking
    clickableIcons: false,
    zoomControl: true, // Keep zoom buttons visible for farmers
    zoomControlOptions: {
      position: typeof google !== 'undefined' ? google.maps.ControlPosition.RIGHT_CENTER : 7,
    },
    // 'greedy' allows single finger pan on mobile (farmer-friendly)
    // Also prevents accidental zoom while marking points
    gestureHandling: 'greedy',
    tilt: 0, // Start with no tilt for easier drawing
    rotateControl: true,
    mapTypeControl: true,
    mapTypeControlOptions: {
      mapTypeIds: ['hybrid', 'satellite', 'roadmap', 'terrain'],
      position: typeof google !== 'undefined' ? google.maps.ControlPosition.TOP_LEFT : 1,
      style: typeof google !== 'undefined' ? google.maps.MapTypeControlStyle.HORIZONTAL_BAR : 0,
    },
    streetViewControl: false, // Disable street view to reduce clutter for farmers
    fullscreenControl: true,
    fullscreenControlOptions: {
      position: typeof google !== 'undefined' ? google.maps.ControlPosition.RIGHT_TOP : 3,
    },
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
      },
      {
        featureType: 'administrative',
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
          
          // Only pan if map is not yet initialized, never change zoom after init
          if (map && !isMapInitialized) {
            map.panTo(newCenter);
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
  }, [map, toast, isMapInitialized]);

  // Calculate area and validate boundary whenever boundary changes
  useEffect(() => {
    // Reset validation error
    setValidationError(null);

    if (boundary.length < 3) {
      setArea({ sqft: 0, guntha: 0, acres: 0 });
      if (boundary.length > 0) {
        setValidationError(`Need ${3 - boundary.length} more point${3 - boundary.length > 1 ? 's' : ''} to form a boundary`);
      }
      return;
    }

    try {
      // Close the polygon by adding the first point at the end if needed
      const closedBoundary = [...boundary];
      const firstPoint = boundary[0];
      const lastPoint = boundary[boundary.length - 1];
      
      if (firstPoint.lat !== lastPoint.lat || firstPoint.lng !== lastPoint.lng) {
        closedBoundary.push(firstPoint);
      }

      // Convert to GeoJSON polygon format for Turf
      const polygon = turf.polygon([
        closedBoundary.map(point => [point.lng, point.lat])
      ]);
      
      // Check for self-intersections using kinks
      const kinks = turf.kinks(polygon);
      if (kinks.features.length > 0) {
        setValidationError('⚠️ Boundary lines are crossing each other. Please adjust the points.');
        setArea({ sqft: 0, guntha: 0, acres: 0 });
        return;
      }
      
      // Calculate area in square meters
      const areaInSquareMeters = turf.area(polygon);
      
      // Convert to different units
      const sqft = areaInSquareMeters * 10.7639; // 1 sq meter = 10.7639 sq ft
      const guntha = sqft / 1089; // 1 guntha = 1089 sq ft
      const acres = sqft / 43560; // 1 acre = 43560 sq ft
      
      setArea({
        sqft: Math.round(sqft),
        guntha: Math.round(guntha * 100) / 100,
        acres: Math.round(acres * 100) / 100,
      });
    } catch (error) {
      console.error('Error calculating area:', error);
      setValidationError('Error calculating area. Please check your boundary points.');
      setArea({ sqft: 0, guntha: 0, acres: 0 });
    }
  }, [boundary]);

  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    console.log('Map loaded successfully');
    setMap(mapInstance);
    
    // Set initial map type to hybrid
    mapInstance.setMapTypeId('hybrid');
    
    // Only set zoom on the very first load
    if (!initialZoomSet.current && currentPosition) {
      mapInstance.panTo(currentPosition);
      const zoom = locationSource === 'gps' ? 18 : 
                  locationSource === 'village' ? 16 :
                  locationSource === 'taluka' ? 14 :
                  locationSource === 'district' ? 12 : 10;
      mapInstance.setZoom(zoom);
      initialZoomSet.current = true;
    } else if (!initialZoomSet.current) {
      // If no position, try to get location again (only on first load)
      LocationService.getCurrentLocation().then(location => {
        if (location) {
          const newCenter = {
            lat: location.lat,
            lng: location.lon,
          };
          mapInstance.panTo(newCenter);
          const zoom = location.source === 'gps' ? 18 : 
                      location.source === 'village' ? 16 :
                      location.source === 'taluka' ? 14 :
                      location.source === 'district' ? 12 : 10;
          mapInstance.setZoom(zoom);
          initialZoomSet.current = true;
          setCurrentPosition(newCenter);
          setCenter(newCenter);
        }
      }).catch(error => {
        console.error('Error getting location on map load:', error);
      });
    }
    
    setIsMapInitialized(true);
  }, [currentPosition, locationSource]);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (mode !== 'draw' || !e.latLng) return;
    
    // Mark that user has started interacting
    if (boundary.length === 0) {
      setUserHasInteracted(true);
    }
    
    const newPoint: LatLng = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };
    
    setBoundary(prev => [...prev, newPoint]);
  }, [mode, boundary.length]);

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
    console.log('handleSave called', { boundary, area, validationError });
    
    if (boundary.length < 3) {
      toast({
        title: "Invalid Boundary",
        description: "Please mark at least 3 points to define your land boundary.",
        variant: "destructive",
      });
      return;
    }
    
    if (validationError) {
      toast({
        title: "Invalid Boundary",
        description: validationError,
        variant: "destructive",
      });
      return;
    }
    
    console.log('Calling onSave with:', boundary, area);
    onSave(boundary, area);
  }, [boundary, area, validationError, onSave, toast]);

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

  // Loading state
  const [mapLoading, setMapLoading] = useState(true);

  const handleMapLoad = useCallback((mapInstance: google.maps.Map) => {
    onLoad(mapInstance);
    setMapLoading(false);
  }, [onLoad]);

  return (
    <div className="relative w-full h-full">
      {/* Loading overlay */}
      {mapLoading && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="p-6 space-y-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Loading Hybrid Map...</p>
            <p className="text-xs text-muted-foreground">Getting your location...</p>
          </Card>
        </div>
      )}

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
        options={{
          ...mapOptions,
          zoom: 18, // Initial zoom only - won't reset on re-renders
        }}
        onClick={handleMapClick}
        onLoad={handleMapLoad}
        onMapTypeIdChanged={() => {
          if (map) {
            console.log('Map type changed to:', map.getMapTypeId());
          }
        }}
        onTilesLoaded={() => {
          console.log('Map tiles loaded');
          setMapLoading(false);
        }}
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
      
      {/* Validation Error Display */}
      {validationError && (
        <Card className="absolute top-24 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-auto md:max-w-md z-10 bg-destructive/10 border-destructive">
          <div className="p-4 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive font-medium">{validationError}</p>
          </div>
        </Card>
      )}

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
        hasValidationError={!!validationError}
      />
    </div>
  );
}