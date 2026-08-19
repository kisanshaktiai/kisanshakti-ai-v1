import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  Droplet, Leaf, Bug, AlertTriangle, CheckCircle, Info, 
  FlaskConical, Sprout, Timer, BookOpen, Shield, XCircle,
  Thermometer, CloudRain, MapPin, Wheat, TrendingUp, TrendingDown,
  Gauge, ChevronRight, AlertOctagon
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface LandContextDisplay {
  cropName: string;
  cropGroup: string;
  growthStage: string;
  landArea: string; // Formatted as "X Gunta" or "X.X Acre"
  landAreaGunta?: number;
  landAreaAcre?: number;
  soilStatus?: {
    nitrogen: string;
    phosphorus: string;
    potassium: string;
    ph?: string;
    moisture?: string;
  };
  ndviState?: string;
  ndviTrend?: string;
  ndviValue?: number;
  weather?: {
    temperature: number;
    humidity: number;
    rainExpected: boolean;
  };
  farmingMode?: string;
  daysAfterSowing?: number;
}

import { safeString } from './utils/safe-render';

export interface ActionItem {
  action: string;
  reason: string;
  timing?: string | Record<string, unknown>;
  ruleSources: string[];
  priority: number;
}

export interface BlockedAction {
  action: string;
  whyNot: string;
  blockedByRules: string[];
}

export interface ConfidenceInfo {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  explanations: string[];
  rulesApplied: number;
}

export interface DecisionBrainResponse {
  landContext?: LandContextDisplay;
  primaryActions: ActionItem[];
  secondaryActions: ActionItem[];
  blockedActions: BlockedAction[];
  confidence: ConfidenceInfo;
  farmerMessage: string;
  language: string;
}

// Labels are now loaded from i18n via useTranslation

const getLabels = (t: (key: string) => string) => ({
  landContext: t('chatCards.cards.landContext'),
  whatToDoNow: t('chatCards.cards.whatToDoNow'),
  whatToDoNext: t('chatCards.cards.whatToDoNext'),
  whatNotToDo: t('chatCards.cards.whatNotToDo'),
  confidence: t('chatCards.cards.confidence'),
  source: t('chatCards.cards.source'),
  timing: t('chatCards.cards.timing'),
  reason: t('chatCards.cards.reason'),
  whyNot: t('chatCards.cards.whyNot'),
  crop: t('chatCards.cards.crop'),
  stage: t('chatCards.cards.stage'),
  area: t('chatCards.cards.area'),
  soil: t('chatCards.cards.soil'),
  weather: t('chatCards.cards.weather'),
  ndvi: t('chatCards.cards.ndvi'),
  rulesApplied: t('chatCards.cards.rulesApplied'),
  decisionBrain: t('chatCards.cards.decisionBrain'),
});

// ═══════════════════════════════════════════════════════════════════════════
// LAND CONTEXT CARD
// ═══════════════════════════════════════════════════════════════════════════

interface LandContextCardProps {
  context: LandContextDisplay;
  language: string;
}

