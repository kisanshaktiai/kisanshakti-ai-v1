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
    <Card className="absolute top-4 left-16 right-16 sm:left-auto sm:right-4 sm:w-52 p-2.5 bg-background/95 backdrop-blur-sm shadow-lg z-10">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Map className="h-3.5 w-3.5" />
          <span className="truncate">{pointsCount} points marked</span>
        </div>
        
        {pointsCount >= 3 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Ruler className="h-3.5 w-3.5 text-primary" />
              <span>Area</span>
            </div>
            
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="bg-primary/10 rounded-md p-1.5">
                <div className="text-sm font-bold text-primary">
                  {area.sqft.toLocaleString()}
                </div>
                <div className="text-2xs text-muted-foreground">sq ft</div>
              </div>
              
              <div className="bg-primary/10 rounded-md p-1.5">
                <div className="text-sm font-bold text-primary">
                  {area.guntha.toFixed(2)}
                </div>
                <div className="text-2xs text-muted-foreground">guntha</div>
              </div>
              
              <div className="bg-primary/10 rounded-md p-1.5">
                <div className="text-sm font-bold text-primary">
                  {area.acres.toFixed(3)}
                </div>
                <div className="text-2xs text-muted-foreground">acres</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}