import { Reel } from '@/hooks/useReelsFeed';
import { getYouTubeId, buildYouTubeEmbed, youTubeThumb, isYouTubeUrl } from '@/lib/youtube';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface ReelPlayerProps {
  reel: Reel;
  isActive: boolean;
  isMuted: boolean;
  isPaused: boolean;
  onProgress?: (currentSeconds: number, durationSeconds: number) => void;
  onEnded?: () => void;
  onTap?: () => void;
}

/**
 * Reel media player.
 * - YouTube videos: embedded iframe (autoplay+mute when active, paused when not).
 * - Direct videos: native <video>.
 * - Visibility-aware: only the active reel plays.
 */
export function ReelPlayer({ reel, isActive, isMuted, isPaused, onProgress, onEnded, onTap }: ReelPlayerProps) {
  const isYT = isYouTubeUrl(reel.video_url);
  const ytId = isYT ? getYouTubeId(reel.video_url) : null;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loading, setLoading] = useState(true);
  const thumb = reel.thumbnail_url || (ytId ? youTubeThumb(ytId, 'hq') : undefined);

  // Native video lifecycle
  useEffect(() => {
    if (isYT) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = isMuted;
    if (isActive && !isPaused) v.play().catch(() => {});
    else v.pause();
    if (!isActive) v.currentTime = 0;
  }, [isActive, isPaused, isMuted, isYT]);

  // YouTube iframe: rebuild only when the active state flips (cheap; avoids JS API)
  const ytSrc = ytId
    ? buildYouTubeEmbed(ytId, {
        autoplay: isActive && !isPaused,
        mute: isMuted,
        loop: true,
      })
    : null;

  return (
    <div className="absolute inset-0 bg-black" onClick={onTap}>
      {/* Poster while loading */}
      {thumb && (
        <img
          src={thumb}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60"
        />
      )}

      {isYT && ytSrc ? (
        <iframe
          key={`${reel.id}-${isActive}-${isPaused}-${isMuted}`}
          src={ytSrc}
          title={reel.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
          onLoad={() => setLoading(false)}
          style={{ border: 0 }}
        />
      ) : (
        <video
          ref={videoRef}
          src={reel.video_url}
          poster={thumb}
          className="absolute inset-0 w-full h-full object-contain"
          loop
          playsInline
          preload={isActive ? 'auto' : 'metadata'}
          onLoadedData={() => setLoading(false)}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            onProgress?.(el.currentTime, el.duration || 0);
          }}
          onEnded={onEnded}
        />
      )}

      {loading && isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-8 h-8 text-white/80 animate-spin" />
        </div>
      )}
    </div>
  );
}
