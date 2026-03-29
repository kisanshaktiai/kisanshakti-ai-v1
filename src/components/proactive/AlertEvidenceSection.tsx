import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Eye } from 'lucide-react';
import { useState } from 'react';

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

  // Filter out non-displayable keys
  const displayKeys = Object.keys(triggerData).filter(
    k => !['decision_rule_id', 'condition_code', 'knowledge', 'threshold'].includes(k)
  );

  if (displayKeys.length === 0 && !reasoning) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-2">
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
  );
}
