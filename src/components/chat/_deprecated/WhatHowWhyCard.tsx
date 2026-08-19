// DEPRECATED — not mounted anywhere. Do not edit for chat fixes.
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT → HOW → WHY RESPONSE CARD - Mobile-First 2030-Ready UI
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Structured agronomic response following the paradigm:
 * - WHAT: Problem identification (cause, symptoms, confidence)
 * - HOW: Actionable instructions (action_text, dosage, timing)
 * - WHY: Scientific reasoning (reason_text, knowledge_text, source)
 * - NEXT STEPS: Follow-up guidance (photo, monitoring, timeline)
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { safeString } from './utils/safe-render';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Bug, Leaf, Thermometer, Droplet, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp, BookOpen, 
  Clock, Shield, Camera, Beaker, Target, Lightbulb,
  AlertOctagon, Info, Sprout, Activity, ArrowRight
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS - Structured WHAT → HOW → WHY Contract
// ═══════════════════════════════════════════════════════════════════════════

export interface WhatSection {
  cause_name: string;
  cause_code?: string;
  symptoms_observed?: string[];
  confidence: number;
  canonical_group?: string; // 03_pest, 04_disease, 08_stress, etc.
}

export interface HowSection {
  action_text: string;
  dosage?: string;
  timing?: string;
  application_method?: string;
  safety_ppe?: string[];
  ipm_level?: number; // 1=Cultural, 2=Biological, 3=Chemical
  organic_alternative?: string;
}

export interface WhySection {
  reason_text: string;
  knowledge_text?: string;
  scientific_source?: string;
  icar_package_ref?: string;
}

export interface SafetyInfo {
  phi_days?: number;
  bee_toxicity?: 'HIGH' | 'MODERATE' | 'LOW' | 'SAFE';
  farmer_safety_level?: 1 | 2 | 3;
  active_ingredient?: string;
}

export interface NextStepsSection {
  follow_up_days?: number;
  success_indicators?: string[];
  photo_required?: boolean;
  monitoring_frequency?: string;
}

export interface WhatHowWhyResponse {
  what: WhatSection;
  how: HowSection;
  why: WhySection;
  safety?: SafetyInfo;
  next_steps?: NextStepsSection;
  rule_id?: string;
  action_type?: string;
}

export interface WhatHowWhyCardProps {
  response: WhatHowWhyResponse;
  language?: string;
  isExpanded?: boolean;
  onPhotoRequest?: () => void;
}

// Labels are now loaded from i18n via useTranslation — see WhatHowWhyCard component below

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const getCauseIcon = (canonicalGroup?: string) => {
  if (!canonicalGroup) return <AlertTriangle className="h-5 w-5" />;
  
  if (canonicalGroup.includes('pest') || canonicalGroup === '03_pest') {
    return <Bug className="h-5 w-5" />;
  }
  if (canonicalGroup.includes('disease') || canonicalGroup === '04_disease') {
    return <Activity className="h-5 w-5" />;
  }
  if (canonicalGroup.includes('stress') || canonicalGroup === '08_stress') {
    return <Thermometer className="h-5 w-5" />;
  }
  if (canonicalGroup.includes('nutrition') || canonicalGroup === '05_nutrition') {
    return <Beaker className="h-5 w-5" />;
  }
  if (canonicalGroup.includes('irrigation') || canonicalGroup === '10_irrigation') {
    return <Droplet className="h-5 w-5" />;
  }
  return <Leaf className="h-5 w-5" />;
};

