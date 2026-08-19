// DEPRECATED — not mounted anywhere. Do not edit for chat fixes.
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARMER MESSAGE CARD - Structured Response Renderer
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Renders the structured farmer message JSON format as a beautiful,
 * literacy-adapted, mobile-friendly card.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Shield, 
  Calendar,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Leaf,
  Droplets,
  Bug,
  Heart
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { safeString, safeStringArray } from '../utils/safe-render';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FarmerMessage {
  language: string;
  literacy_adapted: boolean;
  greeting: string;
  
  problem_summary: {
    text: string;
    severity_indication: string;
    urgency: string;
  };
  
  cause_explanation: {
    text: string;
    contributing_factors: string[];
    why_now: string;
  };
  
  recommended_solution: {
    main_action: {
      title: string;
      what_to_use: string;
      how_much_land: string;
      when: string;
      why_this_time: string;
      how_to_apply: string;
    };
    supporting_actions: Array<{
      action: string;
      details: string;
      reason: string;
    }>;
    why_not_other_solutions: string;
  };
  
  safety_precautions: {
    mandatory: string[];
    important: string[];
    emergency: string;
  };
  
  follow_up: {
    day_3: string;
    day_5: string;
    day_7: string;
    alert_condition: string;
  };
  
  confidence_disclosure: {
    confidence_label: 'HIGH_CONFIDENCE' | 'GOOD_CONFIDENCE' | 'MODERATE_CONFIDENCE' | 'LOW_CONFIDENCE';
    message: string;
  };
  
  closing: string;
}

interface FarmerMessageCardProps {
  message: FarmerMessage;
  rawText?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const SeverityBadge: React.FC<{ severity: string; language: string }> = ({ severity, language }) => {
  const severityColors: Record<string, string> = {
    'अत्यंत गंभीर': 'bg-destructive/20 text-destructive border-destructive/30',
    'गंभीर': 'bg-warning/20 text-warning dark:text-warning border-warning/30',
    'मध्यम': 'bg-warning/20 text-warning dark:text-warning border-warning/30',
    'कमी': 'bg-success/20 text-success border-success/30',
    'critical': 'bg-destructive/20 text-destructive border-destructive/30',
    'serious': 'bg-warning/20 text-warning dark:text-warning border-warning/30',
    'moderate': 'bg-warning/20 text-warning dark:text-warning border-warning/30',
    'minor': 'bg-success/20 text-success border-success/30',
  };
  
  const colorClass = Object.entries(severityColors).find(([key]) => 
    severity.toLowerCase().includes(key.toLowerCase())
  )?.[1] || 'bg-muted text-muted-foreground border-muted';
  
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', colorClass)}>
      {severity}
    </Badge>
  );
};

