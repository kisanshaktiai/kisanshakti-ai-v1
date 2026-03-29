import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Eye } from 'lucide-react';
import { useState } from 'react';

interface AlertEvidenceSectionProps {
  triggerData: Record<string, any>;
  reasoning: string | null;
}

const EVIDENCE_LABELS: Record<string, { icon: string; unit: string }> = {
  temp: { icon: '🌡️', unit: '°C' },
  humidity: { icon: '💧', unit: '%' },
  rain_mm: { icon: '🌧️', unit: 'mm' },
  wind: { icon: '💨', unit: 'km/h' },
  ndvi: { icon: '🛰️', unit: '' },
  ndvi_previous: { icon: '🛰️', unit: '' },
  drop: { icon: '📉', unit: '' },
  das: { icon: '📅', unit: ' days' },
  soil_n: { icon: '🧪', unit: ' kg/ha' },
  soil_p: { icon: '🧪', unit: ' kg/ha' },
  soil_k: { icon: '🧪', unit: ' kg/ha' },
  soil_ph: { icon: '⚗️', unit: '' },
  organic_carbon: { icon: '🌱', unit: '%' },
  forecast_rain_72h: { icon: '🌦️', unit: '%' },
  gdd: { icon: '🔥', unit: '' },
  days_to_harvest: { icon: '🌾', unit: ' days' },
  phi_days: { icon: '⚠️', unit: ' days' },
};

export function AlertEvidenceSection({ triggerData, reasoning }: AlertEvidenceSectionProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

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
                  {config?.icon || '📊'} {key.replace(/_/g, ' ')}
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
