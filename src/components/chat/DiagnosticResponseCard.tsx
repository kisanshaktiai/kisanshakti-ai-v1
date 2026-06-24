/**
 * Mobile-First Diagnostic Response Card
 * Production-ready, 2030-ready UI for rural Indian farmers
 * 
 * Features:
 * - Fully responsive mobile-first design
 * - Single language support (no mixing)
 * - Sequential question flow for disambiguation
 * - Clear visual hierarchy
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MapPin, Wheat, Gauge, Thermometer, Droplets,
  AlertTriangle, CheckCircle, Camera, HelpCircle,
  ChevronRight, Leaf, Bug, CloudRain
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PossibleCause {
  cause_name: string;
  probability: number;
  differentiating_factors: string[];
}

interface DisambiguationQuestion {
  question: string;
  yesIndicates: string;
  noIndicates: string;
}

interface DiagnosticData {
  landName?: string;
  cropName?: string;
  daysAfterSowing?: number;
  growthStage?: string;
  areaDisplay?: string;
  soilMoisture?: number;
  ndviValue?: number;
  temperature?: number;
  symptomDetected?: string;
  rankedCauses: PossibleCause[];
  eliminatedCauses?: { causeName: string; eliminationReason: string }[];
  disambiguationQuestions: DisambiguationQuestion[];
  photoRequired?: boolean;
  photoInstructions?: string[];
  confidence: number;
  mode: 'DIAGNOSTIC' | 'ACTION' | 'PHOTO_REQUIRED';
}

interface DiagnosticResponseCardProps {
  data: DiagnosticData;
  language: string;
  onQuestionAnswer?: (question: string, answer: 'yes' | 'no') => void;
  onTakePhoto?: () => void;
  currentQuestionIndex?: number;
}

// Labels are now loaded from i18n via useTranslation

const getLabelsFromT = (t: (key: string) => string) => ({
  yourField: t('chatCards.cards.yourField'),
  crop: t('chatCards.cards.crop'),
  days: t('chatCards.cards.days'),
  stage: t('chatCards.cards.stage'),
  area: t('chatCards.cards.area'),
  soilMoisture: t('chatCards.cards.soilMoisture'),
  cropHealth: t('chatCards.cards.cropHealth'),
  weather: t('chatCards.cards.weather'),
  symptomDetected: t('chatCards.cards.symptomDetected'),
  possibleCauses: t('chatCards.cards.possibleCauses'),
  probability: t('chatCards.cards.probability'),
  ruledOut: t('chatCards.cards.ruledOut'),
  confirmDiagnosis: t('chatCards.cards.confirmDiagnosis'),
  takePhoto: t('chatCards.cards.takePhoto'),
  photoNeeded: t('chatCards.cards.photoNeeded'),
  answerQuestion: t('chatCards.cards.answerQuestion'),
  yes: t('chatCards.cards.yes'),
  no: t('chatCards.cards.no'),
  confidence: t('chatCards.cards.confidence'),
  noChemicalsYet: t('chatCards.cards.noChemicalsYet'),
  gunta: t('chatCards.cards.gunta'),
  acre: t('chatCards.cards.acre'),
  germination: t('chatCards.cards.germination'),
  vegetative: t('chatCards.cards.vegetative'),
  reproductive: t('chatCards.cards.reproductive'),
  maturity: t('chatCards.cards.maturity'),
  harvest: t('chatCards.cards.harvest'),
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function FieldContextHeader({ data, labels }: { data: DiagnosticData; labels: Record<string, string> }) {
  const getStageLabel = (stage?: string) => {
    if (!stage) return '';
    const stageKey = stage.toLowerCase();
    return labels[stageKey] || stage;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-xl p-3 border border-primary/20"
    >
      {/* Land Name Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-primary/20">
          <MapPin className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold text-sm text-foreground">
          {data.landName || labels.yourField}
        </span>
      </div>

      {/* Field Info Grid - 2 columns on mobile */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Crop + Days */}
        <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2 py-1.5">
          <Wheat className="h-3.5 w-3.5 text-warning" />
          <span className="font-medium truncate">
            {data.cropName} ({data.daysAfterSowing} {labels.days})
          </span>
        </div>

        {/* Stage */}
        {data.growthStage && (
          <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2 py-1.5">
            <Leaf className="h-3.5 w-3.5 text-success" />
            <span className="font-medium truncate">{getStageLabel(data.growthStage)}</span>
          </div>
        )}

        {/* Area */}
        {data.areaDisplay && (
          <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2 py-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{data.areaDisplay}</span>
          </div>
        )}

        {/* Soil Moisture */}
        {data.soilMoisture !== undefined && (
          <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2 py-1.5">
            <Droplets className="h-3.5 w-3.5 text-info" />
            <span>{data.soilMoisture}%</span>
          </div>
        )}

        {/* NDVI */}
        {data.ndviValue !== undefined && (
          <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2 py-1.5">
            <Gauge className="h-3.5 w-3.5 text-success" />
            <span>{Math.round(data.ndviValue * 100)}%</span>
          </div>
        )}

        {/* Weather */}
        {data.temperature !== undefined && (
          <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2 py-1.5">
            <Thermometer className="h-3.5 w-3.5 text-warning" />
            <span>{data.temperature}°C</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SymptomBadge({ symptom, labels }: { symptom: string; labels: Record<string, string> }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 }}
      className="flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-xl px-3 py-2"
    >
      <AlertTriangle className="h-4 w-4 text-warning" />
      <span className="text-sm font-medium text-warning dark:text-warning">
        {labels.symptomDetected}: {symptom}
      </span>
    </motion.div>
  );
}

