import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Loader2, Minus, Plus, WifiOff, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { PageShell } from '@/components/layout/PageShell';
import { hapticFeedback } from '@/lib/haptics';
import { cn } from '@/lib/utils';

/**
 * Building blocks shared by the Provider and Customer workspace screens.
 *
 * Made for people who read little: one question per screen, big picture tiles
 * instead of dropdowns, numbers set with plus and minus, status told by colour,
 * icon and large words together, and one main button fixed at the bottom.
 * Every control is at least 44 px tall, and every colour is a theme token, so
 * a white-label tenant's theme carries through.
 */

interface ProviderPageProps {
  title: string;
  /** Small line above the title (the role, the kind of work, …). */
  eyebrow?: string;
  /** Where the back arrow leads; no arrow when omitted (a tab root). */
  backTo?: string;
  /** Progress through a short flow, shown as bars under the header. */
  step?: { current: number; total: number };
  /** Main action, fixed above the bottom navigation while the page scrolls. */
  footer?: ReactNode;
  /** Shows placeholders instead of the content (first load, nothing to show yet). */
  pending?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  isOnline: boolean;
  children: ReactNode;
}

export function ProviderPage({
  title, eyebrow, backTo, step, footer, pending, loadError, onRetry, isOnline, children,
}: ProviderPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <PageShell variant="gradient-soft" spacing="none" className="flex flex-col">
      <div className="space-y-4 flex-1">
        <div className="flex items-center gap-3">
          {backTo && (
            <button
              type="button"
              onClick={() => navigate(backTo)}
              aria-label={t('provider.common.back')}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-sm active:scale-95"
            >
              <ArrowLeft className="h-6 w-6" aria-hidden="true" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            {eyebrow && <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>}
            <h1 className="text-2xl font-bold leading-tight text-foreground break-words">{title}</h1>
          </div>
          {step && (
            <span className="shrink-0 text-sm font-semibold text-muted-foreground" aria-label={t('provider.common.stepOf', step)}>
              {t('provider.common.stepOf', step)}
            </span>
          )}
        </div>

        {step && (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${step.total}, minmax(0, 1fr))` }} aria-hidden="true">
            {Array.from({ length: step.total }, (_, i) => (
              <span key={i} className={cn('h-2 rounded-full', i < step.current ? 'bg-primary' : 'bg-muted')} />
            ))}
          </div>
        )}

        {!isOnline && (
          <Alert>
            <AlertDescription className="flex items-center gap-2 text-base">
              <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
              {t('provider.common.offline')}
            </AlertDescription>
          </Alert>
        )}

        {loadError && (
          <Alert variant="destructive">
            <AlertDescription className="space-y-3 text-base">
              <p>{loadError}</p>
              {onRetry && (
                <Button variant="outline" className="h-12" onClick={onRetry} disabled={!isOnline}>
                  {t('provider.common.retry')}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {pending ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-32 w-full rounded-3xl" />
            <Skeleton className="h-24 w-full rounded-3xl" />
            <Skeleton className="h-24 w-full rounded-3xl" />
          </div>
        ) : (
          children
        )}
      </div>

      {footer && !pending && (
        <div
          className="sticky -mx-4 mt-4 px-4 pt-3 pb-3 bg-background/90 backdrop-blur-md border-t border-border/40"
          style={{ bottom: 'calc(5rem + var(--safe-bottom))' }}
        >
          {footer}
        </div>
      )}
    </PageShell>
  );
}

/** The one big button a screen ends with. */
export function PrimaryAction({
  children, onClick, disabled, busy, type = 'button', icon: Icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  type?: 'button' | 'submit';
  icon?: LucideIcon;
}) {
  return (
    <Button type={type} onClick={onClick} disabled={disabled || busy} className="w-full h-14 rounded-2xl text-lg font-semibold shadow-md">
      {busy ? <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" /> : Icon ? <Icon className="w-5 h-5 mr-2" aria-hidden="true" /> : null}
      {children}
    </Button>
  );
}

export function SaveError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription className="text-base">{message}</AlertDescription>
    </Alert>
  );
}

/** A question the screen asks, in large type. */
export function Question({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-bold leading-snug text-foreground">{children}</h2>
      {hint && <p className="text-base text-muted-foreground">{hint}</p>}
    </div>
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
      <label htmlFor={htmlFor} className="block text-base font-semibold text-foreground">{label}</label>
      {children}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Class of every text, number, date and time input in the workspace. */
export const INPUT_CLASS = 'h-14 text-lg rounded-2xl border-2';

interface NativeSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Text of the empty first option; omitted when a choice is required and made. */
  placeholder?: string;
  disabled?: boolean;
}

/** The phone's own picker, kept for long lists (crops) where tiles would not fit. */
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

export interface TileOption {
  value: string;
  label: string;
  /** A second, smaller line (a count, a rate, …). */
  detail?: string;
  icon?: LucideIcon;
}

interface TileGridProps {
  label: string;
  options: TileOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** 2 (default) or 3 tiles per row. */
  columns?: 2 | 3;
  disabled?: boolean;
}

/**
 * Big picture tiles, one per choice. One or several can be on; the parent
 * decides which. Icon on top, the word under it, a tick when chosen.
 */
export function TileGrid({ label, options, selected, onToggle, columns = 2, disabled }: TileGridProps) {
  return (
    <div role="group" aria-label={label} className={cn('grid gap-3', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {options.map(({ value, label: text, detail, icon: Icon }) => {
        const isOn = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isOn}
            disabled={disabled}
            onClick={() => { hapticFeedback('light'); onToggle(value); }}
            className={cn(
              'relative flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-3xl border-[3px] px-2 py-3 text-center transition-colors active:scale-[0.98] disabled:opacity-60',
              isOn ? 'border-primary bg-primary/10 text-foreground' : 'border-transparent bg-card text-foreground shadow-sm',
            )}
          >
            {isOn && (
              <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
            {Icon && (
              <span className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', isOn ? 'bg-primary text-primary-foreground' : 'bg-muted text-primary')}>
                <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
              </span>
            )}
            <span className={cn('text-base leading-tight break-words', isOn ? 'font-bold' : 'font-semibold')}>{text}</span>
            {detail && <span className="text-sm text-muted-foreground leading-tight">{detail}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface ChoiceChipsProps {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
  label: string;
}

/** Large pills for one or several choices out of a short list of words. */
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
              'min-h-[48px] rounded-full px-5 py-2 text-base text-left transition-colors disabled:opacity-60',
              isOn ? 'bg-primary text-primary-foreground font-bold' : 'bg-card text-foreground font-medium shadow-sm',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface BigNumberProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** How much one tap of plus or minus changes the number. */
  step?: number;
  min?: number;
  /** Shown under the number (the unit, a hint). */
  caption?: string;
  disabled?: boolean;
}

/**
 * A number set with big minus and plus buttons; the number itself can still
 * be typed. Empty stays empty until a button is tapped.
 */
export function BigNumber({ id, label, value, onChange, step = 1, min = 0, caption, disabled }: BigNumberProps) {
  const { t } = useTranslation();
  const current = value.trim() === '' ? null : Number(value);
  const nudge = (direction: 1 | -1) => {
    hapticFeedback('light');
    const base = current == null || Number.isNaN(current) ? min : current;
    const next = Math.max(min, Math.round((base + direction * step) * 100) / 100);
    onChange(String(next));
  };
  return (
    <div className="rounded-3xl bg-card p-4 shadow-sm">
      <label htmlFor={id} className="block text-center text-sm font-semibold text-muted-foreground">{label}</label>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => nudge(-1)}
          disabled={disabled || (current != null && current <= min)}
          aria-label={t('provider.common.less')}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-foreground active:scale-95 disabled:opacity-40"
        >
          <Minus className="h-6 w-6" aria-hidden="true" />
        </button>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent text-center text-4xl font-bold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => nudge(1)}
          disabled={disabled}
          aria-label={t('provider.common.more')}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground active:scale-95 disabled:opacity-40"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      {caption && <p className="mt-2 text-center text-base font-medium text-foreground">{caption}</p>}
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

export type Tone = 'good' | 'busy' | 'off' | 'neutral';

const TONE_BADGE: Record<Tone, string> = {
  good: 'bg-success-soft text-foreground',
  busy: 'bg-warning-soft text-warning-foreground',
  off: 'bg-muted text-muted-foreground',
  neutral: 'bg-primary/10 text-foreground',
};
const TONE_DOT: Record<Tone, string> = {
  good: 'bg-success',
  busy: 'bg-warning',
  off: 'bg-muted-foreground',
  neutral: 'bg-primary',
};

/** A pill that says a state with a colour dot and words. */
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex min-h-[36px] items-center gap-2 rounded-full px-3 text-sm font-bold', TONE_BADGE[tone])}>
      <span className={cn('h-2.5 w-2.5 rounded-full', TONE_DOT[tone])} aria-hidden="true" />
      {children}
    </span>
  );
}

/** A row that opens another screen: icon, title, one line of summary, chevron. */
export function NavRow({
  icon: Icon, title, summary, onClick, disabled, badge,
}: {
  icon: LucideIcon;
  title: string;
  summary?: string;
  onClick: () => void;
  disabled?: boolean;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full min-h-[80px] items-center gap-4 rounded-3xl bg-card p-4 text-left shadow-sm active:scale-[0.99] disabled:opacity-60"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-lg font-bold text-foreground leading-tight">{title}</span>
        {summary && <span className="block text-sm text-muted-foreground break-words mt-0.5">{summary}</span>}
      </span>
      {badge}
    </button>
  );
}

/** A card, rounded like everything else on these screens. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-3xl bg-card p-4 shadow-sm', className)}>{children}</div>;
}
