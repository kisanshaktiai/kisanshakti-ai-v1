import { motion } from 'framer-motion';

export const WaterCrops = () => {
  return (
    <div className="relative w-48 h-48 mx-auto">
      {/* Sky Background */}
      <motion.div 
        className="absolute inset-0 rounded-2xl"
        style={{ background: 'linear-gradient(180deg, hsl(210 80% 75%), hsl(180 60% 85%))' }}
      />
      
      {/* Clouds */}
      {[...Array(2)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute flex gap-1"
          style={{ 
            top: `${20 + i * 15}px`,
            left: `${30 + i * 60}px`
          }}
          animate={{ x: [0, 20, 0] }}
          transition={{ 
            duration: 4 + i,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <div className="w-6 h-4 rounded-full bg-white/70" />
          <div className="w-8 h-5 rounded-full bg-white/70 -ml-3" />
          <div className="w-6 h-4 rounded-full bg-white/70 -ml-3" />
        </motion.div>
      ))}
      
      {/* Ground */}
      <div 
        className="absolute bottom-0 w-full h-20 rounded-t-2xl"
        style={{ background: 'linear-gradient(180deg, hsl(142 50% 40%), hsl(142 60% 35%))' }}
      />
      
      {/* Crop Plants (3 plants getting watered) */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute origin-bottom"
          style={{ 
            bottom: '80px',
            left: `${40 + i * 35}px`
          }}
          initial={{ height: 30, opacity: 0.6 }}
          animate={{ height: [30, 50, 48], opacity: 1 }}
          transition={{ 
            delay: 1.5 + i * 0.2,
            duration: 1.5,
            ease: "easeOut"
          }}
        >
          {/* Stem */}
          <div 
            className="w-1 h-full mx-auto rounded-full"
            style={{ background: 'hsl(100 60% 40%)' }}
          />
          
          {/* Leaves */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2">
            <motion.div 
              className="absolute w-3 h-2 rounded-full"
              style={{ 
                left: '-4px',
                background: 'hsl(142 70% 45%)',
                clipPath: 'ellipse(50% 50% at 0% 50%)'
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 2 + i * 0.2, duration: 0.5 }}
            />
            <motion.div 
              className="absolute w-3 h-2 rounded-full"
              style={{ 
                right: '-4px',
                background: 'hsl(142 70% 45%)',
                clipPath: 'ellipse(50% 50% at 100% 50%)'
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 2.1 + i * 0.2, duration: 0.5 }}
            />
          </div>
          
          {/* Top Flower/Crop Head */}
          <motion.div
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
            style={{ background: 'hsl(45 95% 55%)' }}
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.3, 1] }}
            transition={{ delay: 2.5 + i * 0.2, duration: 0.6 }}
          />
        </motion.div>
      ))}
      
      {/* Watering Can */}
      <motion.div
        className="absolute"
        style={{ 
          right: '30px',
          top: '60px'
        }}
        animate={{ 
          rotate: [0, -15, -10],
          x: [0, -5, 0]
        }}
        transition={{ 
          duration: 2,
          times: [0, 0.3, 1],
          repeat: Infinity,
          repeatDelay: 1
        }}
      >
        {/* Can Body */}
        <div 
          className="w-10 h-8 rounded-lg"
          style={{ background: 'hsl(180 60% 45%)' }}
        />
        
        {/* Handle */}
        <div 
          className="absolute w-8 h-6 border-2 rounded-full"
          style={{ 
            top: '2px',
            right: '-8px',
            borderColor: 'hsl(180 60% 40%)',
            borderLeft: 'none'
          }}
        />
        
        {/* Spout */}
        <div 
          className="absolute w-6 h-2 rounded-r-full"
          style={{ 
            bottom: '6px',
            left: '-6px',
            background: 'hsl(180 60% 40%)'
          }}
        />
      </motion.div>
      
      {/* Water Droplets */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-2 rounded-full"
          style={{
            left: `${60 + (i % 3) * 35}px`,
            background: 'hsl(210 100% 70%)'
          }}
          initial={{ 
            top: '90px',
            opacity: 0
          }}
          animate={{ 
            top: ['90px', '140px'],
            opacity: [0, 1, 1, 0],
            scale: [0.8, 1, 1, 0.6]
          }}
          transition={{ 
            delay: Math.floor(i / 3) * 0.15,
            duration: 1,
            repeat: Infinity,
            repeatDelay: 2,
            ease: "easeIn"
          }}
        />
      ))}
      
      {/* Splash Effects on Ground */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            bottom: '80px',
            left: `${45 + i * 35}px`,
            width: '16px',
            height: '4px',
            background: 'hsl(210 100% 60% / 0.4)'
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [0, 1.5, 0],
            opacity: [0, 0.6, 0]
          }}
          transition={{ 
            delay: 1 + i * 0.15,
            duration: 0.8,
            repeat: Infinity,
            repeatDelay: 2
          }}
        />
      ))}
    </div>
  );
};
