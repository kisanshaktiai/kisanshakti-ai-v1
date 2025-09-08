import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, TrendingUp, MessageSquare, FileText } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Link } from 'react-router-dom';

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const quickLinks = [
    {
      title: t('home.todayWeather'),
      icon: Cloud,
      path: '/weather',
      color: 'bg-accent/10 text-accent',
    },
    {
      title: t('home.marketPrices'),
      icon: TrendingUp,
      path: '/market',
      color: 'bg-success/10 text-success',
    },
    {
      title: t('home.latestAdvisory'),
      icon: MessageSquare,
      path: '/advisory',
      color: 'bg-secondary/10 text-secondary',
    },
    {
      title: t('home.governmentSchemes'),
      icon: FileText,
      path: '/schemes',
      color: 'bg-primary/10 text-primary',
    },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Greeting Card */}
      <Card className="bg-gradient-earth text-card-foreground">
        <CardContent className="pt-6">
          <h2 className="text-2xl font-bold">
            {t('home.greeting', { name: user?.name || 'Farmer' })}
          </h2>
          <p className="text-muted-foreground mt-2">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </CardContent>
      </Card>

      {/* Quick Links Grid */}
      <div className="grid grid-cols-2 gap-4">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.path} to={link.path}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className={`w-12 h-12 rounded-lg ${link.color} flex items-center justify-center mb-3`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-sm font-medium">
                    {link.title}
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Info Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Temperature</span>
            <span className="font-semibold">28°C</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Wheat Price</span>
            <span className="font-semibold text-success">₹2,125/quintal</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Rainfall</span>
            <span className="font-semibold">12mm expected</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}