import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TenantBackgroundProps {
  variant?: 'primary' | 'subtle' | 'glass';
  children: React.ReactNode;
  className?: string;
}

/**
 * Unified Tenant-Branded Background Component
 * 
 * Uses CSS variables from tenant theme for consistent branding
 * across all authentication and app screens.
 */
export function TenantBackground({ 
  variant = 'primary', 
  children, 
  className 
}: TenantBackgroundProps) {
  
  const baseClass = "min-h-mobile-screen flex flex-col items-center justify-center p-4 relative overflow-hidden";
  
  const variantClasses = {
    primary: "bg-gradient-to-br from-primary/10 via-background to-accent/10",
    subtle: "bg-gradient-to-br from-muted/30 via-background to-muted/20",
    glass: "bg-background"
  };

  return (
    <div className={cn(baseClass, variantClasses[variant], className)}>
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-primary/5"
            style={{
              width: `${200 + i * 100}px`,
              height: `${200 + i * 100}px`,
              left: `${20 + i * 30}%`,
              top: `${10 + i * 25}%`,
            }}
            animate={{
              y: [0, 30, 0],
              x: [0, 20, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 8 + i * 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
