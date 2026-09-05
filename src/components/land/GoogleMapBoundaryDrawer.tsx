import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { GoogleMap, Marker, Polygon, Polyline } from '@react-google-maps/api';
import * as turf from '@turf/turf';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { MapControls } from './MapControls';
import { AreaDisplay } from './AreaDisplay';
import { useToast } from '@/components/ui/use-toast';
import LocationService from '@/services/LocationService';
import { Card } from '@/components/ui/card';
import { Loader2, AlertCircle, WifiOff, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGoogleMapsScript } from '@/components/maps/GoogleMapsScriptProvider';
import { Button } from '@/components/ui/button';

const IS_NATIVE = Capacitor.isNativePlatform();
const IS_IOS = Capacitor.getPlatform() === 'ios';

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

const mapContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  // iOS Safari/WKWebView swallows two-finger gestures (rotate/tilt) by routing
  // them to page-zoom. `touch-action: none` hands every gesture to Google Maps.
  touchAction: 'none',
  WebkitUserSelect: 'none',
  userSelect: 'none',
};


export function GoogleMapBoundaryDrawer({ 
  onSave, 
  onCancel,
  initialCenter,
  initialBoundary = []
}: GoogleMapBoundaryDrawerProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isLoaded, loadError, isLoading, retry } = useGoogleMapsScript();
  
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
  const nativeWatchIdRef = useRef<string | null>(null);

  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const initialZoomSet = useRef(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Check if Google Maps is fully ready - defensive check
  const isGoogleReady = useMemo(() => {
    if (!isLoaded) {
      console.log('🗺️ [GoogleMapBoundaryDrawer] Not ready - isLoaded is false');
      return false;
    }
    if (typeof google === 'undefined') {
      console.log('🗺️ [GoogleMapBoundaryDrawer] Not ready - google undefined');
      return false;
    }
    if (!google.maps) {
      console.log('🗺️ [GoogleMapBoundaryDrawer] Not ready - google.maps undefined');
      return false;
    }
    if (!google.maps.Map) {
      console.log('🗺️ [GoogleMapBoundaryDrawer] Not ready - google.maps.Map undefined');
      return false;
    }
    console.log('🗺️ [GoogleMapBoundaryDrawer] Google Maps is READY!');
    return true;
  }, [isLoaded]);

  // Network status listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('🗺️ [GoogleMapBoundaryDrawer] Back online');
    };
    const handleOffline = () => {
      setIsOnline(false);
      console.log('🗺️ [GoogleMapBoundaryDrawer] Gone offline');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
      // 'greedy' is required so Google Maps captures every touch on iOS
      // instead of letting WKWebView treat the second finger as page-zoom.
      gestureHandling: 'greedy',
      // Allow tilt+rotation on raster (satellite/hybrid) maps. Setting tilt:0
      // (the previous value) globally disabled the two-finger rotate gesture.
      tilt: 45,
      heading: 0,
      rotateControl: true,
      rotateControlOptions: {
        position: google.maps.ControlPosition.RIGHT_TOP,
      },
      isFractionalZoomEnabled: true,
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

  // iOS WKWebView merges two-finger gestures into page zoom unless we
  // temporarily disable user-scalable while the map is mounted. Restore on unmount.
  useEffect(() => {
    if (!IS_IOS) return;
    const viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    const previous = viewport?.getAttribute('content') ?? null;
    if (viewport) {
      viewport.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      );
    }
    return () => {
      if (viewport && previous) viewport.setAttribute('content', previous);
    };
  }, []);


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

  // Drag a numbered point to a new position — live area recalculation
  const handleMarkerDragEnd = useCallback((index: number, e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const next: LatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setBoundary(prev => prev.map((p, i) => (i === index ? next : p)));
    if (typeof navigator !== 'undefined') navigator.vibrate?.(10);
  }, []);

  // Long-press / right-click on a vertex removes it
  const handleMarkerRightClick = useCallback((index: number) => {
    setBoundary(prev => prev.filter((_, i) => i !== index));
    if (typeof navigator !== 'undefined') navigator.vibrate?.(20);
  }, []);

  // Sync polygon path back to state after the user drags a vertex/midpoint
  // via Google's native editable-polygon UI
  const handlePolygonEdit = useCallback((polygon: google.maps.Polygon) => {
    const path = polygon.getPath();
    const next: LatLng[] = [];
    for (let i = 0; i < path.getLength(); i++) {
      const ll = path.getAt(i);
      next.push({ lat: ll.lat(), lng: ll.lng() });
    }
    setBoundary(next);
  }, []);

  // GPS tracking - uses Capacitor on native (CoreLocation on iOS / FusedLocation on Android)
  const startTracking = useCallback(async () => {
    setIsTracking(true);

    const handlePoint = (lat: number, lng: number, accuracy: number) => {
      const newPoint: LatLng = { lat, lng };
      setCurrentPosition(newPoint);
      setGpsAccuracy(accuracy);
      setBoundary(prev => [...prev, newPoint]);
      if (map) map.panTo(newPoint);
    };

    if (IS_NATIVE) {
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted') {
          const req = await Geolocation.requestPermissions({ permissions: ['location'] });
          if (req.location !== 'granted') {
            toast({ title: t('lands.add_land.error.gps_not_available'), variant: 'destructive' });
            setIsTracking(false);
            return;
          }
        }
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (position, err) => {
            if (err || !position) {
              console.error('Native GPS error:', err);
              return;
            }
            handlePoint(
              position.coords.latitude,
              position.coords.longitude,
              position.coords.accuracy ?? 50,
            );
          }
        );
        nativeWatchIdRef.current = id;
        return;
      } catch (err) {
        console.error('Native watchPosition failed:', err);
        toast({ title: t('lands.add_land.error.gps_error'), variant: 'destructive' });
        setIsTracking(false);
        return;
      }
    }

    if (!navigator.geolocation) {
      toast({ title: t('lands.add_land.error.gps_not_available'), variant: 'destructive' });
      setIsTracking(false);
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (position) => handlePoint(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy,
      ),
      (error) => {
        console.error('GPS error:', error);
        toast({ title: t('lands.add_land.error.gps_error'), variant: 'destructive' });
        setIsTracking(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    watchIdRef.current = id;
  }, [map, toast, t]);

  const stopTracking = useCallback(() => {
    if (nativeWatchIdRef.current !== null) {
      Geolocation.clearWatch({ id: nativeWatchIdRef.current }).catch(() => {});
      nativeWatchIdRef.current = null;
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      if (nativeWatchIdRef.current !== null) {
        Geolocation.clearWatch({ id: nativeWatchIdRef.current }).catch(() => {});
      }
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

  // Memoized polygon options — editable when 3+ points so users can drag vertices/midpoints
  const polygonOptions = useMemo(() => ({
    fillColor: getThemeColor('--polygon-fill', getThemeColor('--primary', '#22c55e')),
    fillOpacity: 0.3,
    strokeColor: getThemeColor('--polygon-stroke', getThemeColor('--primary', '#22c55e')),
    strokeOpacity: 1,
    strokeWeight: 2.5,
    clickable: true,
    draggable: false,
    editable: mode === 'draw' && boundary.length >= 3,
    geodesic: false,
    zIndex: 1,
  }), [mode, boundary.length]);

  const polylineOptions = useMemo(() => ({
    strokeColor: getThemeColor('--tracking-stroke', getThemeColor('--primary', '#22c55e')),
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
      fillColor: getThemeColor('--tracking-fill', getThemeColor('--accent', '#3b82f6')),
      fillOpacity: 1,
      strokeColor: getThemeColor('--background', '#ffffff'),
      strokeWeight: 2,
    };
  }, [isGoogleReady]);

  const getMarkerIcon = useCallback(() => {
    if (!isGoogleReady) return undefined;

    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 11, // ~22px diameter, large finger target
      fillColor: getThemeColor('--marker-color', getThemeColor('--destructive', '#ef4444')),
      fillOpacity: 1,
      strokeColor: getThemeColor('--background', '#ffffff'),
      strokeWeight: 3,
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
  if (isLoading) {
    console.log('🗺️ [GoogleMapBoundaryDrawer] Showing loading state - script loading');
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-background">
        <Card className="p-6 space-y-4 text-center max-w-sm">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground font-medium">
            Loading Map...
          </p>
          <p className="text-xs text-muted-foreground">Please wait while we prepare the map</p>
          {!isOnline && (
            <div className="flex items-center justify-center gap-2 mt-2 text-amber-600">
              <WifiOff className="h-4 w-4" />
              <span className="text-sm">You're offline</span>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // Show error state
  if (loadError) {
    console.log('🗺️ [GoogleMapBoundaryDrawer] Showing error state:', loadError);
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-background p-4">
        <Card className="p-6 space-y-4 text-center max-w-md">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
          <h2 className="text-lg font-semibold text-destructive">Map Loading Failed</h2>
          <p className="text-sm text-muted-foreground">
            {!isOnline 
              ? 'No internet connection. Please connect to the internet and try again.'
              : loadError}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Button onClick={onCancel} variant="outline">
              Go Back
            </Button>
            <Button onClick={retry} variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Still initializing after script loaded
  if (!isGoogleReady) {
    console.log('🗺️ [GoogleMapBoundaryDrawer] Showing initializing state - waiting for Google');
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-background">
        <Card className="p-6 space-y-4 text-center max-w-sm">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground font-medium">Initializing map...</p>
          <Button variant="outline" size="sm" onClick={retry} className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
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

      {/* Location center button — sits above the bottom action sheet, safe-area aware */}
      <button
        onClick={handleCenterOnLocation}
        aria-label="Center on my location"
        className="absolute right-3 z-20 h-12 w-12 bg-background/95 backdrop-blur-md shadow-xl rounded-full flex items-center justify-center hover:bg-accent/10 transition-colors border border-border/60"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 220px)' }}
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

        {/* Boundary markers — draggable in draw mode, long-press to delete */}
        {isGoogleReady && boundary.map((point, index) => (
          <Marker
            key={`marker-${index}`}
            position={point}
            draggable={mode === 'draw'}
            onDragEnd={(e) => handleMarkerDragEnd(index, e)}
            onRightClick={() => handleMarkerRightClick(index)}
            label={{
              text: (index + 1).toString(),
              color: 'white',
              fontSize: '13px',
              fontWeight: 'bold',
            }}
            icon={getMarkerIcon()}
            zIndex={10}
          />
        ))}

        {/* Polygon (editable) or Polyline preview */}
        {isGoogleReady && boundary.length >= 3 ? (
          <Polygon
            paths={boundary}
            options={polygonOptions}
            onMouseUp={(e) => {
              // After dragging a vertex/midpoint, sync the path back to state
              const target = (e as unknown as { overlay?: google.maps.Polygon }).overlay;
              if (target && typeof target.getPath === 'function') {
                handlePolygonEdit(target);
              }
            }}
            onLoad={(polygon) => {
              // Listen to native edit events on the polygon path
              const path = polygon.getPath();
              const sync = () => handlePolygonEdit(polygon);
              path.addListener('set_at', sync);
              path.addListener('insert_at', sync);
              path.addListener('remove_at', sync);
            }}
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
