import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  X, 
  Leaf, 
  AlertCircle, 
  CheckCircle, 
  MessageSquare,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface InstaScanResult {
  imageUrl: string;
  cropName: string;
  cropCondition: 'healthy' | 'warning' | 'critical';
  diseases: string[];
  suggestions: string[];
  confidence: number;
}

interface InstaScanResultsProps {
  result: InstaScanResult;
  onClose: () => void;
  onContinueToChat: () => void;
}

export function InstaScanResults({ result, onClose, onContinueToChat }: InstaScanResultsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const getConditionIcon = () => {
    switch (result.cropCondition) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-warning" />;
      case 'critical':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Leaf className="w-5 h-5 text-primary" />;
    }
  };

  const getConditionColor = () => {
    switch (result.cropCondition) {
      case 'healthy':
        return 'bg-success/10 text-success border-success/20';
      case 'warning':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'critical':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      default:
        return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xl animate-fade-in">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="glassmorphism-nav border-b border-nav-border/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-primary animate-pulse" />
              <h2 className="text-lg font-semibold">{t('instaScan.results')}</h2>
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

        {/* Content */}
        <ScrollArea className="flex-1 px-4 py-4">
          <div className="space-y-4 pb-safe">
            {/* Image Preview */}
            <Card className="glassmorphism overflow-hidden">
              <div className="relative aspect-video">
                <img
                  src={result.imageUrl}
                  alt={result.cropName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 right-3">
                  <Badge className="glassmorphism bg-background/80 backdrop-blur-xl">
                    {t('instaScan.confidence')}: {result.confidence}%
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Crop Information */}
            <Card className="glassmorphism p-4">
              <div className="space-y-4">
                {/* Crop Name */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Leaf className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('instaScan.cropIdentified')}</p>
                    <p className="text-lg font-semibold">{result.cropName}</p>
                  </div>
                </div>

                {/* Condition */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                    {getConditionIcon()}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('instaScan.condition')}</p>
                    <Badge className={cn("border", getConditionColor())}>
                      {t(`instaScan.conditions.${result.cropCondition}`)}
                    </Badge>
                  </div>
                </div>

                {/* Diseases */}
                {result.diseases.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">{t('instaScan.diseasesDetected')}</p>
                    <div className="flex flex-wrap gap-2">
                      {result.diseases.map((disease, index) => (
                        <Badge key={index} variant="outline" className="border-destructive/50 text-destructive">
                          {disease}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* AI Suggestions */}
            <Card className="glassmorphism p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">{t('instaScan.smartSuggestions')}</h3>
              </div>
              <div className="space-y-2">
                {result.suggestions.map((suggestion, index) => (
                  <div key={index} className="flex gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <p className="text-sm text-muted-foreground">{suggestion}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Footer Note */}
            <Card className="glassmorphism p-4 bg-primary/5 border-primary/20">
              <div className="flex gap-3">
                <MessageSquare className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">
                    {t('instaScan.detailedGuidance')}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </ScrollArea>

        {/* Bottom Actions */}
        <div className="glassmorphism-nav border-t border-nav-border/20 px-4 py-3 pb-safe">
          <div className="flex gap-3">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              {t('common.close')}
            </Button>
            <Button
              onClick={onContinueToChat}
              className="flex-1 bg-gradient-to-r from-primary to-primary-glow hover:opacity-90"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              {t('instaScan.continueInChat')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}