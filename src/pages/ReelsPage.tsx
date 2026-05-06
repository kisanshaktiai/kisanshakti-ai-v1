import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Heart, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { useLanguageStore } from '@/stores/languageStore';
import {
  useReelsFeed,
  useReelCategories,
  useReelEngagementState,
  useToggleReelLike,
  useToggleReelSave,
  useRecordReelShare,
  recordReelView,
  Reel,
} from '@/hooks/useReelsFeed';
import { useAuthStore } from '@/stores/authStore';
import { ReelPlayer } from '@/components/reels/ReelPlayer';
import { ReelActionRail } from '@/components/reels/ReelActionRail';
import { ReelCommentsSheet } from '@/components/reels/ReelCommentsSheet';
import { ReelReportSheet } from '@/components/reels/ReelReportSheet';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function ReelsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentLanguage } = useLanguageStore();
  const { session } = useAuthStore();
  const farmerId = session?.farmerId;

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [commentsForReel, setCommentsForReel] = useState<string | null>(null);
  const [reportForReel, setReportForReel] = useState<string | null>(null);
  const [doubleTapHearts, setDoubleTapHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const lastTapRef = useRef<{ t: number; reelId: string | null }>({ t: 0, reelId: null });
  const containerRef = useRef<HTMLDivElement>(null);
  const viewedRef = useRef<Set<string>>(new Set());

  const { data: categories = [] } = useReelCategories();
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useReelsFeed({ categoryId: activeCategoryId });

  const reels: Reel[] = useMemo(
    () => (data?.pages.flatMap((p) => p.items) ?? []),
    [data]
  );
  const reelIds = useMemo(() => reels.map((r) => r.id), [reels]);
  const { data: engagement } = useReelEngagementState(reelIds);

  const likeMut = useToggleReelLike();
  const saveMut = useToggleReelSave();
  const shareMut = useRecordReelShare();

  // Snap-scroll active index detection
  const onScroll = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const idx = Math.round(c.scrollTop / c.clientHeight);
    if (idx !== activeIndex && idx >= 0 && idx < reels.length) {
      setActiveIndex(idx);
      setIsPaused(false);
    }
    // Prefetch when near the end
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      idx >= reels.length - 3
    ) {
      fetchNextPage();
    }
  }, [activeIndex, reels.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Record a view once per reel session when it becomes active
  useEffect(() => {
    const r = reels[activeIndex];
    if (!r) return;
    if (viewedRef.current.has(r.id)) return;
    viewedRef.current.add(r.id);
    recordReelView(r.id, farmerId, 0, false);
  }, [activeIndex, reels, farmerId]);

  // Refetch when language changes
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLanguage]);

  const triggerDoubleTapHeart = (e: React.MouseEvent | React.TouchEvent) => {
    const point = 'touches' in e ? e.changedTouches[0] : e;
    const id = Date.now();
    const x = (point as Touch).clientX;
    const y = (point as Touch).clientY;
    setDoubleTapHearts((h) => [...h, { id, x, y }]);
    setTimeout(() => setDoubleTapHearts((h) => h.filter((p) => p.id !== id)), 800);
  };

  const handleTap = (reel: Reel) => (e: React.MouseEvent) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last.reelId === reel.id && now - last.t < 280) {
      // Double tap → like (if not already liked)
      const liked = engagement?.liked.has(reel.id) ?? false;
      if (!liked) likeMut.mutate({ reelId: reel.id, liked: false });
      triggerDoubleTapHeart(e);
      lastTapRef.current = { t: 0, reelId: null };
    } else {
      lastTapRef.current = { t: now, reelId: reel.id };
      // Single-tap fallback after window: toggle pause
      setTimeout(() => {
        if (lastTapRef.current.t === now) {
          setIsPaused((p) => !p);
          lastTapRef.current = { t: 0, reelId: null };
        }
      }, 290);
    }
  };

  const share = async (reel: Reel) => {
    const shareUrl = `${window.location.origin}/app/reels?reel=${reel.id}`;
    const text = `${reel.title} — ${shareUrl}`;
    let channel = 'copy_link';
    if (navigator.share) {
      try {
        await navigator.share({ title: reel.title, text: reel.description ?? '', url: shareUrl });
        channel = 'native';
      } catch {
        return; // user dismissed
      }
    } else {
      // WhatsApp deep link as primary fallback for farmers
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      channel = 'whatsapp';
    }
    shareMut.mutate({ reelId: reel.id, channel });
    toast({ description: t('reels.shared', 'Shared') });
  };

  const localizedCategoryName = (name: Record<string, string>) =>
    name?.[currentLanguage] || name?.en || Object.values(name || {})[0] || '';

  return (
    <div className="fixed inset-0 z-40 bg-black overflow-hidden">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center gap-2 px-3 pt-[env(safe-area-inset-top,12px)] pb-2 bg-gradient-to-b from-black/70 to-transparent">
        <button
          onClick={() => navigate(-1)}
          aria-label={t('common.back', 'Back')}
          className="w-10 h-10 rounded-full bg-black/55 flex items-center justify-center text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 pl-1">
            <CategoryPill
              active={activeCategoryId === null}
              label={t('reels.category.all', 'All')}
              onClick={() => {
                setActiveCategoryId(null);
                setActiveIndex(0);
                viewedRef.current.clear();
                containerRef.current?.scrollTo({ top: 0 });
              }}
            />
            {categories.map((c) => (
              <CategoryPill
                key={c.id}
                active={activeCategoryId === c.id}
                label={`${c.icon ?? ''} ${localizedCategoryName(c.name_i18n)}`.trim()}
                onClick={() => {
                  setActiveCategoryId(c.id);
                  setActiveIndex(0);
                  viewedRef.current.clear();
                  containerRef.current?.scrollTo({ top: 0 });
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && reels.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
          <p className="text-white text-lg font-semibold mb-1">
            {t('reels.empty.title', 'No videos yet')}
          </p>
          <p className="text-white/70 text-sm">
            {t('reels.empty.hint', 'Check back later for new content')}
          </p>
        </div>
      )}

      {/* Snap pager */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar"
        style={{ scrollbarWidth: 'none' }}
      >
        {reels.map((reel, i) => {
          const liked = engagement?.liked.has(reel.id) ?? false;
          const saved = engagement?.saved.has(reel.id) ?? false;
          const isActive = i === activeIndex;
          // Only render players for active +/- 1 (perf on low-end phones)
          const shouldMount = Math.abs(i - activeIndex) <= 1;
          return (
            <section
              key={reel.id}
              className="relative h-full w-full snap-start snap-always"
            >
              {shouldMount ? (
                <ReelPlayer
                  reel={reel}
                  isActive={isActive}
                  isMuted={isMuted}
                  isPaused={isActive && isPaused}
                  onTap={handleTap(reel) as unknown as () => void}
                />
              ) : reel.thumbnail_url ? (
                <img src={reel.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-black" />
              )}

              {/* Bottom info */}
              <div className="absolute left-0 right-16 bottom-0 p-4 pb-6 z-20 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none">
                <div className="space-y-1.5">
                  <h2 className="text-white text-base font-bold leading-snug drop-shadow-md line-clamp-2">
                    {reel.title}
                  </h2>
                  {reel.description && (
                    <p className="text-white/85 text-sm line-clamp-2 drop-shadow">
                      {reel.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    {reel.is_featured && (
                      <Badge className="bg-yellow-500/90 text-black border-0 text-[10px] h-5">
                        ★ {t('reels.featured', 'Featured')}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="bg-white/15 text-white border-0 text-[10px] h-5">
                      {reel.language_code.toUpperCase()}
                    </Badge>
                    {reel.visibility_scope === 'tenant' && (
                      <Badge variant="secondary" className="bg-primary/80 text-primary-foreground border-0 text-[10px] h-5">
                        {t('reels.from_org', 'From your organization')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {isActive && (
                <ReelActionRail
                  reel={reel}
                  liked={liked}
                  saved={saved}
                  isMuted={isMuted}
                  onLike={() => likeMut.mutate({ reelId: reel.id, liked })}
                  onSave={() => saveMut.mutate({ reelId: reel.id, saved })}
                  onComment={() => setCommentsForReel(reel.id)}
                  onShare={() => share(reel)}
                  onReport={() => setReportForReel(reel.id)}
                  onToggleMute={() => setIsMuted((m) => !m)}
                />
              )}
            </section>
          );
        })}

        {isFetchingNextPage && (
          <div className="h-20 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white/70 animate-spin" />
          </div>
        )}
      </div>

      {/* Double-tap heart bursts */}
      <AnimatePresence>
        {doubleTapHearts.map((p) => (
          <motion.div
            key={p.id}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1.4, opacity: 1 }}
            exit={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="fixed pointer-events-none z-50"
            style={{ left: p.x - 40, top: p.y - 40 }}
          >
            <Heart className="w-20 h-20 text-red-500 fill-red-500 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]" />
          </motion.div>
        ))}
      </AnimatePresence>

      <ReelCommentsSheet
        reelId={commentsForReel}
        open={!!commentsForReel}
        onOpenChange={(o) => !o && setCommentsForReel(null)}
      />
      <ReelReportSheet
        reelId={reportForReel}
        open={!!reportForReel}
        onOpenChange={(o) => !o && setReportForReel(null)}
      />

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

function CategoryPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 h-9 px-3.5 rounded-full text-sm font-medium transition-colors',
        active ? 'bg-white text-black' : 'bg-black/55 text-white border border-white/15'
      )}
    >
      {label}
    </button>
  );
}
