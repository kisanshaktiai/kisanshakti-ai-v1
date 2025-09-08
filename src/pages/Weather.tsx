import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, Droplets, Wind, Sun } from 'lucide-react';

export default function Weather() {
  const { t } = useTranslation();

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">{t('nav.weather')}</h1>
      
      <Card className="bg-gradient-primary text-primary-foreground">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold">28°C</p>
              <p className="text-sm opacity-90">Partly Cloudy</p>
              <p className="text-xs mt-2">Feels like 30°C</p>
            </div>
            <Sun className="w-16 h-16 opacity-90" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Droplets className="w-6 h-6 mx-auto mb-2 text-accent" />
            <p className="text-xs text-muted-foreground">Humidity</p>
            <p className="font-semibold">65%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Wind className="w-6 h-6 mx-auto mb-2 text-secondary" />
            <p className="text-xs text-muted-foreground">Wind</p>
            <p className="font-semibold">12 km/h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Cloud className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="text-xs text-muted-foreground">Pressure</p>
            <p className="font-semibold">1013 mb</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">7 Day Forecast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="flex justify-between items-center">
              <span className="text-sm">{day}</span>
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">28°/22°</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}