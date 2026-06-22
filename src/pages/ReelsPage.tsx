import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Heart, Loader2, MessageCircle, ExternalLink, Youtube } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { useLanguageStore } from '@/stores/languageStore';
import { useYouTubeChannelReels } from '@/hooks/useYouTubeChannelReels';
import { useYouTubeReelEngagement } from '@/hooks/useYouTubeReelEngagement';
import { ReelPlayer } from '@/components/reels/ReelPlayer';
import { ReelActionRail } from '@/components/reels/ReelActionRail';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const YT_CHANNEL_URL = 'https://www.youtube.com/@kisanshaktiai';

const LIKES_KEY = 'reels.liked.v1';
const SAVES_KEY = 'reels.saved.v1';
const readSet = (k: string): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')); } catch { return new Set(); }
};
const writeSet = (k: string, s: Set<string>) => {
  try { localStorage.setItem(k, JSON.stringify([...s])); } catch {}
};

type OfficialReel = React.ComponentProps<typeof ReelPlayer>['reel'];

export default function ReelsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentLanguage } = useLanguageStore();

  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [doubleTapHearts, setDoubleTapHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [likedSet, setLikedSet] = useState<Set<string>>(() => readSet(LIKES_KEY));
  const [savedSet, setSavedSet] = useState<Set<string>>(() => readSet(SAVES_KEY));
  const [commentSheetReel, setCommentSheetReel] = useState<OfficialReel | null>(null);
  const lastTapRef = useRef<{ t: number; reelId: string | null }>({ t: 0, reelId: null });
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: officialVideos = [], isLoading: isOfficialLoading, refetch: refetchOfficial } = useYouTubeChannelReels(24);
  const { track } = useYouTubeReelEngagement();

  const reels: OfficialReel[] = useMemo(
    () => officialVideos.map((video) => ({
      id: video.id,
      tenant_id: null,
      visibility_scope: 'global' as const,
      title: video.title,
      description: video.description,
      category_id: null,
      language_code: currentLanguage || 'mr',
      tags: ['kisanshaktiai', 'youtube', 'shorts'],
      source: 'youtube' as const,
      video_url: video.video_url,
      hls_url: null,
      thumbnail_url: video.thumbnail_url,
      preview_webp_url: null,
      duration_seconds: null,
      is_featured: false,
      total_views: video.total_views,
      total_likes: 0,
      total_comments: 0,
      total_shares: 0,
      total_saves: 0,
      trending_score: 0,
      published_at: video.published_at,
      created_at: video.published_at,
    })),
    [officialVideos, currentLanguage]
  );

  // Snap-scroll active index detection
  const onScroll = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const idx = Math.round(c.scrollTop / c.clientHeight);
    if (idx !== activeIndex && idx >= 0 && idx < reels.length) {
      setActiveIndex(idx);
      setIsPaused(false);
    }
  }, [activeIndex, reels.length]);

  // Refetch when language changes
  useEffect(() => {
    refetchOfficial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLanguage]);

  // Lock body scroll for full-screen immersive view
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Record a 'view' each time a new reel becomes active
  useEffect(() => {
    const reel = reels[activeIndex];
    if (reel?.id) track(reel.id, 'view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, reels.length]);

  // In-app like — toggle local state, persist, and audit. Double-tap also calls this.
  const toggleLike = useCallback((reel: OfficialReel, source: 'tap' | 'double_tap' = 'tap') => {
    setLikedSet((prev) => {
      const next = new Set(prev);
      const wasLiked = next.has(reel.id);
      if (wasLiked) next.delete(reel.id); else next.add(reel.id);
      writeSet(LIKES_KEY, next);
      track(reel.id, wasLiked ? 'unlike' : 'like', { metadata: { source, in_app: true } });
      if (!wasLiked && source === 'tap') {
        toast({ description: t('reels.liked', 'Liked') });
      }
      return next;
    });
  }, [track, toast, t]);

  const toggleSave = useCallback((reel: OfficialReel) => {
    setSavedSet((prev) => {
      const next = new Set(prev);
      const wasSaved = next.has(reel.id);
      if (wasSaved) next.delete(reel.id); else next.add(reel.id);
      writeSet(SAVES_KEY, next);
      track(reel.id, wasSaved ? 'unsave' : 'save', { metadata: { in_app: true } });
      toast({ description: wasSaved ? t('reels.unsaved', 'Removed from saved') : t('reels.saved', 'Saved') });
      return next;
    });
  }, [track, toast, t]);

  // Open comments sheet — never auto-redirects. User can then choose to view on YouTube.
  const openCommentSheet = useCallback((reel: OfficialReel) => {
    setCommentSheetReel(reel);
    track(reel.id, 'comment', { metadata: { in_app: true, action: 'sheet_open' } });
  }, [track]);

  // Open URL at top-level so it escapes any embedding iframe (Lovable preview, PWA, in-app webview).
  // Falls back to assigning window.top.location if popups are blocked.
  const openExternal = useCallback((url: string) => {
    try {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) return;
    } catch {/* popup blocked */}
    try {
      if (window.top && window.top !== window.self) {
        (window.top as Window).location.href = url;
        return;
      }
    } catch {/* cross-origin top */}
    window.location.href = url;
  }, []);

  const viewCommentsOnYouTube = useCallback((reel: OfficialReel) => {
    // Shorts canonical URL — deep-links into the YouTube app on mobile and renders correctly on web.
    const url = `https://www.youtube.com/shorts/${reel.id}`;
    track(reel.id, 'open_youtube', { metadata: { intent: 'comment', user_initiated: true } });
    openExternal(url);
  }, [track, openExternal]);

  // Safe back: handles deep-link / PWA cold starts where history is empty.
  const handleBack = useCallback(() => {
    // Restore body scroll before leaving
    document.body.style.overflow = '';
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/app/home', { replace: true });
    }
  }, [navigate]);

  // Open the *currently active* reel on the KisanShakti AI YouTube channel.
  const openCurrentOnYouTube = useCallback(() => {
    const reel = reels[activeIndex];
    if (!reel?.id) {
      openExternal(YT_CHANNEL_URL);
      return;
    }
    // Use /shorts/ path — this is the actual reel URL on YouTube and avoids the
    // watch?v= page which can be blocked when opened from an embedded iframe.
    const url = `https://www.youtube.com/shorts/${reel.id}`;
    track(reel.id, 'open_youtube', { metadata: { source: 'header_cta', user_initiated: true } });
    openExternal(url);
  }, [reels, activeIndex, track, openExternal]);

  const triggerDoubleTapHeart = (e: React.MouseEvent | React.TouchEvent) => {
    const point = 'touches' in e ? e.changedTouches[0] : e;
    const id = Date.now();
    const x = (point as Touch).clientX;
    const y = (point as Touch).clientY;
    setDoubleTapHearts((h) => [...h, { id, x, y }]);
    setTimeout(() => setDoubleTapHearts((h) => h.filter((p) => p.id !== id)), 800);
  };

  const handleTap = (reel: OfficialReel) => (e: React.MouseEvent) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last.reelId === reel.id && now - last.t < 280) {
      triggerDoubleTapHeart(e);
      if (!likedSet.has(reel.id)) toggleLike(reel, 'double_tap');
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

  const share = async (reel: OfficialReel) => {
    const shareUrl = reel.video_url;
    const text = `${reel.title} — ${shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: reel.title, text: reel.description ?? '', url: shareUrl });
      } catch {
        return; // user dismissed
      }
    } else {
      // WhatsApp deep link as primary fallback for farmers
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
    track(reel.id, 'share', { metadata: { channel: navigator.share ? 'native' : 'whatsapp' } });
    toast({ description: t('reels.shared', 'Shared') });
  };

  return (
    <div className="fixed inset-0 z-40 bg-black overflow-hidden">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center gap-2 px-3 pt-[env(safe-area-inset-top,12px)] pb-2 bg-gradient-to-b from-black/70 to-transparent">
        <button
          type="button"
          onClick={handleBack}
          onTouchEnd={(e) => { e.stopPropagation(); }}
          aria-label={t('common.back', 'Back')}
          className="w-11 h-11 rounded-full bg-black/60 active:bg-black/80 flex items-center justify-center text-white shadow-lg shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 pl-1">
            <CategoryPill
              active
              label={t('reels.category.all', 'All')}
              onClick={() => {
                setActiveIndex(0);
                containerRef.current?.scrollTo({ top: 0 });
              }}
            />
            <CategoryPill
              active={false}
              label={t('reels.official_channel', 'KisanShakti AI')}
              onClick={() => containerRef.current?.scrollTo({ top: 0 })}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={openCurrentOnYouTube}
          onTouchEnd={(e) => { e.stopPropagation(); }}
          aria-label={t('reels.open_on_youtube', 'Open on YouTube')}
          className="h-11 px-3 rounded-full bg-[#FF0000] active:bg-[#cc0000] flex items-center gap-1.5 text-white text-sm font-semibold shadow-lg shrink-0"
        >
          <Youtube className="w-5 h-5" />
          <span className="hidden xs:inline sm:inline">YouTube</span>
        </button>
      </div>

      {/* Loading */}
      {isOfficialLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!isOfficialLoading && reels.length === 0 && (
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
                  <div className="pt-2 pointer-events-auto">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openCurrentOnYouTube(); }}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#FF0000]/95 active:bg-[#cc0000] text-white text-xs font-semibold shadow-md"
                    >
                      <Youtube className="w-4 h-4" />
                      {t('reels.watch_on_channel', 'Watch on YouTube')}
                    </button>
                  </div>
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
                  reel={{ ...reel, total_likes: reel.total_likes + (likedSet.has(reel.id) ? 1 : 0), total_saves: reel.total_saves + (savedSet.has(reel.id) ? 1 : 0) }}
                  liked={likedSet.has(reel.id)}
                  saved={savedSet.has(reel.id)}
                  isMuted={isMuted}
                  onLike={() => toggleLike(reel, 'tap')}
                  onSave={() => toggleSave(reel)}
                  onComment={() => openCommentSheet(reel)}
                  onShare={() => share(reel)}
                  onReport={() => openCommentSheet(reel)}
                  onToggleMute={() => setIsMuted((m) => !m)}
                />
              )}
            </section>
          );
        })}

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

      {/* In-app comments sheet — comments live on YouTube; user explicitly chooses to view them there */}
      <Sheet open={!!commentSheetReel} onOpenChange={(open) => !open && setCommentSheetReel(null)}>
        <SheetContent side="bottom" className="bg-background border-t rounded-t-2xl max-h-[70vh] p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b">
            <SheetTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="w-5 h-5 text-primary" />
              {t('reels.comments.title', 'Comments')}
            </SheetTitle>
            <SheetDescription className="text-xs text-left">
              {t('reels.comments.subtitle', 'Comments for official KisanShakti AI videos live on YouTube.')}
            </SheetDescription>
          </SheetHeader>

          <div className="px-5 py-6 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageCircle className="w-7 h-7 text-primary" />
            </div>
            <p className="text-sm text-foreground font-medium leading-snug max-w-xs">
              {commentSheetReel?.title}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {t(
                'reels.comments.body',
                'Join the conversation on the official KisanShakti AI YouTube channel. Your comment helps other farmers too.',
              )}
            </p>
            <Button
              className="w-full mt-2 gap-2"
              onClick={() => commentSheetReel && viewCommentsOnYouTube(commentSheetReel)}
            >
              <ExternalLink className="w-4 h-4" />
              {t('reels.comments.open_youtube', 'View comments on YouTube')}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setCommentSheetReel(null)}
            >
              {t('common.close', 'Close')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

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
