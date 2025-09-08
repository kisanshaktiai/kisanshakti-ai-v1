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

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">{t('nav.profile')}</h1>
      
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>{user?.name || 'Farmer'}</CardTitle>
              <p className="text-sm text-muted-foreground">ID: {user?.id || 'DEMO123'}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">{user?.phone || '+91 9876543210'}</span>
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Punjab, India</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Farm Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Land</span>
            <span className="font-medium">5 Acres</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Main Crops</span>
            <span className="font-medium">Wheat, Rice</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Soil Type</span>
            <span className="font-medium">Loamy</span>
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