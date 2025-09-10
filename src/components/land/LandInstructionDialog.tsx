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
      title: 'Step 1: Map will open',
      description: 'A full-screen map will open showing your current location. Wait for the map to load completely.',
      speech: 'Step 1. A full-screen map will open showing your current location. Wait for the map to load completely.'
    },
    {
      icon: MousePointer,
      title: 'Step 2: Draw boundary',
      description: 'Click on the map to mark boundary points of your land. Each click adds a corner point.',
      speech: 'Step 2. Click on the map to mark boundary points of your land. Each click adds a corner point.'
    },
    {
      icon: Footprints,
      title: 'Step 3: Walk mode (Optional)',
      description: 'You can also walk around your land boundary and track your position using GPS.',
      speech: 'Step 3. Optional. You can also walk around your land boundary and track your position using GPS.'
    },
    {
      icon: Square,
      title: 'Step 4: Complete boundary',
      description: 'Connect all points to form a closed boundary. The area will be calculated automatically.',
      speech: 'Step 4. Connect all points to form a closed boundary. The area will be calculated automatically.'
    },
    {
      icon: Save,
      title: 'Step 5: Save and add details',
      description: 'Click "Save Boundary" button. A form will open to add land details like crop information.',
      speech: 'Step 5. Click Save Boundary button. A form will open to add land details like crop information.'
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
            Add New Land - Instructions
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
            Follow these simple steps to add your land
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
              Previous
            </Button>
            {currentStep === instructions.length - 1 ? (
              <Button
                onClick={() => {
                  stop();
                  onStart();
                }}
                className="flex-1"
              >
                Start Mapping
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleNextStep}
                className="flex-1"
              >
                Next
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
              Skip instructions and start now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}