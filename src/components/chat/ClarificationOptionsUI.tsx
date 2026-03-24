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
// UTILITY: Clean option labels for farmer-friendly display
// Strips [obs_keys:...] metadata that is meant for backend routing only
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CRITICAL FIX: Remove technical metadata from labels before showing to farmers.
 * Backend embeds [obs_keys:...] for routing but farmers should see clean text.
 * 
 * Example:
 *   Input:  "🐛 वाळवी [obs_keys:ROOT_BLACKENING]"
 *   Output: "🐛 वाळवी"
 */
function cleanOptionLabel(label: string): string {
  if (!label) return '';
  return label
    .replace(/\s*\[obs_keys:[^\]]+\]/gi, '')  // Remove [obs_keys:...]
    .replace(/\s*\[cause:[^\]]+\]/gi, '')      // Remove [cause:...]
    .replace(/\s*\[rule_id:[^\]]+\]/gi, '')    // Remove [rule_id:...]
    .replace(/\s+/g, ' ')                      // Normalize whitespace
    .trim();
}

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
  /** FIX #1: Cause name for confirmed diagnosis bypass */
  cause?: string;
  /** FIX #1: Rule ID for direct rule loading on confirmation */
  rule_id?: string;
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
  
  // Diagnostic confirmation icons (cause indicators) - using semantic color classes
  if (isDiagnostic) {
    // Dead heart / borer indicators
    if (labelLower.includes('सुरळी') || labelLower.includes('dead') || labelLower.includes('heart') || labelLower.includes('whorl')) {
      return <AlertTriangle className="h-5 w-5 text-destructive" />;
    }
    // Larvae / pest indicators
    if (labelLower.includes('अळ') || labelLower.includes('larva') || labelLower.includes('इल्ली') || labelLower.includes('caterpillar')) {
      return <Bug className="h-5 w-5 text-warning" />;
    }
    // Termite / soil indicators
    if (labelLower.includes('वाळवी') || labelLower.includes('दीमक') || labelLower.includes('termite') || labelLower.includes('tunnel') || labelLower.includes('बोगद')) {
      return <Search className="h-5 w-5 text-warning" />;
    }
    // Honeydew / aphid indicators
    if (labelLower.includes('चिकट') || labelLower.includes('sticky') || labelLower.includes('honeydew') || labelLower.includes('काळी')) {
      return <Droplets className="h-5 w-5 text-warning" />;
    }
    // Frass / boring marks
    if (labelLower.includes('भुसा') || labelLower.includes('frass') || labelLower.includes('bore') || labelLower.includes('छिद्र')) {
      return <Zap className="h-5 w-5 text-warning" />;
    }
    // Photo option
    if (labelLower.includes('फोटो') || labelLower.includes('photo') || labelLower.includes('📷')) {
      return <Camera className="h-5 w-5 text-info" />;
    }
  }
  
  // Standard icons for non-diagnostic mode - using semantic colors
  if (labelLower.includes('उड') || labelLower.includes('fly') || labelLower.includes('उडता')) {
    return <Wind className="h-5 w-5 text-muted-foreground" />;
  }
  if (labelLower.includes('चाल') || labelLower.includes('walk') || labelLower.includes('crawl')) {
    return <Bug className="h-5 w-5 text-muted-foreground" />;
  }
  if (labelLower.includes('एक जाग') || labelLower.includes('एका जागी') || labelLower.includes('one place') || labelLower.includes('center')) {
    return <ArrowDown className="h-5 w-5 text-muted-foreground" />;
  }
  if (labelLower.includes('पूर्ण') || labelLower.includes('सर्व') || labelLower.includes('whole') || labelLower.includes('all')) {
    return <MoveHorizontal className="h-5 w-5 text-muted-foreground" />;
  }
  if (labelLower.includes('कडा') || labelLower.includes('edge') || labelLower.includes('border')) {
    return <ArrowUp className="h-5 w-5 text-muted-foreground" />;
  }
  if (labelLower.includes('पिवळ') || labelLower.includes('yellow') || labelLower.includes('पीला')) {
    return <Sun className="h-5 w-5 text-warning" />;
  }
  if (labelLower.includes('हिरव') || labelLower.includes('green') || labelLower.includes('हरा')) {
    return <Leaf className="h-5 w-5 text-success" />;
  }
  if (labelLower.includes('पाणी') || labelLower.includes('water') || labelLower.includes('ओलावा')) {
    return <Droplets className="h-5 w-5 text-info" />;
  }
  
  // Default: numbered badge using theme colors
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-semibold">
      {index + 1}
    </span>
  );
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
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        // Base styles - using theme tokens
        "w-full p-3.5 rounded-xl border transition-all duration-200",
        "flex items-center gap-3 text-left",
        "active:scale-[0.98] touch-manipulation",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        
        // Photo option - uses info color from theme
        isPhotoOption && isDiagnostic
          ? "border-info/40 bg-info/5 hover:border-info/60 hover:bg-info/10"
          : isSelected
            ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20"
            : "border-border bg-card hover:border-primary/40 hover:bg-accent/50",
        
        // Diagnostic mode - larger touch target
        isDiagnostic ? "min-h-[68px]" : "min-h-[56px]"
      )}
    >
      {/* Icon/Number container */}
      <div className={cn(
        "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
        isPhotoOption && isDiagnostic
          ? "bg-info/10 text-info"
          : isSelected 
            ? "bg-primary text-primary-foreground" 
            : "bg-muted text-muted-foreground"
      )}>
        {getOptionIcon(option.label, index, isDiagnostic)}
      </div>
      
      {/* Label container - CRITICAL: Clean metadata before display */}
      <div className="flex-1 min-w-0">
        <span className={cn(
          "text-sm font-medium leading-snug block",
          isPhotoOption && isDiagnostic 
            ? "text-info"
            : isSelected ? "text-primary" : "text-foreground"
        )}>
          {cleanOptionLabel(option.label)}
        </span>
        {option.description && (
          <span className="text-xs text-muted-foreground mt-0.5 block line-clamp-2">
            {cleanOptionLabel(option.description)}
          </span>
        )}
        {/* Diagnostic power indicator - using success color */}
        {isDiagnostic && option.diagnostic_power === 'HIGH' && !isPhotoOption && (
          <span className="text-xs text-success mt-0.5 block font-medium">
            ✓ Strong indicator
          </span>
        )}
      </div>
      
      {/* Radio indicator */}
      <div className={cn(
        "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
        isSelected
          ? "border-primary bg-primary"
          : "border-muted-foreground/30 bg-background"
      )}>
        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
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
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        // Base styles - using theme tokens
        "w-full p-3.5 rounded-xl border transition-all duration-200",
        "flex items-center gap-3 text-left",
        "active:scale-[0.98] touch-manipulation",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isDiagnostic ? "min-h-[68px]" : "min-h-[56px]",
        isSelected
          ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/50"
      )}
    >
      {/* Checkbox container */}
      <div className={cn(
        "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
        isSelected 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted text-muted-foreground"
      )}>
        <Checkbox 
          checked={isSelected} 
          className={cn(
            "h-5 w-5 border-2",
            isSelected && "data-[state=checked]:bg-primary-foreground data-[state=checked]:border-primary-foreground data-[state=checked]:text-primary"
          )}
        />
      </div>
      
      {/* Label container - CRITICAL: Clean metadata before display */}
      <div className="flex-1 min-w-0">
        <span className={cn(
          "text-sm font-medium leading-snug block",
          isSelected ? "text-primary" : "text-foreground"
        )}>
          {cleanOptionLabel(option.label)}
        </span>
        {option.description && (
          <span className="text-xs text-muted-foreground mt-0.5 block line-clamp-2">
            {cleanOptionLabel(option.description)}
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
    
    // Build payload with embedded observation key + cause + rule_id for deterministic backend parsing
    // FIX #1: Embed cause and rule_id so orchestrator can bypass generic re-matching
    const observationKey = option.observation_key || option.value;
    const causeTag = option.cause ? ` [cause:${option.cause}]` : '';
    const ruleIdTag = option.rule_id ? ` [rule_id:${option.rule_id}]` : '';
    const payload = observationKey 
      ? `${option.label} [obs_keys:${observationKey}]${causeTag}${ruleIdTag}`
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
      className="w-full space-y-3"
    >
      {/* Question Header - Using semantic theme tokens */}
      <div className={cn(
        "flex items-start gap-3 p-3.5 rounded-xl border",
        isDiagnostic
          ? "bg-warning/5 border-warning/20"
          : "bg-accent/50 border-border"
      )}>
        <div className={cn(
          "shrink-0 p-2 rounded-lg",
          isDiagnostic 
            ? "bg-warning/10" 
            : "bg-primary/10"
        )}>
          {isDiagnostic 
            ? <Search className="h-4 w-4 text-warning" />
            : <HelpCircle className="h-4 w-4 text-primary" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-medium leading-relaxed",
            isDiagnostic ? "text-warning" : "text-foreground"
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
      
      {/* Submit Button (for multi-select only) - using theme tokens */}
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
              "w-full h-12 font-semibold rounded-xl",
              "bg-primary hover:bg-primary/90",
              "shadow-md shadow-primary/20",
              "disabled:opacity-50"
            )}
          >
            <Check className="h-4 w-4 mr-2" />
            {labels.submit} ({selectedOptions.size} {labels.selected})
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}

export default ClarificationOptionsUI;