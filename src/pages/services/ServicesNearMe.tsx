import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ClipboardList, MapPinOff } from 'lucide-react';
import { EmptyState } from '@/components/layout/EmptyState';
import { NavRow, ProviderPage, Question, StatusBadge, TileGrid } from '@/components/provider/ProviderUi';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useServiceCatalogue } from '@/hooks/useServiceCatalogue';
import { farmServicesService, type NearbyFamilies } from '@/services/farmServicesService';
import { FARM_SERVICES_ROUTES } from '@/lib/farmServicesRoutes';
import { farmServicesErrorMessage, requestsSummary } from '@/lib/farmServicesText';
import { useFarmServicesStore } from '@/stores/farmServicesStore';
import { familyIcon } from '@/lib/providerIcons';
import { catalogueLabel } from '@/lib/providerText';

/** Kinds of work shown before "see all". */
const FAMILIES_FIRST = 8;

/**
 * "Services near me": the farmer picks the kind of work he needs and sees how
 * many providers near his land offer it. Counts come from the server, which
 * knows his lands from the session; nothing about him goes anywhere.
 */
export default function ServicesNearMe() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOnline = useOfflineStatus();
  const { catalogue, error: catalogueError } = useServiceCatalogue();
  const [nearby, setNearby] = useState<NearbyFamilies | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const answer = await farmServicesService.nearby();
      setNearby(answer);
      useFarmServicesStore.getState().setNearby(answer);
    } catch (e) {
      setError(farmServicesErrorMessage(e));
    }
  }, []);

  useEffect(() => { if (isOnline) void load(); }, [isOnline, load]);

  const families = (catalogue?.categories ?? []).filter((c) => c.parent_code === null);
  const counts = new Map((nearby?.families ?? []).map((f) => [f.code, f.count]));
  const withCount = families.map((c) => ({ ...c, count: counts.get(c.code) ?? 0 }));
  const shown = showAll ? withCount : withCount.slice(0, FAMILIES_FIRST);
  const waiting = nearby?.requests?.offers_waiting ?? 0;

  return (
    <ProviderPage
      title={t('farmServices.title')}
      eyebrow={t('farmServices.subtitle')}
      backTo="/app"
      pending={!catalogue || (!nearby && !error && isOnline)}
      loadError={error ?? catalogueError}
      onRetry={load}
      isOnline={isOnline}
    >
      {catalogue && nearby && (
        <div className="space-y-5">
          {!nearby.located && (
            <EmptyState
              icon={MapPinOff}
              title={t('farmServices.notLocatedTitle')}
              description={t('farmServices.notLocatedDescription')}
            />
          )}
          <NavRow
            icon={ClipboardList}
            title={t('farmServices.requests.title')}
            summary={requestsSummary(nearby.requests)}
            onClick={() => navigate(FARM_SERVICES_ROUTES.requests)}
            badge={waiting > 0
              ? <StatusBadge tone="busy">{waiting}</StatusBadge>
              : <ChevronRight className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />}
          />
          <Question>{t('farmServices.whatQuestion')}</Question>
          <TileGrid
            label={t('farmServices.whatQuestion')}
            options={shown.map((c) => ({
              value: c.code,
              label: catalogueLabel('category', c.code, c.label_en),
              detail: t('farmServices.nearCount', { count: c.count }),
              icon: familyIcon(c.code),
            }))}
            selected={[]}
            onToggle={(code) => navigate(FARM_SERVICES_ROUTES.family(code))}
          />
          {!showAll && withCount.length > FAMILIES_FIRST && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 text-base font-semibold text-primary"
            >
              {t('farmServices.seeAll', { count: withCount.length })}
              <ChevronDown className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </ProviderPage>
  );
}
