import { Activity, MapPin, Calendar, Leaf, TestTube } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from 'react-i18next';

interface SoilReportBannerProps {
  farmerName?: string;
  farmerCode?: string;
  landName?: string;
  fertilityClass?: string;
  testDate?: string;
  fieldArea?: number;
  soilType?: string;
  /** which report type this record is (lab test / satellite estimate / soil device) */
  sourceLabel?: string;
}

export function SoilReportBanner({
  farmerName,
  farmerCode,
  landName,
  fertilityClass,
  testDate,
  fieldArea,
  soilType,
  sourceLabel,
}: SoilReportBannerProps) {
  const { t, i18n } = useTranslation();
  return (
    <Card className="mb-4 overflow-hidden border-2 shadow-lg">
      <div className="bg-gradient-to-r from-primary to-primary/80 p-6 text-primary-foreground">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-5 w-5" />
              <h2 className="text-xl font-bold">{t('soil.analysis')}</h2>
            </div>
            <p className="text-sm opacity-90 mb-1">{farmerName}</p>
            {farmerCode && <p className="text-xs opacity-75">{t('soil.farmerCode')}: {farmerCode}</p>}
          </div>
          <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
            {fertilityClass || sourceLabel || t('soil.analysis')}
          </Badge>
        </div>
        
        <Separator className="my-4 bg-white/20" />
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 opacity-75" />
            <span className="opacity-90">{landName}</span>
          </div>
          {testDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 opacity-75" />
              <span className="opacity-90">{new Date(testDate).toLocaleDateString(i18n.language)}</span>
            </div>
          )}
          {fieldArea != null && (
            <div className="flex items-center gap-2">
              <Leaf className="h-4 w-4 opacity-75" />
              <span className="opacity-90">{t('soil.hectares', { value: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(fieldArea) })}</span>
            </div>
          )}
          {soilType && (
            <div className="flex items-center gap-2">
              <TestTube className="h-4 w-4 opacity-75" />
              <span className="opacity-90">{soilType}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
