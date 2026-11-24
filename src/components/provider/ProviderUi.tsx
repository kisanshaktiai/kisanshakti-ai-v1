import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { PageShell } from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';

/**
 * Small building blocks shared by the Provider Workspace screens. They use
 * only the central theme tokens and keep every control at least 44 px tall.
 */

interface ProviderPageProps {
  title: string;
  /** Where the back arrow leads; no arrow when omitted (a tab root). */
  backTo?: string;
  /** Shows placeholders instead of the content (first load, nothing to show yet). */
  pending?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  isOnline: boolean;
  children: ReactNode;
}

export function ProviderPage({ title, backTo, pending, loadError, onRetry, isOnline, children }: ProviderPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <PageShell variant="gradient-soft">
      <div className="flex items-center gap-2">
        {backTo && (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label={t('provider.common.back')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <h1 className="text-2xl font-bold text-foreground break-words">{title}</h1>
      </div>

      {!isOnline && (
        <Alert>
          <AlertDescription className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('provider.common.offline')}
          </AlertDescription>
        </Alert>
      )}

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription className="space-y-3">
            <p>{loadError}</p>
            {onRetry && (
              <Button variant="outline" className="h-11" onClick={onRetry} disabled={!isOnline}>
                {t('provider.common.retry')}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {pending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : (
        children
      )}
    </PageShell>
  );
}

export function SaveError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Class of every text, number, date and time input in the workspace. */
export const INPUT_CLASS = 'h-14 text-lg rounded-2xl';

interface NativeSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Text of the empty first option; omitted when a choice is required and made. */
  placeholder?: string;
  disabled?: boolean;
}

/** The phone's own picker: light, familiar, and usable with large lists. */
export function NativeSelect({ id, value, onChange, options, placeholder, disabled }: NativeSelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full h-14 rounded-2xl border-2 border-input bg-background px-4 text-lg text-foreground disabled:opacity-60"
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

interface ChoiceChipsProps {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
  label: string;
}

/** Large tap targets for one or several choices out of a short list. */
export function ChoiceChips({ options, selected, onToggle, disabled, label }: ChoiceChipsProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isOn = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isOn}
            disabled={disabled}
            onClick={() => onToggle(option.value)}
            className={cn(
              'min-h-[44px] rounded-full border-2 px-4 py-2 text-base font-medium text-left disabled:opacity-60',
              isOn ? 'border-primary bg-primary/15 text-foreground' : 'border-border bg-card text-muted-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface SwitchRowProps {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SwitchRow({ id, label, hint, checked, onCheckedChange, disabled }: SwitchRowProps) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-3">
      <label htmlFor={id} className="flex-1 min-w-0">
        <span className="block text-base font-semibold text-foreground">{label}</span>
        {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="h-8 w-14 [&>span]:h-7 [&>span]:w-7 [&>span]:data-[state=checked]:translate-x-6" />
    </div>
  );
}
