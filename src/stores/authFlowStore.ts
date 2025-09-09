import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AuthFlowStep = 'splash' | 'language' | 'mobile' | 'pin' | 'setpin' | 'dashboard';

interface AuthFlowState {
  currentStep: AuthFlowStep;
  hasCompletedSplash: boolean;
  hasSelectedLanguage: boolean;
  
  // Actions
  setStep: (step: AuthFlowStep) => void;
  markSplashCompleted: () => void;
  markLanguageSelected: () => void;
  resetFlow: () => void;
}

export const useAuthFlowStore = create<AuthFlowState>()(
  persist(
    (set) => ({
      currentStep: 'splash',
      hasCompletedSplash: false,
      hasSelectedLanguage: false,

      setStep: (step) => set({ currentStep: step }),
      
      markSplashCompleted: () => set({ hasCompletedSplash: true }),
      
      markLanguageSelected: () => set({ hasSelectedLanguage: true }),
      
      resetFlow: () => set({
        currentStep: 'splash',
        hasCompletedSplash: false,
        hasSelectedLanguage: false,
      }),
    }),
    {
      name: 'auth-flow-storage',
    }
  )
);