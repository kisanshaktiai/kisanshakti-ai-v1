import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles } from 'lucide-react';

interface AppLoadingProgressProps {
  isLoading: boolean;
  currentStep?: string;
}

export function AppLoadingProgress({ isLoading, currentStep }: AppLoadingProgressProps) {
  const [progress, setProgress] = useState(0);
  const [displayStep, setDisplayStep] = useState('Initializing...');

  useEffect(() => {
    if (!isLoading) {
      setProgress(100);
      return;
    }

    // Map steps to progress percentages with faster progression
    const stepProgress: Record<string, number> = {
      'Initializing...': 15,
      'Preparing your workspace...': 35,
      'Loading configuration...': 50,
      'Verifying credentials...': 70,
      'Checking authentication...': 70,
      'Setting up...': 85,
      'Almost ready...': 95,
    };

    const targetProgress = stepProgress[currentStep || 'Initializing...'] || 15;
    
    // Faster smooth progress animation
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= targetProgress) return prev;
        return Math.min(prev + 3, targetProgress);
      });
    }, 40);

    setDisplayStep(currentStep || 'Initializing...');

    return () => clearInterval(interval);
  }, [isLoading, currentStep]);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background animate-in fade-in duration-200">
      <div className="w-full max-w-md px-6 space-y-6">
        {/* App branding with animation */}
        <div className="text-center space-y-4 animate-in zoom-in-95 fade-in duration-300">
          <div className="flex justify-center relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 bg-primary/20 rounded-full animate-ping" />
            </div>
            <Loader2 className="h-14 w-14 text-primary animate-spin relative z-10" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                KisanShakti AI
              </h2>
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            </div>
            <p 
              key={displayStep}
              className="text-sm text-muted-foreground animate-in slide-in-from-bottom-1 fade-in duration-200"
            >
              {displayStep}
            </p>
          </div>
        </div>

        {/* Enhanced progress bar */}
        <div className="space-y-2 animate-in slide-in-from-bottom-2 fade-in duration-300">
          <div className="relative">
            <Progress value={progress} className="h-2 bg-primary/10" />
            <div
              className="absolute top-0 left-0 h-2 bg-primary/20 rounded-full blur-sm"
              style={{ width: `${progress}%`, transition: 'width 300ms ease' }}
            />
          </div>
          <p className="text-xs text-center text-muted-foreground font-medium">
            {Math.round(progress)}% complete
          </p>
        </div>
      </div>
    </div>
  );
}
