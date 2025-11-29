import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  X, 
  Leaf, 
  AlertCircle, 
  CheckCircle, 
  MessageSquare,
  Sparkles,
  TrendingUp,
  Bug,
  Droplets,
  AlertTriangle,
  Clock,
  Calendar,
  FileText,
  Share2,
  Save,
  TestTube,
  Eye,
  Zap,
  Info
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Production-quality result interface matching edge function response
export interface InstaScanResult {
  imageUrl: string;
  
  detectedItem: {
    commonName: string;
    scientificName: string;
    confidence: number; // 0-100
    category: 'crop' | 'weed' | 'pest' | 'disease' | 'seed' | 'nutrient_deficiency' | 'unknown';
  };
  
  healthStatus: {
    condition: 'healthy' | 'warning' | 'critical';
    riskLevel: 'low' | 'medium' | 'high';
    primaryIssues: string[];
    secondaryIssues: string[];
  };
  
  diagnosis: {
    summary: string;
    details: string;
    affectedParts: string[];
    likelyDiseases: Array<{
      name: string;
      scientificName?: string;
      confidence: number;
      symptoms: string[];
    }>;
    likelyPests: Array<{
      name: string;
      scientificName?: string;
      confidence: number;
      damageType: string;
    }>;
    nutrientDeficiencies: Array<{
      nutrient: string;
      severity: 'mild' | 'moderate' | 'severe';
      symptoms: string[];
    }>;
  };
  
  recommendations: {
    immediate: Array<{
      action: string;
      priority: 'critical' | 'high' | 'medium';
      estimatedCost?: string;
      timeframe: string;
    }>;
    shortTerm: Array<{
      action: string;
      priority: 'high' | 'medium' | 'low';
      estimatedCost?: string;
    }>;
    longTerm: Array<{
      action: string;
      preventive: boolean;
    }>;
  };
  
  metadata: {
    confidenceScore: number;
    needsMoreImages: boolean;
    suggestedNextSteps: string[];
    labTestRecommended: boolean;
    weatherSensitive: boolean;
    evidenceLinks?: string[];
  };
  
  visualAnalysis?: {
    dominantColors: string[];
    textureNotes: string;
    anomalyRegions?: string;
  };
  
  processingTimeMs?: number;
}

interface InstaScanResultsProps {
  result: InstaScanResult;
  onClose: () => void;
  onContinueToChat: () => void;
}

