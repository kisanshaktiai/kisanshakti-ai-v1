import type { ElementType, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Building blocks of the Profile and settings screens: the icon tile, the
 * section card and the tappable settings row. Colours come only from the
 * tenant theme tokens, so every white-label tenant inherits them.
 */
export type IconTone = 'primary' | 'success' | 'warning' | 'info' | 'destructive' | 'muted';

const toneClasses: Record<IconTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  // Foreground text on a warning tint stays readable in light and dark themes.
  warning: 'bg-warning/20 text-foreground',
  info: 'bg-info/10 text-info',
  destructive: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

interface IconTileProps {
  icon: ElementType;
  tone?: IconTone;
  size?: 'sm' | 'md';
  className?: string;
}

export function IconTile({ icon: Icon, tone = 'primary', size = 'md', className }: IconTileProps) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        size === 'md' ? 'h-11 w-11 rounded-2xl' : 'h-9 w-9 rounded-xl',
        toneClasses[tone],
        className,
      )}
    >
      <Icon className={size === 'md' ? 'h-5 w-5' : 'h-[18px] w-[18px]'} aria-hidden="true" />
    </span>
  );
}

/** Surface shared by every card on the Profile and settings screens. */
export const sectionCardClass = 'rounded-2xl border border-border bg-card text-card-foreground shadow-soft';

interface SectionCardProps {
  title?: string;
  icon?: ElementType;
  /** Optional control shown at the right of the title. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SectionCard({ title, icon: Icon, action, children, className, contentClassName }: SectionCardProps) {
  return (
    <section className={cn(sectionCardClass, className)}>
      {title && (
        <div className="flex items-center gap-2 px-4 pt-4">
          {Icon && <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
          <h2 className="min-w-0 flex-1 text-base font-bold leading-snug text-foreground">{title}</h2>
          {action}
        </div>
      )}
      <div className={cn('p-4', title && 'pt-3', contentClassName)}>{children}</div>
    </section>
  );
}

/** A card that stacks SettingsRow items with a hairline between them. */
export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(sectionCardClass, 'divide-y divide-border overflow-hidden', className)}>{children}</div>;
}

interface SettingsRowProps {
  icon: ElementType;
  tone?: IconTone;
  title: string;
  description?: ReactNode;
  /** Opens something: the row becomes one large button with a chevron. */
  onClick?: () => void;
  /** Replaces the chevron (a switch, a badge, a button). */
  trailing?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function SettingsRow({ icon, tone = 'primary', title, description, onClick, trailing, disabled, className }: SettingsRowProps) {
  const content = (
    <>
      <IconTile icon={icon} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-snug text-foreground">{title}</span>
        {description && <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{description}</span>}
      </span>
      {trailing ?? (onClick && <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />)}
    </>
  );
  const rowClass = cn('flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left', className);

  if (!onClick) return <div className={rowClass}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        rowClass,
        'transition-colors hover:bg-muted/50 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
      )}
    >
      {content}
    </button>
  );
}
