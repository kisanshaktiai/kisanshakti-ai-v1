import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Eye, Droplets } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AlertEvidenceSectionProps {
  triggerData: Record<string, any>;
  reasoning: string | null;
}

// Localized evidence labels for farmer-friendly display
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
};

const URGENCY_LABELS: Record<string, { en: string; mr: string; hi: string; color: string }> = {
  IMMEDIATE: { en: 'Do it NOW', mr: 'आत्ताच करा', hi: 'अभी करें', color: 'bg-red-500 text-white' },
  TODAY: { en: 'Today', mr: 'आज', hi: 'आज', color: 'bg-orange-500 text-white' },
  TOMORROW: { en: 'Tomorrow morning', mr: 'उद्या सकाळी', hi: 'कल सुबह', color: 'bg-yellow-500 text-white' },
};

function getLabel(key: string, lang: string): string {
  const config = EVIDENCE_LABELS[key];
  if (!config) return key.replace(/_/g, ' ');
  if (lang === 'mr') return config.mr;
  if (lang === 'hi') return config.hi;
  return config.en;
}

export function AlertEvidenceSection({ triggerData, reasoning }: AlertEvidenceSectionProps) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const lang = i18n.language || 'en';

  const irrigation = triggerData.irrigation;

  // Filter out non-displayable keys
  const displayKeys = Object.keys(triggerData).filter(
    k => !['decision_rule_id', 'condition_code', 'knowledge', 'threshold', 'irrigation'].includes(k)
  );

  if (displayKeys.length === 0 && !reasoning && !irrigation) return null;

  return (
    <div className="mt-3 space-y-2">
      {/* Irrigation Solution Card — always visible when present */}
      {irrigation && (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 dark:bg-cyan-950/30 dark:border-cyan-800 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center">
              <Droplets className="h-4 w-4 text-cyan-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-cyan-800 dark:text-cyan-200">
                {lang === 'mr' ? '💧 सिंचन सल्ला' : lang === 'hi' ? '💧 सिंचाई सलाह' : '💧 Irrigation Advice'}
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
              <p className="text-[10px] text-muted-foreground">
                {lang === 'mr' ? 'एकूण पाणी' : lang === 'hi' ? 'कुल पानी' : 'Total Water'}
              </p>
              <p className="font-bold text-cyan-700 dark:text-cyan-300 text-sm">
                {Number(irrigation.water_liters_total).toLocaleString()} L
              </p>
            </div>
            <div className="bg-white/60 dark:bg-white/5 rounded px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">
                {lang === 'mr' ? 'प्रति एकर' : lang === 'hi' ? 'प्रति एकड़' : 'Per Acre'}
              </p>
              <p className="font-bold text-cyan-700 dark:text-cyan-300 text-sm">
                {Number(irrigation.water_liters_per_acre).toLocaleString()} L
              </p>
            </div>
            <div className="bg-white/60 dark:bg-white/5 rounded px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">
                {lang === 'mr' ? 'कालावधी' : lang === 'hi' ? 'अवधि' : 'Duration'}
              </p>
              <p className="font-bold text-cyan-700 dark:text-cyan-300 text-sm">
                {irrigation.duration_hours} {lang === 'mr' ? 'तास' : lang === 'hi' ? 'घंटे' : 'hrs'}
              </p>
            </div>
            <div className="bg-white/60 dark:bg-white/5 rounded px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">
                {lang === 'mr' ? 'पद्धत' : lang === 'hi' ? 'विधि' : 'Method'}
              </p>
              <p className="font-bold text-cyan-700 dark:text-cyan-300 text-sm">
                {irrigation.method}
              </p>
            </div>
          </div>
          
          {irrigation.timing && (
            <p className="text-[10px] text-cyan-700/70 dark:text-cyan-400/70 italic">
              ⏰ {irrigation.timing}
            </p>
          )}
        </div>
      )}

      {/* Evidence collapsible */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          <Eye className="h-3 w-3" />
          <span>{t('proactive.whyThisAlert', 'Why this alert?')}</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
                {triggerData.knowledge}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
