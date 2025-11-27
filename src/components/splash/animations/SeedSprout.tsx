import { motion } from 'framer-motion';

export const SeedSprout = () => {
  return (
    <div className="relative w-48 h-48 mx-auto">
      {/* Soil Layer */}
      <motion.div 
        className="absolute bottom-0 w-full h-16 rounded-t-2xl"
        style={{ background: 'linear-gradient(180deg, hsl(30 45% 45%), hsl(25 50% 40%))' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      />
      
      {/* Seed */}
      <motion.div 
        className="absolute bottom-12 left-1/2 -translate-x-1/2 w-3 h-5 rounded-full"
        style={{ background: 'hsl(30 60% 50%)' }}
        initial={{ opacity: 1, scale: 1, y: 0 }}
        animate={{ 
          opacity: [1, 1, 0],
          scale: [1, 1, 0.5],
          y: [0, 0, 8]
        }}
        transition={{ duration: 3, times: [0, 0.3, 0.5] }}
      />
      
      {/* Roots Growing */}
      <svg 
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-16"
        viewBox="0 0 100 60"
      >
        <motion.path
          d="M50,10 L50,30 M50,30 L35,45 M50,30 L65,45 M50,30 L42,50 M50,30 L58,50"
          stroke="hsl(30 45% 35%)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: 0.5, duration: 1.5, ease: "easeOut" }}
        />
      </svg>
      
      {/* Stem Growing */}
      <motion.div
        className="absolute bottom-16 left-1/2 -translate-x-1/2 w-1.5 rounded-full origin-bottom"
        style={{ background: 'linear-gradient(180deg, hsl(100 70% 50%), hsl(142 76% 45%))' }}
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 64, opacity: 1 }}
        transition={{ delay: 1, duration: 1.5, ease: "easeOut" }}
      />
      
      {/* Left Leaf */}
      <motion.div
        className="absolute left-1/2 rounded-full origin-right"
        style={{ 
          bottom: '100px',
          marginLeft: '-12px',
          width: '24px',
          height: '16px',
          background: 'hsl(142 76% 45%)',
          clipPath: 'ellipse(50% 50% at 0% 50%)'
        }}
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: -25 }}
        transition={{ delay: 1.8, duration: 0.6, ease: "easeOut" }}
      />
      
      {/* Right Leaf */}
      <motion.div
        className="absolute left-1/2 rounded-full origin-left"
        style={{ 
          bottom: '105px',
          marginLeft: '-12px',
          width: '24px',
          height: '16px',
          background: 'hsl(142 76% 45%)',
          clipPath: 'ellipse(50% 50% at 100% 50%)'
        }}
        initial={{ scale: 0, rotate: 45 }}
        animate={{ scale: 1, rotate: 25 }}
        transition={{ delay: 2, duration: 0.6, ease: "easeOut" }}
      />
      
      {/* Top Leaves */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 w-8 h-8"
        style={{ bottom: '145px' }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ 
          scale: [0, 1.2, 1],
          opacity: 1
        }}
        transition={{ delay: 2.3, duration: 0.8 }}
      >
        <div 
          className="absolute rounded-full"
          style={{ 
            width: '20px',
            height: '14px',
            left: '-10px',
            top: '50%',
            background: 'hsl(142 76% 50%)',
            clipPath: 'ellipse(50% 50% at 0% 50%)',
            transform: 'rotate(-35deg)'
          }}
        />
        <div 
          className="absolute rounded-full"
          style={{ 
            width: '20px',
            height: '14px',
            right: '-10px',
            top: '50%',
            background: 'hsl(142 76% 50%)',
            clipPath: 'ellipse(50% 50% at 100% 50%)',
            transform: 'rotate(35deg)'
          }}
        />
      </motion.div>
      
      {/* Sparkles */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-warning"
          style={{
            left: `${40 + i * 20}%`,
            top: `${30 + i * 15}%`,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [0, 1, 0],
            opacity: [0, 1, 0]
          }}
          transition={{
            delay: 1.5 + i * 0.2,
            duration: 1,
            repeat: Infinity,
            repeatDelay: 2
          }}
        />
      ))}
    </div>
  );
};
