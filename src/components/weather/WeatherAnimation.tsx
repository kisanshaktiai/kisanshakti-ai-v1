import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface WeatherAnimationProps {
  condition: 'sun' | 'rain' | 'clouds' | 'storm' | 'snow' | 'fog' | 'night';
  className?: string;
}

export const WeatherAnimation: React.FC<WeatherAnimationProps> = ({ condition, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      return () => {
        window.removeEventListener('resize', resizeCanvas);
      };
    }

    let particles: any[] = [];

    // Initialize particles based on weather condition
    const initParticles = () => {
      particles = [];
      const particleCount = condition === 'snow' ? 50 : condition === 'rain' ? 100 : 30;

      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 3 + 1,
          speedX: condition === 'rain' ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 2,
          speedY: condition === 'rain' ? Math.random() * 5 + 5 : condition === 'snow' ? Math.random() * 1 + 0.5 : Math.random() * 0.5 + 0.2,
          opacity: Math.random() * 0.5 + 0.3
        });
      }
    };

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw particles based on condition
      particles.forEach(particle => {
        ctx.save();
        ctx.globalAlpha = particle.opacity;

        switch (condition) {
          case 'rain':
            ctx.strokeStyle = 'hsl(var(--primary) / 0.3)';
            ctx.lineWidth = particle.size * 0.5;
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(particle.x - particle.speedX * 2, particle.y - particle.speedY * 2);
            ctx.stroke();
            break;

          case 'snow':
            ctx.fillStyle = 'hsl(var(--foreground) / 0.5)';
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            break;

          case 'fog':
          case 'clouds':
            ctx.fillStyle = 'hsl(var(--muted) / 0.3)';
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size * 10, 0, Math.PI * 2);
            ctx.fill();
            break;

          case 'sun':
            // Draw sun rays
            ctx.strokeStyle = 'hsl(var(--warning) / 0.2)';
            ctx.lineWidth = 2;
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const angle = (particle.x * Math.PI) / 180;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
              centerX + Math.cos(angle) * 100,
              centerY + Math.sin(angle) * 100
            );
            ctx.stroke();
            break;

          case 'storm':
            // Lightning effect
            if (Math.random() > 0.998) {
              ctx.strokeStyle = 'hsl(var(--primary))';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(particle.x, 0);
              ctx.lineTo(particle.x + Math.random() * 20 - 10, canvas.height);
              ctx.stroke();
            }
            break;
        }

        ctx.restore();

        // Update particle position
        particle.x += particle.speedX;
        particle.y += particle.speedY;

        // Reset particle if it goes off screen
        if (particle.y > canvas.height) {
          particle.y = -10;
          particle.x = Math.random() * canvas.width;
        }
        if (particle.x > canvas.width) {
          particle.x = 0;
        } else if (particle.x < 0) {
          particle.x = canvas.width;
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    initParticles();
    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [condition]);

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        'absolute inset-0 pointer-events-none opacity-50',
        className
      )}
    />
  );
};