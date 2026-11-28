import { Heart, MessageCircle, Bookmark, Share2, MoreVertical, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Reel } from '@/hooks/useReelsFeed';

interface ReelActionRailProps {
  reel: Reel;
  liked: boolean;
  saved: boolean;
  isMuted: boolean;
  onLike: () => void;
  onSave: () => void;
  onComment: () => void;
  onShare: () => void;
  onReport: () => void;
  onToggleMute: () => void;
}

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 10_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 10_000_000).toFixed(1)}Cr`;
}

const RailButton = ({
  onClick,
  active,
  count,
  ariaLabel,
  children,
  activeClass = 'text-destructive',
}: {
  onClick: () => void;
  active?: boolean;
  count?: number;
  ariaLabel: string;
  children: React.ReactNode;
  activeClass?: string;
}) => (
  <motion.button
    whileTap={{ scale: 0.85 }}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    aria-label={ariaLabel}
    className="flex flex-col items-center gap-0.5 select-none"
  >
    <div
      className={cn(
        // sized from the screen height so all six fit on a short phone; 56px on a tall one
        'w-[clamp(44px,7.6dvh,56px)] h-[clamp(44px,7.6dvh,56px)] rounded-full bg-black/55 flex items-center justify-center transition-colors',
        'shadow-[0_2px_12px_rgba(0,0,0,0.4)]',
        active && activeClass
      )}
    >
      {children}
    </div>
    {typeof count === 'number' && (
      <span className="text-white lf-fs-cap font-semibold drop-shadow-md tabular-nums">
        {fmt(count)}
      </span>
    )}
  </motion.button>
);

export function ReelActionRail({
  reel,
  liked,
  saved,
  isMuted,
  onLike,
  onSave,
  onComment,
  onShare,
  onReport,
  onToggleMute,
}: ReelActionRailProps) {
  return (
    <div
      className="absolute right-2 z-20 flex flex-col gap-[clamp(4px,1.4dvh,16px)]"
      // clear of the dock on every phone, and never lower than before
      style={{ bottom: 'max(7rem, calc(var(--lf-dock-h) + var(--safe-bottom) + 1rem))' }}
    >
      <RailButton onClick={onLike} active={liked} count={reel.total_likes} ariaLabel="Like">
        <Heart
          className={cn('w-7 h-7 text-white', liked && 'fill-destructive text-destructive')}
        />
      </RailButton>

      <RailButton onClick={onComment} count={reel.total_comments} ariaLabel="Comment">
        <MessageCircle className="w-7 h-7 text-white" />
      </RailButton>

      <RailButton onClick={onSave} active={saved} count={reel.total_saves} activeClass="text-warning" ariaLabel="Save">
        <Bookmark className={cn('w-7 h-7 text-white', saved && 'fill-warning text-warning')} />
      </RailButton>

      <RailButton onClick={onShare} count={reel.total_shares} ariaLabel="Share">
        <Share2 className="w-7 h-7 text-white" />
      </RailButton>

      <RailButton onClick={onToggleMute} ariaLabel={isMuted ? 'Unmute' : 'Mute'}>
        {isMuted ? <VolumeX className="w-6 h-6 text-white" /> : <Volume2 className="w-6 h-6 text-white" />}
      </RailButton>

      <RailButton onClick={onReport} ariaLabel="More">
        <MoreVertical className="w-6 h-6 text-white" />
      </RailButton>
    </div>
  );
}
