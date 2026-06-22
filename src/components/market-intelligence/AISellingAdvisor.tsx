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
  PauseCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AISellingAdvisorProps {
  analysis: AIAnalysis | null;
  selectedCrop?: string;
  isLoading: boolean;
  onGetAdvice: () => void;
  embedded?: boolean;
}

export function AISellingAdvisor({
  analysis,
  selectedCrop,
  isLoading,
  onGetAdvice,
  embedded = false,
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
          borderClass: 'border-success/30',
          labelMr: 'आता विका',
          description: 'बाजार चांगला आहे',
        };
      case 'WAIT':
        return {
          icon: PauseCircle,
          colorClass: 'text-warning',
          bgClass: 'bg-warning/10',
          borderClass: 'border-warning/30',
          labelMr: 'थांबा',
          description: 'चांगले भाव अपेक्षित',
        };
      case 'HOLD':
        return {
          icon: AlertCircle,
          colorClass: 'text-warning',
          bgClass: 'bg-warning/10',
          borderClass: 'border-warning/30',
          labelMr: 'धरून ठेवा',
          description: 'बाजारावर लक्ष ठेवा',
        };
      default:
        return null;
    }
  };

  const getOutlookIcon = () => {
    if (!analysis) return null;
    if (analysis.priceOutlook === 'up') return <TrendingUp className="w-4 h-4 text-success" />;
    if (analysis.priceOutlook === 'down')
      return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-warning" />;
  };

  if (!selectedCrop) {
    return (
      <div className="text-center py-8">
        <Brain className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm font-semibold mb-1">AI सल्ल्यासाठी पीक निवडा</p>
        <p className="text-xs text-muted-foreground">
          Choose a crop above to get AI selling advice
        </p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="text-center py-8">
        <div className="p-3 rounded-2xl bg-primary/10 w-fit mx-auto mb-3">
          <Brain className="w-8 h-8 text-primary" />
        </div>
        <p className="text-sm font-semibold mb-2">AI विक्री सल्ला मिळवा</p>
        <Button
          onClick={onGetAdvice}
          className="rounded-2xl h-11 bg-primary text-primary-foreground"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Brain className="w-4 h-4 mr-2" />
          )}
          विश्लेषण करा
        </Button>
      </div>
    );
  }

  const rc = getRecommendationConfig();

  return (
    <div className="space-y-3">
      {/* Main recommendation */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'rounded-2xl p-4 border',
          rc?.bgClass,
          rc?.borderClass,
        )}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={cn('p-2.5 rounded-xl bg-card')}>
            {rc?.icon && <rc.icon className={cn('w-6 h-6', rc.colorClass)} />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={cn('text-lg font-bold leading-tight', rc?.colorClass)}>
              {rc?.labelMr}
            </h2>
            <p className="text-xs text-muted-foreground">{rc?.description}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              विश्वास
            </p>
            <p className={cn('text-lg font-extrabold tabular-nums', rc?.colorClass)}>
              {analysis.confidence}%
            </p>
          </div>
        </div>
        <div className="p-3 bg-card/70 rounded-xl">
          <p className="text-sm leading-relaxed">{analysis.reasoning}</p>
        </div>
      </motion.div>

      {/* Outlook + best time */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-2xl bg-muted/50">
          <div className="flex items-center gap-1.5 mb-1.5">
            {getOutlookIcon()}
            <h4 className="text-xs font-semibold">किंमत अंदाज</h4>
          </div>
          {analysis.expectedPriceRange && (
            <p className="text-sm font-bold tabular-nums">
              ₹{analysis.expectedPriceRange.min?.toLocaleString('en-IN')} – ₹
              {analysis.expectedPriceRange.max?.toLocaleString('en-IN')}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {analysis.priceOutlook === 'up'
              ? 'वाढ अपेक्षित'
              : analysis.priceOutlook === 'down'
                ? 'घट अपेक्षित'
                : 'स्थिर'}
          </p>
        </div>

        <div className="p-3 rounded-2xl bg-muted/50">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-semibold">विक्रीची वेळ</h4>
          </div>
          <p className="text-sm font-bold">
            {analysis.bestTimeToSell || 'लवकरात लवकर'}
          </p>
        </div>
      </div>

      {/* Best markets */}
      {analysis.bestMarkets && analysis.bestMarkets.length > 0 && (
        <div className="p-3 rounded-2xl bg-muted/50">
          <div className="flex items-center gap-1.5 mb-2">
            <MapPin className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-semibold">सर्वोत्तम बाजार</h4>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.bestMarkets.map((m, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {analysis.tips && analysis.tips.length > 0 && (
        <div className="p-3 rounded-2xl bg-accent/5 border border-accent/20">
          <div className="flex items-center gap-1.5 mb-2">
            <Lightbulb className="w-4 h-4 text-accent" />
            <h4 className="text-xs font-semibold">टिप्स</h4>
          </div>
          <ul className="space-y-2">
            {analysis.tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm leading-snug">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button
        onClick={onGetAdvice}
        variant="outline"
        className="w-full rounded-2xl h-11"
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Brain className="w-4 h-4 mr-2" />
        )}
        पुन्हा विश्लेषण
      </Button>
    </div>
  );
}
