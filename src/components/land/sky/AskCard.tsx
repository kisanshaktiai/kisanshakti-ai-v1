import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Footprints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CropPhotoCapture } from '@/components/Photo/CropPhotoCapture';
import type { FieldSky } from '@/hooks/useFieldSky';

/**
 * The ask-back. The satellite can say "something changed"; only the farmer's
 * eyes and phone camera can say why. This opens the app's existing photo
 * pipeline (chat surface) for this land — the ground truth every model lacks.
 */
export function AskCard({ sky, landId, cropName, farmerId, tenantId }: { sky: FieldSky; landId: string; cropName?: string; farmerId: string; tenantId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const urgent = sky.state === 'something_wrong' || sky.water.agreeing >= 3;

  const prompt = urgent
    ? t('sky.ask.urgent', 'Please walk the field and send a photo of the weakest-looking spot. That tells us more than the satellite can.')
    : t('sky.ask.routine', 'A photo now and then helps the satellite view stay accurate for your field.');

  return (
    <Card className="rounded-3xl border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Footprints className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('sky.ask.title', 'What to check')}</p>
        </div>
        <p className="text-sm font-medium leading-snug">{prompt}</p>
        <Button onClick={() => setOpen(true)} className="w-full mt-3 h-12 rounded-2xl text-base font-semibold">
          <Camera className="h-5 w-5 mr-2" />{t('sky.ask.cta', 'Take a photo of the field')}
        </Button>
      </CardContent>
      <CropPhotoCapture isOpen={open} onClose={() => setOpen(false)} purpose="land_card" farmerId={farmerId} tenantId={tenantId} landId={landId} />
    </Card>
  );
}
