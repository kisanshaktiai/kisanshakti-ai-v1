import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sprout, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePendingHarvests, type PendingHarvest } from '@/hooks/usePendingHarvests';
import { HarvestConfirmDialog } from '@/components/schedule/HarvestConfirmDialog';
import { useHarvestNotificationDelivery } from '@/hooks/useHarvestNotificationDelivery';
import { cn } from '@/lib/utils';

/**
 * Shown above AlertsSummaryCard on Home whenever the engine has matured
 * one or more schedules and is awaiting the farmer's confirmation.
 * Tap → opens the HarvestConfirmDialog for the most-due request.
 */
export function HarvestConfirmBanner() {
  const { t } = useTranslation();
  const { data: pending } = usePendingHarvests();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<PendingHarvest | null>(null);

  // Step 5 — fire a local browser notification once per matured schedule
  useHarvestNotificationDelivery();

  if (!pending || pending.length === 0) return null;
  const primary = pending[0];
  const crop = primary.crop_schedules?.crop_name || t('schedule.harvest.crop_fallback', 'your crop');
  const land = primary.lands?.name || '';
  const extra = pending.length - 1;

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => { setActive(primary); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { setActive(primary); setOpen(true); } }}
        className={cn(
          'mb-4 flex items-center gap-3 p-4 cursor-pointer',
          'bg-warning-soft text-warning-foreground',
          'border-warning/40 hover:border-warning transition-colors',
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning text-warning-foreground shrink-0">
          <Sprout className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {t('schedule.harvest.banner.title', 'Ready for harvest — please confirm')}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {crop}{land ? ` • ${land}` : ''}
          </p>
        </div>
        {extra > 0 && (
          <Badge variant="secondary" className="shrink-0">+{extra}</Badge>
        )}
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </Card>

      <HarvestConfirmDialog open={open} onOpenChange={setOpen} request={active} />
    </>
  );
}
