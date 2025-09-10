import { Card } from '@/components/ui/card';
import { Map, Ruler } from 'lucide-react';

interface AreaDisplayProps {
  area: {
    sqft: number;
    guntha: number;
    acres: number;
  };
  pointsCount: number;
}

export function AreaDisplay({ area, pointsCount }: AreaDisplayProps) {
  return (
    <Card className="absolute top-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 p-3 bg-background/95 backdrop-blur-sm shadow-lg z-10">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Map className="h-4 w-4" />
          <span>{pointsCount} points marked</span>
        </div>
        
        {pointsCount >= 3 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Ruler className="h-4 w-4 text-primary" />
              <span>Area Calculation</span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-primary/10 rounded-lg p-2">
                <div className="text-lg font-bold text-primary">
                  {area.sqft.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">sq ft</div>
              </div>
              
              <div className="bg-primary/10 rounded-lg p-2">
                <div className="text-lg font-bold text-primary">
                  {area.guntha.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">guntha</div>
              </div>
              
              <div className="bg-primary/10 rounded-lg p-2">
                <div className="text-lg font-bold text-primary">
                  {area.acres.toFixed(3)}
                </div>
                <div className="text-xs text-muted-foreground">acres</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}