export function LandContextSummaryCard({ context, language }: LandContextCardProps) {
  const { t } = useTranslation();
  const labels = getLabels(t);
  
  const getNdviColor = (state?: string) => {
    if (!state) return 'bg-muted';
    if (state.includes('HEALTHY') || state.includes('GOOD')) return 'bg-success/20 text-success';
    if (state.includes('STRESS') || state.includes('MODERATE')) return 'bg-warning/20 text-warning';
    return 'bg-destructive/20 text-destructive';
  };
  
  // Get localized area display
  const getAreaDisplay = () => {
    if (context.landAreaGunta) {
      const areaUnits: Record<string, string> = { en: 'gunta', hi: 'गुंठा', mr: 'गुंठा', ta: 'குந்தா', te: 'గుంట', kn: 'ಗುಂಟ' };
      const unit = areaUnits[language] || areaUnits.en;
      return `${context.landAreaGunta} ${unit}`;
    }
    if (context.landAreaAcre) {
      const acreUnits: Record<string, string> = { en: 'acre', hi: 'एकड़', mr: 'एकर', ta: 'ஏக்கர்', te: 'ఎకరం', kn: 'ಎಕರೆ' };
      const unit = acreUnits[language] || acreUnits.en;
      return `${context.landAreaAcre.toFixed(2)} ${unit}`;
    }
    return context.landArea;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-xl p-3 border border-primary/20 overflow-hidden"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-primary/20 shrink-0">
          <MapPin className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold text-sm text-foreground truncate">{labels.landContext}</span>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Crop Info */}
        <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2 py-1.5 min-w-0">
          <Wheat className="h-3.5 w-3.5 text-warning shrink-0" />
          <span className="font-medium truncate">{context.cropName}</span>
        </div>
        
        {/* Stage */}
        <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2 py-1.5 min-w-0">
          <Sprout className="h-3.5 w-3.5 text-success shrink-0" />
          <span className="font-medium truncate">{context.growthStage}</span>
        </div>
        
        {/* Area - Show in Gunta or Acre */}
        {(context.landAreaGunta || context.landAreaAcre || context.landArea) && (
          <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2 py-1.5 min-w-0">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{getAreaDisplay()}</span>
          </div>
        )}
        
        {/* NDVI Health */}
        {context.ndviState && (
          <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2 py-1.5 min-w-0">
            <Gauge className="h-3.5 w-3.5 text-success shrink-0" />
            <Badge variant="secondary" className={cn("text-xs py-0 truncate", getNdviColor(context.ndviState))}>
              {context.ndviValue ? `${Math.round(context.ndviValue * 100)}%` : context.ndviState.replace(/_/g, ' ')}
              {context.ndviTrend === 'DECLINING' && <TrendingDown className="h-3 w-3 ml-1 shrink-0" />}
              {context.ndviTrend === 'IMPROVING' && <TrendingUp className="h-3 w-3 ml-1 shrink-0" />}
            </Badge>
          </div>
        )}
        
        {/* Weather */}
        {context.weather && (
          <div className="flex items-center gap-1.5 col-span-2 bg-background/50 rounded-lg px-2 py-1.5">
            <Thermometer className="h-3.5 w-3.5 text-warning shrink-0" />
            <span className="font-medium">{context.weather.temperature}°C</span>
            <span className="text-muted-foreground">•</span>
            <span className="font-medium">{context.weather.humidity}%</span>
            {context.weather.rainExpected && (
              <>
                <span className="text-muted-foreground">•</span>
                <CloudRain className="h-3.5 w-3.5 text-info shrink-0" />
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION CARDS
// ═══════════════════════════════════════════════════════════════════════════

interface PrimaryActionCardProps {
  action: ActionItem;
  index: number;
  language: string;
}

export function PrimaryActionCard({ action, index, language }: PrimaryActionCardProps) {
  const { t } = useTranslation();
  const labels = getLabels(t);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-success/10 border-l-4 border-success rounded-r-lg p-3"
    >
      <div className="flex items-start gap-2">
        <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground">{safeString(action.action)}</div>
          <p className="text-xs text-muted-foreground mt-1">{safeString(action.reason)}</p>
          
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {action.timing && (
              <Badge variant="outline" className="text-xs gap-1">
                <Timer className="h-3 w-3" />
                {safeString(action.timing)}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs gap-1 bg-success/20 text-success">
              <BookOpen className="h-3 w-3" />
              {Array.isArray(action.ruleSources) ? action.ruleSources.join(' + ') : ''}
            </Badge>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface SecondaryActionCardProps {
  action: ActionItem;
  index: number;
  language: string;
}

export function SecondaryActionCard({ action, index, language }: SecondaryActionCardProps) {
  const { t } = useTranslation();
  const labels = getLabels(t);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 + 0.2 }}
      className="bg-warning/10 border-l-4 border-warning rounded-r-lg p-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground">{safeString(action.action)}</div>
          <p className="text-xs text-muted-foreground mt-1">{safeString(action.reason)}</p>
          
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {action.timing && (
              <Badge variant="outline" className="text-xs gap-1">
                <Timer className="h-3 w-3" />
                {safeString(action.timing)}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs gap-1 bg-warning/20 text-warning">
              <BookOpen className="h-3 w-3" />
              {Array.isArray(action.ruleSources) ? action.ruleSources.join(' + ') : ''}
            </Badge>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface BlockedActionCardProps {
  blockedAction: BlockedAction;
  index: number;
  language: string;
}

export function BlockedActionCard({ blockedAction, index, language }: BlockedActionCardProps) {
  const { t } = useTranslation();
  const labels = getLabels(t);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 + 0.4 }}
      className="bg-destructive/10 border-l-4 border-destructive rounded-r-lg p-3"
    >
      <div className="flex items-start gap-2">
        <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground line-through decoration-destructive/50">
            {blockedAction.action}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-medium text-destructive">{labels.whyNot}:</span> {blockedAction.whyNot}
          </p>
          
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs gap-1 bg-destructive/20 text-destructive">
              <AlertOctagon className="h-3 w-3" />
              {Array.isArray(blockedAction.blockedByRules) ? blockedAction.blockedByRules.join(', ') : ''}
            </Badge>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE INDICATOR
// ═══════════════════════════════════════════════════════════════════════════

interface ConfidenceIndicatorProps {
  confidence: ConfidenceInfo;
  language: string;
}

export function ConfidenceIndicator({ confidence, language }: ConfidenceIndicatorProps) {
  const { t } = useTranslation();
  const labels = getLabels(t);
  
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'LOW': return 'bg-success text-success-foreground';
      case 'MEDIUM': return 'bg-warning text-warning-foreground';
      case 'HIGH': return 'bg-warning text-white';
      case 'CRITICAL': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };
  
  // FIXED: confidence.confidence is already 0-100 (not 0-1), so don't multiply again!
  const getConfidenceColor = (conf: number) => {
    if (conf >= 80) return 'text-success';
    if (conf >= 60) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-muted/50 rounded-lg p-3 mt-2"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">{labels.confidence}:</span>
          <span className={cn("text-sm font-bold", getConfidenceColor(confidence.confidence))}>
            {Math.min(100, Math.max(0, Math.round(confidence.confidence)))}%
          </span>
        </div>
        <Badge className={cn("text-xs", getRiskColor(confidence.riskLevel))}>
          {confidence.riskLevel} {t('chatCards.cards.risk')}
        </Badge>
      </div>
      
      <div className="text-xs text-muted-foreground">
        <span className="font-medium">{labels.decisionBrain}</span>
        <span className="mx-1">•</span>
        <span>{confidence.rulesApplied} {labels.rulesApplied}</span>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DECISION BRAIN CARDS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface DecisionBrainCardsProps {
  response: DecisionBrainResponse;
}

export function DecisionBrainCards({ response }: DecisionBrainCardsProps) {
  const { t } = useTranslation();
  const labels = getLabels(t);
  
  // TRUE-DEGENERATE SUPPRESSION: hide only when there is genuinely nothing to show.
  // Low confidence alone NEVER hides a card.
  const normalizedConfidence = Number(response.confidence?.confidence) || 0;
  const rulesApplied = Number(response.confidence?.rulesApplied) || 0;
  const hasRealActions = (response.primaryActions || []).some(
    (a) => typeof a?.action === 'string' && a.action.trim().length > 0
  );
  if (normalizedConfidence === 0 && rulesApplied === 0 && !hasRealActions) {
    return null;
  }
  
  return (
    <div className="w-full max-w-full overflow-hidden space-y-3 p-3">
      {/* Land Context */}
      {response.landContext && (
        <LandContextSummaryCard context={response.landContext} language={response.language} />
      )}
      
      {/* Farmer-Friendly Message */}
      {response.farmerMessage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-foreground leading-relaxed bg-card/50 rounded-xl p-3 border border-border/30 break-words"
        >
          {safeString(response.farmerMessage)}
        </motion.div>
      )}
      
      {/* Primary Actions - What to do NOW */}
      {response.primaryActions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-success flex items-center gap-1.5">
            {labels.whatToDoNow}
          </h4>
          {response.primaryActions.map((action, idx) => (
            <PrimaryActionCard key={idx} action={action} index={idx} language={response.language} />
          ))}
        </div>
      )}
      
      {/* Secondary Actions - What to do NEXT */}
      {response.secondaryActions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-warning flex items-center gap-1.5">
            {labels.whatToDoNext}
          </h4>
          {response.secondaryActions.map((action, idx) => (
            <SecondaryActionCard key={idx} action={action} index={idx} language={response.language} />
          ))}
        </div>
      )}
      
      {/* Blocked Actions - What NOT to do */}
      {response.blockedActions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-destructive flex items-center gap-1.5">
            {labels.whatNotToDo}
          </h4>
          {response.blockedActions.map((blocked, idx) => (
            <BlockedActionCard key={idx} blockedAction={blocked} index={idx} language={response.language} />
          ))}
        </div>
      )}
      
      {/* Confidence Indicator */}
      <ConfidenceIndicator confidence={response.confidence} language={response.language} />
    </div>
  );
}
