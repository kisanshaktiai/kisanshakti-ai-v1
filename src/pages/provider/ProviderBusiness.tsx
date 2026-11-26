import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarOff, Clock, Store, Tractor, TreePine, Wrench, type LucideIcon } from 'lucide-react';
import { NavRow, ProviderPage, StatusBadge } from '@/components/provider/ProviderUi';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { catalogueLabel } from '@/lib/providerText';

interface Section {
  key: 'profile' | 'services' | 'hours' | 'daysOff' | 'equipment' | 'nursery';
  icon: LucideIcon;
  path: string;
  summary: string;
  /** Shown as a pill on the right when the part still needs filling. */
  todo?: boolean;
}

/**
 * "My business" tab: one big row per part of the business, each with a
 * picture, a one-line summary and a pill when something is still missing.
 * Every part except the business details opens only after they exist, because
 * the server keeps the rest under them.
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
          todo: !profile,
        },
        {
          key: 'services', icon: Wrench, path: PROVIDER_ROUTES.services,
          summary: count(workspace.services.length), todo: workspace.services.length === 0,
        },
        {
          key: 'hours', icon: Clock, path: PROVIDER_ROUTES.hours,
          summary: workingDays > 0 ? t('provider.business.hoursSummary', { count: workingDays }) : t('provider.business.hoursMissing'),
          todo: workingDays === 0,
        },
        { key: 'daysOff', icon: CalendarOff, path: PROVIDER_ROUTES.daysOff, summary: count(workspace.blackouts.length) },
        { key: 'equipment', icon: Tractor, path: PROVIDER_ROUTES.equipment, summary: count(workspace.equipment.length) },
        { key: 'nursery', icon: TreePine, path: PROVIDER_ROUTES.nursery, summary: count(workspace.nursery_products.length) },
      ]
    : [];

  return (
    <ProviderPage
      title={t('provider.business.title')}
      eyebrow={profile?.public_name}
      pending={loading && !workspace}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
    >
      {!profile && workspace && (
        <p className="text-base text-muted-foreground">{t('provider.business.profileFirst')}</p>
      )}
      <div className="space-y-3">
        {sections.map(({ key, icon, path, summary, todo }) => (
          <NavRow
            key={key}
            icon={icon}
            title={t(`provider.business.sections.${key}`)}
            summary={summary}
            onClick={() => navigate(path)}
            disabled={key !== 'profile' && !profile}
            badge={todo ? <StatusBadge tone="busy">{t('provider.business.todo')}</StatusBadge> : undefined}
          />
        ))}
      </div>
    </ProviderPage>
  );
}
