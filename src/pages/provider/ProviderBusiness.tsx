import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarOff, ChevronRight, Clock, Sprout, Store, Tractor, Wrench, type LucideIcon,
} from 'lucide-react';
import { ProviderPage } from '@/components/provider/ProviderUi';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { catalogueLabel } from '@/lib/providerText';

interface Section {
  key: 'profile' | 'services' | 'hours' | 'daysOff' | 'equipment' | 'nursery';
  icon: LucideIcon;
  path: string;
  summary: string;
}

/**
 * "My business" tab: one row per part of the business, each with a one-line
 * summary of what is saved. Every part except the business profile opens only
 * after the profile exists, because the server keeps the rest under it.
 */
export default function ProviderBusiness() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspace, catalogue, loading, loadError, isOnline, reload } = useProviderWorkspace();

  const profile = workspace?.profile ?? null;
  const workingDays = workspace?.working_hours.filter((d) => d.is_working).length ?? 0;
  const count = (n: number) => t('provider.business.count', { count: n });

  const sections: Section[] = workspace
    ? [
        {
          key: 'profile', icon: Store, path: PROVIDER_ROUTES.profile,
          summary: profile
            ? t('provider.business.profileSummary', {
                name: profile.public_name,
                type: catalogueLabel(
                  'providerType', profile.provider_type,
                  catalogue?.providerTypes.find((p) => p.code === profile.provider_type)?.label_en,
                ),
              })
            : t('provider.business.profileMissing'),
        },
        { key: 'services', icon: Wrench, path: PROVIDER_ROUTES.services, summary: count(workspace.services.length) },
        {
          key: 'hours', icon: Clock, path: PROVIDER_ROUTES.hours,
          summary: workingDays > 0 ? t('provider.business.hoursSummary', { count: workingDays }) : t('provider.business.hoursMissing'),
        },
        { key: 'daysOff', icon: CalendarOff, path: PROVIDER_ROUTES.daysOff, summary: count(workspace.blackouts.length) },
        { key: 'equipment', icon: Tractor, path: PROVIDER_ROUTES.equipment, summary: count(workspace.equipment.length) },
        { key: 'nursery', icon: Sprout, path: PROVIDER_ROUTES.nursery, summary: count(workspace.nursery_products.length) },
      ]
    : [];

  return (
    <ProviderPage
      title={t('provider.business.title')}
      pending={loading && !workspace}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
    >
      {!profile && workspace && (
        <p className="text-sm text-muted-foreground">{t('provider.business.profileFirst')}</p>
      )}
      <div className="space-y-3">
        {sections.map(({ key, icon: Icon, path, summary }) => (
          <button
            key={key}
            type="button"
            onClick={() => navigate(path)}
            disabled={key !== 'profile' && !profile}
            className="w-full min-h-[72px] flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left disabled:opacity-60"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-base font-semibold text-foreground">{t(`provider.business.sections.${key}`)}</span>
              <span className="block text-sm text-muted-foreground break-words">{summary}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </div>
    </ProviderPage>
  );
}
