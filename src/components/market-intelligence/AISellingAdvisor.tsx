import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { AIAnalysis } from '@/hooks/useMarketPriceIntelligence';
import { Button } from '@/components/ui/button';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  MapPin,
  Clock,
  Lightbulb,
  Loader2,
  CheckCircle,
  AlertCircle,
  PauseCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AISellingAdvisorProps {
  analysis: AIAnalysis | null;
  selectedCrop?: string;
  isLoading: boolean;
  onGetAdvice: () => void;
}

export function AISellingAdvisor({ 
  analysis, 
  selectedCrop, 
  isLoading,
  onGetAdvice 
}: AISellingAdvisorProps) {
  const { t } = useTranslation();

  const getRecommendationConfig = () => {
    if (!analysis) return null;
    
    switch (analysis.recommendation) {
      case 'SELL_NOW':
        return {
          icon: CheckCircle,
          colorClass: 'text-success',
          bgClass: 'bg-success/10',
          borderClass: 'border-success/20',
          label: t('market.intelligence.sellNow', 'Sell Now'),
          labelMr: 'आता विका',
          description: t('market.intelligence.sellNowDesc', 'Market conditions are favorable')
        };
      case 'WAIT':
        return {
          icon: PauseCircle,
          colorClass: 'text-warning',
          bgClass: 'bg-warning/10',
          borderClass: 'border-warning/20',
          label: t('market.intelligence.wait', 'Wait'),
          labelMr: 'थांबा',
          description: t('market.intelligence.waitDesc', 'Better prices expected soon')
        };
      case 'HOLD':
        return {
          icon: AlertCircle,
          colorClass: 'text-warning',
          bgClass: 'bg-warning/10',
          borderClass: 'border-warning/20',
          label: t('market.intelligence.hold', 'Hold'),
          labelMr: 'धरून ठेवा',
          description: t('market.intelligence.holdDesc', 'Monitor market closely')
        };
      default:
        return null;
    }
  };

  const getOutlookIcon = () => {
    if (!analysis) return null;
    if (analysis.priceOutlook === 'up') return <TrendingUp className="w-5 h-5 text-success" />;
    if (analysis.priceOutlook === 'down') return <TrendingDown className="w-5 h-5 text-destructive" />;
    return <Minus className="w-5 h-5 text-warning" />;
  };

  if (!selectedCrop) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          "text-center py-12 rounded-2xl",
          "bg-gradient-to-br from-card/50 to-muted/30",
          "border border-border/50"
        )}
      >
        <Brain className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold mb-1">
          AI विश्लेषणासाठी पीक निवडा
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('market.intelligence.selectCropForAIDesc', 'Choose a crop from the filters above to get AI-powered selling recommendations')}
        </p>
      </motion.div>
    );
  }

  if (!analysis) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          "text-center py-12 rounded-2xl",
          "bg-gradient-to-br from-primary/5 to-accent/5",
          "border border-primary/20"
        )}
      >
        <div className="p-4 rounded-2xl bg-primary/10 w-fit mx-auto mb-4">
          <Brain className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-1">
          AI विक्री सल्ला मिळवा
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
          {t('market.intelligence.getAIInsightsDesc', 'Our AI analyzes market trends, historical data, and current prices to give you the best selling advice')}
        </p>
        <Button 
          onClick={onGetAdvice}
          className="rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Brain className="w-4 h-4 mr-2" />
          )}
          {t('market.intelligence.analyzeNow', 'Analyze Now')}
        </Button>
      </motion.div>
    );
  }

  const recConfig = getRecommendationConfig();

  return (
    <div className="space-y-4">
      {/* Main Recommendation Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "relative overflow-hidden rounded-2xl p-5",
          recConfig?.bgClass,
          "border",
          recConfig?.borderClass
        )}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-background/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
        
        <div className="flex items-start gap-4">
          <div className={cn("p-3 rounded-xl", recConfig?.bgClass)}>
            {recConfig?.icon && <recConfig.icon className={cn("w-8 h-8", recConfig.colorClass)} />}
          </div>
          <div className="flex-1">
            <h2 className={cn("text-xl font-bold mb-0.5", recConfig?.colorClass)}>
              {recConfig?.labelMr}
            </h2>
            <p className="text-sm text-muted-foreground">
              {recConfig?.description}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {t('market.intelligence.confidence', 'Confidence')}
            </p>
            <p className={cn("text-xl font-bold", recConfig?.colorClass)}>
              {analysis.confidence}%
            </p>
          </div>
        </div>

        {/* Reasoning */}
        <div className="mt-4 p-3 bg-background/50 rounded-xl">
          <p className="text-sm">{analysis.reasoning}</p>
        </div>
      </motion.div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Price Outlook */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-4 rounded-xl bg-card/50 border border-border/50"
        >
          <div className="flex items-center gap-2 mb-2">
            {getOutlookIcon()}
            <h3 className="text-sm font-semibold">
              किंमत अंदाज
            </h3>
          </div>
          {analysis.expectedPriceRange && (
            <p className="text-base font-medium">
              ₹{analysis.expectedPriceRange.min?.toLocaleString('en-IN')} - ₹{analysis.expectedPriceRange.max?.toLocaleString('en-IN')}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            {analysis.priceOutlook === 'up' ? 'वाढ अपेक्षित' : analysis.priceOutlook === 'down' ? 'घट अपेक्षित' : 'स्थिर'}
          </p>
        </motion.div>

        {/* Best Time to Sell */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-4 rounded-xl bg-card/50 border border-border/50"
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold">
              विक्रीची वेळ
            </h3>
          </div>
          <p className="text-base font-medium">
            {analysis.bestTimeToSell || 'लवकरात लवकर'}
          </p>
        </motion.div>
      </div>

      {/* Best Markets */}
      {analysis.bestMarkets && analysis.bestMarkets.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-4 rounded-xl bg-card/50 border border-border/50"
        >
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold">
              विक्रीसाठी सर्वोत्तम बाजार
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {analysis.bestMarkets.map((market, index) => (
              <span 
                key={index}
                className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium"
              >
                {market}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Tips */}
      {analysis.tips && analysis.tips.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="p-4 rounded-xl bg-gradient-to-br from-accent/5 to-primary/5 border border-accent/20"
        >
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-accent" />
            <h3 className="text-sm font-semibold">
              तुमच्यासाठी टिप्स
            </h3>
          </div>
          <ul className="space-y-2">
            {analysis.tips.map((tip, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">
                  {index + 1}
                </span>
                <span className="text-sm">{tip}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Refresh Button */}
      <div className="text-center">
        <Button 
          onClick={onGetAdvice}
          variant="outline"
          size="sm"
          className="rounded-xl"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Brain className="w-4 h-4 mr-2" />
          )}
          पुन्हा विश्लेषण करा
        </Button>
      </div>
    </div>
  );
}
