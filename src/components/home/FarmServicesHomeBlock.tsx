import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ClipboardList, Tractor } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useServiceIcons } from '@/hooks/useServiceIcons';
import { farmServicesService } from '@/services/farmServicesService';
import { useFarmServicesStore } from '@/stores/farmServicesStore';
import { FARM_SERVICES_ROUTES } from '@/lib/farmServicesRoutes';
import { requestsSummary } from '@/lib/farmServicesText';
import { catalogueLabel } from '@/lib/providerText';

/** Kinds of work shown on the home screen: the ones with the most providers near the farmer. */
const TILES = 4;

/**
 * "Services near me" on the farmer's home screen: the kinds of work with the
 * most providers near his land as one-tap tiles, and his requests with a mark
 * when an answer waits for him. Rendered only while the farm_services_search
 * flag is on; shows the last answer at once and refreshes it when online.
 */
export function FarmServicesHomeBlock() {
  const { t } = useTranslation();
  const isOnline = useOfflineStatus();
  const iconFor = useServiceIcons();
  const nearby = useFarmServicesStore((s) => s.nearby);

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    farmServicesService.nearby()
      .then((answer) => { if (!cancelled) useFarmServicesStore.getState().setNearby(answer); })
      .catch(() => { /* the block keeps what it had; the page itself shows the error */ });
    return () => { cancelled = true; };
  }, [isOnline]);

  const tiles = [...(nearby?.families ?? [])].filter((f) => f.count > 0).sort((a, b) => b.count - a.count).slice(0, TILES);
  const counts = nearby?.requests;
  const waiting = counts?.offers_waiting ?? 0;
  const hasRequests = !!counts && counts.offers_waiting + counts.open + counts.booked + counts.to_rate > 0;

  return (
    <section className="mb-4 rounded-3xl border border-border/40 bg-card/70 p-3 shadow-sm backdrop-blur-sm" aria-label={t('farmServices.title')}>
      <Link to={FARM_SERVICES_ROUTES.home} className="flex min-h-[44px] items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Tractor className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-base font-bold leading-tight text-foreground">{t('farmServices.title')}</span>
          <span className="block text-sm text-muted-foreground break-words">{t('farmServices.home.hint')}</span>
        </span>
        <span className="flex shrink-0 items-center text-sm font-semibold text-primary">
          {t('farmServices.home.seeAll')}
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </span>
      </Link>

      {tiles.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {tiles.map((f) => {
            const Icon = iconFor(f.code);
            return (
              <Link
                key={f.code}
                to={FARM_SERVICES_ROUTES.family(f.code)}
                className="relative flex min-h-[92px] flex-col items-center gap-1.5 rounded-2xl bg-muted/60 px-1 py-2 text-center active:scale-[0.98]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold leading-tight text-foreground break-words">{catalogueLabel('category', f.code, f.label_en)}</span>
                <span className="absolute right-1 top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                  {f.count}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {hasRequests && (
        <Link
          to={FARM_SERVICES_ROUTES.requests}
          className={`mt-3 flex min-h-[56px] items-center gap-3 rounded-2xl px-3 py-2 active:scale-[0.99] ${waiting > 0 ? 'bg-warning-soft' : 'bg-muted/60'}`}
        >
          <ClipboardList className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block text-base font-bold leading-tight text-foreground">{t('farmServices.requests.title')}</span>
            <span className="block text-sm text-foreground/80 break-words">{requestsSummary(counts)}</span>
          </span>
          {waiting > 0 && (
            <span className="flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-full bg-primary px-2 text-sm font-bold text-primary-foreground">
              {waiting}
            </span>
          )}
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
