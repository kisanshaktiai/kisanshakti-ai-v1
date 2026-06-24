import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Eye, Droplets, Shield, Leaf, Target, Clock, CheckCircle2, AlertTriangle, Lightbulb } from 'lucide-react';
import { useState, forwardRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AlertEvidenceSectionProps {
  triggerData: Record<string, any>;
  reasoning: string | null;
}

// All labels are trilingual — no hardcoded sentences
const EVIDENCE_LABELS: Record<string, { icon: string; unit: string; en: string; mr: string; hi: string }> = {
  temp: { icon: '🌡️', unit: '°C', en: 'Temperature', mr: 'तापमान', hi: 'तापमान' },
  humidity: { icon: '💧', unit: '%', en: 'Humidity', mr: 'आर्द्रता', hi: 'नमी' },
  rain_mm: { icon: '🌧️', unit: 'mm', en: 'Rainfall', mr: 'पाऊस', hi: 'वर्षा' },
  wind: { icon: '💨', unit: 'km/h', en: 'Wind Speed', mr: 'वाऱ्याचा वेग', hi: 'हवा की गति' },
  ndvi: { icon: '🛰️', unit: '', en: 'Crop Health (NDVI)', mr: 'पीक आरोग्य (NDVI)', hi: 'फसल स्वास्थ्य (NDVI)' },
  ndvi_previous: { icon: '🛰️', unit: '', en: 'Previous NDVI', mr: 'मागील NDVI', hi: 'पिछला NDVI' },
  drop: { icon: '📉', unit: '', en: 'NDVI Drop', mr: 'NDVI घट', hi: 'NDVI गिरावट' },
  das: { icon: '📅', unit: '', en: 'Days After Sowing', mr: 'पेरणीनंतर दिवस', hi: 'बुवाई के बाद दिन' },
  soil_n: { icon: '🧪', unit: ' kg/ha', en: 'Nitrogen (N)', mr: 'नायट्रोजन (N)', hi: 'नाइट्रोजन (N)' },
  soil_p: { icon: '🧪', unit: ' kg/ha', en: 'Phosphorus (P)', mr: 'स्फुरद (P)', hi: 'फॉस्फोरस (P)' },
  soil_k: { icon: '🧪', unit: ' kg/ha', en: 'Potassium (K)', mr: 'पालाश (K)', hi: 'पोटैशियम (K)' },
  soil_ph: { icon: '⚗️', unit: '', en: 'Soil pH', mr: 'माती pH', hi: 'मिट्टी pH' },
  organic_carbon: { icon: '🌱', unit: '%', en: 'Organic Carbon', mr: 'सेंद्रिय कर्ब', hi: 'जैविक कार्बन' },
  forecast_rain_72h: { icon: '🌦️', unit: '%', en: 'Rain Forecast (72h)', mr: 'पावसाचा अंदाज (72h)', hi: 'वर्षा पूर्वानुमान (72h)' },
  gdd: { icon: '🔥', unit: '', en: 'Growth Degree Days', mr: 'वाढ डिग्री दिवस', hi: 'ग्रोथ डिग्री डेज' },
  days_to_harvest: { icon: '🌾', unit: '', en: 'Days to Harvest', mr: 'कापणीसाठी दिवस', hi: 'कटाई तक दिन' },
  phi_days: { icon: '⚠️', unit: '', en: 'Pre-Harvest Interval', mr: 'कापणीपूर्व कालावधी', hi: 'कटाई पूर्व अंतराल' },
  stage: { icon: '🌱', unit: '', en: 'Growth Stage', mr: 'वाढीचा टप्पा', hi: 'विकास चरण' },
  area_acres: { icon: '📐', unit: ' acres', en: 'Field Area', mr: 'शेत क्षेत्र', hi: 'खेत का क्षेत्रफल' },
  soil_type: { icon: '🏔️', unit: '', en: 'Soil Type', mr: 'माती प्रकार', hi: 'मिट्टी का प्रकार' },
  irrigation_method: { icon: '🚿', unit: '', en: 'Irrigation Method', mr: 'सिंचन पद्धत', hi: 'सिंचाई विधि' },
  threshold: { icon: '📏', unit: '', en: 'Threshold', mr: 'मर्यादा', hi: 'सीमा' },
  crop: { icon: '🌾', unit: '', en: 'Crop', mr: 'पीक', hi: 'फसल' },
  water_source: { icon: '💧', unit: '', en: 'Water Source', mr: 'पाण्याचा स्रोत', hi: 'पानी का स्रोत' },
};

// Trilingual section headers
const SECTION_HEADERS: Record<string, { mr: string; hi: string; en: string }> = {
  problem: { mr: 'समस्या', hi: 'समस्या', en: 'Problem' },
  cause: { mr: 'कारण', hi: 'कारण', en: 'Why' },
  steps: { mr: 'काय करावे', hi: 'क्या करें', en: 'What To Do' },
  safety: { mr: 'सुरक्षा', hi: 'सुरक्षा', en: 'Safety' },
  organic_alt: { mr: 'सेंद्रिय पर्याय', hi: 'जैविक विकल्प', en: 'Organic Alternative' },
  expected_benefit: { mr: 'अपेक्षित फायदा', hi: 'अपेक्षित लाभ', en: 'Expected Result' },
  followup: { mr: 'पुढील तपासणी', hi: 'अगली जांच', en: 'Follow-up' },
  irrigation: { mr: 'सिंचन सल्ला', hi: 'सिंचाई सलाह', en: 'Irrigation Advice' },
  evidence: { mr: 'हा इशारा का? (पुरावा)', hi: 'यह अलर्ट क्यों? (प्रमाण)', en: 'Why this alert? (Evidence)' },
  total_water: { mr: 'एकूण पाणी', hi: 'कुल पानी', en: 'Total Water' },
  per_acre: { mr: 'प्रति एकर', hi: 'प्रति एकड़', en: 'Per Acre' },
  duration: { mr: 'कालावधी', hi: 'अवधि', en: 'Duration' },
  method: { mr: 'पद्धत', hi: 'विधि', en: 'Method' },
  hours: { mr: 'तास', hi: 'घंटे', en: 'hrs' },
};

const URGENCY_LABELS: Record<string, { en: string; mr: string; hi: string; color: string }> = {
  IMMEDIATE: { en: 'Do it NOW', mr: 'आत्ताच करा', hi: 'अभी करें', color: 'bg-destructive text-white' },
  TODAY: { en: 'Today', mr: 'आज', hi: 'आज', color: 'bg-warning text-white' },
  TOMORROW: { en: 'Tomorrow morning', mr: 'उद्या सकाळी', hi: 'कल सुबह', color: 'bg-warning text-white' },
};

function getLabel(key: string, lang: string): string {
  const config = EVIDENCE_LABELS[key];
  if (!config) return key.replace(/_/g, ' ');
  if (lang === 'mr') return config.mr;
  if (lang === 'hi') return config.hi;
  return config.en;
}

function getHeader(key: string, lang: string): string {
  const h = SECTION_HEADERS[key];
  if (!h) return key;
  return h[lang as 'mr' | 'hi' | 'en'] || h.en;
}

function getSolutionField(solution: any, field: string, lang: string): string {
  if (!solution) return '';
  const key = `${field}_${lang === 'mr' ? 'mr' : lang === 'hi' ? 'hi' : 'en'}`;
  return solution[key] || solution[`${field}_en`] || '';
}

function getSolutionSteps(solution: any, lang: string): string[] {
  if (!solution) return [];
  const key = `steps_${lang === 'mr' ? 'mr' : lang === 'hi' ? 'hi' : 'en'}`;
  return solution[key] || solution.steps_en || [];
}

export const AlertEvidenceSection = forwardRef<HTMLDivElement, AlertEvidenceSectionProps>(
  function AlertEvidenceSection({ triggerData, reasoning }, ref) {
  const { i18n } = useTranslation();
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const lang = i18n.language || 'en';

  const irrigation = triggerData.irrigation;
  const solution = triggerData.solution;

  const displayKeys = Object.keys(triggerData).filter(
    k => !['decision_rule_id', 'condition_code', 'knowledge', 'threshold', 'irrigation', 'solution'].includes(k)
  );

  if (displayKeys.length === 0 && !reasoning && !irrigation && !solution) return null;

  const problem = getSolutionField(solution, 'problem', lang);
  const cause = getSolutionField(solution, 'cause', lang);
  const steps = getSolutionSteps(solution, lang);
  const safety = getSolutionField(solution, 'safety', lang);
  const organicAlt = getSolutionField(solution, 'organic_alt', lang);
  const expectedBenefit = getSolutionField(solution, 'expected_benefit', lang);
  const followup = getSolutionField(solution, 'followup', lang);

  const sectionTitle = (icon: React.ReactNode, headerKey: string) => {
    return (
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">{getHeader(headerKey, lang)}</span>
      </div>
    );
  };

  return (
    <div ref={ref} className="mt-3 space-y-2">
      {/* === SOLUTION CARD (from neural enrichment) === */}
      {solution && (
        <div className="rounded-xl border border-success/30 dark:border-success bg-gradient-to-br from-success to-success dark:from-success/30 dark:to-success/20 p-3 space-y-3">
          {(problem || cause) && (
            <div className="space-y-1.5">
              {problem && (
                <div>
                  {sectionTitle(<AlertTriangle className="h-3 w-3 text-warning" />, 'problem')}
                  <p className="text-xs text-foreground/80 leading-relaxed">{problem}</p>
                </div>
              )}
              {cause && (
                <div>
                  {sectionTitle(<Lightbulb className="h-3 w-3 text-warning" />, 'cause')}
                  <p className="text-xs text-foreground/70 leading-relaxed">{cause}</p>
                </div>
              )}
            </div>
          )}

          {steps.length > 0 && (
            <div>
              {sectionTitle(<Target className="h-3 w-3 text-primary" />, 'steps')}
              <div className="space-y-1.5">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-foreground/80 leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {safety && (
            <div className="bg-destructive-soft dark:bg-destructive/20 border border-destructive/30 dark:border-destructive rounded-lg p-2">
              {sectionTitle(<Shield className="h-3 w-3 text-destructive" />, 'safety')}
              <p className="text-[11px] text-destructive dark:text-destructive leading-relaxed">{safety}</p>
            </div>
          )}

          {organicAlt && (
            <div className="bg-success-soft dark:bg-success/20 border border-success/30 dark:border-success rounded-lg p-2">
              {sectionTitle(<Leaf className="h-3 w-3 text-success" />, 'organic_alt')}
              <p className="text-[11px] text-success dark:text-success leading-relaxed">{organicAlt}</p>
            </div>
          )}

          {(expectedBenefit || followup) && (
            <div className="flex gap-2">
              {expectedBenefit && (
                <div className="flex-1 bg-white/60 dark:bg-white/5 rounded-lg p-2">
                  {sectionTitle(<CheckCircle2 className="h-3 w-3 text-success" />, 'expected_benefit')}
                  <p className="text-[10px] text-foreground/70 leading-relaxed">{expectedBenefit}</p>
                </div>
              )}
              {followup && (
                <div className="flex-1 bg-white/60 dark:bg-white/5 rounded-lg p-2">
                  {sectionTitle(<Clock className="h-3 w-3 text-info" />, 'followup')}
                  <p className="text-[10px] text-foreground/70 leading-relaxed">{followup}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* === IRRIGATION CARD === */}
      {irrigation && (
        <div className="rounded-lg border border-info/30 bg-info-soft dark:bg-info/30 dark:border-info p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-info-soft dark:bg-info flex items-center justify-center">
              <Droplets className="h-4 w-4 text-info" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-info dark:text-info">
                💧 {getHeader('irrigation', lang)}
              </p>
              {irrigation.urgency && (
                <Badge className={cn('text-[9px] px-1.5 py-0 mt-0.5', URGENCY_LABELS[irrigation.urgency]?.color || 'bg-muted')}>
                  {URGENCY_LABELS[irrigation.urgency]?.[lang as keyof typeof URGENCY_LABELS['IMMEDIATE']] || irrigation.urgency}
                </Badge>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/60 dark:bg-white/5 rounded px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">{getHeader('total_water', lang)}</p>
              <p className="font-bold text-info dark:text-info text-sm">
                {Number(irrigation.water_liters_total).toLocaleString()} L
              </p>
            </div>
            <div className="bg-white/60 dark:bg-white/5 rounded px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">{getHeader('per_acre', lang)}</p>
              <p className="font-bold text-info dark:text-info text-sm">
                {Number(irrigation.water_liters_per_acre).toLocaleString()} L
              </p>
            </div>
            <div className="bg-white/60 dark:bg-white/5 rounded px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">{getHeader('duration', lang)}</p>
              <p className="font-bold text-info dark:text-info text-sm">
                {irrigation.duration_hours} {getHeader('hours', lang)}
              </p>
            </div>
            <div className="bg-white/60 dark:bg-white/5 rounded px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">{getHeader('method', lang)}</p>
              <p className="font-bold text-info dark:text-info text-sm">
                {irrigation.method}
              </p>
            </div>
          </div>
          
          {irrigation.timing && (
            <p className="text-[10px] text-info/70 dark:text-info/70 italic">
              ⏰ {irrigation.timing}
            </p>
          )}
        </div>
      )}

      {/* === EVIDENCE COLLAPSIBLE === */}
      {(displayKeys.length > 0 || reasoning) && (
        <Collapsible open={isEvidenceOpen} onOpenChange={setIsEvidenceOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <Eye className="h-3 w-3" />
            <span>{getHeader('evidence', lang)}</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${isEvidenceOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-xs">
              {reasoning && (
                <p className="text-foreground/70 italic mb-2">{reasoning}</p>
              )}
              {displayKeys.map(key => {
                const config = EVIDENCE_LABELS[key];
                const value = triggerData[key];
                if (value === null || value === undefined) return null;
                const displayValue = typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(2)) : String(value);
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {config?.icon || '📊'} {getLabel(key, lang)}
                    </span>
                    <span className="font-medium text-foreground">
                      {displayValue}{config?.unit || ''}
                    </span>
                  </div>
                );
              })}
              {triggerData.knowledge && (
                <p className="text-foreground/60 text-[10px] mt-2 pt-2 border-t border-border/30">
                  📚 {triggerData.knowledge}
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
});
