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
          color: 'text-green-500',
          bg: 'bg-green-500/10',
          border: 'border-green-500/20',
          label: t('market.intelligence.sellNow', 'Sell Now'),
          description: t('market.intelligence.sellNowDesc', 'Market conditions are favorable')
        };
      case 'WAIT':
        return {
          icon: PauseCircle,
          color: 'text-yellow-500',
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/20',
          label: t('market.intelligence.wait', 'Wait'),
          description: t('market.intelligence.waitDesc', 'Better prices expected soon')
        };
      case 'HOLD':
        return {
          icon: AlertCircle,
          color: 'text-orange-500',
          bg: 'bg-orange-500/10',
          border: 'border-orange-500/20',
          label: t('market.intelligence.hold', 'Hold'),
          description: t('market.intelligence.holdDesc', 'Monitor market closely')
        };
      default:
        return null;
    }
  };

  const getOutlookIcon = () => {
    if (!analysis) return null;
    if (analysis.priceOutlook === 'up') return <TrendingUp className="w-5 h-5 text-green-500" />;
    if (analysis.priceOutlook === 'down') return <TrendingDown className="w-5 h-5 text-red-500" />;
    return <Minus className="w-5 h-5 text-yellow-500" />;
  };

  if (!selectedCrop) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-12 bg-card/30 rounded-3xl border border-border/50"
      >
        <Brain className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold mb-2">
          {t('market.intelligence.selectCropForAI', 'Select a Crop for AI Analysis')}
        </h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
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
        className="text-center py-12 bg-gradient-to-br from-primary/5 to-accent/5 rounded-3xl border border-primary/20"
      >
        <div className="p-4 rounded-2xl bg-primary/10 w-fit mx-auto mb-4">
          <Brain className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">
          {t('market.intelligence.getAIInsights', 'Get AI Selling Insights')}
        </h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
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
    <div className="space-y-6">
      {/* Main Recommendation Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "relative overflow-hidden rounded-3xl p-6",
          recConfig?.bg,
          "border",
          recConfig?.border
        )}
      >
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-white/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
        
        <div className="flex items-start gap-4">
          <div className={cn("p-3 rounded-2xl", recConfig?.bg)}>
            {recConfig?.icon && <recConfig.icon className={cn("w-8 h-8", recConfig.color)} />}
          </div>
          <div className="flex-1">
            <h2 className={cn("text-2xl font-bold mb-1", recConfig?.color)}>
              {recConfig?.label}
            </h2>
            <p className="text-muted-foreground">
              {recConfig?.description}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">
              {t('market.intelligence.confidence', 'Confidence')}
            </p>
            <p className={cn("text-2xl font-bold", recConfig?.color)}>
              {analysis.confidence}%
            </p>
          </div>
        </div>

        {/* Reasoning */}
        <div className="mt-4 p-4 bg-background/50 rounded-2xl">
          <p className="text-sm">{analysis.reasoning}</p>
        </div>
      </motion.div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Price Outlook */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-5 rounded-2xl bg-card/50 border border-border/50"
        >
          <div className="flex items-center gap-2 mb-3">
            {getOutlookIcon()}
            <h3 className="font-semibold">
              {t('market.intelligence.priceOutlook', 'Price Outlook')}
            </h3>
          </div>
          {analysis.expectedPriceRange && (
            <p className="text-lg font-medium">
              ₹{analysis.expectedPriceRange.min?.toLocaleString('en-IN')} - ₹{analysis.expectedPriceRange.max?.toLocaleString('en-IN')}
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-1 capitalize">
            {t(`market.intelligence.outlook.${analysis.priceOutlook}`, analysis.priceOutlook)}
          </p>
        </motion.div>

        {/* Best Time to Sell */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-5 rounded-2xl bg-card/50 border border-border/50"
        >
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">
              {t('market.intelligence.bestTime', 'Best Time to Sell')}
            </h3>
          </div>
          <p className="text-lg font-medium">
            {analysis.bestTimeToSell || t('market.intelligence.asap', 'As soon as possible')}
          </p>
        </motion.div>
      </div>

      {/* Best Markets */}
      {analysis.bestMarkets && analysis.bestMarkets.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-5 rounded-2xl bg-card/50 border border-border/50"
        >
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">
              {t('market.intelligence.bestMarkets', 'Best Markets to Sell')}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {analysis.bestMarkets.map((market, index) => (
              <span 
                key={index}
                className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium"
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
          className="p-5 rounded-2xl bg-gradient-to-br from-accent/5 to-primary/5 border border-accent/20"
        >
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-accent" />
            <h3 className="font-semibold">
              {t('market.intelligence.tips', 'Tips for You')}
            </h3>
          </div>
          <ul className="space-y-3">
            {analysis.tips.map((tip, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">
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
          className="rounded-xl"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Brain className="w-4 h-4 mr-2" />
          )}
          {t('market.intelligence.refreshAnalysis', 'Refresh Analysis')}
        </Button>
      </div>
    </div>
  );
}
