import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  ArrowLeft, Edit, Trash2, Share2, Download, MapPin, 
  Droplets, Mountain, Sprout, Calendar, Camera, Activity,
  AlertTriangle, TrendingUp, History, FileText, Plus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { landsApi } from '@/services/landsApi';
import { isolatedSupabase } from '@/services/dataIsolationService';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { LandDetailsSkeleton } from '@/components/skeletons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar
} from 'recharts';

interface Land {
  id: string;
  name: string;
  area_acres: number;
  area_guntas?: number;
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  current_crop?: string;
  crop_stage?: string;
  soil_type?: string;
  irrigation_source?: string;
  water_source?: string;
  soil_ph?: number;
  organic_carbon_percent?: number;
  nitrogen_kg_per_ha?: number;
  phosphorus_kg_per_ha?: number;
  potassium_kg_per_ha?: number;
  survey_number?: string;
  ownership_type?: string;
  last_soil_test_date?: string;
  last_sowing_date?: string;
  expected_harvest_date?: string;
  created_at: string;
  updated_at: string;
}

interface LandActivity {
  id: string;
  activity_date: string;
  activity_type: string;
  description?: string;
  cost?: number;
  quantity?: number;
  unit?: string;
  notes?: string;
}

interface CropHistory {
  id: string;
  crop_name: string;
  variety?: string;
  planting_date: string;
  harvest_date?: string;
  yield_kg_per_acre?: number;
  growth_stage?: string;
  season?: string;
  status?: string;
  notes?: string;
}

