import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

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

    // Map steps to progress percentages
    const stepProgress: Record<string, number> = {
      'Initializing...': 10,
      'Loading configuration...': 30,
      'Checking authentication...': 60,
      'Setting up...': 80,
      'Almost ready...': 95,
    };

    const targetProgress = stepProgress[currentStep || 'Initializing...'] || 10;
    
    // Smooth progress animation
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= targetProgress) return prev;
        return Math.min(prev + 2, targetProgress);
      });
    }, 50);

    setDisplayStep(currentStep || 'Initializing...');

    return () => clearInterval(interval);
  }, [isLoading, currentStep]);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-6 space-y-6">
        {/* App branding */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Loading...</h2>
          <p className="text-sm text-muted-foreground">{displayStep}</p>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-center text-muted-foreground">
            {progress}% complete
          </p>
        </div>
      </div>
    </div>
  );
}
