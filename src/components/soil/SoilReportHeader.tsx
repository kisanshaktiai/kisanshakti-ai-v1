import { ArrowLeft, Download, Share2, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SoilReportHeaderProps {
  landName?: string;
  exporting: boolean;
  onBack: () => void;
  onDownloadPDF: () => void;
  onDownloadImage: () => void;
  onShare: () => void;
}

export function SoilReportHeader({
  landName,
  exporting,
  onBack,
  onDownloadPDF,
  onDownloadImage,
  onShare,
}: SoilReportHeaderProps) {
  return (
    <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b shadow-sm">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-lg truncate">Soil Health Report</h1>
              <p className="text-xs text-muted-foreground truncate">{landName}</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={onDownloadPDF}
              disabled={exporting}
              className="hidden sm:flex"
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={onDownloadImage}
              disabled={exporting}
              className="hidden sm:flex"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button 
              variant="default" 
              size="icon" 
              onClick={onShare}
              disabled={exporting}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex gap-2 mt-3 sm:hidden">
          <Button 
            variant="outline" 
            onClick={onDownloadPDF}
            disabled={exporting}
            className="flex-1"
          >
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button 
            variant="outline" 
            onClick={onDownloadImage}
            disabled={exporting}
            className="flex-1"
          >
            <Download className="h-4 w-4 mr-2" />
            Image
          </Button>
        </div>
      </div>
    </div>
  );
}
