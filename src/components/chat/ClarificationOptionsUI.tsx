/**
 * ClarificationOptionsUI - Trust-First Diagnostic Confirmation UI
 * 
 * World-class UI for selecting options from the Decision Brain.
 * Supports both single-choice (radio) and multi-choice (checkbox) selections.
 * 
 * DIAGNOSTIC CONFIRMATION MODE:
 * When terminal damage is detected, renders as a trust-building checklist
 * with farmer-friendly language (no codes), visual icons, and a mandatory
 * photo option at the end.
 * 
 * Designed for rural Indian farmers with clear visuals and large touch targets.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { 
  Check, HelpCircle, ChevronRight, Camera,
  Bug, Droplets, Leaf, Wind, Sun, AlertTriangle,
  MoveHorizontal, ArrowDown, ArrowUp, Search, Zap
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationOption {
  label: string;
  value?: string;
  icon?: string;
  description?: string;
  /** CRITICAL: Observation key for rule engine re-evaluation */
  observation_key?: string;
  diagnostic_power?: 'HIGH' | 'MEDIUM' | 'LOW';
}

type SelectionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';

interface ClarificationOptionsUIProps {
  question: string;
  options: ClarificationOption[];
  selectionType?: SelectionType;
  language: string;
  onSelect: (selectedOptions: string[]) => void;
  /** CRITICAL: Handler for photo option - opens camera instead of sending message */
  onTakePhoto?: () => void;
  isSubmitting?: boolean;
  maxSelections?: number;
  /** Enable trust-first diagnostic confirmation mode */
  isDiagnosticConfirmation?: boolean;
  /** Scope for enhanced styling */
  scope?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICON MAPPING - Enhanced for Diagnostic Confirmation
// ═══════════════════════════════════════════════════════════════════════════

const getOptionIcon = (label: string, index: number, isDiagnostic?: boolean) => {
  const labelLower = label.toLowerCase();
  
  // Diagnostic confirmation icons (cause indicators)
  if (isDiagnostic) {
    // Dead heart / borer indicators
    if (labelLower.includes('सुरळी') || labelLower.includes('dead') || labelLower.includes('heart') || labelLower.includes('whorl')) {
      return <AlertTriangle className="h-5 w-5 text-red-500" />;
    }
    // Larvae / pest indicators
    if (labelLower.includes('अळ') || labelLower.includes('larva') || labelLower.includes('इल्ली') || labelLower.includes('caterpillar')) {
      return <Bug className="h-5 w-5 text-orange-500" />;
    }
    // Termite / soil indicators
    if (labelLower.includes('वाळवी') || labelLower.includes('दीमक') || labelLower.includes('termite') || labelLower.includes('tunnel') || labelLower.includes('बोगद')) {
      return <Search className="h-5 w-5 text-amber-600" />;
    }
    // Honeydew / aphid indicators
    if (labelLower.includes('चिकट') || labelLower.includes('sticky') || labelLower.includes('honeydew') || labelLower.includes('काळी')) {
      return <Droplets className="h-5 w-5 text-amber-500" />;
    }
    // Frass / boring marks
    if (labelLower.includes('भुसा') || labelLower.includes('frass') || labelLower.includes('bore') || labelLower.includes('छिद्र')) {
      return <Zap className="h-5 w-5 text-yellow-600" />;
    }
    // Photo option
    if (labelLower.includes('फोटो') || labelLower.includes('photo') || labelLower.includes('📷')) {
      return <Camera className="h-5 w-5 text-blue-500" />;
    }
  }
  
  // Standard icons for non-diagnostic mode
  // Check for flying/walking patterns
  if (labelLower.includes('उड') || labelLower.includes('fly') || labelLower.includes('उडता')) {
    return <Wind className="h-5 w-5" />;
  }
  if (labelLower.includes('चाल') || labelLower.includes('walk') || labelLower.includes('crawl')) {
    return <Bug className="h-5 w-5" />;
  }
  // Check for distribution patterns
  if (labelLower.includes('एक जाग') || labelLower.includes('एका जागी') || labelLower.includes('one place') || labelLower.includes('center')) {
    return <ArrowDown className="h-5 w-5" />;
  }
  if (labelLower.includes('पूर्ण') || labelLower.includes('सर्व') || labelLower.includes('whole') || labelLower.includes('all')) {
    return <MoveHorizontal className="h-5 w-5" />;
  }
  if (labelLower.includes('कडा') || labelLower.includes('edge') || labelLower.includes('border')) {
    return <ArrowUp className="h-5 w-5" />;
  }
  // Check for color patterns
  if (labelLower.includes('पिवळ') || labelLower.includes('yellow') || labelLower.includes('पीला')) {
    return <Sun className="h-5 w-5 text-yellow-500" />;
  }
  if (labelLower.includes('हिरव') || labelLower.includes('green') || labelLower.includes('हरा')) {
    return <Leaf className="h-5 w-5 text-green-500" />;
  }
  if (labelLower.includes('पाणी') || labelLower.includes('water') || labelLower.includes('ओलावा')) {
    return <Droplets className="h-5 w-5 text-blue-500" />;
  }
  
  // Default numbered icons
  const numberIcons = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
  return <span className="text-lg">{numberIcons[index] || `${index + 1}.`}</span>;
};

// ═══════════════════════════════════════════════════════════════════════════
// TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const LABELS: Record<string, Record<string, string>> = {
  en: {
    selectOne: 'Select one option',
    selectMultiple: 'Select all that apply',
    submit: 'Submit',
    selected: 'Selected',
    diagnosticTitle: 'Help us identify the cause',
    diagnosticHint: 'Select what you observe in your field',
  },
  hi: {
    selectOne: 'एक विकल्प चुनें',
    selectMultiple: 'सभी लागू विकल्प चुनें',
    submit: 'जमा करें',
    selected: 'चयनित',
    diagnosticTitle: 'कारण पहचानने में मदद करें',
    diagnosticHint: 'अपने खेत में जो दिखता है उसे चुनें',
  },
  mr: {
    selectOne: 'एक पर्याय निवडा',
    selectMultiple: 'सर्व लागू पर्याय निवडा',
    submit: 'पाठवा',
    selected: 'निवडले',
    diagnosticTitle: 'कारण ओळखण्यात मदत करा',
    diagnosticHint: 'तुमच्या शेतात जे दिसते ते निवडा',
  }
};

