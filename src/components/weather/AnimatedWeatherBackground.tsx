import React from 'react';
import { cn } from '@/lib/utils';

interface AnimatedWeatherBackgroundProps {
  condition: string;
  className?: string;
  children?: React.ReactNode;
}

export const AnimatedWeatherBackground: React.FC<AnimatedWeatherBackgroundProps> = ({
  condition,
  className,
  children
}) => {
  const getWeatherAnimation = () => {
    const weatherCondition = (condition || 'clear').toLowerCase();
    
    if (weatherCondition.includes('rain') || weatherCondition.includes('drizzle')) {
      return 'rain-animation';
    }
    if (weatherCondition.includes('snow') || weatherCondition.includes('flurr')) {
      return 'snow-animation';
    }
    if (weatherCondition.includes('cloud')) {
      return 'cloud-animation';
    }
    if (weatherCondition.includes('thunder') || weatherCondition.includes('storm')) {
      return 'storm-animation';
    }
    if (weatherCondition.includes('fog') || weatherCondition.includes('mist')) {
      return 'fog-animation';
    }
    if (weatherCondition.includes('clear') || weatherCondition.includes('sun')) {
      return 'sunny-animation';
    }
    return 'default-animation';
  };

  const animationClass = getWeatherAnimation();

  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br from-background to-muted', className)}>
      <div className={`absolute inset-0 ${animationClass} pointer-events-none`}>
        {/* Rain Animation */}
        {animationClass === 'rain-animation' && (
          <div className="rain-container">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="rain-drop"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${0.5 + Math.random() * 0.5}s`
                }}
              />
            ))}
          </div>
        )}

        {/* Snow Animation */}
        {animationClass === 'snow-animation' && (
          <div className="snow-container">
            {[...Array(30)].map((_, i) => (
              <div
                key={i}
                className="snowflake"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 10}s`,
                  animationDuration: `${5 + Math.random() * 10}s`
                }}
              >
                ❅
              </div>
            ))}
          </div>
        )}

        {/* Cloud Animation */}
        {animationClass === 'cloud-animation' && (
          <div className="cloud-container">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="cloud"
                style={{
                  top: `${20 + i * 25}%`,
                  animationDelay: `${i * 3}s`,
                  animationDuration: `${20 + i * 5}s`
                }}
              />
            ))}
          </div>
        )}

        {/* Storm Animation */}
        {animationClass === 'storm-animation' && (
          <>
            <div className="storm-container">
              {[...Array(30)].map((_, i) => (
                <div
                  key={i}
                  className="rain-drop storm-rain"
                  style={{
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 1}s`,
                    animationDuration: `${0.3 + Math.random() * 0.3}s`
                  }}
                />
              ))}
            </div>
            <div className="lightning" />
          </>
        )}

        {/* Fog Animation */}
        {animationClass === 'fog-animation' && (
          <div className="fog-container">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="fog-layer"
                style={{
                  animationDelay: `${i * 2}s`,
                  opacity: 0.3 + i * 0.1
                }}
              />
            ))}
          </div>
        )}

        {/* Sunny Animation */}
        {animationClass === 'sunny-animation' && (
          <div className="sun-container">
            <div className="sun" />
            <div className="sun-rays" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>

      <style>{`
        .rain-drop {
          position: absolute;
          width: 2px;
          height: 20px;
          background: linear-gradient(transparent, hsl(var(--primary) / 0.6));
          animation: rain-fall linear infinite;
        }

        .storm-rain {
          background: linear-gradient(transparent, hsl(var(--primary) / 0.8));
          height: 25px;
        }

        @keyframes rain-fall {
          to {
            transform: translateY(100vh);
          }
        }

        .snowflake {
          position: absolute;
          color: hsl(var(--foreground) / 0.8);
          font-size: 1.5rem;
          animation: snow-fall linear infinite;
          filter: drop-shadow(0 0 2px hsl(var(--background)));
        }

        @keyframes snow-fall {
          0% {
            transform: translateY(-100px) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }

        .cloud {
          position: absolute;
          width: 100px;
          height: 40px;
          background: radial-gradient(ellipse at center, hsl(var(--muted) / 0.4), transparent);
          border-radius: 50%;
          animation: cloud-drift linear infinite;
        }

        @keyframes cloud-drift {
          from {
            transform: translateX(-100px);
          }
          to {
            transform: translateX(calc(100vw + 100px));
          }
        }

        .lightning {
          position: absolute;
          width: 100%;
          height: 100%;
          animation: lightning-flash 4s infinite;
          pointer-events: none;
        }

        @keyframes lightning-flash {
          0%, 90%, 100% {
            background: transparent;
          }
          91% {
            background: hsl(var(--foreground) / 0.2);
          }
          92% {
            background: transparent;
          }
          93% {
            background: hsl(var(--foreground) / 0.1);
          }
        }

        .fog-layer {
          position: absolute;
          width: 200%;
          height: 100%;
          background: linear-gradient(90deg, transparent, hsl(var(--muted) / 0.3), transparent);
          animation: fog-drift 20s ease-in-out infinite;
        }

        @keyframes fog-drift {
          0%, 100% {
            transform: translateX(-50%);
          }
          50% {
            transform: translateX(0);
          }
        }

        .sun {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 60px;
          height: 60px;
          background: radial-gradient(circle, hsl(var(--weather-sunny) / 0.8), hsl(var(--weather-sunny) / 0.6));
          border-radius: 50%;
          animation: sun-pulse 4s ease-in-out infinite;
        }

        .sun-rays {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 60px;
          height: 60px;
          background: conic-gradient(from 0deg, transparent, hsl(var(--weather-sunny) / 0.2), transparent);
          animation: sun-rotate 20s linear infinite;
        }

        @keyframes sun-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 20px hsl(var(--weather-sunny) / 0.5);
          }
          50% {
            transform: scale(1.1);
            box-shadow: 0 0 30px hsl(var(--weather-sunny) / 0.7);
          }
        }

        @keyframes sun-rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};