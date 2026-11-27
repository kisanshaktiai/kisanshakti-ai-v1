import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import type { ElementType } from 'react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { farmerAuthService, isMultiRoleEnabled } from '@/services/farmerAuthService';
import {
  Phone,
  MapPin,
  LogOut,
  Pencil,
  TrendingUp,
  Droplets,
  Calendar,
  Award,
  Tractor,
  Package,
  Activity,
  BarChart3,
  Clock,
  Users,
  Bell,
  Sprout,
  LandPlot,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { TTSSettingsPanel } from '@/components/tts';
import { PageShell } from '@/components/layout/PageShell';
import { useNavigate } from 'react-router-dom';
import { SyncStatus } from '@/components/sync/SyncStatus';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { IconTile, SectionCard, SettingsGroup, SettingsRow } from '@/components/profile/SettingsList';
import { SubscriptionCard } from '@/components/subscription/SubscriptionCard';
import { useLocalizedPlace } from '@/hooks/useLocalizedPlace';
import { useCropNames } from '@/hooks/useCropNames';
import { formatFarmerDate } from '@/lib/dateFormat';

// Values the Edit Profile selects save; each one already has its label in
// the profile_edit bundle (farmType<Value>, <irrigation value in lower case>).
const FARM_TYPE_VALUES = ['Small', 'Medium', 'Large', 'Commercial'];
const IRRIGATION_VALUES = ['drip', 'sprinkler', 'canal', 'tubewell', 'rainfed'];

interface FactTileProps {
  icon: ElementType;
  label: string;
  value: string;
  /** true / false adds a tick or a cross, so the answer reads without the words. */
  status?: boolean;
}

function FactTile({ icon, label, value, status }: FactTileProps) {
  return (
    <div className="rounded-2xl bg-muted/50 p-3">
      <div className="flex items-center gap-2">
        <IconTile icon={icon} size="sm" />
        <span className="min-w-0 text-sm font-medium leading-tight text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-base font-semibold leading-snug text-foreground">
        {status === true && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />}
        {status === false && <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="min-w-0 break-words">{value}</span>
      </p>
    </div>
  );
}

interface UsageStatProps {
  icon: ElementType;
  label: string;
  value: string | number;
}

function UsageStat({ icon: Icon, label, value }: UsageStatProps) {
  return (
    <div className="rounded-2xl bg-muted/50 p-3">
      <p className="break-words text-lg font-bold leading-tight text-foreground">{value}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm leading-tight text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{label}</span>
      </p>
    </div>
  );
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { join: joinPlace } = useLocalizedPlace();
  const cropNameOf = useCropNames();
  const { user, logout } = useAuthStore();
  const setUser = useAuthStore((state) => state.setUser);
  const navigate = useNavigate();
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!user?.id) return;
      // The farmers table is not readable from the browser; the service
      // returns only the row behind this session.
      try {
        const { farmer } = await farmerAuthService.getFarmerProfile();
        if (farmer) setAnalyticsData(farmer);
      } catch (error) {
        console.warn('Profile analytics unavailable:', error);
      }
    };

    fetchAnalytics();
  }, [user?.id]);

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  const handleEditProfile = () => {
    navigate('/app/profile/edit');
  };

  // Show the new photo at once, the same way the Edit Profile page does.
  const handleAvatarUpdate = (url: string) => {
    if (user) {
      setUser({ ...user, avatarUrl: url });
    }
  };

  // Format location string
  const getLocation = () => {
    const s = joinPlace({ village: user?.village, taluka: user?.taluka, district: user?.district, state: user?.state });
    return s || t('profile.info.location_not_set');
  };

  // Calculate profile completion
  const calculateProfileCompletion = () => {
    let completed = 0;
    const fields = [
      user?.fullName,
      user?.village,
      user?.district,
      user?.state,
      user?.pincode,
      user?.totalLandAcres,
      user?.primaryCrops?.length,
      user?.farmingExperienceYears,
      user?.farmType,
      user?.dateOfBirth
    ];
    fields.forEach(field => {
      if (field) completed++;
    });
    return Math.round((completed / fields.length) * 100);
  };

  const profileCompletion = calculateProfileCompletion();

  // Dates in the app language (lib/dateFormat), not date-fns English.
  const formatDate = (time: number) => formatFarmerDate(new Date(time), (i18n.language || 'en').split('-')[0]);

  // Same wording as the sync card: just now / minutes / hours, then the date.
  const formatLastActive = (value: string) => {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return t('profile.analytics.unknown');
    const diff = Date.now() - time;
    if (diff < 60000) return t('sync.just_now');
    if (diff < 3600000) return t('sync.minutes_ago', { count: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('sync.hours_ago', { count: Math.floor(diff / 3600000) });
    return formatDate(time);
  };

  const formatMemberSince = (value: string) => {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return t('profile.analytics.unknown');
    return formatDate(time);
  };

  const displayName = user?.farmerName || user?.fullName || user?.name || t('profile.role.farmer');
  const shortLocation =
    joinPlace({ village: user?.village, district: user?.district }, ['village', 'district']) ||
    t('profile.info.location_not_set');
  const crops = user?.primaryCrops && user.primaryCrops.length > 0 ? user.primaryCrops : [];

  const farmTypeLabel = !user?.farmType
    ? t('profile.farm_info.not_specified')
    : FARM_TYPE_VALUES.includes(user.farmType)
    ? t(`profile_edit.farmType${user.farmType}`)
    : t(`profile.farm_type.${user.farmType.toLowerCase()}`, user.farmType);

  const irrigationLabel = !user?.hasIrrigation
    ? t('profile.farm_info.no')
    : !user.irrigationType
    ? t('profile.farm_info.yes')
    : IRRIGATION_VALUES.includes(user.irrigationType.toLowerCase())
    ? t(`profile_edit.${user.irrigationType.toLowerCase()}`)
    : user.irrigationType;

  return (
    <PageShell padding="default" spacing="none">
      <div className="mx-auto w-full max-w-2xl animate-fade-in space-y-4 lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        {/* ── Column 1: who the farmer is ─────────────────────────────── */}
        <div className="space-y-4">
          {/* Identity */}
          <section className="relative overflow-hidden rounded-3xl bg-primary text-primary-foreground shadow-md">
            <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-primary-foreground/10" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-primary-foreground/5" />

            <div className="relative p-5">
              <div className="flex items-center gap-4">
                <AvatarUpload
                  currentAvatarUrl={user?.avatarUrl}
                  onAvatarUpdate={handleAvatarUpdate}
                  size="lg"
                  editable={true}
                />
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-semibold">
                    <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('profile.role.farmer')}
                  </span>
                  <h1 className="mt-1.5 line-clamp-2 break-words text-xl font-bold leading-tight">{displayName}</h1>
                </div>
              </div>

              <div className="mt-4 space-y-1.5 text-sm text-primary-foreground/90">
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="sr-only">{t('profile.info.phone')}: </span>
                  <span className="font-medium">{user?.phone || t('profile.info.not_set')}</span>
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="sr-only">{t('profile.info.location')}: </span>
                  <span className="min-w-0 truncate font-medium">{shortLocation}</span>
                </p>
              </div>

              {/* Profile Completion — shown only while something is missing */}
              {profileCompletion < 100 && (
                <div
                  className="mt-4 rounded-2xl bg-primary-foreground/10 px-3 py-2.5"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={profileCompletion}
                  aria-label={t('profile.completion.label')}
                >
                  <div className="flex items-center justify-between gap-3 text-sm font-medium">
                    <span>{t('profile.completion.label')}</span>
                    <span className="font-bold">{profileCompletion}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-primary-foreground/25">
                    <div className="h-full rounded-full bg-primary-foreground" style={{ width: `${profileCompletion}%` }} />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleEditProfile}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-foreground text-base font-semibold text-primary transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary motion-reduce:transition-none"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {t('profile_edit.title')}
              </button>
            </div>
          </section>

          {/* Farm Details */}
          <SectionCard title={t('profile.farm_info.title')} icon={LandPlot}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FactTile
                icon={MapPin}
                label={t('profile.farm_info.total_land')}
                value={`${user?.totalLandAcres || 0} ${t('profile.farm_info.acres')}`}
              />
              <FactTile
                icon={Calendar}
                label={t('profile.farm_info.experience')}
                value={`${user?.farmingExperienceYears || 0} ${t('profile.farm_info.years')}`}
              />
              <FactTile icon={Award} label={t('profile.farm_info.farm_type')} value={farmTypeLabel} />
              <FactTile
                icon={Droplets}
                label={t('profile.farm_info.irrigation')}
                value={irrigationLabel}
                status={!!user?.hasIrrigation}
              />
              <FactTile
                icon={Tractor}
                label={t('profile.farm_info.tractor')}
                value={user?.hasTractor ? t('profile.farm_info.available') : t('profile.farm_info.not_available')}
                status={!!user?.hasTractor}
              />
              <FactTile
                icon={Package}
                label={t('profile.farm_info.storage')}
                value={user?.hasStorage ? t('profile.farm_info.available') : t('profile.farm_info.not_available')}
                status={!!user?.hasStorage}
              />
            </div>

            {/* Crops */}
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('profile.primary_crops')}</h3>
              {crops.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {crops.map((crop, index) => (
                    <li
                      key={index}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary"
                    >
                      <Sprout className="h-4 w-4" aria-hidden="true" />
                      {cropNameOf(crop)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-base font-semibold text-foreground">{t('profile.farm_info.not_specified')}</p>
              )}
            </div>

            {/* Location */}
            <div className="mt-4 flex items-start gap-3 border-t border-border pt-4">
              <IconTile icon={MapPin} size="sm" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-muted-foreground">{t('profile.location_details')}</h3>
                <p className="mt-0.5 break-words text-base font-semibold leading-snug text-foreground">{getLocation()}</p>
                {user?.pincode && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t('profile_edit.pincode')}: {user.pincode}
                  </p>
                )}
              </div>
            </div>
          </SectionCard>

          {/* App Usage Analytics */}
          {analyticsData && (
            <SectionCard title={t('profile.analytics.title')} icon={BarChart3}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                <UsageStat
                  icon={Activity}
                  label={t('profile.analytics.total_opens')}
                  value={analyticsData.total_app_opens || 0}
                />
                <UsageStat
                  icon={TrendingUp}
                  label={t('profile.analytics.ai_queries')}
                  value={analyticsData.total_queries || 0}
                />
                <UsageStat
                  icon={Clock}
                  label={t('profile.analytics.last_active')}
                  value={analyticsData.last_app_open
                    ? formatLastActive(analyticsData.last_app_open)
                    : t('profile.analytics.never')}
                />
                <UsageStat
                  icon={Calendar}
                  label={t('profile.analytics.member_since')}
                  value={analyticsData.created_at
                    ? formatMemberSince(analyticsData.created_at)
                    : t('profile.analytics.unknown')}
                />
              </div>
            </SectionCard>
          )}
        </div>

        {/* ── Column 2: plan, settings and account ────────────────────── */}
        <div className="space-y-4">
          {/* Subscription Card — entry point to /app/subscription */}
          <SubscriptionCard />

          <h2 className="px-1 pt-1 text-sm font-bold text-muted-foreground">{t('menu.settings')}</h2>

          <SettingsGroup>
            <SettingsRow
              icon={Bell}
              title={t('menu.notifications')}
              description={t('notification.settingsSubtitle')}
              onClick={() => navigate('/app/notifications/settings')}
            />
            {/* Multi-role identity: the farmer's way to the Roles page, where the same
                person adds the Service Provider or Customer role (no new number, no
                new PIN) and opens that workspace. Shown only while the flag is on. */}
            {isMultiRoleEnabled() && (
              <SettingsRow
                icon={Users}
                title={t('identity.profile.addRoleEntry')}
                onClick={() => navigate('/roles')}
              />
            )}
          </SettingsGroup>

          {/* Voice Settings */}
          <TTSSettingsPanel />

          {/* Sync Status */}
          <SyncStatus />

          <Button
            onClick={handleLogout}
            variant="outline"
            className="h-12 w-full border-destructive/40 text-base font-semibold text-destructive hover:border-destructive hover:bg-destructive/5"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t('auth.logout')}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
