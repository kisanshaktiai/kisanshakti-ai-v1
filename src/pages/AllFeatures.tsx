import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, BookOpen, CreditCard, Lock, PlayCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useFeatures } from '@/hooks/useFeatures';
import { useFarmServicesFlag } from '@/hooks/useFarmServicesFlag';
import { useYouTubeChannelReels } from '@/hooks/useYouTubeChannelReels';
import { FarmServicesHomeBlock } from '@/components/home/FarmServicesHomeBlock';
import '@/living/living.css';

const VideoHelpCard = lazy(() => import('@/components/home/VideoHelpCard').then((m) => ({ default: m.VideoHelpCard })));

/** Screens that have a route but are not in the feature registry (src/config/featureConfig.ts). */
const MORE: Array<{ path: string; icon: LucideIcon; labelKey: string }> = [
  { path: '/app/videos', icon: PlayCircle, labelKey: 'living.all.videos' },
  { path: '/app/advisory', icon: BookOpen, labelKey: 'living.all.advisory' },
  { path: '/app/notifications/settings', icon: Bell, labelKey: 'living.all.notifications' },
  { path: '/app/subscription', icon: CreditCard, labelKey: 'living.all.subscription' },
];

/**
 * "All": every farmer feature in one launcher. The list is the feature registry
 * (useFeatures: tenant switches and plan locks applied), then the routed screens
 * the registry does not hold, then the two blocks the old home carried.
 */
export default function AllFeatures() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { features } = useFeatures();
  const farmServicesOn = useFarmServicesFlag();
  const { data: videos = [] } = useYouTubeChannelReels(8);

  const listed = [...features].filter((f) => !f.comingSoon && f.enabled).sort((a, b) => a.order - b.order);

  const tile = (key: string, Icon: LucideIcon, label: string, locked: boolean, onSelect: () => void) => (
    <button key={key} type="button" onClick={onSelect}
      className="relative flex min-w-0 flex-col items-center gap-2 rounded-[var(--lf-r)] border border-border bg-card px-2 py-3 text-center shadow-sm" style={{ minHeight: 'calc(var(--lf-tap) * 2)' }}>
      <span className="lf-tile bg-primary/10 text-primary"><Icon size={24} aria-hidden /></span>
      <span className="lf-cap w-full font-bold" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{label}</span>
      {locked && <span className="absolute end-2 top-2 text-muted-foreground" aria-label={t('living.all.locked')}><Lock size={16} aria-hidden /></span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-5" style={{ padding: '12px var(--lf-gut) 16px', fontSize: 'var(--lf-fs-body)' }}>
      <h1 className="lf-head">{t('living.all.title')}</h1>
      <div className="lf-grid3">
        {listed.map((f) => tile(f.id, f.icon as LucideIcon, t(f.labelKey), !!f.locked, () => navigate(f.locked ? '/app/subscription' : f.path)))}
        {MORE.map((m) => tile(m.path, m.icon, t(m.labelKey), false, () => navigate(m.path)))}
      </div>
      {farmServicesOn && <FarmServicesHomeBlock />}
      {(videos as unknown[]).length > 0 && (
        <Suspense fallback={<div className="h-32" aria-hidden />}>
          <VideoHelpCard videos={videos as never[]} onClick={() => navigate('/app/reels')} />
        </Suspense>
      )}
    </div>
  );
}
