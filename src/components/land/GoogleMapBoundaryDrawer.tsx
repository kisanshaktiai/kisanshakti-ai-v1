import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { GoogleMap, Marker, Polygon, Polyline } from '@react-google-maps/api';
import * as turf from '@turf/turf';
import { MapControls } from './MapControls';
import { AreaDisplay } from './AreaDisplay';
import { useToast } from '@/components/ui/use-toast';
import LocationService from '@/services/LocationService';
import { Card } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGoogleMapsApi } from '@/hooks/useGoogleMapsApi';

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
  const { t } = useTranslation();
  const { isLoaded, loadError, isLoading, retry } = useGoogleMapsApi();
  
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
  const [locationSource, setLocationSource] = useState<string>('gps');
  const [locationAccuracy, setLocationAccuracy] = useState<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const initialZoomSet = useRef(false);
  const [mapLoading, setMapLoading] = useState(true);

  // Check if Google Maps is fully ready
  const isGoogleReady = useMemo(() => {
    return isLoaded && typeof google !== 'undefined' && !!google.maps?.Map;
  }, [isLoaded]);

  // Map options - memoized to prevent unnecessary re-renders
  const mapOptions = useMemo((): google.maps.MapOptions | undefined => {
    if (!isGoogleReady) return undefined;
    
    return {
      mapTypeId: 'hybrid',
      disableDefaultUI: false,
      zoom: 18,
      disableDoubleClickZoom: true,
      scrollwheel: true,
      clickableIcons: false,
      zoomControl: true,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_CENTER,
      },
      gestureHandling: 'greedy',
      tilt: 0,
      rotateControl: true,
      mapTypeControl: true,
      mapTypeControlOptions: {
        mapTypeIds: ['hybrid', 'satellite', 'roadmap', 'terrain'],
        position: google.maps.ControlPosition.TOP_LEFT,
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      },
      streetViewControl: false,
      fullscreenControl: true,
      fullscreenControlOptions: {
        position: google.maps.ControlPosition.RIGHT_TOP,
      },
      scaleControl: true,
      styles: [
        { featureType: 'all', elementType: 'labels', stylers: [{ visibility: 'on' }] },
        { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'on' }] },
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'on' }] },
        { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'on' }] }
      ],
    };
  }, [isGoogleReady]);

  // Get user's current location on mount
  useEffect(() => {
    if (initialCenter) {
      console.log('Edit mode - using land coordinates:', initialCenter);
      setCenter(initialCenter);
      setCurrentPosition(initialCenter);
      setLocationSource('land_data');
      setIsMapInitialized(true);
      return;
    }

    const fetchLocation = async () => {
      try {
        const location = await LocationService.getCurrentLocation();
        
        if (location) {
          const newCenter = { lat: location.lat, lng: location.lon };
          setCenter(newCenter);
          setCurrentPosition(newCenter);
          setLocationAccuracy(location.accuracy);
          setLocationSource(location.source || 'gps');
          
          if (map && !isMapInitialized) {
            map.panTo(newCenter);
          }
          
          if (location.source && location.source !== 'gps') {
            toast({
              title: t('lands.map.toast.location_set'),
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
  }, [map, toast, isMapInitialized, initialCenter, t]);

  // Calculate area and validate boundary
  useEffect(() => {
    setValidationError(null);

    if (boundary.length < 3) {
      setArea({ sqft: 0, guntha: 0, acres: 0 });
      if (boundary.length > 0) {
        setValidationError(`Need ${3 - boundary.length} more point${3 - boundary.length > 1 ? 's' : ''} to form a boundary`);
      }
      return;
    }

    try {
      const closedBoundary = [...boundary];
      const firstPoint = boundary[0];
      const lastPoint = boundary[boundary.length - 1];
      
      if (firstPoint.lat !== lastPoint.lat || firstPoint.lng !== lastPoint.lng) {
        closedBoundary.push(firstPoint);
      }

      const polygon = turf.polygon([
        closedBoundary.map(point => [point.lng, point.lat])
      ]);
      
      const kinks = turf.kinks(polygon);
      if (kinks.features.length > 0) {
        setValidationError('⚠️ Boundary lines are crossing each other. Please adjust the points.');
        setArea({ sqft: 0, guntha: 0, acres: 0 });
        return;
      }
      
      const areaInSquareMeters = turf.area(polygon);
      const sqft = areaInSquareMeters * 10.7639;
      const guntha = sqft / 1089;
      const acres = sqft / 43560;
      
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

  // Map load callback
  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    console.log('Map loaded successfully');
    setMap(mapInstance);
    mapInstance.setMapTypeId('hybrid');
    
    if (!initialZoomSet.current) {
      if (initialCenter) {
        console.log('Centering on land location:', initialCenter);
        mapInstance.panTo(initialCenter);
        mapInstance.setZoom(18);
        initialZoomSet.current = true;
        setIsMapInitialized(true);
      } else if (currentPosition) {
        mapInstance.panTo(currentPosition);
        const zoom = locationSource === 'gps' ? 18 : 
                    locationSource === 'village' ? 16 :
                    locationSource === 'taluka' ? 14 :
                    locationSource === 'district' ? 12 : 10;
        mapInstance.setZoom(zoom);
        initialZoomSet.current = true;
      } else if (!initialCenter) {
        LocationService.getCurrentLocation().then(location => {
          if (location) {
            const newCenter = { lat: location.lat, lng: location.lon };
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
        }).catch(console.error);
      }
    }
    
    setIsMapInitialized(true);
    setMapLoading(false);
  }, [currentPosition, locationSource, initialCenter]);

  // Map click handler
  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (mode !== 'draw' || !e.latLng) return;
    
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

  // GPS tracking
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast({
        title: t('lands.add_land.error.gps_not_available'),
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
          title: t('lands.add_land.error.gps_error'),
          variant: "destructive",
        });
        setIsTracking(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
    
    watchIdRef.current = id;
  }, [map, toast, t]);

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

  // Save handler
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

  // Theme color helpers
  const getThemeColor = (varName: string, fallback: string): string => {
    try {
      const root = document.documentElement;
      const cssVar = getComputedStyle(root).getPropertyValue(varName).trim();
      if (cssVar) {
        const [h, s, l] = cssVar.split(' ').map(v => parseFloat(v));
        return hslToHex(h, s, l);
      }
    } catch (e) {
      console.warn('Error getting theme color:', e);
    }
    return fallback;
  };

  const hslToHex = (h: number, s: number, l: number): string => {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    
    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
    
    const toHex = (n: number) => {
      const hex = Math.round((n + m) * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // Memoized polygon/polyline options
  const polygonOptions = useMemo(() => ({
    fillColor: getThemeColor('--primary', '#22c55e'),
    fillOpacity: 0.35,
    strokeColor: getThemeColor('--primary', '#22c55e'),
    strokeOpacity: 1,
    strokeWeight: 2,
    clickable: false,
    draggable: false,
    editable: false,
    geodesic: false,
    zIndex: 1,
  }), []);

  const polylineOptions = useMemo(() => ({
    strokeColor: getThemeColor('--primary', '#22c55e'),
    strokeOpacity: 1,
    strokeWeight: 2,
    clickable: false,
    draggable: false,
    editable: false,
    geodesic: false,
    zIndex: 1,
  }), []);

  // Marker icons - only create when Google is ready
  const getCurrentPositionIcon = useCallback(() => {
    if (!isGoogleReady) return undefined;
    
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: getThemeColor('--accent', '#3b82f6'),
      fillOpacity: 1,
      strokeColor: getThemeColor('--background', '#ffffff'),
      strokeWeight: 2,
    };
  }, [isGoogleReady]);

  const getMarkerIcon = useCallback(() => {
    if (!isGoogleReady) return undefined;
    
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 6,
      fillColor: getThemeColor('--destructive', '#ef4444'),
      fillOpacity: 1,
      strokeColor: getThemeColor('--background', '#ffffff'),
      strokeWeight: 2,
    };
  }, [isGoogleReady]);

  // Center on location handler
  const handleCenterOnLocation = useCallback(async () => {
    if (map) {
      setIsCentering(true);
      try {
        const location = await LocationService.getCurrentLocation(true);
        
        if (location) {
          const pos = { lat: location.lat, lng: location.lon };
          setCurrentPosition(pos);
          setLocationAccuracy(location.accuracy);
          setLocationSource(location.source || 'gps');
          map.setCenter(pos);
          
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

  // Show loading state while Google Maps is loading
  if (isLoading || !isGoogleReady) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-background">
        <Card className="p-6 space-y-4 text-center max-w-sm">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground font-medium">Loading Map...</p>
          <p className="text-xs text-muted-foreground">Please wait while we prepare the map</p>
        </Card>
      </div>
    );
  }

  // Show error state
  if (loadError) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-background p-4">
        <Card className="p-6 space-y-4 text-center max-w-md">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
          <h2 className="text-lg font-semibold text-destructive">Map Loading Failed</h2>
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <div className="flex gap-3 justify-center pt-2">
            <button 
              onClick={onCancel}
              className="px-4 py-2 text-sm border rounded-md hover:bg-accent"
            >
              Go Back
            </button>
            <button 
              onClick={retry}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Try Again
            </button>
          </div>
        </Card>
      </div>
    );
  }

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

      {/* Location center button */}
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
        options={mapOptions}
        onClick={handleMapClick}
        onLoad={onLoad}
        onTilesLoaded={() => setMapLoading(false)}
      >
        {/* Current position marker */}
        {currentPosition && isGoogleReady && (
          <Marker
            position={currentPosition}
            icon={getCurrentPositionIcon()}
          />
        )}

        {/* Boundary markers */}
        {isGoogleReady && boundary.map((point, index) => (
          <Marker
            key={`marker-${index}`}
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

        {/* Polygon or Polyline */}
        {isGoogleReady && boundary.length >= 3 ? (
          <Polygon
            paths={boundary}
            options={polygonOptions}
          />
        ) : boundary.length >= 2 && isGoogleReady ? (
          <Polyline
            path={boundary}
            options={polylineOptions}
          />
        ) : null}
      </GoogleMap>

      <AreaDisplay area={area} pointsCount={boundary.length} />
      
      {/* Validation Error */}
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
