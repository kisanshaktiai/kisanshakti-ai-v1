/**
 * DiagnosticEscalationUI - Expert-Quality Diagnostic Response Component
 * 
 * Displays hypotheses, required inputs, and "Take Photo" CTA when the
 * Decision Brain enters DIAGNOSTIC_ESCALATION state.
 * 
 * KEY PRINCIPLE: "Agronomists don't say 'just watch it' - they say 
 * 'this could be X, Y, or Z, and here's what I need to know next to confirm.'"
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  Camera, AlertTriangle, Check, X, HelpCircle,
  Bug, Droplets, Leaf, Sun, FileQuestion,
  ChevronRight, Info, Target, Microscope
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DiagnosticHypothesis {
  cause_code: string;
  cause_name: string;
  category: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'WEATHER' | 'OTHER';
  confidence: number;
  supporting_evidence: string[];
  confirming_evidence: string[];
  ruling_out_evidence: string[];
  explanation?: string;
}

interface RequiredInput {
  type: 'PHOTO' | 'SEVERITY' | 'DISTRIBUTION' | 'SYMPTOM_DETAIL';
  target: string;
  rationale: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  photo_guidance?: {
    what_to_capture: string;
    angle: string;
    lighting: string;
  };
}

interface DiagnosticEscalationData {
  hypotheses: DiagnosticHypothesis[];
  required_inputs: RequiredInput[];
  current_confidence: number;
  threshold_for_treatment: number;
  diagnostic_summary?: string;
  interim_monitoring?: string[];
  photo_recommended?: boolean;
}

interface DiagnosticEscalationUIProps {
  escalationData: DiagnosticEscalationData;
  language: string;
  onTakePhoto: () => void;
  onSelectOption?: (input: RequiredInput, value: string) => void;
  isLoading?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY ICONS
// ═══════════════════════════════════════════════════════════════════════════

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'PEST': return <Bug className="h-5 w-5" />;
    case 'DISEASE': return <Microscope className="h-5 w-5" />;
    case 'NUTRIENT': return <Leaf className="h-5 w-5" />;
    case 'WATER': return <Droplets className="h-5 w-5" />;
    case 'WEATHER': return <Sun className="h-5 w-5" />;
    default: return <HelpCircle className="h-5 w-5" />;
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'PEST': return 'text-warning bg-warning/10 border-warning/30';
    case 'DISEASE': return 'text-destructive bg-destructive/10 border-destructive/30';
    case 'NUTRIENT': return 'text-success bg-success/10 border-success/30';
    case 'WATER': return 'text-info bg-info/10 border-info/30';
    case 'WEATHER': return 'text-warning bg-warning/10 border-warning/30';
    default: return 'text-muted-foreground bg-muted border-border';
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const LABELS: Record<string, Record<string, string>> = {
  en: {
    possibleCauses: 'Possible Causes',
    confidence: 'Confidence',
    supporting: 'Supporting evidence',
    toConfirm: 'To confirm',
    toRuleOut: 'To rule out',
    needMoreInfo: 'To confirm diagnosis, please provide:',
    takePhoto: 'Take Photo',
    photoTip: 'Photo tip',
    severityQuestion: 'How severe is the problem?',
    distributionQuestion: 'How is it spread?',
    interimAdvice: 'While waiting for diagnosis:',
    confidenceNote: 'Current confidence: {current}% | Needed for treatment: {threshold}%'
  },
  hi: {
    possibleCauses: 'संभावित कारण',
    confidence: 'विश्वास',
    supporting: 'समर्थक साक्ष्य',
    toConfirm: 'पुष्टि के लिए',
    toRuleOut: 'खारिज करने के लिए',
    needMoreInfo: 'निदान की पुष्टि के लिए कृपया दें:',
    takePhoto: 'फोटो लें',
    photoTip: 'फोटो टिप',
    severityQuestion: 'समस्या कितनी गंभीर है?',
    distributionQuestion: 'यह कैसे फैला है?',
    interimAdvice: 'निदान की प्रतीक्षा में:',
    confidenceNote: 'वर्तमान विश्वास: {current}% | उपचार के लिए आवश्यक: {threshold}%'
  },
  mr: {
    possibleCauses: 'संभाव्य कारणे',
    confidence: 'खात्री',
    supporting: 'समर्थक पुरावे',
    toConfirm: 'खात्री करण्यासाठी',
    toRuleOut: 'वगळण्यासाठी',
    needMoreInfo: 'निदान पूर्ण करण्यासाठी कृपया द्या:',
    takePhoto: 'फोटो काढा',
    photoTip: 'फोटो टिप',
    severityQuestion: 'समस्या किती तीव्र आहे?',
    distributionQuestion: 'हे कसे पसरले आहे?',
    interimAdvice: 'निदानाच्या प्रतीक्षेत:',
    confidenceNote: 'सध्याची खात्री: {current}% | उपचारासाठी आवश्यक: {threshold}%'
  }
};

const getLabels = (lang: string) => LABELS[lang] || LABELS.en;

// ═══════════════════════════════════════════════════════════════════════════
// HYPOTHESIS CARD
// ═══════════════════════════════════════════════════════════════════════════

interface HypothesisCardProps {
  hypothesis: DiagnosticHypothesis;
  index: number;
  labels: Record<string, string>;
}

function HypothesisCard({ hypothesis, index, labels }: HypothesisCardProps) {
  const confidencePercent = Math.round(hypothesis.confidence * 100);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        "p-4 rounded-xl border-2 transition-all",
        getCategoryColor(hypothesis.category)
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={cn(
          "shrink-0 p-2 rounded-lg",
          getCategoryColor(hypothesis.category)
        )}>
          {getCategoryIcon(hypothesis.category)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-foreground">
              {hypothesis.cause_name}
            </h4>
            <Badge variant="outline" className={cn(
              "shrink-0 ml-2",
              confidencePercent >= 60 ? "border-primary text-primary" :
              confidencePercent >= 40 ? "border-warning text-warning" :
              "border-muted-foreground text-muted-foreground"
            )}>
              {confidencePercent}%
            </Badge>
          </div>
          {hypothesis.explanation && (
            <p className="text-sm text-muted-foreground mt-1">
              {hypothesis.explanation}
            </p>
          )}
        </div>
      </div>
      
      {/* Evidence */}
      {hypothesis.supporting_evidence.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            ✓ {labels.supporting}:
          </p>
          <p className="text-sm text-foreground">
            {hypothesis.supporting_evidence.join(', ')}
          </p>
        </div>
      )}
      
      {hypothesis.confirming_evidence.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            📌 {labels.toConfirm}:
          </p>
          <p className="text-sm text-foreground">
            {hypothesis.confirming_evidence.join(', ')}
          </p>
        </div>
      )}
      
      {hypothesis.ruling_out_evidence.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            ❌ {labels.toRuleOut}:
          </p>
          <p className="text-sm text-foreground">
            {hypothesis.ruling_out_evidence.join(', ')}
          </p>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function DiagnosticEscalationUI({
  escalationData,
  language,
  onTakePhoto,
  onSelectOption,
  isLoading = false
}: DiagnosticEscalationUIProps) {
  const labels = getLabels(language);
  const { hypotheses, required_inputs, current_confidence, threshold_for_treatment, interim_monitoring } = escalationData;
  
  const photoInput = required_inputs.find(i => i.type === 'PHOTO');
  const otherInputs = required_inputs.filter(i => i.type !== 'PHOTO');
  
  const confidenceNote = labels.confidenceNote
    .replace('{current}', String(Math.round(current_confidence * 100)))
    .replace('{threshold}', String(Math.round(threshold_for_treatment * 100)));
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full space-y-4"
    >
      {/* Hypotheses Section */}
      {hypotheses.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">
              {labels.possibleCauses}
            </h3>
          </div>
          
          <div className="space-y-3">
            {hypotheses.map((hypothesis, index) => (
              <HypothesisCard
                key={hypothesis.cause_code}
                hypothesis={hypothesis}
                index={index}
                labels={labels}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Confidence Note */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
        <Info className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground">
          {confidenceNote}
        </p>
      </div>
      
      {/* Required Inputs Section */}
      {required_inputs.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileQuestion className="h-5 w-5 text-primary" />
              {labels.needMoreInfo}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Photo CTA - Primary Action */}
            {photoInput && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <Button
                  onClick={onTakePhoto}
                  disabled={isLoading}
                  size="lg"
                  className={cn(
                    "w-full h-16 text-lg font-semibold rounded-2xl gap-3",
                    "bg-gradient-to-r from-primary to-primary/80",
                    "hover:from-primary/90 hover:to-primary/70",
                    "shadow-lg shadow-primary/30",
                    "disabled:opacity-50"
                  )}
                >
                  <Camera className="h-6 w-6" />
                  {labels.takePhoto}
                  <ChevronRight className="h-5 w-5" />
                </Button>
                
                {/* Photo guidance */}
                {photoInput.photo_guidance && (
                  <div className="p-3 rounded-lg bg-background/50 border border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      💡 {labels.photoTip}:
                    </p>
                    <p className="text-sm text-foreground">
                      {photoInput.photo_guidance.what_to_capture} - {photoInput.photo_guidance.angle}, {photoInput.photo_guidance.lighting}
                    </p>
                  </div>
                )}
              </motion.div>
            )}
            
            {/* Other inputs */}
            {otherInputs.map((input, index) => (
              <motion.div
                key={input.type}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * (index + 1) }}
                className="p-3 rounded-lg bg-background/50 border border-border"
              >
                <p className="text-sm font-medium text-foreground mb-1">
                  {input.type === 'SEVERITY' ? '📊' : '🗺️'} {input.target}
                </p>
                <p className="text-xs text-muted-foreground">
                  {input.rationale}
                </p>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      )}
      
      {/* Interim Monitoring */}
      {interim_monitoring && interim_monitoring.length > 0 && (
        <div className="p-3 rounded-lg bg-muted/30 border border-border">
          <p className="text-sm font-medium text-foreground mb-2">
            ⏳ {labels.interimAdvice}
          </p>
          <ul className="space-y-1">
            {interim_monitoring.map((advice, index) => (
              <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-primary">•</span>
                {advice}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

export default DiagnosticEscalationUI;
