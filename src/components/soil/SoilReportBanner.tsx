import { Activity, MapPin, Calendar, Leaf, TestTube } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface SoilReportBannerProps {
  farmerName?: string;
  farmerCode?: string;
  landName?: string;
  fertilityClass?: string;
  testDate?: string;
  fieldArea?: number;
  soilType?: string;
}

export function SoilReportBanner({
  farmerName,
  farmerCode,
  landName,
  fertilityClass,
  testDate,
  fieldArea,
  soilType,
}: SoilReportBannerProps) {
  return (
    <Card className="mb-4 overflow-hidden border-2 shadow-lg">
      <div className="bg-gradient-to-r from-primary to-primary/80 p-6 text-primary-foreground">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-5 w-5" />
              <h2 className="text-xl font-bold">Soil Health Analysis</h2>
            </div>
            <p className="text-sm opacity-90 mb-1">{farmerName}</p>
            <p className="text-xs opacity-75">Farmer Code: {farmerCode}</p>
          </div>
          <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
            {fertilityClass || 'Analysis'}
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
              <span className="opacity-90">{new Date(testDate).toLocaleDateString()}</span>
            </div>
          )}
          {fieldArea && (
            <div className="flex items-center gap-2">
              <Leaf className="h-4 w-4 opacity-75" />
              <span className="opacity-90">{fieldArea} hectares</span>
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
