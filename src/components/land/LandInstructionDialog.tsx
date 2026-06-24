import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  MousePointer, 
  Footprints, 
  Square, 
  Save,
  Volume2,
  VolumeX,
  ArrowRight
} from 'lucide-react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useLanguageStore } from '@/stores/languageStore';

interface LandInstructionDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: () => void;
}

export function LandInstructionDialog({ open, onClose, onStart }: LandInstructionDialogProps) {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguageStore();
  const [currentStep, setCurrentStep] = useState(0);
  const [isReading, setIsReading] = useState(false);

  const getLanguageCode = () => {
    const langMap: Record<string, string> = {
      'en': 'en-US',
      'hi': 'hi-IN',
      'mr': 'mr-IN',
      'pa': 'pa-IN',
      'ta': 'ta-IN'
    };
    return langMap[currentLanguage] || 'en-US';
  };

  const { speak, stop, isSpeaking } = useTextToSpeech({
    language: getLanguageCode(),
    rate: 0.9,
    pitch: 1.0
  });

  const instructions = [
    {
      icon: MapPin,
      title: t('lands.add_land.steps.step_1.title'),
      description: t('lands.add_land.steps.step_1.description'),
      speech: t('lands.add_land.steps.step_1.description')
    },
    {
      icon: MousePointer,
      title: t('lands.add_land.steps.step_2.title'),
      description: t('lands.add_land.steps.step_2.description'),
      speech: t('lands.add_land.steps.step_2.description')
    },
    {
      icon: Footprints,
      title: t('lands.add_land.steps.step_3.title'),
      description: t('lands.add_land.steps.step_3.description'),
      speech: t('lands.add_land.steps.step_3.description')
    },
    {
      icon: Square,
      title: t('lands.add_land.steps.step_4.title'),
      description: t('lands.add_land.steps.step_4.description'),
      speech: t('lands.add_land.steps.step_4.description')
    },
    {
      icon: Save,
      title: t('lands.add_land.steps.step_5.title'),
      description: t('lands.add_land.steps.step_5.description'),
      speech: t('lands.add_land.steps.step_5.description')
    }
  ];

  const handleReadInstructions = () => {
    if (isSpeaking) {
      stop();
      setIsReading(false);
    } else {
      setIsReading(true);
      const fullText = instructions.map(inst => inst.speech).join(' ');
      speak(fullText);
    }
  };

  const handleNextStep = () => {
    if (currentStep < instructions.length - 1) {
      setCurrentStep(currentStep + 1);
      speak(instructions[currentStep + 1].speech);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      speak(instructions[currentStep - 1].speech);
    }
  };

  useEffect(() => {
    if (open && currentStep === 0) {
      // Auto-read first instruction when dialog opens
      setTimeout(() => {
        speak(instructions[0].speech);
      }, 500);
    }
    return () => {
      stop();
    };
  }, [open]);

  const CurrentIcon = instructions[currentStep].icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            {t('lands.add_land.instructions_title')}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleReadInstructions}
              className="h-8 w-8"
            >
              {isSpeaking ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </DialogTitle>
          <DialogDescription>
            {t('lands.add_land.instructions_subtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress indicator */}
          <div className="flex justify-between mb-6">
            {instructions.map((_, index) => (
              <div
                key={index}
                className={`h-2 flex-1 mx-1 rounded-full transition-colors ${
                  index <= currentStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Current instruction */}
          <div className="text-center py-6">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-primary/10">
                <CurrentIcon className="h-12 w-12 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {instructions[currentStep].title}
            </h3>
            <p className="text-muted-foreground">
              {instructions[currentStep].description}
            </p>
          </div>

          {/* Navigation */}
          <div className="flex justify-between gap-2">
            <Button
              variant="outline"
              onClick={handlePrevStep}
              disabled={currentStep === 0}
              className="flex-1"
            >
              {t('lands.wizard.buttons.previous')}
            </Button>
            {currentStep === instructions.length - 1 ? (
              <Button
                onClick={() => {
                  stop();
                  onStart();
                }}
                className="flex-1"
              >
                {t('lands.add_land.buttons.start_mapping')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleNextStep}
                className="flex-1"
              >
                {t('lands.wizard.buttons.next')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Quick start option */}
          <div className="text-center pt-2">
            <Button
              variant="link"
              onClick={() => {
                stop();
                onStart();
              }}
              className="text-sm"
            >
              {t('lands.add_land.buttons.skip_instructions')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}