function CausesList({ 
  causes, 
  eliminatedCauses, 
  labels 
}: { 
  causes: PossibleCause[]; 
  eliminatedCauses?: { causeName: string; eliminationReason: string }[];
  labels: Record<string, string>;
}) {
  const getIcon = (index: number) => {
    const icons = ['1️⃣', '2️⃣', '3️⃣'];
    return icons[index] || `${index + 1}.`;
  };

  const getProbabilityColor = (prob: number) => {
    if (prob >= 0.6) return 'bg-destructive/20 text-destructive dark:text-destructive border-destructive/30';
    if (prob >= 0.3) return 'bg-warning/20 text-warning dark:text-warning border-warning/30';
    return 'bg-muted text-muted-foreground border-border';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="space-y-2"
    >
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Bug className="h-4 w-4 text-primary" />
        {labels.possibleCauses}
      </h4>

      <div className="space-y-2">
        {causes.slice(0, 3).map((cause, index) => (
          <motion.div
            key={cause.cause_name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + index * 0.1 }}
            className="bg-card border border-border/50 rounded-xl p-3 shadow-sm"
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">{getIcon(index)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground">
                    {cause.cause_name}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={cn("text-xs shrink-0", getProbabilityColor(cause.probability))}
                  >
                    {Math.round(cause.probability * 100)}% {labels.probability}
                  </Badge>
                </div>
                {cause.differentiating_factors.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    ↳ {cause.differentiating_factors[0]}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Eliminated Causes */}
      {eliminatedCauses && eliminatedCauses.length > 0 && (
        <div className="mt-3 space-y-1">
          <h5 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            ❌ {labels.ruledOut}
          </h5>
          {eliminatedCauses.slice(0, 2).map((ec, idx) => (
            <div key={idx} className="text-xs text-muted-foreground/80 pl-4 line-clamp-1">
              • {ec.causeName}: {ec.eliminationReason}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function SequentialQuestionCard({
  question,
  onAnswer,
  labels,
  index,
  total
}: {
  question: DisambiguationQuestion;
  onAnswer: (answer: 'yes' | 'no') => void;
  labels: Record<string, string>;
  index: number;
  total: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 }}
      className="bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-primary/30 rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-full bg-primary/20">
          <HelpCircle className="h-4 w-4 text-primary" />
        </div>
        <span className="text-xs text-muted-foreground">
          {labels.confirmDiagnosis} ({index + 1}/{total})
        </span>
      </div>

      <p className="text-base font-medium text-foreground mb-4 leading-relaxed">
        {question.question}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={() => onAnswer('yes')}
          className="h-14 text-lg font-semibold bg-success/10 border-success/40 text-success dark:text-success hover:bg-success/20 hover:border-success/60 rounded-xl"
        >
          <CheckCircle className="h-5 w-5 mr-2" />
          {labels.yes}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => onAnswer('no')}
          className="h-14 text-lg font-semibold bg-destructive/10 border-destructive/40 text-destructive dark:text-destructive hover:bg-destructive/20 hover:border-destructive/60 rounded-xl"
        >
          ✕ {labels.no}
        </Button>
      </div>
    </motion.div>
  );
}

function PhotoRequestCard({
  instructions,
  onTakePhoto,
  labels
}: {
  instructions?: string[];
  onTakePhoto: () => void;
  labels: Record<string, string>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 }}
      className="bg-gradient-to-br from-info/10 to-info/10 border-2 border-info/30 rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-full bg-info/20">
          <Camera className="h-5 w-5 text-info" />
        </div>
        <span className="font-semibold text-sm text-foreground">
          {labels.photoNeeded}
        </span>
      </div>

      {instructions && instructions.length > 0 && (
        <ul className="space-y-2 mb-4">
          {instructions.map((instruction, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-info">{idx + 1}.</span>
              <span>{instruction}</span>
            </li>
          ))}
        </ul>
      )}

      <Button
        onClick={onTakePhoto}
        size="lg"
        className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-info to-info hover:from-info hover:to-info text-white rounded-xl shadow-lg"
      >
        <Camera className="h-5 w-5 mr-2" />
        {labels.takePhoto}
      </Button>
    </motion.div>
  );
}

function WarningFooter({ confidence, labels }: { confidence: number; labels: Record<string, string> }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 mt-2"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-destructive font-medium">
            {labels.noChemicalsYet}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">{labels.confidence}:</span>
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs",
                confidence >= 0.8 ? "bg-success/20 text-success" :
                confidence >= 0.5 ? "bg-warning/20 text-warning" :
                "bg-destructive/20 text-destructive"
              )}
            >
              {Math.round(confidence * 100)}%
            </Badge>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function DiagnosticResponseCard({
  data,
  language,
  onQuestionAnswer,
  onTakePhoto,
  currentQuestionIndex = 0
}: DiagnosticResponseCardProps) {
  const { t } = useTranslation();
  const labels = getLabelsFromT(t);
  const currentQuestion = data.disambiguationQuestions[currentQuestionIndex];
  const showQuestion = data.mode === 'DIAGNOSTIC' && currentQuestion && onQuestionAnswer;
  const showPhotoRequest = data.mode === 'PHOTO_REQUIRED' && onTakePhoto;

  return (
    <div className="w-full max-w-full overflow-hidden space-y-3">
      {/* Field Context */}
      <FieldContextHeader data={data} labels={labels} />

      {/* Symptom Detected */}
      {data.symptomDetected && (
        <SymptomBadge symptom={data.symptomDetected} labels={labels} />
      )}

      {/* Possible Causes */}
      {data.rankedCauses.length > 0 && (
        <CausesList 
          causes={data.rankedCauses} 
          eliminatedCauses={data.eliminatedCauses}
          labels={labels} 
        />
      )}

      {/* Sequential Question (one at a time) */}
      {showQuestion && (
        <SequentialQuestionCard
          question={currentQuestion}
          onAnswer={(answer) => onQuestionAnswer(currentQuestion.question, answer)}
          labels={labels}
          index={currentQuestionIndex}
          total={data.disambiguationQuestions.length}
        />
      )}

      {/* Photo Request */}
      {showPhotoRequest && (
        <PhotoRequestCard
          instructions={data.photoInstructions}
          onTakePhoto={onTakePhoto}
          labels={labels}
        />
      )}

      {/* Warning Footer */}
      {data.mode !== 'ACTION' && (
        <WarningFooter confidence={data.confidence} labels={labels} />
      )}
    </div>
  );
}
