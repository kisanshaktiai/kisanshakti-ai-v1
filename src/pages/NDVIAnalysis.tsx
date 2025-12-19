import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { landsApi } from '@/services/landsApi';
import { NDVIMapView } from '@/components/land/NDVIMapView';
import { NDVITrendChart } from '@/components/land/NDVITrendChart';
import { NDVIHealthScore } from '@/components/land/NDVIHealthScore';
import { NDVIEarlyWarning } from '@/components/land/NDVIEarlyWarning';
import { NDVIPredictionCard } from '@/components/land/NDVIPredictionCard';
import { NDVIAlertBanner } from '@/components/land/NDVIAlertBanner';
import { useNDVIAnalysis } from '@/hooks/useNDVIAnalysis';
import { 
  ArrowLeft, 
  Map, 
  TrendingUp,
  TrendingDown, 
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
  Clock,
  MapPin,
  Minus,
  BarChart3,
  Target,
  Zap
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { cn } from '@/lib/utils';

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

const NDVIAnalysis = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id: urlLandId } = useParams<{ id?: string }>();
  const { session } = useAuthStore();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { speak, isSpeaking, stop } = useTextToSpeech();
  const [selectedLandId, setSelectedLandId] = useState<string | null>(urlLandId || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showAlertBanner, setShowAlertBanner] = useState(true);

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

  // Use new NDVI analysis hook
  const { 
    current: ndviCurrent, 
    history: ndviHistory, 
    prediction, 
    isLoading: ndviLoading, 
    refetch: refetchNDVI 
  } = useNDVIAnalysis(selectedLandId);

  // Get selected land details
  const selectedLand = lands?.find((l: any) => l.id === selectedLandId);

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
    return { lat: 20.5937, lng: 78.9629 };
  };

  // If route provides a land id, open that land; otherwise show the selection list
  useEffect(() => {
    if (urlLandId) {
      setSelectedLandId(urlLandId);
    } else {
      setSelectedLandId(null);
    }
  }, [urlLandId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchLands(), refetchNDVI()]);
      toast({
        title: t('ndvi.refresh.data_refreshed', '✅ Data Refreshed'),
        description: t('ndvi.refresh.latest_data', 'Latest satellite data loaded'),
      });
    } catch (error) {
      toast({
        title: t('ndvi.refresh.refresh_failed', '❌ Refresh Failed'),
        description: t('ndvi.refresh.try_again', 'Please try again'),
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const getHealthGradient = (ndvi: number) => {
    if (ndvi >= 0.7) return 'from-success to-success/80';
    if (ndvi >= 0.5) return 'from-primary to-primary/80';
    if (ndvi >= 0.3) return 'from-warning to-warning/80';
    return 'from-destructive to-destructive/80';
  };

  const speakSummary = () => {
    if (isSpeaking) {
      stop();
    } else {
      const ndvi = ndviCurrent?.ndvi_value ?? 0;
      const healthLabel = ndviCurrent?.metadata?.health_label ?? 'Unknown';
      const alerts = ndviCurrent?.metadata?.alerts ?? [];
      
      let message = i18n.language === 'hi'
        ? `आपकी फसल की स्थिति ${healthLabel} है। NDVI मान ${ndvi.toFixed(2)} है।`
        : `Your crop health status is ${healthLabel}. NDVI value is ${ndvi.toFixed(2)}.`;
      
      if (alerts.length > 0) {
        message += i18n.language === 'hi'
          ? ` चेतावनी: ${alerts[0]}`
          : ` Alert: ${alerts[0]}`;
      }
      
      speak(message);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-background via-background/95 to-muted/30">
      {/* Modern Mobile Header */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50"
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="hover:scale-110 transition-transform rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                {t('ndvi.title', 'NDVI Analysis')}
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Satellite className="h-3 w-3 animate-pulse text-primary" />
                {t('ndvi.satellite_monitoring', 'Satellite monitoring')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={speakSummary}
              className="hover:scale-110 transition-transform rounded-full"
            >
              <Volume2 className={cn("h-4 w-4", isSpeaking && "text-primary animate-pulse")} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="hover:scale-110 transition-all rounded-full"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Land Selection */}
      <AnimatePresence mode="wait">
        {!selectedLandId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                <Card className="border-none shadow-xl bg-gradient-to-br from-card via-card/95 to-muted/20 rounded-3xl overflow-hidden">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <div className="p-2 rounded-full bg-primary/10">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                      {t('ndvi.select_your_field', 'Select Your Field')}
                    </CardTitle>
                    <CardDescription>{t('ndvi.choose_field_analyze', 'Choose a field to analyze')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {landsLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                        ))}
                      </div>
                    ) : lands && lands.length > 0 ? (
                      <div className="space-y-3">
                        {lands.map((land: any, index: number) => (
                          <motion.div
                            key={land.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                          >
                            <Card
                              className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] border-border/50 bg-gradient-to-r from-card to-muted/10 rounded-2xl active:scale-[0.98]"
                              onClick={() => setSelectedLandId(land.id)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <h3 className="font-semibold text-base">{land.name}</h3>
                                    <div className="flex items-center gap-3 mt-1">
                                      <span className="text-xs text-muted-foreground">
                                        {land.area_acres} {t('common.acres', 'acres')}
                                      </span>
                                      {land.current_crop && (
                                        <Badge variant="secondary" className="text-xs rounded-full">
                                          {land.current_crop}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 space-y-4">
                        <TreePine className="h-12 w-12 mx-auto text-muted-foreground/50" />
                        <p className="text-muted-foreground">{t('ndvi.no_fields_found', 'No fields found')}</p>
                        <Button 
                          onClick={() => navigate('/app/lands')}
                          className="hover:scale-105 transition-transform rounded-full"
                        >
                          {t('ndvi.add_first_field', 'Add Your First Field')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NDVI Dashboard */}
      <AnimatePresence mode="wait">
        {selectedLandId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col"
          >
            {/* Alert Banner */}
            {showAlertBanner && ndviCurrent?.metadata && (
              <div className="px-4 pt-4">
                <NDVIAlertBanner
                  alerts={ndviCurrent.metadata.alerts || []}
                  healthLabel={ndviCurrent.metadata.health_label || 'Moderate'}
                  riskLevel={prediction?.risk_level || 'medium'}
                  onDismiss={() => setShowAlertBanner(false)}
                />
              </div>
            )}

            {/* Back Button */}
            <div className="px-4 pt-3 pb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLandId(null)}
                className="text-xs rounded-full"
              >
                <ArrowLeft className="mr-1 h-3 w-3" />
                {t('ndvi.change_field', 'Change Field')}
              </Button>
            </div>

            {/* Modern Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="mx-4 grid grid-cols-5 h-auto p-1 bg-muted/50 rounded-2xl">
                {[
                  { value: 'dashboard', icon: Gauge, label: t('ndvi.tabs.dashboard', 'Health') },
                  { value: 'prediction', icon: Sparkles, label: t('ndvi.tabs.prediction', 'Predict') },
                  { value: 'map', icon: Map, label: t('ndvi.tabs.map', 'Map') },
                  { value: 'trends', icon: BarChart3, label: t('ndvi.tabs.trends', 'Trends') },
                  { value: 'advice', icon: Lightbulb, label: t('ndvi.tabs.advice', 'Advice') },
                ].map((tab) => (
                  <TabsTrigger 
                    key={tab.value}
                    value={tab.value} 
                    className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-xl"
                  >
                    <div className="flex flex-col items-center py-1.5">
                      <tab.icon className="h-4 w-4 mb-0.5" />
                      <span className="text-[10px]">{tab.label}</span>
                    </div>
                  </TabsTrigger>
                ))}
              </TabsList>

              <ScrollArea className="flex-1">
                {/* Dashboard Tab */}
                <TabsContent value="dashboard" className="p-4 space-y-4">
                  {ndviLoading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-48 w-full rounded-2xl" />
                      <Skeleton className="h-36 w-full rounded-2xl" />
                    </div>
                  ) : ndviCurrent ? (
                    <>
                      {/* Health Score Card */}
                      <NDVIHealthScore
                        ndvi={ndviCurrent.ndvi_value}
                        trend={ndviCurrent.metadata?.ndvi_trend ?? 0}
                        healthLabel={ndviCurrent.metadata?.health_label ?? 'Moderate'}
                      />

                      {/* Quick Stats */}
                      <div className="grid grid-cols-2 gap-3">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.2 }}
                        >
                          <Card className="border-none shadow-lg rounded-2xl bg-gradient-to-br from-success/10 to-success/5">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Leaf className="h-4 w-4 text-success" />
                                <span className="text-xs text-muted-foreground">NDVI</span>
                              </div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold text-success">
                                  {ndviCurrent.ndvi_value.toFixed(3)}
                                </span>
                                {ndviCurrent.metadata?.ndvi_trend && (
                                  <span className={cn(
                                    "text-xs",
                                    ndviCurrent.metadata.ndvi_trend > 0 ? "text-success" : "text-destructive"
                                  )}>
                                    {ndviCurrent.metadata.ndvi_trend > 0 ? '+' : ''}{(ndviCurrent.metadata.ndvi_trend * 100).toFixed(2)}%
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {t('ndvi.vegetation_health', 'Vegetation Health')}
                              </p>
                            </CardContent>
                          </Card>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3 }}
                        >
                          <Card className="border-none shadow-lg rounded-2xl bg-gradient-to-br from-info/10 to-info/5">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Droplets className="h-4 w-4 text-info" />
                                <span className="text-xs text-muted-foreground">NDWI</span>
                              </div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold text-info">
                                  {(ndviCurrent.ndwi_value ?? 0).toFixed(3)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {t('ndvi.water_content', 'Water Content')}
                              </p>
                            </CardContent>
                          </Card>
                        </motion.div>
                      </div>

                      {/* NDVI Stats */}
                      {(ndviCurrent.min_ndvi || ndviCurrent.max_ndvi) && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 }}
                        >
                          <Card className="border-none shadow-lg rounded-2xl">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <Target className="h-4 w-4 text-primary" />
                                {t('ndvi.field_statistics', 'Field Statistics')}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="grid grid-cols-3 gap-3">
                                <div className="text-center p-2 rounded-xl bg-muted/50">
                                  <p className="text-xs text-muted-foreground">{t('ndvi.min', 'Min')}</p>
                                  <p className="text-lg font-semibold">{ndviCurrent.min_ndvi?.toFixed(3)}</p>
                                </div>
                                <div className="text-center p-2 rounded-xl bg-primary/10">
                                  <p className="text-xs text-muted-foreground">{t('ndvi.mean', 'Mean')}</p>
                                  <p className="text-lg font-semibold text-primary">{ndviCurrent.mean_ndvi?.toFixed(3)}</p>
                                </div>
                                <div className="text-center p-2 rounded-xl bg-muted/50">
                                  <p className="text-xs text-muted-foreground">{t('ndvi.max', 'Max')}</p>
                                  <p className="text-lg font-semibold">{ndviCurrent.max_ndvi?.toFixed(3)}</p>
                                </div>
                              </div>

                              {/* Satellite Info */}
                              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                                <div className="flex items-center gap-1">
                                  <Satellite className="h-3 w-3" />
                                  <span>{ndviCurrent.satellite_source || 'Sentinel-2'}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span>{new Date(ndviCurrent.date).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )}

                      {/* Early Warning */}
                      <NDVIEarlyWarning
                        metadata={ndviCurrent.metadata}
                        prediction={prediction}
                        ndviValue={ndviCurrent.ndvi_value}
                      />
                    </>
                  ) : (
                    <Card className="border-none shadow-lg rounded-2xl">
                      <CardContent className="flex flex-col items-center justify-center py-12">
                        <Satellite className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground text-center">
                          {t('ndvi.no_data', 'No satellite data available yet')}
                        </p>
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          {t('ndvi.check_back', 'Check back after next satellite pass')}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Prediction Tab */}
                <TabsContent value="prediction" className="p-4 space-y-4">
                  <NDVIPredictionCard
                    prediction={prediction}
                    currentNdvi={ndviCurrent?.ndvi_value ?? 0}
                  />

                  {/* Trend Summary */}
                  {ndviHistory.length > 1 && (
                    <Card className="border-none shadow-lg rounded-2xl">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Activity className="h-4 w-4 text-primary" />
                          {t('ndvi.recent_trend', 'Recent Trend')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {ndviHistory.slice(0, 5).map((item, index) => (
                            <div 
                              key={item.id}
                              className="flex items-center justify-between p-2 rounded-xl bg-muted/30"
                            >
                              <span className="text-xs text-muted-foreground">
                                {new Date(item.date).toLocaleDateString()}
                              </span>
                              <div className="flex items-center gap-2">
                                <Progress 
                                  value={item.ndvi_value * 100} 
                                  className="w-20 h-2"
                                />
                                <span className="text-sm font-medium w-12 text-right">
                                  {item.ndvi_value.toFixed(3)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
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
                  {ndviHistory.length > 1 ? (
                    <NDVITrendChart 
                      data={ndviHistory.map(d => ({
                        date: d.date,
                        ndvi: d.ndvi_value,
                        evi: d.evi_value || 0,
                        ndwi: d.ndwi_value || 0,
                        savi: d.savi_value || 0
                      }))}
                      selectedIndex="ndvi"
                    />
                  ) : (
                    <Card className="border-none shadow-lg rounded-2xl">
                      <CardContent className="flex flex-col items-center justify-center py-12">
                        <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground text-center">
                          {t('ndvi.not_enough_data', 'Not enough data for trends')}
                        </p>
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          {t('ndvi.need_more_data', 'Need at least 2 data points')}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Advice Tab */}
                <TabsContent value="advice" className="p-4 space-y-4">
                  <Card className="border-none shadow-lg bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <div className="p-2 rounded-full bg-primary/10">
                            <Zap className="h-4 w-4 text-primary" />
                          </div>
                          {t('ndvi.ai_advisory', 'AI Advisory')}
                        </CardTitle>
                        <Badge variant="secondary" className="rounded-full">
                          <Sparkles className="h-3 w-3 mr-1" />
                          {t('ndvi.ai_powered', 'AI Powered')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {prediction?.recommended_actions && prediction.recommended_actions.length > 0 ? (
                        <div className="space-y-3">
                          {prediction.recommended_actions.map((action, index) => (
                            <motion.div
                              key={index}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.1 }}
                              className="flex items-start gap-3 p-3 bg-background rounded-xl"
                            >
                              <div className="p-1.5 rounded-full bg-primary/10 mt-0.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <p className="text-sm flex-1">{action}</p>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 bg-background rounded-xl text-center">
                          <p className="text-sm text-muted-foreground">
                            {t('ndvi.no_recommendations', 'Continue regular monitoring')}
                          </p>
                        </div>
                      )}

                      <Button 
                        className="w-full rounded-xl"
                        onClick={speakSummary}
                      >
                        <Volume2 className={cn("h-4 w-4 mr-2", isSpeaking && "animate-pulse")} />
                        {isSpeaking ? t('ndvi.stop', 'Stop') : t('ndvi.listen_advice', 'Listen to Advice')}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Field Info */}
                  <Card className="border-none shadow-lg rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        {t('ndvi.field_info', 'Field Information')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1 p-2 rounded-xl bg-muted/30">
                          <span className="text-xs text-muted-foreground">{t('ndvi.field_name', 'Field')}</span>
                          <p className="font-medium text-sm">{selectedLand?.name}</p>
                        </div>
                        <div className="space-y-1 p-2 rounded-xl bg-muted/30">
                          <span className="text-xs text-muted-foreground">{t('ndvi.area', 'Area')}</span>
                          <p className="font-medium text-sm">{selectedLand?.area_acres} {t('common.acres', 'acres')}</p>
                        </div>
                        {selectedLand?.current_crop && (
                          <div className="space-y-1 p-2 rounded-xl bg-muted/30">
                            <span className="text-xs text-muted-foreground">{t('ndvi.current_crop', 'Crop')}</span>
                            <p className="font-medium text-sm">{selectedLand.current_crop}</p>
                          </div>
                        )}
                        {selectedLand?.soil_type && (
                          <div className="space-y-1 p-2 rounded-xl bg-muted/30">
                            <span className="text-xs text-muted-foreground">{t('ndvi.soil_type', 'Soil')}</span>
                            <p className="font-medium text-sm">{selectedLand.soil_type}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NDVIAnalysis;
