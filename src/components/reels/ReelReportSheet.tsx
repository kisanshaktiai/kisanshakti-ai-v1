import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useReportReel } from '@/hooks/useReelsFeed';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { Flag, AlertTriangle, ShieldAlert, Copyright, AlertOctagon, MoreHorizontal } from 'lucide-react';

interface ReelReportSheetProps {
  reelId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REASONS = [
  { key: 'spam', icon: Flag, label: 'reels.report.spam' },
  { key: 'misinformation', icon: AlertTriangle, label: 'reels.report.misinformation' },
  { key: 'abuse', icon: ShieldAlert, label: 'reels.report.abuse' },
  { key: 'unsafe', icon: AlertOctagon, label: 'reels.report.unsafe' },
  { key: 'copyright', icon: Copyright, label: 'reels.report.copyright' },
  { key: 'other', icon: MoreHorizontal, label: 'reels.report.other' },
];

export function ReelReportSheet({ reelId, open, onOpenChange }: ReelReportSheetProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const report = useReportReel();

  const submit = async (reason: string) => {
    if (!reelId) return;
    try {
      await report.mutateAsync({ reelId, reason });
      toast({ description: t('reels.report.thanks', 'Reported. Thank you.') });
    } catch {
      toast({ description: t('reels.report.failed', 'Could not submit report.'), variant: 'destructive' });
    } finally {
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl bg-background">
        <SheetHeader>
          <SheetTitle>{t('reels.report.title', 'Why are you reporting this?')}</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-1 gap-2 mt-4">
          {REASONS.map(({ key, icon: Icon, label }) => (
            <Button
              key={key}
              variant="outline"
              className="h-14 justify-start text-base"
              onClick={() => submit(key)}
              disabled={report.isPending}
            >
              <Icon className="w-5 h-5 mr-3 text-muted-foreground" />
              {t(label)}
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
