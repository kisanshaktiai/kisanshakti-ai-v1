import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import {
  MapPin,
  Footprints,
  Undo2,
  Save,
  Navigation2,
  LocateFixed,
  Trash2,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticFeedback } from '@/lib/haptics';

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

const haptic = (kind: 'light' | 'medium' | 'success' = 'light') => {
  try {
    hapticFeedback(kind === 'success' ? 'medium' : kind);
  } catch {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(kind === 'success' ? 20 : 10);
    }
  }
};

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
  const { t } = useTranslation();
  const saveEnabled = canSave && !hasValidationError;

  return (
    <>
      {/* Back button — top-left, safe-area aware */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          haptic('light');
          onCancel();
        }}
        aria-label="Back"
        className="absolute left-3 z-30 h-11 w-11 rounded-full bg-background/95 backdrop-blur-md shadow-lg border-border/60"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      {/* GPS accuracy chip — top-right, safe-area aware */}
      {gpsAccuracy !== undefined && gpsAccuracy > 0 && (
        <div
          className="absolute right-3 z-30 px-2.5 py-1.5 rounded-full bg-background/95 backdrop-blur-md shadow-lg border border-border/60"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
        >
          <div className="flex items-center gap-1.5 text-xs">
            <LocateFixed
              className={cn(
                'h-3.5 w-3.5',
                gpsAccuracy < 10
                  ? 'text-success'
                  : gpsAccuracy < 20
                  ? 'text-warning'
                  : 'text-destructive'
              )}
            />
            <span className="font-semibold tabular-nums">±{gpsAccuracy.toFixed(0)}m</span>
          </div>
        </div>
      )}

      {/* Bottom action sheet — glass card, safe-area aware */}
      <div
        className="absolute left-0 right-0 bottom-0 z-30 pointer-events-none"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
      >
        <div className="pointer-events-auto mx-3 mb-2 rounded-3xl bg-background/92 backdrop-blur-xl shadow-2xl border border-border/60 p-3 space-y-2.5">
          {/* Segmented mode switcher */}
          <div className="relative grid grid-cols-2 bg-muted/60 rounded-2xl p-1">
            <span
              className={cn(
                'absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-background shadow-md transition-transform duration-300 ease-out',
                mode === 'walk' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'
              )}
              style={{ left: 4 }}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onModeChange('draw');
              }}
              className={cn(
                'relative z-10 h-10 flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-colors',
                mode === 'draw' ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <MapPin className="h-4 w-4" />
              {t('lands.map.mode.tap_to_mark')}
            </button>
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onModeChange('walk');
              }}
              className={cn(
                'relative z-10 h-10 flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-colors',
                mode === 'walk' ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <Footprints className="h-4 w-4" />
              {t('lands.map.mode.walk_boundary')}
            </button>
          </div>

          {/* Walk mode tracking */}
          {mode === 'walk' && onToggleTracking && (
            <Button
              variant={isTracking ? 'destructive' : 'default'}
              className="w-full h-11 rounded-2xl text-sm font-semibold"
              onClick={() => {
                haptic('medium');
                onToggleTracking();
              }}
            >
              <Navigation2 className="h-4 w-4 mr-1.5" />
              {isTracking
                ? t('lands.map.gps.stop_tracking')
                : t('lands.map.gps.start_tracking')}
            </Button>
          )}

          {/* Action row: undo / clear / save */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                haptic('light');
                onUndo();
              }}
              disabled={!canUndo}
              aria-label={t('lands.map.actions.undo') as string}
              className="h-12 w-12 rounded-2xl shrink-0"
            >
              <Undo2 className="h-4 w-4" />
            </Button>

            {onDeleteAll && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  haptic('medium');
                  onDeleteAll();
                }}
                disabled={!canUndo}
                aria-label={t('lands.map.actions.clear_all') as string}
                className="h-12 w-12 rounded-2xl shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}

            <Button
              onClick={() => {
                haptic('success');
                onSave();
              }}
              disabled={!saveEnabled}
              className={cn(
                'flex-1 h-12 rounded-2xl text-base font-semibold bg-primary text-primary-foreground shadow-lg',
                saveEnabled && 'ring-2 ring-primary/30'
              )}
            >
              <Save className="h-4 w-4 mr-2" />
              {t('lands.map.actions.save_boundary')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
