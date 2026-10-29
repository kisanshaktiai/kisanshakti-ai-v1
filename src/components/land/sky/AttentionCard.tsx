import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Camera, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CropPhotoCapture } from '@/components/Photo/CropPhotoCapture';
import { cn } from '@/lib/utils';
import { attentionLevel, type FieldSky } from '@/hooks/useFieldSky';

/**
 * "Needs your attention." Shown only when the governed sources themselves say
 * something changed (field state, cohort position, water agreement). It adds
 * no threshold of its own and issues no recommendation — it points the farmer
 * at the field and at the map, and opens the existing photo pipeline.
 */
export function AttentionCard({ sky, landId, cropName, farmerId, tenantId, onShowOnMap }: {
  sky: FieldSky; landId: string; cropName?: string | null; farmerId: string; tenantId: string; onShowOnMap?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const level = attentionLevel(sky);
  if (!level) return null;
  const severe = level === 'severe';
  // say what the sign actually is: a watch raised only by the water balance is about water, not about the crop slipping behind
  const waterOnly = !severe && sky.state !== 'slower' && sky.neighbours.state !== 'well_behind';

  const sentence = severe
    ? t('sky.attention.severe', 'The satellite view of this field has changed and more than one sign agrees. Please walk the field today.')
    : waterOnly
      ? t('sky.water.depleted', 'The soil water balance says the field needs water. The satellite has not seen a change yet.')
      : t('sky.attention.watch', 'One sign says this field is slipping behind. Please have a look when you can.');

  return (
    <Card className={cn('rounded-3xl border', severe ? 'border-destructive/40 bg-destructive/5' : 'border-warning/40 bg-warning/5')}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className={cn('h-4 w-4', severe ? 'text-destructive' : 'text-warning')} />
          <p className="text-[13px] font-semibold text-muted-foreground">{t('sky.attention.title', 'Needs your attention')}</p>
        </div>
        <p className="text-sm font-medium leading-snug">{sentence}</p>
        <div className="flex gap-2 mt-3">
          <Button onClick={() => setOpen(true)} className="flex-1 h-12 rounded-2xl text-base font-semibold">
            <Camera className="h-5 w-5 mr-2" />{t('sky.attention.photo', 'Send a photo')}
          </Button>
          {onShowOnMap && (
            <Button variant="outline" onClick={onShowOnMap} className="h-12 rounded-2xl text-base font-semibold">
              <MapPin className="h-5 w-5 mr-2" />{t('sky.attention.map', 'Map')}
            </Button>
          )}
        </div>
      </CardContent>
      <CropPhotoCapture isOpen={open} onClose={() => setOpen(false)} purpose="land_card" farmerId={farmerId} tenantId={tenantId} landId={landId} />
    </Card>
  );
}
