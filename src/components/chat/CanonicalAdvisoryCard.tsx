import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, Shield, Thermometer, DollarSign, 
  Activity, Microscope, ChevronDown, ChevronUp,
  Leaf, Bug, Droplets, Beaker, Eye, FlaskConical,
  CheckCircle2, XCircle, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — mirrors backend CanonicalFarmerAdvisory
// ═══════════════════════════════════════════════════════════════════════════

export interface CanonicalFarmerAdvisory {
  version: string;
  diagnosis: {
    problem: string;
    category: string;
    rule_id: string;
    confidence_score: number;
    response_decision: 'TREAT' | 'MONITOR' | 'CLARIFY';
    risk_level?: string;
  };
  explanation: {
    what_is_happening: string;
    why_it_happens: string;
    scientific_basis?: string;
  };
  symptoms_to_confirm: string[];
  treatment: {
    action_type: string;
    immediate_action: string;
    treatment_type?: string;
    is_treatment: boolean;
    organic_solution?: string;
    chemical_solution?: {
      active_ingredient?: string;
      chemical_class?: string;
      mode_of_action?: string;
      resistance_group?: string;
    };
    dosage?: {
      per_acre: string;
      total?: string;
      land_area_acres?: number;
      water_volume_per_acre?: string;
      total_water?: string;
    };
    application_method?: string;
    target_pest_stage?: string;
  };
  safety: {
    has_safety_info: boolean;
    farmer_safety_level?: string;
    safety_instruction?: string;
    bee_toxicity?: string;
    bee_warning?: string;
    bee_spray_time?: string;
    aquatic_toxicity?: string;
    phi_days?: number;
    phi_instruction?: string;
    reentry_hours?: number;
    reentry_instruction?: string;
    regulatory_status?: string;
  };
  environment: {
    has_conditions: boolean;
    temperature_range?: string;
    humidity_range?: string;
    wind_limit?: string;
    rain_delay_hours?: number;
    spray_window_instruction?: string;
    spray_blocked?: boolean;
    spray_block_reason?: string;
  };
  economics: {
    has_economics: boolean;
    cost_estimate?: string;
    material_cost?: string;
    labor_cost?: string;
    roi_yield_gain?: string;
    roi_risk?: string;
    cost_saved_range?: string;
  };
  monitoring: {
    has_monitoring: boolean;
    success_indicators: string[];
    failure_indicators: string[];
  };
  trace: {
    rule_id: string;
    scientific_source?: string;
    icar_package?: string;
    university_source?: string;
    data_authority_rank?: number;
    confidence_score: number;
  };
  multi_rule?: {
    has_secondary: boolean;
    secondary_observations: Array<{
      rule_id: string;
      cause: string;
      action_type: string;
      action_text: string;
      confidence: number;
    }>;
    monitoring_advice: string[];
  };
  safety_warnings: string[];
}

