import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  MapPin, 
  Footprints, 
  Undo2, 
  Save, 
  X,
  Navigation2,
  MapIcon,
  LocateFixed
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MapControlsProps {
  mode: 'draw' | 'walk';
  onModeChange: (mode: 'draw' | 'walk') => void;
  onUndo: () => void;
  onSave: () => void;
  onCancel: () => void;
  canUndo: boolean;
  canSave: boolean;
  isTracking?: boolean;
  onToggleTracking?: () => void;
  gpsAccuracy?: number;
}

export function MapControls({
  mode,
  onModeChange,
  onUndo,
  onSave,
  onCancel,
  canUndo,
  canSave,
  isTracking = false,
  onToggleTracking,
  gpsAccuracy
}: MapControlsProps) {
  const [showHelp, setShowHelp] = useState(true);

  return (
    <TooltipProvider>
      <>
        {/* Help Card */}
        {showHelp && (
          <Card className="absolute top-4 left-4 right-4 sm:left-4 sm:right-auto sm:w-72 p-2.5 bg-background/95 backdrop-blur-sm z-10 shadow-sm">
            <div className="flex justify-between items-start gap-2">
              <div className="space-y-0.5">
                <p className="font-medium flex items-center gap-1.5 text-sm">
                  <MapIcon className="h-3.5 w-3.5 text-primary" />
                  Mark your land boundary
                </p>
                <p className="text-muted-foreground text-xs leading-tight">
                  {mode === 'draw' 
                    ? 'Tap on the map to add points'
                    : 'Walk around your land perimeter'}
                </p>
                <p className="text-muted-foreground text-xs">
                  Min 3 points required
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 hover:bg-muted/50"
                onClick={() => setShowHelp(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </Card>
        )}

        {/* GPS Accuracy Indicator */}
        {gpsAccuracy !== undefined && (
          <Card className="absolute top-4 right-4 px-2.5 py-1.5 bg-background/95 backdrop-blur-sm z-10 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs">
              <LocateFixed className={cn(
                "h-3.5 w-3.5",
                gpsAccuracy < 10 ? "text-green-500" : 
                gpsAccuracy < 20 ? "text-yellow-500" : "text-red-500"
              )} />
              <span className="font-medium">±{gpsAccuracy.toFixed(0)}m</span>
            </div>
          </Card>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none">
          <div className="space-y-2 pointer-events-auto">
            {/* Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={mode === 'draw' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-9"
                onClick={() => onModeChange('draw')}
              >
                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                Tap to Mark
              </Button>
              <Button
                variant={mode === 'walk' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-9"
                onClick={() => onModeChange('walk')}
              >
                <Footprints className="h-3.5 w-3.5 mr-1.5" />
                Walk Boundary
              </Button>
            </div>

            {/* Walk Mode Controls */}
            {mode === 'walk' && onToggleTracking && (
              <Button
                variant={isTracking ? 'destructive' : 'default'}
                size="sm"
                className="w-full h-9"
                onClick={onToggleTracking}
              >
                <Navigation2 className="h-3.5 w-3.5 mr-1.5" />
                {isTracking ? 'Stop Tracking' : 'Start GPS Tracking'}
              </Button>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="h-9"
              >
                Cancel
              </Button>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="h-9 w-9"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Undo last point</p>
                </TooltipContent>
              </Tooltip>
              
              <Button
                onClick={onSave}
                disabled={!canSave}
                size="sm"
                className="flex-1 h-9"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save Land
              </Button>
            </div>
          </div>
        </div>
      </>
    </TooltipProvider>
  );
}