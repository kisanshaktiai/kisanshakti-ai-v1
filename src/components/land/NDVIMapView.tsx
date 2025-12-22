import { useState, useEffect } from 'react';
import { GoogleMap, Polygon } from '@react-google-maps/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MapPin, TrendingUp, TrendingDown, Minus, 
  Volume2, Download, RefreshCw, Layers,
  Info, Calendar, Eye, EyeOff, Satellite
} from 'lucide-react';
import { useGoogleMapsApi } from '@/hooks/useGoogleMapsApi';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { NDVITrendChart } from './NDVITrendChart';

interface NDVIMapViewProps {
  landId: string;
  boundary?: Array<{ lat: number; lng: number }>;
  centerLat?: number;
  centerLng?: number;
  areaAcres?: number;
  soilType?: string;
  currentCrop?: string;
}

const mapContainerStyle = {
  width: '100%',
  height: '300px',
  borderRadius: '0',
};

// Mock data for demonstration - replace with actual API data
const mockNDVIData = {
  current: {
    ndvi: 0.72,
    evi: 0.65,
    ndwi: 0.45,
    savi: 0.68,
    date: new Date().toISOString(),
  },
  previous: {
    ndvi: 0.68,
    evi: 0.62,
    ndwi: 0.48,
    savi: 0.65,
  },
  trend: [
    { date: '2024-01-01', ndvi: 0.65, evi: 0.58, ndwi: 0.42, savi: 0.62 },
    { date: '2024-01-15', ndvi: 0.68, evi: 0.62, ndwi: 0.45, savi: 0.65 },
    { date: '2024-02-01', ndvi: 0.70, evi: 0.63, ndwi: 0.47, savi: 0.66 },
    { date: '2024-02-15', ndvi: 0.72, evi: 0.65, ndwi: 0.45, savi: 0.68 },
  ]
};

