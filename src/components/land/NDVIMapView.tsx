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
  height: '400px',
  borderRadius: '0.5rem',
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
      if (value > 0.6) return 'text-green-600 bg-green-100';
      if (value > 0.3) return 'text-yellow-600 bg-yellow-100';
      return 'text-red-600 bg-red-100';
    }
    if (type === 'ndwi') {
      if (value > 0.3) return 'text-blue-600 bg-blue-100';
      if (value > 0) return 'text-cyan-600 bg-cyan-100';
      return 'text-orange-600 bg-orange-100';
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
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
            <p className="text-muted-foreground">Loading map...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center space-y-4">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Unable to load map</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { status, advice } = getInterpretation();

  return (
    <div className="space-y-4">
      {/* Vegetation Indices Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card 
          className={cn(
            "cursor-pointer transition-all",
            selectedIndex === 'ndvi' && "ring-2 ring-primary"
          )}
          onClick={() => setSelectedIndex('ndvi')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">NDVI</p>
              {getTrendIcon(mockNDVIData.current.ndvi, mockNDVIData.previous.ndvi)}
            </div>
            <p className="text-2xl font-bold">{mockNDVIData.current.ndvi.toFixed(2)}</p>
            <Badge className={cn("mt-2", getIndexColor(mockNDVIData.current.ndvi, 'ndvi'))}>
              {mockNDVIData.current.ndvi > 0.6 ? 'Healthy' : mockNDVIData.current.ndvi > 0.3 ? 'Moderate' : 'Stress'}
            </Badge>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all",
            selectedIndex === 'evi' && "ring-2 ring-primary"
          )}
          onClick={() => setSelectedIndex('evi')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">EVI</p>
              {getTrendIcon(mockNDVIData.current.evi, mockNDVIData.previous.evi)}
            </div>
            <p className="text-2xl font-bold">{mockNDVIData.current.evi.toFixed(2)}</p>
            <Badge className={cn("mt-2", getIndexColor(mockNDVIData.current.evi, 'evi'))}>
              {mockNDVIData.current.evi > 0.5 ? 'Optimal' : mockNDVIData.current.evi > 0.2 ? 'Good' : 'Poor'}
            </Badge>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all",
            selectedIndex === 'ndwi' && "ring-2 ring-primary"
          )}
          onClick={() => setSelectedIndex('ndwi')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">NDWI</p>
              {getTrendIcon(mockNDVIData.current.ndwi, mockNDVIData.previous.ndwi)}
            </div>
            <p className="text-2xl font-bold">{mockNDVIData.current.ndwi.toFixed(2)}</p>
            <Badge className={cn("mt-2", getIndexColor(mockNDVIData.current.ndwi, 'ndwi'))}>
              {mockNDVIData.current.ndwi > 0.3 ? 'Wet' : mockNDVIData.current.ndwi > 0 ? 'Moist' : 'Dry'}
            </Badge>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all",
            selectedIndex === 'savi' && "ring-2 ring-primary"
          )}
          onClick={() => setSelectedIndex('savi')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">SAVI</p>
              {getTrendIcon(mockNDVIData.current.savi, mockNDVIData.previous.savi)}
            </div>
            <p className="text-2xl font-bold">{mockNDVIData.current.savi.toFixed(2)}</p>
            <Badge className="mt-2 bg-purple-100 text-purple-600">
              Soil Adjusted
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Map and Analysis Tabs */}
      <Tabs defaultValue="map" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="map">Satellite View</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Satellite className="h-5 w-5" />
                  Land Boundary Map
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowOverlay(!showOverlay)}
                  >
                    {showOverlay ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">
                      {showOverlay ? 'Hide' : 'Show'} NDVI
                    </span>
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
                  >
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
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
                        fillColor: selectedIndex === 'ndvi' ? '#10b981' : 
                                  selectedIndex === 'evi' ? '#3b82f6' :
                                  selectedIndex === 'ndwi' ? '#06b6d4' : '#8b5cf6',
                        fillOpacity: showOverlay ? 0.4 : 0.2,
                        strokeColor: '#ffffff',
                        strokeOpacity: 1,
                        strokeWeight: 2,
                      }}
                    />
                  )}
                </GoogleMap>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
                  <p className="text-xs font-semibold mb-2">{selectedIndex.toUpperCase()} Scale</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-500 rounded"></div>
                      <span className="text-xs">High (&gt;0.6)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                      <span className="text-xs">Medium (0.3-0.6)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-red-500 rounded"></div>
                      <span className="text-xs">Low (&lt;0.3)</span>
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