// Using semantic design tokens where possible, with category-specific colors for visual distinction
const getCauseColor = (canonicalGroup?: string): string => {
  if (!canonicalGroup) return 'bg-muted text-muted-foreground';
  
  // Pest = warning-adjacent (orange tones)
  if (canonicalGroup.includes('pest') || canonicalGroup === '03_pest') {
    return 'bg-warning/20 text-warning';
  }
  // Disease = destructive (red tones)
  if (canonicalGroup.includes('disease') || canonicalGroup === '04_disease') {
    return 'bg-destructive/20 text-destructive';
  }
  // Stress = accent/warning
  if (canonicalGroup.includes('stress') || canonicalGroup === '08_stress') {
    return 'bg-accent text-accent-foreground';
  }
  // Nutrition = secondary
  if (canonicalGroup.includes('nutrition') || canonicalGroup === '05_nutrition') {
    return 'bg-secondary text-secondary-foreground';
  }
  // Irrigation = primary
  if (canonicalGroup.includes('irrigation') || canonicalGroup === '10_irrigation') {
    return 'bg-primary/20 text-primary';
  }
  // Default = success (healthy/general)
  return 'bg-success/20 text-success';
};

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 80) return 'text-success';
  if (confidence >= 60) return 'text-warning';
  if (confidence >= 40) return 'text-warning';
  return 'text-destructive';
};

const getBeeIcon = (toxicity?: string) => {
  if (toxicity === 'HIGH') return '🐝⚠️';
  if (toxicity === 'MODERATE') return '🐝';
  return '';
};

