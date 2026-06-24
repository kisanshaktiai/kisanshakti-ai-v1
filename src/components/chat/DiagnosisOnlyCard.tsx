import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Info, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisionAnalysisResult } from './RecommendationCards';

interface DiagnosisOnlyCardProps {
  analysis: VisionAnalysisResult;
  imageUrl?: string;
  language?: string;
}

const getLabels = (t: (key: string) => string) => ({
  cropDetected: t('chatCards.cards.cropDetected'),
  healthStatus: t('chatCards.cards.healthStatus'),
  diagnosis: t('chatCards.cards.diagnosis'),
  confidence: t('chatCards.cards.confidence'),
  healthy: t('chatCards.cards.healthy'),
  warning: t('chatCards.cards.warning'),
  critical: t('chatCards.cards.critical'),
  analyzed: t('chatCards.cards.analyzed'),
  cropMismatch: t('chatCards.cards.cropMismatch'),
  expected: t('chatCards.cards.expected'),
  detected: t('chatCards.cards.detected'),
});

export function DiagnosisOnlyCard({ analysis, imageUrl, language = 'en' }: DiagnosisOnlyCardProps) {
  const { t } = useTranslation();
  const labels = getLabels(t);
  
  // Safety check
  if (!analysis?.cropDetected || !analysis?.healthStatus || !analysis?.diagnosis) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>{t('chatCards.cards.analysisIncomplete')}</p>
      </div>
    );
  }
  
  const healthColors = {
    healthy: 'bg-success',
    warning: 'bg-warning',
    critical: 'bg-destructive'
  };

  // ✅ Check for crop mismatch
  const isCropMismatch = analysis.cropDetected.matchesLandCrop === false;
  
  return (
    <div className="space-y-3">
      {/* Image with Analyzed badge */}
      {imageUrl && (
        <div className="relative rounded-xl overflow-hidden">
          <img 
            src={imageUrl} 
            alt="Analyzed crop" 
            className="w-full aspect-video object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute top-2 right-2">
            <Badge className="bg-success text-white shadow-lg">
              <CheckCircle className="h-3 w-3 mr-1" />
              {labels.analyzed}
            </Badge>
          </div>
        </div>
      )}
      
      {/* ✅ Crop Mismatch Warning */}
      {isCropMismatch && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-3 bg-destructive/10 border-2 border-destructive/30 rounded-xl"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">
                {labels.cropMismatch}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="border-destructive/50">
                  {labels.detected}: {analysis.cropDetected.name}
                </Badge>
                {analysis.cropDetected.landCrop && (
                  <Badge variant="outline" className="border-success/50 text-success dark:text-success">
                    {labels.expected}: {analysis.cropDetected.landCrop}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
      
      {/* Crop Detection Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className={cn("border-2", isCropMismatch ? "border-destructive/20" : "border-primary/20")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm text-muted-foreground">{labels.cropDetected}</div>
                <div className="text-xl font-bold">
                  {analysis.cropDetected.name}
                  {analysis.cropDetected.scientificName && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({analysis.cropDetected.scientificName})
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">{labels.confidence}</div>
                <div className="text-lg font-bold text-primary">
                  {analysis.cropDetected.confidence}%
                </div>
              </div>
            </div>
            
            {/* Health Status */}
            <div className="flex items-center gap-3 mt-3">
              <div className="text-sm text-muted-foreground">{labels.healthStatus}:</div>
              <Badge className={cn(healthColors[analysis.healthStatus.condition], "text-white")}>
                {labels[analysis.healthStatus.condition]}
              </Badge>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(healthColors[analysis.healthStatus.condition], "h-full transition-all")}
                  style={{ width: `${analysis.healthStatus.score}%` }}
                />
              </div>
              <span className="text-sm font-medium">{analysis.healthStatus.score}%</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      
      {/* Diagnosis Summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-5 w-5 text-primary" />
              <span className="font-medium">{labels.diagnosis}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {analysis.diagnosis.summary}
            </p>
            
            {/* Issues List */}
            {analysis.healthStatus.issues.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {analysis.healthStatus.issues.map((issue, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {issue}
                  </Badge>
                ))}
              </div>
            )}
            
            {/* Disease/Pest Details */}
            {analysis.diagnosis.diseases && analysis.diagnosis.diseases.length > 0 && (
              <div className="mt-3 p-2 bg-destructive/10 rounded-lg">
                <div className="flex items-center gap-1 text-sm font-medium text-destructive dark:text-destructive mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  {t('chatCards.cards.detectedDiseases')}
                </div>
                <ul className="text-sm space-y-1">
                  {analysis.diagnosis.diseases.map((disease, idx) => (
                    <li key={idx} className="text-muted-foreground">
                      • {disease.name} ({disease.confidence}%)
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {analysis.diagnosis.pests && analysis.diagnosis.pests.length > 0 && (
              <div className="mt-3 p-2 bg-warning/10 rounded-lg">
                <div className="flex items-center gap-1 text-sm font-medium text-warning dark:text-warning mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  {t('chatCards.cards.detectedPests')}
                </div>
                <ul className="text-sm space-y-1">
                  {analysis.diagnosis.pests.map((pest, idx) => (
                    <li key={idx} className="text-muted-foreground">
                      • {pest.name} - {pest.damageType}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
