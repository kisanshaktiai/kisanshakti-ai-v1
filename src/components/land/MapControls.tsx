import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  MapPin, 
  Footprints, 
  Undo2, 
  Save, 
  X,
  Navigation,
  Satellite
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

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
    <>
      {/* Help Card */}
      {showHelp && (
        <Card className="absolute top-4 left-4 right-4 sm:left-4 sm:right-auto sm:w-80 p-3 bg-background/95 backdrop-blur-sm z-10">
          <div className="flex justify-between items-start">
            <div className="space-y-1 text-sm">
              <p className="font-medium flex items-center gap-2">
                <Satellite className="h-4 w-4 text-primary" />
                Mark your land boundary
              </p>
              <p className="text-muted-foreground text-xs">
                {mode === 'draw' 
                  ? 'Tap on the map to add boundary points'
                  : 'Walk around your land to mark boundaries'}
              </p>
              <p className="text-muted-foreground text-xs">
                Minimum 3 points required
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setShowHelp(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </Card>
      )}

      {/* GPS Accuracy Indicator */}
      {gpsAccuracy !== undefined && (
        <Card className="absolute top-4 right-4 px-3 py-2 bg-background/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2 text-xs">
            <Navigation className={cn(
              "h-4 w-4",
              gpsAccuracy < 10 ? "text-green-500" : 
              gpsAccuracy < 20 ? "text-yellow-500" : "text-red-500"
            )} />
            <span>GPS: ±{gpsAccuracy.toFixed(0)}m</span>
          </div>
        </Card>
      )}

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none">
        <div className="space-y-3 pointer-events-auto">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === 'draw' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => onModeChange('draw')}
            >
              <MapPin className="h-4 w-4 mr-2" />
              Tap to Mark
            </Button>
            <Button
              variant={mode === 'walk' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => onModeChange('walk')}
            >
              <Footprints className="h-4 w-4 mr-2" />
              Walk Boundary
            </Button>
          </div>

          {/* Walk Mode Controls */}
          {mode === 'walk' && onToggleTracking && (
            <Button
              variant={isTracking ? 'destructive' : 'default'}
              className="w-full"
              onClick={onToggleTracking}
            >
              {isTracking ? 'Stop Walking' : 'Start Walking'}
            </Button>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={onUndo}
              disabled={!canUndo}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              onClick={onSave}
              disabled={!canSave}
              className="flex-1"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Land
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}