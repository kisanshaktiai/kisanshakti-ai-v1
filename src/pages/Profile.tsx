import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { User, Phone, MapPin, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
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
      return user.primaryCrops.join(', ');
    }
    return 'Not specified';
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">{t('nav.profile')}</h1>
        <Button onClick={handleEditProfile} variant="outline" size="sm">
          Edit Profile
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>{user?.fullName || user?.name || 'Farmer'}</CardTitle>
              <p className="text-sm text-muted-foreground">Code: {user?.farmerCode || 'Not assigned'}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">{user?.phone || 'Not set'}</span>
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">{getLocation()}</span>
          </div>
          {user?.gender && (
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Gender: {user.gender}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Farm Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Land</span>
            <span className="font-medium">{user?.totalLandAcres || 0} Acres</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Main Crops</span>
            <span className="font-medium">{getCrops()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Farm Type</span>
            <span className="font-medium">{user?.farmType || 'Not specified'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Experience</span>
            <span className="font-medium">{user?.farmingExperienceYears || 0} Years</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Irrigation</span>
            <span className="font-medium">
              {user?.hasIrrigation ? (user?.irrigationType || 'Yes') : 'No'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tractor</span>
            <span className="font-medium">{user?.hasTractor ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Storage Facility</span>
            <span className="font-medium">{user?.hasStorage ? 'Yes' : 'No'}</span>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleLogout} variant="destructive" className="w-full">
        <LogOut className="w-4 h-4 mr-2" />
        {t('auth.logout')}
      </Button>
    </div>
  );
}