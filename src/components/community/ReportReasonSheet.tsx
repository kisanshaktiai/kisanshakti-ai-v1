import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { AlertTriangle, MessageSquareWarning, Ban, MoreHorizontal } from 'lucide-react';

export type ReportReason = 'spam' | 'misinformation' | 'abuse' | 'other';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason) => void;
}

export const ReportReasonSheet: React.FC<Props> = ({ open, onClose, onSubmit }) => {
  const { t } = useTranslation();

  const reasons: { key: ReportReason; icon: React.ElementType; label: string }[] = [
    { key: 'spam', icon: Ban, label: t('social.report.spam') || 'Spam or scam' },
    { key: 'misinformation', icon: AlertTriangle, label: t('social.report.misinformation') || 'Wrong farming advice' },
    { key: 'abuse', icon: MessageSquareWarning, label: t('social.report.abuse') || 'Abusive or unsafe' },
    { key: 'other', icon: MoreHorizontal, label: t('social.report.other') || 'Something else' },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl bg-background border-t border-border">
        <SheetHeader>
          <SheetTitle>{t('social.report.title') || 'Why are you reporting this post?'}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 pb-6">
          {reasons.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => {
                onSubmit(key);
                onClose();
              }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card hover:bg-muted border border-border text-left transition-colors"
            >
              <Icon className="w-5 h-5 text-destructive" />
              <span className="font-medium text-foreground">{label}</span>
            </button>
          ))}
          <Button variant="ghost" onClick={onClose} className="w-full mt-2">
            {t('common.cancel') || 'Cancel'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
