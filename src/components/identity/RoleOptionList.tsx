import { useTranslation } from 'react-i18next';
import { Check, Sprout, Tractor, ShoppingBasket, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACCOUNT_ROLES, type AccountRole } from '@/lib/accountRoles';

export const ROLE_ICONS: Record<AccountRole, LucideIcon> = {
  FARMER: Sprout,
  SERVICE_PROVIDER: Tractor,
  CUSTOMER: ShoppingBasket,
};

/**
 * The round picture of a workspace. Used as the switcher's button and, for a
 * person with one role, as the plain mark of the workspace in its header.
 */
export function RolePicture({ role, className }: { role: AccountRole; className?: string }) {
  const Icon = ROLE_ICONS[role];
  return (
    <span className={cn('flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground', className)}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

interface RoleOptionListProps {
  selected: AccountRole[];
  onToggle: (role: AccountRole) => void;
  /** Roles shown but not changeable (already held). */
  locked?: AccountRole[];
  disabled?: boolean;
}

/**
 * The three ways of using the app as large tap targets. Several can be chosen.
 * Each option is a real checkbox for screen readers.
 */
export function RoleOptionList({ selected, onToggle, locked = [], disabled }: RoleOptionListProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {ACCOUNT_ROLES.map((role) => {
        const Icon = ROLE_ICONS[role];
        const isLocked = locked.includes(role);
        const isOn = isLocked || selected.includes(role);
        return (
          <button
            key={role}
            type="button"
            role="checkbox"
            aria-checked={isOn}
            disabled={disabled || isLocked}
            onClick={() => onToggle(role)}
            className={cn(
              'w-full min-h-[72px] flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors',
              isOn ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40',
              (disabled || isLocked) && 'opacity-80',
            )}
          >
            <span
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
                isOn ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-base font-semibold text-foreground">
                {t(`identity.roles.${role}.name`)}
              </span>
              <span className="block text-sm text-muted-foreground">
                {t(`identity.roles.${role}.description`)}
              </span>
            </span>
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2',
                isOn ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}
            >
              {isOn && <Check className="h-4 w-4" aria-hidden="true" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