const getIPMLabel = (level?: number, labels: Record<string, string> = {}) => {
  switch (level) {
    case 1: return labels.ipmLevel1 || 'Cultural';
    case 2: return labels.ipmLevel2 || 'Biological';
    case 3: return labels.ipmLevel3 || 'Chemical';
    case 4: return labels.ipmLevel4 || 'Integrated';
    default: return null;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  bgColor: string;
  badge?: React.ReactNode;
}

function SectionHeader({ icon, title, subtitle, bgColor, badge }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-2.5 rounded-t-xl", bgColor)}>
      <div className="p-1.5 rounded-lg bg-white/20">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm tracking-wide">{title}</div>
        <div className="text-xs opacity-80">{subtitle}</div>
      </div>
      {badge}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function WhatHowWhyCard({ 
  response, 
  language = 'en',
  isExpanded: initialExpanded = true,
  onPhotoRequest
}: WhatHowWhyCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [showDetails, setShowDetails] = useState(false);
  const { t } = useTranslation();
  
  // Build labels object from i18n for backward compat with helper functions
  const labels: Record<string, string> = {
    what: t('chatCards.cards.what'),
    whatSubtitle: t('chatCards.cards.whatSubtitle'),
    how: t('chatCards.cards.how'),
    howSubtitle: t('chatCards.cards.howSubtitle'),
    why: t('chatCards.cards.why'),
    whySubtitle: t('chatCards.cards.whySubtitle'),
    nextSteps: t('chatCards.cards.nextSteps'),
    confidence: t('chatCards.cards.confidence'),
    organicOption: t('chatCards.cards.organicOption'),
    ppeRequired: t('chatCards.cards.ppeRequired'),
    phiDays: t('chatCards.cards.phiDays'),
    followUp: t('chatCards.cards.followUp'),
    days: t('chatCards.cards.days'),
    takePhoto: t('chatCards.cards.takePhoto'),
    source: t('chatCards.cards.source'),
    ipmLevel1: t('chatCards.cards.ipmLevel1'),
    ipmLevel2: t('chatCards.cards.ipmLevel2'),
    ipmLevel3: t('chatCards.cards.ipmLevel3'),
    ipmLevel4: t('chatCards.cards.ipmLevel4'),
  };
  
  const { what, how, why, safety, next_steps } = response;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full overflow-hidden rounded-xl border border-border/50 bg-card shadow-lg"
    >
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* WHAT SECTION - Problem Identification */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="relative">
        <SectionHeader
          icon={getCauseIcon(what.canonical_group)}
          title={labels.what}
          subtitle={labels.whatSubtitle}
          bgColor={getCauseColor(what.canonical_group)}
          badge={
            <Badge 
              variant="secondary" 
              className={cn("text-xs font-bold", getConfidenceColor(what.confidence))}
            >
              {Math.round(what.confidence)}%
            </Badge>
          }
        />
        
        <div className="px-4 py-3 bg-card">
          <h3 className="font-bold text-lg text-foreground leading-tight">
            {safeString(what.cause_name)}
          </h3>
          
          {what.symptoms_observed && what.symptoms_observed.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {what.symptoms_observed.slice(0, 4).map((symptom, idx) => (
                <Badge 
                  key={idx} 
                  variant="outline" 
                  className="text-xs bg-muted/50"
                >
                  {safeString(symptom)}
                </Badge>
              ))}
              {what.symptoms_observed.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{what.symptoms_observed.length - 4}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HOW SECTION - Actionable Instructions */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="border-t border-border/30">
        <SectionHeader
          icon={<CheckCircle className="h-5 w-5" />}
          title={labels.how}
          subtitle={labels.howSubtitle}
          bgColor="bg-success/20 text-success"
          badge={
            how.ipm_level ? (
              <Badge variant="secondary" className="text-xs bg-success/30">
                {getIPMLabel(how.ipm_level, labels)}
              </Badge>
            ) : undefined
          }
        />
        
        <div className="px-4 py-3 bg-card space-y-3">
          {/* Main Action Text */}
          <p className="text-sm font-medium text-foreground leading-relaxed">
            {safeString(how.action_text) || 'Monitor the situation and report any changes.'}
          </p>
          
          {/* Dosage & Timing Grid */}
          {(how.dosage || how.timing || how.application_method) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {how.dosage && (
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  <Beaker className="h-3.5 w-3.5 text-secondary-foreground" />
                  <span className="font-medium">{safeString(how.dosage)}</span>
                </div>
              )}
              {how.timing && (
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium">{safeString(how.timing)}</span>
                </div>
              )}
            </div>
          )}
          
          {/* Organic Alternative */}
          {how.organic_alternative && (
            <div className="flex items-start gap-2 bg-success/10 rounded-lg px-3 py-2 text-xs">
              <Sprout className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-success">
                  {labels.organicOption}:
                </span>
                <span className="ml-1 text-foreground">{safeString(how.organic_alternative)}</span>
              </div>
            </div>
          )}
          
          {/* Safety PPE */}
          {how.safety_ppe && how.safety_ppe.length > 0 && (
            <div className="flex items-center gap-2 bg-warning/10 rounded-lg px-3 py-2 text-xs">
              <Shield className="h-4 w-4 text-warning shrink-0" />
              <span className="font-medium text-warning">{labels.ppeRequired}:</span>
              <span className="text-foreground">{how.safety_ppe.join(', ')}</span>
            </div>
          )}
        </div>
      </div>
      
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* WHY SECTION - Scientific Reasoning (Collapsible) */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="border-t border-border/30">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full"
        >
          <SectionHeader
            icon={<Lightbulb className="h-5 w-5" />}
            title={labels.why}
            subtitle={labels.whySubtitle}
            bgColor="bg-primary/20 text-primary"
            badge={
              <motion.div
                animate={{ rotate: showDetails ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="h-5 w-5" />
              </motion.div>
            }
          />
        </button>
        
        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 py-3 bg-card space-y-3 text-sm">
                {/* Reason Text */}
                <p className="text-muted-foreground leading-relaxed">
                  {safeString(why.reason_text)}
                </p>
                
                {/* Knowledge Text */}
                {why.knowledge_text && (
                  <div className="bg-primary/5 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5 mb-1 text-primary">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span className="font-semibold">{t('chatCards.cards.scientificBasis')}</span>
                    </div>
                    <p className="text-muted-foreground">{safeString(why.knowledge_text)}</p>
                  </div>
                )}
                
                {/* Source Reference */}
                {(why.scientific_source || why.icar_package_ref) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5" />
                    <span>{labels.source}: {safeString(why.icar_package_ref || why.scientific_source)}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SAFETY & NEXT STEPS FOOTER */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {(safety || next_steps) && (
        <div className="border-t border-border/30 px-4 py-3 bg-muted/30">
          <div className="flex flex-wrap items-center gap-2">
            {/* PHI Days */}
            {safety?.phi_days && (
              <Badge 
                variant="outline" 
                className="text-xs bg-warning/10 text-warning border-warning/30"
              >
                <Clock className="h-3 w-3 mr-1" />
                {safety.phi_days} {labels.phiDays}
              </Badge>
            )}
            
            {/* Bee Toxicity */}
            {safety?.bee_toxicity && safety.bee_toxicity !== 'SAFE' && (
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs",
                  safety.bee_toxicity === 'HIGH' 
                    ? 'bg-destructive/10 text-destructive border-destructive/30'
                    : 'bg-warning/10 text-warning border-warning/30'
                )}
              >
                {getBeeIcon(safety.bee_toxicity)} {safety.bee_toxicity}
              </Badge>
            )}
            
            {/* Follow-up Days */}
            {next_steps?.follow_up_days && (
              <Badge variant="secondary" className="text-xs">
                <ArrowRight className="h-3 w-3 mr-1" />
                {labels.followUp} {next_steps.follow_up_days} {labels.days}
              </Badge>
            )}
            
            {/* Photo Request Button */}
            {next_steps?.photo_required && onPhotoRequest && (
              <Button
                size="sm"
                variant="outline"
                onClick={onPhotoRequest}
                className="h-7 text-xs gap-1.5"
              >
                <Camera className="h-3.5 w-3.5" />
                {labels.takePhoto}
              </Button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: Build WhatHowWhyResponse from Database Rule
// ═══════════════════════════════════════════════════════════════════════════

export function buildWhatHowWhyFromRule(rule: {
  rule_id?: string;
  cause?: string;
  canonical_group?: string;
  action_text?: string;
  reason_text?: string;
  knowledge_text?: string;
  scientific_source?: string;
  icar_package_ref?: string;
  action_type?: string;
  phi_days?: number;
  bee_toxicity?: string;
  ipm_level?: number;
  organic_alternative?: string;
  active_ingredient?: string;
  farmer_safety_level?: number;
  observable_characteristics?: string[] | Record<string, unknown>;
}, confidence: number = 75): WhatHowWhyResponse {
  // Normalize observable_characteristics to array
  const symptoms: string[] = [];
  if (rule.observable_characteristics) {
    if (Array.isArray(rule.observable_characteristics)) {
      symptoms.push(...rule.observable_characteristics.map(s => 
        typeof s === 'string' ? s.replace(/_/g, ' ').toLowerCase() : String(s)
      ));
    } else if (typeof rule.observable_characteristics === 'object') {
      symptoms.push(...Object.keys(rule.observable_characteristics).map(k => 
        k.replace(/_/g, ' ').toLowerCase()
      ));
    }
  }
  
  return {
    what: {
      cause_name: rule.cause || 'Unknown Issue',
      cause_code: rule.rule_id,
      symptoms_observed: symptoms.slice(0, 5),
      confidence: Math.min(100, Math.max(0, confidence)),
      canonical_group: rule.canonical_group?.toLowerCase() || undefined,
    },
    how: {
      action_text: rule.action_text || 'Monitor the situation closely and report any changes.',
      ipm_level: rule.ipm_level as (1 | 2 | 3 | 4) || undefined,
      organic_alternative: rule.organic_alternative,
      safety_ppe: rule.farmer_safety_level && rule.farmer_safety_level >= 2 
        ? ['Gloves', 'Mask', 'Long sleeves']
        : undefined,
    },
    why: {
      reason_text: rule.reason_text || 'Based on observed symptoms and field conditions.',
      knowledge_text: rule.knowledge_text,
      scientific_source: rule.scientific_source,
      icar_package_ref: rule.icar_package_ref,
    },
    safety: {
      phi_days: rule.phi_days,
      bee_toxicity: rule.bee_toxicity as ('HIGH' | 'MODERATE' | 'LOW' | 'SAFE') || undefined,
      farmer_safety_level: rule.farmer_safety_level as (1 | 2 | 3) || undefined,
      active_ingredient: rule.active_ingredient,
    },
    rule_id: rule.rule_id,
    action_type: rule.action_type,
  };
}

export default WhatHowWhyCard;