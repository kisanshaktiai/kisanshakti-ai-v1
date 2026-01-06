/**
 * ClarificationOptionsUI - Modern 2030-Ready Clarification Selection
 * 
 * World-class UI for selecting options from the Decision Brain.
 * Supports both single-choice (radio) and multi-choice (checkbox) selections.
 * Designed for rural Indian farmers with clear visuals and large touch targets.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { 
  Check, HelpCircle, ChevronRight, 
  Bug, Droplets, Leaf, Wind, Sun,
  MoveHorizontal, ArrowDown, ArrowUp
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ClarificationOption {
  label: string;
  value?: string;
  icon?: string;
  description?: string;
}

type SelectionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';

interface ClarificationOptionsUIProps {
  question: string;
  options: ClarificationOption[];
  selectionType?: SelectionType;
  language: string;
  onSelect: (selectedOptions: string[]) => void;
  isSubmitting?: boolean;
  maxSelections?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICON MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const getOptionIcon = (label: string, index: number) => {
  const labelLower = label.toLowerCase();
  
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
  const numberIcons = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
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
  },
  hi: {
    selectOne: 'एक विकल्प चुनें',
    selectMultiple: 'सभी लागू विकल्प चुनें',
    submit: 'जमा करें',
    selected: 'चयनित',
  },
  mr: {
    selectOne: 'एक पर्याय निवडा',
    selectMultiple: 'सर्व लागू पर्याय निवडा',
    submit: 'पाठवा',
    selected: 'निवडले',
  }
};

const getLabels = (lang: string) => LABELS[lang] || LABELS.en;

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE CHOICE OPTION
// ═══════════════════════════════════════════════════════════════════════════

interface SingleChoiceOptionProps {
  option: ClarificationOption;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

function SingleChoiceOption({ option, index, isSelected, onSelect }: SingleChoiceOptionProps) {
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
        isSelected
          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
          : "border-border/50 bg-card/50 hover:border-primary/50 hover:bg-card"
      )}
    >
      {/* Icon/Number */}
      <div className={cn(
        "shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
        isSelected 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted text-muted-foreground"
      )}>
        {getOptionIcon(option.label, index)}
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
}

function MultiChoiceOption({ option, index, isSelected, onToggle }: MultiChoiceOptionProps) {
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
        {getOptionIcon(option.label, index)}
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
  isSubmitting = false,
  maxSelections = 3
}: ClarificationOptionsUIProps) {
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const labels = getLabels(language);
  
  const handleSingleSelect = (optionLabel: string) => {
    // Immediately submit for single choice
    onSelect([optionLabel]);
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
  
  const handleSubmit = () => {
    if (selectedOptions.size > 0) {
      onSelect(Array.from(selectedOptions));
    }
  };
  
  const isSingleChoice = selectionType === 'SINGLE_CHOICE';
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full space-y-4"
    >
      {/* Question Header */}
      <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-2xl border border-primary/20">
        <div className="shrink-0 p-2 rounded-xl bg-primary/20">
          <HelpCircle className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-foreground leading-relaxed">
            {question}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isSingleChoice ? labels.selectOne : labels.selectMultiple}
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
                onSelect={() => handleSingleSelect(option.label)}
              />
            ) : (
              <MultiChoiceOption
                key={option.label}
                option={option}
                index={index}
                isSelected={selectedOptions.has(option.label)}
                onToggle={() => handleMultiToggle(option.label)}
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
