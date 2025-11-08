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
  LocateFixed,
  Trash2,
  ArrowLeft
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
  onDeleteAll?: () => void;
  canUndo: boolean;
  canSave: boolean;
  isTracking?: boolean;
  onToggleTracking?: () => void;
  gpsAccuracy?: number;
  hasValidationError?: boolean;
}

export function MapControls({
  mode,
  onModeChange,
  onUndo,
  onSave,
  onCancel,
  onDeleteAll,
  canUndo,
  canSave,
  isTracking = false,
  onToggleTracking,
  gpsAccuracy,
  hasValidationError = false,
}: MapControlsProps) {
  return (
    <TooltipProvider>
      <>
        {/* Back Button - Top Left */}
        <Button
          variant="outline"
          size="icon"
          onClick={onCancel}
          className="absolute top-4 left-4 h-10 w-10 bg-background/95 backdrop-blur-sm shadow-sm z-10"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* GPS Accuracy Indicator */}
        {gpsAccuracy !== undefined && (
          <Card className="absolute top-4 right-4 px-2.5 py-1.5 bg-background/95 backdrop-blur-sm z-10 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs">
              <LocateFixed className={cn(
                "h-3.5 w-3.5",
                gpsAccuracy < 10 ? "text-success" : 
                gpsAccuracy < 20 ? "text-warning" : "text-destructive"
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

              {onDeleteAll && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={onDeleteAll}
                      disabled={!canUndo}
                      className="h-9 w-9"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clear all points</p>
                  </TooltipContent>
                </Tooltip>
              )}
              
              <Button
                onClick={onSave}
                disabled={!canSave || hasValidationError}
                size="sm"
                className="flex-1 h-9 bg-primary text-primary-foreground shadow-lg"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save Boundary
              </Button>
            </div>
          </div>
        </div>
      </>
    </TooltipProvider>
  );
}