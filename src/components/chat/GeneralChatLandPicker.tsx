/**
 * GeneralChatLandPicker
 *
 * Bottom-sheet dialog shown on the General chat tab before the first message
 * of a session, so the farmer can attach a specific land as context for the
 * direct-LLM senior-agronomist answer — or explicitly continue without one.
 */

import { useMemo } from 'react';
import { Sprout, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface PickerLand {
  id: string;
  name: string;
  current_crop?: string | null;
  crop_name?: string | null;
  area_hectares?: number | null;
  district?: string | null;
}

interface Props {
  open: boolean;
  lands: PickerLand[];
  onPick: (landId: string | null) => void;
  onClose: () => void;
}

export default function GeneralChatLandPicker({ open, lands, onPick, onClose }: Props) {
  const { t } = useTranslation('chat');

  const sortedLands = useMemo(
    () =>
      [...(lands || [])].sort((a, b) =>
        (a.name || '').localeCompare(b.name || ''),
      ),
    [lands],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold">
            {t('general.pick_land_title', 'Which land is this question about?')}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t(
              'general.pick_land_subtitle',
              'Attaching a land gives the agronomist your crop, stage and soil so the advice is tailored.',
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] px-3">
          <div className="flex flex-col gap-2 pb-3">
            <Button
              variant="outline"
              className="justify-start h-auto py-3"
              onClick={() => onPick(null)}
            >
              <Sprout className="w-4 h-4 mr-2 shrink-0" />
              <span className="text-left">
                <span className="block text-sm font-medium">
                  {t('general.no_specific_land', 'No specific land — general question')}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {t(
                    'general.no_specific_land_hint',
                    'Best for season planning, scheme info, market trends.',
                  )}
                </span>
              </span>
            </Button>

            {sortedLands.map((l) => (
              <Button
                key={l.id}
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => onPick(l.id)}
              >
                <MapPin className="w-4 h-4 mr-2 shrink-0 text-primary" />
                <span className="text-left">
                  <span className="block text-sm font-medium">{l.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {[
                      l.current_crop || l.crop_name,
                      l.area_hectares ? `${l.area_hectares} ha` : null,
                      l.district,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
