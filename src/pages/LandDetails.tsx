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
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
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

  const fetchLandDetails = async () => {
    if (!id || !user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('lands')
        .select('*')
        .eq('id', id)
        .eq('farmer_id', user.id)
        .single();

      if (error) throw error;
      setLand(data);
    } catch (error) {
      console.error('Error fetching land details:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch land details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchActivities = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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
      const { error } = await supabase
        .from('lands')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Land deleted successfully',
      });
      navigate('/app/lands');
    } catch (error) {
      console.error('Error deleting land:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete land',
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
    { name: 'pH', value: land?.soil_ph ? (land.soil_ph / 14) * 100 : 0, fill: '#10b981' },
    { name: 'Organic Carbon', value: land?.organic_carbon_percent ? land.organic_carbon_percent * 100 : 0, fill: '#f59e0b' },
    { name: 'NPK', value: land?.nitrogen_kg_per_ha ? Math.min((land.nitrogen_kg_per_ha / 400) * 100, 100) : 0, fill: '#3b82f6' },
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
        <p className="text-muted-foreground">Land not found</p>
        <Button onClick={() => navigate('/app/lands')} className="mt-4">
          Back to Lands
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* Mobile-optimized Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-3 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/app/lands')}
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{land.name}</h1>
              <p className="text-sm text-muted-foreground truncate">
                {land.village && `${land.village}, `}{land.taluka}
              </p>
            </div>
          </div>
          
          {/* Mobile Actions Menu */}
          <div className="flex gap-2 self-end sm:self-auto">
            <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 hidden sm:flex">
              <Download className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => navigate(`/app/lands/${id}/edit`)}
              className="h-9 px-3 sm:h-10 sm:px-4"
            >
              <Edit className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
            <Button 
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="h-9 px-3 sm:h-10 sm:px-4"
            >
              <Trash2 className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile-optimized Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/10">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground">Total Area</p>
                <p className="text-lg sm:text-2xl font-bold">
                  {land.area_acres}
                  <span className="text-xs sm:text-sm ml-1">acres</span>
                  {land.area_guntas && <span className="text-xs"> {land.area_guntas}g</span>}
                </p>
              </div>
              <MapPin className="h-6 w-6 sm:h-8 sm:w-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/10">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground">Current Crop</p>
                <p className="text-sm sm:text-xl font-bold line-clamp-1">{land.current_crop || 'No Crop'}</p>
                {land.crop_stage && (
                  <Badge variant="secondary" className="text-xs mt-1">{land.crop_stage}</Badge>
                )}
              </div>
              <Sprout className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-orange-500/5 to-orange-500/10 border-orange-500/10">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground">Soil Health</p>
                <div className="flex items-center gap-2">
                  <Progress value={soilHealthScore} className="w-12 sm:w-20" />
                  <span className="text-sm sm:text-xl font-bold">{soilHealthScore}%</span>
                </div>
              </div>
              <Mountain className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 border-blue-500/10">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground">Irrigation</p>
                <p className="text-sm sm:text-lg font-bold line-clamp-1">{land.irrigation_source || 'Not Set'}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{land.water_source}</p>
              </div>
              <Droplets className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobile-optimized Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full overflow-x-auto flex justify-start md:grid md:grid-cols-5 bg-muted/50 p-1 h-auto">
          <TabsTrigger value="overview" className="text-xs sm:text-sm whitespace-nowrap">Overview</TabsTrigger>
          <TabsTrigger value="soil" className="text-xs sm:text-sm whitespace-nowrap">Soil</TabsTrigger>
          <TabsTrigger value="activities" className="text-xs sm:text-sm whitespace-nowrap">Activities</TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm whitespace-nowrap">History</TabsTrigger>
          <TabsTrigger value="gallery" className="text-xs sm:text-sm whitespace-nowrap">Gallery</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Land Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Survey Number</p>
                <p className="font-medium">{land.survey_number || 'Not Available'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ownership Type</p>
                <p className="font-medium">{land.ownership_type || 'Not Specified'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Soil Type</p>
                <p className="font-medium">{land.soil_type || 'Not Specified'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-medium">
                  {[land.village, land.taluka, land.district, land.state]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
              {land.last_sowing_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Last Sowing</p>
                  <p className="font-medium">
                    {new Date(land.last_sowing_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              {land.expected_harvest_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Expected Harvest</p>
                  <p className="font-medium">
                    {new Date(land.expected_harvest_date).toLocaleDateString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activities */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Activities</CardTitle>
              <Button 
                size="sm"
                onClick={() => navigate(`/app/lands/${id}/activities/add`)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Activity
              </Button>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No activities recorded yet
                </p>
              ) : (
                <div className="space-y-2">
                  {activities.slice(0, 5).map(activity => (
                    <div key={activity.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">{activity.activity_type}</p>
                        <p className="text-sm text-muted-foreground">
                          {activity.description}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">
                          {new Date(activity.activity_date).toLocaleDateString()}
                        </p>
                        {activity.cost && (
                          <p className="text-sm font-medium">₹{activity.cost}</p>
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
          <Card>
            <CardHeader>
              <CardTitle>Soil Health Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-4">Soil Composition</h3>
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
                      <span className="text-sm text-muted-foreground">Soil pH</span>
                      <span className="font-medium">{land.soil_ph || 'Not Tested'}</span>
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
                      <span className="text-sm text-muted-foreground">Organic Carbon</span>
                      <span className="font-medium">
                        {land.organic_carbon_percent ? `${land.organic_carbon_percent}%` : 'Not Tested'}
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
                      <p className="text-xs text-muted-foreground">Nitrogen</p>
                      <p className="font-bold">{land.nitrogen_kg_per_ha || 0}</p>
                      <p className="text-xs">kg/ha</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Phosphorus</p>
                      <p className="font-bold">{land.phosphorus_kg_per_ha || 0}</p>
                      <p className="text-xs">kg/ha</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Potassium</p>
                      <p className="font-bold">{land.potassium_kg_per_ha || 0}</p>
                      <p className="text-xs">kg/ha</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {land.last_soil_test_date && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Last soil test conducted on {new Date(land.last_soil_test_date).toLocaleDateString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activities" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Activity Log</CardTitle>
              <Button onClick={() => navigate(`/app/lands/${id}/activities/add`)}>
                <Plus className="h-4 w-4 mr-2" />
                Log Activity
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
                    <Bar yAxisId="left" dataKey="activities" fill="hsl(var(--primary))" name="Activities" />
                    <Bar yAxisId="right" dataKey="cost" fill="hsl(var(--destructive))" name="Cost (₹)" />
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
                            Note: {activity.notes}
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
              <CardTitle>Crop History</CardTitle>
              <Button onClick={() => navigate(`/app/lands/${id}/crop-history/add`)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Crop Record
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
                    <Line yAxisId="left" type="monotone" dataKey="yield" stroke="hsl(var(--primary))" name="Yield" />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#10b981" name="Revenue (₹)" />
                  </LineChart>
                </ResponsiveContainer>
              )}
              
              {cropHistory.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No crop history available</p>
                </div>
              ) : (
                <div className="mt-6 space-y-2">
                  {cropHistory.map(crop => (
                    <div key={crop.id} className="p-4 rounded-lg border">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-lg">{crop.crop_name}</p>
                          <p className="text-sm text-muted-foreground">
                            Sown: {new Date(crop.planting_date).toLocaleDateString()}
                            {crop.harvest_date && ` • Harvested: ${new Date(crop.harvest_date).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="text-right">
                          {crop.yield_kg_per_acre && (
                            <p className="font-medium">
                              {crop.yield_kg_per_acre} kg/acre
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
              <CardTitle>Photo Gallery</CardTitle>
              <Button onClick={() => navigate(`/app/lands/${id}/gallery/upload`)}>
                <Camera className="h-4 w-4 mr-2" />
                Upload Photos
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No photos uploaded yet</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => navigate(`/app/lands/${id}/gallery/upload`)}
                >
                  Upload First Photo
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the land "{land.name}" and all associated data. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}