const ConfidenceBadge: React.FC<{ label: FarmerMessage['confidence_disclosure']['confidence_label'] }> = ({ label }) => {
  const colors: Record<string, string> = {
    'HIGH_CONFIDENCE': 'bg-success/20 text-success border-success/30',
    'GOOD_CONFIDENCE': 'bg-primary/20 text-primary border-primary/30',
    'MODERATE_CONFIDENCE': 'bg-warning/20 text-warning dark:text-warning border-warning/30',
    'LOW_CONFIDENCE': 'bg-muted text-muted-foreground border-muted',
  };
  
  const icons: Record<string, React.ReactNode> = {
    'HIGH_CONFIDENCE': <CheckCircle className="h-3 w-3" />,
    'GOOD_CONFIDENCE': <CheckCircle className="h-3 w-3" />,
    'MODERATE_CONFIDENCE': <AlertTriangle className="h-3 w-3" />,
    'LOW_CONFIDENCE': <AlertTriangle className="h-3 w-3" />,
  };
  
  return (
    <Badge variant="outline" className={cn('text-xs font-medium flex items-center gap-1', colors[label])}>
      {icons[label]}
      {label.replace(/_/g, ' ')}
    </Badge>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function FarmerMessageCard({ message, rawText }: FarmerMessageCardProps) {
  const [safetyOpen, setSafetyOpen] = React.useState(false);
  const [followUpOpen, setFollowUpOpen] = React.useState(false);
  const { t } = useTranslation();
  
  const hasProblem = message.problem_summary.text && 
    !message.problem_summary.text.includes('निरोगी') && 
    !message.problem_summary.text.includes('स्वस्थ') &&
    !message.problem_summary.text.includes('healthy');
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3 p-4"
    >
      {/* Greeting */}
      <div className="flex items-center gap-2">
        <Leaf className="h-5 w-5 text-primary" />
        <span className="text-lg font-semibold text-foreground">
          {safeString(message.greeting)}
        </span>
      </div>
      
      {/* Problem Summary */}
      <div className={cn(
        "rounded-xl p-4 border",
        hasProblem 
          ? "bg-destructive/5 border-destructive/20" 
          : "bg-success/5 border-success/20"
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            hasProblem ? "bg-destructive/10" : "bg-success/10"
          )}>
            {hasProblem ? (
              <Bug className="h-5 w-5 text-destructive" />
            ) : (
              <Heart className="h-5 w-5 text-success" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-base font-medium text-foreground leading-relaxed">
              {safeString(message.problem_summary.text)}
            </p>
            {hasProblem && message.problem_summary.severity_indication && (
              <div className="flex flex-wrap gap-2">
                <SeverityBadge 
                  severity={safeString(message.problem_summary.severity_indication)} 
                  language={message.language} 
                />
              </div>
            )}
            {message.problem_summary.urgency && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {safeString(message.problem_summary.urgency)}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Cause Explanation */}
      {hasProblem && message.cause_explanation.text && (
        <div className="rounded-xl p-4 bg-card border border-border">
          <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            {t('chatCards.cards.cause')}
          </h4>
          <p className="text-base text-foreground leading-relaxed">
            {safeString(message.cause_explanation.text)}
          </p>
          {message.cause_explanation.contributing_factors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {message.cause_explanation.contributing_factors.map((factor, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary">•</span>
                  {safeString(factor)}
                </li>
              ))}
            </ul>
          )}
          {message.cause_explanation.why_now && (
            <p className="mt-2 text-sm text-primary/80 italic">
              {safeString(message.cause_explanation.why_now)}
            </p>
          )}
        </div>
      )}
      
      {/* Main Action */}
      {message.recommended_solution.main_action.title && (
        <div className="rounded-xl p-4 bg-primary/5 border border-primary/20">
          <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
            <Droplets className="h-4 w-4" />
            {t('chatCards.cards.solution')}
          </h4>
          
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-medium">
                1
              </span>
              <span className="font-semibold text-foreground">
                {safeString(message.recommended_solution.main_action.title)}
              </span>
            </div>
            
            {message.recommended_solution.main_action.what_to_use && (
              <div className="pl-6 space-y-1 text-sm">
                <p className="text-foreground">
                  <span className="text-muted-foreground">
                    {t('chatCards.cards.whatToUse')}:
                  </span>
                  {safeString(message.recommended_solution.main_action.what_to_use)}
                </p>
                {message.recommended_solution.main_action.how_much_land && (
                  <p className="text-foreground">
                    <span className="text-muted-foreground">
                      {t('chatCards.cards.forArea')}:
                    </span>
                    {safeString(message.recommended_solution.main_action.how_much_land)}
                  </p>
                )}
                {message.recommended_solution.main_action.when && (
                  <p className="text-foreground">
                    <span className="text-muted-foreground">
                      {t('chatCards.cards.when')}:
                    </span>
                    {safeString(message.recommended_solution.main_action.when)}
                  </p>
                )}
                {message.recommended_solution.main_action.how_to_apply && (
                  <p className="text-foreground">
                    <span className="text-muted-foreground">
                      {t('chatCards.cards.howToApply')}:
                    </span>
                    {safeString(message.recommended_solution.main_action.how_to_apply)}
                  </p>
                )}
              </div>
            )}
            
            {/* Supporting Actions */}
            {message.recommended_solution.supporting_actions.map((action, idx) => (
              <div key={idx} className="pl-6 mt-2">
                <div className="flex items-center gap-2">
                  <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full font-medium">
                    {idx + 2}
                  </span>
                  <span className="font-medium text-foreground">{safeString(action.action)}</span>
                </div>
                {action.details && (
                  <p className="text-sm text-muted-foreground ml-6">{safeString(action.details)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Safety Precautions (Collapsible) */}
      {message.safety_precautions.mandatory.length > 0 && (
        <Collapsible open={safetyOpen} onOpenChange={setSafetyOpen}>
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between p-3 rounded-xl bg-destructive/5 border border-destructive/20 hover:bg-destructive/10 transition-colors">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">
                  {t('chatCards.cards.safety')}
                </span>
              </div>
              {safetyOpen ? (
                <ChevronUp className="h-4 w-4 text-destructive" />
              ) : (
                <ChevronDown className="h-4 w-4 text-destructive" />
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/20 space-y-2">
              {message.safety_precautions.mandatory.map((item, idx) => (
                <p key={idx} className="text-sm text-foreground">{safeString(item)}</p>
              ))}
              {message.safety_precautions.emergency && (
                <p className="text-sm text-destructive font-medium mt-2 pt-2 border-t border-destructive/20">
                  ⚠️ {safeString(message.safety_precautions.emergency)}
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {/* Follow-up (Collapsible) */}
      {message.follow_up.day_3 && (
        <Collapsible open={followUpOpen} onOpenChange={setFollowUpOpen}>
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border hover:bg-muted transition-colors">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  {t('chatCards.cards.followUpCheck')}
                </span>
              </div>
              {followUpOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1 text-sm">
              {message.follow_up.day_3 && <p><strong>{t('chatCards.cards.dayThree')}:</strong> {safeString(message.follow_up.day_3)}</p>}
              {message.follow_up.day_5 && <p><strong>{t('chatCards.cards.dayFive')}:</strong> {safeString(message.follow_up.day_5)}</p>}
              {message.follow_up.day_7 && <p><strong>{t('chatCards.cards.daySeven')}:</strong> {safeString(message.follow_up.day_7)}</p>}
              {message.follow_up.alert_condition && (
                <p className="text-destructive mt-2">{safeString(message.follow_up.alert_condition)}</p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {/* Confidence Disclosure */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <ConfidenceBadge label={message.confidence_disclosure.confidence_label} />
        <p className="text-xs text-muted-foreground max-w-[60%] text-right">
          {safeString(message.confidence_disclosure.message)}
        </p>
      </div>
      
      {/* Closing */}
      <p className="text-sm text-muted-foreground italic text-center pt-2">
        {safeString(message.closing)}
      </p>
    </motion.div>
  );
}