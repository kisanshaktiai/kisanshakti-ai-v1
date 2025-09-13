import React from 'react';
import { Card } from '@/components/ui/card';
import { Cloud, CloudDrizzle, CloudLightning, CloudRain, CloudSnow, Sun, Wind, Droplets, Eye, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WeatherCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  description?: string;
  trend?: 'up' | 'down' | 'stable';
  className?: string;
  glassmorphism?: boolean;
}

export const WeatherCard: React.FC<WeatherCardProps> = ({
  title,
  value,
  unit,
  icon,
  description,
  trend,
  className,
  glassmorphism = true
}) => {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      default:
        return '→';
    }
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-300 hover:scale-[1.02]',
        glassmorphism && 'bg-background/60 backdrop-blur-xl border-border/50',
        'hover:shadow-xl hover:shadow-primary/5',
        className
      )}
    >
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {value}
              </span>
              {unit && (
                <span className="text-lg text-muted-foreground">{unit}</span>
              )}
              {trend && (
                <span className={cn(
                  'text-sm font-medium',
                  trend === 'up' && 'text-red-500',
                  trend === 'down' && 'text-blue-500',
                  trend === 'stable' && 'text-muted-foreground'
                )}>
                  {getTrendIcon()}
                </span>
              )}
            </div>
            {description && (
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {icon && (
            <div className="ml-4 rounded-lg bg-primary/10 p-3 text-primary">
              {icon}
            </div>
          )}
        </div>
      </div>
      
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
    </Card>
  );
};