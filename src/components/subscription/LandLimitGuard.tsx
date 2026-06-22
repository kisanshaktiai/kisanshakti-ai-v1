import { ReactNode, cloneElement, isValidElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useEntitlements } from '@/hooks/useEntitlements';
import { toast } from '@/hooks/use-toast';

interface LandLimitGuardProps {
  /** A clickable trigger (Button, IconButton, Link). Will be disabled and show a toast on tap when over the limit. */
  children: ReactNode;
  /** Optional callback fired when user taps a disabled trigger */
  onBlocked?: () => void;
}

/**
 * Wraps a single clickable child. When the farmer is at or over their land quota,
 * the child becomes visually disabled and tapping it shows a toast.
 * Otherwise the child renders unchanged so its own onClick fires normally.
 */
export function LandLimitGuard({ children, onBlocked }: LandLimitGuardProps) {
  const { t } = useTranslation('common');
  const { lands, farmer, isReady } = useEntitlements();

  // While loading, allow optimistically
  if (!isReady || lands.allowed) return <>{children}</>;

  if (!isValidElement(children)) return <>{children}</>;

  const handleBlocked = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toast({
      title: t('lands.quota_title', { defaultValue: 'Land limit reached' }),
      description: t('lands.quota_body', {
        defaultValue:
          "You've used {{used}}/{{limit}} lands on the {{plan}} plan. Upgrade to add more.",
        used: lands.used,
        limit: lands.limit ?? 0,
        plan: farmer?.plan_name ?? 'current',
      }),
      variant: 'destructive',
    });
    onBlocked?.();
  };

  return cloneElement(children as any, {
    onClick: handleBlocked,
    'aria-disabled': true,
    disabled: true,
    className: `${(children as any).props.className ?? ''} opacity-50 cursor-not-allowed`,
  });
}
