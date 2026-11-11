import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { FileClock, Pencil, RefreshCw } from 'lucide-react';

export interface ScheduleReviewDraft {
  id: string; crop_name: string; land_id: string; blockers: string[];
  crop_inputs: Record<string, unknown>; created_at: string;
}

export function ScheduleReviewDrafts({drafts, onEdit, onRecheck, busy}: {
  drafts: ScheduleReviewDraft[]; onEdit: (draft: ScheduleReviewDraft) => void;
  onRecheck: (draft: ScheduleReviewDraft) => void; busy: boolean;
}) {
  const {t} = useTranslation();
  if (!drafts.length) return null;
  return <section className="space-y-3 p-4">
    <h2 className="flex items-center gap-2 text-base font-semibold"><FileClock className="h-5 w-5 text-primary" />{t('schedule.review.title')}</h2>
    <p className="text-sm text-muted-foreground">{t('schedule.review.inactive')}</p>
    {drafts.map(draft => <article key={draft.id} className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="font-semibold break-words">{draft.crop_name}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {draft.blockers.map(reason => <li key={reason}>{t(`schedule.review.reasons.${reason}`, {defaultValue:t('schedule.review.generic')})}</li>)}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="surface" disabled={busy} onClick={() => onEdit(draft)}><Pencil className="h-4 w-4" />{t('schedule.review.edit')}</Button>
        <Button variant="surface" disabled={busy} onClick={() => onRecheck(draft)}><RefreshCw className="h-4 w-4" />{t('schedule.review.recheck')}</Button>
      </div>
    </article>)}
  </section>;
}