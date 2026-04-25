import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  emoji?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: ReactNode;
  className?: string;
}

/**
 * Universal empty-state pattern. Use across Schemes, VideoReels, Analytics,
 * Saved posts, search results, etc. for consistent UX.
 */
export function EmptyState({
  icon: Icon,
  emoji,
  title,
  description,
  actionLabel,
  onAction,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-16 animate-fade-in',
        className,
      )}
    >
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/10 to-accent/10 ring-1 ring-border/40 shadow-sm">
        {Icon ? (
          <Icon className="h-9 w-9 text-primary" strokeWidth={1.5} />
        ) : (
          <span className="text-4xl" aria-hidden>{emoji ?? '🌱'}</span>
        )}
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-xs mb-6 leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="rounded-full px-6 shadow-md">
          {actionLabel}
        </Button>
      )}
      {secondaryAction && <div className="mt-3">{secondaryAction}</div>}
    </div>
  );
}
