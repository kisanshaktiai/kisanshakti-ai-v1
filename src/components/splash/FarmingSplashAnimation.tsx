import { motion } from 'framer-motion';

/**
 * Farming-themed ambient splash animation.
 * Layers (all behind main content):
 *  - Soft sunrise gradient glow + radiating sun rays
 *  - Rolling hills silhouette at the bottom
 *  - A seedling that sprouts from the soil and unfurls two leaves
 *  - Floating leaf particles drifting upward
 *  - Subtle rain / dew sparkles
 *
 * Pure SVG + framer-motion, no images. Uses semantic theme tokens only
 * (--primary, --accent, --background, --foreground) so it adapts to the
 * tenant's central theme.
 */
export function FarmingSplashAnimation() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Sunrise glow */}
      <motion.div
        className="absolute left-1/2 top-[18%] -translate-x-1/2 rounded-full blur-3xl"
        style={{
          width: 360,
          height: 360,
          background:
            'radial-gradient(circle, hsl(var(--primary) / 0.35) 0%, hsl(var(--accent) / 0.18) 45%, transparent 70%)',
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
      />

      {/* Sun rays */}
      <svg
        className="absolute left-1/2 top-[18%] -translate-x-1/2 -translate-y-1/2"
        width="320"
        height="320"
        viewBox="-50 -50 100 100"
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.line
            key={i}
            x1="0"
            y1="-18"
            x2="0"
            y2="-32"
            stroke="hsl(var(--primary))"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.5"
            transform={`rotate(${i * 30})`}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.5 }}
            transition={{ delay: 0.2 + i * 0.05, duration: 0.6 }}
          />
        ))}
      </svg>

      {/* Hills silhouette */}
      <svg
        className="absolute bottom-0 left-0 w-full"
        viewBox="0 0 400 120"
        preserveAspectRatio="none"
        style={{ height: 140 }}
      >
        <motion.path
          d="M0,90 C60,60 120,110 180,80 C240,50 300,100 360,70 L400,80 L400,120 L0,120 Z"
          fill="hsl(var(--primary) / 0.18)"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        <motion.path
          d="M0,105 C80,85 160,120 240,95 C300,78 350,110 400,100 L400,120 L0,120 Z"
          fill="hsl(var(--primary) / 0.32)"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.9, ease: 'easeOut' }}
        />
      </svg>

      {/* Sprouting seedling (centered, just above the hills) */}
      <svg
        className="absolute left-1/2 bottom-[60px] -translate-x-1/2"
        width="120"
        height="140"
        viewBox="0 0 120 140"
      >
        {/* Soil mound */}
        <motion.ellipse
          cx="60"
          cy="128"
          rx="34"
          ry="6"
          fill="hsl(var(--foreground) / 0.25)"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          style={{ transformOrigin: '60px 128px' }}
          transition={{ delay: 0.4, duration: 0.5 }}
        />
        {/* Stem */}
        <motion.path
          d="M60,128 Q60,100 60,72"
          stroke="hsl(var(--primary))"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.7, duration: 1.1, ease: 'easeOut' }}
        />
        {/* Left leaf */}
        <motion.path
          d="M60,92 Q40,82 30,92 Q42,98 60,96 Z"
          fill="hsl(var(--primary))"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ transformOrigin: '60px 94px' }}
          transition={{ delay: 1.4, type: 'spring', stiffness: 180, damping: 12 }}
        />
        {/* Right leaf */}
        <motion.path
          d="M60,82 Q80,72 90,82 Q78,88 60,86 Z"
          fill="hsl(var(--accent, var(--primary)))"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ transformOrigin: '60px 84px' }}
          transition={{ delay: 1.6, type: 'spring', stiffness: 180, damping: 12 }}
        />
        {/* Top bud */}
        <motion.circle
          cx="60"
          cy="72"
          r="3"
          fill="hsl(var(--primary))"
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.3, 1] }}
          transition={{ delay: 1.8, duration: 0.6 }}
        />
      </svg>

      {/* Floating leaves */}
      {Array.from({ length: 6 }).map((_, i) => (
        <motion.div
          key={`leaf-${i}`}
          className="absolute"
          style={{
            left: `${10 + i * 14}%`,
            bottom: 100,
            width: 10,
            height: 14,
          }}
          initial={{ y: 0, opacity: 0, rotate: 0 }}
          animate={{
            y: [-20, -180 - i * 20],
            x: [0, i % 2 === 0 ? 20 : -20, 0],
            opacity: [0, 0.8, 0],
            rotate: [0, 180, 360],
          }}
          transition={{
            delay: 1 + i * 0.25,
            duration: 4 + i * 0.4,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        >
          <svg viewBox="0 0 10 14" className="w-full h-full">
            <path
              d="M5,0 Q9,4 5,14 Q1,4 5,0 Z"
              fill="hsl(var(--primary) / 0.6)"
            />
          </svg>
        </motion.div>
      ))}

      {/* Dew sparkles */}
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={`spark-${i}`}
          className="absolute rounded-full"
          style={{
            left: `${(i * 13 + 5) % 95}%`,
            top: `${20 + (i * 9) % 50}%`,
            width: 3,
            height: 3,
            background: 'hsl(var(--primary))',
            boxShadow: '0 0 8px hsl(var(--primary) / 0.7)',
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0] }}
          transition={{
            delay: 0.5 + i * 0.3,
            duration: 2.4,
            repeat: Infinity,
            repeatDelay: i * 0.4,
          }}
        />
      ))}
    </div>
  );
}

export default FarmingSplashAnimation;
