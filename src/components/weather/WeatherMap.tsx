import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Map, Layers, CloudRain, Thermometer, Wind } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const WeatherMap: React.FC = () => {
  const [mapLayer, setMapLayer] = useState('precipitation');
  
  const layers = [
    { value: 'precipitation', label: 'Precipitation', icon: CloudRain },
    { value: 'temperature', label: 'Temperature', icon: Thermometer },
    { value: 'wind', label: 'Wind', icon: Wind },
    { value: 'clouds', label: 'Clouds', icon: Layers },
  ];

  const legendItems = [
    { label: 'Light', color: 'bg-blue-300/60', intensity: 'from-blue-200/20 to-blue-300/30' },
    { label: 'Moderate', color: 'bg-blue-500/70', intensity: 'from-blue-400/30 to-blue-500/40' },
    { label: 'Heavy', color: 'bg-blue-700', intensity: 'from-blue-600/40 to-blue-700/50' },
    { label: 'Extreme', color: 'bg-purple-600', intensity: 'from-purple-500/50 to-purple-700/60' },
  ];

  return (
    <Card className="bg-card/90 backdrop-blur-xl border-border/50 shadow-sm rounded-xl overflow-hidden">
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Map className="h-4 w-4" />
            Weather Radar Map
          </CardTitle>
          <Select value={mapLayer} onValueChange={setMapLayer}>
            <SelectTrigger className="w-32 h-8 text-xs bg-background/80 backdrop-blur-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background/95 backdrop-blur-xl z-50">
              {layers.map((layer) => {
                const Icon = layer.icon;
                return (
                  <SelectItem key={layer.value} value={layer.value} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3 w-3" />
                      {layer.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Map Container - Optimized for mobile */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative bg-gradient-to-br from-blue-100/30 to-green-100/30 h-[300px] flex items-center justify-center mx-3 rounded-lg overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5" />
          
          <div className="relative z-10 text-center px-4">
            <motion.div
              animate={{ 
                rotate: [0, 360],
              }}
              transition={{ 
                duration: 20,
                repeat: Infinity,
                ease: "linear"
              }}
            >
              <Map className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            </motion.div>
            <p className="text-sm font-semibold text-foreground/80">
              Interactive Weather Map
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Real-time {layers.find(l => l.value === mapLayer)?.label} overlay
            </p>
            
            {/* Coverage Stats */}
            <div className="mt-4 flex gap-3 justify-center">
              <Badge variant="secondary" className="text-[10px] h-5">
                Coverage: Regional
              </Badge>
              <Badge variant="secondary" className="text-[10px] h-5">
                Update: Live
              </Badge>
            </div>
          </div>
        </motion.div>
        
        {/* Legend - Horizontal scrollable on mobile */}
        <div className="px-3 pb-3 mt-3">
          <p className="text-[10px] text-muted-foreground mb-2">Intensity Scale:</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {legendItems.map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-1.5 bg-background/60 rounded-full px-2.5 py-1 min-w-fit"
              >
                <div className={`w-3 h-3 rounded-full ${item.color}`} />
                <span className="text-[10px] font-medium whitespace-nowrap">{item.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};