import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuthStore } from '@/stores/authStore';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { 
  User, 
  Phone, 
  MapPin, 
  LogOut, 
  Edit, 
  TrendingUp, 
  Droplets,
  Wheat,
  Calendar,
  Award,
  Tractor,
  Package,
  Activity,
  BarChart3,
  Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  Legend
} from 'recharts';
import { SyncStatus } from '@/components/sync/SyncStatus';
import { AvatarUpload } from '@/components/profile/AvatarUpload';

export default function Profile() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!user?.id || !user?.tenantId) return;
      
      // Create authenticated client with custom headers
      const authClient = supabaseWithAuth(user.id, user.tenantId);
      console.log('🔐 Fetching analytics with authenticated client:', { userId: user.id, tenantId: user.tenantId });
      
      const { data, error } = await authClient
        .from('farmers')
        .select('app_install_date, last_app_open, total_app_opens, total_queries, created_at, last_login_at')
        .eq('id', user.id)
        .maybeSingle();
      
      if (!error && data) {
        setAnalyticsData(data);
      }
    };
    
    fetchAnalytics();
  }, [user?.id, user?.tenantId]);

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  const handleEditProfile = () => {
    navigate('/app/profile/edit');
  };

  // Format location string
  const getLocation = () => {
    const parts = [];
    if (user?.village) parts.push(user.village);
    if (user?.taluka) parts.push(user.taluka);
    if (user?.district) parts.push(user.district);
    if (user?.state) parts.push(user.state);
    return parts.length > 0 ? parts.join(', ') : 'Location not set';
  };

  // Format crops array
  const getCrops = () => {
    if (user?.primaryCrops && user.primaryCrops.length > 0) {
      return user.primaryCrops;
    }
    return ['Not specified'];
  };

  // Mock data for charts
  const yieldData = [
    { month: 'Jan', yield: 65 },
    { month: 'Feb', yield: 72 },
    { month: 'Mar', yield: 78 },
    { month: 'Apr', yield: 85 },
    { month: 'May', yield: 90 },
    { month: 'Jun', yield: 95 },
  ];

  const cropDistribution = [
    { name: 'Wheat', value: 40, color: '#10b981' },
    { name: 'Rice', value: 30, color: '#3b82f6' },
    { name: 'Cotton', value: 20, color: '#f59e0b' },
    { name: 'Others', value: 10, color: '#8b5cf6' },
  ];

  const farmScore = [
    { name: 'Farm Score', value: 78, fill: '#10b981' }
  ];

  // Calculate profile completion
  const calculateProfileCompletion = () => {
    let completed = 0;
    const fields = [
      user?.fullName,
      user?.village,
      user?.district,
      user?.state,
      user?.pincode,
      user?.totalLandAcres,
      user?.primaryCrops?.length,
      user?.farmingExperienceYears,
      user?.farmType,
      user?.dateOfBirth
    ];
    fields.forEach(field => {
      if (field) completed++;
    });
    return Math.round((completed / fields.length) * 100);
  };

  const profileCompletion = calculateProfileCompletion();

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-6 pb-24 animate-fade-in">
        {/* Sync Status Card */}
        <SyncStatus />
        {/* Header Section */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-2xl blur-2xl" />
        <Card className="relative border-0 bg-gradient-to-br from-card to-card/95 shadow-xl">
          <CardContent className="p-6">
            {/* Edit Button - Top Right Corner */}
            <Button 
              onClick={handleEditProfile} 
              size="icon"
              variant="ghost"
              className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-primary/10"
            >
              <Edit className="w-4 h-4" />
            </Button>
            
            <div className="flex items-start gap-4">
              <div className="relative">
                <AvatarUpload 
                  currentAvatarUrl={user?.avatarUrl}
                  size="lg"
                  editable={true}
                />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-success rounded-full border-2 border-card" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-foreground">
                  {user?.farmerName || user?.fullName || user?.name || 'Farmer'}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    Farmer
                  </Badge>
                  <Badge variant="outline">
                    {user?.farmType || 'General'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Profile Completion */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Profile Completion</span>
                <span className="font-medium">{profileCompletion}%</span>
              </div>
              <Progress value={profileCompletion} className="h-2" />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                <Phone className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{user?.phone || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                <MapPin className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="text-sm font-medium truncate">{user?.district || 'Not set'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* App Usage Analytics */}
      {analyticsData && (
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              App Usage Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Activity className="w-3 h-3" />
                  <p className="text-xs">Total Opens</p>
                </div>
                <p className="text-2xl font-bold text-primary">{analyticsData.total_app_opens || 0}</p>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <p className="text-xs">Last Active</p>
                </div>
                <p className="text-sm font-semibold">
                  {analyticsData.last_app_open 
                    ? formatDistanceToNow(new Date(analyticsData.last_app_open), { addSuffix: true })
                    : 'Never'}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <p className="text-xs">Member Since</p>
                </div>
                <p className="text-xs font-medium">
                  {analyticsData.created_at 
                    ? format(new Date(analyticsData.created_at), 'MMM yyyy')
                    : 'Unknown'}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="w-3 h-3" />
                  <p className="text-xs">AI Queries</p>
                </div>
                <p className="text-2xl font-bold text-success">{analyticsData.total_queries || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Farm Analytics Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Farm Score Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Farm Performance
              </CardTitle>
              <Badge variant="secondary" className="bg-success/10 text-success">
                Good
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={150}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" data={farmScore}>
                <RadialBar dataKey="value" cornerRadius={10} fill="#10b981" />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-2xl font-bold">
                  78%
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="flex justify-around mt-2">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Yield</p>
                <p className="text-sm font-semibold">85%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Efficiency</p>
                <p className="text-sm font-semibold">72%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Sustainability</p>
                <p className="text-sm font-semibold">90%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Crop Distribution */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wheat className="w-4 h-4 text-primary" />
              Crop Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie
                  data={cropDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {cropDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {cropDistribution.map((crop) => (
                <div key={crop.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: crop.color }} />
                  <span className="text-xs">{crop.name} ({crop.value}%)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Yield Trend */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Yield Trend (Last 6 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={yieldData}>
              <defs>
                <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip />
              <Area 
                type="monotone" 
                dataKey="yield" 
                stroke="#10b981" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorYield)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Farm Details */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-base">Farm Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Land</p>
                  <p className="text-sm font-semibold">{user?.totalLandAcres || 0} Acres</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Experience</p>
                  <p className="text-sm font-semibold">{user?.farmingExperienceYears || 0} Years</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Award className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Farm Type</p>
                  <p className="text-sm font-semibold">{user?.farmType || 'Not specified'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Droplets className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Irrigation</p>
                  <p className="text-sm font-semibold">
                    {user?.hasIrrigation ? (user?.irrigationType || 'Yes') : 'No'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Tractor className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tractor</p>
                  <p className="text-sm font-semibold">{user?.hasTractor ? 'Available' : 'Not Available'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Package className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Storage</p>
                  <p className="text-sm font-semibold">{user?.hasStorage ? 'Available' : 'Not Available'}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Crops Section */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-base">Primary Crops</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {getCrops().map((crop, index) => (
              <Badge 
                key={index} 
                variant="secondary"
                className="bg-primary/10 text-primary border-0 px-3 py-1"
              >
                {crop}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Location Card */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-base">Location Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{getLocation()}</p>
              {user?.pincode && (
                <p className="text-xs text-muted-foreground">PIN: {user.pincode}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="space-y-3">
        <Button 
          onClick={handleEditProfile} 
          variant="outline" 
          className="w-full border-primary/20 hover:bg-primary/5"
        >
          <Edit className="w-4 h-4 mr-2" />
          Edit Profile
        </Button>
        
        <Button 
          onClick={handleLogout} 
          variant="destructive" 
          className="w-full"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {t('auth.logout')}
        </Button>
      </div>
      </div>
    </div>
  );
}