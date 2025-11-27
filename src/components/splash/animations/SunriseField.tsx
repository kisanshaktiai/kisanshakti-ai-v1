import { motion } from 'framer-motion';

export const SunriseField = () => {
  return (
    <div className="relative w-48 h-48 mx-auto overflow-hidden rounded-2xl">
      {/* Sky Gradient - Dawn to Day */}
      <motion.div 
        className="absolute inset-0"
        initial={{ 
          background: 'linear-gradient(180deg, hsl(240 30% 20%), hsl(280 40% 30%))'
        }}
        animate={{ 
          background: [
            'linear-gradient(180deg, hsl(240 30% 20%), hsl(280 40% 30%))',
            'linear-gradient(180deg, hsl(15 80% 55%), hsl(45 90% 70%))',
            'linear-gradient(180deg, hsl(210 100% 70%), hsl(200 80% 85%))'
          ]
        }}
        transition={{ duration: 3, times: [0, 0.5, 1] }}
      />
      
      {/* Sun Rising */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{ 
          width: '60px',
          height: '60px',
        }}
        initial={{ 
          bottom: '-30px',
          background: 'radial-gradient(circle, hsl(15 100% 60%), hsl(30 100% 50%))'
        }}
        animate={{ 
          bottom: '100px',
          background: 'radial-gradient(circle, hsl(45 100% 65%), hsl(38 95% 58%))'
        }}
        transition={{ duration: 2.5, ease: "easeOut" }}
      >
        {/* Sun Rays */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 rounded-full origin-bottom"
            style={{ 
              height: '45px',
              background: 'linear-gradient(180deg, hsl(45 100% 60% / 0.8), transparent)',
              transform: `rotate(${i * 45}deg) translateY(-30px)`
            }}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: [0, 1.2, 1], opacity: [0, 1, 0.8] }}
            transition={{ 
              delay: 1 + i * 0.1,
              duration: 0.8,
              ease: "easeOut"
            }}
          />
        ))}
        
        {/* Sun Glow */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ 
            background: 'radial-gradient(circle, hsl(45 100% 70% / 0.6), transparent 70%)',
            filter: 'blur(10px)'
          }}
          animate={{ scale: [1, 1.3, 1.1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </motion.div>
      
      {/* Distant Mountains */}
      <motion.div
        className="absolute bottom-20 w-full h-24"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 1 }}
      >
        <svg viewBox="0 0 200 100" className="w-full h-full">
          <motion.path
            d="M0,80 L50,40 L80,55 L120,25 L150,45 L200,35 L200,100 L0,100 Z"
            fill="hsl(240 30% 30% / 0.6)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ delay: 0.5, duration: 1 }}
          />
          <motion.path
            d="M0,90 L40,60 L90,70 L140,50 L200,65 L200,100 L0,100 Z"
            fill="hsl(240 30% 25% / 0.5)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.7, duration: 1 }}
          />
        </svg>
      </motion.div>
      
      {/* Field/Ground */}
      <motion.div 
        className="absolute bottom-0 w-full h-20 rounded-t-xl"
        initial={{ 
          background: 'linear-gradient(180deg, hsl(100 40% 25%), hsl(90 45% 20%))'
        }}
        animate={{ 
          background: 'linear-gradient(180deg, hsl(100 60% 40%), hsl(90 65% 35%))'
        }}
        transition={{ delay: 1.5, duration: 1.5 }}
      />
      
      {/* Crop Silhouettes */}
      {[...Array(7)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute origin-bottom"
          style={{ 
            bottom: '80px',
            left: `${10 + i * 25}px`,
            width: '6px',
          }}
          initial={{ 
            height: `${25 + i * 3}px`,
            opacity: 0.3,
            background: 'hsl(100 30% 20%)'
          }}
          animate={{ 
            opacity: 1,
            background: 'hsl(100 60% 35%)',
            height: [`${25 + i * 3}px`, `${30 + i * 3}px`, `${28 + i * 3}px`]
          }}
          transition={{ 
            delay: 1.5 + i * 0.1,
            duration: 1,
            height: {
              duration: 2,
              repeat: Infinity,
              repeatType: "reverse",
              ease: "easeInOut"
            }
          }}
        >
          {/* Crop top */}
          <motion.div
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
            style={{ background: 'hsl(45 80% 50%)' }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 2 + i * 0.1, duration: 0.3 }}
          />
        </motion.div>
      ))}
      
      {/* Morning Mist */}
      <motion.div
        className="absolute bottom-16 w-full h-12"
        style={{ 
          background: 'linear-gradient(180deg, transparent, hsl(200 50% 90% / 0.5), transparent)'
        }}
        animate={{ 
          x: [-20, 20, -20],
          opacity: [0.3, 0.6, 0.3]
        }}
        transition={{ 
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      
      {/* Birds Flying */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute"
          initial={{ 
            left: '-20px',
            top: `${40 + i * 15}px`
          }}
          animate={{ 
            left: '220px',
            top: `${35 + i * 15}px`
          }}
          transition={{ 
            delay: 2 + i * 0.5,
            duration: 4,
            ease: "linear",
            repeat: Infinity,
            repeatDelay: 3
          }}
        >
          {/* Simple bird shape - V */}
          <svg width="16" height="8" viewBox="0 0 16 8">
            <motion.path
              d="M0,4 L4,2 L8,4"
              stroke="hsl(220 20% 30%)"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              animate={{ d: ["M0,4 L4,2 L8,4", "M0,2 L4,4 L8,2", "M0,4 L4,2 L8,4"] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            />
          </svg>
        </motion.div>
      ))}
    </div>
  );
};
