import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Map, Layers, CloudRain, Thermometer, Wind } from 'lucide-react';

export const WeatherMap: React.FC = () => {
  const [mapLayer, setMapLayer] = useState('precipitation');
  
  const layers = [
    { value: 'precipitation', label: 'Precipitation', icon: CloudRain },
    { value: 'temperature', label: 'Temperature', icon: Thermometer },
    { value: 'wind', label: 'Wind', icon: Wind },
    { value: 'clouds', label: 'Clouds', icon: Layers },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Map className="w-5 h-5" />
            Weather Radar Map
          </CardTitle>
          <Select value={mapLayer} onValueChange={setMapLayer}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {layers.map((layer) => {
                const Icon = layer.icon;
                return (
                  <SelectItem key={layer.value} value={layer.value}>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      {layer.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative bg-gradient-to-br from-blue-100 to-green-100 rounded-lg h-[500px] flex items-center justify-center">
          <div className="text-center">
            <Map className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-semibold text-muted-foreground">
              Interactive Weather Map
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Real-time {layers.find(l => l.value === mapLayer)?.label} overlay
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 max-w-md mx-auto">
              <div className="bg-background/80 backdrop-blur rounded-lg p-3">
                <p className="text-sm text-muted-foreground">Coverage</p>
                <p className="text-lg font-semibold">Regional</p>
              </div>
              <div className="bg-background/80 backdrop-blur rounded-lg p-3">
                <p className="text-sm text-muted-foreground">Update</p>
                <p className="text-lg font-semibold">Live</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="mt-6 flex items-center justify-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-info/30 rounded"></div>
            <span className="text-sm">Light</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-info/50 rounded"></div>
            <span className="text-sm">Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-info rounded"></div>
            <span className="text-sm">Heavy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-accent rounded"></div>
            <span className="text-sm">Extreme</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};