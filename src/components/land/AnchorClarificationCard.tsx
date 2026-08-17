/**
 * AnchorClarificationCard — one-time "we need one date from you" card shown when
 * `check_germination_gate` / `resolve_germination_anchor` reports
 * `needs_farmer_clarification` with reason `ambiguous_nursery_vs_transplant_dates`.
 *
 * Submitting writes lands.last_sowing_date and calls enforce_germination_gate.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarDays } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { AnchorClarification } from '@/hooks/useAnchorClarification';

interface Props {
  item: AnchorClarification;
  onSubmit: (landId: string, sowingDate: string) => Promise<void>;
}

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString();
}

export function AnchorClarificationCard({ item, onSubmit }: Props) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!date) return;
    setSaving(true);
    try {
      await onSubmit(item.land_id, date);
      toast({
        description: t('anchor.clarify.saved', {
          defaultValue: 'Thanks — we updated the sowing date.',
        }),
      });
    } catch (e) {
      console.error('[anchor] clarification submit failed', e);
      toast({
        variant: 'destructive',
        description: t('anchor.clarify.failed', {
          defaultValue: 'Could not save the date. Please try again.',
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-3 mb-3 border-warning/40 bg-warning/5">
      <div className="flex items-start gap-2">
        <CalendarDays className="w-4 h-4 text-warning mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          {item.land_name && (
            <div className="text-xs font-semibold text-foreground mb-0.5">{item.land_name}</div>
          )}
          <p className="text-xs text-muted-foreground">
            {t('anchor.clarify.body', {
              defaultValue:
                'We have your transplanting date as {{transplant}} but your sowing date as {{sowing}}. When did you sow the nursery?',
              transplant: fmt(item.transplant_date),
              sowing: fmt(item.sowing_date),
            })}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Input
              type="date"
              value={date}
              max={item.transplant_date?.slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-xs"
            />
            <Button size="sm" className="h-8 text-xs" disabled={!date || saving} onClick={handleSubmit}>
              {t('common.save', { defaultValue: 'Save' })}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