export function InstaScanResults({ result, onClose, onContinueToChat }: InstaScanResultsProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState('overview');

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low':
        return 'bg-success/20 text-success border-success/30';
      case 'medium':
        return 'bg-warning/20 text-warning border-warning/30';
      case 'high':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      default:
        return 'bg-muted/20 text-muted-foreground border-muted/30';
    }
  };

  const getConditionIcon = () => {
    switch (result.healthStatus.condition) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-warning" />;
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-destructive" />;
      default:
        return <Leaf className="w-5 h-5 text-primary" />;
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'high':
        return <AlertCircle className="w-4 h-4 text-warning" />;
      default:
        return <Info className="w-4 h-4 text-primary" />;
    }
  };

  const handleSave = () => {
    // TODO: Implement save to field log
    toast.success(t('instaScan.savedToFieldLog'));
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `InstaScan: ${result.detectedItem.commonName}`,
          text: result.diagnosis.summary,
        });
      } catch (error) {
        console.log('Share cancelled', error);
      }
    } else {
      toast.info(t('instaScan.shareNotSupported'));
    }
  };

  const handleRequestLabTest = () => {
    // TODO: Implement lab test request flow
    toast.info(t('instaScan.labTestRequested'));
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xl animate-fade-in">
      <div className="flex flex-col h-full">
        {/* Header with Risk Ribbon */}
        <div className="glassmorphism-nav border-b border-nav-border/20">
          {/* Risk Ribbon */}
          <div className={cn(
            "h-2 w-full transition-all",
            result.healthStatus.riskLevel === 'low' && "bg-success",
            result.healthStatus.riskLevel === 'medium' && "bg-warning",
            result.healthStatus.riskLevel === 'high' && "bg-destructive"
          )} />
          
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                <div>
                  <h2 className="text-lg font-semibold">{t('instaScan.results')}</h2>
                  <p className="text-xs text-muted-foreground">
                    {result.processingTimeMs && `${(result.processingTimeMs / 1000).toFixed(1)}s`}
                  </p>
                </div>
              </div>
              <Button
                onClick={onClose}
                variant="ghost"
                size="icon"
                className="rounded-full hover:bg-muted/50"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-4 pb-32">
            {/* Image Preview */}
            <Card className="glassmorphism overflow-hidden">
              <div className="relative aspect-video">
                <img
                  src={result.imageUrl}
                  alt={result.detectedItem.commonName}
                  className="w-full h-full object-cover"
                />
                {/* Confidence Badge */}
                <div className="absolute top-3 right-3">
                  <Badge className="glassmorphism bg-background/80 backdrop-blur-xl">
                    <Eye className="w-3 h-3 mr-1" />
                    {result.detectedItem.confidence}% {t('instaScan.confident')}
                  </Badge>
                </div>
                {/* Category Badge */}
                <div className="absolute top-3 left-3">
                  <Badge variant="outline" className="glassmorphism bg-background/80 backdrop-blur-xl">
                    {result.detectedItem.category.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Confidence Bar */}
            <Card className="glassmorphism p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t('instaScan.howSureAreWe')}</span>
                  <span className="text-muted-foreground">{result.metadata.confidenceScore}%</span>
                </div>
                <Progress value={result.metadata.confidenceScore} className="h-2" />
                {result.metadata.needsMoreImages && (
                  <p className="text-xs text-warning flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {t('instaScan.moreImagesRecommended')}
                  </p>
                )}
              </div>
            </Card>

            {/* Detected Item Card */}
            <Card className="glassmorphism p-5">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Leaf className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">{t('instaScan.detected')}</p>
                    <h3 className="text-xl font-semibold">{result.detectedItem.commonName}</h3>
                    <p className="text-sm text-muted-foreground italic">{result.detectedItem.scientificName}</p>
                  </div>
                </div>

                <Separator />

                {/* Health Status */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                    {getConditionIcon()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">{t('instaScan.healthStatus')}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={cn("border capitalize", getRiskColor(result.healthStatus.riskLevel))}>
                        {result.healthStatus.riskLevel} {t('instaScan.risk')}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {result.healthStatus.condition}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Tabs for Details */}
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">{t('instaScan.overview')}</TabsTrigger>
                <TabsTrigger value="diagnosis">{t('instaScan.diagnosis')}</TabsTrigger>
                <TabsTrigger value="actions">{t('instaScan.actions')}</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* Diagnosis Summary */}
                <Card className="glassmorphism p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">{t('instaScan.diagnosisSummary')}</h3>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{result.diagnosis.summary}</p>
                </Card>

                {/* Primary Issues */}
                {result.healthStatus.primaryIssues.length > 0 && (
                  <Card className="glassmorphism p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      <h3 className="font-semibold text-destructive">{t('instaScan.primaryIssues')}</h3>
                    </div>
                    <div className="space-y-2">
                      {result.healthStatus.primaryIssues.map((issue, index) => (
                        <div key={index} className="flex gap-2 text-sm">
                          <span className="text-destructive">•</span>
                          <span>{issue}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Secondary Issues */}
                {result.healthStatus.secondaryIssues.length > 0 && (
                  <Card className="glassmorphism p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Info className="w-5 h-5 text-warning" />
                      <h3 className="font-semibold">{t('instaScan.secondaryIssues')}</h3>
                    </div>
                    <div className="space-y-2">
                      {result.healthStatus.secondaryIssues.map((issue, index) => (
                        <div key={index} className="flex gap-2 text-sm text-muted-foreground">
                          <span>•</span>
                          <span>{issue}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </TabsContent>

              {/* Diagnosis Tab */}
              <TabsContent value="diagnosis" className="space-y-4 mt-4">
                {/* Diseases */}
                {result.diagnosis.likelyDiseases.length > 0 && (
                  <Card className="glassmorphism p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Droplets className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">{t('instaScan.likelyDiseases')}</h3>
                    </div>
                    <div className="space-y-3">
                      {result.diagnosis.likelyDiseases.map((disease, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{disease.name}</p>
                              {disease.scientificName && (
                                <p className="text-xs text-muted-foreground italic">{disease.scientificName}</p>
                              )}
                            </div>
                            <Badge variant="outline">{disease.confidence}%</Badge>
                          </div>
                          <div className="pl-4 space-y-1">
                            {disease.symptoms.map((symptom, idx) => (
                              <p key={idx} className="text-xs text-muted-foreground">• {symptom}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Pests */}
                {result.diagnosis.likelyPests.length > 0 && (
                  <Card className="glassmorphism p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Bug className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">{t('instaScan.likelyPests')}</h3>
                    </div>
                    <div className="space-y-3">
                      {result.diagnosis.likelyPests.map((pest, index) => (
                        <div key={index} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{pest.name}</p>
                              {pest.scientificName && (
                                <p className="text-xs text-muted-foreground italic">{pest.scientificName}</p>
                              )}
                            </div>
                            <Badge variant="outline">{pest.confidence}%</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground pl-4">{pest.damageType}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Nutrient Deficiencies */}
                {result.diagnosis.nutrientDeficiencies.length > 0 && (
                  <Card className="glassmorphism p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">{t('instaScan.nutrientDeficiencies')}</h3>
                    </div>
                    <div className="space-y-3">
                      {result.diagnosis.nutrientDeficiencies.map((deficiency, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm">{deficiency.nutrient}</p>
                            <Badge 
                              variant="outline"
                              className={cn(
                                deficiency.severity === 'severe' && 'border-destructive text-destructive',
                                deficiency.severity === 'moderate' && 'border-warning text-warning',
                                deficiency.severity === 'mild' && 'border-success text-success'
                              )}
                            >
                              {deficiency.severity}
                            </Badge>
                          </div>
                          <div className="pl-4 space-y-1">
                            {deficiency.symptoms.map((symptom, idx) => (
                              <p key={idx} className="text-xs text-muted-foreground">• {symptom}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Detailed Diagnosis */}
                <Card className="glassmorphism p-4 bg-primary/5 border-primary/20">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">{t('instaScan.detailedAnalysis')}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{result.diagnosis.details}</p>
                    {result.diagnosis.affectedParts.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium mb-1">{t('instaScan.affectedParts')}:</p>
                        <div className="flex flex-wrap gap-1">
                          {result.diagnosis.affectedParts.map((part, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">{part}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </TabsContent>

              {/* Actions Tab */}
              <TabsContent value="actions" className="space-y-4 mt-4">
                {/* Immediate Actions */}
                {result.recommendations.immediate.length > 0 && (
                  <Card className="glassmorphism p-4 border-destructive/30">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      <h3 className="font-semibold text-destructive">{t('instaScan.immediateActions')}</h3>
                    </div>
                    <div className="space-y-3">
                      {result.recommendations.immediate.map((action, index) => (
                        <div key={index} className="flex gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                          <div className="flex-shrink-0 mt-0.5">
                            {getPriorityIcon(action.priority)}
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium">{action.action}</p>
                            <div className="flex flex-wrap gap-2 text-xs">
                              <Badge variant="outline" className="gap-1">
                                <Clock className="w-3 h-3" />
                                {action.timeframe}
                              </Badge>
                              {action.estimatedCost && (
                                <Badge variant="outline">{action.estimatedCost}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Short-term Actions */}
                {result.recommendations.shortTerm.length > 0 && (
                  <Card className="glassmorphism p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="w-5 h-5 text-warning" />
                      <h3 className="font-semibold">{t('instaScan.shortTermActions')}</h3>
                      <Badge variant="secondary" className="text-xs">3-7 {t('instaScan.days')}</Badge>
                    </div>
                    <div className="space-y-2">
                      {result.recommendations.shortTerm.map((action, index) => (
                        <div key={index} className="flex gap-3 p-3 rounded-lg bg-muted/30">
                          <div className="flex-shrink-0 mt-0.5">
                            {getPriorityIcon(action.priority)}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm">{action.action}</p>
                            {action.estimatedCost && (
                              <p className="text-xs text-muted-foreground mt-1">{action.estimatedCost}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Long-term Actions */}
                {result.recommendations.longTerm.length > 0 && (
                  <Card className="glassmorphism p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">{t('instaScan.longTermActions')}</h3>
                    </div>
                    <div className="space-y-2">
                      {result.recommendations.longTerm.map((action, index) => (
                        <div key={index} className="flex gap-2 text-sm">
                          <span className="text-primary">•</span>
                          <div className="flex-1">
                            <span>{action.action}</span>
                            {action.preventive && (
                              <Badge variant="outline" className="ml-2 text-xs">{t('instaScan.preventive')}</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Lab Test Recommendation */}
                {result.metadata.labTestRecommended && (
                  <Card className="glassmorphism p-4 bg-primary/5 border-primary/20">
                    <div className="flex gap-3">
                      <TestTube className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm mb-1">{t('instaScan.labTestRecommended')}</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          {t('instaScan.labTestDescription')}
                        </p>
                        <Button onClick={handleRequestLabTest} size="sm" variant="outline">
                          <TestTube className="w-4 h-4 mr-2" />
                          {t('instaScan.requestLabTest')}
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              </TabsContent>
            </Tabs>

            {/* Next Steps */}
            {result.metadata.suggestedNextSteps.length > 0 && (
              <Card className="glassmorphism p-4 bg-primary/5 border-primary/20">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">{t('instaScan.nextSteps')}</h3>
                </div>
                <div className="space-y-2">
                  {result.metadata.suggestedNextSteps.map((step, index) => (
                    <p key={index} className="text-sm text-muted-foreground">• {step}</p>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </ScrollArea>

        {/* Bottom Action Bar */}
        <div className="glassmorphism-nav border-t border-nav-border/20 px-4 py-3 pb-safe">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Button
              onClick={handleSave}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">{t('instaScan.save')}</span>
            </Button>
            <Button
              onClick={handleShare}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('instaScan.share')}</span>
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              size="sm"
            >
              {t('common.close')}
            </Button>
          </div>
          <Button
            onClick={onContinueToChat}
            className="w-full bg-gradient-to-r from-primary to-primary-glow hover:opacity-90"
            size="lg"
          >
            <MessageSquare className="w-5 h-5 mr-2" />
            {t('instaScan.continueInChat')}
          </Button>
        </div>
      </div>
    </div>
  );
}
