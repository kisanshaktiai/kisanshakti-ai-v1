import { useEffect, useState } from 'react';
import { SeedSprout } from './animations/SeedSprout';
import { TractorField } from './animations/TractorField';
import { WaterCrops } from './animations/WaterCrops';
import { SunriseField } from './animations/SunriseField';
import { HarvestWheat } from './animations/HarvestWheat';

interface SplashScreenConfig {
  enabled?: boolean;
  active_animations?: number[];
  rotation_mode?: 'sequential' | 'random';
  animation_duration?: number;
}

interface AgriSplashAnimationProps {
  splashConfig?: SplashScreenConfig;
}

const ANIMATIONS = [
  { id: 1, component: SeedSprout, name: 'Seed to Sprout' },
  { id: 2, component: TractorField, name: 'Tractor Plowing' },
  { id: 3, component: WaterCrops, name: 'Irrigation' },
  { id: 4, component: SunriseField, name: 'Sunrise over Fields' },
  { id: 5, component: HarvestWheat, name: 'Harvest Season' },
];

const STORAGE_KEY = 'agri_splash_last_animation';

export const AgriSplashAnimation = ({ splashConfig }: AgriSplashAnimationProps) => {
  const [currentAnimationIndex, setCurrentAnimationIndex] = useState<number>(0);

  useEffect(() => {
    // Determine which animations to show based on tenant config
    const activeAnimationIds = splashConfig?.active_animations || [1, 2, 3, 4, 5];
    const availableAnimations = ANIMATIONS.filter(anim => 
      activeAnimationIds.includes(anim.id)
    );

    if (availableAnimations.length === 0) {
      setCurrentAnimationIndex(0);
      return;
    }

    const rotationMode = splashConfig?.rotation_mode || 'sequential';

    if (rotationMode === 'random') {
      // Random mode
      const randomIndex = Math.floor(Math.random() * availableAnimations.length);
      const animationIndex = ANIMATIONS.findIndex(
        anim => anim.id === availableAnimations[randomIndex].id
      );
      setCurrentAnimationIndex(animationIndex);
      console.log(`🎨 [AgriSplash] Random animation selected: ${ANIMATIONS[animationIndex].name}`);
    } else {
      // Sequential mode - rotate through animations
      const lastAnimationId = localStorage.getItem(STORAGE_KEY);
      let nextIndex = 0;

      if (lastAnimationId) {
        const lastIndex = availableAnimations.findIndex(
          anim => anim.id === parseInt(lastAnimationId)
        );
        
        if (lastIndex !== -1) {
          // Get next animation in sequence
          nextIndex = (lastIndex + 1) % availableAnimations.length;
        }
      }

      const selectedAnimation = availableAnimations[nextIndex];
      const animationIndex = ANIMATIONS.findIndex(
        anim => anim.id === selectedAnimation.id
      );
      
      setCurrentAnimationIndex(animationIndex);
      localStorage.setItem(STORAGE_KEY, selectedAnimation.id.toString());
      
      console.log(`🎨 [AgriSplash] Sequential animation ${nextIndex + 1}/${availableAnimations.length}: ${selectedAnimation.name}`);
    }
  }, [splashConfig]);

  const CurrentAnimation = ANIMATIONS[currentAnimationIndex]?.component || SeedSprout;

  return (
    <div className="relative">
      <CurrentAnimation />
      
      {/* Animation indicator dots */}
      <div className="flex justify-center gap-1.5 mt-4">
        {ANIMATIONS.map((anim, index) => {
          const isActive = splashConfig?.active_animations 
            ? splashConfig.active_animations.includes(anim.id)
            : true;
          
          if (!isActive) return null;
          
          return (
            <div
              key={anim.id}
              className={`h-1 rounded-full transition-all duration-300 ${
                index === currentAnimationIndex
                  ? 'w-6 bg-primary'
                  : 'w-1 bg-muted-foreground/30'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};