export default function LandDetails() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();
  
  const [land, setLand] = useState<Land | null>(null);
  const [activities, setActivities] = useState<LandActivity[]>([]);
  const [cropHistory, setCropHistory] = useState<CropHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (id) {
      fetchLandDetails();
      fetchActivities();
      fetchCropHistory();
    }
  }, [id]);

  // Real-time subscription for land data
  useEffect(() => {
    if (!id) return;

    const landChannel = supabase
      .channel(`land-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'lands',
        filter: `id=eq.${id}`
      }, () => {
        console.log('🔄 Land data changed, refetching...');
        fetchLandDetails();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(landChannel);
    };
  }, [id]);

  // Real-time subscription for land activities
  useEffect(() => {
    if (!id) return;

    const activitiesChannel = supabase
      .channel(`land-activities-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'land_activities',
        filter: `land_id=eq.${id}`
      }, () => {
        console.log('🔄 Land activities changed, refetching...');
        fetchActivities();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(activitiesChannel);
    };
  }, [id]);

  const fetchLandDetails = async () => {
    if (!id || !user?.id) return;
    
    try {
      const data = await landsApi.fetchLandById(id);
      
      if (!data) {
        toast({
          title: t('lands.details.error.not_found_title'),
          description: t('lands.details.error.not_found_message'),
          variant: 'destructive',
        });
        navigate('/app/lands');
        return;
      }
      
      setLand(data as Land);
    } catch (error) {
      console.error('Error fetching land details:', error);
      toast({
        title: t('lands.details.error.not_found_title'),
        description: t('lands.details.error.fetch_failed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchActivities = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await isolatedSupabase
        .from('land_activities')
        .select('*')
        .eq('land_id', id)
        .order('activity_date', { ascending: false })
        .limit(10);

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  const fetchCropHistory = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await isolatedSupabase
        .from('crop_history')
        .select('*')
        .eq('land_id', id)
        .order('planting_date', { ascending: false });

      if (error) throw error;
      setCropHistory(data || []);
    } catch (error) {
      console.error('Error fetching crop history:', error);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    
    try {
      await landsApi.deleteLand(id);

      toast({
        title: t('lands.details.delete.success_title'),
        description: t('lands.details.delete.success_message'),
      });
      navigate('/app/lands');
    } catch (error) {
      console.error('Error deleting land:', error);
      toast({
        title: t('lands.details.delete.error_title'),
        description: t('lands.details.delete.error_message'),
        variant: 'destructive',
      });
    }
  };

  const getSoilHealthScore = () => {
    if (!land?.soil_ph && !land?.organic_carbon_percent) return 0;
    
    let score = 0;
    let factors = 0;
    
    if (land.soil_ph) {
      factors++;
      if (land.soil_ph >= 6.0 && land.soil_ph <= 7.5) score += 100;
      else if (land.soil_ph >= 5.5 && land.soil_ph <= 8.0) score += 70;
      else score += 40;
    }
    
    if (land.organic_carbon_percent) {
      factors++;
      if (land.organic_carbon_percent >= 0.75) score += 100;
      else if (land.organic_carbon_percent >= 0.5) score += 70;
      else score += 40;
    }
    
    if (land.nitrogen_kg_per_ha) {
      factors++;
      if (land.nitrogen_kg_per_ha >= 280) score += 100;
      else if (land.nitrogen_kg_per_ha >= 140) score += 70;
      else score += 40;
    }
    
    return factors > 0 ? Math.round(score / factors) : 0;
  };

  const soilHealthScore = getSoilHealthScore();
  
  const soilHealthData = [
    { name: 'pH', value: land?.soil_ph ? (land.soil_ph / 14) * 100 : 0, fill: 'hsl(var(--success))' },
    { name: 'Organic Carbon', value: land?.organic_carbon_percent ? land.organic_carbon_percent * 100 : 0, fill: 'hsl(var(--warning))' },
    { name: 'NPK', value: land?.nitrogen_kg_per_ha ? Math.min((land.nitrogen_kg_per_ha / 400) * 100, 100) : 0, fill: 'hsl(var(--info))' },
  ];

  const activityData = activities.reduce((acc: any[], activity) => {
    const date = new Date(activity.activity_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const existing = acc.find(item => item.date === date);
    
    if (existing) {
      existing.activities++;
      existing.cost = (existing.cost || 0) + (activity.cost || 0);
    } else {
      acc.push({
        date,
        activities: 1,
        cost: activity.cost || 0,
      });
    }
    
    return acc;
  }, []);

  const yieldData = cropHistory.map(crop => ({
    crop: crop.crop_name,
    yield: crop.yield_kg_per_acre || 0,
    revenue: 0, // Revenue data not available in current schema
  }));

  if (loading) {
    return <LandDetailsSkeleton />;
  }

  if (!land) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('lands.details.not_found')}</p>
        <Button onClick={() => navigate('/app/lands')} className="mt-4">
          {t('lands.details.back_to_lands')}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background pb-20 md:pb-6">
      {/* Modern Mobile-First Header */}
      <div className="sticky top-0 z-20 glassmorphism-strong border-b">
        <div className="container max-w-7xl">
          <div className="flex items-center justify-between py-3">
            {/* Back Button - Compact Touch Target */}
            <Button
              variant="ghost"
              size="default"
              onClick={() => navigate('/app/lands')}
              className="min-h-[40px] min-w-[40px] rounded-xl"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            {/* Land Info */}
            <div className="flex-1 px-3 min-w-0">
              <h1 className="text-lg md:text-xl font-bold truncate text-foreground">
                {land.name}
              </h1>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <p className="truncate">
                  {land.village && `${land.village}, `}{land.taluka || land.district}
                </p>
              </div>
            </div>

            {/* Action Buttons - Compact Touch Targets */}
            <div className="flex gap-2">
              <Button 
                variant="outline"
                size="icon"
                onClick={() => navigate(`/app/lands/${id}/edit`)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-primary/5 border-primary/20 hover:bg-primary/10"
              >
                <Edit className="h-4 w-4 text-primary" />
              </Button>
              <Button 
                variant="outline"
                size="icon"
                onClick={() => setShowDeleteDialog(true)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-destructive/5 border-destructive/20 hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats - Mobile-First Grid */}
      <div className="container max-w-7xl mt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Total Area Card */}
          <Card className="group hover:shadow-lg transition-all duration-300 border-border/50 bg-gradient-to-br from-card to-card/80 overflow-hidden">
            <CardContent className="p-4 relative">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/5 blur-2xl" />
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">{t('lands.details.total_area')}</p>
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-bold text-foreground">
                    {land.area_acres}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('lands.map.area.acres')} {land.area_guntas && `· ${land.area_guntas} ${t('lands.map.area.guntha')}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Crop Card */}
          <Card className="group hover:shadow-lg transition-all duration-300 border-border/50 bg-gradient-to-br from-card to-card/80 overflow-hidden">
            <CardContent className="p-4 relative">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-success/5 blur-2xl" />
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-success/10">
                    <Sprout className="h-4 w-4 text-success" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">{t('lands.details.current_crop')}</p>
                </div>
                <div>
                  <p className="text-xl md:text-2xl font-bold text-foreground line-clamp-1">
                    {land.current_crop || t('lands.details.no_crop')}
                  </p>
                  {land.crop_stage && (
                    <Badge variant="secondary" className="mt-1.5 text-xs bg-success/10 text-success border-success/20">
                      {land.crop_stage}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Soil Health Card */}
          <Card className="group hover:shadow-lg transition-all duration-300 border-border/50 bg-gradient-to-br from-card to-card/80 overflow-hidden">
            <CardContent className="p-4 relative">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-warning/5 blur-2xl" />
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-warning/10">
                    <Mountain className="h-4 w-4 text-warning" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">{t('lands.details.soil_health')}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-warning to-success transition-all duration-500"
                        style={{ width: `${soilHealthScore}%` }}
                      />
                    </div>
                    <span className="text-xl font-bold text-foreground">{soilHealthScore}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {soilHealthScore >= 70 ? t('lands.details.health_good') : soilHealthScore >= 40 ? t('lands.details.health_fair') : t('lands.details.health_needs_care')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Irrigation Card */}
          <Card className="group hover:shadow-lg transition-all duration-300 border-border/50 bg-gradient-to-br from-card to-card/80 overflow-hidden">
            <CardContent className="p-4 relative">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-info/5 blur-2xl" />
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-info/10">
                    <Droplets className="h-4 w-4 text-info" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">{t('lands.details.irrigation')}</p>
                </div>
                <div>
                  <p className="text-lg md:text-xl font-bold text-foreground line-clamp-1">
                    {land.irrigation_source || t('lands.details.not_set')}
                  </p>
                  {land.water_source && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {land.water_source}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modern Tabs - Large Touch Targets */}
      <div className="container max-w-7xl mt-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="relative">
            <TabsList className="w-full h-auto p-1.5 bg-muted/30 rounded-2xl grid grid-cols-5 gap-1">
              <TabsTrigger 
                value="overview" 
                className="min-h-[48px] text-sm font-medium rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:text-primary transition-all"
              >
                <div className="flex flex-col items-center gap-1">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('lands.details.tabs.overview')}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="soil" 
                className="min-h-[48px] text-sm font-medium rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:text-primary transition-all"
              >
                <div className="flex flex-col items-center gap-1">
                  <Mountain className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('lands.details.tabs.soil')}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="activities" 
                className="min-h-[48px] text-sm font-medium rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:text-primary transition-all"
              >
                <div className="flex flex-col items-center gap-1">
                  <Activity className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('lands.details.tabs.activities')}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="min-h-[48px] text-sm font-medium rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:text-primary transition-all"
              >
                <div className="flex flex-col items-center gap-1">
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('lands.details.tabs.history')}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="gallery" 
                className="min-h-[48px] text-sm font-medium rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:text-primary transition-all"
              >
                <div className="flex flex-col items-center gap-1">
                  <Camera className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('lands.details.tabs.gallery')}</span>
                </div>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4">
            {/* Land Information Card */}
            <Card className="border-border/50 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  {t('lands.details.land_info')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Info Item */}
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">{t('lands.details.survey_number_label')}</p>
                    <p className="text-base font-semibold text-foreground">{land.survey_number || t('lands.details.not_available')}</p>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">{t('lands.details.ownership_type_label')}</p>
                    <p className="text-base font-semibold text-foreground">{land.ownership_type || t('lands.details.not_specified')}</p>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">{t('lands.details.soil_type_label')}</p>
                    <p className="text-base font-semibold text-foreground">{land.soil_type || t('lands.details.not_specified')}</p>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">{t('lands.details.location_label')}</p>
                    <p className="text-base font-semibold text-foreground">
                      {[land.village, land.taluka, land.district, land.state]
                        .filter(Boolean)
                        .join(', ') || t('lands.details.not_specified')}
                    </p>
                  </div>
                  
                  {land.last_sowing_date && (
                    <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">{t('lands.details.last_sowing')}</p>
                      <p className="text-base font-semibold text-foreground">
                        {new Date(land.last_sowing_date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                  
                  {land.expected_harvest_date && (
                    <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">{t('lands.details.expected_harvest')}</p>
                      <p className="text-base font-semibold text-foreground">
                        {new Date(land.expected_harvest_date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activities Card */}
            <Card className="border-border/50 shadow-lg">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    {t('lands.details.recent_activities')}
                  </CardTitle>
                  <Button 
                    size="lg"
                    onClick={() => navigate(`/app/lands/${id}/activities/add`)}
                    className="min-h-[44px] rounded-xl bg-primary hover:bg-primary-hover"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    <span className="font-medium">{t('lands.details.add')}</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {activities.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                      <Activity className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-base font-medium text-muted-foreground">
                      {t('lands.details.no_activities')}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('lands.details.start_tracking')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activities.slice(0, 5).map(activity => (
                      <div 
                        key={activity.id} 
                        className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base text-foreground">{activity.activity_type}</p>
                          {activity.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                              {activity.description}
                            </p>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-sm font-medium text-foreground">
                            {new Date(activity.activity_date).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short'
                            })}
                          </p>
                          {activity.cost && (
                            <p className="text-sm font-semibold text-primary mt-0.5">₹{activity.cost}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="soil" className="space-y-4">
            <Card className="border-border/50 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Mountain className="h-5 w-5 text-primary" />
                  {t('lands.details.soil_overview')}
                </CardTitle>
              </CardHeader>
              <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-4">{t('lands.details.soil_composition')}</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <RadialBarChart cx="50%" cy="50%" innerRadius="10%" outerRadius="90%" data={soilHealthData}>
                      <RadialBar dataKey="value" />
                      <Tooltip />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">{t('lands.details.soil_ph')}</span>
                      <span className="font-medium">{land.soil_ph || t('lands.details.not_tested')}</span>
                    </div>
                    {land.soil_ph && (
                      <Progress 
                        value={(land.soil_ph / 14) * 100} 
                        className="h-2"
                      />
                    )}
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">{t('lands.details.organic_carbon')}</span>
                      <span className="font-medium">
                        {land.organic_carbon_percent ? `${land.organic_carbon_percent}%` : t('lands.details.not_tested')}
                      </span>
                    </div>
                    {land.organic_carbon_percent && (
                      <Progress 
                        value={land.organic_carbon_percent * 100} 
                        className="h-2"
                      />
                    )}
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">{t('lands.details.nitrogen')}</p>
                      <p className="font-bold">{land.nitrogen_kg_per_ha || 0}</p>
                      <p className="text-xs">{t('lands.details.kg_ha')}</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">{t('lands.details.phosphorus')}</p>
                      <p className="font-bold">{land.phosphorus_kg_per_ha || 0}</p>
                      <p className="text-xs">{t('lands.details.kg_ha')}</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">{t('lands.details.potassium')}</p>
                      <p className="font-bold">{land.potassium_kg_per_ha || 0}</p>
                      <p className="text-xs">{t('lands.details.kg_ha')}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {land.last_soil_test_date && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {t('lands.details.last_soil_test', { date: new Date(land.last_soil_test_date).toLocaleDateString() })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activities" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('lands.details.activity_log')}</CardTitle>
              <Button onClick={() => navigate(`/app/lands/${id}/activities/add`)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('lands.details.log_activity')}
              </Button>
            </CardHeader>
            <CardContent>
              {activityData.length > 0 && (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={activityData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="activities" fill="hsl(var(--primary))" name={t('lands.details.activities_count')} />
                    <Bar yAxisId="right" dataKey="cost" fill="hsl(var(--destructive))" name={t('lands.details.cost_label')} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              
              <div className="mt-6 space-y-2">
                {activities.map(activity => (
                  <div key={activity.id} className="flex items-start justify-between p-4 rounded-lg border">
                    <div className="flex gap-3">
                      <div className="mt-1">
                        <Activity className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{activity.activity_type}</p>
                        {activity.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {activity.description}
                          </p>
                        )}
                        {activity.notes && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {t('lands.details.note')}: {activity.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {new Date(activity.activity_date).toLocaleDateString()}
                      </p>
                      {activity.quantity && (
                        <p className="text-sm">
                          {activity.quantity} {activity.unit}
                        </p>
                      )}
                      {activity.cost && (
                        <p className="font-medium">₹{activity.cost}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('lands.details.crop_history')}</CardTitle>
              <Button onClick={() => navigate(`/app/lands/${id}/crop-history/add`)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('lands.details.add_crop_record')}
              </Button>
            </CardHeader>
            <CardContent>
              {yieldData.length > 0 && (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={yieldData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="crop" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="yield" stroke="hsl(var(--primary))" name={t('lands.details.yield_label')} />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="hsl(var(--success))" name={t('lands.details.revenue_label')} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              
              {cropHistory.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">{t('lands.details.no_crop_history')}</p>
                </div>
              ) : (
                <div className="mt-6 space-y-2">
                  {cropHistory.map(crop => (
                    <div key={crop.id} className="p-4 rounded-lg border">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-lg">{crop.crop_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {t('lands.details.sown')}: {new Date(crop.planting_date).toLocaleDateString()}
                            {crop.harvest_date && ` • ${t('lands.details.harvested')}: ${new Date(crop.harvest_date).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="text-right">
                          {crop.yield_kg_per_acre && (
                            <p className="font-medium">
                              {crop.yield_kg_per_acre} {t('lands.details.kg_acre')}
                            </p>
                          )}
                          {crop.growth_stage && (
                            <Badge variant="outline" className="mt-1">
                              {crop.growth_stage}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gallery" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('lands.details.photo_gallery')}</CardTitle>
              <Button onClick={() => navigate(`/app/lands/${id}/gallery/upload`)}>
                <Camera className="h-4 w-4 mr-2" />
                {t('lands.details.upload_photos')}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{t('lands.details.no_photos')}</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => navigate(`/app/lands/${id}/gallery/upload`)}
                >
                  {t('lands.details.upload_first_photo')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-md mx-4 rounded-2xl">
          <AlertDialogHeader>
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl text-center">{t('lands.details.delete.dialog_title')}</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base">
              {t('lands.details.delete.dialog_description', { name: land.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="min-h-[48px] rounded-xl font-medium">{t('lands.details.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="min-h-[48px] rounded-xl bg-destructive hover:bg-destructive/90 font-medium"
            >
              {t('lands.details.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}