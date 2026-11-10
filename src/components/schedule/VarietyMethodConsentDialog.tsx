import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { VarietyMethodSuitability } from '@/hooks/useVarietyMethodSuitability';

interface Props {
  open: boolean;
  varietyName: string;
  methodLabel: string;
  /** DB evidence rows (is_suitable=false). All agronomic text shown comes from these rows. */
  evidence: VarietyMethodSuitability[];
  recommendedLabels: string[];
  onAccept: () => void;
  onCancel: () => void;
}

export function VarietyMethodConsentDialog({ open, varietyName, methodLabel, evidence, recommendedLabels, onAccept, onCancel }: Props) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {t('schedule.method_consent.title', 'This method is not recommended for this variety')}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-foreground">
              <p className="font-semibold">{varietyName} • {methodLabel}</p>
              {evidence.map((row) => (
                <div key={row.id} className="rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-1">
                  {row.suitability_note && <p>{row.suitability_note}</p>}
                  {row.limiting_factor && row.limiting_factor !== 'none' && (
                    <p className="text-xs text-muted-foreground">
                      {t('schedule.method_consent.risk', 'Main risk')}: {row.limiting_factor}
                    </p>
                  )}
                  {row.source && (
                    <p className="text-xs text-muted-foreground">
                      {t('schedule.method_consent.source', 'Source')}: {row.source}
                    </p>
                  )}
                </div>
              ))}
              {recommendedLabels.length > 0 && (
                <p className="text-success">
                  {t('schedule.method_consent.recommended', 'Recommended for this variety')}: {recommendedLabels.join(', ')}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('schedule.method_consent.record_note', 'If you continue, your decision will be saved with this schedule.')}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogCancel className="w-full m-0 min-h-[48px] whitespace-normal">
            {t('schedule.method_consent.change', 'Change method')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onAccept} className="w-full m-0 min-h-[48px] whitespace-normal bg-warning text-warning-foreground hover:bg-warning/90">
            {t('schedule.method_consent.accept', 'I understand the risk, create the schedule')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