const getLabels = (lang: string) => LABELS[lang] || LABELS.en;

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE CHOICE OPTION - Enhanced for Diagnostic Mode
// ═══════════════════════════════════════════════════════════════════════════

interface SingleChoiceOptionProps {
  option: ClarificationOption;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  isDiagnostic?: boolean;
}

function SingleChoiceOption({ option, index, isSelected, onSelect, isDiagnostic }: SingleChoiceOptionProps) {
  const isPhotoOption = option.label.toLowerCase().includes('फोटो') || 
                        option.label.toLowerCase().includes('photo') ||
                        option.label.includes('📷');
  
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onSelect}
      className={cn(
        "w-full p-4 rounded-2xl border-2 transition-all duration-200",
        "flex items-center gap-4 text-left min-h-[64px]",
        "active:scale-[0.98] touch-manipulation",
        // Photo option special styling
        isPhotoOption && isDiagnostic
          ? "border-blue-300 bg-blue-50 dark:bg-blue-950/30 hover:border-blue-400 hover:bg-blue-100"
          : isSelected
            ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
            : "border-border/50 bg-card/50 hover:border-primary/50 hover:bg-card",
        // Diagnostic mode - slightly larger touch target
        isDiagnostic && "min-h-[72px]"
      )}
    >
      {/* Icon/Number */}
      <div className={cn(
        "shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
        isPhotoOption && isDiagnostic
          ? "bg-blue-100 dark:bg-blue-900 text-blue-600"
          : isSelected 
            ? "bg-primary text-primary-foreground" 
            : "bg-muted text-muted-foreground"
      )}>
        {getOptionIcon(option.label, index, isDiagnostic)}
      </div>
      
      {/* Label */}
      <div className="flex-1 min-w-0">
        <span className={cn(
          "text-base font-medium leading-tight block",
          isPhotoOption && isDiagnostic 
            ? "text-blue-700 dark:text-blue-300"
            : isSelected ? "text-primary" : "text-foreground"
        )}>
          {option.label}
        </span>
        {option.description && (
          <span className="text-xs text-muted-foreground mt-1 block">
            {option.description}
          </span>
        )}
        {/* Diagnostic power indicator */}
        {isDiagnostic && option.diagnostic_power === 'HIGH' && !isPhotoOption && (
          <span className="text-xs text-green-600 dark:text-green-400 mt-1 block font-medium">
            ✓ Strong indicator
          </span>
        )}
      </div>
      
      {/* Check indicator */}
      <div className={cn(
        "shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
        isSelected
          ? "border-primary bg-primary"
          : "border-muted-foreground/30"
      )}>
        {isSelected && <Check className="h-4 w-4 text-primary-foreground" />}
      </div>
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI CHOICE OPTION
// ═══════════════════════════════════════════════════════════════════════════

