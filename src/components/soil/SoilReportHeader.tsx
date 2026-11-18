import { ArrowLeft, Share2, FileText, Image as ImageIcon, MoreVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';

interface SoilReportHeaderProps {
  landName?: string;
  exporting: boolean;
  onBack: () => void;
  onDownloadPDF: () => void;
  onDownloadImage: () => void;
  onShare: () => void;
}

/** Slim sticky bar: back, what this is, and one menu for saving or sharing — the report itself owns the screen. */
export function SoilReportHeader({ landName, exporting, onBack, onDownloadPDF, onDownloadImage, onShare }: SoilReportHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-2 py-2">
        <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">{t('soil.backToLand')}</span>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold leading-tight text-foreground">{t('soil.report')}</p>
          {landName && <p className="truncate text-xs text-muted-foreground">{landName}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl" aria-label={t('soil.saveOrShare')} disabled={exporting}>
              {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <MoreVertical className="h-5 w-5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1.5">
            <DropdownMenuItem className="min-h-11 gap-3 rounded-xl" onSelect={onShare}><Share2 className="h-4 w-4" />{t('soil.share')}</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-3 rounded-xl" onSelect={onDownloadPDF}><FileText className="h-4 w-4" />{t('soil.exportPdf')}</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-3 rounded-xl" onSelect={onDownloadImage}><ImageIcon className="h-4 w-4" />{t('soil.exportImage')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
