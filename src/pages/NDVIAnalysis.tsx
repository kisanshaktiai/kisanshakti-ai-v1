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
import { landsApi } from '@/services/landsApi';
import { NDVIMapView } from '@/components/land/NDVIMapView';
import { NDVITrendChart } from '@/components/land/NDVITrendChart';
import { GoogleMapsScriptProvider } from '@/components/maps/GoogleMapsScriptProvider';
import { useNDVIAnalysis } from '@/hooks/useNDVIAnalysis';
import { 
  getScientificHealthStatus, 
  formatNDVI, 
  NDVI_THRESHOLDS,
  getTrendDirection 
} from '@/lib/ndviScience';
import { 
  ArrowLeft, 
  Map, 
  TrendingUp,
  TrendingDown, 
  Activity,
  Droplets,
  Leaf,
  AlertTriangle,
  Calendar,
  Satellite,
  RefreshCw,
  Volume2,
  TreePine,
  Sparkles,
  Gauge,
  Lightbulb,
  CheckCircle2,
  MapPin,
  Minus,
  BarChart3,
  Target,
  Zap,
  Heart,
  Eye,
  Waves,
  Sun,
  CloudRain,
  Phone,
  Camera,
  Share2,
  Info
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
  last_ndvi_value?: number;
  ndvi_status?: string;
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
  const [activeTab, setActiveTab] = useState('health');

  // Fetch lands
  const { data: lands, isLoading: landsLoading, refetch: refetchLands } = useQuery({
    queryKey: ['lands', session?.farmerId, tenant?.id],
    queryFn: async () => {
      const data = await landsApi.fetchLands();
      return (data || []) as LandWithBoundary[];
    },
    enabled: !!session?.farmerId && !!tenant?.id,
  });

  // NDVI data hook
  const { 
    current: ndviCurrent, 
    history: ndviHistory, 
    prediction, 
    isLoading: ndviLoading, 
    refetch: refetchNDVI 
  } = useNDVIAnalysis(selectedLandId);

  const selectedLand = lands?.find((l) => l.id === selectedLandId);

  // Set land from URL
  useEffect(() => {
    if (urlLandId) {
      setSelectedLandId(urlLandId);
    }
  }, [urlLandId]);

  const getBoundaryCoordinates = () => {
    if (!selectedLand?.boundary_polygon_old?.coordinates?.[0]) return [];
    return selectedLand.boundary_polygon_old.coordinates[0].map((c: number[]) => ({ lat: c[1], lng: c[0] }));
  };

  const getCenterCoordinates = () => {
    if (selectedLand?.center_point_old?.coordinates) {
      return { lat: selectedLand.center_point_old.coordinates[1], lng: selectedLand.center_point_old.coordinates[0] };
    }
    return { lat: 20.5937, lng: 78.9629 };
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchLands(), refetchNDVI()]);
    toast({ title: t('ndvi.refresh.data_refreshed', '✅ Data Refreshed') });
    setIsRefreshing(false);
  };

  const speakSummary = () => {
    if (isSpeaking) return stop();
    const ndvi = ndviCurrent?.ndvi_value ?? 0;
    const status = getScientificHealthStatus(ndvi);
    speak(`Crop health: ${status.label}. NDVI value: ${formatNDVI(ndvi, 2)}`);
  };

  // Scientific health status (no 0-100 conversion)
  const currentNdvi = ndviCurrent?.ndvi_value ?? 0;
  const healthStatus = getScientificHealthStatus(currentNdvi);
  
  // SVG ring - uses NDVI directly (0-1 scale)
  const ringSize = 140;
  const strokeW = 10;
  const radius = (ringSize - strokeW) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.max(0, Math.min(1, currentNdvi)) * circumference);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 overflow-x-hidden">
      {/* Glassmorphic Header */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 backdrop-blur-2xl bg-background/60 border-b border-border/30"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full hover:bg-primary/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-primary via-emerald-500 to-primary bg-clip-text text-transparent">
                {t('ndvi.title', 'NDVI Analysis')}
              </h1>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Satellite className="h-3 w-3 text-primary animate-pulse" />
                {t('ndvi.satellite_monitoring', 'Satellite Monitoring')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={speakSummary} className="rounded-full h-9 w-9">
              <Volume2 className={cn("h-4 w-4", isSpeaking && "text-primary animate-pulse")} />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing} className="rounded-full h-9 w-9">
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence mode="wait">
        {/* Land Selection Screen */}
        {!selectedLandId && (
          <motion.div
            key="selection"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4"
          >
            <Card className="border-0 shadow-2xl rounded-3xl bg-gradient-to-br from-card via-card to-muted/30 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="p-2 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  {t('ndvi.select_your_field', 'Select Your Field')}
                </CardTitle>
                <CardDescription>{t('ndvi.choose_field_analyze', 'Choose a field for satellite analysis')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pb-6">
                {landsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
                  </div>
                ) : lands && lands.length > 0 ? (
                  lands.map((land, i) => {
                    const landHealth = land.last_ndvi_value ? getScientificHealthStatus(land.last_ndvi_value) : null;
                    return (
                    <motion.div
                      key={land.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedLandId(land.id)}
                      className="group cursor-pointer"
                    >
                      <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] rounded-2xl overflow-hidden bg-gradient-to-r from-card to-muted/20">
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br",
                            landHealth ? landHealth.bgColor : "from-muted to-muted/50"
                          )}>
                            <Leaf className={cn(
                              "h-6 w-6",
                              landHealth ? landHealth.textColor : "text-muted-foreground"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate">{land.name}</h3>
                            <p className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{land.area_acres?.toFixed(2)} acres</span>
                              {land.current_crop && <Badge variant="secondary" className="text-[10px] h-5">{land.current_crop}</Badge>}
                            </p>
                          </div>
                          {land.last_ndvi_value ? (
                            <div className="text-right">
                              <p className={cn("text-lg font-bold", landHealth?.textColor)}>
                                {formatNDVI(land.last_ndvi_value)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{landHealth?.label}</p>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">No Data</Badge>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  )})
                ) : (
                  <div className="text-center py-12">
                    <TreePine className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">{t('ndvi.no_fields_found', 'No fields found')}</p>
                    <Button onClick={() => navigate('/app/lands/add')} className="mt-4 rounded-full">
                      {t('ndvi.add_first_field', 'Add Your First Field')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Analysis Dashboard */}
        {selectedLandId && (
          <motion.div
            key="analysis"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col flex-1"
          >
            {/* Field Selector Bar */}
            <div className="px-4 py-2 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLandId(null)}
                className="text-xs rounded-full h-8 px-3"
              >
                <ArrowLeft className="mr-1 h-3 w-3" />
                {t('ndvi.change_field', 'Change')}
              </Button>
              <div className="flex-1 truncate">
                <span className="text-sm font-medium">{selectedLand?.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{selectedLand?.area_acres?.toFixed(2)} ac</span>
              </div>
            </div>

            {/* Futuristic Tab Navigation */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <div className="px-4">
                <TabsList className="w-full grid grid-cols-5 h-14 p-1.5 bg-muted/40 backdrop-blur-xl rounded-2xl border border-border/30">
                  {[
                    { value: 'health', icon: Heart, label: 'Health' },
                    { value: 'predict', icon: Sparkles, label: 'Predict' },
                    { value: 'map', icon: Map, label: 'Map' },
                    { value: 'trends', icon: BarChart3, label: 'Trends' },
                    { value: 'advice', icon: Lightbulb, label: 'Advice' },
                  ].map((tab) => (
                    <TabsTrigger 
                      key={tab.value}
                      value={tab.value} 
                      className="data-[state=active]:bg-background data-[state=active]:shadow-lg data-[state=active]:border-primary/20 rounded-xl transition-all duration-300"
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <tab.icon className="h-4 w-4" />
                        <span className="text-[10px] font-medium">{tab.label}</span>
                      </div>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <ScrollArea className="flex-1 mt-3 h-[calc(100vh-220px)]">
                {/* HEALTH TAB */}
                <TabsContent value="health" className="px-3 sm:px-4 pb-24 space-y-3 sm:space-y-4 mt-0">
                  {ndviLoading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-52 rounded-3xl" />
                      <div className="grid grid-cols-2 gap-3">
                        <Skeleton className="h-28 rounded-2xl" />
                        <Skeleton className="h-28 rounded-2xl" />
                      </div>
                    </div>
                  ) : ndviCurrent ? (
                    <>
                      {/* Hero Health Ring - Scientific NDVI Display */}
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={cn("relative rounded-3xl p-6 bg-gradient-to-br", healthStatus.bgColor)}
                      >
                        <div className="absolute top-4 right-4">
                          <Badge className="bg-background/80 backdrop-blur-xl text-foreground border-0 shadow-lg">
                            <Sparkles className="h-3 w-3 mr-1 text-primary" />
                            Scientific Analysis
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-6">
                          <div className="relative">
                            <svg width={ringSize} height={ringSize} className="-rotate-90">
                              <circle
                                cx={ringSize / 2}
                                cy={ringSize / 2}
                                r={radius}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={strokeW}
                                className="text-muted/20"
                              />
                              <motion.circle
                                cx={ringSize / 2}
                                cy={ringSize / 2}
                                r={radius}
                                fill="none"
                                strokeWidth={strokeW}
                                strokeLinecap="round"
                                className={healthStatus.strokeColor}
                                initial={{ strokeDashoffset: circumference }}
                                animate={{ strokeDashoffset: offset }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                style={{ strokeDasharray: circumference }}
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <motion.span 
                                className={cn("text-3xl font-black", healthStatus.textColor)}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.3, type: "spring" }}
                              >
                                {formatNDVI(currentNdvi)}
                              </motion.span>
                              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">NDVI</span>
                            </div>
                          </div>
                          
                          <div className="flex-1 space-y-3">
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
                              <p className={cn("text-xl font-bold", healthStatus.textColor)}>{healthStatus.label}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {(ndviCurrent.metadata?.ndvi_trend ?? 0) > 0 ? (
                                <TrendingUp className="h-4 w-4 text-green-600" />
                              ) : (ndviCurrent.metadata?.ndvi_trend ?? 0) < 0 ? (
                                <TrendingDown className="h-4 w-4 text-red-600" />
                              ) : (
                                <Minus className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="text-sm text-muted-foreground">
                                {(ndviCurrent.metadata?.ndvi_trend ?? 0) > 0 ? 'Improving' : (ndviCurrent.metadata?.ndvi_trend ?? 0) < 0 ? 'Declining' : 'Stable'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Scientific Reference */}
                        <div className="mt-4 pt-3 border-t border-border/30">
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            NASA/ESA Standard: 0.0 (bare) → 1.0 (dense) | Healthy ≥{NDVI_THRESHOLDS.HEALTHY} | Excellent ≥{NDVI_THRESHOLDS.EXCELLENT}
                          </p>
                        </div>
                      </motion.div>

                      {/* Quick Stats Grid - Mobile optimized */}
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                          <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 overflow-hidden">
                            <CardContent className="p-3 sm:p-4">
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                                <div className="p-1 sm:p-1.5 rounded-lg bg-emerald-500/20">
                                  <Leaf className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-500" />
                                </div>
                                <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">NDVI</span>
                              </div>
                              <p className="text-xl sm:text-2xl font-black text-emerald-500">{ndviCurrent.ndvi_value.toFixed(2)}</p>
                              <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 sm:mt-1 truncate">Vegetation</p>
                            </CardContent>
                          </Card>
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                          <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 overflow-hidden">
                            <CardContent className="p-3 sm:p-4">
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                                <div className="p-1 sm:p-1.5 rounded-lg bg-blue-500/20">
                                  <Droplets className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-500" />
                                </div>
                                <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">NDWI</span>
                              </div>
                              <p className="text-xl sm:text-2xl font-black text-blue-500">{(ndviCurrent.ndwi_value ?? 0).toFixed(2)}</p>
                              <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 sm:mt-1 truncate">Water</p>
                            </CardContent>
                          </Card>
                        </motion.div>
                      </div>

                      {/* Detailed Stats */}
                      {(ndviCurrent.min_ndvi !== null || ndviCurrent.max_ndvi !== null) && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                          <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
                            <CardHeader className="pb-2 pt-4 px-4">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <Target className="h-4 w-4 text-primary" />
                                Field Statistics
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-4">
                              <div className="grid grid-cols-3 gap-2">
                                <div className="text-center p-3 rounded-xl bg-muted/50">
                                  <p className="text-[10px] text-muted-foreground uppercase">Min</p>
                                  <p className="text-lg font-bold">{ndviCurrent.min_ndvi?.toFixed(2) ?? '-'}</p>
                                </div>
                                <div className="text-center p-3 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                                  <p className="text-[10px] text-primary uppercase font-medium">Mean</p>
                                  <p className="text-lg font-bold text-primary">{ndviCurrent.mean_ndvi?.toFixed(2) ?? '-'}</p>
                                </div>
                                <div className="text-center p-3 rounded-xl bg-muted/50">
                                  <p className="text-[10px] text-muted-foreground uppercase">Max</p>
                                  <p className="text-lg font-bold">{ndviCurrent.max_ndvi?.toFixed(2) ?? '-'}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-xs text-muted-foreground mt-3 pt-3 border-t border-border/30">
                                <div className="flex items-center gap-1">
                                  <Satellite className="h-3 w-3" />
                                  {ndviCurrent.satellite_source || 'Sentinel-2'}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(ndviCurrent.date).toLocaleDateString()}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )}

                      {/* Alerts */}
                      {ndviCurrent.metadata?.alerts && ndviCurrent.metadata.alerts.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                          <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-r from-amber-500/10 to-amber-500/5 overflow-hidden">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className="p-2 rounded-xl bg-amber-500/20">
                                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                                </div>
                                <div className="flex-1">
                                  <p className="font-semibold text-amber-600">Attention Needed</p>
                                  <ul className="mt-2 space-y-1">
                                    {ndviCurrent.metadata.alerts.map((alert, i) => (
                                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <span className="text-amber-500 mt-1">•</span>
                                        {alert}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )}
                    </>
                  ) : (
                    <Card className="border-0 shadow-lg rounded-3xl">
                      <CardContent className="flex flex-col items-center justify-center py-16">
                        <div className="p-4 rounded-full bg-muted/50 mb-4">
                          <Satellite className="h-10 w-10 text-muted-foreground/50" />
                        </div>
                        <p className="text-muted-foreground font-medium">{t('ndvi.no_data', 'No satellite data yet')}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('ndvi.check_back', 'Check back after next satellite pass')}</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* PREDICTION TAB */}
                <TabsContent value="predict" className="px-3 sm:px-4 pb-24 space-y-3 sm:space-y-4 mt-0">
                  {!prediction ? (
                    <Card className="border-dashed border-2 rounded-3xl">
                      <CardContent className="flex flex-col items-center justify-center py-16">
                        <Sparkles className="h-10 w-10 text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground">Predictions require more data</p>
                        <p className="text-xs text-muted-foreground mt-1">Continue monitoring for AI insights</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      {/* AI Prediction Hero */}
                      <Card className="border-0 shadow-xl rounded-3xl bg-gradient-to-br from-violet-500/10 via-card to-primary/5 overflow-hidden">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-radial from-primary/10 to-transparent rounded-full blur-3xl" />
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20">
                              <Sparkles className="h-5 w-5 text-primary" />
                            </div>
                            AI Prediction
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Current */}
                          <div className="flex items-center justify-between p-3 rounded-xl bg-background/60 backdrop-blur-sm">
                            <span className="text-sm text-muted-foreground">Current NDVI</span>
                            <span className="text-xl font-bold">{(ndviCurrent?.ndvi_value ?? 0).toFixed(3)}</span>
                          </div>

                          {/* 7-Day */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">7-Day Forecast</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {prediction.days7.trend_direction === 'improving' ? (
                                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                                ) : prediction.days7.trend_direction === 'declining' ? (
                                  <TrendingDown className="h-4 w-4 text-red-500" />
                                ) : (
                                  <Minus className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="font-semibold">{prediction.days7.predicted_ndvi.toFixed(3)}</span>
                              </div>
                            </div>
                            <Progress value={prediction.days7.predicted_ndvi * 100} className="h-2" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{prediction.days7.confidence}% confidence</span>
                            </div>
                          </div>

                          {/* 14-Day */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">14-Day Forecast</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {prediction.days14.trend_direction === 'improving' ? (
                                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                                ) : prediction.days14.trend_direction === 'declining' ? (
                                  <TrendingDown className="h-4 w-4 text-red-500" />
                                ) : (
                                  <Minus className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="font-semibold">{prediction.days14.predicted_ndvi.toFixed(3)}</span>
                              </div>
                            </div>
                            <Progress value={prediction.days14.predicted_ndvi * 100} className="h-2" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{prediction.days14.confidence}% confidence</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Recent History */}
                      {ndviHistory.length > 1 && (
                        <Card className="border-0 shadow-lg rounded-2xl">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Activity className="h-4 w-4 text-primary" />
                              Recent Data Points
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {ndviHistory.slice(0, 5).map((item) => (
                              <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30">
                                <span className="text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString()}</span>
                                <div className="flex items-center gap-2">
                                  <Progress value={item.ndvi_value * 100} className="w-16 h-1.5" />
                                  <span className="text-sm font-medium w-14 text-right">{item.ndvi_value.toFixed(3)}</span>
                                </div>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                </TabsContent>

                {/* MAP TAB */}
                <TabsContent value="map" className="px-3 sm:px-4 pb-24 mt-0">
                  <GoogleMapsScriptProvider>
                    <NDVIMapView 
                      landId={selectedLandId}
                      boundary={getBoundaryCoordinates()}
                      centerLat={getCenterCoordinates().lat}
                      centerLng={getCenterCoordinates().lng}
                      areaAcres={selectedLand?.area_acres}
                      soilType={selectedLand?.soil_type}
                      currentCrop={selectedLand?.current_crop}
                    />
                  </GoogleMapsScriptProvider>
                </TabsContent>

                {/* TRENDS TAB */}
                <TabsContent value="trends" className="px-3 sm:px-4 pb-24 mt-0">
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
                    <Card className="border-0 shadow-lg rounded-3xl">
                      <CardContent className="flex flex-col items-center justify-center py-16">
                        <Activity className="h-10 w-10 text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground">Not enough data for trends</p>
                        <p className="text-xs text-muted-foreground mt-1">Need at least 2 data points</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* ADVICE TAB */}
                <TabsContent value="advice" className="px-3 sm:px-4 pb-24 space-y-3 sm:space-y-4 mt-0">
                  <Card className="border-0 shadow-xl rounded-3xl bg-gradient-to-br from-primary/5 via-card to-emerald-500/5 overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-emerald-500/20">
                            <Zap className="h-5 w-5 text-primary" />
                          </div>
                          AI Recommendations
                        </CardTitle>
                        <Badge className="bg-primary/10 text-primary border-0">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Smart
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {prediction?.recommended_actions && prediction.recommended_actions.length > 0 ? (
                        prediction.recommended_actions.map((action, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="flex items-start gap-3 p-3 bg-background/60 backdrop-blur-sm rounded-xl"
                          >
                            <div className="p-1.5 rounded-lg bg-emerald-500/20 mt-0.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            </div>
                            <p className="text-sm flex-1">{action}</p>
                          </motion.div>
                        ))
                      ) : (
                        <div className="p-4 bg-background/60 rounded-xl text-center">
                          <p className="text-sm text-muted-foreground">Continue regular monitoring</p>
                        </div>
                      )}
                      
                      <Button onClick={speakSummary} className="w-full rounded-xl h-12 mt-4">
                        <Volume2 className={cn("h-4 w-4 mr-2", isSpeaking && "animate-pulse")} />
                        {isSpeaking ? 'Stop' : 'Listen to Advice'}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Field Info Card */}
                  <Card className="border-0 shadow-lg rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        Field Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 rounded-xl bg-muted/30">
                          <p className="text-[10px] text-muted-foreground uppercase">Field</p>
                          <p className="font-medium text-sm truncate">{selectedLand?.name}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/30">
                          <p className="text-[10px] text-muted-foreground uppercase">Area</p>
                          <p className="font-medium text-sm">{selectedLand?.area_acres?.toFixed(2)} acres</p>
                        </div>
                        {selectedLand?.current_crop && (
                          <div className="p-3 rounded-xl bg-muted/30">
                            <p className="text-[10px] text-muted-foreground uppercase">Crop</p>
                            <p className="font-medium text-sm">{selectedLand.current_crop}</p>
                          </div>
                        )}
                        {selectedLand?.soil_type && (
                          <div className="p-3 rounded-xl bg-muted/30">
                            <p className="text-[10px] text-muted-foreground uppercase">Soil</p>
                            <p className="font-medium text-sm capitalize">{selectedLand.soil_type}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Quick Actions */}
                  <div className="grid grid-cols-3 gap-3">
                    <Button variant="outline" className="h-auto py-4 flex-col gap-2 rounded-2xl">
                      <Phone className="h-5 w-5 text-primary" />
                      <span className="text-xs">Call Expert</span>
                    </Button>
                    <Button variant="outline" className="h-auto py-4 flex-col gap-2 rounded-2xl">
                      <Camera className="h-5 w-5 text-primary" />
                      <span className="text-xs">Take Photo</span>
                    </Button>
                    <Button variant="outline" className="h-auto py-4 flex-col gap-2 rounded-2xl">
                      <Share2 className="h-5 w-5 text-primary" />
                      <span className="text-xs">Share</span>
                    </Button>
                  </div>
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