import { CalendarDays, MapPin, Package, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

interface ScheduleSummaryBarProps {
  cropName: string;
  landName: string;
  variety: string;
  sowingDate: string;
  harvestDate?: string;
  farmingType?: string;
}

const dateLabel = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, 'dd MMM yyyy');
};

export default function ScheduleSummaryBar({ cropName, landName, variety, sowingDate, harvestDate, farmingType }: ScheduleSummaryBarProps) {
  const { t } = useTranslation();
  const farmingLabels: Record<string, string> = {
    organic_only: t('schedule.farming_type.organic'),
    organic_fertilizer: t('schedule.farming_type.organic_chemical'),
    fertilizer_pesticide: t('schedule.farming_type.chemical'),
  };

  return (
    <section aria-label={t('schedule.title')} className="pb-2 pt-1">
      <div className="flex items-start gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
          <Sprout className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h2 className="break-words text-sm font-bold leading-5 text-foreground">{cropName}</h2>
            {farmingType && farmingLabels[farmingType] && <span className="text-[10px] font-medium text-primary">{farmingLabels[farmingType]}</span>}
          </div>
          <div className="flex items-start gap-1 text-[11px] leading-4 text-muted-foreground">
            <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{landName}<span className="mx-1.5 text-border" aria-hidden>·</span>{variety}</span>
          </div>
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-success/20 bg-success-soft px-2 py-1.5">
          <CalendarDays className="size-3.5 shrink-0 text-success" aria-hidden />
          <div className="min-w-0">
            <p className="text-[10px] leading-3 text-muted-foreground">{t('schedule.sowing')}</p>
            <p className="break-words text-[11px] font-semibold leading-4 text-foreground">{dateLabel(sowingDate) || t('schedule.schedule_card.tbd')}</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-warning/20 bg-warning-soft px-2 py-1.5">
          <Package className="size-3.5 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0">
            <p className="text-[10px] leading-3 text-muted-foreground">{t('schedule.harvest')}</p>
            <p className="break-words text-[11px] font-semibold leading-4 text-foreground">{dateLabel(harvestDate) || t('schedule.schedule_card.tbd')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}