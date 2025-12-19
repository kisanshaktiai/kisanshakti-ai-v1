import React from 'react';
import { TrendingUp, TrendingDown, Minus, Calendar, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Upload {
  id: string;
  file_url: string;
  file_type: 'image' | 'video';
  upload_timestamp: string;
  is_processed: boolean;
  notes?: string;
}

interface Analysis {
  id: string;
  upload_id: string;
  crop_current_status: string;
  detected_growth_stage?: string;
  growth_stage_deviation?: string;
  canopy_health_score?: number;
  risk_level?: string;
  created_at: string;
}

interface CropGrowthHistoryProps {
  uploads: Upload[];
  analyses: Analysis[];
  onViewAnalysis: (analysisId: string) => void;
  onAnalyze: (upload: Upload) => void;
  isAnalyzing?: boolean;
  className?: string;
}

export function CropGrowthHistory({ 
  uploads, 
  analyses,
  onViewAnalysis,
  onAnalyze,
  isAnalyzing,
  className 
}: CropGrowthHistoryProps) {
  const { t } = useTranslation();

  const getAnalysisForUpload = (uploadId: string) => {
    return analyses.find(a => a.upload_id === uploadId);
  };

  const getTrendIcon = (deviation?: string) => {
    if (deviation === 'ahead') return <TrendingUp className="h-4 w-4 text-primary" />;
    if (deviation?.includes('delayed')) return <TrendingDown className="h-4 w-4 text-destructive" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getRiskBadge = (risk?: string) => {
    switch (risk) {
      case 'critical':
      case 'high':
        return <Badge variant="destructive" className="text-xs">{risk}</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="text-xs">{risk}</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{risk || 'low'}</Badge>;
    }
  };

  if (uploads.length === 0) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="py-8 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">{t('cropGrowth.noHistory', 'No uploads yet')}</p>
          <p className="text-sm text-muted-foreground">
            {t('cropGrowth.startTracking', 'Upload crop photos to start tracking growth')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          {t('cropGrowth.uploadHistory', 'Upload History')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {uploads.map((upload) => {
            const analysis = getAnalysisForUpload(upload.id);
            const healthScore = analysis?.canopy_health_score 
              ? Math.round(analysis.canopy_health_score * 100) 
              : null;

            return (
              <div 
                key={upload.id}
                className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                {/* Thumbnail */}
                <div className="relative w-16 h-16 rounded-md overflow-hidden shrink-0 bg-muted">
                  {upload.file_type === 'video' ? (
                    <video
                      src={upload.file_url}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={upload.file_url}
                      alt="Crop"
                      className="w-full h-full object-cover"
                    />
                  )}
                  {healthScore !== null && (
                    <div className={cn(
                      "absolute bottom-0 left-0 right-0 text-center text-xs font-bold py-0.5",
                      healthScore >= 70 ? "bg-primary/90 text-primary-foreground" :
                      healthScore >= 40 ? "bg-warning/90 text-warning-foreground" : 
                      "bg-destructive/90 text-destructive-foreground"
                    )}>
                      {healthScore}%
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      {format(new Date(upload.upload_timestamp), 'MMM d, yyyy')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(upload.upload_timestamp), 'h:mm a')}
                    </span>
                  </div>

                  {analysis ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getTrendIcon(analysis.growth_stage_deviation)}
                        <span className="text-xs capitalize">
                          {analysis.detected_growth_stage}
                        </span>
                        {getRiskBadge(analysis.risk_level)}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {analysis.crop_current_status}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {upload.is_processed ? 'Processed' : 'Pending'}
                      </Badge>
                      {upload.notes && (
                        <span className="text-xs text-muted-foreground truncate">
                          {upload.notes}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="shrink-0">
                  {analysis ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewAnalysis(analysis.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  ) : !upload.is_processed ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onAnalyze(upload)}
                      disabled={isAnalyzing}
                    >
                      {t('cropGrowth.analyze', 'Analyze')}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
