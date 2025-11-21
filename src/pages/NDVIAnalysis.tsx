import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { landsApi } from '@/services/landsApi';
import { NDVIMapView } from '@/components/land/NDVIMapView';
import { NDVITrendChart } from '@/components/land/NDVITrendChart';
import { 
  ArrowLeft, 
  Map, 
  TrendingUp,
  TrendingDown, 
  Info, 
  Activity,
  Droplets,
  Leaf,
  AlertCircle,
  Calendar,
  CloudRain,
  Satellite,
  ChevronRight,
  RefreshCw,
  Volume2,
  Eye,
  TreePine,
  Sparkles,
  Sun,
  ThermometerSun,
  Gauge,
  MessageSquare,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  MapPin,
  Minus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { cn } from '@/lib/utils';

interface NDVIData {
  id: string;
  land_id: string;
  date: string;
  ndvi_value: number;
  evi_value?: number;
  ndwi_value?: number;
  savi_value?: number;
  cloud_coverage?: number;
  satellite_source?: string;
  created_at: string;
}

interface LandWithBoundary {
  id: string;
  name: string;
  area_acres: number;
  area_guntas?: number;
  current_crop?: string;
  soil_type?: string;
  water_source?: string;
  boundary_polygon_old?: any;
  center_point_old?: any;
  center_lat?: number;
  center_lon?: number;
}

interface CropAdvice {
  status: 'excellent' | 'good' | 'moderate' | 'poor';
  mainMessage: string;
  actionItems: string[];
  urgency: 'low' | 'medium' | 'high';
  nextSteps: string[];
}

const NDVIAnalysis = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { speak, isSpeaking, stop } = useTextToSpeech();
  const [selectedLandId, setSelectedLandId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch lands for the farmer
  const { data: lands, isLoading: landsLoading, refetch: refetchLands } = useQuery({
    queryKey: ['lands', session?.farmerId, tenant?.id],
    queryFn: async () => {
      try {
        const landsData = await landsApi.fetchLands();
        return landsData || [];
      } catch (error) {
        console.error('Error fetching lands:', error);
        return [];
      }
    },
    enabled: !!session?.farmerId && !!tenant?.id,
  });

  // Fetch NDVI data with real-time updates
  const { data: ndviData, isLoading: ndviLoading, refetch: refetchNDVI } = useQuery({
    queryKey: ['ndvi', selectedLandId],
    queryFn: async () => {
      if (!selectedLandId) return null;
      
      const { data, error } = await supabase
        .from('ndvi_data')
        .select('*')
        .eq('land_id', selectedLandId)
        .order('date', { ascending: false })
        .limit(30);
      
      if (error) {
        console.error('Error fetching NDVI data:', error);
        throw error;
      }
      
      return data || [];
    },
    enabled: !!selectedLandId,
    refetchInterval: 60000, // Refresh every minute
  });

  // Get selected land details
  const selectedLand = lands?.find(l => l.id === selectedLandId);

  // Parse boundary coordinates
  const getBoundaryCoordinates = () => {
    if (!selectedLand?.boundary_polygon_old) return [];
    
    try {
      if (typeof selectedLand.boundary_polygon_old === 'object' && 'coordinates' in selectedLand.boundary_polygon_old) {
        const coords = selectedLand.boundary_polygon_old.coordinates[0] || [];
        return coords.map((coord: number[]) => ({
          lat: coord[1],
          lng: coord[0]
        }));
      }
    } catch (error) {
      console.error('Error parsing boundary:', error);
    }
    return [];
  };

  // Get center coordinates
  const getCenterCoordinates = () => {
    if (selectedLand?.center_point_old?.coordinates) {
      return {
        lat: selectedLand.center_point_old.coordinates[1],
        lng: selectedLand.center_point_old.coordinates[0]
      };
    }
    // Default to India center if no coordinates
    return { lat: 20.5937, lng: 78.9629 };
  };

  // Generate farmer-friendly advice
  const generateAdvice = (data: NDVIData[]): CropAdvice => {
    if (!data || data.length === 0) {
      return {
        status: 'moderate',
        mainMessage: i18n.language === 'hi' ? 
          'सैटेलाइट डेटा प्राप्त हो रहा है...' : 
          'Fetching satellite data...',
        actionItems: [],
        urgency: 'low',
        nextSteps: []
      };
    }

    const latest = data[0];
    const ndvi = latest.ndvi_value || 0;
    const ndwi = latest.ndwi_value || 0;

    if (ndvi > 0.7) {
      return {
        status: 'excellent',
        mainMessage: i18n.language === 'hi' ? 
          '🌱 बहुत बढ़िया! आपकी फसल एकदम स्वस्थ है' : 
          '🌱 Excellent! Your crop is very healthy',
        actionItems: i18n.language === 'hi' ? [
          'पानी की वर्तमान मात्रा बनाए रखें',
          'कीटों की नियमित जांच करते रहें',
          '5 दिन बाद फिर चेक करें'
        ] : [
          'Maintain current water levels',
          'Continue pest monitoring',
          'Check again in 5 days'
        ],
        urgency: 'low',
        nextSteps: i18n.language === 'hi' ? [
          'फसल की ऊंचाई नोट करें',
          'मौसम पर नज़र रखें'
        ] : [
          'Record crop height',
          'Monitor weather'
        ]
      };
    } else if (ndvi > 0.5) {
      return {
        status: 'good',
        mainMessage: i18n.language === 'hi' ? 
          '🌿 अच्छा! थोड़ा सुधार कर सकते हैं' : 
          '🌿 Good! Small improvements possible',
        actionItems: i18n.language === 'hi' ? [
          ndwi < 0.3 ? '💧 पानी की मात्रा बढ़ाएं' : 'पानी ठीक है',
          'हल्का उर्वरक दे सकते हैं',
          'खरपतवार हटाएं'
        ] : [
          ndwi < 0.3 ? '💧 Increase irrigation' : 'Water is adequate',
          'Can apply light fertilizer',
          'Remove weeds if any'
        ],
        urgency: 'medium',
        nextSteps: i18n.language === 'hi' ? [
          '3 दिन में फिर जांचें',
          'पत्तों का रंग देखें'
        ] : [
          'Check in 3 days',
          'Observe leaf color'
        ]
      };
    } else if (ndvi > 0.3) {
      return {
        status: 'moderate',
        mainMessage: i18n.language === 'hi' ? 
          '⚠️ ध्यान दें! फसल में तनाव है' : 
          '⚠️ Attention! Crop shows stress',
        actionItems: i18n.language === 'hi' ? [
          '🚨 तुरंत पानी दें',
          '🌾 उर्वरक की जांच करें',
          '🐛 कीट-रोग देखें',
          '📞 विशेषज्ञ से बात करें'
        ] : [
          '🚨 Irrigate immediately',
          '🌾 Check nutrients',
          '🐛 Look for pests/disease',
          '📞 Contact expert'
        ],
        urgency: 'high',
        nextSteps: i18n.language === 'hi' ? [
          'कल फिर जांचें',
          'फोटो लेकर रखें'
        ] : [
          'Check tomorrow',
          'Take photos'
        ]
      };
    } else {
      return {
        status: 'poor',
        mainMessage: i18n.language === 'hi' ? 
          '🆘 गंभीर! तुरंत कार्रवाई करें' : 
          '🆘 Critical! Immediate action needed',
        actionItems: i18n.language === 'hi' ? [
          '💦 अभी पानी दें',
          '☎️ कृषि अधिकारी को बुलाएं',
          '💊 दवा छिड़काव करें',
          '📋 बीमा कंपनी को सूचना दें'
        ] : [
          '💦 Water now',
          '☎️ Call agriculture officer',
          '💊 Apply treatment',
          '📋 Inform insurance'
        ],
        urgency: 'high',
        nextSteps: i18n.language === 'hi' ? [
          'रोज़ जांचें',
          'सबूत इकट्ठा करें'
        ] : [
          'Check daily',
          'Document evidence'
        ]
      };
    }
  };

  const advice = generateAdvice(ndviData || []);

  // Auto-select first land
  useEffect(() => {
    if (lands && lands.length > 0 && !selectedLandId) {
      setSelectedLandId(lands[0].id);
    }
  }, [lands, selectedLandId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchLands(), refetchNDVI()]);
      toast({
        title: "✅ Data Refreshed",
        description: "Latest satellite data loaded",
      });
    } catch (error) {
      toast({
        title: "❌ Refresh Failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const getHealthColor = (ndvi: number) => {
    if (ndvi > 0.7) return 'from-green-500 to-emerald-500';
    if (ndvi > 0.5) return 'from-emerald-500 to-teal-500';
    if (ndvi > 0.3) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-pink-500';
  };

  const getUrgencyBadge = (urgency: string) => {
    const variants = {
      low: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-red-100 text-red-700'
    };
    return variants[urgency as keyof typeof variants] || variants.medium;
  };

  const speakAdvice = () => {
    if (isSpeaking) {
      stop();
    } else {
      const text = `${advice.mainMessage}. ${advice.actionItems.join('. ')}`;
      speak(text);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-background via-background/95 to-muted/30">
      {/* Modern Mobile Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="hover:scale-110 transition-transform"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                NDVI Analysis
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Satellite className="h-3 w-3 animate-pulse" />
                Satellite monitoring
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="hover:scale-110 transition-all"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Land Selection */}
      {!selectedLandId && (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <Card className="border-none shadow-xl bg-gradient-to-br from-card via-card/95 to-muted/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Select Your Field
                </CardTitle>
                <CardDescription>Choose a field to analyze</CardDescription>
              </CardHeader>
              <CardContent>
                {landsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full rounded-xl" />
                    ))}
                  </div>
                ) : lands && lands.length > 0 ? (
                  <div className="space-y-3">
                    {lands.map((land) => (
                      <Card
                        key={land.id}
                        className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] border-border/50 bg-gradient-to-r from-card to-muted/10"
                        onClick={() => setSelectedLandId(land.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-base">{land.name}</h3>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-muted-foreground">
                                  {land.area_acres} acres
                                </span>
                                {land.current_crop && (
                                  <Badge variant="secondary" className="text-xs">
                                    {land.current_crop}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-4">
                    <TreePine className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <p className="text-muted-foreground">No fields found</p>
                    <Button 
                      onClick={() => navigate('/app/lands')}
                      className="hover:scale-105 transition-transform"
                    >
                      Add Your First Field
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      )}

      {/* NDVI Dashboard */}
      {selectedLandId && (
        <div className="flex-1 flex flex-col">
          {/* Quick Health Status */}
          {ndviData && ndviData.length > 0 && (
            <div className="px-4 pt-4 pb-2">
              <Card className={cn(
                "border-none shadow-lg bg-gradient-to-r",
                getHealthColor(ndviData[0].ndvi_value || 0),
                "text-white"
              )}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                      <span className="font-semibold text-sm">
                        {advice.status === 'excellent' ? '🌱' : 
                         advice.status === 'good' ? '🌿' :
                         advice.status === 'moderate' ? '🍂' : '🍁'}
                        {' '}{advice.status.charAt(0).toUpperCase() + advice.status.slice(1)} Health
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={speakAdvice}
                      className="hover:scale-110 transition-transform"
                    >
                      <Volume2 className={cn("h-4 w-4", isSpeaking && "animate-pulse")} />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/20 backdrop-blur-sm rounded-lg p-2">
                      <div className="flex items-center gap-1 mb-1">
                        <Leaf className="h-3 w-3" />
                        <span className="text-xs font-medium">NDVI</span>
                      </div>
                      <div className="text-xl font-bold">
                        {(ndviData[0].ndvi_value || 0).toFixed(2)}
                      </div>
                    </div>
                    
                    <div className="bg-white/20 backdrop-blur-sm rounded-lg p-2">
                      <div className="flex items-center gap-1 mb-1">
                        <Droplets className="h-3 w-3" />
                        <span className="text-xs font-medium">Water</span>
                      </div>
                      <div className="text-xl font-bold">
                        {(ndviData[0].ndwi_value || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Back Button */}
          <div className="px-4 pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedLandId(null)}
              className="text-xs"
            >
              <ArrowLeft className="mr-1 h-3 w-3" />
              Change Field
            </Button>
          </div>

          {/* Modern Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="mx-4 grid grid-cols-4 h-auto p-1 bg-muted/50">
              <TabsTrigger value="overview" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <div className="flex flex-col items-center py-2">
                  <Eye className="h-4 w-4 mb-1" />
                  <span className="text-xs">Overview</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="map" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <div className="flex flex-col items-center py-2">
                  <Map className="h-4 w-4 mb-1" />
                  <span className="text-xs">Map</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="trends" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <div className="flex flex-col items-center py-2">
                  <Activity className="h-4 w-4 mb-1" />
                  <span className="text-xs">Trends</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="advice" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <div className="flex flex-col items-center py-2">
                  <Lightbulb className="h-4 w-4 mb-1" />
                  <span className="text-xs">Advice</span>
                </div>
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              {/* Overview Tab */}
              <TabsContent value="overview" className="p-4 space-y-4">
                {ndviData && ndviData.length > 0 ? (
                  <>
                    <Card className="border-none shadow-lg">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Vegetation Indices</CardTitle>
                        <CardDescription className="text-xs">
                          Last updated: {new Date(ndviData[0].date).toLocaleDateString()}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">NDVI</span>
                              <span className="text-sm font-bold text-green-600">
                                {(ndviData[0].ndvi_value || 0).toFixed(3)}
                              </span>
                            </div>
                            <Progress value={(ndviData[0].ndvi_value || 0) * 100} className="h-2" />
                            <span className="text-xs text-muted-foreground">Vegetation Health</span>
                          </div>
                          
                          {ndviData[0].evi_value !== undefined && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">EVI</span>
                                <span className="text-sm font-bold text-emerald-600">
                                  {ndviData[0].evi_value.toFixed(3)}
                                </span>
                              </div>
                              <Progress value={ndviData[0].evi_value * 100} className="h-2" />
                              <span className="text-xs text-muted-foreground">Enhanced Index</span>
                            </div>
                          )}
                          
                          {ndviData[0].ndwi_value !== undefined && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">NDWI</span>
                                <span className="text-sm font-bold text-blue-600">
                                  {ndviData[0].ndwi_value.toFixed(3)}
                                </span>
                              </div>
                              <Progress value={ndviData[0].ndwi_value * 100} className="h-2" />
                              <span className="text-xs text-muted-foreground">Water Content</span>
                            </div>
                          )}
                          
                          {ndviData[0].savi_value !== undefined && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">SAVI</span>
                                <span className="text-sm font-bold text-purple-600">
                                  {ndviData[0].savi_value.toFixed(3)}
                                </span>
                              </div>
                              <Progress value={ndviData[0].savi_value * 100} className="h-2" />
                              <span className="text-xs text-muted-foreground">Soil Adjusted</span>
                            </div>
                          )}
                        </div>

                        {ndviData[0].cloud_coverage !== undefined && ndviData[0].cloud_coverage > 20 && (
                          <Alert className="border-yellow-200 bg-yellow-50">
                            <CloudRain className="h-4 w-4 text-yellow-600" />
                            <AlertDescription className="text-xs">
                              High cloud coverage ({ndviData[0].cloud_coverage.toFixed(0)}%) may affect accuracy
                            </AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-none shadow-lg">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Field Information</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Field Name</span>
                            <p className="font-medium text-sm">{selectedLand?.name}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Area</span>
                            <p className="font-medium text-sm">{selectedLand?.area_acres} acres</p>
                          </div>
                          {selectedLand?.current_crop && (
                            <div className="space-y-1">
                              <span className="text-xs text-muted-foreground">Current Crop</span>
                              <p className="font-medium text-sm">{selectedLand.current_crop}</p>
                            </div>
                          )}
                          {selectedLand?.soil_type && (
                            <div className="space-y-1">
                              <span className="text-xs text-muted-foreground">Soil Type</span>
                              <p className="font-medium text-sm">{selectedLand.soil_type}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card className="border-none shadow-lg">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Satellite className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground text-center">
                        No satellite data available yet
                      </p>
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        Check back after next satellite pass
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Map Tab */}
              <TabsContent value="map" className="p-4">
                <NDVIMapView 
                  landId={selectedLandId}
                  boundary={getBoundaryCoordinates()}
                  centerLat={getCenterCoordinates().lat}
                  centerLng={getCenterCoordinates().lng}
                  areaAcres={selectedLand?.area_acres}
                  soilType={selectedLand?.soil_type}
                  currentCrop={selectedLand?.current_crop}
                />
              </TabsContent>

              {/* Trends Tab */}
              <TabsContent value="trends" className="p-4">
                {ndviData && ndviData.length > 1 ? (
                  <NDVITrendChart 
                    data={ndviData.map(d => ({
                      date: d.date,
                      ndvi: d.ndvi_value,
                      evi: d.evi_value || 0,
                      ndwi: d.ndwi_value || 0,
                      savi: d.savi_value || 0
                    }))}
                    selectedIndex="ndvi"
                  />
                ) : (
                  <Card className="border-none shadow-lg">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground text-center">
                        Not enough data for trends
                      </p>
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        Need at least 2 data points
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Advice Tab */}
              <TabsContent value="advice" className="p-4 space-y-4">
                <Card className="border-none shadow-lg bg-gradient-to-br from-primary/5 to-primary/10">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        Farmer Advisory
                      </CardTitle>
                      <Badge className={getUrgencyBadge(advice.urgency)}>
                        {advice.urgency} priority
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-3 bg-background rounded-lg">
                      <p className="font-semibold text-lg mb-2">{advice.mainMessage}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Updated: {new Date().toLocaleTimeString()}
                      </div>
                    </div>

                    {advice.actionItems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          Action Items
                        </h4>
                        <div className="space-y-2">
                          {advice.actionItems.map((item, index) => (
                            <div key={index} className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
                              <span className="text-xs font-bold text-primary">{index + 1}.</span>
                              <span className="text-sm">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {advice.nextSteps.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary" />
                          Next Steps
                        </h4>
                        <div className="space-y-1">
                          {advice.nextSteps.map((step, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <ChevronRight className="h-3 w-3" />
                              {step}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button 
                      className="w-full"
                      onClick={speakAdvice}
                    >
                      <Volume2 className={cn("h-4 w-4 mr-2", isSpeaking && "animate-pulse")} />
                      {isSpeaking ? 'Stop' : 'Listen to Advice'}
                    </Button>
                  </CardContent>
                </Card>

                {/* Weather Impact */}
                <Card className="border-none shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ThermometerSun className="h-5 w-5" />
                      Weather Impact
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Sun className="h-4 w-4 text-yellow-500" />
                          <span className="text-sm">Sunlight</span>
                        </div>
                        <span className="text-sm font-medium">Good</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Droplets className="h-4 w-4 text-blue-500" />
                          <span className="text-sm">Rainfall</span>
                        </div>
                        <span className="text-sm font-medium">Moderate</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Gauge className="h-4 w-4 text-green-500" />
                          <span className="text-sm">Growth Rate</span>
                        </div>
                        <span className="text-sm font-medium">Normal</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      )}
    </div>
  );
};

export default NDVIAnalysis;