interface MultiChoiceOptionProps {
  option: ClarificationOption;
  index: number;
  isSelected: boolean;
  onToggle: () => void;
  isDiagnostic?: boolean;
}

function MultiChoiceOption({ option, index, isSelected, onToggle, isDiagnostic }: MultiChoiceOptionProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onToggle}
      className={cn(
        "w-full p-4 rounded-2xl border-2 transition-all duration-200",
        "flex items-center gap-4 text-left min-h-[64px]",
        "active:scale-[0.98] touch-manipulation",
        isSelected
          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
          : "border-border/50 bg-card/50 hover:border-primary/50 hover:bg-card"
      )}
    >
      {/* Checkbox */}
      <div className={cn(
        "shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
        isSelected 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted text-muted-foreground"
      )}>
        <Checkbox 
          checked={isSelected} 
          className={cn(
            "h-6 w-6 border-2",
            isSelected && "bg-primary-foreground border-primary-foreground data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          )}
        />
      </div>
      
      {/* Label */}
      <div className="flex-1 min-w-0">
        <span className={cn(
          "text-base font-medium leading-tight block",
          isSelected ? "text-primary" : "text-foreground"
        )}>
          {option.label}
        </span>
        {option.description && (
          <span className="text-xs text-muted-foreground mt-1 block">
            {option.description}
          </span>
        )}
      </div>
      
      {/* Icon */}
      <div className="shrink-0 text-muted-foreground">
        {getOptionIcon(option.label, index, isDiagnostic)}
      </div>
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ClarificationOptionsUI({
  question,
  options,
  selectionType = 'SINGLE_CHOICE',
  language,
  onSelect,
  onTakePhoto,
  isSubmitting = false,
  maxSelections = 3,
  isDiagnosticConfirmation = false,
  scope
}: ClarificationOptionsUIProps) {
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const labels = getLabels(language);
  
  // Auto-detect diagnostic confirmation mode from scope or question content
  const isDiagnostic = isDiagnosticConfirmation || 
    scope === 'DIAGNOSTIC_CONFIRMATION' ||
    question.includes('🔬') ||
    question.toLowerCase().includes('कारण ओळख') ||
    question.toLowerCase().includes('कारण पहचान');
  
  /**
   * Check if an option is a photo option
   */
  const isPhotoOption = (option: ClarificationOption): boolean => {
    const labelLower = option.label.toLowerCase();
    const keyLower = (option.observation_key || option.value || '').toLowerCase();
    return labelLower.includes('फोटो') || 
           labelLower.includes('photo') ||
           labelLower.includes('📷') ||
           keyLower === 'photo_upload';
  };
  
  /**
   * CRITICAL FIX: Handle option selection
   * - Photo options: trigger camera via onTakePhoto callback
   * - Other options: send observation_key embedded in message for backend detection
   * Format: "Label text [obs_keys:OBSERVATION_KEY1,OBSERVATION_KEY2]"
   */
  const handleSingleSelect = (option: ClarificationOption) => {
    // CRITICAL: Check if this is a photo option - trigger camera instead of sending message
    if (isPhotoOption(option) && onTakePhoto) {
      console.log(`[ClarificationOptionsUI] Photo option selected - opening camera`);
      onTakePhoto();
      return;
    }
    
    // Build payload with embedded observation key for deterministic backend parsing
    const observationKey = option.observation_key || option.value;
    const payload = observationKey 
      ? `${option.label} [obs_keys:${observationKey}]`
      : option.label;
    
    console.log(`[ClarificationOptionsUI] Single select: ${payload}`);
    onSelect([payload]);
  };
  
  const handleMultiToggle = (optionLabel: string) => {
    setSelectedOptions(prev => {
      const next = new Set(prev);
      if (next.has(optionLabel)) {
        next.delete(optionLabel);
      } else if (next.size < maxSelections) {
        next.add(optionLabel);
      }
      return next;
    });
  };
  
  /**
   * CRITICAL FIX: Map selected labels to observation_keys for multi-select
   * Embeds observation keys in the message for deterministic backend parsing
   */
  const handleSubmit = () => {
    if (selectedOptions.size > 0) {
      // Map selected labels to their observation keys
      const payloads = Array.from(selectedOptions).map(label => {
        const option = options.find(opt => opt.label === label);
        const observationKey = option?.observation_key || option?.value;
        return observationKey 
          ? `${label} [obs_keys:${observationKey}]`
          : label;
      });
      console.log(`[ClarificationOptionsUI] Multi select: ${payloads.join(', ')}`);
      onSelect(payloads);
    }
  };
  
  const isSingleChoice = selectionType === 'SINGLE_CHOICE';
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full space-y-4"
    >
      {/* Question Header - Enhanced for Diagnostic Mode */}
      <div className={cn(
        "flex items-start gap-3 p-4 rounded-2xl border",
        isDiagnostic
          ? "bg-gradient-to-br from-amber-50 via-orange-50/50 to-transparent dark:from-amber-950/30 dark:via-orange-950/20 border-amber-200 dark:border-amber-800"
          : "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20"
      )}>
        <div className={cn(
          "shrink-0 p-2 rounded-xl",
          isDiagnostic 
            ? "bg-amber-100 dark:bg-amber-900" 
            : "bg-primary/20"
        )}>
          {isDiagnostic 
            ? <Search className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            : <HelpCircle className="h-5 w-5 text-primary" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-base font-medium leading-relaxed",
            isDiagnostic ? "text-amber-900 dark:text-amber-100" : "text-foreground"
          )}>
            {question}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isDiagnostic 
              ? labels.diagnosticHint 
              : (isSingleChoice ? labels.selectOne : labels.selectMultiple)
            }
          </p>
        </div>
      </div>
      
      {/* Options List */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {options.map((option, index) => (
            isSingleChoice ? (
              <SingleChoiceOption
                key={option.label}
                option={option}
                index={index}
                isSelected={false}
                onSelect={() => handleSingleSelect(option)}
                isDiagnostic={isDiagnostic}
              />
            ) : (
              <MultiChoiceOption
                key={option.label}
                option={option}
                index={index}
                isSelected={selectedOptions.has(option.label)}
                onToggle={() => handleMultiToggle(option.label)}
                isDiagnostic={isDiagnostic}
              />
            )
          ))}
        </AnimatePresence>
      </div>
      
      {/* Submit Button (for multi-select only) */}
      {!isSingleChoice && selectedOptions.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="pt-2"
        >
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            size="lg"
            className={cn(
              "w-full h-14 text-lg font-semibold rounded-2xl",
              "bg-gradient-to-r from-primary to-primary/80",
              "hover:from-primary/90 hover:to-primary/70",
              "shadow-lg shadow-primary/30",
              "disabled:opacity-50"
            )}
          >
            <Check className="h-5 w-5 mr-2" />
            {labels.submit} ({selectedOptions.size} {labels.selected})
            <ChevronRight className="h-5 w-5 ml-2" />
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}

export default ClarificationOptionsUI;