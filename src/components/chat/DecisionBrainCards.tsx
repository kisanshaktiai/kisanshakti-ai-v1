import React from 'react';
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

export interface ActionItem {
  action: string;
  reason: string;
  timing?: string;
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

// ═══════════════════════════════════════════════════════════════════════════
// TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const LABELS: Record<string, Record<string, string>> = {
  en: {
    landContext: 'Your Field',
    whatToDoNow: '✅ What to Do Now',
    whatToDoNext: '🟡 What to Do Next',
    whatNotToDo: '❌ What NOT to Do',
    confidence: 'Confidence',
    source: 'Source',
    timing: 'Timing',
    reason: 'Reason',
    whyNot: 'Why Not',
    crop: 'Crop',
    stage: 'Stage',
    area: 'Area',
    soil: 'Soil',
    weather: 'Weather',
    ndvi: 'Health',
    rulesApplied: 'rules applied',
    decisionBrain: '🧠 Decision Brain'
  },
  hi: {
    landContext: 'आपका खेत',
    whatToDoNow: '✅ अभी क्या करें',
    whatToDoNext: '🟡 आगे क्या करें',
    whatNotToDo: '❌ क्या न करें',
    confidence: 'विश्वसनीयता',
    source: 'स्रोत',
    timing: 'समय',
    reason: 'कारण',
    whyNot: 'क्यों नहीं',
    crop: 'फसल',
    stage: 'अवस्था',
    area: 'क्षेत्र',
    soil: 'मिट्टी',
    weather: 'मौसम',
    ndvi: 'स्वास्थ्य',
    rulesApplied: 'नियम लागू',
    decisionBrain: '🧠 निर्णय मस्तिष्क'
  },
  mr: {
    landContext: 'तुमचे शेत',
    whatToDoNow: '✅ आता काय करावे',
    whatToDoNext: '🟡 पुढे काय करावे',
    whatNotToDo: '❌ काय करू नये',
    confidence: 'विश्वासार्हता',
    source: 'स्रोत',
    timing: 'वेळ',
    reason: 'कारण',
    whyNot: 'का नाही',
    crop: 'पीक',
    stage: 'अवस्था',
    area: 'क्षेत्र',
    soil: 'माती',
    weather: 'हवामान',
    ndvi: 'आरोग्य',
    rulesApplied: 'नियम लागू',
    decisionBrain: '🧠 निर्णय मेंदू'
  }
};

const getLabels = (lang: string) => LABELS[lang] || LABELS.en;

// ═══════════════════════════════════════════════════════════════════════════
// LAND CONTEXT CARD
// ═══════════════════════════════════════════════════════════════════════════

interface LandContextCardProps {
  context: LandContextDisplay;
  language: string;
}

export function LandContextSummaryCard({ context, language }: LandContextCardProps) {
  const labels = getLabels(language);
  
  const getNdviColor = (state?: string) => {
    if (!state) return 'bg-muted';
    if (state.includes('HEALTHY') || state.includes('GOOD')) return 'bg-success/20 text-success';
    if (state.includes('STRESS') || state.includes('MODERATE')) return 'bg-warning/20 text-warning';
    return 'bg-destructive/20 text-destructive';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg p-3 border border-primary/20"
    >
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm text-foreground">{labels.landContext}</span>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Crop Info */}
        <div className="flex items-center gap-1.5">
          <Wheat className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">{labels.crop}:</span>
          <span className="font-medium">{context.cropName}</span>
        </div>
        
        {/* Stage */}
        <div className="flex items-center gap-1.5">
          <Sprout className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">{labels.stage}:</span>
          <span className="font-medium">{context.growthStage}</span>
        </div>
        
        {/* Area - Show in Gunta or Acre */}
        {(context.landAreaGunta || context.landAreaAcre || context.landArea) && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{labels.area}:</span>
            <span className="font-medium">
              {context.landAreaGunta 
                ? `${context.landAreaGunta} गुंठा` 
                : context.landAreaAcre 
                  ? `${context.landAreaAcre.toFixed(2)} एकर`
                  : context.landArea}
            </span>
          </div>
        )}
        
        {/* NDVI Health */}
        {context.ndviState && (
          <div className="flex items-center gap-1.5">
            <Gauge className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{labels.ndvi}:</span>
            <Badge variant="secondary" className={cn("text-xs py-0", getNdviColor(context.ndviState))}>
              {context.ndviState.replace(/_/g, ' ')}
              {context.ndviTrend === 'DECLINING' && <TrendingDown className="h-3 w-3 ml-1" />}
              {context.ndviTrend === 'IMPROVING' && <TrendingUp className="h-3 w-3 ml-1" />}
            </Badge>
          </div>
        )}
        
        {/* Weather */}
        {context.weather && (
          <div className="flex items-center gap-1.5 col-span-2">
            <Thermometer className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{context.weather.temperature}°C</span>
            <span className="text-muted-foreground">|</span>
            <span className="font-medium">{context.weather.humidity}%</span>
            {context.weather.rainExpected && (
              <>
                <span className="text-muted-foreground">|</span>
                <CloudRain className="h-3 w-3 text-info" />
                <span className="text-info font-medium">Rain</span>
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
  const labels = getLabels(language);
  
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
          <div className="font-semibold text-sm text-foreground">{action.action}</div>
          <p className="text-xs text-muted-foreground mt-1">{action.reason}</p>
          
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {action.timing && (
              <Badge variant="outline" className="text-xs gap-1">
                <Timer className="h-3 w-3" />
                {action.timing}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs gap-1 bg-success/20 text-success">
              <BookOpen className="h-3 w-3" />
              {action.ruleSources.join(' + ')}
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
  const labels = getLabels(language);
  
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
          <div className="font-semibold text-sm text-foreground">{action.action}</div>
          <p className="text-xs text-muted-foreground mt-1">{action.reason}</p>
          
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {action.timing && (
              <Badge variant="outline" className="text-xs gap-1">
                <Timer className="h-3 w-3" />
                {action.timing}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs gap-1 bg-warning/20 text-warning">
              <BookOpen className="h-3 w-3" />
              {action.ruleSources.join(' + ')}
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
  const labels = getLabels(language);
  
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
              {blockedAction.blockedByRules.join(', ')}
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
  const labels = getLabels(language);
  
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'LOW': return 'bg-success text-success-foreground';
      case 'MEDIUM': return 'bg-warning text-warning-foreground';
      case 'HIGH': return 'bg-orange-500 text-white';
      case 'CRITICAL': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };
  
  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.8) return 'text-success';
    if (conf >= 0.6) return 'text-warning';
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
            {Math.round(confidence.confidence * 100)}%
          </span>
        </div>
        <Badge className={cn("text-xs", getRiskColor(confidence.riskLevel))}>
          {confidence.riskLevel} Risk
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
  const labels = getLabels(response.language);
  
  return (
    <div className="space-y-3 p-3">
      {/* Land Context */}
      {response.landContext && (
        <LandContextSummaryCard context={response.landContext} language={response.language} />
      )}
      
      {/* Farmer-Friendly Message */}
      {response.farmerMessage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-foreground leading-relaxed bg-card/50 rounded-lg p-3 border border-border/30"
        >
          {response.farmerMessage}
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