interface CanonicalAdvisoryCardProps {
  advisory: CanonicalFarmerAdvisory;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION COMPONENT — Collapsible card section
// ═══════════════════════════════════════════════════════════════════════════

function AdvisorySection({ 
  icon: Icon, 
  emoji,
  title, 
  children, 
  variant = 'default',
  defaultExpanded = true 
}: {
  icon?: React.ElementType;
  emoji?: string;
  title: string;
  children: React.ReactNode;
  variant?: 'default' | 'green' | 'red' | 'yellow' | 'blue' | 'purple';
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  const variantStyles = {
    default: 'border-l-border/50 bg-card/50',
    green: 'border-l-[hsl(var(--chat-section-green-border))] bg-[hsl(var(--chat-section-green-bg))]',
    red: 'border-l-[hsl(var(--chat-section-red-border))] bg-[hsl(var(--chat-section-red-bg))]',
    yellow: 'border-l-[hsl(var(--chat-section-yellow-border))] bg-[hsl(var(--chat-section-yellow-bg))]',
    blue: 'border-l-[hsl(var(--chat-section-blue-border))] bg-[hsl(var(--chat-section-blue-bg))]',
    purple: 'border-l-[hsl(var(--chat-section-purple-border))] bg-[hsl(var(--chat-section-purple-bg))]'
  };
  
  return (
    <div className={cn('border-l-[3px] rounded-lg overflow-hidden', variantStyles[variant])}>
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-foreground/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {emoji && <span className="text-base">{emoji}</span>}
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 text-sm">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE BADGE
// ═══════════════════════════════════════════════════════════════════════════

function ConfidenceBadge({ score, decision }: { score: number; decision: string }) {
  const { t } = useTranslation();
  const pct = Math.round(score * 100);
  const color = pct >= 75 ? 'bg-success/15 text-success dark:text-success border-success/30' :
                pct >= 50 ? 'bg-warning/15 text-warning dark:text-warning border-warning/30' :
                'bg-destructive/15 text-destructive dark:text-destructive border-destructive/30';
  
  const decisionLabel = decision === 'TREAT' ? `💊 ${t('chatCards.cards.treatment')}` : 
                        decision === 'MONITOR' ? `👁️ ${t('chatCards.cards.monitoring')}` : `❓ ${t('chatCards.cards.confirmDiagnosis')}`;
  
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={cn('text-xs font-medium', color)}>
        {pct}% {t('chatCards.cards.confidence')}
      </Badge>
      <Badge variant="outline" className="text-xs">
        {decisionLabel}
      </Badge>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const CanonicalAdvisoryCard: React.FC<CanonicalAdvisoryCardProps> = ({ advisory }) => {
  const [showTrace, setShowTrace] = useState(false);
  const { t } = useTranslation();
  const { diagnosis, explanation, treatment, safety, environment, economics, monitoring, trace } = advisory;
  
  return (
    <div className="space-y-2">
      {/* ═══ HEADER: Diagnosis ═══ */}
      <Card className="overflow-hidden border-border/60">
        <div className="p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎯</span>
              <h3 className="font-bold text-sm text-foreground">{diagnosis.problem}</h3>
            </div>
            {diagnosis.risk_level && (
              <Badge variant="outline" className={cn('text-[10px] shrink-0',
                diagnosis.risk_level === 'HIGH' || diagnosis.risk_level === 'CRITICAL' ? 'border-destructive/50 text-destructive' : 'border-muted-foreground/30'
              )}>
                {diagnosis.risk_level}
              </Badge>
            )}
          </div>
          {/* Confidence badge hidden from farmers — available in trace panel below */}
        </div>
      </Card>

      {/* ═══ EXPLANATION ═══ */}
      <AdvisorySection emoji="📖" title={t('chatCards.cards.whatAndWhy')} variant="blue">
        <p className="text-muted-foreground leading-relaxed mb-1">{explanation.what_is_happening}</p>
        {explanation.why_it_happens !== explanation.what_is_happening && (
          <p className="text-muted-foreground leading-relaxed text-xs italic">{explanation.why_it_happens}</p>
        )}
      </AdvisorySection>

      {/* ═══ SYMPTOMS TO CONFIRM ═══ */}
      {advisory.symptoms_to_confirm.length > 0 && (
        <AdvisorySection icon={Eye} title={t('chatCards.cards.symptomsToConfirm')} variant="yellow" defaultExpanded={false}>
          <ul className="space-y-1">
            {advisory.symptoms_to_confirm.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-muted-foreground">
                <span className="text-warning mt-0.5">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </AdvisorySection>
      )}

      {/* ═══ TREATMENT ═══ */}
      <AdvisorySection emoji="💊" title={treatment.is_treatment ? t('chatCards.cards.treatment') : t('chatCards.cards.recommendedAction')} variant="green">
        <p className="font-medium text-foreground mb-2">{treatment.immediate_action}</p>
        
        {/* Dosage */}
        {treatment.dosage && (
          <div className="bg-foreground/5 rounded-md p-2 mb-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('chatCards.cards.dosagePerAcre')}:</span>
              <span className="font-medium text-foreground">{treatment.dosage.per_acre}</span>
            </div>
            {treatment.dosage.total && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('chatCards.cards.total')} ({treatment.dosage.land_area_acres} {t('chatCards.cards.acre')}):</span>
                <span className="font-semibold text-foreground">{treatment.dosage.total}</span>
              </div>
            )}
            {treatment.dosage.water_volume_per_acre && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('chatCards.cards.waterPerAcre')}:</span>
                <span className="font-medium text-foreground">{treatment.dosage.water_volume_per_acre}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Application method */}
        {treatment.application_method && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">{t('chatCards.cards.method')}:</span> {treatment.application_method}
          </p>
        )}
        
        {/* Chemical details */}
        {treatment.chemical_solution?.active_ingredient && (
          <div className="mt-2 text-xs text-muted-foreground">
            <FlaskConical className="h-3 w-3 inline mr-1" />
            {treatment.chemical_solution.active_ingredient}
            {treatment.chemical_solution.mode_of_action && ` (${treatment.chemical_solution.mode_of_action})`}
          </div>
        )}
        
        {/* Organic alternative */}
        {treatment.organic_solution && (
          <div className="mt-2 p-2 bg-success/10 rounded-md">
            <div className="flex items-center gap-1 mb-1">
              <Leaf className="h-3 w-3 text-success" />
              <span className="text-xs font-medium text-success dark:text-success">{t('chatCards.cards.organicAlternative')}</span>
            </div>
            <p className="text-xs text-muted-foreground">{treatment.organic_solution}</p>
          </div>
        )}
      </AdvisorySection>

      {/* ═══ SAFETY ═══ */}
      {safety.has_safety_info && (
        <AdvisorySection icon={Shield} title={t('chatCards.cards.safety')} variant="red">
          <div className="space-y-1.5">
            {safety.safety_instruction && (
              <p className="text-muted-foreground">{safety.safety_instruction}</p>
            )}
            {safety.phi_days != null && (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                  PHI: {safety.phi_days} days
                </Badge>
                {safety.phi_instruction && <span className="text-muted-foreground">{safety.phi_instruction}</span>}
              </div>
            )}
            {safety.bee_toxicity && safety.bee_toxicity !== 'SAFE' && (
              <div className="flex items-center gap-1 text-xs text-warning dark:text-warning">
                <span>🐝</span>
                <span>{safety.bee_warning || `Bee toxicity: ${safety.bee_toxicity}`}</span>
                {safety.bee_spray_time && <span className="font-medium">→ Spray {safety.bee_spray_time}</span>}
              </div>
            )}
            {safety.reentry_hours != null && (
              <p className="text-xs text-muted-foreground">
                ⏱️ Re-entry: {safety.reentry_hours}h {safety.reentry_instruction || ''}
              </p>
            )}
          </div>
        </AdvisorySection>
      )}

      {/* ═══ ENVIRONMENT ═══ */}
      {environment.has_conditions && (
        <AdvisorySection icon={Thermometer} title={t('chatCards.cards.weatherConditions')} variant="blue" defaultExpanded={false}>
          <div className="space-y-1 text-xs text-muted-foreground">
            {environment.spray_blocked && (
              <p className="text-destructive font-medium">⚠️ {environment.spray_block_reason}</p>
            )}
            {environment.temperature_range && <p>🌡️ Temperature: {environment.temperature_range}</p>}
            {environment.wind_limit && <p>💨 Wind: {environment.wind_limit}</p>}
            {environment.rain_delay_hours != null && <p>🌧️ Wait {environment.rain_delay_hours}h after rain</p>}
            {environment.spray_window_instruction && <p>🕐 {environment.spray_window_instruction}</p>}
          </div>
        </AdvisorySection>
      )}

      {/* ═══ ECONOMICS ═══ */}
      {economics.has_economics && (
        <AdvisorySection icon={DollarSign} title={t('chatCards.cards.costAndBenefit')} variant="purple" defaultExpanded={false}>
          <div className="space-y-1 text-xs text-muted-foreground">
            {economics.cost_estimate && <p>💰 Estimated Cost: <span className="font-medium text-foreground">₹{economics.cost_estimate}</span></p>}
            {economics.material_cost && <p>📦 Material: ₹{economics.material_cost}</p>}
            {economics.labor_cost && <p>👷 Labor: ₹{economics.labor_cost}</p>}
            {economics.roi_yield_gain && <p>📈 Expected Yield Gain: <span className="text-success font-medium">{economics.roi_yield_gain}</span></p>}
            {economics.cost_saved_range && <p>💵 Cost Saved: ₹{economics.cost_saved_range}</p>}
          </div>
        </AdvisorySection>
      )}

      {/* ═══ MONITORING ═══ */}
      {monitoring.has_monitoring && (
        <AdvisorySection icon={Activity} title={t('chatCards.cards.monitoring')} variant="green" defaultExpanded={false}>
          {monitoring.success_indicators.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-medium text-success dark:text-success mb-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> {t('chatCards.cards.successSigns')}
              </p>
              <ul className="space-y-0.5">
                {monitoring.success_indicators.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground">✅ {s}</li>
                ))}
              </ul>
            </div>
          )}
          {monitoring.failure_indicators.length > 0 && (
            <div>
              <p className="text-xs font-medium text-destructive dark:text-destructive mb-1 flex items-center gap-1">
                <XCircle className="h-3 w-3" /> {t('chatCards.cards.warningSigns')}
              </p>
              <ul className="space-y-0.5">
                {monitoring.failure_indicators.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground">⚠️ {s}</li>
                ))}
              </ul>
            </div>
          )}
        </AdvisorySection>
      )}

