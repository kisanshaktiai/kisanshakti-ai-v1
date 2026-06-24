import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';

interface VarietySubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cropId: string | null | undefined;
  cropName?: string;
  onSubmitted?: (proposedName: string) => void;
}

export const VarietySubmitDialog: React.FC<VarietySubmitDialogProps> = ({
  open,
  onOpenChange,
  cropId,
  cropName,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState('');
  const [localName, setLocalName] = useState('');
  const [season, setSeason] = useState('');
  const [minDays, setMinDays] = useState<string>('');
  const [maxDays, setMaxDays] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName(''); setLocalName(''); setSeason('');
    setMinDays(''); setMaxDays(''); setNotes('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: t('schedule.variety.submit.name_required', 'Please enter the variety name'), variant: 'destructive' });
      return;
    }
    if (!user?.id || !user?.tenantId) {
      toast({ title: t('common.error', 'Error'), description: t('schedule.variety.submit.auth_required', 'Sign in required'), variant: 'destructive' });
      return;
    }
    const minN = minDays ? parseInt(minDays, 10) : null;
    const maxN = maxDays ? parseInt(maxDays, 10) : null;
    if (minN != null && maxN != null && minN > maxN) {
      toast({ title: t('schedule.variety.submit.invalid_range', 'Min days cannot exceed max days'), variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('variety_submissions').insert({
      tenant_id: user.tenantId,
      submitted_by: user.id,
      crop_id: cropId ?? null,
      proposed_name: name.trim(),
      local_name: localName.trim() || null,
      season: season.trim() || null,
      maturity_days_min: minN,
      maturity_days_max: maxN,
      notes: notes.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      console.error('[VarietySubmit] insert error', error);
      toast({ title: t('common.error', 'Error'), description: error.message, variant: 'destructive' });
      return;
    }

    toast({
      title: t('schedule.variety.submit.submitted_title', 'Variety submitted'),
      description: t(
        'schedule.variety.submit.submitted_desc',
        'Your tenant team will review and add it to the catalogue. We\'ll use the name you entered for this schedule.'
      ),
    });
    onSubmitted?.(name.trim());
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('schedule.variety.submit.title', 'Add your variety')}
          </DialogTitle>
          <DialogDescription>
            {cropName
              ? t('schedule.variety.submit.desc_with_crop', { crop: cropName, defaultValue: `Tell us about the {{crop}} variety you sowed. Our team will verify and add it.` })
              : t('schedule.variety.submit.desc', "Tell us about the variety you sowed. Our team will verify and add it.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="vs-name" className="text-xs">
              {t('schedule.variety.submit.name', 'Variety name')} *
            </Label>
            <Input id="vs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Co-99004 / MTU-7029" className="h-10" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="vs-local" className="text-xs">
              {t('schedule.variety.submit.local_name', 'Local / vernacular name')}
            </Label>
            <Input id="vs-local" value={localName} onChange={(e) => setLocalName(e.target.value)} className="h-10" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="vs-season" className="text-xs">
                {t('schedule.variety.submit.season', 'Season')}
              </Label>
              <Input id="vs-season" value={season} onChange={(e) => setSeason(e.target.value)} placeholder="kharif" className="h-10" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vs-min" className="text-xs">
                {t('schedule.variety.submit.min_days', 'Min days')}
              </Label>
              <Input id="vs-min" type="number" min={1} max={500} value={minDays} onChange={(e) => setMinDays(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vs-max" className="text-xs">
                {t('schedule.variety.submit.max_days', 'Max days')}
              </Label>
              <Input id="vs-max" type="number" min={1} max={500} value={maxDays} onChange={(e) => setMaxDays(e.target.value)} className="h-10" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="vs-notes" className="text-xs">
              {t('schedule.variety.submit.notes', 'Notes (source, brand, source of seed…)')}
            </Label>
            <Textarea id="vs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
            {t('schedule.variety.submit.submit', 'Submit for review')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VarietySubmitDialog;
