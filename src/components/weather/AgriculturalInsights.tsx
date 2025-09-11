import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Sprout, Droplets, Bug, Calendar, TrendingUp, 
  AlertTriangle, CheckCircle, Info, Wheat, 
  TreePine, Flower, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgriculturalInsightsProps {
  weather: any;
  forecast: any[];
}

export const AgriculturalInsights: React.FC<AgriculturalInsightsProps> = ({ weather, forecast }) => {
  // Calculate farming recommendations based on weather
  const getIrrigationRecommendation = () => {
    if (!weather) return null;
    
    const temp = weather.temp;
    const humidity = weather.humidity;
    
    if (temp > 35 && humidity < 40) {
      return {
        level: 'High',
        message: 'Increase irrigation frequency due to high temperature and low humidity',
        icon: AlertTriangle,
        color: 'text-destructive',
      };
    } else if (temp > 30 && humidity < 50) {
      return {
        level: 'Moderate',
        message: 'Regular irrigation recommended',
        icon: Info,
        color: 'text-warning',
      };
    } else {
      return {
        level: 'Low',
        message: 'Normal irrigation schedule sufficient',
        icon: CheckCircle,
        color: 'text-success',
      };
    }
  };

  const getSprayingConditions = () => {
    if (!weather) return null;
    
    const windSpeed = weather.wind_speed;
    const humidity = weather.humidity;
    
    if (windSpeed > 15) {
      return {
        suitable: false,
        message: 'Not suitable for spraying - high wind speed',
        score: 30,
      };
    } else if (humidity > 85) {
      return {
        suitable: false,
        message: 'Not suitable - high humidity may reduce effectiveness',
        score: 40,
      };
    } else if (windSpeed < 10 && humidity > 50 && humidity < 80) {
      return {
        suitable: true,
        message: 'Excellent conditions for spraying',
        score: 90,
      };
    } else {
      return {
        suitable: true,
        message: 'Good conditions for spraying',
        score: 70,
      };
    }
  };

  const getPlantingRecommendation = () => {
    if (!weather || !forecast) return null;
    
    const avgTemp = forecast.slice(0, 7).reduce((acc, day) => acc + day.temp.day, 0) / 7;
    const rainExpected = forecast.slice(0, 7).some(day => day.pop > 0.5);
    
    if (avgTemp > 25 && avgTemp < 35 && rainExpected) {
      return {
        recommended: true,
        crops: ['Rice', 'Cotton', 'Maize'],
        message: 'Good conditions for kharif crops',
      };
    } else if (avgTemp < 25) {
      return {
        recommended: true,
        crops: ['Wheat', 'Mustard', 'Gram'],
        message: 'Suitable for rabi crops',
      };
    } else {
      return {
        recommended: false,
        crops: [],
        message: 'Wait for better weather conditions',
      };
    }
  };

  const irrigation = getIrrigationRecommendation();
  const spraying = getSprayingConditions();
  const planting = getPlantingRecommendation();

  const activities = [
    {
      name: 'Soil Preparation',
      suitable: weather?.humidity > 40 && weather?.humidity < 70,
      icon: TreePine,
    },
    {
      name: 'Fertilization',
      suitable: weather?.wind_speed < 10,
      icon: Flower,
    },
    {
      name: 'Harvesting',
      suitable: weather?.humidity < 60 && !forecast?.[0]?.rain,
      icon: Wheat,
    },
    {
      name: 'Pest Control',
      suitable: spraying?.suitable,
      icon: Bug,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Key Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Droplets className="w-5 h-5" />
              Irrigation Need
            </CardTitle>
          </CardHeader>
          <CardContent>
            {irrigation && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <irrigation.icon className={cn("w-5 h-5", irrigation.color)} />
                  <span className={cn("font-semibold text-lg", irrigation.color)}>
                    {irrigation.level}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{irrigation.message}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bug className="w-5 h-5" />
              Spraying Conditions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {spraying && (
              <>
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">Suitability</span>
                    <span className="text-sm font-semibold">{spraying.score}%</span>
                  </div>
                  <Progress value={spraying.score} className="h-2" />
                </div>
                <p className="text-sm text-muted-foreground">{spraying.message}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sprout className="w-5 h-5" />
              Planting Window
            </CardTitle>
          </CardHeader>
          <CardContent>
            {planting && (
              <>
                <Badge 
                  variant={planting.recommended ? "default" : "secondary"}
                  className="mb-2"
                >
                  {planting.recommended ? "Recommended" : "Not Recommended"}
                </Badge>
                <p className="text-sm text-muted-foreground">{planting.message}</p>
                {planting.crops.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {planting.crops.map((crop) => (
                      <Badge key={crop} variant="outline" className="text-xs">
                        {crop}
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agricultural Activities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Today's Agricultural Activities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {activities.map((activity) => {
              const Icon = activity.icon;
              return (
                <div
                  key={activity.name}
                  className={cn(
                    "p-4 rounded-lg border-2 transition-all",
                    activity.suitable
                      ? "bg-success/10 border-success/30"
                      : "bg-destructive/10 border-destructive/30"
                  )}
                >
                  <Icon className={cn(
                    "w-8 h-8 mb-2",
                    activity.suitable ? "text-success" : "text-destructive"
                  )} />
                  <p className="font-medium text-sm">{activity.name}</p>
                  <Badge
                    variant={activity.suitable ? "default" : "destructive"}
                    className="mt-2 text-xs"
                  >
                    {activity.suitable ? "Suitable" : "Not Suitable"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Weekly Outlook */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            7-Day Agricultural Outlook
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {forecast?.slice(0, 7).map((day, index) => {
              const date = new Date(day.dt * 1000);
              const rainRisk = day.pop > 0.5;
              const tempSuitable = day.temp.day > 15 && day.temp.day < 35;
              
              return (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">
                        {date.toLocaleDateString('en', { weekday: 'short' })}
                      </p>
                      <p className="font-semibold">
                        {date.toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">
                        {day.temp.max.toFixed(0)}°/{day.temp.min.toFixed(0)}°C
                      </p>
                      <div className="flex gap-2 mt-1">
                        {rainRisk && (
                          <Badge variant="outline" className="text-xs">
                            <Droplets className="w-3 h-3 mr-1" />
                            Rain
                          </Badge>
                        )}
                        {tempSuitable && (
                          <Badge variant="outline" className="text-xs text-success">
                            Good for farming
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Humidity</p>
                    <p className="font-semibold">{day.humidity}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Alerts and Warnings */}
      <Alert>
        <TrendingUp className="h-4 w-4" />
        <AlertDescription>
          <strong>Seasonal Tip:</strong> Based on current weather patterns, consider preparing for the upcoming season. 
          Check soil moisture levels and plan your crop rotation strategy.
        </AlertDescription>
      </Alert>
    </div>
  );
};