      {/* ═══ MULTI-RULE SECONDARY ═══ */}
      {advisory.multi_rule?.has_secondary && (
        <AdvisorySection emoji="📋" title={t('chatCards.cards.additionalObservations')} variant="default" defaultExpanded={false}>
          <div className="space-y-2">
            {advisory.multi_rule.secondary_observations.map((obs, i) => (
              <div key={i} className="p-2 bg-foreground/5 rounded-md text-xs">
                <p className="font-medium text-foreground">{obs.cause}</p>
                <p className="text-muted-foreground mt-0.5">{obs.action_text}</p>
              </div>
            ))}
          </div>
        </AdvisorySection>
      )}

      {/* ═══ SAFETY WARNINGS BANNER ═══ */}
      {advisory.safety_warnings.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-xs font-semibold text-destructive">{t('chatCards.cards.safetyWarnings')}</span>
          </div>
          <ul className="space-y-0.5">
            {advisory.safety_warnings.map((w, i) => (
              <li key={i} className="text-xs text-destructive/80">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ═══ TRACEABILITY FOOTER ═══ */}
      {/* ═══ TRACEABILITY — hidden by default, audit-only ═══ */}
      <div className="border-t border-border/30 pt-1">
        <button 
          onClick={() => setShowTrace(!showTrace)}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors w-full"
        >
          <Microscope className="h-3 w-3" />
           <span>Traceability</span>
          {showTrace ? <ChevronUp className="h-2.5 w-2.5 ml-auto" /> : <ChevronDown className="h-2.5 w-2.5 ml-auto" />}
        </button>
        <AnimatePresence>
          {showTrace && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-1.5 space-y-0.5 text-[10px] text-muted-foreground/40">
                <p>🔗 Rule: {trace.rule_id}</p>
                <p>📊 Confidence: {Math.min(Math.round(trace.confidence_score * 100), 100)}%</p>
                {trace.scientific_source && <p>📚 Source: {trace.scientific_source}</p>}
                {trace.icar_package && <p>🏛️ ICAR: {trace.icar_package}</p>}
                {trace.university_source && <p>🎓 Univ: {trace.university_source}</p>}
                {trace.data_authority_rank != null && <p>📊 Authority: {trace.data_authority_rank}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
