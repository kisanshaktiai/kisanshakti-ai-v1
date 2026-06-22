import React from 'react';
import { 
  Leaf, AlertTriangle, TrendingUp, TrendingDown, 
  Calendar, Droplets, Bug, Thermometer, CheckCircle2,
  Clock, ArrowRight, Sprout
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface AnalysisData {
  id: string;
  crop_current_status: string;
  detected_growth_stage?: string;
  expected_growth_stage?: string;
  growth_stage_deviation?: string;
  visual_observation_summary: string;
  detected_issues?: Array<{
    type: string;
    name: string;
    severity: string;
    affected_area: string;
    confidence: number;
    symptoms: string[];
  }>;
  canopy_health_score?: number;
  uniformity_score?: number;
  signal_confidence?: string;
  next_7_day_prediction?: string;
  risk_level?: string;
  risk_factors?: Array<{
    factor: string;
    probability: number;
    impact: string;
    timeframe: string;
  }>;
  recommended_actions?: Array<{
    action: string;
    timing: string;
    reason: string;
    priority: string;
    product?: string;
    dosage?: string;
    cost_estimate?: string;
    confidence_score?: number;
    based_on?: string[];
    scientific_reason?: string;
  }>;
  farmer_message: string;
  created_at: string;
  // New scientific metadata fields
  analysis_confidence?: number;
  analysis_based_on?: string[];
  scientific_methodology?: string;
  yield_estimate?: {
    range: string;
    confidence: number;
    assumptions: string[];
  };
}

interface CropGrowthAnalysisCardProps {
  analysis: AnalysisData;
  onActionComplete?: (actionIndex: number) => void;
}

export function CropGrowthAnalysisCard({ analysis, onActionComplete }: CropGrowthAnalysisCardProps) {
  const { t } = useTranslation();

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      default: return 'secondary';
    }
  };

  const getDeviationIcon = (deviation?: string) => {
    if (deviation === 'ahead') return <TrendingUp className="h-4 w-4 text-primary" />;
    if (deviation?.includes('delayed')) return <TrendingDown className="h-4 w-4 text-destructive" />;
    return <CheckCircle2 className="h-4 w-4 text-primary" />;
  };

  const getIssueIcon = (type: string) => {
    switch (type) {
      case 'pest': return <Bug className="h-4 w-4" />;
      case 'disease': return <AlertTriangle className="h-4 w-4" />;
      case 'water_stress': return <Droplets className="h-4 w-4" />;
      case 'nutrient_deficiency': return <Leaf className="h-4 w-4" />;
      case 'weather_damage': return <Thermometer className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const healthScore = analysis.canopy_health_score ? Math.round(analysis.canopy_health_score * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Status Overview */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sprout className="h-5 w-5 text-primary" />
              {t('cropGrowth.currentStatus', 'Current Status')}
            </CardTitle>
            <div className="flex items-center gap-2">
              {analysis.analysis_confidence != null && (
                <Badge variant="outline" className={cn(
                  "text-xs",
                  Math.round(analysis.analysis_confidence * 100) >= 80 ? "bg-success/10 border-success/30 text-success" :
                  Math.round(analysis.analysis_confidence * 100) >= 60 ? "bg-warning/10 border-warning/30 text-warning" :
                  "bg-destructive/10 border-destructive/30 text-destructive"
                )}>
                  {Math.round(analysis.analysis_confidence * 100)}% {t('cropGrowth.confident', 'confident')}
                </Badge>
              )}
              <Badge variant={getRiskColor(analysis.risk_level) as any}>
                {analysis.risk_level?.toUpperCase() || 'LOW'} {t('cropGrowth.risk', 'RISK')}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{analysis.crop_current_status}</p>
          
          {/* Analysis Based On */}
          {analysis.analysis_based_on && analysis.analysis_based_on.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground">{t('cropGrowth.basedOn', 'Based on')}:</span>
              {analysis.analysis_based_on.map((factor, idx) => (
                <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5">
                  {factor}
                </Badge>
              ))}
            </div>
          )}
          
          {/* Health Score */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('cropGrowth.healthScore', 'Health Score')}</span>
              <span className="font-medium">{healthScore}%</span>
            </div>
            <Progress 
              value={healthScore} 
              className={cn(
                "h-2",
                healthScore >= 70 ? "[&>div]:bg-primary" :
                healthScore >= 40 ? "[&>div]:bg-warning" : "[&>div]:bg-destructive"
              )}
            />
          </div>

          {/* Growth Stage */}
          <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('cropGrowth.growthStage', 'Growth Stage')}</p>
              <p className="font-medium">{analysis.detected_growth_stage || 'Unknown'}</p>
            </div>
            <div className="flex items-center gap-2">
              {getDeviationIcon(analysis.growth_stage_deviation)}
              <span className={cn(
                "text-sm capitalize",
                analysis.growth_stage_deviation === 'on_track' ? "text-primary" :
                analysis.growth_stage_deviation?.includes('delayed') ? "text-destructive" : ""
              )}>
                {analysis.growth_stage_deviation?.replace('_', ' ')}
              </span>
            </div>
          </div>
          
          {/* Yield Estimate with Context */}
          {analysis.yield_estimate && (
            <div className="p-3 rounded-lg bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{t('cropGrowth.yieldEstimate', 'Expected Yield')}</span>
                <Badge variant="outline" className="text-xs">
                  {analysis.yield_estimate.confidence}% {t('cropGrowth.confidence', 'confidence')}
                </Badge>
              </div>
              <p className="text-lg font-bold text-primary">{analysis.yield_estimate.range}</p>
              {analysis.yield_estimate.assumptions && analysis.yield_estimate.assumptions.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium">{t('cropGrowth.assumptions', 'Assumptions')}:</p>
                  <div className="flex flex-wrap gap-1">
                    {analysis.yield_estimate.assumptions.map((assumption, idx) => (
                      <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                        {assumption}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issues Detected */}
      {analysis.detected_issues && analysis.detected_issues.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              {t('cropGrowth.issuesDetected', 'Issues Detected')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analysis.detected_issues.map((issue, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <div className={cn(
                    "p-2 rounded-full",
                    issue.severity === 'severe' ? "bg-destructive/20 text-destructive" :
                    issue.severity === 'moderate' ? "bg-warning/20 text-warning" : "bg-muted"
                  )}>
                    {getIssueIcon(issue.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{issue.name}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {issue.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {issue.symptoms?.join(', ')}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {issue.confidence}% {t('cropGrowth.confidence', 'confidence')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Predictions */}
      {analysis.next_7_day_prediction && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              {t('cropGrowth.prediction7Day', '7-Day Prediction')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{analysis.next_7_day_prediction}</p>
            
            {analysis.risk_factors && analysis.risk_factors.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('cropGrowth.riskFactors', 'Risk Factors')}:
                </p>
                {analysis.risk_factors.map((risk, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span>{risk.factor}</span>
                    <div className="flex items-center gap-2">
                      <Progress value={risk.probability} className="w-20 h-1.5" />
                      <span className="text-xs text-muted-foreground">{risk.probability}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recommended Actions */}
      {analysis.recommended_actions && analysis.recommended_actions.length > 0 && (
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              {t('cropGrowth.recommendedActions', 'Recommended Actions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analysis.recommended_actions.map((action, idx) => (
                <div 
                  key={idx}
                  className={cn(
                    "p-4 rounded-lg border",
                    action.priority === 'critical' ? "border-destructive bg-destructive/5" :
                    action.priority === 'high' ? "border-warning bg-warning/5" : "border-border"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant={action.priority === 'critical' || action.priority === 'high' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {action.priority?.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {action.timing}
                        </span>
                        {action.confidence_score != null && (
                          <Badge variant="outline" className={cn(
                            "text-[10px]",
                            Math.round(action.confidence_score * 100) >= 80 ? "bg-success/10 text-success" :
                            Math.round(action.confidence_score * 100) >= 60 ? "bg-warning/10 text-warning" :
                            "bg-destructive/10 text-destructive"
                          )}>
                            {Math.round(action.confidence_score * 100)}%
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium">{action.action}</p>
                      <p className="text-xs text-muted-foreground mt-1">{action.reason}</p>
                      
                      {/* Scientific basis for action */}
                      {action.based_on && action.based_on.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {action.based_on.map((basis, bIdx) => (
                            <span key={bIdx} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              {basis}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {action.scientific_reason && (
                        <p className="text-[10px] text-muted-foreground mt-2 italic border-l-2 border-primary/30 pl-2">
                          💡 {action.scientific_reason}
                        </p>
                      )}
                      
                      {(action.product || action.dosage) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {action.product && (
                            <Badge variant="outline" className="text-xs">
                              {action.product}
                            </Badge>
                          )}
                          {action.dosage && (
                            <Badge variant="outline" className="text-xs">
                              {action.dosage}
                            </Badge>
                          )}
                          {action.cost_estimate && (
                            <Badge variant="outline" className="text-xs">
                              {action.cost_estimate}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {onActionComplete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onActionComplete(idx)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Farmer Message */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Leaf className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">
                {t('cropGrowth.expertAdvice', 'Expert Advice')}
              </p>
              <p className="text-sm">{analysis.farmer_message}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
