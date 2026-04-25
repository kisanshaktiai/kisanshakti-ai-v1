import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageShellProps {
  children: ReactNode;
  /** Optional sticky sub-header (search, filters, tabs). Renders flush under the global header. */
  stickyHeader?: ReactNode;
  /** Background variant — defaults to subtle gradient. */
  variant?: 'default' | 'gradient-primary' | 'gradient-soft' | 'plain';
  /** Outer padding control. Defaults to standard `px-4 py-4`. Pass `none` for full-bleed pages. */
  padding?: 'default' | 'none' | 'tight';
  /** Vertical spacing between children. */
  spacing?: 'default' | 'tight' | 'none';
  className?: string;
  /** Override safe-area bottom padding (default: pb-nav-safe — clears bottom nav). */
  noBottomPadding?: boolean;
}

const variantClasses: Record<NonNullable<PageShellProps['variant']>, string> = {
  default: 'bg-background',
  'gradient-primary': 'bg-gradient-to-br from-primary/5 via-background to-accent/5',
  'gradient-soft': 'bg-gradient-to-b from-background via-background to-muted/20',
  plain: '',
};

const paddingClasses: Record<NonNullable<PageShellProps['padding']>, string> = {
  default: 'px-4 py-4',
  tight: 'px-3 py-3',
  none: '',
};

const spacingClasses: Record<NonNullable<PageShellProps['spacing']>, string> = {
  default: 'space-y-4',
  tight: 'space-y-2',
  none: '',
};

/**
 * Standard page wrapper. Ensures every page:
 * - inherits the single app scroll container (no nested scrollers)
 * - clears the bottom navigation (pb-nav-safe)
 * - uses consistent gradients, padding, and spacing
 * - supports an optional sticky sub-header anchored to the top of <main>
 *
 * Layout contract: AppLayout's <main> is the ONLY scroll container.
 * Pages render natural-height content inside PageShell.
 */
export function PageShell({
  children,
  stickyHeader,
  variant = 'default',
  padding = 'default',
  spacing = 'default',
  className,
  noBottomPadding = false,
}: PageShellProps) {
  return (
    <div
      className={cn(
        'min-h-full w-full',
        variantClasses[variant],
        !noBottomPadding && 'pb-nav-safe',
        className,
      )}
    >
      {stickyHeader && (
        <div className="sticky top-0 z-20 bg-background/85 backdrop-blur-md border-b border-border/40">
          {stickyHeader}
        </div>
      )}
      <div className={cn(paddingClasses[padding], spacingClasses[spacing])}>
        {children}
      </div>
    </div>
  );
}
