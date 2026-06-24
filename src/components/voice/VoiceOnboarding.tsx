import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Shield, Languages, CheckCircle, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface VoiceOnboardingProps {
  onComplete: (config: {
    language: string;
    privacyMode: 'local' | 'cloud-opt-in';
    telemetryEnabled: boolean;
  }) => void;
  onSkip: () => void;
}

export const VoiceOnboarding: React.FC<VoiceOnboardingProps> = ({
  onComplete,
  onSkip,
}) => {
  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState('en');
  const [privacyMode, setPrivacyMode] = useState<'local' | 'cloud-opt-in'>('local');
  const [telemetryEnabled, setTelemetryEnabled] = useState(true);

  const languages = [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'hi', name: 'Hindi', native: 'हिंदी' },
    { code: 'mr', name: 'Marathi', native: 'मराठी' },
    { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
    { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  ];

  const steps = [
    {
      icon: Mic,
      title: 'Welcome to Voice Assistant',
      description: 'Navigate your farm management app hands-free with voice commands. Say things like "Show my lands" or "Check weather".',
    },
    {
      icon: Languages,
      title: 'Choose Your Language',
      description: 'Select your preferred language for voice commands. You can change this anytime.',
    },
    {
      icon: Shield,
      title: 'Privacy & Permissions',
      description: 'Your privacy matters. Choose how your voice data is processed.',
    },
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete({ language, privacyMode, telemetryEnabled });
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const currentStep = steps[step];
  const Icon = currentStep.icon;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          className="absolute top-4 right-4"
          aria-label="Skip onboarding"
        >
          <X className="h-4 w-4" />
        </Button>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Icon */}
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="h-8 w-8 text-primary" />
              </div>
            </div>

            {/* Content */}
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">
                {currentStep.title}
              </h2>
              <p className="text-muted-foreground">
                {currentStep.description}
              </p>
            </div>

            {/* Step-specific content */}
            {step === 1 && (
              <div className="space-y-4">
                <Label htmlFor="language-select">Voice Command Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="language-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map(lang => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.native} ({lang.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between space-x-2 p-4 rounded-lg bg-muted/50">
                  <div className="space-y-1 flex-1">
                    <Label htmlFor="privacy-mode">Process locally only</Label>
                    <p className="text-sm text-muted-foreground">
                      Voice data stays on your device (recommended)
                    </p>
                  </div>
                  <Switch
                    id="privacy-mode"
                    checked={privacyMode === 'local'}
                    onCheckedChange={(checked) => 
                      setPrivacyMode(checked ? 'local' : 'cloud-opt-in')
                    }
                  />
                </div>

                <div className="flex items-center justify-between space-x-2 p-4 rounded-lg bg-muted/50">
                  <div className="space-y-1 flex-1">
                    <Label htmlFor="telemetry">Anonymous usage data</Label>
                    <p className="text-sm text-muted-foreground">
                      Help improve voice accuracy (no audio stored)
                    </p>
                  </div>
                  <Switch
                    id="telemetry"
                    checked={telemetryEnabled}
                    onCheckedChange={setTelemetryEnabled}
                  />
                </div>

                <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/30 rounded-lg">
                  <p className="font-medium">What we collect:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Voice command latency metrics</li>
                    <li>Intent recognition accuracy</li>
                    <li>Language preferences</li>
                    <li>Feature usage patterns</li>
                  </ul>
                  <p className="mt-2">We never store raw audio or transcripts.</p>
                </div>
              </div>
            )}

            {/* Progress indicators */}
            <div className="flex justify-center gap-2">
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    idx === step
                      ? 'bg-primary'
                      : idx < step
                      ? 'bg-primary/50'
                      : 'bg-muted'
                  }`}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {step > 0 && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  className="flex-1"
                >
                  Back
                </Button>
              )}
              <Button onClick={handleNext} className="flex-1">
                {step === steps.length - 1 ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Get Started
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </Card>
    </div>
  );
};