export function NDVIMapView({
  landId,
  boundary = [],
  centerLat,
  centerLng,
  areaAcres,
  soilType,
  currentCrop,
}: NDVIMapViewProps) {
  const { isLoaded, loadError } = useGoogleMapsApi();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { speak, stop, isSpeaking } = useTextToSpeech({ 
    language: i18n.language === 'hi' ? 'hi-IN' : 'en-US' 
  });

  const [showOverlay, setShowOverlay] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<'ndvi' | 'evi' | 'ndwi' | 'savi'>('ndvi');
  const [loading, setLoading] = useState(false);

  // Default center if not provided
  const center = {
    lat: centerLat || 20.5937,
    lng: centerLng || 78.9629,
  };

  const getInterpretation = () => {
    const value = mockNDVIData.current[selectedIndex];
    let status = '';
    let advice = '';

    if (selectedIndex === 'ndvi') {
      if (value > 0.6) {
        status = i18n.language === 'hi' ? 
          'आपकी फसल बहुत स्वस्थ है! हरियाली अच्छी है।' : 
          'Your crop is very healthy! Good vegetation cover.';
        advice = i18n.language === 'hi' ? 
          'वर्तमान देखभाल जारी रखें। पानी और पोषक तत्वों का स्तर बनाए रखें।' : 
          'Continue current care. Maintain water and nutrient levels.';
      } else if (value > 0.3) {
        status = i18n.language === 'hi' ? 
          'फसल की स्थिति सामान्य है। थोड़ा ध्यान देने की जरूरत है।' : 
          'Crop condition is moderate. Needs some attention.';
        advice = i18n.language === 'hi' ? 
          'पानी की जांच करें और यदि आवश्यक हो तो उर्वरक दें।' : 
          'Check water supply and consider fertilizer if needed.';
      } else {
        status = i18n.language === 'hi' ? 
          'फसल में तनाव दिख रहा है। तुरंत ध्यान दें!' : 
          'Crop shows stress. Immediate attention needed!';
        advice = i18n.language === 'hi' ? 
          'पानी की कमी या कीट की समस्या हो सकती है। तुरंत जांच करें।' : 
          'May have water shortage or pest issues. Check immediately.';
      }
    } else if (selectedIndex === 'ndwi') {
      if (value > 0.3) {
        status = i18n.language === 'hi' ? 
          'मिट्टी में नमी का स्तर अच्छा है।' : 
          'Soil moisture level is good.';
        advice = i18n.language === 'hi' ? 
          'सिंचाई की आवृत्ति कम कर सकते हैं।' : 
          'Can reduce irrigation frequency.';
      } else if (value > 0) {
        status = i18n.language === 'hi' ? 
          'मिट्टी में नमी सामान्य है।' : 
          'Soil moisture is moderate.';
        advice = i18n.language === 'hi' ? 
          'नियमित सिंचाई जारी रखें।' : 
          'Continue regular irrigation.';
      } else {
        status = i18n.language === 'hi' ? 
          'मिट्टी सूखी है। पानी की जरूरत है।' : 
          'Soil is dry. Water needed.';
        advice = i18n.language === 'hi' ? 
          'तुरंत सिंचाई करें।' : 
          'Irrigate immediately.';
      }
    }

    return { status, advice };
  };

  const getIndexColor = (value: number, type: string) => {
    if (type === 'ndvi' || type === 'evi') {
      if (value > 0.6) return 'text-success-foreground bg-success';
      if (value > 0.3) return 'text-warning-foreground bg-warning';
      return 'text-destructive-foreground bg-destructive';
    }
    if (type === 'ndwi') {
      if (value > 0.3) return 'text-info-foreground bg-info';
      if (value > 0) return 'text-accent-foreground bg-accent';
      return 'text-warning-foreground bg-warning';
    }
    return 'text-gray-600 bg-gray-100';
  };

  const getTrendIcon = (current: number, previous?: number) => {
    if (!previous) return <Minus className="h-4 w-4" />;
    if (current > previous) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (current < previous) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  const speakRecommendation = () => {
    if (isSpeaking) {
      stop();
    } else {
      const { status, advice } = getInterpretation();
      speak(`${status} ${advice}`);
    }
  };

  const downloadReport = () => {
    toast({
      title: t('downloading'),
      description: t('Report will be generated soon'),
    });
  };

  if (!isLoaded) {
    return (
      <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
        <CardContent className="flex items-center justify-center h-80">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Loading Map</p>
              <p className="text-xs text-muted-foreground">Connecting to satellite imagery...</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.location.reload()}
              className="mt-2"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
        <CardContent className="flex flex-col items-center justify-center h-80 space-y-4">
          <div className="p-4 rounded-full bg-orange-500/10">
            <MapPin className="h-8 w-8 text-orange-500" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-medium text-foreground">Map Unavailable</p>
            <p className="text-xs text-muted-foreground max-w-[200px]">
              Could not load map. Check your internet connection.
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { status, advice } = getInterpretation();

  return (
    <div className="space-y-3 sm:space-y-4 w-full max-w-full overflow-hidden">
      {/* Vegetation Indices Stats - 2x2 grid on mobile */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Card 
          className={cn(
            "cursor-pointer transition-all border-0 shadow-md",
            selectedIndex === 'ndvi' && "ring-2 ring-primary shadow-lg"
          )}
          onClick={() => setSelectedIndex('ndvi')}
        >
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">NDVI</p>
              {getTrendIcon(mockNDVIData.current.ndvi, mockNDVIData.previous.ndvi)}
            </div>
            <p className="text-lg sm:text-2xl font-bold">{mockNDVIData.current.ndvi.toFixed(2)}</p>
            <Badge className={cn("mt-1.5 sm:mt-2 text-[10px] sm:text-xs", getIndexColor(mockNDVIData.current.ndvi, 'ndvi'))}>
              {mockNDVIData.current.ndvi > 0.6 ? 'Healthy' : mockNDVIData.current.ndvi > 0.3 ? 'Moderate' : 'Stress'}
            </Badge>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all border-0 shadow-md",
            selectedIndex === 'evi' && "ring-2 ring-primary shadow-lg"
          )}
          onClick={() => setSelectedIndex('evi')}
        >
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">EVI</p>
              {getTrendIcon(mockNDVIData.current.evi, mockNDVIData.previous.evi)}
            </div>
            <p className="text-lg sm:text-2xl font-bold">{mockNDVIData.current.evi.toFixed(2)}</p>
            <Badge className={cn("mt-1.5 sm:mt-2 text-[10px] sm:text-xs", getIndexColor(mockNDVIData.current.evi, 'evi'))}>
              {mockNDVIData.current.evi > 0.5 ? 'Optimal' : mockNDVIData.current.evi > 0.2 ? 'Good' : 'Poor'}
            </Badge>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all border-0 shadow-md",
            selectedIndex === 'ndwi' && "ring-2 ring-primary shadow-lg"
          )}
          onClick={() => setSelectedIndex('ndwi')}
        >
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">NDWI</p>
              {getTrendIcon(mockNDVIData.current.ndwi, mockNDVIData.previous.ndwi)}
            </div>
            <p className="text-lg sm:text-2xl font-bold">{mockNDVIData.current.ndwi.toFixed(2)}</p>
            <Badge className={cn("mt-1.5 sm:mt-2 text-[10px] sm:text-xs", getIndexColor(mockNDVIData.current.ndwi, 'ndwi'))}>
              {mockNDVIData.current.ndwi > 0.3 ? 'Wet' : mockNDVIData.current.ndwi > 0 ? 'Moist' : 'Dry'}
            </Badge>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all border-0 shadow-md",
            selectedIndex === 'savi' && "ring-2 ring-primary shadow-lg"
          )}
          onClick={() => setSelectedIndex('savi')}
        >
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">SAVI</p>
              {getTrendIcon(mockNDVIData.current.savi, mockNDVIData.previous.savi)}
            </div>
            <p className="text-lg sm:text-2xl font-bold">{mockNDVIData.current.savi.toFixed(2)}</p>
            <Badge className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs bg-secondary text-secondary-foreground">
              Soil Adjusted
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Map and Analysis Tabs */}
      <Tabs defaultValue="map" className="space-y-3 sm:space-y-4">
        <TabsList className="grid w-full grid-cols-2 h-10 sm:h-11">
          <TabsTrigger value="map" className="text-xs sm:text-sm">Satellite View</TabsTrigger>
          <TabsTrigger value="analysis" className="text-xs sm:text-sm">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="space-y-3 sm:space-y-4">
          <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                  <Satellite className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="truncate">Land Boundary Map</span>
                </CardTitle>
                <div className="flex gap-1.5 sm:gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowOverlay(!showOverlay)}
                    className="h-8 px-2 sm:px-3"
                  >
                    {showOverlay ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setLoading(true);
                      setTimeout(() => {
                        setLoading(false);
                        toast({ title: 'Data refreshed' });
                      }, 1000);
                    }}
                    disabled={loading}
                    className="h-8 px-2 sm:px-3"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative">
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={center}
                  zoom={16}
                  options={{
                    mapTypeId: 'satellite',
                    disableDefaultUI: false,
                    zoomControl: true,
                    mapTypeControl: true,
                    streetViewControl: false,
                    fullscreenControl: true,
                  }}
                >
                  {boundary.length > 0 && (
                    <Polygon
                      paths={boundary}
                      options={{
                        fillColor: selectedIndex === 'ndvi' ? 'hsl(var(--success))' : 
                                  selectedIndex === 'evi' ? 'hsl(var(--info))' :
                                  selectedIndex === 'ndwi' ? 'hsl(var(--accent))' : 'hsl(var(--secondary))',
                        fillOpacity: showOverlay ? 0.4 : 0.2,
                        strokeColor: 'hsl(var(--background))',
                        strokeOpacity: 1,
                        strokeWeight: 2,
                      }}
                    />
                  )}
                </GoogleMap>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-border">
                  <p className="text-xs font-semibold mb-2 text-foreground">{selectedIndex.toUpperCase()} Scale</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-success rounded"></div>
                      <span className="text-xs text-foreground">High (&gt;0.6)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-warning rounded"></div>
                      <span className="text-xs text-foreground">Medium (0.3-0.6)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-destructive rounded"></div>
                      <span className="text-xs text-foreground">Low (&lt;0.3)</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Simple Interpretation Card */}
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  What This Means for Your Crop
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={speakRecommendation}
                >
                  <Volume2 className={cn("h-4 w-4", isSpeaking && "text-primary animate-pulse")} />
                  <span className="ml-1 hidden sm:inline">
                    {isSpeaking ? 'Stop' : 'Listen'}
                  </span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="font-semibold text-lg">{status}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Last updated: {new Date(mockNDVIData.current.date).toLocaleDateString()}
                </p>
              </div>
              
              <div className="p-3 bg-background rounded-lg">
                <p className="text-sm font-medium mb-1">Recommendation:</p>
                <p className="text-sm">{advice}</p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" className="flex-1" onClick={downloadReport}>
                  <Download className="h-4 w-4 mr-1" />
                  Download Report
                </Button>
                <Button size="sm" variant="outline" className="flex-1">
                  <Calendar className="h-4 w-4 mr-1" />
                  Schedule Checkup
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis">
          <NDVITrendChart data={mockNDVIData.trend} selectedIndex={selectedIndex} />
        </TabsContent>
      </Tabs>
    </div>
  );
}