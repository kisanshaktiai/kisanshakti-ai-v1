import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import NotificationSettings from '@/components/notifications/NotificationSettings';
import { InnerPageHeader } from '@/components/profile/InnerPageHeader';
import { PageShell } from '@/components/layout/PageShell';

export default function NotificationSettingsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <PageShell
      padding="none"
      spacing="none"
      stickyHeader={
        <InnerPageHeader
          title={t('notification.settings')}
          subtitle={t('notification.settingsSubtitle')}
          onBack={() => navigate('/app/profile')}
        />
      }
    >
      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        <NotificationSettings />
      </div>
    </PageShell>
  );
}
